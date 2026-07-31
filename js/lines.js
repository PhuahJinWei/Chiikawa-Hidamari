// Original lines, one bank per character. They do not talk alike, and that is
// most of what makes three characters feel like three characters rather than
// one character wearing three hats.
//
//   Chiikawa  — fragments, trailing off, wails more than speaks
//   Hachiware — fluent and upbeat, finishes sentences, encourages you
//   Usagi     — barely words at all, pure volume and momentum
//
// Chiikawa's ordinary chatter stays close to the small things that occupy him:
// work, the weeding exam, food, and whether his friends are safe. Hachiware
// turns those same things into plans, questions, discoveries, and invitations.
// Usagi gets fewer lines on purpose. Japanese in parentheses is reserved for
// visible actions; it never translates the noises and makes him secretly fluent.
//
// expr: normal | happy | delight | sleepy | worried | surprise
// w: relative weight for the weighted random pick (default 1)
//
// `delight` is Chiikawa's alone, and reached from exactly two places: `greet`
// and `gift`. It is the face kept for being singled out — you came to see them,
// or you brought them something — and spending it on an idle line would make
// both occasions ordinary, which is the whole of why it is not spent there.
//
// `night` is the broadest time-of-day bucket, and deliberately. Night is the
// hour they are most awake, out under the stars, so it carries the stargazing —
// and it stayed broad when midnight was carved out of the far end of it,
// because what midnight took was the hours nobody was using it for. Chiikawa is
// quietly floored by it, Hachiware has a fact about it, Usagi just points.
//
// `midnight` is its opposite and is deliberately small: four lines each, sleepy,
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
    { t: 'おしごと…ちゃんと できるかな', expr: 'worried' },
    { t: 'おやつ…まだ あるかな', expr: 'normal' },
    { t: 'くさむしり…もっと じょうずに なりたい', expr: 'normal' },
    { t: 'みんな、いま なにしてるかな…', expr: 'normal' },
  ],
  ask: [
    { t: 'ごはん、たべた…?', expr: 'normal' },
    { t: 'つかれてない…?', expr: 'worried' },
    { t: 'ちゃんと ねてる…?', expr: 'worried' },
    { t: 'いいこと、あった…?', expr: 'happy' },
    { t: 'むりして ない…?', expr: 'worried' },
    { t: 'いっしょに、くさむしり する…?', expr: 'happy' },
    { t: 'おしごと…たいへん?', expr: 'worried' },
    { t: 'なにか みつけた…?', expr: 'surprise' },
    { t: 'おやつ、はんぶんこ する…?', expr: 'happy' },
  ],
  narrate: [
    { t: '（きょうの ごはん、なににしよ…）', expr: 'normal' },
    { t: '（おなか すいた…）', expr: 'worried' },
    { t: '（がんばったら、なんとか なるかな）', expr: 'normal' },
    { t: '（…なにか わすれてる きがする）', expr: 'surprise' },
    { t: '（くもが ゆっくり うごいてる…）', expr: 'happy' },
    { t: '（こんどこそ…ごきゅう…）', expr: 'normal' },
    { t: '（さすまた、れんしゅう しなきゃ…）', expr: 'worried' },
    { t: '（みんなで たべると…おいしい）', expr: 'happy' },
    { t: '（あしたのぶんも…のこしておこ）', expr: 'normal' },
  ],
  morning: [
    { t: 'おはよ…', expr: 'sleepy' },
    { t: 'あさだ…! すごい…', expr: 'happy' },
    { t: 'ふぁ…、まだ ねむい…', expr: 'sleepy' },
    { t: 'あさの くうき…、すきかも', expr: 'happy' },
    { t: 'きょうも、がんばろ…', expr: 'normal' },
    { t: 'はやおき、できた…!', expr: 'happy' },
    { t: 'おしごとの じゅんび…しなきゃ', expr: 'normal' },
  ],
  noon: [
    { t: 'おひるだ…', expr: 'normal' },
    { t: 'ひなたが あったかい…', expr: 'happy' },
    { t: 'おなか…、すいちゃった', expr: 'worried' },
    { t: 'かげが、ちいさい…', expr: 'surprise' },
    { t: 'ちょっと、ひるねしたい…', expr: 'sleepy' },
    { t: 'いい てんき…、へへ', expr: 'happy' },
    { t: 'ごほうび…なにに しよ', expr: 'happy' },
  ],
  evening: [
    { t: 'そらが あかい…', expr: 'happy' },
    { t: 'きょうも おつかれさま…', expr: 'happy' },
    { t: 'もう、こんな じかん…', expr: 'surprise' },
    { t: 'かえりみち…、いっしょに いこ?', expr: 'happy' },
    { t: 'ゆうがた、ちょっと さみしい…', expr: 'worried' },
    { t: 'そら、だんだん くらく なってく…', expr: 'normal' },
    { t: 'きょうも、ぶじで よかった…', expr: 'happy' },
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
    { t: 'ハチワレたちも…みてるかな', expr: 'happy' },
  ],
  midnight: [
    { t: 'もう…、ねなきゃ…', expr: 'sleepy' },
    { t: 'ふぁ…、おやすみ…', expr: 'sleepy' },
    { t: 'しずか…、だね…', expr: 'sleepy' },
    { t: 'め、あいちゃう…', expr: 'sleepy' },
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
    { t: 'あっ…どうしたの…?', expr: 'surprise' },
    { t: 'これ…みてほしいの?', expr: 'normal' },
  ],
  greetBack: [
    { t: 'また きてくれた…!', expr: 'happy' },
    { t: 'さっきぶり…!', expr: 'happy' },
    { t: 'あ…! もどってきた…', expr: 'happy' },
    { t: 'もういっかい…あえた', expr: 'happy' },
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
    { t: 'こんなに…もらって いいの…?', expr: 'surprise' },
    { t: 'ちゃんと…しまっておくね', expr: 'happy' },
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
  // Sitting down beside you, because you sat still long enough — see the
  // joinsit mode in household.js.
  //
  // NOTHING IS ASKED OF YOU in any of these, and that is the rule for the whole
  // bucket rather than a property of the lines that happen to be in it. Every
  // other thing anybody says here is an answer to something you did; this is
  // the one they start themselves, and a question would turn it back into a
  // thing you have to attend to. They are quiet, they are already settling, and
  // the correct next move is nothing.
  sitTogether: [
    { t: 'となり、いい…?', expr: 'happy' },
    { t: 'わたしも…、すわろ…', expr: 'happy' },
    { t: 'ここ、きもちいいね…', expr: 'happy' },
    { t: 'えへへ…', expr: 'happy' },
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
    { t: 'しごとも みんなで やると、ちょっと たのしいね', expr: 'happy' },
    { t: 'あとで みんなにも こえを かけようかな', expr: 'normal' },
    { t: 'おなかが すくと、なんでも おいしく みえるねぇ', expr: 'happy' },
    { t: 'どうぐの ていれも しておかなくちゃ', expr: 'normal' },
    { t: 'うたってたら、なんだか げんきが でてきた!', expr: 'happy' },
  ],
  ask: [
    { t: 'きょうは どんな いちにちだった?', expr: 'normal' },
    { t: 'ちゃんと ごはん たべてる?', expr: 'worried' },
    { t: 'なにか こまってること、ない?', expr: 'worried' },
    { t: 'たまには やすんだほうが いいよ?', expr: 'normal' },
    { t: 'すきな たべものって なに?', expr: 'happy' },
    { t: 'おしごと、うまく いってる?', expr: 'normal' },
    { t: 'なにか おもしろいもの、みつけた?', expr: 'happy' },
    { t: 'いっしょに くさむしり しにいく?', expr: 'happy' },
    { t: 'こんど どこへ いってみたい?', expr: 'happy' },
  ],
  narrate: [
    { t: '（あしたは なにを しようかな）', expr: 'normal' },
    { t: '（こういう じかんが、いちばん しあわせかも）', expr: 'happy' },
    { t: '（あとで ちいかわに おしえてあげよう）', expr: 'happy' },
    { t: '（かぜの おとが きこえる…）', expr: 'normal' },
    { t: '（ちいかわ、しけんの れんしゅうしてるかな）', expr: 'normal' },
    { t: '（うさぎにも あとで こえを かけよう）', expr: 'happy' },
    { t: '（この みち、どこまで つづいてるんだろう）', expr: 'normal' },
    { t: '（きょうの ごほうび、なにに しようかな）', expr: 'happy' },
    { t: '（ギター、あとで ひこうっと）', expr: 'happy' },
  ],
  morning: [
    { t: 'おはよう! きょうも いい ひに なるよ', expr: 'happy' },
    { t: 'あさの くうき、きもちいいね!', expr: 'happy' },
    { t: 'あさは いちにちで いちばん しずかなんだって', expr: 'normal' },
    { t: 'よく ねむれた? ぼくは ばっちり!', expr: 'happy' },
    { t: 'さあ、なにから やろうか!', expr: 'happy' },
    { t: 'あさひ、まぶしいねぇ', expr: 'happy' },
    { t: 'あさのうちに、くさむしり してこようかな', expr: 'normal' },
  ],
  noon: [
    { t: 'おひるだ! なにか たべた?', expr: 'happy' },
    { t: 'ひざしが つよいね。むりしないで', expr: 'normal' },
    { t: 'いまが いちにちで いちばん あかるい じかんだよ', expr: 'happy' },
    { t: 'ひかげで やすむのも だいじだからね', expr: 'normal' },
    { t: 'おひるね、しちゃう?', expr: 'happy' },
    { t: 'ごごも いい かんじに なりそう!', expr: 'happy' },
    { t: 'おひるごはん、みんなで たべようよ!', expr: 'happy' },
  ],
  evening: [
    { t: 'ゆうやけ、きれいだねぇ', expr: 'happy' },
    { t: 'きょうも よく がんばったね', expr: 'happy' },
    { t: 'そらが あかいのは、ひかりが とおくを とおるからなんだ', expr: 'happy' },
    { t: 'そろそろ かえる じゅんび しようか', expr: 'normal' },
    { t: 'よるは すぐ くるからね。きを つけて!', expr: 'normal' },
    { t: 'この じかんの そら、ぼく けっこう すきだな', expr: 'happy' },
    { t: 'みんな ぶじだったし、きょうは いい ひだね!', expr: 'happy' },
  ],
  night: [
    { t: 'ほしが みえるよ。ほら、あそこ', expr: 'happy', w: 2 },
    { t: 'わあ、きょうは よく みえるねぇ!', expr: 'happy' },
    { t: 'ほしの ひかりって、ずっと むかしの ものなんだって', expr: 'surprise' },
    { t: 'よぞら、みてると おちつくよね〜', expr: 'happy' },
    { t: 'ながれぼし! おねがいごと、まにあった?', expr: 'surprise' },
    { t: 'ならんで みると、もっと きれいだよ', expr: 'happy' },
    { t: 'ねなくても へいきさ。きょうは とくべつ!', expr: 'happy' },
    { t: 'ほしの ならび、きのうと すこし ちがうね', expr: 'surprise' },
  ],
  midnight: [
    { t: 'さすがに ねむくなってきたなぁ', expr: 'sleepy' },
    { t: 'ぼく、そろそろ かえるね。おやすみ!', expr: 'sleepy' },
    { t: 'よふかしは よくないよ〜', expr: 'sleepy' },
    { t: 'あしたも あるからね。ね?', expr: 'sleepy' },
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
    { t: 'なにか みつけた?', expr: 'happy' },
    { t: 'いっしょに いく?', expr: 'happy' },
    { t: 'うん、きいてるよ!', expr: 'normal' },
  ],
  greetBack: [
    { t: 'おかえり! はやかったね', expr: 'happy' },
    { t: 'また あえたね!', expr: 'happy' },
    { t: 'おかえり! こんどは どこへ いく?', expr: 'happy' },
    { t: 'また きてくれたんだね!', expr: 'happy' },
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
    { t: 'また くれるの? うれしいなぁ!', expr: 'happy' },
    { t: 'ちゃんと たいせつに しまっておくね!', expr: 'happy' },
  ],
  giftLove: [
    { t: 'おさかな! ぼく これ だいすきなんだ!', expr: 'surprise' },
    { t: 'わあ、いい さかな! よく つれたねぇ!', expr: 'happy' },
  ],
  // See the note on Chiikawa's. Hachiware hands it back the way Hachiware does
  // everything — cheerfully, and already looking forward to the next time.
  // WHAT HE SINGS, on a stump, with a guitar — see PASTIMES in household.js.
  //
  // Hachiware's alone, and it had to be him: he is the one who finishes his
  // sentences, so he is the one who can carry a tune with words in it. The
  // lines are short because they are sung between strums rather than spoken,
  // and none of them is ABOUT singing — somebody announcing that they are
  // singing is not singing.
  sing: [
    { t: '♪ たん、たたん、たーん', expr: 'happy', w: 2 },
    { t: '♪ はれた ひの うたー', expr: 'happy' },
    { t: '♪ ららら、らー', expr: 'happy', w: 2 },
    { t: '♪ きみと ぼくの、さんぽの うたー', expr: 'happy' },
    { t: 'ふふ、いい かんじ!', expr: 'happy' },
    { t: '♪ ひだまり、ひだまりー', expr: 'happy' },
    { t: 'この きょく、いま つくった', expr: 'happy' },
    { t: '♪ たん、たん、たーん…', expr: 'normal' },
  ],

  handBack: [
    { t: 'はい、どうぞ! かして くれて ありがとう!', expr: 'happy' },
    { t: 'たのしかったよ〜! また かしてね!', expr: 'happy' },
    { t: 'うん、かえすね! だいじに してたよ!', expr: 'happy' },
  ],
  // See the note on Chiikawa's. Hachiware settles in the way Hachiware does —
  // pleased with the spot, and with an opinion about it.
  sitTogether: [
    { t: 'ぼくも まぜて〜!', expr: 'happy' },
    { t: 'ここ、いい ばしょだねぇ', expr: 'happy' },
    { t: 'よいしょ…っと', expr: 'happy' },
    { t: 'なんにも しない じかんって、いいよね', expr: 'happy' },
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
    { t: 'ツツ ウラウラ', expr: 'happy' },
    { t: 'ハァ?', expr: 'surprise' },
  ],
  ask: [
    { t: 'ウラ?', expr: 'surprise', w: 2 },
    { t: 'ヤ?', expr: 'normal' },
    { t: 'ウラ ウラ?', expr: 'happy' },
    { t: 'フゥン?', expr: 'normal' },
  ],
  narrate: [
    { t: '（ウラ…）', expr: 'normal' },
    { t: '（…プルルル）', expr: 'sleepy' },
    { t: 'ウ ラ ラ', expr: 'happy' },
    { t: 'ウララララ…', expr: 'happy' },
  ],
  morning: [
    { t: 'ウラーッ!!', expr: 'happy' },
    { t: 'ヤハ!! ヤハ!!', expr: 'happy' },
    { t: 'ウ…ラ…', expr: 'sleepy' },
    { t: 'ヤーッハーッ!!!', expr: 'happy' },
    { t: 'ウラ', expr: 'normal' },
    { t: 'プルルルルル…（のび）', expr: 'sleepy' },
    { t: 'ヤハァーッ!!', expr: 'happy' },
  ],
  noon: [
    { t: 'ウラ!', expr: 'surprise' },
    { t: 'ハーッ', expr: 'normal' },
    { t: 'ウララララ!!', expr: 'happy' },
    { t: 'ヤ…', expr: 'worried' },
    { t: 'ウラ!! ウラ!!', expr: 'happy' },
    { t: 'フンフン♪', expr: 'happy' },
    { t: 'ウラッ! ウラッ!', expr: 'happy' },
  ],
  evening: [
    { t: 'ウラ…', expr: 'happy' },
    { t: 'ヤ〜ハ〜', expr: 'happy' },
    { t: 'ウラーーーッ!! （そらを さした）', expr: 'surprise' },
    { t: 'ハァ…', expr: 'normal' },
    { t: 'ヤ! ヤ!', expr: 'happy' },
    { t: 'ウラ…ウラ…（ゆっくり あるく）', expr: 'sleepy' },
    { t: 'プルルル…', expr: 'normal' },
  ],
  night: [
    { t: 'ウラ…', expr: 'surprise', w: 2 },
    { t: 'ウラーーッ!!', expr: 'surprise' },
    { t: 'ヤ〜…（みあげてる）', expr: 'happy' },
    { t: 'ウラ! ウラ!! （ゆびさし）', expr: 'happy' },
    { t: 'ハァ…', expr: 'happy' },
    { t: 'プルルル…', expr: 'sleepy' },
    { t: 'ウララ…', expr: 'happy' },
  ],
  midnight: [
    { t: 'ハァ…', expr: 'sleepy' },
    { t: 'ウラ…', expr: 'sleepy' },
    { t: 'プルルル…', expr: 'sleepy' },
    { t: 'ヤ…', expr: 'sleepy' },
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
    { t: 'ハァ?', expr: 'surprise' },
  ],
  greetBack: [
    { t: 'ウラ! ウラ!', expr: 'happy' },
    { t: 'ヤハ!', expr: 'happy' },
    { t: 'ウララーッ!', expr: 'happy' },
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
    { t: 'ウラ?!', expr: 'surprise' },
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
    { t: 'ヤハ! ヤハ!', expr: 'happy' },
  ],
  giftLove: [
    { t: 'ウラ────ッ!!!', expr: 'surprise', w: 2 },
    { t: 'ヤハーッ!! ヤハーッ!!', expr: 'happy' },
  ],
  // See the note on Chiikawa's. Usagi hands it back without ceremony and
  // without a word of actual Japanese, which is the whole of Usagi.
  // ON TOP OF A PUDDING AND SLIDING, which is the loudest he ever gets — see
  // PASTIMES in household.js.
  //
  // Almost no words even by his standards, because he is moving too fast to
  // have any. What varies is LENGTH rather than vocabulary: that is the only
  // dial a character without language has, and a long 「ウラララララ!!」 against
  // a flat 「ヤ」 is the difference between a whoop and a wobble.
  play: [
    { t: 'ウラララララララ!!', expr: 'happy', w: 3 },
    { t: 'ヤッハーーー!!', expr: 'happy', w: 2 },
    { t: 'ウラ!!', expr: 'surprise' },
    { t: 'ヤ! ヤ! ヤ!', expr: 'happy', w: 2 },
    { t: 'プルルルルルル!!', expr: 'happy' },
    { t: 'ウ…ラ…（まわってる）', expr: 'surprise' },
    { t: 'ヤーーーッ!!!', expr: 'happy' },
  ],

  handBack: [
    { t: 'ウラ! （さしだした）', expr: 'happy' },
    { t: 'ヤ〜ハ! ウラ!', expr: 'happy' },
    { t: 'プルルル… （そっと おいた）', expr: 'normal' },
  ],
  // See the note on Chiikawa's. Usagi sits down without asking and without
  // words, which is the most Usagi way to accept an invitation nobody made.
  sitTogether: [
    { t: 'ウラ… （すとん）', expr: 'happy' },
    { t: 'ヤハ〜', expr: 'happy' },
    { t: 'フンフン♪', expr: 'happy' },
    { t: 'プルルル…', expr: 'normal' },
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
