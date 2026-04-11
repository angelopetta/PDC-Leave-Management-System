import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, isApprover } from "@/lib/auth";

/**
 * GET /api/calendar/ics
 *
 * Downloads an ICS (iCalendar) file of approved leave for the current user.
 * Approvers get the full org calendar; non-approvers get their own leave only
 * (enforced by RLS).
 */
export async function GET() {
  const supabase = await createClient();
  const me = await getCurrentEmployee();

  if (!me) {
    return new Response("Unauthorized", { status: 401 });
  }

  const approver = isApprover({ jobTitle: me.jobTitle });

  const { data } = await supabase
    .from("leave_requests")
    .select(
      `id, start_date, end_date,
       employees!employee_id(first_name, last_name),
       leave_types(code, name)`,
    )
    .eq("status", "approved")
    .order("start_date");

  type IcsRow = {
    id: string;
    start_date: string;
    end_date: string;
    employees: { first_name: string; last_name: string } | null;
    leave_types: { code: string; name: string } | null;
  };

  const rows = (data ?? []) as unknown as IcsRow[];

  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z/, "Z");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KI Leave Tracker//EN",
    `X-WR-CALNAME:KI Leave${approver ? " (All Staff)" : ""}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const r of rows) {
    const name = r.employees
      ? `${r.employees.first_name} ${r.employees.last_name}`
      : "Employee";
    const type = r.leave_types?.name ?? r.leave_types?.code ?? "Leave";

    // ICS all-day DTSTART is inclusive, DTEND is exclusive (day after last).
    const dtstart = r.start_date.replace(/-/g, "");
    const endDate = new Date(r.end_date + "T00:00:00");
    endDate.setDate(endDate.getDate() + 1);
    const dtend = endDate.toISOString().slice(0, 10).replace(/-/g, "");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@ki-leave`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${name} - ${type}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=ki-leave.ics",
    },
  });
}
