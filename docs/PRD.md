**Product Requirements Document**

**KI Vacation & Leave Management System**

*Internal HR Tool --- Draft v0.3*

**Prepared for:** KI HR / Administration

**Date:** April 6, 2026

**Status:** Draft for review --- policy encoded, open questions answered

**Intended build tool:** Claude Code

**Target stack:** Next.js + Supabase (backend) + Vercel (hosting)

1\. Overview

This document describes the requirements for a lightweight, policy-driven Vacation & Leave Management System for KI, replacing the current paper- and email-based process. The system centralizes leave requests, automates entitlement calculations based on the KI Employee Leaves policy (Sections 5.1--5.13 of the KI HR manual), and provides the CEO, managers, and staff with a transparent, real-time view of leave balances and team availability.

The system is intended for a team of under 20 employees and will support the five most-used leave categories in v1: Vacation, Sick, Bereavement, Cultural, and Personal. The remaining categories defined in KI\'s policy (Court/Jury, Compassionate Care, Educational, Emergency Escort, Maternity, Parental, Unpaid, and Political) will be added in v1.1.

**v1 scope:** Vacation, Sick, Bereavement, Cultural, Personal --- five leave types only.

1.1 Problem Statement

-   Staff have no visibility into their own remaining balances, leading to repeated questions.

-   Supervisors must interpret policy case by case, creating perceived inconsistency and friction.

-   Approvals and denials are not consistently tied back to the written KI policy, generating misunderstandings and complaints.

-   There is no single source of truth for who is off, when, or why.

-   Historical records are fragmented across inboxes and paper files, making year-end reporting slow and error-prone.

1.2 Goals

-   Make the process lightweight, intuitive, and user-friendly with a low learning curve.

-   Leverage the KI Employee Leaves policy to automatically determine allowable days per leave type and define what qualifies for each category.

-   Shift responsibility away from supervisors by relying on encoded policy --- limits and criteria are enforced by the system.

-   Standardize and make leave management transparent so staff understand their entitlements.

-   Minimize misunderstandings and complaints related to leave decisions.

-   Produce accurate, exportable records for finance, payroll, and audit.

1.3 Non-Goals (for v1)

-   Full HRIS or payroll replacement.

-   Time-and-attendance tracking beyond leave.

-   Shift scheduling or rotations.

-   Native mobile apps (responsive web is sufficient).

2\. Users & Roles

  -------------------------------- ----------------------------------------------------------------------------------------------------------------------------
  **Role**                         **Description & Permissions**
  Employee                         Submits leave requests, views own balances and history, sees team calendar.
  Supervisor / Manager             Approves requests for direct reports. Sees team calendar and team balances. (In v1, the CEO fulfills this role.)
  HR Administrator / CEO           Manages employees, policy configuration, accruals, reports, audit log. Primary approver for all leave requests at rollout.
  Backup Approver (Lead Finance)   Automatically receives approval requests when the CEO is on leave. Same approval powers during the delegation window.
  Executive (read-only)            Views organization-wide usage reports and dashboards.
  -------------------------------- ----------------------------------------------------------------------------------------------------------------------------

**Note:** Per the answers in Section 9, the CEO is the primary approver at rollout, with the Lead Finance Officer as the designated backup. The role model is built in from day one so that additional supervisors can be added later without rework.

3\. What Has Already Been Built (Prototype)

A working interactive prototype exists as a single-file HTML/React application (leave-tracker-prototype.html in the HR folder). It is the visual and functional starting point for the production build.

Included views

-   Dashboard --- pending/approved/denied metrics, leave usage by type, upcoming 30-day leave.

-   Requests --- filterable table with one-click approve and reason-required deny.

-   Team Calendar --- monthly, color-coded, approved vs pending, hover details.

-   Balances --- per-employee remaining days across all leave types with progress bars.

-   New Request form --- employee, type, dates (business-day auto-count), reason.

**Known limitation:** Browser-memory only. No login, no persistence, no policy engine, no notifications. These are addressed in Section 4.

4\. Core Functional Requirements

4.1 Policy-Driven Automation (Central Requirement)

The KI Employee Leaves policy is encoded into the system as a machine-readable ruleset. Entitlements, eligibility, and limits are enforced automatically, removing the need for supervisors to interpret policy case by case.

-   HR configures Policy Profiles (Permanent Full-Time, Term, Probationary, Part-Time, Seasonal) matching the categories used throughout KI\'s policy.

