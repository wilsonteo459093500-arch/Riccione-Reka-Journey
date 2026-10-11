// 分享海报（1080×1350，小红书 / IG 竖版）—— 客人愿意晒，就是最好的口碑。
// 用 canvas 现画：牌面、配色、轴、潘吉（把页面上的 SVG 序列化进来）、品牌。

import { DREAMER_BY_CODE, AXES } from '../shared/dreamers.js';
import { BRAND, GUIDE } from '../shared/config.js';

const W = 1080;
const H = 1350;

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

function emblemImage(svgEl) {
  return svgToImage(svgEl);
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

const SERIF = '"Cormorant Garamond","Noto Serif SC",Georgia,serif';
const ZH = '"Noto Serif SC","Songti SC",serif';
const SANS = '"Nunito","Noto Sans SC",system-ui,sans-serif';

export async function renderPoster(profile, { pangieEl, emblemEl } = {}) {
  await document.fonts?.ready;
  const d = DREAMER_BY_CODE[profile.code];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // 夜空
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#17201b');
  bg.addColorStop(1, '#2b3a31');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = Math.random() > 0.6 ? `rgba(200,225,195,${Math.random() * 0.6})` : `rgba(240,215,160,${Math.random() * 0.7})`;
    const r = Math.random() * 2.2;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(215,165,74,.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, 560, 470, 0, Math.PI * 2);
  ctx.stroke();

  // 顶部
  ctx.fillStyle = '#E9D3A1';
  ctx.textAlign = 'center';
  ctx.font = `600 30px ${SERIF}`;
  ctx.fillText('THE DREAM HOME JOURNEY', W / 2, 90);
  ctx.font = `500 34px ${ZH}`;
  ctx.fillStyle = '#F5EDE0';
  ctx.fillText(profile.name ? `${profile.name} 的梦想家牌` : '我的梦想家牌', W / 2, 142);

  // 牌
  const cw = 560;
  const ch = 820;
  const cx = (W - cw) / 2;
  const cy = 190;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 20;
  roundRect(ctx, cx, cy, cw, ch, 26);
  ctx.fillStyle = '#FBF6EC';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#C79A4A';
  ctx.lineWidth = 4;
  roundRect(ctx, cx + 18, cy + 18, cw - 36, ch - 36, 16);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx + 30, cy + 30, cw - 60, ch - 60, 10);
  ctx.stroke();

  ctx.fillStyle = '#9A7232';
  ctx.font = `600 44px ${SERIF}`;
  ctx.fillText(d.num, W / 2, cy + 92);

  const em = await emblemImage(emblemEl);
  if (em) ctx.drawImage(em, W / 2 - 80, cy + 120, 160, 160);

  ctx.font = `700 40px ${SANS}`;
  ctx.fillStyle = '#3D5A4A';
  ctx.fillText(profile.code.split('').join('  '), W / 2, cy + 330);

  ctx.fillStyle = '#241C12';
  ctx.font = `600 76px ${ZH}`;
  ctx.fillText(d.zh, W / 2, cy + 430);
  ctx.fillStyle = '#8A6844';
  ctx.font = `italic 500 38px ${SERIF}`;
  ctx.fillText(d.en, W / 2, cy + 482);
  ctx.fillStyle = '#4A3F33';
  ctx.font = `400 32px ${ZH}`;
  ctx.fillText(d.tagline, W / 2, cy + 548);

  // 配色
  const pw = 64;
  const gap = 18;
  const total = d.palette.length * pw + (d.palette.length - 1) * gap;
  d.palette.forEach((col, i) => {
    ctx.beginPath();
    ctx.arc(W / 2 - total / 2 + pw / 2 + i * (pw + gap), cy + 620, pw / 2, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // 轴
  ctx.font = `600 24px ${SANS}`;
  AXES.forEach((ax, i) => {
    const y = cy + 690 + i * 30;
    const v = profile.axes[ax.id];
    const bx = cx + 150;
    const bw = cw - 300;
    ctx.fillStyle = v >= 50 ? '#241C12' : '#B3A78F';
    ctx.textAlign = 'right';
    ctx.fillText(ax.a.zh, bx - 16, y + 8);
    ctx.fillStyle = v < 50 ? '#241C12' : '#B3A78F';
    ctx.textAlign = 'left';
    ctx.fillText(ax.b.zh, bx + bw + 16, y + 8);
    ctx.fillStyle = '#E8DFD0';
    roundRect(ctx, bx, y, bw, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#C79A4A';
    ctx.beginPath();
    ctx.arc(bx + bw * (1 - v / 100), y + 4, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.textAlign = 'center';

  // 潘吉
  const pg = await svgToImage(pangieEl);
  if (pg) ctx.drawImage(pg, W - 330, H - 410, 260, 325);

  ctx.fillStyle = '#F5EDE0';
  ctx.textAlign = 'left';
  ctx.font = `600 46px ${SERIF}`;
  ctx.fillText(BRAND.app, 80, H - 150);
  ctx.font = `500 26px ${SANS}`;
  ctx.fillStyle = '#E9D3A1';
  ctx.fillText(`${BRAND.by} · ${BRAND.house}`, 80, H - 110);
  ctx.fillStyle = 'rgba(245,237,224,.7)';
  ctx.font = `400 24px ${ZH}`;
  ctx.fillText(`和熊猫精灵${GUIDE.name}一起，读懂你心里的家`, 80, H - 70);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}
