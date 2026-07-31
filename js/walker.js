// THE VERTICAL, for anything that stands on this planet.
//
// Gravity, the surface underfoot, and the traffic between the two. It was a
// private corner of the camera rig — `stand`, `feet`, `_vy`, `_air`, `_pull`,
// `_reach` and `_fall`, all of them underscored and none of them reachable — and
// pulling it out here is what ends the one real asymmetry in the world's rules:
// the player integrated a height under gravity and could come to rest on a
// stump, while the cast lived at radius zero forever and would have walked
// through the same stump's cut face at ankle level. Two sets of physical laws in
// one world, kept apart only by the fact that nobody had yet given the cast a
// reason to stand on anything.
//
// Nothing here knows about a camera, an eye height, or a walk. It answers one
// question — HOW HIGH ARE THIS BODY'S FEET — and it answers it the same way for
// everybody who asks.
//
// TWO STATES AND THE TRAFFIC BETWEEN THEM. In the AIR the feet integrate under
// gravity until they meet whatever is beneath them, which is how a hop can
// finish on a stump it did not start on. On the GROUND the feet follow the
// surface: a rise of up to `stepUp` is walked up without asking, and ground that
// falls away is walked off, which starts a fall with no upward speed rather than
// a jump.

import { CONFIG } from './config.js';
import { groundUnder } from './sphere.js';

// GRAVITY IS THE WORLD'S, AND IT IS DERIVED FROM THE PLAYER'S JUMP.
//
// Every walker falls at this rate, whatever its own gait numbers say, and that
// is deliberate rather than a simplification. A pull is a property of the planet
// — two bodies dropping off the same table at different rates is the sort of
// thing that reads as a bug long before anybody works out what they are seeing.
//
// It comes off `hopHeight` and `hopMs` because those are the two numbers that
// are actually TUNED: for a symmetric arc peaking at H after T/2, g is 8H/T².
// Written as a conversion rather than as a constant so the pair keep meaning
// exactly what they say — a taller or slower hop stays a hop, and the world's
// pull follows it instead of quietly disagreeing with the one jump anybody can
// see. The cast carry no hop of their own for this reason: theirs is a drawn
// bounce in _animate, not a body leaving the ground, so there is nothing there
// for a second gravity to be derived from.
function gravity() {
  const p = CONFIG.player;
  return (8 * p.hopHeight) / ((p.hopMs / 1000) ** 2);
}

export class Walker {
  // `tune` is the body's own gait — stepUp, mantle, ledge and pullMs. It is held
  // by reference rather than copied, so a live edit to CONFIG in the console
  // reaches a walker that already exists, which is how every other feel number
  // in this project behaves.
  constructor(tune) {
    this.tune = tune;

    //   stand   the height of the surface holding you up. 0 is the planet.
    //   feet    where your feet actually are. Equal to `stand` while you are
    //           stood on something, and only different in the air.
    //   vy      how fast they are moving, under gravity.
    this.stand = 0;
    this.feet = 0;
    this.vy = 0;
    this.air = false;

    // How far BELOW the surface the DRAWN body still is, while it catches up
    // with a snap the model already made — see `pullMs`. It is the only one of
    // these five that is not part of the model at all: nothing asks it where the
    // body is, and it exists so that a ground height which has to change
    // instantly does not have to LOOK as though it did.
    this.pull = 0;
  }

  // How high this body is allowed to treat itself as being, for deciding what is
  // a wall and what is a floor. ONE number, asked by the step refusal, the
  // stuck-escape and the mount, because three answers to "how high are you" is
  // three chances for a lip you can climb onto but not stand on.
  //
  //   on the ground   your feet plus the kerb you may walk up
  //   rising          your feet plus the ledge you may catch
  //   falling         your feet, and nothing added — a surface you are dropping
  //                   past is not one you are getting onto
  get reach() {
    const t = this.tune;
    if (!this.air) return this.feet + t.stepUp;
    return this.feet + (this.vy > 0 ? t.mantle : 0);
  }

  // Where the feet should be DRAWN, as opposed to where they are. The two differ
  // only while a catch or a kerb is still easing off.
  get drawFeet() { return this.feet - this.pull; }

  // ...and the same thing measured from the surface this body belongs to, which
  // is the form a renderer wants: it is zero for anybody stood still on anything,
  // whatever height that anything is, so it composes as a pure offset on top of a
  // height that already accounts for `stand`. See the rig, where it rides beside
  // the walk bob in the one place height is put together.
  get lift() { return this.drawFeet - this.stand; }

  // Put the feet on whatever is under a spot, and forget any fall in progress.
  // For arrivals, which CHOOSE a place to be rather than travelling to one.
  //
  // Asked with infinite reach, so it finds the highest thing under the spot
  // rather than the highest thing this body could have fallen onto — an arrival
  // is placed, not dropped.
  //
  // No ledge margin here, unlike every other reader. The ledge is the overhang
  // you keep while WALKING off something, and an arrival has not walked
  // anywhere — granted it, a spot chosen beside a table (which is where a
  // keep-clear puts every spot near one, at wallKeep out from its rim) counts as
  // over the table, and the body is placed standing on the furniture without
  // having jumped. That was six of the six pieces in the room, on arrival,
  // before anybody touched a control.
  standOn(dir) {
    this.stand = groundUnder(dir, Infinity);
    this.feet = this.stand;
    this.vy = 0;
    this.air = false;
    // Nothing to catch up with: this is a placement, not a movement, and a lag
    // carried into one would ease the body up from a spot it was never at.
    this.pull = 0;
  }

