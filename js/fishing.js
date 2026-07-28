// The rod, the float, and the wait.
//
// Fishing is a STATE MACHINE and almost nothing else: cast → wait → bite →
// caught, with the interesting decisions being what may interrupt what. A tap
// during the bite is the catch; a tap during the wait reels in; walking away
// reels in; a tap on a friend is still a tap on a friend, and the line comes
// home first. The machine owns four little props — float, line, 「!」, splash
// rings, and the caught fish's card — and every one of them is built once here
// and shown or hidden, never created mid-play.
//
// WHAT BITES IS THE SHOAL. Before the 「!」, the nearest real fish is lured
// over (see lure in fish.js) and swims visibly to the float; the species you
// catch is that fish's own, and afterwards it dives and the pond holds one
// fewer for a while. The pull of this is quiet but real: you can look at the
// water, see the stripy one loafing nearby, and cast to it on purpose. The pond
// is a place with fish in it, not a gacha wearing a pond costume.
//
// TWELVE SPECIES SHARPENS THAT rather than changing it. Three tints were a
// thing you noticed; twelve drawings are a thing you can want, so choosing
// which fish to cast at is now most of what casting is, and the 図鑑 filling up
// is a record of walking round the lake rather than of rolling dice at it.
//
// ONE CLOCK. Every timer in here runs on the `now` handed to update() — the
// frame loop's clock — and taps never compare times, they only read which
// state the machine is in. That split matters: the app's tap handlers stamp
// real time while the frame loop can be stepped synthetically (see
// hidamari.step), and a machine that mixed the two clocks would work live and
// lie under test.

import * as THREE from 'three';
import { CONFIG, PAL } from './config.js';
import { inLake, lakeReach } from './sphere.js';
import { paintBobber, paintExclaim, paintRipple } from './art.js';
import { WATER_STENCIL } from './water.js';
import { FISH_ITEM } from './items.js';
import { fishCard, fishTexture } from './fish.js';

// Where the float sits above the planet's centreline: on the water's surface,
// which is LIFT + LAYER in water.js. A hair above, for the same
// stacked-curved-decals reason everything out there is a hair above something.
const FLOAT_AT = 0.018;

// The card in your hand is at renderOrder 9000 and the world tops out around
// characters in the hundreds; the float and line sit over the water but under
// any UI, the 「!」 and the caught card ride above everything.
const PROP_ORDER = 6;
const RING_ORDER = 5.5;
const TOP_ORDER = 9100;

// Where the line leaves the screen, in the camera's own space — just under the
// hand's home corner, as if the unseen rod is held there.
const ROD_AT = new THREE.Vector3(0.15, -0.34, -0.88);
const LINE_SEGS = 14;
// How deep the line's belly hangs, in world units, and how the cast flies: a
// lob that peaks halfway out.
const LINE_SAG = 0.26;
const CAST_MS = 420;
const CAST_LOB = 0.55;

// The reveal: rise out of the water wagging, hang there, then away to the
// pouch corner. Times are cumulative milliseconds from the catch.
const REVEAL_RISE = 480;
const REVEAL_HOLD = 1150;
const REVEAL_DONE = 1500;

// How big a caught fish is held up, on its LONG side — the same measure the
// shoal sizes its cards by, so what comes out of the water is recognisably what
// was swimming in it, only nearer. The old card was 0.45 tall and 0.28 across,
// and 0.45 is kept: this is a fish at arm's length, not a trophy.
const CARD_H = 0.45;

function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function spriteMat(map, opts = {}) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...opts,
  });
}

