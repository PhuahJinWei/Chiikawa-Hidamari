// All tunables live here. Nothing else should hardcode a magic number.

// How much wider than tall a pond lies. It was 985/535 — the proportions of
// `lake.png`, back when the water was a drawing and every rule about it had to
// agree with the picture. The picture is gone and the number stayed, because the
// SHAPE was never the drawing's fault: a pond lying in a hollow is wider than it
// is deep from wherever you stand, and a perfect circle of water reads as a
// well. Rounded off, since it is now a decision rather than a measurement.
const LAKE_ASPECT = 1.84;

// The rim's wobble, as harmonics — see `lakeRim` in sphere.js, which is the only
// thing that reads them and is where the reasoning lives. Flat triples of
// `frequency, amplitude, phase`, flat because this is summed per vertex while
// building the water and per candidate while scattering the grass, and an array
// of little objects there is a lot of pointer-chasing for three numbers.
//
// Frequencies 2, 3 and 5: an egg, a three-lobed sprawl and a fine ripple. All
// odd-ish and none a multiple of another, or the lobes line up and the pond
// comes out looking like a flower rather than like water that got there by
// itself. The amplitudes fall off with frequency for the same reason a coastline
// does — the big bays are big, the wiggles on them are small.
//
// TOTAL AMPLITUDE IS THE NUMBER TO BE CAREFUL WITH, and not for the reason it
// looks. A rim wobbling ±13% still reads as a pond. What it also does is tilt
// the true outward direction away from the ellipse gradient `lakeNormal` hands
// out, and past a point a character trying to step out of an inlet would be sent
// along the shore instead of off it. At these figures the worst tilt is about
// 22°; see the note on lakeNormal for why that is comfortably survivable and
// what would not be.
const LAKE_RIM = [
  [2, 0.045, 0.9], [3, 0.055, 2.6], [5, 0.028, 5.1],
  [2, 0.052, 3.7], [3, 0.040, 0.4], [5, 0.032, 2.2],
];

// `r` is the mean angular radius and stays the only number worth setting: it is
// split by the square root of the aspect so an ellipse covers the same water a
// circle of `r` would, rather than quietly growing. `shape` picks which set of
// harmonics this pond wears, so two ponds are two ponds.
//
// `rimLo` and `rimHi` are the smallest and largest the rim can ever be,
// precomputed because `inLake` is asked thousands of times while the grass is
// scattered and most of those questions are answered by them alone — well
// inside, or well outside, with no bearing to work out. They are the sum of the
// amplitudes, which is a bound rather than the true extreme (the harmonics
// rarely all peak together), and a loose bound is the safe direction to be
// wrong in: it costs a few unnecessary exact tests and can never call dry ground
// wet.
function lake(lat, lon, r, shape = 0) {
  const k = Math.sqrt(LAKE_ASPECT);
  const rim = LAKE_RIM.slice(shape * 3, shape * 3 + 3).flat();
  let amp = 0;
  for (let i = 1; i < rim.length; i += 3) amp += rim[i];
  return {
    lat, lon, r, rx: r * k, ry: r / k,
    rim, rimLo: 1 - amp, rimHi: 1 + amp,
  };
}

// HOW CLOSE COUNTS AS BEING WITH SOMEBODY. One number, because it is one
// question asked in several places that used to answer it separately: a tap set
// you down at 4.6, the greeting fired at 4.4, and they stopped strolling for you
// at 5.4 — three numbers for one idea, none of them agreeing. That the value
// below has landed back inside that old spread is not an argument that the
// unification was pointless: having one number was always right, and only the
// number was wrong.
//
// It is a FRAMING distance, not a fence. Nothing stops you walking closer to a
// CHARACTER, or through one, or past — the scenery is solid and the cast are
// not, see the note in `player`. What this decides is where a tap puts you down
// and how near is near enough to be noticed.
//
// IT IS AN ARC ALONG THE SURFACE, NOT A DISTANCE THROUGH THE AIR, and that is
// the trap this number has already fallen into once. goStand converts it with
// `arc = standoff / R` and then stands you eyeHeight above the far end, so on a
// radius-8 globe an arc of 4.4 is 5.08 units from eye to character — and the two
// diverge faster the bigger the number gets. Framing worked out as though the
// arc were a straight line comes out about a fifth too generous.
//
// That error is the whole reason this used to read 5.5. The note here computed
// 21.6 degrees and 70% of the screen for it; the renderer gave 58% for Chiikawa
// and 66% for Hachiware, because 5.5 of arc is 6.18 through the air. A tap was
// setting you down at the framing the OPENING shot uses to mean you have not
// arrived yet — startAt leaves Usagi 5.645 off, all of 0.14 further than the tap
// that was supposed to take you over there.
//
// So: MEASURED IN THE RENDERER, not derived. At 4.4, on a 375x812 portrait,
// projecting each character's own card and averaged over a dozen bob phases —
//
//   Chiikawa   72% of the screen's width, head 46% down from the top
//   Hachiware  80%                        head 41%
//   Usagi      78%                        head 35%
//
// All three carry their heads clear of the midline rather than under it, and
// even the shortest drawing in the cast clears the 70% that was always the
// target. Put this back up and they sink into the bottom half of the frame
// under an empty sky.
//
// Hachiware is what stops it going lower. At scale 1 and 80% of the width that
// is the widest anybody gets, and the margin goes quickly from here: 83% at
// 4.2, 86% at 4.0, 90% at 3.8. By 3.6 — where their own personal space lets
// them stop — a character does not FIT across the screen at all. Read 4.4 as
// the floor rather than the middle of a range.
//
// What this number CANNOT buy is ground between you and them. The horizon is
// 4.81 units off at eye height, and everything from 3.8 units out to infinity
// compresses into about a degree of view: their feet land at 80% of the screen's
// height whatever this says. Chasing that with faceLookPitch only trades sky for
// foreshortened grass.
//
// Turn it and everything with an opinion about the distance moves together. The
// numbers derived from it below keep their gaps rather than their values.
const MEET_ARC = 4.4;

