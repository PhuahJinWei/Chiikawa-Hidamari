// The fish, and the second thing the water was built to hold.
//
// The lake's own config note has promised these since it was written — "it is
// also where the fish are" — and only the lake gets them: the pond is small
// enough that a shoal in it would be a bucket.
//
// CARDS, not geometry, by the app's own rule: cards for what you look at,
// geometry for what you move around. You can never walk around a fish — the
// water is solid and the shore is as close as anybody gets — so each fish is
// one flat drawing lying just over the water, exactly the arrangement the
// cast's reflections already use. And like the reflections, they draw with the
// stencil the water stamps: only where the pond is actually visible. That one
// test is the shore clip and the occlusion check in a single mechanism — a
// fish swimming to the edge slides under the ink line and stops, and a tree
// standing between you and the water leaves a fish-shaped hole in nothing,
// because the water never stamped there. See water.js.
//
// They lie a hair ABOVE the surface rather than under it, which sounds
// backwards for a fish and is the only thing that draws. Under the body they
// would be behind 90% opaque water — present, correct, and invisible, the same
// trap the cushions once fell into against the rug. What says "submerged" is
// not depth sorting, it is colour: each fish is washed with the hour's own
// water before it is drawn, the exact trick the reflections use, so the fish
// is always a fish-shaped patch of slightly-warmer water rather than a sticker
// on it. The glints then scroll OVER them, which reads as the surface passing
// between you and the fish.
//
// ------------------------------------------------------- twelve of them, drawn
//
// A species is a row of FISH_SPECIES in config.js and a file in
// `asset/images/fish/`, and this file knows a fish by its INDEX into that list.
// It used to know one by a tint: there was a single white drawing — `paintFish`,
// now a tombstone in art.js — and three koi colours, and a fish was a material
// colour. That could not have grown to twelve, because the twelfth tint of one
// silhouette is not a twelfth animal.
//
// What the drawings changed here is small and worth stating, because everything
// else on this page survived the swap untouched: the card takes its PROPORTIONS
// from its own drawing instead of a shared 160x256, and the material colour is
// no longer the fish. It is the hour's wash — the same for every fish in the
// water — and the fish is what the wash is multiplied by.
//
// ------------------------------------------------------------- how they swim
//
// In the lake's own gnomonic frame — the same (a, b) parameter the mesh and
// `inLake` measure in — scaled to world units, so a speed here is a speed on
// the ground. Containment asks `lakeRim` for the shore in the fish's own
// bearing, the identical question every vertex of the water asked when it was
// built: the water you see, the water you cannot walk into, and the water the
// fish stay inside are one shape asked three ways.
//
// The cadence is the planet's: swim a while, hang in the water a while, the
// wander/rest rhythm of the cast scaled down. And they mind your feet — walk
// to the shore and the near ones shy away, a short burst that decays, because
// in this world everything notices you a little and nothing runs from you for
// long.

import * as THREE from 'three';
import { CONFIG, FISH_SPECIES } from './config.js';
import { dirFromLatLon, localFrame, lakeRim } from './sphere.js';
import { WATER_STENCIL } from './water.js';
import { paintFishCard } from './art.js';
import { IMG } from './assets.js';

// Above the water body (LIFT 0.012 + LAYER 0.004 in water.js), by more than
// the body's own facet sag (~0.002 — see the LAYER note there, whose rule this
// follows: the gap between stacked curved decals has to beat the SAG).
const FISH_LIFT = 0.024;

// Under the glints (5), over the body (4): the surface's light passes over a
// fish, and the fish passes over the water.
const FISH_ORDER = 4.5;

// One texture per species, cut from its drawing on first use and kept.
//
// Exported, and the rod is the reason: fishing.js shows the species you caught
// on a card of its own, and building that from the same canvas through a second
// CanvasTexture would upload every fish to the GPU twice for two objects that
// are, by the whole point of the feature, the same fish. One texture per
// species in the app, whoever asks.
//
// By index rather than by id, because that is the currency the shoal and the
// rod already pass between them — see `species` on a fish below.
const FISH_TEX = [];

