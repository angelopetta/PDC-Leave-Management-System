/**
 * KI Employee Leaves — encoded policy rules.
 *
 * Single source of truth for the policy engine. Both the Next.js client and
 * the Supabase Edge Functions import from this file so that client-side UX
 * and server-side validation cannot diverge.
 *
 * Every rule traces back to a clause in the KI HR manual (Sections 5.1–5.13)
 * and is documented in docs/PRD.md Appendix A.
 */

// ---------------------------------------------------------------------------
// Fiscal year (PRD A.1 / policy 5.3)
// ---------------------------------------------------------------------------

export const FISCAL_YEAR = {
  startMonth: 4, // April
  startDay: 1,
  endMonth: 3, // March
  endDay: 31,
} as const;

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

export type LeaveTypeCode =
  | "vacation"
  | "sick"
  | "bereavement"
  | "cultural"
  | "personal"
  // v1.1 — data model supports these but they are not user-facing in v1.
  | "court_jury"
  | "compassionate_care"
  | "educational"
  | "emergency_escort"
  | "maternity"
  | "parental"
  | "unpaid"
  | "political";

export const V1_LEAVE_TYPES: LeaveTypeCode[] = [
  "vacation",
  "sick",
  "bereavement",
  "cultural",
  "personal",
];

export type EmploymentType =
  | "permanent_full_time"
  | "term"
  | "probationary"
  | "part_time"
  | "seasonal";

// ---------------------------------------------------------------------------
// Vacation (PRD A.3 / policy 5.3)
// ---------------------------------------------------------------------------

export interface VacationTier {
  /** Inclusive lower bound on years of continuous service. */
  minYears: number;
  /** Inclusive upper bound; null = open-ended. */
  maxYears: number | null;
  /** Annual vacation days granted at this tier. */
  days: number;
  /** Vacation pay rate (% of gross) tied to the tier. */
  payPercent: number;
}

export const VACATION_TIERS: VacationTier[] = [
  { minYears: 0,  maxYears: 3,    days: 10, payPercent: 4  },
  { minYears: 4,  maxYears: 10,   days: 15, payPercent: 6  },
  { minYears: 11, maxYears: 15,   days: 20, payPercent: 8  },
  { minYears: 15, maxYears: 20,   days: 25, payPercent: 10 },
  { minYears: 20, maxYears: null, days: 30, payPercent: 12 },
];

export const VACATION_RULES = {
  /** Minimum continuous service before any vacation may be requested. */
  minServiceMonths: 6,
  /** Minimum advance notice on vacation requests. */
  minNoticeDays: 7,
  /** Requests longer than this (in consecutive calendar weeks) cannot auto-approve. */
  maxAutoApproveWeeks: 3,
  /** Holidays falling during vacation are not counted against the balance. */
  holidaysCountAgainstBalance: false,
  /** No carryover at fiscal year end. */
  allowCarryover: false,
  /** Unused accrued vacation is paid out on termination. */
  paidOutOnTermination: true,
  /** Term employees get vacation pay per pay period instead of accruing days. */
  termEmployeesAccrue: false,
} as const;

// ---------------------------------------------------------------------------
// Sick leave (PRD A.4 / policy 5.4)
// ---------------------------------------------------------------------------

export const SICK_RULES = {
  accrualDaysPerMonth: 1.25,
  annualCapDays: 15,
  /** Days worked in a month required to earn that month's sick credit. */
  minDaysWorkedForMonthlyCredit: 10,
  /** Medical certificate required beyond this many consecutive working days. */
  medicalCertAfterConsecutiveDays: 3,
  /** Employees with > this many months service may be advanced up to 5 sick days. */
  advanceEligibleAfterMonths: 12,
  maxAdvanceDays: 5,
  allowCarryover: false,
  paidOutOnTermination: false,
} as const;

// ---------------------------------------------------------------------------
// Bereavement (PRD A.5 / policy 5.5)
// ---------------------------------------------------------------------------

export const BEREAVEMENT_RULES = {
  maxDaysPerEvent: 10,
  paidDays: 5,
  /** Minimum continuous employment for the paid portion. */
  paidEligibilityMonths: 3,
  /** Leave must be taken within this window after the funeral/burial/memorial. */
  maxWeeksAfterService: 6,
  /** May be split into at most this many periods. */
  maxPeriods: 2,
  requiresWrittenNotice: true,
} as const;

// ---------------------------------------------------------------------------
// Cultural (PRD A.9 / policy 5.9)
// ---------------------------------------------------------------------------

export const CULTURAL_RULES = {
  /** Days per year for Permanent/FT/Term/Probationary employees. */
  daysPerYear: 10,
  /** Days per year for seasonal workers. */
  seasonalDaysPerYear: 3,
  /** Windows when cultural leave is intended to be used. */
  windows: ["spring_hunt_april", "fall_hunt_september"] as const,
  allowCarryover: false,
} as const;

// ---------------------------------------------------------------------------
// Personal (PRD A.11 row / policy 5.11)
// ---------------------------------------------------------------------------

export const PERSONAL_RULES = {
  daysPerYear: 5,
  paidDays: 3,
  paidEligibilityMonths: 3,
} as const;

// ---------------------------------------------------------------------------
// v1.1 categories — summarized for the data model; not user-facing in v1.
// ---------------------------------------------------------------------------

export const COURT_JURY_RULES = {
  paidDays: 5,
  requiresDocumentation: true, // jury notice or subpoena
} as const;

export const COMPASSIONATE_CARE_RULES = {
  paidDaysPerYear: 10,
  maxWeeksInWindow: 28,
  windowWeeks: 52,
  requiresMedicalCertificate: true,
} as const;

export const EDUCATIONAL_RULES = {
  daysPerYear: 10,
  requiresProbationComplete: true,
  requiresExecutiveDirectorApproval: true,
  allowCarryover: false,
  paidOutOnTermination: false,
} as const;

export const EMERGENCY_ESCORT_RULES = {
  maxDaysPerEvent: 5,
  oncePerFamilyMemberPerEmergency: true,
  requiresExecutiveDirectorApproval: true,
} as const;

export const MATERNITY_RULES = {
  weeks: 17,
  minNoticeWeeks: 4,
} as const;

export const PARENTAL_RULES = {
  weeks: 63,
  minNoticeWeeks: 4,
} as const;

export const UNPAID_RULES = {
  /** Employee must exhaust vacation and any owed sick leave first. */
  requiresOtherLeaveExhausted: true,
  benefitsDiscontinuedAfterMonths: 1,
} as const;

export const POLITICAL_RULES = {
  requiresCouncilPermission: true,
  typicallyUnpaid: true,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the vacation tier for a given years-of-service value. */
export function vacationTierForYears(years: number): VacationTier {
  for (const tier of VACATION_TIERS) {
    const withinMin = years >= tier.minYears;
    const withinMax = tier.maxYears === null || years <= tier.maxYears;
    if (withinMin && withinMax) return tier;
  }
  // Fallback to lowest tier; should be unreachable for non-negative years.
  return VACATION_TIERS[0];
}
