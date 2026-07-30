// Who is home.
//
// Every so often one of them stops wandering, walks to the house and goes in
// for a while. It is the only thing any of them does that is not a stroll, and
// it exists for two reasons: so the house is somewhere they live rather than a
// landmark they walk past, and so its lit windows mean something — you can see
// from across the planet whether anybody is in.
//
// RARE ON PURPOSE. See the note on CONFIG.household: this must read as an
// occasional event and never as a commute.
//
// A visit is a small state machine per character:
//
//   away     nothing to do; a clock is running toward the next visit
//   going    walking a route of waypoints that ends indoors, by the ordinary
//            wander machinery — an errand is just a destination they were
//            handed rather than one they picked
//   home     indoors, sat on a cushion if one is free, stood at a spot if not
//   leaving  the same route walked the other way
//   toBed    the same walk, at the one hour that is not a visit
//   asleep   lying down, drawn as a card rather than as a body
//
// THE LAST TWO ARE NOT A VISIT, and every rule above is suspended for them.
// A visit is rare, one at a time, never while you are stood there, and on a
// clock; bedtime is all three of them at once, every night, whoever is
// watching, because it is what the hour IS. See MIDNIGHT_SLEEP.md.
//
// It is also the only errand that can end somewhere other than a house: Usagi
// has no home — CONFIG.homes has two entries and the cast has three — so he
// walks to his own meadow and lies down on the grass. The state machine does
// not care which; what differs is only where the route points and who publishes
// the drawing at the end of it.
//
// There is no fade and no admit any more, because there is no other scene to
// admit anybody INTO: they walk to the doorstep, through the gap in the wall,
// and across the rug, in view the whole way — the same walk you make. What
// the waypoints are for is the door: a great circle from the far side of the
// planet to a cushion does not pass through a 1.9-unit gap by luck, so the
// route threads it deliberately — doorstep, then just inside the door, then
// the seat. Their own path-trimming (see _pickTarget) respects the wall band
// the whole way, so even a leg that gets interrupted never clips masonry.
//
// TWO HOMES NOW, and the change that made is smaller than it looks. Every
// question this file asks — where is the door, how far out is the doorstep,
// which way round the wall do I walk — was already asked of a `building`
// record rather than of "the house". What changed is that there are two of
// those records and each character is pointed at one of them. Nobody is sealed
// to their own: any of them may wander into either place on their own, and
// being indoors is still only a question of where you are stood.
import * as THREE from 'three';
import { CONFIG } from './config.js';
// Asked of daylight.js rather than of the clock, for the reason dialogue.js
// gives for doing the same: the two agree right up until somebody sets the hour
// by hand, and then one of them is wrong. Dragging the day into まよなか has to
// put the cast to bed, or the control is a picture of an hour rather than the
// hour itself.
import { activePhase } from './daylight.js';
import { keepOffSolids } from './sphere.js';

// The one hour nobody is up for.
const BEDTIME = 'midnight';

const _spot = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _cross = new THREE.Vector3();

function between(a, b) { return a + Math.random() * (b - a); }

