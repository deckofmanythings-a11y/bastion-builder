// Trace blueprint: turn an uploaded map image into a clean graph-paper blueprint in the same style as mapgen.js.
// Saved on the Bastion as
//   b.blueprints = [{ id, mapId, name, grid: { size, ox, oy, cols, rows }, rooms, doors, updatedAt }]
//   rooms: [{ name, ref?, hall?, r: [[x, y, w, h], ...] }]   squares as a short list of rectangles (grid cells)
//   doors: [{ o: 'h' | 'v', x, y, kind }]                    as in mapgen: 'h' = top edge of cell x,y; 'v' = its left edge
//                                                            kind: 'door' | 'secret' | 'locked' | 'entry' (front entrance)
// grid.size is the square size in image pixels and ox/oy where the grid starts, so the tracing lines up again on Edit.
// b.mainMap = 'bp:<id>' pins a blueprint as the main map.

const bpKey = (x, y) => `${x},${y}`;
const bpXY = k => { const i = k.indexOf(','); return [+k.slice(0, i), +k.slice(i + 1)]; };
const BP_DOORS = ['door', 'secret', 'locked'];

// cell -> room index
function bpCells(rooms) {
  const m = new Map();
  rooms.forEach((r, i) => { for (const [x, y, w, h] of r.r || []) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) m.set(bpKey(xx, yy), i); });
  return m;
}
// Wall edges: every cell edge between two different regions, or between a region and nothing (ext; out = which way is outside).
function bpWalls(m, reg) {
  const out = [];
  for (const [k, v] of m) {
    const [x, y] = bpXY(k), a = reg(v), up = m.get(bpKey(x, y - 1)), lf = m.get(bpKey(x - 1, y));
    if (up === undefined || reg(up) !== a) out.push({ o: 'h', x, y, ext: up === undefined, out: -1 });
    if (lf === undefined || reg(lf) !== a) out.push({ o: 'v', x, y, ext: lf === undefined, out: -1 });
    if (!m.has(bpKey(x, y + 1))) out.push({ o: 'h', x, y: y + 1, ext: true, out: 1 });
    if (!m.has(bpKey(x + 1, y))) out.push({ o: 'v', x: x + 1, y, ext: true, out: 1 });
  }
  return out;
}
const bpEdgeKey = d => `${d.o}:${d.x}:${d.y}`;
// Edges merged into long runs, skipping door openings (same idea as mapgen's wallPath).
function bpWallPath(edges, doorSet, X, Y) {
  const H = {}, V = {};
  for (const e of edges) if (!doorSet.has(bpEdgeKey(e))) (e.o === 'h' ? (H[e.y] ||= []) : (V[e.x] ||= [])).push(e.o === 'h' ? e.x : e.y);
  const runs = arr => { const r = []; for (const v of arr.sort((p, q) => p - q)) { const last = r[r.length - 1]; if (last && last[1] === v) last[1] = v + 1; else r.push([v, v + 1]); } return r; };
  let d = '';
  for (const y in H) for (const [a, c] of runs(H[y])) d += `M${X(a)} ${Y(+y)}H${X(c)}`;
  for (const x in V) for (const [a, c] of runs(V[x])) d += `M${X(+x)} ${Y(a)}V${Y(c)}`;
  return d;
}
// A set of cells as few rectangles: runs along each row, stacked when the next row has the same run.
function bpRects(keys) {
  const rows = new Map();
  for (const k of keys) { const [x, y] = bpXY(k); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
  const out = [], open = new Map();
  for (const y of [...rows.keys()].sort((a, c) => a - c)) {
    const xs = rows.get(y).sort((a, c) => a - c);
    for (let i = 0; i < xs.length;) {
      let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      const key = `${xs[i]}:${j - i + 1}`, r = open.get(key);
      if (r && r[1] + r[3] === y) r[3]++; else { const n = [xs[i], y, j - i + 1, 1]; out.push(n); open.set(key, n); }
      i = j + 1;
    }
  }
  return out;
}
const bpSquares = r => (r.r || []).reduce((t, q) => t + q[2] * q[3], 0);
const bpReg = rooms => i => (rooms[i].hall ? 'hall' : i); // hallways run into each other without a wall
const bpHasEntry = bp => (bp.doors || []).some(d => d.kind === 'entry');

// ---------- the saved blueprint as an SVG (same ink, paper and symbols as renderMapSVG) ----------
function renderBlueprintSVG(b, bp) {
  const rooms = (bp.rooms || []).filter(r => r.r?.length), m = bpCells(rooms);
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let x0 = 0, y0 = 0, x1 = 10, y1 = 8;
  if (m.size) { x0 = y0 = Infinity; x1 = y1 = -Infinity; for (const k of m.keys()) { const [x, y] = bpXY(k); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); } }
  const PAD = 24, PT = 26, TITLE = 64;
  const p = { box: { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 } };
  const pw = (p.box.x1 - p.box.x0) * MS, ph = (p.box.y1 - p.box.y0) * MS, width = Math.max(pw + 2 * PAD, 560);
  const px = Math.round((width - pw) / 2), X = v => px + (v - p.box.x0) * MS, Y = v => TITLE + PT + (v - p.box.y0) * MS;
  let n = 0;
  const keyItems = rooms.map(r => ({ r, n: r.hall ? 0 : ++n })).filter(k => k.n);
  const space = r => (r.ref && (b.basics.some(z => z.id === r.ref) || b.specials.some(z => z.id === r.ref)) ? mapLabel(b, r.ref, '').space : '');
  const keyLen = k => (String(k.n).length + 2 + k.r.name.length) * 6.6 + (space(k.r).length + 10) * 5.4;
  const colW = Math.min(width - 2 * PAD, Math.max(240, Math.ceil(Math.max(0, ...keyItems.map(keyLen)) + 24))), cols = Math.max(1, Math.floor((width - 2 * PAD) / colW)), rowsN = Math.ceil(keyItems.length / cols);
  const keyY = TITLE + PT + ph + 30, height = keyY + 28 + rowsN * 20 + 52;
  const src = (b.maps || []).find(z => z.id === bp.mapId);
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Georgia, 'Times New Roman', serif">`);
  out.push(`<rect width="${width}" height="${height}" fill="#fbfcfe"/>`);
  out.push(`<text x="${PAD}" y="34" font-size="24" font-weight="700" fill="${INK}">${e(b.name)}</text>`);
  out.push(`<text x="${PAD}" y="54" font-size="13" fill="${INK}" opacity=".8">${e([b.character, src ? `traced from ${src.caption || src.name}` : ''].filter(Boolean).join(' · '))}${b.character || src ? ' · ' : ''}1 square = 5 feet</text>`);
  out.push(`<text x="${px}" y="${TITLE + 16}" font-size="15" font-weight="700" fill="${INK}" letter-spacing="1">${e(String(bp.name || 'Blueprint').toUpperCase())}</text>`);
  out.push(`<rect x="${px}" y="${TITLE + PT}" width="${pw}" height="${ph}" fill="${PAPER}"/>`);
  for (const r of rooms) for (const [x, y, w, h] of r.r) out.push(`<rect x="${X(x)}" y="${Y(y)}" width="${w * MS}" height="${h * MS}" fill="#fff"/>`);
  grid(out, p, X, Y);
  const edges = bpWalls(m, bpReg(rooms)), byKey = new Map(edges.map(d => [bpEdgeKey(d), d]));
  const doors = (bp.doors || []).filter(d => byKey.has(bpEdgeKey(d)));
  out.push(`<path d="${bpWallPath(edges, new Set(doors.map(bpEdgeKey)), X, Y)}" stroke="${INK}" stroke-width="3.2" stroke-linecap="square" fill="none"/>`);
  for (const d of doors) {
    const cx = d.o === 'h' ? X(d.x + 0.5) : X(d.x), cy = d.o === 'h' ? Y(d.y) : Y(d.y + 0.5);
    const w = d.o === 'h' ? MS * 0.62 : MS * 0.32, h = d.o === 'h' ? MS * 0.32 : MS * 0.62;
    if (d.kind === 'secret') {
      out.push(d.o === 'h' ? `<path d="M${X(d.x)} ${cy}H${X(d.x + 1)}" stroke="${INK}" stroke-width="3.2"/>` : `<path d="M${cx} ${Y(d.y)}V${Y(d.y + 1)}" stroke="${INK}" stroke-width="3.2"/>`);
      out.push(`<text x="${cx}" y="${cy + 4}" font-size="12" font-weight="700" font-style="italic" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">S</text>`);
      continue;
    }
    out.push(`<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${d.kind === 'locked' ? INK : '#fff'}" stroke="${INK}" stroke-width="1.4"/>`);
    if (d.kind === 'entry') {
      const s = byKey.get(bpEdgeKey(d)).out;
      out.push(d.o === 'h' ? `<text x="${cx}" y="${cy + (s > 0 ? 15 : -8)}" font-size="9" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">ENTRY</text>`
        : `<text x="${cx + s * 8}" y="${cy + 3}" font-size="9" text-anchor="${s > 0 ? 'start' : 'end'}" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">ENTRY</text>`);
    }
  }
  for (const k of keyItems) { // number (and name, if it fits) in the room's biggest rectangle
    const [x, y, w, h] = k.r.r.reduce((a, q) => (q[2] * q[3] > a[2] * a[3] ? q : a)), cx = X(x + w / 2), cy = Y(y + h / 2);
    const name = k.r.name.length * MS * 0.34 <= w * MS - 6 && h >= 2 && w >= 3 ? k.r.name : null;
    out.push(`<text x="${cx}" y="${cy + (name ? -1 : 5)}" font-size="${MS * 0.95}" font-weight="700" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">${k.n}</text>`);
    if (name) out.push(`<text x="${cx}" y="${cy + 13}" font-size="${MS * 0.6}" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">${e(name)}</text>`);
  }
  { // compass: the tracing keeps the uploaded map's orientation, so north is up
    const cx = px + pw - 18, cy = TITLE + PT + 22;
    out.push(`<path d="M${cx} ${cy - 13}L${cx + 6} ${cy + 7}L${cx} ${cy + 3}L${cx - 6} ${cy + 7}Z" fill="${INK}"/><text x="${cx}" y="${cy - 16}" font-size="11" font-weight="700" text-anchor="middle" fill="${INK}">N</text>`);
  }
  out.push(`<text x="${PAD}" y="${keyY}" font-size="15" font-weight="700" fill="${INK}" letter-spacing="1">KEY</text>`);
  keyItems.forEach((k, i) => {
    const c = Math.floor(i / rowsN), r = i % rowsN, sp = space(k.r);
    out.push(`<text x="${PAD + c * colW}" y="${keyY + 24 + r * 20}" font-size="13" fill="${INK}"><tspan font-weight="700">${k.n}.</tspan> ${e(k.r.name)} <tspan opacity=".65" font-size="11">${bpSquares(k.r)} sq${sp ? ' · ' + e(sp) : ''}</tspan></text>`);
  });
  out.push(`<text x="${PAD}" y="${height - 18}" font-size="11" fill="${INK}" opacity=".8">▭ door   ▬ locked door   S secret door   ENTRY front entrance</text>`);
  out.push('</svg>');
  return out.join('');
}

