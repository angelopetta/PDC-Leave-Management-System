-- Phase 3: approval-flow RPCs.
--
-- Three RPCs in this migration:
--
--   1. submit_leave_request — REPLACED. Adds p_recommendation so the
--      engine's verdict is persisted on the row, and accepts the
--      auto-approval decision from the caller (which now factors in the
--      app_settings.auto_approval_mode flag, not just the engine output).
--
--   2. approve_leave_request — NEW. SECURITY DEFINER. Atomic:
--      lock request → check approver → move days from pending to used →
--      set status='approved' → audit log.
--
--   3. deny_leave_request — NEW. SECURITY DEFINER. Atomic:
--      lock request → check approver → release pending days → set
--      status='denied' → audit log. Requires a non-empty review_notes
--      so the requester always knows why.
--
-- All three are SECURITY DEFINER because they need to write to audit_log,
-- which is locked down to the service role at the table level. The caller
-- identity is resolved from auth.uid() inside each function — never trust
-- a caller-supplied actor id.
--
-- Append-only: this supersedes 20260409010000's submit_leave_request via
-- CREATE OR REPLACE; the older migration is left untouched on disk.

-- ---------------------------------------------------------------------------
-- submit_leave_request — replaced to thread `recommendation` through
-- ---------------------------------------------------------------------------