export class Household {
  constructor({ globe, bots }) {
    this.globe = globe;
    this.bots = bots;

    // The places somebody can go home to, taken from the same registration the
    // walls themselves use — so the door they thread is the door that is
    // actually open, and a moved door moves their route with it.
    //
    // A home with no `building` never got its wall registered, which means its
    // landmark was never scattered. It is not a place you can walk into, so it
    // is not a place anybody walks to.
    this.places = globe.homes.filter((h) => h.building).map((h) => ({
      home: h,
      dir: h.sprite.normal,
      building: h.building,
      style: h.style,
      walk: h.spec.walk,
      doorAt: (h.building.r + CONFIG.wander.wallKeep) * CONFIG.globe.radius + 0.4,
    }));

    // `doorAt` above is THEIR OWN WANDER BERTH on top of the wall, never the
    // doorstep a tap sets you down on. This is a lesson the file has already
    // learned once — the original said it plainly, "or they would arrive at a
    // spot they are already refusing to take the last step toward", and a
    // rewrite replaced it with interior.doorstep, which is 3.8 against a berth
    // of 3.92.
    //
    // Four hundredths inside the fence is enough to hang the whole errand. A
    // walk is planned by stepping toward the target and stopping at the first
    // sample that is somewhere they may not be, so a target inside the berth
    // gets the plan trimmed short of itself; approach it from a bearing where
    // the trim bites on the first sample and the plan comes back as "stay
    // where you are", which rests and re-picks and rests again. Measured: a
    // character stood 4.6 out never moved for the full 150 seconds of
    // headingMax, and because heading counts against `atOnce` nobody else
    // could go home either. It read as the house being shut, not as a bug.

    const h = CONFIG.household;
    this.state = new Map();
    for (const b of bots) {
      this.state.set(b, {
        phase: 'away',
        route: null,     // waypoints still to walk, first is current errand
        legs: 0,         // how many were left when progress was last seen
        litUp: null,     // the lights they switched off on their way to bed
        seat: null,      // the seat they are holding, or null
        until: 0,        // when a stay ends
        giveUpAt: 0,
        // WHOSE DOOR. Matched on the `owner` written beside each home in
        // config, falling back to the first — so a fourth character added to
        // CAST without a place of their own goes to Chiikawa's, which is the
        // friendly reading rather than an error.
        //
        // Fixed for the life of the session rather than picked per visit. It is
        // where they LIVE: Hachiware turning up at Chiikawa's some evenings and
        // at his own cave on others would read as him not having one.
        place: this.places.find((pl) => pl.home.owner === b.spec.key)
          || this.places[0] || null,
        // WHOSE BED, which is not the same question as whose door.
        //
        // `place` above falls back to the first home so that a character with
        // none still has somewhere to visit — which is right for visiting and
        // wrong for sleeping: Usagi turning in at Chiikawa's every night is a
        // different character. So this one does NOT fall back, and null is the
        // answer for somebody who sleeps outside.
        own: this.places.find((pl) => pl.home.owner === b.spec.key) || null,
        // ...and whether there is a drawing of them asleep at all. Asked of the
        // scene, which built the cards and is therefore the only thing that
        // knows: a character whose sleep sheet has not been drawn has no entry,
        // never lies down, and goes on wandering through the small hours.
        sleeps: globe.sleepers.has(b.spec.key),
        // Staggered, and the first is further out than the rest, so arriving
        // does not coincide with somebody leaving.
        due: between(h.firstGapMin, h.firstGapMax),
      });
    }

    // Eased, never switched, and ONE PER PLACE: the windows coming up should
    // read as somebody crossing a room to a switch, and Chiikawa's house should
    // not light up because Hachiware got home to a cave twenty units away.
    this._lit = new Map();
    for (const pl of this.places) this._lit.set(pl, h.emptyLamps);
  }

  get anyoneHome() {
    for (const s of this.state.values()) if (s.phase === 'home') return true;
    return false;
  }

  homeCount() {
    let n = 0;
    for (const s of this.state.values()) if (s.phase !== 'away') n++;
    return n;
  }

  // A spot on the door's own bearing, `units` out from the middle of the
  // house. Positive reaches out the door onto the grass; small values are
  // inside. This is the axis every route threads, because it is the one line
  // that passes through the gap.
  _onDoorAxis(pl, units, out) {
    const arc = units / CONFIG.globe.radius;
    return out.copy(pl.dir).multiplyScalar(Math.cos(arc))
      .addScaledVector(pl.building.gapDir, Math.sin(arc)).normalize();
  }

  // The same, at any bearing round the house rather than the door's own.
  _onRing(pl, bearing, units, out) {
    const arc = units / CONFIG.globe.radius;
    _tan.copy(pl.building.gapDir).applyAxisAngle(pl.dir, bearing);
    return out.copy(pl.dir).multiplyScalar(Math.cos(arc))
      .addScaledVector(_tan, Math.sin(arc)).normalize();
  }

  // A spot inside the room, from a bearing round the house and a distance out
  // as a fraction of the walkable radius — the shape household.spots take.
  // Bearings are measured from the door, so rotating the door's own tangent
  // is what keeps them agreeing with the furniture about where "the front" is.
  _insideSpot(pl, at, outFrac, out) {
    return this._onRing(pl, at, outFrac * pl.walk, out);
  }

