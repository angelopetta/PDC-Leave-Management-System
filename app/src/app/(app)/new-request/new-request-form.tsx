"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  previewLeaveRequest,
  submitLeaveRequest,
  type LeaveRequestPreview,
  type SubmitLeaveRequestResult,
} from "@/lib/leave-requests/actions";

type LeaveTypeCode =
  | "vacation"
  | "sick"
  | "bereavement"
  | "cultural"
  | "personal";

const LEAVE_TYPE_OPTIONS: { code: LeaveTypeCode; name: string }[] = [
  { code: "vacation", name: "Vacation" },
  { code: "sick", name: "Sick Leave" },
  { code: "bereavement", name: "Bereavement" },
  { code: "cultural", name: "Cultural Leave" },
  { code: "personal", name: "Personal Leave" },
];

export type MyBalances = Partial<
  Record<LeaveTypeCode, { granted: number; used: number; pending: number }>
>;

// Inlined copy of the business-day counter from policy/engine.ts. Kept
// local to avoid a cross-root import in a client bundle; the server
// action still runs the canonical engine check on submit, so this
// function is purely for the live UX preview.
function businessDaysInRange(
  startIso: string,
  endIso: string,
  holidays: Set<string>,
): number {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    const iso = cur.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function remainingFor(
  balances: MyBalances,
  code: LeaveTypeCode,
): number | null {
  const b = balances[code];
  if (!b) return null;
  return Math.max(0, b.granted - b.used - b.pending);
}

export function NewRequestForm({
  balances,
  holidays,
}: {
  balances: MyBalances;
  holidays: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmitLeaveRequestResult | null>(null);

  const [leaveType, setLeaveType] = useState<LeaveTypeCode>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<LeaveRequestPreview | null>(null);

  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  const remaining = remainingFor(balances, leaveType);
  const granted = balances[leaveType]?.granted ?? 0;

  const requestedDays = useMemo(
    () => businessDaysInRange(startDate, endDate, holidaySet),
    [startDate, endDate, holidaySet],
  );

  const overBalance =
    requestedDays > 0 && remaining !== null && requestedDays > remaining;

  // Live server-side preview: re-runs the policy engine (with blackouts
  // and department coverage) whenever leave type or dates change. The
  // local day-count above stays as the instant fast path; the preview
  // adds the routing-relevant info that needs the database.
  //
  // We derive `previewActive` rather than clearing state in the effect
  // (which trips react-hooks/set-state-in-effect). When previewActive is
  // false the rendering simply ignores any stale state below.
  const previewActive =
    Boolean(startDate) && Boolean(endDate) && requestedDays > 0 && !overBalance;

  useEffect(() => {
    if (!previewActive) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await previewLeaveRequest({
        leaveType,
        startDate,
        endDate,
        reason: "",
      });
      if (!cancelled) setPreview(r);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [leaveType, startDate, endDate, previewActive]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const r = await submitLeaveRequest({
        leaveType,
        startDate,
        endDate,
        reason,
      });
      setResult(r);
      if (r.ok) {
        // Give the user a beat to read the success banner, then go home.
        setTimeout(() => router.push("/"), 1400);
      }
    });
  }

  const disabled = isPending || (result?.ok ?? false);
  const previewBlocked =
    previewActive &&
    preview !== null &&
    preview.ok &&
    preview.blockingCheck !== null;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="leave-type"
          className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
        >
          Leave type
        </label>
        <select
          id="leave-type"
          name="leave_type"
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value as LeaveTypeCode)}
          disabled={disabled}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          {LEAVE_TYPE_OPTIONS.map((t) => {
            const rem = remainingFor(balances, t.code);
            const g = balances[t.code]?.granted ?? 0;
            const suffix =
              rem === null
                ? " — not eligible"
                : g === 0
                  ? " — not eligible"
                  : ` — ${rem} of ${g} remaining`;
            return (
              <option key={t.code} value={t.code}>
                {t.name}
                {suffix}
              </option>
            );
          })}
        </select>
        <div className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {remaining === null ? (
            <>No entitlement on record for this type.</>
          ) : granted === 0 ? (
            <>You are not eligible for this leave type.</>
          ) : (
            <>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {remaining}
              </span>{" "}
              of {granted} days remaining this fiscal year
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="start-date"
            className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
          >
            Start date
          </label>
          <input
            id="start-date"
            name="start_date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={disabled}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div>
          <label
            htmlFor="end-date"
            className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
          >
            End date
          </label>
          <input
            id="end-date"
            name="end_date"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={disabled}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
      </div>

      {startDate && endDate ? (
        <div
          className={
            overBalance
              ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
              : "rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300"
          }
        >
          {requestedDays === 0 ? (
            <>
              Selected range contains no business days (weekends and
              holidays are excluded).
            </>
          ) : (
            <>
              This request is{" "}
              <span className="font-semibold">
                {requestedDays} business day{requestedDays === 1 ? "" : "s"}
              </span>
              .{" "}
              {overBalance && remaining !== null ? (
                <>
                  You only have{" "}
                  <span className="font-semibold">{remaining}</span>{" "}
                  remaining — submitting will be blocked.
                </>
              ) : remaining !== null ? (
                <>
                  {Math.max(0, remaining - requestedDays)} would remain after
                  approval.
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {/* Live preview from the policy engine: blackouts, coverage, and
          routing. Only shown when the date range is valid and within
          balance — otherwise the cards above already explain the issue. */}
      {previewActive && preview && preview.ok ? (
        <>
          {preview.blockingCheck ? (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <div className="font-medium">{preview.blockingCheck.message}</div>
              <div className="mt-0.5 text-[11px] text-red-800/80 dark:text-red-200/70">
                {preview.blockingCheck.clause}
              </div>
            </div>
          ) : preview.flags.length > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <div className="font-medium">
                Heads up — your request will need approver review instead of
                auto-approving:
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {preview.flags.map((f) => (
                  <li key={f.id}>{f.message}</li>
                ))}
              </ul>
            </div>
          ) : preview.recommendation === "auto_approve" ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              {preview.mode === "shadow" ? (
                <>
                  In policy. While we&apos;re in shadow mode this still goes
                  to the CEO for sign-off, but it&apos;ll be flagged as a
                  recommended approval.
                </>
              ) : (
                <>In policy — this will auto-approve on submit.</>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      <div>
        <label
          htmlFor="reason"
          className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
        >
          Reason{" "}
          <span className="normal-case text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
          placeholder="Add any context the approver should know"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      {result && !result.ok ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <div className="font-medium">{result.error}</div>
          {result.clause ? (
            <div className="mt-1 text-xs text-red-800/80 dark:text-red-200/70">
              {result.clause}
            </div>
          ) : null}
        </div>
      ) : null}

      {result && result.ok ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <div className="font-medium">
            {result.status === "approved"
              ? `Auto-approved — ${result.days} day${result.days === 1 ? "" : "s"} booked.`
              : `Submitted for review — ${result.days} day${result.days === 1 ? "" : "s"} pending approval.`}
          </div>
          {result.flags.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-xs text-emerald-800/80 dark:text-emerald-200/70">
              {result.flags.map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.clause}:</span> {f.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-1 text-xs text-emerald-800/70 dark:text-emerald-200/60">
            Redirecting to your dashboard…
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Link
          href="/"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={disabled || overBalance || previewBlocked}
          className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {isPending ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
