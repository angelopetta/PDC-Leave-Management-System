-- Phase 1: backfill entitlements for FY 2026/27 (April 2026 → March 2027).
--
-- This migration:
--   1. Ensures the 5 v1 leave types exist (idempotent — no-op if already
--      seeded from supabase/seed/policy_and_leave_types.sql).
--   2. Adds two SQL helper functions (years_of_service, vacation_tier_days)
--      that mirror policy/rules.ts so server-side queries can reason about
--      vacation tiers without round-tripping through the app.
--   3. Inserts one entitlements row per active employee × v1 leave type for
--      fiscal year 2026, with `granted` populated from policy.
--
-- Idempotent: re-running this is safe. ON CONFLICT clauses prevent duplicate
-- inserts and never overwrite `used` / `pending` from real data.
--
-- See policy/rules.ts for the source of truth on entitlement values. If a
-- value here drifts from rules.ts, rules.ts wins.

-- ---------------------------------------------------------------------------
-- 1. Ensure v1 leave types exist
-- ---------------------------------------------------------------------------

insert into leave_types (
  code, name, description, color, eligibility_text,
  requires_attachment, notice_days, max_consecutive_days,
  auto_approvable, is_v1
) values
  ('vacation',    'Vacation',       'Annual paid vacation earned by years of service.',
   '#2563eb',
   'Requires 6 months continuous service. Max 3 consecutive weeks without special approval.',
   false, 7, 15, true, true),

  ('sick',        'Sick Leave',     'Personal illness, injury, medical appointments, or illness of a dependent.',
   '#dc2626',
   'Accrues 1.25 days/month (cap 15/year). Medical certificate required beyond 3 consecutive days.',
   false, 0, null, true, true),

  ('bereavement', 'Bereavement',    'Death of an immediate family member.',
   '#6b7280',
   'Up to 10 days; first 5 paid after 3 months continuous employment. Within 6 weeks of service.',
   false, 0, 10, true, true),

  ('cultural',    'Cultural Leave', 'Traditional activities such as hunting, trapping, fishing, berry picking, beading.',
   '#16a34a',
   'Up to 10 days/year (3 for seasonal). Intended for Spring Hunt (April) and Fall Hunt (September).',
   false, 0, null, true, true),

  ('personal',    'Personal Leave', 'Personal reasons not covered by other leave types.',
   '#9333ea',
   'Up to 5 days/year; first 3 paid after 3 months continuous employment.',
   false, 0, 5, true, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Helper functions mirroring policy/rules.ts
-- ---------------------------------------------------------------------------

-- Years of continuous service as of a reference date.
create or replace function public.years_of_service(hire_date date, as_of date)
returns integer
language sql
immutable
as $$
  select greatest(0, extract(year from age(as_of, hire_date))::int);
$$;

-- Vacation tier (annual days granted) based on years of service.
-- Mirrors VACATION_TIERS in policy/rules.ts. Keep these in sync.
create or replace function public.vacation_tier_days(years integer)
returns numeric
language sql
immutable
as $$
  select case
    when years <= 3  then 10
    when years <= 10 then 15
    when years <= 15 then 20
    when years <= 20 then 25
    else 30
  end::numeric;
$$;

grant execute on function public.years_of_service(date, date) to authenticated;
grant execute on function public.vacation_tier_days(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill entitlements for FY 2026 (April 2026 → March 2027)
-- ---------------------------------------------------------------------------

insert into entitlements (employee_id, leave_type_id, fiscal_year, granted)
select
  e.id,
  lt.id,
  2026,
  case lt.code
    when 'vacation' then
      case
        -- Term employees receive vacation pay per pay period; no day accrual.
        when e.employment_type = 'term' then 0
        else public.vacation_tier_days(
          public.years_of_service(e.hire_date, date '2026-04-01')
        )
      end
    when 'sick' then 15
    when 'bereavement' then 5
    when 'cultural' then
      case when e.employment_type = 'seasonal' then 3 else 10 end
    when 'personal' then 5
    else 0
  end
from employees e
cross join leave_types lt
where e.status = 'active'
  and lt.is_v1 = true
on conflict (employee_id, leave_type_id, fiscal_year) do nothing;
