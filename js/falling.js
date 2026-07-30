// WHAT COMES OUT OF THE SKY, and what it leaves on the ground.
//
// Five things, deliberately one file, because they are two events seen at three
// distances each and the machinery for "a column of something falling around
// you" is the same machinery whichever thing it is:
//
//   the rain      streaks in the air between you and everything else
//   the splash    rings where they land, right around your feet
//   the puddles   what the rain leaves
//   the snow      the same column, slower, drifting, and drawn as objects
//   the snowmen   what the snow leaves, and the only thing here anybody MADE
//
// The two aftermaths are the reason the rest is worth having. Weather that
// draws itself and leaves nothing behind is a screensaver — the sky changes,
// you look up, and then the world is exactly as it was. Water standing in the
// hollows, and a snowman still up an hour after the last flake, are what make
// it a thing that HAPPENED.
//
// THE FILE WAS CALLED rain.js and the rename came with the snow. It is worth a
// line because the alternative was a second file: `snow.js` would have had to
// copy the column, the recycling, the roof fade and the altitude fade — four
// things that have nothing to do with what is falling through them — and then
// keep both copies in step forever. What is genuinely different between rain
// and snow is the sprite, the speed and the drift, and that is three arguments,
// not a file.
//
// Nothing here decides anything. weather.js says how hard it is coming down and
// how much of it is lying; this file only draws those numbers. See the note on
// `grade` there for why every value arrives as a plain 0-to-1.
//
// ---------------------------------------------------------- where it all sits
//
// Everything is a child of the planet's own group, never of the camera, and
// that is not a detail — the world BOBS (see CONFIG.globe.bob), so anything
// lying on the grass that is not parented to the grass slides against it by a
// few centimetres a second. The fall is the one part that also has to follow
// you, and it does it by being MOVED each frame rather than by being reparented:
// a column of rain positioned at your feet and turned to your own up.

import * as THREE from 'three';
import { CONFIG, PAL } from './config.js';
import {
  groundCap, inLake, inBuilding, inSolid, orientBillboard, SHADOW_LIFT, underRoof,
} from './sphere.js';
import {
  paintRainDrop, paintRipple, paintPuddle, paintSnowflake, paintSnowman, RAIN_LEAN,
} from './art.js';

const UP = new THREE.Vector3(0, 1, 0);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// What a drop is lifted TOWARD, never past. The hour multiplies everything on
// this planet, rain included — but only most of the way: a raindrop is the
// light on water rather than the water, so it stays the brightest thing in a
// dark scene, which is exactly what rain at night looks like.
const DROP_LIT = new THREE.Color(PAL.rainDrop);

// The same for a flake, and pulled harder — see where it is used. Snow is the
// brightest thing in any scene it falls through, including a midnight one.
const FLAKE_LIT = new THREE.Color(PAL.snowFlake);

const _dir = new THREE.Vector3();
const _e = new THREE.Vector3();
const _n = new THREE.Vector3();

