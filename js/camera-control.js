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
  inSolid, solidNormal, keepOffSolids,
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

    this.gyroHeading = 0;
    this.gyroPitch = 0;
    this.gyroBase = null;

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
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._viewDir = new THREE.Vector3();
    this._onOrient = this._onOrient.bind(this);
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
  get eyeAlt() { return this.body.stand + CONFIG.camera.eyeHeight; }

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

  markTouched(now) { this.lastTouch = now; }

  // One meaning or the other, never a blend of both. Blending them was what
  // made the middle of the zoom feel like neither mode.
  applyDrag(dx, dy) {
    const c = CONFIG.camera;

    if (this.isFirstPerson) {
      // Turning on the spot: a rotation about your own up, so it post-multiplies
      // and leaves where you stand alone. Rotating about the frame's own up axis
      // is what "turn your head" means, and it needs no anchor vector to do it.
      this.frameT.multiply(_q.setFromAxisAngle(REF_UP, dx * c.headingSens));
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

  // Which way you are looking, as opposed to which way the frame faces: the
  // gyro is a bounded offset on top, faded out as you leave the ground. Both the
  // camera and the walk direction come through here, which is the point — they
  // used to disagree by exactly this term.
  _viewTangent(out) {
    const yaw = this.gyroHeading * (1 - this.w);
    out.copy(this.forward);
    return yaw === 0 ? out : out.applyAxisAngle(this.anchor, -yaw);
  }

  // The same answer, for anything outside this class that has to agree with the
  // camera about what is in front of you — which the interaction focus in
  // main.js does, since "am I facing that" is a question about what is on the
  // player's screen. `forward` is the wrong one to read from out there: with the
  // gyro live it differs from the view by exactly the offset above, and a focus
  // picked off the frame while the camera showed something else would be the
  // same disagreement this method was written to end.
  facing(out) { return this._viewTangent(out); }

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

    if (mag > 0.001) {
      this.goto = null;
      // Read against where you are LOOKING, gyro included. The view tangent
      // carries the tilt offset and the walk direction did not, so with the
      // phone held off-square the stick pushed you up to gyroShare — 0.3 radians,
      // seventeen degrees — away from straight ahead. Stick hard forward, and you
      // crabbed sideways at any latitude. Same term, same place, no disagreement.
      this._viewTangent(this._wF);
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
    const speed = this.drive * p.walkSpeed * (1 + (p.sprintBoost - 1) * this._dash);
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
    this.altT = CONFIG.camera.skyAlt;
  }

  goToGround() {
    const c = CONFIG.camera;
    this._lift = 1;
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
    setFrame(this.frameT, spot, to);
    this._lift = 1;
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
    this.travelDir.copy(this.forward);
    // The walking lens is a debt like any other. Left kicked in, the doorway
    // would carry a wider camera through the threshold and the room on the far
    // side would be built with it — and since nothing indoors ever runs the
    // update that winds it back, it would still be there when you came out.
    this._setFov(CONFIG.camera.fov);
  }

  // iOS only hands over tilt from inside a real user gesture.
  async enableGyro() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return false;
    try {
      if (typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return false;
      }
      window.addEventListener('deviceorientation', this._onOrient, true);
      return true;
    } catch {
      return false;
    }
  }

  _onOrient(e) {
    if (e.beta === null || e.gamma === null) return;
    if (!this.gyroBase) this.gyroBase = { beta: e.beta, gamma: e.gamma };
    const c = CONFIG.camera;
    // A bounded offset, never accumulated — otherwise holding the phone at an
    // angle would slowly spin you on the spot.
    const lim = c.gyroShare;
    this.gyroHeading = clamp((e.gamma - this.gyroBase.gamma) * c.gyroSens, -lim, lim);
    this.gyroPitch = clamp((e.beta - this.gyroBase.beta) * c.gyroSens, -lim * 0.6, lim * 0.6);
  }

  recentreGyro() { this.gyroBase = null; }

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
    this._setFov(c.fov + (c.walkFov + p.sprintFov * this._dash) * gait * (1 - w));

    const bob = Math.abs(Math.sin(this.stepPhase)) * p.bobAmp * gait;
    const roll = Math.sin(this.stepPhase * 0.5) * p.rollAmp * gait;

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
    this._viewTangent(this._T);

    // Swing back off the overhead line as we rise, or the far view would be
    // straight down at our own feet instead of a three-quarter of the planet.
    this._axis.crossVectors(A, this._T).normalize();
    this._pos.copy(A).applyAxisAngle(this._axis, -c.tiltBack * w).multiplyScalar(height);

    // Look target runs from a point out at the horizon to the planet's centre.
    const pitch = clamp(this.lookPitch + this.gyroPitch * (1 - w), c.minLookPitch, c.maxLookPitch);
    this._fwd.copy(this._T).multiplyScalar(Math.cos(pitch)).addScaledVector(A, Math.sin(pitch));
    this._look.copy(A).multiplyScalar(height).addScaledVector(this._fwd, c.lookAhead);
    this._look.lerp(ORIGIN, w);

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
