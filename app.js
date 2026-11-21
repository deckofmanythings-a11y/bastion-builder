'use strict';
// Bastion Builder — state, rules engine, and UI. Vanilla JS; Bastions are shared through Supabase
// (raided-hex project, table bb_bastions) with a localStorage cache for fast start-up and offline viewing.

const LEGACY_KEY = 'bastion-builder-v1';            // pre-sharing, per-browser saves
const LEGACY_DONE_KEY = 'bastion-builder-v1-handled';
const CACHE_KEY = 'bastion-builder-cache-v2:' + (new URLSearchParams(location.search).get('campaign') || 'kyle-s4');
const ACTIVE_KEY = 'bastion-builder-active';
const CAMPAIGN = new URLSearchParams(location.search).get('campaign') || 'kyle-s4'; // ?campaign=xyz → separate list (used for testing)
const SB_URL = 'https://uaoxvhihwiygrajicend.supabase.co';
const SB_KEY = 'sb_publishable_91Zn_uJ9anW46vAClx6-bQ__wLL4fXl'; // publishable (browser-safe) key; RLS forbids deletes
const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gp = (n) => `${Number(n || 0).toLocaleString()} GP`;
function roll(n) { return 1 + Math.floor(Math.random() * n); }
const rollDice = (count, sides) => Array.from({ length: Math.max(0, count) }, () => roll(sides));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const DEF = Object.fromEntries(FACILITIES.map(f => [f.key, f]));

// ---------- state ----------
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

let state = { bastions: [], activeId: lsGet(ACTIVE_KEY) };
let tab = 'facilities';
let loaded = false;
const prereqOpen = {}; // bastion id -> whether the prerequisites panel is expanded (UI-only, survives redraws)

// ---------- shared sync ----------
const versions = {};   // id -> server version this browser last saw
const synced = {};     // id -> JSON of the copy the server has (skip no-op writes)
const inflight = {};   // id -> JSON currently being written (recognize our own realtime echo)
const dirty = new Set();
const chains = {};     // per-Bastion promise chain so writes land in order
let pushTimer = null, retryTimer = null, pendingRender = false;

function B() { return state.bastions.find(b => b.id === state.activeId) || null; }
function setActive(id) { state.activeId = id; lsSet(ACTIVE_KEY, id || ''); }
function save() { if (state.activeId) dirty.add(state.activeId); writeCache(); schedulePush(); }
function commit() { save(); render(); }
function writeCache() { lsSet(CACHE_KEY, JSON.stringify({ bastions: state.bastions, versions })); }
// Mark other Bastions (not just the active one) as changed, e.g. every member of a connection group.
function touch(list) { for (const x of list) dirty.add(x.id); }

// ---------- connected Bastions ----------
// A connection group is stored on every member as b.connection = { group, name, kind, notes }.
// Editing the group writes the same values to each member's row.
const CONNECTION_KINDS = {
  combined: { label: 'Combined into one structure', note: 'DMG "Combining Bastions": each still has its own special facilities, orders, and hirelings (hirelings can\'t be sent or shared). If an event costs one Bastion defenders, another owner in the group can take all or some of those losses instead.' },
  neighbors: { label: 'Neighbors (within 1 mile)', note: 'Separate buildings close together — a Masons\' Guild can build walls for a neighbor\'s Bastion within 1 mile.' },
  circle: { label: 'Linked by Teleportation Circle', note: 'Separate sites joined by magic. Record which facilities hold the circles in the notes.' },
  other: { label: 'Allied / other', note: 'An informal link — describe it in the notes.' },
};
function groupMembers(b) {
  const g = b?.connection?.group;
  return g ? state.bastions.filter(x => x.connection?.group === g) : [];
}
function connectionPartners(b) { return groupMembers(b).filter(x => x.id !== b.id); }
function ownerLabel(x) { return `${x.name}${x.character ? ` (${x.character})` : ''}`; }

function connectBastions(b, other, kind) {
  const target = other.connection?.group ? groupMembers(other) : [other];
  const mine = b.connection?.group ? groupMembers(b) : [b];
  const base = other.connection || b.connection || {};
  const conn = {
    group: base.group || uid() + uid(),
    name: base.name || `${b.name} & ${other.name}`,
    kind: base.kind || kind || 'combined',
    notes: base.notes || '',
  };
  const all = [...new Set([...target, ...mine])];
  for (const x of all) {
    x.connection = { ...conn };
    addLog(x, `Connected Bastions: now part of "${conn.name}" with ${all.filter(y => y !== x).map(ownerLabel).join(', ')}.`, 'build');
  }
  touch(all);
}
function disconnectBastion(b) {
  const others = connectionPartners(b);
  const name = b.connection?.name;
  delete b.connection;
  addLog(b, `Left the connected Bastions "${name}".`, 'build');
  for (const x of others) addLog(x, `${ownerLabel(b)} is no longer connected to "${name}".`, 'build');
  if (others.length === 1) delete others[0].connection; // a group of one isn't a connection
  touch([b, ...others]);
}
function updateGroup(b, field, value) {
  const all = groupMembers(b);
  for (const x of all) x.connection[field] = value;
  touch(all);
}

function setSync(s, title = '') {
  const el = $('#syncStatus'); if (!el) return;
  el.className = `sync ${s}`;
  el.textContent = { loading: 'Connecting…', ok: 'Saved', saving: 'Saving…', offline: 'Offline — will retry' }[s];
  el.title = title || { ok: 'All changes are saved to the shared party list', offline: 'Changes are kept on this device and will upload when the connection returns' }[s] || '';
}

function schedulePush() {
  if (!loaded) return;
  clearTimeout(pushTimer);
  setSync('saving');
  pushTimer = setTimeout(flush, 500);
}
function flush() {
  for (const id of [...dirty]) { dirty.delete(id); enqueue(id, () => pushOne(id)); }
}
function enqueue(id, fn) {
  chains[id] = (chains[id] || Promise.resolve()).then(fn).catch(err => { console.error(err); dirty.add(id); offline(); });
  return chains[id];
}
function offline() {
  setSync('offline');
  clearTimeout(retryTimer); retryTimer = setTimeout(flush, 5000);
}
function settle() { if (!dirty.size) setSync('ok'); }

async function pushOne(id) {
  const b = state.bastions.find(x => x.id === id);
  if (!b) return settle();
  const json = JSON.stringify(b);
  if (json === synced[id]) return settle();
  const v = versions[id];
  inflight[id] = json;
  const res = v == null
    ? await sb.from('bb_bastions').insert({ id, campaign: CAMPAIGN, data: b }).select('version')
    : await sb.from('bb_bastions').update({ data: b, version: v + 1 }).eq('id', id).eq('version', v).select('version');
  delete inflight[id];
  if (res.error) { dirty.add(id); return offline(); }
  if (!res.data || !res.data.length) {
    // Someone else saved this Bastion since we last loaded it — take theirs rather than overwrite.
    await reloadOne(id);
    toast(`Someone else just changed "${b.name}". Showing their latest version — please redo your last change.`);
    return settle();
  }
  versions[id] = res.data[0].version;
  synced[id] = json;
  writeCache();
  settle();
}

async function reloadOne(id) {
  const { data, error } = await sb.from('bb_bastions').select('id,data,version').eq('id', id).maybeSingle();
  if (error) return offline();
  if (!data) return removeLocal(id);
  acceptRow(data);
  dirty.delete(id);
  safeRender();
}

function acceptRow(row) {
  versions[row.id] = row.version;
  synced[row.id] = JSON.stringify(row.data);
  const i = state.bastions.findIndex(x => x.id === row.id);
  if (i >= 0) state.bastions[i] = row.data; else state.bastions.push(row.data);
  writeCache();
}
function removeLocal(id) {
  state.bastions = state.bastions.filter(x => x.id !== id);
  delete versions[id]; delete synced[id]; dirty.delete(id);
  if (state.activeId === id) setActive(state.bastions[0]?.id || null);
  writeCache(); safeRender();
}

