// node tools/balance.mjs [seed] — passive-player balance run: spends shrapnel between waves on a fixed build order.
import { createSim, blankCmd } from '../src/sim/index.js';
import { TRAPS } from '../src/contracts.js';
const sim = createSim({ seed: +(process.argv[2] || 4207) }), S = sim.state;
const idx = (id) => TRAPS.findIndex((t) => t.id === id);
const dn = (x, z, y = 2) => [{ x, y, z }, { x: 0, y: -1, z: 0 }];
const wall = (z) => [{ x: 0, y: 1.5, z }, { x: -1, y: 0, z: 0 }];
const order = [
  ['wet', ...dn(-1, -5)], ['jandal', ...wall(-5)], ['marmite', ...dn(-1, 13)], ['wet', ...dn(-3, -5)], ['jandal', ...wall(-1)],
  ['wet', ...dn(-1, -1)], ['sizzle', ...dn(-1, 15)], ['gate', { x: -1, y: 1, z: 15 }, { x: 0, y: 1, z: 0 }], ['marmite', ...dn(-3, 13)],
  ['jandal', ...wall(3)], ['wet', ...dn(-1, 3)], ['sizzle', ...dn(-3, 15)], ['gate', { x: -3, y: 1, z: 13 }, { x: 0, y: 1, z: 0 }],
  ['marmite', ...dn(-1, -13)], ['sizzle', ...dn(1, 17)], ['jandal', ...wall(7)], ['wet', ...dn(-1, 7)],
];
let next = 0;
const cmd = blankCmd();
const shooter = process.argv.includes('--shoot');
function aim() {
  const P = S.player; let best = null, bd = 40;
  for (const e of S.enemies) { const d = Math.hypot(e.x - P.x, e.z - P.z); if (d < bd) { bd = d; best = e; } }
  cmd.fire = false; if (!best || !shooter) return;
  const o = { x: P.x, y: P.y + 1.6, z: P.z }, t = { x: best.x + (Math.random() - 0.5) * 0.8, y: best.y + 0.6 + Math.random() * 0.4, z: best.z + (Math.random() - 0.5) * 0.8 };
  const l = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z);
  cmd.rayO = o; cmd.rayD = { x: (t.x - o.x) / l, y: (t.y - o.y) / l, z: (t.z - o.z) / l };
  cmd.aimYaw = Math.atan2(-(t.x - o.x), -(t.z - o.z)); cmd.fire = true;
}
while (S.phase !== 'won' && S.phase !== 'lost') {
  if (S.phase === 'build') {
    while (next < order.length) {
      const [id, o, d] = order[next], q = sim.queryPlacement(o, d, idx(id), 0);
      if (!q.ok) { if (q.poor) break; console.log('skip', id, q.reason); next++; continue; }
      sim.step(1 / 60, { ...blankCmd(), build: true, place: true, trap: idx(id), rayO: o, rayD: d }); next++;
    }
    cmd.startWave = true;
  } else cmd.startWave = false;
  aim();
  sim.step(1 / 60, cmd);
  for (const e of sim.drainEvents()) if (e.type === 'waveClear' || e.type === 'lost' || e.type === 'won')
    console.log(`${e.type.padEnd(9)} wave=${(e.wave ?? S.wave) + 1} fridge=${S.fridge} money=${S.money} traps=${S.traps.length} kills=${S.stats.kills} yeets=${S.stats.yeets} combos=${S.stats.combos}`);
}
