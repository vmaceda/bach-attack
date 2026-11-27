// Visual effects: one pooled point-sprite particle system + pooled projectile / pickup meshes. Purely cosmetic:
// fed by sim events and sim arrays, never writes back to the sim.
import {
  BufferGeometry, BufferAttribute, Points, ShaderMaterial, AdditiveBlending, NormalBlending, Mesh, Group,
  SphereGeometry, CylinderGeometry, ConeGeometry, MeshStandardMaterial, MeshBasicMaterial, Color,
} from 'three';

const N = 2400;

export function createFX(scene) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), grav = new Float32Array(N), drag = new Float32Array(N), grow = new Float32Array(N);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setAttribute('size', new BufferAttribute(size, 1));
  geo.setAttribute('alpha', new BufferAttribute(alpha, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: NormalBlending,
    uniforms: { scale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = dot(p,p); if (d > 0.25) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.25, 0.1, d)); }`,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 20;
  scene.add(points);
  let head = 0;
  for (let i = 0; i < N; i++) { life[i] = 0; alpha[i] = 0; pos[i * 3 + 1] = -999; }

  const c = new Color();
  function emit(x, y, z, n, o = {}) {
    const color = o.color || '#ffffff', spd = o.speed ?? 3, lf = o.life ?? 0.8, sz = o.size ?? 0.25;
    const colors = Array.isArray(color) ? color : [color];
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % N;
      const sp = o.spread ?? 0.1;
      pos[i * 3] = x + (Math.random() - 0.5) * sp; pos[i * 3 + 1] = y + (Math.random() - 0.5) * sp; pos[i * 3 + 2] = z + (Math.random() - 0.5) * sp;
      let vx = (Math.random() - 0.5) * 2, vy = (Math.random() - 0.5) * 2, vz = (Math.random() - 0.5) * 2;
      const l = Math.hypot(vx, vy, vz) || 1, s = spd * (0.4 + Math.random() * 0.6);
      vx = (vx / l) * s; vy = (vy / l) * s; vz = (vz / l) * s;
      if (o.dir) { vx = vx * (o.cone ?? 0.3) + o.dir[0] * s; vy = vy * (o.cone ?? 0.3) + o.dir[1] * s; vz = vz * (o.cone ?? 0.3) + o.dir[2] * s; }
      vel[i * 3] = vx; vel[i * 3 + 1] = vy + (o.up ?? 0); vel[i * 3 + 2] = vz;
      c.set(colors[(Math.random() * colors.length) | 0]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      max[i] = life[i] = lf * (0.6 + Math.random() * 0.4);
      size[i] = sz * (0.6 + Math.random() * 0.8); grav[i] = o.gravity ?? 9; drag[i] = o.drag ?? 1.5; grow[i] = o.grow ?? 0;
      alpha[i] = o.alpha ?? 1;
    }
  }

  // ---- projectile / pickup pools
  const pools = {};
  const mk = (name, n, build) => { const g = new Group(); scene.add(g); const items = []; for (let i = 0; i < n; i++) { const m = build(); m.visible = false; g.add(m); items.push(m); } pools[name] = items; };
  const fizzMat = new MeshBasicMaterial({ color: '#fff27a' });
  mk('fizz', 60, () => { const m = new Mesh(new SphereGeometry(0.09, 8, 6), fizzMat); m.scale.z = 3; return m; });
  const pieMat = new MeshStandardMaterial({ color: '#d2903d', roughness: 0.6 });
  mk('pie', 16, () => new Mesh(new CylinderGeometry(0.2, 0.17, 0.1, 14), pieMat));
  const coneMat = new MeshStandardMaterial({ color: '#7a4a22', roughness: 1 });
  mk('cone', 30, () => new Mesh(new ConeGeometry(0.11, 0.26, 8), coneMat));
  const coinMat = new MeshStandardMaterial({ color: '#ffcc33', metalness: 0.9, roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.6 });
  mk('coin', 60, () => { const m = new Mesh(new CylinderGeometry(0.2, 0.2, 0.05, 16), coinMat); m.rotation.x = Math.PI / 2; return m; });
  for (const k in pools) for (const m of pools[k]) m.castShadow = false;

  function syncPool(name, list, fn) {
    const items = pools[name];
    let j = 0;
    for (let i = 0; i < list.length && j < items.length; i++) { const it = list[i]; if (!fn(items[j], it)) continue; items[j].visible = true; j++; }
    for (; j < items.length; j++) items[j].visible = false;
  }

  let t = 0;
  function update(dt, S, camera) {
    t += dt;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { alpha[i] = 0; pos[i * 3 + 1] = -999; continue; }
      const dr = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr - grav[i] * dt; vel[i * 3 + 2] *= dr;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const f = life[i] / max[i];
      alpha[i] = Math.min(1, f * 2.5);
      size[i] += grow[i] * dt;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.alpha.needsUpdate = true; geo.attributes.size.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    mat.uniforms.scale.value = window.innerHeight * 0.9;

    // projectiles (trail particles on the fizz bolts)
    syncPool('fizz', S.shots, (m, s) => { if (s.w !== 'fizz') return false; m.position.set(s.x, s.y, s.z); m.lookAt(s.x + s.vx, s.y + s.vy, s.z + s.vz); if (Math.random() < 0.5) emit(s.x, s.y, s.z, 1, { color: ['#fff7b0', '#ffe066'], speed: 0.4, life: 0.25, size: 0.12, gravity: -1 }); return true; });
    syncPool('pie', S.shots, (m, s) => { if (s.w !== 'pie') return false; m.position.set(s.x, s.y, s.z); m.rotation.x = t * 12; return true; });
    syncPool('cone', S.cones, (m, c) => { m.position.set(c.x, c.y, c.z); m.rotation.set(t * 9, t * 5, 0); return true; });
    syncPool('coin', S.pickups, (m, p) => { m.position.set(p.x, p.y + Math.sin(t * 5 + p.id) * 0.08, p.z); m.rotation.z = t * 6 + p.id; return true; });
  }

  return { emit, update };
}