  // Where somebody is standing, as a signed bearing round the house measured
  // from the door: 0 is straight out of the front, and the sign says which way
  // round is shorter.
  _bearingOf(pl, dir) {
    _tan.copy(dir).addScaledVector(pl.dir, -dir.dot(pl.dir));
    if (_tan.lengthSq() < 1e-12) return 0;
    _tan.normalize();
    const g = pl.building.gapDir;
    return Math.atan2(pl.dir.dot(_cross.crossVectors(g, _tan)), g.dot(_tan));
  }

  // The route in: round to the front, onto the doorstep, through the gap, and
  // across to wherever they are headed.
  //
  // The ring is the part that had to be added, and the reason is that a
  // character cannot walk round a corner. Their pathing plans a straight line,
  // samples it, and stops at the first spot they may not stand in — so from
  // anywhere behind the house every plan aims through the building, gets
  // trimmed back to where they already are, and they rest and re-plan forever.
  // Measured: every approach from more than about 110 degrees off the door
  // never arrived at all, and since heading counts against `atOnce` it held the
  // house shut behind them. The player has none of this trouble because the rig
  // SLIDES along a wall it is refused by; the cast have no such move, so the
  // route has to do the walking-around for them.
  //
  // Hops of at most RING_STEP around a circle of RING_OUT, because a straight
  // line between two points on a circle cuts inside it: at this radius and this
  // step the deepest a leg dips is 4.8 from the middle, comfortably outside the
  // berth they refuse to cross. Widen the step and the shortcut starts clipping
  // the house again.
  // The ring ALWAYS ends on the door's own bearing before turning inward, and
  // that last hop is the one that makes this reliable rather than likely. Stop
  // the ring at the character's remaining bearing and the final leg runs
  // diagonally from the ring to the doorstep, which clips the berth on the way
  // past often enough to matter: measured from 46 degrees off the door, three
  // approaches in six never arrived. Ending on bearing 0 makes the last two
  // legs purely RADIAL — straight down the line the gap is cut along, the one
  // heading that cannot graze the wall on either side.
  _routeIn(pl, destDir, fromDir) {
    const RING_STEP = 0.8;
    const RING_OUT = Math.max(pl.doorAt + 1.2, 5.5);
    const legs = [];
    const b = fromDir ? this._bearingOf(pl, fromDir) : 0;
    if (Math.abs(b) > 1e-3) {
      const hops = Math.ceil(Math.abs(b) / RING_STEP);
      for (let i = 0; i <= hops; i++) {
        legs.push(this._onRing(pl, b * (1 - i / hops), RING_OUT, new THREE.Vector3()));
      }
    } else {
      legs.push(this._onRing(pl, 0, RING_OUT, new THREE.Vector3()));
    }
    legs.push(this._onDoorAxis(pl, pl.doorAt, new THREE.Vector3()));
    // JUST INSIDE THE DOOR — and pushed off anything standing there, which is
    // not a refinement but the difference between this route working and not.
    //
    // The spot is a fixed fraction of the walk radius along the door's own
    // line, which says nothing about what is furnished there. In the cave it
    // lands on the cardboard box: `wallKeep` is 0.72 and the box's footprint
    // 0.36, so a body may come no nearer than 0.70 to a waypoint that has to be
    // reached within 0.60, and the leg can never complete. Measured while
    // building bedtime — Hachiware walked into his own cave, stalled at 0.70,
    // re-planned, and a fresh route from indoors begins by walking back out to
    // the ring, so he spent the night circling the place.
    //
    // It was never bedtime's bug: every route through this door had it, and a
    // visit merely hid it, because a visit that cannot arrive gives up after
    // `headingMax` and reads as somebody who did not feel like coming in.
    legs.push(keepOffSolids(
      this._onDoorAxis(pl, pl.walk * 0.7, new THREE.Vector3()),
      CONFIG.wander.wallKeep,
    ));
    legs.push(destDir.clone());
    return legs;
  }

  _routeOut(pl) {
    return [
      this._onDoorAxis(pl, pl.walk * 0.7, new THREE.Vector3()),
      this._onDoorAxis(pl, pl.doorAt, new THREE.Vector3()),
    ];
  }