export const PAL = {
  line: '#5B4C44',

  skyTop: '#8FD0EE',
  skyMid: '#BFE4F5',
  skyLow: '#EAF6FB',
  sun: '#F7E7A8',
  cloud: '#FFFFFF',

  // `path: '#D5BB84'` stood here, the colour of the tracks worn between the
  // landmarks. It went with the tracks — see the note in paintGlobe. Its own
  // history is a warning worth keeping: it began #E3D3A8, a pale sand, which
  // laid over the meadow's #CEE4A4 differed by 21, 17 and 4 in the channels and
  // measured 33 parts in 765 on the rendered frame — present in a pixel diff and
  // invisible to look at. Almost all the difference between grass and bare earth
  // is in the GREEN channel, so anything drawn ON this meadow has to spend
  // brightness to buy it.

  soil: '#C29A6E',
  soilDark: '#A87F55',

  // `ground: '#CEE4A4'`, `groundTick: '#6E7F4F'` and `groundBloom: [...]` stood
  // here — the field's colour, the short dark stroke scattered over it, and the
  // specks of blossom printed in at the same scale.
  //
  // They have not gone anywhere, they have moved somewhere they can be said
  // TWICE. There are two grounds on this planet now and each wants its own three
  // of these, so a single set in the palette could only ever describe one of
  // them; they live in CONFIG.biomes, one set per biome, and the meadow's are
  // exactly these values. See the note there.

  // THE PONDS, now that they are built rather than stamped. `lake.png` was one
  // drawing of one pond wearing its own light, which is exactly what a surface
  // that is mostly a reflection must not be.
  //
  // These are BRIGHTER AND PALER than water usually gets painted, and that is
  // deliberate: this is a shallow pond in a meadow under a wide sky, not the
  // sea. The anime frames (checked against them 2026-07-28) paint their water
  // as a soft milky blue — nearer the sky than the sea, with the life carried
  // by the marks ON it rather than by depth in it. Both steps here were walked
  // a shade lighter to match; the deep especially, since it is most of what
  // you see.
  //
  // `waterDeep` is the middle, `waterShallow` the rim where you can see the
  // bottom — a real gradient rather than decoration, since it is the only cue
  // that tells you where the pond gets deep.
  //
  // MUCH NEARER EACH OTHER THAN THEY WERE. The rim was '#BEE9E7', which against
  // this deep is a jump of nearly fifty in red, and spread over the outer third
  // of the pond (see SHALLOW in water.js) it drew a pale halo just inside the
  // outline — a ring of foam round the whole shore, doing to the water's edge
  // exactly what the retired sand was doing to the ground's. The reference fills
  // its pond FLAT and lets the line be the edge. The cue survives as a hint
  // rather than a band: enough that the middle reads deeper if you look for it,
  // not enough to be a second ring nobody drew.
  waterDeep: '#8FCEDD',
  waterShallow: '#A2D7E2',
  // The line round a pond. It was '#4A6A78', a cool blue-grey, on the theory
  // that a wet edge is not a dry one — and the reference drawing simply
  // disagrees: a pond is outlined in THE SAME WARM BROWN as everything else on
  // this planet, because there is one pen and it does not change colour for
  // water. Kept as its own entry rather than folded into PAL.line so the pond's
  // line can be nudged without moving every outline in the world, but it starts
  // life as exactly that colour.
  waterInk: '#5B4C44',
  // `bedSand: '#DFCFA0'` and `bedDeep: '#9CAE84'` stood here — the pond's
  // bottom as a band of sand round a mud middle, seen through the water. The
  // idea was a shore that says "shallow"; what the sand actually did, between
  // the resample bleed and the margin the bed keeps past the line (see BED_OVER
  // in art.js), was draw a brown ring round every pond — and the reference draws
  // no beach at all: grass meets the pen line and the pen line meets water.
  //
  // The bed is painted in `waterDeep` now — the water's own colour, one flat
  // fill. That is what the pen line being a LINE rather than a disc asks for:
  // where the pen lifts there is nothing over the bed, so what shows in the gap
  // has to be water meeting grass. It also makes the pond's colour honest. The
  // old ink disc ran under the whole body, and the body is 90% opaque, so a
  // tenth of every pond was the outline's colour showing through the water.
  // See paintBed.
  //
  // The squiggles of light on the surface. Barely off white — a glint is the
  // sky's own brightness, and any colour in it reads as scum.
  waterGlint: '#FDFFFF',


  // THE FAR DISTANCE — mountains and a treeline, hung in the sky rather than
  // standing on the planet. See paintHorizon.
  //
  // Everything here is cooler and paler than the same thing would be underfoot,
  // and that is the only trick distance has in a world with no fog: a treeline
  // painted in the trees' own #8CC47C reads as a hedge twenty paces off, and the
  // same green mixed toward the sky reads as woods on the far side of a valley.
  // The mountains carry that furthest, which is why they are barely green at all.
  //
  // Sparse individual lavender-grey mountains. Most share the main colour; a
  // few paler silhouettes sit locally behind a neighbour, which creates the
  // occasional overlap in the references without turning the whole distance
  // into two repetitive stacked rows.
  horizonMountainBack: '#C4C4D5',
  horizonMountain: '#B3B4C9',
  horizonMountainBackInk: '#857A84',
  horizonMountainInk: '#6F646F',
  // The band of woods along the skyline. The anime backgrounds separate it
  // into broad, pale scalloped shrubs instead of one dark hedge: the back row
  // is airiest and the lower row holds the familiar leaf green when a jump
  // uncovers it. One soft grey-green outline ties the rows together; sparse
  // warm branches keep the foliage from reading as decorative cloud shapes.
  horizonTreeBack: '#B7D39F',
  horizonTree: '#A5C78E',
  horizonTreeInk: '#5D6652',
  horizonTreeBranch: '#6E5B47',
  // The field running out to the foot of those woods. A shade deeper than the
  // ground you are stood on, so the join at the limb reads as distance rather
  // than as a seam.
  horizonField: '#C3DDA2',
  // ...and the pale wash where land meets sky. Distance is haze; without it the
  // mountains sit on the treeline like a sticker.
  horizonHaze: '#EFF6F9',
  // `rock` stood here. There are no rocks on this planet — see PROP_TYPES in
  // scene.js — so there is nothing left to colour grey.

  // The bench, and the bark of a built tree — see foliage3d below. grassDark
  // and the petal trio left with the painted flowers — every flower, stem and
  // petal on the planet is drawn art now.
  treeTrunk: '#B08968',

  // A tree that is built rather than drawn. These are read off the three tree
  // drawings so the built ones are the same trees, not new ones: put a card and
  // a shell side by side and the only difference should be that one of them
  // turns as you walk past.
  //
  // The ink is warmer and lighter than the house's near-black `houseInk`, and
  // that is the drawings' own line rather than a preference. A house is one
  // building read across a field and wants the hardest outline it can get; a
  // tree is one of fourteen, and fourteen near-black silhouettes on a hillside
  // read as a cemetery.
  treeInk: '#4A2F2A',
  treeBarkLine: '#8B6A4E',

  // Grass, which is built blades — see buildGrassBlades in foliage.js.
  //
  // Two greens, dark at the root and light at the tip, and every blade is a
  // gradient between them. That is most of what stops a lawn of one colour
  // reading as felt: real grass is darker where it is crowded and catches the
  // light where it is not, and a blade painted top to bottom gets that for the
  // price of a vertex colour.
  //
  // BOTH ARE PICKED AGAINST THE RENDERED GROUND, NOT AGAINST `#CEE4A4`. The
  // globe is the one LIT surface in this world and the grass is unlit like
  // everything else, so the ground's texture value is not the value it arrives
  // at: measured over the whole planet it renders from `#696E4F` at the
  // terminator to `#B1DB95` in full sun, averaging `#9EAE7B`. Choosing a green
  // against the texture would have been choosing it against a colour that is
  // nowhere on screen.
  //
  // A little under that average is the only place both ends work. On the sunlit
  // side the blades read darker than the lawn, which is what grass does — it
  // shades the ground it stands in. Toward the terminator they come out a little
  // lighter than it, which is the price of being unlit and is a wash: the ground
  // there is dim enough that grass merely stays visible rather than glowing.
  // Anything much lighter than this blows out at noon; anything much darker
  // reads as scorched.
  //
  // No ink. Nothing at ground level in this world carries a line — not the
  // globe, not the paths, not the light pools — and a blade is too thin to hull
  // anyway. That is the whole reason blades are easier than the bush was.
  grassBladeLow: '#5F7A49',
  grassBladeHigh: '#8FAF6C',

  // The stump, all READ OFF `stump.png` rather than chosen: the bark is the
  // most common opaque pixel in the drawing, the cut face the lightest colour
  // with any weight behind it, and the line the darkest.
  //
  // Its ink is lighter and greyer than either the tree's #4A2F2A or the house's
  // near-black, and that is the drawing's own line. A stump is knee-high and
  // there are a dozen of them; inked as hard as a tree they would read as a
  // field of dark spots.
  stumpBark: '#C09674',
  stumpFace: '#DFBC93',
  stumpInk: '#77645D',
  // The grain on the bark is LIGHTER than the bark, which is the one thing here
  // that surprises: a tree's grain is darker than its trunk. It is what the
  // drawing does, and it is why a stump reads as dry and split where a trunk
  // reads as smooth.
  stumpGrain: '#DFAC94',
  // ...and the growth rings on the cut face. They are the only thing on a stump
  // you can see ONLY from above, which is most of how you see one at all, so
  // they have to carry at that angle or the face reads as a blank disc.
  //
  // It was #C9A57F, a shade under the face, and that was too polite by half: nine
  // per cent darker, drawn at half opacity, comes to about a five per cent
  // difference on the rendered pixel. Present in a colour picker and invisible to
  // look at. A fifth darker at full weight is still a soft pencil line next to
  // the stump's own outline, and it is actually there.
  stumpRing: '#B58F68',
  // `bushLeaf` and `bushInk` stood here — #ABCBA0 and #605341, read off
  // `bush-1.png` — for a bush that was built as geometry and reverted. There is
  // nothing to colour any more: a bush is a card again, so its colours are its
  // drawing's. See the note in foliage.js for what the attempt taught.
  // One green per tree drawing, in the same order — see TREE_VARIANTS. Two of
  // them are a shade apart rather than a colour apart, which is what makes a
  // stand of trees read as a stand rather than as a set.
  treeLeaf: ['#8CC47C', '#B7E29A', '#9ED689'],
  // `treeBlossom` stood here — four colours for a rosette this file used to
  // paint onto a canopy. There is nothing to colour any more: the blossom on a
  // tree is `flower-texture-1.png` upward, drawn art, so it arrives in the
  // drawings' own colours and in the drawings' own hand. Draw another and it
  // turns up on the trees without a colour being typed in anywhere. See
  // blossomArt in art.js and FLOWER_TEXTURE_VARIANTS in assets.js.

  // Inside the house. These two are the reference drawing's own colours and
  // should stay that way — everything in there is one of them, or the pen, or
  // a mark somewhere between.
  //
  // Close together on purpose — about a tenth apart — which is why the seam
  // between them is drawn rather than left to the contrast. Shading closes even
  // that tenth wherever the wall happens to be turned away from the light, so
  // without the pen line the two genuinely do read as one surface.
  roomWall: '#FFFBF9',
  roomFloor: '#E4E1E2',
  // The one warm thing in the room, so that a floor of two greys has something
  // to be grey against.
  roomRug: '#F6EBDF',

  // The furniture, which is drawn in a louder language than the room is: a
  // heavy dark outline round a soft pastel fill. That contrast is deliberate
  // and is what makes a table read as an OBJECT in the room rather than as more
  // wall. The room's own line is `line` above and is deliberately softer —
  // a seam between two surfaces should not shout as loudly as a thing you could
  // put a cup on.
  furnitureInk: '#2E2422',
  furniturePink: '#F3B9C0',
  furnitureGreen: '#A8CC96',
  furnitureBlue: '#C9D8E0',
  // The cushions sit ON the rug, which is the only reason this is not another
  // cream. At #EBD3C4 against the rug's #F6EBDF they were a step and a half
  // apart and vanished into it — present, lit, correctly sorted, and invisible.
  // A dustier rose reads clearly against the cream while still being the pink
  // table's sibling rather than a second loud colour.
  // The house from outside: a warm off-white shell under a heavy line. The ink
  // is nearly black and darker than the furniture's, because this is read from
  // across a field rather than from two paces, and a softer line simply
  // disappears at that distance.
  //
  // `houseDoor` stood here — a very pale mint, the glazing for the door and
  // the window panes. Both are real holes now, so there is no pane left to
  // colour: what fills an opening is whatever is on the other side of it.
  houseWall: '#F8F3EF',
  houseInk: '#1C1614',
  houseMark: [128, 116, 110],

  // ------------------------------------------------------- the cave and its hill
  //
  // Hachiware's place, which is not a building at all: a hollow in the side of a
  // rock face, with a dome-shaped room behind a mouth as wide as the front of
  // it. Everything here is read off the anime frames rather than derived from
  // the house's palette, because the two are deliberately different materials —
  // the house is painted plaster and this is stone.
  //
  // The rock is drawn as PLATES: irregular polygons outlined in a brown pen,
  // which is the one motif the reference never drops, at any distance. The face
  // colour is barely off white — the cliff in the manga panel is almost paper —
  // and what makes it read as rock is the crack network on top of it, not the
  // fill. So the fill stays pale and the pen does the work.
  cliffFace: '#F4F1EE',
  // The cave's own shell is a step darker than the cliff it is set into, which
  // is what gives the mouth its shape from a distance: the reference draws the
  // hollow as a grey dome against a white wall, before a single crack is on
  // either of them.
  caveWall: '#CFCBC7',
  // The interior, and A STEP DARKER THAN THE MOUND rather than paler.
  //
  // It was #F2EFEC — near enough to `cliffFace` to be the same colour — on the
  // reasoning that a wall two paces off with the daylight over your shoulder is
  // a bright wall, which is what the interior frame shows. Seen from OUTSIDE
  // that is a disaster: the mouth is a hole with a wall behind it, and if the
  // wall behind it is the same value as the rock around it, the hole stops
  // being a hole. Rendered, the hollow read as a patch of slightly different
  // cracks on an otherwise solid mound.
  //
  // The reference settles it — every exterior frame draws the inside of the
  // hollow markedly darker than the rock around the opening, because it is in
  // shadow, and that tonal step is the only thing saying there is a space back
  // there. So the room is a step down, and what brings it back up close to is
  // the lamp standing in it.
  caveRoomWall: '#DFDAD5',
  caveRoomFloor: '#CBC5BF',
  // The pen. Warmer and lighter than the house's near-black houseInk: the
  // reference outlines rock in a soft brown that reads as drawn rather than as
  // cut, and a near-black crack network at this density would turn the whole
  // face into a grid.
  caveInk: '#6B5348',
  // ...and the same pen at the weight the fine cracks are drawn in — the hairline
  // spurs and the little paired ticks that fill the middle of a plate.
  caveMark: [124, 100, 88],
  // The grass on the clifftop, and the fringe of it that overhangs the edge.
  // Deliberately the ground's own green rather than a third one: it is the same
  // meadow, lifted. The fringe is a shade deeper so the overhang reads as being
  // in its own shadow, which is how the reference draws it.
  cliffGrass: '#B7DC8D',
  cliffGrassEdge: '#8FBF66',

  furnitureCushion: '#E3B4A8',
  furniturePaper: '#FFFDF8',
  // The futon, and PURE white — not a placed white.
  //
  // It was #F7F3ED, sat deliberately between the wall above it and the floor
  // under it so it would separate from both by tone. That is no longer what
  // separates it: every layer of the piece now meets its neighbours at a real
  // silhouette, so each one carries a complete ink line, and the line does the
  // work the tone was hired for.
  //
  // Which leaves one thing worth knowing rather than fixing. At #FFFFFF this is
  // now BRIGHTER than the wall behind it (#FFFBF9) rather than dimmer, so where
  // the bedding meets the wall there is nothing between them but the pen. That
  // is enough — the furniture's pen is far heavier than the room's own seam
  // line, which is the whole reason those two languages are different — but it
  // is the reason to reach for a tone again if this ever stops reading.
  //
  // Still the only near-white under this roof besides the box's tape, and it
  // still goes over to lamplight with everything else: the hour's tint
  // multiplies it, which is why the reference photograph of it at night is blue
  // and this is not painted blue anywhere.
  furnitureFuton: '#FFFFFF',

  // Hachiware's bedding is older and rougher than Chiikawa's white futon:
  // a faded earth-grey sleeping mat with warm, repeatedly folded cloth.
  wornBeddingMat: '#81786D',
  wornBeddingCloth: '#F0EFEB',

  // Chiikawa's sasumata: candy pink under the same dark furniture pen, with
  // a paler stripe catching the top of its rounded shaft.
  weaponPink: '#EF8FB2',
  weaponPinkHighlight: '#F8B7CD',
  // Hachiware's matching weapon uses the cool blue of his markings, lifted by
  // a milky highlight so its rounded shaft stays legible in the dim cave.
  weaponBlue: '#78AACA',
  weaponBlueHighlight: '#ACD2E4',

  // Chiikawa's bear, and the drawing's own two colours. The fur is the only
  // warm mid-tone anywhere under this roof — everything else in the room is a
  // cream, a grey or a pastel — which is most of why a thing the size of your
  // hand still reads from the doorway.
  //
  // No ink of its own: it wears `furnitureInk` like every other built thing, so
  // the toy on the bed and the table across the room are drawn with one pen.
  plushieFur: '#DFA184',
  // The inside of its mouth. Not quite white, because the one white already in
  // this room is the futon it is sitting on, and a mouth brighter than the
  // bedding reads as a hole rather than as a face.
  plushieMouth: '#FBF4EE',

  // A cardboard box. One colour, and the builder shades its own faces off it —
  // see buildBox for why an unlit box has to.
  //
  // The warmest thing in the room after the bear, and deliberately a long way
  // off the walls and the bedding: cardboard among creams is only cardboard if
  // it is browner than all of them.
  boxCard: '#E7D3B6',
  // The torn tape across its seam. Brighter than the futon, which is the only
  // other near-white under this roof — a strip of tape should read as the one
  // NEW thing in a room of soft old colours.
  boxTape: '#FCF9F4',

  // Hachiware's tied rubbish bag. A cool middle grey, kept distinct from both
  // the cave floor and its warmer stone walls so the soft silhouette remains
  // legible even before the furniture ink is drawn around it.
  trashBag: '#B9BCBA',
  trashBagAlt: '#ADB3B4',

  // The bedside cabinet. One wood, and the builder shades its own faces off it
  // — a box of flat faces has to, for the reason buildBox sets out.
  //
  // The only mid-brown standing in the room, which is most of what makes it
  // read against a wall of creams and a floor of greys. It is warmer and much
  // darker than the cardboard beside it so the two do not become one brown
  // corner, and it is not `treeTrunk`: a tree is read across a field and this is
  // read from two paces, and the day one of them wants adjusting the other must
  // not follow.
  woodBody: '#9E7350',
  // The drawer fronts, a clear step lighter so they read as panels set into the
  // carcass rather than as more carcass. The pen draws their edges; this is
  // what says they are a different piece of wood.
  woodDrawer: '#C0946A',

  // Somebody's books, left on top of it. Five spines, in the order they stand.
  //
  // Deliberately not five browns. A shelf of one colour reads as a texture and
  // a shelf of five reads as books somebody chose — so there is a red, a green,
  // a cream and two woods, which is the reference's own spread. The cream is the
  // one that does the work: it is the only light thing in the row and it is what
  // stops the group reading as a single dark block from across the room.
  bookSpines: ['#8E4A4A', '#6E8156', '#E5D8B8', '#93705A', '#7A5B44'],
  // ...and the pair lying flat beside them, which the reference draws as one
  // colour for both.
  bookStack: '#A25C62',

  // The flower on the wall shelf, and its stem. The only RED in the room and
  // the only true green — everything else under this roof is a cream, a wood, a
  // pastel or the pen, which is exactly why one small bloom carries from the
  // doorway. The bow at the vase's neck is the same red, because it is meant to
  // read as somebody having tied the two together.
  bloomRed: '#D2544F',
  stemGreen: '#5F6B44',

  // The lantern. Olive brass rather than yellow brass — the room is already
  // carrying a warm wood and a warm cardboard, and a third warm metal at full
  // saturation would make the whole corner one colour.
  lampBrass: '#8A7A4E',
  // The glass, DARK, because this is what it looks like switched off: a lamp
  // that is off should read as a lamp that is off, not as a lamp somebody
  // forgot to draw the light into.
  lampGlass: '#C9C3B0',
  // ...and lit. The one saturated yellow in the app; the house's own lamps use
  // #FFD489 for the light they cast, and this is the same family a step
  // brighter, because that is the light being CAST and this is the source.
  lampLit: '#FFE9A6',
  // What it puts on the floor. Matched to the house's LAMP_COLOR on purpose:
  // two warm lights in one world should be the same warm.
  lampGlow: '#FFD489',

  // `fishKoi: ['#E0895C', '#F2E4CB', '#97ABB8']` stood here — three tints worn
  // by one white master drawing, which was the whole of what a species was.
  // The fish are DRAWN now, one file each, so their colour lives in the art
  // where the ink and the markings already did. See FISH_SPECIES below.

  // The float. Red over white, because a bobber is a sign as much as an
  // object — it has to say "fishing is happening here" from across the pond,
  // and a century of tackle boxes already taught everyone the code.
  bobberTop: '#E8574A',
  bobberLow: '#FFF9F0',
};

// ------------------------------------------------------------------- the fish
//
// Twelve species, and this table is the whole of what a species IS: an id, a
// drawing, a name. Everything that meets a fish reads this one list — assets.js
// fetches `asset/images/fish/<file>.png`, items.js turns each row into a row of
// ITEMS, fish.js deals the shoal from it, fishing.js cuts a catch card per row,
// and cast.js hands Hachiware the lot as things worth being given. A thirteenth
// is a row here, a drawing beside its siblings, and a path in sw.js; nothing
// counts them anywhere else.
//
// WHY IT COULD GROW FROM THREE TO TWELVE, which is not about the number. A tint
// can only say what COLOUR a fish is, so three was already most of what three
// tints could say — a fourth would have been another swatch. A drawing can say
// shape and marking too, so a round blue puffer, a long lilac needle and a pink
// one with waves down its back are three animals rather than three shades, and
// a list of twelve still reads as a pond's worth of neighbours rather than as a
// colour picker.
//
// ORDER IS DISPLAY ORDER. The pouch's chips and the 図鑑's rows both walk ITEMS,
// which walks this, so it runs round the colour wheel — peach, apricot, gold,
// the greens, the blues, the lilacs, back to pink and cream — rather than
// alphabetically. A 図鑑 half full of silhouettes should still look like a set
// somebody arranged.
//
// Names are the player-facing Japanese in the app's own register: hiragana,
// small words, no kanji a child would stumble on. Some name the colour and some
// name the marking, because that is how you would actually point at one across
// the water — the round one, the stripy one, the one with waves.
export const FISH_SPECIES = [
  { id: 'peachCarp', file: 'peach-carp', name: 'ももいろの おさかな' },
  { id: 'apricotMoonspotCarp', file: 'apricot-moonspot-carp', name: 'あんずいろの おさかな' },
  { id: 'goldenDashfin', file: 'golden-dashfin', name: 'きいろい おさかな' },
  { id: 'limeBlossomfin', file: 'lime-blossomfin', name: 'わかくさいろの おさかな' },
  { id: 'limebarMinnow', file: 'limebar-minnow', name: 'しましまの おさかな' },
  { id: 'mintPearlMinnow', file: 'mint-pearl-minnow', name: 'みずたまの おさかな' },
  { id: 'skyTeardropFish', file: 'sky-teardrop-fish', name: 'そらいろの おさかな' },
  { id: 'blueButtonPuffer', file: 'blue-button-puffer', name: 'まんまるの おさかな' },
  { id: 'lilacNeedlefish', file: 'lilac-needlefish', name: 'ほそながい おさかな' },
  { id: 'lavenderPebblefin', file: 'lavender-pebblefin', name: 'うすむらさきの おさかな' },
  { id: 'pinkRipplefin', file: 'pink-ripplefin', name: 'なみもようの おさかな' },
  { id: 'blushspotLoach', file: 'blushspot-loach', name: 'はなびらもようの おさかな' },
];

