// POST /card-upload-url  Authorization: Bearer <session_token>  { ext }
// Issues a short-lived signed upload URL for the private card-photos bucket. The browser then
// PUTs the file bytes directly to that URL — the Edge Function never touches the image data.
// Single photo only (front side) per 정책 확정 — no back-of-card photo.
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

const ALLOWED_EXT = ["jpg", "jpeg", "png", "heic", "webp"];

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

  let body: { ext?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }
  const ext = (body.ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ALLOWED_EXT.includes(ext)) {
    return json({ error: "invalid_ext" }, 400, cors);
  }

  const supabase = getServiceClient();

  const { data: participant, error: pError } = await supabase
    .from("participants")
    .select("id")
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

  const path = `${participant.id}/${entry.id}.${ext}`;
  const { data: signed, error: signError } = await supabase.storage
    .from("card-photos")
    .createSignedUploadUrl(path, { upsert: true });
  if (signError || !signed) {
    console.error(signError);
    return json({ error: "storage_error" }, 500, cors);
  }

  return json({ signed_url: signed.signedUrl, token: signed.token, path: signed.path }, 200, cors);
});
