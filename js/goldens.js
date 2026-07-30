// The golden snapshot rig — Phase 0 of LIGHTING_REWORK.md.
//
// It renders the world from a fixed list of camera stations at every phase of
// the day and composites the lot into one contact sheet. Two runs of an
// unchanged build must produce byte-identical sheets; that is the whole
// contract, and it is what lets the phases that follow claim "zero visual
// diff" as a measurement rather than an opinion.
//
// WHY THIS IS NOT A MODE INSIDE main.js: main.js is the app — it boots a
// household simulation, a dialogue clock, input handlers and a requestAnimation
// loop, and every one of those is a source of state that differs between two
// runs. This file imports the modules that decide what a pixel IS (scene.js for
// the world and its lighting, daylight.js for the hour, assets.js for the art)
// and none of the ones that decide what happens next.
//
// WHAT MAKES IT DETERMINISTIC, in the order the sources of drift appear:
//
//   the world      scene.js scatters from WORLD_SEED through its own PRNG and
//                  calls neither Math.random nor any clock. Checked: there is
//                  not one occurrence of either in that file.
//   the frame      globe.update(t, …) takes its time as an argument — the bob,
//                  the wind, the breathing markers and the twinkle all hang off
//                  it — so a fixed T freezes every animation in the scene at one
//                  pose rather than merely slowing it.
//   the camera     rig.update(0, T) composes the eye from values settle() has
//                  already brought to rest, so a zero-length frame moves
//                  nothing and the pose is exactly the one asked for.
//   the cast       Character DOES call Math.random, but only to schedule blinks
//                  and wandering — timers, read by update(). Nothing here calls
//                  a character's update, so they hold the pose placeAt gave
//                  them and the randomness never reaches a pixel.
//   the hour       setDaylight(phase, { instant: true }) skips the cross-fade
//                  and applies the phase outright, so no capture can land
//                  part-way through a blend.
//
// The one thing deliberately NOT frozen is the renderer: this draws with the
// real WebGL context, so a sheet is only comparable against another sheet from
// the same machine and browser. That is the intended use — before and after a
// change, on your desk.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CAST } from './cast.js';
import { Globe } from './scene.js';
import { PlanetCamera } from './camera-control.js';
import { Character } from './character.js';
import { loadArt } from './assets.js';
import { PHASES } from './daylight.js';
import { dirFromLatLon } from './sphere.js';

// ------------------------------------------------------------------ the sheet

// Big enough to see a falloff's shape in, small enough that six stations by
// five hours still fits on a screen — it was four until midnight was carved out
// of night, and the sheet takes its columns from PHASES rather than from a
// number here, so it widened by itself. The aspect is portrait-ish because the app
// is: a tile shaped like a desktop window would frame the world differently
// from the phone this is played on.
const TILE_W = 300;
const TILE_H = 400;
const LABEL_H = 20;
const GAP = 6;

// The moment every capture is taken at. Any fixed number is as deterministic as
// any other; this one is simply past the first second, so nothing is caught
// inside a start-up ramp that measures from zero.
const T = 10_000;

// How many times the world is stepped after the camera is moved, before the
// shutter. Several of the scene's per-frame syncs early-out unless something
// has changed and then do their work on the NEXT call — which side of a wall a
// loose piece is on, which of a lamp's two stamps is showing, whether the
// house's glow still has a reason to be lit. One step would photograph the
// frame before those landed. They all settle in two or three; ten is cheap and
// leaves no argument.
const WARMUP = 10;

const stage = document.getElementById('stage');
const sheetEl = document.getElementById('sheet');
const logEl = document.getElementById('log');
const runBtn = document.getElementById('run');
const saveBtn = document.getElementById('save');
const downloadBtn = document.getElementById('download');
const nameEl = document.getElementById('name');
const stampEl = document.getElementById('stamp');

function log(msg) { logEl.textContent = msg; }

