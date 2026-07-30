# Midnight — the hour that puts them under

Decided and built 2026-07-30. This document is the record: the model, what each
phase did, and the things measurement caught that looking would not have.

## The model in one sentence

Midnight (0:00–5:00, carved out of night) is a fifth phase in which the cast
becomes scenery: each walks home, lies down as a flat drawing sandwiched into
their own bedding — Usagi flat on the grass, having no home — puts their own
lights out by their own hand, and 5:00 hands everything back.

## Decisions taken at the outset (and kept)

- **Two bears can coexist.** Chiikawa's sleep drawing has the plushie baked in;
  the room's real plushie stays wherever the player left it. Both visible at
  once is accepted.
- **No special lighting for sleepers.** The cards are furniture, not cast: they
  wear the hour through the standard patcher families (side=in indoors, side=out
  for Usagi) and take NO cast lift. A dark room hides them, and that is fine.
- **Lights out is a hand, never a clock.** LIGHTING_REWORK follow-up 2 removed
  every clock path to a switch on purpose. A character going to bed IS a hand:
  they flip their own switches through `toggleLight`, and the wake restores
  them. Nothing here added a clock path back.
- **Night stays awake.** Sleep was removed once because it claimed 20:00–5:00
  and deleted the stargazing cast. Night (now 20:00–24:00) keeps everything it
  had; only 0:00–5:00 puts them under.

## Why the sandwich works

Both beds were already the right shape. The futon is three separate meshes and
the cave's worn bedding is the same family in cheaper colours. The sleep card is
a flat, depth-tested plane laid just above the base, running from the head end
back under the cover — and it is the COVER that does the work, standing well
above the card from every angle a body can be stood at. Nothing is masked,
clipped or sorted by hand; it is an object under a quilt, and the depth buffer
knows what to do with one of those.

`bedOf` in furniture.js publishes the anatomy — `lay`, `crown`, `head`, `cover`,
`across`, `displaces` — read off the very layer specs the meshes are built from,
so a layer that moves takes the sleeper with it.

## What was built

### Phase 0 — midnight is an hour

`phaseAt` returns `midnight` below 5:00; `PHASES`, `PHASE_START`, `PHASE_LABEL`
(まよなか) and `LOOK` each gain a row. The scrubber strip, its marks, its aria
labels, peek's `phase=` validation and the goldens sheet all derive from
`PHASES` and grew by themselves. `_discArtFor` gives midnight the moon, so the
night boundary is one card whose colour and height interpolate rather than a
moon cross-fading into a second moon. `dev/compare.py` keeps its own copy of the
phase list and was updated with it.

**It shipped as a verbatim clone of night**, so that the hour ARRIVING could be
proved to move no pixel before the hour was given a look of its own. That is
what made the tuning pass below a one-line question.

Line banks: a small `midnight` bucket each (sleepy, said on the way to bed,
reached by the ordinary time-of-day chatter) and `dozing` — which is not a new
bucket but a restored one, removed in an earlier sweep with the note "what they
mumbled while asleep, and nobody sleeps".

### Phase 1 — the cards exist

`sleep` joins POSTURES in cast.js and each character's `sheets`, so assets.js
loads the drawings by the path it already had and stops warning that a top view
of somebody asleep is a different shape from a standing one. It is the one
posture never worn as a card: scene.js builds it a plane of its own lying down
and character.js never measures it.

`_layInBed` puts a sleeper in bedding; `_layOnGround` gives anyone without a bed
a ground cap on the grass. Both materials join the ordinary tint lists before
`_installHourTint` runs, so the entire lighting of this feature is two
`push` calls.

**Three things measurement decided, and the eye would have got two of them
wrong:**

1. **The drawings are cropped, and not only at the bottom.** Sampling the alpha
   at the four edges: Chiikawa is 100% opaque along the bottom, **92% along the
   right** and 30% on the left; Hachiware 100% bottom, ~33% either side; Usagi
   clean on all four, which is why he is the only one drawn complete. The right
   edge cutting through Chiikawa's own fluff turned out not to matter — it is
   white meeting the white of the bedding behind it, and reads as his head
   merging into the quilt, which is what the drawing intends. The BOTTOM is the
   edge that needs geometry over it.

2. **Hachiware's cover is at the far end of a long mat.** Placed at the head end
   his card stopped half a unit short of the only thing that could hide its cut
   edge. `along: -0.70` — bisected on the bench at three positions — is where
   the cut disappears under the fold and his face still does not.

