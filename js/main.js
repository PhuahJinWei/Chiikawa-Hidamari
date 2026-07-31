import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CAST, PLAYER } from './cast.js';
import { BANKS } from './lines.js';
import { Globe } from './scene.js';
import { PlanetCamera } from './camera-control.js';
import { Household } from './household.js';
import { Social } from './social.js';
import { MoveInput } from './move-input.js';
import { TowedBody } from './body.js';
import { Character } from './character.js';
import { Dialogue } from './dialogue.js';
import {
  dirFromLatLon, inLake, inBuilding, inSolid, perchUnder, keepOffSolids,
  auditSolids, solids,
} from './sphere.js';
import {
  activePhase, isAuto, setPhaseOverride,
  PHASE_LABEL, PHASES, LOOK, phaseAtIndex,
} from './daylight.js';
import {
  tickWeather, activeWeather, wetness, snowCover, setSnowCover, lightningStruck,
  rainbowOut, rainbow, iceLook, pondsFrozen,
  setWeatherOverride, isAutoWeather, forecast,
  WEATHERS, WEATHER_LABEL,
} from './weather.js';
import { IMG, ICON_CAT, SKY_DISC_ART } from './assets.js';
import { paintSheet, sheetBounds } from './art.js';
import { loadArt } from './assets.js';
import { ITEMS, Inventory, itemIcon, SLOTS } from './items.js';
import { Fishing } from './fishing.js';
import {
  buildPlushie, buildTeapot, buildLantern, buildTrashBag, buildTrashBagAlt,
  buildPinkWeapon, buildBlueWeapon, buildOpenBook, buildHouseKey, buildGuitar,
  buildCamera,
} from './furniture.js';

const stage = document.getElementById('stage');
const startEl = document.getElementById('start');
const layer = document.getElementById('bubbles');

// --- the front door
//
// How far in we are, said twice: as a car driving the road on the start screen,
// and as a number beside it. Both come off `--p`, which the CSS turns into a
// position for the car and a length of covered road behind it — so the two can
// never disagree, and easing the move is a transition rather than anything
// counted here.
//
// The phase-coloured sky and the drawn planet that stood here are gone: the menu
// is an illustration again, and a drawing brings its own sky and its own horizon.
// LOOK is still imported for the world itself, which is where it belongs.
const loadbar = document.getElementById('loadbar');
const pctEl = document.getElementById('start-pct');

function showProgress(p) {
  loadbar.style.setProperty('--p', p);
  pctEl.textContent = `${Math.round(p * 100)}%`;
}

// Nothing can be built until the art has decoded — a texture made from an
// image that has not is silently blank. A top-level await simply delays this
// module's evaluation, so everything below stays the straight-line code it was
// instead of being folded into a callback.
//
// The start screen is already up from the markup, and says it is loading until
// this resolves; the tap that dismisses it cannot arrive earlier, because the
// listener for it is registered further down this same module.
//
// A failure here is terminal — every texture in the scene comes out of it — so
// it says so on the screen rather than leaving よみこみちゅう… breathing forever
// with the reason buried in the console. Rethrown after, because nothing below
// can run without the pixels and a half-built world is worse than none.
try {
  await loadArt(showProgress);
} catch (err) {
  // `is-failed` parks the road and the count, which would otherwise sit there
  // half-driven promising a load that is not coming.
  startEl.classList.add('is-failed');
  startEl.querySelector('.start-sub').textContent = 'よみこめませんでした';
  startEl.querySelector('.start-note').textContent =
    'つうしんを かくにんして、ページを さいよみこみ してね';
  throw err;
}
startEl.querySelector('.start-sub').textContent = 'じゅんび できたよ';
startEl.classList.add('is-ready');

const globe = new Globe(stage);
const rig = new PlanetCamera(globe.camera);

// You arrive on the doorstep.
//
// The house is the one thing in this world you can go inside, and it is now
// the first thing you see: standing on the grass a few paces out from its own
// front door, looking at it, with the open arch plainly a way in. It used to
// be a fifteen-unit walk from the arrival — you spawned among the cast with a
// pond for a nearest landmark, and the building the whole app is built around
// was over the horizon on the far side of the planet.
//
// DERIVED, not written down, and that is the point of doing it here rather
// than in a lat/lon in CONFIG. Which way you face when you arrive has to be
// which way the door faces, and the door's bearing belongs to the building —
// see interior.doorFacing. Ask the house where its door is and the arrival
// follows it, however the house is moved or turned afterwards.
//
// camera.startAt is the fallback the rig was built with, and stands if there
// is no house on the planet to arrive at.
{
  const spawn = globe.doorstepDir(new THREE.Vector3(), CONFIG.camera.spawnBack);
  if (spawn) {
    rig.standAt(spawn, globe.house.normal);
    rig.settle();
  }
}

// There is no other place any more. The room is the inside of the house's own
// dome, built by the globe alongside the rest of the world, and the one rig
// walks you everywhere — through the front door like anywhere else. What used
// to need a second scene, a second rig, a doorway choreography and a veil now
// needs one question, asked wherever it matters:
function insideHouse() {
  // On the floor of it, not merely over it. The anchor is where you are STOOD,
  // which stays under the roof the whole time you are climbing out of your own
  // house — so without the altitude half of this, taking off indoors would
  // leave you counted as indoors at the top of the sky, with the entire cast
  // filed as standing behind a wall.
  return rig.isFirstPerson && globe.isInside(rig.anchor);
}

// --- cast
const bots = CAST.map((spec) => {
  const ch = new Character(spec);
  ch.placeAt(spec.home.lat, spec.home.lon, CONFIG.globe.radius);
  globe.addCharacter(ch);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  const text = document.createElement('span');
  bubble.appendChild(text);
  layer.appendChild(bubble);

  const dlg = new Dialogue({
    bank: BANKS[spec.key],
    bubbleEl: bubble,
    textEl: text,
    onExpression: (e) => ch.setExpression(e),
  });
  return { spec, ch, dlg, bubble };
});

const byChar = new Map(bots.map((b) => [b.ch, b]));
// ...and the same index by the key a save writes down, which is how a loan finds
// the friend it was made to — see carryLent, which asks this every frame.
const botByKey = new Map(bots.map((b) => [b.spec.key, b]));

// --- you
//
// The visitor, made flesh: Momonga stands wherever the rig says you are stood.
// Not one of `bots` — no dialogue, no household turn, no tap test — but fully
// one of the cast to the globe: sorted, tinted, lamplit and shadowed like
// anybody else, which is the point of having a body at all. See PLAYER in
// cast.js for why it is described there and driven from here.
const you = new Character(PLAYER);
globe.addCharacter(you);
// Born on the ground, where the body is nothing — see the fade in frame().
you.fade = 0;
you.root.visible = false;

// Your own body, drawn only once you are high enough to be looking at it — the
// fade, the leash, the glide and the transit rules all live in body.js now. It
// is built here because it needs the rig and the Character above, and nothing
// else in this file reads it except the shove, which asks it where your feet are.
const body = new TowedBody({ rig, you });

// Who is home, and the lit windows that say so. Built after the cast, because
// it is about them.
const household = new Household({ globe, bots });

// WHO IS TALKING — see social.js, which owns the scheduler and every cooldown
// behind it. What stays here is the wiring and a handful of one-line delegates:
// the pointer handlers below call `speak` and `pokeBack` by those names in a
// dozen places, and a tap on a friend reads better as `pokeBack(bot, ...)` at
// the point the tap is handled than as a reach through an object.
const social = new Social({ bots, byChar, globe, rig });
// ...and the household borrows it, for the one thing in there that talks:
// somebody at their hobby. See _pastimeTick.
household.social = social;
// ...and where you are standing, for the one mode that walks beside you.
household.rig = rig;

const throughWall = (ch) => social.throughWall(ch);
const canChatter = (ch) => social.canChatter(ch);
const speak = (bot, bucket, now) => social.speak(bot, bucket, now);
const pokeBack = (bot, bucket, now) => social.pokeBack(bot, bucket, now);
const updateCast = (now) => social.update(now);
// Both of these are one-shots fired from the weather, and both are gated on the
// world having started — the start card must not be talked over.
const strike = (now) => { if (started) social.strike(now); };
const noticeBow = (now) => { if (started) social.noticeBow(now); };

// Time of day follows the visitor's real clock, so an evening visit is a
// different place from a lunchtime one — until they pick an hour by hand, at
// which point daylight.js holds the choice and this just asks it.
//
// Everything the hour decides *except* the sky, which is either faded by
// setDaylight or dragged by the scrubber. Split out because during a scrub the
// pill should already read よる and the cast should already be reaching for
// their night lines, while the sky itself is still under a finger and must not
// be told what to do by anybody else.
//
// It used to put the whole cast to sleep here as well. They stay up now, so all
// the hour decides about them is which bucket they speak from — which they ask
// daylight.js for themselves, at the moment they speak.
function adoptPhase(next) {
  if (next === phase) return false;
  phase = next;
  paintTime();
  return true;
}

// The sky as well. The very first application is instant: there is nothing to
// fade *from* on the first frame, and a world dissolving into itself on arrival
// would look like a bug rather than a sunset.
function applyPhase(next, { instant = false } = {}) {
  if (!adoptPhase(next)) return;
  globe.setDaylight(phase, { instant });
}

let phase = null;
let phaseCheckAt = 0;

// How much of the last lightning bolt is left, 1 down to 0. Held here rather
// than in weather.js for the reason given there: the director deals a day and
// answers questions about the sky, and a flash is neither — it is an event on
// the frame clock, and this is the file with the frame clock in it.
let flash = 0;

// Whether the coats are currently on. The threshold itself is
// CONFIG.weather.dressAt, which is shared with the scenery's own snow drawings
// so the whole world changes on one frame rather than over several — see the
// note there.
let dressed = false;

// ...and what a bolt does to whoever is out in it.
//
// There is no sound in this app, which takes the better half of thunder away —
// what makes a real one land is the gap between seeing it and hearing it. So
// the flinch has to carry it, and the cheapest honest flinch is a LINE: the
// bank's `thunder` bucket is written surprised, and saying one already puts
// that expression on their face through the machinery every other line uses.
// Nothing new draws, and nobody had to be taught to be startled.
//
// One of them, not all three, and not every bolt. A storm strikes every dozen
// seconds or so; three characters answering each of them in chorus would read
// as a cast reacting to a stage direction rather than as people in the rain.
//
// The choosing is Social.strike now — it is a decision about who speaks, which
// is that file's whole subject. What is left here is the paragraph above, which
// is about the WEATHER and belongs beside the storm it describes.

// Whether there was a rainbow up on the LAST frame, so that the one frame it
// arrives on can be found. See below.
let bowWas = false;

// ...and whether the ponds were bearing weight, for the same reason: the thaw
// has to be caught as an EDGE, because what it owes is a one-off rescue rather
// than a state. See the hand-back in the frame.
let iceWas = false;

// SOMEBODY LOSES THEIR FOOTING, which is the whole of what walking on ice costs
// them and the only reason the ice is funny rather than merely novel.
//
// Rolled per second of WALKING rather than of standing, so a friend who has
// stopped to look at you never falls over for no reason — and only for somebody
// actually out on a pond, so the meadow stays as sure-footed as it has always
// been.
//
// It is a LINE AND A PAUSE and deliberately nothing more. The obvious version
// spins them, or slides them a little way along their bearing, and both need
// animation this world does not have — a card cannot windmill. What it does
// have is a bank of surprised faces and a bubble, which is how everything else
// in this app reacts to anything, so a slip is: stop, be startled, say so.
function slipOnIce(dtMs, now) {
  if (!started || !pondsFrozen()) return;
  const p = (dtMs / 1000) * CONFIG.weather.slipChance;
  for (const b of bots) {
    const ch = b.ch;
    if (!ch.walking || ch.hurrying) continue;
    // ASLEEP rather than not-visible, and the difference is the whole mechanic.
    // `isVisible` is answering "are they over the horizon", which on a planet
    // five units across is nearly always yes for the two you are not looking
    // at — so gating on it made the ice slippery only where somebody happened
    // to be watching, and measured at exactly zero slips in a hundred seconds
    // of walking on it. What actually cannot slip is a body that is lying down.
    //
    // The LINE is still gated on being seen, a few lines below, which is where
    // that rule belongs: a slip off in the distance is a friend stumbling, and a
    // bubble nobody can see is chatter spent on nothing.
    // ...and never mid-conversation. Asked of the ONE reason rather than of the
    // ledger as a whole — see Character.holding, whose own note names this case:
    // a slip should not interrupt a chat, but a character merely resting between
    // strolls is exactly who ought to be able to go over.
    //
    // It read `now < ch.busyUntil` until now, and that field no longer exists —
    // character.js folded it into the ledger as 'talk'. Against `undefined` the
    // comparison is always false, so the guard had quietly stopped guarding and
    // a friend could be pitched onto the ice mid-sentence.
    if (ch.asleep || ch.holding('talk', now)) continue;
    if (!CONFIG.lakes.some((l) => inLake(ch.dir, l, 0))) continue;
    if (Math.random() > p) continue;
    ch.walking = false;
    ch.errand = null;
    // Likewise `restUntil`, which is the ledger's 'rest'.
    ch.hold('rest', now + CONFIG.weather.slipMs);
    // Silent if nobody could see it. A bubble opening on a friend the far side
    // of the planet spends the chatter budget on something nobody watched —
    // the same rule the meeting exchange keeps.
    if (b.dlg.has('slip') && !b.dlg.isVisible && canChatter(ch)) speak(b, 'slip', now);
  }
}

// ...and somebody noticing one.
//
// It fires ONCE, on the frame the arc crosses into being worth looking at, and
// that is the whole difference between this and the ordinary weather chatter.
// A rainbow line in the timeOfDay slot would come round every half minute for
// as long as the arc was up, which would turn the rarest thing in this world
// into background noise — the same argument that keeps `delight` out of the
// idle bank. This is the moment somebody looks up and says so.
//
// Whoever can actually see it, which excludes anybody still indoors: the cast
// come out of the rain a few seconds before the arc arrives, so somebody left
// on a cushion is somebody who has not noticed yet, and they will have their
// own chance when they get outside and the gathering picks them up.
// ...and the choosing is Social.noticeBow, for the reason the thunder's is.

