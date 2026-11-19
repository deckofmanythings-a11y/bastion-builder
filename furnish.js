'use strict';
// Furnished battle-map render of one floor of the generated layout (mapgen.js).
// Everything that matters on a map is decided here in code, from the Bastion's data, so it is always right:
// which furniture each facility gets (a bed in the bedroom, an anvil in the smithy), where it stands (against
// the back wall, never in front of a door), the doors themselves, and the front entrance.
//
// Units: furniture is placed on a half-square grid inside each room. Item specs are
// [kind, where, width along the wall, depth, opts] in half squares. `where`:
//   back    against the wall farthest from the hall, middle first      corner  ends of the back/side walls first
//   wall    back wall, then side walls                                 side    side walls only
//   row     repeat along the back wall (opts.sides: then side walls)   full    whole width of the back wall
//   center  open floor nearest the middle (opts.n copies, spaced)      fill    scattered along walls/corners
//   decal   painted on the floor under everything (rugs, circles); takes no space

const FURN = {
  Bedroom: [['bed2', 'back', 3, 4], ['bed', 'wall', 2, 4, { unless: 'bed2' }], ['bedSide', 'wall', 4, 2, { unless: ['bed2', 'bed'] }], ['nightstand', 'back', 1, 1], ['wardrobe', 'wall', 2, 1], ['chest', 'wall', 2, 1], ['desk', 'wall', 3, 3], ['rug', 'decal', 4, 3]],
  'Dining Room': [['longTable', 'center', 4, 6, { shrink: true }], ['table', 'center', 4, 4, { unless: 'longTable' }], ['counter', 'back', 4, 1], ['fireplace', 'side', 4, 1], ['plant', 'fill', 1, 1, { n: 2 }]],
  Parlor: [['fireplace', 'back', 4, 1], ['seating', 'center', 6, 5], ['armchair', 'fill', 2, 2, { n: 2, unless: 'seating' }], ['bookshelf', 'side', 4, 1], ['plant', 'fill', 1, 1, { n: 2 }], ['rug', 'decal', 6, 5]],
  Kitchen: [['hearth', 'back', 4, 2], ['counter', 'row', 4, 1, { n: 2 }], ['worktable', 'center', 4, 2], ['barrels', 'fill', 2, 2, { n: 2 }], ['shelf', 'side', 4, 1]],
  Storage: [['shelf', 'row', 4, 1, { n: 3, sides: true }], ['crates', 'fill', 2, 2, { n: 4 }], ['barrels', 'fill', 2, 2, { n: 3 }], ['sacks', 'fill', 2, 1, { n: 3 }]],
  Courtyard: [['fountain', 'center', 4, 4, { shrink: true }], ['bench', 'wall', 4, 1, { n: 4 }], ['planter', 'fill', 2, 2, { n: 4 }], ['tree', 'fill', 3, 3, { n: 2 }]],
  'arcane-study': [['bookshelf', 'row', 4, 1, { n: 2 }], ['circle', 'center', 6, 6, { shrink: true }], ['desk', 'wall', 3, 3], ['chest', 'wall', 2, 1], ['candles', 'fill', 1, 1, { n: 3 }]],
  archive: [['bookshelf', 'row', 4, 1, { n: 5, sides: true }], ['stack', 'center', 6, 2, { n: 3 }], ['desk', 'wall', 3, 3]],
  armory: [['weaponRack', 'row', 4, 1, { n: 3 }], ['armorStand', 'side', 2, 2, { n: 4 }], ['chest', 'wall', 2, 1, { n: 2 }], ['worktable', 'center', 4, 2]],
  barrack: [['bunk', 'row', 2, 4, { n: 6 }], ['table', 'center', 4, 4], ['chest', 'fill', 2, 1, { n: 4 }]],
  'gaming-hall': [['bar', 'side', 8, 3], ['cardTable', 'center', 5, 5, { n: 4 }], ['barrels', 'fill', 2, 2, { n: 2 }], ['plant', 'fill', 1, 1, { n: 2 }]],
  garden: [['planter', 'row', 6, 2, { n: 4 }], ['planter', 'center', 6, 2, { n: 3 }], ['tree', 'fill', 3, 3, { n: 2 }], ['bench', 'wall', 4, 1]],
  greenhouse: [['planter', 'row', 6, 2, { n: 3, sides: true }], ['planter', 'center', 6, 2, { n: 2 }], ['worktable', 'wall', 4, 2], ['plant', 'fill', 1, 1, { n: 4 }]],
  guildhall: [['fireplace', 'back', 4, 1], ['banner', 'row', 2, 1, { n: 4 }], ['longTable', 'center', 4, 10, { shrink: true }], ['bookshelf', 'side', 4, 1, { n: 2 }], ['plant', 'fill', 1, 1, { n: 2 }]],
  laboratory: [['alchemy', 'row', 4, 2, { n: 2 }], ['cauldron', 'center', 2, 2], ['shelf', 'side', 4, 1, { n: 2 }], ['worktable', 'center', 4, 2], ['barrels', 'fill', 2, 2]],
  library: [['bookshelf', 'row', 4, 1, { n: 5, sides: true }], ['readingTable', 'center', 4, 4], ['armchair', 'fill', 2, 2, { n: 2 }], ['rug', 'decal', 6, 4]],
  meditation: [['shrine', 'back', 2, 1], ['cushion', 'center', 2, 2], ['candles', 'fill', 1, 1, { n: 4 }], ['rug', 'decal', 3, 3]],
  menagerie: [['pen', 'row', 6, 6, { n: 4, sides: true }], ['trough', 'center', 4, 1], ['hay', 'fill', 2, 2, { n: 2 }], ['tree', 'fill', 3, 3, { n: 2 }]],
  observatory: [['telescope', 'center', 4, 4, { shrink: true }], ['desk', 'wall', 3, 3], ['bookshelf', 'side', 4, 1], ['chartTable', 'wall', 4, 2]],
  pub: [['bar', 'back', 8, 3], ['roundTable', 'center', 4, 4, { n: 3 }], ['fireplace', 'side', 4, 1], ['barrels', 'fill', 2, 2, { n: 2 }]],
  reliquary: [['altar', 'back', 4, 2], ['pedestal', 'fill', 1, 1, { n: 3 }], ['chest', 'wall', 2, 1], ['candles', 'fill', 1, 1, { n: 2 }]],
  sacristy: [['altar', 'back', 4, 2], ['wardrobe', 'row', 2, 1, { n: 3 }], ['table', 'center', 4, 4], ['chest', 'wall', 2, 1, { n: 2 }]],
  sanctuary: [['altar', 'back', 4, 2], ['banner', 'back', 2, 1, { n: 2 }], ['pew', 'center', 8, 1, { n: 4 }], ['candles', 'fill', 1, 1, { n: 4 }]],
  sanctum: [['altar', 'back', 4, 2], ['circle', 'center', 6, 6, { shrink: true }], ['bookshelf', 'side', 4, 1], ['brazier', 'fill', 1, 1, { n: 4 }]],
  scriptorium: [['bookshelf', 'row', 4, 1, { n: 2 }], ['desk', 'center', 3, 3, { n: 4 }], ['shelf', 'side', 4, 1], ['candles', 'fill', 1, 1, { n: 2 }]],
  smithy: [['forge', 'back', 4, 3], ['anvil', 'center', 2, 1], ['quench', 'fill', 1, 1], ['weaponRack', 'side', 4, 1], ['worktable', 'wall', 4, 2], ['crates', 'fill', 2, 2]],
  stable: [['stall', 'row', 4, 4, { n: 6 }], ['hay', 'fill', 2, 2, { n: 3 }], ['trough', 'wall', 4, 1]],
  storehouse: [['shelf', 'row', 4, 1, { n: 4, sides: true }], ['crates', 'fill', 2, 2, { n: 6 }], ['barrels', 'fill', 2, 2, { n: 4 }], ['sacks', 'fill', 2, 1, { n: 4 }]],
  teleport: [['teleCircle', 'center', 8, 8, { shrink: true }], ['pedestal', 'back', 1, 1], ['brazier', 'fill', 1, 1, { n: 4 }]],
  theater: [['stage', 'full', 99, 5], ['seats', 'center', 10, 1, { n: 6, shrink: true }]],
  training: [['ring', 'decal', 8, 8], ['dummy', 'fill', 2, 2, { n: 4 }], ['weaponRack', 'wall', 4, 1, { n: 2 }]],
  trophy: [['trophyHead', 'row', 2, 1, { n: 4, sides: true }], ['display', 'center', 2, 2, { n: 4 }], ['statue', 'fill', 2, 2, { n: 2 }], ['rug', 'decal', 6, 4]],
  'war-room': [['mapTable', 'center', 6, 5, { shrink: true }], ['banner', 'row', 2, 1, { n: 3 }], ['weaponRack', 'side', 4, 1], ['bookshelf', 'side', 4, 1], ['brazier', 'fill', 1, 1, { n: 2 }]],
  workshop: [['workbench', 'row', 4, 2, { n: 3 }], ['toolRack', 'side', 4, 1], ['worktable', 'center', 4, 2], ['crates', 'fill', 2, 2, { n: 3 }], ['barrels', 'fill', 2, 2]],
  // Eberron (optional)
  'dragonmark-outpost': [['desk', 'back', 3, 3], ['banner', 'row', 2, 1, { n: 3 }], ['bookshelf', 'side', 4, 1], ['armchair', 'fill', 2, 2, { n: 2 }], ['chest', 'wall', 2, 1], ['rug', 'decal', 5, 4]],
  'kundarak-vault': [['chest', 'row', 2, 1, { n: 4, sides: true }], ['shelf', 'side', 4, 1], ['crates', 'fill', 2, 2, { n: 2 }]],
  'navigators-helm': [['chartTable', 'center', 4, 2], ['bookshelf', 'side', 4, 1], ['chest', 'wall', 2, 1]],
  'orien-helm': [['chartTable', 'center', 4, 2], ['shelf', 'side', 4, 1], ['chest', 'wall', 2, 1]],
  'lyrandar-helm': [['chartTable', 'center', 4, 2], ['brazier', 'fill', 1, 1, { n: 2 }], ['chest', 'wall', 2, 1]],
  'artificers-forge': [['forge', 'back', 4, 3], ['workbench', 'row', 4, 2, { n: 2 }], ['anvil', 'center', 2, 1], ['toolRack', 'side', 4, 1], ['worktable', 'center', 4, 2], ['crates', 'fill', 2, 2]],
  'inquisitive-agency': [['desk', 'back', 3, 3], ['bookshelf', 'row', 4, 1, { n: 3 }], ['chartTable', 'center', 4, 2], ['armchair', 'fill', 2, 2, { n: 2 }], ['plant', 'fill', 1, 1]],
  'manifest-zone': [['circle', 'center', 8, 8, { shrink: true }], ['pedestal', 'back', 1, 1, { n: 2 }], ['brazier', 'fill', 1, 1, { n: 4 }], ['candles', 'fill', 1, 1, { n: 3 }]],
  museum: [['display', 'center', 2, 2, { n: 5 }], ['trophyHead', 'row', 2, 1, { n: 4, sides: true }], ['statue', 'fill', 2, 2, { n: 2 }], ['pedestal', 'fill', 1, 1, { n: 3 }], ['rug', 'decal', 6, 4]],
  'construct-forge': [['forge', 'back', 4, 3], ['anvil', 'center', 2, 1], ['armorStand', 'side', 2, 2, { n: 4 }], ['worktable', 'center', 4, 2, { n: 2 }], ['toolRack', 'wall', 4, 1], ['crates', 'fill', 2, 2, { n: 2 }]],
};
const NOOK_ITEM = { Closet: 'closet', Washroom: 'washroom', Privy: 'privy', Bath: 'tub', Wardrobe: 'wardrobe', Pantry: 'pantry',
  'Linen cupboard': 'shelf', Alcove: 'cushion', 'Storage nook': 'crates' };