  // A seat nobody is holding, or null. Guests take one where they can, which
  // is most of why the room reads as somewhere they live: three characters
  // stood to attention on a floor is a waiting room, one of them sat down is
  // a home.
  //
  // In THIS home, which is what stops somebody walking across the planet to sit
  // on a cushion in a room they were not going to. The seat list is shared
  // across both interiors — every seat knows which home it is in, and this is
  // the one reader that has to care.
  _freeSeat(pl) {
    return this.globe.seats.find((s) => !s.taken && s.home === pl.home) || null;
  }

  _releaseSeat(bot, s) {
    if (s.seat) s.seat.taken = null;
    s.seat = null;
    bot.ch.standUp();
  }

  // Walk the current route: keep the character's errand aimed at the head of
  // it, advance on arrival, and answer true once the whole route is walked.
  // `arriveFirst` is the tolerance for the opening leg only — generous for the
  // walk-in, whose first waypoint is a doorstep on a building four units
  // across. Every later leg is interior and uses the tighter arrival: the room
  // itself is four units across, and 0.9 would call the far side of it "here".
  _walkRoute(s, ch, tMs) {
    const R = CONFIG.globe.radius;
    const h = CONFIG.household;
    const pl = s.place;
    const head = s.route[0];
    ch.errand = ch.errand || head.clone();
    ch.errand.copy(head);
    // How near counts as arrived depends on WHERE the waypoint is, not on how
    // far down the list it sits. Outdoors it is the generous arc — they are
    // walking to a building four units across, and stopping a pace short of a
    // doorstep is still arriving at it. Indoors it has to be tight: the whole
    // room is four and a half units across, so the outdoor tolerance would
    // call the far wall "here" and sit somebody down in the doorway.
    const inside = head.dot(pl.dir) > Math.cos(pl.building.r);
    const arrive = inside ? h.homeArrive : h.arriveArc;
    if (ch.dir.angleTo(head) * R > arrive) return false;
    s.route.shift();
    if (s.route.length) {
      // A beat on the threshold rather than a wander-length rest — the walk
      // machinery grants a full rest at every arrival, and a guest who stands
      // in the doorway for eight seconds mid-errand reads as stuck, not shy.
      //
      // ...and not even a beat for somebody turning in. A visit is a thing you
      // do at your own pace and going to bed is not, so the pause on the
      // threshold is one more delay between the hour turning and the sleeping.
      ch.restUntil = ch.turningIn ? 0 : Math.min(ch.restUntil, tMs + 600);
      return false;
    }
    ch.errand = null;
    ch.walking = false;
    return true;
  }

  // ------------------------------------------------------------------ bedtime