// Hand the hour to a different clock. Always this rather than setPhaseOverride
// directly, because the deadline the *previous* clock set has to be retired
// with it: the two are read at very different rates, and a じどう check is
// scheduled 30 seconds out. Pick an hour a moment after one of those was
// booked and the fast day stood still for the rest of that wait — up to a whole
// virtual hour of a world that had just been told to start moving, which is the
// one moment anybody is watching for it. Measured at 7 frames of a 40-second
// test day before this existed.
function setHour(next) {
  setPhaseOverride(next);
  phaseCheckAt = 0;   // re-read on the very next frame, at the new rate
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const anchor = new THREE.Vector3();
const probe = new THREE.Vector3();
const playerDir = new THREE.Vector3();
// Scratch for the threshold triggers: the doorstep outside, or the walk rim's
// door end inside, whichever side of the wall the frame is checking.
const doorSpot = new THREE.Vector3();
const spotDir = new THREE.Vector3();

const R = CONFIG.globe.radius;

// Capturing can legitimately throw — a pointer released between the event
// firing and this running, for one — and an exception escaping a pointerdown
// handler would skip whatever came after it.
function capture(el, id) {
  try { el.setPointerCapture(id); } catch { /* not worth caring about */ }
}

function arcBetween(a, b) {
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * R;
}

// `playerAtWater` stood here — stood at the EDGE of a lake rather than in one,
// since being in one is impossible now that the rig refuses the step. It is
// Social.playerAtWater, with the rest of what decides who says what.

// This app writes nothing down. Two keys older builds left behind — the hour
// you had picked, and the timestamp behind "it remembers you came" — are
// cleared once on the way past, so nobody is left carrying a value that looks
// live and is not. Worth the two calls for a site people keep installed as a
// PWA, where storage outlives the code that wrote it by however long they go
// between visits.
//
// `arrivalBucket` stood here and worked out whether you were last seen an hour
// ago or last week. Without a record there is no gap to measure, so arrival is
// simply 「greet」 now — see the note in lines.js about what that leaves idle.
try {
  localStorage.removeItem('hidamari.phase');
  localStorage.removeItem('hidamari.lastVisit');
} catch { /* private mode: nothing was ever written to clear */ }

// `onScreen`, `throughWall` and `canChatter` stood here, and so did every
// cooldown behind them — `nextChatterAt`, `lastTouchAt`, `saidLongIdle`,
// `greetedKey`, `greetCooldownUntil`, `meetUntil`, `pendingReply`,
// `wasInWater`, `waterQuietUntil`, nine module-level `let`s scattered between
// the pointer routing and the drawer UI. All of it is in social.js, for the
// reason its own header gives: those are a CONVERSATION's state, and a
// conversation spans frames, spans characters and belongs to none of them.
//
// The three predicates come back as delegates above, because a dozen call
// sites here read better as `throughWall(b.ch)` than as a reach through an
// object — and `throughWall` in particular is asked by things that have
// nothing to do with talking, like which character a tap may land on.

// Whether the world is running yet. The one flag that genuinely belongs to this
// file: everything that speaks or reacts is gated on it, so the start card
// cannot be talked over.
let started = false;
// When the ground last left your feet while holding a hand — see the release
// in the frame loop, which waits out surface wobbles before letting go.
let handAirAt = 0;
// Whether your own body is currently wearing its pleased face — see the swap in
// the frame, and PLAYER in cast.js for the sheet.
let youGlad = 'normal';

// --- pointer routing
//
// Two gestures run at once, tracked separately: one thumb on the movement pad
// and one finger on the camera. They have to be separate — treating any second
// pointer as a pinch meant reaching in with your other hand to look around
// zoomed instead, and tore down whatever the first hand was doing.
//
// A pinch is therefore two *camera* fingers, never the pad plus one.
const pointers = new Map();
// The pad itself lives in move-input.js now, with the keyboard that says the
// same thing — see `moves` above. What stays here is the arbitration between
// the three kinds of finger, which is about all of them and so belongs to none.
const look = { id: null, mode: null, ch: null, lastX: 0, lastY: 0, travel: 0 };
// `mid` is where the two fingers are between them, and it is here because a
// two-finger gesture says TWO things at once: the gap between them is the zoom,
// and the point between them is where the hand is pointing. A map app has read
// both from one gesture for twenty years. Only the selfie listens to the second
// — see the pan in onMove.
const pinch = { a: null, b: null, start: 0, midX: 0, midY: 0 };

function touched() {
  const now = performance.now();
  social.touched(now);
  rig.markTouched(now);
}

// EVERYTHING THAT SAYS "GO THAT WAY" — the thumb pad, the keyboard, and the two
// action buttons — in one place. See move-input.js.
//
// Built here rather than down with the rest of the controls because the pointer
// handlers below hand it their touches, and it reads better for the thing they
// defer to to have been introduced first. The elements it draws into are in the
// document already; nothing in this file waits for load.
const moves = new MoveInput({
  rig,
  stick: document.getElementById('stick'),
  knob: document.getElementById('stick-knob'),
  jumpBtn: document.getElementById('jump-btn'),
  sprintBtn: document.getElementById('sprint-btn'),
  onTouched: touched,
  // A hop is a wave, and whoever is near enough waves back — see hopSeen, which
  // is a function declaration and so is already here to be named.
  onHop: () => hopSeen(),
});

function gapBetween(a, b) {
  const pa = pointers.get(a);
  const pb = pointers.get(b);
  if (!pa || !pb) return 0;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function clearLook() {
  look.id = null;
  look.mode = null;
  look.ch = null;
}

function setNdc(e) {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, globe.camera);
}

// Nearest character whose opaque pixels are under the finger. Anyone round the
// far side of the planet is skipped — you cannot tap what you cannot see —
// and so is anyone on the other side of the house's wall: their card does not
// depth-test against it, so the ray would happily hand back somebody sat at
// home behind a metre of masonry.
function pickCharacter() {
  let best = null;
  let bestD = Infinity;
  for (const b of bots) {
    if (!b.ch.isVisible || throughWall(b.ch)) continue;
    // ...and a tap cannot reach a performer either. The same rule the focus
    // keeps, kept here too because the two are separate doors into the same
    // room: the focus feeds the pills, a tap pokes somebody directly, and a
    // rule enforced at one of them is a rule with a way round it.
    if (household.playingAt(b.ch)) continue;
    const p = b.ch.hitTest(raycaster);
    if (!p) continue;
    const d = p.distanceToSquared(globe.camera.position);
    if (d < bestD) { bestD = d; best = { ch: b.ch, point: p }; }
  }
  return best;
}

// `anyoneSpeaking`, `silenceOthers`, `scheduleNext`, `speak`, `speakAmbient`
// and `pokeBack` stood here. All six are Social's, and `speak`/`pokeBack` come
// back as delegates above so the call sites below are unchanged.
//
// The one behaviour that moved rather than merely relocating is in pokeBack:
// Social's calls `bot.ch.notice(now)`, which restarts the attention window on
// somebody you have just addressed — see Character.notice, and the note there
// about why being ADDRESSED counts and ambient chatter does not.

// --- the pouch
//
// One Inventory for the visit, loaded from the save before anything below can
// ask it a question. The hand, the pill and the panel all redraw off its
// change signal, so no piece of UI keeps its own idea of what you own.
const inventory = new Inventory();

// Handing over what you are holding. Returns whether a gift actually happened,
// because the tap that calls this falls back to a plain greeting when it did
// not — the pouch and the hand can only disagree if a save was edited out from
// under us, but a tap must do SOMETHING either way.
//
// The cooldown is per FRIEND, not per item and not global: it is about how
// recently this one was made a fuss of. Inside the window the gift still
// happens and still lands warmly — the smaller tier is a fully grateful line,
// never a refusal — and the stamp is only written on the full-delight tier, so
// a string of quick gifts does not keep pushing the big thank-you further
// away.
function giveGift(bot, itemId, now) {
  const key = bot.spec.key;
  const again = Date.now() - inventory.lastGiven(key) < CONFIG.social.giftCooldown;
  if (!inventory.take(itemId)) return false;
  if (!again) inventory.markGiven(key);
  // THEIR FAVOURITE beats the ordinary thank-you, and beats the cooldown too:
  // handing Usagi a mushroom is an event whether or not you handed them
  // something else five minutes ago. The cooldown exists to stop a string of
  // identical gifts flattening the big reaction, and a gift they actually
  // wanted is not that string.
  //
  // The stamp is still only written on a full-tier gift, so a favourite does
  // not silently push the ordinary one further away either.
  const loved = (bot.spec.likes || []).includes(itemId);
  speak(bot, loved ? 'giftLove' : again ? 'giftAgain' : 'gift', now);
  return true;
}

// --- fishing
//
// The rod itself lives in fishing.js; what belongs here is only what it may
// touch when a fish is landed — the pouch. The catch goes in through the same
// recordCatch the 図鑑 counts by, and lands IN YOUR HAND when the hand is
// free, because the natural next thing to do with a fresh fish on this planet
// is walk it over to somebody.
//
// THE ONE ACQUISITION THAT STILL FILLS THE HAND. Everything picked off the
// ground now goes to the pouch and stops there — see takeItem — because a full
// hand costs a button on screen for as long as it lasts. A fish is worth the
// button: you went and caught it, the catch is the point of the trip, and
// showing it to somebody is what the next minute is for.
const fishing = new Fishing(globe, {
  // Asked at the strike, before the reveal is animated — see _catch. A full
  // pack means the fish goes back in the water rather than silently failing to
  // arrive in a bag with no room for it.
  canKeep: (id) => inventory.hasRoomFor(id),
  onCatch: (id, kept) => {
    // Counted either way: you landed it and saw what it was, which is what the
    // 図鑑 is a record of. Only a kept one goes in the pack.
    inventory.tally(id);
    if (!kept) return;
    inventory.add(id);
    if (!inventory.holding && !inventory.heldUnique) inventory.hold(id);
  },
});

// --- the uniques
//
// The bear and the teapot: one each in the world, picked up as themselves and
// carried as themselves. What lives here is the glue between three owners —
// the loose-furniture system (where the piece IS), the inventory (where the
// save says it is), and the hand (what you see) — and the rule the glue
// enforces is that the three never disagree for longer than one call.

// The copy the hand holds. Built once per art on first pickup and kept —
// the world's own anchor stays where it is (hidden), because reparenting it
// through standAt's transforms and back was two chances to end up with a tiny
// bear standing in the room. Heights are the furniture entries' own.
// Builders hand back { group, fills, top, ... }; the hand wants the group.
const HAND_BUILDERS = {
  // STOOD BACK UP. buildPlushie models the bear upright and then tips it onto
  // its back — it lies on a futon, and face-down would be a brown lump — but a
  // bear held in your hand is a bear held UP, not one carried horizontally like
  // a tray. Undoing the builder's own lay-down is +90° about the same axis,
  // asked of the copy rather than of the piece in the room, which is the whole
  // reason the hand gets a copy.
  plushie: () => {
    const g = buildPlushie(0.50).group;
    g.rotation.x = Math.PI / 2;
    return g;
  },
  // The teapot is modelled standing and stays standing; nothing to undo.
  teapot: () => buildTeapot(0.26).group,
  // The book is displayed face-on in the hand and pack so both open pages and
  // their drawings remain readable instead of collapsing to a thin edge.
  openbook: () => {
    const g = buildOpenBook(0.22).group;
    g.rotation.x = Math.PI / 2;
    return g;
  },
  // The room copy lies flat. Held, its broad face turns toward the player and
  // its shaft points downward like a key dangling from a small paw.
  housekey: () => {
    const g = buildHouseKey(0.804).group;
    g.rotation.x = Math.PI / 2;
    return g;
  },
  // The lantern likewise. Its heights are the furniture entry's own, so a
  // resized lamp in the room is a resized lamp in your hand.
  lantern: () => buildLantern(0.34).group,
  // Each rubbish bag keeps its own body profile and cave scale in the hand.
  trashbag: () => buildTrashBag(0.78).group,
  trashbag2: () => buildTrashBagAlt(0.72).group,
  // The builder models the sasumata lying flat; at home the scene leans it
  // against the wall on top of that (see `lean` in the furniture tables), and
  // set down anywhere else it lies flat again. The hand copy is its own pose:
  // rotate it upright so the open fork and all twelve teeth face the player
  // instead of collapsing to a side view.
  pinkweapon: () => {
    const g = buildPinkWeapon(0.52).group;
    g.rotation.x = -Math.PI / 2;
    g.rotation.z = 0.42;
    return g;
  },
  blueweapon: () => {
    const g = buildBlueWeapon(0.52).group;
    g.rotation.x = -Math.PI / 2;
    g.rotation.z = 0.42;
    return g;
  },
  // The room copy lies flat before the cave gives it a wall lean. Turn the
  // broad decorated face toward the camera for both the hand and pack snapshot.
  guitar: () => {
    const face = buildGuitar(1.28).group;
    face.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(face);
    holder.rotation.z = Math.PI;
    return holder;
  },
  // The camera is already authored upright with its decorated front toward the
  // viewer, so the held copy needs no corrective model rotation.
  camera: () => buildCamera(0.32).group,
};
const handMeshes = {};

// WHERE A PIECE SITS IN YOUR OWN VIEW — overrides for the hand slot, passed to
// holdMesh, absent for every art content with the defaults. Beside the
// builders for CARRY's reason below: the pose a copy was built in and the spot
// it is shown at are one decision.
//
// `x`/`y` are fractions of the frame from its middle and `h` a fraction of its
// height, exactly as hand.js writes its own defaults; `turn`/`tip` replace the
// slot's three-quarter view. Only the sasumata is here, and each number is the
// difference between exhibiting a thing and carrying it:
//
//   x/y   further into the corner — a card is held up to be READ, but a tool
//         is kept down at your side, half out of frame the way a held pole
//         actually hangs at the edge of your sight. Not the WHOLE way into
//         it: the sprint and jump buttons own the corner itself (their tops
//         sit near y -0.72 on a portrait phone), so the slot's centre stops
//         at -0.62 and only the thin end of the shaft runs on behind them,
//         which reads as the pole leaving the frame rather than as the UI
//         losing an argument.
//   h     bigger. At the card slot's size the fork is a specimen in a case;
//         close and large is what says it is in your grip, and the anime's
//         own framing of Chiikawa lugging it is exactly this — low, near,
//         crossing the corner of the shot.
//   turn  shallower than the slot's -0.6: a pole that long foreshortens into
//         a stub at the full three-quarter, and the silhouette IS the fork.
//   w     the width cap, widened on purpose. fitHeld sizes a copy by its
//         LONGEST dimension, and the fork is nothing but longest dimension —
//         under the default cap, raising `h` bought almost no size at all,
//         because the cap was the binding number on every aspect worth
//         tuning for. A pole gripped at your side is supposed to leave the
//         frame at the corner; this is the one piece for which running off
//         the edge is the honest read, which is why the cap is a default
//         and not a law (see _fit in hand.js).
const HAND_POSE = {
  pinkweapon: { x: 0.58, y: -0.62, h: 0.46, w: 0.72, turn: -0.30, tip: 0.10 },
  blueweapon: { x: 0.58, y: -0.62, h: 0.46, w: 0.72, turn: -0.30, tip: 0.10 },
  openbook: { x: 0.54, y: -0.48, h: 0.32, w: 0.52, turn: -0.18, tip: 0.05 },
  housekey: {
    x: 0.52, y: -0.50, h: 0.30, w: 0.40,
    turn: -0.20, tip: 0.05, roll: Math.PI / 2,
  },
  guitar: {
    x: 0.52, y: -0.50, h: 0.36, w: 0.58,
    turn: -0.18, tip: 0.05, roll: -0.12,
  },
  camera: {
    x: 0.50, y: -0.48, h: 0.23, w: 0.34,
    turn: -0.14, tip: 0.04, roll: -0.04,
  },
};

// WHERE A PIECE SITS IN SOMEBODY'S HANDS — the cast's, and your own body's when
// you can see it. See Character.holdPiece for how it is hung and why.
//
// Beside HAND_BUILDERS rather than in config.js because the two are one
// decision: the builders above pose each copy for being LOOKED AT down the
// camera's axis, and a character's card faces the camera too, so those poses are
// already the right way round here. What is left for this table is where on the
// body the piece rides, how big it is, and how far it is turned out of flat.
// Split across two files, the pair would drift the first time a builder's pose
// changed.
//
// Every distance is a FRACTION OF THE CARRIER'S DRAWN HEIGHT, so one row serves
// the whole cast and your avatar. `x` is to their screen-right, `y` is up from
// the feet, `z` is toward the camera — a little, so a piece rides in front of
// the drawing rather than sliced down its middle by it. `size` is the piece's
// longest dimension.
//
// `spin` and `tilt` turn it out of flat-on. Small on purpose: enough to say the
// thing has a back, not so much that it stops reading as the drawn prop it is
// standing in for. Straight-on it looks pasted; at the hand slot's own -0.6 it
// starts to look like a rendered object visiting from another game.
// `roll` turns the piece in the plane of the drawing, and the sasumata is the
// reason it exists. The hand builders stand each copy up for a slot you look
// STRAIGHT DOWN at, and for the sasumata that means turning its open fork and
// all twelve teeth to face you — which leaves the shaft lying horizontal,
// because face-on is the only thing that pose was ever asked for. Carried, it
// has to be a pole: a quarter turn on top of the builder's own 0.42 lean stands
// it up with the fork above the shoulder, leaning out the way somebody small
// carries something long.
const GRIP = { x: 0.30, y: 0.42, z: 0.10, size: 0.55, spin: -0.32, tilt: 0.10, roll: 0 };
const CARRY = {
  // Fork up, butt down by the paw. Sized close to the whole body because that is
  // what a sasumata IS here — the joke of the drawing is a small animal with a
  // large fork — and `x` is far enough out to clear the face, which is the one
  // measurement that had to be tuned by looking rather than reasoned about: at
  // 0.24 the fork sat squarely over Chiikawa's right eye.
  pinkweapon: { ...GRIP, x: 0.37, y: 0.45, size: 0.92, roll: -1.72 },
  blueweapon: { ...GRIP, x: 0.37, y: 0.45, size: 0.92, roll: -1.72 },
  // The lamp hangs at the side, low, the way a thing with a handle is carried.
  lantern: { ...GRIP, x: 0.36, y: 0.30, size: 0.50 },
  // The bear is HUGGED — in close and high, the only one of these held against
  // the chest rather than out at arm's length, because that is the one thing
  // everybody in this world does with it.
  plushie: { ...GRIP, x: 0.25, y: 0.40, size: 0.46 },
  teapot: { ...GRIP, x: 0.30, y: 0.38, size: 0.38 },
  openbook: { ...GRIP, x: 0.30, y: 0.42, size: 0.42, spin: -0.15 },
  // Its carried length remains the requested 40% of the carrier's drawn height.
  housekey: {
    ...GRIP, x: 0.34, y: 0.35, size: 0.40,
    spin: -0.16, roll: Math.PI / 2,
  },
  // The rubbish bags are lugged: heavy, low, and out from the body.
  trashbag: { ...GRIP, x: 0.36, y: 0.26, size: 0.62 },
  trashbag2: { ...GRIP, x: 0.36, y: 0.26, size: 0.58 },
  // Held across the body like the reference, with the soundboard facing out.
  guitar: {
    ...GRIP, x: 0.30, y: 0.37, size: 0.66,
    spin: -0.14, tilt: 0.08, roll: -0.12,
  },
  // Held high enough to look ready for a photograph, but below the face so the
  // camera does not become a mask when a character carries it.
  camera: {
    ...GRIP, x: 0.27, y: 0.41, size: 0.32,
    spin: -0.10, tilt: 0.04, roll: -0.04,
  },
};

// The copy that rides on a BODY, which is never the copy in your hand: the two
// can be on screen at once — your avatar at altitude with the hand slot still
// up — and one object cannot be in two places.
//
// Keyed by ITEM and not by art, unlike the hand's cache, and that is the whole
// reason it is a separate table: there are two lanterns, and lending one to
// Chiikawa while Hachiware keeps the other has to put a lantern in each pair of
// hands rather than move one between them.
const carryMeshes = {};
function carriedPiece(id) {
  const art = ITEMS[id].art;
  if (!carryMeshes[id]) carryMeshes[id] = HAND_BUILDERS[art]();
  return carryMeshes[id];
}

// Which loose pieces are carryable at all — the table's uniques, by art.
const UNIQUE_ARTS = Object.values(ITEMS).filter((i) => i.kind === 'unique').map((i) => i.art);

function uniqueByItem(id) {
  return globe.looseByItem(id, ITEMS[id].art);
}

// The picture a slot in the pack shows, whatever kind of thing is in it.
//
// `itemIcon` is the answer for everything that was PAINTED, and it has no
// answer for a unique — there is no bear drawing and there never was, so a
// stowed bear fell through its branches to the tuft of grass at the bottom and
// sat in the bag as a chip you could not tell from a handful of weeds. Which
// is a very good way for a lamp to look like it vanished.
//
// So a unique is photographed instead, once per piece, off its own build — see
// snapshot in scene.js. Its own copy, and its own MATERIALS, which is the part
// worth writing down: two of the materials a built piece wears are module-level
// singletons shared by every stick of furniture in the house (the ink, and the
// colour the legs are drawn in), and those are on the tint list. A chip taken
// at midnight would have baked the room's midnight into its outline and kept it
// there for the rest of the session. The clones wear `baseColor` — the colour
// the piece was built in — so the chip is the thing itself under no particular
// hour, the way a drawing of it would be.
const uniqueChips = {};
function packIcon(id) {
  const it = ITEMS[id];
  if (it.kind !== 'unique') return itemIcon(id);
  if (!uniqueChips[it.art]) {
    const obj = HAND_BUILDERS[it.art]();
    obj.traverse((o) => {
      if (!o.material) return;
      const base = o.material.userData.baseColor;
      o.material = o.material.clone();
      if (base) o.material.color.copy(base);
    });
    uniqueChips[it.art] = globe.snapshot(obj);
  }
  return uniqueChips[it.art];
}

// EVERY SLOT FILLED TO THE SAME FRACTION, which the drawings do not do on their
// own.
//
// They arrive on canvases of their own shape and their own margins: a fish
// cropped tight to its pixels by paintFishCard, a mushroom padded for its
// mipmap by paintSheet, a blade of grass tall and thin on a mostly empty card,
// a photographed bear framed by whatever scene.js gave it. `object-fit:
// contain` then fits each CANVAS to its slot rather than each DRAWING — so four
// slots come out filled to four different fractions, and a full pack reads as
// untidy however carefully it is arranged. It was the second thing wrong with
// the old panel and the one with no single place to blame.
//
// So the ink gets measured, and redrawn centred on a square at one fixed
// fraction of it. Nothing about the drawing changes; only how much of its slot
// it is given, which is precisely the thing that was inconsistent. Keyed off
// the source canvas, which art.js already caches per item, so this runs once
// per item per session.
const SLOT_FILL = 0.76;
const SLOT_PX = 128;
const squared = new WeakMap();

function squareIcon(src) {
  const had = squared.get(src);
  if (had) return had;

  const b = sheetBounds(src);
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const k = (SLOT_PX * SLOT_FILL) / Math.max(w, h);

  const out = document.createElement('canvas');
  out.width = SLOT_PX;
  out.height = SLOT_PX;
  const g = out.getContext('2d');
  // The sources run several times this size, so this is always a downsample and
  // the cheap default filter shows on the ink outlines.
  g.imageSmoothingQuality = 'high';
  g.drawImage(
    src, b.minX, b.minY, w, h,
    (SLOT_PX - w * k) / 2, (SLOT_PX - h * k) / 2, w * k, h * k,
  );

  squared.set(src, out);
  return out;
}

// What a SLOT shows, which is not what the world shows.
//
// The pack grid is the one place that wears the drawn icon tiles — see ICONS in
// assets.js for why they are different pictures on purpose. Everything else in
// the app goes on asking `itemIcon` for the thing itself: the card in your hand,
// the fish in the lake, the 図鑑's rows and its silhouettes.
//
// The fallback is not decoration. A future item added to ITEMS with no row in
// ICONS gets the old squared drawing rather than an empty square, so forgetting
// to draw a tile is a slightly plainer slot instead of a hole.
function slotIcon(id) {
  const tile = IMG.icons[id];
  return tile ? tile.src : squareIcon(packIcon(id)).toDataURL();
}

// Set the held unique down at `spot` — or, if the spot is water, watch it go
// under and start the walk home. With no spot it goes straight home. The one
// exit every held-unique state shares.
const _faceBack = new THREE.Vector3();
function putDownUnique(spot) {
  const id = inventory.heldUnique;
  if (!id) return false;
  const loose = uniqueByItem(id);
  // ぽちゃん needs something to go ぽちゃん INTO. On ice the pond refuses the
  // drop entirely and falls through to the ordinary placement below, which
  // refuses a pond too — so nothing is set down on a frozen pond at all. That
  // is deliberate rather than an oversight: a lantern left on the ice would be
  // floating in open water twenty minutes later, and the thaw has no way to put
  // it back. The snowman is kept off the ponds for exactly the same reason.
  if (spot && !pondsFrozen() && CONFIG.lakes.some((l) => inLake(spot, l))) {
    // ぽちゃん. The pond keeps it a moment, then it finds its way back to its
    // spot at home — see uniques.pondMs. The splash is borrowed from the rod.
    fishing.splashAt(spot);
    inventory.setUnique(id, { state: 'given', returnAt: Date.now() + CONFIG.uniques.pondMs });
    return true;
  }
  // Landing on the piece's own spot — near enough to mean "back where it
  // goes" — is the no-spot exit by another door: the same tap that would lay
  // it flat an arm's length further along stands it back into its arranged
  // stance instead. This is the one way a knocked-over sasumata gets its
  // wall back, and it is deliberately the same gesture as every other
  // set-down rather than a verb of its own; see uniques.snap for the radius,
  // and the same dot-against-cosine the reach gate uses for the test.
  if (spot && loose.home
      && spot.dot(loose.home) > Math.cos(CONFIG.uniques.snap / CONFIG.globe.radius)) {
    spot = null;
  }
  if (spot) {
    // NOT INSIDE ANYTHING, and this is the tap catching up with the button.
    //
    // 「おく」 has always refused a spot inside a trunk or a wall — see
    // canPlaceAt, which asks `inSolid` with the feet at infinity so that only
    // the TOPLESS solids say no and a table stays somewhere to put things. The
    // tap never asked at all: it took whatever `pickGround` returned, so aiming
    // at the grass at the foot of a tree laid the bear inside the bark. Two ways
    // of doing one thing, disagreeing about where a thing may be — which is the
    // arrangement this codebase spends most of its comments avoiding.
    //
    // SLID RATHER THAN REFUSED, which is where it parts company with the button.
    // A button pressed with nowhere to go can shake its head and say so; a tap
    // is a place you pointed at, and answering it with nothing is indisting-
    // uishable from a tap that missed. `keepOffSolids` puts it on the nearest
    // ground outside — the same move a walk's destination gets — so the piece
    // lands beside the trunk you aimed at, which is what you meant.
    //
    // THE FEET AT INFINITY, exactly as canPlaceAt asks it, and that argument is
    // the whole reason this does not break setting things on tables: a solid
    // with a `top` is skipped, so a stump and a table remain somewhere to put a
    // thing rather than something to be pushed off, and the perch below still
    // finds them. Only the topless solids — the trunks and the walls — eject.
    //
    // `PLACE.keep` rather than a number of its own, because the margin a set-
    // down keeps off a trunk is not two decisions. Sharing it is what makes the
    // tap and the button agree, which is the point of the whole paragraph.
    //
    // The pond and the home-snap above have already had their say, so what
    // reaches here is an ordinary set-down on ordinary ground.
    keepOffSolids(spot, PLACE.keep, null, 1e9);
    // ...and off the other pieces, which nothing has ever tested. Two toys set
    // down on one patch of floor stood inside each other; now the second is put
    // beside the first, at exactly the distance the shove would settle them at —
    // see keepOffLoose, which takes no margin of its own for that reason.
    globe.keepOffLoose(spot, loose);
    // Anything with a top under this spot — out of doors that is a stump's cut
    // face, and it is the only place a set-down piece can be badly set down.
    const perch = perchUnder(spot, 1e9);
    inventory.setUnique(id, { state: 'placed', dir: [spot.x, spot.y, spot.z] });
    // FACING ITS PLACER — the direction from the spot back to where you are
    // stood, as a tangent, decided HERE and only here because this is the one
    // frame that knows there was a placer at all. placeLoose remembers it for
    // every re-place that follows (the topple's little steps included), so it
    // is computed once per set-down, not once per frame. A piece put down at
    // your own feet has no "toward you" — the projection collapses — and
    // falls back to its authored facing, which is also what already happens
    // to everything set down by a timer instead of a hand.
    _faceBack.copy(rig.anchor).addScaledVector(spot, -rig.anchor.dot(spot));
    const toward = _faceBack.lengthSq() > 1e-9 ? _faceBack.normalize() : null;
    globe.placeLoose(loose, spot, toward);
    // ...unless it went and STOOD ITSELF against a wall, in which case it is
    // not at the tapped spot any more and what was under that spot is a fact
    // about somewhere else. Perching a propped piece would lift it off the
    // floor by the height of a table it is nowhere near, and then measure it
    // against that table's rim for a topple it cannot have. See propFor.
    if (perch && loose.propAt === null) {
      loose.anchor.position.addScaledVector(spot, perch.top);
      const arc = Math.acos(Math.max(-1, Math.min(1, spot.dot(perch.dir))));
      const edge = perch.topR !== undefined ? perch.topR : perch.r;
      // ALREADY TAKEN, which is the other way a set-down on a surface can go
      // wrong and the only one the rim test could never catch: a stump has room
      // for one bear, and the second was being stood in the first.
      //
      // It goes over rather than being refused, and the choice is the same one
      // the rim makes. A refusal is a tap that did nothing, and the piece is in
      // your hands with no way to find out why; a topple is an ANSWER — you get
      // to watch it wobble and fall off, which says "there is something there"
      // far better than a shake of the head, and leaves the piece somewhere you
      // can pick it up again. The comedy is the error message.
      //
      // Ordered so the rim keeps its say when both are true: a piece set on a
      // taken perch AND out at its edge topples for whichever reason, and the
      // one it reports does not matter because the outcome is identical.
      const taken = globe.looseOnPerch(perch, loose);
      if (taken || arc > edge * CONFIG.uniques.perch) startTopple(id, spot, perch);
    }
  } else {
    inventory.setUnique(id, { state: 'home' });
    globe.placeLoose(loose, null);
  }
  return true;
}

// ころん. NOT physics, and the reasoning is the same one the reflections and
// the water settled: a rigid-body engine would cost a wasm dependency for two
// objects, need gravity aimed at a planet's core, want collision geometry for
// a world that deliberately has none, and come to rest somewhere slightly
// different on every device — which is unsaveable. What anybody actually wants
// from "it fell off the edge" is the comedy beat, and a beat is authored.
//
// Four numbers and a curve: wobble on the spot (the telegraph — you get to see
// that you pushed your luck), tip over the rim, drop, land upright. In this art
// style it reads better than tumbling would, the same way a flipped card reads
// better than a mirror.
let topple = null;

function startTopple(id, spot, perch) {
  // Which way it goes: outward from the perch's middle, in the tangent plane
  // at the piece — so it falls the way it was overhanging rather than in some
  // direction chosen for it.
  const out = spot.clone().addScaledVector(perch.dir, -spot.dot(perch.dir));
  if (out.lengthSq() < 1e-12) return;
  out.normalize();
  const step = (perch.topR !== undefined ? perch.topR : perch.r) * 1.15;
  const land = spot.clone().multiplyScalar(Math.cos(step))
    .addScaledVector(out, Math.sin(step)).normalize();
  topple = { id, at: performance.now(), from: spot.clone(), to: land, out, top: perch.top };
}

const _topAxis = new THREE.Vector3();
const _topQ = new THREE.Quaternion();
const _topAt = new THREE.Vector3();

function tickTopple(now) {
  if (!topple) return;
  const u = CONFIG.uniques;
  const loose = uniqueByItem(topple.id);
  if (!loose) { topple = null; return; }
  // CAUGHT. The wobble is a telegraph, and a telegraph you can act on is one
  // somebody WILL act on — 420ms of a thing shaking on a rim is an invitation to
  // grab it, and grabbing it has to end the fall.
  //
  // Without this the script ran to completion over a piece that was already in
  // your hand, and the landing is what did the damage rather than the fall: it
  // writes `placed` at the spot the piece would have come to rest, which empties
  // the hand — and syncPouch, finding a piece still marked carried that is no
  // longer the held one, does the one thing that means: it stows it. So the
  // inventory said the lamp was lying on the floor, the world had it stowed with
  // its anchor hidden, and it was in neither place. Gone for the session, because
  // nothing reconciles a placed piece back out of the pack — see tickUniques,
  // which deliberately remembers only what is IN the pack.
  //
  // Asked of the WORLD rather than of the hand, and that is the whole of why it
  // is one test: there are four ways a toppling piece can stop being on the floor
  // — into your hand, into the pack, given to a friend, dropped in the pond — and
  // every one of them leaves `state` something other than 'world'. A check
  // against `heldUnique` would have covered the first and quietly kept this bug
  // for the other three.
  if (loose.state !== 'world') { topple = null; return; }
  const ms = now - topple.at;

  if (ms < u.wobbleMs) {
    const t = ms / u.wobbleMs;
    globe.placeLoose(loose, topple.from);
    loose.anchor.position.addScaledVector(topple.from, topple.top);
    _topAxis.crossVectors(topple.from, topple.out).normalize();
    _topQ.setFromAxisAngle(_topAxis, Math.sin(t * Math.PI * 5) * 0.17 * t);
    loose.anchor.quaternion.premultiply(_topQ);
    return;
  }

  const t = Math.min(1, (ms - u.wobbleMs) / u.fallMs);
  if (t >= 1) {
    globe.placeLoose(loose, topple.to);
    inventory.setUnique(topple.id, {
      state: 'placed', dir: [topple.to.x, topple.to.y, topple.to.z],
    });
    topple = null;
    return;
  }
  // Out and down together, turning a quarter over and back upright as it
  // arrives — the arc a toy makes off a shelf, which is a topple and not a
  // tumble. The last sliver is a single small overshoot, which is the bounce.
  _topAt.copy(topple.from).lerp(topple.to, t * t).normalize();
  const bounce = t > 0.86 ? Math.sin((t - 0.86) / 0.14 * Math.PI) * 0.06 : 0;
  globe.placeLoose(loose, _topAt);
  loose.anchor.position.addScaledVector(_topAt, topple.top * (1 - t * t) + bounce);
  _topAxis.crossVectors(_topAt, topple.out).normalize();
  _topQ.setFromAxisAngle(_topAxis, Math.sin(t * Math.PI) * 1.15);
  loose.anchor.quaternion.premultiply(_topQ);
}

// A tap, while carrying, resolved to somewhere the piece could go. True when
// it was set down; false leaves the tap to mean whatever it would have meant.
//
// SURFACES BEFORE GROUND. A perch — a stump's cut face out of doors, the table
// indoors — is asked for first, because picking against the globe cannot answer
// a tap on a stump at all: the ray goes straight past the wood and lands on the
// grass behind it, measured at 0.81 units beyond the stump when the cap itself
// was dead under the cursor. See perchAlongRay in sphere.js.
//
// Only while carrying. A perch is a place to put a thing rather than a place to
// walk, and resolving every tap against tops would have you strolling at stumps.
//
// SOMETHING PICKED OFF THE GROUND GOES TO THE POUCH AND STAYS THERE. It used to
// land in your hand as well when the hand was free, on the reasoning that the
// natural next thing to do with a thing you just found is show it to somebody —
// which is true, and was still the wrong default, because a full hand is a
// STATE: it puts しまう in the action stack and keeps it there until you press
// it. Every mushroom you walked past left a button behind. Picking flowers is
// the commonest thing there is to do here and it should cost nothing on screen;
// showing somebody a flower is the rarer intention, and it is one tap away in
// the pouch. The rod keeps the old arrival for its catch — see onCatch — because
// landing a fish IS the moment worth holding up.
function takeItem(id) {
  // A FULL PACK REFUSES, and the caller has to hear it: `pickMushroom` and
  // `pluckTuft` have already taken the thing out of the world by the time this
  // runs, so a silent failure here would be an item deleted rather than
  // carried. Both put it straight back — see the tap handler.
  if (!inventory.add(id)) return false;
  // Anything the 図鑑 keeps a record of is recorded here, at the moment it is
  // found. Fish are tallied by the rod instead, because a fish can be landed
  // and still not kept — see onCatch — and a mushroom cannot: if it went in the
  // pack, you found it.
  if (ITEMS[id].cover) inventory.tally(id);
  return true;
}

function putDownWhereTapped(rc, e) {
  const perch = globe.pickPerch(rc);
  const spot = perch ? perch.dir : globe.pickGround(rc);
  if (!spot) return false;
  if (rig.anchor.dot(spot) <= Math.cos(CONFIG.uniques.reach / CONFIG.globe.radius)) {
    // Out of arm's reach. Nothing happens, and the tap is spent: pointing at
    // somewhere you cannot reach is still pointing at a place to put it, so
    // falling through to the house behind it would be answering a different
    // question from the one asked.
    return true;
  }
  putDownUnique(spot);
  return true;
}

// Lend the held unique to a friend. The same warmth as a stackable gift —
// same buckets, same per-friend tier — but nothing is consumed: the piece is
// theirs for uniques.returnMs and then home.
function lendUnique(bot, now) {
  const id = inventory.heldUnique;
  if (!id) return false;
  const key = bot.spec.key;
  const again = Date.now() - inventory.lastGiven(key) < CONFIG.social.giftCooldown;
  if (!again) inventory.markGiven(key);
  // `to` is what turns a loan from bookkeeping into something you can watch —
  // see carryLent. Without it the piece simply vanished, which is a strange way
  // to be given a bear.
  //
  // NO `returnAt`, and its absence is the flag rather than an oversight: a lent
  // piece stays lent until you ask for it back. `tickUniques` sends home only
  // what carries a clock, which after this is only what the pond swallowed —
  // see the note at uniques.pondMs for why one kept its timer and the other
  // did not.
  inventory.setUnique(id, { state: 'given', to: key });
  speak(bot, again ? 'giftAgain' : 'gift', now);
  return true;
}

// A lent piece is CARRIED by whoever has it — in their hands, on their card,
// hopping when they hop. See Character.holdPiece for how that is hung.
//
// It used to stand on the ground beside them and be re-placed every frame,
// which was the honest thing to do before a character had anywhere to put a
// thing: `besideArc` off to one side, because at their own direction the bear
// stood INSIDE the drawing. What that bought was a loan you could see and a bear
// that walked itself around the planet a stride behind its keeper, never quite
// belonging to them. Handing it over is the difference between somebody having
// your bear and somebody holding it.
//
// The world's own piece still goes where they are, and that is not left over
// from the old arrangement — it is the entire reason this is not simply a
// parenting call. The anchor is what a LAMP's light hangs off, so a lantern lent
// at dusk has to keep lighting the grass around whoever is carrying it. So:
// hidden in the world (`carryLoose`), stood at their feet (`placeLoose`), and
// the copy in their hands is what you actually see. It is the same two-step
// syncPouch does for your own hands, for the same reason.
//
// A piece in the pond has no `to` and is left hidden, which is right — it sank.

// Who has already been given something to hold this frame. A character has one
// pair of hands, so a second thing lent to the same friend rides along with the
// first — its light follows them, its body stays hidden — rather than the two
// fighting over the same grip. Cleared and refilled rather than rebuilt, because
// this runs every frame.
const _handsFull = new Set();

function carryLent() {
  _handsFull.clear();
  // `for...in` rather than Object.keys, which allocated an array of ids on every
  // frame of every session for a table that is usually empty.
  for (const id in inventory.uniques) {
    const rec = inventory.uniques[id];
    if (rec.state !== 'given' || !rec.to) continue;
    const bot = botByKey.get(rec.to);
    const loose = uniqueByItem(id);
    if (!bot || !loose) continue;
    // Carried FIRST, then moved — placeLoose leaves a carried piece carried, so
    // this order is what stops the walk over their feet from standing the piece
    // back up on the ground under them on every frame.
    globe.carryLoose(loose);
    globe.placeLoose(loose, bot.ch.dir);
    if (_handsFull.has(rec.to)) continue;
    _handsFull.add(rec.to);
    bot.ch.holdPiece(carriedPiece(id), CARRY[ITEMS[id].art]);
  }
  // ...and everybody else is empty-handed. Reconciled from the world every frame
  // rather than on the event that ends a loan, because there are several of
  // those — the timer, a reload, a piece fished out of a pond — and a hand left
  // full by the one that forgot would hold a bear that had gone home.
  for (const bot of bots) {
    if (!_handsFull.has(bot.spec.key)) bot.ch.dropPiece();
  }
}

// Pond-swallowed pieces coming home, checked coarsely — a return is a
// minutes-scale event and nobody is watching the exact second.
//
// IT USED TO BRING LENT PIECES HOME TOO, on the ninety-second clock lendUnique
// no longer sets. What decides now is whether a record carries a `returnAt` at
// all: something under the water has one because there is nobody to ask for it
// back, and something in a friend's hands does not, because there is. See
// uniques.pondMs.
//
// Written as a presence test rather than as `rec.to === undefined` on purpose.
// The question this is really asking is "is this one on a clock", and asking it
// of the clock keeps a future state that wants a timer working without editing
// this line.
let uniquesTickAt = 0;
function tickUniques(now) {
  if (now < uniquesTickAt) return;
  uniquesTickAt = now + 1500;
  for (const id of Object.keys(inventory.uniques)) {
    const rec = inventory.unique(id);
    if (rec.state === 'given' && rec.returnAt !== undefined && Date.now() >= rec.returnAt) {
      inventory.setUnique(id, { state: 'home' });
      globe.placeLoose(uniqueByItem(id), null);
    }
    // A shove used to be written back to the save here, so a nudged bear
    // stayed nudged across a reload. It is gone with the rest of the world's
    // memory: v2 saves the PACK and not the MAP, so where a placed piece has
    // drifted to is a fact about this session only. It still drifts, and it
    // still stays where it drifted to until you leave.
  }
}

// The world made to match the save, once, at boot.
//
// It has almost nothing to do now, and that is the point of v2: the only
// unique the save remembers is one IN YOUR PACK, so the only thing the world
// has to be told is to take those off their shelves. Everything else — a bear
// left on a stump, one lent to Usagi at bedtime — is simply not written down,
// so it starts the session at home, and the map is pristine every time you
// open the app. See _save in items.js.
for (const id of Object.keys(inventory.uniques)) {
  const loose = uniqueByItem(id);
  // STOWED, not merely hidden. A remembered unique is one in your pack, which
  // is to say nowhere in the world — and if it happens to be the lamp, a world
  // that only hid it would go on being lit by it from wherever it was last
  // stood. See stowLoose.
  if (loose) globe.stowLoose(loose);
}

// Turns the current camera finger, plus this new one, into a zoom.
function startPinch() {
  const ids = [...pointers.keys()].filter((id) => !moves.owns(id));
  if (ids.length < 2) return;
  clearLook();
  pinch.a = ids[ids.length - 2];
  pinch.b = ids[ids.length - 1];
  pinch.start = gapBetween(pinch.a, pinch.b);
  midOf(pinch);
}

// Where the pinch's two fingers are between them. Written into the pinch itself
// rather than returned, because both readers want the PREVIOUS value as much as
// the new one — a pan is a difference, and the only place that difference can be
// taken is where the old midpoint still exists.
function midOf(p) {
  const pa = pointers.get(p.a);
  const pb = pointers.get(p.b);
  if (!pa || !pb) return;
  p.midX = (pa.x + pb.x) / 2;
  p.midY = (pa.y + pb.y) / 2;
}

function onDown(e) {
  if (!started) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  touched();
  capture(stage, e.pointerId);

  setNdc(e);
  const hit = pickCharacter();

  // A character under the finger takes the touch away from the pad, so you can
  // always reach someone standing in the pad's corner. Dragging from them
  // still looks around — it is the tap that goes to visit.
  if (hit && look.id === null && pinch.a === null) {
    look.id = e.pointerId;
    look.mode = 'orbit';
    look.ch = hit.ch;
    look.lastX = e.clientX;
    look.lastY = e.clientY;
    look.travel = 0;
    return;
  }

  // A reachable loose piece under the finger. The pad owns the whole lower-left
  // quadrant, which is precisely where something on the floor at your feet
  // projects — so the two want the same touch and one of them has to give.
  const grabbable = (!hit && rig.isFirstPerson && !inventory.heldUnique)
    ? globe.pickLoose(raycaster, rig.anchor, UNIQUE_ARTS) : null;

  // The movement pad: one at a time, on foot, in its corner, on empty ground.
  //
  // IT NO LONGER GIVES THAT CORNER UP. It used to: a grabbable piece took the
  // touch away from the pad outright, so that the thing you were standing over
  // was not the one thing you could never pick up. That was the right aim and
  // the wrong trade, and setting a lamp down showed why — a piece PUT at your
  // feet stays at your feet, so it sat in the pad's corner and swallowed the
  // stick for as long as it was there. You could not walk away from the thing,
  // which meant you could not walk away from the bug either.
  //
  // So the pad takes the touch and the DECISION MOVES TO THE RELEASE, which is
  // the same bargain a character already strikes a few lines up: drag to use
  // the stick, let go without pushing to pick the thing up. A press that turns
  // into a walk was never a grab, and a press that never moved was never a
  // walk, so nothing has to be guessed at the moment the finger lands.
  if (!hit && moves.claim(e, grabbable)) return;

  // First camera finger looks. A second one is a pinch — and either way the
  // pad carries on underneath.
  if (look.id === null && pinch.a === null) {
    look.id = e.pointerId;
    look.mode = 'orbit';
    look.ch = null;
    look.lastX = e.clientX;
    look.lastY = e.clientY;
    look.travel = 0;
    return;
  }
  startPinch();
}

function onMove(e) {
  const p = pointers.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }

  if (pinch.a !== null && (e.pointerId === pinch.a || e.pointerId === pinch.b)) {
    const d = gapBetween(pinch.a, pinch.b);
    if (pinch.start > 0 && d > 0) {
      // Indoors too. It was refused under the roof for a while, on the honest
      // grounds that the lift had nowhere to go but through the ceiling — the
      // floor of flight was a fixed 2.6 against an apex of 3.2, so it stopped
      // the camera inside the dome. Both halves of that are fixed now: the
      // floor of flight clears whatever roof is overhead (see zoomBy) and the
      // shell lifts off while you are above it (see Globe.update), so pinching
      // out of your own house rises through an opening roof into the sky.
      // A PINCH MEANS TWO DIFFERENT THINGS, and in the selfie view it must not
      // mean this one. `dolly` drives the ALTITUDE climb, so a pinch while the
      // lens was turned round took you off the ground — which trips the
      // airborne rule and drops the selfie into the far view. Framing a shot
      // and being thrown into orbit is the least expected answer a gesture
      // could give.
      //
      // Reassigned rather than swallowed: the fingers are already saying
      // "nearer" or "further", and in a camera view that is the zoom.
      if (rig.selfieOn) rig.selfieZoom(pinch.start / d);
      else rig.dolly(pinch.start / d);
      pinch.start = d;
    }
    // ...and the OTHER half of the same gesture. Two fingers travelling together
    // keep the gap constant and so say nothing to the zoom above; what they move
    // is the point between them, and in the selfie that slides the lens round
    // you. One gesture, two meanings, neither costing the other anything — which
    // is why the pan went here rather than onto a third finger nobody has.
    //
    // Sideways only. The lens already rises and falls with the one-finger drag,
    // and a second height control would be two knobs fighting over one number.
    if (rig.selfieOn) {
      const mx = pinch.midX;
      midOf(pinch);
      rig.selfiePan(pinch.midX - mx);
    }
    return;
  }

  if (moves.owns(e.pointerId)) {
    moves.drag(e);
    return;
  }

  if (e.pointerId !== look.id) return;

  const dx = e.clientX - look.lastX;
  const dy = e.clientY - look.lastY;
  look.travel += Math.hypot(dx, dy);
  look.lastX = e.clientX;
  look.lastY = e.clientY;

  if (look.mode === 'orbit') {
    rig.applyDrag(dx, dy);
    rig.markTouched(performance.now());
  }
}

