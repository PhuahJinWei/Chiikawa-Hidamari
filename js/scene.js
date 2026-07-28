// A small planet under a sky dome. The globe and the house are the only real
// 3D geometry out here — everything else standing on the planet is a flat card
// squared to your view axis, which is what keeps the paper-cutout look while
// you walk about.

import * as THREE from 'three';
import { CONFIG, PAL } from './config.js';
import { CAST } from './cast.js';
import {
  paintSky, paintGlobe, paintHorizon,
  paintShadow, SHADOW_ROOM, paintLampGlow, paintItemGlow, litSpot, paintWalkMarker,
  paintBench, paintSheet, sheetBounds, makeRandom, SKY_DESIGN,
  starStamp, STAR_SEED,
  paintHouseSkin, paintHouseWindowFrame,
  paintHouseDoorFrame, paintDoorway,
  paintRoomWall, paintRoomFloor, paintRug, paintTableTop,
  archPath, DOOR_SHEET, WINDOW_SHEET,
} from './art.js';
import { BUILD } from './furniture.js';
import {
  buildTree, buildStump, buildGrassBlades, inkMaterials,
  trunkRadius, stumpRadius, stumpTop, stumpTopRadius, treeSolidRadius, TRUNK_TOP,
} from './foliage.js';
import {
  IMG, TREE_VARIANTS, FLOWER_VARIANTS,
  MUSHROOM_VARIANTS, SKY_DISC_ART,
} from './assets.js';
import { LOOK, PHASES } from './daylight.js';
import { RENDER_SPAN } from './character.js';
import {
  UP, orientBillboard, dirFromLatLon, inLake, setBuildings, inBuilding, setScenery,
  setSolids, addSolids, groundCap, SHADOW_LIFT, localFrame, biomesAt, lakeReach,
  perchAlongRay,
} from './sphere.js';
import { buildLake, driftGlints, waterHour } from './water.js';
import { FishSchool } from './fish.js';
import { Hand } from './hand.js';

// Heights in world units. Width is not stated: it comes from each sprite's own
// canvas, so a drawing re-exported at another size or a slightly different crop
// stays the shape it was drawn, instead of being stretched to fit a ratio
// written down here months earlier.
//
// Trees have to overhead you, which is a stronger constraint than it sounds.
// Your eye is at 1.7 and the characters stand 2.0 to 2.8 tall, so the old 2.05
// put a tree at eye level and level with Chiikawa — a shrub you happened to be
// standing next to. At 3.8 (times the 0.72–1.29 per-prop scale, so 2.7 to 4.9)
// the canopy is properly above you and above them.
//
// The tree variants share that height deliberately. All three are drawn on one
// canvas size, so equal `h` makes them one tree in three shapes rather than
// three sizes of tree. They keep separate entries anyway: a future drawing on
// a taller canvas would want its own height, and width follows the drawing.
//
// Only the larger props carry a shadow — on something a few pixels across it is
// a second draw call for nothing — and `small` ones are dropped entirely once
// you climb far enough that they would be sub-pixel anyway.
//
// Ground cover is not here; grass and flowers are merged geometry and take
// their size at the buildGroundCover call below.
const SPRITE_SIZE = {
  // A wide, squat dome, so 3.0 here buys a house 4.0 across where the peaked
  // one it replaced was square. That is the point of it — it should read as a
  // building rather than as a tall prop — but width is also what the sagitta
  // sink below is driven by, and 4.0 is about as broad as a card can be on a
  // globe this size before its base is buried rather than planted.
  // No shadow, and it is the one prop here that must not have one. Everything
  // else in this table casts onto grass you can see; the house's disc is cut
  // from the card's 4.0 width, which is 3.2 across — the dome's own radius — so
  // it lies entirely INSIDE the building. From outside the skirt buries it, so
  // it never darkened a blade of grass; the only place it could ever be seen was
  // through the door and the windows, lying on the room's floor, in lawn green,
  // wearing the outdoor hour while the room wore its own.
  house: { h: 3.0, shadow: false, small: false },
  bench: { h: 0.9, shadow: true, small: false },
  // BUILT, and therefore measured here rather than off a drawing.
  //
  // `aspect` is width over height and `drawn` is how much of that width the ink
  // actually covers — the two things every other prop reads out of its PNG at
  // load time. A built prop never shows its card, so the pixels were only ever
  // consulted for these two numbers, which meant three tree drawings and a
  // stump — 199KB — were being fetched, decoded and kept in memory to answer
  // four ratios. They are written down instead, and the drawings are retired to
  // `asset/images/legacy/`.
  //
  // MEASURED OFF THE RETIRED FILES, not estimated: tree-1/2/3 are all 712x899
  // and the stump 341x135, with the ink covering the fractions below. Nothing
  // in the world moved when they were baked — the seeded layout hashes
  // identically either way, which is the check to repeat if these are touched,
  // since `drawn` feeds the ground cover's keep-out and a wrong one would
  // silently reshuffle every blade of grass on the planet.
  //
  // There is no longer a flag that turns these back into cards, so these two
  // numbers are the only record of the drawings' shape that the app keeps. The
  // files themselves are in `asset/images/legacy/` if they ever need
  // re-measuring.
  tree1: { h: 3.8, shadow: true, small: false, aspect: 0.7919911, drawn: 0.66292135 },
  tree2: { h: 3.8, shadow: true, small: false, aspect: 0.7919911, drawn: 0.70084270 },
  tree3: { h: 3.8, shadow: true, small: false, aspect: 0.7919911, drawn: 0.72050562 },
  // Drawn art. A bush was never built — every bush on the planet is still its
  // drawing on a card — so these two keep reading their own pixels.
  bush1: { h: 0.72, shadow: false, small: true },
  bush2: { h: 0.70, shadow: false, small: true },
  stump: { h: 0.60, shadow: true, small: true, aspect: 2.52592593, drawn: 0.96480938 },
};

// Trees, bushes and stumps only — the small stuff is merged ground cover. Every
// one of these is a draw call, so this is the knob to turn down if a phone
// struggles.
//
// Counted for a globe.radius of 8. It is a count over a fixed area, so shrinking
// the planet without shrinking this crowds it: scale by the square of the radius
// change to hold the spacing you already had.
const SCENERY_COUNT = 58;
const GOLDEN_ANGLE = 2.3999632297;

// Dealt round-robin across the scatter, so the mix is even without needing a
// second random stream. Bushes take two slots because two of anything on a
// planet this size is thin, and repetition is what gives scenery away.
//
// THERE ARE NO ROCKS ON THIS PLANET, and the empty slot below is how they went.
// The whole kind is gone — no drawing, no painter, no palette entry — and the
// spot it used to take is now simply left bare.
//
// A hole rather than a shorter list, and that is the point of it. Closing the
// gap looks tidier and is not the same change: the slot a spot gets is `i % n`,
// so dropping an entry re-deals every prop on the planet — and it re-deals them
// unevenly, because each kind keeps a different berth from the landmarks and the
// tree's is much the widest. Measured, going to four slots cost four trees and
// gained four stumps, which is a lot of world to rearrange for the sake of
// deleting a rock. Left as a hole, everything else stands exactly where it stood
// and one spot in five is now grass.
//
// Shortening SCENERY_COUNT instead would have been worse again: the spiral is a
// function of how many points it is asked for, so every prop would have moved.
const PROP_TYPES = ['tree', 'bush1', null, 'bush2', 'stump'];

// Where one kind has several drawings they share a single slot and take turns
// inside it. Giving each drawing its own slot would mean a second tree drawing
// doubled the number of trees, when what it should do is vary the trees that
// are already there.
const PROP_VARIANTS = {
  tree: Array.from({ length: TREE_VARIANTS }, (_, i) => `tree${i + 1}`),
};

// The camera's near plane, named because two unrelated things now depend on the
// same number and a silent disagreement between them is invisible until you are
// stood inside a tree. The camera below is built with it, and solidRadius keeps
// the leaves that far off your eye.
const NEAR_PLANE = 0.3;

// How wide a prop stands in the way, in world units, or 0 for one you may walk
// through. See SOLIDS in sphere.js for why anything is solid at all; this is
// only the table of which and how wide.
//
// `w` is the card's full drawn width and is what the passable kinds would have
// used, which is precisely why the solid ones do not. A tree's drawn width is
// its CANOPY, and a canopy is not a thing you walk into — the collision comes
// off the built trunk instead, at the height where the roots meet the grass.
//
// THE BUSHES ARE DELIBERATELY NOT HERE. They are the one outdoor prop where
// walking through reads as brushing past rather than as the thing not being
// there: knee-high, soft, and still a card rather than built geometry, so there
// is no trunk to take a radius off and nothing under the drawing to bump into.
// The flowers, mushrooms and grass are not here either, and never could be —
// they are merged ground cover with no per-prop position to register.
//
// The bench is measured off its drawing's ink and not its canvas, the same way
// the landmark footprints are, because the margin a painter happens to leave
// around a bench is not part of the bench. It takes `canvasFor` rather than a
// canvas because it is the ONLY kind here that wants one — the built kinds
// answer from their own geometry and have no drawing left to ask — and handing
// the lookup in keeps this the one branch that touches a pixel.
function solidRadius(type, h, w, canvasFor) {
  if (PROP_VARIANTS.tree.includes(type)) {
    // Roots or leaves, whichever reaches your eye first — worked out from the
    // built profile rather than from either one of them, see treeSolidRadius.
    // Standing height up to the top of a hop, because the eye is at every one
    // of those heights during a jump and the tightest is not always the apex.
    return treeSolidRadius(
      h,
      CONFIG.camera.eyeHeight,
      CONFIG.camera.eyeHeight + CONFIG.player.hopHeight,
      NEAR_PLANE,
    );
  }
  if (type === 'stump') return stumpRadius(h);
  if (type === 'bench') {
    const cv = canvasFor(type);
    const b = sheetBounds(cv);
    return (w * ((b.maxX - b.minX + 1) / cv.width)) / 2;
  }
  return 0;
}

// Props with a second drawing for after dark, keyed by the sprite key of the
// lit version. It gets its own card over the daylight one and cross-fades in,
// rather than replacing the texture, because a swap is a cut and this is a
// house turning its lights on.
//
// The lit sheet is NOT tinted with everything else. The tint is the thing that
// turns a daylight drawing into a night one — it is why the grass goes blue —
// and this drawing has already been through that by hand. Multiplying it again
// would bury the very windows it exists for.
const NIGHT_ART = { house: 'houseNight' };

// ...and what those lit windows throw onto everything around them. Two layers,
// because neither can do the other's job.
//
// `pool` lies on the grass and is what actually answers "light the surrounding
// area". `reach` is a multiple of the prop's own width, for a lamp that is its
// own light source — a card with a lantern painted on it throws from where it
// stands, so its pool starts at its feet.
//
// `spill` is for a lamp INSIDE A BUILDING, and is a multiple of the wall's
// radius instead. It is a second number because the house needs a different
// question answered: not "how far does this throw" but "how far past the wall
// does what gets out carry". The pool used to be cut by `reach` off the drawn
// card, and when the house stopped being a card and became a 3.2-unit dome that
// number went stale in the worst way — the patch came out 8.8 units across with
// its bright half UNDER the building, so the only part you could see was the
// flat tail, spread evenly over more grass than fits on screen. It read as no
// light at all. Tied to the wall, the bright ring lands at the foot of the wall
// where it belongs, and a resized house takes its halo with it.
//
// `bloom` is the light in the air, and it is drawn IN FRONT of the house rather
// than behind it. Behind was the obvious way round and it does not work: a
// glow centred on a four-unit opaque dome has its whole bright half hidden by
// the dome, and only the faint outer fringe clears the silhouette — measured at
// under a tenth of the strength it was set to, which is to say invisible. It is
// also wrong about what is happening. The lamps are inside; what you can see of
// them is the light coming OUT of the door and the window, over the wall around
// them and into the air in front. So the bloom sits on the openings — see
// litSpot, which finds them in the drawing — and its size comes from theirs.
//
// Both are additive, so alpha is brightness ADDED. The bloom's is the number to
// be careful with: it lands on the drawing itself, and much past 0.3 it stops
// looking like a lit doorway and starts bleaching that whole side of the dome.
const LAMP_POOL = { reach: 2.15, spill: 1.35, alpha: 0.52 };
const LAMP_BLOOM = { alpha: 0.28 };

// ...and what the same light adds to anything standing in it, at the centre.
// Below the pool's alpha on purpose: the pool is a decal seen at a grazing
// angle, so its colour lands on the ground thinned by that angle, while this
// goes on a card face-on to you at full strength. Matching the two numbers
// makes the grass brighter than the ground it grows out of.
const LAMP_LIT = { strength: 0.24 };
const LAMP_COLOR = '#FFD489';

// ...and what the SUN adds to a surface turned toward it, at full noon.
//
// A multiplier on the directional light's own intensity rather than a figure of
// its own, so the hour keeps deciding. `dir` in daylight.js runs 1.15 at noon
// down to 0.38 under the moon, which lands this between 0.17 and 0.06 — a clear
// lit side by day and a suggestion of one at night, in the moon's cold blue.
// The colour comes from the same table, so the light on a tree and the light on
// the ground it stands in are the same light.
//
// Modest on purpose, and the ceiling is set by the palest hour rather than the
// brightest. Noon's tint is #FFFFFF: the drawings are already at full strength
// there with nowhere left to go, so anything much above this stops reading as
// sunlight and starts bleaching the art off the lit side.
const SUN_LIT = { strength: 0.15 };

// The lights INSIDE the house, keyed by the furniture art that is one.
//
// A declared list rather than a test on what the builder handed back, and that
// is the whole point of it: a piece is a light because this table says so, so
// nothing can quietly start emitting by growing a `glow` — a stove with a warm
// patch painted under it, a window box with a candle drawn on it. The two named
// here are the two the room has: the lantern somebody lit and the bulb that is
// wired in. NIGHT_ART above is the same declaration for the world outdoors,
// where the house is the only entry, and the sun is the third and last emitter
// in the app — it is a real THREE light and lives on `this.sun`.
//
// Sized off the config rather than off the built pieces because the uniform
// arrays below have to be declared at their final length before a single one
// of them is built. See where NOUT and NIN are counted.
const ROOM_LIGHT = { lantern: true, bulb: true };

// What a room light adds to the surfaces around it, and how fast that dies off
// with distance.
//
// `strength` is above the house's 0.24 rather than below it, which is the
// opposite of what "a small lamp in a small room" suggests and is right for a
// reason that has nothing to do with the lamp. The house's term lands on cards
// standing out on open grass under a whole sky's worth of ambient; this one
// lands on furniture in a shut room where the lamp is very nearly the only
// light there is. The number is what it takes to read as lit against the
// interior's own warm tint, which has already lifted everything in there.
//
// `falloff` is 2.0 and NOT the house's 2.4, and the difference is measured
// rather than chosen. The two pools are painted by different stamps: the wall's
// gradient in paintLampGlow reads 0.30 of full at 0.40 of the radius and 0.08
// at 0.68, which is (1-t)^2.4, while paintItemGlow — the stamp these lights lie
// on — reads 0.34 at 0.42 and 0.09 at 0.70, and that is (1-t)^2.0 to two
// places. art.js says of the second that it falls off with "the same shape" as
// the first; the stops say otherwise, and the stops are what gets drawn. So the
// term follows the stamp it shares a floor with. A lamp whose pool and whose
// light on the furniture disagree about how far it reaches reads as two
// different lamps in one place.
const ROOM_LIT = { strength: 0.30, falloff: 2.0 };

// The tapped-spot marker. `lift` clears the surface by more than a quad this
// wide sags away from it — 1.16 across a globe of radius 8 drops 0.021 at the
// corners — so one flat quad is enough and there is no need for the projected
// cap the lamp pools use. `breatheMs` is slow on purpose: it has to say the
// thing is live without being something you look at.
// `lift` was 0.045 while this was a flat quad, most of which was covering the
// rim's climb away from the surface rather than buying clearance. It is a cap
// now and holds its gap the whole way out, so it sits as low as the shadows do.
const WALK_MARK = { r: 0.58, lift: SHADOW_LIFT, fadeMs: 190, breathe: 0.055, breatheMs: 1500 };

// Where in the dusk-to-dark fade the lamps come up. Below this they are off
// entirely, which is what keeps the lit sheet from ghosting through the whole
// of the evening — the house should be daylit until it plainly is not, and
// then the windows come on.
const LAMP_ONSET = 0.42;

function clampUnit(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

// What a thing standing ON the planet has to add to itself before it can ask
// how far away a lamp is: nothing at all. Shared by every such material rather
// than one zero vector each, since none of them will ever write to it.
//
// The held item is the single exception in the app, and the reason is the bob —
// see where the hand is patched.
const NO_LIFT = new THREE.Vector3();

const _discDir = new THREE.Vector3();

// Scratch for asking where the camera is relative to the house — its anchor in
// the world, and the ray out to the lens. Borrowed once at build time to hold
// the local compass while the house is turned to face its bearing.
const _pw = new THREE.Vector3();
const _pw2 = new THREE.Vector3();
const _spin = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Scratch for shoving the loose furniture about — see nudgeLoose.
const _looseOut = new THREE.Vector3();
const _looseE = new THREE.Vector3();
const _looseN = new THREE.Vector3();
const _looseGo = new THREE.Vector3();
const _looseAxis = new THREE.Vector3();
const _looseQ = new THREE.Quaternion();

// How far the way you are GOING outweighs the way out from under your feet,
// when the two are added up to decide which way a shoved thing goes. Travel
// leads because it is the stable one — see the note at nudgeLoose — and the
// outward term is there for the shove that travel cannot describe, which is the
// one delivered by somebody standing still. At 2.9 a square-on walk sends it
// straight ahead and a glancing pass sends it politely aside.
const LOOSE_LEAD = 2.9;

// Scratch for aiming the sky: where its axis points now, and the small turn
// from there to where it should point.
const _skyUp = new THREE.Vector3();
const _qStep = new THREE.Quaternion();

// Scratch colours for the daylight blend. It runs every frame while a phase is
// changing and touches every tintable sprite, so it allocates nothing.
// How far back from a shore somebody still has something in the water, as an
// angle past the rim. Generous on purpose — the stencil is what actually decides
// whether a reflection is seen, so this is only about not submitting a draw for
// somebody on the far side of the planet.
const REFLECT_ARC = 0.10;
// How much of the water's colour a reflection takes, and how solid it is. A
// reflection in a pond this bright is a suggestion rather than a copy; past
// about half it stops reading as water and starts reading as a second character
// standing upside down under the first.
const REFLECT_MIX = 0.45;
const REFLECT_ALPHA = 0.42;
const _refAway = new THREE.Vector3();

// The tangent direction at `centre` pointing toward `to` — which is what
// lakeReach means by a bearing, since it measures in the lake's own frame.
function tangentToward(to, centre, out) {
  out.copy(to).addScaledVector(centre, -to.dot(centre));
  if (out.lengthSq() < 1e-12) out.set(0, 0, 0);
  else out.normalize();
  return out;
}

const _cA = new THREE.Color();
const _cB = new THREE.Color();
// A third, for the horizon band's haze in _applyBlend — the two above are both
// mid-lerp at the point it runs.
const _cH = new THREE.Color();
const _cT = new THREE.Color();

// Where a pixel of the sky texture actually sits, as a direction in the sky's
// own frame — which `_aimSky` then turns to stand over wherever you are.
//
// This has to match THREE.SphereGeometry's own UV mapping rather than any
// convention of ours, because the dome is one of those: `u` wraps phi, `v` runs
// pole to pole, and the canvas row 0 ends up at the north pole once flipY has
// had its way. Getting it wrong puts the sun somewhere plausible but not where
// the halo painted behind it is, which is a maddening half-degree of drift.
function skyDirFromTexel(px, py, texW, texH, out) {
  const phi = (px / texW) * Math.PI * 2;
  const theta = (py / texH) * Math.PI;
  return out.set(
    -Math.cos(phi) * Math.sin(theta),
    Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
  );
}

// How much further than a landmark's own wall each kind of scenery keeps, in
// world units. Per kind because the point placed is where a thing STANDS and
// the thing has width: a tree's canopy reaches a couple of units from its
// trunk, so a trunk politely outside the wall still lays branches across the
// roof. Keyed by the slot names below, before a tree is dealt its variant.
const LANDMARK_BERTH = { tree: 3.0, bush1: 1.5, bush2: 1.5, stump: 1.3 };

// The wind, which only the grass feels — see swayAndLamp and buildGrassBlades.
//
// Nothing else on the planet moves in it, and that is a decision rather than a
// shortcut. A tree bending would want its trunk to bend with it and its canopy
// to lag, which is a soft-body problem; a card cannot bend at all. Grass is the
// one thing here whose whole shape is "thin and hinged at the bottom", so it is
// the one thing that can be pushed for free.
//
// `axis` is the axle the wind turns about rather than the direction it blows:
// the actual direction at any spot is across it, which is what makes the field
// follow great circles instead of piling up at a pole. It does mean the two
// ends of the axle are still air. That is not avoidable and barely noticeable —
// two patches of a planet where the grass stands quiet.
//
// `amp` is how far a tip travels, in world units, against a blade about 0.3
// tall. `flow` is how tightly the gusts are packed across the planet, and
// `speed` how fast they sweep through. Slow and shallow on purpose: this is a
// place to sit in, and grass thrashing about would be the loudest thing in it.
const WIND = {
  axis: new THREE.Vector3(0.32, 0.91, 0.26).normalize(),
  amp: 0.055,
  speed: 1.35,
  flow: 0.55,
};

// An even spread over the sphere, skipping wherever somebody lives — and,
// since the house grew a real footprint, wherever a landmark stands.
//
// The landmarks used to be invisible to this spiral, and survived on a
// hand-measured spot: the house was moved once to a gap whose nearest prop
// was 2.2 units out, which cleared a card 2.05 wide with room to spare. The
// dome is 2.45 now, so the same measurement put a bush inside the building —
// the number was correct and the assumption under it had moved. Skipping by
// the same footprints the wall and the ground cover use means the three can
// never disagree again, and moving a landmark stops being a dice roll.
function scatter(radius, keepOut) {
  const homes = CAST.map((c) => dirFromLatLon(c.home.lat, c.home.lon, new THREE.Vector3()));
  const clearArc = Math.cos(2.6 / radius);
  const out = [];
  for (let i = 0; i < SCENERY_COUNT; i++) {
    const y = 1 - ((i + 0.5) / SCENERY_COUNT) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * GOLDEN_ANGLE;
    const dir = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);

    // The empty slot — see PROP_TYPES. Skipped before anything else is asked,
    // since a spot with no prop on it has no berth to keep and no lake to avoid.
    const slot = PROP_TYPES[i % PROP_TYPES.length];
    if (!slot) continue;

    let clear = true;
    for (const h of homes) {
      if (dir.dot(h) > clearArc) { clear = false; break; }
    }
    if (clear) {
      const berth = LANDMARK_BERTH[slot] / radius;
      for (const f of keepOut) {
        if (dir.dot(f.dir) > Math.cos(f.r + berth)) { clear = false; break; }
      }
    }
    if (!clear) continue;

    // Nor in a lake. Ground cover resamples until it finds dry ground, but
    // these sit on a fixed spiral, so a lake simply leaves a gap in it — which
    // is right: the alternative is a stump growing out of the middle of a pond.
    // The margin is set by the widest prop at its biggest scale — a bush spans
    // 0.74 units from its trunk — so leaves keep off the water, not just roots.
    if (CONFIG.lakes.some((l) => inLake(dir, l, 0.10))) continue;

    // Only the larger props are billboards; grass and flowers come from the
    // merged ground cover instead.
    const variants = PROP_VARIANTS[slot];
    const type = variants
      ? variants[Math.floor(i / PROP_TYPES.length) % variants.length]
      : slot;
    out.push({ dir, type, s: 0.72 + ((i * 37) % 58) / 100 });
  }
  return out;
}

// Whatever the GPU will give, asked for once and filled in by the Globe
// constructor. Left at 4 until then, which is what every texture used to get
// and is a safe answer on hardware that offers no more.
//
// This matters far more than it sounds for one surface in particular. The
// planet is walked on, so its texture is always seen at a grazing angle, and a
// grazing angle is precisely the case isotropic mipmapping handles worst: a
// screen pixel's footprint on the ground is a long thin ellipse, the mip level
// gets chosen from the LONG axis, and the short axis — the one across the tick
// marks — is blurred by the same amount. At 4 the field's marks smeared into
// directional smudges from about four paces out. At 16 they stay marks.
let MAX_ANISO = 4;

function texFrom(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}