3. **A pillow and a head cannot both be in the futon.** The pillow is a mound
   whose crown stands 0.24 above the mattress, so a sleeper at mattress height
   has their head inside it — shot from overhead, the whole face was gone but
   for one cheek. There is no height that fixes it and no plausible tilt either,
   because the two mounds TOUCH: the quilt ends at x 0.29 and the pillow begins
   there, so at mattress height there is no strip of bed to be seen lying in.
   A tilt was built, measured and removed. What replaced it is `displaces`: the
   pillow steps aside while somebody is in the bed, which is honest because a
   pillow with a head on it looks like the head, and nobody can see the bed
   occupied and empty at once.

### Phase 2 — bedtime

household.js gains `toBed` and `asleep` beside the visit machine, driven by
`activePhase()` and exempt from `atOnce` and the due clocks. Both directions are
handled every frame with no staging, which is what makes a finger thrashing the
scrubber harmless.

**Three bugs, each found by measuring rather than looking:**

1. **Giving up by lying down where they stood was a teleport.** It looked like
   the reasonable failure handling and it is not, because a sleeper with a bed
   is drawn IN the bed and the card does not travel. Measured on the first run:
   Chiikawa asleep 5.79 units from his own house — the player was stood watching
   him when the hour turned, and `attentive` freezes whoever you are looking at.
   The only way into `asleep` is now arriving; not arriving is handled by trying
   again.

2. **The stall deadline was measuring the wrong thing.** Timed from the start of
   the walk at twenty seconds, it re-planned a route that was going perfectly —
   a route home rings out AROUND the house before it comes back, so a healthy
   walk looks like it is going the wrong way for most of a minute. Chiikawa
   circled his own house indefinitely. Reaching a waypoint is what proves
   somebody is not stuck, so progress resets the window.

3. **The standing spot was on the wrong side of the bed.** Offsetting toward the
   middle of the room put the BED between the sleeper and the spot beside it:
   Hachiware walked in, was refused by his own bedding, stalled, re-planned —
   and a fresh route from indoors starts by walking back out to the ring, so he
   spent the night circling the cave. The spot is now stepped toward the doorway
   and cleared against the bed's own registered footprint (`sqrt(rx·rz)`) rather
   than by a distance somebody chose: the first attempt used a flat 0.9 against
   a futon whose solid is 0.83, leaving seven centimetres for a whole body.

**...and one bug that was never bedtime's.** The "just inside the door" waypoint
is a fixed fraction of the walk radius along the door's line, which says nothing
about what is furnished there. In the cave it lands on the cardboard box:
`wallKeep` is 0.72 and the box's footprint 0.36, so a body may come no nearer
than 0.70 to a waypoint that has to be reached within 0.60. **Every** route
through that door had it; a visit merely hid it, because a visit that cannot
arrive gives up after `headingMax` and reads as somebody who did not feel like
coming in. The waypoint is now pushed off solids.

### Phase 3 — lights out by their own hand

`lampsBurningIn(home)` and `lampIsIn(L, home)` ask where a lamp actually is
rather than where it was built, so a lantern carried off is not a switch this
household can reach. Falling asleep flips them through the same `toggleLight`
the player presses; waking puts back only those it put out, only if they are
still off, and only if they are still in the room.

Verified as a fingerprint across the whole cycle rather than by eye: four lamps
lit → Chiikawa asleep takes the house's two and leaves the cave's → Hachiware
asleep takes the cave's → the player relights the cave lantern and **nobody
wakes** → morning restores all four, with the player's relit lantern correctly
skipped rather than blindly toggled back off.

### Phase 4 — voice

`isVisible` returns false while asleep, which is what every existing caller
wanted: sleepers cannot be tapped as bodies, cannot become the focus, and cannot
chatter. Two loops did NOT go through it and were greeting and hop-answering
people who were out cold; both now check it.

A tap on the card reaches `dozing` and nothing else — no visit, no walking over,
no expression, and never a wake. `isPresent` is new and is the bubble's
question: a sleeper is neither drawn as a body nor gone, and `headWorld` points
at the card so a mumble hangs over the bedding rather than over the parked body
a stride away.

### Phase 5 — the hour gets a look of its own

