'use strict';
// Bastion Builder — state, rules engine, and UI. Pure vanilla JS, localStorage persistence.

const KEY = 'bastion-builder-v1';
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
let state = load();
let tab = 'facilities';

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.bastions)) return s;
  } catch { /* fresh start */ }
  return { bastions: [], activeId: null };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ } }
function B() { return state.bastions.find(b => b.id === state.activeId) || null; }
function commit() { save(); render(); }

function newBastion(name = 'New Bastion') {
  const b = {
    id: uid(), name, character: '', level: 5, prereqs: {}, gp: 0, day: 0, turn: 0, turnLength: 7,
    basics: [
      { id: uid(), type: 'Bedroom', space: 'Roomy', free: true, building: null },
      { id: uid(), type: 'Kitchen', space: 'Cramped', free: true, building: null },
    ],
    specials: [], walls: { built: 0, enclosed: false, building: null },
    extraDefenders: 0, armoryStocked: false, innerPeace: false,
    stash: [], log: [], pendingEvent: null, present: true, mode: 'orders', draft: {},
  };
  state.bastions.push(b);
  state.activeId = b.id;
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
    if (f.key === 'menagerie') n += (f.creatures || []).filter(c => c.defender).length;
  }
  return n;
}
function hirelingCount(f) { const d = DEF[f.key]; return d.hirelings + (f.enlarged && d.enlarge ? (d.enlarge.hirelings || 0) : 0) + (f.key === 'war-room' ? (f.lieutenants || 0) : 0); }
function facSpace(f) { return f.enlarged ? 'Vast' : DEF[f.key].space; }
function facName(f) { return f.nickname ? `${f.nickname} (${DEF[f.key].name})` : DEF[f.key].name; }
function meetsPrereq(b, p) {
  if (!p) return true;
  const q = b.prereqs || {};
  if (p === 'focus') return !!(q.focus || q.arcane || q.divine);
  return !!q[p];
}
function eligibility(b, def) {
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
  if (key === 'menagerie') f.creatures = [];
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
  for (const f of b.specials.filter(x => x.key === 'menagerie')) {
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

  advanceDays(b, b.turnLength);
  b.turn = T;
  b.draft = {};
  if (maintain) rollEvent(b);
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
      if (f.enlarging.daysLeft <= 0) { f.enlarging = null; f.enlarged = true; syncHirelings(f); addLog(b, `${facName(f)} enlarged to Vast. ${DEF[f.key].enlarge?.note || ''}`, 'build'); }
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

function resolveEvent(b, r) {
  const e = eventFor(r);
  const ev = { roll: r, key: e.key, name: e.name, lines: [], actions: [] };
  const shutNext = (f, why) => { if (!f) return; f.shutdownTurn = b.turn + 1; ev.lines.push(`${facName(f)} can't be issued orders on the next Bastion turn (${why}).`); };
  switch (e.key) {
    case 'allwell': { const k = roll(8); ev.lines.push(`Nothing significant happens. (d8 ${k}) ${ALL_WELL[k - 1]}`); break; }
    case 'attack': {
      const walls = b.walls.enclosed && b.walls.built > 0;
      const count = 6 - (walls ? 2 : 0);
      const sides = b.armoryStocked ? 8 : 6;
      const dice = rollDice(count, sides);
      const ones = dice.filter(x => x === 1).length;
      ev.lines.push(`A hostile force attacks! Rolled ${count}d${sides}${walls ? ' (walls: −2 dice)' : ''}${b.armoryStocked ? ' (stocked Armory: d8s)' : ''}: [${dice.join(', ')}].`);
      const had = totalDefenders(b);
      if (had === 0) { ev.lines.push('The Bastion has no defenders.'); shutNext(randomFacility(b), 'damaged in the attack'); }
      else if (ones) { const lost = loseDefenders(b, Math.min(ones, had)); ev.lines.push(`${Math.min(ones, had)} Bastion Defender(s) lost: ${lost}.`); }
      else ev.lines.push('No defenders lost — the attack is repelled.');
      if (b.armoryStocked) { b.armoryStocked = false; ev.lines.push('Armory equipment is expended.'); }
      ev.lines.push('Any visiting Teleportation Circle spellcaster departs.');
      break;
    }
    case 'criminal': {
      const f = randomFacility(b); const bribe = roll(6) * 100;
      ev.lines.push(`A hireling${f ? ` in ${facName(f)}` : ''} is exposed as having a criminal past. Officials can be bribed for ${gp(bribe)}.`);
      ev.actions = [{ id: 'pay', label: `Pay ${gp(bribe)}`, gp: -bribe }, { id: 'refuse', label: 'Refuse', shut: f?.id }];
      ev.lines.push('Event details are in the DMG — confirm with your DM.');
      break;
    }
    case 'opportunity':
      ev.lines.push('Your Bastion is offered an extraordinary opportunity (DM supplies details).');
      ev.actions = [{ id: 'invest', label: 'Invest 500 GP', gp: -500 }, { id: 'decline', label: 'Decline' }];
      break;
    case 'visitors': { const g = roll(6) * 100; earn(b, g, 'Friendly visitors'); ev.lines.push(`Friendly visitors pay ${gp(g)} to use your Bastion.`); break; }
    case 'guest': {
      const k = roll(4); ev.lines.push(`(d4 ${k}) ${GUEST_TABLE[k - 1]}`);
      if (k === 4) { b.extraDefenders++; ev.lines.push('+1 Bastion Defender.'); }
      break;
    }
    case 'lost': { const f = randomFacility(b); ev.lines.push('A facility\'s hirelings go missing.'); shutNext(f, 'hirelings missing'); break; }
    case 'magic': { const t = 'Uncommon magic item discovered by the hirelings (DM\'s choice)'; b.stash.push({ id: uid(), text: t, from: 'Bastion event', turn: b.turn }); ev.lines.push(t + ' — added to stash.'); break; }
    case 'refugees': { const n = sum(rollDice(2, 4)); const g = roll(6) * 100; earn(b, g, 'Refugees'); ev.lines.push(`${n} refugees seek shelter and pay ${gp(g)}.`); break; }
    case 'aid':
      ev.lines.push('A local leader requests aid. Send Bastion Defenders: each rolls 1d6; a total of 10+ solves the problem.');
      ev.actions = [{ id: 'aid', label: 'Send defenders…', aid: true }, { id: 'ignore', label: 'Decline' }];
      break;
    case 'treasure': { const t = 'Treasure acquired (roll on the DMG treasure tables)'; b.stash.push({ id: uid(), text: t, from: 'Bastion event', turn: b.turn }); ev.lines.push(t + ' — added to stash.'); break; }
  }
  if (e.key !== 'allwell') ev.lines.push('Full event text is in the DMG — your DM has the final say.');
  addLog(b, `Bastion event (d100 ${r}): ${e.name}. ${ev.lines.join(' ')}`, 'event');
  b.pendingEvent = ev;
}

function eventAction(id) {
  const b = B(); const ev = b.pendingEvent; if (!ev) return;
  const a = ev.actions.find(x => x.id === id);
  if (a.aid) {
    const max = totalDefenders(b);
    const n = Math.min(max, Math.max(0, parseInt(prompt(`Send how many defenders? (you have ${max})`, String(Math.min(max, 2))), 10) || 0));
    if (!n) return toast('No defenders sent.');
    const dice = rollDice(n, 6); const t = sum(dice); const reward = roll(6) * 100;
    if (t >= 10) { earn(b, reward, 'Request for aid reward'); addLog(b, `Sent ${n} defenders: [${dice.join(', ')}] = ${t}. Problem solved! Reward ${gp(reward)}.`, 'event'); }
    else { const half = Math.floor(reward / 2); earn(b, half, 'Request for aid (partial)'); const lost = loseDefenders(b, 1); addLog(b, `Sent ${n} defenders: [${dice.join(', ')}] = ${t}. Partial success — reward halved to ${gp(half)}; lost ${lost || 'no one'}.`, 'event'); }
  } else {
    if (a.gp) { if (a.gp < 0) spend(b, -a.gp, `${ev.name}: ${a.label}`); else earn(b, a.gp, ev.name); }
    if (a.shut) { const f = b.specials.find(x => x.id === a.shut); if (f) { f.shutdownTurn = b.turn + 1; addLog(b, `${facName(f)} loses its hireling for a turn.`, 'event'); } }
    if (!a.gp && !a.shut) addLog(b, `${ev.name}: ${a.label}.`, 'event');
  }
  b.pendingEvent = null;
  commit();
}

// ---------- rendering ----------
function render() {
  renderTop();
  const b = B();
  const app = $('#app');
  if (!b) { app.innerHTML = emptyView(); return; }
  for (const f of b.specials) { f.options ||= {}; syncHirelings(f); }
  app.innerHTML = `
    <aside class="side">${sideView(b)}</aside>
    <section class="main">
      <nav class="tabs">
        ${[['facilities', 'Facilities'], ['turn', 'Bastion Turn'], ['stash', 'Stash & Defenders'], ['log', 'Chronicle']]
          .map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${l}${k === 'turn' && b.pendingEvent ? ' <span class="dot"></span>' : ''}</button>`).join('')}
      </nav>
      <div class="panel">${tab === 'facilities' ? facilitiesView(b) : tab === 'turn' ? turnView(b) : tab === 'stash' ? stashView(b) : logView(b)}</div>
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
    <div class="empty-crest">⛫</div>
    <h1>Raise your Bastion</h1>
    <p>At level 5, every adventurer can claim a Bastion — a home, a stronghold, and a place of power. Build its facilities, issue orders to its hirelings each Bastion turn, and weather whatever events befall it.</p>
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
      <label class="field"><span>Character level</span><input type="number" min="1" max="20" data-bind="level" data-num value="${b.level}"></label>
      ${b.level < 5 ? '<p class="warn">Bastions are normally gained at level 5.</p>' : ''}
      <details class="prereqs" ${Object.values(b.prereqs || {}).some(Boolean) ? '' : 'open'}>
        <summary>Facility prerequisites</summary>
        ${Object.entries(PREREQS).map(([k, t]) => `<label class="check"><input type="checkbox" data-prereq="${k}" ${b.prereqs?.[k] ? 'checked' : ''}> ${t}</label>`).join('')}
      </details>
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
    </div>
    <button class="btn ghost danger wide" data-act="deleteBastion">Delete this Bastion</button>`;
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
    <div class="basics">${b.basics.map(x => basicRow(b, x)).join('')}</div>
    <div class="card addbasic">
      <b>Add a basic facility</b>
      <select id="newBasicType">${BASIC_TYPES.map(t => `<option>${t}</option>`).join('')}</select>
      <select id="newBasicSpace">${Object.entries(BASIC_ADD).map(([s, v]) => `<option value="${s}">${s} — ${gp(v.cost)}, ${v.days} days</option>`).join('')}</select>
      <button class="btn sm" data-act="addBasic">Commission</button>
    </div>

    <div class="section-head"><h2>Defensive Walls</h2></div>
    <div class="card walls">
      <p>20-ft walls with a walkway. Each 5-ft square costs ${gp(WALL.costPerSquare)} and takes ${WALL.daysPerSquare} days. If the Bastion is <b>completely enclosed</b>, attacks roll 2 fewer dice for defender losses.</p>
      <div class="row">
        <span>Built: <b>${b.walls.built}</b> squares</span>
        ${b.walls.building ? `<span class="pill build">Building ${b.walls.building.squares} more · next square in ${b.walls.building.daysPerSquare - b.walls.building.progress} days</span>` : ''}
        <label class="check"><input type="checkbox" data-act="enclosed" ${b.walls.enclosed ? 'checked' : ''}> Completely enclosed</label>
      </div>
      ${b.walls.building ? '' : `<div class="row"><input id="wallSq" type="number" min="1" value="4" style="width:6em"> squares <button class="btn sm" data-act="buildWalls">Build walls</button></div>`}
    </div>`;
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
    <div class="hirelings"><span class="label">Hirelings (${hirelingCount(f)})</span>
      ${f.hirelings.map((h, i) => `<input data-hireling="${i}" value="${esc(h)}" placeholder="Hireling ${i + 1}">`).join('')}
    </div>
    <footer>
      ${status}
      ${f.enlarging ? `<span class="pill build">Enlarging · ${f.enlarging.daysLeft} days</span>` : ''}
      <span class="spacer"></span>
      ${def.enlarge && !f.enlarged && !f.enlarging ? `<button class="btn sm ghost" data-act="enlargeSpecial" title="${esc(def.enlarge.note)}">Enlarge (${gp(def.enlarge.cost)})</button>` : ''}
      <button class="btn sm ghost danger" data-act="removeSpecial">Remove</button>
    </footer>
  </article>`;
}

function facilityOptions(b, f) {
  const def = DEF[f.key]; const o = def.options || {}; const out = [];
  if (o.garden) {
    const n = f.enlarged ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const cur = f.options.garden[i] || 'Herb';
      out.push(`<label class="field inline"><span>${n > 1 ? `Garden ${i + 1}` : 'Garden type'}</span><select data-opt="garden" data-idx="${i}" ${i === 0 ? 'disabled title="Use the Change Garden Type order (21 days)"' : ''}>${Object.keys(GARDEN_TYPES).map(t => `<option ${t === cur ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`);
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
      : enl ? `<button class="btn xs ghost" data-act="enlargeBasic">Enlarge to ${enl.to} (${gp(enl.cost)}, ${enl.days}d)</button>` : ''}
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
  const menag = b.specials.filter(f => f.key === 'menagerie');
  return `
    <div class="section-head"><h2>Bastion Stash</h2></div>
    <p class="hint">Crafted and harvested goods stay in your Bastion until you claim them.</p>
    <div class="stash">${b.stash.map(s => `<div class="sitem" data-sid="${s.id}"><span>${esc(s.text)}</span><small>${esc(s.from)} · turn ${s.turn}</small><button class="btn xs" data-act="claim">Claim</button></div>`).join('') || '<div class="placeholder">Nothing waiting in the Bastion.</div>'}</div>
    <div class="row"><input id="stashText" placeholder="Add an item manually…"><button class="btn sm" data-act="addStash">Add</button></div>

    <div class="section-head"><h2>Bastion Defenders <small>${totalDefenders(b)} total</small></h2></div>
    <div class="card">
      ${barracks.map(f => `<div class="drow"><span>${esc(facName(f))}</span><b>${f.defenders || 0} / ${barrackCap(f)}</b></div>`).join('')}
      ${menag.map(f => `<div class="drow"><span>${esc(facName(f))} creatures</span><b>${f.creatures.filter(c => c.defender).length}</b></div>`).join('')}
      <div class="drow"><span>Other defenders (guests, mercenaries…)</span><span><button class="btn xs ghost" data-act="extra-">−</button> <b>${b.extraDefenders}</b> <button class="btn xs ghost" data-act="extra+">+</button></span></div>
      <div class="drow"><span>Armory</span><b>${hasFacility(b, 'armory') ? (b.armoryStocked ? 'Stocked (d8s)' : 'Depleted') : '—'}</b></div>
      <div class="drow"><span>Walls</span><b>${b.walls.built} sq${b.walls.enclosed ? ', fully enclosed (−2 dice)' : ''}</b></div>
      ${!barracks.length ? '<p class="small">Build a Barrack to recruit Bastion Defenders.</p>' : ''}
    </div>`;
}

