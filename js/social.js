// WHO IS TALKING, AND WHEN.
//
// One scheduler for the whole cast, because three characters chattering
// independently would talk over each other — dialogue.js owns a bubble and a
// line bank each, and deciding whose turn it is has always been somebody else's
// job. This is that somebody.
//
// It lived in main.js as a dozen module-level `let`s scattered between the
// pointer routing and the drawer UI, which is the wrong place for it in one
// specific way rather than merely an untidy one: `greetedKey`, `meetUntil`,
// `pendingReply` and the rest are a CONVERSATION'S state, and a conversation is
// the one thing in this app that spans frames, spans characters, and belongs to
// no single one of them. Kept as globals they were unfindable and unresettable;
// kept here they are a small object with a name.
//
// WHAT IS AND IS NOT IN HERE. This owns the decision to speak and the state
// behind it. It does not own the pouch (a gift is an inventory operation that
// happens to produce a line), the rig, or anything about where a body is
// standing — it asks. main.js keeps one-line delegates for the names its
// pointer handlers call, so tapping a friend still reads as `pokeBack(...)`
// where the tap is handled.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { inLake } from './sphere.js';
import { pondsFrozen } from './weather.js';

const _probe = new THREE.Vector3();

export class Social {
  // `ctx` is the world this talks about, injected rather than imported: the
  // cast, the scene, the camera rig, and the one lookup from a Character back
  // to the bot that owns its dialogue.
  constructor({ bots, byChar, globe, rig }) {
    this.bots = bots;
    this.byChar = byChar;
    this.globe = globe;
    this.rig = rig;

    // When the next ambient line is due. Everything else in this list is a
    // cooldown on one particular kind of remark.
    this.nextChatterAt = 0;
    this.lastTouchAt = 0;
    this.saidLongIdle = false;
    // Who you last walked up to, and how long before that counts as new again.
    this.greetedKey = null;
    this.greetCooldownUntil = 0;
    // The one exchange in this app that is genuinely a conversation: two of
    // them meeting, and the answer that is owed a beat later.
    this.meetUntil = 0;
    this.pendingReply = null;
    // Whether you were at a shore last frame, so arriving at one is an edge.
    this.wasInWater = false;
    this.waterQuietUntil = 0;

    this.playerDir = new THREE.Vector3();
  }

  // ------------------------------------------------------------- the world

  get R() { return CONFIG.globe.radius; }

  arcBetween(a, b) {
    return Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * this.R;
  }

  // On the floor of a building, not merely over it — see the note at the
  // original in main.js, which this is asked of rather than copied from.
  _indoors() {
    return this.rig.isFirstPerson && this.globe.isInside(this.rig.anchor);
  }

  // Now that they roam the whole planet, "can I see them" has to mean actually
  // in frame — not merely on this side of the horizon. Otherwise a speech
  // bubble turns up at the edge of the screen with nobody attached to it.
  onScreen(ch) {
    if (!ch.isVisible) return false;
    ch.headWorld(_probe);
    _probe.y += this.globe.world.position.y;
    _probe.project(this.globe.camera);
    return _probe.z < 1 && Math.abs(_probe.x) < 1.0 && Math.abs(_probe.y) < 1.1;
  }

  // Whether a wall stands between you and them. Everyone is in the one world
  // now, so the projection alone cannot say — somebody sat at home projects
  // onto the front of the house perfectly well. A line spoken through masonry
  // is the thing this exists to stop; the open door is narrow enough that
  // treating the wall as total costs one rare charming case and saves the
  // constant absurd one.
  throughWall(ch) {
    return this.globe.isInside(ch.dir) !== this._indoors();
  }

  canChatter(ch) {
    if (!this.onScreen(ch) || this.throughWall(ch)) return false;
    if (this.rig.isFirstPerson
      && this.arcBetween(ch.dir, this.playerDir) > CONFIG.social.farSpeakArc) return false;
    return true;
  }

  // Stood at the edge of a lake, rather than in one — see the long note this
  // was lifted from. On ice the whole bucket stands down: a friend warning you
  // off a pond you are comfortably standing on reads as them not having looked.
  playerAtWater() {
    if (pondsFrozen()) return false;
    for (const lake of CONFIG.lakes) {
      if (inLake(this.playerDir, lake, CONFIG.player.shoreNotice)) return true;
    }
    return false;
  }