const WET_NOOK = new Set(['Washroom', 'Privy', 'Bath']);
// floor material per zone / facility
const FLOOR_OF = { private: 'wood', public: 'woodL', service: 'flags', secure: 'darkFlags', top: 'wood' };
const FLOOR_KEY = { smithy: 'flags', kitchen: 'flags', Kitchen: 'flags', stable: 'dirt', training: 'sand', garden: 'soil', menagerie: 'grassPlot',
  Courtyard: 'flags', greenhouse: 'tiles', theater: 'woodL', sanctuary: 'marble', sanctum: 'marble', reliquary: 'marble', teleport: 'marble',
  'gaming-hall': 'woodL', pub: 'wood', library: 'wood', archive: 'wood', 'war-room': 'flags',
  'artificers-forge': 'flags', 'construct-forge': 'flags', 'kundarak-vault': 'darkFlags', 'manifest-zone': 'marble', museum: 'marble' };

function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const roomKind = r => (r.key || r.basic || null);
function roomKindOf(b, ref) {
  const x = b.basics.find(q => q.id === ref); if (x) return x.type;
  const f = b.specials.find(q => q.id === ref); return f ? f.key : null;
}

// ---------------- placement ----------------
function furnishRoom(b, r, f, seed, isPlot) {
  const kind = roomKindOf(b, r.ref);
  const rng = mulberry32((seed ^ strHash(rkey(r))) >>> 0);
  const HW = r.w * 2, HH = r.h * 2;
  const occ = new Uint8Array(HW * HH); // 0 free, 1 blocked, 2 keep clear (walkway), 3 furniture
  const at = (i, j) => occ[j * HW + i];
  const set = (i, j, w, h, v) => { for (let y = j; y < j + h; y++) for (let x = i; x < i + w; x++) if (x >= 0 && y >= 0 && x < HW && y < HH && occ[y * HW + x] < v) occ[y * HW + x] = v; };
  const cell = (ax, ay) => [Math.round((ax - r.x) * 2), Math.round((ay - r.y) * 2)]; // absolute squares -> half grid
  const back = isPlot ? 'N' : r.side === 'S' ? 'S' : 'N';
  const nooks = isPlot ? [] : placeNooks(b, r);
  if (r.cut) { const [i, j] = cell(r.cut.x, r.cut.y); set(i, j, r.cut.w * 2, r.cut.h * 2, 1); } // an L room's missing corner
  for (const k of nooks) {
    const [i, j] = cell(k.x, k.y); set(i, j, k.w * 2, k.h * 2, 1);
    // keep the square in front of each nook door clear
    const d = k.door, [di] = cell(d.x, 0), dj = r.side === 'S' ? cell(0, k.y)[1] - 2 : cell(0, k.y + k.h)[1];
    set(di, dj, 2, 2, 2);
  }
  if (!isPlot) {
    for (const d of f.doors) {
      if (d.kind === 'front') continue;
      if (d.o === 'h') {
        if (d.x < r.x || d.x >= r.x + r.w) continue;
        const [di] = cell(d.x, 0);
        if (d.y === r.y + r.h) set(di, HH - 3, 2, 3, 2);      // door in the south wall of a north room
        else if (d.y === r.y) set(di, 0, 2, 3, 2);            // door in the north wall of a south room
      } else {
        if (d.y < r.y || d.y >= r.y + r.h) continue;
        const [, dj] = cell(0, d.y);
        if (d.x === r.x) set(0, dj, 3, 2, 2);
        else if (d.x === r.x + r.w) set(HW - 3, dj, 3, 2, 2);
      }
    }
  } else {
    // plot gate faces the path to the front door
    const gx = r.x < 0 ? HW - 2 : 0, gj = Math.max(0, Math.floor(HH / 2) - 1);
    set(gx, gj, 2, 2, 2);
  }
  // free-area centre (ignores nooks)
  let sx = 0, sy = 0, n = 0;
  for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) if (at(i, j) !== 1) { sx += i + 0.5; sy += j + 0.5; n++; }
  const cx = n ? sx / n : HW / 2, cy = n ? sy / n : HH / 2;

  const fits = (i, j, w, h, halo) => {
    if (i < 0 || j < 0 || i + w > HW || j + h > HH) return false;
    for (let y = j; y < j + h; y++) for (let x = i; x < i + w; x++) if (occ[y * HW + x]) return false;
    if (halo) for (let y = j - 1; y <= j + h; y++) for (let x = i - 1; x <= i + w; x++) {
      if (x < 0 || y < 0 || x >= HW || y >= HH) continue;
      if (occ[y * HW + x] === 3) return false;
    }
    return true;
  };
  // candidate spots against one wall; a back wall lined with closets moves inward to the closets' front
  const wallCands = (wall, iw, id) => {
    const out = [];
    if (wall === 'N' || wall === 'S') {
      for (let i = 0; i + iw <= HW; i++) {
        for (let k = 0; k <= Math.floor(HH / 2); k++) {
          const j = wall === 'N' ? k : HH - id - k;
          if (j < 0 || j + id > HH) break;
          let blocked = false;
          for (let x = i; x < i + iw && !blocked; x++) for (let y = j; y < j + id; y++) if (at(x, y) === 1) blocked = true;
          if (!blocked) { out.push({ i, j, w: iw, h: id, rot: wall === 'N' ? 0 : 180, along: i, span: HW - iw }); break; }
        }
      }
    } else {
      for (let j = 0; j + iw <= HH; j++) out.push({ i: wall === 'W' ? 0 : HW - id, j, w: id, h: iw, rot: wall === 'W' ? 270 : 90, along: j, span: HH - iw });
    }
    return out;
  };
  const sides = ['W', 'E'];
  const nearBack = c => (back === 'N' ? c.j : HH - c.j - c.h);
  const items = [], decals = [];
  const put = (k, c, extra = {}) => { set(c.i, c.j, c.w, c.h, 3); items.push({ k, x: r.x + c.i / 2, y: r.y + c.j / 2, w: c.w / 2, h: c.h / 2, rot: c.rot, ...extra }); };
  const mid = c => Math.abs(c.along - c.span / 2);

  for (const [k, where, w0, d0, o = {}] of FURN[kind] || []) {
    const count = o.n || 1;
    if (o.unless && items.some(it => [].concat(o.unless).includes(it.k))) continue; // fallback for rooms too small for the main piece
    let placedN = 0;
    for (let w = w0, d = d0; placedN < count && w >= 1 && d >= 1;) {
      let cands = [];
      if (where === 'decal') {
        const dw = Math.min(w, HW - 2), dd = Math.min(d, HH - 2);
        if (dw >= 2 && dd >= 2) decals.push({ k, x: r.x + Math.max(1, Math.round(cx - dw / 2)) / 2, y: r.y + Math.max(1, Math.round(cy - dd / 2)) / 2, w: dw / 2, h: dd / 2, rot: back === 'N' ? 0 : 180 });
        break;
      }
      if (where === 'full') {
        const c = wallCands(back, HW, d)[0];
        if (c && fits(c.i, c.j, c.w, c.h)) { put(k, c); }
        break;
      }
      if (where === 'back') cands = wallCands(back, w, d).sort((a, c) => mid(a) - mid(c));
      else if (where === 'corner') cands = [back, ...sides].flatMap(s => wallCands(s, w, d)).sort((a, c) => Math.min(a.along, a.span - a.along) - Math.min(c.along, c.span - c.along));
      else if (where === 'wall') cands = [...wallCands(back, w, d).sort((a, c) => mid(a) - mid(c)), ...sides.flatMap(s => wallCands(s, w, d)).sort((a, c) => nearBack(a) - nearBack(c))];
      else if (where === 'side') cands = shuffleR(rng, sides).flatMap(s => wallCands(s, w, d).sort((a, c) => nearBack(a) - nearBack(c)));
      else if (where === 'row') cands = [...wallCands(back, w, d), ...(o.sides ? sides.flatMap(s => wallCands(s, w, d).sort((a, c) => nearBack(a) - nearBack(c))) : [])];
      else if (where === 'fill') cands = shuffleR(rng, [back, ...sides].flatMap(s => wallCands(s, w, d))).sort((a, c) => Math.min(a.along, a.span - a.along) - Math.min(c.along, c.span - c.along));
      else if (where === 'center') {
        const rot = back === 'N' ? 0 : 180;
        for (let j = 0; j + d <= HH; j++) for (let i = 0; i + w <= HW; i++) cands.push({ i, j, w, h: d, rot });
        const dist = c => Math.hypot(c.i + c.w / 2 - cx, (c.j + c.h / 2 - cy) * 1.2);
        // one item: as central as possible; several (pews, desks, card tables): rows packed from the back wall
        if (count > 1) cands.sort((a, c) => nearBack(a) - nearBack(c) || Math.abs(a.i + a.w / 2 - cx) - Math.abs(c.i + c.w / 2 - cx));
        else cands.sort((a, c) => dist(a) - dist(c));
      }
      const halo = where === 'center' || where === 'fill';
      const c = cands.find(q => fits(q.i, q.j, q.w, q.h, halo));
      if (c) { put(k, c); placedN++; if (where === 'back' || where === 'full') break; continue; }
      if (!o.shrink) break;
      if (w > d) w -= 2; else d -= 2; // try a smaller version (a shorter table, a smaller circle)
      if (w < 2 || d < 1) break;
    }
  }
  const nookItems = nooks.map(k => ({ k: NOOK_ITEM[k.n.kind] || 'crates', kind: k.n.kind, x: k.x, y: k.y, w: k.w, h: k.h, rot: back === 'N' ? 0 : 180, wet: WET_NOOK.has(k.n.kind) }));
  // label spot: the free 1x1 square nearest the middle
  let label = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  if (r.cut) { const q = roomRects(r).find(q => q.w === r.w); label = { x: q.x + q.w / 2, y: q.y + q.h / 2 }; }
  let best = Infinity;
  for (let j = 0; j + 2 <= HH; j++) for (let i = 0; i + 2 <= HW; i++) {
    let ok = true; for (let y = j; y < j + 2 && ok; y++) for (let x = i; x < i + 2; x++) if (occ[y * HW + x] === 1 || occ[y * HW + x] === 3) { ok = false; break; }
    if (!ok) continue;
    const dd = Math.hypot(i + 1 - cx, j + 1 - cy);
    if (dd < best) { best = dd; label = { x: r.x + (i + 1) / 2, y: r.y + (j + 1) / 2 }; }
  }
  return { kind, items, decals, nookItems, label };
}

