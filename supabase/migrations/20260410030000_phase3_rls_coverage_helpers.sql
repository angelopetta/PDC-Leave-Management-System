-- Phase 3 hotfix: RLS-aware coverage helpers.
--
-- Bug observed after shipping Phase 3
-- ------------------------------------
-- When a non-approver (e.g. James, Finance Officer) submits a leave
-- request from the New Request form, the server action's coverage
-- queries run under the caller's own role. Row-Level Security on
-- `employees` and `leave_requests` restricts non-approvers to only
-- their own row, which poisons the coverage inputs:
--
--   * the headcount query returns 1 instead of the true department
--     headcount (the caller sees only themselves)
--   * the overlapping-leaves query returns 0 rows even when peers
--     have overlapping pending/approved leave
--
-- With a wrong headcount, the engine's max-allowed-off math goes
-- negative (1 - 1 = 0) and `peakWithThis = 0 + 1 = 1 > 0` fires the
-- coverage flag on every non-approver vacation submission. The row
-- is persisted with `recommendation='review'` even though no real
-- conflict exists.
--
-- The double failure also meant non-approvers never got the form's
-- live "heads up" preview for real overlaps, because the overlapping
-- list was always empty from their point of view.
--
-- Fix
-- ---
-- Add two SECURITY DEFINER helpers that bypass RLS and return the
-- canonical data. The engine's inputs come from these rather than
-- from direct table queries under the caller's role.
--
-- The helpers are read-only. No write side. The elevated execution
-- is narrowly scoped: department_info exposes only per-department
-- counts (already available to approvers via RLS, and not sensitive),
-- department_overlapping_leaves exposes dates + names + status for
-- same-department peers, which is exactly what the coverage warning
-- on the form is designed to show employees.

-- ---------------------------------------------------------------------------
-- department_info(p_department_id uuid)
-- ---------------------------------------------------------------------------
-- Returns (name, headcount, min_coverage) for a department. Headcount
-- counts active employees regardless of who is calling.

create or replace function public.department_info(
  p_department_id uuid
)
returns table (
  name         text,
  headcount    integer,
  min_coverage integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.name,
    (select count(*)::integer
       from employees e
      where e.department_id = d.id
        and e.status = 'active'),
    d.min_coverage
  from departments d
  where d.id = p_department_id;
$$;

grant execute on function public.department_info(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- department_overlapping_leaves(...)
-- ---------------------------------------------------------------------------
-- Returns one row per submitted/approved leave in the given department
-- whose date range overlaps [p_start_date, p_end_date]. Optionally
-- excludes a specific employee (the requester themselves) so the
-- caller can do "what if I added this?" math without double-counting.
--
-- Equivalent to the server action's previous direct query on
-- leave_requests joined to employees, but runs under the function
-- owner's role so RLS on leave_requests doesn't filter the result
-- to only the caller's own rows.

create or replace function public.department_overlapping_leaves(
  p_department_id      uuid,
  p_start_date         date,
  p_end_date           date,
  p_exclude_employee_id uuid default null
)
returns table (
  request_id    uuid,
  employee_id   uuid,
  employee_name text,
  start_date    date,
  end_date      date,
  status        leave_request_status
)
language sql
stable
security definer
set search_path = public
as $$
  select
    lr.id,
    lr.employee_id,
    trim(e.first_name || ' ' || e.last_name),
    lr.start_date,
    lr.end_date,
    lr.status
  from leave_requests lr
  join employees e on e.id = lr.employee_id
  where e.department_id = p_department_id
    and lr.status in ('submitted', 'approved')
    and lr.start_date <= p_end_date
    and lr.end_date   >= p_start_date
    and (p_exclude_employee_id is null
         or lr.employee_id <> p_exclude_employee_id);
$$;

grant execute on function public.department_overlapping_leaves(
  uuid, date, date, uuid
) to authenticated;
