import Link from "next/link";
import { PageHeader, Card, StubBanner } from "../ui";
import { LEAVE_TYPES } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

export default function NewRequestPage() {
  return (
    <>
      <PageHeader
        title="New Leave Request"
        description="Submit a new leave request. In-policy requests are auto-approved."
        action={
          <Link
            href="/"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </Link>
        }
      />

      <StubBanner>
        This form doesn&apos;t save anything yet. Submit is disabled until the
        policy engine and <code className="font-mono">leave_requests</code>{" "}
        server action are wired up.
      </StubBanner>

      <div className="max-w-xl">
        <Card>
          <form className="space-y-5">
            <div>
              <label
                htmlFor="leave-type"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
              >
                Leave type
              </label>
              <select
                id="leave-type"
                name="leave_type"
                disabled
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="start-date"
                  className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
                >
                  Start date
                </label>
                <input
                  id="start-date"
                  name="start_date"
                  type="date"
                  disabled
                  className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label
                  htmlFor="end-date"
                  className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
                >
                  End date
                </label>
                <input
                  id="end-date"
                  name="end_date"
                  type="date"
                  disabled
                  className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="reason"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
              >
                Reason{" "}
                <span className="normal-case text-zinc-400">(optional)</span>
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={3}
                disabled
                placeholder="Add any context the approver should know"
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Link
                href="/"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled
                className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Submit request
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