// furnishing key for one drawn room (the rooms of a split facility are furnished separately)
const rkey = r => (r.part ? `${r.ref}#${r.part}` : r.ref);
const _furnCache = new Map();
function furnishFloor(b, L, fi) {
  const f = L.fl[fi];
  const key = JSON.stringify([L.seed, L.sig, fi, b.nooks || [], f.rooms.map(r => [rkey(r), r.x, r.y, r.w, r.h, r.cut]), f.plots.map(r => [r.ref, r.x, r.y, r.w, r.h])]);
  if (_furnCache.has(key)) return _furnCache.get(key);
  const out = new Map();
  for (const r of f.rooms) out.set(rkey(r), furnishRoom(b, r, f, L.seed, false));
  for (const r of f.plots) out.set(r.ref, furnishRoom(b, r, f, L.seed, true));
  if (_furnCache.size > 40) _furnCache.clear();
  _furnCache.set(key, out);
  return out;
}

// ---------------- drawing helpers ----------------
const WOOD = '#7a4f2c', WOOD_D = '#4c2f18', WOOD_L = '#a3703f', STONE = '#8d8780', STONE_D = '#5b5650', IRON = '#45484d', GOLD = '#c9a24a';
const CLOTH = ['#8c2f2f', '#2f4a86', '#3f6b3a', '#6b3f7a', '#8a6a2a', '#2f6f70'];
const BOOKS = ['#7b2b25', '#2d4b7a', '#3d6a3a', '#7a5a22', '#5a2f6a', '#2f2f2f', '#8a7a5a', '#a0522d'];
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function shadowOn(g, u) { g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = u * 0.16; g.shadowOffsetX = u * 0.05; g.shadowOffsetY = u * 0.09; }
function shadowOff(g) { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0; }
function rrect(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); else g.rect(x, y, w, h); }
function blk(g, u, x, y, w, h, fill, o = {}) {
  if (o.sh) shadowOn(g, u);
  rrect(g, x, y, w, h, o.r ?? u * 0.05); g.fillStyle = fill; g.fill();
  if (o.sh) shadowOff(g);
  if (o.line !== false) { g.strokeStyle = o.line || shade(fill, -0.45); g.lineWidth = o.lw || Math.max(1, u * 0.035); g.stroke(); }
}
function disc(g, u, x, y, rad, fill, o = {}) {
  if (o.sh) shadowOn(g, u);
  g.beginPath(); g.arc(x, y, Math.max(0.5, rad), 0, Math.PI * 2); g.fillStyle = fill; g.fill();
  if (o.sh) shadowOff(g);
  if (o.line !== false) { g.strokeStyle = o.line || shade(fill, -0.45); g.lineWidth = o.lw || Math.max(1, u * 0.03); g.stroke(); }
}
function glow(g, x, y, rad, color) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}
function grain(g, u, x, y, w, h, color, vertical) { // wood grain lines on a plank surface
  g.strokeStyle = color; g.lineWidth = Math.max(0.5, u * 0.015); g.beginPath();
  const step = u * 0.12;
  if (vertical) for (let a = x + step; a < x + w; a += step) { g.moveTo(a, y + 1); g.lineTo(a, y + h - 1); }
  else for (let a = y + step; a < y + h; a += step) { g.moveTo(x + 1, a); g.lineTo(x + w - 1, a); }
  g.stroke();
}
function chair(g, u, x, y, rot) { // x,y = centre; rot: which way the backrest is (0 = top)
  const s = u * 0.42;
  g.save(); g.translate(x, y); g.rotate(rot * Math.PI / 180);
  blk(g, u, -s / 2, -s / 2, s, s, WOOD_L, { sh: true, r: u * 0.05 });
  blk(g, u, -s / 2, -s / 2, s, s * 0.22, WOOD_D, { r: u * 0.03 });
  g.restore();
}
function candle(g, u, x, y) { glow(g, x, y, u * 0.35, 'rgba(255,200,90,.45)'); disc(g, u, x, y, u * 0.05, '#f3ead2', { line: '#b8a780' }); disc(g, u, x, y, u * 0.02, '#ffcc55', { line: false }); }
function book(g, u, x, y, w, h, c) { blk(g, u, x, y, w, h, c, { r: u * 0.02 }); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x + w * 0.12, y + h * 0.15, w * 0.76, h * 0.7); }

