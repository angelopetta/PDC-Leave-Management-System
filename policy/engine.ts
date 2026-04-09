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

/**
 * A blackout window passed into the engine. The DB stores `applies_to`
 * as 'all' or 'department:Finance'; the engine only cares about the
 * scope ('all' = org-wide block, 'department' = soft flag for matching
 * department).
 */
export type BlackoutPeriod = {
  id?: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO yyyy-mm-dd
  scope: "all" | "department";
  /** Raw applies_to string for messaging ('all' or 'department:Finance'). */
  appliesTo: string;
  reason: string | null;
};

/**
 * Context for the department coverage check. The caller supplies the
 * department's headcount and minimum-coverage threshold along with all
 * currently-overlapping approved/submitted requests in the same
 * department, EXCLUDING the request being evaluated (so the engine can
 * compute "what if I added this one?").
 */
export type DepartmentCoverageContext = {
  departmentId: string;
  departmentName: string;
  /** Active employees in the department, including the requester. */
  headcount: number;
  /** Minimum number of people who must remain on the job at all times. */
  minCoverage: number;
  /**
   * Other peoples' leave that overlaps any day in the request's range.
   * Excludes the current request and any of the requester's own previous
   * rows for the same range.
   */
  overlapping: Array<{
    requestId: string;
    employeeId: string;
    employeeName: string;
    startDate: string; // ISO yyyy-mm-dd
    endDate: string; // ISO yyyy-mm-dd
    status: "submitted" | "approved";
  }>;
};

/**
 * Three modes for the auto-approval rollout (see PRD §5.1):
 *
 *   shadow         — engine recommends, request still goes to inbox.
 *                    The default until HR is comfortable.
 *   auto_with_fyi  — in-policy requests auto-approve; CEO gets an FYI.
 *   auto_silent    — in-policy requests auto-approve silently.
 */
export type AutoApprovalMode = "shadow" | "auto_with_fyi" | "auto_silent";

export type PolicyContext = {
  employee: {
    id: string;
    hireDate: string; // ISO yyyy-mm-dd
    employmentType: EmploymentType;
    departmentName: string | null;
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
  /** Active blackout windows that could overlap the request. */
  blackouts: BlackoutPeriod[];
  /**
   * Coverage data for the requester's department. Optional because
   * employees with no department on file can't be coverage-checked.
   */
  departmentCoverage?: DepartmentCoverageContext;
  /** Current rollout mode from app_settings. Affects autoApprove only. */
  autoApprovalMode: AutoApprovalMode;
};

export type PolicyDecision = {
  /** Business days requested (weekends + holidays excluded). */
  days: number;
  /** True if any block-severity check failed. */
  blocked: boolean;
  /**
   * What the engine recommends regardless of mode. 'auto_approve' iff no
   * block AND no flag fired. Stored on the request row so the inbox can
   * show "Recommended: Approve" badges in shadow mode.
   */
  recommendation: "auto_approve" | "review";
  /**
   * Final actual auto-approve decision. Equal to recommendation ===
   * 'auto_approve' UNLESS mode is 'shadow', in which case this is always
   * false (everything goes to inbox in shadow mode).
   */
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

/** True if [aStart,aEnd] and [bStart,bEnd] share at least one day. */
function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return toDate(aStart) <= toDate(bEnd) && toDate(bStart) <= toDate(aEnd);
}

/**
 * Returns the maximum number of distinct overlapping people on any
 * single weekday in [startIso, endIso], counting from the supplied
 * `overlapping` list. Used by the department coverage check to compute
 * worst-case staffing during the requested window.
 */
function peakOverlapOnAnyDay(
  startIso: string,
  endIso: string,
  overlapping: DepartmentCoverageContext["overlapping"],
): number {
  let peak = 0;
  const start = toDate(startIso);
  const end = toDate(endIso);
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const iso = toIso(cur);
      let count = 0;
      for (const o of overlapping) {
        if (iso >= o.startDate && iso <= o.endDate) count += 1;
      }
      if (count > peak) peak = count;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return peak;
}

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
      recommendation: "review",
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
      recommendation: "review",
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

  // --- Blackouts ------------------------------------------------------------
  // Org-wide blackouts are hard blocks (PRD §5.1, blackout periods).
  // Department-scoped blackouts are flags — the request is allowed but
  // routes for review so the approver can weigh it against the reason.
  for (const b of ctx.blackouts) {
    if (
      !rangesOverlap(ctx.startDate, ctx.endDate, b.startDate, b.endDate)
    ) {
      continue;
    }
    if (b.scope === "all") {
      checks.push({
        id: "blackout.org_wide",
        clause: "PRD §5.1 — Blackout periods (org-wide)",
        severity: "block",
        passed: false,
        message:
          (b.reason
            ? `${b.reason} `
            : "An organization-wide blackout is in effect ") +
          `(${b.startDate} to ${b.endDate}). Please choose dates outside this window.`,
      });
    } else if (
      b.scope === "department" &&
      ctx.employee.departmentName &&
      b.appliesTo === `department:${ctx.employee.departmentName}`
    ) {
      checks.push({
        id: "blackout.department",
        clause: "PRD §5.1 — Blackout periods (department-scoped)",
        severity: "flag",
        passed: false,
        message:
          (b.reason
            ? `${b.reason} `
            : `A blackout is in effect for ${ctx.employee.departmentName} `) +
          `(${b.startDate} to ${b.endDate}). Your request will be flagged for review.`,
      });
    }
  }

  // --- Department coverage --------------------------------------------------
  // Soft check: if approving this request would peak the number of
  // department members off on any one day above (headcount - minCoverage),
  // route it for review instead of auto-approving. Sick leave is exempt
  // because employees can't pre-plan illness — KI policy doesn't gate
  // sick leave on coverage. (PRD §5.1, coverage / conflict detection)
  if (ctx.departmentCoverage && ctx.leaveType !== "sick") {
    const cov = ctx.departmentCoverage;
    // The +1 represents the requester themselves; `overlapping` excludes
    // them so the engine can do the "what if" math the same way for both
    // submission preview and inbox re-check.
    const peakWithThis =
      peakOverlapOnAnyDay(ctx.startDate, ctx.endDate, cov.overlapping) + 1;
    const maxAllowedOff = cov.headcount - cov.minCoverage;
    if (peakWithThis > maxAllowedOff) {
      checks.push({
        id: "coverage.department_minimum",
        clause: "PRD §5.1 — Coverage / conflict detection",
        severity: "flag",
        passed: false,
        message: `Approving would leave ${cov.departmentName} below its minimum coverage of ${cov.minCoverage} on at least one day. ${peakWithThis} of ${cov.headcount} ${cov.departmentName} staff would be off concurrently. Your request will be flagged for review.`,
      });
    }
  }

  const blocking = checks.find((c) => !c.passed && c.severity === "block");
  const flagged = checks.some((c) => !c.passed && c.severity === "flag");

  const recommendation: "auto_approve" | "review" =
    !blocking && !flagged ? "auto_approve" : "review";

  // In shadow mode, the engine still computes a recommendation but
  // never auto-approves — every in-policy request goes to the inbox
  // with a "Recommended: Approve" badge so HR can build trust before
  // flipping the switch. (PRD §5.1, auto-approval rollout)
  const autoApprove =
    recommendation === "auto_approve" && ctx.autoApprovalMode !== "shadow";

  return {
    days,
    blocked: !!blocking,
    recommendation,
    autoApprove,
    checks,
    blockingCheck: blocking,
  };
}
