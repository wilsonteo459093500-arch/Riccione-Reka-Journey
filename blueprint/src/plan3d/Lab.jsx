import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Upload } from 'lucide-react';
import { buildScene } from './scene.js';
import { paintScene } from './paint.js';
import { paletteOf } from './palette.js';
import STUDY from './sample-study-room.json';

// 试验页（#/lab/plan3d）：把 STUDY ROOM 的坐标样本用程序画成俯视 3D 户型图，给设计师看画风和位置。
// 不调用任何 AI。坐标是手工录入的样本；正式功能里由设计师在图纸上核对后得到。

const chip = (active) =>
  `px-3 py-1.5 rounded-lg text-xs border transition-colors ${
    active ? 'bg-bp-dark text-bp-light border-bp-dark' : 'bg-white text-bp-muted border-bp-line hover:border-bp-rule'
  }`;

const VIEWS = [
  { id: 'top', zh: '正俯视', hint: '垂直往下看，和图纸一一对应。' },
  { id: 'persp', zh: '立体俯视', hint: '镜头在房间正上方，看得到柜子正面和墙的内侧；地面上的位置仍和图纸重合。' },
];
const HUNG = [
  { id: 'ghost', zh: '吊柜半透明' },
  { id: 'hide', zh: '不画吊柜' },
];

const env = { createCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) };

export default function Plan3dLab() {
  const [view, setView] = useState('top');
  const [hung, setHung] = useState('ghost');
  const [planUrl, setPlanUrl] = useState(null);
  const [overlay, setOverlay] = useState(0.5);
  const canvasRef = useRef(null);
  const scene = useMemo(() => buildScene(STUDY, { view, hung }), [view, hung]);

  useEffect(() => {
    if (canvasRef.current) paintScene(canvasRef.current, scene, paletteOf('warm'), env);
  }, [scene]);

  useEffect(() => () => planUrl && URL.revokeObjectURL(planUrl), [planUrl]);

  function onPickPlan(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setPlanUrl(URL.createObjectURL(file));
  }

  function download() {
    canvasRef.current?.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `study-room-${view}${hung === 'hide' ? '-no-hung' : ''}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      },
      'image/jpeg',
      0.92
    );
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

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={chip(v.id === view)} aria-pressed={v.id === view} onClick={() => setView(v.id)}>
                {v.zh}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {HUNG.map((h) => (
              <button key={h.id} type="button" className={chip(h.id === hung)} aria-pressed={h.id === hung} onClick={() => setHung(h.id)}>
                {h.zh}
              </button>
            ))}
          </div>
          <button type="button" className={chip(false)} onClick={download}>
            <Download size={12} className="inline -mt-0.5 mr-1" />
            下载这张图
          </button>
        </div>
        <div className="text-[11px] text-bp-faint">{viewDef.hint}</div>

        <div className="relative rounded-2xl overflow-hidden border border-bp-line bg-white">
          <canvas ref={canvasRef} className="block w-full h-auto" aria-label="3D 户型图样图" />
          {planUrl && planStyle && <img src={planUrl} alt="" className="absolute max-w-none pointer-events-none mix-blend-multiply" style={planStyle} />}
        </div>

        <div className="rounded-2xl border border-bp-line bg-bp-card p-4 space-y-2">
          <div className="text-xs font-semibold text-bp-faint">叠图核对：把图纸盖在样图上，看位置对不对</div>
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
        </div>
      </div>
    </div>
  );
}
