// BACH ATTACK! — shared data contract. Pure data, no three.js: read by the simulation (collision, nav, waves) AND the
// renderer (meshes are built from the very same boxes, so what you see is exactly what you collide with).
//
// Axes: +X east, +Y up, +Z south. The enemy doors are NORTH (-Z), the beer fridge is SOUTH (+Z).
// Units: metres, seconds. Every solid is an axis-aligned box {min:[x,y,z], max:[x,y,z], kind, look}.
//   kind: ground | wall (wall traps mount on its vertical faces) | deck | porch | step | roof (ceiling traps) |
//         fence | fridge | prop | rail
//   look: render hint only (the sim ignores it)

export const TITLE = 'BACH ATTACK!';
export const SEED = 4207;

const B = (x0, y0, z0, x1, y1, z1, kind, look) => ({ min: [x0, y0, z0], max: [x1, y1, z1], kind, look: look || kind });

// ---------------------------------------------------------------- "The Suburban Bach Chokepoint"
export const PIT = { x0: 2, x1: 11, z0: -8, z1: 10, floor: -7, killY: -3.2 }; // the compost gully (mid-lane drop)

export const BOXES = [
  // ground slabs (top y=0) around the compost gully; the gully floor sits at y=-7
  B(-13, -8, -31, 2, 0, 30, 'ground', 'grass'),
  B(11, -8, -31, 17, 0, 30, 'ground', 'grass'),
  B(2, -8, -31, 11, 0, -8, 'ground', 'grass'),
  B(2, -8, 10, 11, 0, 30, 'ground', 'grass'),
  B(2, -8, -8, 11, PIT.floor, 10, 'ground', 'compost'),

  // boundary: garage block north (spawn doors), macrocarpa hedge east, paling fences west/south
  B(-14, 0, -33, 19, 4, -31, 'wall', 'garage'),
  B(17, 0, -33, 19, 4.5, 32, 'wall', 'hedge'),
  B(-15, 0, -33, -13, 2.4, 32, 'wall', 'fence'),
  B(-14, 0, 30, 19, 2.4, 32, 'wall', 'fence'),

  // north courtyard: the divider between the two doors (merges into the courtyard chokepoint)
  B(-1, 0, -31, 1, 3.2, -20, 'wall', 'brick'),

  // the bach itself (mid-west). Its east face (x=-5) is THE jandal wall over the wet deck.
  B(-13, 0, -10, -5, 4.2, 10, 'wall', 'bach'),
  // raised timber deck alongside the gully (no rail on the gully side, on purpose)
  B(-5, 0, -8, 2, 0.6, 10, 'deck', 'deck'),
  // low hedge so courtyard pests don't wander off the north lip of the gully (they get yeeted, not lost)
  B(2, 0, -9, 11, 1.0, -8.4, 'fence', 'lowhedge'),

  // covered carport / veranda archway (late lane): side walls + low roof (ceiling traps)
  B(-13, 0, 10, -5, 3.4, 19, 'wall', 'carportwall'),
  B(3, 0, 10, 11, 3.4, 19, 'wall', 'shed'),
  B(-5, 2.8, 11, 3, 3.3, 19, 'roof', 'carportroof'),

  // player porch / catwalk along the east, overlooking the gully, with steps at both ends
  B(11, 0, -14, 17, 2.4, 22, 'porch', 'porch'),
  B(11, 0, -14.6, 17, 1.8, -14, 'step', 'step'),
  B(11, 0, -15.2, 17, 1.2, -14.6, 'step', 'step'),
  B(11, 0, -15.8, 17, 0.6, -15.2, 'step', 'step'),
  B(11, 0, 22, 17, 1.8, 22.6, 'step', 'step'),
  B(11, 0, 22.6, 17, 1.2, 23.2, 'step', 'step'),
  B(11, 0, 23.2, 17, 0.6, 23.8, 'step', 'step'),
  B(11, 2.4, -8, 11.25, 3.4, 10, 'rail', 'rail'), // porch railing on the gully side (shoot over it)

  // the core objective and friends
  B(-2.2, 0, 25, 0.2, 2.2, 26.4, 'fridge', 'fridge'),
  B(0.5, 0, 25.2, 1.7, 1.1, 26.2, 'prop', 'piewarmer'),
  B(8.5, 0, 24.5, 14, 1.6, 28.4, 'prop', 'ute'),
  B(-11.5, 0, -27, -9.5, 0.9, -25.5, 'prop', 'chillybin'),
];

