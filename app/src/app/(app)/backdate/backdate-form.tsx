"use client";

import { useMemo, useState, useTransition } from "react";
import {
  backdateLeaveRequest,
  type BackdateLeaveRequestResult,
} from "@/lib/leave-requests/actions";

type EmployeeOption = {
  id: string;
  code: string;
  name: string;
};

type LeaveTypeOption = {
  code: string;
  name: string;
};

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

export function BackdateForm({
  employees,
  leaveTypes,
  holidays,
}: {
  employees: EmployeeOption[];
  leaveTypes: LeaveTypeOption[];
  holidays: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BackdateLeaveRequestResult | null>(null);

  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [leaveTypeCode, setLeaveTypeCode] = useState(
    leaveTypes[0]?.code ?? "",
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  const days = useMemo(
    () => businessDaysInRange(startDate, endDate, holidaySet),
    [startDate, endDate, holidaySet],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const r = await backdateLeaveRequest({
        employeeId,
        leaveTypeCode,
        startDate,
        endDate,
        days,
        reason,
      });
      setResult(r);
      if (r.ok) {
        // Reset form for the next entry.
        setStartDate("");
        setEndDate("");
        setReason("");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="bd-employee"
          className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
        >
          Employee
        </label>
        <select
          id="bd-employee"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.code} — {emp.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="bd-leave-type"
          className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
        >
          Leave type
        </label>
        <select
          id="bd-leave-type"
          value={leaveTypeCode}
          onChange={(e) => setLeaveTypeCode(e.target.value)}
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          {leaveTypes.map((lt) => (
            <option key={lt.code} value={lt.code}>
              {lt.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="bd-start"
            className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
          >
            Start date
          </label>
          <input
            id="bd-start"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={isPending}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div>
          <label
            htmlFor="bd-end"
            className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
          >
            End date
          </label>
          <input
            id="bd-end"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={isPending}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
      </div>

      {startDate && endDate ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300">
          {days === 0 ? (
            <>No business days in this range.</>
          ) : (
            <>
              <span className="font-semibold">{days}</span> business day
              {days === 1 ? "" : "s"} (weekends and holidays excluded).
            </>
          )}
        </div>
      ) : null}

      <div>
        <label
          htmlFor="bd-reason"
          className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
        >
          Reason{" "}
          <span className="normal-case text-zinc-400">(required)</span>
        </label>
        <textarea
          id="bd-reason"
          rows={2}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={isPending}
          placeholder="e.g. Pre-launch: vacation booked before system went live"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      {result && !result.ok ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {result.error}
        </div>
      ) : null}

      {result && result.ok ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Recorded. The leave appears as approved and the balance has been
          updated. You can enter another one below or go back to{" "}
          <a href="/balances" className="underline">
            Balances
          </a>
          .
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <a
          href="/balances"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Back to Balances
        </a>
        <button
          type="submit"
          disabled={isPending || days === 0}
          className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {isPending ? "Saving…" : "Record leave"}
        </button>
      </div>
    </form>
  );
}
