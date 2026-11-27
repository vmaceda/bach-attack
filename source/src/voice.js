// Spoken voices via the browser's built-in speech synthesis (no audio files). Prefers a New Zealand English voice,
// then Australian, then British, then any English voice. Each character gets its own pitch / rate:
//   bazza (gruff Kiwi bloke), announcer (big stadium voice), gull (squeaky posh), possum (giggly), mower (deep doom).
// One line at a time; a higher-priority line interrupts a lower one, low-priority chatter is dropped while busy.
// V toggles voices; M (mute all) silences them too. If speech synthesis is unavailable, say() returns false and the
// caller falls back to the gibberish blurt.
export function createVoice() {
  const synth = typeof window !== 'undefined' && window.speechSynthesis;
  let enabled = true, muted = false, voices = [], speaking = 0, busyUntil = 0;
  try { enabled = localStorage.getItem('bach.voices') !== '0'; } catch {}
  const pick = () => {
    if (!synth) return;
    voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
  };
  if (synth) { pick(); synth.onvoiceschanged = pick; }
  const prefer = (male) => {
    const by = (re) => voices.filter((v) => re.test(v.lang));
    const pool = [by(/en[-_]NZ/i), by(/en[-_]AU/i), by(/en[-_]GB/i), voices].find((p) => p.length) || [];
    if (!pool.length) return null;
    const m = pool.find((v) => (male ? /male|daniel|george|lee|james|oliver|gordon|arthur|ryan|rishi|liam/i : /female|karen|catherine|kate|serena|libby|natasha/i).test(v.name) && !(male && /female/i.test(v.name)));
    return m || pool[0];
  };
  const CAST = {
    bazza: { male: true, pitch: 0.8, rate: 1.08, volume: 1 },
    announcer: { male: true, pitch: 0.6, rate: 0.95, volume: 1 },
    gull: { male: false, pitch: 1.9, rate: 1.3, volume: 0.8 },
    possum: { male: false, pitch: 1.6, rate: 1.25, volume: 0.8 },
    mower: { male: true, pitch: 0.1, rate: 0.75, volume: 0.9 },
  };
  function say(text, who = 'bazza', priority = 1) {
    if (!synth || !voices.length) return false;
    if (!enabled || muted) return true; // handled (silently)
    const clean = String(text).replace(/\*[^*]*\*/g, '').replace(/[🧠🍺🎵]/gu, '').replace(/\.\.\./g, ', ').trim();
    if (!clean) return true;
    const now = performance.now();
    if (now < busyUntil && priority <= speaking) return true; // busy with something at least as important
    if (synth.speaking) synth.cancel();
    const c = CAST[who] || CAST.bazza, u = new SpeechSynthesisUtterance(clean);
    const v = prefer(c.male); if (v) { u.voice = v; u.lang = v.lang; }
    u.pitch = c.pitch; u.rate = c.rate; u.volume = c.volume;
    speaking = priority; busyUntil = now + 400 + clean.length * 75 / c.rate;
    u.onend = () => { busyUntil = 0; speaking = 0; };
    synth.speak(u);
    return true;
  }
  return {
    say,
    get available() { return !!(synth && voices.length); },
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; try { localStorage.setItem('bach.voices', enabled ? '1' : '0'); } catch {} if (!enabled && synth) synth.cancel(); return enabled; },
    setMuted(m) { muted = m; if (m && synth) synth.cancel(); },
  };
}
