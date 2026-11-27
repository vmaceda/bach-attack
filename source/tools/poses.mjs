// node tools/poses.mjs — fixed-camera screenshots of the level (title state, ?cam=)
import { chromium } from 'playwright';
import path from 'node:path';
const poses = {
  top: '2,70,0.1,2,0,0', courtyard: '-4,6,-26,0,0,-10', deck: '-3,4,-14,0,0,4',
  carport: '-1,2.2,6,-1,1,20', fridge: '-1,4,15,-1,1,25', gully: '14,6,-12,5,-6,2',
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
for (const [k, c] of Object.entries(poses)) {
  await page.goto('file://' + path.resolve('dist/index.html') + (c ? '?cam=' + c : ''));
  await page.waitForTimeout(1800);
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `shots/pose-${k}.png` });
}
console.log('errors', errors);
await browser.close();
