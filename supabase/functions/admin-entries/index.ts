// GET /admin-entries?page=1&pageSize=50&product=toner&winner_status=winner
// Lists entries with participant info, paginated, optionally filtered. Includes signed URLs
// for card photos (private storage bucket) when present.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";

const PRODUCTS = ["toner", "cream", "serum"];
const STATUSES = ["none", "winner", "verified", "invalidated"];

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401, cors);

  const url = new URL(req.url);
  const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10), 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") ?? "50", 10), 1), 200);
  const product = url.searchParams.get("product");
  const winnerStatus = url.searchParams.get("winner_status");

  const supabase = getServiceClient();
  let query = supabase
    .from("entries")
    .select(
      "id, product, ball_number, winner_status, invalid_reason, card_photo_front, card_photo_back, created_at, participants(display_name, line_user_id)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (product && PRODUCTS.includes(product)) query = query.eq("product", product);
  if (winnerStatus && STATUSES.includes(winnerStatus)) query = query.eq("winner_status", winnerStatus);

  const { data, error, count } = await query;
  if (error) {
    console.error(error);
    return json({ error: "db_error" }, 500, cors);
  }

  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      const signed: { card_photo_front_url?: string; card_photo_back_url?: string } = {};
      if (row.card_photo_front) {
        const { data: s } = await supabase.storage
          .from("card-photos")
          .createSignedUrl(row.card_photo_front, 3600);
        if (s) signed.card_photo_front_url = s.signedUrl;
      }
      if (row.card_photo_back) {
        const { data: s } = await supabase.storage
          .from("card-photos")
          .createSignedUrl(row.card_photo_back, 3600);
        if (s) signed.card_photo_back_url = s.signedUrl;
      }
      return { ...row, ...signed };
    }),
  );

  return json({ rows, count: count ?? 0, page, pageSize }, 200, cors);
});
