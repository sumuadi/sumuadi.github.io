import { createClient } from "npm:@supabase/supabase-js@2";

export interface AdminUser {
  id: string;
  email: string;
}

// Gateway verify_jwt is intentionally off for admin-* functions (see config.toml) because
// the public anon key is itself a validly-signed JWT and would pass that check trivially.
// Instead we call auth.getUser(token) — which only succeeds for a real logged-in session —
// and then gate on an email allowlist (ADMIN_EMAILS secret), since Auth signup isn't locked
// down at the project level.
export async function requireAdmin(req: Request): Promise<AdminUser | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user || !data.user.email) return null;

  const allowed = (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(data.user.email.toLowerCase())) return null;

  return { id: data.user.id, email: data.user.email };
}