export const CONFIG = {
  // World width of a character sheet at scale 1. Height follows the drawing's
  // own proportions, and the source resolution does not come into it at all —
  // redraw a character at twice the pixels and it renders sharper at the same
  // size rather than twice as big.
  bodyPlane: 2.1,

  // Trees built as geometry rather than hung as cards. Set it either way and
  // reload; nothing else in the app has to change, because the card is still
  // built and merely retired, exactly as the house's is.
  //
  // The case for it is that the world used to speak three languages at once and
  // the seams between them are what read as odd. The planet, the house and the
  // furniture were real; the trees were cards that quietly re-aimed while your
  // gaze swept; the grass is crossed quads. Moving the trees over collapses that
  // to one rule — THE WORLD IS REAL AND THE FRIENDS ARE DRAWINGS — which is a
  // stronger statement than the one it replaces and costs the cast nothing. They
  // stay paper, and that is the point rather than the compromise.
  //
  // What it buys, beyond the look: a tree stops needing to be turned at all, so
  // it holds still while you walk past instead of holding still and then
  // re-aiming; it no longer reads as a sticker from orbit, which is where a card
  // gives itself away worst; and its base stops having to be sunk by a sagitta,
  // because a round thing meets a curved hill along a curve rather than at a
  // point.
  //
  // What it costs is triangles — see the note in the README. One geometry is
  // built per DRAWING and shared by every tree wearing it, so three builds cover
  // all thirteen.
  //
  // IT IS THE TREES AND THE STUMPS. The bushes were built too and reverted on
  // the look, and the note in foliage.js says what that taught — worth reading
  // before trying the same on anything low and domed. The stump went the other
  // way and came out well, by keeping its scallops in the band that is already
  // its outline.
  //
  // `foliage3d` stood here as the switch for all of that, with the tree and
  // stump drawings kept loaded behind it as a fallback. It is gone, the same
  // way `grassBlades` went and for the same reason: the drawings are retired to
  // `asset/images/legacy/`, and a switch whose art has been moved out from
  // under it is not a fallback, it is a boot failure waiting for somebody to
  // believe the comment above it. That is not hypothetical — it is exactly how
  // the grass retirement broke the start screen.
  //
  // Trees and stumps are built. What their cards used to be measured for — the
  // aspect that sets a prop's width, and the drawn fraction that sets the
  // ground it clears — is written down in SPRITE_SIZE in scene.js.

  // `grassBlades` stood here, and grass is blades now with no switch to throw.
  //
  // It was never the same decision as `foliage3d` above. That one fixes
  // something WRONG — a card has to be turned to face you and a tree does not —
  // where crossed quads never had that problem: they hold still from every
  // bearing, which is why the ground cover was always the exception to the
  // paper rule. Nothing about the old grass was broken. What changed was the
  // ART: `grass-1.png` upward are dark ink strokes, and a scatter of them reads
  // as dried reeds standing on a green lawn, where blades are green and read as
  // the lawn itself. So it got a switch, to be judged both ways.
  //
  // It has been judged, and the switch is gone rather than left sitting at one
  // end of its travel — because it had stopped being a switch. The five
  // drawings were archived to `asset/images/legacy/` while the fallback branch
  // went on claiming to work, which took the app from "an option nobody uses"
  // to "a start screen that never loads". See the note in assets.js.
  //
  // Blades are also cheaper, which is the opposite of how it went with the
  // trees: one merged mesh, no texture, no alphaTest, against five draw calls,
  // for about a quarter of one tree's triangles.

  camera: {
    // Wider than a diorama would want, because most of the time you are stood
    // on the ground: a 45 degree vertical FOV on a portrait phone leaves only
    // about 21 degrees across, which feels like looking down a tube.
    fov: 62,

    // Altitude above the surface is the only camera parameter. At eyeHeight
    // you are standing among them; by orbitAlt the view has swung fully round
    // to looking down at the whole planet. Everything between is a blend, so
    // there are no modes to switch — just how high up you are.
    //
    // 1.47 IS MOMONGA'S OWN EYE LINE, measured off the idle sheet rather than
    // chosen: the drawn body is 1.91 tall and the eyes sit 1.47 above the feet
    // at the scale the body renders at. It stood at 1.7 — picked before there
    // was a visible you to check against — which put the lens a whole head
    // above where the avatar's eyes are drawn, so the world read a size
    // smaller from first person than it did the moment you rose and looked at
    // yourself. Anyone re-tuning this: the horizon band in scene.js is PINNED
    // to this height (see HORIZON_FROM and its arithmetic), so the two move
    // together or the treeline sinks behind the planet.
    eyeHeight: 1.47,
    // First person is a place you are, not a region you are near. You are
    // either stood on the ground or at least landSnap above it — never
    // hovering in between, where it is unclear whether you can walk.
    groundBand: 0.35,    // how close to eyeHeight still counts as landed
    landSnap: 2.6,       // the floor of flight; below it you drop all the way
    // ...and how far above a ROOF the floor of flight sits when you take off
    // from under one. The same rule as landSnap doing the same job: there is
    // nowhere to hover between the rug and the sky, so a lift from indoors
    // clears the dome outright rather than stopping inside it.
    //
    // Not a taste number. The near plane is 0.3, so anything under that has
    // the shell clipping through the lens on the way past; this is three times
    // it, which also leaves the roof far enough below to read as a roof rather
    // than as a floor you are standing on.
    roofClear: 0.9,
    // These three are the only altitudes measured against the planet rather
    // than against a character, so they track globe.radius: what frames the
    // whole planet is a ratio of altitude to radius, not an absolute height.
    // eyeHeight and landSnap stay put — those are how tall you are.
    maxAlt: 24.7,
    orbitAlt: 16.0,
    skyAlt: 21.8,        // where the "view the whole planet" button puts you
    tiltBack: 0.60,      // radians the camera swings back from overhead when fully out
    zoomRate: 1.8,       // how much a pinch multiplies altitude by
    // How much outward pinch it takes to actually leave the ground, as a
    // multiplier banked up across the gesture. A pinch arrives as a stream of
    // tiny steps — one pixel of finger separation is about 1.01 — so without a
    // bank to clear, the first imperceptible wobble of a two-finger touch
    // launched you. 1.5 is roughly a quarter of the finger travel you have.
    liftGain: 1.5,

    standoff: MEET_ARC,  // how far in front of someone you land when you teleport
    lookAhead: 16.0,     // how far off the first-person look target sits

    // Clearance an arrival gives a tree, in radians ON TOP OF the card's own
    // half-width — so it is a margin, not the size of the thing being avoided.
    // The width comes from the drawing in scene.js, like every other footprint
    // on the planet, and this only keeps you off the edge of one.
    //
    // Small on purpose, and it does not want raising. Trees here are four to
    // six units across against a horizon 4.8 off, so a tree is ALWAYS large in
    // frame and that is the art rather than a fault. What this is for is the
    // one case where the card is not in the view but across it. Widen it and
    // arrivals start swinging round to bearings nobody asked for, chasing a
    // clearance the planet is too small to give.
    propKeep: 0.02,      // ~0.16 world units at radius 8

    // Where you are stood when you arrive — a FALLBACK, and only that.
    //
    // The real arrival is worked out at startup from where the house's own
    // front door is: see spawnBack below and the placement in main.js. It has
    // to be derived rather than written down, because which way the door faces
    // is a property of the building, and a latitude and longitude typed in
    // here would silently stop meaning "on the doorstep" the moment the house
    // moved. This is what gets used if there is no house on the planet at all.
    //
    // Kept in step with where that derivation lands, so the two never disagree
    // visibly: the house sits at the origin and its door faces north, which
    // puts the doorstep `spawnBack` north of it.
    startAt: { lat: 0.875, lon: 0.00 },

    // How far out from the MIDDLE of the house you arrive, in world units.
    //
    // The wall is 3.2 and the doorstep a tap sets you down on is 3.8, so this
    // is a good stride further back than either: near enough that the house is
    // the whole of the opening frame and its open door is plainly a way in,
    // far enough that the building reads as a building rather than as a wall
    // you have your nose against. Below about 6 the dome stops fitting on a
    // portrait screen and you arrive looking at masonry.
    spawnBack: 7.0,

    // How much wider the lens goes at a full run, in degrees, easing in and out
    // with the throttle.
    //
    // This is about optical flow rather than about seeing more. On a planet
    // whose horizon sits 34 degrees below your eye, only the bottom quarter of
    // the screen is ground while you are walking — and ground sliding past the
    // edges of your vision is most of what tells a body it is moving. Widening
    // the lens sweeps more of it through the frame per pace, which is why the
    // trick works everywhere it is used.
    //
    // Small deliberately. Anything you can catch happening reads as a zoom, and
    // a camera that zooms when you walk is worse than one that does not. Set it
    // to 0 to take it off entirely; nothing else has to change.
    walkFov: 3.5,

    // Stood on a planet this small the horizon sits about 30 degrees BELOW
    // eye level — you are effectively always on top of a hill. Looking level
    // shows nothing but sky, so the resting gaze tilts down.
    restLookPitch: -0.30,
    faceLookPitch: -0.26,   // when stood in front of someone
    minLookPitch: -0.95,
    maxLookPitch: 0.30,
    // maxAnchorLat is gone. It kept you 7 degrees short of either pole, because
    // the rig was stored as a latitude and a longitude and crossing a pole in
    // those means flipping longitude by pi mid-gesture. The rig is a quaternion
    // now and has no poles to keep off, so you can walk clean over the top.
    // wander.maxLat below is a different thing and stays: that is the cast
    // choosing not to live up there, not a wall.

    // Measured before this was raised: a full-width swipe turned you only 78
    // degrees, so spinning round took two and a half swipes. One sweep should
    // roughly turn you around.
    headingSens: 0.0090,
    lookPitchSens: 0.0032,
    anchorSens: 0.0026,
    gyroSens: 0.009,
    gyroShare: 0.30,
    // The time constant on the camera's easing, NOT a per-frame fraction. It
    // used to be one — 0.085 of the way there every frame — which quietly made
    // the whole feel of the camera depend on the refresh rate: the same swipe
    // settled in half the time on a 120Hz phone as on a 60Hz one, and phones
    // are the entire target. 188ms reproduces the old 0.085 exactly at 60fps
    // and now means the same thing everywhere.
    smoothMs: 188,
    // A drift while nobody is touching anything. Keep it genuinely slow:
    // anything faster than about a degree a second moves a character out from
    // under the finger while you are deciding to tap them.
    idleSpin: 0.000016,
    idleSpinAfterMs: 9000,
  },

  globe: {
    // A small planet. Everything on it is placed by latitude and longitude in
    // radians, so changing this radius rescales the whole world at once.
    // Surface area is 4x that of a disc of the same radius, and half of it is
    // always hidden behind the curve — which is what makes it feel like a
    // place rather than a tabletop.
    // Big enough to stand on and feel somewhere. It no longer has to fit the
    // screen — you can always pinch further out — and a larger radius also
    // means neighbours barely lean away from each other.
    //
    // Nothing standing on the planet scales with this: a character is bodyPlane
    // wide and the house is 3 units tall whatever the radius. So dropping it is
    // how the world gets smaller *relative to the people living on it* — the
    // horizon comes in, a stroll covers more ground, and the three of them
    // loom larger against the curve. The far-view altitudes below and the
    // ground-cover counts in scene.js are the two things that have to come
    // down with it: the first to keep the whole planet framed the same way, the
    // second to keep the grass the same thickness rather than denser.
    radius: 8.0,
    bob: 0.10,           // the whole planet floats
    bobPeriod: 7200,
  },

  // Water, in radians on the globe. One source of truth: art.js draws from
  // this, wandering steers around it, ground cover refuses to sprout in it, and
  // walking into one gets you teased.
  //
  // MOVED to the far side of the world from the house, and that is the whole
  // reason these positions are what they are. The house is where you arrive now,
  // and the water used to be the nearest thing of interest to the old arrival —
  // which made the opening frame of a game about a house be about a pond. At the
  // positions below both lakes are about 16 units from the doorstep, a good
  // walk in either direction, so finding one is something you do rather than
  // something you start next to.
  //
  // THE FIRST ONE IS THE LAKE and the second is a pond, which is new: they used
  // to be near enough the same size as each other. Now that the water is built
  // rather than stamped, the big one is somewhere to go — 7.6 units along its
  // long axis against a horizon 4.8 off, so standing at one end the far end is
  // over the curve and out of sight, while across the short axis at 4.1 you can
  // see the whole far shore. That asymmetry is the entire reason for the size:
  // walk round it one way and it is a pond, look across it the other and it is
  // not, on a planet where you can see the whole of everything else.
  //
  // It is also where the fish are, which is the other reason it needed room.
  lakes: [
    lake(-0.55, -1.60, 0.350, 0),
    lake(0.10, 2.60, 0.170, 1),
  ],

  // The fish — see fish.js for how they swim and why they live where they do,
  // and FISH_SPECIES above for what they ARE. Only the LAKE has them: the note
  // above already promised that, and the pond is small enough that six fish in
  // it would be a bucket.
  fish: {
    // ONE OF EACH, which is why this is twelve and not a number chosen for
    // itself: the shoal is dealt from FISH_SPECIES without repeats, so the count
    // and the length of that table are the same fact said twice. Six of twelve
    // species would have left half the pond's life off screen and half the 図鑑
    // a rumour the water could not keep.
    //
    // The worry it answers to is the old palette note's — "a shoal where every
    // fish is different reads as an aquarium" — and the lake is what settles it.
    // At 7.6 by 4.1 it is big enough that twelve fish sit about two units apart,
    // which on the ground means you are looking at two or three at a time and
    // walking to find the rest. An aquarium is a set you are shown; this is
    // still a pond you have to go round.
    count: 12,
    // Drawn lengths, in world units. Chiikawa is 2.01 tall; a 0.3 to 0.45
    // fish under a metre of water is a real fish, not a whale calf.
    //
    // It is the LONG side of the drawing, whichever that is, so the needlefish
    // and the puffer are the same handful of animal even though one is four
    // times the other's width. See how the card is measured in fish.js.
    lenMin: 0.30,
    lenMax: 0.45,
    // An amble, in units per second. The cast walk at 1.7; a koi that beat
    // them across the map would read as fleeing, and these are at home.
    cruise: 0.22,
    // Swim a while, hang in the water a while. The same unhurried cadence as
    // the wander/rest rhythm on the grass, scaled down.
    swimMin: 6000, swimMax: 12000,
    restMin: 2500, restMax: 5500,
    // How near your feet have to be before a fish minds, as an arc along the
    // surface, and how hard it minds. They shy rather than flee: a burst that
    // decays over about a second and a half, headed away from you.
    shyArc: 1.4,
    dartBoost: 1.8,
    dartDecayMs: 1600,
    // WHERE THE SHORE STARTS TO PUSH BACK, and where it stops asking — both as
    // a fraction of the way out to the rim on the fish's own bearing, so they
    // follow the wobble rather than a circle.
    //
    // Two numbers rather than one because they are two different mechanisms and
    // only the second is a promise. `soft` is a steering force, which is what
    // makes a fish turn along a bank instead of bouncing off it — and like any
    // force it can be outrun, which is exactly what a fish shying away from your
    // feet at the water's edge does. Ten minutes of somebody standing there put
    // fish a third of a radius out onto the grass.
    //
    // `hard` is the clamp that makes that impossible: past it a fish is simply
    // put back. It is short of the rim by more than half a fish so the CARD
    // stops at the ink rather than the fish's centre, and it doubles as the
    // reason nothing ever hugs the bank.
    soft: 0.68,
    hard: 0.90,
    // How far a fish is washed with the hour's water before it is drawn. This
    // is what puts them UNDER the surface rather than on it — the same trick
    // the cast's reflections use, at a gentler strength, and now the same
    // ARITHMETIC as well: a reflection tints a coloured drawing by lerping its
    // material colour toward the water, and a drawn fish is a coloured drawing.
    // While the fish were one white master the material colour WAS the species,
    // so the lerp landed on the fish itself; the drawings own their colour now,
    // so what is lerped is the white the art is multiplied by.
    //
    // The two are not identical arithmetic and the difference is worth knowing
    // before this number is touched: a lerp drains a colour toward the water's,
    // a multiply keeps the hue and takes the light out of it. Multiplying holds
    // the markings — the puffer's dots, the ripplefin's waves — where a lerp at
    // this strength would have washed them into the body. It also darkens more
    // per unit, which is why this is not the place to make the fish subtler; the
    // drawings are pastel and 0.45 leaves them a little warmer than the water
    // rather than a stain on it, which is the whole ask.
    sink: 0.45,
  },

  // FISHING. Only where the fish are — the lake — and what bites is the actual
  // shoal: the bite is preceded by a real fish swimming over, the species you
  // catch is that fish's, and a caught fish dives and is gone from the water
  // for a while. The pond is not a vending machine wearing a pond costume.
  //
  // Distances in world units, times in milliseconds, like the fish above.
  fishing: {
    // You have to be standing by the water, not fishing the far shore from a
    // hilltop. Measured from your feet to the nearest shore.
    nearShore: 2.6,
    // How far the float can be tossed from your feet. The near limit keeps it
    // off your own toes; the far limit is a toss, not a cannon.
    castMin: 1.1,
    castMax: 3.6,
    // The wait. Rolled fresh per bite, and deliberately wide: fishing is the
    // one activity here whose whole point is that the world sets the pace, and
    // a metronome under the water would give it away.
    biteDelay: [2800, 8200],
    // How long the 「!」stands before the fish thinks better of it. Generous by
    // action-game standards, because the audience is holding a phone in one
    // hand and possibly a snack in the other.
    biteWindow: 950,
    // The fish starts its swim to the float this long before the bite, so the
    // take is something you can SEE COMING if you are watching the water —
    // which is the entire difference between fishing and waiting.
    lureLead: 1700,
    // How long a caught fish is gone from the shoal. Long enough that the pond
    // visibly holds one fewer for a while; never for good, because a pond you
    // can empty is the wrong kind of consequence in this world.
    diveMs: 45000,
  },

  // THE UNIQUES — the bear and the teapot. Not stuff: two specific objects
  // that live somewhere, can be carried, and go back. World units and
  // milliseconds.
  uniques: {
    // How near a loose piece has to be to pick up. A shade over the kusa
    // reach: you crouch for grass, you lean for a bear.
    reach: 2.4,
    // NOTHING IS EVER LOST, and these two numbers are the whole of that rule.
    // A lent piece stays with its new owner for `returnMs` and then walks
    // home; one dropped in the water is fished out after `pondMs`. It is why
    // handing Chiikawa the bear is allowed at all: you cannot lose the bear.
    //
    // Both are short, and deliberately shorter than they first were. Five
    // minutes reads as "long enough to feel like a real loan" on paper and as
    // GONE in play — you wander off, forget, and find the shelf bare. A loan
    // you can watch expire is a loan; one that outlasts your attention is a
    // loss with a receipt. The pond is the same argument at a smaller scale:
    // the joke is the splash, and the joke is over long before the timer.
    returnMs: 90 * 1000,
    pondMs: 15 * 1000,
    // WHERE A PLACED PIECE IS ALLOWED TO SIT, as a fraction of the radius of
    // the surface it is set on. Inside this it stays put; between here and the
    // rim it has been pushed too far and goes over. The stump's cut face is
    // the only elevated surface out of doors, and its radius comes off the
    // geometry rather than from a number here.
    perch: 0.62,
    // The topple, scripted rather than simulated — see the note where it runs.
    // Wobble is the telegraph: you get to see that you pushed your luck.
    wobbleMs: 420,
    fallMs: 520,
    // How far to one side a lent piece walks with its keeper. Clear of the
    // drawing rather than under it — the whole value of a loan you can see is
    // being able to see it — and close enough to read as theirs rather than as
    // something they happen to be near.
    besideArc: 0.62,
  },

  // 草むしり. World units and milliseconds, like everything near it.
  kusa: {
    // A pull, not a point: the tuft has to be at your feet. Slightly under the
    // gift-framing distances so pulling never fires from a spot that reads as
    // "over there".
    reach: 2.2,
    // How near the tap must land to a tuft's root to mean THAT tuft. Generous,
    // because a tuft is nine thin blades and a thumb is a thumb.
    snap: 0.5,
    // The meadow's memory. Long enough that a pulled patch stays pulled while
    // you walk it to somebody and back; short enough that the planet never
    // stays bald on your account. The regrowth eases out over growMs rather
    // than popping, because grass grows, it does not arrive.
    regrowMs: 90000,
    growMs: 900,
  },

  // Mushroom picking. The same two questions as the grass with different
  // answers, because a mushroom is a different kind of thing: there are twenty
  // on the whole planet against six hundred tufts, so finding one is an event
  // and taking it should cost the meadow something you would notice.
  kinoko: {
    reach: 2.2,
    // Tighter than the grass's snap. A tuft is nine thin blades and forgiving
    // to aim at; a mushroom is one clear object, and a generous snap would have
    // you picking one you were not looking at.
    snap: 0.42,
    // Four minutes, against grass's ninety seconds, and no growth animation:
    // grass springs back, a mushroom is simply there again later where it was
    // not before. That is most of what makes finding one feel like finding one.
    regrowMs: 240000,
  },

  // THE TWO BIOMES. There are exactly two countries underfoot on this planet and
  // both of them are written down here — a green meadow that is most of the
  // world, and the pale sand each of them lives on.
  //
  // ONE TABLE, FOUR READERS: the ground painted in art.js, the colour of the
  // grass standing in it, how thickly anything sprouts, and — new — WHAT SPROUTS
  // AT ALL. Paint a sandy clearing into a ground image and the trees still grow
  // wherever the spiral put them; describe it here and the paint, the blades, the
  // flowers and the treeline all move together when you drag it to another
  // hillside.
  //
  // The shape of the table changed with it and the change is the point. A biome
  // used to BE a circle on the globe, so it could only be in one place and the
  // meadow — being everywhere — could not be one at all. Now a biome is a KIND OF
  // GROUND and `patches` is a list of where it turns up, so sand can be at two
  // homes on opposite sides of the world without being two different biomes, and
  // the meadow can be an entry like any other by having no patches: whatever the
  // patches have not claimed is base. See `biomesAt` in sphere.js.
  //
  // Per patch, `r` is the angular radius of its solid middle and `fade` how far
  // past that it takes to become base again. THE SECOND NUMBER IS THE ONE THAT
  // MATTERS: a hard rim is a circle drawn on a planet, and a border you cross
  // without noticing is a landscape.
  //
  // Per biome:
  //   `ground` the field's colour, `tick` the short stroke scattered over it and
  //   `bloom` the specks printed in among them — the three that used to be
  //   PAL.ground, PAL.groundTick and PAL.groundBloom, one set each now.
  //   `ticks`, `blooms` and `bloomScale` how many of each and how big, against
  //   the counts in paintGlobe. These are PAINT and they are deliberately not
  //   `cover`: one number cannot do both jobs, because the sand is bare of
  //   growing things and still HEAVILY marked — take its hatching away with its
  //   grass and what is left is a blank cream fill, which is the one thing the
  //   reference frames never show.
  //   `blade` the two greens of the grass growing in it, root then tip.
  //   `cover` a multiplier on how much of what it DOES grow bothers to.
  //   `grows` what may stand here at all. This is the one that turns a colour
  //   into a place: the sand is not a beige meadow, it is ground with nothing on
  //   it but a few tufts, and that is a different thing to walk across.
  biomes: [
    {
      // BASE — no `patches`, so this is what the planet is anywhere the sand has
      // not claimed. Roughly three-quarters of the surface.
      key: 'meadow',
      // A shade greener and a shade stronger than the #CEE4A4 it inherits from
      // the retired PAL.ground. That colour was chosen while it was the only
      // ground in the world and had to hold both a meadow and the pale field
      // washing over it; with the sand now saying "pale" outright, the green is
      // free to be green, which is what the reference frames actually show.
      ground: '#B4DC8E',
      // A brown-green rather than a green, which is what keeps it reading as a
      // mark ON grass instead of as more grass.
      tick: '#6E7F4F',
      ticks: 1,
      // White and yellow specks, too small to be a thing you look at and too
      // many to leave out. Mostly white, and white is listed twice on purpose:
      // the pink is a seasoning rather than a colour of the field, and given an
      // equal share it turns the whole meadow faintly rosy from any distance
      // where the specks blur together.
      bloom: ['#FBFBF0', '#FBFBF0', '#FBEDA8', '#F1C6D1'],
      blooms: 1,
      bloomScale: 1,
      blade: [PAL.grassBladeLow, PAL.grassBladeHigh],
      cover: 1,
      // Everything. This is the biome with things in it — the walk between the
      // two homes is meant to be through a wood with a floor.
      grows: ['grass', 'flower', 'mushroom', 'tree', 'bush', 'stump'],
    },
    {
      // THE GROUND BOTH OF THEM LIVE ON. Two patches, one at each home, and one
      // biome rather than two because they are the same place twice: whatever
      // the ground is around a house on this planet, it is that around both.
      key: 'sand',
      // Almost paper-white with a warm yellow cast. The old khaki value read as
      // dry soil once the globe's lighting reached it; the anime uses a pale
      // cream field whose sparse pencil marks carry all of its texture.
      ground: '#FFF9DD',
      // Sparse horizontal pencil dashes, not the meadow's upright grass ticks.
      tick: '#77665A',
      tickStyle: 'dash',
      tickScale: 0.72,
      ticks: 0.24,
      // No painted green patches or ground-cover tufts in this biome.
      bloom: [],
      blooms: 0,
      bloomScale: 1,
      // Retained for smooth colour interpolation outside the bare sand patch.
      blade: ['#7FA352', '#A9CC72'],
      cover: 0,
      grows: [],
      patches: [
        // Chiikawa's, at the origin. 0.72 radians is 5.8 units of solid sand
        // against a horizon 4.9 units off, so standing at her door the whole
        // visible world is this — which is the frame the reference actually
        // shows. The bench at 0.66 is inside it; the nearest planted tree, at
        // 0.95, is out past the wash with a green hillside under it.
        { lat: 0.00, lon: 0.00, r: 0.72, fade: 0.26 },
        // Hachiware's, and a shade tighter — the mound is 4.0 units across and
        // its clearing wants to end before the small pond at 1.03 rather than
        // wash over the water's near shore.
        { lat: 0.15, lon: -2.64, r: 0.70, fade: 0.26 },
      ],
    },
  ],

  // Somewhere to walk *to*. Without these every hillside looks like every
  // other hillside and you have no way to answer "where am I".
  //
  // The scenery scatter keeps clear of these on its own — see LANDMARK_BERTH
  // in scene.js, which gives each kind of prop its own berth beyond a
  // landmark's footprint. It did NOT always: the spiral used to be blind to
  // landmarks, the house survived on a spot hand-measured to be clear, and the
  // measurement went stale the day the building grew from a 2.05-unit card to
  // a 2.45 dome — a bush that had been politely outside the wall was suddenly
  // inside the roof. A placement can be moved freely now; the clearing follows.
  // `solid` is a wall you cannot walk through, and it is opt-in rather than
  // automatic because a footprint and a wall are different questions. Every
  // landmark keeps ground cover from sprouting through it — that is about the
  // drawing overlapping the flowers — but only a building should stop you, and
  // a bench you cannot step over would read as a bug rather than as furniture.
  //
  // How wide the wall is comes from the art, not from here: see the footprint
  // measurement in scene.js, which the ground cover already uses. The house
  // works out at 1.92 units of radius, which is the drawn dome's own half-width
  // at the base — so you stop exactly where the building looks like it ends.
  // `s` scales the drawing, and is what lets a landmark be an ordinary prop
  // grown to landmark size rather than a new type needing its own art, its own
  // SPRITE_SIZE entry and its own painter. The three big trees below are the
  // three tree drawings the scatter already uses, at nearly twice the size, so
  // "the big tree" is genuinely a different thing from the trees around it
  // without anybody drawing a second one.
  //
  // WHY THREE MORE. Two landmarks is not a map, it is two places, and with the
  // house visible from 9.4 units on a planet 50 around, most of the surface had
  // nothing on it to answer "where am I" — you could walk for half a minute
  // through country that looked identical in every direction. The three below
  // are chosen by farthest-point over every legal spot, which drops the worst
  // gap between any point on the planet and its nearest landmark from 17.9 units
  // to 9.8. A tree this size clears the horizon from 10.9 units away, so there
  // is now somewhere in sight from anywhere, which is the whole job.
  //
  // Legal means: not in a lake, at least 2.0 from any existing prop so it is not
  // standing inside one, at least 5.2 from any other tree so it reads as its own
  // thing rather than as part of a wood, and 7 clear of anybody's home. Those
  // came out of measuring the scatter rather than being wished for — the planet
  // holds 55 props with a median 1.5 units between neighbours, so 2.0 of
  // clearance is already the 80th percentile of the whole sphere. Re-measure if
  // you move one: `hidamari.globe.sprites` carries every prop's surface normal,
  // and the arc between two of them is `acos(a.dot(b)) * 8`.
  // `radius` overrides the footprint measured off the drawing, and the house
  // needs it because the house is no longer a drawing. It is a hemisphere now —
  // half a true circle, so the height IS the radius and the building is exactly
  // twice as wide as it is tall. That one relationship is the whole shape, so
  // it is expressed rather than tuned: there is no separate height to drift out
  // of step with the width.
  //
  // It also drives the wall you cannot walk through and the ground cover that
  // keeps out of it, so all three come from this number and cannot disagree.
  landmarks: [
    // `radius` is the whole size of the house: half a circle, so the height IS
    // the radius and the building is exactly twice as wide as it is tall. It
    // also drives the wall you cannot walk through, the ground cover that keeps
    // out of it and the berth the scenery gives it, so all four move together.
    //
    // It was 2.45, and that was too small for the people who live here — a
    // character stands 2.01 and the front door came out at 1.59, so Hachiware
    // was taller than his own doorway. The building has to be big enough for a
    // door somebody can walk through to look like a door rather than like the
    // whole front of the house.
    //
    // The door is NOT sized here. It is one opening shared with the room on the
    // other side of it, so its width lives in CONFIG.interior.doorWidth and both
    // ends read that.
    //
    // AT THE ORIGIN, and moved there deliberately. It used to stand at lon
    // 2.54 while the cast, the bench, the trees and both lakes all lived
    // between lon -1.6 and 1.5 — the house was alone on its own side of the
    // planet, fifteen units from where anybody arrived, which is most of a
    // minute's walk to reach the one building in the world. Putting it on the
    // equator at lon 0 makes it the middle of the map rather than an outpost,
    // and everything else in this table is placed around it.
    { type: 'house', lat: 0.00, lon: 0.00, h: 3.0, solid: true, radius: 3.2 },
    // Hachiware's, and ON THE OTHER SIDE OF THE WORLD from Chiikawa's — 21
    // units of walking, which is most of the way round a planet whose horizon
    // is 4.9 off. That distance is the whole point of there being two of them:
    // if they were in sight of each other they would read as a village, and the
    // one thing this planet has instead of a village is a long walk between two
    // places where somebody lives.
    //
    // `radius` 4.0 makes this the biggest thing on the planet — a quarter again
    // the house, and level with the tallest tree. IT IS THE HILL, not a hut
    // standing in front of one, and that is the whole design: see the note on
    // CONFIG.cave for why the mound and the hollow ended up being one shell.
    //
    // It was 4.8 and that was too much of the world. Half again the house put
    // the rock at nearly twice Usagi's height and 9.6 units across on a planet
    // whose horizon is 4.9 — a mass you could never see whole from the ground,
    // and which filled the frame edge to edge from its own doorstep. 4.0 keeps
    // the gap that matters (this is plainly bigger than the house, and made of
    // different stuff) and drops the part that did not: it now reads as a hill
    // you walk up to rather than a wall you stand under.
    //
    // The size is NOT free to change on its own. Three numbers in CONFIG.cave
    // are derived from it — `walk`, `doorstep` and the mouth — and SPRITE_SIZE
    // in scene.js carries it a fourth time. See each.
    //
    // SEARCHED, not placed by eye. A mound this size does not fit just anywhere
    // on a world 50 units around: at the first spot tried it overlapped the big
    // lake outright. This is the most open ground on the sphere among spots at
    // least 18 units from the house, and everything — both lakes, all three
    // trees, the bench — clears the rock by better than two units.
    //
    // `radius` states the shell outright, exactly as the house does and for the
    // same reason: it is built rather than drawn, so there is no card to
    // measure and the number here drives the wall, the ground cover's keep-out
    // and the berth the scatter gives it all at once.
    { type: 'cave', lat: 0.15, lon: -2.64, h: 4.0, solid: true, radius: 4.0 },
    // In the garden rather than against the wall: 5.3 units out leaves it a
    // clear two past the 3.2 shell, and off the door's own bearing so it is
    // not the first thing you walk into on the way in.
    { type: 'bench', lat: -0.45, lon: 0.50, h: 0.9 },
    { type: 'tree3', lat: 0.74, lon: -1.60, s: 1.90 },
    { type: 'tree1', lat: -0.81, lon: -1.08, s: 1.60 },
    { type: 'tree2', lat: 0.81, lon: 0.57, s: 1.75 },
  ],

  // `paths: [[0, 2], [2, 5], [5, 3], [2, 4], [3, 4], [0, 1]]` stood here — the
  // tracks worn between the landmarks, as pairs of indices into the list above,
  // painted into the ground texture by paintPaths. Both are retired; see the
  // note where paintPaths was called in art.js.
  //
  // The question it answered has not gone away, so it is written down rather
  // than deleted. A LANDMARK ANSWERS "WHERE AM I". A PATH ANSWERED "WHICH WAY",
  // which is the harder of the two here: the horizon on this planet is 4.8 units
  // off, so whatever you set out towards goes behind the curve almost at once,
  // and a line on the ground survives that in a way a landmark cannot. The
  // routes were a minimum spanning tree over the landmarks plus the cheapest
  // edge closing it into a loop — 58 units in all, about an eighth of the
  // surface — and they were fitted to two measurements: the network passed 0.4
  // units from where you arrive, so a visit began stood on one, and no leg came
  // within 1.6 lake-radii of water, so no track ever walked you into a pond you
  // cannot enter. Anything put here in their place wants both of those checks
  // again, plus the indices re-read against `landmarks` — a stale index drew a
  // line between the wrong two things and nothing complained.

  social: {
    // Walk this close on foot and they say hello — the same distance a tap sets
    // you down at, because both mean the same thing: you have come to see them.
    // It was 4.4 against a standoff of 4.6, which had walking up and being set
    // down disagreeing by a couple of inches for no reason either could name.
    //
    // A tap therefore lands exactly on this line. That is deliberate and already
    // handled: main.js marks you as greeted at the moment it sets you down, or
    // the 「greet」 a tap earns and the 「greetBack」 this earns would both fire,
    // a few seconds apart, for one thing you did.
    greetArc: MEET_ARC,
    // ...and back outside this before walking up counts as new. The gap between
    // the two is hysteresis: with one radius doing both jobs, standing on the
    // boundary would greet you over and over. It is the gap that matters rather
    // than the value, so it follows greetArc.
    greetClearArc: MEET_ARC + 2.6,
    greetCooldown: 22000,
    // How long a gift stays special, per friend. Inside this window they still
    // take the gift and still thank you — refusal has no place here — but the
    // thanks is the smaller 「さっきも…」 tier, and the delight is saved for
    // gifts that were not the fourth in two minutes. Long enough that you have
    // wandered off and done something else in between; not so long that a
    // gift-shaped day only has one good moment in it.
    giftCooldown: 10 * 60 * 1000,
    meetArc: 3.6,        // two of them this close stop and talk to each other
    meetCooldown: 30000,
    // The beat between one of them finishing a line and the other answering it.
    // It was 2600 counted from the START of the opening line, which is less
    // than most of them take to read — so the answer landed on top of the
    // question and silenced it. It waits for the line now, which makes this a
    // pause between two lines rather than a cap on the first.
    meetReplyMs: 800,
    // A floor on how long the pair stand still for; the exchange extends it
    // when the lines it picked run longer than this.
    meetHoldMs: 7000,
    farSpeakArc: 15,     // on foot, nobody further than this starts chattering
    waterCooldown: 15000,   // quiet time after somebody teases you for paddling

    // Hop within this of somebody and they hop back — see player.hopHeight for
    // the hop itself. Wider than greetArc on purpose: a greeting is for
    // somebody you have come over to, where a hop is a wave, and you wave at
    // people you have not walked all the way up to. Everyone in range answers,
    // not the nearest — two friends bouncing back at once is the whole charm.
    hopArc: 6.0,
    // The beat before the answer, plus up to the spread more, rolled per
    // character. The beat is what makes it a REPLY — mirroring you in the same
    // frame reads as a rendering glitch, not a response — and the spread is
    // what stops two responders moving as one drilled unit.
    hopReplyMs: 240,
    hopReplySpreadMs: 220,
  },

  wander: {
    // A random walk from wherever they happen to be, not a leash around a
    // fixed spot — so given long enough they will end up anywhere on the
    // planet. Each trip is a short stroll; the roaming is the sum of them.
    roamMin: 2.5,        // world units per trip
    roamMax: 8.0,
    maxLat: 1.25,        // stay off the very poles
    speed: 0.80,         // world units per second
    restMin: 1800,
    restMax: 6000,
    // They stop wandering when you have come to see them, which reads as
    // noticing you — and stops the one you just walked over to strolling off
    // mid-conversation. Keyed on who you are visiting rather than raw
    // distance: they live close enough together that a plain radius freezes
    // the whole cast at once and nobody ever moves.
    // World units, for the one you are visiting. Comfortably OUTSIDE MEET_ARC,
    // and it has to be: at the old 5.4 against a standoff of 5.5 they would go
    // on strolling until the exact moment you arrived, so being noticed landed
    // after the arriving rather than before it. A couple of paces of margin
    // reads as them seeing you coming.
    noticeArc: MEET_ARC + 2.5,
    // ...or anyone who ends up near you. Also their personal space: they stop
    // the moment they cross it.
    //
    // Well inside MEET_ARC, and deliberately not derived from it. MEET_ARC is
    // about framing — where a tap puts you and how near counts as visiting — and
    // this is about a character deciding they have come close enough, which is a
    // different thing with a different right answer. At 3.6 a friend who wanders
    // over is 32.5 degrees wide against a screen 31 across, which is to say they
    // do not quite fit on it. That is the point: somebody coming right up to you
    // SHOULD be overwhelming, and it is their move rather than a place you got
    // stuck in. It was briefly 4.8 to keep them politely framed and that read as
    // them holding back.
    closeArc: 3.6,
    noticeAlt: 4.0,      // only counts if you are actually down on the ground
    // Cut a trip short — stopped for you, or stopped to talk — and this is how
    // long before they think about setting off again. Shorter than restMin on
    // purpose: they were interrupted rather than finished.
    interruptRest: 1200,
    // How wide a berth a walk gives a lake, in radians on top of its own radius.
    // Applies to the destination and to every step of the path there.
    waterKeep: 0.05,
    // ...and the same for a building. Wider than the player's `wallKeep`, and
    // for the same reason `waterKeep` is: they are a card with width standing
    // at a point, so a centre politely outside the wall still puts half of
    // somebody through it. 0.09 radians is 0.72 units, a little over a third of
    // the widest of them.
    wallKeep: 0.09,
    bobAmp: 0.09,
    bobPeriod: 620,
    swayAmp: 0.07,

    // The answering hop, when you hop near somebody — two bounces, the second
    // smaller, like a creature pleased about something. Three times their
    // walking bob of 0.09, because the walk bob is what a hop has to be read
    // AGAINST: at or near it, an answer is indistinguishable from somebody
    // shifting their weight. The split into two bounces lives in character.js —
    // it is the shape of the gesture, not a number worth turning.
    hopBackAmp: 0.26,
    hopBackMs: 660,
  },

  player: {
    // Roughly twice a character's stroll, not four times it. Faster than this
    // and you outrun the friends you came to walk with, and the planet stops
    // feeling like anywhere.
    walkSpeed: 1.7,
    accelMs: 260,        // ease in and out; instant start/stop reads as ice

    // The run, armed by the sprint button: walkSpeed times this while a run is
    // armed, eased over accelMs both ways so it is a lean into a run rather
    // than a gear change. Armed rather than held — it stands down by itself
    // when you stop moving, see the disarm in _walk — so the multiplier is a
    // property of this movement, never a mode the app is left in.
    //
    // 1.6 is chosen against the two numbers a sprint can break. The world
    // churns under a walker at 12 degrees of planet a second and the tiny-
    // planet effect tips from charming into vertiginous somewhere past 20;
    // 1.6 runs at 19.5. And the cast stroll at 0.8, so 2.7 is still "the
    // fastest person here" rather than a different order of being — the
    // walkSpeed note above about outrunning the friends you came to walk with
    // is not repealed, it is rented against, which is why this is a held
    // button and not a faster default.
    sprintBoost: 1.6,
    // ...and how much further the lens opens at a full sprint, on top of
    // walkFov. Speed on a screen is mostly peripheral flow, and a sprint that
    // widens nothing reads as the same walk with the counter turned up.
    sprintFov: 4.5,

    // NOTHING HERE STOPS YOU WALKING INTO SOMEBODY, and that is the decision
    // rather than an omission. There was a brake once — it took the part of your
    // travel that pointed at a character away, so walking squarely up to a
    // friend eased you to a halt at MEET_ARC while walking past one cost
    // nothing. It worked, and it was wrong: this is a place you wander, and the
    // cast are the reason you are wandering, not obstacles in it. Being unable
    // to stand right next to somebody is a rule, and a rule is a thing you can
    // be on the wrong side of.
    //
    // IT IS ABOUT THE CAST AND NOT ABOUT THE WORLD, and that distinction used to
    // be missing. For a long time the water and the house were the only solid
    // things on the planet and the same sentence covered both — friends you may
    // walk through, and trees you may walk through — as though they were one
    // decision. They are not. Walking up to somebody and standing as close as
    // you like is the point of the place. Walking through a tree is not a
    // freedom anybody wanted; it reads as the tree not being there.
    //
    // So the trees, the stumps and the bench are solid now (see SOLIDS in
    // sphere.js), alongside the water and the house, and are solid for the cast
    // as well — a friend strolling through a trunk you were stopped by says the
    // rule is about you rather than about the world. The cast themselves stay
    // walk-through, and the ground cover with them: flowers, mushrooms and grass
    // are things you wade through rather than things in the way. If somebody
    // ends up filling the screen it is still because you chose to stand there.
    //
    // What is left is framing rather than blocking: `camera.standoff` decides
    // where a TAP sets you down, `camera.startAt` where you arrive, and
    // `wander.closeArc` how near they choose to come. See MEET_ARC.

    // A walk cycle. Without it you glide at constant velocity, which reads as
    // a camera drone rather than a pair of legs.
    stepsPerUnit: 1.3,
    bobAmp: 0.055,
    rollAmp: 0.014,

    // The hop: double-tap open ground and you jump on the spot, straight up and
    // back down. Purely expressive — it clears nothing, reaches nothing and
    // outruns nothing, because there is nothing here for a jump to beat. It
    // exists because hopping is how this cast talks with their bodies (their
    // walk IS a hop), and a visitor who can only glide about is mute in it.
    // Hop near somebody and they hop back — see social.hopArc.
    //
    // The height is against an eye at 1.7. It was 0.42 — a real bounce without
    // being a trampoline — and that was the right size while the jump was
    // purely expressive and the tallest thing in the world was your own knee.
    // It has a job now: the table is 0.72, and at 0.42 you arrived a third of a
    // unit short and were carried the rest of the way by the mantle, which
    // reads as being helped up rather than as jumping onto something. At 0.60
    // the shortfall is 0.12 and the mantle is a forgiveness rather than the
    // mechanism.
    //
    // `hopMs` goes up with it, and has to. Gravity here is derived from the
    // pair (g = 8H/T²), so raising the height alone would have held the arc to
    // the same half-second by making the world pull harder — a bigger jump that
    // feels snappier, which is the opposite of bigger. 0.60 over 560ms works
    // out at 15.3 against the old 14.6: near enough the same gravity, so it is
    // recognisably the same hop with more push behind it.
    //
    // IT RIDES ITS OWN CHANNEL, NEVER `alt`, and that is load-bearing rather
    // than tidy-minded. The landed/airborne split is strict — isFirstPerson
    // wants `alt` within groundBand (0.35) of eyeHeight — so a jump pushed
    // through `alt` flips you "airborne" mid-hop: the walk cuts out and a
    // swipe spins the planet instead of your head, for the 480ms the jump
    // lasts. It is added where the walk bob is added, which never touches
    // `alt` for the same reason.
    // These two are still the shape of the jump and are now the shape of a real
    // one: the rig integrates a vertical speed under gravity rather than reading
    // a parabola off a clock, and both numbers are converted into that at the
    // top of the walk — v0 = 4H/T and g = 8H/T², which reproduces exactly this
    // arc when you land back where you took off. What changes is that you might
    // not: the arc can end early on a stump, and it can go on longer off the
    // edge of one.
    hopHeight: 0.60,
    hopMs: 560,

    // How high a lip you walk up without jumping at all. Below this a standable
    // thing is a kerb; at or above it, it is a wall until you hop.
    //
    // It exists because the alternative is worse in both directions. Too low
    // and the cushions have to be JUMPED onto, and a room where you hop over
    // the bedding reads as an assault course. Too high and you drift up the
    // side of the futon (0.59) without meaning to, which is a floor that has
    // stopped being flat.
    //
    // MEASURED AGAINST WHAT IS ACTUALLY IN THE ROOM, not chosen as a fraction
    // of anything. It was 0.25, which sounded ankle-high and turned out to
    // clear nothing at all: the cushions build to 0.28 and 0.30, so every
    // standable thing in the world needed a hop and the kerb rule was dead
    // code. The next thing up is the box at 0.38 and the smallest stump at
    // 0.36, so anywhere in 0.31–0.35 separates "step onto the bedding" from
    // "climb onto the furniture". 0.32 sits at the bottom of that window,
    // because the failure on the high side — sliding up the futon by accident
    // — is much worse than the failure on the low side.
    stepUp: 0.32,

    // How long the eye takes to catch up when the ground under it moves.
    //
    // This is the whole of what stops a mantle reading as a teleport, and it is
    // a rendering lag rather than a physics one — where your feet ARE is
    // decided instantly, as it must be, and only the drawing of it is eased.
    //
    // The snap is unavoidable and correct. Catch a lip on the way up and the
    // feet jump from wherever they physically are to the surface, which can be
    // the whole `mantle` — 0.38 — in a single frame. Step up a kerb and it is
    // the kerb's height, likewise at once. Measured against the eye's own
    // fastest honest movement (0.065 in a frame, at the bottom of a hop), a
    // table catch moved it 0.224: three and a half times as fast as anything
    // the arc ever does, arriving mid-air while you are watching the edge you
    // aimed at. That is the lurch, and it is entirely in the picture rather
    // than in the model.
    //
    // So the drawn feet keep the gap and give it up over this. The composition
    // cancels by construction on the frame of the catch — see the note in the
    // rig — so the eye does not move at all at the moment of it, and what plays
    // out instead is a short pull-up onto the surface, which is what a mantle
    // is meant to look like in the first place.
    //
    // 120ms is about seven frames: fast enough to read as being pulled rather
    // than lifted, slow enough that the eye never outruns its own arc.
    pullMs: 120,

    // ...and how far ABOVE your feet you can still catch a ledge while rising.
    //
    // Catch the lip on the way up and you are pulled onto it, which is what a
    // person actually does with a waist-high surface. Only while RISING —
    // falling past a ledge does not hoist you, or stepping off a table would
    // yank you back onto it.
    //
    // It used to be the mechanism and is now the forgiveness. Against the old
    // 0.42 jump it carried you the last third of a unit onto a table, which is
    // most of the way and reads as being helped up; against 0.60 it covers 0.12
    // and reads as having caught the edge. Both put the ceiling comfortably
    // over the table (0.72), which is the tallest thing in the world with a top,
    // so what changed is the feel rather than what is reachable.
    //
    // Kept at 0.38 rather than trimmed to match the taller jump. It is also
    // what absorbs the difference between arriving at a lip and arriving at it
    // exactly, and a jump that only just reaches is a jump you have to aim.
    mantle: 0.38,

    // How far you may walk off an edge before the ground gives way, as a
    // fraction of a step. Nought is correct and unpleasant: a floor sampled once
    // a frame drops you the instant your CENTRE clears the rim, which on a
    // table you were walking across is a fall that begins while you still look
    // to be standing on it. This is the ledge under your heels.
    ledge: 0.12,

    // What counts as a double tap: a second tap this soon after the first, and
    // this near it on the screen. The window never delays the single tap — the
    // first tap has already started its walk by the time the second arrives,
    // and the walk is kept, so a double tap means "hop over there" rather than
    // asking anybody to wait and see. The slop is generous because two quick
    // thumb taps land further apart than two deliberate ones.
    doubleTapMs: 320,
    doubleTapPx: 90,

    // Water, in radians on the globe. You cannot walk into a lake: a step that
    // would land inside one is refused, and a tap on one walks you to its shore.
    //
    // shoreKeep is how far short of the rim that stops you. It can be small
    // because the rule ellipse already sits a little outside the drawn
    // waterline — measured at up to 0.38 units of margin — so nought would keep
    // your feet dry on its own. This is only so you stop *at* a shore rather
    // than exactly on the line of one.
    //
    // shoreNotice is the wider band that gets you teased about the water. It
    // has to be wider than shoreKeep or the lines could never fire, now that
    // being properly in a lake is impossible.
    shoreKeep: 0.012,    // ~0.10 world units at radius 8
    shoreNotice: 0.075,  // ~0.60 world units

    // Walls, in radians, and the same idea as shoreKeep: how far short of a
    // building you are stopped, so that you come to rest AT a wall rather than
    // exactly on the line of one.
    //
    // It is the trees, the stumps and the bench as well, which are solid now —
    // one number for everything that is not water, because "stop a hand's width
    // short of the thing" is one idea however many kinds of thing it covers. A
    // tree needs no more than a wall does: its registered radius already holds
    // your eye clear of the leaves, so this is the last tenth of a unit on top
    // rather than the clearance itself. See treeSolidRadius in foliage.js.
    wallKeep: 0.012,     // ~0.10 world units at radius 8

    // `doorAim` stood here: how squarely you had to walk at a wall for it to
    // count as walking at the door. It only ever made sense while the house was
    // a card that turned to face you, because then the drawn door faced you from
    // every bearing and any deliberate approach really was an approach to it.
    // The house is a building now, with a door in one place and a front — so
    // going in is a tap, and a wall is just a wall.

    // Tap-to-walk
    arriveArc: 0.7,      // world units; close enough to call it arrived
    // How far a finger may slide and still count as a tap rather than a drag.
    // One number for both the pad and the camera, because a thumb does not know
    // which of them it landed on.
    tapSlop: 12,         // px

    stickRadius: 62,     // px from the centre of the pad to the rim
    deadzone: 0.16,
    // The pad has no home: it appears under your thumb anywhere in this corner
    // of the screen, as a fraction of width and height. A touch on a character
    // still wins, so someone standing down here is always reachable.
    stickZone: { x: 0.46, y: 0.52 },
  },

  // Inside the house — which is not another place any more.
  //
  // The room used to be a separate scene, BIGGER than the building it was
  // inside (10.4 across against a 6.4 house), joined to the planet by a
  // choreographed cut hidden behind an opaque veil. All of that is gone. The
  // interior is the inside of the same dome you can walk around on the grass,
  // at the dome's own honest size, and you get in by walking through a real
  // gap in the wall where the door is. What the old cheat bought was floor
  // area; what honesty buys back is the passage itself — you can stand on the
  // grass and see the rug through the open door, walk in without the world
  // blinking, and turn round to see the grass again behind you.
  //
  // The price is that everything in here now fits a room 3.2 tall and about
  // 4.5 across at head height: a hut, not a hall. That is the trade, made
  // knowingly.
  //
  // Everything is placed by a bearing round the house — the door is bearing 0,
  // exactly as it always was — and a distance out from the middle along the
  // ground, in world units.
  interior: {
    // How far out from the middle you may walk, in world units. It is not the
    // wall (3.2), and cannot be: the dome curls in overhead and the camera's
    // near plane is 0.3, so the line has to hold the EYE clear of the shell,
    // not the feet. At 2.25 out, an eye 1.7 up is still 0.35 from the shell in
    // every direction — past that and the wall clips open in the corner of the
    // frame. The same number, doing the same job, as the old room's
    // walkRadius; the collision layer knows it as `inner` (see sphere.js).
    walk: 2.25,

    // Shoving the ITEMS about — see `item` on the plushie, the teapot and the
    // lantern below, and nudgeLoose
    // in scene.js. Three numbers, and they are a feel rather than a simulation:
    // this is a toy being pushed along a floor by somebody's shins, not a body
    // with mass being struck.
    //
    // `nudgeReach` is how near your feet have to be for it to go. It is the
    // bear's own half-length plus a little, so contact looks like contact.
    //
    // `nudgeSpeed` is the shove at its hardest, dead centre, falling to nothing
    // at the rim of the reach. WELL UNDER A WALK (1.7): a toy that outruns the
    // person pushing it has been kicked, and kicking Chiikawa's bear across the
    // room is a different game from this one. At 0.8 it scoots ahead of you and
    // you catch it up, which is the whole of the joke.
    //
    // `nudgeDamp` is how long it keeps going once you stop touching it, as an
    // exponential time constant. Short: it is a stuffed thing on a rug, and it
    // stops about when you would expect a stuffed thing on a rug to stop.
    nudgeReach: 0.42,
    nudgeSpeed: 0.8,
    nudgeDamp: 160,
    // How much narrower the wall's open gap is than the drawn doorway, per
    // side. The frame's ink legs are painted ON the wall, so the passage the
    // collision offers has to stop short of them or you could walk through a
    // drawn line.
    gapInset: 0.14,

    // WHICH WAY THE FRONT OF THE HOUSE FACES, as a compass bearing at the
    // house: 0 is north, and positive turns east.
    //
    // It used to face wherever the maths happened to put it. The shell is
    // turned by the shortest rotation that takes the model's up onto the
    // house's own surface normal, and that rotation leaves the door pointing
    // in a direction nobody chose — fine while the door was scenery, and not
    // fine once you arrive on its doorstep, because where you arrive is
    // wherever the door happens to be looking. A building's front is a design
    // decision, so it is written down.
    //
    // North, so that the arrival looks south at it across open ground — see
    // camera.spawnBack, and the cast in cast.js, who are placed around this
    // same bearing.
    doorFacing: 0.0,
    // THE windows — like the door, one set of numbers for both sides of the
    // wall. They used to disagree about everything: a circle indoors against a
    // square outside, at different heights, different sizes and different
    // bearings, so walking in moved the windows and changed their shape.
    //
    // `windowSize` is the PATCH, not the glass. WINDOW_SHEET leaves a
    // transparent margin round the frame, so what you see is about three
    // quarters of this — which is why 1.15 looked like a porthole. 1.70 draws
    // roughly 1.25 of glass, near a fifth of the house's width, as the
    // reference has it.
    //
    // `windowHeight` is the centre above the floor. It was 62% of the way up
    // the house and sat too near the crown; the reference puts it a little
    // above halfway, which is 1.70 on a building 3.2 tall.
    //
    // `windowsAt` is measured from the door, which is bearing 0 on both sides,
    // so the two frames already agree about where "the front" is. They were
    // 2.05 indoors and 0.95/1.05 outside, which put the same window in two
    // different places depending which side of the wall you stood on.
    // ONE window. There were two, mirrored either side of the door, and the
    // reference has a single one off to the right — which is also the more
    // characterful arrangement: a pair reads as architecture, one reads as
    // somebody's house. The list is still a list, so a second can be put back
    // by adding a bearing here and nothing else.
    windowsAt: [0.82],
    // Lowered after moving to the right. The old height and 1.92 patch pushed
    // its top into the silhouette, where the curved patch collapsed into a
    // roof-like wedge. This smaller square sits on the visible wall while
    // retaining the reference's upper-right placement.
    windowHeight: 0.90,
    windowSize: 1.30,
    // The small mounting block for Chiikawa's portrait plate, tucked between
    // the door and the window. Like `windowsAt`, its bearing is measured from
    // the door; unlike a window it is only a surface patch and cuts no hole.
    plateAt: 0.55,
    plateHeight: 0.25,
    plateSize: 0.46,
    // THE door — one width for the whole building, used by the arch you see
    // from the grass and the arch you see from the rug alike. There is one way
    // in, so there is one number for it; the height follows DOOR_SHEET's aspect
    // at both ends, which is what stops the two shapes drifting apart.
    //
    // A door is not sized against the wall it is cut into, and that is why it
    // has been wrong in both directions. Taken as a fraction of the dome it
    // silently re-sized itself every time the house changed. Given a free
    // height of its own indoors, it stretched its drawing into a different
    // curve from the one outside.
    //
    // IT IS SIZED AGAINST THE PEOPLE WHO WALK THROUGH IT, which is a rule this
    // door only earned when the house stopped being two places. It was 1.62 —
    // 1.93 tall, a 1.84 clear opening — and the note here dismissed the fact
    // that nobody fitted: "their top few pixels pass behind the wall for a
    // beat, which reads as ducking through. It is a look, not a fit." That was
    // true while the threshold was a cut hidden under a veil and the cast
    // faded out on the doorstep. They walk through it now, in full view, and
    // so do you — a look is no longer good enough.
    //
    // Measured, not chosen. Their drawn heights are 2.01, 2.33 and 2.79, and
    // 2.2 is the width whose clear opening (2.45) passes the first two upright
    // with headroom. Usagi's 2.79 is ears, and ears brush the arch: a doorway
    // is built for bodies, and a house whose front door cleared those would be
    // a doorway with a house around it. It already was, once — 73% of the
    // whole front — and this is 63%, a third of the building's width.
    //
    // If the house is resized, this does not follow it automatically, and
    // should not: re-derive it against the cast, the same way.
    doorWidth: 2.2,
    rug: 0,

    // What is in it. `at` is a bearing round the room and `out` a distance
    // from the middle in world units; `h` is the drawn height and the width
    // follows the drawing's own shape, as it does for every card in the app.
    //
    // Refit to the honest dome from the big room's arrangement, keeping its
    // reasoning: gathered on the window's side (`windowsAt[0]`), because the
    // window is the only direction in a round room and furniture drawn up to
    // the light reads as somebody's arrangement. The middle stays clear — you
    // come in on bearing 0 and whoever is home stands across from you at pi,
    // and the centre of the room is the sightline between you.
    //
    // The pieces kept their drawn heights: the dome shrank around them, not
    // them with it. A table you could stand on the rug beside outside a
    // doll's house would read as one, and 0.72 against a 3.2 apex is the same
    // table in a smaller room.
    //
    // NOTHING in here is solid. Outside, only the house and the water stop
    // you, on the stated grounds that a bench you could not step over reads
    // as a bug rather than as furniture — and in a room three strides across
    // that argument is stronger, not weaker. You walk over a cushion the way
    // you walk over a flowerbed. `spin` is which way a piece faces; left out,
    // it looks across the room. `clutter` puts somebody's book on the top.
    // `seat` marks what a guest may sit on.
    furniture: [
      // Turned a quarter, so the top's long axis now runs the other way across
      // the room. It was -0.9; a right angle on top of that is 0.67.
      { art: 'table', at: -1.15, out: 1.30, h: 0.72, clutter: true, spin: 0.67 },
      // Both cushions turned to face the table rather than across the room.
      //
      // MEASURED, not derived. `spin` is a bearing taken at the middle of the
      // house and then transported to wherever the piece stands, so "point at
      // that other piece" is not the bearing of the other piece and is not the
      // angle between them either — working it out by eye put the bear 137
      // degrees out earlier in this same room. These are the signed angles
      // between each cushion's own forward and the table, read off the built
      // scene, and they were checked against the flat-room arithmetic
      // independently: -2.650 against -2.653, and 0.359 against 0.356.
      //
      // They were left facing the room's middle by default (the first) and
      // turned to 1.1 by hand (the second); both were about a right angle off
      // the table, which on a piece as round as a cushion is the kind of wrong
      // that reads as nothing in particular rather than as a mistake.
      { art: 'cushion', at: -0.58, out: 1.48, h: 0.17, spin: -2.65, seat: true },
      { art: 'cushion', at: -1.74, out: 1.50, h: 0.16, spin: 0.36, seat: true },
      // The futon, across the room from all of that, and the reason is the
      // gathering rather than the light. Everything above is on the window's
      // side because that is where an arrangement goes; a fourth piece pushed
      // in among them is not an arrangement, it is a pile — and the biggest
      // thing on the floor is the worst one to pile. Sleeping away from the
      // window is also simply what people do.
      //
      // Off the door's own bearing on the other side, so the sightline from
      // the threshold to whoever is stood at pi stays open: you come in, and
      // the room has a made-up bed to one side of you rather than across the
      // way in.
      //
      // No `spin`. The default faces a piece across the room, and this one is
      // built long across that facing, so the default already lays it ALONG
      // the wall — which is where bedding goes.
      //
      // `h` is the top of the stack, not of any one layer: the builder makes
      // three — base, comforter, pillow — and shares this between them. At 0.60
      // it comes to about a third of Chiikawa's height and a metre and a half
      // long: the biggest thing in the room after the table, and the only one
      // you would lie on. It is the one number to turn; the arrangement inside
      // is measured against the base's own footprint and follows.
      //
      // It was 0.46 while the layers were thin, and raising it is what let them
      // be thick without the footprint growing to match — three slabs a fifth
      // as deep as they are wide read as a stack of plates whatever the piece
      // is scaled to, because that ratio is the whole of it.
      // Turned end for end. It took the default facing before — across the
      // room, which for a piece built long across that facing already laid it
      // along the wall — so this is that default plus a half turn, which comes
      // back round to the bearing itself. What actually moves is the PILLOW:
      // the head end is now the other end.
      { art: 'futon', at: 1.78, out: 1.28, h: 0.60, spin: 1.78 },
      // Chiikawa's pink sasumata, laid across the futon. The
      // explicit item id makes this one physical weapon independently
      // pickup-able, placeable, and returnable to this home position.
      { art: 'pinkweapon', at: 1.78, out: 1.28, h: 0.52, spin: 1.78,
        lift: 0.61, item: 'chiikawaWeapon' },
      // Chiikawa's bear, LYING on the floor at the head end of the futon —
      // dropped where its owner got up, which is where a toy actually is. It
      // stood on the bed first, held there by a `lift` field the scene grew for
      // it; a prop balanced on a prop needs a height that chases every futon
      // edit, and the floor asks for nothing, so the field went away with the
      // arrangement.
      //
      // The builder lays it down itself — see buildPlushie — so `h` here is
      // still its standing height, which lying down is its LENGTH along the
      // floor. Half a unit against Chiikawa's 2.01: a toy you could carry under
      // one arm. Just off the rug's edge and a hand's width clear of the
      // futon's own footprint, so the two outlines never touch.
      //
      // `spin` turns it on the floor. It lies on its back, so its face is up
      // whatever this says; what this picks is which way its head points, and
      // it points back toward the bed it came off. MEASURED, not guessed: the
      // signed angle between the bear's head and the bearing of the futon,
      // taken in the room's own ground plane. The first guess had it 137
      // degrees out, which is the sort of error a bearing in a rotated frame
      // makes and the eye does not catch as wrong, only as odd.
      //
      // `item` is what makes it one of the things in the room you can move. It is
      // a toy, it weighs nothing, and it is lying on the floor where somebody
      // dropped it — of everything under this roof it is the only piece whose
      // position is an accident rather than an arrangement, which is exactly
      // what makes shoving it about harmless. Shove the table and you have
      // rearranged somebody's home; shove the bear and you have shoved a bear.
      { art: 'plushie', at: 0.75, out: 1.32, h: 0.50, spin: -0.29, item: true },
      // The teapot, and the second thing in the room you can shove about —
      // `item` again, which also takes it out of the solids, so it is neither
      // something you bump into nor something you can stand on. A pot is a
      // thing that gets kicked under a table, which is exactly what that tier
      // is for.
      //
      // Off the door's own line rather than on it. It would survive being in
      // the walkway — being shoved is the point of it — but a pot that lives in
      // the doorway ends up in a different corner every visit, and this one
      // should read as somebody's, set down near the cushions.
      // Measured, not chosen: at -0.20/0.95 it stood 0.068 off the nearer
      // cushion, which on two round things is touching. This clears everything
      // by better than a sixth of a unit.
      { art: 'teapot', at: 0.20, out: 0.86, h: 0.26, spin: 0.62, item: true },
      // The lantern — the third ITEM, and the first light source in the app.
      //
      // `item` rather than `nudge`, and the word is the point: these three are
      // not furniture that happens to slide, they are things somebody owns and
      // puts down. See the note on the flag above, and ITEMS in items.js, whose
      // `unique` kind is reserved for exactly this trio.
      //
      // Beside the bed at its head end, in the one gap left between the bear
      // and the futon.
      //
      // `lit: false` — IT STARTS OUT, and the argument that had it starting lit
      // ("a lantern nobody has lit is a brass ornament") was answered by the
      // lamp becoming something you carry. A lamp that is already burning when
      // you first walk into the room is scenery; one you have to light is a
      // thing you own, and lighting it is the first small act the room offers.
      // It also stops the house from arriving pre-lit at noon, which is what a
      // burning lantern in a sunlit room looks like.
      //
      // SEARCHED, and then searched again properly. It sat at 1.42/1.02 and
      // measured 0.014 off the futon — a lamp buried in the bedding.
      //
      // The first replacement was scored on a grid and was still wrong, for the
      // reason this room keeps teaching: the scan rebuilt the bearing frame
      // from a world axis instead of asking the scene for it, so its bearings
      // were not these bearings and its winner landed 0.059 off the futon. A
      // bearing here is only meaningful in the house's OWN frame, and the way
      // to get that frame is to read it off two pieces already standing in it.
      // It also treated the lantern as a 0.30 sphere, which is the diagonal up
      // to the bail; across the floor it is 0.106.
      //
      // The corner past the cabinet, which is where a lamp lives anyway. The
      // household's standing spots were counted as obstacles too — somebody
      // standing in the lamp is the same picture as the lamp standing in
      // somebody.
      { art: 'lantern', at: -2.93, out: 1.75, h: 0.34, item: 'lamp', lit: false },
    ],

    // Sitting — the guests'. The player does not sit in this version of the
    // house: the seat machinery belonged to the old room's own rig, and porting
    // it to the planet rig is a job of its own. The cushions still mean
    // something because whoever is home takes one.
    //
    // How far a character sinks into a seat while they have no sitting drawing
    // of their own, as a fraction of their drawn height. A standing sheet with
    // its feet on a stool reads as somebody standing ON the stool; dropped by a
    // third, the seat line crosses where their legs would fold and it reads as
    // sitting. Ignored the moment a real `sit` sheet exists, because a drawing
    // made for the job knows where its own base is.
    sitSink: 0.34,

    // Where a tap on the house sets you down, as a distance from the MIDDLE of
    // the building. A pace clear of the 3.2 wall, facing the open door: the
    // last two steps through it are yours to take, which is the whole point of
    // the door being real. It has to move if the house is resized, or a wall
    // grown past it would set you down inside the masonry.
    doorstep: 3.8,
  },

  // ------------------------------------------------------- Hachiware's cave
  //
  // The second home, and deliberately NOT a second house. It is the same
  // machinery — a dome shell with the openings punched through it and a room
  // inside made of the same world — wearing a different set of numbers, and the
  // numbers are where the difference lives.
  //
  // THE MOUND AND THE HOLLOW ARE ONE SHELL, and that is the decision the whole
  // of this depends on. The obvious build was two things: a cave, and a cliff
  // behind it for the cave to be cut into. It was built that way first and it
  // does not work on a planet this small, for a reason worth writing down.
  //
  // A hill that the cave is cut into has to stand BEHIND the cave, and its
  // near face has to clear the room — so its middle ends up at least a room's
  // width plus its own radius away. On a globe of radius 8 the horizon is 4.9
  // units off, so a hill big enough to read as a landscape is already sunk
  // behind the curve: measured, its top sat 21 degrees BELOW eye level from the
  // cave's own doorstep, lower on screen than the cave itself and completely
  // hidden by it. Every size traded the same way — close enough to see meant
  // too small to matter, big enough to matter meant over the horizon.
  //
  // So the hill IS the cave. One dome of rock, 4.0 across the radius, with
  // grass over its crown and a mouth at its foot — which is what the manga
  // panel actually shows, and what the interior frame is the inside of. It
  // costs one shell instead of three meshes, needs no collision of its own, and
  // cannot be hidden behind itself.
  //
  //   The MOUTH is not a door. The reference draws the opening as a small arch
  //   at the base of a large mound, so `doorWidth` here is 3.40 against a shell
  //   of 4.00 — and it is the one number that did NOT shrink with the mound,
  //   because it is the one number the cast set rather than the rock. You do
  //   not walk through it, you walk in.
  //
  //   There are NO WINDOWS. `windowsAt` is empty, and that is not an omission:
  //   a hole in the side of a rock is a second entrance, not a window, and the
  //   mouth is already letting in all the light there is.
  //
  //   Its few belongings are Chiikawa's old cardboard box, a second lantern,
  //   the flower-and-vase shelf, the cabinet, Hachiware's tied rubbish bags,
  //   worn bedding, and Chiikawa's former ceiling bulb. There are still no
  //   windows, but the two lights give the cave its own warm glow after dark.
  cave: {
    // How far out from the middle you may walk, in world units. Same job as the
    // house's 2.25: it holds the EYE clear of a shell that curls in overhead,
    // not the feet clear of the wall. At 2.75 out an eye 1.70 up is 3.23 from
    // the middle against a shell at 4.00, so three quarters of a unit of stone
    // in every direction — twice the house's own margin, on a room a quarter
    // wider than hers.
    //
    // Scaled with the shell when it came down from 4.8, since what it measures
    // is a distance to that shell. Anything derived from this — the household's
    // standing spots, which are fractions of it — follows for free.
    walk: 2.75,
    nudgeReach: 0.42,
    nudgeSpeed: 0.8,
    nudgeDamp: 160,
    gapInset: 0.14,

    // WHICH WAY THE MOUTH FACES, as a compass bearing: 0 north, positive turns
    // east. You arrive from Chiikawa's house on bearing 1.30, so this is 17
    // degrees off it — the mound is what you see first, and the hollow in its
    // side a moment later, from an angle. Dead-on would have read as a front
    // door, and it is not one.
    doorFacing: 1.00,

    // NONE. See the note above — this is the field that makes it a cave.
    windowsAt: [],
    windowHeight: 1.44,
    windowSize: 1.92,

    // The mouth: 3.40 across, which after the arch sheet's own proportions
    // comes out 2.61 tall.
    //
    // THE ONE NUMBER HERE THAT DID NOT SHRINK WITH THE MOUND, and the reason is
    // that it was never the mound's to set. Work back from the cast, exactly as
    // the house's front door does: the drawn arch loses about 0.17 to its own
    // ink, so a 3.40 mouth offers 2.44 of clear opening, and Hachiware is 2.33.
    // Below about 3.43 he stops fitting through his own front door upright —
    // 3.20 would leave him 0.05 short. Usagi's ears brush it, which is the same
    // trade the house already makes and says so.
    //
    // What that costs is a mouth which is now 43 percent of the mound's width
    // rather than 35, so the hollow is a larger part of the hill than it was.
    // That is the right way round: a hole sized for the people who live in it
    // reads as somebody's home, and a hole sized for the hill reads as scenery.
    //
    // It was 4.30 once, and at that width it was a mouth pretending to be a
    // building: the crown reached 79 percent of the way up the shell and landed
    // within a couple of degrees of the mound's own skyline, so the rock read as
    // a thin hood over an enormous opening.
    doorWidth: 3.40,
    // No rug. The floor is stone and stays stone. 0 skips the stamp entirely.
    rug: 0,

    // ALMOST EMPTY. The hollow is bare stone apart from a cardboard box with a
    // lantern beside it, a flower-and-vase shelf above a cabinet, two tied
    // rubbish bags, worn bedding, and a bulb hanging from the ceiling.
    //
    // It was furnished — a low table with cups on it, two cushions drawn up to
    // it, a futon, two crates and a lantern, all read off the anime frames —
    // and it is deliberately not any more. What remains is the space itself:
    // a dome of rock, eight small belongings, light, and stone plates.
    //
    // The list stays a list, and every field the house's pieces use still works
    // here; put a line back and the piece comes back with it. Nothing else in
    // this spec is furniture-dependent.
    //
    // The room still has no seats:
    //
    //   The duplicated lantern is lit independently of Chiikawa's original,
    //   giving the cave a warm pool of light and a visible glow at night.
    //
    //   No seats, so a guest who comes home stands. household.js already falls
    //   back to `household.spots` when it cannot find a free cushion, which is
    //   the case this room now always takes.
    //
    //   The few floor solids stay around the wall and leave the middle clear.
    furniture: [
      // The cardboard box sits in front of the cabinet on the cave's right,
      // close enough to read as one arrangement without blocking its drawers.
      { art: 'box', at: 0.25, out: 0.88, h: 0.38, spin: 0.25 },
      // A duplicate of Chiikawa's floor lantern, standing beside the box and
      // aimed toward the cave mouth.
      // It has its own item id, so both lanterns remain independently
      // carryable despite sharing the same art.
      // Unlit to start, like Chiikawa's — see the note there. The cave has no
      // wired bulb at all, so this is the only light in it, and one you light
      // yourself is a better thing to find at the back of a cave than one
      // already burning for nobody.
      { art: 'lantern', at: 1.05, out: 1.45, h: 0.34, spin: 0,
        item: 'hachiwareLamp', lit: false },
      // The flower-and-vase shelf sits low on the right wall above the cabinet.
      { art: 'shelf', at: 1.58, y: 1.10, h: 0.64, wall: true },
      // The cabinet sits against the right wall; both bags occupy the left.
      { art: 'nightstand', at: 1.75, out: 2.62, h: 0.62 },
      { art: 'trashbag', at: -2.23, out: 2.66, h: 0.78, item: 'trashBag' },
      { art: 'trashbag2', at: -1.72, out: 2.69, h: 0.72, item: 'trashBagAlt' },
      // Hachiware's worn mat runs front-to-back along the open left floor,
      // with its folded bedding toward the rear of the cave.
      { art: 'wornbedding', at: -0.85, out: 1.15, h: 0.58, spin: -1.57 },
      // Hachiware's blue sasumata lies across the bedding. It is a separate
      // physical item from Chiikawa's pink one and can be carried independently.
      { art: 'blueweapon', at: -0.85, out: 1.15, h: 0.52, spin: -1.57,
        lift: 0.20, item: 'hachiwareWeapon' },
      // Chiikawa's former bare bulb, wired into the apex of the cave.
      { art: 'bulb', ceiling: true, hang: 0.62, h: 1.03, night: true },
    ],

    sitSink: 0.34,
    // A pace clear of the 4.00 shell, on the mouth's own line. Moves with the
    // shell, or a tap on the mound would set you down inside the rock.
    doorstep: 4.8,
  },

  // Going home.
  //
  // Deliberately RARE. This is not a routine and must not read as one: the
  // planet is where they live, and the house is somewhere they occasionally
  // are. Seen too often it becomes a commute — three characters shuttling in
  // and out on a timer, which is the exact opposite of the unhurried thing this
  // place is for. Seen rarely it is a small event: somebody is missing, and the
  // windows are lit.
  //
  // At these numbers each of them thinks about home about every eight minutes
  // and stays for about a minute, so any one of them is in roughly a seventh of
  // the time. Across three that is somebody home a little under half the time,
  // and never more than one at once.
  //
  // `gapMin` is the number to turn. Everything else is shape.
  household: {
    gapMin: 5 * 60 * 1000,
    gapMax: 11 * 60 * 1000,
    // ...and the first one is not due for a while after you arrive, so the
    // opening minutes of a visit are the three of them out on the grass.
    firstGapMin: 3 * 60 * 1000,
    firstGapMax: 7 * 60 * 1000,

    stayMin: 45000,
    stayMax: 95000,

    // Never the whole cast. Coming back to an empty planet because all three
    // happened to be indoors would read as them having left rather than as
    // them being home.
    atOnce: 1,

    // How near the doorstep counts as arrived at it. Generous — they are
    // walking to a building four units across, not threading a gate; the
    // threading happens on the legs below.
    arriveArc: 0.9,
    // ...and how near an INTERIOR waypoint counts as arrived, which cannot be
    // the same number: the room is four and a half units across in total, so
    // an 0.9 arrival would call the far side of it "here". The fade that used
    // to stand in for the threshold is gone — they walk through the gap the
    // same way you do, in view the whole way.
    //
    // 0.60, AND IT HAS TO BE. It was 0.35, which is a distance no guest could
    // ever reach, so nobody had sat down since the furniture became solid —
    // measured over a hundred simulated minutes and twenty-nine errands, in
    // this build and in the one before the cave went in: not one arrival.
    //
    // The seat a guest is walking to IS a cushion, and a cushion is a solid
    // now. Their pathing pushes every target off a solid by its own radius plus
    // the wander berth, so the nearest they can legally stand to a cushion's
    // middle is 0.44 — measured at every seat in both homes, the widest being
    // 0.443. Asking them to get within 0.35 of it is asking them to stand
    // inside the thing they came to sit on. They walked in, fetched up against
    // the cushion, waited out `headingMax` and left again, which read as the
    // house being one you can visit but never be at home in.
    //
    // So: the widest push-out, plus a third of a unit of slack for the room to
    // grow a wider cushion without this going quietly dead again. Still well
    // under `arriveArc`, and a seventh of the smaller room's width.
    homeArrive: 0.60,

    // How long a walk home may take before they think better of it. The trip is
    // at most about fifty seconds from the far side of the planet, so this is
    // three times the worst honest case — long enough never to interrupt a real
    // walk, short enough that a character frozen by you standing next to them
    // does not hold the house shut behind them indefinitely.
    headingMax: 150000,

    // Where they stand once inside, as bearings around the room and a distance
    // out from the middle as a fraction of the walk radius.
    //
    // The FIRST one is straight across from the door, and that is the whole of
    // why this is a list in a particular order rather than a scatter. A portrait
    // phone sees about 31 degrees of the room at a time, so a guest parked even
    // a third of the way round the wall is off the side of the screen when you
    // walk in — you arrive, the room looks empty, and you have to think to look
    // about. Since `atOnce` is 1, whoever is home always takes this spot and is
    // always the first thing you see. The others only come into play if more
    // than one is ever allowed in at once.
    spots: [
      { at: 3.14, out: 0.58 },
      { at: 2.62, out: 0.66 },
      { at: -2.62, out: 0.66 },
    ],

    // What the windows say when nobody is in. Not nothing: a house with every
    // light off reads as derelict rather than as empty, and the lit sheet is
    // the only thing marking the building out after dark. This is a porch light
    // against a full room.
    emptyLamps: 0.34,
    // How long the windows take to notice, in milliseconds. Slow enough to read
    // as someone crossing a room to a switch rather than as a state flipping.
    lampEaseMs: 2200,
  },

  daylight: {
    // How long a phase takes to cross-fade. Long enough that the sky is clearly
    // *moving* rather than cutting, short enough that pressing the button twice
    // in a row does not feel like it was ignored the first time. The clock's own
    // hourly changes use it too, though nobody is ever watching for those.
    fadeMs: 1500,
    checkMs: 30000,      // how often the wall clock is re-read, while on じどう
    // How long a full 24 hours takes once you have set the hour by hand.
    //
    // A chosen hour does not stop the day where you put it — the world goes on
    // turning, just faster than the one outside. Pick よる and it is genuinely
    // night, and stays night for a while, but walk far enough and you will see
    // it get light. Freezing it was the alternative and it made the planet feel
    // switched off: the one thing this place does on its own is change.
    //
    // Twelve minutes puts the phases at roughly morning 3 min, noon 2.5,
    // evening 2, night 4.5 — long enough that an hour is somewhere you are
    // rather than a slideshow, short enough that standing still is never
    // standing still. This is the one number to turn if that balance is wrong.
    fastDayMs: 12 * 60 * 1000,
    // How often that hand-wound clock is re-read. It only has to be fine enough
    // that a phase boundary is never visibly late, and at the rate above a
    // quarter second of real time is half an hour of the day's.
    fastCheckMs: 250,
    // How long the release of a scrub takes to fall into its stop. Much shorter
    // than a fade, because it is finishing a movement your hand already made
    // rather than starting one — anything near fadeMs feels like the control
    // taking the last of it away from you.
    settleMs: 260,
    // Idle time before the open scrubber tidies itself away. Long enough to see
    // where you landed, short enough that the screen goes back to being sky.
    closeMs: 2600,
  },

  // `visit` used to live here — how long a gap counted as "you were here
  // recently" versus "it has been a while", for the greeting on arrival. It was
  // the app's last piece of stored state and it is gone with the storage: with
  // nothing written down, there is no way to know how long you were away, so
  // everybody gets the plain 「greet」 and the world keeps no record of you.

  dialogue: {
    charMs: 42,
    // How long a finished line stays up: a flat part plus a per-character part.
    //
    // It was one flat number for every line, which gave 「（がんばったら、なんとか
    // なるかな）」 the same few seconds as 「ふぅ…」. Across a bank running from 2
    // characters to 24, total time on screen spanned 2.8s to 3.7s — under a
    // second of spread for a twelvefold spread of reading — so the long lines,
    // the ones actually worth stopping for, were the ones that got away.
    //
    // The flat part is not reading time at all: it is time to NOTICE. A bubble
    // can open on any of the three of them, anywhere on screen, while you are
    // busy walking somewhere else, and none of the reading starts until you
    // have looked. The per-character part is the reading, at a shade over the
    // ~120ms a character that Japanese runs at — deliberately slower than the
    // typewriter, which reveals at charMs and so is always ahead of the reader.
    holdBase: 2800,
    holdPerChar: 140,
    // Quiet time between lines, measured from the end of one to the start of
    // the next — see scheduleNext, which is the thing that has to know.
    gapMin: 5000,
    gapMax: 11000,
    longIdleMs: 55000,
    focusBias: 0.72,     // chance the character you are visiting is the one who speaks
    // How far a talking character bounces. A drawn face cannot flap its mouth,
    // so this is the only thing marking out who is speaking from a distance —
    // but much past 0.05 and they look like they are jumping rather than
    // talking.
    talkBob: 0.035,
    // How high above the topmost drawn pixel the bubble's tail hangs, in world
    // units — clear of the ears rather than resting on them.
    bubbleLift: 0.28,
    // ...and a further gap in screen pixels, which does NOT shrink with
    // distance the way bubbleLift does. A constant few pixels of daylight
    // between the tail and the head, so a speaker across the planet still reads
    // as having a bubble rather than a smudge resting on their ears. Lived in
    // the stylesheet as a -0.9rem margin until the bubble had to be clamped
    // into the viewport, which meant main.js needed to know the box's real
    // screen position and could no longer have part of it hidden in CSS.
    bubbleGapPx: 14,
    // Time constants, not per-frame fractions: see camera.smoothMs for why.
    // These two reproduce the old 0.35 and 0.15 exactly at 60fps.
    talkBobMs: 39,       // how quickly the talking bounce comes and goes
    swaySettleMs: 103,   // how quickly the walking sway unwinds on stopping
  },
};

