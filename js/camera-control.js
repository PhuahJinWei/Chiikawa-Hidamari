// Where you are on the planet, and how far off the ground.
//
// There is one camera and no modes. Altitude is the only thing a pinch
// changes: at eye height you are stood on the surface looking at the horizon,
// and as you rise the view swings back and tilts down until it is the whole
// planet seen from outside. Everything between the two is a blend of them, so
// zooming never snaps.
//
// What a swipe means blends the same way. Down on the ground it turns your
// head; high up it slides your spot around the globe, which reads as spinning
// the planet. In between you get a bit of both, which is fine because in
// between is somewhere you pass through rather than sit.
//
// WHERE YOU ARE is a quaternion, not a latitude and a longitude and a compass
// bearing. That was the last of those left in the project — characters were
// moved off lat/lon long ago because it misbehaves at the poles — and it was
// behind four separate complaints at once:
//
//   Globe-view swipes felt reversed, intermittently. They were applied in the
//   fixed north/east frame while the screen shows a heading-relative view, so
//   whichever way you happened to be facing when you took off decided whether
//   the controls agreed with the screen. Lift off facing south and both axes
//   were exactly backwards.
//
//   Swiping and walking both stopped dead near the poles. Crossing a pole in
//   lat/lon means flipping longitude by pi and the bearing with it, mid-gesture,
//   so there was a hard clamp seven degrees short instead. Worse, the clamp
//   dropped the poleward part of a step but kept the longitude part, so walking
//   into it slid you sideways along the 83rd parallel.
//
//   Holding the stick straight ahead curved your path. A constant compass
//   bearing on a sphere is a rhumb line, not a straight one — only due north or
//   south is straight — so "east-ish" spiralled around a circle of latitude.
//
// A quaternion has none of those. It carries where you stand AND which way you
// face as one thing, poles are not special because there is no chart, walking is
// a rotation about the axis square to your travel — which is parallel transport,
// so a held stick traces a great circle — and a swipe is a rotation about an
// axis read off the camera, which cannot disagree with the screen because it
// came from the screen. Rotations that happen in the world are premultiplied;
// turning on the spot is a post-multiply, because it is about your own up.
//
// Angles survive only where they are genuinely angles: pitch and altitude.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  dirFromLatLon, localFrame, inLake, lakeReach, lakeNormal,
  inBuilding, buildingNormal, keepOutside, inScenery, buildings, underRoof,
  inSolid, solidNormal, keepOffSolids, roofHeight,
} from './sphere.js';
// Gravity and the surface underfoot, which the cast share — see walker.js.
import { Walker } from './walker.js';
// One place decides whether a pond will carry somebody — see pondsFrozen, and
// `isWater` beside it, which is the whole of what the rig asks about ponds while
// you are on your feet. character.js asks the same function about their feet,
// which is what stops you and a friend disagreeing about the same pond.
import { pondsFrozen, isWater } from './weather.js';