A step darker; **haze DOWN** 0.76 → 0.64, the one value that moves the opposite
way to the rest of the row, because the small hours are the clearest air of the
day and it is what stops midnight being night with the brightness down; and a
swatch that steps further than the sky it stands for, because while it cloned
night the last quarter of the scrubber was one flat block with two labels
under it.

`discAt` was tried and put back. Raising the moon to say hours had passed is
wrong by daylight.js's own arithmetic — the resting view tops out around texel
222, so anything smaller is only found by swiping up, which is the exact mistake
recorded above the night row.

**Accepted:** against a sheet captured with midnight still cloning night, **all
24 original tiles are byte-identical and only the 6 midnight tiles moved.** That
is the regression check for the whole feature and not merely for the tuning:
nothing built here touches the four hours that existed before.

## Verification

- **Goldens:** 24/24 pre-existing tiles at 0.000 mean, 0 max. Six midnight tiles
  moved by design (pond 14.0, sky 12.4, house-outside 9.1, doorstep 5.0,
  cave-lantern 1.8, house-room 0.1).
- **Bedtime, end to end:** all three walk home and arrive — gaps of 0.59, 0.56
  and 0.89 against tolerances of 0.60 and 0.90 — with no re-plan loop.
- **Thrash:** the hour slammed between midnight and noon 30 times at varying
  step counts, exercising all four of `away`/`toBed`/`asleep`/`leaving`, with
  **zero violations** of: card shown ⟺ body asleep, card shown ⟺ phase asleep,
  never walking while asleep, pillow hidden ⟺ somebody in the futon.
- **A full day cycle** after waking leaves the switches exactly as the sleepers
  found them.

`peek.html?sleep=1` lays the sleepers down at any hour, which is the bench all
three fits were chosen on — fitting them at midnight in an unlit room would mean
judging a placement in the dark.

**Tooling fixed on the way:** `dev/compare.py` crashed with a
UnicodeEncodeError printing an em dash on a cp932 console, so the tool died
instead of explaining the mismatch it had correctly detected.

## Follow-up — midnight has to send them ALL to bed, at once (user-reported)

Reported twice: first that setting the hour to midnight did not send Chiikawa
home, then — the requirement stated plainly — that when midnight hits everybody
should immediately start heading to sleep regardless of anything. Four separate
things were in the way of that, and only the first had been noticed.

**They now set off on the frame the hour turns.** Four things would otherwise
each have delayed it, so `_toBed` clears all four rather than waiting any of them
out: a CUSHION (a seated body skips the wander entirely, so somebody sat down at
midnight would never walk at all — not late, never), a REST (up to six seconds,
and being part way through one is the common case rather than the unlucky one), a
CONVERSATION (`busyUntil` holds a pair still for an exchange plus `meetHoldMs`,
seven seconds on its own), and YOU standing nearby. `turningIn` stays set for the
whole walk so none of them can creep back in halfway home.

Verified on the worst case that can be built by hand — everybody seated, resting
for ten million milliseconds, held in conversation for as long, and the player
stood on top of the nearest: **all three walking one frame past the turn.** The
cushion case is currently unreachable, because neither home has a seat in it any
more; the guard is there for when one comes back.

**...and the WALK itself had to stop dawdling, which was the last of it.**

Setting off at once is not the same as going to bed at once, and the difference
was the rest at the end of every leg: one to six seconds, taken not once per
journey but once per LEG — and a walk home is made of many, because a target
trimmed short of an obstacle counts as one. The whole journey came out as a few
paces, a pause, a few paces, a pause. It reads exactly as it sounds, and it is
what made midnight feel like it had not really happened even once they were
moving.

So while `turningIn`: no arrival rest, no beat on the threshold in `_walkRoute`,
no random stroll if an errand is ever missing, and no meet exchange between two
of them passing. That last one is not about the delay — the hold was already
ignored — but two friends striking up a conversation that neither of them halts
for is worse than no conversation. At this hour they have somewhere to be. The
walk cycle itself is untouched, so they still walk rather than glide; what is
gone is the standing about.

**Measured frame by frame**, which is the only way to see a pause this size:
across four runs from independently wandered starts, the number of frames each
character spent stopped and awake was **0–9 out of 123 to 1286** — single frames
between one leg and the next, and nothing else. Time from the hour turning to all
three asleep fell to 4–42 world seconds, the spread being how far from home they
had drifted, against 85–150 before. All three "off to bed" on the first frame in
every run.

