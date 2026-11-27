// Procedural canvas textures (generated at load — no image files, no data: blobs).
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace, LinearMipmapLinearFilter } from 'three';

let seed = 1337;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const cache = new Map();

function make(name, size, draw, anisotropy = 8) {
  if (cache.has(name)) return cache.get(name);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = anisotropy;
  cache.set(name, t);
  return t;
}

// PBR companions for a colour texture: a tangent-space normal map (Sobel of the luminance height field, wrapped so it
// tiles) and a roughness map (crevices rougher, raised/polished bits smoother). o.invert flips the height (grooves
// that are light in the albedo), o.height(x,y) overrides it with an analytic field (corrugated iron).
const pbrCache = new Map();
export function pbr(tex, o = {}) {
  const key = tex.uuid + JSON.stringify(o, (k, v) => (typeof v === 'function' ? String(v) : v));
  if (pbrCache.has(key)) return pbrCache.get(key);
  const src = tex.image, w = src.width, h = src.height;
  const px = src.getContext('2d').getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let v = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    if (o.invert) v = 1 - v;
    if (o.height) v = o.height(x / w, y / h, v);
    H[y * w + x] = v;
  }
  const strength = o.strength ?? 2.5, [r0, r1] = o.rough ?? [0.55, 0.95];
  const nc = document.createElement('canvas'), rc = document.createElement('canvas');
  nc.width = rc.width = w; nc.height = rc.height = h;
  const nctx = nc.getContext('2d'), rctx = rc.getContext('2d');
  const nd = nctx.createImageData(w, h), rd = rctx.createImageData(w, h);
  const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    nd.data[i] = (nx * 0.5 + 0.5) * 255; nd.data[i + 1] = (ny * 0.5 + 0.5) * 255; nd.data[i + 2] = (nz * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
    const r = (r1 - (r1 - r0) * at(x, y)) * 255;
    rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = r; rd.data[i + 3] = 255;
  }
  nctx.putImageData(nd, 0, 0); rctx.putImageData(rd, 0, 0);
  const mk = (c) => { const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = NoColorSpace; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = 8; return t; };
  const out = { normalMap: mk(nc), roughnessMap: mk(rc) };
  pbrCache.set(key, out);
  return out;
}

const speckle = (g, s, n, cols, rmin, rmax, a = 1) => {
  g.globalAlpha = a;
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    const r = rmin + rnd() * (rmax - rmin);
    g.fillRect(rnd() * s, rnd() * s, r, r);
  }
  g.globalAlpha = 1;
};

