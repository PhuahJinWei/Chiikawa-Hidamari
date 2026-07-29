# ちいかわと ひだまり

A small planet with three characters living on it, and you live there too.
Mobile only, Japanese only. You start stood on the grass among them; they idle,
talk to you one-sidedly, and notice you when you come and see them.

Non-commercial fan work. Every drawing in it is original — no official assets
are used or redistributed.

## What it does

- **You start on the ground**, at about their height, looking out at the
  horizon. Swipe to look around, or tap a patch of ground to stroll over to it.
  To walk, put a thumb anywhere in the lower-left: a pad appears under it. Push
  it in a direction and you set off that way at once — your view stays exactly
  where you left it. Both only exist down here.
  A tap leaves a ring on the grass where you asked to go, and the walk keeps
  going while you look about — only the stick takes the wheel back off it.
- **Double-tap the ground and you hop**, or press the jump button — a little
  jump on the spot, straight up and down. It exists because hopping is how this
  cast talks with their bodies, and a visitor who could only glide about was
  mute in it. Hop near
  somebody and after a beat they hop back — two bounces, the second smaller,
  the way a small creature is pleased. Everyone near enough answers, so two
  friends bounce back at once. It works indoors too, with whoever is home;
  never through a wall.
  It used to say here that the hop "clears nothing and reaches nothing, because
  nothing here needs beating". Something does now: **walk into a stump, or a
  table, and hop, and you climb onto it.** The gesture is unchanged — same
  height, same 480ms, same arc — but it is a real jump underneath, integrating a
  vertical speed against gravity rather than reading a parabola off a clock, so
  it can end somewhere other than where it started. Walk off the edge and you
  drop. The jump is deliberately NOT tall enough to reach a waist-high table on
  its own; what gets you up is catching the lip on the way past, the way a person
  actually gets onto a kitchen counter. Making the hop bigger instead would have
  been the wrong repair — its size is tuned against the cast's own bob, and a
  jump rebuilt to clear furniture would be a different gesture in every
  conversation.
- **The bear can be shoved about.** Chiikawa's plushie is lying on the floor by
  the futon where somebody dropped it, and it is the one thing in the world your
  feet can move: walk into it and it scoots ahead of you, slows, and stops. Stand
  on it and it squirts out from under you. It fetches up against the skirting
  rather than going through the wall, and it does not bounce off it.
  It goes the way your foot is going rather than straight out from under it,
  which sounds like a detail and is the whole thing working: "away from the
  player" swings through a half turn exactly as you pass, so the hardest shove
  landed from the far side and sent the bear back where it came from — measured,
  it ended 0.016 from where it started after a walk clean through it.
  It is a scoot rather than a collision on purpose: no mass, no bounce, and well
  under walking pace, so you catch it up rather than punting it across the room.
  Nothing else indoors moves, and nothing else should — every other piece is
  somebody's arrangement, and this one is an accident already.
- **The world is solid; your friends are not.** Water, the house, every tree,
  every stump and the bench all stop you, and stop the cast too — a friend
  strolling through a trunk you just bumped into says the rule is about you
  rather than about the world. What you may still walk through is the people
  and the ground cover: straight up to somebody and straight through them,
  because they are what you came for and not obstacles to be routed around, and
  straight through the flowers, mushrooms and grass, which are things you wade
  in. Tapping a friend sets you down at a framed distance; walking is yours.
  Brush a tree and you slide along it rather than stopping dead, the same way
  you slide along a shore.
  It was not always so, and the old rule is worth knowing because half the
  code was built to apologise for it: only the water and the house were solid,
  and a tree was something you walked through while the app quietly deleted the
  trunk you were standing inside, towed your body around a canopy the camera
  ignored, and steered arrivals round obstacles the walk did not have. Three
  workarounds for one missing rule.
  **A tree stops you at its leaves, not at its bark**, which is the one number
  in it worth stating. The trunk is what you would collide with if you thought
  about it for a second; it is wrong for most of these trees, because the
  canopy's skirt hangs below eye height and your face reaches the foliage half
  a stride before your feet reach the roots. Stopping at the bark put the lens
  inside the leaves and filled the screen with flat green. The big landmark
  trees are the other way round — their canopies start above your head — so
  those stop you at the roots, with the whole crown to look up into. Both fall
  out of one rule that asks the built profile how far away an eye has to stand.
- **You arrive on the doorstep.** The house is the first thing you see: you
  start seven units out from its own front door, looking straight at it, with
  the open arch plainly a way in and your three friends a short walk off to
  either side. It was not always — the house used to stand fifteen units away
  on the far side of the planet, below the horizon and invisible, while you
  spawned among the cast with a lake for the nearest landmark. The building the
  whole app is built around is now the middle of the map, and everything else
  is placed around it.
  Where you arrive is **derived, not written down**: the arrival asks the house
  where its front door faces and stands you out along that bearing, so moving
  or turning the house moves the arrival with it. Which way the door faces is
  itself a decision now (`interior.doorFacing`) rather than a by-product of the
  maths that stands the building on its hill.
- **Somewhere to walk to.** Five landmarks — the house, the bench and three big
  trees — with worn tracks between them, so there is usually something in sight
  to steer by and a line on the ground when there is not.
- **And a face at the edge of the screen** for anyone who is off it, with an
  arrow pointing their way. The house has one too. On the grass only; up in the
  sky you can see the whole planet anyway.
- **They roam the whole planet.** Each trip is a short stroll in some
  direction from wherever they are, so over a few minutes they end up anywhere
  — measured at 29–31 world units of walking each per minute, against a
  circumference of 50. They hop as they walk, and stop when you come to see
  them, so whoever you walked over to stays put instead of strolling off.
  They start near you, and disperse from there. A trip that would take them
  through a lake stops at the near shore instead.
- **Zoom out to find them.** Once they've scattered, the sky view is the map:
  spot someone on the planet and tap to go to them.
- **Pinch in to lift off**, the way a map zooms out. Altitude drives the whole
  camera: as you rise the view swings back and tilts down until it becomes the
  whole planet seen from outside, and spreading your fingers again sets you
  down. The *movement* through that is continuous, but the *controls* are not —
  you are either landed (first person: walk, turn your head) or airborne (globe
  view: swipe spins the planet). There is no in-between altitude to hover at.
  Leaving the ground takes about a quarter of the gap between your fingers,
  banked up over the whole gesture rather than judged one step at a time, so a
  two-finger touch that is not quite steady does not launch you.
- **Two action buttons in the right thumb's arc**, on the ground only —
  translucent circles with a glyph, the way game controls are drawn, floating
  over the world rather than parked in the pill stack: they are verbs under a
  thumb, not readings of the world. The big one jumps. The small one **arms a
  run**: press it and your movement is a sprint — 1.6 times walking pace,
  eased in and out over the same 260ms the walk uses, with the lens opening
  further at speed so it reads as running rather than as the same walk with
  the counter turned up — and it **stands down by itself when you stop
  moving**, so there is no run mode left switched on to rediscover three
  strolls later. Arm it stood still and it waits for the run it is about;
  press it again to change your mind. The button's light is painted from the
  rig's own state every frame, because the rig can stand the sprint down
  without being asked and a lit button after the run ended would be lying.
  Both fade out when you leave the ground, which also stands down an armed
  run — the disarm-on-stop only watches the walk, and a run armed on the
  grass must not survive a flight and fire on landing.
- **Two buttons**, bottom-right. The lower pill jumps straight between standing
  on the ground (`じめんへ`) and seeing the whole planet (`そらへ`). Its label
  shows where a press will take you, and flips the moment you press rather than
  waiting out the climb. Pinching remains the fine control in between.
- **The clock**, the pill above it: it reads as the hour you are actually in
  (`あさ` `ひる` `ゆうがた` `よる`), and a dot beside the label means it is still
  following your real clock. Press it and it opens into the day as a strip you
  can drag along — the sun rides the track, and the sky, the light and the cast
  follow your thumb as you go, becoming the moon as you reach `よる`. Tap a spot
  instead of dragging and it fades there. `じどう` hands it back to the real
  clock. It tidies itself away a few seconds after you stop. Whatever you pick
  lasts as long as the tab does — every visit opens on `じどう`, because the
  hour here is weather rather than a setting, and arriving should be arriving
  now.
- **A picked hour still runs.** Setting the time by hand does not stop the day
  there: it drops you at the start of that hour and the world goes on turning,
  a full twenty-four in about twelve minutes. Choose `よる` and it is night, and
  stays night for a few minutes, but stay out and you will watch it get light —
  the sky, the lamps and the lines they reach for all following along. The dot
  means the clock is *yours*, not that time has stopped.
- **Tap someone to go to them** — you land a few paces in front, back on the
  ground, facing them. Works from up in the sky too.
- **The inside of the house is part of the house.** Not another scene, not a
  cut, not a loading trick: the doorway is a genuine hole in the wall, and you
  walk through it — on the same legs, in the same world, with the grass still
  visible behind you when you turn around. Stand on the doorstep and the rug,
  the furniture and whoever is home are simply THERE through the arch, because
  they are four metres away. Tapping the house still works from the grass and
  the sky alike, and now means "take me to the door": you are set down on the
  doorstep facing in, and the last two strides are yours.
  Inside is the dome the house is drawn as, seen from within — the wall you
  walked around, from its other side — at the building's own honest size: a
  hut, three strides across, with a ceiling you can look up at. The old room
  was secretly two and a half times the building's footprint, a cheat every
  game plays and this one no longer needs. Walking out is walking out.
- **You can fly out of your own house.** Pinch out — or press `そらへ` — while
  stood on the rug and you lift straight up, and **the outside of the building
  comes off as you pass it**: the skin, its ink line and the outward faces of
  the openings, lifting at about 3.0 up and settling back at about 5.8. What
  deliberately stays is the room's own inner wall, and that distinction is the
  whole effect — take the lot and the house does not open, it simply is not
  there, leaving a rug and a table sitting out on the grass. Keeping the inner
  wall leaves you looking down into a bowl with a room in it, which is a doll's
  house. Keep climbing and the camera swings off the building on its way to the
  far view, where it is a solid dome again; come back down and the lid settles
  back on around you.
  It only lifts while you are genuinely airborne over your own footprint. The
  dome curls to nothing at its rim, so the roof over the doorway is only 1.64 —
  below a 1.7 eye — and without that guard the house took its own skin off
  while you stood on its threshold.
  Both halves of that had to be built before the pinch could be allowed at all.
  The **floor of flight** — the rule that there is nowhere to hover between the
  ground and proper flight — now clears whatever roof is over your head instead
  of being a fixed 2.6, because 2.6 is *below* the dome's 3.2 apex and a lift
  from the middle of the room used to stop inside the ceiling. And the shell is
  lifted rather than flown through, because a near plane passing through a wall
  saws a hole in it, which reads as the building tearing rather than as you
  leaving it.
- **They go home too, and rarely.** Every several minutes one of them stops
  wandering, walks to the house, and goes in — through the door, in view the
  whole way, no fade and no trick — sits on a cushion for a minute or so, then
  walks back out. Never more than one at a time, so the planet is never empty,
  and never while you are stood with them. Walk up mid-journey and they stop
  for you like always; stand there long enough and they think better of the
  whole trip.
  The point of it is the windows. They are dim when the house is empty and come
  up when somebody is in, so from right across the planet you can tell whether
  anyone is home — and if you peer through the open door, they are there.
- **Nothing on the building is painted on any more.** The door and the windows
  are all genuine holes cut through every layer of the shell, with their ink
  drawn round them on both faces. The two portals this app used to render —
  the planet into the room's window, the room into the doorway — are gone, and
  so is the last painted pretence: the pale glazed pane that used to stand
  where each window is. Look at a window from the grass and you are looking
  into the room; look at one from the rug and you are looking at the real sky.
  The lit-window signal survives all of it and is now told rather than painted
  — an occupied room is warm, an empty one dims to a gloom, and you read that
  straight through the opening. Measured at night: an occupied pane renders
  `#efd8ba` against a wall of `#99a6c5`, and an empty one `#bdab94`.
  A window is still not a way in. The wall's one gap is the door.
- **The hour reaches indoors, differently.** Everything under the roof wears
  its own tint table (`tintIn` in `daylight.js`), blended on the same axis the
  sky uses — drag the clock while stood inside and the room moves with your
  thumb. Night in there is warm rather than blue, because the lamps are on:
  that is the same lit house you can see glowing from across the planet, told
  from the inside. And when nobody is home after dark the interior dims to a
  porch-light gloom, so an empty house does not burn a hearth for no one — you
  see it through the open door exactly as the windows tell it.
- **Three voices** — Chiikawa speaks in fragments and trails off, Hachiware is
  fluent and encouraging, Usagi barely uses words at all. Whoever you're
  stood with does most of the talking.
- **It knows what time it is.** The sky, the light and the tint on everything
  follow your real clock — morning, noon, dusk, and a night of faintly twinkling
  stars and a moon.
  Changing the hour cross-fades over about a second and a half rather than
  cutting: two sky domes, one fading over the other, with the lights, the tint
  and the sun's position and colour interpolated alongside. The sun becomes the
  moon by the two of them trading places on a second card. Because that fade is
  a continuous parameter rather than a switch, the scrubber can hold it at any
  point — the hour between noon and dusk is a real place you can stop at.
- **They notice things.** Walk up to someone and they greet you. Two of them
  wandering into each other stop and exchange a word. Walk up to a lake and
  whoever can see you will warn you off it.
- **Nobody sleeps.** Night is when they are most awake: they keep wandering,
  and their biggest bank of lines by far is the one about what is overhead.
  Chiikawa is quietly floored by it, Hachiware has a fact to share about it,
  Usagi mostly points.
- **The house is solid — except where the door is.** The wall is an annulus
  now, not a disc: solid from outside, solid from inside, with one bearing
  wedge where it simply is not there (see the banded building in `sphere.js`).
  Brush past the wall and you slide along it the way you slide along a shore,
  from either face; walk at the open doorway and you walk through it, because
  nothing is checking, triggering or choreographing — there is no wall in the
  way. The furniture is solid too now, and it took a second thing to make that
  bearable. The old note here was that in a room three strides across, a table
  you could not step past would read as a bug rather than as furniture — and it
  was right, as far as it went. What changes the answer is having somewhere for
  the refusal to send you: **you can get on top of it.** Bump the table and hop,
  and you are standing on the table. A piece you can climb is furniture; a piece
  that only ever says no is a bollard.
- **Nothing goes in the water.** You cannot walk into a lake, nor can they, and
  nothing grows in one — no grass, no flowers, no trees. Walking into
  a shore slides you along it rather than stopping you dead, and tapping the
  middle of a lake walks you to its edge. Nothing grows through a building
  either: the house and the bench each keep their own footprint clear.
- **It remembers nothing.** No `localStorage`, no cookies, no account, no
  record that you were ever here. Close the tab and the planet keeps no trace
  of the visit — including the hour you set, which is why every arrival opens
  on `じどう`.
- **Paper cutout in a 3D world** — the planet, the house, the trees, the stumps
  and the grass are the real geometry out there. The rest of what stands on it
  is a flat card leaned to match the curve underneath and squared to the way you
  are *looking* rather than to where you are stood — so a bush holds still as you
  walk past it, and only re-aims while your gaze is already sweeping. The flowers
  and mushrooms are the other exception: two quads crossed in an X, which never
  needs turning at all.
- **The grass moves.** It is blades rather than drawn tufts, and a vertex shader
  bends them along a wind that sweeps the planet in slow gusts — the only thing
  out there that moves on its own besides the cast and the hour. On a place whose
  point is standing about in a sunny spot, it turned out to be worth more than
  anything else the conversion bought.
- **The trees are built rather than drawn**, and they are the newest thing here
  — `CONFIG.foliage3d`, which you can turn off to put the cards back. The world
  used to speak three languages at once: the planet and the house were real, the
  trees were cards that quietly re-aimed, and the grass was crossed quads. That
  seam is what read as odd. Now there is one rule — THE WORLD IS REAL AND THE
  FRIENDS ARE DRAWINGS — and the cast staying paper is the point of it rather
  than a compromise.
  They are built to the drawings and not to a fresh idea of a tree: an egg of a
  canopy with a scalloped edge, blossom scattered over it, and a trunk that
  flares into lobed roots, all measured off `tree-1.png` and its siblings. Stood
  side by side, a card and a shell are the same tree twice and the only
  difference is that one of them turns when you walk.
  Where it plainly pays is from the sky. A card faces you from everywhere, so
  from orbit the trees in the middle of the disc used to stand upright pointing
  at the lens like stickers on a ball; built, they are seen from above, canopy
  and roots, and the planet reads as a thing rather than as a picture of one.
  The rule holds indoors, which is now just a place the planet has: the dome
  and the floor are the same real surfaces you stand on and inside, the drawn
  openings are patches cut from the dome rather than hung flat against it —
  a flat card tall enough to be a door cannot lie on a curve this tight — and
  the furniture is the one exception, real geometry with an inverted-hull ink
  line, because a table in a room three strides across is the one thing here
  you genuinely orbit.

## Running it locally

No build step, no `npm install`. It is plain ES modules — but it must be served
over HTTP, not opened as a `file://` path, or the module imports will be blocked.

```bash
python serve.py
```

Then open `http://localhost:8099` and use your browser's device toolbar to
emulate a phone in portrait. Set `PORT` to use a different port.

`serve.py` is threaded on purpose. A single-threaded static server deadlocks
serving an ES module graph — the browser fetches the modules over parallel
keep-alive connections, and the page hangs at readyState "interactive" with
nothing loaded and no console error. It also sends `no-store`, so a reload
always picks up the file you just edited.

The service worker deliberately does **not** register on `localhost`, because it
serves cache-first and would keep handing back the previous version of
everything.

On localhost only, `window.hidamari` exposes
`{ bots, rig, globe, household, screenOf, house, goIn, goOut, step }`
for poking at the scene from the console. It is never defined on the deployed
site.