create or replace function public.submit_leave_request(
  p_leave_type_code text,
  p_start_date      date,
  p_end_date        date,
  p_days            numeric,
  p_reason          text,
  p_auto_approve    boolean,
  p_recommendation  text  -- 'auto_approve' | 'review'
)
returns table (request_id uuid, status leave_request_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee      employees;
  v_leave_type_id uuid;
  v_fiscal_year   integer;
  v_entitlement   entitlements;
  v_remaining     numeric;
  v_request_id    uuid;
  v_status        leave_request_status;
begin
  -- 1. Resolve authenticated employee. Qualify employees.status to avoid
  --    shadowing by the OUT parameter named `status`.
  select * into v_employee
  from employees
  where employees.auth_user_id = auth.uid()
    and employees.status = 'active'
  limit 1;

  if v_employee is null then
    raise exception 'Authenticated user is not an active employee';
  end if;

  -- 2. Resolve leave type (must be v1-visible).
  select id into v_leave_type_id
  from leave_types
  where leave_types.code = p_leave_type_code
    and leave_types.is_v1 = true;

  if v_leave_type_id is null then
    raise exception 'Unknown or disabled leave type: %', p_leave_type_code;
  end if;

  -- 3. Basic input sanity (defense in depth for any non-app caller).
  if p_end_date < p_start_date then
    raise exception 'End date must be on or after start date';
  end if;
  if p_days <= 0 then
    raise exception 'Request must be at least 1 day';
  end if;
  if p_recommendation not in ('auto_approve', 'review') then
    raise exception
      'Invalid recommendation: %, expected auto_approve or review',
      p_recommendation;
  end if;

  -- 4. Fiscal year from start date (April 1 cutoff).
  v_fiscal_year := case
    when extract(month from p_start_date) >= 4
      then extract(year from p_start_date)::integer
    else extract(year from p_start_date)::integer - 1
  end;

  -- 5. Lock and load the entitlement row so concurrent submissions
  --    serialize and can't overdraw a balance.
  select * into v_entitlement
  from entitlements
  where entitlements.employee_id   = v_employee.id
    and entitlements.leave_type_id = v_leave_type_id
    and entitlements.fiscal_year   = v_fiscal_year
  for update;

  if v_entitlement is null then
    raise exception
      'No % entitlement for fiscal year %/% (backfill may be missing)',
      p_leave_type_code, v_fiscal_year, v_fiscal_year + 1;
  end if;

  v_remaining := v_entitlement.granted
               + v_entitlement.earned
               - v_entitlement.used
               - v_entitlement.pending;

  if p_days > v_remaining then
    raise exception
      'Insufficient % balance: % days requested, % remaining',
      p_leave_type_code, p_days, v_remaining;
  end if;

  -- 6. Insert the request.
  v_status := case when p_auto_approve then 'approved'::leave_request_status
                   else 'submitted'::leave_request_status
              end;

  insert into leave_requests (
    employee_id, leave_type_id, start_date, end_date, days, reason,
    status, recommendation, submitted_at, auto_approved,
    reviewed_by, reviewed_at
  ) values (
    v_employee.id, v_leave_type_id, p_start_date, p_end_date, p_days,
    nullif(p_reason, ''),
    v_status, p_recommendation, now(), p_auto_approve,
    case when p_auto_approve then v_employee.id else null end,
    case when p_auto_approve then now() else null end
  )
  returning id into v_request_id;

  -- 7. Update entitlement counters.
  if p_auto_approve then
    update entitlements
    set used = used + p_days, updated_at = now()
    where id = v_entitlement.id;
  else
    update entitlements
    set pending = pending + p_days, updated_at = now()
    where id = v_entitlement.id;
  end if;

  -- 8. Audit log.
  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (
    v_employee.id,
    case when p_auto_approve
      then 'leave_request.auto_approve'
      else 'leave_request.submit'
    end,
    'leave_request',
    v_request_id,
    jsonb_build_object(
      'leave_type_code', p_leave_type_code,
      'start_date',      p_start_date,
      'end_date',        p_end_date,
      'days',            p_days,
      'status',          v_status,
      'auto_approved',   p_auto_approve,
      'recommendation',  p_recommendation
    )
  );

  return query select v_request_id, v_status;
end;
$$;

-- Drop the old 6-arg signature so PostgREST can resolve the new one
-- unambiguously. The function body above defines the 7-arg replacement;
-- without dropping the old, both overloads exist and `supabase.rpc(...)`
-- can become ambiguous.
drop function if exists public.submit_leave_request(
  text, date, date, numeric, text, boolean
);

grant execute on function public.submit_leave_request(
  text, date, date, numeric, text, boolean, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- approve_leave_request
-- ---------------------------------------------------------------------------
--
-- Atomic approve. Locks the request row and the corresponding entitlement
-- row, moves the request's days from pending → used, sets status,
-- timestamps the review, and writes an audit_log entry.
--
-- Coverage and blackout judgment is left to the human approver. The inbox
-- shows them the recommendation, the conflict view, and any policy flags
-- that fired at submit time; if they click Approve anyway, the system
-- trusts the call. Re-running the policy engine here would create a class
-- of "approve fails after the human said yes" bugs that's worse than the
-- problem it solves.

create or replace function public.approve_leave_request(
  p_request_id   uuid,
  p_review_notes text default null
)
returns table (request_id uuid, status leave_request_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       employees;
  v_request     leave_requests;
  v_entitlement entitlements;
  v_fiscal_year integer;
begin
  -- 1. Resolve actor. Must be an active employee with approver role.
  select * into v_actor
    from employees
   where employees.auth_user_id = auth.uid()
     and employees.status = 'active'
   limit 1;

  if v_actor is null then
    raise exception 'Authenticated user is not an active employee';
  end if;

  if not public.is_approver() then
    raise exception 'Only approvers can approve leave requests';
  end if;

  -- 2. Lock the request row. FOR UPDATE prevents two approvers from
  --    racing on the same request.
  select * into v_request
    from leave_requests
   where id = p_request_id
   for update;

  if v_request is null then
    raise exception 'Leave request % not found', p_request_id;
  end if;

  if v_request.status <> 'submitted' then
    raise exception
      'Leave request % is not pending (status = %)',
      p_request_id, v_request.status;
  end if;

  -- 3. Lock the matching entitlement row.
  v_fiscal_year := case
    when extract(month from v_request.start_date) >= 4
      then extract(year from v_request.start_date)::integer
    else extract(year from v_request.start_date)::integer - 1
  end;

  select * into v_entitlement
    from entitlements
   where entitlements.employee_id   = v_request.employee_id
     and entitlements.leave_type_id = v_request.leave_type_id
     and entitlements.fiscal_year   = v_fiscal_year
   for update;

  if v_entitlement is null then
    raise exception
      'No entitlement row for request % (employee=%, fiscal_year=%)',
      p_request_id, v_request.employee_id, v_fiscal_year;
  end if;

  -- 4. Move days from pending to used.
  update entitlements
     set pending    = pending - v_request.days,
         used       = used    + v_request.days,
         updated_at = now()
   where id = v_entitlement.id;

  -- 5. Update the request.
  update leave_requests
     set status       = 'approved',
         reviewed_by  = v_actor.id,
         reviewed_at  = now(),
         review_notes = nullif(p_review_notes, ''),
         updated_at   = now()
   where id = v_request.id;

  -- 6. Audit log.
  insert into audit_log (
    actor_id, action, entity_type, entity_id, before, after
  ) values (
    v_actor.id,
    'leave_request.approve',
    'leave_request',
    v_request.id,
    jsonb_build_object(
      'status',         v_request.status,
      'recommendation', v_request.recommendation
    ),
    jsonb_build_object(
      'status',         'approved',
      'days',           v_request.days,
      'reviewed_by',    v_actor.id,
      'review_notes',   nullif(p_review_notes, '')
    )
  );

  return query select v_request.id, 'approved'::leave_request_status;
end;
$$;

grant execute on function public.approve_leave_request(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- deny_leave_request
-- ---------------------------------------------------------------------------
--
-- Atomic deny. Releases the pending days back to the balance (since the
-- request never converted them to `used`), sets status, and requires a
-- non-empty review_notes — denials without a reason are a UX failure
-- that creates real disputes.

create or replace function public.deny_leave_request(
  p_request_id   uuid,
  p_review_notes text
)
returns table (request_id uuid, status leave_request_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       employees;
  v_request     leave_requests;
  v_entitlement entitlements;
  v_fiscal_year integer;
begin
  if p_review_notes is null or length(trim(p_review_notes)) = 0 then
    raise exception 'A reason is required when denying a leave request';
  end if;

  -- 1. Resolve actor.
  select * into v_actor
    from employees
   where employees.auth_user_id = auth.uid()
     and employees.status = 'active'
   limit 1;

  if v_actor is null then
    raise exception 'Authenticated user is not an active employee';
  end if;

  if not public.is_approver() then
    raise exception 'Only approvers can deny leave requests';
  end if;

  -- 2. Lock request.
  select * into v_request
    from leave_requests
   where id = p_request_id
   for update;

  if v_request is null then
    raise exception 'Leave request % not found', p_request_id;
  end if;

  if v_request.status <> 'submitted' then
    raise exception
      'Leave request % is not pending (status = %)',
      p_request_id, v_request.status;
  end if;

  -- 3. Lock entitlement and release pending days.
  v_fiscal_year := case
    when extract(month from v_request.start_date) >= 4
      then extract(year from v_request.start_date)::integer
    else extract(year from v_request.start_date)::integer - 1
  end;

  select * into v_entitlement
    from entitlements
   where entitlements.employee_id   = v_request.employee_id
     and entitlements.leave_type_id = v_request.leave_type_id
     and entitlements.fiscal_year   = v_fiscal_year
   for update;

  if v_entitlement is not null then
    update entitlements
       set pending    = greatest(0, pending - v_request.days),
           updated_at = now()
     where id = v_entitlement.id;
  end if;

  -- 4. Update the request.
  update leave_requests
     set status       = 'denied',
         reviewed_by  = v_actor.id,
         reviewed_at  = now(),
         review_notes = trim(p_review_notes),
         updated_at   = now()
   where id = v_request.id;

  -- 5. Audit log.
  insert into audit_log (
    actor_id, action, entity_type, entity_id, before, after
  ) values (
    v_actor.id,
    'leave_request.deny',
    'leave_request',
    v_request.id,
    jsonb_build_object(
      'status',         v_request.status,
      'recommendation', v_request.recommendation
    ),
    jsonb_build_object(
      'status',       'denied',
      'days',         v_request.days,
      'reviewed_by',  v_actor.id,
      'review_notes', trim(p_review_notes)
    )
  );

  return query select v_request.id, 'denied'::leave_request_status;
end;
$$;

grant execute on function public.deny_leave_request(uuid, text)
  to authenticated;
