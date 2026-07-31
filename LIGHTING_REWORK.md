# Lighting rework — the universal disc model

Decided 2026-07-29, against the cave dinnertime reference frame. This document is
the implementation contract: the target model, what stays, what retires, and a
migration order in which every phase is verifiable before the next begins.

## The model in one sentence

Every lamp is a sphere of restore-toward-daylight with a plateau-and-rim
profile, masked by which side of a wall it is on, over one shared dark —
**surfaces restore toward a light's target; emitters add.**

## Why (short form)

The reference is made of flat cel art, a dark multiply layer, soft-edged holes
cut where light reaches, and additive glows on the emitters themselves. The
current system approximates this with additive warm light, which cannot return
a surface to its own colour (blue art drifts to beige), and with glow-dome
falloffs, which read as gloom-with-halos rather than a circle of light. The
rework replaces the *model*; the tuned palette values survive.

Two prior decisions folded in:

- No indoor/outdoor duality. One light model everywhere; a wall is just a
  surface near the lamp. A light in a room lights its circle, not the room.
- No physics upgrades. No shadow maps, no inverse-square, no screen-space
  compositing, no post grading. The reference has none of them.

## The math

Per fragment, on every lit surface:

```
t_i   = (distance(frag, lampAt_i) - inner_i) / reach_i
disc(t) = 1 - smoothstep(PLATEAU, 1.0, t)          // PLATEAU ≈ 0.62, defined ONCE
k_i   = level_i * sameSide_i * disc(t_i)
K     = clamp(Σ k_i, 0.0, 1.0)                      // overlap can never pass white
T     = Σ (k_i * target_i) / Σ k_i                  // guarded when Σ k_i > 0
colour = art * mix(dark, T, K)
```

- `dark` — the hour's multiply for this fragment's side: LOOK `tint` outdoors,
  LOOK `tintIn` indoors. Both tables KEEP their tuned values; only the
  application moves from CPU (`material.color`) into the shader as two shared
  uniforms (`uDarkOut`, `uDarkIn`).
- `sameSide` — the mask the cast already use (scene.js:2067):
  `mix(1.0 - uLampIn[i], uLampIn[i], side)`. Static surfaces bake `side` at
  patch time (0 outdoors, 1 interior); movable things (cast, loose, hand) keep
  a live per-material side uniform, written where `_syncLoose`/`_castSide`
  already write it. No per-home ids: the homes are far enough apart that reach
  separates them, exactly as it does today.
- `target_i` — per-light restore target, barely warm for the lantern,
  neutral for the bulb, warm for the house's window spill. Replaces the single
  `uLampTint`/`LAMP_COLOR`.
- `inner_i` — stays; nonzero only for the house-as-emitter (spill measured
  from the wall) exactly as today.
- No facing term in the restore. The disc ignores orientation (the frame's
  circle climbs the wall uniformly). The half-lambert² machinery goes. The sun
  keeps its own facing term untouched — it must agree with the globe's real
  terminator.
- At noon `dark` is white and `T` is near-white, so `mix` barely moves:
  lamps self-disable by day with no gating. `LAMP_ONSET` survives only as
  switch timing (when wired lights come on), not as double-exposure protection.

**Emitters still add:** lamp glass (`emits`), halos, blooms, the sun/moon disc,
stars, water glints. The pool decals are the one additive family that retires
(replaced by the restore term landing on the floor/ground itself).

## What stays (do not touch)

| System | Where | Note |
|---|---|---|
| LOOK table + phases + hand clock + scrubber | daylight.js | tint/tintIn keep tuned values |
| Sky domes, discs, stars, haze, clear colour | scene.js `_applyBlend`, `_buildStars` | |
| Sun/moon directional + facing add | scene.js:1458–1460, `SUN_ADD` :2004, `SUN_LIT` :582 | |
| Water | water.js `waterHour` :879 | own model, correct |
| Lit sheet (houseNight crossfade) | `_syncGlow` :5442, `_syncHouseLit` :5476 | exterior art, not lighting |
| Blooms on openings | `LAMP_BLOOM` :548, `_syncBloom` :5589, `litSpot` art.js:1601 | light in the air = emitter |
| Switch model | `_burn` :5007, itemLights/roomLights, `manual/on/night`, `LAMP_ONSET` :692, `_eveningWas` handback | occupancy becomes switch policy ONLY |
| Cast cheat | `CAST_LIFT` :658 | both values; revisit merging in polish |
| Painted contact shadows under props | paintShadow | the anime's grounding; not lighting |
| House-as-emitter slots | `NIGHT_ART` props → lampProps :1718, `uLampInner` | models light escaping openings |

## What retires

