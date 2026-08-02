// WHAT THE WEATHER IS.
//
// The second thing about this world that changes on its own, and shaped like
// the first — see daylight.js. One place decides, everything downstream asks,
// and nobody reads a clock for themselves. That was already the lesson of the
// hour: two readers of the same fact means being told 「おはよう」 under a
// starfield, and weather has exactly the same failure available to it.
//
// The two are DELIBERATELY not one file, and the line between them is worth
// stating because it is what keeps either of them small. Daylight owns the sun:
// where it is, what colour it is, and therefore what everything on the planet
// is wearing. Weather owns what is IN THE AIR between the sun and the ground,
// and it says so only as a set of multipliers on the hour — never as a second
// palette. Rain at noon and rain at midnight are the same air over two
// different hours, and the arithmetic below is the same in both cases.
//
// That is why every field of a `grade` is either a multiplier resting at 1 or
// an addend resting at 0. Clear weather is not a case anybody handles; it is
// the identity, and the whole system switches itself off when the sky does.
//
// --------------------------------------------------------------- the schedule
//
// The weather is DEALT FROM THE DATE, once, and then simply read.
//
// Rolling dice per hour was the first idea and it is wrong twice over. It
// cannot be persisted — the day would rearrange itself behind a reload, which
// is the same objection that made the planet's own scatter seeded. And it
// cannot make FRONTS: real weather arrives, does something, and leaves, and a
// per-hour roll produces a day that flickers between conditions with no shape
// to it. What is dealt here is a small number of fronts per day, each a scripted
// run — cloud gathers, it rains, it eases off, it clears — laid down on the
// 24-hour axis and read back by whatever the clock currently says.
//
// So: same date, same weather, on every device and after every reload, with
// nothing written down. Setting the hour by hand moves to another point in the
// same day, then lets that day continue at its ordinary pace.

import { CONFIG } from './config.js';
import { nowHours, activePhase } from './daylight.js';
// One way only — sphere.js has no dependency but three.js, which is what makes
// it safe for this file to reach down into. See isWater at the foot of the file.
import { inLake } from './sphere.js';

// WHAT A FULL WASH MULTIPLIES THE WORLD BY. One colour for the whole system,
// with each weather choosing only how much of it to apply.
//
// A multiply and not a lerp, and that is the load-bearing choice in this file.
// A lerp toward a mid grey DIMS a noon and BRIGHTENS a midnight — the world
// would converge on the same overcast at every hour, which is precisely the
// "second palette" this file exists not to be. A multiply takes a fixed
// proportion away wherever it lands, so a storm at three in the afternoon and
// a storm at three in the morning are recognisably the same storm over two
// different hours.
//
// Cool and a little blue because that is what a sky with water in it does to
// the light under it. Not grey: a neutral grey wash leaves the world looking
// underexposed rather than rained on.
//
// Named for what it is rather than called `CAST`, because that word is already
// spoken for in this project and means the three characters.
export const WEATHER_CAST = '#5F6E85';

