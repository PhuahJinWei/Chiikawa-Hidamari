// What can be carried, and the pouch it is carried in.
//
// The table is ITEMS and the state is Inventory, and the split matters: the
// table is what exists in the world's vocabulary — it never changes at runtime
// and is safe for anything to read — while the Inventory is one visitor's
// belongings, saved and loaded. Nothing else in the app touches localStorage
// for game state; if that ever stops being true, start here.
//
// ------------------------------------------------------------------ the kinds
//
// `kind` is the load-bearing field, and it is here from day one even though
// only one kind is implemented, because retrofitting it later means migrating
// saves:
//
//   stackable   fungible stuff — fish, plucked grass, mushrooms. Owned as a
//               COUNT per id. Gifting one decrements it; the world does not
//               change when one is picked up beyond, at most, a cosmetic
//               regrow. Everything in the table today is this.
//
//   unique      a reference to one specific world object — the bear, the
//               kettle. Owned as a flag, and owning it MUTATES the world (an
//               empty shelf spot), so a unique carries world-state with it.
//               None exist yet; the kind is reserved so that when they do,
//               the save schema already has a word for them.
//
// THE FISH ROWS ARE GENERATED, from FISH_SPECIES in config.js, and that is the
// one place in this table where a row is not written by hand. It is worth the
// exception: a fish species is four facts that must agree — a save key, a
// drawing to fetch, a name to show, and a fish in the water — and while they
// were three tinted koi that agreement was cheap enough to keep by hand. At
// twelve it is not, and a hand-written row here that the roster had never heard
// of would be a chip you could own and a fish nobody could catch.
//
// So the roster is the vocabulary and this is the grammar: whatever is in that
// list is a stackable, `fish: true`, named as the roster names it. The id is the
// species id, which is also how `itemIcon` finds the drawing.
//
// Names are the player-facing Japanese, in the app's own register: hiragana,
// small words, no kanji a child would stumble on. They live in the roster with
// the drawing they describe, because a name like 「しましまの おさかな」 is only
// right for as long as that fish has stripes.

import { FISH_SPECIES } from './config.js';
import { paintFishCard, paintKusa, paintSheet } from './art.js';
import { IMG } from './assets.js';

export const ITEMS = {
  ...Object.fromEntries(FISH_SPECIES.map((sp) => [
    sp.id, { kind: 'stackable', fish: true, name: sp.name },
  ])),

  // 草むしり. The humblest thing a pouch can hold and the most canonical
  // labour on this planet — pulled out of the meadow itself, one tuft at a
  // time, and received by the cast with complete sincerity.
  kusa: { kind: 'stackable', name: 'つんだ くさ' },

  // The two mushrooms, and they are two ITEMS rather than one because they are
  // two drawings: a red one and a brown one are two things to find, and folding
  // them into a single 「きのこ」 would throw away the only variety the scatter
  // has. Scarce on the ground — twenty across the whole planet — so picking one
  // is an event, which is exactly what their scarcity was always for.
  //
  // `cover` names the drawing in IMG, so the card in your hand is the same
  // drawing that was standing in the grass.
  kinoko1: { kind: 'stackable', cover: 'mushroom1', name: 'あかい きのこ' },
  kinoko2: { kind: 'stackable', cover: 'mushroom2', name: 'ちゃいろい きのこ' },

  // THE UNIQUES — see the kind's note above. `art` names the loose furniture
  // model this item wears; an explicit furniture `item` id distinguishes
  // physical pieces when two uniques share that model. There is exactly one
  // of each item id in the world, which is the entire meaning of the kind. They are
  // never in the pouch: a unique is in its spot, in your hand, set down
  // somewhere, or lent to a friend on a timer.
  bear: { kind: 'unique', art: 'plushie', name: 'くまさん' },
  kettle: { kind: 'unique', art: 'teapot', name: 'やかん' },
  // The floor lantern. It was deliberately left out of this group for a while,
  // on the reasoning that walking off with the room's only lamp is a different
  // feature — and it is, but it is this one: a light you can carry is the whole
  // point of a light that is not nailed down. Its `lit` flag in the furniture
  // table still says whether it is burning; being carryable is separate.
  //
  // The bulb is NOT here and should not be. It is screwed to the ceiling, which
  // is the difference between a lamp and a light fitting.
  lamp: { kind: 'unique', art: 'lantern', name: 'ランプ' },
  // Hachiware's copy uses the same model and name, but a separate id is what
  // lets the inventory track the two physical lanterns independently.
  hachiwareLamp: { kind: 'unique', art: 'lantern', name: 'ランプ' },
  // Hachiware's two rubbish bags are separate physical objects and use
  // separate art because their body profiles and colours differ.
  trashBag: { kind: 'unique', art: 'trashbag', name: 'ごみぶくろ' },
  trashBagAlt: { kind: 'unique', art: 'trashbag2', name: 'ごみぶくろ' },
  // Chiikawa's own pink sasumata. Its separate id is what makes the physical
  // weapon persist between its home spot, the hand, and placed locations.
  chiikawaWeapon: { kind: 'unique', art: 'pinkweapon', name: 'ピンクのさすまた' },
  // Hachiware's blue counterpart is another physical weapon, not a recolour of
  // the same inventory entry, so both can exist and be carried independently.
  hachiwareWeapon: { kind: 'unique', art: 'blueweapon', name: 'ブルーのさすまた' },
};

