// 展厅播放 · 房间设计特点：词库 + 从图纸文字里认出来（纯函数，Node 可测，不花 AI 费用）。
//
// 三条规矩（老板定的）：
//   1. 图纸必须准确，程序只能「建议」、不能编：只在这一页的图纸文字（标注、视角名、材料部位）里**真的写着**词库的名称 / 别名时才建议，
//      每条建议都带上原文（evidence），设计师看得到是哪一句认出来的。没写的不猜（不看图、不调 AI）。
//   2. 设计师打勾才出现：建议本身不进方案；勾上的才存进 slide.crafts（id 列表，按勾的先后）。设计师也可以从词库手动加（他知道图上有）。
//   3. 定义要老板审过才算数：文字（一句话、好处）只能来自这里的词库，设计师改不了；状态 'pending'（待审）的条目可以先勾，
//      但展厅播放不放（播放器的「预览待审」开关只给内部看，卡片上标「待审」）。'approved' = 老板审过 ✅；'official' = 溪岸官方说法（品牌手册）。
//
// 词库的「一句话」「好处」「状态」和 .claude/skills/interior-design-expert/references/cabinet-craft.md 必须一字不差
// （test/craft.test.mjs 会对一遍）：老板审稿改那份 md → 这里跟着改，两边对不上测试就不过。
// 英文（en）：md 还没有英文栏，审稿时一起补；English 版只放有英文的条目，中英版缺英文时只印中文。

/** 状态：能不能在展厅播放里给客人看 */
export const CRAFT_STATUS = { pending: '待审', approved: '老板审过', official: '溪岸官方说法' };
export const isPlayable = (entry) => entry?.status === 'approved' || entry?.status === 'official';

/** 一个房间（停点）最多讲几个：md「一个房间讲 2–3 个就够」 */
export const CRAFT_MAX = 3;

const E = (id, group, zh, oneLine, benefit, aliases, extra = {}) => ({ id, group, zh, oneLine, benefit, aliases, status: 'pending', en: null, ...extra });

/**
 * group：'craft' 工艺细节（md 一）/ 'method' 设计手法（md 二，「好处」= md 的「效果」）
 * aliases：图纸上可能的写法（含名称本身）；比对时去掉空格、不分大小写；拉丁字母的别名要整词
 * exclude：碰到这些写法就不算（「夹心板」是板材，不是 ABA 夹心）
 */
