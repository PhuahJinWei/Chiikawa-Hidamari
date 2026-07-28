// The trees, built rather than drawn.
//
// The file is named for foliage rather than for trees because a bush was built
// here too for a while — see the note where it stood. Everything else standing
// on the planet is still a card, and for a tuft of grass that is the right
// answer: it has no other side.
//
// The rule furniture.js states — CARDS FOR WHAT YOU LOOK AT, GEOMETRY FOR WHAT
// YOU MOVE AROUND — is what puts a tree on the far side of the line from a tuft.
// On a planet 50 units around with a horizon 4.8 off, a tree is something you
// walk up to, walk past, stand under and look back at, and a card cannot survive
// any of that. It has to be re-aimed every time your gaze moves, and the whole
// apparatus of aiming it — squaring to the view axis rather than to where you
// are stood, turning only while the camera is already sweeping — exists to hide
// the fact that it is turning at all.
//
// A tree that is real does not need hiding. It holds still because it is still.
//
// ----------------------------------------------------------------- the look
//
// The cast STAY CARDS, and that is the point of this rather than a limitation
// of it. Paper actors in a real world is the arrangement the app already was
// indoors — a drawn Chiikawa on a built rug — and this only extends it to the
// rest of the planet, so that the world has one rule instead of three. What the
// three used to be, and what was odd about them, is set out in
// CONFIG.foliage3d.
//
// It is built to the DRAWINGS rather than to a fresh idea of a tree. Every
// proportion in SHAPE below is measured off `tree-1.png` and its siblings, so a
// card and a shell standing side by side are the same tree twice, and the only
// difference is which of them turns when you walk.
//
// ------------------------------------------------------------------ the ink
//
// The heavy line is an inverted hull, exactly as the furniture and the house
// wear it: a second copy of each shape, fractionally fatter, with its faces
// turned inside out, so it survives only where it pokes out past the real one —
// which is a silhouette. One extra draw per part and no shader.
//
// A tree gets TWO hulls, not one, and the drawings say so: the canopy has a
// closed outline and the trunk has its own, which runs up behind the leaves and
// stops. That is what two separate meshes give for nothing, since each hull is
// depth-tested like anything else. The rule the futon sets out is the one being
// followed — ONE MESH PER THING YOU WOULD DRAW A LINE AROUND — and the
// corollary matters as much: a canopy is a single closed surface with its lumps
// IN it rather than a cluster of overlapping balls, because a cluster is a bag
// of separate hulls and every seam between them comes out inked.

import * as THREE from 'three';
import { PAL } from './config.js';
import {
  makeRandom, paintTreeCanopy, paintTreeBark, paintStumpSkin, STUMP_SPLIT, TREE_SEED,
} from './art.js';

// Every proportion, as a fraction of the tree's total height, measured off the
// drawings. Widths are full widths; `canopyY` is the centre of the canopy above
// the ground.
//
// The trunk reaches a good deal further up than you can see it: `trunkTop` is
// well inside the canopy, and has to be. It is the one number here that is not
// measured off the drawing, because the drawing has nothing to measure — the
// trunk simply stops being visible at the leaves, and where it stops being
// visible is not where it stops.
// `canopyH` is a shade taller than the 0.679 the drawing measures, and that is
// a correction rather than a liberty. A card is a billboard and keeps its drawn
// aspect from everywhere; a ball is foreshortened, and this one is always seen
// from BELOW — its middle sits 2.6 up against an eye at 1.7 — so a canopy built
// at the drawn ratio renders at about 1.11 wide-to-tall against the drawing's
// 1.25. Built a little tall, it arrives on screen the shape it was drawn.
// `canopyW` is under the drawing's own 0.545, and that is a correction for the
// same reason `canopyH` is over it — the two ends of one difference between a
// card and a solid. A card is flat and stands at the trunk, so all of it is at
// the trunk's distance. A ball's near face stands a whole radius CLOSER, which
// at the six or seven units you actually look at one of these from projects
// some fifteen percent bigger. Built to the drawn width the shell came out
// visibly the larger tree beside the card it replaced, and the planet's sense
// of scale is tuned against the card. Narrowed here, the two render the same
// size, which is what "the same tree twice" has to mean.
const SHAPE = {
  canopyW: 0.515,
  canopyH: 0.730,
  canopyY: 0.652,
  trunkW: 0.170,     // at its narrowest, near the top
  trunkFlare: 1.35,  // ...and how much wider again the roots spread it
  trunkTop: 0.58,
  bury: 0.030,       // how far the roots start below the grass
};

// How fat the ink shell is, as a fraction of the tree's height.
//
// MEASURED off the drawings, and it can be, because an inverted hull round a
// convex shape projects to very nearly its own thickness: fill and hull are two
// spheres a hair apart, so the ring between them is `INK` wide on screen and not
// some function of how the surface is turned. The drawings carry a line about
// eight thousandths of the tree's height, which is 0.031 at the height these are
// built at. A shade over that here, because a weight that reads on a drawing at
// its own resolution wants help at a tree's worth of phone screen.
//
// It scales with the tree, unlike the furniture's, and that is deliberate: the
// three landmark trees are the ordinary drawings at nearly twice the size, so a
// card already grows its line with it. A constant weight would make the big
// trees read as the same tree seen closer rather than as bigger trees.
const INK = 0.0089;

