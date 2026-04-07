import { createClient } from "@/lib/supabase/server";

export type CurrentEmployee = {
  id: string;
  authUserId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  employmentType: string;
  hireDate: string;
};

/**
 * Resolves the currently signed-in employee. Returns null if there is no
 * authenticated user, or if the user has no matching `employees` row (which
 * would be a provisioning bug — every auth user should be linked to an
 * employee via auth_user_id).
 *
 * Pages and the layout should call this once per request and pass the
 * result down rather than re-querying.
 */
export async function getCurrentEmployee(): Promise<CurrentEmployee | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: row } = await supabase
    .from("employees")
    .select(
      "id, first_name, last_name, job_title, employment_type, hire_date",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!row) return null;

  return {
    id: row.id,
    authUserId: user.id,
    email: user.email ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    jobTitle: row.job_title,
    employmentType: row.employment_type,
    hireDate: row.hire_date,
  };
}

/**
 * Returns true if the given employee is a designated approver per
 * CLAUDE.md / PRD §2: the CEO is the primary approver, the Lead Finance
 * Officer is the backup. Mirrors the `is_approver()` Postgres function in
 * the RLS migration.
 */
export function isApprover(
  employee: { jobTitle: string | null } | null,
): boolean {
  if (!employee) return false;
  return (
    employee.jobTitle === "Chief Executive Officer" ||
    employee.jobTitle === "Lead Finance Officer"
  );
}
