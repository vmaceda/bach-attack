// commentator triggers: synthetic event sequences + a real Rain of Chips; also checks the clips decode
import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('file://' + path.resolve('dist/index.html') + '?autostart=1&drag=1&q=low&seed=7');
await page.waitForTimeout(1500);
const res = await page.evaluate(async () => {
  const c = window.__game.commentator, el = document.querySelector('[data-bind="commentary"]');
  const out = []; let t = 1000;
  const fire = (evs, gap) => { for (const e of evs) { t += gap; c.onEvent(e, t); } return el.dataset.clip || '-'; };
  const K = { type: 'kill' };
  c.reset(); t += 10; out.push(['2 quick kills', fire([K, K], 0.5)]);
  c.reset(); t += 10; el.dataset.clip = ''; out.push(['4 quick kills', fire([K, K, K, K], 0.4)]);
  c.reset(); t += 10; el.dataset.clip = ''; out.push(['7 quick kills', fire([K, K, K, K, K, K, K], 0.3)]);
  c.reset(); t += 10; el.dataset.clip = ''; out.push(['2 slow kills', fire([K, K], 3)]);
  c.reset(); t += 10; el.dataset.clip = ''; out.push(['25 kills, no leaks, spaced', fire(Array(25).fill(K), 2.5)]);
  c.reset(); t += 10; el.dataset.clip = ''; out.push(['3 clean waves', fire([{ type: 'waveStart' }, { type: 'waveClear' }, { type: 'waveStart' }, { type: 'waveClear' }, { type: 'waveStart' }, { type: 'waveClear' }], 5)]);
  c.reset(); t += 10; el.dataset.clip = ''; out.push(['leak breaks clean run', fire([{ type: 'waveStart' }, { type: 'waveClear' }, { type: 'waveStart' }, { type: 'fridge' }, { type: 'waveClear' }, { type: 'waveStart' }, { type: 'waveClear' }], 5)]);
  c.reset(); t += 10; el.dataset.clip = ''; out.push(['level cleared', fire([{ type: 'levelClear' }], 1)]);
  // clip decode check
  const clips = ['double-kill', 'multi-kill', 'unstoppable', 'dominating', 'you-have-won-the-match'];
  const ok = await Promise.all(clips.map((k) => new Promise((r) => { const a = new Audio('sfx/' + k + '.mp3'); a.oncanplaythrough = () => r(k + ' ' + a.duration.toFixed(2) + 's'); a.onerror = () => r(k + ' ERROR'); })));
  return { out, ok };
});
for (const [k, v] of res.out) console.log(k.padEnd(28), '→', v);
console.log('clips:', res.ok.join(', '));
// real gameplay: Rain of Chips burst
await page.evaluate(() => { document.querySelector('[data-bind="commentary"]').dataset.clip = ''; window.__game.commentator.reset(); });
await page.keyboard.press('KeyG');
for (let i = 0; i < 80; i++) { await page.waitForTimeout(250); if (await page.evaluate(() => window.__game.sim.state.enemies.length >= 6)) break; }
await page.evaluate(() => { window.__game.sim.state.chipMeter = 40; });
await page.keyboard.press('KeyF');
for (let i = 0; i < 120; i++) { await page.waitForTimeout(250); if (await page.evaluate(() => !window.__game.sim.state.rain.active && window.__game.sim.state.rain.t > 0)) break; }
console.log('real Rain of Chips burst →', await page.evaluate(() => document.querySelector('[data-bind="commentary"]').dataset.clip), 'kills', await page.evaluate(() => window.__game.sim.state.rain.kills));
console.log('errors', errors);
await browser.close();
