// The placement peephole — the workbench behind peek.html.
//
// Same boot as the goldens rig, same modules that decide what a pixel is, and
// the opposite temperament: goldens freezes the world to compare it with
// itself, this one keeps it running and simply refuses to move the camera.
// It exists for authoring the furniture tables — stand exactly where a reader
// of the config would stand, look exactly at the piece in question, and turn
// its numbers against what is actually on screen.
//
// Driven entirely by the query string:
//
//   peek.html?home=0&at=-0.10&out=1.0&look=-0.60&lookOut=2.39&phase=noon
//
//   home      which home, as an index into globe.homes (0 house, 1 cave)
//   at, out   where the EYE stands — a bearing round the room and a distance
//             out from the middle, the same two numbers every furniture entry
//             is written in
//   look, lookOut   what it is squared up with, as the same pair
//   phase     morning | noon | evening | night
//   pitch     optional look pitch override, radians up from the resting one
//   hold      an art name to put in the HAND — the sasumata is why. The slot
//             pose can be turned live: hx/hy (frame fractions), hh (height
//             fraction), turn/tip (holder radians), each defaulting to what
//             main.js ships, so a bare `hold=pinkweapon` shows the game's own
//             grip and a parameter shows a candidate for it.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CAST } from './cast.js';
import { Globe } from './scene.js';
import { PlanetCamera } from './camera-control.js';
import { Character } from './character.js';
import { loadArt } from './assets.js';
import { PHASES } from './daylight.js';
import { BUILD } from './furniture.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

const HOME = num('home', 0);
const AT = num('at', 0);
const OUT = num('out', 1.0);
const LOOK = num('look', 0);
const LOOK_OUT = num('lookOut', 2.0);
const PITCH = q.has('pitch') ? Number(q.get('pitch')) : undefined;
const PHASE = PHASES.includes(q.get('phase')) ? q.get('phase') : 'noon';

const stage = document.getElementById('stage');
const logEl = document.getElementById('log');

await loadArt(() => {});

const globe = new Globe(stage);
const rig = new PlanetCamera(globe.camera);

globe.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
globe.renderer.setSize(window.innerWidth, window.innerHeight, false);
globe.camera.aspect = window.innerWidth / window.innerHeight;
globe.camera.updateProjectionMatrix();

// The cast, occupancy and the hand-lit lanterns, exactly as goldens boots
// them and for the same reasons — an empty home keeps its lights off, and a
// room photographed with its lantern cold answers no placement question
// asked after dusk.
for (const spec of CAST) {
  const ch = new Character(spec);
  ch.placeAt(spec.home.lat, spec.home.lon, CONFIG.globe.radius);
  globe.addCharacter(ch);
}
globe.setOccupancy(1);
for (const L of globe.roomLights) {
  if (!L.night && !globe.lightIsOn(L)) globe.toggleLight(L);
}
if (globe.fish) {
  for (const m of globe.fish.meshes) m.removeFromParent();
  globe.fish = null;
}

globe.setDaylight(PHASE, { instant: true });

// The same two moves the interiors are placed by — see spotDir in scene.js.
// The shell's frame is read back off the built world rather than rebuilt from
// a world axis (the mistake the lantern's config note records): the door sits
// at bearing 0 by definition, so its direction minus its normal component IS
// tangentAt(0), and every other bearing is a turn of that about the normal.
const home = globe.homes[HOME];
const N = home.sprite.normal.clone();
const _door = new THREE.Vector3();
home.door.getWorldPosition(_door).sub(globe.world.position).normalize();
const t0 = _door.clone().addScaledVector(N, -_door.dot(N)).normalize();
const east = new THREE.Vector3().crossVectors(N, t0);
const R = CONFIG.globe.radius;
const tangentAt = (a) => t0.clone().multiplyScalar(Math.cos(a))
  .addScaledVector(east, Math.sin(a));
const spotDir = (a, out) => {
  const arc = out / R;
  return N.clone().multiplyScalar(Math.cos(arc))
    .addScaledVector(tangentAt(a), Math.sin(arc)).normalize();
};

// standAt writes TARGETS — the smoothed pose would spend its first seconds
// easing over from wherever the rig woke up. settle() pays that debt at once,
// which is the same order goldens' pose() does it in.
rig.standAt(spotDir(AT, OUT), spotDir(LOOK, LOOK_OUT));
if (PITCH !== undefined) rig.lookPitchT = PITCH;
rig.settle();
globe.skyRig.quaternion.identity();

