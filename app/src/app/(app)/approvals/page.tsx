import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, StubBanner } from "../ui";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate: only CEO and Lead Finance Officer should see this page.
  // The nav hides the link for non-approvers but we also enforce here,
  // since any authenticated user could hit /approvals directly.
  const { data: me } = await supabase
    .from("employees")
    .select("job_title")
    .eq("auth_user_id", user!.id)
    .maybeSingle();

  const isApprover =
    me?.job_title === "Chief Executive Officer" ||
    me?.job_title === "Lead Finance Officer";

  if (!isApprover) {
    redirect("/");
  }

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Pending leave requests that need your review."
      />

      <StubBanner>
        This inbox will populate once employees can submit requests. For now
        it&apos;s empty by design.
      </StubBanner>

      <Card>
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="pb-3">Submitted</th>
                <th className="pb-3">Employee</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Dates</th>
                <th className="pb-3 text-right">Days</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  No pending requests.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