`screenOf('usagi')` gives the pixel to aim a test tap at. `goIn()` and `goOut()`
are debug teleports — mid-room facing the door, and on the doorstep facing in —
and the only teleports left in the app; the one rig walks everywhere else,
indoors included.

`step(times, ms)` drives the frame loop by hand, and it is the one you will
want if anything ever looks hung. **A tab that is not being composited never
gets a `requestAnimationFrame`** — background it, drag it off-screen, or drive it
from an automated browser session, and everything here stops dead in a way that
looks exactly like a crash. `hidamari.step(60)` advances a second of it.

Do not call `frame()` yourself, though — go through `step`. The loop arms its
own next callback on the way out, so a bare call to it FORKS the loop rather
than advancing it: the manual call queues a callback, that callback queues
another, and from then on the app runs twice over. A few hundred of them is a
few hundred concurrent render loops and a page that never recovers, which
presents as the whole thing gradually grinding to a halt for no visible reason.
`step` cancels the pending callback before each of its own calls and leaves
exactly one armed at the end.

## Deploying to GitHub Pages

Push the folder to a repo, then in **Settings → Pages** choose "Deploy from a
branch" and pick your branch with the `/ (root)` folder. That's the whole
deployment — no Actions workflow, no base path to configure, because every path
in the project is relative.

Pages serves over HTTPS, which the device-orientation API requires.

**After each deploy, bump `CACHE` in `sw.js`** (`hidamari-v5` → `-v6` …).
Returning visitors keep the old cached build until that string changes.

## Adding or changing a character

`js/cast.js` describes the cast as data — how big, where they live, and which
expression sheets exist. Adding a fourth is one entry there, one line bank in
`js/lines.js`, and a drawing; no other file changes.

`home` is a spot on the planet in radians: `lat` 0 is the equator, positive is
north, and `lon` 0 faces where the camera starts. The three are clustered
within about a radian of longitude so you can see them together — spread them
out if you would rather orbiting be a journey between friends.

`scale` is a *width*, as a fraction of `CONFIG.bodyPlane`. Height follows the
drawing's own proportions, so Usagi's ears make Usagi taller without a number
here saying so — and redrawing someone at four times the resolution makes them
sharper rather than bigger.

## Drawing them

Sheets live in `asset/images/characters/` as `<key>-<suffix>.png`. `idle` is the
resting face and the only one required: every expression without a sheet of its
own falls back to it, so the cast runs perfectly well half-drawn. Draw
`chiikawa-happy.png`, add `'happy'` to that character's `sheets` list in
`cast.js`, add the path to `sw.js`, and the dialogue starts using it.

What `lines.js` actually asks for, by how often — 147 lines across the three
banks, counted unweighted:

| expression | share of all lines | drawn for |
| --- | --- | --- |
| `happy` | 53% | all three |
| `normal` | 17% | all three — this is the `idle` sheet |
| `surprise` | 12% | Hachiware, Usagi |
| `sleepy` | 10% | nobody yet |
| `worried` | 6% | nobody yet |
| `delight` | 2% | Chiikawa |

`happy` and `normal` between them cover seven lines in ten, which is why they
were drawn first. What is left worth drawing is `sleepy` and `worried` — sixteen
per cent of everything said, arriving as the resting face — and `surprise` for
Chiikawa, the one of the three without it.

`delight` is the odd one out, deliberately. It is happiness with the volume up,
and only Chiikawa's `greet` bucket reaches it, so it is the face for *arriving*
and nothing else wears it out. Two per cent is not an oversight; it is what
keeps walking up to Chiikawa feeling like an occasion. Mind where the fallback
lands if you spend it more widely: a character with no `delight` sheet drops to
the RESTING face rather than to `happy`, so a delight line given to somebody
undrawn reads flatter than the happy line it replaced. Draw the sheet in the
same breath as writing the line.

`pain` and `teary` were once listed here and are gone from `EXPRESSIONS`
altogether: no line reached either, so they were a standing invitation to draw a
sheet that could never appear.

A `blink` sheet is picked up if you draw one, and only ever shows over the
resting face — every other expression has already decided what the eyes are
doing. Without it they simply do not blink.

Four things to respect when you draw a sheet:

1. **Keep every sheet for one character the same canvas size.** They share a
   single plane, so an odd one out arrives stretched. The loader says so in the
   console when it spots this.
2. **Crop them the same way.** Where the feet land and where the speech bubble
   sits are measured from the opaque pixels, so a differently cropped sheet
   stands at a different height.
3. **Draw big.** At the closest you ever stand to someone they cover roughly
   670 device pixels. The sheets here are 1000px wide, so they are sampled down
   rather than magnified, which is where their crispness comes from. Match that
   width when you add one.
4. Transparent padding is added in code, so the art itself can stay cropped
   tight.

## Sitting down

The cushions are the guests' now. Whoever comes home takes one if it is free,
which is most of what makes the room read as lived-in — three characters stood
to attention on a floor is a waiting room; one of them sat down is a home. The
player does not sit in this version of the house: the tap-to-sit machinery
belonged to the old room's own camera rig, and that rig went when the room
stopped being a separate world. Bringing sitting to the planet rig is its own
job for another day; the seats, the bookkeeping and the posture drawing all
survive, waiting for it.

**Sitting is a posture, not an expression**, and that distinction decides how it
is drawn. An expression is what the face is doing and changes with every line; a
posture is what the body is doing and lasts as long as they are on the seat.
Folding it into `EXPRESSIONS` would have somebody stand straight up the moment
they said something happy.

One drawing covers the whole posture: `<key>-sit.png`, with `'sit'` added to that
character's `sheets` in `cast.js`. That is a deliberate trade — one sheet per
character instead of one per expression per character — and the price is that a
seated character keeps one face. **Until that drawing exists they sit in their
standing sheet, sunk by `CONFIG.interior.sitSink`**, which puts the seat line
where their legs would fold. Draw the sheet, add the word, and nothing else
changes anywhere.

A seat is claimed the moment somebody sets off for it and released the moment
they stand, so nobody crosses the planet for a cushion that was taken while
they walked.

## Who is home

`js/household.js`, and the numbers are `CONFIG.household`. **`gapMin` is the one
to turn** — everything else is shape.

It is meant to be rare, and that is a design decision rather than a performance
one. Seen often it becomes a commute: three characters shuttling in and out on a
timer, which is the opposite of what this place is for. Seen rarely it is a small
event — somebody is missing, and the windows are lit. At the shipped numbers each
of them thinks about home roughly every eight minutes and stays about a minute.

A visit is a four-state machine per character — `away`, `going`, `home`,
`leaving` — and nothing about it is faked any more: there is no fade at the
threshold, because there is no threshold to hide. They walk to the doorstep,
through the gap in the wall, and across the rug to a cushion, in view the whole
way — the same walk you make. The walk is the character's own: an errand is
just a destination they were handed instead of one they picked, so being
stopped for you, pausing to talk and steering round a lake all keep working
without the household knowing those things exist. What the household adds is
the ROUTE — doorstep, then just inside the door, then the seat — because a
great circle from the far side of the planet does not pass through a 1.9-unit
gap by luck.

Two rules exist to stop it wedging, both learned the hard way. An errand is never
handed out while you are stood inside `wander.closeArc`, because standing there
freezes them where they are — so an errand given at that range is one they can
never take a step of. And `headingMax` gives up on a walk that is taking
implausibly long, because `atOnce` counts anyone heading home, so a character
frozen by you would otherwise hold the house shut behind them.

## Changing the room

There is no `room.js` and no `door.js` any more — that is the headline of the
biggest rework this project has had. The interior is built by `scene.js` inside
the same dome you walk around on the grass, at the dome's honest size, and the
way in is a genuine gap in the wall's collision (see the banded building in
`sphere.js`) under a genuine hole punched through the shell's textures.
Everything you would want to move is in `CONFIG.interior`.

**Openings are cut, not drawn.** One `punch()` helper erases a shape from a
dome-wrapped canvas, and it is run over all three layers — the outer skin, the
inverted-hull ink, and the interior wall — so a hole is a hole from either
side and to the depth buffer as well (`alphaTest` discards the pixels, and
their depth with them). The frames are drawn patches laid over the cut edge on
both faces, which is what makes a hole read as a doorway or a window and also
hides the texture's own jaggies at the rim. Two traps are written up in the
code and worth knowing before you add a third opening: `destination-out` erases
by the *source's* alpha, so the punch must set an opaque `fillStyle` or it
inherits whatever brush the painter left behind (this silently cut the first
door at 13%); and a transparent material writes depth for every fragment it
rasterises, so a frame patch without `alphaTest` fills its own opening with
invisible depth and hides whatever stands behind it.

`walk` is how far out from the middle you may stand, and it is not the wall
(3.2) and must not be raised to meet it: the dome curls in overhead and the
camera's near plane is 0.3, so the line holds the EYE clear of the shell, not
the feet. At 2.25, an eye 1.7 up keeps 0.35 of clearance in every direction.
Furniture is placed by a bearing round the house (the door is bearing 0) and a
distance out in world units; nothing indoors is solid, for the same stated
reason a bench is not — in a room three strides across, a table you could not
step past would be friction with nothing to buy.

What the merge deleted is worth listing, because all of it was machinery for
pretending two worlds were one: the second scene, the second camera rig, the
veil, the choreographed passage, the render-to-texture window portal and the
render-to-texture door glimpse. What you see through the door now is the room,
and what you see through it from inside is the planet, because they are four
metres apart in the same world.

**The room is deliberately bigger than the building** — 10.4 units of floor
inside a house 4.1 across the grass. Every game that walks you through a door
does this, because a room you can turn around in will not fit inside a landmark
drawn small enough to be a landmark. The threshold is where it is hidden: by the
time the room is in front of you the doorway has filled the screen, so the two
sizes are never on screen together to be compared. Shortening `reach` is the one
change that can expose it.

`doorAt` and `windowsAt` are bearings in radians, and everything else is placed
relative to them, so turning the door turns the room's furniture with it.

Wall and floor are painted, not drawn: `paintRoomWall` and `paintRoomFloor` in
`art.js`, using `PAL.roomWall` and `PAL.roomFloor`. Two things to know before
touching them. The wall texture is wrapped around the dome, so a texel row is a
ring and rings shrink to nothing at the apex — marks are pre-stretched by
`1/sin(theta)` to come out square, and the top of the texture is left plain
because that correction runs away. And the marks are sized in *texels*, so
`MARK_SCALE` follows the texture's width; sharpening the wall without it would
quietly shrink every mark on it.

The openings are cut from the dome as sphere patches rather than hung as flat
cards. This is not fussiness — see the note at `_opening`.

## The rest of the art

`js/art.js` is still the only file that knows what anything looks like, but it
now does two jobs. Anything drawn — the characters, the ground, the three trees,
the two bushes, the stump, the five grasses, the five flowers, the six flat
flower clusters, the two mushrooms, the lake, the house, the sun and moon — is
loaded by `js/assets.js` and merely framed here. Everything not yet drawn is
painted in code as it always was: the bench, the sky, shadows, the soft stamp
the lamplight is made of, the ring that marks a tapped spot, and the tracks worn
between the landmarks. Nothing at ground level is painted any more — the last
one was the rock, and there are no rocks on this planet.

Replacing one of those is a local change. Add the file to `assets.js`, then have
its `paint*` function hand back `paintSheet(IMG.whatever)` instead of drawing.
Sprite proportions come from the canvas, so nothing needs an aspect ratio
updated by hand — only its height in `SPRITE_SIZE`.

**Crop scenery flush to the bottom.** Padding is added in code, but not
underneath, because a prop's plane starts at the ground and a transparent strip
below the art lifts the whole thing off the grass rather than disappearing. Six
pixels under a bush is 35px of daylight beneath it at arm's length. Character
sheets are exempt — their feet are measured from the pixels.

**Ground cover stands up**, rather than lying flat as a decal — each flower and
mushroom is two quads crossed in an X, cut out with `alphaTest` at 0.5.

Grass used to be drawn this way too, from `grass-1.png` upward. It is built
blades now and no longer has a drawing at all — see "The grass is blades" below.
The rules in this section are what the remaining drawn cover still follows.

**Flowers (`flower-*`) and mushrooms (`mushroom-*`) follow one scheme** —
numbered variants, a count in `assets.js`, one merged mesh per drawing, totals
set beside `BLADE_TUFTS` in `scene.js`. Each variant gets its own merged mesh
rather than sharing an atlas: an atlas would fold them into one draw call, but
mipmapping bleeds neighbouring cells together and `alphaTest` turns that bleed
into visible confetti, so the extra draw calls are much the cheaper trade. Every
quad is also mirrored on a coin flip, which costs one swapped `u` coordinate and
makes each drawing read as two. Flowers stand a touch taller than grass (0.34 —
they are stems); mushrooms squat at grass height and a fifth of its count. Both
are drawn flush to their bottom edge like every prop. The `flat-flower-*`
clusters were a third kind here and are retired — see further down.

## Biomes

`CONFIG.biomes`, read through `biomesAt` in `sphere.js`. **There are exactly two,
and both are written down:**

- **meadow** — the base. Bright green ground (`#B4DC8E`), green-brown ticks,
  white and yellow blossom specks, full `cover`, and it grows everything: grass,
  flowers, mushrooms, trees, bushes, stumps. About two thirds of the surface.
- **sand** — the pale cream ground (`#F4EBD1`) both of them live on. Brown hatch
  marks instead of green ticks, green blots instead of blossom, `cover` 0.045,
  and it grows **grass only**. Two patches, one at each home.

A biome is a *kind of ground*; `patches` is the list of where it turns up. That
is the shape the table changed to and it is the point of the rework: sand can be
at two homes on opposite sides of the world without being two biomes, and the
meadow can be an ordinary entry by having no patches at all. `biomesAt` gives the
base whatever weight the patches have not claimed, so the mix always sums to
exactly 1 and no reader has to keep its own copy of "what the planet is when
nothing else is happening".

Within one biome the patches take a **max**, not a sum — two overlapping
clearings of the same sand are still sand. Across biomes the weights normalise
down if they would total more than 1. `patchWeight` is a smoothstep over the arc
past `r`, because a linear ramp has a corner at each end and a corner in a border
is a rim you can see from the air.

It returns the mix sorted by weight into a caller-supplied array, because it is
called per 16-pixel cell while painting a 3072×1536 canvas and per tuft while
building the grass; allocating there is the difference between a paint that takes
160ms and one you notice.

**Four readers, one table.** The ground texture in `art.js`; the blade greens and
the ground-cover density in `scene.js`; and the scenery spiral, which is the new
one — `growWeight` is what empties both clearings of trees, bushes and stumps.

**`cover` is a multiplier on a rejection test, not a count.** The scatter asks
`plantable(margin, kind)`, which fails a candidate if it is already taken, *or*
if `rand() > growWeight(dir, kind)`, *or* if `rand() > coverAt(dir)`. Changing
either number does not change how many things exist, only where they end up: a
tuft turned away on the sand is retried elsewhere, and the total stays the number
in `scene.js`.

**`cover` and the painted marks are deliberately separate numbers.** `ticks`,
`blooms` and `bloomScale` say how heavily the *paint* marks a biome; `cover` says
how much *grows* there. One number cannot do both jobs — the sand grows almost
nothing and is still the more heavily hatched of the two, and asking `cover` to
thin its hatching too left it a blank cream fill, which is the one thing the
reference frames never show.

**Soft edges everywhere except the spiral.** Ground cover rolls against
`growWeight`, so flowers and mushrooms thin out gradually across a border rather
than stopping along a circle; nothing can appear in the solid middle of a
clearing, where the weight is exactly 0. The scenery spiral has no random stream
and must stay fixed — re-dealing it moves every prop on the planet — so it takes
the half-way line instead. At three dozen props spread over a world there is no
density gradient to see anyway.

Counts moved with the biomes rather than staying put, because confining things to
two thirds of the world would otherwise have made the meadow *thinner* than the
uniform planet it replaced: grass 1000 → 1400, flowers 75 → 90, and the scenery
spiral 58 → 100 spots, which after the cull is 45 props standing against 46
before — the same planet's worth, all of it now where it is wanted.

## The range on the horizon

A band of mountains and treeline painted into the sky — `paintHorizon` in
`art.js`, hung on `skyRig` in `scene.js` so it is re-aimed at the camera's zenith
every frame and is therefore infinitely far off. Not props, not terrain: a
4096×512 texture on a 26°-tall strip of a 170-unit sphere, `BackSide`.

**Where the band sits is worked out rather than nudged.** Stood at eye height on
a planet this small the limb is 34.4° below level, which on a dome of that
radius seen from a camera 9.7 out from the middle lands at about 122° of polar
angle. So the strip runs 104° to 130°: hills above the limb, everything past it
buried behind the planet by the depth test, the way a real range has its feet cut
off by the near hillside. `wrapS` is `RepeatWrapping` so the filter can sample
across the seam — the shapes are periodic by construction, but canvas has no
wraparound when it antialiases and the edge columns end up a pixel out of step.

**It fades out as you climb**, because from orbit a ring of mountains standing
off the planet is exactly what it is. The fade measures altitude from
`CONFIG.camera.eyeHeight`, not from the ground — measured from the ground it was
two thirds faded while you were merely standing.

**It is the one outdoor surface not in `tintables`.** The hour's tint is a
multiply, which is right for something you could walk up and touch. Distance
does not darken a hill, it *replaces* it: the further off, the more of what you
see is air rather than thing. So the band takes the tint and is then washed
toward `skyLow` — the colour at the bottom of the sky, which is the sky the hills
actually stand in front of — by `haze` in `daylight.js`. Tinted like the grass it
was right at noon and wrong everywhere else, worst at night, where a lavender
range and a bright green treeline stood out crisply against a dark blue sky and
read as a sticker on the window. It also gets sunset colour for free: hazing
toward an orange horizon is what turns a grey range pink, with no second palette.

