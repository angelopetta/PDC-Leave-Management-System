-- Initial schema for PDC-Leave-Management-System.
-- Implements the data model from docs/PRD.md §6.
-- See policy/rules.ts for the encoded leave policy.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type employment_type as enum (
  'permanent_full_time',
  'term',
  'probationary',
  'part_time',
  'seasonal'
);

create type employee_status as enum ('active', 'on_leave', 'terminated');

create type leave_request_status as enum (
  'draft',
  'submitted',
  'approved',
  'denied',
  'cancelled'
);

create type holiday_type as enum ('statutory', 'provincial', 'first_nation');

create type accrual_method as enum ('lump_sum', 'monthly');

-- ---------------------------------------------------------------------------
-- Policy profiles — one row per employment-type category in KI policy.
-- ---------------------------------------------------------------------------

create table policy_profiles (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null unique,
  employment_type  employment_type not null,
  eligibility      jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leave types (master list of all 13; v1 only exposes 5 via `is_v1`).
-- ---------------------------------------------------------------------------

create table leave_types (
  id                     uuid primary key default uuid_generate_v4(),
  code                   text not null unique,
  name                   text not null,
  description            text,
  color                  text,
  eligibility_text       text,
  requires_attachment    boolean not null default false,
  notice_days            integer not null default 0,
  max_consecutive_days   integer,
  auto_approvable        boolean not null default true,
  is_v1                  boolean not null default false,
  created_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Entitlement rules — how much an employee of a given profile earns of a
-- given leave type per fiscal year. tier_rules (JSON) encodes the vacation
-- years-of-service tiers from policy/rules.ts.
-- ---------------------------------------------------------------------------

create table entitlement_rules (
  id                 uuid primary key default uuid_generate_v4(),
  leave_type_id      uuid not null references leave_types(id) on delete cascade,
  policy_profile_id  uuid not null references policy_profiles(id) on delete cascade,
  accrual_method     accrual_method not null,
  base_days          numeric(5,2) not null default 0,
  tier_rules         jsonb,
  created_at         timestamptz not null default now(),
  unique (leave_type_id, policy_profile_id)
);

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------

create table employees (
  id                 uuid primary key default uuid_generate_v4(),
  employee_code      text not null unique,
  first_name         text not null,
  last_name          text not null,
  email              text not null unique,
  job_title          text,
  department         text,
  employment_type    employment_type not null,
  policy_profile_id  uuid references policy_profiles(id),
  hire_date          date not null,
  manager_id         uuid references employees(id),
  -- manager_code is a scratch column used only by seed scripts to resolve
  -- manager_id after bulk insert; safe to leave null in production.
  manager_code       text,
  status             employee_status not null default 'active',
  auth_user_id       uuid unique, -- ties to auth.users when account is provisioned
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index employees_manager_id_idx on employees(manager_id);

-- ---------------------------------------------------------------------------
-- Entitlements — materialized per employee, per leave type, per fiscal year.
-- `remaining` is derived (granted + earned - used - pending) but we persist
-- all components so the balance history is auditable.
-- ---------------------------------------------------------------------------

create table entitlements (
  id             uuid primary key default uuid_generate_v4(),
  employee_id    uuid not null references employees(id) on delete cascade,
  leave_type_id  uuid not null references leave_types(id) on delete cascade,
  fiscal_year    integer not null, -- e.g. 2026 means FY 2026/27
  granted        numeric(5,2) not null default 0,
  earned         numeric(5,2) not null default 0,
  used           numeric(5,2) not null default 0,
  pending        numeric(5,2) not null default 0,
  remaining      numeric(5,2) generated always as (granted + earned - used - pending) stored,
  updated_at     timestamptz not null default now(),
  unique (employee_id, leave_type_id, fiscal_year)
);

-- ---------------------------------------------------------------------------
-- Leave requests
-- ---------------------------------------------------------------------------

create table leave_requests (
  id              uuid primary key default uuid_generate_v4(),
  employee_id     uuid not null references employees(id) on delete cascade,
  leave_type_id   uuid not null references leave_types(id),
  start_date      date not null,
  end_date        date not null,
  days            numeric(5,2) not null, -- business days, holiday-aware
  reason          text,
  status          leave_request_status not null default 'draft',
  submitted_at    timestamptz,
  reviewed_by     uuid references employees(id),
  reviewed_at     timestamptz,
  review_notes    text,
  attachment_url  text,
  auto_approved   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date)
);

create index leave_requests_employee_id_idx on leave_requests(employee_id);
create index leave_requests_status_idx on leave_requests(status);
create index leave_requests_date_range_idx on leave_requests(start_date, end_date);

-- ---------------------------------------------------------------------------
-- Holidays (seeded from supabase/seed/holidays.sql)
-- ---------------------------------------------------------------------------

create table holidays (
  id    uuid primary key default uuid_generate_v4(),
  date  date not null unique,
  name  text not null,
  type  holiday_type not null,
  rule  text -- recurring rule in human-readable form, for future FY generation
);

-- ---------------------------------------------------------------------------
-- Blackout periods
-- ---------------------------------------------------------------------------

create table blackout_periods (
  id          uuid primary key default uuid_generate_v4(),
  start_date  date not null,
  end_date    date not null,
  applies_to  text, -- e.g. 'all', 'department:Finance'
  reason      text,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- Audit log (immutable)
-- ---------------------------------------------------------------------------

create table audit_log (
  id           uuid primary key default uuid_generate_v4(),
  actor_id     uuid references employees(id),
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log(entity_type, entity_id);
create index audit_log_actor_idx on audit_log(actor_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger employees_set_updated_at     before update on employees     for each row execute function set_updated_at();
create trigger leave_requests_set_updated_at before update on leave_requests for each row execute function set_updated_at();
create trigger entitlements_set_updated_at  before update on entitlements  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security (baseline; refined in a later migration)
-- ---------------------------------------------------------------------------

alter table employees         enable row level security;
alter table entitlements      enable row level security;
alter table leave_requests    enable row level security;
alter table audit_log         enable row level security;

-- Policies intentionally left to a follow-up migration once auth.users ↔
-- employees mapping is finalized. Until then, only service_role can read.
