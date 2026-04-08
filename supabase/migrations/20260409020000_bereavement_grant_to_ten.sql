-- Bereavement: bump the granted balance from 5 to 10 days.
--
-- Context: KI policy 5.5 (PRD Appendix A.5) describes bereavement as a
-- per-event allowance of up to 10 days, with the first 5 of those days
-- paid for employees with at least 3 months of continuous service.
-- Because our entitlements table is modeled per-year rather than
-- per-event, Phase 1's backfill collapsed that into an annual number
-- and picked the paid portion (5). That made the Dashboard show
-- "5 days" while the Phase 2 policy engine's max-per-event check used
-- 10 (mirroring BEREAVEMENT_RULES.maxDaysPerEvent in policy/rules.ts),
-- so the balance check always blocked before the engine check could
-- run — internally inconsistent, and users couldn't submit the full
-- 10 days the policy actually permits.
--
-- This migration makes the app internally consistent by granting the
-- full 10 days per fiscal year. The paid/unpaid split is not yet
-- tracked anywhere in the v1 UI; it's a known limitation documented
-- in the PRD and will be addressed when bereavement is re-architected
-- as a per-event allowance in a later phase.

update entitlements
set granted    = 10,
    updated_at = now()
where leave_type_id = (select id from leave_types where code = 'bereavement')
  and fiscal_year   = 2026
  and granted       = 5;
