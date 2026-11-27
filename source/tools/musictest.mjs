// title track → level track on start → different track on each new level; checks the <audio> really plays
import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('file://' + path.resolve('dist/index.html') + '?q=low');
await page.waitForTimeout(1200);
const state = () => page.evaluate(() => { const els = [...document.querySelectorAll('audio')]; return { track: window.__game.audio.track }; });
console.log('title, before gesture:', JSON.stringify(await state()));
await page.mouse.click(30, 30); await page.waitForTimeout(800);
const playing = await page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__game.audio.track), 300)));
console.log('title, after first click:', playing, JSON.stringify(await page.evaluate(() => window.__game.audio.playing)));
await page.click('[data-act="start"]'); await page.waitForTimeout(800);
console.log('level 1:', (await state()).track);
for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__game.sim.nextLevel()); await page.waitForTimeout(700); console.log(`level ${i + 2}:`, (await state()).track); }
await page.waitForTimeout(1500); console.log('now:', JSON.stringify(await page.evaluate(() => window.__game.audio.playing)));
console.log('errors', errors);
await browser.close();
