# BACH ATTACK!

A third-person shooter trap-defence game set in a suburban Kiwi bach. Seagulls, possums and one feral ride-on mower
are after the beers in the bach fridge. You have wet decking, flying jandals, a sausage sizzle, Marmite and a No. 8 wire
farm gate to stop them.

**`index.html` is the whole game:** one ~755 KB file (~212 KB gzipped), plus the optional `music/` folder (~8 MB of MP3s). The game file itself has no CDN, no asset files and no `data:` blobs.
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

## Endless random levels

Each level is **3 waves**. Clear them and your traps are packed into the ute (100 % refund), the fridge gets a restock
from the dairy (+6 beers), and you're dropped into a **brand-new, randomly generated bach** — "Uncle Dave's Crib,
Raglan", "The Johnsons' Glamping Disaster, Piha"… Difficulty keeps climbing (generated waves after the handcrafted
ones). It's endless; the game-over screen shows the level you reached and your best ever.

The generator (`source/src/sim/levelgen.js`) builds each map north → south from lane features with random widths,
sides and order — **Gully** (raised deck between a house wall and a compost drop), **Carport** (walled lane with a low
roof), **Courtyard** (hedge blocks and junk to funnel around) and **Bridge** (a plank deck with drops on both sides) —
plus 1–3 spawn doors, a porch catwalk on a random side, and the fridge in the back yard. Every map has at least one
Gully and one Carport, so every trap has somewhere to live. `tools/levels.mjs` validates generated maps (spawn on the
porch, floor/wall/ceiling traps placeable, every pest can reach the fridge). Level 1 is always the handcrafted
"Suburban Bach Chokepoint" below. Each new game uses a new seed (`?seed=N` to replay a run).

## Characters

- **Bazza, Defender of the Bach** (you): sun-browned, long wavy hair, full beard and laughing eyes under a cork hat
  with dangling corks; sun-faded black "CHUR!" singlet, fern-tattooed arms, pounamu on a cord, frayed khaki stubbies
  with a leather tool belt, tall gumboots. Carries a chunky brass-and-glass pressurised **L&P Fizz Cannon** (gauges,
  hose, flared nozzle) and a hip-holstered **BREEZA 5000** leaf blower. His corks swing, head bobs and belly jiggles; idle
  him and he dances, drums his belly or blows bubble gum. He talks constantly.
- **Seagull Bandit**: ruffled plumage, heavy-lidded shifty eyes, smug hooked beak, a bottle-cap monocle on a chain and
  a stolen tinny clutched to its chest. Posh and greedy ("Indeed. MINE."). Poops on you; near the fridge it may
  **swoop** straight at it.
- **Possum Burglar**: huge unhinged eyes and a toothy grin, bushy ringed tail with a cloth tie, green bandana, patched
  leather vest and tool belt, a twirling grappling hook and a bulging **SWAG** sack. Lobs pine cones and bum-wiggles
  when one lands.
- **The Grim Cutter** (feral ride-on mower): rune-etched dark iron armour that glows red, burning red headlight eyes,
  a fanged snarling grille and spiked bumper, a vine-wrapped skull on the hood, horned seat with chains, spiked tyres,
  sparking blades and twin exhausts belching black smoke and flame. Roars instead of honking.

(Beer labels are generic "BACH GOLD" rather than real brands.)

## Smarter pests and alternative paths

- Most generated maps include one or two **forks**: a house in the middle with a lane down each side (one a raised
  deck, the other under a pergola), so every door has several routes to the fridge. Pests spread across them.
- Each wave and level raises the **Pest IQ** (shown in the wave panel). Thinking pests:
  - pick the **least-trapped route** when they spawn and **re-plan before forks** as you build ("REROUTE!");
  - **jump** floor traps (gulls flap higher and further) or **side-step** them when there's room;
  - **dash** out from under a dropping No. 8 wire gate or gumboot stomper;
  - mowers are too heavy to jump and think slowly, but they still choose routes.
- Level 1 pests are thick as; by level 5–6 they read your build, so trap every branch.

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
- **Music:** three soundtrack MP3s live in `music/` next to `index.html`: **Island Defense March** plays on the
  title screen, and every level picks a random track (*Kiwi Quest*, *The Great Kiwi Heist*, *Island Defense March*,
  never the same twice in a row), crossfading between levels. Browsers only allow audio after the first click or key,
  so the title track starts then. Every 9–22 s a farmyard gag plays over the top (a sheep, a tūī, cackling gulls or a
  distant cow). N toggles the music, M mutes everything. If the `music/` folder is missing (for example when you copy
  only `index.html`), a procedural ukulele-and-kazoo ditty plays instead, so the single file still works on its own.

## Source layout (`source/`)

The build is the same as WHITEOUT's: `build.mjs`, `glsl-min.mjs`, `template.html` with `/*CSS*/` and `/*SCRIPT*/`
slots, esbuild IIFE output, and a hard 2 MB budget.

```
src/
  contracts.js      level-1 boxes, traps, enemies, waves (+ generated waves), economy. Pure data
    levelgen.js     (in sim/) random level layouts: boxes, doors, enemy paths, goal, porch, decor anchors
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
tools/  soak.mjs · balance.mjs · newtraps.mjs · levels.mjs · progress.mjs (headless sims) · charshot.mjs · jandalshot.mjs · smoke.mjs · camtest.mjs · ghosttest.mjs · poses.mjs (Playwright)
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