-   Each leave type has a plain-language eligibility description drawn directly from the KI policy, visible to the employee at the moment they pick a type.

-   On submit, the system checks: (a) is the type valid for their profile, (b) do they have enough days remaining under the accrual rules, (c) have they met the minimum-service requirement for that type, (d) does the request meet notice-period requirements, (e) does it conflict with team coverage or blackout dates, (f) does it require supporting documentation.

-   If a rule is violated, the employee sees the exact clause from the KI policy explaining why.

-   In-policy requests can be auto-approved; the CEO is notified as an FYI. Judgment calls route for review.

-   A viewer of the KI Employee Leaves policy PDF is one click away from every request screen.

4.2 Authentication & Roles

-   Email + password auth via Supabase Auth. Magic-link login supported.

-   Row-Level Security enforced at the database level so employees can only see their own data and supervisors only see their direct reports.

-   CEO/HR Admin role has full access including policy configuration.

4.3 Leave Request Workflow

1.  Employee opens the system and selects New Request.

2.  Employee selects a leave type; system displays the KI policy definition and current balance.

3.  Employee selects dates; business days calculated excluding weekends and the 11 KI-observed holidays.

4.  All policy checks run in real time before submission is allowed.

5.  On submit, request is auto-approved (if in policy) or routed to CEO.

6.  Email notification to employee and approver via Supabase Edge Function + transactional email service.

7.  Approver approves or denies in one click (email link or app).

8.  On approval, balance is decremented and request appears on the team calendar.

9.  On denial, a reason is required; employee is notified with the reason and policy clause.

4.4 Balances & Accruals

-   Fiscal year runs April 1 to March 31 (per KI policy).

-   Vacation uses a tiered entitlement based on years of continuous service (see Appendix A).

-   Sick leave accrues at 1.25 days per month, capped at 15 days/year, only in months where the employee worked at least 10 days.

-   No carryover on vacation, sick, cultural, or educational leave (all reset at fiscal year end, per KI policy).

-   Employees see a clear breakdown: entitled, earned to date, used, pending, and remaining.

4.5 Team Calendar

-   Month and week views, color-coded by leave type.

-   Filters by department, leave type, or status.

-   Conflict indicator when multiple employees are off on the same day.

-   Shows the 11 KI holidays as non-work days.

-   Optional iCal/ICS subscription so CEO/managers can overlay on personal calendars.

4.6 Notifications

-   Email on: submission, approval, denial, upcoming leave reminder, balance-low warning.

-   In-app notification bell.

-   Weekly digest to CEO of pending requests and any policy exceptions.

4.7 Reporting & Exports

-   Canned reports: leave taken by employee, by department, by type, by month.

-   Year-end balance report for finance.

-   Export to CSV, Excel, and PDF.

-   Full audit log (immutable) of every action.

4.8 Employee Self-Service

-   Personal dashboard with balances, upcoming leave, and full history.

-   Cancel or edit a pending request before approval.

-   Request cancellation of an already-approved future leave.

5\. Recommended Enhancements

Grouped by priority so you can decide what belongs in v1 versus later.

5.1 High-Value --- Strongly Recommended for v1

-   **In-context policy viewer.** Every leave type shows the KI policy clause inline, with a link to the full PDF.

-   **Auto-approval for in-policy requests.** If within balance, past the notice period, and no conflict --- approve automatically and notify the CEO as FYI.

    *Rollout modes (Phase 3).* HR can pick the auto-approval posture without a code change by flipping `app_settings.auto_approval_mode`:

    -   `shadow` *(default)* --- the policy engine recommends approvals but every request still goes to the approver inbox. The inbox shows a green "Recommended: Approve" badge on requests that would have auto-approved, with a one-click "Approve as recommended" button. Lets HR build trust before flipping the switch; no employee-visible behaviour change.
    -   `auto_with_fyi` --- in-policy requests are auto-approved on submit and the CEO receives an FYI notification.
    -   `auto_silent` --- in-policy requests auto-approve silently. Used only after HR is fully comfortable with the engine output.

    The engine writes its verdict to `leave_requests.recommendation` (`auto_approve` | `review`) at submit time regardless of mode, so the divergence between recommendation and final decision is auditable.

-   **Holiday-aware day counting.** Honours the 11 KI-observed holidays so counts match what finance expects. Per policy, holidays falling during vacation are not counted against the employee.

