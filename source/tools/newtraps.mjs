// node tools/newtraps.mjs — every trap type places and fires at least once in wave 1-2
import { createSim, blankCmd } from '../src/sim/index.js';
import { TRAPS } from '../src/contracts.js';
const sim = createSim({}), S = sim.state; S.money = 99999;
const dn = (x, z, y = 2) => [{ x, y, z }, { x: 0, y: -1, z: 0 }];
const up = (x, z) => [{ x, y: 1, z }, { x: 0, y: 1, z: 0 }];
const wall = (z) => [{ x: 0, y: 1.5, z }, { x: -1, y: 0, z: 0 }];
const plan = { wet: dn(-1, -5), jandal: wall(-3), sizzle: dn(-1, -11), marmite: dn(-1, -13), gate: up(-1, 15), catapult: dn(-1, -9), zapper: wall(-7), stomper: up(-1, 13) };
for (const [id, [o, d]] of Object.entries(plan)) {
  const i = TRAPS.findIndex((t) => t.id === id), q = sim.queryPlacement(o, d, i, 0);
  if (!q.ok) { console.log('FAIL place', id, q.reason); process.exitCode = 1; continue; }
  sim.step(1 / 60, { ...blankCmd(), build: true, place: true, trap: i, rayO: o, rayD: d });
}
const fired = {}; let flyers = 0, jhits = 0;
const cmd = blankCmd(); cmd.startWave = true;
for (let k = 0; k < 60 * 120 && S.wave < 2; k++) {
  sim.step(1 / 60, cmd); cmd.startWave = S.phase === 'build';
  flyers = Math.max(flyers, S.flyers.length);
  for (const e of sim.drainEvents()) { if (e.type === 'trap' && e.act === 'fire') fired[e.trap.type] = (fired[e.trap.type] || 0) + 1; if (e.type === 'jandalHit') jhits++; }
}
console.log('fired', fired, 'max flyers in air', flyers, 'jandal hits', jhits);
for (const t of TRAPS) if (!fired[t.id]) { console.log('NEVER FIRED', t.id); process.exitCode = 1; }
