import React from 'react';
import { Copy, FileDown, ImageDown, ChevronDown, ChevronRight } from 'lucide-react';
import { BILLABLE } from '../constants.js';
import { fmtBoth, fmtMoney } from '../services/units.js';
import { Btn } from './ui/Bits.jsx';

export default function SummaryPanel({ summary, rates, onRate, showQuote, onToggleQuote, onCopy, onCsv, onPng, busyPng }) {
  const rows = summary.byKind.filter((k) => k.count > 0);

  return (
    <div className="space-y-3">
      <div>
        {rows.length === 0 ? (
          <div className="text-xs text-sail-muted">量几段就会在这里汇总。</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rows.map((k) => (
                <tr key={k.id} className="border-b border-sail-line/70 last:border-0">
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: k.color }} />
                      <span className="text-sail-ink">{k.label}</span>
                      <span className="text-[11px] text-sail-faint">{k.count} 段</span>
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-sail-ink whitespace-nowrap">{fmtBoth(k.mm)}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 font-semibold text-sail-ink">橱柜延尺合计</td>
                <td className="pt-2 text-right font-semibold tabular-nums text-sail-green-deep whitespace-nowrap">
                  {fmtBoth(summary.totalMm)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {summary.checks.length > 0 && (
          <div className="mt-2 pt-2 border-t border-sail-line text-[11px] space-y-0.5">
            {summary.checks.map((c) => (
              <div key={c.id} className="flex justify-between gap-2">
                <span className="text-sail-muted truncate">{c.label}</span>
                <span
                  className={
                    Math.abs(c.errPct) <= 2 ? 'text-sail-green' : Math.abs(c.errPct) <= 5 ? 'text-sail-warn' : 'text-sail-danger'
                  }
                >
                  量得 {Math.round(c.measured)} / 标注 {Math.round(c.expected)} · {c.errPct > 0 ? '+' : ''}
                  {c.errPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-sail-line pt-2">
        <button onClick={onToggleQuote} className="flex items-center gap-1 text-xs font-medium text-sail-muted hover:text-sail-ink">
          {showQuote ? <ChevronDown size={14} /> : <ChevronRight size={14} />} 预估报价（按尺）
        </button>
        {showQuote && (
          <div className="mt-2 space-y-1.5">
            {summary.byKind
              .filter((k) => BILLABLE.includes(k.id))
              .map((k) => (
                <div key={k.id} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-sail-muted">{k.label}</span>
                  <span className="w-16 text-right tabular-nums text-sail-faint">{k.ft.toFixed(2)} ft</span>
                  <span className="text-sail-faint">×</span>
                  <input
                    value={rates[k.id] ?? ''}
                    inputMode="decimal"
                    onChange={(e) => onRate(k.id, e.target.value)}
                    className="w-20 px-1.5 py-0.5 rounded-md border border-sail-line text-xs text-right outline-none focus:border-sail-green"
                  />
                  <span className="text-sail-faint">/ft</span>
                  <span className="ml-auto tabular-nums text-sail-ink">{fmtMoney(k.amount)}</span>
                </div>
              ))}
            <div className="flex justify-between pt-1.5 border-t border-sail-line text-sm font-semibold">
              <span className="text-sail-ink">预估合计</span>
              <span className="text-sail-green-deep tabular-nums">{fmtMoney(summary.totalAmount)}</span>
            </div>
            <p className="text-[11px] text-sail-faint leading-relaxed">
              单价是占位值，改成自家价目后会记住。仅供初步预估，不含五金、台面加工、异形与安装等差异。
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-1">
        <Btn size="sm" onClick={onCopy} title="复制文字摘要，直接发 WhatsApp">
          <Copy size={14} /> 摘要
        </Btn>
        <Btn size="sm" onClick={onCsv} title="导出 CSV，Excel 打开">
          <FileDown size={14} /> CSV
        </Btn>
        <Btn size="sm" onClick={onPng} disabled={busyPng} title="导出带标注的户型图">
          <ImageDown size={14} /> {busyPng ? '…' : '标注图'}
        </Btn>
      </div>
    </div>
  );
}
