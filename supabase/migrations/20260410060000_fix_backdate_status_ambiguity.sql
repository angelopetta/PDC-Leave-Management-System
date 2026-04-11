-- Fix: qualify employees.status in backdate_leave_request to avoid
-- ambiguity with the OUT parameter also named `status`.
-- Same class of bug as 20260409010000 (submit_leave_request).

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

  if not exists (
    select 1 from employees where employees.id = p_employee_id and employees.status = 'active'
  ) then
    raise exception 'Employee % not found or not active', p_employee_id;
  end if;

  select id into v_leave_type_id
    from leave_types
   where leave_types.code = p_leave_type_code;

  if v_leave_type_id is null then
    raise exception 'Unknown leave type: %', p_leave_type_code;
  end if;

  v_fiscal_year := case
    when extract(month from p_start_date) >= 4
      then extract(year from p_start_date)::integer
    else extract(year from p_start_date)::integer - 1
  end;

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

  update entitlements
     set used       = used + p_days,
         updated_at = now()
   where id = v_entitlement.id;

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