| Mechanism | Where | Replaced by |
|---|---|---|
| Additive lamp loops (cards + room + sun's embedded copy) | `lampLoop` :1856, `LAMP_ADD` :1868, `ROOM_ADD` :1941, `CAST_ADD` :2064, `LOOSE_ADD` :2090 | one restore loop |
| Facing machinery | `uLampFace`, half-lambert², `ROOM_CARRY` normals for lamps | dropped (sun keeps its own) |
| Falloff exponents | `uLampFall`, `LAMP_FALL` 2.4 :566, `ROOM_LIT.falloff` 2.0 :633 | one `PLATEAU` in light-model.js |
| Strength duality | `LAMP_LIT` :555, `ROOM_LIT.strength` :633 | per-light `level` |
| Single lamp colour | `uLampTint`, `LAMP_COLOR` :567 (+ PAL.lampGlow pairing) | `uLampTarget[N]` |
| Indoor pool + contact decals | pool/contact build :3759–3826, `ROOM_POOL` :676, `paintItemGlow` foot hole | restore term on the floor itself |
| Floor's no-lamp exception | :3591 | floor patched like every surface |
| House skin's lamp opt-out | `litBySun(skin, 0)` :3283 | skin side=0, takes outdoor discs → circle on the wall outside |
| CPU tint writes | tintables loop :4785, interiorTintables loop :5158–5171 | uDarkOut/uDarkIn uniforms |
| Occupancy lean | `#5A5450` lerp :5155–5157 | deleted — dark room = lamps off |
| Room-dial-as-light-input | `_lamps` strongest-of-homes as brightness | `_lamps` survives only for lit sheet/glow/bloom timing |

When a mechanism goes, its comment essays go with it — half the value of the
rework is deleting the notes that only existed to keep the couplings alive.

## New module boundaries

- **js/light-model.js** (new): `PLATEAU`, `disc(t)` in JS, the GLSL snippet
  builder for the restore loop, and profile-parameterised stamp painting hooks
  so any surviving painted stamp (house spill until Phase 5) is generated from
  the same curve the shader evaluates. One source of truth for the profile.
- **js/light-state.js** (new, Phase 4): `computeLightState(inputs) → state`
  (pure) and the scene-side `applyLightState(state)` writer.
- **daylight.js**: unchanged role (time + palette).
- **scene.js**: sheds the three patcher families for one `litSurface(mat,
  {side, dark})`; sheds the pool builders in Phase 2/5.
- **furniture.js**: `glow` spec becomes `{ reach, level, target }` per light.
- **config.js**: `CONFIG.light = { plateau: 0.62 }`; targets live with the
  furniture/emitter specs.

## Migration order

Each phase states its expected visual diff. "Zero" phases are verified with
the rig; "deliberate" phases are verified against the reference frame and the
acceptance list. Do not start a phase with the previous one unverified.

### Phase 0 — golden snapshot rig — **DONE**

`goldens.html` + `js/goldens.js` (a page of its own, at the repo root because
the art loads from a document-relative path) and `dev/compare.py`. Six stations
× four phases into one labelled contact sheet; `serve.py` gained a `POST /save`
so a sheet lands in `goldens/` where the differ looks.

    python serve.py                 # then open /goldens.html
    python dev/compare.py goldens/before.png goldens/after.png

**Accepted:** 24/24 tiles byte-identical across two independent page loads
(mean delta 0.000, max 0). The differ was itself checked against a deliberately
tampered sheet — a 2-level nudge over a 40×40 patch — and localised it to the
right tile and exited 1.

Three sources of drift were found and dealt with; each is worth knowing,
because the first two are properties of the app rather than of the rig:

1. **The sky rig is oriented incrementally.** `_aimSky` premultiplies the
   minimal rotation from the dome's current up to the anchor, which says
   nothing about the spin *about* that up — so the sky's bearing is a running
   total of every step the camera has taken, not a function of where it is.
   Right for the app (a re-derived bearing would swing every frame); fatal for
   a rig that teleports. The signature was unmistakable: the four indoor tiles
   stable, every outdoor tile different on every run, because a room cannot
   see the sky. The rig resets `skyRig.quaternion` to identity before each
   pose, after which the warm-up lands it in the same place every time.
2. **The shoal is unseeded.** `FishSchool` deals twelve fish out with
   `Math.random()` at construction. Only the pond tiles were affected, and they
   drifted across reloads while the other twenty matched. The rig removes the
   school outright (hiding is not enough — `update()`'s guard is on the school
   existing).
3. **The lanterns start switched off.** `night: false, on: false` — a lantern
   is lit by hand, so at night the only lamp burning in the world was the
   house's wired bulb and the cave was photographed cold. Not a determinism
   bug, but it meant the reference shot was not on the sheet at all. The rig
   lights the hand-lit ones and leaves the wired bulb to the hour.

Two things the sheet already shows, before a line of the rework is written:
the night interiors are a broad even wash floor-to-wall with no edge anywhere,
and `uLampLevel` at night reads `[0.24, 0.24, 0.72, 0.72, 0.72]` — the two
outdoor emitters at `LAMP_LIT.strength` and the three room lights at
`ROOM_LIT.strength`, exactly the two constants Phase 2 retires.

Note for later phases: the rig pins occupancy to 1 and lights the lanterns, so
a change to *switch policy* will move tiles for reasons that are not about
light. Change the rig's setup deliberately and recapture the baseline when
that happens.

### Phase 1 — dark tint into the shader (zero diff) — **DONE**

`Globe._installHourTint()` (scene.js, called last in the constructor) walks
`tintables` and `interiorTintables` and, for each material, sets `color` back
to its base (white outdoors, `userData.baseColor` indoors) and injects
`diffuseColor.rgb *= uDark;` after `#include <color_fragment>`. `_applyBlend`
and `_syncInterior` now write `darkOut.value` / `darkIn.value` — two shared
uniform objects — instead of looping every material in the world.

**Accepted:** 1 pixel of 3,151,260 differs, by 1 level of 255. That is the
float noise floor, not a behaviour change: the CPU used to multiply
`base × dark` in float64 and upload the product, and the GPU now multiplies two
uploaded float32 uniforms, so one pixel fell the other side of a rounding
boundary. Determinism re-verified after the change (no tile moved between two
independent runs).

Three things worth carrying forward:

- **It had to WRAP, not patch.** three.js allows one `onBeforeCompile` per
  material and several of these already carry the lamp or the sun term, so the
  hour composes over whatever is there. That is also why it is one central pass
  at the end of the constructor rather than an edit at twenty build sites:
  only there is it known what a material already is.
- **`customProgramCacheKey` is load-bearing.** three keys program sharing on
  `onBeforeCompile.toString()`, and every wrapper made by one function has the
  same source — so without an explicit key the grass, the trees and the walls
  would all hash alike and three would hand some of them the wrong shader. The
  key is `hour:<out|in>|<the previous patcher's source>`, built once per
  material rather than per call. Verified: 145 materials over 7 distinct keys,
  one per underlying patcher family (lamp 52, sun 9, room 36, bare-out 25,
  bare-in 21, grass 1) plus the one unwrapped exception.
- **Anything with a second writer stays on the CPU**, because a shared uniform
  would multiply on top of what the other writer just decided. Two cases: a
  lamp's glass (its colour is the dark lerped toward white by `emits`, which is
  per-lamp and moves with a switch) keeps its loop, now `_hourGlass`; and the
  hand came OFF `tintables` altogether, since `_syncHeld` writes it every frame
  with the doorway blend. Verified after the change: the hand reads `#75819C`
  on the grass and `#5C626B` under the roof, matching `tint` and `tintIn`.