-   **Years-of-service tracking.** System automatically bumps vacation entitlement on each work anniversary per the tiered schedule.

-   **Minimum-service enforcement.** 6-month minimum for vacation, probation period for educational leave, etc.

-   **Supporting-document uploads.** Medical certificate for sick leave \>3 consecutive days, jury summons, funeral notice, etc. Stored securely against the request.

-   **Supervisor delegation.** When the CEO is themselves on leave, approvals route automatically to the Lead Finance Officer as the designated backup.

-   **Coverage / conflict detection.** Warn when approving would leave a team under minimum coverage.

    *Implementation (Phase 3).* Each row in the `departments` table carries a `min_coverage` integer (the minimum number of department members who must remain on the job at all times). The policy engine computes the peak number of concurrent overlapping approved-or-pending requests in the requester's department for any weekday in the requested range; if approving the new request would push that peak above `headcount - min_coverage`, the request is **flagged** (not blocked) and routes to manual review. Sick leave is exempt --- people don't pre-plan illness, and KI policy doesn't gate sick leave on coverage.

    Warnings surface in two places:

    -   On the New Request form, as a live preview ("Heads up: 3 of 5 Finance staff would be off that week. Your request will need CEO review instead of auto-approving."). The user can still submit; routing changes only.
    -   In the approver inbox, where each pending request expands to show a conflict view: every overlapping approved/pending request in the same department, plus a coverage line ("Finance: peak 3 of 5 off concurrently --- below min 2").

-   **Audit log.** Immutable record of every action, essential for defending policy-driven decisions.

-   **Calendar subscription (ICS).** So approved leave flows into Outlook/Google Calendar automatically.

-   **Max-3-weeks-at-once check.** Per KI policy 5.3: vacation longer than 3 weeks requires explicit CEO approval, not auto-approval.

5.2 Medium-Value --- Consider for v1 or v1.1

-   **Half-day and partial-day requests.** Common for medical appointments.

-   **Blackout periods.** HR can mark periods where vacation cannot be requested (audit week, community events).

    *Implementation (Phase 3).* `blackout_periods.applies_to` distinguishes two scopes:

    -   `all` --- organization-wide. The policy engine treats overlap with an org-wide blackout as a **hard block**: the request can't be submitted and the form surfaces the blackout reason.
    -   `department:<Name>` --- soft scope. Overlap with the requester's department blackout is **flagged**, allowing submission but routing the request to the approver inbox so the CEO can weigh the reason.

    A starter `KI Annual Audit Week` blackout (`2027-03-08 → 2027-03-12`, scope `all`) is seeded by migration `20260410000000_phase3_approval_flow_schema.sql` so the engine check has something to fire against during smoke testing. HR will manage future blackouts from the v1.1 settings UI.

-   **Year-end rollover automation.** On March 31 → April 1, balances reset per policy (no carryover for vacation, sick, cultural, or educational).

-   **Bulk imports.** Load employees and starting balances from a spreadsheet at rollout.

-   **Balance-low warnings.** Proactive email when an employee is near their limit, and to HR if an employee has taken zero vacation by a certain cutoff.

-   **Printable leave request form.** PDF for paper filing or signature workflows.

-   **Mobile-responsive design.** Usable on phones for field staff.

-   **Vacation pay percentage display.** Show the 4%--12% vacation-pay rate tied to years-of-service tier, as a transparency feature.

5.3 Nice-to-Have --- Future Releases

-   **Integration with payroll.** Export pay-period leave in finance\'s format.

-   **Manager dashboards.** Response-time metrics, sick trends, coverage gaps.

-   **Anonymous sick-leave aggregates.** Wellness reporting without exposing individuals.

-   **Multi-language support.** English plus community languages.

-   **SMS reminders.** For staff who don\'t check email often.

-   **Teams / Slack bot.** Submit and approve from chat.

-   **Advance-sick-leave workflow.** Support the policy-allowed 5-day advance for employees with more than one year service, including the repayment schedule.

