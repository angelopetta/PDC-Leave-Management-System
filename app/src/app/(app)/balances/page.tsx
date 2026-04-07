import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, isApprover } from "@/lib/auth";
import { Card, Avatar, StubBanner } from "../ui";
import { LEAVE_TYPES, type LeaveTypeCode } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

const FISCAL_YEAR = 2026;

// Display order across the table — matches the prototype Balances tab.
const COLUMN_ORDER: LeaveTypeCode[] = [
  "vacation",
  "sick",
  "personal",
  "cultural",
  "bereavement",
];

type EntitlementRow = {
  employee_id: string;
  granted: number;
  used: number;
  pending: number;
  remaining: number;
  leave_types: { code: string } | null;
};

type EmployeeRow = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
};

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function BalanceCell({
  used,
  granted,
}: {
  used: number;
  granted: number;
}) {
  const remaining = Math.max(0, granted - used);
  const pct = granted > 0 ? (used / granted) * 100 : 0;
  if (granted === 0) {
    return (
      <span className="text-xs text-zinc-500 dark:text-zinc-500">—</span>
    );
  }
  return (
    <div className="min-w-[90px]">
      <div className="text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
        <span className="font-semibold">{remaining}</span>
        <span className="text-zinc-500 dark:text-zinc-400"> / {granted}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full bg-zinc-900 dark:bg-zinc-50"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export default async function BalancesPage() {
  const supabase = await createClient();
  const me = await getCurrentEmployee();
  const approver = isApprover(me ? { jobTitle: me.jobTitle } : null);

  // RLS handles the filtering: approvers see all employees + entitlements,
  // non-approvers see only their own row.
  const [employeesRes, entitlementsRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name, job_title")
      .eq("status", "active")
      .order("employee_code"),
    supabase
      .from("entitlements")
      .select(
        "employee_id, granted, used, pending, remaining, leave_types(code)",
      )
      .eq("fiscal_year", FISCAL_YEAR),
  ]);

  const employees = (employeesRes.data ?? []) as EmployeeRow[];
  const entitlements = (entitlementsRes.data ?? []) as unknown as EntitlementRow[];

  // Pivot: { [employeeId]: { [leaveTypeCode]: { granted, used } } }
  const byEmployee = new Map<
    string,
    Partial<Record<LeaveTypeCode, { granted: number; used: number }>>
  >();
  for (const e of entitlements) {
    const code = e.leave_types?.code as LeaveTypeCode | undefined;
    if (!code) continue;
    if (!byEmployee.has(e.employee_id)) byEmployee.set(e.employee_id, {});
    byEmployee.get(e.employee_id)![code] = {
      granted: Number(e.granted),
      used: Number(e.used),
    };
  }

  const error = employeesRes.error?.message ?? entitlementsRes.error?.message;

  return (
    <>
      {!approver ? (
        <StubBanner>
          You&apos;re viewing your own balances only. Approvers (CEO, Lead
          Finance Officer) see every employee&apos;s row.
        </StubBanner>
      ) : null}

      {employees.length === 0 && entitlements.length === 0 ? (
        <StubBanner>
          No entitlements have been backfilled yet. Run the FY 2026/27
          backfill migration ({" "}
          <code className="font-mono">
            20260408000000_backfill_entitlements_fy_2026.sql
          </code>
          ) via <code className="font-mono">supabase db push</code>.
        </StubBanner>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Failed to load balances: {error}
        </div>
      ) : null}

      <Card title="Employee Leave Balances">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="pb-3 pr-4">Employee</th>
                {COLUMN_ORDER.map((code) => {
                  const meta = LEAVE_TYPES.find((t) => t.code === code)!;
                  return (
                    <th key={code} className="pb-3 pr-4">
                      {meta.name}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {employees.length === 0 ? (
                <tr>
                  <td
                    colSpan={1 + COLUMN_ORDER.length}
                    className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    No employees visible.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const balances = byEmployee.get(emp.id) ?? {};
                  return (
                    <tr key={emp.id}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <Avatar
                            initials={initials(emp.first_name, emp.last_name)}
                          />
                          <div className="leading-tight">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {emp.first_name} {emp.last_name}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                              {emp.job_title ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      {COLUMN_ORDER.map((code) => {
                        const cell = balances[code];
                        return (
                          <td key={code} className="py-3 pr-4">
                            {cell ? (
                              <BalanceCell
                                used={cell.used}
                                granted={cell.granted}
                              />
                            ) : (
                              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
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
