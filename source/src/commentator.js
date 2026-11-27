// The commentator: plays the recorded call-outs in sfx/ (next to index.html), chosen by what just happened.
// Each clip is named for its moment:
//   double-kill              2 pests sorted within KILL_WINDOW of each other
//   multi-kill               3-5 pests in one burst
//   unstoppable              6+ pests in one burst, or a Rain of Chips that sorts 10+
//   dominating               25 pests in a row without losing a beer, or 3 waves in a row cleared with no beers lost
//   you-have-won-the-match   a level cleared (all 10 waves): the game's "match win"
// One clip at a time: a bigger moment cuts off a smaller one, a smaller one never interrupts a bigger one.
// Pure listener: feed it game events + game time; it never touches the sim.
const CLIPS = {
  'double-kill': { pri: 1, text: 'DOUBLE KILL!' },
  'multi-kill': { pri: 2, text: 'MULTI KILL!' },
  'unstoppable': { pri: 3, text: 'UNSTOPPABLE!' },
  'dominating': { pri: 4, text: 'DOMINATING!' },
  'you-have-won-the-match': { pri: 5, text: 'YOU HAVE WON THE MATCH!' },
};
const KILL_WINDOW = 1.6;   // seconds between kills that still count as the same burst
const DOMINATE_STREAK = 25;

export function createCommentator({ onCall } = {}) {
  let enabled = true, muted = false, volume = 1;
  try { enabled = localStorage.getItem('bach.commentator') !== '0'; } catch {}
  const audio = {};
  for (const k of Object.keys(CLIPS)) { const a = new Audio(`sfx/${k}.mp3`); a.preload = 'auto'; audio[k] = a; }
  let playing = null, playingPri = 0, playingUntil = 0;
  // kill tracking
  let lastKill = -99, burst = 0, burstTier = 0, streak = 0, cleanWaves = 0, waveLeaked = false, lastDominate = -99;

  function call(name, t) {
    const c = CLIPS[name];
    const busy = t < playingUntil;
    if (busy && c.pri <= playingPri) return false;
    if (playing && busy) { try { playing.pause(); playing.currentTime = 0; } catch {} }
    const a = audio[name];
    playing = a; playingPri = c.pri; playingUntil = t + (a.duration || 2.2);
    if (enabled && !muted) { try { a.currentTime = 0; a.volume = volume; a.play()?.catch?.(() => {}); } catch {} }
    if (enabled) onCall && onCall(name, c.text);
    return true;
  }

  function onEvent(e, t) {
    switch (e.type) {
      case 'kill': {
        streak++;
        burst = t - lastKill <= KILL_WINDOW ? burst + 1 : 1;
        lastKill = t;
        if (burst === 1) burstTier = 0;
        // escalate within a burst: each tier is called once
        const tier = burst >= 6 ? 3 : burst >= 3 ? 2 : burst === 2 ? 1 : 0;
        if (tier > burstTier) { burstTier = tier; call(tier === 3 ? 'unstoppable' : tier === 2 ? 'multi-kill' : 'double-kill', t); }
        if (streak > 0 && streak % DOMINATE_STREAK === 0 && t - lastDominate > 15) { lastDominate = t; call('dominating', t); }
        break;
      }
      case 'fridge': streak = 0; waveLeaked = true; break;
      case 'waveStart': waveLeaked = false; break;
      case 'waveClear':
        cleanWaves = waveLeaked ? 0 : cleanWaves + 1;
        if (cleanWaves >= 3 && cleanWaves % 3 === 0 && t - lastDominate > 15) { lastDominate = t; call('dominating', t); }
        break;
      case 'chipsEnd': if (e.kills >= 10 && burstTier < 3) { burstTier = 3; call('unstoppable', t); } break;
      case 'levelClear': call('you-have-won-the-match', t); break;
      case 'lost': streak = 0; cleanWaves = 0; break;
    }
  }

  return {
    onEvent,
    reset() { playingUntil = 0; playingPri = 0; lastKill = -99; burst = 0; burstTier = 0; streak = 0; cleanWaves = 0; waveLeaked = false; lastDominate = -99; },
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; try { localStorage.setItem('bach.commentator', enabled ? '1' : '0'); } catch {} if (!enabled && playing) playing.pause(); return enabled; },
    setMuted(m) { muted = m; if (m && playing) playing.pause(); },
    duck(on) { volume = on ? 0.35 : 1; if (playing) playing.volume = volume; },
  };
}