function logView(b) {
  return `<div class="section-head"><h2>Chronicle</h2><button class="btn sm ghost" data-act="clearLog">Clear</button></div>
    <ol class="log">${b.log.slice().reverse().map(e => `<li class="k-${e.kind}"><small>T${e.turn} · day ${e.day}</small> ${esc(e.text)}</li>`).join('')}</ol>`;
}

// ----- modal: special facility picker -----
function openPicker() {
  const b = B();
  const groups = [5, 9, 13, 17].map(lv => {
    const items = FACILITIES.filter(f => f.level === lv).map(def => {
      const why = eligibility(b, def);
      return `<button class="pick ${why ? 'no' : ''}" data-pick="${def.key}" ${why ? 'disabled' : ''}>
        <span class="pname">${esc(def.name)} <span class="badge ord ord-${def.order.toLowerCase()}">${def.order}</span></span>
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
  const el = e.target.closest('[data-act],[data-tab],[data-mode],[data-pick],[data-close],[data-ev-act],[data-pick-event],[data-creature-del]');
  if (!el) return;
  const b = B();
  if (el.dataset.tab) { tab = el.dataset.tab; render(); return; }
  if (el.dataset.close != null) { closeModal(); return; }
  if (el.dataset.mode) { b.mode = el.dataset.mode; commit(); return; }
  if (el.dataset.pick) {
    const f = makeSpecial(el.dataset.pick); b.specials.push(f);
    addLog(b, `${DEF[f.key].name} added to the Bastion.`, 'build'); closeModal(); commit(); return;
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
    case 'new': newBastion(); commit(); break;
    case 'deleteBastion':
      if (confirm(`Delete "${b.name}" permanently? This can't be undone (export first if unsure).`)) {
        state.bastions = state.bastions.filter(x => x.id !== b.id); state.activeId = state.bastions[0]?.id || null; commit();
      }
      break;
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
      if (b.gp < c && !confirm(`Enlarging costs ${gp(c)} but you have ${gp(b.gp)}. Go into debt?`)) return;
      spend(b, c, `Enlarge ${facName(f)}`); f.enlarging = { daysLeft: SPECIAL_ENLARGE_DAYS };
      addLog(b, `Work begins enlarging ${facName(f)} (${SPECIAL_ENLARGE_DAYS} days).`, 'build'); commit(); break;
    }
    case 'def+': f.defenders = Math.min(barrackCap(f), (f.defenders || 0) + 1); commit(); break;
    case 'def-': f.defenders = Math.max(0, (f.defenders || 0) - 1); commit(); break;
    case 'lt+': f.lieutenants = Math.min(10, (f.lieutenants || 0) + 1); commit(); break;
    case 'lt-': f.lieutenants = Math.max(0, (f.lieutenants || 0) - 1); commit(); break;
    case 'extra+': b.extraDefenders++; commit(); break;
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
      if (b.gp < v.cost && !confirm(`This costs ${gp(v.cost)} but you have ${gp(b.gp)}. Go into debt?`)) return;
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
  }
});

document.addEventListener('change', (e) => {
  const el = e.target; const b = B(); if (!b) return;
  if (el.id === 'bastionSelect') { state.activeId = el.value; commit(); return; }
  if (el.id === 'importInput') return importFile(el);
  if (el.dataset.bind) {
    b[el.dataset.bind] = el.dataset.num != null ? Math.max(1, parseInt(el.value, 10) || 1) : el.value;
    commit(); return;
  }
  if (el.dataset.bindCheck) { b[el.dataset.bindCheck] = el.checked; commit(); return; }
  if (el.dataset.prereq) { b.prereqs[el.dataset.prereq] = el.checked; commit(); return; }
  if (el.dataset.act === 'enclosed') { b.walls.enclosed = el.checked; commit(); return; }
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
    for (const nb of list) { const i = state.bastions.findIndex(x => x.id === nb.id); if (i >= 0) state.bastions[i] = nb; else state.bastions.push(nb); }
    state.activeId = list[0].id; commit(); toast(`Imported ${list.length} bastion${list.length > 1 ? 's' : ''}.`);
  }).catch(err => toast(`Import failed: ${err.message}`)).finally(() => { input.value = ''; });
}
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

render();