// A tap on open ground: stroll over to it. Only on foot — from the sky a tap
// is for picking a character, not for landing somewhere. The floor of the
// house is open ground like any other now: a tap through the door walks you
// through the door, because the destination is honest and the wall's gap is
// where the walk's own sliding finds a way in.
//
// TWO taps, close together in time and place, are also a hop — see rig.hop.
// The window never delays the first tap: its walk has already started by the
// time the second arrives, and it is kept running, so a double tap reads as
// "hop over there" rather than as the app waiting to see what you meant.
// Detected here rather than in the pointer routing because this is the one
// funnel every open-ground tap comes through — the camera finger's and the
// pad corner's alike — and a gesture split across two detectors is a gesture
// that works from one thumb and not the other.
// `tapToWalk` stood here, and with it the double-tap hop. Both are gone, and
// the reason is a grammar rather than a preference.
//
// A tap used to mean two unrelated things at once: WALK THERE, and DO THE
// THING UNDER MY FINGER. Those two cannot share a gesture, because the second
// only fires when you hit something and the first fires when you miss — so
// every near-miss on a tuft of grass silently became a stroll, and the way you
// found out you had missed was that your feet moved. It reads as the game
// ignoring you, which is the worst thing a tap can do.
//
// The stick already moves you, completely and better. So a tap means exactly
// one thing now — POINT AT SOMETHING — and if it points at nothing, nothing
// happens, which is the honest answer. What used to be a tap's second meaning
// is a button: see the action pill.
//
// The double-tap hop goes for the same reason, and its verb is not lost — the
// jump button has always been there beside the stick, which is where a verb
// belongs.

// The hop is seen, and answered. Everyone near enough answers, not the
// nearest — two friends bouncing back at once is the whole charm — and the
// beat before each answer is rolled per character, so a pair of them never
// move as one drilled unit. Through a wall nobody answers: a hop is a wave,
// and you cannot see a wave from the other side of the masonry.
//
// Nobody is asked to be free first. A character mid-stroll answering with a
// bounce reads as a skip in their step; one mid-conversation bounces exactly
// the way the talk bob already has them bouncing. Gating on either would make
// the answer rare, and a wave that mostly goes unanswered teaches you to stop
// waving.
function hopSeen() {
  const s = CONFIG.social;
  for (const b of bots) {
    // A hop is a wave, and you cannot see one through masonry — nor answer one
    // in your sleep. `hopBack` is a lift on the BODY card, which a sleeper is
    // not being drawn as, so without this the answer would be an invisible
    // bounce nobody could see and a friend who is meant to be out cold.
    if (!b.ch.isVisible || throughWall(b.ch)) continue;
    if (arcBetween(b.ch.dir, rig.anchor) > s.hopArc) continue;
    b.ch.hopBack(s.hopReplyMs + Math.random() * s.hopReplySpreadMs);
  }
}

// --- the house
//
// There is no enterHouse and no leaveHouse, because entering and leaving are
// not operations: the doorway is a hole in the wall, and you walk through it
// the way you walk anywhere.
//
// AND THERE IS NO goToHouse EITHER, NOW. A tap on a building used to mean "take
// me to it" — set down on the doorstep facing the open door, the arrival a tap
// on a character gets. It is gone, with `pickHouse`, `nearestHome` and the rig's
// `glideTo` along with it, because between them they were the last of it.
//
// It was a map gesture on a world that had stopped being read as a map. Walking
// is the only way anybody moves here now: the stick took over from tap-to-walk,
// the far view is somewhere you go rather than somewhere you point at, and a
// teleport that skipped the walk skipped the part of this game that IS the game.
// It also could not be aimed — a building is a whole dome to a raycast, so the
// tap target was the entire hillside for the cave, and every attempt to trim
// that was a threshold picking at a symptom.
//
// What is left is what a house on a hillside should be: a thing you can see from
// a way off and walk to. Taps on it fall through to the ground beneath, which is
// what taps on any other scenery already did.

// Take a loose piece into the hand.
//
// Shared, because two different gestures now mean it and they must not drift:
// a tap out in the world, and a tap on the pad's own corner — which is where
// anything lying at your feet appears. See the pad's `grab`.
function takeLoose(loose) {
  const id = loose.item || Object.keys(ITEMS).find((k) => ITEMS[k].art === loose.art);
  if (!id) return;
  // The hand is one hand: a held card goes back in the pouch first.
  inventory.putAway();
  inventory.setUnique(id, { state: 'hand' });
}

function onUp(e) {
  pointers.delete(e.pointerId);
  const now = performance.now();

  if (e.pointerId === pinch.a || e.pointerId === pinch.b) {
    pinch.a = null;
    pinch.b = null;
    pinch.start = 0;
    social.lastTouchAt = now;
    rig.markTouched(now);
    return;
  }

  if (moves.owns(e.pointerId)) {
    // A tap in the corner with no push used to mean "walk over there". It
    // means nothing now: the stick is for walking and a tap is for pointing,
    // and the pad's corner is the one place a tap could never have been
    // pointing at anything anyway.
    //
    // With ONE exception, and it is the reason the pad keeps a `grab`: a thing
    // lying at your feet is pointing at something, and the pad's corner is
    // exactly where it appears. Let go without having pushed the stick and the
    // press was a tap on that; push the stick and it was a walk, and the piece
    // is still there to be tapped when you come back. `release` is what decides
    // which of the two it was, and hands back the piece only for a tap.
    const grab = moves.release();
    if (grab) takeLoose(grab);
    social.lastTouchAt = now;
    rig.markTouched(now);
    return;
  }

  if (e.pointerId !== look.id) return;

  // A tap rather than a look: go and see them, or stroll to the spot.
  if (look.travel < CONFIG.player.tapSlop) {
    // The rod is worked from the action button now — 「あげる!」 on a bite,
    // 「やめる」 otherwise — so a tap no longer strikes or reels. That is the
    // point of the button: the strike is the one moment in this game with a
    // deadline, and it should be a thing you press rather than a place you
    // have to hit.
    //
    // A tap on a FRIEND still reels in first, because a person beats a pastime
    // everywhere on this planet.
    if (fishing.active && look.ch) fishing.cancel();
    if (look.ch) {
      const ch = look.ch;
      const bot = byChar.get(ch);
      const wasAlreadyHere = rig.focus === ch && rig.onGround;
      rig.teleportTo(ch);

      // Landing beside somebody counts as having greeted them. teleportTo sets
      // you down at MEET_ARC and greetArc IS MEET_ARC, so the walk-up greeting
      // fires the instant you arrive — which is exactly what this suppresses,
      // since a tap has already been answered by the 「greet」 below. Without it
      // you are welcomed twice, a few seconds apart, having done one thing.
      //
      // The two used to sit a couple of inches either side of each other and it
      // made no difference: one pace forward tripped it just the same. The bug
      // never depended on which side of the line the standoff was.
      social.greetedKey = bot.spec.key;
      social.greetCooldownUntil = now + CONFIG.social.greetCooldown;

      // A TAP IS A VISIT, WHATEVER YOU ARE CARRYING.
      //
      // It used to be a delivery instead whenever your hands were full — a
      // carried unique was lent, a stackable given outright — on the reasoning
      // that the item changes what the gesture means. It does, and that was
      // still the wrong place to read it. The same tap is how you WALK OVER to
      // somebody, so going to see a friend while carrying a fish handed them the
      // fish: an irreversible act, chosen by nothing you did, on the one gesture
      // that had no other way to be spelled. And it worked the other way too —
      // while you carried anything, no tap could simply say hello, because the
      // delivery always answered first.
      //
      // Handing something over is 「わたす」 now, and lending is 「かす」 — see
      // handToMate. Both are pills, both say what they will do and to whom, and
      // both are pressed on purpose. The tap goes back to meaning the one thing
      // it always meant: go and see them.
      pokeBack(bot, wasAlreadyHere ? 'poke' : 'greet', now);
    } else {
      // THREE THINGS A TAP ON THE WORLD CAN MEAN, and they used to be four: the
      // building took the tap ahead of everything under it and walked you to its
      // door. That is gone — see the note where goToHouse was — so a tap on a
      // wall now means whatever a tap on the ground behind it means, which is
      // usually nothing, which is the honest answer.
      setNdc(e);
      // SOMEBODY ASLEEP under the finger, before anything else a tap could
      // mean. A person beats a pastime everywhere on this planet, the friend
      // branch above says, and one who has gone to bed is still a person —
      // they have simply stopped being pickCharacter's business, because what
      // is drawn where they are is a card lying in the bedding.
      //
      // AND THEY DO NOT WAKE. That is the whole of the interaction and it is
      // the point of it: at the one hour of the day when nobody can answer
      // you, the world is still worth touching, and what it gives back is a
      // mumble and nothing else. No visit, no walking over, no expression —
      // the face is painted into the drawing and the drawing does not change.
      const dozer = globe.sleeperAt(raycaster);
      const grab = (!dozer && rig.isFirstPerson && !inventory.heldUnique)
        ? globe.pickLoose(raycaster, rig.anchor, UNIQUE_ARTS) : null;
      if (dozer) {
        const bot = bots.find((b) => b.spec.key === dozer);
        // `dozing` is a bucket a bank may not have, and the fallback is the
        // same half-drawn courtesy everything else here gets: somebody with no
        // sleep-talk written for them simply sleeps quietly.
        if (bot && bot.dlg.has('dozing')) pokeBack(bot, 'dozing', now);
      } else if (grab) {
        takeLoose(grab);
      } else if (rig.isFirstPerson && inventory.heldUnique
        && putDownWhereTapped(raycaster, e)) {
        // Putting something down, which only happens while you are carrying one
        // and only where the spot is genuinely in reach — putDownWhereTapped
        // says no otherwise and the tap falls through to the ground.
      } else if (rig.isFirstPerson) {
        // A tuft or a mushroom under the finger comes up. Nothing else happens:
        // a tap that lands on bare grass is a tap that pointed at nothing, and
        // the honest answer to that is nothing.
        //
        // Mushrooms BEFORE tufts, because there is grass everywhere and twenty
        // mushrooms on the planet — with the tuft first, the blades growing
        // around a mushroom would answer the tap most of the time and the
        // mushroom would be nearly unpickable.
        //
        // A FULL PACK PUTS IT BACK. Both pickers remove the thing from the
        // world as they answer, so refusing after the fact has to undo that —
        // otherwise a full pack would quietly destroy whatever you tapped.
        const spot = globe.pickGround(raycaster);
        const picked = spot && globe.pickMushroom(spot, rig.anchor);
        if (picked) {
          if (!takeItem(picked)) globe.restoreMushroom();
        } else if (spot && globe.pluckTuft(spot, rig.anchor)) {
          if (!takeItem('kusa')) globe.restoreTuft();
        }
      }
    }
  }

  clearLook();
  social.lastTouchAt = now;
  rig.markTouched(now);
}

stage.addEventListener('pointerdown', onDown);
stage.addEventListener('pointermove', onMove);
stage.addEventListener('pointerup', onUp);
stage.addEventListener('pointercancel', onUp);

document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Not for the phone, but pinching is awkward in a desktop device emulator and
// there is no other way to get off the ground while developing.
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  // The wheel is the pinch's desktop twin and has to be reassigned with it, or
  // a scroll while framing a shot would climb into the sky and take the selfie
  // down with it. Same ratio, same direction — away from you is further out.
  const f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
  if (rig.selfieOn) rig.selfieZoom(f);
  else rig.dolly(f);
  rig.markTouched(performance.now());
}, { passive: false });

window.addEventListener('resize', () => globe.resize());
window.addEventListener('orientationchange', () => {
  setTimeout(() => { globe.resize(); rig.recentreGyro(); }, 120);
});

// --- on-screen controls
// These are real DOM buttons sitting over the canvas, so a press lands on the
// button and never reaches the stage's pointer handlers.
const controls = document.getElementById('controls');
const viewToggle = document.getElementById('view-toggle');
const selfieToggle = document.getElementById('selfie-toggle');
const selfieCap = document.getElementById('selfie-cap');
const shotBtn = document.getElementById('shot-btn');
const stickEl = document.getElementById('stick');
const actionsEl = document.getElementById('actions');
const shotFlash = document.getElementById('shot-flash');
const poseBar = document.getElementById('pose-bar');
const poseWrap = document.getElementById('pose-wrap');
const poseToggle = document.getElementById('pose-toggle');
const poseCap = document.getElementById('pose-cap');
const unlockNote = document.getElementById('unlock');

// WHAT YOUR FACE MAY DO FOR A PICTURE.
//
// Four, and four is the number rather than the six `EXPRESSIONS` has. `sleepy`
// and `worried` are things that HAPPEN to somebody; nobody chooses them for a
// photograph, and a row of six with two nobody presses is a worse row than one
// of four that all earn their place.
//
// The first is 「おまかせ」 and is not a face at all — it is the app deciding,
// which is what it did before there was a picker: pleased while somebody's hand
// is in yours, resting otherwise. Keeping it as the DEFAULT entry means the
// picker adds a choice without taking the old behaviour away from anybody who
// never opens it.
const POSES = [
  { key: null, word: 'おまかせ' },
  { key: 'normal', word: 'すまし' },
  { key: 'happy', word: 'にっこり' },
  { key: 'delight', word: 'だいすき' },
  { key: 'surprise', word: 'びっくり' },
];

// Which one is pressed, or null for おまかせ. Cleared when the view is turned
// off, so a pose is something you strike for a shot rather than a mood you
// leave your body wearing for the rest of the session.
let youPose = null;

for (const pose of POSES) {
  const b2 = document.createElement('button');
  b2.type = 'button';
  b2.className = 'pose-pick';
  b2.textContent = pose.word;
  b2.addEventListener('click', () => {
    youPose = pose.key;
    paintPoses();
    // ...and the drawer shuts behind the choice. A picker that stays open after
    // it has been answered is a picker sitting on top of the thing it was for —
    // and here that thing is the photograph.
    openPoses(false);
    touched();
  });
  poseBar.appendChild(b2);
}

// Open or shut, and the button remembers which so it can be pressed again.
function openPoses(open) {
  poseWrap.classList.toggle('is-open', open);
  poseToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

onPress(poseToggle, () => {
  openPoses(!poseWrap.classList.contains('is-open'));
  touched();
});

function paintPoses() {
  const kids = poseBar.children;
  for (let i = 0; i < kids.length && i < POSES.length; i++) {
    kids[i].classList.toggle('is-on', POSES[i].key === youPose);
  }
  // THE COLLAPSED BUTTON SAYS WHICH FACE IS CHOSEN, which is what the row used
  // to say by being visible. A drawer that shows nothing of its contents makes
  // you open it to find out what you already decided.
  const now = POSES.find((q) => q.key === youPose);
  const word = now ? now.word : POSES[0].word;
  if (poseCap.textContent !== word) poseCap.textContent = word;
}
paintPoses();
const viewCap = document.getElementById('view-cap');
const viewGlyph = document.getElementById('view-glyph');
// The sky chip: one reading for the hour and the weather both, and one panel
// behind it holding what used to be two.
const chipEl = document.getElementById('sky-chip');
const chipBtn = document.getElementById('chip-toggle');
const chipHour = document.getElementById('chip-hour');
const chipHourMark = document.getElementById('chip-hour-mark');
const chipSkyMark = document.getElementById('chip-sky-mark');
const timeAuto = document.getElementById('time-auto');
const timeTrack = document.getElementById('time-track');
const timeKnob = document.getElementById('time-knob');
const timeMarks = document.getElementById('time-marks');
const skyAuto = document.getElementById('sky-auto');
const skyGrid = document.getElementById('sky-grid');

function onPress(el, fn) {
  el.addEventListener('click', () => {
    fn();
    const now = performance.now();
    social.touched(now);
    rig.markTouched(now);
  });
}

// --- pouch controls
//
// The pill is two verbs in one button: with an empty hand it opens the pouch,
// with a full one it puts the item away. Which it is doing is written on it,
// so there is no state to remember — the button says what pressing it does.
const pouchEl = document.getElementById('pouch');
const pouchBtn = document.getElementById('pouch-toggle');

const sheetEl = document.getElementById('sheet');
const sheetCard = document.getElementById('sheet-card');
const tabPack = document.getElementById('tab-pack');
const tabZukan = document.getElementById('tab-zukan');
const sheetBody = document.getElementById('sheet-body');
const sheetCap = document.getElementById('sheet-cap');
const dropBtn = document.getElementById('sheet-drop');
const countRow = document.getElementById('sheet-count');
const countN = document.getElementById('count-n');

// 'pack', 'zukan', or null. One card serves both — see index.html for why.
let sheetMode = null;
// The slot the bin is waiting on an amount for, or null. Declared up here with
// the rest of the sheet's state because openSheet clears it, and a `let` further
// down the file would still be in its dead zone when it does.
let askN = null;
// How many of that stack. Back to one every time the question is asked:
// 「すてる ９こ」 is not something anybody wants to press twice by accident
// because the last stack happened to be big.
let dropN = 1;
// The drag in progress. One finger at a time, so these are single values rather
// than state per slot: `press` from the moment a tile is touched, `dragFrom`
// only once the slip threshold has been passed — which is the whole of what
// separates a tap from a carry. Up here for the same dead-zone reason as above,
// since openSheet cancels a drag in flight.
let press = null;
let dragFrom = null;
let ghost = null;
let overEl = null;

// NO TIMER, and that is the change. Both of these used to fold themselves away
// after a stretch of being ignored, borrowed from the clock panel — which is
// right for a thing you GLANCE at and wrong for the two you go INTO. A bag
// closes when you say so.
//
// `is-open` is still kept on the two wrappers, because the pills' own state and
// the drawer's hold-open rule both still ask them.
function openSheet(mode) {
  sheetMode = mode;
  sheetEl.classList.toggle('is-open', !!mode);
  pouchEl.classList.toggle('is-open', !!mode);
  // The tabs ARE the title now — see the note in index.html.
  tabPack.setAttribute('aria-selected', mode === 'pack' ? 'true' : 'false');
  tabZukan.setAttribute('aria-selected', mode === 'zukan' ? 'true' : 'false');
  if (mode) sheetCard.setAttribute('aria-label', mode === 'pack' ? 'もちもの' : 'ずかん');
  // Nothing carries across an open or a close: a drag in progress and a question
  // waiting for an answer are both only meaningful against the grid they started
  // on. cancelDrag also takes the ghost off screen, which would otherwise be
  // left floating over a closed sheet.
  cancelDrag();
  askN = null;

  if (mode === 'pack') paintPack();
  else if (mode === 'zukan') paintZukan();
  else sheetCard.classList.remove('is-moving');
}

// Kept as they were so every existing caller — the drawer folding, a slot being
// taken in hand, the world closing things behind you — reads the same as it did.
function openPouch(open) {
  if (open) openSheet('pack');
  else if (sheetMode === 'pack') openSheet(null);
}

function openZukan(open) {
  if (open) openSheet('zukan');
  else if (sheetMode === 'zukan') openSheet(null);
}

// THE PACK, drawn as its slots rather than as a list of what you own.
//
// Every slot is shown, empty ones included, because an empty slot is
// information — it is the room you have left — and a list of what you happen to
// be carrying cannot show room. Rebuilt whole on every change: eight nodes is
// cheaper to think about than diffing them, and a count badge can never go
// stale if it is never reused.
function paintPack() {
  sheetBody.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'pack-grid';
  for (let i = 0; i < SLOTS; i++) {
    const cell = inventory.slots[i];
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'pack-slot'
      + (cell ? '' : ' is-empty')
      + (cell && inventory.held === i ? ' is-held' : '')
      + (askN === i ? ' is-asking' : '');
    // The picture is decoration once the button says what it is: two readings of
    // the same thing is one too many when the second is 「あかい きのこ あかい きのこ」.
    slot.setAttribute('aria-label', cell
      ? ITEMS[cell.id].name + (cell.n > 1 ? ` ${cell.n}こ` : '')
      : 'あき');
    if (cell) {
      // Which family it is in, which the stylesheet turns into the border
      // colour. Only on filled slots: an empty one is not a kind of thing.
      slot.dataset.cat = ICON_CAT[cell.id] || '';
      const img = document.createElement('img');
      img.alt = '';
      img.src = slotIcon(cell.id);
      slot.appendChild(img);
      // The count only when there is more than one, which also means never on a
      // unique. A 「１」 on every slot is noise — the drawing already says "one
      // of these" — and on the bear it would be a stranger claim than that,
      // since being the only one is the whole of what a unique is.
      if (cell.n > 1) {
        const n = document.createElement('span');
        n.className = 'pack-n';
        n.textContent = cell.n;
        slot.appendChild(n);
      }
    }
    // Empty slots are wired up too, and are NOT disabled: an empty slot is
    // exactly where you would want to let go of the tile you are carrying, and
    // a disabled button is deaf to the press that would do it.
    armSlot(slot, i);
    grid.appendChild(slot);
  }
  sheetBody.appendChild(grid);
  showRow();
}

// --- taking things out, and moving them about
//
// A tap takes a thing in hand. A DRAG picks the tile up and carries it: let go
// over another slot to swap or pour in, or over the row at the bottom to be rid
// of it. See moveSlot in items.js for the half of that which is about the pack
// rather than about fingers.
//
// This was a long press, and the reason given for it — that dragging over a grid
// means tracking a finger across nodes it did not start on — was a weak one.
// `elementFromPoint` answers exactly that question, which is what `under()`
// below does. What the long press really cost was discoverability: it is
// invisible, so it needed a line of text to explain it, and that line lived in
// the one place that had something else to say the moment you were carrying
// anything. A drag teaches itself. It also removes the modal state that sat
// between lifting and placing, and stops two nearly identical presses on the
// same tile meaning two different things.
//
// Which of the two a press turns out to be is decided by DISTANCE, not by time:
// under the threshold it was a tap, past it it is a drag. Nothing hidden, and
// nothing to wait for.
const DRAG_SLIP = 8;

function armSlot(el, i) {
  el.addEventListener('pointerdown', (e) => {
    if (!inventory.slots[i]) return;    // nothing here to pick up
    press = { i, el, id: e.pointerId, x: e.clientX, y: e.clientY };
    // Once a drag starts the finger leaves this tile immediately, and without
    // capture the moves would go to whatever is under it instead.
    capture(el, e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId) return;
    if (dragFrom === null) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_SLIP) return;
      startDrag(press.i, press.el, e);
    }
    moveDrag(e.clientX, e.clientY);
  });

  el.addEventListener('pointerup', (e) => {
    if (!press || press.id !== e.pointerId) return;
    const from = press.i;
    press = null;
    if (dragFrom === null) { tapSlot(from); return; }
    endDrag(e.clientX, e.clientY);
  });

  el.addEventListener('pointercancel', () => { press = null; cancelDrag(); });

  // A held finger on a touchscreen is also the browser's own gesture for
  // "select this" or "show me a menu". Neither is wanted on a slot.
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// What is under the finger, as a slot index, the bin, or nothing. The ghost
// takes no pointer events, or this would only ever find the ghost.
function under(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest('#sheet-drop')) return 'bin';
  const slot = el.closest('.pack-slot');
  if (!slot || !slot.parentElement) return null;
  return [...slot.parentElement.children].indexOf(slot);
}

