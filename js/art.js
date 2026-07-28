// Every visual in the app comes from here. This is the ONLY file that knows
// what anything looks like — everything else deals in canvases and textures.
//
// Two kinds of thing live here now. The characters, the ground, the scenery
// and the house are drawn art: assets.js loads the files and the paint* function
// only frames them. Everything still waiting to be drawn — the bench,
// the sky, and the stamps light and shadow are made from — is painted in code as
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
// is the highest — see the note in scene.js about where the band is hung, and
// why everything below about 0.69 is buried behind the planet's own limb.
// `treeBase` is deliberately ABOVE the limb at 0.69, and that is the one number
// here that has to be got right rather than chosen. The woods' fill runs from
// there to the bottom of the sheet, so it is what the planet's own edge cuts
// through — and if it starts any lower, the strip between the crowns and the
// limb shows whatever is behind them. It did: a pale band of haze under the
// trees, reading as a river nobody had drawn.
const SKYLINE = {
  farPeak: 0.20,
  farBase: 0.62,
  nearPeak: 0.33,
  nearBase: 0.66,
  treeTop: 0.50,
  treeBase: 0.64,
  hazeTo: 0.62,
};

// A smooth silhouette through a list of points, rounded rather than folded.
//
// Quadratic segments THROUGH THE MIDPOINTS, with each given point as the control
// — the standard trick, and the right one here: it makes every corner a curve
// without needing tangents worked out, so a ridge of peaks and saddles comes out
// as rolling hills rather than as a saw. The anime's mountains have no straight
// edges anywhere on them.
function ridge(g, pts) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}