const ORIGIN = new THREE.Vector3(0, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Rotating these by the frame gives the two things the frame means. Everything
// else — right, east, the view tangent — is derived from the pair.
const REF_UP = new THREE.Vector3(0, 1, 0);
const REF_FWD = new THREE.Vector3(0, 0, 1);

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function smoothstep(x) { return x * x * (3 - 2 * x); }

const _f = new THREE.Vector3();
const _selfieDir = new THREE.Vector3();
const _selfiePos = new THREE.Vector3();
const _selfieLook = new THREE.Vector3();
const _selfieProbe = new THREE.Vector3();

// WHICH WAYS ROUND THE LENS MAY TRY, in radians, when the way it wanted is full
// of tree — see _selfieDodge. Nearest first and alternating sides, so the search
// gives up the least ground it can and has no handedness: a trunk dead ahead is
// as likely to send the camera left as right, decided by which side is actually
// open rather than by the order of this list.
//
// Nine of them, ending at 32°. Wider than that and the lens is filming your
// cheek — past a third of a turn a selfie stops being one, which is the same
// reasoning that bounds the pan.
const SELFIE_DODGE = [0, 8, -8, 16, -16, 24, -24, 32, -32]
  .map((deg) => deg * Math.PI / 180);
const _selfieAimDir = new THREE.Vector3();
const _r = new THREE.Vector3();
const _wAim = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

// Pack "stood here, facing that way" into a frame. `fwd` only has to point the
// right way — it is squared against `up` on the way in, so callers can hand over
// a direction to something rather than a carefully built tangent.
// --------------------------------------------------------------------- water
//
// You cannot walk into a lake. Three ways in had to be shut, not one: the stick
// walking you there, a tap landing in the middle of one, and being set down in
// front of somebody stood on its far side.

const _lakeC = new THREE.Vector3();
const _away = new THREE.Vector3();
const _lf1 = new THREE.Vector3();
const _lf2 = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _toward = new THREE.Vector3();
const _slide = new THREE.Vector3();
const _cand = new THREE.Vector3();

// How far a blocked step leans away from the water, 0 being along the shore and
// 1 being straight off it. The first of these that lands dry wins.
const LEAN_OUT = [0, 0.2, 0.45, 0.7, 1];

// Bearings an arrival will settle for, in radians around the person you are
// going to see, tried in this order — see _arriveNear. Nought first because the
// side you are already on is the one that reads right, then alternating either
// way so a spot is never given up for one further round than it had to go.
//
// Sixteenths of a turn. Coarser and a tree the width of these can sit across
// two consecutive bearings, which is the case this exists for; finer buys
// nothing, since the differences stop being visible long before it runs out.
const ARRIVAL_TURNS = [0];
for (let i = 1; i <= 7; i++) {
  const a = (i * Math.PI) / 8;
  ARRIVAL_TURNS.push(a, -a);
}
ARRIVAL_TURNS.push(Math.PI);

// How many points along the sightline get tested. Four splits an arc of a few
// units into pieces shorter than the narrowest thing that could hide in one.
const SIGHT_SAMPLES = 4;

const _bearing = new THREE.Vector3();
const _sight = new THREE.Vector3();

// `isWet` stood here — the freeze gate and a scan of the lakes, which is the
// same four lines character.js and the body-tow each carried their own copy of.
// It is `isWater` in weather.js now, next to the `pondsFrozen` it reads, so the
// three readers share one answer by structure rather than by discipline.

// Move a spot out of any lake it landed in, straight out to the nearest rim.
// Used for the two cases that name a destination outright — a tap and a
// teleport — where stopping short would just leave you shoving at the water.
// Somewhere you could actually stand: out of the water and out of the walls.
// Both for the same reason — a destination inside either can never be reached,
// so a walk toward one ends with you shoving at it forever.
//
// Walls are cleared first and water second, so water has the last word if the
// two ever disagree. They cannot today: the house sits 18 units from the nearer
// lake and neither is moving on its own. But a spot pushed off a wall CAN land
// in a lake once somebody moves one, and of the two impossible places to be
// stood, the one with the whole shore-slide apparatus built around it is the
// one better able to argue.
// The props join the walls at the front, and for the same reason they are
// cleared before the water: of the three, a prop is the one whose ejection can
// least afford to be last. A spot pushed off a trunk lands a stride away on open
// grass, which is somewhere you can stand; a spot pushed out of a lake lands on
// a shore, which is also somewhere you can stand — but a shore is where the
// props are thickest, so clearing water last lets it have the final say over a
// prop rather than the other way round.
// A local `underRoof` stood here, and it was the same dot-product-per-building
// that sphere.js already exported under that exact name — the only differences
// being a boolean instead of the building, and no margin. Both callers here want
// the truthiness, which the shared one gives for free. Keeping a second copy of
// a question this load-bearing (see the note on it in sphere.js, and the two
// bugs that came of asking `inBuilding` instead) is how the two drift.

function keepClear(spot) {
  keepOutside(spot, CONFIG.player.wallKeep);
  keepOffSolids(spot, CONFIG.player.wallKeep);
  return keepDry(spot);
}

// How high the roof is over a spot on the surface, or 0 under open sky.
//
// This exists because you can now take off from INDOORS, and the one thing a
// lift must not do is stop halfway through a ceiling. A building's dome is as
// tall as it is wide — see the shell in scene.js, where the height IS the
// radius — so `roof` is the registered radius in world units and the height
// above any spot under it falls straight out of the circle.
//
// The offset is measured as an arc along the planet rather than a chord
// through it. On a 3.2 dome standing on a radius-8 world the two differ by
// about two percent, which is far below the clearance this feeds.
function roofOver(dir) {
  const R = CONFIG.globe.radius;
  for (const b of buildings()) {
    if (b.roof === undefined) continue;
    const along = clamp(dir.dot(b.dir), -1, 1);
    if (along <= Math.cos(b.r)) continue;
    const off = Math.acos(along) * R;
    const up = b.roof * b.roof - off * off;
    return up > 0 ? Math.sqrt(up) : 0;
  }
  return 0;
}

function keepDry(spot) {
  // Nothing to keep dry on a frozen pond: a tap out on the ice means the ice.
  if (pondsFrozen()) return spot;
  for (const lake of CONFIG.lakes) {
    if (!inLake(spot, lake, CONFIG.player.shoreKeep)) continue;
    dirFromLatLon(lake.lat, lake.lon, _lakeC);
    _away.copy(spot).addScaledVector(_lakeC, -spot.dot(_lakeC));
    if (_away.lengthSq() < 1e-10) {
      // Dead in the middle, so no bearing to keep. Any will do.
      localFrame(_lakeC, _lf1, _lf2);
      _away.copy(_lf2);
    }
    _away.normalize();
    const edge = lakeReach(lake, _away, CONFIG.player.shoreKeep);
    spot.copy(_lakeC).multiplyScalar(Math.cos(edge))
      .addScaledVector(_away, Math.sin(edge)).normalize();
  }
  return spot;
}

function setFrame(q, up, fwd) {
  _f.copy(fwd).addScaledVector(up, -fwd.dot(up));
  if (_f.lengthSq() < 1e-12) {
    // Facing straight up or down at the thing aimed at: any tangent will do.
    _f.copy(WORLD_UP).cross(up);
    if (_f.lengthSq() < 1e-12) _f.set(1, 0, 0).cross(up);
  }
  _f.normalize();
  _r.crossVectors(up, _f);
  _m.makeBasis(_r, up, _f);
  return q.setFromRotationMatrix(_m);
}

export class PlanetCamera {
  constructor(camera) {
    const c = CONFIG.camera;
    this.camera = camera;

    // Stood a little south of where the three of them live, facing north. It
    // lives in CONFIG rather than here now, because how far south is not a free
    // choice: it decides how much of the screen a friend covers in the very
    // first frame anybody sees, and it used to be close enough that two of the
    // three did not fit on it. See camera.startAt.
    this.frame = setFrame(
      new THREE.Quaternion(),
      dirFromLatLon(c.startAt.lat, c.startAt.lon, new THREE.Vector3()),
      WORLD_UP,
    );
    this.frameT = this.frame.clone();

    this.lookPitch = c.restLookPitch; this.lookPitchT = c.restLookPitch;
    this.alt = c.eyeHeight; this.altT = c.eyeHeight;

    // THE DEVICE TILT IS GONE, and with it `gyroHeading`, `gyroPitch` and
    // `gyroBase`. It was a bounded parallax — the phone's own lean nudging the
    // view by up to seventeen degrees, faded out as you left the ground — and
    // what it cost was out of all proportion to a garnish nobody could name:
    //
    //   A PERMISSION PROMPT AT THE FRONT DOOR. iOS only hands tilt over from
    //   inside a real user gesture, so `enableGyro` rode the はじめる tap and the
    //   first thing between a new player and the meadow was a system dialog
    //   asking for Motion & Orientation Access. That is the worst possible
    //   trade: the app's opening beat, spent on an effect most people would
    //   never consciously notice.
    //
    //   A BASELINE NOBODY COULD SET. Square was wherever the phone happened to
    //   be pointing at the first orientation event, and the only thing that ever
    //   recentred it was a resize. Start the app with the phone flat on a table,
    //   pick it up, and your neutral gaze was pitched off by the difference for
    //   the rest of the session.
    //
    //   TWO BUGS OF ITS OWN, both fixed and both recorded here because they say
    //   what the term really was: a second, invisible answer to "which way am I
    //   looking". The stick read the frame while the camera read the frame plus
    //   the tilt, so walking crabbed up to seventeen degrees off screen-forward;
    //   the interaction focus had the same disagreement, and picked a target the
    //   camera was not showing. Every future reader of that question had to
    //   remember this existed.
    //
    // What is left is one answer: `forward`, which is what `facing` returns.

    this.focus = null;
    this.lastTouch = 0;
    this.w = 0;              // 0 = stood on the ground, 1 = looking at the planet

    this.move = { x: 0, y: 0 };
    this.drive = 0;          // eased throttle, 0..1
    this.goto = null;        // unit surface direction from a tap-to-walk
    this.stepPhase = 0;
    // THE VERTICAL, and it is no longer this class's to own. The hop was once a
    // parabola read off `_hopT` and added at render time, which is all a jump
    // needs to be while there is nowhere to land but the spot you left. There is
    // now: stumps outdoors and every piece of furniture indoors have tops (see
    // groundUnder in sphere.js), so a jump has to be able to END somewhere other
    // than where it started — and once that is true, "how high are this body's
    // feet" stops being a camera question. It is in walker.js, where the cast can
    // ask it too; see the note at the top of that file for why having asked it
    // twice was the one real asymmetry left in the world's rules.
    //
    // `alt` keeps its old meaning — the EYE's height, and the channel the pinch
    // and the sky button drive — so the landed/airborne split it decides is
    // untouched by any of this. What changes is that the landed value of it is
    // `body.stand + eyeHeight` rather than eyeHeight flat, which is what standing
    // on something means. The gap between the feet and the surface they belong to
    // is added at render exactly where the hop used to be, so a jump that lands
    // where it took off composes the identical height it always did.
    this.body = new Walker(CONFIG.player);
    // The run. `sprintOn` is armed by a tap on the sprint button and stands
    // down BY ITSELF when you stop — see _walk — so it means "this movement
    // is a run", never "running is switched on": there is no state to forget
    // about and rediscover three strolls later when a gentle push across the
    // grass inexplicably bolts. `_dash` is how far into the run the legs have
    // got, eased both ways over accelMs so arming mid-stride is a lean into
    // it and stopping is a wind-down, never a gear change.
    this.sprintOn = false;
    // Whether a friend's hand is in yours. Written from main.js; read by the
    // walk above and by the sprint button, which will not arm while it is set.
    this.leash = false;

    // SAT DOWN. Read by `eyeAlt` for the lowered eye, by `_walk` for the beat
    // it costs to get up, and by body.js for which sheet you are drawn in.
    //
    // No seat, no spot, no claim: you sit where you are standing, and the rig
    // has already guaranteed that wherever that is, it is somewhere legal —
    // out of the water, off the walls, clear of the trunks. Anywhere you can
    // stand is somewhere you can sit, which is the entire placement rule.
    this.seated = false;
    // How much of getting up is left, in milliseconds — see camera.sitRiseMs.
    // A countdown rather than a deadline, because the rig is stepped by the
    // frame's own clock and a deadline set on `performance.now()` would never
    // arrive under the stepped harness.
    this._rising = 0;

    // THE SELFIE VIEW — see CONFIG.player.selfie*.
    //
    // `selfieOn` is the switch and `selfie` is how far the lens has swung round,
    // 0 on your own eyeline and 1 out in front looking back. Everything else in
    // this class reads the SECOND one, because a view that is halfway round is
    // halfway round: the bob and the sprint kick fade out with it rather than
    // switching off, and the placement blends between the two poses on the same
    // number.
    //
    // Nothing outside these two lines knows the view exists. `anchor`, `alt`
    // and `isFirstPerson` are untouched by all of it, which is the whole design
    // — see the note in config.
    this.selfieOn = false;
    this.selfie = 0;
    // WHO ELSE IS IN THE SHOT, as a surface direction, or null. Written by
    // main.js while a hand is held; read only to decide what the lens aims at.
    // The rig has no business knowing about the household, so it is handed a
    // point rather than a person.
    this.pairAim = null;
    // How far back the lens has been ASKED to sit, before the world gets its
    // say — see selfieZoom and the march.
    this.selfieWant = CONFIG.player.selfieDist;
    // WHERE THE LENS IS POINTED, which is the half of a camera this view did not
    // have for a while and is the reason it felt caged.
    //
    // Every other control here moves the LENS — the tilt slides it up its arc,
    // the zoom in and out, turning swings it round — and then the camera looked
    // at the same fixed point on your chest whatever any of them had done. The
    // measured consequence: swing the old bearing pan its full 30 degrees each
    // way and the avatar sat at screen centre the whole time (NDC x = -0.01).
    // Every photograph was a passport photo with a rotating background, and the
    // three framings anybody actually reaches for — you on the thirds line, you
    // low with sky above, the low hero shot looking up past you — were not
    // merely hard, they were unreachable.
    //
    // So the two-finger drag stopped moving the lens and started moving the
    // FRAME. `selfieShift` slides the aim sideways and `selfieAimY` sets how
    // high up you it sits. What the old bearing pan did is not lost: turning
    // your body already swings the lens round you, unbounded, and did so before
    // the pan existed — which is exactly why a bounded second control that
    // produced the same picture was the redundant one to spend.
    //
    // SIDEWAYS IS A FRACTION OF THE DISTANCE, not a length. A world offset that
    // reads as a third of the frame at arm's length is off the edge of the
    // picture when the lens is pulled in to 2.2 — measured, the half-frame at
    // that range is 0.615 units. Scaling with `back` makes the control mean the
    // same thing at every zoom, which is what a framing control has to do.
    this.selfieShift = 0;
    // ...and the height it aims at, absolute rather than an offset, because
    // "at his feet" and "over his head" are facts about the body rather than
    // about how far away the camera is.
    this.selfieAimY = CONFIG.player.selfieAim;
    // ...and how high it has been asked to fly, as the pitch term the lift is
    // worked out from. Its own value rather than `lookPitch`, which is where
    // this number used to come from and could not do the job — see the clamp in
    // applyDrag and the range in CONFIG.
    this.selfieTilt = 0;
    // What the WORLD added to that, easing, when the bearing you asked for was
    // full of tree — see _selfieDodge. Its own field, and the only thing left on
    // this channel now that the user's half of it became the framing, so that
    // stepping out from behind the tree returns the lens to the framing you
    // chose rather than to wherever it was pushed.
    this.selfieAuto = 0;
    // Where the lens ended up last frame, so the march that keeps it out of
    // walls has somewhere to ease from rather than snapping in and out as you
    // walk past a trunk.
    this._selfieBack = 0;
    this._dash = 0;
    this._ranArmed = false;  // whether the armed run has actually been run yet
    this._lift = 1;          // banked outward pinch, while stood on the ground
    // Which wall refused the last step, so the slide below knows which one to
    // go round. `atDoor` used to sit beside it — a flag saying "this one was
    // walked squarely into, open it" — and went when walking into a building
    // stopped being a way in.
    this._hitWall = null;

    // The outward normal at the spot you are stood on — public, because the sky
    // is hung off it. Not the camera's own direction, which swings back off the
    // overhead line as you rise; this is the point of the planet you are above,
    // which is the same in both views and moves only when you actually move.
    this.anchor = new THREE.Vector3();
    // Which way you face, as a tangent. Both are re-derived from the frame every
    // update; read them, never write them.
    this.forward = new THREE.Vector3();
    this._syncFrame();

    // Carried in the world rather than as an angle off the current facing, so
    // letting go coasts the way you were going even if you swipe on the way out.
    // Transported by every step, so it stays tangent as the ground curves away.
    this.travelDir = this.forward.clone();

    this._wA = new THREE.Vector3();
    this._wF = new THREE.Vector3();
    this._wE = new THREE.Vector3();
    this._wD = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._camUp = new THREE.Vector3();

    this._T = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    // The lens's own bearing and its axis, kept apart from `_axis` because the
    // dodge below tries several of them per frame and the one that wins has to
    // survive being asked about again.
    this._bear = new THREE.Vector3();
    this._tryBear = new THREE.Vector3();
    this._tryAxis = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._viewDir = new THREE.Vector3();
  }

  // Where the eye sits when you are stood up on whatever is under you. It was
  // the constant `eyeHeight`, and everything that decides "landed" measured
  // against it; now that a stump or a table can be under you, the same idea is
  // eyeHeight above the SURFACE rather than above the planet.
  //
  // Reading `stand` rather than `feet` is deliberate and load-bearing. A jump
  // must not change what counts as landed — that split decides whether a swipe
  // turns your head or spins the planet, and losing the walk for the 480ms of a
  // hop is the exact bug the old separate hop channel existed to avoid. `stand`
  // is the surface you belong to, and it does not move while you are in the air
  // above it.
  // ...AND SITTING IS SIMPLY A LOWER PLACE TO BE STANDING, which is the whole
  // trick and the reason sitting needed almost no new machinery. Every question
  // the rig asks about being landed goes through this one getter — the pinch's
  // bank, the walk gate, the fall, `isFirstPerson` itself — so dropping the eye
  // here sits you down as far as all of them are concerned, and not one of them
  // had to be taught a new state. See camera.sitDrop.
  get eyeAlt() {
    const c = CONFIG.camera;
    return this.body.stand + c.eyeHeight - (this.seated ? c.sitDrop : 0);
  }

  // Strictly: both feet down. Not "close to the ground" — walking and
  // head-turning only exist here, and everywhere else is the globe view.
  get isFirstPerson() {
    const c = CONFIG.camera;
    return this.altT <= this.eyeAlt + 1e-3 && this.alt <= this.eyeAlt + c.groundBand;
  }

  get onGround() { return this.isFirstPerson; }
  // Where you are heading rather than where you are, so a button label flips
  // the instant it is pressed instead of waiting out the climb.
  get goingUp() { return this.altT > CONFIG.camera.eyeHeight * 3; }

  // ------------------------------------------------------------- sitting down
  //
  // Sit where you stand, or get back up. Both write TARGETS — `altT` and
  // `lookPitchT` — which the update loop already eases, so the camera sinks and
  // rises rather than cutting, and the gesture costs no animation of its own.
  //
  // Refused off the ground for the reason the selfie is: there is nothing to sit
  // on up there, and `isFirstPerson` is the app's word for having somewhere to
  // put your feet.
  sit() {
    if (this.seated || !this.isFirstPerson) return false;
    this.seated = true;
    // Read AFTER the flag, because `eyeAlt` is what the flag changes.
    this.altT = this.eyeAlt;
    this.lookPitchT = CONFIG.camera.sitLookPitch;
    // A run does not survive sitting down. It stands itself down when movement
    // ends, and this is movement ending in the most complete way available.
    this.sprintOn = false;
    return true;
  }

  standUp() {
    if (!this.seated) return false;
    this.seated = false;
    this._rising = CONFIG.camera.sitRiseMs;
    this.altT = this.eyeAlt;
    this.lookPitchT = CONFIG.camera.restLookPitch;
    return true;
  }

  // Turn round and look at yourself, or turn back. Refused off the ground,
  // where the far view owns the camera and there is no body to look at anyway.
  setSelfie(on) {
    const want = !!on && this.isFirstPerson;
    if (this.selfieOn === want) return this.selfieOn;
    this.selfieOn = want;
    // A FRAMING BELONGS TO A SHOT, so the zoom goes back to the default every
    // time the lens is turned round — the same rule the pose picker follows.
    // Coming back to a view still holding the last picture's framing would be
    // the app remembering something the user set for one photograph.
    if (want) {
      this.selfieWant = CONFIG.player.selfieDist;
      this.selfieShift = 0;
      this.selfieAimY = CONFIG.player.selfieAim;
      this.selfieAuto = 0;
      this.selfieTilt = 0;
    }
    // ...and the stick is dropped on the spot rather than on the next tick, so
    // turning the camera round mid-stride cannot leave a throttle running
    // against a pad that has just been taken away.
    if (want) this.setMove(0, 0);
    return this.selfieOn;
  }

  // Pinch, in the selfie view. `factor` arrives as the pinch's own ratio — under
  // one when the fingers spread — so multiplying brings the lens IN as they
  // open, which is the way every photograph on a phone has ever been framed.
  //
  // What comes back is only what was ASKED for. The legality march still has
  // the last word every frame, so pinching out against a wall quietly gets you
  // as much room as there is and no more, and stepping away from the wall opens
  // it up again without another gesture.
  selfieZoom(factor) {
    const p = CONFIG.player;
    if (!(factor > 0)) return;
    this.selfieWant = clamp(this.selfieWant * factor, p.selfieMin, p.selfieMax);
  }

  // MOVE THE FRAMING, in pixels of drag or a frame's worth of held key.
  //
  // THE PICTURE FOLLOWS YOUR FINGERS, which is the opposite sign from a
  // viewfinder pan and the right one here. You are not aiming a camera at a
  // subject out in the world; you are placing YOURSELF in a picture you are
  // looking at, and the gesture for that is the one you use to drag a photograph
  // — push right and you go right. Aiming the other way round is what a camera
  // operator does, and this is not one.
  //
  // CLAMPED TO A BOX, which is the "fixed area" this was always meant to be: far
  // enough to put yourself on a thirds line or leave a head of sky, never far
  // enough to lose yourself out of your own photograph.
  selfieFrame(dx, dy) {
    const p = CONFIG.player;
    if (dx) {
      this.selfieShift = clamp(
        this.selfieShift - dx * p.selfieShiftSens,
        -p.selfieShiftMax, p.selfieShiftMax,
      );
    }
    if (dy) {
      this.selfieAimY = clamp(
        this.selfieAimY + dy * p.selfieAimSens,
        p.selfieAimLow, p.selfieAimHigh,
      );
    }
  }

  toggleSelfie() { return this.setSelfie(!this.selfieOn); }

  markTouched(now) { this.lastTouch = now; }

  // One meaning or the other, never a blend of both. Blending them was what
  // made the middle of the zoom feel like neither mode.
  applyDrag(dx, dy) {
    const c = CONFIG.camera;

    if (this.isFirstPerson) {
      // Turning on the spot: a rotation about your own up, so it post-multiplies
      // and leaves where you stand alone. Rotating about the frame's own up axis
      // is what "turn your head" means, and it needs no anchor vector to do it.
      //
      // TURNING STILL TURNS YOU in the selfie — that is what swings the lens
      // round, and it is the same gesture meaning the same thing.
      this.frameT.multiply(_q.setFromAxisAngle(REF_UP, dx * c.headingSens));
      // ...BUT THE VERTICAL BELONGS TO THE LENS while it is turned round.
      //
      // The lift used to be worked out from `lookPitch`, which is the WALKING
      // gaze, and that gaze is clamped to (-0.95, +0.30) for a reason that has
      // nothing to do with photographs: on a planet whose horizon sits thirty
      // degrees BELOW your eye, down is where the world is and up is nothing but
      // sky, so the range is asymmetric on purpose. Borrowed by the selfie it
      // capped the lens at 1.9 + 0.30 x 1.5 = 2.35 units — barely over the head
      // of a 2.02-unit Momonga, 20.6 degrees of elevation, against a `selfieTop`
      // of 3.6 that needed a pitch of 1.13 and could never be reached. The high
      // angle is the most-used shot there is and the app simply could not make
      // one. Measured before the split: 0.85 to 2.35, and no further.
      //
      // So the selfie keeps its own tilt, with its own range, exactly as it
      // already keeps its own zoom and its own bearing. `lookPitchT` is left
      // alone while the lens is round, which also means turning back finds the
      // walking gaze where you left it rather than wherever the camera wandered.
      if (this.selfieOn) {
        this.selfieTilt = clamp(
          this.selfieTilt + dy * c.lookPitchSens,
          CONFIG.player.selfieTiltMin, CONFIG.player.selfieTiltMax,
        );
        return;
      }
      this.lookPitchT = clamp(
        this.lookPitchT + dy * c.lookPitchSens,
        c.minLookPitch, c.maxLookPitch,
      );
      // A walk-to deliberately SURVIVES this, and it used to not.
      //
      // Turning your head is not changing your mind. On a planet whose horizon
      // is four paces off, the thing you asked to be taken to is over the curve
      // for most of the journey, so there is nothing on screen confirming you
      // are still going anywhere — and a glance at a flower on the way silently
      // cancelled the trip and coasted you to a stop. You then stood in an
      // identical patch of grass with no memory of which way you had been
      // pointed, which is most of what "I get lost" is made of here.
      //
      // Only the stick cancels it now: that is a hand on the wheel and means
      // something different by it. See _walk, and the marker on the ground that
      // exists so a walk in progress is a thing you can SEE is in progress.
      return;
    }

    // A trackball, spun about the axes the screen actually has. This is the fix
    // for the reversed controls: the old version turned a swipe into changes in
    // longitude and latitude, which are directions on the PLANET, and then hoped
    // they matched the directions on the SCREEN — which they only did while you
    // faced north. Read the axes off the camera and they agree by construction,
    // whatever you are facing and wherever you are stood.
    //
    // Taken from the camera's world matrix, one frame stale because this runs
    // ahead of update(). At a screenful per second that is a fraction of a pixel
    // of lag and nobody can want a whole extra matrix rebuild for it.
    //
    // No cos(latitude) correction any more. The old one existed because
    // meridians crowd together toward the poles, so a degree of longitude stopped
    // being a consistent amount of swipe; it was capped at 0.35 to stop it
    // blowing up, which is why the gain went strange up there. A rotation about a
    // screen axis is the same size everywhere and needs no such apology.
    const s = c.anchorSens;
    this._camRight.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    this._camUp.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
    this.frameT.premultiply(_q.setFromAxisAngle(this._camUp, -dx * s));
    this.frameT.premultiply(_q.setFromAxisAngle(this._camRight, -dy * s));
    this.frameT.normalize();
  }

  // A pinch is amplified, since fingers only travel so far. Buttons step by a
  // fixed amount instead, so go through zoomBy rather than doubling up on the
  // exponent.
  dolly(factor) {
    this.zoomBy(Math.pow(factor, CONFIG.camera.zoomRate));
  }

  zoomBy(mult) {
    const c = CONFIG.camera;

    // You cannot fly sitting down. Standing first also lifts the eye back to
    // where the bank below measures from, so a pinch begun while seated is
    // judged against the same landed altitude as any other.
    if (this.seated) this.standUp();

    // Taking off is deliberate, and being deliberate has to be ACCUMULATED.
    //
    // This used to read "anything above eye height snaps to landSnap", with a
    // comment claiming you could not leave the ground by accident. You could,
    // and easily: a pinch arrives as a stream of tiny multipliers — one pixel
    // of finger separation is about 1.01, and 1.02 was measured launching you —
    // so the first imperceptible wobble of a two-finger touch put you in the
    // air. A threshold on any single step cannot fix that either, because
    // everything short of landSnap is pushed back down to the grass, so a slow
    // spread would never accumulate anywhere and could never leave at all.
    //
    // So while landed, outward zoom banks against liftGain instead of moving
    // you, and clearing the bank is what takes off. Anything inward, and every
    // deliberate arrival at the ground, empties it.
    // The floor of flight: the lowest altitude you are allowed to rest at.
    //
    // Over open ground that is landSnap, and always was. Under a ROOF it has
    // to clear the roof, and that is the whole of what taking off indoors
    // needed. landSnap alone is 2.6 and the house's apex is 3.2, so a pinch
    // taken standing on the rug would leave the camera stopped inside the dome
    // — airborne, in globe view, with a ceiling around it and no way out but to
    // keep pinching. Anywhere between the rug and the roof is the same "unclear
    // whether you can walk" state the note below rejects for the grass, so it
    // is refused for the same reason: you are on the floor, or you are above
    // the house, and there is nothing in between to hover in.
    const roof = roofOver(this.anchor);
    const floor = roof > 0 ? Math.max(c.landSnap, roof + c.roofClear) : c.landSnap;

    // Standing on a table is still standing, so the landed altitude these
    // compare against is the eye above whatever is underfoot rather than above
    // the planet — see eyeAlt. Without it, a pinch taken while stood on
    // something reads as already airborne and skips the bank entirely.
    const eye = this.eyeAlt;

    if (this.altT <= eye + 1e-3) {
      if (mult <= 1) { this._lift = 1; return; }
      this._lift *= mult;
      if (this._lift < c.liftGain) return;
      this._lift = 1;
      this.altT = clamp(floor, eye, c.maxAlt);
      return;
    }
    this._lift = 1;

    // Airborne. Leave no hovering just off the grass — nor just under a
    // ceiling: coming down below the floor of flight lands you properly,
    // rather than parking you at an altitude where it is unclear whether you
    // can walk.
    let a = this.altT * mult;
    if (mult < 1 && a < floor) a = eye;

    this.altT = clamp(a, eye, c.maxAlt);
    // Landing should leave you looking at the ground ahead rather than at your
    // own feet or straight out into empty sky.
    if (this.altT <= eye + 1e-3) {
      this.lookPitchT = clamp(this.lookPitchT, -0.55, -0.10);
    }
  }

  // Walk to a spot on the surface, given as a unit direction from the centre.
  walkTo(dir) {
    // A tap in the middle of a lake walks you to its shore. Left alone it would
    // march you at water you cannot enter and leave you shoving at the rim with
    // `goto` never satisfied.
    this.goto = keepClear(dir.clone().normalize());
  }

  // Joystick input, -1..1 each axis, y negative being forward.
  setMove(x, y) { this.move.x = x; this.move.y = y; }

  get isWalking() { return this.drive > 0.02; }

  // Re-derive the two vectors the rest of the class reads. Cheap, and it keeps
  // the frame the single source of truth rather than something to be kept in
  // step with a pair of cached vectors.
  _syncFrame() {
    this.anchor.copy(REF_UP).applyQuaternion(this.frame);
    this.forward.copy(REF_FWD).applyQuaternion(this.frame);
  }

  // Point the target frame at a surface direction without moving where it
  // stands, so you arrive facing what you asked to be taken to.
  _aimAt(dir) {
    _wAim.copy(REF_UP).applyQuaternion(this.frameT);
    setFrame(this.frameT, _wAim, dir);
  }

  // The two poses, mixed by `selfie`. Writes `_pos` and `_look` in place, so
  // the roll and the lookAt below take it without knowing anything happened.
  //
  // BLENDED AS AN ARC, not as a straight line between two points. The lens
  // travels from your eye to a spot several units away round a planet of eight;
  // lerping the positions would cut the corner and dip the camera through the
  // hillside on the way. Rotating the anchor by a growing arc keeps every frame
  // of the swing at an honest height above the ground.
  _selfiePose(A, R, height, dtMs) {
    const p = CONFIG.player;
    const k = this.selfie;

    // The lens rises and falls with the same swipe that pitches the view on
    // foot, which is what makes looking up at the two of you cost nothing to
    // learn: the gesture already means "tilt".
    //
    // Worked out BEFORE the march now, because it is also how high the lens
    // flies — and that is what decides which of the things on the ground it has
    // to care about at all. See _selfieReach.
    let lift = clamp(
      p.selfieHigh + this.selfieTilt * p.selfieSwing,
      p.selfieLow, p.selfieTop,
    );
    // ...and never through the plaster. `selfieTop` is 3.6 against a room whose
    // apex is 3.2, so an upward swipe indoors asked for a lens above the roof —
    // and the march would then have refused every step, collapsing the shot to
    // arm's length for a reason nothing on screen explained. Clamped to the
    // ceiling over YOUR head, which is the highest it could be anywhere in the
    // room; the march still draws it in as the dome slopes away.
    const head = roofHeight(A, R);
    if (head < Infinity) lift = Math.min(lift, Math.max(p.selfieLow, head - p.selfieHead));
    const feet = this.body.stand + lift;
    const asked = this.selfieWant + (this.leash ? p.selfiePair : 0);

    // Out in front along the way you are facing, swung by however far round you
    // have asked the camera to sit. `_T` is that heading and is already computed
    // above, so a swipe that turns you also swings the lens round you — an orbit
    // for free, and one that agrees with the direction the stick walks.
    // Straight out in front of you now, with only the world's own dodge added —
    // the user's half of this channel became the framing above, and turning your
    // body is the unbounded version of what it used to do.
    this._bear.copy(this._T);

    // ...and then the world's own opinion about that bearing, eased in so the
    // lens slides round a trunk rather than jumping round it.
    const goal = this._selfieDodge(A, this._bear, asked, feet);
    const swing = 1 - Math.exp(-dtMs / p.selfieDodgeMs);
    this.selfieAuto += (goal - this.selfieAuto) * swing;
    if (this.selfieAuto) this._bear.applyAxisAngle(A, this.selfieAuto);

    // How far out the world will actually allow ALONG THE BEARING IT SETTLED ON,
    // eased so walking past a trunk draws the lens in rather than snapping it.
    // Marched again rather than reusing the dodge's own number, because the
    // swing above is still travelling and the honest distance is the one for
    // where the lens is this frame.
    this._axis.crossVectors(A, this._bear).normalize();
    const want = this._selfieReach(A, asked, this._axis, feet);
    const ease = 1 - Math.exp(-dtMs / 90);
    this._selfieBack += (want - this._selfieBack) * ease;
    const back = this._selfieBack;
    // MEASURED FROM THE GROUND UNDER YOU, not from `alt`.
    //
    // `alt` is already an eye height — the surface plus eyeHeight — so adding
    // the lens height to it stacked one on the other: the camera ended up 3.4
    // units up aiming 2.7 up, which is above the head of a 2.02-unit Momonga.
    // It framed the sky over your shoulder and none of you. `body.stand` is the
    // surface you are on, which is also what makes this right on top of a stump
    // or a table rather than only on the grass.
    const floor = R + this.body.stand;
    // POSITIVE, which is IN FRONT. `_axis` is A x the bearing, so rotating the anchor
    // about it by a positive angle carries it toward `_T` — the way you are
    // facing. The main placement above uses a NEGATIVE angle for exactly the
    // opposite reason, to swing the far view back off the overhead line, and
    // copying that sign here put the lens behind your shoulder: a back view in
    // a world where every card turns to face the lens anyway, and one whose
    // legality march kept colliding with the house you had just walked out of.
    _selfieDir.copy(A).applyAxisAngle(this._axis, back / R);
    _selfiePos.copy(_selfieDir).multiplyScalar(floor + lift);
    // ...looking back at your chest — or at the space BETWEEN the two of you,
    // when somebody is in the picture with you.
    //
    // Aimed at the player alone, a friend standing 1.35 to one side sits at the
    // edge of the frame with the other half of the shot empty sky. Splitting
    // the difference is what turns a snapshot of you with somebody caught in it
    // into a photograph of the pair of you, and it is the whole reason the
    // hand-holding selfie was worth building.
    _selfieAimDir.copy(A);
    if (this.pairAim) {
      _selfieAimDir.lerp(this.pairAim, 0.5);
      if (_selfieAimDir.lengthSq() < 1e-9) _selfieAimDir.copy(A);
      else _selfieAimDir.normalize();
    }
    // ...AT WHATEVER HEIGHT UP YOU THE FRAMING ASKED FOR, and then shifted along
    // the frame's own sideways.
    //
    // `_axis` is A x the bearing, so it is the tangent perpendicular to the line
    // between you and the lens — the picture's own left-and-right, at every
    // heading, for free. Adding a multiple of it to the look-at point slides the
    // whole frame across you; a look-at target is just a point, so it costs one
    // addScaledVector and needs no second rotation and no second basis.
    //
    // Scaled by `back` so a shift means the same fraction of the picture however
    // near or far the lens has been pulled — see selfieShift.
    _selfieLook.copy(_selfieAimDir).multiplyScalar(floor + this.selfieAimY)
      .addScaledVector(this._axis, this.selfieShift * back);

    this._pos.lerp(_selfiePos, k);
    this._look.lerp(_selfieLook, k);
  }

  // HOW FAR THE LENS MAY GO BACK before it is inside something.
  //
  // The classic third-person problem and the classic answer: walk out along the
  // ray and stop at the first spot that is not a place a camera may be. What
  // counts as legal here is the same three questions everything else on this
  // planet asks — not in a trunk, not in masonry, and not on the wrong side of
  // a wall from the person it is filming.
  //
  // That last one is why `underRoof` is in the list rather than `inBuilding`
  // alone. A lens 3.4 units in front of somebody stood by their own window is
  // outdoors while they are indoors, and the wall between would be filming the
  // outside of the house. Matching the roof state to yours keeps the shot in
  // whichever space you are in — and indoors it is clamped tighter still, since
  // the room is 4.5 across and a portrait is the only framing that fits.
  // TWO THINGS WERE MEASURED WRONG HERE, and between them they were why the
  // lens spent most of its life jammed against your face. Over 71 standing spots
  // and 24 headings each, the march came back at its 1.5 floor in 45% of
  // directions and reached the far stop in 25%; after the two fixes below and
  // the dodge above, that is 8% and 85%, and the mean reach goes 2.97 → 4.90.
  //
  // A LENS IS NOT A PAIR OF FEET. This asked `inSolid` with the default `feet`,
  // which is the floor — so every registered footprint was a wall to it, and
  // seven of thirty-six directions out of the first spot tested were being
  // refused by things the camera clears by a metre. Passing the lens's own
  // height lets it fly over a stump, a table, a bed; a tree has no `top` and so
  // is still a wall at any height, which is the right answer for the one prop
  // whose canopy would swallow the shot.
  //
  // AND IT IS NOT AS WIDE AS A BODY. The 0.15 margin is the berth a walking
  // character keeps, and on trunks registered at 0.13–0.20 radians it very
  // nearly doubled them: a lens could not pass within two and a half units of a
  // tree that is one wide. `selfieClear` is what a camera actually needs, which
  // is enough not to clip its near plane through the bark.
  //
  // The masonry margin stays at the body's, and that asymmetry is on purpose: a
  // wall is a flat plane rather than a post, so a lens that grazes one sees
  // along it into the room beyond, and no amount of near-plane clearance makes
  // that a picture anybody wanted.
  // AND INDOORS IT WAS A FLAT NUMBER, which is the third thing this march has
  // been caught measuring with the wrong instrument.
  //
  // `selfieRoom` capped the lens at 2.1 from anywhere under a roof. That is
  // roughly the radius of Chiikawa's room, so it is the right answer standing on
  // the rug and the wrong one everywhere else — and because the cap did not move
  // with you, it was the SAME answer everywhere: 1.85 in all directions from any
  // spot in the house, the march never even reaching a wall to be stopped by.
  // Worse, 2.1 sits below `selfieMin` (2.2), so pinching indoors did nothing at
  // all. A gesture that works in every other place and silently does not work
  // here does not read as a small room; it reads as a broken button.
  //
  // What replaces it is the room's own shape. The ceiling is a dome — 3.2 over
  // the rug, under two at the wall — so the honest limit is "may a lens at this
  // height be at this spot", asked of each step. That is one test doing the work
  // of the cap and doing it better: it lets you back across the whole room when
  // you are stood by a wall, it draws in when you pitch the lens up into the
  // slope of the roof, and it needs nothing written down per house.
  _selfieReach(A, want, axis, feet) {
    const c = CONFIG.player;
    const R = CONFIG.globe.radius;
    const roofed = !!underRoof(A);
    const step = 0.35;
    let best = c.selfieNear;
    for (let d = c.selfieNear; d <= want + 1e-6; d += step) {
      _selfieProbe.copy(A).applyAxisAngle(axis, d / R);
      if (inSolid(_selfieProbe, c.selfieClear, feet)) break;
      if (inBuilding(_selfieProbe, 0.15)) break;
      if (!!underRoof(_selfieProbe) !== roofed) break;
      // ...and the plaster, which only a roofed march can run into. Outdoors
      // `roofHeight` is Infinity and this costs one comparison.
      if (roofHeight(_selfieProbe, R) < feet + c.selfieHead) break;
      best = d;
    }
    return Math.min(best, want);
  }

  // WHERE ELSE THE LENS COULD STAND, when the bearing you asked for is full of
  // tree. Returns an extra angle to add to it, and zero when nothing is in the
  // way — which is the answer most of the time and costs one march to get.
  //
  // This is the piece that turns "the camera is always zoomed in" into a
  // non-problem, and it works because of what a selfie already promises: the
  // lens points back at YOU, so it is free to stand anywhere on the arc and the
  // shot is still of your face. A third-person camera behind a walking character
  // cannot do this — swinging it sideways changes what the player is looking at,
  // which is why those cameras pull in instead. Here it changes only the
  // background, and a background is a thing a photograph is allowed to choose.
  //
  // CANDIDATES ARE ORDERED BY HOW FAR THEY STRAY, and the comparison is strict,
  // so a tie keeps the smallest deviation: the lens takes the nearest way round
  // the trunk rather than whichever the loop happened to reach last. It stops
  // the moment one of them reaches the distance asked for, so an open field is a
  // single march and no swing at all.
  _selfieDodge(A, bear, want, feet) {
    let bestAng = 0;
    let bestReach = -1;
    for (const s of SELFIE_DODGE) {
      this._tryBear.copy(bear);
      if (s) this._tryBear.applyAxisAngle(A, s);
      this._tryAxis.crossVectors(A, this._tryBear).normalize();
      const r = this._selfieReach(A, want, this._tryAxis, feet);
      if (r > bestReach + 1e-6) { bestReach = r; bestAng = s; }
      if (bestReach >= want - 1e-6) break;
    }
    return bestAng;
  }

  // WHICH WAY YOU ARE LOOKING, and the one place anything asks.
  //
  // `_viewTangent` stood here and this was a wrapper over it. The two differed
  // by the device tilt, and with that gone they are the same vector, so there is
  // one method rather than two — but it is still a method rather than everybody
  // reaching for `forward` themselves, and deliberately so. Three callers
  // outside this class ask it (the interaction focus, the walk, leading a friend
  // by the hand), and every one of them is really asking "what is on the
  // player's screen". That has been the same as the frame's bearing before and
  // may not be again; when it is not, this is the single line that has to know.
  facing(out) { return out.copy(this.forward); }

  // The camera is yours alone: walking never turns it. This app is about
  // looking at somebody, and sidestepping to frame them better only to have
  // the view swing away to face your direction of travel fights the very
  // reason you moved. Only a swipe turns you — or a tap-to-walk, where you
  // explicitly asked to be taken somewhere and want to arrive facing it.
  //
  // Because nothing turns the camera from movement, stick directions can be
  // read against the live heading: "up" always means the way you are looking
  // this instant, and swiping while walking simply curves your path. An
  // earlier version auto-turned toward travel, which forced a captured
  // reference frame to stop the camera chasing its own input — all of which
  // this removes.
  //
  // Walking on a sphere is a rotation of where you stand about an axis
  // perpendicular to the way you are going, applied to the smoothed value and
  // its target together so footsteps land immediately.
  _walk(dtMs) {
    const p = CONFIG.player;
    const R = CONFIG.globe.radius;
    const dt = dtMs / 1000;
    const A = this._wA.copy(this.anchor);

    let driveT = 0;
    const mag = Math.hypot(this.move.x, this.move.y);

    // GET UP FIRST, and only then go. A push on the stick while you are sitting
    // spends itself standing you up, and the walk starts from the next one.
    //
    // The beat is the point rather than a cost of the implementation. Sitting
    // down is a thing you did deliberately and it should take a moment to undo,
    // the way it takes a moment to do — a body that slid straight from a seated
    // drawing into a walk would read as the pose never having meant anything.
    // The camera is already rising through the same frames, so the beat is
    // filled rather than dead.
    //
    // `goto` is cleared with it: a walk-to that arrived while you were seated
    // has been overtaken by you standing up on purpose.
    if (this.seated) {
      if (mag > 0.001) { this.standUp(); this.goto = null; }
      this.drive += (0 - this.drive) * (1 - Math.exp(-dtMs / p.accelMs));
      return;
    }
    // ...and the beat it takes, which is what makes standing up a thing that
    // happens rather than a flag that flips. Without it the frame after the flag
    // was already walking, in the same unbroken push — measured at 2cm of travel
    // with the seated drawing still on screen. See camera.sitRiseMs.
    if (this._rising > 0) {
      this._rising -= dtMs;
      this.drive += (0 - this.drive) * (1 - Math.exp(-dtMs / p.accelMs));
      return;
    }

    if (mag > 0.001) {
      this.goto = null;
      // Read against where you are LOOKING, which is the same question the
      // camera answers a few lines further down and is asked here through the
      // same method for that reason. It was two answers once — the device tilt
      // rode the camera's and not the stick's, and hard forward crabbed you
      // sideways by as much as seventeen degrees. One answer cannot disagree
      // with itself, which is the whole of why `facing` exists.
      this.facing(this._wF);
      this._wE.crossVectors(this._wF, A);            // east of where you look
      this._wD.copy(this._wF).multiplyScalar(-this.move.y)
        .addScaledVector(this._wE, this.move.x);
      if (this._wD.lengthSq() > 1e-12) {
        this.travelDir.copy(this._wD).normalize();
        driveT = Math.min(1, mag);
      }
    } else if (this.goto) {
      if (A.angleTo(this.goto) * R < p.arriveArc) {
        this.goto = null;
      } else {
        this._wD.copy(this.goto).addScaledVector(A, -this.goto.dot(A));
        if (this._wD.lengthSq() > 1e-12) {
          this.travelDir.copy(this._wD).normalize();
          driveT = 1;
          this._aimAt(this.travelDir);
        }
      }
    }

    const k = 1 - Math.exp(-dtMs / p.accelMs);
    this.drive += (driveT - this.drive) * k;

    // The run disarms itself when the movement it described ENDS — which is
    // not the same as there being none. Arm it stood still and it waits for
    // the run it is about; only once you have genuinely moved does stopping
    // stand it down. Without `_ranArmed` the disarm fired on the very next
    // frame after arming at rest, and the button was a light that would not
    // stay on.
    //
    // Both thresholds ride the drive's own easing, so a stick flicked through
    // centre between two directions — gone for a frame or two, drive still
    // high — never disarms it, while an honest stop does within a third of a
    // second.
    if (this.sprintOn) {
      if (this.drive > 0.3) this._ranArmed = true;
      else if (this._ranArmed && driveT === 0 && this.drive < 0.05) {
        this.sprintOn = false;
        this._ranArmed = false;
      }
    } else {
      this._ranArmed = false;
    }
    this._dash += ((this.sprintOn ? 1 : 0) - this._dash) * k;

    // The boost multiplies the walk rather than replacing it, so the stick
    // stays analog under it — a careful half-push is still a careful half-push,
    // just a running one. Cadence comes along free: stepPhase advances with
    // speed, so the footfalls quicken exactly as the ground does.
    // HOLDING A HAND CAPS THE WALK AND REFUSES THE RUN — see player.leadSpeed.
    // `leash` is set by main.js while somebody is being led, and it is the one
    // thing allowed to override the stick, because the alternative is dragging
    // a friend along at twice the speed their own drawing was made to walk at.
    const speed = this.leash
      ? this.drive * p.leadSpeed
      : this.drive * p.walkSpeed * (1 + (p.sprintBoost - 1) * this._dash);
    this.stepPhase += speed * p.stepsPerUnit * dt * Math.PI * 2;

    const step = (speed / R) * dt;
    if (step < 1e-7) return;

    // One rotation, about the axis square to the way you are going, applied to
    // the whole frame. That is parallel transport: your facing is carried along
    // the path rather than recomputed from a bearing, so holding the stick walks
    // a great circle — the actual straight line on a sphere — instead of the
    // spiral a fixed compass bearing traces. The pole is not a place any more,
    // just somewhere the path happens to cross.
    //
    // Target and smoothed value together, so footsteps land the instant they are
    // asked for and never lag behind the stick.
    this._stepOrSlide(A, step);
  }

  // GO ROUND THE THING WHOSE OUTWARD NORMAL IS `toward`. True if a step was
  // taken; false leaves the frame untouched for the caller to try something else.
  //
  // The one ladder, where there were three transcriptions of it — the wall, the
  // prop and the shore each carried their own, and the wall's and the prop's were
  // identical to the character. They are one move because they are one idea: take
  // the part of your travel that points INTO the obstacle back out, then, if that
  // tangent gets nowhere, lean progressively further out until something does.
  //
  // The two reasons the ladder is needed are different and both still apply,
  // which is why it is worth having said them where they were rather than only
  // here:
  //
  //   A CIRCLE (a wall, a trunk) needs it because the tangent holds your distance
  //   CONSTANT. Fine while you are outside it, useless the moment you are a hair
  //   inside — and a hair inside is exactly where a refusal leaves you, so every
  //   following step starts there. Measured pressing into a wall at 60 degrees:
  //   stuck for 276 frames out of 300, throttle wide open, a third of a unit
  //   travelled.
  //
  //   AN ELLIPSE (a shore) needs it because `inLake` measures in gnomonic angles
  //   and `lakeNormal` is that same ellipse's gradient, so the two agree only to
  //   first order. On a lake nearly twice as wide as it is tall a step along what
  //   ought to be the tangent dips back inside — pinned at an ellipse value of
  //   1.0009, too far out for the escape to fire and too far in for any tangent
  //   to clear. Leaning out fixes it without anyone deriving the exact metric.
  //
  // The degenerate fallbacks are stacked rather than chosen per caller: head-on
  // at the middle there is no tangent, so either way round will do (the cross),
  // and if even that collapses the outward normal itself is a direction. The
  // shore used to jump straight to the normal in that case; it still gets there,
  // as the ladder's last rung, having tried along the shore first — which is what
  // the other two already did and is the better answer for all three.
  _slideRound(A, step, toward) {
    const into = -this.travelDir.dot(toward);
    if (into <= 0) return false;               // already heading away from it
    _slide.copy(this.travelDir).addScaledVector(toward, into);
    if (_slide.lengthSq() < 1e-10) _slide.crossVectors(A, toward);
    if (_slide.lengthSq() < 1e-10) _slide.copy(toward);
    _slide.normalize();
    for (const mix of LEAN_OUT) {
      _cand.copy(_slide).multiplyScalar(1 - mix).addScaledVector(toward, mix);
      if (_cand.lengthSq() < 1e-10) continue;
      if (this._tryStep(A, step, _cand.normalize())) return true;
    }
    return false;
  }

  // One step along travelDir, unless it would land in a lake.
  //
  // Water is a wall you slide along rather than one you stop at. A flat refusal
  // is correct and feels broken: clip the corner of a pond while walking past
  // and you stick to it, holding the stick with nothing happening and no way to
  // tell why. Taking the part of the travel that points at the lake back out
  // walks you round the shore instead, which is what you were trying to do.
  _stepOrSlide(A, step) {
    this._hitWall = null;
    this._hitProp = null;
    if (this._tryStep(A, step, this.travelDir)) return;

    // A wall, and nothing but a wall — with one gap in it, which is not this
    // code's business to know about.
    //
    // Walking at the wall used to open the door outright, then to trigger a
    // choreographed passage; both were ways of faking a doorway a solid disc
    // could not have. The disc has a genuine gap now (see sphere.js): inside
    // the door's bearing wedge inBuilding simply reports nothing, so walking
    // through the doorway is walking, and everything here — the refusal, the
    // slide, the lean-out ladder — is only ever about the parts of the wall
    // that really are wall. From indoors the same machinery holds you in and
    // slides you along the room's rim, because the wall is the same wall from
    // both sides.
    if (this._hitWall && buildingNormal(A, this._hitWall, _toward)) {
      if (this._slideRound(A, step, _toward)) return;
      // Inside one somehow — a building placed on top of you, or a spot that
      // slipped through. Walk straight out, the way the water escape does.
      if (inBuilding(A, CONFIG.player.wallKeep)) {
        this._tryStep(A, step, _toward, true);
        return;
      }
    }

    // A trunk or a stump. The same ladder, and it stays a separate BRANCH even
    // though it no longer holds a separate copy of the move: the two lists
    // answer different questions, and a prop has no doorway, no inside and no
    // second face to decide between — so what differs is which normal is handed
    // over and what happens when the ladder fails, which is all that is left
    // here now.
    if (this._hitProp && solidNormal(A, this._hitProp, _toward)) {
      if (this._slideRound(A, step, _toward)) return;
    }

    for (const lake of CONFIG.lakes) {
      // Out is the rim's own normal, not the line back to the centre — see
      // lakeNormal. Getting that wrong pins you to a shore with the throttle
      // wide open and nothing to show why.
      if (!lakeNormal(A, lake, _toward)) continue;
      if (this._slideRound(A, step, _toward)) return;
    }

    // Somehow standing in the water — a lake resized underneath you, or a spot
    // that slipped through. Walk straight out. Without this the block is a trap
    // rather than a wall: every direction lands wet, so nothing is ever allowed
    // and there is no way back to dry ground.
    //
    // ...and on ice this rescue is the trap. Standing in the middle of a frozen
    // pond is exactly where somebody may be, and left ungated this would shove
    // them at the shore every frame they stood there — a rescue from a place
    // that no longer needs rescuing from.
    for (const lake of CONFIG.lakes) {
      if (pondsFrozen()) break;
      if (!inLake(A, lake, CONFIG.player.shoreKeep)) continue;
      if (lakeNormal(A, lake, _toward)) this._tryStep(A, step, _toward, true);
      return;
    }

    // And the same escape for a prop, which the ladder above cannot always
    // manage on its own. Every rung of it moves by one frame's walk — a few
    // hundredths of a unit — so a step that starts a hair inside gets out on the
    // last rung, and one that starts well inside gets nowhere on any of them and
    // would be held there with the stick wide open. Forcing the step ignores
    // where it lands, which is the only move that can leave somewhere you are
    // not allowed to be.
    // At your feet's height, like the refusal above. Standing ON something is
    // not being stuck inside it, and asking at ground level would read every
    // table you were stood on as a trap and shove you off it.
    const stuck = inSolid(A, CONFIG.player.wallKeep, this.body.reach);
    if (stuck) {
      // Stood exactly on its centre there is no outward bearing to compute, and
      // it is the one place that needs none: every direction from the middle of
      // a circle leads out of it, so the way you were already going will do.
      // keepOffSolids and keepOutside both carry the same fallback, and without
      // it here the escape is a no-op precisely where it is most needed —
      // measured, a prop registered dead on the player pinned them for good.
      if (!solidNormal(A, stuck, _toward)) _toward.copy(this.travelDir);
      this._tryStep(A, step, _toward, true);
    }
  }

  // Commits the step and reports true, or leaves the frame alone and reports
  // false when the landing spot is wet or inside a building. `force` skips the
  // test, for the one case that has to move regardless of where it lands.
  _tryStep(A, step, dir, force = false) {
    this._axis.crossVectors(A, dir);
    // Nowhere to rotate about. Reported as a failure so the caller carries on
    // down its list rather than reading "handled" and stopping on a step that
    // never happened — which is its own way of getting stuck.
    if (this._axis.lengthSq() < 1e-12) return false;
    this._axis.normalize();
    _q.setFromAxisAngle(this._axis, step);

    if (!force) {
      _probe.copy(A).applyQuaternion(_q).normalize();
      if (isWater(_probe, CONFIG.player.shoreKeep)) return false;
      // Which building refused it, remembered rather than merely reported: the
      // slide below needs to know WHICH wall it is against, and asking again
      // from where we are standing would come back empty — we are outside it,
      // which is the whole reason the step was refused.
      const hit = inBuilding(_probe, CONFIG.player.wallKeep);
      if (hit) { this._hitWall = hit; return false; }
      // Remembered for the same reason the wall is: the slide has to know which
      // trunk it is going round, and by the time it asks we are stood outside
      // the thing that refused us.
      //
      // Judged at the height of your FEET, which is what makes a table a thing
      // you can be on top of rather than only a thing in the way. Below its top
      // it is a wall; level with it you are standing on it and it lets you
      // across. `stepUp` is added because a kerb you may walk up must not also
      // be a kerb you are stopped by — the two rules meet at the same lip, and
      // disagreeing by a hair there is a floor you stick to.
      const prop = inSolid(_probe, CONFIG.player.wallKeep, this.body.reach);
      if (prop) { this._hitProp = prop; return false; }
    }

    this.frame.premultiply(_q).normalize();
    this.frameT.premultiply(_q).normalize();
    this.travelDir.applyQuaternion(_q);
    this._syncFrame();
    return true;
  }

  // Off the ground there is nothing to walk with, so let the legs wind down
  // instead of freezing the walk cycle mid-stride. The dash winds down with
  // them — the button may still be held, and honouring a held sprint in the
  // sky would leave the lens part-opened over a planet nobody is running on.
  _coast(dtMs) {
    const k = 1 - Math.exp(-dtMs / CONFIG.player.accelMs);
    this.drive += (0 - this.drive) * k;
    this._dash += (0 - this._dash) * k;
    this.goto = null;
  }

  // Both buttons, and the teleport below, put the altitude somewhere outright.
  // Each clears the pinch bank with it, or an abandoned half-gesture from
  // before would still be sitting there waiting to launch you.
  goToSky() {
    this._lift = 1;
    this.seated = false;
    this.altT = CONFIG.camera.skyAlt;
  }

  goToGround() {
    const c = CONFIG.camera;
    this._lift = 1;
    // Landing is landing on your feet. Set directly rather than through
    // standUp, whose whole job is writing the two targets this method is about
    // to write itself.
    this.seated = false;
    // Onto whatever is under where you are, which after a flight is not
    // necessarily what you took off from.
    this._standOn(this.anchor);
    this.altT = this.eyeAlt;
    this.lookPitchT = c.restLookPitch;
  }

  // Land a few paces in front of someone, facing them. Approached from
  // whichever side you are already on, so it reads as walking over rather than
  // being dropped in from nowhere.
  teleportTo(ch) {
    this.goStand(ch.object3D.position.clone().normalize(), CONFIG.camera.standoff);
    this.focus = ch;
  }

  // Square up for a conversation. What the people-verbs call when you press one
  // — see talkToMate in main.js — so that starting a conversation from a button
  // gives the same shot as walking over to somebody does.
  //
  // It was the button path that needed this rather than the tap path. A tap
  // already lands you at the tuned distance facing them; a BUTTON is pressed
  // from wherever you happened to stop, which the facing cone allows to be most
  // of a right angle off-axis and a metre or two too far. So the same
  // conversation was beautifully framed or half off-screen depending only on
  // which control you reached for.
  //
  // A BAND RATHER THAN A DISTANCE, and the band has two edges for two different
  // reasons.
  //
  // This was "step in, never back off" at first, on the reasoning that the pill
  // only exists at conversational range and you are often nearer than ideal on
  // purpose — stood right up against somebody, hand on the lamp — so framing
  // must never become the game walking you AWAY from a friend you deliberately
  // crowded. That defends a real case and covered one it should not have: nose
  // to nose there is no shot to protect. The measured table at MEET_ARC is where
  // the line is — the widest of the cast is 87% of the screen at 4.0, 90% at
  // 3.8, and by 3.6 a character does not fit across it at all — so inside
  // `closeArc` you are not close, you are past the frame, and pressing a verb
  // there earned a conversation with a wall of fur. It also disagreed with the
  // tap, which has always stood you at the standoff from wherever you were, and
  // two ways into the same conversation framing it differently is the exact
  // inconsistency this method exists to remove.
  //
  // So: further off than the standoff, come in. Nearer than they can be drawn,
  // back out. Between the two — a little close, still whole — keep your ground
  // and only turn, because a backwards nudge over half a metre is drift rather
  // than framing.
  //
  // ...EXCEPT INDOORS, where the back-off is switched off entirely. A room is
  // about 2.25 units of walkable radius, so "retreat to 4.0" is a retreat into a
  // wall: keepClear would stop you going through it and leave you flattened
  // against it instead, which is a worse shot than the close one it was
  // correcting. Nothing is wrong with standing near somebody in a small room —
  // it is the only way to stand in one.
  //
  // Every branch writes TARGETS — frameT, lookPitchT — which the update loop
  // eases toward at smoothMs, so a correction arrives as a settling rather than
  // a cut. Nothing here jumps.
  closeIn(ch) {
    const to = ch.object3D.position.clone().normalize();
    const gap = this.anchor.angleTo(to) * CONFIG.globe.radius;
    const tooFar = gap > CONFIG.camera.standoff;
    const tooClose = gap < CONFIG.wander.closeArc && !underRoof(this.anchor);
    if (tooFar || tooClose) {
      this.teleportTo(ch);
      return;
    }
    this._aimAt(to);
    // The gaze that goes with being stood in front of somebody. Not the
    // altitude, and not the spot: turning to face a friend is not a reason to
    // change how tall you are or where you put your feet.
    this.lookPitchT = CONFIG.camera.faceLookPitch;
    // Whoever you are talking to stops wandering off mid-sentence — see
    // `attentive` in updateCast, which reads exactly this.
    this.focus = ch;
  }

  // `glideTo` stood here — stand somewhere named exactly, facing something named
  // exactly, for the one arrival with no choice of side in it: a doorstep is
  // where the door is, whichever way you came. Its only caller was the tap that
  // teleported you to a building, and that feature is gone, so this went with it
  // rather than sitting here as a method nothing calls.

  // The same move as teleportTo without a person on the end of it: stand
  // `standoff` units short of a spot on the surface, facing it. Its whole job is
  // picking WHICH side to arrive on, which is the question every visit to a
  // character asks — and the reason the doorstep arrival could never use it.
  goStand(to, standoff) {
    const c = CONFIG.camera;
    const R = CONFIG.globe.radius;
    const from = REF_UP.clone().applyQuaternion(this.frameT);

    const back = from.clone().addScaledVector(to, -from.dot(to));
    if (back.lengthSq() < 1e-6) {
      back.set(0, 1, 0).cross(to);
      if (back.lengthSq() < 1e-6) back.set(1, 0, 0);
    }
    back.normalize();

    const arc = standoff / R;
    const spot = this._arriveNear(to, back, arc);

    // Stand there, face them. This was always vector work that converted to
    // lat/lon and a bearing on the last three lines; now it just stops.
    //
    // STAND, and the word is meant literally: going somewhere is getting up.
    // Cleared before `eyeAlt` is read, since that is what it changes.
    setFrame(this.frameT, spot, to);
    this._lift = 1;
    this.seated = false;
    this._standOn(spot);
    this.altT = this.eyeAlt;
    this.lookPitchT = c.faceLookPitch;
  }

  // WHICH SIDE to come at them from. `back` is the bearing you are already on,
  // and it is the one this wants: coming from where you were is what makes an
  // arrival read as having walked over. So it is tried first and kept unless it
  // is unusable, and the turns below fan out either way from it in the smallest
  // steps that get anywhere — a visit that had to swing round is still meant to
  // look like the short way round.
  //
  // Two different failures, and they are not equally bad, so they are not
  // treated equally:
  //
  //   Standing INSIDE a tree's card is fatal. The card is wider than you are
  //   far from it, so it fills the screen and there is nothing to see. No spot
  //   that does this is ever returned while any other is available.
  //
  //   A tree ACROSS the sightline is merely a shame. You are somewhere sensible
  //   and the friend you tapped is behind a trunk, which is worth another
  //   bearing but is not worth landing you inside something to avoid.
  //
  // So the first bearing clear of both wins outright; failing that, the first
  // one merely stood in the open; failing even that, the bearing you came from,
  // because being somewhere is better than the search coming back empty.
  _arriveNear(to, back, arc) {
    const keep = CONFIG.camera.propKeep;
    let clearOfProps = null;

    for (const turn of ARRIVAL_TURNS) {
      _bearing.copy(back);
      if (turn !== 0) _bearing.applyAxisAngle(to, turn);

      const spot = to.clone().multiplyScalar(Math.cos(arc))
        .addScaledVector(_bearing, Math.sin(arc)).normalize();

      // They keep out of the water, but standing a few paces back from one of
      // them does not: approach somebody on the near shore of a lake from
      // across it and the spot in front of them is in it. Nor out of buildings
      // — walk round the far side of the house and the spot in front of whoever
      // is standing there is inside the building. Done per candidate, since it
      // can move a spot and the tests below have to judge where you END UP.
      keepClear(spot);

      if (inScenery(spot, keep)) continue;
      if (this._canSee(spot, to, keep)) return spot;
      if (!clearOfProps) clearOfProps = spot;
    }

    if (clearOfProps) return clearOfProps;
    return to.clone().multiplyScalar(Math.cos(arc))
      .addScaledVector(back, Math.sin(arc)).normalize();
  }

  // Whether anything tall stands between a spot and what it is looking at.
  //
  // Sampled along the arc rather than solved, because the shapes involved do
  // not deserve better: a tree is a flat card standing at a point and this is
  // asking whether it is roughly in the way. Both ends are left out on purpose.
  // The near end is the spot itself, which the caller has already tested, and
  // the far end is whoever you came to see — who may well be stood under a tree
  // by their own choice, and if they are, no bearing on the planet clears the
  // sightline and the search would throw away every candidate for a fault none
  // of them has.
  _canSee(spot, to, keep) {
    for (let i = 1; i <= SIGHT_SAMPLES; i++) {
      _sight.copy(spot).lerp(to, i / (SIGHT_SAMPLES + 1)).normalize();
      if (inScenery(_sight, keep)) return false;
    }
    return true;
  }

  // A little jump on the spot, and nothing else: it clears nothing and reaches
  // nothing, because nothing here needs beating. It exists so a visitor can
  // speak the one word of body language this cast has — their walk is a hop —
  // and main.js watches for it to let whoever is nearby answer in kind.
  //
  // Refused off the ground, where there is no ground to jump from, and refused
  // mid-hop: feet that are already in the air cannot push off it again, and
  // re-arming on the way down would let a rhythm of taps hold you hovering.
  // True when the jump actually started, which is what the answer keys on.
  hop() {
    // Off the planet there is no ground to push against, which is the rig's
    // question rather than the body's — the walker only knows whether the feet
    // are already in the air. Both refusals still hold; they are just asked by
    // whichever of the two can actually answer.
    if (!this.isFirstPerson) return false;
    // Sitting spends the press getting up, exactly as a push on the stick does.
    // False, because nothing hopped — and the hop's answer is what the cast
    // read to decide whether to bounce back at you. A friend answering a jump
    // that was really you standing up would be waving at nothing.
    if (this.seated) { this.standUp(); return false; }
    return this.body.hop();
  }

  // Put the feet on whatever is under a spot. For arrivals, which choose a place
  // to be rather than travelling to one — see Walker.standOn for why it is asked
  // with infinite reach and no ledge.
  //
  // In practice it is nearly always the floor, because every spot an arrival
  // picks has been through keepClear, and furniture is solid, so a tap cannot
  // choose a table to stand on.
  _standOn(spot) {
    this.body.standOn(spot);
  }

  // Gravity, and the surface underfoot — all of which is walker.js's now. What
  // is left here is the one thing that is genuinely the CAMERA's business:
  //
  // MOVING `stand` MOVES `alt` WITH IT, by the same amount, and that pairing is
  // what makes every one of these transitions invisible. Height is composed as
  // `alt + body.lift`, so adding d to `stand` and d to `alt` leaves the sum
  // where it was — the eye does not jump at the moment of landing, it simply
  // stops falling. Get that wrong and every arrival on a table is a lurch.
  //
  // `update` returns exactly that d, on the frames there is one, which is why it
  // returns anything at all: a body drawn straight off its own feet has nothing
  // to do here and ignores the number.
  _fall(dtMs) {
    const move = this.body.update(dtMs, this.anchor);
    if (move !== 0) {
      this.alt += move;
      this.altT += move;
    }
  }

  // Writing a camera's fov rebuilds its projection matrix, so this only writes
  // when the number has actually moved — which is never for the whole time you
  // are stood still, and it is stood still that this app is mostly about.
  _setFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 0.01) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  // Stand on a given spot looking toward another, rather than being placed a
  // set distance short of something and turned to face it.
  //
  // goStand answers "go and see that", which is the arrival every visit in this
  // app makes. Coming OUT of a building is the opposite shape: the spot is
  // decided by where the door is, and what you are looking at is whatever is in
  // front of you — nothing in particular, and certainly not the wall you just
  // came through.
  standAt(spot, facing) {
    const c = CONFIG.camera;
    keepClear(spot);
    setFrame(this.frameT, spot, facing);
    this._lift = 1;
    this.seated = false;
    this._standOn(spot);
    this.altT = this.eyeAlt;
    this.lookPitchT = c.restLookPitch;
  }

  // Turn to face a spot on the surface without moving off the one you are on.
  // The doorway uses it when a walk opens the door: you are already at the wall,
  // so there is nowhere to be put — only a direction to be squared up with.
  aimAt(dir) { this._aimAt(dir); }

  // Arrive at the target pose at once, with nothing left owed.
  //
  // For handing the camera to something else. Every pose here is a smoothed
  // value chasing a target, and freezing mid-chase does not stop the debt — it
  // banks it, and the whole of it is paid out in the first frames after control
  // comes back. Measured going indoors: the walk to the doorstep was 12.7 units
  // of arc, the lead beat eased 9.7 of them, and the remaining 3.0 were still
  // sitting there when you came out again minutes later — so stepping back onto
  // the grass slid you three units sideways for no reason you could see.
  settle() {
    this.frame.copy(this.frameT).normalize();
    this._syncFrame();
    this.lookPitch = this.lookPitchT;
    this.alt = this.altT;
    this.drive = 0;
    this.goto = null;
    // A hop is a debt of the same kind: settle mid-air and the remainder of
    // the arc would play out under whoever took the camera. So is the dash —
    // but not `sprintOn`, which is the button still under a thumb and will
    // honestly re-ease from zero if it stays held.
    //
    // Put down on whatever is under the spot rather than on the planet, since
    // settle follows every teleport and a teleport can land you anywhere. The
    // altitude is re-read afterwards because `_standOn` moves the surface the
    // eye is measured from, and `altT` was set before anybody knew where that
    // surface was going to be.
    this._standOn(this.anchor);      // clears the pull with it
    if (this.altT <= CONFIG.camera.eyeHeight + this.body.stand + 1e-3) {
      this.altT = this.eyeAlt;
      this.alt = this.altT;
    }
    this._dash = 0;
    // Getting up is a debt of the same kind — settle mid-rise and the rest of
    // it would be spent refusing the first steps of whoever took the camera.
    this._rising = 0;
    this.travelDir.copy(this.forward);
    // The walking lens is a debt like any other. Left kicked in, the doorway
    // would carry a wider camera through the threshold and the room on the far
    // side would be built with it — and since nothing indoors ever runs the
    // update that winds it back, it would still be there when you came out.
    this._setFov(CONFIG.camera.fov);
  }

  // `enableGyro`, `_onOrient` and `recentreGyro` stood here. The reasoning for
  // their removal is with the fields they wrote, at the top of the constructor.
  //
  // Nothing replaces them, and that is the point: this class no longer asks the
  // browser for a sensor, no longer holds a permission that can be refused, and
  // no longer has a second opinion about where you are looking. The one thing
  // outside it that has to change with them is the start gate in main.js, which
  // was carrying the iOS gesture requirement.

  update(dtMs, now) {
    const c = CONFIG.camera;
    const R = CONFIG.globe.radius;
    // Against the clock, not a fixed slice per frame. The old constant 0.085
    // meant the camera settled in half the time on a 120Hz phone as on a 60Hz
    // one — the same swipe, a different feel, decided by hardware nobody chose.
    // The walk throttle below has always done it this way; now so does this.
    const s = 1 - Math.exp(-dtMs / c.smoothMs);

    if (this.w > 0.5 && now - this.lastTouch > c.idleSpinAfterMs) {
      this.frameT.premultiply(_q.setFromAxisAngle(WORLD_UP, c.idleSpin * dtMs));
    }

    // One slerp replaces easing a latitude, a longitude and a bearing
    // separately. It also takes the short way round on its own, which is what
    // the angle-wrapping helper was for, and it has no seam at the poles or at
    // the date line because there are none to have.
    this.frame.slerp(this.frameT, s).normalize();
    this._syncFrame();

    this.lookPitch += (this.lookPitchT - this.lookPitch) * s;
    this.alt += (this.altT - this.alt) * s;

    // Measured from the eye's LANDED height, not from the planet. Stand on a
    // table and `alt` is a table taller than it was; against a fixed eyeHeight
    // that reads as having left the ground, and the camera starts swinging back
    // toward the globe view while you are stood on somebody's furniture.
    const w = smoothstep(clamp((this.alt - this.eyeAlt) / (c.orbitAlt - this.eyeAlt), 0, 1));
    this.w = w;

    if (this.isFirstPerson) {
      this._walk(dtMs);
      // After the walk, because it asks what is under where you now ARE: run it
      // first and a step that carried you off a table would be judged against
      // the spot you left.
      this._fall(dtMs);
    } else {
      this._coast(dtMs);
      // Nothing to stand on up here, and a fall left half-finished would be
      // waiting to resume the moment you set down somewhere else entirely. The
      // pull goes with it for the same reason: it is a debt against a surface
      // you have just left, and paying it out on landing somewhere else would
      // ease the eye up out of ground it was never under.
      this.body.release();
    }

    // The walk cycle: head rises on each footfall, and tips a little from side
    // to side across the pair. Scaled by the throttle, so it fades in and out
    // with the easing rather than switching on.
    const p = CONFIG.player;
    const gait = Math.min(1, Math.abs(this.drive));

    // ...and the lens opening a little with it. Only down on the ground, where
    // there is ground streaming past the edges of the frame for it to be about:
    // faded out by `w` as well as by the gait, so nothing is left kicked in on
    // the way up even though _coast has already wound the throttle down anyway.
    // A sprint opens it further — see player.sprintFov — riding the same gait
    // gate, so a held button with the stick idle still widens nothing.
    // ...and NOT IN A SELFIE, where both of these are cockpit effects with no
    // cockpit. The lens is out in front of you now: a walk kick and a head bob
    // applied to it read as the CAMERA being jostled by somebody else's feet,
    // which is the one thing a held-out arm does not do. The body still bobs —
    // it has its own walk cycle — so the movement is all still there, in the
    // half of the picture that should have it.
    const fp = 1 - this.selfie;
    this._setFov(c.fov + (c.walkFov + p.sprintFov * this._dash) * gait * (1 - w) * fp);

    const bob = Math.abs(Math.sin(this.stepPhase)) * p.bobAmp * gait * fp;
    const roll = Math.sin(this.stepPhase * 0.5) * p.rollAmp * gait * fp;

    // The jump rides beside the bob, in the one place height is composed —
    // exactly where the hop's parabola used to be added, and meaning the same
    // thing whenever a jump ends where it began. Where it does not, `alt` has
    // already been moved by the same amount in the other direction (see _fall),
    // so the sum never jumps. `body.lift` is that gap less the pull, which is
    // what makes the cancellation true of CATCHES as well as of falls; the
    // reasoning is with the number, in walker.js.
    //
    // It finishes on its own clock even if a pinch starts a climb mid-air — half
    // a second of half a unit against a climb of tens is invisible, and cutting
    // it dead would be a pop where nothing popped.
    const height = R + this.alt + bob + this.body.lift;

    const A = this.anchor;
    this.facing(this._T);

    // Swing back off the overhead line as we rise, or the far view would be
    // straight down at our own feet instead of a three-quarter of the planet.
    this._axis.crossVectors(A, this._T).normalize();
    this._pos.copy(A).applyAxisAngle(this._axis, -c.tiltBack * w).multiplyScalar(height);

    // Look target runs from a point out at the horizon to the planet's centre.
    const pitch = clamp(this.lookPitch, c.minLookPitch, c.maxLookPitch);
    this._fwd.copy(this._T).multiplyScalar(Math.cos(pitch)).addScaledVector(A, Math.sin(pitch));
    this._look.copy(A).multiplyScalar(height).addScaledVector(this._fwd, c.lookAhead);
    this._look.lerp(ORIGIN, w);

    // ROUND TO THE FRONT, if the view is swung. Everything above has already
    // decided where you are looking FROM on your own eyeline; this takes that
    // pose and turns it into the other one, on a blend, and nothing that ran
    // before it has been changed.
    //
    // Eased here rather than at the switch so the swing survives being toggled
    // mid-stride, and so the two poses are always the same two endpoints.
    this.selfie += ((this.selfieOn && this.isFirstPerson ? 1 : 0) - this.selfie)
      * (1 - Math.exp(-dtMs / p.selfieEaseMs));
    if (this.selfie > 0.001) this._selfiePose(A, R, height, dtMs);

    this.camera.position.copy(this._pos);
    // Local up, so the horizon stays level while stood on the ground and the
    // roll stays stable once you are off it.
    this.camera.up.copy(A);
    if (roll !== 0) {
      this._viewDir.copy(this._look).sub(this._pos).normalize();
      this.camera.up.applyAxisAngle(this._viewDir, roll);
    }
    this.camera.lookAt(this._look);
  }
}