`treeBase` sits at 0.64, *above* the limb at 0.69, and the haze gradient stops at
0.62. Both numbers are the same bug found twice: anything painted below the limb
is never seen, and a pale gradient running down past the treeline showed as a
bright strip under the trees where it met the real ground.

## Trees and stumps that are built

`js/foliage.js`, behind `CONFIG.foliage3d`. The drawings are still loaded and
each card is still made — it is merely retired, exactly as the house's is — so
turning the flag off puts the old props back and nothing else in the app has to
know. Each entry in the map carries its own builder, so adding a kind is a line
there rather than a branch.

**The stump** is a squat truncated cone with a scalloped skirt and a flat cut
face, its top four fifths the width of its foot, all measured off the turnaround
sheet and `stump.png`, which agree. Unlike the bush it is sized from `h` rather
than from the drawing's alpha bounds, and for a specific reason: `stump.png`
carries little tick marks of grass out to either side, so its bounds are some
fifteen per cent wider than the stump is.

It is built SQUATTER than the sheet's two and a half to one — nearer two and
three quarters — and that is the same correction the canopy's width needed, for
the same reason. A card is flat, so its drawn ratio is what you see. Standing
beside a solid one you see its cut face as well as its side, and that ellipse
adds to the apparent height without adding anything to the width; built at the
drawn ratio it arrived looking like a drum.

Two things about it are worth knowing.

**One texture covers both its surfaces**, split at `STUMP_SPLIT`. Below the split
`v` runs up the side; above it `v` runs in from the rim of the cut face toward
its middle — so the same coordinate means height on the bark and RADIUS on the
face. That is what makes a growth ring a straight line in `art.js` and a circle
on the stump, with none of the pinching a wrapped texture usually suffers at a
pole: concentric is the one pattern an equirectangular cap is good at. The face
gets nearly half the sheet for a fifth of the surface, because it is the part you
look straight down on.

**The line where the face meets the bark is painted, not hulled.** An inverted
hull only ever draws a silhouette, and seen from above that rim is not the
silhouette of anything — so the part of that line you actually see has to be in
the texture. At the sides the painted line and the hull's meet and read as one.

**The growth rings have to be bolder than they look right at.** They are the one
thing on a stump you can see ONLY from above, so a value that seems about right
while you are choosing it in a colour picker disappears at the angle it exists
for. The first pass had them nine per cent under the face at half opacity, which
comes to a five per cent difference on the rendered pixel — a blank disc. They
are now a fifth under, at four-fifths opacity, four texels wide, which is still a
soft pencil line next to the stump's own outline and is actually there.

Its scallops are deep — nearly half the flare — where the bush's could not be,
and the difference is where they sit. They are weighted to the bottom third,
which is already the silhouette, so each one is an edge rather than a lump with
its own small outline. That is the same insight the bush note below sets out,
used the other way round.

The file is named for foliage rather than for trees because **a bush was built
here too, and reverted on the look**. It was the canopy's own shape without the
tree under it: a flatter ball sunk into the hill so only its dome showed, sized
off `bush-1.png`'s alpha bounds, wearing the same blossom and its own greyer ink.
It worked and it is gone; bushes are cards again. One thing learned in the doing
is kept in the code, because it will come up again for anything low and domed —
the stump, or a rock:

**A drawn scallop lives on the outline and nowhere else.** The inside of a drawn
bush is flat green. Give a ball that same wobble everywhere and every bump steep
enough to notice shows its own small silhouette wherever its flank turns away
from you — which on a knee-high dome you are looking down at is most of the face,
so it arrives criss-crossed with ink. Shallow enough to stop that, and there is
no scallop left to see. Every amplitude between those was one or the other: a
smooth green boulder, or crumpled paper.

The way out, if it is ever wanted, is that a low dome's outline is always its
RIM. It is sunk to its own equator and you stand over it, so the silhouette is
the band round its middle and the crown is what you look straight down on. Fade
the scallop band out toward the poles by a power of `sin(theta)` and the edge
gets its nibble while the face stays flat, with neither traded against the other.
A canopy wants no such bias, since you see a tree's ball from the side and every
part of it takes a turn at being the outline.

What was still short at the end was fineness. The drawn rim carries about thirty
scallops, each a twenty-fifth of the bush wide; as geometry that wants a
wavelength near a sixtieth of the ball, some 360 columns and 64k vertices a bush,
sixteen bushes over. A dozen broader bumps was what the budget allowed, and a
dozen broader bumps is not that drawing.

The ink is the same inverted hull the furniture and the house wear: a second
copy of each shape, fractionally fatter, faces turned inside out, so it survives
only where it pokes past the real one. Two hulls and not one, because the
drawings put a line round the canopy and another round the trunk — the futon's
rule, ONE MESH PER THING YOU WOULD DRAW A LINE AROUND. It is why the canopy is a
single closed lumpy surface rather than a cluster of overlapping balls: a cluster
is a bag of separate hulls and every seam between them comes out inked.

Four things are worth knowing before you touch it.

**The blossom is drawn art**, `flower-texture-1.png` upward — the standing
flowers' own shapes without their stalks, on their own files, counted by
`FLOWER_TEXTURE_VARIANTS` in `assets.js`. Draw another, bump the count, add the
path to `sw.js`, and it starts appearing on the trees; nothing else counts them.

They are drawn stalkless rather than cut stalkless, and that is worth knowing
before anyone tries to save the four files. Taking `flower-1.png` and trimming
the stem in code was the first version and every rule for finding the cut left a
nub on the chin of every flower on the canopy — because a stalk is *joined* to
its blossom in the drawing, and the outline comes to a point where they meet, so
there is no row of pixels where one stops and the other starts. What the loader
does now is trim the transparent margin and nothing else, which is not a crop of
anything drawn: it is what lets one number mean the width of the flower rather
than the width of whatever canvas it was drawn on, the same rule the sun and
moon are sized by.

They are drawn bigger on a canopy than `tree-1.png` paints its own blossom —
about a ninth of the tree's width against a twelfth. That drawing is a simple
five-point rosette that survives being small; these are five hundred pixels of
irregular lobe under a heavy line, and at a twelfth they shrink into a coloured
smudge with the notches closed and the line gone. The shape is the whole point of
using them, so it has to be given enough texels to survive.

**It is unlit, like everything else outdoors, and the roundness is painted.**
The sun here is a fixed direction rather than a thing that goes round, so half
the planet is permanently turned away from it and a lit tree standing on the far
side would render in shadow all day. That is the trap the house shell documents
and dodges the same way. What the geometry buys is not shading, it is the
silhouette — which changes as you walk past, and which a card cannot do.

**The lumps are a sum of plane waves, not a scatter of blisters.** Two bands:
slow swells that stop the canopy being an ellipse, and the drawings' own
scalloped edge. Placing bumps individually does not scale — the drawings scallop
at about a fifteenth of the canopy's width, which needs some six hundred of them
— where a wave costs one dot product and one sine whatever its frequency.
`RINGS` and `COLS` are downstream of `SCALLOP.freq` and not free: raise the
frequency without the resolution and the crests come out faceted.

**The ink hull is pushed out RADIALLY on the canopy and along normals on the
trunk**, and that split is load-bearing. Offsetting along normals only stays a
surface while the offset is under the local radius of curvature; inside a
scallop's valley the sheets run through each other and the shell turns inside
out over a small patch. Facing you that is hidden by the fill, but near the
silhouette the surface is edge-on, so a hair of error projects into a long
streak — fine dark lines lying just inside the outline, following it. A radial
push cannot do that, because the canopy is star-shaped about its middle and
scaling a star-shaped surface out from its own centre leaves it star-shaped.

**A trunk stops being drawn while you are standing in it**, which used to happen
on an ordinary stroll and is now a backstop. Trees are solid, so walking cannot
put you inside one; what is left are the ways in that are not walking — flying
over one, or a spot that slipped through.

It is kept because the failure it prevents is total. The near plane is 0.3 and a
trunk is narrower than that, so from inside one the lens sits past the wall in
front of you and saws it open — and what shows through the cut is the ink hull, a
third of a hand further out and therefore still in front of the lens. A screen of
flat dark brown. One comparison per tree per frame is a cheap price for never
seeing it.

The same arithmetic is what decides where a tree stops you, which is why the
answer is its **leaves and not its bark**. An ordinary canopy hangs from 1.27 to
4.49 against an eye at 1.7, so stopping at the trunk left the lens 0.10 inside
the foliage and filled the screen with flat green — the brown failure again in
another colour. The stopping distance is worked out from the built profile
instead: for every slice of the tree within the near plane's reach of your eye,
how far out you must stand to keep clear of it. Measured across all thirteen
trees, the worst clearance is 0.36 standing and 0.37 at the top of a hop, both
comfortably past 0.3. The landmark trees come out the other way — their canopies
begin above your head, so the roots stop them and the whole crown is there to
look up into.

**What it costs is triangles**, and nearly all of it is the trees: twelve of them
at some 64k each, against six stumps at 5k. 770k in the scene graph, of which
about 530k renders from orbit, where the whole planet's worth of cards was 16k.
Geometry is built once per DRAWING and shared by everything wearing it — three
builds for the trees, one for all six stumps — and one turn on the spot apiece is
what stops them reading as one prop stamped over and over. The stumps cost
nothing worth counting and are also `small`, so they drop out entirely once you
climb; on the ground a typical view is 27k triangles and 35 draw calls. If a
phone struggles it is the trees to look at: `RINGS`/`COLS` and `SCALLOP.freq`
come down together — they are locked to each other, and raising one without the
other only facets the crests — or the flag goes off.

**Trees are variants too**, `tree-1.png` upward, behind `TREE_VARIANTS`. They
need a `SPRITE_SIZE` entry each, unlike grass, because a tree is entitled to its
own height — though all three currently share 3.8, since they are drawn on one
canvas size and equal `h` makes them one tree in three shapes rather than three
sizes of tree. Width still follows the drawing, so a future tree drawn broader
on the same canvas would arrive broader without a number changing here.

Variants of a kind share **one slot** in `PROP_TYPES` and take turns inside it,
rather than each taking a slot of its own. Otherwise adding a second tree
drawing would double the number of trees, when what it should do is vary the
trees already standing there.

Only the height, 0.30, is a decision — the width follows whatever was drawn.
`BLADE_TUFTS` is the number of grass clumps and is the knob for bald versus
overgrown. Like `SCENERY_COUNT` it is a count over a fixed area, so it has to
move with `globe.radius`: halve the radius and a quarter as many holds the same
thickness. Both are also counted against the biomes now — most of what they ask
for lands in the meadow, since the sand thins grass to 0.045 and refuses scenery
outright. See Biomes.

**The house is drawn twice**, `house-day-1.png` and `house-night-1.png` — the
same dome by day and with its lamps lit. It is the only prop with a second face,
which is what `NIGHT_ART` in `scene.js` is: a map from a sprite key to its lit
version. Anything else given an entry there gets the same treatment.

The lit sheet goes on its own card over the daylight one and cross-fades in, so
the lights come *on* rather than cutting. It is deliberately **not** tinted with
everything else — the tint is what turns a daylight drawing into a night one,
and this drawing has already been through that by hand, so multiplying it again
only buries the windows. `lamps` in `daylight.js` says whether anybody indoors
has the lights on (0 by day, 1 at night) and interpolates like every other
per-phase number; `_setLamps` then shapes it so nothing happens until `LAMP_ONSET`
of the way through dusk and the whole change lands over the dark end of it. Left
linear across the entire evening you get several seconds of a house half daylit
and half lamplit, which reads as a double exposure rather than as dusk.

Three things come up with it, and they light three different kinds of surface.

The **pool** lies on the grass — a piece of the sphere rather than a flat quad,
because at nearly nine units of reach a lid laid over a globe of radius 8 has
its rim well underground, and the light would stop dead in a hard arc wherever
the hillside came up through it. The **bloom** is the light in the air, drawn
*in front of* the house. Behind was the obvious way round and does not work: a
glow centred on a four-unit opaque dome has its whole bright half hidden by the
dome, and the fringe that clears the silhouette measured under a tenth of the
strength it was set to. It is also wrong about what is happening — the lamps are
inside, and what you see of them is light coming out of the openings.

The third is the **lamp term**, and it is the one that makes a wide pool work at
all. A decal lights the ground it lies on and nothing else, so every tuft, bush
and stump standing in the pool stayed a dark cutout in a lit clearing — the
light read as a circle painted on the hillside. So every card that can stand in
lamplight has a warm term added to it in its own fragment shader, from the same
centres and the same reach the pools use, patched in through `onBeforeCompile`.
A real THREE light is not an option and never was: these are `MeshBasicMaterial`
by design, and switching them would not help, because a billboard's normal faces
the **camera** rather than the world — a point light would light every card in
the scene identically wherever you put it.

The falloff is `(1-t)^2.4`, fitted rather than guessed, because it has to agree
with the painted stamp: `paintLampGlow` reads 0.30 of full at 0.40 of the radius
and 0.08 at 0.68, and that curve gives 0.30 and 0.07. Two falloffs that disagree
read as a sprite that does not belong to the light it is standing in.

Three things deliberately do **not** take the term. Shadows, which would then be
lit from inside — the pool crossing one already lifts it by as much as the
ground it falls on. The flat flower clusters, which lie at R+0.04 under a pool
at R+0.05 and are therefore painted over by the decal wholesale; patching them
as well would light them twice, and on a cluster drawn white that is the
difference between catching the light and blowing out. And the lamp's own cards,
because a house is not lit by its own windows — leave that one in and the
daylight card under the lit one takes a flat wash across its whole face, which
nobody sees at midnight and everybody sees mid-dusk when the two are half and
half. Standing cover has no such problem: a tuft is in front of the ground
behind it, so the pool loses the depth test and never touches it.

`uLampAt` is refreshed every frame immediately after the bob, since the shader
measures in world space and the whole planet floats — a frame late and the light
slides against the ground it is lying on. The uniforms are arrays sized to
however many lamps the world turns out to have, worked out before anything is
built, so a second lit prop lights its own surroundings without a rewrite.
three.js keys its program cache on `onBeforeCompile.toString()`, so all the
patched materials share one extra compiled program between them — measured at 8
programs, up from 7.

Where those openings are is **read off the drawing**, not typed in: `litSpot`
finds the pixels that are both bright and warm, and hands back their centre and
spread. The house body is drawn a little blue of neutral and the lamps strongly
the other way with nothing in between, so the threshold is nowhere near an edge.
Size comes from the RMS distance of those pixels from their own centre rather
than a box around them, which matters as soon as a drawing has more than one
opening: a box round a window at one end and a door in the middle is mostly the
dark wall between them, and the glow it sized came out half the house wide.
Move the door, add a window, redraw the house entirely — the glow follows.

**The sun and moon are drawn art**, and are the one thing that does not go into
the sky texture. `SKY_DISC_ART` in `assets.js` turns them on; both files are
listed in `sw.js`.

They become a card in the sky facing you, rather than a disc painted into the
dome, because that texture is 1024px wrapped around a 180-unit dome with
mipmaps deliberately off — it magnifies anything painted into it about nine
times, which a soft gradient survives and a drawing does not. Being
equirectangular it also squeezes a circle to 76–86% of its width depending how
high it sits; nobody notices on a featureless disc, everybody would on a moon
with a face.

Draw them square on transparent, around 512px — that renders roughly 1:1 at the
biggest either ever appears. The margin you leave does not matter: the card is
scaled so the *drawn* disc spans the angular size `discR` asks for, measured
from the art's own alpha bounds. The two current drawings leave quite different
margins — 693×605 of sun on one sheet, 672×632 of moon on another, both on 722×722
— and both still come out at the size `discR` names.

They are also not perfectly circular, and that is the drawings rather than the
renderer: they come out 1.15 and 1.06 wide-to-tall, which is exactly the ratio
of their drawn bounds.

One sun drawing covers morning, noon and evening: it is multiplied by
`look.disc`, which is where the warm start, pale midday and orange evening come
from, so it is drawn white. The moon only ever appears once, so it carries its
own colour. The halo stays painted in the sky behind them, since a soft glow
loses nothing to magnification.

Like the stars, the cards need `depthTest: true`, and for a while they did not
have it — the sun and moon showed straight through the planet, sitting on the
grass whenever they had gone round the back. The trap is that `renderOrder`
sorts *within* a pass, not across them: being transparent puts the card in the
pass after every opaque object, so `-9` never got it in front of the globe, only
first among the transparent things drawn once the globe was already down. The
painted disc it replaced was never relying on `renderOrder` for this either — it
was a mark in `skyA`'s texture, and `skyA` is genuinely opaque, so it really
does render before the globe. A card that needs alpha for its margins and
opacity for the cross-fade cannot be opaque, which closes that route and leaves
the depth test. Nothing out at sky distance writes depth, so at 170 units the
card still passes wherever the sky is: zero pixels changed with the disc in
view, at all four hours, first person and from orbit. The tell, if it ever
returns, is a disc with **no halo** — the glow is in the sky texture and is
occluded correctly, so only the bare card leaks. It costs 22% of the surface:
the planet blocks the disc past 124.4° from its direction, and the rendered
frame flips between 120° and 130°, exactly there.

The alpha tap test reads a character sheet back with `getImageData`, which
taints on a cross-origin image. Keep the art on the same origin.

**The planet's surface is painted in code**, by `paintGlobe` in `art.js`, onto a
3072×1536 equirectangular canvas: `u` wraps once around, `v` runs south pole to
north. It replaced `ground-day.png`, which measured as 2000×1000 of a single
flat `#CEE4A4` — one distinct colour across all two million pixels — so nothing
drawn was lost with it.

Two things made it worth painting rather than drawing, and both are things a
file cannot do:

- **Biomes.** The ground's colour under any point has to agree with `biomesAt`,
  which is read at build time by the grass and the cover as well. One rule, three
  readers. Drawn into a file, the picture and the rule drift apart the first time
  either moves.