function startDrag(i, el, e) {
  dragFrom = i;
  askN = null;
  const cell = inventory.slots[i];
  const box = el.getBoundingClientRect();

  ghost = document.createElement('img');
  ghost.className = 'pack-ghost';
  ghost.src = slotIcon(cell.id);
  ghost.dataset.cat = ICON_CAT[cell.id] || '';
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  document.body.appendChild(ghost);

  // Marked by hand rather than by repainting the grid: a repaint would replace
  // the very node holding the pointer capture, and every move after it would go
  // somewhere else. Nothing repaints until the drag is over.
  el.classList.add('is-source');
  showRow();
  moveDrag(e.clientX, e.clientY);
}

function moveDrag(x, y) {
  ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  const hit = under(x, y);
  const next = hit === 'bin' ? dropBtn
    : (typeof hit === 'number' && hit !== dragFrom
      ? sheetBody.querySelectorAll('.pack-slot')[hit] : null);
  if (next === overEl) return;
  if (overEl) overEl.classList.remove('is-over');
  overEl = next;
  if (overEl) overEl.classList.add('is-over');
}

function endDrag(x, y) {
  const from = dragFrom;
  const hit = under(x, y);
  cancelDrag();
  if (hit === 'bin') { binDrop(from); return; }
  if (typeof hit === 'number' && hit !== from) { inventory.moveSlot(from, hit); return; }
  // Let go over nothing, or over where it started: it simply goes back. Repainted
  // because cancelDrag only undoes the drag's own marks, and a refused move
  // leaves the grid otherwise untouched.
  paintPack();
}

// Everything the drag put on screen, taken off again. Safe to call twice.
function cancelDrag() {
  if (ghost) { ghost.remove(); ghost = null; }
  if (overEl) { overEl.classList.remove('is-over'); overEl = null; }
  for (const s of sheetBody.querySelectorAll('.is-source')) s.classList.remove('is-source');
  dragFrom = null;
  showRow();
}

function tapSlot(i) {
  const now = performance.now();
  social.touched(now);
  rig.markTouched(now);

  // A pending "how many?" is answered by its own buttons; a tap anywhere else in
  // the grid is a change of mind.
  if (askN !== null) { askN = null; paintPack(); return; }

  const cell = inventory.slots[i];
  if (!cell) return;
  // Pressing the slot you are already holding puts it away — the same button
  // meaning take-out and put-back, which is how a pocket works. The sheet STAYS
  // OPEN either way now: you came in here to look at your bag, and taking one
  // thing out is not a reason to be shown the door.
  if (inventory.held === i) inventory.putAway();
  else inventory.holdSlot(i);
}

// The two lines under the grid, and the row that is a drop target while a tile
// is in the air and a question after one has landed on it.
function showRow() {
  const asking = askN !== null ? inventory.slots[askN] : null;
  const dragged = dragFrom !== null ? inventory.slots[dragFrom] : null;
  sheetCard.classList.toggle('is-moving', !!(asking || dragged));
  // The pack always keeps the row, empty or not, so the card is the same height
  // whether or not your hand is full. Only the 図鑑 gives the space back.
  sheetCap.hidden = false;

  if (asking) {
    // Landed on the bin, and there is more than one, so the only thing still
    // unanswered is how many.
    sheetCap.textContent = `${ITEMS[asking.id].name} を いくつ すてる？`;
    dropBtn.textContent = 'すてる';
    countRow.hidden = false;
    dropN = Math.min(Math.max(1, dropN), asking.n);
    countN.textContent = dropN;
  } else if (dragged) {
    // In the air. The row is somewhere to let go of it — 「おく」 puts a unique
    // down in the world, 「すてる」 lets a stackable go, two words because they
    // are two different endings, exactly as the action pill distinguishes おく
    // from しまう.
    sheetCap.textContent = ITEMS[dragged.id].name;
    dropBtn.textContent = ITEMS[dragged.id].kind === 'unique' ? 'おく' : 'すてる';
    countRow.hidden = true;
  } else {
    // Resting. What is in your hand if anything, and otherwise nothing at all —
    // except for an empty pack, which has to say so: sixteen dashed holes and no
    // words is a panel that looks broken rather than one that looks empty.
    const held = inventory.held === null ? null : inventory.slots[inventory.held];
    if (held) sheetCap.textContent = `${ITEMS[held.id].name} を もっているよ`;
    else sheetCap.textContent = inventory.slots.some(Boolean) ? '' : 'まだ なにも もっていないよ';
  }
}

// --- letting go of things

function setDropN(n) {
  const c = askN === null ? null : inventory.slots[askN];
  if (!c) return;
  dropN = Math.min(Math.max(1, n), c.n);
  countN.textContent = dropN;
}

// Dropped on the row at the bottom. Which ending that is depends on the thing
// rather than on a mode, and only one of the three needs asking about.
function binDrop(i) {
  const c = inventory.slots[i];
  if (!c) { paintPack(); return; }

  // There is one bear, so it is SET DOWN rather than destroyed — and since you
  // can walk over and pick it up again, nothing here needs confirming.
  if (ITEMS[c.id].kind === 'unique') {
    const spot = placeSpot();
    // Nose in a corner: nowhere in arm's reach on your own side of the wall. The
    // button shakes its head rather than inventing somewhere, and the tile goes
    // back to its slot so you can turn round and try again.
    if (!spot) { paintPack(); shakeDrop(); return; }
    // Into the hand first, because putDownUnique reads `heldUnique` — the one
    // exit every set-down in the app already shares, water gag and topple
    // included, which is what makes a drag out of the pack land in the world
    // exactly the way the pill's おく does.
    inventory.holdSlot(i);
    putDownUnique(spot.clone());
    // Out to look at it: a thing you have just put down is out THERE, and the
    // card would be standing in front of the result of what you did.
    openSheet(null);
    return;
  }

  // One of a kind of thing there is more of: nothing to weigh up, it just goes.
  if (c.n === 1) { inventory.discard(i, 1); return; }

  // More than one, so the amount is genuinely ambiguous and throwing them away
  // cannot be undone. The row turns into the question instead of guessing.
  askN = i;
  dropN = 1;
  paintPack();
}

// Answering the "how many?" the bin asked.
function confirmDrop() {
  if (askN === null) return;
  const i = askN;
  askN = null;
  inventory.discard(i, dropN);
  dropN = 1;
  paintPack();
}

// A refusal has to look like one; a button that quietly does nothing reads as
// broken. Borrowed from the action pills' own shake — see refuse().
function shakeDrop() {
  dropBtn.classList.remove('is-refused');
  void dropBtn.offsetWidth;
  dropBtn.classList.add('is-refused');
}

// THE 図鑑, in a drawer of its own. It shared the pack's panel while both were
// small and stopped making sense the moment the pack became slots: one is what
// you are carrying now, the other what you have ever caught, and sharing a
// drawer made the slots look like the first two rows of a longer list.
//
// An uncaught species is a silhouette and 「？？？」 — the shape is a promise,
// the name is the reward, and at twelve the silhouettes do more of that work
// than they ever did at three, because a round one and a long one are visibly
// two different animals you have not met yet. The count is TIMES EVER CAUGHT,
// which giving a fish away can never lower.
// WHAT BELONGS IN IT: things you FIND. Fish you catch and mushrooms you come
// across — both scarce, both a small event, both worth a record of having met
// one. Grass is not in it and should not be: it is everywhere, and a list of
// things you cannot fail to find is a list of nothing. Nor are the uniques:
// the bear is the house's and always has been, so "discovering" it would be a
// strange thing to congratulate anybody for.
const ZUKAN = [
  { head: 'さかな', has: (it) => !!it.fish },
  { head: 'きのこ', has: (it) => !!it.cover },
];

function paintZukan() {
  sheetBody.textContent = '';
  sheetCap.textContent = '';
  sheetCap.hidden = true;
  sheetCard.classList.remove('is-moving');
  for (const section of ZUKAN) {
    const ids = Object.keys(ITEMS).filter((id) => section.has(ITEMS[id]));
    if (!ids.length) continue;
    const seen = ids.filter((id) => (inventory.caught[id] || 0) > 0).length;
    const head = document.createElement('p');
    head.className = 'zukan-head';
    head.textContent = `${section.head}  ${seen}/${ids.length}`;
    sheetBody.appendChild(head);
    for (const id of ids) {
      const met = (inventory.caught[id] || 0) > 0;
      const row = document.createElement('div');
      row.className = `zukan-row${met ? '' : ' is-unseen'}`;
      const img = document.createElement('img');
      img.alt = '';
      img.src = itemIcon(id).toDataURL();
      const name = document.createElement('span');
      name.textContent = met ? ITEMS[id].name : '？？？';
      const n = document.createElement('span');
      n.className = 'pouch-n';
      n.textContent = met ? `×${inventory.caught[id]}` : '';
      row.append(img, name, n);
      sheetBody.appendChild(row);
    }
  }
}

// The one signal everything redraws off — see items.js. The hand is the
// globe's; the pill and panel are here; the inventory is what they agree on.
// A unique in the hand shows as the piece itself and the pill turns into
// 「おろす」 — you put a bear DOWN, you do not put a bear away.
function syncPouch() {
  if (inventory.heldUnique) {
    const art = ITEMS[inventory.heldUnique].art;
    if (!handMeshes[art]) handMeshes[art] = HAND_BUILDERS[art]();
    globe.hand.holdMesh(handMeshes[art], HAND_POSE[art]);
    const loose = uniqueByItem(inventory.heldUnique);
    if (loose) globe.carryLoose(loose);
    // AND ON YOUR OWN BODY, for whenever you can see it. The hand slot is what
    // you have while you are down among the grass; the avatar is what you have
    // once you have risen far enough to look at yourself, and a visitor who
    // picked up a sasumata and then flew up to find their body empty-handed
    // would have watched the thing they are carrying stop existing.
    //
    // A second copy rather than the hand's — see carriedPiece. The two are on
    // screen together through the whole of the climb, since the body fades in
    // well before the hand is put away.
    you.holdPiece(carriedPiece(inventory.heldUnique), CARRY[art]);
  } else if (inventory.holding) {
    globe.holdItem(itemIcon(inventory.holding));
    // A stackable is a CARD, and there is no built copy of a fish to give the
    // body. Rather than photograph one onto a sprite for a figure that is a
    // centimetre tall on screen, your avatar simply carries nothing — which is
    // also what the cast do with the fish you give them.
    you.dropPiece();
  } else {
    globe.clearHand();
    you.dropPiece();
  }
  // ANYTHING STILL MARKED AS CARRIED THAT IS NOT IN THE HAND went somewhere
  // this function was not told about, and there is exactly one such somewhere:
  // the pack. Putting a thing DOWN goes through putDownUnique, which places it
  // and says so; putting it AWAY just empties the hand.
  //
  // Without this the piece keeps the state it had while you were holding it,
  // which is "present in the world, body hidden" — an invisible bear standing
  // whereever you last were, and, if it is the lamp, still lighting it. Asked
  // of the world rather than of the item table, so it stays true whatever a
  // future state gets called.
  //
  // A LENT PIECE IS CARRIED TOO, and is the one exception. It is in a friend's
  // hands, which is a somewhere this function is emphatically not told about:
  // carryLent hides it and stands it at their feet every frame, and stowing it
  // here would have every loan die on the next thing you picked up. Asked of
  // the inventory because "whose hands" is a fact the world does not hold.
  for (const l of globe.loose) {
    if (!globe.isCarried(l)) continue;
    if (l === (inventory.heldUnique && uniqueByItem(inventory.heldUnique))) continue;
    if (l.item && inventory.unique(l.item).state === 'given') continue;
    globe.stowLoose(l);
  }
  if (pouchEl.classList.contains('is-open')) paintPack();
  if (sheetMode === 'zukan') paintZukan();
}

inventory.onChange(syncPouch);
syncPouch();

// ONE CONTROL, ONE JOB. The pill used to be three verbs in one — もちもの to
// open the bag, しまう to put a held card away, おろす to set a carried bear
// down — because before the action button there was nowhere else for those to
// live. There is now, and the overlap had a real cost: while you were holding
// anything, the only way into your own bag meant something else, so opening it
// took two presses and the first one silently emptied your hand.
//
// So the pill opens the pack, always, and the verbs are the action button's.
onPress(pouchBtn, () => openPouch(!pouchEl.classList.contains('is-open')));

// Switching rooms rather than opening a door: the card is already up, so these
// only ever repaint what is in it.
onPress(tabPack, () => openSheet('pack'));
onPress(tabZukan, () => openSheet('zukan'));

// The three ways out, now that there is no timer: the cross, anywhere off the
// card, and — for whoever is playing this at a desk — escape.
onPress(document.getElementById('sheet-close'), () => openSheet(null));
onPress(document.getElementById('sheet-scrim'), () => openSheet(null));

// Only ever the confirm for a pending amount. While a tile is in the air this
// is a place to LET GO of it, not something to press — the drag's own pointerup
// is what lands it there.
onPress(dropBtn, confirmDrop);
onPress(document.getElementById('count-all'), () => {
  const c = askN === null ? null : inventory.slots[askN];
  if (c) setDropN(c.n);
});
for (const b of countRow.querySelectorAll('.count-step')) {
  onPress(b, () => setDropN(dropN + Number(b.dataset.step)));
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetMode) openSheet(null);
});

// --- the drawer
//
// THE DRAWER IS GONE. It hid the clock, the sky and the 図鑑 behind three dots,
// and its own reasoning — "the two you visit fold away" — stopped being true
// twice over: the 図鑑 became a tab in the sheet, and the clock and the sky
// became one chip in the other corner. After both moves there was nothing left
// to fold, so the button that folded it went too.

// --- movement pad
// Purely a drawing: it has no pointer events of its own and appears wherever
// your thumb lands in the lower-left, so there is never anything to reach for.
// The canvas owns the touch, which is what lets a character under your thumb
// take priority over it.
// Its geometry, its knob, and the keyboard that now says the same thing all
// moved to move-input.js — see `moves` at the top of the file, which the pointer
// handlers hand their touches to.

// Two rungs again — ground and sky — because the room stopped being a rung:
// it is a place you walk into, not a mode you switch out of. It works from
// indoors like anywhere else: the roof is something the lift clears and the
// shell gets out of the way of, not a reason to refuse.
// JUST THE LENS. Nothing about where you stand changes — see the note on
// CONFIG.player.selfieDist — so this is one call and no bookkeeping.
//
// STAYS ALIVE WHILE HOLDING A HAND, deliberately, where そらへ greys out. The
// far view steers by sliding the planet under you, which is not a walk anybody
// can be led along; turning the camera round is not steering at all, and the
// hand-holding selfie is the whole reason this view exists.
// TAKE THE PICTURE.
//
// The scene is re-rendered into a target rather than scraped off the canvas —
// see Globe.photo for why that is the only reliable way here — so this can be
// pressed on any frame without the loop knowing anything about it.
//
// Saved by handing the browser a download. On a phone installed as a PWA that
// is the share sheet, which is where a photograph wants to go anyway; on a
// desktop it is a file. Either way the app itself keeps nothing, which is the
// same promise the rest of this world makes about storage.
// ---------------------------------------------------------------- the sheet
//
// WHAT HAPPENS TO A PHOTOGRAPH once it exists. It is shown before it goes
// anywhere, which is the nicer moment and also the only mechanism that works on
// every phone: a silent `<a download>` of a blob is unreliable on iOS, where it
// may open a tab or do nothing visible, and "nothing visible" after a shutter
// press is indistinguishable from a broken button.
//
// NOTHING LEAVES THE DEVICE. The picture is made in the browser's own memory,
// previewed from an object URL, and saved or shared by the browser's own APIs.
// There is no upload, no endpoint and nothing stored — which is why this works
// identically on a static host like GitHub Pages, where there is no server to
// talk to even if it wanted one.
const photoSheet = document.getElementById('photo-sheet');
const photoImg = document.getElementById('photo-img');
const photoShare = document.getElementById('photo-share');
const photoSave = document.getElementById('photo-save');
const photoClose = document.getElementById('photo-close');

// The picture currently on the sheet, and the URL showing it. Held together so
// that closing can free the second and forget the first in one place — an
// object URL left behind is a copy of a megabyte the page can never reclaim.
let photoBlob = null;
let photoUrl = null;

function showPhoto(blob) {
  closePhoto();
  photoBlob = blob;
  photoUrl = URL.createObjectURL(blob);
  photoImg.src = photoUrl;
  photoSheet.classList.remove('is-gone');
  // The share sheet is offered only where it can actually carry a FILE.
  // `canShare` with the payload is the only honest test: plenty of browsers
  // have `navigator.share` for links and would reject an image, and a button
  // that throws is worse than one that was never there.
  photoShare.classList.toggle('is-gone', !canSharePhoto(blob));
}

function canSharePhoto(blob) {
  if (!navigator.canShare || !navigator.share) return false;
  try {
    return navigator.canShare({
      files: [new File([blob], 'hidamari.png', { type: 'image/png' })],
    });
  } catch {
    return false;
  }
}

function closePhoto() {
  photoSheet.classList.add('is-gone');
  photoImg.removeAttribute('src');
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  photoBlob = null;
}

onPress(photoClose, closePhoto);

