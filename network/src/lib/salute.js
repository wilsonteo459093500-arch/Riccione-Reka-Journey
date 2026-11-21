/* ============================================================
   SPACE · 称呼（体检第 4 阶段）
   ------------------------------------------------------------
   WhatsApp 预填「Hi ___，」和以后群发用的称呼。
   先用规则猜（不用 AI、不花钱），本人可以在人物页 / 导入清单里改：
     Dato' Lim Kok Wing        → Dato' Lim
     Datuk Seri Ahmad Zahid    → Datuk Seri Zahid
     Tan Ah Kow                → Ah Kow
     Jason Tan Ah Kow          → Jason
     林国荣                    → 国荣
     Muhammad Hafiz bin Ali    → Hafiz
     Ramesh a/l Kumar          → Ramesh
   本人存过的称呼（people.salutation）永远优先。
   ============================================================ */

// 长的放前面（「Datuk Seri」要比「Datuk」先比对）
const HONORIFICS = [
  'tan sri', 'puan sri', 'toh puan', 'datuk seri', "dato' seri", 'dato seri', "dato' sri", 'dato sri', 'datuk sri',
  'datin seri', 'datin sri', 'datin paduka', 'datuk', "dato'", 'dato', 'datin', 'tun', 'tengku', 'tunku', 'ybhg', 'yb',
  'dr', 'prof', 'ir', 'ts', 'ar', 'sr',
  'haji', 'hajjah', 'hj', 'hjh',
  'mr', 'mrs', 'ms', 'mdm', 'madam', 'miss', 'encik', 'en', 'puan', 'pn', 'cik',
];
// 这几个不当称呼的一部分（「Mr Lim」照留，「Haji Ahmad」→ Ahmad）
const DROP_HONORIFICS = new Set(['haji', 'hajjah', 'hj', 'hjh']);
const PRETTY = {
  'tan sri': 'Tan Sri', 'puan sri': 'Puan Sri', 'toh puan': 'Toh Puan', 'datuk seri': 'Datuk Seri', "dato' seri": "Dato' Seri",
  'dato seri': "Dato' Seri", "dato' sri": "Dato' Sri", 'dato sri': "Dato' Sri", 'datuk sri': 'Datuk Sri', 'datin seri': 'Datin Seri',
  'datin sri': 'Datin Sri', 'datin paduka': 'Datin Paduka', datuk: 'Datuk', "dato'": "Dato'", dato: "Dato'", datin: 'Datin', tun: 'Tun',
  tengku: 'Tengku', tunku: 'Tunku', ybhg: 'YBhg', yb: 'YB', dr: 'Dr', prof: 'Prof', ir: 'Ir', ts: 'Ts', ar: 'Ar', sr: 'Sr',
  mr: 'Mr', mrs: 'Mrs', ms: 'Ms', mdm: 'Mdm', madam: 'Madam', miss: 'Miss', encik: 'Encik', en: 'Encik', puan: 'Puan', pn: 'Puan', cik: 'Cik',
};

