// bb-layout — turns a player's description of how their Bastion should be laid out into a structured layout
// plan that the browser's graph-paper generator (mapgen.js) builds. Claude never draws coordinates: it only
// decides floors, which wing and order rooms go in, which rooms sit side by side, and what goes outdoors.
// The generator keeps the hard rule (every room has its own door onto the hall).
//
// Deploy (from bastion-builder/):
//   supabase functions deploy bb-layout --project-ref uaoxvhihwiygrajicend --no-verify-jwt --use-api
// --no-verify-jwt on purpose: browsers only hold the public publishable key, which proves nothing (and is not a
// JWT). Abuse is bounded instead by an Origin allow-list, per-IP / per-Bastion / per-campaign limits and a daily
// spend cap, enforced atomically in Postgres (supabase/003_ai_layout.sql) through the service role.
//
// Secrets: BB_ANTHROPIC_KEY (preferred, a key just for this app) or else ANTHROPIC_API_KEY (shared on raided-hex).
// Optional: BB_MODEL (claude-opus-5-5), BB_EFFORT (medium), BB_IP_PER_HOUR (20), BB_BASTION_PER_DAY (15),
//           BB_CAMPAIGN_PER_DAY (150), BB_DAILY_BUDGET_USD (3), BB_ORIGINS (https://deckofmanythings-a11y.github.io)

import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const MODEL = env("BB_MODEL", "claude-opus-5-5");
const EFFORT = env("BB_EFFORT", "medium");
const PRICE: Record<string, [number, number]> = { // $ per 1M tokens [input, output]
  "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5], "claude-opus-4-8": [5, 25],
};
const IP_PER_HOUR = +env("BB_IP_PER_HOUR", "20");
const BASTION_PER_DAY = +env("BB_BASTION_PER_DAY", "15");
const CAMPAIGN_PER_DAY = +env("BB_CAMPAIGN_PER_DAY", "150");
const DAILY_BUDGET = +env("BB_DAILY_BUDGET_USD", "3");
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

async function db(path: string, init: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
const rpc = (name: string, body: unknown) => db(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });

async function ipHash(req: Request) {
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
  const pepper = env("SUPABASE_SERVICE_ROLE_KEY").slice(-24);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bb-layout|${pepper}|${ip}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// ------------------------------------------------------------------ prompt + schema
const SYSTEM = `You plan floor layouts for D&D 2024 Bastions (player strongholds). A program draws the actual map on
5-ft graph paper; you only decide the arrangement, as JSON. How the program builds a floor:
- Each floor has one straight central hall running east-west. On the entrance floor (level 0) the front door opens
  from a foyer in the middle of the hall's south side. Stairs (when there are several floors) sit opposite the foyer.
- Rooms line both sides of the hall. "east" and "west" are the two wings, each listed from the middle (near the
  foyer and stairs) outward to the far end. The program picks north/south sides to keep the building compact.
- EVERY room always gets its own door onto the hall, so nobody has to walk through one room to reach another.
  You cannot remove that; you can only add extra connecting doors between neighbouring rooms ("pairs" with door).
- "pairs" keeps two rooms side by side in the same wing (the program puts them next to each other); list a pair's
  rooms consecutively in that wing. Use door:true only when an internal connecting door makes sense (dining room to
  kitchen, bedroom to private study). Never connect a service room (kitchen, smithy, storage) into a bedroom.
- "outdoor" rooms become fenced plots in the yard between the building and the gate. Courtyards, gardens, stables,
  training areas and menageries normally go outdoors; any room may if the player asks (e.g. "the smithy out back").
- A Demiplane is extradimensional and always drawn as a separate inset; never put it on a floor or outdoors.
- "secret" lists rooms whose hall door is a secret door.
Floors: level 0 is the entrance floor and must exist. Positive levels go up (1 = first upper floor), negative are
cellars/dungeons. A tower is many small floors stacked; a hillside or dungeon Bastion puts most rooms below ground.
Use your own good architectural sense: public rooms near the entrance, service rooms together, private rooms away
from noise, secure rooms deepest or highest. Follow the player's wishes wherever the rules allow, and say plainly in
the summary if something they asked for isn't possible. Every room ref you are given must appear exactly once:
in one floor's east or west list, or in outdoor (or nowhere if it is the Demiplane). Never invent refs.
"summary": 1-3 short sentences to the player describing the arrangement. "notes": one short evocative line about the
building itself for the map caption (e.g. "Carved into the hillside; the cellar vault is reached by a hidden stair"),
or "" if nothing to add. Floor "name" is a short label like "Ground Floor", "Tower Top", "Lower Dungeon".`;

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["summary", "notes", "floors", "outdoor", "pairs", "secret"],
  properties: {
    summary: { type: "string" },
    notes: { type: "string" },
    floors: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["name", "level", "east", "west"],
        properties: {
          name: { type: "string" }, level: { type: "integer" },
          east: { type: "array", items: { type: "string" } }, west: { type: "array", items: { type: "string" } },
        },
      },
    },
    outdoor: { type: "array", items: { type: "string" } },
    pairs: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["a", "b", "door"],
        properties: { a: { type: "string" }, b: { type: "string" }, door: { type: "boolean" } },
      },
    },
    secret: { type: "array", items: { type: "string" } },
  },
};