onPress(photoSave, () => {
  if (!photoBlob) return;
  const url = URL.createObjectURL(photoBlob);
  const a2 = document.createElement('a');
  a2.href = url;
  a2.download = `hidamari-${Date.now()}.png`;
  document.body.appendChild(a2);
  a2.click();
  a2.remove();
  // Freed on a timer rather than in the same tick as the click: revoking
  // immediately races the download on some browsers and hands over an empty
  // file. Its own URL rather than the preview's, so closing the sheet cannot
  // pull the rug from under a save still in flight.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});

onPress(photoShare, async () => {
  if (!photoBlob) return;
  const file = new File([photoBlob], `hidamari-${Date.now()}.png`, { type: 'image/png' });
  try {
    await navigator.share({ files: [file] });
  } catch {
    // Cancelled, or refused by the platform. Neither is an error worth saying
    // anything about — the sheet is still open and ほぞん is still there.
  }
});

// Whether the camera is already yours — the latch the unlock notice fires off.
// See the frame, which is where it flips.
//
// SEEDED FROM THE PACK, and starting it at `false` was a bug rather than a
// choice. The notice belongs to the EDGE — the moment an ability you did not
// have arrives — and a pack restored out of localStorage is not an edge: you
// were already carrying the camera when the app opened. Starting false made the
// boot itself look like the edge, so anybody who owned the camera was told they
// had just found it every single time they opened the game, forever. A greeting
// that cannot stop being a greeting is noise, and noise is what a first-time
// notice has to spend to be worth anything.
//
// This is why there is no saved flag beside the pack. The pack IS the flag: the
// only question the notice ever needed answered is "did this just become true",
// and a value read at boot answers it without a second thing to keep in step.
//
// WITHIN a visit it goes back down when the camera leaves your hands, so a
// pickup always announces itself — see the frame. The two rules are not in
// tension: the boot seed suppresses the repeat you did not ask for, and the
// reset restores the one you did.
let camSeen = inventory.slotOf('hachiwareCamera') >= 0;
let unlockTimer = 0;

function showUnlock() {
  unlockNote.classList.remove('is-gone');
  // Restarted from the top rather than merely un-hidden: a CSS animation on an
  // element that was already showing does not replay, and this element is shown
  // once per session today and could be shown for a second reason tomorrow.
  unlockNote.style.animation = 'none';
  void unlockNote.offsetWidth;
  unlockNote.style.animation = '';
  clearTimeout(unlockTimer);
  // Taken away when the animation has finished holding its last invisible
  // frame, so nothing is left in the layout or read out by a screen reader.
  unlockTimer = setTimeout(() => unlockNote.classList.add('is-gone'), 4400);
}

let shotBusy = false;
async function takePhoto() {
  if (shotBusy || !rig.isFirstPerson) return;
  // Not while you are still looking at the last one — the sheet is over the
  // viewfinder, so a second press would photograph a picture of a photograph.
  if (photoBlob) return;
  shotBusy = true;
  // The flash first, so the press answers instantly rather than after a
  // readback and an encode. Restarted by hand: the class has to leave the
  // element before it can be re-applied, or a second press within the animation
  // does nothing at all.
  shotFlash.classList.remove('is-firing');
  void shotFlash.offsetWidth;
  shotFlash.classList.add('is-firing');
  touched();
  try {
    const blob = await globe.photo(1080);
    if (blob) showPhoto(blob);
  } finally {
    shotBusy = false;
  }
}

onPress(shotBtn, takePhoto);

onPress(selfieToggle, () => {
  if (!rig.isFirstPerson) return;
  rig.toggleSelfie();
  // A pose belongs to the picture, not to the body — see POSES. Turning the
  // lens away puts your face back to whatever the app would have chosen.
  if (!rig.selfieOn) { youPose = null; paintPoses(); }
  touched();
  syncInteract();
});

onPress(viewToggle, () => {
  // NOT WHILE YOU ARE HOLDING SOMEBODY'S HAND. The far view steers by sliding
  // the whole planet under you, which is not a walk anybody could be led along
  // — and letting go silently to allow it would take the decision away from
  // you. The pill greys out for the same reason 「はしる」 does; see the loop.
  if (household.handHeld) return;
  if (rig.goingUp) rig.goToGround();
  else rig.goToSky();
});

// --- the action buttons: jump and sprint
//
// Both on pointerdown rather than click, because both are about NOW: a jump
// that waits for the finger to come back up lands after the moment that asked
// for it, and arming a run belongs to the press, not the release.
// Kept here only to be PAINTED — see the loop, which lights the sprint off the
// rig every frame and greys both off the ground. What they DO is wired in
// move-input.js, beside the keys that do the same two things.
const jumpBtn = document.getElementById('jump-btn');
const sprintBtn = document.getElementById('sprint-btn');

// --- the focus: what you are looking at
//
// ONE OBJECT AT A TIME, decided by where you are standing AND which way you are
// facing, and every verb the world offers you is about that one thing.
//
// Proximity alone decided this before, and it was wrong in both directions at
// once. The hung bulb has no bearing of its own — see `ceiling` in the furniture
// table — so "near the light" was true everywhere under the roof, and
// 「あかりを けす」 sat on screen for the entire time you were indoors. A
// permanently parked button, which is precisely what the stack was built to be
// rid of. And in the other direction 「ひろう」 named no target: standing between
// the bear and the teapot, you pressed it to find out which one you got.
//
// Facing answers both. What it costs is the thing facing always costs — a cone
// that chatters as a thumb wobbles the stick — and the four rules below are the
// price paid, because there are four different ways a focus can flicker and one
// rule does not cover them.
const FOCUS = {
  // Metres of surface. This near to take something up...
  reach: CONFIG.uniques.reach,
  // ...and it stays yours a little past that, so half a step back does not drop
  // what you were reaching for.
  hold: CONFIG.uniques.reach + 0.7,
  // IS IT ON THE SCREEN, in NDC units past the frame's edge. NARROW TO ACQUIRE,
  // WIDE TO KEEP — the same doctrine the cone below it used to carry, asked of
  // the frame instead of of an angle.
  //
  // `cone: 0.61` and `keep: 1.05` stood here: half-angles in the ground plane,
  // and the reason they are gone is that AN ANGLE IS NOT A FRAME. This planet is
  // played in portrait, where the camera's 62-degree vertical field comes out as
  // a horizontal HALF-field of 0.271 radians against an acquire cone of 0.61 —
  // two and a third times too wide. Measured: a candidate sitting exactly on the
  // old cone's edge four units out projected to ndcX -2.25, more than a full
  // screen-width outside the picture. It was not a near miss; whole categories
  // of thing were being focused that the player could not see, which is exactly
  // the complaint. And an angle in the ground plane could never have caught the
  // other half of it either, since it says nothing about up and down: the ground
  // at your feet is 75 degrees below a gaze that only reaches 47.
  //
  // Projecting the candidate answers both at once, in the one coordinate system
  // that IS what the player is looking at, and it follows the lens for free —
  // rotate the phone, walk (which widens the field, see walkFov), sprint, and
  // the test moves with the picture rather than drifting out of step with it.
  //
  // `edge` is generous rather than exact because a candidate is tested as a
  // POINT and drawn as a thing with width: a character whose middle sits just
  // past the frame still has most of a card inside it. 0.30 is about half a
  // character at conversation distance. `edgeKeep` is a whole frame, so glancing
  // away does not drop what you were reaching for mid-press.
  edge: 0.30,
  // A frame's own width was too forgiving and measured as such: a piece taken
  // off to one side sat at ndcX -1.94 — most of two screens out — and was still
  // held, which is the same complaint in a quieter voice. 0.45 is a glance
  // rather than a look away.
  edgeKeep: 0.45,
  // DOWN IS DIFFERENT, and it is the one direction that gets its own number.
  //
  // Standing on a planet you are always on top of a hill, so the camera looks
  // DOWN — and the ground near your own feet is below even that. Measured with a
  // bear set down at the three distances 「おく」 uses: at 0.95 units it projects
  // to ndcY -1.25, at 0.72 to -1.59, at 0.52 to -2.07. All three are off the
  // bottom of the picture, and all three are things you are plainly dealing
  // with: 0.95 is where 「おく」 puts something by default, and 「ひろう」 has to
  // be offered for it the instant it lands or setting a thing down and picking it
  // back up stops being one gesture.
  //
  // So the floor of the frame is forgiven where the sides are not, and the
  // asymmetry is honest rather than convenient. Sideways-and-invisible is the
  // complaint this whole change exists to fix — a friend two screens to the left
  // is a thing you have no idea about. Below-and-invisible is not the same
  // experience: it is at your feet, you put it there, and you know exactly what
  // it is. The `reach` cap keeps this from reaching far — ground more than a unit
  // or so out has climbed back into the picture anyway, so only what is genuinely
  // underfoot lands down here.
  edgeBelow: 1.35,
  // Stood on top of it, a bearing is noise and the thing is under the frame
  // entirely — the ground at your feet sits well below where the camera looks.
  // So this is no longer a way IN: something you are standing on cannot be newly
  // focused, because you genuinely cannot see it, and the world takes care not
  // to leave anything there anyway (「おく」 places at arm's length, and
  // nudgeLoose shoves what you tread on clear).
  //
  // It survives as a way to STAY focused. Walk over the bear you were already
  // reaching for and it stays yours rather than flickering out from under the
  // button, which is the same forgiveness `edgeKeep` gives for glancing away.
  onTop: 0.5,
  // How much better a challenger must be to take the focus off what you already
  // had, as a fraction of its score. TIES GO TO THE INCUMBENT, which is what
  // stops two pieces stood side by side trading the ring back and forth.
  beat: 0.75,
  // ...and it may not even try for this long after a change. A focus that can
  // turn over twice in three frames reads as a fault however good each
  // individual decision was.
  dwellMs: 180,
  // A PERSON IS FACED FROM FURTHER OFF than a thing is picked up from, because
  // the two verbs want different distances: you crouch to take a mushroom and
  // you stand and talk. `meet` is the greeting distance exactly — walk close
  // enough to be said hello to and you are close enough to answer — so the
  // button appears on the same line the world already draws around somebody.
  // HALF-ANGLES IN THE GROUND PLANE, for the verbs about a PLACE — the water,
  // and the stump or pudding 「いっておいで」 sends a friend to.
  //
  // The projection test above replaced angles for OBJECTS and was right to: a
  // cone says nothing about up and down, and a thing at your feet is 75 degrees
  // below a gaze that only reaches 47. A place is the case the projection cannot
  // serve. A pond has no point to project — it is a shape you stand at the edge
  // of — and a perch site's own point is under a friend who is about to be
  // standing on it, so "is it in the picture" answers a question about the
  // friend rather than about the spot.
  //
  // `cone` to acquire and `keep` to hold, the same doctrine the frame test runs
  // on and for the same reason: without the second number a verb about a place
  // blinks off and on for the whole length of a walk past it.
  //
  // The site pair is narrower than the water pair on purpose. A pond is wide and
  // you are on its shore; a stump is one small thing among several, and on a
  // planet this size two sites can be four units apart — a cone wide enough to
  // hold both would be back to picking for you, which is the whole complaint
  // that made this a button rather than a tripwire.
  siteCone: 0.42,
  siteKeep: 0.72,
  waterKeep: 1.05,
  meet: CONFIG.social.greetArc,
  meetHold: CONFIG.social.greetArc + 1.1,
  // HOW MUCH HARDER IT IS TO TAKE THE FOCUS OFF SOMEBODY YOU ARE TALKING TO.
  // Replaces `beat` for a friend you have actually pressed a verb on — see
  // `engaged` in resolveFacing.
  //
  // `beat` alone was geometry, and geometry has no idea a conversation is
  // happening. Measured with Chiikawa squarely ahead at 4.0: a rival 1.6 units
  // NEARER but 26 degrees to one side correctly lost, and the same rival at 2.0
  // dead ahead took the focus outright. Sometimes that is right — on a planet
  // this small somebody genuinely does walk between you — and mid-conversation
  // it is not, because the stack is carrying 「かす」 and 「とりかえる」 and a flip
  // between reaching and pressing hands your lamp to the wrong friend.
  //
  // FAVOURED RATHER THAN LOCKED, deliberately. A lock would be easier to reason
  // about and would also insist you were still talking to somebody now hidden
  // behind the friend standing in front of them. At 0.34 a challenger has to
  // score about a third of the incumbent's — which over the measured case above
  // means the 2.0-dead-ahead rival no longer wins, while somebody who has walked
  // right up into your face still does.
  engagedBeat: 0.34,
};

// What to call a thing on a button. The uniques bring their names from the item
// table; the bulb is not an item and never will be — you cannot carry a light
// fitting — so it gets its name here.
const ART_NAME = { bulb: 'でんき' };
for (const it of Object.values(ITEMS)) if (it.art) ART_NAME[it.art] = it.name;

const _fTan = new THREE.Vector3();
const _fLook = new THREE.Vector3();
const _fPt = new THREE.Vector3();
const _fSpan = new THREE.Vector3();
const fixtureDir = new WeakMap();

let focus = null;
// ...and who you are stood in front of, which is a separate question with a
// separate answer — see the two facings below.
let mate = null;

// Where a hung light is, as a spot on the floor. Its anchor sits at (R + rad)
// along the room's own normal, so normalising it is the place you stand and look
// up from. Worked out once and remembered: a fitting is called that because it
// does not move.
function dirOfFixture(L) {
  let d = fixtureDir.get(L);
  if (!d) { d = L.anchor.position.clone().normalize(); fixtureDir.set(L, d); }
  return d;
}

// Read live rather than remembered, because a loose piece MOVES — you can shove
// the bear across the floor with your shins while it is the thing you are
// facing, and a focus holding a copy of where it used to be would keep the ring
// on the rug behind it. A friend moves for a better reason still: they walk.
function focusDir(f) {
  if (f.bot) return f.bot.ch.dir;
  return f.loose ? f.loose.dir : dirOfFixture(f.fixture);
}

// The angle between the way you are looking and the way something lies, both in
// the tangent plane you are standing on. Radians, zero dead ahead.
function bearingTo(dir) {
  const A = rig.anchor;
  _fTan.copy(dir).addScaledVector(A, -dir.dot(A));
  if (_fTan.lengthSq() < 1e-12) return 0;
  _fTan.normalize();
  rig.facing(_fLook);
  return Math.acos(Math.max(-1, Math.min(1, _fTan.dot(_fLook))));
}

function gapTo(dir) { return rig.anchor.angleTo(dir) * CONFIG.globe.radius; }

// Whether one point in the world lands inside the picture, within `m` of the
// frame's edge in NDC.
//
// The point comes in the space the world group holds — a character's `root`, a
// loose piece's `anchor` — and the planet floats on its own bob, which is what
// `world.position` adds back. Live values rather than `matrixWorld`, and that is
// worth a line: the world's matrices are refreshed during the render, so a
// getWorldPosition here would answer with where things were LAST frame, and the
// cast have already walked this one by the time the focus is decided.
function inPicture(point, m) {
  _fPt.copy(point).add(globe.world.position).project(globe.camera);
  // Behind the eye. `project` happily returns a plausible-looking x and y for
  // something at your back — it is the depth that gives it away — and without
  // this a friend one pace behind you reads as dead centre. Measured: a rival
  // stood directly behind came back at ndcX -0.05.
  if (_fPt.z >= 1) return false;
  if (Math.abs(_fPt.x) > 1 + m) return false;
  if (_fPt.y > 1 + m) return false;
  // Below the frame is forgiven further than off to the side — see
  // FOCUS.edgeBelow, which is where that asymmetry is argued.
  return _fPt.y >= -(1 + Math.max(m, FOCUS.edgeBelow));
}

// ...and whether a CANDIDATE does, which is not the same question, because a
// candidate is a thing with height and the answer differs down its length.
//
// BOTH ENDS ARE TESTED, and it takes either. Only the base would refuse
// everything near your feet: the ground a metre out is 70 degrees below
// horizontal against a gaze that reaches 48, so a bear you had just set down at
// arm's length is standing with its FOOT off the bottom of the frame and its
// body plainly in it. And only the top would refuse a sasumata stood close
// against a wall, whose head goes off the frame while the shaft fills it. Two
// points and an `or` costs one extra projection on a list of a dozen and needs
// no fudge factor to sit between the two failures.
function onScreenFocus(f, m) {
  if (f.bot) {
    const ch = f.bot.ch;
    if (inPicture(ch.root.position, m)) return true;
    _fSpan.copy(ch.root.position).addScaledVector(ch.normal, ch.headTop);
    return inPicture(_fSpan, m);
  }
  // A loose piece's anchor already carries whatever lift stands it on a table,
  // and a fitting's carries the height it hangs at. Both are identity children
  // of `world`, so their positions mean the same thing.
  const node = f.loose ? f.loose.anchor : f.fixture.anchor;
  if (inPicture(node.position, m)) return true;
  // A fitting is a point — a bulb on a flex has no length worth walking — so
  // there is no second end to try.
  if (!f.loose) return false;
  _fSpan.copy(node.position).addScaledVector(f.loose.dir, f.loose.top || 0);
  return inPicture(_fSpan, m);
}

// Everything there is to look at. The loose pieces you could take up, and the
// bulb, which is not loose and never will be but is still a thing in the room
// that you can face and switch.
function eachCandidate(fn) {
  for (const l of globe.loose) {
    if (!l.anchor.visible || (l.body && !l.body.visible)) continue;
    if (!UNIQUE_ARTS.includes(l.art)) continue;
    fn({ art: l.art, loose: l, fixture: null, bot: null });
  }
  for (const L of globe.roomLights) {
    if (!L.ceiling || !L.anchor) continue;
    fn({ art: L.art, loose: null, fixture: L, bot: null });
  }
}

// ...and everybody you could be looking AT, which is a different question and
// therefore a different list. See the two facings below for why they are not
// one.
function eachFriend(fn) {
  for (const b of bots) {
    if (!b.ch.isVisible) continue;
    // NOT WHILE THEY ARE PERFORMING. Up on the pudding or the stump they are
    // busy in a way nothing else in this world is busy: every people-verb here
    // would break it, and 「てをつなぐ」 would break it badly — `held` outranks
    // `pastime` in the mode table, so a hand taken mid-song pulls a perched
    // body into a tow that assumes a standing one.
    //
    // Withheld at the FOCUS rather than pill by pill, which also takes the mark
    // off their head with it: the mark's whole job is to say "your words land
    // here", and it must not say that about somebody who is not listening. You
    // can still stand and watch, and they still sing their own lines. The walk
    // there is fair game — see atPlay.
    if (household.playingAt(b.ch)) continue;
    // ...AND NOT THROUGH A WALL, which the projection cannot catch: somebody sat
    // at home projects onto the front of the house perfectly well, as
    // throughWall's own note says. It is the same rule a tap already obeys — see
    // pickCharacter — and without it the pills offered you a conversation with
    // whoever was on the far side of the masonry you were facing.
    if (throughWall(b.ch)) continue;
    fn({ art: null, loose: null, fixture: null, bot: b });
  }
}

function sameFocus(a, b) {
  if (!a || !b) return false;
  if (a.bot || b.bot) return a.bot === b.bot;
  return a.loose ? a.loose === b.loose : (!b.loose && a.fixture === b.fixture);
}

// Still a thing you could be looking at: a piece that has since been picked up,
// stowed or lent is gone from the world and cannot go on being the focus, and
// a friend who has gone over the horizon is gone the same way.
function focusAlive(f) {
  if (f.bot) return f.bot.ch.isVisible;
  if (!f.loose) return true;
  return f.loose.anchor.visible && (!f.loose.body || f.loose.body.visible);
}

// Near and centred, lower being better. Metres, with the bearing charged at two
// metres a radian — so a piece a full 35° off has to be about 1.2m closer than
// one dead ahead to be worth turning the focus over for.
function scoreOf(gap, off) { return gap + off * 2; }

// TWO FACINGS, NOT ONE, and the split is the same lesson the action stack was
// built on. That note says ranking made the single button wrong "not because
// the loser went unshown, but because the loser went unreachable" — and one
// focus slot shared between props and people would reintroduce exactly that,
// one level down. Stand between Chiikawa and a bear and something has to win;
// whichever it is, the other verb is gone from the stack entirely and no press
// can reach it. A list has no losers, so neither may the thing that feeds it.
//
// They cannot sensibly be ranked against each other anyway: a friend at four
// metres and a lantern at one are not two answers to one question, they are
// answers to two. So there is a facing for THINGS and a facing for PEOPLE, each
// with its own incumbent and its own dwell clock, and both resolved by the one
// function below so their hysteresis can never drift apart.
const facingProps = {
  cur: null, at: 0, each: eachCandidate, reach: FOCUS.reach, hold: FOCUS.hold,
};
const facingCast = {
  cur: null, at: 0, each: eachFriend, reach: FOCUS.meet, hold: FOCUS.meetHold,
};

// Redecided every frame, but not freely. The hysteresis is what separates "it
// changed because the world changed" from "it changed because your thumb moved
// two pixels".
function resolveFacing(s, now) {
  // Does the one you already had survive? Generously judged: the wide cone and
  // the longer reach, and nothing else needs to be true of it.
  let keep = null;
  if (s.cur && focusAlive(s.cur)) {
    const dir = focusDir(s.cur);
    const gap = gapTo(dir);
    const off = bearingTo(dir);
    // Still in reach, and either still roughly in the picture or underfoot —
    // see FOCUS.edgeKeep and FOCUS.onTop, which are the two forgivenesses.
    if (gap <= s.hold
      && (onScreenFocus(s.cur, FOCUS.edgeKeep) || gap <= FOCUS.onTop)) {
      keep = { ...s.cur, score: scoreOf(gap, off) };
    }
  }

  // The best thing you are actually looking at. ON THE SCREEN, and in reach.
  let best = null;
  s.each((c) => {
    const dir = focusDir(c);
    const gap = gapTo(dir);
    if (gap > s.reach) return;
    if (!onScreenFocus(c, FOCUS.edge)) return;
    // Bearing still decides between two things you CAN see: dead centre beats
    // out at the edge, which is what makes turning toward one of two friends
    // pick that one. It is no longer what decides whether you can see it.
    const score = scoreOf(gap, bearingTo(dir));
    if (!best || score < best.score) best = { ...c, score };
  });

  if (!keep) { settleFacing(s, best, now); return; }
  if (sameFocus(best, keep)) { s.cur = keep; return; }
  if (!best || now - s.at < FOCUS.dwellMs) { s.cur = keep; return; }
  // A FRIEND YOU ARE TALKING TO IS MUCH HARDER TO INTERRUPT than a thing you
  // happen to be nearest — see FOCUS.engagedBeat for the measurements.
  //
  // `rig.focus` is the app's existing record of who you came to see: the tap
  // sets it, the walk-up greeting sets it, and every people-verb sets it through
  // closeIn. It is also what makes them `attentive` and stop wandering off, so
  // "engaged" already means something to the world and this is that same word
  // used for the same person.
  //
  // It is never cleared, and does not need to be. To be the incumbent at all a
  // friend has to have survived the keep test a few lines up — still inside
  // meetHold, still roughly in front of you — so the favour only ever applies
  // while you are stood there facing the last person you spoke to, which is
  // exactly when it should. Walk off and the geometry releases it for free.
  //
  // Props are unaffected: `keep.bot` is null for a lantern, so they go on being
  // judged by the plain `beat` they always were.
  const engaged = !!keep.bot && rig.focus === keep.bot.ch;
  if (best.score > keep.score * (engaged ? FOCUS.engagedBeat : FOCUS.beat)) {
    s.cur = keep;
    return;
  }
  settleFacing(s, best, now);
}

function settleFacing(s, f, now) {
  // Nothing to nothing is not a change. Without this the clock restarts on every
  // frame spent facing empty meadow, and the dwell above — which exists to stop
  // a focus turning over twice in three frames — would be measuring the wrong
  // thing the moment something finally arrived.
  if (!f && !s.cur) return;
  if (sameFocus(f, s.cur)) { s.cur = f; return; }
  s.cur = f;
  s.at = now;
}

// `focus` and `mate` are read-only mirrors of the two, written here and nowhere
// else, so everything downstream goes on asking the same short question it
// always did.
function updateFocus(now) {
  if (!rig.isFirstPerson) {
    facingProps.cur = null;
    facingCast.cur = null;
    focus = null;
    mate = null;
    return;
  }
  resolveFacing(facingProps, now);
  resolveFacing(facingCast, now);
  focus = facingProps.cur;
  mate = facingCast.cur;
}

// `focusName` stood here — the focused piece by name, for 「ひろう」's pill.
// Gone with `mateName`, `mateTo` and `lentName` below it: the focus marks name
// their targets by pointing now, and a helper whose one reader has stopped
// asking is not machinery worth keeping. ART_NAME stays — 「つける」 still
// names its light through `of`, and the fixture table is its home.

// --- the interaction stack
//
// EVERY verb the world is offering, rather than the one that won. One pill per
// thing you could do from where you are standing, stacked upward out of the
// thumb's arc, decided fresh each frame. It is the other half of taps no longer
// moving you: a tap POINTS at something, these buttons ACT.
//
// It used to be one button that ranked its candidates and displayed the winner,
// and RANKING IS WHAT MADE IT WRONG — not because the loser went unshown, but
// because the loser went unreachable. Standing on the shore of a fishable lake
// with a bear at your feet, ひろう outranked つりをする, and the only way to
// fish from that spot was to walk away from the bear first. There was no press
// that could reach the other verb. A list has no losers.
//
// Three parts, and the split is the one the single button already had, which is
// why it survived the rewrite: `actionsNow` decides WHAT is on offer, `ACTIONS`
// knows how to SAY and how to DO each one, and `syncInteract` is the only thing
// that touches the DOM. The word a pill shows is drawn from the same table entry
// that runs when it is pressed, so a button cannot offer one verb and perform
// another.
const ixEl = document.getElementById('interact');

// Bottom of the stack first. The bottom pill is the one nearest the thumb, so
// the verbs you reach for most sit there, and the ones that are really endings
// — put it away, turn it off — sit above.
//
// FIXED, and deliberately not sorted by distance the way the big open-world
// games sort theirs. Theirs re-order as you move, which is exactly the
// complaint people have about them: the list shuffles under a thumb already
// travelling toward one entry, and you mine the ore instead of opening the
// chest. Here a verb's seat depends only on which kind of verb it is, so it is
// where you last found it every time, and pressing without reading is safe.
//
// THE PEOPLE-VERBS SIT AT THE TOP, and they used to sit at the bottom for a
// reason that turned out to be the wrong one. The argument was thumb-reach: a
// person beats a pastime everywhere on this planet, says the tap handler, so
// give the person the seat nearest the thumb. What that missed is WHERE THE
// FRIEND IS. They stand in the middle of the screen with the focus mark
// floating over their head, which is above the stack, not below it — so the
// verbs about them were as far from them as the column could put them, and the
// eye had to travel the whole height of the buttons to get from the mark to the
// word. Up here they are beside what they are about.
//
// The trade is real and worth naming: the friend verbs are now the furthest
// from a resting thumb rather than the nearest. It buys them the shortest
// distance from the thing they act on, and on a screen where the mark says who
// and the pill says what, keeping those two near each other is worth more than
// keeping the pill near the thumb.
// 「しまう」 IS THE ANCHOR, bottom of everything and wearing the ink whenever it
// is showing. It is the one verb in the stack that is always available for the
// same reason and always means the same thing — your hands are full, empty
// them — so it is the one that can afford to be in the same place every time.
// A stack whose lowest pill changes with the scenery has no home key; this
// gives it one, and pressing without reading is safest exactly there.
//
// 「おく」 rides down with it rather than being left behind in the middle of the
// column. The two are a pair — one sets a thing down in the world, the other
// keeps it — and the whole point of the gaps below is that kin stand together.
// Splitting them to seat one of them would be spending the grouping to buy the
// anchor, when both fit.
const IX_ORDER = ['strike', 'reel', 'stow', 'put', 'grab', 'fish', 'light', 'talk', 'hold', 'play', 'give', 'swap', 'giveBack'];

// WHAT EACH VERB IS ABOUT, which is what the gaps in the column are drawn from.
//
// Four pills in a row all wearing the same pill read as one list of four
// unrelated things, and they are not: 「はなす」「かす」 are about the friend
// under the mark, 「おく」「しまう」 are about what is in your hand, and nothing
// in the stack said so. Proximity is the oldest way to say it and the cheapest —
// a wider gap between families and the eye chunks them without being told.
//
// AIR RATHER THAN INK, deliberately. The alternatives all cost this screen
// something it has: colouring the groups fights a palette that is paper and one
// pen, and drawing a divider adds furniture to say what a space already says
// silently. Nothing here is added; some of it is merely further apart.
//
// THE FAMILIES MUST STAY CONTIGUOUS IN `IX_ORDER`, and that is the one rule a
// future verb has to respect. The gap is decided by comparing each showing pill
// with the one below it, so a verb seated between two members of another family
// would split that family in two and put a gap in the middle of it. Add a new
// verb NEXT TO ITS OWN KIND in the table above, never between somebody else's.
// Listed bottom-to-top, in `IX_ORDER`'s own sequence, so this table can be read
// down the page as the column reads up the screen.
const IX_GROUP = {
  // The rod, which always returns alone — so this family never shows a gap at
  // all. It is named for completeness rather than for effect.
  strike: 'rod',
  reel: 'rod',
  // What is in your hand, anchored at the bottom — see IX_ORDER.
  stow: 'hand',
  put: 'hand',
  // What you are facing out in the world.
  grab: 'world',
  fish: 'world',
  // The light, which is its own thing: it is neither a person, nor a thing you
  // are carrying, nor quite a thing you picked — it is a switch on something
  // that stays where it is.
  light: 'lamp',
  // ...and the friend in front of you, topmost, nearest the mark over their
  // head. See IX_ORDER for why they moved up here.
  talk: 'friend',
  hold: 'friend',
  play: 'friend',
  give: 'friend',
  swap: 'friend',
  giveBack: 'friend',
};

// Stroke glyphs in the app's own ink, the same recipe as jump and sprint. Four
// pills in a column are four similar shapes, and the glyph is what lets you
// pick the one you want out of them without reading all four.
const IX_GLYPH = {
  strike: '<path d="M12 19V6"/><path d="m6.5 11.5 5.5-5.5 5.5 5.5"/>',
  reel: '<path d="m7 7 10 10"/><path d="m17 7-10 10"/>',
  // A speech bubble with its tail down — the one shape in this set that needs no
  // explaining, and the same rounded box the dialogue itself is drawn in.
  talk: '<path d="M4.4 5.6h15.2v9.6h-8.4l-4 3.2v-3.2H4.4Z"/>',
  // Two hooks meeting in the middle — the plainest drawing of a link there is,
  // and the one shape in this set that means the same thing at 20px as at 200.
  hold: '<path d="M10.6 8.2a3.4 3.4 0 0 0 0 7.6h1.2"/><path d="M13.4 15.8a3.4 3.4 0 0 0 0-7.6h-1.2"/>',
  // A four-point sparkle: the thing you are sending them to is a delight, and
  // this is the plainest drawing of one.
  play: '<path d="M12 4.5l1.7 5.8L19.5 12l-5.8 1.7L12 19.5l-1.7-5.8L4.5 12l5.8-1.7Z"/>',
  // The same arrow the other way about — away from you, toward them. The pair
  // are deliberately mirror images: 「わたす」 and 「かえして」 are one object
  // making one journey, and which way it is going is the whole of the
  // difference between them.
  give: '<path d="M18.6 7.8H9.7a4.4 4.4 0 0 0 0 8.8h3.6"/>'
      + '<path d="m15.1 4.3 3.5 3.5-3.5 3.5"/>',
  // Two arrows passing each other, which is the one shape everybody already
  // reads as an exchange. Deliberately NOT a variation on give's curve: a swap
  // is not a give with something added, it is both directions at once, and the
  // glyph should be legible as that at a glance in a column of similar pills.
  swap: '<path d="M4.6 8.7h12.6"/><path d="m14.5 5.9 2.7 2.8-2.7 2.8"/>'
      + '<path d="M19.4 15.3H6.8"/><path d="m9.5 12.5-2.7 2.8 2.7 2.8"/>',
  // An arrow that turns and comes back toward you: the loan's own shape. It is
  // 「ひろう」's cousin rather than its opposite, because taking something back
  // IS a pickup — it just starts in somebody's hands.
  giveBack: '<path d="M5.4 7.8h8.9a4.4 4.4 0 0 1 0 8.8h-3.6"/>'
          + '<path d="m8.9 4.3-3.5 3.5 3.5 3.5"/>',
  grab: '<path d="M12 3.2v9"/><path d="m8.5 6.7 3.5-3.5 3.5 3.5"/>'
      + '<path d="M5 13.2a7 7 0 0 0 14 0"/>',
  fish: '<path d="M3.2 12c2.4-3 5.3-4.6 7.9-4.6s5.6 1.6 7.2 4.6c-1.6 3-4.6 4.6-7.2 4.6S5.6 15 3.2 12Z"/>'
      + '<path d="m18.3 12 2.5-2.4v4.8Z"/><path d="M7.6 11.2h.01"/>',
  put: '<path d="M12 3.6v9"/><path d="m8.5 9.1 3.5 3.5 3.5-3.5"/><path d="M5 18.4h14"/>',
  stow: '<path d="M4.5 8.6h15v10.9h-15z"/><path d="M8.6 8.6v-2a3.4 3.4 0 0 1 6.8 0v2"/>',
  light: '<path d="M9.4 16.5h5.2"/><path d="M10 19.2h4"/>'
       + '<path d="M12 3.6a5.6 5.6 0 0 0-3.3 10.1c.4.3.7.8.7 1.3h5.2c0-.5.3-1 .7-1.3A5.6 5.6 0 0 0 12 3.6Z"/>',
};

// What each verb says, and what it does. The word is a function rather than a
// string because two of them are not constants: あかりを changes with the
// switch it is offering to flip.
const ACTIONS = {
  strike: { word: () => 'あげる!', run: () => fishing.onTap() },
  reel: { word: () => 'やめる', run: () => fishing.onTap() },
  // Talking is a thing you can now DO rather than only a thing that happens to
  // you. A tap on somebody has always said hello, but a tap is overloaded by
  // what you are carrying — see the note in onUp, where the item in your hand
  // decides whether the gesture is a visit, a gift or a loan — so with anything
  // at all in your hands there was no way left to simply say hi. There is now,
  // and it is the same word whatever you are holding.
  // THE PEOPLE-VERBS ARE BARE WORDS, and so is 「ひろう」 — the focus marks
  // took over the naming. A pill used to say who and what in text
  // (「かえして ピンクのさすまた ハチワレに」, at 258px the widest thing on the
  // screen) because text was the only place the answer could live; the paper
  // arrow now stands ON the friend and ON the piece, which answers "which one"
  // where the player is already looking and in no language at all. What a mark
  // cannot say is kept in the word: わたす／かす is the one distinction below
  // that has no visual — a gift and a loan look identical at the moment of
  // handing over — so the WORD carries it, the way つける／けす carries the
  // lamp's.
  talk: { word: () => 'はなす', run: talkToMate },
  // ONE PILL FOR BOTH HALVES, and the word says which. Taking a hand and
  // letting go are the same gesture from opposite ends, and a second pill for
  // the release would sit greyed out for the whole of the time it was not
  // wanted — which is the thing this stack exists to avoid.
  hold: {
    word: () => (household.handHeld ? 'てをはなす' : 'てをつなぐ'),
    run: toggleHold,
  },
  // 「いっておいで」 — you led them here, and this is you letting them go to it.
  //
  // A BUTTON AND NOT A TRIPWIRE, by request and by ruling: a pastime is a rare
  // event, and one that fired itself off mere nearness read as a proximity
  // effect rather than as an occasion. The moment belongs to the player now —
  // walk them over, then say go on.
  play: {
    word: () => 'いっておいで',
    run: () => { if (household.sendToPlay(performance.now())) touched(); },
  },
  give: {
    word: () => (inventory.heldUnique ? 'かす' : 'わたす'),
    run: handToMate,
  },
  // 「とりかえる」 — yours for theirs, in one press.
  //
  // It exists because A CHARACTER HAS ONE PAIR OF HANDS, and lending to
  // somebody who is already holding one of yours was a degenerate state rather
  // than a feature: carryLent gives the visible grip to the first loan and lets
  // any second one ride along invisibly, so the second lamp was in their hands
  // in the save and nowhere on the screen. This does not merely tidy the
  // buttons — it makes that state unreachable, which is why it replaces 「かす」
  // rather than sitting beside it.
  //
  // ONLY FOR UNIQUES. A stackable is not held at all — giving somebody a fish
  // decrements a count and earns a thank-you, and their hands stay exactly as
  // full as they were — so 「わたす」 goes on being offered alongside 「かえして」
  // when that is what you are carrying. Two verbs there are two real choices;
  // two verbs for uniques were one real choice and one that quietly broke.
  swap: { word: () => 'とりかえる', run: swapWithMate },
  // 「かえして」 rather than 「とりかえす」: you ASK, and they hand it over. This
  // world does not have a verb for taking something out of a friend's arms, and
  // it should not grow one. What is being asked for needs no naming — it is
  // visibly in the marked friend's hands.
  giveBack: { word: () => 'かえして', run: takeBackLoan },
  grab: { word: () => 'ひろう', run: grabFocus },
  // Casting with a full hand puts the hand away first, which is why this can be
  // offered while you are carrying something rather than having to wait for you
  // to deal with it.
  fish: {
    word: () => 'つりをする',
    run: () => { inventory.putAway(); fishing.castFrom(rig.anchor); },
  },
  // Two words for two different endings, and the pack is why they had to become
  // two. 「おく」 sets the thing down IN THE WORLD and gives its slot back;
  // 「しまう」 keeps it and stops holding it. With one word for both, a press
  // meant to tidy your hand would leave the bear in a field.
  // BARE, like the verbs the focus marks took the naming off. Nothing marks
  // what is in your hand — but nothing needs to: the hand slot is already
  // showing it, in the corner, at the size of a held thing. 「おく ランプ」 was
  // the pill reading out a label for the object the player is looking at while
  // they read it, and it was the widest thing left in the stack at 137px.
  put: {
    word: () => 'おく',
    run: () => {
      const spot = placeSpot();
      if (!spot) { refuse('put'); return; }
      putDownUnique(spot.clone());
    },
  },
  // Bare for 「おく」's reason, and it was the last pill naming a thing the hand
  // slot was already holding up. In practice it rarely showed the name at all —
  // 「しまう」 is almost always a secondary pill, where the taper hides it — so
  // this mostly stops the one case where it did: tidying your hand with nobody
  // and nothing else around.
  stow: { word: () => 'しまう', run: () => inventory.putAway() },
  // THE WORD CARRIES THE STATE, so this needs no lit styling of its own. As a
  // lone round button it was filled when the light was on and outlined when it
  // was off, because a glyph cannot say which way it is about to go. A pill can:
  // it reads つける or けす, which is what pressing it DOES rather than what the
  // lamp currently is, and that is the rule the rest of this app already
  // follows. It frees the filled treatment to mean one thing here — the entry
  // under your thumb — instead of two.
  //
  // 「あかりを つける」 shortened to 「つける」 when the pills learned to name
  // their object: あかり was doing the naming, badly — one word for the bulb and
  // the lantern both — and でんき or ランプ beside the verb says it properly.
  light: {
    word: () => {
      const L = lightNow();
      return L && globe.lightIsOn(L) ? 'けす' : 'つける';
    },
    of: () => { const L = lightNow(); return L ? (ART_NAME[L.art] || '') : ''; },
    run: () => { const L = lightNow(); if (L) globe.toggleLight(L); },
  },
};

// Everything on offer right now, in stack order, bottom entry first. Empty is
// the ordinary answer — hands free, facing nothing — and an empty stack leaves
// this corner to jump and sprint alone.
function actionsNow() {
  // THE HAND SURVIVES A BUMP. `isFirstPerson` reads eye height against the
  // surface UNDER you, and that surface moves — stepping over a stump, a table
  // edge or the doorstep lip drops you "airborne" for the few frames the ease
  // takes. Emptying the stack on those frames made 「てをはなす」 blink off and
  // on, which read as the hold itself stuttering. While a hand is genuinely
  // held, the release pill stays put whatever the ground is doing.
  if (!rig.isFirstPerson) return household.handHeld ? ['hold'] : [];

  // THE ROD TAKES THE WHOLE STACK. A bite is a window under a second wide, and
  // あげる! sharing the corner with しまう would lose fish to a mis-tap on the
  // neighbour. While the line is out there is nothing else you could sensibly
  // be doing anyway, so both rod states return alone and the stack becomes the
  // one button the moment deserves.
  if (fishing.state === 'bite') return ['strike'];
  if (fishing.active) return ['reel'];

  const list = [];
  // PUSHED IN `IX_ORDER`'S OWN SEQUENCE, bottom of the column first. The CSS
  // seats each pill by that table, but `i === 0` is what wears the filled
  // treatment, so the pushes and the table have to agree or the pill under your
  // thumb would not be the one lit. Reorder one and you must reorder the other.
  //
  // HAND VERBS FIRST, and they need no facing: what is in your hand is in your
  // hand whichever way you are pointed, and a rule that made you face something
  // to put it down would be a rule with no object to attach itself to.
  //
  // 「しまう」 leads the whole stack — see IX_ORDER. It used to be 「おく」, on
  // the grounds that setting a thing down is the reversible one and so the
  // safer press to sit under a thumb. True, and beaten by a plainer thing:
  // 「しまう」 is the only verb here that shows for the same reason every time
  // and always does the same thing, so it is the only one that can be a fixed
  // home key. 「おく」 is a decision about where a thing lives; that is worth
  // reading a pill for.
  if (inventory.holding || inventory.heldUnique) list.push('stow');
  if (inventory.heldUnique) list.push('put');
  // WORLD VERBS DO NEED IT, because a verb about an object is unusable without
  // knowing which object, and proximity cannot say. One hand: nothing may be
  // taken up while a unique is already in it.
  if (focus && focus.loose && !inventory.heldUnique) list.push('grab');
  if (facingWater()) list.push('fish');
  if (lightNow()) list.push('light');
  // ...AND THE PEOPLE-VERBS ON TOP, nearest the friend they are about rather
  // than nearest the thumb — see IX_ORDER, which is where that trade is argued.
  //
  // All three come off the people-facing rather than off proximity, for the
  // reason the world verbs do: standing near two friends, "which one" is a
  // question only facing can answer.
  if (mate) list.push('talk');
  // ...and the hand. Offered beside a friend, and ALSO while one is already
  // held whoever you happen to be facing — otherwise letting go would mean
  // turning back to face somebody you are already walking with.
  if (mate || household.handHeld) list.push('hold');
  // ...and the send-off, only while you are leading somebody, their own thing
  // is close by, AND YOU ARE LOOKING AT IT. See playSite.
  if (playSite()) list.push('play');
  // Two hands full of uniques — yours and theirs — is a SWAP rather than a
  // gift, because they have nowhere to put a second one. See the `swap` entry.
  const loan = loanFrom(mate);
  const trading = !!mate && !!inventory.heldUnique && !!loan;
  // Something in your hand and somebody in front of you is the whole condition.
  // It reads the HAND rather than the pouch on purpose: handing over what you
  // are holding is a gesture, and reaching into your bag mid-conversation to
  // find something to hand over is a different one that the pouch panel already
  // covers — pick it up there and this appears.
  if (mate && (inventory.holding || inventory.heldUnique) && !trading) list.push('give');
  if (trading) list.push('swap');
  // 「かえして」 SURVIVES THE SWAP, and that is the one place this stops short of
  // collapsing the two. Wanting your lamp back and wanting to trade for it are
  // different intentions, and with only a swap on offer the second press would
  // hand back what the first press took — a loop with no way out to an empty
  // hand. Two pills here say two different things; the pair they replaced said
  // one thing twice.
  if (loan) list.push('giveBack');
  return list;
}

// THE STUMP OR THE PUDDING 「いっておいで」 WOULD SEND THEM TO, or null. One
// question, asked once a frame by both the pill and the mark — see the note on
// canSendToPlay about why they must not each find their own.
//
// PROXIMITY WAS NOT ENOUGH, and the stack's own rule says why: a verb about an
// object is unusable without knowing which object, and being near cannot say.
// This one predated the rule. Standing between a stump and a pudding four units
// apart, the old pill named neither and picked for you; worse, on a planet this
// small a hobby site is within the lure of half the places you might stroll, so
// the offer sat in the corner for most of a led walk and stopped reading as an
// occasion at all — which is the same thing the auto-trigger did wrong, and the
// reason it became a button in the first place.
//
// NARROW TO ACQUIRE, WIDE TO KEEP, the doctrine the whole focus system runs on.
// Without the second half this blinked off and on for the length of a walk past
// a stump — the shoreline bug, and the bulb's before it. `playAim` is the latch;
// nothing else reads it.
let playAim = false;
function playSite() {
  const offer = household.canSendToPlay();
  if (!offer) { playAim = false; return null; }
  const off = bearingTo(offer.site.dir);
  playAim = off <= (playAim ? FOCUS.siteKeep : FOCUS.siteCone);
  return playAim ? offer : null;
}

// The lake, which cannot be a focus: it is a place rather than an object, with
// no single point to stand in front of. So it gets the facing test on its own
// terms — near enough to cast, and looking AT the water rather than along the
// shore. The wide cone, because a pond is wide.
//
// Without the second half this button blinked on and off for the whole length of
// a walk beside the water, which is the shoreline version of the bulb's bug.
function facingWater() {
  if (!fishing.canCastFrom(rig.anchor)) return false;
  const school = globe.fish;
  if (!school || !school.pond) return true;
  // `FOCUS.keep` STOOD HERE AND HAD NOT EXISTED FOR SOME TIME. The cone pair it
  // came from was deleted when objects moved to the projection test, and this
  // line kept asking for one of them — so the comparison was `angle <= undefined`,
  // which is false for every angle there is. Beside any pond with fish in it,
  // 「つる」 could not appear at all; only the `!school.pond` shortcut above ever
  // returned true. Found while giving 「いっておいで」 the same kind of gate, which
  // is why the two now read from one named pair. See FOCUS.waterKeep.
  return bearingTo(school.pond.centre) <= FOCUS.waterKeep;
}

// The light this button would flip: the one in your hand first, otherwise the
// one you are LOOKING AT. Null when there is none.
//
// Looking at, rather than near — and this is the fix the whole focus system was
// built for. `globe.lightNear` answers "is there a light in this room", because
// a hung bulb has no bearing of its own, and in a room you can cross in three
// steps that is true from the doorway to the far wall. The button never left.
//
// A LIGHT GETS ITS OWN ENTRY rather than sharing one with the verbs, and the
// carried lamp is what settles it. Sharing a single control, a lamp in your
// hand would have to choose between offering 「けす」 and offering 「おく」 —
// and whichever lost, you would be holding a thing you could not do the other
// with. A lamp carried somewhere dark is exactly when you want both, which is
// the same argument the stack makes in general, made by the case that forced it.
//
// Facing the lantern on the floor gives you BOTH ひろう and けす, because it is
// one object that is honestly two things — a thing you can carry and a thing
// that is lit — and the stack has room to say so.
//
// Answers with the LIGHT ITSELF rather than with its art. There are two
// lanterns in the world now — Chiikawa's and Hachiware's — so a name is no
// longer an identity, and passing one to globe.toggleLight would have flipped
// both. See Globe.lightAt.
function lightNow() {
  const held = inventory.heldUnique;
  if (held) {
    const l = uniqueByItem(held);
    const L = l && globe.lightAt(l.anchor);
    if (L) return L;
  }
  // A fitting IS a room light — that is what the focus put in the field — and a
  // loose piece has to be looked up by the group it hangs on.
  if (focus && focus.fixture) return focus.fixture;
  if (focus && focus.loose) return globe.lightAt(focus.loose.anchor);
  return null;
}

// Take the focused piece into your hand. The loose furniture knows its art and
// the item table knows the id, so the lookup here is the join between them.
function grabFocus() {
  if (!focus || !focus.loose) return;
  const id = focus.loose.item || Object.keys(ITEMS).find(
    (k) => ITEMS[k].kind === 'unique' && ITEMS[k].art === focus.loose.art,
  );
  if (id) { inventory.putAway(); inventory.setUnique(id, { state: 'hand' }); }
}

// `heldName` stood here — what is in your hand, by name, for the pills that
// acted on it. It goes the way of the other naming helpers: 「おく」 and
// 「しまう」 are bare words now, because the hand slot is already holding the
// answer up in the corner of the screen. `ART_NAME` and the `of` slot itself
// stay for 「つける」, whose light is the one target this world neither marks
// nor puts in your hand.

// --- the friend in front of you
//
// `mateName` and `mateTo` stood here — the people-facing's pick by name, and
// the same name wearing a 「に」, for the pills that used to spell out who a
// verb would reach. The mark over their head says it now; see updateMark.

// The loan they are carrying, if the one you are facing has one of yours. Null
// is the ordinary answer — most of the time nobody is holding anything of
// yours, and most of the rest of the time it is not this friend.
//
// The VISIBLE one, when somebody has somehow ended up with two: carryLent puts
// one piece in a pair of hands and rides the rest along invisibly, so taking
// back the one you cannot see would be a button that appears to do nothing. It
// scans in the same order carryLent fills hands, which is what makes the two
// agree.
function loanFrom(who) {
  if (!who) return null;
  const key = who.bot.spec.key;
  for (const id in inventory.uniques) {
    const rec = inventory.uniques[id];
    if (rec.state === 'given' && rec.to === key) return id;
  }
  return null;
}

// (`lentName` is gone with the other pill-naming helpers above — the lent
// piece is visibly in the marked friend's hands.)

// Say something to whoever you are stood in front of.
//
// The 「poke」 bank rather than 「greet」, because by the time this button can be
// pressed you have been greeted already: it appears at exactly greetArc, which
// is the line the walk-up hello fires on. Pressing it is the second thing you
// say to somebody, and that is the bucket for the second thing.
//
// It also stamps the greeting clock, for the same reason the tap does — without
// it, walking the last half-metre after pressing would have them welcome you to
// a conversation you had just started.
// TAKE A HAND, OR GIVE IT BACK.
//
// The whole of the feature from this side is two calls, because the household's
// `held` mode does the walking and its place in the priority list does the
// interrupting. What belongs here is only what is not the cast's business: the
// leash on your own walk, and the fact that you cannot climb into the sky with
// somebody's hand in yours.
function toggleHold() {
  if (household.handHeld) {
    releaseHand();
    return;
  }
  if (!mate || !mate.bot) return;
  const bot = mate.bot;
  if (!household.takeHand(bot)) return;
  rig.leash = true;
  // A run drags them; the cap in the rig already refuses one, and disarming
  // here stops the button being left lit over a walk that cannot sprint.
  rig.sprintOn = false;
  rig.focus = bot.ch;
  // They answer being taken by the hand, which is what makes it an exchange
  // rather than a state change. `pokeBack` also starts their attention window,
  // so somebody you are walking with keeps giving you their attention.
  pokeBack(bot, bot.dlg.has('greetBack') ? 'greetBack' : 'poke', performance.now());
  touched();
}

// Letting go — from the pill, from taking off, or because the world took them.
// Safe to call at any time, which is what lets three different places use it
// without any of them checking first.
function releaseHand() {
  if (!household.letGo()) return;
  rig.leash = false;
  touched();
}

function talkToMate() {
  if (!mate) return;
  const now = performance.now();
  const bot = mate.bot;
  // A person beats a pastime everywhere on this planet, the tap handler says,
  // and it is no less true of a button.
  if (fishing.active) fishing.cancel();
  // Frame the conversation — step in if you are back a way, square up either
  // way. See closeIn, which is careful never to walk you backwards.
  rig.closeIn(bot.ch);
  social.greetedKey = bot.spec.key;
  social.greetCooldownUntil = now + CONFIG.social.greetCooldown;
  // Absorbed while they are still answering the last one — see pokeBack. The
  // framing above happens either way, because squaring up on a friend who is
  // mid-sentence is exactly right.
  pokeBack(bot, 'poke', now);
}

// Hand over what you are holding. The gesture that used to be a tap, made a
// verb — see the note in onUp for why it could not stay a tap.
//
// TWO WORDS FOR TWO DIFFERENT ENDINGS, which is the real prize. A stackable is
// gone when you give it and a unique stays theirs until you ask for it back,
// and until now those two were the same gesture with no way to tell them apart:
// you handed Chiikawa the lamp exactly as you handed her a fish, and found out
// afterwards which one it had been. The pill says 「わたす」 or 「かす」 before
// you press it.
//
// 「わたす」 rather than 「あげる」 on purpose, though あげる is the plainer word
// for a gift: the rod's strike already owns 「あげる!」, and while the two can
// never share a stack — the rod takes the whole thing — two verbs reading the
// same is a thing to avoid when a synonym is right there.
function handToMate() {
  if (!mate) return;
  const bot = mate.bot;
  const now = performance.now();
  rig.closeIn(bot.ch);
  social.greetedKey = bot.spec.key;
  social.greetCooldownUntil = now + CONFIG.social.greetCooldown;
  // A unique is LENT and a stackable is GIVEN — the same split the tap used to
  // make silently, now made by a button that said which it would be.
  //
  // No poke buffer on either: both consume something, so they are limited by
  // what you are carrying rather than by a clock, and the thank-you is the whole
  // point of the press. Their delight is never absorbed.
  if (inventory.heldUnique) { lendUnique(bot, now); return; }
  if (inventory.holding && giveGift(bot, inventory.holding, now)) return;
  // The hand and the pouch have come apart, which the pill's own condition says
  // cannot happen. It shakes its head rather than doing nothing.
  refuse('give');
}

// Yours for theirs. See the `swap` entry for why this exists at all.
//
// ORDER MATTERS, and it is the whole of why this is one function rather than
// lendUnique followed by takeBackLoan. Yours goes over FIRST, which frees the
// slot it was occupying, so theirs is guaranteed somewhere to land — a swap can
// therefore never be refused for want of room, however full the pack is. Done
// the other way round, a full pack would take theirs, fail to place it, and
// send it home: a trade that lost both halves.
//
// One line spoken, not two. A swap is a single moment between two people, and
// the gift bank is the right half of it to voice — being handed something is
// the part with delight in it, and 「はい、どうぞ」 for the half going back would
// be them narrating their own admin.
function swapWithMate() {
  const theirs = loanFrom(mate);
  const mine = inventory.heldUnique;
  if (!theirs || !mine) return;
  const bot = mate.bot;
  const key = bot.spec.key;
  const now = performance.now();
  rig.closeIn(bot.ch);
  social.greetedKey = key;
  social.greetCooldownUntil = now + CONFIG.social.greetCooldown;
  const again = Date.now() - inventory.lastGiven(key) < CONFIG.social.giftCooldown;
  if (!again) inventory.markGiven(key);
  inventory.setUnique(mine, { state: 'given', to: key });
  inventory.setUnique(theirs, { state: 'hand' });
  speak(bot, again ? 'giftAgain' : 'gift', now);
}

// Ask for a lent piece back. The warm half of a loan's ending, and now the only
// one there is — see uniques.pondMs for why the timer that used to do it from
// across the planet is gone.
//
// ROOM IS CHECKED FIRST, and that is not a nicety. `setUnique` sends a piece
// HOME when the pack has no slot for it — a sensible answer for a pickup off the
// grass, and quite the wrong one here, where it would end the loan and teleport
// the thing across the planet on the one press that was asking to hold it. So
// the refusal happens before anything is written, and a full pack leaves the
// piece exactly where it was: in their hands.
function takeBackLoan() {
  const id = loanFrom(mate);
  if (!id) return;
  if (!inventory.hasRoomFor(id)) { refuse('giveBack'); return; }
  const bot = mate.bot;
  const now = performance.now();
  // Same framing as 「はなす」. Being handed something back is a moment between
  // two people, and it should not be watched from an angle.
  rig.closeIn(bot.ch);
  // One hand — whatever was in it goes back to the pack, exactly as a pickup
  // off the ground does.
  inventory.putAway();
  inventory.setUnique(id, { state: 'hand' });
  // They hand it over and say so. `handBack` is a bucket a bank may not have,
  // and the fallback is the same half-drawn courtesy the sheets get: somebody
  // with no line for this still answers, with an ordinary one.
  speak(bot, bot.dlg.has('handBack') ? 'handBack' : 'poke', now);
}

// --- where 「おく」 puts it
//
// AT ARM'S LENGTH IN FRONT OF YOU, not under your feet.
//
// Under your feet is where it went, and the floor took it straight back off you:
// `nudgeLoose` shoves any loose piece within `interior.nudgeReach` of where you
// are standing, and nothing on the planet is nearer to that than the spot you
// are standing on. You set the bear down and it squirted out from between your
// ankles at the full shove. The distances below are all comfortably outside that
// reach and comfortably inside `uniques.reach`, so a thing you put down stays
// where you put it AND is still there to pick back up.
//
// Two more things fall out of placing it in front, both of which were the point
// as much as the shove was: you can SEE it land, rather than having it appear
// hidden under your own feet, and it lands inside the cone you are facing — so
// 「ひろう」 is offered for it the instant it is down. Setting a thing down and
// picking it up again became one symmetrical gesture instead of two unrelated
// ones.
const PLACE = {
  // Metres in front, longest first. The shorter tries are for setting something
  // down with your nose against a wall.
  steps: [0.95, 0.72, 0.52],
  // ...and then off to either side, because "straight ahead" with a tree in it
  // still has somewhere perfectly good half a step to the left. Radians.
  //
  // THE LAST PAIR IS NEARLY SQUARE ON, and it is there for one situation: stood
  // close to a wall and facing it. Everything genuinely in front of you then is
  // masonry, and the only floor left is beside you. Measured from two metres out
  // in a room you may walk 2.25 of, nothing inside 50° found anywhere at all and
  // the button refused — which is a correct refusal and a miserable one, because
  // the room was mostly empty. 80° is still somewhere you can see.
  fan: [0, 0.44, -0.44, 0.86, -0.86, 1.4, -1.4],
  // Kept off walls and trunks by about the margin a walk keeps.
  keep: 0.02,
};

const _pSpot = new THREE.Vector3();
const _pTan = new THREE.Vector3();

// A spot on the surface `metres` away along a bearing `turn` radians off your
// look. The great-circle step every other bit of placement here uses.
function spotAhead(metres, turn, out) {
  const A = rig.anchor;
  rig.facing(_pTan);
  if (turn) _pTan.applyAxisAngle(A, turn);
  const arc = metres / CONFIG.globe.radius;
  return out.copy(A).multiplyScalar(Math.cos(arc))
    .addScaledVector(_pTan, Math.sin(arc)).normalize();
}

// Somewhere a thing may actually be left.
//
// The solid test is asked with the feet at infinity ON PURPOSE: a solid with a
// `top` — a table, a stump — then reads as somewhere to put something rather
// than as something in the way, and putDownUnique lifts the piece onto it and
// runs its own topple check from there. Only the topless solids, which are
// trunks and walls, say no.
function canPlaceAt(spot) {
  if (inSolid(spot, PLACE.keep, 1e9)) return false;
  if (inBuilding(spot, PLACE.keep)) return false;
  // Water is REFUSED rather than accepted. ぽちゃん is a lovely answer to
  // deliberately aiming at a pond — see putDownUnique, which still does it for
  // a tap — and a rotten one to a button you pressed to tidy your hands.
  if (CONFIG.lakes.some((l) => inLake(spot, l))) return false;
  // NOT THROUGH A WALL. `inBuilding` above already refuses the masonry itself,
  // and this refuses the far side of it: the band is 0.95 thick and the longest
  // reach here is 0.95, so from hard against the outside you could otherwise
  // lay the bear on the rug indoors without going in.
  //
  // Asked as "the same side as me" rather than as a distance from the middle,
  // which is the question the doorway answers correctly for free — step inside
  // and both are true, so turning round and putting something down by the door
  // still works.
  //
  // This replaced a rim test of `interior.walk - nudgeReach`, which was stricter
  // than the wall and cost real floor: standing two metres out in a room you may
  // walk 2.25 of, everything in front was refused and the button shook its head
  // in an empty room.
  if (globe.isInside(spot) !== globe.isInside(rig.anchor)) return false;
  return true;
}

// Straight ahead if it can be, then nearer, then off to one side. Null when
// there is genuinely nowhere — nose into a corner — and the button refuses
// rather than inventing somewhere for you.
//
// Returns a SHARED vector. Clone it if you mean to keep it.
function placeSpot() {
  for (const turn of PLACE.fan) {
    for (const metres of PLACE.steps) {
      spotAhead(metres, turn, _pSpot);
      if (canPlaceAt(_pSpot)) return _pSpot;
    }
  }
  return null;
}

// Nowhere to put it. The pill shakes its head, because a button that silently
// does nothing reads as a broken button rather than as a refusal.
function refuse(key) {
  const rec = ixNodes.get(key);
  if (!rec) return;
  rec.el.classList.remove('is-refused');
  // Read a layout property, so re-adding the class on a second press restarts
  // the animation instead of being folded into the first one.
  void rec.el.offsetWidth;
  rec.el.classList.add('is-refused');
}

// --- the focus marks
//
// WHAT YOUR BUTTONS ARE ABOUT, drawn on the thing itself: a paper arrow
// floating over the piece 「ひろう」 would take, and over the friend the
// people-verbs would reach. Two marks because the two facings are independent
// and can both be live — a bear at your feet and Chiikawa in front of you are
// both marked, each by the verb that means it.
//
// THE ARROW REPLACED THE RING for focus duty, and it earned it twice over.
// Once for people: the ring was a walk-destination drawing, and a ring under a
// FRIEND reads as a lock-on — a grammar this world has never had — where a
// mark above the head sits exactly where attention already lives here, which
// is where the bubbles go. And once for things: a ring under a bear is half
// covered by the bear from most angles, and the work of raising it to a
// perched piece's height and cutting it to a lantern's foot was work spent
// making a ground drawing serve an OBJECT. The arrow gets both for free: it
// hangs off the piece's own anchor (so the perch lift comes with it) and
// stands a measured clearance above the piece's own posed body (so a leaning
// sasumata is cleared lean and all) — see setGrabMark in scene.js.
//
// The ring itself goes back to being what its note always said it was:
// complete, correct machinery for marking a spot ON THE GROUND, dormant until
// a verb wants one. It marked where 「おく」 would land once, and that story —
// why a mark that follows you everywhere is scenery — is kept at setWalkMarker.
//
// Gated on the verb actually being on offer rather than merely on there being
// a focus: with your hands full 「ひろう」 is withheld, and marking something
// the buttons will not act on is the same lie in a quieter voice. The person
// mark's own version of that rule: it steps aside while that friend's bubble
// is up. The two share an anchor on purpose — the mark says "your words land
// here" and the bubble IS the words landing — so showing both would be saying
// it twice, in the same spot, at two sizes.
function updateMark() {
  const grabOn = rig.isFirstPerson && focus && focus.loose && !inventory.heldUnique;
  globe.setGrabMark(grabOn ? focus.loose : null);
  const mateOn = rig.isFirstPerson && mate && !mate.bot.dlg.isVisible;
  globe.setMateMark(mateOn ? mate.bot.ch : null);
  // ...and the stump or the pudding, while the send-off is on offer. Read from
  // the same call the pill reads so the mark can never point at a different
  // stump from the one the button would use — see playSite, which is memoised
  // by the frame order below rather than by a cache: this runs after the stack
  // is built, in the same frame, off the same latch.
  const play = rig.isFirstPerson ? playSite() : null;
  globe.setSpotMark(play ? play.site : null);
}

// --- drawing the stack
//
// One node per verb, kept across frames and NEVER MOVED. Where a pill sits
// comes from the CSS `order` stamped on it when it is built, so an entry
// arriving or leaving cannot shuffle its neighbours. That matters more than it
// sounds: the entry that arrives usually arrives BECAUSE you have just walked
// up to something, which is precisely when your thumb is already travelling
// toward the pill below it.
const ixNodes = new Map();

function buildIx(key, announce) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ix ix-${key}`;
  // The corner going from empty to occupied, which is the one arrival worth
  // making noticeable — see .ix-fresh in the CSS. Taken off again on the way
  // out, because `animation` is a single property and the refusal shake wants it
  // back; a pill that kept this would refuse by bouncing instead of shaking.
  if (announce) {
    el.classList.add('is-fresh');
    el.addEventListener('animationend', () => el.classList.remove('is-fresh'), { once: true });
  }
  el.style.order = String(IX_ORDER.indexOf(key));
  // Two parts: the VERB, and — for the hand and light verbs — the thing it
  // will be done to. The verb is what you scan for and stays the size it was;
  // the name is smaller and second, because it answers "which one" rather than
  // "what".
  //
  // A THIRD slot lived here for one afternoon — 「ハチワレに」, who a people-
  // verb would reach — because two verbs were genuinely ambiguous and text was
  // the only answer the stack had. The focus mark answers it in the world now
  // (see updateMark), and the slot went with the names it carried: at its
  // widest the pill read 「わたす はなびらもようの おさかな ハチワレに」,
  // 289px of the 375 the screen has.
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${IX_GLYPH[key]}</svg>`
    + '<span class="ix-word"></span><span class="ix-of" hidden></span>';
  // TAP TO PRESS, DRAG TO LOOK. These pills float in the band where a camera
  // swipe naturally starts, and a button that acted on pointerdown swallowed
  // any drag that began on it — you aimed a look and pressed a verb instead.
  // So the press moved to the RELEASE, gated on the same tapSlop the world's
  // own taps use, and a press that travels turns into the camera drag it was
  // always meant to be: the pointer is handed to the look system mid-gesture.
  // The cost is honest — a verb now fires when the finger lifts rather than
  // when it lands — and imperceptible for every verb this applies to.
  //
  // 「あげる!」 keeps the old reflex. It is the one press in this game with a
  // deadline, it is always alone, and it is pinned down in the corner while it
  // exists (see is-low) — out of the drag band and too urgent to wait for a
  // finger to lift. やめる rides with it: the rod's two verbs should not need
  // two different kinds of press.
  let press = null;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    touched();
    if (key === 'strike' || key === 'reel') {
      ACTIONS[key].run();
      // The world just changed, under the very button that changed it, so the
      // stack is redrawn before the finger lifts rather than on the next frame.
      syncInteract();
      return;
    }
    // Captured so the moves keep coming to this handler wherever the finger
    // wanders; released again the moment the gesture declares itself a drag.
    capture(el, e.pointerId);
    press = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, travel: 0 };
  });
  el.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    press.travel += Math.hypot(e.clientX - press.lastX, e.clientY - press.lastY);
    press.lastX = e.clientX;
    press.lastY = e.clientY;
    if (press.travel <= CONFIG.player.tapSlop) return;
    // Past slop this is a drag, and the camera should have had it from the
    // start. Hand it over — unless a look or a pinch is already running on
    // another finger, in which case the press simply dies: one drag cannot
    // steer two cameras.
    if (look.id === null && pinch.a === null) {
      try { el.releasePointerCapture(press.id); } catch { /* already gone */ }
      capture(stage, press.id);
      pointers.set(press.id, { x: e.clientX, y: e.clientY });
      look.id = press.id;
      look.mode = 'orbit';
      look.ch = null;
      look.lastX = e.clientX;
      look.lastY = e.clientY;
      // The distance already travelled comes too, so letting go out there can
      // never fall under tapSlop and read as a tap on whatever ground the
      // finger happens to be over when it lifts.
      look.travel = press.travel;
    }
    press = null;
  });
  el.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const tap = press.travel <= CONFIG.player.tapSlop;
    press = null;
    if (!tap) return;
    ACTIONS[key].run();
    // The world just changed under the button that changed it — redrawn now
    // rather than on the next frame.
    syncInteract();
  });
  el.addEventListener('pointercancel', (e) => {
    if (press && e.pointerId === press.id) press = null;
  });
  return {
    el,
    label: el.querySelector('.ix-word'),
    of: el.querySelector('.ix-of'),
    word: '',
    name: '',
  };
}

