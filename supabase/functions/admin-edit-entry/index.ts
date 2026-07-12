// PATCH /admin-edit-entry  { entry_id, product?, ball_number? }
// DELETE /admin-edit-entry?entry_id=...
// Support-desk override for mistaken entries (wrong number typed, wrong product picked, etc.)
// — no period or winner_status restriction, unlike the participant-facing edit in submit-entry.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";

const PRODUCTS = ["toner", "cream", "serum"];

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401, cors);

  const supabase = getServiceClient();

  if (req.method === "PATCH") {
    let body: { entry_id?: string; product?: string; ball_number?: number };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_request" }, 400, cors);
    }
    if (!body.entry_id) {
      return json({ error: "invalid_request" }, 400, cors);
    }
    if (body.product !== undefined && !PRODUCTS.includes(body.product)) {
      return json({ error: "invalid_product" }, 400, cors);
    }

    const update: Record<string, unknown> = {};
    if (body.product !== undefined) update.product = body.product;
    if (body.ball_number !== undefined) update.ball_number = body.ball_number;
    if (Object.keys(update).length === 0) {
      return json({ error: "no_fields" }, 400, cors);
    }

    const { data, error } = await supabase
      .from("entries")
      .update(update)
      .eq("id", body.entry_id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return json({ error: "number_taken" }, 409, cors);
      if (error.code === "23514") return json({ error: "invalid_ball_number" }, 400, cors);
      console.error(error);
      return json({ error: "db_error" }, 500, cors);
    }
    if (!data) return json({ error: "entry_not_found" }, 404, cors);

    return json(data, 200, cors);
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const entryId = url.searchParams.get("entry_id");
    if (!entryId) {
      return json({ error: "invalid_request" }, 400, cors);
    }
    const { error } = await supabase.from("entries").delete().eq("id", entryId);
    if (error) {
      console.error(error);
      return json({ error: "db_error" }, 500, cors);
    }
    return json({ ok: true }, 200, cors);
  }

  return json({ error: "method_not_allowed" }, 405, cors);
});
