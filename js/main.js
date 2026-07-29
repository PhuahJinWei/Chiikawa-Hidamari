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
import { IMG, SKY_DISC_ART } from './assets.js';
import { paintSheet, sheetBounds } from './art.js';
import { loadArt } from './assets.js';
import { ITEMS, Inventory, itemIcon, SLOTS } from './items.js';
import { Fishing } from './fishing.js';
import {
  buildPlushie, buildTeapot, buildLantern, buildTrashBag, buildTrashBagAlt,
  buildPinkWeapon, buildBlueWeapon,
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
  // The lantern likewise. Its heights are the furniture entry's own, so a
  // resized lamp in the room is a resized lamp in your hand.
  lantern: () => buildLantern(0.34).group,
  // Each rubbish bag keeps its own body profile and cave scale in the hand.
  trashbag: () => buildTrashBag(0.78).group,
  trashbag2: () => buildTrashBagAlt(0.72).group,
  // The world copy lies flat. Rotate the hand copy upright so the open fork
  // and all twelve teeth face the player instead of collapsing to a side view.
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

// Set the held unique down at `spot` — or, if the spot is water, watch it go
// under and start the walk home. With no spot it goes straight home. The one
// exit every held-unique state shares.
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
  if (spot) {
    // Anything with a top under this spot — out of doors that is a stump's cut
    // face, and it is the only place a set-down piece can be badly set down.
    const perch = perchUnder(spot, 1e9);
    inventory.setUnique(id, { state: 'placed', dir: [spot.x, spot.y, spot.z] });
    globe.placeLoose(loose, spot);
    if (perch) {
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

// A lent piece travels with whoever has it. Placed every frame rather than
// parented to them, because the loose system's own `place()` closure is what
// stands a piece up correctly on this planet — and a bear parented to a
// billboard would inherit the billboard's turn toward the camera and spin on
// the spot as you walked around it.
//
// BESIDE them rather than under them: at their own direction the bear stands
// inside the drawing, and the whole point of a loan you can see is seeing it.
//
// A piece in the pond has no `to` and is left hidden, which is right — it sank.
const _lentE = new THREE.Vector3();
const _lentAt = new THREE.Vector3();

function carryLent() {
  for (const id of Object.keys(inventory.uniques)) {
    const rec = inventory.unique(id);
    if (rec.state !== 'given' || !rec.to) continue;
    const bot = bots.find((b) => b.spec.key === rec.to);
    const loose = uniqueByItem(id);
    if (!bot || !loose) continue;
    _lentE.set(0, 1, 0).cross(bot.ch.dir);
    if (_lentE.lengthSq() < 1e-8) _lentE.set(1, 0, 0);
    _lentE.normalize();
    const a = CONFIG.uniques.besideArc / CONFIG.globe.radius;
    _lentAt.copy(bot.ch.dir).multiplyScalar(Math.cos(a))
      .addScaledVector(_lentE, Math.sin(a)).normalize();
    globe.placeLoose(loose, _lentAt);
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

      // A tap with something in your hand is not a visit, it is a delivery —
      // the item changes what the gesture means, which is the whole reason
      // holding is a mode. A carried unique is LENT rather than given; a
      // stackable is given outright; and if the hand and the pouch have
      // somehow come apart, the tap is an ordinary visit after all.
      if (inventory.heldUnique) {
        lendUnique(bot, now);
      } else if (!(inventory.holding && giveGift(bot, inventory.holding, now))) {
        speak(bot, wasAlreadyHere ? 'poke' : 'greet', now);
      }
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

// 'pack', 'zukan', or null. One card serves both — see index.html for why.
let sheetMode = null;
// The slot a long press has picked up, waiting to be told where to go. Declared
// up here with the rest of the sheet's state because openSheet clears it, and a
// `let` further down the file would still be in its dead zone when it does.
let lifted = null;

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
  // Nothing stays lifted across an open or a close: the gesture is only
  // meaningful against the grid you started it on.
  lifted = null;

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
      + (lifted === i ? ' is-lifted' : '');
    // The picture is decoration once the button says what it is: two readings of
    // the same thing is one too many when the second is 「あかい きのこ あかい きのこ」.
    slot.setAttribute('aria-label', cell
      ? ITEMS[cell.id].name + (cell.n > 1 ? ` ${cell.n}こ` : '')
      : 'あき');
    if (cell) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = squareIcon(packIcon(cell.id)).toDataURL();
      slot.appendChild(img);
      // The count only when there is more than one. A ×1 on every slot is
      // noise: the drawing already says "one of these".
      if (cell.n > 1) {
        const n = document.createElement('span');
        n.className = 'pack-n';
        n.textContent = cell.n;
        slot.appendChild(n);
      }
    }
    // Empty slots are wired up too, and are NOT disabled: an empty slot is
    // exactly where you would want to put down the thing you have just lifted,
    // and a disabled button is deaf to the press that would do it.
    armSlot(slot, i);
    grid.appendChild(slot);
  }
  sheetBody.appendChild(grid);
  showLift();
}

// --- taking things out, and moving them about
//
// A tap takes a thing in hand. A LONG PRESS lifts it, and the next slot you
// touch is where it goes — swapping with whatever is there, or pouring in when
// the two are the same kind. See moveSlot in items.js for the half of that which
// is about the pack rather than about fingers.
//
// Long press rather than drag, because a drag over a grid on a phone means
// tracking a finger across nodes it did not start on and guessing which one it
// is over; two taps say the same thing with none of that. It is also why this
// is pointer events rather than the click `onPress` gives everything else: the
// press has to be noticed WHILE the finger is down, and a click only arrives
// once it has gone.
const LIFT_MS = 360;
const LIFT_SLIP = 12;

function armSlot(el, i) {
  let sx = 0;
  let sy = 0;
  let moved = false;
  let fired = false;
  let timer = 0;

  const stop = () => { if (timer) { clearTimeout(timer); timer = 0; } };

  el.addEventListener('pointerdown', (e) => {
    sx = e.clientX;
    sy = e.clientY;
    moved = false;
    fired = false;
    stop();
    if (!inventory.slots[i]) return;   // nothing here to pick up
    timer = setTimeout(() => {
      timer = 0;
      fired = true;
      lifted = i;
      // Marked in place rather than by repainting the grid: the finger is still
      // down on this very node, and replacing it would throw away the pointerup
      // that ends the press — leaving the slot stuck looking pressed.
      for (const s of el.parentElement.children) s.classList.remove('is-lifted');
      el.classList.add('is-lifted');
      showLift();
    }, LIFT_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (moved) return;
    if (Math.abs(e.clientX - sx) > LIFT_SLIP || Math.abs(e.clientY - sy) > LIFT_SLIP) {
      moved = true;
      stop();
    }
  });

  el.addEventListener('pointercancel', stop);

  el.addEventListener('pointerup', () => {
    stop();
    // A press that wandered was not a press, and one that already became a lift
    // has had its meaning: letting go is not also a tap.
    if (moved || fired) return;
    tapSlot(i);
  });

  // A long press on a touchscreen is also the browser's own gesture for "select
  // this" or "show me a menu". Neither is wanted on a slot.
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function tapSlot(i) {
  const now = performance.now();
  lastTouchAt = now;
  saidLongIdle = false;
  rig.markTouched(now);

  // Something is lifted, so this press is about where it lands rather than about
  // what is in this slot. Cleared BEFORE the move, because the move repaints and
  // the repaint reads this.
  if (lifted !== null) {
    const from = lifted;
    lifted = null;
    if (from !== i) inventory.moveSlot(from, i);
    // Painted unconditionally, and not only because pressing the lifted slot
    // again means "put it back down". A refused move — the slot emptied under
    // the lift by something the world did while it was up — returns false
    // without emitting, and then nothing else would take the mark off it.
    paintPack();
    return;
  }

  const cell = inventory.slots[i];
  if (!cell) return;
  // Pressing the slot you are already holding puts it away — the same button
  // meaning take-out and put-back, which is how a pocket works. The sheet STAYS
  // OPEN either way now: you came in here to look at your bag, and taking one
  // thing out is not a reason to be shown the door.
  if (inventory.held === i) inventory.putAway();
  else inventory.holdSlot(i);
}

// The line under the grid, and the highlight that goes with it.
function showLift() {
  sheetCard.classList.toggle('is-moving', lifted !== null);

  if (lifted !== null) {
    const c = inventory.slots[lifted];
    sheetCap.textContent = c ? `${ITEMS[c.id].name} を どこへ？` : '';
    return;
  }
  const held = inventory.held === null ? null : inventory.slots[inventory.held];
  if (held) { sheetCap.textContent = `${ITEMS[held.id].name} を もっているよ`; return; }
  sheetCap.textContent = inventory.slots.some(Boolean)
    ? 'タップで てに とる ・ ながおしで いれかえ'
    : 'まだ なにも もっていないよ';
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
    globe.hand.holdMesh(handMeshes[art]);
    const loose = uniqueByItem(inventory.heldUnique);
    if (loose) globe.carryLoose(loose);
  } else if (inventory.holding) {
    globe.holdItem(itemIcon(inventory.holding));
  } else {
    globe.clearHand();
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
  for (const l of globe.loose) {
    if (l === (inventory.heldUnique && uniqueByItem(inventory.heldUnique))) continue;
    if (globe.isCarried(l)) globe.stowLoose(l);
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
let focusAt = 0;

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
// on the rug behind it.
function focusDir(f) { return f.loose ? f.loose.dir : dirOfFixture(f.fixture); }

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
    fn({ art: l.art, loose: l, fixture: null });
  }
  for (const L of globe.roomLights) {
    if (!L.ceiling || !L.anchor) continue;
    fn({ art: L.art, loose: null, fixture: L });
  }
}

function sameFocus(a, b) {
  if (!a || !b) return false;
  return a.loose ? a.loose === b.loose : (!b.loose && a.fixture === b.fixture);
}

// Still a thing you could be looking at: a piece that has since been picked up,
// stowed or lent is gone from the world and cannot go on being the focus.
function focusAlive(f) {
  if (!f.loose) return true;
  return f.loose.anchor.visible && (!f.loose.body || f.loose.body.visible);
}

// Near and centred, lower being better. Metres, with the bearing charged at two
// metres a radian — so a piece a full 35° off has to be about 1.2m closer than
// one dead ahead to be worth turning the focus over for.
function scoreOf(gap, off) { return gap + off * 2; }

// Redecided every frame, but not freely. The hysteresis is what separates "it
// changed because the world changed" from "it changed because your thumb moved
// two pixels".
function updateFocus(now) {
  if (!rig.isFirstPerson) { focus = null; return; }

  // Does the one you already had survive? Generously judged: the wide cone and
  // the longer reach, and nothing else needs to be true of it.
  let keep = null;
  if (focus && focusAlive(focus)) {
    const dir = focusDir(focus);
    const gap = gapTo(dir);
    const off = bearingTo(dir);
    if (gap <= FOCUS.hold && (off <= FOCUS.keep || gap <= FOCUS.onTop)) {
      keep = { ...focus, score: scoreOf(gap, off) };
    }
  }

  // The best thing you are actually looking at. Narrow cone, arm's reach.
  let best = null;
  eachCandidate((c) => {
    const dir = focusDir(c);
    const gap = gapTo(dir);
    if (gap > FOCUS.reach) return;
    const off = bearingTo(dir);
    if (off > FOCUS.cone && gap > FOCUS.onTop) return;
    const score = scoreOf(gap, off);
    if (!best || score < best.score) best = { ...c, score };
  });

  if (!keep) { setFocus(best, now); return; }
  if (sameFocus(best, keep)) { focus = keep; return; }
  if (!best || now - focusAt < FOCUS.dwellMs) { focus = keep; return; }
  if (best.score > keep.score * FOCUS.beat) { focus = keep; return; }
  setFocus(best, now);
}

function setFocus(f, now) {
  // Nothing to nothing is not a change. Without this the clock restarts on every
  // frame spent facing empty meadow, and the dwell below — which exists to stop
  // a focus turning over twice in three frames — would be measuring the wrong
  // thing the moment something finally arrived.
  if (!f && !focus) return;
  if (sameFocus(f, focus)) { focus = f; return; }
  focus = f;
  focusAt = now;
}

function focusName() { return focus ? (ART_NAME[focus.art] || '') : ''; }

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
const IX_ORDER = ['strike', 'reel', 'grab', 'fish', 'put', 'stow', 'light'];

// Stroke glyphs in the app's own ink, the same recipe as jump and sprint. Four
// pills in a column are four similar shapes, and the glyph is what lets you
// pick the one you want out of them without reading all four.
const IX_GLYPH = {
  strike: '<path d="M12 19V6"/><path d="m6.5 11.5 5.5-5.5 5.5 5.5"/>',
  reel: '<path d="m7 7 10 10"/><path d="m17 7-10 10"/>',
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
  // Named, which is the entire reason facing was worth its cost: the button now
  // says WHICH thing it will take. Stood between the bear and the teapot you
  // used to press this to find out.
  grab: { word: () => 'ひろう', of: focusName, run: grabFocus },
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
  put: {
    word: () => 'おく',
    of: heldName,
    run: () => {
      const spot = placeSpot();
      if (!spot) { refuse('put'); return; }
      putDownUnique(spot.clone());
    },
  },
  stow: { word: () => 'しまう', of: heldName, run: () => inventory.putAway() },
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
  // WORLD VERBS NEED YOU TO BE FACING THE THING, because a verb about an object
  // is unusable without knowing which object, and proximity cannot say. One
  // hand: nothing may be taken up while a unique is already in it.
  if (focus && focus.loose && !inventory.heldUnique) list.push('grab');
  if (facingWater()) list.push('fish');
  // HAND VERBS DO NOT. What is in your hand is in your hand whichever way you
  // are pointed, and a rule that made you face something to put it down would
  // be a rule with no object to attach itself to. `put` leads because it is the
  // reversible one: you can always pick it back up, where stowing is a decision
  // about where a thing lives.
  if (inventory.heldUnique) list.push('put');
  if (inventory.holding || inventory.heldUnique) list.push('stow');
  // Last, so a lamp you happen to be carrying never pushes the verb you were
  // reaching for out from under your thumb.
  if (lightNow()) list.push('light');
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

// What is in your hand, by name, for the pills that act on it.
function heldName() {
  const id = inventory.heldUnique || inventory.holding;
  return (id && ITEMS[id] && ITEMS[id].name) || '';
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

// --- the ring on the ground
//
// WHAT YOU ARE ABOUT TO PICK UP, and only that.
//
// It is the walk marker, built for tap-to-walk and unused since that went away —
// kept, the note there says, against the day a verb wanted it. A ring in the
// same pen as every outline in this world, tinted with the hour, breathing
// gently so it reads as the app holding on to something. Exactly what was
// wanted, already drawn, and the alternative was drawing it again.
//
// IT ALSO SHOWED WHERE 「おく」 WOULD LAND, on the reasoning that the two
// questions — which of these will I pick up, where will this land — are never
// live at once, so they could share the one ring. They are not both live, and
// it was still wrong: with the lamp in your hands the ring sat out on the floor
// a step ahead of you, a hole in the middle of the room the whole time you were
// carrying anything. A mark that follows you everywhere is scenery, and this
// world's rule for its own furniture is that a control appears when it has
// something to say and is otherwise not there.
//
// So the ring is only ever the answer to the first question. Where a thing will
// land is a thing you find out by putting it down, which you can immediately
// undo, and a preview was never worth a permanent hole in the floor.
//
// Gated on 「ひろう」 actually being on offer rather than merely on there being a
// focus, because with your hands full it is not offered — and ringing something
// the buttons will not act on is the same lie in a quieter voice.
function updateMark(dt) {
  const on = rig.isFirstPerson && focus && focus.loose && !inventory.heldUnique;
  globe.setWalkMarker(on ? focusDir(focus) : null, dt);
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

function buildIx(key) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ix ix-${key}`;
  el.style.order = String(IX_ORDER.indexOf(key));
  // Two words rather than one: the VERB, and the thing it will be done to. The
  // verb is what you scan for and stays the size it was; the name is smaller and
  // second, because it is an answer to "which one" rather than to "what".
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${IX_GLYPH[key]}</svg>`
    + '<span class="ix-word"></span><span class="ix-of" hidden></span>';
  // pointerdown rather than click, for the reason jump and sprint use it too:
  // these are about NOW, and あげる! has under a second to be pressed in.
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    touched();
    ACTIONS[key].run();
    // The world just changed, under the very button that changed it, so the
    // stack is redrawn before the finger lifts rather than on the next frame.
    syncInteract();
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

  // Gone from the world — you walk away from a stump mid-reach and the word
  // goes with the distance.
  for (const [key, rec] of ixNodes) {
    if (!want.includes(key)) { rec.el.remove(); ixNodes.delete(key); }
  }

  for (let i = 0; i < want.length; i++) {
    const key = want[i];
    let rec = ixNodes.get(key);
    if (!rec) {
      rec = buildIx(key);
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
    updateMark(dt);

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
