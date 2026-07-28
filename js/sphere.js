// Placing things on a planet. Latitude and longitude in radians: lat 0 is the
// equator and positive is north, lon 0 points down +Z toward where the camera
// starts.

import * as THREE from 'three';

export const UP = new THREE.Vector3(0, 1, 0);

export function surfacePoint(lat, lon, radius, out) {
  const cl = Math.cos(lat);
  return out.set(cl * Math.sin(lon) * radius, Math.sin(lat) * radius, cl * Math.cos(lon) * radius);
}

// Sit an object on the surface with its local +Y along the outward normal, so
// anything parented to it treats the ground as flat. The leftover spin about
// the normal is arbitrary and does not matter — billboards set their own.
export function placeOnSphere(obj, lat, lon, radius) {
  surfacePoint(lat, lon, radius, obj.position);
  const normal = obj.position.clone().normalize();
  obj.quaternion.setFromUnitVectors(UP, normal);
  return normal;
}

// The local east/north basis on the surface at direction A. Degenerate at the
// poles, so anything that has to survive them — the camera rig — carries a
// transported frame instead of rebuilding a basis from where it stands.
export function localFrame(A, east, north) {
  east.set(0, 1, 0).cross(A);
  if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
  east.normalize();
  north.crossVectors(A, east).normalize();
}

// `tangentAt` and `headingToward` used to live here: a compass bearing to a
// tangent vector and back. Only the camera rig ever wanted them, and turning a
// direction into a bearing and a bearing back into a direction every frame was
// itself the bug — a held bearing walks a rhumb line, which spirals. The rig
// keeps the direction now and never names an angle, so both are gone.

export function dirFromLatLon(lat, lon, out) {
  const cl = Math.cos(lat);
  return out.set(cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon));
}

// How far a decal floats above whatever it is lying on.
//
// It was 0.06 while these were flat quads, and most of that was not clearance
// but the rim's own climb: a flat disc touches a sphere at one point and rises
// away from it everywhere else, so the lift had to cover the worst case before
// the depth test even came into it. A cap holds the same gap the whole way out,
// so this only has to beat z-fighting now — and the polygon offset every one of
// them carries is already doing most of that.
export const SHADOW_LIFT = 0.02;