  // Get them to bed and keep them there. Called every frame of the small hours
  // for everybody who has a drawing to lie down in.
  _toBed(bot, s, tMs) {
    const h = CONFIG.household;
    const ch = bot.ch;
    if (s.phase === 'asleep') return;

    if (s.phase !== 'toBed') {
      // Whatever they were doing, they are going to bed instead. The seat goes
      // back first: a cushion held by somebody who has gone to bed is one
      // nobody else can sit on tomorrow.
      s.phase = 'toBed';

      // THEY SET OFF ON THIS FRAME, whatever they were in the middle of. The
      // hour turning is not a suggestion, and there are four separate things
      // that would otherwise each delay it by seconds — so all four are cleared
      // here rather than waited out.
      //
      //   A CUSHION. `update` skips the wander entirely for a seated body, so
      //   somebody who was sat down when the hour turned would never walk at
      //   all — not late, never. _releaseSeat stands them up.
      //
      //   A REST. The wander rests up to six seconds between strolls, and being
      //   part way through one at midnight is the common case rather than the
      //   unlucky one.
      //
      //   A CONVERSATION. `busyUntil` holds two of them still for the length of
      //   an exchange plus `meetHoldMs`, seven seconds on its own.
      //
      //   YOU, standing nearby — which is the freeze `turningIn` lifts, and the
      //   one that did not merely delay them but stopped them for good. It is
      //   set here and stays set for the whole walk, so none of the above can
      //   creep back in halfway home.
      this._releaseSeat(bot, s);
      ch.turningIn = true;
      ch.restUntil = 0;
      ch.busyUntil = 0;
      this._aimAtBed(bot, s, tMs);
    }

    // A STALLED WALK IS RE-PLANNED, NEVER ABANDONED, and bedtime is the one
    // errand in this file that works that way. Everywhere else giving up means
    // dropping the errand, because there is always another one along later;
    // here there is not, and the alternative to arriving is a four-hour night
    // with nobody in it.
    //
    // It first tried the obvious thing — give up by lying down where they
    // stood — and that was WRONG in a way worth writing down, because it looked
    // reasonable and produced a teleport. A sleeper with a bed is drawn IN the
    // bed; the card is built into the bedding and does not travel. So a
    // character who fell asleep out on the grass vanished from the field and
    // appeared under their own quilt. Measured on the first run: Chiikawa
    // asleep 5.79 units from his own house, because the player happened to be
    // stood watching him when the hour turned and `attentive` freezes whoever
    // you are looking at.
    //
    // So: the ONLY way into `asleep` is arriving, and the way to handle not
    // arriving is to try again.
    //
    // This note used to end "somebody you stand and watch all night simply
    // stays up, which is the truer thing anyway", and that was a bug being
    // described as charm. Standing near them froze the walk outright — see the
    // exception in _wander — so the ordinary way anybody would use the time
    // pill was the one case that never worked. Re-planning is the backstop for
    // a route that has genuinely become unwalkable; it was never meant to be
    // the normal path, and it is not one.
    // GETTING ROUND A TREE IS NOT THIS FILE'S JOB, and finding that out cost a
    // whole mechanism that has since been deleted.
    //
    // A blocked walk was diagnosed here first — two trees of radius 1.19 and
    // 1.29 side by side across the line to the cave, five units of refused
    // path, Hachiware stood at the near side of them — and answered with a
    // sidestep planned in this file off the blocker's rim. It worked and it
    // should not exist: `Character._detour` already does exactly that, on every
    // errand rather than only this one, and does it better by offering the
    // sidestep to `_pickTarget` so it is fenced by every rule the direct line
    // was. Its own note records the same measurement from the same walk to the
    // same cave. Two mechanisms for one problem is worse than the slower of
    // them, so the one added here is gone.
    //
    // What that leaves this deadline as is what it always should have been: the
    // backstop for a route that has become genuinely unwalkable, not the
    // recovery for an obstacle. It resets on progress and nothing else.
    if (!s.route || !s.route.length || tMs > s.giveUpAt) {
      this._aimAtBed(bot, s, tMs);
      return;
    }
    if (this._walkRoute(s, ch, tMs)) {
      this._fallAsleep(bot, s);
      return;
    }
    // THE DEADLINE MEASURES STALLING, NOT ELAPSED TIME, and it has to: a walk
    // home crosses a planet and threads a door, and the route out to the ring
    // deliberately goes AWAY from the bed before it comes back. Timed from the
    // start, a short deadline re-plans a walk that was going perfectly — which
    // is what the first version did, measured re-planning Chiikawa every twenty
    // seconds and leaving him circling his own house forever.
    //
    // Ticking off a waypoint is proof of progress, so it buys another window.
    if (s.route.length !== s.legs) {
      s.legs = s.route.length;
      s.giveUpAt = tMs + CONFIG.sleep.retryMs;
    }
  }

  // Point them at their bed and start the clock. One place, because the walk is
  // planned twice — once on the way into `toBed` and again whenever it stalls —
  // and the two must agree about what a fresh start is.
  _aimAtBed(bot, s, tMs) {
    s.route = this._bedRoute(bot, s, bot.ch);
    s.legs = s.route ? s.route.length : 0;
    s.giveUpAt = tMs + CONFIG.sleep.retryMs;
  }

