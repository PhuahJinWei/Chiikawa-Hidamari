// Original lines, one bank per character. They do not talk alike, and that is
// most of what makes three characters feel like three characters rather than
// one character wearing three hats.
//
//   Chiikawa  — fragments, trailing off, wails more than speaks
//   Hachiware — fluent and upbeat, finishes sentences, encourages you
//   Usagi     — barely words at all, pure volume and momentum
//
// expr: normal | happy | delight | sleepy | worried | surprise
// w: relative weight for the weighted random pick (default 1)
//
// `delight` is Chiikawa's alone, and reached from exactly two places: `greet`
// and `gift`. It is the face kept for being singled out — you came to see them,
// or you brought them something — and spending it on an idle line would make
// both occasions ordinary, which is the whole of why it is not spent there.
//
// `night` is the biggest bucket any of them has, and deliberately. Nobody
// sleeps here — night is the hour they are most awake, out under the stars —
// so it carries the stargazing, and it has to outlast the other three phases
// because night is the longest of them. Chiikawa is quietly floored by it,
// Hachiware has a fact about it, Usagi just points.
//
// Two buckets have been and gone. `greetLong` greeted somebody who had not
// visited in days, and needed a record of when you last came that the app no
// longer keeps. `dozing` was what they mumbled while asleep, and nobody sleeps.
// Both removed rather than left lying about looking usable. `greetBack` is NOT
// in that category and stays: walking up to someone still reaches it, no memory
// of past visits required.

const chiikawa = {
  greet: [
    { t: 'あ…! きてくれた…!', expr: 'delight' },
    { t: 'わァ…! まってたよ…', expr: 'delight' },
    { t: 'あっ…、こんにちは…!', expr: 'delight' },
  ],
  idle: [
    { t: 'ふぅ…', expr: 'normal', w: 2 },
    { t: 'きょうは しずかだね…', expr: 'normal' },
    { t: 'ここ、あったかい…', expr: 'happy' },
    { t: 'へへ…', expr: 'happy', w: 2 },
    { t: '…ねむくなってきた', expr: 'sleepy' },
    { t: 'ずっと こうしてたいなぁ…', expr: 'happy' },
    { t: 'そばに いてくれて ありがと…', expr: 'happy' },
  ],
  ask: [
    { t: 'ごはん、たべた…?', expr: 'normal' },
    { t: 'つかれてない…?', expr: 'worried' },
    { t: 'ちゃんと ねてる…?', expr: 'worried' },
    { t: 'いいこと、あった…?', expr: 'happy' },
    { t: 'むりして ない…?', expr: 'worried' },
  ],
  narrate: [
    { t: '（きょうの ごはん、なににしよ…）', expr: 'normal' },
    { t: '（おなか すいた…）', expr: 'worried' },
    { t: '（がんばったら、なんとか なるかな）', expr: 'normal' },
    { t: '（…なにか わすれてる きがする）', expr: 'surprise' },
    { t: '（くもが ゆっくり うごいてる…）', expr: 'happy' },
  ],
  morning: [
    { t: 'おはよ…', expr: 'sleepy' },
    { t: 'あさだ…! すごい…', expr: 'happy' },
  ],
  noon: [
    { t: 'おひるだ…', expr: 'normal' },
    { t: 'ひなたが あったかい…', expr: 'happy' },
  ],
  evening: [
    { t: 'そらが あかい…', expr: 'happy' },
    { t: 'きょうも おつかれさま…', expr: 'happy' },
  ],
  night: [
    { t: 'もう おそいよ…?', expr: 'worried' },
    { t: 'ほし…、すごい…', expr: 'surprise', w: 2 },
    { t: 'あんなに いっぱい ある…', expr: 'happy' },
    { t: 'ながれぼし…! いま、みた…?', expr: 'surprise' },
    { t: 'そら、ちかい きがする…', expr: 'happy' },
    { t: 'くらいけど…、こわく ないよ', expr: 'happy' },
    { t: 'ずっと みてたく なっちゃう…', expr: 'happy' },
    { t: 'ねむい…、けど まだ みてたい', expr: 'sleepy' },
  ],
  longIdle: [
    { t: '（…ねちゃいそう）', expr: 'sleepy' },
    { t: 'ん…、まだ いる…?', expr: 'sleepy' },
  ],
  indoor: [
    { t: 'あっ…! きたの…?', expr: 'surprise' },
    { t: 'ここ、あったかいでしょ…', expr: 'happy', w: 2 },
    { t: 'ちょっと やすんでたの…', expr: 'normal' },
    { t: 'そとより しずかだね…', expr: 'happy' },
    { t: 'ゆっくり してって…', expr: 'happy', w: 2 },
    { t: '…おちつく', expr: 'sleepy' },
  ],
  poke: [
    { t: 'なぁに…?', expr: 'normal' },
    { t: 'ん?', expr: 'surprise' },
    { t: 'よんだ…?', expr: 'happy' },
  ],
  greetBack: [
    { t: 'また きてくれた…!', expr: 'happy' },
    { t: 'さっきぶり…!', expr: 'happy' },
  ],
  meet: [
    { t: 'あ…、いた', expr: 'happy' },
    { t: 'いっしょに いる…?', expr: 'happy' },
  ],
  meetReply: [
    { t: 'うん…!', expr: 'happy' },
    { t: 'へへ…', expr: 'happy' },
  ],
  water: [
    { t: 'あっ、ぬれちゃうよ…!', expr: 'surprise' },
    { t: 'つめたく ない…?', expr: 'worried' },
  ],
  // Being handed something. `gift` is the full moment and the second place
  // `delight` is ever reached — receiving a present sits level with your
  // arrival, which is exactly where it belongs. `giftAgain` is the same
  // gratitude inside the cooldown window: still glad, audibly aware this is
  // the second one, and never a refusal — see social.giftCooldown.
  gift: [
    { t: 'えっ…、くれるの…? わ…!', expr: 'delight' },
    { t: 'わァ…! たからものに する…!', expr: 'delight' },
    { t: 'うれしい…、へへ…', expr: 'delight' },
  ],
  giftAgain: [
    { t: 'また…? いいの…?', expr: 'happy' },
    { t: 'さっきのも、まだ だいじに もってる…', expr: 'happy' },
  ],
  // Their favourite — see `likes` in cast.js. Chiikawa's is a fistful of
  // weeds, which is the most Chiikawa thing that could possibly be true.
  giftLove: [
    { t: 'く、くさ…! いちばん すきなやつ…!', expr: 'delight' },
    { t: 'これ…! これが よかったの…!', expr: 'delight' },
  ],
};