// Hand control back to the browser between tiles so the page can paint its
// progress. NOT requestAnimationFrame, which is the obvious choice and stops
// dead the moment the tab goes to the background — a capture started and then
// left alone would sit on its first tile forever, which is precisely what
// somebody does with a run that takes half a minute. A channel message is not
// throttled that way, so the sheet finishes whether it is being watched or not.
const _pump = new MessageChannel();
function breathe() {
  return new Promise((done) => {
    _pump.port1.onmessage = () => done();
    _pump.port2.postMessage(0);
  });
}

// --------------------------------------------------------------------- boot

log('loading art…');
await loadArt(() => {});

const globe = new Globe(stage);
const rig = new PlanetCamera(globe.camera);

// The renderer is pointed at a tile rather than at a window, and globe.resize()
// is never called: it reads window.innerWidth, which is the size of a browser
// somebody happened to leave open and therefore the one measurement in here
// that could differ between two runs on one machine.
globe.renderer.setPixelRatio(1);
globe.renderer.setSize(TILE_W, TILE_H, false);
globe.camera.aspect = TILE_W / TILE_H;
globe.camera.updateProjectionMatrix();

// The cast, placed and then left alone. Placed in the same order and at the
// same home spots main.js uses, because they are tinted by the hour like
// everything else and a lighting sheet without anybody in it would not show
// the one cheat the system has (see CAST_LIFT in scene.js).
for (const spec of CAST) {
  const ch = new Character(spec);
  ch.placeAt(spec.home.lat, spec.home.lon, CONFIG.globe.radius);
  globe.addCharacter(ch);
}

// Everybody home. Occupancy is an input to the lamps — an empty house keeps its
// lights off — so it is pinned rather than left to whatever the household sim
// would have decided, which is exactly the kind of state this rig exists to not
// have. Full is also the reference scene: somebody in, lamp lit.
globe.setOccupancy(1);

// THE LANTERNS ARE LIT, because otherwise the reference scene is not on the
// sheet at all.
//
// A room light comes in two kinds and only one of them follows the clock. The
// bulb is wired in and `night: true`, so dusk switches it on by itself. A
// lantern is `night: false` and starts `on: false` — it is a thing somebody
// walks over and lights, and until they do it burns nothing. Measured at night
// before this existed: both lanterns at burn 0, the whole of the world's lamp
// light coming from one ceiling bulb, and the cave — the shot this entire
// rework is written against — photographed with its lantern cold.
//
// Only the hand-lit ones are touched. The bulb is left to the hour on purpose,
// so the morning and noon tiles go on showing a room with its wired light off,
// which is what those hours look like. toggleLight marks them `manual`, and the
// dusk handback that would take an override back at each turn of the day
// deliberately skips anything that is not `night` — so this holds for the whole
// run rather than being quietly undone at the first phase change.
for (const L of globe.roomLights) {
  if (!L.night && !globe.lightIsOn(L)) globe.toggleLight(L);
}

// THE SHOAL IS SENT AWAY, and it is the one thing in the world this rig
// deliberately does not have.
//
// FishSchool deals its twelve fish out with Math.random — where each one sits
// in the lake, which way it is pointed, how far along its own swim cycle it is
// — all at construction, none of it seeded. That is entirely right for the app
// and it makes the pond untestable: every reload gets a different shoal, so the
// four pond tiles differed across a reload while the other twenty matched, and
// they would have gone on differing forever with nothing wrong.
//
// Removed rather than hidden, because update() would put them back: the guard
// it is behind is on the school existing at all, so dropping the reference is
// what actually stops it. Nothing of interest is lost — the pond tile is here
// to watch the water's colour, its mirror and its glints through a change to
// the lamps, and a fish is a card under the surface that takes no part in any
// of that.
if (globe.fish) {
  for (const m of globe.fish.meshes) m.removeFromParent();
  globe.fish = null;
}

// ------------------------------------------------------------------ stations
//
// Each is a camera pose, resolved at capture time from the world rather than
// written down as a lat/lon: ask the house where its door is and the station
// follows the house if it ever moves. `at` is where you stand and `look` is
// what you are squared up with, both as unit directions from the planet's
// centre — the same pair rig.standAt takes.

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// A scene object's spot on the planet. The world group rides a slow bob, so its
// offset has to come back out before a world position means a direction.
function dirOf(obj, out) {
  obj.getWorldPosition(out).sub(globe.world.position);
  return out.normalize();
}

