// Procedural character / trap models built from primitives. Each builder returns a Group whose userData.parts holds
// the bits the view animates. Geometries and materials are shared between instances.
import {
  Group, Mesh, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, CapsuleGeometry, TorusGeometry, PlaneGeometry,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, Shape, ExtrudeGeometry, DoubleSide, CircleGeometry, Color,
} from 'three';
import { TEX } from './textures.js';

const mats = new Map();
// physically based: rough materials (fur, feathers, cloth, rubber) get a soft sheen; smooth non-metals (plastic,
// paint, enamel) get a clearcoat so they catch the sky environment like the real thing
const M = (color, o = {}) => {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) {
    const rough = o.roughness ?? 0.7, metal = o.metalness ?? 0;
    const p = { color, roughness: 0.7, ...o };
    if (rough >= 0.85) Object.assign(p, { sheen: 0.8, sheenRoughness: 0.6, sheenColor: new Color(color).lerp(new Color('#ffffff'), 0.4) });
    else if (rough <= 0.45 && metal < 0.3 && !o.transparent) Object.assign(p, { clearcoat: 0.6, clearcoatRoughness: 0.15 });
    mats.set(k, new MeshPhysicalMaterial(p));
  }
  return mats.get(k);
};
const geos = new Map();
const G = (k, f) => { if (!geos.has(k)) geos.set(k, f()); return geos.get(k); };
function part(parent, geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
  if (o.sx || o.sy || o.sz) m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1);
  m.castShadow = o.cast !== false; m.receiveShadow = false;
  parent.add(m);
  return m;
}
const pivot = (parent, x, y, z) => { const g = new Group(); g.position.set(x, y, z); parent.add(g); return g; };

// ------------------------------------------------------------------ googly eyes (every character gets a pair)
// root.userData.parts.eyes = [{ pupil, rest }]; the view wobbles the pupils with a damped spring so they rattle
// around whenever anything moves. Maximum annoyance per polygon.
export function googly(parent, x, y, z, r, list, spread = 1) {
  for (const s of [-1, 1]) {
    const e = pivot(parent, s * x * spread, y, z);
    part(e, G('gw' + r, () => new SphereGeometry(r, 20, 14)), M('#ffffff', { roughness: 0.2 }), 0, 0, 0, { cast: false });
    const pupil = part(e, G('gp' + r, () => new SphereGeometry(r * 0.55, 14, 10)), M('#0a0a0a', { roughness: 0.15 }), 0, 0, -r * 0.62, { cast: false, sz: 0.5 });
    list.push({ pupil, r, ox: 0, oy: 0, vx: 0, vy: 0 });
  }
}

