// What you are holding, where you can see it.
//
// A card parented to the CAMERA, down in the bottom-right the way a held thing
// sits at the edge of your own sight — the one object in the app that lives in
// view space rather than on the planet. In-scene rather than DOM, and that is
// a decision with a reason: the DOM version would be crisp and easy and would
// ignore the hour. A fish held up at night should be moonlit like everything
// else out there, and the moment it joins the scene, `tintables` does that for
// free — the same single write that colours the grass.
//
// It draws with the depth test OFF and a renderOrder above everything in the
// world, because view space is full of lies the depth buffer must not hear:
// the card sits 0.85 out from the eye, which is INSIDE most things you walk
// past, and testing would have every trunk and doorway slice it. Ordered above
// the world and below nothing, it reads as "in your hand" precisely because
// nothing can get between it and you.
//
// The group accepts a canvas today. When the unique items arrive — the bear,
// the kettle — they are built geometry, and the hand will take the mesh itself
// instead of a card: same slot, same bob, the actual little bear in your hand.
// The API is shaped for that (hold swaps CONTENT, the group owns the place).

import * as THREE from 'three';
import { fitHeld, heldMaterials } from './furniture.js';

// Where the held thing sits in the camera's own space, and how big it is.
//
// NOT IN VIEW UNITS ANY MORE, and that is the fix for a real bug rather than a
// tidy-up. A fixed offset in camera space is a fixed offset in a frame whose
// WIDTH depends on the aspect ratio: the same x = 0.135 that sits three
// quarters right on a portrait phone sits nearly centred on a wide desktop
// window, which is exactly how these numbers came to be judged wrong. So the
// placement is written as a FRACTION OF THE FRAME and turned into camera-space
// units against the live aspect every time the hand is filled.
//
// x and y run -1 to 1 from the middle. 0.62 / -0.66 puts it well into the
// bottom-right — clear of the middle where the world is, above the action
// buttons that own the very corner.
//
// These are the DEFAULTS. A built piece may bring its own pose — see
// HAND_POSE in main.js, which sits beside the hand builders for the same
// reason CARRY does: how a copy is posed and where it rides are one
// decision. The sasumata is why the override exists: at the card slot's
// distance it reads as an exhibit, and a thing that size wants gripping low
// in the corner instead. The width cap below still binds by default — a pose
// that says nothing about it cannot push a held thing off a narrow frame —
// but a pose may widen it on purpose, and the sasumata does: fitHeld sizes
// by the LONGEST dimension, so for a pole the width cap is the only number
// that matters, and a pole gripped at your side is supposed to leave the
// frame at the corner.
const AT_FRAC = { x: 0.46, y: -0.55 };
const AT_Z = -0.85;
// How big the held thing is, against BOTH dimensions, and the smaller wins.
//
// Height alone is the obvious measure and is not enough. A phone held upright
// is about 0.46 as wide as it is tall, so a thing sized to a third of the
// HEIGHT is two thirds of the WIDTH — measured, the bear at that size ran off
// the right edge of the frame and out of the screen. The width cap is what
// keeps a held object inside a narrow window without making it tiny on a wide
// one, where the height cap is the binding one instead.
const HEIGHT_FRAC = 0.30;
const WIDTH_FRAC = 0.52;
// Filled in by fit(), from the camera.
const AT = new THREE.Vector3(0, 0, AT_Z);
let HEIGHT = 0.20;
const LEAN = { y: -0.30, z: 0.10 };
// Above every world renderOrder (characters climb from 10, the glints sit at
// 5, the walk marker at 2). Nothing legitimate is up here.
const ORDER = 9000;
// The idle sway: a slow bob and a slower roll, small enough to read as
// breathing rather than as floating.
const BOB = { y: 0.006, rot: 0.03, speed: 1.6 };
// How fast the card arrives in the hand and leaves it. An exponential ease —
// fast out of the gate, soft into place — which reads as "brought up" rather
// than "faded in".
const EASE = 9;

export class Hand {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.rotation.y = LEAN.y;
    this.group.rotation.z = LEAN.z;
    camera.add(this.group);
    this._fit();

    // One material for the hand's whole life, whatever it shows — this is what
    // scene.js registers in `tintables`, and a swap would orphan the tint.
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.card.renderOrder = ORDER;
    this.card.visible = false;
    this.card.frustumCulled = false;
    this.group.add(this.card);