// A grade with nothing in it — the shape of the object, and the value clear
// weather actually has. Everything else in the table is written as a partial
// and folded onto this, so adding a field here gives every weather a sane
// value for it without touching a single row.
const CLEAR = {
  // The two real lights, separately, because overcast does not dim them
  // equally — it is the whole of what "overcast" means. The sun is a disc and
  // a cloud deck removes it almost entirely; the sky is a dome and a cloud deck
  // is still a dome. So `dir` collapses and `amb` barely moves, and that ratio
  // is what makes a grey day read as flat rather than as a dark one.
  amb: 1,
  dir: 1,
  // How far the world's own multiply is carried toward CAST.
  wash: 0,
  // ...and the same for the cloud deck's cover of the sky. Its own dial because
  // the sky is always further gone than the ground under it: you are looking at
  // the cloud, not through it.
  sky: 0,
  // Added to the hour's haze, which is how much of the far range is air rather
  // than range. Rain is the most air there ever is.
  haze: 0,
  // How much of the sun, the moon and the stars the cloud has taken. The deck
  // covers them physically as well; this is what stops a bright disc reading
  // through a half-transparent one.
  veil: 0,
  // ADDED TO THE HOUR'S LAMP VALUE, and this is how the houses light up.
  //
  // Not a new mechanism, and that is the point. `lamps` in daylight.js is
  // already "how dark is it, and therefore is a lit window worth drawing" — the
  // dusk curve — and the wired bulbs already follow it multiplied by whether
  // anybody is home. A darkened afternoon IS a dusk as far as that machinery is
  // concerned, so raising this number lights exactly the houses somebody has
  // run into and leaves the empty one dark. Nobody had to be taught to reach
  // for a switch, and the law that a dark lamp always has a hand behind it
  // survives untouched: a hand still wins, for as long as the day lets it.
  lamps: 0,
  // The squiggles of light on the water, which are sun and therefore go with it.
  glint: 1,
  // How far the cloud deck is lifted toward white before the hour is
  // multiplied into it. Rain leaves it alone; snow needs it, and needs it for a
  // reason that is easy to get backwards — a snowy sky is BRIGHTER than a rainy
  // one, not darker. All that white on the ground throws the light straight
  // back up at the cloud. Get this wrong and snow reads as rain that has gone
  // the wrong colour.
  deckLift: 0,
  // ------------------------------------------------------- what falls, and who runs
  // How hard it is coming down, 0 to 1. Read by falling.js and by nothing else.
  //
  // TWO FIELDS AND NOT ONE WITH A KIND BESIDE IT, which is worth a sentence
  // because a `kind: 'rain' | 'snow'` was the obvious shape and is wrong here.
  // Every number in this table is mixed with the one either side of it as a
  // front rolls in, and a kind cannot be mixed — it would have to snap at some
  // point in the ramp, taking the whole fall with it. Two densities that each
  // ramp on their own give sleet for free at the crossover, and give it as
  // arithmetic rather than as a case anybody wrote.
  drops: 0,
  flakes: 0,
  // How far the fall leans off vertical. Wind, as far as anything here knows.
  wind: 0,
  // Lightning strikes a minute. Storm's alone.
  bolts: 0,
  // HOW MUCH RAINBOW, 0 to 1, and `clearing` is the only row that has any.
  //
  // A field on the grade rather than a weather of its own, and that is the
  // ruling this whole feature was designed around: a rainbow is not something
  // the sky can BE, it is what the end of a shower looks like. Rolling it
  // would mean it could turn up on a dry morning, which is the one thing that
  // would take the meaning out of it — you get a rainbow because you sat out
  // the rain, or you do not get one.
  //
  // Gated on daylight downstream, in tickWeather, since the schedule knows
  // nothing about the hour. A rainbow needs a sun to come out of.
  bow: 0,
  // Whether this is weather anybody would go indoors for. A flag rather than a
  // threshold on `drops`, because it is a judgement about the weather and not a
  // measurement of it: drizzle is wetter than nothing and nobody runs from it.
  shelter: false,
};

function grade(over) { return { ...CLEAR, ...over }; }

