import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('file://' + path.resolve('dist/index.html') + '?autostart=1&drag=1');
await page.waitForTimeout(1200);
const shot = async (name, setup, mx = 640, my = 360) => {
  await page.evaluate(setup); await page.mouse.move(mx, my); await page.waitForTimeout(900);
  const q = await page.evaluate(() => { const g = window.__game; const S = g.sim.state; return document.querySelector('.place-tip').textContent; });
  console.log(name, '→', q);
  await page.screenshot({ path: `shots/${name}.png` });
};
await shot('20-jandal-ghost', () => { const g = window.__game, P = g.sim.state.player; P.x = 0.5; P.y = 0.6; P.z = -4; g.ctl.yaw = Math.PI / 2 - 0.2; g.ctl.pitch = 8; g.ctl.build = true; g.ctl.trap = 1; }, 560, 400);
await shot('21-gate-ghost', () => { const g = window.__game, P = g.sim.state.player; P.x = -1; P.y = 0; P.z = 9; g.ctl.yaw = 0.0; g.ctl.yaw = Math.PI; g.ctl.pitch = -25; g.ctl.trap = 4; g.sim.state.money = 2000; }, 600, 300);
await shot('22-wet-ghost', () => { const g = window.__game, P = g.sim.state.player; P.x = -1; P.y = 0.6; P.z = -8; g.ctl.yaw = Math.PI; g.ctl.pitch = 30; g.ctl.trap = 0; g.ctl.rot = 1; }, 640, 420);
console.log(errors);
await browser.close();
