// Every visual in the app comes from here. This is the ONLY file that knows
// what anything looks like — everything else deals in canvases and textures.
//
// Two kinds of thing live here now. The characters, the ground, the scenery
// and the house are drawn art: assets.js loads the files and the paint* function
// only frames them. Everything still waiting to be drawn — the sky, and the
// stamps light and shadow are made from — is painted in code as
// before. Replacing one of those is a local change: load an image and hand back
// paintSheet(img) instead, and nothing downstream notices.

import * as THREE from 'three';
import { PAL, CONFIG } from './config.js';
import { IMG, FLOWER_TEXTURE_VARIANTS } from './assets.js';
import { biomesAt, dirFromLatLon, localFrame, lakeRim } from './sphere.js';

// Scratch for asking which biome a texel is in. The ground is painted once, but
// it is painted a few hundred thousand times over inside that once.
const _fieldDir = new THREE.Vector3();

const TAU = Math.PI * 2;

// mulberry32. Lives here rather than in scene.js because both the starfield and
// the ground scatter want one, and art.js is the file scene.js already imports.
export function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The constellations should be the same constellations every night, for the
// same reason the grass does not rearrange itself between visits. Used by
// scene.js, which is where the starfield is built.
export const STAR_SEED = 90210;

// ...and the pen marks on the walls and floor of the house, for the same
// reason: the room should be the room you were in last time, down to the marks.
export const ROOM_SEED = 41207;

// ...and where the blossom sits on a canopy, and where the grain runs on a
// trunk. A tree is built once and shared by every prop wearing that drawing, so
// this decides the shape of a tree rather than of one tree — which is exactly
// why it must not move: a stand of trees that rearranged itself between visits
// would give the whole planet away.
export const TREE_SEED = 55831;

// The sky is laid out against this space and rendered at SKY_SCALE times it.
// Keeping the two apart is what lets the texture change resolution without
// anything moving: daylight.js gives `discAt` and `discR` in design space, and
// scene.js reads them the same way when it places the sun card, so doubling
// SKY_SCALE sharpens the sky and leaves the sun exactly where it was.
//
// Star *sizes* are the one thing that does not simply scale, because the point
// of more resolution is finer stars rather than the same stars drawn bigger.
// They are in real texture pixels and are chosen for the scale below.
export const SKY_DESIGN = { w: 1024, h: 512 };
const SKY_SCALE = 2;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// One star. Not painted into the sky — see scene.js — but used as the sprite a
// point sprite is cut out of, which is what makes a star round instead of the
// square a bare point renders as.
//
// The solid centre is the first stop's worth of the radius; the rest is falloff,
// which is what keeps the edge from reading as a cut-out disc. Built lazily and
// kept, since it never changes.
let STAR_STAMP = null;
export function starStamp() {
  if (STAR_STAMP) return STAR_STAMP;
  const R = 32;
  const c = makeCanvas(R * 2, R * 2);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(R, R, 0, R, R, R);
  grd.addColorStop(0.00, 'rgba(255,255,255,1)');
  grd.addColorStop(0.28, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.50, 'rgba(255,255,255,0.34)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(R, R, R, 0, TAU);
  g.fill();
  STAR_STAMP = c;
  return c;
}

// A cluster of circles filled as one shape. Each needs its own subpath: chain
// `arc` calls without a `moveTo` between them and canvas joins them with
// straight lines, and the thin wedges those cut can cancel under nonzero
// winding and punch a hole clean through the middle of the blob.
function blob(g, circles) {
  g.beginPath();
  for (const [x, y, r] of circles) {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, TAU);
  }
  g.fill();
}

// ---------------------------------------------------------------- character

// A drawn sheet, copied onto a canvas with a transparent margin around it.
//
// The margin is not cosmetic. Content flush against the edge of a texture has
// its outermost row clamped and smeared into by mipmaps, which shows up as a
// faint fringe along the top of the ears and under the feet. Padding here
// rather than in the source file lets the art stay cropped tight.
//
// padBottom is the exception, and it exists because scenery is anchored by its
// bottom edge: a prop's plane starts at the ground, so a transparent strip
// underneath does not vanish — it lifts the whole drawing off the grass. Six
// pixels sounds harmless and is not. On a bush 152px tall standing 0.72 units
// high it is 0.026 units of daylight under the leaves, which at arm's length
// is a visible 35px gap. A character is fine either way, because where its feet
// are gets measured from the pixels rather than assumed.
//
// A canvas rather than the image itself, because the tap test reads the sheet
// back with getImageData and only a canvas can be read.
const SHEET_PAD = 6;

export function paintSheet(img, padBottom = true) {
  const p = SHEET_PAD;
  const c = makeCanvas(
    img.naturalWidth + p * 2,
    img.naturalHeight + p + (padBottom ? p : 0),
  );
  c.getContext('2d').drawImage(img, p, p);
  return c;
}

// The opaque bounds of a sheet, in canvas pixels, plus the pixels themselves.
//
// Where the feet are and where the ears stop used to be arithmetic on the
// silhouette numbers in cast.js. With drawn art the only thing that knows is
// the art, so it gets measured. The ImageData comes back with it because the
// alpha tap test needs exactly the same readback and this way it happens once.
export function sheetBounds(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h);
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data.data[(y * w + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // A fully transparent sheet would otherwise hand back inverted bounds and
  // put the character somewhere absurd. Fall back to the whole canvas.
  if (maxX < 0) return { minX: 0, maxX: w - 1, minY: 0, maxY: h - 1, data };
  return { minX, maxX, minY, maxY, data };
}

// Every expression the dialogue can ask for. A character renders whichever of
// these it has a sheet for and falls back to the resting face for the rest, so
// this list is the vocabulary rather than a requirement — see cast.js.
//
// 'pain' and 'teary' were here and are not any more: no line reached either, so
// they were a standing invitation to draw a sheet that could never appear. This
// is meant to be the list of faces a character can actually be caught wearing.
// Nothing breaks if a line names something absent — setExpression falls through
// to the resting face — so adding one back is just this line and a line to use
// it.
//
// 'delight' is happiness with the volume up, and it is deliberately scarce: only
// Chiikawa's `greet` bucket reaches it, so it is the face you get for arriving
// and nothing else wears it out. Note where the fallback lands if you spend it
// more widely — a character with no delight sheet drops to the RESTING face, not
// to happy, so a delight line given to somebody undrawn reads flatter than the
// happy line it replaced. Draw the sheet in the same breath as writing the line.
export const EXPRESSIONS = [
  'normal', 'happy', 'delight', 'sleepy', 'worried', 'surprise',
];

// The POSTURES are the other half of this vocabulary and live in cast.js, next
// to the `sheets` lists that name them — art.js cannot hold them, because
// assets.js has to read them and this file already imports assets.js.

// -------------------------------------------------------------------- world

// Wrapped around the inside of a sphere, so this is the whole horizon. You can
// turn a full circle, which means there is no "back" to hide anything in.
// `discArt` says the sun or moon is a drawn card in the sky rather than a disc
// painted in here — see scene.js for why. The halo stays painted either way: it
// is a soft gradient, so the magnification this texture suffers costs it
// nothing, and leaving it here keeps the glow behind the card for free.
export function paintSky(look, discArt = false) {
  const S = SKY_SCALE;
  const W = SKY_DESIGN.w * S;
  const H = SKY_DESIGN.h * S;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, look.skyTop);
  grad.addColorStop(0.55, look.skyMid);
  grad.addColorStop(1.00, look.skyLow);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Stars are NOT painted here. They are point sprites in scene.js, and the
  // reason is worth keeping: this texture is equirectangular, so it converges
  // at its poles, and a round dot painted near one arrives as a capsule. You
  // can cancel that by drawing it wider — exactly 1/sin(latitude) wider — and
  // that is mathematically right and still does not work. It needs a finely
  // tessellated dome to survive interpolation and good filtering to survive
  // minification, it breaks down entirely within a degree or so of the axis,
  // and measured on the rendered frame it left one star in twenty at least
  // twice as wide as it was tall, the worst at six to one. The default view
  // looks straight up the dome's axis, so that is the middle of the screen.
  //
  // A point sprite has no such geometry to fight. See `Globe._buildStars`.

  // Sized in degrees of arc, not pixels: this texture wraps a full turn, so
  // design space being 1024 across means one unit is about a third of a degree.
  // A disc that looks modest here is enormous once you are stood on the ground
  // looking up at it through a 62 degree lens.
  const dx = look.discAt[0] * S;
  const dy = look.discAt[1] * S;
  const dr = look.discR * S;
  const halo = g.createRadialGradient(dx, dy, dr * 0.9, dx, dy, dr * 2.6);
  halo.addColorStop(0, look.disc);
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = look.glow;
  g.fillStyle = halo;
  g.beginPath();
  g.arc(dx, dy, dr * 2.6, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
  if (!discArt) {
    g.fillStyle = look.disc;
    g.beginPath();
    g.arc(dx, dy, dr, 0, TAU);
    g.fill();
  }

  // Positions and scales below are design space; S carries them to whatever
  // resolution the texture is actually being painted at.
  const cloud = (x, y, cs, a) => {
    g.globalAlpha = a * look.cloudAlpha;
    g.fillStyle = look.cloud;
    blob(g, [
      [x, y, 26 * cs],
      [x + 30 * cs, y - 12 * cs, 20 * cs],
      [x + 60 * cs, y, 24 * cs],
      [x + 30 * cs, y + 10 * cs, 22 * cs],
    ]);
    g.globalAlpha = 1;
  };
  const spots = [
    [60, 200, 1.0, 0.95], [210, 300, 0.75, 0.8], [420, 175, 1.15, 0.9],
    [560, 285, 0.8, 0.75], [700, 190, 1.0, 0.92], [830, 300, 0.7, 0.7],
    [910, 165, 0.9, 0.88], [140, 360, 0.6, 0.55], [640, 380, 0.55, 0.5],
  ];
  for (const [x, y, cs, a] of spots) cloud(x * S, y * S, cs * S, a);
  return c;
}

// ------------------------------------------------------------ the far distance

// The mountains and the treeline, and the reason they are painted here rather
// than built in foliage.js: THEY ARE SKY, NOT LAND.
//
// In every reference frame the mountains are backdrop. Nobody walks to them;
// they stand behind everything and never get closer. That is exactly what this
// app's sky already is — a dome hung off your own zenith and re-aimed every
// frame, which is the honest way to say "infinitely far off" on a planet 8 units
// across. Hang a band of hills on that dome and they sit on your horizon
// wherever you walk, permanently distant, for one mesh and no logic.
//
// The alternative was making the world bigger and standing real mountains on it,
// and it is wrong twice over. `globe.radius` cascades through the ground-cover
// counts, the far-view altitudes, how far neighbours lean and how long a stroll
// takes; and a planet big enough for a mountain is a planet where the three of
// them are no longer a short walk apart, which is the whole design.
//
// One texture, tinted by the hour like every other thing out here rather than
// painted four times like the sky. A mountain at dusk is the same mountain with
// the evening on it; a SKY at dusk is a different gradient, which is why that one
// is painted per phase and this one is not.
const HORIZON_SEED = 70413;

// How the band is laid out, top to bottom, as fractions of its own height. Row 0
// is the highest — see the note in scene.js about where the band is hung, which
// is what decides which of these rows you can actually see.
//
// TWO ROWS MATTER MORE THAN THE REST, and both are set against the planet's limb
// rather than chosen by eye:
//
//   `treeTop` at 0.27 reserves room for the rare tallest tree. Ordinary bush
//   crowns begin around 0.40-0.55, while their feet sit just below the standing
//   limb at 0.567. That placement exposes whole upper silhouettes rather than
//   reducing every plant to a similar row of crown tips.
//
//   `treeBase` at 0.90 sits well BELOW the limb's 0.761 AT THE TOP OF A HOP.
//   It is only where the lowest foliage finally becomes a solid fill; the
//   deeper, independently placed plants occupy everything above it. A jump
//   therefore reveals more shrubs, trees and branches rather than a flat green
//   slab, with 0.139 of the sheet still in reserve.
//
// The gap between them is deliberate depth: the back row breaks the standing
// horizon, and the lower row keeps the area exposed during a hop illustrated.
const SKYLINE = {
  mountainPeak: 0.18,
  mountainBase: 0.62,
  treeTop: 0.27,
  treeBase: 0.90,
  hazeTo: 0.62,
};

// One individual mountain: a broad paper-cut pyramid with just enough curve in
// its slopes and cap to keep the outline soft. It is not a bell curve. Most of
// the silhouette is two long sides; the rounded summit occupies only the small
// meeting place between them.
function traceMountain(g, m, off = 0) {
  const cx = m.x + off;
  const left = cx - m.width / 2;
  const right = cx + m.width / 2;
  const px = cx + m.lean;
  g.moveTo(left, m.baseY);
  g.bezierCurveTo(
    left + m.width * 0.18,
    m.baseY - m.rise * 0.20,
    px - m.cap * 1.55,
    m.peakY + m.capDrop * 1.55,
    px - m.cap,
    m.peakY + m.capDrop,
  );
  g.quadraticCurveTo(
    px,
    m.peakY - m.capDrop * 0.60,
    px + m.cap,
    m.peakY + m.capDrop,
  );
  g.bezierCurveTo(
    px + m.cap * 1.55,
    m.peakY + m.capDrop * 1.55,
    right - m.width * 0.18,
    m.baseY - m.rise * 0.20,
    right,
    m.baseY,
  );
}

// Independent mountains distributed around one periodic lap. Their gaps are
// randomised and normalised back to W, so the spacing is irregular without the
// seam accumulating an error. Most sit in one visual row; a few are paler and
// painted first, allowing LOCAL overlaps rather than a second range stacked
// behind the entire horizon.
function mountainBand(g, W, H, rand, {
  peak, base, count, fill, backFill, ink, backInk, line,
}) {
  const step = W / count;
  const gaps = [];
  let gapTotal = 0;
  for (let i = 0; i < count; i++) {
    // A deliberately broad interval: small values make the occasional cluster
    // and large ones pay that space back as open sky elsewhere. A narrow
    // jitter range still reads as a ruler once it has repeated ten times.
    const gap = 0.42 + rand() * 1.22;
    gaps.push(gap);
    gapTotal += gap;
  }

  const mountains = [];
  const mains = [];
  let x = rand() * step;
  for (let i = 0; i < count; i++) {
    const peakY = (peak + (base - peak) * rand() * 0.42) * H;
    const baseY = (base + (rand() - 0.5) * 0.045) * H;
    const width = step * (1.08 + rand() * 0.42);
    const mountain = {
      x: ((x % W) + W) % W,
      width,
      peakY,
      baseY,
      rise: baseY - peakY,
      lean: width * (rand() - 0.5) * 0.18,
      cap: width * (0.052 + rand() * 0.026),
      capDrop: H * (0.016 + rand() * 0.012),
      back: false,
      depth: 0.55 + rand() * 0.45,
    };
    mountains.push(mountain);
    mains.push(mountain);
    x += (gaps[i] / gapTotal) * W;
  }

  // Three guaranteed background neighbours, each tucked beside a different
  // main mountain. Making these as ADDITIONS rather than randomly reclassifying
  // three of the main row is what guarantees an overlap is actually visible:
  // there is still a foreground mountain at the same bearing to cross it.
  for (let i = 1; i < mains.length; i += 3) {
    const anchor = mains[i];
    const side = rand() < 0.5 ? -1 : 1;
    const width = step * (1.48 + rand() * 0.40);
    const peakFloor = peak + 0.035;
    const peakY = (peakFloor + (base - peakFloor) * rand() * 0.36) * H;
    const baseY = (base + (rand() - 0.5) * 0.04) * H;
    mountains.push({
      x: (anchor.x + side * step * (0.30 + rand() * 0.18) + W) % W,
      width,
      peakY,
      baseY,
      rise: baseY - peakY,
      lean: width * (rand() - 0.5) * 0.16,
      cap: width * (0.052 + rand() * 0.024),
      capDrop: H * (0.016 + rand() * 0.011),
      back: true,
      depth: rand() * 0.30,
    });
  }

  mountains.sort((a, b) => a.depth - b.depth);
  for (const m of mountains) {
    for (const off of [-W, 0, W]) {
      g.beginPath();
      traceMountain(g, m, off);
      g.closePath();
      g.fillStyle = m.back ? backFill : fill;
      g.fill();

      g.beginPath();
      traceMountain(g, m, off);
      g.strokeStyle = m.back ? backInk : ink;
      g.lineWidth = H * line;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.stroke();
    }
  }
}

// The distant wood is assembled from individual plants. The references mix
// wide cloud-shaped bushes, narrow pointed shrubs and the occasional small tree
// with a visible trunk. Closed silhouettes are important here: when two plants
// meet, normal painter's-order overlap makes a believable little cluster rather
// than joining their outlines into one decorative ribbon.
function traceRoundedBush(g, plant, off = 0) {
  const x = plant.x + off;
  const left = x - plant.width / 2;
  const right = x + plant.width / 2;
  const height = plant.baseY - plant.topY;
  const shoulderY = plant.topY + height * plant.shoulder;
  const footInset = plant.width * 0.13;
  let fromY = shoulderY;

  g.moveTo(left + footInset, plant.baseY);
  g.quadraticCurveTo(left - plant.width * 0.025, shoulderY, left, shoulderY);
  for (const lobe of plant.lobes) {
    const endX = left + plant.width * lobe.endT;
    const endY = plant.topY + height * lobe.endY;
    const apexY = plant.topY + height * lobe.apexY;
    // The quadratic control point is solved so the visible midpoint reaches
    // the requested apex. This makes each lobe soft without making every bush
    // share the same repeated semicircle.
    const controlY = 2 * apexY - (fromY + endY) / 2;
    g.quadraticCurveTo(
      left + plant.width * lobe.midT,
      controlY,
      endX,
      endY,
    );
    fromY = endY;
  }
  g.quadraticCurveTo(
    right + plant.width * 0.025,
    shoulderY,
    right - footInset,
    plant.baseY,
  );
  g.quadraticCurveTo(x, plant.baseY + height * 0.025, left + footInset, plant.baseY);
  g.closePath();
}

function tracePointedShrub(g, plant, off = 0) {
  const x = plant.x + off;
  const left = x - plant.width / 2;
  const right = x + plant.width / 2;
  const height = plant.baseY - plant.topY;
  const shoulderY = plant.topY + height * 0.82;
  const footInset = plant.width * 0.16;
  let fromX = left;
  let fromY = shoulderY;

  g.moveTo(left + footInset, plant.baseY);
  g.quadraticCurveTo(left - plant.width * 0.02, shoulderY, left, shoulderY);
  for (const spike of plant.spikes) {
    const tipX = left + plant.width * spike.tipT;
    const tipY = plant.topY + height * spike.tipY;
    const endX = left + plant.width * spike.endT;
    const endY = plant.topY + height * spike.endY;
    g.quadraticCurveTo(
      fromX + (tipX - fromX) * 0.72,
      fromY + (tipY - fromY) * 0.34,
      tipX,
      tipY,
    );
    g.quadraticCurveTo(
      tipX + (endX - tipX) * 0.32,
      tipY + (endY - tipY) * 0.68,
      endX,
      endY,
    );
    fromX = endX;
    fromY = endY;
  }
  g.quadraticCurveTo(
    right + plant.width * 0.02,
    shoulderY,
    right - footInset,
    plant.baseY,
  );
  g.quadraticCurveTo(x, plant.baseY + height * 0.018, left + footInset, plant.baseY);
  g.closePath();
}

// A tree canopy is a complete, slightly lopsided blob rather than the top half
// of a bush. Quadratic interpolation through the radial points gives it the
// hand-drawn cloud outline seen on the larger background trees.
function traceTreeCanopy(g, plant, off = 0) {
  const points = plant.crownPoints.map(point => ({
    x: plant.x + off + point.x,
    y: plant.crownY + point.y,
  }));
  const last = points[points.length - 1];
  const first = points[0];
  g.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const next = points[(i + 1) % points.length];
    g.quadraticCurveTo(
      point.x,
      point.y,
      (point.x + next.x) / 2,
      (point.y + next.y) / 2,
    );
  }
  g.closePath();
}