  // -------------------------------------------------------------- speaking

  anyoneSpeaking() {
    return this.bots.some((b) => b.dlg.isVisible);
  }

  silenceOthers(except) {
    for (const b of this.bots) if (b !== except && b.dlg.isVisible) b.dlg.hide();
  }

  // gapMin/gapMax are the QUIET between lines, so this takes the moment the
  // last one ends rather than the moment it began. They used to be the same
  // call — scheduleNext(now) at the point of speaking — which was near enough
  // while every line lasted about three seconds flat. Now that a long one runs
  // to seven, a gap counted from the start would frequently be up before the
  // line it was supposed to follow, and the three of them would talk without a
  // pause anywhere in it.
  scheduleNext(from) {
    const d = CONFIG.dialogue;
    this.nextChatterAt = from + d.gapMin + Math.random() * (d.gapMax - d.gapMin);
  }

  speak(bot, bucket, now) {
    this.silenceOthers(bot);
    bot.dlg.say(bucket, now);
    this.scheduleNext(now + bot.dlg.durationMs);
  }

  speakAmbient(bot, now) {
    this.silenceOthers(bot);
    bot.dlg.ambient(now);
    this.scheduleNext(now + bot.dlg.durationMs);
  }

  // Being spoken TO — the poke, the greeting — with a beat after it before the
  // same friend will answer again. See social.pokeQuietMs.
  //
  // Every way of addressing somebody comes through here rather than through
  // `speak` directly, which is the whole point: the guard belongs to the ACT of
  // poking and not to the button that happens to be the newest way of doing it.
  //
  // AN ABSORBED PRESS IS SILENT, and that is a deliberate exception to the rule
  // that a button answering a press with silence reads as broken. It is not
  // silence: they are mid-sentence, the bubble is on screen, and the answer to
  // "say something" is the thing they are already saying.
  pokeBack(bot, bucket, now) {
    if (now < (bot.quietUntil || 0)) return false;
    this.speak(bot, bucket, now);
    // Something passed between you, so their attention window starts over — see
    // Character.notice. Here rather than in `speak`, and that is the distinction
    // the whole window rests on: this function is somebody being ADDRESSED,
    // while `speak` is also how the ambient chatter comes out.
    bot.ch.notice(now);
    bot.quietUntil = now + bot.dlg.durationMs + CONFIG.social.pokeQuietMs;
    return true;
  }

  // Somebody has come and sat down beside you — see the joinsit mode in
  // household.js. One quiet line as they settle, and nothing asked of you.
  //
  // THE LINE IS THE WHOLE OF THE EVENT and it should stay that way. No prompt,
  // no pill, nothing to answer: they came over because you sat still long
  // enough, and the correct thing for the app to do next is nothing at all.
  //
  // `sitTogether` falls back to `poke` for anybody without one, the same
  // half-drawn courtesy every other bucket extends — see Dialogue.has.
  sitDown(bot, now) {
    this.speak(bot, bot.dlg.has('sitTogether') ? 'sitTogether' : 'poke', now);
    bot.ch.notice(now);
    bot.quietUntil = now + bot.dlg.durationMs + CONFIG.social.pokeQuietMs;
  }

  // A finger landed somewhere. Resets the long-idle clock; the rig is told
  // separately by the caller, because that is its business rather than this.
  touched(now) {
    this.lastTouchAt = now;
    this.saidLongIdle = false;
  }

  // ------------------------------------------------------------ one-shots

  // Thunder. One of them, not all three, and not every bolt: a storm strikes
  // every dozen seconds or so, and three characters answering each of them in
  // chorus would read as a cast reacting to a stage direction.
  strike(now) {
    if (Math.random() > 0.45) return;
    const seen = this.bots.filter((b) => (
      b.dlg.has('thunder') && !b.dlg.isVisible && b.ch.isVisible && this.canChatter(b.ch)
    ));
    if (!seen.length) return;
    this.speak(seen[Math.floor(Math.random() * seen.length)], 'thunder', now);
  }

