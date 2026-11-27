#!/usr/bin/env node
// node build.mjs [--readable] [--out dist/agent-b.html] [--entry src/main.js] [--title "Name"]
//   → one self-contained HTML file (default dist/index.html): esbuild bundle of src/main.js + src/ui/ui.css
//     injected into template.html. No external assets, ever.
// --readable  no JS/CSS minify, GLSL untouched (debug line numbers); still a single file.
// --out       per-agent builds so parallel owners never overwrite each other's dist.
// Fails (exit 1) on: embedded binary blobs (data:image/audio/video/font/octet-stream), > 2 MB raw, missing slots.
// Prints raw + gzip size and the 15 biggest inputs (what to cut first when over budget).
import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glslMinifyPlugin } from './glsl-min.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const readable = argv.includes('--readable');
const out = path.resolve(here, arg('out', 'dist/index.html'));
const entry = path.resolve(here, arg('entry', 'src/main.js'));
const pkg = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8'));
const title = arg('title', pkg.gameTitle || pkg.name || 'Game');
const MAX = 2 * 1024 * 1024;
const fail = (m) => { console.error('BUILD FAILED: ' + m); process.exit(1); };

const t0 = Date.now();
const r = await build({
  entryPoints: [entry], bundle: true, format: 'iife', target: 'es2022', platform: 'browser',
  minify: !readable, write: false, metafile: true, logLevel: 'warning',
  plugins: readable ? [] : [glslMinifyPlugin()],
  // three's /** @license */ banner (MIT) must survive minification: move legal comments to the end of the bundle
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(here, 'node_modules')],
}).catch((e) => fail(e.message));
let js = r.outputFiles[0].text;
if (!/@license|MIT/.test(js.slice(-4000))) js += '\n/*! three.js r180 — Copyright 2010-2025 Three.js Authors — MIT License */\n';

const cssPath = path.join(here, 'src/ui/ui.css');
const css = existsSync(cssPath) ? (await transform(readFileSync(cssPath, 'utf8'), { loader: 'css', minify: !readable })).code : '';
let html = readFileSync(path.join(here, 'template.html'), 'utf8');
if (!html.includes('/*CSS*/') || !html.includes('/*SCRIPT*/')) fail('template.html must contain /*CSS*/ and /*SCRIPT*/ slots');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
html = html.replaceAll('{{TITLE}}', esc(title))
  .replace('/*CSS*/', () => css)
  .replace('/*SCRIPT*/', () => js.replace(/<\/script/gi, '<\\/script'));

const blob = html.match(/data:(image|audio|video|font|application\/(octet-stream|font|x-font))[^"'`)\s]{0,40}/i);
if (blob) fail(`embedded binary asset found: "${blob[0]}…" — generate it procedurally instead`);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);

const kb = (n) => (n / 1024).toFixed(1).padStart(8) + ' KB';
const gz = gzipSync(html, { level: 9 }).length;
console.log(`${path.relative(process.cwd(), out)}  ${kb(html.length).trim()} raw  ${kb(gz).trim()} gz  (${Date.now() - t0} ms${readable ? ', readable' : ''})`);
const ins = Object.values(r.metafile.outputs)[0].inputs;
const top = Object.entries(ins).map(([f, v]) => [f.replace(/.*node_modules\//, ''), v.bytesInOutput]).sort((a, b) => b[1] - a[1]);
let three = 0; for (const [f, b] of top) if (f.startsWith('three/')) three += b;
console.log(`${kb(three)}  three.js total   ${kb(css.length)}  css`);
for (const [f, b] of top.slice(0, 15)) console.log(kb(b), ' ', f);
if (html.length > MAX) fail(`${(html.length / 1048576).toFixed(2)} MB > 2 MB budget`);
