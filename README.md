# BACH ATTACK!

A third-person shooter trap-defence game set in a suburban Kiwi bach. Seagulls, possums and one feral ride-on mower
are after the beers in the bach fridge. You have wet decking, flying jandals, a sausage sizzle, Marmite and a No. 8 wire
farm gate to stop them.

**`index.html` is the whole game:** one ~710 KB file (~195 KB gzipped), with no CDN, no asset files and no `data:` blobs.
It follows the same model as WHITEOUT: three.js r180 is bundled by esbuild into a single HTML file, every texture is
drawn on a canvas at load time, and every sound is synthesised with Web Audio.

## Controls

| Action | Input |
|---|---|
| Mouse look | Click the game to capture the mouse (Pointer Lock). Pitch is clamped to −35° … +65° |
| Fallback look | If Pointer Lock is blocked (for example in a sandboxed iframe), the game switches to **right-drag to orbit** (middle-drag and Alt+left-drag also work), and you aim at the 3D point under the cursor |
| Move / jump / dash | WASD (camera-relative) · Space · Shift (short cooldown, brief invulnerability) |
| Fire | LMB. **L&P Fizz Cannon**: headshots ("cracker shots") do 2.2× damage and knock the target back. Press **Q** to swap to the **Mince Pie Launcher** (lobbed, splash damage) |
| Leaf-blower | RMB or E. A short-range cone that shoves pests onto traps or off the deck into the compost gully |
| Build | B toggles build mode. 1–8 select a trap (and enter build mode); the mouse wheel cycles traps. LMB places, R rotates directional traps, X or RMB sells for an 80 % refund (between waves only) |
| Waves | G starts the next wave early, with bonus shrapnel for the time left on the build timer |
| Meta | P or Esc pauses · Tab frees the cursor without pausing · M mutes everything · N toggles the music · Backspace restarts instantly · Enter restarts from the end screen |

## The level: "The Suburban Bach Chokepoint"

```
 N   [door L]  ▌divider▐  [door R]      ← garage block (spawns)
          courtyard merge  ⟶  chokepoint (bach wall | low hedge)
 ┌bach┐ ║ WET DECK (y 0.6) ║  COMPOST GULLY (y −7)  │porch/catwalk (y 2.4)
 │wall│ ║  jandal → → → → →║→ yeet                  │ rail, steps at both ends
 └────┘ ║                  ║                        │
 carport wall │ CARPORT (roof 2.8: gate mounts) │ shed
          yard · 🍺 BACH BEER FRIDGE & PIE WARMER   S
```

- **Two spawn doors (north):** the doors are split by a brick divider. Both lanes merge in the courtyard into one chokepoint.
- **Wet deck and gully drop (mid lane):** a raised timber deck runs beside a 7 m compost gully. The bach's east wall,
  at x = −5, is the jandal wall: wet decking skids pests toward the edge, and a jandal yeets them in. Pests that fall
  into the compost die.
- **Carport archway (late lane):** a low roof supports floor, wall and overhead traps together. Marmite, a sizzle and the
  gate are the intended combination here.
- **Objective (south):** the fridge, with an integrity ring on the ground that shifts from green to red and pulses
  faster as the beers run out. Pests that reach it take 1, 2 or 5 beers. If all 25 go, you lose.
- **Porch catwalk (east):** a raised vantage point above the gully, with steps down to the courtyard and to the yard.
  Shots and the aim ray pass between the railing's balusters.

## Traps and pests

| Trap | Mount | Effect |
|---|---|---|
| 1 Wet Decking (150) | floor | Low traction plus a sideways skid. R picks the skid direction (4 options) |
| 2 Flying Jandal (275) | wall | Launches a giant spinning jandal that flies across the lane, aims at the pest that tripped it, and yeets everything it hits. R angles it (3 options) |
| 3 Sausage Sizzle (225) | floor | 0.7 s of steam as a warning, then a 55-damage burst plus burning |
| 4 Marmite Floor (100) | floor | Slows pests to 28 % speed, with a short linger after they leave |
| 5 No. 8 Wire Gate (375) | ceiling | Drops after a short delay: 95 crush damage and a 1.6 s stun |
| 6 Chilly Bin Launcher (300) | floor | A sprung chilly-bin lid fires pests high into the air. R picks where they land (aim it at the gully) |
| 7 Electric Fence (250) | wall | Hot-wired No. 8 wire: zaps everything in front of it (18 damage, short stun), with visible arcs |
| 8 Gumboot Stomper (325) | ceiling | A giant gumboot on a piston. Fast, repeated stomps (42 damage, short stun) |

