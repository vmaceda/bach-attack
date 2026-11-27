// Procedural character / trap models built from primitives. Each builder returns a Group whose userData.parts holds
// the bits the view animates. Geometries and materials are shared between instances.
import {
  Group, Mesh, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, CapsuleGeometry, TorusGeometry, PlaneGeometry,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, Shape, ExtrudeGeometry, DoubleSide, CircleGeometry, Color, PointLight,
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

// textured material cache (concept-art surfaces)
const TM = (key, f) => { if (!mats.has(key)) mats.set(key, f()); return mats.get(key); };

// ------------------------------------------------------------------ player: BAZZA, Defender of the Bach
// Rugged sun-browned bloke: long wavy hair and a full beard, laughing eyes, cork hat, sun-faded black "CHUR!"
// singlet over a barrel chest, fern-tattooed arms, frayed khaki stubbies with a leather tool belt, pounamu on a cord,
// tall scuffed gumboots, a chunky brass-and-glass L&P Fizz Cannon and a hip-mounted BREEZA 5000 leaf blower.
export function makePlayer() {
  const root = new Group(), body = pivot(root, 0, 0, 0);
  const skin = M('#c98a62', { roughness: 0.6 });
  const tat = TM('tatSkin', () => new MeshPhysicalMaterial({ map: TEX.tattooSkin(), roughness: 0.6, sheen: 0.3, sheenColor: new Color('#ffd0b0') }));
  const singlet = M('#2b2b2d', { roughness: 0.95 }), khaki = M('#8a7a52', { roughness: 0.92 }), boot = M('#141414', { roughness: 0.42 });
  const leather = M('#5a3a1e', { roughness: 0.7 }), brass = M('#c8a040', { metalness: 0.9, roughness: 0.3 }), hair = M('#3d2a18', { roughness: 1 });
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = pivot(body, s * 0.15, 0.92, 0);
    part(hip, G('bzThigh', () => new CylinderGeometry(0.1, 0.085, 0.3, 12)), skin, 0, -0.17, 0);
    part(hip, G('bzKnee', () => new SphereGeometry(0.085, 14, 10)), skin, 0, -0.33, -0.01);
    part(hip, G('bzBoot', () => new CylinderGeometry(0.105, 0.095, 0.5, 14)), boot, 0, -0.62, 0);
    part(hip, G('bzBootRim', () => new TorusGeometry(0.104, 0.018, 8, 18)), boot, 0, -0.37, 0, { rx: Math.PI / 2, cast: false });
    part(hip, G('bzSole', () => new BoxGeometry(0.22, 0.09, 0.36)), M('#0a0a0a', { roughness: 0.6 }), 0, -0.88, -0.05);
    part(hip, G('bzToe', () => new SphereGeometry(0.11, 12, 8)), boot, 0, -0.84, -0.17, { sy: 0.55 });
    legs.push(hip);
  }
  // frayed khaki stubbies + tool belt
  part(body, G('bzStub', () => new CylinderGeometry(0.27, 0.3, 0.24, 18)), khaki, 0, 0.93, 0);
  for (const s of [-1, 1]) part(body, G('bzStubLeg', () => new CylinderGeometry(0.12, 0.135, 0.12, 12)), khaki, s * 0.15, 0.78, 0);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; part(body, G('bzFray', () => new ConeGeometry(0.018, 0.05, 4)), khaki, Math.cos(a) * 0.13 + (i < 7 ? 0.15 : -0.15), 0.71, Math.sin(a) * 0.13, { rx: Math.PI, cast: false }); }
  part(body, G('bzBelt', () => new CylinderGeometry(0.305, 0.305, 0.07, 20)), leather, 0, 1.06, 0);
  part(body, G('bzBuckle', () => new BoxGeometry(0.1, 0.07, 0.03)), brass, 0, 1.06, -0.31);
  for (const [x, z, ry] of [[-0.24, -0.16, 0.6], [0.25, -0.12, -0.6], [-0.27, 0.12, 2.2]]) part(body, G('bzPouch', () => new BoxGeometry(0.13, 0.15, 0.08)), leather, x, 0.98, z, { ry });
  // torso: barrel chest in a sun-faded singlet
  const torso = pivot(body, 0, 1.05, 0);
  const belly = pivot(torso, 0, 0.12, -0.02);
  part(belly, G('bzGut', () => new SphereGeometry(0.29, 20, 14)), singlet, 0, 0.02, -0.03, { sy: 0.85, sz: 0.9 });
  part(torso, G('bzChest', () => new CylinderGeometry(0.34, 0.28, 0.42, 20)), singlet, 0, 0.36, 0, { sz: 0.78 });
  part(torso, G('bzPecs', () => new SphereGeometry(0.3, 20, 14)), singlet, 0, 0.44, -0.04, { sy: 0.6, sz: 0.75 });
  part(torso, G('bzShoulders', () => new SphereGeometry(0.31, 20, 12)), skin, 0, 0.55, 0.02, { sy: 0.38, sz: 0.62 });
  part(torso, G('bzChur', () => new PlaneGeometry(0.24, 0.12)), TM('churLbl', () => new MeshStandardMaterial({ map: TEX.label('CHUR!', '#2b2b2d', '#e8e2d0'), roughness: 0.95 })), 0.06, 0.4, -0.235, { ry: Math.PI, cast: false });
  // pounamu (greenstone) on a cord
  part(torso, G('bzCord', () => new TorusGeometry(0.15, 0.006, 4, 20, Math.PI)), M('#2a1a10'), 0, 0.6, -0.12, { rx: 1.2, rz: Math.PI, cast: false });
  part(torso, G('bzPounamu', () => new CapsuleGeometry(0.025, 0.05, 4, 8)), M('#2f8a4a', { roughness: 0.15, clearcoat: 1 }), 0, 0.44, -0.27, { cast: false });
  // head: laughing eyes, long wavy hair, full beard, cork hat
  const neck = pivot(torso, 0, 0.62, 0);
  part(neck, G('bzNeck', () => new CylinderGeometry(0.09, 0.11, 0.14, 12)), skin, 0, 0.04, 0);
  const head = pivot(neck, 0, 0.24, 0);
  part(head, G('bzHead', () => new SphereGeometry(0.17, 22, 16)), skin, 0, 0, 0, { sy: 1.12, sz: 1.05 });
  part(head, G('bzNose', () => new SphereGeometry(0.045, 12, 8)), M('#d4805a', { roughness: 0.5 }), 0, -0.01, -0.175, { sy: 1.2 });
  part(head, G('bzCheek', () => new SphereGeometry(0.05, 10, 8)), M('#d8846a', { roughness: 0.6 }), 0.08, -0.035, -0.135, { cast: false });
  part(head, G('bzCheek', () => new SphereGeometry(0.05, 10, 8)), M('#d8846a', { roughness: 0.6 }), -0.08, -0.035, -0.135, { cast: false });
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = pivot(head, s * 0.062, 0.035, -0.148);
    part(e, G('bzEyeW', () => new SphereGeometry(0.027, 12, 10)), M('#f6f1e6', { roughness: 0.2 }), 0, 0, 0, { cast: false });
    const pupil = part(e, G('bzIris', () => new SphereGeometry(0.016, 10, 8)), M('#4a3018', { roughness: 0.2 }), 0, 0, -0.018, { cast: false, sz: 0.5 });
    part(e, G('bzLid', () => new SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)), skin, 0, 0.004, 0, { rx: -0.25, cast: false }); // laughing squint
    part(e, G('bzBrow', () => new BoxGeometry(0.07, 0.016, 0.02)), hair, 0, 0.04, -0.01, { rz: s * -0.18, cast: false });
    part(e, G('bzCrow', () => new BoxGeometry(0.025, 0.003, 0.005)), M('#8a5a40'), s * 0.035, -0.012, 0.0, { rz: s * 0.4, cast: false }); // laugh lines
    eyes.push({ pupil, r: 0.03, ox: 0, oy: 0, vx: 0, vy: 0 });
  }
  // beard: chunky jaw + chin + moustache, with a grin showing through
  part(head, G('bzBeard', () => new SphereGeometry(0.15, 18, 12)), hair, 0, -0.1, -0.06, { sy: 0.9, sz: 0.95 });
  part(head, G('bzChin', () => new SphereGeometry(0.1, 14, 10)), hair, 0, -0.2, -0.08, { sy: 1.1 });
  part(head, G('bzMo', () => new CapsuleGeometry(0.025, 0.1, 4, 8)), hair, 0, -0.055, -0.16, { rz: Math.PI / 2, cast: false });
  part(head, G('bzGrin', () => new BoxGeometry(0.08, 0.022, 0.02)), M('#fff6e0', { roughness: 0.3 }), 0, -0.085, -0.168, { cast: false });
  for (const s of [-1, 1]) part(head, G('bzEar', () => new SphereGeometry(0.035, 10, 8)), skin, s * 0.165, 0.0, 0.0, { sx: 0.5 });
  const mullet = pivot(head, 0, 0.02, 0.06);
  part(mullet, G('bzHairBack', () => new CapsuleGeometry(0.15, 0.22, 4, 12)), hair, 0, -0.12, 0.06, { rx: 0.2 });
  for (const s of [-1, 1]) part(mullet, G('bzHairSide', () => new CapsuleGeometry(0.06, 0.2, 4, 8)), hair, s * 0.15, -0.1, -0.02, { rz: s * 0.25 });
  for (let i = 0; i < 5; i++) part(mullet, G('bzLock', () => new ConeGeometry(0.045, 0.16, 6)), hair, -0.12 + i * 0.06, -0.33, 0.12 + Math.sin(i) * 0.03, { rx: Math.PI + 0.3, rz: (i - 2) * 0.12, cast: false });
  // cork hat: battered felt crown, wide brim, corks dangling (P.corks swing)
  const felt = M('#9a7448', { roughness: 0.95 });
  part(head, G('bzCrown', () => new CylinderGeometry(0.15, 0.18, 0.14, 18)), felt, 0, 0.18, 0);
  part(head, G('bzCrownDent', () => new SphereGeometry(0.15, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2)), felt, 0, 0.24, 0, { sy: 0.35 });
  part(head, G('bzBand', () => new CylinderGeometry(0.182, 0.182, 0.03, 18)), M('#4a3018'), 0, 0.125, 0, { cast: false });
  part(head, G('bzBrim', () => new CylinderGeometry(0.36, 0.37, 0.018, 24)), felt, 0, 0.11, 0);
  const corks = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2, c = pivot(head, Math.cos(a) * 0.33, 0.1, Math.sin(a) * 0.33);
    part(c, G('bzString', () => { const g2 = new CylinderGeometry(0.003, 0.003, 0.09, 3); g2.translate(0, -0.045, 0); return g2; }), M('#3a2a18'), 0, 0, 0, { cast: false });
    part(c, G('bzCork', () => new CylinderGeometry(0.018, 0.022, 0.06, 8)), M('#b88a52', { roughness: 0.95 }), 0, -0.12, 0, { cast: false });
    corks.push(c);
  }
  const gum = part(head, G('bzGum', () => new SphereGeometry(0.08, 14, 10)), M('#ff7ac8', { roughness: 0.3, transparent: true, opacity: 0.9 }), 0, -0.09, -0.2, { cast: false });
  gum.scale.setScalar(0.01);
  // tattooed arms (deltoid, bicep, forearm, fist)
  const armR = pivot(torso, 0.34, 0.5, 0), armL = pivot(torso, -0.34, 0.5, 0);
  for (const a of [armR, armL]) {
    part(a, G('bzDelt', () => new SphereGeometry(0.1, 14, 10)), skin, 0, -0.02, 0);
    part(a, G('bzUpper', () => new CylinderGeometry(0.085, 0.07, 0.3, 12)), tat, 0, -0.17, 0);
    part(a, G('bzBicep', () => new SphereGeometry(0.075, 12, 8)), tat, 0, -0.14, -0.04, { sy: 1.4 });
    part(a, G('bzFore', () => new CylinderGeometry(0.07, 0.055, 0.28, 12)), tat, 0, -0.44, 0);
    part(a, G('bzFist', () => new SphereGeometry(0.065, 12, 8)), skin, 0, -0.6, 0, { sy: 0.85 });
  }
  armR.rotation.x = -1.2; armL.rotation.set(-1.35, 0, 0.55);
  // the L&P FIZZ CANNON: glass pressure tank of fizzy yellow, brass fittings, gauges, hose, flared nozzle
  const gun = pivot(torso, 0.18, 0.33, -0.5);
  const fizz = pivot(gun, 0, 0, 0);
  part(fizz, G('fcTank', () => new CylinderGeometry(0.13, 0.13, 0.42, 18)), TM('fcGlass', () => new MeshPhysicalMaterial({ color: '#fff2a0', roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.55, clearcoat: 1 })), 0, 0.03, 0.05, { rx: Math.PI / 2 });
  part(fizz, G('fcFizz', () => new CylinderGeometry(0.115, 0.115, 0.38, 16)), M('#f2d51a', { roughness: 0.2, emissive: '#5a4a00', emissiveIntensity: 0.6 }), 0, 0.0, 0.05, { rx: Math.PI / 2, cast: false });
  for (const z of [-0.17, 0.27]) part(fizz, G('fcCap', () => new CylinderGeometry(0.14, 0.14, 0.05, 18)), brass, 0, 0.03, z, { rx: Math.PI / 2 });
  part(fizz, G('fcBadge', () => new CircleGeometry(0.075, 20)), TM('lpBadge', () => new MeshStandardMaterial({ map: TEX.lpLabel(), roughness: 0.5 })), 0.135, 0.03, 0.05, { ry: Math.PI / 2, cast: false });
  part(fizz, G('fcBarrel', () => new CylinderGeometry(0.05, 0.06, 0.4, 12)), M('#8a8f94', { metalness: 0.9, roughness: 0.3 }), 0, -0.04, -0.33, { rx: Math.PI / 2 });
  part(fizz, G('fcNozzle', () => new CylinderGeometry(0.075, 0.045, 0.1, 14)), brass, 0, -0.04, -0.56, { rx: Math.PI / 2 });
  for (const [x, z] of [[0.09, -0.22], [-0.02, 0.32]]) {
    const gg = pivot(fizz, x, 0.16, z);
    part(gg, G('fcGauge', () => new CylinderGeometry(0.04, 0.04, 0.025, 16)), brass, 0, 0, 0);
    part(gg, G('fcFace', () => new CircleGeometry(0.032, 16)), M('#f6f1e6'), 0, 0.014, 0, { rx: -Math.PI / 2, cast: false });
    part(gg, G('fcNeedle', () => new BoxGeometry(0.004, 0.002, 0.026)), M('#d8302a'), 0, 0.016, -0.006, { ry: 0.6, cast: false });
  }
  part(fizz, G('fcGrip', () => new BoxGeometry(0.05, 0.14, 0.06)), leather, 0, -0.14, 0.12, { rx: 0.25 });
  part(fizz, G('fcHose', () => new TorusGeometry(0.16, 0.014, 6, 16, Math.PI)), M('#222'), 0, -0.14, 0.2, { ry: Math.PI / 2, cast: false });
  const pie = pivot(gun, 0, 0, 0);
  part(pie, G('tube', () => new CylinderGeometry(0.14, 0.16, 0.7, 14)), M('#59606a', { metalness: 0.6, roughness: 0.35 }), 0, 0, 0, { rx: Math.PI / 2 });
  part(pie, G('pieTop', () => new CylinderGeometry(0.15, 0.13, 0.07, 14)), M('#d2903d'), 0, 0.17, 0.05);
  part(pie, G('muzz', () => new TorusGeometry(0.15, 0.03, 6, 14)), M('#d8302a'), 0, 0, -0.36);
  pie.visible = false;
  // BREEZA 5000 leaf blower holstered on the right hip
  const blower = pivot(body, 0.36, 0.92, 0.05);
  part(blower, G('bwBody', () => new BoxGeometry(0.2, 0.26, 0.3)), TM('breeza', () => new MeshPhysicalMaterial({ map: TEX.breeza(), roughness: 0.45, clearcoat: 0.6 })), 0, 0, 0);
  part(blower, G('bwFan', () => new CylinderGeometry(0.11, 0.11, 0.05, 16)), M('#e8641a', { roughness: 0.45, clearcoat: 0.6 }), 0.11, 0, 0.02, { rz: Math.PI / 2 });
  part(blower, G('bwGrill', () => new CircleGeometry(0.09, 16)), M('#2a2a2a', { metalness: 0.6 }), 0.14, 0, 0.02, { ry: Math.PI / 2, cast: false });
  part(blower, G('bwHandle', () => new TorusGeometry(0.08, 0.018, 6, 12, Math.PI)), M('#e8641a'), 0, 0.16, 0);
  part(blower, G('bwTube', () => new CylinderGeometry(0.045, 0.055, 0.55, 12)), M('#3a3a3a', { roughness: 0.6 }), 0.02, -0.04, -0.4, { rx: Math.PI / 2 - 0.25 });
  part(blower, G('bwTape', () => new CylinderGeometry(0.057, 0.057, 0.06, 12)), M('#b8b8b8', { roughness: 0.4 }), 0.02, -0.08, -0.3, { rx: Math.PI / 2 - 0.25, cast: false });
  root.userData.parts = { body, legs, torso, belly, neck, head, gun, fizz, pie, armR, armL, blower, eyes, mullet, gum, corks };
  return root;
}