// The sky dome is 180 units across carrying a 1024px texture, so it is always
// hugely magnified. Mipmaps at that ratio smear small marks — the stars — into
// diagonal streaks, so this one samples straight from the base image.
function skyTexFrom(canvas) {
  const t = texFrom(canvas);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

// The four skies, painted once and kept. There are only four and they never
// change, so the alternative — repainting on every phase change — buys nothing
// but a stall at the exact moment the fade is meant to be starting. Night is
// the expensive one: nine thousand stars, each its own fill.
//
// The cost is the four textures resident at once, and at 2048x1024 that is not
// nothing. It is bounded and it is the whole of it, though, and the phase you
// are looking at plus the one you are fading into already accounted for half.
const skyCache = new Map();

function skyTexFor(phase) {
  let t = skyCache.get(phase);
  if (!t) {
    t = skyTexFrom(paintSky(LOOK[phase], SKY_DISC_ART));
    skyCache.set(phase, t);
  }
  return t;
}

// Seeded, so the planet is the same planet on every visit. It would undercut a
// place that remembers when you last came if the grass rearranged itself behind
// your back — and it also means anything that looks wrong can be looked at
// again. mulberry32; any fixed seed will do, it only has to not change.
const WORLD_SEED = 20260726;

// Where ground cover goes. Random, deliberately — the golden-angle spiral this
// replaced is the standard way to spread N points evenly over a sphere, and
// *evenly* is the whole problem: grass grows in clumps with bare ground
// between, while a spiral lays it out as a woven mat, and the lattice is one of
// those things you cannot stop seeing once you have seen it.
//
// y has to be uniform rather than the latitude angle, or the points bunch at
// the poles. Spoken-for ground — the lakes, and the footprints of the two
// landmarks — is skipped by resampling; between them they cover a few percent
// of the sphere, so the guard is only there to stop a bad config spinning
// forever.
function scatterPoints(count, rand, taken) {
  const out = [];
  let guard = count * 50;
  while (out.length < count && guard-- > 0) {
    const y = 1 - 2 * rand();
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const th = rand() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
    if (taken(dir)) continue;
    out.push(dir);
  }
  return out;
}

// Ground cover, and the reason it is not just more billboards: standing on the
// surface you want hundreds of tufts within a few paces, and hundreds of
// billboards means hundreds of draw calls plus hundreds of entries in the
// per-frame sort.
//
// Instead every tuft is two quads crossed in an X, all merged into one
// geometry — one draw call for the lot. Crossed quads never vanish edge-on, so
// they need no billboarding, and cutting them out with alphaTest rather than
// blending lets them render in the opaque pass where the depth buffer sorts
// them for free.
function buildGroundCover(R, dirs, map, w, h, rand) {
  const count = dirs.length;
  const pos = new Float32Array(count * 2 * 6 * 3);
  const uv = new Float32Array(count * 2 * 6 * 2);
  const n = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const base = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let p = 0;
  let q = 0;

  const push = (v, u0, v0) => {
    pos[p++] = v.x; pos[p++] = v.y; pos[p++] = v.z;
    uv[q++] = u0; uv[q++] = v0;
  };

  for (let i = 0; i < count; i++) {
    n.copy(dirs[i]).normalize();
    base.copy(n).multiplyScalar(R);

    t1.crossVectors(up, n);
    if (t1.lengthSq() < 1e-8) t1.set(1, 0, 0);
    t1.normalize();
    t2.crossVectors(n, t1).normalize();

    const scale = 0.72 + rand() * 0.56;
    const hw = w * scale * 0.5;
    const hh = h * scale;

    // Mirror half of them. Swapping the u coordinate costs nothing and makes
    // one drawing read as two, which matters when five of them have to carpet a
    // planet without anyone spotting the repeat.
    const flip = rand() < 0.5;
    const uL = flip ? 1 : 0;
    const uR = flip ? 0 : 1;

    for (const axis of [t1, t2]) {
      a.copy(base).addScaledVector(axis, -hw);          // bottom left
      b.copy(base).addScaledVector(axis, hw);           // bottom right
      const tlx = a.x + n.x * hh, tly = a.y + n.y * hh, tlz = a.z + n.z * hh;
      const trx = b.x + n.x * hh, try_ = b.y + n.y * hh, trz = b.z + n.z * hh;

      push(a, uL, 0);
      push(b, uR, 0);
      pos[p++] = trx; pos[p++] = try_; pos[p++] = trz; uv[q++] = uR; uv[q++] = 1;

      push(a, uL, 0);
      pos[p++] = trx; pos[p++] = try_; pos[p++] = trz; uv[q++] = uR; uv[q++] = 1;
      pos[p++] = tlx; pos[p++] = tly; pos[p++] = tlz; uv[q++] = uL; uv[q++] = 1;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}

// `buildFlatPatches` stood here — one quad per patch, tangent to the surface,
// for the flat flowers that lay on the grass. Nothing lies on the grass any
// more: the field prints its own blooms and the standing cover does the rest.
//
// Two costs went with it, and they are the reason a decal was always the worse
// way to put a mark on the ground. It BLENDED, so it landed in the transparent
// pass and needed a renderOrder picked so a shadow crossing it darkened it
// rather than the other way about; and it needed polygonOffset, because a decal
// a few centimetres above a curved surface is the case the depth buffer handles
// worst and it tore into the hillside in diagonal bands without one. A mark
// painted into the ground texture has neither problem, because it is not above
// the ground — it is the ground.


// The pool of lamplight, as a piece of the sphere rather than a lid laid over
// it. Returned in the frame of the point it is centred on, so it can hang off
// the same anchor the prop does and be culled with it.
//
// A single flat quad would do for something half a unit across, where the ground
// beneath it is flat to within a hair — which is how the flat flowers got away
// with one. A pool of light is several units across, and there the curve is the
// whole story: at 8 units of radius a quad reaching 4 out has its rim 1.0 below the
// surface it is meant to lie on, so the light would stop dead in a hard arc
// wherever the hillside came up through it. Projecting a grid back onto the
// sphere costs one geometry at build time and nothing at all per frame.
//
// 16 segments is chosen against that same sagitta: across one cell of a patch
// this size the ground falls away about four thousandths of a unit, well under
// the lift, so the light sits ON the grass everywhere rather than only at the
// middle.
function buildGlowPatch(R, dir, radius, map, color) {
  const LIFT = 0.05;
  const SEG = 16;

  const n = dir.clone().normalize();
  const base = n.clone().multiplyScalar(R);
  const up = new THREE.Vector3(0, 1, 0);
  const t1 = new THREE.Vector3().crossVectors(up, n);
  if (t1.lengthSq() < 1e-8) t1.set(1, 0, 0);
  t1.normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();

  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, SEG, SEG);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    // The plane lies in its own XY; read each vertex as an offset in the
    // tangent frame, then push it back out to the sphere. Normalising is what
    // makes this a cap instead of a lid — without it the corners stay where a
    // flat quad would put them, which is underground.
    v.copy(base)
      .addScaledVector(t1, pos.getX(i))
      .addScaledVector(t2, pos.getY(i))
      .normalize()
      .multiplyScalar(R + LIFT)
      .sub(base);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map,
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Same bias the shadows carry, and needed for the same reason: a decal a
    // few centimetres above a curved surface is what the depth buffer is worst
    // at, and untreated it tears into the hillside in diagonal bands.
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  }));
  // Above the prop shadows at 3, and below anything standing. Light falling
  // across a shadow should lift it, so it has to come after; light falling
  // across a character's feet should not, so it has to come before.
  mesh.renderOrder = 4;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

// Scenery keeps depth testing: it never deforms, so it cannot be clipped by
// the ground, and the test is what correctly hides whatever is round the far
// side of the planet. Characters are the exception — see character.js.
function sceneryMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map, transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// Shadows sit a hair above a curved surface, which is exactly the case the
// depth buffer is worst at. Bias them toward the camera or they tear into the
// ground in hard diagonal bands when you are stood next to them.
function shadowMaterial(map) {
  const m = sceneryMaterial(map);
  m.polygonOffset = true;
  m.polygonOffsetFactor = -4;
  m.polygonOffsetUnits = -8;
  return m;
}

