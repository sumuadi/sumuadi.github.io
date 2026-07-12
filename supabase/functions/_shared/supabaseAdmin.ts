import { createClient } from "npm:@supabase/supabase-js@2";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected into every
// Edge Function's environment by Supabase — no manual secret needed for these two.
export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
