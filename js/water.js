// The ponds, built rather than drawn.
//
// `lake.png` was stamped into the ground texture, which made the water a
// picture of water: flat, fixed, the same from every angle and at every hour,
// and — the part that actually mattered — a shape that every RULE about the
// water then had to be simplified down to. The pond was an ellipse because a
// rule can be written about an ellipse.
//
// Built, the shape is free, and the constraint inverts in the useful direction:
// instead of the rules following the drawing, the mesh follows the rules. Every
// vertex here is placed by asking `lakeRim` in sphere.js where the shore is —
// the same function `inLake` asks — so the water you can see and the water you
// cannot walk into are not two things that agree, they are one thing.
//
// ------------------------------------------------------------ the projection
//
// A lake lives in gnomonic angles, because that is what `inLake` measures in:
// project a direction onto the lake's own east and north, turn each into an
// angle about the centre, and divide by the two radii. So the inverse is what
// builds the mesh. Given the parameters (a, b) that `inLake` would compute:
//
//     alpha = a * rx        beta = b * ry
//     dir   = normalise(centre + tan(alpha) * east + tan(beta) * north)
//
// which is the gnomonic projection run backwards — the plane touching the
// sphere at the lake's centre, with the mesh laid out flat on it and pushed back
// down onto the surface. tan() blows up at a quarter turn and the widest pond
// here reaches 0.55 radians, so there is nothing to guard.
//
// The consequence worth knowing: cells are NOT the same size across a lake. The
// projection stretches away from the centre, by 1/cos^2 along the radius, which
// at the rim of the big lake is about 1.4. That is why the rings are spaced by a
// curve rather than evenly — see RING_BIAS.
//
// ----------------------------------------------------------------- the layers
//
// Four meshes per pond, and they are four because each wants a different
// blend, not because it was easier:
//
//   body   the water. Vertex-coloured, so the shallows at the rim can pale off
//          into the deep in the middle without a texture, and slightly
//          transparent over the water-coloured bed painted into the ground.
//
//   ink    the pen round it: a ribbon laid ALONG the rim, in the same warm brown
//          everything else on this planet is outlined with, its width breathing
//          and its pen lifting three times a lap. It draws last, over the water
//          rather than under it. A wider copy of the whole pond underneath used
//          to do this job in one draw and is retired — see the note at RING_W
//          for the three things that were wrong with it, all of which come down
//          to a scaled disc being a shape rather than a stroke.
//
//   nami   the pen on it. The anime draws its water twice over — light marks
//          and dark ones — and this is the dark half: a tiling sheet of thin
//          ink squiggles that BOILS rather than travels, flipping between three
//          drawings of itself the way hand-drawn water does. Normal blending,
//          because ink on water darkens it.
//
//   glint  the light on it. A tiling sheet of white dashes and soft patches
//          scrolled slowly across the surface in the wind's own direction.
//          Additive, so it only ever brightens, which is what a highlight does.
//
// The body, the nami and the glints share one geometry, built once per lake:
// they are three things happening on the same surface, so they are one surface
// asked for three times. The line has its own, because it is not a surface.

import * as THREE from 'three';
import { CONFIG, PAL } from './config.js';
import { dirFromLatLon, localFrame, lakeRim } from './sphere.js';
import { paintGlints, paintNami, NAMI_FRAMES } from './art.js';

// How far the water floats above the planet's surface.
//
// A pond is a hollow in life and this planet has no hollows — the globe is a
// sphere and stays one, because every rule in the app that asks how high the
// ground is answers `radius`, and putting a real dip in it would mean teaching
// all of them about dips for the sake of two ponds. So the water sits very
// slightly PROUD of the grass instead and the eye reads it as level, exactly the
// way the shadows and the walk marker do.
//
// Small, because the one thing that would give the trick away is water standing
// above its own shore where the two meet at your feet. At 0.012 against a 1.7
// eye that edge is under a pixel from any distance you can stand at.
const LIFT = 0.012;

// ------------------------------------------------------------------- the pen
//
// `const INK = 0.030` stood here: the outline was a COPY OF THE WHOLE POND, 3%
// wider, drawn underneath. One extra draw for a closed line, and clever — and
// wrong in three ways at once, all of which the reference drawing makes obvious
// the moment you hold them side by side.
//
//   It was not the same width all the way round. A scale multiplies the
//   ellipse's own parameter, and the big lake's radii differ by 1.84, so "3%
//   wider" is nearly twice as much line at the ends as at the sides. Nobody
//   drew that; it fell out of the arithmetic. This is why the ring is now
//   offset along the rim's own NORMAL, in radians on the sphere, which is a
//   width that means the same thing at every bearing.
//
//   It was perfectly even, which no drawn line is. A pen presses harder and
//   lighter — see PRESS below.
//
//   It never stopped. The reference lifts its pen three or four times round one
//   pond, and those breaks are most of what says "somebody drew this" rather
//   than "something generated this" — see RING_GAPS.
//
// And a disc had a fourth cost that had nothing to do with looks: it ran under
// the whole body, which is 90% opaque, so a tenth of every pond's colour was the
// outline showing through the water. The pond is its own colour now.
//
// Half the line's width, in radians on the sphere — times the radius, about
// 0.027 world units, so the stroke is 0.055 across.
//
// SET AGAINST THE REFERENCE RATHER THAN AGAINST TASTE, because taste got it
// wrong by a factor of two and a half. Measured off the drawing, the line is
// about 0.6% of the pond's own width. The first pass here was 1.5%, which on a
// 7.6-unit lake is a 0.12-unit stroke, and from above it read as a kerb round a
// municipal boating pond. A pond's line is FINE — it is the same pen the flowers
// are drawn with, and the pond is thirty times bigger than a flower.
const RING_W = 0.0034;

