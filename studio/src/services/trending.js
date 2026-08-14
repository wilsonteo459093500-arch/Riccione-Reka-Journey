// 「今天最红什么」—— 一个按钮，拿到当下这个平台真正在跑的内容。
//
// 先说清楚哪些是真数据、哪些是推断，因为这决定了你该多相信它：
//
//   YouTube  ✅ 官方榜单。Data API v3 的 chart=mostPopular，浏览器可直连（CORS 已验证），
//               带缩略图、播放量、真实链接。这是唯一一个「平台自己说什么最红」的数据源。
//   其余平台 ⚠️ Google 搜索接地。模型现搜现答，返回的是**真实 URL**，可以点开核，
//               但它是「网上正在讨论什么」，不等于「平台后台的热榜」。
//
// 为什么其余平台只能这样：
//   TikTok    —— Creative Center 有趋势数据但**没有公开 API**；
//                Research / Commercial Content API 要审批，且明确不给商业用途。
//   Instagram —— Graph API **根本没有 trending 端点**。hashtag 查询要 Business 账号
//                + App Review，而且 7 天滚动窗口内最多只能查 30 个 hashtag。
//   小红书/抖音 —— 无公开 API。新红 / 蝉妈妈 / 飞瓜要付费，且都不支持浏览器直连。
//
// 结论：不要为了「看起来全平台都有实时数据」而把接地结果包装成官方热榜。
// UI 上必须分开标注，否则用户会拿一个推断当事实去做决策。

import { generateGroundedJSON } from './gemini.js';
import { platformById } from '../constants.js';

const CACHE_KEY = 'riccione.studio.hotnow.v1';
const CACHE_MS = 15 * 60 * 1000; // 接地有每日额度，15 分钟内重复点同一个平台走缓存

// ---------------------------------------------------------------------------
// YouTube —— 唯一的官方榜
// ---------------------------------------------------------------------------

/** YouTube 分类：26 = Howto & Style（家装/设计最集中的一档），24 = Entertainment */
const YT_CATEGORY = { home: '26', all: '' };

/**
 * 拉 YouTube 当下最热。用的是用户自己的 Google API key（和 Gemini 同一个 project 即可，
 * 需要在 Google Cloud 里额外启用 "YouTube Data API v3"）。
 *
 * 配额：每天 10,000 单位，这个调用只花 1 单位 —— 基本用不完。
 *
 * @param {string} apiKey
 * @param {object} [opts] { regionCode, category, max }
 */
export async function fetchYouTubeTrending(apiKey, opts = {}) {
  if (!apiKey) throw new Error('还没有配置 API key。');
  const region = opts.regionCode || 'MY';
  const cat = YT_CATEGORY[opts.category ?? 'home'] ?? '';

  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    regionCode: region,
    maxResults: String(opts.max || 12),
    key: apiKey,
  });
  if (cat) params.set('videoCategoryId', cat);

  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.error?.message || '';
    const reason = data?.error?.errors?.[0]?.reason || '';
    if (reason === 'accessNotConfigured' || /not been used|disabled/i.test(msg)) {
      const err = new Error(
        'YouTube Data API 还没启用。到 Google Cloud Console → APIs & Services → 搜 "YouTube Data API v3" → Enable，' +
          '用和 Gemini 同一个 project 就行，几十秒生效。'
      );
      err.needsEnable = true;
      throw err;
    }
    if (res.status === 403 && /quota/i.test(msg)) throw new Error('YouTube API 今天的配额用完了，明天再试。');
    throw new Error(msg || `YouTube API 返回 ${res.status}`);
  }

  return (data.items || []).map((v) => {
    const th = v.snippet?.thumbnails || {};
    return {
      id: v.id,
      title: v.snippet?.title || '',
      channel: v.snippet?.channelTitle || '',
      publishedAt: v.snippet?.publishedAt || '',
      thumb: (th.maxres || th.standard || th.high || th.medium || th.default || {}).url || '',
      views: Number(v.statistics?.viewCount || 0),
      likes: Number(v.statistics?.likeCount || 0),
      comments: Number(v.statistics?.commentCount || 0),
      duration: v.contentDetails?.duration || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      // ISO8601 时长里没有 M 和 H = 一分钟以内，基本可以当 Shorts 看
      isShort: /^PT(\d{1,2}S|1M([0-5]?\d)?S?)$/.test(v.contentDetails?.duration || ''),
    };
  });
}

/** 12345678 → 1234.6万 / 1.2K，看着不费劲 */
export function humanCount(n) {
  const x = Number(n) || 0;
  if (x >= 1e8) return `${(x / 1e8).toFixed(1)}亿`;
  if (x >= 1e4) return `${(x / 1e4).toFixed(x >= 1e5 ? 0 : 1)}万`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return String(x);
}

/** ISO8601 → 0:45 */
export function humanDuration(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const [h, mm, s] = [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(mm)}:${pad(s)}` : `${mm}:${pad(s)}`;
}

export function sinceNow(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const h = Math.floor((Date.now() - t) / 36e5);
  if (h < 1) return '刚刚';
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} 天前` : `${Math.floor(d / 30)} 个月前`;
}

