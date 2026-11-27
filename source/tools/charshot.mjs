// close-ups: Bazza idling (antics), googly-eyed pests + speech, poop splat, and generated levels
import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
const url = (q) => 'file://' + path.resolve('dist/index.html') + '?autostart=1&drag=1&q=med&seed=42' + q;
await page.goto(url('&cam=11.6,3.9,2.6,14,3.55,2'));
await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/40-bazza-idle.png' });
await page.evaluate(() => { window.__game.view.BZ.idleT = 3.2; }); await page.waitForTimeout(2500); await page.screenshot({ path: 'shots/41-bazza-antic.png' });
// pests line-up near the courtyard
await page.goto(url('&cam=-1.5,1.6,-19,-1.5,0.8,-13'));
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const g = window.__game, S = g.sim.state; g.sim.startWave(); S.spawnQ = [];
  S.player.x = -1.5; S.player.z = -21; S.player.y = 0;
});
await page.evaluate(() => {
  const S = window.__game.sim.state;
  const mk = (type, x, z) => { S.spawnQ.push({ t: 0, type, door: 0 }); };
  S.phase = 'wave'; S.waveT = 0;
  ['gull', 'possum', 'mower', 'gull'].forEach((t) => mk(t));
});
await page.waitForTimeout(250);
await page.evaluate(() => { const S = window.__game.sim.state; const pos = [[-3.2, -13], [-1.2, -13.5], [1.6, -12.5]]; S.enemies.forEach((e, i) => { const p = pos[i % 3]; e.x = p[0]; e.z = p[1]; e.stunT = 99; e.yaw = Math.PI; }); S.events.push({ type: 'honk', id: S.enemies[2]?.id }); S.events.push({ type: 'taunt', id: S.enemies[1]?.id }); });
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/42-pests.png' });
await page.evaluate(() => window.__game.sim.state.events.push({ type: 'splat' }));
await page.waitForTimeout(300); await page.screenshot({ path: 'shots/43-splat.png' });
// generated levels
for (let i = 0; i < 2; i++) {
  await page.goto(url(''));
  await page.waitForTimeout(800);
  await page.evaluate((k) => { const g = window.__game; for (let j = 0; j <= k; j++) g.sim.nextLevel(); }, i);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => { const L = window.__game.sim.state.layout; return { name: L.name, a: L.arena }; });
  const A = info.a, cx = (A.x0 + A.x1) / 2, cz = (A.z0 + A.z1) / 2;
  await page.goto(url(`&cam=${cx},${(A.z1 - A.z0) * 1.15},${cz + 0.1},${cx},0,${cz}`).replace('seed=42', 'seed=42'));
  await page.waitForTimeout(600);
  await page.evaluate((k) => { const g = window.__game; for (let j = 0; j <= k; j++) g.sim.nextLevel(); }, i);
  await page.waitForTimeout(2200);
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; });
  await page.screenshot({ path: `shots/5${i}-level-top.png` });
  console.log('level', i + 2, info.name);
}
console.log('errors', errors);
await browser.close();
