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
  label: (text, bg, fg, w = 256, h = 128) => make('lbl' + text + bg + fg, w, (g, s) => {
    g.fillStyle = bg; g.fillRect(0, 0, s, s);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.floor(s / 5)}px Impact, "Arial Black", sans-serif`;
    g.fillText(text, s / 2, s / 2, s * 0.9);
  }, 4),
};
