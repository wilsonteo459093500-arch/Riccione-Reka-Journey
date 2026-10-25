// 概念图加品牌角标（当前语言）：左下「为谁定制 · 梦想家牌」（多层只看一层时再加「· 二楼」）+ 这一版的主要材质，右下 WISH by RICCIONE REKA。
// 颜色全部来自 palette.js（canvas 读不到 CSS 变量）。

import { DREAMER_BY_CODE } from '../../shared/dreamers.js';
import { BRAND } from '../../shared/config.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { PALETTE } from '../../shared/palette.js';
import { t, L } from '../../shared/i18n.js';

const SERIF = '"Cormorant Garamond","Noto Serif SC",Georgia,serif';
const SANS = '-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Noto Sans SC",system-ui,sans-serif';

/** '#RRGGBB' / 'rgba(r,g,b,a)' → 同色、指定透明度 */
function withAlpha(c, a) {
  const s = String(c).trim();
  if (s[0] === '#') {
    const n = parseInt(s.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return s;
  const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
  return `rgba(${r},${g},${b},${a})`;
}
const alphaOf = (c) => {
  const m = String(c).match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
  return m ? parseFloat(m[1]) : 1;
};

function track(ctx, px) {
  try {
    ctx.letterSpacing = `${px}px`;
  } catch {
    /* 旧浏览器没有 letterSpacing */
  }
}

/** 一行字放不下就缩小字号 */
function fitFont(ctx, text, weight, size, family, maxW, spacing = 0) {
  let fs = size;
  track(ctx, fs * spacing);
  ctx.font = `${weight} ${fs}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxW && w > 0) {
    fs = Math.max(8, Math.floor((fs * maxW) / w));
    track(ctx, fs * spacing);
    ctx.font = `${weight} ${fs}px ${family}`;
  }
  return fs;
}

/** opts.floor：多层方案只看某一层时，那一层的名字（已经是当前语言），写在标题后面 */
export async function stampSnapshot(blob, project, { floor = '' } = {}) {
  const img = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  img.close?.();
  const s = c.width / 1600;
  const pad = 44 * s;
  const H = 240 * s;

  // 底部一层很淡的墨色渐变，字才读得清（不是一条黑带）
  const bg = PALETTE.stampBg;
  const k = alphaOf(bg);
  const grad = ctx.createLinearGradient(0, c.height - H, 0, c.height);
  grad.addColorStop(0, withAlpha(bg, 0));
  grad.addColorStop(0.45, withAlpha(bg, k * 0.55));
  grad.addColorStop(1, withAlpha(bg, Math.min(0.85, k * 1.35)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, c.height - H, c.width, H);
  ctx.textBaseline = 'alphabetic';

  // 右下：品牌（先量好宽度，左边的字不会压上来）
  ctx.textAlign = 'right';
  const brandSub = `${BRAND.by} · ${BRAND.house} · ${t('概念示意')}`;
  fitFont(ctx, brandSub, 500, 15 * s, SANS, c.width * 0.36, 0.08);
  const subW = ctx.measureText(brandSub).width;
  ctx.fillStyle = withAlpha(PALETTE.paper, 0.72);
  ctx.fillText(brandSub, c.width - pad, c.height - pad);
  track(ctx, 30 * s * 0.18);
  ctx.font = `600 ${30 * s}px ${SERIF}`;
  ctx.fillStyle = PALETTE.card;
  ctx.fillText(BRAND.app, c.width - pad, c.height - pad - 30 * s);
  const right = Math.max(subW, ctx.measureText(BRAND.app).width);

  // 左下：为谁定制 · 梦想家牌（当前语言），下面一行是主要材质。
  // 梦想家的罗马数字不放进标题（英文里「Peggy · I The Zen Nester」的 I 读起来像「我」）
  ctx.textAlign = 'left';
  const maxW = c.width - pad * 3 - right;
  const d = project.profile && DREAMER_BY_CODE[project.profile.code];
  const name = String(project.profile?.name ?? '').trim();
  const base = d ? (name ? `${name} · ${L(d)}` : L(d)) : t(project.name || BRAND.full);
  const title = floor ? `${base} · ${floor}` : base;
  // 同一种材质用在两处（例如墙面和柜体都是画廊白）只写一次：按显示名去重（不同 id 也可能同名）
  const matNames = ['floor', 'walls', 'cabinetry', 'upholstery', 'countertop']
    .map((id) => MAT_BY_ID[project.materials?.[id]])
    .filter(Boolean)
    .map((m) => String(L(m) ?? '').trim())
    .filter(Boolean);
  const mats = [...new Set(matNames)].join(' · ');
  // 一根很短的金色细线，像杂志的图注
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(pad, c.height - pad - 92 * s, 36 * s, Math.max(1, 1.5 * s));
  fitFont(ctx, title, 600, 34 * s, SERIF, maxW, 0.02);
  ctx.fillStyle = PALETTE.stampTitle;
  ctx.fillText(title, pad, c.height - pad - 34 * s);
  if (mats) {
    fitFont(ctx, mats, 500, 18 * s, SANS, maxW, 0.02);
    ctx.fillStyle = withAlpha(PALETTE.paper, 0.86);
    ctx.fillText(mats, pad, c.height - pad);
  }
  track(ctx, 0);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
