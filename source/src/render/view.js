// View: mirrors sim.state into three.js objects every frame, runs the third-person camera rig (sphere-swept so walls
// and beams push it in), and turns sim events into particles, sounds and HUD pops. Never mutates the sim.
import { Vector3, Mesh, PlaneGeometry, BoxGeometry, MeshBasicMaterial, Group, ConeGeometry } from 'three';
import { makePlayer, ENEMY_MODEL, makeHealthBar, makeTrap, makeGhost } from './models.js';
import { CAMERA, ENEMIES, TRAPS, TRAP_BY_ID, GOAL } from '../contracts.js';
import { sweepSphere } from '../sim/world.js';

const D2R = Math.PI / 180;
const KILL_FX = {
  gull: { color: ['#ffffff', '#e8eaec', '#a9b1b8'], n: 26, speed: 5, size: 0.22, gravity: 2.5, drag: 2.5 },
  possum: { color: ['#6b5a4a', '#a8988a', '#3d3128'], n: 26, speed: 5, size: 0.24, gravity: 6 },
  mower: { color: ['#d8302a', '#333333', '#ffb43a', '#777777'], n: 50, speed: 8, size: 0.32, gravity: 9 },
};
const DIE_SFX = { gull: 'gullDie', possum: 'possumDie', mower: 'mowerDie' };

