import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Upload, Wand2, Loader2, X } from 'lucide-react';
import { buildScene, recommendCorner, CORNERS } from './scene.js';
import { paintScene } from './paint.js';
import { paletteOf, TEXTURE_SLOTS } from './palette.js';
import { pickAspect, generateSwatch, MAX_SWATCH_REFS } from '../ai/dollhouse.js';
import { loadSettings } from '../ai/settings.js';
import STUDY from './sample-study-room.json';

// 试验页（#/lab/plan3d）：把 STUDY ROOM 的坐标样本用程序画成 3D 户型图，给设计师看画风和位置；
// 另有「材质贴图」测试：AI 只出一小块材质样本（或直接上传材质照片），程序把它贴到画好的柜子、台面、地板上。
// AI 接触不到户型，所以加不了东西也挪不了位。坐标是手工录入的样本；正式功能里由设计师在图纸上核对后得到。

const chip = (active) =>
  `px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
    active ? 'bg-bp-dark text-bp-light border-bp-dark' : 'bg-white text-bp-muted border-bp-line hover:border-bp-rule'
  }`;

const VIEWS = [
  { id: 'top', zh: '正俯视', hint: '垂直往下看，和图纸一一对应。' },
  { id: 'persp', zh: '立体俯视', hint: '镜头在房间正上方，看得到柜子正面和墙的内侧；地面上的位置仍和图纸重合。' },
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
const SLOT_HINTS = {
  floor: '例如：浅色橡木',
  cabinet: '例如：深胡桃木，直纹',
  worktop: '例如：白色大理石，灰色细纹',
  fabric: '例如：暖灰色布艺',
};

const createCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

const ratioOf = (aspect) => {
  const [w, h] = aspect.split(':').map(Number);
  return w / h;
};

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** 图片文件 / Blob → 已经解码好的 <img>（画到 canvas 上要等它加载完） */
async function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('这张图片读不出来，换成 JPG / PNG 再试');
  }
  return { img, url };
}

