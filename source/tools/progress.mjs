// node tools/progress.mjs [seed] — plays successive random levels with an aimbot + auto-builder; checks transitions.
import { createSim, blankCmd } from '../src/sim/index.js';
import { TRAPS } from '../src/contracts.js';
const sim = createSim({ seed: +(process.argv[2] || 77) }), S = sim.state;
const idx = (id) => TRAPS.findIndex((t) => t.id === id);
const cmd = blankCmd();
function autoBuild() {
  const L = S.layout, mid = (b, a) => (b.min[a] + b.max[a]) / 2;
  const tries = [];
  for (const d of L.boxes.filter((b) => b.kind === 'deck')) {
    for (let z = d.min[2] + 1; z < d.max[2] - 1; z += 4) {
      tries.push(['wet', { x: mid(d, 0), y: 3, z }, { x: 0, y: -1, z: 0 }]);
      for (const s of [-1, 1]) tries.push(['jandal', { x: mid(d, 0), y: 1.6, z }, { x: s, y: 0, z: 0 }], ['zapper', { x: mid(d, 0), y: 1.6, z: z + 2 }, { x: s, y: 0, z: 0 }]);
    }
  }
  for (const r of L.boxes.filter((b) => b.kind === 'roof' || b.kind === 'deck')) for (let z = r.min[2] + 1; z < r.max[2]; z += 3) tries.push(['marmite', { x: (r.min[0] + r.max[0]) / 2, y: 2.5, z }, { x: 0, y: -1, z: 0 }], ['sizzle', { x: (r.min[0] + r.max[0]) / 2 + 2, y: 2.5, z }, { x: 0, y: -1, z: 0 }]);
  for (const r of L.boxes.filter((b) => b.kind === 'roof')) for (let z = r.min[2] + 1; z < r.max[2]; z += 2) tries.push(['gate', { x: mid(r, 0), y: 1, z }, { x: 0, y: 1, z: 0 }], ['marmite', { x: mid(r, 0), y: 2, z }, { x: 0, y: -1, z: 0 }]);
  let placed = 0;
  for (const [id, o, d] of tries) {
    const q = sim.queryPlacement(o, d, idx(id), 0);
    if (q.ok) { sim.step(1 / 60, { ...blankCmd(), build: true, place: true, trap: idx(id), rayO: o, rayD: d }); placed++; }
  }
  return placed;
}
function aim() {
  const P = S.player; let best = null, bd = 40;
  for (const e of S.enemies) { const d = Math.hypot(e.x - P.x, e.z - P.z); if (d < bd) { bd = d; best = e; } }
  cmd.fire = false; if (!best) return;
  const o = { x: P.x, y: P.y + 1.6, z: P.z }, t = { x: best.x + best.vx * 0.3, y: best.y + 0.7, z: best.z + best.vz * 0.3 };
  const l = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z);
  cmd.rayO = o; cmd.rayD = { x: (t.x - o.x) / l, y: (t.y - o.y) / l, z: (t.z - o.z) / l }; cmd.aimYaw = Math.atan2(-(t.x - o.x), -(t.z - o.z)); cmd.fire = true;
}
let lastLevel = 0, steps = 0; const dodges = {};
while (S.phase !== 'lost' && S.level <= 6 && steps < 60 * 60 * 40) {
  if (S.level !== lastLevel) { lastLevel = S.level; console.log(`LEVEL ${S.level}: ${S.layout.name} doors=${S.layout.doors.length} money=${S.money} fridge=${S.fridge} placed=${autoBuild()}`); }
  if (S.phase === 'build') { if (S.wave > 0 || S.buildT < 50) autoBuild(); cmd.startWave = true; } else cmd.startWave = false;
  aim(); sim.step(1 / 60, cmd); steps++;
  for (const e of sim.drainEvents()) {
    if (e.type === 'dodge') dodges[e.kind] = (dodges[e.kind] || 0) + 1;
    if (e.type === 'waveClear') { console.log(`  wave ${S.wave} clear fridge=${S.fridge} money=${S.money} kills=${S.stats.kills} iq=${sim.iq.toFixed(2)} dodges=${JSON.stringify(dodges)}`); for (const k in dodges) delete dodges[k]; }
    if (e.type === 'levelStart') console.log(`  → refund ${e.refund}`);
    if (e.type === 'lost') console.log(`LOST on level ${S.level} wave ${S.wave + 1}`);
  }
  for (const e of S.enemies) if (!Number.isFinite(e.x + e.z)) { console.log('NaN'); process.exit(1); }
}