  // The way to bed: through their own door if they have one, straight across
  // the grass to their own meadow if they have not.
  _bedRoute(bot, s, ch) {
    if (s.own) {
      const to = this.globe.sleepers.get(bot.spec.key);
      if (!to || !to.walkTo) return null;
      // ALREADY INDOORS: straight to the bed, with no ring and no doorstep.
      //
      // `_routeIn` is built for an approach from OUTSIDE — it walks round to
      // the front, onto the doorstep, then in — and handing it a start that is
      // already inside produces a route whose first leg leaves the building. It
      // cannot: the leg is a straight line to a point on the ring, and from
      // indoors that line runs into the wall rather than through the one gap in
      // it. Measured on a re-plan inside the cave, Hachiware walked out to the
      // wall's inner edge and stopped dead there — pinned at 2.75 against a
      // walk radius of exactly 2.75, with nowhere legal to put the next step.
      //
      // Somebody standing in their own home has no door left to thread, so the
      // whole apparatus is not merely unnecessary here, it is the bug.
      if (ch.dir.dot(s.own.dir) > Math.cos(s.own.building.r)) {
        return [to.walkTo.clone()];
      }
      return this._routeIn(s.own, to.walkTo, ch.dir);
    }
    const spot = this.globe.sleepSpotFor(bot.spec.key);
    return spot ? [spot] : null;
  }

  _fallAsleep(bot, s) {
    const ch = bot.ch;
    ch.errand = null;
    ch.walking = false;
    // They have arrived, so there is nothing left to push past you for.
    ch.turningIn = false;
    s.phase = 'asleep';
    s.route = null;
    // Laid down WHERE THEY ARE, which is the whole of how the card and the
    // character are kept from disagreeing. Somebody with a bed is beside it and
    // the drawing is in it; somebody without one is lying exactly where they
    // stopped.
    const fit = CONFIG.sleep[bot.spec.key] || {};
    this.globe.layDown(bot.spec.key, true, ch.dir, fit.spin || 0);
    // Handed the drawing they are now lying in, so anything they mumble comes
    // from there rather than from the body standing beside the bed.
    ch.sleep(true, this.globe.sleepAnchor(bot.spec.key));

    // ...AND THEY PUT THEIR OWN LIGHTS OUT, by pressing their own switches.
    //
    // This is the only mechanism, and it has to be. The lighting rework ended
    // with the wired bulbs taken off the clock entirely — "on when the world is
    // built, on at every hour, and off only because somebody turned it off" —
    // and the whole value of that is that a dark lamp always has somebody's
    // hand behind it. A midnight rule that reached past the switch and dimmed
    // the room would put the clock back in charge of the lights by a second
    // route, and there would be no way to tell a bulb somebody turned off from
    // a bulb the hour turned off.
    //
    // So a character going to bed is a hand: the same `toggleLight` the player
    // presses, the same `_relight` behind it, the same `manual` flag recording
    // that a person spoke last. Watched from the grass, the windows going dark
    // one house at a time is somebody crossing a room to a switch, because it
    // is exactly that.
    //
    // Remembered as a LIST OF LIGHTS rather than a count, so that waking puts
    // back what this put out and nothing else — see _getUp.
    s.litUp = s.own ? this.globe.lampsBurningIn(s.own.home) : [];
    for (const L of s.litUp) this.globe.toggleLight(L);
  }

  // Morning. Also any moment the hour stops being midnight, which the scrubber
  // can make happen at any point in the night including halfway to bed.
  _getUp(bot, s, tMs) {
    const h = CONFIG.household;
    const ch = bot.ch;
    const wasAsleep = s.phase === 'asleep';
    if (wasAsleep) {
      this.globe.layDown(bot.spec.key, false);
      ch.sleep(false);
      // The lights they put out, put back — and ONLY those, only if they are
      // still off, and only if they are still in the room.
      //
      // Each of those three is a case that happens. Only those: a lamp somebody
      // else lit in the night is not this sleeper's to account for. Still off:
      // if you went in and turned one on while they slept, it is already
      // burning and they do not touch it — they also do not wake up, which is
      // the whole of what a lamp is allowed to do to somebody asleep. Still in
      // the room: a lantern you carried off is in your hand, and reaching
      // across a planet to flip its switch is not getting up in the morning.
      for (const L of s.litUp || []) {
        if (s.own && this.globe.lampIsIn(L, s.own.home) && !this.globe.lightIsOn(L)) {
          this.globe.toggleLight(L);
        }
      }
      s.litUp = null;
    }
    ch.errand = null;
    ch.walking = false;
    s.route = null;
    // Off the bedtime errand, whichever way this was reached — woken at dawn,
    // or scrubbed out of midnight halfway to bed. Walking OUT is an ordinary
    // errand again and yields to you like any other.
    ch.turningIn = false;

    // Somebody who woke up indoors WALKS OUT, by the same route and the same
    // state every guest leaves by. Left in `away` they would potter about the
    // room until a random stroll happened to thread the door, which reads as
    // being shut in rather than as getting up.
    const inside = s.own
      && ch.dir.dot(s.own.dir) > Math.cos(s.own.building.r);
    if (inside) {
      s.route = this._routeOut(s.own);
      s.phase = 'leaving';
      s.giveUpAt = tMs + h.headingMax;
      // A moment on their feet before setting off, so waking is a beat rather
      // than a body already walking.
      ch.restUntil = tMs + 1200;
      return;
    }
    s.phase = 'away';
    s.due = tMs + between(h.gapMin, h.gapMax);
  }