6\. Data Model (Summary)

  -------------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------
  **Entity**                             **Key Fields**
  Employee                               id, name, email, role, department, manager\_id, policy\_profile\_id, employment\_type, start\_date, status
  Policy Profile                         id, name (FT/Term/Probationary/PT/Seasonal), eligibility rules (JSON)
  Leave Type                             id, code, name, description, color, eligibility\_text, requires\_attachment, notice\_days, max\_consecutive\_days, auto\_approvable
  Entitlement Rule                       id, leave\_type\_id, policy\_profile\_id, accrual\_method (lump/monthly), base\_days, tier\_rules (JSON)
  Entitlement (per employee, per year)   id, employee\_id, leave\_type\_id, fiscal\_year, granted, used, pending, remaining
  Leave Request                          id, employee\_id, leave\_type\_id, start\_date, end\_date, days, reason, status, submitted\_at, reviewed\_by, reviewed\_at, notes, attachment\_url
  Holiday                                id, date, name, type (statutory/provincial/FN)
  Blackout Period                        id, start\_date, end\_date, applies\_to, reason
  Audit Log                              id, actor\_id, action, entity\_type, entity\_id, before, after, timestamp
  -------------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------

7\. Non-Functional Requirements

-   New employees can submit their first request in under 2 minutes without training.

-   Page load under 2 seconds.

-   HTTPS everywhere; data encrypted at rest (Supabase default).

-   Daily automated backups with 30-day retention.

-   WCAG 2.1 AA accessibility.

-   Audit trail retained 7 years minimum.

8\. Technical Architecture

Based on the answers in Section 9:

-   **Frontend:** Next.js (React) + Tailwind CSS + shadcn/ui --- reuses the prototype\'s visual design system.

-   **Backend:** Supabase --- PostgreSQL database, Auth, Row-Level Security, Storage (for attachments), Edge Functions (for policy engine and notifications).

-   **Hosting:** Vercel for the Next.js frontend; Supabase-managed for the backend.

-   **Email:** Resend or Supabase\'s built-in email, triggered from Edge Functions.

-   **Policy engine:** Implemented as TypeScript functions in the Next.js app and mirrored in a Supabase Edge Function so server-side validation cannot be bypassed.

-   **Repo layout:** Monorepo with /app (Next.js), /supabase/migrations (SQL schemas), /supabase/functions (Edge Functions), /policy (machine-readable rules).

9\. Open Questions --- Answered

  -------- --------------------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **\#**   **Question**                                  **Answer**
  1        Where will this be hosted?                    Supabase (backend) + Vercel (frontend) for demo and testing.
  2        Do you have SSO to integrate with?            No integration needed at this time.
  3        What is the fiscal/leave year start date?     April 1 --- FY 2026/2027 begins April 1, 2026.
  4        Is the current leave policy documented?       Yes --- KI Employee Leaves (Section 5 of KI HR manual), attached.
  4b       Employee roster with start dates?             Mock roster delivered (KI-Employee-Roster-Mock.xlsx, 16 employees) exercising all vacation tiers. Real data to replace mock before production.
  5        Are there different policy profiles?          No separate profiles needed at this time; rules apply per the employment-type categories used in the KI policy (Full-Time, Term, Probationary, Part-Time, Seasonal).
  6        What entitlements apply to each leave type?   Encoded from the KI policy --- see Appendix A.
  7        Which payroll system to plan for?             None at this time.
  8        Holidays and closure days to pre-load?        The 11 KI-observed holidays listed in policy 5.1 --- see Appendix A.
  9        Who are the initial supervisors?              CEO is the primary approver. Lead Finance Officer is the designated backup when the CEO is on leave. Model supports adding more supervisors later.
  10       Budget ceiling / timeline for v1?             None specified at this time.
  -------- --------------------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

Appendix A --- KI Leave Policy Encoded

This appendix translates the KI Employee Leaves policy (Sections 5.1--5.13) into structured rules the policy engine will enforce. Every line traces to a specific clause in the attached KI policy PDF.

A.1 Fiscal Year

-   Leave year: April 1 to March 31 (policy 5.3).

-   First year of rollout: April 1, 2026 to March 31, 2027.

A.2 Observed Holidays (Policy 5.1)

KI observes 11 statutory, provincial, and First Nation holidays. Offices are closed and holidays falling during an employee\'s vacation are not counted as leave taken.

  ------------------------------------------- --------------------------- --------------
  **Holiday**                                 **Date**                    **Type**
  New Year\'s Day                             January 1                   Statutory
  Family Day                                  3rd Monday in February      Provincial
  Good Friday                                 Friday before Easter        Statutory
  Easter Monday                               Monday after Easter         Statutory
  Jeremiah Day\*                              Last Friday of May          First Nation
  National Aboriginal Day\*                   June 21                     First Nation
  Civic Holiday\*                             First Monday in August      First Nation
  Labour Day                                  First Monday in September   Statutory
  National Day for Truth and Reconciliation   September 30                Statutory
  Remembrance Day                             November 11                 Statutory
  Christmas Day                               December 25                 Statutory
  Boxing Day                                  December 26                 Statutory
  ------------------------------------------- --------------------------- --------------

