import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CAST, PLAYER } from './cast.js';
import { BANKS } from './lines.js';
import { Globe } from './scene.js';
import { PlanetCamera } from './camera-control.js';
import { Household } from './household.js';
import { Character } from './character.js';
import { Dialogue } from './dialogue.js';
import {
  dirFromLatLon, inLake, inBuilding, inSolid, slideAround, perchUnder,
} from './sphere.js';
import {
  activePhase, isAuto, setPhaseOverride,
  PHASE_LABEL, PHASES, LOOK, phaseAtIndex,
} from './daylight.js';
import { IMG, ICON_CAT, SKY_DISC_ART } from './assets.js';
import { paintSheet, sheetBounds } from './art.js';
import { loadArt } from './assets.js';
import { ITEMS, Inventory, itemIcon, SLOTS } from './items.js';
import { Fishing } from './fishing.js';
import {
  buildPlushie, buildTeapot, buildLantern, buildTrashBag, buildTrashBagAlt,
  buildPinkWeapon, buildBlueWeapon, buildOpenBook, buildHouseKey,
} from './furniture.js';

const stage = document.getElementById('stage');
const startEl = document.getElementById('start');
const layer = document.getElementById('bubbles');

// How far in we are, said twice: as a car driving the road on the start screen,
// and as a number beside it. Both come off `--p`, which the CSS turns into a
// position for the car and a length of covered road behind it — so the two can
// never disagree, and easing the move is a transition rather than anything
// counted here.
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

// Between these two altitudes the body condenses from nothing to fully there.
// The low end is the floor of flight: below it you are landed, or dropping all
// the way back, and the camera is standing exactly where the body would be —
// there is nothing honest to draw from inside your own head. The high end is
// passed early in any climb, so by the time the view has tilted down enough to
// bring your own spot properly on screen, whoever is standing on it is already
// solid and the fade itself is never caught midway.
const BODY_LO = CONFIG.camera.landSnap;
const BODY_HI = 6.0;

// WHERE THE BODY IS, which is not where the camera is once you are off the
// ground — and the two being the same thing is what made the far view look
// broken.
//
// The rig's anchor is both "the point you are above" and "where you would
// land", and a globe-view swipe moves it: that is what makes spinning the
// planet also carry your spot around. Stood the body on the anchor and the
// camera is derived from that same anchor, so the two can never move relative
// to each other — measured at NDC 0.324 before a 3.8-unit swipe and NDC 0.324
// after it, the identical pixel. The planet turned under a Momonga nailed to
// the glass, which reads as a sticker on the lens rather than somebody stood
// in a field.
//
// So off the ground the body keeps its own spot and simply stays on the grass
// it was standing on, exactly like a tree does — it rotates with the terrain,
// slides across the view, and goes over the curve if you fly far enough. That
// is the whole fix: parallax it could not have while it was welded to the eye.
const youDir = rig.anchor.clone();
const _prevYou = youDir.clone();
const _youAxis = new THREE.Vector3();
let youMoving = false;

// ...but never lost. A leash tows the body along once your spot gets this far
// from it, so flying to the far side of the planet cannot strand the one thing
// you climbed up to look at. In world units at the globe's radius — comfortably
// inside the horizon at every altitude the body is visible at (0.96 radians of
// cap at the low end), so a towed body is off to one side of the view, never
// off it.
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
// like anybody else — the same hop the whole cast uses — and only leaps into
// the sheet with its arms out when the ground is genuinely tearing past. Tying
// the pose to altitude instead had the body gliding through every idle moment
// up there, arms out over a planet nobody was moving.
//
// Measured off the body rather than chosen: the planet's own idle drift tows it
// at 0.12, an ordinary swipe peaks at 5.3, and a hard one averages 10.9 and
// tops out past 14. Ten sits in the gap between the last two — clear of every
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

// Latched (with the hysteresis above) and then eased, so `glide` is both the
// decision and how far into it the body has got.
let gliding = false;
let glide = 0;

// THE TRANSIT RULES, for the towed body only. These used to be the ONLY thing
// keeping a drawn body out of a trunk, because the camera was allowed through
// one; the camera is stopped by the same props now (see SOLIDS in sphere.js),
// so most of what follows fires only while you are airborne and the leash is
// long enough for the body to lag across something you have flown over. It is
// kept for exactly that, and because a card sliding through a trunk is not a
// freedom anybody enjoys, it is a bug they can see. So while the body is
// visible and being towed:
//
//   The house and the solid props (trees, stumps, the bench) deflect it,
//   at the same berth the wandering cast gives a wall. Deflection can hold the
//   body a prop's radius past the leash, which is fine: the leash exists so
//   you cannot be STRANDED, and "beside the tree your spot is under" is not
//   stranded. The moment the body fades out it follows the anchor exactly, so
//   none of this can fight the landing snap.
//
//   Water is not dodged, it is JUMPED — the one answer to "crosses a lake"
//   that this particular character has always had. Being over water feeds the
//   same latch the speed does, so the arms-out sheet and the lift ride the one
//   ease whichever reason put them there. The margins are hysteresis: wider to
//   stay wet than to get wet, so a tow crawling along a shoreline cannot
//   strobe the pose at the water's edge.
const WATER_ENTER = 0.012;   // radians past the shore before the jump begins
const WATER_STAY = 0.04;     // ...and how far clear it lands on the far side
let overWater = false;