// ------------------------------------------------------------------ player: BAZZA
// A sunburnt bobble-headed bogan: mullet, mo, zinc on the nose, buck teeth, pink sunnies on the hat, a black singlet
// that gave up halfway down a magnificent pot belly, tiny stubbies, knobbly knees, socks and gumboots.
export function makePlayer() {
  const root = new Group(), body = pivot(root, 0, 0, 0);
  const skin = M('#f2876b', { roughness: 0.55 }), singlet = M('#141414', { roughness: 0.9 }), stubbies = M('#ff7b1c', { roughness: 0.6 }), boot = M('#111111', { roughness: 0.35 });
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = pivot(body, s * 0.15, 0.78, 0);
    part(hip, G('bthigh', () => new CylinderGeometry(0.07, 0.06, 0.2, 10)), skin, 0, -0.08, 0);
    part(hip, G('bknee', () => new SphereGeometry(0.075, 12, 10)), skin, 0, -0.22, -0.01);         // knobbly knees
    part(hip, G('bshin', () => new CylinderGeometry(0.05, 0.045, 0.22, 8)), skin, 0, -0.34, 0);
    part(hip, G('bsock', () => new CylinderGeometry(0.06, 0.06, 0.14, 10)), M('#ffffff', { roughness: 0.95 }), 0, -0.47, 0);
    part(hip, G('bboot', () => new CylinderGeometry(0.1, 0.11, 0.28, 12)), boot, 0, -0.62, 0);
    part(hip, G('bbootTop', () => new CylinderGeometry(0.105, 0.105, 0.04, 12)), M('#d8302a', { roughness: 0.4 }), 0, -0.48, 0, { cast: false });
    part(hip, G('bsole', () => new BoxGeometry(0.22, 0.08, 0.36)), boot, 0, -0.74, -0.05);
    legs.push(hip);
  }
  part(body, G('bstub', () => new BoxGeometry(0.44, 0.17, 0.32)), stubbies, 0, 0.84, 0.02);
  const torso = pivot(body, 0, 0.9, 0);
  // the belly: a sunburnt dome bursting out under a cropped singlet (P.belly jiggles)
  const belly = pivot(torso, 0, 0.2, -0.04);
  part(belly, G('bbelly', () => new SphereGeometry(0.3, 24, 18)), skin, 0, 0, -0.06, { sy: 0.92 });
  part(belly, G('bbutton', () => new SphereGeometry(0.03, 8, 6)), M('#b4553e'), 0, -0.04, -0.355, { cast: false });
  part(torso, G('bsinglet', () => new CylinderGeometry(0.25, 0.31, 0.3, 18)), singlet, 0, 0.47, 0);
  part(torso, G('bstrap', () => new BoxGeometry(0.06, 0.18, 0.02)), singlet, 0.13, 0.66, -0.17, { cast: false });
  part(torso, G('bstrap', () => new BoxGeometry(0.06, 0.18, 0.02)), singlet, -0.13, 0.66, -0.17, { cast: false });
  part(torso, G('bchest', () => new SphereGeometry(0.25, 18, 14)), skin, 0, 0.66, 0, { sy: 0.6, sz: 0.85 });
  part(torso, G('blogo', () => new PlaneGeometry(0.2, 0.1)), new MeshStandardMaterial({ map: TEX.label('CHUR', '#141414', '#ffd21f'), roughness: 0.9 }), 0, 0.5, -0.27, { ry: Math.PI, cast: false });
  // bobble head on a spring (P.head)
  const neck = pivot(torso, 0, 0.82, 0);
  const head = pivot(neck, 0, 0.22, 0);
  part(head, G('bhead', () => new SphereGeometry(0.26, 24, 18)), skin, 0, 0, 0, { sy: 1.05 });
  part(head, G('bnose', () => new SphereGeometry(0.075, 14, 10)), M('#ff6a5a', { roughness: 0.45 }), 0, -0.02, -0.26);
  part(head, G('bzinc', () => new BoxGeometry(0.05, 0.1, 0.03)), M('#ffffff', { roughness: 0.9 }), 0, 0.0, -0.33, { cast: false }); // zinc stripe
  part(head, G('bmo', () => new CapsuleGeometry(0.035, 0.24, 4, 8)), M('#5a3214', { roughness: 1 }), 0, -0.1, -0.24, { rz: Math.PI / 2, cast: false });
  for (const s of [-1, 1]) part(head, G('bmotip', () => new SphereGeometry(0.04, 8, 6)), M('#5a3214', { roughness: 1 }), s * 0.15, -0.14, -0.22, { cast: false });
  part(head, G('bteeth', () => new BoxGeometry(0.1, 0.06, 0.03)), M('#fffbe6', { roughness: 0.3 }), 0, -0.17, -0.235, { cast: false }); // buck teeth
  part(head, G('bgap', () => new BoxGeometry(0.012, 0.062, 0.035)), M('#3a1010'), 0, -0.17, -0.236, { cast: false });
  const eyes = [];
  googly(head, 0.085, 0.07, -0.21, 0.065, eyes);
  for (const s of [-1, 1]) part(head, G('bear', () => new SphereGeometry(0.07, 10, 8)), skin, s * 0.26, 0, 0, { sx: 0.5 });
  const mullet = part(head, G('bmullet', () => new CapsuleGeometry(0.14, 0.26, 4, 10)), M('#6b3a18', { roughness: 1 }), 0, -0.2, 0.17, { rx: 0.25 });
  // bucket hat with sunnies parked on top
  part(head, G('bhat', () => new CylinderGeometry(0.22, 0.26, 0.16, 18)), M('#c6e04a', { roughness: 0.85 }), 0, 0.22, 0);
  part(head, G('bbrim', () => new CylinderGeometry(0.4, 0.42, 0.025, 22)), M('#b8d03a', { roughness: 0.85 }), 0, 0.15, 0, { cast: false });
  part(head, G('bsunnies', () => new BoxGeometry(0.3, 0.07, 0.05)), M('#ff3d9a', { metalness: 0.4, roughness: 0.15 }), 0, 0.31, -0.12, { rx: -0.3, cast: false });
  const gum = part(head, G('bgum', () => new SphereGeometry(0.1, 14, 10)), M('#ff7ac8', { roughness: 0.3, transparent: true, opacity: 0.9 }), 0, -0.17, -0.3, { cast: false });
  gum.scale.setScalar(0.01);
  // skinny sunburnt arms: right holds the gun, left on the fore-grip
  const armR = pivot(torso, 0.3, 0.62, 0), armL = pivot(torso, -0.3, 0.62, 0);
  for (const a of [armR, armL]) { part(a, G('barm', () => new CylinderGeometry(0.055, 0.05, 0.52, 8)), skin, 0, -0.24, 0); part(a, G('bhand', () => new SphereGeometry(0.07, 10, 8)), skin, 0, -0.52, 0); }
  armR.rotation.x = -1.2; armL.rotation.set(-1.35, 0, 0.55);
  // weapons (only one visible)
  const gun = pivot(torso, 0.18, 0.42, -0.5);
  const fizz = pivot(gun, 0, 0, 0);
  part(fizz, G('bottle', () => new CylinderGeometry(0.11, 0.11, 0.62, 14)), M('#c9b23a', { roughness: 0.3, metalness: 0.2 }), 0, 0, 0, { rx: Math.PI / 2 });
  part(fizz, G('label', () => new CylinderGeometry(0.115, 0.115, 0.24, 14)), M('#7a4a1f'), 0, 0, 0.02, { rx: Math.PI / 2 });
  part(fizz, G('neck', () => new CylinderGeometry(0.04, 0.1, 0.2, 10)), M('#c9b23a', { roughness: 0.3 }), 0, 0, -0.4, { rx: -Math.PI / 2 });
  part(fizz, G('nozzle', () => new CylinderGeometry(0.05, 0.05, 0.08, 8)), M('#e23c2c'), 0, 0, -0.52, { rx: Math.PI / 2 });
  part(fizz, G('tank', () => new CylinderGeometry(0.07, 0.07, 0.36, 10)), M('#3cb2e2', { metalness: 0.5 }), 0, 0.15, 0.1, { rx: Math.PI / 2 });
  const pie = pivot(gun, 0, 0, 0);
  part(pie, G('tube', () => new CylinderGeometry(0.14, 0.16, 0.7, 14)), M('#59606a', { metalness: 0.6, roughness: 0.35 }), 0, 0, 0, { rx: Math.PI / 2 });
  part(pie, G('pieTop', () => new CylinderGeometry(0.15, 0.13, 0.07, 14)), M('#d2903d'), 0, 0.17, 0.05);
  part(pie, G('muzz', () => new TorusGeometry(0.15, 0.03, 6, 14)), M('#d8302a'), 0, 0, -0.36);
  pie.visible = false;
  // leaf blower on the back, with a "MUM'S" label
  const blower = pivot(torso, 0, 0.45, 0.3);
  part(blower, G('blowerBody', () => new BoxGeometry(0.38, 0.42, 0.22)), M('#ff7a1a'), 0, 0, 0);
  part(blower, G('blowerTube', () => new CylinderGeometry(0.05, 0.05, 0.6, 8)), M('#333333'), 0.26, -0.2, 0, { rz: 0.5 });
  root.userData.parts = { body, legs, torso, belly, neck, head, gun, fizz, pie, armR, armL, blower, eyes, mullet, gum };
  return root;
}