// ---------------------------------------------------------------- the weathers
//
// The vocabulary. Everything the sky can be, whether or not the schedule below
// currently deals it.
//
// `rain` is the middle of the rain family and the one the rest are measured
// against. Drizzle is it with the volume down and nobody sheltering; storm is
// it with the volume up and lightning in it. Writing them as one family rather
// than as three unrelated rows is what keeps a change to how rain reads from
// having to be made three times.
//
// SNOW IS THE ASYMMETRY THIS WHOLE FILE IS BUILT AROUND, and it earns its place
// here by answering the question every weather has to answer before it is
// allowed on the schedule: what does everybody DO in it.
//
// Rain's answer is go inside. Snow's is the opposite — they come OUT, they
// gather, and they build something. That contrast is the feature; a snow that
// merely fell would be rain in a different colour with a change of clothes, and
// the clothes would be doing all the work.
//
// Three things fall out of it that are worth stating before the numbers, since
// each of them looks like a mistake if you come to it expecting rain:
//
//   IT IS BRIGHTER, not darker. A rain cloud is the darkest sky this world
//   has; a snow sky is one of the palest, because the ground under it is white
//   and throws the light back up. So the wash is gentle, the ambient barely
//   moves, and `deckLift` pulls the cloud toward white.
//
//   THE LAMPS BARELY COME UP. Rain lights the houses because it is dusk-dark
//   and everybody is indoors. Snow is neither.
//
//   WHAT IT LEAVES LASTS. `wet` drains over a wet afternoon; the cover snow
//   leaves takes far longer, and while it is there the cast are in coats and
//   the snowmen are still standing. Snow's aftermath is the longest-lived thing
//   in this world.
export const WEATHERS = {
  clear: grade({}),

  // The unglamorous one, and the one that makes a sunny day worth having. It is
  // also the state a front has to pass through in both directions, so the
  // schedule below reaches for it more often than anything else.
  cloudy: grade({
    amb: 0.96, dir: 0.58, wash: 0.20, sky: 0.30, haze: 0.06,
    veil: 0.80, lamps: 0.10, glint: 0.55,
  }),

  // Wet, and not wet enough to go in for. The gap between this and `rain` is
  // most of what stops rain being a switch: there is a state where the air has
  // water in it and life carries on, and arriving at the real thing through it
  // is what makes the real thing read as having arrived.
  drizzle: grade({
    amb: 0.88, dir: 0.30, wash: 0.34, sky: 0.48, haze: 0.15,
    veil: 0.95, lamps: 0.58, glint: 0.40,
    drops: 0.26, wind: 0.14,
  }),

  rain: grade({
    amb: 0.80, dir: 0.16, wash: 0.50, sky: 0.62, haze: 0.23,
    veil: 1, lamps: 0.80, glint: 0.30,
    drops: 0.70, wind: 0.24, shelter: true,
  }),

  // Rain with the lightning in it. NOT a separate weather in any way that
  // matters to the schedule — it only ever appears inside a rain front, at the
  // deepest part of it, which is what a storm is.
  storm: grade({
    amb: 0.68, dir: 0.07, wash: 0.68, sky: 0.78, haze: 0.33,
    veil: 1, lamps: 0.94, glint: 0.22,
    drops: 1, wind: 0.46, bolts: 4.5, shelter: true,
  }),

  // THE BREAK, and the one stage of the whole day that is a REWARD.
  //
  // Brighter than cloudy and still visibly wet — the light comes back before
  // the water does, which is the one thing everybody recognises about a shower
  // ending. `veil` is half rather than whole because that is the point: the sun
  // is showing through, and without a sun there is nothing for the arc below to
  // be made of.
  //
  // It is the longest single stage a front has, and now the reason is plain: it
  // has to be long enough to notice a rainbow, walk over to your friends, and
  // stand there looking at it. A shorter break would draw a lovely arc that
  // nobody ever got to.
  clearing: grade({
    amb: 0.94, dir: 0.72, wash: 0.15, sky: 0.20, haze: 0.13,
    veil: 0.50, lamps: 0.16, glint: 0.72,
    drops: 0.08, bow: 1,
  }),

  // SNOW. Note how little of this row is dark.
  //
  // `haze` is the highest number in the table and is the one value here doing
  // work nothing else can: falling snow is the thickest air this world ever
  // has, and a far range that has almost dissolved into a white sky is most of
  // what says "snow" from a distance, before a single flake is resolved.
  //
  // `wind` is LOW, and lower than drizzle's. Rain is driven and snow is not —
  // it comes down slowly and nearly straight, and the moment it leans it stops
  // reading as snow and starts reading as very slow rain. What movement it has
  // belongs in the drift, which falling.js gives each flake individually.
  // `amb` IS ABOVE 1, which is the only entry in this whole table that adds
  // light rather than taking it away, and it is not a fudge to make the picture
  // nicer. Snow is the most reflective surface this world has: a white ground
  // under a white sky throws the skylight back and forth between them, and the
  // ambient — which is precisely "light arriving from everywhere at once" — is
  // the term that describes it.
  //
  // It was 0.94 first, on the reasoning that overcast dims things, and the
  // ground came out a flat mid-grey. Snow lit like a rain cloud is not snow; it
  // is wet concrete. The directional stays down where it belongs, so what this
  // buys is a bright FLAT world, which is exactly what a snowy day looks like.
  snow: grade({
    amb: 1.16, dir: 0.26, wash: 0.15, sky: 0.66, deckLift: 0.46, haze: 0.40,
    veil: 1, lamps: 0.34, glint: 0.45,
    flakes: 0.72, wind: 0.10,
  }),

  // ...and snow's own downpour, which is the one snow that DOES send everybody
  // in. It is to snow what storm is to rain — the same weather with the volume
  // up — and it exists so that snow having a shelter case does not have to make
  // ordinary snow have one.
  //
  // Rare on purpose: it is reached only from the middle of a snow front, the
  // same way storm is reached only from the middle of a rain one.
  blizzard: grade({
    // Still above the ordinary hour for the reason snow is — the ground is
    // white and throwing light back — and well under snow's, because a blizzard
    // has enough in the air to take a good deal of it out again on the way.
    amb: 0.98, dir: 0.08, wash: 0.36, sky: 0.90, deckLift: 0.28, haze: 0.62,
    veil: 1, lamps: 0.86, glint: 0.28,
    flakes: 1, wind: 0.62, shelter: true,
  }),
};

