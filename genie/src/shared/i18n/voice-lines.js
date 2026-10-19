// 潘吉的台词 · every line Pangie speaks, both languages. zh / en are the caption AND what she says (zhSay / enSay only
// change the pronunciation where a synthesiser needs help). Fixed text only — no guest names, no answers, no prices — so
// every line can be pre-rendered (premium voice pack) and nothing about a guest is ever spoken or sent anywhere.
// Lives under i18n/ because it is bilingual data: the caption is lineText(id) from voice.js, never t(), so caption and
// voice cannot drift apart (test/i18n.test.mjs skips this folder; test/voice.test.mjs checks the table instead).
//
//   level    key = ritual moments (always) · full = encouragements along the way (CONFIG.voice.level 'full') · staff = settings
//   speaker  pangie = her mouth moves (<Pangie speaker />) · lamp = she answers from inside the lamp (the lamp glows instead)
//   once     at most once per guest (voice.newGuest() resets it)
//   mood / prop   her pose while saying it · delay / mode   the moment's suggested say() options
//   caption  bubble = the companion bubble shows exactly this text · screen = the same words are on screen · none
//   at       where it is said (for the wiring) · note   delivery direction (sent to Gemini TTS with the line, never guest data)
// Design round: scratchpad/voice/SPEC.md §2 (every moment, delivery, the rules for when she is silent).

export const GROUPS = [
  { id: 'shell', zh: '许愿模式开场', en: 'Wish Mode splash' },
  { id: 'welcome', zh: '开场', en: 'Welcome' },
  { id: 'lamp', zh: '擦亮神灯', en: 'The lamp' },
  { id: 'cards', zh: '五张牌', en: 'The five cards' },
  { id: 'along', zh: '一路陪着你', en: 'Along the way' },
  { id: 'reveal', zh: '揭晓', en: 'The reveal' },
  { id: 'blueprint', zh: '梦想家蓝图', en: 'The blueprint' },
  { id: 'home', zh: '带它回家', en: 'Bring it home' },
  { id: 'bye', zh: '闲置与告别', en: 'Idle & goodbye' },
  { id: 'staff', zh: '员工试听', en: 'Staff audition' },
];

/** the demo order of the journey (spec §2) */
export const SEQUENCE = ['shell.begin', 'welcome.hello', 'lamp.rub', 'lamp.done', 'ch.intuition', 'life.bell', 'tr.appliances', 'wishes.three', 'nogo.enter', 'reveal.reading', 'reveal.shown', 'bp.end', 'bye.next'];