// ------------------------------------------------------------------ SEAGULL BANDIT
// Shifty coastal menace: ruffled plumage, half-lidded side-eye, smug hooked beak, a bottle-cap monocle on a chain,
// and a cold tinny clutched to its chest.
export function makeGull() {
  const root = new Group(), body = pivot(root, 0, 0, 0);
  const white = M('#f2f1ec', { roughness: 0.95 }), grey = M('#a3abb2', { roughness: 0.92 }), dark = M('#5a6168', { roughness: 0.9 }), orange = M('#f08a24', { roughness: 0.6 }), yellow = M('#f6c02a', { roughness: 0.5 });
  const legs = [];
  for (const s of [-1, 1]) {
    const l = pivot(body, s * 0.11, 0.4, 0.02);
    part(l, G('sgLeg', () => new CylinderGeometry(0.025, 0.02, 0.4, 6)), orange, 0, -0.2, 0);
    for (const a of [-0.5, 0, 0.5]) part(l, G('sgToe', () => new BoxGeometry(0.025, 0.018, 0.12)), orange, Math.sin(a) * 0.05, -0.4, -0.05, { ry: a });
    legs.push(l);
  }
  part(body, G('sgBody', () => new SphereGeometry(0.3, 20, 14)), white, 0, 0.62, 0, { sz: 1.4, sy: 0.92 });
  // ruffled plumage tufts all over the chest, neck and crown
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39, h = (i % 7) / 7;
    part(body, G('sgTuft', () => new ConeGeometry(0.045, 0.13, 5)), i % 3 ? white : M('#e2e2dc', { roughness: 1 }), Math.cos(a) * 0.24 * (1 - h * 0.3), 0.5 + h * 0.42, -0.22 + Math.sin(a) * 0.12, { rx: -1.2 - h, rz: Math.cos(a) * 0.8, cast: false });
  }
  part(body, G('sgTail', () => new ConeGeometry(0.16, 0.36, 7)), grey, 0, 0.66, 0.46, { rx: 1.95 });
  part(body, G('sgTailTip', () => new ConeGeometry(0.1, 0.16, 6)), M('#1a1a1a'), 0, 0.71, 0.62, { rx: 1.95, cast: false });
  const head = pivot(body, 0, 0.98, -0.3);
  part(head, G('sgHead', () => new SphereGeometry(0.17, 20, 14)), white, 0, 0, 0, { sz: 1.1 });
  for (let i = 0; i < 6; i++) part(head, G('sgCrest', () => new ConeGeometry(0.03, 0.1, 4)), white, -0.06 + i * 0.025, 0.15, 0.03, { rx: 0.4 + (i % 2) * 0.3, rz: (i - 2.5) * 0.25, cast: false });
  // the hooked beak with its red spot, set in a smug grin
  part(head, G('sgBeakU', () => new ConeGeometry(0.06, 0.26, 8)), yellow, 0, -0.01, -0.24, { rx: -Math.PI / 2 - 0.12 });
  part(head, G('sgBeakHook', () => new SphereGeometry(0.03, 8, 6)), M('#e8a020'), 0, -0.04, -0.36, { cast: false });
  part(head, G('sgBeakL', () => new ConeGeometry(0.045, 0.2, 8)), yellow, 0, -0.06, -0.21, { rx: -Math.PI / 2 + 0.2 });
  part(head, G('sgSpot', () => new SphereGeometry(0.018, 8, 6)), M('#d8202a'), 0, -0.075, -0.29, { cast: false });
  part(head, G('sgSmirk', () => new TorusGeometry(0.06, 0.006, 4, 10, Math.PI * 0.6)), M('#7a5a10'), 0.02, -0.05, -0.16, { rz: Math.PI * 1.15, ry: 0.4, cast: false });
  // shifty half-lidded eyes (yellow iris), one behind a bottle-cap monocle
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = pivot(head, s * 0.09, 0.045, -0.1);
    part(e, G('sgEyeW', () => new SphereGeometry(0.042, 14, 10)), M('#fbf6d8', { roughness: 0.2 }), 0, 0, 0, { cast: false });
    const pupil = part(e, G('sgIris', () => new SphereGeometry(0.026, 10, 8)), M('#d8c22a', { roughness: 0.2 }), 0, 0, -0.03, { cast: false, sz: 0.5 });
    part(pupil, G('sgPupil', () => new SphereGeometry(0.012, 8, 6)), M('#0a0a0a'), 0, 0, -0.012, { cast: false });
    part(e, G('sgLid', () => new SphereGeometry(0.046, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), M('#8a8f96', { roughness: 0.8 }), 0, 0, 0, { rx: -0.55, cast: false }); // heavy, suspicious lid
    part(e, G('sgBrow', () => new BoxGeometry(0.09, 0.02, 0.03)), dark, 0, 0.05, -0.02, { rz: s * -0.45, cast: false });
    eyes.push({ pupil, r: 0.04, ox: 0, oy: 0, vx: 0, vy: 0 });
  }
  const mono = pivot(head, -0.09, 0.045, -0.15);
  part(mono, G('sgCap', () => new CylinderGeometry(0.058, 0.062, 0.018, 21)), M('#1d3f8a', { metalness: 0.8, roughness: 0.3 }), 0, 0, 0, { rx: Math.PI / 2 });
  part(mono, G('sgCapLens', () => new CircleGeometry(0.044, 16)), TM('monoGlass', () => new MeshPhysicalMaterial({ color: '#e8f4ff', roughness: 0.02, transparent: true, opacity: 0.35, clearcoat: 1 })), 0, 0, -0.011, { ry: Math.PI, cast: false });
  for (let i = 0; i < 6; i++) part(mono, G('sgChain', () => new TorusGeometry(0.01, 0.003, 4, 8)), M('#d8b040', { metalness: 0.9, roughness: 0.3 }), -0.02 + i * 0.012, -0.06 - i * 0.022, 0.0, { ry: i % 2 ? Math.PI / 2 : 0, cast: false });
  // layered wings with dark tips
  const wings = [];
  for (const s of [-1, 1]) {
    const w = pivot(body, s * 0.25, 0.72, 0);
    part(w, G('sgWing', () => new BoxGeometry(0.52, 0.04, 0.46)), grey, s * 0.25, 0, 0);
    part(w, G('sgWing2', () => new BoxGeometry(0.4, 0.035, 0.34)), M('#b8bec4', { roughness: 0.9 }), s * 0.2, 0.025, -0.04, { cast: false });
    part(w, G('sgWingTip', () => new BoxGeometry(0.2, 0.03, 0.3)), M('#1d1d1d'), s * 0.56, -0.005, 0.08, { cast: false });
    wings.push(w);
  }
  // the stolen tinny, held to the chest
  const can = pivot(body, 0.12, 0.6, -0.36);
  part(can, G('sgCan', () => new CylinderGeometry(0.07, 0.07, 0.24, 16)), TM('canLbl', () => new MeshPhysicalMaterial({ map: TEX.canLabel(), roughness: 0.25, metalness: 0.6, clearcoat: 1 })), 0, 0, 0, { rz: 0.25 });
  part(can, G('sgCanTop', () => new CylinderGeometry(0.066, 0.07, 0.02, 16)), M('#c8ccd0', { metalness: 0.9, roughness: 0.25 }), -0.03, 0.12, 0, { rz: 0.25, cast: false });
  root.userData.parts = { body, legs, head, wings, chip: can, eyes };
  return root;
}

