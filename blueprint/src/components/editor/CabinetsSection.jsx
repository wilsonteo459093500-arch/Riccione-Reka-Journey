import React, { useEffect, useRef, useState } from 'react';
import { Boxes, Upload, Sparkles, Plus, X, ArrowUp, ArrowDown, Maximize2, Loader2, Trash2 } from 'lucide-react';
import { Section, Toggle, btnGhost, btnIcon } from './ui.jsx';
import { updateSlide, NOW } from './ops.js';
import { uploadImage } from './upload.js';
import { metaOf, resolveUrl } from '../../store/assets.js';
import { cropPixels } from '../../showroom/sketchCache.js';
import {
  cabinetsOf, patchCabinets, playableCabinets, compareShell, rectQuad, newBoxId, MAX_BOXES,
} from '../../showroom/cabinets.js';
import { detectCabinetBoxes } from '../../ai/cabinets.js';

// 效果图页 ·「毛坯 → 柜子一件件出现」（展厅播放）。设计师勾了才播。
//   A 毛坯图（优先）：SketchUp 同一个场景、同一个机位关掉柜子再出一张 → 程序比对两张图找出柜子（零 AI 费用）
//   B 框柜子（没有毛坯图时）：在效果图上框出柜子，可以让 AI 先框一遍（只给框），设计师核对过打勾才播
// 图（毛坯图）一律是设计师给的真图；AI 不画任何东西。

const COLORS = ['#E07A5F', '#3D85C6', '#81B29A', '#F2CC8F', '#9B5DE5', '#00B4D8', '#F15BB5', '#8D6E63'];
const PREVIEW_W = 480;
const ZERO_CROP = { l: 0, t: 0, r: 0, b: 0 };

const ratioOf = (src) => {
  const m = metaOf(src);
  return m?.w && m?.h ? m.w / m.h : 0;
};

/** 在小尺寸上比对一次（编辑器预览 / 上传时检查） */
async function previewCompare(render, shell) {
  const r = ratioOf(render) || 16 / 9;
  const W = PREVIEW_W;
  const H = Math.max(16, Math.round(W / r));
  const a = await cropPixels(resolveUrl(render), ZERO_CROP, W, H);
  const b = await cropPixels(resolveUrl(shell), ZERO_CROP, W, H);
  return { W, H, a, res: compareShell(a, b, W, H) };
}

