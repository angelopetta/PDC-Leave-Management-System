-- Phase 3.1: cancel + admin override RPCs.
--
-- Two new RPCs:
--
--   1. cancel_leave_request — lets the requester cancel their own
--      pending or approved request. Pending cancels release `pending`
--      days; approved cancels refund `used` days. Both set status to
--      'cancelled'. A reason is required for cancelling approved
--      requests (it affects scheduling).
--
--   2. override_leave_request — lets an approver reverse a previous
--      decision. Approved → cancelled (refunds `used`), denied →
--      submitted (re-pends days, puts request back in inbox). A
--      reason is always required and is recorded in review_notes.
--
-- Both are SECURITY DEFINER for audit_log access. Both lock the
-- request + entitlement rows for atomicity.

-- ---------------------------------------------------------------------------
-- cancel_leave_request
-- ---------------------------------------------------------------------------
--
-- The employee who submitted the request can cancel it. Works on both
-- 'submitted' (pending) and 'approved' statuses. Cannot cancel an
-- already-denied or already-cancelled request.

create or replace function public.cancel_leave_request(
  p_request_id   uuid,
  p_reason        text default null
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
  -- 1. Resolve the authenticated employee.
  select * into v_actor
    from employees
   where employees.auth_user_id = auth.uid()
     and employees.status = 'active'
   limit 1;

  if v_actor is null then
    raise exception 'Authenticated user is not an active employee';
  end if;

  -- 2. Lock the request row.
  select * into v_request
    from leave_requests
   where id = p_request_id
   for update;

  if v_request is null then
    raise exception 'Leave request % not found', p_request_id;
  end if;

  -- Only the requester themselves can cancel.
  if v_request.employee_id <> v_actor.id then
    raise exception 'You can only cancel your own leave requests';
  end if;

  if v_request.status not in ('submitted', 'approved') then
    raise exception
      'Leave request % cannot be cancelled (status = %)',
      p_request_id, v_request.status;
  end if;

  -- Cancelling an approved request affects scheduling; require a reason.
  if v_request.status = 'approved' and
     (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception
      'A reason is required when cancelling an approved request';
  end if;

  -- 3. Lock and adjust entitlement counters.
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
    if v_request.status = 'submitted' then
      -- Release pending days.
      update entitlements
         set pending    = greatest(0, pending - v_request.days),
             updated_at = now()
       where id = v_entitlement.id;
    elsif v_request.status = 'approved' then
      -- Refund used days.
      update entitlements
         set used       = greatest(0, used - v_request.days),
             updated_at = now()
       where id = v_entitlement.id;
    end if;
  end if;

  -- 4. Update the request.
  update leave_requests
     set status       = 'cancelled',
         review_notes = coalesce(
           nullif(trim(p_reason), ''),
           case when v_request.status = 'approved'
                then null  -- should not reach here (we require it above)
                else 'Cancelled by employee'
           end
         ),
         updated_at   = now()
   where id = v_request.id;

  -- 5. Audit log.
  insert into audit_log (
    actor_id, action, entity_type, entity_id, before, after
  ) values (
    v_actor.id,
    'leave_request.cancel',
    'leave_request',
    v_request.id,
    jsonb_build_object(
      'status', v_request.status,
      'days',   v_request.days
    ),
    jsonb_build_object(
      'status',  'cancelled',
      'reason',  coalesce(nullif(trim(p_reason), ''), 'Cancelled by employee'),
      'was',     v_request.status
    )
  );

  return query select v_request.id, 'cancelled'::leave_request_status;
end;
$$;

grant execute on function public.cancel_leave_request(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- override_leave_request
-- ---------------------------------------------------------------------------
--
-- An approver can reverse a previous decision:
--
--   approved → cancelled   (refunds `used` days, frees the schedule)
--   denied   → submitted   (re-pends the days, puts the request back
--                           in the inbox for a fresh decision)
--
-- A reason is always required. It replaces review_notes so both the
-- original decision and the override are visible in the audit log.

create or replace function public.override_leave_request(
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
  v_new_status  leave_request_status;
begin
  if p_review_notes is null or length(trim(p_review_notes)) = 0 then
    raise exception 'A reason is required when overriding a leave request';
  end if;

  -- 1. Resolve actor. Must be an approver.
  select * into v_actor
    from employees
   where employees.auth_user_id = auth.uid()
     and employees.status = 'active'
   limit 1;

  if v_actor is null then
    raise exception 'Authenticated user is not an active employee';
  end if;

  if not public.is_approver() then
    raise exception 'Only approvers can override leave requests';
  end if;

  -- 2. Lock the request row.
  select * into v_request
    from leave_requests
   where id = p_request_id
   for update;

  if v_request is null then
    raise exception 'Leave request % not found', p_request_id;
  end if;

  if v_request.status not in ('approved', 'denied') then
    raise exception
      'Only approved or denied requests can be overridden (status = %)',
      v_request.status;
  end if;

  -- 3. Lock the entitlement row.
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

  -- 4. Adjust counters based on the transition.
  if v_request.status = 'approved' then
    -- Approved → cancelled: refund used days.
    v_new_status := 'cancelled';
    if v_entitlement is not null then
      update entitlements
         set used       = greatest(0, used - v_request.days),
             updated_at = now()
       where id = v_entitlement.id;
    end if;

  elsif v_request.status = 'denied' then
    -- Denied → submitted: re-pend the days so the request goes back
    -- to the inbox for a fresh decision.
    v_new_status := 'submitted';
    if v_entitlement is not null then
      update entitlements
         set pending    = pending + v_request.days,
             updated_at = now()
       where id = v_entitlement.id;
    end if;
  end if;

  -- 5. Update the request.
  update leave_requests
     set status       = v_new_status,
         reviewed_by  = v_actor.id,
         reviewed_at  = now(),
         review_notes = trim(p_review_notes),
         updated_at   = now()
   where id = v_request.id;

  -- 6. Audit log.
  insert into audit_log (
    actor_id, action, entity_type, entity_id, before, after
  ) values (
    v_actor.id,
    'leave_request.override',
    'leave_request',
    v_request.id,
    jsonb_build_object(
      'status',       v_request.status,
      'days',         v_request.days,
      'reviewed_by',  v_request.reviewed_by,
      'review_notes', v_request.review_notes
    ),
    jsonb_build_object(
      'status',       v_new_status,
      'days',         v_request.days,
      'reviewed_by',  v_actor.id,
      'review_notes', trim(p_review_notes)
    )
  );

  return query select v_request.id, v_new_status;
end;
$$;

grant execute on function public.override_leave_request(uuid, text)
  to authenticated;
