-- Mock employee roster (16 employees).
-- Source: fixtures/KI-Employee-Roster-Mock.xlsx
-- Reference date for years-of-service: April 1, 2026 (FY 2026/27 start).
-- Exercises all five vacation tiers. Replace with real data before production.

insert into employees (
  employee_code, first_name, last_name, email, job_title, department,
  employment_type, hire_date, manager_code, status
) values
  ('KI-001', 'Margaret', 'Anderson',   'manderson@ki.example',   'Chief Executive Officer',   'Administration',      'permanent_full_time', '2009-06-15', null,     'active'),
  ('KI-002', 'Robert',   'Cree',       'rcree@ki.example',       'Lead Finance Officer',      'Finance',             'permanent_full_time', '2011-03-07', 'KI-001', 'active'),
  ('KI-003', 'Sarah',    'Whiteduck',  'swhiteduck@ki.example',  'Program Coordinator',       'Administration',      'permanent_full_time', '2015-09-01', 'KI-001', 'active'),
  ('KI-004', 'James',    'Morin',      'jmorin@ki.example',      'Finance Officer',           'Finance',             'permanent_full_time', '2018-01-22', 'KI-002', 'active'),
  ('KI-005', 'Michelle', 'Sioui',      'msioui@ki.example',      'Community Worker',          'Community Services',  'permanent_full_time', '2020-04-06', 'KI-001', 'active'),
  ('KI-006', 'Daniel',   'Picard',     'dpicard@ki.example',     'IT Support Specialist',     'Administration',      'permanent_full_time', '2021-08-16', 'KI-001', 'active'),
  ('KI-007', 'Lisa',     'Rankin',     'lrankin@ki.example',     'Health Aide',               'Health Services',     'permanent_full_time', '2013-11-04', 'KI-001', 'active'),
  ('KI-008', 'Karen',    'Oakes',      'koakes@ki.example',      'Education Coordinator',     'Education',           'permanent_full_time', '2017-02-13', 'KI-001', 'active'),
  ('KI-009', 'Thomas',   'Bell',       'tbell@ki.example',       'Youth Worker',              'Community Services',  'permanent_full_time', '2022-10-03', 'KI-005', 'active'),
  ('KI-010', 'Angela',   'Stone',      'astone@ki.example',      'Administrative Assistant',  'Administration',      'permanent_full_time', '2024-05-20', 'KI-001', 'active'),
  ('KI-011', 'Chris',    'Martin',     'cmartin@ki.example',     'Lands Officer',             'Lands & Resources',   'permanent_full_time', '2019-07-08', 'KI-001', 'active'),
  ('KI-012', 'Nina',     'Deer',       'ndeer@ki.example',       'Receptionist',              'Administration',      'probationary',        '2026-01-12', 'KI-001', 'active'),
  ('KI-013', 'Paul',     'Rivers',     'privers@ki.example',     'Housing Inspector',         'Housing',             'permanent_full_time', '2014-09-29', 'KI-001', 'active'),
  ('KI-014', 'Evelyn',   'Bear',       'ebear@ki.example',       'Cultural Liaison',          'Community Services',  'term',                '2025-06-02', 'KI-005', 'active'),
  ('KI-015', 'Jacob',    'Linklater',  'jlinklater@ki.example',  'Maintenance Worker',        'Facilities',          'seasonal',            '2023-05-15', 'KI-001', 'active'),
  ('KI-016', 'Rebecca',  'Thunder',    'rthunder@ki.example',    'Health Nurse',              'Health Services',     'permanent_full_time', '2006-08-21', 'KI-001', 'active');

-- Resolve manager_id from manager_code after insert.
update employees e
   set manager_id = m.id
  from employees m
 where e.manager_code = m.employee_code;
