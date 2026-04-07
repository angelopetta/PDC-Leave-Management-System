import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, isApprover } from "@/lib/auth";
import { Card, StubBanner, StatusBadge, Avatar } from "../ui";
import { LEAVE_TYPES, type LeaveTypeCode } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

type FilterKey = "all" | "pending" | "approved" | "denied";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
];

type LeaveRequestRow = {
  id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: "draft" | "submitted" | "approved" | "denied" | "cancelled";
  submitted_at: string | null;
  reviewed_at: string | null;
  employees: {
    first_name: string;
    last_name: string;
    department: string | null;
  } | null;
  leave_types: { code: string } | null;
};

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function formatRange(start: string, end: string): string {
  const startD = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");
  const sameDay = start === end;
  const sameMonth =
    startD.getUTCFullYear() === endD.getUTCFullYear() &&
    startD.getUTCMonth() === endD.getUTCMonth();
  const short: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  if (sameDay) return startD.toLocaleDateString("en-US", short);
  if (sameMonth) {
    return `${startD.toLocaleDateString("en-US", short)} – ${endD.getUTCDate()}`;
  }
  return `${startD.toLocaleDateString("en-US", short)} – ${endD.toLocaleDateString("en-US", short)}`;
}

// Map our internal leave_request_status enum (which has 'submitted') onto
// the three UI buckets (Pending / Approved / Denied). 'draft' and
// 'cancelled' are hidden from this view entirely.
function toDisplayStatus(
  s: LeaveRequestRow["status"],
): "pending" | "approved" | "denied" | null {
  if (s === "submitted") return "pending";
  if (s === "approved") return "approved";
  if (s === "denied") return "denied";
  return null;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam = "all" } = await searchParams;
  const filter: FilterKey = (FILTERS.find((f) => f.key === filterParam)?.key ??
    "all") as FilterKey;

  const supabase = await createClient();
  const me = await getCurrentEmployee();
  const approver = isApprover(me ? { jobTitle: me.jobTitle } : null);

  // RLS does the employee-vs-approver split for us: approvers see every
  // request, non-approvers see only their own.
  // `leave_requests` has two FKs to `employees` (employee_id for the
  // requester, reviewed_by for the approver), so PostgREST needs the
  // `!employee_id` hint to know which relationship to embed.
  const { data, error } = await supabase
    .from("leave_requests")
    .select(
      `
        id, start_date, end_date, days, reason, status, submitted_at, reviewed_at,
        employees!employee_id(first_name, last_name, department),
        leave_types(code)
      `,
    )
    .in("status", ["submitted", "approved", "denied"])
    .order("submitted_at", { ascending: false });

  const rows = (data ?? []) as unknown as LeaveRequestRow[];

  // Compute counts across all visible rows (not filtered).
  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "submitted").length,
    approved: rows.filter((r) => r.status === "approved").length,
    denied: rows.filter((r) => r.status === "denied").length,
  };

  const visible =
    filter === "all"
      ? rows
      : rows.filter((r) => toDisplayStatus(r.status) === filter);

  return (
    <>
      {!approver ? (
        <StubBanner>
          You&apos;re viewing your own requests only. Approvers see every
          employee&apos;s request.
        </StubBanner>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Failed to load requests: {error.message}
        </div>
      ) : null}

      <Card
        title={approver ? "All Leave Requests" : "My Leave Requests"}
        action={
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => {
              const isActive = filter === f.key;
              const count = counts[f.key];
              return (
                <Link
                  key={f.key}
                  href={
                    f.key === "all" ? "/requests" : `/requests?filter=${f.key}`
                  }
                  className={
                    isActive
                      ? "rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }
                >
                  {f.label}
                  {f.key !== "all" ? ` (${count})` : ""}
                </Link>
              );
            })}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="pb-3 pr-4">Employee</th>
                <th className="pb-3 pr-4">Type</th>
                <th className="pb-3 pr-4">Dates</th>
                <th className="pb-3 pr-4">Days</th>
                <th className="pb-3 pr-4">Reason</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    No requests to show.{" "}
                    <Link
                      href="/new-request"
                      className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      Submit one
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const code = (r.leave_types?.code ?? "") as LeaveTypeCode;
                  const meta = LEAVE_TYPES.find((t) => t.code === code);
                  const displayStatus = toDisplayStatus(r.status) ?? "pending";
                  const first = r.employees?.first_name ?? "—";
                  const last = r.employees?.last_name ?? "";
                  return (
                    <tr
                      key={r.id}
                      className="text-zinc-900 dark:text-zinc-100"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <Avatar initials={initials(first, last)} />
                          <div className="leading-tight">
                            <div className="font-medium">
                              {first} {last}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                              {r.employees?.department ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 text-sm">
                          {meta ? (
                            <>
                              <span
                                className={`h-2 w-2 rounded-full ${meta.dot}`}
                                aria-hidden
                              />
                              {meta.name}
                            </>
                          ) : (
                            code
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-sm text-zinc-600 dark:text-zinc-400">
                        {formatRange(r.start_date, r.end_date)}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {Number(r.days)}
                      </td>
                      <td className="py-3 pr-4 text-sm text-zinc-600 dark:text-zinc-400">
                        {r.reason ?? "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={displayStatus} />
                      </td>
                      <td className="py-3 text-right text-xs text-zinc-500 dark:text-zinc-500">
                        {r.status === "submitted" && approver ? (
                          <span className="italic">Approve/deny in Phase 3</span>
                        ) : r.reviewed_at ? (
                          `Reviewed ${r.reviewed_at.slice(0, 10)}`
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
