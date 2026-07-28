// What time of day it looks like. Driven by the visitor's actual clock, so
// dropping in after dinner is a different place from dropping in at lunch —
// or, once an hour has been set by hand, by a clock of the same shape turning
// faster. See the bottom of the file.
//
// `tint` is the multiply colour for the unlit sprites. Without it the planet
// would go dark at night while the characters stayed lit like cutouts pasted
// over a photograph.

import { CONFIG } from './config.js';

// The night sky is #002944 at skyTop — the expanse you are actually looking at
// — with the two stops below it lifting toward the horizon so that a flat
// colour does not read as a painted wall.
//
// Day was #E3F6FF at skyTop for a while and has been put back. Pinned to the
// top of the gradient it washed the whole sky out: #E3F6FF is already so pale
// that there is nowhere lighter left for the horizon to go, so the depth the
// gradient is there to give collapsed and the sky read as white. It is very
// nearly noon's skyLow anyway (#EAF6FB), which is where a colour that pale
// belongs — the band just above the hill, not the whole dome.
//
// `discAt` is where the sun or moon hangs, in sky-design pixels, and its second
// number is now simply how high in *your* sky — the same everywhere on the
// planet, since the sky is hung off wherever you are stood. Worth knowing what
// the scale is before nudging it. Design height is 512 over a half turn, so a
// pixel is about a third of a degree and 256 is level with your eye. Two things
// to keep it between: the ground cuts everything below about **354**, because on
// a planet this small the horizon sits 34.4° below level, and the resting view
// tops out at about **222**, because the gaze rests 17.2° down through a 62°
// lens. Anything smaller than that is only visible if you swipe up.
//
// `lamps` is whether anybody indoors has the lights on: 0 by day, 1 at night,
// and interpolated between like everything else here. It is not simply the
// opposite of daylight — the lit sheet is a whole second drawing of the house
// rather than a tint, and a house half lit through the entire evening would
// read as a double exposure. So scene.js shapes this value before using it and
// brings the lamps up over the dark end of dusk only; this stays a plain
// per-phase number so the scrubber gets it for free.
//
// `swatch` is the one colour that stands for the hour, used by the scrubber to
// paint the day as a strip. It is not simply skyTop, and deliberately: the sky's
// own colours are chosen to sit behind a whole screen, and in a band fourteen
// pixels tall the palest of them are indistinguishable from one another —
// morning and noon would be two greys. These are the same hues carried far
// enough to tell apart at a glance. Evening's is exactly its skyMid, which is
// already the sunset; the others are a step in from the pale end.
//
// `tintIn` is the multiply colour for everything standing INSIDE the house —
// the wall you see from the rug, the furniture, whoever is home. It lives in
// this table rather than one of its own so the scrubber interpolates it for
// free, but it is NOT the outdoor tint with the lights turned down, and the
// difference carries the whole fiction: night in there is WARM. Outside, night
// is the tint that turns the grass the colour of moonlight; inside, the lamps
// are on — that is what the lit windows have been saying from across the
// planet all along, and walking in to find the same cold blue would contradict
// the glow that drew you to the door.
//
// `haze` is how much of the far range is AIR rather than range — 0 leaves the
// hills their own colour, 1 dissolves them into the sky at their feet. Only the
// horizon band reads it, and nothing else should: it is the one thing in the
// world drawn as being miles off rather than paces, and it is the distance and
// not the hour that does this. Aerial perspective, which is a painter's term
// for the plain observation that you are looking at the sky in front of the
// hill as well as at the hill.
//
// The numbers follow how much there is IN the air at each hour rather than how
// bright it is. Noon is the clearest sight you get. Morning has mist in the low
// ground. Evening is heaviest of the daylight hours and is the one where the
// effect is most worth having, because the sky at the hills' feet is orange and
// hazing toward it is exactly what turns a grey range pink at sunset — for
// free, with no second palette. Night is nearly total: a range at night is a
// shape you can only just tell from the sky, and anything crisper reads as a
// cut-out.
//
// `mirror` is the same idea arriving from the opposite direction, for the ponds.
// A hill is partly air because there is air IN FRONT of it; water is partly sky
// because the sky BOUNCES OFF it, and the arithmetic does not care which. Left
// on the plain tint the pond stayed a cool teal under a fully orange sunset,
// with warm grass all round it — not wrong so much as somewhere else, a piece of
// the afternoon left in the picture.
//
// LOWER than `haze` by day, which is the opposite of the first guess and worth
// knowing why. A pond is a far better mirror than thirty miles of air is a veil,
// so the generous numbers looked obviously right — and made the evening pond a
// flat pale putty. The water's own colour is a saturated blue-green and the
// evening sky is a warm tan, near enough opposite each other, so a lerp between
// them travels through GREY. Past about a third of the way the pond has the
// sky's hue, none of its own, and reads as wet sand.
//
// What actually turns water orange at sunset is its HIGHLIGHTS, and those are
// handled by `glint` below, which can go the whole way because it is additive.
// The body only has to lean.
//
// Night is the exception and takes more than the haze does, because there the
// sky at the horizon is a deep blue — a neighbour of the water's own hue rather
// than its opposite — so the lerp darkens the pond without draining it. Noon is
// the low point: pale sky into pale water adds nothing and costs colour.
//
// `glint` is how bright the squiggles of light on the water are. A number here
// rather than a tint on the material because the glint layer is ADDITIVE, and
// tinting additive light toward night's blue would not dim a highlight — it
// would tip it blue and leave it exactly as bright. Additive light is dimmed by
// turning it down. Its COLOUR is not in this table at all: a highlight is a piece
// of sky lying on the water, so waterHour paints it `skyLow` directly.
//
// Night keeps a good deal of it on purpose: sparks on dark water under a moon is
// the one thing the hour is for.
export const LOOK = {
  morning: {
    skyTop: '#9FD6EE', skyMid: '#CDE9F7', skyLow: '#FDF1DE',
    disc: '#FFE9A8', discAt: [300, 168], discR: 19, glow: 0.34, stars: false,
    swatch: '#FFE3B8',
    cloud: '#FFFDF6', cloudAlpha: 0.92,
    ambient: ['#FFF3E6', 1.42], dir: ['#FFDCAE', 1.05],
    tint: '#FFF2E2', tintIn: '#FFF4E8', lamps: 0, haze: 0.38,
    mirror: 0.30, glint: 0.50,
  },
  noon: {
    skyTop: '#8FD0EE', skyMid: '#BFE4F5', skyLow: '#EAF6FB',
    disc: '#F7E7A8', discAt: [300, 150], discR: 19, glow: 0.35, stars: false,
    swatch: '#BFE4F5',
    cloud: '#FFFFFF', cloudAlpha: 0.92,
    ambient: ['#FFFFFF', 1.55], dir: ['#FFF6E0', 1.15],
    tint: '#FFFFFF', tintIn: '#FFFFFF', lamps: 0, haze: 0.24,
    mirror: 0.18, glint: 0.55,
  },
  evening: {
    skyTop: '#7FA8D8', skyMid: '#F2B48C', skyLow: '#FBD9B0',
    disc: '#FFC178', discAt: [300, 232], discR: 24, glow: 0.42, stars: false,
    swatch: '#F2B48C',
    cloud: '#FFE3CB', cloudAlpha: 0.85,
    ambient: ['#FFE2CD', 1.22], dir: ['#FF9E6B', 0.95],
    tint: '#FFD9BD', tintIn: '#FFE6D2', lamps: 0, haze: 0.50,
    mirror: 0.34, glint: 0.46,
  },
  // `stars` is a flag, not a count. It used to read 9000, which looked like a
  // number and was not one — nothing multiplies by it, `_setStarAlpha` only
  // asks whether it is truthy, and the field scene.js actually builds is 19,240
  // stars across three tiers. A figure that agrees with nothing is worse than
  // no figure, so it says what it means.
  //
  // Clouds go nearly out at night: they read as grey smears over a sky this
  // dark, and the reference night has none.
  //
  // The moon hangs at 238 rather than up at 140 because it is the thing you are
  // meant to look at, and at 140 it sat 41° up — above the top edge of the
  // resting view, so you only found it by swiping. 238 is 6.4° above your eye,
  // which lands it about a fifth of the way down the screen with its whole glow
  // in frame, and still 40.8° clear of the horizon so it reads as sky rather
  // than as something resting on the hill. (Both were written down as 3° and
  // 37°; the arithmetic above gives 6.3° for texel 238 and the rendered card
  // measures 6.33° from all 24 spots, its drawn centre sitting 0.04° off the
  // card's own.) The sun is left high at morning and noon, where being overhead
  // is the whole point; evening's is already down at 8.4°.
  night: {
    skyTop: '#002944', skyMid: '#01426B', skyLow: '#0A6E9C',
    disc: '#F4F1DC', discAt: [300, 238], discR: 15, glow: 0.22, stars: true,
    swatch: '#012F4E',
    cloud: '#0A3352', cloudAlpha: 0.30,
    ambient: ['#9FB2DE', 0.88], dir: ['#C3D0F5', 0.38],
    tint: '#A2B3D8', tintIn: '#EFDBBE', lamps: 1, haze: 0.76,
    mirror: 0.58, glint: 0.40,
  },
};

