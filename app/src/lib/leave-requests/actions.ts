"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import {
  evaluateRequest,
  trimToBusinessDays,
  businessDaysInRange,
  type AutoApprovalMode,
  type BlackoutPeriod,
  type DepartmentCoverageContext,
  type PolicyContext,
  type PolicyDecision,
} from "@policy/engine";
import type { LeaveTypeCode, EmploymentType } from "@policy/rules";

export type SubmitLeaveRequestInput = {
  leaveType: LeaveTypeCode;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO yyyy-mm-dd
  reason: string;
};

export type SubmitLeaveRequestResult =
  | {
      ok: true;
      requestId: string;
      status: "approved" | "submitted";
      days: number;
      /**
       * The start/end dates actually written to the row, after trimming
       * off any leading/trailing weekends or KI-observed holidays. May
       * differ from what the user picked; the form surfaces this.
       */
      startDate: string;
      endDate: string;
      flags: { clause: string; message: string }[];
      recommendation: "auto_approve" | "review";
      mode: AutoApprovalMode;
    }
  | {
      ok: false;
      error: string;
      clause?: string;
    };

export type LeaveRequestPreview =
  | {
      ok: true;
      days: number;
      /**
       * Trimmed range the request would be stored as. Null only if the
       * selected span contains no business days (caller should treat as
       * a no-op — the days count above will be 0 in that case).
       */
      trimmedStart: string | null;
      trimmedEnd: string | null;
      blocked: boolean;
      recommendation: "auto_approve" | "review";
      autoApprove: boolean;
      mode: AutoApprovalMode;
      blockingCheck: { clause: string; message: string } | null;
      flags: { id: string; clause: string; message: string }[];
    }
  | {
      ok: false;
      error: string;
    };

export type ApproveLeaveRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

export type DenyLeaveRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

export type CancelLeaveRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

export type OverrideLeaveRequestResult =
  | { ok: true; requestId: string; newStatus: string }
  | { ok: false; error: string };

function fiscalYearForIsoDate(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-indexed
  return m >= 3 ? y : y - 1;
}

// ---------------------------------------------------------------------------
// Shared: build a PolicyContext for an authenticated employee + leave type
// + date range. Used by both submit and the lighter preview action.
// ---------------------------------------------------------------------------

type BuildContextResult =
  | { ok: true; ctx: PolicyContext; leaveTypeId: string; mode: AutoApprovalMode }
  | { ok: false; error: string };

