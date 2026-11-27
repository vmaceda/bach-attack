// Bazza pose check: front + side views of the hold pose, plus the dance antic
import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
const shot = async (cam, name, antic) => {
  await page.goto('file://' + path.resolve('dist/index.html') + '?autostart=1&drag=1&q=med&seed=42&cam=' + cam);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; });
  if (antic) { await page.evaluate(() => { window.__game.view.BZ.idleT = 3.3; }); await page.waitForTimeout(1500); }
  await page.screenshot({ path: `shots/${name}.png` });
};
await shot('11.9,3.8,3.0,14,3.45,2', '60-arms-front');
await shot('14.3,3.6,-0.4,14,3.4,2', '61-arms-side');
await shot('16.2,3.7,2.8,14,3.45,2', '62-arms-back');
await shot('11.9,3.8,3.0,14,3.45,2', '63-dance', true);
const tr = await page.evaluate(() => window.__game && 'ok');
console.log('errors', errors, tr);
await browser.close();
