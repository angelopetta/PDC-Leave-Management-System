-- Phase 3 compat shim: restore the 6-arg submit_leave_request signature.
--
-- Problem this fixes
-- ------------------
-- Migration 20260410010000_phase3_approval_rpcs.sql replaced
-- submit_leave_request with a new 7-arg version that takes
-- p_recommendation, and DROPPED the old 6-arg signature so PostgREST
-- could resolve the new one unambiguously.
--
-- That was fine in isolation but it assumed the deployed frontend
-- would be updated at the same time as the migration. In practice
-- Phase 2 is still running on Vercel (calls the 6-arg version) and
-- Phase 3 isn't merged yet, so production submissions started
-- failing with:
--
--   Could not find the function public.submit_leave_request(
--     p_auto_approve, p_days, p_end_date, p_leave_type_code,
--     p_reason, p_start_date) in the schema cache
--
-- The fix
-- -------
-- Re-create the 6-arg version as a thin wrapper that delegates to
-- the 7-arg version with a synthesized p_recommendation:
--
--   * if the caller asked for auto-approve, we assume the engine
--     cleared everything → recommendation = 'auto_approve'
--   * otherwise it's heading for the inbox → recommendation = 'review'
--
-- This isn't quite as accurate as the Phase 3 client, which runs the
-- new engine checks (blackouts, coverage, mode awareness) before
-- deciding on auto_approve. But it's the correct fallback semantics
-- for Phase 2 callers and it keeps production healthy during the
-- deployment gap. Once Phase 3 is deployed to Vercel the wrapper
-- becomes dormant because the new client always passes 7 args.
--
-- The wrapper's internal call to `submit_leave_request(...)` with
-- seven positional arguments is unambiguously resolved by PostgreSQL
-- to the 7-arg overload — no recursion.

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
begin
  return query
    select * from public.submit_leave_request(
      p_leave_type_code,
      p_start_date,
      p_end_date,
      p_days,
      p_reason,
      p_auto_approve,
      case when p_auto_approve then 'auto_approve'::text
           else 'review'::text
      end
    );
end;
$$;

grant execute on function public.submit_leave_request(
  text, date, date, numeric, text, boolean
) to authenticated;