async function buildPolicyContext(
  input: SubmitLeaveRequestInput,
): Promise<BuildContextResult> {
  const me = await getCurrentEmployee();
  if (!me) {
    return { ok: false, error: "You must be signed in." };
  }

  const supabase = await createClient();

  // Fan-out the reads in parallel — none of them depend on each other.
  const [
    leaveTypeRes,
    employeeRes,
    holidayRes,
    blackoutRes,
    settingsRes,
  ] = await Promise.all([
    supabase
      .from("leave_types")
      .select("id, code")
      .eq("code", input.leaveType)
      .eq("is_v1", true)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("id, department, department_id")
      .eq("id", me.id)
      .maybeSingle(),
    supabase
      .from("holidays")
      .select("date")
      .gte("date", input.startDate)
      .lte("date", input.endDate),
    supabase
      .from("blackout_periods")
      .select("id, start_date, end_date, applies_to, reason")
      .lte("start_date", input.endDate)
      .gte("end_date", input.startDate),
    supabase.rpc("get_auto_approval_mode"),
  ]);

  if (!leaveTypeRes.data) {
    return {
      ok: false,
      error: `Unknown or disabled leave type: ${input.leaveType}`,
    };
  }
  const leaveTypeRow = leaveTypeRes.data;

  const fiscalYear = fiscalYearForIsoDate(input.startDate);

  const { data: entitlementRow } = await supabase
    .from("entitlements")
    .select("granted, earned, used, pending")
    .eq("employee_id", me.id)
    .eq("leave_type_id", leaveTypeRow.id)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();

  if (!entitlementRow) {
    return {
      ok: false,
      error: `No ${input.leaveType} entitlement for fiscal year ${fiscalYear}/${String(fiscalYear + 1).slice(-2)}. Contact HR.`,
    };
  }

  const holidays = new Set(
    (holidayRes.data ?? []).map((h: { date: string }) => h.date),
  );

  const blackouts: BlackoutPeriod[] = (blackoutRes.data ?? []).map(
    (b: {
      id: string;
      start_date: string;
      end_date: string;
      applies_to: string | null;
      reason: string | null;
    }) => {
      const appliesTo = b.applies_to ?? "all";
      const scope: "all" | "department" = appliesTo.startsWith("department:")
        ? "department"
        : "all";
      return {
        id: b.id,
        startDate: b.start_date,
        endDate: b.end_date,
        scope,
        appliesTo,
        reason: b.reason,
      };
    },
  );

  // Department coverage context: only when the employee has a
  // department on file. We call SECURITY DEFINER helpers instead of
  // querying the tables directly, so the results don't get poisoned
  // by RLS when a non-approver is submitting. See migration
  // 20260410030000_phase3_rls_coverage_helpers.sql for the rationale.
  let departmentCoverage: DepartmentCoverageContext | undefined;
  const employeeRow = employeeRes.data as
    | { id: string; department: string | null; department_id: string | null }
    | null;

  if (employeeRow?.department_id) {
    const [deptInfoRes, overlapRes] = await Promise.all([
      supabase.rpc("department_info", {
        p_department_id: employeeRow.department_id,
      }),
      supabase.rpc("department_overlapping_leaves", {
        p_department_id: employeeRow.department_id,
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_exclude_employee_id: me.id,
      }),
    ]);

    const deptInfo = (
      Array.isArray(deptInfoRes.data) ? deptInfoRes.data[0] : deptInfoRes.data
    ) as { name: string; headcount: number; min_coverage: number } | null;

    if (deptInfo) {
      const overlapping = (
        (overlapRes.data ?? []) as Array<{
          request_id: string;
          employee_id: string;
          employee_name: string;
          start_date: string;
          end_date: string;
          status: "submitted" | "approved";
        }>
      ).map((r) => ({
        requestId: r.request_id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        startDate: r.start_date,
        endDate: r.end_date,
        status: r.status,
      }));

      departmentCoverage = {
        departmentId: employeeRow.department_id,
        departmentName: deptInfo.name,
        headcount: Number(deptInfo.headcount),
        minCoverage: Number(deptInfo.min_coverage),
        overlapping,
      };
    }
  }

  const mode: AutoApprovalMode =
    (settingsRes.data as AutoApprovalMode | null) ?? "shadow";

  const ctx: PolicyContext = {
    employee: {
      id: me.id,
      hireDate: me.hireDate,
      employmentType: me.employmentType as EmploymentType,
      departmentName: employeeRow?.department ?? null,
    },
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason,
    entitlement: {
      granted: Number(entitlementRow.granted),
      earned: Number(entitlementRow.earned),
      used: Number(entitlementRow.used),
      pending: Number(entitlementRow.pending),
    },
    holidays,
    today: new Date().toISOString().slice(0, 10),
    blackouts,
    departmentCoverage,
    autoApprovalMode: mode,
  };

  return { ok: true, ctx, leaveTypeId: leaveTypeRow.id, mode };
}

// ---------------------------------------------------------------------------
// previewLeaveRequest — read-only engine pass for the New Request form so
// it can show coverage / blackout warnings as the user picks dates.
// ---------------------------------------------------------------------------

export async function previewLeaveRequest(
  input: SubmitLeaveRequestInput,
): Promise<LeaveRequestPreview> {
  // Skip preview if dates aren't set yet — the form will keep using the
  // local day-count fast path until both dates are populated.
  if (!input.startDate || !input.endDate) {
    return { ok: false, error: "Pick a start and end date first." };
  }

  const built = await buildPolicyContext(input);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  const decision: PolicyDecision = evaluateRequest(built.ctx);

  // Preview the trimmed range so the form can tell the user how the
  // request will actually be stored. `decision.days > 0` implies at least
  // one business day exists, which in turn implies trimming succeeds, so
  // the null branch below is only reached when days === 0.
  const trimmed = trimToBusinessDays(
    input.startDate,
    input.endDate,
    built.ctx.holidays,
  );

  return {
    ok: true,
    days: decision.days,
    trimmedStart: trimmed?.trimmedStart ?? null,
    trimmedEnd: trimmed?.trimmedEnd ?? null,
    blocked: decision.blocked,
    recommendation: decision.recommendation,
    autoApprove: decision.autoApprove,
    mode: built.mode,
    blockingCheck: decision.blockingCheck
      ? {
          clause: decision.blockingCheck.clause,
          message: decision.blockingCheck.message ?? "",
        }
      : null,
    flags: decision.checks
      .filter((c) => !c.passed && c.severity === "flag")
      .map((c) => ({ id: c.id, clause: c.clause, message: c.message ?? "" })),
  };
}

