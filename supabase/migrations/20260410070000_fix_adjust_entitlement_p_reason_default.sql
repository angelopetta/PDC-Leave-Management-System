-- Fix: add `default null` to p_reason on adjust_entitlement.
--
-- Why this exists as a separate migration
-- ----------------------------------------
-- The original 20260410050000_admin_adjust_and_backdate.sql migration
-- declared adjust_entitlement with `p_reason text` (no default), which
-- meant callers had to pass every parameter positionally. That made it
-- awkward to invoke from supabase-js without nulling every preceding
-- default. A hotfix was applied directly to the production DB to add
-- `default null` to p_reason, and for a time the original migration
-- file was edited in place (in PR #15) to match.
--
-- CLAUDE.md / project conventions treat committed migrations as
-- append-only — editing one after it has been applied violates that
-- contract even when the change is behavior-neutral. This migration
-- re-establishes the rule: 20260410050000 has been reverted to its
-- original committed form, and the `default null` is now applied
-- append-only via the CREATE OR REPLACE below.
--
-- Effect against the live DB: zero. The function already runs with
-- `p_reason text default null` after the hotfix, so `create or replace`
-- with the same body just rewrites the same function in place.

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
