/**
 * KI Leave Policy Engine
 *
 * Runs the deterministic v1 policy checks against a single leave request
 * and returns a decision: blocked / auto-approve / judgment call.
 *
 * Both the Next.js server action and (eventually) Supabase Edge Functions
 * import this module so decisions are identical across paths.
 *
 * Every check here traces back to a clause in the KI Employee Leaves
 * policy (Sections 5.1–5.13) and is documented in docs/PRD.md Appendix A.
 *
 * Design notes
 * ------------
 * - Pure functions; no I/O. All context (employee, entitlement, holidays)
 *   is passed in. The caller is responsible for fetching.
 * - "Block" vs "Flag": blocking checks prevent the request from being
 *   submitted at all; flagging checks allow submission but prevent
 *   auto-approval, routing the request to the approver inbox instead.
 * - Dates are treated as UTC ISO strings (yyyy-mm-dd) to sidestep
 *   timezone drift across client/server.
 */

import {
  VACATION_RULES,
  SICK_RULES,
  BEREAVEMENT_RULES,
  PERSONAL_RULES,
  type LeaveTypeCode,
  type EmploymentType,
} from "./rules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyCheckSeverity = "block" | "flag";

export type PolicyCheck = {
  id: string;
  clause: string;
  severity: PolicyCheckSeverity;
  passed: boolean;
  message?: string;
};

export type PolicyContext = {
  employee: {
    id: string;
    hireDate: string; // ISO yyyy-mm-dd
    employmentType: EmploymentType;
  };
  leaveType: LeaveTypeCode;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO yyyy-mm-dd
  reason: string;
  entitlement: {
    granted: number;
    earned: number;
    used: number;
    pending: number;
  };
  /** ISO yyyy-mm-dd set of holiday dates falling anywhere in the year. */
  holidays: Set<string>;
  /** Reference "today" for notice-period math. ISO yyyy-mm-dd. */
  today: string;
};