// ---------------------------------------------------------------------------
// submitLeaveRequest
// ---------------------------------------------------------------------------

export async function submitLeaveRequest(
  input: SubmitLeaveRequestInput,
): Promise<SubmitLeaveRequestResult> {
  const built = await buildPolicyContext(input);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  // Engine decision is computed from the ORIGINAL span. Rules like the
  // 3-consecutive-week vacation cap need to see the full calendar range
  // the employee will be away, not the trimmed business-day-only range.
  const decision = evaluateRequest(built.ctx);

  if (decision.blocked && decision.blockingCheck) {
    return {
      ok: false,
      error:
        decision.blockingCheck.message ?? "This request cannot be submitted.",
      clause: decision.blockingCheck.clause,
    };
  }

  // Trim leading/trailing weekends and holidays BEFORE writing the row,
  // so the stored start_date / end_date always reference real billable
  // business days. The calendar and "upcoming leave" views render pills
  // directly off start_date..end_date, so trimming here is what prevents
  // a vacation pill from showing on Easter Monday. See trimToBusinessDays
  // in policy/engine.ts for the rationale and edge cases.
  const trimmed = trimToBusinessDays(
    input.startDate,
    input.endDate,
    built.ctx.holidays,
  );
  if (!trimmed) {
    // Unreachable in normal flow — if days > 0 then the trim has at
    // least one business day. Return a sensible error just in case.
    return {
      ok: false,
      error:
        "The selected range contains no business days (weekends and holidays are excluded).",
    };
  }

  const supabase = await createClient();

  // Atomic write via RPC. Note: decision.autoApprove already factors in
  // the auto-approval mode (shadow → false), so the RPC just trusts it
  // and the caller doesn't have to know about modes.
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "submit_leave_request",
    {
      p_leave_type_code: input.leaveType,
      p_start_date: trimmed.trimmedStart,
      p_end_date: trimmed.trimmedEnd,
      p_days: decision.days,
      p_reason: input.reason,
      p_auto_approve: decision.autoApprove,
      p_recommendation: decision.recommendation,
    },
  );

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row) {
    return { ok: false, error: "No response from the server." };
  }

  revalidatePath("/");
  revalidatePath("/requests");
  revalidatePath("/balances");

  const flags = decision.checks
    .filter((c) => !c.passed && c.severity === "flag")
    .map((c) => ({ clause: c.clause, message: c.message ?? "" }));

  return {
    ok: true,
    requestId: row.request_id,
    status: row.status as "approved" | "submitted",
    days: decision.days,
    startDate: trimmed.trimmedStart,
    endDate: trimmed.trimmedEnd,
    flags,
    recommendation: decision.recommendation,
    mode: built.mode,
  };
}

// ---------------------------------------------------------------------------
// approveLeaveRequest / denyLeaveRequest — approver inbox actions
// ---------------------------------------------------------------------------

export async function approveLeaveRequest(
  requestId: string,
  reviewNotes: string | null,
): Promise<ApproveLeaveRequestResult> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, error: "You must be signed in." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_leave_request", {
    p_request_id: requestId,
    p_review_notes: reviewNotes ?? "",
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/requests");
  revalidatePath("/balances");

  return { ok: true, requestId };
}

export async function denyLeaveRequest(
  requestId: string,
  reviewNotes: string,
): Promise<DenyLeaveRequestResult> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, error: "You must be signed in." };

  if (!reviewNotes || !reviewNotes.trim()) {
    return {
      ok: false,
      error: "A reason is required when denying a request.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("deny_leave_request", {
    p_request_id: requestId,
    p_review_notes: reviewNotes.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/requests");
  revalidatePath("/balances");

  return { ok: true, requestId };
}

// ---------------------------------------------------------------------------
// cancelLeaveRequest — employee cancels their own pending/approved request
// ---------------------------------------------------------------------------

export async function cancelLeaveRequest(
  requestId: string,
  reason: string | null,
): Promise<CancelLeaveRequestResult> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, error: "You must be signed in." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_leave_request", {
    p_request_id: requestId,
    p_reason: reason ?? "",
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/requests");
  revalidatePath("/balances");

  return { ok: true, requestId };
}