The cast and loose pieces were already on their own lists and their own
per-object writes, so they needed no change — and they are the two that Phase 3
brings across.

### Phase 2 — the disc, indoors (deliberate: the frame) — **DONE**

`js/light-model.js` is new and owns the model: `PLATEAU`, `disc(t)` in JS,
`restoreGLSL(n, mask)` and `RESTORE_APPLY`. `_installHourTint`'s interior half
now emits the restore loop instead of a flat multiply, so **every** interior
surface — floor included — takes the same disc from the same lamp.

**Accepted**, each measured rather than eyeballed:

| criterion | result |
|---|---|
| circle with a rim, not a gradient | yes — clearest on the house wall |
| circle climbs the wall behind the lamp | yes |
| far side of the room untouched | yes, once the pool bug below was fixed |
| a coloured surface in the circle keeps its hue | hue drift ≤ 3°; red channel identical to noon |
| overlaps don't blow out | 0 pure-white pixels of 120,000 |
| a switch removes its circle and nothing else | 26–66% of the tile, monotonically darker, reversible |
| daytime is a no-op | **provably**: silencing `uLampK` at noon is pixel-identical |

Determinism re-verified; `pond` and `sky` moved 0.000 — the change is confined
to interiors and the buildings.

Retired: `ROOM_ADD`/`litByRoom` (and `uLampFace` with them — a disc has no
facing to flip), the indoor `pool` and `contact` decals, `ROOM_POOL`,
`_syncPerch`, the floor's exemption from the lamp term, and the occupancy lean.
`ROOM_LIT` and `uLampLevel` **survive on purpose**: the cast and loose pieces
are still additive until Phase 3, and they read them. `uLampK` (coverage, 0–1)
and `uLampTarget[N]` run alongside until then.

Four things worth carrying forward:

1. **`max()` is load-bearing, not a safety rail.** Restoring toward a warm
   near-white makes a surface *darker* at noon, where the hour's own multiply is
   pure white — a lit lantern was measured taking a sunlit floor down by 121
   levels, a lamp casting shade. Clamping the result at the dark says the thing
   that was actually meant (a lamp takes dark away and can never add any) and is
   what makes the self-disable property exactly true instead of nearly true.
2. **The buildings' own glow patch was flooding their rooms.** `paintLampGlow`
   drew the middle of the stamp *solid*, on the stated reasoning that a building
   covers it — which is true from outside and false once you can walk in. The
   patch sits at lift 0.05 and a room's floor is a cap at 0.012, so an additive
   disc the width of the whole building lay over the boards at every hour the
   windows were lit. Invisible while the room had a brightness of its own;
   the first thing on screen against a genuinely dark one. The hole is now a
   hole, which nothing outside can tell.