// ---------- Maps tab: one card per saved blueprint ----------
const bpFileName = (b, p, ext) => mapFileName(b, ext).replace(/ map\.(\w+)$/, ` ${String(p.name || '').replace(/[^\w\- ]+/g, '').trim() || 'blueprint'} blueprint.$1`);
function blueprintCard(b, p) {
  const main = b.mainMap === 'bp:' + p.id, src = (b.maps || []).find(m => m.id === p.mapId);
  return `<div class="section-head"><h2>${esc(p.name || 'Blueprint')} <small>blueprint${src ? ` of ${esc(src.caption || src.name)}` : ''}</small></h2>
      <div class="row"><button class="btn sm ${p.locked ? '' : 'ghost'}" data-act="bpLock" data-bp="${esc(p.id)}" title="${p.locked ? 'Locked: saving changes over it or deleting it needs the character&#39;s name. Click to unlock.' : 'Lock this blueprint so nobody overwrites or deletes it without typing the character&#39;s name'}">${p.locked ? '🔒 Locked' : '🔓 Lock'}</button>
      <button class="btn sm" data-act="bpEdit" data-bp="${esc(p.id)}">Edit</button>
      <button class="btn sm ghost" data-act="bpSvg" data-bp="${esc(p.id)}">SVG</button><button class="btn sm ghost" data-act="bpPng" data-bp="${esc(p.id)}">PNG</button>
      ${main ? '<button class="btn sm ghost" data-main-map="" title="Unpin from the top of the page">★ Main map</button>' : `<button class="btn sm ghost" data-main-map="bp:${esc(p.id)}" title="Show this blueprint at the top of the Maps tab, for everyone">Make main map</button>`}
      <button class="btn sm ghost danger" data-act="bpDel" data-bp="${esc(p.id)}">Delete</button></div></div>
    ${bpHasEntry(p) ? '' : '<p class="small muted">No front entrance marked yet. Edit, pick Doors, and tap an outside wall.</p>'}
    <div class="linemap">${renderBlueprintSVG(b, p)}</div>`;
}
function blueprintsView(b, skip) {
  const list = (b.blueprints || []).filter(p => p !== skip);
  return list.length ? list.slice().reverse().map(p => blueprintCard(b, p)).join('') : '';
}
function deleteBlueprint(b, id) {
  const p = (b.blueprints || []).find(x => x.id === id); if (!p) return;
  if (p.locked) { nameGate(b, `Delete the locked blueprint "${p.name}"`, () => bpRemove(B(), id)); return; }
  if (!confirm(`Delete the blueprint "${p.name}"? The uploaded map it was traced from stays.`)) return;
  bpRemove(b, id);
}
function bpRemove(b, id) {
  const p = (b?.blueprints || []).find(x => x.id === id); if (!p) return;
  b.blueprints = b.blueprints.filter(x => x !== p);
  if (!b.blueprints.length) delete b.blueprints;
  if (b.mainMap === 'bp:' + id) delete b.mainMap;
  addLog(b, `Blueprint deleted: ${p.name}.`, 'build');
  commit();
}