type Room = { ref: string; name: string; type: string; space: string; zone: string };
type Ask = { campaign: string; bastionId: string; request: string; rooms: Room[]; current: unknown; bastion: { name?: string; walls?: string } };

function validate(x: any): Ask | string {
  if (!x || typeof x !== "object") return "body must be a JSON object";
  if (typeof x.campaign !== "string" || !x.campaign || x.campaign.length > 60) return "campaign required";
  if (typeof x.bastionId !== "string" || !/^[a-z0-9]{8,40}$/.test(x.bastionId)) return "bastionId required";
  if (typeof x.request !== "string" || !x.request.trim()) return "Describe the layout you want.";
  if (x.request.length > 800) return "Please keep the description under 800 characters.";
  if (!Array.isArray(x.rooms) || !x.rooms.length || x.rooms.length > 60) return "rooms required";
  const rooms: Room[] = [];
  for (const r of x.rooms) {
    if (!r || typeof r.ref !== "string" || !/^[a-z0-9]{4,40}$/.test(r.ref)) return "bad room ref";
    const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
    rooms.push({ ref: r.ref, name: s(r.name, 80), type: s(r.type, 40), space: s(r.space, 10), zone: s(r.zone, 12) });
  }
  const cur = x.current && JSON.stringify(x.current).length < 8000 ? x.current : null;
  return { campaign: x.campaign, bastionId: x.bastionId, request: x.request.trim(), rooms, current: cur,
    bastion: { name: String(x.bastion?.name ?? "").slice(0, 80), walls: String(x.bastion?.walls ?? "").slice(0, 80) } };
}