// Something in the hand, for judging the slot pose against the room behind
// it. The weapon copies are posed here the way main.js's HAND_BUILDERS poses
// them, and the default slot numbers below are main.js's HAND_POSE — knowing
// duplicates, both: this is the bench where those numbers get chosen before
// they are written down over there, and the bench showing anything other
// than the shipping grip by default would make every comparison a lie.
const HOLD = q.get('hold');
if (HOLD && BUILD[HOLD]) {
  const g = BUILD[HOLD](0.52).group;
  const weapon = HOLD === 'pinkweapon' || HOLD === 'blueweapon';
  if (weapon) {
    g.rotation.x = -Math.PI / 2;
    g.rotation.z = 0.42;
  }
  const pose = weapon
    ? { x: 0.58, y: -0.62, h: 0.46, w: 0.72, turn: -0.30, tip: 0.10 } : {};
  for (const [param, key] of [
    ['hx', 'x'], ['hy', 'y'], ['hh', 'h'], ['hw', 'w'],
    ['turn', 'turn'], ['tip', 'tip'],
  ]) {
    if (q.has(param)) pose[key] = Number(q.get(param));
  }
  globe.hand.holdMesh(g, Object.keys(pose).length ? pose : undefined);
}

logEl.textContent = `home ${HOME}  eye ${AT}/${OUT}  look ${LOOK}/${LOOK_OUT}  ${PHASE}`;

// The workbench's own drawer: everything on the bench, reachable from the
// console, because a peephole you cannot poke numbers through is only half a
// tool.
window.peek = { globe, rig, home, N, t0, spotDir, tangentAt, THREE };

// ...and its shutter. `await peek.shot('name.png')` writes a PNG into
// ./goldens/ through the dev server's save route — the same route the
// contact sheet uses, and the same reason for going through it rather than
// downloading: it puts the file where something else can open it.
//
// Through a RENDER TARGET rather than off the visible canvas, which is the
// whole point and is borrowed wholesale from goldens.js: a WebGL drawing
// buffer is not guaranteed to survive being read unless the context asked
// for preserveDrawingBuffer, and this one did not. Rendering into a target
// owes nothing to whether the page is on screen, or even composited — so
// this works with the window buried, which is exactly when a workbench is
// most annoying to use.
//
// The camera's own aspect is left alone and the frame is sized to match it,
// so a shot is the page's own composition and not a different crop of it —
// which matters most for the one thing whose placement is written in frame
// fractions, the hand.
window.peek.shot = async (name = 'peek.png', width = 640) => {
  const w = Math.round(width);
  // The page's own aspect when it has one. A tab booted with the window
  // buried measures 0×0 and the camera's aspect comes out NaN — which is
  // precisely the situation this shutter exists for — so fall back to the
  // portrait shape the app is composed for rather than refusing to shoot.
  const aspect = Number.isFinite(globe.camera.aspect) && globe.camera.aspect > 0.05
    ? globe.camera.aspect : 0.65;
  if (globe.camera.aspect !== aspect) {
    globe.camera.aspect = aspect;
    globe.camera.updateProjectionMatrix();
  }
  const h = Math.round(w / aspect);
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const r = globe.renderer;
  r.setRenderTarget(rt);
  r.render(globe.scene, globe.camera);
  const px = new Uint8Array(w * h * 4);
  r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  r.setRenderTarget(null);
  rt.dispose();

  // GL hands rows back bottom-up. Opaque all through, so no premultiply
  // divide — see the same note in goldens.js.
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    img.data.set(px.subarray(src, src + w * 4), y * w * 4);
  }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise((done) => cv.toBlob(done, 'image/png'));
  const res = await fetch('/save', {
    method: 'POST', headers: { 'X-Filename': name }, body: blob,
  });
  return res.ok ? res.text() : `save failed ${res.status}`;
};

// A live loop rather than goldens' frozen shutter: this page is for LOOKING,
// and the boil is part of what is being looked at. dt is zero so the rig
// composes the stand-there pose every frame and nothing walks it anywhere.
let t = 10_000;
function frame() {
  t += 16;
  rig.update(0, t);
  globe.update(t, rig.anchor, rig.isFirstPerson);
  globe.renderer.render(globe.scene, globe.camera);
  requestAnimationFrame(frame);
}
frame();