// ---------- the editor ----------
// T is the editor's own working copy; nothing touches the Bastion until Save (which re-finds it by id).
let T = null;
const TR_TOOLS = [['grid', 'Grid'], ['paint', 'Paint'], ['erase', 'Erase'], ['door', 'Doors'], ['move', 'Move']];
const TR_HINT = {
  grid: 'Line the grid up with the map: set the square size, then drag the map to slide the grid. One square is 5 ft.',
  paint: 'Drag to paint squares into the selected room. Paint again to add to it, so L-shapes are two drags.',
  erase: 'Drag over squares to remove them from their rooms.',
  door: 'Tap a wall to change it: door, secret door, locked door, none. An outside wall can also be the front entrance.',
  move: 'Drag to move the map. Pinch or scroll to zoom. Tap a room to select it.',
};
const trColor = (i, hall, a) => (hall ? `rgba(120,130,150,${a})` : `hsla(${(i * 67 + 205) % 360},70%,50%,${a})`);
const trRound = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function traceOpen({ mapId = null, bpId = null, src = null } = {}) {
  const b = B(); if (!b) return;
  const bp = bpId ? (b.blueprints || []).find(p => p.id === bpId) : null;
  if (bpId && !bp) return;
  const m = (b.maps || []).find(x => x.id === (bp ? bp.mapId : mapId));
  if (m && m.type === 'application/pdf') { toast('Only image maps can be traced.'); return; }
  T = { bid: b.id, mapId: bp ? bp.mapId : (m ? m.id : null), bpId: bp ? bp.id : null, img: null, W: 1280, H: 960,
    grid: { size: 32, ox: 0, oy: 0 }, rooms: [], cells: new Map(), doors: new Map(), sel: null, tool: bp ? 'paint' : 'grid',
    alpha: 0.6, view: { z: 1, tx: 0, ty: 0 }, undo: [], changed: false, ptrs: new Map(), drag: null, msg: '', typing: null, fitted: false };
  if (bp) { trLoad(bp); T.W = bp.grid.cols * bp.grid.size; T.H = bp.grid.rows * bp.grid.size; }
  let dlg = $('#traceDlg');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'traceDlg'; document.body.appendChild(dlg);
    // the editor handles its own events; they stop here so the page's delegated handlers never see them
    dlg.addEventListener('click', e => { e.stopPropagation(); trClick(e); });
    dlg.addEventListener('change', e => { e.stopPropagation(); trChange(e); });
    dlg.addEventListener('input', e => { e.stopPropagation(); trInput(e); });
    dlg.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|SELECT/.test(e.target.tagName)) { e.preventDefault(); trUndo(); } });
    dlg.addEventListener('cancel', e => { e.preventDefault(); trClose(); });
  }
  dlg.innerHTML = `<div class="tr">
    <div class="tr-head"><input id="trName" maxlength="60" value="${esc(bp ? bp.name : (m ? m.caption || m.name.replace(/\.[^.]+$/, '') : 'Blueprint'))}" placeholder="Blueprint name" aria-label="Blueprint name">
      <button class="btn sm ghost" data-tr="cancel">Cancel</button><button class="btn sm" data-tr="save">Save</button></div>
    <div class="tr-tools" id="trTools"></div>
    <div class="tr-main"><div class="tr-cv" tabindex="-1" autofocus><canvas id="trCv"></canvas><div class="tr-msg" id="trMsg" hidden></div></div><div class="tr-side" id="trSide"></div></div>
  </div>`;
  dlg.showModal();
  const cv = T.cv = $('#trCv');
  cv.addEventListener('pointerdown', trDown); cv.addEventListener('pointermove', trMove);
  cv.addEventListener('pointerup', trUp); cv.addEventListener('pointercancel', trUp);
  cv.addEventListener('wheel', trWheel, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  T.ro = new ResizeObserver(() => { if (!T) return; if (!T.fitted) trFit(); trDraw(); }); T.ro.observe(cv.parentNode);
  trChrome(); trFit(); trDraw();
  const url = src || (m ? mapUrl(m) : '');
  if (url) {
    const t = T, img = new Image();
    img.onload = () => {
      if (T !== t) return;
      T.img = img; T.W = img.naturalWidth; T.H = img.naturalHeight;
      if (!bp) T.grid.size = T.W >= 1400 ? 70 : Math.max(trMinSize(), Math.round(T.W / 24));
      trChrome(); trFit(); trDraw();
    };
    img.onerror = () => { if (T === t) trSay('The map image could not be loaded. You can still draw on a blank grid.'); };
    img.src = url;
  }
}
function trClose(force) {
  if (!T) return;
  if (!force && T.changed && !confirm('Close without saving? Your changes to this blueprint will be lost.')) return;
  T.ro?.disconnect(); T = null;
  const dlg = $('#traceDlg'); dlg.close(); dlg.innerHTML = '';
}
function trSay(msg) {
  const el = $('#trMsg'); if (!el) return;
  el.textContent = msg; el.hidden = !msg;
  clearTimeout(trSay._t); if (msg) trSay._t = setTimeout(() => { el.hidden = true; }, 3500);
}