// A decal lying ON the planet rather than on the tangent plane at one point of
// it — the shape every shadow and marker here actually wanted.
//
// The old flat quad touched the surface at its middle and climbed away from it
// in every direction. At radius 8 a shadow 1.5 across ends up a further 0.035
// clear of the grass at its rim than at its centre, on top of the lift, and a
// character-sized one is not much better: seen from a crouch — which is most of
// this camera's life — that rim is a hard edge hanging over the hillside, which
// is the one thing a soft shadow must never look like. buildGlowPatch in
// scene.js already solved this for the pools of lamplight; this is the same
// projection done in the local frame and handed back as geometry, so a caller
// keeps its holder, its texture and its material exactly as they were.
//
// Lying in XZ with +Y along the normal — the orientation `rotation.x = -PI/2`
// used to give the plane — and with the lift baked in, so the curve and the
// height it is measured from cannot drift apart. Winding is preserved with it,
// so a front-face-only material still faces the sky.
//
// 8 segments is chosen against the sagitta, the same way the glow patch chose
// 16: across one cell of the widest shadow on the planet the ground falls away
// under a thousandth of a unit, well inside the lift, so every part of the
// decal sits on the grass rather than only its middle.
export function groundCap(R, w, h, lift, seg = 8) {
  const geo = new THREE.PlaneGeometry(w, h, seg, seg);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // The planet's centre sits at -R on the holder's own up axis, so read each
    // vertex as a tangent offset from there and push it back out to the
    // surface. Normalising is what makes this a cap instead of a lid.
    const x = pos.getX(i);
    const z = -pos.getY(i);
    const k = (R + lift) / Math.hypot(x, R, z);
    pos.setXYZ(i, x * k, R * k - R, z * k);
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

// ------------------------------------------------------------------- water
//
// Lakes are ellipses, not circles, and live here because four separate places
// used to ask the same question with their own copy of the arithmetic — the
// painting, the characters steering round one, the ground cover refusing to
// sprout in one, and the teasing you get for paddling in one.
//
// Elliptical because the drawing is: lake.png is 1.84 times wider than it is
// tall. A circular test around a wide drawing means a character stopping half a
// unit short of one shore while standing on open water at the other, and being
// told you are paddling while stood on grass. `rx` and `ry` come from config,
// which splits the mean radius `r` by the drawing's shape.
//
// Both work in the lake's own tangent frame: project onto east and north, turn
// those into angles, and measure against the two radii.

const _lc = new THREE.Vector3();
// ------------------------------------------------------------------- biomes

const _bc = new THREE.Vector3();

// How much of a biome is in force at a spot: 1 in its middle, 0 out on the open
// meadow, and a long smooth wash between. Its own function, and the ONLY reader
// of `CONFIG.biomes`, so the ground texture, the grass and the ground cover
// cannot end up disagreeing about where a field ends — which is the same reason
// `inLake` exists and every rule about water goes through it.
//
// Smoothstepped rather than ramped linearly. A linear fade has a corner at each
// end, and a corner in a border is a rim you can see from the air.
export function biomeWeight(dir, biome) {
  dirFromLatLon(biome.lat, biome.lon, _bc);
  const arc = Math.acos(Math.max(-1, Math.min(1, dir.dot(_bc))));
  if (arc <= biome.r) return 1;
  const t = 1 - (arc - biome.r) / biome.fade;
  if (t <= 0) return 0;
  return t * t * (3 - 2 * t);
}

// Every biome touching a spot, strongest first, with the weights ALREADY
// normalised so they never sum past one. Two patches whose washes overlap would
// otherwise both claim the ground there and paint it twice as far from meadow as
// either asked for.
export function biomesAt(dir, biomes, out = []) {
  out.length = 0;
  let total = 0;
  for (const b of biomes) {
    const w = biomeWeight(dir, b);
    if (w > 0) { out.push({ biome: b, w }); total += w; }
  }
  if (total > 1) for (const e of out) e.w /= total;
  out.sort((a, b) => b.w - a.w);
  return out;
}

const _le = new THREE.Vector3();
const _ln = new THREE.Vector3();

// HOW FAR OUT THE SHORE IS at a bearing round the lake, as a multiplier on the
// ellipse — 1 is the plain ellipse, 1.1 is a bay bulging out, 0.9 an inlet.
//
// This function is the whole reason the pond stopped being a picture. A drawn
// pond is one shape, and every rule about it — steering, scatter, paddling,
// walking — had to be given a shape simple enough to write down, which is why it
// was an ellipse. Now that the water is BUILT the shape can be anything, and the
// thing to be careful about is exactly what the drawn version got right by
// accident: the water you can see and the water the rules enforce have to be the
// same water. So the wobble lives HERE, next to `inLake`, and the mesh is built
// by calling it rather than by inventing a rim of its own.
//
// Harmonics rather than noise, because the requirement is not "irregular" but
// "closed and smooth". A sum of cosines in θ is periodic by construction, so the
// rim meets itself at θ=2π with no seam to hide, and it is differentiable
// everywhere, which the next function needs.
//
// The coefficients live in config beside the lake they belong to, so two ponds
// are different ponds rather than the same pond twice.
export function lakeRim(theta, lake) {
  const rim = lake.rim;
  if (!rim) return 1;
  let k = 1;
  for (let i = 0; i < rim.length; i += 3) {
    k += rim[i + 1] * Math.cos(rim[i] * theta + rim[i + 2]);
  }
  return k;
}

export function inLake(dir, lake, margin = 0) {
  dirFromLatLon(lake.lat, lake.lon, _lc);
  const along = dir.dot(_lc);
  // Past a quarter turn away there is no lake this size, and atan2 would wrap
  // and start reporting the far side of the planet as wet.
  if (along <= 0) return false;
  localFrame(_lc, _le, _ln);
  const a = Math.atan2(dir.dot(_le), along) / (lake.rx + margin);
  const b = Math.atan2(dir.dot(_ln), along) / (lake.ry + margin);
  const q = a * a + b * b;
  // Well inside the deepest possible inlet, so no bearing has to be worked out
  // at all. This is not only a saving: it is also what keeps the dead centre
  // sane, where atan2(0, 0) has no meaningful answer. `rimLo` is precomputed in
  // config as the smallest the rim can ever be.
  if (q < lake.rimLo * lake.rimLo) return true;
  if (q >= lake.rimHi * lake.rimHi) return false;
  const rim = lakeRim(Math.atan2(b, a), lake);
  return q < rim * rim;
}

// The outward normal of a lake's rim at a point, in the tangent plane there.
//
// This is not the line back from the centre, and the difference matters. For a
// circle the two agree; for a lake nearly twice as wide as it is tall they part
// company badly. Stood near the middle of a long flank, "away from the centre"
// runs mostly *along* the shore, so anything using it to escape the water steps
// straight back into it — which showed up as the walk stopping dead at a rim
// with the throttle wide open. The gradient of the ellipse points genuinely out.
//
// It is the ELLIPSE's gradient, and deliberately not the wobbled rim's. The
// rim adds up to about 13% in and out, which tilts the true outward direction by
// as much as 22° at the steepest part of a lobe — real, but nowhere near the 90°
// it would take to point the wrong way, and everything downstream is built to
// survive an approximate normal already. `inLake` measures in gnomonic angles
// while this is the gradient in that same space, so the two agree only to first
// order even for a plain ellipse, and LEAN_OUT — try the tangent, then
// progressively more of the way out, first dry one wins — is what closes the
// gap. Handing it a normal 22° off is the same kind of wrong it was written for,
// and a couple more rungs of the ladder is the whole cost.
//
// Returns false when there is no sensible normal to give.
export function lakeNormal(dir, lake, out) {
  dirFromLatLon(lake.lat, lake.lon, _lc);
  const along = dir.dot(_lc);
  if (along <= 0) return false;
  localFrame(_lc, _le, _ln);
  const a = Math.atan2(dir.dot(_le), along) / (lake.rx * lake.rx);
  const b = Math.atan2(dir.dot(_ln), along) / (lake.ry * lake.ry);
  out.copy(_le).multiplyScalar(a).addScaledVector(_ln, b);
  // Dead centre has no outward direction at all; any will do.
  if (out.lengthSq() < 1e-16) out.copy(_ln);
  // Flattened against where we are standing, not against the lake's centre.
  out.addScaledVector(dir, -out.dot(dir));
  if (out.lengthSq() < 1e-12) return false;
  out.normalize();
  return true;
}

// Where the rim sits along a bearing, as an angle out from the lake's centre.
// `away` is a unit vector in the tangent plane there. Used to slide a walk that
// would have ended in the water out to the nearest dry shore.
export function lakeReach(lake, away, margin = 0) {
  dirFromLatLon(lake.lat, lake.lon, _lc);
  localFrame(_lc, _le, _ln);
  const a = away.dot(_le) / (lake.rx + margin);
  const b = away.dot(_ln) / (lake.ry + margin);
  const q = a * a + b * b;
  if (q <= 1e-12) return lake.rx + margin;
  // Out along the bearing to the plain ellipse, then on to wherever the rim
  // actually is. Without the second factor a walk sliding out of an inlet would
  // stop on the ellipse and still be in the water, which is precisely the
  // stuck-at-the-rim failure LEAN_OUT exists to rescue — no sense manufacturing
  // more work for it.
  return (1 / Math.sqrt(q)) * lakeRim(Math.atan2(b, a), lake);
}

// --------------------------------------------------------------- buildings
//
// What you cannot walk through. Until this existed the only solid thing on the
// planet was water, and you could stroll clean through the house.
//
// Circles, not ellipses, and that is why this is short against the lakes'
// hundred lines. A lake is drawn 1.84 times wider than it is tall, so its rim
// needs a gradient to point out of; a building's silhouette is the same width
// from every direction and a plain cap is exactly right. The outward direction
// is then just the way back from the centre, with no ellipse to correct for.
//
// It does NOT follow that sliding along one is simpler, and it was tempting to
// assume so. A shore needs its lean-out ladder because the tangent to an
// ellipse is only right to first order; a wall needs the same ladder for an
// unrelated reason — the tangent to a circle holds your distance constant, and
// constant is not good enough once you have been stopped ON the boundary and
// every step starts from it. See _stepOrSlide.
//
// A building used to be a solid DISC — you could not be inside one at all,
// which was true while the inside did not exist. The house's inside exists
// now: it is part of the same world, entered through a real gap in the wall.
// So a building may carry three more fields, and with them the cap becomes an
// ANNULUS with a doorway:
//
//   inner    an arc, in radians. Inside it you are in the room and free; the
//            wall band is between `inner` and `r`. It is NOT the geometric
//            wall less a margin — it is where the dome has curled in far
//            enough that letting the camera closer would push the near plane
//            through the shell. The same number the old room called
//            walkRadius, for the same reason.
//   gapDir   a unit tangent at the centre, pointing along the door's bearing.
//   gapCos   cos of the door gap's half-width, as a bearing angle about the
//            centre. Within it the band does not block, and that wedge is the
//            whole of how you get in: no state, no trigger, no other side —
//            just a hole where the wall is not.
//
// A building without `inner` keeps the old meaning: solid all the way through.
//
// Registered rather than configured: the radius is measured off the drawn art
// in scene.js, the same measurement the ground cover already uses to keep
// flowers from sprouting through the floor. One source of truth, so a redrawn
// house is a differently shaped wall without a number being touched.
const BUILDINGS = [];

export function setBuildings(list) {
  BUILDINGS.length = 0;
  for (const b of list) BUILDINGS.push(b);
}

// The registered walls: `{ dir, r, inner?, gapDir?, gapCos? }` each, arcs in
// radians. Read by anything that needs to walk somebody TO a building rather
// than merely keep them out of one.
export function buildings() { return BUILDINGS; }

// Whether a spot sits in the door's bearing wedge — the one stretch of the
// band that is a way through rather than a wall.
function inGap(dir, b) {
  _bT.copy(dir).addScaledVector(b.dir, -dir.dot(b.dir));
  if (_bT.lengthSq() < 1e-12) return false;
  return _bT.normalize().dot(b.gapDir) >= b.gapCos;
}

// Which building's WALL a spot is inside, or null. Returns the building rather
// than a boolean because every caller that cares then wants to know which one.
//
// The margin widens the outer edge only. The inner edge is `inner` exactly:
// that arc is already the conservative camera-clearance line rather than the
// wall itself, and shaving a further margin off it would shrink the room for
// no one's benefit.
export function inBuilding(dir, margin = 0) {
  for (const b of BUILDINGS) {
    const along = dir.dot(b.dir);
    if (along <= Math.cos(b.r + margin)) continue;   // clear outside
    if (b.inner === undefined) return b;              // solid through
    if (along >= Math.cos(b.inner)) continue;         // indoors, and free
    if (inGap(dir, b)) continue;                      // in the doorway
    return b;
  }
  return null;
}

// The way out of a building's wall at a point, in the tangent plane there.
// False when there is no sensible direction to give — standing exactly on the
// centre.
//
// For a banded building "out" depends on which side of the wall you are
// against: pressed on it from indoors, the way out is back toward the middle
// of the room, so the outward tangent flips. Decided from the point given —
// callers pass where they are STANDING, which is always on a legal side.
export function buildingNormal(dir, b, out) {
  out.copy(dir).addScaledVector(b.dir, -dir.dot(b.dir));
  if (out.lengthSq() < 1e-12) return false;
  out.normalize();
  if (b.inner !== undefined
    && dir.dot(b.dir) > Math.cos((b.inner + b.r) / 2)) out.negate();
  return out;
}

// A spot moved out of any wall it landed in, to the nearest legal ground. For
// the cases that name a destination outright — a tap, a character choosing
// where to stroll — where stopping short would leave them shoving at a wall
// with a destination they can never reach.
//
// For the house that nearest ground can now be INSIDE: a tap through the open
// door that lands on the band's inner half resolves to the room, which is
// what the tap meant.
export function keepOutside(spot, margin = 0) {
  for (const b of BUILDINGS) {
    const along = spot.dot(b.dir);
    if (along <= Math.cos(b.r + margin)) continue;
    if (b.inner !== undefined) {
      if (along >= Math.cos(b.inner)) continue;      // already indoors
      if (inGap(spot, b)) continue;                  // in the doorway
    }
    if (!buildingNormal(spot, b, _bOut)) {
      // Dead centre, so no bearing to keep; any will do.
      localFrame(b.dir, _le, _ln);
      _bOut.copy(_ln);
    }
    // buildingNormal already turned _bOut toward the nearer side; the edge to
    // land on follows the same choice.
    const inward = b.inner !== undefined && along > Math.cos((b.inner + b.r) / 2);
    const edge = inward ? b.inner : b.r + margin;
    if (inward) _bOut.negate();
    spot.copy(b.dir).multiplyScalar(Math.cos(edge))
      .addScaledVector(_bOut, Math.sin(edge)).normalize();
  }
  return spot;
}

const _bOut = new THREE.Vector3();
const _bT = new THREE.Vector3();

// -------------------------------------------------------------------- scenery
//
// The tall props, as `{ dir, r }` exactly like the walls above — and registered
// separately precisely BECAUSE they are the same shape doing a different job.
//
// THIS LIST IS ABOUT SIGHTLINES, NOT COLLISION. What solidity a prop has lives
// in SOLIDS below, and the two carry different radii on purpose: `r` here is the
// DRAWN half-width — the whole canopy — because what this answers is "would
// standing there put a tree between me and the person I tapped", and a canopy
// blocks a view its trunk does not.
//
// A tree stands exactly where a tap was about to set you down. These are cards
// four to six units across on a planet whose horizon is 4.8 off, so one centred
// within its own half-width of your eye is not scenery in the frame — it IS the
// frame, and the friend you tapped is somewhere behind it. That is a framing
// problem rather than a collision, and it gets a framing fix: the arrival reads
// this list to choose which side of somebody to come at them from.
//
// The stumps are in it despite being knee-high to a sightline test, and now
// only out of habit — they were put here for a second reader, the player's
// towed body, which asks SOLIDS instead now that a stump is one. Left in
// because a stump between you and a friend is still a thing an arrival may as
// well decline, and the cost of declining a bearing is one more round of a
// sixteen-bearing search.
const SCENERY = [];

export function setScenery(list) {
  SCENERY.length = 0;
  for (const s of list) SCENERY.push(s);
}

// Which tall prop's card a spot falls inside, or null. Same test as inBuilding
// and the same shape of answer, so the two read alike at the call site even
// though only one of them is allowed to stop you.
export function inScenery(dir, margin = 0) {
  for (const s of SCENERY) {
    if (dir.dot(s.dir) > Math.cos(s.r + margin)) return s;
  }
  return null;
}

// --------------------------------------------------------------------- solids
//
// What you cannot walk through, out on the grass — `{ dir, r }` again, and the
// third list in this file wearing that shape.
//
// It reverses a decision this file used to argue for at length, so the argument
// is worth keeping rather than quietly deleting. The old rule was that the water
// and the house were the only solid things on the planet: a lake because you
// would be IN it, the house because it is a building with an inside, and
// everything else — trees, stumps, the bench, the cast — walkable straight
// through, on the grounds that this is a place you wander and the things in it
// are what you came for rather than obstacles to be routed around.
//
// That is still exactly right ABOUT THE CAST, and they are not in this list.
// Nothing stops you walking up to somebody and standing as close as you like.
// It was never right about a tree. A tree is not a thing you came to stand
// inside; walking through one is not a freedom anybody wanted, it just reads as
// the tree not being there — and the app already had a pile of machinery
// apologising for that. The trunk deletes itself while you stand in it (see
// _syncTrunk), the towed body treads around trunks the camera sails through, and
// the arrival picks its way around canopies the walk ignores. Three separate
// workarounds for one missing rule.
//
// THE RADIUS IS THE TRUNK'S, NOT THE CARD'S, and that distinction is the whole
// difference between this feeling like a tree and feeling like a bug. A tree's
// drawn width is its canopy — near two units on an ordinary one and over four on
// a landmark — and leaves are not something you bump into. Collide on the drawn
// width and you stop dead a full stride from anything visible, in mid-air, which
// is the single most recognisable way for a game to feel broken. Each entry's
// radius is measured off the geometry that was actually built (trunkRadius and
// stumpRadius in foliage.js, at the height where the roots meet the grass, since
// that is what your feet arrive at), so a redrawn tree brings its own footprint
// and no number here has to be told.
//
// Circles, like the buildings and unlike the lakes, so the way out of one is
// just the way back from its centre — there is no ellipse to take a gradient of
// and no inside to be on the wrong side of.
const SOLIDS = [];

export function setSolids(list) {
  SOLIDS.length = 0;
  for (const s of list) SOLIDS.push(s);
}

// ...and the same again for a second batch, because the two sets are worked out
// at opposite ends of a long build: the props on the grass are known as soon as
// the scatter is laid, and the furniture only once the room inside the house has
// been built around them. Appending rather than re-setting keeps the caller from
// having to hold the first list alive across the whole of that.
export function addSolids(list) {
  for (const s of list) SOLIDS.push(s);
}

// The registered props. Read by anything that has to know where they are rather
// than merely whether it is standing in one.
export function solids() { return SOLIDS; }

// Which prop a spot is inside, or null. Returns the prop for the same reason
// inBuilding returns the building: every caller that cares then wants to slide
// around the thing it hit, and asking again from outside would come back empty.
//
// `feet` is how high off the ground the thing asking is, and it is what turns a
// wall into a step. A prop with a `top` stops blocking once your feet are level
// with it — you are ON it rather than walking at it — and a prop without one is
// a wall at any height, which is every tree and the bench. The default is the
// floor, so anything that does not think about height (the cast, a tap looking
// for somewhere to put you) gets the old answer: everything blocks.
export function inSolid(dir, margin = 0, feet = 0) {
  for (const s of SOLIDS) {
    if (dir.dot(s.dir) <= Math.cos(s.r + margin)) continue;
    if (s.top !== undefined && feet >= s.top - 1e-4) continue;   // stood on it
    return s;
  }
  return null;
}

// The height of whatever you would come to rest on at a spot, falling from
// `feet`. Zero is the planet itself, which is the floor under everything.
//
// `topR` rather than `r`, and the difference is a real one on a stump: `r` is
// the root flare where it meets the grass and the top is four fifths of that,
// so the two disagree by a boot's width all the way round. Standing on the wider
// one would leave you out over the edge with nothing under your feet — which is
// exactly the look this whole phase is meant to buy, and exactly the way to lose
// it. What blocks you is the flare; what holds you up is the cut face.
//
// The highest thing under you wins, so a stack — a cushion on a rug on the floor
// — resolves to the top of the pile rather than to whichever was registered
// first. Nothing here stacks yet; it costs one comparison to not care.
// `margin` widens every top by the same amount, and it is the ledge under your
// heels: without it a surface sampled once a frame drops you the instant your
// centre clears the rim, so walking off a table begins the fall while you still
// appear to be standing on it.
export function groundUnder(dir, feet, margin = 0) {
  let top = 0;
  for (const s of SOLIDS) {
    if (s.top === undefined || s.top <= top) continue;
    if (s.top > feet + 1e-3) continue;                  // still above you
    const edge = (s.topR !== undefined ? s.topR : s.r) + margin;
    if (dir.dot(s.dir) <= Math.cos(edge)) continue;
    top = s.top;
  }
  return top;
}

// WHICH solid would hold something up at a spot, rather than how high it is.
// groundUnder answers the height and that is all a walk needs; setting an
// object down needs the surface ITSELF, because the question "is this too near
// the edge" can only be asked of a particular edge.
//
// Same rules as groundUnder, so the two can never disagree about what you are
// standing on: `topR` is the face rather than the flare, and the highest wins.
export function perchUnder(dir, feet, margin = 0) {
  let best = null;
  for (const s of SOLIDS) {
    if (s.top === undefined || s.top <= 0) continue;
    if (best && s.top <= best.top) continue;
    if (s.top > feet + 1e-3) continue;
    const edge = (s.topR !== undefined ? s.topR : s.r) + margin;
    if (dir.dot(s.dir) <= Math.cos(edge)) continue;
    best = s;
  }
  return best;
}

// WHERE A RAY MEETS A SURFACE YOU COULD SET SOMETHING ON, or null. `origin`
// and `dirv` are in planet-centred space, `dirv` unit.
//
// This exists because picking against the GLOBE cannot answer the question a
// tap on a stump is asking. `pickGround` raycasts the sphere, so aiming at a
// stump's cut face returns the grass BEHIND the stump — measured at 2.34 units
// out when the stump itself was 1.4 away — and every rule downstream then
// reasons about a patch of meadow the player was not pointing at. The reach
// test failed, `perchUnder` found nothing, and setting a bear on a stump was
// quietly impossible.
//
// No mesh is consulted, and none should be. Every standable thing here is a cap
// on a sphere: a disc of angular radius `topR` at height `top`. So the exact
// answer is a ray against the SHELL at radius R+top, followed by asking whether
// the hit lies inside the cap — two lines of quadratic and a dot product, for a
// list that is a handful long. Raycasting the stump geometry would be slower,
// would need the built meshes kept to hand, and would answer a slightly
// different question: where the ray meets the WOOD, including its flared sides,
// which is not a surface anything can be set down on.
const _perchHit = new THREE.Vector3();

export function perchAlongRay(origin, dirv, R) {
  let best = null;
  let bestT = Infinity;
  for (const s of SOLIDS) {
    if (s.top === undefined || s.top <= 0) continue;
    const rad = R + s.top;
    // |origin + t·dirv|² = rad², with dirv unit so the leading term is 1.
    const b = 2 * origin.dot(dirv);
    const c = origin.lengthSq() - rad * rad;
    const disc = b * b - 4 * c;
    if (disc < 0) continue;
    // The NEAR root only. The far one is the same shell on the opposite side of
    // the planet, which is never the thing being pointed at.
    const t = (-b - Math.sqrt(disc)) / 2;
    if (t <= 0 || t >= bestT) continue;
    _perchHit.copy(origin).addScaledVector(dirv, t).normalize();
    const edge = s.topR !== undefined ? s.topR : s.r;
    if (_perchHit.dot(s.dir) <= Math.cos(edge)) continue;
    bestT = t;
    best = { dir: _perchHit.clone(), top: s.top, solid: s };
  }
  return best;
}

// The way out of a prop at a point, in the tangent plane there. False when there
// is none to give — standing exactly on its centre.
export function solidNormal(dir, s, out) {
  out.copy(dir).addScaledVector(s.dir, -dir.dot(s.dir));
  if (out.lengthSq() < 1e-12) return false;
  out.normalize();
  return true;
}

// A spot moved out of any prop it landed in, to the nearest ground outside it.
// keepOutside's twin, for the cases that name a destination outright — a tap, an
// arrival, a character choosing where to stroll — where a destination inside a
// trunk is one they can walk at forever without reaching.
//
// One pass, so a spot ejected from one prop into another is left in the second.
// That cannot currently happen: the scatter gives every prop a berth of at least
// 1.3 units from the landmarks and lays the rest on a golden-angle spiral over a
// radius-8 sphere, so no two footprints here overlap or come near it.
export function keepOffSolids(spot, margin = 0) {
  for (const s of SOLIDS) {
    if (spot.dot(s.dir) <= Math.cos(s.r + margin)) continue;
    if (!solidNormal(spot, s, _bOut)) {
      // Dead centre, so no bearing to keep; any will do.
      localFrame(s.dir, _le, _ln);
      _bOut.copy(_ln);
    }
    const edge = s.r + margin;
    spot.copy(s.dir).multiplyScalar(Math.cos(edge))
      .addScaledVector(_bOut, Math.sin(edge)).normalize();
  }
  return spot;
}

// A spot pushed out of a circle — a prop's or a building's — and slid AROUND
// its rim toward wherever the caller is bound, by at most `maxStep` radians of
// bearing. keepOutside's travelling sibling, for a body in transit rather than
// a destination.
//
// The push and the slide are one move on purpose. A plain radial ejection is
// correct for a destination and a TRAP for a follower: the leash pulls the
// player's body straight at its anchor, and when that line runs through the
// circle's middle, pull-in and push-out land on the same rim point every frame
// — measured stuck there for good, the body pinned against a tree while the
// camera sailed away. Ejecting to a bearing stepped toward the anchor's side
// makes every frame progress around the rim instead, and once the way to the
// anchor no longer crosses the circle, this stops firing and the tow has its
// straight line back.
//
// The camera never comes through here: walking through the scenery is still
// yours to do (see the note above), and it is only the player's drawn body
// that treads around things.
export function slideAround(spot, circle, toward, margin = 0, maxStep = 0) {
  const edge = circle.r + margin;
  localFrame(circle.dir, _le, _ln);
  const bx = spot.dot(_le);
  const by = spot.dot(_ln);
  // Dead centre leaves no bearing to keep, so any will do; east is as good.
  let bearing = (bx * bx + by * by < 1e-12) ? 0 : Math.atan2(by, bx);
  let want = Math.atan2(toward.dot(_ln), toward.dot(_le)) - bearing;
  if (want > Math.PI) want -= Math.PI * 2;
  if (want < -Math.PI) want += Math.PI * 2;
  bearing += Math.sign(want || 1) * Math.min(Math.abs(want), maxStep);
  spot.copy(circle.dir).multiplyScalar(Math.cos(edge))
    .addScaledVector(_le, Math.sin(edge) * Math.cos(bearing))
    .addScaledVector(_ln, Math.sin(edge) * Math.sin(bearing))
    .normalize();
  return spot;
}

const _view = new THREE.Vector3();
const _ray = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _up = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _face = new THREE.Vector3();
const _right = new THREE.Vector3();
const _m = new THREE.Matrix4();

// How far gone a card is toward being looked at straight down its own normal.
// 0 until the last half-degree of the swing is worth worrying about, 1 once the
// facing carries no information at all.
function ramp(alignment) {
  return Math.min(1, Math.max(0, (alignment - 0.86) / 0.12));
}

// Stand a flat card up on the planet and turn it about its own normal to face
// the camera. Two axes, decided separately, and that separation is the point.
//
// UP is the surface normal itself. It used to be the normal *projected
// perpendicular to the view axis*, which made the card exactly square to the
// screen — and quietly leaked your look pitch into the world. Work the
// projection out and the card tilts by precisely the pitch angle, pivoting about
// its base. With restLookPitch -0.30 and maxLookPitch 0.30 that is a 34 degree
// swing: at rest every card reclines 17 degrees away from you, and swiping up
// tips it 17 degrees toward you. On a 4.9-unit tree the crown travels about 2.9
// units through the world and ends up 1.4 units nearer your eye, so a tree you
// look up at grows and leans over you instead of reading as tall. It also nods
// live while your thumb moves, and it drifts off its own planted shadow.
//
// Nothing standing on a planet should LEAN for where you are looking. So up is
// the normal, whatever the facing below decides about the swing.
//
// FACING comes in two flavours, picked by the caller, and the split is by what
// the thing is rather than where it stands.
//
// Scenery (`alongView`) squares to the shared view axis — the camera's own
// forward, negated — never to its own ray. The ray tracks your POSITION, and
// that was the "forced" in the old feel: turning your head moved no card,
// because a position-driven facing is blind to yaw, but every step of a stroll
// re-aimed every card in reach by its own amount — measured at 28.7° on a tree
// 3.2 units off, across a 1.5s sidestep in which the gaze itself turned 0° —
// so walking past a bush read as the bush turning to watch you go. The view
// axis is blind to translation instead: walk past a thing and it holds still
// and parallaxes honestly; turn to look at a thing and it faces you, because
// looking at it is what points the axis there. A swing that only happens while
// your own gaze is sweeping is one the eye cannot catch — the card stays
// face-on throughout, so there is no silhouette change to catch it by.
//
// The slat this comment used to warn about does not happen, and the reason is
// the one useful thing about squaring to the view rather than to a ray: the
// card's width axis comes out parallel to the image plane, and a plane
// parallel to the image plane projects at ONE scale everywhere on screen. The
// obliqueness at the edge of the frame and the perspective stretch at the edge
// of the frame are the same quantity pulling opposite ways, so they cancel —
// which is the whole reason screen-aligned billboards are the usual choice.
// Measured by sweeping a tree 6.9 units off right across the frame: 200.8px
// wide at the middle, 201.4px at screen x 0.97, a spread of 0.3%. A ray facing
// is the one that cannot hold that, since its width axis tips out of the image
// plane by the object's own off-axis angle.
//
// The two facings converge for anything centred or distant anyway, so the far
// view and the sky-view map render as they always did.
//
// Characters keep the per-object ray (the default). Somebody who stays turned
// to you as you circle them is eye contact, and is the point of them — it was
// the furniture doing it that read as staged.
//
// What comes back is honest foreshortening, which is the other half of reading
// as tall: the card compresses along its up axis by the cosine of the camera's
// elevation above the object. That is the cue a screen-square card can never
// give, because it presents full height exactly when a real object would
// compress.
//
// Rotating about the normal does have one degenerate spot the old scheme did not
// — look straight down a card's normal and it goes edge-on — and that is what
// the blend below is for. It is the same ramp, on the same quantity, as before.
//
// `standoff` — half the card's height — is how far to push it out along the
// normal once it has gone face-on, and it fixes the other half of that same
// degeneracy. Staying upright on screen is not the same as standing up in the
// world: with "up" swung round to lie across the ground, the card comes to rest
// IN the surface's tangent plane. Measured in the far view, a 1.5-unit tree in
// the middle of the screen ends up with its top 0.14 above the ground and a
// character's head 0.37 — against grass standing 0.39 and flowers 0.43. Nothing
// is standing on the planet any more; it is lying in the cover.
//
// Lifting by half the height puts every point of the card at least that far out,
// which clears the cover with room to spare. It does NOT ride the up blend's
// ramp alone: flattening is owed to anything the eye sits over, but lifting only
// to what the view axis itself runs down — see the gate at the code.
//
// The lift runs along the ray to the camera, NOT along the normal. Once a card
// is face-on the two point the same way, so they buy the same clearance — but a
// shift along the view ray is the only shift that cannot move a point on screen,
// and the card has to stay over the shadow it casts. Lifting along the normal
// was measured drifting it 10px off the shadow mid-ramp, on a sprite 50px tall,
// which reads as the thing floating. The cost of going along the ray instead is
// that the card comes nearer and so grows — 6% at the altitude the sky button
// puts you, 11% at worst on the way up, eased in by the ramp. Cancelling that
// would mean writing a scale here, which character.js is already using for the
// breath.
export function orientBillboard(obj, worldPos, normal, camera, standoff = 0, alongView = false) {
  camera.getWorldDirection(_view);

  // The ray to this object's own camera position, reused below for the facing
  // and for the standoff lift. The lift keeps the BASE ray deliberately: a
  // shift along the base's own line to the camera is the one shift that cannot
  // move the base on screen, and the base is where the planted shadow sits.
  _ray.copy(camera.position).sub(worldPos);
  const reach = _ray.length();
  if (reach > 1e-6) _ray.multiplyScalar(1 / reach);
  else _ray.copy(_view).negate();

  // A card swinging about its normal has nothing to swing about when it is
  // looked at straight down that normal, and goes edge-on. That is measured on
  // the ray from the card's CENTRE — worldPos plus standoff along the normal,
  // which both callers pass as half the card's height — never from its base.
  // The base ray steepens whenever you stand near anything, however tall it is:
  // 0.4 from a 4.8-unit tree it ran 0.96 down the normal, the blend opened, and
  // the tree lay 64 degrees over — "beside a tall thing" was reading as "above
  // a small thing", and things toppled flat as you walked up. From the centre
  // the same spot reads 0.83 and the tree stands. Eye above the centre is the
  // honest test for edge-on: it means more than half the card sits below your
  // line of sight. And with the blend shut, up IS the normal — so nothing you
  // do with the look pitch can lean a card you are stood beside.
  //
  // Two places still reach it. Whoever is in the middle of the far view, where
  // the camera is straight overhead and centre and base agree to within a few
  // degrees; and the ground cover your eye genuinely sits over, whose centre is
  // down at your shins. Both get the same rescue for UP — but not, below, for
  // the lift.
  //
  // The dot is SIGNED, not absolute, and the sign is doing real work. Geometry
  // says edge-on is symmetric — straight below a card's centre reads down its
  // length just as straight above does — but on a planet the negative side
  // cannot happen honestly: the base sits on the ground, so an eye under the
  // centre along the normal is an eye you pressed against a card taller than
  // you, not one that slipped underneath it. With the absolute value, hugging
  // the trunk and looking up opened the blend from below and leaned the tree
  // 41 degrees down over you; signed, it stands.
  _mid.copy(camera.position).sub(worldPos).addScaledVector(normal, -standoff);
  if (_mid.lengthSq() > 1e-12) _mid.normalize();
  else _mid.copy(_ray);
  const blend = ramp(normal.dot(_mid));

  // The lift is gated on the view axis AS WELL as the ray, because being over a
  // thing is not the same as looking down it. Cross the planet at a middling
  // altitude and the foreground is full of cards whose rays run down their
  // normals while the view axis passes obliquely overhead: ray-keyed alone,
  // each of those flattened AND lifted — at that height the lift is a fifth of
  // the whole reach, the card is units wide, and its edges parallax against the
  // grass while its shadow stays down on the surface. A whole foreground of
  // paper hovering over its own shadows. Gated, those cards recline about their
  // anchored base and stay grounded; the lift survives only where the view axis
  // itself runs down the normal, which is the far view over the disc centre —
  // the one place the card genuinely lies in the tangent grass and needs pushing
  // clear. There the two ramps agree and nothing changes.
  const liftBlend = blend * ramp(Math.abs(normal.dot(_view)));

  _up.copy(normal);
  if (blend > 0) {
    // The camera's own up, made perpendicular to the RAY. Perpendicular to the
    // view axis — the obvious reading of "upright on screen", and what this used
    // to do — is only the same thing for something near the middle of the view.
    // For the card at your feet the two come apart badly: the ray points steeply
    // up past you while the view axis points off across the planet, and a
    // view-perpendicular up lands very nearly along the ray. Measured 0.4 from a
    // trunk, that collapsed the card to 0.016 of its height — edge-on, worse
    // than the pancake it was meant to rescue. Against the ray, the up axis is
    // perpendicular to the line of sight by construction, so the card always
    // presents its full area, and it still reads upright because the ray and the
    // view axis only diverge for things too close to be anywhere but centre-ish.
    _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    _camUp.addScaledVector(_ray, -_camUp.dot(_ray));
    if (_camUp.lengthSq() < 1e-8) {
      // Camera rolled so its own up runs along the ray. Anything perpendicular
      // will do; the normal is the one with meaning here.
      _camUp.copy(normal).addScaledVector(_ray, -normal.dot(_ray));
      if (_camUp.lengthSq() < 1e-8) _camUp.set(_ray.y, -_ray.x, 0);
      if (_camUp.lengthSq() < 1e-8) _camUp.set(1, 0, 0);
    }
    _camUp.normalize();
    _up.lerp(_camUp, blend);
    // Only if the two were exactly opposed, which the lerp cannot survive.
    if (_up.lengthSq() < 1e-8) _up.copy(_camUp);
  }
  if (_up.lengthSq() < 1e-8) _up.set(0, 1, 0);
  _up.normalize();

  // As square to the facing source as the up axis allows. With up on the
  // normal this is the signpost swing. Once up has blended to the camera's own
  // up — made perpendicular to the RAY above — a ray facing lands on the ray
  // itself, exactly square to the line of sight; a view facing lands within
  // the object's own off-axis angle of it, which in the far view over the disc
  // centre — the one place the rescue fully opens — is a few degrees.
  if (alongView) _face.copy(_view).negate();
  else _face.copy(_ray);
  _face.addScaledVector(_up, -_face.dot(_up));
  if (_face.lengthSq() < 1e-8) {
    // Camera sitting on the up axis: no facing is visible from there anyway, so
    // this only has to be stable and perpendicular, never correct.
    _face.copy(_view).addScaledVector(_up, -_view.dot(_up)).negate();
    if (_face.lengthSq() < 1e-8) {
      _face.set(_up.y, -_up.x, 0);
      if (_face.lengthSq() < 1e-8) _face.set(1, 0, 0);
    }
  }
  _face.normalize();

  _right.crossVectors(_up, _face);
  _m.makeBasis(_right, _up, _face);
  obj.quaternion.setFromRotationMatrix(_m);

  // Set in the parent's frame, which holds position only and is never rotated,
  // so a direction needs no basis change on the way in. Both callers rely on
  // that: see the anchor in scene.js and the root in character.js.
  //
  // worldPos comes from inside the floating world group while the camera sits
  // outside it, so this ray is off by the planet's bob — a tenth of a unit
  // against twenty or more, which is a fraction of a pixel and not worth
  // threading the group's offset through to fix.
  //
  // On foot the gate makes the lift structurally impossible, not merely capped:
  // the pitch clamp stops the view axis at 0.95 below level, and the ramp does
  // not open until 1.04 — so nothing you can do standing on the ground lifts a
  // card. That margin is load-bearing: steepen minLookPitch past -1.04 and the
  // lift comes back on foot. The reach/6 cap stays anyway, as the guard against
  // exactly that — it stops a big prop's standoff being pushed through the
  // camera along a two-unit ray, and in the far view, where the standoff is a
  // twentieth of the reach, it never binds.
  if (standoff > 0 && liftBlend > 0) {
    obj.position.copy(_ray).multiplyScalar(Math.min(standoff * liftBlend, reach / 6));
  } else {
    obj.position.set(0, 0, 0);
  }
}
