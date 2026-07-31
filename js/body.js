// YOUR OWN BODY, seen from outside it.
//
// On the ground there is nothing here to do: you are inside your own head, the
// body is not drawn, and it stands exactly where the camera stands. Everything
// in this file is about the other case — the far view, where you have climbed
// far enough that the thing you climbed up to look at includes yourself.
//
// It was a run of state and a block of the frame loop in main.js, and it comes
// out whole because it is genuinely one idea with one input (where the rig is)
// and one output (where the drawn body is and what it is doing). Nothing else in
// the app reads any of it except `dir`, which the shove needs.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { inBuilding, inSolid, slideAround } from './sphere.js';
import { isWater } from './weather.js';

// Between these two altitudes the body condenses from nothing to fully there.
// The low end is the floor of flight: below it you are landed, or dropping all
// the way back, and the camera is standing exactly where the body would be —
// there is nothing honest to draw from inside your own head. The high end is
// passed early in any climb, so by the time the view has tilted down enough to
// bring your own spot properly on screen, whoever is standing on it is already
// solid and the fade itself is never caught midway.
const BODY_LO = CONFIG.camera.landSnap;
const BODY_HI = 6.0;

// A leash tows the body along once your spot gets this far from it, so flying to
// the far side of the planet cannot strand the one thing you climbed up to look
// at. In world units at the globe's radius — comfortably inside the horizon at
// every altitude the body is visible at (0.96 radians of cap at the low end), so
// a towed body is off to one side of the view, never off it.
const BODY_LEASH = 2.7 / CONFIG.globe.radius;

// Whether the BODY is travelling — measured on the body, not on the anchor, so
// the hop plays for the thing you can actually see moving. The threshold sits
// well under both walking speeds (the rig's 1.7, the cast's 0.8) and above both
// the tail of an ease settling and the idle drift of the planet, which at
// 0.000016 rad/ms tows the body at 0.13 and must never set it hopping.
const BODY_STEP = 0.35;

// How far off the grass the glide rides, at full height. A little over half the
// body's own height, which separates it from its shadow without pushing it far
// enough toward the camera to grow.
const GLIDE_LIFT = 1.6;

// ...and what it takes to leave the ground at all.
//
// A glide is not a way of standing, it is what you do at speed. Momonga walks
// like anybody else — the same hop the whole cast uses — and only leaps into the
// sheet with its arms out when the ground is genuinely tearing past. Tying the
// pose to altitude instead had the body gliding through every idle moment up
// there, arms out over a planet nobody was moving.
//
// Measured off the body rather than chosen: the planet's own idle drift tows it
// at 0.12, an ordinary swipe peaks at 5.3, and a hard one averages 10.9 and tops
// out past 14. Ten sits in the gap between the last two — clear of every
// ordinary look around, and just under the average of a proper shove, so a hard
// swipe still commits rather than skimming the threshold. For scale it is also
// six times the rig's own walking speed of 1.7, which is what "an incredible
// speed" has to mean for a creature this size.
const GLIDE_SPEED = 10.0;

// Dropping back to a walk takes a bigger slowdown than launching took, so a
// speed sitting on the threshold cannot strobe the pose between two drawings.
const GLIDE_DROP = 0.6;

// The launch and the settle, as a time constant. Short, because this is a jump:
// long enough that the body rises into the air rather than teleporting there,
// brief enough that it still reads as a push off the ground.
const GLIDE_EASE_MS = 200;

// THE TRANSIT RULES, for the towed body only. These used to be the ONLY thing
// keeping a drawn body out of a trunk, because the camera was allowed through
// one; the camera is stopped by the same props now (see SOLIDS in sphere.js), so
// most of what follows fires only while you are airborne and the leash is long
// enough for the body to lag across something you have flown over. It is kept
// for exactly that, and because a card sliding through a trunk is not a freedom
// anybody enjoys, it is a bug they can see. So while the body is visible and
// being towed:
//
//   The house and the solid props (trees and stumps) deflect it, at the same
//   berth the wandering cast gives a wall. Deflection can hold the body a prop's
//   radius past the leash, which is fine: the leash exists so you cannot be
//   STRANDED, and "beside the tree your spot is under" is not stranded. The
//   moment the body fades out it follows the anchor exactly, so none of this can
//   fight the landing snap.
//
//   Water is not dodged, it is JUMPED — the one answer to "crosses a lake" that
//   this particular character has always had. Being over water feeds the same
//   latch the speed does, so the arms-out sheet and the lift ride the one ease
//   whichever reason put them there. The margins are hysteresis: wider to stay
//   wet than to get wet, so a tow crawling along a shoreline cannot strobe the
//   pose at the water's edge.
const WATER_ENTER = 0.012;   // radians past the shore before the jump begins
const WATER_STAY = 0.04;     // ...and how far clear it lands on the far side

// The pace the body makes FOR ITSELF when the leash alone would leave it
// somewhere wrong — sliding round a trunk or a wall, and carrying a jump on to
// the far shore when the tow stops over the pond. A jump has to finish: the
// leash is content to park the body mid-air over the water it was crossing, and
// a glide frozen over a pond is nobody's idea of a jump, so while wet it walks
// itself on toward your spot, which the rig guarantees is dry ground. Walking
// pace, not glide pace — this is the landing half of a leap and the tread of a
// detour, and both should read as feet, not physics.
const CARRY_SPEED = 3.4;

const _axis = new THREE.Vector3();

