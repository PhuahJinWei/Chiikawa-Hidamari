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
// `night` is the biggest bucket any of them has, and deliberately. Night is the
// hour they are most awake, out under the stars, so it carries the stargazing —
// and it stayed the biggest when midnight was carved out of the far end of it,
// because what midnight took was the hours nobody was using it for. Chiikawa is
// quietly floored by it, Hachiware has a fact about it, Usagi just points.
//
// `midnight` is its opposite and is deliberately small: two lines each, sleepy,
// said on the way to bed. It is reached by the ordinary time-of-day chatter, so
// it is what somebody says while they are still UP at that hour — which is most
// of the walk home and nothing after it.
//
// `dozing` IS BACK. It was removed once, in the same sweep as `greetLong`, with
// the note "what they mumbled while asleep, and nobody sleeps". Somebody sleeps
// now — see MIDNIGHT_SLEEP.md — so it returns under its own name rather than as
// a new bucket meaning the same thing. It is reached by ONE path: a tap on a
// sleeping body. There is no `expr` worth setting in it, since the face is
// painted into the sleeping drawing and the card wearing it is not on screen,
// but they carry `sleepy` anyway so that whatever they were wearing when they
// lay down is not what they wake up in.
//
// `greetLong` has NOT come back: it greeted somebody who had not visited in
// days, and needed a record of when you last came that the app does not keep.
// `greetBack` is not in that category and stays: walking up to someone still
// reaches it, no memory of past visits required.

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
  midnight: [
    { t: 'もう…、ねなきゃ…', expr: 'sleepy' },
    { t: 'ふぁ…、おやすみ…', expr: 'sleepy' },
  ],
  // THE WEATHER, named after the weathers exactly as the four above are named
  // after the hours — see the ambient pick in dialogue.js, which reaches for
  // these FIRST and falls back to the hour where a bank has nothing. So a
  // character with no words for drizzle is not a hole, it is somebody who has
  // nothing to say about drizzle, and adding a bucket is the whole of adding
  // one. `clear` is deliberately absent from all three: a bright day is what
  // the time-of-day lines already describe.
  //
  // Chiikawa is the one who worries about it, which is why his rain bank turns
  // and his shelter bank does not: he is anxious out in it and quietly content
  // once he is in, and those two together are more of a character than either
  // is on its own.
  cloudy: [
    { t: 'そら、くもってきた…', expr: 'worried' },
    { t: 'あめ、ふるのかな…', expr: 'worried' },
  ],
  drizzle: [
    { t: 'あ…、ぽつぽつ してる…', expr: 'surprise' },
    { t: 'ぬれちゃう まえに…', expr: 'worried' },
  ],
  rain: [
    { t: 'ざあざあ だ…', expr: 'worried' },
    { t: 'ここなら、ぬれないね…', expr: 'happy' },
    { t: 'あめの おと…、すきかも', expr: 'happy' },
    { t: 'はやく やまないかな…', expr: 'worried' },
  ],
  storm: [
    { t: 'こ、こわい…', expr: 'worried', w: 2 },
    { t: 'ひかった…! いまの…', expr: 'surprise' },
  ],
  clearing: [
    { t: 'あ…、やんだ…!', expr: 'happy', w: 2 },
    { t: 'そら、あかるく なってきた…', expr: 'happy' },
    { t: 'そと、でてみる…?', expr: 'happy' },
  ],
  // THE RAINBOW, reached the moment one comes out — see `bow` in main.js. This
  // is the smallest bucket any of them has and the one that had to be got
  // right: it is the payoff for having sat out a whole shower, and every line
  // in it is somebody looking up rather than commenting.
  //
  // `delight` is spent here, which is only the third place in the whole app it
  // is reached — the other two being your arrival and a present put in their
  // hands. That is the company this moment is meant to keep.
  rainbow: [
    { t: 'にじ…! にじだ…!', expr: 'delight', w: 2 },
    { t: 'わァ…', expr: 'delight' },
    { t: 'きれい…、ずっと みてたい…', expr: 'happy' },
    { t: '（…いいこと、あるかも）', expr: 'happy' },
  ],
  // Reached by the bolt itself rather than by the ambient chatter — see
  // `strike` in main.js. There is no sound in this app, so the flinch has to
  // carry the whole of the thunder, and the flinch is this.
  thunder: [
    { t: 'ひゃあっ…!', expr: 'surprise', w: 2 },
    { t: 'い、いまの…!', expr: 'surprise' },
    { t: 'こわいよぉ…', expr: 'worried' },
  ],
  // Losing their footing on a frozen pond — see `slip` in main.js, which is the
  // only thing that reaches this. Short, because a stumble is short: anything
  // with a sentence in it reads as a speech about having fallen over.
  slip: [
    { t: 'わっ…!', expr: 'surprise', w: 2 },
    { t: 'つるつる…', expr: 'worried' },
    { t: 'あ、あぶない…', expr: 'worried' },
  ],
  // SNOW IS THE OTHER WAY ROUND FROM RAIN, and Chiikawa's bank is where you can
  // see it plainest. His rain lines worry; his snow lines do not worry at all.
  // It is the one weather in this world he is uncomplicatedly pleased about,
  // and giving him a single anxious snow line would take that away.
  snow: [
    { t: 'ゆき…! ゆきだ…!', expr: 'surprise', w: 2 },
    { t: 'つもってきた…', expr: 'happy' },
    { t: 'てのひらで、とけちゃう…', expr: 'happy' },
    { t: 'しろい…、きれい…', expr: 'happy', w: 2 },
    { t: 'ちょっと さむいけど…、へへ', expr: 'happy' },
  ],
  blizzard: [
    { t: 'まえが みえない…!', expr: 'worried', w: 2 },
    { t: 'さ、さむい…!', expr: 'worried' },
  ],
  dozing: [
    { t: 'すぅ…、すぅ…', expr: 'sleepy', w: 2 },
    { t: 'むにゃ…', expr: 'sleepy' },
    { t: '（…おふとん）', expr: 'sleepy' },
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
  // Handing a borrowed thing back. NOT the mirror of `gift` — nothing is being
  // parted with, so there is no gratitude to play and no sadness either. What
  // it is is the small politeness at the end of a loan: they were looking after
  // it, they enjoyed it, here it is. A refusal or a sulk would make asking for
  // your own lamp back feel like a thing you had done TO somebody.
  handBack: [
    { t: 'あっ…、はい…! ありがとう…', expr: 'happy' },
    { t: 'たのしかった…! だいじに もってたよ…', expr: 'happy' },
    { t: 'うん…、かえすね…', expr: 'normal' },
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
  midnight: [
    { t: 'さすがに ねむくなってきたなぁ', expr: 'sleepy' },
    { t: 'ぼく、そろそろ かえるね。おやすみ!', expr: 'sleepy' },
  ],
  // Hachiware does weather the way Hachiware does everything: cheerfully, and
  // with a fact about it. The storm line is the one worth keeping if these are
  // ever cut down — counting the gap between the flash and the sound is exactly
  // the thing he would know, and it is the only place in the app that mentions
  // the thunder anybody can only see.
  cloudy: [
    { t: 'くもってきたねぇ。ひとあめ くるかも', expr: 'normal' },
    { t: 'かぜが しめってきた。あめの まえの においだよ', expr: 'normal' },
  ],
  drizzle: [
    { t: 'ぽつぽつ きたね。まだ へいきかな', expr: 'normal' },
    { t: 'こういう こさめ、きらいじゃないんだ', expr: 'happy' },
  ],
  rain: [
    { t: 'よく ふるねぇ! なかで まってようか', expr: 'happy' },
    { t: 'あまやどりも、たまには たのしいよ', expr: 'happy', w: 2 },
    { t: 'あめの おとって、ずっと きいてられるよね', expr: 'happy' },
    { t: 'あめの ひは、そとが しずかに なるんだ', expr: 'normal' },
  ],
  storm: [
    { t: 'すごい あらしだ! ここなら あんしんだよ', expr: 'surprise' },
    { t: 'ひかってから おとが くるまでが、とおさなんだって', expr: 'surprise' },
  ],
  clearing: [
    { t: 'あ、あがったみたい! でてみようよ!', expr: 'happy', w: 2 },
    { t: 'あめあがりの くうき、いちばん すきなんだ', expr: 'happy' },
  ],
  // Hachiware looks up and then tells you about it, which is the only way
  // Hachiware knows how to enjoy anything. The second line is his best: it is
  // true, it is the kind of thing he would know, and it is also — quietly — an
  // argument for standing next to your friends to look at something.
  rainbow: [
    { t: 'にじだ! ほら、あそこ!', expr: 'surprise', w: 2 },
    { t: 'にじってね、みる ばしょで かたちが ちがうんだって', expr: 'surprise' },
    { t: 'あめが ふったから、みられたんだね', expr: 'happy', w: 2 },
    { t: 'いいもの みちゃったなぁ', expr: 'happy' },
  ],
  thunder: [
    { t: 'うわっ! いまの おおきかったね!', expr: 'surprise' },
    { t: 'だいじょうぶ、ここまでは こないよ', expr: 'worried' },
  ],
  slip: [
    { t: 'おっとっと!', expr: 'surprise', w: 2 },
    { t: 'つるつるだ〜!', expr: 'happy' },
  ],
  // Hachiware in the snow is Hachiware organising something, which is exactly
  // what he would be doing. The middle line is the one that matters — it is the
  // only place in the app where somebody says out loud what the gathering is
  // for, and it wants to sound like an idea he has just had.
  snow: [
    { t: 'ゆきだ! つもるかなぁ', expr: 'happy', w: 2 },
    { t: 'ねえ、ゆきだるま つくらない?', expr: 'happy', w: 2 },
    { t: 'ゆきの けっしょうって、ぜんぶ かたちが ちがうんだって', expr: 'surprise' },
    { t: 'あしあとが ついてく! おもしろいね', expr: 'happy' },
    { t: 'さむいけど、こういう ひも いいよね〜', expr: 'happy' },
  ],
  blizzard: [
    { t: 'これは さすがに なかに はいろう!', expr: 'surprise', w: 2 },
    { t: 'こんな ふぶき、はじめて みたよ', expr: 'surprise' },
  ],
  dozing: [
    { t: 'すー…、すー…', expr: 'sleepy', w: 2 },
    { t: 'ん〜…、あしたね〜…', expr: 'sleepy' },
    { t: '（…しあわせそうな かお）', expr: 'sleepy' },
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
  // See the note on Chiikawa's. Hachiware hands it back the way Hachiware does
  // everything — cheerfully, and already looking forward to the next time.
  handBack: [
    { t: 'はい、どうぞ! かして くれて ありがとう!', expr: 'happy' },
    { t: 'たのしかったよ〜! また かしてね!', expr: 'happy' },
    { t: 'うん、かえすね! だいじに してたよ!', expr: 'happy' },
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
  midnight: [
    { t: 'ハァ…（ねる）', expr: 'sleepy' },
    { t: 'ウラ…', expr: 'sleepy' },
  ],
  // Usagi has no home to run to — see `hide` in household.js, which sends him
  // through whichever door is nearest — and the bank is written for somebody
  // who is a guest in the rain and completely unbothered about it. He is the
  // only one of the three who is louder when it clears than when it started.
  cloudy: [
    { t: 'ウラ…?', expr: 'normal' },
    { t: 'フゥン', expr: 'normal' },
  ],
  drizzle: [
    { t: 'ウラ?', expr: 'surprise' },
    { t: 'ヤ…', expr: 'normal' },
  ],
  rain: [
    { t: 'ウラ〜〜…', expr: 'normal', w: 2 },
    { t: 'プルルルルル…', expr: 'normal' },
    { t: 'ヤハ!', expr: 'happy' },
    { t: 'ハァ…', expr: 'sleepy' },
  ],
  storm: [
    { t: 'ウラ゛ア゛ア゛!!', expr: 'surprise' },
    { t: 'ヤ、ヤハ…', expr: 'worried' },
  ],
  clearing: [
    { t: 'ウラ!!', expr: 'happy', w: 2 },
    { t: 'ヤハ〜〜ッ!!', expr: 'happy' },
  ],
  // Usagi points. That is the whole of it, and it is the right amount: three
  // characters looking at one thing, and the one with no words for it is the
  // one who noticed it first.
  rainbow: [
    { t: 'ウラ!! ウラ!!', expr: 'surprise', w: 3 },
    { t: 'ヤ…ハ…', expr: 'happy' },
    { t: 'ウララ〜〜', expr: 'happy' },
  ],
  thunder: [
    { t: 'ウラ゛ッ!!', expr: 'surprise', w: 2 },
    { t: 'ヒョ!!', expr: 'surprise' },
  ],
  slip: [
    { t: 'ウラ゛!?', expr: 'surprise', w: 2 },
    { t: 'ヤ!!', expr: 'surprise' },
  ],
  // Usagi has been waiting for this all year.
  snow: [
    { t: 'ウラ!!!', expr: 'surprise', w: 3 },
    { t: 'ヤハ〜〜〜ッ!!', expr: 'happy', w: 2 },
    { t: 'ウラララララ!!', expr: 'happy' },
    { t: 'プルルルルル…', expr: 'normal' },
  ],
  blizzard: [
    { t: 'ウラ゛…', expr: 'worried' },
    { t: 'ヤ…', expr: 'normal' },
  ],
  dozing: [
    { t: 'プルルルルル…', expr: 'sleepy', w: 2 },
    { t: 'ウ…ラ…', expr: 'sleepy' },
    { t: '（…ヤハ）', expr: 'sleepy' },
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
  // See the note on Chiikawa's. Usagi hands it back without ceremony and
  // without a word of actual Japanese, which is the whole of Usagi.
  handBack: [
    { t: 'ウラ! （さしだした）', expr: 'happy' },
    { t: 'ヤ〜ハ! ウラ!', expr: 'happy' },
    { t: 'プルルル… （そっと おいた）', expr: 'normal' },
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
