# Architecture

## Overview

PDC-Leave-Management-System is a policy-driven leave management web app for
KI (~20 employees). The authoritative spec is `docs/PRD.md`; this document
describes *how* we build it.

## Stack

| Layer     | Choice                                             |
|-----------|----------------------------------------------------|
| Frontend  | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui |
| Backend   | Supabase (Postgres + Auth + RLS + Storage + Edge Functions) |
| Hosting   | Vercel (Next.js), Supabase-managed (Postgres/Auth) |
| Email     | Resend, triggered from Edge Functions              |
| CI/CD     | Vercel previews on every PR; Supabase migrations via `supabase db push` |

## Repository layout

```
app/                     Next.js application
  (routes)               App Router pages
  components/            Shared UI (shadcn/ui-based)
  lib/                   Supabase client, server helpers
  policy/                Thin wrapper that re-exports ../policy/rules.ts
docs/
  PRD.md                 Product requirements + Appendix A (policy)
  architecture.md        This file
policy/
  rules.ts               Encoded KI leave policy — SINGLE SOURCE OF TRUTH
  README.md
supabase/
  migrations/            Append-only SQL migrations
  functions/             Edge Functions (policy engine server mirror, email)
  seed/
    holidays.sql         11 KI-observed holidays
    employees.mock.sql   Mock roster (16 employees)
fixtures/
  KI-Employee-Roster-Mock.xlsx
```

## Data model

See `supabase/migrations/20260406000000_initial_schema.sql` for the canonical
schema. Tables map 1:1 to PRD §6:

- `policy_profiles` — one per employment-type category
- `leave_types` — master list of all 13 categories (`is_v1` flag controls UI visibility)
- `entitlement_rules` — per (profile, leave_type) accrual rules + vacation tiers
- `employees` — roster, linked to `auth.users` via `auth_user_id`
- `entitlements` — materialized per (employee, leave_type, fiscal_year)
- `leave_requests` — every request with status + audit fields
- `holidays` — the 11 KI-observed holidays
- `blackout_periods`
- `audit_log` — immutable, every mutation

## Policy engine

**Principle:** `policy/rules.ts` is the single source of truth. Both the
Next.js app (for UX) and Supabase Edge Functions (for server-side enforcement)
import from it. The client validates for fast feedback; the server
re-validates so the client cannot be bypassed.

**Validation pipeline** (runs on request submit):

1. Leave type valid for employee's policy profile?
2. Sufficient balance (granted + earned − used − pending)?
3. Minimum service requirement met? (e.g. 6 months for vacation)
4. Notice period met? (e.g. ≥7 days for vacation, ≥4 weeks for maternity)
5. Business-day count correct? (excluding weekends + 11 KI holidays)
6. Conflicts with blackout periods?
7. Requires supporting documentation?
8. Exceeds auto-approve thresholds? (>3 consecutive weeks vacation → CEO review)

On any failure, the response includes the exact KI policy clause reference
so the UI can surface it inline.

## Auto-approval

A request auto-approves when: within balance, past the notice period, no
blackout conflict, no attachment required, under max consecutive days. The
CEO receives an FYI email rather than an approval request.

Everything else routes to the CEO (or Lead Finance Officer if the CEO is
currently on an approved leave).

## Authentication & authorization

- Supabase Auth with email/password + magic link
- Each `employees` row links to one `auth.users` row via `auth_user_id`
- RLS policies:
  - Employees see only their own `employees`, `entitlements`, `leave_requests`
  - Managers additionally see rows for their direct reports
  - `hr_admin` (CEO) sees all rows
  - `service_role` (Edge Functions) bypasses RLS for engine operations
- Policy-table RLS is defined in a follow-up migration once the auth↔employees
  wiring is finalized.

## Fiscal year & accruals

- FY runs April 1 → March 31; first rollout year is FY 2026/27.
- A scheduled Edge Function runs nightly:
  - Monthly sick credit (1.25 days) when threshold met
  - Annual rollover on April 1: zero out non-carryover balances, grant new
    vacation entitlement based on current years-of-service tier
  - Anniversary bumps when an employee crosses a vacation tier boundary

## Notifications

- Transactional email via Resend, called from Edge Functions
- Triggers: submission, approval, denial, upcoming-leave reminder, low-balance
- Weekly digest to CEO of pending requests and policy exceptions

## Deployment

- `main` → production Vercel deployment + production Supabase project
- Feature branches → Vercel preview + shared staging Supabase
- Migrations applied via `supabase db push` in CI before frontend deploy

## Testing

- **Unit:** `policy/rules.ts` helpers (vacation tier lookup, day counting, etc.)
- **Integration:** Edge Function policy engine against a local Supabase
- **E2E:** Playwright against a seeded preview environment

## Out of scope (v1)

- Full HRIS or payroll integration
- Time-and-attendance beyond leave
- Native mobile apps
- The 8 non-v1 leave types (encoded in `policy/rules.ts`, exposed in v1.1)
