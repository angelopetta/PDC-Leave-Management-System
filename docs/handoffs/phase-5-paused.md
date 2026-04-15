# Session handoff — 2026-04-15

Paste this document as the first message of the next Claude Code session to
carry full context forward. It captures the state of Phase 5 (Email
Notifications) and every decision from the 2026-04-15 scoping session.

Phase 5 is **paused**. The user wants to add additional features before
resuming email notifications. Do not resume Phase 5 in the next session
unless the user explicitly asks.

---

## Project

KI / PDC Vacation & Leave Management System — internal HR tool for PDC
(Petaykawin Development Corporation), the economic development corporation
of Kitchenuhmaykoosib Inninuwug (KI / Band 209). Serves ~20 employees.
Replaces a paper/email leave process with a policy-driven web app. The
authoritative spec is `docs/PRD.md`; Appendix A encodes the KI Employee
Leaves policy (Sections 5.1–5.13 of the KI HR manual). Machine-readable
policy in `policy/rules.ts` + `policy/engine.ts` at the repo root, imported
via `@policy/*` aliases.

**Naming note:** the original PRD uses "KI" throughout. In practice the
corporation is "PDC" and that's the name going on the domain and future
branding. Both names refer to the same org in this codebase. Don't rename
things in bulk; follow whichever name already exists in the file you're
editing.

## Stack

| Layer     | Choice                                                      |
|-----------|-------------------------------------------------------------|
| Frontend  | Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui |
| Backend   | Supabase (Postgres, Auth, RLS, Storage, Edge Functions)     |
| Hosting   | Vercel (frontend), Supabase-managed (backend)               |
| Email     | Resend (chosen but not yet integrated — see Phase 5)        |
| Repo      | `angelopetta/PDC-Leave-Management-System`                   |
| Prod URL  | https://pdc-leave-management-system.vercel.app              |

## Where we are (as of 2026-04-15)

v1 is live in production. Phases 1–4 merged. Last merged PR was #19 which
added auto-trim of leading/trailing weekends/holidays from leave requests
and a durable migration backfilling FY 2026/27 holidays (recovering from an
incident where the holidays table was empty in prod). End-to-end approval
loop works: submit → engine evaluation → approver inbox with shadow-mode
recommendation badges → approve/deny with reason → atomic balance movement
→ calendar display → ICS export.

`auto_approval_mode` in `app_settings` is still `'shadow'`. Graduation is a
one-line SQL update after the CEO observes 5–10 requests.

**Test accounts:**

- `angelo.petta@angelopetta.com` → KI-001 Margaret Anderson (CEO, approver)
- `angelo.petta@gmail.com` → KI-004 James Morin (Finance Officer,
  non-approver)

## Phase 5 (Email Notifications) — scoped but paused

Phase 5 was scoped in the 2026-04-15 session but **no code was written**.
The user paused it to add additional features first. Do not resume Phase 5
in the next session unless the user explicitly asks.

Decisions locked in from the scoping session (preserve these when Phase 5
resumes):

1. **Provider:** Resend (not Supabase built-in email).
2. **Shadow-first rollout:** add a `notifications_mode` column to
   `app_settings` with values `'off' | 'shadow' | 'live'`, default
   `'shadow'`. Same pattern as existing `auto_approval_mode`. `'off'` is
   the kill switch; `'shadow'` writes to `email_log` but doesn't send;
   `'live'` sends and logs.
3. **New append-only `email_log` table:** `id`, `template`,
   `recipient_employee_id`, `recipient_email`, `subject`, `body_html`,
   `body_text`, `status` (`pending|sent|shadow|failed`), `error`,
   `sent_at`, `created_at`. Every would-send event writes a row regardless
   of mode.
4. **Phase 5 template priority — the 4-template core loop first:**
   1. Submission → approver
   2. Submission ack → employee
   3. Approval → employee
   4. Denial → employee, **citing the `PolicyCheck.clause` string the
      engine already records**

   Phase 5.1 picks up the async ones (FYI on auto-approval, reminders,
   balance-low warnings, weekly digest) — those need `pg_cron` and their
   own design pass.