3. **Reaches went DOWN, not up** — lantern 10→7 heights, bulb 4.6→2.9. Under a
   falloff, reach is how far a hint of light carries and more is safer; under a
   disc it is the radius of the circle, and a circle that reaches every corner
   is a lit room with no circle in it. The old notes argued for growing these to
   stop the walls "holding their gloom to the skirting" — that gloom is what the
   reference frame is mostly made of.
4. **Daytime interiors do change**, by ~2–4 mean, and every changed pixel at
   morning and noon is *darker*, none brighter. That is exactly the retired
   additive stamps: lamps used to add light in broad daylight. The restore
   contributes nothing there, which is the property proven above.

### Phase 3 — one world (deliberate: outdoors at night) — **DONE**

Four additive patchers (`litByLamp`, `litByRoom`, `litByCast`, `litByLoose`)
collapse into one method, `Globe._wearHour(m, {dark, mask, side, lift, self})`.
Every unlit-and-drawn surface in the world goes through it — grass, cards,
walls, floors, furniture, the cast, a bear set down, the thing in your hand —
differing only in which dark it is lifted out of and which lamps it may see.
Verified: **168 materials on one patcher**, tagged out (83), in (57), loose
(14), cast (6), skin (4), hand (1), with exactly 3 unpatched — the lamp glasses
that keep their CPU write.

**Accepted:** every daytime tile 0.000 except two at max 4 levels (float noise
from the cast and loose moving off CPU writes); `doorstep`/`house-outside` at
night byte-identical to Phase 2; determinism re-verified; 26 programs, zero
compile failures. The carried-lantern case has no station, so it was staged
directly: on the doorstep the lantern lights a circle on the wall around the
door; a pace further out the wall goes dark; flagged indoors at the same spot
the wall refuses it entirely — the side mask doing its job in both directions.

Retired with the loops: `uLampLevel`, `uLampTint`, `uLampFall`, `uLampMix`,
`uLampFace`, `LAMP_LIT`, `LAMP_FALL`, `LAMP_COLOR`, `ROOM_LIT`, `NO_LIFT`.
`swayAndLamp` is `sway` again — wind only.

Four things worth carrying forward:

1. **Patchers had to stop fighting over anchors.** `#include <begin_vertex>` is
   replaced outright by the grass to apply its bend, so a second patcher looking
   for it finds nothing and silently does nothing. Everything now anchors at
   `#include <project_vertex>` and **re-emits the token**, so any number of
   patchers compose in any order — and `transformed` is final by then, which is
   also what makes a leaning blade lit where it leaned to.
2. **`self` is the last survivor of "a house is not lit by its own windows".**
   A building's lamp is modelled from the WALL (`uLampInner`), so the wall is at
   distance zero from its own light and sits at full coverage everywhere at
   once — not a circle on a building but the whole building washed to daylight,
   which is exactly how it first rendered. One excluded slot fixes it, and the
   skin still reads every *other* lamp, which is what buys the circle on the
   wall.
3. **A GLSL precedence bug that measurement caught and the eye would not.**
   `1.0 - uLampIn[i] * cut` binds as `1.0 - (uLampIn[i] * cut)`, so excluding an
   *outdoor* slot (where `uLampIn` is 0) left the mask at 1.0 — the exclusion
   became a no-op, and the house went on washing itself out. The fix is a pair
   of brackets; finding it needed per-slot pixel probes.
4. **The ground is still not lit** — it is the Lambert globe, and Phase 5's job.
   So a carried lantern outdoors lights props, blades and walls but not the turf
   under it; the house's grass pool decal still stands in for that. This is the
   one place the world is not yet one model.

### Phase 4 — light-state snapshot — **DONE**

`_lightState(v)` is pure — it reads the switches, the homes and the hour and
writes nothing — and returns per-home `{lamps, lit}` plus a burn for every
lamp. `_applyLight(s)` writes all of it, unconditionally, making no decisions.
`_setLamps` is now the handback (a genuine state transition) followed by
`_applyLight(_lightState(v))`, and `_relight()` is the single way back in for
everything that is not the clock — a switch, a lamp picked up or set down,
somebody coming home, a lantern crossing a threshold.

