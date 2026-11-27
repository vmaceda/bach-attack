// node tools/chips.mjs — Rain of Chips: refuses when uncharged, wipes every pest when charged, meter resets
import { createSim, blankCmd } from '../src/sim/index.js';
import { CHIPS } from '../src/contracts.js';
const sim = createSim({ seed: 3 }), S = sim.state; S.fridge = S.fridgeMax = 999;
const cmd = blankCmd();
const run = (sec, c = cmd) => { const ev = []; for (let i = 0; i < sec * 60; i++) { sim.step(1 / 60, c); c.startWave = false; c.chips = false; ev.push(...sim.drainEvents()); } return ev; };
cmd.startWave = true; run(8);
console.log('alive before:', S.enemies.length, 'meter', S.chipMeter);
cmd.chips = true; let ev = run(0.1);
console.log('uncharged press →', ev.filter((e) => e.type === 'deny').map((e) => e.text));
S.chipMeter = CHIPS.need;
const alive = S.enemies.length;
cmd.chips = true; ev = run(CHIPS.windup + CHIPS.duration + 0.5);
const hits = ev.filter((e) => e.type === 'chipHit').length, end = ev.find((e) => e.type === 'chipsEnd');
console.log(`charged: ${alive} alive at activation, chipHits=${hits}, chipsEnd.kills=${end && end.kills}, alive after=${S.enemies.length}, meter=${S.chipMeter}`);
process.exitCode = end && end.kills >= alive && S.chipMeter === 0 ? 0 : 1;
console.log(process.exitCode ? 'FAIL' : 'PASS');
