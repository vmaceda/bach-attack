// Loop helpers: fixed-step simulation with interpolation, and a per-module update runner that isolates crashes.
//
//   const sim = createFixedStep({ hz: 60, step: (h, t) => physics.step(h) });
//   G.on('update', (dt) => { const alpha = sim.advance(dt); render-interpolate with alpha });
//
//   const run = createModuleRunner(G);         // boot.js uses this: one try/catch per module, logs each failure once
//   run.add('enemies', enemies);               // anything with update(dt, t)
//   G.on('update', run.update);                // order = add order (input → game → player → actors → fx → audio → ui)
//
// Why fixed step: physics, AI timers and springs must not change behaviour with frame rate, and playtests with
// ?dt= must be reproducible. Rendering stays variable-rate; interpolate visuals with `alpha` if motion is fast.

export function createFixedStep({ hz = 60, maxSteps = 5, step }) {
  const h = 1 / hz;
  const S = {
    h, acc: 0, t: 0, steps: 0, dropped: 0,
    // returns interpolation alpha in [0,1): fraction of a step left in the accumulator
    advance(dt) {
      S.acc += dt;
      let n = 0;
      while (S.acc >= h && n < maxSteps) { step(h, S.t); S.t += h; S.acc -= h; n++; }
      if (n === maxSteps && S.acc >= h) { S.dropped += Math.floor(S.acc / h); S.acc %= h; } // spiral-of-death guard
      S.steps += n;
      return S.acc / h;
    },
    reset() { S.acc = 0; },
  };
  return S;
}

export function createModuleRunner(G) {
  const list = []; // {name, mod, failed}
  const R = {
    list,
    add(name, mod) { if (mod && typeof mod.update === 'function') list.push({ name, mod, failed: 0 }); return mod; },
    remove(name) { const i = list.findIndex((e) => e.name === name); if (i >= 0) list.splice(i, 1); },
    update(dt, t) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        try { e.mod.update(dt, t); }
        catch (err) {
          // log once per module; keep calling (transient errors recover), but stop after 30 failures
          if (!e.failed) { G.errors.push(`[loop] ${e.name}.update threw: ${String(err && err.message || err).slice(0, 300)}`); console.error(err); }
          if (++e.failed > 30) { list.splice(i--, 1); G.errors.push(`[loop] ${e.name} disabled after repeated failures`); }
        }
      }
    },
  };
  return R;
}

// Deterministic per-system RNG streams off one seed (?seed=N): fork('enemies') never shifts when 'fx' draws more.
export function rngStreams(G, seed = +(G.params.get('seed') || 4207)) {
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  return { seed, fork: (name) => G.rng((seed ^ hash(name)) >>> 0) };
}