- **The pole squeeze, undone forwards.** A sphere pinches the texture
  horizontally toward the poles, so a mark drawn at a high latitude arrives
  narrow. `poleCorrect` used to hunt marks down in a finished bitmap and widen
  each about its own centre — necessary when the marks arrive as pixels with
  their latitudes forgotten. Painting them, the latitude is *known* at the moment
  of the stroke, so each tick is simply drawn under `g.scale(1/cos(lat), 1)` and
  is the right shape when it lands. `poleCorrect` and its apparatus are gone.
  The stretch is clamped at 10× — the last few rows before a pole want infinity,
  and nobody stands there.

What it paints, in order: a base colour per 16px cell — a weighted mean over the
whole `biomesAt` mix, which sums to 1 — then `TICKS` short bowed strokes (6000,
1–3 per mark, round caps), then `BLOOMS` four-dot clusters (1600). Both take
their colour, size and number from **whichever biome won the spot**, so on the
meadow that is green-brown ticks with white-yellow-pink blossom, and on the sand
it is brown hatching with green blots at nearly twice the size. Strongest-wins
rather than a blend because a mark is discrete — there is no half-brown stroke —
and along a border the two kinds interleave in proportion to their weights, which
dithers one texture into the other. The counts were arrived at by measuring
coverage — 22000 ticks read as 55% ink and turned the field grey.

**The one thing painting cannot fix is near-field sharpness.** At a walking eye
height the ground under your feet is about a unit away, which magnifies the
texture roughly 25× — no resolution reaches that. What *was* fixable was the
grazing-angle blur further out, which is an anisotropy problem: every texture
asked for 4 and the GPU offers 16, and at 4 the marks smeared into directional
smudges from four paces. `MAX_ANISO` in `scene.js` now asks the renderer.

## The ponds

`js/water.js`. They were `lake.png` stamped into the ground texture and they are
geometry now, for the reason that keeps recurring in this project: a drawing of
a thing is one shape, wearing one hour's light, seen from one angle — and worse,
it forced its shape on everything else. Every rule about a pond had to be simple
enough to write about a picture, which is why both lakes were plain ellipses.

**The mesh is built by asking the rules where the shore is.** `lakeRim` in
`sphere.js` gives the rim at a bearing as a multiplier on the ellipse, as a sum
of cosines — periodic by construction, so the rim closes with no seam, and
differentiable, which `lakeNormal` needs. `inLake` reads it, `lakeReach` reads
it, the mesh is built from it, and the bed painted into the ground texture traces
it. Four readers, one shape. Checked by sampling 720 bearings on each pond and
confirming `inLake` flips exactly at the mesh's own rim: no mismatches.

The projection is gnomonic, because that is what `inLake` measures in. Given the
parameters it would compute, `dir = normalise(centre + tan(a·rx)·east +
tan(b·ry)·north)` runs it backwards. Cells stretch away from the centre by
1/cos², which is why the rings are biased outward rather than spaced evenly.

**Four layers, because each wants a different blend**: the body, vertex-coloured
and slightly transparent over the painted bed; the nami sheet — thin dark pen
squiggles, normal blending, because ink darkens what it lies on; an additive
sheet of white dashes and soft patches scrolled slowly across, which is the light
on it; and the pen line round the whole thing, drawn last. The anime draws its
water exactly twice over like this — dark marks and light marks on a flat pale
blue — which is where the layer count comes from (matched against its frames
2026-07-28).

**The outline is a stroke, not a shape**, and that swap is worth the space. It
used to be a copy of the whole pond scaled up 3% and drawn underneath: one extra
draw for a closed line, and wrong three ways that a reference drawing makes
obvious the moment you hold them together.

- *Not one width.* A scale multiplies the ellipse's own parameter, and the big
  lake's radii differ by 1.84, so "3% wider" is nearly twice as much line at the
  ends as at the sides. Nobody drew that; it fell out of the arithmetic. So
  `ringGeo` offsets along the rim's own normal, measured in radians on the
  sphere — multiply through by the radii first (`u = ρ·cosθ·rx`, `v = ρ·sinθ·ry`)
  and you get a plane where distance means one thing everywhere. The normal
  comes from the curve rather than being assumed radial, because on a lobe
  "outward" and "away from the centre" visibly differ and a radial offset
  fattens and pinches wherever the shore turns.
- *Perfectly even.* No drawn line is. Three incommensurate harmonics against the
  bearing give a width that never repeats round a lap — at ±0.35, after ±0.62
  read as a snake that had eaten.
- *Never stopped.* The reference lifts its pen three or four times round one
  pond. `RING_GAPS` places the breaks, and the taper multiplies the WIDTH rather
  than an opacity, so a break thins to a point and the bare stretch is genuinely
  bare. A fade would read as an airbrush.

Two consequences fell out. The line has to be `transparent: true` even though
it is fully opaque — three.js draws every opaque material before any transparent
one and `renderOrder` only sorts within those groups, so an opaque line would be
painted first and then covered by the pond it outlines. And the pond got its own
colour back: the old disc ran under the whole body at 90% opacity, so a tenth of
every pond was the colour of its own edge.

The little **ticks** in threes are the same pen — the mark this art makes when it
wants an edge to feel drawn, and the same three that sit on Chiikawa's cheeks.
They took two goes: a quad gives three brown bricks (square ends read as
printed), and a plain half-sine taper overshoots into a leaf. The sine is
clamped so it reaches full width in the first sixth and holds, which is a dash
with rounded tips — what a small stroke of a round nib actually leaves.

**The wave lines BOIL rather than travel.** Hand-drawn water doesn't slide
anywhere; it is redrawn, and no two passes of a hand agree. So `paintNami`
draws the same sheet three times — layout seeded identically, the pen's wobble
seeded by the frame — and `driftWater` flips between the drawings a little
over twice a second. Every line wiggles in place and nothing travels, plus a
creep of the whole sheet at half the glints' rate on another bearing, so the
two kinds of mark belong to slightly different currents. The nami mesh sits at
renderOrder 4.7, between the fish (4.5) and the glints (5): a wave line passes
OVER a fish, which is the surface being between you and the animal.

**The shoreline boils with them, on one clock.** `ringGeo` takes a pass number
and builds three drawings of the line — three long-wavelength harmonics (four,
seven and eleven per lap, all periodic in a whole turn so the ring still closes)
wander the pen off the rim, the pressure term gains a per-pass component, the
gaps slide a little, and the ticks travel with the stroke they belong to and
lean slightly differently. `driftWater` swaps the whole geometry, guarded, so on
the frames that change nothing it costs a comparison. One pass number drives both
boils deliberately: a cel is redrawn all at once, and two clocks would be two
hands working on one drawing.

**Only the ink moves.** This is the design constraint, not a detail. `lakeRim` is
the one shape the mesh, `inLake`, `lakeReach`, the bed and every fish all ask, so
a boil that wobbled the *rim* would wobble where you can walk, where you can cast
and where a fish is turned back — invisibly, and none of it wanted. The rim is
untouched; the pen is offset from it per pass. It also can't be felt, only seen:
`pickGround` raycasts the ground and nothing here.

What bounds the wander is the **bed**, not the line's own width, and the first
draft of that note was wrong. A wandering line does stop covering the water's
edge — the inner edge strays to 1.0027 of the rim on the lake, 1.0055 on the
small pond — but what's under there is the bed, painted the water's own colour
out to `BED_OVER` (1.015). So the invariant is `inner edge < 1.015 of rim`, and it
holds with about 3× headroom. **The small pond binds it**, because `RING_BOIL` and
`RING_W` are absolute angles while the ponds aren't the same size; raise either
and check against the pond, not the lake.

**The bed is one flat fill of the water's own colour.** It was a sand band round
a mud middle, and the sand — pushed past the water's ink by `BED_OVER` plus the
resample bleed — drew a brown ring round every pond. The reference has no beach:
grass meets the pen line, the pen line meets water. Water-coloured rather than
ink-coloured because a drawn line has gaps in it, and whatever lies under a gap
is what the player sees there; the only right answer is the pond. `BED_OVER`
came down from 1.035 to 1.015 for the same reason — the overshoot used to hide
under an opaque disc and is now bare at a gap, so it is kept to about a line's
width, which reads as a fill that overshot slightly. Which is what
hand-colouring looks like, so it is left rather than chased to zero.

**The rim gradient came down with it.** `waterShallow` was `#BEE9E7` spread over
the outer third of the pond, which drew a pale halo just inside the outline — a
ring of foam doing to the water's edge exactly what the retired sand was doing
to the ground's. The reference fills flat and lets the line be the edge, so the
two water colours are much nearer each other now and `SHALLOW` is 0.20. The
depth cue survives as a hint rather than a band.

Two things bit hard enough to be worth repeating:

- **The daylight tint WRITES `material.color`, it does not multiply.** Anything
  in `tintables` that carries its own colour does not get tinted, it gets erased.
  The ink went in like everything else outdoors and rendered pure white — a white
  disc the size of a lake. Colour belongs in the vertices or in a texture, or the
  hour has to compute it explicitly, which is what `waterHour` now does for all
  four layers. The pen line is `PAL.waterInk`, which is the same warm brown as
  `PAL.line`: it was a cool blue-grey on the theory that a wet edge is not a dry
  one, and the reference simply disagrees — there is one pen and it does not
  change colour for water.
- **Stacked decals have to clear the SAG, not the depth buffer.** The gap between
  the ink and the body started at 0.0006, comfortably above what a 24-bit depth
  buffer resolves at eight units — and the pond came out banded with white rings.
  Both discs are polyhedra approximating a sphere, so each sags inward between
  its rings by c²/8R, and the ink's rings sit 3% further out so the two sag in
  different places. The worst band sagged 0.008: thirteen times the gap. The sag
  is orders of magnitude larger than depth precision and is the number that
  matters.

**Water is mostly the sky bouncing off it**, so `mirror` in `daylight.js` lerps
it toward `skyLow` the way `haze` does the mountains. The counter-intuitive part
is that the numbers are *lower* than the haze's by day: water's own colour is a
saturated blue-green and the evening sky is a warm tan, near enough opposite, so
a lerp between them travels through grey. At 0.62 the sunset pond was a flat pale
putty that read as wet sand. What actually turns water orange at sunset is its
highlights, and those are additive — so the glints are painted `skyLow` outright
and go the whole way, while the body only leans. Night is the exception and takes
a strong pull, because there the horizon is a deep blue, a neighbour of the
water's hue rather than its opposite, so the lerp darkens without draining.

## The fish

`js/fish.js`, and only in the big lake — the pond is small enough that a shoal
in it would be a bucket. Twelve cards lying flat just over the water, one per
species, dealt from `FISH_SPECIES` in config.js.

**Twelve species, and the count is the roster's length rather than a number**:
the shoal is dealt from a shuffled bag, so every species is in the water and
which one you meet first differs every visit. `i % species` was the obvious line
and had two faults at this size — it put the roster's own order into the pond in
the same spawn ring every time, and any count below the species count would have
silently retired the tail of the list.

**Why it could grow from three to twelve** is not about the number. The fish
used to be one white master drawing (`paintFish`, now a tombstone in art.js)
wearing three tints from `PAL.fishKoi`, and a tint can only say what COLOUR a
fish is — so three was already most of what three tints could say, and a fourth
would have been another swatch. Drawn, a species can be a shape and a marking
too: the round puffer, the long needlefish and the pink one with waves down its
back are three animals rather than three shades. It is the same lesson the
ground and the lake taught from the opposite direction. Those were pictures that
could not carry rules; this was a rule that could not carry a picture.

**They are above the surface, not under it**, which sounds backwards and is the
only thing that draws: under 90%-opaque water they would be present, correct and
invisible. What says "submerged" is colour, not depth — each fish is washed
`CONFIG.fish.sink` of the way with the hour's own water before it is drawn, the
same trick the reflections use. The glints and the dark wave lines then pass
over the top, which reads as the surface being between you and the fish. They draw against the water's
stencil like the reflections do, so a fish at the edge slides under the ink line
and a tree between you and the pond hides the fish behind it.

The drawings changed the arithmetic of that wash without changing the idea, and
the difference is worth knowing before `sink` is touched. It was a lerp from the
species' tint toward the water, landing on the fish itself. It is now white
lerped toward the water and MULTIPLIED by the drawing — which is precisely what
`setReflection` does to a character sheet, so the fish are closer to the
reflections than they were, not further. A lerp drains a colour toward the
water's; a multiply keeps the hue and takes the light out of it, which is what
holds the puffer's dots and the ripplefin's waves where a lerp at this strength
would have washed them into the body. Because it is one wash for all twelve, it
is worked out once per frame rather than once per fish.

**Cards are cropped, and `len` is the long side.** The drawings arrive square
and no fish is; `paintFishCard` crops each to its opaque bounds (plus the usual
`SHEET_PAD`, or the mipmaps fringe the ink) and everything that shows a fish
sizes itself from that one canvas. Uncropped it would have been one lie told in
three places — the swimming card sized by its margin, a small fish in a big chip,
and the hand holding each species at whatever fraction of the slot its own file's
whitespace left. Sizing to the LONGEST side rather than the height is what keeps
a 157x348 needlefish and a 294x293 puffer the same handful of creature.

They swim in the lake's own gnomonic frame scaled to world units, so `cruise`
means the same thing whatever shape the pond is. They shy from your feet: a burst
away that decays over about a second and a half, because in this world everything
notices you a little and nothing runs from you for long.

**The shore needs a wall, not just a force — and finding that out is the useful
part.** Containment started as a steering term that turned a fish inward the
nearer it got to `lakeRim`. A force can always be outrun by a bigger one, and
there is a bigger one: the shy burst, which fires when you stand at the water's
edge and pushes the fish *away from you*, which is to say at the far bank. Soaked
for ten minutes with somebody parked on the shore, fish left the pond — measured
at 1.34 of the rim, a third of a radius out onto the grass.

Two fixes, and only the second is a guarantee. The shy steer now runs *before*
the shore steer so the shore has the last word, and after the position is
integrated there is a hard clamp: work out the rim on the bearing the fish
actually arrived at, and if it is past `CONFIG.fish.hard`, put it back on that
line and turn it inward. Re-soaked for twenty minutes with the same standing
figure: **zero escapes, worst approach exactly 0.900 of the rim** — the clamp,
holding to the digit. `hard` sits short of the rim by more than half a fish, so
it is the card that stops at the ink rather than the fish's centre.

That is the same lesson as the water itself, arriving from the other side: the
rules and the picture have to be one thing. `lakeRim` is now asked by the mesh,
by `inLake`, by the painted bed, and by every fish, and there is nowhere left for
them to disagree.

## The controls

**A tap points; a button acts.** Taps used to mean two unrelated things at
once — *walk there* and *do the thing under my finger* — and those cannot share
a gesture, because the second only fires when you hit something and the first
fires when you miss. Every near-miss on a tuft of grass silently became a
stroll, which reads as the game ignoring you. `tapToWalk` and the double-tap
hop are gone; the stick moves you, and a tap that points at nothing does
nothing.

What a tap's second meaning became is the **action pill** (`verbNow` / `doVerb`
in main.js): one button whose word is decided fresh each frame from where you
stand and what you hold — ひろう, おく, しまう, つりをする, あげる!, やめる.
The decision and the doing are two functions, so there is exactly one place
that knows which verb is available and the label comes from the same call that
would run it. Ordered by urgency: a fish on the line outranks everything,
because the window to strike is under a second.

Fishing starts from 「つりをする」 rather than a tap on the water — tap-casting
was invisible to anyone who did not guess it, and it fought with tapping the
water for anything else. `canCastFrom` asks whether there is water in front of
you; `castFrom` lobs at the pond's middle, so a cast is always at the water
rather than along the shore.

**Lights get their own round button**, and the carried lamp is what settles
that. Sharing the pill, a lamp in your hand would have to choose between
offering 「けす」 and 「おく」, and whichever lost you would be carrying a thing
you could not do the other with. Two controls, because there are genuinely two
things to do.

## The backpack

`slots` in items.js: sixteen of them, each empty or holding `{ id, n }`. The
pouch it replaced was a LEDGER — `counts[id]`, a set with no order and no limit
— and the difference is not bookkeeping. A ledger answers "how many do I have";
a pack answers "what have I got room for", and only the second is a thing you
can make a decision about. Stacks are uncapped; the pack only ever runs out of
KINDS. Uniques take a slot with `n` always 1.

**Sixteen is a judgement about how often you should have to choose.** It was
eight, and there are twenty-three kinds of thing — twelve fish, three that grow,
eight that belong to somebody — so eight meant you could not carry one of every
fish, let alone a fish AND a tuft of grass, and an afternoon at the water
quietly filled the bag until plucking silently stopped working. Sixteen ends
that without ending the decision, because twenty-three still does not fit. Four
rows of four still lands under a thumb on the shortest phone worth tuning for,
which twenty would not. Growing this needs no save version: the slot loop reads
past the end of an eight-entry array and gets `undefined`, which it already
treats as empty. SHRINKING it would.

`held` is a slot INDEX rather than an id, which is the small decision the rest
rests on: your hand holds a place in the pack, so putting something away is
forgetting an index and nothing ever has to search the pack for where the held
thing came from. `holding` and `heldUnique` are both derived from it, so there
is no second copy of the truth.

**A full pack refuses**, and callers must respect it: `pickMushroom` and
`pluckTuft` remove the thing from the world as they answer, so a silent refusal
would be an item deleted rather than carried. Both have a `restore` twin for
exactly that case.

**Save v2 keeps the pack and forgets the map.** Inventory, 図鑑 tallies and
gift cooldowns persist; placed positions and loans do not. A reload gives a
pristine world with your bag intact — the world resets to how it likes to be,
and what you are carrying is yours. A unique in a slot is the only unique the
save remembers; one left on a hillside starts the next session at home. v1
saves are converted rather than dropped: the old ledger pours into slots in
display order, which is why the version field existed.