// How finely the line is walked. Higher than the water's own COLS: the body is a
// broad surface where a facet is invisible, and this is a thin dark stroke seen
// against pale water, where a flat spot is the only thing on it.
const RING_COLS = 192;

// Above the body, by the sag rule LAYER explains — and the rim is where the
// body's rings are densest, so the sag it has to beat there is the smallest
// anywhere on the pond.
const RING_LIFT = 0.004;

// THE HAND. Width as a multiple of RING_W, three harmonics against the bearing:
// slow, medium and quick, none of them commensurate, so the line never repeats
// itself round a lap.
//
// The range is about 0.65 to 1.35, and it was ±0.62 before — which on paper is
// "a stroke pulled quickly against one leaned on" and on screen was a line that
// swelled and pinched like a snake that had eaten. A drawn line varies much less
// than it feels like it does; what sells the hand is that the variation never
// repeats, not that it is large.
//
// `pass` is this drawing's own phase — see the boil note below. The first three
// harmonics are the pen's character and stay put across the passes; the fourth
// is how hard this particular pass was leaned on, and it is the smallest of the
// four because a hand redrawing a line changes where it presses much less than
// it changes where it goes.
function press(th, pass) {
  return 1
    + 0.16 * Math.sin(th * 3 + 0.9)
    + 0.11 * Math.sin(th * 5 - 2.1)
    + 0.07 * Math.sin(th * 8 + 1.7)
    + 0.06 * Math.sin(th * 6 + pass * 2.7);
}

// ------------------------------------------------------------ the shore boils
//
// The line is DRAWN THREE TIMES and flipped between, the same trick the wave
// lines use (see paintNami in art.js) and on the same clock, because a cel is
// redrawn all at once: an animator does not boil the water and leave the shore
// alone, and two boils out of step would be two hands.
//
// WHAT MOVES IS THE INK AND NOTHING ELSE, which is the whole design constraint
// and worth being blunt about. `lakeRim` is the one shape the mesh, `inLake`,
// `lakeReach`, the painted bed and every fish all ask — the note at the top of
// this file makes a promise of that — so a boil that wobbled the RIM would
// wobble where you can walk, where you can cast, and where a fish is turned
// back, all of it invisibly and none of it wanted. So the rim is untouched and
// the pen is offset from it, per pass. The water's own edge never moves; only
// the line drawn over it does, which is exactly what redrawing an outline is.
//
// It also means the boil can never be felt, only seen: `pickGround` raycasts the
// ground and nothing here, so a wandering line cannot move a tap.
//
// How far the pen wanders between passes, in radians on the sphere. Measured on
// the built geometry it moves the line about 0.019 world units against a stroke
// 0.054 across — a third of its own width, which is what a boil looks like: the
// line breathing, not the pond changing shape.
//
// WHAT ACTUALLY BOUNDS IT is the BED, not the line's own width, and the first
// draft of this note had that wrong. The obvious worry is that a wandering line
// stops covering the water's edge and opens a hairline of something bare — and
// it does stop covering it: the inner edge strays as far as 1.0027 of the rim on
// the lake and 1.0055 on the small pond. What is under there is the bed, painted
// the water's own colour out to BED_OVER (1.015), so what shows is water where
// water should be. The invariant that matters is therefore `inner edge < 1.015
// of rim`, and it holds with about three times the headroom.
//
// THE SMALL POND IS THE BINDING CASE, because this and RING_W are absolute
// angles while the ponds are not the same size: the same wander is a bigger
// fraction of a smaller rim. Anything that raises either number should be
// checked against the pond rather than the lake, which is the one that looks
// fine right up until it doesn't.
const RING_BOIL = 0.0016;

// How far the pen lifts in a different PLACE each pass, in turns. Small on
// purpose: a gap that appeared and vanished would flash the line on and off,
// where one that slides a little reads as the hand hesitating at slightly
// different moments.
const GAP_DRIFT = 0.006;

// Where each pass's phase comes from. The golden angle, so that three passes
// land nowhere near each other on any of the harmonics they drive — stepping by
// a round number would have two of the three nearly agreeing on the slow term,
// and the boil would read as a two-frame flicker with a spare.
const PASS_STEP = 2.39996;

// WHERE THE PEN LIFTS: turns round the rim, and how much of a turn each break
// spans. Placed rather than random, because three gaps evenly spread reads as a
// dashed line and three gaps bunched reads as a mistake; these are the reference
// drawing's own rhythm, which is one long break and two short ones, unevenly.
const RING_GAPS = [[0.13, 0.020], [0.47, 0.012], [0.79, 0.016]];

// How much of a gap is bare, against how much is the line thinning into it. The
// taper is the whole point: a break with square ends is a dashed line, and what
// a pen actually does is run out of pressure, leave nothing, and come back.
const GAP_CORE = 0.45;