// working state <-> the saved shape (also used for undo snapshots)
function trSerialise() {
  const by = new Map(T.rooms.map(r => [r.id, []]));
  for (const [k, id] of T.cells) by.get(id)?.push(k);
  const g = T.grid, [c0, c1, r0, r1] = trRange();
  return { grid: { size: g.size, ox: g.ox, oy: g.oy, cols: c1 - c0 + 1, rows: r1 - r0 + 1 },
    rooms: T.rooms.map(r => ({ name: r.name, ...(r.ref ? { ref: r.ref } : {}), ...(r.hall ? { hall: 1 } : {}), r: bpRects(by.get(r.id)) })),
    doors: [...T.doors].map(([k, kind]) => { const [o, x, y] = k.split(':'); return { o, x: +x, y: +y, kind }; }) };
}
function trLoad(s) {
  T.grid = { size: +s.grid.size || 32, ox: +s.grid.ox || 0, oy: +s.grid.oy || 0 };
  T.rooms = (s.rooms || []).map(r => ({ id: uid(), name: r.name || '', ref: r.ref || '', hall: !!r.hall }));
  T.cells = new Map();
  (s.rooms || []).forEach((r, i) => { for (const [x, y, w, h] of r.r || []) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) T.cells.set(bpKey(xx, yy), T.rooms[i].id); });
  T.doors = new Map((s.doors || []).map(d => [bpEdgeKey(d), d.kind || 'door']));
  T.sel = T.rooms[s.sel ?? -1]?.id || null; // nothing selected on Edit, so a stray stroke starts a new room rather than growing one
}
function trPushUndo() {
  const s = trSerialise(); s.sel = T.rooms.findIndex(r => r.id === T.sel);
  T.undo.push(JSON.stringify(s)); if (T.undo.length > 40) T.undo.shift();
  T.changed = true; T.typing = null;
}
function trUndo() {
  const s = T.undo.pop(); if (!s) { trSay('Nothing to undo.'); return; }
  trLoad(JSON.parse(s)); T.typing = null; trChrome(); trDraw();
}

// grid geometry: cell c spans image x from ox + c*size; cells may start before 0 so the whole image is covered
const trMinSize = () => Math.max(4, Math.ceil(Math.max(T.W, T.H) / 250));
function trRange() {
  const g = T.grid;
  return [Math.floor(-g.ox / g.size), Math.ceil((T.W - g.ox) / g.size) - 1, Math.floor(-g.oy / g.size), Math.ceil((T.H - g.oy) / g.size) - 1];
}
function trSetGrid(size, ox, oy) {
  const g = T.grid;
  g.size = trRound(Math.min(Math.max(+size || g.size, trMinSize()), Math.max(T.W, T.H)), 2);
  // before anything is painted the offset just wraps; afterwards it stays within one square so rooms don't jump
  const fix = v => (T.cells.size ? Math.min(Math.max(v, -g.size), g.size) : ((v % g.size) + g.size) % g.size);
  g.ox = trRound(fix(+ox || 0)); g.oy = trRound(fix(+oy || 0));
}
function trFit() {
  const cv = T.cv, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  const z = Math.min(w / T.W, h / T.H) * 0.96;
  T.view = { z, tx: (w - T.W * z) / 2, ty: (h - T.H * z) / 2 }; T.fitted = true;
}
function trZoom(f, px, py) {
  const v = T.view, z = Math.min(Math.max(v.z * f, 0.02), 40);
  px ??= T.cv.clientWidth / 2; py ??= T.cv.clientHeight / 2;
  v.tx = px - (px - v.tx) * z / v.z; v.ty = py - (py - v.ty) * z / v.z; v.z = z;
}
// screen point -> position in squares (fractional)
function trPos(sx, sy) { const v = T.view, g = T.grid; return [((sx - v.tx) / v.z - g.ox) / g.size, ((sy - v.ty) / v.z - g.oy) / g.size]; }
function trCell(sx, sy) {
  const [fx, fy] = trPos(sx, sy), [c0, c1, r0, r1] = trRange();
  return [Math.min(Math.max(Math.floor(fx), c0), c1), Math.min(Math.max(Math.floor(fy), r0), r1)];
}
const trReg = () => { const hall = new Set(T.rooms.filter(r => r.hall).map(r => r.id)); return id => (hall.has(id) ? 'hall' : id); };
function trPruneDoors() {
  if (!T.doors.size) return;
  const ok = new Map(bpWalls(T.cells, trReg()).map(d => [bpEdgeKey(d), d]));
  for (const [k, kind] of T.doors) { const d = ok.get(k); if (!d || (kind === 'entry' && !d.ext)) T.doors.delete(k); }
}
function trNewRoom() {
  const r = { id: uid(), name: `Room ${T.rooms.filter(x => !x.hall).length + 1}`, ref: '', hall: false };
  T.rooms.push(r); T.sel = r.id; return r;
}

