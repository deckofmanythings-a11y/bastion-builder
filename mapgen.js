'use strict';
// Graph-paper Bastion map generator.
//
// Layout rules (deterministic for a given seed + room list):
//  * One central hall (corridor, 10 ft wide, or 5 ft if the Bastion's hallWidth is 5) runs east–west. The front door opens from a foyer in the
//    middle of its south side; a stairwell (multi-storey Bastions) sits opposite the foyer.
//  * Every room has its own door onto the hall, so you never cross one room to reach another.
//    Rooms are zoned: public rooms nearest the foyer, the service wing (kitchen, workshops, storage)
//    to the east, the private wing (bedrooms, studies) to the west with secure rooms at the far end.
//    The Dining Room and Kitchen are kept side by side with a service door between them.
//  * Big Bastions split into floors: private rooms upstairs, secure rooms in the cellar.
//  * Outdoor facilities (Courtyard, Garden, Stable, Training Area, Menagerie) are fenced plots in the
//    yard either side of the path from the front door to the gate. Bastion walls ring the grounds.
// Coordinates are in 5-ft squares. The layout is stored on the Bastion; labels are looked up live.

const MAP_ZONE = {
  Bedroom: 'private', 'Dining Room': 'public', Parlor: 'public', Courtyard: 'outdoor', Kitchen: 'service', Storage: 'service',
  'arcane-study': 'private', archive: 'secure', armory: 'secure', barrack: 'service', demiplane: 'demi',
  'gaming-hall': 'public', garden: 'outdoor', greenhouse: 'service', guildhall: 'public', laboratory: 'service',
  library: 'private', meditation: 'private', menagerie: 'outdoor', observatory: 'top', pub: 'public',
  reliquary: 'secure', sacristy: 'private', sanctuary: 'private', sanctum: 'private', scriptorium: 'service',
  smithy: 'service', stable: 'outdoor', storehouse: 'service', teleport: 'secure', theater: 'public',
  training: 'outdoor', trophy: 'public', 'war-room': 'secure', workshop: 'service',
  // Eberron (optional)
  'dragonmark-outpost': 'public', 'kundarak-vault': 'secure', 'navigators-helm': 'service', 'orien-helm': 'service',
  'lyrandar-helm': 'service', 'artificers-forge': 'service', 'inquisitive-agency': 'public', 'manifest-zone': 'private',
  museum: 'public', 'construct-forge': 'service',
};
// [width along the hall, depth away from it]; repeats weight the choice
const MAP_DIMS = { 4: [[2, 2]], 16: [[4, 4], [4, 4], [4, 4], [8, 2], [2, 8]], 36: [[6, 6], [6, 6], [9, 4], [4, 9], [12, 3]] };
const PLOT_DIMS = { 4: [[2, 2]], 16: [[4, 4], [4, 4], [8, 2]], 36: [[6, 6], [6, 6], [9, 4], [12, 3]] };
// Shapes a player can pin on a facility. W is along the hall (or the path, for yard plots), D away from it.
//   'WxD'          a rectangle
//   'LWxD-wxd'     an L: a WxD room with a wxd corner cut out of its front (hall-side) corner. The notch opens onto
//                  the hall, so another facility that fits can sit in it; any part left over becomes a hall alcove.
//   'AxB+CxD+...'  the facility's squares split into several rooms side by side, each with its own hall door
const ROOM_SHAPES = {
  4: ['2x2', 'L3x2-2x1', '1x2+1x2'],
  16: ['4x4', '8x2', '2x8', 'L5x4-2x2', 'L4x5-2x2', 'L6x3-2x1', '2x4+2x4', '4x2+4x2', '4x3+2x2', '2x2+2x2+2x2+2x2'],
  36: ['6x6', '9x4', '4x9', '12x3', '3x12', 'L7x6-3x2', 'L6x7-3x2', 'L9x5-3x3', '3x6+3x6', '6x3+6x3', '6x4+4x3', '4x4+4x4+2x2', '3x4+3x4+3x4', '3x3+3x3+3x3+3x3'],
};
const isRectShape = sh => /^\d+x\d+$/.test(sh);
const shapeOptions = (sq, outdoor) => (ROOM_SHAPES[sq] || []).filter(sh => !outdoor || isRectShape(sh)); // yard plots stay rectangles
const validShape = (shape, sq, outdoor) => (shape && shapeOptions(sq, outdoor).includes(shape) ? shape : '');
// 'L5x4-2x2+2x2' -> [{w:5,d:4,cut:{w:2,d:2}}, {w:2,d:2}]
function parseShape(sh) {
  return sh.split('+').map(p => {
    const m = /^(L?)(\d+)x(\d+)(?:-(\d+)x(\d+))?$/.exec(p);
    return m[1] ? { w: +m[2], d: +m[3], cut: { w: +m[4], d: +m[5] } } : { w: +m[2], d: +m[3] };
  });
}
const shapeSquares = sh => parseShape(sh).reduce((t, p) => t + p.w * p.d - (p.cut ? p.cut.w * p.cut.d : 0), 0);
function refHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// The random pick always consumes the rng, so pinning one room doesn't reshuffle the others.
function roomDims(r, rng, table) {
  const rnd = pickR(rng, table[r.sq] || table[16]);
  return r.shape ? parseShape(r.shape) : [{ w: rnd[0], d: rnd[1] }];
}
// An L room's floor as rectangles (the cut corner left out); other rooms are one rectangle.
function roomRects(r) {
  if (!r.cut) return [r];
  const c = r.cut, left = c.x === r.x, top = c.y === r.y;
  const notchRow = { x: left ? r.x + c.w : r.x, w: r.w - c.w, h: c.h };
  return top ? [{ ...notchRow, y: r.y }, { x: r.x, y: r.y + c.h, w: r.w, h: r.h - c.h }]
    : [{ x: r.x, y: r.y, w: r.w, h: r.h - c.h }, { ...notchRow, y: r.y + r.h - c.h }];
}
// Room number as shown on the map: the rooms of a split facility are 5a, 5b, ...
const roomNo = r => (r.parts > 1 ? `${r.n}${'abcdefgh'[r.part] || ''}` : String(r.n));

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pickR = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function shuffleR(rng, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Rooms that physically exist right now (new rooms still under construction are left off).
function mapRooms(b) {
  const out = [];
  for (const x of b.basics) {
    if (x.building?.action === 'add') continue;
    const sq = SPACES[x.space].squares, zone = MAP_ZONE[x.type] || 'service';
    out.push({ ref: x.id, zone, sq, fb: x.type, basic: x.type, shape: validShape(x.shape, sq, zone === 'outdoor') });
  }
  for (const f of b.specials) { const sq = SPACES[facSpace(f)].squares, zone = MAP_ZONE[f.key] || 'service'; out.push({ ref: f.id, zone, sq, fb: DEF[f.key].name, key: f.key, shape: zone === 'demi' ? '' : validShape(f.shape, sq, zone === 'outdoor') }); }
  return out;
}
function mapSig(b) { return mapRooms(b).map(r => `${r.ref}:${r.sq}${r.shape ? ':' + r.shape : ''}`).sort().join('|') + (hallSquares(b) === 1 ? '|hall5' : '') + (stairStyle(b) !== 'straight' ? `|st:${stairStyle(b)}` : ''); }

// Main hall depth in squares: 2 (10 ft, default) or 1 (5 ft), from b.hallWidth. Set per generateMap call.
let HALL = 2;
const hallSquares = b => (+b.hallWidth === 5 ? 1 : 2);
// Stair style, per Bastion (b.stairStyle). Every storey has the stairs in the same spot, opening off the hall.
//   straight   (default) one 20-ft flight running along the north side of the hall (4x2). Flights alternate
//              direction storey by storey, so each floor's landing is at the end where the flight arrives:
//              even levels (ground, 2nd cellar...) land at the west end, odd levels at the east end.
//   switchback two 5-ft-wide flights side by side with a half-landing at the back (2x2); you step on and off
//              at the hall side on every floor (up on the west flight, down on the east one).
//   spiral     a 10-ft spiral stair (2x2), stepping on and off at the same point (facing the hall) on every floor.
// Maps drawn before this existed have a 2x4 stair with no style; they draw as a switchback in that well.
const STAIR_STYLES = ['straight', 'switchback', 'spiral'];
const stairStyle = b => (STAIR_STYLES.includes(b.stairStyle) ? b.stairStyle : 'straight');
let STAIR = 'straight';
// What to draw for a stair, in grid squares (shared by the graph-paper map, the battle map and the paint control):
//   treads/rails: line segments [x1,y1,x2,y2]; landings: flat rects; flights: {x,y,w,h, axis, from, dir} for shading
//   (axis 'x'/'y' = the direction it climbs, from = +1 if it starts at the low edge); arrows: {pts, label, at};
//   rings: circles {x,y,r,fill}; wedges: spiral landing {x,y,r,a0,a1} (degrees, screen coords: 90 = south).
function stairMarks(st) {
  const m = { treads: [], rails: [], landings: [], flights: [], arrows: [], rings: [], wedges: [] };
  const up = /UP/.test(st.label), dn = /DN/.test(st.label);
  const { x, y, w, h } = st;
  const style = st.style || 'switchback';
  if (style === 'straight') {
    const west = (((st.level || 0) % 2) + 2) % 2 === 0; // which end this floor's landing is at
    const lx = west ? x : x + w - 1, fx = west ? x + 1 : x, fw = w - 1;
    const far = west ? x + w - 0.3 : x + 0.3;
    m.landings.push({ x: lx, y, w: 1, h });
    const lanes = up && dn ? [{ y, h: 1, dir: 'DN' }, { y: y + 1, h: h - 1, dir: 'UP' }] : [{ y, h, dir: up ? 'UP' : 'DN' }];
    for (const L of lanes) {
      m.flights.push({ x: fx, y: L.y, w: fw, h: L.h, axis: 'x', from: west ? 1 : -1, dir: L.dir });
      for (let i = 0; i <= fw * 3; i++) m.treads.push([fx + i / 3, L.y, fx + i / 3, L.y + L.h]);
      const cy = L.y + L.h / 2;
      m.arrows.push({ pts: [[lx + 0.5, cy], [far, cy]], label: L.dir, at: [fx + fw / 2, cy] });
    }
    if (lanes.length > 1) m.rails.push([fx, y + 1, fx + fw, y + 1]); // between the up and down flights
    m.rails.push([fx, y + h, fx + fw, y + h]); // guard rail along the hall: you only step on at the landing
  } else if (style === 'switchback') {
    const ld = Math.min(0.7, h * 0.35), mid = x + w / 2, top = y + ld, bot = y + h;
    m.landings.push({ x, y, w, h: ld });
    for (const lx of [x, mid]) {
      m.flights.push({ x: lx, y: top, w: w / 2, h: bot - top, axis: 'y', from: -1, dir: lx === x ? 'UP' : 'DN' });
      for (let i = 0; i <= Math.floor((bot - top) * 3); i++) m.treads.push([lx, bot - i / 3, lx + w / 2, bot - i / 3]);
    }
    m.rails.push([mid, top, mid, bot]);
    const wx = x + w / 4, ex = x + (3 * w) / 4, ty = top - ld / 2;
    if (up && dn) {
      m.arrows.push({ pts: [[wx, bot - 0.2], [wx, top + 0.1]], label: 'UP', at: [wx, (top + bot) / 2] });
      m.arrows.push({ pts: [[ex, bot - 0.2], [ex, top + 0.1]], label: 'DN', at: [ex, (top + bot) / 2] });
    } else if (up) m.arrows.push({ pts: [[wx, bot - 0.2], [wx, ty], [ex, ty], [ex, bot - 0.35]], label: 'UP', at: [wx, (top + bot) / 2] });
    else m.arrows.push({ pts: [[ex, bot - 0.2], [ex, ty], [wx, ty], [wx, bot - 0.35]], label: 'DN', at: [ex, (top + bot) / 2] });
  } else { // spiral
    const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2 - 0.06, post = 0.15, a0 = 55, a1 = 125;
    m.rings.push({ x: cx, y: cy, r: R }, { x: cx, y: cy, r: post, fill: true });
    m.wedges.push({ x: cx, y: cy, r: R, a0, a1 });
    const pt = (deg, r) => [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r];
    for (let a = a1; a <= a0 + 360 + 0.1; a += (360 - (a1 - a0)) / 12) m.treads.push([...pt(a, post), ...pt(a, R)]);
    const arc = (from, to, r) => { const p = []; for (let i = 0; i <= 16; i++) p.push(pt(from + ((to - from) * i) / 16, r)); return p; };
    // up winds clockwise from the landing's west edge, down anticlockwise from its east edge
    if (up) m.arrows.push({ pts: arc(a1 + 8, a1 + 250, R * 0.62), label: 'UP', at: pt(a1 + 20, R * 0.62 + (dn ? 0 : 0)) });
    if (dn) m.arrows.push({ pts: arc(a0 - 8, a0 - 250, R * (up ? 0.42 : 0.62)), label: 'DN', at: pt(a0 - 20, R * (up ? 0.42 : 0.62)) });
  }
  return m;
}
// SVG for a stair: part 'body' (treads, rails, arrows; under the walls) or 'labels' (on top).
function stairSVG(st, X, Y, MS, part, ink) {
  const m = stairMarks(st), out = [];
  const seg = l => `M${X(l[0])} ${Y(l[1])}L${X(l[2])} ${Y(l[3])}`;
  if (part === 'labels') {
    for (const a of m.arrows) out.push(`<text x="${X(a.at[0])}" y="${Y(a.at[1]) + 3.5}" font-size="9.5" font-weight="700" text-anchor="middle" fill="${ink}" stroke="#fff" stroke-width="3" paint-order="stroke">${a.label}</text>`);
    return out.join('');
  }
  for (const l of m.landings) out.push(`<rect x="${X(l.x)}" y="${Y(l.y)}" width="${l.w * MS}" height="${l.h * MS}" fill="#fff"/>`);
  for (const wd of m.wedges) out.push(`<path d="M${X(wd.x)} ${Y(wd.y)}L${X(wd.x + Math.cos(wd.a0 * Math.PI / 180) * wd.r)} ${Y(wd.y + Math.sin(wd.a0 * Math.PI / 180) * wd.r)}A${wd.r * MS} ${wd.r * MS} 0 0 1 ${X(wd.x + Math.cos(wd.a1 * Math.PI / 180) * wd.r)} ${Y(wd.y + Math.sin(wd.a1 * Math.PI / 180) * wd.r)}Z" fill="none" stroke="${ink}" stroke-width="1"/>`);
  if (m.treads.length) out.push(`<path d="${m.treads.map(seg).join('')}" stroke="${ink}" stroke-width="0.8" fill="none"/>`);
  for (const r of m.rings) out.push(`<circle cx="${X(r.x)}" cy="${Y(r.y)}" r="${r.r * MS}" fill="${r.fill ? ink : 'none'}" stroke="${ink}" stroke-width="1.4"/>`);
  if (m.rails.length) out.push(`<path d="${m.rails.map(seg).join('')}" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`);
  for (const a of m.arrows) {
    const p = a.pts, [ax, ay] = p[p.length - 1], [bx, by] = p[p.length - 2];
    const ang = Math.atan2(Y(ay) - Y(by), X(ax) - X(bx)), hl = MS * 0.28;
    const head = [ang + 2.6, ang - 2.6].map(t => `${X(ax) + Math.cos(t) * hl} ${Y(ay) + Math.sin(t) * hl}`);
    out.push(`<path d="M${p.map(q => `${X(q[0])} ${Y(q[1])}`).join('L')}M${head[0]}L${X(ax)} ${Y(ay)}L${head[1]}" stroke="${ink}" stroke-width="1.1" fill="none" stroke-linejoin="round"/>`);
  }
  return out.join('');
}
function stairBox(label, level) {
  return STAIR === 'straight' ? { x: -1, y: -2, w: 4, h: 2, label, style: STAIR, level }
    : { x: -1, y: -2, w: 2, h: 2, label, style: STAIR, level };
}
function generateMap(b, { seed, floors = 'auto', plan = null }) {
  HALL = hallSquares(b); STAIR = stairStyle(b);
  const rng = mulberry32(seed >>> 0);
  const rooms = mapRooms(b);
  if (plan) return finishLayout(b, seed, floors, ...planFloors(rooms, plan, rng), plan);
  const indoor = rooms.filter(r => r.zone !== 'outdoor' && r.zone !== 'demi');
  let ground = indoor, upper = [], cellar = [];
  if (floors !== 'single' && indoor.length > 7) {
    cellar = indoor.filter(r => r.zone === 'secure');
    upper = indoor.filter(r => r.zone === 'private' || r.zone === 'top');
    ground = indoor.filter(r => !cellar.includes(r) && !upper.includes(r));
  } else if (floors !== 'single' && indoor.some(r => r.zone === 'top') && indoor.length > 3) {
    upper = indoor.filter(r => r.zone === 'top'); // an Observatory wants to be up high
    ground = indoor.filter(r => r.zone !== 'top');
  }
  const stairs = upper.length && cellar.length ? 'UP/DN' : upper.length ? 'UP' : cellar.length ? 'DN' : null;
  const fl = [buildFloor('Ground Floor', ground, rng, { foyer: true, stairs, level: 0 })];
  // other storeys are fitted into the ground floor's outline, so the building stacks and the stairs line up
  const fit = groundFit(fl[0]);
  if (upper.length) fl.push(buildFloor('Upper Floor', upper, rng, { stairs: 'DN', fit, level: 1 }));
  if (cellar.length) fl.push(buildFloor('Cellar', cellar, rng, { stairs: 'UP', fit, level: -1 }));
  addYard(fl[0], rooms.filter(r => r.zone === 'outdoor'), rng);
  return finishLayout(b, seed, floors, fl, rooms.filter(r => r.zone === 'demi'), null);
}

function finishLayout(b, seed, floors, fl, demiRooms, plan) {
  const demi = demiRooms.map(r => ({ ref: r.ref, fb: r.fb, x: 0, y: 0, w: 6, h: 6 }));
  // number rooms: floor by floor, west to east, north to south
  let n = 1;
  const nums = new Map(); // the rooms of a split facility share its number
  for (const f of fl) {
    const partN = new Map(); // letters run west to east
    f.rooms.sort((a, c) => a.x - c.x || a.y - c.y).forEach(r => {
      if (!nums.has(r.ref)) nums.set(r.ref, n++); r.n = nums.get(r.ref);
      if (r.parts > 1) { r.part = partN.get(r.ref) || 0; partN.set(r.ref, r.part + 1); }
    });
    f.plots.sort((a, c) => a.x - c.x || a.y - c.y).forEach(r => { r.n = n++; });
  }
  demi.forEach(r => { r.n = n++; });
  return { v: 1, seed: seed >>> 0, floors, sig: mapSig(b), fl, demi, notes: (plan && plan.notes) || '' };
}

// Build floors from an AI layout plan ({floors:[{name,level,east,west}], outdoor, pairs, secret}).
// Rooms the plan forgot are placed by their usual zone; refs it invented are ignored. Every room still
// gets its own hall door; the plan can only add connecting doors between neighbours.
function planFloors(rooms, plan, rng) {
  const byRef = new Map(rooms.map(r => [r.ref, r]));
  const used = new Set();
  const take = ref => { const r = byRef.get(ref); if (!r || used.has(ref) || r.zone === 'demi') return null; used.add(ref); return r; };
  const outdoor = (plan.outdoor || []).map(take).filter(Boolean);
  let pf = (plan.floors || []).map(f => ({ name: f.name || 'Floor', level: +f.level || 0, east: (f.east || []).map(take).filter(Boolean), west: (f.west || []).map(take).filter(Boolean) }));
  if (!pf.some(f => f.level === 0)) pf.push({ name: 'Ground Floor', level: 0, east: [], west: [] });
  const lv = new Map(); // merge duplicate levels
  for (const f of pf) { const g = lv.get(f.level); if (g) { g.east.push(...f.east); g.west.push(...f.west); } else lv.set(f.level, f); }
  // display order: entrance floor, then upward, then downward
  const rank = l => (l === 0 ? 0 : l > 0 ? l : 100 - l);
  pf = [...lv.values()].sort((a, c) => rank(a.level) - rank(c.level));
  const ground = pf.find(f => f.level === 0);
  for (const r of rooms) {
    if (used.has(r.ref) || r.zone === 'demi') continue;
    used.add(r.ref);
    if (r.zone === 'outdoor') outdoor.push(r);
    else if (r.zone === 'public' || r.zone === 'service') ground.east.push(r); else ground.west.push(r);
  }
  const levels = pf.map(f => f.level);
  const fl = [];
  for (const f of pf) { // ground floor first, so the others can be fitted into its outline
    const up = levels.some(l => l > f.level), dn = levels.some(l => l < f.level);
    fl.push(buildFloor(f.name, null, rng, { foyer: f.level === 0, stairs: up && dn ? 'UP/DN' : up ? 'UP' : dn ? 'DN' : null, level: f.level,
      wings: { east: f.east, west: f.west }, pairs: plan.pairs || [], secret: new Set(plan.secret || []),
      pins: new Map((plan.sides || []).map(x => [x.ref, x.side === 'south' ? 'S' : 'N'])), fit: f.level === 0 ? null : groundFit(fl[0]) }));
  }
  addYard(fl[0], outdoor, rng);
  return [fl, rooms.filter(r => r.zone === 'demi')];
}

function buildFloor(name, rooms, rng, { foyer, stairs, level = 0, wings = null, pairs = [], secret = new Set(), fit = null, pins = new Map() }) {
  // a split facility becomes separate rooms, each placed on its own (they needn't be neighbours)
  const size = r => {
    const parts = roomDims(r, rng, MAP_DIMS);
    return parts.map((p, i) => ({ ...r, parts: [p], w: p.w, d: p.d, ...(parts.length > 1 ? { split: { i, n: parts.length } } : {}) }));
  };
  let east, west, doorPairs;
  if (wings) {
    // AI plan: wing order as given; a pair listed consecutively becomes one block (kept side by side)
    const isPair = (a, c) => pairs.some(p => (p.a === a.ref && p.b === c.ref) || (p.a === c.ref && p.b === a.ref));
    const blocks = list => {
      const out = [];
      for (const r of list.flatMap(size)) { const last = out[out.length - 1]; if (last && last.length < 3 && isPair(last[last.length - 1], r)) last.push(r); else out.push([r]); }
      return out;
    };
    east = blocks(wings.east); west = blocks(wings.west);
    // the architect can pin a room to the north or south side of the hall; a block follows its first pinned room
    for (const blk of [...east, ...west]) { const r = blk.find(q => pins.has(q.ref)); if (r) blk.pin = pins.get(r.ref); }
    doorPairs = pairs.filter(p => p.door).map(p => [p.a, p.b]);
  } else {
    [east, west, doorPairs] = zoneWings(rooms.flatMap(size), rng);
  }
  return placeFloor(name, east, west, doorPairs, rng, { foyer, stairs, level, secret, fit });
}

function zoneWings(sized, rng) {
  const byZone = z => shuffleR(rng, sized.filter(r => (Array.isArray(z) ? z.includes(r.zone) : r.zone === z)));
  const pub = byZone('public'), svc = byZone('service'), priv = byZone(['private', 'top']), sec = byZone('secure');
  // Dining Room + Kitchen travel together as one block (dining nearer the foyer)
  const dining = pub.find(r => r.basic === 'Dining Room'), kitchen = svc.find(r => r.basic === 'Kitchen');
  const east = [], west = [];
  const len = list => list.reduce((s, blk) => s + blk.reduce((t, r) => t + r.w, 0), 0);
  for (const r of pub) { if (r === dining && kitchen) continue; (len(east) <= len(west) ? east : west).push([r]); }
  if (dining && kitchen) east.push([dining, kitchen]);
  for (const r of svc) if (r !== kitchen || !dining) east.push([r]);
  for (const r of priv) west.push([r]);
  for (const r of sec) west.push([r]);
  // if one wing is far longer, let its outermost blocks spill to the other wing's far end
  while (len(east) - len(west) > 10 && east.length > 1) west.push(east.pop());
  while (len(west) - len(east) > 10 && west.length > 1) east.push(west.pop());
  return [east, west, dining && kitchen ? [[dining.ref, kitchen.ref]] : []];
}

function groundFit(g) {
  const shell = new Set();
  for (const r of [...g.rooms, ...g.hall, ...(g.stairs ? [g.stairs] : [])]) for (const q of roomRects(r)) for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) shell.add(`${x},${y}`);
  return { ext: g.ext, shell };
}
// fit: the ground floor's reach along the hall in each quarter (north/south x east/west). Upper floors and
// cellars fill whichever quarter has the most of that outline left, so they stack over the ground floor.
function placeFloor(name, east, west, doorPairs, rng, { foyer, stairs, level = 0, secret, fit = null }) {
  const placed = [], doors = [];
  const st = stairs ? stairBox(stairs, level) : null;
  const start = { nE: st ? st.x + st.w : -1, nW: -1, sE: 1, sW: -1 };
  const cur = { ...start };
  const wingSide = { 1: { N: 0, S: 0 }, [-1]: { N: 0, S: 0 } }; // north/south balance, kept per wing
  let side = wingSide[1];
  const room = q => (fit ? Math.abs(fit.ext[q] - start[q]) : 0) - Math.abs(cur[q] - start[q]);
  // squares of a block that would hang outside the ground floor's outline if put in quarter q
  const overhang = (blk, q) => {
    let c = cur[q], n = 0; const dir = q[1] === 'E' ? 1 : -1;
    for (const r of blk) for (const p of r.parts) {
      const x = dir > 0 ? c : c - p.w, y = q[0] === 'n' ? -p.d : HALL; c += dir * p.w;
      for (const z of roomRects({ x, y, w: p.w, h: p.d, cut: p.cut ? { x, y: q[0] === 'n' ? y + p.d - p.cut.d : y, w: p.cut.w, h: p.cut.d } : null }))
        for (let yy = z.y; yy < z.y + z.h; yy++) for (let xx = z.x; xx < z.x + z.w; xx++) if (!fit.shell.has(`${xx},${yy}`)) n++;
    }
    return n;
  };
  // a room nobody pinned may take whichever of its usual shapes sits best over the floor below
  // (in a paired block, every unpinned room tries its shapes, so a pair still fits)
  const shapesOf = r => (!r.shape && r.parts.length === 1
    ? [...new Set((MAP_DIMS[r.sq] || []).map(d => d.join('x')))].map(k => { const [w, d] = k.split('x').map(Number); return { ...r, w, d, parts: [{ w, d }] }; })
    : [r]);
  const variants = blk => blk.reduce((acc, r) => acc.flatMap(v => shapesOf(r).map(x => [...v, x])), [[]]);
  const choose = (blk, qs) => {
    let bestC = null;
    for (const q of qs) for (const v of [blk, ...variants(blk)]) {
      const c = { q, v, o: overhang(v, q), r: room(q) };
      if (!bestC || c.o < bestC.o || (c.o === bestC.o && c.r > bestC.r)) bestC = c;
    }
    return bestC;
  };
  const pending = [...east, ...west], taken = new Set(), alcoves = [];
  // An L room's notch: the biggest waiting single room that fills its full depth goes in, against the L; what's left
  // of the notch (if anything) opens onto the hall as an alcove.
  const fillNotch = (c, s, mate = null) => {
    let best = mate ? { blk: null, v: mate, w: mate.parts[0].w } : null;
    if (!best) for (const blk of pending) {
      if (taken.has(blk) || blk.length !== 1 || blk[0].parts.length !== 1 || blk[0].parts[0].cut) continue;
      for (const v of shapesOf(blk[0])) {
        const pp = v.parts[0];
        if (pp.d === c.h && pp.w <= c.w && (!best || pp.w > best.w)) best = { blk, v, w: pp.w };
      }
    }
    const inner = c.left ? c.x + c.w : c.x; // the L's own wall beside the notch
    if (best) {
      if (best.blk) taken.add(best.blk);
      const q = best.v, fx = c.left ? inner - best.w : inner;
      const rect = { ref: q.ref, fb: q.fb, zone: q.zone, x: fx, y: c.y, w: best.w, h: c.h, side: s, inNotch: true };
      if (q.split) { rect.part = q.split.i; rect.parts = q.split.n; }
      placed.push(rect);
      doors.push({ x: fx + Math.floor(rng() * best.w), y: s === 'N' ? 0 : HALL, o: 'h', kind: secret.has(q.ref) ? 'secret' : q.zone === 'secure' ? 'locked' : 'door' });
      if (best.w < c.w) alcoves.push({ x: c.left ? c.x : c.x + best.w, y: c.y, w: c.w - best.w, h: c.h });
    } else alcoves.push({ x: c.x, y: c.y, w: c.w, h: c.h });
  };
  const hasL = blk => blk.some(r => r.parts.some(q => q.cut));
  const put = (blocks, dir) => {
    side = wingSide[dir];
    // L rooms go first in their wing, so the rooms that could fill their notches are still waiting
    for (const blk of [...blocks.filter(hasL), ...blocks.filter(x => !hasL(x))]) {
      if (taken.has(blk)) continue;
      taken.add(blk); // placed: no longer available to fill a notch
      const s = blk.pin || (side.N < side.S || (side.N === side.S && rng() < 0.5) ? 'N' : 'S');
      place(blk, s, dir);
    }
  };
  // in a pair (e.g. Bedroom + Parlor), a room that fits its partner's L notch goes in the notch
  const notchMate = blk => {
    const L = blk.find(r => r.parts.length === 1 && r.parts[0].cut); if (!L) return null;
    const c = L.parts[0].cut;
    for (const r of blk) {
      if (r === L || r.parts.length !== 1 || r.parts[0].cut) continue;
      const v = shapesOf(r).find(v => v.parts[0].d === c.d && v.parts[0].w <= c.w);
      if (v) return { L, r, v };
    }
    return null;
  };
  const place = (blk, s, dir) => {
      const nm = notchMate(blk);
      for (const r of blk) {
        if (nm && r === nm.r) continue; // placed inside its partner's notch instead
        const key = s === 'N' ? (dir > 0 ? 'nE' : 'nW') : (dir > 0 ? 'sE' : 'sW');
        const parts = r.parts || [{ w: r.w, d: r.d }];
        parts.forEach((p, pi) => {
          const x = dir > 0 ? cur[key] : cur[key] - p.w;
          cur[key] += dir * p.w; side[s] += p.w;
          const y = s === 'N' ? -p.d : HALL;
          const rect = { ref: r.ref, fb: r.fb, zone: r.zone, x, y, w: p.w, h: p.d, side: s };
          if (r.split) { rect.part = r.split.i; rect.parts = r.split.n; }
          const left = refHash(r.ref) & 1; // which end the notch is at is fixed per facility, so redraws agree
          if (p.cut) rect.cut = { x: left ? x : x + p.w - p.cut.w, y: s === 'N' ? -p.cut.d : HALL, w: p.cut.w, h: p.cut.d };
          placed.push(rect);
          // the room's own door: on the part of its front wall that actually touches the hall
          const fx0 = p.cut && left ? x + p.cut.w : x, fw = p.cut ? p.w - p.cut.w : p.w;
          doors.push({ x: fx0 + Math.floor(rng() * fw), y: s === 'N' ? 0 : HALL, o: 'h', kind: secret.has(r.ref) ? 'secret' : r.zone === 'secure' ? 'locked' : 'door' });
          if (p.cut) fillNotch({ ...rect.cut, left }, s, nm && nm.L === r ? nm.v : null);
        });
      }
  };
  if (fit) {
    // upper floor / cellar: ignore the wing split and give each block (widest first) to the emptiest quarter
    const bw = blk => blk.reduce((t, r) => t + r.w, 0);
    for (const blk of [...east, ...west].sort((a, c) => hasL(c) - hasL(a) || bw(c) - bw(a))) {
      if (taken.has(blk)) continue;
      taken.add(blk);
      const c = choose(blk, blk.pin === 'N' ? ['nE', 'nW'] : blk.pin === 'S' ? ['sE', 'sW'] : ['nE', 'sE', 'nW', 'sW']);
      place(c.v, c.q[0].toUpperCase(), c.q[1] === 'E' ? 1 : -1);
    }
  } else {
    // reset side balance per wing so both wings fill north and south evenly
    // L rooms of BOTH wings go first, so any room that could fill a notch (from either wing) is still waiting
    put(east.filter(hasL), 1); put(west.filter(hasL), -1);
    put(east, 1); put(west, -1);
  }

  for (const [ra, rc] of doorPairs) {
    const as = placed.filter(r => r.ref === ra), cs = placed.filter(r => r.ref === rc);
    const hit = as.flatMap(a => cs.map(c => [a, c])).find(([a, c]) => a.side === c.side && (a.x + a.w === c.x || c.x + c.w === a.x));
    if (hit) { const [a, c] = hit; doors.push({ x: Math.max(a.x, c.x), y: a.side === 'N' ? -1 : HALL, o: 'v', kind: 'door' }); continue; }
    const nest = as.flatMap(a => cs.map(c => [a, c])).flatMap(([a, c]) => [[a, c], [c, a]])
      .find(([l, q]) => l.cut && q.inNotch && q.side === l.side && q.x >= l.cut.x && q.x + q.w <= l.cut.x + l.cut.w);
    if (nest) {
      const [l, q] = nest, wallX = l.cut.x === l.x ? q.x + q.w : q.x; // the L's wall beside the notch room
      if (wallX > l.x && wallX < l.x + l.w) doors.push({ x: wallX, y: l.side === 'N' ? -1 : HALL, o: 'v', kind: 'door' });
      else doors.push({ x: q.x + Math.floor(q.w / 2), y: l.side === 'N' ? q.y : q.y + q.h, o: 'h', kind: 'door' }); // through its back wall
    }
  }
  const xs = placed.flatMap(r => [r.x, r.x + r.w]).concat([-1, 1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const hall = [{ x: minX, y: 0, w: maxX - minX, h: HALL }, ...alcoves];
  let front = null;
  if (foyer) {
    const nb = placed.filter(r => r.side === 'S' && (r.x + r.w === -1 || r.x === 1));
    const fd = Math.max(2, ...nb.map(r => r.h));
    hall.push({ x: -1, y: HALL, w: 2, h: fd }); // the entrance foyer stays 10 ft wide for the double doors
    front = { y: HALL + fd };
    doors.push({ x: -1, y: HALL + fd, o: 'h', kind: 'front' }, { x: 0, y: HALL + fd, o: 'h', kind: 'front' });
  }
  return { name, rooms: placed, hall, stairs: st, doors, front, plots: [], ext: { ...cur } };
}

function addYard(floor, outdoor, rng) {
  if (!outdoor.length) return;
  const cells = [...floor.rooms, ...floor.hall];
  const facade = Math.max(...cells.map(r => r.y + r.h));
  const bx0 = Math.min(...cells.map(r => r.x)), bx1 = Math.max(...cells.map(r => r.x + r.w));
  const y0 = facade + 2;
  const sides = { W: { x: -2, y: y0, row: 0, lim: Math.min(-8, bx0) }, E: { x: 2, y: y0, row: 0, lim: Math.max(8, bx1) } };
  const used = { W: 0, E: 0 };
  const list = outdoor.map(r => { const [{ w, d: h }] = roomDims(r, rng, PLOT_DIMS); return { ...r, w, h }; }).sort((a, c) => c.w * c.h - a.w * a.h);
  for (const r of list) {
    const k = used.W < used.E || (used.W === used.E && rng() < 0.5) ? 'W' : 'E';
    const s = sides[k];
    if (k === 'W' && s.x - r.w < s.lim && s.x !== -2) { s.y += s.row + 1; s.x = -2; s.row = 0; }
    if (k === 'E' && s.x + r.w > s.lim && s.x !== 2) { s.y += s.row + 1; s.x = 2; s.row = 0; }
    const x = k === 'W' ? s.x - r.w : s.x;
    floor.plots.push({ ref: r.ref, fb: r.fb, zone: 'outdoor', x, y: s.y, w: r.w, h: r.h });
    s.x = k === 'W' ? x - 1 : x + r.w + 1; s.row = Math.max(s.row, r.h); used[k] += r.w * r.h;
  }
}

// ---- reachability check: every room must be reachable from the front door,
// and private/secure rooms without passing through a service room ----
function checkMap(layout) {
  const problems = [];
  for (const f of layout.fl) {
    const node = new Map(); // cell -> region
    f.hall.forEach(r => fillCells(node, r, 'hall'));
    if (f.stairs) fillCells(node, f.stairs, 'hall');
    f.rooms.forEach((r, i) => fillCells(node, r, 'r' + i));
    const adj = {};
    const link = (a, c) => { (adj[a] ||= new Set()).add(c); (adj[c] ||= new Set()).add(a); };
    for (const d of f.doors) {
      if (d.kind === 'front') continue;
      const a = node.get(d.o === 'h' ? `${d.x},${d.y - 1}` : `${d.x - 1},${d.y}`), c = node.get(`${d.x},${d.y}`);
      if (a && c) link(a, c);
    }
    const svc = new Set(f.rooms.map((r, i) => r.zone === 'service' ? 'r' + i : null).filter(Boolean));
    f.rooms.forEach((r, i) => {
      const target = 'r' + i, avoid = r.zone === 'private' || r.zone === 'secure' || r.zone === 'top';
      const seen = new Set(['hall']), q = ['hall'];
      while (q.length) { const v = q.shift(); for (const w of adj[v] || []) if (!seen.has(w) && (!avoid || w === target || !svc.has(w))) { seen.add(w); q.push(w); } }
      if (!seen.has(target)) problems.push(`${f.name}: room ${r.n} can't be reached${avoid ? ' without crossing a service room' : ''}`);
    });
  }
  return problems;
}
function fillCells(m, r, id) { for (const q of roomRects(r)) for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) m.set(`${x},${y}`, id); }

// ---------------- rendering ----------------
const MS = 16; // px per square
const INK = '#1f4f99', GRID = '#c3d4ec', GRID5 = '#9fbbe0', PAPER = '#eaf1fa';

function mapLabel(b, ref, fb) {
  const x = b.basics.find(r => r.id === ref); if (x) return { full: x.type, short: x.type, space: x.space };
  const f = b.specials.find(r => r.id === ref);
  if (f) return { full: facName(f), short: f.nickname || DEF[f.key].name, space: facSpace(f) };
  return { full: `${fb} (removed)`, short: fb, space: '' };
}

// The ground floor's building (rooms, hall, stairwell): drawn faintly under the other storeys.
function groundShell(L) { const g = L.fl[0]; return [...g.rooms.flatMap(roomRects), ...g.hall, ...(g.stairs ? [g.stairs] : [])]; }
function floorBox(f, walls, under = []) {
  const rs = [...f.rooms, ...f.hall, ...f.plots, ...(f.stairs ? [f.stairs] : []), ...under];
  let x0 = Math.min(...rs.map(r => r.x)), x1 = Math.max(...rs.map(r => r.x + r.w));
  let y0 = Math.min(...rs.map(r => r.y)), y1 = Math.max(...rs.map(r => r.y + r.h));
  if (f.front) y1 = Math.max(y1, f.front.y + (f.plots.length ? 0 : 2));
  if (walls) { x0 -= 2; x1 += 2; y0 -= 2; y1 += 2; }
  return { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2, wall: walls ? { x0, y0, x1, y1 } : null };
}

function renderMapSVG(b, L) {
  const hasWalls = (b.walls?.built || 0) > 0 || b.walls?.enclosed;
  const panels = L.fl.map((f, i) => ({ f, fi: i, box: floorBox(f, i === 0 && hasWalls, i ? groundShell(L) : []) }));
  if (L.demi.length) panels.push({ demi: true, box: { x0: -2, y0: -2, x1: 13, y1: 8 + (L.demi.length - 1) * 8 } });
  const PAD = 24, GAP = 36, TITLE = L.notes ? 86 : 64, PT = 26;
  let x = PAD; const maxH = Math.max(...panels.map(p => (p.box.y1 - p.box.y0) * MS));
  for (const p of panels) { // widen narrow panels so their titles don't run into the next one
    const title = p.demi ? 'DEMIPLANE' : p.f.name.toUpperCase();
    const need = Math.ceil((title.length * 11 + 12) / MS);
    if (p.box.x1 - p.box.x0 < need) { const extra = need - (p.box.x1 - p.box.x0); p.box.x0 -= Math.floor(extra / 2); p.box.x1 += Math.ceil(extra / 2); }
  }
  for (const p of panels) { p.px = x; p.w = (p.box.x1 - p.box.x0) * MS; p.h = (p.box.y1 - p.box.y0) * MS; x += p.w + GAP; }
  const width = Math.max(x - GAP + PAD, 560);
  // key entries
  const keyItems = [];
  for (const f of L.fl) for (const r of [...f.rooms, ...f.plots]) if (!keyItems.some(k => k.r.ref === r.ref)) keyItems.push({ n: r.n, r, fl: f.name });
  L.demi.forEach(r => keyItems.push({ n: r.n, r, fl: 'Demiplane' }));
  keyItems.sort((a, c) => a.n - c.n);
  const keyLen = k => { const lb = mapLabel(b, k.r.ref, k.r.fb); const nk = (b.nooks || []).filter(x => x.parent === k.r.ref).map(x => `${x.label || x.kind} ${x.squares} sq`).join(', ');
    return (String(k.n).length + 2 + lb.full.length) * 6.6 + (nk.length + 3) * 5.6 + (lb.space.length + 3 + (L.fl.length > 1 ? k.fl.length : 0)) * 5.4; };
  const colW = Math.min(width - 2 * PAD, Math.max(300, Math.ceil(Math.max(0, ...keyItems.map(keyLen)) + 24))), cols = Math.max(1, Math.floor((width - 2 * PAD) / colW)), rowsN = Math.ceil(keyItems.length / cols);
  const keyY = TITLE + PT + maxH + 30, height = keyY + 28 + rowsN * 20 + 52;
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Georgia, 'Times New Roman', serif">`);
  out.push(`<rect width="${width}" height="${height}" fill="#fbfcfe"/>`);
  out.push(`<text x="${PAD}" y="34" font-size="24" font-weight="700" fill="${INK}">${e(b.name)}</text>`);
  out.push(`<text x="${PAD}" y="54" font-size="13" fill="${INK}" opacity=".8">${e([b.character, b.campaign].filter(Boolean).join(' · '))}${b.character || b.campaign ? ' · ' : ''}1 square = 5 feet</text>`);
  if (L.notes) out.push(`<text x="${PAD}" y="74" font-size="13" font-style="italic" fill="${INK}" opacity=".85">${e(L.notes)}</text>`);

  for (const p of panels) {
    const ox = p.px - p.box.x0 * MS, oy = TITLE + PT - p.box.y0 * MS;
    const X = v => ox + v * MS, Y = v => oy + v * MS;
    out.push(`<text x="${p.px}" y="${TITLE + 16}" font-size="15" font-weight="700" fill="${INK}" letter-spacing="1">${p.demi ? 'DEMIPLANE' : e(p.f.name.toUpperCase())}</text>`);
    out.push(`<rect x="${p.px}" y="${TITLE + PT}" width="${p.w}" height="${p.h}" fill="${PAPER}"/>`);
    if (p.demi) {
      L.demi.forEach((r, i) => out.push(`<rect x="${X(0)}" y="${Y(i * 8)}" width="${6 * MS}" height="${6 * MS}" fill="#fff"/>`));
      grid(out, p, X, Y);
      L.demi.forEach((r, i) => {
        const yy = i * 8;
        out.push(`<rect x="${X(0)}" y="${Y(yy)}" width="${6 * MS}" height="${6 * MS}" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round"/>`);
        roomText(out, b, r, X(3), Y(yy + 3), 6, 6, e);
      });
      out.push(`<text x="${p.px}" y="${TITLE + PT + p.h + 16}" font-size="11" fill="${INK}" font-style="italic">Reached by a door in any wall</text>`);
      continue;
    }
    const f = p.f;
    if (p.fi) { // outline of the ground floor, so the storeys can be lined up
      const shell = groundShell(L);
      for (const r of shell) out.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * MS}" height="${r.h * MS}" fill="#d6dfeb"/>`);
      out.push(`<path d="${wallPath({ hall: shell, rooms: [], doors: [] }, X, Y)}" stroke="${INK}" stroke-width="1.4" stroke-dasharray="5 4" fill="none" opacity=".6"/>`);
    }
    // interiors
    for (const r of [...f.hall, ...f.rooms.flatMap(roomRects), ...(f.stairs ? [f.stairs] : [])]) out.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * MS}" height="${r.h * MS}" fill="#fff"/>`);
    for (const r of f.plots) out.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * MS}" height="${r.h * MS}" fill="#f6faf3"/>`);
    grid(out, p, X, Y);
    // path from the front door to the gate
    if (f.front) {
      const yEnd = p.box.wall ? p.box.wall.y1 : f.front.y + 2;
      out.push(`<path d="M${X(-1)} ${Y(f.front.y)}V${Y(yEnd)}M${X(1)} ${Y(f.front.y)}V${Y(yEnd)}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="1 4" stroke-linecap="round" fill="none"/>`);
    }
    // outdoor plots: dashed fences
    for (const r of f.plots) out.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * MS}" height="${r.h * MS}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-dasharray="6 3"/>`);
    // stairs treads
    if (f.stairs) out.push(stairSVG(f.stairs, X, Y, MS, 'body', INK));
    // walls
    const nooks = f.rooms.flatMap(r => placeNooks(b, r));
    out.push(`<path d="${wallPath(f, X, Y, nooks)}" stroke="${INK}" stroke-width="3.2" stroke-linecap="square" fill="none"/>`);
    // doors
    for (const d of f.doors) {
      const cx = d.o === 'h' ? X(d.x + 0.5) : X(d.x), cy = d.o === 'h' ? Y(d.y) : Y(d.y + 0.5);
      const w = d.o === 'h' ? MS * 0.62 : MS * 0.32, h = d.o === 'h' ? MS * 0.32 : MS * 0.62;
      if (d.kind === 'secret') {
        out.push(d.o === 'h' ? `<path d="M${X(d.x)} ${cy}H${X(d.x + 1)}" stroke="${INK}" stroke-width="3.2"/>` : `<path d="M${cx} ${Y(d.y)}V${Y(d.y + 1)}" stroke="${INK}" stroke-width="3.2"/>`);
        out.push(`<text x="${cx}" y="${cy + 4}" font-size="12" font-weight="700" font-style="italic" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">S</text>`);
        continue;
      }
      out.push(`<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${d.kind === 'locked' ? INK : '#fff'}" stroke="${INK}" stroke-width="1.4"/>`);
    }
    for (const k of nooks) {
      const d = k.door, cx = X(d.x + 0.5), cy = Y(d.y);
      out.push(`<rect x="${cx - MS * 0.27}" y="${cy - MS * 0.14}" width="${MS * 0.54}" height="${MS * 0.28}" fill="#fff" stroke="${INK}" stroke-width="1.1"/>`);
      out.push(`<text x="${X(k.x + k.w / 2)}" y="${Y(k.y + k.h / 2) + 3}" font-size="8" text-anchor="middle" fill="${INK}">${e(NOOK_ABBR[k.n.kind] || (k.n.label || k.n.kind || '?').slice(0, 2))}</text>`);
    }
    if (f.stairs) out.push(stairSVG(f.stairs, X, Y, MS, 'labels', INK));
    for (const r of f.plots) roomText(out, b, r, X(r.x + r.w / 2), Y(r.y + r.h / 2), r.w, r.h, e);
    for (const r of f.rooms) {
      const D = Math.max(0, ...nooks.filter(k => k.n.parent === r.ref).map(k => k.h));
      if (r.cut) {
        // label in the full-width piece, clear of the closets along its back wall (or the narrow piece if that's full)
        const rs = roomRects(r), q = rs.find(z => z.w === r.w), back = r.side === 'S' ? q.y + q.h === r.y + r.h : q.y === r.y;
        const d = back ? D : 0, qy = r.side === 'S' ? q.y : q.y + d, qh = q.h - d;
        const z = qh >= 1 ? { x: q.x, y: qy, w: q.w, h: qh } : rs.find(t => t !== q);
        roomText(out, b, r, X(z.x + z.w / 2), Y(z.y + z.h / 2), z.w, z.h, e); continue;
      }
      const fy = r.side === 'S' ? r.y : r.y + D, fh = r.h - D;
      roomText(out, b, r, X(r.x + r.w / 2), Y(fy + fh / 2), r.w, fh, e);
    }
    if (f.front) out.push(`<text x="${X(0)}" y="${Y(f.front.y) + 14}" font-size="9" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">ENTRY</text>`);
    // Bastion walls
    if (p.box.wall) {
      const w = p.box.wall, gl = -1, gr = 1;
      const pts = [[gr, w.y1], [w.x1, w.y1], [w.x1, w.y0], [w.x0, w.y0], [w.x0, w.y1], [gl, w.y1]];
      const dPath = 'M' + pts.map(([a, c]) => `${X(a)} ${Y(c)}`).join('L');
      const perim = (w.x1 - gr) + (w.y1 - w.y0) * 2 + (w.x1 - w.x0) + (gl - w.x0);
      const built = b.walls.enclosed ? perim : Math.min(perim, b.walls.built || 0);
      out.push(`<path d="${dPath}" stroke="${INK}" stroke-width="2" stroke-dasharray="4 4" fill="none" opacity=".5"/>`);
      if (built > 0) {
        const dash = built >= perim ? '' : ` stroke-dasharray="${built * MS} ${perim * MS}"`;
        out.push(`<path d="${dPath}" stroke="${INK}" stroke-width="7" fill="none"${dash}/><path d="${dPath}" stroke="#fff" stroke-width="2.5" fill="none"${dash}/>`);
      }
      out.push(`<text x="${X(0)}" y="${Y(w.y1) + 16}" font-size="9" text-anchor="middle" fill="${INK}">GATE</text>`);
    }
    if (p === panels[0]) { // compass
      const cx = p.px + p.w - 18, cy = TITLE + PT + 22;
      out.push(`<path d="M${cx} ${cy - 13}L${cx + 6} ${cy + 7}L${cx} ${cy + 3}L${cx - 6} ${cy + 7}Z" fill="${INK}"/><text x="${cx}" y="${cy - 16}" font-size="11" font-weight="700" text-anchor="middle" fill="${INK}">N</text>`);
    }
  }
  // key
  out.push(`<text x="${PAD}" y="${keyY}" font-size="15" font-weight="700" fill="${INK}" letter-spacing="1">KEY</text>`);
  keyItems.forEach((k, i) => {
    const c = Math.floor(i / rowsN), r = i % rowsN, lb = mapLabel(b, k.r.ref, k.r.fb);
    const nk = (b.nooks || []).filter(x => x.parent === k.r.ref).map(x => `${x.label || x.kind} ${x.squares} sq`).join(', ');
    out.push(`<text x="${PAD + c * colW}" y="${keyY + 24 + r * 20}" font-size="13" fill="${INK}"><tspan font-weight="700">${k.n}.</tspan> ${e(lb.full)}${nk ? ` <tspan font-size="11">(${e(nk)})</tspan>` : ''}${lb.space ? ` <tspan opacity=".65" font-size="11">${lb.space}${L.fl.length > 1 || k.fl === 'Demiplane' ? ' · ' + e(k.fl) : ''}</tspan>` : ''}</text>`);
  });
  out.push(`<text x="${PAD}" y="${height - 18}" font-size="11" fill="${INK}" opacity=".8">▭ door   ▬ locked door   S secret door   Cl/WC closet, washroom… (inside its room)   ┅ fenced outdoor area   ▒ ground floor's outline (other storeys)   ═ Bastion wall (dashed = not yet built)   ⋯ path to the gate</text>`);
  out.push('</svg>');
  return out.join('');
}