function paintTreeWood(g, H, plant, off) {
  const x = plant.x + off;
  const topY = plant.crownY + plant.crownHeight * 0.15;
  const half = plant.trunkWidth / 2;
  g.beginPath();
  g.moveTo(x - half * 0.72, topY);
  g.quadraticCurveTo(x - half, plant.baseY - plant.trunkWidth, x - half * 1.15, plant.baseY);
  g.lineTo(x + half * 1.12, plant.baseY);
  g.quadraticCurveTo(
    x + half,
    plant.baseY - plant.trunkWidth,
    x + half * 0.70 + plant.trunkLean,
    topY,
  );
  g.closePath();
  g.fillStyle = PAL.horizonTreeTrunk;
  g.fill();
  g.strokeStyle = PAL.horizonTreeBranch;
  g.lineWidth = H * 0.006;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

function paintPlantBranches(g, H, plant, off) {
  const x = plant.x + off;
  const height = plant.baseY - plant.topY;
  const y0 = plant.kind === 'tree'
    ? plant.baseY - height * 0.13
    : plant.baseY - height * 0.05;
  const y1 = plant.kind === 'tree'
    ? plant.topY + height * 0.42
    : plant.topY + height * 0.31;
  const lean = plant.branchLean;
  const fork = plant.width * (plant.kind === 'tree' ? 0.14 : 0.11);

  g.beginPath();
  g.moveTo(x, y0);
  g.quadraticCurveTo(x + lean * 0.30, (y0 + y1) / 2, x + lean, y1);
  g.moveTo(x + lean * 0.53, y0 + (y1 - y0) * 0.52);
  g.lineTo(x + lean * 0.42 - fork, y1 + height * 0.12);
  g.moveTo(x + lean * 0.70, y0 + (y1 - y0) * 0.70);
  g.lineTo(x + lean * 0.74 + fork * 0.86, y1 + height * 0.18);
  g.strokeStyle = PAL.horizonTreeBranch;
  g.lineWidth = H * 0.006;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

function paintCanopyMarks(g, H, plant, off) {
  if (plant.kind !== 'tree') return;
  const x = plant.x + off;
  const y = plant.topY + plant.crownHeight * 0.46;
  const spread = plant.width * 0.18;
  g.beginPath();
  g.moveTo(x - spread * 1.15, y);
  g.quadraticCurveTo(x - spread * 0.75, y + H * 0.025, x - spread * 0.30, y + H * 0.008);
  g.moveTo(x + spread * 0.20, y + H * 0.012);
  g.quadraticCurveTo(x + spread * 0.66, y + H * 0.030, x + spread * 1.02, y - H * 0.002);
  g.strokeStyle = PAL.horizonTreeDetail;
  g.lineWidth = H * 0.005;
  g.lineCap = 'round';
  g.stroke();
}

function paintHorizonPlant(g, H, plant, ink) {
  for (const off of [-plant.period, 0, plant.period]) {
    if (plant.kind === 'tree') {
      paintTreeWood(g, H, plant, off);
    }

    g.beginPath();
    if (plant.kind === 'bush') traceRoundedBush(g, plant, off);
    else if (plant.kind === 'pointed') tracePointedShrub(g, plant, off);
    else traceTreeCanopy(g, plant, off);
    g.fillStyle = plant.fill;
    g.fill();
    g.strokeStyle = ink;
    g.lineWidth = H * 0.008;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke();

    if (plant.hasBranches) paintPlantBranches(g, H, plant, off);
    paintCanopyMarks(g, H, plant, off);
  }
}

function prepareHorizonPlant(rand, plant) {
  if (plant.kind === 'bush') {
    plant.shoulder = 0.70 + rand() * 0.08;
    plant.lobes = [];
    const count = 4 + Math.floor(rand() * 4);
    const widths = [];
    let widthTotal = 0;
    for (let i = 0; i < count; i++) {
      const width = 0.62 + rand() * 0.76;
      widths.push(width);
      widthTotal += width;
    }
    let startT = 0;
    for (let i = 0; i < count; i++) {
      const endT = startT + widths[i] / widthTotal;
      const midT = (startT + endT) / 2;
      const dome = Math.sin(Math.PI * midT);
      const endY = i === count - 1
        ? plant.shoulder
        : 0.31 + (1 - dome) * 0.24 + rand() * 0.065;
      plant.lobes.push({
        midT,
        endT,
        endY,
        apexY: 0.025 + (1 - dome) * 0.34 + rand() * 0.045,
      });
      startT = endT;
    }
  } else if (plant.kind === 'pointed') {
    plant.spikes = [];
    const count = 5 + Math.floor(rand() * 4);
    const widths = [];
    let widthTotal = 0;
    for (let i = 0; i < count; i++) {
      const width = 0.58 + rand() * 0.84;
      widths.push(width);
      widthTotal += width;
    }
    let startT = 0;
    for (let i = 0; i < count; i++) {
      const endT = startT + widths[i] / widthTotal;
      const tipT = startT + (endT - startT) * (0.38 + rand() * 0.24);
      const edge = Math.abs(tipT - 0.5) * 2;
      plant.spikes.push({
        tipT,
        tipY: 0.035 + edge * 0.37 + rand() * 0.10,
        endT,
        endY: i === count - 1 ? 0.82 : 0.46 + edge * 0.17 + rand() * 0.08,
      });
      startT = endT;
    }
  } else {
    plant.crownHeight = (plant.baseY - plant.topY) * (0.60 + rand() * 0.08);
    plant.crownY = plant.topY + plant.crownHeight / 2;
    plant.crownPoints = [];
    const count = 9 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / count;
      const radius = i === 0 ? 1 : 0.78 + rand() * 0.32;
      plant.crownPoints.push({
        x: Math.cos(angle) * plant.width * 0.50 * radius,
        y: Math.sin(angle) * plant.crownHeight * 0.50 * radius,
      });
    }
    plant.trunkWidth = plant.width * (0.13 + rand() * 0.035);
    plant.trunkLean = plant.width * (rand() - 0.5) * 0.06;
  }
  return plant;
}

// A periodic layer of discrete plants. Irregular gaps create both openings and
// clusters; wide crowns and a few deliberately tucked-in companions guarantee
// natural overlaps. Sorting by the foot of each plant gives those overlaps a
// stable sense of depth instead of alternating arbitrarily around the band.
function treelineLayer(g, W, H, rand, {
  count, baseMin, baseMax, heightMin, heightMax,
  treeHeightMin, treeHeightMax,
  treeChance, pointedChance, fills, ink, companions,
}) {
  const step = W / count;
  const gaps = [];
  let gapTotal = 0;
  for (let i = 0; i < count; i++) {
    const gap = 0.40 + rand() * 1.28;
    gaps.push(gap);
    gapTotal += gap;
  }

  const plants = [];
  let x = rand() * step;
  for (let i = 0; i < count; i++) {
    const roll = rand();
    const kind = roll < treeChance
      ? 'tree'
      : roll < treeChance + pointedChance ? 'pointed' : 'bush';
    const baseY = (baseMin + rand() * (baseMax - baseMin)) * H;
    let height = (heightMin + rand() * (heightMax - heightMin)) * H;
    let width = step * (0.72 + rand() * 0.55);
    if (kind === 'tree') {
      height = H * (treeHeightMin + rand() * (treeHeightMax - treeHeightMin));
      // Tree crowns are compact and roughly round in the references. Basing
      // their width on H avoids the wide, flattened ovals produced when the
      // population count (and therefore horizontal step) changes.
      width = H * (0.22 + rand() * 0.09);
    } else if (kind === 'pointed') {
      width *= 0.60 + rand() * 0.18;
      height *= 0.86 + rand() * 0.17;
    }

    const plant = prepareHorizonPlant(rand, {
      kind,
      x: ((x % W) + W) % W,
      period: W,
      width,
      baseY,
      topY: baseY - height,
      fill: fills[Math.floor(rand() * fills.length)],
      branchLean: width * (rand() - 0.5) * 0.24,
      hasBranches: kind === 'tree' || (kind === 'bush' && rand() < 0.25),
    });
    plants.push(plant);

    // Every few plants, tuck in a smaller neighbour. These are the deliberate
    // local stacks visible in the references; the rest arise naturally from
    // the irregular spacing and different crown widths.
    if (i % companions === 2) {
      const companionKind = kind === 'pointed' ? 'bush' : 'pointed';
      const companionWidth = width * (0.48 + rand() * 0.18);
      const companionHeight = height * (0.55 + rand() * 0.16);
      const companionBase = baseY + H * (0.012 + rand() * 0.026);
      plants.push(prepareHorizonPlant(rand, {
        kind: companionKind,
        x: (plant.x + width * (rand() < 0.5 ? -0.34 : 0.34) + W) % W,
        period: W,
        width: companionWidth,
        baseY: companionBase,
        topY: companionBase - companionHeight,
        fill: fills[Math.floor(rand() * fills.length)],
        branchLean: companionWidth * (rand() - 0.5) * 0.20,
        hasBranches: companionKind === 'bush' && rand() < 0.20,
      }));
    }

    x += (gaps[i] / gapTotal) * W;
  }

  plants.sort((a, b) => a.baseY - b.baseY);
  for (const plant of plants) {
    paintHorizonPlant(g, H, plant, ink);
  }
}

// The whole band, back to front.
export function paintHorizon() {
  const W = 4096;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(HORIZON_SEED);

  // About three major mountains cross the wide first-person view, but they are
  // not three copies laid on a ruler: spacing, width, height and lean all vary.
  // The occasional pale one is drawn behind a neighbour, reproducing the small
  // local overlaps in the references without building another full row.
  mountainBand(g, W, H, rand, {
    peak: SKYLINE.mountainPeak, base: SKYLINE.mountainBase,
    count: 10,
    fill: PAL.horizonMountain,
    backFill: PAL.horizonMountainBack,
    ink: PAL.horizonMountainInk,
    backInk: PAL.horizonMountainBackInk,
    line: 0.009,
  });

  // The field, laid in before the woods so their feet are planted in it.
  g.fillStyle = PAL.horizonField;
  g.fillRect(0, SKYLINE.mountainBase * H, W, H - SKYLINE.mountainBase * H);

  // Haze along the foot of the hills. Distance is haze, and without it the
  // ranges sit on the treeline like cut paper. Stopped above the woods rather
  // than run down behind them — see SKYLINE.treeBase.
  const haze = g.createLinearGradient(0, SKYLINE.mountainPeak * H, 0, SKYLINE.hazeTo * H);
  haze.addColorStop(0.00, 'rgba(255,255,255,0)');
  haze.addColorStop(0.70, `${PAL.horizonHaze}7A`);
  haze.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = haze;
  g.fillRect(
    0,
    SKYLINE.mountainPeak * H,
    W,
    (SKYLINE.hazeTo - SKYLINE.mountainPeak) * H,
  );

  // The fill begins below anything the ordinary hop can reveal. Above it are
  // two depth-sorted collections of complete plants. Their varied shapes,
  // footing and occasional local overlaps remain readable when a jump exposes
  // more of the sheet; there is no continuous scalloped ribbon to reveal.
  g.fillStyle = PAL.horizonTree;
  g.fillRect(0, SKYLINE.treeBase * H, W, H - SKYLINE.treeBase * H);

  treelineLayer(g, W, H, rand, {
    count: 15,
    baseMin: 0.61, baseMax: 0.68,
    heightMin: 0.13, heightMax: 0.205,
    treeHeightMin: 0.24, treeHeightMax: 0.34,
    treeChance: 0.20, pointedChance: 0.30,
    fills: [PAL.horizonTreeBack, PAL.horizonTreeMid],
    ink: PAL.horizonTreeInk,
    companions: 5,
  });
  treelineLayer(g, W, H, rand, {
    count: 13,
    baseMin: 0.80, baseMax: SKYLINE.treeBase,
    heightMin: 0.15, heightMax: 0.25,
    treeHeightMin: 0.29, treeHeightMax: 0.41,
    treeChance: 0.22, pointedChance: 0.24,
    fills: [PAL.horizonTreeMid, PAL.horizonTree],
    ink: PAL.horizonTreeInk,
    companions: 4,
  });

  return c;
}

// `poleCorrect` and its whole apparatus stood here — POLE_FIX_FROM, MARK_TOL,
// MAX_MARK_PX, smoothstep01 and a flood fill that found every isolated mark in
// the polar caps and widened it about its own centre to undo the sphere's
// squeeze. It was written against a ground that arrived as a drawing, where the
// only way to know which pixels were a mark was to go and look.
//
// The field is painted here now, so the correction is applied FORWARD: each tick
// is stretched by 1/cos(lat) as it is drawn, about the same centre, from a
// latitude that is known rather than recovered. That is the same correction done
// the easy way round, and it retires a readback of four and a half million
// pixels at load along with every guess the old pass had to make.

// ---------------------------------------------------------- tracks, retired
//
// PATH_STEP, PATH_LAYERS, pathStamp() and paintPaths() stood here: a soft
// radial stamp laid every 0.2 units along the great circle between two
// landmarks, in two passes — wide-and-faint under narrow-and-firm, because one
// pass saturates inside a texel and gives a road with a cut edge instead of a
// path worn into a field.
//
// Retired with the tracks themselves — see the note where paintPaths was
// called, below in paintGlobe. Two things it knew are worth having if this is
// ever rebuilt rather than rewritten: a track has to be STAMPED rather than
// stroked, because this canvas squeezes toward the poles and a stroked
// polyline has one width in texels the whole way (a path climbing to 46
// degrees arrived 1.44 times too narrow); and the stamps have to overlap by
// enough that eight of them cover any point, which is what made the edge
// continuous rather than scalloped.

// The seed for the field's own marks, so the planet has the same freckles every
// visit for the same reason the constellations do.
const FIELD_SEED = 3391;

// One tick: the short dark stroke the reference frames scatter over every field.
//
// Never alone. They come in ones, twos and threes leaning off each other, which
// is the difference between a mark somebody made and a mark a computer made —
// and drawn as a slightly bowed line with a round cap rather than a straight
// one, because a straight tick reads as a scratch.
//
// `xs` pre-stretches for the sphere's squeeze the same way the room's wall marks
// do. Scaling the CONTEXT rather than the numbers is deliberate: canvas scales
// the pen with it, and for a near-vertical stroke the pen's thickness is
// horizontal, so an x-only scale would fatten the line as well as move it. It is
// undone around the stroke width below.
function fieldTick(g, rand, x, y, scale, xs, colour) {
  const roll = rand();
  const n = roll < 0.42 ? 1 : roll < 0.84 ? 2 : 3;
  g.save();
  g.translate(x, y);
  g.scale(xs, 1);
  g.strokeStyle = colour;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const len = (5.5 + rand() * 5.5) * scale;
    const lean = (rand() - 0.5) * 0.9;
    const ox = (i - (n - 1) / 2) * (3.4 + rand() * 2.2) * scale;
    const oy = (rand() - 0.5) * 2.4 * scale;
    g.lineWidth = (1.25 + rand() * 0.75) * scale / Math.max(1, xs);
    g.globalAlpha = 0.55 + rand() * 0.4;
    g.beginPath();
    g.moveTo(ox, oy);
    g.quadraticCurveTo(
      ox + lean * len * 0.35 + len * 0.10, oy - len * 0.55,
      ox + lean * len, oy - len,
    );
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
}

// Sand uses the anime's other ground gesture: one to three short horizontal
// pencil dashes, loosely stacked. It is deliberately not a rotated fieldTick;
// that painter describes blades and leans upward, while these marks lie flat
// on bare ground.
function fieldDash(g, rand, x, y, scale, xs, colour) {
  const roll = rand();
  const n = roll < 0.30 ? 1 : roll < 0.86 ? 2 : 3;
  const base = (7 + rand() * 7) * scale;
  const tilt = (rand() - 0.5) * 0.12;
  g.save();
  g.translate(x, y);
  g.scale(xs, 1);
  g.strokeStyle = colour;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const len = base * (0.68 + rand() * 0.55);
    const ox = (rand() - 0.5) * 5 * scale;
    const oy = (i - (n - 1) / 2) * (3.6 + rand() * 1.8) * scale;
    g.lineWidth = (1.05 + rand() * 0.55) * scale;
    g.globalAlpha = 0.62 + rand() * 0.28;
    g.beginPath();
    g.moveTo(ox - len / 2, oy - tilt * len / 2);
    g.lineTo(ox + len / 2, oy + tilt * len / 2);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
}

// A speck of blossom printed into the field — the job `flat-flower-*.png` used
// to do as a decal, done in the texture instead. At this size a flower is three
// or four dots, and trying for petals only produces mud.
function fieldBloom(g, rand, x, y, scale, xs, colour) {
  g.save();
  g.translate(x, y);
  g.scale(xs, 1);
  g.fillStyle = colour;
  const r = (0.9 + rand() * 0.8) * scale;
  const spread = r * 1.15;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + rand() * 0.5;
    const px = Math.cos(a) * spread;
    const py = Math.sin(a) * spread;
    g.moveTo(px + r, py);
    g.arc(px, py, r, 0, TAU);
  }
  g.fill();
  g.restore();
}

export function paintGlobe() {
  // Half again as fine as the flat fill this replaced, because it now has
  // something on it to be fine ABOUT. At 3072 across a planet 50 units round,
  // a texel is a sixtieth of a world unit, so a tick is nine of them — enough
  // to keep its bow and its round ends at the distance you read the field from.
  //
  // It does not chase the ground at your feet, and should not: there the
  // texture is magnified four times whatever it costs, and the thing that
  // carries close-up detail is the grass standing in it rather than the paint
  // under it. Doubling this again would be twenty more megabytes to sharpen
  // marks that blades are already covering.
  const W = 3072;
  const H = 1536;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(FIELD_SEED);

  const latOf = (y) => (0.5 - (y + 0.5) / H) * Math.PI;
  const lonOf = (x) => ((x / W) - 0.25) * Math.PI * 2;
  // The same frame the lakes are placed in and the sun is read in: u = 0 sits a
  // quarter turn west of lon 0. Getting this wrong is the bug that once put the
  // visible water a quarter turn from the water the rules enforced.
  const dirAt = (x, y) => {
    const lat = latOf(y);
    const lon = lonOf(x);
    const cl = Math.cos(lat);
    return _fieldDir.set(cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon));
  };

  // ------------------------------------------------------------ the field
  //
  // Painted here rather than loaded from `ground-day.png`, which was two million
  // pixels of a single flat colour and is retired. Everything the drawn file
  // could never carry is what this is for: the biomes, which have to agree with
  // rules living in config, and the pole correction, which needs to know which
  // marks are marks.
  //
  // Base colour first, biome by biome. A row is a ring of constant latitude so
  // the biome weight only has to be asked once per CELL rather than once per
  // pixel — at 2048 across, a 16-pixel cell is a fifth of a degree, which is
  // finer than the softest edge in the table.
  //
  // A WEIGHTED SUM over the whole mix, rather than starting from a meadow colour
  // written in here and lerping toward whatever else was in force. The meadow is
  // an entry in the table now like anything else and arrives with its own share
  // of the weight — see `biomesAt` — so there is no default to hold, and no
  // second copy of "what this planet is when nothing else is happening" living
  // in the painter. It is also simply the right arithmetic: chained lerps are
  // order-dependent and only agree with the average when one weight is small.
  const CELL = 16;
  const mix = [];
  const base = new THREE.Color();
  const other = new THREE.Color();
  for (let y = 0; y < H; y += CELL) {
    for (let x = 0; x < W; x += CELL) {
      biomesAt(dirAt(x + CELL / 2, y + CELL / 2), CONFIG.biomes, mix);
      base.setRGB(0, 0, 0);
      for (const { biome, w } of mix) {
        other.set(biome.ground);
        base.r += other.r * w;
        base.g += other.g * w;
        base.b += other.b * w;
      }
      g.fillStyle = `#${base.getHexString()}`;
      // A pixel of overlap, so neighbouring cells cannot leave a seam grid.
      g.fillRect(x, y, CELL + 1, CELL + 1);
    }
  }

  // The marks, and each biome brings its own — its own colour, its own size and
  // its own number of them. This is most of what makes the sand read as bare
  // ground rather than as a bleached meadow: the ticks there are BROWN, because
  // they are marks on dirt, and the specks among them are GREEN, because on a
  // field with nothing growing on it the only thing worth printing is the little
  // that does. On the meadow it is the other way round and always was.
  //
  // Their density is the biome's `ticks` and `blooms` rather than its `cover`,
  // which is the one thing about this that changed shape rather than value.
  // `cover` is now about LIVING things only — see CONFIG.biomes — because the
  // sand grows almost nothing and is still heavily hatched, and one number
  // asked to say both left it a blank cream fill.
  //
  // Scattered by AREA rather than by row — a count per unit of solid angle,
  // turned into a count per row by the cosine — or the caps would end up furred
  // and the equator bare. The `xs` stretch below fixes each mark's SHAPE;
  // nothing but this fixes how many there are.
  // COUNTED AGAINST HOW MUCH GROUND THEY COVER, not against how many look busy
  // in the texture. A tick group is about 0.15 of a unit across, so it covers
  // roughly a fiftieth of a square unit; the planet has 804 of those. The first
  // pass asked for 22000 and carpeted the place — 55% of the field was mark,
  // which is not a meadow with ticks on it, it is a meadow made of ticks. The
  // reference frames run nearer a tenth, and this is what a tenth costs.
  const TICKS = 6000;
  const BLOOMS = 1600;
  // `howMany` reads this mark's own density off a biome and is averaged across
  // the mix; `draw` is handed the biome that WON the spot, so it can use that
  // one's colours and scale.
  //
  // Strongest-wins for the look and a blend for the count, which is not an
  // inconsistency — a mark is a discrete thing and there is no half-brown,
  // half-green hatch stroke to draw. What it does along a border is better than
  // a blend would be: the two kinds interleave across the wash in proportion to
  // their weights, and a dither between two textures reads as one becoming the
  // other rather than as a line where they meet.
  const scatter = (count, howMany, draw) => {
    for (let i = 0; i < count; i++) {
      const lat = Math.asin(1 - 2 * rand());
      const y = (0.5 - lat / Math.PI) * H;
      const x = rand() * W;
      biomesAt(dirAt(x, y), CONFIG.biomes, mix);
      let density = 0;
      for (const { biome, w } of mix) density += howMany(biome) * w;
      if (rand() > density) continue;
      // THE POLE CORRECTION, applied as the mark is drawn rather than hunted
      // down afterwards. A sphere squeezes a texture horizontally by cos(lat),
      // so a mark widened about its own centre by the reciprocal comes out
      // square on the planet. Clamped high rather than tight — a tick near the
      // pole genuinely is ten texels wide for one tall, and that is what makes
      // it a tick rather than a hair when it gets to the sphere.
      const xs = Math.min(10, 1 / Math.max(0.02, Math.cos(lat)));
      for (const wrap of [-W, 0, W]) draw(x + wrap, y, xs, mix[0].biome);
    }
  };
  scatter(
    TICKS,
    (b) => b.ticks,
    (x, y, xs, b) => {
      if (b.tickStyle === 'dash') {
        fieldDash(g, rand, x, y, b.tickScale || 1, xs, b.tick);
      } else {
        fieldTick(g, rand, x, y, 1, xs, b.tick);
      }
    },
  );
  scatter(
    BLOOMS,
    (b) => b.blooms,
    (x, y, xs, b) => {
      // A blended border can have non-zero density while the dominant biome is
      // deliberately bare. Do not borrow a neighbouring biome's bloom there.
      if (b.blooms <= 0) return;
      fieldBloom(
        g, rand, x, y, b.bloomScale, xs,
        b.bloom[Math.floor(rand() * b.bloom.length)],
      );
    },
  );

  // `poleCorrect(g, W, H)` ran here, and does not any more. It was a whole pass
  // that read the finished texture back, found every isolated mark in the polar
  // caps by flood fill, and widened each about its own centre to undo the
  // sphere's squeeze — which was the only way to do it when the ground arrived
  // as a drawing nobody here had made.
  //
  // It is unnecessary now, and that is the quiet dividend of painting the field
  // rather than loading it: THE MARKS ARE STRETCHED AS THEY ARE DRAWN, by the
  // same 1/cos(lat) about the same centres, from a latitude that is known
  // exactly rather than recovered from pixels. Same correction, done forward
  // instead of backward — no readback of four and a half million pixels at
  // load, no flood fill, and no guessing which pixels were a mark.

  const latAt = (y) => (0.5 - y / H) * Math.PI;
  const widen = (y) => 1 / Math.max(0.30, Math.cos(latAt(y)));

  // Draw once, plus a copy across the seam when the shape overhangs an edge.
  const wrap = (x, halfW, draw) => {
    draw(x);
    if (x - halfW < 0) draw(x + W);
    if (x + halfW > W) draw(x - W);
  };

  // Lakes go on here rather than into ground-day.png, on purpose. CONFIG.lakes
  // is one table driving four things at once — the water you can see, the
  // characters steering around it, the ground cover refusing to sprout in it,
  // and the teasing you get for paddling in it — so moving a lake in config
  // moves all of them together. Draw one into the ground image instead and the
  // rules still put the water where config says, which is how you end up wading
  // through invisible ponds.
  //
  // WHAT GOES ON THE TEXTURE IS THE BED, not the water.
  //
  // `g.drawImage(IMG.lake, ...)` stood here — one drawing of a pond, stamped
  // flat. The water is built geometry now (see water.js) and floats a
  // centimetre above this, so what the texture owes it is the bottom under it —
  // one dark disc in the outline's own colour, so nothing shows at the shore
  // but the pen line.
  //
  // It is painted rather than dropped for the same reason the field is. The rim
  // is a wobbled shape that `lakeRim` in sphere.js decides, and the mesh above
  // is built by asking that same function — so the bed traces it too, and the
  // three of them cannot part company. A drawing could not: it would be an
  // ellipse under a pond that is not one, and the mismatch would show as sand
  // sticking out past the water at every lobe.
  //
  // 0.25, not the 0.5 a first sketch of "u wraps once around" suggests, and it
  // is load-bearing: THREE.SphereGeometry's texture frame puts world longitude
  // λ (lon 0 = +Z, per sphere.js) at u = 0.25 + λ/2π — the same frame
  // skyDirFromTexel spells out for the sun. Painted at 0.5 the lakes rendered a
  // quarter turn east of where every rule said they were, so the cast politely
  // steered around two invisible patches of grass while the grass scatter
  // carpeted the visible water. Measured by rendering the bare planet and
  // reading pixels, not deduced — the formula lies convincingly.
  //
  // `paintPaths(g, W, H, widen, wrap)` stood here, and with it the whole of the
  // worn-track system — the stamp, the two layers, `CONFIG.paths` and PAL.path.
  // Six tan lines along great circles between the landmarks, about an eighth of
  // the surface, laid to answer "which way" on a planet whose horizon is 4.8
  // units off.
  //
  // They are gone because the field is better without them. A meadow with roads
  // drawn on it is a map of somewhere; this one is a place, and the ticks and
  // the biomes were already doing the work of making it readable. Getting lost
  // on a small planet is a walk, not a failure state.
  //
  // What went with them is worth knowing if they are ever wanted back: the
  // ordering mattered — the tracks were painted BEFORE the lakes so water had
  // the last word if a leg ever ran at a pond — and the routes were a minimum
  // spanning tree over the landmarks plus one closing edge, which is what kept
  // every one of them reachable by following a line.
  for (const spec of CONFIG.lakes) paintBed(g, W, H, widen, wrap, spec);

  return c;
}

