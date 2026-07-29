// One of these per character. Each owns its own speech bubble and its own line
// bank; deciding whose turn it is to speak is the caller's job, because three
// characters chattering independently would talk over each other.

import { CONFIG } from './config.js';
import { AMBIENT_MIX } from './lines.js';
import { activePhase } from './daylight.js';

// How long a line rests on screen once it has finished typing. Grows with the
// line, because a reader does — see CONFIG.dialogue.holdBase for why it stopped
// being one number for everybody.
function holdFor(text) {
  const d = CONFIG.dialogue;
  return d.holdBase + text.length * d.holdPerChar;
}

function weightedPick(list, avoidText) {
  const pool = list.filter((l) => l.t !== avoidText);
  const src = pool.length ? pool : list;
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
    this.lastText = '';
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
    const line = weightedPick(bucket, this.lastText);
    this.line = line;
    this.lastText = line.t;
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
    if (key === 'timeOfDay') key = activePhase();
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
