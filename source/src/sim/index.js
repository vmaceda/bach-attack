// BACH ATTACK! simulation. Pure JS (no three.js, no DOM): runs headless under node for soak tests.
//
//   const sim = createSim({ seed });
//   sim.step(h, cmd)            // fixed step; cmd = per-step command built by the controller (see blankCmd)
//   sim.state                   // everything the renderer / HUD / audio read
//   sim.state.events            // one-shot events this step batch (renderer drains with sim.drainEvents())
//   sim.queryPlacement(o, d, trapIndex, rot) / sim.raycastAll(o, d)
//
// The renderer never mutates state; the controller only talks to the sim through cmd.
import {
  PLAYER, WEAPONS, BLOWER, TRAPS, TRAP_TAG, WEAPON_TAG, ENEMIES, WAVES, ECONOMY, PATHS, DOORS, GOAL, PIT,
  PLAYER_SPAWN, SELL_REFUND, GRID, CALLOUTS,
} from '../contracts.js';
import { heightAt, collideCylinder, ceilingAt, raycast, solidAt } from './world.js';

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const isTrapTag = (t) => t in TRAP_TAG;
const tagName = (t) => TRAP_TAG[t] || WEAPON_TAG[t] || t;

export function blankCmd() {
  return {
    mx: 0, mz: 0, strafe: 0, aimYaw: 0, rayO: { x: 0, y: 2, z: 0 }, rayD: { x: 0, y: 0, z: -1 },
    fire: false, blow: false, jump: false, dash: false, swap: false,
    build: false, trap: 0, rot: 0, place: false, sell: false, startWave: false,
  };
}

