// GET /admin-dashboard — summary stats for the admin dashboard.
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

  const supabase = getServiceClient();

  const { data: entries, error } = await supabase
    .from("entries")
    .select("product, winner_status, created_at");
  if (error) {
    console.error(error);
    return json({ error: "db_error" }, 500, cors);
  }

  const { count: shippingCount } = await supabase
    .from("shipping_info")
    .select("*", { count: "exact", head: true });

  const { count: shippedCount } = await supabase
    .from("shipping_info")
    .select("*", { count: "exact", head: true })
    .eq("is_shipped", true);

  const byProduct: Record<string, number> = { toner: 0, cream: 0, serum: 0 };
  const byStatus: Record<string, number> = {
    none: 0,
    winner: 0,
    verified: 0,
    invalidated: 0,
  };
  const byDay: Record<string, number> = {};

  for (const e of entries) {
    byProduct[e.product] = (byProduct[e.product] ?? 0) + 1;
    byStatus[e.winner_status] = (byStatus[e.winner_status] ?? 0) + 1;
    const day = String(e.created_at).slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }

  return json(
    {
      total: entries.length,
      by_product: byProduct,
      by_status: byStatus,
      by_day: byDay,
      shipping_submitted: shippingCount ?? 0,
      shipped: shippedCount ?? 0,
    },
    200,
    cors,
  );
});