  // Somebody noticing a rainbow. It fires ONCE, on the frame the arc crosses
  // into being worth looking at, and that is the whole difference between this
  // and the ordinary weather chatter — a rainbow line in the timeOfDay slot
  // would come round every half minute and turn the rarest thing in this world
  // into background noise.
  //
  // Whoever can actually see it, which excludes anybody still indoors: the cast
  // come out of the rain a few seconds before the arc arrives, and somebody
  // left on a cushion has their own chance when the gathering picks them up.
  noticeBow(now) {
    const seen = this.bots.filter((b) => (
      b.dlg.has('rainbow') && !b.dlg.isVisible && b.ch.isVisible
      && this.canChatter(b.ch) && !this.globe.isInside(b.ch.dir)
    ));
    if (!seen.length) return;
    this.speak(seen[Math.floor(Math.random() * seen.length)], 'rainbow', now);
  }

  // --------------------------------------------------------------- a frame
  //
  // Everything the three of them notice: you arriving, each other, and the
  // water.
  //
  // The first block is about the planet, so none of it runs while you are in
  // the house. That is not because it would be invisible from in there — it is
  // because it would be wrong. Every distance in it is an arc measured from
  // `rig.anchor`, which indoors is the doorstep you left rather than anywhere
  // you are, so standing in a room would go on greeting whoever happened to
  // walk past the front door. They keep wandering the whole time; they simply
  // stop noticing you, which is exactly what going inside should mean.
  update(now) {
    this.playerDir.copy(this.rig.anchor);
    const s = CONFIG.social;

    // Walking up to somebody should be noticed. Without this, greetings only
    // ever happened on teleport and going over on foot felt ignored.
    if (this.rig.isFirstPerson) {
      let near = null;
      let nearD = Infinity;
      for (const b of this.bots) {
        // Never through the wall: the nearest character can be one sat at home
        // a metre of masonry away, and being greeted by them from your side of
        // it would be the house talking.
        //
        // ...and never somebody asleep, which is what `isVisible` answers here.
        // A sleeper is a body standing right where you are walking, and without
        // this, creeping up on Chiikawa at three in the morning is met with
        // 「おかえり」 from a drawing of him under a quilt.
        if (!b.ch.isVisible || this.throughWall(b.ch)) continue;
        const d = this.arcBetween(b.ch.dir, this.playerDir);
        if (d < nearD) { nearD = d; near = b; }
      }
      if (near && nearD < s.greetArc) {
        if (this.greetedKey !== near.spec.key && now > this.greetCooldownUntil
          && !this.anyoneSpeaking()) {
          this.greetedKey = near.spec.key;
          this.greetCooldownUntil = now + s.greetCooldown;
          this.rig.focus = near.ch;
          // Walking in on somebody at home is its own moment with its own bank
          // — 「いらっしゃい」, not 「やあ」. The same proximity fires it,
          // because walking in IS walking up to them now; the roof overhead is
          // what picks the words.
          const home = this._indoors() && this.globe.isInside(near.ch.dir);
          this.speak(near, home ? 'indoor' : 'greetBack', now);
        }
      } else if (nearD > s.greetClearArc) {
        this.greetedKey = null;   // wander off and coming back counts as new
      }

      // Arriving at a shore.
      const wet = this.playerAtWater();
      if (wet && !this.wasInWater && now > this.waterQuietUntil && !this.anyoneSpeaking()) {
        const witness = this.bots.find((b) => this.onScreen(b.ch));
        if (witness) {
          this.speak(witness, 'water', now);
          this.waterQuietUntil = now + s.waterCooldown;
        }
      }
      this.wasInWater = wet;
    }

    // Two of them meeting. Only started when you can actually watch it happen,
    // otherwise the cooldown gets spent on a conversation nobody saw.
    if (this.pendingReply && now > this.pendingReply.at) {
      const reply = this.pendingReply;
      this.pendingReply = null;
      this.speak(reply.bot, 'meetReply', now);
      // Both of them stay put until the answer has been read too. meetHoldMs
      // was measured from the opening line, and a reply that now waits for that
      // line to finish can outlast it — which had the pair of them turning and
      // strolling away from each other mid-sentence.
      const until = now + reply.bot.dlg.durationMs;
      reply.bot.ch.hold('talk', until, true);
      reply.to.ch.hold('talk', until, true);
    }
    if (!this.pendingReply && now > this.meetUntil && !this.anyoneSpeaking()) {
      for (let i = 0; i < this.bots.length && !this.pendingReply; i++) {
        for (let j = i + 1; j < this.bots.length; j++) {
          const a = this.bots[i];
          const b = this.bots[j];
          if (a.ch.attentive || b.ch.attentive) continue;
          // NOT ON A WALK WITH A DEADLINE. The hold this sets is already
          // ignored by somebody in a hurry, so they would not have stopped —
          // but two friends passing at midnight striking up a conversation
          // neither of them halts for is worse than no conversation: it is a
          // chat held by two people walking away from each other.
          if (a.ch.hurrying || b.ch.hurrying) continue;
          if (this.arcBetween(a.ch.dir, b.ch.dir) > s.meetArc) continue;
          if (!this.onScreen(a.ch) && !this.onScreen(b.ch)) continue;
          this.speak(a, 'meet', now);
          // Answer once the opening line has been read, not partway through it.
          // speak() silences whoever else is talking, so a reply on a timer
          // counted from the start arrived on top of the line it was answering
          // and cut it off — which made the one exchange in the app that is
          // genuinely a conversation the hardest thing in it to follow.
          const replyAt = now + a.dlg.durationMs + s.meetReplyMs;
          this.pendingReply = { bot: b, to: a, at: replyAt };
          // Stood still at least until the answer is due; the reply above
          // extends this again once its own length is known.
          const hold = Math.max(now + s.meetHoldMs, replyAt);
          a.ch.hold('talk', hold, true);
          b.ch.hold('talk', hold, true);
          // SOME MEETINGS ARE ONES THEY SIT DOWN FOR — see social.meetSitChance.
          // Two friends sitting together on the grass talking is the most
          // Chiikawa image this world can produce, and it costs nothing but the
          // decision to take the meeting that already happened and let it last.
          //
          // BOTH OR NEITHER. A pair where one sat and the other stood over them
          // would read as an interrogation rather than as a chat, so the roll is
          // made once for the meeting rather than once each.
          //
          // Refused to anybody already off their feet — somebody up on a pudding
          // is having their own moment, and dropping them onto the grass to have
          // this one would take one away to give another.
          if (!a.ch.perched && !b.ch.perched && Math.random() < s.meetSitChance) {
            const until = now + s.meetSitMin
              + Math.random() * (s.meetSitMax - s.meetSitMin);
            a.ch.sitFor(until);
            b.ch.sitFor(until);
          }
          this.meetUntil = now + s.meetCooldown;
          break;
        }
      }
    }

    if (!this.anyoneSpeaking() && now > this.nextChatterAt) {
      const focused = this.rig.focus ? this.byChar.get(this.rig.focus) : null;
      let pick = (focused && Math.random() < CONFIG.dialogue.focusBias)
        ? focused
        : this.bots[Math.floor(Math.random() * this.bots.length)];
      // Nobody talks from somewhere you cannot see them — nor, on foot, from
      // so far off that their bubble points at a speck on the horizon.
      if (!this.canChatter(pick.ch)) pick = this.bots.find((b) => this.canChatter(b.ch));
      if (pick) this.speakAmbient(pick, now);
      else this.scheduleNext(now);
    }

    if (!this.saidLongIdle && !this.anyoneSpeaking()
      && now - this.lastTouchAt > CONFIG.dialogue.longIdleMs) {
      this.saidLongIdle = true;
      // Whoever you are visiting, but only if they are still there to be seen.
      // focus is never cleared — walk away and it still names the last person
      // you went to — so without the check a 「まだ いる…?」 could be spoken by
      // somebody round the far side of the planet, where positionBubbles hides
      // the bubble and the line is simply lost.
      const focused = this.rig.focus && this.onScreen(this.rig.focus)
        ? this.byChar.get(this.rig.focus) : null;
      const pick = focused || this.bots.find((b) => this.onScreen(b.ch));
      if (pick) this.speak(pick, 'longIdle', now);
    }
  }
}
