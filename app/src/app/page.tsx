import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./auth/actions";
import { vacationTierForYears } from "../../../policy/rules";

export const dynamic = "force-dynamic";

type Employee = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  employment_type: string;
  hire_date: string;
  status: string;
};

function yearsOfService(hireDate: string, asOf: Date): number {
  const hire = new Date(hireDate);
  let years = asOf.getFullYear() - hire.getFullYear();
  const monthDiff = asOf.getMonth() - hire.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < hire.getDate())) {
    years -= 1;
  }
  return Math.max(0, years);
}

function formatEmploymentType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-")
    .replace("Permanent-Full-Time", "Permanent Full-Time")
    .replace("Part-Time", "Part-Time");
}

export default async function EmployeesPage() {
  // RLS-respecting server client. Middleware guarantees we have a session
  // here; RLS decides which rows the current employee can read.
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: employees, error } = await supabase
    .from("employees")
    .select(
      "id, employee_code, first_name, last_name, email, job_title, department, employment_type, hire_date, status",
    )
    .eq("status", "active")
    .order("employee_code");

  // Reference date for years-of-service: start of current fiscal year (April 1).
  const now = new Date();
  const fyStart =
    now.getMonth() >= 3
      ? new Date(now.getFullYear(), 3, 1)
      : new Date(now.getFullYear() - 1, 3, 1);

  return (
    <main className="min-h-screen bg-zinc-50 p-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              PDC Leave Management System
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Employees — as of fiscal year starting{" "}
              {fyStart.toLocaleDateString("en-CA", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <form action={signOut} className="flex items-center gap-3">
            {user?.email ? (
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {user.email}
              </span>
            ) : null}
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </header>

        {error ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <p className="font-medium">Failed to load employees</p>
            <p className="mt-1 font-mono text-xs">{error.message}</p>
            <p className="mt-2 text-xs">
              Check that the Supabase environment variables are set in Vercel
              and that the <code>employees</code> table is seeded.
            </p>
          </div>
        ) : employees && employees.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 text-left text-xs font-medium uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Job Title</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Years</th>
                  <th className="px-4 py-3 text-right">Vacation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {(employees as Employee[]).map((e) => {
                  const years = yearsOfService(e.hire_date, fyStart);
                  const isTerm = e.employment_type === "term";
                  const tier = vacationTierForYears(years);
                  return (
                    <tr
                      key={e.id}
                      className="text-zinc-900 dark:text-zinc-100"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {e.employee_code}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {e.first_name} {e.last_name}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {e.job_title ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {e.department ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {formatEmploymentType(e.employment_type)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {years}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {isTerm ? (
                          <span
                            className="text-xs text-zinc-500 dark:text-zinc-400"
                            title="Term employees receive vacation pay per pay period"
                          >
                            pay per period
                          </span>
                        ) : (
                          <>
                            <span className="font-medium">{tier.days}</span>
                            <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                              days / {tier.payPercent}%
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            No employees found. Seed the database with{" "}
            <code className="font-mono text-xs">
              supabase/seed/employees.mock.sql
            </code>
            .
          </div>
        )}

        <footer className="mt-8 text-xs text-zinc-500 dark:text-zinc-500">
          <p>
            Read-only view. Vacation entitlement is calculated from{" "}
            <Link
              href="https://github.com/angelopetta/PDC-Leave-Management-System/blob/main/policy/rules.ts"
              className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              policy/rules.ts
            </Link>{" "}
            per KI policy 5.3.
          </p>
        </footer>
      </div>
    </main>
  );
}
