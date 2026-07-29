// A character: a flat card carrying a drawn sheet, billboarded to face the
// camera.
//
// Materially identical to the scenery — depth tested, depth-write off, sorted
// back to front by the scene. That means the planet occludes them the same way
// it occludes a tree: they sink behind the curve rather than fading out.
//
// The face used to be assembled here from separate eye, mouth, blush and arm
// cards laid over a painted silhouette, which is how one drawing could pull
// seven expressions. Drawn art brings its own face, so an expression is now a
// whole sheet and the card is a single plane. Characters render whatever sheets
// they have and fall back to the resting face for the rest, so the cast can be
// half-drawn without anything breaking — see cast.js.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  UP, surfacePoint, orientBillboard, localFrame, dirFromLatLon, inLake, lakeReach,
  inBuilding, keepOutside, groundCap, SHADOW_LIFT,
  inSolid, keepOffSolids,
} from './sphere.js';
import { paintSheet, sheetBounds, paintShadow, EXPRESSIONS } from './art.js';
import { IMG } from './assets.js';
import { WATER_STENCIL } from './water.js';

function clampUnit(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _lake = new THREE.Vector3();
const _away = new THREE.Vector3();
const _dest = new THREE.Vector3();
const _probe = new THREE.Vector3();
// The detour's own scratch, kept apart from the rest because _pickTarget writes
// _east, _north and _dest itself — and the detour calls it in a loop.
const _dEast = new THREE.Vector3();
const _dNorth = new THREE.Vector3();
const _dAim = new THREE.Vector3();
const _dTry = new THREE.Vector3();

// How far off the straight line to try when an errand's path is refused, in
// radians of bearing, nearest first and alternating sides.
//
// Alternating matters more than the spacing: a character who always tried the
// left first would file past every obstacle the same way round, which on a
// planet with one path worn between two houses is a rut you can see. Taking
// whichever side clears first is what makes two trips past the same tree look
// like two trips.
//
// It stops at 1.4, which is the last offset that still carries you FORWARD:
// a step taken 1.4 radians off your bearing still closes the gap by cos(1.4),
// a sixth of its length, while one at 2.2 opens it by a half. That is not a
// detour, it is walking away — and it showed as exactly that, a guest a unit
// from the cushion being sent back across the room by his own attempt to reach
// it. A character who cannot find a way within 80 degrees of where they mean
// to go is better off waiting a beat and asking again from wherever the world
// has moved to.
const DETOUR = [0.45, -0.45, 0.9, -0.9, 1.4, -1.4];

// How many places along a planned walk get checked for water, for latitude, and
// for the props you cannot walk through.
//
// Enough that a lake cannot fit between two of them: the longest trip is
// roamMax and the smaller lake is about 2.7 units across at this radius, so
// eight steps put the samples a unit apart at worst.
//
// The props are much smaller than that and it still holds, which is worth
// writing down because the arithmetic says otherwise and the arithmetic is
// leaving something out. A missed chord of length d cuts about d²/8r into a
// circle of radius r, so one sample per unit ought to clip a stump by a quarter
// of a unit. It does not, because what these samples test is not the prop but
// the prop plus wander.wallKeep — a 0.72-unit berth, wider than the error. A
// path that grazes the BERTH between two samples is still most of a stride clear
// of the thing itself. Measured over 4000 random trips: nothing clipped a prop
// at eight samples, and nothing clipped one at thirty-two either, so the finer
// sampling was reverted as cost without a benefit.
const PATH_STEPS = 8;

// How many renderOrder slots one character reserves. The scene hands out a base
// per character each frame from a depth sort. One slot, because the card is all
// there is to order — it was 3 to leave room above for the sleeping Zzz, which
// no longer exists. Raise it again the moment a character grows a second mesh.
export const RENDER_SPAN = 1;

// The shadow is the same for everybody, so it is painted once.
const texCache = new Map();
const canvasCache = new Map();

function texFrom(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function cachedTex(key, paint) {
  let t = texCache.get(key);
  if (!t) {
    t = texFrom(paint());
    texCache.set(key, t);
  }
  return t;
}

function cachedCanvas(key, paint) {
  let c = canvasCache.get(key);
  if (!c) {
    c = paint();
    canvasCache.set(key, c);
  }
  return c;
}

// Where a reflection draws: after the water body, which is what writes the
// stencil that confines it, and before the glints, which lie on top of
// everything in the pond including whoever is being reflected in it. The
// characters themselves start at 10 — see setRenderBase — so a reflection can
// never be sorted in among them.
const REFLECTION_ORDER = 5;

function spriteMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export class Character {
  constructor(spec) {
    this.spec = spec;
    this.key = spec.key;
    // Steered from outside rather than by _wander — the player's body. The rig
    // hands standAt a spot every frame; nothing in here decides where it goes.
    this.driven = !!spec.driven;

    const sheets = IMG.sheets[spec.key];

    // The resting sheet is the one everything is measured from: it sets the
    // plane, where the feet are, where the head stops, and which pixels a tap
    // can land on. Other expressions share all of that.
    const bodyCanvas = cachedCanvas(`sheet|${sheets.normal.src}`, () => paintSheet(sheets.normal));
    const bounds = sheetBounds(bodyCanvas);

    // scale is a width, and height follows the drawing's own proportions — so
    // Usagi's ears make Usagi taller without a number here saying so. Deriving
    // from the source width rather than the pixel count also means redrawing
    // the same character at a higher resolution changes nothing but sharpness.
    this.px2world = (CONFIG.bodyPlane * spec.scale) / sheets.normal.naturalWidth;
    // `standoff` — how far the card lifts off the surface once the camera is
    // overhead enough that "up" has nowhere to point, see orientBillboard — now
    // comes off the worn pose along with the rest of the measurements, since a
    // glide card is taller than a standing one and would otherwise be lifted by
    // somebody else's height. Set by _wearPose.

    // root carries position only and is never rotated, so the billboard child
    // can be given a world orientation directly.
    this.root = new THREE.Group();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.dir = new THREE.Vector3(0, 1, 0);
    this.home = new THREE.Vector3(0, 1, 0);
    this.target = new THREE.Vector3(0, 1, 0);
    this.walking = false;
    this.restUntil = 0;
    this.walkPhase = 0;
    this.attentive = false;   // set by main: true for whoever you came to see
    this.busyUntil = 0;       // stopped to talk to one of the others

    // There is no "which world" field any more, because there is only one
    // world: indoors is a place you stand, not a stage you are on. Anyone who
    // needs to know whether they are under the roof asks where they are —
    // see Globe.isInside.
    //
    // Somewhere they have decided to walk to, overriding the random stroll —
    // set by household.js when they head home. Absolute, and re-aimed on every
    // leg, so a trip that stops short at a lake simply carries on next time
    // instead of stalling.
    this.errand = null;
    // 0 makes them gone. The threshold fade, and the only thing that draws them
    // at anything but full strength.
    this.fade = 1;
    this._fadeAt = 1;

    this.billboard = new THREE.Group();
    this.root.add(this.billboard);

    // The shadow does not face the camera — it lies on the planet, so it needs
    // its own holder aligned to the surface normal. Sized off the drawn width
    // rather than the sheet's, so padding and empty margin never widen it.
    const drawnW = (bounds.maxX - bounds.minX + 1) * this.px2world;
    this.shadowHolder = new THREE.Group();
    this.root.add(this.shadowHolder);
    this.shadow = new THREE.Mesh(
      // A cap of the planet, not a disc laid across it: at this size a flat one
      // stands its rim a further hundredth clear of the grass than its middle,
      // and a camera at knee height sees exactly that gap. groundCap carries the
      // lift and the lie-down that used to be set on the mesh here.
      groundCap(CONFIG.globe.radius, drawnW * 0.9, drawnW * 0.9, SHADOW_LIFT),
      spriteMaterial(cachedTex('shadow', paintShadow)),
    );
    // Biased toward the camera as well as lifted: a decal this close to a
    // curved surface tears into it otherwise.
    this.shadow.material.polygonOffset = true;
    this.shadow.material.polygonOffsetFactor = -4;
    this.shadow.material.polygonOffsetUnits = -8;
    this.shadowHolder.add(this.shadow);

    // --- sheets
    // One texture per distinct image, not per expression: an expression with no
    // sheet of its own resolves to the resting one, and there is no reason to
    // hold the same pixels on the GPU twice because two names point at them.
    const byImage = new Map();
    const sheetTex = (img) => {
      let t = byImage.get(img);
      if (!t) {
        t = texFrom(cachedCanvas(`sheet|${img.src}`, () => paintSheet(img)));
        byImage.set(img, t);
      }
      return t;
    };

    this.sheet = {};
    for (const name of EXPRESSIONS) this.sheet[name] = sheetTex(sheets[name] || sheets.normal);
    this.blinkTex = sheets.blink ? sheetTex(sheets.blink) : null;

    // Sitting is a POSTURE, not an expression, and the difference decides how
    // it is drawn. An expression is what the face is doing and changes with
    // every line; a posture is what the body is doing and lasts as long as they
    // are on the seat. Folding it into EXPRESSIONS would have somebody stand
    // straight up the moment they said something happy.
    //
    // One sheet covers every expression while seated, which is a deliberate
    // trade: it costs one drawing per character instead of one per expression
    // per character, and the price is that a seated character keeps one face.
    // Until that drawing exists this is null and they sit in their standing
    // sheet, sunk — see CONFIG.interior.sitSink. Draw `<key>-sit.png`, add 'sit' to
    // that character's `sheets` in cast.js, and it starts being used with no
    // other change anywhere.
    this.sitTex = sheets.sit ? sheetTex(sheets.sit) : null;
    this.posture = 'stand';
    this.seatY = 0;

    // A posture brings its OWN plane, because a posture is a different body.
    //
    // Everything above shares one plane on purpose: an expression is a face, the
    // silhouette barely moves, and one plane is what lets a character be
    // half-drawn. A glide is not that. The momonga's glide sheet is 1041x1457
    // against a 1041x1069 resting sheet — arms out is genuinely a different
    // shape — and hanging it on the standing plane squashes it to 73% of its
    // height, which on a drawing whose whole subject is a stretched-out creature
    // is the one distortion that ruins it.
    //
    // So each posture is measured into its own entry here: a plane cut to that
    // drawing's proportions, and the foot offset and drawn height read off that
    // drawing's own pixels. `px2world` is shared, so the two are at one scale
    // and a wider or taller canvas simply buys a wider or taller card rather
    // than a bigger character.
    const measure = (canvas) => {
      const b = sheetBounds(canvas);
      const footPx = b.maxY + 1;
      return {
        geo: new THREE.PlaneGeometry(canvas.width * this.px2world, canvas.height * this.px2world),
        // Lift the sheet so the feet land on the ground rather than its texture
        // centre. The feet are the bottom of the drawn pixels.
        footOffset: (footPx - canvas.height / 2) * this.px2world,
        // Highest drawn pixel, measured up from the feet — so the bubble sits
        // above the ears rather than above an arbitrary texture edge, and a
        // taller drawing gets a taller anchor without anyone here saying so.
        //
        // NOT footOffset plus that. footOffset is how far the sheet had to be
        // raised to stand its feet on the ground, and once it has been, the feet
        // ARE the origin — adding it again counted it twice and floated the
        // anchor a whole footOffset clear of the ears. Chiikawa's is 1.01
        // against a 2.02-unit body, so the bubble hung half a character above
        // the head.
        headTop: (footPx - b.minY) * this.px2world,
        standoff: (canvas.height * this.px2world) / 2,
      };
    };

    this.pose = { stand: measure(bodyCanvas) };
    if (sheets.fly) {
      this.flyTex = sheetTex(sheets.fly);
      this.pose.fly = measure(cachedCanvas(`sheet|${sheets.fly.src}`, () => paintSheet(sheets.fly)));
    } else {
      this.flyTex = null;
    }

    this.bodyMesh = new THREE.Mesh(
      this.pose.stand.geo,
      spriteMaterial(this.sheet.normal),
    );
    this.billboard.add(this.bodyMesh);

    // WHAT THEY LOOK LIKE IN THE WATER. The same card, upside down, hanging
    // from their feet — which for a billboard is not a trick standing in for a
    // reflection, it IS the reflection: mirroring a flat upright card in a
    // horizontal plane through its base gives exactly this, and the card is
    // already square to the viewer so the mirrored one is too.
    //
    // A true mirror — rendering the scene again from behind the water — was the
    // alternative and is wrong here twice over. It costs a second pass of
    // everything on a phone, and it would be photographically correct in a world
    // that is deliberately not: paper actors would come back as paper actors,
    // reflected perfectly, which reads as a bug rather than as water.
    //
    // It hangs BELOW the ground, inside the planet, so nothing about it works by
    // ordinary depth testing — see how scene.js confines it with the stencil the
    // water writes. That is also why it is built here but switched on from
    // there: this file knows how to make a character's second card, and has no
    // business knowing where the ponds are.
    this.reflection = new THREE.Mesh(this.pose.stand.geo, spriteMaterial(this.sheet.normal));
    this.reflection.scale.y = -1;
    this.reflection.visible = false;
    // depthTest OFF, because the thing it would be tested against is the planet
    // it is inside. What replaces it is the stencil: draw only where the water
    // stamped itself, which is only where the water can be seen. See the note in
    // water.js for why that single test does the work of both a clip to the
    // pond's outline and an occlusion check against whatever is standing in
    // front of it.
    const rm = this.reflection.material;
    rm.depthTest = false;
    rm.opacity = 0;
    rm.stencilWrite = true;
    rm.stencilRef = WATER_STENCIL;
    rm.stencilFunc = THREE.EqualStencilFunc;
    rm.stencilFail = THREE.KeepStencilOp;
    rm.stencilZFail = THREE.KeepStencilOp;
    rm.stencilZPass = THREE.KeepStencilOp;
    this.reflection.renderOrder = REFLECTION_ORDER;
    this.billboard.add(this.reflection);

    this._wearPose('stand');

    // Alpha readback so a tap on a transparent corner misses the character.
    // Silhouettes barely move between expressions, so the resting sheet's
    // pixels stand in for all of them.
    this.alpha = bounds.data;

    // A Zzz floated here while they dozed at night, and `asleep` above was what
    // switched it on. The cast does not sleep at all now — night is when they
    // are out under the stars — so both are gone rather than left as a flag
    // nothing ever sets. `plane()` went with it: the body and the shadow build
    // their own meshes, and it had no third caller.
    this.expression = 'normal';
    this.talking = false;
    this.blinkUntil = 0;
    this.nextBlink = 1800 + Math.random() * 2600;
    this._blinking = false;
    this._onScreen = true;
    this._talkBob = 0;
    // The answering hop, when the visitor hops nearby: how long until it
    // starts, how far into it we are, and the lift it is currently adding to
    // the body. The wait is a COUNTDOWN in the body's own dtMs, not a deadline
    // on anybody's clock — the app runs on two clocks (performance.now() in
    // the pointer handlers, the frame timestamp everywhere else) that agree
    // live and drift apart the moment hidamari.step drives frames by hand,
    // and a deadline set on one and checked on the other simply never comes.
    this._hopWait = 0;
    this._hopT = -1;
    this._hopY = 0;

    this._camDir = new THREE.Vector3();
    this.setRenderBase(10);
    this.setExpression('normal');
  }

  get object3D() { return this.root; }
  // Whether the planet's curve has swallowed them. The depth buffer does the
  // actual hiding; this is for the logic that needs to know — who may speak,
  // and who can be tapped.
  get isVisible() { return this._onScreen; }

  get tintables() {
    return [this.bodyMesh.material, this.shadow.material];
  }

  // Whether they are standing close enough to water to be in it, and what the
  // water is doing to them. Called by scene.js, which is the only thing that
  // knows where the ponds are.
  //
  // `colour` is what to mix them toward and `amount` how far — a reflection is
  // not the character dimmed, it is the character seen THROUGH the surface, so
  // it takes the water's colour as well as its own. Written to the material's
  // colour rather than an overlay, since a MeshBasicMaterial multiplies its map
  // by it and that is exactly the operation wanted.
  //
  // The fade is on OPACITY and not on visibility, so somebody walking up to a
  // pond arrives in it rather than appearing in it.
  setReflection(colour, amount, opacity) {
    const on = opacity > 0.004;
    this.reflection.visible = on && this._onScreen;
    if (!on) return;
    this.reflection.material.opacity = opacity * this.fade;
    this.reflection.material.color.copy(this.bodyMesh.material.color).lerp(colour, amount);
  }

  placeAt(lat, lon, radius) {
    surfacePoint(lat, lon, 1, this.dir).normalize();
    this.home.copy(this.dir);
    this.restUntil = 600 + Math.random() * 3000;
    this._sync(radius);
  }

  // Answer a hop with a hop, `delayMs` from now — a beat chosen by the caller,
  // because the pause is what makes it an answer rather than a mirror. One at
  // a time: a character already answering, or already booked to, ignores the
  // new one rather than queueing a backlog of bounces to work through after
  // the visitor has stopped finding it funny. Landing re-arms immediately, so
  // trading hop for hop works at any rhythm a thumb can keep.
  hopBack(delayMs) {
    if (this._hopT >= 0 || this._hopWait > 0) return;
    this._hopWait = Math.max(1, delayMs);
  }

  // Position on the sphere is kept as a unit direction, because wandering is a
  // rotation of that direction — far easier than nudging latitude and
  // longitude, which misbehave near the poles.
  _sync(radius) {
    this.root.position.copy(this.dir).multiplyScalar(radius);
    this.normal.copy(this.dir);
    this.shadowHolder.quaternion.setFromUnitVectors(UP, this.normal);
  }

  // The scene hands out a fresh base every frame from a back-to-front sort.
  setRenderBase(base) {
    this.bodyMesh.renderOrder = base;
  }

  // Where the speech bubble's tail points.
  //
  // Up the BILLBOARD's own axis, not the surface normal. The two are the same
  // thing on foot — orientBillboard leaves up on the normal there, and this was
  // measured landing on the identical pixel — but in the far view they come
  // apart completely: the card swings its up round to the camera's while the
  // normal turns to point straight down the lens at you. Offset along the
  // normal from overhead, the whole 2.3 units collapsed to under two pixels of
  // screen. The anchor sat on the character's feet and the bubble was drawn
  // over the top of them, which is exactly what it looked like.
  //
  // billboard.position carries orientBillboard's standoff lift, which is part
  // of where the card actually is once it has gone face-on, so it comes too.
  // Both it and the quaternion are set in root's frame, and root is never
  // rotated, so this needs no basis change on the way out.
  //
  // The breath scale is deliberately left off: it would pulse the bubble by a
  // hundredth of a unit to no visible end.
  headWorld(out) {
    out.set(0, this.headY, 0).applyQuaternion(this.billboard.quaternion);
    return out.add(this.root.position).add(this.billboard.position);
  }

  // ------------------------------------------------------------- expression

  setExpression(name) {
    this.expression = name;
    this._sheetTex = this.sheet[name] || this.sheet.normal;
    this._applySheet();
  }

  _applySheet() {
    // A POSTURE sheet wins outright while it exists — it is one drawing for the
    // whole posture, so there is no expression and no blink to overlay on it.
    // With no such sheet this falls through and they sit, or glide, in whatever
    // their face is doing, which is the half-drawn state the whole cast is
    // designed to survive.
    const posed = (this.posture === 'sit' && this.sitTex) ? this.sitTex
      : (this.posture === 'fly' && this.flyTex) ? this.flyTex
        : null;
    const tex = posed
      || ((this._blinking && this.blinkTex) ? this.blinkTex : this._sheetTex);
    if (this.bodyMesh.material.map === tex) return;
    this.bodyMesh.material.map = tex;
    this.bodyMesh.material.needsUpdate = true;
    // Whatever face they are wearing, the water is wearing it too. Blinking at
    // your own reflection and having it not blink back is the sort of thing
    // nobody could name but everybody would feel.
    this.reflection.material.map = tex;
    this.reflection.material.needsUpdate = true;
  }

  // Put on a posture's plane and the measurements that go with it. The
  // geometries are all built up front, so this is an assignment rather than a
  // rebuild — a posture can change on any frame without a hitch.
  //
  // Falling back to the standing entry is what lets a posture exist before its
  // drawing does: an undrawn posture keeps the standing card and the standing
  // numbers, and _applySheet keeps the standing face to go on it.
  _wearPose(name) {
    const p = this.pose[name] || this.pose.stand;
    this.bodyMesh.geometry = p.geo;
    this.bodyMesh.position.y = p.footOffset;
    // The same plane, hung the other way. `footOffset` lifts a card so its feet
    // land on the billboard's origin; negating it drops the flipped copy so its
    // feet land there too, which is the waterline. A taller posture therefore
    // reaches further down into the pond without being told to.
    this.reflection.geometry = p.geo;
    this.reflection.position.y = -p.footOffset;
    this.footOffset = p.footOffset;
    this.headTop = p.headTop;
    this.headY = p.headTop + CONFIG.dialogue.bubbleLift;
    this.standoff = p.standoff;
  }

  _setPosture(name) {
    if (this.posture === name) return;
    this.posture = name;
    this._wearPose(name);
    this._applySheet();
  }

  setTalking(on) { this.talking = on; }

  // Where a ray lands on them, or null. Used for tapping someone to go and see
  // them; the alpha check means a tap on a transparent corner misses.
  hitTest(raycaster) {
    if (!this._onScreen) return null;
    const hits = raycaster.intersectObject(this.bodyMesh, false);
    if (!hits.length || !hits[0].uv) return null;
    const { x: u, y: v } = hits[0].uv;
    const w = this.alpha.width;
    const h = this.alpha.height;
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    if (this.alpha.data[(py * w + px) * 4 + 3] < 24) return null;
    return hits[0].point.clone();
  }

  // --------------------------------------------------------------- wandering

  // A short stroll in some direction from where they are standing now. The
  // frame comes from the current position rather than home, which is what
  // turns this into a walk across the planet instead of pacing a patch.
  // `aim` is somewhere they have been told to go; without it the trip is the
  // usual short stroll in a random direction. Everything after the pick — the
  // pole clamp, the water, the walls, the path probe — applies to both, which
  // is the point of taking the argument rather than writing a second method:
  // a character walking home has to be kept out of a lake exactly as much as
  // one wandering into the same lake by chance.
  _pickTarget(aim) {
    const cfg = CONFIG.wander;
    const R = CONFIG.globe.radius;

    // The prop the destination itself stands in, if any. Exempt from the fence
    // and from the path check below, for the reason written at each.
    const goal = aim ? inSolid(aim, 0) : null;

    if (aim) {
      this.target.copy(aim).normalize();
    } else {
      const a = Math.random() * Math.PI * 2;
      const arc = (cfg.roamMin + Math.random() * (cfg.roamMax - cfg.roamMin)) / R;

      localFrame(this.dir, _east, _north);
      this.target.copy(this.dir).multiplyScalar(Math.cos(arc))
        .addScaledVector(_north, Math.sin(arc) * Math.cos(a))
        .addScaledVector(_east, Math.sin(arc) * Math.sin(a))
        .normalize();
    }

    // Turn back from the poles rather than piling up on them, where the local
    // frame degenerates and the player cannot follow anyway.
    //
    // What is left after capping y has to be rescaled to fill the rest of the
    // unit sphere, NOT normalized. Normalizing divides the whole vector by a
    // length under one, which puts y straight back most of the way to where it
    // was: measured, a target at y 0.98 came out at 79.2 degrees against a
    // 71.6 degree limit, and the nearer the pole the less the clamp did — at
    // the pole itself, nothing whatsoever. This is a clamp that quietly was not
    // one, so they could drift onto exactly the spot it exists to keep clear.
    const maxY = Math.sin(cfg.maxLat);
    if (Math.abs(this.target.y) > maxY) {
      const flat = Math.hypot(this.target.x, this.target.z);
      const room = Math.sqrt(Math.max(0, 1 - maxY * maxY));
      if (flat > 1e-6) {
        this.target.x *= room / flat;
        this.target.z *= room / flat;
      } else {
        // Aimed dead at the pole, so there is no meridian to keep. Any will do.
        this.target.x = room;
        this.target.z = 0;
      }
      this.target.y = Math.sign(this.target.y) * maxY;
    }

    // And out of the water. A target that lands in a lake gets slid to its
    // near rim rather than rerolled, so they still head the way they meant to.
    const keep = cfg.waterKeep;
    for (const lake of CONFIG.lakes) {
      if (!inLake(this.target, lake, keep)) continue;
      dirFromLatLon(lake.lat, lake.lon, _lake);
      _away.copy(this.target).addScaledVector(_lake, -this.target.dot(_lake));
      if (_away.lengthSq() < 1e-8) {
        localFrame(_lake, _east, _north);
        _away.copy(_north);
      }
      _away.normalize();
      // How far the rim is *in this direction*, since a lake is an ellipse and
      // its near shore is a different distance out depending which way you came.
      const edge = lakeReach(lake, _away, keep);
      this.target.copy(_lake).multiplyScalar(Math.cos(edge))
        .addScaledVector(_away, Math.sin(edge)).normalize();
    }

    // ...and out of the buildings, which is the same rule with a simpler shape:
    // a trip that ended inside the house would walk them at a wall they cannot
    // pass and leave them shoving at it until the rest arrived. They have no
    // door to open — going indoors is not something they can do yet — so for
    // them a wall is only ever a wall.
    keepOutside(this.target, CONFIG.wander.wallKeep);

    // ...and out of the trees, which is the same rule again with a smaller
    // circle. They have to keep off these for a reason the walls never had:
    // you can SEE them do it. A friend strolling through a trunk while you are
    // stopped by the same trunk is the one arrangement worse than nobody being
    // stopped at all, because it says the rule is about you rather than about
    // the world.
    // ...except the one they were SENT to. A destination handed to somebody is
    // a destination they are allowed to reach, and the seats in both homes are
    // cushions — which are props, which this fence would otherwise push them
    // off. Measured before it did: a guest crept toward a cushion an eighth of
    // the remaining distance at a time, closing half a unit in forty seconds,
    // and gave up a unit short every single visit.
    keepOffSolids(this.target, CONFIG.wander.wallKeep, goal);

    // The walk as well as its destination, for both of the rules above.
    //
    // Keeping only the far end dry is not the same as staying out of the water:
    // a trip is a great circle up to roamMax long — 8 units — against a lake
    // under 4 across, so a destination safely on the near shore of one still
    // marched them through the middle of it. And keeping only the far end
    // inside maxLat is not the same as staying off the poles: the shortest path
    // between two high latitudes goes over the top, measured at 85.9 degrees of
    // transit against a 71.6 degree limit. Both fences were only ever checked at
    // the place the walk stopped.
    //
    // Walked in a few steps rather than solved: the first bad one pulls the
    // target back to the last good one, so they halt short and pick again after
    // a brief rest. Normalising a lerp between two unit vectors lands on the
    // great circle they are actually going to walk, which is all this needs —
    // the spacing being uneven costs nothing at this count.
    //
    // The pole limit relaxes to wherever they already stand, because a walk can
    // be interrupted mid-transit — by you arriving, or by nightfall — and leave
    // somebody parked outside the fence. Pinned against an absolute limit they
    // could never pick a first step back down and would stay there for good.
    const poleLimit = Math.max(maxY, Math.abs(this.dir.y));
    _dest.copy(this.target);
    const wall = CONFIG.wander.wallKeep;
    // The prop whose berth they are already inside, and how much of that berth
    // they actually have. It is the pole limit's relaxation again, for the pole
    // limit's reason: a walk gets interrupted mid-transit — by you arriving, by
    // an errand home — and a berth that ends up under somebody's feet must not
    // be one they can never take a first step out of. Ejecting them instead
    // would be worse, because a character sliding a stride sideways on their own
    // is something you can watch happen, where walking out is just walking.
    //
    // WHAT IT RELAXES IS THE BERTH AND NEVER THE PROP, and that line is the
    // whole of it. The berth is 0.72 wide against props a third of that, so
    // standing somewhere in the band is both common and perfectly legal —
    // exempting the prop outright for anyone in it, which is the obvious reading
    // and the first thing tried, lets a character walk clean through the trunk
    // in the middle of their own berth. Measured that way over 4180 trips begun
    // in a berth, a quarter of them crossed the prop itself.
    //
    // Relaxing to the clearance they happen to have was the second try and fails
    // the other way: keeping a constant distance is what going AROUND something
    // is, so a rule of "never nearer than you are" refuses the tangent and
    // froze 42% of trips on the spot.
    //
    // The prop's own rim is the line that does both. Inside the berth they may
    // go round, out, or along; into the wood, never.
    //
    // Not quite never, and the residue is worth naming rather than implying it
    // away: the rim is tested at the eight samples and a chord between two of
    // them can still dip inside, which over the same 4180 trips happened 87
    // times and reached 0.33 of a unit. All of it needs a trip that BEGINS in a
    // berth, which is itself uncommon — targets are pushed to the berth's edge
    // and paths are trimmed to it, and neither of those leaves anybody within
    // it — and a third of a unit is inside the width of the card doing the
    // walking. From ordinary ground the same measurement is zero.
    const standing = inSolid(this.dir, wall);
    for (let i = 1; i <= PATH_STEPS; i++) {
      _probe.copy(this.dir).lerp(_dest, i / PATH_STEPS).normalize();
      const prop = inSolid(_probe, wall);
      const propOk = !prop
        || prop === goal
        || (prop === standing && _probe.angleTo(prop.dir) > prop.r);
      if (!this._inWater(_probe, keep)
        && !inBuilding(_probe, wall)
        && propOk
        && Math.abs(_probe.y) <= poleLimit) continue;
      this.target.copy(this.dir).lerp(_dest, (i - 1) / PATH_STEPS).normalize();
      break;
    }
  }

  // A way AROUND whatever refused the straight line to an errand. True if it
  // found one, with `target` already set to it.
  //
  // It is the same walk-and-trim `_pickTarget` already does, aimed off to one
  // side instead of at the destination: swing the bearing away from the errand
  // by a little, offer that as an ordinary trip, and take the first swing that
  // comes back with somewhere to go. Whatever it accepts has been through every
  // rule the direct line was — the water, the poles, the walls, the props —
  // because it is the same function doing the accepting.
  //
  // NOT PATHFINDING, and it should not become it. There is no plan here and
  // nothing is remembered: it gets the character MOVING in roughly the right
  // direction, and the next pick is made from wherever that left them, by which
  // time the obstacle is usually no longer in the way. What that buys over a
  // real route is that it costs nothing when nothing is wrong — this only runs
  // on a pick that already failed — and it cannot get out of step with the
  // world, because it never holds an opinion about the world for longer than
  // one step.
  //
  // The step is capped at `roamMax`, so a detour is an ordinary-length stroll
  // rather than a lunge at something twenty units off. That is what keeps a
  // character who is going round a tree from setting out across the planet on a
  // tangent: they sidestep, then re-aim.
  _detour(aim) {
    const cfg = CONFIG.wander;
    const R = CONFIG.globe.radius;
    // The bearing of the errand from where we are standing.
    _dAim.copy(aim).addScaledVector(this.dir, -aim.dot(this.dir));
    if (_dAim.lengthSq() < 1e-12) return false;      // stood on it already
    _dAim.normalize();
    localFrame(this.dir, _dEast, _dNorth);
    const base = Math.atan2(_dAim.dot(_dEast), _dAim.dot(_dNorth));
    const arc = Math.min(cfg.roamMax, this.dir.angleTo(aim) * R) / R;
    if (arc < 1e-4) return false;
    for (const off of DETOUR) {
      const a = base + off;
      _dTry.copy(this.dir).multiplyScalar(Math.cos(arc))
        .addScaledVector(_dNorth, Math.sin(arc) * Math.cos(a))
        .addScaledVector(_dEast, Math.sin(arc) * Math.sin(a))
        .normalize();
      // Offered as an ordinary destination, so it is fenced and trimmed exactly
      // as the direct line was. `localFrame` above is re-read every iteration
      // because this overwrites the module's own copy of it.
      this._pickTarget(_dTry);
      localFrame(this.dir, _dEast, _dNorth);
      if (this.dir.angleTo(this.target) > 1e-3) return true;
    }
    return false;
  }

  // Whether a direction sits in one of the lakes, with a margin.
  _inWater(dir, margin) {
    for (const lake of CONFIG.lakes) {
      if (inLake(dir, lake, margin)) return true;
    }
    return false;
  }

  // `watcher` is where you are STOOD — a surface direction and a height above
  // it — or null when you are not on the planet at all.
  //
  // It used to be derived from the camera here, and that was wrong in a way
  // that only showed once there was somewhere else to be. The camera is not the
  // player: it swings back off the overhead line as you rise, and once you are
  // indoors it is not even in this world's coordinates — normalising a position
  // inside the room gives a direction on the globe that means nothing, and the
  // whole cast was freezing and unfreezing against it while you were in the
  // house. Asking the rig where you stand is both honest and correct.
  _wander(dtMs, tMs, watcher) {
    const R = CONFIG.globe.radius;
    const cfg = CONFIG.wander;

    // Being visited, or you have walked right up to them: stay put.
    const dot = watcher ? this.dir.dot(watcher.dir) : -1;
    const playerHere = !!watcher && watcher.alt < cfg.noticeAlt && (
      (this.attentive && dot > Math.cos(cfg.noticeArc / R))
      || dot > Math.cos(cfg.closeArc / R)
    );
    if (tMs < this.busyUntil || playerHere) {
      if (this.walking) {
        this.walking = false;
        this.restUntil = tMs + cfg.interruptRest;
      }
      return;
    }

    if (!this.walking) {
      if (tMs < this.restUntil) return;
      this._pickTarget(this.errand);
      // A trip that came back empty was aimed into a lake, or over a pole, or
      // straight at a tree, and pulled back to where they already stand —
      // measured at 43% of picks made from a lake rim, since about half of
      // every direction there is water. Do not enter the walk cycle for it: try
      // again shortly instead of spending a full rest stood at the water's edge
      // with nowhere to go.
      //
      // AN ERRAND GETS ONE MORE CHANCE, and it is not a nicety — without it the
      // whole household was dead. A wander recovers from an empty pick for
      // free, because the next roll is a different random direction; an errand
      // cannot, because the target is handed to it and never changes. So one
      // obstacle anywhere near the first eighth of the route stopped a
      // character where they stood and kept stopping them until they gave up.
      // Measured on a walk to the cave: 118 picks, 117 of them empty, 19.6
      // units of the trip never walked. Nobody in this world had reached a home
      // they set out for in a hundred simulated minutes — at either house, and
      // in the build before the cave existed too.
      if (this.dir.angleTo(this.target) < 1e-3
        && !(this.errand && this._detour(this.errand))) {
        this.restUntil = tMs + cfg.interruptRest;
        return;
      }
      this.walking = true;
      return;
    }

    const step = (cfg.speed / R) * (dtMs / 1000);
    const ang = this.dir.angleTo(this.target);
    if (ang <= step || ang < 1e-4) {
      this.dir.copy(this.target);
      this.walking = false;
      this.restUntil = tMs + cfg.restMin + Math.random() * (cfg.restMax - cfg.restMin);
    } else {
      _axis.crossVectors(this.dir, this.target);
      if (_axis.lengthSq() < 1e-10) { this.walking = false; return; }
      _axis.normalize();
      this.dir.applyAxisAngle(_axis, step).normalize();
      this.walkPhase += dtMs;
    }
    this._sync(R);
  }

  // ----------------------------------------------------------------- update

  // The driven body's whole locomotion, replacing everything _wander decides
  // for the free cast. Where the feet are comes from the rig's anchor, and
  // whether to hop comes from whether that spot is actually travelling — which
  // the caller measures on the spot itself, so the stick, a tap-to-walk and
  // the far view sliding you round the globe all read as walking, because all
  // three move the same point.
  // `lift` holds the body off the grass, for the glide — and the shadow is
  // pushed back DOWN by the same amount rather than riding up with it, because
  // the shadow is the one thing that says how high you are. It hangs off the
  // root, which is what moved, so without the compensation it would climb with
  // the body and the two would never separate: a glider with its shadow stuck
  // to its feet is just a standing character drawn higher up.
  standAt(dir, dtMs, { walking = false, lift = 0, posture = 'stand' } = {}) {
    this.dir.copy(dir).normalize();
    if (walking) this.walkPhase += dtMs;
    this.walking = walking;
    this._setPosture(posture);
    this._sync(CONFIG.globe.radius + lift);
    // Back DOWN THE NORMAL, not down the holder's own y.
    //
    // root carries position only and is never rotated, so a child's position is
    // read in world axes however the child itself is turned — the holder's
    // quaternion aims its own contents at the surface, and does nothing for
    // where the holder sits. Setting `.y` therefore slid the shadow down the
    // planet's global vertical rather than down the local up: measured with the
    // body over the southern hemisphere, that put the shadow 10.83 units from
    // the centre of an 8-unit planet — off the surface entirely, and further out
    // than the body it belonged to.
    this.shadowHolder.position.copy(this.normal).multiplyScalar(-lift);
  }

  // Sit on a seat, given where it stands as a surface direction and how high
  // its surface is. The seat is on the planet like everything else now, so
  // sitting is standing at its spot lifted by its height, with the posture
  // sheet or the sink doing the rest.
  sitAt(dir, y) {
    this.dir.copy(dir).normalize();
    this.walking = false;
    this.errand = null;
    this._setPosture('sit');
    this.seatY = y;
    this._sync(CONFIG.globe.radius + y);
    // No ground shadow while they are off the ground. The seat casts its own,
    // and a second one directly under a character who is not standing on the
    // floor reads as them hovering.
    this.shadowHolder.visible = false;
  }

  standUp() {
    if (this.posture !== 'sit') return;
    this._setPosture('stand');
    this.seatY = 0;
    this._sync(CONFIG.globe.radius);
    this.shadowHolder.visible = true;
  }

  update(dtMs, tMs, camera, watcher = null) {
    const R = CONFIG.globe.radius;
    const camLen = Math.max(camera.position.length(), R + 0.01);

    this._camDir.copy(camera.position).normalize();
    // Wander first: everything below depends on where they ended up. Seated,
    // there is no wandering to do — standing up is the household's business,
    // and a stroll taken from a cushion would be a stroll through the seat.
    // Driven, there is none either: the rig already stood the body somewhere
    // this frame — see standAt.
    if (this.posture !== 'sit' && !this.driven) this._wander(dtMs, tMs, watcher);

    // Face the camera squarely, leaning away from whatever they are stood on.
    orientBillboard(this.billboard, this.root.position, this.normal, camera, this.standoff);

    // Stepping through a doorway, in one direction or the other.
    if (this._fadeAt !== this.fade) {
      this._fadeAt = this.fade;
      this.bodyMesh.material.opacity = this.fade;
      this.shadow.material.opacity = this.fade;
    }

    // Over the horizon the depth buffer already hides them, so this is only a
    // cull and a flag — generous, so it never clips anyone still on screen.
    //
    // The second term is exactly how far past the horizon something headTop
    // tall can stand and still have its topmost pixel on the sight line, so the
    // drawn height is the whole of it. It used to be 0.45 of headY, a fudge
    // fitted to a headY that was measuring a footOffset too high; with that
    // gone the same 0.45 would have quietly tightened the cull by 0.08 radians
    // and started clipping people who were still on screen.
    const reach = Math.acos(clampUnit(R / camLen))
      + Math.acos(clampUnit(R / (R + this.headTop)));
    const away = Math.acos(clampUnit(this.normal.dot(this._camDir)));
    const visible = away < reach + 0.10;
    if (visible !== this._onScreen) {
      this._onScreen = visible;
      this.billboard.visible = visible;
      this.shadowHolder.visible = visible;
    }
    if (!visible) return;
    this._animate(dtMs, tMs);
  }

  // Breathing, blinking, the talk bounce and the walk hop. Everything they do
  // that is not about where they are, which is why it is the one part both
  // worlds share unchanged — a character indoors is the same character.
  _animate(dtMs, tMs) {
    // A blink is a whole sheet now, so it only happens for a character who has
    // one drawn — and only over the resting face, since every other expression
    // already decided what the eyes are doing.
    if (this.blinkTex && this.expression === 'normal') {
      if (!this._blinking && tMs > this.nextBlink) {
        this._blinking = true;
        this.blinkUntil = tMs + 120;
        this.nextBlink = tMs + 2400 + Math.random() * 3000;
        this._applySheet();
      }
      if (this._blinking && tMs > this.blinkUntil) {
        this._blinking = false;
        this._applySheet();
      }
    } else if (this._blinking) {
      this._blinking = false;
      this._applySheet();
    }

    const breath = 1 + Math.sin(tMs / 3400 * Math.PI * 2) * 0.014;
    this.billboard.scale.set(breath, breath, 1);

    // The mouth used to flap while somebody spoke. A drawn face has no mouth to
    // move, so the tell is a small bounce instead — enough to pick out who is
    // talking from across the planet, which is what the flap was really for.
    //
    // Eased against the clock rather than by a fixed slice per frame, so the
    // bounce arrives at the same speed on a 120Hz phone as on a 60Hz one.
    const d = CONFIG.dialogue;
    const wantBob = this.talking ? Math.abs(Math.sin(tMs / 150)) * d.talkBob : 0;
    this._talkBob += (wantBob - this._talkBob) * (1 - Math.exp(-dtMs / d.talkBobMs));

    // The answering hop — see hopBack. Two bounces, the second at 0.45 of the
    // first and a shade quicker, which is the shape of "pleased" rather than
    // the shape of "jumped": one clean arc reads as copying the visitor, and a
    // creature this small being happy bounces. Each bounce is a half-sine, so
    // the pair land and take off again without a kink.
    //
    // Run inside _animate on purpose: anyone close enough to answer a hop is
    // well inside the visibility cull, and a bounce nobody can see is not
    // worth a timer that never sleeps.
    if (this._hopWait > 0) {
      this._hopWait -= dtMs;
      if (this._hopWait <= 0) { this._hopWait = 0; this._hopT = 0; }
    }
    if (this._hopT >= 0) {
      this._hopT += dtMs;
      const w = CONFIG.wander;
      const first = w.hopBackMs * 0.55;
      if (this._hopT < first) {
        this._hopY = Math.sin((this._hopT / first) * Math.PI) * w.hopBackAmp;
      } else if (this._hopT < w.hopBackMs) {
        this._hopY = Math.sin(((this._hopT - first) / (w.hopBackMs - first)) * Math.PI)
          * w.hopBackAmp * 0.45;
      } else {
        this._hopT = -1;
        this._hopY = 0;
      }
    }

    // How far the drawing drops to look seated. Only while there is no sitting
    // sheet: a drawing made for the job stands on its own base, and sinking it
    // as well would bury it in the furniture.
    const sink = (this.posture === 'sit' && !this.sitTex)
      ? this.headTop * CONFIG.interior.sitSink
      : 0;

    // A glide has no footfalls. Towed along by the leash the body genuinely IS
    // travelling, so `walking` is true and honest — but playing a walk cycle
    // through the air would be somebody running on nothing. The resting
    // branch's slow rise and fall carries it instead, which on a creature with
    // its arms out reads as riding the air rather than standing still.
    if (this.walking && this.posture !== 'fly') {
      // A hop and a sway rather than legs — they have none to animate.
      const cfg = CONFIG.wander;
      const p = (this.walkPhase / cfg.bobPeriod) * Math.PI * 2;
      this.bodyMesh.position.y = this.footOffset + Math.abs(Math.sin(p)) * cfg.bobAmp + this._talkBob;
      this.bodyMesh.rotation.z = Math.sin(p) * cfg.swayAmp;
    } else {
      this.bodyMesh.position.y = this.footOffset - sink
        + Math.sin(tMs / 1500) * 0.045 + this._talkBob;
      this.bodyMesh.rotation.z
        += (0 - this.bodyMesh.rotation.z) * (1 - Math.exp(-dtMs / d.swaySettleMs));
    }

  }
}