export function phaseAt(hours) {
  if (hours < 5) return 'night';
  if (hours < 11) return 'morning';
  if (hours < 16) return 'noon';
  if (hours < 20) return 'evening';
  return 'night';
}

export function clockPhase() {
  return phaseAt(new Date().getHours());
}

// `isSleeping` was here and said night. Nobody sleeps now — night is when the
// cast is out under the stars, still wandering, with a bank of lines about what
// is overhead — so there is no hour that puts them under.

// --------------------------------------------------------------- which phase
//
// The one place that decides what time it is. Everything asks here: the sky,
// the lights, and which time-of-day lines the cast reaches for. That last one used to read `new Date()` for itself down in
// dialogue.js, which was fine while the clock was the only opinion going — but
// the moment you can choose the hour by hand, two readers means forcing night
// and still being told 「おはよう」 under a starfield.

// The day in order, which is also the axis the scrubber runs along: a position
// of 1.5 means halfway between noon and evening. Exported because the scrubber
// needs to turn a finger into a phase and back, and both ends have to agree
// about what comes after what.
export const PHASES = ['morning', 'noon', 'evening', 'night'];
const ORDER = PHASES;

export const PHASE_LABEL = {
  auto: 'じどう',
  morning: 'あさ',
  noon: 'ひる',
  evening: 'ゆうがた',
  night: 'よる',
};