export const WEATHER_LABEL = {
  auto: 'じどう',
  clear: 'はれ',
  cloudy: 'くもり',
  drizzle: 'こさめ',
  rain: 'あめ',
  storm: 'かみなり',
  clearing: 'あめあがり',
  snow: 'ゆき',
  blizzard: 'ふぶき',
};

// --------------------------------------------------------------- dealing a day
//
// mulberry32, the same generator the planet's own scatter uses, seeded off the
// calendar date rather than off a constant. Same day, same weather.
function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

// WHETHER TODAY IS A COLD ONE, which is the only thing that decides whether a
// front comes down as rain or as snow.
//
// A temperature and not a season, and the difference matters in both
// directions. A hard seasonal gate — snow in December, never otherwise — would
// be honest and would also mean that for three quarters of the year the snow
// half of this feature simply does not exist, including on the day somebody
// first opens the app. A roll weighted by month gives winter its character
// without ever quite closing the door: a cold snap in October is unusual, one
// in July is a small miracle, and neither is impossible.
//
// It is rolled from the same stream as everything else about the day, so it is
// as fixed as the rest of it — today is cold or it is not, on every device.
function coldChance(month) {
  return CONFIG.weather.coldByMonth[month] ?? 0.03;
}

// One front: cloud gathers, something falls for a while, it eases, it clears.
// Handed the hour it begins at, it appends its keyframes and answers the hour
// it is finished by.
//
// The SHAPE is fixed and only the durations and the depth are rolled, which is
// the difference between weather and noise. Every front in this world arrives
// the same way and leaves the same way; what differs is how long it stayed, how
// hard it got, and — the one branch below — whether it was cold enough to come
// down as snow. That is also what makes the sheltering read: the cast have a
// `cloudy` and a `drizzle` of warning before the thing they run from.
//
// SNOW REUSES THE SHAPE and changes only what falls out of it, which is right
// rather than lazy: a snow front is a front. What differs is on either side of
// the middle — it is longer, because snow that lasts twenty minutes leaves
// nothing behind and the whole point of it is what it leaves; and the deep
// middle is a blizzard rather than a storm.
function pushFront(keys, at, rnd, cold) {
  const w = CONFIG.weather;
  let h = at;
  const put = (key, hours) => { keys.push({ at: h, key }); h += hours; };

  put('cloudy', w.gatherMin + rnd() * (w.gatherMax - w.gatherMin));

  if (cold) {
    const deep = w.snowMin + rnd() * (w.snowMax - w.snowMin);
    if (rnd() < w.blizzardChance) {
      put('snow', deep * 0.36);
      put('blizzard', deep * 0.28);
      put('snow', deep * 0.36);
    } else {
      put('snow', deep);
    }
    // NO `clearing` AT THE END OF A SNOW FRONT, and that is not an omission.
    // `clearing` is the wet break — the light coming back before the water
    // goes, which is what a shower ending looks like and where the rainbow will
    // hang. Snow does not end like that. It thins, it stops, and what is left
    // is a white world under an ordinary sky, which is the state the cover
    // itself is already describing. Borrowing rain's exit would have put a
    // rainbow over a snowfield.
    put('cloudy', w.clearingMin + rnd() * (w.clearingMax - w.clearingMin));
    keys.push({ at: h, key: 'clear' });
    return h;
  }

  put('drizzle', 0.3 + rnd() * 0.4);

  const wet = w.wetMin + rnd() * (w.wetMax - w.wetMin);
  // A storm is a deep front rather than a different one: the middle of the wet
  // stretch turns over, and the rain closes back over it on the way out.
  if (rnd() < w.stormChance) {
    put('rain', wet * 0.34);
    put('storm', wet * 0.32);
    put('rain', wet * 0.34);
  } else {
    put('rain', wet);
  }

  put('drizzle', 0.3 + rnd() * 0.4);
  put('clearing', w.clearingMin + rnd() * (w.clearingMax - w.clearingMin));
  keys.push({ at: h, key: 'clear' });
  return h;
}