function grid(out, p, X, Y) {
  let thin = '', thick = '';
  for (let x = p.box.x0; x <= p.box.x1; x++) (x % 5 === 0 ? (thick += `M${X(x)} ${Y(p.box.y0)}V${Y(p.box.y1)}`) : (thin += `M${X(x)} ${Y(p.box.y0)}V${Y(p.box.y1)}`));
  for (let y = p.box.y0; y <= p.box.y1; y++) (y % 5 === 0 ? (thick += `M${X(p.box.x0)} ${Y(y)}H${X(p.box.x1)}`) : (thin += `M${X(p.box.x0)} ${Y(y)}H${X(p.box.x1)}`));
  out.push(`<path d="${thin}" stroke="${GRID}" stroke-width=".7"/><path d="${thick}" stroke="${GRID5}" stroke-width=".9"/>`);
}

function roomText(out, b, r, cx, cy, w, h, e) {
  const lb = mapLabel(b, r.ref, r.fb);
  const name = lb.short.length * MS * 0.34 <= w * MS - 6 && h >= 2 && w >= 3 && !r.part ? lb.short : null;
  out.push(`<text x="${cx}" y="${cy + (name ? -1 : 5)}" font-size="${MS * 0.95}" font-weight="700" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">${roomNo(r)}</text>`);
  if (name) out.push(`<text x="${cx}" y="${cy + 13}" font-size="${MS * 0.6}" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">${e(name)}</text>`);
}