export function createView({ scene, camera, fx, audio, hud }) {
  const player = makePlayer();
  player.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(player);
  const PP = player.userData.parts;

  const enemies = new Map(); // id → {root, bar, type, lastHp, pop, dist}
  const traps = new Map();   // id → root
  const ghosts = {};
  const ghostZoneMat = new MeshBasicMaterial({ color: '#4dff7a', transparent: true, opacity: 0.18, depthWrite: false });
  const ghostZone = new Mesh(new PlaneGeometry(1, 1), ghostZoneMat);
  ghostZone.rotation.x = -Math.PI / 2; ghostZone.renderOrder = 4; ghostZone.visible = false;
  scene.add(ghostZone);

  const cam = { pivot: new Vector3(14, 4, 2), dist: CAMERA.dist, kick: 0, recoil: 0, shake: 0, fwd: new Vector3(), right: new Vector3() };
  let t = 0, hitMark = 0, lastSquawk = 0;

  function reset() {
    for (const [, e] of enemies) scene.remove(e.root, e.bar);
    enemies.clear();
    for (const [, r] of traps) scene.remove(r);
    traps.clear();
  }

  // ------------------------------------------------------------------ camera rig
  const o3 = { x: 0, y: 0, z: 0 }, d3 = { x: 0, y: 0, z: 0 };
  function updateCamera(dt, S, ctl) {
    const P = S.player;
    const k = Math.min(1, dt * 16), ky = Math.min(1, dt * 9);
    cam.pivot.x += (P.x - cam.pivot.x) * k;
    cam.pivot.z += (P.z - cam.pivot.z) * k;
    cam.pivot.y += (P.y + CAMERA.pivotY - cam.pivot.y) * ky;
    cam.recoil *= Math.max(0, 1 - dt * 12); cam.kick *= Math.max(0, 1 - dt * 8); cam.shake *= Math.max(0, 1 - dt * 6);
    const yaw = ctl.yaw, pitch = (ctl.pitch - cam.recoil) * D2R;
    const cp = Math.cos(pitch);
    const f = cam.fwd.set(-Math.sin(yaw) * cp, -Math.sin(pitch), -Math.cos(yaw) * cp);
    const r = cam.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    // 1) shoulder offset, swept (a wall at your right shoulder slides the camera over)
    o3.x = cam.pivot.x; o3.y = cam.pivot.y; o3.z = cam.pivot.z; d3.x = r.x; d3.y = 0; d3.z = r.z;
    const sh = Math.max(0, sweepSphere(o3, d3, CAMERA.shoulder, CAMERA.radius) - 0.02);
    o3.x += r.x * sh; o3.z += r.z * sh;
    // 2) boom back along -forward, swept (walls / the carport roof push the camera forward instead of clipping)
    d3.x = -f.x; d3.y = -f.y; d3.z = -f.z;
    const want = Math.max(0.15, sweepSphere(o3, d3, CAMERA.dist, CAMERA.radius) - 0.05);
    cam.dist = want < cam.dist ? want : cam.dist + (want - cam.dist) * Math.min(1, dt * 4);
    const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
    camera.position.set(o3.x - f.x * cam.dist + sx, o3.y - f.y * cam.dist + sy, o3.z - f.z * cam.dist);
    camera.lookAt(camera.position.x + f.x, camera.position.y + f.y, camera.position.z + f.z);
    const fov = CAMERA.fov + cam.kick;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    player.visible = cam.dist > 0.8 || P.dead;
  }

  // title-screen flyover
  function titleCamera(dt) {
    t += dt;
    const a = t * 0.08;
    camera.position.set(2 + Math.sin(a) * 30, 17 + Math.sin(a * 0.7) * 3, -1 + Math.cos(a) * 34);
    camera.lookAt(0, 0, 0);
    if (camera.fov !== CAMERA.fov) { camera.fov = CAMERA.fov; camera.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------ actors
  function syncPlayer(dt, S, ctl) {
    const P = S.player;
    player.position.set(P.x, P.y, P.z);
    player.rotation.y = P.yaw;
    const sp = Math.hypot(P.vx, P.vz);
    const ph = t * (sp > 0.5 ? 2.2 + sp * 0.9 : 0);
    const sw = Math.min(1, sp / 6) * 0.75;
    PP.legs[0].rotation.x = Math.sin(ph) * sw; PP.legs[1].rotation.x = -Math.sin(ph) * sw;
    PP.body.position.y = Math.abs(Math.sin(ph)) * 0.05 * sw;
    PP.torso.rotation.x = (P.dashT > 0 ? -0.5 : 0) - (ctl.pitch * D2R) * 0.35 * (P.onGround ? 1 : 0.5);
    PP.body.rotation.x = P.dead ? -Math.PI / 2 : 0;
    PP.body.position.z = P.dead ? 0.6 : 0;
    PP.fizz.visible = P.weapon === 'fizz'; PP.pie.visible = P.weapon === 'pie';
    const since = S.t - P.firedT;
    PP.gun.position.z = -0.42 + (since < 0.08 ? 0.08 * (1 - since / 0.08) : 0);
    const bsince = S.t - P.blowT;
    PP.blower.rotation.z = bsince < 0.4 ? Math.sin(bsince * 50) * 0.08 : 0;
  }

  function syncEnemies(dt, S) {
    const seen = new Set();
    for (const e of S.enemies) {
      seen.add(e.id);
      let v = enemies.get(e.id);
      if (!v) {
        const root = ENEMY_MODEL[e.type]();
        const bar = makeHealthBar(e.type === 'mower' ? 1.4 : 0.8);
        scene.add(root, bar);
        v = { root, bar, type: e.type, lastHp: e.hp, pop: 0, roll: 0 };
        enemies.set(e.id, v);
      }
      const D = ENEMIES[e.type], R = v.root, Pp = R.userData.parts;
      R.position.set(e.x, e.y, e.z);
      R.rotation.y = e.yaw;
      if (e.hp < v.lastHp) v.pop = 1;
      v.lastHp = e.hp;
      v.pop = Math.max(0, v.pop - dt * 6);
      const sp = Math.hypot(e.vx, e.vz);
      v.roll += sp * dt;
      const s = 1 + v.pop * 0.15;
      R.scale.set(s, s * (1 - v.pop * 0.1), s);
      // stun wobble / airborne tumble
      Pp.body.rotation.z = e.stunT > 0 ? Math.sin(t * 18) * 0.25 : !e.onGround ? Math.sin(t * 14 + e.id) * 0.5 : 0;
      Pp.body.rotation.x = !e.onGround && e.vy < -3 ? -0.6 : 0;
      if (e.type === 'gull') {
        const ph = v.roll * 5;
        Pp.legs[0].rotation.x = Math.sin(ph) * 0.9; Pp.legs[1].rotation.x = -Math.sin(ph) * 0.9;
        const flap = !e.onGround || e.onWet ? Math.sin(t * 30) * 0.9 : Math.sin(t * 6 + e.id) * 0.1;
        Pp.wings[0].rotation.z = 0.2 + flap; Pp.wings[1].rotation.z = -0.2 - flap;
        Pp.head.position.y = 0.86 + Math.abs(Math.sin(ph)) * 0.05;
      } else if (e.type === 'possum') {
        const ph = v.roll * 4;
        Pp.legs[0].rotation.x = Math.sin(ph) * 0.7; Pp.legs[1].rotation.x = -Math.sin(ph) * 0.7;
        Pp.tail.rotation.z = Math.sin(t * 3 + e.id) * 0.4;
        const throwP = e.mode === 'shoot' ? Math.max(0, 1 - (ENEMIES.possum.every - e.shootT) * 3) : 0;
        Pp.arm.rotation.x = e.mode === 'shoot' ? -2.4 + (1 - Math.min(1, e.shootT)) * 2 : 0;
        Pp.cone.visible = e.mode !== 'shoot' || e.shootT < ENEMIES.possum.every - 0.4;
      } else {
        for (const w of Pp.wheels) w.rotation.x = -v.roll * 3;
        Pp.blade.rotation.y = t * 40;
        Pp.body.position.y = Math.sin(t * 45) * 0.012;
        if (Math.random() < dt * 6) fx.emit(e.x + Math.sin(e.yaw) * -0.3, e.y + 1.5, e.z, 1, { color: ['#555555', '#777777'], speed: 0.6, life: 1.2, size: 0.35, gravity: -1.5, grow: 0.6 });
      }
      if (e.burnT > 0 && Math.random() < dt * 25) fx.emit(e.x, e.y + D.height * 0.6, e.z, 1, { color: ['#ff7a1a', '#ffd23a', '#ff3a1a'], speed: 1, life: 0.5, size: 0.25, gravity: -3 });
      if (e.mar && Math.random() < dt * 8) fx.emit(e.x, e.y + 0.1, e.z, 1, { color: '#2c1606', speed: 0.6, life: 0.6, size: 0.18, gravity: 4 });
      if (e.stunT > 0 && Math.random() < dt * 10) fx.emit(e.x + Math.cos(t * 9) * 0.4, e.y + D.height + 0.25, e.z + Math.sin(t * 9) * 0.4, 1, { color: '#ffe14a', speed: 0.2, life: 0.4, size: 0.16, gravity: 0 });
      // health bar
      const bar = v.bar;
      bar.visible = e.hp < e.maxHp;
      if (bar.visible) {
        bar.position.set(e.x, e.y + D.height + 0.45, e.z);
        bar.quaternion.copy(camera.quaternion);
        const f = Math.max(0, e.hp / e.maxHp);
        bar.userData.fg.scale.x = f;
        bar.userData.fg.material.color.setRGB(f < 0.5 ? 1 : 2 * (1 - f), f > 0.5 ? 1 : f * 2, 0.25);
      }
    }
    for (const [id, v] of enemies) if (!seen.has(id)) { scene.remove(v.root, v.bar); enemies.delete(id); }
  }

  function syncTraps(dt, S) {
    const seen = new Set();
    for (const tr of S.traps) {
      seen.add(tr.id);
      let R = traps.get(tr.id);
      if (!R) {
        R = makeTrap(tr.type);
        orientTrap(R, tr);
        scene.add(R); traps.set(tr.id, R);
      }
      const P = R.userData.parts, T = TRAP_BY_ID[tr.type];
      P.gum.visible = tr.disabledT > 0;
      if (tr.disabledT > 0) P.gum.scale.setScalar(1 + Math.sin(t * 8) * 0.1);
      if (tr.type === 'wet') {
        P.arrows.position.x = ((t * 0.8) % 0.5) - 0.1;
      } else if (tr.type === 'sizzle') {
        const g = P.glow.material;
        if (tr.phase === 'warn') { g.opacity = 0.45 + 0.45 * Math.abs(Math.sin(t * 22)); g.color.set('#ff8a1a'); if (Math.random() < dt * 40) fx.emit(tr.x + (Math.random() - 0.5) * 1.6, tr.y + 0.3, tr.z + (Math.random() - 0.5) * 1.6, 1, { color: ['#ffffff', '#dddddd'], speed: 0.8, up: 2.5, life: 0.8, size: 0.4, gravity: -1, grow: 0.8, alpha: 0.6 }); }
        else { g.opacity = tr.cd > 0 ? 0.12 : 0.22 + 0.06 * Math.sin(t * 5 + tr.id); g.color.set('#ff5a1a'); }
      } else if (tr.type === 'jandal') {
        const cd = T.cd - tr.cd;
        let a = 0;
        if (tr.fired && cd < 0.1) a = -1.55 * (cd / 0.1);
        else if (tr.fired && cd < 0.9) a = -1.55 * (1 - (cd - 0.1) / 0.8);
        P.arm.rotation.x = a;
      } else if (tr.type === 'gate') {
        const bottom = -(tr.y - tr.floor) + 0.12;
        let y = -0.25;
        if (tr.phase === 'drop') { const p = 1 - Math.max(0, tr.pt) / T.delay; y = -0.25 + (bottom + 0.25) * p * p; }
        else if (tr.fired) {
          const since = T.cd - tr.cd;
          if (since < 0.45) y = bottom;
          else if (since < 2.2) y = bottom + (-0.25 - bottom) * ((since - 0.45) / 1.75);
        }
        P.drop.position.y = y;
        for (const w of P.wires) w.scale.y = Math.max(0.01, -y);
      }
    }
    for (const [id, R] of traps) if (!seen.has(id)) { scene.remove(R); traps.delete(id); }
  }

  function orientTrap(R, tr) {
    R.position.set(tr.x, tr.y, tr.z);
    if (tr.mount === 'wall') {
      R.rotation.y = Math.atan2(-tr.wnx, -tr.wnz);
      const P = R.userData.parts;
      if (P.arm) { P.arm.rotation.order = 'YXZ'; P.arm.rotation.y = -Math.atan2(tr.wnx * tr.nz - tr.wnz * tr.nx, tr.wnx * tr.nx + tr.wnz * tr.nz); }
    } else if (tr.type === 'wet') {
      R.userData.parts.arrows.rotation.y = Math.atan2(-tr.nz, tr.nx);
    }
  }

  // ------------------------------------------------------------------ build ghost
  function updateGhost(ctl, q) {
    for (const k in ghosts) ghosts[k].visible = false;
    ghostZone.visible = false;
    if (!ctl.build || !q || !q.hit) return;
    const T = TRAPS[ctl.trap];
    let g = ghosts[T.id];
    if (!g) { g = ghosts[T.id] = makeGhost(T.id); scene.add(g); }
    const valid = q.ok;
    g.userData.setOk(valid);
    ghostZoneMat.color.set(valid ? '#4dff7a' : '#ff3b3b');
    g.visible = true;
    if (q.key || q.ok) {
      orientTrap(g, { ...q, wnx: q.wnx || 0, wnz: q.wnz || 0, type: T.id, mount: T.mount });
      const pulse = 1 + Math.sin(t * 8) * 0.02;
      g.scale.setScalar(pulse);
      // trigger zone preview for wall / ceiling traps
      if (T.mount === 'wall' && q.floor !== undefined) {
        const reach = T.reach;
        ghostZone.visible = true;
        ghostZone.scale.set(2.6, reach, 1);
        ghostZone.position.set(q.x + q.wnx * reach / 2, q.floor + 0.04, q.z + q.wnz * reach / 2);
        ghostZone.rotation.set(-Math.PI / 2, 0, Math.atan2(q.wnx, q.wnz));
      } else if (T.mount === 'ceil' && q.floor !== undefined) {
        ghostZone.visible = true; ghostZone.scale.set(2.8, 2.8, 1); ghostZone.position.set(q.x, q.floor + 0.04, q.z); ghostZone.rotation.set(-Math.PI / 2, 0, 0);
      }
    } else {
      g.position.set(q.x, q.y, q.z); g.rotation.set(0, 0, 0); g.scale.setScalar(0.8);
    }
  }

  // ------------------------------------------------------------------ events → fx / audio / hud
  function handle(events, S) {
    for (const e of events) {
      switch (e.type) {
        case 'fire':
          audio.play(e.w === 'pie' ? 'pie' : 'fizz', null, 0.05);
          fx.emit(e.x + e.dx * 0.2, e.y + e.dy * 0.2, e.z + e.dz * 0.2, e.w === 'pie' ? 6 : 4, { color: e.w === 'pie' ? ['#ffffff', '#d2903d'] : ['#fff7b0', '#e8ffd0', '#ffffff'], dir: [e.dx, e.dy, e.dz], speed: 4, life: 0.3, size: 0.14, gravity: 1, cone: 0.5 });
          cam.kick += e.w === 'pie' ? 2.5 : CAMERA.fireKick * 0.6; cam.recoil += e.w === 'pie' ? 2.2 : 0.45;
          break;
        case 'hit':
          if (e.src === 'fizz' || e.src === 'pie') hitMark = 0.12;
          if (e.dmg >= 1) {
            hud.floater(String(Math.round(e.dmg)), e.crit ? 'crit' : (e.src in TRAP_BY_ID ? 'trap' : ''), e.x, e.y, e.z);
            audio.play(e.crit ? 'crit' : 'hit', null, 0.04);
            const kf = KILL_FX[e.etype];
            fx.emit(e.x, e.y, e.z, e.crit ? 8 : 3, { color: kf.color, speed: 3, life: 0.5, size: 0.15, gravity: 6 });
          }
          if (e.crit) hud.floater('CRACKER!', 'crit', e.x, e.y + 0.5, e.z);
          break;
        case 'kill': {
          const kf = KILL_FX[e.etype];
          fx.emit(e.x, e.y + 0.6, e.z, kf.n, { ...kf, life: 1.1, up: 2 });
          if (e.etype === 'mower') { fx.emit(e.x, e.y + 0.8, e.z, 24, { color: ['#444', '#666', '#888'], speed: 3, life: 1.6, size: 0.6, gravity: -1.5, grow: 1, alpha: 0.7 }); cam.shake = 0.25; }
          audio.play(DIE_SFX[e.etype], null, 0.05);
          if (e.how !== 'pit') hud.floater('+' + e.bounty, 'money', e.x, e.y + 1.4, e.z);
          break;
        }
        case 'yeet':
          hud.floater('YEET!', 'yeet', e.x, -1.5, e.z);
          audio.play('yeet', null, 0.1);
          fx.emit(e.x, -6.6, e.z, 22, { color: ['#3d2a17', '#6b5a2a', '#c9a227', '#8a9a3a'], speed: 5, up: 4, life: 1, size: 0.3, gravity: 12 });
          break;
        case 'combo':
          hud.callout(e.text, `${e.chain}  +${e.bonus}`);
          audio.play('combo', e.n, 0.08);
          hud.floater(`${e.n}-HIT COMBO`, 'crit', e.x, e.y + 2, e.z);
          break;
        case 'pickup': audio.play('coin', null, 0.05); hud.floater('+' + e.v, 'money', e.x, e.y + 0.4, e.z); break;
        case 'trap': trapEvent(e); break;
        case 'fridge': {
          audio.play('fridge', null, 0.1);
          const name = ENEMIES[e.etype].name;
          hud.toast(`Yeah, nah! A ${name} nicked ${e.dmg} beer${e.dmg > 1 ? 's' : ''} (${e.left} left)`, 'deny');
          hud.floater(`-${e.dmg} 🍺`, 'yeet', GOAL.x, 2.6, GOAL.z + 1);
          fx.emit(GOAL.x, 1.5, GOAL.z + 1, 14, { color: ['#7fe3ff', '#ffffff', '#5a2d0c'], speed: 4, life: 0.8, size: 0.2, gravity: 8 });
          break;
        }
        case 'waveStart': audio.play('horn'); hud.banner(`WAVE ${e.wave + 1}: ${e.name.toUpperCase()}`, 'Here they come — chuck another snag on!', '#ffd21f'); break;
        case 'waveClear': audio.play('clear'); hud.banner('WAVE CLEARED — CHUR!', `+${e.bonus} shrapnel · build up, then press G`, '#4dff7a'); break;
        case 'playerHurt': hud.hurt(); audio.play('hurt', null, 0.1); cam.shake = Math.max(cam.shake, 0.08); break;
        case 'playerDead': hud.toast('Munted by a pine cone. Respawning…', 'deny'); break;
        case 'respawn': hud.toast(e.text); break;
        case 'msg': hud.toast(e.text); break;
        case 'deny': hud.toast(e.text, 'deny'); audio.play('deny', null, 0.2); break;
        case 'cone': audio.play('cone', null, 0.1); break;
        case 'coneHit': fx.emit(e.x, e.y, e.z, 10, { color: ['#7a4a22', '#4a2a10'], speed: 3, life: 0.5, size: 0.15, gravity: 9 }); break;
        case 'impact':
          fx.emit(e.x, e.y + 0.05, e.z, e.w === 'cone' ? 6 : 5, { color: e.w === 'cone' ? ['#7a4a22', '#4a2a10'] : ['#fff7b0', '#ffffff', '#e0ffb0'], speed: 2.5, up: 1.5, life: 0.4, size: 0.12, gravity: 8 });
          if (e.w !== 'cone') audio.play('impact', null, 0.05);
          break;
        case 'splash':
          audio.play('splat', null, 0.05);
          fx.emit(e.x, e.y + 0.2, e.z, 30, { color: ['#d2903d', '#8a4a1a', '#5a2d0c', '#f2d6a0'], speed: 6, up: 3, life: 0.8, size: 0.24, gravity: 12 });
          cam.shake = Math.max(cam.shake, 0.05);
          break;
        case 'blow': {
          audio.play('blow', null, 0.1);
          const fx0 = -Math.sin(e.yaw), fz0 = -Math.cos(e.yaw);
          fx.emit(e.x + fx0 * 0.8, e.y, e.z + fz0 * 0.8, 40, { color: ['#7fb04a', '#c7a04a', '#5a8a2a', '#e0e0d0'], dir: [fx0, 0.08, fz0], speed: 13, cone: 0.35, life: 0.6, size: 0.18, gravity: 1, drag: 2.5 });
          cam.kick += 1.5;
          break;
        }
        case 'squawk': if (t - lastSquawk > 0.7) { lastSquawk = t; audio.play('squawk'); } break;
        case 'spawn': fx.emit(e.x, 0.3, e.z, 8, { color: ['#d8d2bf', '#aaaaaa'], speed: 2, life: 0.6, size: 0.4, gravity: 0, grow: 0.5, alpha: 0.6 }); break;
        case 'land': fx.emit(e.x, e.y + 0.1, e.z, e.etype === 'mower' ? 14 : 6, { color: ['#c8b89a', '#8a7a5a'], speed: 2.5, life: 0.6, size: 0.35, gravity: 1, grow: 0.5, alpha: 0.6 }); break;
        case 'jump': audio.play('jump'); break;
        case 'dash': audio.play('dash'); fx.emit(e.x, e.y + 0.3, e.z, 10, { color: ['#ffffff', '#c8d8e8'], speed: 2, life: 0.4, size: 0.3, gravity: 0, alpha: 0.6 }); break;
        case 'swap': audio.play('swap'); hud.toast(e.w === 'pie' ? 'Mince Pie Launcher — splash damage, big arc' : 'L&P Fizz Cannon — aim high for cracker shots'); break;
        default: break;
      }
    }
  }

  function trapEvent(e) {
    const tr = e.trap;
    if (e.act === 'place') { audio.play('place'); fx.emit(tr.x, tr.y + 0.1, tr.z, 14, { color: ['#d8c8a8', '#ffffff'], speed: 2.5, life: 0.5, size: 0.3, gravity: 2, alpha: 0.7 }); return; }
    if (e.act === 'sell') { audio.play('sell'); hud.floater('+' + e.value, 'money', tr.x, tr.y + 1, tr.z); return; }
    if (e.act === 'disable') { fx.emit(tr.x, tr.y + 0.3, tr.z, 16, { color: ['#7a4a22', '#4a2a10'], speed: 3, life: 0.7, size: 0.2, gravity: 8 }); return; }
    if (e.act === 'warn') { if (tr.type === 'sizzle') audio.play('sizzleWarn', null, 0.2); return; }
    if (e.act !== 'fire') return;
    switch (tr.type) {
      case 'wet': audio.play('slip', null, 0.08); fx.emit(e.x, tr.y + 0.1, e.z, 10, { color: ['#bff0ff', '#7fd8ff', '#ffffff'], speed: 3, up: 2, life: 0.5, size: 0.14, gravity: 9 }); break;
      case 'marmite': audio.play('squelch', null, 0.08); fx.emit(e.x, tr.y + 0.1, e.z, 8, { color: ['#2c1606', '#3a1f0a'], speed: 2, up: 1.5, life: 0.5, size: 0.18, gravity: 8 }); break;
      case 'sizzle':
        audio.play('sizzle', null, 0.1);
        fx.emit(tr.x, tr.y + 0.4, tr.z, 40, { color: ['#ff7a1a', '#ffd23a', '#ff3a1a', '#fff2a0'], speed: 3, up: 5, life: 0.7, size: 0.3, gravity: -2, spread: 1.6 });
        fx.emit(tr.x, tr.y + 0.6, tr.z, 16, { color: ['#ffffff', '#dddddd'], speed: 1, up: 3, life: 1.2, size: 0.6, gravity: -1, grow: 1, alpha: 0.5, spread: 1.4 });
        break;
      case 'jandal': audio.play('slap', null, 0.06); hud.floater('SLAP!', 'trap', tr.x + tr.wnx * 1.2, tr.y + 0.6, tr.z + tr.wnz * 1.2); cam.shake = Math.max(cam.shake, 0.04); break;
      case 'gate': audio.play('clang', null, 0.1); fx.emit(tr.x, tr.floor + 0.2, tr.z, 26, { color: ['#c8b89a', '#a8987a', '#ffffff'], speed: 4, life: 0.7, size: 0.4, gravity: 1, grow: 0.6, alpha: 0.7, spread: 2 }); cam.shake = Math.max(cam.shake, 0.12); break;
    }
  }

  function update(dt, S, ctl, q) {
    t += dt;
    hitMark = Math.max(0, hitMark - dt);
    syncPlayer(dt, S, ctl);
    syncEnemies(dt, S);
    syncTraps(dt, S);
    updateGhost(ctl, q);
    // mower drone loudness follows the nearest mower
    let near = 99;
    for (const e of S.enemies) if (e.type === 'mower') near = Math.min(near, Math.hypot(e.x - S.player.x, e.z - S.player.z));
    audio.setMower(near < 40 ? 1 - near / 40 : 0);
  }

  return { update, updateCamera, titleCamera, handle, reset, cam, get hitMark() { return hitMark; } };
}
