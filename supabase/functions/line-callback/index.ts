// POST /line-callback  { code, state }
// Called via fetch() from callback.html (the page registered as the LINE redirect_uri).
// Exchanges the code server-side (needs Channel Secret), fetches profile + friendship,
// upserts participants, and returns a self-signed session token for the browser to hold.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { signToken, verifyToken } from "../_shared/session.ts";
import { exchangeCodeForToken, getProfile, getFriendshipStatus } from "../_shared/line.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";

const CALLBACK_URL = "https://sumuadi.github.io/callback.html";
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StatePayload {
  next: string;
  nonce: string;
  iat: number;
}

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
  const channelId = Deno.env.get("LINE_CHANNEL_ID");
  const channelSecret = Deno.env.get("LINE_CHANNEL_SECRET");
  if (!sessionSecret || !channelId || !channelSecret) {
    return json({ error: "server_misconfigured" }, 500, cors);
  }

  let code: string, state: string;
  try {
    const body = await req.json();
    code = body.code;
    state = body.state;
    if (!code || !state) throw new Error("missing");
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }

  const statePayload = await verifyToken<StatePayload>(state, sessionSecret);
  if (!statePayload || Date.now() - statePayload.iat > STATE_MAX_AGE_MS) {
    return json({ error: "invalid_state" }, 400, cors);
  }

  let tokenRes;
  try {
    tokenRes = await exchangeCodeForToken({
      code,
      redirectUri: CALLBACK_URL,
      channelId,
      channelSecret,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "line_token_exchange_failed" }, 400, cors);
  }

  let profile;
  try {
    profile = await getProfile(tokenRes.access_token);
  } catch (e) {
    console.error(e);
    return json({ error: "line_profile_failed" }, 400, cors);
  }

  let isFriend = false;
  try {
    isFriend = await getFriendshipStatus(tokenRes.access_token);
  } catch (e) {
    // Don't hard-fail login on a friendship-check hiccup; submit-entry re-checks
    // participants.is_friend from the DB before accepting an entry anyway.
    console.error(e);
  }

  const supabase = getServiceClient();
  const { data: participant, error } = await supabase
    .from("participants")
    .upsert(
      { line_user_id: profile.userId, display_name: profile.displayName, is_friend: isFriend },
      { onConflict: "line_user_id" },
    )
    .select()
    .single();

  if (error || !participant) {
    console.error(error);
    return json({ error: "db_error" }, 500, cors);
  }

  const sessionToken = await signToken(
    {
      sub: profile.userId,
      name: profile.displayName,
      isFriend,
      iat: Date.now(),
      exp: Date.now() + SESSION_MAX_AGE_MS,
    },
    sessionSecret,
  );

  return json(
    {
      session_token: sessionToken,
      is_friend: isFriend,
      display_name: profile.displayName,
      next: statePayload.next,
    },
    200,
    cors,
  );
});
