"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "magic-link";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setMessage(null);

    const supabase = createClient();

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      // Session cookie is now set — navigate to the intended destination.
      router.push(next && next.startsWith("/") ? next : "/");
      router.refresh();
      return;
    }

    // magic-link mode
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback${
      next ? `?next=${encodeURIComponent(next)}` : ""
    }`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        // Only allow existing users — employees are provisioned by HR.
        shouldCreateUser: false,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage(
      "Check your inbox for a magic link. You can close this tab once you click it.",
    );
  }

  const busy = status === "sending" || status === "sent";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
        >
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@ki.example"
          disabled={busy}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      {mode === "password" ? (
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {status === "sending"
          ? mode === "password"
            ? "Signing in…"
            : "Sending…"
          : status === "sent"
            ? "Link sent"
            : mode === "password"
              ? "Sign in"
              : "Send magic link"}
      </button>

      {message ? (
        <p
          className={`text-xs ${
            status === "error"
              ? "text-red-700 dark:text-red-300"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          {message}
        </p>
      ) : null}

      <div className="border-t border-zinc-200 pt-4 text-center dark:border-zinc-800">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "password" ? "magic-link" : "password");
            setStatus("idle");
            setMessage(null);
          }}
          disabled={busy}
          className="text-xs text-zinc-600 underline hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {mode === "password"
            ? "Or send me a magic link instead"
            : "Or sign in with a password instead"}
        </button>
      </div>

      {mode === "password" ? (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
          Forgot your password? Ask an admin to reset it from the Supabase
          dashboard.
        </p>
      ) : null}
    </form>
  );
}
