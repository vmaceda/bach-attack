// View: mirrors sim.state into three.js objects every frame, runs the third-person camera rig (sphere-swept so walls
// and beams push it in), and turns sim events into particles, sounds and HUD pops. Never mutates the sim.
import { Vector3, Mesh, PlaneGeometry, BoxGeometry, MeshBasicMaterial, Group, ConeGeometry, BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial, AdditiveBlending } from 'three';
import { makePlayer, ENEMY_MODEL, makeHealthBar, makeTrap, makeGhost, makeFlyingJandal } from './models.js';
import { CAMERA, ENEMIES, TRAPS, TRAP_BY_ID } from '../contracts.js';
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

  // flying jandal pool + lightning bolt pool (electric fence)
  const flyers = [];
  for (let i = 0; i < 12; i++) { const f = makeFlyingJandal(); f.visible = false; scene.add(f); flyers.push(f); }
  const bolts = [];
  for (let i = 0; i < 10; i++) {
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(new Float32Array(10 * 3), 3));
    const l = new Line(g, new LineBasicMaterial({ color: '#cfefff', transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false }));
    l.frustumCulled = false; l.visible = false; l.userData.life = 0; scene.add(l); bolts.push(l);
  }
  function bolt(ax, ay, az, bx, by, bz) {
    const l = bolts.find((b) => b.userData.life <= 0) || bolts[0];
    const a = l.geometry.attributes.position;
    for (let i = 0; i < 10; i++) {
      const k = i / 9, j = i === 0 || i === 9 ? 0 : 0.35;
      a.setXYZ(i, ax + (bx - ax) * k + (Math.random() - 0.5) * j, ay + (by - ay) * k + (Math.random() - 0.5) * j, az + (bz - az) * k + (Math.random() - 0.5) * j);
    }
    a.needsUpdate = true; l.userData.life = 0.16; l.visible = true;
  }

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
  // ---- googly-eye physics: pupils are little damped springs kicked by every lurch, turn and landing
  function wobbleEyes(eyes, kx, ky, dt) {
    for (const e of eyes) {
      e.vx += (-e.ox * 160 - e.vx * 7 + kx + (Math.random() - 0.5) * 6) * dt;
      e.vy += (-e.oy * 160 - e.vy * 7 + ky - 9) * dt;
      e.ox += e.vx * dt; e.oy += e.vy * dt;
      const lim = e.r * 0.42, l = Math.hypot(e.ox, e.oy);
      if (l > lim) { e.ox *= lim / l; e.oy *= lim / l; e.vx *= -0.4; e.vy *= -0.4; }
      e.pupil.position.x = e.ox; e.pupil.position.y = e.oy;
    }
  }

  // ---- BAZZA: bobble head, belly jiggle, waddle, and idle antics when you leave him alone
  const BZ = { lastYaw: 0, lastSp: 0, lastVy: 0, headX: 0, headZ: 0, headVX: 0, headVZ: 0, belly: 0, bellyV: 0, idleT: 0, antic: -1, gum: 0, chat: 4 };
  const BAZZA_IDLE = ['Is this thing on?', 'Bored as, bro', 'Wanna see me belly button?', 'Got any pies?', 'Yeah nah yeah nah', 'Hurry up, pests!', '*whistles badly*', 'Mum, look! No traps!'];
  const BAZZA_HYPE = ['CHUR!', 'Sweet as, bro!', 'Hard out!', 'Too easy!', 'Mean as!', 'Yeah the boys!', 'Ka pai!', 'Get wrecked!', 'Oi oi oi!', 'She\'ll be right!'];
  const BAZZA_HURT = ['OI!', 'Aw, mate!', 'Me mullet!', 'Not the face!', 'Rude!', 'Ow, ya egg!'];
  const BAZZA_JUMP = ['Hup!', 'Wheee!', 'Look at me go!', 'Yeehaa!'];
  let lastSpeech = 0, killChain = 0, killChainT = 0;
  const bazzaPos = () => (player.visible || true) ? { x: player.position.x, y: player.position.y + 2.55, z: player.position.z } : null;
  function bazzaSay(list, force) {
    if (!force && t - lastSpeech < 2.5) return;
    lastSpeech = t;
    const text = typeof list === 'string' ? list : list[Math.floor(Math.random() * list.length)];
    hud.speech(text, bazzaPos, 'bazza', 1.9);
    audio.play('blurt', text.length, 0.3);
  }

  function syncPlayer(dt, S, ctl) {
    const P = S.player;
    player.position.set(P.x, P.y, P.z);
    player.rotation.y = P.yaw;
    const sp = Math.hypot(P.vx, P.vz);
    const ph = t * (sp > 0.5 ? 2.0 + sp * 0.8 : 0);
    const sw = Math.min(1, sp / 6) * 0.8;
    PP.legs[0].rotation.x = Math.sin(ph) * sw; PP.legs[1].rotation.x = -Math.sin(ph) * sw;
    // the waddle: big side-to-side sway like a man who has had four pies
    PP.body.rotation.z = Math.sin(ph) * 0.16 * sw;
    PP.body.position.y = Math.abs(Math.sin(ph)) * 0.07 * sw;
    PP.torso.rotation.x = (P.dashT > 0 ? -0.5 : 0) - (ctl.pitch * D2R) * 0.3 * (P.onGround ? 1 : 0.5);
    // springs driven by acceleration
    const dyaw = Math.atan2(Math.sin(P.yaw - BZ.lastYaw), Math.cos(P.yaw - BZ.lastYaw)); BZ.lastYaw = P.yaw;
    const acc = (sp - BZ.lastSp) / Math.max(dt, 1e-3); BZ.lastSp = sp;
    const dvy = (P.vy - BZ.lastVy) / Math.max(dt, 1e-3); BZ.lastVy = P.vy;
    BZ.headVX += (-BZ.headX * 90 - BZ.headVX * 5 - acc * 0.25 + Math.sin(ph * 2) * sw * 8) * dt;
    BZ.headVZ += (-BZ.headZ * 90 - BZ.headVZ * 5 + dyaw / Math.max(dt, 1e-3) * 0.6) * dt;
    BZ.headX += BZ.headVX * dt; BZ.headZ += BZ.headVZ * dt;
    BZ.headX = Math.max(-0.6, Math.min(0.6, BZ.headX)); BZ.headZ = Math.max(-0.6, Math.min(0.6, BZ.headZ));
    PP.neck.rotation.x = BZ.headX; PP.neck.rotation.z = BZ.headZ;
    BZ.bellyV += (-BZ.belly * 140 - BZ.bellyV * 4 + (dvy < -30 ? 0 : -dvy * 0.02) + Math.sin(ph * 2) * sw * 10) * dt;
    BZ.belly += BZ.bellyV * dt; BZ.belly = Math.max(-0.25, Math.min(0.25, BZ.belly));
    PP.belly.scale.set(1 - BZ.belly * 0.5, 1 + BZ.belly, 1 - BZ.belly * 0.3);
    PP.mullet.rotation.x = -BZ.headX * 0.8 + sw * 0.12 * Math.sin(ph * 2 + 1);
    for (let i = 0; i < PP.corks.length; i++) { const c = PP.corks[i]; c.rotation.x = Math.sin(t * 7 + i * 1.7) * (0.15 + sw * 0.6) - BZ.headX * 2; c.rotation.z = Math.cos(t * 6 + i) * (0.1 + sw * 0.5) - BZ.headZ * 2; }
    wobbleEyes(PP.eyes, -dyaw / Math.max(dt, 1e-3) * 2 + acc * 0.1, -dvy * 0.08, dt);
    // idle antics (dance / belly drum / bubble gum) after 3 s of doing nothing
    const busy = sp > 0.5 || S.t - P.firedT < 1.5 || S.t - P.blowT < 1 || ctl.build || P.dead || !P.onGround;
    BZ.idleT = busy ? 0 : BZ.idleT + dt;
    const anticT = BZ.idleT - 3;
    const antic = anticT > 0 ? Math.floor(anticT / 4) % 3 : -1;
    if (antic !== BZ.antic) { BZ.antic = antic; if (antic >= 0) bazzaSay(BAZZA_IDLE, true); }
    PP.gun.visible = antic < 0;
    let armRx = -1.2, armRz = 0, armLx = -1.35, armLz = 0.55, bodyY = 0;
    if (antic === 0) { // the dance
      const d = t * 9;
      armRx = -2.6 + Math.sin(d) * 0.5; armLx = -2.6 - Math.sin(d) * 0.5; armRz = -0.4; armLz = 0.4;
      bodyY = Math.sin(d * 0.5) * 0.6; PP.body.position.y = Math.abs(Math.sin(d)) * 0.08; PP.body.rotation.z = Math.sin(d) * 0.2;
    } else if (antic === 1) { // drumming the belly
      const d = t * 12;
      armRx = -0.5 + Math.max(0, Math.sin(d)) * 0.5; armLx = -0.5 + Math.max(0, -Math.sin(d)) * 0.5; armRz = 0.5; armLz = -0.5;
      if (Math.sin(d) > 0.97 || Math.sin(d) < -0.97) { BZ.bellyV += 3; }
    } else if (antic === 2) { // bubble gum, then POP
      const g = (anticT % 4) / 3.2;
      if (g < 1) PP.gum.scale.setScalar(0.01 + g * 2.4);
      else if (PP.gum.scale.x > 0.5) { PP.gum.scale.setScalar(0.01); audio.play('pop'); fx.emit(player.position.x, player.position.y + 2.3, player.position.z, 8, { color: '#ff7ac8', speed: 2, life: 0.4, size: 0.12, gravity: 4 }); }
    }
    if (antic !== 2) PP.gum.scale.setScalar(0.01);
    PP.armR.rotation.set(armRx, 0, armRz); PP.armL.rotation.set(armLx, 0, armLz);
    PP.body.rotation.y = bodyY;
    PP.body.rotation.x = P.dead ? -Math.PI / 2 : 0;
    PP.body.position.z = P.dead ? 0.6 : 0;
    PP.fizz.visible = P.weapon === 'fizz'; PP.pie.visible = P.weapon === 'pie';
    const since = S.t - P.firedT;
    PP.gun.position.z = -0.5 + (since < 0.08 ? 0.08 * (1 - since / 0.08) : 0);
    const bsince = S.t - P.blowT;
    PP.blower.rotation.z = bsince < 0.4 ? Math.sin(bsince * 50) * 0.08 : 0;
    // random hype chatter mid-fight
    killChainT -= dt; if (killChainT <= 0) killChain = 0;
  }

  // ---- pests talk too. Constantly.
  const PEST_LINES = {
    gull: ['MINE!', 'Indeed. MINE.', 'Cheers for the tinny, old sport', 'Hot chips? Splendid. MINE.', 'One does love a bach fridge', 'Squawk off, bro', 'Monocle says: MINE.'],
    possum: ['Heh heh heh', 'Yoink!', 'Into the swag!', 'Nice stuff ya got there', 'Don\'t mind me...', 'Mine now, bro', 'Is that a pie? IN THE SACK'],
    mower: ['I AM THE GRIM CUTTER', 'YOUR LAWN IS MINE', 'MOW... THEM... ALL', 'LAWN AND ORDER!', 'BOW BEFORE THE BLADES', 'NO BLADE OF GRASS IS SAFE'],
  };
  const TAUNT = ['GOT YA BRO!', 'Hehehe, sucked in!', 'Bullseye!', 'Pine cone to the face!'];
  let pestChat = 3;
  function pestSay(e, text) {
    const id = e.id;
    hud.speech(text, () => { const v = enemies.get(id); return v ? { x: v.root.position.x, y: v.root.position.y + ENEMIES[v.type].height + 0.9, z: v.root.position.z } : null; }, 'pest', 1.7);
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
      const dyawE = Math.atan2(Math.sin(e.yaw - (v.lastYaw ?? e.yaw)), Math.cos(e.yaw - (v.lastYaw ?? e.yaw))); v.lastYaw = e.yaw;
      if (Pp.eyes) wobbleEyes(Pp.eyes, -dyawE / Math.max(dt, 1e-3) * 1.5 + (sp - (v.lastSp || 0)) * 3, (e.onGround ? 0 : e.vy * 2) + (v.pop > 0.5 ? 30 : 0), dt);
      v.lastSp = sp;
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
        if (e.tauntT > 0) { // victory bum-wiggle
          R.rotation.y = e.yaw + Math.PI; Pp.body.rotation.z = Math.sin(t * 22) * 0.35; Pp.tail.rotation.z = Math.sin(t * 30) * 0.9; Pp.body.position.y = Math.abs(Math.sin(t * 11)) * 0.12;
        } else Pp.body.position.y = 0;
        const throwP = e.mode === 'shoot' ? Math.max(0, 1 - (ENEMIES.possum.every - e.shootT) * 3) : 0;
        Pp.arm.rotation.x = e.mode === 'shoot' ? -2.4 + (1 - Math.min(1, e.shootT)) * 2 : 0;
        Pp.cone.visible = e.mode !== 'shoot' || e.shootT < ENEMIES.possum.every - 0.4;
        if (Pp.hook) Pp.hook.rotation.y = t * 9 + e.id; // twirling the grappling hook
      } else {
        for (const w of Pp.wheels) w.rotation.x = -v.roll * 3;
        Pp.blade.rotation.y = t * 40;
        const hk = v.honk = Math.max(0, (v.honk || 0) - dt * 3);
        Pp.horn.scale.set(1 + hk * 0.6, 1 + hk * 0.6, 1 - hk * 0.4);
        Pp.body.position.y = Math.sin(t * 45) * 0.012;
        // twin exhausts belching black smoke, with the odd spurt of flame
        const cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
        for (const ex of [-0.45, 0.45]) {
          const wx = e.x + ex * cy + 0.35 * sy, wz = e.z - ex * sy + 0.35 * cy;
          if (Math.random() < dt * 9) fx.emit(wx, e.y + 1.9, wz, 1, { color: ['#1a1a1a', '#2a2a2a', '#3a3a3a'], speed: 0.7, up: 1.2, life: 1.6, size: 0.45, gravity: -1.2, grow: 0.9, alpha: 0.85 });
          if (Math.random() < dt * 1.2) fx.emit(wx, e.y + 1.9, wz, 4, { color: ['#ff5a1a', '#ffb43a'], speed: 1.2, up: 2, life: 0.3, size: 0.25, gravity: -2 });
        }
        if (Math.random() < dt * 4) fx.emit(e.x + (Math.random() - 0.5), e.y + 0.15, e.z + (Math.random() - 0.5), 2, { color: ['#ffb43a', '#ff7a1a'], speed: 2.5, up: 1, life: 0.25, size: 0.08, gravity: 6 }); // blade sparks
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
        if (tr.fired && cd < 0.08) a = -1.3 * (cd / 0.08);
        else if (tr.fired && cd < 0.6) a = -1.3 * (1 - (cd - 0.08) / 0.52);
        P.arm.rotation.x = a;
        P.loaded.visible = !tr.fired || cd > T.cd * 0.65; // the jandal is in the air; a fresh one pops in when reloaded
        if (P.loaded.visible && tr.fired && cd < T.cd * 0.65 + 0.15) P.loaded.scale.setScalar(Math.min(1, (cd - T.cd * 0.65) / 0.15 + 0.01)); else P.loaded.scale.setScalar(1);
      } else if (tr.type === 'catapult') {
        const since = T.cd - tr.cd;
        let a = 0;
        if (tr.phase === 'drop') a = -0.04;
        else if (tr.fired && since < 0.1) a = 1.25 * (since / 0.1);
        else if (tr.fired && since < 1.2) a = 1.25 * (1 - (since - 0.1) / 1.1);
        P.lid.rotation.z = a;
        P.arrows.position.x = ((t * 0.7) % 0.4) - 0.2;
      } else if (tr.type === 'zapper') {
        const since = T.cd - tr.cd;
        P.wireMat.emissiveIntensity = tr.fired && since < 0.25 ? 6 * (1 - since / 0.25) : 0.15 + 0.15 * Math.max(0, Math.sin(t * 9 + tr.id));
        if (tr.cd <= 0 && Math.random() < dt * 3) fx.emit(tr.x + tr.wnx * 0.2 + (Math.random() - 0.5) * 1.6 * Math.abs(tr.wnz), tr.y + (Math.floor(Math.random() * 3) - 1) * 0.45, tr.z + tr.wnz * 0.2 + (Math.random() - 0.5) * 1.6 * Math.abs(tr.wnx), 2, { color: ['#cfefff', '#66ccff'], speed: 1.2, life: 0.18, size: 0.08, gravity: 0 });
      } else if (tr.type === 'stomper') {
        const bottom = -(tr.y - tr.floor) + 0.9;
        let y = -0.3;
        if (tr.phase === 'drop') { const p = 1 - Math.max(0, tr.pt) / T.delay; y = -0.3 + (bottom + 0.3) * p * p; }
        else if (tr.fired) { const since = T.cd - tr.cd; if (since < 0.15) y = bottom; else if (since < 0.9) y = bottom + (-0.3 - bottom) * ((since - 0.15) / 0.75); }
        P.drop.position.y = y;
        P.piston.scale.y = Math.max(0.05, -y - 0.2);
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
    } else if (tr.type === 'catapult') {
      R.rotation.y = Math.atan2(-tr.nz, tr.nx); // local +X = launch direction
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
          killChain++; killChainT = 3; if (killChain === 4 || killChain === 8) bazzaSay(killChain === 8 ? 'UNSTOPPABLE, BRO!' : BAZZA_HYPE, true);
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
          if (e.n >= 3 || Math.random() < 0.3) bazzaSay(BAZZA_HYPE);
          audio.play('combo', e.n, 0.08);
          hud.floater(`${e.n}-HIT COMBO`, 'crit', e.x, e.y + 2, e.z);
          break;
        case 'pickup': audio.play('coin', null, 0.05); hud.floater('+' + e.v, 'money', e.x, e.y + 0.4, e.z); break;
        case 'trap': trapEvent(e); break;
        case 'fridge': {
          audio.play('fridge', null, 0.1);
          const name = ENEMIES[e.etype].name;
          hud.toast(`Yeah, nah! A ${name} nicked ${e.dmg} beer${e.dmg > 1 ? 's' : ''} (${e.left} left)`, 'deny');
          hud.speech(e.etype === 'gull' ? 'MINE!!!' : e.etype === 'possum' ? 'Cheers for the beer!' : 'SKOL!', () => ({ x: S.layout.goal.x, y: 3, z: S.layout.goal.z }), 'pest', 1.6);
          if (e.etype === 'gull') audio.play('mine', null, 0.3);
          bazzaSay(['Not me beers!', 'OI! THAT\'S MINE!', 'Yeah, nah!'], false);
          hud.floater(`-${e.dmg} 🍺`, 'yeet', S.layout.goal.x, 2.6, S.layout.goal.z + 1);
          fx.emit(S.layout.goal.x, 1.5, S.layout.goal.z + 1, 14, { color: ['#7fe3ff', '#ffffff', '#5a2d0c'], speed: 4, life: 0.8, size: 0.2, gravity: 8 });
          break;
        }
        case 'waveStart': audio.play('horn'); hud.banner(`WAVE ${e.wave + 1}: ${e.name.toUpperCase()}`, 'Here they come — chuck another snag on!', '#ffd21f'); break;
        case 'levelClear': audio.play('win'); hud.banner(`LEVEL ${e.level} SORTED!`, 'Chucking the traps in the ute — new bach incoming…', '#4dff7a'); break;
        case 'levelStart': audio.play('horn'); hud.banner(`LEVEL ${e.level}`, `${e.name}${S.layout.forks ? ' · watch the forks — they\'ll take the other path' : ''}`, '#ffd21f'); hud.toast(`Traps refunded: +${e.refund} shrapnel · fridge restocked from the dairy`); break;
        case 'waveClear': audio.play('clear'); hud.banner('WAVE CLEARED — CHUR!', `+${e.bonus} shrapnel · build up, then press G`, '#4dff7a'); break;
        case 'playerHurt': hud.hurt(); audio.play('hurt', null, 0.1); if (Math.random() < 0.5) bazzaSay(BAZZA_HURT); cam.shake = Math.max(cam.shake, 0.08); break;
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
        case 'jandalHit': audio.play('slap', null, 0.04); hud.floater('SLAP!', 'trap', e.x, e.y + 0.6, e.z); fx.emit(e.x, e.y, e.z, 10, { color: ['#ffffff', '#2f6ff0'], speed: 4, life: 0.4, size: 0.15, gravity: 5 }); cam.shake = Math.max(cam.shake, 0.04); break;
        case 'jandalLand': audio.play('thud', null, 0.08); fx.emit(e.x, e.y + 0.05, e.z, 6, { color: ['#c8b89a', '#8a7a5a'], speed: 1.5, life: 0.5, size: 0.3, gravity: 1, grow: 0.4, alpha: 0.6 }); break;
        case 'dodge': {
          const lines = { swoop: ['MIIIINE!', 'Tally-ho!', 'Swooping in!'], jump: ['Nice try!', 'Hup!', 'Too slow, bro', 'Parkour!'], step: ['Nah yeah, nah', 'Saw that coming', 'Not today!'], dash: ['YOINK!', 'Missed me!', 'Ha!'], reroute: ['Other way, lads!', 'Shortcut!', 'Nah, round the back'] }[e.kind];
          const label = { swoop: 'SWOOP!', jump: 'JUMPED!', step: 'SIDESTEP!', dash: 'DODGED!', reroute: 'REROUTE!' }[e.kind];
          hud.floater(label, 'yeet', e.x, e.y + 1.8, e.z);
          const m = S.enemies.find((q) => q.id === e.id);
          if (m && (e.kind !== 'reroute' || Math.random() < 0.5)) pestSay(m, lines[Math.floor(Math.random() * lines.length)]);
          audio.play(e.kind === 'jump' ? 'jump' : 'dash', null, 0.15);
          if (e.kind !== 'reroute' && Math.random() < 0.25) bazzaSay(['Oi, cheater!', 'They\'re learning!', 'Clever little...', 'That\'s not fair!']);
          break;
        }
        case 'jump': audio.play('jump'); if (Math.random() < 0.35) bazzaSay(BAZZA_JUMP); break;
        case 'splat': hud.splat(); audio.play('poosplat'); bazzaSay(['Aw, MATE!', 'Right in the mullet!', 'Not again!', 'Is that... yep.'], true); break;
        case 'poopLaunch': audio.play('squawk', null, 0.2); if (Math.random() < 0.4) { const g = S.enemies.find((q) => q.id === e.id); if (g) pestSay(g, ['Bombs away!', 'Special delivery!', 'Incoming!', 'Hehe, gotcha'][Math.floor(Math.random() * 4)]); } break;
        case 'honk': { audio.play('roar', null, 0.4); const v = enemies.get(e.id); if (v) v.honk = 1; const m = S.enemies.find((q) => q.id === e.id); if (m && Math.random() < 0.5) pestSay(m, PEST_LINES.mower[Math.floor(Math.random() * PEST_LINES.mower.length)]); break; }
        case 'taunt': { audio.play('giggle', null, 0.3); const m = S.enemies.find((q) => q.id === e.id); if (m) pestSay(m, TAUNT[Math.floor(Math.random() * TAUNT.length)]); break; }
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
      case 'jandal': audio.play('twang', null, 0.06); fx.emit(tr.x + tr.wnx * 0.4, tr.floor + 0.85, tr.z + tr.wnz * 0.4, 8, { color: ['#ffffff', '#d8c8a8'], speed: 2, life: 0.35, size: 0.2, gravity: 0, alpha: 0.6 }); break;
      case 'zapper':
        audio.play('zap', null, 0.08);
        for (const g of e.targets || []) bolt(tr.x + tr.wnx * 0.18, tr.y, tr.z + tr.wnz * 0.18, g.x, g.y, g.z);
        for (const g of e.targets || []) fx.emit(g.x, g.y, g.z, 8, { color: ['#cfefff', '#66ccff', '#ffffff'], speed: 4, life: 0.3, size: 0.12, gravity: 4 });
        break;
      case 'catapult': audio.play('boing', null, 0.08); fx.emit(tr.x, tr.y + 0.3, tr.z, 16, { color: ['#d8c8a8', '#ffffff'], speed: 3, up: 2, life: 0.5, size: 0.3, gravity: 3, alpha: 0.7, spread: 1.5 }); hud.floater('BOING!', 'trap', tr.x, tr.y + 1.5, tr.z); break;
      case 'stomper': audio.play('stomp', null, 0.08); fx.emit(tr.x, tr.floor + 0.15, tr.z, 22, { color: ['#c8b89a', '#a8987a', '#ffffff'], speed: 4, life: 0.6, size: 0.35, gravity: 1, grow: 0.5, alpha: 0.7, spread: 1.6 }); cam.shake = Math.max(cam.shake, 0.08); break;
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
    // background pest chatter: some random visible pest says something annoying every few seconds
    pestChat -= dt;
    if (pestChat <= 0 && S.enemies.length) {
      pestChat = 2.5 + Math.random() * 3.5;
      const e = S.enemies[Math.floor(Math.random() * S.enemies.length)];
      if (Math.hypot(e.x - S.player.x, e.z - S.player.z) < 30) {
        const L = PEST_LINES[e.type]; pestSay(e, L[Math.floor(Math.random() * L.length)]);
        if (e.type === 'gull') audio.play('mine', null, 1); else if (e.type === 'possum') audio.play('giggle', null, 1);
      }
    }
    // flying jandals: frisbee spin + wobble, pointing along their flight
    for (let i = 0; i < flyers.length; i++) {
      const m = flyers[i], f = S.flyers[i];
      m.visible = !!f;
      if (!f) continue;
      m.position.set(f.x, f.y, f.z);
      m.rotation.set(Math.sin(t * 13 + f.id) * 0.25, t * 26 + f.id, Math.cos(t * 11 + f.id) * 0.2);
      if (Math.random() < 0.6) fx.emit(f.x, f.y, f.z, 1, { color: ['#ffffff', '#cfe0ff'], speed: 0.3, life: 0.25, size: 0.18, gravity: 0, alpha: 0.5 });
    }
    for (const b of bolts) if (b.userData.life > 0) { b.userData.life -= dt; b.material.opacity = Math.max(0, b.userData.life / 0.16); if (b.userData.life <= 0) b.visible = false; }
    // mower drone loudness follows the nearest mower
    let near = 99;
    for (const e of S.enemies) if (e.type === 'mower') near = Math.min(near, Math.hypot(e.x - S.player.x, e.z - S.player.z));
    audio.setMower(near < 40 ? 1 - near / 40 : 0);
  }

  return { update, updateCamera, titleCamera, handle, reset, cam, BZ, get hitMark() { return hitMark; } };
}