export const CRAFT_VOCAB = [
  // —— 一、工艺细节 ——
  E('tuofeng', 'craft', '脱缝', '柜体和墙、顶、旁板之间刻意留一道均匀的凹缝', '柜子像「浮」在空间里，更轻；也能吃掉墙面不平', ['脱缝', '离缝', 'shadow gap'], { mdName: '脱缝（也叫离缝）' }),
  E('zhuifeng', 'craft', '追缝', '不同柜子、门板、墙板之间的缝**对齐成一条线**', '整面墙看起来是「一体设计」，不乱', ['追缝', '缝对齐', '缝要对齐']),
  E('duiwen', 'craft', '对纹', '相邻门板的木纹接得上，像同一块木头', '大面木作更整、更贵气', ['对纹', '木纹连续', '纹理连续', '木纹对齐']),
  E('duikai', 'craft', '对开混拼', '宽 220 mm 以上的山纹木皮从中间裁开再随机拼，山纹与直纹自然接上（VISN 原图文字）', '天然木皮尺寸有限，拼得好才有整墙的自然感', ['对开混拼', '混拼'], { mdName: '对开混拼（VISN 木皮拼贴）' }),
  E('xicao', 'craft', '铣槽', '在门板边上铣出凹槽当拉手', '无拉手、立面干净，不勾衣服', ['铣槽', '铣槽拉手', 'J 槽拉手', 'G 槽拉手']),
  E('lacao', 'craft', '拉槽', '门板表面铣出一条条竖向凹槽（凹凸纹理）', '有节奏感和手感，单色也不单调', ['拉槽', 'fluted']),
  E('xieqie', 'craft', '斜切', '门板 / 抽屉面的边做斜角', '斜边本身就是拉手；立面显薄、利落', ['斜切', '斜边拉手']),
  E('xiepin', 'craft', '斜拼', '两块板在转角 45° 拼接，木纹 / 边线绕过转角不断', '看不到板材断面，像一整块实木', ['斜拼', '45° 拼接', '45 度拼接']),
  E('haitang', 'craft', '海棠角', '阳角不做成尖直角，而是做出一个内凹的小台阶 / 小方角（取自传统家具的海棠角）', '不磕手、不易崩边，转角有细节、有东方味', ['海棠角']),
  E('jiaxin', 'craft', '夹心 / ABA 夹心', '层板或边框用「A 料 + B 料 + A 料」三层叠，侧面露出中间那道对比色线', '层板看起来更薄、更精致；有设计细节', ['ABA 夹心', 'ABA', '夹心'], { exclude: ['夹心板', '夹芯板'] }),
  E(
    'gugexian', 'craft', '骨骼线', '柜面上凸出的竖向 / 横向线条，既是结构感也是拉手', '不用另装拉手，立面有家具感', ['骨骼线', 'skeleton line'],
    {
      // 骨骼线是溪岸原创系列名：讲给客人听用官方理念（invite/assets/js/visi/data.js → MB.SERIES_CONCEPT.skeleton / 方案「骨骼线框细节」），不用别家的说法
      status: 'official',
      mdStatus: '⚠️ 用溪岸官方理念',
      show: { oneLine: '灵感取自古典实木家具的形态：骨骼结构既是装饰，也是把手。', benefit: '细线框让每扇柜门都有一道影子，有细节但不繁复。' },
      en: {
        zh: 'Skeleton Line',
        oneLine: 'Inspired by classical solid-wood furniture: the frame is both the ornament and the handle.',
        benefit: 'A fine frame line gives each door its own shadow — detail without ornament.',
      },
      source: '品牌手册 p.9、p.23–24',
    }
  ),
  E('yuanhu', 'craft', '圆弧', '柜体、墙板、台面做成弧形', '动线更顺、更安全，空间变柔和', ['圆弧', '弧形']),
  E('gezha', 'craft', '格栅', '一排间隔的木条做隔断或柜面', '通透、透气，有分区又不封闭', ['格栅', '格珊', 'grille']),
  E('gangqin', 'craft', '钢琴键', '竖条长短 / 进出不一，像钢琴键', '比格栅多一层节奏和立体感', ['钢琴键']),
  E('xixing', 'craft', '铣型', '在板上铣出造型（半圆拉手、图案等）', '拉手和造型一体，有个性', ['铣型', '铣形']),
  E('yinxingmen', 'craft', '隐形门', '门和墙板 / 柜门做平、不留门套', '整面墙干净，门「消失」', ['隐形门', '暗门', 'hidden door', 'invisible door']),
  E('touqi', 'craft', '透气', '板上铣出一排透气缝', '鞋柜、设备柜不闷、不臭', ['透气', '透气孔', '散热孔']),
  E('faguang', 'craft', '发光背板', '柜内背板做成整块发光（灯箱）', '展示更有氛围，酒柜、展示柜的主角', ['发光背板', '背板发光', '灯箱']),
  E('yingpeng', 'craft', '硬碰', '两种材质直接对接、不加收边条', '立面极简、线条干净（对工艺精度要求高）', ['硬碰']),
  // —— 二、设计手法 ——
  E('xuantiao', 'method', '悬挑', '结构一端固定、一端悬空伸出（栖木原文：让家具如漂浮于空间）', '轻盈、漂浮感', ['悬挑']),
  E('dieji', 'method', '叠级', '体块一层层往前 / 往上叠', '有层次，不呆板', ['叠级']),
  E('cuowei', 'method', '错位', '体块上下 / 前后错开，不对齐', '打破方正，有动感', ['错位']),
  E('lifeng', 'method', '离缝', '体块之间留缝分开（与「脱缝」同理，放在体块组合里讲）', '体块独立、更轻', ['离缝']),
  E('jiadiao', 'method', '夹吊', '两个高体块中间夹着吊柜 / 层板', '中间留空、通透，可做展示', ['夹吊']),
  E('jintui', 'method', '进退', '同一立面有凸出、有凹进的体块', '深浅对比、立体', ['进退']),
  E('weihe', 'method', '围合', '体块围出一个框 / 龛', '聚焦中间的展示或功能区', ['围合']),
  E('yaohe', 'method', '咬合', '体块互相嵌进去，像齿轮咬住', '整体感强、有设计张力', ['咬合']),
  E('chuancha', 'method', '穿插', '横板穿过竖向体块', '线条贯穿，空间连贯', ['穿插']),
  E('juzhen', 'method', '矩阵', '同尺寸的模块整齐重复', '秩序感、安静', ['矩阵']),
];

export const CRAFT_BY_ID = new Map(CRAFT_VOCAB.map((e) => [e.id, e]));
export const craftById = (id) => CRAFT_BY_ID.get(id) || null;

/** 给客人看的文字（去掉 md 里的 ** 强调；骨骼线用官方说法） */
export function craftText(entry, lang = 'zh') {
  const strip = (s) => String(s || '').replace(/\*\*/g, '');
  const zh = { name: entry.zh, oneLine: strip(entry.show?.oneLine ?? entry.oneLine), benefit: strip(entry.show?.benefit ?? entry.benefit) };
  const en = entry.en ? { name: entry.en.zh || '', oneLine: entry.en.oneLine || '', benefit: entry.en.benefit || '' } : null;
  return { zh, en: en && en.name && en.benefit ? en : null, lang };
}

