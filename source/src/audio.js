// Procedural Web Audio SFX — every sound is synthesised on the fly (no audio files). M toggles mute.
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, muted = false, mowerOsc = null, mowerGain = null, ambGain = null;
  try { muted = localStorage.getItem('bach.muted') === '1'; } catch {}
  const last = {};

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // ambience: distant surf (brown-ish noise through a slow-swelling lowpass)
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    ambGain = ctx.createGain(); ambGain.gain.value = 0.05;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.09; lfoG.gain.value = 0.035;
    lfo.connect(lfoG); lfoG.connect(ambGain.gain); lfo.start();
    src.connect(lp); lp.connect(ambGain); ambGain.connect(master); src.start();
    // mower drone (gain driven by the view each frame)
    mowerOsc = ctx.createOscillator(); mowerOsc.type = 'sawtooth'; mowerOsc.frequency.value = 52;
    const mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 380;
    mowerGain = ctx.createGain(); mowerGain.gain.value = 0;
    const wob = ctx.createOscillator(), wobG = ctx.createGain(); wob.frequency.value = 9; wobG.gain.value = 6;
    wob.connect(wobG); wobG.connect(mowerOsc.frequency); wob.start();
    mowerOsc.connect(mlp); mlp.connect(mowerGain); mowerGain.connect(master); mowerOsc.start();
  }

  const now = () => ctx.currentTime;
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function tone(type, f0, f1, dur, vol, t = now(), dest = master) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.005, vol, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(dur, vol, type, f0, f1, q = 1, t = now()) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain(); env(g, t, 0.004, vol, dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  const SFX = {
    fizz() { noise(0.12, 0.35, 'highpass', 3000, 7000, 0.7); tone('square', 900, 1800, 0.06, 0.06); },
    pie() { tone('sine', 140, 60, 0.18, 0.5); noise(0.1, 0.2, 'lowpass', 900, 300); },
    splat() { noise(0.25, 0.5, 'lowpass', 1400, 200, 1); tone('sine', 90, 40, 0.2, 0.4); },
    impact() { noise(0.05, 0.12, 'bandpass', 2500, 1800, 2); },
    hit() { tone('triangle', 520, 300, 0.06, 0.12); },
    crit() { tone('square', 1200, 1600, 0.07, 0.12); tone('sine', 2400, 2400, 0.12, 0.08); },
    blow() { noise(0.45, 0.45, 'bandpass', 600, 2400, 0.8); tone('sawtooth', 110, 160, 0.4, 0.05); },
    slap() { noise(0.07, 0.8, 'lowpass', 4000, 800, 0.5); tone('sine', 160, 60, 0.12, 0.6); },
    sizzleWarn() { noise(0.7, 0.15, 'highpass', 4000, 6000, 0.5); },
    sizzle() { noise(0.9, 0.45, 'highpass', 2500, 5000, 0.4); tone('sawtooth', 80, 50, 0.3, 0.2); },
    clang() { const t = now(); for (const f of [220, 347, 563, 811]) tone('sine', f, f * 0.98, 0.9, 0.12, t); noise(0.08, 0.6, 'bandpass', 1800, 900, 1.5); },
    slip() { tone('sine', 900, 300, 0.25, 0.12); noise(0.2, 0.1, 'bandpass', 3000, 1500, 3); },
    squelch() { tone('sine', 200, 90, 0.2, 0.18); noise(0.15, 0.1, 'lowpass', 600, 200); },
    squawk() { const t = now(); const o = tone('sawtooth', 1200, 700, 0.22, 0.05, t); tone('square', 1500, 900, 0.18, 0.03, t + 0.03); },
    gullDie() { tone('sawtooth', 1400, 400, 0.35, 0.08); noise(0.1, 0.2, 'highpass', 3000, 3000); },
    possumDie() { tone('triangle', 600, 150, 0.4, 0.12); },
    mowerDie() { noise(0.6, 0.6, 'lowpass', 1500, 100, 0.7); tone('sawtooth', 120, 30, 0.7, 0.25); },
    yeet() { tone('sine', 300, 1200, 0.25, 0.12); tone('sine', 600, 150, 0.6, 0.1, now() + 0.25); },
    coin() { const t = now(); tone('sine', 1320, 1320, 0.08, 0.12, t); tone('sine', 1760, 1760, 0.14, 0.12, t + 0.07); },
    combo(n = 2) { const t = now(), base = [523, 659, 784, 1047, 1319]; for (let i = 0; i < Math.min(n + 1, 5); i++) tone('square', base[i], base[i], 0.12, 0.07, t + i * 0.07); },
    fridge() { tone('sine', 70, 40, 0.35, 0.6); const t = now(); tone('sine', 2200, 2100, 0.3, 0.06, t + 0.05); tone('sine', 2900, 2800, 0.25, 0.05, t + 0.1); },
    horn() { const t = now(); tone('square', 392, 392, 0.25, 0.12, t); tone('square', 494, 494, 0.25, 0.1, t); tone('square', 392, 392, 0.45, 0.12, t + 0.32); tone('square', 494, 494, 0.45, 0.1, t + 0.32); },
    clear() { const t = now(); [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.25, 0.12, t + i * 0.1)); },
    place() { tone('square', 300, 200, 0.06, 0.12); noise(0.05, 0.3, 'lowpass', 2000, 400); },
    sell() { const t = now(); tone('sine', 1047, 1047, 0.08, 0.1, t); tone('sine', 1568, 1568, 0.2, 0.1, t + 0.08); },
    deny() { tone('square', 180, 140, 0.15, 0.1); },
    jump() { tone('sine', 300, 500, 0.1, 0.06); },
    dash() { noise(0.18, 0.25, 'bandpass', 800, 2500, 1); },
    hurt() { tone('sawtooth', 200, 90, 0.2, 0.2); },
    cone() { noise(0.06, 0.15, 'bandpass', 900, 600, 2); },
    swap() { tone('triangle', 600, 900, 0.08, 0.08); },
    lose() { const t = now(); [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, f * 0.97, 0.45, 0.15, t + i * 0.3)); },
    win() { const t = now(); [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.18, 0.09, t + i * 0.12)); },
  };

  return {
    init,
    play(name, arg, minGap = 0.03) {
      if (!ctx || muted || !SFX[name]) return;
      const t = ctx.currentTime;
      if (last[name] && t - last[name] < minGap) return;
      last[name] = t;
      try { SFX[name](arg); } catch {}
    },
    setMower(level) { if (mowerGain) mowerGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.12, level * 0.12), ctx.currentTime, 0.2); },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('bach.muted', muted ? '1' : '0'); } catch {}
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02);
      return muted;
    },
    get muted() { return muted; },
  };
}
