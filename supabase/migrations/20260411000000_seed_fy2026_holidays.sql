-- ---------------------------------------------------------------------------
-- Backfill FY 2026/27 holidays into the `holidays` table.
--
-- Context: During Phase 4 edge-case testing on 2026-04-11 we discovered the
-- `holidays` table was empty in production. The 12 FY 2026/27 holidays live
-- only in `supabase/seed/holidays.sql`, which is a SEED file — Supabase
-- auto-applies migrations on `db push` but does not apply seeds. When
-- production was provisioned the seed step was silently skipped.
--
-- Consequence: `policy/engine.ts:businessDaysInRange` excludes weekends and
-- any date present in the `holidays` set when counting business days against
-- a vacation request. With an empty set, every vacation spanning a KI-
-- observed holiday was being charged the full weekday count — violating the
-- policy rule "holidays during vacation do not count against balance"
-- (CLAUDE.md, PRD Appendix A, KI HR manual §5.1).
--
-- Remediation:
--   1. Holidays were seeded manually in prod on 2026-04-11 to stop the bleed.
--   2. This migration backfills the same rows as an append-only durable fix
--      so a fresh environment (new dev machine, future staging, CI) can never
--      be empty again.
--
-- Idempotency: `on conflict (date) do nothing` makes this safe to re-apply.
--   - In prod (already seeded on 2026-04-11): no-op, 12 conflicts skipped.
--   - In a fresh environment: inserts all 12 rows.
--
-- Lesson: system data that must exist in every environment belongs in
-- migrations, not seeds. See tracking issue #18. A separate migration will
-- be added for each future fiscal year until the recurring-rule generator
-- described in PRD §5.2 (year-end rollover) is built.
-- ---------------------------------------------------------------------------

insert into holidays (date, name, type, rule) values
  ('2026-05-29', 'Jeremiah Day',                              'first_nation', 'Last Friday of May'),
  ('2026-06-21', 'National Aboriginal Day',                   'first_nation', 'June 21'),
  ('2026-08-03', 'Civic Holiday',                             'first_nation', 'First Monday in August'),
  ('2026-09-07', 'Labour Day',                                'statutory',    'First Monday in September'),
  ('2026-09-30', 'National Day for Truth and Reconciliation', 'statutory',    'September 30'),
  ('2026-11-11', 'Remembrance Day',                           'statutory',    'November 11'),
  ('2026-12-25', 'Christmas Day',                             'statutory',    'December 25'),
  ('2026-12-26', 'Boxing Day',                                'statutory',    'December 26'),
  ('2027-01-01', 'New Year''s Day',                           'statutory',    'January 1'),
  ('2027-02-15', 'Family Day',                                'provincial',   '3rd Monday in February'),
  ('2027-03-26', 'Good Friday',                               'statutory',    'Friday before Easter'),
  ('2027-03-29', 'Easter Monday',                             'statutory',    'Monday after Easter')
on conflict (date) do nothing;

-- Note: KI recognizes Jeremiah Day, National Aboriginal Day, and Civic Holiday
-- in lieu of Victoria Day, Canada Day, and Thanksgiving Day.