// ----- drawing -----
function trDraw() {
  if (!T || T.raf) return;
  T.raf = requestAnimationFrame(() => { if (T) { T.raf = 0; trPaint(); } });
}
function trPaint() {
  const cv = T.cv, w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'), { z, tx, ty } = T.view, G = T.grid, s = G.size * z;
  const X = c => tx + (G.ox + c * G.size) * z, Y = r => ty + (G.oy + r * G.size) * z;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#cfd9e6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.fillRect(tx, ty, T.W * z, T.H * z);
  if (T.img) { g.globalAlpha = T.alpha; g.drawImage(T.img, tx, ty, T.W * z, T.H * z); g.globalAlpha = 1; }
  // rooms
  const idx = new Map(T.rooms.map((r, i) => [r.id, i])), mid = new Map();
  for (const [k, id] of T.cells) {
    const [x, y] = bpXY(k), i = idx.get(id), r = T.rooms[i];
    g.fillStyle = trColor(i, r.hall, id === T.sel ? 0.5 : 0.28); g.fillRect(X(x), Y(y), s + 0.5, s + 0.5);
    const c = mid.get(id) || mid.set(id, [0, 0, 0]).get(id); c[0] += x + 0.5; c[1] += y + 0.5; c[2]++;
  }
  // grid
  const [c0, c1, r0, r1] = trRange();
  if (s >= 4) {
    g.beginPath();
    for (let c = Math.max(c0, Math.floor(trPos(0, 0)[0])); c <= c1 + 1 && X(c) <= w; c++) { g.moveTo(Math.round(X(c)) + 0.5, Math.max(0, Y(r0))); g.lineTo(Math.round(X(c)) + 0.5, Math.min(h, Y(r1 + 1))); }
    for (let r = Math.max(r0, Math.floor(trPos(0, 0)[1])); r <= r1 + 1 && Y(r) <= h; r++) { g.moveTo(Math.max(0, X(c0)), Math.round(Y(r)) + 0.5); g.lineTo(Math.min(w, X(c1 + 1)), Math.round(Y(r)) + 0.5); }
    g.strokeStyle = T.tool === 'grid' ? 'rgba(31,79,153,.85)' : 'rgba(31,79,153,.4)'; g.lineWidth = 1; g.stroke();
  }
  // walls and doors
  const edges = bpWalls(T.cells, trReg());
  g.strokeStyle = INK; g.lineWidth = Math.max(2, s * 0.14); g.lineCap = 'square'; g.beginPath();
  for (const e of edges) {
    if (T.doors.has(bpEdgeKey(e))) continue;
    g.moveTo(X(e.x), Y(e.y)); if (e.o === 'h') g.lineTo(X(e.x + 1), Y(e.y)); else g.lineTo(X(e.x), Y(e.y + 1));
  }
  g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const e of edges) {
    const kind = T.doors.get(bpEdgeKey(e)); if (!kind) continue;
    const cx = e.o === 'h' ? X(e.x + 0.5) : X(e.x), cy = e.o === 'h' ? Y(e.y) : Y(e.y + 0.5);
    const dw = e.o === 'h' ? s * 0.66 : s * 0.36, dh = e.o === 'h' ? s * 0.36 : s * 0.66;
    g.lineWidth = Math.max(1, s * 0.06);
    if (kind === 'secret') {
      g.lineWidth = Math.max(2, s * 0.14); g.beginPath(); g.moveTo(X(e.x), Y(e.y)); if (e.o === 'h') g.lineTo(X(e.x + 1), Y(e.y)); else g.lineTo(X(e.x), Y(e.y + 1)); g.stroke();
      g.font = `italic 700 ${Math.max(9, s * 0.7)}px Georgia, serif`; g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText('S', cx, cy); g.fillStyle = INK; g.fillText('S', cx, cy); g.strokeStyle = INK;
      continue;
    }
    g.fillStyle = kind === 'locked' ? INK : kind === 'entry' ? '#f0c870' : '#fff';
    g.fillRect(cx - dw / 2, cy - dh / 2, dw, dh); g.strokeRect(cx - dw / 2, cy - dh / 2, dw, dh);
    if (kind === 'entry') {
      g.font = `700 ${Math.max(9, Math.min(13, s * 0.5))}px Georgia, serif`; g.lineWidth = 3; g.strokeStyle = '#fff';
      const ox = e.o === 'v' ? e.out * (dw / 2 + 20) : 0, oy = e.o === 'h' ? e.out * (dh / 2 + 9) : 0;
      g.strokeText('ENTRY', cx + ox, cy + oy); g.fillStyle = INK; g.fillText('ENTRY', cx + ox, cy + oy); g.strokeStyle = INK;
    }
  }
  // room names
  g.font = `700 ${Math.max(10, Math.min(15, s * 0.6))}px Georgia, serif`; g.lineWidth = 3; g.strokeStyle = '#fff'; g.fillStyle = INK;
  for (const [id, c] of mid) { const r = T.rooms[idx.get(id)]; if (!r.name) continue; const x = X(c[0] / c[2]), y = Y(c[1] / c[2]); g.strokeText(r.name, x, y); g.fillText(r.name, x, y); }
  // rectangle being dragged
  const d = T.drag;
  if (d?.type === 'rect') {
    const x = Math.min(d.a[0], d.b[0]), y = Math.min(d.a[1], d.b[1]), cw = Math.abs(d.a[0] - d.b[0]) + 1, ch = Math.abs(d.a[1] - d.b[1]) + 1;
    g.fillStyle = T.tool === 'erase' ? 'rgba(196,88,74,.35)' : 'rgba(31,79,153,.25)'; g.fillRect(X(x), Y(y), cw * s, ch * s);
    g.strokeStyle = T.tool === 'erase' ? '#c4584a' : INK; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(X(x), Y(y), cw * s, ch * s); g.setLineDash([]);
    const label = `${cw} × ${ch}`; g.font = '700 13px Georgia, serif'; g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText(label, X(x) + cw * s / 2, Y(y) - 10); g.fillStyle = INK; g.fillText(label, X(x) + cw * s / 2, Y(y) - 10);
  }
}

