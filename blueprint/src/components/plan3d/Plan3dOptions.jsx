import React, { useState } from 'react';
import { Upload, Wand2, Loader2, Palette, X } from 'lucide-react';
import { CORNERS } from '../../plan3d/scene.js';
import { TEXTURE_SLOTS } from '../../plan3d/palette.js';
import { generateSwatch, MAX_SWATCH_REFS } from '../../ai/dollhouse.js';
import { setPlan3dTexture, setPlan3dTexturesOn } from '../../ai/plan3d.js';
import { storeBlob, resolveUrl } from '../../store/assets.js';
import { uploadImage } from '../editor/upload.js';

// 3D 户型图的「视角」和「材质贴图」两组选项（3D 页用）。

const chip = (active) =>
  `px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
    active ? 'bg-bp-dark text-bp-light border-bp-dark' : 'bg-white text-bp-muted border-bp-line hover:border-bp-rule'
  }`;

export const VIEWS = [
  { id: 'top', zh: '正俯视', hint: '垂直往下看，和图纸一一对应。' },
  { id: 'persp', zh: '立体俯视', hint: '镜头在房间正上方，看得到柜子正面和墙的内侧。' },
  { id: 'iso', zh: '斜角立体', hint: '从房间的一个角斜着往下看，最有立体感；墙可以画矮，镜头角可以换。' },
];
const HUNG = [
  { id: 'ghost', zh: '吊柜半透明' },
  { id: 'hide', zh: '不画吊柜' },
];
const WALLS = [
  { id: 400, zh: '矮 0.4m' },
  { id: 650, zh: '中 0.65m' },
  { id: 1100, zh: '高 1.1m' },
];
const CABS = [
  { id: 'cut', zh: '柜子切开', hint: '在 1.1 米处切平，看得到里面，前排不挡后排。' },
  { id: 'full', zh: '柜子全高', hint: '真实高度，吊柜悬在墙上；靠近镜头的高柜会挡住后面。' },
];
const CORNER_ORDER = ['nw', 'ne', 'sw', 'se'];
const SLOT_HINTS = { floor: '浅色橡木', cabinet: '深胡桃木，直纹', worktop: '白色大理石，灰色细纹', fabric: '暖灰色布艺' };
const FROM_ZH = { material: '材料清单', upload: '已上传', ai: 'AI 生成' };

export const viewLabel = (id) => VIEWS.find((v) => v.id === id)?.zh || '';

