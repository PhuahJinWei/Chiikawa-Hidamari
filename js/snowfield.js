// HOW MUCH SNOW IS WHERE, as a picture of the planet.
//
// `snowCover` in weather.js answers that question with ONE NUMBER for the whole
// world, and up to now that was the whole story: the ground mixed toward white
// by it, evenly, everywhere. This file is the second half — a greyscale map in
// the planet's own frame saying how deep it is at each point, which the ground
// shader multiplies the global number by.
//
//   white   full depth, whatever the sky has managed to lay
//   black   bare ground, however hard it is snowing
//
// Two things fall out of having it, and the second is the reason it exists:
//
//   FOOTPRINTS. Walk across it and the trail is dark, because a trodden print
//   is a place with less snow in it than the field around it. Nothing else has
//   to be drawn — no decal, no second surface, no sorting — the ground is
//   already mixing toward white by a number, and this makes the number local.
//
//   A PATCHY MELT, for free. As the cover drains, everywhere the mask is low
//   goes bare first: the paths people walked, the ground under the trees. Snow
//   does not fade out evenly and never has; it retreats from the thin places.
//   That behaviour is not written anywhere below. It is what a multiply does.
//
// ---------------------------------------------------------------- the seam
//
// The map is EQUIRECTANGULAR in exactly the frame `paintGlobe` paints in, which
// is the same frame `dirFromLatLon` builds and the lakes are placed in. That is
// not a coincidence to be grateful for, it is the one thing here that must not
// drift: get the convention wrong by a quarter turn and every footprint lands
// somewhere nobody walked, which is precisely the bug that once put the visible
// water a quarter turn from the water the rules enforced.
//
// So the forward map is copied from paintGlobe and this file only ever inverts
// it. If that one changes, this one changes with it.
//
// The other thing an equirectangular map does is SQUEEZE toward the poles: a
// step of longitude is a smaller step on the ground the further north you go.
// A stamp drawn round would come out an ellipse there, and stretching it by
// 1/cos(lat) is the correction — the same one the field's own tick marks take.

import * as THREE from 'three';
import { CONFIG } from './config.js';

// The map's own size, which is NOT the ground's.
//
// The planet's paint is 3072 across because it carries tick marks that have to
// keep their shape at reading distance. This carries soft blobs and nothing
// else, so it can be a third of that and still put twenty pixels in a world
// unit — four across a footprint, which is a footprint rather than a dot.
//
// It is also the size of every upload. The whole canvas goes to the GPU each
// time anything is stamped into it, so this is the number that decides what a
// walk in the snow costs: at 1024x512 that is two megabytes a push, against the
// eight the sky already moves on every change of hour.
const W = 1024;
const H = 512;

// How often the map may be pushed to the GPU, at most. Six a second is finer
// than anybody can see a footprint appear and an order of magnitude less
// traffic than pushing every frame — and on the overwhelming majority of frames
// nothing has been stamped at all, so nothing is pushed.
const PUSH_MS = 165;

// How far somebody walks between prints, in world units, and how wide one is.
//
// The stride is SHORTER than the print is wide, deliberately: what should read
// is a trail somebody made, not a line of dots. Overlapping is what turns a
// series of stamps into a furrow.
const STRIDE = 0.30;
const PRINT_R = 0.38;

// How deep a print goes. Not to nothing — a footprint in snow still has snow in
// it, and a trail stamped to zero reads as a path swept down to the grass.
const PRINT_DEPTH = 0.62;

// How much of the field a fresh fall lays, before anything is trodden into it.
//
// UNDER ONE, which is what leaves headroom for the drifts to be deeper than the
// field rather than merely the field being shallower than them. A flat 1.0
// everywhere would make every bank invisible, since there would be nowhere for
// one to go.
// Exported because the shell's HEIGHT is worked out from it — anything that
// has to sit on top of the snow rather than in it needs to know where the open
// field ends up, and that is this times the depth, less the tuck. See
// setWalkMarker in scene.js, the one thing on this planet that is not allowed
// to be buried.
export const BASE = 0.86;

