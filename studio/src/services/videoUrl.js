// 参考视频链接解析。
//
// 为什么只有 YouTube 能直接用：Gemini 原生支持把 YouTube 链接当视频输入
// （file_data.file_uri 直接传 URL，Google 那边自己去取片），不需要下载也不需要上传。
// 其它平台（TikTok / 抖音 / IG / 小红书…）Gemini 取不到，浏览器也取不到
// —— 那些页面既有 CORS 限制，视频地址也不是公开直链。
// 所以对它们只能老实说「先下载再拖进来」，不假装支持。

const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'];

/** 认得出来但没法直接吃的平台 —— 分别给具体建议，不要笼统报错 */
const KNOWN_UNSUPPORTED = [
  { match: /tiktok\.com/i, label: 'TikTok' },
  { match: /douyin\.com|iesdouyin\.com/i, label: '抖音' },
  { match: /instagram\.com/i, label: 'Instagram' },
  { match: /xiaohongshu\.com|xhslink\.com/i, label: '小红书' },
  { match: /facebook\.com|fb\.watch/i, label: 'Facebook' },
  { match: /bilibili\.com|b23\.tv/i, label: 'B 站' },
  { match: /vimeo\.com/i, label: 'Vimeo' },
  { match: /weixin\.qq\.com|channels\.weixin/i, label: '视频号' },
];

/** 从各种 YouTube 链接形态里抠出 video id */
function youtubeId(u) {
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;

  const v = u.searchParams.get('v');
  if (v) return v;

  // /shorts/ID、/embed/ID、/live/ID、/v/ID
  const m = u.pathname.match(/\/(shorts|embed|live|v)\/([^/?#]+)/);
  return m ? m[2] : null;
}

/**
 * @param {string} raw 用户粘贴的链接
 * @returns {{ok:boolean, kind:string, id?:string, canonical?:string, embed?:string,
 *            label?:string, reason?:string, hint?:string}}
 */
export function parseVideoUrl(raw) {
  const text = (raw || '').trim();
  if (!text) return { ok: false, kind: 'empty', reason: '还没有粘贴链接' };

  let u;
  try {
    u = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return { ok: false, kind: 'invalid', reason: '这不像一个网址，检查一下有没有复制完整' };
  }

  const host = u.hostname.replace(/^www\./, '');

  if (YT_HOSTS.includes(u.hostname) || YT_HOSTS.includes(host)) {
    const id = youtubeId(u);
    if (!id) {
      return {
        ok: false,
        kind: 'youtube-bad',
        label: 'YouTube',
        reason: '这条 YouTube 链接里没有视频 ID',
        hint: '要的是单条视频的链接（watch / shorts / youtu.be），不是频道页或播放列表。',
      };
    }
    return {
      ok: true,
      kind: 'youtube',
      id,
      canonical: `https://www.youtube.com/watch?v=${id}`,
      embed: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }

  const known = KNOWN_UNSUPPORTED.find((k) => k.match.test(host));
  if (known) {
    return {
      ok: false,
      kind: 'unsupported',
      label: known.label,
      reason: `${known.label} 的链接没法直接读`,
      hint: `${known.label} 不给公开直链，浏览器和 Google 都取不到这条片子。先把视频下载下来（大部分平台用第三方下载站或 app 内保存即可），再切到「上传文件」拖进来 —— 效果完全一样。`,
    };
  }

  return {
    ok: false,
    kind: 'unknown',
    label: host,
    reason: `不认识 ${host} 这个站点`,
    hint: '目前只有 YouTube 链接能直接读（含 Shorts）。其它平台先下载视频，再用「上传文件」。',
  };
}

/** 组装成 Gemini 的 file_data part —— Google 自己去取片，不经过我们也不经过你的浏览器 */
export function youtubePart(canonicalUrl) {
  return { file_data: { file_uri: canonicalUrl } };
}