const house = globe.homes[0] || null;
const cave = globe.homes[1] || null;

// A lamp in a given room, preferring one that stands on the floor over one
// wired to the ceiling: the floor lamp is the reference frame's subject, and it
// is the one whose pool has an edge you can measure.
function lampIn(home) {
  const mine = globe.roomLights.filter((L) => L.home === home);
  return mine.find((L) => !L.ceiling) || mine[0] || null;
}

// Somewhere inside a building, `units` from its middle along the line that runs
// out through its own door. doorstepDir measures from the CENTRE, so anything
// short of the wall radius is indoors — and standAt's keepClear leaves a spot
// alone once it is properly inside, which is why these are given as a distance
// from the middle rather than as a step in from the threshold.
function inside(home, units, out) {
  return globe.doorstepDir(out, units, home);
}

const STATIONS = [
  // THE REFERENCE FRAME. Stood back in the cave looking at the lantern, which
  // is the shot LIGHTING_REWORK.md is written against: one lamp on the floor, a
  // circle of light with an edge, and a wall behind it taking the same circle.
  cave && {
    key: 'cave-lantern',
    pose: () => {
      const L = lampIn(cave);
      return {
        at: inside(cave, 2.6, _v),
        look: L ? dirOf(L.at, _w) : dirOf(cave.door, _w),
      };
    },
  },
  // The other room, which has a wired bulb as well as a lantern — the case
  // where two lights overlap and must not sum past white.
  house && {
    key: 'house-room',
    pose: () => {
      const L = lampIn(house);
      return {
        at: inside(house, 2.0, _v),
        look: L ? dirOf(L.at, _w) : dirOf(house.door, _w),
      };
    },
  },
  // On the threshold looking in. The one shot where the indoor dark and the
  // outdoor dark are both on screen, which is what makes a mismatch between
  // them visible — and the shot a lamp carried through the door crosses.
  // A pace off the threshold, looking at the door. Close enough that the wall
  // fills the frame and the opening is a hole in it — which is what makes this
  // the tile where a light INSIDE the building has to prove it stays inside,
  // and where the glow escaping the openings is judged against the grass.
  house && {
    key: 'doorstep',
    pose: () => ({
      at: globe.doorstepDir(_v, house.spec.doorstep + 1.4, house),
      look: dirOf(house.door, _w),
    }),
  },
  // The whole building, from where the app itself puts you when you arrive.
  //
  // The distance is CONFIG's own spawnBack rather than a number chosen here,
  // and that is worth saying because the first guess — the doorstep plus a
  // comfortable seven units — showed no house at all. On a planet of radius 8
  // the horizon from eye height is about 4.7 units of ground away, so "stand
  // well back to see more of it" walks the subject over the edge of the world.
  // spawnBack is the distance somebody already fitted the dome to a portrait
  // screen at, which is exactly the question being asked here.
  house && {
    key: 'house-outside',
    pose: () => ({
      at: globe.doorstepDir(_v, CONFIG.camera.spawnBack, house),
      look: house.sprite.normal,
    }),
  },
  // Open water, for the mirror and the glints — nothing to do with lamps, and
  // that is the point: it is a tile that must not move while the lamps are
  // rebuilt.
  //
  // Stood off the rim looking across, the step taken as a turn about the
  // world's own axis. That is a shortcut rather than a proper tangent walk and
  // it is a safe one here: this lake sits well away from either pole, where a
  // turn of θ carries you θ·cos(lat) of arc along the ground — 0.70 lands about
  // 4.8 units out, comfortably clear of a rim of 0.35 radians.
  {
    key: 'pond',
    pose: () => {
      const lake = CONFIG.lakes[0];
      const centre = dirFromLatLon(lake.lat, lake.lon, _w);
      _v.copy(centre).applyAxisAngle(WORLD_UP, 0.70).normalize();
      return { at: _v, look: centre };
    },
  },
  // The gaze lifted off the same spot, for the sky, the disc and the stars.
  //
  // The pitch is set on the rig rather than by aiming at something, because
  // there is nothing on the sphere to aim at — and it is maxLookPitch exactly,
  // since anything above that is silently clamped to it and a number the rig
  // does not actually get is a number that will mislead whoever reads this.
  house && {
    key: 'sky',
    pose: () => ({
      at: globe.doorstepDir(_v, CONFIG.camera.spawnBack, house),
      look: house.sprite.normal,
      pitch: CONFIG.camera.maxLookPitch,
    }),
  },
].filter(Boolean);