// ------------------------------------------------------------------ POSSUM BURGLAR
// Wide unhinged eyes and a toothy grin, bushy ringed tail (tied with a scrap of cloth), green bandana, patched leather
// vest and tool belt, a grappling hook in one paw and a pine cone in the other, and a bulging SWAG sack.
export function makePossum() {
  const root = new Group(), body = pivot(root, 0, 0, 0);
  const fur = M('#6e6258', { roughness: 1 }), furL = M('#b0a496', { roughness: 1 }), furD = M('#2e2824', { roughness: 1 }), pink = M('#e7a0a8', { roughness: 0.6 });
  const leather = M('#5a3a22', { roughness: 0.75 }), green = M('#4a6a3a', { roughness: 0.95 });
  const legs = [];
  for (const s of [-1, 1]) {
    const l = pivot(body, s * 0.17, 0.3, 0.04);
    part(l, G('pbLeg', () => new CylinderGeometry(0.08, 0.065, 0.3, 10)), fur, 0, -0.15, 0);
    part(l, G('pbFoot', () => new SphereGeometry(0.07, 10, 8)), pink, 0, -0.3, -0.06, { sy: 0.5, sz: 1.5 });
    legs.push(l);
  }
  part(body, G('pbBody', () => new SphereGeometry(0.34, 20, 14)), fur, 0, 0.56, 0, { sy: 1.15 });
  part(body, G('pbBelly', () => new SphereGeometry(0.24, 16, 12)), furL, 0, 0.5, -0.15);
  // patched leather vest + belt with tools
  part(body, G('pbVest', () => new CylinderGeometry(0.33, 0.35, 0.36, 16, 1, true)), TM('pbVestMat', () => new MeshPhysicalMaterial({ color: '#5a3a22', roughness: 0.75, side: DoubleSide })), 0, 0.62, 0.02, { sz: 0.95 });
  part(body, G('pbPatch', () => new PlaneGeometry(0.1, 0.09)), M('#7a5a3a', { roughness: 0.9 }), 0.2, 0.66, -0.26, { ry: Math.PI + 0.5, cast: false });
  part(body, G('pbBelt', () => new CylinderGeometry(0.35, 0.35, 0.05, 16)), M('#3a2414', { roughness: 0.7 }), 0, 0.44, 0);
  part(body, G('pbPouch', () => new BoxGeometry(0.1, 0.12, 0.07)), leather, -0.27, 0.42, -0.12, { ry: 0.6 });
  part(body, G('pbWrench', () => new BoxGeometry(0.025, 0.16, 0.012)), M('#9aa0a6', { metalness: 0.9, roughness: 0.3 }), 0.25, 0.42, -0.2, { rz: 0.3, cast: false });
  // the SWAG sack, bulging with loot
  const sack = pivot(body, 0, 0.78, 0.33);
  part(sack, G('pbSack', () => new SphereGeometry(0.3, 18, 14)), TM('swag', () => new MeshPhysicalMaterial({ map: TEX.burlap('SWAG'), roughness: 1, sheen: 0.5, sheenColor: new Color('#e0c090') })), 0, 0, 0, { sy: 1.05, ry: Math.PI });
  part(sack, G('pbNeck', () => new CylinderGeometry(0.08, 0.13, 0.12, 12)), TM('burlapPlain', () => new MeshStandardMaterial({ map: TEX.burlap(''), roughness: 1 })), 0, 0.32, 0);
  part(sack, G('pbRope', () => new TorusGeometry(0.085, 0.015, 6, 14)), M('#c8a870', { roughness: 1 }), 0, 0.3, 0, { rx: Math.PI / 2, cast: false });
  part(sack, G('pbSpoon', () => new CylinderGeometry(0.008, 0.008, 0.2, 5)), M('#d0d4d8', { metalness: 1, roughness: 0.2 }), 0.03, 0.44, 0, { rz: 0.3, cast: false });
  part(sack, G('pbClock', () => new CylinderGeometry(0.04, 0.04, 0.015, 14)), M('#d8b040', { metalness: 0.9, roughness: 0.3 }), -0.04, 0.4, 0.02, { rx: 1.2, cast: false });
  part(sack, G('pbKey', () => new TorusGeometry(0.02, 0.006, 4, 10)), M('#b88a3a', { metalness: 0.9 }), 0.12, 0.1, -0.24, { cast: false });
  for (const s of [-1, 1]) part(body, G('pbStrap', () => new TorusGeometry(0.3, 0.015, 4, 16, Math.PI * 0.7)), M('#c8a870', { roughness: 1 }), s * 0.18, 0.72, 0.05, { ry: Math.PI / 2, rz: 0.3 * s, cast: false });
  // head: big round skull, huge unhinged eyes, toothy grin, pink nose, big ears, whiskers, green bandana
  const head = pivot(body, 0, 1.0, -0.06);
  part(head, G('pbHead', () => new SphereGeometry(0.25, 20, 16)), fur, 0, 0, 0);
  part(head, G('pbMuzzle', () => new SphereGeometry(0.13, 14, 10)), furL, 0, -0.07, -0.19, { sz: 1.1 });
  part(head, G('pbNose', () => new SphereGeometry(0.05, 10, 8)), pink, 0, -0.03, -0.32, { sy: 0.8 });
  for (const s of [-1, 1]) {
    part(head, G('pbEar', () => new SphereGeometry(0.1, 12, 8)), fur, s * 0.17, 0.2, 0.0, { sx: 0.55, sy: 1.25, rz: s * 0.4 });
    part(head, G('pbEarIn', () => new SphereGeometry(0.075, 10, 8)), pink, s * 0.17, 0.2, -0.04, { sx: 0.4, sy: 1.1, rz: s * 0.4, cast: false });
    for (let k = 0; k < 3; k++) part(head, G('pbWhisk', () => new CylinderGeometry(0.0025, 0.0025, 0.22, 3)), M('#f0f0f0'), s * 0.14, -0.06 - k * 0.02, -0.24, { rz: Math.PI / 2 + s * (k - 1) * 0.15, cast: false });
  }
  const eyes = [];
  googly(head, 0.1, 0.07, -0.18, 0.1, eyes);
  for (const s of [-1, 1]) part(head, G('pbBrow', () => new BoxGeometry(0.1, 0.022, 0.03)), furD, s * 0.1, 0.19, -0.2, { rz: s * 0.35, cast: false }); // raised, manic
  part(head, G('pbMouth', () => new SphereGeometry(0.09, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5)), M('#4a1a14'), 0, -0.11, -0.25, { sx: 1.3, sz: 0.5, cast: false });
  for (let i = 0; i < 6; i++) part(head, G('pbTooth', () => new ConeGeometry(0.012, 0.035, 4)), M('#fffbe6', { roughness: 0.3 }), -0.075 + i * 0.03, -0.115, -0.275, { rx: Math.PI, cast: false });
  part(head, G('pbBandana', () => new TorusGeometry(0.2, 0.04, 6, 16)), green, 0, -0.17, 0.02, { rx: Math.PI / 2 + 0.2 });
  part(head, G('pbBandanaTri', () => new ConeGeometry(0.12, 0.16, 3)), green, 0, -0.26, -0.13, { rx: Math.PI + 0.4, cast: false });
  // bushy ringed tail: a tapering chain of alternating dark / grey puffs, with a cloth tie
  const tail = pivot(body, 0, 0.36, 0.3);
  for (let i = 0; i < 10; i++) {
    const r = 0.13 - i * 0.006, a = i * 0.22;
    part(tail, G('pbRing' + i, () => new SphereGeometry(r, 12, 10)), i % 2 ? furD : fur, 0, Math.sin(a) * 0.55 + i * 0.03, 0.06 + Math.cos(a) * 0.1 + i * 0.07, { cast: i % 3 === 0 });
  }
  part(tail, G('pbTie', () => new TorusGeometry(0.11, 0.02, 4, 12)), M('#8a3a2a', { roughness: 0.9 }), 0, 0.48, 0.5, { rx: 1.2, cast: false });
  // throwing arm (pine cone) and the grappling-hook arm
  const arm = pivot(body, 0.3, 0.75, -0.1);
  part(arm, G('pbArm', () => new CylinderGeometry(0.05, 0.045, 0.35, 8)), fur, 0, -0.15, 0);
  part(arm, G('pbGlove', () => new SphereGeometry(0.055, 10, 8)), leather, 0, -0.32, 0);
  const cone = part(arm, G('pcone', () => new ConeGeometry(0.1, 0.24, 8)), M('#7a4a22', { roughness: 1 }), 0, -0.4, 0, { rx: Math.PI });
  const hookArm = pivot(body, -0.3, 0.8, -0.1);
  hookArm.rotation.set(-1.9, 0, -0.3);
  part(hookArm, G('pbArm', () => new CylinderGeometry(0.05, 0.045, 0.35, 8)), fur, 0, -0.15, 0);
  part(hookArm, G('pbGlove', () => new SphereGeometry(0.055, 10, 8)), leather, 0, -0.32, 0);
  const hook = pivot(hookArm, 0, -0.36, 0);
  const steel = M('#9aa2aa', { metalness: 0.95, roughness: 0.25 });
  part(hook, G('pbHookShaft', () => new CylinderGeometry(0.012, 0.012, 0.22, 6)), steel, 0, -0.08, 0);
  for (let i = 0; i < 3; i++) part(hook, G('pbProng', () => new TorusGeometry(0.05, 0.01, 4, 8, Math.PI * 0.8)), steel, Math.cos(i * 2.09) * 0.03, -0.2, Math.sin(i * 2.09) * 0.03, { ry: i * 2.09, rz: Math.PI * 0.6, cast: false });
  part(hook, G('pbRopeCoil', () => new TorusGeometry(0.07, 0.014, 6, 16)), M('#c8a870', { roughness: 1 }), 0, 0.06, 0, { rx: Math.PI / 2, cast: false });
  root.userData.parts = { body, legs, head, tail, arm, cone, eyes, hook };
  return root;
}