export class Globe {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
      // ASKED FOR EXPLICITLY, because three.js stopped giving one by default and
      // the failure is silent. Without a stencil buffer every stencil test
      // trivially passes, so nothing errors and nothing warns — the reflections
      // simply drew over the whole planet, the grass included, since they also
      // switch the depth test off and the stencil was the only thing holding
      // them inside the pond. See the note in water.js on what it is for.
      stencil: true,
    });
    this.renderer.setClearColor(new THREE.Color(PAL.skyMid), 1);
    // Before any texFrom() call below, so every texture built in this
    // constructor gets it.
    MAX_ANISO = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    // Near plane well back: nothing is ever closer than about half a unit, and
    // pushing it out buys the depth precision that keeps shadows off the
    // ground from tearing.
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, NEAR_PLANE, 400);

    // The camera joins the scene graph, which it never needed to before: a
    // camera three.js renders FROM can float outside the graph, but a camera
    // with CHILDREN cannot — the held item hangs off it, and children of an
    // orphan are never drawn.
    this.scene.add(this.camera);

    // What you are holding — see hand.js. Its material joins `tintables`
    // below once the list exists, so the card wears the hour like the grass.
    this.hand = new Hand(this.camera);

    this.phase = null;
    this.tintables = [];
    this.tintables.push(this.hand.mat);
    // The multiply colour every unlit sprite is currently wearing. Kept here
    // rather than read back off a material so anything joining mid-fade can
    // match the world it is arriving into.
    this.tint = new THREE.Color('#FFFFFF');

    // How far up the lamps are, 0 to 1, already shaped — see _setLamps. The
    // horizon cull reads it as well as the daylight blend, so it cannot live
    // inside either.
    this._lamps = 0;
    // Lights that belong to a piece of furniture and follow the hour. The
    // house's own lamps are `litProps` and are a different machine — those are
    // painted sheets on the outside of a building; these are meshes in a room.
    this.itemLights = [];
    // ...and the subset of those that are LIGHTS rather than lit things — see
    // ROOM_LIGHT. The two lists overlap and neither contains the other: a lamp
    // that follows the hour is in both, a lantern somebody lit is only in this
    // one, and a piece with a glow that is not a light source would be only in
    // the other. `itemLights` is about a piece's own glass and halo; this is
    // about what the piece does to the rest of the room.
    this.roomLights = [];
    this.litProps = [];
    this.cast = [];
    // The lamp curve as the hour last left it, and how much of it is actually
    // switched on. Kept apart so either can change without the other being
    // recomputed from something that has moved on: the hour turns on its own,
    // and somebody walking through the front door is not the hour.
    this._lampAt = 0;
    this._occupancy = 1;

    // Everything overhead lives in one group, and that group belongs to you
    // rather than to the world: `_aimSky` turns it every frame so its axis is
    // whatever you are stood on. Two domes, the starfield and the sun/moon
    // cards all go in, because they are one picture and any of them left behind
    // would come apart from the rest — most obviously the halo, which is
    // painted into the dome at the same place the card is hung.
    //
    // This is the only honest way to have a sky on a planet 8 units across. A
    // real sky does not shift as you walk because it is effectively infinitely
    // far off; this dome is 180 units, barely twenty planets, so walking a
    // quarter of the way round used to swing the sun below the horizon and put
    // the pale part of the gradient over your head. Hanging it off the anchor
    // is the same thing as pushing it out to infinity, and costs one quaternion
    // a frame instead of a dome the size of the far plane.
    this.skyRig = new THREE.Group();
    this.scene.add(this.skyRig);

    // Two domes, so an hour can cross-fade into the next instead of cutting.
    // The transition state lives in `blend`; see setDaylight.
    //
    // Their depth settings differ, and have to. A is the backdrop: depth test
    // off so it paints the whole frame before anything else, exactly as the
    // single dome always did. B has to be transparent to fade in, which puts it
    // in the transparent pass — *after* the planet — so it needs the depth test
    // ON or it would paint straight over the world. Sitting at 180 units it
    // then survives only where nothing nearer has been drawn, which is precisely
    // the sky. Both together mean the cross-fade happens in the sky and nowhere
    // else.
    const skyGeo = new THREE.SphereGeometry(180, 40, 22);
    this.skyA = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
      map: skyTexFor('noon'), side: THREE.BackSide,
      depthWrite: false, depthTest: false,
    }));
    this.skyA.renderOrder = -12;
    this.skyA.frustumCulled = false;
    this.skyRig.add(this.skyA);

    this.skyB = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
      map: null, side: THREE.BackSide, transparent: true, opacity: 0,
      depthWrite: false, depthTest: true,
    }));
    this.skyB.renderOrder = -11;
    this.skyB.frustumCulled = false;
    this.skyB.visible = false;
    this.skyRig.add(this.skyB);

    this.stars = this._buildStars();
    this.skyRig.add(this.stars);

    // ------------------------------------------------------- the far distance
    //
    // Mountains and a treeline, hung on the sky rather than stood on the planet
    // — see paintHorizon for why that is the honest arrangement rather than a
    // cheat. Because it rides the sky rig, which is re-aimed at your zenith
    // every frame, the range is on your horizon wherever you walk. It never
    // comes closer, which is exactly what the reference frames do with it.
    //
    // WHERE THE BAND SITS is the whole of the geometry, and it is worked out
    // rather than nudged. Stood at eye height on a planet this small the limb is
    // 34.4 degrees BELOW level — see the note in CONFIG.camera — and on a dome
    // of this radius, seen from a camera 9.7 out from the middle, that lands at
    // about 122 degrees of polar angle. So the band runs from 104 to 130: the
    // hills occupy the sky above the limb, and everything past it is buried
    // behind the planet by the depth test, the way a real range has its feet cut
    // off by the near hillside.
    //
    // Transparent and depth-tested for that reason, and drawn after both sky
    // domes: `skyA` does not depth-test at all, so anything sharing the opaque
    // pass with it would be painted straight over.
    const HORIZON_FROM = 104 * (Math.PI / 180);
    const HORIZON_SPAN = 26 * (Math.PI / 180);
    // Repeat rather than clamp, which is what lets the filter sample ACROSS the
    // wrap. The band's shapes are periodic by construction, but canvas has no
    // wraparound when it antialiases, so the two edge columns end up a pixel out
    // of step — measured at a dozen rows of 512, nearly all of them at an alpha
    // under 16. Wrapping hides the rest.
    const horizonTex = texFrom(paintHorizon());
    horizonTex.wrapS = THREE.RepeatWrapping;
    this.horizon = new THREE.Mesh(
      new THREE.SphereGeometry(170, 128, 16, 0, Math.PI * 2, HORIZON_FROM, HORIZON_SPAN),
      new THREE.MeshBasicMaterial({
        map: horizonTex,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        depthTest: true,
      }),
    );
    this.horizon.renderOrder = -10;
    this.horizon.frustumCulled = false;
    this.skyRig.add(this.horizon);
    // NOT in `tintables`, and it is the one outdoor surface that is not.
    //
    // The hour's tint is a multiply, which is the right model for something you
    // could walk up and touch: evening warms it, night cools it, and it keeps
    // its own colour underneath. The range does not work that way, because
    // there is thirty miles of air in front of it. What distance does is not
    // darken a hill, it REPLACES it — the further off, the more of what you see
    // is the air rather than the thing, until the furthest ridge is only very
    // slightly not-sky.
    //
    // Tinted like the grass it looked right at noon and wrong at every other
    // hour, most of all at night: a lavender range and a bright green treeline
    // standing out CRISPLY against a dark blue sky, reading not as far away but
    // as a sticker on the window. So it takes the tint and is then washed toward
    // the sky's own colour at its foot by `haze` — see LOOK in daylight.js.
    this._hazeMat = this.horizon.material;

    // `t` is how far between `from` and `to` the world currently is, and `goal`
    // is where it is heading. They are separate because a scrubbed release has
    // to be able to settle *backwards* — you drag a third of the way into night,
    // let go, and it should fall back to evening rather than carry on.
    this.blend = {
      t: 1, goal: 1, rate: 0, ease: false,
      from: null, to: null, fromPhase: null, toPhase: null, swapDisc: false,
    };
    this.pending = null;
    this._seg = -1;

    // The sun and the moon, when they are drawn art rather than a painted disc.
    //
    // A card facing you, not a mark in the sky texture, and the reason is that
    // texture's dimensions: 1024px wrapped around a 180-unit dome with mipmaps
    // deliberately off, which magnifies anything painted into it about nine
    // times. A soft gradient disc survives that; a drawing does not. Being
    // equirectangular it also squeezes a circle to 76–86% of its width
    // depending how high it sits — unnoticeable on a featureless disc, obvious
    // on a moon with a face. A camera-facing card has neither problem.
    //
    // Depth test ON, and the renderOrder is only half the story — the same trap
    // the fading dome and the stars are already out of. Being `transparent` puts
    // the card in the pass *after* every opaque object, and renderOrder sorts
    // within a pass, not across them: -9 does not get it in front of the planet,
    // it gets it first among the transparent things drawn once the planet is
    // already down. So without the test it paints straight over the ground, and
    // the sun or moon sits on the grass whenever it has gone round the back.
    //
    // The painted disc it replaced was never doing this by renderOrder either —
    // it was a mark in skyA's texture, and skyA is genuinely opaque, so it does
    // render before the globe. A card needing alpha for its margins and opacity
    // for the cross-fade cannot be opaque, so that route is closed and the depth
    // test is what covers it instead. Nothing out at sky distance writes depth
    // (skyA, skyB and the stars are all depthWrite: false), so at 170 units the
    // card still passes wherever the sky is — measured as zero pixels changed
    // with the disc in view, at all four hours, first person and from orbit.
    this.discA = null;
    this.discB = null;
    if (SKY_DISC_ART) {
      // Measured from the drawn disc, not from the sheet it was drawn on. The
      // two drawings leave different margins — 695x607 of sun on one, 674x634
      // of moon on the other — so sizing by canvas would put the moon a tenth
      // larger than the sun for no reason the eye can justify. `discR` should
      // mean the same thing whatever the crop.
      const discArt = (img) => {
        const canvas = paintSheet(img);
        const b = sheetBounds(canvas);
        return {
          tex: texFrom(canvas),
          w: canvas.width,
          h: canvas.height,
          drawn: Math.max(b.maxX - b.minX + 1, b.maxY - b.minY + 1),
        };
      };
      this.discTex = { sun: discArt(IMG.sun), moon: discArt(IMG.moon) };
      const discGeo = new THREE.PlaneGeometry(1, 1);
      const makeDisc = (order) => {
        const m = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
          transparent: true, depthTest: true, depthWrite: false,
        }));
        m.renderOrder = order;
        m.frustumCulled = false;
        this.skyRig.add(m);
        return m;
      };
      // A pair for the same reason the dome is a pair — but only used as one
      // when the drawing actually changes. Sun to sun, the card stays single
      // and its colour, size and place are interpolated instead: cross-fading
      // two suns a few degrees apart would read as a double exposure.
      this.discA = makeDisc(-9);
      this.discB = makeDisc(-8);
      this.discB.visible = false;
    }

    this.world = new THREE.Group();
    this.scene.add(this.world);

    // The globe is the one lit surface in the scene. Unlit it would read as a
    // flat disc — the soft terminator is the only thing that says "sphere".
    // The sprites stay unlit, which is exactly the paper-on-a-3D-world look.
    this.ambient = new THREE.AmbientLight(0xffffff, 1.55);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff6e0, 1.15);
    this.sun.position.set(-4, 6, 7);
    this.scene.add(this.sun);

    // ...and the same light again, in a form the unlit things can read.
    //
    // The light above reaches exactly one object in the app — the globe, which
    // is the only Lambert surface there is. Everything standing on it is a flat
    // colour times the hour, so until now the sun lit the ground and nothing
    // that grew out of it: a tree on the bright side of the terminator and one
    // on the dark side were the same tree.
    //
    // Making them Lambert is the fix that does not work, and the reason is
    // written twice already — at the house's skin below and at fillMat in
    // furniture.js. The sun is a FIXED direction and the planet is a ball, so
    // half of it faces away permanently; a lit surface over there renders in
    // shadow at every hour, whatever the clock says. The house is on that side.
    // Both notes reached the same verdict and stopped there.
    //
    // What they were both really objecting to is DARKENING. So this only ever
    // adds. A surface turned toward the sun gets a little of its colour laid on
    // top of the hour's tint; a surface turned away gets exactly nothing and
    // stays the drawing it has always been. Nothing can come out browner than
    // it started, the far side of the planet is untouched, and what appears is
    // the one thing that was missing — a lit side.
    //
    // Fixed once and never updated, which is only safe because of something
    // worth stating: `world` bobs but never turns. Every other frame of
    // reference here moves — the sky rig is aimed at your feet, the camera
    // orbits — and if the planet ever started rotating, this would have to be
    // re-read each frame or every shadow on the planet would point the wrong
    // way.
    this.sunUniforms = {
      uSunDir: { value: this.sun.position.clone().normalize() },
      uSunTint: { value: new THREE.Color(0xfff6e0) },
      uSunLevel: { value: 0 },
    };

    const R = CONFIG.globe.radius;
    this.ground = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshLambertMaterial({ map: texFrom(paintGlobe()) }),
    );
    this.ground.renderOrder = 0;
    this.world.add(this.ground);

    // THE WATER, built rather than stamped — see water.js. What the ground
    // texture under it holds is the bed, not the pond.
    //
    // Unlit like everything else standing out here, and that is a decision
    // rather than an oversight. The globe is lit, so it carries a terminator
    // that says "sphere"; a lake lying on it would be lit by the same lamp and
    // would go dark on the far side of the planet, which is right for a hillside
    // and wrong for water, whose whole business is throwing the sky back at you.
    // Unlit it stays the colour of the sky it is reflecting wherever it is, and
    // the hour is what changes it.
    // None of their materials join `tintables` — a pond wants three different
    // things from the hour and the plain tint write is none of them. See
    // waterHour, which _applyBlend calls instead.
    this.ponds = CONFIG.lakes.map((l) => buildLake(R, l));
    for (const p of this.ponds) for (const m of p.meshes) this.world.add(m);

    // The fish, and only in the LAKE — the lakes note in config.js has
    // promised them a big pond since it was written, and the second one is
    // small enough that a shoal in it would be a bucket. Built after the water
    // because they draw against the stencil it stamps; see fish.js.
    this.fish = new FishSchool(R, this.ponds[0]);
    for (const m of this.fish.meshes) this.world.add(m);

    const shadowTex = texFrom(paintShadow());
    // One stamp for every lamplit thing on the planet, in both the places light
    // lands: on the grass and in the air. It is drawn white and coloured at the
    // material, so a second lamp in another colour costs nothing.
    const glowTex = texFrom(paintLampGlow());
    // ...and the same stamp with its middle knocked out, for the lamps that
    // live inside a building. Cached by where the wall falls rather than made
    // per prop, so two houses the same size share one upload — and so the
    // ordinary centred stamp above is handed straight back when there is no
    // wall, which is every lamp that is not indoors.
    const rings = new Map();
    const glowRing = (hole) => {
      if (!(hole > 0)) return glowTex;
      const key = hole.toFixed(3);
      let t = rings.get(key);
      if (!t) { t = texFrom(paintLampGlow(Number(key))); rings.set(key, t); }
      return t;
    };
    const source = {
      bench: paintBench,
      // The house is two drawings of one building. `house` is the daylight
      // sheet and takes the ordinary sprite path; `houseNight` is only ever
      // reached through NIGHT_ART, which is why it is not a landmark type of
      // its own — there is one house, wearing one of two faces.
      house: () => paintSheet(IMG.houseDay, false),
      houseNight: () => paintSheet(IMG.houseNight, false),
      // Drawn art. paintSheet only frames it — see art.js. The `false` keeps
      // padding off the bottom edge, which is where these meet the ground.
      //
      // The trees and the stump had rows here and no longer do. They are built,
      // so nothing ever asks for their canvas — but a registration that resolves
      // to `paintSheet(undefined)` is a trap sat waiting for the first caller,
      // and leaving one behind is how a retirement half-happens.
      bush1: () => paintSheet(IMG.bush1, false),
      bush2: () => paintSheet(IMG.bush2, false),
    };

    // Variants, keyed by number so another drawing needs no edit here — only
    // its count in assets.js. Everything standing is flush to its bottom edge;
    // the flat flowers lie down instead, so they take the all-round padding a
    // character sheet gets, there being no ground edge to anchor.
    for (const [prefix, count] of [
      ['flower', FLOWER_VARIANTS], ['mushroom', MUSHROOM_VARIANTS],
    ]) {
      for (let v = 1; v <= count; v++) {
        const key = `${prefix}${v}`;
        source[key] = () => paintSheet(IMG[key], false);
      }
    }
    // Canvases are cached as well as textures, because a sprite's proportions
    // come from its own canvas and the build loop needs to measure it.
    const canvases = new Map();
    const canvasFor = (key) => {
      let c = canvases.get(key);
      if (!c) { c = source[key](); canvases.set(key, c); }
      return c;
    };
    const textures = new Map();
    const tex = (key) => {
      let t = textures.get(key);
      if (!t) { t = texFrom(canvasFor(key)); textures.set(key, t); }
      return t;
    };

    // Everything that stands on the planet, worked out before anything is
    // built. It is only used to raise the cards further down, but two things up
    // here need to know what is coming: the ground cover has to keep off the
    // landmarks' footprints, and the lamplight shader below has to be written
    // for however many lamps there turn out to be. Nothing in it is random —
    // scatter() is a fixed spiral and the landmarks are typed into CONFIG — so
    // asking early costs nothing and changes nothing.
    // `s` defaults to 1, so a landmark is its drawing at the size that drawing
    // is normally used. Setting it is how an ordinary prop becomes a landmark
    // without becoming a new kind of thing — see CONFIG.landmarks.
    // Every landmark's stand of ground, measured once and shared by everything
    // that has to respect it: the scenery spiral above, the ground cover below,
    // and the wall you cannot walk through. One measurement, three readers,
    // no way to disagree.
    //
    // Each clears its OWN drawn width rather than a number written here, so the
    // bench clears a bench's worth of ground and a redrawn bench clears whatever
    // it now covers. Taken from the art's alpha bounds and not from the canvas:
    // the margin a drawing happens to leave around itself is not part of the
    // building. The house is the exception — it stopped being a drawing, so it
    // states its radius in CONFIG instead, and a measurement taken off a retired
    // card would be a measurement of nothing.
    const footprints = CONFIG.landmarks.map((l) => {
      const size = SPRITE_SIZE[l.type];
      let r;
      if (l.radius !== undefined) {
        // Stated outright, like the house. Nothing is measured at all — asking
        // the drawing anyway was what kept a retired card's PNG loaded to
        // answer a question its own config had already answered.
        r = l.radius;
      } else if (size.aspect !== undefined) {
        // Built, so both ratios are written down — see SPRITE_SIZE.
        // The scale belongs here too, and forgetting it is the quiet kind of
        // bug: a landmark grown to nearly twice its drawing's size would go on
        // clearing the ground its drawing's size, and flowers would sprout out
        // from under it in a ring exactly as wide as the growth.
        r = (size.h * (l.s || 1) * size.aspect * size.drawn) / 2;
      } else {
        const cv = canvasFor(l.type);
        const b = sheetBounds(cv);
        const w = size.h * (l.s || 1) * (cv.width / cv.height);
        r = (w * ((b.maxX - b.minX + 1) / cv.width)) / 2;
      }
      return {
        dir: dirFromLatLon(l.lat, l.lon, new THREE.Vector3()),
        r: r / R,
        solid: !!l.solid,
      };
    });

    // The same measurement, handed to the one part of the app that has to stop
    // you: what keeps a flower from sprouting through a wall is exactly what
    // should keep YOU from walking through it. Only the solid ones — see the
    // note in CONFIG about why a bench is not a wall.
    setBuildings(footprints.filter((f) => f.solid));

    // Is there a building standing on this spot, and how wide is its wall?
    // Asked twice — once by the lamplight below, which has to know where the
    // light gets out, and once by the house itself, which is built out of the
    // same number — and asked through one function so the halo can never be cut
    // to a wall the building no longer has. 0 for open ground.
    const wallAt = (dir) => {
      const f = footprints.find((x) => x.solid && x.dir.dot(dir) > 0.9999);
      return f ? f.r * R : 0;
    };

    const props = scatter(R, footprints).concat(CONFIG.landmarks.map((l) => ({
      dir: dirFromLatLon(l.lat, l.lon, new THREE.Vector3()),
      type: l.type,
      s: l.s || 1,
    })));

    // ------------------------------------------------------------- lamplight
    //
    // Light that lands on things OTHER than the ground.
    //
    // The pool is a decal: it lights the grass it lies on and nothing else,
    // which passes while it is small and falls apart the moment it is not. A
    // wide pool leaves every tuft, bush and stump standing in it as a dark
    // cutout in a lit clearing — the light reads as a circle painted on the
    // hillside rather than as something coming out of a window.
    //
    // So every card that can stand in lamplight gets a warm term added to it in
    // its own fragment shader, from the same centres and the same reach the
    // pools use. A real THREE light is not an option and never was: these are
    // MeshBasicMaterial on purpose, and even switching them would not help,
    // because a billboard's normal faces the CAMERA rather than the world — a
    // point light would light every card in the scene identically wherever it
    // was put.
    //
    // One uniform block shared by every patched material, so bringing the lamps
    // up is one write rather than a walk over the scene. three.js keys its
    // program cache on onBeforeCompile.toString(), so all of these share one
    // extra compiled program between them and anything unpatched is untouched.
    //
    // Distance is measured through the planet rather than across it, where the
    // pool's painted falloff is measured across. At this reach on this radius
    // the chord is about 4% short of the arc at the very rim, where the light
    // is already down to nothing — far too little to see, and much cheaper than
    // an acos per fragment.
    // Every emitter in the world, in one list, and in a deliberate order:
    // outdoors first, then indoors.
    //
    // That ordering is not tidiness. The two groups share one uniform block —
    // one write brings the lot up — but they must not share one another's
    // light, and the boundary between them is a number the shaders bake in as
    // a loop bound. So "a lamp in the room does not light the lawn" and "the
    // house's own windows do not light its front room" are true because the
    // loop never reaches those slots, rather than because a falloff was tuned
    // until it happened to arrive at nothing.
    //
    // The second of those is the one that needed saying. The house's term is
    // measured from its WALL and clamped at both ends, so everything inside the
    // wall sits at full strength — correct for a bush in the doorway, and a
    // flat wash of warm over every stick of furniture in the room if the same
    // loop were ever allowed to run in there.
    const lampProps = props.filter((p) => NIGHT_ART[p.type]);
    // The room's lights, counted from the same table the interior loop will
    // build them from several hundred lines below. Counted here and not
    // collected because GLSL sizes an array at compile time and the room does
    // not exist yet — and guarded on there being a house at all, since the
    // whole interior is built only if one got scattered.
    const roomLights = lampProps.length
      ? CONFIG.interior.furniture.filter((f) => ROOM_LIGHT[f.art])
      : [];
    const NOUT = lampProps.length;
    const NIN = roomLights.length;
    const N = NOUT + NIN;

    this.lampUniforms = {
      uLampAt: { value: Array.from({ length: N }, () => new THREE.Vector3()) },
      // 1 rather than 0, because this is a divisor. A slot whose light has not
      // been built yet is at level 0 and contributes nothing either way, but a
      // reach of 0 divides by zero on the way to finding that out.
      uLampReach: { value: new Array(N).fill(1) },
      // How far out the falloff starts — the wall this lamp is behind, as a
      // distance from the spot it stands on. 0 for a lamp in the open, and the
      // building's radius for one indoors, so a bush pressed against the house
      // takes the light at full strength rather than at whatever a curve that
      // began under the floor has left by the time it reaches the wall.
      //
      // Always 0 for a room light: in there you are on the same side of the
      // masonry as the lamp is, and there is nothing between you and it.
      uLampInner: { value: new Array(N).fill(0) },
      uLampLevel: { value: new Array(N).fill(0) },
      // ONE colour for every lamp in the app, and it holds only because the
      // two ends were matched by hand: LAMP_COLOR here and PAL.lampGlow, which
      // the room's pools are drawn in, are both #FFD489. That match was a note
      // in config.js and is now load-bearing — a room light in a different
      // colour needs this to become an array before it needs anything else.
      uLampTint: { value: new THREE.Color(LAMP_COLOR) },
    };

    // 2.4 is the painted stamp's falloff, fitted rather than guessed: the
    // gradient in paintLampGlow reads 0.30 of full at 0.40 of the radius and
    // 0.08 at 0.68, and (1-t)^2.4 gives 0.30 and 0.07. Anything standing in the
    // pool therefore brightens at the same rate as the pool under it, which is
    // the whole point — two falloffs that disagree read as a sprite that does
    // not belong to the light it is in.
    //
    // The room's lights are fitted to their own stamp the same way and land on
    // 2.0 — see ROOM_LIT.
    //
    // The lamp's own GLSL, hoisted out of the patcher below so that a SECOND
    // patcher can wear it without the two sharing a function body.
    //
    // That distinction is the whole reason these are constants rather than
    // inline strings. three.js keys its program cache on
    // `onBeforeCompile.toString()`, which is exactly what lets every lamplit
    // material in the scene share one compiled program — and exactly what would
    // hand the grass somebody else's shader if its patcher happened to read the
    // same. Two different function bodies quoting the same strings get two
    // programs, which is what is wanted.
    const LAMP_CARRY = '#include <begin_vertex>\n'
      + '\tvLampAt = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;';
    const LAMP_UNIFORMS = `
      uniform vec3 uLampAt[${N}];
      uniform float uLampReach[${N}];
      uniform float uLampInner[${N}];
      uniform float uLampLevel[${N}];
      uniform vec3 uLampTint;
      uniform float uLampMix;
      varying vec3 vLampAt;
    `;
    // Distance measured from the WALL, not from the lamp — see uLampInner.
    // Clamped at both ends rather than floored at one: inside the wall the
    // distance goes negative, which a bare max() would turn into more than
    // full brightness on anything standing in the doorway.
    //
    // Split from its `#include` so the sun's patcher below can wear the same
    // loop without the two quoting it separately and drifting apart. `uLampMix`
    // is a per-material 1 or 0 — see litBySun, which is the one place that ever
    // sets it to 0.
    // ONE TEMPLATE, two weights, and the split is not a preference — it is what
    // each kind of surface is able to answer.
    //
    // A card cannot say which way it is turned. It billboards, so its normal is
    // wherever you happen to be standing rather than a fact about the bush; a
    // facing term on one would have its lit side swing round to follow you.
    // Those light at full strength wherever they stand, exactly as before.
    //
    // A tree can. It is a lathe with honest normals, so it gets the same
    // half-lambert-squared the room's lamps light the furniture with — soft the
    // whole way round, and nothing at all once a surface has its back to the
    // window. What that buys is the near side of a trunk warm and the far side
    // left to the moon, instead of the whole tree lifting evenly like a lamp
    // had been shone from inside it.
    //
    // Written once and parameterised because the alternative is two copies of a
    // falloff, a wall offset and an exponent that have to agree forever. `w` is
    // 1.0 in the card version, so `w * w` costs it nothing and the two loops
    // stay one loop.
    const lampLoop = (facing) => `for ( int i = 0; i < ${NOUT}; i++ ) {
         vec3 toLamp = uLampAt[ i ] - vLampAt;
         float dist = length( toLamp );
         float t = ( dist - uLampInner[ i ] ) / uLampReach[ i ];
         ${facing
    ? 'float w = clamp( dot( normalize( vLampN ), toLamp / max( dist, 0.0001 ) ) * 0.5 + 0.5, 0.0, 1.0 );'
    : 'float w = 1.0;'}
         outgoingLight += uLampTint * uLampLevel[ i ] * uLampMix * w * w
           * pow( clamp( 1.0 - t, 0.0, 1.0 ), 2.4 );
       }`;
    const LAMP_LOOP = lampLoop(false);
    const LAMP_ADD = `${LAMP_LOOP}
       #include <opaque_fragment>`;

    const litByLamp = NOUT === 0 ? () => {} : (material) => {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.lampUniforms);
        shader.uniforms.uLampMix = { value: 1 };
        shader.vertexShader = `varying vec3 vLampAt;\n${shader.vertexShader}`
          .replace('#include <begin_vertex>', LAMP_CARRY);
        shader.fragmentShader = `${LAMP_UNIFORMS}${shader.fragmentShader}`
          .replace('#include <opaque_fragment>', LAMP_ADD);
      };
    };
    this._litByLamp = litByLamp;

    // ------------------------------------------------- and the same, facing
    //
    // The room's version, which asks a question the one above cannot: not only
    // HOW FAR a surface is from the lamp but which way it is turned.
    //
    // Outdoors that question has no answer worth having. Nearly everything on
    // the grass is a billboard, and a billboard's normal faces the camera — so
    // a facing term out there would brighten every card in the world by the
    // same amount however it stood, which is the same objection that rules out
    // a real THREE light and for the same reason. A room is the opposite case:
    // there is not a single card in it. The table, the futon, the walls and the
    // bulb are all lathes and spheres with honest normals, because in three
    // strides of floor you genuinely walk around a table.
    //
    // So this is where light gets to land on one side of something. It is the
    // difference between a warm circle painted on the floor and a lamp.
    //
    // The normal is carried into WORLD space with mat3( modelMatrix ) rather
    // than through `normalMatrix`, which is the usual route and is wrong here
    // twice over: normalMatrix is view space, and the lamps are in world space
    // because that is where a bobbing planet puts them. Skipping the inverse
    // transpose is safe for the reason it usually is not stated — nothing in
    // this room is scaled unevenly. The anchors carry a rotation and a
    // position, the pieces are built at their final size, and the only scales
    // in furniture.js are baked into geometry before the normals are handed
    // out. A piece given a non-uniform scale would light with its normals
    // skewed, and this is the note that says why.
    const ROOM_CARRY = `${LAMP_CARRY}
      vLampN = mat3( modelMatrix ) * normal;`;
    const ROOM_UNIFORMS = `${LAMP_UNIFORMS}
      uniform float uLampFace;
      varying vec3 vLampN;
    `;
    // `w * w` is half-lambert squared, and the shape is chosen rather than
    // inherited. Plain max( dot, 0 ) puts a hard terminator across every curved
    // surface in a room where nothing else has a hard edge — a lathe turned
    // half away from the bulb gets a crease down it. Half-lambert alone never
    // reaches zero, so the far side of everything lifts and the room flattens
    // back into the wash this is meant to replace. Squared, it is soft the
    // whole way round and still arrives at nothing at exactly the point a
    // surface has turned its back, which is the one place it must.
    //
    // uLampFace is +1 for a surface whose normals point at the room and -1 for
    // one whose point away — which is the wall, drawn from the back faces of a
    // dome. gl_FrontFacing cannot answer this: three.js renders a BackSide
    // material by flipping the winding rather than the normals, so those
    // fragments report as front-facing while their normals still point out into
    // the masonry. It is a uniform and not a #define so that every material in
    // here still shares one compiled program.
    const ROOM_ADD = `vec3 lampN = normalize( vLampN ) * uLampFace;
       for ( int i = ${NOUT}; i < ${N}; i++ ) {
         vec3 toLamp = uLampAt[ i ] - vLampAt;
         float dist = length( toLamp );
         float t = ( dist - uLampInner[ i ] ) / uLampReach[ i ];
         float fall = pow( clamp( 1.0 - t, 0.0, 1.0 ), ${ROOM_LIT.falloff.toFixed(1)} );
         float w = dot( lampN, toLamp / max( dist, 0.0001 ) ) * 0.5 + 0.5;
         w = clamp( w, 0.0, 1.0 );
         outgoingLight += uLampTint * uLampLevel[ i ] * fall * w * w;
       }
       #include <opaque_fragment>`;

    // `face` is the flip above, and it defaults to the common case: a piece of
    // furniture standing in the room with its normals pointing out of it.
    const litByRoom = NIN === 0 ? () => {} : (material, face = 1) => {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.lampUniforms);
        // NOT from the shared block: this one is per material, which is the
        // whole point of it. Assigned after the block so a stray key of the
        // same name could never overwrite it.
        shader.uniforms.uLampFace = { value: face };
        shader.vertexShader = `varying vec3 vLampAt;\nvarying vec3 vLampN;\n${shader.vertexShader}`
          .replace('#include <begin_vertex>', ROOM_CARRY);
        shader.fragmentShader = `${ROOM_UNIFORMS}${shader.fragmentShader}`
          .replace('#include <opaque_fragment>', ROOM_ADD);
      };
    };
    // Where the room's lights will take their slots from, once the interior
    // gets built. Outdoor lamps have already claimed everything below it.
    let roomSlot = NOUT;

    // --------------------------------------------------------- and the sun
    //
    // The outdoor half of the same idea: a surface out on the grass turned
    // toward the sun or the moon takes a little of its colour. See SUN_LIT for
    // the strength and the note beside this.sunUniforms for why it only adds.
    //
    // `max( dot, 0 )` and nothing softer, which is a departure from the room's
    // wrapped falloff and is deliberate. The globe under all of this is a real
    // Lambert surface lit by the real light, so its terminator is a plain
    // cosine; anything standing in the grass that shaded by a different curve
    // would disagree with the hillside it is planted in — brightest where the
    // ground was already dimming, still lit a little where the ground had gone
    // dark. Using the same function the ground uses is what makes a tree belong
    // to the slope it is on.
    //
    // It reaches exactly zero at the terminator and stays there, which is the
    // property the whole thing rests on: the permanently dark half of the
    // planet gets nothing added and looks precisely as it did before.
    //
    // The lamp half is folded in CONDITIONALLY, because GLSL will not accept an
    // array of length zero and `uLampAt[0]` is exactly what a planet scattered
    // without a house would ask for. The sun does not depend on there being a
    // building, so it must still compile when there is not one.
    const SUN_DECL = `${N ? LAMP_UNIFORMS : 'varying vec3 vLampAt;\n'}
      uniform vec3 uSunDir;
      uniform vec3 uSunTint;
      uniform float uSunLevel;
      varying vec3 vLampN;
    `;
    // The facing build of the loop, because everything this patcher touches has
    // a normal — that is the whole reason it exists. See lampLoop.
    const SUN_ADD = `${NOUT ? lampLoop(true) : ''}
       outgoingLight += uSunTint * ( uSunLevel * max( dot( normalize( vLampN ), uSunDir ), 0.0 ) );
       #include <opaque_fragment>`;

    // `lampMix` is 0 for the house and 1 for everything else, and it is the one
    // rule this shares with the cards: a house is not lit by its own windows.
    // A uniform rather than a second patcher so the building and the trees go
    // on sharing one compiled program — see uLampFace, which plays the same
    // trick for the room.
    const litBySun = (material, lampMix = 1) => {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.lampUniforms);
        Object.assign(shader.uniforms, this.sunUniforms);
        shader.uniforms.uLampMix = { value: lampMix };
        shader.vertexShader = `varying vec3 vLampAt;\nvarying vec3 vLampN;\n${shader.vertexShader}`
          .replace('#include <begin_vertex>', ROOM_CARRY);
        shader.fragmentShader = `${SUN_DECL}${shader.fragmentShader}`
          .replace('#include <opaque_fragment>', SUN_ADD);
      };
    };
    this._litBySun = litBySun;

    // ------------------------------------------------------- and whoever walks
    //
    // The cast, who are the one thing in the world that is lit by BOTH sets of
    // lamps — because they are the one thing that goes through the door.
    //
    // Every other surface belongs to a side. A bush is outdoors for good and
    // reads only the outdoor slots; a table is indoors for good and reads only
    // the indoor ones. That split is what keeps the house's own glow off the
    // furniture, and it works because it is decided once, at build time.
    //
    // Nobody can decide it once for Hachiware. So this reads every slot and
    // masks by which side of the wall they are currently on. Without the mask
    // the bug is not subtle: the house's term is measured from its WALL and
    // clamped, so anyone who steps inside is at full strength of it — a flat
    // wash of porch light over somebody standing in their own front room.
    //
    // Distance only, no facing. They are billboards: the card turns to follow
    // the camera, so its normal is wherever you happen to be standing rather
    // than a fact about the character, and lighting by it would have somebody's
    // lit side swing round as you walked past them.
    //
    // `uLampLift` puts the surface back on the planet before the distance is
    // taken, and it is zero for everyone but the held item — see NO_LIFT and the
    // note where the hand is patched.
    const CAST_ADD = `vec3 lampFrom = vLampAt + uLampLift;
       for ( int i = 0; i < ${NOUT}; i++ ) {
         float t = ( distance( lampFrom, uLampAt[ i ] ) - uLampInner[ i ] ) / uLampReach[ i ];
         outgoingLight += uLampTint * uLampLevel[ i ] * ( 1.0 - uLampSide )
           * pow( clamp( 1.0 - t, 0.0, 1.0 ), 2.4 );
       }
       for ( int i = ${NOUT}; i < ${N}; i++ ) {
         float t = ( distance( lampFrom, uLampAt[ i ] ) - uLampInner[ i ] ) / uLampReach[ i ];
         outgoingLight += uLampTint * uLampLevel[ i ] * uLampSide
           * pow( clamp( 1.0 - t, 0.0, 1.0 ), ${ROOM_LIT.falloff.toFixed(1)} );
       }
       #include <opaque_fragment>`;

    // The switch is held on the MATERIAL rather than fetched off the compiled
    // shader, and made before anything is compiled. onBeforeCompile does not run
    // until the character is first drawn, so a handle taken from `shader` would
    // be missing for every frame before that — including the ones where
    // somebody spawns indoors and should already be lit by the room.
    const litByCast = N === 0 ? () => {} : (material, lift = NO_LIFT) => {
      const side = { value: 0 };
      material.userData.lampSide = side;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.lampUniforms);
        shader.uniforms.uLampSide = side;
        // The vector itself, not a copy. For the hand this is `world.position`,
        // which update() rewrites every frame — handing the live object over
        // means the correction follows the bob with nothing to keep in step.
        shader.uniforms.uLampLift = { value: lift };
        shader.vertexShader = `varying vec3 vLampAt;\n${shader.vertexShader}`
          .replace('#include <begin_vertex>', LAMP_CARRY);
        shader.fragmentShader = `${LAMP_UNIFORMS}uniform float uLampSide;
          uniform vec3 uLampLift;\n${shader.fragmentShader}`
          .replace('#include <opaque_fragment>', CAST_ADD);
      };
    };
    this._litByCast = litByCast;

    // ------------------------------------------------------ and what you hold
    //
    // The one thing in the app that is lit while living in view space. It hangs
    // off the CAMERA — see hand.js — so it is already the right distance from
    // every lamp on the planet for free: stand next to the lantern and the fish
    // in your hand is next to it too.
    //
    // Except for the bob, which is the whole reason `uLampLift` exists. The
    // planet floats and the camera does not (main.js says so where the bubbles
    // take the same correction), so a lamp bobs 0.10 up and down relative to
    // your eye while everything standing on the grass beside it holds still.
    // Left uncorrected, a held item next to the lantern breathes: at the reach
    // that lamp has, a tenth of a unit is a fifth of the falloff, which comes
    // out as the thing in your hand pulsing on a seven-second cycle. Adding the
    // world's own offset back on measures the distance the planet would measure.
    //
    // Distance only, and no sun. It is a card that turns with the camera, so
    // its normal is where you are standing rather than a fact about the fish —
    // the same reason the cast get no facing term.
    if (this.hand) {
      litByCast(this.hand.mat, this.world.position);
      this._handSide = this.hand.mat.userData.lampSide;
    }

    // ...and the same again for the one thing that also moves. The grass takes
    // the lamp term AND a wind, and it has to be one patcher rather than two
    // because a material has only one `onBeforeCompile` — set it twice and the
    // second quietly deletes the first.
    //
    // The bend is applied before `vLampAt` is taken, so a blade leaning into
    // the light is lit where it has leaned to rather than where it grew.
    const swayAndLamp = (material) => {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.lampUniforms);
        shader.uniforms.uLampMix = { value: 1 };
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uWindAxis = { value: WIND.axis };
        shader.uniforms.uWindAmp = { value: WIND.amp };
        shader.uniforms.uWindSpeed = { value: WIND.speed };
        shader.uniforms.uWindFlow = { value: WIND.flow };
        shader.vertexShader = `
          varying vec3 vLampAt;
          attribute float aSway;
          uniform float uTime;
          uniform vec3 uWindAxis;
          uniform float uWindAmp;
          uniform float uWindSpeed;
          uniform float uWindFlow;
        ${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           // Which way the wind blows HERE. A tangent field on a ball has to
           // die somewhere — you cannot comb a sphere flat — and the cross
           // product dies smoothly at the two ends of the axis, where the grass
           // is simply still. Left unnormalised on purpose: its length is the
           // sine of the angle to the axis, which IS that falloff.
           vec3 rad = normalize( transformed );
           float ph = dot( transformed, uWindAxis ) * uWindFlow + uTime * uWindSpeed;
           // Two waves rather than one, at frequencies that do not divide, so
           // the gusts never settle into a beat you can count.
           float gust = sin( ph ) + 0.35 * sin( ph * 2.7 + 1.3 );
           transformed += cross( rad, uWindAxis ) * ( aSway * uWindAmp * gust );
           ${LAMP_CARRY.replace('#include <begin_vertex>\n', '')}`,
        );
        shader.fragmentShader = `${LAMP_UNIFORMS}${shader.fragmentShader}`
          .replace('#include <opaque_fragment>', LAMP_ADD);
        material.userData.shader = shader;
      };
    };

    // One generator for the whole world, drawn from in a fixed order, so the
    // planet reassembles identically every load.
    const rand = makeRandom(WORLD_SEED);

    // Where ground cover may not sprout. Two rules, and every scatter wants
    // both, so they are asked as one question.
    //
    // Nothing sprouts in a lake. CONFIG.lakes already drives the water you can
    // see and the characters steering around it; this is its fourth reader, and
    // like the others it asks sphere.js rather than keeping its own arithmetic.
    //
    // Nothing sprouts inside a building either — which it happily did until
    // this was written, because landmarks are placed by hand in CONFIG and the
    // ground cover had never been told they exist. Measured at the house: a
    // flower standing 0.50 units from its centre, which is to say in the
    // doorway, and a white cluster at 0.18, under the floor. `footprints` is
    // measured further up, where the scenery spiral needs it first.
    //
    // The margin is per kind, because the scatter places the point a thing
    // STANDS at and the thing itself has width: a flat cluster reaches 0.36
    // units from its centre at full scale, so a base politely outside the rim
    // still lay petals on the water. Half the widest scale plus a step back,
    // in radians on the globe. It means the same thing to both rules.
    const occupied = (margin) => (d) => (
      CONFIG.lakes.some((l) => inLake(d, l, margin))
      || footprints.some((f) => d.dot(f.dir) > Math.cos(f.r + margin))
    );

    // ------------------------------------------------------------- biomes
    //
    // The other two readers of CONFIG.biomes — the ground texture is the first,
    // over in art.js. All three ask `biomesAt`, so a field cannot be blond in
    // the paint and lush in the planting.
    const _mix = [];
    // How readily anything grows here: 1 on the open meadow, and the biome's own
    // `cover` in the middle of one.
    const coverAt = (d) => {
      let k = 1;
      for (const { biome, w } of biomesAt(d, CONFIG.biomes, _mix)) {
        k += (biome.cover - 1) * w;
      }
      return k;
    };
    // Thinning by REJECTION, folded in beside the lake and footprint rules so
    // there is one predicate deciding whether a spot is available.
    //
    // Worth being clear about what rejection does to the totals: it does not
    // reduce them. A tuft turned away in the dry field is retried somewhere
    // else, so the count asked for is the count planted and the planet's cost
    // does not wander with the config — what changes is WHERE they land, which
    // is the whole point.
    const plantable = (margin) => {
      const busy = occupied(margin);
      return (d) => busy(d) || rand() > coverAt(d);
    };

    // ...and the colour of what does grow. Two greens per tuft, blended off the
    // meadow's pair toward whatever biome it is standing in.
    const _bLow = new THREE.Color();
    const _bHigh = new THREE.Color();
    const meadowLow = new THREE.Color(PAL.grassBladeLow);
    const meadowHigh = new THREE.Color(PAL.grassBladeHigh);
    const bladeShade = (d, low, high) => {
      low.copy(meadowLow);
      high.copy(meadowHigh);
      for (const { biome, w } of biomesAt(d, CONFIG.biomes, _mix)) {
        low.lerp(_bLow.set(biome.blade[0]), w);
        high.lerp(_bHigh.set(biome.blade[1]), w);
      }
    };

    // Grass. Only the height is a decision — 0.30 is what keeps it grass
    // rather than shrubbery.
    //
    // BLADE_TUFTS is the number to turn if the planet looks bald or overgrown.
    // It is a count over a fixed area, so it has to move with globe.radius:
    // halve the radius and a quarter as many holds the same thickness. And it
    // is scattered at random rather than on a lattice, which changes how a
    // count reads as much as the count itself does — random placement clumps,
    // and clumping leaves bare ground that an even spread never does.
    //
    // It is about twice what the drawn tufts this replaced were counted at, and
    // that is not one being denser than the other: those were 320 CARDS, each
    // 0.43 across with a whole tuft painted on it, where a built tuft is nine
    // blades in a clump half that wide. Matching the two numbers left the
    // planet looking mown.
    const grassH = 0.30;
    const BLADE_TUFTS = 620;

    // Blades, in ONE mesh — see buildGrassBlades. The whole count goes in at
    // once, because there are no variants to split it between: a blade's
    // variety comes from its own jitter rather than from which of five drawings
    // it happens to be wearing.
    //
    // This used to sit behind a `CONFIG.grassBlades` flag with the five drawn
    // tuft sheets wired up as the other branch, so the look could be judged
    // both ways. It has been judged. The drawings are archived in
    // `asset/images/legacy/` if anybody ever wants to look at them again, and
    // the switch is gone — it had already become a trap, since the art moved
    // out from under a code path that went on claiming to work. See the note in
    // assets.js about what that cost.
    const covers = [];
    const tuftDirs = scatterPoints(BLADE_TUFTS, rand, plantable(0.045));
    const blades = buildGrassBlades(R, tuftDirs, rand, grassH, bladeShade);

    // 草むしり. The blades are one merged mesh, but they were built tuft by
    // tuft, so each tuft owns a KNOWN, CONTIGUOUS run of vertices — 9 blades
    // of 9 vertices — and pulling one is collapsing its run onto its own root
    // and later letting it back out. The original positions are kept whole
    // (620 tufts × 81 verts × 3 floats, ~600KB, paid once) because regrowth
    // needs somewhere to grow back TO, and recomputing a tuft would mean
    // re-rolling randomness that no longer exists.
    //
    // Nothing here is saved. A plucked patch is cosmetic, like a footprint;
    // reload and the meadow is whole, which is also what regrowMs already
    // promises on a slower clock.
    this._tufts = {
      mesh: blades,
      dirs: tuftDirs,
      per: 0,
      state: new Map(),
    };
    // Vertices per tuft, taken from the buffer rather than restated: restating
    // BLADE.perTuft * (seg*2+1) here would be a second copy of foliage.js's
    // arithmetic, and the two would drift.
    this._tufts.per = blades.geometry.attributes.position.count / BLADE_TUFTS;
    this._tufts.original = blades.geometry.attributes.position.array.slice();
    // The one thing on the planet that moves. Patched here rather than in the
    // loop below, because it takes the wind AND the lamp term from a single
    // patcher — see swayAndLamp — and must not then be given the lamp again.
    swayAndLamp(blades.material);
    // Read by update(), which drives its clock.
    this._grassMat = blades.material;
    this.tintables.push(blades.material);
    this.world.add(blades);
    // Flowers and mushrooms are still drawn crossed quads — one mesh per
    // drawing, height the only decision. Flowers sit a little taller than grass
    // — they are stems — and mushrooms squat at grass height, since the brief
    // for them was "around the size of grass". Counts are totals across a
    // kind's variants.
    //
    // Counts are NOT comparable between kinds, which is the trap here. A flower
    // drawing is a solid blob of colour filling a third of its sheet; a tuft of
    // grass is a few strokes with daylight between them. Matching their numbers
    // matched nothing that shows — 240 flowers against the 320 tufts the grass
    // was then read as a flowerbed with some grass in it. A quarter of that was
    // about where they went back to being something you notice rather than the
    // ground, and 75 has held through the move to blades.
    const FLOWER_COUNT = 75;
    const flowerH = 0.34;
    for (let v = 1; v <= FLOWER_VARIANTS; v++) {
      const key = `flower${v}`;
      const cv = canvasFor(key);
      covers.push(buildGroundCover(
        R,
        scatterPoints(Math.round(FLOWER_COUNT / FLOWER_VARIANTS), rand, plantable(0.04)),
        tex(key),
        flowerH * (cv.width / cv.height),
        flowerH,
        rand,
      ));
    }

    // Scarce on purpose, and scarcer than the first pass at it. Twenty across a
    // whole planet means you can walk for a while without seeing one, which is
    // the point of them.
    const MUSHROOM_COUNT = 20;
    const mushroomH = 0.30;
    // ...and every one of them is pickable, so unlike the flowers they are
    // remembered individually: which drawing, where, and which run of vertices
    // in its mesh. The same arrangement the grass uses — see _tufts — because
    // it is the same problem: one merged mesh, and a way to take exactly one
    // thing out of it and put it back later.
    this._shrooms = { items: [], meshes: [], per: 0 };
    for (let v = 1; v <= MUSHROOM_VARIANTS; v++) {
      const key = `mushroom${v}`;
      const cv = canvasFor(key);
      const dirs = scatterPoints(
        Math.round(MUSHROOM_COUNT / MUSHROOM_VARIANTS), rand, plantable(0.04),
      );
      const mesh = buildGroundCover(
        R, dirs, tex(key), mushroomH * (cv.width / cv.height), mushroomH, rand,
      );
      covers.push(mesh);
      const per = mesh.geometry.attributes.position.count / dirs.length;
      this._shrooms.per = per;
      this._shrooms.meshes.push(mesh);
      mesh.userData.original = mesh.geometry.attributes.position.array.slice();
      for (const [i, dir] of dirs.entries()) {
        // `item` is which of the two drawings this is, and it is what the
        // pouch will be handed — a red one and a brown one are two things to
        // find, not one thing twice.
        this._shrooms.items.push({ dir, mesh, slot: i, item: `kinoko${v}`, gone: 0 });
      }
    }

    for (const cover of covers) {
      this.world.add(cover);
      this.tintables.push(cover.material);
      litByLamp(cover.material);
    }

    // The flat flowers stood here — a hundred white clusters lying on the grass
    // as decals, in six drawings. They are gone, and their job went two ways:
    // the field paints its own blooms now at every distance (see fieldBloom),
    // and up close the standing flowers and the grass blades carry it.
    //
    // What that also removes is the most awkward special case in the lamplight.
    // These were the one piece of ground cover that had to be kept OUT of the
    // lamp term, because they lay at R+0.04 under a light pool at R+0.05 and
    // would otherwise have been lit twice — which on a cluster drawn white is
    // the difference between catching the light and blowing out. Printed into
    // the ground, they are lit exactly once, by the pool lying on them, and
    // nothing has to remember why.

    // The tapped-spot marker: one decal, hidden until there is a walk to mark.
    // Built here rather than made on the first tap, like everything else in this
    // constructor — a texture upload at the moment somebody presses something is
    // a hitch exactly where the eye already is.
    //
    // A holder carrying the orientation and a plane lying down inside it, which
    // is the same split the prop shadows use. Moving the marker is then one
    // position and one quaternion, and the plane never has to know it is on a
    // sphere.
    this.walkMark = new THREE.Group();
    this.walkMark.visible = false;
    this.world.add(this.walkMark);
    this._markMesh = new THREE.Mesh(
      // A cap, like the shadows: this one is 1.16 across and its whole job is
      // to read as a ring drawn ON the ground, which a disc hovering over its
      // own rim cannot do.
      groundCap(CONFIG.globe.radius, WALK_MARK.r * 2, WALK_MARK.r * 2, WALK_MARK.lift),
      // shadowMaterial rather than sceneryMaterial for the polygon offset it
      // adds. A decal a few centimetres above a curved surface is the case the
      // depth buffer handles worst, and untreated this one tears into the
      // hillside in diagonal bands exactly as the shadows did.
      shadowMaterial(texFrom(paintWalkMarker())),
    );
    // Over the flat flowers at -1 and over the ground, under everything that
    // stands on it: you should see the mark through the grass growing in it and
    // never over somebody's feet.
    this._markMesh.renderOrder = 2;
    this._markMesh.material.opacity = 0;
    this.walkMark.add(this._markMesh);
    this.tintables.push(this._markMesh.material);
    this._markOn = 0;
    this._markClock = 0;

    this.sprites = [];
    // Which of these an arrival has to pick its way around — see setScenery.
    // Collected here rather than beside the footprints above because THIS is
    // where a prop's drawn width is known: the scattered ones never had a
    // footprint computed, only the five landmarks did.
    const scenery = [];
    // ...and which of them you cannot walk through, which is a different set
    // measured a different way — see solidRadius above and SOLIDS in sphere.js.
    const solid = [];

    // Which props are built rather than drawn. Each carries its own builder, so
    // adding a kind is an entry here rather than a branch further down; the
    // trees are keyed off TREE_VARIANTS, so a fourth kind needs a fourth green
    // in the palette and nothing else.
    //
    // The seed is the kind's own number, so each comes out with a different
    // scatter of lump and blossom. Without it the three trees would be one tree
    // in three greens, which is the exact thing three separate kinds exist to
    // avoid.
    //
    // This stood behind a `CONFIG.foliage3d` flag with the drawings kept wired
    // up as a fallback. The flag is gone and the drawings are retired, for the
    // reason grass learned the hard way one file over: a switch whose art has
    // been moved is not a switch, it is a boot failure waiting for somebody to
    // trust the comment above it. Trees and stumps are built, full stop; what
    // their cards used to measure is written down in SPRITE_SIZE.
    const built = {};
    for (let v = 1; v <= TREE_VARIANTS; v++) {
      built[`tree${v}`] = {
        build: buildTree, seed: v, leaf: PAL.treeLeaf[(v - 1) % PAL.treeLeaf.length],
      };
    }
    built.stump = { build: buildStump, seed: 60 };
    // A tree's materials and geometry are shared by every tree wearing that
    // drawing, so they arrive here once per tree and must be registered once
    // per drawing. Tinting the same material twice is merely wasted work, but
    // patching its shader twice is not.
    const foliageMats = new Set();
    // Which way each one is turned. Its own generator rather than the world's,
    // because the world's is drawn from in a fixed order to keep the planet
    // reproducible, and taking numbers out of the middle of it would move every
    // blade of grass dealt after this loop.
    const foliageSpin = makeRandom(WORLD_SEED + 613);

    let lampSlot = 0;
    for (const item of props) {
      const size = SPRITE_SIZE[item.type];
      // What this prop will be, decided before anything is measured: a built
      // one takes its shape from SPRITE_SIZE and never touches a drawing, a
      // drawn one reads its own pixels as it always has. `recipe` is read again
      // further down to do the building; it is resolved here because the aspect
      // has to know the answer first.
      const recipe = built[item.type];
      const baked = recipe && size.aspect !== undefined;
      const h = size.h * item.s;
      const w = h * (baked ? size.aspect : (() => {
        const cv = canvasFor(item.type);
        return cv.width / cv.height;
      })());

      // Tall enough to stand between you and somebody — anything shorter than
      // your eye is under the sightline, not across it — and not already a
      // wall, since a wall stops you by itself and the doorstep is deliberately
      // set down hard against one.
      //
      // Stumps fail that height test and are listed anyway. They were put here
      // for a second reader — the player's towed body, which treads around them
      // — and that reader asks SOLIDS now that a stump is one. They stay because
      // a stump between you and a friend is still worth declining, and the
      // arrival pays only a sliver for it: a bearing whose sightline crosses a
      // stump's little circle is given up for the next one round, which at this
      // radius decides nothing.
      if ((h > CONFIG.camera.eyeHeight || item.type === 'stump') && !inBuilding(item.dir)) {
        scenery.push({ dir: item.dir, r: (w / 2) / R });
      }

      // Solidity is decided by kind rather than by height, unlike the sightline
      // test above: a stump is knee-high and stops you, a bush is knee-high and
      // does not. The same guard against a prop standing inside a building,
      // which cannot happen while the scatter keeps its berth but would be a
      // wall inside a wall if it ever did.
      const sr = solidRadius(item.type, h, w, canvasFor);
      if (sr > 0 && !inBuilding(item.dir)) {
        const entry = { dir: item.dir, r: sr / R };
        // ...and whether it is short enough to get on top of. A stump is the
        // only thing out here that is: a tree has no top you could reach and the
        // bench is a card, which is a thing with no top at all — it turns to
        // face you, so a player stood on one would be stood on a line.
        //
        // Both numbers come off the same lathe the stump is built from. `top` is
        // its cut face and `topR` the radius OF that face, which is narrower
        // than the flare that stops you — see groundUnder.
        if (item.type === 'stump') {
          entry.top = stumpTop(h);
          entry.topR = stumpTopRadius(h) / R;
        }
        solid.push(entry);
      }

      // anchor holds position only; the holder takes the camera-facing
      // orientation, and any shadow gets its own frame lying on the surface.
      const anchor = new THREE.Group();
      anchor.position.copy(item.dir).multiplyScalar(R);
      this.world.add(anchor);

      const holder = new THREE.Group();
      anchor.add(holder);
      // No map on a card that will never be shown. The mesh itself stays —
      // the sort, the cull and the lamp term all address props through it, and
      // giving a hidden thing a null texture is a great deal less surgery than
      // teaching four systems that some props have no card at all.
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        sceneryMaterial(baked ? null : tex(item.type)),
      );
      // Sunk by the sagitta of its own base, not stood exactly on the surface.
      // A card's bottom edge is a straight line and a straight line touches a
      // sphere at one point — the ground falls away w²/8R beneath the corners —
      // while the drawings themselves taper to a sliver at their last row
      // (tree-1 touches its bottom edge with 7px of 700). Seen from a distance
      // every prop you check for contact is on the crest, where that one-point
      // kiss backlights into a pale wedge of rim under the trunk. Sinking the
      // card by the sagitta lets the depth test swallow the taper, and the base
      // enters the ground across its width instead. Across every prop and scale
      // this is 2–8% of a card's height, which reads as planted, not short.
      //
      // The mesh sinks rather than the anchor, because the shadow hangs off the
      // anchor at the surface and would go under the ground with it.
      mesh.position.y = h / 2 - (w * w) / (8 * R);
      holder.add(mesh);
      this.tintables.push(mesh.material);
      // The prop catches the lamplight — but not if it IS the lamp. A house is
      // not lit by its own windows; what you can see of them from outside is
      // the bloom, put exactly where they are. Without this the daylight card
      // sitting under the lit one takes a flat 0.24 of warm across its whole
      // face, which nobody sees at midnight and everybody sees mid-dusk, when
      // the two cards are half and half.
      //
      // Shadows never take it either. A shadow that brightened with the lamp
      // would be lit from inside, and the pool lying across it already lifts it
      // by exactly as much as the ground it falls on.
      if (!NIGHT_ART[item.type]) litByLamp(mesh.material);

      if (size.shadow) {
        const shadowHolder = new THREE.Group();
        shadowHolder.quaternion.setFromUnitVectors(UP, item.dir);
        anchor.add(shadowHolder);
        const sh = new THREE.Mesh(
          // A cap rather than a disc — the widest of these is three units
          // across, where a flat quad's rim would stand a further 0.035 clear
          // of the hillside than its middle. See groundCap.
          groundCap(R, w * 0.8, w * 0.8, SHADOW_LIFT),
          shadowMaterial(shadowTex),
        );
        sh.renderOrder = 3;
        shadowHolder.add(sh);
        this.tintables.push(sh.material);
      }

      // Everything that only exists after dark. Built now and left invisible,
      // rather than made on the first nightfall: the lit sheet is a texture
      // upload and the pool is a geometry, and paying for either during a fade
      // would put the hitch exactly where the eye already is.
      let lit = null;
      const nightKey = NIGHT_ART[item.type];
      if (nightKey) {
        const night = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          sceneryMaterial(tex(nightKey)),
        );
        night.material.opacity = 0;
        night.position.y = mesh.position.y;
        night.visible = false;
        holder.add(night);

        // Over the openings, at the size the openings are, both read off the
        // lit drawing. In the card's own frame: x from the middle, y up from
        // its bottom edge — which is not the card's origin, since the card is
        // centred on its middle and then sunk by the sagitta.
        const spot = litSpot(canvasFor(nightKey));
        const bloom = new THREE.Mesh(
          new THREE.PlaneGeometry(w * spot.r * 2, w * spot.r * 2),
          new THREE.MeshBasicMaterial({
            map: glowTex,
            color: new THREE.Color(LAMP_COLOR),
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        bloom.position.x = (spot.x - 0.5) * w;
        bloom.position.y = mesh.position.y - h / 2 + spot.y * h;
        bloom.visible = false;
        holder.add(bloom);

        // The wall this lamp is behind, and how far what gets out carries past
        // it. A lamp in the open has no wall, so `inner` is 0 and this is the
        // reach off its own card exactly as it always was.
        const inner = wallAt(item.dir);
        const reach = inner ? inner * LAMP_POOL.spill : w * LAMP_POOL.reach;

        // ...and the same wall, measured the way the PATCH measures things.
        //
        // The two are not the same number on a globe, and the difference is
        // the whole reason to write this down. `inner` is a distance through
        // the world — the shell is a sphere of that radius centred on the spot
        // the house stands, so its foot is exactly `inner` from there. The
        // patch is laid out across the TANGENT PLANE and projected down, and
        // the ground under the wall's foot has already curved away from that
        // plane, so the foot lands further out across it: 3.41 for a 3.2 wall.
        // Left unconverted the bright ring would sit two tenths INSIDE the
        // building, hidden by the one thing it exists to light.
        const dip = (inner * inner) / (2 * R);
        const flat = inner ? (R * Math.sqrt(inner * inner - dip * dip)) / (R - dip) : 0;
        const pool = buildGlowPatch(
          R, item.dir, flat + reach, glowRing(flat / (flat + reach)), LAMP_COLOR,
        );
        anchor.add(pool);

        // This prop's slot in the shader's lamp arrays. lampProps was filtered
        // out of `props` in the same order this loop walks it, so the nth lit
        // prop built is the nth lamp — and the reach it lights other things
        // with is the reach its own pool was cut to, never a second number.
        const slot = lampSlot++;
        this.lampUniforms.uLampReach.value[slot] = reach;
        this.lampUniforms.uLampInner.value[slot] = inner;

        lit = { night, bloom, pool, slot };
      }

      // A tree or a stump, built rather than hung — see foliage.js.
      //
      // The card is still made and then RETIRED, which is the same arrangement
      // the house is in and for the same reason: everything that walks
      // `sprites` goes on finding what it expects to find, the sort and the
      // horizon cull keep working untouched, and the flag can be turned back
      // off without a second code path existing anywhere to be kept in step.
      let shell = null;
      let trunk = null;
      if (recipe) {
        // Built at the DRAWING's own size and scaled to this prop's, which is
        // what lets thirteen trees share three geometries and a dozen stumps
        // share one. The ink scales with it, and that is right here even though
        // furniture.js argues the opposite for a room: the three landmark trees
        // are the ordinary drawings at nearly twice the size, so a card already
        // grows its line with it, and a big tree drawn with an ordinary tree's
        // line reads as an ordinary tree seen from closer.
        const made = recipe.build(item.type, size.h, {
          ...recipe, spin: foliageSpin() * Math.PI * 2,
        });
        // Two groups, because they answer two questions. The outer one stands
        // the tree up on its patch of hillside and sizes it; the inner one is
        // its own turn on the spot. Both on one object would have the second
        // quietly undo the first — `rotation` and `quaternion` are two views of
        // a single value, and writing either clobbers the other.
        shell = new THREE.Group();
        shell.quaternion.setFromUnitVectors(UP, item.dir);
        shell.scale.setScalar(item.s);
        shell.add(made.group);
        anchor.add(shell);
        // Only a tree has a trunk you can stand inside — see _syncTrunk. A stump
        // is knee-high, so the lens never reaches its wall.
        trunk = made.trunk || null;
        for (const m of made.fills) {
          if (foliageMats.has(m)) continue;
          foliageMats.add(m);
          this.tintables.push(m);
          // The sun's patcher rather than the lamp's, because a tree is the one
          // thing out here with real normals to light — it is a lathe now, not
          // a card. It carries the lamp term too; litBySun does both, which it
          // has to, since a material has only one onBeforeCompile.
          litBySun(m);
        }
        mesh.visible = false;
      }

      // How far past the horizon this one's own height keeps it in view: a
      // tall tree clears the curve a little longer than a stump does.
      this.sprites.push({
        anchor, holder, mesh, lit, shell, retired: !!shell,
        trunk: shell ? trunk : null, treeH: shell ? h : 0,
        normal: item.dir, small: size.small,
        type: item.type,
        horizon: Math.acos(clampUnit(R / (R + h * 0.5))),
        standoff: h / 2,
        seen: true,
      });
    }

    // The ink is one material per colour, shared by every tree wearing it, so it
    // is registered once here rather than inside the loop. It IS tinted, unlike
    // the house's near-black line: at #4A2F2A there is enough colour in it to
    // notice, and thirteen warm brown outlines left behind on a planet that has
    // gone blue read as thirteen trees cut from a different picture.
    if (foliageMats.size) this.tintables.push(...inkMaterials());

    setScenery(scenery);
    setSolids(solid);

    // The house is the one prop you can go INSIDE, so it is the one prop
    // anything outside this file needs a handle on. Its drawn pixels come along
    // for the tap test — the sheet is a dome on a rectangular card, so a quarter
    // of that card is transparent corner, and without the readback a tap on the
    // sky beside the roof would walk you indoors.
    this.house = this.sprites.find((s) => s.type === 'house') || null;

    // What the inside of the house owns: its own tint list (the interior wears
    // its own hour — see tintIn in daylight.js), the seats a guest may take,
    // and one group holding the lot so the horizon cull can put the whole room
    // away with the building it is in. All initialised here so a planet with
    // no house still has empty lists to walk rather than fields to trip on.
    this.interiorTintables = [];
    // The OUTSIDE of the building, as a list of meshes rather than materials:
    // the skin, its ink hull, and the openings' outward faces. Kept apart from
    // the inner wall because the two want opposite things when the camera
    // climbs out through the roof — see the lid in update().
    this.houseOuter = [];
    this.seats = [];
    // Furniture that is not where it was put — see nudgeLoose. Empty unless
    // something in CONFIG.interior.furniture asks to be an `item`.
    this.loose = [];
    // Where the shover stood last frame, so the shove can be given a direction
    // of travel. Null whenever nobody is in a position to shove anything, which
    // is also what stops a walk resumed after a flight counting as one enormous
    // step across the room.
    this._looseWas = null;
    this.interior = null;
    this.tintIn = new THREE.Color('#FFFFFF');
    this._tintInBase = new THREE.Color('#FFFFFF');

    // ------------------------------------------------------------ the house
    //
    // Real geometry, and the only prop out here that is. Everything else you
    // pass by; this is the one you walk AROUND, and a billboard cannot survive
    // that — it turns with you, so circling the building gives no sign you are
    // moving relative to it and the drawn door faces you from every bearing.
    // A door everywhere is a door nowhere, which left the house with no front
    // and you with no way to tell where to walk to find the way in.
    //
    // Its two drawn sheets are retired rather than deleted: the day card and
    // the night card are still built, still cross-faded, and simply never
    // shown. That keeps the whole lamp machinery — the pool on the grass, the
    // bloom in the air, the dusk curve — working untouched while the shape
    // changes underneath it. Lit windows are the follow-up.
    if (this.house) {
      // The same wall the lamplight above was cut to, through the same reader.
      // These were two separate lookups and that is a pairing that only ever
      // breaks silently: a house built to one radius with its halo cut to
      // another is a house with a ring of light sat inside its own front room.
      const rad = wallAt(this.house.normal) || 2.45;
      // Half a circle: the height IS the radius, so there is no second number
      // and no way for the two to drift apart.
      const tall = rad;

      // Stood on the hill, and then TURNED to face where it is meant to face.
      //
      // The first rotation is the shortest one taking the model's up onto this
      // spot's surface normal, and it leaves the building spun about that
      // normal by whatever that shortest path happened to give — which is to
      // say the front door faced an arbitrary direction. The second is the
      // spin that puts the door on its stated compass bearing. Everything on
      // the shell is placed through `tangentAt` off this one quaternion, so
      // the door, the windows, the furniture, the collision gap and the
      // doorstep all turn together and stay agreeing with each other.
      const shell = new THREE.Group();
      shell.quaternion.setFromUnitVectors(UP, this.house.normal);
      {
        const N = this.house.normal;
        // Where bearing 0 currently points, as a tangent...
        const cur = new THREE.Vector3(0, 0, 1).applyQuaternion(shell.quaternion);
        // ...and where it should: the local compass, turned by doorFacing.
        localFrame(N, _pw, _pw2);            // _pw east, _pw2 north
        const f = CONFIG.interior.doorFacing || 0;
        const want = _pw2.clone().multiplyScalar(Math.cos(f)).addScaledVector(_pw, Math.sin(f));
        // The signed turn from one to the other about the normal. Signed via
        // the triple product, because acos alone cannot tell east from west.
        const spin = Math.atan2(N.dot(_spin.crossVectors(cur, want)), cur.dot(want));
        // Post-multiplied, so it turns about the shell's OWN up — which the
        // first rotation has already laid onto the normal.
        shell.quaternion.multiply(_q.setFromAxisAngle(UP, spin));
      }
      this.house.anchor.add(shell);
      this.houseGlow = [];

      // Past the equator and into the ground, not stopped at it. A hemisphere
      // ends on a flat rim, and the planet is not flat: it falls away beneath
      // that rim, and the gap shows as daylight under the wall from any low
      // angle. The skirt carries the same curve further round so the shell
      // enters the ground, the way every card here sinks by its sagitta.
      //
      // WORKED OUT, not chosen. It was 0.22 radians, measured by hand against a
      // 2.45 house — and the drop it has to cover grows faster than the radius
      // does, so the same 0.22 came up short the moment the building grew and
      // the gap would have quietly reopened. A quarter more than the drop, as
      // an angle, so the house can be resized without this being remeasured.
      const drop = R - Math.sqrt(Math.max(0, R * R - rad * rad));
      const SKIRT = Math.asin(Math.min(0.85, (drop * 1.25) / rad));
      const dome = (pad, side) => new THREE.Mesh(
        new THREE.SphereGeometry(rad + pad, 44, 24, 0, Math.PI * 2, 0, Math.PI / 2 + SKIRT),
        side,
      );

      // ----------------------------------------------- the holes in the wall
      //
      // The door and the windows are REAL OPENINGS, cut through every layer of
      // the shell, because the inside of this dome is part of the world: walk
      // at the arch and you walk through it, no swap, no veil, no other scene;
      // look at a window and you are looking through the wall, from either
      // side of it. The cut is made in the textures rather than the geometry —
      // alphaTest discards the shape's pixels, which also discards their
      // depth, so a hole is a hole to the depth buffer too. Cutting the mesh
      // itself was the obvious way and is the wrong one at this tessellation:
      // 44 segments around puts one seam every 0.46 units, and the door is 2.2
      // wide, so a geometric cut is a ragged bite three segments across.
      //
      // Worked out here, before the layers, because every layer needs the same
      // holes: this is the patch arithmetic from `face` below, hoisted so the
      // punched holes and the drawn frames cannot disagree about where the
      // openings are.
      const GROUND = Math.acos(clampUnit(-(drop + 0.05) / rad)) - Math.PI / 2;
      const doorW = CONFIG.interior.doorWidth;
      const doorH = doorW * (DOOR_SHEET.h / DOOR_SHEET.w);
      const dThetaLen = doorH / rad;
      const dThetaStart = (Math.PI / 2 + GROUND) - dThetaLen;
      const dRing = rad * Math.sin(dThetaStart + dThetaLen / 2);
      const dPhiLen = doorW / Math.max(dRing, 0.5);
      // ...and the same for a window, which is square and hangs at a height
      // rather than standing on the ground — the `grounded` false branch.
      const winW = CONFIG.interior.windowSize;
      const wThetaLen = winW / rad;
      const wThetaStart = Math.max(0.05,
        Math.acos(clampUnit(CONFIG.interior.windowHeight / rad)) - wThetaLen / 2);
      const wRing = rad * Math.sin(wThetaStart + wThetaLen / 2);
      const wPhiLen = winW / Math.max(wRing, 0.5);

      // Punch one opening out of a dome-wrapped canvas. Bearings sit a quarter
      // of the way across the sphere's UV layout — phi is measured from +X and
      // bearings from +Z — and everything below is a fraction of the canvas
      // rather than a pixel count, so one helper serves every layer whatever
      // it was painted at.
      //
      // Drawn three times, a canvas width apart, so an opening whose bearing
      // straddles the texture's own seam comes out whole rather than sliced.
      //
      // `shape` traces the cut in the patch's own box, and each one insets
      // itself from the drawing it is cut for: the punched edge carries the
      // texture's jaggies, and the frame's ink has to be able to cover them —
      // a hole cut to the full drawn width would poke out from under its own
      // frame.
      const span = Math.PI / 2 + SKIRT;
      const punch = (canvas, at, phiLen, thetaStart, thetaLen, shape) => {
        const g = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const w = (phiLen / (Math.PI * 2)) * W;
        const top = (thetaStart / span) * H;
        const h = (thetaLen / span) * H;
        const cx = ((at + Math.PI / 2) / (Math.PI * 2)) * W;
        g.save();
        g.globalCompositeOperation = 'destination-out';
        // Its own brush, and this line is load-bearing: destination-out erases
        // by the SOURCE's alpha, and the fillStyle is whatever the painter
        // left behind. The skin's painter leaves its shading gradient — alpha
        // 0 to 0.13 — so the first punch "erased" at thirteen percent and the
        // doorway stayed quietly solid. Any opaque colour is the whole fix;
        // the colour itself never lands anywhere.
        g.fillStyle = '#000';
        for (const wrap of [-W, 0, W]) {
          g.save();
          g.translate(cx - w / 2 + wrap, top);
          shape(g, w, h, H - top);
          g.fill();
          g.restore();
        }
        g.restore();
        return canvas;
      };

      // The arch, cut to the canvas bottom rather than to its own sill: the
      // door is grounded and the skirt below it is buried in the hill, so the
      // cut has to run out through the bottom edge or a lip of wall is left
      // standing across the threshold.
      const archCut = (g, w, h, toBottom) => {
        const iw = w * 0.94;
        g.translate((w - iw) / 2, 0);
        archPath(g, iw, 0, toBottom, iw * DOOR_SHEET.arch);
        g.closePath();
      };
      // ...and the window's glass, at the same inset its frame is drawn on so
      // the stroke — centred on that line, and reaching half its own width
      // inward — laps over the cut.
      const paneCut = (g, w, h) => {
        const m = WINDOW_SHEET.margin + 0.015;
        g.beginPath();
        g.rect(w * m, h * m, w * (1 - m * 2), h * (1 - m * 2));
      };

      // Every opening, out of one layer. The layers differ; the holes do not.
      const punchAll = (canvas) => {
        punch(canvas, 0, dPhiLen, dThetaStart, dThetaLen, archCut);
        for (const at of CONFIG.interior.windowsAt) {
          punch(canvas, at, wPhiLen, wThetaStart, wThetaLen, paneCut);
        }
        return canvas;
      };

      // UNLIT, like every other thing standing on this planet.
      //
      // It was Lambert to begin with and came out brown, and the reason is the
      // one thing about the outdoor lighting that is easy to forget: the sun is
      // a fixed direction, not a thing that goes round, so a good half of the
      // globe is permanently turned away from it. That is deliberate — the soft
      // terminator is the only cue that says "sphere" — and the house happens to
      // stand on the far side of it. A lit surface there renders in shadow all
      // day whatever the hour says.
      //
      // Every prop out here dodges that by being unlit and taking its colour
      // from the daylight tint instead, which is exactly the paper-on-a-3D-world
      // bargain. The house is a bigger piece of paper, not a different rule. The
      // roundness it loses with the lighting is painted back into the skin — see
      // paintHouseSkin — where it is under the artist's control rather than the
      // sun's.
      const skin = new THREE.MeshBasicMaterial({
        map: texFrom(punchAll(paintHouseSkin())), alphaTest: 0.5,
      });
      // The same inverted-hull line the furniture wears, at the weight this
      // needs to still be a line from across a field. Its hole comes from an
      // alphaMap rather than its (nonexistent) map: from inside, back faces of
      // the whole hull are in view, and an uncut hull would fill the open
      // doorway with a slab of ink.
      const hullMask = document.createElement('canvas');
      hullMask.width = 512;
      hullMask.height = 224;
      const hm = hullMask.getContext('2d');
      hm.fillStyle = '#FFFFFF';
      hm.fillRect(0, 0, hullMask.width, hullMask.height);
      const line = dome(0.055, THREE.BackSide);
      line.material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(PAL.houseInk), side: THREE.BackSide,
        alphaMap: texFrom(punchAll(hullMask)), alphaTest: 0.5,
      });
      shell.add(line);
      const body = dome(0, THREE.FrontSide);
      body.material = skin;
      shell.add(body);
      this.tintables.push(skin);
      // ...and it takes the sun, which is the one thing the note above was
      // wrong to give up on. Everything it says about Lambert still holds — the
      // building stands on the far side of the terminator and a lit surface
      // there is a brown surface all day. But that objection is to being
      // DARKENED, and this only adds: the dome gets a warm side where the light
      // actually falls on it and is left exactly as painted everywhere else.
      // The roundness stays the artist's, drawn into paintHouseSkin; this puts
      // the hour's own light on top of it.
      //
      // 0 for the lamp term, and that is the same rule the drawn props are
      // under: a house is not lit by its own windows. What you see of those
      // from out here is the bloom, put exactly where they are.
      litBySun(skin, 0);
      this.houseOuter.push(line, body);

      // The wall you see from the rug: the same dome a hair inside the skin,
      // drawn from its back faces, wearing the room's own wall art. It is what
      // covers the hull's ink from indoors, and what shows through the open
      // door from the grass — the first honest glimpse of the inside of
      // anything this planet has had. Punched like the rest, so the doorway is
      // open from both sides. Tinted by the INTERIOR hour, not the sky's: warm
      // at night, which is the story the lit windows have always told.
      const wallIn = dome(-0.06, THREE.BackSide);
      wallIn.material = new THREE.MeshBasicMaterial({
        map: texFrom(punchAll(paintRoomWall())), side: THREE.BackSide,
        alphaTest: 0.5,
      });
      // The wall wraps the whole way around, so its left edge IS its right
      // edge — without the wrap the seam shows as a hairline, floor to crown.
      wallIn.material.map.wrapS = THREE.RepeatWrapping;
      shell.add(wallIn);
      this.interiorTintables.push(wallIn.material);
      // The biggest surface in the room, and so the one the lamps have most to
      // say about. -1 because this is a dome drawn from its back faces: its
      // normals point out into the masonry, and the side that is actually in
      // the room is the other one. See uLampFace.
      //
      // What it buys is the corner the lantern is standing in. A dome lit from
      // a point off its own centre is brighter on the near arc and falls away
      // round both sides, which is what tells you the light is over THERE —
      // and it is exactly what the flat interior tint cannot say, because a
      // tint is one colour written to the whole wall at once.
      litByRoom(wallIn.material, -1);

      // The openings, IN the shell rather than propped against it. Their
      // bearings are arbitrary but FIXED, which is the whole point — the house
      // finally has a front.
      //
      // Each is a patch of the same sphere the dome is, a hair outside it, with
      // the drawing stretched across the patch. A flat card was the obvious way
      // and it read exactly as wrong as a flat card leaning on a curved wall
      // does in life: tangent at its centre, its corners stood clear of the
      // shell by the sagitta of their own span, and the door looked propped
      // against the building rather than let into it. Curved, the drawing
      // follows the wall because it is made of the wall.
      //
      // The lat/long cut squeezes the drawing a little toward the top — rings
      // shrink as they climb, about 19% over the door's height — which on a
      // round-topped arch and a symmetric window frame reads as perspective
      // rather than as distortion, so it is left uncorrected.
      // Every opening takes a width and its height FOLLOWS THE DRAWING, the
      // same rule every card in the app obeys. It was two independent numbers
      // here at first, and the pair chosen for the door squashed a 200x250
      // drawing onto a patch wider than it was tall — which flattened the round
      // arch into a straightened lid, quietly, because nothing ties two free
      // numbers to a canvas. An aspect cannot drift when it is not written
      // down.
      //
      // `grounded` anchors the opening's bottom edge where the shell meets the
      // hill, and the door needs it because "standing on the ground" is not a
      // height you can name in shell coordinates. The ground at the rim is 0.38
      // BELOW the shell's own base plane — the planet curves away — so a door
      // resting on the equator floats two hand-widths up the wall. Grounded, it
      // reaches into the skirt and comes out fractionally buried, sinking like
      // everything else here does.
      // How far past the equator the sill sits, as an angle.
      //
      // WORKED OUT, not chosen. It was 0.17, measured by hand against a 2.45
      // house, and it went stale the moment the building grew — exactly as the
      // skirt did. The ground falls 0.65 away beneath a rim 3.2 out while the
      // sill only reached 0.54 down, so the door ended up hanging a tenth of a
      // unit clear of the grass. Solved from that drop instead, with a little
      // burial, so a resized house keeps its door standing on the ground.
      // (GROUND itself is worked out up beside the door hole, which shares it.)
      const face = (canvas, at, w, opts = {}) => {
        const h = w * (canvas.height / canvas.width);
        const thetaLen = h / rad;
        const thetaStart = opts.grounded
          ? (Math.PI / 2 + GROUND) - thetaLen
          : Math.max(0.05, Math.acos(clampUnit(opts.y / rad)) - thetaLen / 2);
        const thetaMid = thetaStart + thetaLen / 2;
        const ring = rad * Math.sin(thetaMid);
        const phiLen = w / Math.max(ring, 0.5);
        // A patch of the same sphere the dome is, a hair outside it. Concentric,
        // so it can never intersect the wall it is cut into whatever size the
        // house is.
        //
        // The door was briefly a CONE instead — a face standing upright rather
        // than following the dome — and that is what tore it in two. A cone is
        // a straight chord between the door's top and bottom rings while the
        // dome bulges outward between them, so it only clears if it stands
        // further proud than the bulge. It was pushed 0.14 out against a bulge
        // of 0.153, and the wall came through the middle of the doorway in a
        // ragged seam. Another hand-fitted number that was true for the old
        // house and false for this one.
        //
        // Standing it upright was guarding against a flattened arch, and it
        // turned out not to be the cause of that at all: the crown was being
        // sliced off square by the canvas edge, which archPath now leaves room
        // for. On the sphere the top of a 1.93 door leans back about 25
        // degrees, which foreshortens the arch by a twentieth — invisible, and
        // honest, because it IS a dome.
        //
        // phi is measured from +X toward +Z while the bearings here measure
        // from +Z — the quarter-turn below is that change of chart.
        //
        // `proud` lets an opening stand a little further off the shell than the
        // default hair. The door's ink frame needs it: it lies over the pane,
        // and two patches at one radius would be left to the transparent sort
        // to order, which flickers at grazing angles.
        const geo = new THREE.SphereGeometry(
          rad + (opts.proud || 0.02), 16, 12,
          at + Math.PI / 2 - phiLen / 2, phiLen,
          thetaStart, thetaLen,
        );
        // Negative `proud` puts a patch INSIDE the wall, where it is seen from
        // within — so it renders its back faces and joins one of the interior
        // colour lists instead of the glow. `sink` names which: 'interior' for
        // things that wear the room's hour, 'glass' for the panes that wear
        // the sky's.
        //
        // The alphaTest is load-bearing now that there is something BEHIND an
        // opening to see. A transparent material writes depth for every
        // fragment it rasterises, invisible ones included — so the door
        // frame's empty middle was writing the frame's distance across the
        // whole arch, and whoever stood in the room behind it failed the depth
        // test against nothing. Discarding what is not drawn discards its
        // depth with it: the ink occludes honestly, the opening not at all.
        const m = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({
            map: texFrom(canvas), transparent: true, alphaTest: 0.02,
            side: opts.side !== undefined ? opts.side : THREE.FrontSide,
          }),
        );
        shell.add(m);
        // The exterior openings are NOT tintables. They are the one part of
        // this building that does not simply wear the hour: after dark they
        // are lit from within, and anything in `tintables` has the hour's
        // colour written straight over it every frame of a fade. Their colour
        // is worked out in _syncGlow instead, from the tint AND the lamps
        // together.
        if (opts.sink === 'interior') this.interiorTintables.push(m.material);
        else { this.houseGlow.push(m.material); this.houseOuter.push(m); }
        // An anchor at the opening's centre, facing outward, for anything that
        // hangs in the air in front of it — the door's bloom does.
        const y = rad * Math.cos(thetaMid);
        // Just in front of the opening. It has to clear the door's own patch —
        // an anchor left level with it would hang the bloom behind a surface
        // that writes depth, and the glow would simply never draw.
        const outR = ring + 0.08;
        const grp = new THREE.Group();
        grp.position.set(Math.sin(at) * outR, y, Math.cos(at) * outR);
        grp.lookAt(Math.sin(at) * ring * 4, y, Math.cos(at) * ring * 4);
        shell.add(grp);
        return { grp, mesh: m };
      };
      // The door takes its width from the interior config — one number for the
      // one way in — and the windows stay fractions of the dome.
      //
      // There is NO pane and no glazing on the door any more: the doorway is
      // the hole punched through the shell above, open grass to open room.
      // What stays drawn is the ink around it, once per face of the wall — a
      // frame is what makes a hole read as a doorway, and its stroke also
      // covers the punched edge's jaggies from both sides.
      const doorFrame = face(
        paintHouseDoorFrame(), 0, doorW, { grounded: true, proud: 0.035 },
      );
      this.houseDoor = doorFrame.grp;
      face(paintDoorway(), 0, doorW, {
        grounded: true, proud: -0.10, side: THREE.BackSide, sink: 'interior',
      });
      // ...and the windows exactly the same way, because they are the same
      // kind of thing: a hole with its ink drawn round it, once per face of
      // the wall. They were the last painted pretence on the building — a pale
      // pane where the opening should be, lit warm by the lamp machinery so
      // the house could say somebody was home from across the planet.
      //
      // That signal is not lost by cutting them, it is told honestly instead.
      // An occupied room is warm and an empty one dims (see _syncInterior), so
      // a lit window is now the actual warm room seen through an actual hole,
      // and a dark one is the actual gloom. The light on the grass and in the
      // air outside is unchanged — that was never the glass's doing.
      //
      // What the room gains is the other direction: from the rug, the window
      // is a piece of the real sky, which is a better answer to "what hour is
      // it out there" than a pane painted the sky's colour ever was.
      for (const at of CONFIG.interior.windowsAt) {
        face(paintHouseWindowFrame(), at, winW, { y: CONFIG.interior.windowHeight });
        face(paintHouseWindowFrame(), at, winW, {
          y: CONFIG.interior.windowHeight, proud: -0.10,
          side: THREE.BackSide, sink: 'interior',
        });
      }


      // ----------------------------------------------------- inside the house
      //
      // Everything from here down is the room. It lives in the same world as
      // the grass because it IS the same world: what marks it as indoors is
      // being within the wall's arc, which is the question the collision asks
      // (sphere.js) and the question the tinting asks (_applyBlend). One
      // group, so the horizon cull can put the whole interior away with the
      // building that contains it.
      this.interior = new THREE.Group();
      this.world.add(this.interior);
      const N = this.house.normal;

      // A bearing around the house, as a world tangent at its middle — and a
      // spot on the ground `out` units along one. The same two moves door.js
      // used to make; now everything indoors is placed by them.
      const tangentAt = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
        .applyQuaternion(shell.quaternion);
      const spotDir = (a, out) => {
        const arc = out / R;
        return N.clone().multiplyScalar(Math.cos(arc))
          .addScaledVector(tangentAt(a), Math.sin(arc)).normalize();
      };
      // Stand a thing on the sphere facing a bearing: up is the surface normal
      // under its own feet, forward is the facing's tangent flattened against
      // that up — the identical basis the camera rig builds, so a piece of
      // furniture and the player agree about what "facing the window" means.
      const standAt = (obj, dir, faceBearing) => {
        obj.position.copy(dir).multiplyScalar(R);
        const fwd = tangentAt(faceBearing);
        fwd.addScaledVector(dir, -fwd.dot(dir)).normalize();
        const right = new THREE.Vector3().crossVectors(dir, fwd);
        obj.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(right, dir.clone(), fwd),
        );
      };

      // The floor: one cap of the planet's own sphere, lifted a hair, wearing
      // the room's floor with the rug drawn into it — one canvas, one draw
      // call, and a rim that hides under the wall. Its UVs are made PLANAR:
      // the drawing is a top view of a floor, and the sphere's own latitude
      // wrap would pinch the rug into a teardrop at the middle of the room.
      //
      // Its lift is named, because it is not only the floor's business: a shadow
      // lying on this floor has to be lifted clear of THIS, not of the planet,
      // and a floor that moved without the shadows following would put every
      // one of them underground.
      const FLOOR_LIFT = 0.012;
      const floorArc = Math.asin(clampUnit((rad * 0.99) / R));
      const floorGeo = new THREE.SphereGeometry(
        R + FLOOR_LIFT, 48, 12, 0, Math.PI * 2, 0, floorArc,
      );
      {
        const pos = floorGeo.attributes.position;
        const uv = floorGeo.attributes.uv;
        const planR = (R + FLOOR_LIFT) * Math.sin(floorArc);
        for (let i = 0; i < pos.count; i++) {
          uv.setXY(i, pos.getX(i) / (2 * planR) + 0.5, pos.getZ(i) / (2 * planR) + 0.5);
        }
      }
      const floorCv = document.createElement('canvas');
      floorCv.width = 512;
      floorCv.height = 512;
      const fg = floorCv.getContext('2d');
      // Stretched to fill the square outright. The cap only ever samples the
      // inscribed circle, so the corners are invisible — and a canvas with no
      // transparent pixel anywhere means no fringe of it can be filtered in
      // at the rim.
      fg.drawImage(paintRoomFloor(), 0, 0, floorCv.width, floorCv.height);
      const rugPx = (CONFIG.interior.rug / (rad * 0.99)) * (floorCv.width / 2);
      fg.drawImage(
        paintRug(),
        floorCv.width / 2 - rugPx, floorCv.height / 2 - rugPx, rugPx * 2, rugPx * 2,
      );
      const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({
        map: texFrom(floorCv),
      }));
      floorMesh.quaternion.setFromUnitVectors(UP, N);
      this.interior.add(floorMesh);
      this.interiorTintables.push(floorMesh.material);
      // DELIBERATELY NOT GIVEN THE LAMP TERM, and it is the one surface in here
      // that is not. The boards are already lit, by the pool each lamp lays on
      // them — a painted stamp that knows things the shader does not, chiefly
      // that a lamp standing on a floor shadows the patch it is standing on
      // (see the `hole` in paintItemGlow). Adding the term as well would light
      // the floor twice, and the second helping would fill in exactly the bite
      // the first one took out.

      // The furniture — real geometry, unlit, tinted by the interior hour, and
      // solid now, which it was not. Nothing here billboards: in a room three
      // strides across you genuinely orbit a table, which is the one thing a
      // card cannot survive.
      //
      // Solid AND standable, and it had to be both at once. Solid on its own is
      // what this room spent its life arguing against — in three strides of
      // floor, a table you can neither pass nor climb is a bollard, and the old
      // note here was right that it would read as a bug. What changes the answer
      // is having somewhere for the refusal to send you: bump the table and you
      // hop onto it. A piece you can get on top of is furniture; a piece that
      // only says no is an obstruction.
      const furnitureSolids = [];
      const topTex = texFrom(paintTableTop());
      // The room's own shadow tone, not the planet's. This stamp falls on a
      // grey floor and a cream rug, and the grass-green one every prop outside
      // wears read in here as a patch of lawn that had got under the roof.
      const shadowTex = texFrom(paintShadow(SHADOW_ROOM));
      for (const f of CONFIG.interior.furniture) {
        const built = BUILD[f.art](f.h);
        const dir = spotDir(f.at, f.out);
        const anchor = new THREE.Group();
        if (f.ceiling) {
          // HUNG FROM THE PLASTER. The shell is a sphere of radius `rad` on the
          // floor, so its apex is `rad` straight up the house's own normal —
          // one line, and no bearing at all, because a thing at the middle of a
          // ceiling has no bearing to have.
          //
          // Its up is the room's up, so a piece built downward from y = 0
          // hangs. No `spin` either: a bulb is round.
          anchor.position.copy(N).multiplyScalar(R + rad);
          const right = new THREE.Vector3().crossVectors(N, tangentAt(0)).normalize();
          const fwd = new THREE.Vector3().crossVectors(right, N);
          anchor.quaternion.setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(right, N.clone(), fwd));
        } else if (f.wall) {
          // HUNG, not stood. The shell is a sphere of radius `rad` sitting on
          // the floor, so a height up it is a polar angle off its apex — the
          // same acos the windows are placed by, and for the same reason: one
          // description of where the wall IS, used by everything that touches
          // it.
          //
          // Its up is the room's up and its forward points back at the axis, so
          // a piece built with its back at z = 0 lands flat on the masonry.
          const th = Math.acos(clampUnit(f.y / rad));
          const tan = tangentAt(f.at);
          const out = N.clone().multiplyScalar(Math.cos(th))
            .addScaledVector(tan, Math.sin(th)).normalize();
          // Seated on the face you SEE from the rug, not on the shell's
          // middle. The wall has thickness — the skin sits a little outside
          // `rad` and the inner surface a little inside it — so mounting at
          // `rad` buries the back of the piece in masonry and pushes its far
          // top corner out toward the skin. Measured: the plank's back edge
          // reached 3.251 against an outer skin at 3.255, which is inside by
          // luck rather than by design.
          anchor.position.copy(N).multiplyScalar(R).addScaledVector(out, rad - 0.06);
          const fwd = out.clone().addScaledVector(N, -out.dot(N)).negate().normalize();
          const right = new THREE.Vector3().crossVectors(N, fwd);
          anchor.quaternion.setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(right, N.clone(), fwd));
        } else {
          standAt(anchor, dir, f.spin !== undefined ? f.spin : f.at + Math.PI);
        }
        anchor.add(built.group);
        this.interior.add(anchor);
        for (const m of built.fills) this.interiorTintables.push(m);

        // ...and the piece stands in the room's light — unless it IS one.
        //
        // The same rule the house outside is under, arrived at from the same
        // direction: a lamp is not lit by itself. Here it would be worse than
        // redundant, because a light source's fills are its glass, and the
        // glass is the one material in the room already carrying the state of
        // being lit. Adding a warm term to it would light the bulb from the
        // outside on top of the light it is emitting, which is how you get a
        // switched-off bulb that still glows at midnight.
        //
        // `fills` and not everything on the anchor: the ink hull is left out
        // of that list on purpose, and a pen line that brightened near a lamp
        // would be a drawing whose outline fades where the light is.
        if (!ROOM_LIGHT[f.art]) for (const m of built.fills) litByRoom(m);

        // What somebody left on it, lying on the surface it was left on.
        if (f.clutter) {
          const top = new THREE.Mesh(
            new THREE.PlaneGeometry(built.rx * 1.9, built.rz * 1.9),
            new THREE.MeshBasicMaterial({
              map: topTex, transparent: true, depthWrite: false,
            }),
          );
          top.rotation.x = -Math.PI / 2;
          top.position.y = built.top + 0.004;
          top.material.polygonOffset = true;
          top.material.polygonOffsetFactor = -4;
          top.material.polygonOffsetUnits = -8;
          anchor.add(top);
          this.interiorTintables.push(top.material);
        }

        // No ground shadow for something hung on a wall: it is not on the
        // ground, and a patch of shade on the floor beneath it would be cast by
        // nothing.
        const shadow = (f.wall || f.ceiling) ? null : new THREE.Mesh(
          // A cap, and lifted clear of the FLOOR rather than of the planet: the
          // floor is its own cap a hair further out, so a shadow measured from
          // the ground beneath it would be under the boards. The curve across
          // any one piece of furniture is slight, but the floor keeps curving
          // away across the whole width of the room, and a flat disc could only
          // ever touch it at one point — which is what left these hanging.
          groundCap(R, built.rx * 2.3, built.rz * 2.6, FLOOR_LIFT + SHADOW_LIFT),
          new THREE.MeshBasicMaterial({
            map: shadowTex, transparent: true, depthWrite: false, opacity: 0.42,
          }),
        );
        if (shadow) {
          shadow.material.polygonOffset = true;
          shadow.material.polygonOffsetFactor = -4;
          shadow.material.polygonOffsetUnits = -8;
          anchor.add(shadow);
          // Wears the room's hour, like the floor it is lying on. It was in no
          // tint list at all before, so at dusk it stayed at its daylight value
          // on boards that had gone warm — the one thing lit by nobody.
          this.interiorTintables.push(shadow.material);
        }

        // What the piece does to the room, if it does anything.
        //
        // The builder hands back a `glow` and this makes the light, which is
        // the same split the shadows use: furniture.js knows what a lantern
        // looks like, and this file knows how light lands on a sphere. The pool
        // is a CHILD of the anchor, so a lantern that gets shoved across the
        // floor takes its own light with it and nothing has to remember to move
        // it.
        if (built.glow) {
          const lit = f.lit !== false;
          const pool = new THREE.Mesh(
            groundCap(R, built.glow.reach * 2, built.glow.reach * 2,
              FLOOR_LIFT + SHADOW_LIFT * 1.6),
            new THREE.MeshBasicMaterial({
              map: texFrom(paintItemGlow(built.glow.hole || 0.14)),
              color: new THREE.Color(built.glow.colour),
              transparent: true,
              depthWrite: false,
              // Additive, because light adds. Multiplied it would darken the
              // boards everywhere the stamp is empty, which is most of it —
              // the same reason the water's glints are additive.
              blending: THREE.AdditiveBlending,
              // Below the house's own pools. Those are cast by a whole lit
              // window across open grass; this is one small lamp in a room
              // three strides across, and at 0.52 it read as a puddle of paint
              // rather than as light on boards.
              opacity: lit ? LAMP_POOL.alpha * 0.62 : 0,
            }),
          );
          // Over the floor and its rug, under everything standing on it.
          pool.renderOrder = 2;
          // A hung light's anchor is on the CEILING, and its pool belongs on
          // the boards. `rad` down puts the cap's own origin back on the
          // planet's surface, which is the radius groundCap shaped it for.
          if (f.ceiling) pool.position.y = -rad;
          anchor.add(pool);

          this.interiorTintables.push(pool.material);

          // EVERY LIGHT IS COLLECTED NOW, not only the wired one.
          //
          // This used to read `if (f.night)`, and the lantern's glass was
          // instead written once, just above, on the reasoning that "nothing
          // turns this on and off yet". Something does: both lights have a
          // switch. A piece whose look is set once at build cannot be switched,
          // so the one-off write is gone and the lantern joins the list — what
          // separates the two is now only `night`, which says what a light
          // follows once it is ON rather than whether it is written at all.
          if (f.night || lit) {
            // A piece may hand back one halo or a nest of them — the bulb's
            // bloom is three shells, because a sphere has no axis to fade
            // along. Kept with the alpha each was BUILT at, so dimming is a
            // multiply and the nest keeps its shape all the way down.
            const nest = built.glow.haloes
              || (built.glow.halo ? [built.glow.halo] : []);
            this.itemLights.push({
              pool,
              haloes: nest.map((m) => ({ mesh: m, alpha: m.material.opacity })),
              glass: built.glow.lit,
              // Which piece this is, and whether its switch is on — see the
              // note beside roomLights.push below. `night` here says the same
              // thing it says there: what the light follows once it is on.
              art: f.art,
              switchedOn: true,
              night: !!f.night,
              on: new THREE.Color(built.glow.on || PAL.lampLit),
              off: new THREE.Color(built.glow.off || PAL.lampGlass),
              poolAlpha: LAMP_POOL.alpha * 0.62,
              // Only glass has these; a solid pane stays as opaque as it was
              // built, and `undefined` here is what says so.
              dim: built.glow.dim,
              bright: built.glow.bright,
            });
          }

          // ...and its place in the shader's light list, if the piece is a
          // light rather than a thing with a glow painted under it. See
          // ROOM_LIGHT, which is the whole of what decides.
          if (ROOM_LIGHT[f.art]) {
            const slot = roomSlot++;
            // Where the light actually IS, which is nowhere near where the
            // piece is anchored: the lantern's glass sits a third of the way
            // up its own body, and the bulb's hangs a whole flex-length BELOW
            // the plaster it is fixed to. Left at the anchor, the bulb would
            // light the room from inside the ceiling.
            //
            // An empty object parented to the anchor rather than an offset
            // kept in a field, so the answer survives the piece being turned,
            // hung upside down off a ceiling, or shoved across the floor by
            // somebody's foot — see the per-frame read in update().
            const at = new THREE.Object3D();
            at.position.y = built.glow.at || 0;
            anchor.add(at);
            // What it lights the room with is the reach its own pool was cut
            // to, never a second number — the same rule the house's lamps are
            // held to, and what keeps a lamp and the patch of floor under it
            // agreeing about how far the light gets.
            this.lampUniforms.uLampReach.value[slot] = built.glow.reach;
            const level = lit ? ROOM_LIT.strength : 0;
            this.lampUniforms.uLampLevel.value[slot] = level;
            // `night` is the switch, and it is the difference between the two
            // lights in this room: the bulb is wired in and follows the hour,
            // the lantern is lit because somebody lit it and burns at all of
            // them. The slot is taken either way — and by a lamp switched off
            // entirely, which simply sits at level 0. The arrays were sized
            // off this same config, so skipping one here would slide every
            // later light a place along and hand the bulb the lantern's reach.
            // `on` is the SWITCH, and it is a third thing on top of the two
            // above. `night` says what the light follows when it is on; `lit`
            // said what it was doing at build time; this says whether it is
            // working at all, and it is the only one of the three anybody can
            // change from inside the world. Both lists carry it and both read
            // it the same way — see _syncItemLights.
            this.roomLights.push({
              at, slot, level, night: !!f.night, art: f.art, on: true,
              // A hung light has no bearing — see `ceiling` in the furniture
              // table — so nothing can stand near it or far from it, and
              // `lightNear` treats being in the room as being under it.
              ceiling: !!f.ceiling,
            });
          }
        }

        // Somewhere to sit. `top` comes back from the builder, so a redrawn
        // or resized piece moves its own seat without a number following it.
        if (f.seat) this.seats.push({ dir, y: built.top, taken: null });

        // ...and the one piece that is not nailed down. It keeps its own copy
        // of where it is, because `dir` above is shared with the seat list and
        // a piece that moved would drag a cushion's position with it.
        //
        // `place` is a closure rather than data, so the mover below needs to
        // know nothing about bearings, tangents or the shell's rotation — all
        // of which live in this scope and none of which want copying out of it.
        // It re-stands the piece exactly the way it was stood in the first
        // place, so a shoved bear is placed by the same code as an unshoved one.
        // Something to walk into and stand on. Not the loose one: a bear you
        // could not step past would undo the whole of it being loose, and a bear
        // you could stand on would be a bear you were standing on.
        //
        // ONE radius for both stopping and standing, and it has to be one.
        // These are ovals and the honest reading is two — the wide half-axis
        // stops you, the narrow one holds you up — which leaves a ring of floor
        // where you are stopped by the table but not over enough of it to land
        // on. Hop there and you are refused in mid-air by a surface you were
        // pressed against: measured on the table (0.56 by 0.36), you bounce off
        // the side of it and come down where you started, which reads as the
        // jump not working rather than as the table being oval.
        //
        // The area-equivalent circle instead. It overhangs the narrow ends by a
        // little and gives away the long ones by as much, and being ONE number
        // means anywhere you can be stopped is somewhere you can stand.
        // Solid and standable, unless it is loose — or up a wall, where a
        // footprint on the floor would be a piece of thin air you cannot walk
        // through, standing under a shelf.
        if (!f.item && !f.wall && !f.ceiling) {
          const rr = Math.sqrt(built.rx * built.rz) / R;
          furnitureSolids.push({ dir, r: rr, top: built.top, topR: rr });
        }

        if (f.item) {
          const loose = {
            dir: dir.clone(),
            vel: new THREE.Vector3(),
            reach: CONFIG.interior.nudgeReach,
            place: null,
            // What the carrying system needs to know about it — see the
            // uniques wiring in main.js. `art` is its identity in ITEMS,
            // `home` is the spot it was arranged at and returns to, `anchor`
            // is the built group so it can be hidden while carried and
            // raycast to be picked up.
            art: f.art,
            home: dir.clone(),
            anchor,
          };
          const facing = f.spin !== undefined ? f.spin : f.at + Math.PI;
          loose.place = () => standAt(anchor, loose.dir, facing);
          this.loose.push(loose);
        }
      }

      // Registered only now, because none of it existed when the props on the
      // grass were. Appended rather than set, so the trees keep their entries.
      addSolids(furnitureSolids);

      // The one gap in the wall, registered beside the wall itself. The same
      // footprint object the ground cover and the lamplight already read is
      // given the door: mutated in place, so every reader — the walk, the
      // taps, the characters' own path checks — sees the opening at once.
      // See sphere.js for what these three fields mean.
      const wallB = footprints.find((f) => f.solid && f.dir.dot(N) > 0.9999);
      if (wallB) {
        wallB.inner = CONFIG.interior.walk / R;
        wallB.gapDir = tangentAt(0);
        wallB.gapCos = Math.cos((doorW / 2 - CONFIG.interior.gapInset) / dRing);
        // How high the building stands, for anything that has to get over it —
        // the camera taking off indoors is the one that does. Written down
        // rather than left as the identity `roof === r * R`, which is only
        // true while the house is half a circle.
        wallB.roof = rad;
        // ...and the same arc for isInside, which is the tinting's and the
        // controls' idea of "under the roof".
        this._wallCos = Math.cos(wallB.r);
      }

      // The card, and its lit twin, stop being drawn. Left in the scene so
      // everything that walks `sprites` and `litProps` still finds what it
      // expects to find.
      this.house.mesh.visible = false;
      this.house.retired = true;
      this.houseRad = rad;
      this.house.shell = shell;
      if (this.house.lit) {
        this.house.lit.night.visible = false;
        // The light in the air, moved onto the doorway it is supposed to be
        // coming out of. It was placed by litSpot, which finds the bright warm
        // pixels in the night DRAWING — a drawing that is no longer shown, so
        // the glow was hanging wherever those pixels used to be. Hung off the
        // door now, so it follows the door if the door ever moves.
        const bloom = this.house.lit.bloom;
        bloom.position.set(0, 0, 0.06);
        bloom.scale.setScalar((rad * 1.5) / (bloom.geometry.parameters.width || 1));
        this.houseDoor.add(bloom);
      }
    }
    this.smallProps = this.sprites.filter((s) => s.small).map((s) => s.anchor);
    this.litProps = this.sprites.filter((s) => s.lit);

    // Seed the lamp positions before anything can read them. update() refreshes
    // these every frame, but setDaylight runs before the first frame does, and
    // a lamp still sat at the origin is one shining out of the planet's core.
    this.world.updateMatrixWorld(true);
    for (const s of this.litProps) {
      s.anchor.getWorldPosition(this.lampUniforms.uLampAt.value[s.lit.slot]);
    }
    for (const L of this.roomLights) {
      L.at.getWorldPosition(this.lampUniforms.uLampAt.value[L.slot]);
    }

    // A lamplit prop takes three slots rather than one. Its night card and its
    // bloom have to land immediately above it and nowhere else: they are the
    // same object seen at another hour, and anything sorting between them would
    // be drawn inside the house. Three consecutive orders is how the painter's
    // sort is told they travel together.
    this.sortables = this.sprites.map((s) => ({
      pos: s.anchor.position,
      span: s.lit ? 3 : 1,
      apply: (n) => {
        s.mesh.renderOrder = n;
        if (s.lit) {
          s.lit.night.renderOrder = n + 1;
          s.lit.bloom.renderOrder = n + 2;
        }
      },
      d: 0,
    }));

    this._camDir = new THREE.Vector3();
    this.resize();
  }

  // Whether a tap landed on the house, and where it stands if it did — the
  // surface direction, which is all anybody needs to walk to it or to aim a
  // doorway at it.
  //
  // Only while it is actually in view: over the horizon its card is hidden, and
  // a ray can still reach a hidden mesh.
  pickHouse(raycaster) {
    const s = this.house;
    if (!s || !s.seen || !s.shell || !s.shell.visible) return null;
    // The ray does not know about the punched doorway — raycasting reads
    // geometry, not alpha — so a tap through the open arch still reports the
    // building. That is the right answer: a tap on the doorway means "go
    // there", and going there is what a tap on the house does.
    return raycaster.intersectObject(s.shell, true).length ? s.normal.clone() : null;
  }

  // Show where a tap-to-walk is heading, or fade the mark away once there is no
  // walk to mark. `dir` is the destination as a unit surface direction, or null.
  //
  // Driven from the rig's own `goto` every frame rather than switched on at the
  // tap and off on arrival, which is why it cannot get out of step with the walk
  // it is about: everything that can end a walk — the stick taking over,
  // arriving, going indoors — clears that one field, and none of them has to
  // remember there is a marker.
  //
  // Tap-to-walk had nothing at all before this, and on a planet whose horizon is
  // four paces off, that is worse than it sounds: the spot you tapped goes over
  // the curve within a second or two, so for most of the walk there is no
  // evidence on screen that a trip is happening. That is exactly when somebody
  // decides the tap missed and taps again somewhere else.
  setWalkMarker(dir, dtMs) {
    if (dir) {
      this.walkMark.position.copy(dir).multiplyScalar(CONFIG.globe.radius);
      this.walkMark.quaternion.setFromUnitVectors(UP, dir);
    }
    const k = 1 - Math.exp(-dtMs / WALK_MARK.fadeMs);
    this._markOn += ((dir ? 1 : 0) - this._markOn) * k;
    const on = this._markOn > 0.004;
    // The group carries the visibility, so a marker nobody has asked for costs
    // nothing at all — not a draw call, not an entry anywhere.
    if (on !== this.walkMark.visible) this.walkMark.visible = on;
    if (!on) return;
    this._markClock += dtMs;
    this._markMesh.material.opacity = this._markOn;
    // It breathes. A ring sitting perfectly still on the grass reads as one more
    // thing drawn on the planet; the same ring moving very slightly reads as the
    // app still holding on to something you asked for.
    const b = 1 + WALK_MARK.breathe
      * Math.sin((this._markClock / WALK_MARK.breatheMs) * Math.PI * 2);
    // X and Z, not X and Y: the mesh is no longer a plane stood on its edge and
    // rotated flat, it is built lying down, so the two axes it spreads along are
    // the two in the ground.
    this._markMesh.scale.set(b, 1, b);
  }

  // The window view and the door glimpse both stood here — the planet rendered
  // into the room's window, and the room rendered into the doorway. Both are
  // gone, and gone for the best reason: neither view needs faking any more.
  // The doorway is a real hole, so the room through it is simply the room; the
  // window shows the sky because it is glass with the sky behind it. Deleting
  // a render-to-texture pass from each side of the wall is the one unqualified
  // performance win of the merge.

  // The doorstep, as a unit surface direction — where a tap on the house sets
  // you down, facing the open door, and where a character heading home aims
  // first. Read off the door frame's own anchor rather than from a bearing
  // written somewhere, so a moved door moves its doorstep with it: the door's
  // bearing off the house's centre, then `doorstep` out from the middle along
  // it.
  // `dist` is how far out from the MIDDLE of the house to stand, defaulting to
  // the doorstep itself. The arrival passes camera.spawnBack instead, which is
  // the same line further back — one bearing, two distances along it, so where
  // you spawn and where a tap sets you down can never end up facing different
  // walls.
  doorstepDir(out, dist = CONFIG.interior.doorstep) {
    const s = this.house;
    if (!s || !this.houseDoor) return null;
    this.houseDoor.getWorldPosition(out).sub(this.world.position);
    out.addScaledVector(s.normal, -out.dot(s.normal));
    if (out.lengthSq() < 1e-9) return null;
    out.normalize();
    const arc = dist / CONFIG.globe.radius;
    return out.multiplyScalar(Math.sin(arc))
      .addScaledVector(s.normal, Math.cos(arc)).normalize();
  }

  // Where on the surface a ray lands, as a unit direction from the centre.
  // The world group floats, so its offset has to come back out.
  pickGround(raycaster) {
    const hits = raycaster.intersectObject(this.ground, false);
    if (!hits.length) return null;
    return hits[0].point.clone().sub(this.world.position).normalize();
  }

  // ...and the same tap resolved against anything you could set something ON —
  // a stump's cut face out of doors, the table and the shelf indoors. Null when
  // the ray meets none of them, and then the ground below is the answer.
  //
  // The ray's origin is moved out of the floating world's frame first, exactly
  // as pickGround moves its hit point out of it: the whole planet rides a slow
  // bob, and a ray reasoned about in the wrong frame is wrong by that bob.
  pickPerch(raycaster) {
    _pw.copy(raycaster.ray.origin).sub(this.world.position);
    return perchAlongRay(_pw, raycaster.ray.direction, CONFIG.globe.radius);
  }

  // The night sky's stars, as point sprites rather than paint on the dome.
  //
  // A point sprite is a camera-facing square of a fixed number of *screen*
  // pixels, cut into a circle by its texture. That is the whole argument for
  // it: it is the same size and the same shape wherever it sits, so there is no
  // pole to distort it, no widening to get right, and no dependence on how
  // finely the dome happens to be tessellated. Painting them into the sky
  // texture failed on all three, worst in the middle of the screen — see the
  // note in art.js where they used to be drawn.
  //
  // Three sets, because one PointsMaterial has one size. Three draw calls for
  // the whole night sky is a fair price for having bright stars and faint ones.
  _buildStars() {
    const rand = makeRandom(STAR_SEED);
    const tex = new THREE.CanvasTexture(starStamp());
    tex.colorSpace = THREE.SRGBColorSpace;
    // NO MIPMAPS, and this is the single most important line in the method.
    //
    // The stamp is 64px square and every star drawn from it is 5 to 15px, so
    // unlike the sky dome — which has the opposite problem, see skyTexFrom —
    // these are heavily MINIFIED, which is exactly when mipmapping engages. The
    // levels it builds average that bright centre together with the transparent
    // surround, so by the time a 5px sprite is sampling a 4x4 level there is
    // almost nothing of the star left. It does not vanish, which is why it went
    // unnoticed: it turns every star into a dim smudge spread over more pixels
    // than it should cover.
    //
    // Measured off rendered frames, peak star brightness against the night sky:
    // **46/255 with mipmaps, 213/255 without**. The field was rendering at about
    // a fifth of the brightness the numbers below ask for, which is most of why
    // a sky of 7,360 stars read as empty.
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;

    // Screen pixels, and a count each. Dust is most of it; the bright few are
    // what stop a uniform field from reading as noise. `size` is the whole
    // sprite including its falloff, so the solid centre is about a third of it.
    //
    // `tw` is how far each tier's brightness swings as it twinkles. The small
    // ones move most: a point of dust winking is what the eye reads as a night
    // sky being alive, whereas the few big anchors wobbling makes the whole
    // thing restless. Nothing here is above a fifth either way — asked for
    // slight, and a starfield that pulses is worse than one that sits still.
    //
    // The counts were 5,200 / 1,900 / 260 and are two and a half times that now.
    // Fixing the mipmapping above made every star far brighter but no more
    // numerous: measured over the sky at the resting gaze, the old counts cover
    // 17.2% of it and these cover 40.6%. Both changes were needed and neither
    // would have done on its own — brighter stars thinly scattered still read as
    // a thin scattering.
    //
    // `min` and `range` were 0.30/0.35, 0.45/0.40 and 0.70/0.30, and had to come
    // down hard once the mipmapping was fixed. They were tuned by eye against a
    // field rendering at a fifth of its brightness, so they were carrying a
    // silent 5x correction for it — and with that gone all three tiers measured
    // a peak of 255/255. Every tier saturating is every tier looking the same:
    // the sizes still differed but the brightness hierarchy, which is most of
    // what separates a starry sky from static, was flat.
    //
    // These are set so the tiers land clear of each other on screen, measured
    // against the night sky rather than reasoned about. The numbers are linear
    // and the output is sRGB-encoded, which is why they look so much darker than
    // the values they replaced: 0.05 linear is already a visible grey.
    //
    // The 20:7:1 ratio between the tiers is kept, because that part was right.
    // Dust is most of it; the bright few are what stop a uniform field reading as
    // noise, and that balance does not change with density.
    const TIERS = [
      { n: 14000, size: 5.0, min: 0.05, range: 0.08, tw: 0.20 },
      { n: 4600, size: 8.0, min: 0.14, range: 0.26, tw: 0.15 },
      { n: 640, size: 15.0, min: 0.45, range: 0.45, tw: 0.09 },
    ];

    this._twinkleMats = [];
    const group = new THREE.Group();
    // Left at zero deliberately, and it is the one number here worth guarding.
    // A Group's renderOrder does not nudge its children within the pass — it
    // becomes their *groupOrder*, which the sort compares BEFORE it looks at
    // renderOrder at all. So -11.5 here did not put the stars between the
    // backdrop and the dome fading in; it put them ahead of every direct child
    // of skyRig whatever their own order said, because those inherit skyRig's
    // own zero.
    //
    // The dome fading in then painted over the entire field. Measured through a
    // noon-to-night change, star brightness came out at 16% of settled at the
    // midpoint, exactly ZERO at 97%, and the whole sky arrived in the single
    // frame the fade landed — the opposite of the intended dusk-brings-them-up.
    // With the ordering below it measures 50% at the midpoint and 99.7% at 97%.
    group.renderOrder = 0;
    group.frustumCulled = false;
    for (const tier of TIERS) {
      const pos = new Float32Array(tier.n * 3);
      const col = new Float32Array(tier.n * 3);
      const tw = new Float32Array(tier.n * 2);
      for (let i = 0; i < tier.n; i++) {
        // Uniform over the sphere: `acos(1 - 2u)` rather than an even sweep of
        // the polar angle, which would pile them up at the top and bottom.
        const theta = Math.acos(1 - 2 * rand());
        const phi = rand() * Math.PI * 2;
        const s = Math.sin(theta);
        pos[i * 3] = 176 * s * Math.cos(phi);
        pos[i * 3 + 1] = 176 * Math.cos(theta);
        pos[i * 3 + 2] = 176 * s * Math.sin(phi);
        // Brightness varies per star rather than per tier, so a size does not
        // read as a single stamped-out kind of star.
        const b = tier.min + rand() * tier.range;
        col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b;

        // Its own phase and its own speed, both random. Either alone would
        // leave the sky breathing in unison, which is the one thing a real one
        // never does. Roughly a four-second cycle at the slow end and just
        // over one at the fast.
        tw[i * 2] = rand() * Math.PI * 2;
        tw[i * 2 + 1] = 1.5 + rand() * 4.0;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('tw', new THREE.BufferAttribute(tw, 2));

      const mat = new THREE.PointsMaterial({
        size: tier.size,
        // The point of the exercise: a fixed screen size, so a star does not
        // grow as the dome's geometry swings past it.
        sizeAttenuation: false,
        map: tex,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        // Depth test ON, for the same reason the fading dome needs it. Being
        // transparent puts these in the pass *after* every opaque thing, so
        // renderOrder alone will not keep them behind the planet — without the
        // test they paint straight over the ground. At 176 units the test hides
        // them everywhere something nearer was drawn, which is the whole world.
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this._twinkle(mat, tier.tw);

      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      // Where the ordering actually happens, now that the group is out of the
      // way: after both domes (-12 and -11) so the field rides on top of
      // whichever sky is showing and comes up with the fade rather than from
      // behind it, and before the sun and moon cards (-9 and -8) so the moon
      // still passes in front of the stars.
      pts.renderOrder = -10.5;
      group.add(pts);
    }
    group.visible = false;
    return group;
  }

  // Makes a star material twinkle, by patching the stock points shader rather
  // than rewriting it.
  //
  // On the GPU on purpose. Nineteen thousand stars rewritten on the CPU every
  // frame is sixty-odd thousand floats reuploaded for an effect that is one
  // sine wave — here each star carries its own phase and speed as an attribute
  // and the only thing that changes per frame is a single clock uniform.
  //
  // It multiplies `vColor`, which is the per-star brightness, so the twinkle
  // rides on top of the variation already there instead of flattening it. And
  // because the blending is additive, brightness *is* how much of the star
  // reaches the eye — no separate alpha to keep in step.
  _twinkle(mat, amp) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uAmp = { value: amp };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec2 tw;
          uniform float uTime;
          uniform float uAmp;`)
        .replace('#include <color_vertex>', `#include <color_vertex>
          vColor *= 1.0 + uAmp * sin(uTime * tw.y + tw.x);`);
      // Kept so the per-frame clock has something to write to. It does not
      // exist until the material has actually been compiled, hence the guard
      // at the other end.
      mat.userData.shader = shader;
    };
    this._twinkleMats.push(mat);
  }

  // Stars are all-or-nothing per phase, so this is just how far through the
  // fade the night end is. Hidden outright at zero so the three draw calls are
  // not spent on an invisible field for three quarters of the day.
  _setStarAlpha(a) {
    this.stars.visible = a > 0.001;
    if (!this.stars.visible) return;
    for (const pts of this.stars.children) pts.material.opacity = a;
  }

  // Paints the skies nobody has asked for yet, one per idle slot, so that the
  // first press of the time button fades instead of stalling to paint. Spread
  // out rather than done in a batch: four at once is a visible stutter in the
  // first seconds, which is the one place a stutter reads as "this is slow"
  // rather than "that was the sky changing".
  warmSkies() {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 220));
    const todo = Object.keys(LOOK).filter((p) => !skyCache.has(p));
    const step = () => {
      const p = todo.shift();
      if (!p) return;
      skyTexFor(p);
      idle(step);
    };
    idle(step);
  }

  // Which drawing is in the sky for a given hour. One sun covers morning, noon
  // and evening; only night has its own.
  _discArtFor(phase) {
    return phase === 'night' ? this.discTex.moon : this.discTex.sun;
  }

  // Placed and sized from the same `discAt` / `discR` the halo behind it is
  // painted from, so the two cannot drift apart. Both are in SKY_DESIGN space
  // rather than real texture pixels — deliberately, so that changing the sky's
  // resolution sharpens it without moving the sun. discR is a radius across a
  // texture that wraps a full turn, hence the arc.
  //
  // The card is scaled so the *drawn* disc spans that arc; the sheet around it
  // comes along at whatever size its own margins make it.
  _placeDisc(mesh, art, atX, atY, r) {
    const dist = 170;
    const angR = (r / SKY_DESIGN.w) * Math.PI * 2;
    const perPx = (2 * Math.tan(angR) * dist) / art.drawn;
    skyDirFromTexel(atX, atY, SKY_DESIGN.w, SKY_DESIGN.h, _discDir);
    mesh.position.copy(_discDir).multiplyScalar(dist);
    mesh.scale.set(art.w * perPx, art.h * perPx, 1);
  }

  // One sun drawing covers three hours of the day. `look.disc` is the colour
  // the painted disc used, and multiplying by it is where the warm start, the
  // pale midday and the orange evening come from — which is why the sun is
  // drawn white and the moon, which only ever appears once, is drawn in its
  // own colour.
  _dressDisc(mesh, phase, look) {
    const art = this._discArtFor(phase);
    mesh.material.map = art.tex;
    mesh.material.color.set(look.disc);
    mesh.material.needsUpdate = true;
    this._placeDisc(mesh, art, look.discAt[0], look.discAt[1], look.discR);
  }

  // Moves the world to a time of day. The globe is lit so the lights alone
  // carry it, but every sprite is unlit — without tinting them too they would
  // stay midday-bright over a dark planet, like cutouts pasted onto a night
  // photograph.
  //
  // Nothing here happens at once except the first call. An hour change used to
  // be invisible because it only fired on a clock boundary; now that it is a
  // button, a hard cut between noon and night is the most obvious thing on
  // screen. So this only *starts* the change and updateDaylight walks it.
  // True while the sky is still moving of its own accord. Not `t < 1`: a scrub
  // that settled backwards rests at 0, which is just as settled.
  get settling() { return this.blend.t !== this.blend.goal; }

  // Where the world currently is on the day's axis, 0 through 3, fractional
  // mid-change. The scrubber reads this every frame rather than tracking its own
  // idea of the position, so the sun on the track and the sun in the sky cannot
  // come apart — including during a fade nobody dragged.
  get dayPos() {
    const bl = this.blend;
    if (!bl.fromPhase) return 0;
    const a = PHASES.indexOf(bl.fromPhase);
    if (!bl.toPhase) return a;
    const b = PHASES.indexOf(bl.toPhase);
    const t = bl.ease ? bl.t * bl.t * (3 - 2 * bl.t) : bl.t;
    return a + (b - a) * t;
  }

  setDaylight(phase, { instant = false } = {}) {
    // `phase` is where the sky is *heading*, which mid-fade is not where it
    // looks. A second press before the first has landed therefore compares
    // against the queue, not against what is on screen.
    if (phase === (this.pending || this.phase)) return;

    // Mid-fade there is nowhere to put a third painting — skyA holds the one we
    // are leaving and skyB the one we are arriving at. Rather than cut, queue
    // it: tapping the button a few times in a row then sweeps the sky through
    // the day, which is a nicer thing to have done by accident than a snap.
    if (!instant && this.settling) {
      this.pending = phase === this.phase ? null : phase;
      return;
    }
    this.pending = null;
    this._seg = -1;

    const look = LOOK[phase];
    const prev = this.phase ? LOOK[this.phase] : null;
    const prevPhase = this.phase;
    this.phase = phase;

    if (!prev || instant) {
      this.skyA.material.map = skyTexFor(phase);
      this.skyA.material.needsUpdate = true;
      this.skyB.material.map = null;
      this.skyB.visible = false;
      if (this.discA) {
        this._dressDisc(this.discA, phase, look);
        this.discA.material.opacity = 1;
        this.discB.visible = false;
      }
      this.blend = {
        t: 1, goal: 1, rate: 0, ease: false,
        from: look, to: look, fromPhase: phase, toPhase: phase, swapDisc: false,
      };
      this._applyBlend(1);
      return;
    }

    this.skyB.material.map = skyTexFor(phase);
    this.skyB.material.opacity = 0;
    this.skyB.material.needsUpdate = true;
    this.skyB.visible = true;

    // The card only needs a partner when the drawing itself changes.
    const swapDisc = !!this.discA
      && this._discArtFor(prevPhase) !== this._discArtFor(phase);
    if (swapDisc) {
      this._dressDisc(this.discB, phase, look);
      this.discB.material.opacity = 0;
      this.discB.visible = true;
    }

    this.blend = {
      t: 0, goal: 1, rate: 1 / CONFIG.daylight.fadeMs, ease: true,
      from: prev, to: look, fromPhase: prevPhase, toPhase: phase, swapDisc,
    };
  }

  // ------------------------------------------------------------- scrubbing
  //
  // Dragging the day is the same machinery as fading between two hours, with
  // the finger where the clock would be. All the scrubber has to do is choose
  // which pair of hours is hung on the two domes and how far between them we
  // are — everything downstream is the cross-fade that already existed.

  // Hangs the pair either side of `seg` on the domes. Called only when the
  // finger crosses from one pair into the next: reassigning a map and setting
  // needsUpdate on every pointermove would re-upload eight megabytes a frame.
  _setSegment(seg) {
    this._seg = seg;
    const fromPhase = PHASES[seg];
    const toPhase = PHASES[seg + 1];

    this.skyA.material.map = skyTexFor(fromPhase);
    this.skyA.material.needsUpdate = true;
    this.skyB.material.map = skyTexFor(toPhase);
    this.skyB.material.needsUpdate = true;
    this.skyB.visible = true;

    const swapDisc = !!this.discA
      && this._discArtFor(fromPhase) !== this._discArtFor(toPhase);
    if (this.discA) {
      this._dressDisc(this.discA, fromPhase, LOOK[fromPhase]);
      if (swapDisc) {
        this._dressDisc(this.discB, toPhase, LOOK[toPhase]);
        this.discB.visible = true;
      } else {
        this.discB.visible = false;
      }
    }

    const bl = this.blend;
    bl.from = LOOK[fromPhase];
    bl.to = LOOK[toPhase];
    bl.fromPhase = fromPhase;
    bl.toPhase = toPhase;
    bl.swapDisc = swapDisc;
  }

  // Put the world at a point in the day. No animation: the finger is the
  // animation, and anything easing behind it would feel like lag.
  scrubDaylight(pos) {
    const p = pos < 0 ? 0 : pos > PHASES.length - 1 ? PHASES.length - 1 : pos;
    const seg = Math.min(Math.floor(p), PHASES.length - 2);
    const f = p - seg;

    this.pending = null;
    if (seg !== this._seg) this._setSegment(seg);
    this.phase = PHASES[Math.round(p)];

    const bl = this.blend;
    bl.t = f;
    bl.goal = f;
    bl.rate = 0;
    bl.ease = false;
    this._applyBlend(f);
  }

  // Let go. Falls to whichever end of the current pair is nearer — which is why
  // `goal` exists — over a fixed *duration* rather than a fixed speed, so a
  // release a hair from its stop does not crawl the last of the way there.
  // Linear, not eased: the finger just stopped, and easing back in from rest
  // would read as the control hesitating.
  endScrub() {
    const bl = this.blend;
    const goal = bl.t < 0.5 ? 0 : 1;
    const dist = Math.abs(goal - bl.t);
    this.phase = goal ? bl.toPhase : bl.fromPhase;

    bl.goal = goal;
    bl.ease = false;
    if (dist < 0.002) {
      bl.t = goal;
      this._settle();
    } else {
      bl.rate = dist / CONFIG.daylight.settleMs;
    }
    return this.phase;
  }

  // Everything that can be interpolated, at a point in the cross-fade. The sky
  // is the one thing that cannot — you cannot average two paintings — which is
  // what the second dome is for.
  _applyBlend(t) {
    const { from: a, to: b, swapDisc } = this.blend;

    _cA.set(a.ambient[0]);
    this.ambient.color.copy(_cA.lerp(_cB.set(b.ambient[0]), t));
    this.ambient.intensity = a.ambient[1] + (b.ambient[1] - a.ambient[1]) * t;

    _cA.set(a.dir[0]);
    this.sun.color.copy(_cA.lerp(_cB.set(b.dir[0]), t));
    this.sun.intensity = a.dir[1] + (b.dir[1] - a.dir[1]) * t;

    // ...and the same light again for everything the real one cannot reach —
    // see this.sunUniforms. Copied off the light rather than blended a second
    // time from the table, so the two can never come out of step: whatever the
    // ground is being lit by this frame is what the trees standing in it get.
    this.sunUniforms.uSunTint.value.copy(this.sun.color);
    this.sunUniforms.uSunLevel.value = this.sun.intensity * SUN_LIT.strength;

    _cA.set(a.tint);
    this.tint.copy(_cA).lerp(_cB.set(b.tint), t);
    for (const m of this.tintables) m.color.copy(this.tint);

    // The far range, which takes the tint and is then washed into the air —
    // see the note where it is built, and `haze` in daylight.js.
    //
    // The wash target is skyLow, the colour at the BOTTOM of the sky, because
    // that is the sky the hills are actually standing in front of. skyMid was
    // the obvious reach and is wrong by a whole band: at sunset it is the
    // orange overhead rather than the pale gold at the horizon, and hazing
    // toward it left the range brighter than the sky behind it.
    //
    // Blended before it is applied rather than applied twice, so a fade between
    // two hours passes through the colours in between instead of crossfading
    // between two washes. `_cH` is its own temporary because `_cA` and `_cB` are
    // both still live at this point in the frame.
    //
    // The colour at the BOTTOM of the sky, worked out once here because two
    // different things need it and for the same underlying reason: the far range
    // is partly the air in front of it, and a pond is partly the sky bouncing
    // off it. Both are asking what fraction of this surface is not the surface.
    _cH.set(a.skyLow).lerp(_cA.set(b.skyLow), t);

    if (this._hazeMat) {
      this._hazeMat.color.copy(this.tint).lerp(_cH, a.haze + (b.haze - a.haze) * t);
    }

    // The water, which is a mirror rather than a surface and so cannot take the
    // plain tint either. Same sky, a stronger pull toward it, and the glints
    // turned down rather than tinted — see waterHour.
    if (this.ponds) {
      waterHour(
        this.ponds, this.tint, _cH,
        a.mirror + (b.mirror - a.mirror) * t,
        a.glint + (b.glint - a.glint) * t,
      );
    }

    // The interior's own hour, blended on the same axis — see tintIn in
    // daylight.js for why indoors is not outdoors with the lights down.
    // Stored as the BASE, what the room looks like with somebody in it,
    // because occupancy dims it from _syncInterior and needs the undimmed
    // value to dim from.
    _cA.set(a.tintIn);
    this._tintInBase.copy(_cA).lerp(_cB.set(b.tintIn), t);

    // The inside face of the windows used to be painted the sky's own colour
    // here — the one thing in the room that said what hour it was out there.
    // The windows are holes now, so the room is told the hour by the sky
    // itself, through them.

    // Whoever is stood outside wears the sky's tint. The interior lists and
    // whoever is under the roof are written by _syncInterior, which _setLamps
    // below calls — the lamps are an input to the interior's colour.
    for (const ch of this.cast) {
      if (this.isInside(ch.dir)) continue;
      for (const m of ch.tintables) m.color.copy(this.tint);
    }

    this._setLamps(a.lamps + (b.lamps - a.lamps) * t);

    _cA.set(a.skyMid);
    this.renderer.setClearColor(_cA.lerp(_cB.set(b.skyMid), t), 1);

    this.skyB.material.opacity = t;

    // Faded rather than switched, so dusk brings them up instead of turning
    // them on. `stars` is a flag, and only night sets it.
    this._setStarAlpha((a.stars ? 1 - t : 0) + (b.stars ? t : 0));

    if (!this.discA) return;
    if (swapDisc) {
      this.discA.material.opacity = 1 - t;
      this.discB.material.opacity = t;
    } else {
      _cA.set(a.disc);
      this.discA.material.color.copy(_cA.lerp(_cB.set(b.disc), t));
      this._placeDisc(
        this.discA,
        this._discArtFor(this.phase),
        a.discAt[0] + (b.discAt[0] - a.discAt[0]) * t,
        a.discAt[1] + (b.discAt[1] - a.discAt[1]) * t,
        a.discR + (b.discR - a.discR) * t,
      );
    }
  }

  // Lights on indoors. `v` is the raw phase-to-phase number from daylight.js;
  // what comes out of LAMP_ONSET and the smoothstep is a curve that stays at
  // nothing through the first part of dusk and then comes up in one movement.
  //
  // The shaping is not decoration. The lit sheet is a second whole drawing of
  // the house, and cross-fading it linearly across the entire evening means
  // several seconds of a house that is half daylit and half lamplit — which
  // does not read as dusk, it reads as a double exposure. Held off and then
  // brought up, it reads as somebody switching a light on, which is the thing
  // actually being depicted.
  _setLamps(v) {
    this._lampAt = v;
    const u = (v - LAMP_ONSET) / (1 - LAMP_ONSET);
    const shape = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    // Kept separately from `_lamps` because the interior needs the two factors
    // apart: how deep into the evening it is, without the occupancy already
    // multiplied in. See _syncInterior.
    this._lampShape = shape;
    const k = shape * this._occupancy;
    if (k !== this._lamps) {
      this._lamps = k;
      for (const s of this.litProps) this._syncLamp(s);
    }
    // Always, even when the lamps have not moved: the glass also follows the
    // HOUR, and an early return here would leave it wearing yesterday's sky
    // through every fade that happens by daylight. The interior follows for
    // the same reason — its colour is part hour, part lamps.
    this._syncGlow();
    this._syncItemLights();
    this._syncInterior();
  }

  // The room's own wired lights, brought up with the evening.
  //
  // Driven by `_lamps` — the hour AND whether anybody is home — rather than by
  // the hour alone, so the house keeps the one story it has always told: dark
  // windows over a dark room when nobody is in. A lantern somebody left
  // burning is the other case, and it is a different flag.
  //
  // The glass's baseColor is written, not just its colour, because the hour
  // multiplies baseColor into everything indoors — writing only the visible
  // colour would have _syncInterior put the light out again on the same frame.
  // How brightly each light burns, 0 to 1, from three facts that each answer a
  // different question and so cannot be folded into one another:
  //
  //   switchedOn  is it working at all — the only one anybody can change
  //   night       what it follows once on: the hour, or nothing
  //   _lamps      what the hour currently is
  //
  // A lantern somebody lit burns at every hour and goes out when switched off.
  // The bulb is wired in and follows the evening — and switched off it stays
  // dark through the evening too, which is the whole point of a switch.
  _syncItemLights() {
    for (const L of this.itemLights) {
      const k = L.switchedOn ? (L.night ? this._lamps : 1) : 0;
      L.pool.material.opacity = k * L.poolAlpha;
      for (const hh of L.haloes) hh.mesh.material.opacity = k * hh.alpha;
      _cA.copy(L.off).lerp(L.on, k);
      L.glass.userData.baseColor.copy(_cA);
      L.glass.color.copy(_cA);
      // HOW CLEAR it is, not only what colour. A bulb switched off is a shell
      // you see the room through; one alight is a body of light. Held at one
      // opacity it read as a solid ball every morning, which is the one hour a
      // bulb has nothing else to say for itself.
      if (L.dim !== undefined) L.glass.opacity = L.dim + (L.bright - L.dim) * k;
    }
    // ...and what those same lights put on everything ELSE in the room — the
    // wall, the table, the futon. Only the wired ones move with the hour: a
    // lantern somebody lit burns at all of them, and its level was written
    // once when it was built. Which is why this walks `roomLights` and asks,
    // rather than walking `itemLights`, which is the hour-driven list already.
    // ...and what those same lights put on everything ELSE in the room. Every
    // one of them is written every frame now, by the same rule the visuals
    // above use — a lantern's slot used to be written once at build, which was
    // fine while nothing could switch it and is exactly what a switch breaks.
    for (const L of this.roomLights) {
      const k = L.on ? (L.night ? this._lamps : 1) : 0;
      this.lampUniforms.uLampLevel.value[L.slot] = k * L.level;
    }
  }

  // The lights you can reach from where you are standing, nearest first.
  // Distance only — this answers "what could I reach", which is about where
  // your feet are rather than where you are looking.
  //
  // A ceiling light has no bearing of its own (see `ceiling` in the furniture
  // table), so it is reachable from anywhere in the room: you do not walk over
  // to a pull cord on a dome, you are simply under it.
  lightNear(playerDir) {
    if (!this.isInside(playerDir)) return null;
    for (const L of this.roomLights) {
      if (L.ceiling) return L.art;
    }
    const reach = Math.cos(CONFIG.uniques.reach / CONFIG.globe.radius);
    for (const l of this.loose) {
      if (!l.anchor.visible) continue;
      if (!this.roomLights.some((L) => L.art === l.art)) continue;
      if (playerDir.dot(l.dir) > reach) return l.art;
    }
    return null;
  }

  // Flip a light. Both lists carry the piece's `art`, so one call moves the
  // glass, the pool, the halo and the light it casts on the room together —
  // and a light and its own glow can never disagree about being on.
  toggleLight(art) {
    let on = null;
    for (const L of this.itemLights) {
      if (L.art !== art) continue;
      L.switchedOn = !L.switchedOn;
      on = L.switchedOn;
    }
    for (const L of this.roomLights) {
      if (L.art === art) L.on = on === null ? !L.on : on;
    }
    this._syncItemLights();
    return on;
  }

  lightIsOn(art) {
    const L = this.itemLights.find((x) => x.art === art);
    return L ? L.switchedOn : false;
  }

  // The interior's colour, written to everything under the roof: the wall you
  // see from the rug, the floor, the furniture, whoever is inside. Two inputs.
  // The hour's own interior tint is the base — warm at night, because the
  // lamps are on; that is the story the lit windows have always told. And then
  // how EMPTY the house is after dark leans it toward a dim: the room's lamps
  // are its only light, so with nobody home at midnight a passer-by looking
  // through the open door should see a dark room under dark windows, not a
  // hearth burning for no one. The porch-light floor on occupancy keeps even
  // that from reading as derelict. By day the lean is zero, because daylight
  // through a real hole needs nobody home to be on.
  _syncInterior() {
    if (!this._tintInBase) return;
    this.tintIn.copy(this._tintInBase);
    const lean = (this._lampShape || 0) * (1 - this._occupancy);
    if (lean > 0) this.tintIn.lerp(_cB.set('#5A5450'), lean * 0.7);
    for (const m of this.interiorTintables) {
      const base = m.userData.baseColor;
      if (base) m.color.copy(base).multiply(this.tintIn);
      else m.color.copy(this.tintIn);
    }
    for (const ch of this.cast) {
      if (!this.isInside(ch.dir)) continue;
      for (const m of ch.tintables) m.color.copy(this.tintIn);
    }
  }

  // Which set of lamps one of the cast is standing among: the house's, seen
  // from the grass, or the room's, seen from the rug. Written to the switch
  // litByCast left on the material, which exists from the moment the material
  // does rather than from the moment it is first drawn.
  //
  // Guarded, because a character can be added before the lamp machinery has any
  // lights to give — a planet with no house patches nothing at all.
  _castSide(ch) {
    const side = ch.bodyMesh.material.userData.lampSide;
    if (side) side.value = this.isInside(ch.dir) ? 1 : 0;
  }

  // Whether a surface direction is under the house's roof — the one question
  // that now separates indoors from out, asked by the tinting here and by the
  // controls in main.js. There is no stage flag and no mode: being inside is
  // where you are standing, nothing more.
  isInside(dir) {
    const s = this.house;
    if (!s || this._wallCos === undefined) return false;
    return dir.dot(s.normal) > this._wallCos;
  }

  // The glass, which is the only thing on the building that is lit from the
  // inside rather than coloured by the sky.
  //
  // Two influences, and they pull opposite ways. The hour says what colour the
  // world is — at night that is the same cold blue everything else wears — and
  // the lamps say how much of that is overridden by the light behind the glass.
  // A window at midnight with nobody in is cold and dark; the same window with
  // somebody home is warm and slightly blown out, which is what `over` is for:
  // pushed past 1 the colour clips bright, and a window that clips is a window
  // that is emitting rather than reflecting.
  //
  // The dark outline drawn into the same sheet takes the warmth too, and that
  // is fine — it is nearly black, so a warmer nearly-black is still a line.
  _syncGlow() {
    if (!this.houseGlow) return;
    const over = 1.28;
    _cA.copy(this.tint);
    _cB.set(LAMP_COLOR).multiplyScalar(over);
    _cA.lerp(_cB, this._lamps);
    for (const m of this.houseGlow) m.color.copy(_cA);
  }

  // How lit the windows are for a reason that has nothing to do with the hour:
  // whether anybody is in. 1 is a full room, and household.js eases it down to
  // a porch light when the last of them leaves.
  //
  // It multiplies the hour's own curve rather than replacing it, so an empty
  // house at noon is still an unlit house — occupancy decides how bright the
  // lamps are, never whether it is dark enough to want them.
  setOccupancy(f) {
    if (f === this._occupancy) return;
    this._occupancy = f;
    this._setLamps(this._lampAt);
  }

  // The lit half of one prop. Both the things that can hide it run through
  // here — the lamps being down, and the horizon having swallowed the house
  // they belong to — because a `.visible` flag with two owners is a flag that
  // eventually gets stuck on.
  _syncLamp(s) {
    const { night, bloom, pool, slot } = s.lit;
    const on = s.seen && this._lamps > 0;
    // What this lamp adds to everything standing in it. Not gated on `seen`:
    // that flag is about the card for this house having gone over the horizon,
    // and a bush a few paces the near side of it is still stood in the light.
    this.lampUniforms.uLampLevel.value[slot] = this._lamps * LAMP_LIT.strength;
    // A retired card never comes back, whatever the hour does. The house is
    // geometry now and its night sheet is kept only so this machinery still has
    // the object it expects to find; showing it would hang the old drawing in
    // the air beside the building.
    night.visible = on && !s.retired;
    bloom.visible = on;
    pool.visible = on;
    if (!on) return;
    night.material.opacity = this._lamps;
    bloom.material.opacity = this._lamps * LAMP_BLOOM.alpha;
    pool.material.opacity = this._lamps * LAMP_POOL.alpha;
  }

  // Shove the loose furniture about with your feet. `at` is where you are
  // stood, as a surface direction, or null when you are not on the ground.
  //
  // The one thing in the app that moves because you touched it, and it is
  // deliberately a scoot rather than a collision: no mass, no momentum
  // transfer, no bounce off the wall. What it models is a slipper pushing a
  // stuffed toy along a rug, which is a thing that goes where you push it and
  // stops rather promptly. See CONFIG.interior for the three numbers.
  //
  // The push OVERRIDES rather than accumulates. Adding an impulse per frame
  // makes the shove a function of your frame rate and lets a slow lean against
  // it wind up into a launch; taking the greater of the two means a shove is
  // as hard as its depth says and no harder, however long you lean.
  //
  // IT GOES THE WAY YOUR FOOT IS GOING, not the way out from under it, and
  // that is the difference between this working and not. "Away from the
  // player" is the obvious rule and it is unstable exactly where it matters:
  // the hardest shove lands at the closest approach, which is the moment the
  // away-direction is swinging through a half turn as you pass — so the bear
  // was kicked forward, then caught by a harder shove from the far side and
  // sent back where it came from. Measured, it ended 0.016 from where it
  // started after a walk clean through it. Your direction of travel does not
  // flip when you pass something, so the shove keeps its mind.
  //
  // A little of the outward direction is mixed in anyway, for the case travel
  // cannot answer: standing still, shuffling on the spot, or catching it a
  // glancing blow. That term is what squirts it out from under your feet
  // instead of leaving it parked between them.
  nudgeLoose(at, dtMs) {
    if (!this.loose.length || !at) {
      if (this._looseWas) this._looseWas = null;
      return;
    }
    const R = CONFIG.globe.radius;
    const cfg = CONFIG.interior;
    const dt = Math.min(dtMs, 100) / 1000;      // a long frame must not teleport it

    // How you moved since last frame, as a tangent. Derived rather than handed
    // in, so this needs nothing from the rig and works for anything that might
    // shove furniture later.
    _looseGo.set(0, 0, 0);
    if (this._looseWas) {
      _looseGo.copy(at).sub(this._looseWas);
      _looseGo.addScaledVector(at, -_looseGo.dot(at));
    }
    if (!this._looseWas) this._looseWas = at.clone();
    else this._looseWas.copy(at);
    const going = _looseGo.lengthSq() > 1e-14;
    if (going) _looseGo.normalize();

    for (const n of this.loose) {
      // Not while it is in somebody's hands or on loan — an invisible bear
      // being shoved about the floor is a haunting, not a feature.
      if (!n.anchor.visible) continue;
      const gap = at.angleTo(n.dir) * R;
      if (gap < n.reach) {
        // Out from under your feet, in the tangent plane where it is lying.
        _looseOut.copy(n.dir).addScaledVector(at, -n.dir.dot(at));
        if (_looseOut.lengthSq() < 1e-12) {
          // Stood exactly on it, which has no away — any bearing will do.
          localFrame(n.dir, _looseE, _looseN);
          _looseOut.copy(_looseN);
        }
        _looseOut.normalize();
        if (going) _looseOut.addScaledVector(_looseGo, LOOSE_LEAD).normalize();
        const push = (1 - gap / n.reach) * cfg.nudgeSpeed;
        if (push > n.vel.length()) n.vel.copy(_looseOut).multiplyScalar(push);
      }

      const speed = n.vel.length();
      if (speed < 1e-3) { n.vel.set(0, 0, 0); continue; }

      // Travel: rotate the thing along the surface, and carry its own velocity
      // round with it so a long scoot stays tangent as the floor curves away.
      _looseAxis.crossVectors(n.dir, n.vel);
      if (_looseAxis.lengthSq() > 1e-12) {
        _looseQ.setFromAxisAngle(_looseAxis.normalize(), (speed / R) * dt);
        n.dir.applyQuaternion(_looseQ).normalize();
        n.vel.applyQuaternion(_looseQ);
      }

      // It may not leave the room. The wall is where the walk stops, less its
      // own reach, so the bear fetches up against the skirting rather than
      // half inside it — and the outward part of its travel is dropped instead
      // of reflected, because a toy shoved at a wall stops there. It does not
      // bounce off somebody's wall like a billiard ball.
      const out = this.house.normal.angleTo(n.dir) * R;
      const rim = cfg.walk - n.reach;
      if (out > rim) {
        _looseOut.copy(n.dir).addScaledVector(this.house.normal, -n.dir.dot(this.house.normal));
        if (_looseOut.lengthSq() > 1e-12) {
          _looseOut.normalize();
          const arc = rim / R;
          n.dir.copy(this.house.normal).multiplyScalar(Math.cos(arc))
            .addScaledVector(_looseOut, Math.sin(arc)).normalize();
          const into = n.vel.dot(_looseOut);
          if (into > 0) n.vel.addScaledVector(_looseOut, -into);
        }
      }

      n.vel.multiplyScalar(Math.exp(-dt * 1000 / cfg.nudgeDamp));
      n.place();
    }
  }

  // A trunk stops being drawn while you are standing in it.
  //
  // It was load-bearing and is now a backstop, and the difference is that trees
  // became solid. You could once walk into one — nothing outdoors was solid but
  // the water and the house — so this ran on an ordinary stroll. Now the walk
  // stops you a good half-unit clear of the bark (see treeSolidRadius in
  // foliage.js), and what is left are the ways in that are not walking: being
  // airborne over one, and a spot that slipped through.
  //
  // What it fixes is the near plane. At 0.3 it is wider than a trunk is, so from
  // inside one the lens sits past the wall in front of you and saws it open —
  // and what shows through the cut is the INK HULL, which is a third of a hand
  // further out and therefore still in front of the lens. A screen of flat dark
  // brown. The house documents the same trap for its own shell and dodges it by
  // lifting the skin; a tree has nothing to lift, so the trunk simply is not
  // there while you are inside it. Cheap enough to keep for the rare cases:
  // one comparison per tree per frame, and it has never cost a frame.
  //
  // The CANOPY deliberately stays. Its wall is a good three quarters of a unit
  // off even at eye height, so the lens never reaches it, and the whole point of
  // being in a tree is being under the leaves. What you get is what you should
  // get: the world at eye level, and a canopy overhead.
  //
  // Measured from the trunk's own profile rather than a number typed here, so a
  // redrawn trunk takes its own clearance with it. A fifth over, because the
  // profile is the mean the root lobes ride on and they reach a good way past it
  // at the foot.
  _syncTrunk(s) {
    _pw.copy(s.anchor.position);
    _pw.y += this.world.position.y;
    _pw2.subVectors(this.camera.position, _pw);
    const up = _pw2.dot(s.normal);
    const inside = up > -0.3 && up < TRUNK_TOP * s.treeH
      && Math.sqrt(Math.max(0, _pw2.lengthSq() - up * up))
         < trunkRadius(s.treeH, up) * 1.2 + 0.05;
    if (inside === s.inTrunk) return;
    s.inTrunk = inside;
    s.trunk[0].visible = !inside;
    s.trunk[1].visible = !inside;
  }

  // Called every frame. Cheap once settled — one comparison.
  updateDaylight(dtMs) {
    const bl = this.blend;
    if (bl.t === bl.goal) return;

    const step = dtMs * bl.rate;
    bl.t = bl.goal > bl.t
      ? Math.min(bl.goal, bl.t + step)
      : Math.max(bl.goal, bl.t - step);

    // Eased for a fade the clock or a button started, so it drifts in and
    // settles rather than starting and stopping at full speed. Linear for a
    // scrub release, which has to leave the finger's position continuously.
    this._applyBlend(bl.ease ? bl.t * bl.t * (3 - 2 * bl.t) : bl.t);
    if (bl.t === bl.goal) this._settle();
  }

  // Landed. Collapse the pair back to a single sky so the next change starts
  // clean. Nothing is disposed — the skies are cached and shared, and this one
  // is very likely to come back around.
  _settle() {
    const bl = this.blend;

    if (bl.goal === 1) {
      // Arrived at `to`: fold the incoming dome down onto the backdrop, and let
      // the incoming card become the only card.
      this.skyA.material.map = this.skyB.material.map;
      this.skyA.material.needsUpdate = true;
      if (this.discA && bl.swapDisc) {
        this.discA.material.map = this.discB.material.map;
        this.discA.material.color.copy(this.discB.material.color);
        this.discA.material.needsUpdate = true;
        this.discA.position.copy(this.discB.position);
        this.discA.scale.copy(this.discB.scale);
      }
      bl.from = bl.to;
      bl.fromPhase = bl.toPhase;
    } else {
      // Fell back to `from`, which skyA and discA were already holding. Only
      // the incoming half needs putting away.
      bl.to = bl.from;
      bl.toPhase = bl.fromPhase;
    }

    this.skyB.material.map = null;
    this.skyB.visible = false;
    if (this.discA) {
      this.discB.visible = false;
      this.discA.material.opacity = 1;
    }
    bl.swapDisc = false;
    this._seg = -1;

    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this.setDaylight(next);
    }
  }

  addCharacter(ch) {
    this.world.add(ch.object3D);
    // Kept apart from `tintables` rather than poured into it, because a
    // character can leave. Indoors they must wear the room's colour, and a flat
    // list would have the daylight fade repaint them the sky's every frame —
    // which does not show as a wrong tint, it shows as a character flickering
    // between two of them for as long as an hour takes to turn.
    this.cast.push(ch);
    // Whoever walks past the house at night is lit by it like everything else
    // standing there — and whoever is stood under the bulb is lit by THAT. The
    // body only: a shadow is not a surface light lands on.
    //
    // Its own patcher because the cast are the only things that change which
    // side of the wall they are on. See litByCast.
    this._litByCast(ch.bodyMesh.material);
    // Which side that is right now, before a single frame has been drawn. A
    // guest who spawns indoors should already be wearing the room's lamps.
    this._castSide(ch);
    // Whatever tint the world is currently wearing, including mid-fade — a
    // character joining during a transition should not arrive at full noon.
    if (this.phase) for (const m of ch.tintables) m.color.copy(this.tint);
    this.sortables.push({
      pos: ch.object3D.position,
      span: RENDER_SPAN,
      apply: (n) => ch.setRenderBase(n),
      d: 0,
    });
  }

  // The held item, put up and put away. Thin wrappers rather than a reach into
  // `this.hand` from main.js, because of the one thing the hand cannot do for
  // itself: a card raised mid-afternoon has to arrive already wearing the
  // afternoon. The tint list only writes materials while a fade is running, so
  // whoever shows the card copies the current tint onto it here.
  holdItem(canvas) {
    this.hand.hold(canvas);
    this.hand.mat.color.copy(this.tint);
  }

  clearHand() { this.hand.clear(); }

  // The loose piece under a tap, if any is near enough to pick up. Raycast
  // against the built groups themselves, so a tap lands on the bear where the
  // bear actually is — including wherever it has been shoved or set down —
  // rather than on a remembered footprint.
  // `arts` is which pieces count — the caller's item table decides what can be
  // carried, because not every loose thing can: the lantern is shovable but it
  // is a LAMP, and walking off with the room's light is a different feature.
  pickLoose(raycaster, playerDir, arts) {
    const reach = Math.cos(CONFIG.uniques.reach / CONFIG.globe.radius);
    for (const loose of this.loose) {
      if (!loose.anchor.visible) continue;
      if (arts && !arts.includes(loose.art)) continue;
      if (playerDir.dot(loose.dir) < reach) continue;
      if (raycaster.intersectObject(loose.anchor, true).length) return loose;
    }
    return null;
  }

  // Set a carried piece down at `spot`, or send it home. One method for both,
  // because they are the same operation with a different destination — and
  // `place()` is the closure built where the piece was born, so a bear set
  // down on the meadow is stood up by the exact code that stood it on the
  // room's floor.
  placeLoose(loose, spot) {
    loose.dir.copy(spot || loose.home).normalize();
    loose.vel.set(0, 0, 0);
    loose.place();
    loose.anchor.visible = true;
  }

  looseByArt(art) {
    return this.loose.find((l) => l.art === art) || null;
  }

  // Pull the tuft nearest `spot`, if there is one within snapping distance and
  // your feet are near enough to be pulling rather than pointing. True when a
  // tuft came out; the caller owns what that is worth (a fistful of くさ).
  //
  // On the machine's own clock, not the tap's — see ONE CLOCK in fishing.js,
  // whose rule this follows: `_tuftNow` is stamped by update(), and a pluck is
  // dated to the frame it happened in.
  pluckTuft(spot, playerDir) {
    const T = this._tufts;
    const k = CONFIG.kusa;
    const R = CONFIG.globe.radius;
    const snapCos = Math.cos(k.snap / R);
    const reachCos = Math.cos(k.reach / R);
    if (playerDir.dot(spot) < reachCos) return false;
    let best = -1;
    let bestDot = snapCos;
    for (let i = 0; i < T.dirs.length; i++) {
      if (T.state.has(i)) continue;
      const d = T.dirs[i].dot(spot);
      if (d > bestDot) { bestDot = d; best = i; }
    }
    if (best < 0) return false;
    // Collapse the tuft onto its own root. Zero-area triangles are discarded
    // before they are shaded, so a plucked tuft costs its vertices and nothing
    // else while it is gone.
    const pos = T.mesh.geometry.attributes.position;
    const base = T.dirs[best];
    for (let v = best * T.per; v < (best + 1) * T.per; v++) {
      pos.setXYZ(v, base.x * R, base.y * R, base.z * R);
    }
    pos.needsUpdate = true;
    T.state.set(best, { at: this._tuftNow || 0 });
    this._lastTuft = best;
    return true;
  }

  // The tuft's twin of restoreMushroom: put the last pulled one straight back,
  // for the caller that discovers its pack is full only after pulling.
  restoreTuft() {
    const T = this._tufts;
    const i = this._lastTuft;
    if (i === undefined || i === null || !T.state.has(i)) return;
    const pos = T.mesh.geometry.attributes.position;
    for (let v = i * T.per; v < (i + 1) * T.per; v++) {
      pos.setXYZ(v, T.original[v * 3], T.original[v * 3 + 1], T.original[v * 3 + 2]);
    }
    pos.needsUpdate = true;
    T.state.delete(i);
    this._lastTuft = null;
  }

  // Pick the mushroom nearest `spot`, if one is in reach. Returns its item id
  // — which of the two drawings it was — or null.
  //
  // Exactly the grass's mechanism at a different scale: a cover mesh is built
  // item by item, so each mushroom owns a contiguous run of vertices, and
  // taking one is collapsing that run onto its own base. What differs is that a
  // mushroom is a THING rather than a texture, so it is remembered
  // individually (see _shrooms) and comes back as itself.
  pickMushroom(spot, playerDir) {
    const S = this._shrooms;
    const k = CONFIG.kinoko;
    const R = CONFIG.globe.radius;
    if (playerDir.dot(spot) < Math.cos(k.reach / R)) return null;
    let best = null;
    let bestDot = Math.cos(k.snap / R);
    for (const m of S.items) {
      if (m.gone) continue;
      const d = m.dir.dot(spot);
      if (d > bestDot) { bestDot = d; best = m; }
    }
    if (!best) return null;
    const pos = best.mesh.geometry.attributes.position;
    for (let v = best.slot * S.per; v < (best.slot + 1) * S.per; v++) {
      pos.setXYZ(v, best.dir.x * R, best.dir.y * R, best.dir.z * R);
    }
    pos.needsUpdate = true;
    best.gone = this._tuftNow || 1;
    this._lastShroom = best;
    return best.item;
  }

  // Put the last picked mushroom straight back, unpicked. For the one caller
  // that can change its mind after the fact: a full pack, which cannot be known
  // until the pick has already answered. Nothing else should use it.
  restoreMushroom() {
    const m = this._lastShroom;
    if (!m || !m.gone) return;
    const S = this._shrooms;
    const pos = m.mesh.geometry.attributes.position;
    const orig = m.mesh.userData.original;
    for (let v = m.slot * S.per; v < (m.slot + 1) * S.per; v++) {
      pos.setXYZ(v, orig[v * 3], orig[v * 3 + 1], orig[v * 3 + 2]);
    }
    pos.needsUpdate = true;
    m.gone = 0;
    this._lastShroom = null;
  }

  // Mushrooms coming back. Slower than grass and with no growth animation:
  // grass springs, a mushroom is simply there in the morning where it was not
  // before, which is most of what makes finding one feel like finding one.
  _growShrooms(now) {
    const S = this._shrooms;
    if (!S) return;
    const R = CONFIG.globe.radius;
    for (const m of S.items) {
      if (!m.gone || now - m.gone < CONFIG.kinoko.regrowMs) continue;
      const pos = m.mesh.geometry.attributes.position;
      const orig = m.mesh.userData.original;
      for (let v = m.slot * S.per; v < (m.slot + 1) * S.per; v++) {
        pos.setXYZ(v, orig[v * 3], orig[v * 3 + 1], orig[v * 3 + 2]);
      }
      pos.needsUpdate = true;
      m.gone = 0;
    }
  }

  // Regrowth, driven from update(). A tuft waits out regrowMs collapsed, then
  // eases back out of the ground over growMs — scaled about its root, so it
  // grows the way it reads: out of the earth, not faded in.
  _growTufts(now) {
    const T = this._tufts;
    if (!T || !T.state.size) return;
    const k = CONFIG.kusa;
    const pos = T.mesh.geometry.attributes.position;
    const R = CONFIG.globe.radius;
    let touched = false;
    for (const [i, s] of T.state) {
      const over = now - s.at - k.regrowMs;
      if (over < 0) continue;
      const t = Math.min(1, over / k.growMs);
      const e = t * t * (3 - 2 * t);
      const base = T.dirs[i];
      for (let v = i * T.per; v < (i + 1) * T.per; v++) {
        pos.setXYZ(
          v,
          base.x * R + (T.original[v * 3] - base.x * R) * e,
          base.y * R + (T.original[v * 3 + 1] - base.y * R) * e,
          base.z * R + (T.original[v * 3 + 2] - base.z * R) * e,
        );
      }
      touched = true;
      if (t >= 1) T.state.delete(i);
    }
    if (touched) pos.needsUpdate = true;
  }

  // Sprites blend, so nothing sorts them for us — painter's order has to be
  // rebuilt from the camera every frame or a far sprite draws over a near one.
  sortSprites() {
    const cam = this.camera.position;
    for (const s of this.sortables) {
      const p = s.pos;
      const dx = cam.x - p.x;
      const dy = cam.y - p.y;
      const dz = cam.z - p.z;
      s.d = dx * dx + dy * dy + dz * dz;
    }
    this.sortables.sort((a, b) => b.d - a.d);
    let base = 10;
    for (const s of this.sortables) {
      s.apply(base);
      base += s.span;
    }
  }

  // Stand the sky over the spot you are on, so its axis is your zenith.
  //
  // Nudged from wherever it is already pointing rather than rebuilt from
  // scratch each frame, which matters more than it sounds. Any recipe that
  // computes the whole orientation from the anchor alone has to invent the
  // twist about that axis, and no such choice works everywhere on a sphere —
  // there is always a point where it tears. Building it out of lat/lon puts
  // that point at the poles, which was safe only while the rig clamped you
  // short of them; it no longer does, and walking over the top snapped the sky
  // a measured 180° in a single step.
  //
  // Turning the axis from where it is to where it belongs has no such choice to
  // make. The step is a fraction of a degree, so the shortest arc between the
  // two is always well conditioned, and it carries the twist along instead of
  // inventing it — parallel transport, which is exactly the thing that has no
  // singularity to run into. Reading the current axis back out of the quaternion
  // rather than caching last frame's anchor also makes it self-correcting: any
  // drift is measured and removed on the next frame, so your zenith stays your
  // zenith and the moon holds its height indefinitely.
  //
  // The price is that the sky's bearing depends on the path you walked, not
  // only on where you ended up: stroll a loop and the sun comes back over the
  // other shoulder. That is real geometry rather than a glitch, and it is
  // invisible in kind — height is what the eye notices, and height is exactly
  // what this holds fixed.
  _aimSky(anchor) {
    _skyUp.copy(UP).applyQuaternion(this.skyRig.quaternion);
    _qStep.setFromUnitVectors(_skyUp, anchor);
    this.skyRig.quaternion.premultiply(_qStep).normalize();
  }

  update(t, anchor) {
    const g = CONFIG.globe;
    this.world.position.y = Math.sin(t / g.bobPeriod * Math.PI * 2) * g.bob;

    // Where each lamp is, in the same space the shader measures from. It has to
    // be world space — that is what `modelMatrix * position` gives — and the
    // whole planet floats, so this moves by the bob every frame even though
    // nothing has walked anywhere. Set immediately after the bob for that
    // reason: a frame late and the light slides against the ground it is on.
    for (const s of this.litProps) {
      s.anchor.getWorldPosition(this.lampUniforms.uLampAt.value[s.lit.slot]);
    }
    // ...and the room's, which move for a second reason on top of the bob: the
    // lantern is loose furniture and goes where it is kicked. Read off an
    // object parented to the piece rather than tracked by hand, so a shoved
    // lamp takes its light with it and nothing has to remember to move it —
    // the same arrangement its pool has always been in.
    for (const L of this.roomLights) {
      L.at.getWorldPosition(this.lampUniforms.uLampAt.value[L.slot]);
    }

    // Which lamps whatever you are holding reads, which is simply which lamps
    // YOU are standing among. The cast get this on the frame they cross the
    // threshold; the hand cannot, because it has no `dir` of its own to watch —
    // it is wherever the camera is. So it is asked of the anchor every frame.
    //
    // No anchor means you are off the ground and in the sky, where the hand has
    // already been put away. Outdoors is the honest answer for that: the room's
    // lamps should not reach you a hundred units up over your own roof.
    if (this._handSide) {
      this._handSide.value = anchor && this.isInside(anchor) ? 1 : 0;
    }

    // Before the billboarding below: those cards hang inside the sky, so their
    // lookAt has to resolve against a parent that has already been turned. It
    // also has to run every frame without fail — the aim is incremental, so a
    // skipped frame is a frame the sky did not follow you through.
    if (anchor) this._aimSky(anchor);

    // Lift the lid when you rise out of your own house.
    //
    // You can take off from indoors now, and the camera's way out is straight
    // up through the roof. Left alone that is the oldest artifact there is: the
    // near plane saws a hole in the shell as it passes, which reads as the
    // building tearing rather than as you leaving it.
    //
    // So the OUTSIDE of the building comes off once the camera is over it and
    // within its footprint — the skin, its ink hull and the outward faces of
    // the openings. The inner wall deliberately stays, and that distinction is
    // the whole of what makes this read as anything: take the lot and the
    // house does not open, it simply is not there, leaving a rug and a table
    // sitting out on the grass with a character visible where a wall should
    // be. Keeping the inner wall leaves you looking down into a bowl with a
    // room in it, which is a doll's house — and since that wall is drawn from
    // its back faces, the near half is culled for free and never blocks the
    // view down.
    //
    // The inner wall is not hidden even at the moment the camera passes
    // through it, and does not need to be: it is crossed at the apex, straight
    // overhead, while the view at that altitude is still pitched forward and
    // down. The clip happens behind your head.
    //
    // Only while you are over YOUR OWN roof: step off the footprint, or land,
    // and the house is a house again. Climbing on, the camera swings off the
    // overhead line — measured 20 units of offset by the time it is 17 up — so
    // the far view has the building solid, as it always was.
    if (this.house && this.house.shell) {
      const c = CONFIG.camera;
      const rad = this.houseRad;
      this.house.anchor.getWorldPosition(_pw);
      _pw2.copy(this.camera.position).sub(_pw);
      const up = _pw2.dot(this.house.normal);
      const off = Math.sqrt(Math.max(0, _pw2.lengthSq() - up * up));
      // AIRBORNE, and not merely higher than the wall beside you. The dome
      // curls down to nothing at its rim, so the roof over the doorway is only
      // 1.64 — below a 1.7 eye. Without this the building took its own skin
      // off while you stood on its threshold, which is the one place you are
      // most certainly looking at it.
      const over = up > c.eyeHeight + c.groundBand
        && off < rad && up > Math.sqrt(Math.max(0, rad * rad - off * off));
      if (over !== this._overRoof) {
        this._overRoof = over;
        for (const m of this.houseOuter) m.visible = !over;
      }
    }

    // Crossing the threshold re-tints on the spot. The daylight blend only
    // writes colours while a fade is running, and walking through the door is
    // not a fade — without this, a guest stepping in at midnight would stand
    // in the warm room still wearing moonlight until the next hour change.
    for (const ch of this.cast) {
      const inside = this.isInside(ch.dir);
      if (inside === ch._wasInside) continue;
      ch._wasInside = inside;
      const c = inside ? this.tintIn : this.tint;
      for (const m of ch.tintables) m.color.copy(c);
      // Which set of lamps they read, switched on the same crossing and for the
      // same reason the colour is. A hard switch, matching the tint above: the
      // threshold is already a line where the world changes for them, and a
      // lamp fading across it while the wall's colour snapped would read as two
      // different doorways.
      this._castSide(ch);
    }

    // Square on to you wherever you have walked to. At 170 units against a
    // camera that never leaves the middle 35 this is a small correction, but
    // it is the difference between a round sun and a subtly sheared one.
    // Both cards, not just the settled one — during a sun-to-moon fade the
    // incoming card is just as visible as the outgoing one.
    if (this.discA) {
      this.discA.lookAt(this.camera.position);
      if (this.discB.visible) this.discB.lookAt(this.camera.position);
    }

    // Stars pulse on the GPU; all this does is move time along. Skipped
    // outright by day, when the field is not drawn at all.
    if (this.stars.visible) {
      for (const m of this._twinkleMats) {
        const sh = m.userData.shader;
        if (sh) sh.uniforms.uTime.value = t / 1000;
      }
    }

    // ...and the same for the wind. Every blade on the planet bends off this one
    // number, so the whole of what moving grass costs per frame is a single
    // uniform write — the bending itself happens on the GPU, in the vertex
    // shader, for geometry that was uploaded once at load.
    if (this._grassMat) {
      const sh = this._grassMat.userData.shader;
      if (sh) sh.uniforms.uTime.value = t / 1000;
    }

    // The light on the water crawling across it. Two floats a pond, and no
    // shader at all — the glint sheet is set to repeat, so sliding its offset
    // moves every highlight at once. One clock for both ponds, because two
    // ponds sparkling out of step would be two different afternoons.
    if (this.ponds) driftGlints(this.ponds, t / 1000);

    // ...and the fish under them, who mind where you are stood.
    if (this.fish) this.fish.update(t, anchor);

    // Who is standing in the water's reflection.
    //
    // Everybody gets one, always, and the stencil decides whether any of it is
    // ever seen — so the only question here is how far away from a pond the card
    // is worth submitting at all. `REFLECT_ARC` is generous rather than tight:
    // the mark the water leaves is the truth, and being over-eager costs one
    // stencilled draw that fills no pixels, while being mean would clip somebody
    // whose reflection was still reaching out into the pond.
    //
    // Faded in over the last part of the approach rather than switched on,
    // because water does not start reflecting you at a line on the grass. The
    // fade is DISTANCE, not depth: it stands in for the fact that a reflection
    // stretches away from its object and thins as it goes.
    if (this.ponds && this.cast.length) {
      const water = this.ponds[0].body.material.color;
      for (const ch of this.cast) {
        let near = 0;
        for (const p of this.ponds) {
          const arc = Math.acos(Math.max(-1, Math.min(1, ch.dir.dot(p.centre))));
          const edge = lakeReach(p.lake, tangentToward(ch.dir, p.centre, _refAway));
          near = Math.max(near, 1 - (arc - edge) / REFLECT_ARC);
        }
        ch.setReflection(water, REFLECT_MIX, Math.min(1, Math.max(0, near)) * REFLECT_ALPHA);
      }
    }

    // Climb far enough and the little props stop being worth a draw call each.
    // The altitude is a fraction of the radius for the same reason the far-view
    // altitudes are: what makes a stump sub-pixel is how far out you are compared
    // to the size of the planet, not an absolute height above it.
    const showSmall = this.camera.position.length() < g.radius * 2.2;
    if (showSmall !== this._showSmall) {
      this._showSmall = showSmall;
      for (const a of this.smallProps) a.visible = showSmall;
    }

    // Every card squares to your view and leans away from the planet's centre
    // — on a sphere each one has its own idea of which way is up — and sinks
    // behind the horizon rather than winking out at the silhouette.
    const R = g.radius;
    const camLen = Math.max(this.camera.position.length(), R + 0.01);
    const camReach = Math.acos(clampUnit(R / camLen));
    this._camDir.copy(this.camera.position).normalize();

    // The far distance is a GROUND-LEVEL ILLUSION and goes as you leave it.
    //
    // It is a band pinned to where the limb falls when your eye is 1.7 up. Climb
    // and the limb drops away from it — by 2.6 of altitude it has moved seven
    // degrees, and a range that used to sit on the skyline is left hanging in
    // the air over a planet you can now see the edge of. So it fades out across
    // the first stretch of the climb and is gone well before the whole planet is
    // in frame, which is the same rule the edge-of-screen faces follow: some
    // things are only true from down here.
    // Measured from the EYE, not from the grass. `camLen - R` is 1.7 while you
    // are simply stood there, so a fade written against it starts two thirds
    // faded before anybody has left the ground.
    const climbed = camLen - R - CONFIG.camera.eyeHeight;
    const far = Math.min(1, Math.max(0, 1 - (climbed - 0.6) / 2.6));
    if (far !== this._horizonFade) {
      this._horizonFade = far;
      this.horizon.material.opacity = far * far;
      this.horizon.visible = far > 0.002;
    }

    // The held item ducks out of sight past the same threshold that separates
    // standing from flying everywhere else. In the sky the view is a map, and
    // a fish floating over the map is the hand insisting on a fiction the
    // camera has left behind.
    this.hand.update(t, climbed > CONFIG.camera.groundBand);

    // Plucked grass growing back, and the clock plucks are dated by.
    this._tuftNow = t;
    this._growTufts(t);
    this._growShrooms(t);

    // Nothing fades: the depth buffer hides whatever the curve has swallowed,
    // so props sink behind the horizon rather than dissolving. This is only a
    // cull, kept generous so it never clips something still on screen.
    for (const s of this.sprites) {
      if (s.small && !showSmall) continue;
      const away = Math.acos(clampUnit(s.normal.dot(this._camDir)));
      const seen = away < camReach + s.horizon + 0.10;
      if (seen !== s.seen) {
        s.seen = seen;
        // Anything built sinks behind the curve as its shell; everything else
        // as its card. A retired card must stay hidden either way.
        s.mesh.visible = seen && !s.retired;
        if (s.shell) s.shell.visible = seen;
        // ...and the room goes with the building it is inside, or the furniture
        // would stand on the horizon after the walls had sunk. Keyed on being
        // THE HOUSE rather than on merely having a shell, which was the same
        // test until the trees grew shells of their own — at which point the
        // last tree to cross the horizon was taking the front room with it.
        if (s === this.house && this.interior) this.interior.visible = seen;
        if (s.lit) this._syncLamp(s);
      }
      if (seen) orientBillboard(s.holder, s.anchor.position, s.normal, this.camera, s.standoff, true);
      if (seen && s.trunk) this._syncTrunk(s);
    }
    this.sortSprites();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // The held thing sits at a fraction of the FRAME, and the frame just
    // changed shape — see _fit in hand.js.
    if (this.hand) this.hand.resize();
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