// The pace the body makes FOR ITSELF when the leash alone would leave it
// somewhere wrong — sliding round a trunk or a wall, and carrying a jump on to
// the far shore when the tow stops over the pond. A jump has to finish: the
// leash is content to park the body mid-air over the water it was crossing,
// and a glide frozen over a pond is nobody's idea of a jump, so while wet it
// walks itself on toward your spot, which the rig guarantees is dry ground.
// Walking pace, not glide pace — this is the landing half of a leap and the
// tread of a detour, and both should read as feet, not physics.
const CARRY_SPEED = 3.4;

// Who is home, and the lit windows that say so. Built after the cast, because
// it is about them.
const household = new Household({ globe, bots });

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

// Stood at the edge of a lake, rather than in one.
//
// It used to mean in one, which is now impossible — the rig refuses the step.
// Left as it was, the whole `water` bank would simply never be reached again.
// The shore is the better trigger anyway, because it is what the lines already
// say: 「あっ、ぬれちゃうよ…!」 is a warning that you *will* get wet and
// 「あっ、そこ みずだよ!」 is pointing the water out to you. Both read oddly
// aimed at somebody stood in the middle of a pond, and exactly right aimed at
// somebody who has just walked up to one.
function playerAtWater() {
  for (const lake of CONFIG.lakes) {
    if (inLake(playerDir, lake, CONFIG.player.shoreNotice)) return true;
  }
  return false;
}

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

// Now that they roam the whole planet, "can I see them" has to mean actually
// in frame — not merely on this side of the horizon. Otherwise a speech bubble
// turns up at the edge of the screen with nobody attached to it.
function onScreen(ch) {
  if (!ch.isVisible) return false;
  ch.headWorld(probe);
  probe.y += globe.world.position.y;
  probe.project(globe.camera);
  return probe.z < 1 && Math.abs(probe.x) < 1.0 && Math.abs(probe.y) < 1.1;
}

// Whether a wall stands between you and them. Everyone is in the one world
// now, so the projection alone cannot say — somebody sat at home projects
// onto the front of the house perfectly well. A line spoken through masonry
// is the thing this exists to stop; the open door is narrow enough that
// treating the wall as total costs one rare charming case and saves the
// constant absurd one.
function throughWall(ch) {
  return globe.isInside(ch.dir) !== insideHouse();
}

function canChatter(ch) {
  if (!onScreen(ch) || throughWall(ch)) return false;
  if (rig.isFirstPerson && arcBetween(ch.dir, playerDir) > CONFIG.social.farSpeakArc) return false;
  return true;
}

let started = false;
let nextChatterAt = 0;
let lastTouchAt = 0;
let saidLongIdle = false;

// social state
let greetedKey = null;
let greetCooldownUntil = 0;
let meetUntil = 0;
let pendingReply = null;
let wasInWater = false;
let waterQuietUntil = 0;

// --- pointer routing
//
// Two gestures run at once, tracked separately: one thumb on the movement pad
// and one finger on the camera. They have to be separate — treating any second
// pointer as a pinch meant reaching in with your other hand to look around
// zoomed instead, and tore down whatever the first hand was doing.
//
// A pinch is therefore two *camera* fingers, never the pad plus one.
const pointers = new Map();
// `grab` is a loose piece that was under the finger when the pad took it — see
// onDown. The pad keeps hold of it so that letting go without having pushed can
// mean "pick that up" rather than nothing at all.
const pad = { id: null, travel: 0, lastX: 0, lastY: 0, grab: null };
const look = { id: null, mode: null, ch: null, lastX: 0, lastY: 0, travel: 0 };
const pinch = { a: null, b: null, start: 0 };

function touched() {
  lastTouchAt = performance.now();
  saidLongIdle = false;
  rig.markTouched(lastTouchAt);
}

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
    const p = b.ch.hitTest(raycaster);
    if (!p) continue;
    const d = p.distanceToSquared(globe.camera.position);
    if (d < bestD) { bestD = d; best = { ch: b.ch, point: p }; }
  }
  return best;
}

function anyoneSpeaking() {
  return bots.some((b) => b.dlg.isVisible);
}

function silenceOthers(except) {
  for (const b of bots) if (b !== except && b.dlg.isVisible) b.dlg.hide();
}

// gapMin/gapMax are the QUIET between lines, so this takes the moment the last
// one ends rather than the moment it began. They used to be the same call —
// scheduleNext(now) at the point of speaking — which was near enough while
// every line lasted about three seconds flat. Now that a long one runs to
// seven, a gap counted from the start would frequently be up before the line it
// was supposed to follow, and the three of them would talk without a pause
// anywhere in it.
function scheduleNext(from) {
  const d = CONFIG.dialogue;
  nextChatterAt = from + d.gapMin + Math.random() * (d.gapMax - d.gapMin);
}

function speak(bot, bucket, now) {
  silenceOthers(bot);
  bot.dlg.say(bucket, now);
  scheduleNext(now + bot.dlg.durationMs);
}

