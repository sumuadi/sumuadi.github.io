// GET /admin-shipping-list — JSON list of shipping_info joined with entry + participant,
// for the admin "배송 정보" tab (mark-shipped UI). See admin-shipping-export for the CSV form.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";
import { json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401, cors);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("shipping_info")
    .select(
      "entry_id, name_kanji, phone, postal_code, prefecture, city, address_line, is_shipped, tracking_number, created_at, entries(product, ball_number, participants(display_name))",
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return json({ error: "db_error" }, 500, cors);
  }

  return json({ rows: data ?? [] }, 200, cors);
});