`_syncItemLights` and `_syncHouseLit` are gone. So are three memoised guards
(`strongest !== this._lamps`, `v === h.lit`, and the "re-apply the glow
REGARDLESS" line that existed to work around the second one) and the `_burning`
scratch field each home carried. `_burn` keeps ONE copy of its rule and takes an
optional resolver, so compute can ask it about an hour that has not been written
down yet.

**Verified with a behavioural fingerprint, not just the tiles.** This phase
touches state machinery the 24 tiles barely exercise, so before changing
anything I dumped every derived value — `uLampK`, per-home lamps/lit, glow
colours, glass colour/emits/opacity, halo opacities, all six tint colours, cast
and loose darks, lit-prop visibility — across a matrix of 4 hours × 3 occupancy
levels × 3 switch states × lamp-carried-or-not, 72 rows. Then again after.

- **All 24 no-flip rows: identical.**
- Tiles: `no tile moved` against Phase 5; determinism re-verified; app clean.
- **22 rows differ, all in one field, and the change is a fix.** Every one is a
  row where a switch was flipped. `toggleLight` used to call `_syncItemLights`,
  which wrote the glass's raw off-colour and never reached `_syncInterior` — so
  a switched-off lamp sat wearing an untinted `PAL.lampGlass` until the next
  hour tick, instead of wearing the room's dark like everything else in it.
  `#C9C3B0` where it should have been `#C9BAA0`. The code's own comment states
  the intended rule ("a bulb that is OFF is an object in the room and takes the
  room's colour like the table does"); the entry point simply did not reach far
  enough.

That is precisely the bug class this phase existed to remove — an input that
reached some of the outputs and not all of them — and it is worth noting that
it was invisible to the contact sheet, because `setDaylight` always ran the
whole chain. It only showed between a switch press and the next tick of the
clock.

**Cost:** `update()` now re-applies the lighting every frame where it used to
call one early-outing method. That is a few dozen small writes against a scene
of seven hundred objects, in exchange for there being no order left to get
wrong.

### Phase 5 — the ground joins — **DONE**

`Globe._litGround()` patches the globe's `MeshLambertMaterial`. The ground is
the one genuinely lit surface here — a real Lambert sphere under a real ambient
and directional — so it has no `uDark` to lift out of. The restore is expressed
on the OUTPUT instead:

```glsl
vec3 lampGround = diffuseColor.rgb * lampT * uGroundLit;
outgoingLight = max( mix( outgoingLight, lampGround, lampCover ), outgoingLight );
```

**Accepted:** every daytime tile 0.000 — the ground restore is a provable no-op
by day, exactly like the interior one. Only night tiles moved. Determinism
re-verified; 26 programs, zero compile failures. The threshold case was staged
directly: lantern inside lights the room and not the grass; **in the doorway
both are lit and continuous**; on the doorstep the grass is lit and the room
dark — and the crossing is a fade, not a pop, because `insideAmount` is a
fraction.

Retired: `buildGlowPatch`, `glowRing`, the per-building pool mesh, `LAMP_POOL.
alpha`, and the pool's `visible`/`opacity` handling in `_syncLamp`. That was the
last painted light in the app; `paintLampGlow` now feeds only the bloom, which
is lit *air* and legitimately additive.

Three things worth carrying forward:

1. **`uGroundLit` had to be measured, and reasoning about it was wrong by more
   than double.** The first value was 1.9, argued from the noon ambient's 1.55
   intensity. Sampling one patch of grass at noon and then at night under full
   coverage showed every value above 1.05 clips the red channel — because that
   intensity feeds a linear lighting sum while this multiplies a texel on the
   way out. 0.80 lands at ~0.90 of noon: daylight-ish, short of the sun, clear
   of clipping.
2. **`LAMP_POOL.spill` came down 1.35 → 0.56**, the third time in this rework a
   reach had to shrink. At 1.35 a 3.2-unit house lit nearly six units at FULL
   value — the whole field in front of it came up to daylight, which as a
   painted decal read as a soft halo and as a disc reads as switching the sun
   on. At 0.56 it is an apron with its edge on screen.
3. **The retired decals were visible from further away than anyone would have
   guessed.** The one tile that moved for a non-obvious reason was `pond/night`
   — a warm patch on the far shore, fifteen-plus units from the cave, which
   turned out to be the cave's own pool decal. Nothing else showed it.

The world is now one lighting model: one profile, one loop, one set of
uniforms, from the turf to the cave wall.

### Phase 6 — polish — **DONE**

Four items, and two of them turned out to be "no".

**The doorway is a light** (`SKY_DOOR`, one slot per building, indoor-masked).
It was found by measurement rather than by eye: scanning down the middle of a
lit doorway at night, the floor a hand's breadth inside read **93** and the
grass a hand's breadth outside read **230** — brighter outside than on the
boards the light had just crossed on its way out. Its colour is the hour's own
`skyLow` pulled 55% to white, so it is blue-white under a moon and warm at dusk
with nothing told about the hour, and at noon it cannot matter because the
room's dark is white by then.

**...which exposed the spill being too strong.** `houseLit` reached a coverage
of 1, restoring the lawn all the way to its own daylight — a lit window making
the grass look like noon. `SPILL_COVER = 0.45` caps it. Together the two
changes take the threshold from **93 vs 230** to **425 vs 477** (summed
channels): the lawn is now plainly darker than the room, which is the right way
round.

**Rim dither: not added.** The plan said "if banding shows". Inspected at 2×
nearest-neighbour on the largest gradient in the app — the disc on the house
wall — and there is none. A dither would have been solving a problem that does
not exist.

**`CAST_LIFT.in/out`: stays two numbers.** Asked whether they could merge, and
measured the ratio each produces against the dark it lifts from: outdoors
2.21×, indoors 5.24×. Not two spellings of one value — two and a half times
apart, because the indoor dark is deeper AND its fraction is larger, and both
are the point. By day both measure 1.00. The measurement is now in the comment
so the question is not reopened.

**Dead-code sweep.** `paintItemGlow` retired (its last caller went in Phase 2).
The floor's "DELIBERATELY NOT GIVEN THE LAMP TERM" note is gone — it had been
stating the opposite of the truth since Phase 2.

Verified: all noon tiles 0.000; `pond` and `sky` 0.000; determinism re-checked;
26 programs, zero compile failures; app clean.

---

## Where it ended up

Every phase done. One profile, one loop, one set of uniforms, from the turf to
the cave wall — and one method, `_wearHour`, that 168 of the world's 171 lit
materials go through (the three exceptions are lamp glasses, which wear a
switch rather than an hour).

Gone entirely: four additive lamp loops, three painted light stamps, two
falloff exponents fitted by measurement to two of those stamps, two
per-surface strength constants, a facing term with a sign flip, a projected
spherical cap, three memoised guards and the double-call that worked around
one of them, a scratch field, and `_syncItemLights`/`_syncHouseLit`/
`_syncPerch`/`litByRoom`/`litByLamp`/`litByCast`/`litByLoose`/`buildGlowPatch`/
`glowRing`/`paintItemGlow`.

Four bugs were found along the way that nobody was looking for: the buildings'
own glow patch flooding their interiors, a GLSL precedence slip that silently
inverted the self-exclusion, a switch that left a lamp's glass untinted until
the next tick of the clock, and the doorway step above. Every one of them was
found by measuring rather than by looking, which is the argument for the rig.

---

## Follow-up — the cave's bulb (user-reported, post-Phase 6)

Two reports from play: the hanging bulb barely lights the room, and a bulb
that is on seems to lose its brightness when the day is scrubbed into night.
Both were real; one was a wrong-room fit and the other was a genuine bug the
rework's own dusk handback had been hiding.

**The bulb's disc was fitted to a room it does not hang in.** Phase 2 cut its
reach to 2.9 heights "against a wall 3.2 out" — the HOUSE's wall. The bulb
hangs at the apex of the CAVE: wall 4.0 out, filament measured 2.5 above the
boards. Reach 3.0 with the plateau ending at 1.9 meant the circle ran out of
radius in mid-air — a bright patch of ceiling over a floor the light never
touched, which is exactly how the report's screenshot looked. Now 4.4 heights
(4.5 units), fitted to the cave: boards under the filament at t=0.56 (inside
the plateau), floor 2.5 out at half cover, foot of the wall past the rim.
Lowering the bulb (`hang`) was considered and not needed — the light source
was never the problem, the radius was. Verified: exactly one tile moved
(`cave-lantern/night`, mean 40), everything else 0.000.

**The dusk handback stole a manual switch mid-fade.** The handback fired at
BOTH flips of `evening`. At the dusk flip, a bulb switched on by hand at noon
had `manual` cleared the instant the fade crossed `LAMP_ONSET` — its burn fell
from the override's 1 to the hour's just-woken value, **measured 1.000 → 0.017
across one frame** — so the lamp you had deliberately lit blinked out at the
start of every dusk and crawled back up with the dark. The handback now fires
at DAWN only, where the hour's own value for a night light is 0 and nothing
visible changes hands. Verified: the same sweep now holds 1.000 the whole way;
a lamp manually switched off at night is handed back at dawn and comes up by
itself the following dusk.

**What remains intended, for the record:** by day a lamp cannot add to
daylight (the self-disable property — the daytime room was always the sky's
doing, not the bulb's).

## Follow-up 2 — the bulbs come off the clock entirely (user-reported)

Reported: the bulb is dimmer on a fresh load than after flicking it off and on
again. Real, and it was the `night: true` flag doing exactly what it was
designed to do. An untouched wired light burned at its home's OCCUPANCY, so the
bulb was dim whenever its owner was out on the grass; the first press set
`manual` and pinned it to full. Measured untouched at occupancy 1 / 0.6 / 0.25
/ 0: burn **1.00 / 0.60 / 0.25 / 0.00**, against a flat 1.00 for the same
switch after a press. One visible switch position, four brightnesses, and the
brightest only reachable by toggling.

`night: true` is now gone from **both** bulbs (house and cave). A bulb is a
lamp with a switch, like the lantern beside it: on when the world is built, on
at every hour, on however empty the house is, and off only because somebody
turned it off — which is then how it stays. `_burn` returns 1 for anything not
`night`, and the dusk/dawn handback skips it, so no path is left by which the
clock can touch it.

Verified — as loaded, burn is 1 at all four hours × occupancy 1/0.5/0; a manual
off holds through a whole day cycle; switching back on returns exactly 1 (the
reported inconsistency is gone); a dusk scrub shows no dip.

Isolated against an otherwise identical build (same scene, flag flipped at
runtime): **every night tile 0.000, every pond tile 0.000.** The day tiles move
by a handful of pixels at high delta — the bulb's own glass and halo now
looking lit, which is the point — while the light it CASTS at noon does nothing
(`cave-lantern/noon` mean 0.000). What the hour still owns is what LEAVES the
building: `h.lit` gates the window glow on the dusk curve, so a bulb burning at
noon lights its own room and does not make the cave advertise itself across a
sunlit planet.

Note for future baselines: comparing against a sheet captured before the
house's second bulb existed showed 23 tiles moved and was meaningless. When a
change alters the world's contents, re-capture the "before" from the same build
and flip only the thing under test.

## Follow-up 3 — calming the fixture's own glow (user-reported)

Reported: the bulb reads too bright at night; make it look as it does at noon.

**Measured first, and the premise did not hold.** In the cave, **0 of 120,000
pixels** are brighter at night than at noon (119,787 darker, 213 within three
levels) — the restore is clamped to daylight everywhere, so nothing a lamp
lights ever exceeds its noon value. The fixture's own glass and halo render
near-identically at the two hours as well; at the closest framing the night
bulb is if anything a shade *softer*, because its glass is semi-transparent and
there is less bright ceiling behind it.

What is real is CONTRAST. A lamp is drawn additively over whatever is behind
it, and a room at night has much less behind it, so the same halo that reads as
a warm bulb against a daylit wall reads as a white blob against a dark one.

So `FIXTURE_GLOW` fades a lamp's OWN glow with the brightness of the room it
stands in: full by day, its floor at the darkest hour, interpolated on the
room's own tint (linear luminance, which puts midnight at about an eighth of
daylight). The glass COLOUR is deliberately left on the real burn: pulling that
toward `off` as well would take a burning bulb back toward the dull glass it
wears when switched off, which is the one thing a lit fixture must never say.

**Two floors, and the split is what made it controllable.** It began as one
number applied to halo and glass together, set at 0.55 — and was reported still
glaring. One number could not be pushed further: taken low enough to kill the
glare it also made the glass transparent, and a bulb you can see the ceiling
through reads as one going OUT rather than one in a dark room. They are
different parts doing different jobs:

- `halo: 0.18` — the glow in the air, drawn additively, and the thing that
  actually glares. It can go a long way down before anybody misses it, because
  what it surrounds is still plainly alight.
- `glass: 0.80` — the fixture itself, which must stay a body of light. Only
  takes the edge off.

Swept at the reported framing (stood under the cave's bulb looking up at
midnight) with the glass fixed at 0.80 and the halo walked down: 1.00 / 0.55 /
0.30 / 0.18 / 0.08. At 0.18 the bulb is a tight warm glow with its filament
plainly visible; 0.08 starts to look bare.

Isolated in one pose, one session, with the constant flipped by hand:
**5.66% of pixels affected, every one of them dimmer, and `uLampK` byte-identical
before and after** — the light the lamp CASTS is untouched, which was the
requirement.

**Rig caveat found while doing this.** Two "clean" sheets captured from separate
page loads differed on the house and cave stations by a horizontal SHIFT, not a
lighting change. Those stations aim at a lamp, and the cave's is a loose piece
whose framing is less stable than assumed. Determinism within a single load is
solid (two consecutive captures: no tile moved), so per-tile sheet diffs across
reloads should be read with that in mind, and a one-pose one-session probe is
the stronger instrument for a change this small.

## Follow-up 4 — carried pieces take the lamps (user-reported)

Reported: lighting does not apply to items held by characters or the player.

Correct, and it was half-intended. Two CPU paths wrote the hour onto held
materials and never consulted a lamp: `_syncHeld` for the player's hand and
`_syncCastHeld` for the cast. Both justified themselves with *"these materials
are made fresh by the carry builders, so there is no stable material to patch"*
— which is true of neither: `carriedPiece` in main.js caches one mesh per item
and hands the same one out forever. Measured in a fully lamplit room, a carried
teapot rendered `#47525D` against a base of `#C9D8E0` — a piece inside a
lantern's circle at the darkness of an unlit corner, **7.7× below** what the
same material renders now.

`_syncCastHeld` now patches each carried material with `_wearHour` on first
sight and drives it, so a carried piece is lit exactly like the loose bear it
was built as. **The hand keeps the CPU path deliberately**: what you hold is
nine centimetres from the eye, in front of whatever you are looking at, and
restoring it would be lighting something that is not really in the world. The
two use different caches — `handMeshes` by art, `carryMeshes` by item — so
neither can reach the other's materials.

Two things this turned up that were not the reported bug:

1. **The uniforms have to belong to the PIECE, not the carrier.** A `dark`
   handed to `_wearHour` is baked into the compiled shader and cannot be
   re-pointed afterwards, so binding a character's own would leave a lent
   sasumata lit by whoever picked it up first, forever. Each piece gets its own
   pair on first sight and whoever holds it writes them; only one holder is
   possible at a time. `_wearHour` now records the side ref on
   `userData.hourSide` so a lazy patcher can keep writing to it.
2. **One material in every carried piece is not its own** — measured across the
   teapot, the bear and the lantern, each shares exactly one with the room: the
   near-black ink at `#2E2422`, a module-level singleton every stick of
   furniture is drawn with, already patched and already wearing `darkIn`. The
   old CPU loop wrote `m.color = base × tint` over it, and a patched material
   must keep its colour AT the base or the hour goes in twice — so **the room
   quietly darkened its own woodwork whenever a character picked anything up.**
   Skipping what this method does not own (`userData.hourCarried`) fixes that as
   a side effect. Verified: the shared ink reads `#2E2422` before and after a
   pickup.

Verified: an unlit carried piece renders exactly what it rendered before
(`#47525D`, unchanged), a lit one 7.7× brighter; the object keeps the OBJECT
tint rather than its carrier's `CAST_LIFT`-raised one (`#5C626B` vs `#CFD0D2`);
no carrier means no writes at all; determinism holds; 26 programs, zero
failures; app clean.

## Risks and mitigations

- **Program-cache identity** — three.js keys on `onBeforeCompile.toString()`.
  Fewer, centrally-generated patchers reduce the risk that two textually
  identical bodies cross-wire; assert program count in the rig run.
- **N fixed at compile** — unchanged constraint; slots still counted from
  config before build (:1718–1740). Sky-spill emitters claim slots the same way.
- **Mobile cost** — more materials patched than today, N ≈ 4–6; the loop is
  a few ops × N per fragment. Profile on a phone after Phase 3 (this ships as
  a PWA). Grass blades material is the one to watch.
- **Day regression** — the model self-disables at white, but the rig's
  morning/noon tiles are the guard, not the argument.
- **Colour spaces** — targets and darks set via `THREE.Color` like today's
  tints, so sRGB conversion stays consistent.

## Accepted limitations (by design, matching the reference)

Threshold pop when a lamp crosses a wall; binary same-side occlusion; no
object shadows inside a circle; window spill as an emitter approximation
rather than transmitted light.

## Tuning checklist (against the frame, after Phase 2)

- `PLATEAU` 0.60–0.65 to start; rim softness is `1 − PLATEAU`.
- Lantern reach ≈ circle diameter 4–5 lantern heights; shelf lamp ≈ half that.
- Targets: lantern `#FFF2DE`-ish (barely warm), bulb near-neutral, spill warmer.
- `tintIn` night stays `#5C626B` as the starting dark; adjust only after the
  discs are in.
- Verify the character cheat against the frame: a cast member at the circle's
  edge reads near-white with their art's hues intact.

## Follow-up 5 - the lighting audit (user-reported)

Reported: held items look dark in bright rooms, and new props may be missing the
model. The second half is the one that had teeth, so the answer is a sweep
rather than a patch.

**The audit found no gap.** Of 286 materials: 235 patched, and every remaining
one is exempt for a stated reason - emitters (19), sky (5), water (6), ink (4),
lamp glass (4), window glow (3), night sheets (2), stars (2), lit ground (2),
weather (1). **Visible materials wearing no hour: zero.** Three are unaccounted
but hidden at opacity 0 and never drawn.

The camera - the newest prop, and the one in the report - is fully covered: 31
materials, 19 patched, and all 12 unpatched are the shared ink singleton, which
is deliberately exempt everywhere. An earlier probe of mine claimed it had
"three textured faces outside the lighting model"; that probe did not handle
multi-material meshes and misread `.color`/`.map`, and the claim was wrong.

**What was built instead is `Globe.auditLighting()`** - a read-only sweep that
sorts every material in the scene into accounted-for or not, and the rig prints
its verdict on every capture. The exemptions are RULES, not a list of names,
because a list of names is the same bookkeeping that lets a prop slip through:

  patched / lit ground   carries the mark `_wearHour` or `_litGround` left
  emitter                additive blending: it adds light rather than wears it
  stars                  a PointsMaterial
  ink                    BackSide with no map - every pen line here is an
                         inverted hull, and a line that brightened near a lamp
                         would be a drawing whose outline fades in the light
  own model              sky rig, water, glass, glow, night sheet, weather

Two design points worth keeping:

1. **`_litGround` now marks what it patches.** Without it a genuinely lit
   Lambert surface and a forgotten one look identical to the sweep - neither
   has an `hourDark`. The mark is set before the patcher, because
   `onBeforeCompile` does not run until a thing is first drawn and the snow
   shell may never be.
2. **Seen and unseen are reported separately.** A material nobody draws cannot
   look wrong, and a scene is full of parked meshes - a retired card, a sheet
   for another hour, a layer waiting on weather. Reporting those beside a real
   gap would train whoever runs it to ignore the number, so `unaccounted` is the
   alarm and `hidden` is the footnote.

**Verified by planting a bug**: a rogue mesh added to the world without
registering it was caught (1 visible gap, correctly described), and went quiet
the moment `_wearHour` was called on it. Determinism holds; app clean. The sky
is claimed as a TREE rather than by naming its domes - it has grown a layer
before now (the overcast dome) and would otherwise need re-listing each time.