function speakAmbient(bot, now) {
  silenceOthers(bot);
  bot.dlg.ambient(now);
  scheduleNext(now + bot.dlg.durationMs);
}

// Being spoken TO — the poke, the greeting — with a beat after it before the
// same friend will answer again. See social.pokeQuietMs.
//
// Every way of addressing somebody comes through here rather than through
// `speak` directly, which is the whole point: the guard belongs to the ACT of
// poking and not to the button that happens to be the newest way of doing it.
// Tapping a friend spams exactly as well as pressing 「はなす」 does, and a rule
// that only covered the pill would have fixed the symptom I noticed and left the
// one I did not.
//
// AN ABSORBED PRESS IS SILENT, and that is a deliberate exception to the rule
// `refuse` states — that a button answering a press with silence reads as
// broken. It is not silence: they are mid-sentence, the bubble is on screen, and
// the answer to "say something" is the thing they are already saying. What would
// read as broken is the alternative, which is what this replaced — cutting a
// friend off mid-word to start them again.
//
// The window is measured from the END of the line, so it is asked AFTER the
// line has been picked: `durationMs` is a property of the line, and there is no
// line to ask about until `speak` has chosen one.
function pokeBack(bot, bucket, now) {
  if (now < (bot.quietUntil || 0)) return false;
  speak(bot, bucket, now);
  bot.quietUntil = now + bot.dlg.durationMs + CONFIG.social.pokeQuietMs;
  return true;
}

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
  if (spot && CONFIG.lakes.some((l) => inLake(spot, l))) {
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
      // Too near the rim: it goes down where you put it, and then it goes
      // over. See topple() for why this is scripted rather than simulated.
      if (arc > edge * CONFIG.uniques.perch) startTopple(id, spot, perch);
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
  // see carryLent. Without it the piece simply vanished for six minutes, which
  // is a strange way to be given a bear.
  inventory.setUnique(id, {
    state: 'given', to: key, returnAt: Date.now() + CONFIG.uniques.returnMs,
  });
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

// Lent and pond-swallowed pieces coming home, checked coarsely — a return is
// a minutes-scale event and nobody is watching the exact second.
let uniquesTickAt = 0;
function tickUniques(now) {
  if (now < uniquesTickAt) return;
  uniquesTickAt = now + 1500;
  for (const id of Object.keys(inventory.uniques)) {
    const rec = inventory.unique(id);
    if (rec.state === 'given' && Date.now() >= rec.returnAt) {
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
  const ids = [...pointers.keys()].filter((id) => id !== pad.id);
  if (ids.length < 2) return;
  clearLook();
  pinch.a = ids[ids.length - 2];
  pinch.b = ids[ids.length - 1];
  pinch.start = gapBetween(pinch.a, pinch.b);
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
  if (!hit && pad.id === null && rig.isFirstPerson && inStickZone(e)) {
    pad.id = e.pointerId;
    pad.travel = 0;
    pad.grab = grabbable;
    pad.lastX = e.clientX;
    pad.lastY = e.clientY;
    showStick(e);
    readStick(e);
    return;
  }

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
      rig.dolly(pinch.start / d);
      pinch.start = d;
    }
    return;
  }

  if (e.pointerId === pad.id) {
    pad.travel += Math.hypot(e.clientX - pad.lastX, e.clientY - pad.lastY);
    pad.lastX = e.clientX;
    pad.lastY = e.clientY;
    readStick(e);
    touched();
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
    if (throughWall(b.ch)) continue;
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
    lastTouchAt = now;
    rig.markTouched(now);
    return;
  }

  if (e.pointerId === pad.id) {
    pad.id = null;
    hideStick();
    // A tap in the corner with no push used to mean "walk over there". It
    // means nothing now: the stick is for walking and a tap is for pointing,
    // and the pad's corner is the one place a tap could never have been
    // pointing at anything anyway.
    //
    // With ONE exception, and it is the reason the pad keeps `grab`: a thing
    // lying at your feet is pointing at something, and the pad's corner is
    // exactly where it appears. Let go without having pushed the stick and the
    // press was a tap on that; push the stick and it was a walk, and the piece
    // is still there to be tapped when you come back.
    if (pad.grab && pad.travel < CONFIG.player.tapSlop) takeLoose(pad.grab);
    pad.grab = null;
    lastTouchAt = now;
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
      greetedKey = bot.spec.key;
      greetCooldownUntil = now + CONFIG.social.greetCooldown;

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
      // A loose piece under the tap, near enough to reach: pick it up. First,
      // because it is the most specific thing a tap can be pointing at.
      const grab = (rig.isFirstPerson && !inventory.heldUnique)
        ? globe.pickLoose(raycaster, rig.anchor, UNIQUE_ARTS) : null;
      if (grab) {
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
  lastTouchAt = now;
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
  rig.dolly(e.deltaY > 0 ? 1.12 : 1 / 1.12);
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
const timeBtn = document.getElementById('time-toggle');
const timeEl = document.getElementById('time');
const timeAuto = document.getElementById('time-auto');
const timeTrack = document.getElementById('time-track');
const timeKnob = document.getElementById('time-knob');
const timeMarks = document.getElementById('time-marks');

function onPress(el, fn) {
  el.addEventListener('click', () => {
    fn();
    const now = performance.now();
    lastTouchAt = now;
    saidLongIdle = false;
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
const zukanEl = document.getElementById('zukan');
const zukanBtn = document.getElementById('zukan-toggle');

const sheetEl = document.getElementById('sheet');
const sheetCard = document.getElementById('sheet-card');
const sheetTitle = document.getElementById('sheet-title');
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
  pouchEl.classList.toggle('is-open', mode === 'pack');
  zukanEl.classList.toggle('is-open', mode === 'zukan');
  // Nothing carries across an open or a close: a drag in progress and a question
  // waiting for an answer are both only meaningful against the grid they started
  // on. cancelDrag also takes the ghost off screen, which would otherwise be
  // left floating over a closed sheet.
  cancelDrag();
  askN = null;

  if (mode === 'pack') { sheetTitle.textContent = 'もちもの'; paintPack(); }
  else if (mode === 'zukan') { sheetTitle.textContent = 'ずかん'; paintZukan(); }
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
  lastTouchAt = now;
  saidLongIdle = false;
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
  if (zukanEl.classList.contains('is-open')) paintZukan();
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

onPress(zukanBtn, () => openZukan(!zukanEl.classList.contains('is-open')));

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
// The clock and the 図鑑 fold behind one button, and そらへ and もちもの do not.
// The split is HOW OFTEN, not what kind: the first two are things you visit and
// the last two are things you live in, and a permanent pill for each of the four
// was 214px of furniture standing over the corner of a drawing to serve two of
// them well.
//
// It sits below the pills it hides, so opening it pushes nothing: the two you
// live in keep their positions whether this is out or away, and the thing you
// press is always where you left it.
const ctlStack = document.getElementById('ctl-stack');
const menuBtn = document.getElementById('menu-toggle');
let menuCloseAt = 0;

function openMenu(open) {
  ctlStack.classList.toggle('is-more', open);
  menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  menuCloseAt = open ? performance.now() + CONFIG.daylight.closeMs : 0;
  // Shutting the drawer takes whatever it had open with it, or a panel would be
  // left hanging in the air off a button that is no longer on screen.
  if (!open) { openTime(false); openZukan(false); }
}

onPress(menuBtn, () => openMenu(!ctlStack.classList.contains('is-more')));

// --- movement pad
// Purely a drawing: it has no pointer events of its own and appears wherever
// your thumb lands in the lower-left, so there is never anything to reach for.
// The canvas owns the touch, which is what lets a character under your thumb
// take priority over it.
const stick = document.getElementById('stick');
const knob = document.getElementById('stick-knob');
const stickOrigin = { x: 0, y: 0 };

function inStickZone(e) {
  const z = CONFIG.player.stickZone;
  return e.clientX < window.innerWidth * z.x && e.clientY > window.innerHeight * z.y;
}

function showStick(e) {
  stickOrigin.x = e.clientX;
  stickOrigin.y = e.clientY;
  stick.style.left = `${e.clientX}px`;
  stick.style.top = `${e.clientY}px`;
  knob.style.transform = '';
  stick.classList.add('is-live');
}

function readStick(e) {
  let dx = e.clientX - stickOrigin.x;
  let dy = e.clientY - stickOrigin.y;
  const max = CONFIG.player.stickRadius;
  const len = Math.hypot(dx, dy);
  if (len > max) { dx *= max / len; dy *= max / len; }
  knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;

  let nx = dx / max;
  let ny = dy / max;
  if (Math.hypot(nx, ny) < CONFIG.player.deadzone) { nx = 0; ny = 0; }
  rig.setMove(nx, ny);
}

function hideStick() {
  stick.classList.remove('is-live');
  knob.style.transform = '';
  rig.setMove(0, 0);
}

// Two rungs again — ground and sky — because the room stopped being a rung:
// it is a place you walk into, not a mode you switch out of. It works from
// indoors like anywhere else: the roof is something the lift clears and the
// shell gets out of the way of, not a reason to refuse.
onPress(viewToggle, () => {
  if (rig.goingUp) rig.goToGround();
  else rig.goToSky();
});

// --- the action buttons: jump and sprint
//
// Both on pointerdown rather than click, because both are about NOW: a jump
// that waits for the finger to come back up lands after the moment that asked
// for it, and arming a run belongs to the press, not the release.
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
  // Half-angles, radians. NARROW TO ACQUIRE, WIDE TO KEEP. Turning toward
  // something is deliberate and should need aim; drifting a little off what you
  // are already holding on to is not, and should not cost you it.
  cone: 0.61,
  keep: 1.05,
  // Stood on top of it, a bearing is noise: the tangent toward something under
  // your feet swings through a half circle for millimetres of movement. Inside
  // this, being there IS facing it.
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
  meet: CONFIG.social.greetArc,
  meetHold: CONFIG.social.greetArc + 1.1,
};

// What to call a thing on a button. The uniques bring their names from the item
// table; the bulb is not an item and never will be — you cannot carry a light
// fitting — so it gets its name here.
const ART_NAME = { bulb: 'でんき' };
for (const it of Object.values(ITEMS)) if (it.art) ART_NAME[it.art] = it.name;

const _fTan = new THREE.Vector3();
const _fLook = new THREE.Vector3();
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
    if (gap <= s.hold && (off <= FOCUS.keep || gap <= FOCUS.onTop)) {
      keep = { ...s.cur, score: scoreOf(gap, off) };
    }
  }

  // The best thing you are actually looking at. Narrow cone, arm's reach.
  let best = null;
  s.each((c) => {
    const dir = focusDir(c);
    const gap = gapTo(dir);
    if (gap > s.reach) return;
    const off = bearingTo(dir);
    if (off > FOCUS.cone && gap > FOCUS.onTop) return;
    const score = scoreOf(gap, off);
    if (!best || score < best.score) best = { ...c, score };
  });

  if (!keep) { settleFacing(s, best, now); return; }
  if (sameFocus(best, keep)) { s.cur = keep; return; }
  if (!best || now - s.at < FOCUS.dwellMs) { s.cur = keep; return; }
  if (best.score > keep.score * FOCUS.beat) { s.cur = keep; return; }
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
const IX_ORDER = ['strike', 'reel', 'stow', 'put', 'grab', 'fish', 'light', 'talk', 'give', 'giveBack'];

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
  give: 'friend',
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
  // The same arrow the other way about — away from you, toward them. The pair
  // are deliberately mirror images: 「わたす」 and 「かえして」 are one object
  // making one journey, and which way it is going is the whole of the
  // difference between them.
  give: '<path d="M18.6 7.8H9.7a4.4 4.4 0 0 0 0 8.8h3.6"/>'
      + '<path d="m15.1 4.3 3.5 3.5-3.5 3.5"/>',
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
  give: {
    word: () => (inventory.heldUnique ? 'かす' : 'わたす'),
    run: handToMate,
  },
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
  if (!rig.isFirstPerson) return [];

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
  // Something in your hand and somebody in front of you is the whole condition.
  // It reads the HAND rather than the pouch on purpose: handing over what you
  // are holding is a gesture, and reaching into your bag mid-conversation to
  // find something to hand over is a different one that the pouch panel already
  // covers — pick it up there and this appears.
  if (mate && (inventory.holding || inventory.heldUnique)) list.push('give');
  if (loanFrom(mate)) list.push('giveBack');
  return list;
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
  return bearingTo(school.pond.centre) <= FOCUS.keep;
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
  greetedKey = bot.spec.key;
  greetCooldownUntil = now + CONFIG.social.greetCooldown;
  // Absorbed while they are still answering the last one — see pokeBack. The
  // framing above happens either way, because squaring up on a friend who is
  // mid-sentence is exactly right.
  pokeBack(bot, 'poke', now);
}

// Hand over what you are holding. The gesture that used to be a tap, made a
// verb — see the note in onUp for why it could not stay a tap.
//
// TWO WORDS FOR TWO DIFFERENT ENDINGS, which is the real prize. A stackable is
// gone when you give it and a unique comes home on a timer, and until now those
// two were the same gesture with no way to tell them apart: you handed Chiikawa
// the lamp exactly as you handed her a fish, and found out ninety seconds later
// which one it had been. The pill says 「わたす」 or 「かす」 before you press it.
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
  greetedKey = bot.spec.key;
  greetCooldownUntil = now + CONFIG.social.greetCooldown;
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

// Ask for a lent piece back. The warm half of a loan's ending, and the only one
// you can choose: the timer's version happens wherever they happen to be.
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

// The hop, and now the only way to make one — the double tap that used to
// share the verb is gone with tap-to-walk. `hopSeen` still answers it, because
// a hop is a wave whoever started it.
jumpBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  touched();
  // rig.hop refuses off the ground on its own, so this needs no gate: the
  // authority on whether you can jump is the thing doing the jumping.
  if (rig.hop()) hopSeen();
});

// A tap that ARMS the run, not a hold that is one: press it and your movement
// is a sprint until you stop moving, at which point it stands down by itself —
// the rig owns that, see the disarm in _walk — so there is no run mode left
// switched on to rediscover three strolls later. Pressing again while armed
// disarms, for the change of mind between arming and setting off.
//
// The lit state is painted from the rig every frame (see the loop) rather
// than toggled here, because the rig can stand the sprint down without being
// asked, and a button still lit after the run ended would be lying about the
// one thing it exists to say.
sprintBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  touched();
  // Gated here as well as hidden in CSS, because `pointer-events: none` is a
  // statement about the mouse and not about the app: it stops a thumb, and it
  // does not stop a dispatched event, a stylesheet that failed to load, or the
  // next person to reach for `display` instead. A run armed in the sky sits
  // there doing nothing visible and then fires the instant you land — so the
  // rule lives with the state it protects.
  if (!rig.isFirstPerson) return;
  rig.sprintOn = !rig.sprintOn;
});

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