// THE TICKS — the little strokes sitting off the line in the reference, in
// threes. They are not shorthand for anything (not spray, not reeds); they are
// the mark this art makes when it wants an edge to feel drawn rather than
// computed, and the same three ticks appear on Chiikawa's own cheeks. Two
// clusters is enough: a pond ringed with them would be a doily.
//
// `at` is the bearing in turns, `tilt` how far the strokes lean off radial.
const RING_TICKS = [{ at: 0.055, tilt: 0.85 }, { at: 0.585, tilt: -0.75 }];
// Bearing between strokes in a cluster, how far clear of the line they sit, and
// their lengths — three different ones, because three identical marks is a comb.
//
// TIGHT AND CLOSE IN, both of which the first pass got wrong: at 0.055 of a turn
// apart the three strokes were more than a unit of shoreline from each other,
// which is not a cluster, it is three unrelated scratches on three different
// parts of the pond. In the reference they nearly touch each other and nearly
// touch the line.
const TICK_STEP = 0.016;
const TICK_OUT = 0.009;
const TICK_LEN = [0.024, 0.033, 0.021];
// Half the stroke at its fattest, which is most of its length once the taper is
// clamped. A shade under the line's own, so the ticks read as smaller marks by
// the same hand rather than as a second, bolder pen.
const TICK_W = 0.0028;
// How many steps the taper is walked in. Eight, because the clamp puts a knee
// in the width where the sine tops out and a coarser walk shows it as a corner.
const TICK_SEGS = 8;

// The body sits this much above the ink so the two cannot fight for the depth
// buffer.
//
// IT IS SET BY THE TESSELLATION, NOT BY DEPTH PRECISION, and that is the whole
// lesson of the number. It began at 0.0006 — comfortably above what a 24-bit
// depth buffer can resolve at eight units, which is around a hundredth of that —
// and the pond came out with white rings across it in bands.
//
// Both discs are polyhedra approximating a sphere, so each SAGS INWARD between
// its rings, by the sagitta of the chord: c²/8R. The two do not sag in the same
// places, because the ink's rings sit 3% further out. So wherever the body's
// facet dipped below the ink's, the ink surfaced through the water it was meant
// to be under. At the old ring count the widest band was 0.72 units across,
// which sags 0.008 — thirteen times the gap it had to stay inside.
//
// Fixed at both ends: more rings below, so the worst sag is about 0.0017, and
// this raised well clear of it. The general rule for any two curved decals
// stacked on this planet is that the gap has to beat the SAG, and the sag is
// several orders of magnitude bigger than the depth buffer's resolution.
const LAYER = 0.004;

// How many rings out from the middle and how many columns round.
//
// COLS is set by the RIM rather than by the area. The wobble's fastest harmonic
// is 5 per turn, and a shape sampled near its own frequency comes out as a
// polygon with the lobes in the wrong places; 96 is nineteen samples per lobe,
// which is smooth to well under a pixel at the closest you can stand.
//
// RINGS is lower, because across the middle of a pond there is nothing to
// resolve — the surface is flat colour with a gradient on it. What the rings are
// actually for is the CURVE: the water is a cap on a sphere, and too few has it
// cutting the corner across the planet and sinking its own middle, which is not
// only a shape problem but the thing that decides LAYER. At 16 the widest band
// on the big lake is a third of a unit and sags under 0.002.
const RINGS = 16;
const COLS = 96;

// Rings bunched toward the rim rather than spread evenly.
//
// Two reasons, and they pull the same way. The gnomonic stretch means an evenly
// spaced ring is a wider band of water the further out it is, so even spacing in
// the parameter is uneven spacing on the ground. And everything worth looking at
// on a pond happens at the edge — the shore fade, the ink, the wobble — while
// the middle is one colour. Squaring the parameter puts the detail where the
// detail is.
//
// Gentler than it started, for the reason set out at LAYER: a strong bias buys
// detail at the rim by making the innermost bands very wide, and a wide band on
// a sphere is a facet that sags away from it.
const RING_BIAS = 1.4;

// How wide the pale shallows are, as a fraction of the way in from the rim. A
// pond in the reference art is darker in the middle and lighter where you can
// see the bottom, and it is a fast change rather than a wash — the water gets
// deep quickly.
//
// Narrowed from 0.34 with the two colours brought together (see the palette
// note): a third of the radius is not a shore, it is most of the pond, and at
// the old contrast it read as a band of foam inside the outline rather than as
// depth. The shore is the last fifth now, and faint.
const SHALLOW = 0.20;

// How many times the glint sheet tiles across the widest lake, and how fast it
// crawls. Slow: the water should be moving, not flowing. At 0.014 of a tile a
// second a squiggle takes about a minute to cross the pond, which reads as
// almost still while never being still.
const GLINT_TILES = 3.2;
const GLINT_DRIFT = 0.014;

// The wave lines' two clocks, and they answer different questions. NAMI_STEP is
// the boil — seconds per drawing, so at 0.42 the lines are redrawn by a
// different hand a little over twice a second, which is "wiggling" and safely
// short of "vibrating"; anime shoots its boil around 8fps and water sits at the
// lazy end of that. NAMI_DRIFT is the creep of the whole sheet, at half the
// glints' crawl and on a different bearing, because the two kinds of mark
// belonging to slightly different currents is what stops the surface reading as
// one printed sheet.
//
// The opacity is the pen held a little off the paper: full ink over the pastel
// water is a fence, not a ripple.
const NAMI_STEP = 0.42;
const NAMI_DRIFT = GLINT_DRIFT * 0.5;
const NAMI_ALPHA = 0.60;

