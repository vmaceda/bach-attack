// Collision world: pure math over contracts.BOXES (no three.js). Shared by player, enemies, projectiles, camera
// collision (the renderer calls sweepSphere) and trap placement raycasts.
import { BOXES } from '../contracts.js';

export const boxes = BOXES;

// highest walkable top under (x,z) that is at most stepUp above y (so you can step onto it)
export function heightAt(x, z, y = 1e9, stepUp = 0.7) {
  let best = -100;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i], mn = b.min, mx = b.max;
    if (x < mn[0] || x > mx[0] || z < mn[2] || z > mx[2]) continue;
    const top = mx[1];
    if (top <= y + stepUp && top > best) best = top;
  }
  return best;
}

// push a vertical cylinder (feet y, height h) out of every box that is a wall at its height. Mutates p.
// returns true if anything was hit (used for wall-bonk on knockback).
export function collideCylinder(p, r, h, stepUp) {
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i], mn = b.min, mx = b.max;
    if (mx[1] <= p.y + stepUp || mn[1] >= p.y + h) continue; // walkable or overhead
    const cx = p.x < mn[0] ? mn[0] : p.x > mx[0] ? mx[0] : p.x;
    const cz = p.z < mn[2] ? mn[2] : p.z > mx[2] ? mx[2] : p.z;
    let dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), k = (r - d) / d;
      p.x += dx * k; p.z += dz * k;
    } else {
      // centre inside the box: leave by the nearest face
      const l = p.x - mn[0], rr = mx[0] - p.x, f = p.z - mn[2], bk = mx[2] - p.z;
      const m = Math.min(l, rr, f, bk);
      if (m === l) p.x = mn[0] - r; else if (m === rr) p.x = mx[0] + r; else if (m === f) p.z = mn[2] - r; else p.z = mx[2] + r;
    }
  }
  return hit;
}

// lowest ceiling above head (for jump bonks); 1e9 when open sky
export function ceilingAt(x, z, y) {
  let best = 1e9;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i], mn = b.min, mx = b.max;
    if (x < mn[0] || x > mx[0] || z < mn[2] || z > mx[2]) continue;
    if (mn[1] >= y && mn[1] < best) best = mn[1];
  }
  return best;
}

// ray (o, unit d) vs one box inflated by pad. returns t or -1, writes face normal into nOut
function rayBox(o, d, b, pad, tMax, nOut) {
  let t0 = 0, t1 = tMax, axis = -1, sign = 0;
  for (let a = 0; a < 3; a++) {
    const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z;
    const lo = b.min[a] - pad, hi = b.max[a] + pad;
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return -1; continue; }
    let ta = (lo - oa) / da, tb = (hi - oa) / da, s = -1;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1; }
    if (ta > t0) { t0 = ta; axis = a; sign = s; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  if (axis < 0) return -1; // origin inside
  if (nOut) { nOut.x = axis === 0 ? sign : 0; nOut.y = axis === 1 ? sign : 0; nOut.z = axis === 2 ? sign : 0; }
  return t0;
}

const tmpN = { x: 0, y: 0, z: 0 };
// nearest box hit (skip: a box kind to ignore, e.g. 'rail' for bullets through the balusters). out = {t, x,y,z, nx,ny,nz, box}; returns out or null
export function raycast(o, d, tMax = 200, pad = 0, out = {}, skip = null) {
  let best = tMax, bb = null, nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < boxes.length; i++) {
    if (skip && boxes[i].kind === skip) continue;
    const t = rayBox(o, d, boxes[i], pad, best, tmpN);
    if (t >= 0 && t < best) { best = t; bb = boxes[i]; nx = tmpN.x; ny = tmpN.y; nz = tmpN.z; }
  }
  if (!bb) return null;
  out.t = best; out.box = bb; out.nx = nx; out.ny = ny; out.nz = nz;
  out.x = o.x + d.x * best; out.y = o.y + d.y * best; out.z = o.z + d.z * best;
  return out;
}

// sphere sweep (camera collision): distance the sphere can travel along d before touching geometry
export function sweepSphere(o, d, dist, r) {
  const h = raycast(o, d, dist, r, sweepOut);
  return h ? Math.max(0, h.t) : dist;
}
const sweepOut = {};

export function pointInBox(x, y, z, b, pad = 0) {
  return x >= b.min[0] - pad && x <= b.max[0] + pad && y >= b.min[1] - pad && y <= b.max[1] + pad && z >= b.min[2] - pad && z <= b.max[2] + pad;
}
export function solidAt(x, y, z) {
  for (let i = 0; i < boxes.length; i++) if (pointInBox(x, y, z, boxes[i])) return boxes[i];
  return null;
}
