// GET /my-result  Authorization: Bearer <session_token>
// -> { is_announced, announce_at, entry: {product, ball_number, winner_status} | null,
//      winners: [{product, ball_number}] }  (winners list only populated once announced)
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { verifyToken } from "../_shared/session.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";
import { json } from "../_shared/http.ts";

interface SessionPayload {
  sub: string;
  name: string;
  isFriend: boolean;
  iat: number;
  exp: number;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  const sessionSecret = Deno.env.get("SESSION_SECRET");
  if (!sessionSecret) {
    return json({ error: "server_misconfigured" }, 500, cors);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const session = await verifyToken<SessionPayload>(token, sessionSecret);
  if (!session || Date.now() > session.exp) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  const supabase = getServiceClient();

  const { data: config, error: configError } = await supabase
    .from("event_config")
    .select("is_announced, announce_at, submit_deadline")
    .eq("id", 1)
    .single();
  if (configError || !config) {
    return json({ error: "event_not_configured" }, 500, cors);
  }

  const { data: participant, error: pError } = await supabase
    .from("participants")
    .select("id")
    .eq("line_user_id", session.sub)
    .single();
  if (pError || !participant) {
    return json({ error: "participant_not_found" }, 400, cors);
  }

  const { data: entry } = await supabase
    .from("entries")
    .select("id, product, ball_number, winner_status, card_photo_front, card_photo_back")
    .eq("participant_id", participant.id)
    .maybeSingle();

  let shipping = null;
  if (entry && (entry.winner_status === "winner" || entry.winner_status === "verified")) {
    const { data: shippingRow } = await supabase
      .from("shipping_info")
      .select("name_kanji, name_romaji, postal_code, prefecture, city, address_line, building, phone, email, is_shipped, tracking_number")
      .eq("entry_id", entry.id)
      .maybeSingle();
    shipping = shippingRow ?? null;
  }

  let winners: { product: string; ball_number: number }[] = [];
  if (config.is_announced) {
    const { data: winnerRows } = await supabase
      .from("entries")
      .select("product, ball_number")
      .in("winner_status", ["winner", "verified"])
      .order("product", { ascending: true })
      .order("ball_number", { ascending: true });
    winners = winnerRows ?? [];
  }

  return json(
    {
      is_announced: config.is_announced,
      announce_at: config.announce_at,
      submit_deadline: config.submit_deadline,
      entry: entry ?? null,
      shipping,
      winners,
    },
    200,
    cors,
  );
});