// The bottom of a pond, traced from the same rim the water above it is built
// from. `wrap` and `widen` come from paintGlobe so the seam and the pole stretch
// are handled exactly as they are for everything else on that canvas.
//
// A little OVERSIZE — see BED_OVER. The bed has to reach past the water on every
// side, because the two are drawn by different machinery at different times: one
// is a polygon on an equirectangular canvas being resampled onto a sphere, the
// other is a mesh sitting on that sphere. They agree to within a texel or so,
// and a texel of grass showing between the water and its own shore would be a
// bright green hairline round the whole pond. Oversizing hides it under the
// water, where nobody can see whether it was needed.
//
// It was 1.035, which was free while an opaque ink DISC covered everything out
// to 1.03 and the overshoot only ever showed as a hair of shore. The outline is
// a drawn line now (see ringGeo in water.js) with places where the pen lifts,
// and at a gap this overshoot is bare: the water's fill visibly running past
// where its edge should be. 1.5% of the big lake is 0.057 units — about three
// texels of this canvas at 3072 across, so the hairline still cannot appear,
// and what shows at a gap is a fill that overshoots its line by a line's width.
// Which is what hand-colouring looks like, so it is left visible rather than
// chased to zero.
const BED_OVER = 1.015;

// Enough segments that the fastest harmonic in the rim — five per turn — is
// smooth. Fewer than the mesh gets, and that is fine: this is a shape a few
// hundred texels across being seen through water, not a silhouette.
const BED_STEP = 64;

export function paintBed(g, W, H, widen, wrap, spec) {
  const C = new THREE.Vector3();
  const E = new THREE.Vector3();
  const N = new THREE.Vector3();
  dirFromLatLon(spec.lat, spec.lon, C);
  localFrame(C, E, N);

  // The rim as a run of points on the canvas, walked once. Each is turned from
  // the lake's own gnomonic parameters into a direction — exactly as water.js
  // does it, and the note there explains the projection — and from there into
  // lat/lon and then into texels.
  //
  // Longitude is UNWRAPPED as it goes: a pond straddling the seam would
  // otherwise have its points leap a whole canvas width mid-outline, and the
  // fill would come out as a band right across the planet. Tracking the step
  // from the previous point and nudging by whole turns keeps the outline
  // continuous, and `wrap` then draws the copies that are genuinely needed.
  const cx = (((0.25 + spec.lon / (Math.PI * 2)) % 1) + 1) % 1 * W;
  const cy = (0.5 - spec.lat / Math.PI) * H;
  const reach = (spec.rx * spec.rimHi / Math.PI) * H * widen(cy) * BED_OVER;

  // The rim as a run of points on the canvas, at some fraction of the way out.
  // Once called twice — sand at one size, mud at another — back when the bed
  // was two colours; the machinery keeps the `k` parameter because it costs
  // nothing and the next ring somebody wants will want it.
  const outline = (k) => {
    const pts = [];
    let prev = null;
    for (let i = 0; i < BED_STEP; i++) {
      const th = (i / BED_STEP) * Math.PI * 2;
      const rho = lakeRim(th, spec) * k;
      _bedDir.copy(C)
        .addScaledVector(E, Math.tan(rho * Math.cos(th) * spec.rx))
        .addScaledVector(N, Math.tan(rho * Math.sin(th) * spec.ry))
        .normalize();
      const lat = Math.asin(Math.max(-1, Math.min(1, _bedDir.y)));
      let lon = Math.atan2(_bedDir.x, _bedDir.z);
      // Longitude UNWRAPPED as it goes. A pond straddling the seam would
      // otherwise have its outline leap a whole canvas width mid-shape, and the
      // fill would come out as a band right across the planet. `wrap` then draws
      // the copies that are genuinely needed.
      if (prev !== null) {
        while (lon - prev > Math.PI) lon -= Math.PI * 2;
        while (prev - lon > Math.PI) lon += Math.PI * 2;
      }
      prev = lon;
      pts.push([(0.25 + lon / (Math.PI * 2)) * W, (0.5 - lat / Math.PI) * H]);
    }
    // The points came from an arbitrary lap of longitude, so slide the whole
    // outline onto the centre it belongs to. Measured off the outline's own
    // middle rather than off any one point of it.
    let mx = 0;
    for (const p of pts) mx += p[0];
    mx = mx / pts.length - cx;
    for (const p of pts) p[0] -= mx;
    return pts;
  };

  const fill = (pts, dx, colour) => {
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(pts[0][0] + dx, pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + dx, pts[i][1]);
    g.closePath();
    g.fill();
  };

  // One fill, in the WATER's own colour — see the palette note at the retired
  // bed entries. A sand band round a mud middle stood here, and the sand was
  // the brown ring the reference has no answer to.
  //
  // Water-coloured rather than ink-coloured because the outline is a drawn line
  // now and a drawn line has gaps in it. Whatever lies under a gap is what the
  // player sees there, and the only right answer is the pond: fill meeting
  // grass, no line, exactly as the reference does it where its pen lifts.
  //
  // The shallows still read shallow — that cue lives in the water's own vertex
  // paling, which never depended on this.
  const bed = outline(BED_OVER);
  wrap(cx, reach, (px) => fill(bed, px - cx, PAL.waterDeep));
}
const _bedDir = new THREE.Vector3();

// What a shadow is made of. Two tones, because a shadow is the colour of the
// surface it falls on with the light taken out of it, and this planet has two
// surfaces anything stands on. The green is the grass; the second is the room,
// whose floor is a pale grey and whose rug is a cream, and where one stamp of
// lawn-green under every stick of furniture read as a patch of garden that had
// got in under the roof.
const SHADOW_GRASS = [74, 104, 64];
export const SHADOW_ROOM = [92, 84, 80];

// A soft contact shadow, and SOFT is the whole of the design.
//
// The stops used to hold 0.34 out to seven tenths of the radius and then fall
// to nothing across the last three, which is not a gradient — it is a disc with
// a feathered edge. Foreshorten that edge at a low camera, which is where this
// camera spends its life, and the feather is thinner than a pixel: what is left
// on screen is a hard-rimmed ellipse of flat colour lying under everybody. The
// fall now starts immediately and runs the whole way out, so there is no edge
// anywhere for the eye to catch and read as an object.
// ------------------------------------------------------------- water light
//
// The squiggles of light lying on a pond. A tiling sheet, scrolled slowly across
// the surface by water.js — see driftWater.
//
// SEAMLESS IS THE WHOLE JOB HERE, and it is why every mark is drawn up to nine
// times. A tile whose marks stop at its edges shows a grid the moment it
// repeats, and on a pond that grid would be the most obvious thing on the
// planet, because it is the only large flat surface in the world. So each
// squiggle is stamped at its own place and again at every offset that could
// bring it back into frame from a neighbouring tile; the ones that land outside
// cost a clipped draw and nothing else.
//
// The marks themselves are the reference art's: a short, slightly bowed dash
// with round ends and a nick out of the middle of the longer ones, drawn as two
// dashes with a gap. Not ellipses, and not a noise field — what says "water" in
// this style is a small number of confident white strokes with a lot of space
// between them, in loose horizontal rows.
const GLINT_SEED = 8821;
const GLINT_PX = 512;
const GLINT_MARKS = 26;

// `paintFish()` stood here: one white fish, seen from above, nose to the top of
// the canvas, whose whole design was that it started at 1.0 everywhere so a
// material colour could BECOME its colour rather than stain it. Three koi were
// three tints of that one drawing.
//
// The fish are drawn now — twelve files in `asset/images/fish/`, listed by
// FISH_SPECIES — and the reason is the reason the ground and the lake gave up
// their drawings, arriving from the opposite direction. Those were pictures
// that could not carry rules; this was a rule that could not carry a picture. A
// tint says what colour a fish is and can say nothing else, so a white master
// could never grow a puffer's dots, a needlefish's length or the waves down a
// ripplefin's back, and every new species it could ever have had was another
// swatch. The pen and the palette are still the planet's — the drawings wear
// the same ink and the same pastels this file mixes — but they are now the
// art's business rather than this function's.
//
// What did NOT change is how a fish is coloured by the hour: see paintFishCard
// below and `sink` in config.js. The white master is gone; multiplying is not.

// A drawn fish, cropped to the fish, ready to be a texture.
//
// The drawings arrive square, at the size the art was made — and a fish is
// never square. The needlefish is a fifth of its canvas across; the puffer
// fills nearly the whole of it. Everything that shows a fish measures this
// canvas and sizes itself from it, so shipping the square would be one lie told
// in three places at once: the swimming card would take its length from the
// margin rather than the animal, the chip in the pouch would be a small fish in
// a big box, and the hand would hold each species at whatever fraction of the
// slot its own file's whitespace happened to leave. Cropped, `len` means length
// and the puffer and the needle are the same handful of creature.
//
// SHEET_PAD goes back on afterwards, for exactly the reason SHEET_PAD exists:
// content flush with the edge of a texture has its outermost row smeared by the
// mipmaps, and on these that fringe would run along the ink.
//
// Cached per image — the pouch rebuilds its chips on every inventory change and
// the crop is a full pixel readback of the drawing.
const FISH_CARDS = new Map();

export function paintFishCard(img) {
  let c = FISH_CARDS.get(img);
  if (c) return c;
  const flat = makeCanvas(img.naturalWidth, img.naturalHeight);
  flat.getContext('2d').drawImage(img, 0, 0);
  const b = sheetBounds(flat);
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const p = SHEET_PAD;
  c = makeCanvas(w + p * 2, h + p * 2);
  c.getContext('2d').drawImage(flat, b.minX, b.minY, w, h, p, p, w, h);
  FISH_CARDS.set(img, c);
  return c;
}

// A fistful of pulled grass, for the pouch and the hand. The blades in the
// world have no ink — grass is the one thing the pen never touches out there —
// and the card keeps that rule. It is one flat, soft-green silhouette: broad
// leaves fanning from a small joined middle, like the simple cut-paper shape in
// the anime, with three pulled roots hanging below it. The six round-ended leaf
// strokes and beige threads that stood here read as a whisk at hand size;
// tapered filled leaves and outlined roots keep their shape when the card is
// small and make the handful feel soft rather than wiry.
let KUSA_CARD = null;

export function paintKusa() {
  if (KUSA_CARD) return KUSA_CARD;
  const W = 256;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');

  // One continuous contour rather than separate radial ribbons. Apart from
  // matching the reference much more closely, that distinction matters at the
  // size it is held: separate leaves reduce to a many-pointed star, while this
  // outline keeps the broad lobes, shallow notches and asymmetric little lower
  // shoots that make it read as a handful of soft grass.
  //
  // These points are deliberately sparse. Canvas joins them into an organic
  // cut-paper outline. The rounded ink stroke is the same warm line used by
  // the rest of the game's drawings: heavy enough to survive at hand and pouch
  // size, without turning the shallow notches between leaves into black wedges.
  const outline = [
    [139, 49], [139, 62], [138, 71], [139, 80], [141, 88], [144, 95],
    [150, 91], [154, 85], [160, 81], [167, 78], [175, 76], [184, 75],
    [194, 75], [203, 76], [211, 78], [215, 82],
    [206, 83], [199, 86], [191, 88], [184, 91], [178, 95], [172, 99],
    [167, 104], [162, 109], [160, 112], [161, 116],
    [168, 117], [177, 118], [187, 118], [193, 120],
    [185, 122], [177, 124], [170, 127], [163, 130], [159, 136], [161, 139],
    [165, 140], [166, 144], [169, 146], [168, 148],
    [160, 148], [156, 149], [153, 147], [152, 138], [150, 130], [147, 123],
    [140, 120], [138, 123], [140, 131], [143, 138], [143, 143], [142, 147],
    [138, 148], [133, 143], [127, 139], [120, 136], [112, 134], [104, 134],
    [95, 135], [88, 138], [81, 141], [75, 145], [70, 150], [68, 153],
    [67, 146], [70, 139], [74, 133], [79, 128], [86, 125], [95, 124],
    [102, 121], [103, 117], [101, 114], [95, 110], [88, 107], [81, 104],
    [74, 101], [66, 99], [61, 99],
    [67, 97], [76, 96], [86, 96], [94, 98], [102, 98], [103, 94],
    [101, 91], [98, 84], [94, 78], [90, 72], [85, 67], [80, 62],
    [74, 58], [66, 56], [63, 54],
    [73, 54], [82, 55], [90, 57], [97, 60], [103, 64], [109, 68],
    [114, 73], [119, 78], [122, 78], [125, 76],
    [125, 69], [128, 61], [132, 55], [137, 50],
  ];

  g.save();

  // The pulled roots sit behind the leafy body, so their three joins disappear
  // into the grip instead of ending as visible round caps. Unlike the leaves,
  // the reference draws these as three SOLID ink strokes—there is no green
  // centre. Their unequal lengths are load-bearing too: the nearly vertical
  // middle root is longest, the left root reaches most of the way down, and the
  // right root stops noticeably sooner.
  const roots = [
    [
      [143, 146],
      [139, 156, 151, 167, 146, 179],
      [142, 191, 157, 201, 150, 213],
      [146, 225, 156, 234, 152, 240],
    ],
    [
      [141, 148],
      [145, 157, 133, 167, 138, 177],
      [141, 187, 126, 195, 132, 205],
      [134, 211, 124, 216, 127, 218],
    ],
    [
      [145, 148],
      [151, 155, 150, 166, 160, 175],
      [169, 181, 162, 190, 171, 196],
      [178, 199, 172, 203, 176, 204],
    ],
  ];
  g.strokeStyle = PAL.line;
  g.lineWidth = 7.2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const root of roots) {
    g.beginPath();
    g.moveTo(root[0][0], root[0][1]);
    for (let i = 1; i < root.length; i++) g.bezierCurveTo(...root[i]);
    g.stroke();
  }

  g.fillStyle = '#CDE49F';
  g.strokeStyle = PAL.line;
  g.lineWidth = 6.2;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) g.lineTo(outline[i][0], outline[i][1]);
  g.closePath();
  g.fill();
  g.stroke();

  // The three roots and the leafy body meet in one dark, irregular knot in the
  // reference. Without it the tiny space between four independently
  // antialiased edges shows the ground through as a hole. Drawn last, this
  // closes that seam and also hides the perfectly round caps where the roots
  // begin.
  g.fillStyle = PAL.line;
  g.beginPath();
  g.moveTo(137, 145);
  g.bezierCurveTo(140, 141, 148, 142, 152, 146);
  g.bezierCurveTo(155, 150, 152, 157, 147, 158);
  g.bezierCurveTo(141, 159, 136, 154, 137, 145);
  g.closePath();
  g.fill();
  g.restore();

  KUSA_CARD = c;
  return c;
}

// ---------------------------------------------------------------- fishing
//
// The float. Drawn once and shown as crossed quads (the ground cover's trick),
// so it reads from every side without ever being turned. The shape is the
// classic red-capped float with a stem — nothing in this world fishes with
// tackle more serious than that, and nothing should.
export function paintBobber() {
  const W = 96;
  const H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const cx = W / 2;
  const cy = H * 0.58;
  const r = W * 0.36;
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // Stem first, buried by the body's outline — the same layering the fish's
  // fins and the bear's ears use.
  g.strokeStyle = PAL.line;
  g.lineWidth = W * 0.075;
  g.beginPath();
  g.moveTo(cx, cy - r);
  g.lineTo(cx, H * 0.12);
  g.stroke();
  g.fillStyle = PAL.bobberTop;
  g.beginPath();
  g.arc(cx, H * 0.12, W * 0.085, 0, TAU);
  g.fill();
  g.lineWidth = W * 0.055;
  g.beginPath();
  g.arc(cx, H * 0.12, W * 0.085, 0, TAU);
  g.stroke();

  // The body: red cap over a pale belly, split at the waterline the float
  // actually sits at, so the drawing agrees with where it is anchored.
  g.fillStyle = PAL.bobberLow;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.fill();
  g.fillStyle = PAL.bobberTop;
  g.beginPath();
  g.arc(cx, cy, r, Math.PI, 0);
  g.closePath();
  g.fill();
  g.strokeStyle = PAL.line;
  g.lineWidth = W * 0.075;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.stroke();

  // One blink of light on the cap. Anything smaller than the pen is the pen.
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(cx - r * 0.38, cy - r * 0.42, W * 0.05, 0, TAU);
  g.fill();
  return c;
}

// The 「!」over the float when something takes it. A paper chip in the app's
// own bubble recipe with the mark drawn as SHAPES — a bar and a dot — rather
// than set in a font, because a glyph this size IS a drawing and fonts differ
// by device.
export function paintExclaim() {
  const W = 84;
  const H = 108;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rr = 20;
  g.fillStyle = 'rgba(255, 253, 247, 0.96)';
  g.strokeStyle = PAL.line;
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(4, 4, W - 8, H - 8, rr);
  g.fill();
  g.stroke();
  g.fillStyle = PAL.line;
  g.beginPath();
  g.roundRect(W / 2 - 7, 22, 14, 44, 7);
  g.fill();
  g.beginPath();
  g.arc(W / 2, H - 26, 8, 0, TAU);
  g.fill();
  return c;
}

// The ring a splash leaves. Drawn additively over the water like the glints,
// so the middle has to be genuinely empty or every splash would come with a
// disc of haze in it. Two rings, the inner fainter — a single circle reads as
// a drawn O, a pair reads as something having happened.
export function paintRipple() {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  for (const [r, w, a] of [[0.42, 0.055, 0.95], [0.27, 0.032, 0.45]]) {
    g.beginPath();
    g.arc(S / 2, S / 2, S * r, 0, TAU);
    g.lineWidth = S * w;
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.stroke();
  }
  return c;
}

export function paintGlints() {
  const S = GLINT_PX;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rand = makeRandom(GLINT_SEED);

  // The soft patches go down first, under the dashes: broad blurs of lighter
  // water, the anime's other white mark — its frames carry both, sparse bright
  // dashes over big soft clouds of pale. Two overlapping blobs per patch rather
  // than one, because one radial gradient is a perfect circle and a perfect
  // circle on water reads as a spotlight; two offset ones make a soft lobed
  // shape that reads as light lying however it fell. Same 3x3 stamping as the
  // dashes below, for the same seam.
  //
  // FAINT AND FEW is what makes them water. The first pass used five per tile
  // at 0.30, and over an additive layer on already-pale water the pond came out
  // carbonated — a spread of bokeh with a shore. In the frames the patches are
  // something you notice second, not first: a couple per stretch of water,
  // barely lighter than the water itself.
  const PATCHES = 3;
  for (let i = 0; i < PATCHES; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = S * (0.12 + rand() * 0.10);
    const x2 = x + (rand() - 0.5) * r * 1.2;
    const y2 = y + (rand() - 0.5) * r * 0.8;
    const r2 = r * (0.55 + rand() * 0.4);
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        for (const [px, py, pr] of [[x, y, r], [x2, y2, r2]]) {
          const grad = g.createRadialGradient(px + ox, py + oy, pr * 0.1, px + ox, py + oy, pr);
          grad.addColorStop(0, 'rgba(255,255,255,0.13)');
          grad.addColorStop(0.6, 'rgba(255,255,255,0.06)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grad;
          g.beginPath();
          g.arc(px + ox, py + oy, pr, 0, TAU);
          g.fill();
        }
      }
    }
  }

  g.strokeStyle = PAL.waterGlint;
  g.lineCap = 'round';

  const dash = (x, y, len, w, bow) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x - len / 2, y);
    g.quadraticCurveTo(x, y + bow, x + len / 2, y);
    g.stroke();
  };

  for (let i = 0; i < GLINT_MARKS; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const len = S * (0.045 + rand() * 0.075);
    const w = S * (0.007 + rand() * 0.006);
    // Bowed one way or the other, never straight. A straight white dash reads
    // as a scratch on the lens; a bowed one reads as a ripple catching the sky.
    const bow = (rand() - 0.5) * len * 0.55;
    // Longer marks break in the middle, which is what stops a sheet of dashes
    // looking like a sheet of dashes. `gap` is the fraction taken out.
    const gap = len > S * 0.085 ? 0.30 : 0;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        if (!gap) { dash(x + ox, y + oy, len, w, bow); continue; }
        const seg = len * (1 - gap) / 2;
        dash(x + ox - (len - seg) / 2, y + oy, seg, w, bow * 0.5);
        dash(x + ox + (len - seg) / 2, y + oy, seg, w, bow * 0.5);
      }
    }
  }
  return c;
}

// ------------------------------------------------------------- water waves
//
// The dark wave lines on the pond — the ink half of what the anime draws on
// water, where the glints above are the light half. Its frames put both on
// every stretch of it: sparse white dashes and patches, and over them a few
// thin strokes of the pen wandering sideways, which is most of what makes the
// surface read as a surface. A tiling sheet like the glints', stamped 3x3 for
// the same seam, worn by the nami mesh in water.js.
//
// IT IS DRAWN THREE TIMES, and the three canvases are the animation. Hand-drawn
// water does not slide anywhere — it BOILS: the same lines redrawn a little
// differently each frame of the anime, alive because no two passes of a hand
// agree. So `rand` lays the marks out and is seeded the same for every frame —
// a squiggle stays WHERE it is — while `jig` wobbles the pen along each stroke
// and is seeded by the frame number. Flipping between the sheets (water.js,
// on a slow clock) wiggles every line in place without anything travelling,
// which is exactly the difference between water moving and water flowing.
const NAMI_SEED = 5150;
const NAMI_PX = 512;
const NAMI_MARKS = 12;
export const NAMI_FRAMES = 3;

