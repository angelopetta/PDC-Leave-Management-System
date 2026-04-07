"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import {
  evaluateRequest,
  type PolicyContext,
} from "../../../../../policy/engine";
import type {
  LeaveTypeCode,
  EmploymentType,
} from "../../../../../policy/rules";

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
    }
  | {
      ok: false;
      error: string;
      clause?: string;
    };

function fiscalYearForIsoDate(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-indexed
  return m >= 3 ? y : y - 1;
}

export async function submitLeaveRequest(
  input: SubmitLeaveRequestInput,
): Promise<SubmitLeaveRequestResult> {
  // 1. Authenticated employee
  const me = await getCurrentEmployee();
  if (!me) {
    return { ok: false, error: "You must be signed in to submit a request." };
  }

  const supabase = await createClient();

  // 2. Resolve leave type id (and verify it's a v1 type)
  const { data: leaveTypeRow } = await supabase
    .from("leave_types")
    .select("id, code")
    .eq("code", input.leaveType)
    .eq("is_v1", true)
    .maybeSingle();

  if (!leaveTypeRow) {
    return {
      ok: false,
      error: `Unknown or disabled leave type: ${input.leaveType}`,
    };
  }

  // 3. Load the current-FY entitlement for this leave type
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

  // 4. Fetch holidays in the requested range (and a bit of slack)
  const { data: holidayRows } = await supabase
    .from("holidays")
    .select("date")
    .gte("date", input.startDate)
    .lte("date", input.endDate);

  const holidays = new Set(
    (holidayRows ?? []).map((h: { date: string }) => h.date),
  );

  // 5. Run policy engine
  const today = new Date().toISOString().slice(0, 10);
  const ctx: PolicyContext = {
    employee: {
      id: me.id,
      hireDate: me.hireDate,
      employmentType: me.employmentType as EmploymentType,
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
    today,
  };

  const decision = evaluateRequest(ctx);

  if (decision.blocked && decision.blockingCheck) {
    return {
      ok: false,
      error:
        decision.blockingCheck.message ?? "This request cannot be submitted.",
      clause: decision.blockingCheck.clause,
    };
  }

  // 6. Atomic write via RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "submit_leave_request",
    {
      p_leave_type_code: input.leaveType,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_days: decision.days,
      p_reason: input.reason,
      p_auto_approve: decision.autoApprove,
    },
  );

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row) {
    return { ok: false, error: "No response from the server." };
  }

  // 7. Invalidate caches so the user sees their new request immediately
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
  };
}
