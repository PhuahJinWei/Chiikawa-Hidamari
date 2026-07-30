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
//   running  the same walk again, for the one WEATHER that is not a visit
//   inside   waiting out the rain
//
// THE LAST FOUR ARE NOT A VISIT, and every rule above is suspended for them.
// A visit is rare, one at a time, never while you are stood there, and on a
// clock; bedtime is all three of them at once, every night, whoever is
// watching, because it is what the hour IS. See MIDNIGHT_SLEEP.md.
//
// Sheltering is the same shape as bedtime with a different trigger, and that
// is why it reuses so much of it: all three at once, whoever is watching,
// nothing waited out, because rain is not a suggestion either. What separates
// them is only what they do at the far end — one lies down, the other stands in
// a room and waits — and WHOSE DOOR they aim at, which is the only interesting
// difference of the two. See _toShelter.
//
// BEDTIME WINS over rain, and there is nothing to arbitrate: it is checked
// first and returns. Rain in the small hours is real and it is QUIET — everyone
// is already indoors and asleep with the lights out by their own hand, and a
// shower is no reason to get any of them up. What it does mean is that Usagi,
// who sleeps on the grass, sleeps in it. That is a drawing nobody has made yet.
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
// Asked of the director for the same reason the hour is asked of daylight.js:
// one place decides. `isSheltering` already has the hysteresis on it — see the
// note there — which matters more here than anywhere else, because a walk home
// takes the better part of a minute and a flag that flickers once at the edge
// of a front sends somebody out of their own front door and straight back in.
import { isSheltering, snowPlayable, rainbowOut } from './weather.js';
import {
  keepOffSolids, inBuilding, inLake, lakeReach, dirFromLatLon, underRoof,
} from './sphere.js';

// The one hour nobody is up for.
const BEDTIME = 'midnight';

// How far from open water a gathering has to be, as a lake margin. Generous —
// this is a ring of three characters and a snowman rather than one body, and
// the failure it prevents is somebody standing in a pond in the snow.
const GATHER_DRY = 0.30;

