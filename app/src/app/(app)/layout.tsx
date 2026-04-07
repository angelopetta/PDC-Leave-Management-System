import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../auth/actions";
import { NavLink } from "./nav-link";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Middleware should already redirect, but belt-and-suspenders.
    redirect("/login");
  }

  // Look up the current employee so we can show their name and figure out
  // whether to render the Approvals link. RLS lets them read their own row;
  // approvers can read all but we only need the single row either way.
  const { data: me } = await supabase
    .from("employees")
    .select("first_name, last_name, job_title")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const isApprover =
    me?.job_title === "Chief Executive Officer" ||
    me?.job_title === "Lead Finance Officer";

  const displayName = me
    ? `${me.first_name} ${me.last_name}`
    : (user.email ?? "Unknown");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              PDC Leave
            </Link>
            <nav className="flex items-center gap-1">
              <NavLink href="/">My leave</NavLink>
              <NavLink href="/request">Request leave</NavLink>
              <NavLink href="/my-requests">My requests</NavLink>
              <NavLink href="/team">Team</NavLink>
              {isApprover ? (
                <NavLink href="/approvals">Approvals</NavLink>
              ) : null}
            </nav>
          </div>
          <form action={signOut} className="flex items-center gap-3">
            <div className="text-right text-xs leading-tight">
              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                {displayName}
              </div>
              <div className="text-zinc-500 dark:text-zinc-400">
                {me?.job_title ?? user.email}
              </div>
            </div>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
