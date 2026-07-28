// The three characters, described as data rather than drawing code.
//
// The one import is the fish roster, for Hachiware's `likes` — see there. It
// costs nothing structurally: config.js imports nothing at all, which is what
// makes it safe for a leaf like this one to read.
//
// What they look like now comes from asset/images/characters/<key>-<sheet>.png.
// What is left here is who they are, how big, where they live, and which
// expression sheets have actually been drawn. To add a fourth character, add an
// entry plus a line bank in lines.js — no other file needs to change.
//
// home is a spot on the globe in radians: lat 0 is the equator, positive is
// north. You no longer start among them — you start on the house's doorstep,
// worked out at runtime from where its front door faces — so what these place
// is a loose ring of friends around the front of the house rather than a group
// you are standing in. See the note above CAST itself for the arrangement.
//
// Those distances are not free. The nearest has to land outside MEET_ARC or you
// arrive with somebody standing on top of you, and every one of them has to
// clear the house's own 3.2 wall or they begin the game indoors. It is far
// easier to move camera.spawnBack than to rearrange a group.
//
// scale is the character's width as a fraction of CONFIG.bodyPlane. Height
// follows from the sheet's own proportions, so a taller drawing is a taller
// character without touching anything here.
//
// sheets lists the suffixes that exist on disk. `idle` is the resting face and
// stands in for every expression that has no sheet of its own, so the app runs
// on idle alone. Draw <key>-happy.png, add 'happy' to the list, and the
// dialogue starts using it — there is no third step.
//
// The whole vocabulary is now normal, happy, delight, sleepy, worried and
// surprise, and every one of them is reached by real lines — 'pain' and 'teary'
// were dropped precisely because they were not. So any sheet you draw will be
// seen.
//
// 'delight' is Chiikawa's alone, reached only by being singled out — a
// greeting, or a gift put in their hands. Drawing one for the other two buys
// nothing until a line of theirs asks for it — see the note beside EXPRESSIONS
// in art.js.
//
// A 'blink' sheet is also picked up if you draw one, and without it they simply
// do not blink.

import { FISH_SPECIES } from './config.js';

// A POSTURE is what the BODY is doing, as opposed to an expression, which is
// what the FACE is doing. The difference is not filing: an expression is the
// same body wearing a different face, so every expression sheet shares the
// resting one's plane — but a posture is a different body altogether. The glide
// sheet is drawn half again as tall as the standing one, because a creature
// with its arms out IS that shape, and stretching it onto the standing plane
// would squash it to three quarters of its height.
//
// So a posture is entitled to its own canvas: character.js measures each one a
// plane of its own, and this list is what tells assets.js not to report the
// different size as a mistake. Add a name here, draw `<key>-<name>.png`, list
// it in that character's `sheets` below, and teach character.js when to wear it.
//
// It lives in this file rather than beside EXPRESSIONS in art.js because
// assets.js is the reader and art.js already imports assets.js — putting it
// there would close a circle.
export const POSTURES = ['sit', 'fly'];

// `home` is only where somebody STARTS. They wander from the first moment, so
// this is the opening frame's composition and nothing else.
//
// All three moved when the house did. They used to live at the origin, which
// is where the house now stands — so at the old numbers the entire cast began
// the game standing inside the building, between 0.16 and 3.06 units from its
// middle against a wall at 3.2. Nothing would have stopped them walking out,
// but the first thing anybody saw would have been an empty hillside with three
// friends sealed in the front room.
//
// So they are placed around the FRONT of the house instead, on the same
// bearing the door faces and the arrival looks along: each one 5.5 to 6.5 out
// from the house's middle — clear of its wall — and fanned wide enough of the
// doorway that none of them is standing in it. From where you arrive that
// leaves them at 5.5, 7.1 and 9.1, which is the spread the old opening had and
// the thing to preserve if this is ever composed again: near enough to be
// obviously your friends, far enough that nobody is in your face.
// `likes` is what this one is especially glad to be handed — item ids from
// ITEMS in items.js. A gift on this list reaches the `giftLove` bucket instead
// of `gift`; everything else is still welcome, because refusing a present has
// no place in this world and neither does being lukewarm about one.
//
// One each, and one is the right number. The point is not a preference SYSTEM,
// it is that the three of them are three people: Chiikawa is quietly floored by
// a fistful of weeds, Hachiware wants to know what KIND of fish it is, and
// Usagi has strong feelings about mushrooms and no way to explain them. A
// second favourite each would make the whole thing read as a table rather than
// as a characteristic.
//
// An id here that no longer exists in ITEMS simply never matches, so retiring
// an item cannot break a line bank.
export const CAST = [
  {
    key: 'chiikawa',
    name: 'ちいかわ',
    scale: 0.90,
    home: { lat: 0.251, lon: -0.782 },
    sheets: ['idle', 'happy', 'delight'],
    likes: ['kusa'],
  },

  {
    key: 'hachiware',
    name: 'ハチワレ',
    scale: 1.00,
    home: { lat: 0.372, lon: 0.592 },
    sheets: ['idle', 'happy', 'surprise'],
    // Fish. ALL of them, taken off the roster rather than listed, because what
    // Hachiware likes is fish — that was already true of the three koi and
    // writing out twelve ids would turn a characteristic into an inventory. The
    // note above says a second favourite each would read as a table; twelve
    // hand-copied ones would read as a spreadsheet, and the day a thirteenth is
    // drawn he should be glad to be handed it without anybody remembering to
    // come back here.
    likes: FISH_SPECIES.map((sp) => sp.id),
  },

  {
    key: 'usagi',
    name: 'うさぎ',
    scale: 0.97,
    home: { lat: -0.059, lon: 0.748 },
    sheets: ['idle', 'happy', 'surprise'],
    likes: ['kinoko1', 'kinoko2'],
  },
];

// The visitor. You have been Momonga all along; this is the body you see when
// you rise far enough to be looking at yourself — see `you` in main.js.
//
// NOT in CAST, deliberately. CAST is the free cast — the wanderers, the
// household, the ones with line banks — and every loop over it (dialogue,
// visits, going home at night, the tap test) would need a "but not you" carved
// into it. This one is `driven`: the camera rig decides where the body stands
// and whether it is walking, and character.js only draws what it is told — see
// standAt there. No `home` for the same reason; home is wherever you are.
//
// The scale is Chiikawa's. Momonga is the same handful of a creature, and the
// drawing is on the same canvas family as the rest of the cast.
export const PLAYER = {
  key: 'momonga',
  name: 'ももんが',
  scale: 0.90,
  driven: true,
  // 'fly' is a posture, not an expression — see POSTURES above. It is the rarer
  // of the two on purpose: the glide is what you do at speed, not a way of
  // standing about, so most of the time you are up there you are on your feet
  // in the resting sheet, walking when your spot is towed along. See
  // GLIDE_SPEED in main.js for what it takes to leave the ground.
  sheets: ['idle', 'fly'],
};