// Each drawer paints one item in its own frame: (0,0)-(w,h), the top edge against the wall.
const DRAW = {
  bedSide(g, w, h, u, R) { g.save(); g.translate(w, 0); g.rotate(Math.PI / 2); DRAW.bed(g, h, w, u, R); g.restore(); },
  bed2(g, w, h, u, R) { DRAW.bed(g, w, h, u, R, true); },
  bed(g, w, h, u, R, dbl) {
    blk(g, u, 0, 0, w, h, WOOD_D, { sh: true });
    blk(g, u, w * 0.07, h * 0.06, w * 0.86, h * 0.9, '#ece4d0', { line: '#b9ad92' });
    const np = dbl ? 2 : 1, pw = (w * 0.78 - (np - 1) * w * 0.06) / np;
    for (let i = 0; i < np; i++) blk(g, u, w * 0.11 + i * (pw + w * 0.06), h * 0.09, pw, h * 0.15, '#fbf8ef', { r: u * 0.08, line: '#c9bfa8' });
    const c = CLOTH[Math.floor(R() * CLOTH.length)];
    blk(g, u, w * 0.05, h * 0.33, w * 0.9, h * 0.63, c, { r: u * 0.05 });
    g.fillStyle = shade(c, 0.22); g.fillRect(w * 0.05, h * 0.33, w * 0.9, h * 0.07);
    g.strokeStyle = shade(c, -0.25); g.lineWidth = Math.max(1, u * 0.02); g.beginPath(); g.moveTo(w * 0.2, h * 0.55); g.lineTo(w * 0.8, h * 0.62); g.stroke();
  },
  bunk(g, w, h, u, R) {
    DRAW.bed(g, w, h, u, R, false);
    g.strokeStyle = WOOD_D; g.lineWidth = Math.max(1.5, u * 0.07); g.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.94);
    g.lineWidth = Math.max(1, u * 0.04); g.beginPath(); for (let i = 1; i <= 3; i++) { g.moveTo(w * 0.96, h * (0.55 + i * 0.1)); g.lineTo(w, h * (0.55 + i * 0.1)); } g.stroke();
  },
  nightstand(g, w, h, u) { blk(g, u, w * 0.1, h * 0.1, w * 0.8, h * 0.8, WOOD, { sh: true }); candle(g, u, w * 0.5, h * 0.5); },
  wardrobe(g, w, h, u) {
    blk(g, u, 0, 0, w, h * 0.95, WOOD, { sh: true }); grain(g, u, 0, 0, w, h * 0.95, shade(WOOD, -0.2), true);
    g.strokeStyle = WOOD_D; g.lineWidth = Math.max(1, u * 0.04); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h * 0.95); g.stroke();
    disc(g, u, w * 0.44, h * 0.6, u * 0.035, GOLD); disc(g, u, w * 0.56, h * 0.6, u * 0.035, GOLD);
  },
  chest(g, w, h, u) {
    blk(g, u, w * 0.05, h * 0.05, w * 0.9, h * 0.85, WOOD, { sh: true }); grain(g, u, w * 0.05, h * 0.05, w * 0.9, h * 0.85, shade(WOOD, -0.18), false);
    g.fillStyle = IRON; g.fillRect(w * 0.22, h * 0.05, w * 0.06, h * 0.85); g.fillRect(w * 0.72, h * 0.05, w * 0.06, h * 0.85);
    blk(g, u, w * 0.45, h * 0.6, w * 0.1, h * 0.22, GOLD, { r: 1 });
  },
  desk(g, w, h, u, R) {
    blk(g, u, 0, 0, w, h * 0.55, WOOD, { sh: true }); grain(g, u, 0, 0, w, h * 0.55, shade(WOOD, -0.18), false);
    g.save(); g.translate(w * 0.3, h * 0.25); g.rotate((R() - 0.5) * 0.4); g.fillStyle = '#efe6cc'; g.fillRect(-u * 0.18, -u * 0.13, u * 0.36, u * 0.26); g.restore();
    book(g, u, w * 0.62, h * 0.12, u * 0.3, u * 0.22, BOOKS[Math.floor(R() * BOOKS.length)]);
    candle(g, u, w * 0.88, h * 0.14);
    chair(g, u, w * 0.5, h * 0.78, 180);
  },
  chartTable(g, w, h, u, R) { DRAW.desk(g, w, h, u, R); g.fillStyle = 'rgba(40,60,120,.55)'; g.beginPath(); g.arc(w * 0.3, h * 0.25, u * 0.12, 0, 7); g.fill(); },
  bookshelf(g, w, h, u, R) {
    blk(g, u, 0, 0, w, h, WOOD_D, { sh: true });
    let x = w * 0.04;
    while (x < w * 0.96) { const bw = u * (0.05 + R() * 0.05); g.fillStyle = BOOKS[Math.floor(R() * BOOKS.length)]; g.fillRect(x, h * 0.18, Math.min(bw, w * 0.96 - x), h * (0.55 + R() * 0.25)); x += bw + u * 0.008; }
  },
  stack(g, w, h, u, R) { DRAW.bookshelf(g, w, h / 2, u, R); g.save(); g.translate(w, h); g.rotate(Math.PI); DRAW.bookshelf(g, w, h / 2, u, R); g.restore(); },
  shelf(g, w, h, u, R) {
    blk(g, u, 0, 0, w, h, WOOD, { sh: true });
    for (let x = w * 0.08; x < w * 0.92; x += u * 0.22) {
      const t = R();
      if (t < 0.4) disc(g, u, x + u * 0.08, h * 0.5, u * 0.08, ['#6b8a9a', '#9a6b4a', '#8a8a6a'][Math.floor(R() * 3)]);
      else if (t < 0.75) blk(g, u, x, h * 0.25, u * 0.16, h * 0.5, '#b08a5a', { r: 1 });
      else disc(g, u, x + u * 0.08, h * 0.5, u * 0.07, '#d8c8a0');
    }
  },
  pantry(g, w, h, u, R) { DRAW.shelf(g, w, h * 0.5, u, R); DRAW.sacks(g, w, h * 0.5, u, R, h * 0.5); },
  counter(g, w, h, u, R) {
    blk(g, u, 0, 0, w, h, WOOD_L, { sh: true }); grain(g, u, 0, 0, w, h, shade(WOOD_L, -0.15), true);
    disc(g, u, w * 0.2, h * 0.5, u * 0.11, '#c8a060'); disc(g, u, w * 0.45, h * 0.5, u * 0.09, '#9a9a9a'); blk(g, u, w * 0.65, h * 0.25, u * 0.3, h * 0.5, '#d9c9a4', { r: 2 });
  },
  hearth(g, w, h, u) {
    blk(g, u, 0, 0, w, h, STONE, { sh: true });
    blk(g, u, w * 0.2, h * 0.05, w * 0.6, h * 0.65, '#221a14');
    glow(g, w * 0.5, h * 0.4, u * 0.7, 'rgba(255,140,40,.8)');
    disc(g, u, w * 0.5, h * 0.42, u * 0.22, '#222', { line: '#555' }); disc(g, u, w * 0.5, h * 0.42, u * 0.16, '#6a5a3a', { line: false });
  },
  fireplace(g, w, h, u) {
    blk(g, u, 0, 0, w, h, STONE, { sh: true });
    blk(g, u, w * 0.25, 0, w * 0.5, h * 0.8, '#1d1612');
    glow(g, w * 0.5, h * 0.4, u * 0.6, 'rgba(255,130,40,.85)');
    g.fillStyle = '#ffcf6a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.4, u * 0.18, u * 0.1, 0, 0, 7); g.fill();
  },
  worktable(g, w, h, u, R) {
    blk(g, u, 0, 0, w, h, WOOD, { sh: true }); grain(g, u, 0, 0, w, h, shade(WOOD, -0.18), false);
    blk(g, u, w * 0.15, h * 0.3, u * 0.3, u * 0.15, '#9a9a9a', { r: 1 }); disc(g, u, w * 0.6, h * 0.5, u * 0.1, '#c9a46a'); disc(g, u, w * 0.8, h * 0.4, u * 0.07, '#8a4a3a');
  },
  workbench(g, w, h, u, R) { DRAW.worktable(g, w, h * 0.7, u, R); g.fillStyle = IRON; g.fillRect(w * 0.1, h * 0.72, w * 0.8, h * 0.06); },
  toolRack(g, w, h, u) {
    blk(g, u, 0, 0, w, h * 0.6, WOOD_D, { sh: true });
    g.strokeStyle = '#aaa'; g.lineWidth = Math.max(1, u * 0.04); g.beginPath();
    for (let x = w * 0.1; x < w * 0.9; x += u * 0.2) { g.moveTo(x, h * 0.1); g.lineTo(x, h * 0.85); } g.stroke();
  },
  barrels(g, w, h, u) { const r = Math.min(w, h) * 0.24; [[0.3, 0.3], [0.7, 0.32], [0.48, 0.72]].forEach(([a, c]) => DRAW.barrel(g, w * a, h * c, r, u)); },
  barrel(g, x, y, r, u) {
    disc(g, u, x, y, r, WOOD, { sh: true, line: WOOD_D });
    g.strokeStyle = IRON; g.lineWidth = Math.max(1, u * 0.035); g.beginPath(); g.arc(x, y, r * 0.78, 0, 7); g.stroke();
    disc(g, u, x, y, r * 0.45, WOOD_L, { line: shade(WOOD_L, -0.3) });
  },
  quench(g, w, h, u) { DRAW.barrel(g, w / 2, h / 2, Math.min(w, h) * 0.42, u); disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.3, '#3d6a8a', { line: false }); },
  crates(g, w, h, u, R) {
    const one = (x, y, s) => { blk(g, u, x, y, s, s, '#a07a48', { sh: true }); g.strokeStyle = '#6a4a28'; g.lineWidth = Math.max(1, u * 0.04); g.strokeRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8); g.beginPath(); g.moveTo(x + s * 0.1, y + s * 0.1); g.lineTo(x + s * 0.9, y + s * 0.9); g.stroke(); };
    const s = Math.min(w, h) * 0.55; one(w * 0.05, h * 0.05, s); if (R() < 0.8) one(w * 0.4, h * 0.38, s);
  },
  sacks(g, w, h, u, R, y0 = 0) {
    const n = Math.max(2, Math.round(w / (u * 0.4)));
    for (let i = 0; i < n; i++) { g.save(); g.translate(w * (i + 0.5) / n, y0 + h * 0.5); g.rotate((R() - 0.5) * 0.6); disc(g, u, 0, 0, Math.min(w / n, h) * 0.45, '#cdb88a', { sh: true, line: '#8a7650' }); g.restore(); }
  },
  rug(g, w, h, u, R) {
    const c = CLOTH[Math.floor(R() * CLOTH.length)];
    blk(g, u, 0, 0, w, h, c, { r: 2, line: shade(c, -0.4) });
    g.strokeStyle = GOLD; g.lineWidth = Math.max(1, u * 0.05); g.strokeRect(u * 0.12, u * 0.12, w - u * 0.24, h - u * 0.24);
    g.strokeStyle = shade(c, 0.25); g.lineWidth = Math.max(1, u * 0.03); g.strokeRect(u * 0.24, u * 0.24, w - u * 0.48, h - u * 0.48);
    g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.18, h * 0.18, 0, 0, 7); g.stroke();
  },
  runner(g, w, h, u) { DRAW.rug(g, w, h, u, () => 0); },
  longTable(g, w, h, u) {
    const tw = w * 0.5, tx = (w - tw) / 2;
    const n = Math.max(1, Math.floor((h - u * 0.4) / (u * 0.7)));
    for (let i = 0; i < n; i++) { const y = u * 0.35 + (i + 0.5) * (h - u * 0.7) / n; chair(g, u, tx - u * 0.18, y, 270); chair(g, u, tx + tw + u * 0.18, y, 90); }
    blk(g, u, tx, u * 0.15, tw, h - u * 0.3, WOOD, { sh: true }); grain(g, u, tx, u * 0.15, tw, h - u * 0.3, shade(WOOD, -0.18), true);
    for (let i = 0; i < n; i++) { const y = u * 0.35 + (i + 0.5) * (h - u * 0.7) / n; disc(g, u, tx + tw * 0.25, y, u * 0.09, '#e8e2d2'); disc(g, u, tx + tw * 0.75, y, u * 0.09, '#e8e2d2'); }
    candle(g, u, w / 2, h / 2);
  },
  table(g, w, h, u) {
    const s = Math.min(w, h) * 0.5;
    chair(g, u, w / 2, h / 2 - s / 2 - u * 0.15, 0); chair(g, u, w / 2, h / 2 + s / 2 + u * 0.15, 180);
    chair(g, u, w / 2 - s / 2 - u * 0.15, h / 2, 270); chair(g, u, w / 2 + s / 2 + u * 0.15, h / 2, 90);
    blk(g, u, w / 2 - s / 2, h / 2 - s / 2, s, s, WOOD, { sh: true }); grain(g, u, w / 2 - s / 2, h / 2 - s / 2, s, s, shade(WOOD, -0.18), false);
  },
  roundTable(g, w, h, u, R, felt) {
    const r = Math.min(w, h) * 0.26, n = 5;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + R(); chair(g, u, w / 2 + Math.cos(a) * (r + u * 0.2), h / 2 + Math.sin(a) * (r + u * 0.2), a * 180 / Math.PI + 90); }
    disc(g, u, w / 2, h / 2, r, felt ? '#2f6a3a' : WOOD, { sh: true });
    if (felt) { g.strokeStyle = WOOD_D; g.lineWidth = Math.max(1.5, u * 0.07); g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); for (let i = 0; i < 4; i++) disc(g, u, w / 2 + (R() - 0.5) * r, h / 2 + (R() - 0.5) * r, u * 0.05, ['#c33', '#33c', '#eee', GOLD][i]); }
    else { disc(g, u, w / 2 - r * 0.3, h / 2, u * 0.08, '#c8b090'); disc(g, u, w / 2 + r * 0.3, h / 2 + r * 0.2, u * 0.07, '#8a3a2a'); }
  },
  cardTable(g, w, h, u, R) { DRAW.roundTable(g, w, h, u, R, true); },
  readingTable(g, w, h, u, R) { DRAW.table(g, w, h, u, R); book(g, u, w / 2 - u * 0.2, h / 2 - u * 0.12, u * 0.32, u * 0.24, BOOKS[1]); candle(g, u, w / 2 + u * 0.2, h / 2 + u * 0.1); },
  seating(g, w, h, u, R) {
    const c = CLOTH[Math.floor(R() * CLOTH.length)];
    // sofa on the hall side facing the fireplace, armchairs either side, a low table between
    blk(g, u, w * 0.18, h * 0.72, w * 0.64, h * 0.26, shade(c, -0.15), { sh: true });
    blk(g, u, w * 0.22, h * 0.72, w * 0.56, h * 0.12, c, { line: false });
    DRAW.armchairAt(g, u, w * 0.1, h * 0.38, 270, c); DRAW.armchairAt(g, u, w * 0.9, h * 0.38, 90, c);
    blk(g, u, w * 0.33, h * 0.3, w * 0.34, h * 0.28, WOOD, { sh: true, r: u * 0.1 });
    candle(g, u, w * 0.5, h * 0.44);
  },
  armchairAt(g, u, x, y, rot, c) {
    g.save(); g.translate(x, y); g.rotate(rot * Math.PI / 180);
    blk(g, u, -u * 0.36, -u * 0.34, u * 0.72, u * 0.68, shade(c, -0.15), { sh: true, r: u * 0.12 });
    blk(g, u, -u * 0.24, -u * 0.14, u * 0.48, u * 0.42, c, { r: u * 0.08, line: false });
    g.restore();
  },
  armchair(g, w, h, u, R) { DRAW.armchairAt(g, u, w / 2, h / 2, 180, CLOTH[Math.floor(R() * CLOTH.length)]); },
  plant(g, w, h, u, R) {
    disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.32, '#8a5a3a', { sh: true });
    for (let i = 0; i < 6; i++) { const a = i / 6 * 7 + R(); disc(g, u, w / 2 + Math.cos(a) * u * 0.1, h / 2 + Math.sin(a) * u * 0.1, u * 0.1, ['#3f7a34', '#4f8a3c', '#2f6a2a'][i % 3], { line: false }); }
  },
  tree(g, w, h, u, R) {
    const r = Math.min(w, h) * 0.46;
    shadowOn(g, u); disc(g, u, w / 2, h / 2, r, '#2f5a26', { line: false }); shadowOff(g);
    for (let i = 0; i < 9; i++) { const a = R() * 7, d = R() * r * 0.6; disc(g, u, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, r * (0.3 + R() * 0.25), ['#3d7030', '#4a8238', '#356628'][i % 3], { line: false }); }
  },
  planter(g, w, h, u, R) {
    blk(g, u, 0, 0, w, h, '#6a4a2a', { sh: true }); blk(g, u, w * 0.06, h * 0.12, w * 0.88, h * 0.76, '#4a3420', { line: false });
    for (let x = u * 0.2; x < w - u * 0.1; x += u * 0.3) for (let y = h * 0.3; y < h * 0.85; y += u * 0.3) disc(g, u, x, y, u * 0.11, ['#4f8a3c', '#6a9a3c', '#3f7a34'][Math.floor(R() * 3)], { line: false });
  },
  bench(g, w, h, u) { blk(g, u, w * 0.04, h * 0.15, w * 0.92, h * 0.7, WOOD_L, { sh: true }); grain(g, u, w * 0.04, h * 0.15, w * 0.92, h * 0.7, shade(WOOD_L, -0.2), false); },
  pew(g, w, h, u) { blk(g, u, 0, h * 0.1, w, h * 0.8, WOOD, { sh: true }); blk(g, u, 0, h * 0.1, w, h * 0.25, WOOD_D, { line: false }); },
  seats(g, w, h, u) { const n = Math.max(1, Math.floor(w / (u * 0.55))); for (let i = 0; i < n; i++) chair(g, u, (i + 0.5) * w / n, h / 2, 180); },
  stage(g, w, h, u) {
    blk(g, u, 0, 0, w, h, WOOD_L, { sh: true }); grain(g, u, 0, 0, w, h, shade(WOOD_L, -0.15), true);
    blk(g, u, 0, 0, w, h * 0.22, '#7a1f24', { line: '#4a1014' });
    g.strokeStyle = '#5a1418'; g.lineWidth = Math.max(1, u * 0.03); g.beginPath(); for (let x = u * 0.2; x < w; x += u * 0.25) { g.moveTo(x, 0); g.lineTo(x, h * 0.22); } g.stroke();
    for (let x = u * 0.5; x < w; x += u * 1.5) candle(g, u, x, h * 0.9);
  },
  bar(g, w, h, u) {
    // back shelf of bottles against the wall, counter, stools on the customer side
    blk(g, u, 0, 0, w, h * 0.25, WOOD_D, { sh: true });
    for (let x = u * 0.15; x < w - u * 0.1; x += u * 0.18) disc(g, u, x, h * 0.12, u * 0.05, ['#3a6a3a', '#7a3a2a', '#d8c8a0', '#3a3a6a'][Math.floor(x / u * 7) % 4], { line: false });
    blk(g, u, 0, h * 0.4, w, h * 0.25, WOOD_L, { sh: true }); grain(g, u, 0, h * 0.4, w, h * 0.25, shade(WOOD_L, -0.18), true);
    for (let x = u * 0.4; x < w; x += u * 0.75) disc(g, u, x, h * 0.85, u * 0.14, WOOD, { sh: true });
  },
  fountain(g, w, h, u) {
    const r = Math.min(w, h) * 0.46;
    disc(g, u, w / 2, h / 2, r, STONE, { sh: true }); disc(g, u, w / 2, h / 2, r * 0.82, '#3f7a9a', { line: false });
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1, u * 0.03);
    for (const k of [0.35, 0.55, 0.72]) { g.beginPath(); g.arc(w / 2, h / 2, r * k, 0, 7); g.stroke(); }
    disc(g, u, w / 2, h / 2, r * 0.18, STONE);
  },
  circle(g, w, h, u, R, color = 'rgba(150,110,255,') {
    const r = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2;
    glow(g, cx, cy, r * 1.1, color + '.30)');
    g.strokeStyle = color + '.95)'; g.lineWidth = Math.max(1.5, u * 0.06);
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, r * 0.8, 0, 7); g.stroke();
    g.lineWidth = Math.max(1, u * 0.04); g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2, b2 = a + Math.PI * 2 / 3; g.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); g.lineTo(cx + Math.cos(b2) * r * 0.8, cy + Math.sin(b2) * r * 0.8); }
    g.stroke();
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.fillStyle = color + '.9)'; g.fillRect(cx + Math.cos(a) * r * 0.9 - u * 0.03, cy + Math.sin(a) * r * 0.9 - u * 0.03, u * 0.06, u * 0.06); }
  },
  teleCircle(g, w, h, u, R) { DRAW.circle(g, w, h, u, R, 'rgba(80,220,255,'); },
  ring(g, w, h, u) { g.strokeStyle = '#8a6a3a'; g.lineWidth = Math.max(1.5, u * 0.08); g.setLineDash([u * 0.3, u * 0.15]); g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.46, h * 0.46, 0, 0, 7); g.stroke(); g.setLineDash([]); },
  pedestal(g, w, h, u, R) {
    blk(g, u, w * 0.08, h * 0.08, w * 0.84, h * 0.84, STONE, { sh: true });
    glow(g, w / 2, h / 2, u * 0.4, 'rgba(255,220,120,.6)'); disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.18, R() < 0.5 ? GOLD : '#7ac8e8');
  },
  altar(g, w, h, u) {
    blk(g, u, 0, h * 0.1, w, h * 0.7, '#d8d2c6', { sh: true });
    blk(g, u, w * 0.38, h * 0.1, w * 0.24, h * 0.7, '#7a1f24', { line: false });
    candle(g, u, w * 0.15, h * 0.45); candle(g, u, w * 0.85, h * 0.45); disc(g, u, w / 2, h * 0.45, u * 0.1, GOLD);
  },
  shrine(g, w, h, u) { blk(g, u, w * 0.05, h * 0.1, w * 0.9, h * 0.8, WOOD_D, { sh: true }); candle(g, u, w * 0.3, h * 0.5); candle(g, u, w * 0.7, h * 0.5); disc(g, u, w / 2, h * 0.5, u * 0.08, GOLD); },
  cushion(g, w, h, u) { disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.36, '#7a3a6a', { sh: true }); disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.2, '#9a5a8a', { line: false }); },
  candles(g, w, h, u) { candle(g, u, w * 0.3, h * 0.35); candle(g, u, w * 0.65, h * 0.4); candle(g, u, w * 0.45, h * 0.7); },
  brazier(g, w, h, u) { disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.38, IRON, { sh: true }); glow(g, w / 2, h / 2, u * 0.6, 'rgba(255,140,40,.7)'); disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.22, '#ff9a3a', { line: '#a04010' }); },
  cauldron(g, w, h, u) { disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.42, '#1f1f1f', { sh: true, line: '#555' }); disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.32, '#5aa04a', { line: false }); glow(g, w / 2, h / 2, u * 0.5, 'rgba(120,255,90,.35)'); },
  alchemy(g, w, h, u, R) {
    blk(g, u, 0, 0, w, h * 0.8, WOOD, { sh: true });
    for (let i = 0; i < 6; i++) { const x = w * (0.12 + i * 0.15), y = h * (0.25 + (i % 2) * 0.3); disc(g, u, x, y, u * 0.07, ['#e05050', '#50a0e0', '#60d060', '#d0a030', '#a060e0', '#e0e0e0'][i], { line: '#333' }); }
  },
  forge(g, w, h, u) {
    blk(g, u, 0, 0, w, h * 0.8, STONE_D, { sh: true });
    blk(g, u, w * 0.15, h * 0.15, w * 0.7, h * 0.45, '#2a1a12');
    glow(g, w / 2, h * 0.38, u * 0.8, 'rgba(255,110,30,.9)');
    for (let i = 0; i < 7; i++) disc(g, u, w * (0.25 + (i % 4) * 0.17), h * (0.28 + Math.floor(i / 4) * 0.15), u * 0.06, '#ffb040', { line: false });
  },
  anvil(g, w, h, u) {
    shadowOn(g, u); g.fillStyle = '#3a3d42'; g.beginPath();
    g.moveTo(w * 0.05, h * 0.3); g.lineTo(w * 0.75, h * 0.3); g.quadraticCurveTo(w, h * 0.5, w * 0.75, h * 0.7); g.lineTo(w * 0.05, h * 0.7); g.closePath(); g.fill(); shadowOff(g);
    g.strokeStyle = '#6a6d72'; g.lineWidth = Math.max(1, u * 0.03); g.stroke();
  },
  weaponRack(g, w, h, u) {
    blk(g, u, 0, h * 0.1, w, h * 0.35, WOOD_D, { sh: true });
    g.lineWidth = Math.max(1.5, u * 0.05);
    for (let x = w * 0.1; x < w * 0.92; x += u * 0.25) { g.strokeStyle = '#c8ccd2'; g.beginPath(); g.moveTo(x, h * 0.05); g.lineTo(x, h * 0.85); g.stroke(); g.strokeStyle = WOOD_L; g.beginPath(); g.moveTo(x - u * 0.06, h * 0.6); g.lineTo(x + u * 0.06, h * 0.6); g.stroke(); }
  },
  armorStand(g, w, h, u) {
    disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.4, WOOD_D, { sh: true });
    blk(g, u, w * 0.22, h * 0.32, w * 0.56, h * 0.36, '#9aa0a8', { r: u * 0.15 }); disc(g, u, w / 2, h / 2, u * 0.13, '#b8bec6');
  },
  trophyHead(g, w, h, u) {
    blk(g, u, w * 0.15, 0, w * 0.7, h * 0.5, WOOD, { sh: true }); disc(g, u, w / 2, h * 0.55, u * 0.16, '#7a5a3a');
    g.strokeStyle = '#e8dcc0'; g.lineWidth = Math.max(1, u * 0.04); g.beginPath(); g.moveTo(w * 0.4, h * 0.5); g.lineTo(w * 0.1, h * 0.15); g.moveTo(w * 0.6, h * 0.5); g.lineTo(w * 0.9, h * 0.15); g.stroke();
  },
  display(g, w, h, u, R) {
    blk(g, u, w * 0.1, h * 0.1, w * 0.8, h * 0.8, WOOD_D, { sh: true });
    blk(g, u, w * 0.17, h * 0.17, w * 0.66, h * 0.66, 'rgba(190,225,240,.6)', { line: '#e0f0f8' });
    disc(g, u, w / 2, h / 2, u * 0.13, [GOLD, '#c03030', '#8a8a8a'][Math.floor(R() * 3)]);
  },
  statue(g, w, h, u) { blk(g, u, w * 0.1, h * 0.1, w * 0.8, h * 0.8, STONE, { sh: true }); disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.25, '#b0aba4'); disc(g, u, w / 2, h * 0.42, u * 0.1, '#c8c3bc'); },
  mapTable(g, w, h, u, R) {
    const tw = w * 0.7, th = h * 0.56, tx = (w - tw) / 2, ty = (h - th) / 2;
    for (let x = tx + u * 0.35; x < tx + tw - u * 0.2; x += u * 0.7) { chair(g, u, x, ty - u * 0.2, 0); chair(g, u, x, ty + th + u * 0.2, 180); }
    chair(g, u, tx - u * 0.2, h / 2, 270); chair(g, u, tx + tw + u * 0.2, h / 2, 90);
    blk(g, u, tx, ty, tw, th, WOOD_D, { sh: true });
    blk(g, u, tx + u * 0.15, ty + u * 0.15, tw - u * 0.3, th - u * 0.3, '#d8c79a', { line: '#8a7a50' });
    g.strokeStyle = '#6a5a3a'; g.lineWidth = Math.max(1, u * 0.025); g.beginPath(); g.moveTo(tx + tw * 0.2, ty + th * 0.7); g.bezierCurveTo(tx + tw * 0.4, ty + th * 0.2, tx + tw * 0.6, ty + th * 0.9, tx + tw * 0.85, ty + th * 0.35); g.stroke();
    for (let i = 0; i < 5; i++) disc(g, u, tx + tw * (0.2 + R() * 0.6), ty + th * (0.25 + R() * 0.5), u * 0.05, i % 2 ? '#3050c0' : '#c03030');
  },
  banner(g, w, h, u, R) { const c = CLOTH[Math.floor(R() * CLOTH.length)]; blk(g, u, w * 0.15, 0, w * 0.7, h * 0.9, c, { sh: true }); g.fillStyle = GOLD; g.fillRect(w * 0.15, 0, w * 0.7, h * 0.15); },
  telescope(g, w, h, u) {
    const r = Math.min(w, h) * 0.46; disc(g, u, w / 2, h / 2, r, STONE_D, { sh: true });
    g.strokeStyle = '#8a7a50'; g.lineWidth = Math.max(1, u * 0.03); g.beginPath(); g.arc(w / 2, h / 2, r * 0.85, 0, 7); g.stroke();
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.7); blk(g, u, -u * 0.12, -r * 0.95, u * 0.24, r * 1.3, '#b08a3a', { sh: true, r: u * 0.08 }); disc(g, u, 0, -r * 0.95, u * 0.14, '#7ac8e8'); g.restore();
    disc(g, u, w / 2, h / 2, u * 0.16, IRON);
  },
  dummy(g, w, h, u) {
    disc(g, u, w / 2, h / 2, Math.min(w, h) * 0.3, '#c8a860', { sh: true, line: '#8a6a30' });
    g.strokeStyle = WOOD_D; g.lineWidth = Math.max(2, u * 0.08); g.beginPath(); g.moveTo(w * 0.15, h / 2); g.lineTo(w * 0.85, h / 2); g.stroke();
    disc(g, u, w / 2, h / 2, u * 0.12, '#a08040');
  },
  hay(g, w, h, u, R) {
    blk(g, u, w * 0.05, h * 0.1, w * 0.9, h * 0.8, '#d6b85a', { sh: true, line: '#9a7a2a' });
    g.strokeStyle = '#b8983a'; g.lineWidth = Math.max(1, u * 0.02); g.beginPath();
    for (let i = 0; i < 14; i++) { const x = w * (0.1 + R() * 0.8), y = h * (0.15 + R() * 0.7); g.moveTo(x, y); g.lineTo(x + u * 0.15, y + (R() - 0.5) * u * 0.1); } g.stroke();
    g.strokeStyle = '#7a5a20'; g.lineWidth = Math.max(1, u * 0.03); g.beginPath(); g.moveTo(w * 0.35, h * 0.1); g.lineTo(w * 0.35, h * 0.9); g.moveTo(w * 0.65, h * 0.1); g.lineTo(w * 0.65, h * 0.9); g.stroke();
  },
  stall(g, w, h, u, R) {
    g.fillStyle = '#c9a85a'; g.fillRect(w * 0.06, 0, w * 0.88, h);
    for (let i = 0; i < 20; i++) { g.strokeStyle = '#a8883a'; g.lineWidth = 1; const x = w * (0.1 + R() * 0.8), y = h * R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + u * 0.12, y + u * 0.05); g.stroke(); }
    g.fillStyle = WOOD_D; g.fillRect(0, 0, w * 0.06, h * 0.85); g.fillRect(w * 0.94, 0, w * 0.06, h * 0.85);
    blk(g, u, w * 0.3, h * 0.04, w * 0.4, h * 0.12, WOOD, { sh: true }); // feed box
  },
  trough(g, w, h, u) { blk(g, u, 0, h * 0.1, w, h * 0.8, WOOD, { sh: true }); blk(g, u, w * 0.06, h * 0.25, w * 0.88, h * 0.5, '#3d6a8a', { line: false }); },
  pen(g, w, h, u, R) {
    g.fillStyle = 'rgba(200,170,90,.45)'; g.fillRect(u * 0.1, u * 0.1, w - u * 0.2, h - u * 0.2);
    g.strokeStyle = WOOD; g.lineWidth = Math.max(1.5, u * 0.07); g.strokeRect(u * 0.1, u * 0.1, w - u * 0.2, h - u * 0.2);
    for (let x = u * 0.1; x <= w; x += u * 0.5) { disc(g, u, x, u * 0.1, u * 0.06, WOOD_D, { line: false }); disc(g, u, x, h - u * 0.1, u * 0.06, WOOD_D, { line: false }); }
    DRAW.trough(g, w * 0.5, h * 0.25, u);
  },
  // nook fittings
  closet(g, w, h, u, R) {
    g.strokeStyle = '#999'; g.lineWidth = Math.max(1, u * 0.04); g.beginPath(); g.moveTo(w * 0.08, h * 0.35); g.lineTo(w * 0.92, h * 0.35); g.stroke();
    for (let x = w * 0.12; x < w * 0.88; x += u * 0.14) { g.fillStyle = CLOTH[Math.floor(R() * CLOTH.length)]; g.fillRect(x, h * 0.2, u * 0.1, h * 0.35); }
    blk(g, u, w * 0.1, h * 0.65, w * 0.8, h * 0.25, WOOD, {});
  },
  washroom(g, w, h, u) { DRAW.privy(g, Math.min(w, u), h, u); disc(g, u, w - u * 0.3, h * 0.35, u * 0.2, '#e8eef0', { line: '#8a9aa0' }); disc(g, u, w - u * 0.3, h * 0.35, u * 0.12, '#7aaac8', { line: false }); },
  privy(g, w, h, u) { blk(g, u, w * 0.1, h * 0.05, w * 0.8, Math.min(h * 0.6, u * 0.6), WOOD, { sh: true }); g.fillStyle = '#1a1410'; g.beginPath(); g.ellipse(w / 2, h * 0.05 + Math.min(h * 0.6, u * 0.6) / 2, u * 0.12, u * 0.09, 0, 0, 7); g.fill(); },
  tub(g, w, h, u) {
    const rw = Math.max(w * 0.42, u * 0.3), rh = Math.min(h * 0.42, u * 0.42);
    shadowOn(g, u); g.fillStyle = '#e8eef0'; g.beginPath(); g.ellipse(w / 2, h * 0.45, rw, rh, 0, 0, 7); g.fill(); shadowOff(g);
    g.strokeStyle = '#8a9aa0'; g.lineWidth = Math.max(1, u * 0.03); g.stroke();
    g.fillStyle = '#7aaac8'; g.beginPath(); g.ellipse(w / 2, h * 0.45, rw * 0.78, rh * 0.7, 0, 0, 7); g.fill();
  },
};