export const LINES = [
  {
    id: 'shell.begin', group: 'shell', level: 'key', speaker: 'lamp', mood: 'happy', prop: 'ball', delay: 0, mode: 'interrupt', caption: 'none', at: 'src/wish/WishSplash.jsx → WishMode.begin(l)',
    zh: '来啦来啦！',
    en: 'Coming, coming!',
    note: 'Answering from inside the lamp: bright, delighted, a little hurried — as if running to the door. Very short.',
  },
  {
    id: 'welcome.hello', group: 'welcome', level: 'key', speaker: 'pangie', once: true, mood: 'happy', prop: 'ball', delay: 900, mode: 'queue', caption: 'screen', at: 'src/quiz/steps.jsx · Welcome (cover, first touch) · Wish Mode: the shell queues it once after the splash',
    zh: '嗨，我是潘吉！不用懂设计，跟着第一感觉走就好。',
    en: 'Hi, I’m Pangie! No design know-how needed — just follow your first feeling.',
    note: 'A warm, bright hello with a smile you can hear; a little lift on her name (“潘吉” / “Pangie”). The second sentence softer and reassuring, slowing on the last words.',
  },
  {
    id: 'lamp.rub', group: 'lamp', level: 'key', speaker: 'lamp', mood: 'mystic', prop: 'none', delay: 900, mode: 'interrupt', caption: 'screen', at: 'src/quiz/steps.jsx · LampRub',
    zh: '用手指轻轻擦一擦神灯，把我叫出来吧。',
    en: 'Give the lamp a gentle rub with your finger to bring me out.',
    note: 'From inside the lamp: intimate, a little secretive and playful. Unhurried.',
  },
  {
    id: 'lamp.hint', group: 'lamp', level: 'full', speaker: 'lamp', mood: 'wink', prop: 'none', delay: 9000, mode: 'ifIdle', caption: 'screen', at: 'src/quiz/steps.jsx · LampRub',
    zh: '轻轻擦一擦，我就出来啦。',
    en: 'Just a gentle rub — and out I come!',
    note: 'Encouraging, with a tiny giggle; never impatient.',
  },
  {
    id: 'lamp.done', group: 'lamp', level: 'key', speaker: 'pangie', mood: 'wow', prop: 'ball', delay: 650, mode: 'interrupt', caption: 'screen', at: 'src/quiz/steps.jsx · LampRub',
    zh: '我来啦！',
    en: 'Here I am!',
    note: 'Pop! A joyful arrival: bright, quick, smiling.',
  },
  {
    id: 'ch.intuition', group: 'cards', level: 'key', speaker: 'pangie', mood: 'mystic', prop: 'cards', delay: 1150, mode: 'interrupt', caption: 'screen', at: 'src/quiz/steps.jsx · Interlude (chapter=intuition)',
    zh: '直觉之牌。别想，3 秒内跟着第一感觉选。',
    en: 'The Intuition Card. Don’t think — go with your first feeling, within 3 seconds.',
    zhSay: '直觉之牌。别想，三秒内，跟着第一感觉选。',
    enSay: 'The Intuition Card. Don’t think — go with your first feeling, within three seconds.',
    note: 'The card name like a small proud announcement. Then lighter and quicker — a playful dare: go with your gut.',
  },
  {
    id: 'ch.life', group: 'cards', level: 'key', speaker: 'pangie', mood: 'mystic', prop: 'cards', delay: 1150, mode: 'interrupt', caption: 'screen', at: 'src/quiz/steps.jsx · Interlude (chapter=life)',
    zh: '生活之牌。想象一个普通的星期六。',
    en: 'The Life Card. Picture an ordinary Saturday.',
    note: 'Dreamy and relaxed; a little sigh of pleasure on “星期六” / “Saturday”.',
  },
  {
    id: 'ch.treasure', group: 'cards', level: 'key', speaker: 'pangie', mood: 'think', prop: 'magnifier', delay: 1150, mode: 'interrupt', caption: 'screen', at: 'src/quiz/steps.jsx · Interlude (chapter=treasure)',
    zh: '宝藏之牌。现在请慢下来——数字越准，柜子越合身。',
    en: 'The Treasure Card. Now slow down — the truer the numbers, the better your cabinets will fit.',
    note: 'Calmer and slower; say “慢下来” / “slow down” slowly. Gentle, like settling in to count together.',
  },
  {
    id: 'ch.wishes', group: 'cards', level: 'key', speaker: 'pangie', mood: 'think', prop: 'ball', delay: 1150, mode: 'interrupt', caption: 'screen', at: 'src/quiz/steps.jsx · Interlude (chapter=wishes)',
    zh: '愿望之牌。我只能实现三个愿望哦。',
    en: 'The Wishes Card. I can only grant three wishes.',
    note: 'Telling a little secret, with a cheeky smile on “只能” / “only”.',
  },
  {
    id: 'ch.nogo', group: 'cards', level: 'key', speaker: 'pangie', mood: 'mystic', prop: 'cards', delay: 1150, mode: 'interrupt', caption: 'screen', at: 'src/quiz/steps.jsx · Interlude (chapter=nogo)',
    zh: '雷区之牌。最后，帮我扫个雷吧。',
    en: 'The Deal-Breaker Card. Last one — tell me what you’d never want.',
    note: 'Light and conspiratorial; a tiny playful frown on “雷” / “never”.',
  },
  {
    id: 'life.home', group: 'along', level: 'full', speaker: 'pangie', mood: 'idle', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step life:home) → Companion bubble',
    zh: '说真话哦，我不会笑你的。',
    en: 'Be honest — I won’t laugh.',
    note: 'Teasing-sweet, with a smile and a tiny giggle on “笑” / “laugh”.',
  },
  {
    id: 'life.cook', group: 'along', level: 'full', speaker: 'pangie', mood: 'idle', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step life:cook) → Companion bubble',
    zh: '生活怎么过，家就怎么做。',
    en: 'Your home should fit the way you live.',
    note: 'Warm and a little wise for her age; matter-of-fact and kind.',
  },
  {
    id: 'life.bell', group: 'along', level: 'key', speaker: 'pangie', mood: 'wink', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step life:bell, LIFE.bell.whisper) → Companion bubble',
    zh: '放心，只有你和你的设计师会看到。',
    en: 'Don’t worry — only you and your designer will see this.',
    note: 'A stage whisper, close to the ear and smiling — a shared secret.',
  },
  {
    id: 'life.who', group: 'along', level: 'full', speaker: 'pangie', mood: 'idle', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step life:who) → Companion bubble',
    zh: '家里的每一位，我都想照顾到。',
    en: 'I want everyone at home to feel looked after.',
    note: 'Tender and sincere.',
  },
  {
    id: 'tr.shoes', group: 'along', level: 'full', speaker: 'pangie', mood: 'think', prop: 'magnifier', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step shoes) → Companion bubble',
    zh: '我也在数鞋子呢……大概就好。',
    en: 'I’m counting shoes too… a rough guess is fine.',
    note: 'Absorbed and playful, as if counting under her breath; then relaxed on “大概就好” / “a rough guess is fine”.',
  },
  {
    id: 'tr.wardrobe', group: 'along', level: 'full', speaker: 'pangie', mood: 'think', prop: 'magnifier', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step wardrobe) → Companion bubble',
    zh: '衣柜，是全屋定制的心脏哦。',
    en: 'The wardrobe is the heart of every built-in home.',
    note: 'Earnest and a little proud — she knows this one.',
  },
  {
    id: 'tr.books', group: 'along', level: 'full', speaker: 'pangie', mood: 'think', prop: 'magnifier', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step books) → Companion bubble',
    zh: '书和收藏，都是你的故事。',
    en: 'Books and collections — they’re all part of your story.',
    note: 'Soft and admiring.',
  },
  {
    id: 'tr.appliances', group: 'along', level: 'full', speaker: 'pangie', mood: 'think', prop: 'magnifier', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step appliances) → Companion bubble',
    zh: '小家电最爱抢台面了！',
    en: 'Small appliances love hogging the counter!',
    note: 'Cheeky and mock-indignant, with a laugh in it.',
  },
  {
    id: 'tr.bulky', group: 'along', level: 'full', speaker: 'pangie', mood: 'think', prop: 'magnifier', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step bulky) → Companion bubble',
    zh: '这些大家伙，最常被忘记。',
    en: 'These big items are the easiest to forget.',
    note: 'Matter-of-fact and a little conspiratorial.',
  },
  {
    id: 'tr.ratio', group: 'along', level: 'full', speaker: 'pangie', mood: 'think', prop: 'magnifier', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step ratio) → Companion bubble',
    zh: '拖拖看，柜子会变哦！',
    en: 'Drag it — watch the cabinets change!',
    note: 'Inviting and playful, a little magic on “变” / “change”.',
  },
  {
    id: 'wishes.full', group: 'along', level: 'key', speaker: 'pangie', mood: 'think', prop: 'ball', delay: 0, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/steps.jsx · WishesStep toggle (a 4th wish) → say(\'think\', …)',
    zh: '只能三个哦！先放掉一个。',
    en: 'Only three! Let one go first.',
    note: 'Gently cheeky, never scolding — a small shrug in the voice.',
  },
  {
    id: 'wishes.three', group: 'along', level: 'key', speaker: 'pangie', mood: 'happy', prop: 'ball', delay: 250, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/steps.jsx · WishesStep toggle (the 3rd wish) → say(\'happy\', …)',
    zh: '三个愿望，我收到啦！',
    en: 'Three wishes — I’ve got them!',
    note: 'Delighted, a little sparkle; quick.',
  },
  {
    id: 'wishes.splurge', group: 'along', level: 'full', speaker: 'pangie', mood: 'think', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step splurge) → Companion bubble',
    zh: '钱要花在你最在乎的地方。',
    en: 'Spend where it matters most to you.',
    note: 'Sensible and warm, like good advice from a friend.',
  },
  {
    id: 'nogo.enter', group: 'along', level: 'key', speaker: 'pangie', mood: 'idle', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step nogo) → Companion bubble',
    zh: '讨厌的东西，我一个都不会放进你的家。',
    en: 'I won’t let a single thing you dislike into your home.',
    note: 'A firm little promise — protective and warm, a tiny nod at the end.',
  },
  {
    id: 'onewish.enter', group: 'along', level: 'key', speaker: 'pangie', mood: 'idle', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/QuizApp.jsx · Play enter-line effect (step onewish) → Companion bubble',
    zh: '最后一句，我会抄在你的蓝图上。',
    en: 'Last words — I’ll write them on your blueprint.',
    note: 'Tender and slower, like holding a pen ready.',
  },
  {
    id: 'reveal.reading', group: 'reveal', level: 'key', speaker: 'pangie', mood: 'mystic', prop: 'ball', delay: 500, mode: 'interrupt', caption: 'screen', at: 'src/quiz/Reveal.jsx (phase reading)',
    zh: '让我读一读你的梦想……',
    en: 'Let me read your dream…',
    note: 'Hushed and slow, mystical, trailing off — eyes closed.',
  },
  {
    id: 'reveal.shown', group: 'reveal', level: 'key', speaker: 'pangie', once: true, mood: 'happy', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'screen', at: 'src/quiz/Reveal.jsx (phase shown)',
    zh: '就是这一张——你的梦想家卡牌！',
    en: 'Here it is — your Dreamer Card!',
    note: 'A delighted little gasp, then warm and proud. The peak of the journey — joy, never shouting.',
  },
  {
    id: 'reveal.nudge', group: 'reveal', level: 'full', speaker: 'pangie', mood: 'wink', prop: 'ball', delay: 8000, mode: 'ifIdle', caption: 'none', at: 'src/quiz/Reveal.jsx (phase shown, 8 s untouched)',
    zh: '带它回家吧，我给你挑了几个家。',
    en: 'Let’s bring it home — I’ve picked a few homes for you.',
    note: 'A gentle, excited invitation — like a friend who found something for you. Not pushy.',
  },
  {
    id: 'bp.hello', group: 'blueprint', level: 'key', speaker: 'pangie', once: true, mood: 'happy', prop: 'ball', delay: 900, mode: 'interrupt', caption: 'screen', at: 'src/quiz/Blueprint.jsx (fresh only)',
    zh: '这是你的梦想家蓝图，慢慢看。',
    en: 'Here’s your Dream Home Blueprint — take your time.',
    note: 'Warm and proud, settling down — a host handing over a gift.',
  },
  {
    id: 'bp.end', group: 'blueprint', level: 'key', speaker: 'pangie', once: true, mood: 'wink', prop: 'ball', delay: 300, mode: 'queue', caption: 'screen', at: 'src/quiz/Blueprint.jsx · .bp-end (seal + Pangie wink)',
    zh: '你的梦想，我记住啦。接下来，我们把它变成你走得进的 3D 家。',
    en: 'Your dream is safe with me. Next, we’ll turn it into a 3D home you can walk through.',
    note: 'A promise with a wink: warm first, then a little excited on “3D”.',
  },
  // ── 带它回家（揭晓之后：你的家 · 案例 · 户型图 · 生成，src/quiz/home/）── 只有固定的话，不带客人的任何资料
  {
    id: 'home.enter', group: 'home', level: 'key', speaker: 'pangie', mood: 'happy', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/home/HomeJourney.jsx · H1 你的家是 (companion bubble)',
    zh: '带它回家吧！先告诉我，你的家是什么样的？',
    en: 'Let’s bring it home! First, tell me about your home.',
    note: 'Bright and eager, a new little adventure starting; the question warm and curious.',
  },
  {
    id: 'home.size', group: 'home', level: 'full', speaker: 'pangie', mood: 'idle', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/home/HomeJourney.jsx · H3 大概多大 (companion bubble)',
    zh: '大概就好，不确定也没关系。',
    en: 'Roughly is fine — not sure is fine too.',
    note: 'Easy-going and reassuring, a small shrug in the voice.',
  },
  {
    id: 'cases.enter', group: 'home', level: 'key', speaker: 'pangie', mood: 'happy', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'none', at: 'src/quiz/home/CasesStep.jsx · C 最像你的家 (the small Pangie in the header speaks)',
    zh: '这些家和你的牌最像。挑一两个你喜欢的。',
    en: 'These homes are most like your card. Pick one or two you love.',
    note: 'Proud to show them, like opening a photo album for a friend; unhurried.',
  },
  {
    id: 'plan.enter', group: 'home', level: 'key', speaker: 'pangie', mood: 'happy', prop: 'ball', delay: 700, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/home/HomeJourney.jsx · P 户型图 (companion bubble)',
    zh: '最后一步：给我你家的户型图，我就能把它变成你的家。',
    en: 'Last step: give me your floor plan, and I’ll turn it into your home.',
    note: 'A little lift on “最后一步 / Last step”, then a warm promise.',
  },
  {
    id: 'plan.staff', group: 'home', level: 'full', speaker: 'pangie', mood: 'happy', prop: 'none', delay: 500, mode: 'interrupt', caption: 'screen', at: 'src/quiz/home/HomeJourney.jsx · waiting card (Wish Mode: 请员工帮我上传)',
    zh: '好的，请员工帮你上传，我在这里等。',
    en: 'Sure — our team will add it. I’ll wait right here.',
    note: 'Calm and patient; no hurry at all.',
  },
  {
    id: 'plan.reading', group: 'home', level: 'full', speaker: 'pangie', mood: 'think', prop: 'magnifier', delay: 500, mode: 'interrupt', caption: 'screen', at: 'src/quiz/home/HomeJourney.jsx · reading card (Pangie with the magnifier)',
    zh: '我在用放大镜看你的户型图……',
    zhSay: '我在用放大镜看你的户型图。',
    en: 'I’m reading your floor plan with my magnifier…',
    enSay: 'I’m reading your floor plan with my magnifier.',
    note: 'Concentrating, a little playful — a detective at work. Trailing off softly.',
  },
  {
    id: 'plan.done', group: 'home', level: 'key', speaker: 'pangie', mood: 'happy', prop: 'magnifier', delay: 600, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/home/HomeJourney.jsx · R 这是你的家吗 (companion bubble)',
    zh: '读好了！看看像不像你的家？',
    en: 'Done! Does this look like your home?',
    note: 'Pleased with herself, then a genuinely curious question.',
  },
  {
    id: 'plan.later', group: 'home', level: 'full', speaker: 'pangie', mood: 'idle', prop: 'ball', delay: 0, mode: 'interrupt', caption: 'bubble', at: 'src/quiz/home/HomeJourney.jsx · P 我还没有户型图 (companion bubble while the screen changes)',
    zh: '没关系，先用示范户型给你看，之后再给我也可以。',
    en: 'That’s okay — I’ll use a sample layout for now. You can give me the plan later.',
    note: 'Kind and easy, no disappointment at all.',
  },
  {
    id: 'keep.enter', group: 'home', level: 'full', speaker: 'pangie', mood: 'think', prop: 'magnifier', delay: 700, mode: 'queue', caption: 'bubble', at: 'src/quiz/home/HomeJourney.jsx · K 家里有哪些会留下来 (companion bubble)',
    zh: '家里有哪些会留下来？我会让新的和旧的配在一起。',
    en: 'What’s staying? I’ll make the new and the old go together.',
    note: 'Thoughtful and caring; a gentle promise in the second sentence.',
  },
  {
    id: 'gen.ready', group: 'home', level: 'key', speaker: 'pangie', mood: 'happy', prop: 'ball', delay: 900, mode: 'queue', caption: 'screen', at: 'src/quiz/home/GenerateStep.jsx · G 把它放进你的家 (line under the card)',
    zh: '准备好了 —— 按一下，去看你的家！',
    en: 'All set — tap to see your home!',
    note: 'Excited anticipation, a small breath before “去看你的家 / see your home”.',
  },
  // 最后一步（业主 2026-10-19）：3D 里看过自己的家之后，许愿模式的外壳升起「交给设计师」
  {
    id: 'lead.enter', group: 'home', level: 'full', speaker: 'pangie', mood: 'happy', prop: 'ball', delay: 500, mode: 'interrupt', caption: 'none', at: 'src/quiz/home/LeadSheet.jsx · 交给我们的设计师 (Wish Mode shell, after the 3D; the sheet shows its own text)',
    zh: '喜欢的话，留下你的名字，设计师会接着帮你画。',
    en: 'If you like it, leave your name — our designer will carry on drawing it for you.',
    note: 'Warm and light, no sales pressure — like a friend offering to pass it on.',
  },
  {
    id: 'lead.thanks', group: 'home', level: 'key', speaker: 'pangie', mood: 'happy', prop: 'ball', delay: 250, mode: 'interrupt', caption: 'screen', at: 'src/quiz/home/LeadSheet.jsx · thank-you card (line under the title)',
    zh: '谢谢你！接下来，让我们的设计师来帮你。',
    en: 'Thank you! Now let our designer take it from here.',
    note: 'Genuinely grateful, then a calm hand-over — proud of what you made together.',
  },
  {
    id: 'idle.still', group: 'bye', level: 'key', speaker: 'pangie', mood: 'think', prop: 'none', delay: 300, mode: 'interrupt', caption: 'screen', at: 'src/quiz/QuizApp.jsx · Prompt (idle, Wish Mode)',
    zh: '还在吗？',
    en: 'Still there?',
    note: 'Soft and curious, a gentle rising question — not alarmed.',
  },
  {
    id: 'bye.next', group: 'bye', level: 'key', speaker: 'pangie', mood: 'happy', prop: 'ball', delay: 0, mode: 'interrupt', caption: 'none', at: 'src/wish/WishShell.jsx · nextGuest() (staff 下一位客人) · src/quiz/Blueprint.jsx 下一位 (standalone)',
    zh: '谢谢你来许愿，下次见！',
    en: 'Thank you for making a wish — see you next time!',
    note: 'A warm goodbye with a little wave in the voice.',
  },
  {
    id: 'staff.sample', group: 'staff', level: 'staff', speaker: 'pangie', mood: 'idle', prop: 'ball', delay: 0, mode: 'interrupt', caption: 'none', at: 'Staff settings · 潘吉的声音 → 试听 (studio SettingsModal)',
    zh: '嗨，我是潘吉。这样的声音，你喜欢吗？',
    en: 'Hi, I’m Pangie. Do you like the way I sound?',
    note: 'Natural and friendly, like meeting someone for the first time.',
  },
];

export default { version: 1, groups: GROUPS, sequence: SEQUENCE, lines: LINES };