// ------------------------------------------------------------------- capture

// One render target for the lot, resolved through MSAA so the sheet is worth
// looking at as well as diffing.
const rt = new THREE.WebGLRenderTarget(TILE_W, TILE_H, { samples: 4 });
rt.texture.colorSpace = THREE.SRGBColorSpace;
const pixels = new Uint8Array(TILE_W * TILE_H * 4);

const tileCv = document.createElement('canvas');
tileCv.width = TILE_W;
tileCv.height = TILE_H;
const tileCtx = tileCv.getContext('2d');

// Put the eye at a station and let the world catch up to it.
function pose(station) {
  const p = station.pose();
  if (!p || !p.at) return false;

  // Cloned because `at` and `look` are very often the two shared scratch
  // vectors, and standAt writes through the first while still reading the
  // second.
  const at = p.at.clone();
  const look = (p.look || p.at).clone();

  rig.standAt(at, look);
  // After standAt, which resets the pitch to the resting one — a station that
  // wants to look up has to say so on the far side of that.
  if (p.pitch !== undefined) rig.lookPitchT = p.pitch;
  rig.settle();
  // The idle spin starts when the last touch is old enough. Saying it happened
  // now keeps the planet from creeping under a rig that is meant to be nailed
  // down.
  rig.markTouched(T);

  // THE SKY IS PUT BACK TO SQUARE ONE, and this line is the whole reason the
  // rig was not deterministic when it was first written.
  //
  // _aimSky corrects the dome INCREMENTALLY: each frame it works out the
  // rotation taking the sky's current up to the anchor and premultiplies that.
  // The correction is the minimal one, so it says nothing about the spin ABOUT
  // that up — which means the sky's bearing is a running total of every step
  // the camera has ever taken, not a function of where it is now. Correct for
  // the app, where the eye moves continuously and a sky that re-derived its
  // bearing every frame would swing; fatal here, where the camera teleports
  // between stations and each visit therefore arrives with the dome wherever
  // the previous trip happened to leave it.
  //
  // Measured before this line existed: the four indoor tiles were stable and
  // every outdoor tile differed on every run, which is exactly the signature of
  // this and nothing else — a room cannot see the sky.
  //
  // From identity the first correction is a pure function of the anchor, and
  // every one after it is the identity again, so the warm-up below lands the
  // dome in the same place for a given station every time.
  globe.skyRig.quaternion.identity();

  for (let i = 0; i < WARMUP; i++) {
    rig.update(0, T);
    globe.update(T, rig.anchor, rig.isFirstPerson);
  }
  return true;
}

// The shutter. Straight into a render target rather than off the visible canvas
// because a WebGL drawing buffer is not guaranteed to survive being composited
// unless the context was made with preserveDrawingBuffer, and this one was not.
function shoot() {
  const r = globe.renderer;
  r.setRenderTarget(rt);
  r.render(globe.scene, globe.camera);
  r.readRenderTargetPixels(rt, 0, 0, TILE_W, TILE_H, pixels);
  r.setRenderTarget(null);

  // GL hands rows back bottom-up. No premultiply divide here, unlike
  // Globe.snapshot: that one shoots onto a transparent clear so every edge
  // pixel arrives scaled by its own coverage, while this renders the world
  // opaque and every alpha comes back 255.
  const img = tileCtx.createImageData(TILE_W, TILE_H);
  for (let y = 0; y < TILE_H; y++) {
    const src = (TILE_H - 1 - y) * TILE_W * 4;
    img.data.set(pixels.subarray(src, src + TILE_W * 4), y * TILE_W * 4);
  }
  tileCtx.putImageData(img, 0, 0);
  return tileCv;
}