  update(dtMs, tMs, indoors, playerDir) {
    if (!this.places.length) return;
    const h = CONFIG.household;
    const R = CONFIG.globe.radius;
    const bedtime = activePhase() === BEDTIME;

    for (const bot of this.bots) {
      const s = this.state.get(bot);
      const ch = bot.ch;
      const pl = s.place;
      if (!pl) continue;

      // BEDTIME FIRST, and it overrides whatever else was going on — an errand
      // half walked, a stay half sat out, a clock half run down. Nothing below
      // this runs during it.
      //
      // Both directions are handled here, and both have to be, because the hour
      // can turn either way at any moment: the clock brings it round once a day
      // and the scrubber under your thumb brings it round as fast as you can
      // drag. There is no staging and no transition state — every frame simply
      // asks whether it is the hour and whether they are in the right state for
      // it, which is what makes a finger thrashing the boundary harmless.
      if (bedtime && s.sleeps) {
        this._toBed(bot, s, tMs);
        continue;
      }
      if (s.phase === 'toBed' || s.phase === 'asleep') {
        this._getUp(bot, s, tMs);
        continue;
      }

      if (s.phase === 'away') {
        if (tMs < s.due) continue;
        // Never while somebody else is in, nor mid-conversation, nor while you
        // are stood right there — walking off the moment you arrive is the one
        // version of this that reads as rude rather than as having somewhere
        // to be.
        //
        // The proximity check is not politeness alone, it is the difference
        // between an errand and a character stuck forever. Standing within
        // `closeArc` freezes them where they are, by the same rule that has
        // them wait while you visit — so an errand handed out at that range is
        // one they can never take a single step of, and they would hold it
        // until you happened to wander off.
        const crowded = playerDir
          && ch.dir.angleTo(playerDir) * R < CONFIG.wander.closeArc + 1.5;
        if (this.homeCount() >= h.atOnce || ch.attentive || crowded || tMs < ch.busyUntil) {
          s.due = tMs + 12000;
          continue;
        }
        // Sit if a seat is free, stand at a spot if not — decided now, and the
        // seat held from now, so nobody crosses the planet for a cushion that
        // was taken while they walked.
        s.seat = this._freeSeat(pl);
        if (s.seat) {
          s.seat.taken = ch;
          s.route = this._routeIn(pl, s.seat.dir, ch.dir);
        } else {
          const spot = h.spots[0] || { at: Math.PI, out: 0.5 };
          s.route = this._routeIn(pl, this._insideSpot(pl, spot.at, spot.out, _spot), ch.dir);
        }
        s.phase = 'going';
        s.giveUpAt = tMs + h.headingMax;
        continue;
      }

      if (s.phase === 'going') {
        // Give up if it is taking implausibly long — the only thing that can
        // hold a walk forever is you standing next to them, which freezes them
        // by the same rule that has them wait while you visit. Without this
        // they hold the house shut behind them: heading counts against
        // `atOnce`, so nobody else can go home either. If they had already
        // made it indoors, though, the way to give up is to leave — abandoning
        // the errand mid-room would strand them pacing a floor whose only way
        // out is a gap their random strolls rarely thread.
        if (tMs > s.giveUpAt) {
          const inside = ch.dir.dot(pl.dir) > Math.cos(pl.building.r);
          this._releaseSeat(bot, s);
          if (inside) {
            s.route = this._routeOut(pl);
            s.phase = 'leaving';
            s.giveUpAt = tMs + h.headingMax;
          } else {
            ch.errand = null;
            s.route = null;
            s.phase = 'away';
            s.due = tMs + between(h.gapMin, h.gapMax);
          }
          continue;
        }
        if (!this._walkRoute(s, ch, tMs)) continue;
        // Arrived. Down onto the cushion, or settled at the spot.
        if (s.seat) ch.sitAt(s.seat.dir, s.seat.y);
        s.phase = 'home';
        s.until = tMs + between(h.stayMin, h.stayMax);
        continue;
      }

      if (s.phase === 'home') {
        // Stood or sat where they are: no strolling indoors. The rest is
        // pinned ahead rather than set once, so an interruption — a chat, you
        // walking in — never leaves a stale clock that frees them to wander
        // through a wall.
        ch.restUntil = Math.max(ch.restUntil, tMs + 1500);
        // They stay as long as they meant to — unless you are in there with
        // them, in which case leaving the moment you arrived would be the
        // unfriendliest thing in the app.
        if (tMs < s.until || indoors) continue;
        this._releaseSeat(bot, s);
        s.route = this._routeOut(pl);
        s.phase = 'leaving';
        s.giveUpAt = tMs + h.headingMax;
        continue;
      }

      if (s.phase === 'leaving') {
        if (tMs > s.giveUpAt) {
          // Wherever they are stood, the errand is over; the wander machinery
          // takes it from here. From indoors its own path-trimming still holds
          // every stroll clear of the walls, so the worst case is somebody
          // pottering about the room until a pick threads the door — which is
          // somebody being at home.
          ch.errand = null;
          s.route = null;
          s.phase = 'away';
          s.due = tMs + between(h.gapMin, h.gapMax);
          continue;
        }
        if (!this._walkRoute(s, ch, tMs)) continue;
        s.phase = 'away';
        s.due = tMs + between(h.gapMin, h.gapMax);
        // A moment on the doorstep before setting off again.
        ch.restUntil = tMs + 1400;
      }
    }

    // The windows, one house at a time. Eased against the clock rather than a
    // fraction per frame, the way everything else here is.
    //
    // Sent as a map keyed by style rather than as one number, which is the
    // whole of what two homes changed here: `anyoneHome` is still a useful
    // question about the world, and a hopeless one to light a particular
    // building by.
    // Three states now, not two. A building whose owner is asleep in it is not
    // an empty building — `emptyLamps` is a porch light left on by somebody who
    // is out, and there is nobody out — so it goes darker than empty rather
    // than brighter. Asleep WINS over home: the two can only coincide while a
    // guest is still up in a house whose owner has turned in, and what the
    // windows should say then is that the household has gone to bed.
    const by = {};
    for (const place of this.places) {
      let here = false;
      let sleeping = false;
      for (const st of this.state.values()) {
        if (st.phase === 'home' && st.place === place) here = true;
        if (st.phase === 'asleep' && st.own === place) sleeping = true;
      }
      const want = sleeping ? h.asleepLamps : here ? 1 : h.emptyLamps;
      const was = this._lit.get(place);
      const now = was + (want - was) * (1 - Math.exp(-dtMs / h.lampEaseMs));
      this._lit.set(place, now);
      by[place.style] = now;
    }
    this.globe.setOccupancy(by);
  }

  // Whoever is under the roof, for the dialogue to pick from. Asked of the
  // world rather than of the state machine, so somebody who wandered in on
  // their own counts too.
  //
  // `where` is a surface direction naming which room is being asked about —
  // normally the player's own, since the only caller is the dialogue and what
  // it wants is who is in HERE with you. Without one it answers for the first
  // home, which is what it always did.
  guests(where) {
    const pl = where
      ? this.places.find((p) => p.dir.dot(where) > Math.cos(p.building.r))
      : this.places[0];
    if (!pl) return [];
    const lim = Math.cos(pl.building.r);
    return this.bots.filter((b) => b.ch.dir.dot(pl.dir) > lim);
  }
}