export function fishTexture(i) {
  if (!FISH_TEX[i]) {
    const t = new THREE.CanvasTexture(fishCard(i));
    t.colorSpace = THREE.SRGBColorSpace;
    FISH_TEX[i] = t;
  }
  return FISH_TEX[i];
}

// ...and the canvas under it, which is also what the pouch and the hand show.
// Anything that needs a species' PROPORTIONS rather than its pixels asks this,
// because the crop is where a needlefish stops being square.
export function fishCard(i) {
  return paintFishCard(IMG.fish[FISH_SPECIES[i].id]);
}

// Which species each fish in the shoal is, dealt rather than counted out.
//
// `i % FISH_SPECIES.length` is the obvious line and it is wrong twice at this
// size. It puts the roster's own order into the water — peach, apricot, gold,
// the greens, always in that order round the same spawn ring — and if the count
// ever falls below the number of species it keeps the FRONT of the list and
// silently retires the tail. A shuffled bag, refilled whenever it runs dry, has
// neither fault: every species is dealt once before any is dealt twice, and
// which of them you meet first is a different answer every visit.
function deal(n) {
  const out = [];
  let bag = [];
  for (let i = 0; i < n; i++) {
    if (!bag.length) {
      bag = FISH_SPECIES.map((_, k) => k);
      for (let k = bag.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [bag[k], bag[j]] = [bag[j], bag[k]];
      }
    }
    out.push(bag.pop());
  }
  return out;
}

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _wash = new THREE.Color();

function between(a, b) { return a + Math.random() * (b - a); }

