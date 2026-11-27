// Minimal DOM HUD. Reads sim state (never writes it); main.js forwards UI actions through callbacks.
import { TRAPS, ENEMIES, WEAPONS, PLAYER, WAVES_PER_LEVEL } from './contracts.js';

const ICON = { gull: '🐦', possum: '🐾', mower: '🚜' };

export function createHUD(root) {
  const $ = (b) => root.querySelector(`[data-bind="${b}"]`);
  const els = {};
  for (const n of root.querySelectorAll('[data-bind]')) els[n.dataset.bind] = n;
  const screens = { hud: root.querySelector('#hud'), title: root.querySelector('#title'), pause: root.querySelector('#pause'), over: root.querySelector('#over') };
  const cache = {};
  const set = (k, v, html) => { if (cache[k] === v) return; cache[k] = v; if (html) els[k].innerHTML = v; else els[k].textContent = v; };

  // hotbar
  const slots = TRAPS.map((t, i) => {
    const d = document.createElement('div');
    d.className = 'slot';
    d.innerHTML = `<span class="k">${t.key}</span><div class="sw" style="background:${t.color}"></div><div class="n">${t.name}</div><div class="c">${t.cost}</div><div class="m">${t.mount === 'ceil' ? 'overhead' : t.mount}</div>`;
    d.title = t.blurb;
    d.dataset.slot = i;
    els.hotbar.appendChild(d);
    return d;
  });

  function show(name) {
    root.dataset.state = name;
    screens.title.hidden = name !== 'title';
    screens.pause.hidden = name !== 'paused';
    screens.over.hidden = name !== 'over';
    screens.hud.hidden = name === 'title';
  }

  let calloutTimer = 0;
  function callout(text, chain) {
    const c = els.callout, ch = els.calloutChain;
    c.textContent = text; ch.textContent = chain || '';
    c.classList.remove('show'); ch.classList.remove('show'); void c.offsetWidth;
    c.classList.add('show'); ch.classList.add('show');
    calloutTimer = 1.6;
  }
  function banner(text, sub, color = '#fff') {
    const b = els.banner;
    b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`; b.style.color = color;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function toast(text, cls = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + cls; t.textContent = text;
    els.toasts.prepend(t);
    while (els.toasts.children.length > 5) els.toasts.lastChild.remove();
    setTimeout(() => t.remove(), 3300);
  }

  // floating numbers (screen-space, positioned by main via project())
  const floaters = [];
  function floater(text, cls, wx, wy, wz) {
    let f = floaters.find((x) => x.life <= 0);
    if (!f) {
      if (floaters.length > 60) return;
      const el = document.createElement('div'); el.className = 'fl'; els.floaters.appendChild(el);
      f = { el, life: 0 }; floaters.push(f);
    }
    f.el.textContent = text; f.el.className = 'fl ' + (cls || ''); f.el.style.display = '';
    f.x = wx; f.y = wy; f.z = wz; f.life = 1.0; f.vy = 1.6; f.jx = (Math.random() - 0.5) * 0.6;
  }
  function updateFloaters(dt, project) {
    for (const f of floaters) {
      if (f.life <= 0) continue;
      f.life -= dt; f.y += f.vy * dt; f.vy *= 0.96;
      const p = project(f.x + f.jx, f.y, f.z);
      if (f.life <= 0 || !p) { f.el.style.display = 'none'; f.life = 0; continue; }
      f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%,-50%) scale(${0.8 + Math.min(1, (1 - f.life) * 6) * 0.3})`;
      f.el.style.opacity = Math.min(1, f.life * 2.5);
    }
  }

  // speech bubbles that ride above a character (getPos returns a world position or null when it's gone)
  const bubbles = [];
  function speech(text, getPos, cls = '', life = 2.2) {
    let b = bubbles.find((x) => x.life <= 0);
    if (!b) { if (bubbles.length > 10) return; const el = document.createElement('div'); els.speech.appendChild(el); b = { el, life: 0 }; bubbles.push(b); }
    b.el.className = 'speech ' + cls; b.el.textContent = text; b.el.style.display = ''; b.getPos = getPos; b.life = life; b.max = life;
  }
  function updateBubbles(dt, project) {
    for (const b of bubbles) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const w = b.getPos(); const p = w && project(w.x, w.y, w.z);
      if (b.life <= 0 || !p) { b.el.style.display = 'none'; b.life = 0; continue; }
      const pop = Math.min(1, (b.max - b.life) * 8);
      b.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${0.6 + 0.4 * pop})`;
      b.el.style.opacity = Math.min(1, b.life * 3);
    }
  }
  let splatT = 0;
  function splat() { splatT = 3.2; for (const i of els.splat.querySelectorAll('i')) i.style.transform = `rotate(${Math.random() * 360}deg) scale(${0.8 + Math.random() * 0.5})`; }

  let dmgFlash = 0;
  function hurt() { dmgFlash = 1; }

  function update(dt, S, v) {
    const P = S.player, W = S.waveDef;
    set('waveNo', `LVL ${S.level} · WAVE ${Math.min(S.wave + 1, WAVES_PER_LEVEL)}/${WAVES_PER_LEVEL}`);
    set('waveName', W.name);
    set('levelName', S.layout.name);
    if (S.phase === 'build') {
      set('waveStatus', `Build time: <b>${Math.ceil(S.buildT)}s</b> — press <kbd>G</kbd> to send 'em early`, true);
      const counts = {};
      for (const [type, n] of W.groups) counts[type] = (counts[type] || 0) + n;
      set('wavePreview', 'Incoming: ' + Object.entries(counts).map(([t, n]) => `<span>${ICON[t]} ${n}× ${ENEMIES[t].name}</span>`).join(''), true);
    } else if (S.phase === 'wave') {
      const left = S.spawnQ.length + S.enemies.length;
      set('waveStatus', `Pests remaining: <b>${left}</b> / ${S.waveTotal}`, true);
      set('wavePreview', '', true);
    } else if (S.phase === 'levelClear') {
      set('waveStatus', 'Level sorted! Packing the traps into the ute…');
      set('wavePreview', '', true);
    } else {
      set('waveStatus', 'The chilly bin\'s empty…');
      set('wavePreview', '', true);
    }
    set('money', String(S.money));
    set('fridgeTxt', `${S.fridge}/${S.fridgeMax}`);
    const ff = S.fridge / S.fridgeMax;
    els.fridgeBar.style.width = (ff * 100).toFixed(1) + '%';
    els.fridgeBar.classList.toggle('low', ff < 0.35);
    els.hpBar.style.width = ((P.hp / PLAYER.hp) * 100).toFixed(1) + '%';
    set('weapon', WEAPONS[P.weapon].name);
    els.dashPip.classList.toggle('cd', P.dashCd > 0);
    els.blowPip.classList.toggle('cd', P.blowCd > 0);
    els.mutePip.classList.toggle('off', v.muted);
    set('mutePip', v.muted ? 'MUTED M' : 'SOUND M');

    slots.forEach((s, i) => { s.classList.toggle('sel', v.build && v.trap === i); s.classList.toggle('poor', S.money < TRAPS[i].cost); });
    els.buildBanner.classList.toggle('on', v.build);

    // reticle: screen centre in lock mode, the cursor in drag mode
    const ch = els.crosshair;
    ch.style.left = v.reticleX + 'px'; ch.style.top = v.reticleY + 'px';
    ch.classList.toggle('build', v.build);
    ch.classList.toggle('hit', v.hitMark > 0);
    if (v.build && v.place) {
      const q = v.place;
      const T = TRAPS[v.trap];
      const txt = q.ok ? `${T.name} — ${T.cost}${T.dirs > 1 ? ' · R rotate' : ''}` : (q.reason + (q.sellId && S.phase !== 'wave' ? ' · X to sell' : ''));
      set('placeTip', txt);
      els.placeTip.className = 'place-tip ' + (q.ok ? 'ok' : 'bad');
    } else set('placeTip', '');

    set('modeLine', v.mode === 'lock' ? (v.locked ? '🖱 Mouse Look active · Esc/Tab frees the cursor' : '🖱 Click canvas for Mouse Look') : '🖐 Right-Drag to Orbit · aim follows your cursor');
    set('otherMode', v.mode === 'lock' ? 'drag-orbit' : 'mouse-look');
    const C = S.combo;
    set('streak', C.streak > 1 ? `×${C.streak} COMBO STREAK` : '');
    set('deadMsg', P.dead ? `Munted! Back in ${Math.ceil(P.respawnT)}…` : '');
    els.deadMsg.classList.toggle('on', P.dead);

    dmgFlash = Math.max(0, dmgFlash - dt * 2.2);
    els.damage.style.opacity = Math.max(dmgFlash, P.hp < 35 && !P.dead ? 0.35 + 0.15 * Math.sin(S.t * 6) : 0).toFixed(2);
    updateFloaters(dt, v.project);
    updateBubbles(dt, v.project);
    splatT = Math.max(0, splatT - dt);
    els.splat.style.opacity = Math.min(1, splatT / 1.2).toFixed(2);
  }

  function gameOver(S) {
    let best = S.level;
    try { best = Math.max(best, +(localStorage.getItem('bach.best') || 0)); localStorage.setItem('bach.best', String(best)); } catch {}
    set('overTitle', 'YEAH, NAH…');
    set('overSub', `The pests cleaned out the fridge at ${S.layout.name}. Harden up and have another crack.`);
    set('overStats', `<span>Level reached</span><b>${S.level}</b><span>Best level ever</span><b>${best}</b><span>Waves survived</span><b>${(S.level - 1) * WAVES_PER_LEVEL + S.wave}</b><span>Pests sorted</span><b>${S.stats.kills}</b><span>Yeeted into the compost</span><b>${S.stats.yeets}</b><span>Trap combos</span><b>${S.stats.combos}</b><span>Best combo streak</span><b>${S.combo.best}</b><span>Beers left</span><b>${S.fridge}</b>`, true);
  }

  return { show, callout, banner, toast, floater, hurt, update, gameOver, speech, splat, els, slots, dismissHint() { els.controlHint.classList.toggle('mini'); } };
}