async function capture() {
  runBtn.disabled = true;
  const cols = PHASES.length;
  const rows = STATIONS.length;

  sheetEl.width = GAP + cols * (TILE_W + GAP);
  sheetEl.height = GAP + rows * (TILE_H + LABEL_H + GAP);
  const ctx = sheetEl.getContext('2d');
  ctx.fillStyle = '#14171C';
  ctx.fillRect(0, 0, sheetEl.width, sheetEl.height);
  ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'middle';

  for (let row = 0; row < rows; row++) {
    const station = STATIONS[row];
    for (let col = 0; col < cols; col++) {
      const phase = PHASES[col];
      log(`capturing ${station.key} / ${phase}  (${row * cols + col + 1}/${rows * cols})`);
      // Yield so the log actually paints between tiles.
      await breathe();

      // The hour first, then the pose: setDaylight walks every material in the
      // world, and doing it after the warm-up would leave the tiles a frame
      // behind the phase they are labelled with.
      globe.setDaylight(phase, { instant: true });
      const placed = pose(station);

      const x = GAP + col * (TILE_W + GAP);
      const y = GAP + row * (TILE_H + LABEL_H + GAP);

      ctx.fillStyle = '#8A93A0';
      ctx.fillText(`${station.key} · ${phase}`, x + 2, y + LABEL_H / 2);

      if (placed) {
        ctx.drawImage(shoot(), x, y + LABEL_H);
      } else {
        ctx.fillStyle = '#232830';
        ctx.fillRect(x, y + LABEL_H, TILE_W, TILE_H);
        ctx.fillStyle = '#6A7280';
        ctx.fillText('no such place in this world', x + 10, y + LABEL_H + TILE_H / 2);
      }
    }
  }

  // Said out loud rather than drawn into the sheet: a build stamp inside the
  // image would differ between every pair of runs and make the diff useless,
  // which is the one thing this file must not do.
  stampEl.textContent = `${rows}×${cols} tiles · ${sheetEl.width}×${sheetEl.height}`;
  log('done. right-click the sheet to copy, or use "save png".');
  runBtn.disabled = false;
}

// The sheet, as PNG bytes.
function sheetBlob() {
  return new Promise((done) => sheetEl.toBlob(done, 'image/png'));
}

// Onto the disk, next to the differ that reads it. Through serve.py's /save
// rather than a download, so a sheet lands with the name it was given and
// dev/compare.py can be pointed straight at it.
saveBtn.addEventListener('click', async () => {
  const raw = (nameEl.value || 'sheet').trim().replace(/\.png$/i, '');
  const name = `${raw.replace(/[^A-Za-z0-9._-]/g, '-')}.png`;
  try {
    const res = await fetch('/save', {
      method: 'POST',
      headers: { 'X-Filename': name, 'Content-Type': 'image/png' },
      body: await sheetBlob(),
    });
    log(res.ok ? `saved goldens/${name}` : `save failed: ${res.status} ${res.statusText}`);
  } catch (err) {
    // The page runs off any static server; only serve.py has the route.
    log(`save failed (is this served by serve.py?): ${err.message}`);
  }
});

// ...and the way out for anybody not using serve.py.
downloadBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `${(nameEl.value || 'sheet').trim()}.png`;
  a.href = sheetEl.toDataURL('image/png');
  a.click();
});

runBtn.addEventListener('click', capture);

// The workbench's own drawer. This page is a tool rather than part of the app,
// and the question it exists to answer — "did that pixel move, and why" — is
// asked from a console. Handing over the live world beats rebuilding it there.
window.__dev = { globe, rig, STATIONS, pose, shoot, capture, T, TILE_W, TILE_H };

log('ready — press capture.');
await capture();
