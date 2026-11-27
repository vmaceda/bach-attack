// node tools/soak.mjs — headless sim soak: places a trap combo build via the same raycast API the game uses,
// runs every wave with a passive player, and prints wave results. Exit 1 on exceptions / NaN.
import { createSim, blankCmd } from '../src/sim/index.js';
import { TRAPS } from '../src/contracts.js';
const sim = createSim({ seed: +(process.argv[2] || 4207) });
const S = sim.state;
const idx = (id) => TRAPS.findIndex((t) => t.id === id);
const down = (x, z, y = 10) => ({ o: { x, y, z }, d: { x: 0, y: -1, z: 0 } });
const place = (id, o, d, rot = 0) => { const q = sim.queryPlacement(o, d, idx(id), rot); const t = q.ok ? (sim.state.money -= 0, sim.step(1/60, { ...blankCmd(), build: true, place: true, trap: idx(id), rot, rayO: o, rayD: d }), 'OK') : q.reason; console.log(id.padEnd(8), t.padEnd(30), q.key); };
// wet deck rows skidding east (+x, rot 0) + jandal on the bach east face pushing east + marmite + sizzle + gate
place('wet', down(-1, -3).o, down(-1, -3).d, 0);
place('jandal', { x: 0, y: 1.5, z: -3 }, { x: -1, y: 0, z: 0 });
place('marmite', down(-1, 13, 2).o, down(-1, 13, 2).d);
place('gate', { x: -1, y: 1, z: 15 }, { x: 0, y: 1, z: 0 });
place('sizzle', down(-1, 17, 2).o, down(-1, 17, 2).d);
// invalid tests
place('wet', down(6, 0).o, down(6, 0).d);
place('jandal', down(0, 0).o, down(0, 0).d);
const cmd = blankCmd();
let steps = 0, ev = {};
while (S.phase !== 'won' && S.phase !== 'lost' && steps < 60 * 60 * 25) {
  cmd.startWave = S.phase === 'build' && steps % 600 === 0;
  sim.step(1 / 60, cmd); steps++;
  for (const e of sim.drainEvents()) { ev[e.type] = (ev[e.type] || 0) + 1; if (e.type === 'waveClear' || e.type === 'lost' || e.type === 'won') console.log(`t=${S.t.toFixed(0)}s ${e.type} wave=${e.wave ?? ''} fridge=${S.fridge} money=${S.money} kills=${S.stats.kills} yeets=${S.stats.yeets} combos=${S.stats.combos}`); }
  for (const e of S.enemies) if (!Number.isFinite(e.x + e.y + e.z)) { console.error('NaN enemy', e); process.exit(1); }
}
console.log(S.phase, JSON.stringify(ev));