**\*** *KI recognizes Jeremiah Day, National Aboriginal Day, and Civic Holiday in lieu of Victoria Day, Canada Day, and Thanksgiving Day.*

A.3 Annual Leave / Vacation (Policy 5.3)

  --------------------------------- --------------------- -------------------------------
  **Years of Continuous Service**   **Annual Vacation**   **Vacation Pay (% of gross)**
  0--3 years                        10 working days       4%
  4--10 years                       15 working days       6%
  11--15 years                      20 working days       8%
  15--20 years                      25 working days       10%
  20+ years                         30 working days       12%
  --------------------------------- --------------------- -------------------------------

Rules the engine must enforce

-   Minimum 6 months continuous service before requesting vacation.

-   Must be requested at least 1 week in advance.

-   Maximum 3 consecutive weeks; longer requires explicit approval (no auto-approve).

-   No carryover --- all vacation must be taken in the year it is earned.

-   Holidays falling during vacation do not count against the balance.

-   Unused accrued vacation is paid out on termination.

-   Term employees do not accrue vacation days; they receive vacation pay per pay period (Canada Labour Code).

-   KI reserves the right to deny based on business/client needs.

A.4 Paid Sick Leave (Policy 5.4)

-   Accrual: 1.25 days per month on duty, up to 15 days per year.

-   Eligibility for monthly credit: must work at least 10 days that month.

-   Permitted uses: personal illness, injury, medical appointments, or illness of a child/dependent.

-   No carryover year to year.

-   Medical certificate required for absences exceeding 3 consecutive working days.

-   Supervisor may advance up to 5 sick days to employees with \>1 year service, repaid via future accrual.

-   Does not accrue during other leave or leave without pay.

-   Not paid out on termination.

A.5 Paid Bereavement Leave (Policy 5.5)

-   Up to 10 days for death of an immediate family member.

-   First 5 days paid if employee has at least 3 consecutive months of continuous employment.

-   Can be taken in 1 or 2 periods, starting from the date of death and ending 6 weeks after the funeral/burial/memorial.

-   Written notice required indicating start date and length.

A.6 Paid Court / Jury Leave (Policy 5.6)

-   Up to 5 working days paid for jury selection, sitting on a jury, or attending as a witness under subpoena.

-   Photocopy of jury notice or subpoena required.

-   Traditional justice activities may also qualify at supervisor discretion.

-   Personal court matters are unpaid.

A.7 Paid Compassionate Care Leave (Policy 5.7)

-   Up to 10 paid days per year for serious illness/injury of immediate family.

-   Up to 28 weeks (unpaid unless criteria met) within a 52-week period per Canada Labour Code.

-   Requires health care practitioner certificate.

A.8 Paid Educational Leave (Policy 5.8)

-   Up to 10 days per fiscal year for seminars, conferences, etc.

-   Must have completed probation and not be in active discipline.

-   Requires Executive Director approval and written personal statement.

-   Not carried forward, not paid out on termination.

A.9 Paid Cultural Leave (Policy 5.9)

-   Up to 10 paid days per year for permanent/FT/term/probationary employees.

-   Up to 3 paid days per year for seasonal workers.

-   To be used during Spring Hunt (April) and/or Fall Hunt (September).

-   Activities include hunting, trapping, fishing, berry picking, beading.

-   Timing is at the discretion of the Executive Director.

-   Cannot be accumulated or carried over.

A.10 Emergency Escort Leave (Policy 5.10)

-   Up to 5 working days for death or medical emergency (MediVac) in the immediate family.

-   Once per immediate family member per emergency.

-   Not for standard medical appointments.

-   Requires Executive Director approval.

A.11 Legislated Leaves of Absence (Policy 5.11)