// Species index → item id, for the one place that meets a fish as a fish rather
// than as an item: the rod. The shoal stores which species each fish is as an
// index into FISH_SPECIES; this is how that becomes a thing in the pouch.
//
// The ids and the species ids are the same strings, so this looks like a list
// that could be skipped. It is doing real work: it fixes the ORDER the index
// means, and the shoal, the catch cards and this pouch all count in it.
export const FISH_ITEM = FISH_SPECIES.map((sp) => sp.id);

// The little picture of an item — on a chip in the pouch, and on the card in
// your hand. One canvas per item, cached in art.js; both readers get the SAME
// canvas, which is what keeps the thing you chose and the thing you are holding
// from being two different drawings.
export function itemIcon(id) {
  const it = ITEMS[id];
  // A fish is found by its own id, because the item id IS the species id — see
  // the note at the top. Cropped to its pixels by paintFishCard, so the chip
  // shows the animal rather than the square it was drawn on.
  if (it.fish) return paintFishCard(IMG.fish[id]);
  // A drawn item shows its own drawing through paintSheet, which every card in
  // the app already goes through. Note that it PADS rather than crops, unlike
  // the fish above: the mushrooms are drawn tight to their pixels already, so
  // there is nothing to take off and only the mipmap margin to add.
  if (it.cover) return paintSheet(IMG[it.cover]);
  return paintKusa();
}

// --------------------------------------------------------------------- saving
//
// One key, one JSON object, a version number inside it. The version is not
// decoration: the day the schema changes, the loader below is where old saves
// are translated rather than discarded, and it can only do that if every save
// ever written says which shape it is.
//
// Writes are debounced. Gifting fires three changes in a row — count down,
// hand emptied, given-stamp written — and localStorage is synchronous, so
// coalescing them into one write at the end of the tick is both cheaper and
// atomic: no save can capture the middle of a gift.
const KEY = 'hidamari-mochimono';
const VERSION = 2;

// How many things you can carry at once.
//
// Eight is chosen against what there IS to carry rather than as a round number:
// twelve fish, two mushrooms, a fistful of grass and two uniques. Eight is
// comfortably more than an afternoon's pickings and comfortably less than one
// of everything, so the pack is a thing you occasionally have to think about
// without ever being a thing you have to manage. Stacks are uncapped, so it
// only ever runs out of KINDS.
export const SLOTS = 8;

// The three koi of the tinted era, and the drawn species each one became.
//
// Matched by look rather than by position: the persimmon one became the apricot
// carp, the cream one the loach with the pink petals, the pale blue one the sky
// teardrop. Somebody who caught three fish last week still has three fish, and
// they are the three nearest to what they remember catching.
const RETIRED = {
  koiOrange: 'apricotMoonspotCarp',
  koiCream: 'blushspotLoach',
  koiBlue: 'skyTeardropFish',
};