// ------------------------------------------------------------------ enemies
export function makeGull() {
  const root = new Group(), body = pivot(root, 0, 0, 0);
  const white = M('#f4f4f0', { roughness: 0.9 }), grey = M('#9aa3ab', { roughness: 0.9 }), orange = M('#f08a24'), yellow = M('#ffd21a');
  const legs = [];
  for (const s of [-1, 1]) { const l = pivot(body, s * 0.1, 0.38, 0); part(l, G('gleg', () => new CylinderGeometry(0.025, 0.025, 0.38, 6)), orange, 0, -0.19, 0); part(l, G('gfoot', () => new BoxGeometry(0.1, 0.02, 0.14)), orange, 0, -0.38, -0.04); legs.push(l); }
  part(body, G('gbody', () => new SphereGeometry(0.3, 20, 14)), white, 0, 0.58, 0, { sz: 1.45, sy: 0.85 });
  part(body, G('gtail', () => new ConeGeometry(0.14, 0.3, 6)), grey, 0, 0.62, 0.42, { rx: 1.9 });
  const head = pivot(body, 0, 0.86, -0.32);
  part(head, G('ghead', () => new SphereGeometry(0.16, 20, 14)), white, 0, 0, 0);
  part(head, G('gbeak', () => new ConeGeometry(0.05, 0.22, 6)), yellow, 0, -0.03, -0.2, { rx: -Math.PI / 2 });
  part(head, G('gdot', () => new SphereGeometry(0.02, 20, 14)), M('#d8202a'), 0, -0.06, -0.24, { cast: false });
  const eyes = [];
  googly(head, 0.075, 0.06, -0.11, 0.065, eyes);
  for (const s of [-1, 1]) part(head, G('gbrow', () => new BoxGeometry(0.12, 0.025, 0.04)), grey, s * 0.075, 0.14, -0.13, { rz: s * -0.5, cast: false }); // angry brows
  const wings = [];
  for (const s of [-1, 1]) { const w = pivot(body, s * 0.24, 0.68, 0); part(w, G('gwing', () => new BoxGeometry(0.5, 0.04, 0.42)), grey, s * 0.25, 0, 0); wings.push(w); }
  const chip = part(head, G('chip', () => new BoxGeometry(0.04, 0.04, 0.2)), M('#ffd56a'), 0.06, -0.06, -0.3, { cast: false });
  root.userData.parts = { body, legs, head, wings, chip, eyes };
  return root;
}

