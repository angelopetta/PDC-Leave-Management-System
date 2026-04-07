-- Phase 2: submit_leave_request RPC + leave_requests insert policy.
--
-- The TypeScript policy engine in policy/engine.ts runs the deterministic
-- checks server-side and passes a decision to this function. The function
-- performs the insert, the entitlement counter update, and the audit log
-- write atomically inside a single transaction, locking the entitlement
-- row so concurrent submissions can't overdraw a balance.
--
-- SECURITY DEFINER because it needs to write to audit_log (which has
-- strict RLS). We guard against caller spoofing by resolving the employee
-- from auth.uid() inside the function rather than trusting an argument.

-- ---------------------------------------------------------------------------
-- Insert policy for leave_requests — belt-and-suspenders for non-RPC paths
-- ---------------------------------------------------------------------------

create policy "leave_requests: employee can insert own"
  on leave_requests
  for insert
  to authenticated
  with check (employee_id = public.current_employee_id());

-- ---------------------------------------------------------------------------
-- submit_leave_request(...)
-- ---------------------------------------------------------------------------

create or replace function public.submit_leave_request(
  p_leave_type_code text,
  p_start_date      date,
  p_end_date        date,
  p_days            numeric,
  p_reason          text,
  p_auto_approve    boolean
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
  -- 1. Resolve authenticated employee.
  select * into v_employee
  from employees
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;

  if v_employee is null then
    raise exception 'Authenticated user is not an active employee';
  end if;

  -- 2. Resolve leave type (must be v1-visible).
  select id into v_leave_type_id
  from leave_types
  where code = p_leave_type_code
    and is_v1 = true;

  if v_leave_type_id is null then
    raise exception 'Unknown or disabled leave type: %', p_leave_type_code;
  end if;

  -- 3. Basic input sanity. The TS engine should have caught these; this is
  --    defense in depth for any non-app caller path.
  if p_end_date < p_start_date then
    raise exception 'End date must be on or after start date';
  end if;
  if p_days <= 0 then
    raise exception 'Request must be at least 1 day';
  end if;

  -- 4. Fiscal year from start date (April 1 cutoff).
  v_fiscal_year := case
    when extract(month from p_start_date) >= 4
      then extract(year from p_start_date)::integer
    else extract(year from p_start_date)::integer - 1
  end;

  -- 5. Lock and load the entitlement row so concurrent submissions serialize.
  select * into v_entitlement
  from entitlements
  where employee_id   = v_employee.id
    and leave_type_id = v_leave_type_id
    and fiscal_year   = v_fiscal_year
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
    status, submitted_at, auto_approved, reviewed_by, reviewed_at
  ) values (
    v_employee.id, v_leave_type_id, p_start_date, p_end_date, p_days,
    nullif(p_reason, ''),
    v_status, now(), p_auto_approve,
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
      'auto_approved',   p_auto_approve
    )
  );

  return query select v_request_id, v_status;
end;
$$;

grant execute on function public.submit_leave_request(
  text, date, date, numeric, text, boolean
) to authenticated;
