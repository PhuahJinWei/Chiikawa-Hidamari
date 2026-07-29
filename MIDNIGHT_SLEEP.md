# Midnight — the hour that puts them under

Decided 2026-07-30. This document is the implementation contract: the target
behaviour, what stays, and a migration order in which every phase is verifiable
before the next begins.

## The model in one sentence

Midnight (0:00–5:00, carved out of night) is a fifth phase in which the cast
becomes scenery: each walks home, lies down as a flat drawing sandwiched into
their own bedding — Usagi flat on the grass, having no home — puts their own
lights out by their own hand, and 5:00 hands everything back.

## Decisions already made (do not relitigate)

- **Two bears can coexist.** Chiikawa's sleep drawing has the plushie baked in;
  the room's real plushie stays wherever the player left it. Both visible at
  once is accepted.
- **No special lighting for sleepers.** The cards are furniture, not cast: they
  wear the hour through the standard patcher families (side=in indoors, side=out
  for Usagi) and take NO cast lift. A dark room hides them, and that is fine —
  it is totally fine to sleep in the darkness. Whatever the white bedding and
  the doorway skylight give is what you get.
- **Lights out is a hand, never a clock.** LIGHTING_REWORK follow-up 2 removed
  every clock path to a switch, on purpose. A character going to bed IS a hand:
  they flip their own switches off through `toggleLight`, and the wake restores
  them. Nothing here may add a clock path back.
- **Night stays awake.** Sleep was removed once because it claimed 20:00–5:00
  and deleted the stargazing cast. Night (now 20:00–24:00) keeps them out under
  the stars with their night lines; only 0:00–5:00 puts them under.

## Why the sandwich works

