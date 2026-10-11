// 概念图加品牌角标：左下「为谁定制 · 梦想家牌」，右下 GENIE by RICCIONE REKA

import { DREAMER_BY_CODE } from '../../shared/dreamers.js';
import { BRAND } from '../../shared/config.js';
import { MAT_BY_ID } from '../../shared/materials.js';

export async function stampSnapshot(blob, project) {
  const img = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const s = c.width / 1600;
  const pad = 40 * s;
  const grad = ctx.createLinearGradient(0, c.height - 220 * s, 0, c.height);
  grad.addColorStop(0, 'rgba(10,8,14,0)');
  grad.addColorStop(1, 'rgba(10,8,14,.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, c.height - 220 * s, c.width, 220 * s);
  ctx.fillStyle = '#F4D58D';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${34 * s}px "Cormorant Garamond","Noto Serif SC",serif`;
  const d = project.profile && DREAMER_BY_CODE[project.profile.code];
  const title = d ? `${project.profile.name ? project.profile.name + ' · ' : ''}${d.num} ${d.zh}` : project.name;
  ctx.fillText(title, pad, c.height - pad - 34 * s);
  ctx.fillStyle = 'rgba(245,237,224,.85)';
  ctx.font = `500 ${19 * s}px "Noto Sans SC",sans-serif`;
  const mats = ['floor', 'walls', 'cabinetry', 'upholstery', 'countertop'].map((k) => MAT_BY_ID[project.materials[k]]?.zh).filter(Boolean).join(' · ');
  ctx.fillText(mats, pad, c.height - pad);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#F5EDE0';
  ctx.font = `600 ${30 * s}px "Cormorant Garamond",serif`;
  ctx.fillText(BRAND.app, c.width - pad, c.height - pad - 30 * s);
  ctx.font = `500 ${16 * s}px "Noto Sans SC",sans-serif`;
  ctx.fillStyle = 'rgba(245,237,224,.75)';
  ctx.fillText(`${BRAND.by} · ${BRAND.house} · 概念示意`, c.width - pad, c.height - pad);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