export function paintNami(frame) {
  const S = NAMI_PX;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rand = makeRandom(NAMI_SEED);
  const jig = makeRandom(NAMI_SEED + 977 * (frame + 1));

  g.strokeStyle = PAL.line;
  g.lineCap = 'round';

  for (let i = 0; i < NAMI_MARKS; i++) {
    // Layout from `rand`: identical across the three frames.
    const x = rand() * S;
    const y = rand() * S;
    // One to three humps, alternating up and down — the classic sideways-S of
    // drawn water. A single hump is a short tick; three is a long wander.
    const humps = 1 + Math.floor(rand() * 3);
    const seg = S * (0.055 + rand() * 0.025);
    const len = seg * humps;
    const amp = S * (0.012 + rand() * 0.012);
    const w = S * (0.0060 + rand() * 0.0028);
    const tilt = (rand() - 0.5) * 0.30;
    // Pressure varies stroke to stroke, like the reference's do — some lines
    // are confident and some are afterthoughts.
    const alpha = 0.55 + rand() * 0.25;

    // Wobble from `jig`: this frame's hand. Worked out ONCE per mark and
    // reused by all nine stamped copies, or the copies at the tile's edges
    // would wobble differently from the original and the boil would break the
    // seam it was drawn nine times to hide.
    const J = S * 0.008;
    const jog = [];
    for (let h = 0; h < humps; h++) {
      jog.push([
        (jig() - 0.5) * 2 * J, (jig() - 0.5) * 2 * J,
        (jig() - 0.5) * J, (jig() - 0.5) * J,
      ]);
    }
    const jx0 = (jig() - 0.5) * J;
    const jy0 = (jig() - 0.5) * J;

    g.globalAlpha = alpha;
    g.lineWidth = w;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.save();
        g.translate(x + ox, y + oy);
        g.rotate(tilt);
        g.beginPath();
        g.moveTo(-len / 2 + jx0, jy0);
        for (let h = 0; h < humps; h++) {
          const sx = -len / 2 + seg * h;
          const dir = h % 2 ? 1 : -1;
          const [jcx, jcy, jex, jey] = jog[h];
          g.quadraticCurveTo(
            sx + seg / 2 + jcx, dir * amp + jcy,
            sx + seg + jex, jey,
          );
        }
        g.stroke();
        g.restore();
      }
    }
  }
  g.globalAlpha = 1;
  return c;
}

export function paintShadow(rgb = SHADOW_GRASS) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const [cr, cg, cb] = rgb;
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  // Darkest under the middle and never quite as dark as it was: the old peak
  // was carrying the whole shadow on its own, and once the falloff does its
  // share the same weight reads as a smudge of ink rather than contact.
  for (const [at, a] of [
    [0.00, 0.32], [0.30, 0.25], [0.55, 0.16],
    [0.75, 0.08], [0.90, 0.025], [1.00, 0],
  ]) grad.addColorStop(at, `rgba(${cr},${cg},${cb},${a})`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, TAU);
  g.fill();
  return c;
}

// The spot you tapped, drawn on the grass.
//
// A RING RATHER THAN A DISC, and that is the whole of the design. A filled mark
// reads as something lying there — a stone, a fallen petal, one more thing to
// walk past — where a ring reads as a place, which is exactly what it is. It is
// also the one drawn thing here that is not a picture of anything: it is the app
// saying "this is where you said", so it is drawn in the pen every outline in
// this world already uses and nothing else.
//
// Tinted with everything else rather than left bright, so at night it goes blue
// along with the grass it is lying on instead of glowing on a dark hillside.
export function paintWalkMarker() {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const mid = S / 2;
  const r = S * 0.34;

  // A pale wash inside it. Without this the ring is a line on green and hard to
  // pick out at any distance; with it there is a lightened patch of ground for
  // the ring to be the rim of, which is what makes it read from across a field.
  const wash = g.createRadialGradient(mid, mid, 0, mid, mid, r * 1.08);
  wash.addColorStop(0.00, 'rgba(255,253,247,0.30)');
  wash.addColorStop(0.72, 'rgba(255,253,247,0.20)');
  wash.addColorStop(1.00, 'rgba(255,253,247,0)');
  g.fillStyle = wash;
  g.fillRect(0, 0, S, S);

  g.strokeStyle = PAL.line;
  g.globalAlpha = 0.62;
  g.lineWidth = S * 0.052;
  g.beginPath();
  g.arc(mid, mid, r, 0, TAU);
  g.stroke();

  // And the spot itself inside it, because the ring alone names an area and the
  // thing being named is a point.
  g.globalAlpha = 0.44;
  g.fillStyle = PAL.line;
  g.beginPath();
  g.arc(mid, mid, S * 0.048, 0, TAU);
  g.fill();

  return c;
}

// The focus mark: a small paper arrow floating over whatever the buttons are
// about — a friend the people-verbs will reach, a piece 「ひろう」 will take.
// It replaced the ground ring for focus duty, and the reason is in the two
// kinds of target: a ring under a bear was half-covered by the bear, and a
// ring under a FRIEND read as a lock-on, which is a grammar this world does
// not have. Above the head is where attention already lives here — it is
// where the speech bubbles go — so the mark borrows the same spot and the
// same materials: paper fill, the one pen, rounded like everything else.
//
// Drawn pointing DOWN, at the thing it is about. Like the walk ring it is not
// a picture of anything — it is the app saying "your buttons mean this one" —
// and it is tinted with the world rather than left bright, so at night it
// dims to lamplight along with whoever it is floating over.
export function paintFocusMark() {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');

  // A rounded triangle, wider than tall — the squat proportion reads as a
  // marker where an equilateral one reads as a warning sign. arcTo rounds
  // each corner without the path having to know where the tangent points
  // land; the first moveTo is the midpoint of the top edge, which is on
  // every version of the outline whatever the corner radius does.
  const w = S * 0.66;
  const h = S * 0.54;
  const cx = S / 2;
  const top = (S - h) / 2;
  const r = S * 0.10;
  const pts = [
    [cx + w / 2, top],       // top-right
    [cx, top + h],           // the point, at the bottom
    [cx - w / 2, top],       // top-left
  ];
  g.beginPath();
  g.moveTo(cx, top);
  for (let i = 0; i <= pts.length; i++) {
    const p = pts[i % pts.length];
    const q = pts[(i + 1) % pts.length];
    g.arcTo(p[0], p[1], q[0], q[1], r);
  }
  g.closePath();

  g.fillStyle = 'rgba(255,253,247,0.96)';
  g.fill();
  g.strokeStyle = PAL.line;
  g.lineWidth = S * 0.055;
  g.lineJoin = 'round';
  g.stroke();

  return c;
}

// ---------------------------------------------------------------------- rain
//
// ONE DROP, as the sprite every falling point is cut from.
//
// It is a STREAK and not a dot, and the lean is drawn INTO it rather than
// applied to it. Point sprites face the screen and cannot be turned, so a
// vertical drawing is rain falling straight down whatever the wind is doing —
// and the fix that suggests itself, rotating the sprite in a shader, buys a
// custom material for a lean nobody measures. Instead the drawing leans by
// RAIN_LEAN and falling.js gives the MOTION the same lean, so what falls and what
// is drawn agree wherever the camera is roughly level, which is where it lives.
//
// Pale rather than blue, which is the thing to keep if this is ever redrawn.
// What you see when you look at rain is not water, it is the light on it — a
// bright scratch against whatever is behind. Painted the pond's blue, a drop
// vanishes into the sky it fell out of and reappears over the grass as lint.
//
// Soft at the top and solid at the bottom: a drop is a smear of where it has
// just been with the water at the end of it, and that asymmetry is most of what
// says "falling" in a still frame.
export const RAIN_LEAN = 0.20;

export function paintRainDrop() {
  const S = 64;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');

  const lean = RAIN_LEAN * S * 0.5;
  const x0 = S / 2 + lean;
  const x1 = S / 2 - lean;

  const grad = g.createLinearGradient(x0, S * 0.06, x1, S * 0.94);
  grad.addColorStop(0.00, 'rgba(242,248,255,0)');
  grad.addColorStop(0.45, 'rgba(242,248,255,0.55)');
  grad.addColorStop(0.88, 'rgba(242,248,255,0.95)');
  grad.addColorStop(1.00, 'rgba(242,248,255,0)');

  g.strokeStyle = grad;
  g.lineCap = 'round';
  g.lineWidth = S * 0.085;
  g.beginPath();
  g.moveTo(x0, S * 0.06);
  g.lineTo(x1, S * 0.94);
  g.stroke();

  return c;
}

// WHERE ONE LANDS is `paintRipple` further up this file, and it is already
// exactly right: two rings, the inner one fainter, drawn for the splash a
// fishing float makes. A second painter was written here and deleted, which is
// worth a line rather than nothing — the two drawings came out the same because
// they are the same mark. A drop hitting a puddle and a float hitting a pond
// make one shape, and having two of it would mean tuning it twice.
//
// A PUDDLE in the same drawn language as the rest of the world: one flat pale
// blue shape, an irregular warm-brown pen line and a few economical water
// marks. The old painter built a realistic wet halo from overlapping radial
// gradients, then faded four more gradients together for the water. On this
// otherwise flat anime field that read as an airbrushed stain.
//
// The edge is inked now for the same reason the pond's is: this world owns one
// visible pen, and a patch of water with no pen belongs to another picture.
// What keeps a puddle from becoming a tiny pond is scale and detail — no shore,
// no depth gradient, just a shallow flat face and three quiet ripples.
//
// `seed` picks which puddle this is. Called a handful of times at build so the
// hollows on the planet are not all the same hollow.
export function paintPuddle(seed = 1) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rnd = makeRandom(seed * 7919 + 13);
  const mid = S / 2;

  // A smooth irregular ellipse. Frequencies two, three and five keep it from
  // becoming either a perfect oval or a many-pointed splat; the seeded phases
  // give the three shared textures recognisably different outlines.
  const rx = S * (0.365 + rnd() * 0.020);
  const ry = S * (0.285 + rnd() * 0.018);
  const phase2 = rnd() * TAU;
  const phase3 = rnd() * TAU;
  const phase5 = rnd() * TAU;
  const points = [];
  const count = 28;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const wobble = 1
      + Math.sin(a * 2 + phase2) * 0.070
      + Math.sin(a * 3 + phase3) * 0.045
      + Math.sin(a * 5 + phase5) * 0.024;
    points.push({
      x: mid + Math.cos(a) * rx * wobble,
      y: mid + Math.sin(a) * ry * wobble,
    });
  }

  // Quadratic midpoints round off the sampled outline while preserving its
  // hand-wandered silhouette.
  const puddlePath = () => {
    const first = points[0];
    const next = points[1];
    g.beginPath();
    g.moveTo((first.x + next.x) / 2, (first.y + next.y) / 2);
    for (let i = 1; i <= count; i++) {
      const p = points[i % count];
      const q = points[(i + 1) % count];
      g.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    g.closePath();
  };

  puddlePath();
  g.fillStyle = PAL.puddleFace;
  g.fill();
  g.strokeStyle = PAL.waterInk;
  g.lineWidth = S * 0.022;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();

  // A broad, flat sky catch rather than a gradient. It is clipped to the water
  // and kept faint enough that the puddle still reads as one colour.
  g.save();
  puddlePath();
  g.clip();
  g.globalAlpha = 0.16;
  g.fillStyle = PAL.waterGlint;
  g.beginPath();
  g.ellipse(
    mid - S * 0.10, mid - S * 0.09,
    S * 0.18, S * 0.075, -0.12, 0, TAU,
  );
  g.fill();
  g.restore();

  // Short bowed strokes are the anime shorthand for a still water surface.
  const ripple = (x, y, len, bend, alpha) => {
    g.globalAlpha = alpha;
    g.beginPath();
    g.moveTo(x - len / 2, y);
    g.quadraticCurveTo(x, y + bend, x + len / 2, y);
    g.stroke();
  };
  g.strokeStyle = PAL.waterInk;
  g.lineWidth = S * 0.012;
  ripple(mid - S * 0.18, mid + S * 0.03, S * 0.18, S * 0.018, 0.52);
  ripple(mid + S * 0.19, mid - S * 0.04, S * 0.14, -S * 0.015, 0.46);
  ripple(mid + S * 0.04, mid + S * 0.14, S * 0.22, S * 0.016, 0.40);

  // Two bright pen flicks where the overcast sky catches the shallow water.
  g.strokeStyle = PAL.waterGlint;
  g.lineWidth = S * 0.014;
  ripple(mid - S * 0.10, mid - S * 0.12, S * 0.13, -S * 0.010, 0.82);
  ripple(mid + S * 0.04, mid - S * 0.10, S * 0.055, -S * 0.006, 0.68);
  g.globalAlpha = 1;

  return c;
}

// ----------------------------------------------------------------------- ice
//
// THE CRACKS IN A FROZEN POND, painted onto the same tiling sheet the wave
// lines use — see the nami layer in water.js.
//
// Riding that layer rather than bringing geometry of its own is most of why
// freezing costs nothing: the pond already has a surface-lines pass with a
// repeating texture and an offset, so a frozen pond is that pass with its drift
// stopped and a different drawing in it. Waves become cracks, and no mesh is
// built, sorted or lit that was not there in summer.
//
// FEW, LONG, AND FAINT. The instinct is to draw a shattered windscreen and it
// is wrong twice: heavy cracks read as a pond somebody has broken rather than
// one that has frozen, and a dense web at this tile size turns into grey noise
// the moment it repeats. What reads as ice is a handful of long lines meeting
// at shallow angles with a lot of clear surface between them.
//
// Seamless, because the sheet tiles: every line that leaves an edge is drawn
// again entering the opposite one.
export function paintIceCracks() {
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rand = makeRandom(8123);

  g.strokeStyle = PAL.iceCrack;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // One crack: a nearly straight run across the tile with a few kinks in it.
  // Drawn three times over — once in place and once each side — so a line that
  // runs off an edge arrives back on the other.
  const crack = (x0, y0, ang, len, width, alpha) => {
    const pts = [];
    let x = x0;
    let y = y0;
    let a = ang;
    const steps = 5;
    pts.push([x, y]);
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.5;
      x += Math.cos(a) * (len / steps);
      y += Math.sin(a) * (len / steps);
      pts.push([x, y]);
    }
    g.globalAlpha = alpha;
    g.lineWidth = width;
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        g.beginPath();
        g.moveTo(pts[0][0] + dx, pts[0][1] + dy);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + dx, pts[i][1] + dy);
        g.stroke();
      }
    }
    return pts;
  };

  // The long ones first, then a few short spurs hanging off wherever they
  // happened to end — which is what a crack does. Nothing is placed against
  // anything else; they simply cross, and crossing is what makes it read.
  for (let i = 0; i < 5; i++) {
    const pts = crack(
      rand() * S, rand() * S,
      rand() * Math.PI * 2,
      S * (0.5 + rand() * 0.5),
      S * 0.005,
      0.30,
    );
    const spurs = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < spurs; k++) {
      const from = pts[1 + Math.floor(rand() * (pts.length - 1))];
      crack(from[0], from[1], rand() * Math.PI * 2, S * (0.10 + rand() * 0.14), S * 0.0035, 0.22);
    }
  }

  g.globalAlpha = 1;
  return c;
}

// ------------------------------------------------------------------- rainbow
//
// THE BAND OF COLOUR, painted flat and then bent round the sky by scene.js —
// see buildRainbow, which is where the arc actually becomes an arc.
//
// The canvas is the band UNROLLED: across it (v) runs from the outside of the
// arc to the inside, and along it (u) runs from one foot to the other. That
// separation is the whole reason this is a 2D texture rather than a gradient,
// because the two axes are doing completely different jobs:
//
//   ACROSS is the spectrum, and it has to fade at BOTH edges. A rainbow has no
//   outline — it has a middle where the colour is and two sides where it stops
//   being colour and starts being sky. Give it a hard edge and it reads as a
//   painted stripe, which is the failure mode this drawing exists to avoid.
//
//   ALONG is where it stops. A real arc thins and gives out toward its feet
//   rather than being cut off, and it is the one part of a rainbow everybody
//   has seen and nobody can describe. Baked here, the geometry never has to
//   know: scene.js draws the whole span and this decides how much of it shows.
export function paintRainbow() {
  const W = 512;
  const H = 96;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');

  // The spectrum, outer to inner, with a stop either side at zero alpha so the
  // colour melts into the sky rather than meeting it.
  const bands = PAL.rainbow;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  bands.forEach((hex, i) => {
    // Inside the fades, not across the whole height: the first and last bands
    // need room to arrive at full strength or the red and the violet are never
    // seen at their own colour.
    //
    // The margin was a seventh at first and the arc came out a pale green-blue
    // wash with a pink edge — six bands, of which two were being spent getting
    // to and from nothing. A tenth leaves every band a share of the width and
    // still keeps a soft edge on both sides, which is the thing that must not
    // be traded away: a rainbow with an outline is a sticker.
    const t = 0.10 + (i / (bands.length - 1)) * 0.80;
    grad.addColorStop(t, hex);
  });
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // ...and the ends taken off. `destination-in` keeps what is already painted
  // and multiplies its alpha by what is painted now, which is exactly "fade
  // this out toward both ends" and cannot disturb the colours.
  const fade = g.createLinearGradient(0, 0, W, 0);
  fade.addColorStop(0.00, 'rgba(0,0,0,0)');
  fade.addColorStop(0.22, 'rgba(0,0,0,0.55)');
  fade.addColorStop(0.50, 'rgba(0,0,0,1)');
  fade.addColorStop(0.78, 'rgba(0,0,0,0.55)');
  fade.addColorStop(1.00, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = fade;
  g.fillRect(0, 0, W, H);

  return c;
}

// ---------------------------------------------------------------------- snow
//
// ONE FLAKE, and the whole of the difference between snow and rain is in this
// drawing rather than in any of the numbers around it.
//
// A raindrop is a STREAK — a smear of where it has just been, because it is too
// fast to see. A flake is a THING: slow enough to follow all the way down, so
// it gets a shape and an edge instead of a motion blur. Draw it as a small
// streak and you get very slow rain, which is the one wrong answer that looks
// almost right.
//
// Round and soft rather than a six-armed crystal, and that is the reference's
// call rather than a shortcut. At the size these ever appear on screen a
// crystal is four grey pixels and a suggestion; what the anime draws is a soft
// dot with a bright middle, which reads as snow at any distance.
//
// A little off-centre inside its own square, so that a field of them is not a
// field of identical marks on a grid. Point sprites cannot be rotated, so this
// is the only variation available to the drawing itself — the rest comes from
// the drift, which falling.js gives each flake individually.
export function paintSnowflake() {
  const S = 64;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const mid = S / 2;

  const soft = g.createRadialGradient(mid, mid, 0, mid, mid, S * 0.46);
  soft.addColorStop(0.00, 'rgba(251,253,255,0.98)');
  soft.addColorStop(0.42, 'rgba(251,253,255,0.86)');
  soft.addColorStop(0.72, 'rgba(251,253,255,0.34)');
  soft.addColorStop(1.00, 'rgba(251,253,255,0)');
  g.fillStyle = soft;
  g.fillRect(0, 0, S, S);

  // One brighter core, off centre. It is what stops a flake reading as a blur:
  // a soft dot alone is fog, and a soft dot with something solid in it is a
  // piece of snow.
  const cx = mid - S * 0.04;
  const cy = mid - S * 0.05;
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.16);
  core.addColorStop(0.00, 'rgba(255,255,255,1)');
  core.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, S, S);

  return c;
}

// A SNOWMAN, which is the only thing in this world that the cast MAKE.
//
// That is worth saying before the drawing, because it decides how it looks.
// Everything else standing on this planet either grew there or was built by
// whoever built the planet; this was patted together by three friends who were
// out in the snow, and it has to look patted rather than modelled. So: two
// stacked balls that are not quite round and not quite stacked, drawn with the
// same pen everything else here is drawn with, and a face made of the smallest
// possible number of marks.
//
// `slump` runs 0 to 1 and is how far gone it is. At 0 it stands; at 1 it is the
// sad little lump left over when the snow it was made of has mostly gone. It is
// ONE DRAWING WITH A PARAMETER rather than two sheets, because the whole point
// of a melting snowman is that you cannot say when it stopped being one — a
// cross-fade between two states would put a moment on it.
export function paintSnowman(slump = 0) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const mid = S / 2;

  // The head sinks into the body and the body spreads, which is what melting
  // does: it does not shrink evenly, it loses height and keeps width. Reading
  // the two radii off one number is what makes every stage in between look like
  // a stage rather than an interpolation.
  const base = S * (0.21 + slump * 0.05);
  const headR = S * 0.145 * (1 - slump * 0.55);
  const bodyY = S * (0.70 - slump * 0.06);
  const headY = bodyY - base * (0.92 - slump * 0.72);

  const ink = PAL.line;
  const lw = S * 0.022;

  // A ball: the snow, a cool shade under its right-hand side so it reads as
  // round, and the pen round the outside. Squashed a little in y, because a
  // ball of snow sitting on the ground is not a circle.
  const ball = (x, y, r, squash) => {
    g.save();
    g.translate(x, y);
    g.scale(1, squash);
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fillStyle = PAL.snowBody;
    g.fill();
    // The shading, clipped to the ball so it cannot leak past the outline.
    g.save();
    g.clip();
    const sh = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.35);
    sh.addColorStop(0.00, 'rgba(255,255,255,0)');
    sh.addColorStop(1.00, PAL.snowShade);
    g.fillStyle = sh;
    g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
    g.lineWidth = lw / Math.min(1, squash);
    g.strokeStyle = ink;
    g.stroke();
    g.restore();
  };

  ball(mid, bodyY, base, 0.86 + slump * 0.24);
  if (headR > S * 0.02) ball(mid, headY, headR, 0.94);

  // THE FACE, and it goes on the head while there is a head. Two coal eyes and
  // nothing else — no carrot, no arms, no scarf. Every one of those is a second
  // object with its own colour, and at the size this is ever seen they turn a
  // snowman into a cluttered smudge. Two dots read from across a field.
  if (headR > S * 0.05) {
    g.fillStyle = ink;
    for (const dx of [-1, 1]) {
      g.beginPath();
      g.arc(mid + dx * headR * 0.36, headY - headR * 0.12, S * 0.016, 0, TAU);
      g.fill();
    }
    // ...and a mouth, which is one short arc and appears only while the head is
    // big enough to carry it. It is the difference between a snowman and two
    // balls of snow with dots on.
    g.strokeStyle = ink;
    g.lineWidth = lw * 0.8;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(mid, headY + headR * 0.06, headR * 0.34, 0.35 * Math.PI, 0.65 * Math.PI);
    g.stroke();
  }

  return c;
}