export const TEX = {
  waterNormals: () => {
    if (cache.has('waterN')) return cache.get('waterN');
    const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), d = g.createImageData(n, n);
    const waves = []; for (let i = 0; i < 24; i++) waves.push([Math.floor(1 + rnd() * 9) * (rnd() < 0.5 ? -1 : 1), Math.floor(1 + rnd() * 9) * (rnd() < 0.5 ? -1 : 1), rnd() * 6.28, 0.3 + rnd()]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let hx = 0, hy = 0;
      for (const [kx, ky, ph, a] of waves) { const p = (kx * x + ky * y) / n * 6.2832 + ph, cs = Math.cos(p) * a / Math.hypot(kx, ky); hx += cs * kx; hy += cs * ky; }
      let nx = -hx * 0.08, ny = -hy * 0.08, nz = 1; const l = Math.hypot(nx, ny, nz);
      const i = (y * n + x) * 4; d.data[i] = (nx / l * 0.5 + 0.5) * 255; d.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; d.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = NoColorSpace;
    cache.set('waterN', t); return t;
  },
  grass: () => make('grass', 256, (g, s) => {
    g.fillStyle = '#5f9a3a'; g.fillRect(0, 0, s, s);
    speckle(g, s, 2600, ['#6fae43', '#4f8a30', '#7dbb4c', '#578f35', '#8cc35a'], 1, 3);
    g.strokeStyle = 'rgba(40,80,20,0.35)';
    for (let i = 0; i < 700; i++) { const x = rnd() * s, y = rnd() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 5); g.stroke(); }
    speckle(g, s, 30, ['#f3f1d9', '#ffe36b'], 2, 3); // daisies / buttercups
  }),
  dirt: () => make('dirt', 256, (g, s) => {
    g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, s, s);
    speckle(g, s, 2500, ['#5a3d24', '#7a5634', '#4a321d', '#866142'], 1, 4);
    for (let y = 0; y < s; y += 18 + rnd() * 10) { g.fillStyle = 'rgba(40,25,10,0.25)'; g.fillRect(0, y, s, 3 + rnd() * 4); }
  }),
  compost: () => make('compost', 256, (g, s) => {
    g.fillStyle = '#3d2a17'; g.fillRect(0, 0, s, s);
    speckle(g, s, 2500, ['#2d1e0f', '#523920', '#4b3a1a', '#6b5a2a'], 2, 6);
    speckle(g, s, 140, ['#c9a227', '#8a9a3a', '#d77a2a', '#e8e0c8'], 3, 7); // banana peels, grass clippings, eggshell
  }),
  planks: () => make('planks', 256, (g, s) => {
    const n = 8, w = s / n;
    for (let i = 0; i < n; i++) {
      const base = 120 + rnd() * 40;
      g.fillStyle = `rgb(${base + 40},${base * 0.72 + 10},${base * 0.45})`; g.fillRect(i * w, 0, w, s);
      g.strokeStyle = 'rgba(60,35,15,0.22)';
      for (let k = 0; k < 14; k++) { const x = i * w + rnd() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 3, s * 0.3, x - 3, s * 0.6, x + 1, s); g.stroke(); }
      g.fillStyle = 'rgba(30,18,8,0.75)'; g.fillRect(i * w, 0, 2, s);
      const cut = rnd() * s; g.fillRect(i * w, cut, w, 2);
      g.fillStyle = 'rgba(40,40,40,0.8)'; g.fillRect(i * w + 4, cut + 6, 2, 2); g.fillRect(i * w + w - 6, cut + 6, 2, 2);
    }
  }),
  weatherboard: (col = '#e9dfb8') => make('wb' + col, 256, (g, s) => {
    g.fillStyle = col; g.fillRect(0, 0, s, s);
    const n = 10, h = s / n;
    for (let i = 0; i < n; i++) {
      const gr = g.createLinearGradient(0, i * h, 0, (i + 1) * h);
      gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.85, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = gr; g.fillRect(0, i * h, s, h);
    }
    speckle(g, s, 400, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.1)'], 1, 3);
  }),
  corrugated: (col = '#8fa3a0') => make('corr' + col, 256, (g, s) => {
    g.fillStyle = col; g.fillRect(0, 0, s, s);
    const n = 16, w = s / n;
    for (let i = 0; i < n; i++) {
      const gr = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = gr; g.fillRect(i * w, 0, w, s);
    }
    speckle(g, s, 260, ['rgba(140,70,30,0.35)', 'rgba(90,50,20,0.3)'], 2, 6); // a bit of rust, it's a bach
  }),
  palings: () => make('palings', 256, (g, s) => {
    const n = 10, w = s / n;
    for (let i = 0; i < n; i++) {
      const b = 125 + rnd() * 35;
      g.fillStyle = `rgb(${b},${b * 0.86},${b * 0.68})`; g.fillRect(i * w, 0, w - 2, s);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(i * w + w - 2, 0, 2, s);
      g.strokeStyle = 'rgba(70,55,40,0.25)';
      for (let k = 0; k < 6; k++) { const x = i * w + rnd() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 4, s); g.stroke(); }
    }
    g.fillStyle = 'rgba(60,45,30,0.6)'; g.fillRect(0, s * 0.18, s, 6); g.fillRect(0, s * 0.78, s, 6);
  }),
  hedge: () => make('hedge', 256, (g, s) => {
    g.fillStyle = '#2f5a24'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const c = ['#3b6e2c', '#264a1d', '#4a8236', '#1f3d18', '#56913f'][(rnd() * 5) | 0];
      g.fillStyle = c; g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 2 + rnd() * 4, 1 + rnd() * 2, rnd() * 3, 0, 7); g.fill();
    }
  }),
  brick: () => make('brick', 256, (g, s) => {
    g.fillStyle = '#c9c1b2'; g.fillRect(0, 0, s, s);
    const rows = 8, bh = s / rows, bw = s / 4;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0), b = 140 + rnd() * 40;
      g.fillStyle = `rgb(${b + 30},${b * 0.5},${b * 0.38})`; g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }),
  sign: (lines, bg = '#ffd21f', fg = '#111', size = 256) => make('sign' + lines.join('|') + bg, size, (g, s) => {
    g.fillStyle = bg; g.fillRect(0, 0, s, s);
    g.strokeStyle = fg; g.lineWidth = s * 0.04; g.strokeRect(s * 0.05, s * 0.05, s * 0.9, s * 0.9);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((l, i) => {
      g.font = `900 ${Math.floor(s / (n + 1.6))}px Impact, "Arial Black", sans-serif`;
      g.fillText(l, s / 2, s * (0.5 + (i - (n - 1) / 2) / (n + 0.8)), s * 0.84);
    });
  }, 4),
  // sun-tanned skin with ink: a silver fern up the arm and koru swirls
  tattooSkin: () => make('tattoo', 256, (g, sz) => {
    g.fillStyle = '#c98a62'; g.fillRect(0, 0, sz, sz);
    speckle(g, sz, 900, ['rgba(120,60,30,0.10)', 'rgba(255,220,190,0.08)'], 1, 3);
    g.strokeStyle = 'rgba(30,40,45,0.78)'; g.lineWidth = 3; g.lineCap = 'round';
    for (const cx of [64, 192]) { // fern frond running along the arm (u wraps round, v runs along)
      g.beginPath(); g.moveTo(cx, 20); g.quadraticCurveTo(cx + 10, 128, cx - 4, 236); g.stroke();
      for (let i = 0; i < 12; i++) { const y = 30 + i * 17, l = 22 - Math.abs(i - 6) * 1.8; g.beginPath(); g.moveTo(cx + 3, y); g.quadraticCurveTo(cx + l * 0.6, y - 6, cx + l, y - 2); g.stroke(); g.beginPath(); g.moveTo(cx + 3, y); g.quadraticCurveTo(cx - l * 0.6, y - 6, cx - l, y - 2); g.stroke(); }
    }
    for (const [x, y] of [[128, 60], [128, 180], [20, 128], [236, 128]]) { g.beginPath(); for (let a = 0; a < 12; a += 0.2) { const r = 2 + a * 1.6; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.stroke(); }
  }),
  burlap: (text) => make('burlap' + text, 256, (g, sz) => {
    g.fillStyle = '#a8865a'; g.fillRect(0, 0, sz, sz);
    for (let i = 0; i < sz; i += 4) { g.fillStyle = i % 8 ? 'rgba(80,55,25,0.25)' : 'rgba(230,200,150,0.18)'; g.fillRect(i, 0, 2, sz); g.fillRect(0, i, sz, 2); }
    speckle(g, sz, 500, ['rgba(60,40,20,0.3)', 'rgba(200,170,120,0.3)'], 1, 4);
    g.fillStyle = '#7a5a3a'; g.fillRect(150, 30, 60, 50); g.fillStyle = '#8a6a48'; g.fillRect(30, 170, 50, 45); // patches
    if (text) { g.fillStyle = 'rgba(40,25,10,0.85)'; g.font = '900 64px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.fillText(text, sz / 2, sz / 2 + 22); }
  }),
  ironRunes: () => make('iron', 256, (g, sz) => {
    g.fillStyle = '#3a3c40'; g.fillRect(0, 0, sz, sz);
    speckle(g, sz, 1600, ['#2a2b2e', '#4a4c50', '#5a3a28', '#6b4128'], 1, 5);
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; g.strokeRect(6, 6, sz - 12, sz / 2 - 8); g.strokeRect(6, sz / 2 + 2, sz - 12, sz / 2 - 8);
    g.fillStyle = '#1a1a1a'; for (const [x, y] of [[14, 14], [sz - 18, 14], [14, sz - 18], [sz - 18, sz - 18], [14, sz / 2 + 10], [sz - 18, sz / 2 + 10]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  }),
  runeGlow: () => make('runeGlow', 256, (g, sz) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, sz, sz);
    g.strokeStyle = '#ff3a1a'; g.lineWidth = 3; g.shadowColor = '#ff2a00'; g.shadowBlur = 8;
    for (let i = 0; i < 9; i++) { const x = 30 + (i % 3) * 80 + rnd() * 20, y = 30 + Math.floor(i / 3) * 80 + rnd() * 20; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10, y + 26); g.lineTo(x + 20, y); g.moveTo(x + 4, y + 12); g.lineTo(x + 16, y + 12); g.stroke(); }
    g.beginPath(); for (let i = 0; i < 6; i++) { g.moveTo(rnd() * sz, rnd() * sz); g.lineTo(rnd() * sz, rnd() * sz); } g.globalAlpha = 0.5; g.stroke();
  }, 4),
  canLabel: () => make('canLabel', 256, (g, sz) => {
    const gr = g.createLinearGradient(0, 0, sz, 0); gr.addColorStop(0, '#1d3f8a'); gr.addColorStop(0.5, '#3a6ad8'); gr.addColorStop(1, '#1d3f8a');
    g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
    g.fillStyle = '#e8a83a'; g.beginPath(); g.ellipse(sz / 2, sz / 2, 90, 60, 0, 0, 7); g.fill();
    g.fillStyle = '#1d3f8a'; g.font = '900 40px Impact, sans-serif'; g.textAlign = 'center'; g.fillText('BACH', sz / 2, sz / 2 - 4); g.font = '900 30px Impact, sans-serif'; g.fillText('GOLD', sz / 2, sz / 2 + 30);
    g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) g.fillText('★', sz / 2 - 45 + i * 30, sz / 2 + 80);
  }),
  lpLabel: () => make('lpLabel', 128, (g, sz) => {
    g.fillStyle = '#2a1a0a'; g.beginPath(); g.arc(sz / 2, sz / 2, sz / 2, 0, 7); g.fill();
    g.fillStyle = '#ffd21f'; g.beginPath(); g.arc(sz / 2, sz / 2, sz / 2 - 8, 0, 7); g.fill();
    g.fillStyle = '#3a1f0a'; g.font = '900 46px Impact, sans-serif'; g.textAlign = 'center'; g.fillText('L&P', sz / 2, sz / 2 + 16);
  }, 4),
  breeza: () => make('breeza', 256, (g, sz) => {
    g.fillStyle = '#e8641a'; g.fillRect(0, 0, sz, sz);
    g.fillStyle = '#1a1a1a'; g.fillRect(0, sz * 0.38, sz, sz * 0.24);
    g.fillStyle = '#ffffff'; g.font = '900 38px Impact, sans-serif'; g.textAlign = 'center'; g.fillText('BREEZA 5000', sz / 2, sz / 2 + 13);
    speckle(g, sz, 300, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.15)'], 1, 4);
  }),
  label: (text, bg, fg, w = 256, h = 128) => make('lbl' + text + bg + fg, w, (g, s) => {
    g.fillStyle = bg; g.fillRect(0, 0, s, s);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.floor(s / 5)}px Impact, "Arial Black", sans-serif`;
    g.fillText(text, s / 2, s / 2, s * 0.9);
  }, 4),
};
