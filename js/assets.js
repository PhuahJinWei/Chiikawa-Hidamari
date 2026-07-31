// Getting the drawn art into memory. Everything that comes from a file is
// fetched and decoded here before the scene is built, because a texture made
// from an image that has not decoded yet is silently blank — there is no lazy
// option that degrades gracefully.
//
// art.js still owns what things look like. This file only owns getting the
// pixels in, and knows nothing about a character beyond its key.

import { CAST, PLAYER, POSTURES } from './cast.js';
import { FISH_SPECIES } from './config.js';

// One list for loading: the player's sheets arrive exactly like the cast's,
// because to this file a character is a character whoever steers it.
const EVERYONE = [...CAST, PLAYER];

const BASE = './asset/images/';

// The world and its scenery. All required: a miss here is a broken build
// rather than a missing extra, so these are allowed to reject.
const WORLD = {
  // `ground: 'ground-day.png'` stood here. The planet's surface is painted in
  // code now — see paintGlobe — because a drawn file cannot carry the two things
  // that surface has to have: BIOMES, whose edges have to agree with rules
  // living in CONFIG rather than with a picture, and marks whose latitude is
  // KNOWN as they are drawn, so the sphere's squeeze can be undone forward
  // instead of hunted down afterwards. The file it replaced was 2000x1000 of a
  // single flat #CEE4A4, so nothing drawn was lost with it.
  //
  // Bushes are still drawings on cards — nothing builds one — so unlike the
  // trees and the stump below they are genuinely on screen.
  bush1: 'bush-1.png',
  bush2: 'bush-2.png',
  // `lake: 'lake.png'` stood here. The ponds are built geometry now — see
  // water.js — and what the ground texture holds under them is the BED rather
  // than the water, painted to the same rim the mesh is built from.
  //
  // It is the same reasoning that retired the ground: a drawing of water is one
  // shape, wearing one hour's light, seen from one angle. It also forced the
  // shape on everything else, because every rule about a pond had to be simple
  // enough to write about a picture — which is why both lakes were ellipses.
  // Built, the rim wobbles and `inLake` wobbles with it.
  // The house, drawn twice. Its card is retired — the building is real
  // geometry — but both drawings are still doing work that has nothing to do
  // with standing on the grass, which is why they are not retired with it:
  //
  //   `houseDay` is the house's chip at the edge of the screen, pointing the
  //   way home whenever the building is off frame. That is the drawing, shown
  //   at 38px, and it is on screen more often than the card ever was.
  //
  //   `houseNight` is read by litSpot() to find the bright, warm pixels of the
  //   lit openings, and that measurement places the bloom, the pool of light
  //   on the grass and the warm term on everything standing near the house
  //   after dark. Move the door in the drawing and the glow follows it. Baking
  //   that into a number would buy 13KB and cost the property.
  houseDay: 'house-day-1.png',
  houseNight: 'house-night-1.png',
  // The supplied portrait is used directly by the small plate beside
  // Chiikawa's door. art.js only crops it into the existing mounting frame.
  housePlate: 'chiikawa-house-plate.png',
};

// THE WORLD'S OWN WINTER WARDROBE — the same scenery, drawn with snow on it.
//
// Keyed by the WORLD key above, so an entry here says "there is a second
// drawing of that thing, for when the ground is white". scene.js swaps one for
// the other on the frame the world dresses; nothing else changes, and the snowy
// drawing wears the hour and catches the lamplight exactly as the summer one
// does, because it is the same card with a different picture on it.
//
// A REDRAW AND NOT A TINT, which is the whole reason this table exists rather
// than a shader term. The built scenery — trees, stumps, the two buildings —
// takes its snow as a mix toward the ground colour, because built geometry has
// no drawing to swap and a lathe frosts perfectly well. A bush is a DRAWING,
// and this world's rule for drawings is that they are drawn again: snow on a
// bush is not the bush with its colour moved, it is a bush with snow lying on
// its top and its flowers gone under. No mix reaches that, and the difference
// is exactly the one the eye picks out.
//
// A DECLARED LIST rather than a hopeful fetch, for the reason the grass sheets
// taught this file once already: every job below is awaited, so a file that is
// not there is not a missing extra, it is a start screen that never turns into
// an invitation. Nothing may be listed here before it has been drawn.
//
// Adding one is three steps and no code:
//   1. draw `asset/images/bush-1-snow.png`
//   2. add `bush1: 'bush-1-snow.png'` here
//   3. add its path to sw.js
// ...and every bush of that kind starts putting a coat on at `dressAt`.
export const WORLD_SNOW = {
  bush1: 'bush-1-snow.png',
  bush2: 'bush-2-snow.png',
};