// One range of hills, filled down to the bottom of the band so whatever is drawn
// in front of it has something to sit against.
//
// The peaks are generated for ONE lap and then drawn three times, a lap apart, as
// a single unbroken polyline. That is what makes the seam invisible: the list is
// periodic by construction, so the curve arriving at the right edge is the same
// curve leaving the left, with the same control points and the same slope.
function range(g, W, H, rand, { peak, base, count, jitter, saddle, fill }) {
  const step = W / count;
  const lap = [];
  for (let i = 0; i < count; i++) {
    // A saddle, then a peak. Heights wander and so does the peak's placing
    // inside its own slot, so no two hills are the same hill and none of them
    // sits on a grid.
    const sx = i * step;
    const px = sx + step * (0.30 + rand() * 0.40);
    const ph = peak + (base - peak) * rand() * jitter;
    const sh = base - (base - ph) * (saddle * (0.7 + rand() * 0.6));
    lap.push([sx, sh * H], [px, ph * H]);
  }
  g.beginPath();
  const pts = [];
  for (const off of [-W, 0, W]) for (const [x, y] of lap) pts.push([x + off, y]);
  pts.push([W * 2, lap[0][1]]);
  ridge(g, pts);
  g.lineTo(W * 2, H);
  g.lineTo(-W, H);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

// The woods along the skyline: overlapping blobs on a baseline, outlined the way
// every soft thing in this world is outlined — by UNDERPAINTING. The whole run
// is filled once in ink a hair oversize and once in green on top, so what shows
// is a line round the union rather than a line round each blob. Stroking would
// draw the buried halves too and the treeline would come out as a heap of
// circles, which is the same lesson the blossoms taught.
function treeline(g, W, H, rand, { top, base, count, ink, fill }) {
  const step = W / count;
  const lap = [];
  for (let i = 0; i < count; i++) {
    const x = i * step + step * (rand() - 0.5) * 0.7;
    const r = step * (0.55 + rand() * 0.75);
    // Crowns nod up and down along the row; a treeline of one height is a hedge.
    const y = base * H - (base - top) * H * (0.35 + rand() * 0.65);
    lap.push([x, y, r]);
  }
  const paint = (grow, style) => {
    g.beginPath();
    for (const off of [-W, 0, W]) {
      for (const [x, y, r] of lap) {
        g.moveTo(x + off + r + grow, y);
        g.arc(x + off, y, r + grow, 0, TAU);
      }
    }
    // The ground the crowns stand on, so the row has no daylight under it.
    g.rect(-W, base * H, W * 3, H);
    g.fillStyle = style;
    g.fill();
  };
  paint(H * 0.012, ink);
  paint(0, fill);
}

// The whole band, back to front.
export function paintHorizon() {
  const W = 4096;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(HORIZON_SEED);

  // Roughly three ranges across the 31 degrees a portrait phone shows at once,
  // which is what the reference frames put there. Counted round the whole lap:
  // 31 degrees is a twelfth of it, so three on screen is thirty-odd in total.
  range(g, W, H, rand, {
    peak: SKYLINE.farPeak, base: SKYLINE.farBase,
    count: 26, jitter: 0.55, saddle: 0.45, fill: PAL.horizonFar,
  });
  range(g, W, H, rand, {
    peak: SKYLINE.nearPeak, base: SKYLINE.nearBase,
    count: 34, jitter: 0.50, saddle: 0.40, fill: PAL.horizonNear,
  });

  // The field, laid in before the woods so their feet are planted in it.
  g.fillStyle = PAL.horizonField;
  g.fillRect(0, SKYLINE.farBase * H, W, H - SKYLINE.farBase * H);

  // Haze along the foot of the hills. Distance is haze, and without it the
  // ranges sit on the treeline like cut paper. Stopped above the woods rather
  // than run down behind them — see SKYLINE.treeBase.
  const haze = g.createLinearGradient(0, SKYLINE.nearPeak * H, 0, SKYLINE.hazeTo * H);
  haze.addColorStop(0.00, 'rgba(255,255,255,0)');
  haze.addColorStop(0.70, `${PAL.horizonHaze}7A`);
  haze.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = haze;
  g.fillRect(0, SKYLINE.nearPeak * H, W, (SKYLINE.hazeTo - SKYLINE.nearPeak) * H);

  // Twice as many crowns as the first pass had, which is the difference between
  // woods across a valley and a hedge at the end of the garden. A portrait phone
  // shows a twelfth of the lap, so this puts eighteen or so on screen — about
  // what the reference frames carry.
  treeline(g, W, H, rand, {
    top: SKYLINE.treeTop, base: SKYLINE.treeBase,
    count: 216, ink: PAL.horizonTreeInk, fill: PAL.horizonTree,
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

// ------------------------------------------------------------------- tracks

// How far apart the stamps are laid along a worn track, in world units.
//
// A track is STAMPED along its arc rather than stroked as a polyline, and that
// is not a stylistic choice: this texture squeezes horizontally toward the poles
// and a stroke has one width in texels the whole way, so a path climbing to the
// two big trees at 46 degrees would arrive about 1.44 times too narrow. A stamp
// can be widened per step by the same 1/cos(lat) everything else here uses.
//
// Close enough together that some eight stamps cover any point on the line,
// which is what makes the edge continuous rather than scalloped.
const PATH_STEP = 0.2;

// Two passes, wide-and-faint under narrow-and-firm. `w` is the full width of the
// stamp in world units.
//
// One pass cannot do it. Eight overlapping stamps compound whatever falloff a
// single one carries, so a single layer saturates almost immediately — it went
// from bare grass to full track inside about a texel, which is a road with a cut
// edge rather than a path worn into a field. Two passes saturating at different
// widths leave a shoulder between them, and a shoulder is what reads as wear.
const PATH_LAYERS = [
  { w: 3.2, alpha: 0.34 },
  { w: 1.9, alpha: 0.80 },
];

// One soft stamp, built once and scaled per step. Sizing it here rather than
// making a gradient per stamp matters: a track is a couple of hundred steps long
// and there are five of them, two layers deep, drawn three times for the seam.
let PATH_STAMP = null;
function pathStamp() {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0.00, 'rgba(255,255,255,1)');
  grd.addColorStop(0.52, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  // Tinted through once, so the stamp arrives the track's own colour and every
  // step is a plain drawImage.
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = PAL.path;
  g.fillRect(0, 0, S, S);
  return c;
}

// The tracks worn between the landmarks, laid along GREAT CIRCLES — the same
// line the walking stick actually takes, so following a track really is walking
// straight rather than approximately straight.
//
// `CONFIG.paths` is pairs of indices into `CONFIG.landmarks`: a minimum spanning
// tree over them plus the one edge that closes it into a loop, so every landmark
// is reachable by following a line on the ground and no track is a long way
// round something.
function paintPaths(g, W, H, widen, wrap) {
  const R = CONFIG.globe.radius;
  const marks = CONFIG.landmarks;
  if (!PATH_STAMP) PATH_STAMP = pathStamp();
  const dirOf = (lat, lon) => {
    const cl = Math.cos(lat);
    return [cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon)];
  };

  for (const layer of PATH_LAYERS) {
    // Half the stamp's width as an angle, and as texels down the sheet. Across
    // it, the pole stretch goes on top — exactly as it does for a lake.
    const ry = ((layer.w / 2 / R) / Math.PI) * H;
    g.globalAlpha = layer.alpha;
    for (const [ai, bi] of CONFIG.paths) {
      const a = dirOf(marks[ai].lat, marks[ai].lon);
      const b = dirOf(marks[bi].lat, marks[bi].lon);
      const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const arc = Math.acos(dot);
      const sin = Math.sin(arc);
      const steps = Math.max(1, Math.round((arc * R) / PATH_STEP));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Slerped rather than lerped-and-normalised, which is the difference
        // between even spacing along the arc and stamps bunching at the ends.
        const k0 = sin < 1e-6 ? 1 - t : Math.sin((1 - t) * arc) / sin;
        const k1 = sin < 1e-6 ? t : Math.sin(t * arc) / sin;
        const dx = a[0] * k0 + b[0] * k1;
        const dy = a[1] * k0 + b[1] * k1;
        const dz = a[2] * k0 + b[2] * k1;
        const lat = Math.asin(Math.max(-1, Math.min(1, dy)));
        const lon = Math.atan2(dx, dz);
        // The same texture frame the lakes and the sun are read in: u = 0 sits a
        // quarter turn west of lon 0.
        const x = ((((0.25 + lon / (Math.PI * 2)) % 1) + 1) % 1) * W;
        const y = (0.5 - lat / Math.PI) * H;
        const rx = ry * widen(y);
        wrap(x, rx, (px) => {
          g.drawImage(PATH_STAMP, px - rx, y - ry, rx * 2, ry * 2);
        });
      }
    }
  }
  g.globalAlpha = 1;
}

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
  const CELL = 16;
  const mix = [];
  const base = new THREE.Color();
  const other = new THREE.Color();
  const meadow = new THREE.Color(PAL.ground);
  for (let y = 0; y < H; y += CELL) {
    for (let x = 0; x < W; x += CELL) {
      base.copy(meadow);
      biomesAt(dirAt(x + CELL / 2, y + CELL / 2), CONFIG.biomes, mix);
      for (const { biome, w } of mix) base.lerp(other.set(biome.ground), w);
      g.fillStyle = `#${base.getHexString()}`;
      // A pixel of overlap, so neighbouring cells cannot leave a seam grid.
      g.fillRect(x, y, CELL + 1, CELL + 1);
    }
  }

  // The marks. Density follows the biome's own `cover`, which is what makes a
  // dry field read as dry: the same ticks, fewer of them, on blonder ground.
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
  const scatter = (count, draw) => {
    for (let i = 0; i < count; i++) {
      const lat = Math.asin(1 - 2 * rand());
      const y = (0.5 - lat / Math.PI) * H;
      const x = rand() * W;
      biomesAt(dirAt(x, y), CONFIG.biomes, mix);
      let cover = 1;
      for (const { biome, w } of mix) cover += (biome.cover - 1) * w;
      if (rand() > cover) continue;
      // THE POLE CORRECTION, applied as the mark is drawn rather than hunted
      // down afterwards. A sphere squeezes a texture horizontally by cos(lat),
      // so a mark widened about its own centre by the reciprocal comes out
      // square on the planet. Clamped high rather than tight — a tick near the
      // pole genuinely is ten texels wide for one tall, and that is what makes
      // it a tick rather than a hair when it gets to the sphere.
      const xs = Math.min(10, 1 / Math.max(0.02, Math.cos(lat)));
      for (const wrap of [-W, 0, W]) draw(x + wrap, y, xs);
    }
  };
  scatter(TICKS, (x, y, xs) => fieldTick(g, rand, x, y, 1, xs, PAL.groundTick));
  scatter(BLOOMS, (x, y, xs) => fieldBloom(
    g, rand, x, y, 1, xs,
    PAL.groundBloom[Math.floor(rand() * PAL.groundBloom.length)],
  ));

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
  // Before the lakes, so water has the last word if a track ever comes near
  // one. It does not today — the closest leg passes clear, and CONFIG.paths
  // says so — but a path that appeared to run into a pond you cannot walk into
  // would be worse than no path, so the ordering is the cheapest possible
  // insurance against somebody moving a landmark.
  paintPaths(g, W, H, widen, wrap);

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
// the surface by water.js — see driftGlints.
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
// so the card keeps that rule: strokes of the meadow's own two greens, fanned
// from the grip, roots showing. The roots are the point; attached grass is
// scenery, pulled grass is 草むしり.
let KUSA_CARD = null;

export function paintKusa() {
  if (KUSA_CARD) return KUSA_CARD;
  const W = 120;
  const H = 168;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.lineCap = 'round';
  const gx = W * 0.5;
  const gy = H * 0.78;
  // Blades, fanned. Two greens alternating, the tips bowing outward.
  const blades = [
    [-0.55, 0.94], [-0.30, 1.06], [-0.08, 1.12], [0.14, 1.04], [0.38, 0.92], [0.55, 0.8],
  ];
  for (const [i, [lean, len]] of blades.entries()) {
    g.strokeStyle = i % 2 ? PAL.grassBladeHigh : PAL.grassBladeLow;
    g.lineWidth = W * 0.075;
    g.beginPath();
    g.moveTo(gx, gy);
    g.quadraticCurveTo(
      gx + lean * W * 0.30, gy - len * H * 0.42,
      gx + lean * W * 0.52, gy - len * H * 0.62,
    );
    g.stroke();
  }
  // The roots below the grip: short pale threads, a smudge of soil.
  g.strokeStyle = '#D8C49A';
  g.lineWidth = W * 0.035;
  for (const lean of [-0.3, 0, 0.35]) {
    g.beginPath();
    g.moveTo(gx, gy);
    g.quadraticCurveTo(gx + lean * W * 0.12, gy + H * 0.07, gx + lean * W * 0.22, gy + H * 0.13);
    g.stroke();
  }
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
// The pool a small light standing ON THE FLOOR throws, as opposed to the one a
// window throws down a wall. `paintLampGlow`'s hole is drawn SOLID — see the
// note in it — because the thing filling that hole is a building, which covers
// it. Here the thing filling it is the lamp's own foot, which is four
// centimetres of brass, and a solid core does two bad things at once: it lights
// the base from inside, and it blows the boards right under the lamp out to a
// flat yellow disc.
//
// So this one is EMPTY at the middle, brightest just outside the foot, and away
// from there it is the same falloff. Which is also what a real one looks like:
// a lamp on a floor shadows the floor it is standing on.
export function paintItemGlow(foot = 0.14) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // Nothing under the foot, up to full just clear of it, then the same shape
  // paintLampGlow falls off with so the two lights in this world agree.
  const stops = [
    [0, 0], [foot * 0.75, 0], [foot, 0.55], [foot + 0.10, 1],
    [0.42, 0.34], [0.70, 0.09], [1, 0],
  ];
  for (const [at, a] of stops) {
    grad.addColorStop(Math.min(1, at), `rgba(255,255,255,${a})`);
  }
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, TAU);
  g.fill();
  return c;
}

export function paintLampGlow(hole = 0) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // Canvas fills everything inside the first stop with the first stop's colour,
  // so a hole needs no stop of its own: the inner disc comes out solid, which
  // is what light pooling right up against the foot of a wall looks like.
  const stops = [[0.00, 1], [0.16, 0.74], [0.40, 0.30], [0.68, 0.08], [1.00, 0]];
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

export function paintBench() {
  const W = 192;
  const H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineWidth = 5;
  g.strokeStyle = PAL.line;
  g.fillStyle = PAL.treeTrunk;

  for (const y of [50, 68]) {
    g.beginPath();
    g.rect(24, y, 144, 13);
    g.fill();
    g.stroke();
  }
  g.beginPath();
  g.rect(30, 86, 14, 34);
  g.fill();
  g.stroke();
  g.beginPath();
  g.rect(148, 86, 14, 34);
  g.fill();
  g.stroke();
  g.beginPath();
  g.rect(24, 26, 144, 12);
  g.fill();
  g.stroke();
  return c;
}

// `paintZzz` stood here — the floating Z over a sleeping character. Nobody
// sleeps any more: the cast stays up through the night now, wandering and
// looking at the stars, so there was never a moment it could be drawn. See the
// note in character.js.

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
const ROOM_MARK_WALL = [168, 160, 162];
const ROOM_MARK_FLOOR = [147, 140, 143];

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
// MARK_SCALE follows it, because the marks are sized in TEXELS. Without it,
// sharpening the wall would have quietly shrunk every mark on it.
export const ROOM_WALL_TEX = { w: 3072, h: 768 };
const MARK_SCALE = ROOM_WALL_TEX.w / 2048;

// Marks stop where the ring they sit on has shrunk to this fraction of the
// dome's full circumference. 0.42 puts the boundary 27 degrees off the apex,
// which leaves the top 28% of the texture — the ceiling proper — plain.
const MARK_HORIZON = 0.42;

// ...and how far the squeeze correction is allowed to go before it is simply
// refused. 1/sin runs away toward the apex, and a mark stretched much past this
// stops reading as a pen stroke and starts reading as a scratch on the lens.
const MAX_STRETCH = 2.4;

export function paintRoomWall() {
  const { w: W, h: H } = ROOM_WALL_TEX;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED);

  g.fillStyle = PAL.roomWall;
  g.fillRect(0, 0, W, H);

  // Canvas top is the apex and canvas bottom is the floor, because three.js
  // hands a sphere's v as 1 at theta 0 and flips the image on the way in. So
  // `y` here climbs DOWN the dome, and theta with it.
  const theta = (y) => (y / H) * (Math.PI / 2);

  // A jittered grid rather than a free scatter: it spreads the marks without
  // ever letting two land on top of each other, which is what gives a hand
  // scatter away.
  //
  // 26 columns is one cluster every 1.26 units around the base, which sounds
  // dense and is not: a portrait phone sees 31 degrees of the wall at a time,
  // which is a twelfth of it, so this is what puts about nine marks on screen —
  // the count the reference drawing has.
  const COLS = 26;
  const ROWS = 4;
  const yTop = H * (Math.asin(MARK_HORIZON) / (Math.PI / 2));
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (rand() < 0.15) continue;
      const x = (col + 0.15 + rand() * 0.7) * (W / COLS);
      const y = yTop + (row + 0.2 + rand() * 0.6) * ((H - 38 * MARK_SCALE - yTop) / ROWS);
      const xs = Math.min(MAX_STRETCH, 1 / Math.sin(theta(y)));
      markCluster(g, rand, x, y, ROOM_MARK_WALL, MARK_SCALE, xs);
    }
  }

  // The seam, along the very bottom edge — which is the rim of the dome, and so
  // exactly where the floor comes up to meet it.
  const seamY = H - 6 * MARK_SCALE;
  const gaps = [];
  for (let i = 0; i < SEAM_GAPS; i++) {
    gaps.push({
      at: ((i + 0.35 + rand() * 0.3) / SEAM_GAPS) * W,
      half: (9 + rand() * 7) * MARK_SCALE,
    });
  }
  g.strokeStyle = PAL.line;
  g.lineWidth = 7 * MARK_SCALE;
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
        gap.at + side * (3 + rand() * 3) * MARK_SCALE,
        seamY + (rand() - 0.3) * 4 * MARK_SCALE,
        3.4 * MARK_SCALE, 0, TAU,
      );
      g.fill();
    }
  }
  return c;
}

