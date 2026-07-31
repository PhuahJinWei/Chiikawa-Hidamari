// A small planet under a sky dome. The globe and the house are the only real
// 3D geometry out here — everything else standing on the planet is a flat card
// squared to your view axis, which is what keeps the paper-cutout look while
// you walk about.

import * as THREE from 'three';
import { CONFIG, PAL } from './config.js';
import { CAST } from './cast.js';
import {
  paintSky, paintGlobe, paintHorizon,
  paintShadow, SHADOW_ROOM, paintLampGlow, litSpot, paintWalkMarker, paintFocusMark,
  paintSheet, sheetBounds, makeRandom, SKY_DESIGN,
  starStamp, STAR_SEED,
  paintHouseSkin, paintHouseWindowFrame, paintHousePlateBlock,
  paintHouseDoorFrame, paintDoorway,
  paintRoomWall, paintRoomFloor, paintRug, paintTableTop,
  archPath, DOOR_SHEET, WINDOW_SHEET,
  paintCaveSkin, paintCaveWall, paintCaveFloor, paintCaveMouth, paintCaveMouthInner,
  paintCaveDay, paintCaveNight, MOUTH_SHEET, paintZzz,
  paintCloudDeck, paintRainbow,
} from './art.js';
import { Weatherfall } from './falling.js';
import { Snowfield, BASE as FIELD_BASE } from './snowfield.js';
import { WEATHERS, WEATHER_CAST, isWater } from './weather.js';
import { BUILD } from './furniture.js';
import {
  buildTree, buildStump, buildGrassBlades, inkMaterials,
  trunkRadius, stumpRadius, stumpTop, stumpTopRadius, treeSolidRadius, TRUNK_TOP,
} from './foliage.js';
import {
  IMG, TREE_VARIANTS, FLOWER_VARIANTS,
  MUSHROOM_VARIANTS, SKY_DISC_ART, WORLD_SNOW, TUNE_VARIANTS,
} from './assets.js';
import { LOOK, PHASES, clockRate } from './daylight.js';
import { PLATEAU, restoreGLSL, RESTORE_APPLY } from './light-model.js';
import { RENDER_SPAN } from './character.js';
import {
  UP, orientBillboard, dirFromLatLon, inLake, setBuildings, inBuilding, setScenery,
  setSolids, addSolids, groundCap, SHADOW_LIFT, localFrame, biomesAt, growWeight,
  lakeReach, perchAlongRay, inSolid, underRoof,
} from './sphere.js';
import { buildLake, driftWater, waterHour } from './water.js';
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
// a second draw call for nothing.
//
// `small` used to sit beside `shadow` on every row, and it is gone from all of
// them. It fed one reader, the altitude cull in update(), which dropped every
// bush and stump past 2.2 radii; that cull has been removed and the note where
// it ran says why. The flags went with it rather than staying as data nobody
// reads — a field that still describes the world truthfully but drives nothing
// is the kind of thing a later change wires back up by accident.
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
  house: { h: 3.0, shadow: false },
  // Hachiware's mound, and the biggest thing standing on the planet. No shadow,
  // for the same reason the house has none: its disc would be cut from its own
  // width, so it would lie entirely inside the building and never darken a
  // blade of grass anybody could see.
  cave: { h: 4.0, shadow: false },
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
  tree1: { h: 3.8, shadow: true, aspect: 0.7919911, drawn: 0.66292135 },
  tree2: { h: 3.8, shadow: true, aspect: 0.7919911, drawn: 0.70084270 },
  tree3: { h: 3.8, shadow: true, aspect: 0.7919911, drawn: 0.72050562 },
  // Drawn art. A bush was never built — every bush on the planet is still its
  // drawing on a card — so these two keep reading their own pixels.
  bush1: { h: 0.72, shadow: false },
  bush2: { h: 0.70, shadow: false },
  stump: { h: 0.60, shadow: true, aspect: 2.52592593, drawn: 0.96480938 },
  // Giant beside the cast but still smaller than the anime's two-Usagi-tall
  // version. Built at 2.85, it stands about 1.4 Usagis high; the coupe's bowl
  // supplies the 1.11 width-to-height ratio.
  puddingcup: { h: 2.85, shadow: true, aspect: 1.11, drawn: 1.0 },
};

// Trees, bushes and stumps only — the small stuff is merged ground cover. Every
// one of these is a draw call, so this is the knob to turn down if a phone
// struggles.
//
// Counted for a globe.radius of 8. It is a count over a fixed area, so shrinking
// the planet without shrinking this crowds it: scale by the square of the radius
// change to hold the spacing you already had.
// 100, up from 58, and almost all of the increase is paid straight back out to
// the biomes. Scenery is now REFUSED on the sand — see `scatter`, and
// CONFIG.biomes for why nothing stands there — and the two clearings between
// them weigh a third of the surface, so a spiral counted for a whole planet
// quietly plants a third fewer things than it says.
//
// Measured rather than scaled, because the cull is not uniform: the spiral is
// fixed, so which spots fall on sand is a fact about this arrangement and not a
// probability. 100 asked for is 45 standing, against 46 today — the same planet's
// worth of props, all of them now in the two thirds of the world that wants
// them, which is about half again the density the meadow ever had. The cost is
// unchanged: what survives the cull is what becomes a draw call.
const SCENERY_COUNT = 100;
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

// ...and most of the stump slot's spots are holes as well.
//
// A fifth of the scatter is a lot of stump. Nine of them stood on the planet
// against eight trees, which is a felled wood rather than the occasional cut
// trunk — and a stump reads as an event, the one place out here somebody has
// been at work. Nine of anything is not an event.
//
// THINNED PER SPOT rather than by editing the list above, and that is the whole
// reason this is a separate number. A slot is `i % PROP_TYPES.length`, so
// changing the list's LENGTH re-deals every prop on the planet — the note above
// says why the rock was left as a hole for exactly that reason, and lengthening
// the list to make one entry rarer would move every tree, bush and blade of
// grass to thin one kind. Skipping some of the stump slot's own turns moves
// nothing: the spots that survive are the spots they always were, and the rest
// are grass, which is what a hole in this spiral has always meant.
//
// EVERY OTHER TURN, which takes the planet from nine stumps to four.
//
// Three was tried first and is too few: it leaves TWO on the whole world, and
// two is not rare, it is absent. Rarity here is not free, because a stump is the
// only thing out of doors with a top — it is the one perch a set-down piece can
// topple off (see putDownUnique), and the one place 「いっておいで」 can send a
// friend that is not somebody's house. Both of those want a stump to be a thing
// you come across, not a thing you would have to go looking for.
//
// The four that remain are spread rather than sampled from one stretch of the
// spiral: consecutive points are a golden angle apart, so every other one is
// still a spiral. Measured, the closest pair is 5.7 units apart and the widest
// gap 14.2, on a planet whose horizon is under 5 — so no two are ever in sight
// of each other, which is what makes each one read as its own small event.
const STUMP_SPACING = 2;

// Which entry in a biome's `grows` each slot answers to. Two bush drawings are
// ONE KIND of thing to a biome — "are there bushes here" is not a question a
// hillside answers twice — for the same reason a tree's three drawings share a
// slot below.
const PROP_KIND = { tree: 'tree', bush1: 'bush', bush2: 'bush', stump: 'stump' };

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
function solidRadius(type, h) {
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
  if (type === 'puddingcup') return h * 0.555;
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
const NIGHT_ART = { house: 'houseNight', cave: 'caveNight' };

// WHAT A HOME IS MADE OF, keyed by CONFIG.homes' `style`.
//
// Everything that differs between Chiikawa's house and Hachiware's cave, in one
// table — and the fact that it fits in one table is the whole argument for
// having built the cave through the house's own code rather than beside it.
// Two buildings that share a shape, a collision model, a lighting model and a
// way of cutting holes in themselves, and disagree about six painters, a pen
// colour and whether they have windows.
//
// `sheet` is the opening's own canvas proportions, and it is the one entry that
// does real geometric work. Every opening in this app takes its width from
// config and its HEIGHT from its sheet's aspect — the rule that stopped the
// house's door being two free numbers that drifted into a flattened arch — so
// a mouth that is much wider than it is tall can only say so by being drawn on
// a wider canvas. MOUTH_SHEET is DOOR_SHEET stretched half again.
//
// `windows` is not a count and not a list: the bearings live in each home's own
// spec. It only says whether this style HAS the idea, which is what lets the
// window arithmetic below be skipped rather than run against an empty list.
const HOME_ART = {
  house: {
    skin: paintHouseSkin,
    wall: paintRoomWall,
    floor: paintRoomFloor,
    doorOuter: paintHouseDoorFrame,
    doorInner: paintDoorway,
    doorSheet: DOOR_SHEET,
    ink: PAL.houseInk,
    windows: true,
    plate: paintHousePlateBlock,
  },
  cave: {
    skin: paintCaveSkin,
    wall: paintCaveWall,
    floor: paintCaveFloor,
    doorOuter: paintCaveMouth,
    doorInner: paintCaveMouthInner,
    doorSheet: MOUTH_SHEET,
    ink: PAL.caveInk,
    windows: false,
  },
};

// ------------------------------------------------------------ the mound's lumps
//
// WHAT MAKES A CAVE NOT A HOUSE IS ITS OUTLINE, and until this the two had the
// same outline. Both homes are one SphereGeometry — a hemisphere plus a skirt at
// whatever radius their wall is — and every difference between them was PAINT:
// the stone net, the turf crown, the wandered arch, the two stalactites. All of
// it good, and all of it losing to silhouette, which is what the eye reads
// first and what this drawing style has instead of shading. Hachiware's place
// read as a stone house because it WAS a house, drawn in rock.
//
// So the rock gets pushed about. A short authored list of lobes — a bearing, an
// elevation, a height, a width — summed into a radial displacement over the
// dome's own vertices, turning one clean hemisphere into a lumpy mound with its
// mass rising behind the mouth.
//
// OUTWARD ONLY, and that is the rule the whole thing is safe because of.
// Nothing moves inward, so: the room is untouched, the interior wall a hair
// inside can never be breached from without, the analytic wall the collision
// layer holds still agrees with what you can see, and the doorway arithmetic —
// which was worked out against `rad` a hundred lines before this runs — stays
// true. This is a drawing change wearing no physics.
//
// AUTHORED RATHER THAN NOISE, for the same reason furniture.js keeps a fixed
// WOBBLE table instead of calling Math.random: a shape that has to be judged
// against a reference drawing must be the same shape every time it is looked at.
// Four lobes, and each one is a decision:
//
//   the SHOULDER, nearly behind the mouth and high on the flank, is the mass.
//   A hill you walk up to should be biggest behind the hole, so the hole reads
//   as cut INTO something rather than as a lid propped over it.
//
//   two FLANK humps, at different heights and unequal sizes, because a mound
//   with symmetrical sides is a roof.
//
//   the CROWN, small and deliberately off to one side, so the top of the
//   silhouette is not the top of a sphere.
const caveLobe = (at, up, amp, wide) => ({
  // Bearing to a direction, the same chart the doorway and the furniture use:
  // bearing 0 is +Z and positive turns toward +X. `up` is the polar angle down
  // from the crown, so 0 is straight up and PI/2 is the ground line.
  dir: new THREE.Vector3(
    Math.sin(up) * Math.sin(at), Math.cos(up), Math.sin(up) * Math.cos(at),
  ),
  amp,
  wide,
});

// NARROW ENOUGH TO READ SEPARATELY, which took a second pass to get right. The
// first set was four wide lobes and they summed into one smooth mass: the
// silhouette leaned over and stayed a single clean curve, which is a dome that
// has been pushed, not a hill. A lump only reads as a lump if the surface comes
// back down between it and the next one, so these are half the width and there
// are nearly twice as many.
//
// They also had to come DOWN. The first set all sat high, and with the fade that
// keeps lumps out of the buried rim it meant every one of them landed in the
// turf: rendered side by side, the rock band below the grass was identical
// before and after. All the shape was happening in the grass, and the rock —
// which is the half that says cave — was still a perfect arc.
// SPREAD AROUND THE COMPASS, which is the thing that took three passes to
// understand. What shows on a silhouette is only ever the handful of lobes near
// the LIMB — the great circle you happen to be looking edge-on at — so a few
// large lobes give you one broad bulge from every angle and never a lumpy
// outline. Measured from a three-quarter view, four wide lobes moved the crown
// twelve pixels and left the profile a single clean curve.
//
// The answer is more of them and smaller, at bearings all the way round, so that
// wherever you stand two or three are on the limb and the outline breaks up.
// Amplitudes stay modest for the same reason the widths do: this is a mound with
// weathered lumps, not a bag of boulders.
const CAVE_LOBES = [
  // The mass, nearly behind the mouth and high on the flank. A hill should be
  // biggest behind its hole, so the hole reads as cut INTO something.
  caveLobe(Math.PI * 0.92, 0.58, 0.92, 0.62),
  // The crown, deliberately off to one side so the top of the outline is not
  // the top of a sphere, with a smaller one beside it to break the ridge.
  caveLobe(1.15, 0.24, 0.46, 0.44),
  caveLobe(-0.62, 0.40, 0.30, 0.34),
  // The upper ring: shoulders at unequal sizes and heights, because a mound
  // with symmetrical sides is a roof.
  caveLobe(-1.85, 0.86, 0.62, 0.42),
  caveLobe(2.35, 0.95, 0.48, 0.38),
  caveLobe(-2.90, 0.72, 0.54, 0.40),
  caveLobe(1.85, 0.62, 0.34, 0.32),
  // ...and the lower ring, down in the stone, which is where the eye reads
  // "rock" rather than "grass over something".
  caveLobe(-2.55, 1.30, 0.42, 0.34),
  caveLobe(2.95, 1.24, 0.38, 0.32),
  caveLobe(-1.05, 1.22, 0.30, 0.30),
  caveLobe(2.05, 1.32, 0.34, 0.30),
  caveLobe(-3.05, 1.16, 0.30, 0.28),
];

// How far the lobes lift the surface in one given direction. THE ONE PLACE THAT
// KNOWS, so the displacement the mesh actually gets and the bound everything
// else sizes itself against cannot drift apart.
const _liftAt = new THREE.Vector3();
function caveLiftAt(u) {
  let lift = 0;
  for (const L of CAVE_LOBES) {
    const a = Math.acos(Math.max(-1, Math.min(1, u.dot(L.dir))));
    if (a >= L.wide) continue;
    const t = 1 - a / L.wide;
    lift += L.amp * t * t * (3 - 2 * t);
  }
  return lift;
}

// The most the surface is lifted ANYWHERE, for the readers that need to know how
// big this thing actually got — the roof lid, which sizes itself off the
// analytic radius and would otherwise whip the rock away while you were still
// climbing past a crown it did not know about.
//
// MEASURED, because it cannot be reasoned about cheaply and both cheap guesses
// were wrong. The largest single amplitude in the table is 0.92; the surface
// reaches 1.106, because lobes overlap and add. Evaluating the sum at each
// lobe's own centre gets 0.968 and is still short, because the true maximum of a
// sum of overlapping bumps sits BETWEEN their centres, not on one.
//
// So: sample the sphere and look. A Fibonacci spiral covers it evenly with no
// clustering at the poles, two thousand points is far finer than lobes this wide
// can hide a peak in, and it runs once at module load. The margin is for the
// gap between the sample and the true continuous maximum.
const CAVE_LIFT = (() => {
  const N = 2000;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  let best = 0;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GOLDEN * i;
    _liftAt.set(Math.cos(th) * r, y, Math.sin(th) * r);
    const v = caveLiftAt(_liftAt);
    if (v > best) best = v;
  }
  return best * 1.03;
})();

// How far above the ground line the lumps stop. The shell carries on past the
// equator and into the hillside — that skirt is what buries the rim — and a lump
// riding down into it would lift the buried edge back out into daylight, so the
// displacement has to be exactly zero by the time it gets there.
//
// 0.30 rather than the 0.45 it started at, and the difference is the whole rock
// face. At 0.45 the fade began 26 degrees above the ground line, which is most
// of the exposed stone, so every lobe that reached it was flattened and the rock
// came out as untouched as it had ever been. 0.30 lets the outcrops live in the
// stone and still leaves the rim itself alone.
const CAVE_GROUND_FADE = 0.30;

const _ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _c1 = (x) => Math.max(-1, Math.min(1, x));

// WHERE THE SURFACE ACTUALLY ENDS UP, in one direction: the raw lobe sum, masked
// at the mouth and faded into the ground.
//
// Shared, and it has to be. Two things need this answer and they must agree to
// the millimetre — the dome's own vertices, and anything planted ON that dome,
// which is the crown grass. A tuft that used the unmasked lift would float off
// the rock everywhere near the mouth, by as much as a whole lobe's height.
function caveSurfaceLift(u, doorDir, guard) {
  let lift = caveLiftAt(u);
  if (lift <= 0) return 0;
  const atDoor = Math.acos(_c1(u.dot(doorDir)));
  if (atDoor < guard) lift *= _ease(atDoor / guard);
  const theta = Math.acos(_c1(u.y));
  const edge = Math.PI / 2;
  if (theta > edge - CAVE_GROUND_FADE) {
    lift *= _ease((edge - theta) / CAVE_GROUND_FADE);
  }
  return lift;
}

// Push one dome's vertices out. `doorDir` is the middle of the mouth and
// `guard` how wide a circle around it to leave alone; the frames and the punched
// hole are placed on the unbulged sphere, so the surface has to still BE the
// unbulged sphere everywhere they land.
function caveBulge(geo, doorDir, guard) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const r0 = v.length();
    if (r0 < 1e-6) continue;
    v.multiplyScalar(1 / r0);
    // The pad is preserved rather than replaced: the ink hull is built a hair
    // outside the skin and has to stay a hair outside it, bumps and all, or the
    // line would sink into the rock exactly where the rock is most interesting.
    v.multiplyScalar(r0 + caveSurfaceLift(v, doorDir, guard));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

// WHERE THE PAINTED TURF ENDS, as a polar angle down from the crown.
//
// Not a number of its own: paintCaveSkin fills grass from the top of its canvas
// down to TURF of the way across it, and that canvas is stretched over the
// shell's whole span — the hemisphere PLUS the skirt that buries the rim. So the
// grass line is that fraction of that span, and stating it any other way would
// be a second copy of a number art.js already owns.
//
// Pulled in a little, because the painted fringe is scalloped: its bumps dip
// below the nominal line by up to FRINGE_DIP, and a blade planted in the dip
// would be standing on rock.
const CAVE_TURF = 0.60;
const CAVE_TURF_INSET = 0.06;

// Move whole tufts out onto the bulged surface.
//
// Per TUFT, never per vertex. buildGrassBlades lays each tuft down as a known
// contiguous run — the same fact 草むしり relies on to pull one — so shifting a
// run bodily along its own normal carries the blades' shape with it. Displacing
// vertices individually would stretch every blade by the gradient of the lump it
// was standing on.
function caveLiftTufts(geo, dirs, doorDir, guard) {
  const p = geo.attributes.position;
  const per = p.count / dirs.length;
  for (let i = 0; i < dirs.length; i++) {
    const d = caveSurfaceLift(dirs[i], doorDir, guard);
    if (d === 0) continue;
    const dx = dirs[i].x * d;
    const dy = dirs[i].y * d;
    const dz = dirs[i].z * d;
    for (let k = i * per; k < (i + 1) * per; k++) {
      p.setXYZ(k, p.getX(k) + dx, p.getY(k) + dy, p.getZ(k) + dz);
    }
  }
  p.needsUpdate = true;
  geo.computeBoundingSphere();
}

// HOW FAR WHAT ESCAPES A BUILDING CARRIES, which is now the radius of a disc
// rather than the size of a decal.
//
// `reach` is a multiple of the prop's own width, for a lamp that is its own
// light source — a card with a lantern painted on it throws from where it
// stands.
//
// `spill` is for a lamp INSIDE A BUILDING and is a multiple of the WALL's
// radius instead, because the house asks a different question: not "how far
// does this throw" but "how far past the wall does what gets out carry". It
// pairs with `uLampInner`, which starts the measurement at the wall, so the
// bright part of the light lands at the foot of the masonry and a resized house
// takes its halo with it.
//
// `alpha` is gone with the pool it dimmed. Nothing lies on the grass now: the
// ground is asked directly what light reaches it (see _litGround), so the only
// number left is how far.
//
// `spill` came DOWN from 1.35 to 0.56 when it did, and for the third time in
// this rework the reason is that a reach means something different under a
// disc. At 1.35 the light from a 3.2-unit house carried 4.3 units past its own
// wall, and with the plateau that put the FULL value nearly six units out —
// past the point somebody stands to look at the building. The whole field in
// front of a lit house came up to daylight, which as a painted decal had read
// as a soft halo and as a disc reads as somebody switching the sun on.
//
// At 0.56 it is an apron: 1.8 units of lit grass at the foot of the house,
// 2.2 at the cave, falling off inside the frame so the edge is on screen. Which
// is what light out of a window does.
const LAMP_POOL = { reach: 2.15, spill: 0.56 };

// HOW MUCH OF A FIXTURE'S OWN GLOW SURVIVES ONCE THE ROOM HAS GONE DARK.
//
// This is about the LAMP, not about the light it casts, and the two had always
// been the same number until it was asked for separately. What a lamp throws is
// `uLampK` and is unaffected by anything here; this is only how hot its own
// glass and the halo of air around it are drawn.
//
// It exists because of a real difference between what the model does and what
// the eye reports. Measured in the cave, nothing a lamp lights ever exceeds its
// noon value — 0 of 120,000 pixels brighter at night, 119,787 darker — so by
// the arithmetic the fixture at midnight is already no brighter than the
// fixture at noon. It does not read that way. A lamp is drawn ADDITIVELY over
// whatever is behind it, and a room at night has a great deal less behind it,
// so the same halo that reads as a warm bulb against a daylit wall reads as a
// white blob against a dark one. Contrast, not brightness.
//
// So the glow is faded with the room it is standing in: full by day, `floor` at
// the darkest hour, interpolated on the room's own tint. The lamp stays
// unmistakably lit — its glass keeps its lit colour and the light it casts does
// not move — it simply stops being the brightest thing on screen by a distance.
//
// TWO floors, and the split is the whole of what makes this controllable.
//
// It was one number, applied to the halo and the glass together, and that
// number could not be pushed far enough: taken low enough to kill the glare it
// also made the glass transparent, and a bulb you can see the ceiling through
// reads as a bulb going OUT rather than a bulb in a dark room. The two are
// different parts doing different jobs.
//
//   `halo` is the glow in the air around the fitting, drawn additively. It is
//   what actually glares — additive light over a dark room is the white blob —
//   and it can be taken a long way down before anybody misses it, because the
//   thing it surrounds is still plainly alight.
//
//   `glass` is the fixture itself. It has to stay a body of light: this one
//   stays high, and only takes the edge off.
//
// Swept against the shot it is for, stood under the cave's bulb looking up at
// midnight. The glass floor was fixed at 0.80 and the halo walked down.
const FIXTURE_GLOW = { halo: 0.18, glass: 0.80 };

// ...and the light that comes the OTHER way through the same hole.
//
// `reach` is a multiple of the room's own radius, so the patch is a share of
// the floor rather than a fixed size: at 0.85 it lands a little short of the
// middle of the room, which is as far into a building as a doorway ever throws.
//
// `cover` is how completely it lifts what it reaches, and it is deliberately
// well under a lamp's 1. This is the sky coming in, not a light switched on —
// enough that the boards at the threshold are not darker than the grass a foot
// away, not so much that a room with no lamp lit reads as lit.
//
// `sky` is how far its colour is pulled from the sky's own toward white. Zero
// would restore the floor toward a saturated midnight blue, which is a stronger
// statement than moonlight through a door makes; a little over half keeps the
// hue and loses the saturation, which is what a pale patch of night light on
// boards looks like. What it buys at the other end of the day is free: at dusk
// the sky at the horizon is orange, so the doorway lays a warm patch inside
// without anything being told about the hour.
const SKY_DOOR = { reach: 0.85, cover: 0.42, sky: 0.55 };

// HOW COMPLETELY LIGHT THAT HAS ESCAPED A BUILDING LIFTS THE GRASS.
//
// A ceiling, because `houseLit` reaches 1 whenever the lamps inside are fully
// up, and a coverage of 1 restores the lawn all the way to its own daylight. A
// lit window does not do that. Measured across a doorway at night before this
// existed: the grass a hand's breadth outside read 230 and the boards a hand's
// breadth inside read 137 — brighter OUTSIDE than on the floor the light had
// just crossed on its way out, which is backwards however generous you are
// about how a window works.
//
// 0.45 puts the two within sight of each other and leaves the lawn plainly
// darker than the room, which is the right way round.
const SPILL_COVER = 0.45;

// `bloom` is the light in the AIR, which survives all of this because it is the
// one thing here that genuinely adds rather than restores — you are looking at
// lit air, not at a lit surface.
//
// It is drawn IN FRONT of the house rather than behind it. Behind was the
// obvious way round and does not work: a glow centred on a four-unit opaque
// dome has its whole bright half hidden by the dome, and only the faint outer
// fringe clears the silhouette — measured at under a tenth of the strength it
// was set to, which is to say invisible. It is also wrong about what is
// happening. The lamps are inside; what you can see of them is the light coming
// OUT of the door and the window, over the wall and into the air in front. So
// the bloom sits on the openings — see litSpot, which finds them in the
// drawing — and its size comes from theirs.
//
// Additive, so its alpha is brightness ADDED, and it is the number to be
// careful with: it lands on the drawing itself, and much past 0.3 it stops
// looking like a lit doorway and starts bleaching that whole side of the dome.
// `near` and `far` are where the glow in the air fades out as you walk up to
// it — see _syncBloom. `near` is inside the doorstep (3.8) on purpose, so the
// beacon is fully gone by the time you are close enough to look through the
// door rather than at it; `far` is about a house-and-a-half further out, which
// is far enough that the fade happens while the building is still a shape on a
// hillside rather than a thing you are walking into.
const LAMP_BLOOM = { alpha: 0.28, near: 3.4, far: 11.0 };

// THREE CONSTANTS STOOD HERE AND ALL THREE ARE GONE, which is most of what the
// rework was for. Worth recording what they were, because each was carefully
// fitted and each was a symptom.
//
// `LAMP_LIT.strength = 0.24` — what a lamp ADDED to anything standing in it,
// deliberately below the pool's own alpha because a decal is seen at a grazing
// angle and a card face-on. Its twin, `ROOM_LIT.strength = 0.72`, said the same
// thing about a table in a shut room. Two numbers describing the SURFACE rather
// than the light, with no value between them that would have been right for a
// character walking from one to the other. A restore needs neither.
//
// `LAMP_FALL = 2.4` — the exponent of the outdoor falloff, fitted by
// measurement to paintLampGlow's gradient stops (0.30 of full at 0.40 of the
// radius, 0.08 at 0.68). Its twin was 2.0, fitted to a different stamp. One
// shared `uPlateau` replaces both, and the stamps are generated from it rather
// than measured against it.
//
// `LAMP_COLOR = '#FFD489'` — one warm for every lamp in the app, load-bearingly
// hand-matched to PAL.lampGlow. It is `uLampTarget` now, per light, and the
// colours are near-white because a lamp returns a surface to its own colour
// rather than painting it amber.
//
// The pools that two of them were fitted against still exist out of doors —
// see the bloom over a lit doorway — and are drawn in PAL.lampGlow directly.

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
// `strength` is well above the house's 0.24, which is the opposite of what "a
// small lamp in a small room" suggests and is right for a reason that has
// nothing to do with the size of the lamp. The house's term lands on cards out
// on open grass under a whole sky's worth of ambient; this one lands on
// furniture in a shut room after dark, where the lamp is not the main light —
// it is very nearly the ONLY light.
//
// It was 0.30 while night's tintIn still stood at six sevenths of daylight, and
// the two were fighting: a flat wash held the whole room up and the lamps had a
// tenth of the picture left to argue with. Measured, switching both room lights
// off moved the room by about 20 of 190 — a light source you could turn off
// without much happening, which is the definition of one that is not working.
//
// The wash is gone (see tintIn in daylight.js) and this is what replaces it.
// The two numbers are a pair and have to be read together: this is how far a
// lamp lifts a surface it is right next to, back to somewhere inviting, and the
// tint is the dark everything falls to once out of reach. Move one without the
// other and the room goes flat again — dull if this is too low, and back to an
// evenly lit box if it is too high.
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

// How much of the room's darkness the CAST are excused from — see the lift in
// _syncInterior. 0 would have them wear the room like the furniture does; 1
// would leave them at full daylight in a black room, cut out and pasted on.
//
// Better than half, which is a lot, and the reference is why: in it a character
// sits in a cave lit by one lantern and is drawn very nearly white. The room is
// allowed to go dark around them precisely BECAUSE they do not go with it —
// take the cheat away and the honest thing to do would be to keep the room
// bright enough to see faces in, which is the flat lit box this whole rework
// exists to get out of.
// `out` is the same cheat under the open sky, and it is smaller because the
// dark out there is a different dark: moonlight rather than the absence of a
// lamp, and it falls on the grass as well, so nobody is being singled out by it.
//
// It exists at all because of a number. When night's outdoor tint came down to
// match the room, Chiikawa measured 38.5% against grass at 41% — a white
// character DARKER than the hillside behind them, with their brightest pixel
// landing on exactly the same value as the field. That is not a dim character,
// it is a missing one.
//
// Both of these are free by day and need no guard: at noon the tint is #FFFFFF
// and lifting white toward white changes nothing. They only bite once the hour
// has something to lift out of.
//
// ASKED WHETHER THEY COULD BE ONE NUMBER, once the lighting was rebuilt, and
// measured as the ratio each actually produces against the dark it lifts from:
//
//              dark      cast      lift
//   outdoors   #75819C   #B4B9C5   2.21x
//   indoors    #5C626B   #CFD0D2   5.24x
//
// Not two spellings of one value — two and a half times apart, because the
// indoor dark is deeper AND its fraction is larger, and both of those are the
// point. One number would either sink a character into an unlit room or float
// one off a moonlit hillside. By day they measure 1.00 and 1.00, so they differ
// only where the difference is the whole reason they exist.
const CAST_LIFT = { in: 0.58, out: 0.34 };

// `ROOM_POOL` stood here — how much of the house's pool alpha a lamp indoors
// laid on the boards, halved from 0.62 to 0.34 because the bulb's stamp and the
// lantern's overlapped over most of the floor and two of them at full strength
// summed past white, measured at #F8E9D7 corner to corner.
//
// There are no indoor stamps to halve. Coverage is clamped at 1 before it is
// used, so two lamps lighting one patch of floor restore it once and a third
// would too. The number is not retuned; the failure it was compensating for
// cannot be expressed.
//
// The tapped-spot marker. `lift` clears the surface by more than a quad this
// wide sags away from it — 1.16 across a globe of radius 8 drops 0.021 at the
// corners — so one flat quad is enough and there is no need for the projected
// cap the lamp pools use. `breatheMs` is slow on purpose: it has to say the
// thing is live without being something you look at.
// `lift` was 0.045 while this was a flat quad, most of which was covering the
// rim's climb away from the surface rather than buying clearance. It is a cap
// now and holds its gap the whole way out, so it sits as low as the shadows do.
//
// `r` is the fallback radius only — the size this was drawn at while its one
// caller was a walk, where the thing being marked is a patch of ground and has
// no size of its own. A FOCUS does: see markRadius, which is what the ring is
// cut to now.
// The floating focus mark — the paper arrow that says which thing, or which
// FRIEND, the action buttons are currently about. Two of them exist, because
// the two facings in main.js are independent and can both be live: one over
// the person the people-verbs would reach, one over the piece 「ひろう」 would
// take. See paintFocusMark for why it floats where the bubbles do, and
// updateMark in main.js for who decides what gets marked.
const FOCUS_MARK = {
  // World units across. At conversation distance this projects to about
  // seventy pixels on a portrait phone — a marker, not a signpost.
  w: 0.38,
  // The idle float: a slow rise and fall, small enough to read as hovering
  // attention rather than as bouncing.
  bobAmp: 0.045,
  bobMs: 1500,
  // Scale in and out, the hand slot's gesture at the hand slot's pace.
  easeMs: 120,
  // Air between the mark and the thing it is over. A person gets a little
  // less on top of headWorld, since that anchor already carries the bubble's
  // own clearance.
  gap: 0.20,
  personGap: 0.06,
  // ...and a little more over a perch site, because `y` is the surface somebody
  // SITS on rather than the top of a shape. A mark at the plain gap floats where
  // the singer's lap will be; this clears the friend the mark is inviting.
  spotGap: 0.55,
};

const WALK_MARK = {
  r: 0.58,
  lift: SHADOW_LIFT,
  fadeMs: 190,
  breathe: 0.055,
  breatheMs: 1500,
  // How far outside the piece's own shade the ring is drawn. A quarter again,
  // which is a gap you can see at a lantern's size and still a ring that plainly
  // belongs to the thing rather than to the floor around it.
  grow: 1.25,
  // ...and the ends of that.
  //
  // The floor is legibility. A lantern's foot is a tenth of a unit and its shade
  // barely more; a ring cut honestly to that is a smudge under the piece rather
  // than a mark around it, and the one thing this has to do is be findable at a
  // glance. The ceiling keeps the bigger pieces from wearing a crop circle.
  rMin: 0.20,
  rMax: 0.78,
};

// HOW BIG A PIECE READS ON THE FLOOR, as the two half-extents its ground shade
// is cut to. Named because there are two readers now and they have to agree: a
// focused piece wears a shadow and a ring, and a ring that did not know what the
// shadow was would cross it at some sizes and vanish inside it at others.
const PROP_SHADOW = { x: 2.3, z: 2.6 };

// The ring a focused piece gets.
//
// ONE radius, not two, because the mark is a circle: the wider of the piece's
// two spreads is what has to be cleared, and the narrow way round simply gets a
// little more room than it needed.
//
// `lean` shortens the piece along its own shaft, exactly as the ground shadow is
// shortened for a propped one — a sasumata stood against a wall covers a foot of
// floor, not the two and a half it covers lying down, and a ring cut to its
// lying-down length is a hoop around half the room.
export function markRadius(rx, rz, lean = 0) {
  const half = Math.max(
    rx * Math.cos(lean) * PROP_SHADOW.x, rz * PROP_SHADOW.z,
  ) * 0.5;
  return Math.min(WALK_MARK.rMax, Math.max(WALK_MARK.rMin, half * WALK_MARK.grow));
}

// Where in the dusk-to-dark fade the lamps come up. Below this they are off
// entirely, which is what keeps the lit sheet from ghosting through the whole
// of the evening — the house should be daylit until it plainly is not, and
// then the windows come on.
const LAMP_ONSET = 0.42;

// How much of the weather gets under a roof. Not all of it and not none: a room
// is enclosed, so what the sky is doing arrives only through the openings — but
// it does arrive, and it is most of why sheltering from rain is worth doing.
// The corners go gloomy, and a gloomy corner is what leaves the lamp the
// brightest thing in the place.
//
// Two thirds rather than a half because the openings here are large: both
// interiors are lit through a doorway you can walk through and, in the house, a
// window as well. It cannot make the room too dark to be in — see the restore
// model in light-model.js, where anything a lamp reaches comes back to daylight
// however deep the dark under it is.
const INDOOR_WEATHER = 0.66;

// How much snow it takes to bury the meadow completely — see _bury.
//
// A THIRD, which is much earlier than the ground is fully white and is the
// point rather than an accident. Snow fills a meadow in before it has finished
// covering the bare ground between: the shortest things go under first, and by
// the time you would call a field white there has been nothing green in it for
// a while. Setting this to 1 was tried and reads as a lawn slowly dissolving.
const BURY_BY = 0.34;

// ...and how much of the same snow settles on a tree. See litBySun: a tree
// catches it on its upper surfaces and stays a tree, where the ground simply
// becomes snow.
//
// TWO NUMBERS, because it was one and one was the bug. A single flat 0.66 took
// every fragment of a lathe two thirds of the way to the snow colour — trunk,
// canopy, the underside of a branch and the shaded north face alike — and a
// thing whitened evenly from all directions does not read as having snow ON it.
// It reads as BLEACHED, which is what "objects are too white in winter" was
// describing.
//
// So the mix is weighted by how far up a surface faces, which the geometry
// already knows: a tree stands with its own +Y on the planet's normal (see where
// `shell.quaternion` is set from `item.dir`), so the OBJECT-space normal's y is
// exactly its upness, and it costs one varying to carry. Nothing has to be told
// where the planet is, and it survives the world group turning under the camera.
//
// `TREE_FROST` is what an upward face takes and it is HIGHER than the flat value
// was — snow lying on a branch really is nearly white. `TREE_FROST_UNDER` is
// what a downward one takes, and it is deliberately not zero: the ground under a
// tree in winter is a white sheet throwing light back up, so an underside is
// cooled rather than left in summer green. The old failure this guards against
// is on the record — nine fully summer canopies over a buried meadow read as a
// different picture pasted over the top.
//
// What it buys for nothing: a stump's cut face points straight up, so it now
// wears a white cap without a drawing or a special case.
const TREE_FROST = 0.80;
const TREE_FROST_UNDER = 0.16;

// How far clear of a walker's own berth an outdoor bed has to lie, in units.
// See sleepSpotFor, and the three hundredths of a unit that kept Usagi awake
// all night. Half a unit, which is far enough that nudging a house or a walk
// margin cannot quietly close the gap again, and near enough that the meadow is
// still where it was drawn to be.
const BED_CLEAR = 0.6;

function clampUnit(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }


const _discDir = new THREE.Vector3();

// The rainbow's own scratch — see _aimBow. Its own set rather than the shared
// ones because it runs from update(), after _applyBlend has finished with those
// and while several other things are still using them.
const _bowSun = new THREE.Vector3();
const _bowAxis = new THREE.Vector3();
const _bowUp = new THREE.Vector3();
const _bowRight = new THREE.Vector3();
const _bowM = new THREE.Matrix4();

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
// The lake's own centre, for the outdoor half of the clamp.
const _looseC = new THREE.Vector3();
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

// HOW MUCH OF A MOVING PIECE'S CLOSING SPEED IS HANDED TO THE ONE IT RUNS INTO
// — see _separateLoose. A feel number and emphatically not a coefficient of
// restitution: nothing here conserves anything, because nothing here has a mass.
//
// Under one on purpose, and the shortfall is doing two jobs. It reads as the
// soft knock a stuffed toy gives rather than the click of two marbles, which is
// the register this whole floor is written in — see the topple, which is
// authored for the same reason. And it makes a chain CONVERGE: kick the bear
// into the teapot into the lantern and each handoff is smaller than the last, so
// three pieces settle in a heap instead of trading a scoot back and forth until
// the damping happens to catch them.
const LOOSE_PASS = 0.8;