export const ARENA = { x0: -13, x1: 17, z0: -31, z1: 30 };

// enemy route: two doors → courtyard merge → chokepoint → wet deck → carport → fridge
export const DOORS = { L: { x: -7, z: -29.5 }, R: { x: 7, z: -29.5 } };
const LANE = [
  { x: -1.5, z: -15 }, { x: -1.5, z: -9 }, { x: -1.5, z: -2 }, { x: -1.5, z: 7 },
  { x: -1, z: 12 }, { x: -1, z: 18 }, { x: -1, z: 22.5 },
];
export const PATHS = {
  L: [{ x: -7, z: -23 }, ...LANE],
  R: [{ x: 7, z: -23 }, ...LANE],
};
export const GOAL = { x: -1, z: 24.3, r: 1.5 };
export const PLAYER_SPAWN = { x: 14, y: 2.4, z: 2, yaw: Math.PI * 0.5 }; // on the porch, facing west over the gully

// ---------------------------------------------------------------- feel
export const PLAYER = {
  radius: 0.4, height: 1.8, stepUp: 0.7, speed: 7.2, accel: 70, airAccel: 14, jump: 8.4, gravity: 22,
  dashSpeed: 21, dashTime: 0.16, dashCd: 1.1, hp: 100, regenDelay: 4, regen: 6, respawn: 3,
};
export const CAMERA = {
  fov: 70, dist: 4.4, shoulder: 0.95, pivotY: 1.55, pitchMin: -35, pitchMax: 65, radius: 0.28,
  sens: 0.0023, fireKick: 1.6,
};

// ---------------------------------------------------------------- weapons (Q swaps primary)
export const WEAPONS = {
  fizz: {
    name: 'L&P Fizz Cannon', short: 'L&P', every: 0.13, speed: 75, gravity: 3, dmg: 14, crit: 2.2, critKnock: 7,
    radius: 0.12, life: 1.2,
  },
  pie: {
    name: 'Mince Pie Launcher', short: 'PIE', every: 0.8, speed: 27, gravity: 15, dmg: 48, splash: 3.2, knock: 6,
    radius: 0.22, life: 3,
  },
};
export const BLOWER = { name: 'Leaf-Blower', cd: 0.75, range: 7.5, cosHalf: Math.cos((38 * Math.PI) / 180), push: 15, lift: 4.5, dmg: 3 };

// ---------------------------------------------------------------- traps (hotkeys 1-8)
// mount: floor | wall | ceil. dirs: how many R-rotations the trap supports.
export const TRAPS = [
  { id: 'wet', key: '1', name: 'Wet Decking', mount: 'floor', cost: 150, dirs: 4, color: '#5ad1ff',
    blurb: 'Freshly hosed. Pests skid sideways — R sets the skid.' },
  { id: 'jandal', key: '2', name: 'Flying Jandal', mount: 'wall', cost: 275, dirs: 3, color: '#3b7bff',
    blurb: 'Spring-loaded launcher fires a giant spinning jandal across the lane. Wall mount.', cd: 1.8, push: 15, lift: 5.5,
    dmg: 16, reach: 3.6, speed: 19, range: 1.0 },
  { id: 'sizzle', key: '3', name: 'Sausage Sizzle', mount: 'floor', cost: 225, dirs: 1, color: '#ff7a2f',
    blurb: 'Steam warning, then a scorching burst. Bread not included.', cd: 3.4, warn: 0.7, dmg: 55, burn: 10, burnT: 3 },
  { id: 'marmite', key: '4', name: 'Marmite Floor', mount: 'floor', cost: 100, dirs: 1, color: '#5a3416',
    blurb: 'You either love it or you\'re stuck in it. Heavy slow.', slow: 0.28, linger: 0.8 },
  { id: 'gate', key: '5', name: 'No. 8 Wire Gate', mount: 'ceil', cost: 375, dirs: 1, color: '#c9d2d8',
    blurb: 'Farm gate on a No. 8 wire hinge. Ceiling mount. Crush + stun.', cd: 5.5, delay: 0.22, dmg: 95, stun: 1.6 },
  { id: 'catapult', key: '6', name: 'Chilly Bin Launcher', mount: 'floor', cost: 300, dirs: 4, color: '#2a7fd4',
    blurb: 'Spring-loaded chilly bin lid. Pests go up. R picks where they come down.', cd: 3.0, delay: 0.12, push: 9, lift: 13, dmg: 10 },
  { id: 'zapper', key: '7', name: 'Electric Fence', mount: 'wall', cost: 250, dirs: 1, color: '#ffe14a',
    blurb: 'Hot-wired No. 8 wire. Zaps everything in front of it. Wall mount.', cd: 1.3, dmg: 18, stun: 0.5, reach: 4.2 },
  { id: 'stomper', key: '8', name: 'Gumboot Stomper', mount: 'ceil', cost: 325, dirs: 1, color: '#2b2b2b',
    blurb: 'A giant gumboot on a piston. Fast, angry stomping. Ceiling mount.', cd: 1.4, delay: 0.1, dmg: 42, stun: 0.6 },
];
export const TRAP_BY_ID = Object.fromEntries(TRAPS.map((t) => [t.id, t]));
export const TRAP_TAG = { wet: 'Slip', jandal: 'Jandal Yeet', sizzle: 'Sizzle', marmite: 'Marmite', gate: 'Gate Slam', catapult: 'Chilly Bin Launch', zapper: 'Zap', stomper: 'Gumboot Stomp' };
export const WEAPON_TAG = { fizz: 'Fizz', pie: 'Pie', blower: 'Leaf-Blow', pit: 'Compost', wall: 'Wall Bonk' };
export const SELL_REFUND = 0.8;
export const GRID = 2;

