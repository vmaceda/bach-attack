// node tools/camtest.mjs — camera-collision + drag-orbit checks in a real browser
import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('file://' + path.resolve('dist/index.html'));
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/10-title.png' });
await page.click('[data-act="start"]');
await page.waitForTimeout(500);
// teleport under the carport, face north with the camera boom pointing back into the low roof / against a wall
await page.evaluate(() => { const g = window.__game, P = g.sim.state.player; P.x = -1; P.y = 0; P.z = 14; g.ctl.yaw = 0; g.ctl.pitch = 40; });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/11-carport-cam.png' });
const cam1 = await page.evaluate(() => { const c = window.__game.camera.position; return [c.x, c.y, c.z].map((v) => +v.toFixed(2)); });
// back against the bach wall
await page.evaluate(() => { const g = window.__game, P = g.sim.state.player; P.x = -4.4; P.y = 0.6; P.z = 0; g.ctl.yaw = -Math.PI / 2; g.ctl.pitch = 10; });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/12-wall-cam.png' });
const cam2 = await page.evaluate(() => { const c = window.__game.camera.position; return [c.x, c.y, c.z].map((v) => +v.toFixed(2)); });
// drag orbit: right-drag should rotate yaw; a right click without drag should trigger the blower
const before = await page.evaluate(() => window.__game.ctl.yaw);
await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' }); await page.mouse.move(840, 380, { steps: 8 }); await page.mouse.up({ button: 'right' });
await page.waitForTimeout(200);
const after = await page.evaluate(() => window.__game.ctl.yaw);
await page.waitForTimeout(900);
const blowBefore = await page.evaluate(() => window.__game.sim.state.player.blowT);
const lk = await page.evaluate(() => [window.__game.input.locked, window.__game.input.mode]); console.log('lock state', lk);
await page.mouse.click(640, 360, { button: 'right' });
await page.waitForTimeout(200);
const blowAfter = await page.evaluate(() => window.__game.sim.state.player.blowT);
// pause / resume / restart keys
await page.waitForTimeout(100); await page.keyboard.press('KeyP'); await page.waitForTimeout(150); const s1 = await page.evaluate(() => window.__game.state);
await page.keyboard.press('KeyP'); await page.waitForTimeout(150); const s2 = await page.evaluate(() => window.__game.state);
await page.keyboard.press('Backspace'); await page.waitForTimeout(200);
const s3 = await page.evaluate(() => { const S = window.__game.sim.state; return [window.__game.state, S.player.x, S.money]; });
console.log(JSON.stringify({ mode: await page.evaluate(() => window.__game.input.mode), cam1, cam2, orbitYaw: [before, after], blower: blowAfter > blowBefore, states: [s1, s2, s3], errors }));
await browser.close();