// ------------------------------------------------------------------ THE GRIM CUTTER (feral ride-on mower)
// Rune-etched dark iron armour, glowing red headlight eyes, a snarling fanged grille with a spiked bumper, a skull on
// the hood, spiked mud-caked tyres, horned seat with chains, spinning rusty blades and twin smoking exhausts.
export function makeMower() {
  const root = new Group(), body = pivot(root, 0, 0, 0);
  const iron = TM('ironRunes', () => new MeshPhysicalMaterial({ map: TEX.ironRunes(), emissiveMap: TEX.runeGlow(), emissive: new Color('#ff3a1a'), emissiveIntensity: 1.4, metalness: 0.75, roughness: 0.55, clearcoat: 0.2 }));
  const darkIron = M('#2a2b2e', { metalness: 0.8, roughness: 0.5 }), rust = M('#6b3a1e', { metalness: 0.5, roughness: 0.8 }), black = M('#141414', { roughness: 0.9 });
  const bone = M('#e8dcc0', { roughness: 0.7 }), fang = M('#e8e4d8', { roughness: 0.35 });
  part(body, G('gcDeck', () => new BoxGeometry(1.6, 0.25, 2.0)), darkIron, 0, 0.36, 0);
  part(body, G('gcBody', () => new BoxGeometry(1.25, 0.5, 1.75)), iron, 0, 0.72, 0.05);
  part(body, G('gcHood', () => new BoxGeometry(1.1, 0.5, 0.9)), iron, 0, 1.0, -0.45);
  part(body, G('gcHoodSlope', () => new BoxGeometry(1.08, 0.12, 0.5)), iron, 0, 1.28, -0.62, { rx: 0.35 });
  // the snarling face: dark maw, fangs top & bottom, glowing angry eyes under heavy brows
  part(body, G('gcMaw', () => new BoxGeometry(0.9, 0.34, 0.08)), M('#0a0505'), 0, 0.78, -0.9);
  for (let i = 0; i < 7; i++) {
    part(body, G('gcFangT', () => new ConeGeometry(0.045, 0.2, 5)), fang, -0.36 + i * 0.12, 0.88, -0.93, { rx: Math.PI, cast: false });
    part(body, G('gcFangB', () => new ConeGeometry(0.04, 0.15, 5)), fang, -0.3 + i * 0.1, 0.66, -0.93, { cast: false });
  }
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = pivot(body, s * 0.3, 1.08, -0.9);
    part(e, G('gcEyeSock', () => new CylinderGeometry(0.15, 0.15, 0.06, 16)), black, 0, 0, 0, { rx: Math.PI / 2, cast: false });
    const pupil = part(e, G('gcEye', () => new SphereGeometry(0.11, 16, 12)), M('#ff2a1a', { emissive: '#ff1a0a', emissiveIntensity: 6, roughness: 0.2 }), 0, 0, -0.03, { cast: false, sz: 0.6 });
    part(e, G('gcBrow', () => new BoxGeometry(0.38, 0.08, 0.1)), darkIron, 0, 0.13, -0.03, { rz: s * 0.5, cast: false });
    eyes.push({ pupil, r: 0.04, ox: 0, oy: 0, vx: 0, vy: 0 });
  }
  // spiked bumper
  part(body, G('gcBumper', () => new BoxGeometry(1.5, 0.16, 0.16)), rust, 0, 0.45, -1.05);
  for (let i = 0; i < 5; i++) part(body, G('gcSpike', () => new ConeGeometry(0.05, 0.3, 6)), M('#8a8f94', { metalness: 0.9, roughness: 0.4 }), -0.6 + i * 0.3, 0.45, -1.25, { rx: -Math.PI / 2 });
  // skull on the hood, wrapped in vines
  part(body, G('gcSkull', () => new SphereGeometry(0.15, 14, 12)), bone, 0.1, 1.42, -0.55, { sy: 0.9 });
  part(body, G('gcJaw', () => new BoxGeometry(0.16, 0.06, 0.12)), bone, 0.1, 1.31, -0.62);
  for (const s of [-1, 1]) part(body, G('gcSkullEye', () => new SphereGeometry(0.035, 8, 6)), M('#0a0505'), 0.1 + s * 0.055, 1.44, -0.68, { cast: false });
  for (let i = 0; i < 4; i++) part(body, G('gcVine', () => new TorusGeometry(0.16, 0.012, 4, 12, Math.PI * 1.2)), M('#4a6a2a', { roughness: 0.9 }), 0.1, 1.4, -0.55, { rx: i * 0.8, ry: i * 1.3, cast: false });
  // seat with horns and chains, steering wheel
  part(body, G('gcSeat', () => new BoxGeometry(0.62, 0.12, 0.52)), black, 0, 1.05, 0.48);
  part(body, G('gcBack', () => new BoxGeometry(0.62, 0.62, 0.12)), darkIron, 0, 1.38, 0.74);
  for (const s of [-1, 1]) part(body, G('gcHorn', () => new ConeGeometry(0.07, 0.42, 8)), bone, s * 0.36, 1.78, 0.74, { rz: -s * 0.6 });
  part(body, G('gcSeatEye', () => new SphereGeometry(0.06, 10, 8)), M('#ff2a1a', { emissive: '#ff1a0a', emissiveIntensity: 4 }), 0, 1.5, 0.67, { cast: false });
  for (let i = 0; i < 8; i++) part(body, G('gcLink', () => new TorusGeometry(0.035, 0.01, 4, 8)), M('#6a6e72', { metalness: 0.9, roughness: 0.4 }), -0.4 + i * 0.1, 1.15 - Math.sin(i / 7 * Math.PI) * 0.15, 0.2, { ry: i % 2 ? Math.PI / 2 : 0, cast: false });
  part(body, G('gcCol', () => new CylinderGeometry(0.04, 0.04, 0.5, 6)), black, 0, 1.35, -0.05, { rx: 0.4 });
  part(body, G('gcWheel', () => new TorusGeometry(0.2, 0.035, 6, 16)), black, 0, 1.58, -0.15, { rx: 1.2 });
  // horn (kept for the honk squash) = the left exhaust; twin smoking exhausts
  const horn = pivot(body, -0.45, 1.3, 0.35);
  part(horn, G('gcExhaust', () => new CylinderGeometry(0.07, 0.08, 0.6, 12)), rust, 0, 0.15, 0);
  part(horn, G('gcExRim', () => new TorusGeometry(0.075, 0.015, 6, 12)), M('#3a3a3a', { metalness: 0.8 }), 0, 0.45, 0, { rx: Math.PI / 2, cast: false });
  const exhaust = pivot(body, 0.45, 1.3, 0.35);
  part(exhaust, G('gcExhaust', () => new CylinderGeometry(0.07, 0.08, 0.6, 12)), rust, 0, 0.15, 0);
  part(exhaust, G('gcExRim', () => new TorusGeometry(0.075, 0.015, 6, 12)), M('#3a3a3a', { metalness: 0.8 }), 0, 0.45, 0, { rx: Math.PI / 2, cast: false });
  // spiked, mud-caked tyres
  const wheels = [];
  for (const [x, z, r] of [[-0.72, -0.62, 0.3], [0.72, -0.62, 0.3], [-0.74, 0.62, 0.42], [0.74, 0.62, 0.42]]) {
    const w = pivot(body, x, r, z);
    part(w, G('gcTyre' + r, () => new CylinderGeometry(r, r, 0.3, 18)), M('#1a1612', { roughness: 0.95 }), 0, 0, 0, { rz: Math.PI / 2 });
    part(w, G('gcRim' + r, () => new CylinderGeometry(r * 0.55, r * 0.55, 0.32, 12)), rust, 0, 0, 0, { rz: Math.PI / 2, cast: false });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; part(w, G('gcTyreSpike', () => new ConeGeometry(0.03, 0.12, 5)), M('#8a8f94', { metalness: 0.9, roughness: 0.4 }), Math.sign(x) * 0.12, Math.sin(a) * (r + 0.04), Math.cos(a) * (r + 0.04), { rx: a + Math.PI / 2, cast: false }); }
    wheels.push(w);
  }
  const blade = part(body, G('gcBlade', () => new BoxGeometry(1.4, 0.03, 0.14)), M('#8a5a3a', { metalness: 0.7, roughness: 0.5 }), 0, 0.2, 0, { cast: false });
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
