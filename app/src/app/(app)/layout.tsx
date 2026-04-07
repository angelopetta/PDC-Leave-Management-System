import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { signOut } from "../auth/actions";
import { NavLink } from "./nav-link";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentEmployee();

  if (!me) {
    // Middleware should already redirect, but belt-and-suspenders.
    redirect("/login");
  }

  const displayName = `${me.firstName} ${me.lastName}`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Top bar — brand left, user + sign out + New Request right */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Leave Tracker
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Vacation &amp; Leave Management
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden text-right text-xs leading-tight sm:block">
              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                {displayName}
              </div>
              <div className="text-zinc-500 dark:text-zinc-400">
                {me.jobTitle ?? me.email}
              </div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Sign out
              </button>
            </form>
            <Link
              href="/new-request"
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              New Request
            </Link>
          </div>
        </div>
      </header>

      {/* Tab nav — Dashboard / Requests / Calendar / Balances */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl px-6">
          <nav className="-mb-px flex gap-1">
            <NavLink href="/" icon="dashboard">
              Dashboard
            </NavLink>
            <NavLink href="/requests" icon="requests">
              Requests
            </NavLink>
            <NavLink href="/calendar" icon="calendar">
              Calendar
            </NavLink>
            <NavLink href="/balances" icon="balances">
              Balances
            </NavLink>
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
