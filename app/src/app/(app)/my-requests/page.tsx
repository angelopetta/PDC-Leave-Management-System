import Link from "next/link";
import { PageHeader, Card, StubBanner } from "../ui";

export const dynamic = "force-dynamic";

export default function MyRequestsPage() {
  return (
    <>
      <PageHeader
        title="My requests"
        description="Every leave request you've submitted, approved or not."
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
        No data wired up yet. Once requests can be submitted, this table will
        show them with status and approval notes.
      </StubBanner>

      <Card>
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="pb-3">Submitted</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Dates</th>
                <th className="pb-3 text-right">Days</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  No requests yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
