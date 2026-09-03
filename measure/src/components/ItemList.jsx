import React from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { KINDS, kindOf } from '../constants.js';
import { fmtLen, parseLenToMm } from '../services/units.js';
import { itemMm } from '../services/summary.js';

export default function ItemList({ items, mmPerPx, unit, selectedId, onSelect, onPatch, onDelete }) {
  if (!items.length) {
    return (
      <div className="text-xs text-sail-muted leading-relaxed">
        还没有测量。选好上面的分类（地柜 / 吊柜 / 高柜…），在图上点两下就量出一段。
        <br />
        L 型 / U 型打开「折线」连续点，双击结束，长度自动相加。
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((it, idx) => {
        const k = kindOf(it.kind);
        const mm = itemMm(it, mmPerPx);
        const active = selectedId === it.id;
        const segs = Math.max(0, it.points.length - 1);
        const expected = Number(it.expectedMm) || 0;
        const errPct = it.kind === 'check' && expected && mm ? ((mm - expected) / expected) * 100 : null;
        return (
          <div
            key={it.id}
            onClick={() => onSelect(it.id)}
            className={`rounded-lg border px-2 py-1.5 cursor-pointer transition-colors ${
              active ? 'border-sail-green bg-sail-tint' : 'border-sail-line bg-white hover:bg-sail-tint/60'
            } ${it.hidden ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: k.color }} />
              <input
                value={it.label}
                onChange={(e) => onPatch(it.id, { label: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 bg-transparent text-sm text-sail-ink outline-none border-b border-transparent focus:border-sail-line"
              />
              <span className="text-sm font-semibold text-sail-ink tabular-nums whitespace-nowrap">
                {mm ? fmtLen(mm, unit) : `${segs} 段`}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPatch(it.id, { hidden: !it.hidden });
                }}
                className="text-sail-faint hover:text-sail-ink p-0.5"
                title={it.hidden ? '计入汇总' : '暂不计入汇总'}
              >
                {it.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(it.id);
                }}
                className="text-sail-faint hover:text-sail-danger p-0.5"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {active && (
              <div className="flex flex-wrap items-center gap-2 mt-1.5 pl-[18px]" onClick={(e) => e.stopPropagation()}>
                <select
                  value={it.kind}
                  onChange={(e) => onPatch(it.id, { kind: e.target.value })}
                  className="px-1.5 py-0.5 rounded-md border border-sail-line bg-white text-[11px] text-sail-muted outline-none"
                >
                  {KINDS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-sail-faint">
                  #{idx + 1} · {segs} 段
                </span>
                {it.kind === 'check' && (
                  <>
                    <input
                      value={it.expectedRaw ?? (expected ? String(expected) : '')}
                      placeholder="图纸标注值"
                      inputMode="decimal"
                      onChange={(e) =>
                        onPatch(it.id, { expectedRaw: e.target.value, expectedMm: parseLenToMm(e.target.value, unit) })
                      }
                      className="w-24 px-1.5 py-0.5 rounded-md border border-sail-line text-[11px] outline-none focus:border-sail-green"
                    />
                    {errPct != null && (
                      <span
                        className={`text-[11px] font-medium ${
                          Math.abs(errPct) <= 2 ? 'text-sail-green' : Math.abs(errPct) <= 5 ? 'text-sail-warn' : 'text-sail-danger'
                        }`}
                      >
                        误差 {errPct > 0 ? '+' : ''}
                        {errPct.toFixed(1)}%
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
