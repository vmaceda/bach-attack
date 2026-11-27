// screenshot of a flying jandal mid-air + a full trap line-up
import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('file://' + path.resolve('dist/index.html') + '?autostart=1&drag=1&q=med');
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__game, s = g.sim, S = s.state; S.money = 99999;
  const dn = (x, z, y = 2) => [{ x, y, z }, { x: 0, y: -1, z: 0 }], up = (x, z) => [{ x, y: 1, z }, { x: 0, y: 1, z: 0 }], wall = (z) => [{ x: 0, y: 1.5, z }, { x: -1, y: 0, z: 0 }];
  const plan = [['jandal', wall(-3)], ['jandal', wall(1)], ['wet', dn(-1, -5)], ['zapper', wall(-7)], ['catapult', dn(-3, -1)], ['marmite', dn(-1, 13)], ['stomper', up(-1, 15)], ['gate', up(-3, 13)], ['sizzle', dn(1, 17)]];
  const ids = ['wet', 'jandal', 'sizzle', 'marmite', 'gate', 'catapult', 'zapper', 'stomper'];
  for (const [id, [o, d]] of plan) s.step(1 / 60, { ...g.ctl, mx: 0, mz: 0, strafe: 0, aimYaw: 0, rayO: o, rayD: d, build: true, place: true, trap: ids.indexOf(id), rot: 0 });
  const P = S.player; P.x = 1.2; P.y = 0.6; P.z = 4; g.ctl.yaw = 0.35; g.ctl.pitch = 14;
});
await page.keyboard.press('KeyG');
let shot = false;
for (let i = 0; i < 160 && !shot; i++) {
  await page.waitForTimeout(100);
  const n = await page.evaluate(() => window.__game.sim.state.flyers.length);
  if (n) { await page.waitForTimeout(60); await page.screenshot({ path: 'shots/30-flying-jandal.png' }); shot = true; }
}
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/31-traps.png' });
console.log('flyer captured:', shot, 'errors:', errors);
await browser.close();
