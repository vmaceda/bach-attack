// Rain of Chips: gauge partly full, gauge ready, wind-up, and mid-downpour screenshots
import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('file://' + path.resolve('dist/index.html') + '?autostart=1&drag=1&q=low&seed=42');
await page.waitForTimeout(1000);
await page.evaluate(() => { const g = window.__game, S = g.sim.state; S.player.x = 0; S.player.y = 0.6; S.player.z = 4; g.ctl.yaw = 0; g.ctl.pitch = 18; S.chipMeter = 17; });
await page.keyboard.press('KeyG');
for (let i = 0; i < 60; i++) { await page.waitForTimeout(250); if (await page.evaluate(() => window.__game.sim.state.enemies.length >= 4)) break; }
await page.screenshot({ path: 'shots/70-gauge-partial.png' });
await page.evaluate(() => { const S = window.__game.sim.state; S.chipMeter = 30; S.events.push({ type: 'chipsReady' }); });
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/71-gauge-ready.png' });
await page.keyboard.press('KeyF');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/72-windup.png' });
for (let i = 0; i < 80; i++) { await page.waitForTimeout(200); const t = await page.evaluate(() => window.__game.sim.state.rain.t); if (t > 2.0) break; }
await page.screenshot({ path: 'shots/73-rain.png' });
const st = await page.evaluate(() => { const S = window.__game.sim.state; return { chips: S.chips.length, rain: S.rain, alive: S.enemies.length }; });
console.log(JSON.stringify(st), 'errors', errors);
await browser.close();
