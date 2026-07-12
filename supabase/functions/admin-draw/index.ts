// POST /admin-draw
// body: { winner_count, reserve_count, exclude_entry_ids?, force_winner_entry_ids?, redraw? }
// Randomly draws winner_count winners + reserve_count reserves from entries with
// winner_status='none'. Manual override: force_winner_entry_ids are guaranteed winners,
// exclude_entry_ids are removed from the pool entirely. redraw=true resets any existing
// winner/reserve entries back to 'none' first (never touches verified/invalidated).
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";

interface DrawEntry {
  id: string;
  product: string;
  ball_number: number;
  participant_id: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401, cors);

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  let body: {
    winner_count?: number;
    reserve_count?: number;
    exclude_entry_ids?: string[];
    force_winner_entry_ids?: string[];
    redraw?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }

  const winnerCount = body.winner_count ?? 0;
  const reserveCount = body.reserve_count ?? 0;
  const excludeIds = new Set(body.exclude_entry_ids ?? []);
  const forceIds = body.force_winner_entry_ids ?? [];

  if (!Number.isInteger(winnerCount) || winnerCount < 0 || !Number.isInteger(reserveCount) || reserveCount < 0) {
    return json({ error: "invalid_counts" }, 400, cors);
  }

  const supabase = getServiceClient();

  if (body.redraw) {
    const { error: resetError } = await supabase
      .from("entries")
      .update({ winner_status: "none" })
      .in("winner_status", ["winner", "reserve"]);
    if (resetError) {
      console.error(resetError);
      return json({ error: "db_error" }, 500, cors);
    }
  }

  const { data: pool, error: poolError } = await supabase
    .from("entries")
    .select("id, product, ball_number, participant_id")
    .eq("winner_status", "none");
  if (poolError) {
    console.error(poolError);
    return json({ error: "db_error" }, 500, cors);
  }

  const eligible = (pool as DrawEntry[]).filter((e) => !excludeIds.has(e.id));

  const forced = eligible.filter((e) => forceIds.includes(e.id));
  if (forced.length !== forceIds.length) {
    return json({ error: "force_winner_not_eligible" }, 400, cors);
  }
  const remainingWinnersNeeded = winnerCount - forced.length;
  if (remainingWinnersNeeded < 0) {
    return json({ error: "winner_count_less_than_forced" }, 400, cors);
  }

  const rest = shuffle(eligible.filter((e) => !forceIds.includes(e.id)));
  if (rest.length < remainingWinnersNeeded + reserveCount) {
    return json({ error: "not_enough_entries", eligible: eligible.length }, 400, cors);
  }

  const winners = forced.concat(rest.slice(0, remainingWinnersNeeded));
  const reserves = rest.slice(remainingWinnersNeeded, remainingWinnersNeeded + reserveCount);

  const winnerIds = winners.map((e) => e.id);
  const reserveIds = reserves.map((e) => e.id);

  if (winnerIds.length > 0) {
    const { error } = await supabase.from("entries").update({ winner_status: "winner" }).in("id", winnerIds);
    if (error) {
      console.error(error);
      return json({ error: "db_error" }, 500, cors);
    }
  }
  if (reserveIds.length > 0) {
    const { error } = await supabase.from("entries").update({ winner_status: "reserve" }).in("id", reserveIds);
    if (error) {
      console.error(error);
      return json({ error: "db_error" }, 500, cors);
    }
  }

  return json({ winners, reserves }, 200, cors);
});
