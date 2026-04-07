import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader, Card } from "../ui";
import { NewRequestForm, type MyBalances } from "./new-request-form";

export const dynamic = "force-dynamic";

const FISCAL_YEAR = 2026;
const FISCAL_YEAR_START = `${FISCAL_YEAR}-04-01`;
const FISCAL_YEAR_END = `${FISCAL_YEAR + 1}-03-31`;

type EntitlementRow = {
  granted: number;
  used: number;
  pending: number;
  leave_types: { code: string } | null;
};

export default async function NewRequestPage() {
  const me = await getCurrentEmployee();
  const supabase = await createClient();

  const [entitlementsRes, holidaysRes] = await Promise.all([
    supabase
      .from("entitlements")
      .select("granted, used, pending, leave_types(code)")
      .eq("employee_id", me?.id ?? "")
      .eq("fiscal_year", FISCAL_YEAR),
    supabase
      .from("holidays")
      .select("date")
      .gte("date", FISCAL_YEAR_START)
      .lte("date", FISCAL_YEAR_END),
  ]);

  const balances: MyBalances = {};
  for (const r of (entitlementsRes.data ?? []) as unknown as EntitlementRow[]) {
    const code = r.leave_types?.code;
    if (!code) continue;
    balances[code as keyof MyBalances] = {
      granted: Number(r.granted),
      used: Number(r.used),
      pending: Number(r.pending),
    };
  }

  const holidays = ((holidaysRes.data ?? []) as { date: string }[]).map(
    (h) => h.date,
  );

  return (
    <>
      <PageHeader
        title="New Leave Request"
        description="Submit a new leave request. In-policy requests auto-approve immediately; judgment calls route to the approver inbox."
        action={
          <Link
            href="/"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </Link>
        }
      />

      <div className="max-w-xl">
        <Card>
          <NewRequestForm balances={balances} holidays={holidays} />
        </Card>
      </div>
    </>
  );
}