// 马来西亚常见的华人姓（拼音 / 方言拼法）。Wan、Lee 这类和马来名 / 英文名重叠的照收：只在「第一个字」时才当姓
const CN_SURNAMES = new Set(`
tan lim lee ng wong chan chong teo teoh goh ong lau low yap chua koh ho leong liew loh tay toh yeo yeoh khoo chin cheah foo gan
heng kok kong lai lam leow lew liong loke mah ooi phang quah seah sim soh song tang tee tew wee yong yew choo chew chia chai fong
hew hii kang kee kuan kwan ling moh neo pang poh saw siew soo tai thong tiong yip yu teh cheong choong chuah eng hong khor kuah
lio loo lum nah oh ow pua sia sin tok tung voon chee chiew chiam chow choy chung fung hee hoo hor kam kho kuek kueh kwok lew
liau lok loong lui mok ngo oon pek phua seow sew shum siah sii sit siaw tham then thum ting tsang tse yam yee yeap yuen
zhang wang li liu chen yang huang zhao wu zhou xu sun ma zhu hu guo he lin luo zheng liang xie han feng deng cao peng zeng xiao
tian dong pan yuan cai jiang du ye cheng wei su lu ding ren shen yao cui zhong fan jin shi liao jia xia fu fang bai zou meng xiong
qin qiu yin xue yan duan lei hou long tao gu mao hao gong shao wan qian dai mo xiang
`.trim().split(/\s+/));
// 常见的中文姓（单字；简繁都收）
const CN_SURNAME_CHARS = new Set([...'陈陳林黄黃张張李王吴吳刘劉蔡杨楊许許郑鄭谢謝郭洪邱曾廖赖賴徐周叶葉苏蘇庄莊吕呂江何萧蕭罗羅高潘简簡朱钟鍾彭游詹胡施沈余卢盧梁赵趙颜顏柯翁魏孙孫戴范方宋邓鄧杜傅侯曹薛丁卓马馬阮董唐温溫蓝藍蒋蔣石古纪紀姚连連冯馮欧歐程汤湯田康姜白汪邹鄒尤巫黎涂龚龔严嚴韩韓袁金童陆陸夏柳邵钱錢伍倪于谭譚骆駱熊任甘秦顾顧毛章史官万萬俞雷饶饒邢包孔易艾']);
// 马来名前面常被省略的字（后面还有名字时才省略）
const MALAY_SKIP = new Set(['muhammad', 'muhamad', 'mohammad', 'mohamad', 'mohammed', 'mohamed', 'mohd', 'md', 'muhd', 'ahmad']);
const MALAY_JOIN = new Set(['abdul', 'abd', 'abang', 'awang', 'wan', 'nik', 'megat', 'syed', 'sharifah', 'tuan']);
// bin / binti / a/l / a/p / s/o / d/o 后面是爸爸的名字
const PATRONYMIC = /^(?:bin|binti|bte|bt|b|a\/l|a\/p|s\/o|d\/o|al|ap)\.?$/i;

const CJK = /[㐀-鿿]/;
const cap = (w) => (w && w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w);

/** 中文名字 → 称呼：三个字以上、第一个字是姓 → 后两个字；其他照留 */
function chineseSalutation(s) {
  const zh = (s.match(/[㐀-鿿]+/g) || []).join('');
  if (!zh) return '';
  if (zh.length >= 3 && CN_SURNAME_CHARS.has(zh[0])) return zh.slice(-2);
  return zh;
}

/** 名字前面的称号拆出来：回 { honor: ['Datuk Seri'], rest: 'Ahmad Zahid' } */
function splitHonorifics(s) {
  const honor = [];
  let rest = s;
  for (let guard = 0; guard < 4; guard += 1) {
    const low = rest.toLowerCase();
    const hit = HONORIFICS.find((h) => {
      if (!low.startsWith(h)) return false;
      const after = rest.slice(h.length);
      return after === '' || /^[.\s,]/.test(after) || (h.endsWith("'") && /^\s*\S/.test(after));
    });
    if (!hit) break;
    if (!DROP_HONORIFICS.has(hit)) honor.push(PRETTY[hit] || hit);
    rest = rest.slice(hit.length).replace(/^[.\s,]+/, '');
  }
  return { honor, rest };
}

