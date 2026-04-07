"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  submitLeaveRequest,
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

export function NewRequestForm({ balances }: { balances: MyBalances }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmitLeaveRequestResult | null>(null);

  const [leaveType, setLeaveType] = useState<LeaveTypeCode>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const remaining = useMemo(() => {
    const b = balances[leaveType];
    if (!b) return null;
    return Math.max(0, b.granted - b.used - b.pending);
  }, [balances, leaveType]);

  const granted = balances[leaveType]?.granted ?? 0;

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
          {LEAVE_TYPE_OPTIONS.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
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
          disabled={disabled}
          className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {isPending ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