// ---------------------------------------------------------------------------
// 其余平台 —— Google 搜索接地
// ---------------------------------------------------------------------------

const HOT_SCHEMA = `{
  "as_of": "模型认为这份结果反映的是什么时间（如 2026-08-14 当周）",
  "confidence": "high | medium | low —— 搜到的东西够不够新、够不够具体",
  "hot": [
    {
      "title": "这条内容/这个格式叫什么，用中文说人话",
      "format": "它的形式（如：口播+字幕 / 快剪卡点 / 前后对比 / 手写清单）",
      "why_now": "为什么是现在红 —— 讲机制，不要讲「因为很吸引人」",
      "evidence": "你在搜索结果里看到的具体证据（谁发的、大概什么数据、哪家媒体在报）",
      "url": "最能代表这条的真实链接，必须来自搜索结果，没有就填空字符串",
      "your_move": "RICCIONE 这个赛道要蹭的话，具体怎么改成自己的，一句话",
      "expires": "还能吃多久：几天 / 1-2 周 / 一个月以上"
    }
  ],
  "sounds": ["正在被大量使用的 BGM / 音效，没搜到就空数组"],
  "avoid": ["现在明显做烂了、别再跟的 2-3 个方向"]
}`;

/**
 * @param {object} o { platformId, niche, region }
 */
export function hotNowPrompt({ platformId, niche, region = '马来西亚' }) {
  const p = platformById(platformId);
  const today = new Date().toISOString().slice(0, 10);

  return `今天是 ${today}。用 Google 搜索查清楚：**此时此刻 ${p.label} 上，${region}的${
    niche || '室内设计 / 全屋定制 / 家居'
  }赛道，最红的内容是什么。**

先搜，再答。至少覆盖这几个角度，不要只搜一次就下结论：

1. \`${p.label} 热门 ${niche || '室内设计'} ${today.slice(0, 7)}\`
2. 这个平台本周/本月的趋势报道、创作者榜单、官方博客
3. ${region}本地的家居/装修类账号最近在发什么
4. 正在被大量套用的 BGM / 音效 / 模板名字

**硬要求：**

- 每一条都必须来自你**真的搜到的**结果。搜不到就少写几条，**不要靠印象补**。
  写一条查得到的，比写五条编的有用一百倍。
- \`url\` 只能填搜索结果里真实出现过的链接。没有就留空，不要拼一个看起来像的。
- \`why_now\` 要讲**机制**：它改变了完播率的哪一环？前 1 秒给了什么？为什么这个季节/这个节点有效？
  「因为内容优质」这种话一句都不要。
- \`your_move\` 是给一个**马来西亚实木家具设计品牌**用的。它做 OEM 代工，不是工厂。
  内容强项是真实案例、木纹质感、十年尺度的耐用性。不要建议它去拍工厂或搞夸张剧情。
- 如果这个平台的公开信息实在太少（小红书、抖音、视频号常见），**直接说 confidence 低**，
  并在 evidence 里写清楚你只找到了什么。不要用通用的「短视频规律」凑数。

只输出一个 \`\`\`json 代码块，结构如下：

\`\`\`json
${HOT_SCHEMA}
\`\`\``;
}

/**
 * 拿「现在最红」——带 15 分钟缓存，因为接地有每日额度。
 * @param {object} settings
 * @param {object} o { platformId, niche, region, force }
 */
export async function fetchHotNow(settings, o) {
  const key = `${o.platformId}::${(o.niche || '').trim()}::${o.region || ''}`;
  if (!o.force) {
    const hit = readCache(key);
    if (hit) return { ...hit, cached: true };
  }

  const out = await generateGroundedJSON(settings, [{ text: hotNowPrompt(o) }], { temperature: 0.4 });

  // 模型偶尔会把没搜到的条目也写上 url。接地返回的 sources 是唯一可信的白名单 ——
  // 不在里面的链接一律降级成「无链接」，不然点开是 404，比没有链接更糟。
  const allowed = new Set(out.sources.map((s) => hostOf(s.uri)).filter(Boolean));
  const hot = (out.data?.hot || []).map((h) => {
    const host = hostOf(h.url);
    return { ...h, url: host && allowed.has(host) ? h.url : '', _dropped: !!(h.url && host && !allowed.has(host)) };
  });

  const result = {
    ...out.data,
    hot,
    sources: out.sources,
    queries: out.queries,
    searchEntryPoint: out.searchEntryPoint,
    fetchedAt: Date.now(),
  };
  writeCache(key, result);
  return { ...result, cached: false };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function readCache(key) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const hit = all[key];
    return hit && Date.now() - hit.fetchedAt < CACHE_MS ? hit : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[key] = value;
    // 只留最近 12 条，免得 localStorage 越滚越大
    const entries = Object.entries(all).sort((a, b) => b[1].fetchedAt - a[1].fetchedAt).slice(0, 12);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* 存不下就算了，不影响功能 */
  }
}

/** 这个平台有没有官方榜可拉 */
export const hasOfficialChart = (platformId) => platformId === 'shorts';