// Wall segments = every cell edge between two different regions (hall and stairs count as one),
// minus door openings; merged into long runs.
function wallPath(f, X, Y, nooks = []) {
  const m = new Map();
  f.hall.forEach(r => fillCells(m, r, 'hall'));
  if (f.stairs) fillCells(m, f.stairs, 'hall');
  f.rooms.forEach((r, i) => fillCells(m, r, 'r' + i));
  nooks.forEach((k, i) => fillCells(m, k, 'k' + i));
  const doorSet = new Set([...f.doors, ...nooks.map(k => k.door)].map(d => `${d.o}:${d.x}:${d.y}`));
  const xs = [...m.keys()].map(k => +k.split(',')[0]), ys = [...m.keys()].map(k => +k.split(',')[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const H = {}, V = {};
  for (let y = y0; y <= y1 + 1; y++) for (let x = x0; x <= x1; x++) {
    const a = m.get(`${x},${y - 1}`), c = m.get(`${x},${y}`);
    if (a !== c && !doorSet.has(`h:${x}:${y}`)) (H[y] ||= []).push(x);
  }
  for (let x = x0; x <= x1 + 1; x++) for (let y = y0; y <= y1; y++) {
    const a = m.get(`${x - 1},${y}`), c = m.get(`${x},${y}`);
    if (a !== c && !doorSet.has(`v:${x}:${y}`)) (V[x] ||= []).push(y);
  }
  let d = '';
  const runs = (arr) => { const s = arr.sort((p, q) => p - q), r = []; for (const v of s) { const last = r[r.length - 1]; if (last && last[1] === v) last[1] = v + 1; else r.push([v, v + 1]); } return r; };
  for (const y in H) for (const [a, c] of runs(H[y])) d += `M${X(a)} ${Y(+y)}H${X(c)}`;
  for (const x in V) for (const [a, c] of runs(V[x])) d += `M${X(+x)} ${Y(a)}V${Y(c)}`;
  return d;
}

function svgToPngBlob(svg, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const s = Math.min(scale, 8000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(bl => bl ? resolve(bl) : reject(new Error('PNG export failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not draw the map')); };
    img.src = url;
  });
}

// Closets, washrooms etc. live inside their facility's squares, along the wall farthest from the hall.
// They share one back strip just deep enough to hold them all; each opens into its own room.
function placeNooks(b, r) {
  const list = (b.nooks || []).filter(n => n.parent === r.ref);
  if (!list.length || r.h < 2 || r.part) return []; // a split facility keeps its nooks in its first room
  // an L room drawn before v27 has its cut on the back wall, so its nooks start beside the cut
  const backCut = r.cut && (r.side === 'S' ? r.cut.y + r.cut.h === r.y + r.h : r.cut.y === r.y);
  const bx0 = backCut && r.cut.x === r.x ? r.x + r.cut.w : r.x, bx1 = backCut && r.cut.x !== r.x ? r.cut.x : r.x + r.w, bw = bx1 - bx0;
  const total = list.reduce((t, n) => t + Math.max(1, +n.squares || 1), 0);
  const D = Math.min(r.h - 1, Math.max(1, Math.ceil(total / bw)));
  const out = []; let cx = bx0;
  for (const n of list) {
    const s = Math.max(1, +n.squares || 1), h = Math.min(D, s), w = Math.ceil(s / h);
    if (cx + w > bx1) break; // no room left along the back wall; it still appears in the key
    const y = r.side === 'S' ? r.y + r.h - h : r.y;
    out.push({ n, x: cx, y, w, h, door: { x: cx + Math.floor((w - 1) / 2), y: r.side === 'S' ? y : y + h, o: 'h' } });
    cx += w;
  }
  return out;
}

// ---------------- floor geometry (shared with the battle map) ----------------
function floorGeometry(b, L, fi) {
  const f = L.fl[fi];
  const hasWalls = fi === 0 && ((b.walls?.built || 0) > 0 || b.walls?.enclosed);
  return { f, box: floorBox(f, hasWalls, fi ? groundShell(L) : []) };
}
