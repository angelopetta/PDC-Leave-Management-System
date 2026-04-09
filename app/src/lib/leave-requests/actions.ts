"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import {
  evaluateRequest,
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
  // department on file. We pull all overlapping requests in the same
  // department EXCLUDING the requester themselves so the engine can do
  // "what if" math for both new submissions and inbox re-checks.
  let departmentCoverage: DepartmentCoverageContext | undefined;
  const employeeRow = employeeRes.data as
    | { id: string; department: string | null; department_id: string | null }
    | null;

  if (employeeRow?.department_id) {
    const [deptRes, headcountRes, overlapRes] = await Promise.all([
      supabase
        .from("departments")
        .select("id, name, min_coverage")
        .eq("id", employeeRow.department_id)
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("department_id", employeeRow.department_id)
        .eq("status", "active"),
      supabase
        .from("leave_requests")
        .select(
          `id, employee_id, start_date, end_date, status,
           employees!employee_id(first_name, last_name, department_id)`,
        )
        .in("status", ["submitted", "approved"])
        .lte("start_date", input.endDate)
        .gte("end_date", input.startDate)
        .neq("employee_id", me.id),
    ]);

    if (deptRes.data) {
      const overlapping = (
        (overlapRes.data ?? []) as unknown as Array<{
          id: string;
          employee_id: string;
          start_date: string;
          end_date: string;
          status: "submitted" | "approved";
          employees: {
            first_name: string;
            last_name: string;
            department_id: string | null;
          } | null;
        }>
      )
        // Filter to same department in TS — Supabase nested filters are
        // awkward and the row count is small enough that this is fine.
        .filter((r) => r.employees?.department_id === employeeRow.department_id)
        .map((r) => ({
          requestId: r.id,
          employeeId: r.employee_id,
          employeeName: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
          startDate: r.start_date,
          endDate: r.end_date,
          status: r.status,
        }));

      departmentCoverage = {
        departmentId: deptRes.data.id,
        departmentName: deptRes.data.name,
        headcount: headcountRes.count ?? 0,
        minCoverage: deptRes.data.min_coverage,
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

  return {
    ok: true,
    days: decision.days,
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

  const decision = evaluateRequest(built.ctx);

  if (decision.blocked && decision.blockingCheck) {
    return {
      ok: false,
      error:
        decision.blockingCheck.message ?? "This request cannot be submitted.",
      clause: decision.blockingCheck.clause,
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
      p_start_date: input.startDate,
      p_end_date: input.endDate,
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