// A save of any vintage, brought up to the shape this code reads — or null when
// there is nothing usable, which the loader treats as a fresh pack.
//
// THIS IS WHY THE VERSION FIELD EXISTS. It answers "what shape is this object",
// and the shape genuinely changed this time: a pouch was `counts[id]`, a set
// with no order and no limit, and a pack is an array of slots. A save cannot be
// read as both, so v1 is CONVERTED rather than discarded — the alternative is
// silently emptying the bag of everyone who played last week, which is the one
// thing a version number is there to prevent.
//
// The conversion pours the old ledger into slots in ITEMS order, which is the
// order the panel shows anyway, so a returning pouch looks arranged rather than
// shuffled. Anything past the eighth kind is dropped, and that is the honest
// answer: the pack has eight slots, and a save from before there were slots
// cannot be given more.
//
// The zukan's tally and the friends' cooldowns come across untouched — they are
// claims about afternoons that happened, and a schema change is no reason to
// unremember them. What does NOT come across is where the uniques were: v1 wrote
// down placements and loans, v2 deliberately does not (see _save), so an old
// save's bear simply goes home.
function upgrade(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.version === VERSION) return s;
  if (s.version !== 1) return null;

  const counts = { ...(s.counts || {}) };
  const caught = { ...(s.caught || {}) };
  let holding = s.holding;
  for (const [was, now] of Object.entries(RETIRED)) {
    for (const book of [counts, caught]) {
      if (!book[was]) continue;
      book[now] = (book[now] || 0) + book[was];
      delete book[was];
    }
    if (holding === was) holding = now;
  }

  const slots = new Array(SLOTS).fill(null);
  let held = null;
  let i = 0;
  for (const id of Object.keys(ITEMS)) {
    if (i >= SLOTS || !(counts[id] > 0)) continue;
    slots[i] = { id, n: Math.floor(counts[id]) };
    if (id === holding) held = i;
    i += 1;
  }
  // A unique that was in the old save's hand keeps its place in the new pack,
  // if there is a slot left for it. One that was out in the world does not:
  // v2 does not remember the map.
  for (const [id, rec] of Object.entries(s.uniques || {})) {
    if (!ITEMS[id] || ITEMS[id].kind !== 'unique' || rec.state !== 'hand') continue;
    const free = slots.findIndex((c) => c === null);
    if (free < 0) break;
    slots[free] = { id, n: 1 };
    held = free;
  }
  return { version: VERSION, slots, caught, given: s.given || {}, held };
}

export class Inventory {
  constructor() {
    // THE BACKPACK. `slots` is the whole of what you are carrying, in the order
    // you are carrying it: a fixed run of SLOTS, each empty or holding one kind
    // of thing. That is the change from the pouch it replaced, which was a
    // LEDGER — `counts[id]`, a set with no order and no limit — and the
    // difference is not bookkeeping. A ledger answers "how many do I have"; a
    // pack answers "what have I got room for", and only the second is a thing
    // you can make a decision about.
    //
    // A slot is null, or { id, n }. `n` is the stack, and it is UNCAPPED: a cap
    // turns tidying your bag into a chore, and this is not that kind of game.
    // A unique takes a slot with n always 1, since there is exactly one bear.
    //
    //   caught:  id -> how many ever caught (the zukan's numbers; never
    //            decremented, because giving a fish away does not un-catch it)
    //   given:   character key -> epoch ms of their last gift, for the cooldown
    //   held:    the INDEX of the slot in your hand, or null
    //
    // `held` being an index rather than an id is the small decision the rest
    // rests on: your hand holds A PLACE IN THE PACK rather than a kind of
    // thing. Putting something away is forgetting an index, and nothing ever
    // has to search the pack for where the held thing came from.
    this.slots = new Array(SLOTS).fill(null);
    this.caught = {};
    this.given = {};
    this.held = null;
    // Where each unique is, for the ones NOT in the pack. See unique().
    this.uniques = {};
    this._listeners = [];
    this._saveArmed = false;

    // Load, forgivingly. A save from a version this code has never heard of, a
    // corrupt JSON, private mode with storage disabled — all of them land on
    // "fresh pack" rather than a crash, because a broken save is a worse
    // outcome for a toy like this than a lost one.
    try {
      const s = upgrade(JSON.parse(localStorage.getItem(KEY)));
      if (s) {
        // Slot by slot against the table, so an id retired from ITEMS quietly
        // leaves the pack instead of haunting it as an unnameable chip.
        for (let i = 0; i < SLOTS; i++) {
          const c = s.slots && s.slots[i];
          if (!c || !ITEMS[c.id] || !(c.n > 0)) continue;
          const one = ITEMS[c.id].kind === 'unique';
          this.slots[i] = { id: c.id, n: one ? 1 : Math.floor(c.n) };
        }
        for (const id of Object.keys(ITEMS)) {
          if (s.caught && s.caught[id] > 0) this.caught[id] = Math.floor(s.caught[id]);
        }
        if (s.given) this.given = { ...s.given };
        if (this.slots[s.held]) this.held = s.held;
        // A UNIQUE IN THE PACK IS THE ONLY UNIQUE THE SAVE REMEMBERS. One left
        // standing on a hillside or lent to a friend is not written down at
        // all, so a reload finds it back in its spot — see the note at _save.
        for (const [i, c] of this.slots.entries()) {
          if (c && ITEMS[c.id].kind === 'unique') {
            this.uniques[c.id] = { state: i === this.held ? 'hand' : 'stored' };
          }
        }
      }
    } catch { /* fresh pack */ }
  }