// ----- pointer input (mouse, pen and touch) -----
const trPt = e => { const r = T.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function trDown(e) {
  if (!T) return;
  e.preventDefault();
  try { T.cv.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  const [x, y] = trPt(e); T.ptrs.set(e.pointerId, [x, y]);
  if (T.ptrs.size === 2) { // two fingers: pinch to zoom and move, whatever the tool; drops any stroke in progress
    const [p, q] = [...T.ptrs.values()];
    if (T.drag?.type === 'grid' && T.drag.moved) trSetGrid(T.grid.size, T.drag.ox, T.drag.oy);
    T.drag = { type: 'pinch', d: Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, mx: (p[0] + q[0]) / 2, my: (p[1] + q[1]) / 2, v: { ...T.view } };
    trDraw(); return;
  }
  if (T.ptrs.size > 2) return;
  const pan = { type: 'pan', sx: x, sy: y, tx: T.view.tx, ty: T.view.ty, moved: false };
  if (e.button === 1 || e.button === 2) T.drag = pan;
  else if (T.tool === 'paint' || T.tool === 'erase') { const c = trCell(x, y); T.drag = { type: 'rect', a: c, b: c }; }
  else if (T.tool === 'grid') T.drag = { type: 'grid', sx: x, sy: y, ox: T.grid.ox, oy: T.grid.oy, moved: false };
  else T.drag = { ...pan, tap: T.tool }; // Doors and Move: a drag moves the map, a tap acts
  trDraw();
}
function trMove(e) {
  if (!T || !T.ptrs.has(e.pointerId)) return;
  const [x, y] = trPt(e); T.ptrs.set(e.pointerId, [x, y]);
  const d = T.drag; if (!d) return;
  if (d.type === 'pinch') {
    if (T.ptrs.size < 2) return;
    const [p, q] = [...T.ptrs.values()], dist = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const z = Math.min(Math.max(d.v.z * dist / d.d, 0.02), 40);
    T.view = { z, tx: mx - (d.mx - d.v.tx) * z / d.v.z, ty: my - (d.my - d.v.ty) * z / d.v.z };
  } else if (d.type === 'pan') {
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) < 6) return;
    d.moved = true; T.view.tx = d.tx + x - d.sx; T.view.ty = d.ty + y - d.sy;
  } else if (d.type === 'rect') d.b = trCell(x, y);
  else if (d.type === 'grid') {
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) < 4) return;
    if (!d.moved) { d.moved = true; trPushUndo(); }
    trSetGrid(T.grid.size, d.ox + (x - d.sx) / T.view.z, d.oy + (y - d.sy) / T.view.z);
  }
  trDraw();
}
function trUp(e) {
  if (!T || !T.ptrs.has(e.pointerId)) return;
  const [x, y] = trPt(e); T.ptrs.delete(e.pointerId);
  const d = T.drag;
  if (d?.type === 'pinch') { if (!T.ptrs.size) T.drag = null; return; }
  T.drag = null;
  if (!d || e.type === 'pointercancel') { trDraw(); return; }
  if (d.type === 'rect') trApplyRect(d.a, d.b);
  else if (d.type === 'grid') { if (d.moved) trChrome(); }
  else if (d.type === 'pan' && !d.moved && d.tap === 'door') trTapDoor(x, y);
  else if (d.type === 'pan' && !d.moved && d.tap === 'move') { const id = T.cells.get(bpKey(...trPos(x, y).map(Math.floor))); if (id) { T.sel = id; trChrome(); } }
  trDraw();
}
function trWheel(e) { if (!T) return; e.preventDefault(); const [x, y] = trPt(e); trZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y); trDraw(); }