// The lumps, as two bands of plane waves summed over the surface.
//
// Bumps placed as individual blisters was the first way and it does not scale:
// the drawings scallop their edge at about a fifteenth of the canopy's width,
// and covering a whole ball at that size takes some six hundred of them plus a
// mesh fine enough to resolve each one — which is minutes of arithmetic at load
// for a shape nobody will ever count the bumps on. A sum of waves costs one dot
// product and one sine per wave per vertex whatever the frequency, so the fine
// band is as cheap as the coarse one.
//
// `LOBE` is what stops the canopy being an ellipse — a few slow swells, so one
// side is fuller than the other. `SCALLOP` is the drawings' own edge: at a
// frequency of 26 the crests land about a thirteenth of the canopy's width
// apart, against the drawings' fifteenth.
//
// `rms` is the displacement each band contributes as a fraction of the canopy's
// radius, and is the pair of numbers to turn. Much past 0.04 on the lobes and it
// stops being an egg; much past 0.02 on the scallops and the edge goes from
// scalloped to shaggy.
const LOBE = { n: 6, freq: 4.5, rms: 0.025 };
const SCALLOP = { n: 12, freq: 32, rms: 0.020 };

// Enough rings and columns to resolve the finer band, and no more — this number
// is downstream of SCALLOP.freq rather than free, and raising one without the
// other only facets the crests. At 176 columns the scallop wave gets about five
// and a half samples per crest, which is where a bump this shallow stops
// looking chipped.
//
// It is also what sets the cost of the whole idea: 15k vertices a canopy,
// doubled by the hull, times the three drawings — and the thirteen trees on the
// planet share those three between them, so this is paid three times and not
// thirteen.
//
// THE DRAWN EDGE IS STILL FINER THAN THIS, and it is worth being honest about
// why rather than raising the numbers until it matches. tree-1.png wobbles its
// outline about eighty times around, which as geometry means a wavelength of
// 0.08 radians, some 480 columns, and 140k vertices a canopy — for an edge you
// can only ever see at the silhouette. A drawn line and a scalloped surface are
// not the same thing and this does not chase the last of it: the shell reads a
// touch cleaner than the card, which is the one visible difference between them.
const RINGS = 88;
const COLS = 176;

// The trunk needs far less of both. It is a tapered tube with a flare at the
// foot, and the only thing it has to resolve is the root lobes.
const T_RINGS = 20;
const T_COLS = 30;

// How many root lobes the flare breaks into, and how deep. Both periodic over a
// full turn, so the seam closes on itself without a join to hide.
const ROOTS = 5;

// ------------------------------------------------------------------- fields

// A band of plane waves in random directions. Evaluated on the unit sphere it
// is a smooth, isotropic, seamless bumpiness — no lattice to spot, and no seam
// to fix, because a plane wave is a function of the direction itself rather than
// of any parametrisation of it.
function band({ n, freq, rms }, rand) {
  // The sum of n independent sines has an amplitude sqrt(n/2) times any one of
  // them, so this is what makes `rms` mean what it says whatever `n` is.
  const amp = rms / Math.sqrt(n / 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const z = 1 - 2 * rand();
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const a = rand() * Math.PI * 2;
    out.push({
      kx: Math.cos(a) * r * freq,
      ky: z * freq,
      kz: Math.sin(a) * r * freq,
      phase: rand() * Math.PI * 2,
      amp,
    });
  }
  return out;
}

function lumpAt(waves, x, y, z) {
  let s = 0;
  for (const w of waves) s += w.amp * Math.sin(w.kx * x + w.ky * y + w.kz * z + w.phase);
  return s;
}

// ------------------------------------------------------ the ball they share

