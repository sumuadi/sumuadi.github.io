// GET /public-event-info — no auth required. Returns only the fields safe to show on the
// public landing page (dates + announce flag), so index.html can render the right CTA state
// (before entry / open for entry / entry closed / announced) without needing a login first.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("event_config")
    .select("event_name, entry_start, entry_end, announce_at, is_announced")
    .eq("id", 1)
    .single();

  if (error || !data) {
    console.error(error);
    return json({ error: "db_error" }, 500, cors);
  }

  return json(data, 200, cors);
});