function trApplyRect(a, b) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  if (T.tool === 'erase') {
    let any = false; for (let y = y0; y <= y1 && !any; y++) for (let x = x0; x <= x1; x++) if (T.cells.has(bpKey(x, y))) { any = true; break; }
    if (!any) return;
    trPushUndo();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) T.cells.delete(bpKey(x, y));
  } else {
    trPushUndo();
    const r = T.rooms.find(q => q.id === T.sel) || trNewRoom();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) T.cells.set(bpKey(x, y), r.id);
  }
  trPruneDoors(); trChrome();
}
// Doors: the wall nearest the tap cycles door -> secret -> locked -> none; outside walls also offer a front entrance
// (a Bastion can have more than one).
function trTapDoor(sx, sy) {
  const [fx, fy] = trPos(sx, sy), walls = new Map(bpWalls(T.cells, trReg()).map(d => [bpEdgeKey(d), d]));
  const cand = [{ o: 'h', x: Math.floor(fx), y: Math.round(fy), d: Math.abs(fy - Math.round(fy)) }, { o: 'v', x: Math.round(fx), y: Math.floor(fy), d: Math.abs(fx - Math.round(fx)) }]
    .sort((p, q) => p.d - q.d).map(c => walls.get(bpEdgeKey(c))).filter(Boolean);
  const w = cand[0]; if (!w) { trSay('Tap a wall on the edge of a room.'); return; }
  const k = bpEdgeKey(w), cur = T.doors.get(k), hasEntry = [...T.doors.values()].includes('entry');
  let order = BP_DOORS;
  if (w.ext) order = !hasEntry || cur === 'entry' ? ['entry', ...BP_DOORS] : [...BP_DOORS, 'entry']; // the first outside door starts as the entrance
  const next = order[order.indexOf(cur) + 1]; // indexOf is -1 when there is no door yet
  trPushUndo();
  if (next) T.doors.set(k, next); else T.doors.delete(k);
  trSay(next ? { door: 'Door', secret: 'Secret door', locked: 'Locked door', entry: 'Front entrance' }[next] : 'No door');
  trChrome();
}