**A landed fish with a full pack goes back in the water**, and is shown doing
it rather than announced: the card rises and hangs as always, then drops
straight back to the surface with a splash. This world has no way of telling
you anything and does not need one — a fish sliding out of your hands is a
thing you can read at a glance. The room is checked at the STRIKE rather than
at the end of the reveal, because the answer changes what the reveal does; a
full pack used to be discovered only after the flourish had played, so the
fish was tallied, the animation ran, and then nothing was in your bag and
nothing said why.

It is still counted in the 図鑑 when it gets away. You landed it and saw what
it was, which is what that tally records — `tally` and `add` are separate calls
for exactly this case.

The 図鑑 moved to its own ずかん pill. It shared the pack's drawer while both
were small and stopped making sense the moment the pack became slots — one is
what you are carrying now, the other what you have ever caught, and sharing a
drawer made the slots look like the first two rows of a longer list.

It covers **things you FIND**, in two sections: さかな and きのこ. Grass is not
in it and should not be — it is everywhere, and a list of things you cannot
fail to find is a list of nothing. Nor are the uniques: the bear is the
house's and always has been, so congratulating anybody for discovering it would
be strange. Fish are tallied by the rod (a fish can be landed and not kept);
mushrooms are tallied by the pickup, because a mushroom in your pack is a
mushroom you found.

## The lights

Two, and they are different kinds of thing. **`bulb`** is the bare bulb hung
from the middle of the ceiling — `ceiling: true, night: true`, wired in, so it
follows the hour. **`lantern`** is the floor lamp — `item: true, lit: true`,
burning because somebody lit it, and now carryable like the bear and the
kettle. The bulb is not carryable and should not be: it is screwed to the
ceiling, which is the difference between a lamp and a light fitting.

Brightness is three facts that cannot be folded into one another:
`switchedOn` (is it working at all — the only one anybody can change), `night`
(what it follows once on), and `_lamps` (what the hour currently is). A lantern
burns at every hour and goes out when switched off; the bulb follows the
evening, and switched off stays dark through the evening too, which is the
whole point of a switch.

Collecting every light rather than only the wired one is what made a switch
possible at all — the lantern's glass used to be written once at build, on the
reasoning that "nothing turns this on and off yet", and a look set once cannot
be switched. Both lists now carry the piece's `art`, so one `toggleLight` call
moves the glass, the pool, the halo and the light it casts on the room
together, and a light can never disagree with its own glow.

**A carried lamp brings its light with it.** The light's position is an empty
object parented to the piece's anchor, so keeping the anchor over your feet is
the whole of it — the pool, the halo and the light on the walls all follow, and
none of them has to be told. Measured: the light tracks to within 0.12 units of
your feet while carrying, and stays put when you set the lamp down.

## The pouch, the hand, and giving

`js/items.js` holds the two halves the name suggests: ITEMS, the table of what
can exist — never mutated, safe for anything to read — and Inventory, one
visitor's belongings. The inventory is the app's first save data: one
localStorage key, one JSON object, a `version` field inside it from day one so
the day the schema changes, old saves get translated rather than discarded.
Writes are debounced, because a gift is three changes in one gesture and
localStorage is synchronous — coalescing them is both cheaper and atomic.

**`kind` is the load-bearing field.** Everything today is `stackable` —
fungible stuff owned as a count, where gifting decrements and the world doesn't
change. The other word, `unique`, is reserved for the bear and the kettle:
references to specific world objects whose pickup mutates the house and whose
mutation must persist. Reserving the word now is what makes adding them a
feature rather than a migration. The bulk of the stackables are the twelve fish,
and **their rows are generated** from `FISH_SPECIES` rather than written out —
the one place in ITEMS where that is true, and worth the exception: a species is
four facts that must agree (a save key, a drawing to fetch, a name to show, a
fish in the water), which was cheap to keep by hand at three and is not at
twelve. A hand-written row the roster had never heard of would be a chip you
could own and a fish nobody could catch. `recordCatch` is the fishing rod's
deposit slot, counting the 図鑑 tally and the pouch in one call; the tally is
never decremented, so giving a fish away does not un-catch it.

**The rename is the version field's first real outing**, and the answer was not
to bump it. `koiOrange`/`koiCream`/`koiBlue` no longer exist; the loader would
have dropped them on sight, quietly emptying every pouch that ever held a fish.
But the version answers "what SHAPE is this object" — same keys, same nesting,
same meaning per field — and none of that moved. What moved is vocabulary, which
is a rename, and a rename is translated in place: `RETIRED` maps each old id to
the drawn species nearest it by look, counts and 図鑑 tallies are ADDED into the
new id rather than assigned, and a held koi comes back in your hand as its
successor. Bumping would have been the loud way to do the destructive thing.

**The hand** (`js/hand.js`) is the card at the bottom-right when something is
held — the one object in the app that lives in view space, parented to the
camera. In-scene rather than DOM for one reason: `tintables`. A fish held up
at night should be moonlit like everything else, and the moment the card is in
the scene, the hour does that for free. It draws with the depth test off and a
renderOrder above the world, because view space is full of lies the depth
buffer must not hear — the card sits 0.85 from the eye, inside most things you
walk past. Note that a camera with CHILDREN must itself be added to the scene;
a render-from camera can float outside the graph, but children of an orphan
are never drawn. The hand ducks away past the same `groundBand` threshold that
separates standing from flying everywhere else, and comes back on landing.

**The pouch is a sheet in the middle of the screen**, not a drawer in the
corner. It used to be the clock's own arrangement one pill down — panel growing
out of the pill, folding itself away on the same ignored-for-a-while timer — and
that shape is right for the clock, which you GLANCE at, and wrong for this,
which you go INTO. Three things followed from the corner: a 230px cap, 44px
slots, and a bag that shut itself while you were still deciding. So: one card at
`min(92vw, 420px)` over a scrim, staying open until the cross, the scrim or
escape puts it away, with the slots at about 70px. The 図鑑 shares the same card,
because the two are never both wanted and a second scrim would only be a second
thing to keep in step with the first.

The sheet is **modal, and the document's tidy-away handler returns early while
it is up**. That handler folds the clock and the drawer for any press outside
them, and the 図鑑's pill lives in the drawer — so without the guard, tapping a
row of the 図鑑 folded the drawer, and the drawer took the 図鑑 down with it.

`overscroll-behavior: contain` on the body carries over from the drawer for the
same reason it was there: the page sets `touch-action: none` for the world's own
drags, so without it a flick off the end of the 図鑑 keeps going as a swipe at
the planet behind the scrim. `min-height: 0` on the body is what lets the card's
`max-height` actually cap it — a flex child's default min-height is its content,
so a long 図鑑 would otherwise push the card past the bottom of the screen
instead of scrolling inside it.