Unpaid unless specified. Employees must have at least 3 consecutive months of employment to qualify for any paid portion.

  -------------------------------------- -------------------------------------------------
  **Leave Type**                         **Entitlement**
  Bereavement (Immediate Family)         10 days/year (first 5 paid if eligible)
  Medical                                27 weeks
  Victims of Family Violence             10 days (first 5 paid if eligible)
  Maternity                              17 weeks
  Parental                               63 weeks
  Compassionate Care                     28 weeks (first 10 days paid if eligible)
  Court / Jury Duty                      As long as necessary (first 5 paid if eligible)
  Critical Illness (Child)               37 weeks
  Critical Illness (Adult)               17 weeks
  Crime-Related Disappearance of Child   156 weeks
  Crime-Related Death of Child           156 weeks
  Reservist                              24 months per 5-year period
  Personal                               5 days/year (first 3 paid if eligible)
  Traditional Aboriginal Practices       10 days/year (first 10 paid if eligible)
  -------------------------------------- -------------------------------------------------

-   Maternity, Parental, and Reservist leaves require at least 4 weeks written notice.

-   Notice should state start date, anticipated length, benefits continuation choice, and contact information.

A.12 Unpaid Leave of Absence (Policy 5.12)

-   Employees must first use vacation and any sick leave owed to them.

-   Request must be in writing to supervisor and Executive Director.

-   Approval at sole discretion of Executive Director.

-   Benefits discontinued for unpaid leaves exceeding 1 month unless arranged in advance.

A.13 Political Leave (Policy 5.13)

-   Available to employees standing for nomination or election.

-   Requires prior written permission from Council.

-   Unpaid leave of absence may be required.

10\. Suggested Next Steps

10. Review this PRD (especially Appendix A) and mark up any clauses that differ from current practice.

11. Confirm the leave type list for v1 --- include all 13 categories from the policy, or start with the 5 most-used?

12. Collect the employee roster with start dates so vacation tiers can be calculated correctly.

13. Hand this PRD to Claude Code with an instruction to: (a) scaffold a Next.js + Supabase project, (b) create the schema from Section 6, (c) seed the holiday table from Appendix A.2, (d) implement the policy engine from Appendix A.3--A.13, (e) port the prototype UI, and (f) deploy to Vercel.

14. Run a two-week pilot with the CEO as the only approver and a handful of test employees before full rollout.

Appendix B. AI-Assisted Features (Proposed)

**Status:** Proposed for v1.1 / v2, not part of v1 scope. This appendix is an addition to the original PRD to document the AI-assisted features that will be explored once the deterministic core of v1 is in production.

B.1 Guiding Principles

The KI leave system is already policy-driven: deterministic rules in `policy/rules.ts` and in the Supabase Edge Functions handle the vast majority of decisions without any AI involvement. The purpose of the AI-assisted features described in this appendix is *not* to replace that deterministic engine. It is to help humans --- primarily the CEO as approver --- in the narrow set of cases where the rules alone cannot produce an obviously correct answer.

The following principles govern every AI feature in this appendix:

-   **Advisory, never autonomous on judgment calls.** Claude recommends; a human decides. The system never auto-denies a request on the basis of an AI recommendation. Auto-approvals remain the exclusive domain of the deterministic policy engine (PRD §7, auto-approval rule).

-   **Explainable by construction.** Every AI recommendation must include a plain-English rationale that cites specific clauses of the KI Employee Leaves policy. No black-box decisions.

-   **Audited end-to-end.** Every prompt sent to Claude and every response received is stored in the existing `audit_log` table, linked to the request or decision it informed. Seven-year retention applies (PRD §8).

-   **Server-side only.** All calls to the Claude API are made from Supabase Edge Functions, never from the browser. The API key is stored as a Supabase secret and is never exposed to clients.

-   **Privacy-respecting.** Prompts include only the minimum information needed: request metadata, relevant balances, the specific KI policy clauses under consideration, and (where relevant) the free-text reason the employee provided. No health details, no social-insurance numbers, no information beyond what already exists in the `leave_requests` table.

-   **Cost-bounded.** A monthly ceiling on Claude API spend is configured in the Edge Function. When the ceiling is hit, AI features degrade gracefully: the UI hides AI panels and the app continues to work exactly as it would without them.

-   **Opt-outable.** HR can disable any AI feature globally from a settings page without a code change. This is important for regulatory/audit scenarios and for the two-week pilot.

B.2 Feature Tier 1 --- Highest Value

These are the AI features proposed for v1.1, the first release after the deterministic v1 ships.

B.2.1 Conflict Resolution Advisor

**Problem.** Two or more employees in the same department (or holding the same critical role) request overlapping leave that would leave the team below minimum coverage. The deterministic policy engine can detect the conflict (PRD §7, coverage/conflict detection) but cannot fairly choose which request to recommend approving.

