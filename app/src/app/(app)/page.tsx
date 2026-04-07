import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, isApprover } from "@/lib/auth";
import { Card, StubBanner } from "./ui";
import {
  DASHBOARD_METRICS,
  LEAVE_TYPES,
  type LeaveTypeCode,
} from "@/lib/sample-data";

export const dynamic = "force-dynamic";

const FISCAL_YEAR = 2026;

const MY_BALANCE_ORDER: LeaveTypeCode[] = [
  "vacation",
  "sick",
  "bereavement",
  "cultural",
  "personal",
];

type EntitlementRow = {
  employee_id: string;
  granted: number;
  used: number;
  pending: number;
  remaining: number;
  leave_types: { code: string; name: string } | null;
};

function MetricCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  tone: "amber" | "emerald" | "red" | "blue";
  icon: React.ReactNode;
}) {
  const toneStyles = {
    amber:
      "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    emerald:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  };
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {label}
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {value}
          </div>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneStyles[tone]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const me = await getCurrentEmployee();
  const approver = isApprover(me ? { jobTitle: me.jobTitle } : null);

  // RLS will return only the current employee's rows for non-approvers,
  // and every active employee's rows for approvers — same query in both
  // cases.
  const { data: entitlementsData } = await supabase
    .from("entitlements")
    .select(
      "employee_id, granted, used, pending, remaining, leave_types(code, name)",
    )
    .eq("fiscal_year", FISCAL_YEAR);

  const entitlements = (entitlementsData ?? []) as unknown as EntitlementRow[];

  // My balances — just the current employee's rows, keyed by leave type.
  const myBalances = new Map<
    LeaveTypeCode,
    { granted: number; used: number; remaining: number }
  >();
  if (me) {
    for (const e of entitlements) {
      if (e.employee_id !== me.id) continue;
      const code = e.leave_types?.code as LeaveTypeCode | undefined;
      if (!code) continue;
      myBalances.set(code, {
        granted: Number(e.granted),
        used: Number(e.used),
        remaining: Number(e.remaining),
      });
    }
  }

  // Org-wide usage by leave type (approver view only).
  const orgUsage = new Map<
    LeaveTypeCode,
    { used: number; granted: number }
  >();
  if (approver) {
    for (const e of entitlements) {
      const code = e.leave_types?.code as LeaveTypeCode | undefined;
      if (!code) continue;
      const prev = orgUsage.get(code) ?? { used: 0, granted: 0 };
      orgUsage.set(code, {
        used: prev.used + Number(e.used),
        granted: prev.granted + Number(e.granted),
      });
    }
  }

  return (
    <>
      {/* Metric cards — still sample data, Phase 4 will wire these to real
          aggregations from leave_requests. */}
      <StubBanner>
        Metric cards below are sample data. Real Pending / Approved /
        Denied / Total Days Off counts land in Phase 4 once the leave
        request flow is in.
      </StubBanner>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Pending Requests"
          value={DASHBOARD_METRICS.pending}
          tone="amber"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />
        <MetricCard
          label="Approved (YTD)"
          value={DASHBOARD_METRICS.approvedYtd}
          tone="emerald"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
        />
        <MetricCard
          label="Denied (YTD)"
          value={DASHBOARD_METRICS.deniedYtd}
          tone="red"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" x2="9" y1="9" y2="15" />
              <line x1="9" x2="15" y1="9" y2="15" />
            </svg>
          }
        />
        <MetricCard
          label="Total Days Off"
          value={DASHBOARD_METRICS.totalDaysOff}
          tone="blue"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
          }
        />
      </div>

      {/* My Balances — REAL DATA */}
      <Card title="My Balances">
        {myBalances.size === 0 ? (
          <div className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No entitlements found for fiscal year {FISCAL_YEAR}/27. The
            backfill migration may not have run yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {MY_BALANCE_ORDER.map((code) => {
              const meta = LEAVE_TYPES.find((t) => t.code === code)!;
              const bal = myBalances.get(code);
              if (!bal || bal.granted === 0) {
                return (
                  <div
                    key={code}
                    className="rounded-lg border border-dashed border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${meta.dot}`}
                        aria-hidden
                      />
                      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        {meta.name}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                      Not eligible
                    </div>
                  </div>
                );
              }
              const remaining = bal.granted - bal.used;
              return (
                <div
                  key={code}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${meta.dot}`}
                      aria-hidden
                    />
                    <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {meta.name}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {remaining}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      / {bal.granted} days
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {bal.used} used
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Org-wide usage bars — approver only, REAL DATA */}
        {approver ? (
          <Card title="Leave Usage by Type (All Staff)">
            <div className="space-y-4">
              {MY_BALANCE_ORDER.map((code) => {
                const meta = LEAVE_TYPES.find((t) => t.code === code)!;
                const row = orgUsage.get(code);
                const used = row?.used ?? 0;
                const granted = row?.granted ?? 0;
                const pct = granted > 0 ? (used / granted) * 100 : 0;
                return (
                  <div key={code}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${meta.dot}`}
                          aria-hidden
                        />
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {meta.name}
                        </span>
                      </div>
                      <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                        {used} / {granted} days used
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full ${meta.color}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        <Card title="Upcoming Approved Leave (30 days)">
          <div className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No upcoming approved leave in the next 30 days.
          </div>
        </Card>
      </div>
    </>
  );
}
