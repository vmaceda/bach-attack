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
    initMusic();
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
    twang() { tone('triangle', 220, 520, 0.18, 0.18); noise(0.12, 0.25, 'bandpass', 1200, 3000, 2); },
    thud() { tone('sine', 120, 50, 0.12, 0.25); },
    zap() { noise(0.25, 0.5, 'highpass', 2500, 6000, 0.6); const t = now(); for (let i = 0; i < 5; i++) tone('square', 1800 + Math.random() * 1500, 300, 0.04, 0.08, t + i * 0.035); tone('sawtooth', 60, 60, 0.25, 0.15, t); },
    boing() { const t = now(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.12); o.frequency.exponentialRampToValueAtTime(240, t + 0.5);
      const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 22; vg.gain.value = 60; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + 0.6);
      env(g, t, 0.005, 0.35, 0.55); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.62); },
    stomp() { tone('sine', 90, 35, 0.3, 0.7); noise(0.15, 0.5, 'lowpass', 1200, 200, 0.7); tone('square', 70, 50, 0.1, 0.1); },
    lose() { const t = now(); [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, f * 0.97, 0.45, 0.15, t + i * 0.3)); },
    win() { const t = now(); [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.18, 0.09, t + i * 0.12)); },
  };

  // ------------------------------------------------------------------ background track
  // A cheesy BBQ ditty: ukulele strums + bass + boom-chick, with a KAZOO on the melody (sawtooth through a buzzy
  // waveshaper and a nasal band-pass, scooping up into every note). Waves speed it up and add hats. Every 9-22 s a
  // farmyard gag plays: a sheep, a tūī, cackling gulls or a distant cow. N toggles the music; M mutes everything.
  let musicOn = true; try { musicOn = localStorage.getItem('bach.music') !== '0'; } catch {}
  let musicGain = null, kazooBus = null, musicTimer = 0, nextT = 0, stepN = 0, intensity = 0, nextGag = 0, ducked = false;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // chords G D Em C (two passes), melody on an 8th-note grid: number = note, -1 = hold, 0 = rest
  const CHORDS = [[55, 59, 62, 67], [50, 57, 62, 66], [52, 59, 64, 67], [48, 55, 60, 64]];
  const BASS = [43, 38, 40, 36];
  const MEL = [
    67, -1, 71, -1, 74, -1, 71, 72, 74, -1, 72, 71, 69, -1, -1, 0, 67, -1, 71, -1, 76, -1, 74, 72, 71, -1, 69, -1, 67, -1, -1, 0,
    79, -1, 78, 76, 74, -1, 71, -1, 74, -1, 76, -1, 78, -1, 74, -1, 76, -1, 74, -1, 72, 71, 69, -1, 67, -1, 69, -1, 71, -1, 67, 0,
  ];
  function initMusic() {
    musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.32 : 0; musicGain.connect(master);
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 6); }
    shaper.curve = curve;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 2.2;
    const nasal = ctx.createBiquadFilter(); nasal.type = 'peaking'; nasal.frequency.value = 2600; nasal.gain.value = 9; nasal.Q.value = 3;
    kazooBus = ctx.createGain(); kazooBus.gain.value = 0.5;
    shaper.connect(bp); bp.connect(nasal); nasal.connect(kazooBus); kazooBus.connect(musicGain);
    kazooBus.input = shaper;
    nextT = ctx.currentTime + 0.3; nextGag = ctx.currentTime + 6;
    musicTimer = setInterval(scheduler, 30);
  }
  function mt(type, f, t, dur, vol, dest = musicGain, cutoff = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; o.connect(lp); lp.connect(g); } else o.connect(g);
    g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  function pluck(m, t, vol) { const f = mtof(m); mt('triangle', f, t, 0.5, vol, musicGain, 3000); mt('square', f * 1.003, t, 0.18, vol * 0.25, musicGain, 1800); }
  function kazoo(m, t, dur) {
    const f = mtof(m), o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.89, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); // the scoop
    vib.frequency.value = 5.6; vg.gain.value = f * 0.012; vib.connect(vg); vg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.03); g.gain.setValueAtTime(0.25, t + dur - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(kazooBus.input); o.start(t); o.stop(t + dur + 0.02); vib.start(t); vib.stop(t + dur + 0.02);
  }
  function scheduler() {
    if (!ctx || ctx.state !== 'running') return;
    const bpm = intensity ? 132 : 108, eighth = 60 / bpm / 2;
    while (nextT < ctx.currentTime + 0.15) {
      const t = nextT, i = stepN % MEL.length, bar = Math.floor(i / 8) % 4, beat = i % 8;
      const swing = beat % 2 ? eighth * 0.16 : 0, tt = t + swing;
      if (musicOn && !muted) {
        const ch = CHORDS[bar];
        // ukulele: down-strum on beats, up-strum on the "and" of 2 and 4
        if (beat % 2 === 0 || beat === 3 || beat === 7) ch.forEach((n, k) => pluck(n + 12, tt + k * (beat % 2 ? 0.008 : 0.014), beat % 2 ? 0.035 : 0.05));
        if (beat === 0 || beat === 4) mt('triangle', mtof(BASS[bar]), tt, 0.35, 0.22, musicGain, 600);
        if (beat === 6) mt('triangle', mtof(BASS[bar] + 7), tt, 0.25, 0.16, musicGain, 600);
        if (beat === 0 || beat === 4 || (intensity && beat === 2)) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, tt); o.frequency.exponentialRampToValueAtTime(45, tt + 0.12); g.gain.setValueAtTime(0.4, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.14); o.connect(g); g.connect(musicGain); o.start(tt); o.stop(tt + 0.15); }
        if (beat === 2 || beat === 6 || intensity) {
          const sN = ctx.createBufferSource(); sN.buffer = noiseBuf; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = beat === 2 || beat === 6 ? 2500 : 7000;
          const g = ctx.createGain(); g.gain.setValueAtTime(beat === 2 || beat === 6 ? 0.12 : 0.04, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06);
          sN.connect(hp); hp.connect(g); g.connect(musicGain); sN.start(tt, Math.random()); sN.stop(tt + 0.07);
        }
        const m = MEL[i];
        if (m > 0) { let n = 1; while (MEL[(i + n) % MEL.length] === -1) n++; kazoo(m, tt, n * eighth * 0.95); }
      }
      nextT += eighth; stepN++;
    }
    if (ctx.currentTime > nextGag) { nextGag = ctx.currentTime + 9 + Math.random() * 13; if (!muted) gag(); }
  }
  function gag() {
    const t = ctx.currentTime, k = Math.floor(Math.random() * 4);
    if (k === 0) { // sheep: "BAA-a-a"
      const o = ctx.createOscillator(), g = ctx.createGain(), v = ctx.createOscillator(), vg = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(230, t); o.frequency.linearRampToValueAtTime(205, t + 0.9);
      v.frequency.value = 9; vg.gain.value = 16; v.connect(vg); vg.connect(o.frequency);
      f1.type = 'bandpass'; f1.frequency.value = 800; f1.Q.value = 4; f2.type = 'bandpass'; f2.frequency.value = 1300; f2.Q.value = 5;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(master); o.start(t); o.stop(t + 1); v.start(t); v.stop(t + 1);
    } else if (k === 1) { // tūī: bell notes, clicks and a wheeze
      [1750, 2600, 1300, 3100, 2200].forEach((f, i) => tone('sine', f, f * (i % 2 ? 1.25 : 0.8), 0.12, 0.07, t + i * 0.16));
      noise(0.05, 0.06, 'bandpass', 4000, 4000, 8, t + 0.85); tone('sine', 900, 2400, 0.25, 0.05, t + 0.95);
    } else if (k === 2) { // gulls cackling at your expense
      for (let i = 0; i < 6; i++) { tone('sawtooth', 1300 - i * 40, 800, 0.12, 0.04, t + i * 0.13); tone('square', 1600, 1000, 0.09, 0.02, t + i * 0.13 + 0.02); }
    } else { // a cow, somewhere over the hill
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(118, t); o.frequency.linearRampToValueAtTime(132, t + 0.3); o.frequency.linearRampToValueAtTime(96, t + 1.4);
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(900, t + 0.5); lp.frequency.linearRampToValueAtTime(300, t + 1.4);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + 1.6);
    }
  }

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
    get music() { return musicOn; },
    toggleMusic() {
      musicOn = !musicOn;
      try { localStorage.setItem('bach.music', musicOn ? '1' : '0'); } catch {}
      if (musicGain) musicGain.gain.setTargetAtTime(musicOn && !ducked ? 0.32 : musicOn ? 0.1 : 0, ctx.currentTime, 0.05);
      return musicOn;
    },
    setIntensity(v) { intensity = v ? 1 : 0; },
    duck(on) { if (on === ducked) return; ducked = on; if (musicGain) musicGain.gain.setTargetAtTime(musicOn ? (on ? 0.1 : 0.32) : 0, ctx.currentTime, 0.2); },
  };
}
