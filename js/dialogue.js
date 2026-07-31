// One of these per character. Each owns its own speech bubble and its own line
// bank; deciding whose turn it is to speak is the caller's job, because three
// characters chattering independently would talk over each other.

import { CONFIG } from './config.js';
import { AMBIENT_MIX } from './lines.js';
import { activePhase } from './daylight.js';
import { activeWeather } from './weather.js';

// How long a line rests on screen once it has finished typing. Grows with the
// line, because a reader does — see CONFIG.dialogue.holdBase for why it stopped
// being one number for everybody.
function holdFor(text) {
  const d = CONFIG.dialogue;
  return d.holdBase + text.length * d.holdPerChar;
}

// A line from the bucket, avoiding anything said RECENTLY rather than only the
// line said last.
//
// One back was the whole memory, and measured against the rate this app talks
// it was not nearly enough. The cast speak every twelve seconds or so, and
// standing with somebody sends 72% of that to them — see focusBias — so one
// character draws from an ambient pool of about nineteen lines every seventeen
// seconds. Simulated over 500 runs of fifteen minutes: the FIRST repeat landed
// at ninety seconds, and the most-said line came round between six and eight
// times. That is a loop, not a character.
//
// Widening the memory is the cheaper half of the fix and the bigger one. Same
// measurement with a ten-deep memory: first repeat at 195s. Doubling the bank
// INSTEAD only reached 134s — so remembering more beats writing more, and the
// two together reach 260s, which is where it stops sounding like a script.
//
// The window is per character and spans buckets, which is what makes it mean
// "do not repeat yourself" rather than "do not repeat this bucket". A rainbow
// that once said two of its four lines will reach for the others next time.
//
// THE WINDOW SHRINKS TO FIT THE BUCKET rather than falling off a cliff, and
// that detail is worth more than it looks.
//
// The first version filtered by the whole window and, if that left nothing,
// dropped straight back to avoiding only the last line. Buckets smaller than
// the window therefore got almost no memory at all — and half of them are.
// Measured over 300 draws each: Chiikawa fell through 6 times, Hachiware 29,
// and Usagi 72 — a QUARTER of his lines — because his `ask` and `narrate` hold
// three lines against a window of ten, so the pool emptied constantly.
//
// Giving up one remembered line at a time instead means every bucket gets the
// deepest memory it can support: a three-line bank still refuses the last two,
// which is the best that can be done with three lines, and a seven-line bank
// keeps all ten. The loop always ends with something to choose from, since a
// window of nothing cannot exclude anything.
function weightedPick(list, recent) {
  let src = list;
  for (let keep = recent.length; keep >= 0; keep--) {
    const window = keep ? recent.slice(recent.length - keep) : [];
    const pool = list.filter((l) => !window.includes(l.t));
    if (pool.length) { src = pool; break; }
  }
  let total = 0;
  for (const l of src) total += l.w || 1;
  let r = Math.random() * total;
  for (const l of src) {
    r -= l.w || 1;
    if (r <= 0) return l;
  }
  return src[src.length - 1];
}

export class Dialogue {
  constructor({ bank, bubbleEl, textEl, onExpression }) {
    this.bank = bank;
    this.bubble = bubbleEl;
    this.text = textEl;
    this.onExpression = onExpression || (() => {});
    this.state = 'hidden';
    this.line = null;
    // `lastText` STOOD HERE and the window replaced it: the newest entry in
    // `_recent` is the line said last, so a second field saying the same
    // thing could only ever disagree with it.
    // The last few things this one said, newest at the end — see weightedPick,
    // which is the only reader. Per character, because it is a fact about a
    // character rather than about the conversation.
    this._recent = [];
    this.startedAt = 0;
    this.holdUntil = 0;
    this.shown = 0;
  }

  get isTyping() { return this.state === 'typing'; }
  get isVisible() { return this.state !== 'hidden'; }

  // How long the line just started will be up for in total, counted from say().
  //
  // Everything that schedules around a line wants this rather than a constant.
  // With the hold growing, a wait counted from the moment a line STARTED can be
  // over before the line is: the gap between ambient lines is 5s against lines
  // that now run to seven, and the reply in a two-character exchange used to
  // land on top of the line it was answering and silence it.
  get durationMs() {
    if (!this.isVisible || !this.line) return 0;
    return this.line.t.length * CONFIG.dialogue.charMs + holdFor(this.line.t);
  }

  // Whether this bank has anything to say on a subject. `say` already fails
  // quietly on a bucket that is not there, which is the right behaviour for a
  // line nobody would miss — but a bucket attached to a BUTTON is different: a
  // press that produces silence reads as a broken button. Asking first lets the
  // caller fall back to a bucket every bank has, so a character with no words
  // for the moment still answers with ordinary ones. Same half-drawn courtesy
  // the sheets get.
  has(bucketKey) {
    const bucket = this.bank[bucketKey];
    return !!(bucket && bucket.length);
  }

  say(bucketKey, now) {
    const bucket = this.bank[bucketKey];
    if (!bucket || !bucket.length) return;
    const line = weightedPick(bucket, this._recent);
    this.line = line;
    this._recent.push(line.t);
    while (this._recent.length > CONFIG.dialogue.recentKeep) this._recent.shift();
    this.state = 'typing';
    this.startedAt = now;
    this.shown = 0;
    this.text.textContent = '';
    this.bubble.classList.add('is-open');
    this.onExpression(line.expr);
  }

  ambient(now) {
    let total = 0;
    for (const m of AMBIENT_MIX) total += m.w;
    let r = Math.random() * total;
    let key = 'idle';
    for (const m of AMBIENT_MIX) {
      r -= m.w;
      if (r <= 0) { key = m.key; break; }
    }
    // Asked of daylight.js rather than of the clock. They are the same thing
    // right up until you set the hour by hand, and then they are 「おはよう」
    // under a sky full of stars. The bank names its buckets after the phases
    // for exactly this reason, so there is nothing to translate.
    //
    // ...and the WEATHER gets first refusal on that same slot, by exactly the
    // same argument one step further along: 「ひなたが あったかい…」 in a
    // downpour is the identical mistake as 「おはよう」 under a starfield. The
    // buckets are named after the weathers too, so this is one more lookup and
    // no translation — and a bank with nothing to say about rain simply falls
    // through to the hour, the same half-drawn courtesy the sheets get.
    if (key === 'timeOfDay') {
      const sky = activeWeather();
      key = this.has(sky) ? sky : activePhase();
    }
    this.say(key, now);
  }

  hide() {
    this.state = 'hidden';
    this.bubble.classList.remove('is-open');
    // Back to the resting face with the bubble. Nothing else ever puts it back,
    // so a line went on wearing its expression through however long a silence
    // followed it — a startled 「ながれぼし…!」 held wide-eyed for the minutes
    // until somebody next spoke. Invisible while the whole cast is drawn from
    // one idle sheet, and wrong the moment a second sheet exists.
    this.onExpression('normal');
  }

  update(now) {
    const d = CONFIG.dialogue;

    if (this.state === 'typing') {
      const n = Math.floor((now - this.startedAt) / d.charMs);
      if (n !== this.shown) {
        this.shown = n;
        this.text.textContent = this.line.t.slice(0, n);
      }
      if (n >= this.line.t.length) {
        this.text.textContent = this.line.t;
        this.state = 'holding';
        this.holdUntil = now + holdFor(this.line.t);
      }
      return;
    }

    if (this.state === 'holding' && now > this.holdUntil) this.hide();
  }
}
