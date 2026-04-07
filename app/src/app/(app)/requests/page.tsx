import Link from "next/link";
import { Card, StubBanner, StatusBadge, Avatar } from "../ui";
import { SAMPLE_REQUESTS, LEAVE_TYPES, type RequestStatus } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

const FILTERS: { key: "all" | RequestStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;

  const counts = {
    all: SAMPLE_REQUESTS.length,
    pending: SAMPLE_REQUESTS.filter((r) => r.status === "pending").length,
    approved: SAMPLE_REQUESTS.filter((r) => r.status === "approved").length,
    denied: SAMPLE_REQUESTS.filter((r) => r.status === "denied").length,
  };

  const rows =
    filter === "all"
      ? SAMPLE_REQUESTS
      : SAMPLE_REQUESTS.filter((r) => r.status === filter);

  return (
    <>
      <StubBanner>
        Requests are hardcoded sample data matching the client prototype.
        Approve and Deny buttons don&apos;t do anything yet. The approver
        view is shown for everyone at this stage; employee view (own
        requests only) will filter via RLS once real data lands.
      </StubBanner>

      <Card
        title="All Leave Requests"
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
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    No requests match this filter.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const meta = LEAVE_TYPES.find((t) => t.code === r.type)!;
                  return (
                    <tr key={r.id} className="text-zinc-900 dark:text-zinc-100">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <Avatar initials={r.employeeInitials} />
                          <div className="leading-tight">
                            <div className="font-medium">{r.employeeName}</div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                              {r.employeeDept}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span
                            className={`h-2 w-2 rounded-full ${meta.dot}`}
                            aria-hidden
                          />
                          {meta.name}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-sm text-zinc-600 dark:text-zinc-400">
                        {r.startDate === r.endDate
                          ? r.startDate
                          : `${r.startDate} – ${r.endDate}`}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{r.days}</td>
                      <td className="py-3 pr-4 text-sm text-zinc-600 dark:text-zinc-400">
                        {r.reason}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-3 text-right">
                        {r.status === "pending" ? (
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950"
                            >
                              Deny
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            Reviewed {r.reviewedOn}
                          </span>
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