// ---------------- floor textures ----------------
function texWood(g, u, x, y, w, h, base, R, vertical) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  const pw = u * 0.25;
  const along = vertical ? h : w, across = vertical ? w : h;
  for (let o = 0; o < across; o += pw) {
    let p = -R() * u * 2;
    while (p < along) {
      const len = u * (1.2 + R() * 2.2);
      g.fillStyle = shade(base, (R() - 0.5) * 0.16);
      if (vertical) g.fillRect(x + o, y + p, pw, len); else g.fillRect(x + p, y + o, len, pw);
      g.fillStyle = shade(base, -0.35);
      if (vertical) g.fillRect(x + o, y + p + len - 1, pw, 1); else g.fillRect(x + p + len - 1, y + o, 1, pw);
      p += len;
    }
    g.fillStyle = shade(base, -0.3);
    if (vertical) g.fillRect(x + o, y, Math.max(1, u * 0.02), h); else g.fillRect(x, y + o, w, Math.max(1, u * 0.02));
  }
}
function texFlags(g, u, x, y, w, h, base, R) {
  g.fillStyle = shade(base, -0.45); g.fillRect(x, y, w, h);
  const sz = u * 0.5, gap = Math.max(1, u * 0.04);
  for (let yy = y; yy < y + h; yy += sz) {
    let xx = x - R() * sz;
    while (xx < x + w) {
      const ww = sz * (0.7 + R() * 0.8);
      g.fillStyle = shade(base, (R() - 0.5) * 0.22);
      rrect(g, xx + gap / 2, yy + gap / 2, ww - gap, sz - gap, u * 0.04); g.fill();
      xx += ww;
    }
  }
}
function texTiles(g, u, x, y, w, h, a, c) {
  const t = u * 0.25;
  for (let yy = 0; yy < h; yy += t) for (let xx = 0; xx < w; xx += t) { g.fillStyle = ((Math.floor(xx / t) + Math.floor(yy / t)) & 1) ? a : c; g.fillRect(x + xx, y + yy, t + 0.5, t + 0.5); }
}
function texSpeckle(g, u, x, y, w, h, base, cols, R, dens = 30, size = 0.05) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  const n = Math.round(w * h / (u * u) * dens);
  for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; const s = u * size * (0.5 + R()); g.fillRect(x + R() * w, y + R() * h, s, s); }
}
function texGrass(g, u, x, y, w, h, R) {
  texSpeckle(g, u, x, y, w, h, '#4d6a33', ['#5a7a3a', '#435e2c', '#62843f', '#3c5427'], R, 22, 0.08);
  g.lineWidth = Math.max(1, u * 0.025);
  const n = Math.round(w * h / (u * u) * 14);
  for (let i = 0; i < n; i++) { const px = x + R() * w, py = y + R() * h; g.strokeStyle = ['#6a8f45', '#3a5226', '#577a37'][i % 3]; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * u * 0.1, py - u * 0.12); g.stroke(); }
}
function paintFloor(g, u, x, y, w, h, mat, R, vertical) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  switch (mat) {
    case 'wood': texWood(g, u, x, y, w, h, '#8a5d36', R, vertical); break;
    case 'woodL': texWood(g, u, x, y, w, h, '#a87a4a', R, vertical); break;
    case 'flags': texFlags(g, u, x, y, w, h, '#8f8a82', R); break;
    case 'darkFlags': texFlags(g, u, x, y, w, h, '#6a6560', R); break;
    case 'marble': texTiles(g, u * 2, x, y, w, h, '#d9d4cc', '#bdb6ac'); break;
    case 'tiles': texTiles(g, u, x, y, w, h, '#b9a58a', '#a08c70'); break;
    case 'wet': texTiles(g, u, x, y, w, h, '#c8d2d6', '#a8b4ba'); break;
    case 'dirt': texSpeckle(g, u, x, y, w, h, '#7a6446', ['#6a5638', '#8a7454', '#c9a85a'], R, 30); break;
    case 'sand': texSpeckle(g, u, x, y, w, h, '#c4a874', ['#b0945e', '#d4ba88', '#a88a54'], R, 30); break;
    case 'soil': texSpeckle(g, u, x, y, w, h, '#5a4430', ['#4a3622', '#6a5238', '#4f8a3c'], R, 25); break;
    case 'grassPlot': texGrass(g, u, x, y, w, h, R); break;
    case 'gravel': texSpeckle(g, u, x, y, w, h, '#9a9184', ['#7f776b', '#b2a99b', '#6e675d'], R, 60, 0.07); break;
    case 'cellar': texSpeckle(g, u, x, y, w, h, '#2a2622', ['#34302b', '#211e1b', '#3a352f'], R, 18, 0.12); break;
    case 'roof': texSpeckle(g, u, x, y, w, h, '#23262b', ['#2b2f35', '#1c1f23'], R, 10, 0.12); break;
    default: g.fillStyle = '#888'; g.fillRect(x, y, w, h);
  }
  g.restore();
}

