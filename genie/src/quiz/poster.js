// 分享海报（1080×1350，小红书 / IG 竖版）—— 客人愿意晒，就是最好的口碑。
// VI「晨光溪岸」：上半是风景（和蓝图同一张），纸色底，中间一张印刷感的梦想家卡牌，潘吉在右下角。
// 跟着当前语言出中文或英文。颜色全部来自 palette.js（canvas 读不到 CSS 变量）。

import { DREAMER_BY_CODE, AXES } from '../shared/dreamers.js';
import { BRAND } from '../shared/config.js';
import { PALETTE as P } from '../shared/palette.js';
import { SCENES } from './scenes.js';
import { t, L, isEn, guideName } from '../shared/i18n.js';

const W = 1080;
const H = 1350;

const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Noto Sans SC", Arial, sans-serif';
const SERIF_EN = '"Cormorant Garamond", Georgia, serif';
const SERIF_ZH = '"Noto Serif SC", "Songti SC", serif';
const display = () => (isEn() ? SERIF_EN : SERIF_ZH);

function svgToImage(svgEl) {
  return new Promise((resolve) => {
    if (!svgEl) return resolve(null);
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.removeAttribute('class');
    const s = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });
}

function photoImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 图片铺满一块区域（像 CSS object-fit: cover），fy = 竖直方向的焦点 0–1 */
function cover(ctx, img, dx, dy, dw, dh, fy = 0.5) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(dw / iw, dh / ih);
  const sw = dw / s;
  const sh = dh / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) * fy, sw, sh, dx, dy, dw, dh);
}

/** 字太长就缩小，直到放得下 */
function fitFont(ctx, text, weight, size, family, maxW, min = 18) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