**The grid wears drawn tiles; everything else wears the drawings.** This is the
one deliberate break in a rule the rest of the app keeps hard — that the thing
you chose and the thing you are holding must not be two pictures. A slot is a
LABEL rather than a window, and the tiles carry a category colour behind each
subject (grey for what grows, blue for what swims, yellow for what is
somebody's, purple for the forks) which only says anything when they are all in
one grid being compared. So `slotIcon` is used in the pack and nowhere else; the
hand, the lake and the 図鑑 go on asking `itemIcon`.

**The 図鑑 could not have used them even if it wanted to.** Its unseen rows are
`brightness(0)` on a transparent drawing, which is a silhouette; the tiles are
opaque, and the same filter on one is a black square. The deeper reason is the
better one though: an unseen row promises the SHAPE of the drawing you are about
to catch, so the reveal has to be that same drawing filling in. Swapping to a
tile would make the promise and the payoff two different pictures.

**The border is the family too, and that is the one place the app's pen is put
down.** Everything else on screen is outlined in ink; a slot is not, because a
tile already carries its family as the colour behind the subject and an ink edge
round it left four backgrounds looking like four unrelated washes rather than
one system. Each border is its own tile's background taken deeper — common
`#969BA0`, fish `#78AFD7`, unique `#E4B937`, special `#7855AA` — and the
category comes from `ICON_CAT`, which splits it off the file name, so the border
and the picture behind it cannot disagree about what kind of thing they describe.

That costs the held state its monopoly on colour. Pink used to be the only hue
in a grid of ink, so being coloured WAS the signal; among four coloured families
it needs weight as well, which is a heavier edge plus a second soft ring outside
it. **4px and not 3.5**: border widths are floored to whole pixels, so a half
step over the families' 3px is no step at all — measured, 3.5px computed to 3px
and the held slot came out wearing exactly its neighbours' weight. Box-shadow
spread keeps fractions; borders do not.

**The count is written across the bottom of the tile**, big and centred and
outlined in ink, rather than tucked into a corner on a pale chip. A chip is a
footnote and the count is the second thing you came to read. Still only when
there is more than one — which also means never on a unique, where 「１」 would
be a stranger claim than redundant, since being the only one is the whole of
what the kind means. The outline is eight offset text-shadows rather than
`-webkit-text-stroke` with `paint-order: stroke fill`, which is the tidier
spelling and thins the numeral anywhere paint-order is not honoured.

Tiles ship as WebP at 256px. The sources are 1254px and about a megabyte each —
twenty megabytes of start screen for something never shown above 70px — and the
whole set comes to 85KB. `ICONS` in assets.js maps item id to file; the fish are
not listed because they derive from `FISH_SPECIES.file`, the same kebab-case the
water already uses, so a species cannot end up with a tile nobody fetches. Two
ids may share one file, which is what both lanterns and both rubbish bags are in
the world too. `slotIcon` falls back to the squared drawing, so a future item
with no tile is a plainer slot rather than a hole.

**Slots are squared before they are shown** — for the fallback, now. The drawings arrive on canvases of
their own shape and their own margins — a fish cropped tight to its pixels by
`paintFishCard`, a mushroom padded for its mipmap by `paintSheet`, grass tall and
thin on a mostly empty card — so `object-fit: contain` fits each CANVAS to its
slot rather than each DRAWING, and four slots come out filled to four different
fractions. `squareIcon` measures the ink with `sheetBounds` and redraws it
centred on a square at one fixed fraction. Nothing about the drawing changes,
only how much of its slot it is given.

**The held slot wears a ring, not a fill.** Solid ink is this app's word for
"on" everywhere else and it was wrong here for one reason: everything else
wearing it is TEXT, which flips to paper and stays legible, and a drawing
cannot. The items are outlined in that same ink, so a filled slot ate the very
picture it was pointing at.

**Drag a tile to carry it; let go over a slot to swap or pour in.** See
`moveSlot` in items.js. THE HAND FOLLOWS THE THING: `held` is an index, so a swap
that did not carry it would leave you holding whatever was moved into the slot
you were holding. Which a press turns out to be is decided by DISTANCE and not
by time — under `DRAG_SLIP` it was a tap and takes the thing in hand, past it it
is a carry. Nothing hidden and nothing to wait for.

**This was a long press, and the argument for it was wrong.** The claim was that
dragging across a grid means tracking a finger over nodes it did not start on
and guessing which one it is above. `elementFromPoint` answers exactly that
question — it is four lines — so the real difference was that the long press was
easier to write. What it cost was discoverability: an invisible gesture needs a
line of text to explain it, and that line lived in the one place that had
something else to say the moment you were carrying anything, so picking a thing
up silently deleted the instructions for moving it. A drag teaches itself by
being tried. It also deletes the modal state between lifting and placing, and
stops two nearly identical presses on the same tile meaning two different
things — the exact ambiguity the action pill's own notes call out as worth
removing. There is no written hint at all now: the gesture is its own
instruction, and the caption under the grid went back to being purely a state.

Nothing repaints between `pointerdown` and `pointerup`. The source slot is
marked by hand rather than by rebuilding the grid, because a rebuild replaces
the node holding the pointer capture and every move after it goes somewhere
else. `.pack-ghost` takes no pointer events, or `elementFromPoint` would only
ever find the ghost.

**The row at the bottom is where you drop things to be rid of them** — a
destination rather than a button, so there is no second gesture and nothing
parked in the resting state. What happens next depends on the thing, and only
one of the three cases needs asking about:

- **A unique** is SET DOWN, not destroyed. `placeSpot` finds somewhere in reach
  on your own side of the wall and the drop routes through the hand into
  `putDownUnique` — the one exit every set-down in the app already shares, water
  gag and topple included — so a drag out of the pack lands in the world exactly
  the way the action pill's おく does. No confirmation, because you can walk over
  and pick it up again. Nowhere to put it and the row shakes its head rather than
  inventing somewhere. The sheet closes afterwards: the thing is out there now,
  and the card would be standing in front of the result.
- **One of a stackable** simply goes. Nothing to weigh up.
- **More than one** is the only ambiguous case, and the only irreversible one, so
  the row turns into the question: −/＋/ぜんぶ and a confirm, defaulting to one
  every time because 「すてる ９こ」 is not something to press twice by accident.
  `discard` leaves the 図鑑's tally alone deliberately — it records what you have
  CAUGHT, and throwing a fish back is not a claim never to have met one.

**Gifting** is what holding is for: a tap on a friend with something in your
hand is a delivery, not a visit — the item changes what the gesture means,
which is why holding is a mode. The gift consumes the item, stamps the
friend's cooldown, and speaks from one of two new line buckets. `gift` is the
full moment — and the second place Chiikawa's `delight` is ever reached, level
with your arrival, which is exactly where being handed a present belongs.
`giftAgain` is the tier inside `social.giftCooldown`: still glad, audibly
aware this is the second one, never a refusal — refusal has no place here.
The cooldown is per FRIEND, not global, so making a fuss of Hachiware right
after Chiikawa still earns the full thanks.

## Fishing

`js/fishing.js`, and it is a state machine and almost nothing else: cast →
wait → bite → caught, with the interesting decisions being what interrupts
what. A tap during the bite is the strike; any other tap reels in; walking off
reels in; a tap on a friend still wins, because a person beats a pastime
everywhere on this planet. Casting starts from an ordinary tap: water you are
standing beside (within `fishing.nearShore` of the shore) takes the tap as a
toss to that spot, anywhere else it stays a walk. `tryCast` is strict —
fishable water, a reachable toss between `castMin` and `castMax` — precisely
so the tap handler can be generous about offering it.

**What bites is the shoal.** Before the 「!」, the nearest real fish is lured
over (`lure` in fish.js) and visibly swims to the float; the species you catch
is that fish's own; afterwards it dives (`dive`) and the pond holds one fewer
for `diveMs`, coming back somewhere else mid-water. You can look at the water,
see the cream one loafing nearby, and cast to it on purpose. The pond is a
place with fish in it, not a gacha wearing a pond costume. A lured fish stops
minding your feet — the float sits inside the shy radius of the very shore you
cast from, so the old reflex would cancel every reachable bite.

The props are built once and shown or hidden: the float (crossed quads, the
ground cover's trick), the line (a `THREE.Line` — one pixel of ink is exactly
what this world's pen draws, bowed by hand from an unseen rod at the screen's
corner), the 「!」chip (drawn as shapes, not set in a font — a glyph that size
IS a drawing, and fonts differ by device), pooled splash rings (additive and
stencilled to the water like everything on it), and the caught card that rises
wagging, hangs, and flies to the pouch corner. `onCatch` fires when the reveal
*finishes*, so the pouch never gains a fish still visibly in the air; the
catch lands in your hand when the hand is free, because the natural next thing
to do with a fresh fish here is walk it to somebody. Casting puts whatever you
were holding back in the pouch — both hands on the rod.

**One clock.** Every timer runs on the `now` handed to `update()` — the frame
loop's clock — and taps never compare times, only read the machine's state.
The first build stamped the cast with the tap handler's `performance.now()`
instead and ran the machine from two clocks at once; live they happen to be
the same timebase, but the stepped debug harness (`hidamari.step`) is exactly
the case where they are not, and the machine hung under it. The rule survives
because it was violated once.

## 草むしり, the 図鑑, and the uniques

**Plucking** (`pluckTuft` in scene.js): tap a tuft within `kusa.reach` of your
feet and it comes out — つんだくさ into the pouch, into the hand if the hand is
free. The blades are one merged mesh, but they were built tuft by tuft, so each
tuft owns a known contiguous run of vertices; pulling one collapses its run
onto its own root (zero-area triangles cost nothing), and `regrowMs` later it
eases back out of the ground over `growMs`, scaled about the root — grass
grows, it does not arrive. The original positions are kept whole (~600KB, paid
once) because regrowth needs somewhere to grow back to. Nothing is saved: a
plucked patch is cosmetic, like a footprint.

**The 図鑑** shares the pack's sheet rather than having a card of its own: they
are never both wanted, opening either closes the other, and one scrim is one
thing to keep in step instead of two. It is the reason that sheet's body scrolls
at all — twelve species is the one thing in this app that is a LIST rather than
a handful. Uncaught species show as silhouettes (`brightness(0)` on the same card the
hand uses) with 「？？？」; caught ones show name and times-ever-caught, which
gifting can never lower. The silhouettes do more work at twelve than they ever
did at three: cropped to their own drawings, a round one and a long one are
visibly two different animals you have not met yet.

**The uniques** — くまさん (the plushie) and やかん (the teapot) — ride the
loose-furniture system that already let them be shin-shoved: each loose entry
now carries its `art`, its `home`, and its `anchor`, and carrying is three
verbs of glue in main.js between the loose system (where the piece IS), the
inventory (where the save says it is), and the hand (what you see):

- **Pick up**: tap the piece within `uniques.reach` — tried BEFORE the house's
  tap priority, or a bear set down by the doorstep would send you to the door.
  The hand holds a fresh-built copy of the actual mesh (`holdMesh`), which
  KEEPS its depth test: a built piece is fills and inverted-hull ink whose
  whole trick is the depth buffer, and depthTest:false turns the bear into a
  bear-shaped blot of outline. The world's own anchor just hides.
- **Put down**: tap the ground within reach, or press 「おろす」 for your feet.
  `placeLoose` re-stands the piece through the same `place()` closure that
  stood it on the room's floor — a bear on the meadow is stood up by the code
  that stood it on the futon. Placed pieces stay shovable; placement is saved
  (`{state:'placed', dir}`) and survives reload. Water is the exception:
  ぽちゃん — a splash borrowed from the rod (`fishing.splashAt`), and the pond
  keeps it `pondMs` before it finds its way home.
- **Lend**: tap a friend while carrying. Same warmth as a gift — same line
  buckets, same per-friend tier — but nothing is consumed: `returnMs` later
  (wall-clock, so it comes home even across a closed tab) the piece is back in
  its spot, checked by a coarse 1.5s ticker.

The lantern is loose but NOT carryable — `pickLoose` takes the item table's
list of arts, because walking off with the room's only lamp is a different
feature.

**The support rule and the topple.** `putDownUnique` asks `perchUnder` for
whatever has a top under the spot; inside `uniques.perch` of that surface's
radius the piece sits, and past it `startTopple` runs the scripted fall —
wobble on the spot (the telegraph, so you see you pushed your luck), tip over
the rim, drop, land upright. ころん. Not physics, for the reasons the
reflections and the water already settled: an engine would be a dependency for
two objects, need gravity aimed at a planet's core, want collision geometry for
a world that has none, and rest somewhere different on every device, which is
unsaveable. A comedy beat is authored.

**Getting a tap to reach a stump's top took two fixes, and both are worth
knowing.** The first is `perchAlongRay` in sphere.js: picking against the globe
cannot answer a tap on a stump at all, because the ray goes straight past the
wood and lands on the grass behind it — measured at 2.34 units out when the
stump itself was 1.4 away. No mesh is consulted, and none should be: every
standable thing here is a cap on a sphere, so the exact answer is the ray
against the SHELL at radius R+top plus a dot product against the cap. Cheaper
than raycasting the geometry, and it answers the right question — where the ray
meets the surface you can set something on, rather than where it meets the
flared sides of the wood.

The second is ordering. The house test ran first, and the stump nearest the
doorstep stands in front of the building from most angles, so the ray hit both
and the tap walked you to the door holding the bear. **Putting something down
now beats the house**, exactly as picking something up already did — same
argument, same reason: the ray hits both and the tap meant the surface.

Verified: placed on the cap at exactly 0.485, the stump's own top; aimed at
0.85 of the cap radius it wobbles, goes over, and lands on the grass 0.979 out
from the centre against a cap radius of 0.491.

**A lent piece travels with its keeper** (`carryLent`), placed beside them each
frame rather than parented to them — a bear parented to a billboard would
inherit its turn toward the camera and spin on the spot as you walked round it.
`besideArc` keeps it clear of the drawing, because the whole value of a loan you
can see is being able to see it. A piece in the pond has no keeper and stays
hidden, which is right: it sank.

**Shoves persist.** The loose system moves `loose.dir` when you walk into
something; the coarse 1.5s ticker notices a placed piece has moved and rewrites
the saved dir. Checked on the tick rather than per nudge because a shove is a
continuous push over many frames, and dirtying the save each one would be a
write per frame for its whole duration.

## Picking mushrooms

The grass's mechanism at a different scale, and the differences are all
character rather than technique. A cover mesh is built item by item, so each
mushroom owns a contiguous run of vertices and taking one collapses that run
onto its base — but unlike a tuft of grass a mushroom is a THING, so it is
remembered individually (`_shrooms`) and comes back as itself. The two drawings
are two items, `kinoko1` and `kinoko2`, because a red one and a brown one are
two things to find; folding them into one 「きのこ」 would throw away the only
variety the scatter has.

Regrowth is four minutes against grass's ninety seconds, and there is no growth
animation: grass springs back, a mushroom is simply there again later where it
was not before. Twenty on the whole planet means finding one is an event, which
is what their scarcity was always for.

**Mushrooms are tried before tufts** in the tap order. With grass first, the
blades growing around a mushroom would answer the tap most of the time and the
mushroom would be nearly unpickable.

## What they like

`likes` on each CAST entry — item ids that reach a third line bucket,
`giftLove`, above the ordinary `gift` and the inside-the-cooldown `giftAgain`.
One each, and one is the right number: the point is not a preference *system*
but that the three of them are three people. Chiikawa is quietly floored by a
fistful of weeds, Hachiware wants to know what kind of fish it is, and Usagi has
strong feelings about mushrooms and no way to explain them.

A favourite beats the cooldown, because handing Usagi a mushroom is an event
whether or not you handed them something else five minutes ago — the cooldown
exists to stop a string of identical gifts flattening the big reaction, and a
gift they actually wanted is not that string. Everything not on the list is
still welcome: refusing a present has no place in this world, and neither does
being lukewarm about one. An id here that no longer exists in ITEMS simply never
matches, so retiring an item cannot break a line bank.

## Reflections

A second copy of a character's card, flipped, hanging from their feet. For a
billboard that is not a trick standing in for a reflection — it *is* the
reflection, since mirroring a flat upright card in a horizontal plane through its
base gives exactly this, and the card is already square to the viewer so the
mirrored one is too. A real mirror pass would cost a second render of everything
on a phone and would be photographically correct in a world that is deliberately
not.

**The stencil is what makes it work.** The reflection hangs below the waterline,
inside the planet, where ordinary depth testing hides it completely — so it draws
with `depthTest` off and is confined instead by a mark the water leaves in the
stencil buffer. The load-bearing detail is `stencilZPass`: the water stamps
itself only where it *passed* the depth test, so the mark is the pond's own
wobbled outline for free, and anything standing in front of the water leaves a
hole in it. Clipping to the pond's shape and occlusion by whatever is in front
turn out to be the same mechanism.

One trap: **three.js does not give you a stencil buffer unless you ask.** It
stopped defaulting to one, and the failure is silent — with no buffer every
stencil test trivially passes, nothing errors, nothing warns, and the reflections
simply drew over the whole planet, grass included. `stencil: true` on the
renderer.

Lakes used to be drawn art — `lake.png` — composited over the ground rather than
baked into it, and that distinction was the whole point.
`CONFIG.lakes` drives four things at once: the water you can see, the characters
steering around it, the ground cover refusing to sprout in it, and the teasing
you get for paddling in it. Draw a lake into the ground image and the other
three still put water where config says, which is how you end up wading through
an invisible pond. That argument is what the built water finally settles rather
than merely satisfies: the mesh is generated from the rule instead of agreeing
with it.

**Nothing gets into the water, and there were five ways in.** The stick walking
you there, a tap landing mid-lake, being set down in front of somebody stood
across one, characters wandering through, and things being scattered on top of
one. All five now ask the same `inLake`.

Two of those are worth their own note. A blocked step **slides along the shore**
rather than stopping dead — clip the corner of a pond while walking past and a
flat refusal sticks you there, holding the stick with nothing happening and no
way to tell why. And the direction it slides along comes from `lakeNormal`, the
ellipse's own gradient, **not** the line back to the lake's centre. Those agree
for a circle and part company badly here: stood on a long flank, "away from the
centre" runs along the shore rather than off it.

Even that is not quite enough on its own. `inLake` measures in gnomonic angles
and `lakeNormal` is the gradient in that same space, so the two agree only to
first order, and a step along what ought to be the tangent dips back inside.
That pinned the walk at an ellipse value of **1.0009** — too far out for the
escape hatch to fire, too far in for any tangent to clear. Hence `LEAN_OUT`:
try the tangent, then progressively more of the way out, first dry one wins.
Measured afterwards at 16 waypoints right round a lake, every leg arrived, none
stuck, none wet.

**Lakes are elliptical, and used to be so because the drawing was.** `lake.png`
was 1.84 times wider than tall, and a circular rule around a wide drawing means a
character stopping half a unit short of one shore while standing on open water at
the other. The drawing is gone and the proportion stayed, because the shape was
never the drawing's fault: a pond lying in a hollow is wider than it is deep from
wherever you stand, and a perfect circle of water reads as a well. `r` in config
is the mean angular radius and still the only number worth setting; `lake()`
splits it by the aspect into `rx` and `ry`, using the square root so the ellipse
covers the same water the circle did rather than quietly growing. All four readers ask `inLake` in `sphere.js`, which measures in
the lake's own tangent frame — they each used to carry their own copy of the
arithmetic. Measured against the drawn shape, the rule tracks the visible shore
to within 0.38 units at worst, always slightly outside it.

**Where a lake lands on the globe texture is `u = 0.25 + lon/2π`**, because
`SphereGeometry`'s texture frame does not put `u = 0` where `lon = 0` faces —
the same frame `skyDirFromTexel` spells out for the sun. It was painted at
`0.5 +` for a while, which put the visible water a quarter turn east of the
water the rules enforced: the cast steered politely around two invisible
patches of grass while the scatter carpeted the actual lakes. The check that
caught it renders the bare planet, looks straight down at a lake's config
position, and reads the centre pixel — a formula cannot vouch for itself, but a
rendered pixel is either blue or it is not.

## Standing on things

`js/camera-control.js`, and it is three numbers on the rig: `stand` is the
height of the surface holding you up, `feet` is where your feet actually are,
and they are equal except in the air. `alt` keeps its old meaning — the eye's
height, and the channel the pinch and the sky button drive — so the landed
versus airborne split it decides is untouched. What changed is that the landed
value of `alt` is `stand + eyeHeight` rather than `eyeHeight` flat.

**Moving `stand` moves `alt` with it, by the same amount**, and that pairing is
what makes landing invisible. Height is composed as `alt + (feet - stand)`, so
adding the same delta to `stand` and to `alt` leaves the sum exactly where it
was: the eye does not jump at the moment you land, it simply stops falling.
Getting it wrong makes every arrival on a table a lurch.

**`isFirstPerson` reads `stand`, never `feet`**, and that is load-bearing rather
than tidy. The split decides whether a swipe turns your head or spins the
planet, and the old separate hop channel existed precisely so a jump could not
flip you airborne mid-arc and take the walk away for half a second. `stand` is
the surface you belong to and it does not move while you are above it, so the
guarantee survives the rewrite — measured, a hop on flat ground spends zero
frames outside first person, peaks where it always did, and lands back at zero.

**The snap is instant and the picture is not**, which is the difference between
a mantle and a teleport. Catching a lip moves your feet by up to the whole
`mantle` in one frame, and stepping up a kerb moves them by the kerb; the
`stand`-moves-`alt` cancellation above only holds when the feet were already
level with the ground they arrive on, which is true of a fall and false of a
catch. So the leftover is banked as `_pull` and given back over `pullMs`. The
eye does not move at all on the frame of the catch, and what plays out instead
is a short pull-up onto the surface.

Measured against the eye's own fastest honest movement — 0.065 in a frame, at
the bottom of a hop — a table catch used to move it 0.224, three and a half
times as fast as anything the arc ever does. It is now 0.065: the largest
single-frame movement anywhere in the vertical model is the jump's own takeoff.
Traced through a catch, the surface under you goes from 0.30 to 0.72 while the
camera moves 0.056, in line with the 0.049–0.056 steps it was already taking.

Four margins, and they are four different ideas that all look like slack:

| | what it is | where it applies |
| --- | --- | --- |
| `stepUp` | the kerb you walk up without jumping | on the ground |
| `mantle` | the ledge you catch while rising | going up only |
| `ledge` | the overhang you keep before falling | standing, and coming down |
| `pullMs` | how long the eye takes to catch up | after any of the above moves it |

`stepUp` is measured against what is actually in the room rather than picked as
a fraction of anything. At 0.25 it sounded ankle-high and cleared nothing at
all — the cushions build to 0.28 and 0.30, so every standable thing in the world
needed a hop and the kerb rule was dead code. The next things up are the box at
0.38 and the smallest stump at 0.36, so 0.32 separates "step onto the bedding"
from "climb onto the furniture" with room either side.

The asymmetry on `mantle` is the one worth knowing. Granted on the way *down*
as well, a hop taken while merely pressed against a table climbs onto it —
because `keepClear` parks every nearby spot at `wallKeep` from the rim, which is
inside a grab that also carries the ledge. Measured, that was all six pieces of
furniture in the room, climbed without anybody asking to go up. Withheld while
rising, you have to put yourself over the thing first: about a tenth of a unit
of walking, which is nothing while you hold the stick and impossible while you
do not.

The same trap caught arrivals, and worse — `_standOn` placed you on whatever was
under a spot *with* the ledge, so walking in through the door stood you on the
furniture before you touched a control. Arrivals get no ledge: they have not
walked anywhere.

**Furniture takes one radius for both stopping and standing**, the
area-equivalent circle of its own oval. The honest reading is two — the wide
half-axis stops you, the narrow one holds you up — and it leaves a ring of floor
where you are stopped by the table but not over enough of it to land on, so a
hop there bounces off the side of it and comes down where it started. One number
means anywhere you can be stopped is somewhere you can stand.

A stump keeps two, because a stump genuinely tapers: what stops you is the root
flare at the grass, and what holds you up is the cut face, which is four fifths
as wide. Standing on the flare would put you out over the edge of it.

## Editing what they say

`js/lines.js` holds one bank per character, keyed by `cast.js` key. Each line is
`{ t, expr, w }`:

- `t` — the Japanese text
- `expr` — `normal` `happy` `sleepy` `worried` `surprise`
- `w` — optional weight for the weighted random pick (default 1)

Buckets: `greet`, `greetBack`, `idle`, `ask`, `narrate`, `morning`, `noon`,
`evening`, `night`, `longIdle`, `poke`, `meet`, `meetReply`, `water`.
`AMBIENT_MIX` controls how often idle chatter draws from each — `timeOfDay`
resolves to whichever of the four hour buckets is current, which is the only
route to `night` and so to the stargazing.

Only one character speaks at a time, and never one who has gone round the far
side. `main.js` picks the speaker, biased toward whoever you're visiting by
`dialogue.focusBias`.

## Tuning

`js/config.js` holds every number worth touching:

| Group | What to reach for |
| --- | --- |
| `MEET_ARC` | **how close counts as being with somebody.** Not in `CONFIG` — it is a const above it, because several numbers are derived from it. A framing distance, not a fence: see the constraint below |
| `camera` | `eyeHeight` and `standoff` for how you stand and how close you get, `spawnBack` for how far off the house you arrive (`startAt` is only the fallback for a planet with no house), `orbitAlt` / `maxAlt` for the zoom range, `skyAlt` for where the button puts you, `restLookPitch` for the resting gaze, `idleSpin` for the drift, `liftGain` for how much pinch it takes to leave the ground, `smoothMs` for how quickly the camera settles, `walkFov` for how far the lens opens at a run |
| `globe` | `radius` rescales the world |
| `wander` | `roamMin` / `roamMax` for trip length, `speed` and `rest*` for the pace, `noticeArc` / `closeArc` for when they stop for you, `waterKeep` for how wide they give a lake |
| `social` | `greetArc` for how close counts as walking up to someone and `greetClearArc` for how far off resets it, `meetArc` / `meet*` for the friend-to-friend exchanges, `farSpeakArc` to stop distant chatter, `hopArc` / `hopReply*` for who answers a hop and after what beat |
| `lakes` / `landmarks` / `paths` | positions in radians; one table each drives both the drawing and the behaviour. A lake's `r` is its mean radius — `lake()` splits it by `lake.png`'s shape. A landmark's `s` scales its drawing, which is how a big tree is an ordinary tree rather than a new kind of thing. `paths` is pairs of indices into `landmarks` |
| `visit` | how long a gap counts as "recently" versus "a while" for the arrival greeting |
| `player` | `walkSpeed` for pace and `sprintBoost` / `sprintFov` for what はしる multiplies it by, `accelMs` for how much weight the start and stop have, `bobAmp` / `rollAmp` / `stepsPerUnit` for the walk cycle, `hopHeight` / `hopMs` for the jump and `doubleTap*` for what counts as a double tap, `stickRadius` / `deadzone` / `stickZone` for the pad, `tapSlop` for how far a finger may slide and still count as a tap, `shoreKeep` for the water and `wallKeep` for everything else that stops you, `stepUp` for the lip you walk up without jumping, `mantle` for the ledge you can catch on the way up, `ledge` for the overhang you keep when walking off one |
| `interior` | `walk` for how far out you may stand, `furniture` for what is in the room, and `nudgeReach` / `nudgeSpeed` / `nudgeDamp` for how the bear takes a shove |
| `dialogue` | `charMs` typing speed, `gapMin` / `gapMax` quiet time, `focusBias`, `bubbleLift` for how far the tail clears the ears |

Constraints worth knowing before you change things:

- **Anything eased has to be eased against the clock.** A constant fraction per
  frame — `x += (target - x) * 0.085` — is not a speed, it is a speed *per
  refresh*, so the same swipe settled in half the time on a 120Hz phone as on a
  60Hz one. Phones are the whole target, and half of them are 120Hz. Everything
  that eases now uses `1 - exp(-dt / τ)` with τ in milliseconds — `smoothMs`,
  `accelMs`, `talkBobMs`, `swaySettleMs` — which means the same thing on any
  hardware. The old constants are recoverable from the new ones at 60fps
  exactly, so nothing about the feel changed on the machine it was tuned on.

- **The horizon is 34.4° below eye level, not at it.** On a planet this
  small you're effectively always stood on a hilltop: `acos(R / (R + eye))` is
  a real angle, not a rounding error. Look level and you see nothing but sky,
  which is why `restLookPitch` tilts down and why the pinch clamps the gaze
  back down when you land.
- **`globe.radius` also sets how far neighbours lean.** Characters need about
  two world units of clearance, and how far apart that is in *angle* decides
  their tilt: 22.9° at radius 5, 14.3° at 8, 10.4° at 11. It was 5 once, and at
  that size the three of them splayed to the limb and read as lying down. At
  the current 8 the two nearest homes sit 3.0 units and 21.4° apart and stand
  near enough upright; the widest pair, Hachiware and Usagi, are 6.0 units and
  42.9°, which is as far as the grouping should ever be pushed.
- **`idleSpin` must stay slow.** Much above a degree a second and the planet
  rotates a character out from under your finger while you're deciding to tap.
- **Turning was three times too slow before it was measured.** A full-width
  swipe gave 78°, so spinning round took two and a half sweeps. If the camera
  ever feels like wading again, measure `headingSens` against a real swipe
  rather than guessing at it.
- **Stopping-for-you keys on who you're visiting, not on distance.** They live
  close enough together that a plain radius freezes the whole cast at once and
  nobody ever wanders. `noticeArc` applies only to `rig.focus`; `closeArc` is
  the much smaller radius for anyone you physically walk into.
- **How close counts as being with somebody is one number, and it is measured,
  not chosen.** A portrait phone shows about 31° across — 62 vertical through an
  aspect of 0.46 — and a character is 2.1 units wide at scale 1. So the distance
  you stand at *is* how much of the screen a friend covers: 70% at 5.5, 83% at
  4.6, and at 3.6 they are 32.5° wide and do not fit on the phone at all.
  `MEET_ARC` is that distance, and `camera.standoff`, `social.greetArc`,
  `social.greetClearArc` and `wander.noticeArc` all derive from it — they were
  separate numbers for one idea and none of them agreed. `wander.closeArc` is
  deliberately *not* one of them: how near somebody chooses to come to you is a
  different question from how you frame them, and it is left at 3.6, close
  enough that a friend walking over does not quite fit on the screen. It is a
  FRAMING distance and not a fence: it decides where a tap sets you down
  and how near is near enough to be noticed, never where you may walk. Move it
  and check `camera.spawnBack` still puts everybody outside it — the opening
  frame used to have two of the three wider than the screen.
- **Nothing stops you walking up to a person.** There was a brake on it once,
  and taking it out was a decision rather than a simplification. It worked — it
  removed the part of your travel that pointed at a character, so a
  squarely-aimed approach eased to a halt at `MEET_ARC` while walking past cost
  nothing — and it was still wrong, because the cast are the reason you are
  wandering rather than obstacles in it, and being unable to stand right next to
  somebody is a rule you can find yourself on the wrong side of. If somebody
  fills the screen now it is because you chose to stand there.
  This is a rule about the CAST, and for a long time it was wrongly stated as a
  rule about the world — "nothing stops you but the water and the house", with
  friends and trees covered by one sentence as though they were one decision.
  The scenery is solid now. What stays walk-through is people and ground cover.

## Still to do

- **The room could use more in it.** A table, two cushions and a rug, refit to
  the honest dome. More pieces are one entry each in `CONFIG.interior.furniture`
  plus a builder in `furniture.js`.
- **Player sitting.** The cushions take guests; they used to take you too, and
  the posture machinery is all still here. What went was the old room rig the
  tap-to-sit walk lived on — sitting needs porting to the planet rig (drop the
  eye to seat height, face the middle, stand on any stick push).
- **`sleepy` and `worried` sheets**, which is the sixteen per cent of lines still
  arriving as the resting face — plus `surprise` for Chiikawa, the one of the
  three without it. `happy` is drawn for everybody, `surprise` for Hachiware and
  Usagi, and `delight` for Chiikawa's greeting.
- **More biomes.** There are two — a green meadow and the pale sand both of them
  live on — and a third is one entry in `CONFIG.biomes`: a ground colour, a tick
  colour and a bloom palette, two blade greens, a cover multiplier, a `grows`
  list and a `patches` list. A biome picks its own props now, which is what the
  sand's empty `grows` uses. What is still *not* there is anything a biome
  changes beyond ground, planting and density — no biome has its own weather,
  its own sound, or its own kind of tree, and the meadow's wood is the same wood
  everywhere in it.
- **Draw the bench.** It is the last thing on the planet still painted in code,
  and it sits next to drawn art without an outline, which shows.
- **Decide how far the built rule goes.** The trees and the stumps are geometry
  (`CONFIG.foliage3d`); the bushes are not, and the bench is the only other prop
  out there. The bushes were built and put back, so that one is answered — read
  the note above before trying it again. The bench is a different shape from
  anything tried so far: flat planks rather than a lumpy ball, so it is closer to
  the furniture's job than to the foliage's, and `furniture.js` already knows how
  to build a thing out of slabs and sticks.
- **Give a distant tree fewer triangles.** One canopy is 30k of them and the
  hull doubles it, which is the whole cost of building them; from orbit a tree
  covers a few dozen pixels and could not tell you if it were a tenth of that.
  A second geometry per drawing at a quarter of `RINGS`/`COLS`, swapped by the
  same horizon cull that already hides them, is the shape of it.
- **Decide whether a tree should stop you.** It does not, and that is the older
  and better rule — but it is the only reason a trunk has to un-draw itself when
  you stand inside it. Making trees solid would delete that special case and cost
  the freedom to walk anywhere, which is the trade to weigh rather than a bug.
- **Try it on a real phone.** Everything so far is verified in desktop
  emulation, and the two things emulation cannot prove are exactly the two that
  matter: the iOS device-orientation permission prompt, and whether pinching
  and the stick actually feel right under a thumb.
- Subset the Japanese webfont. Google Fonts already serves unicode-range
  subsets, and the service worker caches whatever it fetches, so offline works
  after one online visit — a self-hosted subset would just make the first load
  lighter.
- **Draw a landmark that is not a tree.** There are five now and the three new
  ones are the three existing tree drawings at nearly twice the size, which is
  honest but only half the job: a big tree is unmistakably *a landmark* and
  quite easy to mistake for *the other landmark*. One or two distinctive
  silhouettes — a tower, an arch, a signpost, anything not tree-shaped —
  would turn "there is something over there" into "I know where I am". It is
  one drawing plus one line in `CONFIG.landmarks`, and `s` means it does not
  even need a `SPRITE_SIZE` entry if it borrows an existing height.

## Layout

```
index.html            markup, import map, start menu
css/style.css         full-screen mobile layout, speech bubbles, start menu
js/config.js          every tunable number, the palette, and the fish roster
js/cast.js            the three characters as data
js/daylight.js        the four times of day, what each looks like, and the one
                      place that decides which one we are in
js/assets.js          loading the drawn art, before anything is built, and
                      counting it in for the start menu's progress
js/art.js             drawn art framed, everything else painted — the only file
                      that knows what things look like
js/sphere.js          placing and orienting things on a planet
js/foliage.js         trees, stumps and grass as geometry — lumpy canopy, flared
                      trunk, scalloped stump, blades, ink hull
js/lines.js           one Japanese line bank per character
js/character.js       deformable body mesh, spring physics, face parts, billboarding
js/scene.js           sky dome, planet, scenery, per-frame depth sort
js/camera-control.js  360° orbit, pinch dolly, glide-to-focus
js/dialogue.js        line picking and the typewriter
js/main.js            wiring, pointer routing, who-speaks-when, the render loop
serve.py              threaded local dev server (not deployed)
sw.js                 offline cache (skipped on localhost)
```

### The non-obvious things

**Night has to tint the sprites, not just dim the lights.** The globe is the
only lit surface; every character, tree and tuft is `MeshBasicMaterial` and
therefore immune to lighting. Dimming the lights alone left the planet dark
with midday-bright cutouts pasted on it. `setDaylight` multiplies a tint
through every sprite material as well, which is why `Globe` keeps a
`tintables` list and `Character` exposes one.

**Position on the sphere is a unit vector, not latitude and longitude.**
Wandering and walking are both *rotations* of where something stands, which is
one `applyAxisAngle` on a direction vector — whereas nudging lat/lon means
dividing by `cos(lat)` and falling apart near the poles. Characters store
`dir`; the camera converts to lat/lon only at the ends, and clamps latitude
short of the poles because the local east/north frame degenerates there.

**The camera blends continuously; the controls switch hard.** `PlanetCamera`
holds where you stand (lat/lon), which way you face, and how high you are, and
derives position and look target from altitude — so the zoom itself is smooth
all the way from the grass to orbit. What a *swipe* means does not blend,
though. It used to, and the middle of the zoom felt like neither mode: you
could be visibly floating above the ground and still "walk", while a swipe
half-turned your head and half-spun the planet. Now `isFirstPerson` is strict
(landed, target altitude at eye height), and `zoomBy` refuses to leave you
between the ground and `landSnap` — descend past it and you land properly,
climb from the ground and you take off to it.

**Walking never turns the camera.** The pad names a direction and you set off
that way; your view stays exactly where you left it. This app is about looking
at somebody, and sidestepping to frame them better only to have the view swing
away to face your direction of travel fights the very reason you moved. Only a
swipe turns you — or a tap-to-walk, where you explicitly asked to be taken
somewhere and want to arrive facing it.

It took three goes to get here. Steering (stick sideways = turn rate) meant you
could never simply head somewhere: every move was a negotiation with the
camera. Auto-turning toward travel fixed that but replaced it with a camera
that moved on its own — and it needed a captured reference frame to stop the
camera chasing its own input, since "stick is camera-relative" plus "camera
follows the stick" is a feedback loop that spins you on the spot. Dropping
auto-turn removes the loop, so stick directions read against the *live*
heading: "up" always means the way you are looking this instant, and swiping
mid-walk simply curves your path.

Also worth keeping: a head-bob and roll driven by `stepPhase`, and ~260ms of
easing on the throttle. Without those you glide at constant velocity, which
reads as a camera drone rather than legs. The lens also opens `walkFov` degrees
at a run: on a planet whose horizon is 34° below eye level only the bottom
quarter of the screen is ground, and ground sweeping past the edges of the frame
is most of what tells a body it is moving.

**A landmark answers "where am I"; a path answers "which way".** They are
different questions and on this planet the second is much the harder, because
the horizon is 4.8 units off: whatever you set out towards drops behind the
curve within a couple of seconds, and from then on one hillside is exactly as
informative as another. A line on the ground does not go over the horizon,
because it starts under your feet. The network is a minimum spanning tree over
the five landmarks plus the one edge that closes it into a loop, painted into
the ground texture by `paintPaths` — as great-circle arcs, which is also the
line the stick walks, so following a track really is walking straight.

It is stamped along the arc rather than stroked as a polyline, because the
texture squeezes horizontally toward the poles and a stroke has one width in
texels: at the two big trees, 46° up, a stroked path would arrive 1.44 times too
narrow. And it is stamped twice, wide-and-faint under narrow-and-firm — about
eight stamps cover any point at this spacing, so whatever falloff a single stamp
carries is compounded eight times and saturates, and one pass measured as going
from bare grass to full path in a single texel. Two saturating passes give a
shoulder you can actually predict.

**Ground cover is merged, not billboarded.** Standing on the surface wants
hundreds of tufts within a few paces, and hundreds of billboards means hundreds
of draw calls plus hundreds of entries in the per-frame sort. So none of it is a
billboard: the flowers and mushrooms are two quads crossed in an X — those never
vanish edge-on, so they need no turning — merged into one geometry per drawing,
and cut out with `alphaTest` rather than blended so they land in the opaque pass
where the depth buffer sorts them for free.

**The grass is blades**, and is the exception to the paragraph above rather than
an example of it — see `buildGrassBlades` in `foliage.js`. 620 tufts of nine
tapered strips, one merged mesh, no texture at all: the colour is a gradient
baked into the vertices, dark at the root and light at the tip. That is one draw
call against the drawn tufts' five, and about 39k triangles — a bit over half of
one tree.

This sat behind a `CONFIG.grassBlades` flag for a while, with the five drawn
tuft sheets wired up as the other branch so the look could be judged both ways —
the blades are green and read as a lawn, where a scatter of the ink-stroke
drawings reads as dried reeds standing on one. The judgement is made and the
flag is gone. The drawings are archived in `asset/images/legacy/`.

Deleting it was not tidiness. The art had been moved to `legacy/` while the
fallback branch and the asset loader both went on pointing at the old path, and
because `loadArt()` awaits every fetch, five files that were no longer there
turned into a start screen that never became an invitation. A switch you cannot
throw is not an option, it is a landmine — so **retiring art means deleting its
row in `assets.js` and its path in `sw.js` in the same change that moves the
file.**

Two things about it are worth knowing.

**Its greens are picked against the RENDERED ground, not against `#CEE4A4`.**
The globe is the one lit surface here and grass is unlit like everything else,
so the ground's texture value is not the value it arrives at: measured over the
whole planet it renders from `#696E4F` at the terminator to `#B1DB95` in full
sun. A green chosen against the texture would have been chosen against a colour
that is nowhere on screen. Sitting a little under the average is the only place
both ends work — darker than the lawn in sun, which is what grass does to the
ground it stands in, and a shade lighter toward the terminator, which is the
price of being unlit and is a wash.

**The grass is the only thing on the planet that moves in the wind.** A vertex
shader bends each blade along a tangent field — `cross(radial, axis)`, which
follows great circles and dies smoothly at the two ends of the axis, because a
tangent field on a ball has to die somewhere. `aSway` is zero at the root and
one at the tip so a blade bends rather than slides, and each blade carries its
own limberness so a tuft does not move as one object. The whole per-frame cost
is a single uniform write.

That patch and the lamp term come from ONE `onBeforeCompile`, because a material
only has one and setting it twice deletes the first. The lamp's GLSL is hoisted
into constants so the grass's patcher can quote it without sharing a function
body — three.js keys its program cache on `onBeforeCompile.toString()`, which is
what lets every lamplit material share one program and is exactly what would
hand the grass somebody else's shader. Two bodies quoting the same strings get
two programs, which is what is wanted: the count goes 16 to 17.

**The small scenery was tried this way and put back.** This is old history —
back when rocks still existed and the stump was a card — but the reason it
failed is still worth having. Rocks, bushes and stumps went to four merged
crossed-quad meshes instead of 30 cards, and it measured
well — 47 draw calls on foot against 55, genuinely planted props that parallax
as you walk past, and no pop when the old `small` flag used to drop them at 2.2
radii (they cover 1.8% of the sky-view screen, so that pop was visible). It was
reverted anyway, on the look: `alphaTest` cuts a drawing out at the halfway
point, and art drawn with a soft outline for a blended card goes hard-edged
under it. Crossing a drawing with itself also asks it to read the same from
every bearing, which is true of a tuft of grass and less true of a bush someone
drew a front for. If it is ever tried again, that is the order to do it in: the
drawings first, the geometry second.

The counts are deliberately lopsided, because counts do not compare across
kinds: a flower drawing is a solid blob of colour filling a third of its sheet,
a grass tuft is a few strokes with daylight between them, and matching their
numbers made a flowerbed with some grass in it. At these figures a typical
standing spot has about 26 grass, 7 flowers and 2 mushrooms inside its horizon
— and some spots have no mushroom at all, which is what makes spotting one
worth a word.

**The flat flowers were the one thing that lay down** — one quad per cluster,
tangent to the surface, spun to a random angle so six drawings did not read as a
print pattern — and they are gone. Their job split in two and neither half needs
a decal: the surface prints its own blooms now at every distance (`fieldBloom`),
and up close the standing flowers and the grass blades carry it.

They are worth a paragraph anyway, because what they cost is why nothing else
lies down. A decal blends, which drops it into the transparent pass — they sat
at `renderOrder -1`, under the shadows, so a shadow falling across a patch
darkened it rather than vanishing — and it needs `polygonOffset`, because a
decal a few centimetres above a curved surface is the case the depth buffer
handles worst. They also had to **dodge the lamp term**, alone among the ground
cover: lying at R+0.04 under a light pool at R+0.05, they would have been lit
twice. Painted into the surface instead, they are lit exactly once, by the pool
lying on them, and the special case went with them. That pair of costs is
exactly why the *grass* stands: laid flat it would pay both for a thing that is
not flat in life anyway.

**Ground cover is placed at random, and that is the point.** It used to sit on
a golden-angle spiral — the standard way to spread N points evenly over a
sphere — and *evenly* was the whole problem: grass grows in clumps with bare
ground between them, while a spiral lays out a woven mat, and a lattice is one
of those things you cannot stop seeing once you have seen it. Measured on the
current 320 tufts, nearest-neighbour distance runs from 0.05 to 2.28 units
around a median of 0.75; the spiral gave every single one 1.70.

Two things that follow from it. The generator is seeded (`WORLD_SEED`), so the
planet reassembles identically on every visit — it would undercut a place that
remembers when you last came if the grass rearranged itself behind your back.
And placement resamples off ground that is already spoken for — the lakes, so
nothing sprouts in the water (verified at zero clumps wet), which makes
`CONFIG.lakes` its fourth reader; and the footprint of each landmark, so nothing
sprouts inside a building.

That second rule was late, and the bug it fixes is the one to remember when you
add a landmark: the props are laid out by `scatter()` on its own spiral and the
landmarks are appended to the result, but ground cover is a random scatter over
the whole sphere and has no idea a house is there. Before it, the house had a
flower standing 0.50 units from its centre — in the doorway — and a white
cluster at 0.18, under the floor. Each landmark now clears its own *drawn*
width, taken from the art's alpha bounds rather than the canvas, so a redrawn
house clears whatever it now covers and nothing is written down twice.

Rejecting a sample consumes another, so adding that rule reshuffled every tuft
on the planet. That is fine and worth knowing: only ground cover moves, since
`scatter()` never touches this generator, and the totals are unchanged.

**Billboards stand on the planet and swing about their own normal.** A card's
up axis is the surface normal, full stop — nothing standing on a planet should
lean for where you are looking, and every scheme that derived up from the view
leaked the look pitch into the world (cards reclining 17° at the resting gaze
and nodding live under your thumb). What is left is the swing about that
normal, and it comes from one of two places depending on what the card is.

**Scenery squares to your view axis; the cast squares to its own ray.** That
split is the fix for a world that felt like it was watching you. A ray facing
tracks your *position*: turning your head moved nothing, because position is
blind to yaw, but every step of a stroll re-aimed every card in reach by its
own amount — measured at 28.7° on a tree 3.2 units off, across a sidestep in
which the gaze itself turned 0°. So walking past a bush read as the bush
turning to watch you go. The view axis is blind to translation instead, which
is the opposite trade and the right way round: the same walk now moves those
cards 3.4–7.4°, while a 46.4° turn of the head re-aims them 43.3°. A swing that
only happens while your own gaze is already sweeping is one the eye cannot
catch, because the card stays face-on throughout and there is no silhouette
change to catch it by.

Squaring to the view was rejected here for years on the grounds that panning
past a tree would foreshorten it to a slat, and that turns out to be exactly
backwards. A view-squared card has its width axis parallel to the image plane,
and a plane parallel to the image plane projects at one scale everywhere on
screen — the obliqueness at the edge of the frame and the perspective stretch
at the edge of the frame are the same quantity pulling opposite ways. Measured
by sweeping a tree 6.9 units off right across the frame: **200.8px wide at the
middle, 201.4px at screen x 0.97**, a spread of 0.3%. It is the *ray* facing
that cannot hold that, since its width axis tips out of the image plane by the
object's own off-axis angle.

The cast is the deliberate exception. Somebody who stays turned to you as you
circle them is eye contact, and is the point of them; it was the furniture
doing it that read as staged. They keep the per-object ray, and with it the
honest foreshortening when your eye is genuinely above someone — a cue
screen-square cards could never give.

The one degeneracy: looked at straight down its own length, a signpost card is
edge-on. The rescue blends its up toward the camera's up (and pushes it off the
ground by `standoff`, half its height, along the ray — the shift that cannot
move it on screen). What gates the rescue is the part that keeps getting
relearned: it keys on the ray from the card's **centre** — base plus half
height — with a **signed** dot, so it opens only when your eye is above the
card's middle. Keyed on the base ray, standing 0.4 from a 4.8-unit tree read as
"looking down it" (the base ray runs 0.96 down the normal from an eye 1.7 up)
and the tree lay over 64°. Keyed unsigned, hugging the trunk and looking up
opened it from below and leaned the tree 41° down over you. Signed-from-centre,
the tree stands at 0° from 4 units to 0.15, at every look pitch — while the
flower your eye truly sits over still lies back (79.9°) instead of going
sliver, and the far view straight overhead still gets the full rescue and its
2.41-unit lift.

