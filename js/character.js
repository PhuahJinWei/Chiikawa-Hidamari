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
  inSolid, keepOffSolids, underRoof,
} from './sphere.js';
import { paintSheet, sheetBounds, paintShadow, EXPRESSIONS } from './art.js';
import { IMG } from './assets.js';
import { WATER_STENCIL } from './water.js';
// Asked of the director for the same reason the hour is: one place decides. A
// pond that is ground to one walker and water to another would be a pond two
// characters disagreed about while standing on it together.
import { pondsFrozen, isWater } from './weather.js';
import { fitHeld, heldMaterials } from './furniture.js';
// Gravity and the surface underfoot, shared with the rig — see walker.js.
import { Walker } from './walker.js';

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

// ...and how FAR to try stepping, as fractions of the sidestep's full length.
//
// The bearings above were the whole of it, all six taken at one length, and that
// length is `roamMax` — eight units. A long line is the hardest kind to keep
// clear: it has to miss everything along its whole span, so on a planet with two
// dozen trees on it a blocked bearing usually stays blocked at every bearing, and
// all six attempts fail together. Measured on the walk to the cave, with two
// trees of radius 1.19 and 1.29 standing side by side across the line:
// hundreds of picks, every one empty, the detour exhausting all six offsets each
// time, and Hachiware stood at the near side of them indefinitely.
//
// What gets past a tree is not a better bearing, it is a SHORTER STEP. A unit
// and a half to the side clears the trunk and needs only a unit and a half of
// clear ground to do it, and the next pick is made from there — which is exactly
// what this whole mechanism says it is for: get them moving in roughly the right
// direction and re-aim from wherever that left them.
//
// Full length first, so nothing that already worked changes, and the extra
// passes only ever run on a pick that had failed at every bearing anyway.
const DETOUR_STEPS = [1, 0.45, 0.18];

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
// there is to order — it was 3 to leave room above for the sleeping Zzz.
//
// THE ZZZ IS BACK AND STILL NEEDS NO SLOT HERE, which is worth a line because the
// obvious reading of its return is that this goes back to 3. It does not: the
// mark hangs off the sleeping CARD in the world, not off this body — see
// _sleepMark in scene.js — so it is ordered against the bedding it floats over
// rather than against the cast, and this sort never sees it.
//
// A character HAS grown a second mesh since — the piece they are carrying, see
// `holdGroup` below — and it still needs no slot of its own. That sort exists
// for things that BLEND, which cannot sort themselves: the card writes no depth,
// so a painter's order is the only thing that can say which of two overlapping
// characters is in front. A carried piece is opaque, writes depth like the
// furniture it was built as, and is therefore sorted by the depth buffer against
// the card and against everything else in the world. Raise this for the next
// blended thing a character grows, not for this one.
export const RENDER_SPAN = 1;

