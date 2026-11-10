import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Upload, Wand2, Loader2, X } from 'lucide-react';
import { buildScene, recommendCorner, CORNERS } from './scene.js';
import { inventoryLines } from './geometry.js';
import { paintScene } from './paint.js';
import { paletteOf } from './palette.js';
import { pickAspect, polishRender, MAX_POLISH_REFS } from '../ai/dollhouse.js';
import { loadSettings } from '../ai/settings.js';
import STUDY from './sample-study-room.json';

// 试验页（#/lab/plan3d）：把 STUDY ROOM 的坐标样本用程序画成 3D 户型图，给设计师看画风和位置；
// 另有「AI 美化」测试：把这张精确图交给出图模型只换质感，和精确图叠在一起对比有没有东西被挪位。
// 坐标是手工录入的样本；正式功能里由设计师在图纸上核对后得到。

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

const env = { createCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) };

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
  // 按出图模型支持的比例出图：AI 美化的结果和这张图能 1:1 叠在一起
  const scene = useMemo(() => {
    const natural = buildScene(STUDY, opts);
    return buildScene(STUDY, { ...opts, ratio: ratioOf(pickAspect(natural.w, natural.h)) });
  }, [opts]);
  const sceneKey = JSON.stringify(opts, (k, v) => (v === Infinity ? 'inf' : v));

  useEffect(() => {
    if (canvasRef.current) paintScene(canvasRef.current, scene, paletteOf('warm'), env);
  }, [scene]);

  useEffect(() => () => planUrl && URL.revokeObjectURL(planUrl), [planUrl]);

  function onPickPlan(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setPlanUrl(URL.createObjectURL(file));
  }

  const canvasBlob = () => new Promise((resolve) => canvasRef.current?.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
  const fileStem = `study-room-${view}${iso ? `-${corner}-${cab}` : hung === 'hide' ? '-no-hung' : ''}`;

  async function download() {
    const blob = await canvasBlob();
    if (blob) saveBlob(blob, `${fileStem}.jpg`);
  }

  // ---------------- AI 美化（测试） ----------------
  const [refs, setRefs] = useState([]); // [{ file, url }]
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [runs, setRuns] = useState(0);
  const [polished, setPolished] = useState(null); // { key, blob, url }
  const [mixAI, setMixAI] = useState(1);
  const hasKey = !!loadSettings().apiKey;
  const shown = polished && polished.key === sceneKey ? polished : null;

  function onPickRefs(e) {
    const files = [...(e.target.files || [])].filter((f) => /^image\//.test(f.type));
    e.target.value = '';
    if (!files.length) return;
    setRefs((cur) => [...cur, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_POLISH_REFS));
  }

  function removeRef(i) {
    setRefs((cur) => cur.filter((_, k) => k !== i));
  }

  async function polish() {
    if (busy) return;
    setBusy(true);
    setError('');
    setMsg('');
    const key = sceneKey;
    try {
      const guideBlob = await canvasBlob();
      if (!guideBlob) throw new Error('样图还没画好，稍等再试');
      setRuns((n) => n + 1);
      const blob = await polishRender({
        settings: loadSettings(),
        guideBlob,
        refSrcs: refs.map((r) => r.file),
        inventory: inventoryLines(STUDY),
        view,
        onWait: (sec, n) => setMsg(`被限流了，${sec} 秒后自动重试（第 ${n} 次）`),
        onFallback: (model) => setMsg(`高级模型暂不可用，改用 ${model} 再试一次…`),
      });
      setPolished((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { key, blob, url: URL.createObjectURL(blob) };
      });
      setMixAI(1);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setMsg('');
    }
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
            这张图不是 AI 画的：程序按图纸上量出来的坐标逐个画出墙、门窗、柜子和桌椅，所以位置不会跑。柜子高度是按种类的默认值，材质是一套示意配色。
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
          {shown && <img src={shown.url} alt="AI 美化的结果" className="absolute inset-0 w-full h-full" style={{ opacity: mixAI }} data-testid="polished" />}
          {!shown && planUrl && planStyle && <img src={planUrl} alt="" className="absolute max-w-none pointer-events-none mix-blend-multiply" style={planStyle} />}
        </div>

        {/* AI 美化（测试） */}
        <div className={card} data-testid="polish-card">
          <div className="text-xs font-semibold text-bp-faint">AI 美化（测试）：把上面这张精确图交给 AI，只换材质和光影</div>
          <div className="text-[11px] text-bp-faint leading-relaxed">
            每点一次 = 用你的 Gemini key 出 1 张图。AI 被要求不动任何位置，但它不一定做得到，所以结果会和精确图叠在一起让你对比。精确图始终保留。
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {refs.map((r, i) => (
              <span key={r.url} className="relative inline-block w-14 h-14 rounded-lg overflow-hidden border border-bp-line">
                <img src={r.url} alt={`材质参考图 ${i + 1}`} className="w-full h-full object-cover" />
                <button type="button" className="absolute top-0 right-0 p-0.5 bg-white/85 text-bp-muted hover:text-bp-danger" onClick={() => removeRef(i)} aria-label={`移除材质参考图 ${i + 1}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
            {refs.length < MAX_POLISH_REFS && (
              <label className={`${chip(false)} cursor-pointer`}>
                <Upload size={12} className="inline -mt-0.5 mr-1" />
                加材质参考图（可选，最多 {MAX_POLISH_REFS} 张）
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPickRefs} />
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bp-dark text-bp-light text-sm font-medium hover:opacity-90 disabled:opacity-50"
              disabled={busy || !hasKey}
              onClick={polish}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} {busy ? 'AI 正在美化…' : 'AI 美化这张图（1 次出图）'}
            </button>
            <span className="text-[11px] text-bp-faint">本次已出图 {runs} 次</span>
          </div>
          {!hasKey && <div className="text-[11px] text-bp-danger">还没有 Gemini key：先回到 UKIR STUDIO，在右上角设置里填好，再回来这一页。</div>}
          {busy && <div className="text-[11px] text-bp-faint">{msg || '通常要 30–90 秒，这期间不要切换视角。'}</div>}
          {error && <div className="text-[11px] text-bp-danger">美化失败：{error}</div>}
          {shown && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-bp-muted">
                精确图
                <input type="range" min="0" max="1" step="0.05" value={mixAI} onChange={(e) => setMixAI(Number(e.target.value))} aria-label="在精确图和 AI 美化之间对比" />
                AI 美化
              </label>
              <button type="button" className={chip(false)} onClick={() => saveBlob(shown.blob, `${fileStem}-ai.jpg`)}>
                <Download size={12} className="inline -mt-0.5 mr-1" />
                下载 AI 美化的图
              </button>
              <span className="text-[11px] text-bp-faint basis-full">来回拖动滑杆：墙、柜子、桌椅如果在两张图之间「跳」了，就是 AI 把它挪位了。</span>
            </div>
          )}
          {polished && !shown && <div className="text-[11px] text-bp-faint">视角或选项改过了，上一张 AI 美化的结果不再对应这张图；改回去可以再看到。</div>}
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
