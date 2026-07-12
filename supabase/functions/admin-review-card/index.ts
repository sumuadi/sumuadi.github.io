// PATCH /admin-review-card  { entry_id, action: "approve" | "invalidate", invalid_reason? }
// Reviews a winner's submitted card photos. Only operates on entries currently in
// winner_status='winner' (i.e. awaiting review).
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

  if (req.method !== "PATCH") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  let body: { entry_id?: string; action?: string; invalid_reason?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }

  if (!body.entry_id || (body.action !== "approve" && body.action !== "invalidate")) {
    return json({ error: "invalid_request" }, 400, cors);
  }
  if (body.action === "invalidate" && !body.invalid_reason) {
    return json({ error: "invalid_reason_required" }, 400, cors);
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
  if (entry.winner_status !== "winner") {
    return json({ error: "not_pending_review" }, 409, cors);
  }

  const update =
    body.action === "approve"
      ? { winner_status: "verified" }
      : { winner_status: "invalidated", invalid_reason: body.invalid_reason };

  const { data, error } = await supabase.from("entries").update(update).eq("id", body.entry_id).select().single();
  if (error) {
    console.error(error);
    return json({ error: "db_error" }, 500, cors);
  }

  return json(data, 200, cors);
});
