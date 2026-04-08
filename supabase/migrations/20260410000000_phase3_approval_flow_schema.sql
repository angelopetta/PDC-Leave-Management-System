-- Phase 3: schema for the approval flow.
--
-- This migration adds the data model the approver inbox needs:
--
--   1. app_settings (singleton row) — holds the auto_approval_mode toggle so
--      HR can graduate from shadow mode to live auto-approval with a single
--      SQL flip, no code change. See PRD §5.1.
--
--   2. departments — normalizes the existing employees.department text
--      column and pins a per-department `min_coverage` so the engine can
--      flag requests that would drop a team below its minimum.
--
--   3. employees.department_id — FK to departments. The legacy text
--      `department` column is left in place so existing queries (Phase 1
--      dashboard, Phase 2 requests page) keep working unchanged.
--
--   4. leave_requests.recommendation — captured at submit time so the
--      inbox can show "Recommended: Approve" badges in shadow mode without
--      re-running the policy engine on every page render.
--
--   5. A starter blackout period (KI Annual Audit Week) so the engine
--      check has something to fire against during smoke testing. HR can
--      replace it from the UI later.
--
-- Append-only: this builds on the Phase 2 leave_requests + RPC and does
-- not modify any existing migration.

-- ---------------------------------------------------------------------------
-- 1. app_settings — singleton key/value row
-- ---------------------------------------------------------------------------
--
-- Modes (PRD §5.1, auto-approval rollout):
--   shadow         — engine recommends, every in-policy request still goes
--                    to the approver inbox with a green "Recommended:
--                    Approve" badge. Default. Lets HR build trust before
--                    flipping the switch.
--   auto_with_fyi  — in-policy requests are auto-approved and the CEO
--                    receives an FYI notification.
--   auto_silent    — in-policy requests are auto-approved silently. Used
--                    only after HR is fully comfortable with the engine.

create table app_settings (
  id                  integer primary key default 1 check (id = 1),
  auto_approval_mode  text not null default 'shadow'
    check (auto_approval_mode in ('shadow', 'auto_with_fyi', 'auto_silent')),
  updated_at          timestamptz not null default now()
);

insert into app_settings (id, auto_approval_mode) values (1, 'shadow');

alter table app_settings enable row level security;

create policy "app_settings: read" on app_settings
  for select to authenticated using (true);

-- Only the service role (admin scripts, future HR settings page going
-- through a SECURITY DEFINER function) may write. No client-side updates.

-- ---------------------------------------------------------------------------
-- 2. departments — normalized + per-team minimum coverage
-- ---------------------------------------------------------------------------

create table departments (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  min_coverage  integer not null default 1 check (min_coverage >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger departments_set_updated_at
  before update on departments
  for each row execute function set_updated_at();

alter table departments enable row level security;

create policy "departments: read" on departments
  for select to authenticated using (true);

-- Backfill from the distinct values currently sitting on employees.
insert into departments (name)
  select distinct department
    from employees
   where department is not null
on conflict (name) do nothing;

-- Per-team minimums. Defaults to 1 — at least one person must remain
-- on the job at all times. Finance is bumped to 2 because James Morin
-- has to be reachable for payroll runs while Robert is the backup
-- approver. HR can edit these from the UI in v1.1.
update departments set min_coverage = 2 where name = 'Finance';

-- ---------------------------------------------------------------------------
-- 3. employees.department_id — FK + backfill
-- ---------------------------------------------------------------------------

alter table employees
  add column department_id uuid references departments(id);

update employees e
   set department_id = d.id
  from departments d
 where e.department = d.name;

create index employees_department_id_idx on employees(department_id);

-- ---------------------------------------------------------------------------
-- 4. leave_requests.recommendation — engine verdict captured at submit time
-- ---------------------------------------------------------------------------
--
-- Values:
--   auto_approve — engine had no blocking or flagging checks
--   review       — engine fired at least one flagging check
--
-- This is what the engine recommended, independent of whether the request
-- was actually auto-approved (which depends on app_settings.auto_approval_mode).
-- Lets the inbox surface "Recommended: Approve" without re-running the
-- engine on every page load, and lets us audit recommendation-vs-decision
-- divergence later.

alter table leave_requests
  add column recommendation text
    check (recommendation in ('auto_approve', 'review'));

-- ---------------------------------------------------------------------------
-- 5. Starter blackout period
-- ---------------------------------------------------------------------------
--
-- Audit week is org-wide; everybody on deck. Demonstrates the org-wide
-- (block) blackout path. Picked the second week of March to land just
-- before fiscal year-end so it's visible during a smoke test of the
-- inbox. HR will replace this from the UI in a later phase.

insert into blackout_periods (start_date, end_date, applies_to, reason)
values
  ('2027-03-08', '2027-03-12', 'all',
   'KI Annual Audit Week — all hands required for finance/operations review.');

-- ---------------------------------------------------------------------------
-- 6. Helper: get_auto_approval_mode()
-- ---------------------------------------------------------------------------

create or replace function public.get_auto_approval_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select auto_approval_mode from app_settings where id = 1;
$$;

grant execute on function public.get_auto_approval_mode() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Helper: department_overlap_peak(department_id, start, end, exclude_id)
-- ---------------------------------------------------------------------------
--
-- Returns the maximum number of distinct department members who would
-- have an overlapping approved-or-submitted leave request on any single
-- weekday inside [start_date, end_date]. Weekends are excluded — they
-- don't affect coverage.
--
-- Pass exclude_request_id when previewing a request that already has a
-- row in leave_requests (e.g. recomputing on the inbox view) to avoid
-- double-counting.
--
-- The TS engine in policy/engine.ts is the primary source of truth for
-- coverage decisions. This function exists so server-side queries and
-- (future) Edge Function callers can compute the same answer without
-- re-implementing the logic.

create or replace function public.department_overlap_peak(
  p_department_id      uuid,
  p_start_date         date,
  p_end_date           date,
  p_exclude_request_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_peak  integer := 0;
  v_d     date;
  v_count integer;
begin
  if p_department_id is null then
    return 0;
  end if;

  v_d := p_start_date;
  while v_d <= p_end_date loop
    -- Skip weekends; they don't count against coverage.
    if extract(dow from v_d) not in (0, 6) then
      select count(distinct lr.employee_id)
        into v_count
        from leave_requests lr
        join employees e on e.id = lr.employee_id
       where e.department_id = p_department_id
         and lr.status in ('approved', 'submitted')
         and (p_exclude_request_id is null
              or lr.id <> p_exclude_request_id)
         and v_d between lr.start_date and lr.end_date;

      if v_count > v_peak then
        v_peak := v_count;
      end if;
    end if;

    v_d := v_d + 1;
  end loop;

  return v_peak;
end;
$$;

grant execute on function public.department_overlap_peak(
  uuid, date, date, uuid
) to authenticated;
