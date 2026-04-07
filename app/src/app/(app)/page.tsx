import Link from "next/link";
import { PageHeader, Card, StubBanner } from "./ui";

export const dynamic = "force-dynamic";

// Hardcoded sample balances for the v1 leave types. These will be replaced
// by a real query against `entitlements` once that table is populated by
// the policy engine.
const SAMPLE_BALANCES = [
  { code: "vacation", name: "Vacation", used: 0, total: 15 },
  { code: "sick", name: "Sick", used: 0, total: 15 },
  { code: "bereavement", name: "Bereavement", used: 0, total: 5 },
  { code: "cultural", name: "Cultural", used: 0, total: 2 },
  { code: "personal", name: "Personal", used: 0, total: 2 },
];

export default async function MyLeavePage() {
  return (
    <>
      <PageHeader
        title="My leave"
        description="Your balances for the current fiscal year (April 1, 2026 – March 31, 2027)."
        action={
          <Link
            href="/request"
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Request leave
          </Link>
        }
      />

      <StubBanner>
        Balances below are hardcoded samples. The real numbers will come from
        the <code className="font-mono">entitlements</code> table once the
        policy engine backfill runs.
      </StubBanner>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {SAMPLE_BALANCES.map((b) => {
          const remaining = b.total - b.used;
          return (
            <div
              key={b.code}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {b.name}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {remaining}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  / {b.total} days
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {b.used} used
              </div>
            </div>
          );
        })}
      </div>

      <Card
        title="Recent requests"
        footer={
          <>
            Showing your 5 most recent requests. Full history on{" "}
            <Link
              href="/my-requests"
              className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              My requests
            </Link>
            .
          </>
        }
      >
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          You haven&apos;t submitted any requests yet.
        </div>
      </Card>
    </>
  );
}