  // Everything that shows the pack — the panel, the hand, the pill's label —
  // redraws off this one signal, so none of them can disagree.
  onChange(fn) { this._listeners.push(fn); }

  _emit() {
    this._save();
    for (const fn of this._listeners) fn(this);
  }

  // ------------------------------------------------------------- the hand
  //
  // `holding` is the stackable in your hand and keeps the name every caller
  // already uses; `heldUnique` is the same question narrowed to a unique, which
  // is what the carrying code asks. Both are DERIVED from the one index, so
  // there is no second copy of the truth to fall out of step with it.
  get holding() {
    const c = this.slots[this.held];
    return c && ITEMS[c.id].kind !== 'unique' ? c.id : null;
  }

  get heldUnique() {
    const c = this.slots[this.held];
    return c && ITEMS[c.id].kind === 'unique' ? c.id : null;
  }

  slotOf(id) { return this.slots.findIndex((c) => c && c.id === id); }

  count(id) {
    const i = this.slotOf(id);
    return i < 0 ? 0 : this.slots[i].n;
  }

  // Which slots have something in them, as indices — what the panel walks.
  filled() {
    return this.slots.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  }

  get isFull() { return this.slots.every((c) => c !== null); }

  // ------------------------------------------------------------ the uniques
  //
  // A record per unique that is not simply at home:
  //   'stored'  in a slot           'hand'    in a slot and in your hand
  //   'placed'  set down somewhere   'given'   lent to a friend
  //
  // Only the first two survive a reload, and that is the whole of the world's
  // memory: your pack persists, the map does not.
  unique(id) {
    return this.uniques[id] || { state: 'home' };
  }

  setUnique(id, rec) {
    this.uniques[id] = rec;
    if (rec.state === 'hand' || rec.state === 'stored') {
      // Into the pack if it is not there already, and into the hand or not
      // depending on which of the two was asked for.
      let i = this.slotOf(id);
      if (i < 0) i = this.slots.findIndex((c) => c === null);
      if (i < 0) {
        // No room. It stays in the world rather than vanishing — a full pack
        // must refuse a pickup, not swallow it.
        this.uniques[id] = { state: 'home' };
        this._emit();
        return false;
      }
      this.slots[i] = { id, n: 1 };
      if (rec.state === 'hand') this.held = i;
      else if (this.held === i) this.held = null;
    } else {
      // Out in the world: it gives its slot back. A bear on a stump is not in
      // your bag, and holding a slot open for it would be the pack quietly
      // shrinking every time you decorated the meadow.
      const i = this.slotOf(id);
      if (i >= 0) {
        this.slots[i] = null;
        if (this.held === i) this.held = null;
      }
    }
    this._emit();
    return true;
  }

  // Into the pack. FALSE WHEN THERE IS NO ROOM, and callers must respect that:
  // a pickup that cannot fit has to leave the thing where it was, or the pack's
  // limit would be a limit on nothing.
  add(id, n = 1) {
    if (!ITEMS[id]) return false;
    if (ITEMS[id].kind === 'unique') return this.setUnique(id, { state: 'stored' });
    const at = this.slotOf(id);
    if (at >= 0) { this.slots[at].n += n; this._emit(); return true; }
    const free = this.slots.findIndex((c) => c === null);
    if (free < 0) return false;
    this.slots[free] = { id, n };
    this._emit();
    return true;
  }

  // False when there is nothing to take, and the caller decides what that
  // means — the gift flow falls back to a plain greeting.
  take(id) {
    const i = this.slotOf(id);
    if (i < 0 || this.slots[i].n <= 0) return false;
    this.slots[i].n -= 1;
    if (this.slots[i].n <= 0) {
      // The last one out empties the slot, and empties the hand with it if that
      // is what you were holding. You gave that one away; you did not become a
      // dispenser for the rest, and there are no rest.
      this.slots[i] = null;
      if (this.held === i) this.held = null;
    }
    this._emit();
    return true;
  }

