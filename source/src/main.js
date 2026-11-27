// BACH ATTACK! — entry point / controller.
//
//   input (DOM) ──► controller (this file) ──cmd──► sim (fixed 60 Hz, pure JS) ──state/events──► view (three.js)
//                                                                                          └──► hud (DOM) / audio
// The sim never sees the DOM or three.js; the view never writes sim state. Hooks for tests: window.__game,
// ?autostart=1 (skip title), ?drag=1 (force drag-orbit mode), ?seed=N.
import { Raycaster, Vector2, Vector3 } from 'three';
import { createSim, blankCmd } from './sim/index.js';
import { createFixedStep } from './sim/loop.js';
import { createScene } from './render/scene.js';
import { createPost } from './render/post.js';
import { createFX } from './render/fx.js';
import { createView } from './render/view.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHUD } from './hud.js';
import { CAMERA, TRAPS } from './contracts.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const uiRoot = document.getElementById('ui');

let gfx;
try { gfx = createScene(canvas); } catch (err) {
  document.querySelector('.boot-msg').textContent = 'WebGL is unavailable — this game needs a GPU-enabled browser.';
  throw err;
}
const { renderer, scene, camera } = gfx;
const post = createPost(renderer, scene, camera, params);
const sim = createSim({ seed: +(params.get('seed') || (Date.now() % 1e9)) }); // a different run of random levels every game
const fx = createFX(scene);
const audio = createAudio();
const hud = createHUD(uiRoot);
const view = createView({ scene, camera, fx, audio, hud });
const input = createInput(canvas);
if (params.get('drag')) input.forceMode('drag');

const ctl = { yaw: sim.state.layout.playerSpawn.yaw, pitch: 12, build: false, trap: 0, rot: 0 };
let cmd = blankCmd();
let state = 'title', overTimer = 0, place = null;

const fixed = createFixedStep({
  hz: 60, maxSteps: 4,
  step: (h) => {
    sim.step(h, cmd);
    // edge-triggered actions are consumed by the first step that sees them
    cmd.jump = cmd.dash = cmd.swap = cmd.place = cmd.sell = cmd.startWave = cmd.blow = false;
  },
});

// ------------------------------------------------------------------ state machine
function setState(s) {
  state = s;
  hud.show(s === 'playing' ? 'playing' : s);
  input.enabled = s === 'playing';
  canvas.style.cursor = s === 'playing' && input.mode === 'lock' ? 'none' : s === 'playing' ? 'crosshair' : 'default';
}
function startGame() {
  audio.init();
  audio.levelMusic();
  setState('playing');
  input.requestLock();
}
function pause() {
  if (state !== 'playing') return;
  setState('paused');
  if (document.pointerLockElement) input.releaseLock();
}
function resume() {
  if (state !== 'paused') return;
  audio.init();
  setState('playing');
  input.requestLock();
}
function restart() {
  sim.reset(); view.reset(); fixed.reset();
  cmd = blankCmd();
  Object.assign(ctl, { yaw: sim.state.layout.playerSpawn.yaw, pitch: 12, build: false, trap: 0, rot: 0 });
  overTimer = 0;
  audio.init();
  audio.levelMusic();
  setState('playing');
  input.requestLock();
  hud.banner('BUILD YOUR DEFENCES', 'Press B or 1–8 to place traps · G to send the first wave', '#ffd21f');
}

input.onLockLost = (byTab) => { if (!byTab && state === 'playing') pause(); };
input.onLockRetry = () => hud.toast('Click the game again to capture the mouse');
input.onModeChange = (m) => {
  hud.toast(m === 'drag' ? 'Mouse lock unavailable — Right-Drag to orbit, aim follows the cursor' : 'Mouse Look mode — click the game to capture the mouse');
  setState(state);
};

uiRoot.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  const slot = e.target.closest('[data-slot]');
  if (slot && state === 'playing') { ctl.build = true; ctl.trap = +slot.dataset.slot; return; }
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'start') startGame();
  else if (a === 'resume') resume();
  else if (a === 'restart') restart();
  else if (a === 'mute') audio.init(), audio.toggleMute();
  else if (a === 'music') audio.init(), audio.toggleMusic();
  else if (a === 'mode') input.forceMode(input.mode === 'lock' ? 'drag' : 'lock');
  else if (a === 'dismissHint') hud.dismissHint();
});

