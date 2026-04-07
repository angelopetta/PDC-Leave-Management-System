import { Card, StubBanner, Avatar } from "../ui";
import { SAMPLE_BALANCES } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

function BalanceCell({
  used,
  total,
}: {
  used: number;
  total: number;
}) {
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? (used / total) * 100 : 0;
  return (
    <div className="min-w-[90px]">
      <div className="text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
        <span className="font-semibold">{remaining}</span>
        <span className="text-zinc-500 dark:text-zinc-400"> / {total}</span>
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

export default function BalancesPage() {
  return (
    <>
      <StubBanner>
        Balances are hardcoded sample data matching the client prototype. The
        approver view is shown for everyone at this stage; employees will
        eventually see only their own row via RLS.
      </StubBanner>

      <Card title="Employee Leave Balances">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="pb-3 pr-4">Employee</th>
                <th className="pb-3 pr-4">Vacation</th>
                <th className="pb-3 pr-4">Sick</th>
                <th className="pb-3 pr-4">Personal</th>
                <th className="pb-3 pr-4">Cultural/Ceremonial</th>
                <th className="pb-3">Bereavement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {SAMPLE_BALANCES.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <Avatar initials={b.initials} />
                      <div className="leading-tight">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {b.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {b.title}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <BalanceCell
                      used={b.vacation.used}
                      total={b.vacation.total}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <BalanceCell used={b.sick.used} total={b.sick.total} />
                  </td>
                  <td className="py-3 pr-4">
                    <BalanceCell
                      used={b.personal.used}
                      total={b.personal.total}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <BalanceCell
                      used={b.cultural.used}
                      total={b.cultural.total}
                    />
                  </td>
                  <td className="py-3">
                    <BalanceCell
                      used={b.bereavement.used}
                      total={b.bereavement.total}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