// ----- toolbar and side panel -----
function trChrome() {
  if (!T) return;
  const b = state.bastions.find(x => x.id === T.bid), G = T.grid, [c0, c1, r0, r1] = trRange();
  $('#trTools').innerHTML = `${TR_TOOLS.map(([k, l]) => `<button class="btn sm ${T.tool === k ? '' : 'ghost'}" data-tr="tool" data-v="${k}">${l}</button>`).join('')}
    <span class="tr-sep"></span><button class="btn sm ghost" data-tr="newRoom" title="Start a new room">+ Room</button>
    <button class="btn sm ghost" data-tr="undo" ${T.undo.length ? '' : 'disabled'} title="Undo (Ctrl+Z)">Undo</button>
    <button class="btn sm ghost danger" data-tr="clear" ${T.cells.size || T.rooms.length ? '' : 'disabled'} title="Remove every room and door">Clear</button>
    <span class="tr-sep"></span><button class="btn sm ghost" data-tr="zoomOut" title="Zoom out" aria-label="Zoom out">−</button><button class="btn sm ghost" data-tr="zoomIn" title="Zoom in" aria-label="Zoom in">+</button><button class="btn sm ghost" data-tr="fit" title="Show the whole map">Fit</button>
    <label class="tr-alpha small" title="How strongly the uploaded map shows through">Map <input type="range" min="0" max="1" step="0.05" value="${T.alpha}" data-tr="alpha"></label>`;
  const rooms = b ? mapRooms(b) : [], need = new Map(rooms.map(r => [r.ref, r.sq])), have = new Map(), count = new Map();
  for (const id of T.cells.values()) count.set(id, (count.get(id) || 0) + 1);
  for (const r of T.rooms) if (r.ref) have.set(r.ref, (have.get(r.ref) || 0) + (count.get(r.id) || 0));
  const sqNote = r => {
    const n = count.get(r.id) || 0; if (!r.ref || !need.has(r.ref)) return `${n} sq`;
    const tot = have.get(r.ref), want = need.get(r.ref);
    return `<span class="${tot === want ? 'tr-ok' : 'tr-off'}" title="This facility takes ${want} squares${tot !== n ? `; its rooms here add up to ${tot}` : ''}">${tot !== n ? `${n} (${tot})` : n} / ${want} sq</span>`;
  };
  const linkSel = r => `<select data-tr="link" aria-label="What this room is"><option value="">Other / custom</option><option value="hall" ${r.hall ? 'selected' : ''}>Hallway / corridor</option>
    ${rooms.length ? `<optgroup label="Facilities">${rooms.map(q => { const lb = mapLabel(b, q.ref, q.fb); return `<option value="${esc(q.ref)}" ${r.ref === q.ref ? 'selected' : ''}>${esc(lb.full)} (${esc(lb.space)}, ${q.sq} sq)</option>`; }).join('')}</optgroup>` : ''}
    ${r.ref && !need.has(r.ref) ? `<option value="${esc(r.ref)}" selected>(removed facility)</option>` : ''}</select>`;
  const gridBox = `<div class="tr-grid">
      <label>Square size (px) <span class="row"><button class="btn xs ghost" data-tr="size-" aria-label="Smaller squares">−</button><input type="number" data-tr="size" min="${trMinSize()}" step="0.5" value="${G.size}"><button class="btn xs ghost" data-tr="size+" aria-label="Bigger squares">+</button></span></label>
      <label>Or squares across the map <input type="number" data-tr="across" min="2" max="250" step="1" value="${trRound(T.W / G.size)}"></label>
      <label>Grid start right (px) <input type="number" data-tr="ox" step="1" value="${G.ox}"></label>
      <label>Grid start down (px) <input type="number" data-tr="oy" step="1" value="${G.oy}"></label>
      <div class="small muted">${c1 - c0 + 1} × ${r1 - r0 + 1} squares (${(c1 - c0 + 1) * 5} × ${(r1 - r0 + 1) * 5} ft).${T.cells.size ? ' Changing the grid now moves the rooms you have painted.' : ''}</div>
    </div>`;
  const list = T.rooms.map((r, i) => `<div class="tr-room ${r.id === T.sel ? 'on' : ''}">
      <button class="tr-pick" data-tr="sel" data-v="${r.id}"><span class="tr-sw" style="background:${trColor(i, r.hall, 0.8)}"></span><span class="tr-nm">${esc(r.name || (r.hall ? 'Hallway' : 'Unnamed'))}</span><span class="small">${sqNote(r)}</span></button>
      ${r.id === T.sel ? `<div class="tr-edit"><input data-tr="rname" maxlength="40" value="${esc(r.name)}" placeholder="Room name" aria-label="Room name">${linkSel(r)}
        <button class="btn xs ghost danger" data-tr="delRoom">Delete room</button></div>` : ''}
    </div>`).join('');
  const hasEntry = [...T.doors.values()].includes('entry');
  $('#trSide').innerHTML = `<p class="small tr-hint">${TR_HINT[T.tool]}</p>
    ${T.tool === 'grid' ? gridBox : ''}
    <div class="tr-rooms">${list || '<p class="small muted">No rooms yet. Pick Paint and drag on the map.</p>'}</div>
    ${T.cells.size && !hasEntry ? '<p class="small tr-off">No front entrance yet: pick Doors and tap an outside wall.</p>' : ''}`;
}
function trClick(e) {
  const el = e.target.closest('[data-tr]'); if (!el || !T || /INPUT|SELECT/.test(el.tagName)) return;
  const r = T.rooms.find(x => x.id === T.sel);
  switch (el.dataset.tr) {
    case 'cancel': trClose(); return;
    case 'save': trSave(); return;
    case 'tool': T.tool = el.dataset.v; T.drag = null; break;
    case 'newRoom': trPushUndo(); trNewRoom(); if (T.tool !== 'erase') T.tool = 'paint'; break;
    case 'undo': trUndo(); return;
    case 'clear':
      if (!confirm('Remove every room and door from this blueprint? The grid stays.')) return;
      trPushUndo(); T.rooms = []; T.cells.clear(); T.doors.clear(); T.sel = null; break;
    case 'zoomIn': trZoom(1.3); break;
    case 'zoomOut': trZoom(1 / 1.3); break;
    case 'fit': trFit(); break;
    case 'size-': case 'size+': trPushUndo(); trSetGrid(T.grid.size + (el.dataset.tr === 'size+' ? 0.5 : -0.5), T.grid.ox, T.grid.oy); break;
    case 'sel': T.sel = el.dataset.v; break;
    case 'delRoom':
      if (!r) return;
      trPushUndo(); for (const [k, id] of T.cells) if (id === r.id) T.cells.delete(k);
      T.rooms = T.rooms.filter(x => x !== r); T.sel = null; trPruneDoors(); break;
    default: return;
  }
  trChrome(); trDraw();
}
function trChange(e) {
  const el = e.target, k = el.dataset?.tr; if (!k || !T) return;
  const G = T.grid, r = T.rooms.find(x => x.id === T.sel);
  if (k === 'size') { trPushUndo(); trSetGrid(el.value, G.ox, G.oy); }
  else if (k === 'across') { trPushUndo(); trSetGrid(T.W / Math.min(250, Math.max(2, +el.value || 2)), G.ox, G.oy); }
  else if (k === 'ox') { trPushUndo(); trSetGrid(G.size, el.value, G.oy); }
  else if (k === 'oy') { trPushUndo(); trSetGrid(G.size, G.ox, el.value); }
  else if (k === 'link' && r) {
    trPushUndo();
    const b = state.bastions.find(x => x.id === T.bid), auto = !r.name || /^Room \d+$/.test(r.name) || r.name === 'Hallway' || (r.ref && b && r.name === mapLabel(b, r.ref, '').short);
    r.hall = el.value === 'hall'; r.ref = r.hall ? '' : el.value;
    if (auto) r.name = r.hall ? 'Hallway' : r.ref && b ? mapLabel(b, r.ref, '').short.slice(0, 40) : `Room ${T.rooms.filter(x => !x.hall).indexOf(r) + 1}`;
    trPruneDoors();
  } else if (k === 'rname') { T.typing = null; } // the text was already taken on input; now the list can redraw
  else return;
  trChrome(); trDraw();
}
function trInput(e) {
  const el = e.target, k = el.dataset?.tr; if (!T) return;
  if (el.id === 'trName') { T.changed = true; return; }
  if (k === 'alpha') { T.alpha = +el.value; trDraw(); return; }
  if (k === 'rname') {
    const r = T.rooms.find(x => x.id === T.sel); if (!r) return;
    if (T.typing !== r.id) { trPushUndo(); T.typing = r.id; } // one undo step per spell of typing
    r.name = el.value.slice(0, 40); trDraw();
  }
}
function trSave(ok) {
  const b = state.bastions.find(x => x.id === T.bid); // re-find: a live update may have replaced the object
  if (!b) { trSay('This Bastion is no longer here, so the blueprint could not be saved.'); return; }
  const old = (b.blueprints || []).find(p => p.id === T.bpId);
  if (old?.locked && !ok) { nameGate(b, `Save over the locked blueprint "${old.name}"`, () => T && trSave(true)); return; }
  trPruneDoors();
  const s = trSerialise(); s.rooms = s.rooms.filter(r => r.r.length);
  if (!s.rooms.length) { trSay('Paint at least one room first.'); return; }
  const list = (b.blueprints ||= []), at = list.findIndex(p => p.id === T.bpId);
  const bp = { id: T.bpId || uid(), mapId: T.mapId, name: ($('#trName').value.trim() || 'Blueprint').slice(0, 60), ...s, ...(old?.locked ? { locked: true } : {}), updatedAt: new Date().toISOString() };
  if (at >= 0) list[at] = bp; else list.push(bp);
  addLog(b, `Blueprint ${at >= 0 ? 'updated' : 'traced'}: ${bp.name}.`, 'build');
  dirty.add(b.id); writeCache(); schedulePush();
  trClose(true); render();
  toast(`Blueprint saved: ${bp.name}.`);
}
