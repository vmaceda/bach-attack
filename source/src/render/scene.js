// Renderer, lighting, sky and the static level. Level meshes are generated from contracts.BOXES (the collision
// boxes), then dressed with purely visual set pieces (gable roof, roller doors, fridge, ute, clothesline, trees, sea).
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, PointLight, Fog, Color, Mesh, Group,
  BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, PlaneGeometry, TorusGeometry, CircleGeometry,
  MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial, BackSide, DoubleSide, ACESFilmicToneMapping, SRGBColorSpace,
  PCFSoftShadowMap, Vector3, Shape, ExtrudeGeometry, BufferGeometry, Float32BufferAttribute, LineSegments, LineBasicMaterial,
} from 'three';
import { BOXES, PATHS, DOORS, GOAL, CAMERA } from '../contracts.js';
import { TEX } from './textures.js';
import { heightAt } from '../sim/world.js';

const std = (o) => new MeshStandardMaterial(o);
const tiled = (tex, scale, o = {}) => { const m = std({ map: tex, roughness: 0.9, ...o }); m.userData.uvScale = scale; return m; };

export function createScene(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  const skyCol = new Color('#9fd3f5');
  scene.background = skyCol;
  scene.fog = new Fog(new Color('#bfe0f2'), 70, 260);
  const camera = new PerspectiveCamera(CAMERA.fov, 16 / 9, 0.1, 900);

  // ---- light: a sunny Kiwi summer arvo
  const hemi = new HemisphereLight('#cfe8ff', '#5c7a3a', 1.15);
  scene.add(hemi);
  const sun = new DirectionalLight('#fff1d6', 2.9);
  sun.position.set(28, 46, 18);
  sun.target.position.set(1, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 5; sc.far = 130;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // ---- sky dome with sun glow
  const skyMat = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new Vector3(28, 46, 18).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir;
      void main(){ float h = clamp(vP.y, -0.2, 1.0);
        vec3 top = vec3(0.24,0.52,0.86), hor = vec3(0.78,0.89,0.96);
        vec3 c = mix(hor, top, pow(max(h,0.0), 0.55));
        float s = max(dot(normalize(vP), sunDir), 0.0);
        c += vec3(1.0,0.9,0.7) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new Mesh(new SphereGeometry(600, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- materials
  const M = {
    grass: tiled(TEX.grass(), 4), dirt: tiled(TEX.dirt(), 3), compost: tiled(TEX.compost(), 3),
    planks: tiled(TEX.planks(), 2.4, { roughness: 0.8 }), planksDark: tiled(TEX.planks(), 2.4, { color: '#a08870' }),
    wbCream: tiled(TEX.weatherboard('#efe4bd'), 2), wbBlue: tiled(TEX.weatherboard('#a9cfd2'), 2),
    corrGarage: tiled(TEX.corrugated('#7f9a8c'), 2, { metalness: 0.35, roughness: 0.55 }),
    corrShed: tiled(TEX.corrugated('#5f7f55'), 2, { metalness: 0.3, roughness: 0.6 }),
    corrRoof: tiled(TEX.corrugated('#b5452e'), 2, { metalness: 0.3, roughness: 0.55 }),
    corrZinc: tiled(TEX.corrugated('#c4cac6'), 2, { metalness: 0.5, roughness: 0.45 }),
    palings: tiled(TEX.palings(), 2.5), hedge: tiled(TEX.hedge(), 3), brick: tiled(TEX.brick(), 2),
    white: std({ color: '#f3f3ef', roughness: 0.35 }), black: std({ color: '#1b1b1b', roughness: 0.6 }),
    dark: std({ color: '#151210', roughness: 1 }), glass: std({ color: '#9fd6ee', roughness: 0.08, metalness: 0.1, emissive: '#1a3a48' }),
    frame: std({ color: '#f7f7f2', roughness: 0.5 }), steel: std({ color: '#b9c2c7', metalness: 0.8, roughness: 0.35 }),
  };
  const LOOK = {
    grass: [M.dirt, M.dirt, M.grass, M.dirt, M.dirt, M.dirt], compost: M.compost,
    garage: M.corrGarage, hedge: M.hedge, fence: M.palings, brick: M.brick,
    bach: [M.wbCream, M.wbCream, M.corrRoof, M.wbCream, M.wbCream, M.wbCream],
    deck: [M.planksDark, M.planksDark, M.planks, M.planksDark, M.planksDark, M.planksDark], lowhedge: M.hedge,
    carportwall: M.wbBlue, shed: M.corrShed, carportroof: M.corrZinc, porch: [M.planksDark, M.planksDark, M.planks, M.planksDark, M.planksDark, M.planksDark],
    step: M.planks,
  };

  const level = new Group();
  scene.add(level);
  for (const b of BOXES) {
    const mat = LOOK[b.look];
    if (!mat) continue; // special props get bespoke models below
    const mesh = new Mesh(worldBoxGeo(b, Array.isArray(mat) ? mat : [mat, mat, mat, mat, mat, mat]), mat);
    mesh.castShadow = b.kind !== 'ground';
    mesh.receiveShadow = true;
    level.add(mesh);
  }

  const add = (geo, mat, x, y, z, o = {}) => {
    const m = new Mesh(geo, mat); m.position.set(x, y, z);
    if (o.ry) m.rotation.y = o.ry; if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz;
    if (o.s) m.scale.setScalar(o.s);
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    (o.parent || level).add(m); return m;
  };
  const sign = (lines, w, h, x, y, z, ry, bg, fg) => add(new PlaneGeometry(w, h), std({ map: TEX.sign(lines, bg, fg), roughness: 0.7 }), x, y, z, { ry, cast: false });

  // ---- the bach: gable roof, windows, ranch slider, sign
  {
    const rise = 1.9, half = 4.6, len = 21, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    for (const s of [-1, 1]) add(new BoxGeometry(slope, 0.14, len), M.corrRoof, -9 + s * half / 2, 4.2 + rise / 2, 0, { rz: -s * ang });
    const tri = new Shape(); tri.moveTo(-4.1, 0); tri.lineTo(4.1, 0); tri.lineTo(0, rise - 0.1); tri.closePath();
    const gable = new ExtrudeGeometry(tri, { depth: 0.1, bevelEnabled: false });
    for (const z of [-10.05, 9.95]) add(gable, M.wbCream, -9, 4.2, z);
    for (const z of [-6.5, -1.5, 3.5]) {
      add(new BoxGeometry(0.08, 1.3, 1.9), M.frame, -4.97, 3.0, z, { cast: false });
      add(new BoxGeometry(0.06, 1.1, 1.7), M.glass, -4.94, 3.0, z, { cast: false });
    }
    add(new BoxGeometry(0.08, 2.2, 2.6), M.frame, -4.97, 1.7, 7.5, { cast: false }); // ranch slider (hit it with a jandal)
    add(new BoxGeometry(0.06, 2.0, 2.4), M.glass, -4.94, 1.7, 7.5, { cast: false });
    sign(['THE BACH', 'EST. 1974'], 2.6, 1.0, -4.9, 3.75, 0.9, Math.PI / 2, '#f4ecd0', '#2b4a6b');
    // little chimney + TV aerial, because every bach has both
    add(new BoxGeometry(0.7, 1.6, 0.7), M.brick, -10.5, 5.6, -5);
    add(new CylinderGeometry(0.03, 0.03, 2, 6), M.steel, -8, 6.6, 4);
    for (let i = 0; i < 5; i++) add(new BoxGeometry(1.4 - i * 0.2, 0.03, 0.03), M.steel, -8, 6.9 + i * 0.18, 4, { cast: false });
  }

  // ---- garage block + roller doors (spawn points)
  for (const key of ['L', 'R']) {
    const d = DOORS[key];
    add(new BoxGeometry(4.6, 3.1, 0.3), M.dark, d.x, 1.55, -30.9, { cast: false });
    const door = add(new BoxGeometry(4.6, 1.1, 0.12), tiled(TEX.corrugated('#d8d2bf'), 1, { roughness: 0.5, metalness: 0.3 }), d.x, 2.55, -30.82);
    add(new BoxGeometry(5, 0.25, 0.4), M.frame, d.x, 3.2, -30.8);
    for (const sx of [-2.4, 2.4]) add(new BoxGeometry(0.2, 3.2, 0.4), M.frame, d.x + sx, 1.6, -30.8);
  }
  sign(['GULLS', 'GO HOME'], 2.2, 1.1, -7, 3.6, -30.78, 0, '#ffffff', '#c22');
  sign(['MIND', 'THE MOWER'], 2.2, 1.1, 7, 3.6, -30.78, 0, '#ffd21f', '#111');

  // ---- porch railing (see-through: posts + rails over the collision box)
  for (const b of BOXES) if (b.look === 'rail') {
    const x = (b.min[0] + b.max[0]) / 2, len = b.max[2] - b.min[2], cz = (b.min[2] + b.max[2]) / 2, top = b.max[1];
    add(new BoxGeometry(0.14, 0.08, len), M.planks, x, top - 0.04, cz);
    add(new BoxGeometry(0.06, 0.05, len), M.planksDark, x, b.min[1] + 0.45, cz, { cast: false });
    for (let z = b.min[2] + 0.1; z <= b.max[2]; z += 1.5) add(new BoxGeometry(0.1, top - b.min[1], 0.1), M.planksDark, x, (top + b.min[1]) / 2, z);
  }

  // ---- carport posts, roof trim, signage
  for (const [x, z] of [[-4.85, 11.1], [2.85, 11.1], [-4.85, 18.9], [2.85, 18.9]]) add(new BoxGeometry(0.25, 2.8, 0.25), M.planksDark, x, 1.4, z);
  add(new BoxGeometry(8.2, 0.3, 0.2), M.frame, -1, 2.95, 10.95);
  sign(['SLOW', 'PESTS AT', 'PLAY'], 1.4, 1.4, -1, 3.95, 10.9, 0, '#ffffff', '#c22');
  sign(['CAUTION:', 'COMPOST', 'GULLY'], 1.6, 1.6, 2.6, 1.5, -8.6, 0, '#ffd21f', '#111');

  // ---- objective: Bach Beer Fridge & Pie Warmer
  const fridge = new Group(); fridge.position.set(-1, 0, 25.7); level.add(fridge);
  add(new BoxGeometry(2.3, 2.2, 1.3), M.white, 0, 1.1, 0, { parent: fridge });
  add(new BoxGeometry(2.2, 0.03, 0.02), M.black, 0, 1.45, -0.66, { parent: fridge, cast: false });
  for (const y of [0.8, 1.8]) add(new BoxGeometry(0.08, 0.5, 0.08), M.steel, 0.95, y, -0.7, { parent: fridge });
  add(new PlaneGeometry(1.5, 0.75), std({ map: TEX.sign(['BEERS', 'HANDS OFF'], '#ffffff', '#1d4ea8'), roughness: 0.5 }), -0.1, 1.85, -0.67, { parent: fridge, ry: Math.PI, cast: false });
  const fridgeGlow = std({ color: '#ffffff', emissive: '#7fe3ff', emissiveIntensity: 1.6 });
  add(new BoxGeometry(2.0, 0.08, 0.05), fridgeGlow, 0, 0.18, -0.66, { parent: fridge, cast: false });
  const ringMat = new MeshBasicMaterial({ color: '#43ff8a', transparent: true, opacity: 0.55, depthWrite: false });
  const ring = add(new TorusGeometry(2.4, 0.07, 6, 48), ringMat, 0, 0.06, -0.3, { parent: fridge, rx: Math.PI / 2, cast: false });
  const warmer = new Group(); warmer.position.set(1.1, 0, 25.7); level.add(warmer);
  add(new BoxGeometry(1.2, 0.5, 1.0), M.steel, 0, 0.25, 0, { parent: warmer });
  add(new BoxGeometry(1.15, 0.55, 0.95), std({ color: '#ffb36b', emissive: '#ff7a1a', emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.1 }), 0, 0.78, 0, { parent: warmer, cast: false });
  const pieMat = std({ color: '#c98a3c', roughness: 0.7 });
  for (let i = 0; i < 6; i++) add(new CylinderGeometry(0.15, 0.13, 0.08, 12), pieMat, -0.35 + (i % 3) * 0.35, 0.6 + Math.floor(i / 3) * 0.24, 0, { parent: warmer, cast: false });
  const warmLight = new PointLight('#ff9a4a', 6, 7, 2); warmLight.position.set(0.4, 1.4, 24.6); level.add(warmLight);
  // crates of brown bottles + a couch, naturally
  const crateMat = std({ color: '#c79a52', roughness: 0.9 }), bottleMat = std({ color: '#5a2d0c', roughness: 0.25, metalness: 0.1 });
  for (const [x, z, n] of [[-3.4, 26.2, 2], [-3.6, 24.7, 1]]) for (let k = 0; k < n; k++) {
    add(new BoxGeometry(0.9, 0.45, 0.6), crateMat, x, 0.23 + k * 0.46, z);
    for (let i = 0; i < 6; i++) add(new CylinderGeometry(0.05, 0.05, 0.22, 6), bottleMat, x - 0.3 + (i % 3) * 0.3, 0.55 + k * 0.46, z - 0.12 + Math.floor(i / 3) * 0.24, { cast: false });
  }
  {
    const couch = std({ color: '#7c4b6e', roughness: 1 });
    add(new BoxGeometry(2.4, 0.5, 0.9), couch, 5.3, 0.35, 21.5, { ry: 0.3 });
    add(new BoxGeometry(2.4, 0.8, 0.25), couch, 5.42, 0.75, 21.9, { ry: 0.3 });
  }

  // ---- ute (white, with surfboard), chilly bin
  {
    const ute = new Group(); ute.position.set(11.25, 0, 26.45); level.add(ute);
    const paint = std({ color: '#f1f1ee', roughness: 0.35, metalness: 0.4 }), tyre = std({ color: '#161616', roughness: 0.9 });
    add(new BoxGeometry(5.3, 0.75, 3.6), paint, 0, 0.85, 0, { parent: ute });
    add(new BoxGeometry(1.9, 0.8, 3.5), paint, -1.1, 1.6, 0, { parent: ute });
    add(new BoxGeometry(1.6, 0.6, 3.52), M.glass, -1.15, 1.62, 0, { parent: ute, cast: false });
    for (const [x, z] of [[-1.7, -1.75], [-1.7, 1.75], [1.7, -1.75], [1.7, 1.75]]) add(new CylinderGeometry(0.45, 0.45, 0.35, 16), tyre, x, 0.45, z, { parent: ute, rx: Math.PI / 2 });
    add(new BoxGeometry(2.6, 0.08, 0.6), std({ color: '#ff5a3c', roughness: 0.4 }), 1.3, 1.3, 0.2, { parent: ute, ry: 0.15 });
    const bin = new Group(); bin.position.set(-10.5, 0, -26.25); level.add(bin);
    add(new BoxGeometry(2, 0.75, 1.5), std({ color: '#2a7fd4', roughness: 0.5 }), 0, 0.38, 0, { parent: bin });
    add(new BoxGeometry(2.05, 0.16, 1.55), M.white, 0, 0.82, 0, { parent: bin });
  }

  // ---- rotary clothesline in the courtyard (purely visual: togs, a towel, a single jandal)
  {
    const cl = new Group(); cl.position.set(7.5, 0, -18); level.add(cl);
    add(new CylinderGeometry(0.05, 0.06, 2.4, 8), M.steel, 0, 1.2, 0, { parent: cl });
    for (let i = 0; i < 4; i++) add(new BoxGeometry(3.2, 0.04, 0.04), M.steel, 0, 2.35, 0, { parent: cl, ry: i * Math.PI / 4, cast: false });
    const cloth = ['#e3423a', '#2e6fd8', '#ffd23a', '#ffffff', '#1d1d1d'];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      add(new PlaneGeometry(0.6, 0.8), std({ color: cloth[i], roughness: 1, side: DoubleSide }), Math.cos(a) * 1.1, 1.9, Math.sin(a) * 1.1, { parent: cl, ry: -a });
    }
    cl.userData.spin = true;
    level.userData.clothesline = cl;
  }

  // ---- buzzy bee on the deck, garden gnome by the porch
  {
    const bee = new Group(); bee.position.set(1.2, 0.6, 9.2); bee.rotation.y = -0.8; level.add(bee);
    add(new SphereGeometry(0.28, 12, 8), std({ color: '#ffcc1a', roughness: 0.5 }), 0, 0.35, 0, { parent: bee });
    for (const z of [-0.08, 0.08]) add(new TorusGeometry(0.27, 0.035, 6, 16), std({ color: '#d83a2a' }), 0, 0.35, z, { parent: bee, cast: false });
    add(new SphereGeometry(0.18, 10, 8), std({ color: '#d83a2a' }), 0, 0.42, -0.36, { parent: bee });
    for (const s of [-1, 1]) add(new BoxGeometry(0.45, 0.04, 0.18), std({ color: '#3a7be0' }), s * 0.3, 0.62, 0, { parent: bee, rz: s * 0.4 });
    for (const s of [-1, 1]) add(new CylinderGeometry(0.1, 0.1, 0.05, 12), std({ color: '#3a7be0' }), s * 0.2, 0.1, 0, { parent: bee, rz: Math.PI / 2 });
    const gn = new Group(); gn.position.set(10.3, 0, -15.3); level.add(gn);
    add(new CylinderGeometry(0.16, 0.2, 0.4, 10), std({ color: '#2f6fe0' }), 0, 0.2, 0, { parent: gn });
    add(new SphereGeometry(0.13, 10, 8), std({ color: '#f2c6a0' }), 0, 0.5, 0, { parent: gn });
    add(new ConeGeometry(0.14, 0.32, 10), std({ color: '#d8302a' }), 0, 0.72, 0, { parent: gn });
  }

  // ---- compost heaps at the bottom of the gully (where yeeted pests end up)
  {
    const heap = std({ map: TEX.compost(), roughness: 1 });
    for (const [x, z, r] of [[4.5, -4, 2.2], [8.5, 1, 2.6], [5.5, 6.5, 2], [9, -6, 1.6]]) {
      const m = add(new SphereGeometry(1, 14, 8), heap, x, -7, z, { cast: false }); m.scale.set(r, r * 0.45, r);
    }
    const peel = std({ color: '#f2cf3a', roughness: 0.6 });
    for (let i = 0; i < 9; i++) add(new BoxGeometry(0.35, 0.06, 0.12), peel, 3 + (i * 37 % 7), -6.6 + (i % 3) * 0.2, -6 + (i * 53 % 15), { ry: i, cast: false });
    sign(['COMPOST', 'NO PESTS', '(lol)'], 1.6, 1.6, 10.9, -5.2, 3, -Math.PI / 2, '#8fd16a', '#1d3a12');
  }

  // ---- harakeke (flax) and pohutukawa / cabbage trees, hills and the sea beyond
  const flaxMat = std({ color: '#3f6b2a', roughness: 0.8, side: DoubleSide });
  const flax = (x, z, s = 1) => {
    const g = new Group(); g.position.set(x, 0, z); g.scale.setScalar(s); level.add(g);
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4, lean = 0.15 + (i % 3) * 0.12;
      const m = add(new PlaneGeometry(0.14, 1.6), flaxMat, Math.cos(a) * 0.1, 0.75, Math.sin(a) * 0.1, { parent: g, ry: a, cast: false });
      m.rotation.order = 'YXZ'; m.rotation.x = lean;
    }
  };
  for (const [x, z] of [[-12, -15], [-12, 22], [-6.5, 28.5], [15.5, -29], [-12, -29.5], [5, 28.6]]) flax(x, z, 1.1);
  const trunk = std({ color: '#5a4636', roughness: 1 }), crownG = std({ color: '#2f5d28', roughness: 0.9 }), crownR = std({ color: '#c8242e', roughness: 0.8 });
  const pohutukawa = (x, z, s) => {
    const g = new Group(); g.position.set(x, 0, z); g.scale.setScalar(s); level.add(g);
    add(new CylinderGeometry(0.35, 0.6, 3.2, 8), trunk, 0, 1.6, 0, { parent: g });
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, r = i ? 1.9 : 0;
      add(new SphereGeometry(1.7 - (i ? 0.3 : 0), 10, 8), i % 2 ? crownR : crownG, Math.cos(a) * r, 3.8 + (i % 3) * 0.4, Math.sin(a) * r, { parent: g });
    }
  };
  const cabbage = (x, z, s) => {
    const g = new Group(); g.position.set(x, 0, z); g.scale.setScalar(s); level.add(g);
    add(new CylinderGeometry(0.12, 0.2, 4, 6), trunk, 0, 2, 0, { parent: g });
    for (let i = 0; i < 14; i++) {
      const m = add(new ConeGeometry(0.06, 1.3, 4), crownG, 0, 4.1, 0, { parent: g });
      m.rotation.set(Math.cos(i * 2.4) * 1.1, i * 2.4, Math.sin(i * 2.4) * 1.1);
    }
  };
  for (const [x, z, s] of [[-20, -10, 1.4], [-21, 14, 1.6], [-19, 30, 1.3], [24, -20, 1.5], [25, 8, 1.7], [23, 32, 1.4], [-6, 37, 1.5], [9, 38, 1.3]]) pohutukawa(x, z, s);
  for (const [x, z, s] of [[-17, -26, 1], [21, -32, 1.1], [-17, 3, 0.9], [21, 20, 1]]) cabbage(x, z, s);
  const hillMat = std({ color: '#5d8c3c', roughness: 1 }), hillMat2 = std({ color: '#4b7a33', roughness: 1 });
  for (const [x, z, r, h] of [[-90, 40, 60, 28], [-40, 110, 70, 34], [60, 120, 80, 40], [120, 30, 60, 26], [-140, -20, 70, 30], [150, -40, 50, 20]]) {
    const m = add(new SphereGeometry(1, 24, 12), (x + z) % 3 ? hillMat : hillMat2, x, -3, z, { cast: false });
    m.scale.set(r, h, r);
  }
  const sea = add(new PlaneGeometry(1400, 600), std({ color: '#2a7fb8', roughness: 0.15, metalness: 0.2 }), 0, -1.5, -340, { rx: -Math.PI / 2, cast: false });
  add(new PlaneGeometry(1400, 60), std({ color: '#e9d7a8', roughness: 1 }), 0, -1.2, -55, { rx: -Math.PI / 2, cast: false });
  add(new PlaneGeometry(500, 500), std({ color: '#5f9a3a', roughness: 1 }), 0, -0.05, 283, { rx: -Math.PI / 2, cast: false });
  for (const [x, z, w, d] of [[-120, -10, 200, 90], [140, -10, 220, 90]]) add(new PlaneGeometry(w, d), std({ color: '#5f9a3a', roughness: 1 }), x, -0.05, z, { rx: -Math.PI / 2, cast: false });
  // a few lazy clouds
  const cloudMat = std({ color: '#ffffff', roughness: 1, emissive: '#c8d8e8', emissiveIntensity: 0.5 });
  const clouds = new Group(); scene.add(clouds);
  for (let i = 0; i < 9; i++) {
    const g = new Group(); g.position.set(-260 + i * 65, 70 + (i % 3) * 12, -120 - (i % 4) * 40); clouds.add(g);
    for (let k = 0; k < 5; k++) { const m = new Mesh(new SphereGeometry(10 + (k % 2) * 4, 10, 8), cloudMat); m.position.set(k * 9 - 18, (k % 2) * 4, (k % 3) * 3); m.scale.y = 0.55; g.add(m); }
  }

  // ---- lane guide chevrons (shown in build phase so the route reads at a glance)
  const laneMat = new MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.55, depthWrite: false });
  const lanes = new Group(); scene.add(lanes);
  const chevGeo = new ConeGeometry(0.35, 0.7, 3); chevGeo.rotateX(Math.PI / 2); chevGeo.scale(1, 0.15, 1);
  for (const key of ['L', 'R']) {
    const pts = [DOORS[key], ...PATHS[key], GOAL];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.floor(len / 2.2);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (key === 'R' && i >= 2) continue; // shared lane drawn once
        const y = heightAt(x, z, 2, 0) + 0.04;
        const m = new Mesh(chevGeo, laneMat); m.position.set(x, y, z); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); m.userData.phase = (i * 10 + k) * 0.3;
        lanes.add(m);
      }
    }
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let t = 0;
  function update(dt, S) {
    t += dt;
    clouds.position.x = (t * 1.2) % 120;
    if (level.userData.clothesline) level.userData.clothesline.rotation.y += dt * 0.25;
    lanes.visible = S.phase === 'build';
    if (lanes.visible) laneMat.opacity = 0.35 + 0.25 * Math.sin(t * 4);
    // fridge health ring: green → amber → red, pulses faster when low
    const f = S.fridge / S.fridgeMax;
    ringMat.color.setRGB(f < 0.5 ? 1 : 2 * (1 - f) + 0.26, f > 0.5 ? 1 : f * 2, 0.3 * f);
    ringMat.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * (2 + (1 - f) * 10)));
    ring.scale.setScalar(1 + 0.04 * Math.sin(t * 3));
    fridgeGlow.emissiveIntensity = 0.6 + 1.4 * f;
  }

  return { renderer, scene, camera, sun, level, update, resize, fridge };
}

// box geometry whose UVs are world-space, so tiled textures line up across neighbouring boxes
function worldBoxGeo(b) {
  const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
  const cx = (b.max[0] + b.min[0]) / 2, cy = (b.max[1] + b.min[1]) / 2, cz = (b.max[2] + b.min[2]) / 2;
  const geo = new BoxGeometry(sx, sy, sz);
  geo.translate(cx, cy, cz);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const scale = [4, 4, 4, 4, 4, 4];
  const mats = arguments[1];
  for (let f = 0; f < 6; f++) {
    const s = (mats && mats[f] && mats[f].userData.uvScale) || 2;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (f < 2) uv.setXY(i, z / s, y / s); else if (f < 4) uv.setXY(i, x / s, z / s); else uv.setXY(i, x / s, y / s);
    }
    scale[f] = s;
  }
  return geo;
}
