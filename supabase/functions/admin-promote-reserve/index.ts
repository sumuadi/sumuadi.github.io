// POST /admin-promote-reserve  { entry_id }
// Promotes a specific reserve entry to winner status (used after a winner is invalidated).
// Sending the winner-announcement push to the promoted entry is handled in Phase 3.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401, cors);

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  let body: { entry_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }
  if (!body.entry_id) {
    return json({ error: "invalid_request" }, 400, cors);
  }

  const supabase = getServiceClient();

  const { data: entry, error: fetchError } = await supabase
    .from("entries")
    .select("id, winner_status")
    .eq("id", body.entry_id)
    .single();
  if (fetchError || !entry) {
    return json({ error: "entry_not_found" }, 404, cors);
  }
  if (entry.winner_status !== "reserve") {
    return json({ error: "not_a_reserve" }, 409, cors);
  }

  const { data, error } = await supabase
    .from("entries")
    .update({ winner_status: "winner" })
    .eq("id", body.entry_id)
    .select()
    .single();
  if (error) {
    console.error(error);
    return json({ error: "db_error" }, 500, cors);
  }

  return json(data, 200, cors);
});