    // The materials of a held BUILT piece that wear the hour.
    //
    // The card above has one material and scene.js has always had it on its
    // tint list. A built piece arrives with materials of its own, made fresh by
    // the hand's builders, and those were on no list at all — so a bear held up
    // at midnight was lit like a bear held up at noon, which is the one thing
    // the note on `mat` above says must not happen. Collected here so whoever
    // owns the hour has something to write to without walking the graph.
    this.heldMats = [];
    this._tex = null;
    // WHAT IS IN THE SLOT: 'card', 'mesh', or null for a hand that has never
    // held anything. Not "what is on screen" — `clear()` deliberately leaves it
    // alone, because a card that has been put away is still a card for as long
    // as it takes to shrink away, and that soft exit is the point of it.
    //
    // It exists because update() has to choose between the slot's two possible
    // occupants and had no straight answer to ask. See the note there.
    this._kind = null;
    // The held piece's own slot pose, when it brought one — see holdMesh.
    this._pose = null;
    // Where the scale is and where it is going: 0 is an empty hand, 1 is the
    // card up. Airborne squashes the target to zero without forgetting it, so
    // landing brings the same card back out.
    this._scale = 0;
    this._want = 0;
    this._air = false;
    this._t = 0;
  }

  // Where the slot is and how big it is, worked out from the camera the hand
  // hangs off rather than from constants. Re-read every time something is put
  // in the hand and on every resize, because both the frame's width and — on a
  // rotated phone — its height change under it.
  //
  // The half-height at AT_Z comes from the vertical field of view; the
  // half-width is that times the aspect. So the same fractions land in the same
  // place on a phone and in a dev window, which they emphatically did not while
  // the offsets were absolute.
  _fit() {
    const cam = this.camera;
    const halfH = Math.tan((cam.fov * Math.PI / 180) / 2) * Math.abs(AT_Z);
    const halfW = halfH * cam.aspect;
    // The held piece's own pose wins where it says anything; the module's
    // numbers answer for the rest. The width cap is deliberately NOT
    // per-piece: it is the frame's own protection, not the piece's taste.
    const p = this._pose || null;
    const fx = p && p.x !== undefined ? p.x : AT_FRAC.x;
    const fy = p && p.y !== undefined ? p.y : AT_FRAC.y;
    const fh = p && p.h !== undefined ? p.h : HEIGHT_FRAC;
    const fw = p && p.w !== undefined ? p.w : WIDTH_FRAC;
    AT.set(fx * halfW, fy * halfH, AT_Z);
    HEIGHT = Math.min(fh * halfH * 2, fw * halfW * 2);
    this.group.position.copy(AT);
  }

  // The camera's aspect changed — a rotation, a resized window. Whatever is in
  // the hand has to be re-fitted, or it keeps the last shape's placement.
  resize() {
    this._fit();
    // The pose rides along, or a rotated phone would hand the sasumata back
    // its card-slot placement.
    if (this.meshHolder && this._heldObj) this.holdMesh(this._heldObj, this._pose);
    else if (this._canvas) this.hold(this._canvas);
  }

  // Show this drawing in the hand. The texture is swapped under the one
  // persistent material; the old one is disposed rather than left for the GC,
  // because textures hold GPU memory the GC cannot see the size of.
  hold(canvas) {
    // A drawing never brings a pose — cards all live at the one slot.
    this._pose = null;
    this._fit();
    this._kind = 'card';
    this._canvas = canvas;
    this._heldObj = null;
    this._dropMesh();
    if (this._tex) this._tex.dispose();
    this._tex = new THREE.CanvasTexture(canvas);
    this._tex.colorSpace = THREE.SRGBColorSpace;
    this.mat.map = this._tex;
    this.mat.needsUpdate = true;
    this.card.scale.set(HEIGHT * (canvas.width / canvas.height), HEIGHT, 1);
    this.card.visible = true;
    this._want = 1;
  }

  // Hold a built THING rather than a drawing of one — the bear itself, the
  // teapot itself, in your hand. Measured, scaled to the card's own height,
  // and spun to a three-quarter view so you are looking at a toy rather than
  // at its front elevation.
  //
  // The caller keeps ownership of the object: it is the world's own bear, on
  // loan. clear() hands it straight back rather than disposing anything.
  holdMesh(obj, pose) {
    // Before _fit, which reads it: the pose moves the slot itself, not just
    // the thing in it, so the rise and the bob happen where the piece is.
    this._pose = pose || null;
    this._fit();
    this._kind = 'mesh';
    this._canvas = null;
    this._heldObj = obj;
    this._dropMesh();
    this.card.visible = false;
    // ...and the drawing that WAS in the slot is let go of, texture and all.
    // A card cannot be seen again until hold() puts a new one in, so this is a
    // picture nobody can look at holding GPU memory the GC cannot see the size
    // of — the same argument hold() makes when it swaps one drawing for another.
    //
    // Guarded, because resize() re-runs holdMesh on whatever is already held.
    if (this._tex) {
      this._tex.dispose();
      this._tex = null;
      this.mat.map = null;
      this.mat.needsUpdate = true;
    }
    // Sized and centred by fitHeld — see furniture.js, which carries the note on
    // why this must be measured off a parentless copy at scale 1, and why the
    // copy's own rotation is left exactly as its builder posed it.
    //
    // `_dropMesh` above matters to that: it drops the HOLDER and not the object,
    // so without the reset fitHeld does, the box would come back as the bounding
    // box of a bear still wearing the last slot's three-quarter turn.
    fitHeld(obj, HEIGHT);
    this.meshHolder = new THREE.Group();
    this.meshHolder.add(obj);
    // The three-quarter view, unless the pose asks for its own turn — the
    // sasumata does: at -0.6 a pole that long foreshortens into a stub, and
    // a shallower turn keeps the shaft's whole length on screen.
    this.meshHolder.rotation.y = pose && pose.turn !== undefined ? pose.turn : -0.6;
    this.meshHolder.rotation.x = pose && pose.tip !== undefined ? pose.tip : 0.15;
    this.meshHolder.rotation.z = pose && pose.roll !== undefined ? pose.roll : 0;
    // Unlike the card, the mesh KEEPS its depth test. The card can wear
    // depthTest:false because it is one quad; a built piece is fills and
    // inverted-hull ink whose whole trick is the depth buffer, and switching
    // it off turns the bear into a bear-shaped blot of outline. The cost is
    // honest: press your nose against a wall and the held piece can clip into
    // it, which a hand-held object arguably should.
    this.group.add(this.meshHolder);
    this._want = 1;

    // What in it wears the hour — see heldMaterials in furniture.js for which
    // materials those are and why the ink and the halos are not among them.
    this.heldMats = heldMaterials(obj);
  }

  _dropMesh() {
    this.heldMats = [];
    if (!this.meshHolder) return;
    this.group.remove(this.meshHolder);
    this.meshHolder = null;
  }

  clear() {
    this._want = 0;
    // The mesh goes at once rather than at the end of the shrink — its owner
    // is about to stand it back up in the world, and it cannot be in two
    // places. The card keeps the soft exit; it is only a picture.
    this._dropMesh();
  }

  update(t, airborne) {
    this._air = airborne;
    const dt = Math.min(0.1, this._t ? (t - this._t) / 1000 : 0.016);
    this._t = t;

    const want = this._air ? 0 : this._want;
    this._scale = this._scale + (want - this._scale) * (1 - Math.exp(-dt * EASE));
    const s = this._scale;

    // ONE slot, two possible occupants — a drawing or a built piece — and
    // exactly one of them may be in it. This used to read `this.card.visible =
    // s > 0.02` flat, which quietly turned the card back on underneath a held
    // bear every frame after holdMesh had switched it off: the bear and a fish
    // card in the same hand, the card winning on render order.
    //
    // Then it read `shown && !this.meshHolder && !!this.mat.map`, and the last
    // of those was the bug. It was reaching for "is a CARD what is in the slot"
    // and asking "is there a texture lying about" instead — two questions with
    // the same answer only while the hand had never held a drawing. Once it had,
    // they came apart in the gap `clear()` opens: setting a built piece down
    // drops the mesh AT ONCE, on purpose, while the slot is still easing shut,
    // and for those eighteen frames the card was the only occupant left, with
    // the last drawing still loaded under it. Hold a fish, pick up the kettle,
    // set the kettle down — and the fish you put away two actions ago came back
    // up and shrank away in your hand. Measured at 0.3 seconds.
    //
    // (The white flash the map test was added for is a case of the same thing:
    // a hand that had held no drawing had no texture either, and a MeshBasicMaterial
    // with no map is WHITE. `_kind` answers that one too — a slot that last took
    // a mesh is not showing a card, textured or bare.)
    //
    // So it asks the question it means. `_kind` is what was last PUT here, which
    // `clear()` leaves standing — a card put away is still a card while it
    // shrinks, and that is the soft exit clear() is written for.
    const shown = s > 0.02;
    this.card.visible = shown && this._kind === 'card';
    if (this.meshHolder) this.meshHolder.visible = shown;
    if (!shown) return;

    // Rising into place as it scales, so it comes up from the bottom of the
    // frame rather than inflating in the middle of it. The rise is a share of
    // the slot's own height, so it does not become a different gesture on a
    // different screen.
    this.group.scale.setScalar(s);
    this.group.position.x = AT.x;
    this.group.position.y = AT.y - (1 - s) * HEIGHT * 0.5
      + Math.sin((t / 1000) * BOB.speed) * BOB.y;
    this.group.rotation.z = LEAN.z + Math.sin((t / 1000) * BOB.speed * 0.7) * BOB.rot;
  }
}
