import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, isApprover } from "@/lib/auth";
import { PageHeader, Card } from "../ui";
import { BackdateForm } from "./backdate-form";

export const dynamic = "force-dynamic";

const FISCAL_YEAR = 2026;
const FISCAL_YEAR_START = `${FISCAL_YEAR}-04-01`;
const FISCAL_YEAR_END = `${FISCAL_YEAR + 1}-03-31`;

export default async function BackdatePage() {
  const me = await getCurrentEmployee();
  const approver = isApprover(me ? { jobTitle: me.jobTitle } : null);

  // Only approvers can access this page.
  if (!approver) {
    redirect("/");
  }

  const supabase = await createClient();

  const [employeesRes, leaveTypesRes, holidaysRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name")
      .eq("status", "active")
      .order("employee_code"),
    supabase
      .from("leave_types")
      .select("code, name")
      .eq("is_v1", true)
      .order("name"),
    supabase
      .from("holidays")
      .select("date")
      .gte("date", FISCAL_YEAR_START)
      .lte("date", FISCAL_YEAR_END),
  ]);

  const employees = (employeesRes.data ?? []).map(
    (e: {
      id: string;
      employee_code: string;
      first_name: string;
      last_name: string;
    }) => ({
      id: e.id,
      code: e.employee_code,
      name: `${e.first_name} ${e.last_name}`,
    }),
  );

  const leaveTypes = (leaveTypesRes.data ?? []).map(
    (lt: { code: string; name: string }) => ({
      code: lt.code,
      name: lt.name,
    }),
  );

  const holidays = ((holidaysRes.data ?? []) as { date: string }[]).map(
    (h) => h.date,
  );

  return (
    <>
      <PageHeader
        title="Record Past Leave"
        description="Enter leave that was booked before the system went live. These entries skip policy checks and are recorded as already-approved with the balance adjusted immediately."
      />

      <div className="max-w-xl">
        <Card>
          <BackdateForm
            employees={employees}
            leaveTypes={leaveTypes}
            holidays={holidays}
          />
        </Card>
      </div>
    </>
  );
}