// A whole day of it, in order, starting and ending on clear sky.
//
// BOTH ENDS ARE CLEAR ON PURPOSE. The schedule wraps at midnight into
// tomorrow's fresh deal, and the only way that seam is invisible is if both
// sides of it are the same weather. A front left running across it would cut
// off mid-downpour and resume somewhere else in the sequence — the one place
// in the system where the sky could change identity in a single frame.
function dealDay(seed, month) {
  const w = CONFIG.weather;
  const rnd = mulberry32(seed);
  const keys = [{ at: 0, key: 'clear' }];

  // Cold FIRST, before the fronts are counted, and drawn from the same stream.
  // Which order these two rolls happen in is not arbitrary once anything is
  // ever tuned: moving this line would re-deal every day in the calendar,
  // because the second value out of a seeded stream depends on the first having
  // been taken.
  const cold = rnd() < coldChance(month);

  // How many showers today: often none. Rain has to be an event, and a planet
  // that rains every day is a planet where nothing about rain is worth
  // noticing — the same argument the household's own visits are rare for.
  const roll = rnd();
  let fronts = 0;
  for (const p of w.frontOdds) {
    if (roll < p.upTo) { fronts = p.n; break; }
  }

  // Spread across the waking day, and never so late that a front is still
  // running when the cast go to bed. Rain at midnight is a real thing and it is
  // a QUIET one — see the note on `shelter` below — so a front that overhangs
  // bedtime is not wrong, only wasted.
  let at = w.firstFrontAt + rnd() * 2;
  for (let i = 0; i < fronts; i++) {
    if (at > w.lastFrontBy) break;
    at = pushFront(keys, at, rnd, cold) + w.dryGapMin + rnd() * w.dryGapMax;
  }

  // A plain overcast stretch on some of the dry days, so that "not raining" is
  // not always "bright". Placed after the fronts and only where there is clear
  // room for it.
  if (fronts === 0 && rnd() < w.overcastChance) {
    const from = 7 + rnd() * 8;
    keys.push({ at: from, key: 'cloudy' });
    keys.push({ at: from + 2 + rnd() * 3, key: 'clear' });
  }

  keys.sort((a, b) => a.at - b.at);
  return keys;
}

// Today's, kept until the date turns under us — which it does on a tab left
// open overnight, and which is the only reason this is not simply a constant.
let dealt = { seed: 0, keys: null };

function schedule() {
  const now = new Date();
  const seed = seedFor(now);
  if (dealt.seed !== seed) dealt = { seed, keys: dealDay(seed, now.getMonth() + 1) };
  return dealt.keys;
}

// ------------------------------------------------------------- reading it back
//
// What the sky is at a given hour, as the pair of weathers either side of the
// moment and how far between them we are.
//
// The ramp is measured in HOURS OF THE WORLD rather than in seconds, and that
// is what lets one number serve two clocks. A front rolling in over a third of
// the configured fraction of an hour whichever clock supplied the reading, so
// dragging the time control shows you a front arriving rather than a front
// snapping on.
function readAt(hours) {
  const keys = schedule();
  let i = keys.length - 1;
  while (i > 0 && keys[i].at > hours) i--;
  const from = i > 0 ? keys[i - 1].key : keys[keys.length - 1].key;
  const to = keys[i].key;
  const u = Math.min(1, (hours - keys[i].at) / CONFIG.weather.rampHours);
  return { from, to, t: u * u * (3 - 2 * u) };
}

// Two grades, mixed. Written into a held object rather than returning a fresh
// one, because this runs every frame and the readers all copy out of it anyway.
//
// TWO of them: `_want` is where the sky is heading and `_live` is where it has
// got to. They are the same thing on the schedule, which ramps its own way
// there — see the ease in tickWeather, which exists for the hand-picked case
// where there is no ramp at all.
const _live = grade({});
const _want = grade({});
const KEYS = Object.keys(CLEAR).filter((k) => typeof CLEAR[k] === 'number');

function mixInto(out, a, b, t) {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  // The one field that is not a number and so cannot be averaged. Half a
  // shelter is not a state anybody can be in, so it flips with the majority —
  // and the hysteresis below is what stops that flip happening twice.
  out.shelter = t < 0.5 ? a.shelter : b.shelter;
  return out;
}

// --------------------------------------------------------------------- the hand
//
// A weather set by hand, exactly as an hour can be. A chosen weather simply
// STAYS, because unlike the hour it is not something the world is expected to
// move on from — you picked rain to look at rain.
let hand = null;

export function setWeatherOverride(key) {
  hand = WEATHERS[key] ? key : null;
  return hand;
}

export function isAutoWeather() { return hand === null; }

// ------------------------------------------------------------------ the memory
//
// Two things the sky itself does not know, both of them about how long
// something has been going on.