// Scratch for holding two pieces apart, kept separate from the shove's own so a
// separation running mid-loop cannot tread on the vectors the shove is using.
const _sepAxis = new THREE.Vector3();
const _sepTanA = new THREE.Vector3();
const _sepTanB = new THREE.Vector3();
const _sepQ = new THREE.Quaternion();
// The pieces in play this frame. Refilled rather than rebuilt, for a list that
// is asked for on every frame of every session.
//
// Two of them, and not as a micro-optimisation: `_looseInPlay` empties whatever
// it is handed, so the separation holding one across its whole double loop means
// any other caller reaching for the same array mid-pass would cut the loop's
// list out from under it. The separation gets one to itself; the two set-down
// helpers share the other, which is safe because neither of them nests inside
// the other — each finishes its loop before the next is called.
const _sepList = [];
const _perchList = [];

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
// ...and a fourth, for the lamp glass in _syncInterior. The lean above it has
// already spent _cB by the time the loop runs.
const _cC = new THREE.Color();
// Standing a sleeper up on the grass — see layDown. Their own, because the
// shared tangent scratches all belong to per-frame code and this runs from a
// state change rather than from update().
const _sleepAt = new THREE.Vector3();
const _sleepTan = new THREE.Vector3();
const _tuneTan = new THREE.Vector3();
const _tuneAt = new THREE.Vector3();
const _sleepRight = new THREE.Vector3();
const _sleepBasis = new THREE.Matrix4();
// Sweeping bearings round a bed for somewhere to stand — see _bedsideSpot. Runs
// once per home at build, so it wants no allocation but needs no thread safety.
const _bedTan = new THREE.Vector3();
// Where the camera is, in a sleeper card's own frame — see _syncZzz.
const _zzzEye = new THREE.Vector3();

// One drawing of the Zzz for the whole cast. Three of these exist at most and
// they are the same mark, so the canvas is painted once; the meshes each get
// their own material, since each fades on its own clock.
let _zzzCanvas = null;
function cachedZzz() {
  if (!_zzzCanvas) _zzzCanvas = paintZzz();
  return _zzzCanvas;
}

// How the mark drifts. See _syncZzz for why this feature has a transform in it
// at all when the rest of the app animates by redrawing.
//
// `periodMs` is a breath rather than a beat — three seconds is slow enough that
// two of them in frame never look synchronised and fast enough that you see one
// complete while you stand there. `rise` is a third of a unit against a mark a
// third of a unit wide, so it travels about its own height: further reads as
// something escaping, shorter as something twitching.
//
// `peak` holds it under full strength on purpose. It is the one bright thing in
// a room whose lamps have just been switched off, and at 1.0 it was the first
// thing the eye went to in a scene whose subject is somebody sleeping.
const ZZZ_RISE = { periodMs: 3000, rise: 0.20, inAt: 0.28, peak: 0.82 };

// Where in that cycle one sleeper starts, so three of them in view do not rise
// and fade as one. Off their place in CAST rather than a counter or a roll: it
// is the same on every visit and the same after a reload, which is what the rest
// of this world promises about itself — see the seeded scatter in art.js.
function zzzPhase(key) {
  const i = CAST.findIndex((c) => c.key === key);
  // An irrational-ish step, so no two of a small cast land near each other and a
  // fourth character would not double up with the first.
  return ((i < 0 ? 0 : i) * 0.37) % 1;
}
// Where the house is, for the bloom's distance fade — see _syncBloom. Its own
// scratch because it is read in update(), where the shared ones are all busy.
const _bloomAt = new THREE.Vector3();
// Where a room light is standing, as a surface direction, so it can be asked
// which side of the wall it is on — see the roomLights loop in update().
const _lightDir = new THREE.Vector3();
// What "no tint at all" multiplies to. A lamp alight is lifted the whole way to
// this, which is the same as not being tinted — see `emits`.
const WHITE = new THREE.Color(0xffffff);
// Nothing at all, at zero alpha: what snapshot() clears its target to, so a
// portrait comes back on transparent rather than on a square of sky.
const BLACK = new THREE.Color(0x000000);
// snapshot()'s own scratch. It runs between frames, from the DOM, which is
// exactly when the shared ones are least safe to assume anything about.
const _snapV = new THREE.Vector3();
const _snapC = new THREE.Color();

// The focus marks' scratch — a box and sphere for measuring a piece on the way
// into focus, a vector for standing the mark over its target every frame.
const _fmBox = new THREE.Box3();
const _fmSphere = new THREE.Sphere();
const _fmPos = new THREE.Vector3();

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

// THE SNOW ITSELF, as a second surface over the planet.
//
// Everything up to now made the world WHITE; this is what makes it DEEP. It is
// an ordinary sphere at the planet's own radius, pushed outward per vertex by
// the depth map — see snowfield.js — so the silhouette fattens as it settles,
// the cast are cut off at the snow line by nothing more than the depth buffer,
// and a trodden trail becomes a trench with walls you can see over.
//
// It costs one draw call, and the geometry can be COARSE, which is the economy
// the whole idea rests on: the crisp edge of a footprint is already drawn by
// the mask darkening the ground's own colour, so this only has to be lumpy. It
// is cut against the narrowest thing it must show — see shellSegs.
//
// The displacement is three.js's own `displacementMap`, not a patched shader.
// A sphere's normals are radial, so "along the normal" IS "outward", and the
// engine's own vertex fetch does the work. What that buys beyond the code it
// saves: how much snow there is becomes one number written from JS each frame
// (`displacementScale`), and how much is HERE stays the mask everything else
// already reads.
//
// ------------------------------------------------------- what it must not cover
//
// A pond is not somewhere snow lies, and neither is the inside of a house. The
// 2D tint could be careless about that — what it whitened under a pond was the
// BED, with water drawn over the top — but a shell cannot: it would dome over
// the water and put a white lid on both lakes.
//
// So the faces are simply removed at build. Static, decided once, and free
// forever after — no per-vertex mask, no test in the shader, and no way for it
// to come undone later. The seam it leaves at a pond's rim is not a seam to
// hide either: snow banked at the shore dropping away to a lower, flatter
// surface is exactly what a frozen pond in a snowfield looks like.
function snowShellGeo(R, seg) {
  const geo = new THREE.SphereGeometry(R, seg, seg / 2);
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const keep = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mid = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    c.fromBufferAttribute(pos, idx[i + 2]);
    // The middle of the triangle, as a direction. A whole face is kept or
    // dropped together — testing corners would leave a ragged fringe of
    // half-faces round every pond, which is worse than a slightly generous
    // hole.
    mid.copy(a).add(b).add(c).normalize();
    if (CONFIG.lakes.some((l) => inLake(mid, l, 0.02))) continue;
    // THE WHOLE FOOTPRINT and not the wall band — see underRoof, and the note
    // there about the bug this line was. `inBuilding` stood here, which lets
    // the room through as free floor, so the hole came out as a RING under the
    // walls with every face over the boards left in place. Snow rose through
    // the floor of both houses and cut the furniture off at the shins.
    //
    // Cut at the outer wall exactly. A triangle whose centroid falls just
    // outside still reaches a little way in, but only as far as the wall band,
    // where the wall itself is standing in front of it — so the seam is hidden
    // by the building rather than needing a margin to clear it, and the snow
    // outside comes right up to the wall the drifts are banked against.
    if (underRoof(mid)) continue;
    keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  geo.setIndex(keep);
  geo.computeBoundingSphere();
  return geo;
}