5. **Admin route `/admin/email-log`** to let the CEO audit rendered
   templates before shadow → live graduation.
6. **Architecture:** triggers on `leave_requests` state transitions fire a
   new Supabase Edge Function `send-email` via `pg_net`. The function
   imports template clause text from `@policy/*` so denial emails cite the
   same strings the engine produced. `RESEND_API_KEY` and `RESEND_FROM` as
   Supabase secrets — never in the repo.

**Phase 5 branch** (from prior task system):
`claude/email-notifications-phase-5-O9elH`. Exists in git but has no
Phase 5 commits yet (this handoff file is the only commit). When Phase 5
resumes, either continue on this branch or start fresh — confirm with the
user.

**Phase 5 RFC** was never drafted. When Phase 5 resumes, the agreed
sequence is: (a) draft ~200-word architecture RFC covering `email_log`
schema + Edge Function shape + trigger plan + template priority, (b) user
sign-off, (c) migration commit, (d) Edge Function commit, (e) triggers
commit, each independently reviewable.

## Domain & email infrastructure — in progress, user action pending

To send email from Resend we need a verified sender domain. Decided:

- **Register `pdc209.com`** via Cloudflare Registrar. PDC = Petaykawin
  Development Corporation; 209 = the Indigenous Services Canada band
  number for Kitchenuhmaykoosib Inninuwug. The domain is semantically
  loaded (not a random number) and short enough to own the brand. Will
  also serve as the future public website for PDC.
- **TLD is `.com`, not `.org`** — PDC sees itself as a corporation, not
  an institution.
- **Registrar is Cloudflare** because at-cost pricing, free WHOIS privacy,
  clean DNS UI.
- **Email will come from a subdomain** like `no-reply@leaves.pdc209.com`,
  not the bare domain, to isolate transactional sender reputation from
  the future main corporate email.

**Status at end of 2026-04-15 session:** user was about to open
`cloudflare.com` and search for `pdc209.com`. Registration completion
status is unknown at the start of the next session. **Ask the user**
whether the domain is registered, and if so, whether they've:

1. Created a Resend account,
2. Added `leaves.pdc209.com` (or chosen subdomain) to Resend,
3. Pasted the DNS records Resend generated into Cloudflare,
4. Seen the green "verified" check in Resend.

All four are prerequisites before any Phase 5 code can be written. If not
done, walk the user through each step in order — the user is **not a
technical person**, be concrete and step-by-step.

The Resend API key and from-address should land in Supabase secrets as
`RESEND_API_KEY` and `RESEND_FROM`. Never in the repo, never in chat.

## What the next session is about

The user wants to add **additional features before resuming Phase 5**.
They have not yet said what those features are. The next session's first
move should be to ask them what features they want to add, then scope them
(ask clarifying questions, propose acceptance criteria) before writing any
code.

Do not resume Phase 5 work in the next session. Do not start the domain /
Resend hand-holding unless the user explicitly redirects back to Phase 5.

## Critical technical invariants — do not violate

Inherited from prior sessions, some learned the hard way.

- **Append-only migrations.** Never edit a committed migration file. PR
  #16 was spent rectifying a violation. If a migration has a bug, write a
  new migration using `CREATE OR REPLACE` or an idempotent backfill.
  Absolute rule. See `CLAUDE.md`.
- **Use `gen_random_uuid()` for new tables, NOT `uuid_generate_v4()`.**
  The Supabase migration role's `search_path` doesn't include the
  extensions schema.
- **Employees column is `employee_code`, not `employee_number`.**
- **After any migration that adds or replaces RPCs**, run
  `NOTIFY pgrst, 'reload schema';` in the SQL editor. PostgREST caches
  function signatures.
- **Functions with `returns table(..., status leave_request_status)`**
  must qualify `employees.status` in the body to avoid shadow-column
  ambiguity.
- **Policy engine at repo root (`policy/`)** is imported by both the
  Next.js client and Supabase Edge Functions. Next.js resolves `@policy/*`
  via tsconfig paths + `outputFileTracingRoot` in `next.config.ts`. Edge
  Functions use a relative import.