**Pests:**
- **Chip-Thief Seagull:** fast and fragile.
- **Pine-Cone Possum:** stops at mid range to lob cones at you. Every third cone targets a nearby trap and gums it up
  for 4 s.
- **Feral Ride-On Mower:** 340 HP and mass 4.5, so it shrugs off light knockback. Slow it, then burst it down.

**Combos:** every trap, weapon or environment hit on a pest is tagged. If a pest takes a different tag within 3 s and
its chain contains at least one trap, that counts as a combo link, for example Slip → Jandal Yeet → Compost. Each link
pays out a shrapnel pickup (coins fly to you), shows a callout (*Sweet As! · Choice Bro! · Full Send! · ABSOLUTE UNIT!*,
with alternates) and raises a combo streak.

## Look and sound

- **Graphics:** physical (Preetham) sky baked into an image-based-lighting environment, a 4096² soft sun shadow map,
  PBR materials with normal and roughness maps generated from every procedural texture, ~30,000 instanced grass
  blades swaying in the breeze, a reflective animated sea, organic tree canopies (pohutukawa in flower) and rolling
  hills. A post chain adds ground-truth ambient occlusion (GTAO), soft bloom, AgX filmic tonemapping and a warm summer
  colour grade with vignette and grain. `?q=med` drops AO, `?q=low` turns post-processing off; an auto-governor does
  the same if the frame rate sags.
- **Music:** a procedural BBQ ditty with ukulele strums, bass, boom-chick percussion and a scooping kazoo on the
  melody. It speeds up during waves. Every 9–22 s a farmyard gag plays: a sheep, a tūī, cackling gulls or a distant
  cow. N toggles the music, M mutes everything.

## Source layout (`source/`)

The build is the same as WHITEOUT's: `build.mjs`, `glsl-min.mjs`, `template.html` with `/*CSS*/` and `/*SCRIPT*/`
slots, esbuild IIFE output, and a hard 2 MB budget.

```
src/
  contracts.js      level boxes, lanes, traps, enemies, waves, economy. Pure data, shared by sim and renderer
  sim/              simulation: no three.js, no DOM, runs headless in node
    world.js        AABB collision, heightAt, raycast, sphere sweep (also used for camera collision)
    index.js        player, weapons, blower, traps, enemies + path following, projectiles, waves, combos, placement
    loop.js         fixed-step accumulator (from the onefile-aaa cookbook)
  render/           three.js, read-only view of sim state
    scene.js        renderer, sun/hemi/shadows, sky dome, level meshes generated FROM the collision boxes, set dressing
    textures.js     procedural canvas textures (grass, planks, weatherboard, corrugated iron, hedge…)
    models.js       Bazza, seagull, possum, mower, the five traps, translucent build ghosts
    fx.js           pooled point-sprite particles + projectile / coin pools
    post.js         EffectComposer: GTAO, bloom, colour grade, OutputPass, quality governor
    view.js         state → meshes sync, TPS camera rig (swept shoulder + boom), events → FX/audio/HUD
  input.js          Pointer Lock + drag-orbit fallback, keyboard, edge-triggered presses
  audio.js          procedural Web Audio SFX + mower drone + surf ambience, mute
  hud.js            DOM HUD: wave panel and preview, shrapnel, fridge bar, hotbar, callouts, floaters, control hint
  main.js           controller: input → cmd → sim.step (60 Hz) → events → view/hud/audio; state machine
tools/  soak.mjs · balance.mjs · newtraps.mjs (headless sims) · jandalshot.mjs · smoke.mjs · camtest.mjs · ghosttest.mjs · poses.mjs (Playwright)
```

The controller only talks to the sim through a per-step `cmd` object: move vector, aim yaw, camera ray, and
edge-triggered fire, place, sell and start-wave flags. The renderer only reads `sim.state` and drains `sim.events`. That
separation is what lets `tools/balance.mjs` play all eight waves headless in under a second.

## Build and test

```bash
cd source && npm i
npm run build          # → source/dist/index.html, copied to ../index.html
npm run soak           # headless sim: trap build + all waves, NaN / stuck checks
npm run balance        # headless: build order + aimbot player, prints per-wave results
CHROME_PATH=/path/to/chrome npm run smoke   # browser boot + scripted play + screenshots, fails on console errors
```

Test hooks: `?autostart=1` skips the title screen, `?drag=1` forces drag-orbit mode, `?seed=N` sets the seed,
`?cam=x,y,z,tx,ty,tz` fixes the camera, and `window.__game` exposes the game for scripts.