// A closed lumpy ball, built by hand rather than from SphereGeometry, and for
// two reasons that both come back to the hull.
//
// The displacement has to happen before the normals are computed, or the ink
// shell would be pushed out along the normals of a smooth sphere and the line
// would cross the scallops instead of following them.
//
// And the seam has to be dealt with deliberately. A wrapped texture needs the
// first column of vertices duplicated so the two sides of the lap can carry
// u = 0 and u = 1 — but a duplicated pair averages different neighbours, so
// three.js hands each of them a slightly different normal, and the hull is
// pushed two slightly different ways. That is a hairline split running pole to
// pole up the outline. The fix is one pass at the end: give both halves of the
// pair the same normal, which is the one they would have had if they had never
// been split.
//
// Parameterised rather than hard-wired to the canopy, since the bush that used
// to live in this file was the same call with other numbers — how wide, how
// tall, how far the middle sits above the ground, and how finely it is cut up.
function lumpyBall(rx, ry, cy, waves, pad, RINGS, COLS) {
  const count = 2 + (RINGS - 1) * (COLS + 1);
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let p = 0;
  let q = 0;

  const put = (theta, phi, u, v) => {
    const st = Math.sin(theta);
    const dx = st * Math.sin(phi);
    const dy = Math.cos(theta);
    const dz = st * Math.cos(phi);
    const r = 1 + lumpAt(waves, dx, dy, dz);
    pos[p++] = dx * r * rx;
    pos[p++] = cy + dy * r * ry;
    pos[p++] = dz * r * rx;
    uv[q++] = u;
    uv[q++] = v;
  };

  // The poles take the lump too. Left at radius 1 while everything around them
  // moved, they would sit in a dimple of exactly the wave's amplitude — a pin
  // through the crown and another through the base.
  put(0, 0, 0.5, 1);
  for (let i = 1; i < RINGS; i++) {
    const theta = (i / RINGS) * Math.PI;
    for (let j = 0; j <= COLS; j++) {
      put(theta, (j / COLS) * Math.PI * 2, j / COLS, 1 - i / RINGS);
    }
  }
  put(Math.PI, 0, 0.5, 0);

  const ring = (i) => 1 + (i - 1) * (COLS + 1);
  const bot = 1 + (RINGS - 1) * (COLS + 1);
  const idx = [];
  for (let j = 0; j < COLS; j++) {
    idx.push(0, ring(1) + j, ring(1) + j + 1);
    idx.push(bot, ring(RINGS - 1) + j + 1, ring(RINGS - 1) + j);
  }
  for (let i = 1; i < RINGS - 1; i++) {
    for (let j = 0; j < COLS; j++) {
      const a = ring(i) + j;
      const b = ring(i + 1) + j;
      const c = ring(i + 1) + j + 1;
      const d = ring(i) + j + 1;
      idx.push(a, b, c, a, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  healSeam(g, RINGS, COLS);
  if (pad) inflate(g, pad, cy);
  return g;
}

// --------------------------------------------------------------- the trunk

// A tapered tube that flares into roots at the foot and runs on up into the
// leaves. Closed at both ends: the hull is drawn from its inside faces, so an
// open tube would be a tube of ink seen down its own barrel.
//
// The taper is gentle and the flare is not, which is the drawings' shape and
// also a tree's. Everything below about a sixth of the way up belongs to the
// roots, and they are lobed rather than round — a cone would read as a plant pot.
// How wide the trunk is at a given height above the grass, ignoring the root
// lobes — the mean the lobes ride on.
//
// Exported for two readers, and they ask about opposite ends of the trunk. The
// COLLISION radius (see SOLIDS in sphere.js) is this at y = 0, where the roots
// meet the grass and so where your feet arrive: it is the widest the tree is
// anywhere you can touch it, and colliding on anything narrower would let you
// stand in the root flare. The other is _syncTrunk in scene.js, which asks at
// eye height and is now only a guard against the few ways left to end up inside
// a trunk — being airborne over one, or a tree registered after you were already
// stood there. It used to be load-bearing, because walking into one was a step
// you were allowed to take.
//
// Homogeneous in (h, y), so a tree at another scale can be asked about by
// scaling both — which is what lets one geometry serve thirteen trees.
export function trunkRadius(h, y) {
  const rT = SHAPE.trunkW * 0.5 * h;
  const yBot = -SHAPE.bury * h;
  const yTop = SHAPE.trunkTop * h;
  const t = Math.min(1, Math.max(0, (y - yBot) / (yTop - yBot)));
  const rise = Math.max(0, 1 - t / 0.30);
  return rT * (1.10 - 0.18 * t + SHAPE.trunkFlare * (rise ** 1.7));
}

export const TRUNK_TOP = SHAPE.trunkTop;

// The canopy's horizontal radius at a height above the grass, and 0 above the
// crown or below the skirt where there are no leaves.
//
// The mean the lumps ride on, like trunkRadius, plus a tenth for their crests:
// the two wave bands together come to about 0.032 of the radius rms.
function canopyRadius(h, y) {
  const rx = SHAPE.canopyW * 0.5 * h;
  const ry = SHAPE.canopyH * 0.5 * h;
  const t = (y - SHAPE.canopyY * h) / ry;
  if (t <= -1 || t >= 1) return 0;
  return rx * Math.sqrt(1 - t * t) * 1.10;
}

// How far from a tree's axis you have to stop, so that an eye `eyeY` off the
// ground stays `clear` away from every part of it. This is the tree's entry in
// SOLIDS — see sphere.js — and the whole of what makes one solid.
//
// It is not the trunk, which was the obvious first answer and is wrong for most
// of these trees. trunkRadius decides where your LEGS stop; the canopy's skirt
// hangs below eye height on all the ordinary ones — an average one spans 1.27 to
// 4.49 against an eye at 1.7 — so walking at a tree puts your face in the leaves
// a good half-stride before your feet reach the roots. That is the same trap the
// house's shell documents: the near plane is 0.3, so an eye within 0.3 of the
// leaf surface has it sawn open in front of it and is looking at the INSIDE of
// the canopy, which renders as a screenful of flat green. Measured with only the
// trunk solid, a mid-sized tree stopped the player 0.10 clear of its leaves.
//
// Nor is it the canopy measured at eye height, which was the second answer and
// is wrong by less. A canopy is an egg and it WIDENS above you, so the nearest
// leaf is never the one level with your eye — it is one somewhere overhead, and
// how far overhead depends on the tree. Measured at the top of a hop against the
// two biggest trees, an eye-height rule left 0.28 and 0.30 where it had promised
// 0.30: right for nine trees and a hair short on the two that a player is most
// likely to walk up to.
//
// So it asks the profile itself rather than any one height of it. For each slice
// of the tree within `clear` of the eye VERTICALLY, an eye at radius d is
// sqrt((d - r)² + dy²) from that slice's surface; requiring that to be at least
// `clear` gives d ≥ r + sqrt(clear² - dy²), and the widest such demand over the
// whole profile is the answer. Slices further than `clear` above or below the
// eye ask for nothing, which is what lets the roots and the crown drop out on
// their own without a special case for either.
//
// The roots come back in at the end because they are the one part that can be
// wider than anything near your eye while being far below it — on the landmark
// trees that is exactly what happens, and they stop you at the flare with the
// whole crown to look up into, which is right.
//
// The eye is given as a RANGE — standing height to the top of a hop — and not
// as a single height, because it passes through every value between and the
// binding one is not always at either end.
//
// Taking the apex alone is the obvious reading and it fails quietly. A canopy
// is an egg: rising toward its middle makes it wider, but rising PAST that
// middle makes it narrow again, so on the small trees a taller jump puts the
// eye nearer the crown and asks for LESS room than standing does. The standoff
// then gets set by the easier case. Measured when the hop went from 0.42 to
// 0.60, the smallest tree's stand-off actually shrank, and its clearance at
// standing height fell to 0.311 against a near plane of 0.3 — still passing,
// by eleven thousandths, entirely by luck.
//
// So each slice is judged against the worst eye that can reach it, which is the
// one nearest its own height: clamp the slice into the range and the ends take
// care of themselves. A slice level with somewhere the eye can be gets the full
// `clear`, and one outside the range is judged from whichever end is closer.
export function treeSolidRadius(h, eyeLo, eyeHi, clear) {
  let need = trunkRadius(h, 0);
  for (let y = -SHAPE.bury * h; y <= h; y += 0.02) {
    const eyeY = Math.min(Math.max(y, eyeLo), eyeHi);
    const dy = y - eyeY;
    if (Math.abs(dy) >= clear) continue;
    const r = Math.max(trunkRadius(h, y), canopyRadius(h, y));
    need = Math.max(need, r + Math.sqrt(clear * clear - dy * dy));
  }
  return need;
}

function trunkGeo(h, rand, pad) {
  const rT = SHAPE.trunkW * 0.5 * h;
  const yBot = -SHAPE.bury * h;
  const yTop = SHAPE.trunkTop * h;

  // The lobes' own phases, so the roots are not arranged symmetrically about
  // anything. Two harmonics rather than one, or five identical buttresses read
  // as a machined thing — the same trap the futon's WOBBLE table is dodging.
  const pA = rand() * Math.PI * 2;
  const pB = rand() * Math.PI * 2;

  // The flare has to be spent ABOVE the grass, and getting that wrong is what
  // made the first trunk a plank. `t` runs from the buried bottom rather than
  // from the ground, so the ground is already at t = 0.05 — and a flare that
  // fell off as sharply as this one first did (over a sixth of the trunk, to
  // the power of 2.4) had given away half its width before it broke the
  // surface. What showed was a straight-sided slab with a slight swelling in
  // the grass. Spread over a third of the trunk and eased more gently, the same
  // total spread arrives where it can be seen: two ten-thousandths of the tree
  // wider at the foot than at the shoulder, which is what the drawings show.
  const radius = (t, phi) => {
    const taper = 1.10 - 0.18 * t;
    const rise = Math.max(0, 1 - t / 0.30);
    const flare = SHAPE.trunkFlare * (rise ** 1.7);
    const lobe = 1 + 0.34 * Math.cos(ROOTS * phi + pA) + 0.14 * Math.cos(3 * phi + pB);
    return rT * (taper + flare * lobe);
  };

  const count = 2 + (T_RINGS - 1) * (T_COLS + 1);
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let p = 0;
  let q = 0;
  const put = (x, y, z, u, v) => {
    pos[p++] = x; pos[p++] = y; pos[p++] = z;
    uv[q++] = u; uv[q++] = v;
  };

  // Rings bunched toward the foot, where the flare is: an even spacing spends
  // most of them on the straight part nobody can see and resolves the roots
  // with three.
  const level = (i) => ((T_RINGS - i) / T_RINGS) ** 1.7;

  put(0, yTop, 0, 0.5, 1);
  for (let i = 1; i < T_RINGS; i++) {
    const t = level(i);
    const y = yBot + t * (yTop - yBot);
    for (let j = 0; j <= T_COLS; j++) {
      const phi = (j / T_COLS) * Math.PI * 2;
      const r = radius(t, phi);
      put(Math.sin(phi) * r, y, Math.cos(phi) * r, j / T_COLS, t);
    }
  }
  put(0, yBot, 0, 0.5, 0);

  const ring = (i) => 1 + (i - 1) * (T_COLS + 1);
  const bot = 1 + (T_RINGS - 1) * (T_COLS + 1);
  const idx = [];
  for (let j = 0; j < T_COLS; j++) {
    idx.push(0, ring(1) + j, ring(1) + j + 1);
    idx.push(bot, ring(T_RINGS - 1) + j + 1, ring(T_RINGS - 1) + j);
  }
  for (let i = 1; i < T_RINGS - 1; i++) {
    for (let j = 0; j < T_COLS; j++) {
      const a = ring(i) + j;
      const b = ring(i + 1) + j;
      const c = ring(i + 1) + j + 1;
      const d = ring(i) + j + 1;
      idx.push(a, b, c, a, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  healSeam(g, T_RINGS, T_COLS);
  if (pad) inflate(g, pad);
  return g;
}

// ------------------------------------------------------------------ shared

// Both halves of a duplicated seam column get the normal they would have had
// unsplit — see the note on canopyGeo for what this is buying.
function healSeam(g, rings, cols) {
  const n = g.attributes.normal;
  for (let i = 1; i < rings; i++) {
    const a = 1 + (i - 1) * (cols + 1);
    const b = a + cols;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const len = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / len, y / len, z / len);
    n.setXYZ(b, x / len, y / len, z / len);
  }
  n.needsUpdate = true;
}

// The ink shell's fattening. Along the normals by default — and RADIALLY, out
// from a given centre, for anything with scallops in it.
//
// Normals are the textbook answer and they have one failure mode, which the
// canopy walks straight into. Offsetting a surface along its own normals only
// stays a surface while the offset is smaller than the surface's own radius of
// curvature; inside a valley tighter than that, the offset sheets run through
// each other and the shell turns inside out over a small patch. Where that
// patch faces you it is hidden by the fill, but NEAR THE SILHOUETTE the surface
// is edge-on, so a hair of radial error projects into a long streak — which is
// what it looked like: fine dark lines lying just inside the outline, following
// it, on the top and both flanks.
//
// A radial offset cannot do that. The canopy is star-shaped about its middle —
// every ray from the centre meets it exactly once, because its radius is 1 plus
// something small — and scaling a star-shaped surface out from its own centre
// leaves it star-shaped. No self-intersection is possible at any offset.
//
// What it costs is a line that thins where the surface is turned away from
// radial: an egg of this ratio tilts up to 15 degrees off, a scallop's flank up
// to 25, so the worst case is about a quarter thinner than the crown. That is
// invisible next to what it buys, and a line that varies a little along its
// length is closer to a drawn one than a line of perfectly constant weight.
//
// The trunk keeps its normals. Its lobes are gentle and its caps need the
// offset to point along the axis, which a radial push from any centre on that
// axis cannot do.
function inflate(g, pad, centreY) {
  const P = g.attributes.position;
  const N = g.attributes.normal;
  const radial = centreY !== undefined;
  for (let i = 0; i < P.count; i++) {
    let dx = N.getX(i);
    let dy = N.getY(i);
    let dz = N.getZ(i);
    if (radial) {
      dx = P.getX(i);
      dy = P.getY(i) - centreY;
      dz = P.getZ(i);
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;
    }
    P.setXYZ(i, P.getX(i) + dx * pad, P.getY(i) + dy * pad, P.getZ(i) + dz * pad);
  }
  P.needsUpdate = true;
  g.computeBoundingSphere();
}

function texFrom(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// The ink. One material per colour, shared by everything that wears it, so
// three.js can batch them and the daylight fade has one thing to write to.
// There is one colour now that the bush has gone, and it is keyed by colour
// anyway because a second thing built here would want its own — a small thing
// drawn with a big thing's line reads as a distant big thing.
//
// It carries a one-pixel texture of its own colour, and that pixel is doing a
// job: the daylight tint WRITES `material.color` rather than multiplying it, so
// anything in `tintables` has to keep its real colour somewhere else. Every
// other tinted thing in the app keeps it in a map, so the ink keeps it in a map
// too — a 1x1 one — rather than needing a special case in setDaylight.
const INKS = new Map();
export function foliageInk(colour) {
  let mat = INKS.get(colour);
  if (mat) return mat;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const g = c.getContext('2d');
  g.fillStyle = colour;
  g.fillRect(0, 0, 1, 1);
  mat = new THREE.MeshBasicMaterial({ map: texFrom(c), side: THREE.BackSide });
  INKS.set(colour, mat);
  return mat;
}

// Every ink material made so far, for the one caller that has to hand them all
// to the daylight fade. Asked for after the scene is built, so "so far" is "all
// of them".
export function inkMaterials() {
  return [...INKS.values()];
}

// DoubleSide, and it is not laziness about winding — it is what happens when
// you walk into a tree.
//
// Trees are solid now, so walking cannot put you inside one — but flying over
// one still can, and a canopy is wide enough that being briefly within it while
// airborne is ordinary rather than exotic: at eye height the small trees' leaves
// reach about three quarters of a unit past their trunk.
// From in there the fill's front faces are turned away and culled, leaving the
// ink hull — which is drawn from its INSIDE — as the only thing in front of
// you: a screen of flat dark brown. Doubled, the fill sits nearer the eye than
// the hull does from within, wins the depth test everywhere, and you get leaves
// instead. The cost is back faces nobody sees on the other twelve trees, which
// is a rasterising cost the depth buffer throws away.
function skin(canvas) {
  return new THREE.MeshBasicMaterial({ map: texFrom(canvas), side: THREE.DoubleSide });
}

// Everything one drawing's worth of tree needs, built once and shared by every
// tree wearing it. Fourteen trees stand on the planet and there are three
// drawings, so this is the difference between three builds and fourteen.
const KITS = new Map();

function kitFor(key, h, leaf, seed) {
  let kit = KITS.get(key);
  if (kit) return kit;

  const rand = makeRandom(TREE_SEED + seed * 1031);
  const waves = band(LOBE, rand).concat(band(SCALLOP, rand));
  const pad = INK * h;
  const rx = SHAPE.canopyW * 0.5 * h;
  const ry = SHAPE.canopyH * 0.5 * h;
  const cy = SHAPE.canopyY * h;

  kit = {
    canopy: lumpyBall(rx, ry, cy, waves, 0, RINGS, COLS),
    canopyInk: lumpyBall(rx, ry, cy, waves, pad, RINGS, COLS),
    trunk: trunkGeo(h, makeRandom(TREE_SEED + seed * 1031 + 7), 0),
    trunkInk: trunkGeo(h, makeRandom(TREE_SEED + seed * 1031 + 7), pad),
    leafMat: skin(paintTreeCanopy(leaf, seed)),
    barkMat: skin(paintTreeBark()),
  };
  KITS.set(key, kit);
  return kit;
}

// One tree. `key` is the drawing it wears — the geometry and the textures are
// cached against it — and `h` is its height in world units at scale 1; a prop
// bigger or smaller than that scales the group it gets back, which is why every
// tree of a kind can share one geometry.
//
// `fills` are the materials that want the hour's tint and the lamplight, and
// they are SHARED, so a caller registering several trees should expect to be
// handed the same materials more than once.
export function buildTree(key, h, { leaf, seed, spin = 0 }) {
  const kit = kitFor(key, h, leaf, seed);
  const g = new THREE.Group();

  // The hull first, so that a hull and a fill at the same depth — which happens
  // right along the silhouette, where the two surfaces meet — resolve the way
  // every other inverted hull in this app resolves them.
  const trunkInk = new THREE.Mesh(kit.trunkInk, foliageInk(PAL.treeInk));
  const trunkFill = new THREE.Mesh(kit.trunk, kit.barkMat);
  g.add(new THREE.Mesh(kit.canopyInk, foliageInk(PAL.treeInk)));
  g.add(trunkInk);
  g.add(new THREE.Mesh(kit.canopy, kit.leafMat));
  g.add(trunkFill);

  // Turned on the spot, which is the whole of what stops one geometry shared
  // fourteen ways from reading as one tree stamped fourteen times. It costs a
  // quaternion and it is the same trick the grass plays by mirroring half its
  // tufts.
  g.rotation.y = spin;
  return { group: g, fills: [kit.leafMat, kit.barkMat], trunk: [trunkFill, trunkInk] };
}

// ------------------------------------------------------------------- stumps

// A stump is a squat truncated cone with a scalloped skirt and a flat cut face,
// and every proportion here is measured off the turnaround sheet and `stump.png`,
// which agree: about two and a half times as wide as it is tall, its top some
// four fifths the width of its foot.
//
// Sized from `h` rather than from the drawing's alpha bounds, which is how the
// tree does it and NOT how the bush did. The reason is specific: `stump.png`
// carries little tick marks of grass out to either side, well clear of the
// stump itself, so its alpha bounds are some fifteen percent wider than the
// stump is. Measuring the drawing would have built every stump too wide, and
// only the ticks would have known why.
//
// `rBot` is a shade under what the card renders, for the reason the canopy's
// width is: a card is flat and stands at the middle, where a solid's near face
// stands a whole radius closer and so projects bigger.
const STUMP = {
  // Of the prop's h. The sheet's FRONT view is about two and a half times as
  // wide as it is tall, and this is a shade squatter still — because a card is
  // flat and a solid is not. Standing beside one you see its CUT FACE as well as
  // its side, and that ellipse adds to the apparent height without adding to the
  // width, so a stump built at the drawn ratio arrives looking like a drum.
  tall: 0.80,
  rTop: 0.81,
  rBot: 1.02,
  bury: 0.06,
  taper: 2.4,      // how sharply the flare gathers toward the foot
  // ...and how many root swells it breaks into. The sheet's FRONT view shows
  // five or six across the face you can see, which is a dozen round; its TOP
  // view counts thirteen or fourteen. Twelve splits them.
  lobes: 12,
  // How deep, as a fraction of the flare rather than of the radius — so the
  // scallops live entirely in the skirt and the cut face stays a clean circle,
  // which is what the TOP view shows. At 0.45 the foot swells about a tenth of
  // its own radius between lobe and hollow.
  //
  // This is the one number the bush's failure is a warning about: bumps put over
  // a WHOLE surface crease it with ink, because each one shows its own small
  // silhouette. These are safe at a depth that would have wrecked a bush,
  // because the falloff above confines them to the bottom third — which is the
  // part that is already the silhouette, and where an edge is all a scallop was
  // ever meant to be.
  lobe: 0.45,
  sway: 0.10,      // a slow second harmonic, so a dozen lobes are not a dozen equals
};

// How wide a stump is where it meets the grass — trunkRadius's opposite number,
// and what a stump contributes to SOLIDS in sphere.js.
//
// Derived from the lathe's own profile rather than typed, so the two can never
// part company: the rings below run a radius of rTop + (rBot - rTop)·(1-t)^taper
// with t from the buried foot to the cut face, and this is that expression at
// the height where t puts the grass. Not rBot, which is the very bottom of the
// flare and is `bury` under the ground — a stump you stopped at the widest point
// of its buried skirt would hold you off by a hand's width of nothing.
//
// The lobes are left out for the same reason trunkRadius leaves them out: they
// are a function of bearing and this is a circle, so the mean they ride on is
// the only honest answer. It puts the stop a couple of centimetres inside the
// crest of a root swell and the same outside its hollow.
export function stumpRadius(h) {
  const t = STUMP.bury / (STUMP.tall + STUMP.bury);
  return (STUMP.rTop + (STUMP.rBot - STUMP.rTop) * (1 - t) ** STUMP.taper) * h;
}

// Its cut face: how high off the grass, and how wide. The two numbers that make
// a stump a thing you can get on top of rather than only a thing in the way.
//
// They are NOT stumpRadius and `h`. The face is narrower than the foot — the
// lathe tapers from rBot up to rTop — and the stump is shorter than the prop's
// nominal height, since `tall` is the fraction of it the wood actually occupies.
// Registering the wider, taller pair would stand you in the air off its edge.
export function stumpTop(h) { return STUMP.tall * h; }
export function stumpTopRadius(h) { return STUMP.rTop * h; }

// The cut face is cheap to tessellate and worth doing well, since looking down
// on one is most of how a stump is ever seen. `CAP` rings from its rim to its
// middle is what carries the growth rings — see STUMP_SPLIT in art.js for why
// `v` means radius up there.
const S_CAP = 6;
const S_RINGS = 16;
const S_COLS = 120;

// A closed lathe: the cut face from its middle outward, then down the side, then
// the buried underside. One ring list from pole to pole, so the winding is the
// trunk's and the seam heals the same way.
//
// The rim between face and side is ONE ring shared by both, not two. It can be,
// because the two mappings meet exactly there — the side's `v` reaches
// STUMP_SPLIT at the top and the face's starts there — so a single ring carries
// one coordinate that is correct for both. What it costs is a rounded normal at
// the rim rather than a hard edge, which no one can see on an unlit surface and
// which the ink hull rather likes: the line turns the corner instead of mitring.
function stumpGeo(h, rand, pad) {
  const rTop = STUMP.rTop * h;
  const rBot = STUMP.rBot * h;
  const yTop = STUMP.tall * h;
  const yBot = -STUMP.bury * h;

  const pA = rand() * Math.PI * 2;
  const pB = rand() * Math.PI * 2;
  const lobe = (phi) => 1
    + STUMP.lobe * Math.cos(STUMP.lobes * phi + pA)
    + STUMP.sway * Math.cos(3 * phi + pB);

  // Every ring, in order from the middle of the cut face down to the foot. The
  // face's rings sit at one height and shrink in radius; the side's climb down
  // and swell. The lobes are weighted by the same falloff as the flare, so the
  // cut face comes out a clean circle and only the skirt is scalloped — which is
  // exactly what the sheet's TOP view shows.
  const rings = [];
  for (let k = S_CAP - 1; k >= 1; k--) {
    const f = k / S_CAP;
    rings.push({ y: yTop, v: STUMP_SPLIT + (1 - STUMP_SPLIT) * f, r: () => rTop * (1 - f) });
  }
  for (let i = S_RINGS; i >= 0; i--) {
    const t = i / S_RINGS;
    const w = (1 - t) ** STUMP.taper;
    rings.push({
      y: yBot + t * (yTop - yBot),
      v: STUMP_SPLIT * t,
      r: (phi) => rTop + (rBot - rTop) * w * lobe(phi),
    });
  }

  const NR = rings.length;
  const count = 2 + NR * (S_COLS + 1);
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let p = 0;
  let q = 0;
  const put = (x, y, z, u, v) => {
    pos[p++] = x; pos[p++] = y; pos[p++] = z;
    uv[q++] = u; uv[q++] = v;
  };

  put(0, yTop, 0, 0.5, 1);
  for (const ring of rings) {
    for (let j = 0; j <= S_COLS; j++) {
      const phi = (j / S_COLS) * Math.PI * 2;
      const r = ring.r(phi);
      put(Math.sin(phi) * r, ring.y, Math.cos(phi) * r, j / S_COLS, ring.v);
    }
  }
  put(0, yBot, 0, 0.5, 0);

  const ring = (i) => 1 + i * (S_COLS + 1);
  const bot = 1 + NR * (S_COLS + 1);
  const idx = [];
  for (let j = 0; j < S_COLS; j++) {
    idx.push(0, ring(0) + j, ring(0) + j + 1);
    idx.push(bot, ring(NR - 1) + j + 1, ring(NR - 1) + j);
  }
  for (let i = 0; i < NR - 1; i++) {
    for (let j = 0; j < S_COLS; j++) {
      const a = ring(i) + j;
      const b = ring(i + 1) + j;
      const c = ring(i + 1) + j + 1;
      const d = ring(i) + j + 1;
      idx.push(a, b, c, a, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  healSeam(g, NR + 1, S_COLS);
  if (pad) inflate(g, pad);
  return g;
}

// How fat the stump's line is, as a fraction of its height. Bigger against its
// object than a tree's 0.0089 and smaller than the bush's was, and measured the
// same way: the drawing puts about three pixels of line round a stump 330 across
// and 120 tall, which is a fortieth of the height.
const STUMP_INK = 0.025;

const STUMP_KIT = { geo: null, ink: null, mat: null };

// One stump. There is a single drawing, so there is a single build, and the
// thirteen on the planet are that one geometry turned to thirteen bearings.
export function buildStump(key, h, { seed = 0, spin = 0 }) {
  if (!STUMP_KIT.geo) {
    const pad = STUMP_INK * h;
    STUMP_KIT.geo = stumpGeo(h, makeRandom(TREE_SEED + 97 + seed), 0);
    STUMP_KIT.ink = stumpGeo(h, makeRandom(TREE_SEED + 97 + seed), pad);
    STUMP_KIT.mat = skin(paintStumpSkin());
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(STUMP_KIT.ink, foliageInk(PAL.stumpInk)));
  g.add(new THREE.Mesh(STUMP_KIT.geo, STUMP_KIT.mat));
  g.rotation.y = spin;
  return { group: g, fills: [STUMP_KIT.mat] };
}

// -------------------------------------------------------------------- grass

// Grass as blades, in one merged mesh. The only grass there is: the drawn tufts
// this replaced are archived in `asset/images/legacy/`.
//
// EASIER THAN ANYTHING ELSE IN THIS FILE, and it is worth saying why, because
// the reason is the same one that made the bush hard. Everything above wears an
// inverted hull, and a hull is what makes a shape read as drawn: it also makes
// every bump show its own silhouette, which is what wrecked the bush. Grass
// wants no hull at all. Nothing at ground level in this world carries a line —
// not the globe, not the tracks, not the pools of lamplight — and a blade is a
// few millimetres wide, so there is nothing to draw a line round. No hull, no
// scallops, no creases, no argument.
//
// It also costs less than what it replaces rather than more: one mesh, no
// texture, no alphaTest, no per-variant draw call.
// A TUFT HAS TO BE AS BIG AS THE THING IT REPLACED, and that is the one number
// here that was badly wrong first time. A drawn tuft is a card 0.43 across with
// several strokes painted on it; six blades in a 0.05 spread is a clump a tenth
// of a unit wide, so the same 320 points came out as a bare field with a few
// green sprigs on it. Nine blades over 0.09 is a clump you can see, and the
// count that goes with it lives in scene.js.
const BLADE = {
  perTuft: 9,
  seg: 4,            // segments up a blade; the last one comes to a point
  width: 0.032,      // of a blade at its root, in world units
  spread: 0.09,      // how far a tuft's blades plant themselves from its centre
  // Per blade, low to high. Every one of these is jitter for its own reason:
  // `tall` and `wide` so no two blades are the same blade, `lean` and `droop`
  // so the tuft opens into a fan rather than a bundle of upright sticks, and
  // `shade` so a lawn of one green is not one green.
  tall: [0.55, 1.40],
  wide: [0.70, 1.35],
  lean: [0.18, 0.60],
  droop: [0.05, 0.24],
  shade: [0.88, 1.12],
  limber: [0.6, 1.4],   // how far this blade gives to the wind
};

// One blade is a tapered strip that leans and droops: `seg` rows of two
// vertices coming to a single point at the tip, so the last quad is a triangle
// rather than a quad with two vertices on top of each other.
//
// A blade's flat face is turned across the way it leans, so it is broadest seen
// from the side and vanishes edge-on — which is why a TUFT is six of them at six
// random bearings rather than one at a good one. There is always more than one
// facing you, and the ones that are not are what gives a tuft its depth. It is
// the same bargain the crossed quads made, spent on six thin things instead of
// two wide ones.
// `shadeAt` is handed each tuft's spot and the two colours to fill in — root and
// tip — so the grass can change country with the ground under it. Left out, the
// whole planet grows the palette's meadow green.
//
// Per TUFT rather than per blade, which is what keeps a patch of grass reading
// as one patch: a border where individual blades disagreed about which field
// they were in would sparkle rather than blend.
export function buildGrassBlades(R, dirs, rand, height, shadeAt) {
  const B = BLADE;
  const perBlade = B.seg * 2 + 1;
  const trisPer = B.seg * 2 - 1;
  const blades = dirs.length * B.perTuft;

  const pos = new Float32Array(blades * perBlade * 3);
  const col = new Float32Array(blades * perBlade * 3);
  // How much of the wind each vertex feels — see the sway patch in scene.js.
  // Zero at the root and one at the tip, so a blade BENDS rather than slides:
  // whatever the wind does, the base stays planted where it was grown. Squared
  // rather than linear because a blade is stiffest where it is thickest, which
  // puts the bend in the top half where you can see it.
  const sway = new Float32Array(blades * perBlade);
  const idx = new Uint32Array(blades * trisPer * 3);

  const low = new THREE.Color(PAL.grassBladeLow);
  const high = new THREE.Color(PAL.grassBladeHigh);

  const n = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const root = new THREE.Vector3();
  const lean = new THREE.Vector3();
  const side = new THREE.Vector3();
  const mid = new THREE.Vector3();

  const pick = ([lo, hi]) => lo + rand() * (hi - lo);
  let p = 0;
  let c = 0;
  let w = 0;
  let f = 0;
  let base = 0;

  for (let i = 0; i < dirs.length; i++) {
    if (shadeAt) shadeAt(dirs[i], low, high);
    n.copy(dirs[i]).normalize();
    t1.crossVectors(up, n);
    if (t1.lengthSq() < 1e-8) t1.set(1, 0, 0);
    t1.normalize();
    t2.crossVectors(n, t1).normalize();

    for (let b = 0; b < B.perTuft; b++) {
      const bearing = rand() * Math.PI * 2;
      const h = height * pick(B.tall);
      const w0 = B.width * pick(B.wide) * 0.5;
      const out = h * pick(B.lean);
      const dr = pick(B.droop);
      const shade = pick(B.shade);
      // How willingly this blade gives to the wind. Without it every blade in a
      // tuft leans the same amount at the same instant, which reads as the whole
      // lawn being one object breathing rather than as a lot of separate grass.
      const limber = pick(B.limber);

      // Where this blade is planted, and which way it leans. The offset is what
      // stops a tuft being six blades sprouting from one pinhole.
      lean.copy(t1).multiplyScalar(Math.cos(bearing)).addScaledVector(t2, Math.sin(bearing));
      root.copy(n).multiplyScalar(R)
        .addScaledVector(t1, (rand() - 0.5) * B.spread)
        .addScaledVector(t2, (rand() - 0.5) * B.spread);
      side.crossVectors(n, lean).normalize();

      for (let s = 0; s <= B.seg; s++) {
        const u = s / B.seg;
        // Up along the surface normal and over in the direction of lean. The
        // rise is linear less a droop term and the lean is quadratic, so the
        // blade leaves the ground upright and is bending hardest at its tip.
        mid.copy(root)
          .addScaledVector(n, h * u * (1 - dr * u))
          .addScaledVector(lean, out * u * u);
        // Tapering to nothing, so the tip is a point rather than a chopped end.
        const hw = w0 * ((1 - u) ** 0.7);
        const r = (low.r + (high.r - low.r) * u) * shade;
        const g = (low.g + (high.g - low.g) * u) * shade;
        const bl = (low.b + (high.b - low.b) * u) * shade;

        const give = u * u * limber;
        if (s === B.seg) {
          pos[p++] = mid.x; pos[p++] = mid.y; pos[p++] = mid.z;
          col[c++] = r; col[c++] = g; col[c++] = bl;
          sway[w++] = give;
        } else {
          pos[p++] = mid.x - side.x * hw;
          pos[p++] = mid.y - side.y * hw;
          pos[p++] = mid.z - side.z * hw;
          col[c++] = r; col[c++] = g; col[c++] = bl;
          sway[w++] = give;
          pos[p++] = mid.x + side.x * hw;
          pos[p++] = mid.y + side.y * hw;
          pos[p++] = mid.z + side.z * hw;
          col[c++] = r; col[c++] = g; col[c++] = bl;
          sway[w++] = give;
        }
      }

      for (let s = 0; s < B.seg - 1; s++) {
        const a = base + s * 2;
        idx[f++] = a; idx[f++] = a + 1; idx[f++] = a + 3;
        idx[f++] = a; idx[f++] = a + 3; idx[f++] = a + 2;
      }
      const lastRow = base + (B.seg - 1) * 2;
      idx[f++] = lastRow; idx[f++] = lastRow + 1; idx[f++] = base + perBlade - 1;
      base += perBlade;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  // DoubleSide, because a blade is a strip with no inside, and unlit like
  // everything else out here. The colour comes off the vertices, so the daylight
  // tint still has `material.color` to itself and the hour multiplies the lot.
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------- bushes were tried here
//
// And reverted, on the look. `buildBush` stood below this line: a flatter ball
// sunk into the hill so only its dome showed, sized off `bush-1.png`'s own alpha
// bounds, wearing the same blossom and its own greyer ink. It worked, and it is
// gone; the bushes are cards again.
//
// One thing learned in the doing is worth keeping, because it will come up again
// for anything low and domed. The stump above is the encouraging half of it.
//
// A DRAWN SCALLOP LIVES ON THE OUTLINE AND NOWHERE ELSE. The inside of a drawn
// bush is flat green. Give a ball that same wobble everywhere and every bump
// steep enough to notice shows its own small silhouette wherever its flank turns
// away from you — which on a knee-high dome you are looking down at is most of
// the face, so it arrives criss-crossed with ink. Shallow enough to stop that,
// and there is no scallop left to see. Every amplitude between those was one or
// the other: a smooth green boulder, or crumpled paper.
//
// The way out, if it is ever wanted, is that a low dome's outline is always its
// RIM — it is sunk to its own equator and you stand over it, so the silhouette is
// the band round its middle and the crown is what you look straight down on. Fade
// the scallop band out toward the poles by a power of sin(theta) and the edge
// gets its nibble while the face stays flat, with neither traded against the
// other. A canopy wants no such bias, since you see a tree's ball from the side
// and every part of it takes a turn at being the outline.
//
// What was still short at the end was fineness. The drawn rim carries about
// thirty scallops, each a twenty-fifth of the bush wide; as geometry that wants a
// wavelength near a sixtieth of the ball, some 360 columns and 64k vertices a
// bush, sixteen bushes over. A dozen broader bumps was what the budget allowed,
// and a dozen broader bumps is not that drawing.
