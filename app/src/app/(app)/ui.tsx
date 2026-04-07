import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {title ? (
        <div className="border-b border-zinc-200 px-5 py-3 text-xs font-medium uppercase tracking-wider text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {title}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
      {footer ? (
        <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function StubBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-semibold">Placeholder screen — </span>
      {children}
    </div>
  );
}
