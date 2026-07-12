// GET /line-login?next=entry
// Direct browser navigation (not fetch) — redirects the user to LINE's OAuth authorize screen.
// bot_prompt=aggressive nudges the user to add the official account as a friend during consent.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { signToken } from "../_shared/session.ts";
import { LINE_AUTHORIZE_URL } from "../_shared/line.ts";

const CALLBACK_URL = "https://sumuadi.github.io/callback.html";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const cors = corsHeadersFor(req);
  const channelId = Deno.env.get("LINE_CHANNEL_ID");
  const sessionSecret = Deno.env.get("SESSION_SECRET");
  if (!channelId || !sessionSecret) {
    return new Response("Server misconfigured", { status: 500, headers: cors });
  }

  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "entry";

  const state = await signToken(
    { next, nonce: crypto.randomUUID(), iat: Date.now() },
    sessionSecret,
  );

  const authorizeUrl = new URL(LINE_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", channelId);
  authorizeUrl.searchParams.set("redirect_uri", CALLBACK_URL);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "profile openid");
  authorizeUrl.searchParams.set("bot_prompt", "aggressive");

  return new Response(null, {
    status: 302,
    headers: { ...cors, Location: authorizeUrl.toString() },
  });
});