// THE CLOUD DECK — one overcast sky, painted once, hung over whatever hour it
// currently is and multiplied by that hour's own tint.
//
// ONE TEXTURE FOR THE WHOLE DAY, and it is worth saying why rather than five to
// match the five skies. A grey deck is grey at every hour; what changes between
// a rained-out afternoon and a rained-out midnight is only how much light is on
// it, and the hour already publishes exactly that number as `tint`. Painting
// five would be painting the same cloud under five brightnesses that a multiply
// gives for free — and worse, it would put a HARD SWAP at every phase boundary,
// so dragging the clock through a storm would step the sky between five greys.
// Multiplied, it moves continuously with everything else.
//
// Which is also why it is painted so nearly white. It has to survive being
// taken down to a night sky, and anything already grey here arrives at midnight
// as black.
//
// Equirectangular like paintSky, and wrapped by hand: every blob is drawn three
// times, a width left and right of itself, so the seam down the back of the
// dome has cloud across it rather than a join.
export function paintCloudDeck() {
  const S = SKY_SCALE;
  const W = SKY_DESIGN.w * S;
  const H = SKY_DESIGN.h * S;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = makeRandom(4471);

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, PAL.cloudTop);
  grad.addColorStop(0.62, PAL.cloudTop);
  grad.addColorStop(1.00, PAL.cloudLow);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // The folds. Barely darker than the deck they lie on — see PAL.cloudFold. The
  // squeeze toward the top of an equirectangular sheet is what `1 - v` is for:
  // a blob painted round up there arrives at the zenith stretched into a band,
  // so they are drawn progressively wider the higher they sit.
  for (let i = 0; i < 90; i++) {
    const v = 0.06 + rnd() * 0.80;
    const y = v * H;
    const x = rnd() * W;
    const r = H * (0.05 + rnd() * 0.12);
    const wide = r * (1.9 + (1 - v) * 3.4);
    for (const dx of [-W, 0, W]) {
      const blob = g.createRadialGradient(x + dx, y, 0, x + dx, y, 1);
      blob.addColorStop(0.00, 'rgba(127,140,158,0.40)');
      blob.addColorStop(1.00, 'rgba(127,140,158,0)');
      g.save();
      g.translate(x + dx, y);
      g.scale(wide, r);
      g.fillStyle = blob;
      g.beginPath();
      g.arc(0, 0, 1, 0, TAU);
      g.fill();
      g.restore();
    }
  }

  // ...and a pale band low down, where the light gets in under the cloud. The
  // one thing that stops an overcast sky reading as a lid.
  const under = g.createLinearGradient(0, H * 0.68, 0, H);
  under.addColorStop(0, 'rgba(238,243,248,0)');
  under.addColorStop(1, 'rgba(238,243,248,0.55)');
  g.fillStyle = under;
  g.fillRect(0, H * 0.68, W, H * 0.32);

  return c;
}

// Where the light is coming from in a lit drawing, and how big it is, so that
// the glow put over it can be placed by the art rather than by numbers typed
// into scene.js. Move the house's door to the other side, or give it a second
// window, and the glow follows without anything else being touched.
//
// The test is bright AND warm, not simply bright. The house at night is a mid
// grey dome with pale yellow openings, and brightness alone would drag the
// centroid into the middle of the wall — the lit crown of the roof is nearly
// as pale as the door. Warmth is what separates them: the body is drawn a
// little blue of neutral and the lamps strongly the other way, with nothing in
// between, so the threshold is nowhere near an edge. Measured on
// house-night-1: 2048 of the 2211 pixels that pass are the one value the
// openings are filled with.
//
// `x` and `y` come back as fractions of the canvas, `y` from the BOTTOM because
// that is the edge scenery is anchored by. `r` is a radius as a fraction of the
// canvas WIDTH, covering the lit region and the spill around it.
//
// `r` is built from how far the lit pixels lie from their own centre — their
// RMS distance — and not from a box around them, which was the first attempt
// and is wrong whenever a drawing has more than one opening. This house has a
// window at one end and a door near the middle; a box drawn round both is
// mostly the dark wall BETWEEN them, and the glow it sized came out half the
// house wide and read as fog rather than as a lit doorway. The RMS is pulled by
// where the light actually is, so two small openings some way apart still give
// a small figure. Measured here: 35px against the box's 65, with the disc of
// equal area at 26.
const LIT_LUM = 0.72;
const LIT_WARMTH = 0.10;
const LIT_SPILL = 2.6;

export function litSpot(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h);
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sq = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const r = data[i];
      const b = data[i + 2];
      const lum = (0.299 * r + 0.587 * data[i + 1] + 0.114 * b) / 255;
      if (lum < LIT_LUM || (r - b) / 255 < LIT_WARMTH) continue;
      n++;
      sx += x;
      sy += y;
      sq += x * x + y * y;
    }
  }

  // Nothing warm in it. A drawing is allowed to be like that — a shuttered
  // house, a lamp that is out — so this is not an error, it is "no glow", and
  // a radius of zero gives the caller nothing to hang.
  if (!n) return { x: 0.5, y: 0.5, r: 0 };

  const mx = sx / n;
  const my = sy / n;
  // Both axes are divided by the WIDTH, the vertical one included. A sprite
  // takes its world width from its own canvas aspect, so a canvas pixel is the
  // same size in world units across as it is up, and dividing the vertical
  // spread by the height instead would quietly stretch it by the aspect — on a
  // house four wide and three tall, by a third.
  const rms = Math.sqrt(Math.max(0, sq / n - mx * mx - my * my));
  return {
    x: mx / w,
    y: 1 - my / h,
    r: (rms / w) * LIT_SPILL,
  };
}

// The light a lit window throws. Drawn white and tinted at the material, the
// way the sun card is, so one stamp serves both jobs it has: the patch of it
// lying on the grass and the softer halo standing in the air above the roof.
//
// The falloff is the whole of it, and it is deliberately not linear. A straight
// ramp puts half the brightness half way out, which over something this wide
// reads as a disc of yellow paint with a soft rim rather than as light. These
// stops keep most of it gathered close in and let the outer third fade to
// almost nothing, so the far grass only just catches it.
//
// fillRect rather than an arc, because the last stop is fully transparent and
// clipping to the circle would only cost a path for pixels that add nothing.
//
// `hole` is where the falloff is allowed to START, as a fraction of the stamp,
// and it exists because a lamp inside a building is not a lamp standing in the
// open. The light does not come from the middle of the house — the middle of
// the house is under the floor. It gets out at the WALL, and everything nearer
// than that is behind an opaque dome that will hide it. With the falloff left
// at the centre the whole bright half is drawn under the building and only the
// flat outer tail reaches grass anybody can see, which reads as a faint even
// tint over the entire hillside rather than as a house with its lights on.
//
// The stops are not re-tuned for it, only squeezed: the same shape, starting at
// the wall instead of at the origin. That keeps it fitted to the (1-t)^2.4 the
// lamp shader lights standing props with, which was measured off this list.
// `paintItemGlow` stood here — the pool a small light standing ON THE FLOOR
// threw, as against the one a window throws down a wall. It was EMPTY at the
// middle, brightest just clear of the lamp's own foot, because a solid core did
// two bad things at once: it lit the brass from inside, and it blew the boards
// directly under the lamp out to a flat yellow disc. Which is also what a real
// one looks like — a lamp on a floor shadows the floor it stands on.
//
// Its stops were the other half of a pair, measured against paintLampGlow's, so
// that the two lights in this world agreed about how far they got; the shader
// exponents 2.0 and 2.4 were fitted to one list each.
//
// Nothing draws light onto a surface any more — see light-model.js — so both
// the stamp and the pair of exponents it was fitted to are gone. The bite it
// cut around the lamp's foot is not missing: a foot is a surface at distance
// zero from the light, and a restore returns it to the colour brass is.

// `hole` is how much of the middle the building itself takes up, as a fraction
// of the whole stamp.
//
// THE MIDDLE IS EMPTY, and it did not use to be. Canvas fills everything inside
// the first stop with that stop's colour, so a hole needed no stop of its own —
// the inner disc came out SOLID, and the note here said that was right because
// what fills that hole is a building, which covers it.
//
// A building covers it from OUTSIDE. You can go in now. The patch lies on the
// planet at a lift of 0.05 and a room's floor is a cap at 0.012, so the solid
// centre of this stamp floats a few centimetres ABOVE the boards of the room it
// belongs to — an additive disc of lamplight the width of the whole building,
// lying over the floor, at every hour the windows are lit.
//
// It went unseen for as long as the room had a brightness of its own to hide
// it. Against a room that is genuinely dark except where a lamp reaches, it was
// the first thing on screen: a cave whose floor was uniformly warm wherever you
// stood and whatever the lantern was doing.
//
// So the hole is a hole. Nothing outside can tell — the building stands in it —
// and the room gets its floor back.
export function paintLampGlow(hole = 0) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const stops = [[0.00, 1], [0.16, 0.74], [0.40, 0.30], [0.68, 0.08], [1.00, 0]];
  // Two stops of nothing across the hole itself, so the fill starts at the wall
  // rather than at the middle of the world. `hole - 1e-4` keeps the second one
  // strictly below the first real stop; a pair at the same offset is a step,
  // which is what is wanted here — the wall is where the light begins.
  if (hole > 0) {
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(Math.max(0, hole - 1e-4), 'rgba(255,255,255,0)');
  }
  for (const [at, a] of stops) {
    grad.addColorStop(hole + at * (1 - hole), `rgba(255,255,255,${a})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}

// ----------------------------------------------------------------- scenery
//
// Nothing at ground level is painted here any more. Grass, flowers, mushrooms
// and the flat white clusters are drawn art, loaded by assets.js and framed by
// paintSheet; the trees and the stumps are geometry in foliage.js.
//
// `paintRock` stood here, and there are no rocks on this planet. It was the last
// code-painted thing on the grass and it showed: a flat grey polygon with a
// highlight and no outline at all, standing among drawn art that is all soft
// fills under a heavy line. There is no rock drawing to replace it with, and
// nothing about this world wants one — see PROP_TYPES in scene.js, where its
// slot in the scatter went.

// ------------------------------------------------------------- a built tree
//
// The two surfaces a tree has when it is geometry rather than a card — see
// js/foliage.js. Both are painted rather than drawn, and both
// are painted FLAT, which is the whole trick and worth stating plainly:
//
// The shell takes no light. Nothing outdoors does, for the reason the house
// shell sets out at length — the sun here is a fixed direction rather than a
// thing that goes round, so half the planet is permanently turned away from it
// and a lit tree standing on the far side would render in shadow all day. So a
// built tree gets exactly what the drawn one had: a flat fill inside a heavy
// ink line. What the geometry adds is not shading, it is the SILHOUETTE — it
// changes as you walk past, which a card cannot do — and the flatness is what
// keeps the thing looking drawn while it does.
//
// Everything below is therefore very slight. A hand's worth of shade under the
// canopy and at the foot of the trunk, and no more, because the line is doing
// the work.

// How dark the underside of a canopy goes, and the foot of a trunk. The house
// skin lands at 0.13 and this is the same order deliberately: they are two
// objects lit by the same nothing, and a tree shaded harder than the building
// beside it reads as a tree from another scene.
const TREE_SHADE = 0.15;

// A drawn blossom, trimmed to its own ink, for scattering over a canopy.
//
// The blossom on a tree was painted here for a while — five circles round a
// sixth, outlined by underpainting — and it was always going to be a
// second-hand version of a thing that already exists. `flower-texture-1.png`
// upward are drawn blossoms in this world's own hand: lobes of unequal size at
// unequal angles under a heavy brown line, irregular in the way a painted
// rosette cannot be talked into being.
//
// They are the standing flowers' shapes WITHOUT the stalk, and they are drawn
// that way rather than cut that way. Cutting was tried and every rule for it
// left a nub: a stalk is joined to its blossom in the drawing, so there is no
// row of pixels where one stops and the other starts. See assets.js.
//
// What is trimmed here is only the TRANSPARENT MARGIN, which is not a crop of
// anything drawn. It is what lets `HEAD` below mean the width of the flower
// rather than the width of whatever canvas it was drawn on, so four blossoms
// that leave four different margins still arrive the same size and centred
// where they were asked for. The sun and the moon are sized off their own alpha
// bounds for exactly this reason.
//
// Cached against the image, since the trim involves a full readback and a
// canopy asks for sixteen of them.
const BLOSSOM_ART = new Map();

function blossomArt(img) {
  let art = BLOSSOM_ART.get(img);
  if (art) return art;

  const full = makeCanvas(img.naturalWidth, img.naturalHeight);
  full.getContext('2d').drawImage(img, 0, 0);
  const b = sheetBounds(full);
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;

  art = makeCanvas(w, h);
  art.getContext('2d').drawImage(full, b.minX, b.minY, w, h, 0, 0, w, h);
  BLOSSOM_ART.set(img, art);
  return art;
}

// A canopy, wrapped round the ball that carries it: `u` laps the equator once,
// `v` runs pole to pole with the crown at v = 1. Canvas row 0 is therefore the
// crown, and a row's polar angle is pi * y / H.
//
// `leaf` is the fill and `seed` picks which scatter of blossom you get, so the
// three tree drawings come out as three different trees rather than one tree in
// three greens.
export function paintTreeCanopy(leaf, seed = 0) {
  const W = 1024;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(TREE_SEED + seed * 977);

  g.fillStyle = leaf;
  g.fillRect(0, 0, W, H);

  // Underneath, where a canopy is its own shade. Nothing at the crown, which
  // faces the sky.
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0.00, 'rgba(58,84,52,0)');
  shade.addColorStop(0.58, 'rgba(58,84,52,0.03)');
  shade.addColorStop(1.00, `rgba(58,84,52,${TREE_SHADE})`);
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);

  scatterBlossom(g, W, H, rand, { count: 16, cosLo: -0.70, cosHi: 0.70, head: 0.056 });
  return c;
}

// The blossom, scattered over a wrapped ball — the drawn flowers.
//
// Placed by COSINE of the polar angle rather than by row, or they would bunch at
// the poles: equal steps of row are not equal steps of surface on a sphere.
// `cosLo` and `cosHi` are the band they are allowed in.
//
// `head` is how wide one is, as a fraction of the texture's width. It works out
// as a constant arc on the surface — the pole correction below cancels the
// latitude exactly — so `2 * pi * radius * head` is the flower's size in world
// units wherever it lands, which is 17.6% of the object's width at 0.056. That
// is what a blossom measures FACE ON, at the middle of the face; anywhere else
// it is foreshortened, and since a tree's are mostly on the side of a ball two
// metres over your head, the ones you notice read nearer 13%.
//
// BIGGER THAN THE DRAWINGS PUT THEM, on purpose. tree-1.png paints its blossom
// at about a twelfth of the tree, but it paints a simple five-point rosette that
// survives being small. These are drawn flowers — five hundred pixels of
// irregular lobe under a heavy line — and shrunk that far the notches between
// the lobes close and the line thins until what lands on the surface is a
// coloured smudge. The shape IS the point of using them; it has to be given
// enough texels to survive.
function scatterBlossom(g, W, H, rand, { count, cosLo, cosHi, head }) {
  const HEAD = W * head;
  for (let i = 0; i < count; i++) {
    // The band exists because of the correction below: it grows without bound
    // toward the poles, and a blossom stretched much past about a third reads as
    // a smear rather than a flower however correctly it has been unsqueezed. A
    // canopy's 0.70 is the worst stretch that still looks like a flower; the
    // 0.78 it started at reached 1.60, which did not.
    const theta = Math.acos(cosHi - rand() * (cosHi - cosLo));
    const y = (theta / Math.PI) * H;
    const x = rand() * W;
    // Which of the drawn flowers, and how far it is turned. Everything is rolled
    // ONCE and reused by all three wrapped copies below: rolled inside that loop
    // the seam came out carrying three different flowers, which shows up only as
    // one blossom changing colour halfway across itself and is the kind of thing
    // you find months later and cannot explain.
    const head = blossomArt(IMG[`flowerTexture${1 + Math.floor(rand() * FLOWER_TEXTURE_VARIANTS)}`]);
    const bw = HEAD;
    const bh = HEAD * (head.height / head.width);
    // Turned a little, because four drawings have to cover sixteen blossoms on
    // every tree and a repeat is much easier to spot when they all sit upright.
    // Applied INSIDE the stretch below, so the flower is turned and then
    // unsqueezed rather than the other way about — swap them and a turned
    // blossom arrives sheared.
    const spin = (rand() - 0.5) * 0.9;
    // Pre-stretched by 1/sin(theta), the same correction the room's wall marks
    // take, and for the same reason: a ring shrinks as it climbs, so anything
    // painted at a constant width arrives squeezed. Clamped, because the
    // correction runs away toward the poles — which is also why the band above
    // keeps clear of them.
    const xs = Math.min(2.2, 1 / Math.max(0.01, Math.sin(theta)));
    // Drawn three times, a canvas apart, so a blossom whose bearing straddles
    // the texture's own seam comes out whole rather than sliced — the same wrap
    // the house's punches use.
    for (const wrap of [-W, 0, W]) {
      g.save();
      g.translate(x + wrap, y);
      g.scale(xs, 1);
      g.rotate(spin);
      g.drawImage(head, -bw / 2, -bh / 2, bw, bh);
      g.restore();
    }
  }
}

// Where the stump's texture stops being its side and starts being its cut face.
//
// One texture covers both, which needs two mappings on one sheet, and this is
// where they meet. Below it `v` runs up the SIDE from the buried rim at 0; above
// it `v` runs in from the rim of the cut face toward its middle at 1. So the
// same coordinate means height on the bark and RADIUS on the face — which is
// what makes a growth ring a straight line in this file and a circle on the
// stump, with no distortion at the middle where a wrapped texture usually pinches
// to nothing. Concentric is the one pattern an equirectangular cap is good at.
//
// The face gets nearly half the sheet for a fifth of the surface, on purpose: it
// is the part you look straight down on, so it is the part that has to hold up.
//
// Exported because js/foliage.js lays its vertices out against this number and
// the two must not drift.
export const STUMP_SPLIT = 0.55;

// The stump: bark below the split, cut face above it.
export function paintStumpSkin() {
  const W = 1024;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(TREE_SEED + 811);
  // Canvas row 0 is v = 1 once flipY has had its way, so the face is at the top
  // of the sheet and the rim between them falls here.
  const rim = Math.round((1 - STUMP_SPLIT) * H);

  g.fillStyle = PAL.stumpBark;
  g.fillRect(0, rim, W, H - rim);
  g.fillStyle = PAL.stumpFace;
  g.fillRect(0, 0, W, rim);

  // The growth rings — arcs rather than closed circles, which is what the
  // drawing has and also what a real cut face has. A ring is a constant radius,
  // so here it is a horizontal run at a constant row; drawing three times a
  // canvas apart lets one straddle the seam without being sliced.
  //
  // Weights and opacities are worth stating plainly, because the first pass got
  // both wrong in the same direction and the result was a blank disc. These sit
  // at four-fifths opacity in a colour a fifth under the face — see PAL.stumpRing
  // — and four texels is about four pixels on screen at the distance you look
  // down on one, which is a drawn line rather than a hairline. Four arcs rather
  // than three, at spans that do not line up, so they read as rings that happen
  // to be broken instead of as three marks at three radii.
  g.strokeStyle = PAL.stumpRing;
  g.lineCap = 'round';
  g.globalAlpha = 0.8;
  for (const [at, from, span, wide] of [
    [0.26, 0.02, 0.58, 4.5],
    [0.44, 0.66, 0.28, 4],
    [0.60, 0.16, 0.46, 3.5],
    [0.78, 0.55, 0.22, 3],
  ]) {
    g.lineWidth = wide;
    for (const wrap of [-W, 0, W]) {
      g.beginPath();
      g.moveTo(from * W + wrap, at * rim);
      g.lineTo((from + span) * W + wrap, at * rim);
      g.stroke();
    }
  }
  g.globalAlpha = 1;

  // The line where the face meets the bark. The hull draws this for you at the
  // silhouette and cannot draw it anywhere else — from above, the rim is not an
  // outline of anything — so the part of it you see when you look down at a
  // stump has to be painted.
  g.strokeStyle = PAL.stumpInk;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, rim);
  g.lineTo(W, rim);
  g.stroke();

  // The grain, LIGHTER than the bark — see PAL.stumpGrain. Short, mostly
  // upright, and kept off the rim so none of them touches the line above.
  g.strokeStyle = PAL.stumpGrain;
  for (let i = 0; i < 34; i++) {
    const x = rand() * W;
    const y0 = rim + (H - rim) * (0.12 + rand() * 0.45);
    const y1 = Math.min(H - 6, y0 + (H - rim) * (0.14 + rand() * 0.26));
    const bow = (rand() - 0.5) * W * 0.012;
    g.globalAlpha = 0.4 + rand() * 0.35;
    g.lineWidth = 2 + rand() * 2;
    for (const wrap of [-W, 0, W]) {
      g.beginPath();
      g.moveTo(x + wrap, y0);
      g.quadraticCurveTo(x + wrap + bow, (y0 + y1) / 2, x + wrap, y1);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  return c;
}

// The bark. `u` laps the trunk, `v` runs up it from the roots at 0, so canvas
// row 0 is the top — the end that is buried in the canopy and never seen.
//
// No cylindrical shading, and that is not an omission. A cylinder's shading
// depends on where you are stood and a texture cannot know that; painting a
// dark edge into it would fix the highlight to one bearing and swing it round
// the trunk as you walked. Flat, with a line round it, is both honest and what
// the drawings do.
export function paintTreeBark() {
  const W = 256;
  const H = 384;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(TREE_SEED + 31);

  g.fillStyle = PAL.treeTrunk;
  g.fillRect(0, 0, W, H);

  // Where the trunk meets the hill. The one place a static texture can darken
  // honestly, because "down" is the same direction from every bearing.
  const foot = g.createLinearGradient(0, H * 0.72, 0, H);
  foot.addColorStop(0, 'rgba(90,64,44,0)');
  foot.addColorStop(1, `rgba(90,64,44,${TREE_SHADE})`);
  g.fillStyle = foot;
  g.fillRect(0, H * 0.72, W, H * 0.28);

  // The grain: short strokes running with the trunk, each bowed a little so
  // none of them is a straight line. The drawings put them mostly low and never
  // right to the top, so they gather where the roots flare.
  //
  // Two dozen fine ones rather than a dozen broad ones, which is what the
  // drawings actually carry — the first pass at this was too few and too thick,
  // and a handful of heavy strokes on a bare trunk reads as damage rather than
  // as bark. The weight has to stay under the outline's, or the grain starts
  // competing with the shape.
  g.lineCap = 'round';
  g.strokeStyle = PAL.treeBarkLine;
  for (let i = 0; i < 24; i++) {
    const x = rand() * W;
    const len = H * (0.08 + rand() * 0.22);
    const y0 = H * (0.26 + rand() * 0.64);
    const y1 = Math.min(H - 4, y0 + len);
    const bow = (rand() - 0.5) * W * 0.05;
    g.globalAlpha = 0.30 + rand() * 0.28;
    g.lineWidth = 1.4 + rand() * 1.6;
    for (const wrap of [-W, 0, W]) {
      g.beginPath();
      g.moveTo(x + wrap, y0);
      g.quadraticCurveTo(x + wrap + bow, (y0 + y1) / 2, x + wrap, y1);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  return c;
}

// ---------------------------------------------------------------- landmarks
// Bigger and more distinctive than scenery, so that walking about has
// somewhere to walk *to* and "where am I" has an answer.
//
// The house is drawn art and needs nothing here — see assets.js for the two
// sheets and scene.js for how the lit one comes up after dark.

// The floating Z over somebody asleep. It stood here once and was removed with
// the note "nobody sleeps any more"; somebody sleeps again — see
// MIDNIGHT_SLEEP.md — so it is back, drawn rather than restored, because the
// thing it floats over is different now.
//
// THREE Z'S UP A DIAGONAL, smallest first, which is the whole of the drawing.
// The size ramp is what makes it read as one mark rising rather than three marks
// side by side, and it is why they are not evenly spaced: each step out is a
// little longer than the last, so the eye follows the line off the top.
//
// PAPER FILLED, INK OUTLINED, and that is not decoration — it is the only way it
// survives where it has to live. A mark drawn in the pen alone is dark on dark:
// the hour this exists for is the one hour the room's lamps are off, by the
// sleeper's own hand, so an ink Z over a sleeping Chiikawa would be invisible
// exactly when it is needed. Stroked twice, wide in the pen and narrow in paper,
// gives a pale mark with its own outline that reads against a dark room AND
// against the near-white bedding a hand's breadth below it. It takes the hour's
// tint like everything else, so it dims to lamplight rather than glowing.
//
// Both passes go over ALL THREE before either moves on, rather than outlining
// and filling each in turn. The z's overlap where the biggest crowds the one
// below it, and per-glyph passes would lay the third one's outline across the
// second one's fill — a seam through the middle of a mark two centimetres wide.
export function paintZzz() {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');

  // Middle, size — as fractions of the canvas. Placed up a diagonal to the
  // right, which is the direction these have drifted in every cartoon ever
  // drawn, and leaves the bottom-left corner clear for the head it rises from.
  const zs = [
    { x: 0.22, y: 0.84, s: 0.16 },
    { x: 0.45, y: 0.55, s: 0.22 },
    { x: 0.74, y: 0.24, s: 0.30 },
  ];

  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Wide pen first, narrow paper over it. The ratio is what sets how heavy the
  // outline looks; scaled per glyph so the small one is not proportionally
  // fatter than the big one.
  //
  // THE PEN IS A FIFTH OF THE GLYPH AND WAS NEARLY A THIRD, which is a bigger
  // difference than it sounds: a stroke swells a shape by half its width on
  // every side, so at 0.30 the largest z grew by thirteen pixels all round and
  // ate the gap to the one below it. Rendered, the three of them fused into a
  // single vertical ribbon — recognisable as a squiggle and not as three z's,
  // which is the whole of what makes the mark read at this size.
  // ...and 0.26 rather than 0.20, which is the other end of the same tuning: at
  // a fifth the outline came out as one or two device pixels on a mark this
  // small, antialiased most of the way to the fill, so the pen read grey instead
  // of as the world's own near-black. The gaps still hold — the widest glyph
  // swells to 97 canvas units against 107 to its neighbour.
  for (const pass of [{ colour: PAL.line, w: 0.26 }, { colour: '#FFFDF7', w: 0.10 }]) {
    g.strokeStyle = pass.colour;
    for (const z of zs) {
      const d = S * z.s;
      const x = S * z.x - d / 2;
      const y = S * z.y - d / 2;
      g.lineWidth = d * pass.w;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + d, y);
      g.lineTo(x, y + d);
      g.lineTo(x + d, y + d);
      g.stroke();
    }
  }

  return c;
}

// ------------------------------------------------------------------- indoors
//
// The house from the inside — the only thing in the app besides the planet that
// is real geometry rather than a card. It is the same half-circle the house is
// drawn as, seen from within: a floor disc with a dome standing on its rim.
//
// That shape is not a stylistic choice, it is what makes the room read as a
// room. Stand inside a round building and the line where the wall meets the
// floor is a CIRCLE around you — which from eye height appears high in the
// middle of the view, where the wall is furthest, and falls away to either side
// where it comes nearest. A curve, sweeping as you turn your head. No flat
// backdrop can do that, and it is the single strongest cue that you are stood
// somewhere rather than looking at a picture.
//
// Two textures, laid out for very different surfaces:
//
//   The FLOOR is a square wrapped onto a disc, so a mark painted round comes out
//   round and there is nothing to correct.
//
//   The WALL is wrapped around the dome, so a texel column is a meridian and a
//   texel row is a ring — and a ring's circumference falls to nothing at the
//   apex. Anything painted at a constant width therefore SQUEEZES as it climbs,
//   by exactly sin(theta). markCluster takes an x scale to undo it, and the last
//   stretch below the apex is left plain rather than painted at scales that run
//   away — which is fine, because that part is the ceiling.

// Both surfaces are the reference drawing's own colours. The marks are the same
// two greys it uses: a lighter one on the wall, a darker one on the floor, since
// a mark has to sit at the same distance from a #FFFBF9 ground as from a
// #E4E1E2 one to read as the same pen.
const ROOM_MARK_WALL = [128, 116, 112];
const ROOM_MARK_FLOOR = [108, 98, 96];
const ROOM_MARK_RUG = [147, 140, 143];

// The pen marks. One to three short strokes stacked loosely — mostly pairs,
// because the reference reads as `=` far more often than as a lone dash — each
// with its own length and a slight tilt.
//
// They are the whole reason the room does not read as a blank screen. A flat
// fill of #FFFBF9 across a wall is a colour; the same fill with a few dozen of
// these scattered over it is a surface, and the eye picks up parallax from them
// as you walk, which is most of what sells the space as three-dimensional.
//
// Drawn from a SEEDED random, so they are the same marks on every visit for the
// same reason the constellations are.
//
// `xs` pre-stretches horizontally for the dome's squeeze. Scaling the context
// rather than the numbers is deliberate: canvas scales the PEN with it, and for
// a near-horizontal dash the pen's thickness is vertical, so an x-only scale
// leaves the stroke weight exactly where it was.
function markCluster(g, rand, x, y, rgb, scale, xs) {
  const roll = rand();
  const n = roll < 0.2 ? 1 : roll < 0.72 ? 2 : 3;
  const baseLen = (11 + rand() * 13) * scale;
  const tilt = (rand() - 0.5) * 0.2;
  g.save();
  g.translate(x, y);
  g.scale(xs, 1);
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const ox = (rand() - 0.5) * 7 * scale;
    const oy = i * (4.5 + rand() * 2.2) * scale;
    const len = baseLen * (0.65 + rand() * 0.55);
    const drop = Math.sin(tilt) * len / 2;
    g.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.55 + rand() * 0.3).toFixed(2)})`;
    g.lineWidth = (1.7 + rand() * 0.7) * scale;
    g.beginPath();
    g.moveTo(ox - len / 2, oy - drop);
    g.lineTo(ox + len / 2, oy + drop);
    g.stroke();
  }
  g.restore();
}