// ------------------------------------------------------------------ per-frame controller
const raycaster = new Raycaster();
const ndc = new Vector2();
const camFwd = new Vector3();
function handleKeys(inp) {
  const p = inp.pressed;
  if (p.has('KeyM')) { audio.init(); audio.toggleMute(); }
  if (p.has('KeyN')) { audio.init(); hud.toast(audio.toggleMusic() ? 'Music on — chur' : 'Music off'); }
  if (p.has('Backspace') && state !== 'title') { restart(); return; }
  if (state === 'over') { if (p.has('Enter') || p.has('NumpadEnter')) restart(); return; }
  if (state === 'paused') { if (p.has('KeyP') || p.has('Escape')) resume(); return; }
  if (state === 'title') { if (p.has('Enter')) startGame(); return; }
  // playing
  if (p.has('Escape') || p.has('KeyP')) { pause(); return; }
  if (p.has('Tab')) input.releaseLock();
  if (p.has('KeyB')) ctl.build = !ctl.build;
  TRAPS.forEach((t, i) => { if (p.has('Digit' + t.key) || p.has('Numpad' + t.key)) { if (ctl.build && ctl.trap === i) ctl.build = false; else { ctl.build = true; ctl.trap = i; } } });
  if (p.has('KeyR')) ctl.rot = (ctl.rot + 1) % 12;
  if (p.has('KeyX') && ctl.build) cmd.sell = true;
  if (p.has('KeyG')) cmd.startWave = true;
  if (p.has('KeyQ')) cmd.swap = true;
  if (p.has('Space')) cmd.jump = true;
  if (p.has('ShiftLeft') || p.has('ShiftRight')) cmd.dash = true;
  if (p.has('KeyE')) cmd.blow = true;
  if (p.has('Mouse0') && ctl.build) cmd.place = true;
  if (p.has('Mouse2')) { if (ctl.build) cmd.sell = true; else cmd.blow = true; }
  if (inp.wheel && ctl.build) ctl.trap = (ctl.trap + (inp.wheel > 0 ? 1 : TRAPS.length - 1)) % TRAPS.length;
}

function frame(dt) {
  const inp = input.consume();
  handleKeys(inp);
  const S = sim.state;
  if (state === 'playing') {
    // look: yaw from mouse X; pitch is the camera's elevation (+ = looking down), clamped -35..+65
    const sens = CAMERA.sens;
    ctl.yaw -= inp.dx * sens;
    ctl.pitch = Math.min(CAMERA.pitchMax, Math.max(CAMERA.pitchMin, ctl.pitch + inp.dy * sens * 57.3));
    // camera-relative movement
    const f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const sy = Math.sin(ctl.yaw), cy = Math.cos(ctl.yaw);
    cmd.mx = -sy * f + cy * r; cmd.mz = -cy * f - sy * r; cmd.strafe = r;
    const canShoot = input.mode === 'drag' || input.locked;
    cmd.fire = canShoot && input.mouse(0) && !ctl.build;
    cmd.build = ctl.build; cmd.trap = ctl.trap; cmd.rot = ctl.rot;
  } else { cmd.mx = cmd.mz = cmd.strafe = 0; cmd.fire = false; }

  // aim ray: screen centre (mouse look) or through the cursor (drag fallback)
  let rx = innerWidth / 2, ry = innerHeight / 2;
  if (input.mode === 'drag') { rx = input.cursorX; ry = input.cursorY; }
  ndc.set((rx / innerWidth) * 2 - 1, -(ry / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ro = raycaster.ray.origin, rd = raycaster.ray.direction;
  cmd.rayO.x = ro.x; cmd.rayO.y = ro.y; cmd.rayO.z = ro.z;
  cmd.rayD.x = rd.x; cmd.rayD.y = rd.y; cmd.rayD.z = rd.z;
  if (input.mode === 'drag') {
    const h = sim.raycastAll(cmd.rayO, cmd.rayD, 150);
    cmd.aimYaw = Math.atan2(-(h.x - S.player.x), -(h.z - S.player.z));
  } else cmd.aimYaw = ctl.yaw;

  if (state === 'playing') fixed.advance(dt);
  audio.setIntensity(S.phase === 'wave');
  audio.duck(state === 'paused' || state === 'over');
  place = ctl.build && state !== 'title' ? sim.queryPlacement(cmd.rayO, cmd.rayD, ctl.trap, ctl.rot) : null;

  const events = sim.drainEvents();
  view.handle(events, S);
  for (const e of events) {
    if (e.type === 'lost') { overTimer = 1.6; audio.play('lose'); hud.gameOver(S); }
    if (e.type === 'levelStart') { audio.levelMusic(); ctl.yaw = S.layout.playerSpawn.yaw; ctl.pitch = 14; ctl.build = false; }
  }
  if (overTimer > 0) { overTimer -= dt; if (overTimer <= 0 && state === 'playing') { setState('over'); if (document.pointerLockElement) input.releaseLock(); } }

  view.update(dt, S, ctl, place);
  if (state === 'title') view.titleCamera(dt); else view.updateCamera(dt, S, ctl);
  if (params.get('cam')) { const c = params.get('cam').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); }
  gfx.update(dt, S);
  fx.update(dt, S, camera);
  if (state !== 'title') {
    hud.update(dt, S, {
      build: ctl.build, trap: ctl.trap, place, reticleX: rx, reticleY: ry, hitMark: view.hitMark,
      mode: input.mode, locked: input.locked, muted: audio.muted, project,
    });
  }
  post.update(dt);
  post.render();
}

const pv = new Vector3();
function project(x, y, z) {
  pv.set(x, y, z).project(camera);
  if (pv.z > 1) return null;
  return { x: (pv.x * 0.5 + 0.5) * innerWidth, y: (-pv.y * 0.5 + 0.5) * innerHeight };
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  try { frame(dt); } catch (err) { console.error(err); (window.__errors ||= []).push(String(err && err.stack || err)); }
  requestAnimationFrame(loop);
}

hud.show('title');
audio.titleMusic(); // starts on the first click/key (browser autoplay rules)
document.getElementById('boot').classList.add('done');
setTimeout(() => document.getElementById('boot').remove(), 500);
window.__game = { sim, input, ctl, view, audio, get state() { return state; }, startGame, restart, pause, resume, camera };
if (params.get('autostart')) startGame();
requestAnimationFrame(loop);