// ...and how far apart two snowmen have to stand, in units. Under this they
// read as one snowman drawn twice rather than as two winters.
const SNOWMAN_APART = 2.6;

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
        // WHOSE DOOR IN THE RAIN, which is a third question again, and the one
        // Usagi makes interesting.
        //
        // Somebody with a home of their own runs to it, and this stays null for
        // them — `_shelterPlace` falls through to `own`. Somebody without one
        // has to go SOMEWHERE, because the alternative is the one character in
        // the world standing out in a downpour, and he picks whichever door is
        // nearest to hand. That is not the same as `place`, which is fixed for
        // the session so that visiting reads as having a local: barging into
        // whoever's is closest is exactly what you would do in the rain, and
        // doing it differently each shower is the point rather than a bug.
        //
        // Held for the length of one shower and cleared when it stops, so he
        // cannot change his mind about which house he is running to halfway
        // across the planet.
        hide: null,
        // Whether this shower has already put them somewhere in a room. See
        // _toShelter — `phase === 'inside'` cannot answer it, because the
        // visiting machine says that too.
        sheltered: false,
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

    // THE GATHERING, which belongs to the group rather than to anybody in it —
    // see _toGather. `_spot` is where they are meeting and doubles as "a
    // gathering is happening"; `_played` says this snowfall has already had
    // one, and is let go only when the cover goes.
    this._spot = null;
    this._played = false;
    this._buildAt = 0;
    this._built = null;
    // Whether anybody has actually reached the gathering yet — see the latch,
    // and the rainbow that closed before it opened.
    this._gathered = false;
    // WHAT THEY CAME OUT FOR — 'snow' or 'bow'. The only thing that differs
    // between the two gatherings; see the note above _toGather.
    this._why = null;
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
      ch.restUntil = ch.hurrying ? 0 : Math.min(ch.restUntil, tMs + 600);
      return false;
    }
    ch.errand = null;
    ch.walking = false;
    return true;
  }

  // ------------------------------------------------------------ the gathering
  //
  // THE OPPOSITE ERRAND, and the reason the weather feature is worth having at
  // all. Rain sends them in; snow and a rainbow bring them OUT.
  //
  // It is deliberately not built like the shelter. Sheltering is a MODE — it
  // holds for as long as the sky says so, and every rule about visits and
  // strolls is suspended underneath it. This is an EVENT: they come together
  // once, something happens, and then they go back to their ordinary lives. A
  // mode would have been easier and would have been wrong — it would mean that
  // for the twenty minutes a snow cover takes to melt, nobody wanders anywhere,
  // and the snow would read as having switched the world off rather than as
  // having changed it.
  //
  // So there are two states and a latch. `gather` walks them to one spot;
  // `playing` keeps them there; `_played` stops it happening twice for one
  // occasion, and is let go only when the reason has gone, so the next fall —
  // or the next shower that ends in the sun — gets its own gathering.
  //
  // ONE MECHANISM FOR BOTH, and `_why` is the only thing that differs. That is
  // not thrift: the two occasions are the same event with a different subject,
  // and a second copy would be two places to fix the day somebody notices the
  // cast never quite look like a group. What `_why` decides is small and lives
  // in exactly two places — whether a snowman goes up at the end of it, and
  // whether they leave on a timer or when the thing they came to see has gone.
  //
  //   snow     they made it, so they can leave when they like: a rolled stay.
  //   bow      they came to LOOK at something, so they stay while it is there.
  //            A rainbow you wander off from halfway through is not a reward.

  // WHERE TO MEET. The middle of wherever the three of them already are,
  // pushed off anything solid and out of both buildings.
  //
  // Averaged rather than chosen, and that is what makes it feel unplanned. A
  // fixed spot would be a meeting point — the same clearing every winter, which
  // reads as a rule. The middle of the group is wherever they happened to be
  // when it started settling, so every snowfall gathers somewhere new, and
  // nobody has far to walk because by construction it is between them.
  // ...and one step of pushing a spot off something, along the bearing it is
  // already on. `centre` is what it has to keep away from and `keep` how far,
  // as an arc. Shared because the three things a gathering can land in — a
  // building, a pond, last winter's snowman — are all the same push.
  _pushOff(spot, centre, keep, fallbackTangent) {
    _tan.copy(spot).addScaledVector(centre, -spot.dot(centre));
    // Dead centre, so the spot has no bearing of its own to keep. Any will do,
    // and the caller has one to hand: the door's own line for a building, and
    // for anything else the first axis that is not parallel to the centre.
    if (_tan.lengthSq() < 1e-9) _tan.copy(fallbackTangent);
    if (_tan.lengthSq() < 1e-9) return spot;
    _tan.normalize();
    return spot.copy(centre).multiplyScalar(Math.cos(keep))
      .addScaledVector(_tan, Math.sin(keep)).normalize();
  }

  _gatherSpot(taken) {
    const R = CONFIG.globe.radius;
    const mid = new THREE.Vector3();
    for (const b of this.bots) mid.add(b.ch.dir);
    // Three characters on opposite sides of a small planet average to very
    // nearly nothing, and normalising nothing is a NaN that would propagate
    // into every route planned from it. Somebody's own spot is the honest
    // fallback: the group is too spread out to have a middle, so meet at one of
    // them instead.
    if (mid.lengthSq() < 1e-6) mid.copy(this.bots[0].ch.dir);
    mid.normalize();

    // ------------------------------------------------ and off what it cannot be
    //
    // THE AVERAGE OF THREE LEGAL SPOTS IS NOT A LEGAL SPOT, and that is worth
    // stating plainly because it is exactly the assumption the first version
    // made. Measured on the first snowfall: two of them happened to be either
    // side of Chiikawa's house, their middle landed INSIDE it, and all three
    // spent the entire snowfall walking at a wall — their path planner trims
    // every leg that would end somewhere they may not stand, so the plan came
    // back as "stay where you are", forever, on every frame. Nothing errored
    // and nothing looked broken; they simply never arrived.
    //
    // A building, a pond and last winter's snowman are all the same problem and
    // all take the same push — see _pushOff.
    for (const pl of this.places) {
      // `doorAt` is the berth they already refuse to cross, worked out from the
      // wall and their own wander margin, so a gathering placed just outside it
      // is placed exactly where somebody standing at the front of the house
      // would be. The extra is elbow room: a ring of three round a snowman
      // needs a little more than one body's width of clearance.
      const keep = (pl.doorAt + CONFIG.weather.ringOut + 0.6) / R;
      if (mid.dot(pl.dir) <= Math.cos(keep)) continue;
      this._pushOff(mid, pl.dir, keep, pl.building.gapDir);
    }

    for (const lake of CONFIG.lakes) {
      if (!inLake(mid, lake, GATHER_DRY)) continue;
      dirFromLatLon(lake.lat, lake.lon, _cross);
      _tan.copy(mid).addScaledVector(_cross, -mid.dot(_cross));
      if (_tan.lengthSq() < 1e-9) continue;
      _tan.normalize();
      // Out to wherever the rim actually is along this bearing, plus a margin —
      // the same arithmetic a character's own walk uses to slide out of water.
      this._pushOff(mid, _cross, lakeReach(lake, _tan, GATHER_DRY), _tan);
    }

    for (const s of taken || []) {
      if (mid.angleTo(s) * R > SNOWMAN_APART) continue;
      // Step away, far enough that the new one is plainly its own snowman
      // rather than a repair of the old.
      this._pushOff(mid, s, SNOWMAN_APART / R, _tan);
    }

    keepOffSolids(mid, CONFIG.wander.wallKeep);

    // ...and if all that pushing has left it somewhere it still cannot be —
    // pushed out of a pond and into a wall, most likely — meet at somebody's
    // feet instead. A character's own spot is legal by construction, which is
    // the one thing that can be said for certain here, and a gathering in a
    // slightly dull place beats a gathering that never happens.
    // `underRoof` and not `inBuilding`, which would have accepted a meeting
    // point on somebody's floor: that test's answer over a room is "free
    // ground". A snowman is an outdoor thing and this is the line that has to
    // know it.
    if (underRoof(mid, CONFIG.wander.wallKeep)
      || CONFIG.lakes.some((l) => inLake(mid, l, GATHER_DRY))) {
      mid.copy(this.bots[0].ch.dir);
    }
    return mid;
  }

  // Out into it. Handed the spot the group is meeting at, which the caller
  // works out ONCE for all three — this runs per character, and three
  // characters each averaging the group's position would each get a slightly
  // different answer and walk to three different places.
  _toGather(bot, s, tMs, spot) {
    const ch = bot.ch;
    if (s.phase === 'playing') {
      // Milling about where they stopped. Held with the same pinned rest the
      // shelter uses, so a chat or you walking up never leaves a stale clock
      // that frees somebody to wander off mid-snowman.
      ch.restUntil = Math.max(ch.restUntil, tMs + 1200);
      return;
    }

    if (s.phase !== 'gather') {
      s.phase = 'gather';
      this._releaseSeat(bot, s);
      // `hurrying` FOR THE WALK ONLY, and cleared the moment they arrive.
      //
      // The first version left it off, on the reasoning that going out to play
      // is not an errand with a deadline: if you have walked over to say hello
      // on the way, the snowman can wait, and somebody who would not stop to
      // talk to you on the way to build one is not somebody having a nice time.
      // That reasoning is still right about the GATHERING and was wrong about
      // the walk, in the exact way this file has already recorded once — see
      // the same measurement in _toBed.
      //
      // Measured on the first snowfall: you arrive on a doorstep 3.6 units from
      // two of them, which is `closeArc` to a hundredth, so the politeness
      // freeze held both of them exactly where they stood. Chiikawa never moved
      // from 8.68 units away and Hachiware never covered his last 1.00, for the
      // entire snowfall, while Usagi — the only one far enough away not to have
      // noticed you — walked in and stood by himself. Standing and watching is
      // the ordinary way anybody would use this feature, and it was the one
      // case that could never work.
      //
      // Clearing it on arrival is what keeps the original point: they push past
      // you to GET there, and once they are there they are ordinary again and
      // will stop to talk to you like anybody else.
      ch.hurrying = true;
      ch.restUntil = 0;
      this._aimAtGather(bot, s, tMs, spot);
    }

    if (!s.route || !s.route.length || tMs > s.giveUpAt) {
      // ...and giving up is allowed here, which is the other half of the same
      // point. A shelter walk is re-planned forever because the alternative is
      // somebody standing in the rain; if this one cannot be walked, they
      // simply do not join in, and the others get on with it.
      if (tMs > s.giveUpAt) { this._backToLife(bot, s, tMs); return; }
      this._aimAtGather(bot, s, tMs, spot);
      return;
    }
    if (this._walkRoute(s, ch, tMs)) {
      // Arrived, so they are ordinary again — see the note above. From here on
      // you can walk up to them and they will stop for you.
      ch.hurrying = false;
      s.phase = 'playing';
      // How long they stay, and the one line where the two occasions part.
      //
      // Snow is a rolled stay: the snowman goes up part way through, and the
      // stay only has to be long enough to have watched it happen. A rainbow
      // has no timer at all — they leave when it has gone, which is what the
      // group's own flag going false does. Standing there is the entire point,
      // and drifting off halfway through would undo it.
      s.until = this._why === 'snow'
        ? tMs + between(CONFIG.weather.playMin, CONFIG.weather.playMax)
        : Infinity;
      return;
    }
    if (s.route.length !== s.legs) {
      s.legs = s.route.length;
      s.giveUpAt = tMs + CONFIG.sleep.retryMs;
    }
  }

  // Point them at the meeting spot. Each takes a place a little way round it
  // rather than the spot itself: three characters aiming at one point arrive on
  // top of each other, and what should read as a group standing in a ring reads
  // as one character with two others hidden behind them.
  _aimAtGather(bot, s, tMs, spot) {
    const ch = bot.ch;
    const i = this.bots.indexOf(bot);
    const arc = CONFIG.weather.ringOut / CONFIG.globe.radius;
    const bearing = (i / Math.max(1, this.bots.length)) * Math.PI * 2;
    _tan.set(0, 1, 0).cross(spot);
    if (_tan.lengthSq() < 1e-9) _tan.set(1, 0, 0).cross(spot);
    _tan.normalize().applyAxisAngle(spot, bearing);
    const at = spot.clone().multiplyScalar(Math.cos(arc))
      .addScaledVector(_tan, Math.sin(arc)).normalize();
    s.route = [keepOffSolids(at, CONFIG.wander.wallKeep)];
    s.legs = 1;
    s.giveUpAt = tMs + CONFIG.household.headingMax;
    ch.errand = null;
  }

  // Back to ordinary life, from any of the three ends of the snow — they had
  // their fill of it, the walk turned out to be unwalkable, or the cover melted
  // while they were still out there.
  //
  // `snowDone` IS THE WHOLE OF WHY THIS IS AN EVENT AND NOT A LOOP, and it was
  // missing from the first version with a result worth recording. Without it,
  // somebody who finished playing went back to `away` — and `away` is exactly
  // what the dispatch reads as "not yet gathered", so on the very next frame
  // they were sent out to gather again. Measured: two of them ping-ponged
  // between playing and walking back to the same spot for the entire twenty
  // minutes a cover takes to melt, and the latch that ends the gathering never
  // closed because somebody was always busy.
  //
  // One flag per character rather than one for the group, because they finish
  // at different times and a group flag would end everybody's afternoon the
  // moment the first of them wandered off.
  _backToLife(bot, s, tMs) {
    const h = CONFIG.household;
    bot.ch.errand = null;
    bot.ch.walking = false;
    // ...and off the walk's right of way, whichever end of it this was reached
    // from. Left set, somebody who gave up on an unwalkable gathering would go
    // on pushing past you for the rest of the session.
    bot.ch.hurrying = false;
    s.route = null;
    s.snowDone = true;
    s.phase = 'away';
    s.due = tMs + between(h.gapMin, h.gapMax);
  }

  // ----------------------------------------------------------------- the rain
  //
  // WHOSE DOOR SOMEBODY RUNS TO. Their own if they have one; otherwise the
  // nearest, chosen once and then held for the shower — see `hide`.
  //
  // Nearest and not random, which was the first version and read as worse than
  // arbitrary: it read as WRONG. Watching Usagi stand in the rain beside
  // Chiikawa's front door and then set off across the planet for the cave is
  // not a character being unpredictable, it is a character being broken. What
  // makes this feel like a decision is that it is the obvious one.
  _shelterPlace(bot, s) {
    // ALREADY UNDER A ROOF? Then this is the one, whoever's it is.
    //
    // Asked before `own`, and it has to be: without it somebody caught visiting
    // when the sky opened was sent home, which means stepping OUT of a dry room
    // into the rain to walk to a different door. Hachiware standing in
    // Chiikawa's front room when it starts is already sheltering; there is
    // nothing for him to do about the weather.
    //
    // It also settles what the walk means for somebody who was indoors all
    // along — see the `sheltered` flag in _toShelter. They still have a spot to
    // walk to, they just do not have to go outside to reach it.
    const here = this.places.find((pl) => bot.ch.dir.dot(pl.dir) > Math.cos(pl.building.r));
    if (here) return here;
    if (s.own) return s.own;
    if (s.hide) return s.hide;
    let best = null;
    let near = Infinity;
    for (const pl of this.places) {
      const d = bot.ch.dir.angleTo(pl.dir);
      if (d < near) { near = d; best = pl; }
    }
    s.hide = best;
    return best;
  }

  // Get them under a roof and keep them there. The bedtime walk with the bed
  // taken off the end of it: same route, same urgency, same suspension of every
  // rule a visit obeys.
  _toShelter(bot, s, tMs) {
    const ch = bot.ch;
    // ONLY ONCE THEY HAVE ACTUALLY SETTLED SOMEWHERE, which `inside` alone does
    // not say.
    //
    // `s.phase` is shared with the visiting machine, so `inside` is equally the
    // answer for somebody who walked here to wait out a shower and for somebody
    // who was round for tea when it started. Pinning on the phase alone froze
    // the second kind wherever they happened to be standing — usually near the
    // door they came in by, and if two of them were in, near each other — for
    // the whole storm, with a perfectly good spot across the room unused.
    //
    // The flag says "this one has been given a place in this room and reached
    // it". Anybody else falls through to the walk below, which for somebody
    // already indoors is a single leg across the floor rather than a trip
    // outside — see the roof test at the top of _shelterPlace.
    if (s.phase === 'inside' && s.sheltered) {
      // Stood where they are, and pinned ahead rather than set once, so a chat
      // or you walking in never leaves a stale clock that frees them to stroll
      // through a wall. Exactly what `home` does; the difference is that this
      // one has no `until` to run out, because the weather is the clock.
      ch.restUntil = Math.max(ch.restUntil, tMs + 1500);
      return;
    }

    if (s.phase !== 'running') {
      s.phase = 'running';
      // Everything that would otherwise delay setting off, cleared on this
      // frame rather than waited out — the cushion, the rest, the conversation,
      // and you standing there. See the same four in _toBed, which is where the
      // list was learned; the only thing that differs is what they are late for.
      this._releaseSeat(bot, s);
      ch.hurrying = true;
      ch.restUntil = 0;
      ch.busyUntil = 0;
      this._aimAtShelter(bot, s, tMs);
    }

    // Re-planned rather than abandoned, for the reason bedtime is: there is no
    // later. An errand you can give up on is fine when another is along in five
    // minutes, and this one has to end with somebody indoors or it has not
    // happened. The deadline measures STALLING and resets on progress — see the
    // long note in _toBed, which this is the same mechanism as.
    if (!s.route || !s.route.length || tMs > s.giveUpAt) {
      this._aimAtShelter(bot, s, tMs);
      return;
    }
    if (this._walkRoute(s, ch, tMs)) {
      ch.hurrying = false;
      s.phase = 'inside';
      s.route = null;
      // They have a place in this room and are standing in it. See the flag's
      // note above; `_comeOut` lets it go when the weather does.
      s.sheltered = true;
      // Sit down in the one they walked to. Somebody waiting out a shower
      // sitting down is the whole of what makes the room read as shelter rather
      // than as three people standing in a box — and it is the same cushion the
      // same guest would have taken on an ordinary visit, so nothing new is
      // needed.
      //
      // Claimed back in _aimAtShelter, so by here it is usually already theirs
      // and this only has to sit them in it. The second look is for the case
      // where every seat was taken when they set off and one has since been
      // given up — no reason to stand for the rest of a storm beside an empty
      // cushion. Whoever holds one keeps it; nothing here can take it away.
      if (!s.seat) {
        const seat = this._freeSeat(s.place);
        if (seat) {
          seat.taken = ch;
          s.seat = seat;
        }
      }
      if (s.seat) ch.sitAt(s.seat.dir, s.seat.y);
      return;
    }
    if (s.route.length !== s.legs) {
      s.legs = s.route.length;
      s.giveUpAt = tMs + CONFIG.sleep.retryMs;
    }
  }

  // Point them at a door and start the clock. One place, because the walk is
  // planned twice — on the way in, and again whenever it stalls.
  //
  // THE ONLY WAY INTO `inside` IS ARRIVING, which is the same rule _toBed
  // arrived at and for a sharper reason than symmetry. The first version of
  // this took a shortcut: somebody already within the building's own radius was
  // declared sheltered on the spot, with no walk. It looked obviously right and
  // produced a character standing in the rain.
  //
  // Two things went wrong at once and each is worth writing down.
  //
  //   THE TEST WAS THE WRONG QUESTION. `building.r` is the OUTER wall, so it
  //   answers "am I within the building's footprint" — and the wall band is
  //   part of that footprint. Somebody in the doorway passed it and was left
  //   standing in the doorway for the whole storm.
  //
  //   THE ERRAND SURVIVED. Declaring somebody sheltered says nothing to
  //   `ch.errand`, and the walk machinery does not need this file's permission
  //   to finish a leg it is already walking. Measured: the sky cleared, Chiikawa
  //   set off out of his own front door on a `leaving` route, the sky closed
  //   again a few seconds later, and he was marked `inside` while continuing to
  //   walk the errand that was taking him OUT — ending up 3.25 units from the
  //   middle of a house with a 3.2 wall, sheltered on paper and outdoors in
  //   fact. `_walkRoute` clears the errand when a route completes; nothing else
  //   was clearing it, because nothing else should have to.
  //
  // So there is no shortcut. What being indoors already buys is a SHORTER
  // ROUTE, not the absence of one: no ring, no doorstep, just the walk across
  // the floor — which is exactly the case _bedRoute carves out, and for the
  // same reason it gives, that _routeIn from inside plans its first leg into
  // the wall.
  _aimAtShelter(bot, s, tMs) {
    const ch = bot.ch;
    const pl = this._shelterPlace(bot, s);
    // `place` is repointed for the duration, because everything downstream of
    // arriving asks it rather than being told: the seat search, the walk out
    // again, the arrival tolerance. Usagi waiting out a shower in the cave is
    // AT the cave for as long as he is in it.
    s.place = pl;
    if (!pl) { s.route = null; return; }
    // THE SEAT IS TAKEN BEFORE THE WALK, which is the ordinary visit's rule and
    // was the whole of what went wrong here.
    //
    // This planned every shelterer to `spots[0]` and went looking for a cushion
    // only once they arrived. One number, for everybody, in both houses — so
    // the walk itself aimed all of them at the same point on the floor and they
    // finished the storm standing in each other. Usagi barging into Chiikawa's
    // made it plain, because that is the case with two bodies in one room.
    //
    // Claimed here instead, so the seat IS the destination and two people
    // cannot be given the same one. Guarded on not already holding it: this
    // runs again on every stall (see _toShelter), and re-claiming would hand
    // out a second cushion each time somebody was slow through the door.
    if (!s.seat) {
      const seat = this._freeSeat(pl);
      if (seat) {
        seat.taken = ch;
        s.seat = seat;
      }
    }
    const dest = s.seat
      ? s.seat.dir.clone()
      : this._standSpot(bot, pl, new THREE.Vector3());
    s.route = ch.dir.dot(pl.dir) > Math.cos(pl.building.r)
      ? [dest]
      : this._routeIn(pl, dest, ch.dir);
    s.legs = s.route.length;
    s.giveUpAt = tMs + CONFIG.sleep.retryMs;
  }

  // Somewhere to stand for whoever did not get a cushion — one of the standing
  // spots, ONE EACH.
  //
  // Keyed off their place in the cast rather than off what is free, and that is
  // deliberate: a spot is not claimed the way a seat is, so two people asking
  // "which is free" would both be told the same one. An index nobody shares
  // cannot collide, needs nothing released when a shower ends, and gives each
  // character the same corner every time — which reads as a habit rather than
  // as furniture being allocated.
  //
  // The same trick, and for the same reason, as the bearing each of them takes
  // round the gathering. There are three spots and three of them; a fourth
  // character added to CAST would double up with the first, which is a good
  // deal better than all four in a heap and is fixed by drawing a fourth spot.
  //
  // USED BY THE VISIT AS WELL AS BY THE SHOWER, and it had to be. Both paths
  // wrote `h.spots[0]` by hand, so the fix that stopped shelterers stacking
  // left ordinary guests doing it — and since `globe.seats` is empty, the
  // fallback is not a fallback, it is what always happens. Two ways into the
  // same room must not disagree about where there is space in it.
  _standSpot(bot, pl, out) {
    const spots = CONFIG.household.spots;
    if (!spots || !spots.length) return this._insideSpot(pl, Math.PI, 0.5, out);
    const i = Math.max(0, this.bots.indexOf(bot));
    const spot = spots[i % spots.length];
    return this._insideSpot(pl, spot.at, spot.out, out);
  }

  // It stopped. Out they come, by the ordinary leaving route — which is the
  // whole point of having reused the visit's states: there is nothing special
  // about the end of a shower except that it ends.
  _comeOut(bot, s, tMs) {
    const h = CONFIG.household;
    const ch = bot.ch;
    const pl = s.place;
    ch.hurrying = false;
    s.hide = null;
    // Whatever spot they were holding for this shower is given up with it — the
    // next one has to place them again, from wherever they are by then.
    s.sheltered = false;
    // Back to where they LIVE. `place` was repointed to whichever door they ran
    // to, and leaving it repointed would have Usagi treating a house he sheltered
    // in once as his local for the rest of the session.
    s.place = this.places.find((p) => p.home.owner === bot.spec.key)
      || this.places[0] || null;
    this._releaseSeat(bot, s);
    ch.errand = null;
    ch.walking = false;
    s.route = null;

    const inside = pl && ch.dir.dot(pl.dir) > Math.cos(pl.building.r);
    if (inside) {
      s.place = pl;
      s.route = this._routeOut(pl);
      s.phase = 'leaving';
      s.giveUpAt = tMs + h.headingMax;
      // A moment in the doorway looking at the sky before stepping out into it,
      // which is what anybody does when the rain stops.
      ch.restUntil = tMs + 1400;
      return;
    }
    s.phase = 'away';
    s.due = tMs + between(h.gapMin, h.gapMax);
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

      // ...and if what they were doing was waiting out a shower, that is over
      // too. `_comeOut` is the ordinary way off a shelter and it puts both of
      // these back; going to bed is the other way off it, and left alone the
      // borrowed door would outlive the rain that sent them through it. Usagi
      // would treat whichever house he sheltered in last night as his local for
      // the rest of the session, and reach for it again in the next shower
      // instead of the nearest one.
      s.hide = null;
      s.place = this.places.find((pl) => pl.home.owner === bot.spec.key)
        || this.places[0] || null;

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
      //   YOU, standing nearby — which is the freeze `hurrying` lifts, and the
      //   one that did not merely delay them but stopped them for good. It is
      //   set here and stays set for the whole walk, so none of the above can
      //   creep back in halfway home.
      this._releaseSeat(bot, s);
      ch.hurrying = true;
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
    if (!spot) return null;

    // ...AND THE SAME TRAP AGAIN FOR SOMEBODY WITH NO HOME, which the carve-out
    // above does not cover because it is written about their OWN one.
    //
    // Usagi sleeps on the grass, so his route to bed is a single waypoint out in
    // his meadow — and that is a straight line, which is fine from anywhere
    // except the one place he is quite likely to be. He has no house of his own,
    // so every reason he ever has to be indoors is somebody else's: he barges
    // into the nearest door in the rain, he goes visiting, and the snow brings
    // the three of them together wherever they happen to be. Midnight then
    // arrives with him standing in Chiikawa's front room.
    //
    // From there the line to his meadow runs through the wall. His pathing
    // trims every plan at the first spot he may not stand in, which is the
    // masonry, so the plan comes back as "stay where you are" — and unlike a
    // visit, bedtime never gives up. Measured: pinned at 1.60 units from the
    // middle of a house whose wall is at 3.2, bed 2.29 units away through it,
    // not one step taken in fifty seconds, re-planning on the retry clock
    // forever. He simply stood in the living room all night.
    //
    // What he needs is the door, and the door is what `_routeOut` is: it walks
    // the interior spot, then the doorstep, and from the doorstep the meadow is
    // an ordinary walk across grass. Whose door is asked of where he actually
    // IS rather than of anything remembered, so it works whichever building he
    // ended up in and needs no state to be right.
    const caught = this.places.find(
      (pl) => ch.dir.dot(pl.dir) > Math.cos(pl.building.r),
    );
    return caught ? [...this._routeOut(caught), spot] : [spot];
  }

  _fallAsleep(bot, s) {
    const ch = bot.ch;
    ch.errand = null;
    ch.walking = false;
    // They have arrived, so there is nothing left to push past you for.
    ch.hurrying = false;
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
    ch.hurrying = false;

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
    // ...and whether anybody sensible would be indoors. Asked once for the
    // frame rather than per character, because it is a fact about the sky.
    const wet = isSheltering();

    // ...and whether there is enough snow lying to be worth going out for. Also
    // once, and for a second reason on top of the first: the gathering spot is
    // the AVERAGE of where the three of them are, so it has to be worked out
    // for the group rather than per character or they would each walk to a
    // slightly different middle. See _gatherSpot.
    // WHETHER THERE IS ANYTHING TO GO OUT AND LOOK AT. Two occasions, one
    // mechanism — see the note above the gathering.
    //
    // Snow first when both are somehow true, which is the right way round: a
    // rainbow lasts a stage of one front and snow lies for an hour, so the
    // scarce thing wins. In practice they barely overlap; a rain front over
    // lying snow is the only way, and it is a thaw.
    const why = bedtime ? null : (snowPlayable() ? 'snow' : (rainbowOut() ? 'bow' : null));
    if (!why) {
      // The reason has gone — the cover melted, the arc faded, or the hour
      // turned. Let the latch go, so the NEXT one gets a gathering of its own.
      // That is the whole job of `_played`, and letting it go here rather than
      // on a timer is what ties one gathering to one occasion.
      this._played = false;
      this._spot = null;
      this._built = null;
      this._why = null;
      this._gathered = false;
      // ...and everybody gets their afternoon back. This is the only place
      // `snowDone` is cleared.
      for (const st of this.state.values()) st.snowDone = false;
    } else if (!this._spot && !this._played) {
      this._why = why;
      this._spot = this._gatherSpot(this.globe.rain ? this.globe.rain.standing() : []);
      this._buildAt = 0;
      this._built = null;
      this._gathered = false;
    }
    const playing = !!why && !!this._spot;

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

      // THEN THE RAIN, on the same terms and for the same reason: it overrides
      // whatever else was going on, and both directions are handled here so a
      // front rolling in and out — or a finger on a debug switch — is harmless
      // at any speed. Nothing below this runs while it is coming down.
      //
      // Under bedtime, deliberately. See the note at the top of the file: at
      // that hour everybody is already in and asleep, and getting them up to
      // shelter from rain they are not standing in would undo the one thing
      // midnight is for.
      if (wet) {
        this._toShelter(bot, s, tMs);
        continue;
      }
      if (s.phase === 'running' || s.phase === 'inside') {
        this._comeOut(bot, s, tMs);
        continue;
      }

      // THEN THE SNOW, and it is checked after the rain rather than beside it
      // because the two can both be true and only one of them can win. A
      // blizzard is snow AND shelter — `snowPlayable` already refuses while
      // anybody is sheltering, so this is belt and braces, and the belt is the
      // one that reads: whatever else is going on, being out in it is the thing
      // you stop doing first.
      //
      // Had their fill of it FIRST, so that the dispatch below cannot catch
      // somebody whose time is up and hold them out there — `_toGather` returns
      // early for anybody already `playing`, so a timer checked after it would
      // never be reached.
      if (s.phase === 'playing' && tMs > s.until) {
        this._backToLife(bot, s, tMs);
        continue;
      }
      if (playing && !s.snowDone) {
        this._toGather(bot, s, tMs, this._spot);
        continue;
      }
      if (s.phase === 'gather' || s.phase === 'playing') {
        // The reason to be out there has gone — the cover melted while they
        // were still walking to it, or the hour turned. There is nothing to
        // come back from, which is the whole point of this being an event
        // rather than a mode: they just carry on.
        this._backToLife(bot, s, tMs);
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
          // Their own corner, not everybody's — see _standSpot.
          s.route = this._routeIn(pl, this._standSpot(bot, pl, _spot), ch.dir);
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

    // ...AND THE SNOWMAN, which is the only thing in this world anybody makes.
    //
    // Put up by the HOUSEHOLD rather than by the snow, and that is the whole
    // difference between a thing the cast did and a thing the weather did. The
    // cover could raise one on its own the moment it crossed a threshold, and
    // it would appear on an empty hillside with nobody near it — scenery that
    // snowed into being. This one goes up in the middle of a ring of friends,
    // a little while after they have got there, because they are what built it.
    if (playing) {
      let here = 0;
      let busy = false;
      for (const st of this.state.values()) {
        if (st.phase === 'playing') { here++; this._gathered = true; }
        // Somebody who has finished is not busy however they wandered off to —
        // `away` is also what somebody who has not started looks like, and
        // without `snowDone` to tell the two apart the latch below could never
        // close while anybody was between errands.
        if (!st.snowDone && (st.phase === 'playing' || st.phase === 'gather')) busy = true;
      }
      // Two of them, not three. Usagi may be halfway across the planet, or
      // frozen by you standing next to him, or have given up on the walk
      // entirely — and a snowman that waits for perfect attendance is one that
      // often never gets built. Two is a group.
      //
      // A RAINBOW GATHERING MAKES NOTHING, and that is the whole of what `_why`
      // decides here. There is a temptation to give it something to leave
      // behind for symmetry with the snowman, and it would be exactly wrong:
      // what a rainbow leaves behind is that you were all there when it
      // happened, and putting an object under it would turn the one occasion in
      // this world that is purely for looking at into another errand.
      if (this._why === 'snow') {
        if (here >= 2 && !this._buildAt) {
          this._buildAt = tMs + CONFIG.weather.buildMs;
        }
        if (this._buildAt && !this._built && tMs > this._buildAt && this.globe.rain) {
          this._built = this.globe.rain.raise(this._spot);
        }
      }
      // The gathering is over when the last of them has wandered off, and only
      // then does the latch close. Closing it when the snowman went up would
      // have cut the standing-about short, which is the part that reads as
      // having a nice time rather than as completing an errand.
      //
      // `_gathered` IS WHAT STOPS IT CLOSING BEFORE IT OPENS, and it took a
      // rainbow to find that out. A snow gathering could not close early
      // because it waits on a snowman, and a snowman needs somebody standing
      // there to make it; a rainbow waits on nothing, so `!busy` was true on
      // the very first frames — while the cast were still walking OUT of the
      // houses they had sheltered in, before any of them had begun to gather.
      // Measured: the arc came up over three characters who were marked as
      // having already had their moment under it and went back to wandering.
      //
      // So the latch needs both halves: somebody got there, and now nobody is
      // still at it. `_built` is the snow's own second condition on top.
      const made = this._gathered && (this._why !== 'snow' || !!this._built);
      if (made && !busy) {
        this._played = true;
        this._spot = null;
        this._buildAt = 0;
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
        // `inside` counts exactly as `home` does, and this one line is the
        // other half of the houses lighting up when it rains. The weather
        // raises the hour's lamp value — see _applyBlend in scene.js — and this
        // says WHICH buildings have anybody in them to light. The two together
        // are why the empty house stays dark through a downpour while the one
        // Usagi barged into does not.
        if ((st.phase === 'home' || st.phase === 'inside') && st.place === place) here = true;
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
