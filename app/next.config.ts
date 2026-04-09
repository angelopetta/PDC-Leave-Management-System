import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The Next app lives in /app but imports the canonical policy engine
  // from /policy at the repo root (the same module is also used by the
  // Supabase Edge Functions, which is why it can't move into /app). By
  // default Turbopack treats /app as the workspace root and refuses
  // imports outside it; pointing the tracing root at the repo root
  // unblocks the policy/engine + policy/rules imports.
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