**Feature.** When the approver opens a request that is part of a multi-request conflict, an "AI analysis" panel appears alongside the request. Claude analyzes all overlapping requests and produces a ranked recommendation:

1.  Rank 1 (recommended to approve): {employee} --- {reason}
2.  Rank 2 (recommended to defer): {employee} --- {reason}
3.  Rank 3 (recommended to deny): {employee} --- {reason}

The ranking considers, in roughly this order of weight:

-   **Leave type priority.** Bereavement > Compassionate Care > Cultural > Vacation > Personal. Rooted in KI policy clauses.

-   **Submission order.** First-come fairness baseline.

-   **Year-to-date equity.** Employees who have had fewer approvals this fiscal year are favored to correct imbalances.

-   **External constraints surfaced in the reason text.** Phrases like "non-refundable booking," "wedding," "pre-scheduled medical appointment" are weighted higher than requests with vague or absent reasons.

-   **Seniority.** Tiebreaker only. Never a primary factor --- explicit design choice to avoid entrenching hierarchy in leave fairness.

The panel also produces a draft explanation the approver can send to the employee whose request is recommended for denial, citing the policy clause and the reason for the tiebreak.

**Critical design choice.** The approver sees the recommendation but makes the actual decision. The approve/deny buttons remain the final word. The recommendation and the approver's eventual decision are both logged, which creates a feedback trail for future fairness audits.

**Model.** Claude Sonnet (latest) for reasoning quality on this class of decision.

B.2.2 Denial Explanation Drafter

**Problem.** PRD §1.1 identifies inconsistent policy citations in denials as a root cause of employee complaints. Writing a polite, policy-cited denial takes time and the CEO may skip it under pressure.

**Feature.** When the approver clicks Deny on a request, a modal opens with:

-   A pre-filled plain-English explanation drafted by Claude.

-   Citation of the specific KI policy clause(s) the denial is based on.

-   A tone tuned to the leave type (warmer for bereavement, factual for vacation, firm but empathetic for repeated personal requests).

-   An editable text area --- the approver can accept, edit, or replace the draft entirely.

The draft is generated in under 2 seconds. Clicking Deny without editing still works; the draft is a suggestion.

**Model.** Claude Haiku (latest) --- low latency, low cost, sufficient for structured drafting.

B.2.3 Policy Q&A Chatbot for Employees

**Problem.** Employees repeatedly ask HR the same policy questions ("Can I take cultural leave while probationary?" "Do holidays count against vacation?"). Currently these questions go to email and receive inconsistent answers depending on who replies.

**Feature.** A floating "Ask about leave policy" widget available on every page. Employees type a natural-language question and receive an answer that:

-   Cites the specific clause of the KI Employee Leaves policy (Sections 5.1--5.13) that governs the answer.

-   Refuses to speculate on situations the policy does not cover --- instead routes the employee to HR with a suggested question.

-   Never gives advice on individual edge cases that require CEO judgment. When the question is borderline, the response ends with "This is a judgment call --- please submit a request or email {HR contact} directly."

**Scope control.** The entire KI Employee Leaves policy (~5 pages) fits inside a single Claude prompt. No RAG, no vector database, no embeddings. The policy is injected into the system prompt on every call. When the policy changes, updating a single TypeScript file in `policy/rules.ts` propagates instantly.

**Model.** Claude Haiku (latest). High-volume, low-cost, low-latency.

B.3 Feature Tier 2 --- High Value, Deferred

These features are proposed for v2 or later, after Tier 1 has been evaluated in production.

B.3.1 Anomaly Detection for HR

Weekly digest emailed to HR flagging unusual patterns that may warrant a human check-in:

-   Employees with unusually high sick leave usage relative to their historical baseline.

-   Departments or individuals who have not booked vacation by a policy-defined cutoff (vacation forfeit risk; no carryover per KI policy).

-   Employees approaching balance exhaustion for any leave type.

-   Requests that were auto-approved but are retrospectively worth a human review (e.g. unusual combinations of leave types in a short window).

The digest is generated by Claude Sonnet summarizing the prior week's `leave_requests` and `entitlements` data. HR can click any flag to see the underlying data and contact the employee if appropriate. No automatic action is taken on flags.

B.3.2 Natural-Language Request Entry