/** 猜称呼（只看名字，规则判断） */
export function guessSalutation(name) {
  let s = String(name || '')
    .replace(/[(（[【].*?[)）\]】]/g, ' ') // 括号里的备注（公司、在哪认识）
    .replace(/\s[-–—|@].*$/, ' ')            // 「Jason - ABC Trading」「Ali @ JCI」
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return String(name || '').trim();
  if (!/[A-Za-z\u3400-\u9fff]/.test(s)) return ''; // 只有号码（WhatsApp 群里没存名字的人）

  const { honor, rest } = splitHonorifics(s);
  const latin = rest.replace(/[㐀-鿿]+/g, ' ').replace(/[^A-Za-z'./\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const zh = chineseSalutation(rest);
  const zhLooksLikeName = zh && (rest.match(/[㐀-鿿]+/g) || []).some((w) => w.length >= 2 && w.length <= 4 && CN_SURNAME_CHARS.has(w[0]));
  // 好几个称号只留第一个（最大的）：Tan Sri Dato' Sri Dr. Ng → Tan Sri Ng
  const prefix = honor.length ? `${honor[0]} ` : '';
  const royal = honor.length && /^(Tan Sri|Puan Sri|Toh Puan|Tun|Datuk|Dato'|Datin)/.test(honor[0]);

  // 没有英文字：中文名（拿督林国荣 → 拿督林）
  if (!latin) {
    const zm = /^(拿督斯里|丹斯里|潘斯里|拿督|拿汀|敦)\s*([\u3400-\u9fff]{2,4})$/.exec(rest);
    if (zm && CN_SURNAME_CHARS.has(zm[2][0])) return `${zm[1]}${zm[2][0]}`;
    return zh ? (honor.length ? `${prefix}${zh}`.trim() : zh) : s;
  }
  // 中英都有、没有英文称号、中文像名字（林国荣）→ 用中文；「Ah Meng 修车」这种中文不像名字 → 看英文
  if (zh && zhLooksLikeName && !honor.length) return zh;

  // 去掉单个字母的缩写（S. Ramesh、M. Kumar）
  let words = latin.split(' ').filter((w) => w && !/^[A-Za-z]\.?$/.test(w));
  if (!words.length) return s;
  const pi = words.findIndex((w) => PATRONYMIC.test(w));
  const isMalay = pi > 0;
  if (isMalay) words = words.slice(0, pi);

  const first = words[0].toLowerCase().replace(/\.$/, '');
  let given;
  if (first === 'ah' && words.length >= 2) {
    given = `Ah ${cap(words[1])}`; // Ah Meng、Ah Kow：小名
  } else if (!isMalay && CN_SURNAMES.has(first) && words.length >= 2) {
    // 华人：姓在前
    if (honor.length) return `${prefix}${cap(words[0])}`; // Dato' Lim
    given = words.length >= 3 ? `${cap(words[1])} ${cap(words[2])}` : words.map(cap).join(' '); // Tan Ah Kow → Ah Kow
  } else if (!isMalay && words.length >= 2 && CN_SURNAMES.has(words[1].toLowerCase())) {
    // 英文名 + 华人姓：Jason Tan Ah Kow → Jason；Tan Sri Vincent Tan → Tan Sri Vincent；Dr Jason Tan → Dr Tan
    if (honor.length && !royal && !/^(Mr|Mrs|Ms|Mdm|Madam|Miss)$/.test(honor[0])) return `${prefix}${cap(words[1])}`;
    given = cap(words[0]);
  } else {
    // 马来名 / 印度名 / 英文名：第一个名字；Muhammad / Mohd / Ahmad 后面还有名字就跳过；Abdul 要连着下一个字
    let i = 0;
    while (i < words.length - 1 && MALAY_SKIP.has(words[i].toLowerCase().replace(/\.$/, ''))) i += 1;
    given = cap(words[i]);
    if (/^ah$/i.test(words[i]) && words[i + 1]) given = `Ah ${cap(words[i + 1])}`; // Ah Meng
    else if (MALAY_JOIN.has(words[i].toLowerCase()) && words[i + 1]) given = `${cap(words[i])} ${cap(words[i + 1])}`;
  }
  return `${prefix}${given}`.trim() || s;
}

/** 这个人要怎么称呼：本人存过的优先，没有就猜 */
export function salutationOf(person) {
  const own = String((person && person.salutation) || '').trim();
  return own || guessSalutation(person && person.name);
}

/** WhatsApp 预填的第一句：「Hi Dato' Lim，」；不知道怎么称呼就「Hi，」 */
export function greeting(person) {
  const s = salutationOf(person);
  return s ? `Hi ${s}，` : 'Hi，';
}