// Asked of the world every frame rather than wired to events, because the thing
// that most often withdraws a verb is you walking away from it, and walking
// away fires nothing. Cheap: the answer is usually an empty list, and when it
// is not, only what actually changed is touched.
function syncInteract() {
  const want = actionsNow();
  // Read BEFORE anything is removed, so this is the state the last frame left
  // rather than the state this one is halfway through building.
  const wasEmpty = ixNodes.size === 0;

  // Gone from the world — you walk away from a stump mid-reach and the word
  // goes with the distance.
  for (const [key, rec] of ixNodes) {
    if (!want.includes(key)) { rec.el.remove(); ixNodes.delete(key); }
  }

  // Down into the thumb's arc while the rod is out, back up to eye level
  // otherwise — see .interact.is-low. Asked of the verb on offer rather than of
  // the rod directly, because the stack's HEIGHT is a fact about what it is
  // showing: whichever way a future deadline verb arrives, it belongs low for
  // the same reason 「あげる!」 does.
  ixEl.classList.toggle('is-low', want[0] === 'strike' || want[0] === 'reel');

  for (let i = 0; i < want.length; i++) {
    const key = want[i];
    let rec = ixNodes.get(key);
    if (!rec) {
      rec = buildIx(key, wasEmpty);
      ixNodes.set(key, rec);
      ixEl.appendChild(rec.el);
    }
    // Rewritten rather than rebuilt, so つける becoming けす — or ひろう turning
    // from くまさん to やかん as you look from one to the other — does not re-run
    // the arrival animation on a pill that never went anywhere.
    const word = ACTIONS[key].word();
    if (rec.word !== word) { rec.word = word; rec.label.textContent = word; }
    const name = ACTIONS[key].of ? ACTIONS[key].of() : '';
    if (rec.name !== name) {
      rec.name = name;
      rec.of.textContent = name;
      // Hidden rather than empty, so the pill loses the gap as well as the word
      // and shrinks back to exactly the shape a nameless verb wears.
      rec.of.hidden = !name;
    }
    // Filled is this app's word for "the one being offered", and it goes to the
    // BOTTOM entry, which is the one under the thumb. With a single verb on
    // offer — the common case by a long way — that entry is the only entry, and
    // the stack looks exactly like the one filled pill it replaced.
    rec.el.classList.toggle('is-primary', i === 0);
    // The strike is the one press in this game with a deadline on it. It gets
    // to be bigger, and it is always alone when it is showing.
    rec.el.classList.toggle('is-urgent', key === 'strike');
    // The air between families — see IX_GROUP. Decided from what is SHOWING
    // rather than from the table, which is the whole reason it is done here and
    // per frame: families turn up in pieces (a lone 「しまう」 with no 「おく」
    // beside it is ordinary), and a gap drawn from the static list would leave
    // one hanging under a space belonging to verbs that are not there.
    //
    // The pill that OPENS a family carries it, and `i > 0` is what keeps the
    // bottom of the stack flush — there is nothing under the first pill to be
    // spaced away from.
    const opensGroup = i > 0 && IX_GROUP[key] !== IX_GROUP[want[i - 1]];
    rec.el.classList.toggle('is-group', opensGroup);
  }
}

