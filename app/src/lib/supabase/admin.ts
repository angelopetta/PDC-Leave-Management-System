import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client — uses the service_role key and bypasses RLS.
 *
 * NEVER import this from a Client Component. Server-only (Server Components,
 * Route Handlers, Server Actions, Edge Functions).
 *
 * Use sparingly. Prefer the regular server client (which respects RLS) once
 * auth is wired up and proper RLS policies exist.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
