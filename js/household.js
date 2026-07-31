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
// difference of the two. See the shelter mode.
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
import { isSheltering, snowPlayable, rainbowOut, pondsFrozen } from './weather.js';
import {
  keepOffSolids, keepOutside, inBuilding, inLake, lakeReach, dirFromLatLon,
  underRoof, inSolid,
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
const _leadFwd = new THREE.Vector3();
const _leadRight = new THREE.Vector3();
const _leadWant = new THREE.Vector3();
const _leadNext = new THREE.Vector3();
const _leadAxis = new THREE.Vector3();
const _leadTan = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _cross = new THREE.Vector3();

function between(a, b) { return a + Math.random() * (b - a); }

// ---------------------------------------------------------------- THE MODES
//
// The four things anybody in this world can be doing, most urgent first, as
// objects rather than as a ladder of `if`s.
//
// WHAT THIS REPLACED, because the shape of the old version is the whole reason
// for the new one. Every mode used to be a branch in one long chain, and every
// branch had to handle its own arrival AND its own departure AND undo whatever
// the mode before it had left lying about. Bedtime cleared the shelter's
// borrowed door; leaving the shelter repointed the visit's home; six different
// places each had to remember the cushion, the `hurrying` flag and the rest
// clock. Adding a fifth mode meant touching all four of the others, which is
// O(modes²) work and exactly where every behaviour bug of the last week lived:
// a shelter that pinned somebody the visiting machine had parked, a `phase`
// string that two machines both spelled `inside`.
//
// So: a mode ANSWERS FOR ITSELF.
//
//   wants   may I run, given the world this frame
//   enter   set up, assuming nothing about what came before
//   tick    do the thing
//   exit    put back everything I touched, and NOTHING ELSE
//
// The dispatcher picks the first mode that wants to run, and if that is not the
// one already running it exits the old and enters the new. Cleanup happens once,
// in the mode that owns it, whoever is taking over — so a mode never has to know
// another exists. A fifth is a row in this table.
//
// PREEMPTION FALLS OUT FOR FREE, and that is what makes this worth doing rather
// than merely tidier. Rain arriving during a snowball fight is not a case
// anybody writes: `shelter.wants` is true, it outranks `gather`, so the
// gathering is exited and the run for the door begins. The same is true of every
// pair, including the ones nobody has thought of yet.
//
// `visit` is last and always wants to run, which makes it the idle tier — what
// anybody does when nothing more pressing is going on. Pastimes belong beside it
// there, each with its own clock, which is why the tier is a list rather than a
// single fallback.
// --------------------------------------------------------------- THE HOBBIES
//
// What somebody does when nothing more pressing is going on, DECLARED rather
// than written.
//
// Every one of these is the same shape as a visit — pick a moment, walk
// somewhere, do something there, leave, wait a while — and that skeleton took
// three sessions of measurement to get right: the stall re-planning, the
// give-up deadline, the berth push at the destination, the politeness
// interplay. So no hobby brings its own tick. One mode below walks all of them,
// and an entry here supplies only what differs.
//
//   who      whose hobby it is
//   site     the prop it happens on, by scatter type — a world with none of
//            that prop simply never offers the hobby
//   bucket   what they say while they are at it, if their bank has any
//   spin     radians a second they slide round the top of it, 0 to sit still
//   sink     how far to lower them onto it, as a fraction of their drawn height
//   stay     how long it lasts
//   gap      how long before they feel like it again
//
// `sink` EXISTS BECAUSE A SEATED DRAWING HAS TWO BOTTOMS. Every other card in
// this world is measured to its lowest drawn pixel, because for somebody stood
// up that pixel IS their feet. Somebody SITTING has feet that dangle below the
// thing they are sitting on, so anchoring the lowest pixel puts their seat a
// leg's length into the air — measured, and it reads exactly as floating.
// Lowering by a fraction of their own height puts the seat on the wood and lets
// the feet hang in front of it, which is what the drawings show. It is the same
// correction `interior.sitSink` makes for an undrawn sit, one step more precise
// because here the artist has decided where the seat is.
//
// THE DURATIONS ARE NOT INTERCHANGEABLE. Usagi's is short because a slide is a
// burst — past about forty seconds the circling becomes a loop you can see —
// and Hachiware's is longer because a song is longer, and a seated character
// with notes over their head is something you can stand and watch. The gaps are
// minutes, deliberately: stumbling on Hachiware playing to an empty meadow
// should read as a find rather than as a scheduled event, and at this cadence
// you will see about one a session without going looking.
const PASTIMES = [
  {
    key: 'pudding',
    who: 'usagi',
    site: 'puddingcup',
    bucket: 'play',
    // Doubled from 0.85 on request. At the pudding's slide radius this is about
    // 1.1 units a second — faster than his own walk, which is the point: a
    // slide should look barely in control, and at the old pace it read as a
    // stroll in a circle.
    spin: 1.7,
    // Sprawled across the dome rather than perched on it, so he settles further.
    sink: 0.16,
    stayMin: 20000,
    stayMax: 40000,
    gapMin: 5 * 60 * 1000,
    gapMax: 9 * 60 * 1000,
  },
  {
    key: 'song',
    who: 'hachiware',
    site: 'stump',
    bucket: 'sing',
    spin: 0,
    // ...and the notes over his head. Usagi has none: he is not singing, he is
    // shouting, and a quaver over that would be describing the wrong noise.
    tune: true,
    // Sat upright with his legs over the front of the cut face.
    sink: 0.10,
    stayMin: 35000,
    stayMax: 60000,
    gapMin: 5 * 60 * 1000,
    gapMax: 9 * 60 * 1000,
  },
];

const PASTIME_FOR = {};
for (const p of PASTIMES) PASTIME_FOR[p.who] = p;

// HOW LONG SOMEBODY WHO WANTED THE STAGE AND FOUND IT TAKEN WAITS before asking
// again. Not zero, and that is the whole point of the number: a queue that let
// the next act begin the moment the last one bowed would turn "both at once"
// into "one straight after the other", which is the same machine wearing a
// different costume and just as plainly a rota. A minute or two of ordinary
// wandering in between is what makes each one its own occasion.
const PASTIME_QUEUE_MIN = 60 * 1000;
const PASTIME_QUEUE_MAX = 150 * 1000;

// ------------------------------------------------------------ BEING LED
//
// How far to one side of you a friend walks while you are holding their hand,
// in world units, and how much faster than you they may move to keep up.
//
// BESIDE AND NOT BEHIND, which is both the nicer picture and the practical
// answer to the one thing that could ruin this: a companion directly in front
// of the camera is a companion you spend the whole walk looking past. At a
// right angle to where you are looking they are at the edge of frame until you
// turn your head, which is exactly where somebody you are walking with should
// be.
const LEAD_SIDE = 1.35;
// HOW NEAR THEIR OWN HOBBY the 「いっておいで」 offer appears, in world units,
// while you are leading them — see canSendToPlay, and the pill in main.js.
//
// AN OFFER AND NOT A TRIGGER, which is a design ruling rather than a repair.
// The first build had them tear their hand away the moment they came in range,
// and it read wrong for the reason the user named: a pastime is a RARE event,
// and one that fires itself off mere proximity is a proximity effect, not an
// occasion. Walking a friend to the thing they love and then telling them "go
// on" is the player's moment, and a button is what hands it to them.
const LEAD_LURE = 4.0;

// ...and BEHIND, for the moment the side is refused. A doorway is 1.9 across
// and two abreast do not fit, so they tuck in, follow you through, and come
// back to your side when there is room. Slightly nearer than the side spot,
// because somebody following you closely is following you.
const LEAD_BACK = 1.15;
// They are allowed to outpace you while catching up — a leash that could only
// match your speed can never close a gap it has once opened, and every corner
// opens one.
const LEAD_CATCHUP = 1.45;
// ...and NO NEARER TO YOU THAN THIS, ever, which is the fix for a bug with a
// screenshot: a friend led through a turn could end up under the camera, and a
// camera straight over a card's centre opens the billboard's lie-down blend —
// the far-view machinery — so they were seen lying flat on the grass at your
// feet. The tow now treats a bubble round you the way it treats a tree: steps
// may leave it if they somehow start inside, and may never dive deeper in.
// 0.8 keeps the camera's angle onto their centre comfortably below the blend's
// 0.86 threshold at every eye height this game has.
const LEAD_CLEAR = 0.8;
// How far off the straight line to swing when a step is refused, in radians of
// bearing — nearest first, alternating sides. Wider than the cast's own detour
// needs to be, because this one has to make it round a house wall while keeping
// up with somebody who is still walking.
const LEAD_SWING = [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.3, -2.3];

// How near the perch they walk before climbing onto it, in world units. Far
// enough out that the walk is not fighting the prop's own berth, near enough
// that the hop up reads as one movement rather than as a teleport.
const PASTIME_STANDOFF = 1.5;

// How often somebody at their hobby says something, and the spread on it. Well
// clear of the ambient chatter's own gap, because this is on top of it.
const PASTIME_SAY_MIN = 5000;
const PASTIME_SAY_MAX = 9000;

const MODES = [
  {
    // Everybody, every night, whoever is watching — see MIDNIGHT_SLEEP.md.
    key: 'bed',
    wants: (hh, bot, s, w) => w.bedtime && s.sleeps,
    enter: (hh, bot, s, t) => hh._bedEnter(bot, s, t),
    tick: (hh, bot, s, t) => hh._bedTick(bot, s, t),
    exit: (hh, bot, s, t) => hh._bedExit(bot, s, t),
  },
  {
    // Getting out of the rain. Under bedtime deliberately: at that hour they are
    // already in and asleep, and rain is no reason to get anybody up.
    key: 'shelter',
    wants: (hh, bot, s, w) => w.wet,
    enter: (hh, bot, s, t) => hh._shelterEnter(bot, s, t),
    tick: (hh, bot, s, t) => hh._shelterTick(bot, s, t),
    exit: (hh, bot, s, t) => hh._shelterExit(bot, s, t),
  },
  {
    // BEING LED BY THE HAND. Below the weather and the hour, above everything
    // the cast decide for themselves — which is the whole ruling in one place:
    // your choice outranks their own plans, and the sky outranks you. It starts
    // raining, they let go and run for the door, and that is not a rule anybody
    // wrote here.
    key: 'held',
    wants: (hh, bot) => hh.hand === bot,
    enter: (hh, bot, s, t) => hh._heldEnter(bot, s, t),
    tick: (hh, bot, s, t, w) => hh._heldTick(bot, s, t, w),
    exit: (hh, bot, s, t) => hh._heldExit(bot, s, t),
  },
  {
    // Out into the snow, or out to look at a rainbow. `snowDone` is how one
    // character bows out of an occasion without ending it for the others.
    key: 'gather',
    wants: (hh, bot, s, w) => w.playing && !s.snowDone,
    enter: (hh, bot, s, t) => hh._gatherEnter(bot, s, t),
    tick: (hh, bot, s, t) => hh._gatherTick(bot, s, t),
    exit: (hh, bot, s, t) => hh._gatherExit(bot, s, t),
  },
  {
    // COMING TO SIT WITH YOU — see household.joinSettleMs.
    //
    // ABOVE THE HOBBY, and that placement is the app's own rule about this
    // world rather than a preference: a person beats a pastime everywhere on
    // this planet. Hachiware puts the guitar down to come and sit with you, and
    // picks it up again afterwards, without either of those being written
    // anywhere — they are two rows of a sorted list.
    //
    // Below the weather, the hour and the hand for the same reason everything
    // else is: rain ends it, midnight ends it, and taking somebody's hand is a
    // more direct answer to the same wish.
    key: 'joinsit',
    wants: (hh, bot, s, w) => hh._wantsJoin(bot, s, w),
    enter: (hh, bot, s, t) => hh._joinEnter(bot, s, t),
    tick: (hh, bot, s, t, w) => hh._joinTick(bot, s, t, w),
    exit: (hh, bot, s, t) => hh._joinExit(bot, s, t),
  },
  {
    // A HOBBY — see PASTIMES. Above the visit and below everything else, which
    // is what "idle tier" means: it is something to do when nothing is
    // happening, and the first thing dropped when something is.
    //
    // That placement is the whole of its interruption handling. Rain outranks
    // it, so a shower ends the song and Hachiware runs for the door; midnight
    // outranks it, so he stops and goes to bed; the snow gathering outranks it,
    // so he puts the guitar down and joins in. None of those is written
    // anywhere — they are three rows of a sorted list.
    key: 'pastime',
    wants: (hh, bot, s, w) => hh._wantsPastime(bot, s, w),
    enter: (hh, bot, s, t) => hh._pastimeEnter(bot, s, t),
    tick: (hh, bot, s, t, w) => hh._pastimeTick(bot, s, t, w),
    exit: (hh, bot, s, t) => hh._pastimeExit(bot, s, t),
  },
  {
    // Ordinary life: the clock toward the next visit, the walk, the stay, the
    // walk back. Always willing, so it is where anybody lands when nothing else
    // is asking for them.
    key: 'visit',
    wants: () => true,
    enter: (hh, bot, s, t) => hh._visitEnter(bot, s, t),
    tick: (hh, bot, s, t, w) => hh._visitTick(bot, s, t, w),
    exit: (hh, bot, s, t) => hh._visitExit(bot, s, t),
  },
];

const MODE_BY_KEY = {};
for (const m of MODES) MODE_BY_KEY[m.key] = m;

// WHERE EACH MODE SITS IN THE ORDER, so the priority the list already encodes
// can be ASKED rather than restated. The list is the only place the ranking
// lives; this is a lookup into it, and reordering the table above reorders this
// with it — which is what stops the offer and the outcome ever disagreeing.
const MODE_RANK = {};
MODES.forEach((m, i) => { MODE_RANK[m.key] = i; });
// ...and the one rank anything outside this file cares about. Everything ABOVE
// `held` is something the world is doing to somebody, and it wins: they are
// asleep, on their way to bed, or running out of the rain. Everything below is
// something they chose, and your hand outranks their plans.
const HELD_RANK = MODE_RANK.held;

export class Household {
  constructor({ globe, bots }) {
    this.globe = globe;
    this.bots = bots;
    // WHOSE HAND YOU ARE HOLDING, or null. One at a time: you have two hands
    // and one of them is doing the leading, which is also the only reading that
    // keeps the walk legible.
    this.hand = null;
    // ...and where you are, which being led is the only thing in here that
    // needs. Set by main.js beside `social`.
    this.rig = null;
    // WHO SPEAKS FOR THE CAST, set by main.js once social.js exists — a hobby
    // is the only thing in here that says anything out loud, and it asks rather
    // than reaching for a bubble itself. Null until wired, and every use is
    // guarded, so a household without one is simply a quiet one.
    this.social = null;

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
        // WHICH MODE THEY ARE IN, and WHERE THEY ARE IN IT — two fields where
        // there used to be one string, and the split is the whole of what makes
        // the four machines stop treading on each other.
        //
        // `phase` stood here and was shared by all of them, so its values had to
        // be globally unique guesses at what somebody was doing: `inside` meant
        // both "waiting out a shower" and "round for tea", and a flag called
        // `sheltered` had to be invented to tell them apart. It is gone, because
        // a step now only ever means something INSIDE its own mode — shelter's
        // `settled` cannot be confused with a visit's `home` no matter what
        // either of them is called.
        mode: 'visit',
        step: 'away',
        route: null,     // waypoints still to walk, first is current errand
        legs: 0,         // how many were left when progress was last seen
        litUp: null,     // the lights they switched off on their way to bed
        // `seat: null` stood here — which cushion this one was holding. Sitting
        // is in place now and claims nothing, so there is nothing to remember.
        // When they may next come and sit with you — see joinCooldownMs. Zero
        // is "any time", which is where everybody starts.
        joinAfter: 0,
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
        // `sheltered` STOOD HERE and the modes retired it. It existed only to
        // say whether a character whose `phase` read `inside` had got there by
        // sheltering or by visiting, because both machines spelled that state
        // the same way. Shelter has its own `settled` step now and nothing can
        // confuse the two, so there is nothing for a second flag to answer.
        //
        // When they next drift to another spot in the room — see _potter. Zero
        // means "as soon as they are settled", which is right: the first drift
        // should not wait out a full interval after a walk that already ended
        // in standing still.
        potterAt: 0,
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
    // see the gather mode. `_spot` is where they are meeting and doubles as "a
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
    // between the two gatherings; see the note above the gathering.
    this._why = null;
  }

  // A visit that begins during the small hours joins the night already in
  // progress. The ordinary bedtime mode deliberately shows everybody walking
  // home when midnight arrives while the game is open; replaying that walk on
  // a fresh load makes them begin the night outdoors instead.
  //
  // Called after the scene has received its initial daylight, so
  // lampsBurningIn() can see the midnight lamp levels before _fallAsleep turns
  // those switches off. Each body is parked where it would have finished its
  // bedtime route, which also gives it the right place to wake from at dawn.
  settleInitialBedtime() {
    if (activePhase() !== BEDTIME) return false;

    for (const bot of this.bots) {
      const s = this.state.get(bot);
      if (!s || !s.sleeps) continue;
      const sleeper = this.globe.sleepers.get(bot.spec.key);
      const at = s.own
        ? sleeper && sleeper.walkTo
        : this.globe.sleepSpotFor(bot.spec.key);
      if (!at) continue;

      bot.ch.standAt(at, 0);
      s.mode = 'bed';
      this._fallAsleep(bot, s);
    }

    // Do not spend the opening frames easing the windows down from the empty-
    // house level. The night was already settled before the page was opened.
    const by = {};
    for (const place of this.places) {
      const sleeping = this.bots.some((bot) => {
        const s = this.state.get(bot);
        return s.mode === 'bed' && s.step === 'asleep' && s.own === place;
      });
      const level = sleeping ? CONFIG.household.asleepLamps : CONFIG.household.emptyLamps;
      this._lit.set(place, level);
      by[place.style] = level;
    }
    this.globe.setOccupancy(by);
    return true;
  }

  get anyoneHome() {
    for (const s of this.state.values()) {
      if (s.mode === 'visit' && s.step === 'home') return true;
    }
    return false;
  }

  homeCount() {
    let n = 0;
    // ANYBODY NOT IDLE, which is what `phase !== 'away'` used to mean and is
    // now said in the terms the modes actually have: heading home, at home,
    // leaving — and equally anybody the weather or the hour has taken, since
    // all of those count against `atOnce` too.
    for (const s of this.state.values()) {
      if (!(s.mode === 'visit' && s.step === 'away')) n++;
    }
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

  // ON THEIR FEET, whatever they were on. Called by every path that is about to
  // walk somebody, because a body cannot walk sitting down — see `perched`,
  // which is what the wander checks.
  //
  // `_freeSeat` and `_releaseSeat` stood here, and their story is worth keeping
  // rather than deleting silently. Guests used to look for a free CUSHION on
  // arriving, claim it so two of them could not take the same one, and give it
  // back on the way out. It was correct machinery for a room that had cushions
  // in it, and neither room ever did: `globe.seats` was empty from the day the
  // furniture tables were written, so `_freeSeat` returned null every time and
  // nobody in this world has ever sat down indoors.
  //
  // What replaced it is the rule the player's own verb follows — sit where you
  // stopped. It needs no seat list, no claim and no release, because two friends
  // already do not STAND in the same place: the meets stop them at conversational
  // distance and the berths keep them apart, and sitting where you stopped
  // inherits all of that spacing for nothing. What is left of the old pair is
  // the one line that still had a job.
  _standThemUp(bot) {
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
    // ON THEIR FEET BEFORE THEY GO ANYWHERE, and this is the one place it can be
    // said once for every mode. A body cannot walk sitting down — the wander is
    // switched off for anybody `perched` — so an errand handed to somebody
    // sitting on the grass would set a destination they could not walk to, and
    // the mode would time out waiting for a walk that was never going to start.
    //
    // It has to be HERE rather than where each route is planned, because routes
    // are planned in five places and re-planned on every stall. This is the one
    // funnel they all pass through, and standing somebody already standing up is
    // free — see Character.standUp, which returns immediately unless perched.
    if (ch.perched) ch.standUp();
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
      if (ch.hurrying) ch.release('rest'); else ch.capHold('rest', tMs + 600);
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
  _gatherTick(bot, s, tMs) {
    const ch = bot.ch;
    if (s.step === 'playing') {
      // HAD THEIR FILL, which is a `wants` answer rather than a transition.
      //
      // This used to be checked in the dispatch above the gathering, and had to
      // be, because the gathering returned early for anybody already playing — so
      // a timer checked after it would never be reached. Setting the flag here
      // says the same thing in the one place that knows it: on the next frame
      // `gather.wants` is false, the dispatcher exits this mode and enters the
      // next, and no branch anywhere had to be ordered around a return.
      if (tMs > s.until) { s.snowDone = true; return; }
      // Milling about where they stopped. Held with the same pinned rest the
      // shelter uses, so a chat or you walking up never leaves a stale clock
      // that frees somebody to wander off mid-snowman.
      ch.hold('rest', tMs + 1200);
      return;
    }

    // Re-aimed on a stall, and given up on outright if it goes on too long —
    // see the note below on why THIS errand is allowed to be abandoned when
    // bedtime's and the shelter's are not.
    if (!s.route || !s.route.length || tMs > s.giveUpAt) {
      if (tMs > s.giveUpAt) { s.snowDone = true; return; }
      this._aimAtGather(bot, s, tMs, this._spot);
      return;
    }
    if (this._walkRoute(s, ch, tMs)) {
      // Arrived, so they are ordinary again — see the note in _gatherEnter.
      // From here on you can walk up to them and they will stop for you.
      ch.hurrying = false;
      s.step = 'playing';
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

  // Out into it, aimed at the spot the caller works out ONCE for all three —
  // three characters each averaging the group's position would each get a
  // slightly different answer and walk to three different places.
  _gatherEnter(bot, s, tMs) {
    const ch = bot.ch;
    s.step = 'walking';
    {
      // `hurrying` FOR THE WALK ONLY, and cleared the moment they arrive.
      //
      // The first version left it off, on the reasoning that going out to play
      // is not an errand with a deadline: if you have walked over to say hello
      // on the way, the snowman can wait, and somebody who would not stop to
      // talk to you on the way to build one is not somebody having a nice time.
      // That reasoning is still right about the GATHERING and was wrong about
      // the walk, in the exact way this file has already recorded once — see
      // the same measurement in _bedEnter.
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
      ch.release('rest');
      this._aimAtGather(bot, s, tMs, this._spot);
    }
  }

  // ...and giving up is allowed on THIS errand, which is the other half of the
  // same point. A shelter walk is re-planned forever because the alternative is
  // somebody standing in the rain; if this one cannot be walked, they simply do
  // not join in, and the others get on with it. See the `snowDone` set in the
  // tick, which is how one character bows out without ending the occasion.
  _gatherExit(bot, s) {
    const ch = bot.ch;
    ch.errand = null;
    ch.walking = false;
    // ...and off the walk's right of way, whichever end of it this was reached
    // from. Left set, somebody who gave up on an unwalkable gathering would go
    // on pushing past you for the rest of the session.
    ch.hurrying = false;
    s.route = null;
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

  // WHERE SOMEBODY LIVES, which is not always where they are. Falls back to the
  // first home so a character without one still has somewhere to be a guest.
  _ownPlace(bot) {
    return this.places.find((pl) => pl.home.owner === bot.spec.key)
      || this.places[0] || null;
  }

  // `_backToLife` STOOD HERE and is gone, because what it did was three modes'
  // work in one function: it cleaned up the gathering, it decided that ordinary
  // life came next, and it set that life's opening state. Those are now
  // `_gatherExit`, the dispatcher, and `_visitEnter` — and the split is what
  // lets a gathering interrupted by RAIN do the right thing without anybody
  // writing that case down.
  //
  // `snowDone` survives it and is still the reason this is an event rather than
  // a loop. Without it somebody who finished playing went back to `away`, which
  // is exactly what the dispatch reads as "not yet gathered", so on the very
  // next frame they were sent out again. Measured: two of them ping-ponged
  // between playing and walking to the same spot for the entire twenty minutes
  // a cover takes to melt, and the latch that ends the gathering never closed
  // because somebody was always busy. It is one flag per character rather than
  // one for the group, because they finish at different times.

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
    // along — see the `settled` step in _shelterTick. They still have a spot to
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
  // Everything that would otherwise delay setting off, cleared on this frame
  // rather than waited out — the rest, the conversation, and you standing
  // there. See the same list in _bedEnter; the only thing that differs is what
  // they are late for. The cushion is not on it: whichever mode was holding one
  // gave it back on the way out.
  _shelterEnter(bot, s, tMs) {
    const ch = bot.ch;
    s.step = 'walking';
    ch.hurrying = true;
    ch.release('rest');
    ch.release('talk');
    this._aimAtShelter(bot, s, tMs);
  }

  // `settled` MEANS SETTLED, and it is a step of this mode's own — which is the
  // small structural thing that retired a flag.
  //
  // `phase` used to be shared with the visiting machine, so `inside` was equally
  // the answer for somebody who had walked here to wait out a shower and for
  // somebody who was round for tea when it started. Telling them apart needed a
  // second field, `sheltered`, whose entire job was to disambiguate a string.
  // A step that only means anything inside its own mode cannot be ambiguous, so
  // there is nothing left to disambiguate.
  _shelterTick(bot, s, tMs) {
    const ch = bot.ch;
    if (s.step === 'settled') {
      // Waiting it out, and moving about the room while they do — see _potter,
      // which holds them still between drifts exactly as the flat pin used to.
      // Somebody stood rigid for the length of a downpour was the plainest case
      // of the room looking switched off, because a shower is long.
      this._potter(bot, s, tMs, s.place);
      return;
    }

    // Re-planned rather than abandoned, for the reason bedtime is: there is no
    // later. An errand you can give up on is fine when another is along in five
    // minutes, and this one has to end with somebody indoors or it has not
    // happened. The deadline measures STALLING and resets on progress — see the
    // long note in _bedTick, which this is the same mechanism as.
    if (!s.route || !s.route.length || tMs > s.giveUpAt) {
      this._aimAtShelter(bot, s, tMs);
      return;
    }
    if (this._walkRoute(s, ch, tMs)) {
      ch.hurrying = false;
      s.step = 'settled';
      s.route = null;
      // Drift to somewhere else in the room as soon as they have stood a moment,
      // rather than waiting out a full interval after a walk that already ended
      // in standing still.
      s.potterAt = 0;
      // Down where they stopped. Somebody waiting out a shower sitting down is
      // the whole of what makes the room read as shelter rather than as three
      // people standing in a box.
      //
      // No seat to find and none to claim — see _standThemUp. Their walk ended at
      // their own standing spot, one each, so sitting there puts them exactly
      // where the room already spaced them. ...and if the room they ran into
      // holds their own table, they take that instead — see _takeSeat.
      this._takeSeat(bot, s.place);
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
  // THE ONLY WAY INTO `settled` IS ARRIVING, which is the same rule _bedTick
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
    // THEIR OWN CORNER, DECIDED BEFORE THE WALK. This planned every shelterer
    // to `spots[0]` once — one number, for everybody, in both houses — so the
    // walk itself aimed all of them at the same point on the floor and they
    // finished the storm standing in each other. Usagi barging into Chiikawa's
    // made it plain, because that is the case with two bodies in one room.
    //
    // `_standSpot` is keyed off their place in the cast rather than off what is
    // free, so two people can never be sent to the same one and there is nothing
    // to claim or release — which is also why this survives being re-run on
    // every stall without handing anybody a second anything.
    const dest = this._standSpot(bot, pl, new THREE.Vector3());
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
  // THEIR OWN PLACE FIRST, if this room holds the piece of furniture that makes
  // it theirs — Chiikawa's table, Hachiware's box. See `household.seats`, which
  // carries the reasoning and the measurements.
  //
  // Looked up by ART IN THIS ROOM rather than by whose house it is, and that is
  // what keeps the awkward cases honest without a single test for them: the
  // piece is either here or it is not. Chiikawa sheltering in the cave finds no
  // table and takes her ring spot; a table added to the cave one day would seat
  // her at it, which is the right answer arrived at for free.
  //
  // `past` is measured from the piece's own `out`, both in world units from the
  // middle of the room — the same frame the furniture is placed in, so the two
  // cannot drift apart. Clamped to the walk ring so a wide piece near a wall
  // cannot seat somebody inside it.
  // Their own piece of furniture in THIS room, or null. Split out from
  // _standSpot because two callers need the answer to different questions: that
  // one wants the place, and the walk wants to know whether to arrive precisely.
  _furnitureSeat(bot, pl) {
    const seat = CONFIG.household.seats && CONFIG.household.seats[bot.spec.key];
    if (!seat || !seat.beside) return null;
    const list = pl.home.spec.furniture;
    const piece = list && list.find((f) => f.art === seat.beside);
    return piece ? { piece, past: seat.past, side: seat.side || 0 } : null;
  }

  // SIT DOWN, and if this is their own table, sit down AT it rather than
  // wherever the walk happened to stop.
  //
  // The walk cannot be trusted with the last half metre, and the two attempts to
  // make it do so are both recorded here because both look reasonable until they
  // are measured. Arriving is `homeArrive`, 0.60 — wider than Chiikawa's table
  // is deep, so she was landing anywhere in a metre-wide circle and sitting
  // there: measured at bearing 0.93 out 1.61 against a seat at 1.20 / 1.95, off
  // to one side of her own table. Tightening the last waypoint to 0.20 for
  // seats only was worse: both pieces are registered solids, and Hachiware
  // walked up to his box, stopped 0.41 short with the target on the far side of
  // a thing he will not walk through, and stood there until the errand timed
  // out. A tolerance cannot fix this, because the floor genuinely does not let
  // them stand where the drawing wants them.
  //
  // So the walk gets them to the furniture and SITTING DOWN takes the place —
  // which is the honest description of what a character does anyway. It cannot
  // fail, needs nothing of the pathing, and is bounded by `homeArrive`: the
  // adjustment is never more than 0.6 units, comes at the end of a walk, and
  // lands under a sit that has its own settling motion to cover it.
  //
  // Only for a named seat. Somebody taking an ordinary spot on the ring sits
  // exactly where they stopped, as they always have — a spot is a place to be,
  // not a place to be precisely.
  _takeSeat(bot, pl) {
    const ch = bot.ch;
    if (pl && this._furnitureSeat(bot, pl)) {
      this._standSpot(bot, pl, ch.dir);
      ch._sync(CONFIG.globe.radius);
    }
    ch.sitHere();
  }

  _standSpot(bot, pl, out) {
    const h = CONFIG.household;
    const seat = h.seats && h.seats[bot.spec.key];
    const mine = this._furnitureSeat(bot, pl);
    if (mine) {
      const units = Math.min(mine.piece.out + mine.past, pl.walk);
      return this._onRing(pl, mine.piece.at + mine.side, units, out);
    }
    const spots = h.spots;
    if (!spots || !spots.length) return this._insideSpot(pl, Math.PI, 0.5, out);
    // Their own index if they have been given one, cast order if not — see the
    // note in `seats` on why the three of them are named rather than counted.
    const i = seat && seat.spot != null
      ? seat.spot
      : Math.max(0, this.bots.indexOf(bot));
    const spot = spots[i % spots.length];
    return this._insideSpot(pl, spot.at, spot.out, out);
  }

  // ------------------------------------------------------------- pottering
  //
  // A FEW STEPS TO SOMEWHERE ELSE IN THE ROOM, every so often.
  //
  // This is what stands where a permanent pin used to. Both the visit and the
  // shelter held `restUntil` ahead on every frame — "no strolling indoors" —
  // and the result was a room full of people who had stopped being alive: you
  // walked in on three friends standing exactly where the arithmetic had left
  // them, facing you, until a timer somewhere else let them out.
  //
  // The pin was answering a real question. A random stroll planned from inside
  // is a great circle that can perfectly well end in the garden, and somebody
  // in phase `home` walking out through their own front door leaves the state
  // machine describing a room they are not in.
  //
  // So the answer is a shorter question rather than a ban: pick a spot that is
  // INSIDE by construction — see _roomSpot — and hand it over as an ordinary
  // one-leg route. Everything else follows for free. The route walks through
  // `_walkRoute`, so it gets the tight indoor arrival tolerance; the walk
  // itself goes through the cast's own path fencing, so it keeps out of the
  // wall band and off the furniture; and being a route rather than a stroll
  // means the visit's own leaving code overwrites it without having to know
  // this exists.
  //
  // NOBODY GETS UP TO DO IT. Sitting down is already somewhere to be, and
  // standing up to pace would undo the whole reason they sat.
  //
  // Asked of the BODY rather than of a seat record, which is what the change to
  // sit-in-place left behind: `perched` is true for a sitting friend and for one
  // up on a pudding, and both of them are somewhere they chose to be.
  _potter(bot, s, tMs, pl) {
    const ch = bot.ch;
    if (!pl) return;
    if (ch.perched) {
      ch.hold('rest', tMs + 1500);
      return;
    }

    // Mid-drift: walk it, and on arrival start the clock for the next one.
    if (s.route && s.route.length) {
      // A drift that cannot be walked is not worth re-planning — there is no
      // errand riding on it. Drop it and stand about until the next one is due,
      // which is also what somebody who thought better of it does.
      if (tMs > s.giveUpAt) {
        s.route = null;
        ch.errand = null;
        s.potterAt = tMs + between(CONFIG.household.potterMin, CONFIG.household.potterMax);
        return;
      }
      if (this._walkRoute(s, ch, tMs)) {
        s.route = null;
        s.potterAt = tMs + between(CONFIG.household.potterMin, CONFIG.household.potterMax);
      }
      return;
    }

    // Standing about. Pinned exactly as before between drifts, so nothing can
    // wander off in the gaps — the pin was never wrong, it was only unending.
    if (tMs < (s.potterAt || 0)) {
      ch.hold('rest', tMs + 1500);
      return;
    }

    s.route = [this._roomSpot(pl, new THREE.Vector3())];
    s.legs = 1;
    s.giveUpAt = tMs + CONFIG.sleep.retryMs;
    // Let go of the pin the branch above has been holding, or they would stand
    // there for another second and a half with somewhere to be.
    ch.release('rest');
  }

  // Somewhere else in this room to stand — a bearing anywhere round the middle
  // and a distance out that CANNOT reach the door.
  //
  // 0.7 of the walk radius is the whole safety argument. The door is a gap in a
  // wall that sits at the radius itself, so a target kept comfortably inside it
  // has no way to become an accidental exit however the bearing rolls — which
  // is what lets the pottering be an ordinary stroll rather than a supervised
  // one. The near limit keeps them off the dead middle of the floor, where
  // three people would converge on the same spot.
  //
  // Pushed off the furniture like any other destination. A cushion is solid, so
  // without this a drift could pick the inside of one and stall against a berth
  // it is not allowed to enter.
  _roomSpot(pl, out) {
    const bearing = (Math.random() * 2 - 1) * Math.PI;
    const frac = 0.2 + Math.random() * 0.5;
    return keepOffSolids(
      this._insideSpot(pl, bearing, frac, out),
      CONFIG.wander.wallKeep,
    );
  }

  // It stopped. Out they come, by the ordinary leaving route — which is the
  // whole point of having reused the visit's states: there is nothing special
  // about the end of a shower except that it ends.
  _shelterExit(bot, s, tMs) {
    const ch = bot.ch;
    const pl = s.place;
    ch.hurrying = false;
    s.hide = null;
    this._standThemUp(bot);
    ch.errand = null;
    ch.walking = false;
    s.route = null;
    // A moment in the doorway looking at the sky before stepping out into it,
    // which is what anybody does when the rain stops.
    ch.hold('rest', tMs + 1400);

    // WHOSE HOUSE THEY ARE STANDING IN decides whether `place` is put back.
    //
    // Still under the borrowed roof: leave it pointing there, because the walk
    // out has to be planned from the door they are actually behind — and
    // `_visitEnter`, which runs next, reads exactly this field to plan it.
    // Out on the grass: put it back to where they live, or Usagi would treat
    // whichever house he sheltered in as his local from then on.
    //
    // The old version did both, in that order, and the override won — so the
    // borrowed door survived the walk out and stayed as `place` for the rest of
    // the session, which is the bug the comment was warning about. Deciding once
    // is what fixes it; the walk out puts it back when it finishes.
    const inside = pl && ch.dir.dot(pl.dir) > Math.cos(pl.building.r);
    if (!inside) s.place = this._ownPlace(bot);
  }

  // ------------------------------------------------------------------ bedtime

  // Get them to bed and keep them there. Called every frame of the small hours
  // for everybody who has a drawing to lie down in.
  // THEY SET OFF ON THIS FRAME, whatever they were in the middle of. The hour
  // turning is not a suggestion, and there are three things that would
  // otherwise each delay it by seconds — so all three are cleared here rather
  // than waited out.
  //
  //   A REST. The wander rests up to six seconds between strolls, and being
  //   part way through one at midnight is the common case rather than the
  //   unlucky one.
  //
  //   A CONVERSATION. `busyUntil` holds two of them still for the length of an
  //   exchange plus `meetHoldMs`, seven seconds on its own.
  //
  //   YOU, standing nearby — which is the freeze `hurrying` lifts, and the one
  //   that did not merely delay them but stopped them for good. It is set here
  //   and stays set for the whole walk, so none of the above can creep back in
  //   halfway home.
  //
  // THE CUSHION IS NOT ON THAT LIST ANY MORE, and neither is the shelter's
  // borrowed door. Both used to be undone here — a seat held by somebody who
  // had gone to bed is one nobody can sit on tomorrow, and a door borrowed in a
  // shower would outlive the rain that sent them through it — and both are now
  // put back by the mode that took them, in its own `exit`. That is the whole
  // trade this restructure makes: bedtime no longer knows that visiting or
  // sheltering exist.
  _bedEnter(bot, s, tMs) {
    const ch = bot.ch;
    s.step = 'walking';
    ch.hurrying = true;
    ch.release('rest');
    ch.release('talk');
    this._aimAtBed(bot, s, tMs);
  }

  _bedTick(bot, s, tMs) {
    const ch = bot.ch;
    if (s.step === 'asleep') return;

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
    s.step = 'asleep';
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
    // back what this put out and nothing else — see _bedExit.
    s.litUp = s.own ? this.globe.lampsBurningIn(s.own.home) : [];
    for (const L of s.litUp) this.globe.toggleLight(L);
  }

  // Morning. Also any moment the hour stops being midnight, which the scrubber
  // can make happen at any point in the night including halfway to bed.
  //
  // AN EXIT RATHER THAN A TRANSITION, which is the shape every mode's departure
  // takes now. This used to decide what came next as well — whether they walked
  // out of their own front door or simply started their day where they stood —
  // and that decision was the same one `_comeOut` was making, separately, for
  // the rain. Both are gone: this puts back only what bedtime took, and where
  // somebody resumes from is `_visitEnter`'s single answer for everybody.
  _bedExit(bot, s, tMs) {
    const ch = bot.ch;
    const wasAsleep = s.step === 'asleep';
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
    // A moment on their feet before setting off, so waking is a beat rather
    // than a body already walking.
    ch.hold('rest', tMs + 1200);
  }

  // `playerDir` was the fourth argument and is gone with `crowded`, the one
  // thing that read it — see the note there. Where you are standing is not a
  // question this file has to ask any more: the cast decide for themselves how
  // much of their attention you are owed, and they do it in one place.
  update(dtMs, tMs, indoors) {
    if (!this.places.length) return;
    // THE FIRST HOBBY IS NOT DUE AT THE DOOR.
    //
    // `pastimeAt` began life unset, and `_wantsPastime` reads unset as "ready
    // now" — so the opening move of every session, measured, was BOTH of them
    // setting off for the pudding and the stump at second 0 and performing
    // together by second 1.4. A rare occasion that greets you on the doorstep
    // every time you arrive is not an occasion, it is a screensaver.
    //
    // Seeded lazily rather than in the constructor because that is where the
    // clock is; one independent draw each, so they do not merely start late,
    // they start at DIFFERENT times.
    if (!this._pastimeSeeded) {
      this._pastimeSeeded = true;
      for (const b of this.bots) {
        const p = PASTIME_FOR[b.spec.key];
        if (p) this.state.get(b).pastimeAt = tMs + between(p.gapMin, p.gapMax);
      }
    }
    const h = CONFIG.household;
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

    // ONE DISPATCH FOR EVERYBODY, and the ladder of `if`s it replaced is worth
    // remembering. Every mode used to need two branches — one to run it, one to
    // catch the states it left behind when its turn was over — and each of those
    // second branches had to name the other modes' states to do it. That is
    // where the `phase` string had to be globally unique, where `_backToLife`
    // and `_comeOut` and `_getUp` each grew their own copy of "and then ordinary
    // life resumes", and where every bug of the last week lived.
    //
    // Both directions are still handled every frame, which is what makes a
    // finger thrashing the time scrubber or the weather picker harmless: nothing
    // is staged, there is no transition state, and the answer to "what should
    // this character be doing" is recomputed from the world each frame.
    const world = { bedtime, wet, playing, indoors, tMs, dtMs };
    for (const bot of this.bots) {
      const s = this.state.get(bot);
      if (!s.place) continue;
      const want = MODES.find((m) => m.wants(this, bot, s, world));
      if (want.key !== s.mode) {
        const had = MODE_BY_KEY[s.mode];
        if (had) had.exit(this, bot, s, tMs);
        s.mode = want.key;
        want.enter(this, bot, s, tMs);
      }
      want.tick(this, bot, s, tMs, world);
    }

    this._snowman(tMs, playing);
    this._windows(dtMs);
  }

  // ---------------------------------------------------------- being led
  //
  // TAKEN AND GIVEN BACK by main.js, which is where a press on a pill lands.
  // The mode does the rest, so nothing outside has to know what being led
  // involves — and letting go is one call from anywhere, which the glide and
  // the doorway both use.
  // WHETHER A HAND CAN BE TAKEN AT ALL, which is a different question from
  // whether somebody is standing in front of you.
  //
  // `held` is a mode like any other and it can LOSE. Above it sit the two things
  // the world does to people — going to bed and getting out of the rain — and
  // while either is in force, taking a hand plants a claim that the dispatcher
  // refuses every frame: the mode never runs, nobody follows you, and the claim
  // simply sits there. Measured, that is exactly what shipped: tapping
  // 「てをつなぐ」 at somebody walking home at midnight flipped the pill to
  // 「てをはなす」 and lied all night, capped your own walk to a leading pace with
  // nobody beside you, and then — because the stale claim was the highest-ranked
  // mode left once the hour turned — marched them twelve units across the meadow
  // to your side at dawn. The hand had not survived the night; it had been
  // created during it.
  //
  // ASKED OF THE RANKING rather than of a list of mode names, so this cannot
  // drift from the table it is about. A mode added above `held` is refused by
  // this the day it is added, and one added below is allowed, both without
  // anybody remembering to come back here.
  //
  // `atPlay` is the third refusal and the oldest: it is enforced at the FOCUS
  // already — a performer is not somebody you can point at — so this is a
  // backstop rather than the rule. It is here because the focus and the pill are
  // two doors into the same room, and a rule kept at one of them is a rule with
  // a way round it.
  canLead(bot) {
    if (!bot) return false;
    // Already leading them is not a question about whether you may begin.
    if (this.hand === bot) return true;
    const s = this.state.get(bot);
    if (!s || !s.place) return false;
    const rank = MODE_RANK[s.mode];
    if (rank !== undefined && rank < HELD_RANK) return false;
    return !this.atPlay(bot);
  }

  // Refused rather than merely unoffered when the answer is no. The pill asks
  // `canLead` too and will not show — this is the backstop that makes the offer
  // and the outcome the same answer however the call arrives.
  takeHand(bot) {
    if (!bot || this.hand === bot) return false;
    if (!this.canLead(bot)) return false;
    this.hand = bot;
    return true;
  }

  letGo() {
    if (!this.hand) return false;
    this.hand = null;
    return true;
  }

  get handHeld() { return this.hand; }

  // MID-PERFORMANCE, and so not to be interrupted — up on the pudding or the
  // stump, sliding or singing. Asked by the focus and the taps in main.js.
  //
  // THE WALK THERE IS DELIBERATELY NOT INCLUDED. Stopping somebody on their way
  // to the pudding to say hello is a nice thing that happens between friends,
  // and it costs nothing: the cooldown is written on the way OUT of the mode, so
  // an interrupted approach simply tries again later. What must not be
  // interrupted is the thing itself — and the hand in particular, since `held`
  // outranks `pastime`, so taking a perched singer's hand would pull them off
  // the stump into a tow that assumes a standing body.
  //
  // `null` rather than false when they are free, so this reads at the call site
  // like every other question about somebody here.
  // A PLAIN BOOLEAN, not the pastime itself. Returning `s.pastime` was the
  // obvious thing and it makes the answer depend on a field the question is not
  // about: every caller asks "may I interrupt this person", none wants to know
  // WHICH hobby, and a state whose `pastime` had not been written would answer
  // "go ahead" to a question it had really said no to.
  atPlay(bot) {
    const s = this.state.get(bot);
    // `busy` is the whole of being at it — the mode has three steps and the
    // other two are the walk there and the frame it ends on.
    return !!s && s.mode === 'pastime' && s.step === 'busy';
  }

  // ...and the same question asked of a Character, which is what the focus and
  // the tap have in their hands. Costs a walk of three, and saves every caller
  // keeping its own character-to-bot map.
  playingAt(ch) {
    for (const bot of this.bots) if (bot.ch === ch) return this.atPlay(bot);
    return false;
  }

  // WHETHER 「いっておいで」 HAS ANYTHING TO SAY — you are leading somebody, they
  // have a hobby with a drawing, and the thing it happens on is close by.
  // Asked every frame by the pill builder, so it takes no side effects.
  //
  // Hands back the SITE as well as the pastime now, because the offer and the
  // mark over the thing being offered have to be the same answer. Two callers
  // each finding their own site would be two chances to disagree about which
  // stump — and `perchSite` picks the nearest to a moving character, so they
  // genuinely could.
  canSendToPlay() {
    const bot = this.hand;
    if (!bot || !bot.ch.pastimeTex) return null;
    const p = PASTIME_FOR[bot.spec.key];
    if (!p) return null;
    const site = this.globe.perchSite(p.site, bot.ch.dir);
    if (!site) return null;
    const near = bot.ch.dir.angleTo(site.dir) * CONFIG.globe.radius;
    return near < LEAD_LURE ? { pastime: p, site } : null;
  }

  // ...and the press itself: let go, clear their cooldown, and off they run.
  // The cooldown clears because being walked here by a friend is not a turn to
  // be rationed — the rarity the gap protects is the SELF-started kind.
  sendToPlay(tMs) {
    const bot = this.hand;
    const offer = this.canSendToPlay();
    if (!bot || !offer) return false;
    const p = offer.pastime;
    const s = this.state.get(bot);
    s.pastimeAt = 0;
    this.letGo();
    if (this.social && bot.dlg.has(p.bucket) && this.social.canChatter(bot.ch)) {
      this.social.speak(bot, p.bucket, tMs);
    }
    return true;
  }

  // DRIVEN RATHER THAN WALKED, which is the whole of how this stays in step
  // with you. `driven` is the flag the player's own body wears — "somebody else
  // decides where this stands" — and setting it is what stops the wander from
  // planning strolls that would fight the leash on the same frame.
  _heldEnter(bot, s, tMs) {
    const ch = bot.ch;
    s.step = 'led';
    ch.driven = true;
    ch.errand = null;
    ch.walking = false;
    s.route = null;
    // Whichever side they are already standing is the side they walk on, so
    // taking a hand does not begin with them crossing in front of you.
    s.leadSide = this._sideOf(ch.dir) >= 0 ? 1 : -1;
  }

  _heldTick(bot, s, tMs, world) {
    const ch = bot.ch;
    const rig = this.rig;
    if (!rig) return;
    const R = CONFIG.globe.radius;
    const dt = world.dtMs;

    // ...UNLESS THEY SEE THEIR OWN PUDDING.
    //
    // Leading somebody to the thing they love should not end with a menu. It
    // ends with them letting go of your hand and running the last stretch,
    // which is both the better picture and the honest one: you did the walking,
    // and the last few steps are theirs.
    //
    // They drop the hand THEMSELVES — `letGo` here rather than a flag for
    // main.js to notice — and the cooldown is cleared with it, because being
    // walked to your own stump is not an occasion to be told you have had your
    // turn for the next five minutes. The dispatcher does the rest: `held`
    // stops wanting them on the very next frame and `pastime` is the next mode
    // down that does.
    // Where you are looking, flattened onto the ground you are standing on.
    // Taken from the camera rather than from the stick, so a companion settles
    // on the side of your VIEW — which is what "not in the way" means — and
    // stays put while you stand still and turn on the spot.
    this._leadFrame(rig.anchor);
    // Their side first, then tucked in behind when the side has no room: a
    // doorway is 1.9 across and two abreast do not fit through it.
    const side = this._leadSpot(rig.anchor, _leadRight, s.leadSide * LEAD_SIDE);
    let want = side;
    if (!this._canStand(want)) {
      want = this._leadSpot(rig.anchor, _leadFwd, -LEAD_BACK);
      // A back spot refused as well is left AS the target anyway. Walking
      // toward an illegal spot along legal ground is fine — the steps below are
      // each checked, so they simply get as near as the world allows and stand.
      // What stood here before was "fall back to the player's own anchor",
      // which was the lying-flat bug: it marched them underneath the camera.
    }

    const gap = ch.dir.angleTo(want) * R;
    const speed = CONFIG.player.walkSpeed * LEAD_CATCHUP;
    const step = (speed / R) * (dt / 1000);
    if (gap < 0.06) { ch.standAt(ch.dir, dt, { walking: false }); return; }

    // ...AND ROUND WHATEVER IS IN THE WAY.
    //
    // The step is checked and not only the destination — a legal spot on the far
    // side of a wall is still a walk through the wall — and the first version
    // stopped there, refusing the step and returning. That is a companion who
    // walks up to the first obstacle between you and stands at it for the rest
    // of the walk: measured, closing from 6.69 units to 4.82 and then never
    // moving again, because the player had been standing on the house doorstep
    // and the straight line crossed the wall.
    //
    // So a refused step is swung aside rather than abandoned, nearest first and
    // alternating, exactly as the cast's own detour does it — keeping a
    // constant distance from something IS going around it, and the wide swings
    // are what let them follow you round a corner rather than through it.
    //
    // Nothing is remembered between frames. The swing is re-chosen every step
    // from where they have got to, so an obstacle that stops mattering stops
    // being avoided on the very next frame.
    let moved = false;
    const gapToYou = ch.dir.angleTo(rig.anchor) * R;
    for (const off of LEAD_SWING) {
      if (!this._leadToward(ch.dir, want, _leadTan)) break;
      if (off) _leadTan.applyAxisAngle(ch.dir, off).normalize();
      _leadNext.copy(ch.dir).multiplyScalar(Math.cos(step))
        .addScaledVector(_leadTan, Math.sin(step)).normalize();
      // NEVER DEEPER INTO YOUR SPACE — see LEAD_CLEAR. Nearer than the bubble
      // AND nearer than they already are is refused, so a friend who somehow
      // starts inside it (you took their hand at arm's length) can walk out,
      // and one outside it can never be steered through you by a turning side
      // target. The swing then routes round you like round a tree.
      const nextGap = _leadNext.angleTo(rig.anchor) * R;
      if (nextGap < LEAD_CLEAR && nextGap < gapToYou - 1e-4) continue;
      if (!this._canStand(_leadNext)) continue;
      // Walking only when they are actually covering ground, so somebody
      // keeping pace beside a standing player stands rather than jogs on the
      // spot.
      ch.standAt(_leadNext, dt, { walking: gap > 0.12 });
      moved = true;
      break;
    }
    // Boxed in on every bearing — rare, and the honest answer is to wait a
    // frame. They are being led, so the thing that will free them is you
    // moving, which is exactly what happens next.
    if (!moved) ch.standAt(ch.dir, dt, { walking: false });
  }

  // LETTING GO IS PART OF LETTING GO, whoever decided it.
  //
  // The exit runs for two quite different reasons — you pressed the pill, or
  // the sky took them — and only the first arrives with the hand already
  // dropped. Without this the second left the household still believing it was
  // being led: they ran for the door, waited out the shower, and then snapped
  // back to your side the moment it cleared, having never been released. And
  // the leash on your own walk went with it, so you stayed capped to a leading
  // pace with nobody to lead.
  //
  // Idempotent, so the ordinary press — which drops the hand and lets the
  // dispatcher notice — costs nothing here.
  _heldExit(bot, s) {
    const ch = bot.ch;
    this.letGo();
    ch.driven = false;
    ch.walking = false;
    ch.errand = null;
    // A beat before they set off on their own again, so letting go reads as a
    // parting rather than as somebody walking off mid-sentence.
    ch.hold('rest', (this.rig ? 0 : 0) + performance.now() + 900);
  }

  // The local frame you are standing in: where you are looking, and your right.
  // THE WAY YOU ARE FACING, asked of the RIG rather than of the camera.
  //
  // It read the camera's forward, which is the same thing right up until the
  // selfie view swings the lens round to look back at you — and then it is
  // exactly backwards. A friend led by the hand would swap from your left to
  // your right the instant you turned the camera round, and back again when you
  // turned it off, which is the sort of thing that looks like a physics bug
  // rather than a camera one. The rig's own heading is what "beside you" was
  // always about; the lens merely used to agree with it.
  _leadFrame(anchor) {
    if (this.rig && this.rig.facing) this.rig.facing(_leadFwd);
    else _leadFwd.set(0, 0, -1).applyQuaternion(this.globe.camera.quaternion);
    _leadFwd.addScaledVector(anchor, -_leadFwd.dot(anchor));
    if (_leadFwd.lengthSq() < 1e-9) {
      _leadFwd.set(0, 1, 0).cross(anchor);
      if (_leadFwd.lengthSq() < 1e-9) _leadFwd.set(1, 0, 0).cross(anchor);
    }
    _leadFwd.normalize();
    _leadRight.crossVectors(anchor, _leadFwd).normalize();
  }

  // The tangent at `from` pointing toward `to`. False when the two coincide and
  // there is no direction to give.
  _leadToward(from, to, out) {
    out.copy(to).addScaledVector(from, -to.dot(from));
    if (out.lengthSq() < 1e-12) return false;
    out.normalize();
    return true;
  }

  // A spot `units` along `tangent` from where you stand.
  _leadSpot(anchor, tangent, units) {
    const arc = units / CONFIG.globe.radius;
    return _leadWant.copy(anchor).multiplyScalar(Math.cos(arc))
      .addScaledVector(tangent, Math.sin(arc)).normalize();
  }

  // Which side of your view somebody is on: positive is your right.
  _sideOf(dir) {
    const rig = this.rig;
    if (!rig) return 1;
    this._leadFrame(rig.anchor);
    return dir.dot(_leadRight);
  }

  // MAY A BODY BE HERE — the same three questions the cast's own pathing asks,
  // in one place, because being led is the one walk that does not go through
  // `_pickTarget` and so gets none of its fencing for free.
  _canStand(dir) {
    const keep = CONFIG.wander.wallKeep;
    if (inSolid(dir, keep)) return false;
    if (inBuilding(dir, keep)) return false;
    if (!pondsFrozen()
      && CONFIG.lakes.some((l) => inLake(dir, l, CONFIG.wander.waterKeep))) return false;
    return true;
  }

  // ------------------------------------------------- coming to sit with you
  //
  // See household.joinSettleMs for what this is and why it is the one behaviour
  // in the app that begins at their end rather than at yours.
  //
  // HOW LONG YOU HAVE BEEN SITTING, on the household's own clock. The rig knows
  // that you ARE sitting and nothing more, and it could not usefully know more:
  // `sit()` is called from a pointer handler, which runs on `performance.now()`,
  // while every mode here runs on the frame clock. A moment stamped on one and
  // compared against the other is the ONE CLOCK trap this codebase has been
  // caught by twice, so the stamp is taken here, from the clock that will read
  // it.
  _youSatFor(tMs) {
    if (!this.rig.seated) { this._youSatAt = 0; return 0; }
    if (!this._youSatAt) this._youSatAt = tMs;
    return tMs - this._youSatAt;
  }

  // Whether they feel like coming over — and, once they are there, whether they
  // are still willing to stay. Both from here, because `wants` is asked every
  // frame: a mode that stopped wanting to run would be exited on the spot, so
  // the conditions to KEEP sitting have to be the looser half of this.
  _wantsJoin(bot, s, world) {
    const h = CONFIG.household;
    const ch = bot.ch;
    // Nobody to sit with until main.js has wired the rig, and a household
    // without one is simply one where this never happens — the same guard
    // `social` gets a few lines up, for the same reason.
    if (!this.rig) return false;
    // The invitation itself. It ends the moment you stand, which is what makes
    // getting up the way to say the moment is over — no dismissal, no button.
    if (this._youSatFor(world.tMs) < h.joinSettleMs) return false;
    // Not from the far side of the planet, and not through a wall: sitting in
    // your house does not summon somebody in from the meadow, because the walk
    // in is a route this mode does not plan. Both of you under the same sky, or
    // both under the same roof.
    if (!!underRoof(ch.dir) !== !!underRoof(this.rig.anchor)) return false;
    if (ch.dir.angleTo(this.rig.anchor) * CONFIG.globe.radius > h.joinArc) return false;
    // Already sitting with you: keep going until the stay runs out. Asked
    // BEFORE the cooldown, or somebody would be thrown out of a sitting by the
    // clock that is only meant to space out the next one.
    if (s.mode === 'joinsit') return s.step !== 'done';
    if (world.tMs < (s.joinAfter || 0)) return false;
    // Somebody already off their feet is having their own moment — a hobby, a
    // rest on the grass — and this must not reach in and take it. They will be
    // asked again when they get up, which is what the wander's own sits do.
    if (ch.perched || ch.hurrying) return false;
    return true;
  }

  _joinEnter(bot, s, tMs) {
    const h = CONFIG.household;
    const ch = bot.ch;
    ch.standUp();
    // ONE BEARING EACH, by their place in the cast — the same trick `_standSpot`
    // uses indoors and for the same reason. Two friends deciding where to sit by
    // asking what is free would both be told the same patch of grass; an index
    // nobody shares cannot collide and needs nothing released.
    const i = Math.max(0, this.bots.indexOf(bot));
    const at = h.joinBearings[i % h.joinBearings.length];
    s.route = [this._besideYou(at, h.joinBesideArc, new THREE.Vector3())];
    s.step = 'coming';
    s.giveUpAt = tMs + h.headingMax;
  }

  // A spot beside where you are sitting, at a bearing off your own facing.
  //
  // Off YOUR FACING rather than off a fixed compass direction, so they arrive
  // in shot: whichever way you are looking when they set out is the way the
  // arc opens, and the selfie that made you sit down in the first place has
  // them in it.
  _besideYou(bearing, units, out) {
    const A = this.rig.anchor;
    this.rig.facing(_tan);
    _tan.applyAxisAngle(A, bearing);
    const arc = units / CONFIG.globe.radius;
    out.copy(A).multiplyScalar(Math.cos(arc)).addScaledVector(_tan, Math.sin(arc)).normalize();
    // Through the same fence every destination in this world goes through, so
    // the spot beside you is never in a wall, a trunk or a pond. Somebody
    // sitting at the water's edge does not get company standing in the lake.
    keepOutside(out, CONFIG.wander.wallKeep);
    keepOffSolids(out, CONFIG.wander.wallKeep);
    return out;
  }

  _joinTick(bot, s, tMs, world) {
    const h = CONFIG.household;
    const ch = bot.ch;
    if (s.step === 'coming') {
      // A walk that cannot be made is not worth insisting on — they simply do
      // not come, and ordinary life picks them up again.
      if (tMs > s.giveUpAt) { s.step = 'done'; return; }
      if (!this._walkRoute(s, ch, tMs)) return;
      // Arrived. Down onto the grass beside you, and a word about it.
      ch.sitHere();
      s.until = tMs + h.joinStayMax;
      s.step = 'sitting';
      if (this.social) this.social.sitDown(bot, tMs);
      return;
    }
    if (s.step === 'sitting') {
      // Held, so the wander cannot take them off mid-sit — the same pin the
      // visit uses indoors. `perched` already stops the walk; this stops the
      // rest of ordinary life from deciding they are idle.
      ch.hold('rest', tMs + 1500);
      if (tMs > s.until) s.step = 'done';
    }
  }

  // Standing up is the whole of it, and it happens for every reason at once:
  // you got up, it started raining, midnight came, they ran out of stay. The
  // dispatcher calls this on all of them, so none of those needed writing.
  _joinExit(bot, s, tMs) {
    bot.ch.standUp();
    bot.ch.release('rest');
    s.route = null;
    s.step = 'away';
    s.joinAfter = tMs + CONFIG.household.joinCooldownMs;
    // Back to ordinary life without an instant errand: they have just been
    // sitting with you, and setting straight off for home would undo it.
    s.due = tMs + between(CONFIG.household.gapMin, CONFIG.household.gapMax);
  }

  // ------------------------------------------------------------- the hobbies

  // Whether they feel like it — and, once they are at it, whether they are
  // still at it. Both answers come from here, because `wants` is asked every
  // frame and a mode that stopped wanting to run mid-song would be exited by
  // the dispatcher on the spot.
  //
  // `done` is set by the tick when the stay runs out, which is how a hobby ends
  // itself: on the next frame this returns false, the dispatcher exits, and the
  // cooldown is written by the exit. Nothing has to transition anybody.
  _wantsPastime(bot, s, world) {
    const p = PASTIME_FOR[bot.spec.key];
    if (!p) return false;
    // No drawing of them doing it, no doing it. The same courtesy a character
    // with no sleep sheet gets: they simply never lie down.
    if (!bot.ch.pastimeTex) return false;
    if (s.mode === 'pastime') return s.step !== 'done';
    if (world.tMs < (s.pastimeAt || 0)) return false;
    // ONE PERFORMER AT A TIME, which is what stops the two of them going off
    // together — and it does a second job the seed above cannot.
    //
    // Shelter, bedtime and a gathering all outrank a hobby, so a shower that
    // catches both cooldowns expired releases BOTH of them on the frame it
    // stops, and they set off in step however well staggered they started.
    // Every world event that pauses everybody is a metronome click. This is what
    // absorbs them: the first to ask gets the stage, and the other genuinely
    // re-staggers rather than merely being delayed by a frame.
    //
    // WRITTEN ONCE PER REFUSAL, not once per frame. The push lands only on a
    // frame that got this far, and getting this far means the cooldown had
    // already expired — so the next frame is caught by the line above and this
    // cannot run away at sixty times a second.
    if (this._onStage(bot)) {
      s.pastimeAt = world.tMs + between(PASTIME_QUEUE_MIN, PASTIME_QUEUE_MAX);
      return false;
    }
    // ...and the prop has to exist on this planet. A scatter that happened to
    // place no stumps is a world with no songs in it, rather than a crash.
    return !!this.globe.perchSite(p.site, bot.ch.dir);
  }

  // Is anybody else claiming the stage? THE WHOLE MODE, not just `busy`: the
  // walk there is a claim on it too, and a check that only saw the performing
  // half would let the second one set off while the first was still on its way,
  // which arrives at exactly the picture this exists to prevent.
  _onStage(except) {
    for (const b of this.bots) {
      if (b === except) continue;
      const o = this.state.get(b);
      if (o && o.mode === 'pastime') return true;
    }
    return false;
  }

  _pastimeEnter(bot, s, tMs) {
    const ch = bot.ch;
    const p = PASTIME_FOR[bot.spec.key];
    s.pastime = p;
    s.step = 'walking';
    // `hurrying` for the WALK only, exactly as the gathering does it and for
    // the same measured reason: without it you standing anywhere near them
    // holds the walk, and the one way anybody would use this feature — noticing
    // Hachiware set off and following him — is the case that could never work.
    // Cleared the moment they arrive, so a singer will still stop to talk.
    ch.hurrying = true;
    ch.release('rest');
    this._aimAtPastime(bot, s, tMs);
  }

  // Walk there, climb on, do it, and be finished.
  _pastimeTick(bot, s, tMs, world) {
    const ch = bot.ch;
    const p = s.pastime;
    if (!p) { s.step = 'done'; return; }

    if (s.step === 'busy') {
      if (tMs > s.until) { s.step = 'done'; return; }
      // ...and round they go. A slide is the drawing plus the movement: the
      // sheet supplies the sprawl and this supplies the fact that the pudding
      // is slippery. `spin` is zero for anybody whose hobby is to sit still.
      if (p.spin) this._spinOnPerch(bot, s, world.dtMs);
      // ...and the music, from wherever they have got to — a singer who slid
      // would take their notes with them, which is why this reads the body
      // rather than the perch.
      if (p.tune) {
        this.globe.tuneAt(ch.dir, s.perch ? s.perch.y : 0, world.dtMs, this.globe.camera);
      }
      // Something to say about it, on its own clock — and never over anybody
      // else, which is the one rule a song has to keep. `speak` silences the
      // rest of the cast, so a line fired on a fixed cadence would repeatedly
      // cut off whatever conversation was happening; yielding instead is also
      // just what somebody singing does when a friend starts talking.
      if (tMs > (s.sayAt || 0)) {
        s.sayAt = tMs + between(PASTIME_SAY_MIN, PASTIME_SAY_MAX);
        if (this.social && !this.social.anyoneSpeaking()
          && bot.dlg.has(p.bucket) && this.social.canChatter(ch)) {
          this.social.speak(bot, p.bucket, tMs);
        }
      }
      return;
    }

    if (!s.route || !s.route.length || tMs > s.giveUpAt) {
      // Giving up is allowed, the way it is for the gathering and unlike
      // bedtime: if they cannot get to the stump, they simply do not play
      // today. The cooldown in the exit keeps them from trying again at once.
      if (tMs > s.giveUpAt) { s.step = 'done'; return; }
      this._aimAtPastime(bot, s, tMs);
      return;
    }

    // THE DEADLINE MEASURES STALLING, NOT ELAPSED TIME — and getting that wrong
    // here cost a whole afternoon of Usagi never reaching the pudding.
    //
    // Every other walk in this file proves its progress by ticking off a
    // waypoint: `route.length` shrinks, and the deadline is pushed back. This
    // route is ONE leg, so that never happens, and the check quietly became a
    // stopwatch — he gave up 150 seconds after setting off however well the
    // walk was going. Measured: closing steadily on the pudding from eight
    // units out and abandoned mid-approach, every time.
    //
    // So progress is measured the only way a one-leg walk can measure it, by
    // getting NEARER. Any real gain buys another window; drifting or circling
    // buys nothing, which is what the deadline is actually for.
    const gap = ch.dir.angleTo(s.route[0]) * CONFIG.globe.radius;
    if (s.nearest === undefined || gap < s.nearest - 0.25) {
      s.nearest = gap;
      s.giveUpAt = tMs + CONFIG.sleep.retryMs;
    }

    if (this._walkRoute(s, ch, tMs)) {
      const site = this.globe.perchSite(p.site, ch.dir);
      if (!site) { s.step = 'done'; return; }
      // UP THEY GO. `perchAt` is the cushion machinery one step generalised —
      // stand them on top of a thing at its own height, wearing the drawing
      // that thing calls for.
      ch.hurrying = false;
      ch.perchAt(site.dir, this._perchY(ch, site, p), 'pastime-1');
      s.perch = site;
      s.spin = 0;
      s.step = 'busy';
      s.until = tMs + between(p.stayMin, p.stayMax);
      s.sayAt = tMs + 700;
      return;
    }
    if (s.route.length !== s.legs) {
      s.legs = s.route.length;
      s.giveUpAt = tMs + CONFIG.sleep.retryMs;
    }
  }

  // Round the top of the thing they are stood on. A small circle rather than a
  // spin on the spot, because what the drawing shows is somebody being carried
  // round by a surface they cannot grip — so the BODY has to travel.
  //
  // The radius is a fraction of the prop's own, so a bigger pudding is a wider
  // slide without a number here saying so, and it never reaches the rim.
  _spinOnPerch(bot, s, dtMs) {
    const site = s.perch;
    if (!site) return;
    s.spin = (s.spin || 0) + s.pastime.spin * (dtMs / 1000);
    const arc = site.r * 0.42;
    _tan.set(0, 1, 0).cross(site.dir);
    if (_tan.lengthSq() < 1e-9) _tan.set(1, 0, 0).cross(site.dir);
    _tan.normalize().applyAxisAngle(site.dir, s.spin);
    _spot.copy(site.dir).multiplyScalar(Math.cos(arc))
      .addScaledVector(_tan, Math.sin(arc)).normalize();
    bot.ch.perchAt(_spot, this._perchY(bot.ch, site, s.pastime), 'pastime-1');
  }

  // How high to stand them on the thing — its own top, less whatever the
  // drawing needs to put its SEAT there rather than its lowest pixel. See
  // `sink` in PASTIMES.
  //
  // Read off the posture's own measured plane rather than off `headTop`, which
  // still describes whichever pose they are wearing at the moment it is asked —
  // and at the moment this is asked, that is the standing one.
  _perchY(ch, site, p) {
    const pose = ch.pose && ch.pose['pastime-1'];
    const drop = (p && p.sink) ? p.sink * (pose ? pose.headTop : 0) : 0;
    return site.y - drop;
  }

  // Point them at a spot beside it and start the clock.
  //
  // BESIDE rather than at: the prop is solid, so a route that ended on its
  // middle would be trimmed short of itself by the walker's own fencing and
  // they would creep at it forever — the same failure a cushion had before the
  // destination exemption existed. They walk to arm's length and climb.
  _aimAtPastime(bot, s, tMs) {
    const ch = bot.ch;
    const p = s.pastime;
    const site = this.globe.perchSite(p.site, ch.dir);
    if (!site) { s.route = null; s.step = 'done'; return; }
    const R = CONFIG.globe.radius;
    // On the bearing they are already coming from, so nobody walks round a
    // stump to reach the far side of it for no reason.
    _tan.copy(ch.dir).addScaledVector(site.dir, -ch.dir.dot(site.dir));
    if (_tan.lengthSq() < 1e-9) {
      _tan.set(0, 1, 0).cross(site.dir);
      if (_tan.lengthSq() < 1e-9) _tan.set(1, 0, 0).cross(site.dir);
    }
    _tan.normalize();
    const arc = site.r + PASTIME_STANDOFF / R;
    const at = _spot.copy(site.dir).multiplyScalar(Math.cos(arc))
      .addScaledVector(_tan, Math.sin(arc)).normalize();
    // Pushed off everything ELSE standing about, but not off the thing they are
    // walking to — see keepOffSolids' exemption, which is what a destination
    // handed to somebody means.
    s.route = [keepOffSolids(at.clone(), CONFIG.wander.wallKeep, site.sprite)];
    s.legs = 1;
    s.giveUpAt = tMs + CONFIG.household.headingMax;
    // A new destination is a new walk, so how near they have ever been to it is
    // not yet known — see the progress test in the tick.
    s.nearest = undefined;
    ch.errand = null;
  }

  _pastimeExit(bot, s, tMs) {
    const ch = bot.ch;
    const p = s.pastime;
    // The last few notes go with the song rather than hanging in the air over
    // an empty stump.
    if (p && p.tune) this.globe.tuneOff();
    ch.hurrying = false;
    ch.errand = null;
    ch.walking = false;
    s.route = null;
    // DOWN OFF IT, and put somewhere they may legally stand. Standing up on the
    // spot would leave them at the prop's own middle, inside a berth their own
    // pathing refuses to enter — and a walker whose feet are somewhere illegal
    // can never plan a step, which is the total-failure shape this project has
    // been caught by twice. So the dismount ejects them the way the thaw does.
    if (ch.perched) {
      if (s.perch) {
        const R = CONFIG.globe.radius;
        _tan.copy(ch.dir).addScaledVector(s.perch.dir, -ch.dir.dot(s.perch.dir));
        if (_tan.lengthSq() < 1e-9) {
          _tan.set(0, 1, 0).cross(s.perch.dir);
          if (_tan.lengthSq() < 1e-9) _tan.set(1, 0, 0).cross(s.perch.dir);
        }
        _tan.normalize();
        const out = s.perch.r + (PASTIME_STANDOFF + 0.3) / R;
        _spot.copy(s.perch.dir).multiplyScalar(Math.cos(out))
          .addScaledVector(_tan, Math.sin(out)).normalize();
        // One movement, not two — see standUpAt, and the character left standing
        // half a unit above the grass that taught it.
        ch.standUpAt(keepOffSolids(_spot, CONFIG.wander.wallKeep));
      } else {
        ch.standUp();
      }
    }
    s.perch = null;
    s.pastime = null;
    // ...and not again for a while. Written on the way out rather than at the
    // start, so a hobby cut short by rain still costs its full wait — otherwise
    // a passing shower would be followed by the same song beginning again.
    s.pastimeAt = tMs + between(p ? p.gapMin : 300000, p ? p.gapMax : 540000);
  }

  // WHERE SOMEBODY RESUMES FROM when a mode lets go of them — the one answer,
  // for all three of the modes that can hand somebody back.
  //
  // Bedtime and the shelter each used to work this out for themselves, in
  // `_getUp` and `_comeOut`, with the same test and the same two outcomes
  // written twice. It belongs to whoever is TAKING OVER rather than to whoever
  // is finishing, because it is a question about ordinary life: am I indoors,
  // and if so I should walk out before I do anything else.
  //
  // Somebody who woke up — or dried off — indoors WALKS OUT, by the same route
  // and the same step every guest leaves by. Left in `away` they would potter
  // about the room until a random stroll happened to thread the door, which
  // reads as being shut in rather than as getting up.
  _visitEnter(bot, s, tMs) {
    const h = CONFIG.household;
    const ch = bot.ch;
    const pl = s.place;
    const inside = pl && ch.dir.dot(pl.dir) > Math.cos(pl.building.r);
    if (inside) {
      s.route = this._routeOut(pl);
      s.step = 'leaving';
      s.giveUpAt = tMs + h.headingMax;
      return;
    }
    s.step = 'away';
    s.route = null;
    s.due = tMs + between(h.gapMin, h.gapMax);
  }

  // Ordinary life letting go: the cushion goes back and the errand is dropped.
  //
  // This is the one that used to be copied into every other mode's opening —
  // bedtime released the seat, the shelter released the seat, the gathering
  // released the seat — because each of them had to undo a visit it had
  // interrupted. None of them do now.
  _visitExit(bot, s) {
    const ch = bot.ch;
    this._standThemUp(bot);
    ch.errand = null;
    ch.walking = false;
    s.route = null;
  }

  _visitTick(bot, s, tMs, world) {
    const h = CONFIG.household;
    const ch = bot.ch;
    const pl = s.place;

    if (s.step === 'away') {
      if (tMs < s.due) return;
        // Never while somebody else is in, nor mid-conversation, nor while you
        // are stood right there — walking off the moment you arrive is the one
        // version of this that reads as rude rather than as having somewhere
        // to be.
        //
        // `crowded` STOOD HERE and is gone with the freeze that made it
        // necessary. It refused to hand anybody an errand while you were within
        // `closeArc + 1.5`, and its own note explains why: at that range the
        // proximity freeze was permanent, so an errand issued there was one they
        // could never take a single step of and would hold until you wandered
        // off. That is a workaround for a hold that no longer exists — being
        // near somebody now buys a few seconds of being looked at and nothing
        // more (see wander.ackMin) — and keeping it would quietly preserve the
        // symptom it was written for: nobody ever setting off anywhere while you
        // were stood among them.
        //
        // What it costs to remove is that an errand can now be handed out
        // during those few seconds, so they pause, look at you, and then walk
        // off home. That is a better reading of the same moment than never
        // going at all, and it is the one people actually do.
        //
        // `attentive` stays, and is the honest half of what `crowded` was
        // approximating: somebody you came to see should not turn round and
        // leave. It has a clock on it now too, so it lets go by itself.
      if (this.homeCount() >= h.atOnce || ch.attentive || ch.holding('talk', tMs)) {
        s.due = tMs + 12000;
        return;
      }
      // NOR WHILE THEY ARE SAT DOWN, which is the one guard sitting had to add
      // here rather than anywhere else.
      //
      // Every route goes through `_walkRoute`, which stands somebody up before
      // it walks them — correct, and on its own it meant an errand handed out a
      // second after somebody sat on the grass yanked them straight back to
      // their feet. Measured: a sit that lasted 0.3 seconds, which is precisely
      // the flicker the whole timed-sit design exists to prevent.
      //
      // So an ordinary visit WAITS. Somebody sitting is already doing something,
      // and going home is never urgent — it is the one errand in this file with
      // no deadline behind it. Checked again when they get up, which is at most
      // `wander.sitMax` away.
      //
      // Bedtime and the shelter are deliberately NOT gated this way: those have
      // a reason to interrupt, and `_walkRoute` standing somebody up is exactly
      // what should happen when the rain starts.
      if (ch.perched) {
        s.due = tMs + 4000;
        return;
      }
      // Sit if a seat is free, stand at a spot if not — decided now, and the
      // seat held from now, so nobody crosses the planet for a cushion that
      // was taken while they walked.
      // Their own corner, not everybody's — see _standSpot. They sit down in it
      // when they get there.
      s.route = this._routeIn(pl, this._standSpot(bot, pl, _spot), ch.dir);
      s.step = 'going';
      s.giveUpAt = tMs + h.headingMax;
      return;
    }

    if (s.step === 'going') {
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
        this._standThemUp(bot);
        if (inside) {
          s.route = this._routeOut(pl);
          s.step = 'leaving';
          s.giveUpAt = tMs + h.headingMax;
        } else {
          ch.errand = null;
          s.route = null;
          s.step = 'away';
          s.due = tMs + between(h.gapMin, h.gapMax);
        }
        return;
      }
      if (!this._walkRoute(s, ch, tMs)) return;
      // Arrived. Down where they stopped, or at their own table if this room
      // holds one — see _takeSeat. Somebody home and sitting is the difference
      // between a room they own and a room they are standing in.
      this._takeSeat(bot, pl);
      s.step = 'home';
      s.potterAt = 0;
      s.until = tMs + between(h.stayMin, h.stayMax);
      return;
    }

    if (s.step === 'home') {
      // At home, and behaving like it — see _potter. This was a flat pin
      // ahead on every frame, which held them rigid for the whole visit.
      this._potter(bot, s, tMs, pl);
      // They stay as long as they meant to — unless you are in there with
      // them, in which case leaving the moment you arrived would be the
      // unfriendliest thing in the app.
      if (tMs < s.until || world.indoors) return;
      // ...and whatever drift was half walked is dropped for the way out.
      // `_routeOut` overwrites the route anyway; clearing the errand is what
      // stops the old waypoint riding along into the walk home.
      ch.errand = null;
      this._standThemUp(bot);
      s.route = this._routeOut(pl);
      s.step = 'leaving';
      s.giveUpAt = tMs + h.headingMax;
      return;
    }

    if (s.step === 'leaving') {
      if (tMs > s.giveUpAt) {
        // Wherever they are stood, the errand is over; the wander machinery
        // takes it from here. From indoors its own path-trimming still holds
        // every stroll clear of the walls, so the worst case is somebody
        // pottering about the room until a pick threads the door — which is
        // somebody being at home.
        ch.errand = null;
        s.route = null;
        s.step = 'away';
        s.place = this._ownPlace(bot);
        s.due = tMs + between(h.gapMin, h.gapMax);
        return;
      }
      if (!this._walkRoute(s, ch, tMs)) return;
      s.step = 'away';
      // HOME IS HOME AGAIN once they are out of the door.
      //
      // `place` can be pointing at somebody else's house — the shelter repoints
      // it to whichever door they ran to, and leaves it there when they are
      // still inside so that the walk out can be planned from it. This is the
      // end of that walk, and the one moment it is safe to put back. Without
      // it, Hachiware caught in Chiikawa's front room by a shower would have
      // treated Chiikawa's as his own for every visit after.
      s.place = this._ownPlace(bot);
      s.due = tMs + between(h.gapMin, h.gapMax);
      // A moment on the doorstep before setting off again.
      ch.hold('rest', tMs + 1400);
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
  _snowman(tMs, playing) {
    if (playing) {
      let here = 0;
      let busy = false;
      for (const st of this.state.values()) {
        if (st.mode === 'gather' && st.step === 'playing') { here++; this._gathered = true; }
        // Somebody who has finished is not busy however they wandered off to —
        // being back in the visit mode is also what somebody who has not
        // started looks like, and without `snowDone` to tell the two apart the
        // latch below could never close while anybody was between errands.
        if (!st.snowDone && st.mode === 'gather') busy = true;
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
  _windows(dtMs) {
    const h = CONFIG.household;
    const by = {};
    for (const place of this.places) {
      let here = false;
      let sleeping = false;
      for (const st of this.state.values()) {
        // A SHELTERER COUNTS EXACTLY AS A GUEST DOES, and this one line is the
        // other half of the houses lighting up when it rains. The weather
        // raises the hour's lamp value — see _applyBlend in scene.js — and this
        // says WHICH buildings have anybody in them to light. The two together
        // are why the empty house stays dark through a downpour while the one
        // Usagi barged into does not.
        //
        // Two modes asked rather than two spellings of one string, which is the
        // small readability win of the split: it used to read `home || inside`
        // and you had to know which machine each belonged to.
        const inHouse = (st.mode === 'visit' && st.step === 'home')
          || (st.mode === 'shelter' && st.step === 'settled');
        if (inHouse && st.place === place) here = true;
        if (st.mode === 'bed' && st.step === 'asleep' && st.own === place) sleeping = true;
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