const hachiware = {
  greet: [
    { t: 'やあ! よく きたね!', expr: 'happy' },
    { t: 'あっ、いらっしゃい! まってたんだ', expr: 'happy' },
    { t: 'きみが きてくれると、うれしいよ!', expr: 'happy' },
  ],
  idle: [
    { t: 'いい てんきだねぇ', expr: 'happy', w: 2 },
    { t: 'こういう ひは、なにも しないのが いちばんだよ', expr: 'happy' },
    { t: 'ぼく、ここの けしきが すきなんだ', expr: 'happy' },
    { t: 'ふふん、なんだか いい きぶん!', expr: 'happy' },
    { t: 'すこし やすんでいきなよ', expr: 'normal' },
    { t: 'あわてなくて だいじょうぶ。じかんは あるよ', expr: 'normal' },
  ],
  ask: [
    { t: 'きょうは どんな いちにちだった?', expr: 'normal' },
    { t: 'ちゃんと ごはん たべてる?', expr: 'worried' },
    { t: 'なにか こまってること、ない?', expr: 'worried' },
    { t: 'たまには やすんだほうが いいよ?', expr: 'normal' },
    { t: 'すきな たべものって なに?', expr: 'happy' },
  ],
  narrate: [
    { t: '（あしたは なにを しようかな）', expr: 'normal' },
    { t: '（こういう じかんが、いちばん しあわせかも）', expr: 'happy' },
    { t: '（あとで ちいかわに おしえてあげよう）', expr: 'happy' },
    { t: '（かぜの おとが きこえる…）', expr: 'normal' },
  ],
  morning: [
    { t: 'おはよう! きょうも いい ひに なるよ', expr: 'happy' },
    { t: 'あさの くうき、きもちいいね!', expr: 'happy' },
  ],
  noon: [
    { t: 'おひるだ! なにか たべた?', expr: 'happy' },
    { t: 'ひざしが つよいね。むりしないで', expr: 'normal' },
  ],
  evening: [
    { t: 'ゆうやけ、きれいだねぇ', expr: 'happy' },
    { t: 'きょうも よく がんばったね', expr: 'happy' },
  ],
  night: [
    { t: 'ほしが みえるよ。ほら、あそこ', expr: 'happy', w: 2 },
    { t: 'わあ、きょうは よく みえるねぇ!', expr: 'happy' },
    { t: 'ほしの ひかりって、ずっと むかしの ものなんだって', expr: 'surprise' },
    { t: 'よぞら、みてると おちつくよね〜', expr: 'happy' },
    { t: 'ながれぼし! おねがいごと、まにあった?', expr: 'surprise' },
    { t: 'ならんで みると、もっと きれいだよ', expr: 'happy' },
    { t: 'ねなくても へいきさ。きょうは とくべつ!', expr: 'happy' },
  ],
  longIdle: [
    { t: 'ゆっくりしてって いいからね', expr: 'happy' },
    { t: 'あれ、ねむくなっちゃった?', expr: 'sleepy' },
  ],
  indoor: [
    { t: 'いらっしゃい! よく きてくれたね!', expr: 'happy' },
    { t: 'まるい へやはね、おとが よく まわるんだ', expr: 'happy', w: 2 },
    { t: 'そとを あるいたあとの ここが いちばんだよ', expr: 'happy' },
    { t: 'まどから そらが みえるでしょ。いい ながめ!', expr: 'happy', w: 2 },
    { t: 'あかりを つけると、とおくからでも わかるんだ', expr: 'normal' },
    { t: 'すこし やすんだら、また そとに いこうか', expr: 'normal' },
  ],
  poke: [
    { t: 'ん? どうしたの?', expr: 'normal' },
    { t: 'よんだ? なになに?', expr: 'happy' },
    { t: 'おっと、びっくりした!', expr: 'surprise' },
  ],
  greetBack: [
    { t: 'おかえり! はやかったね', expr: 'happy' },
    { t: 'また あえたね!', expr: 'happy' },
  ],
  meet: [
    { t: 'やあ! なにしてたの?', expr: 'happy' },
    { t: 'いい ところで あったね!', expr: 'happy' },
  ],
  meetReply: [
    { t: 'そうなんだ、いいねぇ', expr: 'happy' },
    { t: 'ふふ、なるほどね', expr: 'happy' },
  ],
  water: [
    { t: 'あっ、そこ みずだよ!', expr: 'surprise' },
    { t: 'すべらないでね〜', expr: 'worried' },
  ],
  gift: [
    { t: 'えっ、ぼくに? ありがとう!', expr: 'surprise' },
    { t: 'わあ! たいせつに するね!', expr: 'happy' },
    { t: 'いいの!? うれしいなぁ', expr: 'happy' },
  ],
  giftAgain: [
    { t: 'さっきも もらったのに… ありがと!', expr: 'happy' },
    { t: 'こんなに もらって いいのかなぁ', expr: 'happy' },
  ],
  giftLove: [
    { t: 'おさかな! ぼく これ だいすきなんだ!', expr: 'surprise' },
    { t: 'わあ、いい さかな! よく つれたねぇ!', expr: 'happy' },
  ],
};