Both beds are already the right shape. The futon is three separate meshes —
base, comforter, pillow — and the cave's worn bedding is the same family in
cheaper colours (base + slumped comforter). The sleep card is a flat,
depth-tested plane laid just above the base top (tiny lift epsilon, the floor
caps' precedent), head at the pillow end, its lower half running under the real
comforter mesh — which is what hides the drawing's deliberately incomplete
bottom. No render-order tricks: ordinary geometry, ordinary depth test.

## What stays (do not touch)

| System | Note |
|---|---|
| Switch model (`_burn`, `toggleLight`, `_relight`) | bedtime/wake go THROUGH it, never around it |
| The disc model and its patcher families | cards are three more surfaces on `_wearHour` |
| Household visit machinery (away/going/home/leaving) | daytime visits unchanged; bedtime is a mode beside it, exempt from `atOnce` and the due clocks |
| Night's LOOK values and line banks | night is 20:00–24:00 and keeps everything it has |
| The scrubber/pill in main.js | fully PHASES-driven; gains the fifth stop by itself |

## Migration order

### Phase 0 — midnight is an hour (zero visual diff)

daylight.js only, plus the banks:

- `phaseAt`: `hours < 5` returns `'midnight'` (night keeps 20:00–24:00).
- `PHASES` gains `'midnight'` after `'night'` — the scrubber strip, marks and
  aria labels in main.js all derive from it, as does peek's `phase=` validation.
- `PHASE_START.midnight = 0`; `PHASE_LABEL.midnight = 'まよなか'`.
- `LOOK.midnight`: a verbatim clone of night. Tuning is Phase 5's job; cloning
  makes this phase provably a no-op at any given hour.
- lines.js: a small `midnight` bank per character — sleep-talk, two or three
  lines each (すぅ…すぅ… / むにゃ… / ウラ…). `say()` silently no-ops on a
  missing bucket, but silence should be a policy, not an accident.
- goldens.js: the rig's phase list goes 4 → 5; recapture the baseline (a world
  whose contents changed needs a fresh "before" — the sheet's own standing note).

**Verify:** pill shows five stops; scrubbing night ↔ midnight changes nothing
visually; the real clock at 01:00 lands `midnight`; `peek.html?phase=midnight`
boots.

### Phase 1 — the cards exist (art, no behaviour)

- assets.js registers `chiikawa-sleep` / `hachiware-sleep` / `usagi-sleep`;
  sw.js precache list gains the three paths.
- Three flat card meshes built once at scene build, hidden by default:
  - Chiikawa's on the house futon, Hachiware's on the cave bedding — both
    positioned by config numbers `{at, out, spin, lift}` in the same bearing
    frame every furniture entry uses.
  - Usagi's tangent-laid on the grass at his wander anchor.
- Lit as plain surfaces (see Decisions). No billboard, no bob, no boil — flat
  and stationary.
- peek.js gains a drawer switch — `peek.sleep(true)` — to force the cards
  visible for placement work.

**Verify in peek at `phase=midnight`:** the seam where the real comforter's ink
rim crosses the drawn comforter (card position is the knob); the incomplete
bottom fully hidden from every angle a player can stand at; Usagi's card read
at play angles on the grass.

### Phase 2 — bedtime (behaviour)

household.js gains a bedtime mode, driven by `activePhase() === 'midnight'`:

- **Entering midnight:** every bot is sent to bed regardless of `atOnce` and
  the due clocks — bedtime is not a visit. Chiikawa and Hachiware take
  `_routeIn` to a per-home `bedSpot`; Usagi gets a plain errand to his flop
  spot. Normal visits are suppressed for the duration.
- New states `toBed` → `asleep`. On arrival: billboard and shadow hide, card
  shows, and the character stays PARKED at the bed — so bubbles have an anchor
  and the existing freeze/interrupt rules keep behaving.
- **Leaving midnight** (5:00 or a scrub): card hides, billboard returns,
  `_routeOut` / wander resumes. Interruptions reuse the existing give-up
  shapes — a scrub out of midnight mid-walk aborts cleanly to `away`; a scrub
  back in re-issues the errand. The hand clock can cross this boundary
  instantly and repeatedly, so the transitions must be re-entrant, not staged.
- Player stood on the bedding: the `closeArc` freeze already parks the owner
  nearby, which reads as waiting for their bed. Accepted; no new rule.
- Occupancy: `asleep` does not count as home for the window easing — the
  per-place want goes to a new `household.asleepLamps` (start at 0) through the
  existing `lampEaseMs`.

**Verify:** pill → まよなか and all three bed down, each in the right place;
scrub to noon mid-sleep and everyone rises with no stuck state; thrash the
boundary (midnight ↔ night, rapidly) and the machine never wedges; Usagi never
enters a building.

### Phase 3 — lights out by their own hand

- On FALLING ASLEEP (arrival, per sleeper — not on phase entry): flip off every
  burning lamp in their own home via `toggleLight`, and remember the flipped
  set on the household state. A lamp the player is carrying is not in the home
  and is not touched.
- On WAKING: flip the remembered set back on — but only lamps that are still
  off. One the player relit during the night is already burning and is skipped;
  relighting while they sleep is allowed and they do not stir.
- Usagi has no home and flips nothing.
- No clock path anywhere: every change of switch state in this feature is
  attributable to a hand.

**Verify with a fingerprint sweep, not tiles** (the instrument that caught the
Phase-4 lighting bug): burns and glass colours across {before bed, asleep,
player-relit, after wake} × both homes; the lit sheet dark over a sleeping
house; a lantern in the player's hand at bedtime untouched; a full day cycle
after wake leaves the switches exactly as the sleeper found them.

### Phase 4 — voice

- A sleeper is not `attentive`, never starts or joins ambient chatter, and does
  not greet.
- A tap on the card speaks a `midnight` bank line — sleep-talk in a bubble
  anchored at the parked character. No expression change: the face is baked
  into the drawing. Never a wake.

**Verify:** tap each sleeper; stand about at midnight — silence except taps.

### Phase 5 — polish (each optional, separately shippable)

1. **LOOK.midnight earns its own row:** a step deeper `tint`/`tintIn`, haze
   DOWN (3am air is the clearest of the night), a darker swatch for the strip.
   Small moves — night is already tuned — and measured against the recaptured
   goldens.
2. **The boil frame** (needs art): a second drawing of each sleep image —
   comforter rise/fall, bubble swell, line wobble; positions identical —
   swapped at ~0.8s. Boil over transforms, per the art direction. The single
   highest-value line in this section.
3. **Zzz restored:** the small floating mark that used to exist, above each
   card, subtle.
4. **Bedtime walk / wake stretch**, if ever wanted: heading home over night's
   last stretch, a beat on the doorstep at 5:00.

## Risks and accepted limitations

- Two bears at once — accepted by decision.
- Sleepers invisible in a genuinely dark room — accepted by decision.
- The flat card foreshortens at glancing angles — it is the anime's own
  top-down framing; accepted.
- The comforter seam (real ink rim crossing drawn comforter) — judged in peek
  during Phase 1; if it will not sit, the card moves, the art does not.
- Boundary thrash via the hand clock is the one genuinely new failure surface;
  Phase 2's re-entrant transitions are the guard and the thrash test is the
  proof.