  // Leave the ground under one's own power. True when the jump actually started,
  // which is what a caller keys an answering gesture on.
  //
  // Refused mid-air: feet that are already off the ground cannot push off it
  // again, and re-arming on the way down would let a rhythm of taps hold a body
  // hovering. Whether there is any ground to jump FROM is the caller's question,
  // not this one's — the rig refuses it off the planet, and nothing else jumps.
  hop() {
    if (this.air) return false;
    const t = this.tune;
    // The speed that makes hopHeight over hopMs under the gravity above: for a
    // symmetric arc peaking at H after T/2, v0 is 4H/T.
    this.vy = (4 * t.hopHeight) / (t.hopMs / 1000);
    this.air = true;
    return true;
  }

  // Off the planet entirely — flying, or carried. There is nothing to stand on
  // up here, and a fall left half-finished would be waiting to resume the moment
  // this body set down somewhere else. The pull goes with it for the same
  // reason: it is a debt against a surface just left, and paying it out on
  // landing somewhere else would ease the body up out of ground it was never
  // under.
  release() {
    if (this.air) {
      this.air = false;
      this.vy = 0;
      this.feet = this.stand;
    }
    this.pull = 0;
  }

  // One frame of the vertical, at `dir`. Returns how far the SURFACE underfoot
  // moved, which is zero on almost every frame.
  //
  // That return is the whole of what a caller has to do about this, and it
  // matters most to whoever is drawing an eye rather than a body: MOVING `stand`
  // MUST MOVE THE EYE'S OWN HEIGHT WITH IT, by the same amount, or every arrival
  // on a table is a lurch. Height composes as `alt + lift`, so adding d to
  // `stand` and d to `alt` leaves the sum where it was — the eye does not jump at
  // the moment of landing, it simply stops falling. A body drawn straight off
  // `drawFeet` has nothing to do with it and can ignore the number.
  update(dtMs, dir) {
    const t = this.tune;
    const R = CONFIG.globe.radius;
    // A long frame — a tab coming back from the background — must not drop a
    // body through the floor before anybody has had a chance to see where it was.
    const dt = Math.min(dtMs, 50) / 1000;
    const ledge = t.ledge / R;
    const g = gravity();

    let move = 0;
    if (this.air) {
      const rising = this.vy > 0;
      this.vy -= g * dt;
      this.feet += this.vy * dt;
      // NO LEDGE WHILE RISING, and that one asymmetry is what keeps the mantle
      // honest. The ledge is forgiveness for LEAVING a surface — it stops a floor
      // sampled once a frame dropping you the moment your centre clears the rim —
      // and it has no business being forgiveness for ARRIVING on one. Granted
      // both ways it is wider than wallKeep, so the spot the walk stops you at is
      // already inside the grab: measured, hopping on the spot while pressed
      // against a table climbed onto it, for all six pieces of furniture and
      // without anybody asking to go up. Withheld on the way up, you have to put
      // yourself over the thing — a tenth of a unit of walking, which is nothing
      // while you hold the stick and impossible while you do not.
      const ground = groundUnder(dir, this.reach, rising ? 0 : ledge);
      // Rising: catch the lip. `reach` has already added the mantle, so this
      // fires for a surface up to that far above the feet — the pull-up onto a
      // table that the jump alone cannot reach. Falling: land on it, and reach
      // adds nothing, so only a surface genuinely at or under the feet counts.
      if ((rising && ground > this.stand + 1e-4) || (!rising && this.feet <= ground)) {
        // Banked BEFORE the feet are moved, because it is exactly the distance
        // they are about to be moved by. Added rather than assigned: a catch that
        // lands while an earlier one is still easing off inherits the remainder
        // instead of throwing it away, which is what stops a second pull-up
        // snapping out the first.
        this.pull += ground - this.feet;
        move = ground - this.stand;
        this.feet = ground;
        this.stand = ground;
        this.vy = 0;
        this.air = false;
      }
    } else {
      const ground = groundUnder(dir, this.reach, ledge);
      if (ground > this.stand + 1e-4) {
        // A kerb. Anything taller than stepUp is not reachable this way — it is
        // solid until you are above it, so the walk never brought you here.
        //
        // It banks the same lag as a catch, and it needs it just as badly: a step
        // up is a whole kerb of movement in one frame, arriving while you walk on
        // the flat.
        this.pull += ground - this.feet;
        move = ground - this.stand;
        this.stand = ground;
        this.feet = ground;
      } else if (ground < this.stand - 1e-4) {
        // Walked off the edge of something. No upward speed: a step off a table
        // is a step, not a leap.
        this.air = true;
        this.vy = 0;
      }
    }

    // ...and the lag giving itself up. Against the clock like everything else
    // that eases here, so it means the same on a 120Hz phone as on a 60Hz one.
    // Zeroed rather than left to decay forever, since it is added into a position
    // every frame and an exponential never actually arrives.
    if (this.pull !== 0) {
      this.pull *= Math.exp(-dtMs / t.pullMs);
      if (Math.abs(this.pull) < 1e-4) this.pull = 0;
    }
    return move;
  }
}