// Don't yank an input out from under someone mid-typing; redraw when they leave the field.
function safeRender() {
  const a = document.activeElement;
  if (a && a.closest && a.closest('#app') && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { pendingRender = true; return; }
  render();
}
document.addEventListener('focusout', () => { if (pendingRender) { pendingRender = false; setTimeout(render, 0); } });

function onRemote(p) {
  if (p.eventType === 'DELETE') { if (p.old?.id) removeLocal(p.old.id); return; }
  const row = p.new; if (!row || row.campaign !== CAMPAIGN) return;
  const json = JSON.stringify(row.data);
  if (json === inflight[row.id] || json === JSON.stringify(state.bastions.find(x => x.id === row.id))) {
    versions[row.id] = Math.max(versions[row.id] || 0, row.version); synced[row.id] = json; return; // our own echo
  }
  if (row.version <= (versions[row.id] || 0)) return;
  const hadLocal = dirty.has(row.id);
  acceptRow(row); dirty.delete(row.id);
  if (!B()) setActive(row.id);
  if (hadLocal && row.id === state.activeId) toast(`Someone else changed "${row.data.name}" — showing their version.`);
  safeRender();
}

async function boot() {
  try { const c = JSON.parse(lsGet(CACHE_KEY)); if (c && Array.isArray(c.bastions)) { state.bastions = c.bastions; Object.assign(versions, c.versions || {}); } } catch { /* no cache */ }
  render();
  setSync('loading');
  const { data, error } = await sb.from('bb_bastions').select('id,data,version').eq('campaign', CAMPAIGN).order('created_at');
  if (error) {
    loaded = true; render(); offline();
    toast('Can\'t reach the shared list right now — showing this device\'s last copy.');
    return;
  }
  // Anything in the cache the server has never seen was made offline: keep it and upload it.
  const onServer = new Set(data.map(r => r.id));
  const offlineMade = state.bastions.filter(b => !onServer.has(b.id) && versions[b.id] == null);
  state.bastions = [];
  for (const k of Object.keys(versions)) delete versions[k];
  data.forEach(acceptRow);
  offlineMade.forEach(b => { state.bastions.push(b); dirty.add(b.id); });
  loaded = true;
  await offerLegacyUpload(onServer);
  if (!B()) setActive(state.bastions[0]?.id || null);
  render();
  if (dirty.size) schedulePush(); else setSync('ok');
  sb.channel(`bb:${CAMPAIGN}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bb_bastions', filter: `campaign=eq.${CAMPAIGN}` }, onRemote)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bb_bastions', filter: `campaign=eq.${CAMPAIGN}` }, onRemote)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bb_bastions' }, onRemote)
    .subscribe();
}

// Bastions made before sharing existed live only in that player's browser — offer to upload them once.
async function offerLegacyUpload(onServer) {
  if (lsGet(LEGACY_DONE_KEY)) return;
  let legacy = [];
  try { legacy = (JSON.parse(lsGet(LEGACY_KEY))?.bastions || []).filter(b => b && b.id && !onServer.has(b.id)); } catch { /* none */ }
  if (!legacy.length) { lsSet(LEGACY_DONE_KEY, '1'); return; }
  const names = legacy.map(b => `• ${b.name}${b.character ? ` (${b.character})` : ''}`).join('\n');
  if (confirm(`This device has ${legacy.length} Bastion${legacy.length > 1 ? 's' : ''} saved from before the party list was shared:\n\n${names}\n\nAdd ${legacy.length > 1 ? 'them' : 'it'} to the shared list so everyone can see ${legacy.length > 1 ? 'them' : 'it'}?`)) {
    for (const b of legacy) { state.bastions.push(b); dirty.add(b.id); }
    setActive(legacy[0].id);
  }
  lsSet(LEGACY_DONE_KEY, '1'); // the old save stays in localStorage untouched either way
}

function newBastion(name = 'New Bastion') {
  const b = {
    id: uid() + uid(), name, character: '', level: 5, prereqs: {}, gp: 0, day: 0, turn: 0, turnLength: 7,
    basics: [
      { id: uid(), type: 'Bedroom', space: 'Roomy', free: true, building: null },
      { id: uid(), type: 'Kitchen', space: 'Cramped', free: true, building: null },
    ],
    specials: [], walls: { built: 0, enclosed: false, building: null },
    extraDefenders: 0, armoryStocked: false, innerPeace: false,
    stash: [], log: [], pendingEvent: null, present: true, mode: 'orders', draft: {},
  };
  state.bastions.push(b);
  setActive(b.id);
  addLog(b, 'Bastion founded.');
  return b;
}

function addLog(b, text, kind = '') {
  b.log.push({ id: uid(), turn: b.turn, day: b.day, text, kind });
}

// ---------- rules helpers (also used by data.js) ----------
function slotsFor(level) { let n = 0; for (const [lv, c] of SLOT_TABLE) if (level >= lv) n = c; return n; }
function hasFacility(b, key) { return b.specials.some(f => f.key === key); }
function barrackCap(f) { return f.enlarged ? 25 : 12; }
function menagerieUsed(f) { return sum((f.creatures || []).map(c => (c.size === 'Large' ? 1 : 0.25))); }
function totalDefenders(b) {
  let n = b.extraDefenders || 0;
  for (const f of b.specials) {
    if (f.key === 'barrack') n += f.defenders || 0;
    if (f.creatures) n += f.creatures.filter(c => c.defender).length;
  }
  return n;
}
function hirelingCount(f) { const d = DEF[f.key]; return d.hirelings + (f.enlarged && d.enlarge ? (d.enlarge.hirelings || 0) : 0) + (f.key === 'war-room' ? (f.lieutenants || 0) : 0); }
function facSpace(f) { return f.enlarged ? 'Vast' : DEF[f.key].space; }
function facName(f) { return f.nickname ? `${f.nickname} (${DEF[f.key].name})` : DEF[f.key].name; }
function meetsPrereq(b, p) {
  if (!p) return true;
  const q = b.prereqs || {};
  if (p === 'focus') return !!(q.focus || q.arcane || q.divine || q.toolsFocus);
  return !!q[p];
}
function eligibility(b, def) {
  if (def.eberron && !b.eberron) return 'Turn on the Eberron option first';
  if (def.mobileOnly && !b.mobile) return 'Needs a mobile Bastion (Eberron option)';
  if (b.level < def.level) return `Requires level ${def.level}`;
  if (!meetsPrereq(b, def.prereq)) return `Requires: ${PREREQS[def.prereq]}`;
  if (!def.multiple && hasFacility(b, def.key)) return 'Already in your Bastion';
  if (b.specials.length >= slotsFor(b.level)) return 'No free special facility slots';
  return '';
}
function val(x, ...args) { return typeof x === 'function' ? x(...args) : x; }
function optionsFor(b, f) {
  const def = DEF[f.key];
  return def.orders.filter(o => (!o.minLevel || b.level >= o.minLevel) && (!o.guild || o.guild === f.options.guild));
}
function isShut(b, f) { return f.shutdownTurn != null && f.shutdownTurn >= b.turn + 1; }
function squaresUsed(b) {
  return sum(b.basics.map(x => SPACES[x.space].squares)) + sum(b.specials.map(f => SPACES[facSpace(f)].squares));
}

function makeSpecial(key) {
  const def = DEF[key];
  const f = { id: uid(), key, nickname: '', enlarged: false, enlarging: null, hirelings: [], options: {}, order: null, shutdownTurn: null };
  if (def.options?.garden) f.options.garden = ['Herb'];
  if (def.options?.books) f.options.books = [ARCHIVE_BOOKS[0]];
  if (def.options?.guild) f.options.guild = 'Adventurers';
  if (def.options?.beverage) f.options.beverages = [Object.keys(PUB_BEVERAGES)[0]];
  if (def.options?.trainer) f.options.trainer = Object.keys(TRAINERS)[0];
  if (def.options?.tools) f.options.tools = ARTISAN_TOOLS.slice(0, 6);
  if (key === 'barrack') f.defenders = 0;
  if (key === 'menagerie' || key === 'construct-forge') f.creatures = [];
  if (def.options?.house) f.options.house = DRAGONMARKED_HOUSES[0];
  if (def.options?.plane) f.options.plane = Object.keys(MANIFEST_PLANES)[0];
  if (def.options?.origins) f.options.origins = [Object.keys(MUSEUM_ORIGINS)[0]];
  if (key === 'war-room') f.lieutenants = 0;
  syncHirelings(f);
  return f;
}
function syncHirelings(f) {
  const n = hirelingCount(f);
  while (f.hirelings.length < n) f.hirelings.push('');
  if (f.hirelings.length > n) f.hirelings.length = n;
}

// ---------- treasury ----------
function spend(b, amount, why) {
  b.gp -= amount;
  if (amount) addLog(b, `${why}: −${gp(amount)}`, 'gp');
}
function earn(b, amount, why) {
  b.gp += amount;
  if (amount) addLog(b, `${why}: +${gp(amount)}`, 'gp');
}

// ---------- defenders ----------
function loseDefenders(b, n) {
  let left = n; const parts = [];
  const barracks = b.specials.filter(f => f.key === 'barrack').sort((a, c) => (c.defenders || 0) - (a.defenders || 0));
  for (const f of barracks) { const k = Math.min(left, f.defenders || 0); if (k) { f.defenders -= k; left -= k; parts.push(`${k} from ${facName(f)}`); } }
  if (left && b.extraDefenders) { const k = Math.min(left, b.extraDefenders); b.extraDefenders -= k; left -= k; parts.push(`${k} other`); }
  for (const f of b.specials.filter(x => x.creatures)) {
    for (const c of f.creatures.filter(c => c.defender)) { if (!left) break; f.creatures.splice(f.creatures.indexOf(c), 1); left--; parts.push(c.name); }
  }
  return parts.join(', ');
}

// ---------- turn engine ----------
function draftFor(b, f) { return (b.draft[f.id] ||= {}); }

function orderCost(b, f, opt, d) {
  if (opt.custom) return Math.max(0, Number(d.cost) || 0);
  return Math.max(0, Number(val(opt.cost ?? 0, b, f, d)) || 0);
}
function orderDays(b, f, opt, d) {
  if (opt.custom) return opt.customDays ? opt.customDays(Number(d.cost) || 0) : Math.max(1, Number(d.days) || 7);
  return Math.max(1, Number(val(opt.days ?? 7, b, f, d)) || 7);
}
function draftProblem(b, f, opt, d) {
  const reason = opt.avail ? opt.avail(b, f) : '';
  if (reason) return reason;
  if (opt.custom && !String(d.item || '').trim()) return 'Name the item';
  if (opt.choices && !d.choice) return 'Pick an option';
  if (opt.effect === 'creature') {
    const c = MENAGERIE_CREATURES.find(x => x.name === d.choice);
    if (c && menagerieUsed(f) + (c.size === 'Large' ? 1 : 0.25) > 4) return 'Not enough room';
  }
  return '';
}

function plannedOrders(b) {
  const out = [];
  if (!b.present || b.mode === 'maintain') return out;
  for (const f of b.specials) {
    if (f.order || isShut(b, f)) continue;
    const d = b.draft[f.id];
    if (!d || !d.optId) continue;
    const opt = optionsFor(b, f).find(o => o.id === d.optId);
    if (!opt) continue;
    if (opt.choices) {
      const c = opt.choices.find(x => x.value === d.choice);
      d.choiceCost = c?.cost || 0;
    }
    out.push({ f, opt, d, cost: orderCost(b, f, opt, d), problem: draftProblem(b, f, opt, d) });
  }
  return out;
}

function takeTurn() {
  const b = B();
  if (b.pendingEvent) return toast('Resolve the pending Bastion event first.');
  const maintain = !b.present || b.mode === 'maintain';
  const plan = plannedOrders(b);
  const bad = plan.find(p => p.problem);
  if (bad) return toast(`${facName(bad.f)}: ${bad.problem}`);
  const total = sum(plan.map(p => p.cost));
  if (total > b.gp && !confirm(`These orders cost ${gp(total)} but the treasury holds ${gp(b.gp)}. Go into debt?`)) return;

  const T = b.turn + 1;
  addLog(b, `— Bastion turn ${T} begins (day ${b.day + 1}) —`, 'turn');
  if (maintain) addLog(b, b.present ? 'Maintain order issued to the whole Bastion.' : 'Owner away — the Bastion acts as if given the Maintain order.');

  for (const p of plan) {
    const days = orderDays(b, p.f, p.opt, p.d);
    spend(b, p.cost, `${facName(p.f)} — ${p.opt.label}`);
    p.f.order = { optId: p.opt.id, label: p.opt.label, daysLeft: days, totalDays: days, input: { ...p.d }, issuedTurn: T };
    addLog(b, `${facName(p.f)}: ${DEF[p.f.key].order} — ${p.opt.label}${orderSummary(p.opt, p.d)} (${days} days).`);
  }

  const travel = plan.filter(p => p.opt.effect === 'travel');
  if (travel.length) {
    b.travelling = true;
    for (const f of b.specials) if (f.key === 'inquisitive-agency' || f.key === 'manifest-zone') f.needsNetwork = true;
    addLog(b, `The Bastion sets off${travel[0].d.topic ? ` for ${travel[0].d.topic}` : ''}. Issuing Travel means the DM rolls a Bastion event, as with Maintain.`, 'event');
  }
  advanceDays(b, b.turnLength);
  b.turn = T;
  b.draft = {};
  if (maintain || travel.length) rollEvent(b);
  commit();
  toast(`Bastion turn ${T} complete.`);
}

function orderSummary(opt, d) {
  const bits = [];
  if (d.choice) bits.push(d.choice);
  if (d.item) bits.push(d.item);
  if (d.topic) bits.push(d.topic);
  if (opt.qty && d.qty) bits.push(`${d.qty} ${opt.qty.label.toLowerCase()}`);
  return bits.length ? ` (${bits.join('; ')})` : '';
}

function advanceDays(b, L) {
  b.day += L;
  for (const f of b.specials) {
    if (f.order) {
      f.order.daysLeft -= L;
      if (f.order.daysLeft <= 0) completeOrder(b, f);
    }
    if (f.enlarging) {
      f.enlarging.daysLeft -= L;
      if (f.enlarging.daysLeft <= 0) { f.enlarging = null; f.enlarged = true; f.enlargedTurn = b.turn + 1; syncHirelings(f); addLog(b, `${facName(f)} enlarged to Vast. ${DEF[f.key].enlarge?.note || ''}`, 'build'); }
    }
  }
  for (const x of b.basics) {
    if (!x.building) continue;
    x.building.daysLeft -= L;
    if (x.building.daysLeft <= 0) {
      if (x.building.action === 'enlarge') { x.space = x.building.to; addLog(b, `${x.type} enlarged to ${x.space}.`, 'build'); }
      else addLog(b, `New ${x.space} ${x.type} completed.`, 'build');
      x.building = null;
    }
  }
  const w = b.walls.building;
  if (w) {
    // walls go up one square at a time
    const per = w.daysPerSquare;
    w.progress += L;
    const done = Math.min(w.squares, Math.floor(w.progress / per));
    if (done) { b.walls.built += done; w.squares -= done; w.progress -= done * per; addLog(b, `${done} square${done > 1 ? 's' : ''} of defensive wall completed.`, 'build'); }
    if (w.squares <= 0) b.walls.building = null;
  }
}

function completeOrder(b, f) {
  const o = f.order; f.order = null;
  const opt = DEF[f.key].orders.find(x => x.id === o.optId) || {};
  const d = o.input || {};
  const name = facName(f);
  const stash = (text) => { b.stash.push({ id: uid(), text, from: name, turn: b.turn + 1 }); addLog(b, `${name} finished: ${text} (added to stash).`, 'done'); };
  const note = (text) => addLog(b, `${name} finished: ${text}`, 'done');
  switch (opt.effect) {
    case 'stash': stash(opt.custom ? d.item : (val(opt.result, b, f, d) || opt.label)); break;
    case 'note': note(val(opt.result, b, f, d) || opt.label); break;
    case 'defenders': {
      const k = Math.min(4, barrackCap(f) - (f.defenders || 0));
      f.defenders = (f.defenders || 0) + k; note(`${k} Bastion Defender${k === 1 ? '' : 's'} recruited (now ${f.defenders}/${barrackCap(f)}).`); break;
    }
    case 'armory': b.armoryStocked = true; note('Armory stocked — defenders roll d8s instead of d6s in the next defender-loss roll.'); break;
    case 'gaming': {
      const r = roll(100); const row = GAMING_HALL_TABLE.find(x => r <= x.max); const dice = rollDice(row.dice, 6); const win = sum(dice) * 10;
      earn(b, win, `${name} gambling den (d100 ${r} → ${row.label}: [${dice.join(', ')}])`); break;
    }
    case 'garden': {
      const types = f.options.garden.slice(0, f.enlarged ? 2 : 1);
      types.forEach(t => stash(`${t} Garden harvest: ${GARDEN_TYPES[t]}`)); break;
    }
    case 'retype': f.options.garden[0] = d.choice; note(`Garden converted to ${d.choice}.`); break;
    case 'bakers':
      if (d.choice === 'coin') earn(b, 500, `${name} — Bakers' Guild event`);
      else stash('A favor owed by the event\'s host (Bakers\' Guild)');
      break;
    case 'walls': b.walls.built += Number(d.qty) || 0; note(`Masons built ${d.qty} square(s) of defensive wall at no cost.`); break;
    case 'innerPeace': b.innerPeace = true; note('Inner Peace — the next Bastion event is rolled twice and you choose.'); break;
    case 'observatory': {
      const r = roll(6);
      if (r % 2) { const charm = ['Charm of Darkvision', 'Charm of Heroism', 'Charm of Vitality'][roll(3) - 1]; stash(`${charm} (Eldritch Discovery, rolled ${r}) — or choose another of the three`); }
      else note(`Eldritch Discovery: rolled ${r} (even) — nothing gained.`);
      break;
    }
    case 'teleport': {
      const r = roll(6);
      if (r % 2 === 0) stash(`Friendly spellcaster in residence for 14 days — one Wizard spell of level ${b.level >= 17 ? 8 : 4} or lower (rolled ${r})`);
      else note(`Invitation declined (rolled ${r}, odd).`);
      break;
    }
    case 'trinket': {
      const r = roll(6);
      if (r % 2 === 0) stash(`Magic item from the Implements—Common table (rolled ${r})`);
      else note(`Trinket search found nothing useful (rolled ${r}, odd).`);
      break;
    }
    case 'theater':
      note(`Rehearsals for "${d.topic || 'the production'}" are done; performances begin. Contributors make DC 15 Charisma (Performance) checks — if more succeed than fail, each gains a Theater die (d${b.level >= 17 ? 10 : b.level >= 13 ? 8 : 6}).`);
      break;
    case 'creature': {
      const c = MENAGERIE_CREATURES.find(x => x.name === d.choice);
      f.creatures.push({ id: uid(), name: c.name, size: c.size, defender: true });
      note(`${c.name} added to the Menagerie (counts as a Bastion Defender).`); break;
    }
    case 'favor': f.favorUsed = true; note(`House ${f.options.house || ''} grants a favor your Renown allows (not counted against your usual favors).`); break;
    case 'network': f.needsNetwork = false; note('The new network of contacts and agents is in place.'); break;
    case 'relink': f.needsNetwork = false; note(`Planar link to ${f.options.plane} re-established.`); break;
    case 'construct': {
      const c = FORGE_CONSTRUCTS.find(x => x.name === d.choice) || { name: d.choice || 'Construct' };
      (f.creatures ||= []).push({ id: uid(), name: c.name, size: '', defender: true });
      note(`${c.name} built (counts as a Bastion Defender).`); break;
    }
    case 'travel': {
      note(`The Bastion travelled toward ${d.topic || 'its destination'} this turn (8 hours a day; it stops early on arrival or if something stops it).`);
      if (!b.specials.some(x => x !== f && x.order && DEF[x.key].orders.find(o2 => o2.id === x.order.optId)?.effect === 'travel')) b.travelling = false;
      break;
    }
    case 'lieutenant': f.lieutenants = (f.lieutenants || 0) + 1; syncHirelings(f); note(`Lieutenant recruited (${f.lieutenants}/10).`); break;
    case 'trade': {
      const net = Number(d.net) || 0;
      if (net >= 0) earn(b, net, `${name} trade`); else spend(b, -net, `${name} trade`);
      note(`Trade complete${d.topic ? `: ${d.topic}` : ''}.`); break;
    }
    default: note(o.label);
  }
}

// ---------- events ----------
function eventFor(r) { return EVENTS.find(e => r <= e.max); }

function rollEvent(b) {
  if (b.innerPeace) {
    b.innerPeace = false;
    const r1 = roll(100), r2 = roll(100);
    b.pendingEvent = { choose: [r1, r2] };
    addLog(b, `Inner Peace: Bastion event rolled twice — ${r1} (${eventFor(r1).name}) and ${r2} (${eventFor(r2).name}). Choose one.`, 'event');
    return;
  }
  resolveEvent(b, roll(100));
}

function randomFacility(b) { return b.specials.length ? b.specials[roll(b.specials.length) - 1] : null; }

// A random hireling, weighted by how many each special facility has.
function randomHireling(b) {
  const pool = b.specials.flatMap(f => Array.from({ length: hirelingCount(f) }, () => f));
  return pool.length ? pool[roll(pool.length) - 1] : null;
}

function resolveEvent(b, r, { reroll = false } = {}) {
  const e = eventFor(r);
  const ev = { roll: r, key: e.key, name: e.name, lines: [], actions: [] };
  const shutNext = (f, why) => { if (!f) return; f.shutdownTurn = b.turn + 1; ev.lines.push(`${facName(f)} can't be used on the next Bastion turn (${why}).`); };
  switch (e.key) {
    case 'allwell': { const k = roll(8); ev.lines.push(`Nothing significant happens. (d8 ${k}) ${ALL_WELL[k - 1]}`); break; }
    case 'attack': {
      ev.lines.push('A hostile force attacks the Bastion and is defeated.');
      if (b.guestMonster) {
        ev.lines.push(`Your guest, ${b.guestMonster}, defends the Bastion: no Bastion Defenders are lost. Having defended it once, the monster moves on.`);
        addLog(b, `${b.guestMonster} defended the Bastion and left.`, 'event');
        b.guestMonster = null;
      } else {
        const had = totalDefenders(b);
        const walls = !b.mobile && b.walls.enclosed && b.walls.built > 0;
        const count = 6 - (walls ? 2 : 0);
        const sides = b.armoryStocked ? 8 : 6;
        const dice = rollDice(count, sides);
        const ones = dice.filter(x => x === 1).length;
        if (had) ev.lines.push(`Rolled ${count}d${sides}${walls ? ' (walls: −2 dice)' : ''}${b.armoryStocked ? ' (stocked Armory: d8s)' : ''}: [${dice.join(', ')}]. Each 1 kills a Bastion Defender.`);
        if (had === 0) { ev.lines.push('The Bastion has no defenders, so a special facility is damaged.'); shutNext(randomFacility(b), 'damaged in the attack; repaired free afterwards'); }
        else if (ones) { const lost = loseDefenders(b, Math.min(ones, had)); ev.lines.push(`${Math.min(ones, had)} Bastion Defender(s) killed: ${lost}.`); }
        else ev.lines.push('No defenders lost.');
        if (b.armoryStocked) { b.armoryStocked = false; ev.lines.push('Armory equipment is expended.'); }
        if (b.connection?.kind === 'combined' && connectionPartners(b).length) ev.lines.push(`Combined Bastion: ${connectionPartners(b).map(ownerLabel).join(', ')} may take all or some of these defender losses instead.`);
      }
      if (b.refugees) { ev.lines.push(`The ${b.refugees.n} refugees sheltering here leave after the attack.`); b.refugees = null; }
      ev.lines.push('Any visiting Teleportation Circle spellcaster departs.');
      break;
    }
    case 'criminal': {
      const f = randomHireling(b); const bribe = roll(6) * 100;
      if (!f) { ev.lines.push('Officials arrive with a warrant, but your Bastion has no hirelings yet. Nothing happens.'); break; }
      const alone = hirelingCount(f) <= 1;
      ev.lines.push(`Officials or bounty hunters arrive with a warrant: a hireling in ${facName(f)} has a criminal past. Pay a bribe of ${gp(bribe)} to keep them, or let them be arrested.`);
      ev.lines.push(alone ? `If arrested, ${facName(f)} is left with no hirelings and can't be used on the next Bastion turn; then the hireling is replaced free.`
        : `If arrested, the hireling is replaced free; ${facName(f)} still has other hirelings, so it keeps working.`);
      ev.actions = [{ id: 'pay', label: `Pay the ${gp(bribe)} bribe`, gp: -bribe, log: 'Bribe paid; the hireling stays.' },
        { id: 'refuse', label: 'Let them be arrested', shut: alone ? f.id : null, log: `A hireling of ${facName(f)} is arrested${alone ? '' : ' and will be replaced'}.` }];
      break;
    }
    case 'opportunity':
      ev.lines.push("Your Bastion is offered the chance to host an important festival or celebration, fund a powerful spellcaster's research, or appease a domineering noble. Work out the details with your DM.");
      ev.lines.push('Seize it for 500 GP and the attention it brings means another roll on the Bastion Events table. Decline and nothing happens.');
      ev.actions = [{ id: 'invest', label: 'Seize it (500 GP)', gp: -500, again: true }, { id: 'decline', label: 'Decline' }];
      break;
    case 'visitors': {
      const g = roll(6) * 100, f = randomFacility(b); earn(b, g, 'Friendly visitors');
      ev.lines.push(`Friendly visitors pay ${gp(g)} for brief use of ${f ? `your ${facName(f)} (or another special facility, with your DM)` : 'one of your special facilities'}. It doesn't interrupt any orders.`);
      break;
    }
    case 'guest': {
      const k = roll(4), gt = GUEST_TABLE[k - 1];
      ev.lines.push(`A Friendly guest comes to stay. (d4 ${k}) ${gt.text}`);
      if (gt.effect === 'letter') { b.stash.push({ id: uid(), text: 'Letter of recommendation from a renowned guest (Mark of Prestige)', from: 'Bastion event: Guest', turn: b.turn }); ev.lines.push('The letter is added to your stash.'); }
      if (gt.effect === 'gift') { const g = roll(6) * 100; earn(b, g, "Guest's parting gift"); ev.lines.push(`Their gift: ${gp(g)}.`); }
      if (gt.effect === 'mercenary') { b.extraDefenders = (b.extraDefenders || 0) + 1; ev.lines.push('+1 Bastion Defender (shown under Other defenders).'); }
      if (gt.effect === 'monster') { b.guestMonster = 'a Friendly monster'; ev.lines.push('Name the monster with your DM on the Stash & Defenders tab.'); }
      break;
    }
    case 'lost': {
      const f = randomFacility(b);
      if (!f) { ev.lines.push('Your Bastion has no special facilities, so no one is lost.'); break; }
      ev.lines.push(`${facName(f)}'s hirelings leave (why is up to you).`); shutNext(f, 'no hirelings; replaced free afterwards'); break;
    }
    case 'magic': {
      const t = 'Uncommon Potion or Scroll of your choice (discovered or accidentally made by your hirelings)';
      b.stash.push({ id: uid(), text: t, from: 'Bastion event: Magical Discovery', turn: b.turn }); ev.lines.push(t + ': added to your stash, free.'); break;
    }
    case 'refugees': {
      const n = sum(rollDice(2, 4)), g = roll(6) * 100; earn(b, g, 'Refugees');
      b.refugees = { n: (b.refugees?.n || 0) + n, turn: b.turn };
      ev.lines.push(`${n} refugees fleeing a monster attack, natural disaster or other calamity seek refuge, and pay ${gp(g)} for your hospitality and protection. If no basic facility is big enough to house them, they camp just outside.`);
      ev.lines.push('They stay until you find them a new home (mark it on the Stash & Defenders tab) or a hostile force attacks.');
      break;
    }
    case 'aid':
      ev.lines.push('A local leader asks for help: a missing person, brigands troubling the area, or the like.');
      if (totalDefenders(b)) {
        ev.lines.push('To help, send one or more Bastion Defenders and roll 1d6 each. A total of 10 or more solves it for a reward of 1d6 × 100 GP. Under 10 still solves it, but the reward is halved and one defender you sent is killed.');
        ev.actions = [{ id: 'aid', label: 'Send defenders…', aid: true }, { id: 'ignore', label: 'Decline' }];
      } else ev.lines.push("You have no Bastion Defenders to send, so you can't help this time.");
      break;
    case 'treasure': {
      const k = roll(100), t = TREASURE_TABLE.find(x => k <= x.max);
      b.stash.push({ id: uid(), text: `Treasure: ${t.text}`, from: 'Bastion event: Treasure', turn: b.turn });
      ev.lines.push(`(d100 ${k}) The Bastion acquires ${t.text}. How (an inheritance, a gift, a theft, a lucky find) is up to you.`);
      ev.lines.push(b.present ? "You're in the Bastion, so you can claim it now (it's in your stash)." : "It's placed in your stash until you can claim it.");
      break;
    }
  }
  if (reroll) ev.lines.unshift('The opportunity draws attention, so the DM rolls again on the Bastion Events table:');
  addLog(b, `Bastion event (d100 ${r}): ${e.name}. ${ev.lines.join(' ')}`, 'event');
  b.pendingEvent = ev;
}

function eventAction(id) {
  const b = B(); const ev = b.pendingEvent; if (!ev) return;
  const a = ev.actions.find(x => x.id === id); if (!a) return;
  if (a.aid) {
    const max = totalDefenders(b);
    const n = Math.min(max, Math.max(0, parseInt(prompt(`Send how many defenders? (you have ${max})`, String(Math.min(max, 2))), 10) || 0));
    if (!n) return toast('No defenders sent.');
    const dice = rollDice(n, 6); const t = sum(dice); const reward = roll(6) * 100;
    if (t >= 10) { earn(b, reward, 'Request for aid reward'); addLog(b, `Sent ${n} defenders: [${dice.join(', ')}] = ${t}. Problem solved! Reward ${gp(reward)}.`, 'event'); }
    else { const half = Math.floor(reward / 2); earn(b, half, 'Request for aid (halved)'); const lost = loseDefenders(b, 1); addLog(b, `Sent ${n} defenders: [${dice.join(', ')}] = ${t}. Solved, but the reward is halved to ${gp(half)} and one defender is killed: ${lost || 'no one'}.`, 'event'); }
  } else {
    if (a.gp) { if (a.gp < 0) spend(b, -a.gp, `${ev.name}: ${a.label}`); else earn(b, a.gp, ev.name); }
    if (a.shut) { const f = b.specials.find(x => x.id === a.shut); if (f) { f.shutdownTurn = b.turn + 1; addLog(b, `${facName(f)} has no hirelings and can't be used next turn.`, 'event'); } }
    if (a.log) addLog(b, a.log, 'event'); else if (!a.gp && !a.shut) addLog(b, `${ev.name}: ${a.label}.`, 'event');
  }
  b.pendingEvent = null;
  if (a.again) { // Extraordinary Opportunity: roll again, rerolling Opportunity itself
    let r; do r = roll(100); while (eventFor(r).key === 'opportunity');
    resolveEvent(b, r, { reroll: true });
  }
  commit();
}

// ---------- rendering ----------
function render() {
  renderTop();
  const b = B();
  const app = $('#app');
  if (!b) { app.innerHTML = loaded ? emptyView() : '<div class="empty"><div class="empty-crest">♜</div><h1>Gathering the party&rsquo;s Bastions…</h1></div>'; return; }
  for (const f of b.specials) {
    f.options ||= {}; syncHirelings(f);
    if (f.addedTurn == null) f.addedTurn = b.turn; // backfill saves made before this field existed
    if (f.enlarged && f.enlargedTurn == null) f.enlargedTurn = b.turn;
  }
  app.innerHTML = `
    <aside class="side">${sideView(b)}</aside>
    <section class="main">
      <nav class="tabs">
        ${[['facilities', 'Facilities'], ['turn', 'Bastion Turn'], ['stash', 'Stash & Defenders'], ['connections', 'Connections'], ['maps', 'Maps'], ['log', 'Chronicle']]
          .map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${l}${k === 'turn' && b.pendingEvent ? ' <span class="dot"></span>' : ''}${k === 'connections' && connectionPartners(b).length ? ` <small class="tabcount">${connectionPartners(b).length}</small>` : ''}${k === 'maps' && b.maps?.length ? ` <small class="tabcount">${b.maps.length}</small>` : ''}</button>`).join('')}
      </nav>
      <div class="panel">${tab === 'facilities' ? facilitiesView(b) : tab === 'turn' ? turnView(b) : tab === 'stash' ? stashView(b) : tab === 'connections' ? connectionsView(b) : tab === 'maps' ? mapsView(b) : logView(b)}</div>
    </section>`;
}

function renderTop() {
  const sel = $('#bastionSelect');
  sel.innerHTML = state.bastions.length
    ? state.bastions.map(b => `<option value="${b.id}" ${b.id === state.activeId ? 'selected' : ''}>${esc(b.name)}${b.character ? ` — ${esc(b.character)}` : ''}</option>`).join('')
    : '<option>No bastions yet</option>';
  sel.disabled = !state.bastions.length;
}

function emptyView() {
  return `<div class="empty">
    <div class="empty-crest">♜</div>
    <h1>Raise your Bastion</h1>
    <p>No Bastions in the party list yet. At level 5, every adventurer can claim a Bastion — a home, a stronghold, and a place of power. Build its facilities, issue orders to its hirelings each Bastion turn, and weather whatever events befall it.</p>
    <button class="btn big" data-act="new">Found a Bastion</button>
  </div>`;
}

function sideView(b) {
  const slots = slotsFor(b.level);
  const building = b.basics.filter(x => x.building).length + b.specials.filter(f => f.enlarging).length + (b.walls.building ? 1 : 0);
  const busy = b.specials.filter(f => f.order).length;
  return `
    <div class="card">
      <label class="field"><span>Bastion name</span><input data-bind="name" value="${esc(b.name)}"></label>
      <label class="field"><span>Character</span><input data-bind="character" value="${esc(b.character)}" placeholder="Who owns it?"></label>
      <label class="field"><span>Campaign</span><select data-bind="campaign">
        <option value="" ${!b.campaign ? 'selected' : ''}>— Choose campaign —</option>
        ${[...CAMPAIGNS, ...(b.campaign && !CAMPAIGNS.includes(b.campaign) ? [b.campaign] : [])].map(c => `<option ${b.campaign === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select></label>
      <label class="field"><span>Location</span><input data-bind="location" maxlength="120" value="${esc(b.location || '')}" placeholder="Where is it? e.g. a cliffside above Neverwinter"></label>
      <label class="field"><span>Character level</span><input type="number" min="1" max="20" data-bind="level" data-num value="${b.level}"></label>
      ${b.level < 5 ? '<p class="warn">Bastions are normally gained at level 5.</p>' : ''}
      ${(() => {
        const n = Object.values(b.prereqs || {}).filter(Boolean).length;
        const open = prereqOpen[b.id] ?? n === 0; // user's choice wins; default open until something is ticked
        return `<details class="prereqs" data-prereq-panel ${open ? 'open' : ''}>
        <summary>Facility prerequisites <small>${n ? `${n} selected` : 'none selected'}</small></summary>
        ${Object.entries(PREREQS).filter(([k]) => b.eberron || !(k in EBERRON_PREREQS)).map(([k, t]) => `<label class="check prereq-opt ${b.prereqs?.[k] ? 'on' : ''}"><input type="checkbox" data-prereq="${k}" ${b.prereqs?.[k] ? 'checked' : ''}><span>${t}</span></label>`).join('')}
      </details>`;
      })()}
      ${eberronBox(b)}
    </div>
    <div class="card treasury">
      <div class="label">Treasury</div>
      <div class="gp ${b.gp < 0 ? 'neg' : ''}">${gp(b.gp)}</div>
      <div class="row">
        <input id="gpAmt" type="number" min="0" placeholder="Amount">
        <button class="btn sm" data-act="gp+">Add</button>
        <button class="btn sm ghost" data-act="gp-">Spend</button>
      </div>
      <input id="gpNote" placeholder="Note (optional)">
    </div>
    <div class="card stats">
      <div><span>Bastion turn</span><b>${b.turn}</b></div>
      <div><span>In-game day</span><b>${b.day}</b></div>
      <div><span>Special facilities</span><b>${b.specials.length} / ${slots}</b></div>
      <div><span>Defenders</span><b>${totalDefenders(b)}</b></div>
      <div><span>Orders underway</span><b>${busy}</b></div>
      <div><span>Construction</span><b>${building}</b></div>
      <div><span>Floor area</span><b>${squaresUsed(b)} sq</b></div>
      <div><span>Walls</span><b>${b.walls.built} sq</b></div>
      ${connectionPartners(b).length ? `<div class="conn-stat"><span>Connected</span><b>${esc(b.connection.name)}</b><small>with ${connectionPartners(b).map(x => esc(x.name)).join(', ')}</small></div>` : ''}
    </div>`;
}

// ----- facilities tab -----
function facilitiesView(b) {
  const slots = slotsFor(b.level);
  const free = slots - b.specials.length;
  return `
    <div class="section-head">
      <h2>Special Facilities <small>${b.specials.length} of ${slots}</small></h2>
      <button class="btn" data-act="pickSpecial" ${free > 0 ? '' : 'disabled'}>+ Add special facility</button>
    </div>
    ${free < 0 ? `<p class="warn">You have ${-free} more special facilit${free === -1 ? 'y' : 'ies'} than your level allows — remove ${free === -1 ? 'one' : 'some'}.</p>` : ''}
    <p class="hint">${free > 0 ? `You can add ${free} more.` : 'All slots filled.'} Slots: 2 at level 5, 4 at 9, 5 at 13, 6 at 17. Each time you gain a level you may swap one special facility for another.</p>
    <div class="grid">${b.specials.map(f => specialCard(b, f)).join('') || '<div class="placeholder">No special facilities yet. Pick two to start.</div>'}</div>

    <div class="section-head"><h2>Basic Facilities</h2></div>
    <p class="hint">No game effects — they're for roleplay and verisimilitude. Your Bastion starts with one free Cramped and one free Roomy basic facility.</p>
    <details class="card rules" ${b.basics.length <= 2 ? 'open' : ''}>
      <summary>How building &amp; enlarging rooms works</summary>
      <div class="ladder">
        ${['Cramped', 'Roomy', 'Vast'].map((s, i) => `
          ${i ? `<div class="step"><span>Enlarge</span><b>${gp(BASIC_ENLARGE[['Cramped', 'Roomy'][i - 1]].cost)}</b><span>${BASIC_ENLARGE[['Cramped', 'Roomy'][i - 1]].days} days</span><i>→</i></div>` : ''}
          <div class="size"><b>${s}</b><span>${SPACES[s].squares} squares</span><small>Build new: ${gp(BASIC_ADD[s].cost)} · ${BASIC_ADD[s].days} days</small></div>`).join('')}
      </div>
      <ul class="small">
        <li><b>Enlarge one size at a time.</b> Cramped → Vast means doing both steps: ${gp(BASIC_ENLARGE.Cramped.cost + BASIC_ENLARGE.Roomy.cost)} and ${BASIC_ENLARGE.Cramped.days + BASIC_ENLARGE.Roomy.days} days in total (a brand-new Vast room is ${gp(BASIC_ADD.Vast.cost)} and ${BASIC_ADD.Vast.days} days).</li>
        <li>Enlarging a basic room is purely cosmetic — it just makes your Bastion bigger.</li>
        <li>Any number of rooms can be built or enlarged at once, and you don't need to be at your Bastion. Progress ticks along with each Bastion turn.</li>
        <li>Special facilities are different: they can only be enlarged if their own card says so (usually ${gp(2000)} to Vast, for a real benefit).</li>
      </ul>
    </details>
    <div class="basics">${b.basics.map(x => basicRow(b, x)).join('')}</div>
    <div class="card addbasic">
      <b>Add a basic facility</b>
      <select id="newBasicType">${BASIC_TYPES.map(t => `<option>${t}</option>`).join('')}</select>
      <select id="newBasicSpace">${Object.entries(BASIC_ADD).map(([s, v]) => `<option value="${s}">${s} — ${gp(v.cost)}, ${v.days} days</option>`).join('')}</select>
      <button class="btn sm" data-act="addBasic">Commission</button>
    </div>

    ${nooksCard(b)}
    ${shapesCard(b)}

    <div class="section-head"><h2>Defensive Walls</h2></div>
    ${b.mobile ? '<div class="card walls"><p>A mobile Bastion can\'t have defensive walls (Eberron rules), so attacks always roll the full dice.</p></div>' : `<div class="card walls">
      <p>20-ft walls with a walkway. Each 5-ft square costs ${gp(WALL.costPerSquare)} and takes ${WALL.daysPerSquare} days. If the Bastion is <b>completely enclosed</b>, attacks roll 2 fewer dice for defender losses.</p>
      <div class="row">
        <span>Built: <b>${b.walls.built}</b> squares</span>
        ${b.walls.building ? `<span class="pill build">Building ${b.walls.building.squares} more · next square in ${b.walls.building.daysPerSquare - b.walls.building.progress} days</span>` : ''}
        <label class="check"><input type="checkbox" data-act="enclosed" ${b.walls.enclosed ? 'checked' : ''}> Completely enclosed</label>
      </div>
      ${b.walls.building ? '' : `<div class="row"><input id="wallSq" type="number" min="1" value="4" style="width:6em"> squares <button class="btn sm" data-act="buildWalls">Build walls</button></div>`}
    </div>`}`;
}

function specialCard(b, f) {
  const def = DEF[f.key];
  const status = f.order
    ? `<span class="pill busy">${esc(f.order.label)} · ${f.order.daysLeft} day${f.order.daysLeft === 1 ? '' : 's'} left</span>`
    : isShut(b, f) ? '<span class="pill shut">Out of action next turn</span>' : '<span class="pill idle">Ready for orders</span>';
  return `<article class="fac" data-fid="${f.id}">
    <header>
      <div>
        <h3>${esc(def.name)}${def.verify ? ' <span class="verify" title="Summarized from memory — check the DMG">✱</span>' : ''}</h3>
        <input class="nick" data-fbind="nickname" value="${esc(f.nickname)}" placeholder="Give it a name…">
      </div>
      <div class="badges"><span class="badge">Lv ${def.level}</span><span class="badge">${facSpace(f)}</span><span class="badge ord ord-${def.order.toLowerCase()}">${def.order}</span></div>
    </header>
    <p>${esc(def.desc)}</p>
    ${def.passive ? `<p class="passive">${esc(def.passive)}</p>` : ''}
    ${facilityOptions(b, f)}
    ${facilityExtras(b, f)}
    ${upgradeBlock(f)}
    <div class="hirelings"><span class="label">Hirelings (${hirelingCount(f)})</span>
      ${f.hirelings.map((h, i) => `<input data-hireling="${i}" value="${esc(h)}" placeholder="Hireling ${i + 1}">`).join('')}
    </div>
    <footer>
      ${status}
      <span class="spacer"></span>
      <button class="btn sm ghost danger" data-act="removeSpecial">Remove</button>
    </footer>
  </article>`;
}

// Spells out the facility's upgrade path on the card so players don't need the book open.
function upgradeBlock(f) {
  const def = DEF[f.key]; const e = def.enlarge;
  const from = `${def.space} (${SPACES[def.space].squares} sq)`, to = `Vast (${SPACES.Vast.squares} sq)`;
  if (!e) {
    return `<div class="upgrade none"><span class="label">Upgrade</span> ${def.space === 'Vast' ? 'Already Vast — this is its full size.' : `Stays ${esc(def.space)} — the DMG gives this facility no enlargement option.`}</div>`;
  }
  if (f.enlarged) return `<div class="upgrade done"><span class="label">Upgrade</span> ✔ Enlarged to ${to}. ${esc(e.note)}</div>`;
  if (f.enlarging) {
    const pct = Math.round(100 * (1 - f.enlarging.daysLeft / SPECIAL_ENLARGE_DAYS));
    return `<div class="upgrade going"><span class="label">Upgrade</span> Enlarging ${from} → ${to} — <b>${f.enlarging.daysLeft} days left</b>. Keeps working normally meanwhile.
      <div class="bar"><i style="width:${pct}%"></i></div><p class="small">When finished: ${esc(e.note)}</p></div>`;
  }
  return `<div class="upgrade"><span class="label">Upgrade available</span>
    <p><b>Enlarge ${from} → ${to}</b> · ${gp(e.cost)} · ${SPECIAL_ENLARGE_DAYS} days<span class="verify" title="The DMG pages give only the cost; time assumed equal to a basic Roomy→Vast enlargement.">✱</span></p>
    <p class="small">You get: ${esc(e.note)}</p>
    <button class="btn sm" data-act="enlargeSpecial">Enlarge for ${gp(e.cost)}</button></div>`;
}

const HELMS = ['lyrandar-helm', 'navigators-helm', 'orien-helm'];
function eberronBox(b) {
  const ebf = b.specials.filter(f => DEF[f.key]?.eberron);
  const helms = b.specials.filter(f => HELMS.includes(f.key));
  return `<div class="eberron ${b.eberron ? 'on' : ''}">
    <label class="check"><input type="checkbox" data-act="eberron" ${b.eberron ? 'checked' : ''}> <b>Eberron rules</b> <span class="badge">${esc(EBERRON_SOURCE)}</span></label>
    <p class="small">Adds Bastion rules and 10 special facilities from the <i>Eberron</i> campaign setting (mobile Bastions, the helms, Dragonmark Outpost, Kundarak Vault, Manifest Zone, Museum, Artificer's and Construct Forges, Inquisitive Agency). <b>Check with your DM that Eberron content is allowed before turning this on.</b></p>
    ${b.eberron ? `
      <label class="check"><input type="checkbox" data-act="mobile" ${b.mobile ? 'checked' : ''}> Mobile Bastion (built inside a vehicle)</label>
      ${b.mobile ? `<label class="field"><span>Vehicle</span><input data-mobile-vehicle value="${esc(b.mobile.vehicle || '')}" placeholder="e.g. sailing ship, Lightning Rail cart, elemental airship"></label>
        <p class="small">A mobile Bastion needs a propulsion facility: Lyrandar Helm (elemental airship or galleon), Navigator's Helm (ordinary ship or boat) or Orien Helm (Lightning Rail cart).${helms.length ? '' : ' <b>This one has none yet.</b>'} Travel moves it 8 hours a day for the Bastion turn and makes the DM roll a Bastion event. It can't have defensive walls, and facilities may be a little bigger or smaller to fit the vehicle (DM's call). If several characters combine Bastions in one vehicle, each needs the same kind of helm and all must order Travel together; hirelings then work in 8-hour shifts, so three helms can travel 24 hours a day. Encounters on the way can cut off facilities, including the helm.</p>
        ${b.travelling ? '<p class="pill build">Travelling this turn</p>' : ''}` : ''}
      ${ebf.length ? `<p class="small muted">Eberron facilities here: ${ebf.map(f => esc(facName(f))).join(', ')}.</p>` : ''}` : ''}
  </div>`;
}

function facilityOptions(b, f) {
  const def = DEF[f.key]; const o = def.options || {}; const out = [];
  if (o.garden) {
    const n = f.enlarged ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const cur = f.options.garden[i] || 'Herb';
      // A garden's type is picked freely when it's built (or when a Vast enlargement adds the 2nd one).
      // Once a Bastion turn has passed, changing it takes the 21-day Change Garden Type order.
      const since = i === 0 ? f.addedTurn : f.enlargedTurn;
      const locked = since != null && b.turn > since;
      out.push(`<label class="field inline"><span>${n > 1 ? `Garden ${i + 1}` : 'Garden type'}</span><select data-opt="garden" data-idx="${i}" ${locked ? 'disabled' : ''}>${Object.keys(GARDEN_TYPES).map(t => `<option ${t === cur ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`);
      out.push(`<p class="small">${locked ? 'Type is set — to change it, issue the <b>Change Garden Type</b> order on the Bastion Turn tab (21 days).' : 'Pick freely now; after your next Bastion turn, changing it takes a 21-day order.'}</p>`);
    }
    out.push(`<p class="small">Harvest: ${f.options.garden.slice(0, n).map(t => esc(GARDEN_TYPES[t])).join(' · ')}</p>`);
  }
  if (o.books) {
    const n = f.enlarged ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const cur = f.options.books[i] || ARCHIVE_BOOKS[i] || ARCHIVE_BOOKS[0];
      out.push(`<label class="field"><span>Reference book ${n > 1 ? i + 1 : ''}</span><select data-opt="books" data-idx="${i}">${ARCHIVE_BOOKS.map(t => `<option ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`);
    }
  }
  if (o.guild) {
    out.push(`<label class="field"><span>Guild</span><select data-opt="guild">${Object.entries(GUILDS).map(([k, g]) => `<option value="${k}" ${k === f.options.guild ? 'selected' : ''}>${k}' Guild (${g.symbol})</option>`).join('')}</select></label>
      <p class="small">${esc(GUILDS[f.options.guild].text)}</p>`);
  }
  if (o.beverage) {
    const n = f.enlarged ? 2 : 1; const names = Object.keys(PUB_BEVERAGES);
    for (let i = 0; i < n; i++) {
      const cur = f.options.beverages[i] || names[i];
      out.push(`<label class="field"><span>On tap ${n > 1 ? i + 1 : ''}</span><select data-opt="beverages" data-idx="${i}">${names.map(t => `<option ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><p class="small">${esc(PUB_BEVERAGES[cur])}</p>`);
    }
  }
  if (o.trainer) {
    out.push(`<label class="field"><span>Expert trainer</span><select data-opt="trainer">${Object.keys(TRAINERS).map(t => `<option ${t === f.options.trainer ? 'selected' : ''}>${t}</option>`).join('')}</select></label><p class="small">Benefit: ${esc(TRAINERS[f.options.trainer])}.</p>`);
  }
  if (o.house) {
    out.push(`<label class="field"><span>Dragonmarked house</span><select data-opt="house">${DRAGONMARKED_HOUSES.map(h => `<option ${h === f.options.house ? 'selected' : ''}>${h}</option>`).join('')}</select></label>`);
    if (f.favorUsed) out.push(`<p class="small">House Favor used. <button class="btn xs ghost" data-act="favorReset">My Renown with the house went up</button></p>`);
  }
  if (o.plane) {
    out.push(`<label class="field"><span>Linked plane</span><select data-opt="plane">${Object.keys(MANIFEST_PLANES).map(t => `<option ${t === f.options.plane ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><p class="small">Manifest Charm: ${esc(MANIFEST_PLANES[f.options.plane])}.${f.needsNetwork ? ' <b>Link suspended:</b> the Bastion has moved; re-establish it (7 days).' : ''}</p>`);
  }
  if (o.origins) {
    const n = f.enlarged ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const cur = f.options.origins[i] || Object.keys(MUSEUM_ORIGINS)[i] || Object.keys(MUSEUM_ORIGINS)[0];
      out.push(`<label class="field"><span>Treasure on display ${n > 1 ? i + 1 : ''}</span><select data-opt="origins" data-idx="${i}">${Object.keys(MUSEUM_ORIGINS).map(t => `<option ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><p class="small">Charm of ${esc(cur)}: while you have it, ${esc(MUSEUM_ORIGINS[cur])}.</p>`);
    }
    if (n > 1 && f.options.origins[0] === f.options.origins[1]) out.push('<p class="warn small">The two treasures must have different origins.</p>');
  }
  if (DEF[f.key].key === 'inquisitive-agency' && f.needsNetwork) out.push('<p class="small"><b>Network needed:</b> the Bastion has moved, so the secretary must spend 7 days building a new one.</p>');
  if (o.tools) {
    const n = f.enlarged ? 9 : 6;
    out.push(`<div class="field"><span>Artisan's tools (${f.options.tools.length}/${n})</span><div class="chips">${ARTISAN_TOOLS.map(t => `<label class="chip ${f.options.tools.includes(t) ? 'on' : ''}"><input type="checkbox" data-tool="${esc(t)}" ${f.options.tools.includes(t) ? 'checked' : ''}>${esc(t)}</label>`).join('')}</div></div>`);
  }
  return out.join('');
}

function facilityExtras(b, f) {
  if (f.key === 'barrack') {
    return `<div class="counter"><span class="label">Defenders housed</span>
      <button class="btn sm ghost" data-act="def-">−</button><b>${f.defenders || 0} / ${barrackCap(f)}</b><button class="btn sm ghost" data-act="def+">+</button></div>`;
  }
  if (f.key === 'menagerie') {
    return `<div class="creatures"><span class="label">Creatures (${menagerieUsed(f)} / 4 Large spaces)</span>
      ${(f.creatures || []).map(c => `<div class="creature"><span>${esc(c.name)} <small>${c.size}</small></span>
        <label class="check"><input type="checkbox" data-creature-def="${c.id}" ${c.defender ? 'checked' : ''}> Defender</label>
        <button class="btn xs ghost danger" data-creature-del="${c.id}">✕</button></div>`).join('') || '<p class="small">Use the Recruit order to add creatures.</p>'}</div>`;
  }
  if (f.key === 'construct-forge') {
    return `<div class="creatures"><span class="label">Constructs</span>
      ${(f.creatures || []).map(c => `<div class="creature"><span>${esc(c.name)}</span>
        <label class="check" title="Untick to let it act by its own nature; it then can't defend the Bastion"><input type="checkbox" data-creature-def="${c.id}" ${c.defender ? 'checked' : ''}> Defender</label>
        <button class="btn xs ghost danger" data-creature-del="${c.id}">✕</button></div>`).join('') || '<p class="small">Use the Recruit order to build Constructs.</p>'}</div>`;
  }
  if (f.key === 'war-room') {
    return `<div class="counter"><span class="label">Lieutenants</span><button class="btn sm ghost" data-act="lt-">−</button><b>${f.lieutenants || 0} / 10</b><button class="btn sm ghost" data-act="lt+">+</button></div>`;
  }
  if (f.key === 'meditation') {
    return `<button class="btn sm ghost" data-act="fortify">Roll Fortify Self saves</button>`;
  }
  if (f.key === 'armory') {
    return `<p class="small">Status: <b>${b.armoryStocked ? 'Stocked' : 'Depleted'}</b></p>`;
  }
  return '';
}

function basicRow(b, x) {
  const enl = BASIC_ENLARGE[x.space];
  return `<div class="basic" data-bid="${x.id}">
    ${x.free ? `<select data-basic-type>${BASIC_TYPES.map(t => `<option ${t === x.type ? 'selected' : ''}>${t}</option>`).join('')}</select>` : `<b>${esc(x.type)}</b>`}
    <span class="badge">${x.space} · ${SPACES[x.space].squares} sq</span>
    ${x.free ? '<span class="badge free">Free</span>' : ''}
    <span class="spacer"></span>
    ${x.building ? `<span class="pill build">${x.building.action === 'enlarge' ? `Enlarging to ${x.building.to}` : 'Under construction'} · ${x.building.daysLeft} days</span>`
      : enl ? `<span class="small">Next size: ${enl.to} (${SPACES[enl.to].squares} sq)</span><button class="btn xs ghost" data-act="enlargeBasic">Enlarge · ${gp(enl.cost)} · ${enl.days} days</button>`
      : '<span class="small">Max size</span>'}
    ${!x.free ? '<button class="btn xs ghost danger" data-act="removeBasic">✕</button>' : ''}
  </div>`;
}

// ----- turn tab -----
function turnView(b) {
  const maintain = !b.present || b.mode === 'maintain';
  const plan = plannedOrders(b);
  const total = sum(plan.map(p => p.cost));
  return `
    ${b.pendingEvent ? eventPanel(b) : ''}
    <div class="card turnhead">
      <div class="row wrap">
        <h2>Bastion Turn ${b.turn + 1}</h2>
        <span class="spacer"></span>
        <label class="field inline"><span>Turn length</span><input type="number" min="1" max="90" data-bind="turnLength" data-num value="${b.turnLength}" style="width:5em"> days</label>
      </div>
      <label class="check"><input type="checkbox" data-bind-check="present" ${b.present ? 'checked' : ''}> ${esc(b.character || 'The owner')} is in the Bastion (or can reach the hirelings with <i>Sending</i>)</label>
      <div class="seg">
        <button class="${!maintain ? 'on' : ''}" data-mode="orders" ${b.present ? '' : 'disabled'}>Issue orders to facilities</button>
        <button class="${maintain ? 'on' : ''}" data-mode="maintain">Maintain (roll an event)</button>
      </div>
      <p class="hint">${maintain ? esc(ORDER_INFO.Maintain) : 'Pick an order for any idle facility — you needn\'t order all of them. Orders take effect over the turn; most finish at its end.'}${b.innerPeace ? ' <b>Inner Peace is active:</b> the next event is rolled twice.' : ''}</p>
    </div>
    <div class="orders">${b.specials.map(f => orderRow(b, f, maintain)).join('') || '<div class="placeholder">Add special facilities to issue orders.</div>'}</div>
    <div class="card turnfoot">
      <div>${maintain ? 'No facility orders — the Bastion is maintained.' : `${plan.length} order${plan.length === 1 ? '' : 's'} · cost <b>${gp(total)}</b>`} · advances ${b.turnLength} days${pendingBuilds(b)}</div>
      <div class="row">
        <button class="btn ghost" data-act="rollEvent" title="Roll on the Bastion Events table without taking a turn">Roll event only</button>
        <button class="btn big" data-act="takeTurn" ${b.pendingEvent ? 'disabled' : ''}>Take Bastion Turn</button>
      </div>
    </div>`;
}

function pendingBuilds(b) {
  const n = b.basics.filter(x => x.building).length + b.specials.filter(f => f.enlarging).length + (b.walls.building ? 1 : 0);
  return n ? ` · ${n} construction project${n > 1 ? 's' : ''} progress` : '';
}

function orderRow(b, f, maintain) {
  const def = DEF[f.key];
  const head = `<div class="ohead"><b>${esc(facName(f))}</b> <span class="badge ord ord-${def.order.toLowerCase()}">${def.order}</span></div>`;
  if (f.order) {
    const pct = Math.round(100 * (1 - f.order.daysLeft / f.order.totalDays));
    return `<div class="orow busy">${head}<div class="ostatus">${esc(f.order.label)}${orderSummary({}, f.order.input || {})} — ${f.order.daysLeft} of ${f.order.totalDays} days left
      <div class="bar"><i style="width:${pct}%"></i></div></div></div>`;
  }
  if (isShut(b, f)) return `<div class="orow shut">${head}<div class="ostatus">Out of action this turn (Bastion event).</div></div>`;
  if (maintain) return `<div class="orow dim">${head}<div class="ostatus">Hirelings are maintaining the Bastion.</div></div>`;
  const d = draftFor(b, f);
  const opts = optionsFor(b, f);
  const opt = opts.find(o => o.id === d.optId);
  return `<div class="orow" data-fid="${f.id}">${head}
    <select data-draft="optId"><option value="">— No order —</option>${opts.map(o => {
      const why = o.avail ? o.avail(b, f) : '';
      return `<option value="${o.id}" ${o.id === d.optId ? 'selected' : ''} ${why ? 'disabled' : ''}>${esc(o.label)}${why ? ` (${why})` : ''}</option>`;
    }).join('')}</select>
    ${opt ? orderInputs(b, f, opt, d) : ''}
  </div>`;
}

function orderInputs(b, f, opt, d) {
  const parts = [];
  if (opt.choices) parts.push(`<select data-draft="choice"><option value="">Choose…</option>${opt.choices.map(c => `<option value="${esc(c.value)}" ${c.value === d.choice ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`);
  if (opt.custom) {
    parts.push(`<input data-draft="item" value="${esc(d.item)}" placeholder="Item to craft">`);
    if (!opt.customDays) parts.push(`<label class="mini">Days <input type="number" min="1" data-draft="days" value="${esc(d.days ?? 7)}"></label>`);
    parts.push(`<label class="mini">GP <input type="number" min="0" data-draft="cost" value="${esc(d.cost ?? 0)}"></label>`);
  }
  if (opt.qty) parts.push(`<label class="mini">${esc(opt.qty.label)} <input type="number" min="0" max="${opt.qty.max}" step="${opt.qty.step || 1}" data-draft="qty" value="${esc(d.qty ?? 0)}"></label>`);
  if (opt.topic) parts.push(`<input data-draft="topic" value="${esc(d.topic)}" placeholder="${esc(typeof opt.topic === 'string' ? opt.topic : 'Topic')}">`);
  if (opt.effect === 'trade') parts.push(`<label class="mini">Net GP <input type="number" data-draft="net" value="${esc(d.net ?? 0)}"></label><input data-draft="topic" value="${esc(d.topic)}" placeholder="What was traded?">`);
  if (opt.choices) { const c = opt.choices.find(x => x.value === d.choice); d.choiceCost = c?.cost || 0; }
  const cost = orderCost(b, f, opt, d);
  const days = opt.days && typeof opt.days === 'function' && opt.days.length === 0 ? '1d6 + 1' : orderDays(b, f, opt, d);
  const problem = draftProblem(b, f, opt, d);
  const note = val(opt.note, b);
  return `<div class="oinputs">${parts.join('')}</div>
    <div class="ometa">${days} days · ${cost ? gp(cost) : 'no cost'}${problem ? ` · <span class="warn">${esc(problem)}</span>` : ''}</div>
    ${note ? `<p class="small">${esc(note)}${opt.verify ? ' ✱' : ''}</p>` : ''}`;
}

function eventPanel(b) {
  const ev = b.pendingEvent;
  if (ev.choose) {
    return `<div class="card event"><h3>Inner Peace — choose your event</h3><div class="row">
      ${ev.choose.map(r => `<button class="btn" data-pick-event="${r}">${r}: ${eventFor(r).name}</button>`).join('')}</div></div>`;
  }
  return `<div class="card event ev-${ev.key}">
    <div class="evroll">${ev.roll}</div>
    <h3>${esc(ev.name)}</h3>
    ${ev.lines.map(l => `<p>${esc(l)}</p>`).join('')}
    <div class="row">${ev.actions.length
      ? ev.actions.map(a => `<button class="btn ${a.id === 'refuse' || a.id === 'decline' || a.id === 'ignore' ? 'ghost' : ''}" data-ev-act="${a.id}">${esc(a.label)}</button>`).join('')
      : '<button class="btn" data-act="dismissEvent">Done</button>'}</div>
  </div>`;
}

// ----- stash tab -----
function stashView(b) {
  const barracks = b.specials.filter(f => f.key === 'barrack');
  const menag = b.specials.filter(f => f.creatures);
  return `
    <div class="section-head"><h2>Bastion Stash</h2></div>
    <p class="hint">Crafted and harvested goods stay in your Bastion until you claim them.</p>
    <div class="stash">${b.stash.map(s => `<div class="sitem" data-sid="${s.id}"><span>${esc(s.text)}</span><small>${esc(s.from)} · turn ${s.turn}</small><button class="btn xs" data-act="claim">Claim</button></div>`).join('') || '<div class="placeholder">Nothing waiting in the Bastion.</div>'}</div>
    <div class="row"><input id="stashText" placeholder="Add an item manually…"><button class="btn sm" data-act="addStash">Add</button></div>

    <div class="section-head"><h2>Bastion Defenders <small>${totalDefenders(b)} total</small></h2></div>
    <div class="card">
      ${barracks.map(f => `<div class="drow"><span>${esc(facName(f))}</span><b>${f.defenders || 0} / ${barrackCap(f)}</b></div>`).join('')}
      ${menag.map(f => `<div class="drow"><span>${esc(facName(f))} ${f.key === 'construct-forge' ? 'constructs' : 'creatures'}</span><b>${f.creatures.filter(c => c.defender).length}</b></div>`).join('')}
      <div class="drow"><span>Other defenders (guests, mercenaries…)</span><span><button class="btn xs ghost" data-act="extra-">−</button> <b>${b.extraDefenders}</b> <button class="btn xs ghost" data-act="extra+">+</button></span></div>
      ${b.guestMonster != null ? `<div class="drow"><span>Monster guest <input class="inl" data-guest-monster value="${esc(b.guestMonster)}" title="Name it with your DM"></span><span class="small">defends the next attack (no defenders lost), then leaves <button class="btn xs ghost" data-act="sendMonster">Send away</button></span></div>` : ''}
      ${b.refugees ? `<div class="drow"><span>Refugees sheltering here</span><span><b>${b.refugees.n}</b> <button class="btn xs ghost" data-act="rehomeRefugees" title="They stay until you find them a new home or the Bastion is attacked">Found them a new home</button></span></div>` : ''}
      <div class="drow"><span>Armory</span><b>${hasFacility(b, 'armory') ? (b.armoryStocked ? 'Stocked (d8s)' : 'Depleted') : '—'}</b></div>
      <div class="drow"><span>Walls</span><b>${b.walls.built} sq${b.walls.enclosed ? ', fully enclosed (−2 dice)' : ''}</b></div>
      ${!barracks.length ? '<p class="small">Build a Barrack to recruit Bastion Defenders.</p>' : ''}
      ${b.connection?.kind === 'combined' && connectionPartners(b).length ? `<p class="small conn-note">Combined with ${connectionPartners(b).map(x => esc(ownerLabel(x))).join(', ')}: if an event costs one of you defenders, another owner can take all or some of those losses instead — adjust the counts on each Bastion.</p>` : ''}
    </div>`;
}

function bastionSummary(x) {
  return `${x.specials.length} special · ${totalDefenders(x)} defenders · ${gp(x.gp)} · turn ${x.turn}${x.maps?.length ? ` · ${x.maps.length} map${x.maps.length === 1 ? '' : 's'}` : ''}`;
}

function connectionsView(b) {
  const members = groupMembers(b);
  const c = b.connection;
  const sameCamp = x => (x.campaign || '') === (b.campaign || '');
  const candidates = state.bastions.filter(x => x.id !== b.id && sameCamp(x) && !(c && x.connection?.group === c.group));
  const kindSelect = (attrs, cur) => `<select ${attrs}>${Object.entries(CONNECTION_KINDS).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;

  const mine = c ? `
    <div class="card conn">
      <label class="field"><span>Group name</span><input data-conn="name" value="${esc(c.name)}" placeholder="e.g. The Hollow Spire Compound"></label>
      <label class="field"><span>How they're connected</span>${kindSelect('data-conn="kind"', c.kind)}</label>
      <p class="small conn-note">${esc(CONNECTION_KINDS[c.kind]?.note || '')}</p>
      <label class="field"><span>Notes (shared corridors, distances, who holds the keys…)</span><textarea data-conn="notes" rows="3" placeholder="DM's records">${esc(c.notes)}</textarea></label>
      <span class="label">Members (${members.length})</span>
      <div class="members">${members.map(x => `
        <div class="member ${x.id === b.id ? 'me' : ''}">
          <div><b>${esc(x.name)}</b>${x.character ? ` <span class="small">— ${esc(x.character)}, Lv ${x.level}</span>` : ''}${x.campaign ? ` <span class="badge">${esc(x.campaign)}</span>` : ''}<div class="small">${bastionSummary(x)}</div></div>
          ${x.id === b.id ? '<span class="badge">This Bastion</span>' : `<button class="btn xs ghost" data-open-bastion="${x.id}">Open</button>`}
        </div>`).join('')}</div>
      <div class="row"><span class="spacer"></span><button class="btn sm ghost danger" data-act="disconnect">Disconnect this Bastion</button></div>
    </div>`
    : `<div class="placeholder">${esc(b.name)} isn't connected to any other Bastion.</div>`;

  const groups = {}; const solo = [];
  const party = state.bastions.filter(sameCamp);
  for (const x of party) { if (x.connection?.group && groupMembers(x).length > 1) (groups[x.connection.group] ||= []).push(x); else solo.push(x); }

  return `
    <div class="section-head"><h2>Connected Bastions</h2></div>
    <p class="hint">Link Bastions that share a site, sit side by side, or are tied together some other way. Mostly for the DM's records — connecting doesn't change facilities, orders, or slots.</p>
    ${mine}
    ${candidates.length ? `
    <div class="card addconn">
      <b>${c ? 'Add another Bastion to this group' : 'Connect with…'}</b>
      <select id="connTarget">${candidates.map(x => `<option value="${x.id}">${esc(ownerLabel(x))}${x.connection ? ` — in "${esc(x.connection.name)}"` : ''}</option>`).join('')}</select>
      ${c ? '' : kindSelect('id="connKind"', 'combined')}
      <button class="btn sm" data-act="connect">Connect</button>
      <p class="small">Joining a Bastion that's already in a group merges the groups.</p>
    </div>` : `<p class="hint">${state.bastions.filter(sameCamp).length < 2 ? (b.campaign ? `No other Bastions in ${esc(b.campaign)} yet. Once another player in this campaign creates one, you can connect to it here.` : 'Pick a campaign in the sidebar to connect with Bastions in that campaign.') : 'Every other Bastion in this campaign is already in this group.'}</p>`}

    <div class="section-head"><h2>Party Overview <small>${b.campaign ? esc(b.campaign) + ' · ' : ''}${party.length} Bastion${party.length === 1 ? '' : 's'}</small></h2></div>
    <p class="hint">${b.campaign ? `Showing only Bastions in <b>${esc(b.campaign)}</b>.` : 'This Bastion has no campaign yet, so this shows only other Bastions without one. Pick a campaign in the sidebar to see that party.'}</p>
    <div class="overview">
      ${Object.values(groups).map(list => `
        <div class="card ogroup">
          <div class="row"><h3>${esc(list[0].connection.name)}</h3><span class="badge">${esc(CONNECTION_KINDS[list[0].connection.kind]?.label || '')}</span></div>
          ${list[0].connection.notes ? `<p class="small">${esc(list[0].connection.notes)}</p>` : ''}
          ${list.map(x => overviewRow(x, b)).join('')}
        </div>`).join('')}
      ${solo.length ? `<div class="card ogroup"><h3 class="muted-h">Standalone</h3>${solo.map(x => overviewRow(x, b)).join('')}</div>` : ''}
    </div>`;
}

function overviewRow(x, b) {
  return `<div class="orowv ${x.id === b.id ? 'me' : ''}">
    <div><b>${esc(x.name)}</b>${x.character ? ` <span class="small">— ${esc(x.character)}, Lv ${x.level}</span>` : ''}${x.campaign ? ` <span class="badge">${esc(x.campaign)}</span>` : ''}
      <div class="small">${x.specials.map(f => esc(DEF[f.key]?.name || f.key)).join(', ') || 'No special facilities yet'}</div>
      <div class="small muted">${bastionSummary(x)}</div></div>
    ${x.id === b.id ? '<span class="badge">Viewing</span>' : `<button class="btn xs ghost" data-open-bastion="${x.id}">Open</button>`}
  </div>`;
}

// ----- maps tab -----
const MAP_BUCKET = 'bb-maps';
const MAP_MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit
const MAP_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
let uploading = 0;

const mapUrl = (m, download) => sb.storage.from(MAP_BUCKET).getPublicUrl(m.path, download ? { download: m.name } : undefined).data.publicUrl;
const fmtBytes = (n) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function mapsView(b) {
  const maps = b.maps || [];
  return `
    ${lineMapCard(b)}
    <div class="section-head"><h2>Uploaded Maps</h2></div>
    <p class="hint">Upload your own maps of ${esc(b.name)} — floor plans, sketches, VTT battle maps. Everyone in the party (and the DM) can view and download them. PNG, JPG, WebP, GIF or PDF, up to 10 MB each.</p>
    <div class="card map-upload">
      <label class="btn">${uploading ? 'Uploading…' : '+ Upload maps'}<input id="mapUpload" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,image/png,image/jpeg,image/webp,image/gif,application/pdf" hidden ${uploading ? 'disabled' : ''}></label>
      <span class="small">To delete a map you'll be asked to type ${esc(delName(b) ? `the character's name (${delName(b)})` : 'the name')} exactly.</span>
    </div>
    ${maps.length ? `<div class="maps">${maps.slice().reverse().map(m => mapCard(m)).join('')}</div>`
      : '<div class="placeholder">No maps uploaded yet.</div>'}`;
}

function mapCard(m) {
  const isPdf = m.type === 'application/pdf';
  const url = mapUrl(m);
  return `<div class="card mapcard" data-map="${m.id}">
    <a class="mapthumb" href="${esc(url)}" target="_blank" rel="noopener" title="Open full size">
      ${isPdf ? '<span class="pdficon">PDF</span>' : `<img src="${esc(url)}" alt="${esc(m.caption || m.name)}" loading="lazy">`}
    </a>
    <input class="mapcap" data-map-caption="${m.id}" value="${esc(m.caption)}" placeholder="Caption (e.g. Ground floor)">
    <div class="small muted">${esc(m.name)} · ${fmtBytes(m.size)} · ${new Date(m.uploadedAt).toLocaleDateString()}</div>
    <div class="row"><a class="btn xs ghost" href="${esc(url)}" target="_blank" rel="noopener">Open</a><a class="btn xs" href="${esc(mapUrl(m, true))}">Download</a>
      <button class="btn xs ghost danger" data-map-del="${m.id}" title="Delete this map">Delete</button></div>
  </div>`;
}

// Deleting a map: the page asks for the character's name typed exactly, saves the Bastion without the map, then
// asks bb-delete-map to remove the file (it re-checks the name and that the map is no longer listed).
const delName = b => String(b.character || b.name || '').trim();
function askDeleteMap(b, mapId) {
  const m = (b.maps || []).find(x => x.id === mapId); if (!m) return;
  const who = delName(b);
  showModal(`<div class="mhead"><h2>Delete map?</h2><button class="btn ghost sm" data-close>Cancel</button></div>
    <p><b>${esc(m.caption || m.name)}</b> (${esc(m.name)}) will be removed from ${esc(b.name)} for everyone. This can't be undone.</p>
    <p>To confirm, type the character's name exactly as shown (capitals count): <b class="exact-name">${esc(who)}</b></p>
    <input id="mapDelName" class="wide" autocomplete="off" spellcheck="false" aria-label="Character name">
    <div class="row"><button class="btn ghost danger" id="mapDelGo" data-act="mapDelGo" data-map="${esc(m.id)}" disabled>Delete map</button></div>`);
  setTimeout(() => $('#mapDelName')?.focus(), 0);
}
async function deleteMap(bid, mapId, typed) {
  let b = state.bastions.find(x => x.id === bid); if (!b) return;
  const m = (b.maps || []).find(x => x.id === mapId); if (!m) return;
  if (typed.trim() !== delName(b)) { toast("The name doesn't match."); return; }
  closeModal();
  b.maps = b.maps.filter(x => x.id !== mapId);
  addLog(b, `Map deleted: ${m.name}.`, 'build');
  writeCache(); render();
  // save now (not on the usual debounce) so the server sees the map is gone before the file is removed
  clearTimeout(pushTimer); dirty.delete(bid);
  await enqueue(bid, () => pushOne(bid));
  b = state.bastions.find(x => x.id === bid);
  if (!b || synced[bid] !== JSON.stringify(b) || (b.maps || []).some(x => x.id === mapId)) {
    toast('The map was taken off the list, but the file could not be removed yet (the Bastion did not save). Try again later.'); return;
  }
  try {
    const r = await fetch(`${SB_URL}/functions/v1/bb-delete-map`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify({ campaign: CAMPAIGN, bastionId: bid, path: m.path, character: typed }),
    });
    const out = await r.json().catch(() => ({}));
    toast(r.ok ? `Deleted ${m.caption || m.name}.` : `Removed from the list, but the file wasn't deleted: ${out.message || r.status}`);
  } catch { toast('Removed from the list, but the file could not be deleted (no connection).'); }
}

function uploadMaps(input) { const files = [...input.files]; input.value = ''; return uploadMapFiles(files); }
async function uploadMapFiles(files) {
  const bid = state.activeId; if (!bid || !files.length) return;
  const ok = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const type = MAP_TYPES[ext] || (Object.values(MAP_TYPES).includes(file.type) ? file.type : null);
    if (!type) { toast(`${file.name}: only PNG, JPG, WebP, GIF or PDF.`); continue; }
    if (file.size > MAP_MAX_BYTES) { toast(`${file.name} is ${fmtBytes(file.size)} — the limit is 10 MB.`); continue; }
    ok.push({ file, ext: ext in MAP_TYPES ? ext : Object.keys(MAP_TYPES).find(k => MAP_TYPES[k] === type), type });
  }
  if (!ok.length) return;
  uploading++; render();
  let done = 0;
  for (const { file, ext, type } of ok) {
    const id = uid() + uid();
    const path = `${CAMPAIGN}/${bid}/${id}.${ext}`;
    const { error } = await sb.storage.from(MAP_BUCKET).upload(path, file, { contentType: type, cacheControl: '31536000', upsert: false });
    if (error) { toast(`Couldn't upload ${file.name}: ${error.message}`); continue; }
    const b = state.bastions.find(x => x.id === bid); // re-find: a live update may have replaced the object
    if (!b) continue;
    (b.maps ||= []).push({ id, path, name: file.name, caption: file.name.replace(/\.[^.]+$/, ''), type, size: file.size, uploadedAt: new Date().toISOString() });
    addLog(b, `Map uploaded: ${file.name}.`, 'build');
    dirty.add(b.id); writeCache(); schedulePush();
    done++;
  }
  uploading--; render();
  if (done) toast(`Uploaded ${done} map${done === 1 ? '' : 's'}.`);
}

// ----- closets, washrooms & nooks (free; carved out of a facility's own squares) -----
function nookParents(b) {
  return [...b.basics.filter(x => x.building?.action !== 'add').map(x => ({ ref: x.id, name: x.type, sq: SPACES[x.space].squares, space: x.space })),
    ...b.specials.map(f => ({ ref: f.id, name: facName(f), sq: SPACES[facSpace(f)].squares, space: facSpace(f) }))];
}
const nookUsed = (b, ref, except) => (b.nooks || []).filter(n => n.parent === ref && n.id !== except).reduce((t, n) => t + (+n.squares || 0), 0);
function nooksCard(b) {
  const parents = nookParents(b), list = b.nooks || [];
  const pSel = (cur, attrs) => `<select ${attrs}>${parents.map(p => `<option value="${p.ref}" ${p.ref === cur ? 'selected' : ''}>${esc(p.name)} (${p.space}, ${p.sq} sq)</option>`).join('')}${cur && !parents.some(p => p.ref === cur) ? '<option selected value="">(removed facility)</option>' : ''}</select>`;
  const kSel = (cur, attrs) => `<select ${attrs}>${NOOK_KINDS.map(k => `<option ${k === cur ? 'selected' : ''}>${k}</option>`).join('')}</select>`;
  return `
    <div class="section-head"><h2>Closets, Washrooms &amp; Nooks</h2></div>
    <p class="hint">Free and cosmetic. Each one is walled off inside a facility's existing squares, so it never adds area. A facility can give up to half its squares this way. They appear on the graph-paper map inside their room.</p>
    <div class="card nooks">
      ${list.length ? `<div class="nooklist">${list.map(n => `
        <div class="nookrow" data-nook="${n.id}">
          ${kSel(n.kind, 'data-nook-field="kind"')}
          <input data-nook-field="label" value="${esc(n.label || '')}" placeholder="Name (optional)" maxlength="40">
          <input type="number" min="1" max="18" data-nook-field="squares" value="${n.squares}" title="Squares (5 ft each)"> <span class="small">sq, inside</span>
          ${pSel(n.parent, 'data-nook-field="parent"')}
          <button class="btn xs ghost danger" data-nook-del="${n.id}" title="Remove">✕</button>
        </div>`).join('')}</div>` : '<p class="small muted">None yet.</p>'}
      ${parents.length ? `<div class="nookrow add">
        ${kSel('Closet', 'id="nookKind"')}
        <input id="nookSq" type="number" min="1" max="18" value="1" title="Squares (5 ft each)"> <span class="small">sq, inside</span>
        ${pSel(parents[0].ref, 'id="nookParent"')}
        <button class="btn sm" data-act="addNook">+ Add</button>
      </div>` : ''}
    </div>`;
}
// ----- pinned room shapes for the graph-paper map (otherwise each redraw picks one at random) -----
function shapeLabel(sh) {
  const ft = (w, d) => `${w * 5}×${d * 5} ft`;
  const parts = parseShape(sh);
  if (parts.length > 1) {
    const same = parts.every(p => p.w === parts[0].w && p.d === parts[0].d);
    return same ? `${parts.length} rooms, ${ft(parts[0].w, parts[0].d)} each` : `${parts.length} rooms: ${parts.map(p => ft(p.w, p.d)).join(' + ')}`;
  }
  const { w, d, cut } = parts[0];
  if (cut) return `L-shape, ${ft(w, d)} minus a ${ft(cut.w, cut.d)} corner`;
  return w === d ? `Square, ${ft(w, d)}` : w > d ? `Wide, ${ft(w, d)} along the hall` : `Deep, ${ft(w, d)} back from the hall`;
}
function shapesCard(b) {
  const zone = new Map(mapRooms(b).map(r => [r.ref, r.zone]));
  const hasShapes = p => shapeOptions(p.sq, zone.get(p.ref) === 'outdoor').length > 1;
  const rows = nookParents(b).filter(p => zone.has(p.ref) && zone.get(p.ref) !== 'demi' && (hasShapes(p) || viaOptions(b, p.ref).length));
  if (!rows.length) return '';
  const fac = ref => b.basics.find(x => x.id === ref) || b.specials.find(x => x.id === ref);
  const groups = [['Rectangle', sh => isRectShape(sh)], ['L-shape', sh => sh[0] === 'L'], ['Split into separate rooms', sh => sh.includes('+')]];
  const sel = (p, out) => {
    const cur = validShape(fac(p.ref)?.shape, p.sq, out), opts = shapeOptions(p.sq, out);
    const o = sh => `<option value="${sh}" ${sh === cur ? 'selected' : ''}>${shapeLabel(sh)}</option>`;
    if (!hasShapes(p)) return '';
    return `<select data-shape-ref="${p.ref}"><option value="">Any shape (random)</option>${groups.map(([g, t]) => { const l = opts.filter(t); return l.length ? `<optgroup label="${g}">${l.map(o).join('')}</optgroup>` : ''; }).join('')}</select>`;
  };
  const viaSel = p => {
    const opts = viaOptions(b, p.ref); if (!opts.length) return '';
    const cur = mapRooms(b).find(r => r.ref === p.ref)?.via || '';
    return `<select data-via-ref="${p.ref}" title="Where this room's door leads"><option value="">Door: to the hall</option>${opts.map(r => `<option value="${r.ref}" ${r.ref === cur ? 'selected' : ''}>Door: only through ${esc(mapLabel(b, r.ref, r.fb).full)}</option>`).join('')}</select>`;
  };
  return `
    <div class="section-head"><h2>Room Shapes &amp; Doors</h2></div>
    <p class="hint">Pick a shape for any facility you want to stay the same on the graph-paper map, however many times it's redrawn; "Any shape" gets a random rectangle each time. The area never changes: an L-shape or a split uses exactly the facility's squares. A split facility becomes several rooms (numbered 5a, 5b…), each with its own door to the hall, and its closets go in the first one. Yard plots can only be rectangles.<br>
    <b>Door:</b> make a room an inner room, entered only through another one (a vault behind the study, a dressing room off the bedroom). It's drawn beside that room with a door between them and no door to the hall. A room can have up to 2 inner rooms, and an inner room can't have its own.</p>
    <div class="card nooks">
      ${rows.map(p => `
        <div class="nookrow"><span class="shape-name">${esc(p.name)} <span class="small muted">${p.space}, ${p.sq} sq</span></span>
          ${sel(p, zone.get(p.ref) === 'outdoor')}${viaSel(p)}</div>`).join('')}
    </div>`;
}
function nookFits(b, ref, squares, except) {
  const p = nookParents(b).find(x => x.ref === ref);
  if (!p) return 'Pick a facility.';
  const max = Math.floor(p.sq / 2), used = nookUsed(b, ref, except);
  if (used + squares > max) return `${p.name} is ${p.sq} squares, so its closets and nooks can use at most ${max} in total (${used} already used).`;
  return '';
}

// ----- generated graph-paper map -----
function lineMapCard(b) {
  const lm = b.lineMap;
  const floorsSel = b.openPlan ? '' : `<select data-map-floors title="How many storeys"><option value="auto" ${lm?.floors !== 'single' ? 'selected' : ''}>Floors: automatic</option><option value="single" ${lm?.floors === 'single' ? 'selected' : ''}>Floors: single storey</option></select>`;
  const facingSel = `<select data-map-facing title="Which way the front door faces. East or West turns the whole plan so the hall runs north-south.">${[['south', 'Front door: south'], ['north', 'Front door: north'], ['east', 'Front door: east (N–S hall)'], ['west', 'Front door: west (N–S hall)']].map(([v, l]) => `<option value="${v}" ${facingOf(b) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const openSel = `<select data-map-open title="Wall-less: the Bastion is one big open area on a single level (a grove, a great cavern). Facilities keep their squares and shapes, marked out on the ground, with no walls or doors."><option value="">Walled building</option><option value="1" ${b.openPlan ? 'selected' : ''}>Wall-less (grove, cavern)</option></select>`;
  const hallSel = openSel + facingSel + `<select data-map-hall title="Width of the central hall"><option value="10">Hall: 10 ft wide</option><option value="5" ${+b.hallWidth === 5 ? 'selected' : ''}>Hall: 5 ft wide</option></select>`
    + (b.openPlan ? '' : `<select data-map-stairs title="Only matters once the Bastion has more than one floor. Straight: a 20-ft flight along the hall, landing at alternate ends floor by floor. Switchback: two short flights with a half-landing, on and off at the hall. Spiral: 10 ft across, on and off at the same point on every floor.">${[['straight', 'Stairs: straight'], ['switchback', 'Stairs: switchback'], ['spiral', 'Stairs: spiral']].map(([v, l]) => `<option value="${v}" ${stairStyle(b) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
  if (!lm) return `
    <div class="section-head"><h2>Graph-Paper Map</h2></div>
    <div class="card linemap-empty">
      <p>Draw an old-school graph-paper floor plan of ${esc(b.name)} from its facilities. Every room opens onto the central hall, so nobody walks through the kitchen to get to bed, unless you make it an inner room under Room Shapes &amp; Doors. Public rooms sit by the entrance, the service wing on one side, and private rooms on the other. Big Bastions get an upper floor and a cellar.</p>
      <div class="row">${floorsSel}${hallSel}<button class="btn" data-act="genMap">Draw map</button></div>
    </div>
    ${aiBox(b)}`;
  const stale = lm.sig !== mapSig(b);
  const problems = checkMap(lm.layout);
  return `
    <div class="section-head"><h2>Graph-Paper Map</h2>
      <div class="row">${lm.plan ? '' : floorsSel}${hallSel}<button class="btn sm ghost" data-act="rerollMap" title="Shuffle room sizes and sides, keeping the same plan">New layout</button>
      <button class="btn sm ghost" data-act="dlMapSvg">SVG</button><button class="btn sm ghost" data-act="dlMapPng">PNG</button>
      <button class="btn sm" data-act="saveMapPng" title="Add a PNG of this map to the uploaded maps">Save to Maps</button></div></div>
    ${stale ? `<div class="warnbar">This Bastion's facilities have changed since the map was drawn. <button class="btn xs" data-act="updateMap">Redraw map</button></div>` : ''}
    ${problems.length ? `<div class="warnbar">Layout check: ${problems.map(esc).join('; ')}</div>` : ''}
    <div class="linemap">${renderMapSVG(b, lm.layout)}</div>
    <p class="small muted">Layout #${lm.seed.toString(36)}. Rooms still being built aren't shown until they're finished. "New layout" shuffles the arrangement; the map stays the same until someone redraws it.</p>
    ${aiBox(b)}
    ${furnishedCard(b)}`;
}

// ----- furnished battle map (furnish.js): drawn in code from the facilities, no AI -----
const furnPrev = { key: '', url: '' };
const furnUi = { labels: true, floor: 0 }; // battle map: draw room numbers, title and key (off = a clean image for a VTT)
function furnishedPreview(b, fi) {
  const key = JSON.stringify([b.id, b.name, b.lineMap.seed, b.lineMap.sig, fi, b.nooks || [], b.walls || {}, b.lineMap.layout.fl.length, furnUi.labels]);
  if (furnPrev.key !== key) {
    try { furnPrev.url = furnishedFloorCanvas(b, b.lineMap.layout, fi, 40, furnUi.labels).toDataURL('image/jpeg', 0.88); }
    catch (err) { console.error(err); furnPrev.url = ''; }
    furnPrev.key = key;
  }
  return furnPrev.url;
}
function furnishedCard(b) {
  const L = b.lineMap.layout, fi = Math.min(furnUi.floor, L.fl.length - 1);
  const url = furnishedPreview(b, fi);
  return `<div class="section-head"><h2>Battle Map</h2>
      <div class="row">${L.fl.length > 1 ? `<select id="furnFloor">${L.fl.map((f, i) => `<option value="${i}" ${i === fi ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>` : ''}
      <label class="check small" title="Room numbers, secret-door marks, stair labels, title and key. Untick for a clean image to drop into a VTT."><input type="checkbox" id="furnLabels" ${furnUi.labels ? 'checked' : ''}> Labels</label>
      <button class="btn sm ghost" data-act="dlFurn">PNG</button><button class="btn sm" data-act="saveFurn" title="Add a PNG of this floor to the uploaded maps">Save to Maps</button></div></div>
    <div class="card furnished">
      ${url ? `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Furnished map of ${esc(L.fl[fi].name)}"></a>` : '<p class="muted">Could not draw this floor.</p>'}
      <p class="small muted">Furnished from each room's facility: beds in bedrooms, the forge in the smithy, and so on. Doors, the front entrance and closets come straight from the graph-paper map. Furniture never blocks a door.</p>
    </div>`;
}

// ----- AI layout guidance (Supabase edge function bb-layout -> Claude) -----
let aiBusy = null;       // bastion id with a request in flight
const aiDraft = {};      // bastion id -> unsent request text (survives redraws)
function aiBox(b) {
  const lm = b.lineMap, plan = lm?.plan, busy = aiBusy === b.id;
  return `<div class="card aibox">
    <div class="row"><b>Ask the architect</b> <span class="badge">AI</span>
      ${plan ? '<span class="spacer"></span><button class="btn xs ghost" data-act="clearPlan" title="Forget the AI plan and go back to the automatic layout">Back to automatic layout</button>' : ''}</div>
    ${plan ? `<div class="aiplan"><div class="small muted">Last request: “${esc(lm.request || '')}”</div><p>${esc(plan.summary || '')}</p></div>` : ''}
    <p class="small">${plan ? 'Ask for changes and the architect will revise this plan' : 'Describe the building and the architect will arrange your rooms'}, for example: “a three-storey wizard tower with my bedroom at the top”, “dug into a hillside, vault deepest”, “a north-south hall”, “the vault only reachable through my study”, “put the smithy outside”.</p>
    <textarea id="aiLayout" rows="3" maxlength="800" placeholder="How should ${esc(b.name)} be laid out?" ${busy ? 'disabled' : ''}>${esc(aiDraft[b.id] || '')}</textarea>
    <div class="row"><button class="btn" data-act="aiLayout" ${busy ? 'disabled' : ''}>${busy ? 'Planning… (up to a minute)' : plan ? 'Revise plan' : 'Plan it'}</button>
      <span class="small muted">Each Bastion gets 15 AI plans a day.</span></div>
  </div>`;
}

async function askArchitect(b) {
  const text = ($('#aiLayout')?.value || '').trim();
  aiDraft[b.id] = text;
  if (!text) { toast('Describe the layout you want first.'); return; }
  const bid = b.id;
  const rooms = mapRooms(b).map(r => { const lb = mapLabel(b, r.ref, r.fb); const nk = (b.nooks || []).filter(n => n.parent === r.ref).map(n => (n.label || n.kind).toLowerCase());
    const via = r.via ? ` [inner room: entered only through ${mapLabel(b, r.via, '').full} (ref ${r.via})]` : '';
    return { ref: r.ref, name: (lb.full + (nk.length ? ` (has ${nk.join(', ')})` : '') + via).slice(0, 160), type: r.basic || DEF[r.key]?.name || r.fb, space: lb.space, zone: r.zone }; });
  if (!rooms.length) { toast('This Bastion has no rooms yet.'); return; }
  const plan = b.lineMap?.plan;
  const walls = b.walls?.enclosed ? 'fully enclosed' : b.walls?.built ? `${b.walls.built} squares built` : '';
  aiBusy = bid; render();
  try {
    const r = await fetch(`${SB_URL}/functions/v1/bb-layout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify({ campaign: CAMPAIGN, bastionId: bid, request: text, rooms,
        current: plan ? { floors: plan.floors, outdoor: plan.outdoor, pairs: plan.pairs, secret: plan.secret, sides: plan.sides || [] } : null,
        bastion: { name: b.name, location: (b.location || '').slice(0, 120), walls: [walls, b.openPlan ? 'WALL-LESS open site (grove/cavern): one floor only, level 0' : ''].filter(Boolean).join('; '), facing: facingOf(b) } }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.plan) { toast(out.message || `The architect couldn't plan that (${r.status}).`); return; }
    const x = state.bastions.find(y => y.id === bid); if (!x) return;
    const seed = x.lineMap?.seed ?? newSeed();
    if (out.plan.facing && FACING_ROT[out.plan.facing] != null) { if (out.plan.facing === 'south') delete x.facing; else x.facing = out.plan.facing; }
    x.lineMap = { seed, floors: 'auto', plan: out.plan, request: text, sig: mapSig(x), layout: generateMap(x, { seed, plan: out.plan }) };
    addLog(x, `Architect: ${text}`, 'build');
    aiDraft[bid] = '';
    dirty.add(bid); writeCache(); schedulePush();
  } catch (err) {
    toast('Could not reach the architect. Check your connection and try again.');
  } finally {
    aiBusy = null; render();
  }
}
function drawLineMap(b, seed, floors) {
  const plan = b.lineMap?.plan || null, request = b.lineMap?.request;
  b.lineMap = { seed, floors, sig: mapSig(b), layout: generateMap(b, { seed, floors, plan }), ...(plan ? { plan, request } : {}) };
}
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
function mapFileName(b, ext) { return `${(b.name || 'bastion').replace(/[^\w\- ]+/g, '').trim() || 'bastion'} map.${ext}`; }
function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function logView(b) {
  return `<div class="section-head"><h2>Chronicle</h2><button class="btn sm ghost" data-act="clearLog">Clear</button></div>
    <ol class="log">${b.log.slice().reverse().map(e => `<li class="k-${e.kind}"><small>T${e.turn} · day ${e.day}</small> ${esc(e.text)}</li>`).join('')}</ol>`;
}

// ----- modal: special facility picker -----
function openPicker() {
  const b = B();
  const groups = [5, 9, 13, 17].map(lv => {
    const items = FACILITIES.filter(f => f.level === lv && (!f.eberron || b.eberron)).map(def => {
      const why = eligibility(b, def);
      return `<button class="pick ${why ? 'no' : ''}" data-pick="${def.key}" ${why ? 'disabled' : ''}>
        <span class="pname">${esc(def.name)} <span class="badge ord ord-${def.order.toLowerCase()}">${def.order}</span>${def.eberron ? ' <span class="badge eb">Eberron</span>' : ''}</span>
        <span class="pmeta">${def.space} · ${def.hirelings} hireling${def.hirelings > 1 ? 's' : ''}${def.prereq ? ` · ${esc(PREREQS[def.prereq])}` : ''}${def.multiple ? ' · can take more than once' : ''}</span>
        <span class="pdesc">${esc(def.desc)}</span>
        ${why ? `<span class="pwhy">${esc(why)}</span>` : ''}
      </button>`;
    }).join('');
    return `<h4>Level ${lv}</h4><div class="picks">${items}</div>`;
  }).join('');
  showModal(`<div class="mhead"><h2>Add a Special Facility</h2><button class="btn ghost sm" data-close>Close</button></div>${groups}`);
}

function showModal(html) { $('#modalBody').innerHTML = html; $('#modal').showModal(); }
function closeModal() { $('#modal').close(); }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------- events wiring ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-tab],[data-mode],[data-pick],[data-close],[data-ev-act],[data-pick-event],[data-creature-del],[data-open-bastion],[data-nook-del],[data-map-del]');
  if (!el) return;
  const b = B();
  if (el.dataset.mapDel) { askDeleteMap(b, el.dataset.mapDel); return; }
  if (el.dataset.act === 'mapDelGo') { deleteMap(b.id, el.dataset.map, $('#mapDelName')?.value || ''); return; }
  if (el.dataset.tab) { tab = el.dataset.tab; render(); return; }
  if (el.dataset.nookDel) { b.nooks = (b.nooks || []).filter(n => n.id !== el.dataset.nookDel); commit(); return; }
  if (el.dataset.openBastion) { setActive(el.dataset.openBastion); render(); window.scrollTo(0, 0); return; }
  if (el.dataset.close != null) { closeModal(); return; }
  if (el.dataset.mode) { b.mode = el.dataset.mode; commit(); return; }
  if (el.dataset.pick) {
    const f = makeSpecial(el.dataset.pick); f.addedTurn = b.turn; b.specials.push(f);
    addLog(b, `${DEF[f.key].name} added to the Bastion.`, 'build');
    if (f.key === 'dragonmark-outpost') addLog(b, `Your Renown with House ${f.options.house} goes up by 1 (Dragonmark Outpost).`, 'build');
    closeModal(); commit(); return;
  }
  if (el.dataset.evAct) { eventAction(el.dataset.evAct); return; }
  if (el.dataset.pickEvent) { b.pendingEvent = null; resolveEvent(b, Number(el.dataset.pickEvent)); commit(); return; }
  if (el.dataset.creatureDel) {
    const f = b.specials.find(x => x.id === el.closest('[data-fid]').dataset.fid);
    f.creatures = f.creatures.filter(c => c.id !== el.dataset.creatureDel); commit(); return;
  }
  const fid = el.closest('[data-fid]')?.dataset.fid;
  const f = fid && b?.specials.find(x => x.id === fid);
  const bid = el.closest('[data-bid]')?.dataset.bid;
  const basic = bid && b?.basics.find(x => x.id === bid);
  switch (el.dataset.act) {
    case 'addNook': {
      const sq = Math.max(1, parseInt($('#nookSq').value, 10) || 1), parent = $('#nookParent').value;
      const why = nookFits(b, parent, sq); if (why) { toast(why); return; }
      (b.nooks ||= []).push({ id: uid(), kind: $('#nookKind').value, label: '', squares: sq, parent });
      commit(); return;
    }
    case 'aiLayout': askArchitect(b); return;
    case 'clearPlan':
      if (confirm('Forget the architect\'s plan and go back to the automatic layout?')) { delete b.lineMap.plan; delete b.lineMap.request; drawLineMap(b, b.lineMap.seed, b.lineMap.floors); commit(); }
      return;
    case 'genMap': drawLineMap(b, newSeed(), $('[data-map-floors]')?.value || 'auto'); addLog(b, 'Graph-paper map drawn.', 'build'); commit(); return;
    case 'rerollMap': drawLineMap(b, newSeed(), b.lineMap.floors); commit(); return;
    case 'updateMap': drawLineMap(b, b.lineMap.seed, b.lineMap.floors); commit(); return;
    case 'dlMapSvg': downloadBlob(new Blob([renderMapSVG(b, b.lineMap.layout)], { type: 'image/svg+xml' }), mapFileName(b, 'svg')); return;
    case 'dlFurn': case 'saveFurn': {
      const fi = Math.min(furnUi.floor, b.lineMap.layout.fl.length - 1), name = mapFileName(b, 'png').replace(/\.png$/, `-${b.lineMap.layout.fl[fi].name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${furnUi.labels ? '' : '-unlabelled'}-battlemap.png`);
      canvasBlob(furnishedFloorCanvas(b, b.lineMap.layout, fi, 70, furnUi.labels)).then(bl => el.dataset.act === 'dlFurn' ? downloadBlob(bl, name) : uploadMapFiles([new File([bl], name, { type: 'image/png' })])).catch(err => toast(err.message));
      return;
    }
    case 'dlMapPng':
      svgToPngBlob(renderMapSVG(b, b.lineMap.layout)).then(bl => downloadBlob(bl, mapFileName(b, 'png'))).catch(err => toast(err.message)); return;
    case 'saveMapPng':
      svgToPngBlob(renderMapSVG(b, b.lineMap.layout)).then(bl => uploadMapFiles([new File([bl], mapFileName(b, 'png'), { type: 'image/png' })])).catch(err => toast(err.message)); return;
    case 'new': newBastion(); commit(); break;
    case 'gp+': case 'gp-': {
      const amt = Math.abs(Number($('#gpAmt').value) || 0); if (!amt) return toast('Enter an amount.');
      const note = $('#gpNote').value.trim() || (el.dataset.act === 'gp+' ? 'Deposit' : 'Withdrawal');
      el.dataset.act === 'gp+' ? earn(b, amt, note) : spend(b, amt, note); commit(); break;
    }
    case 'pickSpecial': openPicker(); break;
    case 'removeSpecial':
      if (confirm(`Remove ${facName(f)}? Any order in progress is lost.`)) { b.specials = b.specials.filter(x => x !== f); addLog(b, `${facName(f)} removed from the Bastion.`, 'build'); commit(); }
      break;
    case 'enlargeSpecial': {
      const c = DEF[f.key].enlarge.cost;
      const debt = b.gp < c ? `\n\nYou only have ${gp(b.gp)} — this will put the treasury into debt.` : '';
      if (!confirm(`Enlarge ${facName(f)} to Vast?\n\nCost: ${gp(c)} now · Time: ${SPECIAL_ENLARGE_DAYS} days\nYou get: ${DEF[f.key].enlarge.note}${debt}`)) return;
      spend(b, c, `Enlarge ${facName(f)}`); f.enlarging = { daysLeft: SPECIAL_ENLARGE_DAYS };
      addLog(b, `Work begins enlarging ${facName(f)} (${SPECIAL_ENLARGE_DAYS} days).`, 'build'); commit(); break;
    }
    case 'def+': f.defenders = Math.min(barrackCap(f), (f.defenders || 0) + 1); commit(); break;
    case 'def-': f.defenders = Math.max(0, (f.defenders || 0) - 1); commit(); break;
    case 'lt+': f.lieutenants = Math.min(10, (f.lieutenants || 0) + 1); commit(); break;
    case 'lt-': f.lieutenants = Math.max(0, (f.lieutenants || 0) - 1); commit(); break;
    case 'extra+': b.extraDefenders++; commit(); break;
    case 'favorReset': { const f = b.specials.find(x => x.id === el.closest('[data-fid]')?.dataset.fid); if (f) { f.favorUsed = false; addLog(b, `${facName(f)}: Renown went up, so House Favor is available again.`, 'event'); commit(); } break; }
    case 'sendMonster': addLog(b, `${b.guestMonster || 'The monster guest'} is sent on its way.`, 'event'); b.guestMonster = null; commit(); break;
    case 'rehomeRefugees': addLog(b, `The ${b.refugees?.n || ''} refugees are settled in a new home.`, 'event'); b.refugees = null; commit(); break;
    case 'extra-': b.extraDefenders = Math.max(0, b.extraDefenders - 1); commit(); break;
    case 'fortify': {
      const picks = []; while (picks.length < 2) { const s = SAVES[roll(6) - 1]; if (!picks.includes(s)) picks.push(s); }
      addLog(b, `Fortify Self: Advantage on ${picks.join(' and ')} saving throws for 7 days.`, 'done'); commit(); toast(`Fortify Self: ${picks.join(' & ')} saves`); break;
    }
    case 'addBasic': {
      const type = $('#newBasicType').value, space = $('#newBasicSpace').value, v = BASIC_ADD[space];
      if (b.gp < v.cost && !confirm(`This costs ${gp(v.cost)} but you have ${gp(b.gp)}. Go into debt?`)) return;
      spend(b, v.cost, `New ${space} ${type}`);
      b.basics.push({ id: uid(), type, space, free: false, building: { action: 'add', daysLeft: v.days } });
      addLog(b, `Construction begins on a ${space} ${type} (${v.days} days).`, 'build'); commit(); break;
    }
    case 'enlargeBasic': {
      const v = BASIC_ENLARGE[basic.space];
      const debt = b.gp < v.cost ? `\n\nYou only have ${gp(b.gp)} — this will put the treasury into debt.` : '';
      if (!confirm(`Enlarge ${basic.type} from ${basic.space} (${SPACES[basic.space].squares} sq) to ${v.to} (${SPACES[v.to].squares} sq)?\n\nCost: ${gp(v.cost)} now · Time: ${v.days} days\nCosmetic only — basic rooms have no game effect.${debt}`)) return;
      spend(b, v.cost, `Enlarge ${basic.type}`); basic.building = { action: 'enlarge', to: v.to, daysLeft: v.days };
      addLog(b, `Enlarging ${basic.type} to ${v.to} (${v.days} days).`, 'build'); commit(); break;
    }
    case 'removeBasic': if (confirm(`Remove ${basic.type}?`)) { b.basics = b.basics.filter(x => x !== basic); commit(); } break;
    case 'buildWalls': {
      const n = Math.max(1, parseInt($('#wallSq').value, 10) || 0); const c = n * WALL.costPerSquare;
      if (b.gp < c && !confirm(`${n} squares cost ${gp(c)} but you have ${gp(b.gp)}. Go into debt?`)) return;
      spend(b, c, `${n} squares of defensive wall`);
      b.walls.building = { squares: n, progress: 0, daysPerSquare: WALL.daysPerSquare };
      addLog(b, `Wall construction begins: ${n} squares, ${n * WALL.daysPerSquare} days.`, 'build'); commit(); break;
    }
    case 'takeTurn': takeTurn(); break;
    case 'rollEvent': if (b.pendingEvent) return toast('Resolve the pending event first.'); rollEvent(b); commit(); break;
    case 'dismissEvent': b.pendingEvent = null; commit(); break;
    case 'claim': { const s = b.stash.find(x => x.id === el.closest('[data-sid]').dataset.sid); b.stash = b.stash.filter(x => x !== s); addLog(b, `Claimed from stash: ${s.text}.`); commit(); break; }
    case 'addStash': { const t = $('#stashText').value.trim(); if (!t) return; b.stash.push({ id: uid(), text: t, from: 'Manual', turn: b.turn }); commit(); break; }
    case 'clearLog': if (confirm('Clear the chronicle?')) { b.log = []; commit(); } break;
    case 'connect': {
      const other = state.bastions.find(x => x.id === $('#connTarget').value);
      if (!other) return;
      connectBastions(b, other, $('#connKind')?.value);
      commit(); toast(`Connected with ${other.name}.`); break;
    }
    case 'disconnect':
      if (confirm(`Disconnect ${b.name} from "${b.connection.name}"? The other Bastions stay connected to each other.`)) { disconnectBastion(b); commit(); }
      break;
  }
});

// map delete confirm: the button only unlocks once the name matches exactly
document.addEventListener('input', (e) => {
  if (e.target.id !== 'mapDelName') return;
  const go = $('#mapDelGo'), b = B(); if (go && b) go.disabled = e.target.value.trim() !== delName(b);
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'mapDelName' && e.key === 'Enter' && !$('#mapDelGo')?.disabled) { e.preventDefault(); $('#mapDelGo').click(); }
});

document.addEventListener('change', (e) => {
  const el = e.target; const b = B(); if (!b) return;
  if (el.id === 'bastionSelect') { setActive(el.value); render(); return; }
  if (el.id === 'importInput') return importFile(el);
  if (el.id === 'mapUpload') return uploadMaps(el);
  if (el.id === 'aiLayout') { aiDraft[b.id] = el.value; return; }
  if (el.id === 'furnLabels') { furnUi.labels = el.checked; render(); return; }
  if (el.id === 'furnFloor') { furnUi.floor = +el.value; render(); return; }
  if (el.dataset.nookField) {
    const n = (b.nooks || []).find(x => x.id === el.closest('[data-nook]').dataset.nook); if (!n) return;
    const k = el.dataset.nookField;
    if (k === 'squares' || k === 'parent') {
      const sq = k === 'squares' ? Math.max(1, parseInt(el.value, 10) || 1) : n.squares, parent = k === 'parent' ? el.value : n.parent;
      const why = nookFits(b, parent, sq, n.id); if (why) { toast(why); render(); return; }
      n.squares = sq; n.parent = parent;
    } else n[k] = el.value.slice(0, 40);
    commit(); return;
  }
  if (el.dataset.shapeRef) {
    const x = b.basics.find(y => y.id === el.dataset.shapeRef) || b.specials.find(y => y.id === el.dataset.shapeRef); if (!x) return;
    if (el.value) x.shape = el.value; else delete x.shape;
    if (b.lineMap) drawLineMap(b, b.lineMap.seed, b.lineMap.floors);
    commit(); return;
  }
  if (el.dataset.mapOpen != null) { // wall-less is single storey, so the layout is redrawn
    if (el.value) b.openPlan = true; else delete b.openPlan;
    if (b.lineMap) drawLineMap(b, b.lineMap.seed, b.openPlan ? 'single' : 'auto');
    commit(); return;
  }
  if (el.dataset.mapFacing != null) { // only turns the drawing; the layout itself is unchanged
    if (el.value === 'south') delete b.facing; else b.facing = el.value;
    commit(); return;
  }
  if (el.dataset.viaRef) {
    const x = b.basics.find(y => y.id === el.dataset.viaRef) || b.specials.find(y => y.id === el.dataset.viaRef); if (!x) return;
    if (el.value) x.via = el.value; else delete x.via;
    if (b.lineMap) drawLineMap(b, b.lineMap.seed, b.lineMap.floors);
    commit(); return;
  }
  if (el.dataset.mapHall != null) {
    if (el.value === '5') b.hallWidth = 5; else delete b.hallWidth;
    if (b.lineMap) drawLineMap(b, b.lineMap.seed, b.lineMap.floors);
    commit(); return;
  }
  if (el.dataset.mapStairs != null) {
    if (el.value === 'straight') delete b.stairStyle; else b.stairStyle = el.value;
    if (b.lineMap) drawLineMap(b, b.lineMap.seed, b.lineMap.floors);
    commit(); return;
  }
  if (el.dataset.mapFloors != null) { if (b.lineMap) { drawLineMap(b, b.lineMap.seed, el.value); commit(); } return; }
  if (el.dataset.guestMonster != null) { b.guestMonster = el.value.trim().slice(0, 80) || 'a Friendly monster'; commit(); return; }
  if (el.dataset.mapCaption) { const m = (b.maps || []).find(x => x.id === el.dataset.mapCaption); if (m) { m.caption = el.value.slice(0, 120); commit(); } return; }
  if (el.dataset.bind) {
    b[el.dataset.bind] = el.dataset.num != null ? Math.max(1, parseInt(el.value, 10) || 1) : el.value;
    commit(); return;
  }
  if (el.dataset.bindCheck) { b[el.dataset.bindCheck] = el.checked; commit(); return; }
  if (el.dataset.conn && b.connection) { updateGroup(b, el.dataset.conn, el.value); commit(); return; }
  if (el.dataset.prereq) { prereqOpen[b.id] = true; b.prereqs[el.dataset.prereq] = el.checked; commit(); return; }
  if (el.dataset.act === 'enclosed') { b.walls.enclosed = el.checked; commit(); return; }
  if (el.dataset.act === 'eberron') {
    if (el.checked) {
      if (!confirm(`Turn on the Eberron rules for ${b.name}?\n\nThis adds Bastion rules and special facilities from the Eberron campaign setting (${EBERRON_SOURCE}). They aren't part of the standard Dungeon Master's Guide rules.\n\nOnly continue if your DM has said Eberron content is allowed.`)) { el.checked = false; return; }
      b.eberron = true; addLog(b, 'Eberron rules turned on (with DM approval).', 'build');
    } else {
      const ebf = b.specials.filter(f => DEF[f.key]?.eberron);
      if (ebf.length) { toast(`Remove the Eberron facilities first: ${ebf.map(facName).join(', ')}.`); el.checked = true; return; }
      delete b.eberron; delete b.mobile; delete b.travelling; addLog(b, 'Eberron rules turned off.', 'build');
    }
    commit(); return;
  }
  if (el.dataset.act === 'mobile') {
    if (el.checked) b.mobile = { vehicle: '' };
    else if (b.specials.some(f => HELMS.includes(f.key))) { toast('Remove the helm facility first; a helm only works in a mobile Bastion.'); el.checked = true; return; }
    else { delete b.mobile; delete b.travelling; }
    commit(); return;
  }
  if (el.dataset.mobileVehicle != null) { if (b.mobile) { b.mobile.vehicle = el.value.slice(0, 80); commit(); } return; }
  const fid = el.closest('[data-fid]')?.dataset.fid;
  const f = fid && b.specials.find(x => x.id === fid);
  if (f && el.dataset.fbind) { f[el.dataset.fbind] = el.value; commit(); return; }
  if (f && el.dataset.hireling != null) { f.hirelings[+el.dataset.hireling] = el.value; save(); return; }
  if (f && el.dataset.opt) {
    const k = el.dataset.opt;
    if (el.dataset.idx != null) { f.options[k] ||= []; f.options[k][+el.dataset.idx] = el.value; } else f.options[k] = el.value;
    if (k === 'guild' && b.draft[f.id]) b.draft[f.id] = {};
    commit(); return;
  }
  if (f && el.dataset.tool) {
    const max = f.enlarged ? 9 : 6; const t = el.dataset.tool;
    if (el.checked) { if (f.options.tools.length >= max) { toast(`Only ${max} kinds of tools.`); el.checked = false; return; } f.options.tools.push(t); }
    else f.options.tools = f.options.tools.filter(x => x !== t);
    commit(); return;
  }
  if (f && el.dataset.creatureDef) { const c = f.creatures.find(x => x.id === el.dataset.creatureDef); c.defender = el.checked; commit(); return; }
  if (f && el.dataset.draft) {
    const d = draftFor(b, f);
    if (el.dataset.draft === 'optId') { b.draft[f.id] = { optId: el.value }; } else d[el.dataset.draft] = el.value;
    commit(); return;
  }
  const bid = el.closest('[data-bid]')?.dataset.bid;
  if (bid && el.dataset.basicType != null) { b.basics.find(x => x.id === bid).type = el.value; commit(); }
});

$('#newBastion').addEventListener('click', () => { newBastion(); tab = 'facilities'; commit(); });
$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bastions-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
function importFile(input) {
  const file = input.files[0]; if (!file) return;
  file.text().then(txt => {
    const data = JSON.parse(txt);
    const list = Array.isArray(data.bastions) ? data.bastions : (data.id && data.specials ? [data] : null);
    if (!list) throw new Error('Not a Bastion Builder export');
    for (const nb of list) { const i = state.bastions.findIndex(x => x.id === nb.id); if (i >= 0) state.bastions[i] = nb; else state.bastions.push(nb); dirty.add(nb.id); }
    setActive(list[0].id); commit(); toast(`Imported ${list.length} bastion${list.length > 1 ? 's' : ''}.`);
  }).catch(err => toast(`Import failed: ${err.message}`)).finally(() => { input.value = ''; });
}
// <details> 'toggle' doesn't bubble, so listen in the capture phase to remember open/closed.
document.addEventListener('toggle', (e) => {
  if (e.target.matches?.('[data-prereq-panel]') && B()) prereqOpen[B().id] = e.target.open;
}, true);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

boot();