// The pill always reads as the hour you are in, never as an hour a press would
// get you — it is a clock first and a control second. じどう is marked by a dot
// rather than the word, so the reading stays the same length in both modes.
function paintTime() {
  const auto = isAuto();
  timeBtn.textContent = PHASE_LABEL[phase];
  timeBtn.classList.toggle('is-auto', auto);
  timeBtn.setAttribute(
    'aria-label',
    `じかん: ${PHASE_LABEL[phase]}${auto ? '（じどう）' : ''}`,
  );
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

let closeAt = 0;
function openTime(open) {
  timeEl.classList.toggle('is-open', open);
  closeAt = open ? performance.now() + CONFIG.daylight.closeMs : 0;
  // Painted here as well as in the loop, so the panel is already right in the
  // frame it appears in. Left to the loop alone it opens showing wherever the
  // day was when it last closed, and corrects itself a frame later — brief, but
  // exactly the sort of flicker that reads as something being broken.
  if (open) paintScrubber();
}

// Any interaction pushes the tidy-away back, so it never closes under a thumb
// that is still deciding.
function keepOpen() {
  if (closeAt) closeAt = performance.now() + CONFIG.daylight.closeMs;
}

onPress(timeBtn, () => openTime(true));

onPress(timeAuto, () => {
  keepOpen();
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
  keepOpen();
  // Never let this reach the canvas: the track sits where a look-around swipe
  // would otherwise start.
  e.preventDefault();
  e.stopPropagation();
  const now = performance.now();
  lastTouchAt = now;
  saidLongIdle = false;
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
  keepOpen();
}

timeTrack.addEventListener('pointerup', releaseTrack);
timeTrack.addEventListener('pointercancel', releaseTrack);

// Pressing anywhere else puts it away. Capture phase so it is decided before
// the canvas starts a look or a walk, and passive so it never eats that press.
document.addEventListener('pointerdown', (e) => {
  // The sheet is modal: while it is up, a press is about the sheet and none of
  // the tidying below should read it as having moved on. Without this, tapping a
  // row of the 図鑑 folds the drawer holding its pill, and the drawer takes the
  // 図鑑 down with it. The sheet's own three dismissals are wired where it is.
  if (sheetMode) return;
  if (closeAt && !timeEl.contains(e.target)) openTime(false);
  // The drawer folds for a press outside the WHOLE stack rather than outside
  // itself, so reaching past it for そらへ is not also an instruction to put it
  // away — those two pills are its neighbours, not the world.
  if (menuCloseAt && !ctlStack.contains(e.target)) openMenu(false);
}, { capture: true, passive: true });

applyPhase(activePhase(), { instant: true });
paintTime();
paintScrubber();
globe.warmSkies();

// --- start gate, which is also the gesture iOS needs before handing over tilt
startEl.addEventListener('click', () => {
  if (started) return;
  started = true;
  startEl.classList.add('is-gone');
  setTimeout(() => { startEl.style.display = 'none'; }, 480);
  controls.classList.add('is-ready');

  const now = performance.now();
  lastTouchAt = now;
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
function updateCast(now) {
  playerDir.copy(rig.anchor);

  // Walking up to somebody should be noticed. Without this, greetings only
  // ever happened on teleport and going over on foot felt ignored.
  if (rig.isFirstPerson) {
    let near = null;
    let nearD = Infinity;
    for (const b of bots) {
      // Never through the wall: the nearest character can be one sat at home
      // a metre of masonry away, and being greeted by them from your side of
      // it would be the house talking.
      if (throughWall(b.ch)) continue;
      const d = arcBetween(b.ch.dir, playerDir);
      if (d < nearD) { nearD = d; near = b; }
    }
    const s = CONFIG.social;
    if (near && nearD < s.greetArc) {
      if (greetedKey !== near.spec.key && now > greetCooldownUntil && !anyoneSpeaking()) {
        greetedKey = near.spec.key;
        greetCooldownUntil = now + s.greetCooldown;
        rig.focus = near.ch;
        // Walking in on somebody at home is its own moment with its own bank —
        // 「いらっしゃい」, not 「やあ」. The same proximity fires it, because
        // walking in IS walking up to them now; the roof overhead is what
        // picks the words.
        const home = insideHouse() && globe.isInside(near.ch.dir);
        speak(near, home ? 'indoor' : 'greetBack', now);
      }
    } else if (nearD > s.greetClearArc) {
      greetedKey = null;   // wander off and coming back counts as new
    }

    // Arriving at a shore.
    const wet = playerAtWater();
    if (wet && !wasInWater && now > waterQuietUntil && !anyoneSpeaking()) {
      const witness = bots.find((b) => onScreen(b.ch));
      if (witness) {
        speak(witness, 'water', now);
        waterQuietUntil = now + s.waterCooldown;
      }
    }
    wasInWater = wet;
  }

  // Two of them meeting. Only started when you can actually watch it happen,
  // otherwise the cooldown gets spent on a conversation nobody saw.
  if (pendingReply && now > pendingReply.at) {
    const reply = pendingReply;
    pendingReply = null;
    speak(reply.bot, 'meetReply', now);
    // Both of them stay put until the answer has been read too. meetHoldMs
    // was measured from the opening line, and a reply that now waits for that
    // line to finish can outlast it — which had the pair of them turning and
    // strolling away from each other mid-sentence.
    const until = now + reply.bot.dlg.durationMs;
    reply.bot.ch.busyUntil = Math.max(reply.bot.ch.busyUntil, until);
    reply.to.ch.busyUntil = Math.max(reply.to.ch.busyUntil, until);
  }
  if (!pendingReply && now > meetUntil && !anyoneSpeaking()) {
    const s = CONFIG.social;
    for (let i = 0; i < bots.length && !pendingReply; i++) {
      for (let j = i + 1; j < bots.length; j++) {
        const a = bots[i];
        const b = bots[j];
        if (a.ch.attentive || b.ch.attentive) continue;
        if (arcBetween(a.ch.dir, b.ch.dir) > s.meetArc) continue;
        if (!onScreen(a.ch) && !onScreen(b.ch)) continue;
        speak(a, 'meet', now);
        // Answer once the opening line has been read, not partway through it.
        // speak() silences whoever else is talking, so a reply on a timer
        // counted from the start arrived on top of the line it was answering
        // and cut it off — which made the one exchange in the app that is
        // genuinely a conversation the hardest thing in it to follow.
        const replyAt = now + a.dlg.durationMs + s.meetReplyMs;
        pendingReply = { bot: b, to: a, at: replyAt };
        // Stood still at least until the answer is due; the reply above
        // extends this again once its own length is known.
        a.ch.busyUntil = Math.max(now + s.meetHoldMs, replyAt);
        b.ch.busyUntil = a.ch.busyUntil;
        meetUntil = now + s.meetCooldown;
        break;
      }
    }
  }
  if (!anyoneSpeaking() && now > nextChatterAt) {
    const focused = rig.focus ? byChar.get(rig.focus) : null;
    let pick = (focused && Math.random() < CONFIG.dialogue.focusBias)
      ? focused
      : bots[Math.floor(Math.random() * bots.length)];
    // Nobody talks from somewhere you cannot see them — nor, on foot, from
    // so far off that their bubble points at a speck on the horizon.
    if (!canChatter(pick.ch)) pick = bots.find((b) => canChatter(b.ch));
    if (pick) speakAmbient(pick, now);
    else scheduleNext(now);
  }

  if (!saidLongIdle && !anyoneSpeaking()
      && now - lastTouchAt > CONFIG.dialogue.longIdleMs) {
    saidLongIdle = true;
    // Whoever you are visiting, but only if they are still there to be seen.
    // focus is never cleared — walk away and it still names the last person
    // you went to — so without the check a 「まだ いる…?」 could be spoken by
    // somebody round the far side of the planet, where positionBubbles hides
    // the bubble and the line is simply lost.
    const focused = rig.focus && onScreen(rig.focus) ? byChar.get(rig.focus) : null;
    const pick = focused || bots.find((b) => onScreen(b.ch));
    if (pick) speak(pick, 'longIdle', now);
  }
}

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
  rig.update(dt, now);
  const inside = insideHouse();

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
  // your own head — see BODY_LO/BODY_HI — and on your own patch of ground
  // rather than under the camera, see youDir.
  const youFade = Math.min(1, Math.max(0, (rig.alt - BODY_LO) / (BODY_HI - BODY_LO)));

  // The leash tightens as you come down, and reaching zero exactly where the
  // body finishes fading is what removes the last seam: on the way up the body
  // is released to stay behind, and on the way down it is drawn home, arriving
  // under your feet at the very moment it stops being visible. Nothing ever
  // jumps, and standing where you land is guaranteed rather than corrected —
  // a leash of zero IS "follow the anchor exactly", so the walk on the ground
  // needs no separate case.
  const leash = BODY_LEASH * youFade;
  const gap = youDir.angleTo(rig.anchor);
  if (gap > leash) {
    _youAxis.crossVectors(youDir, rig.anchor);
    // Zero only if the two are already the same direction, or opposed — and
    // opposed cannot happen, since the leash is enforced every frame from a
    // gap that starts at nothing.
    if (_youAxis.lengthSq() > 1e-12) {
      youDir.applyAxisAngle(_youAxis.normalize(), gap - leash).normalize();
    }
  }

  // The transit rules — see WATER_ENTER above. After the tow and before the
  // speed is read, so a detour is part of the motion the hop plays for. One
  // circle per kind per frame: a slide that lands in a neighbouring circle —
  // trees come in stands — is that circle's business next frame.
  if (youFade > 0) {
    const carry = (CARRY_SPEED / CONFIG.globe.radius) * (dt / 1000);
    const wall = inBuilding(youDir, CONFIG.wander.wallKeep);
    if (wall) slideAround(youDir, wall, rig.anchor, CONFIG.wander.wallKeep, carry);
    // The trunk rather than the canopy — see SOLIDS in sphere.js. This used to
    // ask the sightline list, which is the whole drawn width, so a body being
    // towed past a tree swung out to the edge of its LEAVES: a stride and a half
    // of visible detour around thin air, and in the opposite direction from the
    // camera, which walked straight on through. Now that the camera is stopped
    // at the trunk the two agree, and this fires only where it still can — while
    // you are airborne and the leash is long enough for the body to lag across
    // something you have already flown over.
    const prop = inSolid(youDir, CONFIG.wander.wallKeep);
    if (prop) slideAround(youDir, prop, rig.anchor, CONFIG.wander.wallKeep, carry);
    let wet = false;
    for (const lake of CONFIG.lakes) {
      if (inLake(youDir, lake, overWater ? WATER_STAY : WATER_ENTER)) { wet = true; break; }
    }
    overWater = wet;

    // Carry the jump through to the far shore — see CARRY_SPEED.
    if (overWater && dt > 0) {
      const on = Math.min(youDir.angleTo(rig.anchor), carry);
      if (on > 1e-6) {
        _youAxis.crossVectors(youDir, rig.anchor);
        if (_youAxis.lengthSq() > 1e-12) {
          youDir.applyAxisAngle(_youAxis.normalize(), on).normalize();
        }
      }
    }
  } else {
    overWater = false;
  }

  if (dt > 0) {
    const speed = (_prevYou.angleTo(youDir) * CONFIG.globe.radius * 1000) / dt;
    youMoving = speed > BODY_STEP;
    // Harder to enter than to stay in — see GLIDE_DROP. Water overrides the
    // speed question entirely: however slowly you are towed, a crossing flies.
    gliding = overWater || speed > (gliding ? GLIDE_SPEED * GLIDE_DROP : GLIDE_SPEED);
    _prevYou.copy(youDir);
  }
  glide += ((gliding ? 1 : 0) - glide) * (1 - Math.exp(-dt / GLIDE_EASE_MS));
  // Standing and walking are the default; the glide is the exception, and it is
  // speed that buys it. The fade multiplies the lift as well as the pose, so a
  // body still condensing into view cannot be caught halfway up in mid-air, and
  // one on the ground is always on its feet — which is also what a mirror or a
  // still pool will want to reflect.
  you.standAt(youDir, dt, {
    walking: youMoving,
    lift: GLIDE_LIFT * glide * youFade,
    posture: youFade > 0 && glide > 0.5 ? 'fly' : 'stand',
  });
  you.fade = youFade;
  you.root.visible = youFade > 0.004;
  if (you.root.visible) you.update(dt, now, globe.camera);

  // The anchor comes from the rig a few lines up, and has to: the sky is hung
  // off where you are stood, so it is stale by a frame if read any earlier.
  //
  // The rig also answers whether you are on the ground, because it is the only
  // thing that can. The scene sees a camera that has been lifted, and cannot
  // tell a jump or a tabletop from the sky — see the hand in scene.js.
  globe.update(now, rig.anchor, rig.isFirstPerson);

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
  // ground and only from indoors, which is where the only loose thing in the
  // world is lying: shoving furniture from the sky is not a verb this app has,
  // and `youDir` rather than the camera's anchor because it is your BODY that
  // does the shoving — the two agree while you are stood, and where they part
  // company (mid-flight) the answer is that you are not touching anything.
  globe.nudgeLoose(insideHouse() ? youDir : null, dt);

  // The day runs on its own — it is the one thing here that does — and the
  // interior reads its light off the same blend the sky does (see tintIn in
  // daylight.js), so dragging the clock indoors moves the room around you.
  globe.updateDaylight(dt);

  // Only while it is on screen — the rest of the time nothing can see it.
  if (closeAt) {
    paintScrubber();
    if (!scrubbing && now > closeAt) openTime(false);
  }
  // The drawer folds itself away on the same forgotten-about timer, with one
  // extra rule: while something it opened is still open, its clock is held at
  // the top rather than running. Otherwise a minute spent dragging the scrubber
  // would leave the drawer already overdue, and closing the panel would snap it
  // shut in the same breath — the timer would be counting your attention as
  // neglect.
  if (menuCloseAt) {
    if (timeEl.classList.contains('is-open') || zukanEl.classList.contains('is-open')) {
      menuCloseAt = now + CONFIG.daylight.closeMs;
    } else if (now > menuCloseAt) openMenu(false);
  }

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

    const label = rig.goingUp ? 'じめんへ' : 'そらへ';
    if (viewToggle.textContent !== label) viewToggle.textContent = label;

    // The action buttons exist where their verbs do: on the ground. In the sky
    // there is nothing to jump off or run on, and two dead buttons beside two
    // live pills would teach that buttons here sometimes just do not work.
    // An armed sprint is stood down at takeoff too — the disarm in _walk only
    // runs on foot, so without this a run armed on the grass would survive the
    // whole flight and fire on landing.
    const onFoot = rig.isFirstPerson;
    if (jumpBtn.classList.contains('is-off') === onFoot) {
      jumpBtn.classList.toggle('is-off', !onFoot);
      sprintBtn.classList.toggle('is-off', !onFoot);
      if (!onFoot) rig.sprintOn = false;
    }

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
    if (!rig.isFirstPerson && pad.id !== null) {
      pad.id = null;
      hideStick();
    }

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
    if (anchor.z > 1 || !b.ch.isVisible || Math.abs(anchor.x) > 1.0 || anchor.y < -1.2) {
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

// Handle for poking at the scene from the console while developing. Never
// defined on the deployed site.
if (IS_LOCAL) {
  window.hidamari = {
    bots, rig, globe, household, you, fishing, inventory,
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
