// node tools/smoke.mjs — boots dist/index.html in Chromium, plays scripted inputs, saves screenshots, fails on errors.
import { chromium } from 'playwright';
import path from 'node:path';
const url = 'file://' + path.resolve('dist/index.html') + (process.argv[2] || '?autostart=1');
const out = process.argv[3] || 'shots';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/01-start.png` });
const G = (fn, arg) => page.evaluate(fn, arg);
// build: wet decking on the deck + jandal on the bach wall, via the real cmd path
await G(() => { const g = window.__game; g.ctl.build = true; g.ctl.trap = 0; });
await page.keyboard.down('KeyA'); await page.waitForTimeout(600); await page.keyboard.up('KeyA');
await page.screenshot({ path: `${out}/02-build.png` });
const placed = await G(() => {
  const g = window.__game, s = g.sim, S = s.state;
  const down = (x, z) => ({ o: { x, y: 2, z }, d: { x: 0, y: -1, z: 0 } });
  const res = [];
  for (const [t, o, d, rot] of [[0, down(-1, -3).o, down(-1, -3).d, 0], [0, down(-1, -1).o, down(-1, -1).d, 0], [1, { x: 0, y: 1.5, z: -3 }, { x: -1, y: 0, z: 0 }, 0], [3, down(-1, 13).o, down(-1, 13).d, 0], [2, down(-1, 15).o, down(-1, 15).d, 0]]) {
    const q = s.queryPlacement(o, d, t, rot); res.push(q.ok ? 'ok' : q.reason);
    if (q.ok) s.step(1 / 60, { ...g.ctl, mx: 0, mz: 0, strafe: 0, aimYaw: 0, rayO: o, rayD: d, build: true, place: true, trap: t, rot });
  }
  g.ctl.build = false;
  return res.join(', ') + ' money=' + S.money;
});
console.log('placed:', placed);
await page.keyboard.press('KeyG');
await page.mouse.move(640, 360);
await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/03-wave.png` });
// look at the deck from the porch
await G(() => { const g = window.__game; g.ctl.yaw = Math.PI * 0.5 + 0.25; g.ctl.pitch = 25; });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/04-deck.png` });
await page.keyboard.press('KeyE');
await page.keyboard.press('Digit2');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/05-ghost.png` });
const st = await G(() => { const S = window.__game.sim.state; return { phase: S.phase, wave: S.wave, enemies: S.enemies.length, kills: S.stats.kills, combos: S.stats.combos, fridge: S.fridge, money: S.money, errs: window.__errors || [] }; });
console.log(JSON.stringify(st));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length || st.errs.length) process.exit(1);
