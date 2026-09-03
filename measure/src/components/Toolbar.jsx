import React from 'react';
import { MousePointer2, Ruler, Undo2, CornerDownLeft, X } from 'lucide-react';
import { KINDS, UNITS } from '../constants.js';
import { Btn, Toggle } from './ui/Bits.jsx';

export default function Toolbar({
  mode,
  setMode,
  kind,
  setKind,
  prefs,
  setPrefs,
  drafting,
  onUndo,
  onFinish,
  onCancel,
  canCalibrate,
  onRecalibrate,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-sail-line">
      <div className="flex gap-1 bg-sail-tint rounded-lg p-1">
        <button
          onClick={() => setMode('select')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
            mode === 'select' ? 'bg-white text-sail-ink shadow-sm' : 'text-sail-muted'
          }`}
        >
          <MousePointer2 size={14} /> 选择
        </button>
        <button
          onClick={() => setMode('draw')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
            mode === 'draw' ? 'bg-white text-sail-ink shadow-sm' : 'text-sail-muted'
          }`}
        >
          <Ruler size={14} /> 量尺
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => {
              setKind(k.id);
              setMode('draw');
            }}
            className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
              kind === k.id ? 'text-white border-transparent' : 'bg-white text-sail-muted border-sail-line hover:bg-sail-tint'
            }`}
            style={kind === k.id ? { background: k.color } : undefined}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Toggle on={prefs.ortho} onChange={(v) => setPrefs({ ...prefs, ortho: v })} title="自动拉直横平竖直的线">
          正交
        </Toggle>
        <Toggle on={prefs.polyline} onChange={(v) => setPrefs({ ...prefs, polyline: v })} title="L 型 / U 型连续量，双击结束">
          折线
        </Toggle>
      </div>

      <div className="flex gap-1 bg-sail-tint rounded-lg p-0.5">
        {UNITS.map((u) => (
          <button
            key={u.id}
            onClick={() => setPrefs({ ...prefs, unit: u.id })}
            className={`px-2 py-0.5 rounded-md text-xs ${prefs.unit === u.id ? 'bg-white text-sail-ink shadow-sm' : 'text-sail-muted'}`}
          >
            {u.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {drafting ? (
          <>
            <Btn size="sm" onClick={onUndo} title="退回上一个点">
              <Undo2 size={14} /> 退点
            </Btn>
            <Btn size="sm" variant="primary" onClick={onFinish}>
              <CornerDownLeft size={14} /> 结束
            </Btn>
            <Btn size="sm" variant="plain" onClick={onCancel}>
              <X size={14} />
            </Btn>
          </>
        ) : (
          <>
            <Btn size="sm" onClick={onUndo} title="撤销上一条测量">
              <Undo2 size={14} /> 撤销
            </Btn>
            {canCalibrate && (
              <Btn size="sm" onClick={onRecalibrate} title="重新标定比例">
                重标比例
              </Btn>
            )}
          </>
        )}
      </div>
    </div>
  );
}
