// PATCH /admin-mark-shipped  { entry_id, tracking_number? }
// Marks a winner's shipment as sent and optionally sends the (optional per 기획서 §5) template D
// push with the tracking number.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";
import { json } from "../_shared/http.ts";
import { linePush } from "../_shared/lineMessaging.ts";
import { shippedTemplate } from "../_shared/templates.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401, cors);

  if (req.method !== "PATCH") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  let body: { entry_id?: string; tracking_number?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }
  if (!body.entry_id) {
    return json({ error: "invalid_request" }, 400, cors);
  }

  const supabase = getServiceClient();

  const { data: shipping, error } = await supabase
    .from("shipping_info")
    .update({ is_shipped: true, tracking_number: body.tracking_number || null, updated_at: new Date().toISOString() })
    .eq("entry_id", body.entry_id)
    .select("name_kanji, entries(participants(line_user_id))")
    .single();

  if (error || !shipping) {
    console.error(error);
    return json({ error: "shipping_not_found" }, 404, cors);
  }

  if (body.tracking_number) {
    try {
      // deno-lint-ignore no-explicit-any
      const lineUserId = (shipping as any).entries?.participants?.line_user_id;
      if (lineUserId) {
        await linePush(lineUserId, shippedTemplate(shipping.name_kanji, body.tracking_number));
      }
    } catch (err) {
      console.error(err);
    }
  }

  return json({ ok: true }, 200, cors);
});