export function makePossum() {
  const root = new Group(), body = pivot(root, 0, 0, 0);
  const fur = M('#6b5a4a', { roughness: 1 }), furL = M('#a8988a', { roughness: 1 }), pink = M('#e7a0a8');
  const legs = [];
  for (const s of [-1, 1]) { const l = pivot(body, s * 0.18, 0.28, 0.05); part(l, G('pleg', () => new CylinderGeometry(0.07, 0.06, 0.28, 8)), fur, 0, -0.14, 0); legs.push(l); }
  part(body, G('pbody', () => new SphereGeometry(0.36, 20, 14)), fur, 0, 0.55, 0, { sy: 1.15 });
  part(body, G('pbelly', () => new SphereGeometry(0.26, 20, 14)), furL, 0, 0.5, -0.14);
  const head = pivot(body, 0, 1.0, -0.06);
  part(head, G('phead', () => new SphereGeometry(0.24, 20, 14)), fur, 0, 0, 0);
  part(head, G('psnout', () => new SphereGeometry(0.12, 20, 14)), furL, 0, -0.06, -0.2);
  part(head, G('pnose', () => new SphereGeometry(0.045, 20, 14)), pink, 0, -0.03, -0.31, { cast: false });
  for (const s of [-1, 1]) {
    part(head, G('pear', () => new SphereGeometry(0.09, 20, 14)), fur, s * 0.17, 0.2, 0.02, { sx: 0.6, sy: 1.2 });
  }
  const eyes = [];
  googly(head, 0.1, 0.07, -0.18, 0.09, eyes);
  part(head, G('pgrin', () => new TorusGeometry(0.07, 0.015, 6, 12, Math.PI)), M('#3a1a10'), 0, -0.1, -0.29, { rz: Math.PI, cast: false }); // cheeky grin
  part(head, G('ptooth', () => new BoxGeometry(0.04, 0.035, 0.015)), M('#fffbe6'), 0, -0.115, -0.3, { cast: false });
  const tail = pivot(body, 0, 0.4, 0.3);
  part(tail, G('ptail', () => new CylinderGeometry(0.12, 0.05, 0.8, 8)), M('#3d3128', { roughness: 1 }), 0, 0.35, 0.15, { rx: 0.5 });
  const arm = pivot(body, 0.3, 0.75, -0.1);
  part(arm, G('parm', () => new CylinderGeometry(0.05, 0.05, 0.35, 6)), fur, 0, -0.15, 0);
  const cone = part(arm, G('pcone', () => new ConeGeometry(0.1, 0.24, 8)), M('#7a4a22', { roughness: 1 }), 0, -0.34, 0, { rx: Math.PI });
  root.userData.parts = { body, legs, head, tail, arm, cone, eyes };
  return root;
}