// HOW WET THE GROUND IS, which is not how hard it is raining.
//
// This is the whole reason this file has state at all and it earns it: puddles
// have to OUTLIVE the rain. Weather that leaves no trace behind it reads as a
// screensaver — the sky changes, you look up, and then the world is exactly as
// it was. Water standing in the grass for a while afterwards is what makes the
// shower a thing that happened rather than a thing that was displayed.
//
// Two time constants, and they are deliberately far apart: it fills at the pace
// of the rain and drains at the pace of a wet afternoon.
let wet = 0;

// ...and HOW WHITE THE GROUND IS, which is the same idea with the dials turned
// a very long way.
//
// It is a separate number from `wet` and not a second reading of it, because
// the two behave nothing alike. Water finds the hollows and goes; snow covers
// everything and STAYS. This is the longest-lived value in the app by a wide
// margin — it fills over a snowfall and takes the better part of an hour to go,
// and while it is above zero the ground is white, the cast are in coats and the
// snowmen are still standing.
//
// That length is the feature and not a tuning accident. Rain is an afternoon;
// snow is a day you remember. If this drained at anything like the puddles'
// pace, the coats would be on and off inside a minute and the whole wardrobe
// would read as a flicker rather than as winter.
let settled = 0;

// HOW FROZEN THE PONDS ARE, 0 to 1, and whether that is enough to stand on.
//
// Two values for one fact, and they are not the same question:
//
//   `ice`      what the water LOOKS like, eased, so a pond goes over while you
//              watch instead of turning to ice between two frames.
//   `iceHolds` whether it will carry somebody, which is a yes or a no. There is
//              no half-walking on a pond.
//
// The latch underneath them is hysteresis on the cover — freeze late, thaw
// early — so `ice` is driven toward a target that cannot chatter, and the
// walkable answer comes off `ice` well after it commits. That ordering is the
// point: the surface visibly goes over BEFORE it will bear weight, and visibly
// softens before it stops. Water that can be stood on while it still looks like
// water is the one reading this must never give.
let ice = 0;
let iceLatch = false;

// Whether the cast are currently running for cover, with hysteresis.
//
// Not simply `grade.shelter`, and the reason is the boundary. A front crosses
// into rain over a ramp, and a walk home takes the better part of a minute from
// the far side of the planet — so a flag that flickers even once around the
// crossing sends somebody out of their own front door and back in again. It
// latches on the way in and needs a genuinely dry sky to let go.
let sheltering = false;

// When the next bolt is due, in ms on the frame clock. Null while there is
// nothing to strike.
let boltAt = null;
let struck = false;