Bedtime walks through `_wander`, so it inherited the politeness freeze: a
character stops dead while the player is inside `closeArc` (3.6 units), or
inside `noticeArc` (**6.5**) if they are the one you are focused on. That rule is
right for a stroll, which has nowhere it needs to get to — a friend who wandered
over should stop, and the one you came to see should not amble off mid-sentence.
Bedtime is the only errand in this world with a deadline, and it cannot share a
stroll's manners.

The arrival spot alone was enough to break it: you are set down on the doorstep
**3.6 units from Chiikawa, exactly `closeArc`**, so pressing the time pill from
where the game puts you left him holding a valid route to his own bed and never
taking a step of it — measured still at 5.02 from the bed for seventy
consecutive seconds. Walking over to say hello first widens the radius to 6.5,
which covers most of the front garden.

`turningIn` is a flag on the character, written by household.js beside `errand`
and read in exactly one place: that freeze. They walk past you now instead of
stopping, which is the courtesy the cast already extend to each other — nobody
here is solid to anybody else — and their rest rhythm is untouched, so it reads
as somebody excusing themselves rather than marching.

**Unfreezing them exposed two more, both of which the freeze had been hiding** —
because a walk that never started cannot fail at its destination.

**The bedside spot was not somewhere anybody could stand.** A walking body keeps
`wallKeep` (0.72) clear of every solid, so a spot merely outside a bed's
footprint is not reachable: it has to clear the footprint AND that fence. Two
hand-picked clearances got this wrong in a row — a flat 0.9 against a futon whose
registered solid is 0.83, then footprint + 0.5 — and the second measured as a
block of radius 0.81 sitting on the target itself, with Chiikawa stalled 0.75
short of a 0.60 tolerance. The distance is now the sum of the two things that
actually decide it. `keepOffSolids` was tried for this and is the wrong tool: it
ejects in ONE pass, which its own note in sphere.js warns about, and in the cave
it pushed the spot off the bedding straight into another prop. So the bearing is
SEARCHED instead — the door's side first, then sweeping outward both ways in
15° steps until a bearing is clear of every solid and still inside the room.

**A re-plan from indoors walked them into their own wall.** `_routeIn` is built
for an approach from outside: round to the front, onto the doorstep, then in.
Handed a start that is already inside, its first leg is a straight line out to
the ring — and from indoors that line runs into the wall rather than through the
one gap in it. Measured: Hachiware pinned at 2.75 from the cave's middle against
a walk radius of exactly 2.75, on the wall's inner edge with nowhere legal to
step. Somebody standing in their own home has no door left to thread, so a
bedtime route from inside is now simply `[bedside spot]`.

**...and a third, which was the last thing actually stopping anybody: the
sidestep round an obstacle was too LONG.**

Unfreezing them turned up a walk that stalled in open country. `Character._detour`
already existed for exactly this — the cast cannot path, so a pick blocked by a
tree is answered by swinging the bearing aside and offering that as an ordinary
trip — and a sidestep planned in household.js was written alongside it before that
was noticed. **That duplicate has been deleted**: `_detour` does the same job on
every errand rather than only this one, and does it better by going through
`_pickTarget`, so it is fenced by every rule the direct line was. Its own note
records the same measurement from the same walk to the same cave. Two mechanisms
for one problem is worse than the slower of them.

What `_detour` was missing is that its step is capped at `roamMax` — eight units
— and a long line is the hardest kind to keep clear, because it has to miss
everything along its whole span. On a planet with two dozen trees a blocked
bearing usually stays blocked at every bearing, so all six offsets fail together.
Instrumented during the stall: hundreds of picks, **every one empty**, six offsets
exhausted each time, Hachiware standing at the near side of two trees
indefinitely. What gets past a tree is not a better bearing but a shorter step, so
`DETOUR_STEPS` tries the full length first (nothing that already worked changes)
and then 45% and 18% of it. A unit and a half to the side clears a trunk and needs
only a unit and a half of clear ground to do it — which is what the mechanism's
own comment says it is for: get them moving and re-aim from there.

**Verified after all of it:** five consecutive runs from independently wandered
starts, every one with all three asleep (10–85 seconds, the spread being how far
Hachiware had got from his cave) and **no stall on any frame**; instrumented, the
counters read `empty: 0, freeze: 0` for all three where before they climbed into
the hundreds. Arrival distances 0.59 / 0.59 / 0.86 against tolerances of 0.60 and
0.90. The 30-flip thrash reports zero violations against five invariants (two
`turningIn` ones are new: never set while asleep, never stale outside `toBed`).
The goldens sheet shows **no tile moved**, which is right for a change that alters
walking and not rendering.

