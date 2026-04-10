"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelLeaveRequest } from "@/lib/leave-requests/actions";

export function CancelButton({
  requestId,
  currentStatus,
}: {
  requestId: string;
  /** 'submitted' or 'approved' — affects whether a reason is required. */
  currentStatus: "submitted" | "approved";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const needsReason = currentStatus === "approved";

  function onCancel() {
    setError(null);
    if (needsReason && !reason.trim()) {
      setError("A reason is required when cancelling an approved request.");
      return;
    }
    startTransition(async () => {
      const r = await cancelLeaveRequest(
        requestId,
        reason.trim() || null,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    });
  }

  if (!confirmOpen) {
    return (
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        Cancel request
      </button>
    );
  }

  return (
    <div className="mt-1 w-64 rounded-md border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
        {needsReason ? (
          <>
            This request is already approved. Cancelling it will refund{" "}
            the days to your balance. Please provide a reason.
          </>
        ) : (
          <>Cancel this pending request? Days will be released back to your balance.</>
        )}
      </div>
      {needsReason ? (
        <>
          <label
            htmlFor={`cancel-reason-${requestId}`}
            className="mt-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            Reason
          </label>
          <textarea
            id={`cancel-reason-${requestId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </>
      ) : null}

      {error ? (
        <div className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}

      <div className="mt-1.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setConfirmOpen(false);
            setReason("");
            setError(null);
          }}
          className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-60"
        >
          {isPending ? "…" : "Confirm cancel"}
        </button>
      </div>
    </div>
  );
}