// ---------------------------------------------------------------------------
// 从图纸文字认出来
// ---------------------------------------------------------------------------

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s　]+/g, '');
const isLatin = (s) => /^[a-z0-9 °-]+$/i.test(s);
// 前面紧挨着否定词（「不做海棠角」「取消隐形门」「无透气孔」）→ 不算
const NEGATION = /(不|无|没有|没|取消|去掉|不要|不用|免)[做用加设留开]?$/;

/**
 * 这一页的图纸文字从哪里来（导入时从 PDF 读出来、设计师可能改过的栏位）：
 *   标注（notes 的小标题与正文）、视角名（subtitle）、材料部位（materials[].role）
 * @returns {{ where:string, text:string }[]}
 */
export function craftSources(slide) {
  const out = [];
  (slide?.notes || []).forEach((n, i) => {
    const t = [n?.label, n?.text].map((s) => String(s ?? '').trim()).filter(Boolean).join('：');
    if (t) out.push({ where: `标注 ${i + 1}`, text: t });
  });
  if (String(slide?.subtitle ?? '').trim()) out.push({ where: '视角名', text: String(slide.subtitle).trim() });
  (slide?.materials || []).forEach((m) => {
    if (String(m?.role ?? '').trim()) out.push({ where: '材料部位', text: String(m.role).trim() });
  });
  return out;
}

/** 一段文字里有没有这个词条（返回命中的别名；没有 = null） */
export function matchEntry(entry, text) {
  const raw = String(text ?? '');
  const t = norm(raw);
  if (!t) return null;
  // 先挖掉 exclude 的写法（「夹心板」），剩下的再找
  let hay = t;
  for (const ex of entry.exclude || []) hay = hay.split(norm(ex)).join('｜');
  for (const alias of entry.aliases) {
    const a = norm(alias);
    if (!a) continue;
    let from = 0;
    while (true) {
      const k = hay.indexOf(a, from);
      if (k < 0) break;
      from = k + 1;
      if (isLatin(alias)) {
        // 拉丁字母整词：前后不能紧挨字母（'aba' 不认 'abacus'）
        const before = hay[k - 1] || '';
        const after = hay[k + a.length] || '';
        if (/[a-z]/.test(before) || /[a-z]/.test(after)) continue;
      }
      if (NEGATION.test(hay.slice(Math.max(0, k - 4), k))) continue;
      return alias;
    }
  }
  return null;
}

/**
 * 建议：这一页图纸文字里写着的词条（按词库顺序；每条带原文）
 * @returns {{ id, entry, evidence:{ where, text, alias } }[]}
 */
export function detectCrafts(slide, vocab = CRAFT_VOCAB) {
  const sources = craftSources(slide);
  const out = [];
  for (const entry of vocab) {
    for (const src of sources) {
      const alias = matchEntry(entry, src.text);
      if (alias) {
        out.push({ id: entry.id, entry, evidence: { ...src, alias } });
        break;
      }
    }
  }
  return out;
}

/** 设计师勾过的（按勾的先后；词库里没有的 id 丢掉） */
export const tickedCrafts = (slide) => [...new Set(slide?.crafts || [])].map(craftById).filter(Boolean);

/** 勾上 / 取消（返回新的 crafts 列表） */
export function toggleCraft(list, id, on) {
  const cur = [...new Set(list || [])].filter((x) => CRAFT_BY_ID.has(x));
  if (on) return cur.includes(id) ? cur : [...cur, id];
  return cur.filter((x) => x !== id);
}

/**
 * 展厅播放要讲的：勾过的 + 老板审过的（preview = 内部预览：待审的也放，卡片上标「待审」）+ English 版要有英文
 * @param {{ preview?:boolean, lang?:string, skip?:Set<string> }} opts  skip = 同一空间前面已经讲过的
 * @returns {{ entries:object[], held:{ entry, why:string }[] }}  held = 勾了但这次不放的（原因给编辑器提示）
 */
export function playableCrafts(slide, { preview = false, lang = 'zh', skip } = {}) {
  const entries = [];
  const held = [];
  for (const entry of tickedCrafts(slide)) {
    if (skip?.has(entry.id)) continue;
    if (!isPlayable(entry) && !preview) held.push({ entry, why: '定义待老板审，审过才播' });
    else if (lang === 'en' && !craftText(entry, lang).en) held.push({ entry, why: '还没有审过的英文，English 版不播' });
    else if (entries.length >= CRAFT_MAX) held.push({ entry, why: `一个房间最多讲 ${CRAFT_MAX} 个` });
    else entries.push(entry);
  }
  return { entries, held };
}