export function tickWeather(dtMs, tMs) {
  const w = CONFIG.weather;

  // WHERE THE SKY IS HEADING, from whichever clock is keeping it.
  if (hand) {
    mixInto(_want, WEATHERS[hand], WEATHERS[hand], 1);
  } else {
    const r = readAt(nowHours());
    mixInto(_want, WEATHERS[r.from], WEATHERS[r.to], r.t);
  }

  // ...AND THE SKY ARRIVING THERE, which is a separate step and is here for the
  // control rather than for the schedule.
  //
  // A front already arrives gently: `readAt` ramps between its keyframes over
  // rampHours, so on the schedule this ease has almost nothing to do. A weather
  // chosen BY HAND has no ramp at all — it is a value swapped for another
  // between one frame and the next — and without this the sky would cut. The
  // hour's own control does not do that, and neither should this one: every
  // change of sky in this world is something you watch happen.
  //
  // Short, because it is smoothing a step rather than pacing a front. Against
  // the schedule's twenty-odd minutes of ramp it is invisible; against a button
  // press it is the whole difference between a cut and a change.
  const k = 1 - Math.exp(-dtMs / w.easeMs);
  for (const key of KEYS) _live[key] += (_want[key] - _live[key]) * k;
  // Not a number and so not eased — half a shelter is not a state anybody can
  // be in. It takes the target directly, and the hysteresis below is what stops
  // that flipping twice.
  _live.shelter = _want.shelter;

  // --------------------------------------------------------------- aftermath
  //
  // WHAT THE SKY LEAVES BEHIND. Manual time is an offset clock, not a time-lapse,
  // so scheduled and hand-picked weather share the same elapsed milliseconds.
  // Puddles, snow, thaw and ice therefore keep their authored visible pace no
  // matter where the player moved the clock.
  const flow = dtMs;

  // The ground filling and draining. `drops` is the tap; nothing else feeds it,
  // so a sky that clears leaves the water exactly where it was and lets it go
  // on its own schedule.
  const target = Math.min(1, _live.drops * w.soak);
  const tau = target > wet ? w.wetMs : w.dryMs;
  wet += (target - wet) * (1 - Math.exp(-flow / tau));

  // ...and the white, which is NOT the same shape and was written as though it
  // were. `flakes` is its tap and rain is not: falling on already-wet ground
  // does not lay snow, and a shower after a snowfall does not wash it away
  // either. The two aftermaths are independent and can both be on the ground at
  // once, which is exactly what a thaw looks like.
  //
  // HOW HARD IT SNOWS SETS THE RATE, NOT THE CEILING, and getting that backwards
  // was a real bug rather than a slow number.
  //
  // It used to ease toward `flakes * lay` — so ordinary snow, whose flakes are
  // 0.72, crept toward 72% cover and stopped there. Measured: eight minutes of
  // steady snowfall reached 0.715 and stayed. The world never went white at
  // all; it went a permanent greenish half-white, and only a blizzard could
  // ever cover the ground properly. That is not what snow does. Light snow
  // covers everything too — it just takes longer to get there.
  //
  // So the target is the full depth and the RATE carries the weight of the
  // fall: `layMs` is the time constant at full flakes, and a gentler fall
  // simply divides into it. Same one line, and now a flurry left running does
  // what a flurry left running does.
  if (_live.flakes > 0.02) {
    settled += (w.lay - settled) * (1 - Math.exp(-(flow * _live.flakes) / w.layMs));
  } else {
    settled += (0 - settled) * (1 - Math.exp(-flow / w.meltMs));
  }

  sheltering = sheltering ? (_live.drops > w.stayIn || _live.shelter) : _live.shelter;

  // The ponds going over, and coming back. Driven by the COVER rather than by
  // the sky, so the ice inherits the melt's own long clock and is the last
  // thing left of a winter — see freezeAt in CONFIG.weather.
  iceLatch = iceLatch ? settled > w.thawAt : settled > w.freezeAt;
  ice += ((iceLatch ? 1 : 0) - ice) * (1 - Math.exp(-flow / w.freezeMs));

  // A RAINBOW NEEDS A SUN, and the schedule has never heard of the hour. So the
  // gate goes on here, where both facts are to hand.
  //
  // The three daylight hours and not `lamps` or any other proxy, because this
  // is a question about whether there is a sun in the sky rather than about how
  // bright it is: evening is dim and has one — and an evening rainbow, low and
  // enormous with the arc running through a sunset, is the best one there is.
  // Night and midnight have a moon, and a moonbow is not a thing this world is
  // going to claim to draw.
  //
  // Multiplied into the grade rather than answered separately, so that
  // everything downstream — the arc, the gathering, the console handle — reads
  // one number and cannot disagree about whether there is a rainbow.
  const p = activePhase();
  const sunUp = p === 'morning' || p === 'noon' || p === 'evening';
  _live.bow *= sunUp ? 1 : 0;

  // Lightning. Poisson enough for the purpose: a strike is due after a wait
  // drawn around the mean rate, and a sky with no bolts in it simply never
  // arms one.
  struck = false;
  if (_live.bolts > 0) {
    if (boltAt === null) boltAt = tMs + (0.3 + Math.random()) * (60000 / _live.bolts);
    else if (tMs >= boltAt) {
      struck = true;
      boltAt = tMs + (0.3 + Math.random() * 1.4) * (60000 / _live.bolts);
    }
  } else {
    boltAt = null;
  }

  return _live;
}

// What the sky is doing, as the grade every reader works from.
export function weatherGrade() { return _live; }

// ...and its name, for the pill and for anything that wants to ask about the
// weather in words. Mid-ramp this is whichever side is winning, by the same
// rule `shelter` mixes on: a sky cannot be half named.
export function activeWeather() {
  if (hand) return hand;
  const r = readAt(nowHours());
  return r.t < 0.5 ? r.from : r.to;
}

// How much standing water there is, 0 to 1. Puddles are drawn from it and
// nothing else is; it is the one output of this file that lags the sky.
export function wetness() { return wet; }

// ...and how white the ground is, 0 to 1. Read by rather more: the ground
// itself, the coats, the snowmen, and the household's decision that there is
// enough of it to go out and play in.
export function snowCover() { return settled; }