// The smallest wash worth applying — see _fill, and the half-grey field that
// taught this file about eight-bit arithmetic.
//
// A fiftieth moves the darkest part of a footprint about four levels, which is
// comfortably clear of the rounding, and lands roughly twice a second at the
// rate snow fills in. Anything much smaller starts being thrown away again.
const FILL_STEP = 0.02;

const _d = new THREE.Vector3();

export class Snowfield {
  constructor(radius) {
    this.R = radius;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d', { willReadFrequently: false });

    // FULL WHITE TO START, which is the value that makes this file invisible.
    // Every reader multiplies the global cover by what it finds here, so a map
    // of ones behaves exactly as the world did before there was one — and a
    // world that has never seen snow never pays for any of it.
    this.g.fillStyle = '#ffffff';
    this.g.fillRect(0, 0, W, H);

    this.tex = new THREE.CanvasTexture(this.canvas);
    // NOT sRGB. Everything else built from a canvas here is a picture and takes
    // the colour pipeline; this is a MEASUREMENT that happens to be stored as
    // grey, and decoding it as colour would bend the depths it is carrying.
    this.tex.colorSpace = THREE.NoColorSpace;
    // It wraps in x and does not in y, because the planet does: walk west far
    // enough and you come back, walk north far enough and you stop.
    this.tex.wrapS = THREE.RepeatWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;

    // Where each walker was when they last left a print, keyed by whoever they
    // are. Held here rather than on the characters so that nothing outside this
    // file has to know a stride exists.
    this.was = new Map();
    this.dirty = false;
    this.pushAt = 0;
    // Fill-in owed but not yet worth spending — see _fill.
    this.owed = 0;
    this.clock = 0;
    // Whether a fall has been laid into the map yet. See `fresh`.
    this.laid = false;
  }

  get texture() { return this.tex; }

  // ------------------------------------------------------------- the mapping
  //
  // A direction on the planet, as a pixel. The inverse of paintGlobe's `dirAt`,
  // and the reason that function's two lines are quoted in this file's header.
  _at(dir, out) {
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const lon = Math.atan2(dir.x, dir.z);
    out.x = W * (lon / (Math.PI * 2) + 0.25);
    out.y = H * (0.5 - lat / Math.PI) - 0.5;
    // How much wider than tall a round mark has to be drawn here to come out
    // round on the ground — see the note on the squeeze. Clamped, because the
    // correction runs away at the poles and a stamp a hundred times wider than
    // it is tall would paint a band right round the world.
    out.stretch = Math.min(6, 1 / Math.max(0.16, Math.cos(lat)));
    return out;
  }