// Where the pen lifts off the seam between wall and floor, leaving a pair of
// dots and picking up again. Straight through would read as printed; this reads
// as drawn, and it is the one thing in the room the eye goes to first.
const SEAM_GAPS = 5;

// You get closer to these walls than to anything outdoors, and it shows. At
// 2048 the texture carried 62 texels per world unit around the base against a
// phone rendering roughly 250 pixels per unit at conversational distance — a
// fourfold magnification, which turned every pen mark into a smudge. 3072 is
// the compromise actually shipped: 12MB on the GPU with its mipmaps, half again
// as sharp, and still a third of what 4096 would have cost.
//
// The seam is still drawn directly in this texture, so its widths follow the
// resolution. The polar mark field handles its own output-space scaling.
export const ROOM_WALL_TEX = { w: 3072, h: 768 };
const WALL_TEX_SCALE = ROOM_WALL_TEX.w / 2048;

export function paintRoomWall() {
  const { w: W, h: H } = ROOM_WALL_TEX;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED);

  g.fillStyle = PAL.roomWall;
  g.fillRect(0, 0, W, H);

  // A polar Voronoi field instead of rows in the rectangular wall texture.
  // Only its seeds are painted: the invisible cells give each little cluster
  // its own patch of plaster, while tangential strokes unwrap as horizontal
  // dashes everywhere from the wall to the ceiling. No cell edges belong on
  // Chiikawa's smooth interior.
  domeStoneNet(g, W, H, {
    rand, ink: PAL.line, mark: ROOM_MARK_WALL,
    drawEdges: false, tangentialMarks: true,
    markSkip: 0.58, includeCentreMark: false,
    rings: 5, edgeCount: 18, scratchScale: 1.15,
  });

  // The seam, along the very bottom edge — which is the rim of the dome, and so
  // exactly where the floor comes up to meet it.
  const seamY = H - 6 * WALL_TEX_SCALE;
  const gaps = [];
  for (let i = 0; i < SEAM_GAPS; i++) {
    gaps.push({
      at: ((i + 0.35 + rand() * 0.3) / SEAM_GAPS) * W,
      half: (9 + rand() * 7) * WALL_TEX_SCALE,
    });
  }
  g.strokeStyle = PAL.line;
  g.lineWidth = 7 * WALL_TEX_SCALE;
  g.lineCap = 'round';
  let from = 0;
  for (const gap of gaps.concat([{ at: W + 100, half: 0 }])) {
    const to = gap.at - gap.half;
    if (to > from) {
      g.beginPath();
      g.moveTo(from, seamY);
      g.lineTo(Math.min(to, W), seamY);
      g.stroke();
    }
    from = gap.at + gap.half;
  }
  g.fillStyle = PAL.line;
  for (const gap of gaps) {
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(
        gap.at + side * (3 + rand() * 3) * WALL_TEX_SCALE,
        seamY + (rand() - 0.3) * 4 * WALL_TEX_SCALE,
        3.4 * WALL_TEX_SCALE, 0, TAU,
      );
      g.fill();
    }
  }
  return c;
}

export function paintRoomFloor() {
  const S = 1024;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 1);

  g.fillStyle = PAL.roomFloor;
  g.fillRect(0, 0, S, S);

  // A disc inscribed in a square texture, so everything outside the circle is
  // never seen and is not worth drawing.
  const R = S / 2;
  // A finer jittered field than the old nine-cell layout. The reference is
  // mostly quiet floor, but its quietness comes from many tiny pencil groups
  // rather than a few large symbols. Broad jitter keeps the grid invisible.
  const GRID = 13;
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (rand() < 0.40) continue;
      const x = (col + 0.08 + rand() * 0.84) * (S / GRID);
      const y = (row + 0.08 + rand() * 0.84) * (S / GRID);
      if (Math.hypot(x - R, y - R) > R * 0.92) continue;
      markCluster(g, rand, x, y, ROOM_MARK_FLOOR, 0.78, 1);
    }
  }
  return c;
}

// ------------------------------------------------------------ what is in it
//
// Openings first. Both the doorway and the windows are drawn as a hole with a
// pen line round it and nothing in the middle: what fills them is a second card
// standing behind, coloured by scene.js from the hour outside. That split is
// what lets one drawing be a bright doorway at noon and a dark one at midnight
// without a second sheet — and it is the same trick the sun card already uses,
// where one pale drawing is tinted into a morning, a midday and an evening.

// A rounded arch: straight sides, a half-circle on top, open at the bottom
// because a doorway meets the floor.
//
// `top` is where the crown sits, and it exists because leaving it at zero
// FLATTENS THE ARCH. The apex landed exactly on the canvas edge, so half the
// stroke fell outside and the topmost few rows of the curve were sliced off
// square — measured at 66 opaque pixels along row 0, a flat lid a third of the
// door's width. It read as a badly drawn arch and survived two attempts to fix
// it in the geometry, because the geometry was never what was wrong.
//
// Callers pass half their line width plus a little. A stroke centred on a path
// needs the canvas to hold the half that falls outside it.
//
// Exported because scene.js punches this same shape OUT of the house's shell
// textures — the drawn doorway and the hole behind it are one arch, and an
// arch described twice is two arches the moment somebody edits one of them.
export function archPath(g, w, top, bottom, r) {
  const cy = top + r;
  g.beginPath();
  g.moveTo(w / 2 - r, bottom);
  g.lineTo(w / 2 - r, cy);
  g.arc(w / 2, cy, r, Math.PI, 0);
  g.lineTo(w / 2 + r, bottom);
}

// ONE door, drawn twice.
//
// The way in is a single opening in a single building, so the thing you see
// from the grass and the thing you see from the rug have to be the same size
// and the same shape. They were not: the outside took its height from its
// drawing while the inside was given a width and a height of its own, so the
// inside stretched a 0.76 drawing into a 0.66 slot and the two arches were
// quietly different curves.
//
// Everything about the shape lives here, and both painters build from it. The
// world size is CONFIG.interior.doorWidth, and the height follows this aspect at
// both ends — so the two cannot drift apart again without someone editing this
// one object.
export const DOOR_SHEET = { w: 210, h: 250, arch: 0.42 };

// Headroom above the crown for the outline's outer half, shared by the two
// halves of the room's doorway so the hole and its frame cannot come apart.
const DOORWAY_TOP = 7;

export function paintDoorway() {
  const { w: W, h: H, arch } = DOOR_SHEET;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = W * 0.035;
  g.strokeStyle = PAL.line;
  archPath(g, W, DOORWAY_TOP, H - 6, W * arch);
  g.stroke();
  return c;
}

// paintDoorwayFill stood here: a painted stand-in for what you would see
// through the doorway, a gradient tinted by the hour. It went when the
// doorway became a genuine hole — what you see through it now is what is
// there.

// ONE window, drawn from one set of numbers — the same unification the door
// has. It was a circle indoors and a square with a cross outside once: not two
// sizes of one window but two different windows, so walking in changed the
// shape of the hole in the wall. Both faces of the wall now wear the same
// paintHouseWindowFrame, built from this sheet.
//
// `margin` is transparent canvas around the frame, and it is why the window
// looked small: the glass is only 74% of the patch it is given, so a window
// asked for at 1.28 across drew at 0.95. The size in CONFIG is the PATCH, and
// this is the number that turns it into what you actually see. It is also the
// inset scene.js punches the opening at, so the frame's own stroke — centred
// on this line and half as wide again as the slack — covers the cut edge.
export const WINDOW_SHEET = { s: 200, margin: 0.13, frame: 0.075, bar: 0.055 };

function windowFrame(g, ink) {
  const { s: S, margin, frame, bar } = WINDOW_SHEET;
  const m = S * margin;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = ink;
  g.lineWidth = S * frame;
  g.beginPath();
  g.rect(m, m, S - m * 2, S - m * 2);
  g.stroke();
  // The cross, thinner than the frame round it — glazing bars are lighter than
  // the frame they sit in, and drawn at one weight the whole thing reads as a
  // grid rather than as a window.
  g.lineWidth = S * bar;
  g.beginPath();
  g.moveTo(S / 2, m);
  g.lineTo(S / 2, S - m);
  g.moveTo(m, S / 2);
  g.lineTo(S - m, S / 2);
  g.stroke();
}

// ----------------------------------------------------------- the house
//
// The outside of the same dome you can stand inside, and now actually a dome
// rather than a drawing of one.
//
// It was a card for a long time and the card was right while the house was
// scenery you looked at from across a field. It stopped being right once the
// house grew a wall you walk around: a billboard turns to face you, so circling
// the building gave no sign you were moving relative to it, and the drawn door
// faced you from every bearing — which reads as the house having no front at
// all, and leaves you with no way to tell where to walk to find the way in.
//
// The shell is geometry. The door and the windows stay drawn, on cards laid
// against it, exactly the way the room's openings are: the shape was the part
// causing the problem, and the openings are the part with the character.

// The skin, wrapped round the dome. Same layout and the same squeeze correction
// as the room's inner wall — see paintRoomWall — because it is the same shape
// seen from the other side.
export function paintHouseSkin() {
  const W = 1024;
  const H = 320;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 7);

  g.fillStyle = PAL.houseWall;
  g.fillRect(0, 0, W, H);

  // The roundness, painted rather than lit.
  //
  // The shell takes no light — see the note where it is built — so nothing in
  // the scene will shade it and a flat fill would read as a circle cut out of
  // paper rather than as a dome. This is a hand's worth of shadow gathering
  // toward the base, which is where a dome darkens: the apex faces the sky and
  // the skirt faces the ground. Kept very slight, because the outline is doing
  // most of the work and anything stronger stops looking drawn.
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0.00, 'rgba(120,104,96,0)');
  shade.addColorStop(0.55, 'rgba(120,104,96,0.035)');
  shade.addColorStop(1.00, 'rgba(120,104,96,0.13)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);

  const theta = (y) => (y / H) * (Math.PI / 2);
  const yTop = H * (Math.asin(0.40) / (Math.PI / 2));
  // Sparse enough that the front reads mostly as clean plaster, with a few
  // little stacked strokes like the anime façade rather than an even texture.
  const COLS = 12;
  const ROWS = 3;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (rand() < 0.48) continue;
      const x = (col + 0.15 + rand() * 0.7) * (W / COLS);
      const y = yTop + (row + 0.2 + rand() * 0.6) * ((H - 18 - yTop) / ROWS);
      markCluster(g, rand, x, y, PAL.houseMark, 0.54, 1 / Math.sin(theta(y)));
    }
  }

  // Four composed accents on the front half. A scatter over the whole dome can
  // leave the façade blank by chance, while the anime always gives the eye a
  // few little strokes around its openings. Bearings use the same UV chart as
  // scene.js: the door is zero and positive is its right-hand side.
  for (const [at, fy, scale] of [
    [-0.72, 0.43, 0.62],
    [-0.78, 0.76, 0.56],
    [0.43, 0.35, 0.56],
    [0.94, 0.73, 0.60],
  ]) {
    const x = ((at + Math.PI / 2) / TAU) * W;
    const y = H * fy;
    markCluster(g, rand, x, y, PAL.houseMark, scale, 1 / Math.sin(theta(y)));
  }
  return c;
}

// The doorway's ink and nothing else: an open arch, drawn once per face of the
// wall. There is no pane painter any more, because there is no pane — the
// doorway is a genuine hole in the shell (scene.js punches it with the same
// archPath), and this frame is what makes a hole read as a doorway. Its stroke
// also covers the punched edge, which carries the texture's own jaggies.
//
// Half the stroke plus a pixel of antialiasing at the top, so the crown of the
// arch has somewhere to be. The bottom keeps the small margin it had — the
// frame is anchored by its patch's bottom edge, so growing that margin would
// lift the whole doorway off the grass again.
export function paintHouseDoorFrame() {
  const { w: W, h: H, arch } = DOOR_SHEET;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const lw = W * 0.055;
  g.lineWidth = lw;
  archPath(g, W, Math.ceil(lw / 2) + 1, H - 8, W * arch);
  g.closePath();
  g.strokeStyle = PAL.houseInk;
  g.stroke();
  return c;
}

// A square with a cross in it, and NOTHING in the square. The one
// straight-edged thing on the whole building, which is why it reads as a
// window from a hundred units away.
//
// It was glazed until the wall could be cut — a pale pane painted where the
// opening should be, lit warm from the lamp machinery so the house could say
// somebody was home. The wall is genuinely cut now (scene.js punches this
// same rect out of every layer), so the pane is gone and what fills the middle
// is whatever is actually on the other side: the room from the grass, the sky
// from the rug. The lit-window signal survives it, and is now told rather than
// painted — an occupied room is warm, an empty one dims, and you read that
// through the hole.
//
// The bars are drawn ACROSS the opening rather than the cut being made around
// them. A glazing bar really is a thin thing spanning a hole, and it is also
// the arrangement that cannot fail: cut four panes instead and the drawing and
// the cut have to agree to the pixel, or a sliver of wall shows down one side
// of every bar.
export function paintHouseWindowFrame() {
  const c = makeCanvas(WINDOW_SHEET.s, WINDOW_SHEET.s);
  windowFrame(c.getContext('2d'), PAL.houseInk);
  return c;
}

// Chiikawa's portrait plate beside the door. The supplied image is drawn
// directly into the existing mounting frame — no tracing or redrawing — and
// clipped to the frame's slightly irregular inner edge.
export function paintHousePlateBlock() {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const m = 18;

  g.fillStyle = PAL.houseWall;
  g.beginPath();
  g.moveTo(m + 2, m);
  g.lineTo(S - m - 1, m + 2);
  g.lineTo(S - m, S - m - 2);
  g.lineTo(m, S - m);
  g.closePath();
  g.fill();

  // Fill the complete inner square with the unchanged source bitmap. Drawing
  // beneath the frame lets its own pale background replace the blank block
  // while the final heavy stroke hides the cropped image edge.
  const inset = m + 4;
  g.save();
  g.beginPath();
  g.moveTo(inset, inset);
  g.lineTo(S - inset, inset + 1);
  g.lineTo(S - inset, S - inset - 1);
  g.lineTo(inset, S - inset);
  g.closePath();
  g.clip();
  g.drawImage(IMG.housePlate, inset, inset, S - inset * 2, S - inset * 2);
  g.restore();

  // Restore the house's strong outer frame over the image.
  g.strokeStyle = PAL.houseInk;
  g.lineWidth = 8;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(m + 2, m);
  g.lineTo(S - m - 1, m + 2);
  g.lineTo(S - m, S - m - 2);
  g.lineTo(m, S - m);
  g.closePath();
  g.stroke();
  return c;
}

// ------------------------------------------------------------- furniture
//
// Drawn louder than the room around it: a heavy dark outline round a soft
// pastel fill, on shapes that are all slightly wrong on purpose — an oval that
// is not quite an ellipse, legs that splay at four different angles, feet that
// are two or three scratches rather than a foot. Nothing in here is symmetrical
// and nothing is straight, because the one thing that would make a table read
// as a 3D model dropped into a paper world is a table drawn accurately.
//
// They are CARDS, like everything else that stands on a surface in this app.
// The room is the one real thing indoors, exactly as the planet is the one real
// thing outdoors — see the note at the top of the indoors section.

// The bold line the furniture is drawn with, as a fraction of a canvas's width,
// so every piece carries the same weight whatever size it is drawn at.
const FURNITURE_STROKE = 0.026;

function inked(g, w, scale = 1) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = w * FURNITURE_STROKE * scale;
  g.strokeStyle = PAL.furnitureInk;
}

// A closed blob that is nearly an ellipse and never exactly one. Each control
// point is nudged by its own amount, so the outline has the small
// irregularities a drawn line has and a computed one does not.
function wobbleOval(g, cx, cy, rx, ry, rand, wobble = 0.05) {
  const N = 14;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const k = 1 + (rand() - 0.5) * 2 * wobble;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  g.beginPath();
  // Through the midpoints, with each point as the control — a closed curve that
  // passes near every point without the corners a polyline would leave.
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let m = mid(pts[N - 1], pts[0]);
  g.moveTo(m[0], m[1]);
  for (let i = 0; i < N; i++) {
    const next = mid(pts[i], pts[(i + 1) % N]);
    g.quadraticCurveTo(pts[i][0], pts[i][1], next[0], next[1]);
  }
  g.closePath();
}