// ...and putting it where you want it, for the console handle and nothing else.
//
// It exists because of the two time constants above: snow lays over a minute
// and a half and melts over twenty, which is exactly the pace to live in and a
// hopeless one to work on. Everything downstream of the cover — the coats, the
// white ground, the gathering, the snowmen and their slump — would otherwise
// each cost a winter to look at once.
//
// It sets the GROUND and says nothing about the sky, which is the useful shape:
// `lay(1)` under a clear sky is the morning after a fall, and that state is
// reachable no other way without waiting.
export function setSnowCover(v) {
  settled = Math.min(1, Math.max(0, v));
  return settled;
}

// Whether there is enough of it lying to be worth going out for.
//
// A THRESHOLD ON THE COVER AND NOT ON THE SKY, which is the whole of how snow's
// aftermath differs from rain's. Rain sends everybody in while it is falling
// and lets them out when it stops — the sky is the whole story. Snow is the
// other way round: what you go out for is not the falling, it is the LYING, and
// that arrives late and stays long. So the cast are still out in it well after
// the last flake, which is the correct answer and also the only one that leaves
// time to build anything.
//
// Never during a blizzard, and that exception is the reason `blizzard` exists
// as its own row: without it, snow would need a shelter case of its own and the
// asymmetry that makes this feature worth having would be muddied.
export function snowPlayable() {
  return settled > CONFIG.weather.playAt && !sheltering;
}

// Whether there is a rainbow up worth walking over to look at.
//
// The threshold is well under half, so they set off while it is still arriving
// and are standing there for the best of it — the walk takes the better part of
// a minute and a gathering that began at full strength would arrive as it
// faded. See bowSeenAt.
//
// It reads the same `bow` the sky is drawn from, so the cast can never be
// looking up at a rainbow that is not there, nor ignoring one that is.
export function rainbowOut() {
  return _live.bow > CONFIG.weather.bowSeenAt;
}

// ...and how much of one, for the console handle. The SKY's own easing lives in
// scene.js — see _aimBow — because it is about how a fade looks rather than
// about what the weather is doing.
export function rainbow() { return _live.bow; }

// How frozen the ponds LOOK, 0 to 1. Read by the water's own colours and by
// nothing else.
export function iceLook() { return ice; }

// ...and whether they will carry somebody, which is the question everything
// that walks asks.
//
// THE ONE RULE FOR EVERY READER. `inLake` itself never changes — a pond is a
// pond whether or not it is frozen, and everything that PLACES a permanent
// thing must go on avoiding it, because a stump does not grow on a pond in July
// on the strength of it having been cold in January. What this gates is the
// live question a BODY asks: may I stand here, now. See the readers in
// character.js, camera-control.js and main.js, which are the whole list.
export function pondsFrozen() {
  return ice > CONFIG.weather.bearsAt;
}

// ...and the question every one of those readers was actually asking: IS THIS
// SPOT WATER RIGHT NOW — which a frozen pond is not.
//
// It existed three times before it existed once: `isWet` in camera-control.js,
// `_inWater` in character.js, and an open-coded loop over CONFIG.lakes beside
// the body-tow in main.js. All three were the same four lines — the freeze gate,
// then a scan of the lakes — and all three agreed, by discipline rather than by
// structure. That is exactly the arrangement the file header above warns about
// for the hour: a rule kept in step by hand is one that comes apart the first
// time somebody edits two of its copies and not the third.
//
// It lives HERE rather than in sphere.js on purpose. `inLake` is a geometric
// fact and sphere.js is deliberately the layer with no dependency but three.js;
// whether that geometry may be STOOD ON is a live question about the weather, so
// it belongs on this side of the line. The edge runs one way — weather imports
// sphere, never the reverse — so there is no cycle to arrange around.
export function isWater(dir, margin = 0) {
  if (pondsFrozen()) return false;
  for (const lake of CONFIG.lakes) if (inLake(dir, lake, margin)) return true;
  return false;
}

// Whether anybody sensible would be indoors. See the hysteresis above.
export function isSheltering() { return sheltering; }

// Whether lightning struck on THIS frame. True for exactly one frame, which is
// what a flash is.
export function lightningStruck() { return struck; }

// For the console handle: today's deal, in a form that can be read at a glance.
export function forecast() {
  return schedule().map((k) => `${String(Math.floor(k.at)).padStart(2, '0')}:${
    String(Math.round((k.at % 1) * 60)).padStart(2, '0')} ${k.key}`);
}
