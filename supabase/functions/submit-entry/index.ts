// POST /submit-entry  Authorization: Bearer <session_token>  { product, ball_number, display_name, agree }
// Validates entry period, friend status, product/ball_number range, and the two DB-level
// uniqueness rules (1 account = 1 entry, product+ball_number can't be claimed twice).
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { verifyToken } from "../_shared/session.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";

interface SessionPayload {
  sub: string;
  name: string;
  isFriend: boolean;
  iat: number;
  exp: number;
}

const RANGES: Record<string, [number, number]> = {
  toner: [1, 400],
  cream: [1, 300],
  serum: [1, 200],
};

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

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

  let body: { product?: string; ball_number?: number; display_name?: string; agree?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }

  const { product, ball_number, display_name, agree } = body;
  if (!product || !RANGES[product]) {
    return json({ error: "invalid_product" }, 400, cors);
  }
  const [min, max] = RANGES[product];
  if (!Number.isInteger(ball_number) || (ball_number as number) < min || (ball_number as number) > max) {
    return json({ error: "invalid_ball_number" }, 400, cors);
  }
  if (!agree) {
    return json({ error: "agreement_required" }, 400, cors);
  }

  const supabase = getServiceClient();

  const { data: config, error: configError } = await supabase
    .from("event_config")
    .select("entry_start, entry_end")
    .eq("id", 1)
    .single();
  if (configError || !config) {
    return json({ error: "event_not_configured" }, 500, cors);
  }
  const now = new Date();
  if (config.entry_start && now < new Date(config.entry_start)) {
    return json({ error: "entry_not_started" }, 403, cors);
  }
  if (config.entry_end && now > new Date(config.entry_end)) {
    return json({ error: "entry_closed" }, 403, cors);
  }

  const { data: participant, error: pError } = await supabase
    .from("participants")
    .select("id, is_friend")
    .eq("line_user_id", session.sub)
    .single();
  if (pError || !participant) {
    return json({ error: "participant_not_found" }, 400, cors);
  }
  if (!participant.is_friend) {
    return json({ error: "friend_required" }, 403, cors);
  }

  if (display_name) {
    await supabase.from("participants").update({ display_name }).eq("id", participant.id);
  }

  const { error: insertError } = await supabase.from("entries").insert({
    participant_id: participant.id,
    product,
    ball_number,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      const isNumberClash = insertError.message.includes("ball_number");
      return json({ error: isNumberClash ? "number_taken" : "already_entered" }, 409, cors);
    }
    console.error(insertError);
    return json({ error: "db_error" }, 500, cors);
  }

  return json({ ok: true, product, ball_number }, 200, cors);
});