// One spindly leg, splaying out and down, with two or three scratches for a
// foot. The scratches are the whole character of it: a drawn foot would be a
// shape, and these are what a pen does when it stops.
function legWithFoot(g, x0, y0, x1, y1, rand, scale) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) / 2 + (rand() - 0.5) * 6 * scale, (y0 + y1) / 2, x1, y1);
  g.stroke();

  // The foot: two or three separate scratches, wider apart and drawn with a
  // lighter pen than the leg. Both of those matter. At the leg's own weight the
  // marks are thicker than the gaps between them, so they merge into a blob on
  // the end of the leg — which reads as a boot, and the whole charm of the
  // reference is that these are not feet, they are where the pen stopped.
  const pen = g.lineWidth;
  g.lineWidth = pen * 0.55;
  const n = rand() < 0.45 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const fy = y1 + (i - (n - 1) / 2) * (pen * 1.05);
    const fw = (15 * scale) * (0.62 + rand() * 0.66);
    const skew = (rand() - 0.5) * 3 * scale;
    g.beginPath();
    g.moveTo(x1 - fw / 2 + skew, fy);
    g.lineTo(x1 + fw / 2 + skew, fy);
    g.stroke();
  }
  g.lineWidth = pen;
}

// The table, and the one piece with anything on it. What is ON it is most of
// what makes the room feel lived in — a bare table is furniture, a table with
// somebody's book left open on it is a room somebody was just in.
export function paintTable() {
  const W = 460;
  const H = 300;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 3);
  const s = W / 460;

  const cx = W / 2;
  const cy = H * 0.36;
  const rx = W * 0.44;
  const ry = H * 0.21;

  // Legs first, so the top is drawn over where they meet it and nothing shows
  // through the tabletop.
  inked(g, W);
  for (const [dx, out] of [[-0.74, -0.16], [-0.30, -0.07], [0.32, 0.07], [0.76, 0.17]]) {
    const lx = cx + rx * dx;
    const ly = cy + ry * Math.sqrt(Math.max(0, 1 - dx * dx)) - 4 * s;
    legWithFoot(g, lx, ly, lx + W * out * 0.10, H * 0.90, rand, s);
  }

  // The top.
  g.fillStyle = PAL.furniturePink;
  wobbleOval(g, cx, cy, rx, ry, rand, 0.035);
  g.fill();
  g.stroke();

  // --- what is on it
  const ink = (w) => { g.lineWidth = W * FURNITURE_STROKE * w; g.strokeStyle = PAL.furnitureInk; };

  // An open book, a little left of centre: two pages tilted away from a spine,
  // with scribble for text. The scribbles are drawn per line rather than
  // repeated, so no two lines of it are the same length.
  const bx = cx - W * 0.03;
  const by = cy - H * 0.02;
  const pw = W * 0.15;
  const ph = H * 0.15;
  ink(0.85);
  for (const side of [-1, 1]) {
    g.fillStyle = PAL.furniturePaper;
    g.beginPath();
    g.moveTo(bx, by - ph * 0.52);
    g.lineTo(bx + side * pw, by - ph * 0.34);
    g.lineTo(bx + side * pw * 0.94, by + ph * 0.52);
    g.lineTo(bx, by + ph * 0.36);
    g.closePath();
    g.fill();
    g.stroke();

    g.lineWidth = W * 0.0055;
    for (let i = 0; i < 4; i++) {
      const t = 0.18 + i * 0.19;
      const y = by - ph * 0.42 + ph * 0.82 * t + ph * 0.06;
      const len = pw * (0.62 + rand() * 0.22);
      g.beginPath();
      g.moveTo(bx + side * pw * 0.14, y);
      for (let k = 0; k <= 4; k++) {
        const px = bx + side * (pw * 0.14 + (len - pw * 0.14) * (k / 4));
        g.lineTo(px, y + (k % 2 ? 1.6 : -1.6) * s);
      }
      g.stroke();
    }
    ink(0.85);
  }

  // Something with a screen, propped on the right. Green because the reference
  // is, and because the room has no other cool colour in it at all.
  const gx = cx + W * 0.24;
  const gy = cy + H * 0.01;
  const gw = W * 0.145;
  const gh = H * 0.115;
  ink(0.9);
  g.fillStyle = PAL.furnitureGreen;
  g.beginPath();
  g.roundRect(gx - gw / 2, gy - gh, gw, gh, 6 * s);
  g.fill();
  g.stroke();
  // Its stand, two little legs and a bar.
  g.lineWidth = W * 0.010;
  for (const d of [-0.26, 0.26]) {
    g.beginPath();
    g.moveTo(gx + gw * d, gy);
    g.lineTo(gx + gw * d, gy + gh * 0.24);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(gx - gw * 0.42, gy + gh * 0.26);
  g.lineTo(gx + gw * 0.42, gy + gh * 0.26);
  g.stroke();

  // A rubber, left where it was put down.
  ink(0.8);
  g.fillStyle = PAL.furnitureBlue;
  g.beginPath();
  g.roundRect(cx - rx * 0.72, cy - ry * 0.44, W * 0.062, H * 0.045, 5 * s);
  g.fill();
  g.stroke();

  // ...and the crumbs nobody has swept up.
  g.fillStyle = PAL.furnitureInk;
  for (let i = 0; i < 5; i++) {
    const a = rand() * TAU;
    const d = rand() * W * 0.045;
    g.beginPath();
    g.ellipse(
      cx - rx * 0.52 + Math.cos(a) * d, cy + ry * 0.30 + Math.sin(a) * d * 0.5,
      2.6 * s, 1.9 * s, rand() * TAU, 0, TAU,
    );
    g.fill();
  }
  return c;
}

// What is left on the table, seen from above and lying flat on it.
//
// A decal rather than modelled, and that is not a shortcut — a book open on a
// table IS flat, and so is a rubber, and so are the crumbs. Standing at a table
// you look down on all three, which is the one view a decal gets exactly right.
// The pieces of furniture had to become geometry because you walk around them;
// nothing here is something you can walk around.
//
// Drawn on transparent, so only the marks land on the tabletop's own colour.
export function paintTableTop() {
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 6);
  const stroke = (w) => {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = S * w;
    g.strokeStyle = PAL.furnitureInk;
  };

  // The book, open, a little left of the middle and turned a few degrees the
  // way a book actually gets put down.
  g.save();
  g.translate(S * 0.42, S * 0.5);
  g.rotate(-0.13);
  const pw = S * 0.155;
  const ph = S * 0.20;
  stroke(0.013);
  for (const side of [-1, 1]) {
    g.fillStyle = PAL.furniturePaper;
    g.beginPath();
    g.moveTo(0, -ph);
    g.lineTo(side * pw, -ph * 0.86);
    g.lineTo(side * pw * 0.95, ph * 0.9);
    g.lineTo(0, ph);
    g.closePath();
    g.fill();
    g.stroke();

    g.lineWidth = S * 0.0055;
    for (let i = 0; i < 5; i++) {
      const y = -ph * 0.62 + (i / 4) * ph * 1.3;
      const len = pw * (0.60 + rand() * 0.26);
      g.beginPath();
      g.moveTo(side * pw * 0.16, y);
      for (let k = 1; k <= 5; k++) {
        g.lineTo(side * (pw * 0.16 + (len - pw * 0.16) * (k / 5)), y + (k % 2 ? 2.4 : -2.4));
      }
      g.stroke();
    }
    stroke(0.013);
  }
  g.restore();

  // A closed notebook, squared off next to it.
  g.save();
  g.translate(S * 0.71, S * 0.46);
  g.rotate(0.19);
  stroke(0.013);
  g.fillStyle = PAL.furnitureGreen;
  g.beginPath();
  g.roundRect(-S * 0.085, -S * 0.115, S * 0.17, S * 0.23, S * 0.014);
  g.fill();
  g.stroke();
  g.lineWidth = S * 0.008;
  g.beginPath();
  g.moveTo(-S * 0.055, -S * 0.10);
  g.lineTo(-S * 0.055, S * 0.10);
  g.stroke();
  g.restore();

  // The rubber, and the crumbs nobody has swept up.
  stroke(0.011);
  g.fillStyle = PAL.furnitureBlue;
  g.save();
  g.translate(S * 0.25, S * 0.31);
  g.rotate(0.4);
  g.beginPath();
  g.roundRect(-S * 0.042, -S * 0.026, S * 0.084, S * 0.052, S * 0.012);
  g.fill();
  g.stroke();
  g.restore();

  g.fillStyle = PAL.furnitureInk;
  for (let i = 0; i < 6; i++) {
    const a = rand() * TAU;
    const d = rand() * S * 0.055;
    g.beginPath();
    g.ellipse(S * 0.30 + Math.cos(a) * d, S * 0.66 + Math.sin(a) * d,
      S * 0.006, S * 0.0042, rand() * TAU, 0, TAU);
    g.fill();
  }
  return c;
}

// A stool: the table's smaller relation, drawn in the same hand — a round top
// and three legs that do not agree about where they are going.
export function paintStool() {
  const W = 220;
  const H = 240;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 5);
  const s = W / 220;

  const cx = W / 2;
  const cy = H * 0.34;
  const rx = W * 0.40;
  const ry = H * 0.16;

  inked(g, W);
  for (const [dx, out] of [[-0.72, -0.20], [0.10, 0.05], [0.76, 0.22]]) {
    const lx = cx + rx * dx;
    const ly = cy + ry * Math.sqrt(Math.max(0, 1 - dx * dx)) - 3 * s;
    legWithFoot(g, lx, ly, lx + W * out * 0.16, H * 0.88, rand, s);
  }

  g.fillStyle = PAL.furnitureBlue;
  wobbleOval(g, cx, cy, rx, ry, rand, 0.04);
  g.fill();
  g.stroke();
  return c;
}

// Something to stand on that is not the floor. It does one job the walls cannot
// — it sits UNDER you and passes beneath your feet as you walk, which is the
// cue that tells you how fast you are moving and how big the room is.
export function paintRug() {
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 2);
  const R = S / 2 - 10;

  g.fillStyle = PAL.roomRug;
  g.beginPath();
  g.arc(S / 2, S / 2, R, 0, TAU);
  g.fill();

  g.lineWidth = 7;
  g.strokeStyle = PAL.line;
  g.globalAlpha = 0.62;
  g.beginPath();
  g.arc(S / 2, S / 2, R - 4, 0, TAU);
  g.stroke();
  g.globalAlpha = 0.3;
  g.beginPath();
  g.arc(S / 2, S / 2, R - 34, 0, TAU);
  g.stroke();
  g.globalAlpha = 1;

  for (let i = 0; i < 22; i++) {
    const a = rand() * TAU;
    const d = (0.24 + rand() * 0.58) * (R - 40);
    markCluster(
      g, rand,
      S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d,
      ROOM_MARK_RUG, 1.1, 1,
    );
  }
  return c;
}

// ============================================================ stone and cracks
//
// Everything Hachiware's place is made of. It is the same two surfaces the
// house has — a shell you see from outside and a shell you stand inside — plus
// the hill the whole thing is cut into, and all three are painted out of one
// motif: PLATES.
//
// The reference never draws rock as texture. It draws it as a net of irregular
// polygons outlined in a soft brown pen, with a scatter of little paired ticks
// inside the bigger cells and short hairline spurs hanging off some of the
// edges. That is the entire vocabulary, and it holds at every distance in the
// source frames — the wall behind the characters, the cliff in the wide shot
// and the boulder in the manga panel are the same drawing at three scales.
//
// So this file gets one function that draws that net and four surfaces that
// call it with different cell sizes. Nothing here is noise, a filter or a
// generated texture: it is strokes, in the same hand as markCluster above.

// The net itself.
//
// A PERIODIC VORONOI NET. The reference's stones are closed, unequal polygons
// meeting mostly three at a time; they are not rows of quadrilaterals and none
// of their boundaries simply stop. A lightly jittered staggered field keeps the
// sizes calm while Voronoi clipping supplies the five-, six- and seven-sided
// silhouettes. Copies of the field one canvas-width either side make the result
// periodic, so the first and last columns meet when this is wrapped on a dome.
//
// Edges are QUADRATIC rather than straight, bowed by a fraction of their own
// length perpendicular to themselves. A straight line between two jittered
// points still reads as ruled; a bowed one reads as drawn. The bow is signed at
// random, so a plate is not consistently convex.
function crackNet(g, W, H, o) {
  const {
    rand, cols, rows, ink, width, jitter = 0.84,
    top = 0, bottom = H, spur = 0.22, alpha = 1,
    dome = false, apexCells = 5,
  } = o;
  const cw = W / cols;
  const ch = (bottom - top) / rows;
  const widestCell = dome ? W / apexCells : cw;

  const sites = [];
  for (let row = 0; row < rows; row++) {
    // A texel row is a ring round the dome. Its real circumference is
    // `sin(theta)` of the floor ring, so carrying all `cols` sites into the
    // crown forces every boundary into one starburst at the UV pole. Tapering
    // the count with that circumference keeps the stones approximately the
    // same physical size after wrapping. Five at the apex gives the ordinary
    // five-way junction of an irregular stone mesh, rather than two dozen
    // needle-shaped wedges.
    const theta = ((top + (row + 0.5) * ch) / H) * (Math.PI / 2);
    const ringCols = dome ? Math.max(apexCells, Math.round(cols * Math.sin(theta))) : cols;
    const ringCellW = W / ringCols;
    const rowShift = rand() - 0.5;
    for (let col = 0; col < ringCols; col++) {
      const x = ((col + 0.5 + rowShift + (rand() - 0.5) * jitter) * ringCellW + W) % W;
      const y = top + (row + 0.5 + (rand() - 0.5) * jitter * 0.86) * ch;
      sites.push({ x, y });
    }
  }

  // Half-plane clipping of one polygon against the perpendicular bisector
  // between two sites. `a*x + b*y <= c` is the side nearer `site`.
  const clipNearer = (poly, site, other) => {
    const a = 2 * (other.x - site.x);
    const b = 2 * (other.y - site.y);
    const c = other.x * other.x + other.y * other.y
      - site.x * site.x - site.y * site.y;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const dp = c - a * p.x - b * p.y;
      const dq = c - a * q.x - b * q.y;
      const pin = dp >= -1e-5;
      const qin = dq >= -1e-5;
      if (pin) out.push(p);
      if (pin !== qin) {
        const t = dp / (dp - dq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
    return out;
  };

  const periodic = [];
  for (const site of sites) {
    for (const shift of [-W, 0, W]) {
      periodic.push({ x: site.x + shift, y: site.y });
    }
  }

  // Store each shared edge once. Stroking complete cell outlines would paint a
  // common boundary twice and make the net change weight from edge to edge.
  const edges = new Map();
  const edgeKey = (a, b) => {
    const p = `${Math.round(a.x * 10)},${Math.round(a.y * 10)}`;
    const q = `${Math.round(b.x * 10)},${Math.round(b.y * 10)}`;
    return p < q ? `${p}|${q}` : `${q}|${p}`;
  };

  for (const site of periodic) {
    // Replicas further away than a cell cannot reach the visible strip.
    if (site.x < -widestCell * 1.5 || site.x > W + widestCell * 1.5) continue;
    let poly = [
      { x: 0, y: top }, { x: W, y: top },
      { x: W, y: bottom }, { x: 0, y: bottom },
    ];
    for (const other of periodic) {
      if (other === site) continue;
      poly = clipNearer(poly, site, other);
      if (!poly.length) break;
    }
    if (poly.length < 3) continue;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      // Canvas boundaries are crop lines, not cracks. Internal edges that reach
      // x=0 reappear at x=W through the periodic seed copies.
      const onLeft = Math.abs(a.x) < 1e-3 && Math.abs(b.x) < 1e-3;
      const onRight = Math.abs(a.x - W) < 1e-3 && Math.abs(b.x - W) < 1e-3;
      const onTop = Math.abs(a.y - top) < 1e-3 && Math.abs(b.y - top) < 1e-3;
      const onBottom = Math.abs(a.y - bottom) < 1e-3 && Math.abs(b.y - bottom) < 1e-3;
      if (onLeft || onRight || onTop || onBottom) continue;
      const key = edgeKey(a, b);
      if (!edges.has(key)) edges.set(key, [a, b]);
    }
  }

  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = ink;
  g.globalAlpha = alpha;

  // One edge, bowed, plus the spurs that hang off it.
  //
  // The spur is the detail that does the most work for its cost. The reference
  // hangs two or three short strokes off the underside of a long crack — it is
  // how the drawing says a plate has DEPTH, that the stone steps back at this
  // line — and without them the net is a diagram of cells rather than a rock
  // face. They only go on the roughly-horizontal edges, because that is the
  // only orientation the cue means anything in: a spur off a vertical crack is
  // just a shorter crack.
  const edge = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) < 1e-3) return;
    const bow = (rand() - 0.5) * 0.22;
    g.lineWidth = width * (0.88 + rand() * 0.24);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.quadraticCurveTo(
      (a.x + b.x) / 2 - dy * bow, (a.y + b.y) / 2 + dx * bow, b.x, b.y,
    );
    g.stroke();

    if (Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const n = rand() < spur ? (rand() < 0.45 ? 3 : 2) : 0;
    for (let i = 0; i < n; i++) {
      const t = 0.22 + rand() * 0.56;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const drop = ch * (0.10 + rand() * 0.16);
      g.lineWidth = width * 0.62;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + (rand() - 0.5) * drop * 0.5, py + drop);
      g.stroke();
    }
  };

  for (const [a, b] of edges.values()) edge(a, b);
  g.restore();
}