// The jump and the run are wired in move-input.js, where the space bar and the
// shift key ask for the same two things. Both handlers and the reasoning behind
// them went with the verbs.
//
// A tap ARMS the run rather than holding one: press it and your movement is a
// sprint until you stop moving, at which point it stands down by itself — the
// rig owns that, see the disarm in _walk — so there is no run mode left switched
// on to rediscover three strolls later.
//
// The lit state is painted from the rig every frame (see the loop) rather than
// toggled at the press, because the rig can stand the sprint down without being
// asked, and a button still lit after the run ended would be lying about the one
// thing it exists to say.

// --- the clock, and the day it opens into
//
// Collapsed it is a reading of the hour and nothing else. Opened it is the day
// as a strip you drag along, which is the shape the thing actually has: time of
// day is a continuum, and the cycle button this replaced could only ever walk
// it one way — four presses to go back one hour.

// The sun and the moon for the knob, taken from the same drawings that hang in
// the sky, trimmed of the transparent margin the sheet leaves around them.
// Using the real art rather than a drawn circle is the point: what you have
// hold of is the thing you can see up there.
function discFace(img) {
  const sheet = paintSheet(img, false);
  const b = sheetBounds(sheet);
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(sheet, b.minX, b.minY, w, h, 0, 0, w, h);
  return `url(${out.toDataURL()})`;
}

const KNOB_FACE = SKY_DISC_ART
  ? { sun: discFace(IMG.sun), moon: discFace(IMG.moon) }
  : { sun: 'none', moon: 'none' };

// --- which way somebody is, when they are not on screen to be seen
//
// The planet is 50 units around and the horizon from standing height is 4.8, so
// at any moment about nine tenths of the world is behind the curve. Once the
// three of them have scattered — and they cover 30 units a minute each, so that
// takes a couple of minutes — the ordinary state of things is that you can see
// nobody at all, in a place where every hillside looks like every other
// hillside. There was no way to answer "which way is anyone" except to pinch out
// to the far view, look, and come back down.
//
// So: a small face at the edge of the screen for anybody off it, with an arrow
// pointing the way. Only for what is genuinely off frame — somebody you can see
// needs no chip, and one hovering over a character who is right there would be
// clutter over the thing it is advertising.
//
// The house is one of these too, and is the one that makes the far view
// optional rather than necessary: it is the only landmark you can go inside, and
// before this the only way to find it was from orbit.
const marksLayer = document.getElementById('marks');
const markProbe = new THREE.Vector3();

// How far in from each edge a chip sits. A chip is only a drawing and cannot
// swallow a press, but one parked on top of a control still reads as something
// having gone wrong — so the two edges that now carry controls are held back
// further than the two that do not.
//
// The bottom clears the action cluster (68px of button over 26px of margin,
// plus room for the arrow above it) and the top clears the pill stack. Both
// were one number when every control lived in the bottom-right; splitting them
// is what the corner reshuffle costs, and it is cheaper than a chip riding on
// the clock.
const MARK_INSET = 34;
const MARK_INSET_TOP = 92;
const MARK_INSET_BOTTOM = 116;

function makeMark(face, at) {
  const el = document.createElement('div');
  el.className = 'mark';
  const tail = document.createElement('i');
  tail.className = 'mark-tail';
  const f = document.createElement('span');
  f.className = 'mark-face';
  f.style.backgroundImage = face;
  el.append(tail, f);
  marksLayer.appendChild(el);
  return { el, tail, at, on: false, angle: null };
}

// `at` fills in where the thing is, in the world group's own frame. Somebody
// at home no longer needs excluding: the spot the chip points at is the spot
// they are genuinely standing on — it happens to have a house around it, and
// the house's own chip stands beside theirs saying the same thing.
const marks = bots.map((b) => makeMark(
  discFace(IMG.sheets[b.spec.key].normal),
  (out) => {
    b.ch.headWorld(out);
    return true;
  },
));

// One chip per home. They are the only fixed things on the planet worth being
// pointed at, and with the cave twenty units from the house on a world whose
// horizon is under five, a chip is most of how you find it the first time.
for (const home of globe.homes) {
  // Both wear the house drawing, which is a compromise worth naming: the cave
  // has no card of its own that is not a retired stand-in, and a chip is a
  // twenty-pixel disc read at a glance. What distinguishes them on screen is
  // which way it points, not what is on it.
  marks.push(makeMark(discFace(IMG.houseDay), (out) => {
    // Halfway up the building rather than at its foot, so the arrow points at
    // the house you can see rather than at the ground under it. It only matters
    // when you are close enough for the two to differ, which is exactly when
    // the chip is about to hand over to the building itself.
    out.copy(home.sprite.anchor.position).addScaledVector(home.sprite.normal, 1.4);
    return true;
  }));
}

// Every chip, every frame. `show` is the whole gate: on the grass, in this
// world, with nothing else driving the camera.
//
// Off-frame is the ONLY thing that turns one on. Being over the horizon is not,
// even though that is the more common way to lose somebody — because a chip for
// a character who is dead ahead has nowhere honest to sit. Pinning it to an edge
// would point you sideways at somebody straight in front of you, which is worse
// than saying nothing: you are already walking the right way.
function positionMarks(show) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (const m of marks) {
    let live = show && m.at(markProbe);
    if (live) {
      // The planet floats and the camera does not, the same correction the
      // bubbles take.
      markProbe.y += globe.world.position.y;
      const dist = globe.camera.position.distanceTo(markProbe);
      markProbe.project(globe.camera);

      // Behind the camera, where the projection turns itself inside out. The
      // magnitude is meaningless there but the sign flips cleanly, so negating
      // recovers the bearing and the push-out below puts it on an edge.
      const behind = markProbe.z > 1;
      let x = behind ? -markProbe.x : markProbe.x;
      let y = behind ? -markProbe.y : markProbe.y;
      const far = Math.max(Math.abs(x), Math.abs(y));

      // Hysteresis on the screen edge, and it is not optional. Somebody walking
      // along the boundary crosses it several times a second, and with a quarter
      // of a second of fade on the chip that does not read as appearing and
      // disappearing — it reads as a light flashing. Once shown, a chip stays
      // until its owner is properly back in frame.
      if (!behind && far <= (m.on ? 0.96 : 1)) {
        live = false;                    // on screen: they can speak for themselves
      } else {
        // Dead behind you, so no bearing to keep. Down is the useful lie: it
        // is the one direction that cannot be mistaken for a way to walk, and
        // it reads as "turn round".
        if (far < 1e-4) { x = 0; y = -1; }

        // Placed ON the border of the inset box at its true bearing, rather than
        // clamped into it one axis at a time. The clamp is the obvious way and
        // it heaps chips into the corners: turn your back on all three of them
        // and two would land on exactly the same pixel, one drawn over the
        // other, when they are in fact in three different directions. Scaling
        // the bearing out to the border spreads them along it by where they
        // actually are.
        const halfW = w / 2 - MARK_INSET;
        const halfH = (h - MARK_INSET_TOP - MARK_INSET_BOTTOM) / 2;
        const midY = MARK_INSET_TOP + halfH;
        const dx = (x * 0.5 + 0.5) * w - w / 2;
        const dy = (-y * 0.5 + 0.5) * h - midY;
        const reach = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1e-4);
        const cx = w / 2 + dx / reach;
        const cy = midY + dy / reach;
        // The arrow points the way they are, which is the same direction the
        // chip was placed along — so the two cannot disagree.
        const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
        if (angle !== m.angle) {
          m.angle = angle;
          m.tail.style.transform = `rotate(${angle.toFixed(1)}deg)`;
        }
        // Shrink with distance, like the speech bubbles do, so a chip for
        // somebody round the far side of the planet does not shout as loudly as
        // one for somebody just off the edge of the screen.
        const k = Math.max(0.66, Math.min(1, 1 - (dist - 10) / 44));
        m.el.style.transform =
          `translate(-50%, -50%) translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) `
          + `scale(${k.toFixed(3)})`;
      }
    }
    if (live !== m.on) {
      m.on = live;
      m.el.classList.toggle('is-on', live);
    }
  }
}

// The knob's size, read off the stylesheet rather than written down twice.
const KNOB = parseFloat(getComputedStyle(timeKnob).width) || 30;

// The track is painted from LOOK, so the strip under your thumb is a picture of
// the sky it is dragging you towards and cannot drift from it. Stops are inset
// by the knob's radius to line up with where the knob can actually stand — and
// they land exactly, because a gradient and an absolute `left` both resolve
// their percentages against the same padding box.
timeTrack.style.background = `linear-gradient(90deg, ${
  PHASES.map((p, i) => {
    const f = i / (PHASES.length - 1);
    const at = `calc(${KNOB / 2}px + (100% - ${KNOB}px) * ${f.toFixed(4)})`;
    return `${LOOK[p].swatch} ${at}`;
  }).join(', ')
})`;

// Labels come from PHASES so they cannot fall out of step with the axis.
const markEls = PHASES.map((p, i) => {
  const el = document.createElement('span');
  el.textContent = PHASE_LABEL[p];
  el.style.left = `${(i / (PHASES.length - 1)) * 100}%`;
  timeMarks.appendChild(el);
  return el;
});

// THE CHIP'S GLYPHS, drawn rather than lettered. The two halves have to sit
// together in about 110px, and a second word ("ひる ゆき") would not fit without
// making the chip wider than the two pills it replaced — which was the point of
// merging them. A drawing of snow is also simply faster to read than the word.
//
// One cloud shape shared by everything that comes out of a cloud, so the family
// reads as a family and only the thing falling out of it changes.
const CLOUD = 'M7.4 15.2h9.2a3.3 3.3 0 0 0 0-6.6 5.1 5.1 0 0 0-9.8-1.3 3.05 3.05 0 0 0 .6 7.9Z';
const MARKS = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3.1v2.3M12 18.6v2.3M3.1 12h2.3M18.6 12h2.3M5.7 5.7l1.6 1.6M16.7 16.7l1.6 1.6M18.3 5.7l-1.6 1.6M7.3 16.7l-1.6 1.6"/>',
  moon: '<path d="M19.4 14.6A8.2 8.2 0 0 1 9.4 4.6a8.2 8.2 0 1 0 10 10Z"/>',
  cloudy: `<path d="${CLOUD}"/>`,
  drizzle: `<path d="${CLOUD}"/><path d="M10 18.2v2.2M14 18.2v2.2"/>`,
  rain: `<path d="${CLOUD}"/><path d="M8.6 18 7.7 21M12 18l-.9 3M15.4 18l-.9 3"/>`,
  storm: `<path d="${CLOUD}"/><path d="M13.6 17.6 10.3 21.6h2.7L12.2 24"/>`,
  clearing: `<circle cx="16.8" cy="6.4" r="2.6"/><path d="${CLOUD}"/>`,
  snow: `<path d="${CLOUD}"/><path d="M12 17.6v4.2M10.2 18.7l3.6 2M13.8 18.7l-3.6 2"/>`,
  blizzard: `<path d="${CLOUD}"/><path d="M9.6 18v3.6M8 18.9l3.2 1.8M11.2 18.9 8 20.7"/><path d="M15.6 19.4v2.8"/>`,
};

function setMark(el, key) {
  const d = MARKS[key];
  el.innerHTML = d
    ? `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`
    : '';
}

// Said in full for whoever is listening, because what they get otherwise is two
// pictures and one word. Both halves in one label, since it is one control.
function labelChip() {
  const w = activeWeather();
  const hour = `${PHASE_LABEL[phase]}${isAuto() ? '（じどう）' : ''}`;
  const sky = `${WEATHER_LABEL[w] || ''}${isAutoWeather() ? '（じどう）' : ''}`;
  chipBtn.setAttribute('aria-label', `そらのようす: ${hour}、${sky}`);
}

// The chip always reads as the hour you are IN, never as an hour a press would
// get you — a clock first and a control second. じどう is marked by a dot
// rather than the word, so the reading stays the same length in both modes.
function paintTime() {
  const auto = isAuto();
  chipHour.textContent = PHASE_LABEL[phase];
  // Sun by day, moon once the sky has one. The same test the scrubber's own knob
  // uses, so the thing in the chip and the thing on the track never disagree.
  setMark(chipHourMark, (phase === 'night' || phase === 'midnight') ? 'moon' : 'sun');
  chipEl.classList.toggle('is-auto-time', auto);
  labelChip();
  timeAuto.classList.toggle('is-on', auto);
  timeAuto.setAttribute('aria-pressed', auto ? 'true' : 'false');
}

// Driven from the world's own blend rather than from the pointer, every frame.
// That is what keeps the sun on the track and the sun in the sky in step even
// when nobody is dragging — press じどう and the knob slides over on its own.
let knobIsMoon = null;
function paintScrubber() {
  const pos = globe.dayPos;
  const span = PHASES.length - 1;
  timeKnob.style.setProperty('--p', (pos / span).toFixed(4));

  // Swaps at the point the sky's own card does, which is the midpoint of the
  // last leg — so the thing in your hand becomes the moon as the moon arrives.
  const moon = pos > span - 0.5;
  if (moon !== knobIsMoon) {
    knobIsMoon = moon;
    timeKnob.style.backgroundImage = moon ? KNOB_FACE.moon : KNOB_FACE.sun;
  }

  const near = Math.round(pos);
  for (let i = 0; i < markEls.length; i++) markEls[i].classList.toggle('is-on', i === near);
  timeTrack.setAttribute('aria-valuenow', String(near));
  timeTrack.setAttribute('aria-valuetext', PHASE_LABEL[PHASES[near]]);
}

// NO TIMER, and the flag it left behind was doing two jobs at once.
//
// `closeAt` was a timestamp that also stood in for "is this open" — so the panel
// could not stay up without the loop eventually taking it down, and every control
// inside it had to remember to push the deadline back by hand. That is the right
// arrangement for something you GLANCE at, which is what this was when it was a
// clock pill. It is the wrong one for a panel you WORK in: choosing a weather,
// dragging an hour, changing your mind. The sheet gave its own timer up for
// exactly this reason.
//
// So the state is a plain boolean and the panel closes when you close it — the
// chip again, or a press anywhere outside. Nothing to keep alive.
let chipOpen = false;
function openChip(open) {
  chipOpen = open;
  chipEl.classList.toggle('is-open', open);
  chipBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  // Painted here as well as in the loop, so the panel is already right in the
  // frame it appears in. Left to the loop alone it opens showing wherever the
  // day was when it last closed, and corrects itself a frame later — brief, but
  // exactly the sort of flicker that reads as something being broken.
  if (open) { paintSky(); paintScrubber(); }
}

// One panel for both halves of the sky, so there is no "one at a time" left to
// arrange: pressing the chip is the only way in and it brings the whole thing.
onPress(chipBtn, () => openChip(!chipOpen));

onPress(timeAuto, () => {
  if (isAuto()) return;
  setHour(null);
  applyPhase(activePhase());
  paintTime();
});

// --- dragging the day
let scrubbing = false;

// Where along the axis a pointer is, in phases. Measured against the padding
// box — `clientWidth`, not the bounding rect — because that is what the knob's
// own percentages resolve against. Using the outer width instead puts the far
// end of the drag a couple of pixels past where the knob can actually go, so
// the last sliver of the track would never quite reach よる.
function posFromEvent(e) {
  const r = timeTrack.getBoundingClientRect();
  const inner = timeTrack.clientWidth;
  const border = (r.width - inner) / 2;
  const span = inner - KNOB;
  const f = span > 0 ? (e.clientX - r.left - border - KNOB / 2) / span : 0;
  return Math.max(0, Math.min(1, f)) * (PHASES.length - 1);
}

function scrubTo(e) {
  const pos = posFromEvent(e);
  globe.scrubDaylight(pos);
  // The hour follows the finger rather than waiting for the release, so the
  // cast dozes off as you drag past dusk. Only the sky is still being held.
  const near = phaseAtIndex(pos);
  if (near !== phase) {
    setHour(near);
    adoptPhase(near);
  }
}

// A press does not scrub yet, because a press is not yet a drag. Tapping the
// far end of the track and having the sky cut straight to it would throw away
// the whole reason the cross-fade exists — so a tap fades like the clock would,
// and only a finger that actually moves takes hold of the sky directly.
let armed = false;
let downX = 0;

timeTrack.addEventListener('pointerdown', (e) => {
  armed = true;
  scrubbing = false;
  downX = e.clientX;
  capture(timeTrack, e.pointerId);
  timeTrack.classList.add('is-held');
  // Never let this reach the canvas: the track sits where a look-around swipe
  // would otherwise start.
  e.preventDefault();
  e.stopPropagation();
  const now = performance.now();
  social.touched(now);
  rig.markTouched(now);
});

timeTrack.addEventListener('pointermove', (e) => {
  if (!armed) return;
  // A few pixels of slop, so a thumb that rolls slightly on a tap is still a
  // tap. Past it, the finger owns the sky.
  if (!scrubbing && Math.abs(e.clientX - downX) < 3) return;
  scrubbing = true;
  scrubTo(e);
  e.preventDefault();
});

function releaseTrack(e) {
  if (!armed) return;
  armed = false;
  timeTrack.classList.remove('is-held');

  if (scrubbing) {
    scrubbing = false;
    const settled = globe.endScrub();
    setHour(settled);
    adoptPhase(settled);
  } else {
    // A tap: go to the nearest hour, and get there the way everything else
    // does — over the full fade, not instantly.
    const target = phaseAtIndex(posFromEvent(e));
    setHour(target);
    applyPhase(target);
  }
  paintTime();
}

timeTrack.addEventListener('pointerup', releaseTrack);
timeTrack.addEventListener('pointercancel', releaseTrack);

// --- the sky
//
// WHICH SKIES THE PANEL OFFERS, in the order they are laid out. Written here
// rather than taken from Object.keys(WEATHERS) because the ORDER is a reading
// and the table's is an argument: the table groups the rain family together so
// its numbers can be compared, and the panel runs dry to wet along the top row
// and puts the two snows at the end, where the one weather that is not more or
// less rain belongs.
//
// Checked against the table on the way in, so a sky listed here that the world
// has never heard of is a loud failure at start-up rather than a button that
// silently does nothing.
const SKY_PICKS = [
  'clear', 'cloudy', 'drizzle', 'rain',
  'storm', 'clearing', 'snow', 'blizzard',
];
for (const key of SKY_PICKS) {
  if (!WEATHERS[key]) throw new Error(`sky panel: no such weather '${key}'`);
}

const skyEls = SKY_PICKS.map((key) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'sky-pick';
  el.textContent = WEATHER_LABEL[key];
  el.setAttribute('aria-pressed', 'false');
  onPress(el, () => {
    setWeatherOverride(key);
    paintSky();
  });
  skyGrid.appendChild(el);
  return { key, el };
});

