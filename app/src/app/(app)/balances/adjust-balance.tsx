"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustEntitlement } from "@/lib/leave-requests/actions";

export function AdjustBalanceButton({
  employeeId,
  employeeName,
  leaveTypeCode,
  leaveTypeName,
  fiscalYear,
  currentGranted,
  currentUsed,
}: {
  employeeId: string;
  employeeName: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  fiscalYear: number;
  currentGranted: number;
  currentUsed: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [granted, setGranted] = useState(String(currentGranted));
  const [used, setUsed] = useState(String(currentUsed));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const grantedChanged = Number(granted) !== currentGranted;
  const usedChanged = Number(used) !== currentUsed;
  const hasChanges = grantedChanged || usedChanged;

  function onSubmit() {
    setError(null);
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    if (!hasChanges) {
      setError("No changes made.");
      return;
    }
    startTransition(async () => {
      const r = await adjustEntitlement({
        employeeId,
        leaveTypeCode,
        fiscalYear,
        newGranted: grantedChanged ? Number(granted) : null,
        newUsed: usedChanged ? Number(used) : null,
        reason,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setReason("");
        router.refresh();
      }, 1000);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setGranted(String(currentGranted));
          setUsed(String(currentUsed));
          setReason("");
          setError(null);
          setSuccess(false);
          setOpen(true);
        }}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        title={`Adjust ${leaveTypeName} balance for ${employeeName}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3 w-3"
        >
          <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.06 10.466a.75.75 0 0 0-.188.333l-.93 3.255a.75.75 0 0 0 .92.92l3.255-.93a.75.75 0 0 0 .333-.188l7.953-7.953a1.75 1.75 0 0 0 0-2.475L13.488 2.513ZM11.72 3.22a.25.25 0 0 1 .354 0l.915.915a.25.25 0 0 1 0 .354l-1.28 1.28-1.27-1.27 1.28-1.28ZM9.733 5.205l1.27 1.27-5.628 5.628-1.737.496.496-1.737 5.6-5.657Z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="absolute right-0 top-0 z-10 w-64 rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
      <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
        Adjust {leaveTypeName} — {employeeName}
      </div>
      <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
        FY {fiscalYear}/{String(fiscalYear + 1).slice(-2)}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Granted
          </label>
          <input
            type="number"
            min="0"
            step="0.25"
            value={granted}
            onChange={(e) => setGranted(e.target.value)}
            className={`mt-0.5 block w-full rounded border px-2 py-1 text-xs ${grantedChanged ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"} text-zinc-900 dark:text-zinc-100`}
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Used
          </label>
          <input
            type="number"
            min="0"
            step="0.25"
            value={used}
            onChange={(e) => setUsed(e.target.value)}
            className={`mt-0.5 block w-full rounded border px-2 py-1 text-xs ${usedChanged ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"} text-zinc-900 dark:text-zinc-100`}
          />
        </div>
      </div>

      <label className="mt-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Reason
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="e.g. Pre-launch leave reconciliation"
        className="mt-0.5 block w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />

      {error ? (
        <div className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
          Updated.
        </div>
      ) : null}

      <div className="mt-2 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending || !hasChanges}
          className="rounded bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "…" : "Save"}
        </button>
      </div>
    </div>
  );
}
