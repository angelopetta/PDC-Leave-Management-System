-- Admin tools: balance adjustment + backdate leave entry.
--
-- Two RPCs for launch-day data capture and ongoing reconciliation:
--
--   1. adjust_entitlement — approver directly sets the granted and/or
--      used counters on an employee's entitlement row. For reconciling
--      leave processed outside the system. Computes deltas, updates
--      the row, and writes a detailed audit entry.
--
--   2. backdate_leave_request — approver creates an already-approved
--      leave request for a past date range, skipping all engine checks
--      (notice, min service, blackout, coverage). For recording leave
--      that was booked before the system went live. Inserts the
--      request, increments `used`, and writes an audit entry.
--
-- Both are SECURITY DEFINER and require is_approver(). Both lock
-- the entitlement row for atomicity.

-- ---------------------------------------------------------------------------
-- adjust_entitlement
-- ---------------------------------------------------------------------------

create or replace function public.adjust_entitlement(
  p_employee_id      uuid,
  p_leave_type_code  text,
  p_fiscal_year      integer,
  p_new_granted      numeric default null,
  p_new_used         numeric default null,
  p_reason           text    default null
)
returns table (
  entitlement_id uuid,
  granted        numeric,
  used           numeric,
  pending        numeric,
  remaining      numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor         employees;
  v_leave_type_id uuid;
  v_entitlement   entitlements;
  v_old_granted   numeric;
  v_old_used      numeric;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required when adjusting entitlements';
  end if;

  if p_new_granted is null and p_new_used is null then
    raise exception 'At least one of granted or used must be provided';
  end if;

  -- 1. Resolve actor (must be approver).
  select * into v_actor
    from employees
   where employees.auth_user_id = auth.uid()
     and employees.status = 'active'
   limit 1;

  if v_actor is null then
    raise exception 'Authenticated user is not an active employee';
  end if;

  if not public.is_approver() then
    raise exception 'Only approvers can adjust entitlements';
  end if;

  -- 2. Resolve leave type.
  select id into v_leave_type_id
    from leave_types
   where code = p_leave_type_code;

  if v_leave_type_id is null then
    raise exception 'Unknown leave type: %', p_leave_type_code;
  end if;

  -- 3. Lock the entitlement row.
  select * into v_entitlement
    from entitlements
   where entitlements.employee_id   = p_employee_id
     and entitlements.leave_type_id = v_leave_type_id
     and entitlements.fiscal_year   = p_fiscal_year
   for update;

  if v_entitlement is null then
    raise exception
      'No % entitlement for employee % in FY %/%',
      p_leave_type_code, p_employee_id, p_fiscal_year, p_fiscal_year + 1;
  end if;

  v_old_granted := v_entitlement.granted;
  v_old_used    := v_entitlement.used;

  -- 4. Apply the adjustment.
  update entitlements
     set granted    = coalesce(p_new_granted, entitlements.granted),
         used       = coalesce(p_new_used, entitlements.used),
         updated_at = now()
   where id = v_entitlement.id;

  -- 5. Audit log.
  insert into audit_log (
    actor_id, action, entity_type, entity_id, before, after
  ) values (
    v_actor.id,
    'entitlement.adjust',
    'entitlement',
    v_entitlement.id,
    jsonb_build_object(
      'granted', v_old_granted,
      'used',    v_old_used
    ),
    jsonb_build_object(
      'granted',      coalesce(p_new_granted, v_old_granted),
      'used',         coalesce(p_new_used, v_old_used),
      'reason',       trim(p_reason),
      'adjusted_by',  v_actor.id
    )
  );

  return query
    select e.id, e.granted, e.used, e.pending, e.remaining
      from entitlements e
     where e.id = v_entitlement.id;
end;
$$;

grant execute on function public.adjust_entitlement(
  uuid, text, integer, numeric, numeric, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- backdate_leave_request
-- ---------------------------------------------------------------------------
--
-- Creates an already-approved leave request for a past date range.
-- Skips all policy engine checks because these are historical facts,
-- not new requests. Increments `used` on the entitlement immediately.
--
-- The approver specifies the employee (by employee_id), leave type,
-- dates, business days, and a reason. The function inserts a row with
-- status='approved', auto_approved=false, recommendation=null, and
-- reviewed_by = the actor. This distinguishes backdated entries from
-- engine-processed ones in the audit trail.

create or replace function public.backdate_leave_request(
  p_employee_id      uuid,
  p_leave_type_code  text,
  p_start_date       date,
  p_end_date         date,
  p_days             numeric,
  p_reason           text
)
returns table (request_id uuid, status leave_request_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor         employees;
  v_leave_type_id uuid;
  v_fiscal_year   integer;
  v_entitlement   entitlements;
  v_request_id    uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required when backdating a leave request';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date must be on or after start date';
  end if;

  if p_days <= 0 then
    raise exception 'Days must be at least 1';
  end if;

  -- 1. Resolve actor (must be approver).
  select * into v_actor
    from employees
   where employees.auth_user_id = auth.uid()
     and employees.status = 'active'
   limit 1;

  if v_actor is null then
    raise exception 'Authenticated user is not an active employee';
  end if;

  if not public.is_approver() then
    raise exception 'Only approvers can backdate leave requests';
  end if;

  -- 2. Verify the target employee exists and is active.
  if not exists (
    select 1 from employees where id = p_employee_id and status = 'active'
  ) then
    raise exception 'Employee % not found or not active', p_employee_id;
  end if;

  -- 3. Resolve leave type.
  select id into v_leave_type_id
    from leave_types
   where code = p_leave_type_code;

  if v_leave_type_id is null then
    raise exception 'Unknown leave type: %', p_leave_type_code;
  end if;

  -- 4. Fiscal year from start date.
  v_fiscal_year := case
    when extract(month from p_start_date) >= 4
      then extract(year from p_start_date)::integer
    else extract(year from p_start_date)::integer - 1
  end;

  -- 5. Lock and update entitlement.
  select * into v_entitlement
    from entitlements
   where entitlements.employee_id   = p_employee_id
     and entitlements.leave_type_id = v_leave_type_id
     and entitlements.fiscal_year   = v_fiscal_year
   for update;

  if v_entitlement is null then
    raise exception
      'No % entitlement for employee in FY %/%. Backfill may be missing.',
      p_leave_type_code, v_fiscal_year, v_fiscal_year + 1;
  end if;

  -- 6. Insert the backdated request as already-approved.
  insert into leave_requests (
    employee_id, leave_type_id, start_date, end_date, days, reason,
    status, submitted_at, auto_approved, reviewed_by, reviewed_at,
    review_notes
  ) values (
    p_employee_id, v_leave_type_id, p_start_date, p_end_date, p_days,
    'Backdated: ' || trim(p_reason),
    'approved', now(), false,
    v_actor.id, now(),
    'Backdated entry by ' || v_actor.first_name || ' ' || v_actor.last_name
  )
  returning id into v_request_id;

  -- 7. Increment used (not pending — this is already approved).
  update entitlements
     set used       = used + p_days,
         updated_at = now()
   where id = v_entitlement.id;

  -- 8. Audit log.
  insert into audit_log (
    actor_id, action, entity_type, entity_id, after
  ) values (
    v_actor.id,
    'leave_request.backdate',
    'leave_request',
    v_request_id,
    jsonb_build_object(
      'employee_id',    p_employee_id,
      'leave_type_code', p_leave_type_code,
      'start_date',     p_start_date,
      'end_date',       p_end_date,
      'days',           p_days,
      'reason',         trim(p_reason),
      'backdated_by',   v_actor.id
    )
  );

  return query select v_request_id, 'approved'::leave_request_status;
end;
$$;

grant execute on function public.backdate_leave_request(
  uuid, text, date, date, numeric, text
) to authenticated;
