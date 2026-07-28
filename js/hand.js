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
    AT.set(AT_FRAC.x * halfW, AT_FRAC.y * halfH, AT_Z);
    HEIGHT = Math.min(HEIGHT_FRAC * halfH * 2, WIDTH_FRAC * halfW * 2);
    this.group.position.copy(AT);
  }

  // The camera's aspect changed — a rotation, a resized window. Whatever is in
  // the hand has to be re-fitted, or it keeps the last shape's placement.
  resize() {
    this._fit();
    if (this.meshHolder && this._heldObj) this.holdMesh(this._heldObj);
    else if (this._canvas) this.hold(this._canvas);
  }

  // Show this drawing in the hand. The texture is swapped under the one
  // persistent material; the old one is disposed rather than left for the GC,
  // because textures hold GPU memory the GC cannot see the size of.
  hold(canvas) {
    this._fit();
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
  holdMesh(obj) {
    this._fit();
    this._canvas = null;
    this._heldObj = obj;
    this._dropMesh();
    this.card.visible = false;
    // ITS OWN ROTATION IS LEFT ALONE. The hand is given a COPY built for it,
    // so whatever pose that copy arrived in is the pose it was built to be
    // held in — the bear, for one, is stood back up out of the lying-down it
    // wears on the futon. Resetting the rotation here undid that silently and
    // handed you a bear carried flat like a tray.
    //
    // MEASURED ALONE AND AT SCALE 1, ALWAYS — the whole of a bug worth
    // remembering, because it had two halves and fixing one left it broken.
    //
    // The copies are built once and kept, so the second time one is picked up
    // it arrives already wearing the scale and the centring offset the FIRST
    // pickup gave it. Measuring in that state and scaling again compounds both.
    // That is the obvious half, and resetting the transform fixes it.
    //
    // The half that hides: `_dropMesh` drops the HOLDER, not the object, so the
    // object is still a child of a discarded group that carries the slot's
    // three-quarter turn. `setFromObject` reads WORLD matrices, so the box came
    // back as the bounding box of a ROTATED bear — bigger than the upright one,
    // by a different amount each time as the offset shifted. Measured over six
    // pick-ups the fit factor read 0.743, 0.461, 0.596, 0.680, 0.722, 0.742:
    // not a drift but a slow convergence, which is exactly the shape of a
    // feedback loop reading its own output.
    //
    // So: off any parent, transform cleared, then measured.
    obj.removeFromParent();
    obj.position.set(0, 0, 0);
    obj.scale.setScalar(1);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const k = HEIGHT / Math.max(size.x, size.y, size.z, 1e-4);
    this.meshHolder = new THREE.Group();
    // Centred about the box's own middle so a piece modelled off-centre spins
    // about itself rather than about its birthplace.
    const centre = box.getCenter(new THREE.Vector3());
    obj.position.copy(centre).multiplyScalar(-k);
    obj.scale.setScalar(k);
    this.meshHolder.add(obj);
    this.meshHolder.rotation.y = -0.6;
    this.meshHolder.rotation.x = 0.15;
    // Unlike the card, the mesh KEEPS its depth test. The card can wear
    // depthTest:false because it is one quad; a built piece is fills and
    // inverted-hull ink whose whole trick is the depth buffer, and switching
    // it off turns the bear into a bear-shaped blot of outline. The cost is
    // honest: press your nose against a wall and the held piece can clip into
    // it, which a hand-held object arguably should.
    this.group.add(this.meshHolder);
    this._want = 1;

    // What in it wears the hour. `baseColor` is the mark of a fill — see
    // fillMat in furniture.js — and it is exactly the right test, because the
    // two things it excludes are the two that must be excluded: the shared ink,
    // which would stop being an outline the moment it dimmed, and the additive
    // halos, which are light and cannot be darkened by the dark they are
    // holding off.
    this.heldMats = [];
    obj.traverse((o) => {
      const m = o.material;
      if (!m || !m.userData || !m.userData.baseColor) return;
      if (this.heldMats.indexOf(m) < 0) this.heldMats.push(m);
    });
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
    // `mat.map` in the test is not belt and braces. Put a built piece in the
    // hand and then set it down, and the mesh goes at once while the slot is
    // still easing shut — which handed the card its turn, with no texture ever
    // loaded into it. A MeshBasicMaterial with no map is WHITE, so setting the
    // bear down printed a blank card the size of a fish on the meadow beside
    // it for a third of a second.
    const shown = s > 0.02;
    this.card.visible = shown && !this.meshHolder && !!this.mat.map;
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