  // Take slot `i` in hand. The panel presses this; everything else goes through
  // `hold`, which finds the slot for an id first.
  holdSlot(i) {
    const c = this.slots[i];
    if (!c) return;
    if (ITEMS[c.id].kind === 'unique') { this.setUnique(c.id, { state: 'hand' }); return; }
    // One hand: a unique already in it goes back to merely being stored.
    const was = this.heldUnique;
    this.held = i;
    if (was) this.uniques[was] = { state: 'stored' };
    this._emit();
  }

  hold(id) {
    const i = this.slotOf(id);
    if (i >= 0) this.holdSlot(i);
  }

  putAway() {
    if (this.held === null) return;
    const was = this.heldUnique;
    this.held = null;
    if (was) this.uniques[was] = { state: 'stored' };
    this._emit();
  }

  // Put what is in one slot into another: swap with whatever is already there,
  // or pour into it when the two are the same stackable kind. This is the whole
  // of arranging your bag, and it is deliberately the ONLY thing that reorders
  // slots — every other way in appends to the first hole it finds, because a
  // pickup is not a decision and this is.
  //
  // THE HAND FOLLOWS THE THING, NOT THE BOX. `held` is an index into `slots`,
  // which is what makes putting something away a matter of forgetting a number
  // — and it is exactly why a swap has to carry it. Left alone, moving anything
  // into the slot you were holding would silently put that thing in your hand
  // instead, the pack rearranging your grip behind your back. Both slots have to
  // be fixed up because either could be the held one, and a merge hands it to
  // whichever of the two survives.
  moveSlot(from, to) {
    if (from === to) return false;
    const a = this.slots[from];
    if (!a) return false;
    const b = this.slots[to];

    // A unique never merges: there is one bear, so two slots can never hold the
    // same one and a same-id landing could only ever be the thing on itself.
    if (b && b.id === a.id && ITEMS[a.id].kind !== 'unique') {
      b.n += a.n;
      this.slots[from] = null;
      if (this.held === from) this.held = to;
    } else {
      this.slots[to] = a;
      this.slots[from] = b;
      if (this.held === from) this.held = to;
      else if (this.held === to) this.held = from;
    }
    this._emit();
    return true;
  }

  // The rod's deposit slot: count the catch for the zukan and put the fish in
  // the pack. THE TALLY IS KEPT EVEN WHEN THE PACK IS FULL, because it records
  // what you have caught rather than what you are carrying — a fish you had to
  // let go is still a fish you met.
  recordCatch(id) {
    this.tally(id);
    return this.add(id);
  }

  // The 図鑑's half of a catch, on its own — because the two halves can come
  // apart. A fish landed with a full pack slips back into the water, and it is
  // still a fish you caught and saw: the tally is a record of what you have
  // MET, not of what you are carrying.
  tally(id) {
    this.caught[id] = (this.caught[id] || 0) + 1;
    this._emit();
  }

  // Whether one more of `id` would fit. An id already in the pack always fits,
  // because stacks are uncapped — the pack runs out of kinds, not of things.
  hasRoomFor(id) {
    return this.slotOf(id) >= 0 || !this.isFull;
  }

  lastGiven(charKey) { return this.given[charKey] || 0; }

  markGiven(charKey) {
    this.given[charKey] = Date.now();
    this._emit();
  }

  // WHAT IS WRITTEN DOWN, and what deliberately is not.
  //
  // The pack, the zukan and the friends' cooldowns persist. Where things are in
  // the WORLD does not — no placed positions, no loans out. A reload gives a
  // pristine map with your pack intact, which is both easier to reason about
  // and truer to what this place is: the world resets to how it likes to be,
  // and what you are carrying is yours.
  //
  // Writes are debounced. Gifting fires several changes in a row and
  // localStorage is synchronous, so coalescing them into one write at the end
  // of the tick is both cheaper and atomic: no save can capture the middle of
  // a gift.
  _save() {
    if (this._saveArmed) return;
    this._saveArmed = true;
    setTimeout(() => {
      this._saveArmed = false;
      try {
        localStorage.setItem(KEY, JSON.stringify({
          version: VERSION,
          slots: this.slots,
          caught: this.caught,
          given: this.given,
          held: this.held,
        }));
      } catch { /* private mode: the pack lives for the session */ }
    }, 250);
  }
}