function drawItem(g, s, X, Y, it, R) {
  const fn = DRAW[it.k]; if (!fn) return;
  const pw = it.w * s, ph = it.h * s, rotQ = ((it.rot % 360) + 360) % 360;
  const lw = rotQ % 180 ? ph : pw, lh = rotQ % 180 ? pw : ph;
  g.save(); g.translate(X(it.x) + pw / 2, Y(it.y) + ph / 2); g.rotate(rotQ * Math.PI / 180); g.translate(-lw / 2, -lh / 2);
  fn(g, lw, lh, s, R); g.restore();
}

// Door leaf in a wall gap. o:'h' = gap along a horizontal wall from (x,y) to (x+1,y).
function drawDoor(g, s, X, Y, d, thick) {
  const horiz = d.o === 'h';
  const x0 = X(d.x), y0 = Y(d.y), len = s;
  g.save(); g.translate(x0, y0); if (!horiz) g.rotate(Math.PI / 2);
  if (d.kind === 'secret') { // looks like wall; DM marking added only on the labelled version
    g.fillStyle = '#4a4440'; g.fillRect(-1, -thick / 2, len + 2, thick); g.restore(); return;
  }
  const t = thick * 0.62;
  blk(g, s, 0, -t / 2, len, t, d.kind === 'front' ? '#6a3f1e' : '#7a4c26', { line: '#2a1a0c', r: 1 });
  g.strokeStyle = 'rgba(40,24,10,.7)'; g.lineWidth = Math.max(1, s * 0.02); g.beginPath();
  for (let i = 1; i < 4; i++) { g.moveTo(len * i / 4, -t / 2); g.lineTo(len * i / 4, t / 2); } g.stroke();
  if (d.kind === 'locked') { g.fillStyle = IRON; g.fillRect(len * 0.12, -t / 2, len * 0.08, t); g.fillRect(len * 0.8, -t / 2, len * 0.08, t); disc(g, s, len * 0.5, 0, s * 0.07, GOLD); }
  else disc(g, s, len * 0.82, 0, s * 0.045, GOLD);
  // jambs
  g.fillStyle = '#3a3532'; g.fillRect(-s * 0.06, -thick / 2, s * 0.12, thick); g.fillRect(len - s * 0.06, -thick / 2, s * 0.12, thick);
  g.restore();
}