// ---------------------------------------------------------------------------
// overrideLeaveRequest — approver reverses a previous approval/denial
// ---------------------------------------------------------------------------

export async function overrideLeaveRequest(
  requestId: string,
  reviewNotes: string,
): Promise<OverrideLeaveRequestResult> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, error: "You must be signed in." };

  if (!reviewNotes || !reviewNotes.trim()) {
    return {
      ok: false,
      error: "A reason is required when overriding a decision.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("override_leave_request", {
    p_request_id: requestId,
    p_review_notes: reviewNotes.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;

  revalidatePath("/");
  revalidatePath("/requests");
  revalidatePath("/balances");

  return { ok: true, requestId, newStatus: row?.status ?? "unknown" };
}

// ---------------------------------------------------------------------------
// adjustEntitlement — approver directly sets granted/used on an entitlement
// ---------------------------------------------------------------------------

export type AdjustEntitlementResult =
  | { ok: true; granted: number; used: number; remaining: number }
  | { ok: false; error: string };

export async function adjustEntitlement(input: {
  employeeId: string;
  leaveTypeCode: string;
  fiscalYear: number;
  newGranted: number | null;
  newUsed: number | null;
  reason: string;
}): Promise<AdjustEntitlementResult> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, error: "You must be signed in." };

  if (!input.reason.trim()) {
    return { ok: false, error: "A reason is required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_entitlement", {
    p_employee_id: input.employeeId,
    p_leave_type_code: input.leaveTypeCode,
    p_fiscal_year: input.fiscalYear,
    p_new_granted: input.newGranted,
    p_new_used: input.newUsed,
    p_reason: input.reason.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;

  revalidatePath("/");
  revalidatePath("/balances");

  return {
    ok: true,
    granted: Number(row?.granted ?? 0),
    used: Number(row?.used ?? 0),
    remaining: Number(row?.remaining ?? 0),
  };
}

// ---------------------------------------------------------------------------
// backdateLeaveRequest — approver creates an already-approved past request
// ---------------------------------------------------------------------------

export type BackdateLeaveRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

export async function backdateLeaveRequest(input: {
  employeeId: string;
  leaveTypeCode: string;
  startDate: string;
  endDate: string;
  /**
   * Hint from the client form's live day count. Ignored by the server —
   * the canonical count is recomputed from the trimmed range against the
   * holidays set we fetch below. Kept in the input for caller ergonomics
   * and to avoid breaking the form's current shape.
   */
  days?: number;
  reason: string;
}): Promise<BackdateLeaveRequestResult> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, error: "You must be signed in." };

  if (!input.reason.trim()) {
    return { ok: false, error: "A reason is required." };
  }

  if (input.endDate < input.startDate) {
    return { ok: false, error: "End date must be on or after start date." };
  }

  const supabase = await createClient();

  // Backdate intentionally skips the policy engine (it's for recording
  // leave that was booked before the system went live), but we still
  // want the stored dates to match real business days so calendars
  // render correctly. Fetch holidays that overlap the requested range
  // and trim with the same rules as submit_leave_request.
  const { data: holidayRows } = await supabase
    .from("holidays")
    .select("date")
    .gte("date", input.startDate)
    .lte("date", input.endDate);
  const holidays = new Set(
    (holidayRows ?? []).map((h: { date: string }) => h.date),
  );

  const trimmed = trimToBusinessDays(input.startDate, input.endDate, holidays);
  if (!trimmed) {
    return {
      ok: false,
      error:
        "The selected range contains no business days (weekends and holidays are excluded).",
    };
  }

  const days = businessDaysInRange(
    trimmed.trimmedStart,
    trimmed.trimmedEnd,
    holidays,
  );
  if (days <= 0) {
    return {
      ok: false,
      error:
        "The selected range contains no business days (weekends and holidays are excluded).",
    };
  }

  const { data, error } = await supabase.rpc("backdate_leave_request", {
    p_employee_id: input.employeeId,
    p_leave_type_code: input.leaveTypeCode,
    p_start_date: trimmed.trimmedStart,
    p_end_date: trimmed.trimmedEnd,
    p_days: days,
    p_reason: input.reason.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;

  revalidatePath("/");
  revalidatePath("/requests");
  revalidatePath("/balances");

  return { ok: true, requestId: row?.request_id ?? "" };
}
