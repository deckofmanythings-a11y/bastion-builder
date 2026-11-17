// bb-reskin — AI map reskin queue.
//   Browser:  {action:"enqueue", campaign, bastionId, floor, style, extra, control (base64 PNG/JPEG), width, height, meta}
//             meta.furnished = 1: control is the furnished battle map (furnish.js) and the worker restyles it (img2img)
//   Worker (Foundry laptop, header x-worker-token): {action:"claim"} | {action:"complete", id, image, mime} |
//             {action:"fail", id, error}
// The browser sends a clean line drawing of one floor (white walls on black). The laptop's ComfyUI paints over
// it with a ControlNet, so walls stay where the graph-paper map puts them. Labels are drawn back on in the browser.
//
// Deploy (from bastion-builder/): supabase functions deploy bb-reskin --project-ref uaoxvhihwiygrajicend --no-verify-jwt --use-api
// Secrets: BB_WORKER_TOKEN (shared with the laptop worker's .env). Optional: BB_ORIGINS, BB_RESKIN_IP_PER_HOUR (12),
//          BB_RESKIN_BASTION_PER_DAY (12), BB_RESKIN_MAX_QUEUED (25).

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const ORIGINS = env("BB_ORIGINS", "https://deckofmanythings-a11y.github.io").split(",").map((s) => s.trim());
const IP_PER_HOUR = +env("BB_RESKIN_IP_PER_HOUR", "12");
const BASTION_PER_DAY = +env("BB_RESKIN_BASTION_PER_DAY", "12");
const MAX_QUEUED = +env("BB_RESKIN_MAX_QUEUED", "25");
const BUCKET = "bb-maps";

export const STYLES: Record<string, string> = {
  forest: "overgrown forest grove, mossy stone, tree roots, ferns, wildflowers, dappled sunlight through leaves",
  dungeon: "dark stone dungeon, worn flagstone floors, iron braziers, damp walls, torchlight",
  wizard: "arcane wizard tower interior, polished marble floor, glowing runes, bookshelves, alchemy tables, candles",
  castle: "stone keep interior, wooden plank floors, woven rugs, hearths, heavy oak furniture, banners",
  fey: "feywild manor, glowing mushrooms, flower petals, crystal formations, pastel magical light, vines",
  cavern: "natural underground cavern, rough rock floor, glowing crystals, still pools, stalagmites",
  manor: "elegant noble manor, parquet floors, carpets, fine furniture, potted plants, fireplaces",
  ruins: "ancient crumbling ruins, cracked flagstones, rubble, ivy, broken columns, sunlight",
};
const BASE = "top-down view, fantasy tabletop battle map, orthographic, highly detailed painted map, rooms and walls clearly visible";
const FURNISHED = "furnished rooms, beds, tables, shelves, wooden doors, detailed props, rich textures, soft shadows, dramatic lighting";
const NEG = "text, letters, numbers, watermark, signature, logo, grid lines, blurry, perspective, isometric, side view, people, characters, creatures, nsfw, nude";

function originAllowed(o: string | null) {
  if (!o) return false;
  if (ORIGINS.includes(o)) return true;
  try { const u = new URL(o); return u.hostname === "localhost" || u.hostname === "127.0.0.1"; } catch { return false; }
}
function cors(o: string | null): Record<string, string> {
  return originAllowed(o) ? { "Access-Control-Allow-Origin": o!, "Vary": "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info" } : { "Vary": "Origin" };
}
const json = (b: unknown, s: number, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", ...h } });

function svcHeaders(extra: Record<string, string> = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const h: Record<string, string> = { apikey: key, ...extra };
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers: svcHeaders({ "Content-Type": "application/json", ...(init.headers as Record<string, string> || {}) }) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}
const rpc = (n: string, b: unknown) => rest(`rpc/${n}`, { method: "POST", body: JSON.stringify(b) });
async function upload(path: string, bytes: Uint8Array, mime: string) {
  const r = await fetch(`${env("SUPABASE_URL")}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST", headers: svcHeaders({ "Content-Type": mime, "x-upsert": "false", "cache-control": "31536000" }), body: bytes,
  });
  if (!r.ok) throw new Error(`upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/^data:[^,]+,/, "")), (c) => c.charCodeAt(0));