// ---------------- floor render ----------------
// opts.px: pixels per square, or opts.long: long side in px. opts.labels: draw numbers + names (for the no-AI version).
function renderFurnished(b, L, fi, opts = {}) {
  const { f, box } = floorGeometry(b, L, fi);
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  let s = opts.px || (opts.long || 1024) / Math.max(bw, bh);
  let W = Math.round(bw * s), H = Math.round(bh * s);
  if (opts.long && !opts.px) { W = Math.round(W / 8) * 8; H = Math.round(H / 8) * 8; }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const X = v => (v - box.x0) * s, Y = v => (v - box.y0) * s;
  const R = mulberry32((L.seed ^ (fi * 7919)) >>> 0);
  const furn = furnishFloor(b, L, fi);
  const ground = fi === 0 && !!f.front;
  const isCellar = /cellar|basement|under|crypt|vault/i.test(f.name) || (L.fl.length > 1 && fi > 0 && f.rooms.every(r => r.zone === 'secure'));

  // outside the building
  // upper storeys: the yard far below, with the roof of the floor beneath around this storey's rooms
  paintFloor(g, s, 0, 0, W, H, ground || (fi && !isCellar) ? 'grassPlot' : isCellar ? 'cellar' : 'roof', R);
  if (fi && !isCellar) for (const r of groundShell(L)) paintFloor(g, s, X(r.x), Y(r.y), r.w * s, r.h * s, 'roof', R);
  // path from the front door to the gate
  if (f.front) {
    const yEnd = box.wall ? box.wall.y1 + 2 : f.front.y + 2;
    paintFloor(g, s, X(-1.4), Y(f.front.y), 2.8 * s, (yEnd - f.front.y) * s, 'gravel', R);
  }
  // outdoor plots
  for (const r of f.plots) {
    const fr = furn.get(r.ref), k = fr?.kind;
    paintFloor(g, s, X(r.x), Y(r.y), r.w * s, r.h * s, FLOOR_KEY[k] || 'grassPlot', R);
  }
  // building floors
  for (const h of f.hall) paintFloor(g, s, X(h.x), Y(h.y), h.w * s, h.h * s, 'flags', R);
  for (const r of f.rooms) {
    const fr = furn.get(rkey(r));
    for (const q of roomRects(r)) paintFloor(g, s, X(q.x), Y(q.y), q.w * s, q.h * s, FLOOR_KEY[fr?.kind] || FLOOR_OF[r.zone] || 'wood', R, r.h > r.w);
    for (const n of fr?.nookItems || []) paintFloor(g, s, X(n.x), Y(n.y), n.w * s, n.h * s, n.wet ? 'wet' : 'wood', R);
  }
  // hall runner
  const mainHall = f.hall[0], open = isOpenPlan(b);
  if (mainHall && mainHall.w >= 4 && !open) {
    g.save(); g.globalAlpha = 0.9; drawItem(g, s, X, Y, { k: 'runner', x: mainHall.x + 0.6, y: mainHall.y + mainHall.h * 0.275, w: mainHall.w - 1.2, h: mainHall.h * 0.45, rot: 0 }, R); g.restore();
  }
  // stairs
  if (f.stairs) drawStairs(g, s, X, Y, f.stairs);
  // decals, then furniture
  for (const fr of furn.values()) for (const d of fr.decals) drawItem(g, s, X, Y, d, R);
  for (const fr of furn.values()) {
    for (const it of fr.items) drawItem(g, s, X, Y, it, R);
    for (const it of fr.nookItems) drawItem(g, s, X, Y, it, R);
  }
  // plot fences, with a gate facing the path
  for (const r of f.plots) {
    const x0 = X(r.x), y0 = Y(r.y), x1 = X(r.x + r.w), y1 = Y(r.y + r.h);
    const gx = r.x < 0 ? x1 : x0, gy0 = Y(r.y + Math.max(0, Math.floor(r.h / 2) - 1) * 1), gy1 = gy0 + s;
    g.strokeStyle = '#6a4a28'; g.lineWidth = Math.max(2, s * 0.09); g.lineCap = 'butt'; g.beginPath();
    g.moveTo(gx, gy0); g.lineTo(gx, y0); g.lineTo(r.x < 0 ? x0 : x1, y0); g.lineTo(r.x < 0 ? x0 : x1, y1); g.lineTo(gx, y1); g.lineTo(gx, gy1); g.stroke();
    for (let x = r.x; x <= r.x + r.w; x++) for (const yy of [r.y, r.y + r.h]) disc(g, s, X(x), Y(yy), s * 0.08, '#4c2f18', { line: false });
    for (let y = r.y; y <= r.y + r.h; y++) for (const xx of [r.x, r.x + r.w]) if (!(xx === (r.x < 0 ? r.x + r.w : r.x) && Y(y) > gy0 && Y(y) < gy1)) disc(g, s, X(xx), Y(y), s * 0.08, '#4c2f18', { line: false });
  }
  // walls
  const nooks = f.rooms.flatMap(r => placeNooks(b, r));
  const thick = Math.max(4, s * 0.3);
  if (open) { // wall-less: a faint marked edge between areas, no walls or doors
    const ep = new Path2D(wallPath({ ...f, doors: [] }, X, Y, nooks.map(k => ({ ...k, door: { o: '-' } }))));
    g.save(); g.setLineDash([s * 0.18, s * 0.18]); g.strokeStyle = 'rgba(30,24,18,.45)'; g.lineWidth = Math.max(1.5, s * 0.05); g.stroke(ep); g.restore();
  } else {
    const wp = new Path2D(wallPath(f, X, Y, nooks));
    g.lineCap = 'square'; g.lineJoin = 'miter';
    shadowOn(g, s); g.strokeStyle = '#2a2522'; g.lineWidth = thick; g.stroke(wp); shadowOff(g);
    g.strokeStyle = '#575049'; g.lineWidth = thick * 0.72; g.stroke(wp);
    g.strokeStyle = '#6e665d'; g.lineWidth = Math.max(1, thick * 0.18); g.stroke(wp);
    // doors
    for (const d of f.doors) drawDoor(g, s, X, Y, d, thick);
    for (const k of nooks) drawDoor(g, s, X, Y, { ...k.door, kind: 'door' }, thick * 0.8);
  }
  // entrance: steps and lanterns outside the front doors (wall-less: just the lanterns)
  if (f.front) {
    const fy = Y(f.front.y);
    if (!open) for (let i = 0; i < 3; i++) { g.fillStyle = shade('#a8a298', -0.12 * i); g.fillRect(X(-1.25) - i * s * 0.08, fy + thick / 2 + i * s * 0.18, 2.5 * s + i * s * 0.16, s * 0.18); }
    for (const xx of [-1.7, 1.7]) { g.save(); g.translate(X(xx) - s * 0.25, fy + s * 0.15); DRAW.brazier(g, s * 0.5, s * 0.5, s); g.restore(); }
  }
  // Bastion wall
  if (box.wall) {
    const w = box.wall;
    const pts = [[1, w.y1], [w.x1, w.y1], [w.x1, w.y0], [w.x0, w.y0], [w.x0, w.y1], [-1, w.y1]];
    const path = new Path2D('M' + pts.map(([a, c2]) => `${X(a)} ${Y(c2)}`).join('L'));
    const perim = (w.x1 - 1) + (w.y1 - w.y0) * 2 + (w.x1 - w.x0) + (-1 - w.x0);
    const built = b.walls.enclosed ? perim : Math.min(perim, b.walls.built || 0);
    g.save(); g.setLineDash([s * 0.4, s * 0.4]); g.strokeStyle = 'rgba(60,55,50,.55)'; g.lineWidth = s * 0.3; g.stroke(path); g.restore();
    if (built > 0) {
      g.save(); if (built < perim) g.setLineDash([built * s, perim * s]);
      shadowOn(g, s); g.strokeStyle = '#3a3532'; g.lineWidth = s * 0.7; g.stroke(path); shadowOff(g);
      g.strokeStyle = '#8a8278'; g.lineWidth = s * 0.5; g.stroke(path);
      g.setLineDash(built < perim ? [s * 0.25, s * 0.25] : [s * 0.25, s * 0.25]); g.strokeStyle = '#6a635a'; g.lineWidth = s * 0.2; g.stroke(path);
      g.restore();
    }
    // gate
    blk(g, s, X(-1), Y(w.y1) - s * 0.15, s, s * 0.3, '#5a3a1e', { line: '#2a1a0c' }); blk(g, s, X(0), Y(w.y1) - s * 0.15, s, s * 0.3, '#5a3a1e', { line: '#2a1a0c' });
  }
  // turn the finished floor so the front door faces the chosen way; labels go on afterwards, upright
  const rot = FACING_ROT[facingOf(b)];
  let out = c, P = (x, y) => [X(x), Y(y)];
  if (rot) {
    const W0 = W, H0 = H; // the floor's own size (P keeps using these after W/H swap)
    const t = rot % 180 !== 0, c2 = document.createElement('canvas'); c2.width = t ? H : W; c2.height = t ? W : H;
    const g2 = c2.getContext('2d');
    if (rot === 90) { g2.translate(H0, 0); P = (x, y) => [H0 - Y(y), X(x)]; }
    else if (rot === 180) { g2.translate(W0, H0); P = (x, y) => [W0 - X(x), H0 - Y(y)]; }
    else { g2.translate(0, W0); P = (x, y) => [Y(y), W0 - X(x)]; }
    g2.rotate(rot * Math.PI / 180); g2.drawImage(c, 0, 0); g2.setTransform(1, 0, 0, 1, 0, 0); // labels use P, not the turn
    out = c2; [W, H] = [c2.width, c2.height];
  }
  if (opts.labels) drawLabels(out.getContext('2d'), b, L, fi, s, P, furn, f);
  return { canvas: out, width: W, height: H, meta: { floor: fi, floorName: f.name, seed: L.seed, sig: L.sig, s, x0: box.x0, y0: box.y0, rot, furnished: 1 } };
}

