// Renderer, lighting, sky and the level. Level meshes are generated from the active layout's collision boxes (so what
// you see is what you collide with), then dressed generically: gable roofs, windows, roller doors, fridge, ute,
// clothesline, compost heaps, trees. buildLevel() runs again whenever the sim swaps in a newly generated map.
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, PointLight, FogExp2, Color, Mesh, Group,
  BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, PlaneGeometry, TorusGeometry, CircleGeometry, IcosahedronGeometry,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, DoubleSide, AgXToneMapping, SRGBColorSpace,
  PCFSoftShadowMap, Vector3, Shape, ExtrudeGeometry, PMREMGenerator, InstancedMesh, Object3D, BufferGeometry, Float32BufferAttribute,
} from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAMERA } from '../contracts.js';
import { TEX, pbr } from './textures.js';
import { heightAt } from '../sim/world.js';

const std = (o) => new MeshStandardMaterial(o);
// tiled PBR material: albedo + generated normal/roughness maps, world-space UVs (scale = metres per tile)
const tiled = (tex, scale, o = {}, p = {}) => {
  const { normalMap, roughnessMap } = pbr(tex, p);
  const m = std({ map: tex, normalMap, roughnessMap, roughness: 1, ...o });
  m.normalScale.set(p.ns ?? 1, p.ns ?? 1);
  m.userData.uvScale = scale; return m;
};

export const SUN_DIR = new Vector3(0.52, 0.72, 0.46).normalize();