// Flowers and mushrooms come in numbered variants — `flower-1.png` and upward.
// Draw another, bump the count here, add the path to sw.js, and it starts
// appearing; nothing else counts them.
//
// Ground-cover variants (flowers, mushrooms, the flat flowers) have to share
// one canvas size within their kind, because a single quad size is used for
// each kind.
//
// TREE_VARIANTS IS STILL A COUNT, but it no longer counts drawings — there are
// none. It is how many kinds of tree the builder makes: three geometries and
// three leaf greens, keyed off the same index the sheets used to be. `tree-1`
// upward are retired to `asset/images/legacy/` along with `stump.png`, because
// a built tree never shows a card and the only thing its drawing was still
// being asked for was two ratios, which SPRITE_SIZE now writes down.
export const TREE_VARIANTS = 3;
// GRASS_VARIANTS stood here. Grass is built blades now — no drawing, no count.
export const FLOWER_VARIANTS = 5;
// The same flowers again, drawn WITHOUT their stems, for scattering over a
// surface rather than standing in the ground — the blossom on a built tree, and
// on a built bush when there is one. They are their own files rather than the
// standing flowers with the stalk trimmed off in code, and that is worth a
// sentence: a stalk is joined to its blossom in the drawing, so no cut lands
// cleanly on it, and every rule that tried left the flowers on the canopy with
// a nub hanging off the chin. Drawn without one, there is nothing to find.
export const FLOWER_TEXTURE_VARIANTS = 4;
// `FLAT_FLOWER_VARIANTS` stood here — six white clusters that lay ON the ground
// as decals. Their job has split in two and neither half needs them: at any
// distance the field's own printed blooms do it (see fieldBloom in art.js), and
// up close the standing flowers and the grass blades do. The six drawings are
// still in asset/images/ and nothing loads them.
//
// It also deletes a documented special case. The flat clusters were the one
// piece of ground cover that had to DODGE the lamp term, because they lay at
// R+0.04 under a light pool at R+0.05 and would have been lit twice. Painted
// into the ground, they are lit exactly once, by the pool lying on them.
export const MUSHROOM_VARIANTS = 2;

// THE NOTES OVER A SINGER — `asset/images/effects/tune-N.webp`, one drawing per
// note shape, picked from at random as each one floats up.
//
// A COUNT for the same reason every other variant here is one: assets.js awaits
// every fetch, so probing for "however many exist" is not available, and a
// number that lies is a start screen that never turns into an invitation. Draw
// a fifth, change this to 5, add its path to sw.js.
//
// WebP because they are flat two-colour shapes with a lot of transparency, and
// because nothing about a note needs a lossless edge — the same trade the pack
// tiles make, at a twentieth of their size.
export const TUNE_VARIANTS = 4;

// Flip to true once `sun.png` and `moon.png` exist in asset/images/, and add
// both to sw.js. Until then the sky paints the soft disc it always has, so this
// costs nothing to leave off — and being a flag rather than a hopeful fetch, it
// also means no 404 on every load while they are still unpainted.
//
// Draw them square, on transparent, with the disc filling the canvas edge to
// edge: the card spans exactly the angular size `discR` in daylight.js asks
// for, so anything you leave as margin comes off the size of the sun. About
// 512px is right — that renders roughly 1:1 at the biggest it ever appears.
//
// One sun drawing covers morning, noon and evening. It is multiplied by
// `look.disc`, which is where the warm start, the pale midday and the orange
// evening come from. Draw it pale so those tints have something to work on.
export const SKY_DISC_ART = true;