// The pill reads as the sky you are IN, never as the one a press would get you
// — a reading first and a control second, exactly as the clock is. じどう is the
// dot rather than the word for the same reason it is there: so the label does
// not change width when the mode does.
let skyLabelWas = null;
function paintSky() {
  const now = activeWeather();
  const auto = isAutoWeather();
  if (now !== skyLabelWas) {
    skyLabelWas = now;
    setMark(chipSkyMark, now);
    // A CLEAR SKY SAYS NOTHING. The weather half only appears when the weather is
    // doing something — otherwise the chip would carry a sun beside a sun, and
    // the one state that needs no comment would be the noisiest thing up there.
    chipEl.classList.toggle('is-plain', now === 'clear');
  }
  chipEl.classList.toggle('is-auto-sky', auto);
  labelChip();
  skyAuto.classList.toggle('is-on', auto);
  skyAuto.setAttribute('aria-pressed', auto ? 'true' : 'false');
  // The chosen one is filled, and NOTHING is filled while the schedule is
  // driving — on じどう the panel is showing you what the day is doing rather
  // than what you picked, and lighting up whichever sky happened to be out
  // would read as a choice somebody made.
  for (const p of skyEls) {
    const on = !auto && p.key === now;
    p.el.classList.toggle('is-on', on);
    p.el.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}


onPress(skyAuto, () => {
  if (isAutoWeather()) return;
  setWeatherOverride(null);
  paintSky();
});

// Pressing anywhere else puts it away. Capture phase so it is decided before
// the canvas starts a look or a walk, and passive so it never eats that press.
document.addEventListener('pointerdown', (e) => {
  // The sheet is modal: while it is up, a press is about the sheet and none of
  // the tidying below should read it as having moved on. Without this, tapping a
  // row of the 図鑑 folds the drawer holding its pill, and the drawer takes the
  // 図鑑 down with it. The sheet's own three dismissals are wired where it is.
  if (sheetMode) return;
  if (chipOpen && !chipEl.contains(e.target)) openChip(false);
}, { capture: true, passive: true });

applyPhase(activePhase(), { instant: true });
paintTime();
paintScrubber();
paintSky();
globe.warmSkies();

// --- start gate, which is also the gesture iOS needs before handing over tilt
startEl.addEventListener('click', () => {
  if (started) return;
  started = true;
  startEl.classList.add('is-gone');
  // 620ms is what the going-in transition takes — see `.start.is-gone`. Taking the
  // element out before it has finished would cut the tail off the very move this
  // is here to play; leaving it in afterwards keeps a fullscreen layer composited
  // over the world forever.
  setTimeout(() => { startEl.style.display = 'none'; }, 640);

  // THE HUD WAITS FOR THE DOOR TO SHUT. It used to fade up in the same frame the
  // menu began leaving, so for a quarter of a second the pill stack and the
  // menu's own buttons were on screen together, both half-transparent, and the
  // two crossing over was most of what made the handover feel muddled. 260ms is
  // the interface layer's own exit — so the controls start arriving as the last
  // of the menu's words go, and land while the scenery is still opening out.
  setTimeout(() => controls.classList.add('is-ready'), 260);

  const now = performance.now();
  social.lastTouchAt = now;
  rig.markTouched(now);
  // The same tap that starts the app is the one iOS requires before it will
  // hand over device tilt.
  rig.enableGyro();
  speak(bots[0], 'greet', now);
}, { once: true });

// Everything the three of them notice: you arriving, each other, and the water.
//
// All of it is about the planet, so none of it runs while you are in the house.
// That is not because it would be invisible from in there — it is because it
// would be wrong. Every distance in here is an arc measured from `rig.anchor`,
// which indoors is the doorstep you left rather than anywhere you are, so
// standing in a room would go on greeting whoever happened to walk past the
// front door. They keep wandering the whole time; they simply stop noticing
// you, which is exactly what going inside should mean.
//
// Lifted out of frame() whole when the room arrived, and unchanged besides —
// the alternative was a wrapper that put ninety lines out by one indent.
// It is Social.update now, reached through the `updateCast` delegate above so
// the frame still reads the same. The paragraph stays because it is the reason
// the whole block is gated on being outdoors, and that reasoning is about this
// app's geometry rather than about the scheduler.
//
// ONE THING CHANGED IN THE MOVE, and it is a fix rather than a transcription:
// the two lines that held a pair of friends still through their conversation
// wrote `ch.busyUntil = Math.max(...)`. That field no longer exists — character.js
// replaced it with the hold ledger, where the same booking is
// `hold('talk', until, true)` — so what was left here had been quietly writing a
// property nobody reads. Two of them meeting still spoke, and then both walked
// off mid-exchange, which is exactly the bug the reply timing above was written
// to prevent. Social does it through the ledger.

// updateGuests stood here — the indoor twin of updateCast, for a room that
// was another world. One world now, one loop: walking in on whoever is home
// is the same walking-up the grass has always had, and the roof overhead
// picks the words. See the greeting in updateCast.

// --- loop
let prev = performance.now();
// The one pending callback. There must never be a second: see the note where
// it is armed.
let rafId = 0;

function frame(now) {
  // Never negative, and the floor is not paranoia. Every ease in the app is
  // `x += (target - x) * (1 - exp(-dt / tau))`, and that coefficient is only
  // between 0 and 1 while dt is positive: hand it a negative dt and exp goes
  // above one, the coefficient goes NEGATIVE, and the term that should shrink
  // the gap grows it instead. Measured with a clock stepped backwards by hand:
  // the walk throttle, which lives in 0..1, reached 1.9e20 in a few frames and
  // fired the camera across the planet.
  //
  // requestAnimationFrame's own clock is monotonic, so the live loop cannot do
  // this — but anything driving frame() itself can, which is exactly what
  // hidamari.step does, and one clamp is cheaper than every ease in the project
  // having to be robust on its own.
  const dt = Math.max(0, Math.min(now - prev, 66));
  prev = now;

  // One rig, always driving. The doorway used to take the camera here for its
  // choreographed passage; the passage is a doorway you walk through now, so
  // there is nothing to take it FOR.
  // The keys' turn at the throttle, before the rig reads it. A thumb on the pad
  // writes on its own events and wins outright while it is down — see the
  // precedence note in move-input.js — so on a touch device this is a no-op.
  // ...and it takes the frame's own step now, because in the selfie the same
  // keys drive the camera instead, and a swing measured in frames rather than
  // in time pans at whatever rate the machine happens to render at.
  moves.tick(dt);

  rig.update(dt, now);
  const inside = insideHouse();

  // THE WEATHER, before anything that asks about it. Two things read it this
  // frame — the household, which decides whether anybody is running for a door,
  // and the scene, which decides what the world is wearing — and both would be
  // a frame behind if this ran anywhere later.
  //
  // It runs whether or not the visit has started, unlike the household below.
  // The sky is not something you arrive into the middle of: `wet` fills and
  // drains on a slow clock, and a director first ticked at the tap that
  // dismisses the start card would begin every rainy visit with dry ground.
  const wx = tickWeather(dt, now);
  if (lightningStruck()) {
    flash = 1;
    strike(now);
  } else if (flash > 0) {
    // Out fast and squared, so the world drops back to the storm rather than
    // easing down through it. A flash you can time is a lamp being switched on.
    flash = Math.max(0, flash - dt / CONFIG.weather.boltMs);
  }
  globe.setWeather(wx, flash * flash * CONFIG.weather.boltLift, iceLook());

  // THE THAW HANDS BACK ANYBODY IT WAS CARRYING, on the one frame the ice stops
  // bearing weight. See `leaveWater` for why this is not optional: a walker
  // left standing in water can never plan a step out of it, so without this the
  // pond quietly keeps whoever was on it when it melted — an hour after the
  // snow, with nobody watching, which is the worst possible time to find a bug.
  const ice = pondsFrozen();
  if (iceWas && !ice) {
    for (const b of bots) b.ch.leaveWater();
  }
  iceWas = ice;
  slipOnIce(dt, now);

  // Somebody looks up. On the one frame it becomes worth looking at, and never
  // again for that arc — see noticeBow.
  const bowNow = rainbowOut();
  if (bowNow && !bowWas) noticeBow(now);
  bowWas = bowNow;

  const lying = snowCover();
  globe.updateRain(dt, {
    anchor: rig.anchor,
    wet: wetness(),
    snow: lying,
    // A FRACTION and not `inside`, which is the boolean the rest of this frame
    // works from. Standing in the doorway is standing half in the rain, and the
    // scene already answers that question exactly — see insideAmount.
    inside: globe.insideAmount(rig.anchor),
    alt: rig.alt,
  });

  // TRACKS. Everybody who is walking on the planet leaves them — you and all
  // three of them — and the scene decides whether there is any snow to leave
  // them in, so there is no test here.
  //
  // YOURS COMES FROM THE RIG AND ONLY ON FOOT. `rig.anchor` is where you are
  // STOOD, which is what a footprint is about; the camera is somewhere else
  // entirely once you rise, and a trail printed from the sky would be a line of
  // prints scrawled across the world by nobody. Flying leaves nothing, which is
  // both correct and the reason this is gated rather than clamped.
  //
  // Theirs comes from the character's own dir, walking or not — a body that has
  // not moved covers no stride and so prints nothing, which is the same rule
  // handling standing still, sitting down and being asleep without knowing that
  // any of those exist.
  if (rig.isFirstPerson) globe.tread('you', rig.anchor);
  for (const b of bots) globe.tread(b.spec.key, b.ch.dir);

  // COATS ON. Read off the cover rather than off the sky, which is what puts
  // them on late and takes them off long after the last flake — see snowCover
  // in weather.js, and setDressed in character.js for why this is a cut and not
  // a fade.
  //
  // The scenery dresses off the same number, from inside the scene — see
  // `dressAt`, which is one threshold precisely so that the cast and the bushes
  // cannot change on different frames.
  // WHAT YOUR OWN FACE IS DOING, which nothing asked until there was a view
  // that looks at it. You have no line bank and so no expression of your own;
  // this is the one thing worth saying with it — pleased, while somebody's hand
  // is in yours. Everything else is the resting face, as before.
  //
  // OUTSIDE THE SNOW EDGE BELOW, and that is the whole of why it is here rather
  // than three lines further down. That block runs only on the frame the cover
  // crosses `dressAt`, so a face swap inside it would have waited for the
  // weather to change before your expression could — which on a clear day is
  // never. The same edge-guard trap the hand's own leash fell into once.
  // A CHOSEN POSE WINS, and おまかせ falls back to what this always did.
  const want = youPose || (household.handHeld ? 'happy' : 'normal');
  if (want !== youGlad) {
    youGlad = want;
    you.setExpression(want);
  }

  const wrapped = lying > CONFIG.weather.dressAt;
  if (wrapped !== dressed) {
    dressed = wrapped;
    for (const b of bots) b.ch.setDressed(wrapped);
    you.setDressed(wrapped);
  }

  // Going home runs wherever you are, and has to: the walk to the door happens
  // whether or not you are watching, and somebody home when you get there is
  // home because this put them there.
  if (started) household.update(dt, now, inside, rig.anchor);

  // Where you are STOOD, for the cast to notice. Taken from the rig rather
  // than worked out from the camera, which swings back off the overhead line
  // as you climb.
  const watcher = { dir: rig.anchor, alt: rig.alt };

  // Everybody, everywhere, against the one camera there is. Somebody at home
  // still breathes and blinks like anybody else, because they are standing on
  // the same planet as anybody else.
  for (const b of bots) {
    b.ch.attentive = rig.focus === b.ch;
    b.ch.update(dt, now, globe.camera, watcher);
  }

  // You. Only there at all once you are high enough not to be standing inside
  // your own head, and on your own patch of ground rather than under the camera
  // — the fade, the leash, the transit rules and the glide are all body.js's.
  body.update(dt, now, globe.camera);
  // The anchor comes from the rig a few lines up, and has to: the sky is hung
  // off where you are stood, so it is stale by a frame if read any earlier.
  //
  // The rig also answers whether you are on the ground, because it is the only
  // thing that can. The scene sees a camera that has been lifted, and cannot
  // tell a jump or a tabletop from the sky — see the hand in scene.js.
  globe.update(now, rig.anchor, rig.isFirstPerson, rig.selfieOn);

  // The rod, if it is out. It reels itself in when you walk off; leaving the
  // ground is the one thing it cannot see from the anchor alone, so that is
  // said here.
  if (fishing.active && !rig.isFirstPerson) fishing.cancel();
  fishing.update(now, rig.anchor, globe.camera);

  // Lent pieces finding their way home.
  tickUniques(now);
  tickTopple(now);
  carryLent();

  // `globe.setWalkMarker(rig.goto, dt)` ran here, and stopped when nothing set
  // `rig.goto` any more: it was written by `walkTo`, which only tap-to-walk ever
  // called. The marker was kept rather than deleted, the same way `flat` in
  // lakeGeo is, on the reasoning that the machinery is correct and the day a
  // verb wanted it it would be a one-line call away.
  //
  // THAT DAY CAME. It is called from `updateMark` further down this same frame,
  // and it marks what you are facing or where the thing in your hands will land
  // — see the note there. It is not called from here because it has to be
  // decided AFTER the focus is, and the focus is settled with the buttons.

  // Shove the bear about, if your feet are anywhere near it. Only from the
  // ground: shoving furniture from the sky is not a verb this app has, and the
  // BODY's spot rather than the camera's anchor because it is your body that
  // does the shoving — the two agree while you are stood, and where they part
  // company (mid-flight) the answer is that you are not touching anything.
  //
  // IT USED TO ALSO REQUIRE BEING INDOORS, and that had stopped being true long
  // before it stopped being written. The gate said `insideHouse()`, on the
  // reasoning that the room is "where the only loose thing in the world is
  // lying" — which it was, when the loose pieces were furniture. The carryable
  // uniques ended that: a bear can be set down anywhere on the planet, and
  // nudgeLoose was taught the outdoor case at the time (see the room clamp,
  // which asks WHICH room and steps aside when the answer is none). The gate was
  // simply never opened to match, so the one thing that could reach that code
  // out of doors — your shins — could not. A bear on the grass was a bear you
  // walked straight through.
  globe.nudgeLoose(rig.isFirstPerson ? body.dir : null, dt);

  // The day runs on its own — it is the one thing here that does — and the
  // interior reads its light off the same blend the sky does (see tintIn in
  // daylight.js), so dragging the clock indoors moves the room around you.
  globe.updateDaylight(dt);

  // Only while it is on screen — the rest of the time nothing can see it.
  if (chipOpen) paintScrubber();
  // The chip is a READING, so its weather half is repainted whether or not the
  // panel is open — a front rolling in has to change the corner the same way it
  // changes the sky. paintSky guards its own writes, so on the frames where
  // nothing has moved this is a couple of class toggles.
  paintSky();

  if (started) {
    for (const b of bots) {
      b.dlg.update(now);
      b.ch.setTalking(b.dlg.isTyping);
    }

    // The hour moves whichever clock is keeping it — the real one, or the fast
    // one that a hand-picked hour starts — so this asks either way now. It used
    // to ask only on じどう, on the reasoning that nothing about waiting should
    // take a chosen hour back off you; what it actually did was stop the world
    // dead the moment you chose. The two rates differ because the questions do:
    // a wall clock that changes phase four times a day is not worth re-reading
    // as often as one that does it every couple of minutes.
    //
    // Never mid-scrub. applyPhase drives the cross-fade, and a finger dragging
    // the sky directly is already saying what it should show; both at once and
    // the day fights the thumb holding it.
    if (!scrubbing && now > phaseCheckAt) {
      const d = CONFIG.daylight;
      phaseCheckAt = now + (isAuto() ? d.checkMs : d.fastCheckMs);
      applyPhase(activePhase());
    }

    updateCast(now);

    // The word AND the arrow turn over together, so the button says what
    // pressing it does rather than where you presently are.
    const label = rig.goingUp ? 'じめんへ' : 'そらへ';
    if (viewCap.textContent !== label) {
      viewCap.textContent = label;
      viewToggle.setAttribute('aria-label', label);
      viewGlyph.classList.toggle('is-down', rig.goingUp);
    }

    // The action buttons exist where their verbs do: on the ground. In the sky
    // there is nothing to jump off or run on, and two dead buttons beside two
    // live pills would teach that buttons here sometimes just do not work.
    // An armed sprint is stood down at takeoff too — the disarm in _walk only
    // runs on foot, so without this a run armed on the grass would survive the
    // whole flight and fire on landing.
    const onFoot = rig.isFirstPerson;
    if (jumpBtn.classList.contains('is-off') === onFoot) {
      jumpBtn.classList.toggle('is-off', !onFoot);
      if (!onFoot) rig.sprintOn = false;
    }

    // THE HAND, EVERY FRAME — not on the takeoff edge above.
    //
    // These three lived inside that block and were wrong there in a way worth
    // recording: it fires only when the on-foot state CHANGES, so a hand let go
    // by the WEATHER — which happens with both feet on the ground — left the
    // leash on your walk and the pills lying about it until the next time you
    // happened to take off. Measured: capped to a leading pace with nobody to
    // lead, for the rest of the session.
    //
    // OFF THE GROUND IS OUT OF REACH — but only once you are genuinely off it.
    // `onFoot` flickers false for a few frames whenever the surface under you
    // changes height (a stump, the doorstep lip), and releasing on the first of
    // them broke the hold on an ordinary walk. Half a second of continuous air
    // is a glide or the sky climb; a surface wobble never lasts that long.
    // Climbing out of the world takes the selfie with it: `setSelfie` refuses
    // off the ground, and this is what stands it down rather than leaving a
    // switch on that nothing is honouring.
    if (!onFoot && rig.selfieOn) rig.setSelfie(false);

    if (onFoot) handAirAt = 0;
    else if (household.handHeld) {
      if (!handAirAt) handAirAt = now;
      else if (now - handAirAt > 550) releaseHand();
    }
    // ...and if the world let go for you, your own walk is free again. The
    // household drops the hand inside its own mode exit; this keeps the two in
    // step without either having to know about the other.
    if (rig.leash && !household.handHeld) rig.leash = false;
    // ...and who else the lens should make room for. A point rather than a
    // person, so the rig stays ignorant of the household — see pairAim.
    rig.pairAim = household.handHeld ? household.handHeld.ch.dir : null;
    sprintBtn.classList.toggle('is-off', !onFoot || !!household.handHeld);
    viewToggle.classList.toggle('is-off', !!household.handHeld);
    // NO CAMERA, NO CAMERA BUTTON. The ability lives in Hachiware's compact
    // camera — the loose piece resting in the cave — and exists exactly while
    // that piece is in your pack or your hand. `slotOf` covers both, because
    // the hand IS a slot; 'placed' and 'given' and 'home' all empty it, so
    // setting the camera down on a stump takes the feature with it, and picking
    // it back up returns it, with no bookkeeping beyond what the pouch already
    // does. Hidden rather than greyed: an ability you have not found is not
    // disabled, it is undiscovered — the button appearing IS the unlock.
    //
    // ...and if the camera leaves your hands MID-SHOT — set down, lent to a
    // friend — the view stands down the same way it does when your feet leave
    // the ground: by this frame noticing, not by every exit path having to
    // remember. The photo sheet is deliberately not closed with it; a picture
    // already taken is yours, however the camera left.
    const hasCam = inventory.slotOf('hachiwareCamera') >= 0;
    if (rig.selfieOn && !hasCam) rig.setSelfie(false);
    selfieToggle.classList.toggle('is-gone', !hasCam);
    // ...and on the frame it BECOMES true, say so. Announced from here rather
    // than from the pickup itself because there is more than one way for a
    // camera to reach your hands — off the cave floor, out of the pouch, handed
    // back by a friend — and the thing worth announcing is the ability arriving
    // rather than any one of the ways it can.
    //
    // A rising edge, not a state: `camSeen` starts at whatever the saved pack
    // says, so opening the game already carrying the camera is not a discovery
    // and says nothing. See the seed above.
    //
    // AND IT RESETS WHEN THE CAMERA GOES, so picking it up again says it again.
    // This line was left out at first, on the grounds that telling you twice is
    // noise — which is the wrong worry by a mile. The notice is four seconds
    // long, it appears while your attention is on the thing you just picked up
    // rather than on the corner it is pointing at, and MISSING IT COSTS YOU THE
    // WHOLE FEATURE: nothing else in the game ever mentions the camera again.
    // A repeat costs four seconds to somebody who is deliberately juggling the
    // thing. The asymmetry is not close, and it is the general rule for any
    // notice that teaches rather than confirms — make it recoverable, and let
    // the player earn the repeat by doing the thing that earned it the first
    // time.
    if (hasCam && !camSeen) { camSeen = true; showUnlock(); }
    else if (!hasCam) camSeen = false;
    // Off the ground there is nothing to look back at — and the far view has
    // the camera anyway, so the switch would be a promise this cannot keep.
    // The word turns over with the state, exactly as そらへ's does.
    selfieToggle.classList.toggle('is-off', !onFoot);
    const selfieWord = rig.selfieOn ? 'まえを みる' : 'じぶんを みる';
    if (selfieCap.textContent !== selfieWord) selfieCap.textContent = selfieWord;
    selfieToggle.setAttribute('aria-pressed', rig.selfieOn ? 'true' : 'false');
    // The shutter and the poses come and go with the view they belong to.
    const shooting = rig.selfieOn && onFoot;
    shotBtn.classList.toggle('is-gone', !shooting);
    poseWrap.classList.toggle('is-gone', !shooting);
    // A drawer left hanging open under a button that has just gone is a panel
    // floating in a corner attached to nothing. Shut on the way out rather than
    // hidden with it, so pressing じぶんを みる again finds it closed.
    if (!shooting && poseWrap.classList.contains('is-open')) openPoses(false);
    // ...and the walking controls go the other way. Hidden rather than greyed,
    // because in this view they are not disabled — they are irrelevant, and the
    // screen is a viewfinder. move-input.js refuses them all independently, so
    // a keyboard cannot walk you out of a shot either; this is only what the
    // eye sees. See MoveInput.frozen.
    stickEl.classList.toggle('is-gone', rig.selfieOn);
    actionsEl.classList.toggle('is-gone', rig.selfieOn);

    // What you are looking at, then what that lets you do, then the ring that
    // says so. STRICTLY THIS ORDER: every verb in the stack is now a question
    // about the focus, and the mark is a drawing of the answer — so a focus
    // settled after the stack was built would put a word on screen for a thing
    // the ring was not under, for one frame, every time you turned.
    //
    // All three redrawn from the world rather than from events, because the
    // thing that most often changes them is you walking or turning, and neither
    // fires anything. updateFocus already gives up off the ground, so the sky
    // empties this corner for free.
    updateFocus(now);
    syncInteract();
    updateMark();

    // A CARRIED LAMP BRINGS ITS LIGHT WITH IT. The light's position is an empty
    // object parented to the piece's own anchor — see the note where it is
    // built — so keeping the anchor over your feet is the whole of it: the
    // pool, the halo and the light on the walls all follow, and none of them
    // has to be told. The anchor stays invisible, because what you can see is
    // the copy in your hand.
    const heldLamp = inventory.heldUnique && ITEMS[inventory.heldUnique].art;
    if (heldLamp && globe.roomLights.some((L) => L.art === heldLamp)) {
      const loose = uniqueByItem(inventory.heldUnique);
      if (loose) {
        // Carried FIRST, then moved. placeLoose leaves a carried piece carried
        // — see the exception in it — so the order here is what stops the walk
        // over your feet from putting the lantern back on the ground under you
        // on every frame.
        globe.carryLoose(loose);
        globe.placeLoose(loose, rig.anchor);
      }
    }

    // The sprint button shows the rig's own truth, every frame: the run can
    // stand itself down (you stopped) or be stood down (you took off), and in
    // both cases the light has to go out without anybody pressing anything.
    if (sprintBtn.classList.contains('is-on') !== rig.sprintOn) {
      sprintBtn.classList.toggle('is-on', rig.sprintOn);
      sprintBtn.setAttribute('aria-pressed', rig.sprintOn ? 'true' : 'false');
    }

    // Leaving the ground mid-push should not leave a pad hanging there — nor a
    // finger still feeding one. Dropping the id as well as the drawing is what
    // stops a thumb that never lifted from steering an invisible pad the moment
    // you land again; the pointer just goes inert until it comes up.
    if (!rig.isFirstPerson) moves.cancel();

    positionBubbles();
    // Only down on the grass, and only under the sky. From the sky the whole
    // planet is in frame and the far view IS the map — chips there would be
    // arrows pointing at things you are already looking at — and under the
    // roof every arrow points through a wall.
    positionMarks(rig.isFirstPerson && !inside);
  }

  globe.render();

  // The handle is kept because the loop ARMS ITSELF here, which makes calling
  // frame() from anywhere else a way to fork it rather than to advance it: the
  // manual call queues a callback of its own, that callback queues another, and
  // now there are two loops running forever. hidamari.step cancels this before
  // each of its own calls for exactly that reason — a few hundred debug steps
  // was otherwise a few hundred concurrent render loops and a page that never
  // recovered.
  rafId = requestAnimationFrame(frame);
}

// How close a clamped bubble may come to the edge of the screen. Wide enough
// to leave the tail somewhere to poke when it has flipped to the top.
const BUBBLE_MARGIN = 14;
// ...and how far the tail stays clear of the bubble's own rounded corners, so
// it never slides out onto the curve and stops looking attached.
const TAIL_INSET = 18;

// Staying on screen matters more than staying exactly over the speaker's head.
//
// Walk right up to somebody and their head leaves the top of the frame; the
// bubble followed it off and the line played where you could not see it, with
// nothing to tell you one had been missed — you had to back away or look up on
// a hunch. So the box is held inside the viewport, and the tail slides along
// its edge to keep pointing at whoever is talking, flipping to the top when
// that is where they are. The bubble moves, and it never stops naming its
// speaker; only the tail has to work for its living.
function positionBubbles() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const gap = CONFIG.dialogue.bubbleGapPx;
  for (const b of bots) {
    if (!b.dlg.isVisible) continue;
    // Never through the wall: a speaker on the other side of it projects onto
    // the front of the house perfectly well, and their line would hang on the
    // masonry. The chatter gates already avoid starting such a line; this
    // catches the one that was mid-say when somebody crossed the threshold.
    if (throughWall(b.ch)) { b.bubble.style.opacity = '0'; continue; }
    b.ch.headWorld(anchor);
    // The planet floats on a slow bob and its cast floats with it.
    anchor.y += globe.world.position.y;
    const dist = globe.camera.position.distanceTo(anchor);
    anchor.project(globe.camera);
    // z beyond 1 means the anchor is behind the camera, where projection flips.
    // Off the sides or well under the bottom still hides outright: clamping a
    // bubble in from there would park it beside somebody you cannot see. Above
    // the top is the one direction that does not hide, because that is where
    // the person you are stood closest to goes.
    // `isPresent` and not `isVisible`, because a sleeper is neither drawn as a
    // body nor gone: what stands in for them is a card lying in the bedding,
    // headWorld already points at it, and a mumble has to hang over that.
    if (anchor.z > 1 || !b.ch.isPresent || Math.abs(anchor.x) > 1.0 || anchor.y < -1.2) {
      b.bubble.style.opacity = '0';
      continue;
    }
    b.bubble.style.opacity = '';
    const ax = (anchor.x * 0.5 + 0.5) * w;
    const ay = (-anchor.y * 0.5 + 0.5) * h;
    // Shrink with distance, or a speaker out near the horizon gets the same
    // full-size bubble as one stood in front of you, pointing at a speck.
    const k = Math.max(0.55, Math.min(1, 1 - ((dist - 7) / 26) * 0.45));

    // The box, unscaled: transform-origin sits at its bottom centre, so scaling
    // pivots there and this is the only measurement needed to know where every
    // edge lands.
    const bw = b.bubble.offsetWidth;
    const bh = b.bubble.offsetHeight;
    const halfW = (bw * k) / 2;

    // Where the tail would go if nothing were in the way, then pulled back
    // inside the screen. A viewport too narrow for the bubble itself has no
    // clamp to make, so it just centres rather than flipping the range inside
    // out and pinning it to whichever edge lost.
    const loX = BUBBLE_MARGIN + halfW;
    const hiX = w - BUBBLE_MARGIN - halfW;
    const cx = hiX >= loX ? Math.min(hiX, Math.max(loX, ax)) : w / 2;
    const cy = Math.max(BUBBLE_MARGIN + bh * k, ay - gap);

    // How far the speaker ended up from the middle of the box, back in the
    // box's own unscaled pixels — which is what the tail's offset is measured
    // in, since it is scaled along with everything else in there.
    const room = Math.max(0, bw / 2 - TAIL_INSET);
    const shift = Math.min(room, Math.max(-room, (ax - cx) / k));
    b.bubble.style.setProperty('--tail-shift', `${shift.toFixed(1)}px`);
    // Above the top edge of the box means they are above the bubble, which
    // after the clamp above means they are off the top of the screen.
    b.bubble.classList.toggle('tail-up', ay < cy - bh * k);

    b.bubble.style.transform =
      `translate(-50%, -100%) translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) scale(${k.toFixed(3)})`;
  }
}

rafId = requestAnimationFrame(frame);

// --- offline support
// Skipped on localhost: the worker serves cache-first, so during development it
// would keep handing back the previous version of every file you just edited.
const IS_LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname);
if ('serviceWorker' in navigator && !IS_LOCAL) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// DO ANY TWO FOOTPRINTS OVERLAP — asked once, out loud, and only while
// developing. See auditSolids in sphere.js for why this is worth a boot check:
// every ejection in this project is single-pass, which is correct exactly as
// long as the props it ejects from do not intersect, and nothing else in the
// game will ever tell you when that stops being true.
//
// A warning rather than a throw. An overlap is usually cosmetic — two bushes
// sharing a hand's width of ground — and refusing to start over it would be a
// worse bug than the one it reports. What it buys is that the day a piece of
// furniture is authored on top of another, the reason is in the console instead
// of being inferred from a bear that keeps getting stuck in a corner.
if (IS_LOCAL) {
  const clashes = auditSolids();
  if (clashes.length) {
    const R = CONFIG.globe.radius;
    console.warn(
      `[hidamari] ${clashes.length} overlapping solid footprint(s) — `
      + 'ejections are single-pass and can land inside the neighbour. '
      + 'Point peek.html at these to see them.',
      clashes.map((c) => ({
        pair: `#${c.i}+#${c.j}`,
        overlap: +(c.overlap * R).toFixed(3),
        radii: [+(c.a.r * R).toFixed(2), +(c.b.r * R).toFixed(2)],
        tops: [c.a.top, c.b.top],
      })),
    );
  }
}

// Handle for poking at the scene from the console while developing. Never
// defined on the deployed site.
if (IS_LOCAL) {
  window.hidamari = {
    // `social` is here for the reason social.js was written: a conversation's
    // state used to be a dozen module-level `let`s that nothing could reach, so
    // "why is nobody talking" had no answer short of adding a log line. Now the
    // cooldowns are fields on one object — `meetUntil`, `nextChatterAt`,
    // `greetedKey` — which can be read, and set to 0 to try the thing again
    // without waiting out the cooldown.
    bots, rig, globe, household, you, fishing, inventory, social,
    // The frame itself, so the whole of it can be driven by hand. A headless or
    // hidden tab gets no `requestAnimationFrame` at all, which means the HUD
    // paint — the half of every feature that decides what is on screen — is
    // simply not running, and "the button did not appear" cannot be told apart
    // from "no frame ever ran". Call it a few times with rising timestamps.
    frame,
    // The footprint check the boot ran, kept reachable so it can be asked again
    // after a config edit without a reload — and so that "it printed nothing"
    // can be told apart from "it never ran", which is the one thing a silent
    // check can never say for itself.
    // The collision discs themselves, which is what you want in front of you
    // the moment anything is clipping: every one of them is `{dir, r}` plus a
    // `top` if it is something you can stand on, and that pair is the whole of
    // what the world means by solid.
    solids: () => solids(),
    audit: () => ({
      // How many footprints were compared, so that a clean result reads as
      // "checked and clean" rather than as "the list was empty".
      checked: solids().length,
      overlaps: auditSolids().map((c) => ({
        pair: `#${c.i}+#${c.j}`,
        overlap: +(c.overlap * CONFIG.globe.radius).toFixed(3),
      })),
    }),
    // THE SKY, by hand. `sky('rain')` holds it there; `sky()` gives it back to
    // the schedule. Every key in WEATHERS is fair game — see weather.js.
    //
    // This is the only way in to the rain at the moment, and it is deliberately
    // a console handle rather than a control: the weather is meant to be
    // something that happens to you, and a button for it would make it a
    // setting. What the pill should eventually show is what the sky IS, not a
    // list to pick from.
    sky: (key) => setWeatherOverride(key),
    // What it is right now, and what today's deal has in store. `forecast()`
    // reads out the whole day at a glance, which is the only practical way to
    // find out whether the seed you are looking at has any rain in it at all —
    // over half of them do not.
    weather: () => ({
      now: activeWeather(),
      auto: isAutoWeather(),
      wet: Number(wetness().toFixed(3)),
      snow: Number(snowCover().toFixed(3)),
      bow: Number(rainbow().toFixed(3)),
      today: forecast(),
    }),
    // Snow lays over a minute and a half and melts over twenty — see layMs and
    // meltMs — which is exactly right to live in and hopeless to work on. This
    // puts the cover wherever you want it so the coats, the white ground, the
    // gathering and the snowmen can each be looked at without waiting out a
    // winter for them.
    //
    // It sets the ground and lets the sky go on doing whatever it was doing, so
    // `lay(1)` under a clear sky is the morning after — white everywhere,
    // nothing falling, everybody in coats.
    lay: (v = 1) => setSnowCover(v),
    // Everything the sky can be, for tab completion.
    skies: Object.keys(WEATHERS),
    // Straight in and straight out, for poking at the room without having to
    // walk there. Debug teleports, and the only ones left in the app: goIn
    // stands you mid-room facing the door, goOut on the doorstep facing it.
    //
    // `i` picks which home — 0 is Chiikawa's house and 1 Hachiware's cave, in
    // CONFIG.homes order. It defaults to 0, so every call that existed before
    // there were two of them still means what it meant.
    house: (i = 0) => (globe.homes[i] ? globe.homes[i].sprite.normal.clone() : null),
    goIn(i = 0) {
      const home = globe.homes[i];
      if (!home || !globe.doorstepDir(doorSpot, undefined, home)) return null;
      const n = home.sprite.normal;
      // A step back from the middle along the door's bearing, facing the door.
      // How far back is a fraction of THIS room rather than a fixed 1.1: the
      // cave is a smaller hollow, and a step measured for the house would put
      // you in its far wall.
      playerDir.copy(doorSpot).addScaledVector(n, -doorSpot.dot(n)).normalize();
      const a = (home.spec.walk * 0.49) / CONFIG.globe.radius;
      probe.copy(n).multiplyScalar(Math.cos(a)).addScaledVector(playerDir, -Math.sin(a)).normalize();
      rig.standAt(probe, doorSpot);
      rig.settle();
      return probe.clone();
    },
    goOut(i = 0) {
      const home = globe.homes[i];
      if (!home || !globe.doorstepDir(doorSpot, undefined, home)) return null;
      rig.standAt(doorSpot, home.sprite.normal);
      rig.settle();
      return doorSpot.clone();
    },
    // Drive the loop by hand. A backgrounded or offscreen tab is never handed a
    // requestAnimationFrame, so everything here stops dead the moment the page
    // is not being composited — which is exactly the state an automated check
    // or a devtools session on a second monitor leaves it in, and it looks for
    // all the world like the app has hung. This steps it regardless.
    step(times = 1, ms = 16) {
      for (let i = 0; i < times; i++) {
        // Disarm before advancing, or every step forks the loop — frame() arms
        // its own successor on the way out, so stepping N times without this
        // leaves N callbacks pending and the app runs N times over from then
        // on. One is left armed at the end, so the live loop picks straight
        // back up when the page is composited again.
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        frame(prev + ms);
      }
    },
    // Where a character currently sits on screen, for aiming a test tap.
    // Taken from the body sprite itself rather than reconstructed from the
    // surface normal, which is off by the billboard's lean.
    screenOf(key) {
      const b = bots.find((x) => x.spec.key === key);
      if (!b) return null;
      const v = new THREE.Vector3();
      globe.scene.updateMatrixWorld(true);
      b.ch.bodyMesh.getWorldPosition(v);
      v.project(globe.camera);
      return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        behind: v.z > 1,
        visible: b.ch.isVisible,
      };
    },
  };










}
