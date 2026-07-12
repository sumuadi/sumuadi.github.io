// POST /submit-shipping  Authorization: Bearer <session_token>
// { name_kanji, name_romaji, postal_code, prefecture, city, address_line, building?, phone,
//   email?, card_photo }
// Saves the winner's card photo path + EMS shipping info, then sends the confirmation push
// (template B). Allowed while winner_status is 'winner' or 'verified' and before submit_deadline.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { verifyToken } from "../_shared/session.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";
import { json } from "../_shared/http.ts";
import { linePush } from "../_shared/lineMessaging.ts";
import { shippingReceivedTemplate } from "../_shared/templates.ts";

interface SessionPayload {
  sub: string;
  name: string;
  isFriend: boolean;
  iat: number;
  exp: number;
}

interface ShippingBody {
  name_kanji?: string;
  name_romaji?: string;
  postal_code?: string;
  prefecture?: string;
  city?: string;
  address_line?: string;
  building?: string;
  phone?: string;
  email?: string;
  card_photo?: string;
}

const REQUIRED_FIELDS: (keyof ShippingBody)[] = [
  "name_kanji",
  "name_romaji",
  "postal_code",
  "prefecture",
  "city",
  "address_line",
  "phone",
  "card_photo",
];

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  if (req.method !== "POST") {
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

  let body: ShippingBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }

  for (const field of REQUIRED_FIELDS) {
    if (!body[field]) {
      return json({ error: "missing_field", field }, 400, cors);
    }
  }

  const supabase = getServiceClient();

  const { data: config } = await supabase
    .from("event_config")
    .select("submit_deadline")
    .eq("id", 1)
    .single();
  if (config?.submit_deadline && new Date() > new Date(config.submit_deadline)) {
    return json({ error: "submit_deadline_passed" }, 403, cors);
  }

  const { data: participant, error: pError } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("line_user_id", session.sub)
    .single();
  if (pError || !participant) {
    return json({ error: "participant_not_found" }, 400, cors);
  }

  const { data: entry, error: eError } = await supabase
    .from("entries")
    .select("id, winner_status")
    .eq("participant_id", participant.id)
    .maybeSingle();
  if (eError || !entry) {
    return json({ error: "entry_not_found" }, 404, cors);
  }
  if (entry.winner_status !== "winner" && entry.winner_status !== "verified") {
    return json({ error: "not_a_winner" }, 403, cors);
  }

  const photoPrefix = `${participant.id}/${entry.id}.`;
  if (!body.card_photo!.startsWith(photoPrefix)) {
    return json({ error: "invalid_photo_path" }, 400, cors);
  }

  const { error: entryUpdateError } = await supabase
    .from("entries")
    .update({ card_photo: body.card_photo })
    .eq("id", entry.id);
  if (entryUpdateError) {
    console.error(entryUpdateError);
    return json({ error: "db_error" }, 500, cors);
  }

  const shippingRow = {
    entry_id: entry.id,
    name_kanji: body.name_kanji,
    name_romaji: body.name_romaji,
    postal_code: body.postal_code,
    prefecture: body.prefecture,
    city: body.city,
    address_line: body.address_line,
    building: body.building || null,
    phone: body.phone,
    email: body.email || null,
    updated_at: new Date().toISOString(),
  };

  const { error: shippingError } = await supabase
    .from("shipping_info")
    .upsert(shippingRow, { onConflict: "entry_id" });
  if (shippingError) {
    console.error(shippingError);
    return json({ error: "db_error" }, 500, cors);
  }

  try {
    await linePush(
      session.sub,
      shippingReceivedTemplate({
        name: body.name_kanji!,
        postalCode: body.postal_code!,
        prefecture: body.prefecture!,
        city: body.city!,
        addressLine: body.address_line!,
        building: body.building,
      }),
    );
  } catch (err) {
    // Don't fail the whole request just because the confirmation push failed to send —
    // the shipping data itself is already saved.
    console.error(err);
  }

  return json({ ok: true }, 200, cors);
});
