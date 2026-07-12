// GET /admin-shipping-export — CSV of shipping_info joined with entries + participants,
// for EMS label preparation.
import { corsHeadersFor, handleOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { getServiceClient } from "../_shared/supabaseAdmin.ts";

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const cors = corsHeadersFor(req);

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401, cors);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("shipping_info")
    .select(
      "name_kanji, name_romaji, postal_code, prefecture, city, address_line, building, phone, email, is_shipped, tracking_number, created_at, entries(product, ball_number, participants(display_name))",
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return json({ error: "db_error" }, 500, cors);
  }

  const headers = [
    "product",
    "ball_number",
    "line_display_name",
    "name_kanji",
    "name_romaji",
    "postal_code",
    "prefecture",
    "city",
    "address_line",
    "building",
    "phone",
    "email",
    "is_shipped",
    "tracking_number",
    "created_at",
  ];

  const lines = [headers.join(",")];
  for (const row of data ?? []) {
    // deno-lint-ignore no-explicit-any
    const entry = (row as any).entries;
    lines.push(
      [
        entry?.product,
        entry?.ball_number,
        entry?.participants?.display_name,
        row.name_kanji,
        row.name_romaji,
        row.postal_code,
        row.prefecture,
        row.city,
        row.address_line,
        row.building,
        row.phone,
        row.email,
        row.is_shipped,
        row.tracking_number,
        row.created_at,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const csv = "﻿" + lines.join("\n");
  return new Response(csv, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shipping_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