export function makeMower() {
  const root = new Group(), body = pivot(root, 0, 0, 0);
  const red = M('#d8302a', { roughness: 0.4, metalness: 0.3 }), black = M('#161616', { roughness: 0.9 }), grey = M('#555b60', { metalness: 0.6, roughness: 0.4 });
  part(body, G('mdeck', () => new BoxGeometry(1.5, 0.25, 1.9)), grey, 0, 0.35, 0);
  part(body, G('mbody', () => new BoxGeometry(1.2, 0.45, 1.7)), red, 0, 0.7, 0.05);
  part(body, G('mhood', () => new BoxGeometry(1.0, 0.4, 0.8)), red, 0, 0.95, -0.45);
  part(body, G('mseat', () => new BoxGeometry(0.6, 0.12, 0.5)), black, 0, 1.05, 0.45);
  part(body, G('mback', () => new BoxGeometry(0.6, 0.5, 0.1)), black, 0, 1.3, 0.72);
  part(body, G('mcol', () => new CylinderGeometry(0.04, 0.04, 0.5, 6)), black, 0, 1.25, -0.1, { rx: 0.4 });
  part(body, G('mwheel', () => new TorusGeometry(0.2, 0.04, 6, 14)), black, 0, 1.48, -0.2, { rx: 1.2 });
  const wheels = [];
  for (const [x, z, r] of [[-0.68, -0.6, 0.26], [0.68, -0.6, 0.26], [-0.7, 0.6, 0.38], [0.7, 0.6, 0.38]]) {
    const w = part(body, G('mw' + r, () => new CylinderGeometry(r, r, 0.26, 14)), black, x, r, z, { rz: Math.PI / 2 });
    wheels.push(w);
  }
  // angry headlight eyes + eyebrows
  const eyes = [];
  googly(body, 0.28, 1.02, -0.86, 0.17, eyes);
  for (const s of [-1, 1]) part(body, G('mbrow', () => new BoxGeometry(0.34, 0.07, 0.06)), black, s * 0.28, 1.24, -0.9, { rz: s * 0.45, cast: false });
  part(body, G('mtongue', () => new SphereGeometry(0.12, 12, 8)), M('#ff5a7a', { roughness: 0.4 }), 0.1, 0.62, -0.9, { sy: 0.4, sz: 1.4, cast: false }); // tongue out
  const horn = pivot(body, -0.45, 1.25, -0.5);
  part(horn, G('mhornb', () => new SphereGeometry(0.1, 10, 8)), M('#111'), 0, 0, 0);
  part(horn, G('mhornt', () => new CylinderGeometry(0.03, 0.12, 0.3, 12, 1, true)), M('#ffcc1a', { metalness: 0.8, roughness: 0.3, side: DoubleSide }), 0, 0.02, -0.2, { rx: Math.PI / 2 });
  part(body, G('mgrill', () => new BoxGeometry(0.6, 0.12, 0.05)), M('#eeeeee', { metalness: 0.8 }), 0, 0.8, -0.86, { cast: false });
  const blade = part(body, G('mblade', () => new BoxGeometry(1.3, 0.03, 0.12)), M('#cfd6da', { metalness: 0.9, roughness: 0.2 }), 0, 0.2, 0, { cast: false });
  const exhaust = part(body, G('mex', () => new CylinderGeometry(0.05, 0.05, 0.45, 8)), grey, 0.42, 1.25, -0.6);
  root.userData.parts = { body, wheels, blade, exhaust, eyes, horn };
  return root;
}

export const ENEMY_MODEL = { gull: makeGull, possum: makePossum, mower: makeMower };

// health bar (billboarded by the view)
export function makeHealthBar(width = 0.9) {
  const g = new Group();
  const bg = new Mesh(G('hbbg', () => new PlaneGeometry(1, 0.11)), new MeshBasicMaterial({ color: '#1b1b1b', transparent: true, opacity: 0.75, depthWrite: false }));
  const fg = new Mesh(G('hbfg', () => { const p = new PlaneGeometry(1, 0.07); p.translate(0.5, 0, 0.001); return p; }), new MeshBasicMaterial({ color: '#5cff5c', depthWrite: false, transparent: true }));
  fg.position.x = -0.5;
  g.add(bg, fg); g.scale.set(width, 1, 1);
  g.renderOrder = 10; bg.renderOrder = 10; fg.renderOrder = 11;
  g.userData.fg = fg;
  return g;
}

// ------------------------------------------------------------------ traps
function jandalShape() {
  const s = new Shape();
  s.moveTo(0, -0.75);
  s.bezierCurveTo(0.42, -0.75, 0.45, -0.2, 0.36, 0.1);
  s.bezierCurveTo(0.3, 0.4, 0.5, 0.75, 0.0, 0.8);
  s.bezierCurveTo(-0.5, 0.75, -0.3, 0.4, -0.36, 0.1);
  s.bezierCurveTo(-0.45, -0.2, -0.42, -0.75, 0, -0.75);
  return s;
}