// keep only known refs, each once; leftovers are reported so the browser can place them with its defaults
function clean(plan: any, rooms: Room[]) {
  const known = new Set(rooms.map((r) => r.ref)), seen = new Set<string>();
  const take = (arr: unknown) => (Array.isArray(arr) ? arr : []).filter((r) =>
    typeof r === "string" && known.has(r) && !seen.has(r) && seen.add(r));
  const floors = (Array.isArray(plan.floors) ? plan.floors : []).slice(0, 8).map((f: any) => ({
    name: String(f.name ?? "Floor").slice(0, 40), level: Math.max(-6, Math.min(8, Math.trunc(+f.level || 0))),
    east: take(f.east), west: take(f.west),
  }));
  if (!floors.some((f: any) => f.level === 0)) floors.unshift({ name: "Ground Floor", level: 0, east: [], west: [] });
  return {
    summary: String(plan.summary ?? "").slice(0, 600), notes: String(plan.notes ?? "").slice(0, 160),
    floors, outdoor: take(plan.outdoor),
    pairs: (Array.isArray(plan.pairs) ? plan.pairs : []).filter((p: any) => known.has(p?.a) && known.has(p?.b) && p.a !== p.b)
      .slice(0, 30).map((p: any) => ({ a: p.a, b: p.b, door: !!p.door })),
    secret: (Array.isArray(plan.secret) ? plan.secret : []).filter((r: any) => known.has(r)).slice(0, 30),
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin"), h = cors(origin);
  if (!originAllowed(origin)) return json({ error: "origin_not_allowed" }, 403, h);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, h);
  const apiKey = env("BB_ANTHROPIC_KEY") || env("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "not_configured", message: "AI layout isn't switched on yet." }, 503, h);

  let ask: Ask | string;
  try { ask = validate(await req.json()); } catch { ask = "body must be JSON"; }
  if (typeof ask === "string") return json({ error: "bad_request", message: ask }, 400, h);

  // the Bastion must exist in that campaign
  try {
    const rows = await db(`bb_bastions?select=id&id=eq.${ask.bastionId}&campaign=eq.${encodeURIComponent(ask.campaign)}`);
    if (!rows.length) return json({ error: "unknown_bastion", message: "Save the Bastion first, then try again." }, 404, h);
  } catch (e) {
    console.error("bb-layout: lookup failed", String(e));
    return json({ error: "internal", message: "AI layout is unavailable right now." }, 500, h);
  }

  let admit: { ok: boolean; id?: number; reason?: string; retry_after_s?: number };
  try {
    admit = await rpc("bb_ai_admit", {
      p_campaign: ask.campaign, p_bastion: ask.bastionId, p_ip_hash: await ipHash(req), p_request: ask.request,
      p_ip_per_hour: IP_PER_HOUR, p_bastion_per_day: BASTION_PER_DAY, p_campaign_per_day: CAMPAIGN_PER_DAY,
      p_daily_budget: DAILY_BUDGET,
    });
  } catch (e) {
    console.error("bb-layout: admit failed", String(e));
    return json({ error: "internal", message: "AI layout is unavailable right now." }, 500, h);
  }
  if (!admit.ok) {
    const msg = {
      budget: "The architect has used up today's budget for the whole table. Try again tomorrow.",
      bastion: `This Bastion has had its ${BASTION_PER_DAY} AI layouts for today. Try again tomorrow.`,
      campaign: "The architect has had a busy day. Try again tomorrow.",
      ip: "That's a lot of requests in a short time. Please wait a little and try again.",
    }[admit.reason || "ip"];
    return json({ error: "rate_limited", scope: admit.reason, retry_after_s: admit.retry_after_s, message: msg }, 429, h);
  }

  const started = Date.now();
  const finish = (status: string, u?: { input_tokens?: number; output_tokens?: number }) => {
    const [pi, po] = PRICE[MODEL] || [5, 25];
    const cost = ((u?.input_tokens || 0) * pi + (u?.output_tokens || 0) * po) / 1e6;
    return rpc("bb_ai_finish", { p_id: admit.id, p_status: status, p_model: MODEL, p_input_tokens: u?.input_tokens || 0,
      p_output_tokens: u?.output_tokens || 0, p_cost_usd: cost, p_latency_ms: Date.now() - started })
      .catch((e) => console.error("bb-layout: finish failed", String(e)));
  };

  const userMsg = [
    `Bastion: ${ask.bastion.name || "(unnamed)"}${ask.bastion.walls ? ` — walls: ${ask.bastion.walls}` : ""}`,
    `Rooms (ref, name, kind, size, usual zone):`,
    ...ask.rooms.map((r) => `- ${r.ref} | ${r.name} | ${r.type} | ${r.space} | ${r.zone}`),
    ask.current ? `\nCurrent plan (revise it according to the request; keep what the request doesn't change):\n${JSON.stringify(ask.current)}` : "",
    `\nPlayer's request:\n"""${ask.request}"""`,
  ].join("\n");

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 110_000 });
  // deno-lint-ignore no-explicit-any
  let resp: any;
  try {
    // fallbacks: "default" — a safety-classifier decline is retried server-side on Anthropic's recommended model.
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: MODEL, max_tokens: 16000,
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    };
    resp = await client.beta.messages.create(params);
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : 0;
    console.error("bb-layout: claude call failed", status, e instanceof Error ? e.message.slice(0, 300) : "");
    await finish(`upstream_${status || "error"}`);
    const busy = status === 429 || status === 529;
    return json({ error: "upstream_error", message: busy ? "The architect is busy. Try again in a minute." : "The architect couldn't plan that right now." }, 502, h);
  }

  if (resp.stop_reason === "refusal") {
    await finish("refusal", resp.usage);
    return json({ error: "refused", message: "The architect wouldn't plan that one. Try describing it differently." }, 422, h);
  }
  const text = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  let plan;
  try { plan = clean(JSON.parse(text), ask.rooms); } catch {
    await finish(resp.stop_reason === "max_tokens" ? "truncated" : "bad_json", resp.usage);
    return json({ error: "bad_output", message: "The architect's plan came back garbled. Please try again." }, 502, h);
  }
  await finish("ok", resp.usage);
  return json({ plan }, 200, h);
});
