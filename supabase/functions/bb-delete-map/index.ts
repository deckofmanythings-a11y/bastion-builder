// bb-delete-map — removes an uploaded map's file from the bb-maps bucket. The bucket has no delete policy, so the
// browser can't do this itself. The browser first saves the Bastion with the map taken out of data.maps; this
// function then deletes the file, but only when:
//   * the path is an uploaded map of that Bastion (<campaign>/<bastionId>/<file>, not a reskin or anything else),
//   * the Bastion's saved data no longer lists that map (so a live map is never deleted),
//   * the character name typed matches the Bastion's character exactly (the same check the page makes).
//
// Deploy (from bastion-builder/):
//   supabase functions deploy bb-delete-map --project-ref uaoxvhihwiygrajicend --no-verify-jwt --use-api
// Optional: BB_ORIGINS (https://deckofmanythings-a11y.github.io)

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const BUCKET = "bb-maps";
const ORIGINS = env("BB_ORIGINS", "https://deckofmanythings-a11y.github.io").split(",").map((s) => s.trim());

function originAllowed(o: string | null) {
  if (!o) return false;
  if (ORIGINS.includes(o)) return true;
  try { const u = new URL(o); return u.hostname === "localhost" || u.hostname === "127.0.0.1"; } catch { return false; }
}
function cors(o: string | null): Record<string, string> {
  return originAllowed(o) ? {
    "Access-Control-Allow-Origin": o!, "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  } : { "Vary": "Origin" };
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...h } });
function svc(extra: Record<string, string> = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const h: Record<string, string> = { apikey: key, ...extra };
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}
const SAFE = /^[A-Za-z0-9_-]{1,80}$/;

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin"), h = cors(origin);
  if (!originAllowed(origin)) return json({ error: "origin_not_allowed" }, 403, h);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, h);

  let body: { campaign?: string; bastionId?: string; path?: string; character?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request", message: "body must be JSON" }, 400, h); }
  const { campaign = "", bastionId = "", path = "", character = "" } = body || {};
  if (!SAFE.test(campaign) || !SAFE.test(bastionId) || typeof path !== "string" || typeof character !== "string")
    return json({ error: "bad_request", message: "campaign, bastionId, path and character are required" }, 400, h);
  const prefix = `${campaign}/${bastionId}/`;
  const file = path.slice(prefix.length);
  if (!path.startsWith(prefix) || !/^[A-Za-z0-9_-]+\.[a-z]{2,5}$/.test(file))
    return json({ error: "bad_path", message: "That isn't one of this Bastion's uploaded maps." }, 400, h);

  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/bb_bastions?select=data&id=eq.${bastionId}&campaign=eq.${campaign}`, { headers: svc() });
  if (!r.ok) return json({ error: "server_error" }, 500, h);
  const rows = await r.json();
  if (!rows.length) return json({ error: "not_found", message: "Bastion not found." }, 404, h);
  const data = rows[0].data || {};
  const want = String(data.character || data.name || "").trim();
  if (!want || character.trim() !== want) return json({ error: "name_mismatch", message: "The name doesn't match." }, 403, h);
  if ((data.maps || []).some((m: { path?: string }) => m && m.path === path))
    return json({ error: "still_listed", message: "Save the Bastion without this map first." }, 409, h);

  const d = await fetch(`${env("SUPABASE_URL")}/storage/v1/object/${BUCKET}/${path}`, { method: "DELETE", headers: svc() });
  if (!d.ok && d.status !== 404 && d.status !== 400) return json({ error: "storage_error", message: `Storage said ${d.status}` }, 502, h);
  return json({ ok: true }, 200, h);
});
