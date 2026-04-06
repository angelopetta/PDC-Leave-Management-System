-- KI-observed holidays (PRD Appendix A.2 / KI policy 5.1).
-- Offices are closed on these days. Holidays that fall during an employee's
-- vacation are NOT counted against their vacation balance.
--
-- Dates below are for FY 2026/27 (April 1, 2026 – March 31, 2027).
-- The `rule` column captures the recurring rule in human-readable form so a
-- future job can generate subsequent fiscal years.

insert into holidays (date, name, type, rule) values
  ('2026-05-29', 'Jeremiah Day',                                'first_nation', 'Last Friday of May'),
  ('2026-06-21', 'National Aboriginal Day',                     'first_nation', 'June 21'),
  ('2026-08-03', 'Civic Holiday',                               'first_nation', 'First Monday in August'),
  ('2026-09-07', 'Labour Day',                                  'statutory',    'First Monday in September'),
  ('2026-09-30', 'National Day for Truth and Reconciliation',   'statutory',    'September 30'),
  ('2026-11-11', 'Remembrance Day',                             'statutory',    'November 11'),
  ('2026-12-25', 'Christmas Day',                               'statutory',    'December 25'),
  ('2026-12-26', 'Boxing Day',                                  'statutory',    'December 26'),
  ('2027-01-01', 'New Year''s Day',                             'statutory',    'January 1'),
  ('2027-02-15', 'Family Day',                                  'provincial',   '3rd Monday in February'),
  ('2027-03-26', 'Good Friday',                                 'statutory',    'Friday before Easter'),
  ('2027-03-29', 'Easter Monday',                               'statutory',    'Monday after Easter');

-- Note: KI recognizes Jeremiah Day, National Aboriginal Day, and Civic Holiday
-- in lieu of Victoria Day, Canada Day, and Thanksgiving Day.