// Stone stairs: each flight shaded step by step (lighter climbing up, darker going down), flat landings,
// wooden rails, and for a spiral a round well with a central post.
function drawStairs(g, s, X, Y, st) {
  const m = stairMarks(st), stone = '#9a948c';
  g.save();
  if (m.rings.length) { g.fillStyle = '#2c2925'; g.fillRect(X(st.x), Y(st.y), st.w * s, st.h * s); }
  for (const r of m.rings) if (!r.fill) { g.beginPath(); g.arc(X(r.x), Y(r.y), r.r * s, 0, 7); g.fillStyle = shade(stone, -0.12); g.fill(); }
  for (const wd of m.wedges) {
    g.beginPath(); g.moveTo(X(wd.x), Y(wd.y)); g.arc(X(wd.x), Y(wd.y), wd.r * s, wd.a0 * Math.PI / 180, wd.a1 * Math.PI / 180); g.closePath();
    g.fillStyle = shade(stone, 0.12); g.fill();
  }
  for (const l of m.landings) { g.fillStyle = shade(stone, 0.1); g.fillRect(X(l.x), Y(l.y), l.w * s, l.h * s); }
  for (const fl of m.flights) {
    const len = fl.axis === 'x' ? fl.w : fl.h, n = Math.max(1, Math.round(len * 3));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, k = fl.from > 0 ? i : n - 1 - i; // k-th strip from the low edge; t from the start
      g.fillStyle = shade(stone, fl.dir === 'UP' ? 0.18 * t - 0.1 : -0.5 * t);
      if (fl.axis === 'x') g.fillRect(X(fl.x + (k * len) / n), Y(fl.y), (len / n) * s + 0.5, fl.h * s);
      else g.fillRect(X(fl.x), Y(fl.y + (k * len) / n), fl.w * s, (len / n) * s + 0.5);
    }
  }
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = Math.max(1, s * 0.03); g.beginPath();
  for (const l of m.treads) { g.moveTo(X(l[0]), Y(l[1])); g.lineTo(X(l[2]), Y(l[3])); }
  g.stroke();
  shadowOn(g, s); g.strokeStyle = '#5a3a1e'; g.lineCap = 'round'; g.lineWidth = Math.max(2, s * 0.12); g.beginPath();
  for (const l of m.rails) { g.moveTo(X(l[0]), Y(l[1])); g.lineTo(X(l[2]), Y(l[3])); }
  for (const r of m.rings) if (!r.fill) { g.moveTo(X(r.x) + r.r * s, Y(r.y)); g.arc(X(r.x), Y(r.y), r.r * s, 0, 7); }
  g.stroke(); shadowOff(g);
  for (const r of m.rings) if (r.fill) { g.beginPath(); g.arc(X(r.x), Y(r.y), r.r * s, 0, 7); g.fillStyle = '#6e675e'; g.fill(); g.strokeStyle = '#3a3532'; g.lineWidth = Math.max(1, s * 0.04); g.stroke(); }
  g.restore();
}

// P(x, y): floor squares -> [px, py] on the (possibly turned) canvas
function drawLabels(g, b, L, fi, s, P, furn, f) {
  for (const r of [...f.rooms, ...f.plots]) {
    const fr = furn.get(rkey(r)), p = fr ? fr.label : { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    numberBadge(g, ...P(p.x, p.y), roomNo(r), Math.max(11, s * 0.42));
  }
  if (!isOpenPlan(b)) for (const d of f.doors) if (d.kind === 'secret') {
    const [cx, cy] = d.o === 'h' ? P(d.x + 0.5, d.y) : P(d.x, d.y + 0.5);
    g.font = `italic 700 ${Math.max(10, s * 0.4)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText('S', cx, cy); g.fillStyle = '#ffd36a'; g.fillText('S', cx, cy);
  }
  if (f.stairs) {
    g.font = `700 ${Math.max(10, s * 0.34)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const a of stairMarks(f.stairs).arrows) {
      const [px, py] = P(...a.at); g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(a.label, px, py); g.fillStyle = '#fff'; g.fillText(a.label, px, py);
    }
  }
}
function numberBadge(g, cx, cy, n, rad) {
  g.save();
  shadowOn(g, rad); g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.fillStyle = 'rgba(25,20,15,.85)'; g.fill(); shadowOff(g);
  g.lineWidth = Math.max(1.5, rad * 0.14); g.strokeStyle = '#e0b860'; g.stroke();
  const t = String(n); if (t.length > 2) rad *= 1.15;
  g.font = `700 ${rad * (t.length > 2 ? 0.95 : 1.15)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(String(n), cx, cy + rad * 0.05);
  g.restore();
}

// Title strip + key around a furnished floor render (which draws its own room numbers).
function composeFloor(b, L, meta, img, imgW, subtitle) {
  const k = img.width / imgW;
  const f = L.fl[meta.floor] || L.fl.find(x => x.name === meta.floorName);
  const drawn = f ? [...f.rooms, ...f.plots] : [];
  const items = drawn.filter((r, i) => drawn.findIndex(q => q.ref === r.ref) === i).sort((a, c) => a.n - c.n); // key: one line per facility
  const colW = 300, cols = Math.max(1, Math.floor(img.width / colW)), rowsN = Math.ceil(items.length / cols);
  const headH = 58, keyH = items.length ? 30 + rowsN * 20 + 12 : 0;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height + headH + keyH;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1712'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, headH);
  g.fillStyle = '#f0c870'; g.font = '700 22px Georgia, serif'; g.fillText(b.name, 14, 30);
  g.fillStyle = '#c4b496'; g.font = '13px Georgia, serif'; g.fillText(subtitle, 14, 48);
  const same = meta.seed === L.seed && meta.sig === L.sig;
  if (f && same) {
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#f0c870'; g.font = '700 14px Georgia, serif'; g.fillText('KEY', 14, img.height + headH + 24);
    g.font = '13px Georgia, serif'; g.fillStyle = '#efe4cf';
    items.forEach((r, i) => {
      const col = Math.floor(i / rowsN), row = i % rowsN;
      const nk = (b.nooks || []).filter(x => x.parent === r.ref).map(x => x.label || x.kind).join(', ');
      g.fillText(`${r.n}. ${mapLabel(b, r.ref, r.fb).full}${nk ? ` (+ ${nk})` : ''}`.slice(0, 46), 14 + col * colW, img.height + headH + 46 + row * 20);
    });
  } else if (f) {
    g.fillStyle = '#e0a060'; g.font = '13px Georgia, serif';
    g.fillText('The map was redrawn after this was made, so room numbers are left off.', 14, img.height + headH + 24);
  }
  return c;
}
function canvasBlob(c, type = 'image/png', q) { return new Promise((res, rej) => c.toBlob(bl => (bl ? res(bl) : rej(new Error('Could not build the image'))), type, q)); }

// Full furnished floor with numbers and key, ready to view or download.
// labels=false: just the battle map itself (no numbers, secret-door marks, stair labels, title or key), for a VTT.
function furnishedFloorCanvas(b, L, fi, px = 56, labels = true) {
  const r = renderFurnished(b, L, fi, { px, labels });
  if (!labels) return r.canvas;
  return composeFloor(b, L, r.meta, r.canvas, r.width, `${r.meta.floorName} · 1 square = 5 ft`);
}
