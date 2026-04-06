# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**KI Vacation & Leave Management System** — internal HR tool for KI (~20 employees). Replaces a paper/email leave process with a policy-driven web app. The authoritative spec is `docs/PRD.md`; Appendix A encodes the KI Employee Leaves policy (Sections 5.1–5.13 of the KI HR manual).

## Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Postgres, Auth, RLS, Storage, Edge Functions)
- **Hosting:** Vercel (frontend), Supabase-managed (backend)
- **Email:** Resend (or Supabase email) from Edge Functions

## Repo layout

- `app/` — Next.js application
- `supabase/migrations/` — SQL schema migrations
- `supabase/functions/` — Edge Functions (policy engine server-side mirror, notifications)
- `supabase/seed/` — seed data (holidays, mock employees)
- `policy/rules.ts` — machine-readable KI leave policy (source of truth for the engine)
- `docs/PRD.md` — full product requirements + Appendix A policy
- `docs/architecture.md` — architecture notes
- `fixtures/` — mock data files (roster xlsx, etc.)

## v1 scope

Five leave types only: **Vacation, Sick, Bereavement, Cultural, Personal**. Remaining categories (Court/Jury, Compassionate Care, Educational, Emergency Escort, Maternity, Parental, Unpaid, Political) are v1.1.

The data model and policy engine should be built to accommodate all 13 types from day one, even though only 5 are user-facing in v1.

## Key policy invariants (see PRD Appendix A)

- Fiscal year: **April 1 → March 31**. First rollout year: FY 2026/27.
- Vacation tiers by years of continuous service: 10/15/20/25/30 days at 0–3 / 4–10 / 11–15 / 15–20 / 20+ years.
- Sick leave: 1.25 days/month, cap 15/year, only in months with ≥10 days worked.
- **No carryover** for vacation, sick, cultural, or educational leave.
- 11 KI-observed holidays (see `supabase/seed/holidays.sql`); holidays during vacation do **not** count against balance.
- Min 6 months continuous service before vacation can be requested.
- Vacation requests >3 consecutive weeks require explicit CEO approval (no auto-approve).
- Medical certificate required for sick leave >3 consecutive working days.
- CEO is primary approver; Lead Finance Officer is backup when CEO is on leave.

## Policy engine rules

- `policy/rules.ts` is the **single source of truth**. The Next.js client and Supabase Edge Functions must both import/mirror these rules so server-side validation cannot be bypassed.
- When a rule blocks a request, surface the exact KI policy clause to the user.
- In-policy requests auto-approve with an FYI to the CEO; judgment calls route for review.

## Conventions

- TypeScript strict mode. No `any` without justification.
- Prefer server components; use client components only where interactivity requires it.
- Database access through Supabase client with RLS enforced — never bypass RLS from the client.
- All leave-decision logic lives in `policy/` and is unit-tested.
- Migrations are append-only; never edit a committed migration.

## Git workflow

- Active development branch: `claude/setup-project-structure-qlFmE`
- Do not push to `main` without explicit permission.
- Do not open PRs unless explicitly asked.
