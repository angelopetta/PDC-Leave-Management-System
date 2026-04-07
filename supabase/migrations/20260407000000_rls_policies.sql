-- RLS policies for PDC-Leave-Management-System.
--
-- The baseline migration enabled RLS on employees, entitlements,
-- leave_requests, and audit_log but intentionally left policies out until
-- auth was wired up. With Supabase Auth now in place (magic links), this
-- migration adds the v1 policies so the app can read through the
-- anon/authenticated role instead of the service_role.
--
-- Mental model (PRD §5, CLAUDE.md):
--   • Every employee is a Supabase auth user linked via
--     employees.auth_user_id.
--   • CEO and Lead Finance Officer (backup approver) are identified by
--     job_title on the employees row. They have org-wide read access to
--     employees, entitlements, leave_requests, and audit_log.
--   • Everyone else can only see their own row / their own requests /
--     their own entitlements.
--   • Writes go through Edge Functions or Server Actions; there are no
--     client-side inserts/updates in v1, so these policies are read-only.
--     The service_role still has full access for admin scripts and the
--     policy engine backend.

-- ---------------------------------------------------------------------------
-- Helper: is the current auth user a CEO or Lead Finance Officer?
-- SECURITY DEFINER so it can read employees without being filtered by the
-- employees policies it is itself supporting (avoids recursion).
-- ---------------------------------------------------------------------------

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from employees where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_approver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from employees
    where auth_user_id = auth.uid()
      and status = 'active'
      and job_title in ('Chief Executive Officer', 'Lead Finance Officer')
  );
$$;

grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.is_approver() to authenticated;

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------

create policy "employees: self read"
  on employees
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy "employees: approvers read all"
  on employees
  for select
  to authenticated
  using (public.is_approver());

-- ---------------------------------------------------------------------------
-- entitlements
-- ---------------------------------------------------------------------------

create policy "entitlements: self read"
  on entitlements
  for select
  to authenticated
  using (employee_id = public.current_employee_id());

create policy "entitlements: approvers read all"
  on entitlements
  for select
  to authenticated
  using (public.is_approver());

-- ---------------------------------------------------------------------------
-- leave_requests
-- ---------------------------------------------------------------------------

create policy "leave_requests: self read"
  on leave_requests
  for select
  to authenticated
  using (employee_id = public.current_employee_id());

create policy "leave_requests: approvers read all"
  on leave_requests
  for select
  to authenticated
  using (public.is_approver());

-- ---------------------------------------------------------------------------
-- audit_log — approvers only. Self-read is deliberately excluded; the
-- employee-facing UI shows request history via leave_requests, not the raw
-- audit log.
-- ---------------------------------------------------------------------------

create policy "audit_log: approvers read"
  on audit_log
  for select
  to authenticated
  using (public.is_approver());

-- ---------------------------------------------------------------------------
-- Reference tables — readable to any authenticated user. These contain no
-- PII and the UI needs them on every page load.
-- ---------------------------------------------------------------------------

alter table leave_types       enable row level security;
alter table holidays          enable row level security;
alter table blackout_periods  enable row level security;
alter table policy_profiles   enable row level security;
alter table entitlement_rules enable row level security;

create policy "leave_types: read" on leave_types
  for select to authenticated using (true);

create policy "holidays: read" on holidays
  for select to authenticated using (true);

create policy "blackout_periods: read" on blackout_periods
  for select to authenticated using (true);

create policy "policy_profiles: read" on policy_profiles
  for select to authenticated using (true);

create policy "entitlement_rules: read" on entitlement_rules
  for select to authenticated using (true);