export default function Plan3dLab() {
  const bestCorner = useMemo(() => recommendCorner(STUDY), []);
  const [view, setView] = useState('top');
  const [hung, setHung] = useState('ghost');
  const [corner, setCorner] = useState(bestCorner);
  const [wallMm, setWallMm] = useState(650);
  const [cab, setCab] = useState('cut');
  const [planUrl, setPlanUrl] = useState(null);
  const [overlay, setOverlay] = useState(0.5);
  const canvasRef = useRef(null);

  const iso = view === 'iso';
  const opts = useMemo(
    () =>
      iso
        ? { view, corner, wallMm, cutMm: cab === 'full' ? Infinity : undefined, hung: cab === 'full' ? 'solid' : hung }
        : { view, hung },
    [iso, view, corner, wallMm, cab, hung]
  );
  // 按出图模型支持的比例出图（和提案页、以后的出图比例一致）
  const scene = useMemo(() => {
    const natural = buildScene(STUDY, opts);
    return buildScene(STUDY, { ...opts, ratio: ratioOf(pickAspect(natural.w, natural.h)) });
  }, [opts]);

  // ---------------- 材质贴图（测试） ----------------
  const [textures, setTextures] = useState({}); // 槽位 → { img, url, ai }
  const [useTex, setUseTex] = useState(true);
  const [refs, setRefs] = useState([]); // [{ file, url }]
  const [hints, setHints] = useState({});
  const [busy, setBusy] = useState(''); // 正在生成的槽位（'all' = 四个一起）
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [runs, setRuns] = useState(0);
  const hasKey = !!loadSettings().apiKey;
  const texCount = Object.keys(textures).length;

  const env = useMemo(() => {
    const imgs = {};
    if (useTex) Object.keys(textures).forEach((slot) => (imgs[slot] = textures[slot].img));
    return { createCanvas, textures: imgs };
  }, [textures, useTex]);

  useEffect(() => {
    if (canvasRef.current) paintScene(canvasRef.current, scene, paletteOf('warm'), env);
  }, [scene, env]);

  useEffect(() => () => planUrl && URL.revokeObjectURL(planUrl), [planUrl]);

  function putTexture(slot, loaded, ai) {
    setTextures((cur) => {
      if (cur[slot]) URL.revokeObjectURL(cur[slot].url);
      return { ...cur, [slot]: { ...loaded, ai } };
    });
    setUseTex(true);
  }

  function clearTexture(slot) {
    setTextures((cur) => {
      if (!cur[slot]) return cur;
      URL.revokeObjectURL(cur[slot].url);
      const next = { ...cur };
      delete next[slot];
      return next;
    });
  }

  async function onUploadTexture(slot, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      putTexture(slot, await loadImage(file), false);
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  function onPickRefs(e) {
    const files = [...(e.target.files || [])].filter((f) => /^image\//.test(f.type));
    e.target.value = '';
    if (!files.length) return;
    setRefs((cur) => [...cur, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_SWATCH_REFS));
  }

  async function generateOne(slot) {
    setRuns((n) => n + 1);
    const blob = await generateSwatch({
      settings: loadSettings(),
      slot,
      refSrcs: refs.map((r) => r.file),
      hint: hints[slot] || '',
      onWait: (sec, n) => setMsg(`被限流了，${sec} 秒后自动重试（第 ${n} 次）`),
    });
    putTexture(slot, await loadImage(blob), true);
  }

  async function generate(which) {
    if (busy) return;
    setError('');
    setMsg('');
    const slots = which === 'all' ? TEXTURE_SLOTS.map((s) => s.id) : [which];
    try {
      for (const slot of slots) {
        setBusy(slot);
        await generateOne(slot);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
      setMsg('');
    }
  }

  function onPickPlan(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setPlanUrl(URL.createObjectURL(file));
  }

  const fileStem = `study-room-${view}${iso ? `-${corner}-${cab}` : hung === 'hide' ? '-no-hung' : ''}${useTex && texCount ? '-tex' : ''}`;

  function download() {
    canvasRef.current?.toBlob((blob) => blob && saveBlob(blob, `${fileStem}.jpg`), 'image/jpeg', 0.92);
  }

  // 原图在画布上的位置（百分比），叠图时把图纸摆回去
  const plan = scene.plan;
  const planStyle = plan && {
    left: `${(plan[0] / scene.w) * 100}%`,
    top: `${(plan[1] / scene.h) * 100}%`,
    width: `${((plan[2] - plan[0]) / scene.w) * 100}%`,
    height: `${((plan[3] - plan[1]) / scene.h) * 100}%`,
    opacity: overlay,
  };
  const viewDef = VIEWS.find((v) => v.id === view);
  const card = 'rounded-2xl border border-bp-line bg-bp-card p-4 space-y-2';
  const input =
    'min-w-0 flex-1 rounded-lg border border-bp-line bg-white px-2.5 py-1.5 text-xs text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold';

  return (
    <div className="min-h-[100dvh] bg-bp-paper text-bp-ink">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <a href="#/" className="inline-flex items-center gap-1 text-xs text-bp-muted hover:text-bp-ink">
            <ArrowLeft size={13} /> 回到 UKIR STUDIO
          </a>
          <div className="mt-3 text-[11px] tracking-[0.3em] text-bp-eyebrow">PLAN 3D · LAB</div>
          <h1 className="font-serif text-2xl mt-1">3D 户型图样图 · STUDY ROOM</h1>
          <p className="mt-1.5 text-xs text-bp-muted leading-relaxed max-w-3xl">
            这张图不是 AI 画的：程序按图纸上量出来的坐标逐个画出墙、门窗、柜子和桌椅，所以位置不会跑。柜子高度是按种类的默认值；材质可以用默认配色，也可以在下面换成贴图。
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="视角">
              {VIEWS.map((v) => (
                <button key={v.id} type="button" className={chip(v.id === view)} aria-pressed={v.id === view} onClick={() => setView(v.id)}>
                  {v.zh}
                </button>
              ))}
            </div>
            {!(iso && cab === 'full') && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="吊柜画法">
                {HUNG.map((h) => (
                  <button key={h.id} type="button" className={chip(h.id === hung)} aria-pressed={h.id === hung} onClick={() => setHung(h.id)}>
                    {h.zh}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className={chip(false)} onClick={download}>
              <Download size={12} className="inline -mt-0.5 mr-1" />
              下载这张图
            </button>
          </div>
          {iso && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="镜头角">
                <span className="text-[11px] text-bp-faint">镜头在图纸的</span>
                {CORNER_ORDER.map((c) => (
                  <button key={c} type="button" className={chip(c === corner)} aria-pressed={c === corner} onClick={() => setCorner(c)}>
                    {CORNERS[c].zh}
                    {c === bestCorner ? ' · 推荐' : ''}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="墙高">
                <span className="text-[11px] text-bp-faint">墙高</span>
                {WALLS.map((w) => (
                  <button key={w.id} type="button" className={chip(w.id === wallMm)} aria-pressed={w.id === wallMm} onClick={() => setWallMm(w.id)}>
                    {w.zh}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="柜子高度">
                {CABS.map((c) => (
                  <button key={c.id} type="button" className={chip(c.id === cab)} aria-pressed={c.id === cab} title={c.hint} onClick={() => setCab(c.id)}>
                    {c.zh}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="text-[11px] text-bp-faint">
            {viewDef.hint}
            {iso ? ` ${CABS.find((c) => c.id === cab).hint}` : ''}
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-bp-line bg-white">
          <canvas ref={canvasRef} className="block w-full h-auto" aria-label="3D 户型图样图" />
          {planUrl && planStyle && <img src={planUrl} alt="" className="absolute max-w-none pointer-events-none mix-blend-multiply" style={planStyle} />}
        </div>

        {/* 材质贴图（测试） */}
        <div className={card} data-testid="texture-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-bp-faint">材质贴图（测试）：只换表面的材质，位置和形状不变</div>
            {texCount > 0 && (
              <div className="flex items-center gap-1.5" role="group" aria-label="用贴图还是默认画法">
                <button type="button" className={chip(useTex)} aria-pressed={useTex} onClick={() => setUseTex(true)}>
                  用贴图
                </button>
                <button type="button" className={chip(!useTex)} aria-pressed={!useTex} onClick={() => setUseTex(false)}>
                  用默认画法
                </button>
              </div>
            )}
          </div>
          <div className="text-[11px] text-bp-faint leading-relaxed">
            AI 只出一小块材质样本，看不到户型，所以不会多出柜子或挪位。每个「AI 生成」= 用你的 Gemini key 出 1 张小图；也可以直接上传自己的材质照片，不花钱。
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {refs.map((r, i) => (
              <span key={r.url} className="relative inline-block w-14 h-14 rounded-lg overflow-hidden border border-bp-line">
                <img src={r.url} alt={`效果图参考 ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  className="absolute top-0 right-0 p-0.5 bg-white/85 text-bp-muted hover:text-bp-danger"
                  onClick={() => setRefs((cur) => cur.filter((_, k) => k !== i))}
                  aria-label={`移除效果图参考 ${i + 1}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {refs.length < MAX_SWATCH_REFS && (
              <label className={`${chip(false)} cursor-pointer`}>
                <Upload size={12} className="inline -mt-0.5 mr-1" />
                加效果图给 AI 参考材质（可选，最多 {MAX_SWATCH_REFS} 张）
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPickRefs} />
              </label>
            )}
          </div>

          <div className="divide-y divide-bp-line">
            {TEXTURE_SLOTS.map((slot) => {
              const t = textures[slot.id];
              const working = busy === slot.id;
              return (
                <div key={slot.id} className="flex flex-wrap items-center gap-2 py-2" data-testid={`slot-${slot.id}`}>
                  <span className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-bp-line bg-bp-tint flex items-center justify-center">
                    {working ? <Loader2 size={15} className="animate-spin text-bp-muted" /> : t ? <img src={t.url} alt={`${slot.zh}贴图`} className="w-full h-full object-cover" /> : null}
                  </span>
                  <span className="w-20 shrink-0 text-xs text-bp-ink">
                    {slot.zh}
                    <span className="block text-[10px] text-bp-faint">{t ? (t.ai ? 'AI 生成' : '已上传') : '默认画法'}</span>
                  </span>
                  <input
                    className={input}
                    value={hints[slot.id] || ''}
                    onChange={(e) => setHints((h) => ({ ...h, [slot.id]: e.target.value }))}
                    placeholder={`给 AI 的补充说明（可选）${SLOT_HINTS[slot.id]}`}
                    aria-label={`${slot.zh}的补充说明`}
                  />
                  <button type="button" className={chip(false)} disabled={!!busy || !hasKey} onClick={() => generate(slot.id)}>
                    <Wand2 size={12} className="inline -mt-0.5 mr-1" />
                    AI 生成
                  </button>
                  <label className={`${chip(false)} cursor-pointer`}>
                    <Upload size={12} className="inline -mt-0.5 mr-1" />
                    上传图片
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onUploadTexture(slot.id, e)} aria-label={`上传${slot.zh}图片`} />
                  </label>
                  {t && (
                    <button type="button" className={chip(false)} onClick={() => clearTexture(slot.id)} aria-label={`清除${slot.zh}贴图`}>
                      清除
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bp-dark text-bp-light text-sm font-medium hover:opacity-90 disabled:opacity-50"
              disabled={!!busy || !hasKey}
              onClick={() => generate('all')}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {busy ? `正在生成${TEXTURE_SLOTS.find((s) => s.id === busy)?.zh || ''}…` : `四个都用 AI 生成（${TEXTURE_SLOTS.length} 次出图）`}
            </button>
            <span className="text-[11px] text-bp-faint">本次已出图 {runs} 次</span>
          </div>
          {!hasKey && <div className="text-[11px] text-bp-danger">还没有 Gemini key：AI 生成用不了，可以先上传图片试；要用 AI 请回到 UKIR STUDIO 在右上角设置里填好再回来。</div>}
          {busy && <div className="text-[11px] text-bp-faint">{msg || '每张通常要 10–40 秒。'}</div>}
          {error && <div className="text-[11px] text-bp-danger">没成功：{error}</div>}
          <div className="text-[11px] text-bp-faint leading-relaxed">
            贴图会左右、上下镜像着平铺，所以不是无缝的图也看不出接缝。木纹默认是横向的，程序会让它沿着柜子的长边走。光影仍然是程序画的。
          </div>
        </div>

        <div className={card}>
          <div className="text-xs font-semibold text-bp-faint">叠图核对：把图纸盖在样图上，看位置对不对</div>
          {iso ? (
            <div className="text-[11px] text-bp-faint leading-relaxed">斜角立体不是正对着图纸看，没法叠图；核对位置请切到「正俯视」。</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <label className={`${chip(false)} cursor-pointer`}>
                  <Upload size={12} className="inline -mt-0.5 mr-1" />
                  {planUrl ? '换一张图纸' : '选 Study Room 那张图纸'}
                  <input type="file" accept="image/*" className="hidden" onChange={onPickPlan} />
                </label>
                {planUrl && (
                  <label className="flex items-center gap-2 text-xs text-bp-muted">
                    图纸透明度
                    <input type="range" min="0" max="1" step="0.05" value={overlay} onChange={(e) => setOverlay(Number(e.target.value))} aria-label="图纸透明度" />
                  </label>
                )}
              </div>
              <div className="text-[11px] text-bp-faint leading-relaxed">
                图纸只在你的浏览器里显示，不会上传。要用当初上传的那张整页图（1856 × 1044），坐标是按它量的；叠图建议在「正俯视」下看。
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