// Where each phase begins, in hours, matching the boundaries phaseAt draws.
// Setting an hour by hand puts you at the START of it rather than part way in,
// so choosing よる buys the whole of the night before it turns rather than
// however much of it happened to be left.
const PHASE_START = { morning: 5, noon: 11, evening: 16, night: 20 };

// null means follow the real clock, and that is where every visit begins. It
// used to be restored from localStorage, on the reasoning that picking a time
// you like should not be a chore you repeat. But the hour is this place's
// weather rather than a setting: arriving is meant to be arriving *now*, and a
// night forced once made every later visit night too, including the ones opened
// at lunchtime — a dark planet under a starfield, with nothing on screen to
// connect any of it to a choice made days ago.
//
// Anything else is a clock wound by hand: the hour it was set to, and the real
// moment it was set at. Note what is NOT here — the phase you picked. Holding a
// reading and a timestamp instead is what lets a chosen hour go on running
// rather than stopping dead where you put it, and it costs nothing to keep: the
// hour is worked out fresh whenever somebody asks, so there is no tick to drive
// and a tab left in the background for an hour comes back to the right side of
// the planet rather than to wherever a paused timer had got to.
let hand = null;

// The hand-wound hour, wrapped back into a day.
function handHours() {
  const turned = ((performance.now() - hand.since) / CONFIG.daylight.fastDayMs) * 24;
  return (hand.hour + turned) % 24;
}

export function activePhase() {
  return hand ? phaseAt(handHours()) : clockPhase();
}

// Whether the REAL clock is the one deciding — which is what the pill's dot
// means, and still exactly what it meant before the hand-wound one started
// running. A fast day is not an automatic one.
export function isAuto() {
  return hand === null;
}

export function setPhaseOverride(phase) {
  hand = ORDER.includes(phase)
    ? { hour: PHASE_START[phase], since: performance.now() }
    : null;
  return activePhase();
}

// Which hour a point on the scrubber's axis belongs to. 1.5 is the boundary
// between noon and evening, and rounds up into evening.
export function phaseAtIndex(i) {
  return PHASES[Math.max(0, Math.min(PHASES.length - 1, Math.round(i)))];
}