function texFrom(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A direction a short arc away from another one, at a random bearing. The
// splashes need this and nothing else in the project quite does: `scatter` deals
// a fixed spiral over the whole planet, and what a splash wants is somewhere
// random within a few paces of your feet.
function nearby(from, arc, out) {
  // Any two axes across `from` will do — a bearing is being rolled anyway.
  _e.set(0, 1, 0);
  if (Math.abs(from.dot(_e)) > 0.9) _e.set(1, 0, 0);
  _n.crossVectors(from, _e).normalize();
  _e.crossVectors(_n, from).normalize();
  const b = Math.random() * Math.PI * 2;
  // Square-rooted so the spots come out evenly spread over the DISC rather than
  // piled at its middle, which is what a flat roll gives.
  const a = Math.sqrt(Math.random()) * arc;
  return out.copy(from).multiplyScalar(Math.cos(a))
    .addScaledVector(_e, Math.sin(a) * Math.cos(b))
    .addScaledVector(_n, Math.sin(a) * Math.sin(b))
    .normalize();
}

// HOW MANY SPOTS ARE CONSIDERED, which is emphatically NOT how many puddles
// there are. It is a constant rather than a multiple of the wanted count, and
// that is the whole point of it: a Fibonacci spiral of 300 points and a spiral
// of 78 share no points at all, so deriving the candidate count from the wanted
// one would mean that asking for one more puddle moved every puddle on the
// planet. scatter() in scene.js records the same lesson in its own words, and
// keeps a hole in PROP_TYPES rather than a shorter list for the same reason.
//
// ALL 300 are screened before any are selected. The old code stopped as soon
// as N candidates passed. Since this spiral is ordered from north to south,
// "first N" meant "the northern part of the planet until the list is full" —
// deterministic, but visibly concentrated. The valid set is now dealt into a
// farthest-point prefix below: each next puddle fills the largest remaining
// gap. Turning the count dial still only lengthens the list, without moving any
// puddle already in it.
//
// 300 is set against the pass rate rather than guessed. Measured in the built
// world, about one candidate in eight survives the three rejections below —
// mostly to `inSolid`, since the props and the ground cover between them cover
// a good deal of a planet this small — which leaves room for well over the two
// dozen the config currently asks for. The first version derived it as three
// times the count, which passed 9 of 78 and quietly delivered a third of what
// it was asked for. A scatter that under-delivers in silence is worse than one
// that is too sparse on purpose: nothing looks broken, so nothing gets checked.
const PUDDLE_SITES = 300;

// WHERE THE HOLLOWS ARE. Dealt once from that spiral, exactly like the props
// and for exactly the same reason: the same water has to gather in the same
// places every time it rains, or a puddle is not a hollow in the ground, it is
// a thing that appears near you.
//
// Rejected off water (a puddle in a pond is nothing), off the two buildings,
// and off anything solid. Rejection rather than nudging, because a spot pushed
// off a stump lands wherever the push put it and the spiral stops being one.
//
// The margins are SMALLER than anything else on this planet keeps, and that is
// right rather than sloppy: every other berth is asking how close a body may
// stand, and this is asking how close water may lie. It may lie right up
// against a trunk — that is where it collects — so all these have to prevent is
// a decal visibly climbing something.
function puddleSpots(count) {
  const valid = [];
  for (let i = 0; i < PUDDLE_SITES; i++) {
    const y = 1 - ((i + 0.5) / PUDDLE_SITES) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * GOLDEN_ANGLE;
    const dir = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    if (CONFIG.lakes.some((l) => inLake(dir, l, 0.04))) continue;
    // THE WHOLE FOOTPRINT, not the wall band — `inBuilding(dir, 0.25)` stood
    // here and let every spot over a floor through, because that function's
    // answer indoors is "free ground" (see underRoof). Rain collected on the
    // boards of both houses. The margin goes with it: this is the one rejection
    // here that is not about a decal climbing something, it is about a roof,
    // and a roof either covers a spot or does not.
    if (underRoof(dir)) continue;
    if (inSolid(dir, 0.12)) continue;
    valid.push(dir);
  }

  if (valid.length === 0 || count <= 0) return [];
  const wanted = Math.min(count, valid.length);

  // A deterministic farthest-point prefix over the valid candidates. Chord
  // distance (`1 - dot`) has exactly the same ordering as angular distance on
  // a unit sphere and avoids an acos in this small build-time loop.
  //
  // `nearest[i]` is how close candidate i lies to the selected set. Each pass
  // updates it against only the most recently selected puddle, then chooses the
  // candidate whose nearest neighbour is farthest away. Ties keep the earlier
  // spiral index, so the sequence is stable across engines.
  const out = [valid[0]];
  const used = new Uint8Array(valid.length);
  const nearest = new Float64Array(valid.length);
  used[0] = 1;
  nearest.fill(Infinity);

  while (out.length < wanted) {
    const newest = out[out.length - 1];
    let next = -1;
    let best = -1;
    for (let i = 0; i < valid.length; i++) {
      if (used[i]) continue;
      nearest[i] = Math.min(nearest[i], 1 - newest.dot(valid[i]));
      if (nearest[i] > best) {
        best = nearest[i];
        next = i;
      }
    }
    if (next < 0) break;
    used[next] = 1;
    out.push(valid[next]);
  }
  return out;
}

export class Weatherfall {
  // `R` is the planet's radius. `tintables` is the scene's own list of
  // materials that wear the hour — the puddles, the splashes and the snowmen
  // join it, so they darken at night and brighten under a lamp with everything
  // else that lies on the grass. What is FALLING does not: it is between you
  // and the world rather than part of it, and is tinted by hand below.
  constructor(R, tintables) {
    this.R = R;
    this.wx = null;

    // ------------------------------------------------------------- the fall
    //
    // One rig, carried to wherever you are stood and turned so its own +Y is
    // your up. Every drop and flake below lives in its local space, which means
    // the arithmetic that makes weather fall is `y -= speed * dt` and nothing
    // else — no great circles, no frames, no planet.
    //
    // ONE RIG FOR BOTH, and two clouds of points inside it. They can be on
    // screen at the same time and should be able to: a front that turns over
    // from rain to snow passes through sleet, and sleet is exactly what two
    // densities ramping past each other looks like. Nothing had to be written
    // for it — see the note on `drops` and `flakes` in weather.js.
    this.fall = new THREE.Group();
    this.fall.frustumCulled = false;

    const w = CONFIG.weather;
    const pos = new Float32Array(w.dropsMax * 3);
    for (let i = 0; i < w.dropsMax; i++) this._seed(pos, i, Math.random() * w.dropTop);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dropPos = pos;

    this.dropMat = new THREE.PointsMaterial({
      map: texFrom(paintRainDrop()),
      size: w.dropSize,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    this.drops = new THREE.Points(geo, this.dropMat);
    // The positions are rewritten every frame, so a bounding sphere computed
    // once is a lie within a second — and a lie in the direction that matters,
    // since three.js would use it to cull the whole column the moment the drops
    // wandered outside where they started.
    this.drops.frustumCulled = false;
    this.fall.add(this.drops);

    // ...and the snow, in the same column with its own everything else.
    //
    // `flakePhase` is what makes each one wander on its own schedule. Without a
    // per-flake offset every flake sways in step, and 620 things swaying in step
    // is not snow, it is a curtain — the single most recognisable way for
    // falling snow to look wrong. It is stored rather than derived from the
    // index because the index is also what recycles them, and two uses of one
    // number is how a field of snow ends up with visible rows in it.
    const snowPos = new Float32Array(w.flakesMax * 3);
    this.flakePhase = new Float32Array(w.flakesMax);
    for (let i = 0; i < w.flakesMax; i++) {
      this._seedFlake(snowPos, i, Math.random() * w.dropTop);
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    this.snowPos = snowPos;

    this.flakeMat = new THREE.PointsMaterial({
      map: texFrom(paintSnowflake()),
      size: w.flakeSize,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    this.flakes = new THREE.Points(snowGeo, this.flakeMat);
    this.flakes.frustumCulled = false;
    this.fall.add(this.flakes);

    // ------------------------------------------------------------ the splashes
    //
    // A small fixed pool, popped near your feet and recycled. Nowhere near one
    // per drop, which nothing needs: what says the ground is being hit is that
    // rings keep appearing on it, not that each one belongs to something.
    const rippleTex = texFrom(paintRipple());
    this.splash = [];
    for (let i = 0; i < w.ripples; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: rippleTex, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
      });
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -4;
      mat.polygonOffsetUnits = -8;
      // Built at the biggest it ever gets and scaled DOWN from there. The walk
      // marker's note argues the other way — a cap squashed in x and z keeps
      // the sag it was cut with — and the reason that does not bite here is
      // scale: this cap is under half a unit across at full size, where the
      // ground falls away by less than a thousandth of a unit corner to corner.
      // Cutting fresh geometry fourteen times a second to fix that would be
      // paying a real cost for an error nothing can resolve.
      const mesh = new THREE.Mesh(
        groundCap(R, w.rippleGrow * 0.4, w.rippleGrow * 0.4, SHADOW_LIFT * 1.4),
        mat,
      );
      mesh.renderOrder = 3;
      mesh.visible = false;
      this.splash.push({ mesh, mat, life: 1, dir: new THREE.Vector3(0, 1, 0) });
      if (tintables) tintables.push(mat);
    }

    // ------------------------------------------------------------- the puddles
    //
    // Every hollow on the planet, built once and then simply REVEALED by how
    // wet the ground is. Nothing is created or destroyed while it rains, which
    // is what lets the same water gather in the same places — and what keeps a
    // downpour from being a scene graph event.
    const faces = [0, 1, 2].map((i) => texFrom(paintPuddle(i + 1)));
    this.pools = [];
    const spots = puddleSpots(w.puddles);
    spots.forEach((dir, i) => {
      const f = spots.length > 1 ? i / (spots.length - 1) : 0;
      const size = w.puddleMin + (w.puddleMax - w.puddleMin) * ((i * 0.37) % 1);
      const mat = new THREE.MeshBasicMaterial({
        map: faces[i % faces.length], transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
      });
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -4;
      mat.polygonOffsetUnits = -8;
      const mesh = new THREE.Mesh(groundCap(R, size, size, SHADOW_LIFT), mat);
      mesh.position.copy(dir).multiplyScalar(R + 0.001);
      mesh.quaternion.setFromUnitVectors(UP, dir);
      // Over the ground and under everything standing on it, the same slot the
      // walk marker takes: you should see grass growing through the shallow end
      // of a puddle and never see one over somebody's feet.
      mesh.renderOrder = 2;
      mesh.visible = false;
      // WHEN THIS ONE FILLS, spread across the scatter rather than shared. The
      // first hollows take water early in a shower and the last only in a real
      // downpour, so the ground wets in stages instead of the whole planet
      // turning to puddles on one frame.
      const at = w.puddleFirst + (w.puddleLast - w.puddleFirst) * f;
      this.pools.push({ mesh, mat, at, dir });
      if (tintables) tintables.push(mat);
    });

    // ------------------------------------------------------------ the snowmen
    //
    // The one thing in this world that was MADE, and the only reason the
    // gathering in household.js has anything to show for itself.
    //
    // A pool built up front and handed out, rather than meshes created when one
    // is built — the same arrangement the puddles are in and for the same
    // reason: nothing should be constructing geometry on the frame the cast
    // finish patting it into shape. What `raise` does is move one of these to a
    // spot and start it growing.
    //
    // TEN STAGES OF MELT, painted once each and swapped between. A snowman
    // going is a SHAPE changing — the head sinking into the body, the whole
    // thing spreading — which no scale on one drawing can do; and repainting
    // the canvas as it went would be a texture upload every few seconds for an
    // hour. Ten steps is under the eye's ability to catch a step at the speed
    // this melts, which is most of an hour from standing to gone.
    const MELT_STEPS = 10;
    const meltTex = [];
    for (let i = 0; i < MELT_STEPS; i++) {
      meltTex.push(texFrom(paintSnowman(i / (MELT_STEPS - 1))));
    }
    this.meltTex = meltTex;

    this.snowmen = [];
    this.clock = 0;
    for (let i = 0; i < w.snowmen; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: meltTex[0], transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const size = w.snowmanSize;
      // ANCHOR, HOLDER, CARD — three nested objects, which is the arrangement
      // every standing thing on this planet uses and is not one more than it
      // needs. Each of the three holds exactly one fact:
      //
      //   anchor  WHERE it is, and nothing else. Never rotated, never moved
      //           again once it is placed.
      //   holder  WHICH WAY IT FACES, written every frame by orientBillboard.
      //   card    how tall it is — lifted half its own height so what stands on
      //           the ground is the snowman's foot rather than its middle.
      //
      // The split between the first two is load-bearing rather than tidy, and
      // getting it wrong produced the strangest bug in this feature.
      // orientBillboard does not only set a rotation: it OVERWRITES the
      // object's position with a small lift along the ray to the camera,
      // expecting that object to be a child of something else that holds the
      // real position. Handed one object playing both parts — the holder, with
      // its own position passed in as the source — it read back what it had
      // just written, every frame, and walked the snowman off its spot and into
      // the camera. On screen it was a featureless grey slab filling a third of
      // the frame, which is a 1-unit card seen from six inches away.
      const anchor = new THREE.Group();
      const holder = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.position.y = size / 2;
      // Above the ground and the puddles, in with the things that STAND on the
      // planet rather than the things drawn on it.
      mesh.renderOrder = 6;
      holder.add(mesh);
      anchor.add(holder);
      anchor.visible = false;
      this.snowmen.push({
        mesh, mat, anchor, holder, at: null, made: 0, step: -1, standoff: size / 2,
      });
      if (tintables) tintables.push(mat);
    }

    // Everything the scene has to add to its own world group.
    this.objects = [
      this.fall,
      ...this.splash.map((s) => s.mesh),
      ...this.pools.map((p) => p.mesh),
      ...this.snowmen.map((s) => s.anchor),
    ];
  }

  // A drop somewhere in the column, at a given height. Its x and z are rolled
  // over a disc rather than a square, or the corners of the column would be
  // visibly denser than the middle of it.
  _seed(pos, i, y) {
    const w = CONFIG.weather;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * w.dropR;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }

  // The same for a flake, plus the drift phase that is its alone.
  _seedFlake(pos, i, y) {
    this._seed(pos, i, y);
    this.flakePhase[i] = Math.random() * Math.PI * 2;
  }

  // PUT ONE UP. Called by the household when the cast have finished making it —
  // see the gathering there — and by nothing else.
  //
  // Oldest first when they are all taken, so a fourth winter's snowman replaces
  // the one that has been standing longest rather than being refused. A planet
  // that stops accepting snowmen would be a strange thing to have built.
  raise(dir) {
    let take = this.snowmen.find((s) => !s.at);
    if (!take) {
      take = this.snowmen.reduce((a, b) => (a.made <= b.made ? a : b));
    }
    take.at = dir.clone();
    take.made = this.clock;
    take.anchor.position.copy(take.at).multiplyScalar(this.R);
    take.anchor.visible = true;
    // Straight to the first stage, or a replaced snowman would spend its first
    // frame wearing however melted the last one had got.
    take.step = -1;
    return take;
  }

  // Where the ones currently standing are, so the gathering can keep its
  // distance from them — three snowmen patted out on the same square metre
  // would read as one snowman drawn three times.
  standing() {
    return this.snowmen.filter((s) => s.at).map((s) => s.at);
  }

  // `anchor` is where you are stood, `tint` the hour's own multiply, `wet` how
  // much standing water there is, `inside` how much of you is under a roof and
  // `alt` how far off the ground the camera has got.
  update(dtMs, { anchor, tint, grade, wet, snow = 0, camera = null, inside = 0, alt = 0 }) {
    const w = CONFIG.weather;
    const dt = dtMs / 1000;
    this.clock += dt;

    // ------------------------------------------------------------- the fall
    //
    // How much is in front of you, which is not the same question as how hard
    // it is coming down. A roof takes nearly all of it — but only nearly, and
    // that last tenth is deliberate: the door is a hole in the wall, you can
    // see the weather through it, and a column cut dead at the threshold reads
    // as the weather being switched off rather than as being out of it.
    //
    // ...and it goes with height too. Rain seen from orbit is a column of
    // streaks following the camera around a planet, which is the one view that
    // gives the trick away.
    const roof = 1 - inside * (1 - w.indoorDrops);
    const high = Math.max(0, 1 - alt / 6);
    const rainy = grade.drops * roof * high;
    const snowy = grade.flakes * roof * high;

    // The rig carries both clouds, so it is up if EITHER of them is — and the
    // two are gated separately below rather than by a kind, which is what lets
    // a front turning over show sleet on the way through.
    const falling = rainy > 0.004 || snowy > 0.004;
    if (falling !== this.fall.visible) this.fall.visible = falling;
    if (falling) {
      this.fall.position.copy(anchor).multiplyScalar(this.R);
      this.fall.quaternion.setFromUnitVectors(UP, anchor);
    }

    if (falling && rainy > 0.004) {
      if (!this.drops.visible) this.drops.visible = true;
      const n = Math.max(1, Math.round(w.dropsMax * grade.drops));
      const drop = w.fallSpeed * dt;
      // The lean, given to the MOTION so it agrees with the lean drawn into the
      // sprite — see RAIN_LEAN in art.js. Negative because the streak is drawn
      // with its top at +x and its tail at -x, so a drop travels the way the
      // drawing is already pointing.
      const slide = -drop * (grade.wind + RAIN_LEAN * 0.5);
      const pos = this.dropPos;
      for (let i = 0; i < n; i++) {
        const y = i * 3 + 1;
        pos[y] -= drop;
        if (pos[y] < 0) {
          // Back to the top with a fresh bearing, rather than straight up from
          // where it landed. Recycling in place makes columns: over a few
          // seconds every drop settles into a vertical line and the rain reads
          // as falling wallpaper.
          this._seed(pos, i, w.dropTop);
        } else {
          pos[i * 3] += slide;
        }
      }
      this.drops.geometry.setDrawRange(0, n);
      this.drops.geometry.attributes.position.needsUpdate = true;
      // Tinted by hand, because rain is not one of the things standing on the
      // planet and never joined `tintables`. See DROP_LIT.
      this.dropMat.color.copy(tint).lerp(DROP_LIT, 0.45);
      this.dropMat.opacity = Math.min(0.72, rainy * 0.8);
    } else if (this.drops.visible) {
      this.drops.visible = false;
    }

    // ...and the snow, which is the same column and almost none of the same
    // numbers. It falls at a ninth of the speed, it leans a fifth as far, and
    // every flake wanders on a phase of its own — see flakePhase, which is the
    // difference between snow and a curtain being lowered.
    if (falling && snowy > 0.004) {
      if (!this.flakes.visible) this.flakes.visible = true;
      const n = Math.max(1, Math.round(w.flakesMax * grade.flakes));
      const drop = w.driftSpeed * dt;
      const lean = -drop * grade.wind * 3;
      const pos = this.snowPos;
      const spin = this.clock * w.driftHz * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const y = i * 3 + 1;
        pos[y] -= drop;
        if (pos[y] < 0) {
          this._seedFlake(pos, i, w.dropTop);
          continue;
        }
        // The wander, integrated rather than added as an offset — so a flake
        // genuinely travels a wavy path down instead of being a straight fall
        // with a wobble laid over it. The two look identical for one frame and
        // completely different over the ten seconds one takes to land.
        //
        // The z axis runs at a different rate from x on purpose. Matched, every
        // flake traces a diagonal line; unmatched, they trace loops, which is
        // what a flake actually does in still air.
        const ph = this.flakePhase[i] + spin;
        pos[i * 3] += (Math.cos(ph) * w.driftSway + lean) * dt;
        pos[i * 3 + 2] += Math.sin(ph * 0.63) * w.driftSway * 0.7 * dt;
      }
      this.flakes.geometry.setDrawRange(0, n);
      this.flakes.geometry.attributes.position.needsUpdate = true;
      // Barely tinted at all, against the rain's 0.45. A flake is a lit object
      // with sky behind it rather than a surface catching the hour — and unlike
      // rain, snow is the brightest thing in its own scene by a long way. Pull
      // it toward the hour and a snowy midnight loses the fall entirely.
      this.flakeMat.color.copy(tint).lerp(FLAKE_LIT, 0.72);
      this.flakeMat.opacity = Math.min(0.95, snowy * 1.1);
    } else if (this.flakes.visible) {
      this.flakes.visible = false;
    }

    // ------------------------------------------------------------ the splashes
    //
    // RAIN'S ALONE, and snow is not a case that was forgotten. A raindrop hits
    // and throws a ring outward; a flake arrives and stops. There is nothing
    // for a splash to be made of, and giving snow one would be the single
    // clearest way to say "this is rain with the sprite changed".
    for (const s of this.splash) {
      if (s.life >= 1) {
        // Nothing to draw. Roll for a new one, at a rate that follows how hard
        // it is coming down — and never under a roof, where the ground is dry.
        if (rainy < 0.06 || Math.random() > rainy * dt * 26) {
          if (s.mesh.visible) s.mesh.visible = false;
          continue;
        }
        nearby(anchor, w.rippleR / this.R, s.dir);
        // ...and here is the roof the line above promised. This test was named
        // in that comment from the first version and never actually written,
        // so a shower indoors threw rings across the floorboards while you
        // stood watching the rain through the door.
        //
        // The spot is DROPPED rather than re-rolled toward open ground. Every
        // candidate comes from the same small circle round your feet, so when
        // you are inside they are all under the same roof and a retry would
        // only spend the frame proving it — and the right number of splashes
        // to draw on a dry floor is none. Standing in the doorway thins them
        // out as you step in, which is what it should look like.
        if (underRoof(s.dir)) {
          if (s.mesh.visible) s.mesh.visible = false;
          continue;
        }
        s.mesh.position.copy(s.dir).multiplyScalar(this.R + 0.002);
        s.mesh.quaternion.setFromUnitVectors(UP, s.dir);
        s.mesh.visible = true;
        s.life = 0;
      }
      s.life = Math.min(1, s.life + dtMs / w.rippleMs);
      // Out fast and fading the whole way. A ring that grows at a constant rate
      // reads as a bubble; one that flings itself out and stops is a splash.
      const k = 1 - (1 - s.life) * (1 - s.life);
      const size = 0.18 + k * 0.82;
      s.mesh.scale.set(size, 1, size);
      s.mat.opacity = (1 - s.life) * 0.55;
      if (s.life >= 1) s.mesh.visible = false;
    }

    // ------------------------------------------------------------- the puddles
    //
    // Read off `wet` and nothing else, which is what makes them outlive the
    // sky: weather.js fills that number at the pace of the rain and drains it at
    // the pace of a wet afternoon, so this loop goes on drawing water for a good
    // while after the last drop.
    for (const p of this.pools) {
      const k = Math.min(1, Math.max(0, (wet - p.at) / 0.14));
      const on = k > 0.01;
      if (on !== p.mesh.visible) p.mesh.visible = on;
      if (!on) continue;
      // Spreading rather than fading in, because that is what a puddle does. A
      // hollow with a little water in it is a SMALL puddle, not a faint one.
      // The opacity still moves, but only over the first part of the fill, so
      // there is no frame where a full-sized puddle is half see-through.
      const spread = 0.42 + k * 0.58;
      p.mesh.scale.set(spread, 1, spread);
      p.mat.opacity = Math.min(1, k * 2.4) * 0.92;
    }

    // ------------------------------------------------------------ the snowmen
    //
    // Read off the cover like the puddles are read off the wet, and outliving
    // it the same way — except that snow's cover is the longest clock in the
    // app, so what this loop mostly does is very slowly take one apart.
    //
    // NOTHING HERE ASKS WHETHER IT IS SNOWING. A snowman does not care what the
    // sky is doing; it cares how much snow is left on the ground, which is the
    // only thing it is made of. That is also why one can stand through a
    // rainstorm in the middle of a thaw and simply go on melting.
    const last = this.meltTex.length - 1;
    for (const s of this.snowmen) {
      if (!s.at) continue;
      // Gone. Not hidden — RETIRED, so the slot goes back in the pool and the
      // next winter can use it. A snowman that only ever went invisible would
      // silently use up all three places on the planet within a few thaws.
      if (snow < w.goneAt) {
        s.at = null;
        s.anchor.visible = false;
        continue;
      }
      // How far gone, 0 while there is plenty of snow about and 1 as the last
      // of it goes. The slump only STARTS at slumpAt, which is well below the
      // cover it takes to build one — so a snowman stands at full height for
      // most of its life and then goes in a hurry, which is what they do.
      const t = Math.min(1, Math.max(0,
        (w.slumpAt - snow) / Math.max(1e-4, w.slumpAt - w.goneAt)));
      const step = Math.round(t * last);
      if (step !== s.step) {
        s.step = step;
        s.mat.map = this.meltTex[step];
        s.mat.needsUpdate = true;
      }
      // Patted into shape rather than appearing: a couple of seconds of growing
      // on the frames just after the cast finish with it. It is the only thing
      // that says this was MADE and not scattered with the trees.
      const grew = Math.min(1, (this.clock - s.made) / 2.2);
      const rise = grew * grew * (3 - 2 * grew);
      s.mesh.scale.setScalar(0.25 + rise * 0.75);
      // ...and the last of it fades rather than blinking out, over the sliver
      // of cover between the final melt stage and nothing.
      s.mat.opacity = Math.min(1, (snow - w.goneAt) / 0.05);
      // The holder turns; the anchor's position is what it is turned ABOUT.
      // Two different objects, deliberately — see where they are built.
      if (camera) {
        orientBillboard(s.holder, s.anchor.position, s.at, camera, s.standoff, true);
      }
    }
  }
}
