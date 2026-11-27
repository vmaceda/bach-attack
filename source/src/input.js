// Input: keyboard, Pointer Lock mouse-look, and the drag-orbit fallback for sandboxed iframes / refused locks.
//
//   mode 'lock' : click canvas → pointer lock; raw movementX/Y steers the camera; reticle is screen centre.
//   mode 'drag' : lock unavailable or refused → cursor stays visible; Right-drag (or Middle-drag, or Alt+Left-drag)
//                 orbits; aim + build ray go through the cursor. A right click that didn't drag still acts as RMB.
// Esc / Tab release the lock (Esc also pauses — handled by main via onLockLost / key events).
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();      // codes pressed since last consume (keys + 'Mouse0/1/2')
  const buttons = [false, false, false];
  let dx = 0, dy = 0;
  const I = {
    mode: 'lock', locked: false, cursorX: innerWidth / 2, cursorY: innerHeight / 2, orbiting: false,
    enabled: false, onLockLost: null, onModeChange: null, lockFails: 0, tabRelease: false,
    down: (c) => keys.has(c), mouse: (b) => buttons[b],
  };
  const supported = !!(canvas.requestPointerLock && 'pointerLockElement' in document);
  if (!supported) I.mode = 'drag';

  function setMode(m) { if (I.mode !== m) { I.mode = m; I.onModeChange && I.onModeChange(m); } }

  let pendingLock = 0;
  I.requestLock = () => {
    if (I.mode !== 'lock' || document.pointerLockElement === canvas) return;
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      const fail = () => {
        // retry once without unadjustedMovement (Linux / some compositors), then fall back to drag mode
        try {
          const p2 = canvas.requestPointerLock();
          if (p2 && p2.catch) p2.catch(() => lockFailed());
        } catch { lockFailed(); }
      };
      if (p && p.catch) p.catch(fail);
    } catch { lockFailed(); }
    clearTimeout(pendingLock);
    pendingLock = setTimeout(() => { if (document.pointerLockElement !== canvas && I.enabled) lockFailed(); }, 900);
  };
  // a refusal right after Esc is normal (browsers rate-limit re-locks), so only give up on lock mode after two
  // failures in a row — or at once inside an iframe, where a missing allow-pointer-lock sandbox flag is the usual cause
  let inFrame = false; try { inFrame = window.self !== window.top; } catch { inFrame = true; }
  let lastUnlock = -1e9;
  function lockFailed() {
    if (document.pointerLockElement === canvas) return;
    if (performance.now() - lastUnlock < 1600) { I.onLockRetry && I.onLockRetry(); return; } // re-lock cooldown, not a refusal
    I.lockFails++;
    if (inFrame || I.lockFails >= 2) setMode('drag');
    else I.onLockRetry && I.onLockRetry();
  }
  I.forceMode = (m) => { if (m === 'drag' && document.pointerLockElement) document.exitPointerLock(); setMode(m); };
  I.releaseLock = () => { if (document.pointerLockElement) { I.tabRelease = true; document.exitPointerLock(); } };

  document.addEventListener('pointerlockchange', () => {
    const was = I.locked;
    I.locked = document.pointerLockElement === canvas;
    if (I.locked) { clearTimeout(pendingLock); I.lockFails = 0; dx = dy = 0; }
    if (was && !I.locked) {
      lastUnlock = performance.now();
      const byTab = I.tabRelease; I.tabRelease = false;
      I.onLockLost && I.onLockLost(byTab);
    }
  });
  document.addEventListener('pointerlockerror', () => lockFailed());

  const prevent = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'Backspace']);
  addEventListener('keydown', (e) => {
    if (prevent.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code); pressed.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); buttons[0] = buttons[1] = buttons[2] = false; I.orbiting = false; });

  let orbitBtn = -1, orbitMoved = 0;
  canvas.addEventListener('mousedown', (e) => {
    if (!I.enabled) return;
    if (I.mode === 'lock' && !I.locked) { I.requestLock(); return; } // first click only captures the mouse
    const b = e.button;
    if (I.mode === 'drag' && (b === 2 || b === 1 || (b === 0 && e.altKey))) {
      orbitBtn = b; orbitMoved = 0; I.orbiting = true;
      if (b !== 2) return;         // middle / alt-left: orbit only
      buttons[2] = false;           // right: decide on release (click = RMB action, drag = orbit)
      return;
    }
    buttons[b] = true; pressed.add('Mouse' + b);
  });
  addEventListener('mouseup', (e) => {
    const b = e.button;
    if (b === orbitBtn) {
      if (b === 2 && orbitMoved < 6) pressed.add('Mouse2');
      orbitBtn = -1; I.orbiting = false;
      return;
    }
    buttons[b] = false;
  });
  addEventListener('mousemove', (e) => {
    I.cursorX = e.clientX; I.cursorY = e.clientY;
    if (I.locked) {
      // drop the occasional movement spike some browsers emit right after locking
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      dx += e.movementX; dy += e.movementY;
    } else if (I.orbiting) {
      dx += e.movementX; dy += e.movementY; orbitMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { I.wheel = (I.wheel || 0) + Math.sign(e.deltaY); }, { passive: true });

  I.consume = () => { const o = { dx, dy, pressed: new Set(pressed), wheel: I.wheel || 0 }; dx = dy = 0; pressed.clear(); I.wheel = 0; return o; };
  return I;
}