// Filled in by loadArt(), read synchronously by everything downstream.
//
// `fish` is its own room in here rather than twelve camel-cased keys in the top
// level, because unlike every other drawing these are a SET that gets walked:
// the shoal deals from it, the 図鑑 lists it, and a lookup is always by a
// species id that came out of FISH_SPECIES. `IMG.fish[sp.id]` says that; twelve
// IMG.fishPeachCarp keys would have said "twelve unrelated pictures".
// `snow` is `sheets` again for the winter wardrobe, and it is its own room for
// the reason `fish` is: it is a SET that gets swapped wholesale rather than a
// handful of extra pictures. `IMG.snow[key][expr]` says "the same character,
// dressed for it"; twelve camel-cased snow keys in the top level would have
// said twelve unrelated drawings.
export const IMG = { sheets: {}, snow: {}, fish: {}, icons: {} };

// THE PACK'S ICONS, which are deliberately NOT the same pictures as the world's.
//
// Every other drawing in this file is the thing itself: the fish in the lake
// wears the texture the 図鑑 lists and the card in your hand shows, and that
// sameness is load-bearing — the thing you chose and the thing you are holding
// must not be two drawings. These are the exception, and the reason is that a
// slot is a LABEL rather than a window. They are drawn as tiles, subject on a
// category colour — grey for what grows, blue for what swims, yellow for what
// is somebody's, purple for the forks — and that colour only says anything when
// all of them are sitting in one grid being compared.
//
// So they are used in exactly one place, the pack grid, and nowhere else. The
// hand, the lake and the 図鑑 stay on the drawings; see slotIcon in main.js, and
// the note on the 図鑑 for why its silhouettes could not use these even if it
// wanted to.
//
// Keyed by ITEM id. The fish are not listed because they derive from
// FISH_SPECIES' own `file` — the same kebab-case the water uses — so a species
// can never end up with a tile nobody fetches, nor a row here the roster has
// never heard of. Everything else is named by hand, because these file names
// are the artist's words for the things rather than the code's.
//
// Two ids may share one file: both lanterns and both rubbish bags are two
// physical objects wearing one drawing, which is what they are in the world too.
const ICONS = {
  kusa: 'common-grass',
  kinoko1: 'common-mushroom-red',
  kinoko2: 'common-mushroom-regular',
  bear: 'unique-bear',
  kettle: 'unique-kettle',
  chiikawaBook: 'unique-book',
  lamp: 'unique-lamp',
  hachiwareLamp: 'unique-lamp',
  trashBag: 'unique-trashbag',
  trashBagAlt: 'unique-trashbag',
  chiikawaWeapon: 'special-chiikawa-fork',
  hachiwareWeapon: 'special-hachiware-fork',
  hachiwareGuitar: 'special-hachiware-guitar',
  hachiwareCamera: 'special-hachiware-camera',
  chiikawaHouseKey: 'special-chiikawa-housekey',
};

// WHICH FAMILY A TILE BELONGS TO — grows / swims / somebody's / the forks — read
// off the file name rather than declared a second time. The drawing's background
// colour and this are the same fact about the same thing, and the pack draws each
// slot's border from it, so deriving means the border and the tile behind it can
// never disagree about what kind of thing they are describing.
//
// The fish are the one family named by their table instead of by a file, because
// their file names are generated from that table in the first place.
export const ICON_CAT = {
  ...Object.fromEntries(Object.entries(ICONS).map(([id, file]) => [id, file.split('-')[0]])),
  ...Object.fromEntries(FISH_SPECIES.map((sp) => [sp.id, 'fish'])),
};