export type PolicyDecision = {
  /** Business days requested (weekends + holidays excluded). */
  days: number;
  /** True if any block-severity check failed. */
  blocked: boolean;
  /** True if all checks passed (including flags). */
  autoApprove: boolean;
  checks: PolicyCheck[];
  blockingCheck?: PolicyCheck;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(aIso: string, bIso: string): number {
  const ms = toDate(bIso).getTime() - toDate(aIso).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function monthsBetween(aIso: string, bIso: string): number {
  const a = toDate(aIso);
  const b = toDate(bIso);
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

/**
 * Counts business days in the inclusive range [startIso, endIso], excluding
 * weekends and any dates present in the `holidays` set. Implements the
 * "holidays during vacation don't count against balance" rule from KI
 * policy 5.3.
 */
export function businessDaysInRange(
  startIso: string,
  endIso: string,
  holidays: Set<string>,
): number {
  const start = toDate(startIso);
  const end = toDate(endIso);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    const iso = toIso(cur);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function evaluateRequest(ctx: PolicyContext): PolicyDecision {
  // Date sanity first — everything else assumes a valid range.
  if (toDate(ctx.endDate) < toDate(ctx.startDate)) {
    const c: PolicyCheck = {
      id: "date.range",
      clause: "Invalid date range",
      severity: "block",
      passed: false,
      message: "End date must be on or after start date.",
    };
    return {
      days: 0,
      blocked: true,
      autoApprove: false,
      checks: [c],
      blockingCheck: c,
    };
  }

  const days = businessDaysInRange(ctx.startDate, ctx.endDate, ctx.holidays);

  if (days <= 0) {
    const c: PolicyCheck = {
      id: "date.no_business_days",
      clause: "Invalid date range",
      severity: "block",
      passed: false,
      message:
        "The selected range contains no business days (weekends and holidays are excluded).",
    };
    return {
      days: 0,
      blocked: true,
      autoApprove: false,
      checks: [c],
      blockingCheck: c,
    };
  }

  const checks: PolicyCheck[] = [];

  // --- Universal: balance ---------------------------------------------------
  const remaining =
    ctx.entitlement.granted +
    ctx.entitlement.earned -
    ctx.entitlement.used -
    ctx.entitlement.pending;

  checks.push({
    id: "balance",
    clause: "Insufficient balance",
    severity: "block",
    passed: days <= remaining,
    message:
      days > remaining
        ? `This request is ${days} day${days === 1 ? "" : "s"} but you have only ${remaining} remaining in this leave type.`
        : undefined,
  });

  // --- Vacation -------------------------------------------------------------
  if (ctx.leaveType === "vacation") {
    // Term employees receive vacation pay per pay period, no day accrual.
    if (ctx.employee.employmentType === "term") {
      checks.push({
        id: "vacation.term_employee",
        clause: "Policy 5.3 — Vacation (term employees)",
        severity: "block",
        passed: false,
        message:
          "Term employees receive vacation pay per pay period and cannot request vacation days.",
      });
    }

    // Minimum 6 months continuous service before any vacation can be taken.
    const monthsOfService = monthsBetween(
      ctx.employee.hireDate,
      ctx.startDate,
    );
    checks.push({
      id: "vacation.min_service",
      clause: "Policy 5.3 — Vacation (minimum service)",
      severity: "block",
      passed: monthsOfService >= VACATION_RULES.minServiceMonths,
      message:
        monthsOfService >= VACATION_RULES.minServiceMonths
          ? undefined
          : `Vacation requires at least ${VACATION_RULES.minServiceMonths} months of continuous service. You have ${monthsOfService} months as of the start date.`,
    });

    // Notice period
    const notice = daysBetween(ctx.today, ctx.startDate);
    checks.push({
      id: "vacation.notice",
      clause: "Policy 5.3 — Vacation (notice period)",
      severity: "block",
      passed: notice >= VACATION_RULES.minNoticeDays,
      message:
        notice >= VACATION_RULES.minNoticeDays
          ? undefined
          : `Vacation requests require at least ${VACATION_RULES.minNoticeDays} days advance notice. Your start date is ${notice} day${notice === 1 ? "" : "s"} away.`,
    });

    // Vacation longer than 3 consecutive weeks needs explicit CEO approval;
    // allow submission but flag for review (no auto-approve).
    const calendarDays = daysBetween(ctx.startDate, ctx.endDate) + 1;
    const weeks = calendarDays / 7;
    checks.push({
      id: "vacation.max_auto_approve",
      clause: "Policy 5.3 — Vacation (CEO approval beyond 3 weeks)",
      severity: "flag",
      passed: weeks <= VACATION_RULES.maxAutoApproveWeeks,
      message:
        weeks > VACATION_RULES.maxAutoApproveWeeks
          ? `Requests longer than ${VACATION_RULES.maxAutoApproveWeeks} consecutive weeks require explicit CEO approval and cannot be auto-approved.`
          : undefined,
    });
  }

  // --- Sick -----------------------------------------------------------------
  if (ctx.leaveType === "sick") {
    // Medical certificate required beyond 3 consecutive working days.
    if (days > SICK_RULES.medicalCertAfterConsecutiveDays) {
      checks.push({
        id: "sick.medical_cert",
        clause: "Policy 5.4 — Sick Leave (medical certificate)",
        severity: "flag",
        passed: false,
        message: `A medical certificate is required for sick leave exceeding ${SICK_RULES.medicalCertAfterConsecutiveDays} consecutive working days. Your request will be flagged for review.`,
      });
    }
  }

  // --- Bereavement ----------------------------------------------------------
  if (ctx.leaveType === "bereavement") {
    const months = monthsBetween(ctx.employee.hireDate, ctx.startDate);
    if (months < BEREAVEMENT_RULES.paidEligibilityMonths) {
      checks.push({
        id: "bereavement.paid_eligibility",
        clause: "Policy 5.5 — Bereavement (paid eligibility)",
        severity: "flag",
        passed: false,
        message: `Paid bereavement leave requires ${BEREAVEMENT_RULES.paidEligibilityMonths} months of continuous employment. Your request will be flagged for review.`,
      });
    }
    if (days > BEREAVEMENT_RULES.maxDaysPerEvent) {
      checks.push({
        id: "bereavement.max_per_event",
        clause: "Policy 5.5 — Bereavement (maximum per event)",
        severity: "block",
        passed: false,
        message: `Bereavement leave is limited to ${BEREAVEMENT_RULES.maxDaysPerEvent} days per event.`,
      });
    }
  }

  // --- Personal -------------------------------------------------------------
  if (ctx.leaveType === "personal") {
    const months = monthsBetween(ctx.employee.hireDate, ctx.startDate);
    if (months < PERSONAL_RULES.paidEligibilityMonths) {
      checks.push({
        id: "personal.paid_eligibility",
        clause: "Policy 5.11 — Personal Leave (paid eligibility)",
        severity: "flag",
        passed: false,
        message: `Paid personal leave requires ${PERSONAL_RULES.paidEligibilityMonths} months of continuous employment. Your request will be flagged for review.`,
      });
    }
  }

  // --- Cultural -------------------------------------------------------------
  // No additional hard gates beyond the universal balance check. Eligibility
  // windows (spring/fall hunt) are advisory, not enforced.

  const blocking = checks.find((c) => !c.passed && c.severity === "block");
  const flagged = checks.some((c) => !c.passed && c.severity === "flag");

  return {
    days,
    blocked: !!blocking,
    autoApprove: !blocking && !flagged,
    checks,
    blockingCheck: blocking,
  };
}