export function makeTrap(type) {
  const root = new Group(), P = {};
  if (type === 'wet') {
    part(root, G('wdeck', () => new BoxGeometry(1.96, 0.04, 1.96)), M('#8a6a48', { roughness: 0.25 }), 0, 0.02, 0, { cast: false });
    part(root, G('wpuddle', () => new CircleGeometry(0.85, 24)), M('#7fd8ff', { roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.6, emissive: '#1e6f9a', emissiveIntensity: 0.4 }), 0, 0.05, 0, { rx: -Math.PI / 2, cast: false, sx: 1.1 });
    const arrows = pivot(root, 0, 0.06, 0);
    for (const x of [-0.45, 0.15]) part(arrows, G('warrow', () => { const c = new ConeGeometry(0.22, 0.4, 3); c.rotateZ(-Math.PI / 2); c.scale(1, 1, 0.05); c.rotateX(Math.PI / 2); return c; }), M('#ffffff', { emissive: '#bff0ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }), x, 0, 0, { cast: false });
    const sign = pivot(root, 0.72, 0, 0.72);
    for (const s of [-1, 1]) part(sign, G('wsign', () => new PlaneGeometry(0.4, 0.6)), new MeshStandardMaterial({ map: TEX.sign(['CAUTION', 'WET', 'DECK'], '#ffd21f', '#111'), side: DoubleSide, roughness: 0.6 }), 0, 0.3, s * 0.1, { rx: s * 0.28 });
    P.arrows = arrows;
  } else if (type === 'marmite') {
    part(root, G('mpad', () => new CylinderGeometry(0.98, 1.0, 0.07, 20)), M('#3a1f0a', { roughness: 0.12, metalness: 0.05 }), 0, 0.035, 0, { cast: false, sz: 0.96 });
    for (let i = 0; i < 7; i++) part(root, G('mblob', () => new SphereGeometry(0.18, 20, 14)), M('#2c1606', { roughness: 0.1 }), Math.cos(i * 0.9) * 0.6, 0.05, Math.sin(i * 0.9) * 0.6, { sy: 0.35, cast: false });
    const jar = pivot(root, 0.78, 0, -0.78);
    part(jar, G('mjar', () => new CylinderGeometry(0.17, 0.2, 0.42, 12)), M('#1a0d05', { roughness: 0.15 }), 0, 0.21, 0);
    part(jar, G('mlid', () => new CylinderGeometry(0.17, 0.17, 0.08, 12)), M('#ffcf1a', { roughness: 0.4 }), 0, 0.46, 0);
    part(jar, G('mlbl', () => new CylinderGeometry(0.205, 0.205, 0.16, 12, 1, true)), M('#e8c21a', { roughness: 0.5 }), 0, 0.22, 0, { cast: false });
  } else if (type === 'sizzle') {
    part(root, G('sbase', () => new BoxGeometry(1.9, 0.18, 1.9)), M('#2a2a2a', { metalness: 0.6, roughness: 0.5 }), 0, 0.09, 0, { cast: false });
    const glow = part(root, G('sglow', () => new PlaneGeometry(1.7, 1.7)), new MeshBasicMaterial({ color: '#ff5a1a', transparent: true, opacity: 0.25 }), 0, 0.185, 0, { rx: -Math.PI / 2, cast: false });
    for (let i = 0; i < 9; i++) part(root, G('sbar', () => new BoxGeometry(0.04, 0.04, 1.8)), M('#777', { metalness: 0.8, roughness: 0.3 }), -0.8 + i * 0.2, 0.21, 0, { cast: false });
    for (let i = 0; i < 5; i++) part(root, G('ssnag', () => new CapsuleGeometry(0.06, 0.45, 4, 8)), M('#8a3d1a', { roughness: 0.4 }), -0.6 + i * 0.3, 0.27, (i % 2) * 0.4 - 0.2, { rx: Math.PI / 2 });
    part(root, G('sbread', () => new BoxGeometry(0.3, 0.05, 0.3)), M('#f2d6a0'), 0.65, 0.25, 0.6, { ry: 0.3 });
    part(root, G('ssauce', () => new CylinderGeometry(0.06, 0.07, 0.3, 8)), M('#d81f1f', { roughness: 0.3 }), -0.75, 0.33, 0.7);
    P.glow = glow;
  } else if (type === 'jandal') {
    // root sits on the wall face; local -Z points out of the wall (view orients it)
    part(root, G('jplate', () => new BoxGeometry(1.6, 1.4, 0.08)), M('#6d5a48', { roughness: 0.8 }), 0, 0, -0.04);
    for (let i = 0; i < 4; i++) part(root, G('jspring', () => new TorusGeometry(0.16, 0.025, 6, 12)), M('#c8c8c8', { metalness: 0.9, roughness: 0.25 }), 0, 0, -0.12 - i * 0.07);
    const arm = pivot(root, 0, -0.6, -0.12); // hinge at the bottom
    const sole = new ExtrudeGeometry(jandalShape(), { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    part(arm, G('jpaddle', () => new BoxGeometry(0.9, 1.5, 0.06)), M('#8a6a48', { roughness: 0.8 }), 0, 0.7, -0.18);
    const loaded = pivot(arm, 0, 0, 0);
    part(loaded, G('jsole', () => sole), M('#2f6ff0', { roughness: 0.6 }), 0, 0.62, -0.25);
    part(loaded, G('jsoleTop', () => new ExtrudeGeometry(jandalShape(), { depth: 0.02, bevelEnabled: false })), M('#ffffff', { roughness: 0.8 }), 0, 0.62, -0.35, { sx: 0.92, sy: 0.92 });
    part(loaded, G('jstrap', () => new TorusGeometry(0.28, 0.035, 6, 16, Math.PI)), M('#ffffff'), 0, 0.68, -0.37, { rz: 0 });
    part(loaded, G('jtoe', () => new CylinderGeometry(0.03, 0.03, 0.1, 6)), M('#ffffff'), 0, 1.2, -0.38, { rx: Math.PI / 2, cast: false });
    P.arm = arm; P.loaded = loaded;
  } else if (type === 'gate') {
    // root at the roof underside; the gate hangs in "drop" child
    const steel = M('#c9d2d8', { metalness: 0.85, roughness: 0.3 });
    part(root, G('gbr', () => new BoxGeometry(1.9, 0.08, 0.2)), M('#555'), 0, -0.04, 0);
    const drop = pivot(root, 0, -0.25, 0);
    for (const z of [-0.85, 0.85]) part(drop, G('grail', () => new CylinderGeometry(0.04, 0.04, 1.9, 8)), steel, 0, 0, z, { rz: Math.PI / 2 });
    for (const x of [-0.92, 0.92]) part(drop, G('gstile', () => new CylinderGeometry(0.045, 0.045, 1.75, 8)), steel, x, 0, 0, { rx: Math.PI / 2 });
    for (let i = 1; i < 5; i++) part(drop, G('gbar', () => new CylinderGeometry(0.025, 0.025, 1.85, 6)), steel, 0, 0, -0.85 + i * 0.34, { rz: Math.PI / 2 });
    part(drop, G('gdiag', () => new CylinderGeometry(0.03, 0.03, 2.5, 6)), steel, 0, 0, 0, { rz: Math.PI / 2, ry: 0.75 });
    part(drop, G('gweight', () => new BoxGeometry(0.5, 0.3, 0.5)), M('#3a3a3a', { metalness: 0.4 }), 0, 0.1, 0);
    const wires = [];
    for (const [x, z] of [[-0.9, -0.85], [0.9, -0.85], [-0.9, 0.85], [0.9, 0.85]]) {
      const w = part(root, G('gwire', () => { const c = new CylinderGeometry(0.008, 0.008, 1, 4); c.translate(0, -0.5, 0); return c; }), M('#9a9a9a', { metalness: 0.8 }), x, 0, z, { cast: false });
      wires.push(w);
    }
    P.drop = drop; P.wires = wires;
  } else if (type === 'catapult') {
    // a chilly bin lid on a sprung hinge: P.lid pivots on its back edge (local +X is the launch direction)
    part(root, G('cbase', () => new BoxGeometry(1.9, 0.12, 1.9)), M('#3a3f45', { metalness: 0.5, roughness: 0.5 }), 0, 0.06, 0, { cast: false });
    const hinge = pivot(root, -0.9, 0.14, 0);
    const lid = pivot(hinge, 0, 0, 0);
    part(lid, G('clid', () => new BoxGeometry(1.8, 0.14, 1.75)), M('#f4f4f2', { roughness: 0.35 }), 0.9, 0.07, 0);
    part(lid, G('cbin', () => new BoxGeometry(1.7, 0.18, 1.65)), M('#2a7fd4', { roughness: 0.4 }), 0.9, -0.06, 0);
    part(lid, G('chandle', () => new BoxGeometry(0.5, 0.06, 0.12)), M('#ffffff'), 0.9, 0.17, 0);
    for (let i = 0; i < 3; i++) part(root, G('cspring', () => new TorusGeometry(0.22, 0.03, 6, 14)), M('#c8c8c8', { metalness: 0.9, roughness: 0.25 }), 0.2, 0.08 + i * 0.03, 0, { rx: Math.PI / 2, cast: false });
    const arrows = pivot(root, 0, 0.3, 0); // launch direction marker
    part(arrows, G('carrow', () => { const c = new ConeGeometry(0.18, 0.35, 3); c.rotateZ(-Math.PI / 2); c.scale(1, 1, 0.05); c.rotateX(Math.PI / 2); return c; }), M('#ffd21f', { emissive: '#ffb000', emissiveIntensity: 0.6 }), 0.95, 0.0, 0, { cast: false });
    P.hinge = hinge; P.lid = lid; P.arrows = arrows;
  } else if (type === 'zapper') {
    // hot-wired No. 8 wire fence on the wall; local -Z points away from the wall
    part(root, G('zplate', () => new BoxGeometry(1.8, 1.2, 0.06)), M('#6d5a48', { roughness: 0.9 }), 0, 0, -0.03);
    const wireMat = new MeshStandardMaterial({ color: '#c9d0d4', metalness: 0.9, roughness: 0.3, emissive: '#66ccff', emissiveIntensity: 0 });
    for (const x of [-0.8, 0.8]) for (const y of [-0.45, 0, 0.45]) part(root, G('zins', () => new CylinderGeometry(0.04, 0.05, 0.14, 8)), M('#f6f0e0', { roughness: 0.3 }), x, y, -0.1, { rx: Math.PI / 2 });
    for (const y of [-0.45, 0, 0.45]) part(root, G('zwire', () => new CylinderGeometry(0.012, 0.012, 1.75, 5)), wireMat, 0, y, -0.17, { rz: Math.PI / 2, cast: false });
    part(root, G('zbox', () => new BoxGeometry(0.32, 0.4, 0.16)), M('#e8c21a', { roughness: 0.5 }), 0.62, 0.65, -0.1);
    part(root, G('zsign', () => new PlaneGeometry(0.5, 0.32)), new MeshStandardMaterial({ map: TEX.sign(['ELECTRIC', 'FENCE'], '#ffd21f', '#111'), roughness: 0.6 }), -0.4, 0.68, -0.07, { ry: Math.PI, cast: false });
    P.wireMat = wireMat;
  } else if (type === 'stomper') {
    // piston-driven giant gumboot under the roof; P.drop is lowered by the view
    part(root, G('sbr', () => new BoxGeometry(0.9, 0.12, 0.9)), M('#555b60', { metalness: 0.7, roughness: 0.4 }), 0, -0.06, 0);
    const drop = pivot(root, 0, -0.3, 0);
    const piston = part(root, G('spist', () => { const c = new CylinderGeometry(0.09, 0.09, 1, 10); c.translate(0, -0.5, 0); return c; }), M('#c9d2d8', { metalness: 0.9, roughness: 0.2 }), 0, -0.1, 0);
    const rub = M('#141414', { roughness: 0.35 });
    part(drop, G('sshaft', () => new CylinderGeometry(0.42, 0.46, 1.1, 18)), rub, 0, 0.0, 0);
    part(drop, G('sfoot', () => new BoxGeometry(0.95, 0.4, 1.5)), rub, 0, -0.6, -0.3);
    part(drop, G('stoe', () => new SphereGeometry(0.48, 20, 14)), rub, 0, -0.62, -0.95, { sy: 0.45 });
    part(drop, G('ssole', () => new BoxGeometry(1.0, 0.1, 1.95)), M('#3a2a1a', { roughness: 0.9 }), 0, -0.84, -0.48);
    part(drop, G('sband', () => new CylinderGeometry(0.47, 0.47, 0.08, 18)), M('#d8302a'), 0, 0.5, 0, { cast: false });
    P.drop = drop; P.piston = piston;
  }
  // "disabled" pine-cone sludge marker
  const gum = part(root, G('gum', () => new SphereGeometry(0.25, 20, 14)), M('#5a3a1a', { roughness: 1 }), 0, type === 'jandal' || type === 'zapper' ? 0 : type === 'gate' || type === 'stomper' ? -0.4 : 0.3, type === 'jandal' || type === 'zapper' ? -0.3 : 0, { cast: false });
  gum.visible = false; P.gum = gum;
  root.userData.parts = P;
  root.userData.type = type;
  return root;
}

// the projectile the Flying Jandal trap launches
export function makeFlyingJandal() {
  const g = new Group();
  const sole = new Mesh(G('fjsole', () => { const e = new ExtrudeGeometry(jandalShape(), { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }); e.center(); return e; }), M('#2f6ff0', { roughness: 0.6 }));
  const top = new Mesh(G('fjtop', () => { const e = new ExtrudeGeometry(jandalShape(), { depth: 0.02, bevelEnabled: false }); e.center(); return e; }), M('#ffffff', { roughness: 0.8 }));
  top.position.z = 0.07; top.scale.set(0.92, 0.92, 1);
  const strap = new Mesh(G('fjstrap', () => new TorusGeometry(0.28, 0.035, 6, 16, Math.PI)), M('#ffffff'));
  strap.position.set(0, 0.05, 0.08);
  const inner = new Group(); inner.add(sole, top, strap); inner.rotation.x = -Math.PI / 2; // lie flat, sole down
  g.add(inner);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// translucent ghost (green = valid, red = invalid)
const ghostOk = new MeshBasicMaterial({ color: '#4dff7a', transparent: true, opacity: 0.42, depthWrite: false });
const ghostBad = new MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.42, depthWrite: false });
export function makeGhost(type) {
  const g = makeTrap(type);
  g.traverse((o) => { if (o.isMesh) { o.material = ghostOk; o.castShadow = false; o.renderOrder = 5; } });
  g.userData.parts.gum.visible = false;
  const pad = new Mesh(G('ghostPad', () => new PlaneGeometry(2, 2)), ghostOk);
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03;
  if (type === 'wet' || type === 'marmite' || type === 'sizzle' || type === 'catapult') g.add(pad);
  g.userData.setOk = (ok) => g.traverse((o) => { if (o.isMesh) o.material = ok ? ghostOk : ghostBad; });
  return g;
}