// Deliberately the load event and not decode().
//
// decode() is the tidier-looking call and it is a trap here: it is free to
// defer indefinitely for an image that is not being rendered, and an offscreen
// or backgrounded tab is exactly the state a page is in while it is still
// loading. Measured in the dev preview, a 200-response PNG sat on an unsettled
// decode() promise forever — which, since the whole scene is built behind this
// await, is a start card that never turns into an invitation.
//
// Nothing needs it anyway. Every image here is drawn into a canvas by art.js
// before it becomes a texture, and drawImage decodes synchronously on demand,
// so the pixels are ready exactly when they are first asked for. The load event
// is the honest signal: the bytes have arrived.
function load(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

// `onProgress` is handed a fraction from 0 to 1 as each file lands, which is
// what the road on the start screen is drawn from. Optional: nothing here
// depends on anybody watching.
export async function loadArt(onProgress) {
  const jobs = [];

  for (const [key, file] of Object.entries(WORLD)) {
    jobs.push(load(BASE + file).then((img) => { IMG[key] = img; }));
  }

  // ...and the snowy twin of any of them that has been drawn — see WORLD_SNOW.
  // Landed under `<key>Snow`, which is the same camel-casing the rest of this
  // table uses (`houseDay`, `houseNight`), so scene.js can find one from the
  // summer key it already has without a second lookup table.
  for (const [key, file] of Object.entries(WORLD_SNOW)) {
    jobs.push(load(BASE + file).then((img) => { IMG[`${key}Snow`] = img; }));
  }

  // File names keep their hyphens; IMG keys camel-case them (`flat-flower-1.png`
  // arrives as IMG.flatFlower1) so nothing downstream needs bracket gymnastics.
  //
  // GRASS STOOD IN THIS TABLE, and how it left is the cautionary tale for the
  // next thing retired from it. `grass-1.png` upward were moved to
  // `asset/images/legacy/` when grass became built blades, which need no
  // texture at all — but this table went on asking for them at their old path,
  // and every job below is awaited. Five files that were no longer there became
  // a start screen that never turned into an invitation. A missing asset does
  // not degrade here; it is terminal. So: retiring art means deleting its row
  // HERE and its path in sw.js, in the same change that moves the file.
  //
  // The tree sheets went the same way, and `stump.png` with them out of WORLD
  // above — 199KB between them, the heaviest art in the project, fetched and
  // decoded on every cold visit for cards the cull is careful never to show.
  // The notes, in their own folder and their own list on IMG — they belong to
  // nobody's sheet and are not scenery, so they get neither table.
  IMG.tune = [];
  for (let v = 1; v <= TUNE_VARIANTS; v++) {
    jobs.push(load(`${BASE}effects/tune-${v}.webp`).then((img) => { IMG.tune[v - 1] = img; }));
  }

  for (const [prefix, count, key] of [
    ['flower', FLOWER_VARIANTS],
    ['flower-texture', FLOWER_TEXTURE_VARIANTS, 'flowerTexture'],
    ['mushroom', MUSHROOM_VARIANTS],
  ]) {
    for (let v = 1; v <= count; v++) {
      jobs.push(load(`${BASE}${prefix}-${v}.png`).then((img) => { IMG[`${key || prefix}${v}`] = img; }));
    }
  }

  if (SKY_DISC_ART) {
    jobs.push(load(`${BASE}sun.png`).then((img) => { IMG.sun = img; }));
    jobs.push(load(`${BASE}moon.png`).then((img) => { IMG.moon = img; }));
  }

  // The shoal. Keyed by species id and counted by nothing — FISH_SPECIES is the
  // only list of them there is, so a drawing that arrives without a row here is
  // a file nobody fetches rather than a fish that half exists.
  //
  // Required, like everything else in this function: the school builds a mesh
  // per species at start-up and a missing drawing would be a white card in the
  // water. Adding one means the row in config.js, the file, and a path in sw.js.
  for (const sp of FISH_SPECIES) {
    jobs.push(load(`${BASE}fish/${sp.file}.png`).then((img) => { IMG.fish[sp.id] = img; }));
  }

  // The pack's tiles — see ICONS above. Required like everything else here, so
  // that a drawing which never arrived is a loud failure at start-up rather than
  // an empty square somebody notices three afternoons later. They ship as WebP
  // because the originals are 1254px and about a megabyte each, which is twenty
  // megabytes of start screen for pictures that are never shown above 70px.
  for (const [id, file] of Object.entries(ICONS)) {
    jobs.push(load(`${BASE}icon/icon-${file}.webp`).then((img) => { IMG.icons[id] = img; }));
  }
  for (const sp of FISH_SPECIES) {
    jobs.push(load(`${BASE}icon/icon-fish-${sp.file}.webp`).then((img) => { IMG.icons[sp.id] = img; }));
  }

  for (const spec of EVERYONE) {
    const sheets = {};
    IMG.sheets[spec.key] = sheets;
    for (const suffix of spec.sheets) {
      // `idle` is the resting face, which the app calls `normal`. Every other
      // suffix is named for the expression it serves.
      const expr = suffix === 'idle' ? 'normal' : suffix;
      jobs.push(
        load(`${BASE}characters/${spec.key}-${suffix}.png`)
          .then((img) => { sheets[expr] = img; }),
      );
    }

    // THE SECOND WARDROBE — the same character wrapped up, worn while the
    // ground is white. Keyed the same way and read the same way, so nothing
    // downstream has to know these are a different set of drawings; see
    // `setDressed` in character.js, which swaps one table for the other.
    //
    // Fetched from the same declared list `sheets` is, and required in exactly
    // the same sense: a name in `snow` that has no file is a broken build, not
    // a missing extra. That is the whole reason it is a list rather than a
    // guess — see the note beside it in cast.js.
    //
    // A character with no `snow` list at all gets an empty table, which is not
    // a gap to handle: the lookup falls through to the ordinary sheet, and
    // somebody nobody has drawn a coat for simply stands about in the snow in
    // their usual clothes. Same half-drawn courtesy every other sheet gets.
    const snow = {};
    IMG.snow[spec.key] = snow;
    for (const suffix of spec.snow || []) {
      const expr = suffix === 'idle' ? 'normal' : suffix;
      jobs.push(
        load(`${BASE}characters/${spec.key}-${suffix}-snow.png`)
          .then((img) => { snow[expr] = img; }),
      );
    }
  }

  // Counted here rather than inside load(), so that one place counts every kind
  // of job — world, numbered variant and expression sheet — and adding a kind
  // above cannot quietly stop being counted. The count is of files, not bytes:
  // a fair measure of how much is left to fetch would need every size known up
  // front, and these are within an order of magnitude of each other anyway.
  const total = jobs.length;
  let done = 0;
  onProgress?.(0);
  await Promise.all(jobs.map((job) => job.then((v) => {
    done++;
    onProgress?.(done / total);
    return v;
  })));

  for (const spec of EVERYONE) {
    const sheets = IMG.sheets[spec.key];
    if (!sheets.normal) {
      throw new Error(`${spec.key}: no idle sheet. Every character needs one.`);
    }
    // Every EXPRESSION sheet for one character shares a single plane, so one
    // drawn on a different canvas size arrives stretched. Cheaper to say so
    // here than to work out later why one expression looks subtly squashed.
    //
    // Postures are exempt, and not as a special case grudgingly made: a posture
    // is a different body and is entitled to its own canvas, so character.js
    // measures each one a plane of its own — see POSTURES in art.js. A glide
    // sheet half again as tall as the resting one is the drawing being right,
    // not the drawing being wrong.
    const { naturalWidth: w, naturalHeight: h } = sheets.normal;
    // The winter wardrobe is measured against the SUMMER idle sheet, not
    // against its own — and that is the constraint rather than an oversight.
    // There is one standing plane per character, cut from the resting drawing
    // once, and both wardrobes hang on it; a coat drawn on a wider canvas does
    // not get a wider card, it gets the same card with the drawing squashed
    // onto it. So the two sets have to agree with each other, which is the same
    // thing as both agreeing with this.
    const both = { ...sheets, ...Object.fromEntries(
      Object.entries(IMG.snow[spec.key] || {}).map(([k, v]) => [`${k}-snow`, v]),
    ) };
    for (const [expr, img] of Object.entries(both)) {
      if (POSTURES.some((p) => expr === p || expr === `${p}-snow`)) continue;
      if (img.naturalWidth !== w || img.naturalHeight !== h) {
        console.warn(
          `${spec.key}-${expr}: ${img.naturalWidth}x${img.naturalHeight} `
          + `does not match the idle sheet's ${w}x${h}; it will be stretched.`,
        );
      }
    }
  }
}
