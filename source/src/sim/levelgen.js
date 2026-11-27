// Level generator. Pure data, no three.js. A layout is everything the sim and renderer need for one map:
//   { n, name, seed, boxes, doors[], paths[], goal, playerSpawn, arena, pits[], decor }
// Level 1 is the handcrafted "Suburban Bach Chokepoint" (contracts.BOXES); every level after that is generated
// from a seed by stacking lane features north → south between the spawn garage and the beer fridge:
//   GULLY     raised deck between a house wall (jandal/zapper mount) and a compost drop
//   CARPORT   walled lane with a low roof (gate/stomper mount)
//   COURTYARD open lawn with hedge blocks and junk to funnel around
//   BRIDGE    a narrow plank deck with compost drops on BOTH sides (catapult heaven)
// Every generated level has at least one GULLY and one CARPORT so every trap type has somewhere to live.
import { BOXES as CLASSIC_BOXES, DOORS as CLASSIC_DOORS, PATHS as CLASSIC_PATHS, GOAL as CLASSIC_GOAL, PLAYER_SPAWN, PIT, ARENA } from '../contracts.js';

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const B = (x0, y0, z0, x1, y1, z1, kind, look) => ({ min: [x0, y0, z0], max: [x1, y1, z1], kind, look: look || kind });

const OWNERS = ['Uncle Dave', 'Nana', 'Big Trev', 'Aunty Shaz', 'Cousin Wayne', 'Gazza', 'Mum\'s mate Bev', 'Old Man Kev', 'Tama', 'Sharon from Work', 'The Johnsons', 'Barry\'s Ex'];
const PLACES = ['Raglan', 'Piha', 'Ōhope', 'Taupō', 'Mangawhai', 'Kaikōura', 'Waihi Beach', 'Gisborne', 'Ōakura', 'Whitianga', 'Hot Water Beach', 'Paekākāriki', 'Matakana', 'Golden Bay', 'Te Puke', 'Whangamatā'];
const SUFFIX = ['Bach', 'Crib', 'Holiday Shack', 'Sleepout', 'Glamping Disaster', 'Bach (Unconsented)', 'Batch'];

export function classicLevel() {
  const doors = [CLASSIC_DOORS.L, CLASSIC_DOORS.R].map((d) => ({ x: d.x, z: d.z }));
  return finish({
    n: 1, seed: 0, name: 'The Suburban Bach Chokepoint',
    boxes: CLASSIC_BOXES.map((b) => ({ min: [...b.min], max: [...b.max], kind: b.kind, look: b.look })),
    doors, paths: [CLASSIC_PATHS.L, CLASSIC_PATHS.R].map((p) => p.map((q) => ({ x: q.x, z: q.z }))),
    goal: { ...CLASSIC_GOAL }, playerSpawn: { ...PLAYER_SPAWN }, arena: { ...ARENA },
    pits: [{ x0: PIT.x0, x1: PIT.x1, z0: PIT.z0, z1: PIT.z1 }],
    fridge: { x: -1, z: 25.7 }, porchSide: 1,
    extras: { ute: { x: 11.25, z: 26.45, ry: 0 }, clothesline: { x: 7.5, z: -18 }, bee: { x: 1.2, y: 0.6, z: 9.2 }, gnome: { x: 10.3, z: -15.3 }, couch: { x: 5.3, z: 21.5 }, chillybin: { x: -10.5, z: -26.25 } },
    flax: [[-12, -15], [-12, 22], [-6.5, 28.5], [15.5, -29], [-12, -29.5], [5, 28.6]],
    signs: [{ lines: ['CAUTION:', 'COMPOST', 'GULLY'], x: 2.6, y: 1.5, z: -8.6, ry: 0 }, { lines: ['SLOW', 'PESTS AT', 'PLAY'], x: -1, y: 3.95, z: 10.9, ry: 0 }],
  });
}

