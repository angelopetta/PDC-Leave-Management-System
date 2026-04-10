"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { overrideLeaveRequest } from "@/lib/leave-requests/actions";

export function OverrideButton({
  requestId,
  currentStatus,
}: {
  requestId: string;
  /** 'approved' or 'denied' */
  currentStatus: "approved" | "denied";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const targetLabel =
    currentStatus === "approved" ? "Cancel this approval" : "Reopen for review";
  const targetDescription =
    currentStatus === "approved"
      ? "This will cancel the approved request, refund the days to the employee's balance, and record your reason."
      : "This will move the denied request back to pending for a fresh decision, re-pending the days against the employee's balance.";

  function onOverride() {
    setError(null);
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    startTransition(async () => {
      const r = await overrideLeaveRequest(requestId, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setFormOpen(false);
      router.refresh();
    });
  }

  if (!formOpen) {
    return (
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        Override
      </button>
    );
  }

  return (
    <div className="mt-1 w-64 rounded-md border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
        {targetLabel}
      </div>
      <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
        {targetDescription}
      </div>
      <label
        htmlFor={`override-reason-${requestId}`}
        className="mt-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
      >
        Reason (visible to employee)
      </label>
      <textarea
        id={`override-reason-${requestId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="mt-1 block w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />

      {error ? (
        <div className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}

      <div className="mt-1.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setFormOpen(false);
            setReason("");
            setError(null);
          }}
          className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onOverride}
          disabled={isPending}
          className="rounded bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-60"
        >
          {isPending ? "…" : "Confirm override"}
        </button>
      </div>
    </div>
  );
}