// The floor is a smaller world per texel than the wall is — 1024 across ten and
// a half units against 2048 around thirty-three — so its marks are drawn 1.57
// times larger in texels to come out the same size underfoot.
const FLOOR_MARK_SCALE = 1.57;

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
  const GRID = 9;
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (rand() < 0.25) continue;
      const x = (col + 0.15 + rand() * 0.7) * (S / GRID);
      const y = (row + 0.15 + rand() * 0.7) * (S / GRID);
      if (Math.hypot(x - R, y - R) > R * 0.94) continue;
      markCluster(g, rand, x, y, ROOM_MARK_FLOOR, FLOOR_MARK_SCALE, 1);
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
  const COLS = 14;
  const ROWS = 3;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (rand() < 0.42) continue;
      const x = (col + 0.15 + rand() * 0.7) * (W / COLS);
      const y = yTop + (row + 0.2 + rand() * 0.6) * ((H - 18 - yTop) / ROWS);
      markCluster(g, rand, x, y, PAL.houseMark, 0.62, 1 / Math.sin(theta(y)));
    }
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

// Somewhere to sit that is not the floor. Squat and round, because everything
// living here is, and because a cushion is the one piece of furniture whose
// whole job is to look soft.
export function paintCushion() {
  const W = 260;
  const H = 190;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = makeRandom(ROOM_SEED + 4);

  inked(g, W, 1.1);
  g.fillStyle = PAL.furnitureCushion;
  wobbleOval(g, W / 2, H * 0.56, W * 0.44, H * 0.33, rand, 0.06);
  g.fill();
  g.stroke();

  // The dent somebody left in it, and the seam round the edge. Both are what
  // separate a cushion from a stone.
  g.lineWidth = W * 0.014;
  g.beginPath();
  g.moveTo(W * 0.30, H * 0.46);
  g.quadraticCurveTo(W / 2, H * 0.58, W * 0.70, H * 0.46);
  g.stroke();
  g.globalAlpha = 0.5;
  g.beginPath();
  g.moveTo(W * 0.20, H * 0.68);
  g.quadraticCurveTo(W / 2, H * 0.80, W * 0.80, H * 0.68);
  g.stroke();
  g.globalAlpha = 1;
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
      ROOM_MARK_FLOOR, 1.1, 1,
    );
  }
  return c;
}