// ---------------------------------------------------------------- enemies
export const ENEMIES = {
  gull: { name: 'Chip-Thief Seagull', hp: 30, speed: 6.4, radius: 0.42, height: 0.95, mass: 0.7, drain: 1, bounty: 12 },
  possum: { name: 'Pine-Cone Possum', hp: 75, speed: 3.6, radius: 0.5, height: 1.0, mass: 1.2, drain: 2, bounty: 28,
    range: 15, keep: 6, every: 2.3, coneDmg: 8, disable: 4 },
  mower: { name: 'Feral Ride-On Mower', hp: 340, speed: 2.7, radius: 1.0, height: 1.35, mass: 4.5, drain: 5, bounty: 65 },
};

// ---------------------------------------------------------------- waves
// groups: [type, count, every(s), door L|R|A(lternate), startDelay(s)]
export const WAVES = [
  { name: 'Smoko Snatchers', groups: [['gull', 8, 1.3, 'A', 0]] },
  { name: 'Hot Chip Heist', groups: [['gull', 12, 0.9, 'A', 0], ['possum', 2, 6, 'A', 4]] },
  { name: 'Who Left The Mower On?', groups: [['gull', 10, 1.0, 'A', 0], ['mower', 1, 1, 'L', 6], ['possum', 2, 5, 'R', 9]] },
  { name: 'Gull Gang', groups: [['gull', 18, 0.55, 'A', 0], ['mower', 2, 7, 'A', 5]] },
  { name: 'Possum Pile-On', groups: [['gull', 10, 0.8, 'A', 0], ['possum', 5, 2.5, 'A', 3], ['mower', 2, 6, 'R', 8]] },
  { name: 'Sunday Arvo Lawn Rage', groups: [['gull', 24, 0.4, 'A', 0], ['mower', 3, 4, 'A', 4], ['possum', 3, 3, 'L', 10]] },
  { name: 'Long Weekend Traffic', groups: [['gull', 16, 0.6, 'A', 0], ['possum', 6, 2.2, 'A', 2], ['mower', 4, 4.5, 'A', 6]] },
  { name: 'THE BIG MOW', groups: [['gull', 26, 0.45, 'A', 0], ['possum', 7, 2.4, 'A', 3], ['mower', 6, 3.6, 'A', 5], ['gull', 12, 0.3, 'A', 18]] },
];
export const ECONOMY = { start: 800, firstBuild: 60, build: 25, earlyPerSec: 3, waveBonus: 100, waveBonusPer: 25, fridge: 25 };

// combo callouts by chain length (2, 3, 4, 5+)
export const CALLOUTS = [
  ['Sweet As!', 'Chur!', 'Tu meke!'],
  ['Choice Bro!', 'Mean As!', 'Good As Gold!'],
  ['Full Send!', 'Hard Out!', 'Stoked!'],
  ['ABSOLUTE UNIT!', 'She\'ll Be Right!', 'BUZZY AS!'],
];