async function ipHash(req: Request) {
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bb-reskin|${env("SUPABASE_SERVICE_ROLE_KEY").slice(-24)}|${ip}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
function safeEq(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function worker(req: Request, body: any) {
  if (!safeEq(req.headers.get("x-worker-token") || "", env("BB_WORKER_TOKEN"))) return json({ error: "forbidden" }, 403);
  if (body.action === "claim") {
    const job = await rpc("bb_reskin_claim", {});
    if (!job) return json({ job: null }, 200);
    return json({ job: { ...job, negative: NEG,
      control_url: `${env("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/${job.control_path}` } }, 200);
  }
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) return json({ error: "bad id" }, 400);
  if (body.action === "complete") {
    const rows = await rest(`bb_reskin_jobs?select=campaign,bastion_id&id=eq.${body.id}`);
    if (!rows.length) return json({ error: "unknown job" }, 404);
    const mime = body.mime === "image/png" ? "image/png" : "image/jpeg";
    const path = `reskins/${rows[0].campaign}/${rows[0].bastion_id}/${body.id}.${mime === "image/png" ? "png" : "jpg"}`;
    const bytes = b64(String(body.image || ""));
    if (bytes.length < 1000 || bytes.length > 9_000_000) return json({ error: "bad image" }, 400);
    await upload(path, bytes, mime);
    await rpc("bb_reskin_finish", { p_id: body.id, p_status: "done", p_result_path: path, p_error: "" });
    return json({ ok: true, path }, 200);
  }
  if (body.action === "fail") {
    await rpc("bb_reskin_finish", { p_id: body.id, p_status: "failed", p_result_path: "", p_error: String(body.error || "failed") });
    return json({ ok: true }, 200);
  }
  return json({ error: "unknown action" }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "POST" && req.headers.get("x-worker-token") !== null) {
    try { return await worker(req, await req.json()); } catch (e) { console.error("bb-reskin worker:", String(e)); return json({ error: "internal" }, 500); }
  }
  const origin = req.headers.get("Origin"), h = cors(origin);
  if (!originAllowed(origin)) return json({ error: "origin_not_allowed" }, 403, h);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, h);
  let x: any;
  try { x = await req.json(); } catch { return json({ error: "bad_request", message: "body must be JSON" }, 400, h); }
  if (x?.action !== "enqueue") return json({ error: "bad_request" }, 400, h);
  if (typeof x.campaign !== "string" || !x.campaign || x.campaign.length > 60) return json({ error: "bad_request", message: "campaign required" }, 400, h);
  if (typeof x.bastionId !== "string" || !/^[a-z0-9]{6,40}$/.test(x.bastionId)) return json({ error: "bad_request", message: "bastionId required" }, 400, h);
  const style = STYLES[x.style] ? x.style : "";
  const extra = String(x.extra || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!style && !extra) return json({ error: "bad_request", message: "Pick a style or describe one." }, 400, h);
  const w = Math.trunc(+x.width), hgt = Math.trunc(+x.height);
  if (!(w >= 384 && w <= 1536 && hgt >= 384 && hgt <= 1536 && w % 8 === 0 && hgt % 8 === 0)) return json({ error: "bad_request", message: "bad size" }, 400, h);
  let ctrl: Uint8Array;
  try { ctrl = b64(String(x.control || "")); } catch { return json({ error: "bad_request", message: "bad control image" }, 400, h); }
  const isPng = ctrl[0] === 0x89 && ctrl[1] === 0x50, isJpg = ctrl[0] === 0xff && ctrl[1] === 0xd8;
  if (ctrl.length < 200 || ctrl.length > 3_000_000 || !(isPng || isJpg)) return json({ error: "bad_request", message: "base image must be a PNG or JPEG" }, 400, h);
  const meta = x.meta && JSON.stringify(x.meta).length < 20000 ? x.meta : {};

  try {
    const rows = await rest(`bb_bastions?select=id&id=eq.${x.bastionId}&campaign=eq.${encodeURIComponent(x.campaign)}`);
    if (!rows.length) return json({ error: "unknown_bastion", message: "Save the Bastion first, then try again." }, 404, h);
    const cpath = `reskins/${x.campaign}/${x.bastionId}/ctrl-${crypto.randomUUID()}.${isPng ? "png" : "jpg"}`;
    await upload(cpath, ctrl, isPng ? "image/png" : "image/jpeg");
    // furnished base (furnish.js): the picture already has the furniture, doors and entrance; the AI only restyles it
    const prompt = [BASE, meta.furnished ? FURNISHED : "", style ? STYLES[style] : "", extra].filter(Boolean).join(", ");
    const r = await rpc("bb_reskin_enqueue", { p_campaign: x.campaign, p_bastion: x.bastionId, p_ip_hash: await ipHash(req),
      p_floor: String(x.floor || ""), p_style: style || "custom", p_prompt: prompt, p_meta: meta, p_width: w, p_height: hgt,
      p_control_path: cpath, p_ip_per_hour: IP_PER_HOUR, p_bastion_per_day: BASTION_PER_DAY, p_max_queued: MAX_QUEUED });
    if (!r.ok) {
      const msg = { queue: "The painter's queue is full. Try again in a few minutes.",
        bastion: `This Bastion has had its ${BASTION_PER_DAY} reskins for today. Try again tomorrow.`,
        ip: "That's a lot of reskins in a short time. Please wait a little." }[r.reason as string] || "Try again later.";
      return json({ error: "rate_limited", scope: r.reason, message: msg }, 429, h);
    }
    return json({ id: r.id }, 200, h);
  } catch (e) {
    console.error("bb-reskin enqueue:", String(e));
    return json({ error: "internal", message: "Couldn't queue the reskin right now." }, 500, h);
  }
});