Employees type a plain-English sentence like "I need next Monday and Tuesday off to visit my mother" and Claude extracts:

-   Leave type (Personal, in the example)

-   Start and end dates

-   Reason text for the approver

The employee reviews the extracted values in a confirmation dialog and clicks Submit. If Claude cannot confidently extract any field, the dialog falls back to the regular form with the recognized fields pre-filled.

**UX value.** Especially high for employees who find forms intimidating. Offered as an alternative entry point, not a replacement for the form.

B.3.3 Tone-Aware Notifications

When the system sends a notification (approval, denial, reminder), Claude rewrites the boilerplate in a tone appropriate to context:

-   Bereavement approvals: warm, concise, no boilerplate.

-   Vacation approvals: friendly and practical.

-   Denials: factual, citing policy, offering a path forward.

-   Balance-low warnings: proactive and non-alarming.

The rewritten text is shown to the approver for a single-click confirmation before sending, or can be enabled to send automatically once HR has observed the output quality for a pilot period.

B.4 Feature Tier 3 --- Interesting but Speculative

Documented for completeness. Not currently recommended for implementation without further validation.

-   **Year-end narrative report.** Auto-generated annual summary for the CEO covering leave usage patterns, equity statistics, and policy-change suggestions.

-   **"Explain this policy" tooltips.** Any policy reference in the UI is clickable and expands into a plain-English explanation of the clause.

-   **Smart reminder timing.** Claude chooses when to send upcoming-leave reminders based on past employee behavior (e.g. some people want a 1-week heads-up, others want 1-day).

B.5 Features Explicitly Out of Scope

The following are documented as **not** to be built, for the reasons given:

-   **Autonomous AI approval or denial of judgment-call requests.** Creates accountability gaps and liability exposure. All judgment calls remain with a human approver.

-   **Sentiment analysis on free-text reasons.** Surveillance-adjacent; inappropriate for an HR tool at a small workplace.

-   **Predictive coverage forecasting beyond simple conflict detection.** With ~20 employees, the dataset is too small to produce reliable predictions, and false positives would undermine trust in the advisor features that do work.

-   **Voice or SMS-based request submission.** Covered by the PRD's existing "out of scope" list; not reopened here.

-   **Exporting leave data to external LLM APIs other than Anthropic's Claude.** Kept narrow to simplify the privacy review and security audit.

B.6 Architecture Notes

-   **Integration point:** Supabase Edge Functions call the Claude API using the official Anthropic SDK. Functions are invoked from the Next.js app via `supabase.functions.invoke()`.

-   **Model selection:** Claude Haiku (latest) for high-volume, low-stakes features (Q&A chatbot, denial drafter, notification rewrites). Claude Sonnet (latest) for reasoning-heavy features (conflict advisor, anomaly detection digest).

-   **Prompt management:** Every prompt template lives in source control under `supabase/functions/{feature}/prompts.ts`. Version-controlled, reviewable, and unit-testable.

-   **Evaluation:** Each Tier 1 feature ships with a fixed set of golden test cases that run in CI. A change to any prompt template that breaks a golden case blocks the PR.

-   **Cost estimate for KI (~20 employees):** All Tier 1 features combined are projected to cost under CAD $15/month at typical usage, scaling roughly linearly with headcount and request volume.

-   **Kill switch:** A single feature flag in the Edge Function config (`AI_FEATURES_ENABLED`) disables every AI-assisted feature in the app. When flipped off, the UI falls back to the deterministic-only experience with no functional regressions.

B.7 Rollout Plan

1.  **Ship v1 without any AI features.** The deterministic core must work, be audited, and be trusted before AI advisors are layered on.

2.  **Add B.2.3 (Policy Q&A chatbot) first.** Lowest-risk, highest-visibility win for employees. No approval flow involvement, no decision-making.

3.  **Add B.2.2 (Denial Explanation Drafter) second.** Still advisory, human always in the loop, but visible to the approver as a quality-of-life improvement.

4.  **Add B.2.1 (Conflict Resolution Advisor) third, with a pilot period.** Highest-value feature but also the most sensitive, since it touches fairness across employees. Pilot with the CEO for a full fiscal quarter before enabling it for all overlap conflicts.

5.  **Evaluate Tier 2 features** based on feedback from Tier 1 rollout. Add only what clearly earns its keep.

6.  **Revisit Tier 3** at the annual PRD review.

*--- End of Appendix B ---*

*--- End of Document ---*
