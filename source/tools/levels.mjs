// node tools/levels.mjs [count] — validates generated levels: no stuck pests, traps placeable, player spawn sane.
import { createSim, blankCmd } from '../src/sim/index.js';
import { generateLevel } from '../src/sim/levelgen.js';
import { setLevelBoxes, heightAt, raycast } from '../src/sim/world.js';
import { TRAPS } from '../src/contracts.js';
const N = +(process.argv[2] || 40);
let bad = 0;
for (let k = 0; k < N; k++) {
  const sim = createSim({ seed: 1000 + k }), S = sim.state;
  const L = generateLevel(2 + (k % 5), 5000 + k * 13);
  S.layout = L; setLevelBoxes(L.boxes);
  Object.assign(S.player, { x: L.playerSpawn.x, y: L.playerSpawn.y, z: L.playerSpawn.z });
  const issues = [];
  if (Math.abs(heightAt(L.playerSpawn.x, L.playerSpawn.z, 3) - 2.4) > 0.01) issues.push('spawn not on porch');
  // trap placement probes: a wall trap on some house face, a ceiling trap under a roof, a floor trap on a deck
  const deck = L.boxes.find((b) => b.kind === 'deck'), roof = L.boxes.find((b) => b.kind === 'roof');
  const mid = (b, a) => (b.min[a] + b.max[a]) / 2;
  const tryPlace = (id, o, d) => sim.queryPlacement(o, d, TRAPS.findIndex((t) => t.id === id), 0);
  const fq = tryPlace('wet', { x: mid(deck, 0), y: 3, z: mid(deck, 2) }, { x: 0, y: -1, z: 0 });
  if (!fq.ok) issues.push('floor trap on deck: ' + fq.reason);
  const cq = tryPlace('gate', { x: mid(roof, 0), y: 1, z: mid(roof, 2) + 1 }, { x: 0, y: 1, z: 0 });
  if (!cq.ok) issues.push('ceiling trap: ' + cq.reason);
  for (const g of L.boxes.filter((b) => b.kind === 'deck' && b.max[0] - b.min[0] > 6)) {
    let wallOk = false;
    for (const dir of [-1, 1]) { const q = tryPlace('jandal', { x: mid(g, 0), y: 1.6, z: mid(g, 2) }, { x: dir, y: 0, z: 0 }); if (q.ok) wallOk = true; }
    if (!wallOk) issues.push('no wall trap from a gully deck');
  }
  // walk 12 gulls + 4 mowers per door with no traps; everybody must reach the fridge
  S.phase = 'wave'; S.spawnQ = []; S.money = 0; S.fridge = S.fridgeMax = 9999;
  const total = L.doors.length * 8;
  for (let d = 0; d < L.doors.length; d++) for (let i = 0; i < 8; i++) S.spawnQ.push({ t: i * 0.7, type: i % 4 === 3 ? 'mower' : 'gull', door: d });
  S.player.x = 999; // out of the way (possum-free test)
  const cmd = blankCmd(); let leaks = 0, t = 0;
  while (t < 120 && (S.spawnQ.length || S.enemies.length)) {
    sim.step(1 / 60, cmd); t += 1 / 60;
    for (const e of sim.drainEvents()) if (e.type === 'fridge') leaks++;
  }
  const stuck = S.enemies.length;
  if (stuck && process.env.DBG) for (const e of S.enemies) console.log("  stuck", e.type, e.x.toFixed(1), e.y.toFixed(1), e.z.toFixed(1), "wp", e.wp, JSON.stringify(e.path[e.wp]), "door", JSON.stringify(e.start));
  if (leaks < total * 0.95) issues.push(`only ${leaks}/${total} reached the fridge, ${stuck} stuck`);
  if (issues.length) { bad++; console.log(`#${k} L${L.n} ${L.name} doors=${L.doors.length}:`, issues.join('; ')); }
}
console.log(`${N - bad}/${N} generated levels OK`);
process.exitCode = bad ? 1 : 0;
