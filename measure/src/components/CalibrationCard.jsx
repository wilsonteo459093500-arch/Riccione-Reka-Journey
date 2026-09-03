import React, { useEffect, useRef, useState } from 'react';
import { Ruler, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Btn, Input } from './ui/Bits.jsx';
import { COMMON_MM } from '../constants.js';
import { parseLenToMm } from '../services/units.js';

/**
 * 第一步：比例标定。
 * phase: 'idle' | 'drawing' | 'pending' | 'done'
 */
export default function CalibrationCard({ phase, pxLen, mmPerPx, calib, unit, onStart, onSubmit, onCancel }) {
  const [raw, setRaw] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (phase === 'pending') {
      setRaw('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [phase]);

  const submit = () => {
    const mm = parseLenToMm(raw, unit);
    if (!isFinite(mm) || mm <= 0) return;
    onSubmit(mm);
  };

  if (phase === 'done') {
    return (
      <div className="bg-white border border-sail-line rounded-xl p-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={16} className="text-sail-green mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-sail-ink">比例已标定</div>
            <div className="text-xs text-sail-muted mt-0.5">
              基准 {Math.round(calib.mm)} mm ＝ 图上 {Math.round(pxLen)} px，1 px ≈ {mmPerPx.toFixed(2)} mm
            </div>
            <div className="text-[11px] text-sail-faint mt-1">
              量完建议用「校验」分类再量一条图纸上标注过的尺寸，对一下误差。
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'pending') {
    return (
      <div className="bg-white border-2 border-sail-green rounded-xl p-3">
        <div className="text-sm font-semibold text-sail-ink">这条线的实际尺寸是多少？</div>
        <div className="text-xs text-sail-muted mt-0.5 mb-2">图上量得 {Math.round(pxLen)} px，填图纸标注值。</div>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={raw}
            inputMode="decimal"
            placeholder={unit === 'ft' ? '例如 34 或 34ft' : unit === 'm' ? '例如 10.35' : '例如 10350'}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <Btn variant="primary" onClick={submit}>
            确定
          </Btn>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {COMMON_MM.map((v) => (
            <button
              key={v}
              onClick={() => setRaw(String(v))}
              className="px-2 py-0.5 rounded-md border border-sail-line text-[11px] text-sail-muted hover:bg-sail-tint"
            >
              {v}
            </button>
          ))}
          <button onClick={onCancel} className="px-2 py-0.5 text-[11px] text-sail-faint hover:text-sail-ink">
            重画
          </button>
        </div>
        <div className="text-[11px] text-sail-faint mt-2">可以写单位：3600、3.6m、12ft 都认。</div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-sail-warn/50 rounded-xl p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-sail-warn mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-sail-ink">第一步：标定比例</div>
          <div className="text-xs text-sail-muted mt-0.5">
            {phase === 'drawing'
              ? '在图上沿一个已知尺寸点两下（例如那条 10350 的总尺寸线），越长越准。'
              : '先告诉它图上一段线代表多少毫米，之后所有长度才能按比例算。'}
          </div>
        </div>
      </div>
      {phase !== 'drawing' && (
        <Btn variant="primary" size="lg" className="w-full mt-2.5" onClick={onStart}>
          <Ruler size={16} /> 开始标定
        </Btn>
      )}
      {phase === 'drawing' && (
        <Btn size="sm" variant="plain" className="mt-2" onClick={onCancel}>
          取消
        </Btn>
      )}
    </div>
  );
}