// THE ARC, as a strip of sky.
//
// Built around +Z with its crown toward +Y, and then simply TURNED into place —
// see where it is aimed. That is what makes a rainbow that follows the sun cost
// one quaternion a frame instead of a rebuilt mesh: the shape of a rainbow
// never changes, only where it is pointing.
//
// A band on a SPHERE and not a flat ring, and the difference is not subtle at
// this size. The arc spans well over a hundred degrees of sky; a flat annulus
// hung at any distance would be dead right at its middle and increasingly wrong
// toward its feet, since the further from the centre of the view a flat thing
// gets, the less its own plane has to do with the direction you are looking. On
// the sphere every point of the band is at the angle it should be, because the
// angle is what it was built from.
//
// `seg` is generous because the band is thin and long: too few and the arc's
// inner edge shows as a polygon, which is the one artifact a soft-edged
// gradient cannot hide.
function bowGeo(radius, width, span, dist, seg = 128) {
  const pos = new Float32Array((seg + 1) * 2 * 3);
  const uv = new Float32Array((seg + 1) * 2 * 2);
  const idx = [];
  const inner = radius - width / 2;
  const outer = radius + width / 2;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    // Bearing round the axis, centred on the crown, so the drawn span is the
    // TOP of the circle and the two ends are its feet.
    const b = (u - 0.5) * span;
    // The circle's own plane: +Y at the crown, +X to the sides.
    const sx = Math.sin(b);
    const sy = Math.cos(b);
    for (let j = 0; j < 2; j++) {
      // v runs 0 at the OUTER edge, which is where the red is — see
      // paintRainbow, whose first colour stop is the outside of the arc.
      const r = j ? inner : outer;
      const k = i * 2 + j;
      const sr = Math.sin(r);
      pos[k * 3] = sx * sr * dist;
      pos[k * 3 + 1] = sy * sr * dist;
      pos[k * 3 + 2] = Math.cos(r) * dist;
      uv[k * 2] = u;
      uv[k * 2 + 1] = j;
    }
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// How much further than a landmark's own wall each kind of scenery keeps, in
// world units. Per kind because the point placed is where a thing STANDS and
// the thing has width: a tree's canopy reaches a couple of units from its
// trunk, so a trunk politely outside the wall still lays branches across the
// roof. Keyed by the slot names below, before a tree is dealt its variant.
const LANDMARK_BERTH = { tree: 3.0, bush1: 1.5, bush2: 1.5, stump: 1.3 };

// The wind, which only the grass feels — see `sway` and buildGrassBlades.
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
    // ...and most of the stump slot's own turns are holes too — see
    // STUMP_SPACING. `turn` is which time round this slot has come up, the same
    // count the variant picker below uses to rotate the tree drawings.
    const turn = Math.floor(i / PROP_TYPES.length);
    if (slot === 'stump' && turn % STUMP_SPACING) continue;

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

    // NOR WHERE THE GROUND DOES NOT GROW IT. The sand at the two homes grows
    // nothing standing at all, so this is the line that empties both clearings —
    // and it is a line about biomes rather than about homes, which matters: the
    // bare ground is a fact of the ground, and moving a patch in CONFIG.biomes
    // moves what is bare with it instead of leaving a wood growing over the top
    // of a beige field.
    //
    // The half-way line rather than a roll against the weight, because this loop
    // has no random stream and a fixed spiral must stay fixed — the whole reason
    // the empty slot in PROP_TYPES is a hole rather than a shorter list is that
    // re-dealing this scatter moves every prop on the planet. It costs a hard
    // edge in the planting where the paint has a soft one, and at three dozen
    // props spread over a world there is no density gradient to see anyway.
    if (growWeight(dir, CONFIG.biomes, PROP_KIND[slot]) < 0.5) continue;

    // Only the larger props are billboards; grass and flowers come from the
    // merged ground cover instead.
    const variants = PROP_VARIANTS[slot];
    const type = variants ? variants[turn % variants.length] : slot;
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


// `buildGlowPatch` stood here, and with it the last painted light on the
// planet: a spherical cap, projected vertex by vertex back onto the globe so
// that a pool several units across did not stop dead in a hard arc wherever
// the hillside came up through a flat quad. At 8 units of radius a quad
// reaching 4 out has its rim a whole unit below the surface it is meant to lie
// on, which is what the projection was for; 16 segments was chosen against the
// same sagitta.
//
// It was good machinery and it is not needed. The ground answers for itself
// now — see _litGround — so light on the grass is evaluated per fragment at
// the real distance to the real lamp, and a curved surface is simply where
// the fragments happen to be.


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

    // What you are holding — see hand.js.
    //
    // Its material used to join `tintables` on the next line, and no longer
    // does. Nothing about the hand changed; what changed is what that list
    // MEANS. It is now the set of materials whose hour is multiplied in by a
    // shader uniform (see _installHourTint), and the one rule of that set is
    // that nothing else may write the material's colour. _syncHeld writes this
    // one every frame — the blend between the sky and the room you are half
    // way through the door of — so on the list it would take the hour twice.
    //
    // It loses nothing by leaving. _syncHeld runs every frame from update(),
    // holdItem paints it the moment something is picked up, and the card is not
    // drawn at all while your hands are empty.
    this.hand = new Hand(this.camera);

    this.phase = null;
    this.tintables = [];
    // The few interior materials the shared uniform cannot serve, filled by
    // _installHourTint at the end of the constructor. Empty from the start
    // because _syncInterior walks it, and an interior can be told the hour
    // before there is a lamp in it to be an exception.
    this._hourGlass = [];
    // The multiply colour every unlit sprite is currently wearing. Kept here
    // rather than read back off a material so anything joining mid-fade can
    // match the world it is arriving into.
    this.tint = new THREE.Color('#FFFFFF');

    // ...and the same two colours where a SHADER can reach them.
    //
    // The hour is a multiply, and it used to be applied by walking every
    // material in the world and writing the colour onto each one. That is
    // correct and it is also a dead end: a multiply baked into `material.color`
    // is the same everywhere on a surface, so no lamp can ever put part of that
    // surface back. Restoring a patch of a wall to its own daylight colour —
    // which is the whole of the disc model — has to happen per FRAGMENT, and a
    // fragment can only ask about something the shader can see.
    //
    // So the colour moves into a uniform and the walk goes away. Held as
    // `{ value }` objects rather than bare Colors because that is the shape
    // three.js uniforms take, and because sharing the one object between every
    // patched material is what makes bringing the hour round a single write.
    //
    // Two of them, for the two darks that already existed: `tint` out of doors
    // and `tintIn` under a roof. See daylight.js for why a room is not the
    // outside with the lights turned down.
    this.darkOut = { value: new THREE.Color(0xFFFFFF) };
    this.darkIn = { value: new THREE.Color(0xFFFFFF) };
    // The colour at the foot of the sky, held between _applyBlend working it
    // out and _applyLight needing it — see SKY_DOOR.
    this.skyLow = new THREE.Color(0xFFFFFF);

    // WHAT IS IN THE AIR, as the grade weather.js publishes. Clear from the
    // start, which is the identity — every field of it is a multiplier resting
    // at 1 or an addend resting at 0, so a world nobody has told about the
    // weather behaves exactly as it did before there was any.
    this.wx = WEATHERS.clear;
    // HOW WHITE THE GROUND IS, where the ground's own shader can read it — see
    // _litGround, which mixes it into the paint before any light touches it.
    // A uniform object rather than a number for the reason the two darks are:
    // that is the shape three.js wants, and sharing the one object is what
    // makes changing it a single write rather than a walk.
    //
    // Its colour lives beside it because the two are one decision, and because
    // it is emphatically NOT white — see PAL.snowGround for why that matters
    // more here than anywhere else in the palette.
    this.snowAt = { value: 0 };
    this.snowTint = { value: new THREE.Color(PAL.snowGround) };
    // ...and what the shell shows where somebody has walked. See the shell's
    // own branch in _litGround.
    this.troddenTint = { value: new THREE.Color(PAL.snowTrodden) };
    // ...and WHERE it is, which is the ground's alone. See snowfield.js.
    //
    // The two are multiplied in the ground's shader: `snowAt` is how much snow
    // the sky has managed to lay and `field` is how much of it is still at this
    // point on the planet after somebody walked through it. Everything else
    // that reads the snow — the trees, the coats, the snowmen — takes the
    // scalar alone, because a tree does not stand in one place on a map, it
    // stands in the weather.
    this.field = new Snowfield(CONFIG.globe.radius);
    this.snowMap = { value: this.field.texture };
    // Which lamps are currently eating the snow under them, as a pool the
    // weather update writes over rather than a list it builds — see the loop in
    // updateRain, which runs every frame of every winter night.
    this._warmSpots = [];
    // ...and how far under the meadow currently is, so the walk that buries it
    // can be skipped on the frames where the answer has not moved. -1 rather
    // than 0 so the very first call always runs and the meadow starts out
    // standing at whatever the cover already is.
    this._buriedAt = -1;
    this._buried = [];
    // The scenery that has a snow drawing of its own, each with both of its
    // textures — see WORLD_SNOW in assets.js and _winter below. Empty while
    // none of that art has been drawn, which costs one `if` a winter.
    this._snowCards = [];
    this._wintered = false;
    // ...and the one colour that comes out of it: what a full wash multiplies
    // the world by, worked out once here and lerped toward per frame.
    this._wxCast = new THREE.Color(WEATHER_CAST);
    this._wxMul = new THREE.Color(0xFFFFFF);
    // Where the day's own cross-fade currently stands. `_applyBlend` is not
    // called on a settled frame — updateDaylight walks away the moment there is
    // nothing left to fade — so the weather, which changes on its own clock,
    // needs a way to ask for the same frame to be painted again at whatever
    // point in the day it already was. See setWeather.
    this._blendAt = 1;
    // How far the lightning has lifted the world THIS frame, 0 while there is
    // none. Its own value rather than folded into the grade, because a bolt is
    // an event on the frame clock and the grade is a fact about the sky.
    this._flash = 0;
    // What the sky was worth last time it was painted — see setWeather, which
    // is called every frame and has to be able to answer "nothing has moved"
    // without doing the lighting walk to find out. Deliberately a value no real
    // signature can take, so the very first call always paints.
    this._wxSig = -1;
    // How far over the ponds have gone, 0 to 1 — see iceLook in weather.js.
    // Held here because two things read it on different clocks: the hour's
    // blend, which paints the surface, and update(), which stops it moving.
    this.iceAt = 0;

    // WHO IS LYING DOWN, keyed by character. One entry per drawn sleeper, made
    // as the world is built and never added to afterwards — a bed is a place in
    // a room, so it exists exactly as long as the room does.
    //
    // The cards are here rather than on the characters because that is what
    // they are: a sleeping body is not a pose this app can put a billboard in,
    // it is a drawing lying in the world, seen from above, sandwiched into the
    // bedding it is drawn in. See MIDNIGHT_SLEEP.md, and `bedOf` in
    // furniture.js for the anatomy the two indoor ones are fitted to.
    this.sleepers = new Map();
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
    // ...and how much of that is actually getting OUT of the house, which is a
    // different question and the one everything outdoors reads. See
    // _lightState. Starts dark: nothing is lit until the room says so.
    this._houseLit = 0;
    // The room's total reach, for weighting each lamp's share of that. Summed
    // once as the lights are built, because it cannot change afterwards — a
    // lamp can be switched off or carried away, but its reach is its own.
    this._roomReach = 0;

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

    // THE CLOUD DECK — one overcast sky hung over whatever hour it is, faded in
    // by how much cloud the weather says there is. See paintCloudDeck for why
    // it is one texture rather than five.
    //
    // A THIRD DOME AND NOT A TINT ON THE FIRST TWO, and the reason is that no
    // multiply can do this job. Greying a blue sky by multiplying it leaves it
    // a darker blue — a multiply cannot take saturation OUT of anything, only
    // brightness. An overcast sky is not a dim clear one; it is a different
    // sky, and the honest way to draw a different sky is to draw one.
    //
    // Its renderOrder is above both discs at -9 and -8, which is what lets it
    // cover the sun: the deck is nearer than the card at 170 but nothing out
    // here writes depth, so order is the only thing deciding. Depth test stays
    // ON so the planet and everything on it still occludes it.
    this.deck = new THREE.Mesh(
      new THREE.SphereGeometry(168, 40, 22),
      new THREE.MeshBasicMaterial({
        map: skyTexFrom(paintCloudDeck()), side: THREE.BackSide,
        transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      }),
    );
    this.deck.renderOrder = -7;
    this.deck.frustumCulled = false;
    this.deck.visible = false;
    this.skyRig.add(this.deck);

    // THE RAINBOW, which hangs in FRONT of the cloud it came out of — renderOrder
    // -6, one past the deck. That is the right way round both optically and as a
    // picture: the arc is the light getting through, so a deck drawn over it
    // would be greying the one thing in the sky that is supposed to be the
    // reason you looked up.
    //
    // Nearer than the deck as well as later, so the depth test agrees with the
    // order rather than fighting it, and near enough that the planet's own
    // horizon cuts its feet off — which is what puts a rainbow BEHIND the hills
    // instead of standing on top of them.
    const wx = CONFIG.weather;
    this.bow = new THREE.Mesh(
      bowGeo(wx.bowRadius, wx.bowWidth, wx.bowSpan, 152),
      new THREE.MeshBasicMaterial({
        map: texFrom(paintRainbow()),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
      }),
    );
    this.bow.renderOrder = -6;
    this.bow.frustumCulled = false;
    this.bow.visible = false;
    this.skyRig.add(this.bow);
    // How much of it is showing, eased — see _aimBow. Its own value rather than
    // read straight off the grade because the grade steps with the front and a
    // rainbow must not.
    this._bowAt = 0;

    // ------------------------------------------------------- the far distance
    //
    // Mountains and a treeline, hung on the sky rather than stood on the planet
    // — see paintHorizon for why that is the honest arrangement rather than a
    // cheat. Because it rides the sky rig, which is re-aimed at your zenith
    // every frame, the range is on your horizon wherever you walk. It never
    // comes closer, which is exactly what the reference frames do with it.
    //
    // WHERE THE BAND SITS is the whole of the geometry, and it is worked out
    // rather than nudged. Stood at eye height on a planet this small the limb
    // is 32.3 degrees BELOW level, and on a dome of this radius, seen from a
    // camera 9.47 out from the middle, that lands at 119.7 degrees of polar
    // angle. The hills occupy the sky above that; everything past it is buried
    // behind the planet by the depth test, the way a real range has its feet
    // cut off by the near hillside.
    //
    // PINNED TO eyeHeight, and re-derived when that moved: these numbers were
    // 34.4 degrees, a camera at 9.7 and a limb at 121.7 while the eye stood at
    // 1.7. When the eye came down to the avatar's own 1.47 the limb rose two
    // degrees, and under the old FROM of 107 its row rose from 0.567 to 0.487
    // — past the old continuous band's treeTop at 0.48, which buried that
    // entire wood behind the planet with the crowns going under. If eyeHeight
    // moves again, this moves: FROM = limb - 0.567 * SPAN.
    //
    // FROM at 104.9 puts that limb back at row 0.567 of the sheet, inside the
    // planting: ordinary bushes begin around 0.40-0.55 and the rare tall tree
    // can reach 0.27. Standing therefore shows distinct upper silhouettes and
    // occasional trunks while their feet remain behind the hill. It ran at 104
    // and then 105.1 in the 1.7 era, both of which held the whole wood above the
    // limb and stood it on a strip of flat green.
    //
    // THE HOP IS WHY IT CAN GO THIS LOW, and the arithmetic belongs here. A
    // hop is 0.60, which takes the camera to 10.07, the limb to 37.4 degrees
    // down and 124.7 on the dome — row 0.761. Every one of those 5 degrees
    // uncovers sheet that was behind the planet a moment ago, and moving the
    // band moves the limb's row with it, so no value of FROM avoids the
    // reveal. What fills it is a second depth layer of complete plants before
    // SKYLINE.treeBase, which is set at 0.90: the wood goes on being illustrated
    // foliage for the whole hop. The 0.139-sheet margin is deliberate reserve
    // rather than a last-pixel escape. See the note on it in art.js.
    //
    // The band's foot at 130.9 is the other limit: it clears the hop apex by
    // 6.2 degrees, near enough 0.9 of altitude, so hopping off anything much
    // over knee height would still run out of sheet and show sky under the
    // range.
    //
    // Transparent and depth-tested for that reason, and drawn after both sky
    // domes: `skyA` does not depth-test at all, so anything sharing the opaque
    // pass with it would be painted straight over.
    const HORIZON_FROM = 104.9 * (Math.PI / 180);
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
    // ...and it takes the lamps, which is the last thing in the world to.
    //
    // The ground is the ONE genuinely lit surface here — a real Lambert sphere
    // under a real ambient and a real directional — and that is exactly why it
    // could not simply join `tintables` with everything else. Its dark is not a
    // multiply somebody wrote down; it is whatever the hour's two lights happen
    // to add up to at this point on the curve, terminator and all. There is no
    // `uDark` to lift it out of.
    //
    // So the restore is expressed on the OUTPUT instead: work out what this
    // patch of ground looks like in lamplight and cross-fade to it by the same
    // coverage everything else uses. `diffuseColor` is the drawing, `lampT` is
    // the colour the lamps reaching here restore toward, and `uGroundLit` is
    // how bright a fully lit patch of ground is — which is the one number this
    // phase has to fit, because it is what makes the circle continuous where it
    // crosses from a room's boards onto the grass outside the door.
    //
    // `max` for the same reason RESTORE_APPLY has one: at noon the ground is
    // already brighter than any lamp could make it, so a lit lantern must
    // change nothing rather than dim the field it is standing in.
    //
    // Patched at the END of this constructor rather than here, because the lamp
    // arrays it reads are sized off a world that has not been scattered yet.
    // See _litGround, called beside _installHourTint.

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
    // `glowRing` stood here — the same stamp with its middle knocked out, for
    // the lamps that live inside a building, cached by where the wall fell so
    // that two houses the same size shared one upload. Nothing lies on the
    // grass any more, so there is no hole to cut: the only thing still drawn
    // from this stamp is the bloom hanging in the air over a lit doorway, which
    // is a glow in the air rather than light on a surface and has no building
    // in the middle of it.
    const source = {
      // The house is two drawings of one building. `house` is the daylight
      // sheet and takes the ordinary sprite path; `houseNight` is only ever
      // reached through NIGHT_ART, which is why it is not a landmark type of
      // its own — there is one house, wearing one of two faces.
      house: () => paintSheet(IMG.houseDay, false),
      houseNight: () => paintSheet(IMG.houseNight, false),
      // The cave's pair are PAINTED rather than drawn, and they are the first
      // sheets in the app with no PNG behind them. That is only possible
      // because neither is ever seen: the building is geometry, both cards are
      // retired on the frame they are built, and what they exist for is to keep
      // the sprite and lamp machinery supplied with the objects it addresses
      // props through. Painting them costs two small canvases and saves two
      // drawings of a building nobody will look at.
      cave: paintCaveDay,
      caveNight: paintCaveNight,
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

    // ...and the same drawing with snow on it, for the kinds that have one —
    // see WORLD_SNOW in assets.js, which is the list, and _winter below, which
    // does the swapping.
    //
    // Cached exactly like the summer one and built at the same moment, so a
    // winter that arrives four hours into a session costs a pointer swap rather
    // than a decode. That matters more here than for the characters' coats:
    // there are twenty-six bushes, they all change on one frame, and the frame
    // they change on is one somebody is looking at.
    //
    // Empty until the art exists, and then this whole mechanism switches itself
    // on with no other edit anywhere.
    const snowTex = new Map();
    for (const key of Object.keys(WORLD_SNOW)) {
      const img = IMG[`${key}Snow`];
      if (img) snowTex.set(key, texFrom(paintSheet(img, false)));
    }

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
    // Each clears its OWN drawn width rather than a number written here. Taken
    // from the art's alpha bounds and not from the canvas: the margin a drawing
    // happens to leave around itself is not part of the building. The house is
    // the exception — it stopped being a drawing, so it states its radius in
    // CONFIG instead, and a measurement taken off a retired card would be a
    // measurement of nothing.
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
    // should keep YOU from walking through it. Only the solid ones are handed
    // over here.
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
    // Summed over every home rather than read off the one, which is the whole
    // of what two buildings cost this shader. Each home's own table is filtered
    // by the same ROOM_LIGHT test and the counts added, so the cave's lantern
    // gets a slot of its own after the house's lantern and bulb.
    //
    // Guarded per home on that home's building actually having been scattered,
    // for the reason the single-house version was: the interior is only built
    // if the landmark it belongs to exists, and a slot reserved for a room that
    // was never built is a divisor of zero waiting in the array.
    const roomLights = CONFIG.homes.flatMap((home) => (
      lampProps.some((p) => p.type === home.type)
        ? home.spec.furniture.filter((f) => ROOM_LIGHT[f.art])
        : []
    ));
    const NOUT = lampProps.length;
    const NIN = roomLights.length;
    // ...and one more per building, for the DOORWAY.
    //
    // A hole in a wall is a light. It was the last thing in the world still
    // unaccounted for, and the gap it left was measurable: scanned down the
    // middle of a lit doorway at night, the floor a hand's breadth inside read
    // 93 and the grass a hand's breadth outside read 230, with nothing between
    // them but the frame's own ink line. Light leaving a room passes OVER the
    // boards at the opening on its way out; the room's dark should not stop
    // dead at the threshold and then be twice as bright again on the far side.
    //
    // It is modelled as its own emitter rather than by letting the building's
    // spill reach inward, because the two are different lights: the spill is
    // what gets OUT, aimed at the grass, and this is what comes IN — the sky,
    // whatever colour the sky presently is. See where its target is written.
    const NDOOR = CONFIG.homes.filter((home) => (
      lampProps.some((p) => p.type === home.type)
    )).length;
    const N = NOUT + NIN + NDOOR;

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
      // WHICH SIDE OF THE WALL THIS LAMP IS ON: 0 out on the grass, 1 under the
      // roof. It replaces what used to be a split in the loop bounds, and the
      // reason it had to is a lamp somebody can pick up.
      //
      // The old arrangement gave the outdoor materials slots 0..NOUT and the
      // indoor ones NOUT..N, so which world a light belonged to was decided
      // once, at build, by where its slot fell. That was true of every light in
      // the app right up until the lantern became a thing you could carry — and
      // then it was false in the worst way: carrying it outdoors lit precisely
      // nothing, because no material out there had a loop that could reach its
      // slot. Measured at a delta of 0.000 with the lamp at the player's feet.
      //
      // Now every loop walks every light and asks this instead. A lamp crossing
      // the threshold changes one number and the whole world starts or stops
      // seeing it. Nothing has to know that it is being carried, or by whom —
      // see where update() sets it, which only asks where the light IS.
      uLampIn: { value: new Array(N).fill(0) },

      // ---------------------------------------------------- and the disc model
      //
      // `uLampK` is HOW COMPLETELY this lamp covers what it reaches, 0 to 1.
      //
      // It replaced `uLampLevel`, which was a brightness to ADD and carried a
      // per-surface strength baked into it — 0.24 for a card out on the grass,
      // 0.72 for a table in a shut room. Those two numbers were the clearest
      // sign that the model was wrong: they describe the SURFACE the light
      // lands on, not the light, and there is no third value that would have
      // been right for a character walking between them. A coverage has no such
      // problem. A lamp fully on is 1, everywhere, and what changes is which
      // dark it is lifting out of.
      uLampK: { value: new Array(N).fill(0) },
      // What full coverage restores TO. Near-white — see PAL.lampRestore — and
      // per light, because a flame, a wired bulb and light escaping a window
      // are not the same white.
      //
      // This is what replaced `uLampTint`: ONE colour for every lamp in the
      // app, which held only because the two ends were matched by hand. The
      // note that it was load-bearing said a room light in a different colour
      // would need it to become an array before it needed anything else, and
      // that is exactly what happened.
      uLampTarget: {
        value: Array.from({ length: N }, () => new THREE.Color(0xffffff)),
      },
    };

    // The disc's shape, shared by every material that reads a lamp. A uniform
    // and not a constant folded into the source, so it can be moved while
    // looking at the thing it changes — which is the only honest way to pick it.
    this.plateau = { value: PLATEAU };

    // How bright a patch of ground standing in full lamplight is, as a
    // multiplier on the drawing. See _litGround.
    //
    // It is the one number in the whole model that had to be FITTED rather than
    // reasoned out, because the ground is the one surface whose "own daylight"
    // is not written down anywhere: everything else wears the hour as a
    // multiply and the restore is exact, while the globe is a real Lambert
    // sphere and its daylight is whatever two real lights make of it.
    //
    // So it was MEASURED against the claim the model makes — that a lamp
    // returns a surface toward daylight and stops there. One patch of grass in
    // front of the house, sampled at noon, then sampled at night under full
    // coverage across a range of values:
    //
    //   0.60 → 0.79 of noon    0.90 → 0.95 of noon
    //   0.75 → 0.88 of noon    1.05 → 1.01 of noon   (a lamp out-doing the sun)
    //
    // 0.80 lands about nine tenths of noon: unmistakably daylight-ish, still
    // short of the sun, and clear of the point where the red channel clips and
    // the grass starts losing its texture to white.
    //
    // Worth recording that the first guess was 1.9, reasoned from the noon
    // ambient's 1.55 intensity. It was more than twice too much — every value
    // above 1.05 clips — because that intensity is what feeds a linear
    // lighting sum, and this multiplies a texel on the way out. Reasoning about
    // it produced a number wrong by a factor of two; measuring it took a minute.
    this.groundLit = { value: 0.80 };

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
    // What every lamplit material declares. One block, because there is one
    // model now — see _wearHour, which is the only thing that quotes it.
    const LAMP_UNIFORMS = `
      uniform vec3 uLampAt[${N}];
      uniform float uLampReach[${N}];
      uniform float uLampInner[${N}];
      uniform float uLampIn[${N}];
      uniform float uLampK[${N}];
      uniform vec3 uLampTarget[${N}];
      uniform float uPlateau;
      varying vec3 vLampAt;
    `;
    // `uDark` is deliberately NOT in here. It is declared by _wearHour itself,
    // because a world with no lamps in it still has an hour — this block is
    // only emitted when there is something to light with.
    this._lampUniformsGLSL = LAMP_UNIFORMS;
    // FOUR ADDITIVE LAMP LOOPS STOOD HERE, and they are one restore now.
    //
    // There were `lampLoop(facing)` for the grass and the trees, `ROOM_ADD` for
    // the furniture, `CAST_ADD` for whoever walks, and `LOOSE_ADD` for whatever
    // you can pick up. Every one of them was the same falloff written out again
    // with a different weight bolted on — a facing term here, a wall offset
    // there, a per-surface strength somewhere else — and each was correct.
    //
    // What made them four was the ADDING. An additive term has to be tuned
    // against the surface it lands on: a card out on open grass under a whole
    // sky's worth of ambient needs 0.24, a table in a shut room needs 0.72, and
    // the two numbers have nothing to say to each other. A restore has no such
    // number. It takes the dark away, and "the dark" is whatever that surface
    // was already wearing — so a wall, a bush, a bear and a character all take
    // exactly the same loop and differ only in which dark they are lifted out
    // of and which lamps they are allowed to see.
    //
    // Those two differences are the arguments to _wearHour, and they are the
    // whole of what is left. See it below, and light-model.js for the model.

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
    // ROOM_ADD AND litByRoom STOOD HERE, and what they were is worth a note
    // because the thing that replaced them looks so much simpler.
    //
    // They lit the room by ADDING a warm term to every surface, weighted by
    // half-lambert-squared — a facing curve chosen with some care, because the
    // obvious max( dot, 0 ) puts a hard terminator across every curved surface
    // in a room where nothing else has a hard edge, and plain half-lambert
    // never reaches zero so the far side of everything lifts and the room
    // flattens back into the wash it was meant to replace. There was a
    // `uLampFace` uniform alongside it, +1 or -1, because the wall is a dome
    // drawn from its back faces and three.js flips the winding rather than the
    // normals, so gl_FrontFacing could not answer which side you were on.
    //
    // Every one of those is a correct answer to a question the disc does not
    // ask. A restore is a distance and a coverage; it has no opinion about
    // which way a surface is turned, so there is no terminator to soften and no
    // face to get the wrong way round. What the reference frame actually shows
    // agrees: the lantern's circle lies across the floor, climbs the wall
    // behind it and crosses the box in front of it at the same strength, none
    // of which is what a facing term does.
    //
    // See _installHourTint for what interiors get instead, and light-model.js
    // for the model itself. ROOM_CARRY and ROOM_UNIFORMS survive above because
    // the sun's patcher and loose pieces still wear them.
    // Where the room's lights will take their slots from, once the interior
    // gets built. Outdoor lamps have already claimed everything below it.
    let roomSlot = NOUT;
    // ...and the doorways after them, one per building.
    let doorSlot = NOUT + NIN;

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
    // THE SUN IS NOW ONLY THE SUN. It used to carry the lamp loop as well —
    // one patcher because a material has one `onBeforeCompile` — and that is
    // no longer true of anything: the lamps are folded into the hour, which
    // wraps whatever is here. See _wearHour.
    //
    // Which leaves a strict division of labour, and it is worth naming because
    // the two terms behave oppositely. The sun ADDS: it is a light source in
    // the sky, it lands on the side of things turned toward it, and it must
    // reach exactly zero at the terminator so the dark half of the planet gets
    // nothing. A lamp RESTORES. Adding is right for the one thing in this world
    // that is genuinely a light rather than an absence of one.
    const SUN_DECL = `
      uniform vec3 uSunDir;
      uniform vec3 uSunTint;
      uniform float uSunLevel;
      varying vec3 vLampN;
    `;
    const SUN_ADD = `outgoingLight += uSunTint * ( uSunLevel * max( dot( normalize( vLampN ), uSunDir ), 0.0 ) );
       #include <opaque_fragment>`;

    // The world normal is carried at `project_vertex` and the token is PUT BACK,
    // which is the one thing to be careful about now that two patchers edit the
    // same shader. `begin_vertex` was the old anchor and it cannot be used by
    // more than one of them: the grass replaces it to apply its bend, so a
    // second patcher looking for it would find nothing and silently do nothing.
    // Anchoring at a token each patcher re-emits lets any number of them
    // compose in any order.
    //
    // `lampMix` is gone with the loop it weighted. It was 0 for the house, on
    // the rule that a building is not lit by its own windows — which is still
    // true and is now said by `uLampInner`, the offset that measures that
    // lamp's light from the WALL rather than from the middle of the room. What
    // it stops being is a reason for the skin to ignore lamps altogether: a
    // lantern carried up to the house now lands its circle on the wall.
    // SNOW SETTLES ON THE BUILT SCENERY, and this is where it does it. See the
    // same mix on the ground in _litGround.
    //
    // It rides in here rather than in a list of its own because `litBySun` is
    // already exactly the right gate: the only things it patches are the built
    // trees and stumps, which after the meadow has been buried are the last
    // green left on a white planet. Measured from orbit with the ground white
    // and the grass gone under, nine fully summer canopies read as a different
    // picture pasted over the top.
    //
    // A MIX HERE AND A REDRAW FOR THE CARDS, and the split is by what a thing
    // IS rather than by which was easier. A tree is a lathe — there is no
    // drawing of it to swap, and a lathe frosts perfectly well because its
    // shape already carries the light. A bush is a drawing, and this world
    // redraws its drawings: snow on a bush is not the bush with its colour
    // moved, it is a bush with snow lying on top and its flowers gone under,
    // which no mix reaches. See WORLD_SNOW in assets.js and _winter below.
    //
    // FROSTED AND NOT COVERED — never the full value, because a tree is a
    // vertical thing with leaves that shed. It catches snow on its upper
    // surfaces and stays a tree; taken the whole way to the ground colour it is
    // a white lollipop, which is the thing this world has trees for the opposite
    // of.
    //
    // WHICH SURFACES, and not just how much. This was one flat number over every
    // fragment and that is what made the winter trees read as bleached — see
    // TREE_FROST above for the whole of that reasoning and for why the underside
    // still takes a little. `normal.y` is object space, which on a tree stood up
    // by `setFromUnitVectors(UP, item.dir)` is upness on its own hillside, so
    // this needs nothing from the world matrix and cannot be thrown off by the
    // planet turning.
    //
    // The smoothstep runs from just below level to well up rather than across
    // the whole range: a face angled only slightly up should already be holding
    // snow, and the last stretch toward straight-up is where a lathe has almost
    // no area anyway. Starting at -0.1 rather than 0 keeps a hard terminator off
    // the exact silhouette edge, where a canopy's normals sweep through level.
    const litBySun = (material) => {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.sunUniforms);
        shader.uniforms.uSnow = this.snowAt;
        shader.uniforms.uSnowTint = this.snowTint;
        shader.vertexShader = `varying vec3 vLampN;
varying float vSnowUp;
${shader.vertexShader}`
          .replace('#include <project_vertex>', `vLampN = mat3( modelMatrix ) * normal;
           vSnowUp = normal.y;
           #include <project_vertex>`);
        shader.fragmentShader = `${SUN_DECL}uniform float uSnow;
uniform vec3 uSnowTint;
varying float vSnowUp;
${shader.fragmentShader}`
          .replace('#include <map_fragment>', `#include <map_fragment>
        float snowLay = mix(
          ${TREE_FROST_UNDER.toFixed(2)}, ${TREE_FROST.toFixed(2)},
          smoothstep( -0.10, 0.75, vSnowUp )
        );
        diffuseColor.rgb = mix( diffuseColor.rgb, uSnowTint, uSnow * snowLay );`)
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
    // taken, and only the held item has one — see the note where the hand is
    // patched.
    // ONE loop now, where it was two.
    //
    // It used to need two because the character's side and the light's side
    // were different KINDS of thing: the character's was a live uniform and the
    // light's was which half of the array its slot fell in, so the only way to
    // pair them was to write both halves out and weight each. Now that a lamp
    // carries its own side, both are numbers and the pairing is arithmetic —
    // `mix` picks out the lights on the same side of the wall as the body, and
    // is 1 only when the two agree.
    //
    // The truth table is the whole of it: outdoors reading an outdoor lamp is
    // mix(1,0,0) = 1; outdoors reading a room lamp is mix(0,1,0) = 0; indoors
    // reading a room lamp is mix(0,1,1) = 1; indoors reading the house's own
    // porch light is mix(1,0,1) = 0, which is the flat wash this mask exists to
    // keep off somebody standing in their own front room.
    // The `sameSide` pairing survives all of this and is the one piece of the
    // old machinery that came through unchanged — see the mask _wearHour builds
    // for a mover. It was always the right idea; it was only ever bolted to the
    // wrong kind of term.

    // ------------------------------------------------- and what you carry
    //
    // A loose piece — the bear, the kettle, the lamp — is the third kind of
    // thing that crosses the threshold, after the cast and the hand, and it was
    // the last one still nailed to a side.
    //
    // It used to be built exactly like a table: its fills went on the interior
    // tint list and took `litByRoom`, both of which are correct for a table and
    // wrong for anything you can pick up. Set a bear down on the grass and it
    // wore the ROOM's midnight — darker than the moonlight around it — and read
    // only lights that were indoors, so a lantern standing beside it in the
    // open lit the grass under it and left the bear black. That is the picture
    // the portable lamp exists to make, and it was the one picture it could not.
    //
    // So: the same `sameSide` pairing the cast use. What it does NOT get any
    // more is the facing term — a bear is real geometry with honest normals, so
    // it could have one, and the disc has no use for it. See the note where
    // ROOM_ADD was retired.
    //
    // The patcher itself is `_wearHour` with a mover's mask; there is nothing
    // left here that is specific to a bear.

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
    // that lamp has, a tenth of a unit is a fifth of the disc, which comes out
    // as the thing in your hand pulsing on a seven-second cycle. Adding the
    // world's own offset back on measures the distance the planet would measure.
    //
    // `world.position` is handed over as the live object rather than a copy:
    // update() rewrites it every frame, so the correction follows the bob with
    // nothing to keep in step.
    if (this.hand) {
      this._handDark = { value: new THREE.Color(0xffffff) };
      this._handSide = { value: 0 };
      this._wearHour(this.hand.mat, {
        dark: this._handDark, mask: 'side', side: this._handSide,
        lift: { value: this.world.position }, tag: 'hand',
      });
    }

    // ...and the wind, which only the grass feels.
    //
    // It used to carry the lamp term as well — `swayAndLamp` — for the reason
    // every patcher in this file used to carry everything it needed: a material
    // has one `onBeforeCompile`, and setting it twice quietly deletes the
    // first. That constraint is gone now that the hour WRAPS whatever is here
    // instead of replacing it, so this is back to being about wind.
    //
    // The bend still happens before `vLampAt` is taken, and now for a reason
    // that needs no arranging: _wearHour anchors its carry at `project_vertex`,
    // by which point `transformed` has been through everything. A blade leaning
    // into the light is lit where it has leaned to rather than where it grew,
    // and neither patcher has to know the other exists.
    const sway = (material) => {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uWindAxis = { value: WIND.axis };
        shader.uniforms.uWindAmp = { value: WIND.amp };
        shader.uniforms.uWindSpeed = { value: WIND.speed };
        shader.uniforms.uWindFlow = { value: WIND.flow };
        shader.vertexShader = `
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
           transformed += cross( rad, uWindAxis ) * ( aSway * uWindAmp * gust );`,
        );
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
    // The ground cover's readers of CONFIG.biomes. The ground texture is the
    // first, over in art.js, and the scenery spiral the fourth; all of them ask
    // `biomesAt`, so a field cannot be blond in the paint and lush in the
    // planting.
    const _mix = [];
    // How readily what grows here bothers to. A plain weighted average now that
    // the mix always includes the base biome and always sums to one — it used to
    // start at 1 and accumulate each biome's departure from it, because the
    // meadow was a default living outside the table rather than an entry in it.
    const coverAt = (d) => {
      let k = 0;
      for (const { biome, w } of biomesAt(d, CONFIG.biomes, _mix)) k += biome.cover * w;
      return k;
    };
    // Thinning by REJECTION, folded in beside the lake and footprint rules so
    // there is one predicate deciding whether a spot is available.
    //
    // `kind` is the second half of it and the half that empties the sand: a spot
    // is refused outright where the ground does not grow that kind of thing at
    // all, and softly in proportion where it half does. Rolling against the
    // weight rather than taking the strongest biome — which is what the scenery
    // spiral has to do — is affordable here because there IS a random stream,
    // and it is worth spending: ground cover is dense enough that a hard line
    // through it would be a visible circle of flowers stopping dead.
    //
    // Worth being clear about what rejection does to the totals: it does not
    // reduce them. A tuft turned away on the sand is retried somewhere else, so
    // the count asked for is the count planted and the planet's cost does not
    // wander with the config — what changes is WHERE they land, which is the
    // whole point. It does mean a kind no biome grows would spin the guard in
    // `scatterPoints` to its limit and plant nothing, which is the right
    // failure: nothing asked for is nothing built.
    const plantable = (margin, kind) => {
      const busy = occupied(margin);
      return (d) => busy(d)
        || rand() > growWeight(d, CONFIG.biomes, kind)
        || rand() > coverAt(d);
    };

    // ...and the colour of what does grow. Two greens per tuft, averaged over
    // whatever biomes the tuft is standing in — the meadow's own pair among
    // them, from the table, rather than as a starting colour read out of PAL.
    const _bLow = new THREE.Color();
    const _bHigh = new THREE.Color();
    const bladeShade = (d, low, high) => {
      low.setRGB(0, 0, 0);
      high.setRGB(0, 0, 0);
      for (const { biome, w } of biomesAt(d, CONFIG.biomes, _mix)) {
        _bLow.set(biome.blade[0]);
        _bHigh.set(biome.blade[1]);
        low.r += _bLow.r * w; low.g += _bLow.g * w; low.b += _bLow.b * w;
        high.r += _bHigh.r * w; high.g += _bHigh.g * w; high.b += _bHigh.b * w;
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
    // 1000, up from 620. The planet read thin: random scatter clumps, and
    // clumping is exactly what leaves the bald patches an even spread never
    // would, so the count has to overshoot what an evenly-spread lawn would need
    // before the gaps close. Six hundred was the number that made a built tuft
    // stop looking like a mown lawn; a thousand is the number that stops the
    // ground between them reading as bare.
    //
    // It is one merged mesh and one draw call whatever this says. What it does
    // cost is the untouched copy 草むしり keeps to regrow from — 81 vertices a
    // tuft, three floats each — which is about a megabyte here, paid once at
    // build.
    //
    // 1400 now, and the extra four hundred are the meadow's. Nearly all of this
    // count lands there — the sand's `cover` turns most of what tries away — so
    // a number counted for a planet of uniform grass was going to leave the one
    // biome that is supposed to be thick with it no thicker than before, while
    // the sand got its thinning for free. Spread over the three-quarters of the
    // surface that grows grass properly this is about twice the density the
    // planet had, which is what "the most green" costs.
    const BLADE_TUFTS = 1400;

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
    const tuftDirs = scatterPoints(BLADE_TUFTS, rand, plantable(0.045, 'grass'));
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
    // The one thing on the planet that bends. It joins `tintables` below like
    // everything else and takes its light from there; this is only the wind.
    sway(blades.material);
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
    //
    // 90, for the same reason the grass went up and in the same proportion: they
    // are a meadow flower now rather than a planet one, and seventy-five of them
    // confined to three-quarters of the world and standing in grass twice as
    // thick would have been a quieter meadow than the one they came from.
    const FLOWER_COUNT = 90;
    const flowerH = 0.34;
    for (let v = 1; v <= FLOWER_VARIANTS; v++) {
      const key = `flower${v}`;
      const cv = canvasFor(key);
      covers.push(buildGroundCover(
        R,
        scatterPoints(
          Math.round(FLOWER_COUNT / FLOWER_VARIANTS), rand, plantable(0.04, 'flower'),
        ),
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
        Math.round(MUSHROOM_COUNT / MUSHROOM_VARIANTS), rand, plantable(0.04, 'mushroom'),
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

    // WHAT THE SNOW BURIES, collected as it is built.
    //
    // The ground going white is only half of a white world, and the missing
    // half is loud. Whitening the SURFACE and leaving everything growing out of
    // it alone was measured from orbit and reads as grey dirt with a green
    // fuzz on it and flowers in bloom — not as snow at all, because the one
    // thing snow certainly does is cover the things that are shorter than it.
    //
    // Buried rather than whitened, and that is the choice worth recording. A
    // white grass blade is a drawn shape that has lost its colour; grass under
    // snow is grass you cannot see. The second is both cheaper and truer, and
    // it is what brings the meadow back untouched when the thaw comes.
    //
    // The blades go in here too, which is why this is a list rather than the
    // `covers` array on its own: they are separate merged geometry built a few
    // lines up, and they are the greenest thing on the planet.
    for (const cover of covers) {
      this.world.add(cover);
      this.tintables.push(cover.material);
      this._buried.push(cover);
    }
    this._buried.push(blades);

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
    // What the geometry above is currently cut to, so a focus that wants the
    // same size as the last one costs nothing. See _markSize.
    this._markR = WALK_MARK.r;

    // The two floating focus marks — see FOCUS_MARK. One texture painted once;
    // a material each, because both join `tintables` and a shared material
    // would be tinted twice per frame for no saving worth having.
    //
    // Children of `world` like the ring, so every position written into them
    // is in the same frame the characters' own roots and the loose anchors
    // are — which is what lets _syncFocusMarks copy those positions straight
    // across without a change of basis.
    //
    // renderOrder 500: above the whole cast (they climb from 10) and below the
    // hand at 9000, because the mark is ABOUT the world rather than of it —
    // it must never be cut in half by the head it floats over — but a thing in
    // your hand is nearer than any annotation. Depth test stays on, so walls
    // and trees still hide a mark whose target has gone behind them.
    const focusTex = texFrom(paintFocusMark());
    const mkFocusMark = () => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(FOCUS_MARK.w, FOCUS_MARK.w),
        sceneryMaterial(focusTex),
      );
      mesh.renderOrder = 500;
      mesh.visible = false;
      mesh.material.opacity = 0.96;
      this.world.add(mesh);
      this.tintables.push(mesh.material);
      // `clock` staggered so two marks on screen never bob in step — moving
      // as one drilled unit is the tell that they are widgets.
      return { mesh, target: null, lift: 0, on: 0, clock: Math.random() * 1400 };
    };
    this._markPerson = mkFocusMark();
    this._markThing = mkFocusMark();
    // ...and a third, for a PLACE. The stump 「いっておいで」 would send a friend
    // to is not a loose piece and not a person: nothing owns an anchor object to
    // hang a mark off, only a bearing and a height. Its own mark rather than a
    // borrowed one because the grab mark can be live at the same moment — you
    // may be leading somebody past a stump with a lantern at your feet — and two
    // questions sharing one mark would answer only the later one.
    this._markSpot = mkFocusMark();
    this._fmAt = 0;

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
    // Unlike the foliage, the pudding keeps its clean illustrated colours in
    // snow rather than taking the tree-frost mix. It still wears the outdoor
    // hour and nearby lamplight through the shared tintable path below.
    built.puddingcup = {
      build: (_key, h) => BUILD.puddingcup(h),
      sun: false,
    };
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
    // Scratch for measuring a built prop's own bulk — see `reach` below. One
    // box reused round the loop; nothing holds onto it past the iteration.
    const _bb = new THREE.Box3();

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
      const sr = solidRadius(item.type, h);
      if (sr > 0 && !inBuilding(item.dir)) {
        const entry = { dir: item.dir, r: sr / R };
        // ...and whether it is short enough to get on top of. A stump is the
        // only thing out here that is: a tree has no top you could reach.
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
      // A card with a snow drawing of its own is remembered along with BOTH of
      // its textures, so the swap later is a choice between two things already
      // in hand rather than a lookup by type on every prop on the planet.
      if (snowTex.has(item.type)) {
        this._snowCards.push({
          mesh, summer: tex(item.type), winter: snowTex.get(item.type),
        });
      }
      // The prop catches the lamplight by being on that list, and there is no
      // longer an exception for a prop that IS a lamp.
      //
      // `if (!NIGHT_ART[item.type]) litByLamp(...)` stood here, so that a
      // building would not be lit by its own windows. Under an ADDITIVE term
      // that mattered: the daylight card sitting under the lit one took a flat
      // 0.24 of warm across its whole face, invisible at midnight and glaring
      // mid-dusk when the two cards are half and half. Under a restore there is
      // nothing to add — a building standing in its own escaped light is
      // returned toward the colour it was drawn, which is what a lit building
      // looks like — and the offset that keeps that light measured from the
      // WALL rather than from the middle of the room does the rest. See
      // uLampInner.

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
            color: new THREE.Color(PAL.lampGlow),
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

        // THE POOL ON THE GRASS IS GONE, and it was the last painted light in
        // the app.
        //
        // `buildGlowPatch` made it: a spherical cap projected down onto the
        // planet, wearing a gradient with a hole cut in the middle for the
        // building's own footprint, drawn additively at an alpha the lamp's
        // switch dimmed. There was arithmetic here to go with it — the wall's
        // radius measured through the world is not the same number as the wall's
        // radius measured across the tangent plane the patch is laid out on, so
        // `flat` converted between them (3.41 for a 3.2 wall) or the bright ring
        // would have sat two tenths INSIDE the building it was meant to light.
        //
        // All of it existed because the ground could not be asked what light was
        // reaching it. It can now — see _litGround — so the spill is the same
        // disc, from the same slot, evaluated by the same loop as every other
        // light in the world. The offset that used to be a projection
        // correction is `uLampInner`, which the shader was already reading.
        //
        // What it buys, beyond one fewer mesh per building: a lantern carried
        // out through a door draws ONE circle, which crosses from the boards to
        // the grass without a seam, because it is one circle.

        // This prop's slot in the shader's lamp arrays. lampProps was filtered
        // out of `props` in the same order this loop walks it, so the nth lit
        // prop built is the nth lamp.
        const slot = lampSlot++;
        this.lampUniforms.uLampReach.value[slot] = reach;
        this.lampUniforms.uLampInner.value[slot] = inner;
        // What light escaping a window restores the grass toward. Warmer than a
        // lamp's own target on purpose: this is the one emitter in the world
        // seen entirely as SPILL — you never see the source, only what it lands
        // on — so the warmth has nowhere else to live. Indoors the lamp itself
        // is on screen carrying it.
        this.lampUniforms.uLampTarget.value[slot].set(PAL.lampSpill);

        lit = { night, bloom, slot };
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

      // HOW FAR PAST THE LIMB THIS PROP'S OWN BULK CARRIES IT. Added to the
      // camera's own reach to decide whether it is still worth drawing.
      //
      // For a card this is height and nothing else, and that is not an
      // approximation: a card is a plane THROUGH the anchor that turns to face
      // you, so it has no extent toward you to speak of. Its top is at `h`, and
      // a point at h stays in sight until acos(R/(R+h)) past the limb.
      //
      // A built prop is a different animal and gets measured below.
      let reach = Math.acos(clampUnit(R / (R + h)));

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

        // MEASURED off the thing itself, because neither number the card
        // carries is true of the building.
        //
        // `size.h` is the DRAWING's height and the built shape overshoots it —
        // the house's dome tops out at 3.74 against a card of 3.0. And a built
        // prop is WIDE: the house is 3.2 out from its own middle on a planet of
        // radius 8, so its near wall crests the limb some twenty degrees before
        // its centre does. Culling on the centre is exactly what made it appear
        // rather than rise — measured, it was switched off at 84 degrees while
        // it went on being visible to 99.
        //
        // Read in the built group's own frame, before the shell tilts it onto
        // the hillside and scales it, so +Y is up and the origin is the foot.
        // `item.s` then carries both to world size.
        _bb.setFromObject(made.group);
        const top = _bb.max.y * item.s;
        const out = Math.max(-_bb.min.x, _bb.max.x, -_bb.min.z, _bb.max.z) * item.s;
        // The corner of that box, which is the furthest-reaching point it can
        // hold. A vertex `out` sideways and `top` up sits at radius
        // hypot(out, R + top) and `atan(out / (R + top))` off the prop's own
        // normal, and BOTH of those buy it distance past the limb — the offset
        // directly, the extra radius through the usual acos. The real geometry
        // is narrower than its box at the top, so this runs a degree or two
        // generous, which is the right way to be wrong: too early costs a draw
        // call on something hidden, too late is the pop.
        const up = R + top;
        reach = Math.atan(out / up) + Math.acos(clampUnit(R / Math.hypot(out, up)));
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
          if (recipe.sun !== false) litBySun(m);
        }
        mesh.visible = false;
      }

      // `reach` is worked out above, and it used to read
      // `acos(R / (R + h * 0.5))` right here. Two things were wrong with that
      // and only the first is obvious: the last part of a prop to sink is its
      // TIP, so there is no half in the formula, and a prop with any width at
      // all sinks by its far side long after its near side.
      this.sprites.push({
        anchor, holder, mesh, lit, shell, retired: !!shell,
        trunk: shell ? trunk : null, treeH: shell ? h : 0,
        normal: item.dir,
        type: item.type,
        horizon: reach,
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

    // THE BUILDINGS YOU CAN GO INSIDE, one record each — see CONFIG.homes.
    //
    // It was a single `this.house` for a long time and the day the cave went in
    // is the day that stopped being a description of the world. What made the
    // change survivable is that only a handful of things ever genuinely cared
    // WHICH building: the wall arcs the tinting and the controls read, the glow
    // on the openings, the lid the camera lifts when it climbs out through a
    // roof, and the horizon cull. Everything else — the tint lists, the seats,
    // the loose furniture, the room lamps — is a list of things that are
    // INDOORS, and indoors is one condition rather than one place. Those stayed
    // shared, and that is why this is a modest record rather than a second copy
    // of the Globe.
    this.homes = [];
    // ...and the first of them, which is still a field of its own because it is
    // where you ARRIVE. main.js spawns you on its doorstep and the camera looks
    // at it; neither of those is a question about buildings in general.
    this.house = null;

    // What the inside of the house owns: its own tint list (the interior wears
    // its own hour — see tintIn in daylight.js), the seats a guest may take,
    // and one group holding the lot so the horizon cull can put the whole room
    // away with the building it is in. All initialised here so a planet with
    // no house still has empty lists to walk rather than fields to trip on.
    this.interiorTintables = [];
    // The painted patches of shade under the furniture, kept with the opacity
    // each was BUILT at so dimming them is a multiply — see _syncRoomShade.
    this.interiorShade = [];
    // `this.seats = []` stood here — where a guest could sit, filled from
    // `f.seat` in the furniture tables. Neither room ever flagged one, so it was
    // empty for its whole life and nobody indoors ever sat down; sitting is in
    // place now and claims nothing. See _standThemUp in household.js.
    // Furniture that is not where it was put — see nudgeLoose. Empty unless
    // something in CONFIG.interior.furniture asks to be an `item`.
    this.loose = [];
    // ...and what each of those wears and reads, which is not the room's answer
    // once it can leave the room. See _syncLoose.
    this.looseLit = [];
    // Where the shover stood last frame, so the shove can be given a direction
    // of travel. Null whenever nobody is in a position to shove anything, which
    // is also what stops a walk resumed after a flight counting as one enormous
    // step across the room.
    this._looseWas = null;
    this.tintIn = new THREE.Color('#FFFFFF');
    this._tintInBase = new THREE.Color('#FFFFFF');
    // The room's colour as the CAST wear it, which is not the room's colour —
    // see the lift in _syncInterior. Kept as its own value because two places
    // write it: the hour, and stepping through the door.
    this.tintCast = new THREE.Color('#FFFFFF');
    // ...and the same for the cast out under the sky, which is a smaller lift
    // off a different dark — see CAST_LIFT.
    this.tintCastOut = new THREE.Color('#FFFFFF');

    // ---------------------------------------------------------- the homes
    //
    // Real geometry, and the only props out here that are. Everything else you
    // pass by; these are the ones you walk AROUND, and a billboard cannot
    // survive that — it turns with you, so circling a building gives no sign
    // you are moving relative to it and the drawn door faces you from every
    // bearing. A door everywhere is a door nowhere, which left the house with
    // no front and you with no way to tell where to walk to find the way in.
    //
    // Each one's two drawn sheets are retired rather than deleted: the day card
    // and the night card are still built, still cross-faded, and simply never
    // shown. That keeps the whole lamp machinery — the pool on the grass, the
    // bloom in the air, the dusk curve — working untouched while the shape
    // changes underneath it.
    //
    // THE LOOP IS THE WHOLE OF WHAT MAKES TWO HOMES POSSIBLE, and it is worth
    // saying why it is a loop over config rather than a method taking a spec.
    // Everything in here reads a dozen things from the surrounding scope — the
    // planet's radius, the measured footprints, the texture cache, the four
    // ways a material can be told about light, the running lamp-slot counter —
    // and threading those through a signature would have been a far bigger
    // change to a far larger surface than the one actually being made. What
    // differs between a house and a cave is a handful of numbers and a set of
    // painters, so that is all that varies here.
    for (const home of CONFIG.homes) {
      const sprite = this.sprites.find((s) => s.type === home.type);
      // A home whose landmark was never scattered simply does not exist. Same
      // guard the single-house version had, and it is what lets CONFIG.homes be
      // edited without CONFIG.landmarks having to keep up in the same commit.
      if (!sprite) continue;
      const spec = home.spec;
      const art = HOME_ART[home.style];
      const doorSheet = art.doorSheet;

      // The same wall the lamplight above was cut to, through the same reader.
      // These were two separate lookups and that is a pairing that only ever
      // breaks silently: a house built to one radius with its halo cut to
      // another is a house with a ring of light sat inside its own front room.
      const rad = wallAt(sprite.normal) || 2.45;

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
      //
      // For the cave that bearing is not a decision so much as a consequence:
      // it is the hill's own bearing turned a half circle, so the hollow opens
      // away from the rock it is cut into. See CONFIG.cave.doorFacing.
      const shell = new THREE.Group();
      shell.quaternion.setFromUnitVectors(UP, sprite.normal);
      {
        const N = sprite.normal;
        // Where bearing 0 currently points, as a tangent...
        const cur = new THREE.Vector3(0, 0, 1).applyQuaternion(shell.quaternion);
        // ...and where it should: the local compass, turned by doorFacing.
        localFrame(N, _pw, _pw2);            // _pw east, _pw2 north
        const f = spec.doorFacing || 0;
        const want = _pw2.clone().multiplyScalar(Math.cos(f)).addScaledVector(_pw, Math.sin(f));
        // The signed turn from one to the other about the normal. Signed via
        // the triple product, because acos alone cannot tell east from west.
        const spin = Math.atan2(N.dot(_spin.crossVectors(cur, want)), cur.dot(want));
        // Post-multiplied, so it turns about the shell's OWN up — which the
        // first rotation has already laid onto the normal.
        shell.quaternion.multiply(_q.setFromAxisAngle(UP, spin));
      }
      sprite.anchor.add(shell);
      // This building's own warm-at-night materials and its own outward faces.
      // Per home rather than shared, because the two things that read them ask
      // a question about ONE building: how much light is escaping from this
      // room, and is the camera over this roof.
      const houseGlow = [];
      const houseOuter = [];

      // THE RECORD, made now and filled in as the building goes up.
      //
      // It exists this early because the wall registration two hundred lines
      // down writes into it, and threading four separate locals down to there
      // and back is exactly the sort of bookkeeping that goes stale. Everything
      // on it is something a reader OUTSIDE this loop needs, and nothing that
      // is only wanted while building is on it.
      const rec = {
        sprite,
        spec,
        style: home.style,
        owner: home.owner,
        // The shell's radius, which is also its height — half a circle, so the
        // two are one number and cannot drift apart.
        rad,
        shell,
        // Filled in below, as each is made.
        interior: null,
        door: null,
        plate: null,
        glow: houseGlow,
        outer: houseOuter,
        // The wall arcs the tinting and the controls read, and the footprint
        // object the collision layer holds. Left undefined until the wall is
        // registered, which is also the guard every reader tests.
        wallCos: undefined,
        wallInnerCos: undefined,
        building: null,
        // How much light is escaping from THIS room, 0 to 1. Its own value per
        // home, because the whole point of it is that a lit house and a dark
        // cave should not advertise each other.
        lit: 0,
        // ...and the total reach of the lamps in it, which is what that share
        // is measured against.
        reach: 0,
        // Whether the camera is currently over this roof — see the lid in
        // update(). Per home for the obvious reason: you can only be over one.
        overRoof: false,
        // How full this house is, 0 to 1, and the evening as it sees it — see
        // setOccupancy and _lampsIn. Starts full so a home built before
        // household.js has said anything is a lit one rather than a derelict.
        occupancy: 1,
        lamps: 0,
        // `_burning: 0` stood here — a scratch field this record carried so
        // that the pass which totals each room's lit lamps had somewhere to
        // accumulate. It was state on a long-lived object that only meant
        // anything for the few lines between being zeroed and being read, which
        // is the shape of thing a pure computation does not need: _lightState
        // totals into a Map of its own and throws it away.
      };
      this.homes.push(rec);

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
      const doorW = spec.doorWidth;
      const doorH = doorW * (doorSheet.h / doorSheet.w);
      const dThetaLen = doorH / rad;
      const dThetaStart = (Math.PI / 2 + GROUND) - dThetaLen;
      const dRing = rad * Math.sin(dThetaStart + dThetaLen / 2);
      const dPhiLen = doorW / Math.max(dRing, 0.5);
      // ...and the same for a window, which is square and hangs at a height
      // rather than standing on the ground — the `grounded` false branch.
      // Worked out even for a style with no windows, since it costs four lines
      // of arithmetic and the alternative is two branches to keep in step.
      const winW = spec.windowSize;
      const wThetaLen = winW / rad;
      const wThetaStart = Math.max(0.05,
        Math.acos(clampUnit(spec.windowHeight / rad)) - wThetaLen / 2);
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
        archPath(g, iw, 0, toBottom, iw * doorSheet.arch);
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
        if (art.windows) {
          for (const at of spec.windowsAt) {
            punch(canvas, at, wPhiLen, wThetaStart, wThetaLen, paneCut);
          }
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
        map: texFrom(punchAll(art.skin())), alphaTest: 0.5,
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
        color: new THREE.Color(art.ink), side: THREE.BackSide,
        alphaMap: texFrom(punchAll(hullMask)), alphaTest: 0.5,
      });
      shell.add(line);
      const body = dome(0, THREE.FrontSide);
      body.material = skin;
      shell.add(body);

      // ...and for a cave, the two OUTER layers stop being a sphere.
      //
      // Only these two. The interior wall below is built from the same helper
      // and is deliberately left alone, which is the whole separation: what you
      // see from the grass is a lumpy hill, what you stand in is a clean dome,
      // and neither has to compromise for the other. A house wants those to be
      // the same object and gets to keep them so.
      //
      // Both layers take the SAME displacement, so the ink hull goes on hugging
      // the skin — a line that did not follow the bumps would come apart from
      // the shape exactly where the shape got interesting.
      if (home.style === 'cave') {
        // The middle of the mouth, as a direction on the unbulged sphere, and a
        // circle around it big enough to hold the drawn frame and its own ink.
        const dMid = dThetaStart + dThetaLen / 2;
        const doorDir = new THREE.Vector3(0, Math.cos(dMid), Math.sin(dMid));
        const guard = Math.min(1.15, (doorW / rad) * 0.9);
        caveBulge(line.geometry, doorDir, guard);
        caveBulge(body.geometry, doorDir, guard);

        // ...AND GRASS GROWS ON THE GRASS.
        //
        // The painted crown now carries the same ticks and tiny blossoms as the
        // globe's meadow. These dimensional blade clumps are its second layer,
        // matching the real grass that stands above the field texture.
        //
        // AS MANY AS THE MEADOW WOULD PUT HERE, worked out from area rather than
        // chosen, so this follows BLADE_TUFTS instead of quietly disagreeing
        // with it the next time somebody decides the planet looks thin.
        const crown = CAVE_TURF * (Math.PI / 2 + SKIRT) - CAVE_TURF_INSET;
        const capA = 2 * Math.PI * rad * rad * (1 - Math.cos(crown));
        const n = Math.round(BLADE_TUFTS * (capA / (4 * Math.PI * R * R)));
        const crownDirs = [];
        for (let k = 0; k < n; k++) {
          // Uniform over the cap: y is flat in cos(theta), which is what stops a
          // naive angle roll piling every tuft onto the summit.
          const y = 1 - rand() * (1 - Math.cos(crown));
          const rr = Math.sqrt(Math.max(0, 1 - y * y));
          const th = rand() * Math.PI * 2;
          crownDirs.push(new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr));
        }
        if (crownDirs.length) {
          // Shaded off the hill's OWN spot rather than each blade's, because
          // every one of them is standing in the same few metres and asking per
          // tuft would just be the same answer a hundred times.
          const _cl = new THREE.Color();
          const _ch = new THREE.Color();
          bladeShade(sprite.normal, _cl, _ch);
          const crop = buildGrassBlades(
            rad, crownDirs, rand, grassH * 0.92,
            (d, low, high) => { low.copy(_cl); high.copy(_ch); },
          );
          // Onto the lumps, by the same masked displacement the rock took.
          caveLiftTufts(crop.geometry, crownDirs, doorDir, guard);
          // THE MEADOW'S OWN MATERIAL, not a second one. It carries the wind
          // patch and sits in `tintables`, so sharing it is what gets the hill's
          // grass moving with everybody else's and wearing the same hour — and
          // a private clone would need its own uTime driven every frame and
          // would silently stop moving the day somebody forgot.
          crop.material = blades.material;
          // A child of the shell, so it turns and stands with the hill. That
          // does mean the wind axis reaches the vertex shader in the shell's
          // frame rather than the world's, so the breeze crosses the crown at
          // its own angle — which is a thing hills do, and cheaper than a second
          // material to say it.
          shell.add(crop);
          // ...and it goes under the snow with the rest of the meadow — see
          // _bury. It shares the meadow's material but is its own mesh on its
          // own hill, so the walk that shortens the grass has to be told about
          // it by hand. Left out, the one green thing on a white planet is the
          // fringe round the cave, which is exactly where the eye goes.
          //
          // The same scale works on it for the same reason: `crop` is built
          // standing on the cave's own sphere, so shrinking it about the
          // shell's origin shortens each blade along its own normal.
          this._buried.push(crop);
          // ...and it goes off with the rock when you fly over the top, or you
          // would be looking down into the room through a hovering lawn.
          houseOuter.push(crop);
        }
      }

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
      // The `0` that stood here turned the lamp term off for the skin
      // entirely — a house is not lit by its own windows — and it is gone. The
      // skin reads every OTHER lamp in the world now, which is what buys the
      // picture that made this rework worth doing outdoors as well as in:
      // carry the lantern up to the house at night and its circle lands on the
      // wall. Its own light it still ignores, and by name rather than by
      // weight — see `self` in _wearHour, and the sweep in _installHourTint
      // that hands it over.
      litBySun(skin);
      // Named on the record so that sweep can find it. NOT pushed onto
      // `outer` — that list is walked by the roof-lift, which writes `.visible`
      // on every entry, and a material is not a mesh.
      rec.skin = skin;
      houseOuter.push(line, body);

      // The wall you see from the rug: the same dome a hair inside the skin,
      // drawn from its back faces, wearing the room's own wall art. It is what
      // covers the hull's ink from indoors, and what shows through the open
      // door from the grass — the first honest glimpse of the inside of
      // anything this planet has had. Punched like the rest, so the doorway is
      // open from both sides. Tinted by the INTERIOR hour, not the sky's: warm
      // at night, which is the story the lit windows have always told.
      const wallIn = dome(-0.06, THREE.BackSide);
      wallIn.material = new THREE.MeshBasicMaterial({
        map: texFrom(punchAll(art.wall())), side: THREE.BackSide,
        alphaTest: 0.5,
      });
      // The wall wraps the whole way around, so its left edge IS its right
      // edge — without the wrap the seam shows as a hairline, floor to crown.
      wallIn.material.map.wrapS = THREE.RepeatWrapping;
      shell.add(wallIn);
      this.interiorTintables.push(wallIn.material);
      // The biggest surface in the room, and so the one the lamps have most to
      // say about. It takes them by being on that list and needs no patching of
      // its own — see _installHourTint, which gives every interior surface the
      // same disc.
      //
      // `litByRoom(wallIn.material, -1)` stood here, and the -1 with it. That
      // was a facing term: the wall is a dome drawn from its back faces, so its
      // normals point out into the masonry and had to be flipped before a
      // lambert term would light the side you are stood on. The disc does not
      // ask which way a surface is turned — it is a distance and nothing else —
      // so there is no side to get the wrong way round, and the sign goes with
      // the question.
      //
      // What is bought in exchange is the thing the frame actually shows: the
      // lamp's own circle, ON the wall, where the wall happens to pass close to
      // it. A facing term could only ever say "this half of the room is nearer
      // the light"; a disc says where the light stops.

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
        else if (opts.outdoorTint) {
          this.tintables.push(m.material);
          houseOuter.push(m);
        } else {
          houseGlow.push(m.material);
          houseOuter.push(m);
        }
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
        art.doorOuter(), 0, doorW, { grounded: true, proud: 0.035 },
      );
      const houseDoor = doorFrame.grp;
      rec.door = houseDoor;
      // THE DOORWAY AS A LIGHT. Its slot, an anchor at the opening, and the
      // side of the wall it lights, which is IN — see NDOOR.
      //
      // The anchor is the door's own group, so a building that gets moved or
      // turned takes the light with it, exactly as a lamp does. Nothing here
      // says how bright it is or what colour: the hour decides both, every
      // frame, in _applyLight.
      rec.doorLight = doorSlot++;
      this.lampUniforms.uLampReach.value[rec.doorLight] = rad * SKY_DOOR.reach;
      this.lampUniforms.uLampIn.value[rec.doorLight] = 1;
      face(art.doorInner(), 0, doorW, {
        grounded: true, proud: -0.10, side: THREE.BackSide, sink: 'interior',
      });
      // Chiikawa's portrait plate. It follows the shell just like an opening
      // frame but does not punch the wall, so its drawing stays square to the
      // curved façade while remaining slightly proud of the plaster.
      if (art.plate && Number.isFinite(spec.plateAt)) {
        const plateBlock = face(art.plate(), spec.plateAt, spec.plateSize, {
          y: spec.plateHeight, proud: 0.045, outdoorTint: true,
        });
        rec.plate = plateBlock.grp;
      }
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
      //
      // The cave has none, and skips the lot. That is the one place where "a
      // cave is a house with different numbers" stops being true and it is
      // worth naming: a hole in the side of a rock is a second entrance, not a
      // window, and a hollow whose only opening is its mouth is the whole
      // reason its one lantern matters after dark.
      if (art.windows) {
        for (const at of spec.windowsAt) {
          face(paintHouseWindowFrame(), at, winW, { y: spec.windowHeight });
          face(paintHouseWindowFrame(), at, winW, {
            y: spec.windowHeight, proud: -0.10,
            side: THREE.BackSide, sink: 'interior',
          });
        }
      }


      // ----------------------------------------------------- inside the house
      //
      // Everything from here down is the room. It lives in the same world as
      // the grass because it IS the same world: what marks it as indoors is
      // being within the wall's arc, which is the question the collision asks
      // (sphere.js) and the question the tinting asks (_applyBlend). One
      // group, so the horizon cull can put the whole interior away with the
      // building that contains it.
      // One group PER HOME, which is what the cull needs: each room has to be
      // able to sink behind the curve with the building that contains it, and a
      // shared group would take the far room away with the near one.
      const interior = new THREE.Group();
      this.world.add(interior);
      rec.interior = interior;
      const N = sprite.normal;

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
      // ...and the way back: a spot on the planet read as this room's own
      // (bearing, distance) pair. The inverse of spotDir, and it exists for
      // one reader — a piece PUT DOWN somewhere has a world direction and
      // needs to know where that is in the room's terms before it can be
      // stood against the wall there. See propFor below.
      //
      // The frame is the shell's own, taken the way everything else here
      // takes it, because a bearing is only meaningful in the room's frame:
      // tangentAt(0) is the door's line and tangentAt(π/2) is a right angle
      // round from it, so a tangent resolved against those two IS a bearing.
      const _bTan = new THREE.Vector3();
      const bearingAt0 = tangentAt(0);
      const bearingAt90 = tangentAt(Math.PI / 2);
      const bearingOf = (d) => {
        _bTan.copy(d).addScaledVector(N, -d.dot(N));
        if (_bTan.lengthSq() < 1e-12) return 0;
        return Math.atan2(_bTan.dot(bearingAt90), _bTan.dot(bearingAt0));
      };
      // How far out from the middle of the room a spot is, in world units —
      // the same measure `out` is written in.
      const outOf = (d) => Math.acos(clampUnit(d.dot(N))) * R;
      // Half the doorway, as a spread of BEARING at the wall, plus a little.
      // A piece propped inside this arc would be leaning on the opening
      // rather than on masonry — its head out in the gap with nothing behind
      // it — which is the one place round the room where the wall is not
      // there to do the leaning. The margin keeps it off the frame's drawn
      // ink legs as well, the same thought `gapInset` has about walking
      // through a painted line.
      const doorArc = Math.asin(clampUnit((spec.doorWidth / 2) / rad)) + 0.18;
      // Stand a thing on the sphere facing a DIRECTION: up is the surface
      // normal under its own feet, forward is the given tangent flattened
      // against that up — the identical basis the camera rig builds, so a
      // piece of furniture and the player agree about what "facing the
      // window" means. Split out of standAt because a facing arrives in one
      // of two currencies now: the furniture tables speak bearings, and a
      // set-down speaks the direction the player was actually stood in —
      // see faceDir on the loose records.
      const standToward = (obj, dir, fwdDir) => {
        obj.position.copy(dir).multiplyScalar(R);
        const fwd = fwdDir.clone().addScaledVector(dir, -fwdDir.dot(dir)).normalize();
        const right = new THREE.Vector3().crossVectors(dir, fwd);
        obj.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(right, dir.clone(), fwd),
        );
      };
      // ...and the bearing-speaking face of it, which is all this ever was.
      const standAt = (obj, dir, faceBearing) => {
        standToward(obj, dir, tangentAt(faceBearing));
      };

      // WHAT THIS ROOM OFFERS TO LEAN THINGS ON, published for anybody who
      // walks in carrying one. Everything above is scoped to this building —
      // its frame, its wall, its doorway — and a piece is born knowing only
      // the room it was authored in, which is exactly the wrong thing to
      // know: Chiikawa's fork carried into the cave should stand against the
      // cave's rock, not fail to find a house that is twenty units away.
      // So the ROOM publishes and the piece asks. See propSpotFor.
      //
      // `out` is the distance at which a leaning head meets this room's wall,
      // and it is read off whichever piece was authored leaning in here
      // rather than written down again — that entry's `out` was measured
      // against this masonry, which is the whole reason it was worth
      // measuring. One number, one place, no drift.
      //
      // It is a property of the ROOM and the PIECE together, strictly: a
      // shorter fork would touch a given wall further in. It serves as a room
      // constant because the two sasumata are one model at one length, which
      // is also why either may stand in either house. A leaning prop of some
      // other size would need its own.
      {
        const leaner = spec.furniture.find((piece) => piece.lean);
        if (leaner) {
          rec.lean = {
            out: leaner.out, spotDir, bearingOf, outOf, standAt, doorArc,
          };
        }
      }

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
      fg.drawImage(art.floor(), 0, 0, floorCv.width, floorCv.height);
      // ...and the rug drawn into it, for a home that has one. The cave does
      // not: its floor is stone and stays stone, and what warms it is the mat
      // under the table, which is furniture rather than a stain in the texture.
      // Guarded rather than left to draw at zero size — a drawImage of nothing
      // is not obviously harmless, and `rug: 0` should mean "no rug" outright.
      if (spec.rug > 0) {
        const rugPx = (spec.rug / (rad * 0.99)) * (floorCv.width / 2);
        fg.drawImage(
          paintRug(),
          floorCv.width / 2 - rugPx, floorCv.height / 2 - rugPx, rugPx * 2, rugPx * 2,
        );
      }
      const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({
        map: texFrom(floorCv),
      }));
      floorMesh.quaternion.setFromUnitVectors(UP, N);
      interior.add(floorMesh);
      this.interiorTintables.push(floorMesh.material);
      // ...and that is the whole of it: the boards take the same disc from the
      // same lamp as the wall behind them and the table standing on them.
      //
      // This line used to carry a note saying the exact opposite — that the
      // floor was DELIBERATELY the one surface in the room denied the lamp
      // term, because a painted stamp already lit it and knew things the shader
      // did not, chiefly that a lamp standing on a floor shadows the patch it
      // stands on. Both halves of that were true of an additive model with a
      // decal under each lamp, and neither survived the decal.

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
      // The bed, kept aside as it is built. Where somebody stands to get into it
      // cannot be worked out here — it depends on what else ends up in the room
      // — so the piece waits and the sweep below answers it.
      let bedPiece = null;
      const topTex = texFrom(paintTableTop());
      // The room's own shadow tone, not the planet's. This stamp falls on a
      // grey floor and a cream rug, and the grass-green one every prop outside
      // wears read in here as a patch of lawn that had got under the roof.
      const shadowTex = texFrom(paintShadow(SHADOW_ROOM));
      for (const f of spec.furniture) {
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
          // hangs. `hang` lowers the mounting point without scaling up the
          // fitting itself; no `spin` is needed because a bulb is round.
          anchor.position.copy(N).multiplyScalar(R + rad - (f.hang || 0));
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
          // LEANING — a pose, not a place. `lean` pitches the BODY about the
          // anchor's forward axis, in radians up off the floor: 0 is the
          // builder's own lie-flat, π/2 is stood square on its local +X end.
          // Positive tips the -X end up, which for the sasumata is the fork.
          //
          // On the body rather than the anchor, and the difference is a bug
          // that never shipped: the anchor carries the ground shadow too, and
          // a tilted anchor stands the shadow up on edge with the piece.
          //
          // For an `item` this is a HOME pose, exactly as `lift` below is a
          // home height — see the place() closure further down, where both
          // are re-applied at home and dropped everywhere else. Leaning is
          // something a WALL does for a piece, not something the piece knows
          // how to do on its own, so a fork set down in the middle of a
          // meadow lies flat like anything else you put down.
          //
          // A leaning piece is also the one loose thing your shins cannot
          // move — see the guard in nudgeLoose. Propped is a state somebody
          // put it in, and only picking it up takes it out of that.
          if (f.lean) built.group.rotation.z = -f.lean;
          // An item may begin on top of another piece of furniture. The lift
          // is measured along the floor normal, exactly as putDownUnique lifts
          // a piece onto a surface later.
          if (f.lift) anchor.position.addScaledVector(dir, f.lift);
        }
        anchor.add(built.group);
        interior.add(anchor);
        // A LOOSE piece joins NEITHER of the two lists below, and that is the
        // whole of its lighting being different. Both of them decide a thing's
        // side of the wall once, at build — which is right for a table and
        // wrong for anything with a handle on it. See the looseLit record made
        // further down, which gives a carried piece the same two answers as
        // things that follow it about.
        if (!f.item) for (const m of built.fills) this.interiorTintables.push(m);

        // A piece stands in the room's light by being on the list above, and
        // there is nothing to do here any more.
        //
        // `litByRoom` stood here, guarded so that a lamp was not lit by itself.
        // The guard is not needed under the disc and the reason is worth
        // keeping, because it is the model doing work rather than a rule being
        // remembered: restoring a surface can only ever take it back toward its
        // own daylight colour, so a lamp's glass sitting in its own light is
        // returned to the colour it was drawn, which is what a lit lamp looks
        // like. The old term ADDED warmth, so a bulb standing in its own pool
        // got brighter than lit — and a switched-off one, still sitting in the
        // slot, glowed at midnight. Nothing can add to itself now.
        //
        // The glass keeps its own colour written on the CPU regardless, since
        // how brightly it is BURNING is a different question from what light is
        // falling on it — see `emits` and _hourGlass.

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
          groundCap(R, built.rx * PROP_SHADOW.x, built.rz * PROP_SHADOW.z,
            FLOOR_LIFT + SHADOW_LIFT),
          new THREE.MeshBasicMaterial({
            map: shadowTex, transparent: true, depthWrite: false, opacity: 0.42,
          }),
        );
        if (shadow) {
          shadow.material.polygonOffset = true;
          shadow.material.polygonOffsetFactor = -4;
          shadow.material.polygonOffsetUnits = -8;
          // The shadow of a LEANING piece is the pool at its foot, not the
          // outline of it lying down. Two corrections, both undone by place()
          // the moment the piece leaves home and lies flat again somewhere
          // else. Dropped by the piece's own `lift`: the cap rides the anchor,
          // and a leaning piece's anchor is lifted to plant its butt — with
          // nothing underneath, the flat pose's oval would hang in the air at
          // lift height. And shortened along the shaft by cos(lean), which is
          // what a leaned-over length projects onto the floor; across the
          // shaft it stays as wide as it ever was, because the fork's spread
          // never left the ground plane.
          if (f.lean) {
            shadow.position.y = -(f.lift || 0);
            shadow.scale.x = Math.cos(f.lean);
          }
          anchor.add(shadow);
          // Wears the room's hour, like the floor it is lying on. It was in no
          // tint list at all before, so at dusk it stayed at its daylight value
          // on boards that had gone warm — the one thing lit by nobody.
          this.interiorTintables.push(shadow.material);
          // ...and fades with the hour as well as colouring with it. See
          // _syncRoomShade, and the ROOM_SHADE note for why a stamp like this
          // has to get lighter as the room gets darker rather than staying put.
          this.interiorShade.push({ mat: shadow.material, alpha: shadow.material.opacity });
        }

        // SOMEBODY ASLEEP IN IT, if this piece is a bed. The card is a child of
        // the same anchor as the bedding, so it is placed in the builder's own
        // frame — which is the whole reason the sandwich holds together: shove
        // the futon across the room or turn it end for end and the sleeper goes
        // with it, still between the same two layers.
        if (f.sleeper) {
          // ...and where somebody has to walk to before they can get into it.
          //
          // BESIDE the bed rather than on it: bedding is furniture and
          // furniture is solid, so a route aimed at the bed's own spot is one
          // the walk refuses and trims short of itself, leaving somebody stood
          // a stride away planning the same walk forever.
          //
          // Where they stand to get into it is settled after the room's
          // furniture is registered — see the sweep below — because it is a
          // question about what else is in the way.
          bedPiece = { f, built };
          this._layInBed(rec, anchor, built, null);
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
          // WHETHER IT STARTS ON, and nothing else. It used to be read twice as
          // two different things — whether the switch begins up, and whether
          // this light is capable of lighting anything at all — and the second
          // reading is what made `lit: false` unusable: the level was baked to
          // zero at build, so a lantern that started off could be switched on
          // for the rest of time and light nothing. A capability decided once
          // cannot be switched; that is the same trap the note below the pool
          // records for the glass, one field along.
          const lit = f.lit !== false;

          // THE POOLS ARE GONE, and with them a whole apparatus.
          //
          // Two additive stamps stood here: a `pool`, a spherical cap laid on
          // the floor, and a `contact`, a flat quad for the case where the lamp
          // had been set down on a table instead. They painted the light on the
          // boards, and everything else in the room got a separate warm term in
          // its own shader that had to be fitted to them by hand — two
          // falloffs, two strengths, kept in agreement by measurement and a
          // comment.
          //
          // The disc does both at once. The floor is an interior surface like
          // any other, so it takes the same restore from the same lamp at the
          // same reach as the wall behind it and the table standing on it — one
          // light, landing on everything, agreeing with itself by construction
          // rather than by tuning. See _installHourTint.
          //
          // What goes with them is worth listing, because it is most of the
          // reason this was worth doing:
          //
          //   ROOM_POOL, a constant whose entire job was halving the stamps so
          //   that two of them overlapping did not sum past white. Coverage
          //   clamps at 1; overlap cannot blow out.
          //
          //   The floor's exemption from the lamp term — it was excluded
          //   precisely BECAUSE the stamp already lit it, and the note there
          //   warned that adding both would fill in the bite the stamp's hole
          //   had taken out.
          //
          //   `contact`, `perched`, and the whole of _syncPerch, which existed
          //   to choose between a curved stamp and a flat one depending on what
          //   the lamp was standing on. A distance in three dimensions does not
          //   care what is under the lamp.
          //
          //   paintItemGlow's `hole`, the bite that kept a lamp from lighting
          //   its own foot from inside. A lamp's foot is a surface at distance
          //   ~0 and is restored like anything else; it is not lit from within,
          //   because nothing is being added.

          // EVERY LIGHT IS COLLECTED, and the gate is gone entirely.
          //
          // It read `if (f.night)` once, and the lantern's glass was instead
          // written a single time, just above, on the reasoning that "nothing
          // turns this on and off yet". Something does: both lights have a
          // switch. Then it read `if (f.night || lit)`, which had the same
          // shape of bug one step further in — a lamp that started OFF got no
          // record, so it was a lamp with a switch that nothing was listening
          // to. Having a glow at all is the whole test: if the builder handed
          // back something that can shine, it belongs on the list, and what
          // separates the two lights is `night` alone.
          {
            // A piece may hand back one halo or a nest of them — the bulb's
            // bloom is three shells, because a sphere has no axis to fade
            // along. Kept with the alpha each was BUILT at, so dimming is a
            // multiply and the nest keeps its shape all the way down.
            const nest = built.glow.haloes
              || (built.glow.halo ? [built.glow.halo] : []);
            this.itemLights.push({
              anchor,
              reach: built.glow.reach,
              haloes: nest.map((m) => ({ mesh: m, alpha: m.material.opacity })),
              glass: built.glow.lit,
              // Which piece this is, and whether its switch is on — see the
              // note beside roomLights.push below. `night` here says the same
              // thing it says there: what the light follows once it is on.
              art: f.art,
              // Where the switch starts, from the table's `lit`. Not `true`
              // flat, which is what had a lantern the config called unlit
              // sitting there with its glass alight and its pool on the floor,
              // and 「けす」 offered for a lamp nobody had lit.
              switchedOn: lit,
              night: !!f.night,
              on: new THREE.Color(built.glow.on || PAL.lampLit),
              off: new THREE.Color(built.glow.off || PAL.lampGlass),
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
            // How far the light gets, which is now the radius of a circle
            // rather than the tail of a curve. It used to be described as "the
            // reach its own pool was cut to" — there is no pool to agree with
            // any more, so this is simply where the disc's rim falls.
            this.lampUniforms.uLampReach.value[slot] = built.glow.reach;
            // WHAT FULL COVERAGE RESTORES TO. Very nearly white — the point of
            // the model is that a lamp gives a surface its own colour back, not
            // that it paints the surface amber — with whatever lean the piece
            // asks for. See `restore` in furniture.js.
            this.lampUniforms.uLampTarget.value[slot]
              .set(built.glow.restore || PAL.lampRestore);
            // Indoors, which is where the config stands it. Not left at that,
            // though — update() asks the light where it actually is on every
            // frame, which is what lets it be picked up and taken outside.
            this.lampUniforms.uLampIn.value[slot] = 1;
            // WHERE THE SWITCH STARTS, and nothing else. A lamp fully on is
            // simply 1: there is no strength to be chosen here, because how
            // much a lit surface changes is decided by the dark it is lifted
            // out of and the target it is lifted to, and both of those are
            // colours somebody picked on purpose. A third number scaling them
            // would only be a way of disagreeing with both.
            //
            // `const level = ROOM_LIT.strength` stood here and was the room's
            // half of the pair of per-surface strengths the model no longer
            // has. How brightly it burns THIS frame is `_burn`, written every
            // frame by _applyLight.
            this.lampUniforms.uLampK.value[slot] = lit ? 1 : 0;
            // `night` is what a light FOLLOWS, and it is the difference between
            // the two lights in this room: the bulb is wired in and the evening
            // brings it up, the lantern is lit because somebody lit it and
            // burns at whatever hour they did. The slot is taken either way —
            // and by a lamp switched off entirely, which simply sits at level
            // 0. The arrays were sized off this same config, so skipping one
            // here would slide every later light a place along and hand the
            // bulb the lantern's reach.
            //
            // `on` is the SWITCH, the one thing here anybody in the world can
            // change, and it starts where the table's `lit` puts it. Both lists
            // carry it and both read it the same way — see _burn.
            //
            // Its share of the room's total light, for working out how much of
            // it escapes to the windows — see _lightState.
            rec.reach += built.glow.reach;
            this.roomLights.push({
              at, slot, night: !!f.night, art: f.art, on: lit,
              reach: built.glow.reach,
              // Which room this one is in. Its share of that room's light is
              // what reaches that room's windows, and only that room's — a
              // lantern burning in the cave has nothing to say about whether
              // Chiikawa's house looks occupied.
              home: rec,
              // What says whether this lamp is in the world at all — see the
              // presence check in _burn.
              anchor,
              // A hung light has no bearing — see `ceiling` in the furniture
              // table — so nothing can stand near it or far from it, and
              // `lightNear` treats being in the room as being under it.
              ceiling: !!f.ceiling,
            });
          }
        }

        // A `f.seat` piece used to register a place to sit here, with the height
        // its builder reported. Nothing was ever flagged in either furniture
        // table, so the list this fed was empty for its whole life — and sitting
        // is in place now, which needs no list at all. See _standThemUp in
        // household.js for the whole of what replaced it.

        // The one piece that is not nailed down. It keeps its own copy of where
        // it is, because `dir` above is shared and a piece that moved would drag
        // that shared position with it.
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
            reach: spec.nudgeReach,
            place: null,
            // What the carrying system needs to know about it — see the
            // uniques wiring in main.js. `art` is its identity in ITEMS,
            // `home` is the spot it was arranged at and returns to, `anchor`
            // is the built group so it can be hidden while carried and
            // raycast to be picked up.
            art: f.art,
            // Explicit when more than one unique wears the same art. Older
            // boolean item entries continue to resolve by art as before.
            item: typeof f.item === 'string' ? f.item : null,
            home: dir.clone(),
            // HOW BIG IT IS ON THE FLOOR, carried on the record because the
            // built group is the only thing that knows and the focus ring is
            // asked for from main.js, a file away. The same two half-extents the
            // ground shadow above is cut from — one footprint, two marks, and
            // no second measurement to keep in step with the first.
            rx: built.rx,
            rz: built.rz,
            // ...AND HOW TALL IT IS, carried for the same reason and read by the
            // same file. The focus asks whether a piece is on screen, and a
            // piece sitting near your feet has its BASE below the frame while
            // its body is plainly in it — the ground a metre away is 70 degrees
            // down and the camera only looks 48. Without a height there is no
            // second point to test, and 「ひろう」 would refuse everything you
            // had just set down at arm's length.
            top: built.top || 0,
            homeLift: f.lift || 0,
            // The STANCE — the sasumata lean. It began as a home-only pose,
            // the way homeLift is a home-only height, and it is not one any
            // more: a thing that leans on walls leans on THE wall, not on one
            // authored spot of it. `propAt` below is where it is standing
            // now, and this is only the angle it stands at.
            homeLean: f.lean || 0,
            // WHERE IT IS LEANING, as a bearing and the room that bearing
            // belongs to — or null and null for lying flat. A bearing means
            // nothing without the room it is measured in, so these two travel
            // together and are written together, and that pair is what lets a
            // fork stand against a wall that is not its own.
            //
            // It starts propped at the authored spot in the room it was built
            // in, because the arrangement is a prop.
            propAt: f.lean ? f.at : null,
            propHome: f.lean ? rec : null,
            // Its own spot, for going home to. `homeBearing` rather than
            // `homeAt` so it cannot be misread as the globe's homeAt(dir),
            // which answers a different question about a different thing.
            homeBearing: f.at,
            bornHome: rec,
            // WHICH WAY IT WAS SET DOWN — a world tangent toward whoever put
            // it there, or null for the authored facing. Written by
            // placeLoose at a real set-down and cleared by going home,
            // because a placement has a placer and an arrangement does not.
            // This is what stops every placed teapot pointing its spout at
            // the same compass mark: the piece faces YOU, from wherever you
            // happened to stand, which is both the convention and what a
            // hand setting a thing down actually does.
            faceDir: null,
            // ...and the ground shadow, which place() has to re-shape when the
            // stance changes — see the lean note where it was built.
            shadow,
            atHome: true,
            anchor,
            // The piece's own BODY, kept apart from the anchor it hangs on —
            // and the difference is the whole of a bug. Carrying a piece used
            // to hide the anchor, which hides everything under it including
            // the pool of light a lamp lays on the ground; and stowing one did
            // the same thing, which hid the lamp and left its light burning at
            // the spot it was last stood. One flag was being asked to mean two
            // things. This is the one that means "you can see it".
            body: built.group,
            // ...and this is the one that means "it is here at all". See
            // placeLoose, carryLoose and stowLoose, which are the only three
            // things that can happen to a loose piece.
            state: 'world',
          };
          const facing = f.spin !== undefined ? f.spin : f.at + Math.PI;
          loose.place = () => {
            // PROPPED or lying down, and that is the whole of the branch.
            // The stance used to be a question about being at home; it is a
            // question about whether it is leaning on something, which home
            // is only the first answer to. See propFor above and placeLoose,
            // which is the one thing that decides it.
            //
            // The facing follows the bearing rather than the authored spin,
            // and it has to: `spin` is at + π/2 in every entry that leans —
            // the rule that turns the shaft into the room's radial plane so
            // the head tips onto the masonry — so a piece propped at a NEW
            // bearing needs that same right angle taken from the new one.
            // At home the two agree by construction, which is what lets this
            // one line serve both.
            //
            // ...and it is taken in the frame of WHATEVER ROOM it is leaning
            // in, which need not be this one. `standAt` here is the closure
            // built for the room this piece was authored in, and a bearing
            // handed to the wrong room's frame is a piece facing a direction
            // nobody chose — the same trap the lantern's own note in config
            // records. So a propped piece is stood by its host's standAt and
            // only a flat one falls back to its birthplace's.
            const propped = loose.homeLean && loose.propAt !== null;
            const host = propped && loose.propHome && loose.propHome.lean
              ? loose.propHome.lean : null;
            // Three facings, in the order of who has the strongest claim:
            // a wall it is leaning on dictates outright; then the direction
            // it was set down in, facing its placer; then the authored spin,
            // which is all a piece at home or fresh from the build has.
            if (host) host.standAt(anchor, loose.dir, loose.propAt + Math.PI / 2);
            else if (loose.faceDir) standToward(anchor, loose.dir, loose.faceDir);
            else standAt(anchor, loose.dir, facing);
            if (propped) {
              // Its butt is under the floor until the lift plants it — see
              // the `lean` note where this was built.
              anchor.position.addScaledVector(loose.dir, loose.homeLift);
              loose.body.rotation.z = -loose.homeLean;
              if (loose.shadow) {
                loose.shadow.position.y = -loose.homeLift;
                loose.shadow.scale.x = Math.cos(loose.homeLean);
              }
            } else {
              // A perched item's authored home lift still belongs only to
              // its home spot — that is a different field doing a different
              // job, and the piece it was written for does not lean.
              if (loose.atHome && loose.homeLift) {
                anchor.position.addScaledVector(loose.dir, loose.homeLift);
              }
              // Flat, and the shadow is its whole outline again. Written
              // unconditionally so standing up does not have to remember
              // what lying down changed.
              if (loose.homeLean) {
                loose.body.rotation.z = 0;
                if (loose.shadow) {
                  loose.shadow.position.y = 0;
                  loose.shadow.scale.x = 1;
                }
              }
            }
          };
          this.loose.push(loose);

          // What it wears and what it can see, both of which have to follow it
          // through the door — see _syncLoose. ONE `side` and ONE `dark` for
          // the whole piece, so a bear cannot be half in the room, and its
          // brass cannot be wearing a different hour from its glass.
          //
          // `dark` is a uniform of its own rather than one of the two shared
          // ones, and that is the whole of what a carried thing needs: it is
          // somewhere BETWEEN the sky and the room for as long as it is in the
          // doorway, and _syncLoose writes that blend every frame.
          //
          // A piece that IS a light is patched like anything else now. It used
          // to be skipped — the lantern is not lit by the lantern — which was
          // an additive rule; a restore can only return its brass to the colour
          // brass is, which is what a lit lamp's brass looks like.
          //
          // Its GLASS is the exception, and the same one the room makes: what
          // that material wears is the dark lerped toward white by how brightly
          // the lamp is burning, which is not the hour and cannot come from a
          // uniform the whole piece shares. Left off the patcher and written by
          // _syncLoose, exactly as the bulb's is by _syncInterior.
          const side = { value: 1 };
          const dark = { value: new THREE.Color(0xffffff) };
          const lens = built.glow ? built.glow.lit : null;
          for (const m of built.fills) {
            if (m === lens) continue;
            this._wearHour(m, { dark, mask: 'side', side, tag: 'loose' });
          }
          this.looseLit.push({
            loose, mats: built.fills, glass: lens, side, dark, was: null,
          });
        }
      }

      // Registered only now, because none of it existed when the props on the
      // grass were. Appended rather than set, so the trees keep their entries.
      addSolids(furnitureSolids);

      // ...AND ONLY NOW CAN THE BEDSIDE SPOT BE FOUND, which is why it waited.
      if (bedPiece) {
        const sl = this.sleepers.get(rec.owner);
        if (sl) sl.walkTo = this._bedsideSpot(bedPiece, rec, spotDir, N);
      }

      // The one gap in the wall, registered beside the wall itself. The same
      // footprint object the ground cover and the lamplight already read is
      // given the door: mutated in place, so every reader — the walk, the
      // taps, the characters' own path checks — sees the opening at once.
      // See sphere.js for what these three fields mean.
      const wallB = footprints.find((f) => f.solid && f.dir.dot(N) > 0.9999);
      if (wallB) {
        wallB.inner = spec.walk / R;
        wallB.gapDir = tangentAt(0);
        wallB.gapCos = Math.cos((doorW / 2 - spec.gapInset) / dRing);
        // How high the building stands, for anything that has to get over it —
        // the camera taking off indoors is the one that does. Written down
        // rather than left as the identity `roof === r * R`, which is only
        // true while the house is half a circle.
        wallB.roof = rad;
        // ...and the same arc for isInside, which is the tinting's and the
        // controls' idea of "under the roof".
        //
        // ON THE HOME RECORD, not on the Globe. These two used to be `this.`
        // fields and with one building that was honest; with two, a shared pair
        // would have the cave's wall arc overwrite the house's and every
        // question about being indoors would be answered about whichever
        // building was built last. See isInside and insideAmount, which now ask
        // each home in turn.
        rec.wallCos = Math.cos(wallB.r);
        // ...and the INNER face of the same wall, which is where the lighting's
        // idea of it begins. Between the two is the masonry's own thickness —
        // just under a unit of it — and that band is the doorway you walk
        // through. See insideAmount, which fades across it.
        //
        // No separate test for "am I at the door" is needed, and that is worth
        // saying because the obvious worry is a body pressed against the far
        // wall INSIDE reading as half outdoors. It cannot: the band is solid
        // everywhere but the gap, so the only place anybody or anything can be
        // standing in it is the one hole in it. The wall does the gating by
        // being a wall.
        rec.wallInnerCos = Math.cos(wallB.inner);
        rec.building = wallB;
      }

      // The card, and its lit twin, stop being drawn. Left in the scene so
      // everything that walks `sprites` and `litProps` still finds what it
      // expects to find.
      sprite.mesh.visible = false;
      sprite.retired = true;
      sprite.shell = shell;
      // Which home this sprite belongs to, so the per-frame lamp sync can get
      // from a lit prop back to the room whose lights it is advertising without
      // searching a list.
      sprite.home = rec;

      // ...and its cull allowance, which the prop loop had to take off the CARD
      // because the building did not exist yet when that loop ran. Same idea as
      // `reach` there, and the house needed it most of anything on the planet:
      // it is 3.2 out from its own middle on a globe of 8, so its near wall
      // crests the limb a good twenty degrees before its centre. On the card's
      // allowance it was switched off at 84 degrees of arc while it went on
      // being visible to 99 — which is the whole of "the house suddenly
      // appears".
      //
      // Off the world box rather than a local one, because this shell is
      // assembled in place rather than built at the origin and stood up. Eight
      // corners, and the furthest-reaching of them wins: a corner `L` from the
      // planet's middle and `a` off the house's own normal stays in sight until
      // `a + acos(R/L)` past the limb. `rad` alone would not do it — the ink
      // hull and the roof stand 3.74 clear of a 3.2 dome.
      //
      // A world-axis box round a building at an arbitrary lat/lon is a loose
      // fit, and that is fine: too generous costs a draw call on something the
      // depth buffer is already hiding, too tight is the pop.
      // Forced up the chain and back down before measuring. Nothing has
      // rendered at this point, so the anchor that carries this shell out to
      // the surface still has an identity `matrixWorld`, and `setFromObject`
      // only refreshes the object it is handed and its descendants — never its
      // parents. Measured without this, every corner came back inside the
      // planet, the loop below skipped all eight on `L < R`, and the allowance
      // silently stayed at the card's. Silently is the word: a wrong answer
      // here looks exactly like no answer.
      shell.updateWorldMatrix(true, true);
      const hbb = new THREE.Box3().setFromObject(shell);
      const corner = new THREE.Vector3();
      let far = 0;
      for (let i = 0; i < 8; i++) {
        corner.set(
          (i & 1) ? hbb.max.x : hbb.min.x,
          (i & 2) ? hbb.max.y : hbb.min.y,
          (i & 4) ? hbb.max.z : hbb.min.z,
        );
        const L = corner.length();
        if (L < R) continue;
        const a = Math.acos(clampUnit(corner.dot(sprite.normal) / L));
        far = Math.max(far, a + Math.acos(clampUnit(R / L)));
      }
      if (far > sprite.horizon) sprite.horizon = far;
      if (sprite.lit) {
        sprite.lit.night.visible = false;
        // The light in the air, moved onto the doorway it is supposed to be
        // coming out of. It was placed by litSpot, which finds the bright warm
        // pixels in the night DRAWING — a drawing that is no longer shown, so
        // the glow was hanging wherever those pixels used to be. Hung off the
        // door now, so it follows the door if the door ever moves.
        const bloom = sprite.lit.bloom;
        bloom.position.set(0, 0, 0.06);
        bloom.scale.setScalar((rad * 1.5) / (bloom.geometry.parameters.width || 1));
        // AND IT IS NOT A THING A RAY CAN HIT. A raycast reads geometry, never
        // alpha, so this quad — 1.5 shell radii across, which is 4.8 at the
        // house and 6.0 at the cave — answers for its whole rectangle including
        // the air out to either side of the doorway where its own soft edges
        // have faded to nothing.
        //
        // Nothing rays a building any more, so this stops nothing today; it is
        // here because a glow is not a surface and should never be picked as
        // one, and the day something does reach for the shell it will be right
        // by default rather than wrong until somebody notices.
        bloom.raycast = () => {};
        houseDoor.add(bloom);
      }
    }
    // The first home is the one you arrive at, and the one field outside this
    // file still asks for by name.
    this.house = this.homes.length ? this.homes[0].sprite : null;

    // The plateau stood here — a cone frustum for the cliff face and a spherical
    // cap of grass on top, with Hachiware's cave cut into its rim. It is gone,
    // and the reason is worth keeping because it is a fact about this planet
    // rather than about that code: a hill that a cave is cut into must stand
    // BEHIND the cave, far enough back that its solid ground clears the room,
    // and on a globe of radius 8 that is already over the horizon. Measured
    // from the cave's own doorstep, the cliff top sat 21 degrees below eye
    // level — lower on screen than the cave in front of it, and completely
    // hidden by it. The mound is the cave's own shell now; see CONFIG.cave.

    // `smallProps` stood here — every bush and stump anchor, gathered so the
    // altitude cull in update() could hide the lot in one pass. There is no such
    // cull any more; see the note where it ran.
    this.litProps = this.sprites.filter((s) => s.lit);

    // Seed the lamp positions before anything can read them. update() refreshes
    // these every frame, but setDaylight runs before the first frame does, and
    // a lamp still sat at the origin is one shining out of the planet's core.
    this.world.updateMatrixWorld(true);
    for (const s of this.litProps) {
      s.anchor.getWorldPosition(this.lampUniforms.uLampAt.value[s.lit.slot]);
    }
    for (const L of this.roomLights) {
      const at = this.lampUniforms.uLampAt.value[L.slot];
      L.at.getWorldPosition(at);
      _lightDir.copy(at).sub(this.world.position).normalize();
      this.lampUniforms.uLampIn.value[L.slot] = this.insideAmount(_lightDir);
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

    // ...and whoever has nowhere to sleep. After the buildings because a
    // sleeper with a bed was made with the bed; before the hour, because these
    // are two more surfaces that wear it.
    this._layOnGround();

    // The hour, moved off the CPU and into the materials that can take it.
    // LAST, because it walks the two tint lists and every one of them has to
    // have been filled — and because it reads `itemLights`, which the interior
    // loop above is what builds.
    // THE RAIN, built last of the things that stand on the planet and before
    // the hour is installed over them, which is the whole reason it is here
    // rather than anywhere more convenient.
    //
    // Two orderings have to hold at once. The puddles are scattered by
    // rejection against the lakes, the buildings and the solids, so every one
    // of those registries has to be full before this runs — a puddle dealt
    // before the props were placed would be a pool of water under a stump. And
    // its materials join `tintables`, so it has to be built BEFORE the sweep
    // below, which is the one pass that patches the hour into a shader. A
    // material that misses that sweep is not slightly wrong at night; it is
    // full daylight brightness at midnight, and standing water is exactly the
    // sort of pale flat thing that shows it worst.
    this.rain = new Weatherfall(CONFIG.globe.radius, this.tintables);
    for (const o of this.rain.objects) this.world.add(o);

    // ...AND THE DEPTH IT LIES AT, built here because it needs both of the
    // things immediately above it: the map it is displaced by, and the lakes
    // and buildings whose faces it has to be missing. See snowShellGeo.
    //
    // NOT in `tintables`. It is a genuinely lit Lambert surface like the ground
    // rather than flat art wearing a multiply, so it takes the same treatment
    // the ground takes and for the same reason — see _litGround, whose second
    // argument exists for this one caller.
    const shellW = CONFIG.weather;
    this.shell = new THREE.Mesh(
      snowShellGeo(CONFIG.globe.radius, shellW.shellSegs),
      new THREE.MeshLambertMaterial({
        color: PAL.snowGround,
        // three's own vertex displacement. A sphere's normals are radial, so
        // "along the normal" is "outward", and how deep the snow is HERE is the
        // same map the ground is tinted by — one field, two readers, and no way
        // for the white and the deep to disagree about where a drift is.
        displacementMap: this.field.texture,
        // Written per frame from the cover — see updateRain. Zero in summer,
        // which parks the whole shell under the turf.
        displacementScale: 0,
        displacementBias: -shellW.shellTuck,
      }),
    );
    // Under the turf until there is snow to lift it out, so a summer planet
    // never sees it. `visible` is switched from the same place the scale is.
    this.shell.visible = false;
    this.shell.renderOrder = 0;
    this.world.add(this.shell);
    this._litGround(this.shell.material, false);

    this._installHourTint();
    // ...and the ground, for the same reason: the lamp arrays are sized off a
    // scattered world. See the note where it is built.
    this._litGround(this.ground.material);

    this._camDir = new THREE.Vector3();
    this.resize();
  }

  // ------------------------------------------------------------- the sleepers
  //
  // Three drawings, laid flat, shown for the four hours nobody is awake. See
  // MIDNIGHT_SLEEP.md.
  //
  // FLAT AND STATIONARY, which is the whole design and not a shortcut. Every
  // other body in this world is a card that turns to face you; these do not
  // turn, do not breathe and do not bob, because what they are drawn as is a
  // view from ABOVE — somebody seen from where you are stood, looking down at
  // them in their bedding. A billboard of that drawing would be a sleeping
  // creature standing upright.
  //
  // They are lit as FURNITURE and take no character lift. A sleeper is a thing
  // in a room at the hour that room is darkest, and the two indoor ones are in
  // rooms whose lamps their owners have just switched off — so most nights you
  // will barely see them, which is right. It is fine to sleep in the dark.

  // WHERE SOMEBODY STANDS TO GET INTO A BED.
  //
  // Beside it, never on it: bedding is furniture and furniture is solid, so a
  // walk aimed at the bed's own spot is one the path check refuses outright.
  // What they do on arrival is lie down, and the drawing of them lying down is
  // already in the bed, so the last step is one nobody has to take.
  //
  // THE DISTANCE IS DERIVED AND THE BEARING IS SEARCHED, and it took three goes
  // to arrive at that. Both halves were hand-picked first and both were wrong:
  //
  //   The distance was 0.9 from the bed's middle, then the footprint plus 0.5.
  //   A walking body keeps `wallKeep` clear of every solid, so a spot merely
  //   outside a bed is not somewhere anybody may stand — it has to clear the
  //   footprint AND that fence. Both versions left the target inside it and the
  //   last leg of the walk permanently refused; the second measured as a block
  //   of radius 0.81 sitting on the target itself. It is now the sum of the two
  //   things that actually decide it, so it cannot go stale if a bed is resized.
  //
  //   The bearing was "toward the doorway", full stop. Right in spirit — you
  //   arrive from the door, so the far side of the bed is the wrong side to aim
  //   at — and not enough on its own, because the door's side of a bed may have
  //   something else standing in it. `keepOffSolids` was tried here and is the
  //   wrong tool: it ejects in ONE pass, which its own note in sphere.js warns
  //   about, and in the cave it pushed the spot off the bedding straight into
  //   another prop. So the door's bearing is where the search STARTS, and it
  //   sweeps outward both ways until it finds floor.
  //
  // Fifteen degrees a step over a full turn, which at these radii is a stride
  // between candidates — fine enough not to step over a gap, coarse enough that
  // the whole sweep is two dozen point tests done once at build.
  _bedsideSpot(piece, rec, spotDir, N) {
    const R = CONFIG.globe.radius;
    const { f, built } = piece;
    const keep = CONFIG.wander.wallKeep;
    const bedDir = spotDir(f.at, f.out);
    // The bed's own registered footprint (the area-equivalent circle — see
    // furnitureSolids) plus the walker's fence plus a little room to stand in.
    const off = Math.sqrt(built.rx * built.rz) / R + keep + CONFIG.sleep.beside / R;
    // The door's side of the bed, as a tangent there.
    const doorIn = spotDir(0, rec.spec.walk * 0.7);
    const t0 = doorIn.clone().addScaledVector(bedDir, -doorIn.dot(bedDir));
    if (t0.lengthSq() < 1e-9) t0.copy(_bedTan.set(0, 1, 0).cross(bedDir));
    t0.normalize();

    let fallback = null;
    for (let i = 0; i < 24; i++) {
      // 0, +15, -15, +30, -30 ... so the first clear bearing found is also the
      // nearest one to the door.
      const turn = Math.ceil(i / 2) * (Math.PI / 12) * (i % 2 ? 1 : -1);
      _bedTan.copy(t0).applyAxisAngle(bedDir, turn);
      const p = bedDir.clone().multiplyScalar(Math.cos(off))
        .addScaledVector(_bedTan, Math.sin(off)).normalize();
      // Inside the room's own walkable ring, with a margin: a spot in the wall
      // band is one only the doorway could be, and this is not the doorway.
      if (Math.acos(clampUnit(p.dot(N))) * R > rec.spec.walk - 0.2) continue;
      if (!fallback) fallback = p;
      if (inSolid(p, keep)) continue;
      return p;
    }
    // A room furnished so tightly that nothing round the bed is standable. Give
    // back the door's side anyway: the walk will trim short of it and they will
    // sleep late rather than never, which is the better of two bad nights.
    return fallback || bedDir.clone().multiplyScalar(Math.cos(off))
      .addScaledVector(t0, Math.sin(off)).normalize();
  }

  // The card itself: the drawing, sized against something, lying in the XZ
  // plane of whatever frame the caller is placing it in.
  //
  // The two rotations are the whole of the orientation and are worth stating in
  // words, because they are easy to get a quarter turn wrong and hard to read
  // back off the numbers. `rotateX` lays the plane down — the drawing's own up
  // ends up pointing along -Z. `rotateY` then swings that round to +X. So the
  // head end of the drawing points along the frame's +X, which for a bed is
  // along its length toward the pillow, and the drawing's width lies across Z.
  _sleepCard(img, wide) {
    const canvas = paintSheet(img);
    const long = wide * (canvas.height / canvas.width);
    const geo = new THREE.PlaneGeometry(wide, long);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, sceneryMaterial(texFrom(canvas)));
    mesh.visible = false;
    // Biased toward the eye for the same reason every other decal in this app
    // is: it lies a hair above a surface it must never tear into, and here that
    // surface is soft, bulging and directly underneath.
    mesh.material.polygonOffset = true;
    mesh.material.polygonOffsetFactor = -4;
    mesh.material.polygonOffsetUnits = -8;
    return { mesh, long };
  }

  // The Zzz, hung over whoever the card belongs to.
  //
  // A CHILD OF THE CARD, which settles four things at once and is the reason it
  // is built here rather than out in the world with the other floating marks.
  // It appears and disappears with the sleeper for free, because a hidden parent
  // hides its children. It is culled with the room, because the card is. It
  // needs no position of its own in the world, because the card already has
  // one. And — the useful part — every sleeper card's local +Y is the surface
  // up at that spot, whichever way the drawing itself was turned, so "above
  // them" is +Y here and nothing has to work out which way up is.
  //
  // It BILLBOARDS, unlike the sleeper it floats over. That is not an
  // inconsistency: the card is a drawing of somebody seen from above and lies
  // flat because that is what it is a picture of, while this is a MARK — the app
  // saying something about them — and marks in this world stand up and face you,
  // the way the focus arrow and the speech bubbles do. Lying flat it would
  // foreshorten to a smear at the eye height this room is usually seen from.
  //
  // Turned about the surface up ONLY, which is all a billboard on a planet needs
  // and is one angle rather than a quaternion: the mark stays upright and swings
  // to face you. See _syncZzz.
  _sleepMark(card, fit) {
    const wide = fit.zzzWide ?? 0.34;
    const canvas = cachedZzz();
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wide, wide * (canvas.height / canvas.width)),
      sceneryMaterial(texFrom(canvas)),
    );
    // Where it hangs, in the card's own frame: `x` and `z` slide it over the
    // sleeper — toward the head, which is what a Zzz rises from — and `up`
    // lifts it clear of whatever is heaped on top of them.
    mesh.position.set(fit.zzzAt?.x ?? 0, fit.zzzAt?.up ?? 0.5, fit.zzzAt?.z ?? 0);
    // Where the drift starts from, kept because the drift overwrites `y` every
    // frame and would otherwise have nothing to measure from.
    mesh.userData.baseY = mesh.position.y;
    // STARTS INVISIBLE, because _syncZzz only writes an opacity for a sleeper
    // who is already lying down. Left at the material default of 1 the mark
    // would be drawn at full strength for the single frame between somebody
    // lying down and the next sync — a flash on the one thing here whose whole
    // job is to be quiet about it.
    mesh.material.opacity = 0;
    // Over the card and over the bedding, both of which are transparent and
    // write no depth, so a painter's order is the only thing that can say which
    // is in front. Solid geometry still occludes it by the depth test, which is
    // what keeps a Zzz behind the comforter when you crouch to look along it.
    mesh.renderOrder = 4;
    card.add(mesh);
    return mesh;
  }

  // Somebody in their own bedding, sandwiched.
  //
  // The card lies just above the base and runs from the head end back under the
  // cover, and it is the COVER that does the work: it stands well above the
  // card from every angle a body can be stood at, so the lower part of the
  // drawing — which is where these two are deliberately unfinished — is behind
  // real geometry and cannot be seen. Nothing is masked, clipped or sorted by
  // hand; it is an object under a quilt, and the depth buffer knows what to do
  // with one of those.
  _layInBed(rec, anchor, built, beside) {
    const key = rec.owner;
    const sheets = key ? IMG.sheets[key] : null;
    // A bed in a home whose owner has no sleeping drawing is simply a bed. The
    // same tolerance the blink sheet gets: draw the picture and it starts being
    // used, and until then nothing anywhere has to be guarded.
    if (!sheets || !sheets.sleep || !built.bed) return;

    const bed = built.bed;
    const fit = CONFIG.sleep[key] || {};
    const { mesh, long } = this._sleepCard(sheets.sleep, bed.across * (fit.wide ?? 1));

    // FLAT, at the bedding's own lying height. There is no tilt and no lift in
    // the usual case, and that is the point of `displaces` doing the work
    // instead: a card laid on the mattress is hidden by the cover exactly where
    // the cover is, which is what makes the sandwich a fact about the geometry
    // rather than a height somebody tuned.
    //
    // Measured from the HEAD end, which is the end that has to land somewhere
    // exact — a head in the wrong place is the one error in this arrangement
    // that reads as a mistake rather than as bedding. The foot lands wherever
    // the drawing's own proportions put it, deep under the cover, where a few
    // centimetres either way cannot be seen by anybody.
    mesh.position.set(
      bed.head + (fit.along ?? 0) - long / 2,
      bed.lay + (fit.lift ?? 0),
      0,
    );
    anchor.add(mesh);
    const zzz = this._sleepMark(mesh, fit);
    // On the room's list, so _installHourTint patches it with everything else
    // under this roof and it takes the same dark and the same lamp discs as the
    // bedding it is lying in. That is the entire lighting of this feature.
    this.interiorTintables.push(mesh.material);
    this.interiorTintables.push(zzz.material);
    this.sleepers.set(key, {
      mesh, zzz, phase: zzzPhase(key), home: rec, outdoors: false,
      displaces: bed.displaces, walkTo: beside,
    });
  }

  // ...and whoever has no bedding to be sandwiched into.
  //
  // Usagi has no home — see CONFIG.homes, which has two entries and three
  // characters — so he sleeps on the grass, which is both the honest reading of
  // that fact and the funnier one. His drawing is the only one of the three
  // drawn complete, because there is nothing over him to hide an edge under.
  //
  // A ground CAP rather than a flat quad, like every other decal on this
  // planet: a straight card 1.3 across on a world of radius 8 stands its
  // corners clear of the grass, and a sleeper hovering at the ears is worse
  // than most of the things that lift catches.
  //
  // WHERE it goes is not decided here. He walks somewhere and lies down there,
  // so the spot arrives at `layDown` time from whoever is doing the walking.
  _layOnGround() {
    const R = CONFIG.globe.radius;
    for (const spec of CAST) {
      // Anybody with a bed was given one above; this is the remainder.
      if (this.sleepers.has(spec.key)) continue;
      const sheets = IMG.sheets[spec.key];
      if (!sheets || !sheets.sleep) continue;

      const fit = CONFIG.sleep[spec.key] || {};
      const wide = fit.wide ?? 1.2;
      const canvas = paintSheet(sheets.sleep);
      const long = wide * (canvas.height / canvas.width);
      const mesh = new THREE.Mesh(
        groundCap(R, wide, long, SHADOW_LIFT),
        shadowMaterial(texFrom(canvas)),
      );
      mesh.visible = false;
      // Over the ground and the walk mark, under everything that stands on it.
      mesh.renderOrder = 1;
      this.world.add(mesh);
      const zzz = this._sleepMark(mesh, fit);
      this.tintables.push(mesh.material);
      this.tintables.push(zzz.material);
      // Where he walks to is his own meadow, worked out on demand rather than
      // stored: unlike a bed it is not a thing that was built, and the spot he
      // actually lies down at is wherever he got to. See sleepSpotFor.
      this.sleepers.set(spec.key, {
        mesh, zzz, phase: zzzPhase(spec.key), home: null, outdoors: true,
        displaces: null, walkTo: null,
      });
    }
  }

  // Where somebody with no bed should walk to before lying down: a spot near
  // their own wander anchor, so they sleep in the meadow they live in.
  //
  // Asked of the scene rather than worked out by the caller because this is the
  // same arithmetic every interior places its furniture with — a bearing round
  // a point and a distance out along the surface — and there is no reason for
  // household.js to grow a second copy of it.
  sleepSpotFor(key, out = new THREE.Vector3()) {
    const rec = this.sleepers.get(key);
    if (!rec || !rec.outdoors) return null;
    const spec = CAST.find((c) => c.key === key);
    if (!spec) return null;
    const R = CONFIG.globe.radius;
    const m = CONFIG.sleep.meadow;
    dirFromLatLon(spec.home.lat, spec.home.lon, _sleepAt);
    // A tangent at the anchor, turned to the given bearing. North-ish first,
    // then rotated — the same two moves _onRing makes round a house, and for
    // the same reason: a bearing is only a bearing once something has said what
    // it is measured from.
    _sleepTan.set(0, 1, 0).addScaledVector(_sleepAt, -_sleepAt.y);
    if (_sleepTan.lengthSq() < 1e-9) _sleepTan.set(1, 0, 0);
    _sleepTan.normalize().applyAxisAngle(_sleepAt, m.at);
    const arc = m.out / R;
    out.copy(_sleepAt).multiplyScalar(Math.cos(arc))
      .addScaledVector(_sleepTan, Math.sin(arc)).normalize();

    // ...AND OUT OF ANYWHERE A WALKER REFUSES TO GO, which is a wider circle
    // than the wall and is the whole of why this correction exists.
    //
    // Measured, and it is the narrowest miss in the project: Usagi's meadow
    // landed 3.89 units from the middle of Chiikawa's house, against a wander
    // berth of 3.92. Three hundredths inside the fence, and the consequence is
    // total — a walk is planned by stepping toward the target and stopping at
    // the first sample the walker may not stand in, so a bed inside the berth
    // gets every plan trimmed short of itself. He never lay down at all. He
    // spent the whole of every night circling the outside of somebody else's
    // house, re-planning on the retry clock, and the only thing on screen to
    // show for it was Usagi loitering by Chiikawa's front door until dawn.
    //
    // The file's own opening note warned about exactly this for the doorstep —
    // "four hundredths inside the fence is enough to hang the whole errand" —
    // and the meadow was placed by hand from a lat and lon without anybody
    // checking it against a berth that is worked out somewhere else entirely.
    //
    // CORRECTED HERE RATHER THAN IN THE ROUTE, because two things read this and
    // they must not disagree: the walk that takes him there, and the drawing
    // that is laid down where he stops. Fix it in the router alone and he walks
    // to one spot and the picture of him asleep appears at another.
    for (const home of this.homes) {
      if (!home.building) continue;
      const keep = home.building.r + CONFIG.wander.wallKeep + BED_CLEAR / R;
      const along = out.dot(home.sprite.normal);
      if (along <= Math.cos(keep)) continue;
      _sleepTan.copy(out).addScaledVector(home.sprite.normal, -along);
      // Dead centre, so no bearing of its own to keep; the door's own line is
      // the one with any meaning, and it puts him out the front.
      if (_sleepTan.lengthSq() < 1e-9) _sleepTan.copy(home.building.gapDir);
      if (_sleepTan.lengthSq() < 1e-9) continue;
      _sleepTan.normalize();
      out.copy(home.sprite.normal).multiplyScalar(Math.cos(keep))
        .addScaledVector(_sleepTan, Math.sin(keep)).normalize();
    }
    return out;
  }

  // Lie somebody down, or stand them back up.
  //
  // `where` is only read by a sleeper with no bed, and only when they are lying
  // down: one who has a bed is already in it, and where that bed is was settled
  // when the room was built.
  layDown(key, on, where = null, spin = 0) {
    const rec = this.sleepers.get(key);
    if (!rec) return false;
    if (on && rec.outdoors && where) {
      const R = CONFIG.globe.radius;
      rec.mesh.position.copy(where).multiplyScalar(R);
      // Its own up is the surface under it; which way it is turned is flavour,
      // and the only thing that matters is that it is not the same every night.
      _sleepTan.set(0, 1, 0).addScaledVector(where, -where.y);
      if (_sleepTan.lengthSq() < 1e-9) _sleepTan.set(1, 0, 0);
      _sleepTan.normalize().applyAxisAngle(where, spin);
      const right = _sleepRight.crossVectors(where, _sleepTan);
      rec.mesh.quaternion.setFromRotationMatrix(
        _sleepBasis.makeBasis(right, where.clone(), _sleepTan),
      );
    }
    rec.mesh.visible = on;
    // ...and whatever they are lying on top of steps out of the way. The futon's
    // pillow is the only one — see `bedOf` for why a head and a pillow cannot
    // both be in a bed this size, and why the head wins.
    if (rec.displaces) rec.displaces.visible = !on;
    return true;
  }

  isLyingDown(key) {
    const rec = this.sleepers.get(key);
    return !!rec && rec.mesh.visible;
  }

  // The Zzz over everybody asleep: turned to face you, and drifting.
  //
  // Skipped entirely when nobody is down, which is three quarters of the day —
  // the loop costs nothing at noon because `mesh.visible` is false and there is
  // nothing to ask.
  //
  // ONE ANGLE, not a quaternion. A billboard on a planet only has to spin about
  // the surface up: the mark stays upright and swings toward the eye. The card's
  // own frame already has up on +Y (see _sleepMark), so the camera's position
  // read in that frame gives the angle directly, and `worldToLocal` does the
  // whole change of basis including the planet's bob and whatever way the
  // bedding was turned.
  //
  // THE DRIFT IS THE ONE TRANSFORM IN THIS FEATURE, and it is deliberate against
  // the rule that says animate by boiling rather than by moving things. That
  // rule is about DRAWINGS of characters — a body that scales or slides reads as
  // a sticker being dragged — and this is not a body, it is a mark whose whole
  // meaning is that it rises. There is no drawing of a Zzz that says "floating
  // upward" while sitting still. It is kept slow and short: a third of a unit
  // over three seconds, fading out over the top half of it, so what you notice
  // is that something is happening rather than the thing itself.
  //
  // Each sleeper runs on its own offset, so three of them in view do not pulse
  // as one. Taken from the character's own key rather than a counter, so it is
  // the same every visit and the same after a reload.
  _syncZzz(tMs) {
    for (const [key, rec] of this.sleepers) {
      if (!rec.mesh.visible || !rec.zzz) continue;
      const z = rec.zzz;
      rec.mesh.worldToLocal(_zzzEye.copy(this.camera.position));
      z.rotation.y = Math.atan2(_zzzEye.x, _zzzEye.z);
      const at = ZZZ_RISE;
      const p = ((tMs / at.periodMs) + (rec.phase || 0)) % 1;
      z.position.y = z.userData.baseY + p * at.rise;
      // In quickly, out over the top half. Never quite to 1: this is a hint at
      // the edge of a dark room, not a label.
      const fade = p < at.inAt ? p / at.inAt : 1 - ((p - at.inAt) / (1 - at.inAt));
      z.material.opacity = Math.max(0, fade) * at.peak;
    }
  }

  // Where somebody's sleeping drawing is, for a bubble to hang over. Null for
  // anybody on their feet.
  sleepAnchor(key) {
    const rec = this.sleepers.get(key);
    return rec && rec.mesh.visible ? rec.mesh : null;
  }

  // Whoever is asleep under the ray, or null.
  //
  // Its own pick rather than a case inside the character one, because a sleeper
  // is not a character as far as anything on screen is concerned: the body is
  // not drawn, `isVisible` is false for it, and what the finger has actually
  // landed on is a flat drawing lying in the bedding. See pickCharacter in
  // main.js, which asks this only after finding nobody standing up.
  //
  // No alpha test, unlike a body's. A card is small, nearly filled by what is
  // drawn on it, and lying flat — so the corners a test would reject are a few
  // pixels at a glancing angle, and the cost of getting it wrong is one extra
  // sleepy mumble rather than a tap that misses somebody.
  sleeperAt(raycaster) {
    let best = null;
    let bestD = Infinity;
    for (const [key, rec] of this.sleepers) {
      if (!rec.mesh.visible) continue;
      const hits = raycaster.intersectObject(rec.mesh, false);
      if (hits.length && hits[0].distance < bestD) {
        bestD = hits[0].distance;
        best = key;
      }
    }
    return best;
  }

  // ------------------------------------------------- the hour, as a uniform
  //
  // Rewires every surface that wears the hour as a flat multiply so that the
  // multiply happens in its fragment shader against a shared uniform, instead
  // of being written onto `material.color` sixty times a second from a loop
  // over the whole world.
  //
  // NOTHING ABOUT THE PICTURE CHANGES. The arithmetic is the same arithmetic:
  // what was `color = base × dark` on the CPU, sampled flat across the surface,
  // is now `color = base` with `× dark` done per fragment. Identical output,
  // and it is meant to be — this exists to make the NEXT thing possible, which
  // is a lamp restoring part of a surface toward daylight. That cannot be done
  // to a colour that has already been flattened into a uniform multiply before
  // the shader ever sees it.
  //
  // Done here, in one place, rather than at the twenty-odd sites that build
  // these materials. Two reasons, and the second is the important one:
  //
  //   The list is already the truth. Everything that wears the hour is on one
  //   of the two lists by the time this runs, so walking them cannot miss a
  //   material the way twenty edits could.
  //
  //   Only here is it possible to know what a material ALREADY is. Several of
  //   these are patched with the lamp or the sun term, and three.js allows one
  //   `onBeforeCompile` per material — so the hour cannot simply be another
  //   patcher. It has to WRAP whatever is there, and wrapping is only safe once
  //   nothing else is going to be added.
  _installHourTint() {
    // THE EXCEPTIONS, and both are the same exception: a material with a second
    // writer cannot have a shared uniform, because the shared one would be
    // multiplied on top of whatever the other writer just decided.
    //
    // A lamp's own glass is the case. Its colour is not the room's dark at all
    // — it is the dark lerped toward white by how brightly the lamp is burning
    // (see `emits`), which is a per-material answer that changes with a switch.
    // Left on the CPU, exactly as before. There are only ever a handful.
    //
    // The other, the hand, never joins the list in the first place — see the
    // note where it is built.
    const glass = new Set(this.itemLights.map((L) => L.glass));
    this._hourGlass = this.interiorTintables.filter((m) => glass.has(m));

    // THE BUILDINGS FIRST, because they are the one thing out here that has to
    // be told to ignore a light — its own. Everything on a building's outside
    // reads every lamp in the world except the one that is the building. Done
    // ahead of the general sweep and relying on _wearHour being idempotent, so
    // the loop below finds them already dressed and steps over them.
    for (const h of this.homes) {
      const slot = h.sprite && h.sprite.lit ? h.sprite.lit.slot : -1;
      if (slot < 0) continue;
      const own = [h.skin, ...(h.outer || []).map((o) => o.material)];
      for (const m of own) {
        if (!m || !this.tintables.includes(m)) continue;
        this._wearHour(m, {
          dark: this.darkOut, mask: 'out', self: slot, tag: 'skin',
        });
      }
    }

    for (const m of this.tintables) {
      this._wearHour(m, { dark: this.darkOut, mask: 'out', tag: 'out' });
    }
    for (const m of this.interiorTintables) {
      if (glass.has(m)) continue;
      this._wearHour(m, { dark: this.darkIn, mask: 'in', tag: 'in' });
    }
  }

  // THE GROUND, which is the one surface here that is genuinely lit and so the
  // one that cannot take the restore the same way.
  //
  // Everything else in this world is flat art wearing a multiply, so a lamp
  // lifts the multiply and the art comes back. The globe is a Lambert sphere
  // under the hour's own ambient and directional: it has a terminator, it has a
  // dark half, and what a fragment of it is currently wearing is not a value
  // anybody wrote down. There is no `uDark` to lift.
  //
  // So this restores the OUTPUT. `outgoingLight` is what the real lights made
  // of this patch of ground; `diffuseColor.rgb * lampT * uGroundLit` is what
  // the same patch looks like standing in lamplight; and the coverage
  // cross-fades between them, clamped so a lamp can only ever add.
  //
  // WHAT THIS RETIRES is the last painted light in the app. The buildings threw
  // their spill on the grass with an additive decal — a projected cap, a
  // painted gradient, a ring with a hole cut for the building's own footprint,
  // and a `seen` flag to hide it over the horizon. All of that existed because
  // the ground could not be asked. It can now, so the spill is the same disc
  // from the same slot as every other light in the world, and a lantern carried
  // out of a door draws one circle that runs off the boards and onto the grass
  // without meeting a seam.
  // `snowMix` is what separates the two surfaces that come through here. The
  // GROUND is painted grass and is mixed toward the snow colour by the depth
  // map; the SHELL is already snow and has nothing to mix — and, having no
  // `map` of its own, has no `vMapUv` for that line to read either, so asking
  // for it would not merely be redundant, it would fail to compile.
  //
  // Everything else — the whole lamp restore — is shared, and has to be: a
  // lantern set down in deep snow lights the shell you can see, and would light
  // the ground underneath it if the two disagreed about lamplight.
  _litGround(material, snowMix = true) {
    const N = this.lampUniforms ? this.lampUniforms.uLampK.value.length : 0;
    if (!N) return;
    // Outdoors for good — the globe is the outdoors — so the mask is the plain
    // constant one. A lamp taken inside stops lighting the turf on the frame it
    // crosses the threshold, which is what `uLampIn` is for.
    // THE SNOW GOES ON BEFORE THE LIGHT, and that ordering is the whole of why
    // it is one line here rather than a second surface over the planet.
    //
    // `diffuseColor` is the ground's own colour — what the paint says, before
    // the sun and the lamps have had anything to say about it. Lerping THAT
    // toward the snow colour means the white ground is lit by exactly the same
    // light the green ground was: it has the same terminator, it goes the same
    // blue at midnight, and a lantern set down on it makes the same disc.
    //
    // Doing it afterwards, to `outgoingLight`, was the obvious alternative and
    // is wrong in a way that is easy to predict and impossible to unsee: the
    // snow would be one flat value everywhere, so the dark half of the planet
    // would be as bright as the lit half and the whole world would go
    // paper-flat the moment it settled.
    //
    // A shell of white geometry over the sphere was the other alternative, and
    // this note used to say it would need four things for itself that the line
    // above gets free. IT NOW EXISTS AND SO IT DOES — see snowShellGeo. The two
    // are not rivals: this line is what makes the world WHITE and the shell is
    // what makes it DEEP, and each is bad at the other's job. A tint has no
    // silhouette and cannot bury anybody; a shell that had to carry the crisp
    // edge of every footprint would need geometry a phone could not hold.
    //
    // Of the four it was said to need, three are simply shared — it comes
    // through this very function for its lamps, takes the same hour, and reads
    // the same map. The fourth, the hole for the ponds, is cut once at build.
    //
    // The lakes ARE covered by this tint, and that is a known simplification
    // rather than an oversight: what it whitens under a pond is the BED, which
    // the water is drawn over anyway.
    const ADD = `${restoreGLSL(N, '1.0 - uLampIn[ i ]')}
       vec3 lampGround = diffuseColor.rgb * lampT * uGroundLit;
       outgoingLight = max( mix( outgoingLight, lampGround, lampCover ), outgoingLight );
       #include <opaque_fragment>`;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.lampUniforms);
      shader.uniforms.uPlateau = this.plateau;
      shader.uniforms.uGroundLit = this.groundLit;
      shader.uniforms.uSnow = this.snowAt;
      shader.uniforms.uSnowTint = this.snowTint;
      shader.uniforms.uSnowMap = this.snowMap;
      shader.vertexShader = `varying vec3 vLampAt;\n${shader.vertexShader}`
        // AFTER `<displacementmap_vertex>`, which matters for the shell and
        // changes nothing for the ground. `transformed` is where the vertex has
        // actually ended up, and on the shell that is a vertex the snow has
        // pushed outward — so a lamp measures its distance to the top of the
        // drift rather than to the turf underneath it. Hooking the earlier
        // chunk would have lit deep snow as though it were flat.
        .replace('#include <project_vertex>',
          'vLampAt = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');
      shader.fragmentShader = `${this._lampUniformsGLSL}uniform float uGroundLit;
uniform float uSnow;
uniform vec3 uSnowTint;
uniform sampler2D uSnowMap;
${shader.fragmentShader}`
        // Right after the map has been sampled and before a single light has
        // been applied. `<map_fragment>` is where diffuseColor becomes the
        // painted ground; everything downstream of it is lighting.
        //
        // TIMES THE FIELD, which is the whole of footprints and the patchy
        // melt. `uSnow` is how much the sky has laid and the map is how much of
        // it is still here — so a trodden path is a place where the second
        // number is low, the mix falls short, and the ground the trail is cut
        // into shows through wearing the same hour and the same lamplight as
        // the snow either side of it.
        //
        // `vMapUv` and not a varying of ours: the ground has a `map`, so three
        // has already interpolated exactly the coordinate the planet's own
        // paint is sampled at, and reusing it is what guarantees the two agree
        // about where a point on the world is. A second set of UVs would be a
        // second chance to be a quarter turn out.
        .replace('#include <opaque_fragment>', ADD);
      if (snowMix) {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(
          diffuseColor.rgb, uSnowTint, uSnow * texture2D( uSnowMap, vMapUv ).r );`);
      } else {
        // THE SHELL'S OWN READING OF THE SAME MAP, and it is what makes a trail
        // legible rather than merely present.
        //
        // Geometry alone was not enough, and the measurement is worth keeping.
        // With the shell dipping into a footprint and nothing else, the trail
        // came back as a few green fragments where the dip happened to clear
        // the turf — because only the very core of a soft print goes deep
        // enough, and a fifth of a unit of relief on a planet fifty round is
        // invisible at any distance. What reads is COLOUR, and the shell had
        // none of its own: one flat white lid over everything.
        //
        // So the walls of a trail are trodden snow and the floor is the ground
        // showing through the dip. Between them the path is as bold as it was
        // before there was any depth, and now it has sides.
        //
        // Its own varying rather than `vMapUv`, since the shell has no `map` to
        // have made one — but the same UVs, off the same sphere, sampling the
        // same field the ground does. The two cannot disagree about where a
        // footprint is because there is only one footprint.
        shader.vertexShader = `varying vec2 vShellUv;\n${shader.vertexShader}`
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvShellUv = uv;');
        shader.uniforms.uTrodden = this.troddenTint;
        shader.fragmentShader = `varying vec2 vShellUv;\nuniform vec3 uTrodden;\n${shader.fragmentShader}`
          .replace('#include <map_fragment>', `#include <map_fragment>
        float packed = clamp(
          ( texture2D( uSnowMap, vShellUv ).r - 0.22 ) / 0.6, 0.0, 1.0 );
        diffuseColor.rgb = mix( uTrodden, diffuseColor.rgb, packed );`);
      }
    };
  }

  // ONE SURFACE, WEARING THE HOUR AND WHATEVER LAMPS CAN SEE IT.
  //
  // The only lighting patcher left. Everything unlit-and-drawn in this world
  // goes through here — grass, cards, walls, floors, furniture, the cast, a
  // bear somebody set down, the thing in your hand — and they differ in exactly
  // two ways, which are the two arguments:
  //
  //   `dark`  the multiply this surface wears where no lamp reaches. A shared
  //           uniform for anything nailed to one side of a wall (darkOut,
  //           darkIn); its own, written per frame, for anything that can walk
  //           through a door and be part way between the two.
  //
  //   `mask`  which lamps are allowed to reach it. 'out' and 'in' are constants
  //           — a bush is outdoors for good, a table indoors for good, and that
  //           was decided when they were built. 'side' is the live comparison
  //           for a mover, and it is the piece of the old machinery that came
  //           through the rework unchanged: `mix( 1 - in, in, side )` is 1 only
  //           when the lamp and the surface agree about which side of the
  //           masonry they are on. The truth table is the whole of it —
  //           outdoors reading an outdoor lamp is mix(1,0,0)=1; outdoors
  //           reading a room lamp is mix(0,1,0)=0; indoors reading a room lamp
  //           is mix(0,1,1)=1; and indoors reading the house's own porch light
  //           is mix(1,0,1)=0, which is the flat wash of somebody else's
  //           lamplight this mask exists to keep off your own front room.
  //
  // A method rather than a closure in the constructor because the cast are not
  // built with the world: a character joins whenever main.js says so, and has
  // to be able to ask for the same treatment then.
  //   `self`  one slot this surface must NOT read, or -1. Only a building uses
  //           it, and it is the last survivor of "a house is not lit by its own
  //           windows" — which under a restore is not the truism it sounds.
  //           A lamp indoors is modelled from the WALL rather than from itself
  //           (uLampInner), so the wall is at distance zero from its own light
  //           and sits at full coverage everywhere at once: not a circle on a
  //           building but the whole building washed to daylight, which is
  //           exactly what it looked like. Light leaving a window goes out and
  //           lands on the grass; it does not come back onto the wall it left.
  _wearHour(m, {
    dark, mask = 'out', side = null, lift = null, self = -1, tag = 'out',
  }) {
    // Idempotent, so a material on two lists or handed here twice is patched
    // once. The alternative is a wrapper wrapping a wrapper, which would apply
    // the hour twice and darken it squared.
    if (m.userData.hourDark) return;

    // What the surface is when no hour is on it. Outdoors that is white: the
    // drawing carries the colour and `material.color` was pure scratch space
    // for the tint, which is why it was safe for the old loop to overwrite it
    // every frame. A built piece may have a real colour of its own, and
    // `baseColor` is where the room's loop has always kept it.
    m.color.copy(m.userData.baseColor || WHITE);

    const N = this.lampUniforms ? this.lampUniforms.uLampK.value.length : 0;
    const MASK = {
      out: '1.0 - uLampIn[ i ]',
      in: 'uLampIn[ i ]',
      side: 'mix( 1.0 - uLampIn[ i ], uLampIn[ i ], uLampSide )',
    };
    const DECL = `uniform vec3 uDark;\n${N ? this._lampUniformsGLSL : ''}
      ${mask === 'side' ? 'uniform float uLampSide;' : ''}
      ${lift ? 'uniform vec3 uLampLift;' : ''}
    `;
    // Where the multiply lands: just after three has put the texture and any
    // vertex colours on `diffuseColor` and before anything reads it, which is
    // exactly where a multiply that used to live on `material.color` belongs.
    // PARENTHESISED, and the brackets are the bug this line already had once.
    // `1.0 - uLampIn[ i ] * cut` is `1.0 - ( uLampIn[ i ] * cut )`, so cutting
    // an OUTDOOR slot — where uLampIn is 0 — left the mask at 1.0 and the
    // exclusion turned into a no-op that was invisible except by measurement:
    // the house went on washing itself to daylight with its own windows, which
    // is precisely what `self` exists to stop.
    const cut = self >= 0 ? ` * ( i == ${self} ? 0.0 : 1.0 )` : '';
    const maskExpr = `( ${MASK[mask]} )${cut}`;
    const APPLY = N
      ? `#include <color_fragment>
         ${restoreGLSL(N, maskExpr, lift ? 'vLampAt + uLampLift' : 'vLampAt')}
         ${RESTORE_APPLY}`
      : '#include <color_fragment>\n\tdiffuseColor.rgb *= uDark;';

    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      if (prev) prev.call(m, shader, renderer);
      shader.uniforms.uDark = dark;
      if (N) {
        Object.assign(shader.uniforms, this.lampUniforms);
        shader.uniforms.uPlateau = this.plateau;
        if (side) shader.uniforms.uLampSide = side;
        if (lift) shader.uniforms.uLampLift = lift;
        // The token is PUT BACK, so any number of patchers can anchor here in
        // any order. `begin_vertex` was the old anchor and cannot be shared:
        // the grass replaces it outright to apply its bend, so a second patcher
        // looking for it would find nothing and silently do nothing at all.
        // `transformed` is final by this point — after any sway, skinning or
        // displacement — which is also what makes a leaning blade lit where it
        // has leaned to rather than where it grew.
        shader.vertexShader = `varying vec3 vLampAt;\n${shader.vertexShader}`
          .replace('#include <project_vertex>',
            'vLampAt = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');
      }
      shader.fragmentShader = DECL
        + shader.fragmentShader.replace('#include <color_fragment>', APPLY);
    };

    // AND THE CACHE KEY, WHICH IS NOT OPTIONAL.
    //
    // three.js decides whether two materials can share a compiled program by
    // comparing `onBeforeCompile.toString()`. Every wrapper made by this method
    // has the same source — it is the same function — so without this the
    // grass, the trees, the walls and the house skin would all hash alike and
    // three would hand some of them somebody else's shader.
    //
    // So the key says what was underneath as well as what was added, plus every
    // switch that changes the generated source. Built once here rather than in
    // the callback: three asks for this key whenever it re-checks a material,
    // and assembling a long string on that path would be a needless allocation
    // per material per frame.
    const key = `hour:${tag}:${mask}:${lift ? 'lift' : ''}:${self}|${prev ? prev.toString() : 'bare'}`;
    m.customProgramCacheKey = () => key;

    // So the CPU loops know to leave it alone, and so the guard above works.
    m.userData.hourDark = dark;
    // ...and the side switch beside it, for the callers that patch a material
    // lazily and have to go on writing to it afterwards without having kept
    // the reference themselves — see _syncCastHeld, where the thing being lit
    // outlives whoever is currently carrying it.
    if (side) m.userData.hourSide = side;
  }

  // `pickHouse` and `nearestHome` stood here, and they are gone rather than
  // kept. Between them they answered one question — which building did this tap
  // land on, and where is its doorstep — for one caller, the teleport in
  // main.js, and that has been removed outright. Nothing else on this planet has
  // ever needed to raycast a building: the only rays left are the ground, a
  // character's own body, and a loose piece's drawing.
  //
  // Not tombstoned as live-but-unused the way `walkTo` and `setWalkMarker` are.
  // Those are complete, correct, general machinery waiting on a verb. This was
  // the wrong shape for its job — a raycast against a whole dome cannot tell a
  // doorway from a hillside, which is exactly the bug it shipped — so keeping it
  // would be keeping an answer nobody should ask again.

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
  //
  // `lift` is how far above the planet's surface the thing being marked stands,
  // and it is the whole of what was wrong with this while it was a walk marker
  // wearing a second hat. A destination is a spot on the ground and a `dir` says
  // everything about it; a FOCUS is an object, and an object can be on a table.
  // Left at the surface, a lantern set down on the low table wore its ring on
  // the floor underneath — pointing, from a foot below, at the thing the buttons
  // were about. Nobody reads that as "this one"; they read it as a mark on the
  // floor, which is what it looked like.
  //
  // `r` is the ring's radius. See markRadius, which is where it comes from.
  setWalkMarker(dir, dtMs, lift = 0, r = WALK_MARK.r) {
    if (dir) {
      // ON TOP OF THE SNOW, not under it. This is the one place the shell's
      // depth has to leak back into the old contract: every other decal on this
      // planet is something the snow should cover — a shadow, a puddle, a
      // splash — and being buried is the correct answer for all of them. The
      // focus ring is not part of the world at all, it is the app pointing at
      // something, and a ring that vanished in deep snow would read as the
      // controls having stopped working.
      //
      // Lifted to where the OPEN FIELD stands rather than to the local depth.
      // Sampling the mask here would be a canvas read per frame to sink the
      // ring into whatever hollow it is standing over; carrying it at the
      // field's own height instead leaves it floating a few centimetres inside
      // a footprint, which nothing about a translucent ring makes visible.
      //
      // The height is the shell's, worked out the same way the shell is —
      // `cover * depth * mask` less the tuck, at the mask a fresh fall lays.
      // Lifting by the bare depth was near enough while the tuck was nothing
      // and is not now: at full cover that is 0.37 against a snow surface at
      // 0.22, and a ring hanging a seventh of a Chiikawa above the ground is
      // not on the ground. Floored at zero, since below the emergence cover
      // the shell is under the turf and the old contract is the right one.
      this.walkMark.position.copy(dir)
        .multiplyScalar(CONFIG.globe.radius + lift
          + Math.max(0, this.snowAt.value * CONFIG.weather.depth * FIELD_BASE
            - CONFIG.weather.shellTuck));
      this.walkMark.quaternion.setFromUnitVectors(UP, dir);
      this._markSize(r);
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

  // CUT AGAIN RATHER THAN SCALED, and that is not fussiness — a scale is wrong
  // here in a way you can see. The mark is a cap, so its vertices already follow
  // the sphere: every one of them sits WALK_MARK.lift above the surface, rim
  // included, which is the whole reason it stopped tearing into the hillside.
  // Squash that cap in x and z and the sag stays cut for the radius it was built
  // at while the surface under it has stopped curving away as fast — at half
  // size the rim keeps three thousandths of its two centimetres of clearance,
  // and the ring goes back to banding against the ground it is drawn on.
  //
  // The cost is a geometry, and it is charged only when the size actually
  // changes — which is when the focus moves from one piece to another, at
  // walking pace. Eighty-one vertices at the speed somebody crosses a room is
  // not a budget anybody has to think about.
  _markSize(r) {
    if (Math.abs(r - this._markR) < 1e-3) return;
    this._markR = r;
    this._markMesh.geometry.dispose();
    this._markMesh.geometry = groundCap(
      CONFIG.globe.radius, r * 2, r * 2, WALK_MARK.lift,
    );
  }

  // ------------------------------------------------------ the focus marks
  //
  // Who decides what is marked is main.js's updateMark — the same owner the
  // ring had — because the conditions are all things only it knows: which
  // facing settled, whether 「ひろう」 is actually on offer, whether the friend
  // is mid-sentence. These two setters only remember the target; everything
  // that has to happen every frame happens in _syncFocusMarks.

  // Mark a friend, or nobody. `ch` is a Character; its headWorld is the same
  // anchor the speech bubble hangs from, which is the point — the mark stands
  // exactly where the bubble will, and main.js swaps one for the other.
  setMateMark(ch) {
    this._markPerson.target = ch;
  }

  // Mark a loose piece, or nothing. Its height is measured on the way in
  // rather than per frame: a bounding sphere is shape-agnostic — a tall
  // lantern and a sasumata lying flat both come back with the reach of their
  // biggest half — and a piece's size does not change while it is focused.
  // The radius is a SIZE, not a position, so measuring through world matrices
  // is safe here where copying a world-space centre would not be: the marks
  // live inside the floating `world` group like everything they annotate.
  setGrabMark(loose) {
    const M = this._markThing;
    if (M.target === loose) return;
    M.target = loose;
    if (!loose) return;
    _fmBox.setFromObject(loose.body || loose.anchor);
    _fmBox.getBoundingSphere(_fmSphere);
    M.lift = _fmSphere.radius + FOCUS_MARK.gap;
  }

  // ...and over a PLACE — a perch site, `{dir, y}`, which is what 「いっておいで」
  // is about. `y` is already the top of the thing (the stump's cut face, the
  // pudding's dome), so the clearance is a plain gap rather than a measured
  // bounding sphere: there is no body here to measure, and the number the site
  // was built from is more honest about where the surface is than a box round
  // whatever geometry happens to be under it.
  //
  // Compared by VALUE rather than by identity, because perchSite hands back a
  // fresh object every call — an identity test would rebuild the mark's lift
  // every frame and, worse, read as the target having changed.
  setSpotMark(spot) {
    const M = this._markSpot;
    const same = !!M.target === !!spot
      && (!spot || (M.target.y === spot.y && M.target.dir.equals(spot.dir)));
    if (same) return;
    M.target = spot ? { dir: spot.dir.clone(), y: spot.y } : null;
    if (spot) M.lift = FOCUS_MARK.gap + FOCUS_MARK.spotGap;
  }

  // The per-frame half: position over the target, face the camera, bob, and
  // ease the scale toward present or gone. Squarely the hand slot's arrival
  // gesture — scale rather than opacity — because the mark is paper and ink,
  // and half-transparent ink stops reading as a line.
  //
  // The person mark re-reads its target every frame where the thing mark was
  // measured once, and that split is deliberate: a character WALKS — the mark
  // has to follow them through a stroll and a hop — where a focused piece
  // stands still for as long as it is the focus.
  _syncFocusMarks(now) {
    const dtMs = Math.min(100, this._fmAt ? now - this._fmAt : 16);
    this._fmAt = now;
    const k = 1 - Math.exp(-dtMs / FOCUS_MARK.easeMs);
    for (const M of [this._markPerson, this._markThing, this._markSpot]) {
      M.on += ((M.target ? 1 : 0) - M.on) * k;
      const shown = M.on > 0.004;
      if (shown !== M.mesh.visible) M.mesh.visible = shown;
      if (!shown) continue;
      M.clock += dtMs;
      const bob = Math.sin((M.clock / FOCUS_MARK.bobMs) * Math.PI * 2)
        * FOCUS_MARK.bobAmp;
      if (M.target) {
        if (M === this._markPerson) {
          const ch = M.target;
          ch.headWorld(_fmPos);
          M.mesh.position.copy(_fmPos)
            .addScaledVector(ch.normal, FOCUS_MARK.personGap + bob);
        } else if (M === this._markSpot) {
          // A bearing and a height, which is all a perch site is. Built here
          // rather than stored, so a mark on a spot needs nothing to exist in
          // the scene graph to point at.
          const sp = M.target;
          M.mesh.position.copy(sp.dir)
            .multiplyScalar(CONFIG.globe.radius + sp.y + M.lift + bob);
        } else {
          const l = M.target;
          M.mesh.position.copy(l.anchor.position)
            .addScaledVector(l.dir, M.lift + bob);
        }
      }
      // Screen-aligned, not aimed: copying the camera's quaternion keeps the
      // mark square to the view wherever it stands, with none of lookAt's
      // shear at the frame's edge.
      M.mesh.quaternion.copy(this.camera.quaternion);
      M.mesh.scale.setScalar(M.on);
    }
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
  //
  // `home` picks WHICH doorstep, defaulting to the first — which is the one you
  // arrive at and the one a tap on nothing in particular means. The distance
  // comes off that home's own spec when it is not given, so the cave's shallower
  // doorstep follows its shallower shell without a second call site knowing.
  doorstepDir(out, dist, home = this.homes[0]) {
    if (!home || !home.door) return null;
    const s = home.sprite;
    const at = dist === undefined ? home.spec.doorstep : dist;
    home.door.getWorldPosition(out).sub(this.world.position);
    out.addScaledVector(s.normal, -out.dot(s.normal));
    if (out.lengthSq() < 1e-9) return null;
    out.normalize();
    const arc = at / CONFIG.globe.radius;
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
  // and evening; the two dark hours share the moon.
  //
  // Sharing it is what keeps night and midnight a continuous sky rather than
  // two: `swapDisc` only fires where the DRAWING changes, so scrubbing across
  // that boundary moves one card whose colour and height are interpolated,
  // exactly as scrubbing between two daylight hours moves one sun. A moon
  // cross-fading into a second moon would be the one place in the day where
  // the thing overhead visibly changed identity while you watched.
  _discArtFor(phase) {
    return (phase === 'night' || phase === 'midnight')
      ? this.discTex.moon : this.discTex.sun;
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
  // THE WEATHER MULTIPLIES THE HOUR, and every line below that reads `w` is
  // doing exactly that and nothing cleverer.
  //
  // It lives inside this method rather than in a pass of its own, and the
  // reason is the same one that put the hour's own values here: several of
  // these numbers are read by things further down that would otherwise be
  // working from the ungraded version. The tint feeds `darkOut`, which feeds
  // every material on the planet; `skyLow` feeds the pond and the doorway
  // light; the lamp value feeds the whole of _lightState. Grading afterwards
  // would mean either re-running all of it or picking which parts to correct,
  // and picking is how a lighting system ends up with five copies of one rule.
  //
  // A weather with nothing in it costs the multiplications and changes no
  // pixel, which is what makes this safe to leave switched on.
  _applyBlend(t) {
    const { from: a, to: b, swapDisc } = this.blend;
    // Held for setWeather, which has to be able to ask for this same frame
    // again when the sky changes without the day having moved.
    this._blendAt = t;

    const w = this.wx;
    // The cast colour at this strength: white at wash 0, the full overcast at
    // wash 1. A multiply and not a lerp toward grey — see WEATHER_CAST for why
    // that difference is the whole design.
    const mul = this._wxMul.set(0xFFFFFF).lerp(this._wxCast, w.wash);
    // A bolt goes the other way, and it is the one thing in the app that
    // brightens the world past its own hour. Applied as a lift toward white on
    // the same multiply, so a flash reaches every surface the dark does with no
    // second path through the lighting.
    if (this._flash > 0) mul.lerp(WHITE, this._flash);

    _cA.set(a.ambient[0]);
    this.ambient.color.copy(_cA.lerp(_cB.set(b.ambient[0]), t));
    this.ambient.intensity = (a.ambient[1] + (b.ambient[1] - a.ambient[1]) * t)
      * w.amb * (1 + this._flash * 1.4);

    _cA.set(a.dir[0]);
    this.sun.color.copy(_cA.lerp(_cB.set(b.dir[0]), t));
    // The directional collapses where the ambient barely moves, and that ratio
    // IS overcast: cloud removes the sun, which is a disc, and leaves the sky,
    // which is a dome. Take them down together and a grey day comes out as a
    // dark one instead of a flat one.
    this.sun.intensity = (a.dir[1] + (b.dir[1] - a.dir[1]) * t) * w.dir;

    // ...and the same light again for everything the real one cannot reach —
    // see this.sunUniforms. Copied off the light rather than blended a second
    // time from the table, so the two can never come out of step: whatever the
    // ground is being lit by this frame is what the trees standing in it get.
    this.sunUniforms.uSunTint.value.copy(this.sun.color);
    this.sunUniforms.uSunLevel.value = this.sun.intensity * SUN_LIT.strength;

    _cA.set(a.tint);
    this.tint.copy(_cA).lerp(_cB.set(b.tint), t).multiply(mul);
    // One write, where this was a walk over every unlit material on the planet
    // — see _installHourTint. `this.tint` stays exactly what it was and is
    // still read by half a dozen things that blend against it (the far range,
    // the cast, whatever is in your hand); what has gone is only the loop that
    // stamped it onto each material in turn.
    this.darkOut.value.copy(this.tint);
    // ...and the same hour as the CAST wear it out here, lifted clear of the
    // moonlight so a white character does not sink into a moonlit hillside.
    // See CAST_LIFT. Worked out here, beside the tint it comes from, because
    // two places write it onto somebody: the hour, and the door.
    this.tintCastOut.copy(this.tint).lerp(WHITE, CAST_LIFT.out);

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
    // The colour at the BOTTOM of the sky, worked out once here because THREE
    // different things need it and for the same underlying reason: the far range
    // is partly the air in front of it, a pond is partly the sky bouncing off
    // it, and what a doorway lets into a room is the sky itself. The first two
    // are asking what fraction of this surface is not the surface; the third is
    // asking what colour the light is.
    _cH.set(a.skyLow).lerp(_cA.set(b.skyLow), t).multiply(mul);
    // Kept, because _applyLight needs it after this method has finished with
    // its scratch colours — see the doorway light there.
    //
    // Graded with everything else, which is what makes the two things
    // downstream of it honest in the rain: a pond under a grey sky mirrors a
    // grey sky, and the light a doorway lets into a room on a wet afternoon is
    // the colour of a wet afternoon.
    this.skyLow.copy(_cH);

    if (this._hazeMat) {
      // Rain is the most air there ever is, so the far range dissolves further
      // into the sky than any hour on its own takes it. Clamped, because the
      // haze is a mix factor and a storm at dusk adds past 1.
      const haze = Math.min(1, a.haze + (b.haze - a.haze) * t + w.haze);
      this._hazeMat.color.copy(this.tint).lerp(_cH, haze);
    }

    // The water, which is a mirror rather than a surface and so cannot take the
    // plain tint either. Same sky, a stronger pull toward it, and the glints
    // turned down rather than tinted — see waterHour.
    if (this.ponds) {
      waterHour(
        this.ponds, this.tint, _cH,
        a.mirror + (b.mirror - a.mirror) * t,
        // The glints go with the sun, because that is what they are. A pond
        // sparkling under a rain cloud is the one thing that would give the
        // grade away as a filter laid over the picture rather than as less
        // light reaching it.
        (a.glint + (b.glint - a.glint) * t) * w.glint,
        // ...and how far over it has gone. Laid on top of the hour rather than
        // replacing it, so a frozen pond is still part of whatever evening the
        // field around it is having — see the freeze in waterHour.
        this.iceAt,
      );
    }

    // The interior's own hour, blended on the same axis — see tintIn in
    // daylight.js for why indoors is not outdoors with the lights down.
    // Stored as the BASE, what the room looks like with somebody in it,
    // because occupancy dims it from _syncInterior and needs the undimmed
    // value to dim from.
    _cA.set(a.tintIn);
    this._tintInBase.copy(_cA).lerp(_cB.set(b.tintIn), t);
    // ...and the weather reaches in here too, though not all the way. A room is
    // enclosed, so what the sky does to it arrives only through the openings —
    // but it does arrive, and it is most of why sheltering from rain is worth
    // doing: the corners go properly gloomy, which is what leaves the lamp the
    // brightest thing in the place. See the restore model in light-model.js —
    // whatever a lamp reaches comes back to daylight regardless, so darkening
    // this cannot dim the lit half of the room, only deepen the unlit half.
    _cA.set(0xFFFFFF).lerp(mul, INDOOR_WEATHER);
    this._tintInBase.multiply(_cA);

    // The inside face of the windows used to be painted the sky's own colour
    // here — the one thing in the room that said what hour it was out there.
    // The windows are holes now, so the room is told the hour by the sky
    // itself, through them.

    // Whoever is stood outside wears the sky's tint. The interior lists and
    // whoever is under the roof are written by _syncInterior, which _setLamps
    // below calls — the lamps are an input to the interior's colour.
    // The cast are NOT written here any more. Their colour is a blend of this
    // hour and the room's — see the lerp in _syncInterior — and the room's half
    // is not worked out until _setLamps has run, a few lines below. Writing
    // them from here as well left whoever was in the doorway wearing the sky
    // for a frame, then correcting.

    // THE HOUR'S LAMP VALUE, WITH THE WEATHER ADDED. This one line is the whole
    // of "the houses light up when it rains", and it is worth being clear that
    // nothing new was built for it.
    //
    // `lamps` already means "how dark is it out, and therefore is a lit window
    // worth drawing" — it is the dusk curve — and the wired bulbs already
    // follow it multiplied by whether anybody is home. A rained-out afternoon
    // IS a dusk by that measure, so raising the number lights exactly the
    // houses somebody has run into and leaves the empty one dark. Nobody had to
    // be taught to reach for a switch, and the rule that a dark lamp always has
    // a hand behind it survives untouched: a hand still wins, for as long as
    // the day lets it.
    //
    // The RAW hour goes along beside it, and that is not tidiness. _setLamps
    // hands the switches back to the clock at each turn of the day, and it
    // decides whether the day has turned by asking whether this number crossed
    // LAMP_ONSET. Given the graded value it would call the start of every
    // shower a dusk and the end of one a dawn — and a dawn takes back every
    // light anybody switched by hand.
    const hourLamps = a.lamps + (b.lamps - a.lamps) * t;
    this._setLamps(Math.min(1, hourLamps + w.lamps), hourLamps);

    _cA.set(a.skyMid);
    this.renderer.setClearColor(_cA.lerp(_cB.set(b.skyMid), t).multiply(mul), 1);

    this.skyB.material.opacity = t;

    // The cloud deck over the lot of it, wearing the hour as a multiply — see
    // paintCloudDeck. `this.tint` and not the graded one: the deck IS the thing
    // doing the darkening, so grading it as well would take the sky down twice
    // and leave a rained-out noon darker than the ground under it.
    const cloud = w.sky;
    const decked = cloud > 0.004;
    if (decked !== this.deck.visible) this.deck.visible = decked;
    if (decked) {
      _cA.set(a.tint).lerp(_cB.set(b.tint), t);
      // ...lifted toward white before the hour goes on, which is the one thing
      // that lets a snow sky and a rain sky share a texture.
      //
      // They are not the same grey and the difference is not subtle: a rain
      // cloud is the darkest sky this world has, and a snow cloud is one of the
      // palest, because the ground under it is white and throws the light
      // straight back up at it. Painting a second deck was the alternative;
      // this is one lerp and it moves continuously, so a front turning from
      // rain to snow BRIGHTENS as it turns rather than swapping skies.
      if (w.deckLift > 0) _cA.lerp(WHITE, w.deckLift);
      if (this._flash > 0) _cA.lerp(WHITE, this._flash);
      this.deck.material.color.copy(_cA);
      this.deck.material.opacity = cloud;
    }

    // Faded rather than switched, so dusk brings them up instead of turning
    // them on. `stars` is a flag, and only night sets it.
    //
    // ...and taken out again by cloud, on top of the deck already covering
    // them. Both, because they are additively blended: a bright star reads
    // straight through a deck at 60% and a sky with stars in it is a clear one
    // whatever else is drawn over it.
    this._setStarAlpha(((a.stars ? 1 - t : 0) + (b.stars ? t : 0)) * (1 - w.veil));

    if (!this.discA) return;
    const seen = this._discShow();
    if (swapDisc) {
      this.discA.material.opacity = (1 - t) * seen;
      this.discB.material.opacity = t * seen;
    } else {
      this.discA.material.opacity = seen;
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

  // WHERE THE RAINBOW STANDS, and how much of it there is.
  //
  // Turned to face AWAY FROM THE SUN, which is the only fact about a rainbow's
  // position that anybody carries around: it is always on the other side of the
  // sky from the light. Everything else about the placement is composition —
  // see bowCentreEl in CONFIG.weather for why the real 42-degree geometry is
  // unusable on a planet whose horizon is already 34 degrees down.
  //
  // It runs every frame rather than on a change, and cheaply: two vectors and a
  // basis. The sun MOVES — its texel is interpolated across every hour of the
  // day — so a rainbow aimed once at dawn would be pointing at nothing by
  // evening, and worse, would swing visibly if it were re-aimed only when
  // something else happened to ask.
  _aimBow(dtMs, look) {
    const w = CONFIG.weather;
    // Eased toward what the sky says, and this is the only place the easing
    // happens. `bowEaseMs` is the slowest fade in the app on purpose: a
    // rainbow that snapped on would read as something being switched on.
    const want = this.wx.bow || 0;
    this._bowAt += (want - this._bowAt) * (1 - Math.exp(-dtMs / w.bowEaseMs));
    const on = this._bowAt > 0.004;
    if (on !== this.bow.visible) this.bow.visible = on;
    if (!on) return;
    this.bow.material.opacity = this._bowAt * w.bowAlpha;

    // The sun's own direction in the sky's frame, from the same texel the disc
    // is placed at — so the arc and the light it comes from can never disagree.
    skyDirFromTexel(look.discAt[0], look.discAt[1], SKY_DESIGN.w, SKY_DESIGN.h, _bowSun);
    // ...flattened to a bearing and reversed. Only the compass direction is
    // taken from the sun; the height is the composition's.
    _bowAxis.set(-_bowSun.x, 0, -_bowSun.z);
    // The sun directly overhead has no bearing to be opposite of. Any will do,
    // and it lasts one frame — noon's disc is never quite at the zenith.
    if (_bowAxis.lengthSq() < 1e-9) _bowAxis.set(0, 0, -1);
    _bowAxis.normalize().multiplyScalar(Math.cos(w.bowCentreEl));
    _bowAxis.y = Math.sin(w.bowCentreEl);
    _bowAxis.normalize();

    // Stand the built band on that axis: its own +Z onto the axis, its own +Y
    // as near to straight up as the axis allows — which is what keeps the crown
    // at the top of the arc wherever the sun has got to.
    _bowUp.set(0, 1, 0).addScaledVector(_bowAxis, -_bowAxis.y);
    if (_bowUp.lengthSq() < 1e-9) _bowUp.set(1, 0, 0);
    _bowUp.normalize();
    _bowRight.crossVectors(_bowUp, _bowAxis).normalize();
    _bowM.makeBasis(_bowRight, _bowUp, _bowAxis);
    this.bow.quaternion.setFromRotationMatrix(_bowM);
  }

  // How much of the sun or moon is showing. The deck already covers it
  // physically — it is nearer and drawn later — and this is the second half of
  // the same fact: a disc is a bright card, and at any partial cover it reads
  // straight through the cloud in front of it as a hot spot. Anything above
  // light cloud takes it out entirely.
  _discShow() {
    return 1 - this.wx.veil;
  }

  // WHAT IS IN THE AIR, handed over by the director. See weather.js.
  //
  // It re-paints the frame, and that is the whole of what this method does
  // beyond storing the value. `updateDaylight` walks away the moment the day
  // has nothing left to fade, so on a settled afternoon nothing would ever call
  // `_applyBlend` again and a front rolling in would move no pixel until the
  // next hour turned. Asking for the same point in the day to be painted again
  // is cheap — it is what every frame of a cross-fade already does — and it
  // means the weather needs no second path into the lighting.
  //
  // `flash` is the lightning, 0 to 1, and is separate from the grade for the
  // reason given where it is stored: a bolt is an event on the frame clock,
  // where the grade is a fact about the sky.
  // ...and it is called every frame and repaints on almost none of them.
  //
  // The guard is worth having rather than being tidiness. `_applyBlend` ends in
  // `_setLamps`, which is the whole lighting walk — every lamp, every building,
  // the interior — and `update()` already runs that once a frame through
  // `_relight`. Repainting unconditionally would run it twice on every frame of
  // a clear afternoon in exchange for nothing, since a grade that has not moved
  // paints exactly the pixels that are already on screen.
  //
  // A signature and not an equality test, because weather.js publishes ONE
  // grade object and mutates it in place — deliberately, so nothing downstream
  // allocates sixty times a second — which means `wx === grade` is true from the
  // second call onward and says nothing at all. What has to be compared is the
  // values, and a weighted sum of them is a cheaper way of asking than eight
  // comparisons that all have to be kept in step with the table.
  setWeather(grade, flash = 0, ice = 0) {
    this.wx = grade;
    this.iceAt = ice;
    const g = grade;
    // `ice` is IN the signature, and it has to be. It is not part of the grade
    // — the ponds freeze off the cover rather than off the sky — but the water
    // is painted inside the blend, so a surface going over while nothing else
    // about the weather moved would repaint on no frame at all and the pond
    // would jump to ice the next time an unrelated number happened to change.
    const sig = g.wash + g.sky * 3 + g.lamps * 7 + g.veil * 11
      + g.amb * 13 + g.dir * 17 + g.glint * 19 + g.haze * 23 + flash * 29
      + g.deckLift * 31 + ice * 37;
    if (Math.abs(sig - this._wxSig) < 1e-5) return;
    this._wxSig = sig;
    this._flash = flash;
    this._applyBlend(this._blendAt);
  }

  // What is falling, and what it has left lying — neither of which is part of
  // the hour, so neither is in the blend. See falling.js.
  //
  // The cover is the exception and does TWO things from one number: it is
  // handed down to the snowmen, which are made of it, and it is written into
  // the ground's own shader, which is where the planet turns white. One write
  // rather than a walk, for the reason every other shared uniform here is one.
  updateRain(dtMs, opts) {
    if (!this.rain) return;
    // The arc, aimed and faded. It rides here rather than in the day's own
    // blend because it has to run on EVERY frame: `updateDaylight` walks away
    // the moment the hour has finished changing, and a rainbow arrives on a
    // settled afternoon by definition — that is what a shower ending is.
    //
    // Only the sun's BEARING is read, and every hour of this day puts the disc
    // at the same one (see discAt in daylight.js, whose first number is 300
    // throughout), so which end of the current fade this asks is a question
    // with one answer. It is asked of the look rather than assumed, so that
    // moving the sun round the sky some day moves the rainbow with it.
    this._aimBow(dtMs, this.blend.to || this.blend.from || LOOK.noon);

    const cover = opts.snow || 0;
    this.snowAt.value = cover;
    this._bury(cover);
    this._winter(cover);

    // HOW DEEP IT STANDS, which is the whole of driving the shell: one number a
    // frame. The mask says how much snow is at each point and this says how
    // much there is at all, so a fall rising lifts the whole surface and a
    // footprint stays a hollow in it throughout.
    //
    // Hidden outright below a sliver of cover rather than left parked under the
    // turf, because a shell that is never seen should not be a draw call either
    // — and at these depths it would be poking through the grass in blotches
    // long before it read as snow.
    if (this.shell) {
      const deep = cover > 0.02;
      if (deep !== this.shell.visible) this.shell.visible = deep;
      if (deep) this.shell.material.displacementScale = cover * CONFIG.weather.depth;
    }
    // LIGHT EATS SNOW, and the whole of deciding where is one loop over the
    // lamp arrays — see `thaw` in snowfield.js for what it does with the answer.
    //
    // The shader's own lamp list rather than any of the several JS-side ones,
    // and that is what makes this three lines instead of a special case per kind
    // of light. Every emitter in the world lands in those arrays, and the ground
    // shader already reads exactly this product to decide what light reaches the
    // grass: `uLampK` is how hard the lamp is burning and `1 - uLampIn` is how
    // much of it is on THIS side of a wall. So the melt inherits, for free, every
    // rule the lighting already has — a bulb switched off stops melting, a house
    // with nobody home never starts, and a lantern carried out through the front
    // door begins thinning the snow the moment it is outside and stops when it
    // goes back in, because that is what `uLampIn` already says about it.
    //
    // `uLampAt` is written a frame later than this, in `update`. That staleness
    // is why the guard below is worth having rather than something to fix: an
    // unbuilt slot is still at the origin, and normalising the origin is a NaN
    // straight into the map. One frame of lag on a four-minute melt is not.
    const flow = dtMs * clockRate();
    if (this.field.laid && this.lampUniforms) {
      const U = this.lampUniforms;
      const n = U.uLampK.value.length;
      // Filled into a pool rather than rebuilt, because this runs every frame of
      // every winter night. One slot per lamp, made once and written over.
      const pool = this._warmSpots;
      let live = 0;
      for (let i = 0; i < n; i++) {
        const k = U.uLampK.value[i] * (1 - U.uLampIn.value[i]);
        if (k < 0.05) continue;
        _lightDir.copy(U.uLampAt.value[i]).sub(this.world.position);
        if (_lightDir.lengthSq() < 1e-6) continue;
        if (!pool[live]) pool[live] = { key: 0, dir: new THREE.Vector3(), r: 0, k: 0 };
        const spot = pool[live++];
        spot.key = i;
        spot.dir.copy(_lightDir).normalize();
        spot.r = U.uLampInner.value[i] + U.uLampReach.value[i] * CONFIG.weather.thawReach;
        spot.k = k;
      }
      this.field.thaw(pool, flow, live);
    }

    // The field's own clock: filling trodden prints back in while it snows, and
    // pushing the map to the GPU at most a few times a second. Both are no-ops
    // on a planet with no snow on it.
    //
    // Wall time on purpose, where the thaw above takes `flow` — see the note on
    // `update` in snowfield.js for the day this took world time and the map
    // saturated flat white under a fast-day snowfall.
    this.field.update(dtMs, this.wx.flakes || 0);
    this.rain.update(dtMs, {
      ...opts, tint: this.tint, grade: this.wx, camera: this.camera,
    });
  }

  // WHAT THE SNOW COVERS UP — the grass blades and the flowers, taken down as
  // the cover comes up. See where `_buried` is collected for why they are
  // buried rather than repainted white.
  //
  // They go under EARLY and completely: the ground is only a third white by the
  // time the last blade has gone. Snow does not gradually recolour a meadow, it
  // fills it in, and the shortest things go first — so the meadow reads as
  // being covered rather than as fading out, which is what a linear ramp
  // against the cover would have given.
  //
  // Guarded on the value rather than run every frame: this is a walk over four
  // or five merged meshes, and for all but a few seconds of any winter the
  // answer is the same as last frame's.
  // THE SCENERY PUTS ITS COAT ON, at the same moment the cast do — see
  // `dressAt`, which is one number for exactly that reason.
  //
  // Its own guard rather than riding on _bury's, and that is not tidiness: the
  // meadow is fully buried by a third of full cover, so _bury's own check stops
  // moving there and anything hung on it would never fire at a higher
  // threshold. Two questions with two different shapes get two guards.
  //
  // A SWAP AND NOT A FADE, for the reason every redraw in this project is one:
  // there is no half-snowy drawing and there should not be. What hides the cut
  // is when it happens — by `dressAt` the sky is full of snow and the ground is
  // already going white, so a bush changing is one more thing changing rather
  // than a thing changing on its own.
  _winter(cover) {
    const on = cover > CONFIG.weather.dressAt;
    if (on !== this._wintered) {
      this._wintered = on;
      for (const c of this._snowCards) {
        c.mesh.material.map = on ? c.winter : c.summer;
        c.mesh.material.needsUpdate = true;
      }
      // A FRESH FIELD, laid once as the snow starts and wiped once as the last
      // of it goes. See snowfield.js — this is the only place either happens.
      //
      // On the rising edge and not continuously, because a fall is one event:
      // where the drifts end up is decided when the snow arrives, and re-rolling
      // them under somebody's feet would have the world quietly rearranging
      // itself while they stood in it. Everything after this is footprints.
      if (on) this.field.fresh(this._driftFeatures(), makeRandom(WORLD_SEED + 907));
      else this.field.clear();
    }
  }

  // WHERE THE SNOW LIES UNEVENLY, as a list of spots for the field to work
  // from. It is asked of the scene because the scene is the only thing that
  // knows where anything is — see `fresh` in snowfield.js for what it does
  // with them, and why the two kinds pull opposite ways.
  //
  // Trees and bushes THIN the snow under them, which is the one of these
  // anybody notices without being able to name: a paler ring under every
  // canopy is what stops the trees looking like they were laid on top of a
  // white sheet. Buildings BANK it against their walls.
  //
  // Read off the same `sprites` list the cull and the sort use, so a prop moved
  // or a prop added brings its own patch of shelter with it and nothing here
  // has to be told.
  _driftFeatures() {
    const R = CONFIG.globe.radius;
    const out = [];
    for (const s of this.sprites) {
      if (s.home) continue;
      // How wide the thing actually is, taken from the card or the built
      // shell's own measured height — the same figure the sightline test uses.
      const reach = s.treeH ? s.treeH * 0.42 : (s.standoff || 0.6) * 1.3;
      if (reach < 0.35) continue;
      out.push({ dir: s.normal, r: reach, level: -(s.treeH ? 0.34 : 0.22) });
    }
    for (const h of this.homes) {
      if (!h.building) continue;
      const wall = h.building.r * R;
      out.push({
        dir: h.sprite.normal,
        r: wall + 1.9,
        inner: wall + 0.15,
        level: 0.30,
      });
    }
    return out;
  }

  // Somebody walked. A thin passthrough so that nothing outside the scene has
  // to know whether there is any snow to walk in — see `tread` in snowfield.js,
  // which does nothing at all on a field that has not been laid.
  // ------------------------------------------------------------ somewhere to
  //                                                                perch on
  //
  // The nearest prop of a kind, with the height of the surface you would stand
  // on top of it — everything a pastime needs to know about the thing it is
  // about. Null when the world has none of that kind, which is the whole of how
  // a pastime whose prop was never scattered simply never happens.
  //
  // ASKED OF THE SCENE because the scene is the only thing that knows where
  // anything is, and worked out from the SAME numbers the props were built
  // from: a stump's cut face comes off the lathe that cut it, and a pudding's
  // top is the height the builder returned. Neither is a constant written down
  // twice, so a resized prop moves the perch with it.
  //
  // `standoff` is half the prop's height — see where sprites are pushed — which
  // is the one measurement every prop carries, so `h` comes back out of it
  // rather than being stored a second time.
  perchSite(type, from) {
    let best = null;
    let near = Infinity;
    for (const s of this.sprites) {
      if (s.type !== type) continue;
      const d = from ? from.angleTo(s.normal) : 0;
      if (d >= near) continue;
      near = d;
      best = s;
    }
    if (!best) return null;
    const h = (best.standoff || 0) * 2;
    // A pudding is a cylinder with a domed shoulder and the builder calls its
    // full height the top; a stump is a lathe whose cut face sits at `tall`.
    const y = type === 'stump' ? stumpTop(h) : h;
    return { dir: best.normal, y, r: solidRadius(type, h) / CONFIG.globe.radius, sprite: best };
  }

  // ------------------------------------------------------------- the notes
  //
  // WHAT COMING OUT OF SOMEBODY LOOKS LIKE. Called every frame while a hobby
  // with `tune` is under way — see PASTIMES — and left alone the rest of the
  // time, when it is a hidden pool costing nothing.
  //
  // BUILT ONCE AND REUSED, the way the splashes and the flakes are. A note is a
  // card that lives for a second and a half; making one per note would be a
  // texture upload and a material compile several times a second, which is a
  // great deal of machinery for a quaver.
  //
  // They rise, drift to one side, and fade — and the drift is what stops four
  // notes reading as one note stuttering. Each takes its own bearing and its own
  // drawing when it is launched, so no two are on the same path.
  _tunePool() {
    if (this.tune) return this.tune;
    const maps = (IMG.tune || []).slice(0, TUNE_VARIANTS)
      .filter(Boolean).map((img) => texFrom(img));
    const notes = [];
    if (maps.length) {
      const w = CONFIG.household.tuneSize;
      for (let i = 0; i < CONFIG.household.tuneCount; i++) {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(w, w),
          sceneryMaterial(maps[0]),
        );
        mesh.material.opacity = 0;
        mesh.visible = false;
        // Over the cast, because a note is in front of the singer rather than
        // among them — and both are transparent, so nothing but a painter's
        // order can say so.
        mesh.renderOrder = 60;
        this.world.add(mesh);
        notes.push({ mesh, life: 1, at: new THREE.Vector3(), up: 0, side: 0, spin: 0 });
      }
    }
    this.tune = { maps, notes, due: 0 };
    return this.tune;
  }

  // `dir` and `y` are where the singer is standing and how high they are; the
  // notes come off their shoulder rather than their feet.
  tuneAt(dir, y, dtMs, camera) {
    const pool = this._tunePool();
    if (!pool.notes.length) return;
    const R = CONFIG.globe.radius;
    const w = CONFIG.household;
    pool.due -= dtMs;
    for (const n of pool.notes) {
      if (n.life >= 1) {
        // Nothing to draw. Launch a new one when one is due, so the pool cycles
        // rather than all of them going at once.
        if (pool.due > 0) {
          if (n.mesh.visible) n.mesh.visible = false;
          continue;
        }
        pool.due = w.tuneEveryMs * (0.7 + Math.random() * 0.6);
        n.life = 0;
        n.up = 0;
        n.side = (Math.random() * 2 - 1) * w.tuneDrift;
        n.spin = (Math.random() * 2 - 1) * 0.5;
        n.at.copy(dir);
        n.mesh.material.map = pool.maps[Math.floor(Math.random() * pool.maps.length)];
        n.mesh.material.needsUpdate = true;
        n.mesh.visible = true;
      }
      n.life = Math.min(1, n.life + dtMs / w.tuneMs);
      // Up fast and then easing off, which is how something light leaves a
      // hand. A constant climb reads as a lift rather than as a release.
      const k = 1 - (1 - n.life) * (1 - n.life);
      n.up = w.tuneRise * k;
      // Placed in the world from the singer's own spot, so a singer who slides
      // about the top of a pudding takes their notes with them.
      _tuneTan.set(0, 1, 0).cross(n.at);
      if (_tuneTan.lengthSq() < 1e-9) _tuneTan.set(1, 0, 0).cross(n.at);
      _tuneTan.normalize();
      const arc = (n.side * k) / R;
      _tuneAt.copy(n.at).multiplyScalar(Math.cos(arc))
        .addScaledVector(_tuneTan, Math.sin(arc)).normalize();
      n.mesh.position.copy(_tuneAt).multiplyScalar(R + y + w.tuneLift + n.up);
      if (camera) {
        n.mesh.quaternion.copy(camera.quaternion);
        // The little tumble, IN SCREEN SPACE — composed onto the billboard
        // rather than written through it. This read `rotation.z = spin * life`
        // for a while, and that line quietly unmade the line above it: setting
        // one Euler axis decomposes the camera's quaternion, keeps x and y, and
        // REPLACES z — and on a planet, the camera's own z-component encodes
        // part of where you are standing, so the notes came out tilted by an
        // amount that depended on your longitude. Measured at the stump: 70-odd
        // degrees off, reading as the drawings being wrong when the drawings
        // were upright all along.
        n.mesh.rotateZ(n.spin * n.life);
      }
      // Held, then let go — a note that starts fading the instant it appears
      // never reads as a shape at all.
      n.mesh.material.opacity = n.life < 0.45 ? 1 : 1 - (n.life - 0.45) / 0.55;
      if (n.life >= 1) n.mesh.visible = false;
    }
  }

  // Quiet again. Called when the singing stops, so the last few notes are not
  // left hanging in the air over an empty stump.
  tuneOff() {
    if (!this.tune) return;
    for (const n of this.tune.notes) {
      n.life = 1;
      if (n.mesh.visible) n.mesh.visible = false;
    }
  }

  // ---------------------------------------------------------- a photograph
  //
  // The scene as it stands, as a PNG blob.
  //
  // RENDERED AGAIN INTO A TARGET rather than read off the canvas, and that is
  // not belt-and-braces. `preserveDrawingBuffer` is off — it costs something on
  // every frame of the year to serve one button — so the drawing buffer is not
  // guaranteed to still hold anything by the time a `toBlob` callback runs, and
  // the failure mode is a silent black rectangle. Rendering into a target reads
  // pixels back synchronously from a buffer this call owns, which cannot go
  // stale, and it lets the picture be a sensible size on a phone whose canvas
  // is whatever the screen happens to be.
  //
  // What it does NOT capture is the HUD, the pills or the speech bubbles: those
  // are DOM over the top of the canvas, so a photograph comes out as the world
  // alone. That is the right picture and it is free.
  photo(maxW = 1080) {
    const cam = this.camera;
    const aspect = (Number.isFinite(cam.aspect) && cam.aspect > 0.05) ? cam.aspect : 0.65;
    // ASKED FOR OUTRIGHT rather than capped to the canvas. This began as
    // `min(maxW, canvas.width)`, which on a small screen handed back a 540-wide
    // photograph — the size of the BUFFER the game happens to be drawing into,
    // which is a fact about the device rather than about the picture. Nothing is
    // upscaled by rendering larger: the character sheets are around a thousand
    // pixels across and the ground paints its own detail, so a bigger frame
    // genuinely resolves more. A photograph should be the same size wherever it
    // was taken.
    const w = Math.max(320, Math.round(maxW));
    const h = Math.max(320, Math.round(w / aspect));
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const r = this.renderer;
    const had = r.getRenderTarget();
    r.setRenderTarget(rt);
    r.render(this.scene, cam);
    const px = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, px);
    r.setRenderTarget(had);
    rt.dispose();

    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    // Upside down on the way out: GL counts rows from the bottom and a canvas
    // counts them from the top.
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      img.data.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return new Promise((done) => cv.toBlob(done, 'image/png'));
  }

  tread(key, dir) {
    this.field.tread(key, dir);
  }

  _bury(cover) {
    const hide = Math.min(1, cover / BURY_BY);
    if (Math.abs(hide - this._buriedAt) < 0.004) return;
    this._buriedAt = hide;
    for (const m of this._buried || []) {
      // Visibility and not opacity, at the far end. These are cut out with
      // alphaTest and rendered in the OPAQUE pass — see buildGroundCover, which
      // says so and gives the reason — so an opacity below 1 does nothing at
      // all to them. What can be done is to stop drawing them, and the shrink
      // below is what makes that stop invisible.
      const on = hide < 0.995;
      if (m.visible !== on) m.visible = on;
      if (!on) continue;
      // Sunk into the ground rather than faded out of it, which is what being
      // covered by snow looks like: the blades get shorter and shorter until
      // there is nothing above the surface. Scaling toward the planet's centre
      // is the whole of it — every one of these is built standing on the
      // sphere, so shrinking about the origin shortens each blade along its own
      // normal without moving where it grows.
      m.scale.setScalar(1 - hide);
    }
  }

  // Lights on indoors. `v` is the raw phase-to-phase number from daylight.js
  // with the weather already added; `hourV` is the same number WITHOUT it, and
  // the handback below is the only thing that reads the difference.
  //
  // What comes out of LAMP_ONSET and the smoothstep is a curve that stays at
  // nothing through the first part of dusk and then comes up in one movement.
  //
  // The shaping is not decoration. The lit sheet is a second whole drawing of
  // the house, and cross-fading it linearly across the entire evening means
  // several seconds of a house that is half daylit and half lamplit — which
  // does not read as dusk, it reads as a double exposure. Held off and then
  // brought up, it reads as somebody switching a light on, which is the thing
  // actually being depicted.
  _setLamps(v, hourV = v) {
    this._lampAt = v;
    const u = (v - LAMP_ONSET) / (1 - LAMP_ONSET);
    const shape = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    // Kept separately from `_lamps` because the interior needs the two factors
    // apart: how deep into the evening it is, without the occupancy already
    // multiplied in. See _syncInterior.
    this._lampShape = shape;
    // The hour times HOW FULL EACH HOUSE IS, one per home. It was a single
    // number and with two buildings that number is a lie in the visible
    // direction: at `atOnce: 1` somebody being home in the cave would have
    // brought the lights up in Chiikawa's empty house, twenty units away,
    // while she stood next to you on the grass.
    //
    // `_lamps` survives as the strongest of them, for the handful of readers
    // that are asking about the evening in general rather than about a
    // particular room.
    // DUSK AND DAWN HAND THE WIRED LIGHTS BACK TO THE HOUR.
    //
    // An override that never expired would be worse than none: switch the bulb
    // off one evening and it is off for the rest of the session, so the house
    // you come home to at midnight tomorrow is dark and nothing you did that
    // morning explains it. Handing it back at each turn of the day gives the
    // behaviour a wall switch actually has — yours until the day next changes
    // its mind, and the room lights itself again the following evening.
    //
    // The switch is restored WITH the override, and it has to be: `manual`
    // cleared while `on` stayed false would leave the hour holding a switch
    // that is already off, and dusk would find nothing to turn up.
    //
    // Against the HOUR alone — `shape`, not `h.lamps` — because the second has
    // occupancy folded in, and the last friend leaving the house is not a turn
    // of the day. It would have taken a bulb you had just switched on with them.
    //
    // AT DAWN ONLY, and it fired at both ends of the night for a while. Firing
    // at dusk had a visible cost that took a bulb switched on by hand at noon
    // to find: the moment the fade crossed LAMP_ONSET, the handback cleared
    // `manual` and the burn fell from the override's 1 to the hour's
    // just-woken 0.02 — the lamp you had deliberately lit BLINKED OUT at the
    // start of every dusk and then crawled back up with the dark. Measured at
    // burn 1.000 → 0.017 across one frame.
    //
    // Handing back when the evening ENDS instead costs nothing anybody can
    // see: the hour's own value for a night light at dawn is 0, the lamp is
    // going out either way, and the switch is returned while nothing is
    // burning. What it buys is the promise the original note made — a touched
    // light is YOURS until the day next changes its mind. Switch the bulb on
    // at noon and it burns at full through the whole night, whoever wanders
    // home or does not; dawn takes it back, and the following dusk the room
    // lights itself again.
    // ...AND IT ASKS THE HOUR, NOT THE SKY. `hourV` is this same number with
    // the weather taken back out, and using it here is the difference between
    // a shower and a day.
    //
    // Given the graded value, the start of every rain front would look to this
    // like a dusk and the end of one like a dawn — so a lamp anybody had
    // switched by hand would be taken back off them the moment the sky
    // cleared, which is the exact failure the note above spent a paragraph
    // fixing. The day changing its mind is a thing the DAY does. Rain is
    // weather, and weather does not reach the switches.
    const evening = (hourV - LAMP_ONSET) > 0;
    if (this._eveningWas && !evening) {
      for (const L of this.itemLights) {
        if (!L.night) continue;
        L.manual = false;
        L.switchedOn = true;
      }
      for (const L of this.roomLights) {
        if (!L.night) continue;
        L.manual = false;
        L.on = true;
      }
    }
    this._eveningWas = evening;
    // ...and then the whole of what the lamps decide: worked out, and then
    // written. See _lightState and _applyLight.
    //
    // WHAT THIS REPLACED is worth keeping, because the shape of it is the
    // argument for having done it. Three memoised guards stood here and below —
    // `strongest !== this._lamps` around the props, `v === h.lit` inside
    // _syncHouseLit, and a comment on the next line explaining that the glow
    // had to be re-applied REGARDLESS because that second guard would otherwise
    // leave the window frames wearing yesterday's colour. Each guard was a
    // correct optimisation. Between them they made the result depend on the
    // ORDER five methods were called in, and the fix for the one that bit was
    // to call one of them twice.
    //
    // A total write has no order to get wrong.
    this._applyLight(this._lightState(v));
  }

  // EVERYTHING THE LAMPS DECIDE, worked out and handed back as plain values.
  //
  // Pure: it reads the switches, the homes and the hour, and writes nothing at
  // all. That is the whole point of it. Every ordering bug this file has had in
  // its lighting came from a method that both decided something and wrote it
  // down, so whether you got the right answer depended on who had run first.
  // Nothing computed here can be observed by anything except _applyLight.
  _lightState(v) {
    const u = (v - LAMP_ONSET) / (1 - LAMP_ONSET);
    const shape = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);

    // The hour times HOW FULL EACH HOUSE IS, one per home. It was a single
    // number and with two buildings that number is a lie in the visible
    // direction: at `atOnce: 1` somebody being home in the cave would have
    // brought the lights up in Chiikawa's empty house, twenty units away, while
    // she stood next to you on the grass.
    const homes = this.homes.map((home) => ({
      home, lamps: shape * home.occupancy, lit: 0,
    }));
    const lampsOf = new Map(homes.map((r) => [r.home, r.lamps]));
    // `_lamps` survives as the strongest of them, for the handful of readers
    // asking about the evening in general rather than about a particular room.
    let strongest = 0;
    for (const r of homes) if (r.lamps > strongest) strongest = r.lamps;

    // How brightly one lamp is burning is _burn's rule and stays _burn's rule —
    // ONE copy, asked here with the hour just computed rather than the stored
    // one, because the stored one has not been written yet.
    const at = (home) => (home ? lampsOf.get(home) : strongest);
    const item = this.itemLights.map((L) => ({ L, burn: this._burn(L, L.switchedOn, at) }));
    const room = this.roomLights.map((L) => ({ L, burn: this._burn(L, L.on, at) }));

    // ...and how much of it is getting OUT of each building, which is what
    // every warm thing on the outside of one is drawn from. Weighted by reach,
    // because the bulb lights a whole room and the lantern lights a corner.
    //
    // A lamp CARRIED OUT does not count: it is not in the room any more, it is
    // lighting the grass directly, and counting it here as well would have the
    // windows brighten as you walked the lantern away from them. That is what
    // the uLampIn test is — the world's own answer to where the lamp is, rather
    // than the switch's answer to whether it is on.
    const burning = new Map(homes.map((r) => [r.home, 0]));
    for (const { L, burn } of room) {
      if (!L.home || L.home.reach <= 0) continue;
      if (this.lampUniforms.uLampIn.value[L.slot] < 0.5) continue;
      burning.set(L.home, burning.get(L.home) + burn * (L.reach / L.home.reach));
    }
    // `shape` and not `lamps` for the hour, deliberately: that is the dusk
    // curve WITHOUT occupancy folded in. Occupancy already reaches the wired
    // bulb through its own switch, and a lantern somebody left burning in an
    // empty house should still show at the window — that is a house with a
    // light on, whoever is or is not home.
    for (const r of homes) r.lit = shape * Math.min(1, burning.get(r.home));

    return { v, shape, strongest, homes, item, room };
  }

  // ...and writing it. All of it, every time.
  //
  // No guards and no early-outs: this is the half that is allowed to touch the
  // world, and it makes no decisions while doing so. Read top to bottom, it is
  // the whole of what a lamp changes.
  _applyLight(s) {
    this._lampAt = s.v;
    // Kept apart from `_lamps` because the interior needs the two factors
    // separately: how deep into the evening it is, without occupancy in it.
    this._lampShape = s.shape;
    this._lamps = s.strongest;
    for (const r of s.homes) { r.home.lamps = r.lamps; r.home.lit = r.lit; }

    // What a lamp has to say for ITSELF: how bright its own glass looks, and
    // the halo of air around it. Both are emitters, and emitters still add.
    //
    // ...and both are calmed by how dark the room around them is — see
    // FIXTURE_GLOW. `_tintInBase` rather than `tintIn` because the second is
    // written by _syncInterior at the END of this method, so reading it here
    // would be reading the previous frame's hour. They are the same value; only
    // the timing differs.
    //
    // The luminance is of the LINEAR values three stores, which is why the
    // room's midnight comes out around an eighth rather than the four tenths
    // its hex would suggest. That is the honest measure of how much light is in
    // the room, and the floor below is fitted against it.
    const room = this._tintInBase;
    const roomLit = room
      ? Math.min(1, 0.299 * room.r + 0.587 * room.g + 0.114 * room.b)
      : 1;
    const fade = (floor) => floor + (1 - floor) * roomLit;
    const calmHalo = fade(FIXTURE_GLOW.halo);
    const calmGlass = fade(FIXTURE_GLOW.glass);

    for (const { L, burn } of s.item) {
      // The halo is the glare, and it takes the deep end of the calming.
      for (const hh of L.haloes) hh.mesh.material.opacity = burn * calmHalo * hh.alpha;
      // The COLOUR is left on the real burn, deliberately. A lit lamp has to go
      // on looking lit: pulling this toward `off` as well would take a burning
      // bulb back toward the dull glass it wears when switched off, which is
      // the one thing the fixture must never say while it is alight.
      _cA.copy(L.off).lerp(L.on, burn);
      // The baseColor is written and not only the visible colour, because the
      // hour multiplies baseColor into everything indoors — writing only the
      // colour would have _syncInterior put the light out again on the same
      // frame.
      L.glass.userData.baseColor.copy(_cA);
      L.glass.color.copy(_cA);
      // ...and how much of the room's darkness this glass is allowed to wear,
      // which is the exact opposite of how lit it is. A bulb that is OFF is an
      // object in the room and takes the room's colour like the table does; a
      // bulb that is ON is the thing the room's colour is being made BY, and
      // multiplying the dark into it would have the lamp dimmed by the gloom it
      // exists to hold off.
      L.glass.userData.emits = burn;
      // HOW CLEAR it is, not only what colour. A bulb switched off is a shell
      // you see the room through; one alight is a body of light. Held at one
      // opacity it read as a solid ball every morning, which is the one hour a
      // bulb has nothing else to say for itself.
      //
      // Calmed too, but only barely — this is the shallow end. The glass is the
      // fixture itself, and taking it far enough down to matter is what makes a
      // lit bulb read as one going out. It is the halo above that does the work.
      if (L.dim !== undefined) {
        L.glass.opacity = L.dim + (L.bright - L.dim) * burn * calmGlass;
      }
    }

    // How completely each one covers what it reaches. Read by every surface in
    // the world — the room, the grass, whoever is in the doorway between them.
    for (const { L, burn } of s.room) {
      this.lampUniforms.uLampK.value[L.slot] = burn;
    }

    // THE DOORWAYS, which are lights the hour owns rather than lights anybody
    // switches. Nothing about them is in the state above: their colour is the
    // sky's and their coverage is a constant, so there is nothing to decide.
    //
    // Their position is read here rather than in update() because a building
    // does not move, and their colour has to be re-written whenever the hour
    // does — which is the same moment this runs.
    for (const h of this.homes) {
      if (h.doorLight === undefined || !h.door) continue;
      h.door.getWorldPosition(this.lampUniforms.uLampAt.value[h.doorLight]);
      this.lampUniforms.uLampK.value[h.doorLight] = SKY_DOOR.cover;
      // The sky's own colour at the horizon, pulled most of the way to white.
      // Blue-white under a moon, warm at dusk, and at noon it does not matter
      // what it is: the room's dark is white by then and a restore toward
      // anything can only be clamped back to it.
      this.lampUniforms.uLampTarget.value[h.doorLight]
        .copy(this.skyLow).lerp(WHITE, SKY_DOOR.sky);
    }

    // ...and what the buildings show for it, and what the room wears.
    for (const h of this.homes) this._syncGlow(h);
    for (const sp of this.litProps) this._syncLamp(sp);
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
  // HOW BRIGHTLY ONE LIGHT IS BURNING, 0 to 1, and the only place that decides.
  //
  // It was three places — the glass and its halo here, the light the room gets
  // below, and the share that escapes to the windows — each
  // with its own copy of the same expression. Three copies of a rule is three
  // chances for a lamp to be alight in one of them and out in the others, and
  // that had already happened once: the windows went on glowing for a lantern
  // that was in somebody's bag.
  //
  //   present   a lamp that is not IN the world does not light it. The anchor
  //             answers this — see carryLoose and stowLoose, which are what
  //             make it mean "present" rather than "you can see it". A piece
  //             with no loose record, like the bulb wired to the ceiling, is
  //             always present. A lamp in your HAND is present, and lights the
  //             ground you are standing on, which is the point of it.
  //   on        the switch
  //   night     whether the HOUR is allowed to drive this one
  //   manual    whether somebody has taken it off the hour — see toggleLight
  //
  // A LIGHT THAT SOMEBODY HAS TOUCHED OBEYS THEM, at any hour. That is the fix
  // for a real complaint and it is worth stating plainly: `night` used to mean
  // the hour was a MULTIPLIER on the bulb, so at noon its brightness was the
  // hour's 0 however the switch stood — the switch worked, did nothing you
  // could see, and read as broken. `night` now means the hour holds the switch
  // UNTIL somebody else takes it, which is what a wired light in a room with a
  // wall switch actually does. Nobody has to touch it for the house to light
  // itself at dusk, and touching it wins for as long as that evening lasts.
  //
  // `lamps` is how the hour is looked up, and it exists so this rule has ONE
  // copy rather than two. _lightState works out each home's new value before
  // any of it has been written down, so it passes its own resolver; everybody
  // else asks about the world as it currently stands and passes nothing.
  _burn(L, on, lamps = null) {
    if (L.anchor && !L.anchor.visible) return 0;
    if (!on) return 0;
    if (!L.night || L.manual) return 1;
    return lamps ? lamps(L.home) : this._lampsIn(L.home);
  }

  // WORK IT ALL OUT AGAIN AND WRITE IT ALL DOWN, at the hour it already is.
  //
  // The one way back into the lighting for everything that is not the clock: a
  // switch pressed, a lamp picked up or set down, somebody coming home, a
  // lantern crossing a threshold. Every one of those changes an INPUT, and none
  // of them knows or should know which of the outputs it reaches.
  //
  // `_syncItemLights` and `_syncHouseLit` stood here and were exactly that
  // knowledge written down twice: one walked the lamps and then called the
  // other, the other decided what escaped each building and then called back
  // into the props and the glow. Each was reachable from several places, each
  // had its own guard, and keeping them in step meant knowing the order.
  _relight() {
    this._applyLight(this._lightState(this._lampAt));
  }

  // The lights you can reach from where you are standing, nearest first.
  // Distance only — this answers "what could I reach", which is about where
  // your feet are rather than where you are looking.
  //
  // A ceiling light has no bearing of its own (see `ceiling` in the furniture
  // table), so it is reachable from anywhere in the room: you do not walk over
  // to a pull cord on a dome, you are simply under it.
  //
  // SCOPED TO THE ROOM YOU ARE IN, which stopped being free the moment a second
  // room owned a lantern too. The old version walked every room light on the
  // planet and returned the first ceiling fitting it found — so standing in the
  // cave, which has no wired bulb at all, offered you the switch for the bulb in
  // Chiikawa's house twenty units away.
  lightNear(playerDir) {
    const room = this.homeAt(playerDir);
    if (!room) return null;
    for (const L of this.roomLights) {
      if (L.home === room && L.ceiling) return L;
    }
    const reach = Math.cos(CONFIG.uniques.reach / CONFIG.globe.radius);
    for (const l of this.loose) {
      if (!l.anchor.visible) continue;
      const L = this.lightAt(l.anchor);
      if (L && L.home === room && playerDir.dot(l.dir) > reach) return L;
    }
    return null;
  }

  // WHICH LIGHT A PIECE IS, given the group it hangs on.
  //
  // The anchor is the identity, and it had to become one. Every one of these
  // used to be found by its `art`, which was a perfectly good name while no two
  // pieces in the world shared one — and Hachiware's cave has a lantern in it,
  // so the house's lantern and his are now two objects called `lantern`.
  // Keying on the string meant flipping the switch on Chiikawa's table also put
  // out a lamp on the far side of the planet. An anchor is one group in one
  // room and can never be two.
  lightAt(anchor) {
    return this.roomLights.find((L) => L.anchor === anchor) || null;
  }

  // Flip a light, named by its room-light record. Both lists carry the same
  // anchor, so one call moves the glass, the pool, the halo and the light it
  // casts on the room together — and a light and its own glow can never
  // disagree about being on.
  // SET FROM WHAT THE BUTTON SAYS, not flipped from the field underneath it,
  // and those came apart the moment the hour was allowed to hold a switch. The
  // bulb by day sat with `switchedOn` true and burning nothing: the label read
  // 「けす」 over a light that was visibly out, and pressing it flipped the
  // field to false — still out, still nothing to see. Press again and it went
  // back to true, still out. That is the whole of "I cannot turn the bulb on
  // except at night", and it was never the light refusing; it was two truths
  // called `on` disagreeing about which one the button was for.
  //
  // So the verb decides: pressing means "make it the other of what it looks
  // like", and `manual` records that a person rather than the hour last spoke.
  toggleLight(L) {
    if (!L) return null;
    const on = !this.lightIsOn(L);
    for (const x of this.itemLights) {
      if (x.anchor !== L.anchor) continue;
      x.switchedOn = on;
      x.manual = true;
    }
    L.on = on;
    L.manual = true;
    this._relight();
    return on;
  }

  // Whether a lamp is STANDING IN a given home at this moment.
  //
  // Not where it was built, which is what `L.home` records and what makes it
  // the wrong question here: a lantern is a thing you can pick up, and one in
  // somebody's hand on the far side of the planet is not a light anybody in
  // that room can reach the switch of. Asked of where the anchor actually is,
  // so a lamp carried out stops counting the moment it crosses the wall and
  // starts again when it is brought back.
  lampIsIn(L, home) {
    if (!L || !home || home.wallCos === undefined) return false;
    L.at.getWorldPosition(_sleepAt).sub(this.world.position).normalize();
    return _sleepAt.dot(home.sprite.normal) > home.wallCos;
  }

  // Every lamp burning in a home right now, for somebody about to turn them
  // off on their way to bed. See MIDNIGHT_SLEEP.md: this is a list of switches
  // a hand is about to flip, which is why it is a list of lights rather than
  // anything that could be mistaken for a policy.
  lampsBurningIn(home) {
    return this.roomLights.filter(
      (L) => this.lightIsOn(L) && this.lampIsIn(L, home),
    );
  }

  // Whether it is GIVING LIGHT, which is the question the button is asking on
  // behalf of somebody standing in the room looking at it — not the state of a
  // field. See toggleLight for what went wrong while these were the same thing.
  lightIsOn(L) {
    if (!L) return false;
    const x = this.itemLights.find((y) => y.anchor === L.anchor);
    return (x ? this._burn(x, x.switchedOn) : this._burn(L, L.on)) > 0.001;
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

    // THE OCCUPANCY LEAN IS GONE, and it is not a feature that was dropped —
    // it is one the model now gets for nothing.
    //
    // An empty house at midnight had its whole interior leaned toward a dimmer
    // grey here, so that somebody looking through the door saw a dark room
    // rather than a hearth burning for no one. That was necessary while the
    // room had a brightness of its own: the tint held the place up, so an
    // unoccupied room had to have the tint taken down.
    //
    // A room has no brightness of its own now. It is dark, and every lit thing
    // in it is a lamp. Nobody home means the lamps are off — which _burn
    // already decides, from the same occupancy this was reading — and a room
    // with its lamps off is dark BECAUSE nothing is lighting it, not because a
    // second rule dimmed it for the same reason a moment later.
    //
    // What it removes is a real confusion, not just a line: with both in play,
    // occupancy was simultaneously a switch policy and a brightness dial, and
    // the two disagreed. A lantern left burning in an empty room lit its own
    // circle honestly and then had the whole room, its circle included, leaned
    // dimmer underneath it.

    // The room's dark, in one write — see _installHourTint, and the note beside
    // its twin in _applyBlend.
    this.darkIn.value.copy(this.tintIn);

    // ...and the handful this cannot be done for, still written one at a time.
    //
    // A lamp's own glass does not wear the room's dark; it wears the dark
    // lerped toward white by how brightly the lamp is burning, which is a
    // different colour per lamp and moves with a switch rather than with the
    // hour. A shared uniform is exactly the wrong shape for that, so the glass
    // keeps the loop it always had. See the note where `emits` is written.
    for (const m of this._hourGlass) {
      const base = m.userData.baseColor;
      const emits = m.userData.emits;
      if (emits > 0) {
        _cC.copy(this.tintIn).lerp(WHITE, emits);
        if (base) m.color.copy(base).multiply(_cC);
        else m.color.copy(_cC);
        continue;
      }
      if (base) m.color.copy(base).multiply(this.tintIn);
      else m.color.copy(this.tintIn);
    }
    this._syncRoomShade();
    // ...and whoever is home, who are allowed to CHEAT.
    //
    // The one place in the app where a thing deliberately refuses the light it
    // is standing in, and it is not a fudge — it is what the reference art
    // does. A character in a dark room is drawn very nearly as bright as a
    // character in a lit one, because the eye is meant to be on them and a face
    // that has gone the colour of the wall behind it has stopped being a face.
    // Anime lights a cast by what matters rather than by where the lamps are.
    //
    this.tintCast.copy(this.tintIn).lerp(WHITE, CAST_LIFT.in);
    for (const ch of this.cast) {
      const amt = this.insideAmount(ch.dir);
      ch.lightDark.value.copy(this.tintCastOut).lerp(this.tintCast, amt);
      ch._wasInside = amt;
    }
    // ...and whatever is lying about, which wears whichever of the two hours it
    // is standing in. Here at the tail of the tinting because that is what it
    // is, and after the cast because it reads the same two colours they do.
    this._syncLoose();
  }

  // `_syncPerch` stood here and is gone with the stamps it chose between.
  //
  // A lamp on a floor had a curved pool cut to the planet's radius; the same
  // lamp set down on a table had that cap riding at table height, a ring of
  // light hanging in the air lighting nothing — so a second, flat stamp existed
  // for that case and this method watched the lamp's altitude to decide which
  // of the two was showing, re-measuring the surface underneath every frame in
  // case a bear had been put on the same table.
  //
  // All of that was the cost of painting light onto a SURFACE, which forces
  // somebody to know which surface. The disc is a distance in three dimensions
  // from the lamp to whatever is being drawn: a tabletop the lamp is standing
  // on is close to it, so it is lit, and the floor a further drop below is
  // further away, so it is less lit. Nothing has to be told what the lamp is
  // standing on, and nothing can be told wrongly.

  // The patches of shade under the furniture, which get LIGHTER as the room
  // gets darker.
  //
  // That reads backwards for a second and is the whole point. These stamps are
  // not cast shadows — nothing here casts anything — they stand in for ambient
  // occlusion: the corner under a table is dark because the light that would
  // have reached it is blocked, and how dark depends entirely on how much light
  // there was to block. They were painted at a flat 0.42 for a room that sat at
  // six sevenths of daylight all night, and when that room went to a third they
  // stayed exactly as black. On boards lit by one lamp, a fixed 42% stamp under
  // every cushion, stool and teapot stops reading as shade and starts reading as
  // holes cut in the floor — which is what they look like in a dark room.
  //
  // So they scale with the room's own light. At noon the tint is white, the
  // multiplier is 1 and nothing about the day changes; at night there is a
  // third of the ambient and a third of the shade to go with it. The lamps are
  // deliberately NOT in this: a lamp is a point in the room, and what it does
  // to the floor is add a pool on top — brightening a shadow rather than
  // deciding whether there is one.
  // Encoded back to sRGB before it is used, and that is not a nicety. A
  // THREE.Color holds LINEAR values — #5B5E64 goes in and comes back out as
  // 0.107, not the 0.357 the hex reads — so a luminance taken straight off the
  // channels is a linear one, and using it here scaled the stamps by 0.11 where
  // the eye expects 0.37. Measured: 0.047 of opacity instead of 0.155, which is
  // not a softened shadow, it is no shadow at all. The 1/2.2 puts it back in
  // the space the alpha is actually blended in.
  _syncRoomShade() {
    const t = this.tintIn;
    const lin = 0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b;
    const lit = Math.pow(Math.max(0, Math.min(1, lin)), 1 / 2.2);
    for (const s of this.interiorShade) s.mat.opacity = s.alpha * lit;
  }

  // What a loose piece wears: the room's hour if it is in the room, the sky's
  // if somebody has carried it out.
  //
  // Both of the lists this used to be on decide that once and for all at build
  // time, which is correct for a table and false for a bear. Set one down on
  // the grass and it went on wearing the room's midnight — a DARKER colour than
  // the moonlight around it, so the thing you had just put down was the one
  // thing on the hillside that had got no lighter for being outside.
  //
  // No cast lift: these are objects, not faces. A bear on the grass at night is
  // meant to be a dim bear, and the lamp you set beside it is what makes it a
  // lit one — which is the whole point of the lamp being something you carry.
  _syncLoose() {
    for (const L of this.looseLit) {
      // The same fraction its lamp mask reads, so a bear carried through the
      // door changes hour at the rate it changes rooms. One write for the whole
      // piece now — its materials all read this one uniform.
      L.dark.value.copy(this.tint).lerp(this.tintIn, L.side.value);
      // ...except a lamp's own glass, which is exempt in proportion to how lit
      // it is, exactly as it is indoors — see the note where `emits` is
      // written. Without this, carrying a burning lantern into the dark would
      // have the gloom multiplied into the one surface that is supposed to be
      // beating the gloom.
      //
      // It stays on the CPU for the reason the room's glass does: this is a
      // different colour per lamp that moves with a switch, so a uniform shared
      // by the whole piece is the wrong shape for it. It is also the one
      // material here that _wearHour deliberately did not patch, so writing its
      // colour is the whole of what it wears.
      const m = L.glass;
      if (!m) continue;
      const emits = m.userData.emits;
      const base = m.userData.baseColor;
      if (emits > 0) {
        _cC.copy(L.dark.value).lerp(WHITE, emits);
        if (base) m.color.copy(base).multiply(_cC);
        else m.color.copy(_cC);
      } else if (base) {
        m.color.copy(base).multiply(L.dark.value);
      } else {
        m.color.copy(L.dark.value);
      }
    }
  }

  // What is in your hand wears the hour you are standing in.
  //
  // The hand holds two kinds of thing and only one of them was ever told the
  // time. A drawing goes on a card whose single material has been on the tint
  // list since hand.js was written — its own note says a fish held up at night
  // should be moonlit like everything else out there. A built piece — the bear,
  // the kettle, the lamp — arrives with materials made fresh by the hand's
  // builders, and those were on no list at all, so it kept its full daylight
  // colour at midnight and read as the brightest thing on the screen.
  //
  // Both are written from here, every frame, and that also quietly fixes the
  // card: `tintables` is the OUTDOOR list, so a fish carried into the house
  // used to go on wearing the sky. Whatever is in your hand is in the room with
  // you, and now wears the room.
  //
  // No cast lift. A held thing is an object, and the lamp you are carrying in
  // the other hand is what it is for.
  _syncHeld(anchor) {
    if (!this.hand) return;
    // Blended by how far through the door you are, so the thing in your hand
    // changes with the walk rather than on one frame of it. It is the closest
    // object to the eye and the largest on screen, which makes it the single
    // worst place in the app for a colour to jump.
    const amt = anchor ? this.insideAmount(anchor) : 0;
    _cC.copy(this.tint).lerp(this.tintIn, amt);
    // The card's own hour is a uniform now, so a lamp can lift it — the point
    // of a portable lantern is that it lights what you are carrying in the
    // other hand. `_handSide` follows it in update().
    if (this._handDark) this._handDark.value.copy(_cC);
    // A BUILT piece in the hand is still written the old way, and this is the
    // one place left in the app where the hour is multiplied on the CPU.
    //
    // It is not an oversight. These materials are made fresh by the hand's own
    // builders every time you pick something up (see hand.js), so there is no
    // stable material to patch and nothing to hang a uniform off — and the
    // thing they belong to is nine centimetres from the eye, held in front of
    // whatever you are looking at. A lamp restoring it would be restoring
    // something that is not really in the world.
    for (const m of this.hand.heldMats) {
      m.color.copy(m.userData.baseColor).multiply(_cC);
    }
  }

  // ...and the same for what one of the CAST is carrying — a lent sasumata, the
  // lamp somebody walked off with, and your own body's copy once you are high
  // enough to see it.
  //
  // IT TAKES THE LAMPS, and for a while it did not. This was written as a plain
  // CPU tint alongside the one for the piece in your hand, on the stated
  // reasoning that the carry builders make their materials fresh so there is no
  // stable material to patch. That is true of nothing here: `carriedPiece` in
  // main.js caches one mesh per item and hands the same one out forever. So the
  // materials were stable all along, and the cost of believing otherwise was a
  // lit character carrying an unlit object — measured in a fully lamplit room
  // at #4B4331 against a base of #D5B57E, which is to say a lantern in its own
  // circle of light rendering at the darkness of an unlit corner.
  //
  // The hand keeps the CPU path deliberately. What you hold is nine centimetres
  // from the eye, in front of whatever you are looking at, and restoring it
  // would be lighting something that is not really in the world; a piece a
  // character is carrying is out there in the room with everything else. The
  // two use different caches — `handMeshes` by art, `carryMeshes` by item — so
  // neither can reach the other's materials.
  //
  // THE UNIFORMS BELONG TO THE PIECE, NOT TO THE CARRIER, and that is the whole
  // subtlety of doing this lazily. A `dark` handed over at patch time is baked
  // into the compiled shader and cannot be re-pointed afterwards — so binding a
  // character's own would leave the sasumata lit by whoever happened to pick it
  // up first, forever. Each piece gets its own pair on first sight and whoever
  // is holding it writes them; only one holder is possible at a time.
  //
  // THE OBJECT TINT AND NOT THE CAST'S, which survives the rewrite unchanged. A
  // character is a drawing and gets a lift so their face stays readable after
  // dark — see CAST_LIFT — and a sasumata is not a face. Given its carrier's
  // colour it would be the brightest thing on a midnight hillside, held by
  // somebody who is not.
  //
  // Skipped outright for the empty-handed, which is nearly everybody nearly
  // always: `heldMats` is an empty array until something is put in their hands.
  // ONE MATERIAL IN EVERY CARRIED PIECE IS NOT ITS OWN, and it has to be left
  // strictly alone. `carriedPiece` does not clone: measured across the teapot,
  // the bear and the lantern, each has exactly one material shared with the
  // room — the near-black ink at #2E2422, a module-level singleton every stick
  // of furniture in the house is drawn with, already patched and already
  // wearing `darkIn`. Writing its colour or its uniform from here repaints the
  // dark trim on every table and shelf in the building for as long as somebody
  // is carrying something.
  //
  // Which is exactly what the CPU version of this method was doing. It wrote
  // `m.color = base × tint` over every held material including that one, and a
  // patched material must keep its colour AT the base or the shader multiplies
  // the hour in twice. So the room quietly darkened its own woodwork whenever a
  // character picked anything up. Skipping what this method does not own fixes
  // that as a side effect of doing the main thing correctly.
  //
  // The shared ink keeps the room's dark wherever the piece goes, which is a
  // shrug: it is #2E2422, and the difference between one darkness and another
  // on a colour that near black is not a thing anybody can see.
  _syncCastHeld() {
    for (const ch of this.cast) {
      if (!ch.heldMats.length) continue;
      const amt = this.insideAmount(ch.dir);
      for (const m of ch.heldMats) {
        if (!m.userData.hourDark) {
          this._wearHour(m, {
            dark: { value: new THREE.Color(0xffffff) },
            mask: 'side',
            side: { value: amt },
            tag: 'carried',
          });
          // Ours, and the only ones this method may write to afterwards.
          m.userData.hourCarried = true;
        }
        if (!m.userData.hourCarried) continue;
        m.userData.hourDark.value.copy(this.tint).lerp(this.tintIn, amt);
        m.userData.hourSide.value = amt;
      }
    }
  }

  // Which set of lamps one of the cast is standing among: the house's, seen
  // from the grass, or the room's, seen from the rug. Written to the switch
  // _wearHour left on the character, which exists from the moment they join
  // rather than from the moment they are first drawn.
  //
  // Guarded, because a character can be added before the lamp machinery has any
  // lights to give — a planet with no house patches nothing at all.
  _castSide(ch) {
    if (ch.lightSide) ch.lightSide.value = this.insideAmount(ch.dir);
  }

  // WHICH ROOF a surface direction is under, or null — the one question that
  // separates indoors from out, asked by the tinting here and by the controls
  // in main.js. There is no stage flag and no mode: being inside is where you
  // are standing, nothing more.
  //
  // It answers with the HOME rather than with a boolean because callers that
  // care almost always then want to know which one — whose interior group to
  // parent a dropped bear to, whose door a guest should leave by. isInside
  // keeps the boolean for the many callers that genuinely only want yes or no.
  //
  // Two buildings is not a loop worth worrying about: it is one dot product
  // each, on a list of two, and the alternative — caching the nearest home per
  // frame — would be a second thing to keep in step for no measurable gain.
  homeAt(dir) {
    for (const h of this.homes) {
      if (h.wallCos === undefined) continue;
      if (dir.dot(h.sprite.normal) > h.wallCos) return h;
    }
    return null;
  }

  isInside(dir) {
    return this.homeAt(dir) !== null;
  }

  // ...and the same question as a FRACTION, which is what the lighting asks.
  //
  // 0 out on the grass, 1 in the room, and the wall's own thickness in between.
  // Everything above this is a threshold and rightly so — a step through a
  // doorway either happened or it did not, and the collision, the controls and
  // which group an anchor is parented to all want a yes or a no. Light does
  // not. A lamp in a doorway is genuinely lighting both the room and the lawn,
  // and a body in a doorway is genuinely half in each.
  //
  // Asked for because the door was a light switch you walked through: on the
  // one frame the arc crossed, a carried lamp changed which world it lit, the
  // thing in your hand changed which hour it wore, and the room's near-white
  // walls arrived all at once. Three step functions on the same frame, which is
  // most of what "the house is another area" was describing.
  //
  // Smoothstepped rather than linear so it leaves and arrives at rest — a
  // linear ramp has a corner at each end, and a corner in a brightness is a
  // thing the eye finds even when it cannot say what it found.
  // The STRONGEST answer over every home, which with two buildings twenty units
  // apart is the only sensible reading: their wall bands cannot overlap, so at
  // most one of them is ever nonzero and the max is simply "whichever room you
  // are in or at the door of".
  insideAmount(dir) {
    let best = 0;
    for (const h of this.homes) {
      if (h.wallInnerCos === undefined) continue;
      const along = dir.dot(h.sprite.normal);
      if (along <= h.wallCos) continue;
      if (along >= h.wallInnerCos) return 1;
      const t = (along - h.wallCos) / (h.wallInnerCos - h.wallCos);
      const v = t * t * (3 - 2 * t);
      if (v > best) best = v;
    }
    return best;
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
  //
  // `over` eased from 1.28 to 1.10 when the room behind it went properly dark.
  // The overdrive was doing a job that no longer needs doing: with a near-white
  // interior there was nothing much to see through an opening, so the frame
  // around it had to carry the whole "somebody is home" signal by clipping.
  // What you look through now is a genuinely lamplit room against genuinely
  // dark walls, and that is a better signal than a blown-out frame — at 1.28
  // the frame was the brightest thing on the building and the light it promised
  // was brighter than the light inside it.
  //
  // PER HOME, because the two of them are lit by different lamps. Sharing one
  // value was invisible while there was one building and would be plainly
  // wrong with two: Hachiware's lantern burning in the cave would put a warm
  // glow round Chiikawa's empty doorway, twenty units away and across the
  // terminator.
  _syncGlow(h) {
    const over = 1.10;
    _cA.copy(this.tint);
    _cB.set(PAL.lampGlow).multiplyScalar(over);
    _cA.lerp(_cB, h.lit);
    for (const m of h.glow) m.color.copy(_cA);
  }

  // `_syncHouseLit` stood here — how much light is getting OUT of a building,
  // which is what every warm thing on the outside of one is drawn from: the
  // glow on the window frames, the bloom over the door, and the warm the
  // building adds to whatever is standing near it.
  //
  // The rule moved into _lightState unchanged and the notes with it. What is
  // worth keeping here is the bug it was written for, because it is the clearest
  // case in the file of a lamp being alight in one place and out in another: it
  // used to read `_lamps`, which is the HOUR — how late it is and whether
  // anybody is home. That was the same question as "what is burning in there"
  // right up until the lamps grew switches. After that, a house with every
  // light turned off went on advertising itself across the planet, measured
  // with both lights off and the frames still sitting at #FFDD8F, a full warm
  // yellow on a dark house.
  //
  // Its other lesson is in _lightState's uLampIn test: a lamp that is switched
  // on and whose last known position is indoors can still be in somebody's bag.
  // Measured, with the bulb off and the lantern stowed, the room's own light
  // correctly fell to 0 while the windows went on showing 0.418 of warm to the
  // whole planet — because that loop asked the switch rather than the world.

  // How lit the windows are for a reason that has nothing to do with the hour:
  // whether anybody is in. 1 is a full room, and household.js eases it down to
  // a porch light when the last of them leaves.
  //
  // It multiplies the hour's own curve rather than replacing it, so an empty
  // house at noon is still an unlit house — occupancy decides how bright the
  // lamps are, never whether it is dark enough to want them.
  //
  // `f` is a map from home style to how full that home is, or a bare number
  // meaning all of them. household.js sends the map; anything simpler that
  // wants to dim every window at once can still send a number.
  setOccupancy(f) {
    let moved = false;
    for (const h of this.homes) {
      const v = typeof f === 'number' ? f : (f[h.style] !== undefined ? f[h.style] : h.occupancy);
      if (v === h.occupancy) continue;
      h.occupancy = v;
      moved = true;
    }
    if (!moved) return;
    this._setLamps(this._lampAt);
  }

  // The evening as one room sees it: how late it is, times how full that room
  // is. A lamp with no home — which cannot currently happen — falls back to the
  // strongest, so an orphan light is at worst as bright as the brightest room
  // rather than permanently dark.
  _lampsIn(home) {
    return home ? home.lamps : this._lamps;
  }

  // The lit half of one prop. Both the things that can hide it run through
  // here — the lamps being down, and the horizon having swallowed the house
  // they belong to — because a `.visible` flag with two owners is a flag that
  // eventually gets stuck on.
  _syncLamp(s) {
    const { night, bloom, slot } = s.lit;
    // Everything here is what ESCAPES the building, so all of it reads the
    // home's own `lit` — what is burning inside THIS one — rather than
    // `_lamps`, which is only the hour. See _lightState.
    //
    // A lit prop with no home cannot currently happen (NIGHT_ART and
    // CONFIG.homes name the same two types), but the fallback is 0 rather than
    // a throw: an unclaimed lamp should go dark, not take the frame with it.
    const houseLit = s.home ? s.home.lit : 0;
    const on = s.seen && houseLit > 0;
    // How completely this building's escaped light covers what it reaches. Not
    // gated on `seen`: that flag is about the card for this house having gone
    // over the horizon, and a bush a few paces the near side of it is still
    // stood in the light.
    //
    // `houseLit` straight through, with no strength multiplied into it. There
    // used to be one — LAMP_LIT.strength, 0.24, "what the same light adds to
    // anything standing in it", explicitly set below the pool's own alpha
    // because the pool is seen at a grazing angle and a card is seen face-on.
    // A restore needs no such number: the grass beside a lit window is returned
    // toward its own daylight and stops there, and how far it gets is the disc,
    // not a coefficient somebody fitted against a decal.
    //
    // What it does need is a CEILING, which is a different thing and arrived
    // later — see SPILL_COVER. `houseLit` says how much is burning in there;
    // this says that even a room ablaze does not return the lawn all the way to
    // noon.
    this.lampUniforms.uLampK.value[slot] = houseLit * SPILL_COVER;
    // A retired card never comes back, whatever the hour does. The house is
    // geometry now and its night sheet is kept only so this machinery still has
    // the object it expects to find; showing it would hang the old drawing in
    // the air beside the building.
    night.visible = on && !s.retired;
    bloom.visible = on;
    if (!on) return;
    night.material.opacity = houseLit;
    // The bloom's own brightness is not the lamps alone any more — it also
    // depends on how far off you are standing. Written in one place so the
    // per-frame fade and this cannot disagree.
    this._syncBloom(s);
  }

  // The glow in the air over the door, faded out as you walk up to it.
  //
  // The bloom is a BEACON: it exists so a lit house reads as lit from the far
  // side of the planet, and at that range it is the only thing doing that job.
  // Up close it is a lie, and it became a measurable one the moment the room
  // behind it went dark — the doorway measured 226 of luminance from outside
  // against a room that averages 135. You saw a blazing warm opening, stepped
  // through it, and arrived somewhere greyer than the door had promised.
  //
  // Fading it over the approach keeps the story and drops the lie: from across
  // the meadow the glow is what draws you, and by the doorstep it is gone and
  // what you are looking at is the actual lamplit room through an actual hole.
  // Nothing about the room changes as you walk — only the overlay in front of
  // it stops standing in for what is behind.
  //
  // Measured to the ANCHOR rather than to the door itself, which is a hair
  // cruder and a good deal steadier: the door's own group swings round the
  // shell as the building is placed, and a fade that moved with it would
  // brighten and dim as you circled the house at a constant distance.
  _syncBloom(s) {
    if (!s || !s.lit) return;
    const b = LAMP_BLOOM;
    _bloomAt.copy(s.anchor.position).add(this.world.position);
    const d = this.camera.position.distanceTo(_bloomAt);
    const f = Math.max(0, Math.min(1, (d - b.near) / (b.far - b.near)));
    s.lit.bloom.material.opacity = (s.home ? s.home.lit : 0) * b.alpha * f;
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
    // The shove's own feel — reach, speed and damping — is the same in both
    // rooms and is read off the first, since a toy on a stone floor and a toy
    // on boards are not different physics. What is NOT shared is the wall the
    // clamp below measures against, which is asked of whichever room the piece
    // is actually in.
    const cfg = CONFIG.homes[0].spec;
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
      //
      // The BODY rather than the anchor, now that a carried piece keeps its
      // anchor so its light can follow you. What you may kick is what you can
      // see, which is the honest reading of this test and always was.
      if (!n.anchor.visible || (n.body && !n.body.visible)) continue;
      // ...and not while it is standing where it was PROPPED — at home or at
      // any other bit of wall somebody stood it against. A propped piece is
      // not lying about in the way, it is leaning on something, and a shin
      // does not knock a sasumata off a wall, it brushes past it. This is the
      // one loose piece that is furniture until you deliberately pick it up.
      //
      // The alternative was tried in the head and rejected: letting a kick
      // topple it makes the room's tidiest object its most fragile, and the
      // reset for that (walk it back, set it down on its spot) is a chore
      // rather than a gag. The bear IS the gag — a thing on the floor that
      // scoots when you shuffle into it — and the difference between the two
      // is exactly the difference this flag names.
      //
      // Only the stance is protected, never the piece: set one down out on
      // the floor, or out on the grass where there is no wall to lean on,
      // and it is as kickable as anything else lying there. Standing it
      // against a wall again is what makes it furniture again.
      if (n.propAt !== null && n.homeLean) continue;
      const gap = at.angleTo(n.dir) * R;
      if (gap < n.reach) {
        // A perched item's authored home lift belongs only to its home spot.
        // Once it is actually shoved, it has left that arrangement and falls
        // back to the floor like any other loose piece.
        n.atHome = false;
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

      // It may not leave the room — IF IT IS IN THE ROOM. The wall is where
      // the walk stops, less its own reach, so the bear fetches up against the
      // skirting rather than half inside it — and the outward part of its
      // travel is dropped instead of reflected, because a toy shoved at a wall
      // stops there. It does not bounce off somebody's wall like a billiard
      // ball.
      //
      // The IF arrived with the carryable uniques and is not optional. This
      // clamp was written when every loose piece lived indoors, and it reads
      // "too far from the house's middle" as "against the skirting" — which,
      // asked about a bear set down half a world away and then brushed by
      // somebody's knee, was out by half a world: the touch teleported it to
      // the room's rim. A piece standing outside is simply outside, and where
      // it may roam is the meadow's business, not the wall's.
      // "In the room" is the wall-arc question everything else asks —
      // isInside, not a band of distances, so a piece stood just past the
      // doorstep cannot be caught by the clamp and pulled in through the
      // masonry.
      //
      // Measured against WHICHEVER room it is in — `homeAt` answers with the
      // building or with null, which is the same wall-arc test isInside makes
      // and folds the "is it indoors at all" guard into the same lookup.
      // THE PROPS, INDOORS AND OUT, in one call — because `inSolid` is one list
      // and always was. The trees and stumps were registered with the scatter
      // and the furniture appended once the rooms were built (see addSolids), so
      // a bear fetching up against a table leg and one fetching up against a
      // trunk are the same question asked of the same array.
      //
      // It used to run only outdoors, which was not a decision so much as where
      // the line happened to fall: the outdoor fence was written when the shove
      // was first let out of the house, and indoors kept only the wall clamp it
      // had always had. So a piece scooting across a room passed clean through
      // the table, the chest and the bed — every solid thing in it — and stopped
      // only at the skirting.
      this._fendSolids(n);

      const room = this.homeAt(n.dir);
      if (room) {
        const N = room.sprite.normal;
        const out = N.angleTo(n.dir) * R;
        const rim = room.spec.walk - n.reach;
        if (out > rim) {
          _looseOut.copy(n.dir).addScaledVector(N, -n.dir.dot(N));
          if (_looseOut.lengthSq() > 1e-12) {
            _looseOut.normalize();
            const arc = rim / R;
            n.dir.copy(N).multiplyScalar(Math.cos(arc))
              .addScaledVector(_looseOut, Math.sin(arc)).normalize();
            const into = n.vel.dot(_looseOut);
            if (into > 0) n.vel.addScaledVector(_looseOut, -into);
          }
        }
      } else {
        // ...AND THE WATER, for a piece out on the grass. The clamp above is the
        // room's wall and a bear in a meadow has no wall, but it does have a
        // shore — and setting a piece down past one is already forbidden: on
        // open water a tap is ぽちゃん, the pond keeps it a moment and it finds
        // its way home (see putDownUnique), and on ice the set-down is refused
        // outright, because a lantern left on a frozen pond is floating in open
        // water twenty minutes later. A shin that could shove one out there
        // would be a way round both rules.
        //
        // The trunks used to be fenced here too, and have moved up to
        // `_fendSolids` above, which does the same job for both sides of a wall.
        //
        // Same move as the room's clamp: put it back on the legal side and drop
        // the part of its travel that was heading in, because a toy shoved at
        // something fetches up against it rather than bouncing off. Only ever
        // reached by a piece already in motion — a resting one is skipped well
        // above — so nothing standing legitimately still is ever pushed about.
        //
        // The ice is ground, and a bear scooting across a frozen pond is a
        // better joke than a fence. `isWater` is the one place that is decided.
        if (isWater(n.dir, CONFIG.player.shoreKeep)) {
          for (const lake of CONFIG.lakes) {
            if (!inLake(n.dir, lake, CONFIG.player.shoreKeep)) continue;
            dirFromLatLon(lake.lat, lake.lon, _looseC);
            _looseOut.copy(n.dir).addScaledVector(_looseC, -n.dir.dot(_looseC));
            if (_looseOut.lengthSq() < 1e-12) {
              // Dead in the middle, so no bearing to leave along; any will do.
              localFrame(_looseC, _looseE, _looseN);
              _looseOut.copy(_looseN);
            }
            _looseOut.normalize();
            // How far the shore is ALONG THIS BEARING — a lake is an ellipse
            // with a wobbled rim, so "out" is a different distance every way.
            const edge = lakeReach(lake, _looseOut, CONFIG.player.shoreKeep);
            n.dir.copy(_looseC).multiplyScalar(Math.cos(edge))
              .addScaledVector(_looseOut, Math.sin(edge)).normalize();
            // `_looseOut` points OUT of the water here, where the room's points
            // out toward its wall — so it is the inward half that is dropped,
            // and the sign flips with it.
            const into = n.vel.dot(_looseOut);
            if (into < 0) n.vel.addScaledVector(_looseOut, -into);
          }
        }
      }

      n.vel.multiplyScalar(Math.exp(-dt * 1000 / cfg.nudgeDamp));
      n.place();
      // A scoot can carry it over the threshold — through the door in either
      // direction — and its parent group has to cross with it, or a piece
      // shoved out onto the grass would still hide with the room. Same rule as
      // placeLoose, which is the point.
      this._parentLoose(n);
    }

    // ...and finally the pieces against EACH OTHER, once every one of them has
    // finished moving. After the loop rather than inside it, because a pair is
    // not a property of either half: resolving a against b while b has yet to
    // take its own step this frame would measure the overlap against a position
    // b is about to leave.
    this._separateLoose();
  }

  // Push a moving piece off any prop it has scooted into, and drop the part of
  // its travel that was heading in — the same two-part move the room's wall
  // clamp makes, for the same reason: a toy shoved at something fetches up
  // against it rather than bouncing off.
  //
  // ONE prop, not all of them. `inSolid` hands back the first it finds, and a
  // frame's shove is a few hundredths of a unit, so a piece is only ever a hair
  // inside one thing — there is no case here where it is deep in two at once.
  // (There is one where ejecting from A lands inside B, which needs A and B to
  // overlap; see auditSolids in sphere.js, which exists to tell you they do.)
  //
  // Asked at the FLOOR, which is where a shoved piece is: `place()` does not
  // re-apply the perch lift that putDownUnique added, so anything knocked off a
  // table is already back at ground level by the time this runs, and a solid
  // with a `top` is something it must go round rather than something it is on.
  _fendSolids(n) {
    const hit = inSolid(n.dir, 0, 0);
    if (!hit) return;
    _looseOut.copy(n.dir).addScaledVector(hit.dir, -n.dir.dot(hit.dir));
    if (_looseOut.lengthSq() < 1e-12) {
      // Dead on its centre, so no outward bearing to compute — and the one
      // place none is needed, since every direction leads out of a circle's
      // middle. The same fallback keepOffSolids and keepOutside both carry.
      localFrame(hit.dir, _looseE, _looseN);
      _looseOut.copy(_looseN);
    }
    _looseOut.normalize();
    // Never exactly ON the rim: `inSolid` is a strict inequality, and a piece
    // left on the line reads as inside to the next frame's test. Same epsilon
    // the ejections in sphere.js use, and for the same reason.
    const edge = hit.r + 1e-5;
    n.dir.copy(hit.dir).multiplyScalar(Math.cos(edge))
      .addScaledVector(_looseOut, Math.sin(edge)).normalize();
    const into = n.vel.dot(_looseOut);
    if (into < 0) n.vel.addScaledVector(_looseOut, -into);
  }

  // WHICH LOOSE PIECES ARE IN PLAY for the two rules that treat them as objects
  // in their own right rather than as things underfoot — the separation below
  // and the perch-occupancy test. Visible, and not standing propped against a
  // wall, which are the same two gates the shove itself opens with.
  _looseInPlay(out) {
    out.length = 0;
    for (const n of this.loose) {
      if (!n.anchor.visible || (n.body && !n.body.visible)) continue;
      if (n.propAt !== null && n.homeLean) continue;
      out.push(n);
    }
    return out;
  }

  // TWO THINGS MAY NOT BE IN THE SAME PLACE, which until now they cheerfully
  // were: nothing anywhere tested a loose piece against another one, so a bear
  // and a teapot set down on the same patch stood inside each other, and a
  // shoved one slid straight through whatever it met.
  //
  // Discs on a sphere, like every other collision in this world — no solver, no
  // iteration, one pass over a list that is a handful long. The pair separates
  // along the great circle between them, each giving up half the overlap, which
  // is the only split that does not have to decide which of them was there
  // first.
  //
  // HOW BIG IS A PIECE. Half its own `reach`, so a pair settles exactly `reach`
  // apart — the same number that decides whether your feet are touching it. That
  // is deliberate rather than convenient: `reach` is already this file's
  // definition of "close enough to be in contact with", and giving contact
  // between two toys a second, differently-tuned number is how the two drift.
  //
  // THE MOMENTUM HANDOFF is what makes it read as a knock rather than as two
  // cards refusing to overlap. Whatever closing speed the pair has along that
  // line is taken off the one behind and given to the one in front, less
  // LOOSE_PASS — so running the bear into the teapot sends the teapot off and
  // pulls the bear up short, and a chain of three settles instead of ringing.
  //
  // BOTH AT HOME IS LEFT ALONE, and that exception is load-bearing. The authored
  // arrangements put pieces deliberately close — a teapot beside a book on the
  // same table — and those spots are measured. A rule that shoved them apart on
  // the first frame would quietly rearrange every room in the game at boot. Only
  // once a player has actually moved one (`atHome` goes false at the first shove
  // and at every set-down) does the pair become theirs to resolve.
  _separateLoose() {
    const list = this._looseInPlay(_sepList);
    if (list.length < 2) return;
    const R = CONFIG.globe.radius;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.atHome && b.atHome) continue;
        const want = (a.reach + b.reach) * 0.5;
        const gap = a.dir.angleTo(b.dir) * R;
        if (gap >= want) continue;

        // The great circle through the pair. Its normal is the axis both of
        // them turn about — one forward along it, one back — so a single axis
        // does the whole separation and keeps them on the line they were on.
        _sepAxis.crossVectors(a.dir, b.dir);
        if (_sepAxis.lengthSq() < 1e-12) {
          // Stacked exactly, which has no line between them. Any bearing will
          // do, and the pair only has to start disagreeing for the next frame
          // to have one.
          localFrame(a.dir, _looseE, _looseN);
          _sepAxis.crossVectors(a.dir, _looseN);
          if (_sepAxis.lengthSq() < 1e-12) continue;
        }
        _sepAxis.normalize();

        // Which way "toward the other one" points, at each of their positions.
        // Rotating about the axis is what moves them, so the direction of that
        // motion is the axis crossed with where they stand — unit already, both
        // being unit and perpendicular.
        _sepTanA.crossVectors(_sepAxis, a.dir);
        _sepTanB.crossVectors(_sepAxis, b.dir);

        // The handoff, taken BEFORE they are moved apart, so it is measured on
        // the approach that actually happened rather than on the correction.
        const closing = a.vel.dot(_sepTanA) - b.vel.dot(_sepTanB);
        if (closing > 0) {
          const pass = closing * LOOSE_PASS;
          a.vel.addScaledVector(_sepTanA, -pass);
          b.vel.addScaledVector(_sepTanB, pass);
        }

        // Half the overlap each, as an arc. Their velocities turn with them so a
        // scoot stays tangent, exactly as the travel step above does it.
        const half = ((want - gap) * 0.5) / R;
        _sepQ.setFromAxisAngle(_sepAxis, -half);
        a.dir.applyQuaternion(_sepQ).normalize();
        a.vel.applyQuaternion(_sepQ);
        _sepQ.setFromAxisAngle(_sepAxis, half);
        b.dir.applyQuaternion(_sepQ).normalize();
        b.vel.applyQuaternion(_sepQ);

        // Moved, so they have to be drawn where they now are — and either may
        // have crossed a threshold doing it.
        a.place();
        b.place();
        this._parentLoose(a);
        this._parentLoose(b);
      }
    }
  }

  // A spot moved off any OTHER loose piece it landed on, to just clear of it.
  // keepOffSolids's twin for the things that are not registered as solids —
  // which is all of them, because a bear is something you walk through rather
  // than round, and putting it in SOLIDS would make a knee-high toy a wall.
  //
  // That tier decision is right and it left a gap: passable to a BODY was being
  // read as passable to everything, so nothing stopped one piece being set down
  // inside another. This is the narrow rule that closes it — pieces exclude
  // pieces, and go on excluding nobody else.
  //
  // One pass, like its twin, and the same reasoning applies: the spot moves by
  // at most a piece's width, and the pieces it might land on next are a handful
  // spread over a room. The separation in the shove is what catches anything
  // that does slip through, on the next frame a shin comes near it.
  // NO MARGIN ARGUMENT, deliberately. The distance two pieces settle at is
  // decided once, in _separateLoose, and this has to land on exactly that
  // number: a set-down that left them a hair closer than the shove wants would
  // be shoved apart by the first frame a shin came near, so putting a bear down
  // beside a teapot would make the teapot twitch.
  keepOffLoose(spot, except) {
    const R = CONFIG.globe.radius;
    for (const n of this._looseInPlay(_perchList)) {
      if (n === except) continue;
      // Half of each piece's own reach, the same size the separation gives
      // them — see the note there.
      const want = ((n.reach + (except ? except.reach : n.reach)) * 0.5) / R;
      const along = Math.min(1, Math.max(-1, spot.dot(n.dir)));
      if (Math.acos(along) >= want) continue;
      _looseOut.copy(spot).addScaledVector(n.dir, -spot.dot(n.dir));
      if (_looseOut.lengthSq() < 1e-12) {
        // Set down exactly on it: any bearing away will do.
        localFrame(n.dir, _looseE, _looseN);
        _looseOut.copy(_looseN);
      }
      _looseOut.normalize();
      spot.copy(n.dir).multiplyScalar(Math.cos(want))
        .addScaledVector(_looseOut, Math.sin(want)).normalize();
    }
    return spot;
  }

  // WHETHER SOMETHING IS ALREADY STANDING ON THIS PERCH, or null.
  //
  // Asked by the set-down, so that putting a second toy on an occupied stump is
  // the little disaster it ought to be rather than two drawings in the same
  // place — see putDownUnique, which sends the newcomer over the edge with the
  // topple that already exists for a piece set down too near the rim.
  //
  // WITHIN THE PERCH'S FOOTPRINT IS ENOUGH, and it is enough only because of the
  // fence above. A piece at floor level can no longer be inside a solid's
  // footprint at all — `_fendSolids` ejects it — so anything found in there is
  // something standing on top, and no height has to be tracked to know it. The
  // two rules hold each other up.
  looseOnPerch(perch, except) {
    const edge = perch.topR !== undefined ? perch.topR : perch.r;
    for (const n of this._looseInPlay(_perchList)) {
      if (n === except) continue;
      if (n.dir.dot(perch.dir) > Math.cos(edge)) return n;
    }
    return null;
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
      // ...and only as much of it as the cloud is leaving. This used to read a
      // flat 1, which was the whole truth while a sky could only be clear: a
      // day settling into its next hour under a rain front would have put the
      // sun back on screen at full strength.
      this.discA.material.opacity = this._discShow();
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
    // standing there — and whoever is stood under the bulb is lit by THAT.
    //
    // One `dark` and one `side` for the whole character, shared by the body and
    // the shadow it stands on. The shadow takes the light too, which it did not
    // before: it is a decal lying on ground that brightens, and a patch of
    // shade that stayed at midnight while the grass around it came up to
    // lamplight would read as a hole rather than a shadow. The furniture's own
    // shadows have been doing this since the room moved across.
    //
    // Held on the character rather than in a list here, so that everything
    // about one of them travels together.
    ch.lightDark = { value: new THREE.Color(0xffffff) };
    ch.lightSide = { value: 0 };
    for (const m of ch.tintables) {
      this._wearHour(m, {
        dark: ch.lightDark, mask: 'side', side: ch.lightSide, tag: 'cast',
      });
    }
    // Which side that is right now, before a single frame has been drawn. A
    // guest who spawns indoors should already be wearing the room's lamps.
    this._castSide(ch);
    // Whatever tint the world is currently wearing, including mid-fade — a
    // character joining during a transition should not arrive at full noon.
    if (this.phase) ch.lightDark.value.copy(this.tintCastOut);
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
  // afternoon.
  //
  // The card's own colour is `baseColor` now and the hour is a uniform, so what
  // has to be seeded is the uniform. _syncHeld overwrites it on the next frame
  // anyway; this is only so the first one is not full noon.
  holdItem(canvas) {
    this.hand.hold(canvas);
    if (this._handDark) this._handDark.value.copy(this.tint);
  }

  clearHand() { this.hand.clear(); }

  // A PORTRAIT OF A BUILT THING, for anywhere a drawing is wanted and there is
  // no drawing — which today is one place: the chip a unique shows in the pack.
  //
  // Every other item in the pouch has a picture because somebody painted one, a
  // fish sheet or a mushroom or the tuft. The bear, the kettle and the lantern
  // have none and never will: they ARE geometry, and the only honest likeness
  // of a built piece is the piece itself, seen from the angle you hold it at.
  // So the renderer takes one, once, and the pack shows the thing that turns up
  // in your hand rather than a stand-in for it.
  //
  // Into a target of its own rather than a corner of the frame, because this is
  // called from the DOM — between frames, with the picture the player is
  // looking at sitting in the canvas. Everything the renderer is holding is put
  // back exactly as it was found, for the same reason.
  //
  // The caller keeps the object; it is taken out of the scratch scene on the
  // way out, so a piece photographed here can be handed straight to the hand.
  snapshot(obj, px = 192) {
    const holder = new THREE.Group();
    // The hand's own three-quarter turn, so the chip and the thing you take out
    // of the bag are one object at one angle rather than two views of it.
    holder.rotation.set(0.15, -0.6, 0);
    holder.add(obj);
    const scratch = new THREE.Scene();
    scratch.add(holder);
    holder.updateMatrixWorld(true);

    // Framed square on the larger side, so a tall lantern and a wide bear come
    // out at the same scale against their slot instead of each filling it.
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(_snapV);
    const at = box.getCenter(new THREE.Vector3());
    const half = (Math.max(size.x, size.y) * 0.53) || 1;
    const back = size.z + 1;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, back * 2);
    cam.position.set(at.x, at.y, at.z + back);

    const rt = new THREE.WebGLRenderTarget(px, px);
    // Says "these pixels are sRGB", which is what makes three apply to this
    // target the same output conversion it applies to the canvas. Without it
    // the values come back linear and every chip is several shades too dark —
    // a silent difference, since nothing errors and the shape is still right.
    rt.texture.colorSpace = THREE.SRGBColorSpace;

    const wasTarget = this.renderer.getRenderTarget();
    const wasClear = this.renderer.getClearColor(_snapC);
    const wasAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(BLACK, 0);
    this.renderer.render(scratch, cam);
    const buf = new Uint8Array(px * px * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, px, px, buf);
    this.renderer.setRenderTarget(wasTarget);
    this.renderer.setClearColor(wasClear, wasAlpha);
    rt.dispose();

    // GL hands rows back bottom-up, and premultiplied. A canvas wants them
    // top-down and straight, and the divide is not pedantry: three renders with
    // premultipliedAlpha, so every pixel along the ink shell's edge arrives
    // already darkened by its own coverage, and putting those in as-is draws
    // the outline as a smear instead of as a line.
    const out = document.createElement('canvas');
    out.width = px;
    out.height = px;
    const ctx = out.getContext('2d');
    const img = ctx.createImageData(px, px);
    for (let y = 0; y < px; y++) {
      const src = (px - 1 - y) * px * 4;
      const dst = y * px * 4;
      for (let i = 0; i < px * 4; i += 4) {
        const a = buf[src + i + 3];
        const k = a ? 255 / a : 0;
        img.data[dst + i] = buf[src + i] * k;
        img.data[dst + i + 1] = buf[src + i + 1] * k;
        img.data[dst + i + 2] = buf[src + i + 2] * k;
        img.data[dst + i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    holder.remove(obj);
    return out;
  }

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
      // ...and the same reading here: you pick up what you can see, not what
      // is merely present. A carried piece is present — its light is over your
      // feet — and picking it up again would be picking up your own hand.
      if (!loose.anchor.visible || (loose.body && !loose.body.visible)) continue;
      if (arts && !arts.includes(loose.art)) continue;
      if (playerDir.dot(loose.dir) < reach) continue;
      // THE BODY, NOT THE ANCHOR, and for the lantern that is the difference
      // between picking up a lamp and picking up its light.
      //
      // The anchor carries more than the drawing: a lit piece hangs its POOL off
      // it too, so that shoving the lantern across the floor takes its light with
      // it and nothing has to remember to move it. Right for the light, ruinous
      // here — the pool is a ground cap of radius `glow.reach`, which is 4.6
      // times the lamp's own height, so a recursive raycast made the lantern
      // tappable anywhere inside a pool several units across while the bear and
      // the teapot, which cast no light, were tappable only where they are.
      // Worse when the lamp is OFF: the pool drops to zero opacity but stays
      // `visible`, and the raycast reads visibility, not alpha — so the oversized
      // target was there even with nothing lit to explain it.
      //
      // `body` is the built group: the piece as drawn, its own halo included.
      // That is what "you pick up what you can see" has always meant here, and
      // the test two lines up already reads `body` for exactly that reason.
      const hit = loose.body || loose.anchor;
      if (raycaster.intersectObject(hit, true).length) return loose;
    }
    return null;
  }

  // Set a carried piece down at `spot`, or send it home. One method for both,
  // because they are the same operation with a different destination — and
  // `place()` is the closure built where the piece was born, so a bear set
  // down on the meadow is stood up by the exact code that stood it on the
  // room's floor.
  // WHERE A LEANING THING WOULD STAND if it were put down at `spot` — the
  // room, the bearing, and the spot on that room's wall — or null when there
  // is no wall to lean on there.
  //
  // Asked of every room rather than of the piece's own, which is the whole of
  // what lets a fork be left standing in somebody else's house. The rooms are
  // the same shape and the two sasumata are the same model, so the only thing
  // that differs between leaning here and leaning there is the distance at
  // which a head meets the wall — 2.06 under Chiikawa's roof against 2.95 in
  // the cave, because the shells are 3.2 and 4.0. That number belongs to the
  // ROOM and is published by it; the piece brings only its angle.
  //
  // Three ways to answer null, and each is a place the wall is not: too far
  // in (you are putting it down on the floor, not against anything), not in
  // this room at all (which is also what keeps a piece toppling off a stump
  // on the far side of the planet from reading as a spot indoors), and across
  // the open doorway, where a leaning thing would be leaning on the gap.
  //
  // The radial SNAP is the affordance and is deliberate: a head only touches
  // the wall at one distance, so a spot that means "lean it there" cannot
  // also mean "at exactly this radius". What the player chooses by tapping is
  // a BEARING — which bit of wall — and the room supplies the rest. That is
  // why the catch area can be as generous as it is without ever being
  // ambiguous.
  propSpotFor(spot) {
    for (const home of this.homes) {
      const L = home.lean;
      if (!L || !L.out) continue;
      const outArc = L.outOf(spot);
      if (outArc < L.out * CONFIG.uniques.leanFrom) continue;
      if (outArc > L.out + 0.8) continue;
      const at = L.bearingOf(spot);
      // Wrapped to ±π before it is compared with the doorway's half-arc, or
      // a bearing that came back just under a full turn would read as miles
      // from a door it is standing in.
      if (Math.abs(Math.atan2(Math.sin(at), Math.cos(at))) < L.doorArc) continue;
      return { home, at, dir: L.spotDir(at, L.out) };
    }
    return null;
  }

  placeLoose(loose, spot, face) {
    loose.atHome = !spot;
    loose.dir.copy(spot || loose.home).normalize();
    // WHICH WAY IT FACES, remembered STICKILY and on purpose. `face` only
    // arrives from a genuine set-down (putDownUnique, which knows where the
    // placer stood); everything else that re-places a piece — the per-frame
    // call that keeps a carried lamp's light over your feet, the topple
    // walking a bear off a stump rim in little steps — passes nothing, and
    // must inherit the facing the set-down chose rather than erase it. A
    // topple that forgot would land the bear facing the authored compass
    // mark it was born with, which is precisely the stamped look this field
    // exists to end. Going home clears it: an arrangement has no placer.
    if (!spot) loose.faceDir = null;
    else if (face) loose.faceDir = face.clone();
    // STAND IT UP IF THERE IS A WALL TO STAND IT AGAINST. The one place the
    // stance is decided, so every way of putting a thing down — the tap, the
    // おく verb, a drag out of the pack, the walk home — agrees about it
    // without any of them knowing the rule.
    //
    // Going home always props (that is what the arrangement is); anywhere
    // else asks the room, which answers with a spot on the wall or with
    // nothing. Written every time rather than only when it changes, so a
    // piece that was leaning and is now on the grass has no stance left over.
    if (loose.homeLean) {
      if (!spot) {
        loose.propAt = loose.homeBearing;
        loose.propHome = loose.bornHome;
      } else {
        const prop = this.propSpotFor(loose.dir);
        loose.propAt = prop ? prop.at : null;
        loose.propHome = prop ? prop.home : null;
        // Out to where the head actually reaches the wall. The tap chose
        // which bit of wall; the room knows how far off it a leaning thing
        // has to stand.
        if (prop) loose.dir.copy(prop.dir);
      }
    }
    loose.vel.set(0, 0, 0);
    loose.place();
    loose.anchor.visible = true;
    // Back in the world and visible in it. The body has to be restored as well
    // as the anchor, because carrying is what hid it — see carryLoose.
    //
    // NOT applied while it is being carried, and that exception is the whole
    // reason carrying works: main.js calls this every frame to keep a held
    // lamp's light over your feet, so an unconditional restore here would draw
    // the lantern on the ground under you as well as in your hand.
    if (loose.state !== 'carried') this._setLooseState(loose, 'world');
    // WHOSE CHILD IT IS follows where it stands. The anchors are born children
    // of `interior`, and the horizon cull hides that whole group with the
    // house — which is right for the futon and wrong for a bear set down half
    // a world away: walk far enough for the house to sink and the bear
    // vanished with it, still there to the raycast (its own `visible` was
    // never touched), just not drawn. So a piece placed outside the wall
    // moves out to `world`, where the planet's own curve is what hides it,
    // and one brought home rejoins the room and the room's cull. The two
    // groups are both identity children of `world`, so the anchor's transform
    // means the same thing under either parent.
    this._parentLoose(loose);
  }

  _parentLoose(loose) {
    // WHICH room, not merely whether it is in one: a bear carried from the
    // house to the cave has to join the cave's group, or it would be culled by
    // a building on the far side of the planet.
    const h = this.homeAt(loose.dir);
    const group = h && h.interior ? h.interior : this.world;
    if (loose.anchor.parent !== group) group.add(loose.anchor);
  }

  // The other two things that can happen to a loose piece, and the distinction
  // between them is one the world used to miss entirely.
  //
  // A piece in your HANDS is still in the world. It is over your feet, main.js
  // keeps it there every frame, and if it is a lamp it is lighting the ground
  // you are standing on — which is the entire point of a lamp you can carry.
  // What must not happen is SEEING it there, because you are already looking at
  // the copy in your hand.
  //
  // A piece in your BAG is not in the world at all. It lights nothing, because
  // it is nowhere.
  //
  // Both used to be `anchor.visible = false`, and that is exactly why a stowed
  // lantern went on lighting the spot it was last put down at: the flag hid the
  // lamp and said nothing whatever about the lamp's light. Measured with the
  // lantern in the pack, the room's term still reading 0.72 and its last
  // position still in the uniforms.
  carryLoose(loose) {
    this._setLooseState(loose, 'carried');
  }

  stowLoose(loose) {
    this._setLooseState(loose, 'away');
  }

  // One door for all three, because every one of them has to do the same last
  // thing: tell the lights. A lamp's level is not written per frame — it is
  // written when something about it changes — so a piece going into a bag has
  // to say so, or the term goes on burning at the spot it left. That was the
  // whole bug, and putting the re-sync anywhere but here would leave one of the
  // three states able to forget it.
  //
  // Guarded on an actual change, because carrying calls this every frame.
  _setLooseState(loose, state) {
    if (loose.state === state) return;
    loose.state = state;
    const away = state === 'away';
    loose.anchor.visible = !away;
    if (loose.body) loose.body.visible = state !== 'carried';
    if (loose.shadow) loose.shadow.visible = state === 'world';
    this._relight();
  }

  // Whether a piece is in somebody's hands rather than lying about. The one
  // question main.js cannot answer for itself once the hand has been emptied by
  // something that did not say where the thing went — see syncPouch.
  isCarried(loose) {
    return loose.state === 'carried';
  }

  looseByArt(art) {
    return this.loose.find((l) => l.art === art) || null;
  }

  looseByItem(item, art) {
    return this.loose.find((l) => l.item === item)
      || this.loose.find((l) => !l.item && l.art === art)
      || null;
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

  // `landed` is the rig's own answer to "are you stood on something or are you
  // flying" — see the note at the hand, which is the one thing in here that
  // needs to know and cannot work it out for itself.
  update(t, anchor, landed, shooting = false) {
    const g = CONFIG.globe;
    this.world.position.y = Math.sin(t / g.bobPeriod * Math.PI * 2) * g.bob;

    // The Zzz over anybody asleep. Early in the frame with the other per-frame
    // placements, and free at every hour but one — see _syncZzz, which walks
    // away the moment it finds nobody lying down.
    this._syncZzz(t);

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
      const at = this.lampUniforms.uLampAt.value[L.slot];
      L.at.getWorldPosition(at);
      // ...and which side of the wall it is on THIS frame — see uLampIn.
      //
      // Asked of the light's own position rather than of whoever might be
      // carrying it, and that is the whole reason this works. A lamp shoved
      // across the floor by somebody's foot, set down out on the grass, or held
      // in a hand that has just walked through the front door all arrive here
      // by the same route: they are somewhere, and somewhere is either under
      // the roof or it is not. Nothing has to tell the lighting that an item
      // was picked up, and nothing can forget to.
      _lightDir.copy(at).sub(this.world.position).normalize();
      // A FRACTION, not a flag — see insideAmount. A lantern halfway through
      // the door lights the room and the grass at half strength each, which is
      // what a lantern in a doorway does.
      this.lampUniforms.uLampIn.value[L.slot] = this.insideAmount(_lightDir);
    }
    // ...and everything downstream of the line above, which that line can
    // change: carrying the lantern out through the door takes its light out of
    // the room, and a room with nothing left burning in it should stop showing
    // at its windows as you walk away with the reason they were lit.
    //
    // A full re-apply every frame, where this used to be one method that
    // early-outed when nothing had moved. What it costs is a few dozen small
    // writes against a scene of seven hundred objects; what it buys is that
    // there is no longer a question about which parts of the lighting a moving
    // lamp is allowed to reach.
    this._relight();

    // Which side of the wall each loose piece is on, asked the same way and for
    // the same reason as the lamps above: of the thing's own position, so that
    // being carried, kicked or set down all arrive by one route. Only on the
    // frame it changes — the colours behind it are a handful of writes, but
    // there is no sense making them sixty times a second to say the same thing.
    for (const L of this.looseLit) {
      const inside = this.insideAmount(L.loose.dir);
      if (Math.abs(inside - (L.was === null ? -1 : L.was)) < 0.004) continue;
      L.was = inside;
      L.side.value = inside;
      this._syncLoose();
    }
    // The glow over the door, which fades as you walk up to it — see
    // _syncBloom. Driven from here rather than from _syncLamp because it
    // follows the CAMERA, and the camera moves on frames when the hour and the
    // horizon both have nothing to say.
    for (const h of this.homes) {
      const s = h.sprite;
      if (s.lit && s.lit.bloom.visible) this._syncBloom(s);
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
      this._handSide.value = anchor ? this.insideAmount(anchor) : 0;
    }
    // ...and what that thing WEARS, which is the same question again and was
    // being answered for only half of what the hand can hold. See _syncHeld.
    this._syncHeld(anchor);
    // The same question for whatever the cast are carrying, which is asked of
    // where THEY stand rather than of where you do — a friend who walked your
    // lamp indoors is holding it in the room, not on your lawn.
    this._syncCastHeld();
    // The floating focus marks, after the cast have stood themselves for the
    // frame — the person mark reads a character's live anchor, and moving it
    // before they do would trail it a frame behind a walking friend.
    this._syncFocusMarks(t);

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
    //
    // Asked of every home rather than of the one, and each keeps its own flag:
    // you can only be over one roof at a time, but the OTHER building has to be
    // put back together when you leave the first, and a shared flag cannot say
    // which one is currently open.
    for (const h of this.homes) {
      const c = CONFIG.camera;
      h.sprite.anchor.getWorldPosition(_pw);
      _pw2.copy(this.camera.position).sub(_pw);
      const up = _pw2.dot(h.sprite.normal);
      const off = Math.sqrt(Math.max(0, _pw2.lengthSq() - up * up));
      // AIRBORNE, and not merely higher than the wall beside you. The dome
      // curls down to nothing at its rim, so the roof over the doorway is only
      // 1.64 — below a 1.7 eye. Without this the building took its own skin
      // off while you stood on its threshold, which is the one place you are
      // most certainly looking at it.
      // ...and measured against the SHELL YOU CAN SEE rather than the analytic
      // wall, which for the cave are no longer the same number. Its outer layers
      // are pushed out into lumps — see caveBulge — so its crown stands a good
      // unit proud of `rad`, and a lid sized off `rad` alone would take the rock
      // away while you were still climbing up past it.
      const lid = h.rad + (h.style === 'cave' ? CAVE_LIFT : 0);
      const over = up > c.eyeHeight + c.groundBand
        && off < lid && up > Math.sqrt(Math.max(0, lid * lid - off * off));
      if (over !== h.overRoof) {
        h.overRoof = over;
        for (const m of h.outer) m.visible = !over;
      }
    }

    // Crossing the threshold re-tints on the spot. The daylight blend only
    // writes colours while a fade is running, and walking through the door is
    // not a fade — without this, a guest stepping in at midnight would stand
    // in the warm room still wearing moonlight until the next hour change.
    // A FRACTION of the way in rather than a side of a line, so somebody in the
    // doorway is half lit by each. `_wasInside` used to hold a boolean and this
    // loop used to skip unless it flipped; it holds the fraction now and skips
    // unless it has moved enough to see, which keeps a room full of standing
    // characters from being re-tinted sixty times a second for nothing.
    for (const ch of this.cast) {
      const inside = this.insideAmount(ch.dir);
      if (Math.abs(inside - (ch._wasInside || 0)) < 0.004
        && ch._wasInside !== undefined) continue;
      ch._wasInside = inside;
      _cC.copy(this.tintCastOut).lerp(this.tintCast, inside);
      for (const m of ch.tintables) m.color.copy(_cC);
      // Which set of lamps they read, moving on the same crossing and by the
      // same fraction as the colour. The two were a matched pair of hard
      // switches and are now a matched pair of fades — a lamp that faded while
      // the wall's colour snapped would read as two different doorways.
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

    // The surface of the water: the light crawling across it, and the boil that
    // redraws the wave lines and the shore. No shader at all — the sheets are
    // set to repeat so sliding an offset moves every highlight at once, and the
    // boil is a swap. One clock for both ponds, because two ponds sparkling out
    // of step would be two different afternoons.
    // Frozen, this returns immediately and the surface stops moving — which is
    // the one place this whole feature makes the app cheaper rather than
    // dearer. See driftWater.
    if (this.ponds) driftWater(this.ponds, t / 1000, this.iceAt);

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

    // THE SMALL-PROP CULL IS GONE. It read:
    //
    //   const showSmall = this.camera.position.length() < g.radius * 2.2;
    //
    // and hid every bush and stump on the planet past 2.2 radii, on the stated
    // grounds that "the little props stop being worth a draw call each". Three
    // things were wrong with it, and only the first is about performance:
    //
    //   THEY ARE NOT SUB-PIXEL OUT THERE. The claim the threshold rested on is
    //   simply not true of this planet — at sky altitude a 0.72-unit bush still
    //   covers a couple of dozen pixels on a phone. It was plainly visible right
    //   up to the frame it vanished in.
    //
    //   THE CUTOFF SAT BELOW THE VIEWS IT WAS PROTECTING. Orbit is 3.0 radii,
    //   the そらへ button 3.7, full zoom 4.1 — every one of them past 2.2. So the
    //   line was never crossed at rest, only in transit, and what it bought was a
    //   pop of thirty-three things leaving at once in the middle of a climb.
    //
    //   IT EMPTIED THE MAP. The far view IS this app's map, which is why it is
    //   the one place the name chips are left off. Three quarters of the scatter
    //   is small — 33 of 44 props, twelve of each bush and nine stumps — so the
    //   map showed eleven things standing on a world that has forty-four.
    //
    // What it cost to remove is honest and worth writing down: about fifty draw
    // calls, in the frame that already has the most, since the far view has no
    // horizon to hide the near hemisphere behind. If a phone ever struggles, the
    // knob is SCENERY_COUNT — fewer things everywhere — rather than the same
    // things blinking out at a line nobody can see.

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
    //
    // ASKED OF THE RIG rather than of `climbed`, and the difference is a bug
    // that lived here for a while. `climbed` is how far the EYE is off the
    // ground, and three separate things lift the eye: altitude, the hop, and
    // whatever you are stood on. Only the first of those is flying. Measured
    // against groundBand (0.35) this read a hop (0.60 at the apex) as a
    // departure and shrank the thing in your hand away through the middle of
    // every jump, and it read standing on the table (0.72) as one for as long
    // as you were up there. `landed` is isFirstPerson, which tests `alt` alone
    // — precisely because the hop deliberately never touches it. See the note
    // on hopHeight in config.js, which says so in as many words.
    // ...AND WHEN THE LENS IS TURNED ROUND, for the same reason said a second
    // way. The hand is parented to the CAMERA, so it rides wherever the camera
    // goes — and in the selfie the camera is three units out in front of you.
    // The kettle then floats in the bottom corner of a photograph of yourself,
    // held by nobody, at a spot where your actual hands are plainly visible and
    // plainly empty. `isFirstPerson` cannot catch this on its own: the selfie is
    // a render transform and deliberately never moves the rig, which is what
    // keeps every other rule honest and is exactly why this one has to be told.
    this.hand.update(t, !landed || !!shooting);

    // Plucked grass growing back, and the clock plucks are dated by.
    this._tuftNow = t;
    this._growTufts(t);
    this._growShrooms(t);

    // Nothing fades: the depth buffer hides whatever the curve has swallowed,
    // so props sink behind the horizon rather than dissolving. This is only a
    // cull, kept generous so it never clips something still on screen.
    // ...and EVERY sprite is asked, bushes and stumps included. This loop used to
    // skip them whenever the cull above had them hidden, which was right while
    // something else owned their visibility and is wrong now that nothing does:
    // skipped, a small prop keeps whatever `seen` it was last given, and the
    // horizon would stop swallowing it.
    for (const s of this.sprites) {
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
        // ...and the room goes with the building it is inside. Keyed on the
        // sprite's own home record rather than on being THE house, which was
        // the same test until there were two of them.
        if (s.home && s.home.interior) s.home.interior.visible = seen;
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
