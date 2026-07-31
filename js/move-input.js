// HOW YOU SAY WHERE YOU WANT TO GO — and it is now two things saying it.
//
// One idea, three surfaces: the thumb pad, the keyboard, and the two action
// buttons beside them. All three end at the same three calls on the rig
// (`setMove`, `hop`, `sprintOn`), which is what makes them alternatives rather
// than modes — nothing anywhere else has to know which one is being used, and
// picking up a keyboard mid-session does not put the app into a state.
//
// It is split out from main.js because it is the one part of the input that is
// about MOVEMENT rather than about pointing. The rest of the pointer handling
// there — which character is under the finger, whether a drag was a look or a
// tap, what the pinch is doing — is about what you are aiming AT, and it stays
// with the interaction code it belongs to. The pad's own arbitration comes here
// with it, because "the first finger in that corner, if it did not land on
// somebody" is a rule about the pad and about nothing else.
//
// ------------------------------------------------------------------ the keys
//
// There were none, and on a desktop that was the whole of the control scheme
// missing: the only keydown listener in the app was Escape closing a sheet, so
// playing at a computer meant dragging a virtual thumbstick with a mouse — a
// pointer that can only ever be in one place at a time, which on a control
// designed for a thumb that rests there means you cannot look while you walk.
//
// WASD and the arrows both, because both are what a hand expects and neither
// costs anything.
//
// THE DIAGONAL IS BROUGHT BACK TO A UNIT PUSH, which is the oldest bug in
// keyboard movement and was in the first draft of this file: W and D together
// are (1, -1), which is a magnitude of 1.41, so holding two keys ran 41% faster
// than holding one. Clamping each axis on its own does not fix it — both are
// already inside [-1, 1] — so the length itself has to be the thing capped.
//
// The rig would have hidden it. `_walk` takes `Math.min(1, mag)` for the
// throttle and normalises the direction separately, so the speed came out right
// anyway and only the magnitude was a lie. That is exactly why it is fixed here
// rather than left to the rig: the pad cannot produce a push longer than 1 —
// `_read` clamps the knob to `stickRadius` before dividing by it — and two
// sources feeding one channel have to mean the same thing by it, or the next
// reader of `move` gets a number whose range depends on which hand you used.
//
// The keys write the same analog channel the stick does, so everything built on
// top of the throttle — the ease over accelMs, the walk bob, the lens opening,
// the sprint riding on top as a multiplier — works without knowing they exist.
// What is lost against a real stick is the half-push, and there is no honest way
// to get it from a switch; the ease is what stands in for it, so a tap of W is a
// step rather than a lurch.

import { CONFIG } from './config.js';

// WHICH KEYS MEAN WHICH WAY, as [x, y] contributions in the rig's own axes —
// y negative being forward, exactly as `setMove` reads them.
//
// Keyed off `event.code` rather than `event.key`, and that is not a detail: on
// an AZERTY keyboard `key` for the physical W position is 'z', so a `key` table
// spells WASD as ZQSD for a French layout and as something else again for
// Dvorak. `code` is the physical key, so W is wherever W is on the plastic.
const KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