/** 按宽度断行（中文按字，英文按词） */
function wrap(ctx, text, maxW) {
  const words = isEn() ? text.split(/(\s+)/) : [...text];
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur + w;
    if (ctx.measureText(next).width > maxW && cur.trim()) {
      lines.push(cur.trim());
      cur = w.trimStart();
    } else cur = next;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export async function renderPoster(profile, { pangieEl, emblemEl, sceneEl, sceneId } = {}) {
  const d = DREAMER_BY_CODE[profile.code];
  if (!d) return null;
  const name = L({ zh: d.zh, en: d.en });
  const other = isEn() ? d.zh : d.en;
  const title = profile.name ? t('{0} 的梦想家卡牌', [profile.name]) : t('我的梦想家卡牌');
  const tagline = t(d.tagline);
  const scene = SCENES[sceneId] || SCENES.welcome;
  try {
    await Promise.all([
      document.fonts?.load(`600 64px ${SERIF_ZH}`, `${d.zh}${title}${tagline}`),
      document.fonts?.load(`600 64px ${SERIF_EN}`, `${d.en} ${d.num}`),
      document.fonts?.load(`italic 500 32px ${SERIF_EN}`, d.en),
    ]);
    await document.fonts?.ready;
  } catch {
    /* 字体没载到就用系统字 */
  }

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // 纸
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, P.posterBg[0]);
  bg.addColorStop(1, P.posterBg[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 上半：风景（照片优先，没有就用代码画的）
  const bandH = 560;
  const img = (await photoImage(scene.photo)) || (await svgToImage(sceneEl));
  if (img) cover(ctx, img, 0, 0, W, bandH, 0.55);
  const fade = ctx.createLinearGradient(0, bandH * 0.45, 0, bandH);
  fade.addColorStop(0, rgba(P.posterBg[0], 0));
  fade.addColorStop(1, P.posterBg[0]);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, bandH + 2);
  const top = ctx.createLinearGradient(0, 0, 0, 200);
  top.addColorStop(0, rgba(P.paper, 0.75));
  top.addColorStop(1, rgba(P.paper, 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 200);

  // 顶部文字
  ctx.textAlign = 'center';
  ctx.fillStyle = P.posterGold;
  ctx.font = `600 24px ${SANS}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  ctx.fillText(`${BRAND.app} · ${t('许愿之旅').toUpperCase()}`, W / 2, 78);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillStyle = P.posterInk;
  fitFont(ctx, title, 600, 46, display(), W - 160);
  ctx.fillText(title, W / 2, 140);

  // 卡牌
  const cw = 540;
  const ch = 860;
  const cx = (W - cw) / 2;
  const cy = 196;
  ctx.save();
  ctx.shadowColor = rgba(P.shade, 0.22);
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, cx, cy, cw, ch, 28);
  ctx.fillStyle = P.card;
  ctx.fill();
  ctx.restore();
  // 金色细线框（两道）
  ctx.strokeStyle = rgba(P.gold, 0.85);
  ctx.lineWidth = 2;
  roundRect(ctx, cx + 20, cy + 20, cw - 40, ch - 40, 16);
  ctx.stroke();
  ctx.strokeStyle = rgba(P.gold, 0.45);
  ctx.lineWidth = 1;
  roundRect(ctx, cx + 28, cy + 28, cw - 56, ch - 56, 11);
  ctx.stroke();

  // 压印的罗马数字
  ctx.textAlign = 'center';
  ctx.font = `600 52px ${SERIF_EN}`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(d.num, W / 2 + 1, cy + 104 + 1.5);
  ctx.fillStyle = rgba(P.ink, 0.42);
  ctx.fillText(d.num, W / 2, cy + 104);

  // 图腾
  const em = await svgToImage(emblemEl);
  if (em) ctx.drawImage(em, W / 2 - 92, cy + 132, 184, 184);

  // 四个字母
  ctx.font = `600 30px ${SANS}`;
  ctx.fillStyle = P.accent;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '18px';
  ctx.fillText(profile.code, W / 2 + 9, cy + 368);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  // 名字 + 另一种语言 + 一句话
  ctx.fillStyle = P.posterInk;
  fitFont(ctx, name, 600, isEn() ? 64 : 68, display(), cw - 110, 30);
  ctx.fillText(name, W / 2, cy + 452);
  ctx.fillStyle = P.posterGold;
  ctx.font = isEn() ? `500 30px ${SERIF_ZH}` : `italic 500 34px ${SERIF_EN}`;
  ctx.fillText(other, W / 2, cy + 500);
  ctx.fillStyle = P.inkSoft;
  ctx.font = `400 28px ${display()}`;
  const tl = wrap(ctx, tagline, cw - 120).slice(0, 2);
  tl.forEach((ln, i) => ctx.fillText(ln, W / 2, cy + 562 + i * 38));

  // 配色
  const pw = 54;
  const gap = 16;
  const total = d.palette.length * pw + (d.palette.length - 1) * gap;
  const py = cy + 640;
  d.palette.forEach((col, i) => {
    ctx.beginPath();
    ctx.arc(W / 2 - total / 2 + pw / 2 + i * (pw + gap), py, pw / 2, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = rgba(P.ink, 0.1);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // 四条轴（带维度名）
  const bx = cx + 190;
  const bw = cw - 300;
  AXES.forEach((ax, i) => {
    const y = cy + 706 + i * 32;
    const v = profile.axes[ax.id];
    ctx.textAlign = 'left';
    ctx.font = `500 19px ${SANS}`;
    ctx.fillStyle = P.inkSoft;
    ctx.fillText(L({ zh: ax.zh, en: ax.en }), cx + 52, y + 7);
    ctx.font = `600 19px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = v >= 50 ? P.posterInk : rgba(P.ink, 0.45);
    ctx.fillText(L(ax.a), bx - 12, y + 7);
    ctx.textAlign = 'left';
    ctx.fillStyle = v < 50 ? P.posterInk : rgba(P.ink, 0.45);
    ctx.fillText(L(ax.b), bx + bw + 12, y + 7);
    ctx.fillStyle = P.line;
    roundRect(ctx, bx, y, bw, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = P.gold;
    ctx.beginPath();
    ctx.arc(bx + bw * (1 - v / 100), y + 2.5, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  // 潘吉
  const pg = await svgToImage(pangieEl);
  if (pg) ctx.drawImage(pg, W - 300, H - 330, 236, 295);

  // 品牌
  ctx.textAlign = 'left';
  ctx.fillStyle = P.posterInk;
  ctx.font = `600 50px ${SERIF_EN}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
  ctx.fillText(BRAND.app, 76, H - 168);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.font = `500 22px ${SANS}`;
  ctx.fillStyle = P.posterGold;
  ctx.fillText(`${BRAND.by} · ${BRAND.house}`, 78, H - 128);
  ctx.fillStyle = P.inkSoft;
  ctx.font = `400 24px ${display()}`;
  wrap(ctx, t('和熊猫精灵{0}一起，读懂你心里的家', [guideName()]), 640)
    .slice(0, 2)
    .forEach((ln, i) => ctx.fillText(ln, 78, H - 84 + i * 32));
  // 风景的出处
  ctx.font = `500 18px ${SANS}`;
  ctx.fillStyle = rgba(P.ink, 0.62);
  ctx.textAlign = 'left';
  ctx.fillText(`${L(scene.place)} · ${L(scene.area)}${scene.credit ? ` · ${scene.credit}` : ''}`, 40, 36);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}
