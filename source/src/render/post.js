// Post chain: HDR render (4× MSAA) → GTAO ambient occlusion → soft bloom → colour grade (warm summer split-tone,
// contrast, saturation, vignette, fine grain) → OutputPass (AgX tonemap + sRGB).
// Quality: ?q=low|med|high (default high). An auto-governor drops AO, then resolution, if frames run slow.
import { WebGLRenderTarget, HalfFloatType, Vector2 } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.32 }, uSat: { value: 1.14 }, uContrast: { value: 1.1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVignette, uSat, uContrast; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);                                   // saturation (scene-linear)
      col = mix(col, col * vec3(1.04, 1.0, 0.95), smoothstep(0.2, 1.5, l)); // warm highlights
      col = mix(col, col * vec3(0.95, 0.99, 1.06), 1.0 - smoothstep(0.0, 0.25, l)); // cool shadows
      col = pow(max(col, 0.0) / 0.5, vec3(uContrast)) * 0.5;           // contrast around mid-grey
      vec2 d = vUv - 0.5; col *= 1.0 - uVignette * dot(d, d) * 2.2;     // lens vignette
      col += (h(vUv * 1000.0 + uTime) - 0.5) * 0.012 * (0.4 + l);       // fine film grain
      gl_FragColor = vec4(col, c.a);
    }`,
};

export function createPost(renderer, scene, camera, params) {
  const tier = params.get('q') || 'high';
  if (tier === 'low') return { render: () => renderer.render(scene, camera), resize() {}, update() {}, tier, ao: false };
  const size = renderer.getDrawingBufferSize(new Vector2());
  const rt = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (tier === 'high') {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.22, 0.5, 0.92);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // auto-governor: if the average frame is slow for ~2 s, drop AO; still slow → render at 1× pixel ratio
  let acc = 0, frames = 0, stage = 0;
  function update(dt) {
    grade.uniforms.uTime.value = (grade.uniforms.uTime.value + dt * 60) % 1000;
    acc += dt; frames++;
    if (acc > 2) {
      const avg = acc / frames; acc = 0; frames = 0;
      if (avg > 1 / 40 && stage === 0 && gtao) { gtao.enabled = false; stage = 1; }
      else if (avg > 1 / 40 && stage <= 1 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); stage = 2; }
    }
  }
  function resize() {
    const s = renderer.getDrawingBufferSize(new Vector2());
    composer.setSize(s.x / renderer.getPixelRatio(), s.y / renderer.getPixelRatio());
    composer.setPixelRatio(renderer.getPixelRatio());
  }
  window.addEventListener('resize', () => setTimeout(resize, 0));
  return { render: () => composer.render(), resize, update, tier, get ao() { return !!(gtao && gtao.enabled); } };
}