// ---------------------------------------------------------------- the homes
//
// WHICH BUILDINGS YOU CAN GO INSIDE, and what is in each one. Two of them now:
// Chiikawa's house on the equator and Hachiware's cave on the far side.
//
// It is written down here, after the object, rather than inside it, because
// every entry has to point at an interior spec that is a sibling key — and a
// literal cannot refer to itself while it is still being built. Holding the
// references rather than copying the specs is deliberate: scene.js mutates
// nothing in them, but a copy would be a second place for a doorWidth to live.
//
// `style` is the only genuinely new field, and it picks which set of painters
// the shell wears — plaster and pen for the house, stone and cracks for the
// cave. It is NOT a second name for the landmark type: two caves in different
// hillsides would be two entries of one style, which is the whole reason it is
// its own word.
//
// `owner` is who lives there, as a key into CAST. It decides where somebody
// goes when they go home — see household.js, which routes each of them to
// their own door rather than to whichever building it found first. Nobody is
// SEALED to it: any of them can wander into either place, and being in one is
// still only a question of where you are stood.
//
// Order matters in exactly one respect: the first entry is where you arrive.
// See camera.spawnBack and the doorstep in main.js.
CONFIG.homes = [
  { type: 'house', style: 'house', spec: CONFIG.interior, owner: 'chiikawa' },
  { type: 'cave', style: 'cave', spec: CONFIG.cave, owner: 'hachiware' },
];