/** 视角：正俯视 / 立体俯视 / 斜角立体，以及斜角立体的镜头角、墙高、柜子切开还是全高 */
export function ViewOptions({ view, bestCorner, onChange }) {
  const iso = view.view === 'iso';
  const def = VIEWS.find((v) => v.id === view.view) || VIEWS[0];
  return (
    <div className="space-y-2" data-testid="view-options">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="视角">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className={chip(v.id === view.view)} aria-pressed={v.id === view.view} onClick={() => onChange({ view: v.id })}>
            {v.zh}
          </button>
        ))}
      </div>
      {iso && (
        <>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="镜头角">
            <span className="text-[11px] text-bp-faint">镜头在图纸的</span>
            {CORNER_ORDER.map((c) => (
              <button key={c} type="button" className={`${chip(c === view.corner)} !px-2`} aria-pressed={c === view.corner} onClick={() => onChange({ corner: c })}>
                {CORNERS[c].zh}
                {c === bestCorner ? ' · 推荐' : ''}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="墙高">
            <span className="text-[11px] text-bp-faint">墙高</span>
            {WALLS.map((w) => (
              <button key={w.id} type="button" className={`${chip(w.id === view.wallMm)} !px-2`} aria-pressed={w.id === view.wallMm} onClick={() => onChange({ wallMm: w.id })}>
                {w.zh}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="柜子高度">
            {CABS.map((c) => (
              <button key={c.id} type="button" className={chip(c.id === view.cab)} aria-pressed={c.id === view.cab} title={c.hint} onClick={() => onChange({ cab: c.id })}>
                {c.zh}
              </button>
            ))}
          </div>
        </>
      )}
      {!(iso && view.cab === 'full') && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="吊柜画法">
          {HUNG.map((h) => (
            <button key={h.id} type="button" className={chip(h.id === view.hung)} aria-pressed={h.id === view.hung} onClick={() => onChange({ hung: h.id })}>
              {h.zh}
            </button>
          ))}
        </div>
      )}
      <div className="text-[11px] text-bp-faint leading-relaxed">
        {def.hint}
        {iso ? ` ${CABS.find((c) => c.id === view.cab)?.hint || ''}` : ''}
      </div>
    </div>
  );
}

/**
 * 材质贴图：四个槽位，各有三种来源 —— 从材料清单选、上传、AI 生成一小块样本（AI 看不到户型）。
 * props: { project, floorId, plan3d, settings, refSrcs（给 AI 参考材质的效果图）, notify, onChange, onOpenSettings }
 */
export function TexturePanel({ project, floorId, plan3d, settings, refSrcs = [], notify, onChange, onOpenSettings }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [picking, setPicking] = useState(''); // 正在从材料清单里挑的槽位
  const [hints, setHints] = useState({});
  const tex = plan3d?.tex || {};
  const on = tex.on !== false;
  const hasAny = TEXTURE_SLOTS.some((s) => tex[s.id]?.src);
  const hasKey = !!settings?.apiKey;
  const materials = (project.materials || []).filter((m) => m.image);
  const refs = refSrcs.slice(0, MAX_SWATCH_REFS);

  const put = (slot, value) => onChange((p) => setPlan3dTexture(p, floorId, slot, value), { history: false });

  async function onUpload(slot, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      put(slot, { src: await uploadImage(file, { projectId: project.id, maxEdge: 1024 }), from: 'upload' });
    } catch (err) {
      notify?.({ type: 'error', text: err.message || String(err) });
    }
  }

  async function generate(which) {
    if (busy) return;
    if (!hasKey) {
      onOpenSettings?.();
      return;
    }
    const slots = which === 'all' ? TEXTURE_SLOTS.map((s) => s.id) : [which];
    setMsg('');
    try {
      for (const slot of slots) {
        setBusy(slot);
        const blob = await generateSwatch({
          settings,
          slot,
          refSrcs: refs,
          hint: hints[slot] || '',
          onWait: (sec, n) => setMsg(`被限流了，${sec} 秒后自动重试（第 ${n} 次）`),
        });
        put(slot, { src: await storeBlob(blob, { projectId: project.id }), from: 'ai' });
      }
    } catch (err) {
      notify?.({ type: 'error', text: `材质没生成出来：${err.message || err}` });
    } finally {
      setBusy('');
      setMsg('');
    }
  }

  return (
    <div className="space-y-2" data-testid="texture-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-bp-faint leading-relaxed">只换表面的材质，位置和形状不变。</span>
        {hasAny && (
          <span className="flex gap-1" role="group" aria-label="用贴图还是默认画法">
            <button type="button" className={`${chip(on)} !px-2 !py-1`} aria-pressed={on} onClick={() => onChange((p) => setPlan3dTexturesOn(p, floorId, true), { history: false })}>
              用贴图
            </button>
            <button type="button" className={`${chip(!on)} !px-2 !py-1`} aria-pressed={!on} onClick={() => onChange((p) => setPlan3dTexturesOn(p, floorId, false), { history: false })}>
              默认画法
            </button>
          </span>
        )}
      </div>

      <div className="divide-y divide-bp-line">
        {TEXTURE_SLOTS.map((slot) => {
          const t = tex[slot.id];
          const working = busy === slot.id;
          const mat = t?.materialId ? (project.materials || []).find((m) => m.id === t.materialId) : null;
          return (
            <div key={slot.id} className="py-2 space-y-1.5" data-testid={`slot-${slot.id}`}>
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-bp-line bg-bp-tint flex items-center justify-center">
                  {working ? <Loader2 size={14} className="animate-spin text-bp-muted" /> : t?.src ? <img src={resolveUrl(t.src)} alt={`${slot.zh}贴图`} className="w-full h-full object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1 text-xs text-bp-ink">
                  {slot.zh}
                  <span className="block text-[10px] text-bp-faint truncate">{t?.src ? `${FROM_ZH[t.from] || '贴图'}${mat ? ` · ${mat.name || mat.code || ''}` : ''}` : '默认画法'}</span>
                </span>
                {t?.src && (
                  <button type="button" className="p-1 text-bp-faint hover:text-bp-danger" onClick={() => put(slot.id, null)} aria-label={`清除${slot.zh}贴图`}>
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className={`${chip(picking === slot.id)} !px-2 !py-1`} disabled={!materials.length} onClick={() => setPicking(picking === slot.id ? '' : slot.id)} title={materials.length ? '用材料清单里的材质图' : '材料清单里还没有带图的材料'}>
                  <Palette size={11} className="inline -mt-0.5 mr-1" />
                  材料清单
                </button>
                <label className={`${chip(false)} !px-2 !py-1 cursor-pointer`}>
                  <Upload size={11} className="inline -mt-0.5 mr-1" />
                  上传
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(slot.id, e)} aria-label={`上传${slot.zh}图片`} />
                </label>
                <button type="button" className={`${chip(false)} !px-2 !py-1`} disabled={!!busy} onClick={() => generate(slot.id)} title="用你的 Gemini key 出 1 张材质小图">
                  <Wand2 size={11} className="inline -mt-0.5 mr-1" />
                  AI 生成
                </button>
                <input
                  className="min-w-0 flex-1 basis-24 rounded-lg border border-bp-line bg-white px-2 py-1 text-[11px] text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold"
                  value={hints[slot.id] || ''}
                  onChange={(e) => setHints((h) => ({ ...h, [slot.id]: e.target.value }))}
                  placeholder={`给 AI 的说明，如 ${SLOT_HINTS[slot.id]}`}
                  aria-label={`${slot.zh}的补充说明`}
                />
              </div>
              {picking === slot.id && (
                <div className="flex flex-wrap gap-1.5 pt-0.5" data-testid="material-choices">
                  {materials.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-12 text-center"
                      title={m.name || m.code || ''}
                      onClick={() => {
                        put(slot.id, { src: m.image, from: 'material', materialId: m.id });
                        setPicking('');
                      }}
                    >
                      <img src={resolveUrl(m.image)} alt={m.name || m.code || '材料'} className="w-12 h-12 rounded-lg object-cover border border-bp-line hover:border-bp-gold" />
                      <span className="block text-[9px] text-bp-faint truncate">{m.code || m.name || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(false)} disabled={!!busy} onClick={() => generate('all')}>
          {busy ? <Loader2 size={12} className="inline -mt-0.5 mr-1 animate-spin" /> : <Wand2 size={12} className="inline -mt-0.5 mr-1" />}
          {busy ? `正在生成${TEXTURE_SLOTS.find((s) => s.id === busy)?.zh || ''}…` : `四个都用 AI 生成（${TEXTURE_SLOTS.length} 次出图）`}
        </button>
        {busy && <span className="text-[11px] text-bp-faint">{msg || '每张通常要 10–40 秒'}</span>}
      </div>
      <div className="text-[11px] text-bp-faint leading-relaxed">
        AI 只出一小块材质样本，看不到户型{refs.length ? `；会参考这一层的前 ${refs.length} 张效果图取色` : ''}。贴图会镜像着平铺，木纹沿柜子的长边走；光影仍是程序画的。
        {!hasKey && ' 还没有 Gemini key：AI 生成用不了，材料清单和上传可以用。'}
      </div>
    </div>
  );
}