export function generateLevel(n, seed) {
  const rnd = mulberry32(seed * 7919 + n * 104729);
  const R = (a, b) => a + rnd() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const even = (v) => Math.round(v / 2) * 2;

  const w = even(R(28, 34));
  const X0 = -Math.round(w / 2) + 2, X1 = X0 + w;
  const porchSide = rnd() < 0.5 ? 1 : -1; // +1: porch along the east edge
  const PW = 6;
  const A = porchSide > 0 ? X0 : X0 + PW, Bx = porchSide > 0 ? X1 - PW : X1; // lane region [A, Bx]
  const Z0 = -32;

  // ---- feature sequence
  const feats = ['GULLY', 'CARPORT'];
  const extra = RI(0, 2);
  for (let i = 0; i < extra; i++) feats.push(pick(['COURTYARD', 'BRIDGE', 'GULLY', 'COURTYARD']));
  if (rnd() < 0.7) feats.push('SPLIT');            // most maps get a fork: two lanes around a house
  if (n >= 4 && rnd() < 0.35) feats.push('SPLIT'); // later maps sometimes get two
  for (let i = feats.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [feats[i], feats[j]] = [feats[j], feats[i]]; }

  const boxes = [], pits = [], decorSigns = [], houses = [];
  const bands = []; // {z0, z1, pits:[[x0,x1]]}
  let z = Z0;
  const spawnDepth = 12;
  bands.push({ z0: z, z1: z + spawnDepth, pits: [] });
  z += spawnDepth;
  const lane = []; // per feature {lx, z0, z1, type}
  const houseLooks = ['bach', 'bachblue', 'bachyellow', 'shed', 'brick'];
  for (let k = 0; k < feats.length; k++) {
    const type = feats[k];
    if (k > 0) { bands.push({ z0: z, z1: z + 4, pits: [] }); z += 4; } // junction: the lane can shift sideways here
    let len, lx;
    const f0 = z;
    if (type === 'GULLY') {
      len = even(R(14, 20));
      const s = rnd() < 0.5 ? 1 : -1; // pit on +x side when s = 1
      lx = s > 0 ? R(A + 6.5, Bx - 9.5) : R(A + 9.5, Bx - 6.5);
      lx = Math.round(lx * 2) / 2;
      const d0 = lx - 3.5, d1 = lx + 3.5;
      const [hx0, hx1] = s > 0 ? [A, d0] : [d1, Bx];
      const [px0, px1] = s > 0 ? [d1, Bx] : [A, d0];
      const look = pick(houseLooks);
      const hb = B(hx0, 0, f0, hx1, look === 'shed' ? 3.6 : 4.2, f0 + len, 'wall', look);
      boxes.push(hb); if (look !== 'shed' && look !== 'brick') houses.push(hb);
      boxes.push(B(d0, 0, f0, d1, 0.6, f0 + len, 'deck', 'deck'));
      pits.push({ x0: px0, x1: px1, z0: f0, z1: f0 + len });
      boxes.push(B(px0, 0, f0 - 0.6, px1, 1.0, f0, 'fence', 'lowhedge'));
      boxes.push(B(px0, 0, f0 + len, px1, 1.0, f0 + len + 0.6, 'fence', 'lowhedge'));
      bands.push({ z0: f0, z1: f0 + len, pits: [[px0, px1]] });
      decorSigns.push({ lines: ['CAUTION:', 'COMPOST', 'GULLY'], x: (px0 + px1) / 2, y: 1.5, z: f0 - 0.62, ry: Math.PI });
    } else if (type === 'BRIDGE') {
      len = even(R(10, 14));
      lx = Math.round(R(A + 6, Bx - 6) * 2) / 2;
      const d0 = lx - 2, d1 = lx + 2;
      boxes.push(B(d0, 0, f0, d1, 0.6, f0 + len, 'deck', 'deck'));
      for (const [px0, px1] of [[A, d0], [d1, Bx]]) {
        pits.push({ x0: px0, x1: px1, z0: f0, z1: f0 + len });
        boxes.push(B(px0, 0, f0 - 0.6, px1, 1.0, f0, 'fence', 'lowhedge'));
        boxes.push(B(px0, 0, f0 + len, px1, 1.0, f0 + len + 0.6, 'fence', 'lowhedge'));
      }
      bands.push({ z0: f0, z1: f0 + len, pits: [[A, d0], [d1, Bx]] });
      decorSigns.push({ lines: ['DODGY', 'BRIDGE', '(sorry)'], x: d0 - 1.2, y: 1.5, z: f0 - 0.62, ry: Math.PI });
    } else if (type === 'CARPORT') {
      len = even(R(8, 12));
      lx = Math.round(R(A + 6, Bx - 6) * 2) / 2;
      const look = pick(['carportwall', 'shed', 'bach', 'brick']);
      boxes.push(B(A, 0, f0, lx - 4, 3.4, f0 + len, 'wall', look));
      boxes.push(B(lx + 4, 0, f0, Bx, 3.4, f0 + len, 'wall', pick(['shed', 'carportwall', 'brick'])));
      boxes.push(B(lx - 4, 2.8, f0 + 1, lx + 4, 3.3, f0 + len, 'roof', 'carportroof'));
      bands.push({ z0: f0, z1: f0 + len, pits: [] });
      decorSigns.push({ lines: pick([['SLOW', 'PESTS AT', 'PLAY'], ['NO', 'PARKING', 'EVER'], ['MIND', 'YA HEAD']]), x: lx, y: 3.95, z: f0 + 0.9, ry: Math.PI });
    } else if (type === 'SPLIT') {
      // a fork: a house in the middle with a lane down each side. One side is a raised deck, the other runs under a
      // pergola (ceiling traps), and the house walls face both lanes (wall traps). Pests pick a side.
      len = even(R(14, 20));
      const cw = R(5, 6.5), c = Math.round(((A + Bx) / 2 + R(-1.2, 1.2)) * 2) / 2;
      const h0 = c - cw / 2, h1 = c + cw / 2;
      const lxL = Math.round(((A + h0) / 2) * 2) / 2, lxR = Math.round(((h1 + Bx) / 2) * 2) / 2;
      const look = pick(['bach', 'bachblue', 'bachyellow']);
      const hb = B(h0, 0, f0, h1, 4.2, f0 + len, 'wall', look);
      boxes.push(hb); houses.push(hb);
      const deckLeft = rnd() < 0.5;
      const [dx0, dx1] = deckLeft ? [A, h0] : [h1, Bx];
      const [rx0, rx1] = deckLeft ? [h1, Bx] : [A, h0];
      boxes.push(B(dx0, 0, f0, dx1, 0.6, f0 + len, 'deck', 'deck'));
      boxes.push(B(rx0, 2.8, f0 + 2, rx1, 3.3, f0 + len - 2, 'roof', 'carportroof'));
      bands.push({ z0: f0, z1: f0 + len, pits: [] });
      decorSigns.push({ lines: pick([['SHORTCUT', '(maybe)'], ['THIS WAY', 'OR THAT'], ['LEFT?', 'RIGHT?']]), x: c, y: 2.6, z: f0 - 0.08, ry: Math.PI });
      lx = c; lane.push({ lx, lxs: [lxL, lxR], z0: f0, z1: f0 + len, type }); z = f0 + len; continue;
    } else { // COURTYARD
      len = even(R(8, 12));
      lx = Math.round(R(A + 4, Bx - 4) * 2) / 2;
      const n2 = RI(1, 3);
      for (let i = 0; i < n2; i++) {
        const side = rnd() < 0.5 ? -1 : 1, sx = R(1.6, 3), sz = R(1.6, 3.5);
        const cx = side > 0 ? R(lx + 3.6 + sx / 2, Math.max(lx + 3.7 + sx / 2, Bx - sx / 2 - 0.2)) : R(Math.min(lx - 3.7 - sx / 2, A + sx / 2 + 0.2), lx - 3.6 - sx / 2);
        if (cx - sx / 2 < A || cx + sx / 2 > Bx) continue;
        const cz = R(f0 + sz / 2 + 0.5, f0 + len - sz / 2 - 0.5);
        boxes.push(B(cx - sx / 2, 0, cz - sz / 2, cx + sx / 2, rnd() < 0.5 ? 1.8 : 2.4, cz + sz / 2, 'wall', pick(['hedge', 'brick', 'shed'])));
      }
      bands.push({ z0: f0, z1: f0 + len, pits: [] });
    }
    lane.push({ lx, z0: f0, z1: f0 + len, type });
    z = f0 + len;
  }
  bands.push({ z0: z, z1: z + 4, pits: [] }); z += 4;
  const goalDepth = 11;
  bands.push({ z0: z, z1: z + goalDepth, pits: [] }); z += goalDepth;
  const Z1 = z;

  // ---- ground slabs (top y=0) with holes for the compost drops; pit floors at y=-7
  for (const b of bands) {
    const holes = b.pits.slice().sort((p, q) => p[0] - q[0]);
    let x = X0;
    for (const [h0, h1] of holes) {
      if (h0 > x) boxes.push(B(x, -8, b.z0, h0, 0, b.z1, 'ground', 'grass'));
      boxes.push(B(h0, -8, b.z0, h1, PIT.floor, b.z1, 'ground', 'compost'));
      x = h1;
    }
    if (x < X1) boxes.push(B(x, -8, b.z0, X1, 0, b.z1, 'ground', 'grass'));
  }

  // ---- boundary: garage (north), hedge on the porch side, fences elsewhere
  boxes.push(B(X0 - 1, 0, Z0 - 2, X1 + 1, 4, Z0, 'wall', 'garage'));
  boxes.push(B(X1, 0, Z0 - 2, X1 + 2, porchSide > 0 ? 4.5 : 2.4, Z1 + 2, 'wall', porchSide > 0 ? 'hedge' : 'fence'));
  boxes.push(B(X0 - 2, 0, Z0 - 2, X0, porchSide < 0 ? 4.5 : 2.4, Z1 + 2, 'wall', porchSide < 0 ? 'hedge' : 'fence'));
  boxes.push(B(X0 - 1, 0, Z1, X1 + 1, 2.4, Z1 + 2, 'wall', 'fence'));

  // ---- doors (1-3) + dividers
  const nd = rnd() < 0.2 ? 1 : rnd() < 0.7 ? 2 : 3;
  const doors = [];
  for (let i = 0; i < nd; i++) doors.push({ x: Math.round((A + (i + 1) * (Bx - A) / (nd + 1)) * 2) / 2, z: Z0 + 1.5 });
  for (let i = 0; i < nd - 1; i++) { const mx = (doors[i].x + doors[i + 1].x) / 2; boxes.push(B(mx - 1, 0, Z0, mx + 1, 3.2, Z0 + 8, 'wall', 'brick')); }

  // ---- porch catwalk with steps at both ends + see-through rail on the lane side
  const px0 = porchSide > 0 ? X1 - PW : X0, px1 = px0 + PW;
  const pz0 = Z0 + spawnDepth + 2, pz1 = Z1 - 8;
  boxes.push(B(px0, 0, pz0, px1, 2.4, pz1, 'porch', 'porch'));
  for (let i = 1; i <= 3; i++) {
    boxes.push(B(px0, 0, pz0 - 0.6 * i, px1, 2.4 - 0.6 * i, pz0 - 0.6 * (i - 1), 'step', 'step'));
    boxes.push(B(px0, 0, pz1 + 0.6 * (i - 1), px1, 2.4 - 0.6 * i, pz1 + 0.6 * i, 'step', 'step'));
  }
  const rx = porchSide > 0 ? px0 : px1 - 0.25;
  boxes.push(B(rx, 2.4, pz0 + 1, rx + 0.25, 3.4, pz1 - 1, 'rail', 'rail'));

  // ---- goal: fridge + pie warmer in the south yard
  const last = lane[lane.length - 1];
  const gx = Math.min(Bx - 4, Math.max(A + 3, last.lx));
  const fz = Z1 - 4.3;
  boxes.push(B(gx - 1.2, 0, fz - 0.7, gx + 1.2, 2.2, fz + 0.7, 'fridge', 'fridge'));
  boxes.push(B(gx + 1.5, 0, fz - 0.5, gx + 2.7, 1.1, fz + 0.5, 'prop', 'piewarmer'));
  const goal = { x: gx, z: fz - 1.4, r: 1.5 };

  // ---- enemy routes: door → merge → each feature (straight down its lane, shifting in the junctions) → fridge.
  //      Forks multiply the routes: every door gets one route per combination of fork sides.
  let combos = [[]];
  for (const L of lane) { const opts = L.lxs || [L.lx]; const next = []; for (const c of combos) for (const x of opts) next.push([...c, x]); combos = next; }
  const routes = [];
  doors.forEach((d, di) => {
    for (const c of combos) {
      const p = [{ x: d.x, z: Z0 + 9 }]; // clear of the door dividers before turning
      lane.forEach((L, k) => { p.push({ x: c[k], z: L.z0 - 0.8 }); p.push({ x: c[k], z: L.z1 + 0.8 }); });
      p.push({ x: gx, z: goal.z - 1.5 });
      p.push({ x: gx, z: goal.z });
      routes.push({ door: di, pts: p });
    }
  });
  const paths = doors.map((d, di) => routes.find((r) => r.door === di).pts);

  // ---- extras placed off the lane
  const offLane = (zz) => { const lx = laneXAt(lane, zz, doors); return lx < (A + Bx) / 2 ? Bx - 3 : A + 3; };
  const ux = gx < (A + Bx) / 2 ? Math.min(Bx - 3.2, gx + 7) : Math.max(A + 3.2, gx - 7);
  boxes.push(B(ux - 2.6, 0, Z1 - 4.2, ux + 2.6, 1.6, Z1 - 0.5, 'prop', 'ute'));
  const cbx = offLane(Z0 + 5);
  boxes.push(B(cbx - 1, 0, Z0 + 4.2, cbx + 1, 0.9, Z0 + 5.7, 'prop', 'chillybin'));
  const owner = pick(OWNERS), place = pick(PLACES);
  const g = lane.find((L) => L.type === 'GULLY');
  return finish({
    n, seed, name: `${owner}${owner.endsWith('s') ? '\'' : '\'s'} ${pick(SUFFIX)}, ${place}`,
    boxes, doors, paths, routes, goal, forks: lane.filter((L) => L.lxs).length,
    playerSpawn: { x: (px0 + px1) / 2, y: 2.4, z: (pz0 + pz1) / 2, yaw: porchSide > 0 ? Math.PI / 2 : -Math.PI / 2 },
    arena: { x0: X0, x1: X1, z0: Z0, z1: Z1 }, pits, fridge: { x: gx, z: fz }, porchSide,
    extras: {
      ute: { x: ux, z: Z1 - 2.35, ry: 0 }, clothesline: rnd() < 0.7 ? { x: offLane(Z0 + 9), z: Z0 + 9.5 } : null,
      bee: g ? { x: g.lx + (rnd() < 0.5 ? -2.8 : 2.8), y: 0.6, z: g.z1 - 0.8 } : null,
      gnome: { x: porchSide > 0 ? px0 - 0.7 : px1 + 0.7, z: pz0 - 1.5 }, couch: { x: ux, z: Z1 - 7 }, chillybin: { x: cbx, z: Z0 + 4.95 },
    },
    flax: [[X0 + 1, Z0 + 3], [X1 - 1, Z0 + 3], [X0 + 1, Z1 - 1.5], [X1 - 1, Z1 - 1.5], [(X0 + X1) / 2 + 6, Z1 - 1.2]],
    signs: decorSigns, houses,
  });
}

function laneXAt(lane, z, doors) { for (const L of lane) if (z <= L.z1) return L.lx; return lane[lane.length - 1].lx; }

// shared post-processing: compost heaps per pit, a stable id
let nextId = 1;
function finish(L) {
  L.id = nextId++;
  L.signs ||= [];
  L.routes ||= L.paths.map((pts, door) => ({ door, pts }));
  L.forks ||= 0;
  L.houses ||= L.boxes.filter((b) => b.look === 'bach');
  return L;
}