// Shortest-way angle blend, because a fish turning the long way round to gain
// ten degrees is a compass, not an animal.
function turnToward(from, to, most) {
  let d = (to - from + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  if (d > most) d = most;
  if (d < -most) d = -most;
  return from + d;
}

export class FishSchool {
  constructor(R, pond) {
    this.R = R;
    this.pond = pond;
    this.C = pond.centre.clone();
    this.E = new THREE.Vector3();
    this.N = new THREE.Vector3();
    localFrame(this.C, this.E, this.N);
    this.meshes = [];
    this.fish = [];
    this._t = 0;

    const cfg = CONFIG.fish;
    const species = deal(cfg.count);
    for (let i = 0; i < cfg.count; i++) {
      const sp = species[i];
      const card = fishCard(sp);
      const len = between(cfg.lenMin, cfg.lenMax);
      // The card keeps its own drawing's proportions, the way every card in the
      // app does — but sized against its LONG side rather than its height, so
      // `len` is the length of the animal whichever way round it was drawn. A
      // needlefish and a puffer given the same `len` are the same handful of
      // creature; sized by height alone the puffer would have been the width of
      // a small boat.
      const k = len / Math.max(card.width, card.height);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(card.width * k, card.height * k),
        new THREE.MeshBasicMaterial({
          map: fishTexture(sp),
          transparent: true,
          depthWrite: false,
          // depthTest stays ON, unlike the reflections': a reflection hangs
          // inside the planet where depth can only hide it, but a fish lies in
          // open air just over the water, and the ordinary test is what lets
          // whoever is stood in front of the far shore stand in front of the
          // far fish too.
          stencilWrite: true,
          stencilRef: WATER_STENCIL,
          stencilFunc: THREE.EqualStencilFunc,
          stencilFail: THREE.KeepStencilOp,
          stencilZFail: THREE.KeepStencilOp,
          stencilZPass: THREE.KeepStencilOp,
        }),
      );
      mesh.renderOrder = FISH_ORDER;
      // Never frustum-culled by a stale sphere: the mesh moves every frame and
      // is six triangles' worth of cost, so the check would spend more than it
      // saved the moment it was ever wrong.
      mesh.frustumCulled = false;
      this.meshes.push(mesh);

      // Spawned mid-water on a random bearing — not at the rim, where the
      // first thing a new fish would do is steer, and not all at the middle,
      // where six fish would open the game as a knot.
      const th = Math.random() * Math.PI * 2;
      const rim = lakeRim(th, pond.lake);
      const rho = between(0.15, 0.55) * rim;
      this.fish.push({
        mesh,
        // Which species this one is, as an index into FISH_SPECIES, because the
        // fishing rod asks: the species you catch is the species that swam to
        // your float, and the pouch and the 図鑑 count in the same index. See
        // lure() below and FISH_ITEM in items.js.
        species: sp,
        // Position and heading live in a tangent frame measured in WORLD
        // units, converted through the lake's radii only at the edges — so
        // the speeds below mean what they say regardless of the lake's shape.
        u: Math.cos(th) * rho * pond.lake.rx * R,
        v: Math.sin(th) * rho * pond.lake.ry * R,
        phi: Math.random() * Math.PI * 2,
        sp: 0,
        pace: between(0.8, 1.15),
        mode: 'swim',
        until: between(cfg.swimMin, cfg.swimMax),
        dart: 0,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // A world direction in the lake's own tangent frame, world units — the frame
  // every fish position below is already in. Null past a quarter turn, where
  // the projection stops meaning anything.
  toUV(dir) {
    const c = dir.dot(this.C);
    if (c <= 0) return null;
    return {
      u: Math.atan2(dir.dot(this.E), c) * this.R,
      v: Math.atan2(dir.dot(this.N), c) * this.R,
    };
  }

  // ------------------------------------------------------------- the rod's
  //
  // Three verbs, all owned by the school rather than by fishing.js, because
  // they are things a FISH does and the state that drives them lives on the
  // fish. The rod decides when; the school decides how it looks.

  // Something worth swimming to at (u, v). The nearest fish still in the water
  // comes over — its own wander suspended while `lure` is set — and it is the
  // one the float will hook. Null when everyone is diving, which the caller
  // treats as "the bite happens anyway, pick a species blind": twelve fish and
  // one dive at a time make it near-impossible, and a cast must never fail
  // for reasons invisible on screen.
  lure(u, v) {
    let best = null;
    let bestD = Infinity;
    for (const f of this.fish) {
      if (f.diveLeft > 0) continue;
      const d = Math.hypot(f.u - u, f.v - v);
      if (d < bestD) { bestD = d; best = f; }
    }
    if (best) best.lure = { u, v };
    return best;
  }

  // The moment passed — a missed bite, a reeled-in line. The fish loses
  // interest and puts a burst of water between itself and the float, which is
  // the same dart your feet cause, pointed at a different disappointment.
  spook(f) {
    if (!f) return;
    if (f.lure) {
      f.phi = Math.atan2(f.v - f.lure.v, f.u - f.lure.u);
      f.dart = 1;
    }
    f.lure = null;
  }

  // Caught. The fish leaves the water — scale and visibility, not position, so
  // nothing else has to know — and comes back later somewhere else in the
  // pond, because a pond you can empty is the wrong kind of consequence here.
  dive(f, ms) {
    if (!f) return;
    f.lure = null;
    f.diveLeft = ms;
    f.mesh.visible = false;
  }

  update(t, playerDir) {
    const dt = Math.min(this._t ? t - this._t : 16, 100) / 1000;
    this._t = t;
    if (dt <= 0) return;

    const cfg = CONFIG.fish;
    const R = this.R;
    const lake = this.pond.lake;
    // The hour's water, asked of the pond itself so a fish never has an
    // opinion about what time it is.
    const water = this.pond.body.material.color;

    // The wash every fish is drawn through, worked out ONCE — see `sink` in
    // config.js. It used to be per fish because it started from the fish's own
    // tint; the drawings carry their colour now, so what is left is white pulled
    // toward the water, which is the same white and the same water for all
    // twelve of them.
    _wash.setRGB(1, 1, 1).lerp(water, cfg.sink);

    // Your feet, in the lake's own frame — worked out once, not per fish.
    let pu = 0; let pv = 0; let nearPond = false;
    if (playerDir) {
      const pc = playerDir.dot(this.C);
      if (pc > 0) {
        pu = Math.atan2(playerDir.dot(this.E), pc) * R;
        pv = Math.atan2(playerDir.dot(this.N), pc) * R;
        // Only worth minding when you are anywhere near the water at all.
        nearPond = Math.acos(Math.max(-1, Math.min(1, pc))) * R
          < Math.max(lake.rx, lake.ry) * R + cfg.shyArc * 2;
      }
    }

    for (const f of this.fish) {
      // Gone under — see dive(). Nothing moves and nothing draws; only the
      // timer runs, and coming back is a respawn somewhere mid-water rather
      // than a reappearance at the scene of the catch.
      if (f.diveLeft > 0) {
        f.diveLeft -= dt * 1000;
        if (f.diveLeft > 0) continue;
        const th = Math.random() * Math.PI * 2;
        const rho = (0.2 + Math.random() * 0.35) * lakeRim(th, lake);
        f.u = Math.cos(th) * rho * lake.rx * R;
        f.v = Math.sin(th) * rho * lake.ry * R;
        f.phi = Math.random() * Math.PI * 2;
        f.dart = 0;
        f.sp = 0;
        f.mesh.visible = true;
      }

      // The clock: swim, rest, swim. An interrupted rest is not defended —
      // a dart resets nothing, because a startled fish that settled back into
      // a schedule would read as one.
      f.until -= dt * 1000;
      if (f.until <= 0) {
        const swim = f.mode !== 'swim';
        f.mode = swim ? 'swim' : 'rest';
        f.until = swim ? between(cfg.swimMin, cfg.swimMax)
          : between(cfg.restMin, cfg.restMax);
      }

      // Wander: a slow private sway of the heading, so no two fish ever agree
      // about where to go without ever deciding anything.
      f.phi += Math.sin(t / 1000 * 0.9 + f.phase * 7) * 0.45 * dt;

      // Called over — see lure(). The wander still murmurs underneath, but the
      // heading is pulled firmly toward the float, and your feet stop
      // mattering for the duration: a fish that has decided to bite is bolder
      // than a fish loafing, and the float sits inside the shy radius of the
      // very shore you cast from — minding you would cancel every bite you
      // could actually reach.
      if (f.lure) {
        f.phi = turnToward(f.phi, Math.atan2(f.lure.v - f.v, f.lure.u - f.u), 4.5 * dt);
        f.mode = 'swim';
      } else if (nearPond) {
        // You. A burst away from your feet that decays on its own clock.
        //
        // BEFORE the shore, so the shore can overrule it. The two disagree
        // constantly — you stand at the water's edge, which is exactly where a
        // fish shying away from you is being pushed straight at the far bank.
        // Ordered the other way round the shy steer had the last word and the
        // stronger rate, and ten minutes of somebody standing at the edge put
        // fish out of the pond and onto the grass — measured at a third of a
        // radius past the rim. A frightened fish may pick the direction; it
        // does not get to pick the pond.
        const du = f.u - pu;
        const dv = f.v - pv;
        const gap = Math.hypot(du, dv);
        if (gap < cfg.shyArc) {
          f.dart = 1;
          f.phi = turnToward(f.phi, Math.atan2(dv, du), 3.2 * dt);
        }
      }
      if (f.dart > 0) f.dart = Math.max(0, f.dart - dt * 1000 / cfg.dartDecayMs);

      // The shore. Asked in the lake's parameter polar, which is what lakeRim
      // speaks; pressed back toward the middle harder the closer it gets, and
      // long before the card could touch the ink.
      //
      // The rate rises steeply enough to out-argue a dart by the time it
      // matters: gentle at `soft`, and about as hard as the shy turn by the time
      // the fish is at the wall below.
      const a = f.u / (lake.rx * R);
      const b = f.v / (lake.ry * R);
      const rho = Math.hypot(a, b);
      const rim = lakeRim(Math.atan2(b, a), lake);
      const frac = rho / rim;
      if (frac > cfg.soft) {
        const home = Math.atan2(-f.v, -f.u);
        f.phi = turnToward(f.phi, home, (frac - cfg.soft) * 14 * dt);
      }

      // Speed eases toward what the mode wants; a dart wants more of it, and a
      // lure wants the hurry of something that smelled food — until the last
      // hand-span, where it hangs at the float, which is what the player's eye
      // reads as "about to take it".
      const eager = f.lure
        ? (Math.hypot(f.lure.u - f.u, f.lure.v - f.v) > 0.30 ? cfg.cruise * 1.5 : 0.03)
        : (f.mode === 'swim' ? cfg.cruise * f.pace : 0.015);
      const want = eager * (1 + f.dart * cfg.dartBoost);
      f.sp += (want - f.sp) * (1 - Math.exp(-dt * 3));

      f.u += Math.cos(f.phi) * f.sp * dt;
      f.v += Math.sin(f.phi) * f.sp * dt;

      // AND THEN THE WALL, which is the only part of this that is a guarantee.
      //
      // Everything above is a force, and a force can always be outrun by a
      // bigger one — that is what put fish on the grass, and reordering the two
      // above only made it rarer rather than impossible. So the last word is a
      // clamp: work out where the rim is on the bearing the fish has ARRIVED at,
      // and if it is past `hard`, put it back on that line. Whatever any steering
      // decides, a fish cannot end a frame outside the water, because this runs
      // after all of it and is not a negotiation.
      //
      // Turned inward as well as moved, or a fish pinned against the clamp would
      // grind along the shore for as long as it kept choosing to swim at it.
      //
      // `hard` is short of 1 by more than half a fish, so it is the CARD that
      // stops at the ink rather than the fish's centre — a nose over the outline
      // would be the visible version of the same bug.
      const ua = f.u / (lake.rx * R);
      const ub = f.v / (lake.ry * R);
      const urho = Math.hypot(ua, ub);
      const wall = lakeRim(Math.atan2(ub, ua), lake) * cfg.hard;
      if (urho > wall) {
        const k = wall / urho;
        f.u *= k;
        f.v *= k;
        f.phi = turnToward(f.phi, Math.atan2(-f.v, -f.u), 2.5 * dt);
      }

      // Onto the sphere: the gnomonic projection run backwards, the same door
      // every vertex of the water came through.
      _p.copy(this.C)
        .addScaledVector(this.E, Math.tan(f.u / R))
        .addScaledVector(this.N, Math.tan(f.v / R))
        .normalize();
      _up.copy(_p);
      _p.multiplyScalar(R + FISH_LIFT);

      // Forward, by asking where a small step of the same walk would land —
      // through the projection rather than around it, so the card and the path
      // can never disagree about which way the fish is pointing. The wiggle
      // rides on the heading here, not on the path: the body swings as it
      // swims, faster and smaller the harder it is going.
      const wig = Math.sin(t / 1000 * (2.0 + f.sp * 9) + f.phase)
        * (f.sp > 0.05 ? 0.11 : 0.045);
      const step = 0.01;
      const wphi = f.phi + wig;
      _q.copy(this.C)
        .addScaledVector(this.E, Math.tan((f.u + Math.cos(wphi) * step) / R))
        .addScaledVector(this.N, Math.tan((f.v + Math.sin(wphi) * step) / R))
        .normalize();
      _fwd.copy(_q).sub(_up).addScaledVector(_up, -_fwd.dot(_up)).normalize();
      _right.crossVectors(_fwd, _up);

      f.mesh.position.copy(_p);
      f.mesh.quaternion.setFromRotationMatrix(_m.makeBasis(_right, _fwd, _up));

      // Sunk by colour — see the top of the file. The drawing supplies the fish
      // and this supplies the water it is under.
      f.mesh.material.color.copy(_wash);
    }
  }
}
