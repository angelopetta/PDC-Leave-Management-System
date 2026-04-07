import { Card, StubBanner } from "../ui";
import {
  CALENDAR_MONTH_LABEL,
  CALENDAR_YEAR,
  CALENDAR_MONTH,
  SAMPLE_CALENDAR_EVENTS,
  LEAVE_TYPES,
} from "@/lib/sample-data";

export const dynamic = "force-dynamic";

// Build a 6-row calendar grid for the configured month.
function buildCalendarCells() {
  const firstOfMonth = new Date(CALENDAR_YEAR, CALENDAR_MONTH, 1);
  const daysInMonth = new Date(
    CALENDAR_YEAR,
    CALENDAR_MONTH + 1,
    0,
  ).getDate();
  const startWeekday = firstOfMonth.getDay(); // 0 = Sunday

  // 6 rows x 7 days = 42 cells (standard month grid)
  const cells: ({ day: number } | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length < 42) cells.push(null);
  return cells;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const cells = buildCalendarCells();

  return (
    <>
      <StubBanner>
        Events are hardcoded sample data for April 2026 (matches the client
        prototype). Real calendar rendering from{" "}
        <code className="font-mono">leave_requests</code> with month
        navigation lands in a later PR.
      </StubBanner>

      <Card>
        {/* Month header + legend */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {CALENDAR_MONTH_LABEL}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {LEAVE_TYPES.map((t) => (
                <div key={t.code} className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${t.dot}`}
                    aria-hidden
                  />
                  {t.name}
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-3 rounded-sm border border-dashed border-zinc-400 dark:border-zinc-500"
                  aria-hidden
                />
                Pending
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-500 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
              aria-label="Previous month"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              disabled
              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-500 shadow-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
              aria-label="Next month"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-zinc-200 pb-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {DAYS.map((d) => (
            <div key={d} className="px-2 text-center uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-800">
          {cells.map((cell, i) => {
            if (!cell) {
              return (
                <div
                  key={i}
                  className="min-h-[90px] bg-zinc-50 dark:bg-zinc-950"
                />
              );
            }
            const events = SAMPLE_CALENDAR_EVENTS.filter(
              (e) => cell.day >= e.startDay && cell.day <= e.endDay,
            );
            return (
              <div
                key={i}
                className="min-h-[90px] bg-white p-1.5 dark:bg-zinc-900"
              >
                <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                  {cell.day}
                </div>
                <div className="mt-1 space-y-1">
                  {events.map((e) => {
                    const meta = LEAVE_TYPES.find((t) => t.code === e.type)!;
                    const pending = e.status === "pending";
                    return (
                      <div
                        key={e.id + "-" + cell.day}
                        className={
                          pending
                            ? `rounded border border-dashed ${meta.border} bg-transparent px-1.5 py-0.5 text-xs text-zinc-700 dark:text-zinc-300`
                            : `rounded ${meta.color} px-1.5 py-0.5 text-xs font-medium text-white`
                        }
                      >
                        {e.firstName}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