export function createScene(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = AgXToneMapping;      // filmic highlight roll-off (applied by the post OutputPass)
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA.fov, 16 / 9, 0.1, 2000);

  // ---- physical sky (Preetham) — also baked into a PMREM environment so every PBR surface picks up sky light and
  //      reflections that match the sun
  const sky = new Sky();
  sky.scale.setScalar(1800);
  const su = sky.material.uniforms;
  su.turbidity.value = 2.2; su.rayleigh.value = 2.6; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.86;
  su.sunPosition.value.copy(SUN_DIR).multiplyScalar(1000);
  scene.add(sky);
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Scene();
  const envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky);
  Object.assign(envSky.material.uniforms, { turbidity: { value: 2.2 }, rayleigh: { value: 2.6 }, mieCoefficient: { value: 0.003 }, mieDirectionalG: { value: 0.86 } });
  envSky.material.uniforms.sunPosition.value.copy(SUN_DIR).multiplyScalar(1000);
  const groundDisc = new Mesh(new CircleGeometry(900, 16), new MeshBasicMaterial({ color: '#3d5a26' })); groundDisc.rotation.x = -Math.PI / 2; groundDisc.position.y = -2; envScene.add(groundDisc);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.85;
  scene.fog = new FogExp2(new Color('#a9c9e2'), 0.0016);

  // ---- light: a sunny Kiwi summer arvo
  const hemi = new HemisphereLight('#cfe4ff', '#4a5e30', 0.35);
  scene.add(hemi);
  const sun = new DirectionalLight('#fff0d8', 3.6);
  sun.position.copy(SUN_DIR).multiplyScalar(70).add(new Vector3(2, 0, 0));
  sun.target.position.set(2, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 10; sc.far = 160;
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // ---- materials
  const M = {
    grass: tiled(TEX.grass(), 3, {}, { strength: 1.2, rough: [0.8, 1] }), dirt: tiled(TEX.dirt(), 3, {}, { strength: 3 }),
    compost: tiled(TEX.compost(), 3, {}, { strength: 4, rough: [0.5, 0.95] }),
    planks: tiled(TEX.planks(), 2.4, {}, { strength: 3, rough: [0.45, 0.9] }), planksDark: tiled(TEX.planks(), 2.4, { color: '#a08870' }, { strength: 3, rough: [0.5, 0.9] }),
    wbCream: tiled(TEX.weatherboard('#efe4bd'), 2, {}, { strength: 5, rough: [0.45, 0.75] }), wbBlue: tiled(TEX.weatherboard('#a9cfd2'), 2, {}, { strength: 5, rough: [0.45, 0.75] }),
    corrGarage: tiled(TEX.corrugated('#7f9a8c'), 2, { metalness: 0.6 }, { strength: 3, rough: [0.3, 0.7] }),
    corrShed: tiled(TEX.corrugated('#5f7f55'), 2, { metalness: 0.5 }, { strength: 3, rough: [0.35, 0.75] }),
    corrRoof: tiled(TEX.corrugated('#b5452e'), 2, { metalness: 0.45 }, { strength: 3, rough: [0.3, 0.7] }),
    corrZinc: tiled(TEX.corrugated('#c4cac6'), 2, { metalness: 0.85 }, { strength: 3, rough: [0.2, 0.55] }),
    palings: tiled(TEX.palings(), 2.5, {}, { strength: 4 }), hedge: tiled(TEX.hedge(), 3, {}, { strength: 6, rough: [0.6, 0.95] }),
    brick: tiled(TEX.brick(), 2, {}, { strength: 5, invert: true, rough: [0.7, 0.95] }),
    white: std({ color: '#f3f3ef', roughness: 0.25 }), black: std({ color: '#1b1b1b', roughness: 0.6 }),
    dark: std({ color: '#151210', roughness: 1 }), glass: new MeshPhysicalMaterial({ color: '#cfe8f2', roughness: 0.03, metalness: 0, transmission: 0, reflectivity: 0.9, clearcoat: 1, envMapIntensity: 1.6 }),
    frame: std({ color: '#f7f7f2', roughness: 0.45 }), steel: std({ color: '#b9c2c7', metalness: 0.9, roughness: 0.28 }),
  };
  const LOOK = {
    grass: [M.dirt, M.dirt, M.grass, M.dirt, M.dirt, M.dirt], compost: M.compost,
    garage: M.corrGarage, hedge: M.hedge, fence: M.palings, brick: M.brick,
    bach: [M.wbCream, M.wbCream, M.corrRoof, M.wbCream, M.wbCream, M.wbCream],
    deck: [M.planksDark, M.planksDark, M.planks, M.planksDark, M.planksDark, M.planksDark], lowhedge: M.hedge,
    carportwall: M.wbBlue, shed: M.corrShed, carportroof: M.corrZinc, porch: [M.planksDark, M.planksDark, M.planks, M.planksDark, M.planksDark, M.planksDark],
    step: M.planks,
  };

  M.wbYellow = tiled(TEX.weatherboard('#f2d98a'), 2, {}, { strength: 5, rough: [0.45, 0.75] });
  LOOK.bachblue = [M.wbBlue, M.wbBlue, M.corrZinc, M.wbBlue, M.wbBlue, M.wbBlue];
  LOOK.bachyellow = [M.wbYellow, M.wbYellow, M.corrShed, M.wbYellow, M.wbYellow, M.wbYellow];
  const STATIC_MATS = new Set(Object.values(M));

  const addTo = (parent, geo, mat, x, y, z, o = {}) => {
    const m = new Mesh(geo, mat); m.position.set(x, y, z);
    if (o.ry) m.rotation.y = o.ry; if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz;
    if (o.s) m.scale.setScalar(o.s);
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    parent.add(m); return m;
  };

  // ================================================================== static world (sky-side; never rebuilt)
  const world = new Group(); scene.add(world);
  const leafTex = TEX.hedge(), leafPbr = pbr(leafTex, { strength: 6, rough: [0.55, 0.9] });
  const leafMat = (color) => std({ color, map: leafTex, normalMap: leafPbr.normalMap, roughnessMap: leafPbr.roughnessMap, roughness: 1 });
  const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
  const blobGeo = (detail, amp, seed) => {
    let g = new IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); // smooth, shared verts
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + amp * (hash(Math.round(x * 3) + seed, Math.round(y * 3), Math.round(z * 3)) - 0.5) + amp * 0.5 * (hash(x * 9 + seed, y * 9, z * 9) - 0.5);
      p.setXYZ(i, x * n, y * n, z * n);
      uv[i * 2] = (Math.atan2(z, x) / 6.283 + 0.5) * 4; uv[i * 2 + 1] = y * 2;
    }
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const crownGeos = [blobGeo(3, 0.35, 1), blobGeo(3, 0.35, 7), blobGeo(3, 0.4, 13)];
  const trunkTex = TEX.dirt(), trunkPbr = pbr(trunkTex, { strength: 5 });
  const trunk = std({ color: '#7a6250', map: trunkTex, normalMap: trunkPbr.normalMap, roughness: 1 });
  const crownG = leafMat('#7fbf5a'), crownG2 = leafMat('#9ccf6a'), crownR = std({ color: '#ff2a3a', roughness: 0.7, emissive: '#5a0008', emissiveIntensity: 0.4 });
  const flaxMat = std({ color: '#3f6b2a', roughness: 0.8, side: DoubleSide });
  const farGrass = (rep) => { const t = TEX.grass().clone(); t.repeat.set(rep, rep); t.needsUpdate = true; const p2 = pbr(TEX.grass(), { strength: 1.2, rough: [0.8, 1] }); const n = p2.normalMap.clone(); n.repeat.set(rep, rep); n.needsUpdate = true; return std({ map: t, normalMap: n, roughness: 1, color: '#d8e8c8' }); };
  const hillGeo = blobGeo(4, 0.12, 3), hillMat = farGrass(40);
  for (const [x, z, r, h] of [[-110, 40, 60, 28], [-50, 140, 70, 34], [60, 150, 80, 40], [130, 40, 60, 26], [-150, -20, 70, 30], [160, -40, 50, 20]]) {
    const m = addTo(world, hillGeo, hillMat, x, -3, z, { cast: false }); m.scale.set(r, h, r); m.rotation.y = x;
  }
  const water = new Water(new PlaneGeometry(1600, 700), {
    textureWidth: 512, textureHeight: 512, waterNormals: TEX.waterNormals(), sunDirection: SUN_DIR.clone(),
    sunColor: 0xfff2dd, waterColor: 0x0e4a6e, distortionScale: 2.2, fog: true,
  });
  water.rotation.x = -Math.PI / 2; water.position.set(0, -1.5, -410); water.material.uniforms.size.value = 6;
  scene.add(water);
  const sandTex = TEX.grass().clone(); sandTex.repeat.set(200, 8); sandTex.needsUpdate = true;
  addTo(world, new PlaneGeometry(1600, 60), std({ color: '#fff4d8', map: sandTex, roughness: 1 }), 0, -1.2, -65, { rx: -Math.PI / 2, cast: false });
  for (const [x0, x1, z0, z1] of [[-600, -16, -35, 600], [20, 600, -35, 600], [-16, 20, 75, 600]]) {
    const w = x1 - x0, d = z1 - z0;
    addTo(world, new PlaneGeometry(w, d), farGrass(Math.max(w, d) / 4), (x0 + x1) / 2, -0.05, (z0 + z1) / 2, { rx: -Math.PI / 2, cast: false });
  }
  const cloudMat = std({ color: '#ffffff', roughness: 1, emissive: '#dfe8f2', emissiveIntensity: 0.55, fog: false });
  const clouds = new Group(); scene.add(clouds);
  const cloudGeo = blobGeo(2, 0.3, 21);
  for (let i = 0; i < 10; i++) {
    const g = new Group(); g.position.set(-300 + i * 70, 85 + (i % 3) * 14, -160 - (i % 4) * 50); clouds.add(g);
    for (let k = 0; k < 7; k++) { const m = new Mesh(cloudGeo, cloudMat); m.position.set(k * 8 - 24, (k % 2) * 5 + (k === 3 ? 6 : 0), (k % 3) * 4); m.scale.set(11 + (k % 3) * 3, 7 + (k % 2) * 3, 10); g.add(m); }
  }
  // swaying grass blade (instanced per level)
  const grassUniforms = { uTime: { value: 0 } };
  const blade = new BufferGeometry();
  blade.setAttribute('position', new Float32BufferAttribute([-0.03, 0, 0, 0.03, 0, 0, -0.022, 0.33, 0, 0.022, 0.33, 0, -0.012, 0.66, 0, 0.012, 0.66, 0, 0, 1, 0], 3));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
  blade.computeVertexNormals();
  const bladeMat = std({ color: '#ffffff', roughness: 0.85, side: DoubleSide });
  bladeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.21) * 0.6 + sin(uTime * 3.1 + wp.x * 1.3) * 0.25;
      transformed.x += sway * 0.12 * position.y * position.y;
      transformed.z += sway * 0.06 * position.y * position.y;`);
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = vec3(0.0, 1.0, 0.0);');
  };
  const laneMat = new MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.55, depthWrite: false });
  const chevGeo = new ConeGeometry(0.35, 0.7, 3); chevGeo.rotateX(Math.PI / 2); chevGeo.scale(1, 0.15, 1);
  const ringMat = new MeshBasicMaterial({ color: '#43ff8a', transparent: true, opacity: 0.55, depthWrite: false });
  const fridgeGlow = std({ color: '#ffffff', emissive: '#7fe3ff', emissiveIntensity: 1.6 });
  const keep = new Set([...STATIC_MATS, crownG, crownG2, crownR, trunk, flaxMat, bladeMat, laneMat, ringMat, fridgeGlow]);

  // ================================================================== level (rebuilt for every generated map)
  let level = null, lanes = null, ring = null, clothesline = null, current = null;
  const DOOR_SIGNS = [[['GULLS', 'GO HOME'], '#ffffff', '#c22'], [['MIND', 'THE MOWER'], '#ffd21f', '#111'], [['NO', 'POSSUMS'], '#ffffff', '#1d4ea8'], [['BEWARE', 'OF THE', 'GULL'], '#ffd21f', '#111'], [['TRADES', 'ENTRANCE'], '#ffffff', '#333'], [['SHUT THE', 'GATE!'], '#ff5a3c', '#fff']];

  function disposeLevel(g) {
    g.traverse((o) => {
      if (o.geometry && o.geometry !== chevGeo && o.geometry !== blade && !crownGeos.includes(o.geometry)) o.geometry.dispose();
      if (o.material && !keep.has(o.material)) o.material.dispose?.();
    });
    scene.remove(g);
  }

  function buildLevel(L) {
    if (level) disposeLevel(level);
    current = L;
    level = new Group(); scene.add(level);
    const add = (geo, mat, x, y, z, o = {}) => addTo(o.parent || level, geo, mat, x, y, z, o);
    const sign = (lines, w, h, x, y, z, ry, bg = '#ffd21f', fg = '#111') => add(new PlaneGeometry(w, h), std({ map: TEX.sign(lines, bg, fg), roughness: 0.7 }), x, y, z, { ry, cast: false });
    const A = L.arena;
    let sr = L.seed * 9301 + 49297; const rand = () => { sr = (sr * 9301 + 49297) % 233280; return sr / 233280; };

    // ---- collision boxes → meshes
    for (const b of L.boxes) {
      const mat = LOOK[b.look];
      if (!mat) continue;
      const mesh = new Mesh(worldBoxGeo(b, Array.isArray(mat) ? mat : [mat, mat, mat, mat, mat, mat]), mat);
      mesh.castShadow = b.kind !== 'ground'; mesh.receiveShadow = true;
      level.add(mesh);
    }

    // ---- houses: gable roof over the long axis, windows, chimney + TV aerial, a name sign
    L.houses.forEach((b, hi) => {
      const sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2], cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, top = b.max[1];
      const alongZ = sz >= sx, span = alongZ ? sx : sz, len = (alongZ ? sz : sx) + 0.8, half = span / 2 + 0.4, rise = Math.min(2.2, span * 0.25);
      const slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
      const roofMat = LOOK[b.look][2];
      const wallMat = LOOK[b.look][0];
      for (const s of [-1, 1]) {
        const m = add(new BoxGeometry(alongZ ? slope : len, 0.14, alongZ ? len : slope), roofMat, cx + (alongZ ? s * half / 2 : 0), top + rise / 2, cz + (alongZ ? 0 : s * half / 2));
        if (alongZ) m.rotation.z = -s * ang; else m.rotation.x = s * ang;
      }
      const tri = new Shape(); tri.moveTo(-span / 2, 0); tri.lineTo(span / 2, 0); tri.lineTo(0, rise - 0.1); tri.closePath();
      const gable = new ExtrudeGeometry(tri, { depth: 0.1, bevelEnabled: false });
      for (const e of [-1, 1]) {
        const g = add(gable, wallMat, alongZ ? cx : cx + e * (sx / 2) - (e > 0 ? 0.1 : 0), top, alongZ ? cz + e * (sz / 2) - (e > 0 ? 0.1 : 0) : cz);
        if (!alongZ) g.rotation.y = Math.PI / 2;
      }
      // windows on the long faces that face into the arena
      for (const side of [-1, 1]) {
        const face = alongZ ? (side < 0 ? b.min[0] : b.max[0]) : (side < 0 ? b.min[2] : b.max[2]);
        if (alongZ && (Math.abs(face - A.x0) < 0.2 || Math.abs(face - A.x1) < 0.2)) continue;
        const n = Math.max(1, Math.floor((len - 2) / 4.5));
        for (let i = 0; i < n; i++) {
          const u = (alongZ ? b.min[2] : b.min[0]) + (i + 0.5) * ((alongZ ? sz : sx) / n);
          const wx = alongZ ? face + side * 0.03 : u, wz = alongZ ? u : face + side * 0.03;
          add(new BoxGeometry(alongZ ? 0.08 : 1.9, 1.3, alongZ ? 1.9 : 0.08), M.frame, wx, top - 1.2, wz, { cast: false });
          add(new BoxGeometry(alongZ ? 0.06 : 1.7, 1.1, alongZ ? 1.7 : 0.06), M.glass, wx + (alongZ ? side * 0.02 : 0), top - 1.2, wz + (alongZ ? 0 : side * 0.02), { cast: false });
        }
        if (hi === 0 && side === (cx < (A.x0 + A.x1) / 2 ? 1 : -1)) {
          const sxp = alongZ ? face + side * 0.1 : cx, szp = alongZ ? cz + 0.9 : face + side * 0.1;
          sign(['THE BACH', 'EST. ' + (1962 + (L.n * 7) % 30)], 2.6, 1.0, sxp, top - 0.45, szp, alongZ ? side * Math.PI / 2 : (side > 0 ? 0 : Math.PI), '#f4ecd0', '#2b4a6b');
        }
      }
      if (hi === 0) {
        add(new BoxGeometry(0.7, 1.6, 0.7), M.brick, cx + (alongZ ? -span * 0.2 : len * 0.2), top + rise * 0.6, cz + (alongZ ? -len * 0.25 : 0));
        add(new CylinderGeometry(0.03, 0.03, 2, 6), M.steel, cx, top + rise + 0.9, cz + (alongZ ? len * 0.2 : 0));
        for (let i = 0; i < 5; i++) add(new BoxGeometry(1.4 - i * 0.2, 0.03, 0.03), M.steel, cx, top + rise + 1.2 + i * 0.18, cz + (alongZ ? len * 0.2 : 0), { cast: false });
      }
    });

    // ---- garage roller doors (spawn points) with cheeky signs
    const garage = L.boxes.find((b) => b.look === 'garage');
    const gz = garage ? garage.max[2] : A.z0;
    L.doors.forEach((d, i) => {
      add(new BoxGeometry(4.6, 3.1, 0.3), M.dark, d.x, 1.55, gz + 0.1, { cast: false });
      add(new BoxGeometry(4.6, 1.1, 0.12), tiled(TEX.corrugated('#d8d2bf'), 1, { metalness: 0.3 }, { strength: 2 }), d.x, 2.55, gz + 0.18);
      add(new BoxGeometry(5, 0.25, 0.4), M.frame, d.x, 3.2, gz + 0.2);
      for (const sx of [-2.4, 2.4]) add(new BoxGeometry(0.2, 3.2, 0.4), M.frame, d.x + sx, 1.6, gz + 0.2);
      const [lines, bg, fg] = DOOR_SIGNS[(i + L.n) % DOOR_SIGNS.length];
      sign(lines, 2.2, 1.1, d.x, 3.6, gz + 0.22, 0, bg, fg);
    });

    // ---- porch railing (see-through) and carport posts
    for (const b of L.boxes) if (b.look === 'rail') {
      const x = (b.min[0] + b.max[0]) / 2, len = b.max[2] - b.min[2], cz = (b.min[2] + b.max[2]) / 2, top = b.max[1];
      add(new BoxGeometry(0.14, 0.08, len), M.planks, x, top - 0.04, cz);
      add(new BoxGeometry(0.06, 0.05, len), M.planksDark, x, b.min[1] + 0.45, cz, { cast: false });
      for (let z = b.min[2] + 0.1; z <= b.max[2]; z += 1.5) add(new BoxGeometry(0.1, top - b.min[1], 0.1), M.planksDark, x, (top + b.min[1]) / 2, z);
    }
    for (const b of L.boxes) if (b.kind === 'roof') {
      for (const [x, z] of [[b.min[0] + 0.15, b.min[2] + 0.1], [b.max[0] - 0.15, b.min[2] + 0.1], [b.min[0] + 0.15, b.max[2] - 0.1], [b.max[0] - 0.15, b.max[2] - 0.1]]) add(new BoxGeometry(0.25, b.min[1], 0.25), M.planksDark, x, b.min[1] / 2, z);
      add(new BoxGeometry(b.max[0] - b.min[0] + 0.2, 0.3, 0.2), M.frame, (b.min[0] + b.max[0]) / 2, b.min[1] + 0.15, b.min[2] - 0.05);
    }
    for (const s of L.signs) sign(s.lines, 1.5, 1.5, s.x, s.y, s.z, s.ry || 0, s.bg || '#ffd21f', s.fg || '#111');

    // ---- objective: Bach Beer Fridge & Pie Warmer
    const F = L.fridge;
    const fridge = new Group(); fridge.position.set(F.x, 0, F.z); level.add(fridge);
    add(new BoxGeometry(2.3, 2.2, 1.3), M.white, 0, 1.1, 0, { parent: fridge });
    add(new BoxGeometry(2.2, 0.03, 0.02), M.black, 0, 1.45, -0.66, { parent: fridge, cast: false });
    for (const y of [0.8, 1.8]) add(new BoxGeometry(0.08, 0.5, 0.08), M.steel, 0.95, y, -0.7, { parent: fridge });
    add(new PlaneGeometry(1.5, 0.75), std({ map: TEX.sign(['BEERS', 'HANDS OFF'], '#ffffff', '#1d4ea8'), roughness: 0.5 }), -0.1, 1.85, -0.67, { parent: fridge, ry: Math.PI, cast: false });
    add(new BoxGeometry(2.0, 0.08, 0.05), fridgeGlow, 0, 0.18, -0.66, { parent: fridge, cast: false });
    ring = add(new TorusGeometry(2.4, 0.07, 6, 48), ringMat, 0, 0.06, -0.3, { parent: fridge, rx: Math.PI / 2, cast: false });
    const warmer = new Group(); warmer.position.set(F.x + 2.1, 0, F.z); level.add(warmer);
    add(new BoxGeometry(1.2, 0.5, 1.0), M.steel, 0, 0.25, 0, { parent: warmer });
    add(new BoxGeometry(1.15, 0.55, 0.95), std({ color: '#ffb36b', emissive: '#ff7a1a', emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.1 }), 0, 0.78, 0, { parent: warmer, cast: false });
    const pieMat = std({ color: '#c98a3c', roughness: 0.7 });
    for (let i = 0; i < 6; i++) add(new CylinderGeometry(0.15, 0.13, 0.08, 12), pieMat, -0.35 + (i % 3) * 0.35, 0.6 + Math.floor(i / 3) * 0.24, 0, { parent: warmer, cast: false });
    const warmLight = new PointLight('#ff9a4a', 6, 7, 2); warmLight.position.set(F.x + 1.4, 1.4, F.z - 1.1); level.add(warmLight);
    const crateMat = std({ color: '#c79a52', roughness: 0.9 }), bottleMat = std({ color: '#5a2d0c', roughness: 0.25, metalness: 0.1 });
    for (const [dx, dz, n] of [[-2.4, 0.5, 2], [-2.6, -1, 1]]) for (let k = 0; k < n; k++) {
      add(new BoxGeometry(0.9, 0.45, 0.6), crateMat, F.x + dx, 0.23 + k * 0.46, F.z + dz);
      for (let i = 0; i < 6; i++) add(new CylinderGeometry(0.05, 0.05, 0.22, 6), bottleMat, F.x + dx - 0.3 + (i % 3) * 0.3, 0.55 + k * 0.46, F.z + dz - 0.12 + Math.floor(i / 3) * 0.24, { cast: false });
    }
    const X = L.extras || {};
    if (X.couch) { const couch = std({ color: '#7c4b6e', roughness: 1 }); add(new BoxGeometry(2.4, 0.5, 0.9), couch, X.couch.x, 0.35, X.couch.z, { ry: 0.3 }); add(new BoxGeometry(2.4, 0.8, 0.25), couch, X.couch.x + 0.12, 0.75, X.couch.z + 0.4, { ry: 0.3 }); }
    if (X.ute) {
      const ute = new Group(); ute.position.set(X.ute.x, 0, X.ute.z); ute.rotation.y = X.ute.ry || 0; level.add(ute);
      const paint = std({ color: ['#f1f1ee', '#c8302a', '#2a5ab8', '#3a3a3a'][L.n % 4], roughness: 0.3, metalness: 0.5, clearcoat: 1 }), tyre = std({ color: '#161616', roughness: 0.9 });
      add(new BoxGeometry(5.3, 0.75, 3.6), paint, 0, 0.85, 0, { parent: ute });
      add(new BoxGeometry(1.9, 0.8, 3.5), paint, -1.1, 1.6, 0, { parent: ute });
      add(new BoxGeometry(1.6, 0.6, 3.52), M.glass, -1.15, 1.62, 0, { parent: ute, cast: false });
      for (const [x, z] of [[-1.7, -1.75], [-1.7, 1.75], [1.7, -1.75], [1.7, 1.75]]) add(new CylinderGeometry(0.45, 0.45, 0.35, 16), tyre, x, 0.45, z, { parent: ute, rx: Math.PI / 2 });
      add(new BoxGeometry(2.6, 0.08, 0.6), std({ color: '#ff5a3c', roughness: 0.4 }), 1.3, 1.3, 0.2, { parent: ute, ry: 0.15 });
    }
    if (X.chillybin) {
      const bin = new Group(); bin.position.set(X.chillybin.x, 0, X.chillybin.z); level.add(bin);
      add(new BoxGeometry(2, 0.75, 1.5), std({ color: '#2a7fd4', roughness: 0.5 }), 0, 0.38, 0, { parent: bin });
      add(new BoxGeometry(2.05, 0.16, 1.55), M.white, 0, 0.82, 0, { parent: bin });
    }
    clothesline = null;
    if (X.clothesline) {
      const cl = new Group(); cl.position.set(X.clothesline.x, 0, X.clothesline.z); level.add(cl);
      add(new CylinderGeometry(0.05, 0.06, 2.4, 8), M.steel, 0, 1.2, 0, { parent: cl });
      for (let i = 0; i < 4; i++) add(new BoxGeometry(3.2, 0.04, 0.04), M.steel, 0, 2.35, 0, { parent: cl, ry: i * Math.PI / 4, cast: false });
      const cloth = ['#e3423a', '#2e6fd8', '#ffd23a', '#ffffff', '#1d1d1d'];
      for (let i = 0; i < 5; i++) { const a = i * 1.3; add(new PlaneGeometry(0.6, 0.8), std({ color: cloth[i], roughness: 1, side: DoubleSide }), Math.cos(a) * 1.1, 1.9, Math.sin(a) * 1.1, { parent: cl, ry: -a }); }
      clothesline = cl;
    }
    if (X.bee) {
      const bee = new Group(); bee.position.set(X.bee.x, X.bee.y, X.bee.z); bee.rotation.y = -0.8; level.add(bee);
      add(new SphereGeometry(0.28, 16, 12), std({ color: '#ffcc1a', roughness: 0.4 }), 0, 0.35, 0, { parent: bee });
      for (const z of [-0.08, 0.08]) add(new TorusGeometry(0.27, 0.035, 6, 16), std({ color: '#d83a2a' }), 0, 0.35, z, { parent: bee, cast: false });
      add(new SphereGeometry(0.18, 14, 10), std({ color: '#d83a2a' }), 0, 0.42, -0.36, { parent: bee });
      for (const s of [-1, 1]) add(new BoxGeometry(0.45, 0.04, 0.18), std({ color: '#3a7be0' }), s * 0.3, 0.62, 0, { parent: bee, rz: s * 0.4 });
      for (const s of [-1, 1]) add(new CylinderGeometry(0.1, 0.1, 0.05, 12), std({ color: '#3a7be0' }), s * 0.2, 0.1, 0, { parent: bee, rz: Math.PI / 2 });
    }
    if (X.gnome) {
      const gn = new Group(); gn.position.set(X.gnome.x, 0, X.gnome.z); level.add(gn);
      add(new CylinderGeometry(0.16, 0.2, 0.4, 10), std({ color: '#2f6fe0' }), 0, 0.2, 0, { parent: gn });
      add(new SphereGeometry(0.13, 12, 10), std({ color: '#f2c6a0' }), 0, 0.5, 0, { parent: gn });
      add(new ConeGeometry(0.14, 0.32, 10), std({ color: '#d8302a' }), 0, 0.72, 0, { parent: gn });
    }

    // ---- compost heaps + banana peels in every gully
    const heap = std({ map: TEX.compost(), roughness: 1 }), peel = std({ color: '#f2cf3a', roughness: 0.6 });
    for (const p of L.pits) {
      const w = p.x1 - p.x0, d = p.z1 - p.z0, n = Math.max(1, Math.round(w * d / 40));
      for (let i = 0; i < n; i++) { const r = 1.4 + rand() * 1.2; const m = add(new SphereGeometry(1, 16, 10), heap, p.x0 + r * 0.6 + rand() * Math.max(0.1, w - r * 1.2), -7, p.z0 + r * 0.6 + rand() * Math.max(0.1, d - r * 1.2), { cast: false }); m.scale.set(r, r * 0.45, r); }
      for (let i = 0; i < 8; i++) add(new BoxGeometry(0.35, 0.06, 0.12), peel, p.x0 + 0.4 + rand() * (w - 0.8), -6.85 + rand() * 0.3, p.z0 + 0.4 + rand() * (d - 0.8), { ry: i, cast: false });
    }

    // ---- harakeke and trees around the section
    for (const [x, z] of L.flax) {
      const g = new Group(); g.position.set(x, 0, z); g.scale.setScalar(1.1); level.add(g);
      for (let i = 0; i < 11; i++) { const a = i * 2.4, m = add(new PlaneGeometry(0.14, 1.6), flaxMat, Math.cos(a) * 0.1, 0.75, Math.sin(a) * 0.1, { parent: g, ry: a, cast: false }); m.rotation.order = 'YXZ'; m.rotation.x = 0.15 + (i % 3) * 0.12; }
    }
    const pohutukawa = (x, z, s) => {
      const g = new Group(); g.position.set(x, 0, z); g.scale.setScalar(s); level.add(g);
      for (let k = 0; k < 3; k++) { const m = add(new CylinderGeometry(0.18, 0.4, 3.6, 8), trunk, Math.cos(k * 2.1) * 0.5, 1.6, Math.sin(k * 2.1) * 0.5, { parent: g }); m.rotation.set(Math.sin(k * 2.1) * 0.3, 0, -Math.cos(k * 2.1) * 0.3); }
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39, r = i < 2 ? 0.3 : 1.2 + (i % 4) * 0.45, sz = 1.25 - (i % 3) * 0.15;
        const m = add(crownGeos[i % 3], i % 3 === 0 ? crownG2 : crownG, Math.cos(a) * r, 3.7 + (i % 5) * 0.32 + (i < 2 ? 0.7 : 0), Math.sin(a) * r, { parent: g });
        m.scale.set(sz, sz * 0.75, sz);
        if (i >= 2) { const f = add(crownGeos[(i + 1) % 3], crownR, Math.cos(a) * (r + 0.7), 4.1 + (i % 5) * 0.32, Math.sin(a) * (r + 0.7), { parent: g, cast: false }); f.scale.setScalar(0.45 + (i % 2) * 0.15); }
      }
    };
    const cabbage = (x, z, s) => {
      const g = new Group(); g.position.set(x, 0, z); g.scale.setScalar(s); level.add(g);
      add(new CylinderGeometry(0.12, 0.22, 4, 8), trunk, 0, 2, 0, { parent: g });
      for (let i = 0; i < 26; i++) { const m = add(new ConeGeometry(0.05, 1.3, 4), crownG, 0, 4.1, 0, { parent: g }); m.rotation.set(Math.cos(i * 2.4) * (0.6 + (i % 3) * 0.4), i * 2.4, Math.sin(i * 2.4) * (0.6 + (i % 3) * 0.4)); }
    };
    let k = 0;
    for (let z = A.z0 + 4; z < A.z1 + 6; z += 13 + rand() * 5) for (const x of [A.x0 - 7 - rand() * 3, A.x1 + 7 + rand() * 3]) (k++ % 3 === 2 ? cabbage : pohutukawa)(x, z, 1.2 + rand() * 0.5);
    for (let x = A.x0; x < A.x1; x += 12 + rand() * 4) pohutukawa(x, A.z1 + 8 + rand() * 3, 1.3 + rand() * 0.4);

    // ---- lane guide chevrons (build phase)
    lanes = new Group(); level.add(lanes);
    const seen = new Set();
    L.paths.forEach((path, di) => {
      const pts = [L.doors[di], ...path];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], key = `${a.x},${a.z}>${b.x},${b.z}`;
        if (seen.has(key)) continue; seen.add(key);
        const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.floor(len / 2.2);
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          const m = new Mesh(chevGeo, laneMat); m.position.set(x, heightAt(x, z, 2, 0) + 0.04, z); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
          lanes.add(m);
        }
      }
    });

    // ---- grass blades on the lawns (trampled short along the pest route)
    const segs = [];
    L.paths.forEach((path, di) => { const pts = [L.doors[di], ...path]; for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]); });
    const nearLane = (x, z) => {
      for (const [a, b] of segs) {
        const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2));
        if (Math.hypot(a.x + abx * t - x, a.z + abz * t - z) < 3) return true;
      }
      return false;
    };
    const N = 30000, mesh = new InstancedMesh(blade, bladeMat, N);
    const o = new Object3D(), col = new Color();
    const lawn = L.boxes.filter((b) => b.look === 'grass' && b.max[1] === 0);
    const solids = L.boxes.filter((b) => b.kind !== 'ground' && b.min[1] < 0.5);
    let n = 0, guard = 0;
    while (n < N && guard++ < N * 4) {
      const b = lawn[Math.floor(Math.random() * lawn.length)];
      const x = b.min[0] + Math.random() * (b.max[0] - b.min[0]), z = b.min[2] + Math.random() * (b.max[2] - b.min[2]);
      if (heightAt(x, z, 0.5, 0) !== 0) continue;
      let block = false;
      for (const bb of solids) if (x > bb.min[0] - 0.05 && x < bb.max[0] + 0.05 && z > bb.min[2] - 0.05 && z < bb.max[2] + 0.05) { block = true; break; }
      if (block) continue;
      const lane = nearLane(x, z);
      if (lane && Math.random() < 0.85) continue;
      const hgt = (lane ? 0.08 : 0.16) + Math.random() * (lane ? 0.06 : 0.22);
      o.position.set(x, 0, z); o.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4);
      o.scale.set(1 + Math.random(), hgt, 1); o.updateMatrix();
      mesh.setMatrixAt(n, o.matrix);
      col.setHSL(0.22 + Math.random() * 0.06, 0.45 + Math.random() * 0.2, 0.22 + Math.random() * 0.14);
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n; mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = false;
    level.add(mesh);

    // ---- paddock between the back fence and the static farmland (long maps reach past it)
    add(new PlaneGeometry(A.x1 - A.x0 + 40, 90), farGrass(30), (A.x0 + A.x1) / 2, -0.06, A.z1 + 47, { rx: -Math.PI / 2, cast: false });

    // ---- fit the sun's shadow frustum to this map
    const cx = (A.x0 + A.x1) / 2, cz = (A.z0 + A.z1) / 2, ext = Math.max(A.x1 - A.x0, A.z1 - A.z0) / 2 + 8;
    sun.target.position.set(cx, 0, cz);
    sun.position.copy(SUN_DIR).multiplyScalar(90).add(sun.target.position);
    Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 10, far: 220 });
    sc.updateProjectionMatrix();
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let t = 0, goldK = 0;
  const FOG0 = scene.fog.color.clone(), FOG_GOLD = new Color('#ffcf6a'), HEMI0 = hemi.color.clone(), HEMI_GOLD = new Color('#ffd27a'), SUN0 = sun.color.clone(), SUN_GOLD = new Color('#ffb84a');
  function update(dt, S) {
    t += dt;
    clouds.position.x = (t * 1.2) % 140;
    grassUniforms.uTime.value = t;
    water.material.uniforms.time.value = t * 0.35;
    if (S.layout !== current) buildLevel(S.layout);
    // Rain of Chips: the whole sky goes golden while it pours
    goldK += ((S.rain && S.rain.active ? 1 : 0) - goldK) * Math.min(1, dt * 3);
    scene.fog.color.copy(FOG0).lerp(FOG_GOLD, goldK);
    hemi.color.copy(HEMI0).lerp(HEMI_GOLD, goldK); hemi.intensity = 0.35 + goldK * 0.6;
    sun.color.copy(SUN0).lerp(SUN_GOLD, goldK);
    scene.fog.density = 0.0016 + goldK * 0.004;
    if (clothesline) clothesline.rotation.y += dt * 0.25;
    lanes.visible = S.phase === 'build';
    if (lanes.visible) laneMat.opacity = 0.35 + 0.25 * Math.sin(t * 4);
    // fridge health ring: green → amber → red, pulses faster when low
    const f = S.fridge / S.fridgeMax;
    ringMat.color.setRGB(f < 0.5 ? 1 : 2 * (1 - f) + 0.26, f > 0.5 ? 1 : f * 2, 0.3 * f);
    ringMat.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * (2 + (1 - f) * 10)));
    ring.scale.setScalar(1 + 0.04 * Math.sin(t * 3));
    fridgeGlow.emissiveIntensity = 0.6 + 1.4 * f;
  }

  return { renderer, scene, camera, sun, update, resize, water, buildLevel };
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
