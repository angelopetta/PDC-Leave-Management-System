import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "../ui";
import { LEAVE_TYPES } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CalendarEvent = {
  id: string;
  firstName: string;
  lastName: string;
  leaveTypeCode: string;
  status: "approved" | "submitted";
  startDate: string;
  endDate: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Parse `?month=YYYY-MM` into [year, month0]. Falls back to today. */
function parseMonth(raw: string | undefined): [number, number] {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (y >= 2020 && y <= 2035 && m >= 1 && m <= 12) return [y, m - 1];
  }
  const now = new Date();
  return [now.getFullYear(), now.getMonth()];
}

/** Encode year + 0-indexed month → `YYYY-MM` for query strings. */
function mp(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Build 5- or 6-row calendar grid; null = blank cell. */
function buildGrid(y: number, m: number): (number | null)[] {
  const startDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const [year, month] = parseMonth(monthParam);

  const dim = new Date(year, month + 1, 0).getDate();
  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;

  const supabase = await createClient();

  // Parallel fetch: leave requests overlapping this month + holidays.
  const [reqRes, holRes] = await Promise.all([
    supabase
      .from("leave_requests")
      .select(
        `id, start_date, end_date, status,
         employees!employee_id(first_name, last_name),
         leave_types(code)`,
      )
      .in("status", ["approved", "submitted"])
      .lte("start_date", lastDay)
      .gte("end_date", firstDay)
      .order("start_date"),
    supabase
      .from("holidays")
      .select("date, name")
      .gte("date", firstDay)
      .lte("date", lastDay),
  ]);

  // Map raw rows → typed events.
  type ReqRow = {
    id: string;
    start_date: string;
    end_date: string;
    status: string;
    employees: { first_name: string; last_name: string } | null;
    leave_types: { code: string } | null;
  };
  const events: CalendarEvent[] = (
    (reqRes.data ?? []) as unknown as ReqRow[]
  ).map((r) => ({
    id: r.id,
    firstName: r.employees?.first_name ?? "",
    lastName: r.employees?.last_name ?? "",
    leaveTypeCode: r.leave_types?.code ?? "",
    status: r.status as "approved" | "submitted",
    startDate: r.start_date,
    endDate: r.end_date,
  }));

  // Holidays keyed by day-of-month.
  const holidays = new Map<number, string>();
  for (const h of (holRes.data ?? []) as unknown as Array<{
    date: string;
    name: string;
  }>) {
    holidays.set(parseInt(h.date.slice(8)), h.name);
  }

  // Pre-compute events per day-of-month for O(1) lookup during render.
  const byDay = new Map<number, CalendarEvent[]>();
  for (const e of events) {
    const s = e.startDate < firstDay ? 1 : parseInt(e.startDate.slice(8));
    const en = e.endDate > lastDay ? dim : parseInt(e.endDate.slice(8));
    for (let d = s; d <= en; d++) {
      const arr = byDay.get(d) ?? [];
      arr.push(e);
      byDay.set(d, arr);
    }
  }

  const grid = buildGrid(year, month);
  const now = new Date();
  const isThisMonth =
    now.getFullYear() === year && now.getMonth() === month;
  const todayDay = now.getDate();

  const prev =
    month === 0
      ? { y: year - 1, m: 11 }
      : { y: year, m: month - 1 };
  const next =
    month === 11
      ? { y: year + 1, m: 0 }
      : { y: year, m: month + 1 };

  const MAX_PILLS = 3;

  return (
    <Card>
      {/* ---- Header: title + legend + navigation ---- */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {MONTH_NAMES[month]} {year}
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
          <a
            href="/api/calendar/ics"
            download
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Export .ics
          </a>
          {!isThisMonth && (
            <Link
              href={`/calendar?month=${mp(now.getFullYear(), now.getMonth())}`}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Today
            </Link>
          )}
          <Link
            href={`/calendar?month=${mp(prev.y, prev.m)}`}
            className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-500 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
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
          </Link>
          <Link
            href={`/calendar?month=${mp(next.y, next.m)}`}
            className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-500 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
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
          </Link>
        </div>
      </div>

      {/* ---- Day-of-week headers ---- */}
      <div className="grid grid-cols-7 border-b border-zinc-200 pb-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {DAYS.map((d) => (
          <div key={d} className="px-2 text-center uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* ---- Calendar grid ---- */}
      <div className="grid grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-800">
        {grid.map((day, i) => {
          if (day === null) {
            return (
              <div
                key={i}
                className="min-h-[90px] bg-zinc-50 dark:bg-zinc-950"
              />
            );
          }

          const dow = i % 7;
          const weekend = dow === 0 || dow === 6;
          const isToday = isThisMonth && day === todayDay;
          const holiday = holidays.get(day);
          const dayEvents = byDay.get(day) ?? [];
          const overflow =
            dayEvents.length > MAX_PILLS
              ? dayEvents.length - MAX_PILLS
              : 0;

          return (
            <div
              key={i}
              className={[
                "min-h-[90px] p-1.5",
                weekend
                  ? "bg-zinc-50 dark:bg-zinc-950"
                  : holiday
                    ? "bg-amber-50/50 dark:bg-amber-950/20"
                    : "bg-white dark:bg-zinc-900",
                isToday ? "ring-2 ring-inset ring-blue-500" : "",
              ].join(" ")}
            >
              {/* Day number + holiday label */}
              <div className="flex items-center justify-between">
                <span
                  className={
                    isToday
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white"
                      : weekend
                        ? "text-xs text-zinc-400 dark:text-zinc-600"
                        : "text-xs text-zinc-500 dark:text-zinc-400"
                  }
                >
                  {day}
                </span>
                {holiday && (
                  <span
                    className="max-w-[80px] truncate text-[10px] text-amber-700 dark:text-amber-400"
                    title={holiday}
                  >
                    {holiday}
                  </span>
                )}
              </div>

              {/* Leave event pills */}
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, MAX_PILLS).map((e) => {
                  const meta = LEAVE_TYPES.find(
                    (t) => t.code === e.leaveTypeCode,
                  );
                  const pending = e.status === "submitted";
                  return (
                    <div
                      key={e.id}
                      title={`${e.firstName} ${e.lastName} \u2014 ${meta?.name ?? e.leaveTypeCode}${pending ? " (pending)" : ""}`}
                      className={
                        pending
                          ? `truncate rounded border border-dashed ${meta?.border ?? "border-zinc-400"} bg-transparent px-1 py-px text-[10px] leading-tight text-zinc-700 dark:text-zinc-300`
                          : `truncate rounded ${meta?.color ?? "bg-zinc-500"} px-1 py-px text-[10px] font-medium leading-tight text-white`
                      }
                    >
                      {e.firstName}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No leave requests for {MONTH_NAMES[month]} {year}.
        </div>
      )}
    </Card>
  );
}