export class Fishing {
  // `hooks.onCatch(itemId)` fires when the reveal finishes — the moment the
  // fish is yours rather than the moment it left the water, so the pouch never
  // gains a fish that is still visibly in the air.
  constructor(globe, hooks = {}) {
    this.globe = globe;
    this.hooks = hooks;
    this.state = 'idle';
    this.stateAt = 0;
    this.biteAt = 0;
    this._now = 0;
    this.lured = null;
    this.lureSent = false;
    this.species = 0;
    this.castAnchor = new THREE.Vector3();
    this.bobDir = new THREE.Vector3();
    this.bobPos = new THREE.Vector3();

    const R = CONFIG.globe.radius;
    this.R = R;

    // The float: crossed quads, the ground cover's own trick, so it reads from
    // every side without ever being turned. Feet at the waterline — the
    // drawing's cap-and-belly split sits right where the water does.
    const bobTex = tex(paintBobber());
    this.bobber = new THREE.Group();
    for (const turn of [0, Math.PI / 2]) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spriteMat(bobTex));
      q.geometry.translate(0, 0.5, 0);
      q.rotation.y = turn;
      q.scale.set(0.155, 0.21, 1);
      q.renderOrder = PROP_ORDER;
      this.bobber.add(q);
    }
    this.bobber.visible = false;
    globe.world.add(this.bobber);

    // The line, from the unseen rod at the screen's corner out to the float.
    // A Line, not a mesh: one pixel of ink is exactly what a line the planet's
    // pen would draw looks like, and it costs nothing.
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array((LINE_SEGS + 1) * 3), 3));
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({
      color: PAL.line, transparent: true, opacity: 0.75, depthWrite: false,
    }));
    this.line.renderOrder = PROP_ORDER;
    this.line.frustumCulled = false;
    this.line.visible = false;
    globe.world.add(this.line);

    // 「!」 — camera-faced each frame while it stands. Depth test off: nothing
    // is allowed between you and a bite.
    this.exclaim = new THREE.Mesh(
      new THREE.PlaneGeometry(0.30, 0.39),
      spriteMat(tex(paintExclaim()), { depthTest: false }),
    );
    this.exclaim.renderOrder = TOP_ORDER;
    this.exclaim.frustumCulled = false;
    this.exclaim.visible = false;
    globe.world.add(this.exclaim);

    // Splash rings, pooled. Flat on the water, additive, and stencilled to it —
    // a ring half over the shore would print white on the grass.
    const ringTex = tex(paintRipple());
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spriteMat(ringTex, {
        blending: THREE.AdditiveBlending,
        stencilWrite: true,
        stencilRef: WATER_STENCIL,
        stencilFunc: THREE.EqualStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.KeepStencilOp,
      }));
      ring.renderOrder = RING_ORDER;
      ring.frustumCulled = false;
      ring.visible = false;
      globe.world.add(ring);
      this.rings.push({ mesh: ring, at: 0, live: false });
    }

    // The caught fish. The texture is the SHOAL'S — see fishTexture in fish.js —
    // rather than a second one cut from the same drawing, because the fish held
    // up over the water is meant to be the fish that was just in it, and two
    // uploads of one canvas is the version of that claim the GPU disagrees with.
    //
    // THE CARD IS A UNIT SQUARE and its shape arrives with the species, which is
    // what the drawings cost here. A fixed 0.28 x 0.45 was honest while every
    // fish was one silhouette; now it would stretch a puffer into a herring and
    // squeeze a needlefish into a matchstick. `_size` is where each species' own
    // proportions get written on the way past — see _catch and CARD_H.
    this.catchSize = new THREE.Vector2(CARD_H * 0.62, CARD_H);
    this.catchCard = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      spriteMat(fishTexture(0), { depthTest: false }),
    );
    this.catchCard.renderOrder = TOP_ORDER;
    this.catchCard.frustumCulled = false;
    this.catchCard.visible = false;
    globe.world.add(this.catchCard);

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._e = new THREE.Vector3();
  }

  get active() { return this.state !== 'idle'; }

  // A tap landed on `spot`. Worth a cast when: it is water with fish in it,
  // you are standing by that water, and the toss is a toss rather than a step
  // or a cannon shot. False otherwise, and the tap goes back to being a walk.
  //
  // No time parameter, on purpose — see ONE CLOCK at the top. The tap handler
  // lives on real time and this machine lives on the frame's; stamping the
  // cast with the caller's clock ran the machine from two clocks at once,
  // which worked live and hung under the stepped harness, the exact failure
  // the rule exists to prevent. The cast starts at the machine's own last
  // tick, at most a frame ago.
  // Whether you are standing somewhere a line could go in — the question the
  // action button asks to decide whether to offer 「つりをする」.
  //
  // Split out of tryCast because the two ask different things. tryCast is
  // given a SPOT and asks "may the float land here"; this is given your FEET
  // and asks "is there water in front of me at all". Tapping the water to cast
  // is gone — it was invisible to anyone who did not guess it, and it fought
  // with tapping the water for anything else — so this is now the only way
  // fishing starts.
  canCastFrom(playerDir) {
    if (this.active) return false;
    const school = this.globe.fish;
    if (!school) return false;
    const pond = school.pond;
    const along = playerDir.dot(pond.centre);
    if (along <= 0) return false;
    this._v.copy(playerDir).addScaledVector(pond.centre, -along).normalize();
    const outside = (Math.acos(Math.min(1, along))
      - lakeReach(pond.lake, this._v)) * this.R;
    // Outside the water and near enough to it. A negative `outside` means you
    // are standing IN the pond, which cannot happen — the water is solid — but
    // the test says so anyway rather than relying on that staying true.
    return outside > 0 && outside <= CONFIG.fishing.nearShore;
  }

  // Cast from where you stand, straight out in front of you. The button's
  // version of a cast: you do not choose the spot, you choose to fish, and the
  // float goes a comfortable toss ahead along the way you are facing.
  //
  // Aimed at the pond's middle rather than at your own bearing, because a cast
  // is at the WATER — facing along the shore and having the float land on
  // grass would be the button lying about what it does.
  castFrom(playerDir) {
    const school = this.globe.fish;
    if (!school) return false;
    const pond = school.pond;
    const along = playerDir.dot(pond.centre);
    if (along <= 0) return false;
    // The tangent from your feet toward the middle, and a toss along it.
    this._v.copy(pond.centre).addScaledVector(playerDir, -along).normalize();
    const f = CONFIG.fishing;
    const toss = (f.castMin + f.castMax) / 2 / this.R;
    this._v2.copy(playerDir).multiplyScalar(Math.cos(toss))
      .addScaledVector(this._v, Math.sin(toss)).normalize();
    return this.tryCast(this._v2, playerDir);
  }

  tryCast(spot, playerDir) {
    if (this.active) return false;
    const school = this.globe.fish;
    if (!school) return false;
    const pond = school.pond;
    // Inside the water by a margin, so the float never sits on the ink.
    if (!inLake(spot, pond.lake, -0.02)) return false;

    // Your feet against the nearest shore of THIS pond: the arc to its centre,
    // less the rim's reach along that bearing, is how far up the beach you are.
    const c = pond.centre;
    const along = playerDir.dot(c);
    if (along <= 0) return false;
    this._v.copy(playerDir).addScaledVector(c, -along).normalize();
    const outside = (Math.acos(Math.min(1, along)) - lakeReach(pond.lake, this._v)) * this.R;
    if (outside > CONFIG.fishing.nearShore) return false;

    const toss = Math.acos(Math.max(-1, Math.min(1, playerDir.dot(spot)))) * this.R;
    if (toss < CONFIG.fishing.castMin || toss > CONFIG.fishing.castMax) return false;

    this.bobDir.copy(spot).normalize();
    this.castAnchor.copy(playerDir);
    this.state = 'cast';
    this.stateAt = this._now;
    this.lured = null;
    this.lureSent = false;
    this._scheduleBite(this._now + CAST_MS);
    this.line.visible = true;
    return true;
  }

  _scheduleBite(from) {
    const [lo, hi] = CONFIG.fishing.biteDelay;
    this.biteAt = from + lo + Math.random() * (hi - lo);
  }

  // A tap that was not on a friend, while the line is out. During the bite it
  // is the catch; any other time it means "enough", and the line comes home.
  onTap() {
    if (this.state === 'bite') this._catch();
    else if (this.state === 'cast' || this.state === 'wait') this.cancel();
  }

  _catch() {
    const school = this.globe.fish;
    this.species = this.lured ? this.lured.species
      : Math.floor(Math.random() * FISH_ITEM.length);
    if (this.lured) school.dive(this.lured, CONFIG.fishing.diveMs);
    this.lured = null;
    this.state = 'reveal';
    this.stateAt = this._now;
    // WHETHER THERE IS ROOM FOR IT, asked now rather than at the end of the
    // reveal, because the answer changes what the reveal DOES. A full pack used
    // to be discovered only after the card had flown to the pouch corner, so
    // the fish was tallied, the whole flourish played, and then nothing was in
    // your bag and nothing said why. It read as the game losing your fish.
    //
    // Asked of the caller rather than decided here: this file knows about fish
    // and floats, and nothing about how many pockets anybody has.
    this.kept = !this.hooks.canKeep || this.hooks.canKeep(FISH_ITEM[this.species]);
    this.exclaim.visible = false;
    this.bobber.visible = false;
    this.line.visible = false;
    this._splash(this._now, 1.35);
    // This species' own shape, off its own card, longest side to CARD_H — the
    // same arithmetic the shoal uses to build a plane. Written once per catch
    // rather than per frame: the reveal below multiplies it by its own ease.
    const card = fishCard(this.species);
    const k = CARD_H / Math.max(card.width, card.height);
    this.catchSize.set(card.width * k, card.height * k);
    const mat = this.catchCard.material;
    mat.map = fishTexture(this.species);
    mat.needsUpdate = true;
    mat.opacity = 1;
    this.catchCard.visible = true;
  }

  cancel() {
    if (!this.active) return;
    if (this.lured) this.globe.fish.spook(this.lured);
    this.lured = null;
    this.state = 'idle';
    this.bobber.visible = false;
    this.line.visible = false;
    this.exclaim.visible = false;
    this.catchCard.visible = false;
  }

  // A splash with no fishing attached — the pond swallowing something. The
  // rings run whether or not a line is out, so anyone may borrow one.
  splashAt(dir, size = 1.2) {
    this.bobDir.copy(dir).normalize();
    this.bobPos.copy(this.bobDir).multiplyScalar(this.R + FLOAT_AT);
    this._splash(this._now, size);
  }

  _splash(now, size = 1) {
    const ring = this.rings.find((r) => !r.live) || this.rings[0];
    ring.live = true;
    ring.at = now;
    ring.size = size;
    ring.mesh.position.copy(this.bobPos);
    ring.mesh.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.bobDir);
    ring.mesh.rotateX(-Math.PI / 2);
    ring.mesh.visible = true;
  }

  update(now, playerDir, camera) {
    this._now = now;
    if (!this.active) { this._rings(now); return; }

    // Walking off mid-cast reels in — the line is not a leash. So does leaving
    // the ground: the rod does not come to the sky.
    if (playerDir.dot(this.castAnchor) < Math.cos(0.35 / this.R)
      || !this.globe.fish) {
      this.cancel();
      return;
    }

    const R = this.R;
    this.bobPos.copy(this.bobDir).multiplyScalar(R + FLOAT_AT);

    if (this.state === 'cast') {
      // The lob: the line's far end flies from your corner out to the spot,
      // peaking halfway. The float itself only appears at the far end of it,
      // with the splash it earned.
      const t = Math.min(1, (now - this.stateAt) / CAST_MS);
      if (t >= 1) {
        this.state = 'wait';
        this.stateAt = now;
        this.bobber.visible = true;
        this.bobber.position.copy(this.bobPos);
        this.bobber.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.bobDir);
        this._splash(now, 0.8);
      } else {
        this._lineTo(camera, this._castPoint(camera, t), t * 0.8);
      }
    }

    if (this.state === 'wait' || this.state === 'bite') {
      // The float idles on the water; on the bite it is pulled under by the
      // mouth on the other end — a dip, not a wobble, because a dip is the one
      // thing floating debris never does on its own.
      const dip = this.state === 'bite' ? 0.085 : Math.sin(now / 560) * 0.012;
      this.bobber.position.copy(this.bobDir).multiplyScalar(R + FLOAT_AT - dip);
      this._lineTo(camera, this.bobber.position, 1);

      if (this.state === 'wait') {
        // The take is staged: the lure goes out ahead of the bite so the fish
        // arrives as it happens — see lureLead in config.
        if (!this.lureSent && now > this.biteAt - CONFIG.fishing.lureLead) {
          this.lureSent = true;
          const uv = this.globe.fish.toUV(this.bobDir);
          if (uv) this.lured = this.globe.fish.lure(uv.u, uv.v);
        }
        if (now >= this.biteAt) {
          this.state = 'bite';
          this.stateAt = now;
          this._splash(now, 0.6);
        }
      } else if (now - this.stateAt > CONFIG.fishing.biteWindow) {
        // Thought better of it. The fish leaves, the float pops back up, and
        // the wait starts over — the session is yours to end, not the fish's.
        this.globe.fish.spook(this.lured);
        this.lured = null;
        this.lureSent = false;
        this.state = 'wait';
        this.stateAt = now;
        this._scheduleBite(now);
      }

      // The 「!」stands over the float for exactly the window, faced to you.
      if (this.state === 'bite') {
        this.exclaim.visible = true;
        const pop = Math.min(1, (now - this.stateAt) / 120);
        this.exclaim.position.copy(this.bobDir)
          .multiplyScalar(R + FLOAT_AT + 0.42 + 0.06 * pop);
        this.exclaim.scale.setScalar(0.5 + 0.5 * pop * (2 - pop));
        this.exclaim.quaternion.copy(camera.quaternion);
      } else {
        this.exclaim.visible = false;
      }
    }

    if (this.state === 'reveal') {
      const ms = now - this.stateAt;
      const card = this.catchCard;
      // The card is a unit square, so every step of the reveal scales the
      // species' own size rather than setting a scalar — see catchSize.
      const grow = (k) => card.scale.set(this.catchSize.x * k, this.catchSize.y * k, 1);
      if (ms < REVEAL_RISE) {
        // Out of the water, wagging — the ぴちぴち a fresh catch does.
        const t = ms / REVEAL_RISE;
        card.position.copy(this.bobDir).multiplyScalar(R + FLOAT_AT + t * 0.85);
        card.rotation.z = Math.sin(ms / 55) * 0.28 * (1 - t * 0.5);
        grow(0.6 + 0.4 * t);
      } else if (ms < REVEAL_HOLD) {
        card.position.copy(this.bobDir).multiplyScalar(R + FLOAT_AT + 0.85);
        card.rotation.z = Math.sin(ms / 90) * 0.08;
        grow(1);
      } else if (ms < REVEAL_DONE) {
        const t = (ms - REVEAL_HOLD) / (REVEAL_DONE - REVEAL_HOLD);
        if (this.kept) {
          // Away to the pouch's corner of the screen, shrinking as it goes.
          this._v.copy(ROD_AT);
          camera.localToWorld(this._v);
          this._v2.copy(this.bobDir).multiplyScalar(R + FLOAT_AT + 0.85);
          card.position.copy(this._v2).lerp(this._v, t * t);
          grow(1 - 0.7 * t);
          card.material.opacity = 1 - t * t;
        } else {
          // NO ROOM: it goes back. Straight down to the water it came out of,
          // and a splash to say so — shown rather than announced, because this
          // world has no way of telling you anything and does not need one. A
          // fish sliding out of your hands is a thing you can read at a glance.
          card.position.copy(this.bobDir)
            .multiplyScalar(R + FLOAT_AT + 0.85 * (1 - t * t));
          grow(1 - 0.35 * t);
          card.material.opacity = 1 - t * t * t;
          if (!this._splashedBack && t > 0.72) {
            this._splashedBack = true;
            this._splash(now, 1.0);
          }
        }
      } else {
        card.visible = false;
        this.state = 'idle';
        this._splashedBack = false;
        // Reported either way, with whether it stayed. It is still counted in
        // the 図鑑 when it gets away: you landed it and you saw what it was,
        // which is what that tally is a record of.
        if (this.hooks.onCatch) this.hooks.onCatch(FISH_ITEM[this.species], this.kept);
      }
      card.quaternion.copy(camera.quaternion);
      if (ms < REVEAL_HOLD) card.rotation.z = Math.sin(ms / 70) * 0.18;
    }

    this._rings(now);
  }

  // Where the line's far end is mid-cast: along the great arc from your feet
  // to the spot, lifted by a lob that peaks in the middle.
  _castPoint(camera, t) {
    this._v.copy(this.castAnchor).lerp(this.bobDir, t).normalize()
      .multiplyScalar(this.R + FLOAT_AT + Math.sin(t * Math.PI) * CAST_LOB);
    return this._v;
  }

  // The line itself: a bow from the rod corner to `end`, sagging toward the
  // planet. Sag scaled by `slack` so a flying cast pulls straighter than a
  // resting one.
  _lineTo(camera, end, slack) {
    const pos = this.lineGeo.attributes.position;
    this._v2.copy(ROD_AT);
    camera.localToWorld(this._v2);
    const start = this._v2;
    for (let i = 0; i <= LINE_SEGS; i++) {
      const t = i / LINE_SEGS;
      this._e.copy(start).lerp(end, t);
      // Hang: deepest mid-span, none at the ends, pulled toward the centre of
      // the planet because that is what down means here.
      const hang = Math.sin(t * Math.PI) * LINE_SAG * slack;
      const len = this._e.length();
      this._e.multiplyScalar((len - hang) / len);
      pos.setXYZ(i, this._e.x, this._e.y, this._e.z);
    }
    pos.needsUpdate = true;
  }

  _rings(now) {
    for (const ring of this.rings) {
      if (!ring.live) continue;
      const t = (now - ring.at) / 900;
      if (t >= 1) { ring.live = false; ring.mesh.visible = false; continue; }
      const grow = 1 - (1 - t) * (1 - t);
      ring.mesh.scale.setScalar((0.15 + grow * 0.75) * (ring.size || 1));
      ring.mesh.material.opacity = (1 - t) * 0.9;
    }
  }
}
