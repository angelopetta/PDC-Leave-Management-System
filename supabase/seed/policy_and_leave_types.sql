-- Seed policy profiles and leave types.
-- Mirrors policy/rules.ts — keep in sync when rules change.
-- Run this BEFORE employees.mock.sql.

-- ---------------------------------------------------------------------------
-- Policy profiles (one per employment-type category in KI policy)
-- ---------------------------------------------------------------------------

insert into policy_profiles (name, employment_type) values
  ('Permanent Full-Time', 'permanent_full_time'),
  ('Term',                'term'),
  ('Probationary',        'probationary'),
  ('Part-Time',           'part_time'),
  ('Seasonal',            'seasonal');

-- ---------------------------------------------------------------------------
-- Leave types — all 13 from KI policy; is_v1 controls UI visibility.
-- ---------------------------------------------------------------------------

insert into leave_types (
  code, name, description, color, eligibility_text,
  requires_attachment, notice_days, max_consecutive_days,
  auto_approvable, is_v1
) values
  -- v1 (5 types)
  ('vacation',           'Vacation',           'Annual paid vacation earned by years of service.',
   '#2563eb',
   'Requires 6 months continuous service. Max 3 consecutive weeks without special approval.',
   false, 7, 15, true, true),

  ('sick',               'Sick Leave',         'Personal illness, injury, medical appointments, or illness of a dependent.',
   '#dc2626',
   'Accrues 1.25 days/month (cap 15/year). Medical certificate required beyond 3 consecutive days.',
   false, 0, null, true, true),

  ('bereavement',        'Bereavement',        'Death of an immediate family member.',
   '#6b7280',
   'Up to 10 days; first 5 paid after 3 months continuous employment. Within 6 weeks of service.',
   false, 0, 10, true, true),

  ('cultural',           'Cultural Leave',     'Traditional activities such as hunting, trapping, fishing, berry picking, beading.',
   '#16a34a',
   'Up to 10 days/year (3 for seasonal). Intended for Spring Hunt (April) and Fall Hunt (September).',
   false, 0, null, true, true),

  ('personal',           'Personal Leave',     'Personal reasons not covered by other leave types.',
   '#9333ea',
   'Up to 5 days/year; first 3 paid after 3 months continuous employment.',
   false, 0, 5, true, true),

  -- v1.1 (hidden from New Request UI until enabled)
  ('court_jury',         'Court / Jury Duty',  'Jury selection, jury duty, or subpoenaed witness attendance.',
   '#0891b2', 'Up to 5 paid days. Jury notice or subpoena required.',
   true, 0, null, false, false),

  ('compassionate_care', 'Compassionate Care', 'Serious illness or injury of an immediate family member.',
   '#be185d', 'Up to 10 paid days/year; up to 28 weeks unpaid in a 52-week window. Medical certificate required.',
   true, 0, null, false, false),

  ('educational',        'Educational Leave',  'Seminars, conferences, or professional development.',
   '#0d9488', 'Up to 10 days/year. Probation must be complete. Requires Executive Director approval.',
   false, 14, 10, false, false),

  ('emergency_escort',   'Emergency Escort',   'Death or medical emergency (MediVac) of an immediate family member.',
   '#ea580c', 'Up to 5 working days per emergency. Requires Executive Director approval.',
   false, 0, 5, false, false),

  ('maternity',          'Maternity Leave',    'Leave for pregnancy and childbirth.',
   '#db2777', 'Up to 17 weeks. Minimum 4 weeks written notice required.',
   false, 28, null, false, false),

  ('parental',           'Parental Leave',     'Leave to care for a newborn or newly adopted child.',
   '#c026d3', 'Up to 63 weeks. Minimum 4 weeks written notice required.',
   false, 28, null, false, false),

  ('unpaid',             'Unpaid Leave',       'Unpaid leave of absence.',
   '#71717a', 'Employee must first exhaust vacation and owed sick leave. Executive Director approval required.',
   false, 0, null, false, false),

  ('political',          'Political Leave',    'Leave to stand for nomination or election.',
   '#334155', 'Requires prior written permission from Council. Typically unpaid.',
   false, 0, null, false, false);