// The mark the water leaves in the stencil buffer, and the one a reflection
// tests for. Exported because character.js has to agree with it and a number
// written down twice is a number that will disagree once.
export const WATER_STENCIL = 1;

// ---------------------------------------------------------------- the shape
//
// One geometry per lake, in world coordinates rather than parented to a holder.
//
// Parenting would be the usual way and is wrong here for a reason worth writing
// down: a holder is a point and an orientation, which suits anything small
// enough to treat the ground under it as flat. The big lake spans 0.55 radians —
// thirty degrees of planet — and the surface under it is emphatically not flat.
// Its own centre would be right and its far shore would be buried.
//
// `scale` is what makes one geometry serve the ink and the body: 1 for the
// water, a little over 1 for the outline underneath it.
//
// WHAT THE VERTEX COLOURS HOLD IS A RATIO, not a colour — 1 in the deep middle,
// rising to shallow-over-deep at the rim — and that is worth explaining, because
// the obvious thing to store is the water's actual colour and it does not work.
//
// A pond is mostly the sky bouncing off it, so its colour has to be able to
// BECOME the sky's at sunset rather than merely be tinted by it (see `mirror` in
// daylight.js). That is a lerp toward the sky, and a lerp has to happen where
// the whole colour is known. Vertex colours multiply into `material.color`, and
// a multiply can only ever darken toward the thing it is multiplied by — a teal
// pond times a sunset comes out a muddy teal, never orange.
//
// So the hour owns `material.color` and computes the water's colour outright,
// while the mesh carries only the SHAPE of the shading: how much paler the
// shallows are than the deep, per channel, as a factor. Multiplying that is
// exactly right — it is a relative statement — and it means the shore keeps its
// slightly greener cast at every hour without knowing what hour it is.
//
// (There is a shader patch that would do the lerp per fragment and let the
// vertices keep real colours. It would also be a third `onBeforeCompile` in a
// codebase where those already collide in the program cache, to buy a difference
// nobody could point at.)
//
// `flat` overrides all of it and paints every vertex one colour — used by
// nothing now that the ink computes its colour on the material too, and kept
// because the next thing built on this water will want it.
export function lakeGeo(R, lake, scale = 1, lift = LIFT, flat = null) {
  const C = new THREE.Vector3();
  const E = new THREE.Vector3();
  const N = new THREE.Vector3();
  dirFromLatLon(lake.lat, lake.lon, C);
  localFrame(C, E, N);

  // One extra of each: the centre is a single point that every innermost
  // triangle shares, and the last column repeats the first so the rim closes.
  const verts = 1 + RINGS * (COLS + 1);
  const pos = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);

  // How much paler each channel goes at the rim, worked out in LINEAR space —
  // which THREE.Color is already in once it has been set from a hex string, and
  // which is also the space the shader does the multiply in. Taken as a ratio of
  // the sRGB numbers instead it would be a different, wronger shore.
  const deep = new THREE.Color(PAL.waterDeep);
  const shallow = new THREE.Color(PAL.waterShallow);
  const rim2 = new THREE.Color(
    shallow.r / Math.max(1e-4, deep.r),
    shallow.g / Math.max(1e-4, deep.g),
    shallow.b / Math.max(1e-4, deep.b),
  );
  const ONE = new THREE.Color(1, 1, 1);
  const mix = new THREE.Color();
  const d = new THREE.Vector3();

  // Where the rim reaches at each column, worked out once and reused by every
  // ring — it depends only on the bearing.
  const rim = new Float32Array(COLS + 1);
  for (let c = 0; c <= COLS; c++) {
    const th = (c / COLS) * Math.PI * 2;
    rim[c] = lakeRim(th, lake);
  }

  const put = (i, rho, th, edge) => {
    const a = rho * Math.cos(th);
    const b = rho * Math.sin(th);
    // The projection, run backwards. See the note at the top.
    d.copy(C)
      .addScaledVector(E, Math.tan(a * lake.rx))
      .addScaledVector(N, Math.tan(b * lake.ry))
      .normalize()
      .multiplyScalar(R + lift);
    pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;

    // Deep in the middle, pale at the rim, and `edge` is already 0 at the
    // centre and 1 at the shore. Smoothstepped over the last SHALLOW of it so
    // the shallows have a soft inner boundary and a hard outer one, which is
    // the way round a shore actually looks.
    if (flat) mix.copy(flat);
    else {
      const s = Math.max(0, (edge - (1 - SHALLOW)) / SHALLOW);
      mix.copy(ONE).lerp(rim2, s * s * (3 - 2 * s));
    }
    col[i * 3] = mix.r; col[i * 3 + 1] = mix.g; col[i * 3 + 2] = mix.b;

    // UVs in the lake's own parameter space, which is what makes the glint
    // sheet tile without a seam: (a, b) is continuous across the whole disc and
    // periodic round it. Scaled by the aspect so the squiggles are not stretched
    // along the lake's long axis.
    uv[i * 2] = (a * GLINT_TILES * (lake.rx / lake.ry) + 1) / 2;
    uv[i * 2 + 1] = (b * GLINT_TILES + 1) / 2;
  };

  put(0, 0, 0, 0);
  for (let r = 1; r <= RINGS; r++) {
    // Biased outward — see RING_BIAS. The rim ring lands exactly on 1 whatever
    // the bias, which is the one value that has to be exact.
    const t = (r / RINGS) ** RING_BIAS;
    for (let c = 0; c <= COLS; c++) {
      const th = (c / COLS) * Math.PI * 2;
      put(1 + (r - 1) * (COLS + 1) + c, t * rim[c] * scale, th, t);
    }
  }

  // WOUND COUNTERCLOCKWISE SEEN FROM ABOVE THE WATER, which is what makes these
  // triangles face the sky rather than the planet's core.
  //
  // Worth stating because it is not arbitrary and it is invisible when wrong.
  // `localFrame` hands back east and north such that east × north is the outward
  // normal, so in the (a, b) parameter space here, going the way θ increases is
  // counterclockwise seen from outside. A triangle listed in that order is
  // front-facing. Listed the other way the whole pond is back-face culled and
  // renders as nothing at all — not as a dark pond, not as a flicker, as bare
  // ground — which is exactly what the first build did.
  const idx = [];
  // The innermost ring fans off the single centre vertex.
  for (let c = 0; c < COLS; c++) idx.push(0, 1 + c, 1 + c + 1);
  for (let r = 1; r < RINGS; r++) {
    const a0 = 1 + (r - 1) * (COLS + 1);
    const b0 = 1 + r * (COLS + 1);
    for (let c = 0; c < COLS; c++) {
      idx.push(a0 + c, b0 + c, a0 + c + 1);
      idx.push(a0 + c + 1, b0 + c, b0 + c + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ------------------------------------------------------------------ the line
//
// The pen round a pond: a RIBBON laid along the rim, not a wider copy of it.
// See the note at RING_W for what that fixes.
//
// IT IS MEASURED IN RADIANS ON THE SPHERE, not in the lake's own parameter, and
// that is the one idea the rest follows from. The parameter (rho, theta) is
// anisotropic — a step of rho is rx of a step at one bearing and ry at another —
// so any width expressed in it comes out fatter on the long axis. Multiplying
// through by the radii first, u = rho·cos(theta)·rx and v = rho·sin(theta)·ry,
// gives a plane where distance means one thing everywhere; the line is offset
// along the rim's own normal THERE, and only then is the whole thing pushed back
// onto the sphere through the same gnomonic door the mesh came through.
//
// The normal is taken from the curve rather than assumed radial, because the rim
// wobbles: on a lobe the outward direction and the direction away from the
// centre are visibly not the same, and a line offset radially would fatten and
// pinch wherever the shore turns. Sampled either side rather than
// differentiated, since `lakeRim` is a short sum of cosines and two extra
// evaluations are cheaper than being clever.
//
// The ticks ride in the same buffers as separate quads. They are the same pen
// on the same drawing and there is no reason to spend a second draw call on
// them.
//
// `pass` is which of the boil's drawings this is — see RING_BOIL. Everything
// that makes this pass differ from the others is driven from the one phase it
// derives, so there is exactly one place to look when the shore is misbehaving.
function ringGeo(R, lake, pass = 0) {
  const C = new THREE.Vector3();
  const E = new THREE.Vector3();
  const N = new THREE.Vector3();
  dirFromLatLon(lake.lat, lake.lon, C);
  localFrame(C, E, N);

  const TAU = Math.PI * 2;
  const pos = [];
  const idx = [];
  const d = new THREE.Vector3();
  const phase = pass * PASS_STEP;

  // WHERE THIS PASS PUT THE LINE, as a multiple of RING_BOIL to be laid along
  // the rim's normal. Three harmonics again, and all three periodic in a whole
  // turn so the ring still closes on itself — a wobble that did not come back
  // to where it started would leave a step in the shore at theta zero.
  //
  // The wavelengths are LONG (four, seven and eleven per lap) because that is
  // what redrawing looks like: a hand misses a curve by a little over a long
  // sweep. Short wavelengths here would be the line vibrating, which is a
  // different and much worse thing.
  const wander = (th) => (
    Math.sin(th * 4 + phase * 1.7) * 0.52
    + Math.sin(th * 7 - phase * 2.3) * 0.31
    + Math.sin(th * 11 + phase * 3.1) * 0.17
  );

  // A bearing's point on the shore, in radians on the sphere.
  const shore = (th) => {
    const rho = lakeRim(th, lake);
    return [rho * Math.cos(th) * lake.rx, rho * Math.sin(th) * lake.ry];
  };

  // ...and the outward normal there, from the curve either side of it.
  const step = TAU / RING_COLS * 0.5;
  const frame = (th) => {
    const [u, v] = shore(th);
    const [ua, va] = shore(th + step);
    const [ub, vb] = shore(th - step);
    let tx = ua - ub;
    let ty = va - vb;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // (ty, -tx) is outward for a curve walked the way theta increases, which is
    // counterclockwise seen from above the water — the same handedness the
    // body's winding note sets out.
    return [u, v, ty, -tx];
  };

  const put = (u, v) => {
    d.copy(C)
      .addScaledVector(E, Math.tan(u))
      .addScaledVector(N, Math.tan(v))
      .normalize()
      .multiplyScalar(R + LIFT + LAYER + RING_LIFT);
    pos.push(d.x, d.y, d.z);
    return pos.length / 3 - 1;
  };

  // How much pen is touching the paper at a given turn: 1 normally, easing to 0
  // through a gap's shoulder and staying there across its core. Multiplied into
  // the WIDTH rather than into an opacity, so a break thins away to a point and
  // the bare stretch is genuinely bare — a fade would read as an airbrush, and
  // this is a pen.
  const ink = (turn) => {
    let k = 1;
    for (const [at, half] of RING_GAPS) {
      // Where this pass happened to lift — see GAP_DRIFT. Keyed off the gap's
      // own position as well as the phase, so the three breaks drift
      // independently rather than sliding round the pond in convoy.
      const here = at + Math.sin(phase * 1.9 + at * 31) * GAP_DRIFT;
      const off = Math.abs(((turn - here + 0.5) % 1 + 1) % 1 - 0.5);
      if (off >= half) continue;
      const t = off / half;
      const s = t <= GAP_CORE ? 0 : (t - GAP_CORE) / (1 - GAP_CORE);
      k = Math.min(k, s * s * (3 - 2 * s));
    }
    return k;
  };

  for (let c = 0; c <= RING_COLS; c++) {
    const turn = c / RING_COLS;
    const th = turn * TAU;
    const [u, v, nx, ny] = frame(th);
    // The pen off the rim by this pass's wander, then the ribbon laid either
    // side of where it ended up. The NORMAL is the rim's own, un-wandered: the
    // offset is small and smooth, so borrowing the true curve's normal costs
    // nothing and saves differentiating a curve that only exists to be drawn.
    const off = wander(th) * RING_BOIL;
    const cu = u + nx * off;
    const cv = v + ny * off;
    const w = RING_W * Math.max(0.25, press(th, phase)) * ink(turn);
    put(cu - nx * w, cv - ny * w);
    put(cu + nx * w, cv + ny * w);
  }
  for (let c = 0; c < RING_COLS; c++) {
    const i = c * 2;
    idx.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
  }

  // A stroke about (u, v), `len` long down (dx, dy) and `wid` across at its
  // fattest — a little ribbon of its own rather than a quad.
  //
  // THE TAPER IS THE WHOLE OF IT, and it took two goes. A quad was the obvious
  // build and gave three brown BRICKS lying by the water: square ends read as
  // printed, and nothing else on this planet has them. A plain half sine fixed
  // the ends and overshot into the other ditch — pointed at both tips and
  // fattest dead centre is a LEAF, and three leaves by a pond is a thing the
  // player will try to pick up.
  //
  // So the sine is clamped: it reaches full width within the first sixth and
  // holds it, which is a dash with rounded tips rather than a lens. That is
  // what a small stroke of a round nib actually leaves — the pen is at full
  // width almost immediately and the taper is only the touch-down and the lift.
  const stroke = (u, v, dx, dy, len, wid) => {
    const px = -dy;
    const py = dx;
    let prev = 0;
    for (let s = 0; s <= TICK_SEGS; s++) {
      const t = s / TICK_SEGS;
      const w = wid * Math.min(1, Math.sin(t * Math.PI) * 3.2);
      const cu = u + dx * len * (t - 0.5);
      const cv = v + dy * len * (t - 0.5);
      const i = put(cu - px * w, cv - py * w);
      put(cu + px * w, cv + py * w);
      if (s > 0) idx.push(prev, prev + 2, prev + 1, prev + 1, prev + 2, prev + 3);
      prev = i;
    }
  };

  for (const tick of RING_TICKS) {
    for (let j = 0; j < TICK_LEN.length; j++) {
      const th = (tick.at + (j - 1) * TICK_STEP) * TAU;
      const [u, v, nx, ny] = frame(th);
      // Out past the line by its own width and a little air, then leaned off
      // radial — the reference's ticks sit at a slant, not on spokes.
      //
      // THE LINE'S OWN WANDER IS ADDED IN, so the ticks travel with the stroke
      // they belong to instead of standing still while it breathes past them.
      // They lean a little differently each pass too: they are three flicks of
      // the same wrist, and the wrist is what is being redrawn.
      const off = wander(th) * RING_BOIL;
      const cu = u + nx * (RING_W + TICK_OUT + off);
      const cv = v + ny * (RING_W + TICK_OUT + off);
      const lean = tick.tilt + Math.sin(phase * 3.3 + j * 1.7) * 0.11;
      const cos = Math.cos(lean);
      const sin = Math.sin(lean);
      stroke(cu, cv, nx * cos - ny * sin, nx * sin + ny * cos, TICK_LEN[j], TICK_W);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// --------------------------------------------------------------- the glints
//
// One texture for every pond, painted once. It is a tiling sheet, so the same
// canvas serves a lake and a pond at different scales without either looking
// like the other.
let GLINT_TEX = null;

function glintTexture() {
  if (GLINT_TEX) return GLINT_TEX;
  GLINT_TEX = new THREE.CanvasTexture(paintGlints());
  GLINT_TEX.colorSpace = THREE.SRGBColorSpace;
  GLINT_TEX.wrapS = THREE.RepeatWrapping;
  GLINT_TEX.wrapT = THREE.RepeatWrapping;
  return GLINT_TEX;
}

// The wave lines' three drawings, shared by every pond the same way — see
// NAMI_FRAMES in art.js for why there are three of one picture. driftWater
// flips which one is worn.
let NAMI_TEX = null;

function namiTextures() {
  if (NAMI_TEX) return NAMI_TEX;
  NAMI_TEX = [];
  for (let f = 0; f < NAMI_FRAMES; f++) {
    const t = new THREE.CanvasTexture(paintNami(f));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    NAMI_TEX.push(t);
  }
  return NAMI_TEX;
}

// ---------------------------------------------------------------- the build
//
// Returns the three meshes and the material list the caller has to tint. The
// caller adds them to the world and decides their render order, because this
// file knows what a pond looks like and scene.js knows what else is out there.
export function buildLake(R, lake) {
  // The outline. Its colour is written per hour by waterHour, like the body's —
  // NOT by putting it in `tintables`, which would erase it. See lakeGeo.
  //
  // `transparent: true` on a line that is fully opaque, and it is not an
  // oversight: three.js draws every opaque material before any transparent one
  // and renderOrder only sorts WITHIN those two groups. The water and its two
  // sheets are transparent, so an opaque line — whatever its order — would be
  // painted first and then covered by the pond it outlines. This was free while
  // the ink lived underneath and wanted to go first; a line drawn ON the water
  // has to join the queue the water is in.
  // Three drawings of the line, one per pass of the boil — see RING_BOIL. Built
  // here rather than shared between ponds like the sheets above are, because a
  // ring is the shape of ITS OWN lake and there is nothing to share.
  //
  // Cheap enough not to think about: a pass is under five hundred vertices, so
  // all three for both ponds come to about forty kilobytes of static buffer,
  // uploaded once. The alternative — rewriting one buffer every boil step — is
  // more code and more work per frame to save memory nobody is short of.
  const ringGeos = [];
  for (let f = 0; f < NAMI_FRAMES; f++) ringGeos.push(ringGeo(R, lake, f));

  const ink = new THREE.Mesh(
    ringGeos[0],
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
  );

  const body = new THREE.Mesh(
    lakeGeo(R, lake, 1, LIFT + LAYER),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      // Not much: the bed under it is there to be a bed, not to be read
      // through. At 0.90 it keeps the tick marks of the field from showing
      // through as grass growing on the bottom.
      //
      // What this tenth actually admits changed with the outline. It used to be
      // the ink disc, which ran under the whole pond and quietly took every
      // pond a tenth of the way toward the colour of its own edge; now it is the
      // bed, which is painted the water's colour, so the tenth agrees with the
      // nine and the pond is the colour the palette says it is.
      opacity: 0.90,
      depthWrite: false,
      // THE POND STAMPS ITSELF INTO THE STENCIL, which is what lets a character
      // have a reflection in it. A reflection hangs below the waterline, inside
      // the planet, where ordinary depth testing hides it completely; the
      // stencil is how it is let back out, and only in the right places.
      //
      // The subtlety that makes this work is `stencilZPass` — write only where
      // the water PASSED the depth test, that is, only where the water is
      // actually visible. So the mark is the pond's own wobbled outline for
      // free, with no shape to pass to a shader, and anything standing in front
      // of the water leaves a hole in it: a tree between you and the pond blocks
      // the water, so nothing is stamped there, so no reflection is painted over
      // the tree. Occlusion and clipping turn out to be the same mechanism.
      stencilWrite: true,
      stencilRef: WATER_STENCIL,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
    }),
  );

  // The pen. It shares the body's geometry like the glints do — coplanar is
  // safe when nobody writes depth and the order is fixed — and its UVs, so the
  // two sheets tile at the same scale and only their clocks differ.
  const nami = new THREE.Mesh(
    body.geometry,
    new THREE.MeshBasicMaterial({
      map: namiTextures()[0],
      transparent: true,
      opacity: NAMI_ALPHA,
      depthWrite: false,
    }),
  );

  const glint = new THREE.Mesh(
    body.geometry,
    new THREE.MeshBasicMaterial({
      map: glintTexture(),
      transparent: true,
      // Additive, because a highlight adds light. Multiplied it would darken
      // the water everywhere the sheet is empty, which is most of it.
      blending: THREE.AdditiveBlending,
      opacity: 0.55,
      depthWrite: false,
    }),
  );

  // Explicit, because none of these write depth and left alone they would sort
  // by distance — which for four coplanar sheets is a coin toss every frame.
  //
  // The nami sheet sits at 4.7 for the fish: they swim at 4.5 (see FISH_ORDER),
  // so a wave line passes OVER a fish the way the glints always have, which is
  // the surface being between you and the animal — draw the lines under them and
  // a fish is a sticker the water's own marks politely part around.
  //
  // THE LINE GOES LAST, at the top of the pile, and that is the change the
  // drawn outline brought: the old ink was a disc UNDER the water at 3, where
  // the water's own edge covered its inner half and made the ring look narrower
  // than it was built. A ribbon straddles the rim and has to be over everything
  // for both halves to land — including the glints, which would otherwise lay
  // white sparks along the pen and fray it.
  body.renderOrder = 4;
  nami.renderOrder = 4.7;
  glint.renderOrder = 5;
  ink.renderOrder = 5.6;

  const centre = new THREE.Vector3();
  dirFromLatLon(lake.lat, lake.lon, centre);

  return {
    ink,
    body,
    nami,
    glint,
    meshes: [ink, body, nami, glint],
    glintMat: glint.material,
    namiMat: nami.material,
    ringGeos,
    // Handed out ready-made rather than rebuilt from lat/lon by every caller.
    // Whoever asks how near a pond is asks every frame, for everybody.
    centre,
    lake,
  };
}

// What the hour does to a pond. Called from the daylight blend with the tint,
// the colour of the sky at its feet, and the two numbers from LOOK.
//
// NONE of these materials are in `tintables`. All three want something other
// than the plain tint write, and each for its own reason:
//
//   body   is mostly a mirror, so it LERPS toward the sky rather than being
//          multiplied by the hour. That is what lets it go orange at sunset
//          instead of going a muddy teal — see the note in lakeGeo.
//
//   ink    is an outline and stays one, so it takes the tint like the trees'
//          ink does. It gets a third of the mirror on top, and only a third:
//          enough that a sunset does not leave an ice-blue line drawn round a
//          warm pond, not so much that the line stops being a line.
//
//   glint  is additive, so the hour cannot DIM it by tinting — that would tip
//          the highlights blue and leave them just as bright, which is why the
//          brightness is an opacity. But additive light can absolutely be
//          COLOURED, and colouring it is the best thing in this function: a
//          highlight is a piece of sky lying on the water, so it is painted the
//          sky's own colour and a sunset puts orange sparks on the pond.
//
//   nami   is drawn ink, so it takes the tint straight — the same multiply
//          `tintables` gives every outline on the planet, done here only
//          because this material cannot be in that list (the list writes
//          colour flat, and would work today; being here keeps all four of the
//          water's materials answering one function). At noon the tint is
//          near-white and the pen is the pen; at night the lines sink into the
//          darkened water like every other line sinks into the grass.
//
// HOW MUCH THE BODY MOVES IS THE THING TO BE CAREFUL WITH, and the first pass
// got it badly wrong by being generous. A pond's own colour is a saturated
// blue-green and the evening sky is a warm tan — near enough opposite each other
// — so a lerp between them passes through GREY. At 0.62 the sunset pond came out
// a flat pale putty: it had the sky's hue and none of its own, and read as wet
// sand. The fix is not a different target, it is less of it. What actually turns
// a pond orange at sunset is its highlights, which are handled above; the body
// stays water and merely leans.
//
// Night is the exception and keeps a strong pull, because there the sky at the
// horizon is a deep blue — a NEIGHBOUR of the water's own hue rather than its
// opposite — so the lerp darkens without draining it.
export function waterHour(ponds, tint, sky, mirror, glint) {
  // WATER IS ALWAYS DARKER THAN THE SKY IT IS MIRRORING, and leaving this out is
  // the one thing that stopped the sunset working. A pond throws back some of
  // what lands on it and swallows the rest, so the reflection is the sky at
  // maybe three quarters strength — which is exactly the difference between
  // water catching a sunset and a puddle of light lying in the grass.
  //
  // It went unnoticed at night, where the sky at the horizon is already darker
  // than the water's own blue and the lerp therefore darkened it anyway. At
  // sunset the sky is far paler than the water, the lerp ran the other way, and
  // the pond came out a flat cream — the right HUE, and so bright it read as
  // sand. Nothing about the hue needed fixing; it was only ever too bright.
  _sky.copy(sky).multiplyScalar(REFLECT);
  for (const p of ponds) {
    p.body.material.color.copy(tint).multiply(_deep).lerp(_sky, mirror);
    p.ink.material.color.copy(tint).multiply(_ink).lerp(_sky, mirror * 0.34);
    // The highlights ARE the sky, so they are painted it — mixed only a little
    // way back toward white so they stay highlights rather than becoming a wash
    // of whatever colour the hour is.
    p.glintMat.color.copy(sky).lerp(_white, 0.35);
    p.glintMat.opacity = glint;
    p.namiMat.color.copy(tint);
  }
}
const _white = new THREE.Color(1, 1, 1);
const REFLECT = 0.76;
const _sky = new THREE.Color();
const _deep = new THREE.Color(PAL.waterDeep);
const _ink = new THREE.Color(PAL.waterInk);

// The surface animates: the glints crawl, and the wave lines and the shore both
// boil. One clock for every pond on the planet, driven by scene.js's update,
// because two ponds sparkling out of step with each other would be two weathers.
//
// ONE PASS NUMBER DRIVES BOTH BOILS, deliberately. A cel is redrawn all at once,
// so an animator who reboils the water reboils the shore in the same breath; two
// clocks here would be two hands working on one drawing, which is a thing the
// eye catches even when it cannot say why.
//
// The map offset rather than the UVs: the geometry never changes and the texture
// is already set to repeat, so the crawl is a few floats a frame against
// rewriting a buffer.
//
// Both boils are SWAPS — a texture for the waves, a whole geometry for the
// shore — and both are guarded, so on the frames that change nothing (nearly all
// of them) this costs two comparisons. The drift offset is then written to
// whichever wave drawing is live; all three share one drift, so a flip never
// teleports the lines it is wiggling.
export function driftWater(ponds, seconds) {
  const nami = namiTextures();
  const pass = Math.floor(seconds / NAMI_STEP) % NAMI_FRAMES;
  const frame = nami[pass];
  for (const p of ponds) {
    p.glintMat.map.offset.set(
      (seconds * GLINT_DRIFT) % 1,
      (seconds * GLINT_DRIFT * 0.43) % 1,
    );
    if (p.namiMat.map !== frame) p.namiMat.map = frame;
    // Negative along u: the pen drifts against the light, which is two currents
    // for the price of a sign.
    frame.offset.set(
      -((seconds * NAMI_DRIFT) % 1),
      (seconds * NAMI_DRIFT * 0.31) % 1,
    );
    const ring = p.ringGeos[pass];
    if (p.ink.geometry !== ring) p.ink.geometry = ring;
  }
}