  // One soft blob, drawn as many times as the seam needs.
  //
  // `level` is what the middle of it is worth and the edge fades to nothing —
  // so a blob never has a rim, which matters more here than anywhere else in
  // the project: a hard edge on a depth map is a hard edge on the snow, and
  // snow has none.
  //
  // Drawn up to three times because x wraps. A blob near either edge has to
  // appear at the other one too, or a footprint walked across the seam is a
  // footprint cut in half — and the seam runs down the middle of a perfectly
  // ordinary meadow.
  _blob(px, py, rx, ry, level, add) {
    const g = this.g;
    g.globalCompositeOperation = add ? 'lighter' : 'source-over';
    for (const dx of [-W, 0, W]) {
      const x = px + dx;
      if (x + rx < 0 || x - rx > W) continue;
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      const a = Math.min(1, Math.abs(level));
      // Subtracting is drawing BLACK at an alpha, adding is drawing white with
      // `lighter`. Two ways round because a canvas has no negative ink, and the
      // one thing both have to share is the falloff.
      const c = add ? '255,255,255' : '0,0,0';
      grad.addColorStop(0.00, `rgba(${c},${a})`);
      grad.addColorStop(0.55, `rgba(${c},${a * 0.72})`);
      grad.addColorStop(1.00, `rgba(${c},0)`);
      g.save();
      g.translate(x, py);
      g.scale(rx, ry);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, 1, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    this.dirty = true;
  }

  // A world-unit radius, as the two pixel radii a blob wants at this latitude.
  _radii(units, at) {
    const ry = (units / this.R / Math.PI) * H;
    return { rx: ry * at.stretch, ry };
  }

  // ------------------------------------------------------------ a fresh fall
  //
  // WIPE AND RELAY, called once when a fall starts rather than continuously.
  //
  // What it lays is deliberately not flat. A field of even white is the thing
  // this whole file exists to get away from — it is what a single global number
  // already gave, and it reads as paint rather than as weather. So the base
  // goes down at BASE and then three kinds of unevenness go over it, each of
  // which is a real fact about where snow ends up:
  //
  //   THE WIND. Broad, soft, seeded patches deeper and shallower than the
  //   field. This is most of what stops it reading as a flat coat, and it is
  //   the one of the three that is not about any particular object.
  //
  //   SHELTER. Under a canopy there is less, because the tree caught it. This
  //   is the one people notice without being able to say why: a ring of thinner
  //   snow under every tree is what makes the trees look like they are standing
  //   IN it rather than on top of a white sheet.
  //
  //   BANKS. Against a wall there is more, because it piled up there. Drawn as
  //   a ring just outside each building rather than a disc over it — the middle
  //   of that disc is under a roof, and what is under the roof is a floor.
  //
  // `features` comes from the scene, which is the only thing that knows where
  // anything is. Each is a spot, a reach in world units, and what the snow does
  // there: negative thins, positive banks.
  fresh(features, rand) {
    const g = this.g;
    g.globalCompositeOperation = 'source-over';
    const v = Math.round(BASE * 255);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, 0, W, H);

    const at = { x: 0, y: 0, stretch: 1 };
    // The wind, as broad patches. Placed on the sphere rather than on the
    // canvas so they come out the same size everywhere — scattered in pixel
    // space they would bunch up and stretch at the poles, which is exactly the
    // artefact the rest of this file is careful about.
    for (let i = 0; i < 90; i++) {
      const lat = Math.asin(rand() * 2 - 1);
      const lon = (rand() - 0.5) * Math.PI * 2;
      _d.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
      this._at(_d, at);
      const r = this._radii(2.5 + rand() * 5.5, at);
      const deep = rand() < 0.5;
      this._blob(at.x, at.y, r.rx, r.ry, 0.10 + rand() * 0.16, deep);
    }

    for (const f of features || []) {
      this._at(f.dir, at);
      const r = this._radii(f.r, at);
      if (f.level < 0) {
        this._blob(at.x, at.y, r.rx, r.ry, -f.level, false);
      } else {
        // A ring rather than a disc: the bank is OUTSIDE the wall. Drawn as the
        // wide blob with a narrower hole taken back out of it, because a canvas
        // has no annulus and this is two calls.
        this._blob(at.x, at.y, r.rx, r.ry, f.level, true);
        const inner = this._radii(f.inner || f.r * 0.55, at);
        this._blob(at.x, at.y, inner.rx, inner.ry, f.level, false);
      }
    }

    this.was.clear();
    this.laid = true;
    this.dirty = true;
  }

  // Back to a world with no snow in it — and back to being free. A map of ones
  // is a map that changes nothing, so a planet in summer pays for none of this.
  clear() {
    if (!this.laid) return;
    this.g.globalCompositeOperation = 'source-over';
    this.g.fillStyle = '#ffffff';
    this.g.fillRect(0, 0, W, H);
    this.was.clear();
    this.laid = false;
    this.dirty = true;
  }

