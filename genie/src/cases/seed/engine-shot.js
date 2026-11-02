// 种子案例的「整个家（3D）」—— 在 3D 梦想工作室里拍一张鸟瞰（只在开发时用，不进打包）。
//
// 用法（Playwright 开 dev server 的 /studio.html?staff=1，等 window.__genie 出现）：
//   const { shootCase } = await import('/src/cases/seed/engine-shot.js');
//   const files = await shootCase(caseId)   // → { '1600': dataURL, '480': dataURL }（4:3 WebP）
// 户型 = 案例的 template（templatePlan）；材质 = 案例的 13 个表面（有 STUDIO 的 realiseCase 就用它）；
// 家具 = 工作室的自动摆放（furnish，带上案例的家具款式 { style }）；时间 = 案例的 time；镜头 = frame('iso')。
// 只用我们自己的引擎画。

import { templatePlan, buildAllWalls } from '../../studio/plan/model.js';
import { furnish } from '../../studio/engine/furnish.js';
import { caseMaterials, getCase } from '../../shared/cases.js';

// STUDIO 的 realise.js 还没写好也能跑（import.meta.glob：文件不在 = 空对象）
const REALISE = import.meta.glob('../../shared/realise.js');

const frames = (n = 2) => new Promise((res) => {
  const step = () => (n-- <= 0 ? res() : requestAnimationFrame(step));
  requestAnimationFrame(step);
});

/** 给自动摆放用的「客人」：从案例的风格推出来（不是真的客人） */
function profileOf(c) {
  const wishes = c.style?.wishes || [];
  return {
    code: c.style?.dreamers?.[0],
    axes: c.style?.axes,
    hidden: c.style?.hidden,
    wishes,
    life: { who: wishes.includes('kids') ? ['kids'] : wishes.includes('pets') ? ['cat'] : [], cook: wishes.includes('kitchen') ? 'heavy' : '' },
    storage: { books: (c.furniture?.displayPct ?? 15) >= 40 ? 9 : 4 },
  };
}

async function materialsOf(c, profile) {
  const load = REALISE['../../shared/realise.js'];
  if (load) {
    try {
      const R = await load();
      const r = R.realiseCase?.({ caseObj: c, keep: {}, profile });
      if (r?.materials) return r.materials;
    } catch {
      /* 用案例自己的材质 */
    }
  }
  return caseMaterials(c);
}

/** 画布截图 → 4:3 裁切（zoom > 1 = 往里裁一点，cy = 裁切框中心的高度 0–1）→ 1600 + 480 WebP */
async function crops(blob, { zoom = 1, cy = 0.5, sizes = [[1600, 1200, '1600'], [480, 360, '480']], q = 0.8 } = {}) {
  const bmp = await createImageBitmap(blob);
  const out = {};
  const A = 4 / 3;
  let sw = bmp.width;
  let sh = bmp.height;
  if (sw / sh > A) sw = Math.round(sh * A);
  else sh = Math.round(sw / A);
  sw = Math.round(sw / zoom);
  sh = Math.round(sh / zoom);
  const sx = Math.round((bmp.width - sw) / 2);
  const sy = Math.round(Math.min(bmp.height - sh, Math.max(0, bmp.height * cy - sh / 2)));
  for (const [w, h, name] of sizes) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
    out[name] = c.toDataURL('image/webp', q);
  }
  bmp.close?.();
  return out;
}

export async function shootCase(caseOrId, { scale = 2, zoom, cy } = {}) {
  const c = typeof caseOrId === 'string' ? await getCase(caseOrId) : caseOrId;
  if (!c) throw new Error('no case');
  const e = window.__genie;
  if (!e) throw new Error('no engine (open studio.html first)');
  const profile = profileOf(c);
  const plan = templatePlan(c.template || 'condo3');
  const walls = buildAllWalls(plan);
  let furniture;
  try {
    furniture = furnish(plan, walls, profile, { style: c.furniture || {} });
  } catch {
    furniture = furnish(plan, walls, profile);
  }
  const materials = await materialsOf(c, profile);
  e.setScene({ plan, furniture, materials, time: c.time ?? 14, frame: true, floorView: 'all' });
  e.setTime(c.time ?? 14);
  e.frame('iso', false);
  await frames(6);
  // 贴图在空闲时补完整的分辨率：多等几帧
  await new Promise((r) => setTimeout(r, 1500));
  await frames(4);
  const blob = await e.snapshot(scale);
  if (!blob) throw new Error('snapshot failed');
  // 两层的房子在等角视图里比较高、比较小：往里裁一点，重心放低一点（半独立式比排屋宽，裁少一点，屋顶才不会被切掉）
  const two = (plan.floors || []).length > 1;
  const auto = !two ? { zoom: 1.06, cy: 0.52 } : c.template === 'semid2' ? { zoom: 1.12, cy: 0.52 } : { zoom: 1.34, cy: 0.58 };
  return crops(blob, { zoom: zoom ?? auto.zoom, cy: cy ?? auto.cy });
}

if (typeof window !== 'undefined') window.CASE_SHOT = { shootCase };