**Worth recording as a process failure, not just a code one.** The previous
version of this document listed "somebody you stand and watch all night simply
stays up" under accepted limitations, as though it were a design choice. It was
not: it was a constraint hit during testing and then rationalised. Every
automated check passed, because every one of them had moved the player to the far
side of the planet first — precisely to get the walk to happen. The scenario
nobody tested was the default one.

## Accepted limitations (by design)

Two bears at once. Sleepers barely visible in a genuinely dark room — the point
of the hour, not a defect. The flat card foreshortens at glancing angles, which
is the anime's own top-down framing.

## Follow-up — the Zzz (user-requested)

A floating Zzz over anybody asleep. `paintZzz` had existed and been deleted with
the note "nobody sleeps any more"; this is drawn fresh rather than restored,
because what it floats over is not what it used to be.

**A child of the sleeping card**, which settles four things at once: it appears
and disappears with the sleeper (a hidden parent hides its children), it is
culled with the room, it needs no world position of its own, and — the useful
part — every sleeper card's local +Y is already the surface up at that spot, so
"above them" is +Y and nothing has to work out which way up is.

**It billboards, unlike the sleeper it floats over,** and that is not an
inconsistency. The card lies flat because it is a picture of somebody seen from
above; this is a MARK, and marks in this world stand up and face you the way the
focus arrow and the speech bubbles do. Lying flat it would foreshorten to a smear
at the eye height a room is usually seen from. One angle rather than a
quaternion: a billboard on a planet only spins about the surface up.

**Three things had to be measured rather than chosen:**

- **The pen was nearly a third of each glyph and had to come down to a fifth,
  then up to 0.26.** A stroke swells a shape by half its width on every side, so
  at 0.30 the largest z grew thirteen canvas pixels all round and closed the gap
  to the one below it — rendered, the three fused into a single vertical ribbon,
  legible as a squiggle and not as three z's. At 0.20 they separated but the
  outline came out one or two device pixels wide and antialiased most of the way
  to the fill, so the pen read grey rather than as the world's near-black. 0.26
  keeps both: gaps hold at 97 canvas units against 107 to the neighbour.
- **Paper filled, ink outlined**, which is not decoration. The hour this exists
  for is the one hour the room's lamps are off, by the sleeper's own hand, so an
  ink Z over a sleeping Chiikawa would be dark on dark exactly when it is needed
  — and a plain pale one would vanish against the near-white bedding a hand's
  breadth below. Stroked twice it reads against both.
- **It starts invisible.** `_syncZzz` only writes an opacity for somebody already
  lying down, so left at the material default the mark would be drawn at full
  strength for the single frame between lying down and the next sync — a flash on
  the one thing here whose job is to be quiet.

**The drift is the one transform in this feature** and it is deliberate against
the rule that says animate by boiling rather than by moving. That rule is about
drawings of characters; a mark whose whole meaning is that it rises cannot say so
while sitting still. Kept slow and short — a fifth of a unit over three seconds,
fading over the top — and each sleeper runs on its own offset off their place in
CAST, so three in view never pulse as one and the offsets are the same on every
visit.

Verified: drift measured over a full cycle running 0.008 → 0.200 and wrapping,
opacity 0 → 0.80, the three demonstrably out of step; the invariant sweep gains
three checks (the mark never detaches from its card, never drifts past its
bound, never exceeds its peak) and reports zero violations; goldens **no tile
moved**, which is right for a mark that is hidden at every hour the rig captures.

**A harness note worth keeping.** Two of the verification shots came back with no
Zzz at all and a third showed thin diagonal streaks. Neither was a bug: the
billboard yaw is computed from where the camera was last frame, so a shot taken
straight after teleporting the camera catches the plane edge-on — and the fade
reaches zero once every three seconds, so an arbitrary instant may catch nothing.
Capturing a billboard needs the sync re-run after the camera moves and the fade
pinned; in the app the camera moves smoothly and a one-frame lag is invisible.

## Not done

The second boil frame per sleep drawing — a comforter that rises and falls, a
bubble that swells — is the one thing left that would most improve this, and it
needs art rather than code. Everything is in place for it: the cards are ordinary
textures on ordinary planes, and a swap on a timer is all that is missing.