/** A：效果图上把认出来的每组柜子染色、标号 */
function ShellPreview({ render, shell }) {
  const ref = useRef(null);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let alive = true;
    setInfo(null);
    previewCompare(render, shell)
      .then(({ W, H, a, res }) => {
        if (!alive) return;
        setInfo(res);
        const c = ref.current;
        if (!c || !res.ok) return;
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        const img = g.createImageData(W, H);
        const rgb = COLORS.map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
        for (let i = 0; i < W * H; i++) {
          const k = res.labels[i];
          const p = i * 4;
          for (let ch = 0; ch < 3; ch++) img.data[p + ch] = k >= 0 ? a[p + ch] * 0.45 + rgb[k % 8][ch] * 0.55 : a[p + ch] * 0.6 + 255 * 0.4;
          img.data[p + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        g.font = `bold ${Math.round(W / 22)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        res.pieces.forEach((pc, k) => {
          const x = (pc.x0 + pc.x1) / 2;
          const y = (pc.y0 + pc.y1) / 2;
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.beginPath();
          g.arc(x, y, W / 30, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.fillText(String(k + 1), x, y + 1);
        });
      })
      .catch(() => alive && setInfo({ ok: false, why: '图读不出来（素材还没加载？）' }));
    return () => {
      alive = false;
    };
  }, [render, shell]);
  return (
    <div>
      <canvas ref={ref} className={`w-full rounded-lg border border-bp-line ${info?.ok ? '' : 'hidden'}`} />
      {!info && (
        <div className="text-[11px] text-bp-faint flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> 比对中…
        </div>
      )}
      {info?.ok && <div className="text-[11px] text-bp-muted mt-1">认出 {info.pieces.length} 组，按编号先后出现（大的从左到右，最后一组是其余小件）。</div>}
      {info && !info.ok && <div className="text-[11px] text-amber-700 mt-1">这张毛坯图用不了：{info.why}</div>}
    </div>
  );
}

/** B：在效果图上框柜子 —— 四个角可以拖（拖成透视的样子），拖框里面 = 整个移动 */
function BoxEditor({ src, boxes, selected, onSelect, onCommit, width, big }) {
  const r = ratioOf(src) || 16 / 9;
  const W = width;
  const H = Math.round(W / r);
  const [live, setLive] = useState(boxes);
  const drag = useRef(null);
  const svg = useRef(null);
  useEffect(() => setLive(boxes), [boxes]);
  const at = (e) => {
    const b = svg.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, (e.clientY - b.top) / b.height))];
  };
  const down = (e, i, corner) => {
    e.stopPropagation();
    onSelect(i);
    svg.current.setPointerCapture?.(e.pointerId);
    drag.current = { i, corner, start: at(e), q0: live[i].q.slice() };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = at(e);
    const q = d.q0.slice();
    if (d.corner >= 0) {
      q[d.corner * 2] = x;
      q[d.corner * 2 + 1] = y;
    } else {
      const dx = x - d.start[0];
      const dy = y - d.start[1];
      for (let k = 0; k < 4; k++) {
        q[k * 2] = Math.min(1, Math.max(0, d.q0[k * 2] + dx));
        q[k * 2 + 1] = Math.min(1, Math.max(0, d.q0[k * 2 + 1] + dy));
      }
    }
    setLive(live.map((b, k) => (k === d.i ? { ...b, q, by: 'hand' } : b)));
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    onCommit(live);
  };
  const hr = big ? 9 : 6;
  return (
    <div className="relative select-none" style={{ width: W, height: H }}>
      <img src={resolveUrl(src) || ''} alt="" draggable={false} className="absolute inset-0 w-full h-full rounded-lg" />
      <svg
        ref={svg}
        className="absolute inset-0"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ touchAction: 'none' }}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerDown={() => onSelect(-1)}
      >
        {live.map((b, i) => {
          const pts = [0, 1, 2, 3].map((k) => [b.q[k * 2] * W, b.q[k * 2 + 1] * H]);
          const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
          const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
          const col = COLORS[i % 8];
          const on = i === selected;
          return (
            <g key={b.id}>
              <polygon
                points={pts.map((p) => p.join(',')).join(' ')}
                fill={col}
                fillOpacity={on ? 0.32 : 0.2}
                stroke={col}
                strokeWidth={on ? 2.5 : 1.5}
                style={{ cursor: 'move' }}
                onPointerDown={(e) => down(e, i, -1)}
              />
              <circle cx={cx} cy={cy} r={hr + 3} fill="rgba(0,0,0,0.55)" pointerEvents="none" />
              <text x={cx} y={cy + 1} fill="#fff" fontSize={hr + 4} fontWeight="700" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                {i + 1}
              </text>
              {on &&
                pts.map((p, k) => (
                  <circle key={k} cx={p[0]} cy={p[1]} r={hr} fill="#fff" stroke={col} strokeWidth={2.5} style={{ cursor: 'crosshair' }} onPointerDown={(e) => down(e, i, k)} />
                ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function CabinetsSection({ project, slide, change, notify, settings, onOpenSettings }) {
  const c = cabinetsOf(slide);
  const stale = !!slide.cabinets && !c;
  const on = !!c?.on;
  const play = playableCabinets(slide);
  const boxes = c?.boxes || [];
  const [selected, setSelected] = useState(-1);
  const [big, setBig] = useState(false);
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);
  const patch = (p) => change((pr) => updateSlide(pr, slide.id, (s) => patchCabinets(s, p)), NOW);
  const setBoxes = (list) => patch({ boxes: list.slice(0, MAX_BOXES) });

  const onShell = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('shell');
    try {
      const src = await uploadImage(file, { projectId: project.id });
      const ra = ratioOf(slide.image);
      const rb = ratioOf(src);
      if (ra && rb && Math.abs(ra - rb) / ra > 0.015) {
        throw new Error(`毛坯图的长宽比例（${rb.toFixed(2)}）和效果图（${ra.toFixed(2)}）不一样：要用同一个场景、同样的出图尺寸再出一张`);
      }
      const { res } = await previewCompare(slide.image, src);
      if (!res.ok) throw new Error(res.why);
      patch({ shell: src });
      notify?.({ type: 'success', text: `毛坯图对上了：认出 ${res.pieces.length} 组柜子` });
    } catch (err) {
      notify?.({ type: 'error', text: err.message || '毛坯图上传失败' });
    } finally {
      setBusy('');
    }
  };

  const aiFrame = async () => {
    if (!settings?.apiKey) {
      notify?.({ type: 'info', text: 'AI 先框要用你的 Gemini key（看一次图，每张不到 RM0.01）。也可以不用 AI，自己点「加一个框」。' });
      onOpenSettings?.();
      return;
    }
    setBusy('ai');
    try {
      const res = await detectCabinetBoxes({ settings, src: slide.image });
      if (!res.boxes.length) throw new Error('AI 没框出柜子，请自己框');
      patch({ boxes: res.boxes, checked: false, detect: { at: Date.now(), notes: res.notes } });
      setSelected(-1);
      notify?.({ type: 'success', text: `AI 框了 ${res.boxes.length} 个，请逐个核对、拖准四个角，再打勾` });
    } catch (err) {
      notify?.({ type: 'error', text: err.message || 'AI 先框失败' });
    } finally {
      setBusy('');
    }
  };

  const addBox = () => {
    if (boxes.length >= MAX_BOXES) return;
    const k = boxes.length % 4;
    const x = 0.3 + k * 0.05;
    setBoxes([...boxes, { id: newBoxId(), q: rectQuad(x, 0.3, x + 0.3, 0.75), by: 'hand' }]);
    setSelected(boxes.length);
  };
  const moveBox = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= boxes.length) return;
    const l = boxes.slice();
    [l[i], l[j]] = [l[j], l[i]];
    setBoxes(l);
    setSelected(j);
  };
  const removeBox = (i) => {
    setBoxes(boxes.filter((_, k) => k !== i));
    setSelected(-1);
  };

  const tools = (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={btnGhost} onClick={aiFrame} disabled={!!busy} title="Gemini 看一次图，只给框（不画图），每张不到 RM0.01">
        {busy === 'ai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        AI 先框
      </button>
      <button type="button" className={btnGhost} onClick={addBox} disabled={boxes.length >= MAX_BOXES}>
        <Plus className="w-3.5 h-3.5" />
        加一个框
      </button>
      {selected >= 0 && selected < boxes.length && (
        <button type="button" className={`${btnGhost} hover:!text-bp-danger`} onClick={() => removeBox(selected)}>
          <Trash2 className="w-3.5 h-3.5" />
          删掉 {selected + 1}
        </button>
      )}
    </div>
  );

  return (
    <Section title="柜子一件件出现 · 展厅播放" icon={Boxes}>
      <Toggle
        checked={on}
        onChange={(v) => patch({ on: v })}
        label="展厅播放这张：毛坯 → 柜子一组组长出来"
      />
      <p className="text-[11px] leading-relaxed text-bp-faint mt-1.5">
        只挑重点柜子的那几张（厨房、衣柜、电视墙）。这一段比一般换页慢，大约多 4–6 秒；白天 / 夜晚一对只播白天那张。
      </p>
      {stale && <div className="text-[11px] text-amber-700 mt-1.5">效果图换过了：之前的毛坯图 / 框是给旧图做的，已经不用。</div>}

      {on && (
        <div className="mt-2 space-y-3">
          <div className={`text-[11px] rounded-lg px-2 py-1.5 ${play.mode ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {play.mode === 'shell' ? '会播：用毛坯图（柜子后面的墙是真的）' : play.mode === 'boxes' ? '会播：用框（框里先是线稿，再一件件上色）' : `暂不播放：${play.why}`}
          </div>

          <div>
            <div className="text-xs text-bp-ink mb-1">A · 毛坯图（最准，优先用）</div>
            <p className="text-[11px] leading-relaxed text-bp-faint mb-1.5">
              SketchUp：用同一个场景（同一个机位），把柜子的标记（Tag）关掉，用一样的尺寸、灯光再出一张，上传到这里。程序比对两张图，不一样的地方就是柜子，不用 AI。
            </p>
            {c?.shell ? (
              <div className="space-y-1.5">
                <ShellPreview render={slide.image} shell={c.shell} />
                <div className="flex gap-1.5">
                  <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()} disabled={!!busy}>
                    <Upload className="w-3.5 h-3.5" /> 换一张
                  </button>
                  <button type="button" className={`${btnGhost} hover:!text-bp-danger`} onClick={() => patch({ shell: null })}>
                    <X className="w-3.5 h-3.5" /> 不用毛坯图
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()} disabled={!!busy}>
                {busy === 'shell' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                上传毛坯图
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onShell} />
          </div>

          {!c?.shell && (
            <div>
              <div className="text-xs text-bp-ink mb-1">B · 框柜子（没有毛坯图时）</div>
              <p className="text-[11px] leading-relaxed text-bp-faint mb-1.5">
                一个框 = 一组，按编号先后出现。点框选中，拖四个白点贴准柜子的边（可以拖成透视的样子）。
              </p>
              {tools}
              <div className="mt-1.5 relative">
                <BoxEditor src={slide.image} boxes={boxes} selected={selected} onSelect={setSelected} onCommit={setBoxes} width={280} />
                <button
                  type="button"
                  className={`${btnIcon} absolute right-1 top-1 bg-white/85`}
                  onClick={() => setBig(true)}
                  title="放大来框"
                  aria-label="放大来框"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {boxes.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {boxes.map((b, i) => (
                    <div
                      key={b.id}
                      className={`flex items-center gap-1.5 text-[11px] rounded-md px-1.5 py-0.5 cursor-pointer ${i === selected ? 'bg-bp-tint' : ''}`}
                      onClick={() => setSelected(i)}
                    >
                      <span className="w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center shrink-0" style={{ background: COLORS[i % 8] }}>
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate text-bp-muted">{b.label || '柜子'}{b.by === 'ai' ? '（AI 框的）' : ''}</span>
                      <button type="button" className={btnIcon} disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveBox(i, -1); }} title="早一点出现">
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button type="button" className={btnIcon} disabled={i === boxes.length - 1} onClick={(e) => { e.stopPropagation(); moveBox(i, 1); }} title="晚一点出现">
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button type="button" className={`${btnIcon} hover:!text-bp-danger`} onClick={(e) => { e.stopPropagation(); removeBox(i); }} title="删掉这个框">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {boxes.length > 0 && (
                <label className="mt-2 flex items-start gap-2 text-[11px] text-bp-ink cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={!!c?.checked} onChange={(e) => patch({ checked: e.target.checked })} />
                  <span>我核对过：每个框都贴准了柜子（AI 框的一定要看过；打勾才播）</span>
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {big && on && !c?.shell && (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-6" onClick={() => setBig(false)}>
          <div className="bg-bp-paper rounded-2xl p-4 space-y-3 max-w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              {tools}
              <button type="button" className={btnGhost} onClick={() => setBig(false)}>
                完成
              </button>
            </div>
            <BoxEditor
              src={slide.image}
              boxes={boxes}
              selected={selected}
              onSelect={setSelected}
              onCommit={setBoxes}
              width={Math.min(1100, window.innerWidth - 96, Math.round((window.innerHeight - 180) * (ratioOf(slide.image) || 16 / 9)))}
              big
            />
          </div>
        </div>
      )}
    </Section>
  );
}