function clamp(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

// Whether a key event is meant for the world or for something on top of it.
//
// Two refusals, for two different reasons. A field with a cursor in it owns
// every key while it does — there are none in this app today, and typing WASD
// into a future one and walking off across the planet is not a bug anybody
// should have to find. And anything held with ctrl, meta or alt is a browser
// command or an OS one; swallowing those to walk would break Cmd-R and worse.
//
// Shift is deliberately NOT in that list: it is the sprint, and a modifier this
// app has a use for cannot also be a reason to ignore the press.
function forSomebodyElse(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = e.target;
  if (!el || el === document.body || el === document.documentElement) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export class MoveInput {
  // `onTouched` is the app's "somebody is playing" bookkeeping — the idle spin
  // and the chatter clock both hang off it — and `onHop` is what lets the cast
  // answer a jump. Both are passed in rather than reached for, so this file
  // needs to know about the rig and nothing else in the world.
  constructor({ rig, stick, knob, jumpBtn, sprintBtn, onTouched, onHop }) {
    this.rig = rig;
    this.stick = stick;
    this.knob = knob;
    this.onTouched = onTouched || (() => {});
    this.onHop = onHop || (() => {});

    // The pad. `grab` is a loose piece that was under the finger when the pad
    // took it — see `claim`. The pad keeps hold of it so that letting go without
    // having pushed can mean "pick that up" rather than nothing at all.
    this.pad = { id: null, travel: 0, lastX: 0, lastY: 0, grab: null };
    this.origin = { x: 0, y: 0 };

    // Which movement keys are down, and what they came to. `_wrote` is whether
    // the keyboard was the last thing to touch the throttle, which is what lets
    // it release the stick cleanly instead of pinning it at zero forever — see
    // `tick`.
    this._held = new Set();
    this._kx = 0;
    this._ky = 0;
    this._wrote = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    // A key held while the tab goes away never sends its keyup, so without this
    // alt-tabbing mid-stride walks you across the planet in the background and
    // hands you back somewhere you have never been.
    window.addEventListener('blur', this._onBlur);

    if (jumpBtn) {
      // On pointerdown rather than click, because a jump is about NOW: one that
      // waits for the finger to come back up lands after the moment that asked
      // for it.
      jumpBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.jump();
      });
    }
    if (sprintBtn) {
      // ...and arming a run belongs to the press, not the release.
      sprintBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.toggleSprint();
      });
    }
  }

  // ------------------------------------------------------------------ verbs
  //
  // The two the buttons and the keys share, so a thumb and a thumb's worth of
  // keyboard cannot drift apart.

  jump() {
    this.onTouched();
    // The rig refuses off the ground on its own, so this needs no gate: the
    // authority on whether you can jump is the thing doing the jumping.
    if (this.rig.hop()) this.onHop();
  }

  toggleSprint() {
    this.onTouched();
    // Gated here as well as hidden in CSS, because `pointer-events: none` is a
    // statement about the mouse and not about the app: it stops a thumb, and it
    // does not stop a dispatched event, a stylesheet that failed to load, or a
    // keyboard. A run armed in the sky sits there doing nothing visible and then
    // fires the instant you land — so the rule lives with the state it protects.
    if (!this.rig.isFirstPerson) return;
    this.rig.sprintOn = !this.rig.sprintOn;
  }

  // ------------------------------------------------------------------- keys

  _onKeyDown(e) {
    if (forSomebodyElse(e)) return;

    if (KEYS[e.code]) {
      // `repeat` is the OS key-repeat firing at its own rate, which has nothing
      // to do with anything here — the key is already down and already counted.
      if (!e.repeat) this._held.add(e.code);
      this._readKeys();
      e.preventDefault();        // arrows scroll the page otherwise
      this.onTouched();
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();        // space scrolls, and it is the jump
      if (!e.repeat) this.jump();
      return;
    }

    // Either shift, and only on the way DOWN: this arms a run rather than
    // holding one, exactly as the button does, so the key-up is not a stand-down
    // and holding it is the same as tapping it. The rig disarms by itself when
    // you stop moving — see the disarm in _walk.
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
      this.toggleSprint();
    }
  }

  _onKeyUp(e) {
    if (!KEYS[e.code]) return;
    this._held.delete(e.code);
    this._readKeys();
  }

  _onBlur() {
    if (!this._held.size) return;
    this._held.clear();
    this._readKeys();
  }

  _readKeys() {
    let x = 0;
    let y = 0;
    for (const code of this._held) {
      const [dx, dy] = KEYS[code];
      x += dx;
      y += dy;
    }
    // Opposite keys held together cancel to nothing, which is what a stick
    // pushed both ways would do and is the only answer that does not have to
    // pick a winner. That happens above, in the sum.
    //
    // Then the length, never the axes — see the note at the top. Scaled rather
    // than clamped so the DIRECTION survives: the diagonal stays a diagonal and
    // only its magnitude comes back to one.
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this._kx = clamp(x);
    this._ky = clamp(y);
  }

  // ------------------------------------------------------------------- pad
  //
  // Whether a touch landed in the pad's corner. The pad has no home: it appears
  // under your thumb anywhere in this region, as a fraction of width and height,
  // so there is never anything to reach for.
  inZone(e) {
    const z = CONFIG.player.stickZone;
    return e.clientX < window.innerWidth * z.x && e.clientY > window.innerHeight * z.y;
  }

  get busy() { return this.pad.id !== null; }

  owns(id) { return this.pad.id === id; }

  // Take the touch, if the pad is free and this is its corner. `grabbable` is a
  // loose piece under the finger, kept for the release — see the note on `pad`.
  // True when the pad took it, which is the caller's signal to stop arbitrating.
  claim(e, grabbable = null) {
    if (this.pad.id !== null || !this.rig.isFirstPerson || !this.inZone(e)) return false;
    this.pad.id = e.pointerId;
    this.pad.travel = 0;
    this.pad.grab = grabbable;
    this.pad.lastX = e.clientX;
    this.pad.lastY = e.clientY;
    this.origin.x = e.clientX;
    this.origin.y = e.clientY;
    this.stick.style.left = `${e.clientX}px`;
    this.stick.style.top = `${e.clientY}px`;
    this.knob.style.transform = '';
    this.stick.classList.add('is-live');
    this._read(e);
    return true;
  }

  drag(e) {
    this.pad.travel += Math.hypot(e.clientX - this.pad.lastX, e.clientY - this.pad.lastY);
    this.pad.lastX = e.clientX;
    this.pad.lastY = e.clientY;
    this._read(e);
    this.onTouched();
  }

  // Let go. Returns the piece to pick up, or null — a press that turned into a
  // walk was never a grab, and a press that never moved was never a walk, so
  // nothing has to be guessed at the moment the finger lands.
  release() {
    const grab = this.pad.grab;
    const tapped = this.pad.travel < CONFIG.player.tapSlop;
    this._letGo();
    return tapped ? grab : null;
  }

  // Leaving the ground mid-push should not leave a pad hanging there — nor a
  // finger still feeding one. Dropping the id as well as the drawing is what
  // stops a thumb that never lifted from steering an invisible pad the moment
  // you land again; the pointer just goes inert until it comes up.
  cancel() {
    if (this.pad.id === null) return;
    this._letGo();
  }

  _letGo() {
    this.pad.id = null;
    this.pad.grab = null;
    this.stick.classList.remove('is-live');
    this.knob.style.transform = '';
    this.rig.setMove(0, 0);
    this._wrote = false;
  }

  _read(e) {
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const max = CONFIG.player.stickRadius;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    this.knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;

    let nx = dx / max;
    let ny = dy / max;
    if (Math.hypot(nx, ny) < CONFIG.player.deadzone) { nx = 0; ny = 0; }
    this.rig.setMove(nx, ny);
  }

  // ------------------------------------------------------------------- frame
  //
  // The keys' turn at the throttle, once a frame.
  //
  // THE PAD WINS WHILE IT IS HELD, and the precedence is one-way on purpose: a
  // thumb on the stick is a hand committed to steering, while a key is a switch
  // that may have been left down. Writing both would mean whichever ran last
  // decided, which is the sort of thing that works on one device and not the
  // next.
  //
  // `_wrote` is what makes letting go clean. The keys have to write zero exactly
  // once when the last of them comes up — write it every frame and the pad could
  // never take over on a device that has both, and write it never and a released
  // key would leave the throttle pinned wherever it was.
  tick() {
    if (this.pad.id !== null) return;
    if (this._kx === 0 && this._ky === 0) {
      if (!this._wrote) return;
      this._wrote = false;
      this.rig.setMove(0, 0);
      return;
    }
    this._wrote = true;
    this.rig.setMove(this._kx, this._ky);
  }
}