export function createSim({ seed = 4207 } = {}) {
  let rng = mulberry32(seed);
  let S;

  function reset() {
    rng = mulberry32(seed);
    S = {
      t: 0, phase: 'build', wave: 0, buildT: ECONOMY.firstBuild, waveT: 0,
      money: ECONOMY.start, fridge: ECONOMY.fridge, fridgeMax: ECONOMY.fridge,
      player: {
        x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, z: PLAYER_SPAWN.z, vx: 0, vy: 0, vz: 0, onGround: true,
        yaw: PLAYER_SPAWN.yaw, hp: PLAYER.hp, dead: false, respawnT: 0, dashT: 0, dashCd: 0, dashX: 0, dashZ: 0,
        fireCd: 0, blowCd: 0, weapon: 'fizz', lastHurt: -99, faceAimT: 0, moving: 0, firedT: -9, blowT: -9,
      },
      enemies: [], traps: [], shots: [], cones: [], pickups: [],
      spawnQ: [], spawned: 0, waveTotal: 0,
      combo: { streak: 0, streakT: 0, best: 0, links: 0 },
      stats: { kills: 0, yeets: 0, combos: 0, leaks: 0 },
      events: [], nextId: 1,
    };
    sim.state = S;
    return S;
  }

  const ev = (type, o) => { o = o || {}; o.type = type; S.events.push(o); return o; };

  // ------------------------------------------------------------------ queries
  const tmpHit = {};
  // world + enemies along a ray. returns {t, x,y,z, enemy|null, box|null}
  function raycastAll(o, d, tMax = 150) {
    const w = raycast(o, d, tMax, 0, tmpHit, 'rail'); // shots + aim pass between the porch balusters
    let best = w ? w.t : tMax, en = null;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const D = ENEMIES[e.type];
      const cx = e.x - o.x, cy = e.y + D.height * 0.5 - o.y, cz = e.z - o.z;
      const tc = cx * d.x + cy * d.y + cz * d.z;
      if (tc < 0 || tc > best) continue;
      const px = cx - d.x * tc, py = cy - d.y * tc, pz = cz - d.z * tc;
      const rr = Math.max(D.radius, D.height * 0.55);
      const d2 = px * px + py * py + pz * pz;
      if (d2 > rr * rr) continue;
      const t = tc - Math.sqrt(rr * rr - d2);
      if (t < best) { best = Math.max(0, t); en = e; }
    }
    return { t: best, x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best, enemy: en, box: en ? null : w ? w.box : null };
  }

  // trap placement validation (also used by the renderer to colour the ghost)
  function queryPlacement(o, d, ti, rot = 0) {
    const T = TRAPS[ti];
    const q = { ok: false, reason: '', mount: T.mount, type: T.id, x: 0, y: 0, z: 0, nx: 0, nz: 0, rot, key: '', cost: T.cost, sellId: 0, hit: false };
    const h = raycast(o, d, 45, 0, {});
    if (!h) { q.reason = T.mount === 'ceil' ? 'Aim up at the carport ceiling, bro' : T.mount === 'wall' ? 'Aim at a wall, bro' : 'Aim at the ground, bro'; return q; }
    q.hit = true; q.x = h.x; q.y = h.y; q.z = h.z;
    // existing trap under the reticle (for selling)
    let near = null, nd = 2.2;
    for (const t of S.traps) {
      const dd = Math.hypot(t.x - h.x, t.y - h.y, t.z - h.z);
      if (dd < nd) { nd = dd; near = t; }
    }
    if (near) q.sellId = near.id;
    const kind = h.box.kind;
    if (T.mount === 'floor') {
      if (h.ny < 0.5 || !(kind === 'ground' || kind === 'deck' || kind === 'porch')) { q.reason = 'Floor trap — aim at the ground'; return q; }
      const cx = Math.floor(h.x / GRID) * GRID + GRID / 2, cz = Math.floor(h.z / GRID) * GRID + GRID / 2, y = h.y;
      q.x = cx; q.y = y; q.z = cz;
      if (y < -1) { q.reason = 'Can\'t build in the compost'; return q; }
      const s = GRID / 2 - 0.15;
      for (const [ax, az] of [[0, 0], [-s, -s], [s, -s], [-s, s], [s, s]]) {
        if (Math.abs(heightAt(cx + ax, cz + az, y + 0.01, 0.05) - y) > 0.02 || solidAt(cx + ax, y + 0.5, cz + az)) { q.reason = 'Uneven ground — needs a flat 2×2'; return q; }
      }
      if (Math.hypot(cx - DOORS.L.x, cz - DOORS.L.z) < 3.5 || Math.hypot(cx - DOORS.R.x, cz - DOORS.R.z) < 3.5) { q.reason = 'Too close to the door'; return q; }
      if (Math.hypot(cx - GOAL.x, cz - GOAL.z) < 2.6) { q.reason = 'Hands off the fridge'; return q; }
      q.key = `f:${cx}:${cz}:${y}`;
      const a = (rot % 4) * Math.PI * 0.5; q.nx = Math.cos(a); q.nz = Math.sin(a);
    } else if (T.mount === 'wall') {
      if (Math.abs(h.ny) > 0.1 || kind !== 'wall') { q.reason = 'Wall trap — aim at a wall'; return q; }
      const nx = h.nx, nz = h.nz, b = h.box;
      const alongX = Math.abs(nz) > 0.5; // face normal along z → wall runs along x
      const a = alongX ? h.x : h.z;
      const ca = Math.floor(a / GRID) * GRID + GRID / 2;
      const lo = alongX ? b.min[0] : b.min[2], hi = alongX ? b.max[0] : b.max[2];
      if (ca - 1 < lo - 0.01 || ca + 1 > hi + 0.01) { q.reason = 'Not enough wall there'; return q; }
      const fx = alongX ? ca : h.x, fz = alongX ? h.z : ca;
      const px = fx + nx * 0.8, pz = fz + nz * 0.8;
      const fl = heightAt(px, pz, h.y, 0.7);
      if (fl < -1) { q.reason = 'Nothing to slap over there'; return q; }
      for (const s of [-0.85, 0.85]) {
        const sx = alongX ? px + s : px, sz = alongX ? pz : pz + s;
        if (Math.abs(heightAt(sx, sz, fl + 0.05, 0.1) - fl) > 0.05) { q.reason = 'Floor in front is uneven'; return q; }
      }
      if (b.max[1] < fl + 2.2 || b.min[1] > fl + 0.05) { q.reason = 'Wall too low'; return q; }
      if (solidAt(px, fl + 1.1, pz)) { q.reason = 'Blocked'; return q; }
      q.x = fx; q.z = fz; q.y = fl + 1.15; q.floor = fl;
      const ang = [0, 0.6, -0.6][rot % 3], c = Math.cos(ang), s = Math.sin(ang);
      q.nx = nx * c - nz * s; q.nz = nx * s + nz * c; q.wnx = nx; q.wnz = nz;
      q.key = `w:${fx.toFixed(2)}:${fz.toFixed(2)}:${nx}:${nz}`;
    } else {
      if (h.ny > -0.5 || kind !== 'roof') { q.reason = 'Overhead trap — aim at a roof underside'; return q; }
      const b = h.box;
      const cx = Math.floor(h.x / GRID) * GRID + GRID / 2, cz = Math.floor(h.z / GRID) * GRID + GRID / 2;
      if (cx - 1 < b.min[0] - 0.01 || cx + 1 > b.max[0] + 0.01 || cz - 1 < b.min[2] - 0.01 || cz + 1 > b.max[2] + 0.01) { q.reason = 'Needs more roof'; return q; }
      const fl = heightAt(cx, cz, b.min[1] - 0.5, 0);
      q.x = cx; q.z = cz; q.y = b.min[1]; q.floor = fl;
      q.key = `c:${cx}:${cz}`;
    }
    const occ = S.traps.find((t) => t.key === q.key);
    if (occ) { q.sellId = occ.id; q.reason = 'Already a trap there'; return q; }
    if (S.money < T.cost) { q.reason = 'Not enough shrapnel'; q.poor = true; return q; }
    q.ok = true;
    return q;
  }

  function placeTrap(q) {
    if (!q.ok) { ev('deny', { text: q.reason }); return null; }
    const T = TRAPS.find((t) => t.id === q.type);
    S.money -= T.cost;
    const tr = {
      id: S.nextId++, type: q.type, mount: q.mount, key: q.key, x: q.x, y: q.y, z: q.z, nx: q.nx, nz: q.nz,
      wnx: q.wnx || 0, wnz: q.wnz || 0, floor: q.floor ?? q.y, rot: q.rot, cd: 0, phase: 'idle', pt: 0, disabledT: 0,
      inside: new Set(), fired: 0, spent: T.cost,
    };
    S.traps.push(tr);
    ev('trap', { act: 'place', trap: tr });
    return tr;
  }

  function sellTrap(id) {
    const i = S.traps.findIndex((t) => t.id === id);
    if (i < 0) return false;
    if (S.phase === 'wave') { ev('deny', { text: 'Yeah nah, can\'t flog it mid-wave' }); return false; }
    const tr = S.traps[i];
    const v = Math.round(tr.spent * SELL_REFUND);
    S.money += v; S.traps.splice(i, 1);
    ev('trap', { act: 'sell', trap: tr, value: v });
    return true;
  }

  // ------------------------------------------------------------------ waves
  function startWave() {
    if (S.phase !== 'build') return;
    const bonus = Math.floor(S.buildT * ECONOMY.earlyPerSec);
    if (bonus > 0 && S.wave > 0) { S.money += bonus; ev('msg', { text: `Early start: +${bonus} shrapnel`, small: true }); }
    const W = WAVES[S.wave];
    const q = [];
    for (const [type, count, every, door, delay] of W.groups) {
      for (let i = 0; i < count; i++) q.push({ t: delay + i * every + rng() * 0.25, type, door: door === 'A' ? (i % 2 ? 'R' : 'L') : door });
    }
    q.sort((a, b) => a.t - b.t);
    S.spawnQ = q; S.waveTotal = q.length; S.spawned = 0; S.waveT = 0; S.phase = 'wave';
    ev('waveStart', { wave: S.wave, name: W.name });
  }

  function spawnEnemy(type, door) {
    const D = ENEMIES[type], dr = DOORS[door];
    const e = {
      id: S.nextId++, type, x: dr.x + (rng() - 0.5) * 2.4, y: 0, z: dr.z + rng() * 0.6, vx: 0, vy: 0, vz: 0,
      yaw: 0, hp: D.hp, maxHp: D.hp, path: PATHS[door], wp: 0, start: null, onGround: true, dead: false,
      stunT: 0, slowT: 0, slowMul: 1, burnT: 0, burnDps: 0, wetX: 0, wetZ: 0, onWet: false, mar: false,
      chain: [], chainT: -9, lastSrc: '', shootT: 1 + rng() * 1.5, shots: 0, mode: 'walk', hurtT: -9,
      bob: rng() * 10, airT: 0,
    };
    e.start = { x: e.x, z: e.z };
    S.enemies.push(e);
    S.spawned++;
    ev('spawn', { id: e.id, etype: type, x: e.x, z: e.z });
  }

  // ------------------------------------------------------------------ combat
  function tag(e, t) {
    if (S.t - e.chainT > 3) e.chain.length = 0;
    e.chainT = S.t;
    if (e.chain[e.chain.length - 1] === t) return;
    e.chain.push(t);
    if (e.chain.length >= 2 && e.chain.some(isTrapTag)) comboLink(e);
  }

  function comboLink(e) {
    const n = e.chain.length;
    const C = S.combo;
    C.streak++; C.streakT = 4; C.links++; S.stats.combos++;
    if (C.streak > C.best) C.best = C.streak;
    const bonus = Math.round(3 * n * (1 + 0.1 * Math.min(C.streak, 10)));
    const pool = CALLOUTS[Math.min(n - 2, CALLOUTS.length - 1)];
    const text = pool[Math.floor(rng() * pool.length)];
    dropPickup(e.x, e.y + 0.8, e.z, bonus);
    ev('combo', { text, chain: e.chain.map(tagName).join(' → '), n, bonus, streak: C.streak, x: e.x, y: e.y, z: e.z });
  }

  function dropPickup(x, y, z, v) {
    S.pickups.push({ id: S.nextId++, x, y, z, vy: 4 + rng() * 2, vx: (rng() - 0.5) * 3, vz: (rng() - 0.5) * 3, v, t: 0 });
  }

  function damage(e, dmg, src, o) {
    if (e.dead) return;
    e.hp -= dmg; e.hurtT = S.t;
    if (o && (o.kx || o.kz || o.ky)) {
      const D = ENEMIES[e.type], m = D.mass;
      e.vx += (o.kx || 0) / m; e.vz += (o.kz || 0) / m; e.vy += (o.ky || 0) / Math.sqrt(m);
      if (o.ky && e.vy > 0.5) e.onGround = false;
    }
    e.lastSrc = src;
    tag(e, src);
    ev('hit', { id: e.id, etype: e.type, x: e.x, y: e.y + ENEMIES[e.type].height * 0.7, z: e.z, dmg, crit: !!(o && o.crit), src });
    if (e.hp <= 0) kill(e, src);
  }

  function kill(e, how) {
    if (e.dead) return;
    e.dead = true;
    const D = ENEMIES[e.type];
    S.money += D.bounty; S.stats.kills++;
    if (how === 'pit') S.stats.yeets++;
    if (e.chain.length >= 3) dropPickup(e.x, e.y + 0.8, e.z, 10 * e.chain.length);
    ev('kill', { id: e.id, etype: e.type, x: e.x, y: e.y, z: e.z, how, bounty: D.bounty, chain: e.chain.length });
  }

  function hurtPlayer(dmg, x, z) {
    const P = S.player;
    if (P.dead || P.dashT > 0) return;
    P.hp -= dmg; P.lastHurt = S.t;
    ev('playerHurt', { dmg, x, z });
    if (P.hp <= 0) { P.hp = 0; P.dead = true; P.respawnT = PLAYER.respawn; ev('playerDead', {}); }
  }

  function respawnPlayer(msg) {
    const P = S.player;
    Object.assign(P, { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, z: PLAYER_SPAWN.z, vx: 0, vy: 0, vz: 0, hp: PLAYER.hp, dead: false, dashT: 0 });
    ev('respawn', { text: msg });
  }

  function fire(cmd) {
    const P = S.player, W = WEAPONS[P.weapon];
    const fy = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = -fz, rz = fy; // forward / right of the aim yaw
    const mx = P.x + fy * 0.55 + rx * 0.38, my = P.y + 1.42, mz = P.z + fz * 0.55 + rz * 0.38;
    const hit = raycastAll(cmd.rayO, cmd.rayD, 150);
    let dx = hit.x - mx, dy = hit.y - my, dz = hit.z - mz;
    let dist = Math.hypot(dx, dy, dz);
    if (dist < 1.2) { dx = cmd.rayD.x; dy = cmd.rayD.y; dz = cmd.rayD.z; dist = 30; } else { dx /= dist; dy /= dist; dz /= dist; }
    // gravity compensation so the arc lands on the reticle point
    const tf = Math.min(dist, 60) / W.speed;
    const lift = 0.5 * W.gravity * tf;
    S.shots.push({ id: S.nextId++, w: P.weapon, x: mx, y: my, z: mz, vx: dx * W.speed, vy: dy * W.speed + lift, vz: dz * W.speed, life: W.life });
    P.fireCd = W.every; P.firedT = S.t; P.faceAimT = 0.7;
    ev('fire', { w: P.weapon, x: mx, y: my, z: mz, dx, dy, dz });
  }

  function blow(cmd) {
    const P = S.player;
    P.blowCd = BLOWER.cd; P.blowT = S.t; P.faceAimT = 0.7;
    const fx = -Math.sin(cmd.aimYaw), fz = -Math.cos(cmd.aimYaw);
    let n = 0;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const dx = e.x - P.x, dz = e.z - P.z, dy = e.y - P.y;
      const d = Math.hypot(dx, dz);
      if (d > BLOWER.range || Math.abs(dy) > 3) continue;
      const c = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (c < BLOWER.cosHalf) continue;
      const fall = 1 - 0.45 * (d / BLOWER.range);
      // push mostly along the cone axis (so you can aim shoves onto traps / off ledges)
      const px = (fx * 0.75 + (dx / (d || 1)) * 0.25), pz = (fz * 0.75 + (dz / (d || 1)) * 0.25);
      damage(e, BLOWER.dmg, 'blower', { kx: px * BLOWER.push * fall, kz: pz * BLOWER.push * fall, ky: BLOWER.lift * fall });
      n++;
    }
    ev('blow', { x: P.x, y: P.y + 1.2, z: P.z, yaw: cmd.aimYaw, n });
  }

  // ------------------------------------------------------------------ player
  function stepPlayer(h, cmd) {
    const P = S.player;
    P.fireCd -= h; P.blowCd -= h; P.dashCd -= h; P.faceAimT -= h;
    if (P.dead) {
      P.respawnT -= h;
      if (P.respawnT <= 0) respawnPlayer('Harden up! Back on the porch.');
      return;
    }
    let wx = cmd.mx, wz = cmd.mz;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    P.moving = Math.min(1, wl);
    if (cmd.swap) { P.weapon = P.weapon === 'fizz' ? 'pie' : 'fizz'; ev('swap', { w: P.weapon }); }
    if (cmd.jump && P.onGround) { P.vy = PLAYER.jump; P.onGround = false; ev('jump', {}); }
    if (cmd.dash && P.dashCd <= 0) {
      let dx = wx, dz = wz;
      if (wl < 0.1) { dx = -Math.sin(P.yaw); dz = -Math.cos(P.yaw); }
      const l = Math.hypot(dx, dz) || 1;
      P.dashX = dx / l; P.dashZ = dz / l; P.dashT = PLAYER.dashTime; P.dashCd = PLAYER.dashCd;
      ev('dash', { x: P.x, y: P.y, z: P.z });
    }
    if (P.dashT > 0) {
      P.dashT -= h;
      P.vx = P.dashX * PLAYER.dashSpeed; P.vz = P.dashZ * PLAYER.dashSpeed;
      if (P.dashT <= 0) { P.vx *= 0.35; P.vz *= 0.35; }
    } else {
      const a = (P.onGround ? PLAYER.accel : PLAYER.airAccel) * h;
      const tx = wx * PLAYER.speed - P.vx, tz = wz * PLAYER.speed - P.vz;
      const tl = Math.hypot(tx, tz);
      if (tl <= a) { P.vx += tx; P.vz += tz; } else { P.vx += (tx / tl) * a; P.vz += (tz / tl) * a; }
    }
    P.vy -= PLAYER.gravity * h;
    const wasGround = P.onGround, y0 = P.y;
    P.x += P.vx * h; P.z += P.vz * h;
    collideCylinder(P, PLAYER.radius, PLAYER.height, PLAYER.stepUp);
    P.y += P.vy * h;
    if (P.vy > 0) {
      const c = ceilingAt(P.x, P.z, y0 + PLAYER.height - 0.05);
      if (P.y + PLAYER.height > c) { P.y = c - PLAYER.height; P.vy = 0; }
    }
    const g = heightAt(P.x, P.z, Math.max(P.y, y0), PLAYER.stepUp);
    if (P.y <= g + 0.02 && P.vy <= 0) { P.y = g; P.vy = 0; P.onGround = true; }
    else if (wasGround && P.vy <= 0 && y0 - g < 0.35 && y0 - g > 0) { P.y = g; P.vy = 0; P.onGround = true; } // stick to small drops
    else P.onGround = false;
    if (P.y < PIT.killY) { respawnPlayer('Out of the compost, ya egg!'); return; }

    // facing: aim direction when firing / strafing / building, else the way we walk
    const strafing = Math.abs(cmd.strafe) > 0.3;
    let target = null;
    if (P.faceAimT > 0 || strafing || cmd.build || cmd.fire) target = cmd.aimYaw;
    else if (Math.hypot(P.vx, P.vz) > 1) target = Math.atan2(-P.vx, -P.vz);
    if (target !== null) P.yaw += angDiff(P.yaw, target) * Math.min(1, (P.faceAimT > 0 || cmd.fire ? 20 : 11) * h);

    if (!cmd.build) {
      if (cmd.fire && P.fireCd <= 0) { P.yaw = P.yaw + angDiff(P.yaw, cmd.aimYaw) * 0.6; fire(cmd); }
    }
    if (cmd.blow && P.blowCd <= 0) blow(cmd);
    if (S.t - P.lastHurt > PLAYER.regenDelay) P.hp = Math.min(PLAYER.hp, P.hp + PLAYER.regen * h);
  }

  // ------------------------------------------------------------------ traps
  function inZone(tr, e) {
    const D = ENEMIES[e.type];
    if (tr.mount === 'floor') return Math.abs(e.x - tr.x) < 1.05 + D.radius * 0.3 && Math.abs(e.z - tr.z) < 1.05 + D.radius * 0.3 && Math.abs(e.y - tr.y) < 0.45;
    if (tr.mount === 'wall') {
      const T = TRAPS[1];
      const dx = e.x - tr.x, dz = e.z - tr.z;
      const d = dx * tr.wnx + dz * tr.wnz, s = -dx * tr.wnz + dz * tr.wnx;
      return d > -0.2 && d < T.reach + D.radius && Math.abs(s) < 1.3 + D.radius * 0.5 && e.y > tr.floor - 0.6 && e.y < tr.floor + 1.6;
    }
    return Math.abs(e.x - tr.x) < 1.4 + D.radius * 0.4 && Math.abs(e.z - tr.z) < 1.4 + D.radius * 0.4 && e.y < tr.y && e.y > tr.y - 3.6;
  }

  function stepTraps(h) {
    for (const e of S.enemies) { e.onWet = false; e.mar = false; }
    for (const tr of S.traps) {
      tr.cd -= h;
      if (tr.disabledT > 0) { tr.disabledT -= h; if (tr.disabledT <= 0) ev('trap', { act: 'enable', trap: tr }); tr.inside.clear(); continue; }
      const now = new Set();
      for (const e of S.enemies) if (!e.dead && inZone(tr, e)) now.add(e);
      const T = TRAPS.find((t) => t.id === tr.type);
      if (tr.type === 'wet') {
        for (const e of now) {
          e.onWet = true; e.wetX = tr.nx; e.wetZ = tr.nz;
          if (!tr.inside.has(e)) {
            damage(e, 0, 'wet', { kx: tr.nx * 6, kz: tr.nz * 6 });
            ev('trap', { act: 'fire', trap: tr, x: e.x, z: e.z }); tr.fired++;
          }
        }
      } else if (tr.type === 'marmite') {
        for (const e of now) {
          e.mar = true; e.slowT = T.linger; e.slowMul = T.slow;
          if (!tr.inside.has(e)) { tag(e, 'marmite'); ev('trap', { act: 'fire', trap: tr, x: e.x, z: e.z }); tr.fired++; }
        }
      } else if (tr.type === 'sizzle') {
        if (tr.phase === 'idle' && tr.cd <= 0 && now.size) { tr.phase = 'warn'; tr.pt = T.warn; ev('trap', { act: 'warn', trap: tr }); }
        else if (tr.phase === 'warn') {
          tr.pt -= h;
          if (tr.pt <= 0) {
            tr.phase = 'idle'; tr.cd = T.cd; tr.fired++;
            ev('trap', { act: 'fire', trap: tr });
            for (const e of now) { e.burnT = T.burnT; e.burnDps = T.burn; damage(e, T.dmg, 'sizzle', { ky: 3 }); }
          }
        }
      } else if (tr.type === 'jandal') {
        if (tr.cd <= 0 && now.size) {
          tr.cd = T.cd; tr.fired++;
          ev('trap', { act: 'fire', trap: tr });
          for (const e of now) damage(e, T.dmg, 'jandal', { kx: tr.nx * T.push, kz: tr.nz * T.push, ky: T.lift });
        }
      } else if (tr.type === 'gate') {
        if (tr.phase === 'idle' && tr.cd <= 0 && now.size) { tr.phase = 'drop'; tr.pt = T.delay; ev('trap', { act: 'warn', trap: tr }); }
        else if (tr.phase === 'drop') {
          tr.pt -= h;
          if (tr.pt <= 0) {
            tr.phase = 'idle'; tr.cd = T.cd; tr.fired++;
            ev('trap', { act: 'fire', trap: tr });
            for (const e of now) { e.stunT = T.stun; damage(e, T.dmg, 'gate', { ky: -2 }); }
          }
        }
      }
      tr.inside = now;
    }
  }

  // ------------------------------------------------------------------ enemies
  function stepEnemies(h) {
    const P = S.player;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const D = ENEMIES[e.type];
      e.stunT -= h; e.slowT -= h; e.bob += h;
      if (e.slowT <= 0) e.slowMul = 1;
      if (e.burnT > 0) {
        e.burnT -= h; e.hp -= e.burnDps * h;
        if (e.hp <= 0) { kill(e, 'sizzle'); continue; }
      }
      // ---- navigation: follow the current path segment with a lookahead point, so a pest that skids or gets
      //      shoved sideways recovers while still moving forward (never ping-pongs back onto the same trap)
      const path = e.path, last = path.length - 1;
      let A = e.wp > 0 ? path[e.wp - 1] : e.start, B = path[e.wp];
      let abx = B.x - A.x, abz = B.z - A.z, L2 = abx * abx + abz * abz || 1;
      let tt = ((e.x - A.x) * abx + (e.z - A.z) * abz) / L2;
      if (e.wp < last && (tt > 0.97 || Math.hypot(B.x - e.x, B.z - e.z) < 1.4)) {
        e.wp++; A = B; B = path[e.wp];
        abx = B.x - A.x; abz = B.z - A.z; L2 = abx * abx + abz * abz || 1;
        tt = ((e.x - A.x) * abx + (e.z - A.z) * abz) / L2;
      }
      const la = Math.min(1, Math.max(0, tt) + 2.5 / Math.sqrt(L2));
      const tx = e.wp === last && la >= 1 ? B.x : A.x + abx * la, tz = e.wp === last && la >= 1 ? B.z : A.z + abz * la;
      const dx = tx - e.x, dz = tz - e.z, dist = Math.hypot(dx, dz);
      let speed = D.speed * (e.slowT > 0 ? e.slowMul : 1);
      if (e.stunT > 0) speed = 0;
      // ---- possum: stop and lob pine cones at the player (or gum up a trap)
      if (D.range && e.stunT <= 0) {
        const pd = Math.hypot(P.x - e.x, P.z - e.z);
        const engaged = !P.dead && pd < D.range && Math.abs(P.y - e.y) < 6;
        e.mode = engaged ? 'shoot' : 'walk';
        if (engaged) {
          speed = pd < D.keep ? 0 : speed * 0.15;
          e.shootT -= h;
          if (e.shootT <= 0) {
            e.shootT = D.every; e.shots++;
            let tx = P.x + P.vx * 0.5, ty = P.y + 1.1, tz = P.z + P.vz * 0.5, trapId = 0;
            if (e.shots % 3 === 0) {
              let best = null, bd = 13;
              for (const tr of S.traps) { const d2 = Math.hypot(tr.x - e.x, tr.z - e.z); if (d2 < bd && tr.disabledT <= 0) { bd = d2; best = tr; } }
              if (best) { tx = best.x; ty = best.mount === 'floor' ? best.y : best.floor; tz = best.z; trapId = best.id; }
            }
            const ox = e.x, oy = e.y + 1.0, oz = e.z;
            const dd = Math.hypot(tx - ox, tz - oz), tf = clamp(dd / 12, 0.5, 1.5), g = 18;
            S.cones.push({ x: ox, y: oy, z: oz, vx: (tx - ox) / tf, vy: (ty - oy) / tf + 0.5 * g * tf, vz: (tz - oz) / tf, g, trapId, life: 4 });
            ev('cone', { x: ox, y: oy, z: oz });
            e.yaw = Math.atan2(-(tx - ox), -(tz - oz));
          }
        }
      }
      // ---- steering (low traction on wet decking = skid)
      let wx = 0, wz = 0;
      if (dist > 0.01) { wx = (dx / dist) * speed; wz = (dz / dist) * speed; }
      let trac = e.onGround ? (e.onWet ? 0.45 : 9) : 0.3;
      if (D.mass > 3 && e.onGround) trac = e.onWet ? 0.9 : 6;
      const k = Math.min(1, trac * h);
      e.vx += (wx - e.vx) * k; e.vz += (wz - e.vz) * k;
      if (e.onWet && e.onGround) { e.vx += e.wetX * 14 * h; e.vz += e.wetZ * 14 * h; }
      e.vy -= 22 * h;
      const y0 = e.y;
      e.x += e.vx * h; e.z += e.vz * h;
      const bonk = collideCylinder(e, D.radius, D.height, 0.7);
      if (bonk && !e.onGround && Math.hypot(e.vx, e.vz) > 8) { damage(e, 6, 'wall'); e.vx *= -0.3; e.vz *= -0.3; }
      e.y += e.vy * h;
      const g = heightAt(e.x, e.z, Math.max(e.y, y0), 0.7);
      if (e.y <= g + 0.02 && e.vy <= 0) {
        if (!e.onGround && e.airT > 0.6) ev('land', { id: e.id, x: e.x, y: g, z: e.z, etype: e.type });
        e.y = g; e.vy = 0; e.onGround = true; e.airT = 0;
      } else if (e.onGround && e.vy <= 0 && y0 - g < 0.3 && y0 > g) { e.y = g; e.vy = 0; }
      else { e.onGround = false; e.airT += h; }
      if (Math.hypot(e.vx, e.vz) > 0.4 && e.mode !== 'shoot') e.yaw += angDiff(e.yaw, Math.atan2(-e.vx, -e.vz)) * Math.min(1, 10 * h);
      // ---- yeeted into the compost
      if (e.y < PIT.killY) {
        tag(e, 'pit');
        kill(e, 'pit');
        ev('yeet', { x: e.x, y: e.y, z: e.z, etype: e.type });
        continue;
      }
      // ---- reached the fridge
      if (Math.hypot(GOAL.x - e.x, GOAL.z - e.z) < GOAL.r + D.radius && e.wp >= path.length - 1) {
        e.dead = true; S.fridge = Math.max(0, S.fridge - D.drain); S.stats.leaks++;
        ev('fridge', { dmg: D.drain, etype: e.type, x: e.x, z: e.z, left: S.fridge });
      }
      if (e.type === 'gull' && rng() < h * 0.12) ev('squawk', { x: e.x, z: e.z });
    }
    // separation (cheap O(n²), n ≤ ~70)
    const L = S.enemies;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.dead) continue;
      const ra = ENEMIES[a.type].radius;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.dead) continue;
        const rb = ENEMIES[b.type].radius, dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, rr = (ra + rb) * 0.9;
        if (d2 >= rr * rr || d2 < 1e-6 || Math.abs(a.y - b.y) > 1) continue;
        const d = Math.sqrt(d2), push = (rr - d) * 0.5 / d;
        const ma = ENEMIES[a.type].mass, mb = ENEMIES[b.type].mass, wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.x -= dx * push * wa * 2; a.z -= dz * push * wa * 2; b.x += dx * push * wb * 2; b.z += dz * push * wb * 2;
      }
    }
  }

  // ------------------------------------------------------------------ projectiles / pickups
  function stepShots(h) {
    for (const s of S.shots) {
      const W = WEAPONS[s.w];
      s.life -= h;
      s.vy -= W.gravity * h;
      const len = Math.hypot(s.vx, s.vy, s.vz) * h;
      const d = { x: s.vx * h / len, y: s.vy * h / len, z: s.vz * h / len };
      const hit = raycastAll(s, d, len + W.radius);
      if (hit.t < len + W.radius - 1e-6 || s.life <= 0) {
        s.dead = true;
        const hx = hit.x, hy = hit.y, hz = hit.z;
        if (s.w === 'pie') {
          ev('splash', { x: hx, y: hy, z: hz, r: W.splash });
          for (const e of S.enemies) {
            if (e.dead) continue;
            const D = ENEMIES[e.type];
            const ex = e.x - hx, ey = e.y + D.height * 0.5 - hy, ez = e.z - hz, dd = Math.hypot(ex, ey, ez);
            if (dd > W.splash + D.radius) continue;
            const f = 1 - 0.6 * clamp(dd / W.splash, 0, 1), hd = Math.hypot(ex, ez) || 1;
            damage(e, W.dmg * f, 'pie', { kx: (ex / hd) * W.knock * f, kz: (ez / hd) * W.knock * f, ky: 3 * f });
          }
        } else if (hit.enemy && hit.t < len + W.radius) {
          const e = hit.enemy, D = ENEMIES[e.type];
          const crit = hy > e.y + D.height * 0.66;
          const o = crit ? { kx: d.x * W.critKnock, kz: d.z * W.critKnock, ky: 2, crit: true } : { crit: false };
          damage(e, W.dmg * (crit ? W.crit : 1), 'fizz', o);
        } else ev('impact', { x: hx, y: hy, z: hz, w: s.w });
      } else { s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h; }
    }
    S.shots = S.shots.filter((s) => !s.dead);

    const P = S.player;
    for (const c of S.cones) {
      c.life -= h; c.vy -= c.g * h;
      c.x += c.vx * h; c.y += c.vy * h; c.z += c.vz * h;
      if (!P.dead && Math.hypot(P.x - c.x, P.y + 1.1 - c.y, P.z - c.z) < 0.75) { c.dead = true; hurtPlayer(ENEMIES.possum.coneDmg, c.x, c.z); ev('coneHit', { x: c.x, y: c.y, z: c.z }); continue; }
      const g = heightAt(c.x, c.z, c.y, 0);
      if (c.y <= g || solidAt(c.x, c.y, c.z) || c.life <= 0) {
        c.dead = true;
        ev('impact', { x: c.x, y: Math.max(c.y, g), z: c.z, w: 'cone' });
        if (c.trapId) {
          const tr = S.traps.find((t) => t.id === c.trapId);
          if (tr && Math.hypot(tr.x - c.x, tr.z - c.z) < 2.2) { tr.disabledT = ENEMIES.possum.disable; ev('trap', { act: 'disable', trap: tr }); ev('msg', { text: 'Yeah, nah! A possum gummed up your trap', small: true }); }
        }
      }
    }
    S.cones = S.cones.filter((c) => !c.dead);

    for (const p of S.pickups) {
      p.t += h;
      const dx = P.x - p.x, dy = P.y + 1 - p.y, dz = P.z - p.z, d = Math.hypot(dx, dy, dz);
      if (!P.dead && (p.t > 3.5 || d < 2.2) && p.t > 0.5) {
        const sp = 9 + p.t * 4;
        p.x += (dx / d) * sp * h; p.y += (dy / d) * sp * h; p.z += (dz / d) * sp * h;
        if (d < 0.7) { p.dead = true; S.money += p.v; ev('pickup', { v: p.v, x: p.x, y: p.y, z: p.z }); }
      } else {
        p.vy -= 14 * h; p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
        const g = heightAt(p.x, p.z, p.y, 0.3);
        if (p.y < g + 0.3) { p.y = g + 0.3; p.vy = Math.abs(p.vy) * 0.35; p.vx *= 0.6; p.vz *= 0.6; }
      }
    }
    S.pickups = S.pickups.filter((p) => !p.dead);
  }

  // ------------------------------------------------------------------ step
  function step(h, cmd) {
    if (S.phase === 'won' || S.phase === 'lost') { S.t += h; return; }
    S.t += h;
    // build / sell / wave control
    if (cmd.startWave) startWave();
    if (cmd.build && cmd.place && !S.player.dead) placeTrap(queryPlacement(cmd.rayO, cmd.rayD, cmd.trap, cmd.rot));
    if (cmd.build && cmd.sell) {
      const q = queryPlacement(cmd.rayO, cmd.rayD, cmd.trap, cmd.rot);
      if (q.sellId) sellTrap(q.sellId); else ev('deny', { text: 'No trap there to flog' });
    }
    stepPlayer(h, cmd);
    stepTraps(h);
    stepEnemies(h);
    stepShots(h);
    S.enemies = S.enemies.filter((e) => !e.dead);
    if (S.combo.streakT > 0) { S.combo.streakT -= h; if (S.combo.streakT <= 0) S.combo.streak = 0; }

    if (S.phase === 'build') {
      S.buildT -= h;
      if (S.buildT <= 0) startWave();
    } else if (S.phase === 'wave') {
      S.waveT += h;
      while (S.spawnQ.length && S.spawnQ[0].t <= S.waveT) { const s = S.spawnQ.shift(); spawnEnemy(s.type, s.door); }
      if (!S.spawnQ.length && !S.enemies.length) {
        const bonus = ECONOMY.waveBonus + ECONOMY.waveBonusPer * S.wave;
        S.money += bonus;
        ev('waveClear', { wave: S.wave, bonus });
        S.wave++;
        if (S.wave >= WAVES.length) { S.phase = 'won'; ev('won', {}); }
        else { S.phase = 'build'; S.buildT = ECONOMY.build; }
      }
    }
    if (S.fridge <= 0 && S.phase !== 'lost') { S.phase = 'lost'; ev('lost', {}); }
  }

  function drainEvents() { const e = S.events; S.events = []; return e; }

  const sim = { state: null, reset, step, drainEvents, queryPlacement, raycastAll, sellTrap, startWave };
  reset();
  return sim;
}