// The little floating marks inside the plates. Rock uses upright hairline
// scratches, not the horizontal `=` clusters on Chiikawa's plaster walls.
function stoneTicks(g, rand, W, H, o) {
  const { cols, rows, rgb, scale, top = 0, bottom = H, skip = 0.4, squeeze } = o;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (rand() < skip) continue;
      const x = (col + 0.15 + rand() * 0.7) * (W / cols);
      const y = top + (row + 0.15 + rand() * 0.7) * ((bottom - top) / rows);
      const xs = squeeze ? squeeze(y) : 1;
      const n = rand() < 0.18 ? 2 : rand() < 0.78 ? 3 : 4;
      const gap = (3.0 + rand() * 2.2) * scale * xs;
      const base = (8 + rand() * 9) * scale;
      g.save();
      g.translate(x, y);
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * gap + (rand() - 0.5) * 2.2 * scale;
        const oy = (rand() - 0.5) * 4 * scale;
        const len = base * (0.68 + rand() * 0.64);
        const lean = (rand() - 0.5) * len * 0.20;
        g.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.55 + rand() * 0.25).toFixed(2)})`;
        g.lineWidth = (1.15 + rand() * 0.55) * scale;
        g.beginPath();
        g.moveTo(ox - lean / 2, oy - len / 2);
        g.lineTo(ox + lean / 2, oy + len / 2);
        g.stroke();
      }
      g.restore();
    }
  }
}

// A stone net drawn in the dome's OWN polar coordinates, then unwrapped into
// the rectangular texture three.js expects.
//
// Drawing the ceiling directly in UV space cannot work at the apex: every
// column of that rectangle becomes the same point, so otherwise ordinary cells
// turn into long petals aimed at the pole. A special cap only trades that star
// for a circular plug. Here the polygons are made on a disc first, where the
// apex is an ordinary point surrounded by ordinary Voronoi cells. Sampling that
// disc by angle and radius produces the strange-looking UV distortion needed
// for the stones to become natural again when the texture is wrapped on the
// dome.
function domeStoneNet(g, W, H, o) {
  const {
    rand, ink, mark, width = 3.2, alpha = 0.92,
    rings = 6, edgeCount = 24, scratchScale = 1,
    drawEdges = true, tangentialMarks = false,
    markSkip = 0.48, includeCentreMark = true,
  } = o;
  const S = 1024;
  const R = S * 0.47;
  const C = S / 2;
  const p = makeCanvas(S, S);
  const pg = p.getContext('2d');
  // One source pixel maps almost 1:1 on the room's 3072-wide texture but about
  // 3:1 on the mound's 1024-wide skin. Treat widths and scratch sizes as output
  // texels, then scale them into the polar source so both surfaces keep the same
  // pen weight.
  const unwrapScale = (TAU * R) / W;
  const polarWidth = width * unwrapScale;

  // One centre stone and loose rings. Counts grow with circumference, so cells
  // stay close to one physical size without creating radial rows.
  const sites = [{ x: C, y: C }];
  const nominal = (TAU * R) / edgeCount;
  for (let ring = 1; ring <= rings; ring++) {
    const baseR = R * (ring / (rings + 0.15));
    const count = Math.max(5, Math.round(edgeCount * (baseR / R)));
    const phase = rand() * TAU;
    for (let i = 0; i < count; i++) {
      const a = phase + ((i + (rand() - 0.5) * 0.32) / count) * TAU;
      const r = baseR + (rand() - 0.5) * nominal * 0.30;
      sites.push({ x: C + Math.cos(a) * r, y: C + Math.sin(a) * r });
    }
  }

  const clipNearer = (poly, site, other) => {
    const a = 2 * (other.x - site.x);
    const b = 2 * (other.y - site.y);
    const c = other.x * other.x + other.y * other.y
      - site.x * site.x - site.y * site.y;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const from = poly[i];
      const to = poly[(i + 1) % poly.length];
      const df = c - a * from.x - b * from.y;
      const dt = c - a * to.x - b * to.y;
      const fin = df >= -1e-5;
      const tin = dt >= -1e-5;
      if (fin) out.push(from);
      if (fin !== tin) {
        const t = df / (df - dt);
        out.push({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        });
      }
    }
    return out;
  };

  const edges = new Map();
  const edgeKey = (a, b) => {
    const p0 = `${Math.round(a.x * 10)},${Math.round(a.y * 10)}`;
    const p1 = `${Math.round(b.x * 10)},${Math.round(b.y * 10)}`;
    return p0 < p1 ? `${p0}|${p1}` : `${p1}|${p0}`;
  };
  for (const site of sites) {
    let poly = [
      { x: C - R, y: C - R }, { x: C + R, y: C - R },
      { x: C + R, y: C + R }, { x: C - R, y: C + R },
    ];
    for (const other of sites) {
      if (other === site) continue;
      poly = clipNearer(poly, site, other);
      if (!poly.length) break;
    }
    if (poly.length < 3) continue;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const key = edgeKey(a, b);
      if (!edges.has(key)) edges.set(key, [a, b]);
    }
  }

  pg.save();
  pg.beginPath();
  pg.arc(C, C, R, 0, TAU);
  pg.clip();
  pg.lineCap = 'round';
  pg.lineJoin = 'round';
  if (drawEdges) {
    pg.strokeStyle = ink;
    pg.globalAlpha = alpha;
    for (const [a, b] of edges.values()) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) < 1e-3) continue;
      const bow = (rand() - 0.5) * 0.18;
      pg.lineWidth = polarWidth * (0.88 + rand() * 0.24);
      pg.beginPath();
      pg.moveTo(a.x, a.y);
      pg.quadraticCurveTo(
        (a.x + b.x) / 2 - dy * bow,
        (a.y + b.y) / 2 + dx * bow,
        b.x, b.y,
      );
      pg.stroke();
    }
  }

  // Sparse parallel scratches. Rock chooses a free orientation; smooth plaster
  // uses the local tangent of the polar field, which unwraps to the anime's
  // horizontal little dash clusters without creating radial lines at the apex.
  pg.globalAlpha = 1;
  for (const site of sites) {
    const radius = Math.hypot(site.x - C, site.y - C);
    if ((!includeCentreMark && radius < nominal * 0.5)
      || rand() < markSkip || radius > R * 0.92) continue;
    const roll = rand();
    const n = tangentialMarks
      ? (roll < 0.18 ? 1 : roll < 0.76 ? 2 : 3)
      : (roll < 0.25 ? 2 : roll < 0.82 ? 3 : 4);
    const angle = tangentialMarks
      ? Math.atan2(site.y - C, site.x - C) + Math.PI / 2
      : rand() * TAU;
    const alongX = Math.cos(angle);
    const alongY = Math.sin(angle);
    const acrossX = -alongY;
    const acrossY = alongX;
    const gap = (3.2 + rand() * 2.8) * unwrapScale * scratchScale;
    // A tangent of fixed length in the polar disc spans an ever larger angle
    // toward its centre. Plaster marks want a stable drawn size in the
    // unwrapped texture, so their along-ring length follows the ring radius.
    // The floor prevents the first ring from collapsing to a dot.
    const tangentSpan = tangentialMarks ? Math.max(0.34, radius / R) : 1;
    const base = (10 + rand() * 10) * unwrapScale * scratchScale * tangentSpan;
    const ox = (rand() - 0.5) * nominal * 0.24;
    const oy = (rand() - 0.5) * nominal * 0.24;
    for (let i = 0; i < n; i++) {
      const sep = (i - (n - 1) / 2) * gap;
      const len = base * (0.72 + rand() * 0.56);
      const cx = site.x + ox + acrossX * sep;
      const cy = site.y + oy + acrossY * sep;
      pg.strokeStyle = `rgba(${mark[0]},${mark[1]},${mark[2]},${(0.55 + rand() * 0.25).toFixed(2)})`;
      pg.lineWidth = (1.2 + rand() * 0.55) * unwrapScale * scratchScale;
      pg.beginPath();
      pg.moveTo(cx - alongX * len / 2, cy - alongY * len / 2);
      pg.lineTo(cx + alongX * len / 2, cy + alongY * len / 2);
      pg.stroke();
    }
  }
  pg.restore();

  // Polar disc -> equirectangular dome texture. Bilinear, premultiplied-alpha
  // sampling matters here: nearest sampling leaves visible stair steps wherever
  // a curved polar edge expands across several UV texels near the crown.
  const src = pg.getImageData(0, 0, S, S).data;
  const dstImage = g.getImageData(0, 0, W, H);
  const dst = dstImage.data;
  const cos = new Float32Array(W);
  const sin = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const a = (x / W) * TAU - Math.PI / 2;
    cos[x] = Math.cos(a);
    sin[x] = Math.sin(a);
  }
  for (let y = 0; y < H; y++) {
    const r = (y / (H - 1)) * R;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(S - 1.001, C + cos[x] * r));
      const fy = Math.max(0, Math.min(S - 1.001, C + sin[x] * r));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const tx = fx - x0;
      const ty = fy - y0;
      const i00 = (y0 * S + x0) * 4;
      const i10 = (y0 * S + x1) * 4;
      const i01 = (y1 * S + x0) * 4;
      const i11 = (y1 * S + x1) * 4;
      const a00 = (src[i00 + 3] / 255) * (1 - tx) * (1 - ty);
      const a10 = (src[i10 + 3] / 255) * tx * (1 - ty);
      const a01 = (src[i01 + 3] / 255) * (1 - tx) * ty;
      const a11 = (src[i11 + 3] / 255) * tx * ty;
      const sa = a00 + a10 + a01 + a11;
      if (sa <= 0) continue;
      const sr = src[i00] * a00 + src[i10] * a10 + src[i01] * a01 + src[i11] * a11;
      const sg = src[i00 + 1] * a00 + src[i10 + 1] * a10
        + src[i01 + 1] * a01 + src[i11 + 1] * a11;
      const sb = src[i00 + 2] * a00 + src[i10 + 2] * a10
        + src[i01 + 2] * a01 + src[i11 + 2] * a11;
      const di = (y * W + x) * 4;
      const inv = 1 - sa;
      dst[di] = sr + dst[di] * inv;
      dst[di + 1] = sg + dst[di + 1] * inv;
      dst[di + 2] = sb + dst[di + 2] * inv;
    }
  }
  g.putImageData(dstImage, 0, 0);
}

// ------------------------------------------------------------- the mound
//
// Hachiware's place, from outside. It is one shell doing two jobs — the hill
// and the hollow in it — so this canvas has to carry both: rock plates over
// most of it, and a cap of meadow over the crown with the grass hanging in
// lumps over the stone. See CONFIG.cave for why the two are one thing.
//
// Same layout as paintHouseSkin: a canvas wrapped round a dome, so a column is
// a meridian and a row is a ring, canvas top is the apex. The same deliberate
// lack of any lighting, too — what makes it read round is painted here.
//
// The plates are NOT squeeze-corrected the way the room's dashes are, and that
// is a decision rather than an oversight. A dash stretched by 1/sin near the
// apex is a dash that stopped being a pen stroke; a NET squeezed toward the
// apex is what a net of cracks on a dome actually looks like from outside, with
// the plates foreshortening as they turn away over the top. The ticks are
// corrected, because they are dashes.

// How far down the dome the turf reaches, as a fraction of the canvas.
//
// MEASURED AGAINST WHERE THE EYE IS, not chosen for the proportion. It was a
// third, which is the proportion the manga panel has and which is also very
// nearly invisible: a cap around a dome's apex is turned away from anybody
// standing next to it, so at that value the grass compressed into a sliver at
// the silhouette and the mound read as bare rock from every spot you can
// actually stand on.
//
// Half was still too high, for the same reason taken further: measured from
// 7.5 units away, the mound's own skyline IS its near face at about 50 degrees
// off the apex — everything above that has curved over the crest and out of
// sight — so a grass line at 57 degrees sat two degrees under the silhouette
// and came out as a hairline.
//
// So it wants to reach as far DOWN the mound as it can — bigger is more grass,
// and more grass is what you can actually see — and what stops it is the MOUTH.
// The two are squeezed toward each other from opposite ends and the clearance
// between them is the whole of this number.
//
// It was 0.62 while the shell was 4.8, which put the grass line 71 degrees off
// the apex against an arch crown at 79. Shrinking the mound to 4.0 without
// shrinking the mouth — see CONFIG.cave.doorWidth, which the cast set rather
// than the rock — raised the crown to 69, so the old value would have had the
// arch biting a chunk out of the turf.
//
// 0.60 is the most that still fits: the grass line lands at 66 degrees and its
// deepest lump at 71, which laps the crown by about two degrees. That overlap
// is wanted, not tolerated — the punched arch simply takes the turf with it
// there, so the mouth reads as reaching up into the grass rather than stopping
// politely under it, which is what the reference frames show. The 4.8 mound
// overlapped by four and looked right.
//
// Re-derive it whenever the shell or the mouth is resized: the ceiling is
// (crown / span) - FRINGE_DIP[0] - FRINGE_DIP[1], plus whatever overlap is
// wanted. Going the wrong way is easy and quiet — 0.53 was tried first on the
// mistaken idea that a smaller number bought clearance, and it bought a green
// hairline on a bare grey hill.
//
// The canvas maps linearly over the shell's whole span, skirt included, so this
// is a fraction of that rather than of a right angle.
const TURF = 0.60;

// How far the fringe's lumps hang below the grass line, as a fraction of the
// canvas — so the turf reaches TURF + FRINGE_DIP at its deepest.
//
// Shallower than it was (0.030 to 0.105), and for the same reason TURF moved:
// the deepest bump is what actually has to clear the mouth, and at the old
// depth it reached eleven degrees down the mound — past the arch's crown even
// after the grass line itself had been lifted clear. Halving it buys back that
// room and reads truer besides: the scallops in the reference are shallow
// against the landform, and a deep one starts to look like a curtain rather
// than like turf breaking over an edge.
const FRINGE_DIP = [0.018, 0.032];

export function paintCaveSkin() {
  const W = 1024;
  const H = 320;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 23);

  g.fillStyle = PAL.cliffFace;
  g.fillRect(0, 0, W, H);

  // Darker at the foot, which is where a dome darkens: the crown faces the sky
  // and the skirt faces the ground. Stronger than the house's hand's-worth,
  // because this mass is half again as big and the outline round it is doing
  // proportionally less of the work.
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0.00, 'rgba(104,86,76,0)');
  shade.addColorStop(0.50, 'rgba(104,86,76,0.07)');
  shade.addColorStop(1.00, 'rgba(104,86,76,0.22)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);

  // The same polar construction as the room, but coarser because the mound is
  // read from several paces away. It is painted across the whole shell first;
  // the turf below then covers its crown, leaving a continuous irregular net
  // in the exposed stone rather than a rectangular grid beginning abruptly at
  // the grass line.
  domeStoneNet(g, W, H, {
    rand, ink: PAL.caveInk, mark: PAL.caveMark,
    width: 1.8, alpha: 0.90, rings: 8, edgeCount: 24,
    scratchScale: 0.42,
  });

  // THE TURF, and its fringe. This is a piece of the globe's meadow lifted over
  // the stone, not a separate grass illustration: the fill, bowed tick groups,
  // and tiny blossom specks all come from the same biome table and the same
  // painters used by paintGlobe().
  //
  // It has to close on itself — the canvas wraps the dome — so the last bump is
  // clamped to the right edge at exactly the height the first one starts at,
  // or the grass line shows a step running down the mound.
  const baseY = H * TURF;
  const bumps = [];
  let x = 0;
  while (x < W) {
    const nx = Math.min(W, x + W * (0.020 + rand() * 0.030));
    bumps.push([nx, (x + nx) / 2, baseY + H * (FRINGE_DIP[0] + rand() * FRINGE_DIP[1])]);
    x = nx;
  }
  const traceFringe = () => {
    for (const b of bumps) g.quadraticCurveTo(b[1], b[2], b[0], baseY);
  };
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, baseY);
  traceFringe();
  g.lineTo(W, 0);
  g.closePath();
  const meadow = CONFIG.biomes.find((b) => b.key === 'meadow');
  g.fillStyle = meadow?.ground || PAL.cliffGrass;
  g.fill();

  // The globe's painted texture, distributed by cap AREA rather than canvas
  // row. That keeps marks from bunching at the summit once this sheet wraps a
  // dome. Drawing seam copies makes the first and last texture columns meet
  // without a clipped tick or flower.
  if (meadow) {
    const capTheta = (baseY / H) * (Math.PI / 2);
    const cosEdge = Math.cos(capTheta);
    const scatterCap = (count, draw) => {
      for (let i = 0; i < count; i++) {
        const th = Math.acos(1 - rand() * (1 - cosEdge));
        const by = (th / (Math.PI / 2)) * H;
        const bx = rand() * W;
        const xs = Math.min(5, 1 / Math.max(0.08, Math.sin(th)));
        for (const wrap of [-W, 0, W]) draw(bx + wrap, by, xs);
      }
    };
    g.save();
    g.clip();
    scatterCap(240, (bx, by, xs) => {
      fieldTick(g, rand, bx, by, 0.72, xs, meadow.tick);
    });
    scatterCap(64, (bx, by, xs) => {
      fieldBloom(
        g, rand, bx, by, meadow.bloomScale * 0.72, xs,
        meadow.bloom[Math.floor(rand() * meadow.bloom.length)],
      );
    });
    g.restore();
  }

  // The deeper green underside remains an overhang cue, not an outline around
  // every blade. The individual field marks stay uninked, exactly as they do
  // on the globe.
  g.beginPath();
  g.moveTo(0, baseY);
  traceFringe();
  g.strokeStyle = PAL.cliffGrassEdge;
  g.lineWidth = 3.2;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();

  return c;
}

// ...and from the rug. Paler, because you are two paces from it with the
// daylight coming in over your shoulder through a mouth as wide as the room —
// the same reasoning that makes roomWall paler than houseWall.
//
// FINER PLATES than the outside, and this is the one number in the pair worth
// arguing about. The two surfaces are the same wall, so the honest answer is
// the same cell size on both; what makes them differ is that you stand a good
// deal closer to this one. At the outside's 9 columns the cells come out over
// two units across from a viewpoint that is never more than three units from
// the stone, which fills the whole view with two plates and a crack. 14 puts
// four or five in the frame, which is what the reference interior has.
export function paintCaveWall() {
  const { w: W, h: H } = ROOM_WALL_TEX;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 24);
  const scale = ROOM_WALL_TEX.w / 2048;

  g.fillStyle = PAL.caveRoomWall;
  g.fillRect(0, 0, W, H);

  // Darker toward the crown rather than toward the floor, which is the
  // opposite of every other shell in the app and is right for exactly one
  // reason: this room's only light comes in through a mouth at floor level, so
  // the ceiling is the part of it furthest from the daylight. It is also what
  // the reference frame shows — the roof of the hollow is where the grey
  // gathers.
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0.00, 'rgba(96,84,78,0.22)');
  shade.addColorStop(0.45, 'rgba(96,84,78,0.07)');
  shade.addColorStop(1.00, 'rgba(96,84,78,0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);

  // The whole shell, including the apex and its neighbouring plates, comes
  // from a polar net. This is what prevents both failure modes of a UV-space
  // drawing: the radial flower of stretched cells and the circular cap used to
  // hide it.
  domeStoneNet(g, W, H, {
    rand, ink: PAL.caveInk, mark: PAL.caveMark,
    width: 2.6, alpha: 0.86,
    rings: 6, edgeCount: 24,
    markSkip: 0.48, scratchScale: 0.86,
  });

  // The seam where the wall meets the floor, in the rock's own pen and drawn
  // unbroken. The house lifts its pen five times along this line, and that
  // gap-dot-gap hand is exactly what should NOT happen here: it is a plastered
  // wall meeting a boarded floor, a joint somebody made. A hollow has no joint.
  // What it has is the last crack before the ground, so this is one more edge
  // of the net rather than a different kind of line.
  g.strokeStyle = PAL.caveInk;
  g.lineWidth = 6 * scale;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const seamY = H - 5 * scale;
  g.beginPath();
  g.moveTo(0, seamY);
  for (let x = 0; x <= W; x += W / 40) g.lineTo(x, seamY + (rand() - 0.5) * 7);
  g.stroke();
  return c;
}

// The floor of the hollow. The anime treats it as an almost blank pale plane:
// tiny paired pen ticks make the surface readable, while only a few short,
// gently uneven cracks interrupt it. It deliberately does not repeat the
// wall's polygon net or carry long grain lines across the room.
export function paintCaveFloor() {
  const S = 1024;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 25);

  g.fillStyle = PAL.caveRoomFloor;
  g.fillRect(0, 0, S, S);

  const R = S / 2;
  // Short, mostly horizontal cracks. Each is drawn as several gently wandering
  // segments so it has the anime's lifted-pen wobble without becoming a long
  // geological seam.
  g.strokeStyle = PAL.caveInk;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.globalAlpha = 0.68;
  for (let i = 0; i < 12; i++) {
    let x;
    let y;
    do {
      x = R * 0.14 + rand() * R * 1.72;
      y = R * 0.14 + rand() * R * 1.72;
    } while (Math.hypot(x - R, y - R) > R * 0.84);
    const len = 32 + rand() * 38;
    const angle = (rand() - 0.5) * 0.24;
    g.lineWidth = 2.0 + rand() * 1.1;
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.beginPath();
    g.moveTo(-len / 2, (rand() - 0.5) * 2);
    for (let step = 1; step <= 4; step++) {
      const px = -len / 2 + len * (step / 4);
      const py = (rand() - 0.5) * 4;
      g.lineTo(px, py);
    }
    g.stroke();
    g.restore();
  }
  g.globalAlpha = 1;

  // Fine one-to-three stroke clusters, mostly horizontal with the occasional
  // upright pair found in the reference. They are intentionally much smaller
  // than the wall scratches: the floor texture is halved before it reaches the
  // room mesh, and these still need to land as hairline details after that.
  const GRID = 13;
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (rand() < 0.50) continue;
      const x = (col + 0.15 + rand() * 0.7) * (S / GRID);
      const y = (row + 0.15 + rand() * 0.7) * (S / GRID);
      if (Math.hypot(x - R, y - R) > R * 0.90) continue;
      g.save();
      g.translate(x, y);
      g.rotate(rand() < 0.14 ? Math.PI / 2 : (rand() - 0.5) * 0.12);
      markCluster(g, rand, 0, 0, PAL.caveMark, 0.52, 1);
      g.restore();
    }
  }
  return c;
}

// THE MOUTH SHEET, and the proportion that makes a cave a cave.
//
// Every opening in this app takes its width from config and its HEIGHT from its
// sheet's own aspect — that rule is what stopped the house's door being two
// free numbers that drifted into a flattened arch. So the only way to say "a
// mouth four units across is not four units tall" is to say it here, in the
// shape of the canvas: 1.55 times as wide as the door sheet at the same height.
// Everything downstream follows without knowing anything has changed.
export const MOUTH_SHEET = {
  w: Math.round(DOOR_SHEET.w * 1.55), h: DOOR_SHEET.h, arch: DOOR_SHEET.arch,
};

// The mouth's own ink, and the one drawn thing on the whole building.
//
// It is cut with the same archPath the house's door is — one description of the
// shape, so the hole and the line round it cannot disagree — carrying two
// differences that are the difference between a doorway and a hollow.
//
// The LINE IS DRAWN IN A ROUGHER HAND: a door frame is a made thing with two
// uprights and a head, and this is where the rock happens to stop. The stroke
// is walked along the arch as a polyline with the pen wandering off the true
// path, which is the only way to get a line that reads as hand-drawn at this
// weight.
//
// And it grows STALACTITES. Two of them, hanging inside the crown, which is
// the detail the reference frame is unmistakable for — a cave with a smooth
// mouth is a tunnel. They are painted on the outer face rather than modelled or
// put on the interior wall, because that is where they read: against the dark
// of the room, seen from the grass, exactly as the source frame stages them.
export function paintCaveMouth() {
  const { w: W, h: H } = MOUTH_SHEET;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 26);
  const lw = W * 0.030;
  const r = W * DOOR_SHEET.arch;
  const top = Math.ceil(lw / 2) + 1;
  const bottom = H - 6;
  const cy = top + r;

  // Straight sides and a half circle, walked as one list of points so the pen
  // can wander along it.
  const pts = [];
  const LEG = 9;
  const ARC = 26;
  for (let i = 0; i <= LEG; i++) pts.push([W / 2 - r, bottom - (bottom - cy) * (i / LEG)]);
  for (let i = 1; i <= ARC; i++) {
    const a = Math.PI - Math.PI * (i / ARC);
    pts.push([W / 2 + Math.cos(a) * r, cy - Math.sin(a) * r]);
  }
  for (let i = 1; i <= LEG; i++) pts.push([W / 2 + r, cy + (bottom - cy) * (i / LEG)]);

  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = PAL.caveInk;
  g.lineWidth = lw;
  g.beginPath();
  pts.forEach((p, i) => {
    const x = p[0] + (rand() - 0.5) * lw * 0.55;
    const y = p[1] + (rand() - 0.5) * lw * 0.40;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  });
  g.stroke();

  // The stalactites, hung from the inside of the crown. Two, of different
  // lengths and neither on the middle — a matched pair either side of centre
  // would read as teeth. Filled in the interior's own pale stone so they are
  // lit like the wall they are hanging off rather than reading as silhouette.
  const tooth = (cx, len, wide) => {
    g.beginPath();
    g.moveTo(cx - wide, cy - r + lw * 0.4);
    g.quadraticCurveTo(cx - wide * 0.35, cy - r + len * 0.7, cx, cy - r + len);
    g.quadraticCurveTo(cx + wide * 0.35, cy - r + len * 0.7, cx + wide, cy - r + lw * 0.4);
    g.closePath();
    g.fillStyle = PAL.caveRoomWall;
    g.fill();
    g.lineWidth = lw * 0.62;
    g.stroke();
  };
  tooth(W * 0.425, H * 0.150, W * 0.019);
  tooth(W * 0.548, H * 0.098, W * 0.016);
  return c;
}

// The same opening seen from the rug — the line only, no stalactites, since
// from in here they are behind you. Its own painter rather than a flag on the
// one above, because the two faces of an opening are drawn at different
// weights everywhere else in this file and there is no reason for this to be
// the exception.
export function paintCaveMouthInner() {
  const { w: W, h: H } = MOUTH_SHEET;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = W * 0.020;
  g.strokeStyle = PAL.caveInk;
  archPath(g, W, Math.ceil(W * 0.010) + 1, H - 6, W * DOOR_SHEET.arch);
  g.stroke();
  return c;
}

// paintCliffFace and paintCliffTop stood here — the face and the grass top of a
// separate plateau the cave was going to be cut into. Both are gone with the
// plateau itself; see the long note on CONFIG.cave for why a hill that stands
// behind a cave cannot be seen from in front of it on a globe this small, and
// what replaced it. The crack net and the grass fringe they were built from
// both survive: the net is used by all three of the mound's surfaces, and the
// fringe moved into paintCaveSkin, where it is now the mound's own turf line.

// ------------------------------------------------------- the retired cards
//
// The cave's day and night sheets. Both are RETIRED the moment they are built
// — the building is geometry, and neither is ever shown — and they exist for
// the same reason the house's two do: the sprite, sort, cull and lamp
// machinery all address a prop through its card, and teaching four systems that
// some props have none is a great deal more surgery than painting two canvases
// nobody looks at.
//
// The night one is not blank, and must not be: litSpot reads it to find where a
// building's warm openings are, and a sheet with no warm pixel on it has no
// answer to give. What it finds here is the mouth, which is where the glow
// belongs — though scene.js then re-hangs the bloom off the built opening
// anyway, exactly as it does for the house.
function caveCard(night) {
  const W = 420;
  const H = 230;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const r = W * 0.47;
  const cx = W / 2;
  const cy = H - 6;
  g.fillStyle = PAL.cliffFace;
  g.beginPath();
  g.arc(cx, cy, r, Math.PI, 0);
  g.closePath();
  g.fill();
  g.strokeStyle = PAL.caveInk;
  g.lineWidth = W * 0.018;
  g.stroke();
  // The mouth is a third of the mound's width and sits at its foot, which is
  // where litSpot has to find the warm pixels on the night sheet.
  const mw = r * 0.90;
  g.save();
  g.translate(cx - mw / 2, cy - r * 0.62);
  g.beginPath();
  archPath(g, mw, 0, r * 0.62, mw * DOOR_SHEET.arch);
  g.closePath();
  g.fillStyle = night ? '#FFD98C' : '#5D5049';
  g.fill();
  g.restore();
  return c;
}

export function paintCaveDay() { return caveCard(false); }
export function paintCaveNight() { return caveCard(true); }