export class TowedBody {
  // `you` is the Character drawn as the player — driven, so nothing in it
  // decides where it goes; this does, and hands it over through standAt.
  constructor({ rig, you }) {
    this.rig = rig;
    this.you = you;

    // WHERE THE BODY IS, which is not where the camera is once you are off the
    // ground — and the two being the same thing is what made the far view look
    // broken.
    //
    // The rig's anchor is both "the point you are above" and "where you would
    // land", and a globe-view swipe moves it: that is what makes spinning the
    // planet also carry your spot around. Stood the body on the anchor and the
    // camera is derived from that same anchor, so the two can never move
    // relative to each other — measured at NDC 0.324 before a 3.8-unit swipe and
    // NDC 0.324 after it, the identical pixel. The planet turned under a Momonga
    // nailed to the glass, which reads as a sticker on the lens rather than
    // somebody stood in a field.
    //
    // So off the ground the body keeps its own spot and simply stays on the
    // grass it was standing on, exactly like a tree does — it rotates with the
    // terrain, slides across the view, and goes over the curve if you fly far
    // enough. That is the whole fix: parallax it could not have while it was
    // welded to the eye.
    this.dir = rig.anchor.clone();
    this._prev = this.dir.clone();

    this.moving = false;
    this.overWater = false;
    // Latched (with the hysteresis above) and then eased, so `glide` is both the
    // decision and how far into it the body has got.
    this.gliding = false;
    this.glide = 0;
  }

  update(dtMs, now, camera) {
    const rig = this.rig;
    const you = this.you;
    const dir = this.dir;

    // Only there at all once you are high enough not to be standing inside your
    // own head — see BODY_LO/BODY_HI — and on your own patch of ground rather
    // than under the camera.
    const fade = Math.min(1, Math.max(0, (rig.alt - BODY_LO) / (BODY_HI - BODY_LO)));

    // The leash tightens as you come down, and reaching zero exactly where the
    // body finishes fading is what removes the last seam: on the way up the body
    // is released to stay behind, and on the way down it is drawn home, arriving
    // under your feet at the very moment it stops being visible. Nothing ever
    // jumps, and standing where you land is guaranteed rather than corrected — a
    // leash of zero IS "follow the anchor exactly", so the walk on the ground
    // needs no separate case.
    const leash = BODY_LEASH * fade;
    const gap = dir.angleTo(rig.anchor);
    if (gap > leash) {
      _axis.crossVectors(dir, rig.anchor);
      // Zero only if the two are already the same direction, or opposed — and
      // opposed cannot happen, since the leash is enforced every frame from a
      // gap that starts at nothing.
      if (_axis.lengthSq() > 1e-12) {
        dir.applyAxisAngle(_axis.normalize(), gap - leash).normalize();
      }
    }

    // The transit rules — see WATER_ENTER above. After the tow and before the
    // speed is read, so a detour is part of the motion the hop plays for. One
    // circle per kind per frame: a slide that lands in a neighbouring circle —
    // trees come in stands — is that circle's business next frame.
    if (fade > 0) {
      const keep = CONFIG.wander.wallKeep;
      const carry = (CARRY_SPEED / CONFIG.globe.radius) * (dtMs / 1000);
      const wall = inBuilding(dir, keep);
      if (wall) slideAround(dir, wall, rig.anchor, keep, carry);
      // The trunk rather than the canopy — see SOLIDS in sphere.js. This used to
      // ask the sightline list, which is the whole drawn width, so a body being
      // towed past a tree swung out to the edge of its LEAVES: a stride and a
      // half of visible detour around thin air, and in the opposite direction
      // from the camera, which walked straight on through. Now that the camera
      // is stopped at the trunk the two agree, and this fires only where it
      // still can — while you are airborne and the leash is long enough for the
      // body to lag across something you have already flown over.
      const prop = inSolid(dir, keep);
      if (prop) slideAround(dir, prop, rig.anchor, keep, carry);
      // Over water, which is what turns a walk into a crossing — the body is
      // towed and the glide comes on however slowly you are moving. A frozen
      // pond is not a crossing: you are standing on it. Gliding over ice you
      // could walk on is the one thing that would give the whole trick away.
      this.overWater = isWater(dir, this.overWater ? WATER_STAY : WATER_ENTER);

      // Carry the jump through to the far shore — see CARRY_SPEED.
      if (this.overWater && dtMs > 0) {
        const on = Math.min(dir.angleTo(rig.anchor), carry);
        if (on > 1e-6) {
          _axis.crossVectors(dir, rig.anchor);
          if (_axis.lengthSq() > 1e-12) {
            dir.applyAxisAngle(_axis.normalize(), on).normalize();
          }
        }
      }
    } else {
      this.overWater = false;
    }

    if (dtMs > 0) {
      const speed = (this._prev.angleTo(dir) * CONFIG.globe.radius * 1000) / dtMs;
      this.moving = speed > BODY_STEP;
      // Harder to enter than to stay in — see GLIDE_DROP. Water overrides the
      // speed question entirely: however slowly you are towed, a crossing flies.
      this.gliding = this.overWater
        || speed > (this.gliding ? GLIDE_SPEED * GLIDE_DROP : GLIDE_SPEED);
      this._prev.copy(dir);
    }
    this.glide += ((this.gliding ? 1 : 0) - this.glide) * (1 - Math.exp(-dtMs / GLIDE_EASE_MS));

    // Standing and walking are the default; the glide is the exception, and it
    // is speed that buys it. The fade multiplies the lift as well as the pose,
    // so a body still condensing into view cannot be caught halfway up in
    // mid-air, and one on the ground is always on its feet — which is also what
    // a mirror or a still pool will want to reflect.
    you.standAt(dir, dtMs, {
      walking: this.moving,
      lift: GLIDE_LIFT * this.glide * fade,
      posture: fade > 0 && this.glide > 0.5 ? 'fly' : 'stand',
    });
    you.fade = fade;
    you.root.visible = fade > 0.004;
    if (you.root.visible) you.update(dtMs, now, camera);
  }
}