const usagi = {
  greet: [
    { t: 'ウラ!!', expr: 'happy', w: 2 },
    { t: 'ヤハ!!', expr: 'happy' },
    { t: 'ウラ〜〜ッ!!', expr: 'surprise' },
  ],
  idle: [
    { t: 'ウラ', expr: 'normal', w: 3 },
    { t: 'ヤハ〜', expr: 'happy', w: 2 },
    { t: 'プルルルルル…', expr: 'normal' },
    { t: 'ウララ〜', expr: 'happy' },
    { t: 'ハァ…', expr: 'sleepy' },
    { t: 'フゥン', expr: 'normal' },
  ],
  ask: [
    { t: 'ウラ?', expr: 'surprise', w: 2 },
    { t: 'ヤ?', expr: 'normal' },
    { t: 'ウラ ウラ?', expr: 'happy' },
  ],
  narrate: [
    { t: '（ウラ…）', expr: 'normal' },
    { t: '（…プルルル）', expr: 'sleepy' },
    { t: 'ウ ラ ラ', expr: 'happy' },
  ],
  morning: [
    { t: 'ウラーッ!! （あさだ）', expr: 'happy' },
    { t: 'ヤハ!! ヤハ!!', expr: 'happy' },
  ],
  noon: [
    { t: 'ウラ! （はら へった）', expr: 'surprise' },
    { t: 'ハーッ', expr: 'normal' },
  ],
  evening: [
    { t: 'ウラ…（きれい）', expr: 'happy' },
    { t: 'ヤ〜ハ〜', expr: 'happy' },
  ],
  night: [
    { t: 'ウラ…（ほし）', expr: 'surprise', w: 2 },
    { t: 'ウラーーッ!!', expr: 'surprise' },
    { t: 'ヤ〜…（みあげてる）', expr: 'happy' },
    { t: 'ウラ! ウラ!! （ゆびさし）', expr: 'happy' },
    { t: 'ハァ…（きれい）', expr: 'happy' },
    { t: 'プルルル…（ねむい）', expr: 'sleepy' },
  ],
  longIdle: [
    { t: '…プルルルルル', expr: 'sleepy' },
    { t: 'ハァ…', expr: 'sleepy' },
  ],
  indoor: [
    { t: 'ウラ! ウラ!', expr: 'happy', w: 2 },
    { t: 'ヤハ〜', expr: 'happy', w: 2 },
    { t: 'フゥ…', expr: 'sleepy' },
    { t: 'ムフ', expr: 'happy' },
    { t: 'プルルル…', expr: 'sleepy' },
  ],
  poke: [
    { t: 'ウラ?!', expr: 'surprise', w: 2 },
    { t: 'ヤ!', expr: 'happy' },
  ],
  greetBack: [
    { t: 'ウラ! また!', expr: 'happy' },
    { t: 'ヤハ!', expr: 'happy' },
  ],
  meet: [
    { t: 'ウラ!', expr: 'happy' },
    { t: 'ヤハ?', expr: 'surprise' },
  ],
  meetReply: [
    { t: 'ウラ ウラ', expr: 'happy' },
    { t: 'ヤ〜', expr: 'happy' },
  ],
  water: [
    { t: 'ウラ?! （みず）', expr: 'surprise' },
    { t: 'プルルル…', expr: 'normal' },
  ],
  gift: [
    { t: 'ウラ!? …ウラァ!!', expr: 'surprise', w: 2 },
    { t: 'ヤハ────!!', expr: 'happy' },
    { t: 'プルルルル!! （だいじに にぎった）', expr: 'happy' },
  ],
  giftAgain: [
    { t: 'ウラ! ウラ!', expr: 'happy' },
    { t: 'フンフン♪', expr: 'happy' },
  ],
  giftLove: [
    { t: 'ウラ────ッ!!! （きのこ）', expr: 'surprise', w: 2 },
    { t: 'ヤハーッ!! ヤハーッ!!', expr: 'happy' },
  ],
};

export const BANKS = { chiikawa, hachiware, usagi };

// Which bucket the ambient chatter draws from, and how often.
export const AMBIENT_MIX = [
  { key: 'idle', w: 4 },
  { key: 'ask', w: 3 },
  { key: 'narrate', w: 3 },
  { key: 'timeOfDay', w: 2 },
];

// The buckets above are named for the phases in daylight.js, and asking it
// which one we are in is the whole of the lookup — there used to be a copy of
// its hour table here, which was fine until the hour became something you could
// set by hand and the two could disagree.
