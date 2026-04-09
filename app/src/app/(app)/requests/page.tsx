import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, isApprover } from "@/lib/auth";
import { Card, StubBanner, StatusBadge, Avatar } from "../ui";
import { LEAVE_TYPES, type LeaveTypeCode } from "@/lib/sample-data";
import { InboxRow, type ConflictEntry } from "./inbox-row";

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
  employee_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: "draft" | "submitted" | "approved" | "denied" | "cancelled";
  recommendation: "auto_approve" | "review" | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  employees: {
    first_name: string;
    last_name: string;
    department: string | null;
    department_id: string | null;
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

/** True if the two date ranges share at least one day. */
function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Peak number of concurrent overlapping people on any weekday in [s,e]. */
function peakOverlap(
  startIso: string,
  endIso: string,
  others: Array<{ employeeId: string; startDate: string; endDate: string }>,
): number {
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  let peak = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const iso = cur.toISOString().slice(0, 10);
      const seen = new Set<string>();
      for (const o of others) {
        if (iso >= o.startDate && iso <= o.endDate) seen.add(o.employeeId);
      }
      if (seen.size > peak) peak = seen.size;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return peak;
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
  const [requestsRes, modeRes] = await Promise.all([
    supabase
      .from("leave_requests")
      .select(
        `
          id, employee_id, start_date, end_date, days, reason, status,
          recommendation, submitted_at, reviewed_at, review_notes,
          employees!employee_id(first_name, last_name, department, department_id),
          leave_types(code)
        `,
      )
      .in("status", ["submitted", "approved", "denied"])
      .order("submitted_at", { ascending: false }),
    supabase.rpc("get_auto_approval_mode"),
  ]);

  const { data, error } = requestsRes;
  const mode = (modeRes.data as string | null) ?? "shadow";

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

  // Department headcounts — only needed for the approver inbox conflict
  // view. One query, one map.
  const headcountByDept = new Map<string, number>();
  const minCoverageByDept = new Map<
    string,
    { name: string; minCoverage: number }
  >();
  if (approver) {
    const [headcountRes, deptRes] = await Promise.all([
      supabase
        .from("employees")
        .select("department_id")
        .eq("status", "active"),
      supabase.from("departments").select("id, name, min_coverage"),
    ]);
    for (const e of (headcountRes.data ?? []) as Array<{
      department_id: string | null;
    }>) {
      if (!e.department_id) continue;
      headcountByDept.set(
        e.department_id,
        (headcountByDept.get(e.department_id) ?? 0) + 1,
      );
    }
    for (const d of (deptRes.data ?? []) as Array<{
      id: string;
      name: string;
      min_coverage: number;
    }>) {
      minCoverageByDept.set(d.id, {
        name: d.name,
        minCoverage: d.min_coverage,
      });
    }
  }

  // Build conflict entries per pending row in one pass: for each pending
  // row, find other approved+submitted rows in the same department whose
  // dates overlap.
  function conflictsFor(row: LeaveRequestRow): ConflictEntry[] {
    if (!row.employees?.department_id) return [];
    const deptId = row.employees.department_id;
    return rows
      .filter(
        (other) =>
          other.id !== row.id &&
          (other.status === "submitted" || other.status === "approved") &&
          other.employees?.department_id === deptId &&
          other.employee_id !== row.employee_id &&
          rangesOverlap(
            row.start_date,
            row.end_date,
            other.start_date,
            other.end_date,
          ),
      )
      .map((other) => ({
        requestId: other.id,
        employeeName:
          `${other.employees?.first_name ?? ""} ${other.employees?.last_name ?? ""}`.trim() ||
          "—",
        startDate: other.start_date,
        endDate: other.end_date,
        status: other.status as "submitted" | "approved",
      }));
  }

  function coverageFor(row: LeaveRequestRow) {
    if (!row.employees?.department_id) return null;
    const deptId = row.employees.department_id;
    const dept = minCoverageByDept.get(deptId);
    if (!dept) return null;
    const headcount = headcountByDept.get(deptId) ?? 0;
    // Compute peak including this row by treating the requester as a
    // virtual "always-on" entry for the request range.
    const others = rows
      .filter(
        (other) =>
          (other.status === "submitted" || other.status === "approved") &&
          other.employees?.department_id === deptId,
      )
      .map((other) => ({
        employeeId: other.employee_id,
        startDate: other.start_date,
        endDate: other.end_date,
      }));
    return {
      departmentName: dept.name,
      headcount,
      minCoverage: dept.minCoverage,
      peak: peakOverlap(row.start_date, row.end_date, others),
    };
  }

  return (
    <>
      {!approver ? (
        <StubBanner>
          You&apos;re viewing your own requests only. Approvers see every
          employee&apos;s request.
        </StubBanner>
      ) : null}

      {approver && mode === "shadow" ? (
        <div className="mb-4 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          <span className="font-semibold">Shadow mode: </span>
          The policy engine is recommending approvals but every request still
          comes to you for sign-off. Once you&apos;re comfortable with the
          recommendations, HR can flip{" "}
          <code className="rounded bg-blue-100 px-1 dark:bg-blue-900">
            app_settings.auto_approval_mode
          </code>{" "}
          to <code>auto_with_fyi</code>.
        </div>
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
                  const isPendingForApprover =
                    r.status === "submitted" && approver;
                  return (
                    <tr
                      key={r.id}
                      className="text-zinc-900 dark:text-zinc-100"
                    >
                      <td className="py-3 pr-4 align-top">
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
                      <td className="py-3 pr-4 align-top">
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
                      <td className="py-3 pr-4 align-top text-sm text-zinc-600 dark:text-zinc-400">
                        {formatRange(r.start_date, r.end_date)}
                      </td>
                      <td className="py-3 pr-4 align-top tabular-nums">
                        {Number(r.days)}
                      </td>
                      <td className="py-3 pr-4 align-top text-sm text-zinc-600 dark:text-zinc-400">
                        {r.reason ?? "—"}
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <StatusBadge status={displayStatus} />
                      </td>
                      <td className="py-3 align-top text-right text-xs text-zinc-500 dark:text-zinc-500">
                        {isPendingForApprover ? (
                          <InboxRow
                            requestId={r.id}
                            recommendation={r.recommendation}
                            showRecommendation={mode === "shadow"}
                            conflicts={conflictsFor(r)}
                            coverage={coverageFor(r)}
                          />
                        ) : r.status === "denied" && r.review_notes ? (
                          <div className="leading-tight">
                            <div>
                              {r.reviewed_at
                                ? `Denied ${r.reviewed_at.slice(0, 10)}`
                                : "Denied"}
                            </div>
                            <div
                              className="mt-0.5 max-w-[16rem] truncate italic text-zinc-400"
                              title={r.review_notes}
                            >
                              {r.review_notes}
                            </div>
                          </div>
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