// How quickly a piece is brought up into a character's hands, and lowered
// again. A time constant on an exponential ease, in milliseconds — short enough
// to read as being handed something rather than as it growing there.
const HOLD_EASE_MS = 110;

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
    // THE VERTICAL, the same one the rig runs — see walker.js. It is inert for
    // most of a session, because nothing steers them onto anything: a target is
    // pushed off every prop by keepOffSolids and every step of the path is
    // trimmed against the same list. What it buys is that the cases which DO put
    // a character above the floor — a kerb walked over on the way past, a piece
    // of bedding, whatever a future errand thinks of — are drawn at the height
    // they are actually at instead of clipping through it, and that walking off
    // the edge of one is a fall rather than a teleport.
    //
    // The driven body gets one too and never runs it: the rig owns that body's
    // height and hands it over through standAt. See update().
    this.ground = new Walker(CONFIG.wander);
    // `restUntil` and `busyUntil` stood here as plain fields. Both are entries
    // in the ledger below now — 'rest' and 'talk' — so there is one store and
    // one question rather than a field per reason.
    this.walkPhase = 0;
    this.attentive = false;   // set by main: true for whoever you came to see

    // ----------------------------------------------------------- THE HOLDS
    //
    // EVERY REASON THIS BODY IS NOT WALKING, in one place, each with a name and
    // a time it runs out.
    //
    // There were five of these as separate fields — `restUntil`, `busyUntil`,
    // the acknowledgment clock, the attention clock, and the seated check —
    // written from three different files, and answering "why is this character
    // standing still" meant reading all of them and knowing which outranked
    // which. That question is the one every behaviour bug in this project has
    // opened with, so it is worth being able to ask it directly: `heldBy(tMs)`
    // names the reason.
    //
    // TWO KINDS, and the difference is real rather than bookkeeping:
    //
    //   an INTERRUPT hold stops a walk already in progress — you came over,
    //   somebody started talking to them, the hour turned
    //   a plain hold only stops them STARTING one — the rest between strolls
    //
    // Keeping them apart is what lets a rest be lazy: somebody mid-stroll with
    // a rest booked walks it out and rests at the far end, which is what a rest
    // between strolls means. Folding the two together would stop them dead
    // wherever the timer happened to land.
    this._holds = new Map();
    // BEING NOTICED, which is three small pieces of state and no longer a
    // question asked fresh every frame. See the pause in _wander.
    //
    //   _noticed   whether you are inside their personal space RIGHT NOW, held
    //              across frames so that crossing INTO it is an event. The
    //              radius it is measured against widens once it is true — see
    //              closeSlack — so this is also where the hysteresis lives.
    //   'noticed'  the ledger entry the pause books. After it runs out they
    //              carry on with you standing there, which is the whole point.
    //   _attnUntil when being the one you came to see stops holding them.
    this._noticed = false;
    this._attnUntil = 0;
    this._attnWas = false;
    this._visiting = false;

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

    // THE WINTER WARDROBE, built exactly as the one above and switched between
    // by `setDressed`. See IMG.snow in assets.js.
    //
    // Built up front and never rebuilt, which is the whole reason a costume
    // change costs nothing. Painting a sheet means a canvas, a decode and a
    // texture upload per expression per character, and doing that at the moment
    // the snow starts would be a visible hitch on the one frame the world is
    // asking you to look at it. Both wardrobes are on the GPU from the start
    // and putting a coat on is a pointer swap.
    //
    // THE COAT IS NEVER TAKEN OFF TO SHOW A FACE, and the fallback used to do
    // exactly that.
    //
    // It fell back per expression to the SUMMER sheet, reasoning that an
    // expression is what a line is for and a costume is not — right face, wrong
    // clothes, the same trade every other half-drawn thing here makes. Against
    // the actual art that reasoning trades a coat for nothing whatsoever, which
    // is the one outcome it was not weighed against.
    //
    // Measured: the expressions with no snow drawing are `sleepy` and `worried`
    // for all three, plus `delight` for two of them — and NONE of those has a
    // distinct summer drawing either. They already resolve to the resting face.
    // So the old chain went "no snow worried → summer worried → summer normal":
    // the resting face with the coat taken off, to preserve an expression that
    // was never drawn. Chiikawa is worried often, so he shed his scarf several
    // times a minute in the middle of a snowfall.
    //
    // The chain now stops at the snow resting face, which is the same face
    // wearing the right clothes. Where a snow expression HAS been drawn nothing
    // changes; where one has not, the remedy is to draw it rather than to
    // undress somebody.
    const snowSheets = IMG.snow[spec.key] || {};
    const dressedAtAll = Object.keys(snowSheets).length > 0;
    const snowRest = snowSheets.normal ? sheetTex(snowSheets.normal) : this.sheet.normal;
    this.snowSheet = {};
    for (const name of EXPRESSIONS) {
      this.snowSheet[name] = snowSheets[name] ? sheetTex(snowSheets[name])
        : (dressedAtAll ? snowRest : this.sheet[name]);
    }
    // Blinking is a FACE and a coat is not, so the same rule applies one step
    // further: with a wardrobe but no snow blink, they simply do not blink
    // while it is on. `_applySheet` reads a null here as "nothing to overlay"
    // and keeps whatever they are wearing, which is the point.
    this.snowBlinkTex = snowSheets.blink ? sheetTex(snowSheets.blink)
      : (dressedAtAll ? null : this.blinkTex);
    // WRAPPED UP OR NOT. Written by main.js off the ground cover, and read by
    // nothing but _pickSheet below.
    this.dressed = false;

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
    // ...and the same for sitting down. With a wardrobe but no snow sit sheet
    // this is null, which _applySheet reads as "no posture drawing" and answers
    // by keeping the standing card — so somebody sits in their coat, sunk, the
    // way an undrawn posture has always behaved. Falling back to the SUMMER sit
    // would have taken the coat off the moment they took a cushion.
    this.snowSitTex = snowSheets.sit ? sheetTex(snowSheets.sit)
      : (dressedAtAll ? null : this.sitTex);
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
    // The glide again, wrapped up. Only the TEXTURE and not a second plane: the
    // pose is measured from the summer drawing and both wear it, which is the
    // same constraint assets.js checks the canvas sizes against. A winter glide
    // on a differently proportioned canvas would arrive stretched, and there is
    // nowhere sensible to put a second `pose.fly` — the plane is what the
    // posture IS, and a coat does not change what shape a gliding momonga is.
    // The glide, and the ONE posture where falling back to summer is still
    // right: a glide is a whole different silhouette, so with no snow drawing
    // the choice is the summer glide or no glide at all — and a momonga
    // mid-flight is not something to answer by putting them back on their feet.
    // It never bites in practice; `momonga-fly-snow.png` is drawn.
    this.snowFlyTex = snowSheets.fly ? sheetTex(snowSheets.fly) : this.flyTex;

    // A HOBBY, which is a posture like the glide and measured like one — see
    // POSTURES in cast.js. Usagi across the top of a pudding and Hachiware on a
    // stump with a guitar are each a different silhouette from their standing
    // sheet, so each gets a plane cut from its own drawing rather than the
    // standing one squashed to fit.
    //
    // Absent for anybody who has not been drawn one, and the mode simply never
    // offers them a pastime — the same half-drawn courtesy as a missing blink.
    const past = sheets['pastime-1'];
    if (past) {
      this.pastimeTex = sheetTex(past);
      this.pose['pastime-1'] = measure(
        cachedCanvas(`sheet|${past.src}`, () => paintSheet(past)),
      );
    } else {
      this.pastimeTex = null;
    }
    // ...and the same wrapped up. Falls back to the summer hobby rather than to
    // standing, for the glide's reason: the posture IS the shape, and a momonga
    // put back on its feet mid-glide is the one substitution that reads as a
    // fault. Both drawings exist, so this never bites.
    this.snowPastimeTex = snowSheets['pastime-1']
      ? sheetTex(snowSheets['pastime-1']) : this.pastimeTex;

    this.bodyMesh = new THREE.Mesh(
      this.pose.stand.geo,
      spriteMaterial(this.sheet.normal),
    );
    this.billboard.add(this.bodyMesh);

    // WHAT THEY ARE CARRYING — see the note at holdPiece. A child of the body
    // card rather than of the billboard, so it hops and sways with them.
    this.holdGroup = new THREE.Group();
    this.holdGroup.visible = false;
    this.bodyMesh.add(this.holdGroup);
    // The carried piece's own materials, for whoever owns the hour. Empty until
    // something is put in their hands; the field exists from construction
    // because scene.js reads it every frame from the moment they join the cast.
    this.heldMats = [];
    this._heldObj = null;
    this._grip = null;
    this._holdWant = 0;
    this._holdScale = 0;

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

    // ASLEEP, which for this app means "not drawn as a body at all".
    //
    // A Zzz used to float here and an `asleep` flag switched it on, and both
    // were removed when the cast stopped sleeping. Both are back, and the flag
    // means something stronger than it did while the Zzz has moved: it hangs off
    // the sleeping card in the world now rather than off this body, because the
    // body is the thing that stops being drawn. What is drawn instead is a card
    // lying in the world — in their own bedding, or on the grass for the one
    // with none —
    // so a sleeping character is not this body wearing a sleeping face, it is
    // this body NOT BEING DRAWN while a drawing of them lies somewhere else.
    // See MIDNIGHT_SLEEP.md and Globe.layDown.
    //
    // They keep their position while they sleep, which is what makes the two
    // agree: `dir` is still where they walked to, so the card is laid at the
    // spot they stopped at rather than at a place remembered separately.
    this.asleep = false;
    this._shown = true;
    // ON AN ERRAND THAT DOES NOT STOP FOR YOU — going to bed, or getting out of
    // the rain. Written by household.js alongside `errand`, and read in exactly
    // one place, the politeness freeze in _wander. See the note there for what
    // it cost to learn that a walk with a deadline could not share a stroll's
    // manners.
    this.hurrying = false;
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
  //
  // Somebody asleep is not visible BY THIS QUESTION, and every caller wants
  // that: they may not be spoken to, may not be picked as the one you came to
  // see, and may not be tapped as a body. What CAN be tapped is the drawing of
  // them lying in the world, which is a different object and is asked about
  // separately — see sleeperAt in main.js.
  get isVisible() { return this._onScreen && !this.asleep; }

  // Lie down, or get up. The card is the scene's business; this is only the
  // body's half of it — stop wandering, stop being drawn, stop being somebody
  // a conversation can reach.
  // `at` is the drawing of them lying down, and it becomes where their voice
  // comes from — see headWorld. Without it a sleeping friend's mumble would
  // hang over the spot their BODY is parked at, which for the two who have
  // beds is a stride away beside the bedding rather than in it.
  sleep(on, at = null) {
    if (this.asleep === on) return;
    this.asleep = on;
    this.walking = false;
    this.errand = null;
    this._bedAnchor = on ? at : null;
    // Standing back up is standing: whatever posture they went to bed in — a
    // cushion they were sat on when the hour turned — is not one to wake in.
    if (!on) this._setPosture('stand');
  }

  // Whether they are on this side of the planet AT ALL, which is a different
  // question from whether they can be seen or spoken to. A sleeper is present
  // and not visible; somebody over the horizon is neither. The bubble reads
  // this one, because a line already being spoken has to stay over its speaker
  // even when what is drawn there is a card lying in the bedding.
  get isPresent() { return this._onScreen; }

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
    // Nobody asleep is reflected in anything: the body casting it is not being
    // drawn, so a reflection of it would be a ghost standing in the water.
    const on = opacity > 0.004 && !this.asleep;
    this.reflection.visible = on && this._onScreen;
    if (!on) return;
    this.reflection.material.opacity = opacity * this.fade;
    this.reflection.material.color.copy(this.bodyMesh.material.color).lerp(colour, amount);
  }

  placeAt(lat, lon, radius) {
    surfacePoint(lat, lon, 1, this.dir).normalize();
    this.home.copy(this.dir);
    this.hold('rest', 600 + Math.random() * 3000);
    // Put down on whatever is under the spot rather than dropped onto it — a
    // placement, not a fall. See Walker.standOn.
    this.ground.standOn(this.dir);
    this._sync(radius + this.ground.drawFeet);
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

  // ------------------------------------------------------------- the holds
  //
  // Book one. Later of the two if this reason is already booked, so two callers
  // asking for the same thing cannot shorten each other — the pinned rests that
  // hold somebody indoors are written every frame and would otherwise reset to
  // a nearer deadline than one somebody else had set.
  hold(reason, until, interrupt = false) {
    const had = this._holds.get(reason);
    if (had && had.until >= until) return;
    this._holds.set(reason, { until, interrupt });
  }

  // ...and the other way, which one caller genuinely needs: SHORTEN a booking
  // rather than extend it. A guest ticking off a waypoint caps their rest at a
  // beat, because the walk machinery grants a full one at every arrival and
  // eight seconds in a doorway mid-errand reads as stuck rather than as shy.
  capHold(reason, until) {
    const had = this._holds.get(reason);
    if (!had) return;
    if (had.until > until) had.until = until;
  }

  // Let one go early. `restUntil = 0` was how this used to be said, and it is
  // what somebody in a hurry does to their own rest.
  release(reason) { this._holds.delete(reason); }

  // Is this ONE reason live? For the callers that care which — a slip should
  // not interrupt a conversation, whatever else might be holding somebody.
  holding(reason, tMs) {
    const h = this._holds.get(reason);
    if (!h) return false;
    if (tMs < h.until) return true;
    this._holds.delete(reason);
    return false;
  }

  // WHY THEY ARE NOT MOVING, or null. The whole reason the ledger exists —
  // console-friendly, and the first thing to ask of a character standing
  // somewhere they should not be.
  //
  // `visited` is checked first and is not in the map, because it is the one
  // hold with a shape a deadline cannot carry: being the one you came to see
  // lasts a set time BUT ONLY WHILE YOU ARE STILL THERE, so walking away frees
  // them inside the window. It is recomputed every frame from geometry in
  // _wander; folding it in here is what keeps this the single question.
  // An INTERRUPTING reason is reported ahead of a plain one, whatever order
  // they were booked in. Both are true, but only one of them is the answer
  // anybody wants: "resting" is what a character does between strolls and says
  // nothing, while "somebody is talking to them" is the thing you were asking
  // about. Insertion order would otherwise decide, which is not a fact about
  // the character at all.
  heldBy(tMs) {
    const stopped = this.stoppedBy(tMs);
    if (stopped) return stopped;
    for (const [reason, h] of this._holds) {
      if (tMs < h.until) return reason;
      this._holds.delete(reason);
    }
    return null;
  }

  // ...and the same question restricted to the holds that STOP A WALK rather
  // than merely postpone one. See the note on the ledger for why the two are
  // not the same list.
  stoppedBy(tMs) {
    if (this._visiting) return 'visited';
    for (const [reason, h] of this._holds) {
      if (tMs >= h.until) { this._holds.delete(reason); continue; }
      if (h.interrupt) return reason;
    }
    return null;
  }

  // SOMETHING PASSED BETWEEN YOU — a greeting, a poke, a present. Starts the
  // attention window over, so a friend you are actually spending time with goes
  // on giving you their attention for as long as that is true.
  //
  // Called on the exchanges you DO rather than on the lines they say: ambient
  // chatter refreshing this would mean anybody who happened to be talking near
  // you never went back to their day, which is the freeze again wearing a
  // different clock. See wander.attnMs.
  notice(tMs) {
    this._attnUntil = tMs + CONFIG.wander.attnMs;
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
    // Asleep, their head is in the bedding rather than on the body — which is
    // parked beside it, not drawn, and would hang a mumble over an empty patch
    // of floor. Lifted by the same bubble gap a standing one uses, so a line
    // clears the drawing instead of sitting on its face.
    if (this._bedAnchor) {
      this._bedAnchor.getWorldPosition(out);
      return out.addScaledVector(this.normal, CONFIG.dialogue.bubbleLift);
    }
    out.set(0, this.headY, 0).applyQuaternion(this.billboard.quaternion);
    return out.add(this.root.position).add(this.billboard.position);
  }

  // ------------------------------------------------------------- expression

  setExpression(name) {
    this.expression = name;
    this._pickSheet();
  }

  // WHICH WARDROBE, worked out in one place because two things change it and
  // they change at completely different rates: the face changes with every
  // line, and the clothes change twice a winter.
  //
  // It was inlined in setExpression, which was fine while there was one set of
  // drawings. With two, putting a coat on would have had to wait for somebody
  // to say something before it showed.
  _pickSheet() {
    const wear = this.dressed ? this.snowSheet : this.sheet;
    this._sheetTex = wear[this.expression] || wear.normal;
    this._applySheet();
  }

  // Wrapped up, or not. Written from the ground cover — see snowCover in
  // weather.js — and a no-op on every frame but the two it changes on.
  //
  // A FLAG AND NOT A FADE, deliberately, and it is the same argument the art
  // direction makes everywhere else here: this world redraws rather than
  // transforms. There is no half-dressed drawing and there should not be one —
  // cross-fading a character between two costumes is a double exposure, which
  // is exactly what the lit house sheet is shaped to avoid. What hides the cut
  // is WHEN it happens: the cover has to build up before anybody is dressed,
  // and by then the sky is full of snow and the ground is going white.
  setDressed(on) {
    if (this.dressed === !!on) return;
    this.dressed = !!on;
    this._pickSheet();
  }

  _applySheet() {
    // A POSTURE sheet wins outright while it exists — it is one drawing for the
    // whole posture, so there is no expression and no blink to overlay on it.
    // With no such sheet this falls through and they sit, or glide, in whatever
    // their face is doing, which is the half-drawn state the whole cast is
    // designed to survive.
    const sit = this.dressed ? this.snowSitTex : this.sitTex;
    const fly = this.dressed ? this.snowFlyTex : this.flyTex;
    const blink = this.dressed ? this.snowBlinkTex : this.blinkTex;
    const hobby = this.dressed ? this.snowPastimeTex : this.pastimeTex;
    const posed = (this.posture === 'sit' && sit) ? sit
      : (this.posture === 'fly' && fly) ? fly
        : (this.posture === 'pastime-1' && hobby) ? hobby
          : null;
    const tex = posed
      || ((this._blinking && blink) ? blink : this._sheetTex);
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
    // A posture is a different body, so it is a different pair of hands. Every
    // number the grip is written in is a fraction of THIS pose's height.
    this._placeHold();
  }

  // OFF THEIR FEET AND STAYING THERE. Sitting on a cushion and sitting on a
  // pudding are the same fact to everything that asks: the wander is skipped,
  // the ground shadow is off, and standing up is somebody else's decision.
  //
  // Written as a question rather than as `posture === 'sit'` repeated in three
  // places, which is what it was — and the third of those is the one that would
  // have been forgotten, sending somebody on a stroll off the top of a stump.
  get perched() { return this.posture === 'sit' || this.posture === 'pastime-1'; }

  _setPosture(name) {
    if (this.posture === name) return;
    this.posture = name;
    this._wearPose(name);
    this._applySheet();
  }

  setTalking(on) { this.talking = on; }

  // --------------------------------------------------------------- carrying
  //
  // A built piece in their hands: the sasumata, the lamp, the bear.
  //
  // GEOMETRY RATHER THAN A DRAWING OF IT, which is the same call furniture.js
  // makes for the same reason. There is already a built copy of everything
  // carryable, posed for a hand — see HAND_BUILDERS in main.js — so a character
  // can hold the actual object without anybody drawing anything, and every
  // character can hold every item on the day it exists. A painted card would be
  // one drawing per item per character, and a snapshot of the model would be a
  // photograph of a thing standing right there.
  //
  // The cast staying cards while what they carry is real is not a compromise
  // here; it is the arrangement the whole room already is. They sit on built
  // stools and lean built lanterns against built walls.
  //
  // WHY IT HANGS OFF THE BODY CARD and not off the billboard: the card is what
  // carries the walk hop and the sway, so a piece parented to it hops and leans
  // with them instead of hanging beside them at a fixed height. That single
  // choice is most of what makes it read as carried. The billboard above it
  // still supplies the turn to camera and the breath, so the piece is seen from
  // the same side the drawing is, which is what keeps a flat actor and a solid
  // object looking like one picture.
  //
  // Depth sorts it against the card for free, and this is worth stating because
  // it looks like it ought to need arranging. The card writes no depth and the
  // piece does, so whichever is nearer the eye wins: the near arm of a sasumata
  // held across the body covers the body, and the arm of it that falls behind is
  // covered BY the body. Nothing has to be told which is in front.
  //
  // `grip` is the entry from the CARRY table in main.js, and the caller keeps
  // ownership of `obj` — it is a copy built for carrying, not the world's own
  // piece, so dropping it hands nothing back.
  holdPiece(obj, grip) {
    this._holdWant = 1;
    if (this._heldObj === obj && this._grip === grip) return;
    this._heldObj = obj;
    this._grip = grip;
    this._placeHold();
    // What in it wears the hour — see heldMaterials in furniture.js. Read after
    // the fit, though nothing about a material changes with scale: it is simply
    // the one place that has certainly seen the whole piece.
    this.heldMats = heldMaterials(obj);
  }

  // Empty their hands. The piece stays attached until the shrink has finished,
  // so a loan ending is a thing you watch rather than a thing that has already
  // happened — see the ease in _animate, which is what finally removes it.
  //
  // ...unless there is nobody to watch it, and that exception is a bug fix
  // rather than an optimisation. _animate is where the shrink runs and it is
  // skipped for anyone over the horizon, so a friend whose loan expired while
  // they were round the back of the planet kept the piece welded to them at full
  // size — and paid for it on the way back, easing it out of their hands in
  // front of you a good minute after it had gone home. Nothing has to be eased
  // out of a pair of hands that cannot be seen: it is let go of on the spot, and
  // they come back over the horizon empty-handed, which is what they are.
  dropPiece() {
    this._holdWant = 0;
    if (this._heldObj && (!this._onScreen || this.fade <= 0.004)) this._letGo();
  }

  _letGo() {
    this.holdGroup.remove(this._heldObj);
    this.holdGroup.visible = false;
    this._heldObj = null;
    this._grip = null;
    this.heldMats = [];
    this._holdScale = 0;
    this.holdGroup.scale.setScalar(0);
  }

  // Size the piece to this body and put it where the hands are.
  //
  // Everything in a grip entry is a FRACTION OF `headTop`, the drawn height of
  // whoever is carrying it, which is what lets one table serve the whole cast:
  // the same sasumata is most of Chiikawa's height and rather less of Usagi's,
  // and neither number is written down anywhere. It also means a posture change
  // re-fits it, since a seated body is a shorter one.
  _placeHold() {
    const obj = this._heldObj;
    const g = this._grip;
    if (!obj || !g) return;
    // fitHeld takes it off whatever it was parented to — see the note there —
    // so it goes back on afterwards rather than before.
    fitHeld(obj, g.size * this.headTop);
    this.holdGroup.add(obj);
    // The grip's height is measured from the FEET, because that is the only
    // landmark on a body that means the same thing in every pose. The card's own
    // origin sits `footOffset` above them, so that is the change of frame.
    this.holdGroup.position.set(
      g.x * this.headTop,
      g.y * this.headTop - this.footOffset,
      g.z * this.headTop,
    );
    this.holdGroup.rotation.set(g.tilt || 0, g.spin || 0, g.roll || 0);
  }

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
    //
    // ...UNLESS IT IS FROZEN, in which case the pond is simply ground and this
    // whole correction stands down. Nothing else has to be written for the cast
    // to use the ice: a stroll is a random bearing with the illegal places
    // pushed out of it, so removing the push is the whole of "they may walk on
    // it". The first winter this shipped, Usagi wandered out into the middle of
    // a pond and stood there, and not one line was written to make him.
    const keep = cfg.waterKeep;
    for (const lake of CONFIG.lakes) {
      if (pondsFrozen()) break;
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
    // AT THEIR OWN FEET'S HEIGHT, which is what makes a kerb a kerb for them and
    // not a wall. It is the reading the rig has always used and they never had:
    // a prop with a `top` at or below their reach is something they are ON or
    // can step onto, not something in the way. Below `wander.stepUp` — a rug,
    // the low bedding — they walk over it and the walker carries them up; above
    // it, every stump and box and table is as solid to them as it was, and as it
    // is to you. The two answers agreeing is the whole point: a friend strolling
    // over something you are stopped by says the rule is about you rather than
    // about the world, and so does the reverse.
    const reach = this.ground.reach;
    const standing = inSolid(this.dir, wall, reach);
    for (let i = 1; i <= PATH_STEPS; i++) {
      _probe.copy(this.dir).lerp(_dest, i / PATH_STEPS).normalize();
      const prop = inSolid(_probe, wall, reach);
      const propOk = !prop
        || prop === goal
        || (prop === standing && _probe.angleTo(prop.dir) > prop.r);
      if (!isWater(_probe, keep)
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
    const full = Math.min(cfg.roamMax, this.dir.angleTo(aim) * R) / R;
    if (full < 1e-4) return false;
    // Every bearing at the full length, then the same bearings closer in — see
    // DETOUR_STEPS for why the length matters more than the bearing does.
    for (const frac of DETOUR_STEPS) {
      const arc = full * frac;
      // Below about half a unit a sidestep is not a step, it is a shuffle, and
      // one that short cannot clear anything worth going round.
      if (arc * R < 0.5) continue;
      for (const off of DETOUR) {
        const a = base + off;
        _dTry.copy(this.dir).multiplyScalar(Math.cos(arc))
          .addScaledVector(_dNorth, Math.sin(arc) * Math.cos(a))
          .addScaledVector(_dEast, Math.sin(arc) * Math.sin(a))
          .normalize();
        // Offered as an ordinary destination, so it is fenced and trimmed
        // exactly as the direct line was. `localFrame` above is re-read every
        // iteration because this overwrites the module's own copy of it.
        this._pickTarget(_dTry);
        localFrame(this.dir, _dEast, _dNorth);
        if (this.dir.angleTo(this.target) > 1e-3) return true;
      }
    }
    return false;
  }

  // THE THAW, for somebody who was standing on it.
  //
  // This is the one genuinely dangerous moment in the whole freeze, and it is
  // dangerous in the way this file has been caught out by twice already: a
  // walker whose own position is somewhere they may not be can never plan a
  // step, because every plan is trimmed at the first illegal sample and the
  // first sample is where they are. They do not wander badly — they stop
  // forever. It is the same shape as a bed inside a berth, and it would arrive
  // twenty minutes after anybody was still watching the pond.
  //
  // So the ice hands them back. Straight out along their own bearing from the
  // middle, to just past the rim — the same arithmetic `_pickTarget` uses to
  // slide a target out of water, applied to the body instead of the target.
  //
  // YOU are not rescued and should not be: the player standing on a thawing
  // pond starts paddling, which is a thing the app already draws and a small
  // joke worth having. The difference is that you can walk out and they cannot.
  leaveWater() {
    const keep = CONFIG.wander.waterKeep;
    for (const lake of CONFIG.lakes) {
      if (!inLake(this.dir, lake, keep)) continue;
      dirFromLatLon(lake.lat, lake.lon, _lake);
      _away.copy(this.dir).addScaledVector(_lake, -this.dir.dot(_lake));
      // Dead in the middle, so no bearing of their own to leave along. Any will
      // do, and being nearest the middle they have the furthest to go whichever
      // way they are sent.
      if (_away.lengthSq() < 1e-8) {
        localFrame(_lake, _east, _north);
        _away.copy(_north);
      }
      _away.normalize();
      const edge = lakeReach(lake, _away, keep);
      this.dir.copy(_lake).multiplyScalar(Math.cos(edge))
        .addScaledVector(_away, Math.sin(edge)).normalize();
      // Whatever they were walking toward was planned across a frozen pond, so
      // it is not a walk any more. Dropping it puts them back on the ordinary
      // rest-and-re-pick cycle from wherever the shore turned out to be.
      //
      // `target` is left alone deliberately — it is a reused vector rather than
      // a nullable one, and `_pickTarget` copies into it. Clearing `walking` is
      // what makes it stale rather than wrong: nothing reads a target while
      // nobody is walking, and the next pick overwrites it.
      this.walking = false;
      this.errand = null;
      return true;
    }
    return false;
  }

  // `_inWater` stood here. It was the freeze gate and a scan of the lakes —
  // character for character the same method the rig carried as `isWet` and the
  // body-tow open-coded a third time. It is `isWater` in weather.js now, beside
  // the `pondsFrozen` it reads, so "may a body stand here" has one answer for
  // everybody who walks rather than three that happened to agree.

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

    // Being visited, or you have walked right up to them, or mid-conversation
    // with one of the others: stay put.
    //
    // NOTHING HOLDS SOMEBODY WHO IS IN A HURRY. Both of these rules are right
    // for a STROLL, which has nowhere it needs to get to: a friend who wandered
    // over should stop, the one you came to see should not amble off
    // mid-sentence, and two of them talking should finish. An errand with a
    // DEADLINE outranks all of it — see `hurrying`, which household.js sets for
    // exactly as long as one of those walks lasts.
    //
    // There are two of them, and they arrived a long way apart. Bedtime was the
    // first and for a while the only one, which is why this flag used to be
    // called `turningIn`. Getting out of the rain is the second, and it wants
    // every word of the paragraph below without changing one of them: the same
    // deadline, the same walk, the same reason a friend stood next to you must
    // not be able to hold somebody in a downpour by being interested in them.
    // One name for one fact, rather than two flags that would have to be
    // checked together at all three sites below.
    //
    // The arrival spot alone was enough to break this. You are set down on the
    // doorstep 3.6 units from Chiikawa — exactly `closeArc` — so setting the
    // hour to まよなか from where the game puts you left him holding a valid
    // route to his own bed and not taking a single step of it: measured still at
    // 5.02 from the bed for seventy consecutive seconds. Walking over to say
    // hello first widens the radius to `noticeArc`, 6.5, which is most of the
    // front garden. A meet exchange could pin the pair of them for another seven
    // seconds on top.
    //
    // They walk PAST you now, which is the same courtesy the cast already extend
    // to each other — nobody here is solid to anybody else — and they walk off
    // mid-line if they were talking, which is what somebody excusing themselves
    // does. What keeps it from reading as marching is their own walk rhythm,
    // which is untouched.
    const dot = watcher ? this.dir.dot(watcher.dir) : -1;
    // ...AND NOT INDOORS, where mere nearness is not information.
    //
    // `closeArc` is 3.6 and a room is about four and a half across, so under a
    // roof you are inside that radius of everybody in it from every spot on the
    // floor — including the doorway you came in by. The proximity half of this
    // test therefore never goes false indoors, and a character given a walk
    // across the room could not take a step of it while you were in there with
    // them. Two sheltering from the same shower froze wherever the arithmetic
    // caught them, side by side, for as long as the rain lasted.
    //
    // The arc was measured for the garden, where backing off a few paces is a
    // thing you can do and choosing not to is a thing you are saying. Indoors
    // there is nowhere to back off to, so it says nothing. The same exemption,
    // by the same reasoning and against the same constant, is already in
    // camera-control.js — see `tooClose` there.
    //
    // ATTENTIVE IS UNTOUCHED. Somebody actually turned toward you and talking
    // still waits, indoors as much as out: that half is about what they are
    // doing, not about how much floor happens to be between you.
    const roofed = !!underRoof(this.dir);
    const onFoot = !!watcher && watcher.alt < cfg.noticeAlt;

    // A PAUSE ON THE EDGE, NOT A HOLD WHILE YOU STAND THERE.
    //
    // Both halves below used to be plain predicates — near them, or being
    // visited — and a predicate with no clock in it cannot express "noticed
    // you". It can only express "is currently near", which is what froze the
    // cast solid for as long as anybody stood among them. What was wanted all
    // along is an event: they see you arrive, they stop, and then they carry
    // on. See wander.ackMin.
    //
    // Crossing IN is the event, so the state has to be remembered — and the
    // radius widens once they have noticed, or somebody stood exactly on the
    // line would re-notice every frame and be held forever by a rule designed
    // to stop holding them.
    const arc = (this._noticed ? cfg.closeArc + cfg.closeSlack : cfg.closeArc) / R;
    const near = onFoot && !roofed && dot > Math.cos(arc);
    if (near !== this._noticed) {
      this._noticed = near;
      // Only entering is worth a pause. Leaving simply re-arms it.
      if (near) {
        this.hold('noticed', tMs + cfg.ackMin + Math.random() * (cfg.ackMax - cfg.ackMin), true);
      }
    }

    // ...and the same treatment for being the one you came to see, which needs
    // it more rather than less: `attentive` is a focus that is never cleared, so
    // without a window this held them from the tap onward. The window opens on
    // the tap and every exchange after it pushes the end back — see notice().
    if (this.attentive && !this._attnWas) this.notice(tMs);
    this._attnWas = this.attentive;
    // The one hold a deadline cannot express on its own — see heldBy.
    this._visiting = this.attentive && onFoot && tMs < this._attnUntil
      && dot > Math.cos(cfg.noticeArc / R);

    // ONE QUESTION, where there were three. `busyUntil`, the acknowledgment
    // clock and the attention window were each checked here by hand, in an
    // order that had to be remembered; the ledger knows which of its entries
    // stop a walk and answers for all of them at once. Adding a fourth reason
    // is a `hold` call somewhere and no change to this line.
    if (!this.hurrying && this.stoppedBy(tMs)) {
      if (this.walking) {
        this.walking = false;
        this.hold('rest', tMs + cfg.interruptRest);
      }
      return;
    }

    if (!this.walking) {
      if (this.heldBy(tMs)) return;
      // NOBODY IN A HURRY WANDERS. A walk with a deadline always carries an
      // errand, so this is a guard rather than a case: if one ever arrived here
      // without one, a random stroll is the last thing it should become — that
      // is the difference between going to bed and pottering about at midnight,
      // and between running for the door and ambling home in the wet.
      if (this.hurrying && !this.errand) return;
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
        this.hold('rest', tMs + cfg.interruptRest);
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
      // A STROLL ENDS IN A REST AND A WALK HOME DOES NOT, which is most of what
      // separates the two on screen.
      //
      // This rest is between one and six seconds and it is taken at the end of
      // every LEG, not every trip — and a walk to bed is made of many legs,
      // because a target trimmed short of an obstacle counts as one. So the
      // whole journey came out as a few paces, a pause, a few paces, a pause,
      // which reads exactly as it sounds: somebody ambling home who might or
      // might not be going to bed. It is the pause between the paces that made
      // midnight feel like it had not really happened.
      //
      // Somebody in a hurry arrives and sets off again on the next frame. The
      // walk cycle itself is untouched, so they still walk rather than glide;
      // what is gone is the standing about.
      if (!this.hurrying) {
        this.hold('rest', tMs + cfg.restMin + Math.random() * (cfg.restMax - cfg.restMin));
      }
    } else {
      _axis.crossVectors(this.dir, this.target);
      if (_axis.lengthSq() < 1e-10) { this.walking = false; return; }
      _axis.normalize();
      this.dir.applyAxisAngle(_axis, step).normalize();
      this.walkPhase += dtMs;
    }
    // `_sync` stood here, and has moved to the caller. It has to run on frames
    // this method returns early from — a character who walked off a lip is
    // FALLING, and every one of the half-dozen holds above is a reason not to
    // walk rather than a reason to hang in the air. See update().
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
  sitAt(dir, y) { this.perchAt(dir, y, 'sit'); }

  // The same thing one step more general: stand them on top of something at
  // height `y`, wearing whichever posture that thing calls for. A cushion takes
  // `sit`; a pudding and a stump take the hobby drawing.
  perchAt(dir, y, posture = 'sit') {
    this.dir.copy(dir).normalize();
    this.walking = false;
    this.errand = null;
    this._setPosture(posture);
    this.seatY = y;
    this._sync(CONFIG.globe.radius + y);
    // No ground shadow while they are off the ground. The seat casts its own,
    // and a second one directly under a character who is not standing on the
    // floor reads as them hovering.
    this.shadowHolder.visible = false;
  }

  // DOWN OFF IT AND ONTO SOMEWHERE ELSE, in one movement.
  //
  // Getting off a thing is two facts — the posture changes and the body moves —
  // and doing them apart leaves the second one unsaid to the scene graph.
  // `root.position` is written by `_sync`, so setting `dir` by hand and calling
  // `standUp` separately puts them back on their feet at the OLD radius:
  // measured at 8.59 on a planet of 8, which is Hachiware standing in mid-air
  // at stump height until his next step happened to sync him.
  standUpAt(dir) {
    this.dir.copy(dir).normalize();
    this._setPosture('stand');
    this.seatY = 0;
    this._sync(CONFIG.globe.radius);
    this.shadowHolder.visible = true;
  }

  standUp() {
    if (!this.perched) return;
    this._setPosture('stand');
    this.seatY = 0;
    // Off the seat and onto whatever the floor is at their feet. Standing up is
    // an arrival like any other: they are placed on it, not dropped from the
    // height the cushion held them at.
    this.ground.standOn(this.dir);
    this._sync(CONFIG.globe.radius + this.ground.drawFeet);
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
    // Wander first: everything below depends on where they ended up. Seated,
    // there is no wandering to do — standing up is the household's business,
    // and a stroll taken from a cushion would be a stroll through the seat.
    // Driven, there is none either: the rig already stood the body somewhere
    // this frame — see standAt. Asleep, obviously none.
    if (!this.perched && !this.driven && !this.asleep) {
      this._wander(dtMs, tMs, watcher);
      // The vertical, AFTER the walk, because it asks what is under where they
      // now are: run it first and a step that carried somebody off a lip would
      // be judged against the spot they left. The rig does the same two in the
      // same order for the same reason.
      //
      // Unconditional, unlike the walk — see the note at the foot of _wander.
      // The return is the surface's own movement, which only an eye measured
      // from it has to care about; a body drawn straight off its feet does not.
      this.ground.update(dtMs, this.dir);
      this._sync(R + this.ground.drawFeet);
    }

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
    this._onScreen = away < reach + 0.10;
    // Two separate reasons not to be drawn, and they are kept apart on purpose:
    // over the horizon is about where the CAMERA is and changes as you walk,
    // while asleep is about what time it is. Folding them into `_onScreen`
    // would have a sleeper "come back over the horizon" awake.
    const shown = this._onScreen && !this.asleep;
    if (shown !== this._shown) {
      this._shown = shown;
      this.billboard.visible = shown;
      this.shadowHolder.visible = shown;
    }
    if (!shown) return;
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

    // What they are carrying, brought up or lowered.
    //
    // SCALE AND NOT OPACITY, and the fade multiplies into it for the same
    // reason: a built piece is opaque geometry with nothing to fade, so a body
    // condensing into view at a threshold would otherwise have a solid sasumata
    // arrive at full size ahead of it. Scaling is also the gesture the hand slot
    // already uses for the same moment — it reads as brought up rather than as
    // faded in.
    const wantHold = this._holdWant * this.fade;
    if (this._holdScale !== wantHold) {
      this._holdScale += (wantHold - this._holdScale) * (1 - Math.exp(-dtMs / HOLD_EASE_MS));
      if (Math.abs(wantHold - this._holdScale) < 0.004) this._holdScale = wantHold;
      this.holdGroup.scale.setScalar(this._holdScale);
      this.holdGroup.visible = this._holdScale > 0.004;
      // Fully lowered, and nobody has asked for it back: let go of the copy.
      // Held until now precisely so the shrink had something to shrink — see
      // dropPiece, which sets the want and leaves the letting go to here.
      if (!this.holdGroup.visible && this._holdWant === 0 && this._heldObj) this._letGo();
    }
  }
}