**Nothing fades; the depth buffer does the hiding.** Characters and scenery use
identical materials — depth tested, depth-write off, sorted back to front — so
the planet occludes a character exactly as it occludes a tree, and both sink
behind the curve rather than dissolving. The per-frame visibility test is only
a cull and a flag for "may this one speak"; it is kept generous so it never
clips somebody still on screen. This was not always possible: while characters
could be stretched, depth testing sliced a pulled chin off along a hard ground
line, which forced them onto a fade instead. Removing the stretch removed the
constraint.

**Sprite order is rebuilt every frame.** `sortSprites()` re-sorts everything
back-to-front from the camera and hands out `renderOrder` bands. Without it a
far character paints over a near one.

**The sky belongs to you, not to the world.** Both domes, the starfield and the
sun and moon cards live in one group, `Globe.skyRig`, and `_aimSky` turns it
every frame so its axis is whatever you are stood on — the rig's `anchor`, which
is the point of the planet you are above rather than the camera's own direction,
since that swings back off the overhead line as you rise.

This is the only honest way to have a sky on a planet 8 units across. A real one
does not shift as you walk because it is effectively infinitely far away; this
dome is 180 units, barely twenty planets, so walking a quarter of the way round
used to take the sun with it. Measured from 24 spots spread over the globe, the
moon's height above the local horizon ranged from **77° below to 86° above** —
under the ground at seven of them. It is now **6.33° at every one of the 24, a
spread of zero**. (That figure was 38.2° when it was first measured, because the
moon then hung at texel 140; moving it down to 238 is what changed the value.
The spread is the claim, and the spread is still nothing.)

