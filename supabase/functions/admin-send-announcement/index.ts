// POST /admin-send-announcement
// Sends template A (individual winner push) to every entry currently in winner_status='winner',
// then template C (broadcast) to all official-account friends. Requires event_config.is_announced
// to already be true (toggle that on via admin-event-config first). Not idempotent — calling this
// twice re-messages whoever is still in 'winner' status, so the UI should warn accordingly.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";
import { json } from "../_shared/http.ts";
import { linePush, lineBroadcast } from "../_shared/lineMessaging.ts";
import { winnerAnnounceTemplate, announceBroadcastTemplate } from "../_shared/templates.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401, cors);

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  const supabase = getServiceClient();

  const { data: config, error: configError } = await supabase
    .from("event_config")
    .select("is_announced, submit_deadline")
    .eq("id", 1)
    .single();
  if (configError || !config) {
    return json({ error: "db_error" }, 500, cors);
  }
  if (!config.is_announced) {
    return json({ error: "not_announced_yet" }, 409, cors);
  }

  const { data: winners, error: winnersError } = await supabase
    .from("entries")
    .select("participants(line_user_id, display_name)")
    .eq("winner_status", "winner");
  if (winnersError) {
    console.error(winnersError);
    return json({ error: "db_error" }, 500, cors);
  }

  let sent = 0;
  const failed: string[] = [];
  for (const row of winners ?? []) {
    // deno-lint-ignore no-explicit-any
    const participant = (row as any).participants;
    if (!participant) continue;
    try {
      await linePush(
        participant.line_user_id,
        winnerAnnounceTemplate(participant.display_name || "", config.submit_deadline),
      );
      sent++;
    } catch (err) {
      console.error(err);
      failed.push(participant.line_user_id);
    }
  }

  let broadcastOk = true;
  try {
    await lineBroadcast(announceBroadcastTemplate());
  } catch (err) {
    console.error(err);
    broadcastOk = false;
  }

  return json({ winner_push_sent: sent, winner_push_failed: failed, broadcast_sent: broadcastOk }, 200, cors);
});