- **PostgREST FK disambiguation:** `leave_requests` has two FKs to
  `employees` (`employee_id`, `reviewed_by`). Queries embedding employee
  data must use the hint
  `employees!employee_id(first_name, last_name, ...)`.
- **PostgREST embedded types come back as arrays** but we consume them as
  single objects. Cast through `as unknown as` in typed rows.
- **Next.js 16 `searchParams` is a `Promise`** — `await` it.
- **Local `npm run build` fails on Google Fonts** in network-restricted
  sandboxes. Use `npx tsc --noEmit` for type checks. Vercel's build is
  unrestricted; ignore local build failures.
- **Heavy doc comments on non-trivial functions are house style.** Match
  it. Future engineers reading `supabase/migrations/` and `policy/` rely
  on those comments to understand *why* a decision was made.

## v1 scope reminder

Five leave types are user-facing: Vacation, Sick, Bereavement, Cultural,
Personal. The data model + policy engine were built to accommodate all 13
types (Court/Jury, Compassionate Care, Educational, Emergency Escort,
Maternity, Parental, Unpaid, Political also modeled but not user-facing).
When adding features, think about whether they should extend to all 13
types or stay within the visible 5.

## Key policy invariants (see PRD Appendix A)

- Fiscal year: **April 1 → March 31**. First rollout year: FY 2026/27.
- Vacation tiers by years of continuous service: 10/15/20/25/30 days at
  0–3 / 4–10 / 11–15 / 15–20 / 20+ years.
- Sick leave: 1.25 days/month, cap 15/year, only in months with ≥10 days
  worked.
- **No carryover** for vacation, sick, cultural, or educational leave.
- 11 KI-observed holidays; holidays during vacation do **not** count
  against balance.
- Min 6 months continuous service before vacation can be requested.
- Vacation requests >3 consecutive weeks require explicit CEO approval (no
  auto-approve).
- Medical certificate required for sick leave >3 consecutive working days.
- CEO is primary approver; Lead Finance Officer is backup when CEO is on
  leave.

## Git workflow

- Use the branch designated by the task system for this session. If it
  conflicts with `CLAUDE.md`'s active-branch mention, the task system
  wins. Naming convention: `claude/<short-feature>-<suffix>`.
- Commit → push → user creates PR via GitHub MCP → user reviews Files
  Changed → user merges → user syncs local main via
  `git fetch origin main && git checkout main && git reset --hard origin/main`.
- Do **not** open PRs unless the user explicitly asks.
- Do **not** push to `main` without explicit permission.

## Open GitHub issues (background, not next session's scope)

- `angelopetta/pdc-leave-management-system#17` — Calendar UX polish (pill
  hover tooltip + non-interactive "+N more" overflow). Deferred to Phase 6
  polish.
- `angelopetta/pdc-leave-management-system#18` — Seeds vs migrations
  lesson. Partially resolved by PR #19 for `holidays`.
  `supabase/seed/policy_and_leave_types.sql` is still the same risk class
  (`leave_types` would silently break a fresh environment) and should be
  promoted to a migration before any new environment is provisioned.
  Could be a pre-Phase-5 cleanup or done opportunistically.
- `angelopetta/pdc-leave-management-system#20` (created alongside this
  handoff) — Phase 5 email notifications tracking issue, mirrors this
  document's Phase 5 section.

## Starting instructions for the next session

1. **Do not start work yet.** Ask the user what features they want to
   add. Get a short description from them.
2. Once you know the feature, ask scoping questions **before writing
   code**: acceptance criteria, edge cases, whether it applies to all 13
   leave types or just the visible 5, whether it needs UI or just data
   model, whether it touches the policy engine or the approval flow.
3. For any non-trivial feature, draft a brief design note covering data
   model changes, policy engine impact, and UI impact. Get user sign-off
   before coding.
4. Scaffold migrations + code on the new branch assigned by the task
   system. Keep commits independently reviewable.
5. Respect all the invariants in the "do not violate" section above. The
   user has been burned by violations of those rules before.
6. Domain / Resend work is **paused**. Do not resume it unless the user
   explicitly says "let's finish the domain setup" or "let's start Phase
   5."

**First message back to the user:** ask what features they want to add.
Not code.