The gradient was off in the same way and less obviously. `paintSky` runs
`skyTop` → `skyMid` → `skyLow` down the texture, which is top-to-bottom of the
*dome*, so the specified sky colour was only overhead if you happened to be
standing at the dome's pole. Looking straight up from 12 spots gave 12 different
colours, from `0,47,77` to `7,97,141` — the pale horizon band, over your head.
It now gives `#002944` from all 12, which is the night `skyTop` as written down.

**Nudged, not rebuilt.** `_aimSky` turns the sky from where its axis already
points to where it belongs, rather than computing the whole orientation from the
anchor each frame. That is not a micro-optimisation, it is the only thing that
works everywhere. Any recipe taking the anchor alone has to invent the twist
about that axis, and no choice of twist is continuous over a whole sphere — it
always tears somewhere. Building it out of lat/lon puts the tear at the poles,
which was safe while the rig clamped you 7° short of them; that clamp is gone,
and crossing the pole was measured snapping the sky **180° in a single step**
where the walk itself moved 1°.

Turning the axis from where it is to where it belongs has no such choice to
make. The step is a fraction of a degree, so the shortest arc between the two is
always well conditioned, and it carries the twist along rather than inventing
it. That is parallel transport, and it holds 1° of sky per 1° of walking
straight over the pole. Reading the current axis back out of the quaternion
instead of caching last frame's anchor also makes it self-correcting: drift is
measured and removed every frame, so your zenith stays your zenith.

The price is that the sky's bearing depends on the path walked rather than only
on where you ended up — stroll a loop and the sun comes back over the other
shoulder. That is real geometry, not a glitch, and it is invisible in kind:
height is what the eye notices and height is exactly what this holds fixed.
Because the aim is incremental, `update` must run every frame; a skipped frame
is a frame the sky did not follow you through.

**`discAt[1]` therefore now means one thing everywhere: how high in *your* sky.**
The scale, before nudging it: design height is 512 over a half turn, so a pixel
is about a third of a degree and 256 is level with your eye. The ground cuts
everything past about **354**, because the horizon on a planet this small sits
34.4° below level, and the resting view tops out at about **222**, because the
gaze rests 17.2° down through a 62° lens. Smaller than that and you only find it
by swiping up — which is where the moon used to be, at 140.

**The moon sits at 238**, 6.4 degrees above your eye, which puts it between a
tenth and just over a quarter of the way down the screen with its whole glow in
frame, measured from eight spots spread over the globe — and 40.8° clear of the
horizon, so it reads as sky rather than as something resting on the hill. The
sun is left high at morning and noon, where being overhead is the point, and
evening's is already down at 8.4°.

Those three numbers were written down as 3°, 37° and 5.2°, which no arithmetic
here produces. `asin(cos(238/512 · π))` is 6.33°, the rendered card measures
6.33° from all 24 spots, and the drawn moon's own centre sits 0.04° off the
card's — so there is nowhere for a factor of two to hide. One thing that comes with a low moon: it meets the treetops. At
one of those eight spots a tree stood squarely in front of it — the moon drew
zero pixels until the scenery was hidden, then 55,539 of them. That is a tree
doing its job, and a step in any direction clears it.

**The sky texture skips mipmaps.** It is stretched over a dome 180 units across,
so it is always hugely magnified, and sampling from the base image is both
sharper and cheaper. Enabling mipmaps and 16× anisotropy was measured making no
visible difference at all, so it stays off.

**It is painted at twice its design size.** `SKY_DESIGN` is 1024×512 and
`SKY_SCALE` is 2, so the texture is 2048×1024. Everything in `paintSky` is laid
out in design space and multiplied up, and `daylight.js` gives `discAt` and
`discR` in design space too, which `scene.js` reads the same way when placing the
sun card. That is the point of the split: doubling `SKY_SCALE` sharpened the sky
and moved the sun by nothing at all — measured at zero offset from its halo,
same 13.36° across, same 37.3° up.

**The stars are not in that texture.** They are `THREE.Points` on a shell at 176
units, built in `Globe._buildStars`, and the reason is the one thing an
equirectangular map cannot do. It converges at its poles, so a round dot painted
near one arrives as a capsule. That is cancellable — draw it exactly
`1/sin(latitude)` wider — and the correction is right and still does not work: it
needs a finely tessellated dome to survive UV interpolation and good filtering to
survive minification, and it collapses entirely within a degree of the axis.
Measured on the rendered frame, one painted star in twenty came out at least
twice as wide as it was tall, the worst at **6:1**. The default view looks
straight up the dome's axis, so that was the middle of the screen.

A point sprite has no geometry to fight: it is a camera-facing square of a fixed
number of *screen* pixels, cut into a circle by its texture, identical wherever
it sits. The same measurement over point sprites gives a **median aspect of 1.00
at every distance from the pole, a worst case of 1.75, and nothing at all at 2:1
or wider** — and the 1.75 is bounding-box quantisation on a three-pixel dot, not
elongation.

Three `Points` objects, because one `PointsMaterial` has one size: 14,000 at 5px,
4,600 at 8px, 640 at 15px, with per-vertex brightness so a size does not read as
one stamped-out kind of star. Additively blended, `sizeAttenuation` off.
Positions are uniform over the *sphere* — `acos(1 - 2r)`, not a flat pick — and
seeded, so they are the same constellations every night. Three draw calls at
night and none by day, since the group hides itself at zero opacity.

They need `depthTest: true` for the same reason the fading dome does: being
transparent puts them in the pass after every opaque thing, so `renderOrder`
alone will not keep them behind the planet. Without it they paint over the
ground.

**The star sprite must not mipmap, and this was a real bug for a long time.**
`starStamp()` is 64px square and every star drawn from it is 5 to 15px, so unlike
the sky dome — which has the opposite problem, magnification, and is handled by
`skyTexFrom` — these are heavily *minified*, which is exactly when mipmapping
engages. The levels it builds average the stamp's bright centre together with its
transparent surround, so a 5px sprite sampling a 4×4 level has almost no star
left in it.

It never looked broken, which is why it survived: stars did not vanish, they just
came out as dim smudges spread over more pixels than they should cover. Measured
off rendered frames, peak star brightness against the night sky was **46/255 with
mipmaps and 213/255 without** — the field was rendering at about a fifth of the
brightness the numbers ask for.

**The counts are 19,240, up from 7,360.** Fixing the mipmapping made every star
brighter but no more numerous: measured over the sky at the resting gaze, the old
counts cover **17.2%** of it against **40.6%** now. Both changes were needed and
neither would have done alone — brighter stars thinly scattered still read as a
thin scattering. The 20:7:1 ratio between the tiers is unchanged, because that
part was always right.

**The per-tier brightnesses had to come down with it.** They were `0.30/0.35`,
`0.45/0.40` and `0.70/0.30`, tuned by eye against a field rendering at a fifth of
its brightness — so they were silently carrying a 5× correction for the mipmap
bug. With that gone, all three tiers measured a peak of 255/255, and every tier
saturating means every tier looking alike: the sizes still differed but the
brightness hierarchy, which is most of what separates a starry sky from static,
was flat. They now measure **160 / 219 / 243** on screen, and the sky reads as
about 68 bright anchors over 700-odd fainter stars rather than a wall of white.

**A `Group`'s `renderOrder` is not a nudge, it is a separate key.** It becomes
its children's *groupOrder*, and the sort compares that before it ever looks at
`renderOrder` — so putting `-11.5` on the group holding the stars did not slot
them between the backdrop at `-12` and the dome fading in at `-11`. It put them
ahead of every direct child of `skyRig`, all of which inherit `skyRig`'s own
zero, whatever their own numbers said.

The dome fading in then painted over the whole field, which made the one moment
the stars are meant to arrive the one moment they are missing. Measured through
a noon-to-night change, star brightness ran 16% of settled at the midpoint,
**exactly zero at 97%**, and the entire sky appeared in the single frame the
fade landed — a pop, where the cross-fade exists to avoid one. The ordering
lives on each `Points` now, at `-10.5`: after both domes so the field rides on
whichever sky is showing, before the sun and moon cards at `-9` so the moon
still passes in front. Same measurement after: 50% at the midpoint, 99.7% at
97%, and nothing to see when it lands.

**They twinkle on the GPU.** `Globe._twinkle` patches the stock points shader
through `onBeforeCompile`: every star carries its own phase and speed as a `tw`
attribute, and the only thing that changes per frame is one clock uniform.
Rewriting nineteen thousand colours on the CPU every frame would be sixty-odd
thousand floats reuploaded for what is one sine wave. It multiplies `vColor`, so
the twinkle rides on top of the per-star brightness instead of flattening it,
and since the blending is additive, brightness *is* how much of the star reaches
the eye — there is no separate alpha to keep in step.

The swing is ±20% for dust, ±15% for ordinary, ±9% for the bright few: small
stars move most, because a point of dust winking reads as a live sky whereas the
big anchors wobbling makes the whole thing restless. Measured over a frame pair
1.4s apart, 99% of star pixels change, mean 9% of full scale and peak 23%. The
per-frame work is skipped entirely by day, when the field is not drawn at all.

**The start menu cannot be decorated with the art it is waiting for.** It is on
screen precisely for as long as `loadArt()` has not finished, so anything in
`IMG` is by definition not available to it. What it may use is a file the
browser fetches on its own account, outside the awaited batch — which is what
both `bg-menu.webp` and the car on the loading road are. Which of the three cars
it is gets picked by two lines of classic script in `index.html`, not by
`main.js`. A module does not run until three.js and every other import has been
fetched and evaluated, and that wait is exactly what the car is there to cover;
asking for it from `main.js` would put it on screen after the thing it was
covering had already happened.

**The menu's layout is blocked around where its background is busy.** Measured
off `bg-menu.png` as a fraction of its height: flat sky to 0.30, then the hills,
the tree and the little house from 0.36 to 0.54, open grass from 0.55 to 0.78,
and the three of them standing in it from 0.79 down. So the title sits in the
sky, the middle third is deliberately empty, the road crosses the meadow — the
car drives past above their heads — and the button drops into the one gap
through the bottom band, which runs from 0.34 to 0.70 sideways. That last
measurement is why the foot is pushed up in `vw` rather than `rem`: the drawing
is fitted to the *width* and hung from the bottom, so every band in it sits a
fixed multiple of the viewport width above the bottom edge, whatever the height.

**Fitting the width rather than covering.** The drawing is 9:16 and a phone is
nearer 9:19.5, so `background-size: cover` would trim about a ninth off each
side — and Chiikawa runs to its very left edge while Usagi runs to the right, so
both would lose a face. Fitting the width costs height instead, and the top of
the drawing is flat sky, so `background-color` sampled from its own top row
(`#A5DBF4`, uniform across it) carries on upward with no seam. On a screen wide
enough for the reverse, surplus sky crops off the top and the cast stays put.

**It ships as WebP because it is the loading screen.** The source PNG is 1.4MB,
which on a cold connection is several seconds of blank sky on the one screen
whose entire job is to have something to look at — the problem it exists to
hide. Flat cel-shaded art palettises and compresses extremely well: the same
drawing at quality 88 is 62KB, median per-channel error 1 in 255. The PNG stays
in `asset/images/` as the source; `sw.js` and the stylesheet reference the WebP.

**The car and its trail are anchored differently on purpose.** The drawing faces
left, so it drives right to left: `--p` runs 0 at the right-hand kerb to 1 at
the left, and the car's own width comes out of the journey so that neither end
of the drive hangs off the road. The trail behind it cannot use that same
formula, though — anchored to the car it would be a visible stub at 0% and leave
a car-length of bare road at 100%. So it is anchored to the kerb the car set off
from and simply runs `--p` of the full width. The two land dead on each other at
halfway and drift by at most half a car at the ends, which is where the car's
own body is sitting on top of the join anyway. Both come off one custom
property, so the position and the length can never disagree, and the easing is a
CSS transition rather than anything counted in JS.

## Dragging the day

The scrubber is not a second mechanism. It is the cross-fade above with a finger
where the clock would be: `blend.t` was already a continuous parameter between
two `LOOK` entries, so all a drag has to decide is *which pair* is hung on the
two domes and *how far between them* you are. Everything downstream — lights,
tint, clear colour, the sun's position, the stars coming up — is the code that
was already there. That is why it was cheap, and why the sky moves under your
thumb rather than snapping between four states.

`Globe.scrubDaylight(pos)` takes a position along `PHASES`, 0 to 3.
`_setSegment` swaps the two sky textures, but only when the finger crosses from
one pair into the next — reassigning a map with `needsUpdate` on every
`pointermove` would re-upload eight megabytes a frame.

**`goal` is why a release can fall backwards.** `blend.t` is where the world is
and `blend.goal` is where it is heading, and they are separate so that letting go
a third of the way into night settles *back* to evening. The old code stepped `t`
toward 1 and nothing else, and "settled" meant `t >= 1` — which a scrub that
rested at 0 would have failed. `settling` is now `t !== goal`.

**A press is not yet a drag.** Tapping the far end of the track and having the
sky cut straight to it would throw away the whole reason the cross-fade exists,
so `pointerdown` scrubs nothing. Past 3px of movement the finger takes hold; a
release without that movement is a tap, and fades like the clock would. A
release from a real drag settles over 260ms, linear rather than eased, because
it is finishing a movement your hand already made.

**The knob is driven by the world, not the pointer.** Every frame it reads
`globe.dayPos` — the blend's own position, interpolated between whichever two
hours it holds — so the sun on the track and the sun in the sky cannot come
apart. Press `じどう` and the knob slides over on its own.

**The track is painted from `LOOK`.** Each phase carries a `swatch`, and the
gradient is built from them at startup, so the strip under your thumb is a
picture of the sky it is dragging you towards and cannot drift from it. The
swatches are not simply `skyTop`: those colours are chosen to sit behind a whole
screen, and in a band 14px tall the palest of them are indistinguishable —
morning and noon would be two greys.

Three things have to agree about the knob's diameter: where it can stand, where
the colour stops sit, and where the labels go. The stylesheet names it (`--knob`,
`--track-border`) and `main.js` reads it back off the element. The border term is
not decoration — an absolutely positioned `left: %` resolves against the track's
*padding* box while the labels sit in a sibling a full border-box wide, so
without it the two ends disagree by exactly the border width. Measured after: all
four stops align to 0.0px, and a pointer at each label scrubs to exactly 0, 1, 2
and 3.
