// 新人引导：第一次打开自动出现（可跳过）；之后按「?」再看。附示范报价 + 30 秒短视频。
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, PlayCircle, Sparkles } from 'lucide-react';
import { T } from '../../theme.js';

export const GUIDE_KEY = 'kira.onboarded.v1';
export const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch (e) { return true; } };
export const markGuideSeen = () => { try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) { /* ignore */ } };

const STEPS = [
  { t: 'New quote 新报价', d: 'Tap “New” at the top right. Fill in the customer name and phone (WhatsApp).', z: '点右上角「New 新客户报价」，先填客户名字和电话（WhatsApp 用）。' },
  { t: 'Add a room 加房间', d: 'Pick the room and type its ceiling height — wardrobes go to the ceiling automatically.', z: '选房间，填这个房间的楼高 —— 衣柜会自动做到顶。' },
  { t: 'Add a cabinet 加柜子', d: 'Tap “Add cabinet”, pick a template (wardrobe / kitchen / TV / shoe) and type the total width. Doors are split automatically (each ≤ 600 mm).', z: '按「加柜子」选模板（衣柜 / 厨房 / 电视柜 / 鞋柜），打总宽就好：自动分门（每扇最宽 600）、自动画图、自动算价。' },
  { t: 'Pick each section 点每一格', d: 'Change any section: long hanging, drawers, open shelves, glass… The price bar at the bottom updates instantly. Not sure? Leave the defaults.', z: '每一格可以换：长挂衣、抽屉、开放格、玻璃门… 底部价钱条马上变。不确定就用默认的。' },
  { t: 'Show & send 给客户看、发出去', d: 'Turn the 3D view for the customer. Then “Quote” → PDF or long image, or “WhatsApp” to open the customer chat with the text ready.', z: '3D 可以左右转给客户看。然后「Quote 报价单」存 PDF / 长图，或按「WhatsApp」直接打开客户对话（文字已填好）。' },
];

export default function Guide({ onClose, onDemo, videoSrc }) {
  const [i, setI] = useState(0);
  const [video, setVideo] = useState(false);
  const s = STEPS[i];
  const close = () => { markGuideSeen(); onClose(); };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print" style={{ background: 'rgba(45,62,54,0.55)' }} onClick={close}>
      <div className="w-full sm:max-w-lg p-5 sm:p-6" style={{ background: T.paper, borderRadius: 2 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>How to use KIRA 怎么用 · {i + 1}/{STEPS.length}</div>
          <button onClick={close} className="p-1" style={{ color: T.inkSoft }}><X size={18} /></button>
        </div>
        {video && videoSrc ? (
          <video src={videoSrc} controls autoPlay playsInline className="w-full mt-3" style={{ background: '#000', borderRadius: 2 }} />
        ) : (
          <>
            <div className="font-display text-2xl mt-2" style={{ color: T.ink }}>{s.t}</div>
            <div className="text-base mt-2" style={{ color: T.ink }}>{s.z}</div>
            <div className="text-sm mt-1" style={{ color: T.inkSoft }}>{s.d}</div>
          </>
        )}
        <div className="flex items-center gap-2 mt-5">
          <button disabled={i === 0} onClick={() => { setVideo(false); setI(i - 1); }} className="p-2 disabled:opacity-30" style={{ color: T.ink, border: `1px solid ${T.line}`, borderRadius: 2 }}><ChevronLeft size={16} /></button>
          {i < STEPS.length - 1 ? (
            <button onClick={() => { setVideo(false); setI(i + 1); }} className="flex items-center gap-1 px-4 py-2 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: 2 }}>Next 下一步 <ChevronRight size={14} /></button>
          ) : (
            <button onClick={close} className="px-4 py-2 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: 2 }}>Start 开始</button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {videoSrc && <button onClick={() => setVideo(!video)} className="flex items-center gap-1 text-xs" style={{ color: T.wood }}><PlayCircle size={14} /> 30s video 短视频</button>}
            {onDemo && <button onClick={() => { markGuideSeen(); onDemo(); }} className="flex items-center gap-1 text-xs" style={{ color: T.wood }}><Sparkles size={14} /> Demo 示范报价</button>}
          </div>
        </div>
        <button onClick={close} className="mt-3 text-[11px] underline" style={{ color: T.inkSoft }}>Skip 跳过</button>
      </div>
    </div>,
    document.body,
  );
}
