"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveLeaveRequest,
  denyLeaveRequest,
} from "@/lib/leave-requests/actions";

export type ConflictEntry = {
  requestId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  status: "submitted" | "approved";
};

export type InboxRowProps = {
  requestId: string;
  recommendation: "auto_approve" | "review" | null;
  /** "Recommended: Approve" badge only fires in shadow mode. */
  showRecommendation: boolean;
  /** Same-department overlapping leave for the conflict drawer. */
  conflicts: ConflictEntry[];
  /** Concurrent peak (incl. this request) so we can render a coverage line. */
  coverage: {
    departmentName: string | null;
    headcount: number;
    minCoverage: number;
    /** Peak overlap on any day in the request range INCLUDING this request. */
    peak: number;
  } | null;
};

function formatRange(start: string, end: string): string {
  const startD = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");
  const opt: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  if (start === end) return startD.toLocaleDateString("en-US", opt);
  return `${startD.toLocaleDateString("en-US", opt)} – ${endD.toLocaleDateString("en-US", opt)}`;
}

export function InboxRow(props: InboxRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasConflicts = props.conflicts.length > 0;
  const cov = props.coverage;
  const coverageBreached =
    cov !== null && cov.peak > cov.headcount - cov.minCoverage;

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const r = await approveLeaveRequest(props.requestId, null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onDeny() {
    setError(null);
    if (!denyReason.trim()) {
      setError("A reason is required.");
      return;
    }
    startTransition(async () => {
      const r = await denyLeaveRequest(props.requestId, denyReason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {props.showRecommendation && props.recommendation === "auto_approve" ? (
        <span
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
          title="The policy engine found no blocking or flagged checks. In shadow mode, all requests still come to the inbox so you can build trust before flipping the switch."
        >
          <span aria-hidden>✓</span> Recommended: Approve
        </span>
      ) : null}

      {props.recommendation === "review" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <span aria-hidden>!</span> Needs review
        </span>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={isPending}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          {isPending ? "…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDenyOpen((v) => !v);
            setError(null);
          }}
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title={expanded ? "Hide context" : "Show conflicts and coverage"}
        >
          {expanded ? "Hide" : hasConflicts || coverageBreached ? "Why?" : "Details"}
        </button>
      </div>

      {error ? (
        <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
      ) : null}

      {denyOpen ? (
        <div className="mt-1 w-64 rounded-md border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <label
            htmlFor={`deny-${props.requestId}`}
            className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            Reason (visible to requester)
          </label>
          <textarea
            id={`deny-${props.requestId}`}
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDenyOpen(false);
                setDenyReason("");
                setError(null);
              }}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDeny}
              disabled={isPending}
              className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-60"
            >
              Confirm deny
            </button>
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-1 w-72 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-left text-[11px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300">
          {cov ? (
            <div className="mb-1.5">
              <span className="font-semibold">{cov.departmentName ?? "Department"}:</span>{" "}
              peak {cov.peak} of {cov.headcount} off concurrently
              {coverageBreached ? (
                <span className="ml-1 rounded bg-amber-200 px-1 text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                  below min {cov.minCoverage}
                </span>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-500">
                  {" "}
                  (min {cov.minCoverage})
                </span>
              )}
            </div>
          ) : null}
          {hasConflicts ? (
            <>
              <div className="font-medium text-zinc-600 dark:text-zinc-400">
                Overlapping leave in same department:
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {props.conflicts.map((c) => (
                  <li key={c.requestId} className="flex justify-between gap-2">
                    <span className="truncate">
                      {c.employeeName}
                      {c.status === "submitted" ? (
                        <span className="ml-1 text-amber-700 dark:text-amber-400">
                          (pending)
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-zinc-500 dark:text-zinc-500">
                      {formatRange(c.startDate, c.endDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-zinc-500 dark:text-zinc-500">
              No overlapping leave in this department.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