  // --------------------------------------------------------------- a walker
  //
  // Somebody is at `dir`. If they have gone far enough since their last print,
  // leave another.
  //
  // It takes the CHARACTER'S OWN KEY rather than a position from the caller,
  // and that is what lets the trail be a trail: the distance is measured from
  // where this particular walker last printed, so four of them crossing the
  // same meadow leave four sets of prints rather than one shared stutter.
  //
  // Somebody standing still leaves nothing, which is not a special case — they
  // simply never cover a stride.
  tread(key, dir, scale = 1) {
    if (!this.laid) return;
    const was = this.was.get(key);
    if (!was) {
      this.was.set(key, dir.clone());
      return;
    }
    const gap = was.angleTo(dir) * this.R;
    if (gap < STRIDE) return;
    // ...and if they have somehow crossed half the planet since the last frame
    // — a teleport, a debug jump, the first frame after a reload — that is not
    // a walk and gets no trail. Without this, `goIn` would draw a furrow from
    // wherever you were standing straight through everything in between.
    if (gap > 3) {
      was.copy(dir);
      return;
    }
    was.copy(dir);
    const at = this._at(dir, { x: 0, y: 0, stretch: 1 });
    const r = this._radii(PRINT_R * scale, at);
    this._blob(at.x, at.y, r.rx, r.ry, PRINT_DEPTH, false);
  }

  // ----------------------------------------------------------- and it fills in
  //
  // Snow falling on a trodden field puts it back, which is the other half of
  // footprints being worth having: a trail you left an hour ago should not
  // still be there in the middle of a blizzard.
  //
  // One flat white wash at a low alpha, which pulls the WHOLE map toward full
  // depth — so a deep print takes longer to vanish than a faint one, and the
  // drifts and the shelter under the trees recover at the same pace as the
  // paths. That is snow filling in, and it costs one fillRect.
  //
  // Rate follows how hard it is falling, so a flurry barely touches yesterday's
  // tracks and a blizzard wipes them.
  // PAID IN INSTALMENTS, and it has to be, which is the one genuinely
  // surprising thing in this file.
  //
  // The obvious version washes white over the map every frame at a tiny alpha.
  // It does nothing at all. A canvas is EIGHT BITS a channel, so a step that
  // moves a pixel by less than half a level is rounded away — and at a rate
  // slow enough to look like snow, every step is. Measured: a field scrubbed to
  // 52 climbed to exactly 128 and then stopped dead, for as long as it was left
  // snowing. Halfway, forever, because at 128 the increment had fallen under
  // the quantum and every further frame rounded to nothing.
  //
  // So the debt is accrued as a float and only spent once it is worth enough to
  // move a pixel several levels. Fewer, larger washes — which is both correct
  // and cheaper than the version that did not work.
  _fill(dtMs, flakes) {
    if (flakes < 0.02) return;
    this.owed += (dtMs / 1000) * flakes * CONFIG.weather.fillRate;
    if (this.owed < FILL_STEP) return;
    const a = Math.min(0.35, this.owed);
    this.owed = 0;
    this.g.globalCompositeOperation = 'source-over';
    this.g.fillStyle = `rgba(255,255,255,${a})`;
    this.g.fillRect(0, 0, W, H);
    this.dirty = true;
  }

  // Everything per frame that is not a walker: the fill-in, and pushing the
  // map to the GPU if anything has touched it.
  //
  // THE THROTTLE IS THE WHOLE COST CONTROL. A canvas texture has no partial
  // upload, so every push is the entire two megabytes whether one footprint
  // changed or the whole field did. Six a second is past the point anybody can
  // see a print appear, and on the vast majority of frames `dirty` is false and
  // this does nothing at all.
  update(dtMs, flakes) {
    this.clock += dtMs;
    if (!this.laid) return;
    this._fill(dtMs, flakes);
    if (!this.dirty || this.clock < this.pushAt) return;
    this.pushAt = this.clock + PUSH_MS;
    this.dirty = false;
    this.tex.needsUpdate = true;
  }
}

// THERE IS NO COLOUR IN THIS FILE, and that is worth ending on.
//
// A footprint is not drawn in a trodden-snow colour; it is snow that is not
// there. What shows through it is whatever the ground already was, wearing the
// same hour and the same lamplight as the white beside it — which is why a
// trail across a moonlit field comes out blue without anybody saying so, and
// why one crossing a lamp's disc comes out warm. Every appearance this file has
// is the ground's, and it only ever decides how much of it to leave.
