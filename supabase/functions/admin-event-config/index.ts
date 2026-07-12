// GET /admin-event-config — read event_config (id=1)
// PATCH /admin-event-config — update any subset of fields, including the is_announced toggle
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";

const EDITABLE_FIELDS = [
  "event_name",
  "entry_start",
  "entry_end",
  "announce_at",
  "is_announced",
  "winner_count",
  "reserve_count",
  "submit_deadline",
];

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401, cors);

  const supabase = getServiceClient();

  if (req.method === "GET") {
    const { data, error } = await supabase.from("event_config").select("*").eq("id", 1).single();
    if (error) {
      console.error(error);
      return json({ error: "db_error" }, 500, cors);
    }
    return json(data, 200, cors);
  }

  if (req.method === "PATCH") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_request" }, 400, cors);
    }

    const update: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) update[key] = body[key];
    }
    if (Object.keys(update).length === 0) {
      return json({ error: "no_fields" }, 400, cors);
    }

    const { data, error } = await supabase
      .from("event_config")
      .update(update)
      .eq("id", 1)
      .select()
      .single();
    if (error) {
      console.error(error);
      return json({ error: "db_error" }, 500, cors);
    }
    return json(data, 200, cors);
  }

  return json({ error: "method_not_allowed" }, 405, cors);
});
