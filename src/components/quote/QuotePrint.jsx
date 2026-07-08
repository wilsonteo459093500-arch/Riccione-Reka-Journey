import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { T } from '../../theme.js';
import { fmtMYR, fmtNum, tr, pickLang, RLBL, QUOTE_TERMS } from '../../constants/pricing.js';
import { fmt } from '../../utils/helpers.js';

// 正式感的预估报价单（可打印 / 另存 PDF）。lang：'en' | 'zh' | 'both'。
export default function QuotePrint({ meta, computed, lang = 'both', onClose }) {
  const handlePrint = () => window.print();
  const zones = computed.zoneResults.filter((zr) => zr.zone.items.length > 0);
  const t = (obj) => tr(obj, lang);

  // 明细行描述 / 单位按语言取
  const lineDesc = (ln) => (lang === 'en' ? ln.descEn : lang === 'zh' ? ln.descZh : `${ln.descEn} ${ln.descZh}`);
  const lineUom = (ln) => (lang === 'en' ? ln.uomEn : lang === 'zh' ? ln.uomZh : ln.uomZh);

  return createPortal(
    <div className="quote-print-overlay fixed inset-0 z-50 overflow-auto" style={{ background: 'rgba(45,62,54,0.85)' }} onClick={onClose}>
      <div className="min-h-screen flex items-start justify-center p-4 lg:p-8">
        <div className="quote-print-sheet w-full max-w-4xl my-4" style={{ background: '#fff', borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>

          {/* toolbar */}
          <div className="no-print flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <span className="text-xs uppercase tracking-widest" style={{ color: T.inkSoft }}>{t(RLBL.preview)}</span>
            <div className="flex items-center gap-2">
              <button onClick={handlePrint} className="px-3 py-1.5 text-xs flex items-center gap-1.5"
                style={{ background: T.wood, color: '#fff', borderRadius: '2px' }}>
                <Printer size={12} /> {t(RLBL.printBtn)}
              </button>
              <button onClick={onClose} className="p-1.5" style={{ color: T.inkSoft }}><X size={16} /></button>
            </div>
          </div>

          {/* 报价单正文 */}
          <div className="p-8 text-[#2D3E36]" style={{ fontSize: 13 }}>
            <div className="flex items-start justify-between pb-4 mb-4" style={{ borderBottom: `2px solid ${T.ink}` }}>
              <div>
                <div className="font-display text-2xl">SAIL BY RICCIONE REKA</div>
                <div className="text-xs tracking-widest uppercase mt-1" style={{ color: T.inkSoft }}>{t(RLBL.estQuote)}</div>
              </div>
              <div className="text-right text-xs" style={{ color: T.inkSoft }}>
                <div className="font-medium" style={{ color: T.ink }}>{t(RLBL.rev)} {meta.version || '1'}</div>
                <div>{t(RLBL.date)} {fmt(meta.date)}</div>
                {meta.ref && <div>{t(RLBL.ref)} {meta.ref}</div>}
                {meta.pic && <div>{t(RLBL.pic)} {meta.pic}</div>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-5">
              <div><span style={{ color: T.inkSoft }}>{t(RLBL.name)}：</span>{meta.name || '—'}</div>
              <div><span style={{ color: T.inkSoft }}>{t(RLBL.site)}：</span>{meta.location || '—'}</div>
            </div>

            {/* 每个区域一块 */}
            {zones.map((zr) => (
              <div key={zr.zone.id} className="mb-4" style={{ breakInside: 'avoid' }}>
                <div className="px-2 py-1 font-medium text-xs uppercase tracking-wide"
                  style={{ background: T.sand }}>{pickLang(zr.zone.name, lang) || t(RLBL.untitled)}</div>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide" style={{ color: T.inkSoft }}>
                      <th className="text-left font-normal py-1 px-2" style={{ width: '42%' }}>{t(RLBL.desc)}</th>
                      <th className="text-right font-normal py-1 px-2">{t(RLBL.qty)}</th>
                      <th className="text-left font-normal py-1 px-2">{t(RLBL.uom)}</th>
                      <th className="text-right font-normal py-1 px-2">{t(RLBL.unitPrice)}</th>
                      <th className="text-right font-normal py-1 px-2">{t(RLBL.amount)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zr.items.flatMap((ir) =>
                      ir.lines.map((ln, i) => (
                        <tr key={ir.item.id + i} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                          <td className="py-1 px-2">
                            {i === 0 && (ir.item.name || ir.item.desc) ? (
                              <span className="font-medium">{pickLang(ir.item.name || ir.item.desc, lang)} · </span>
                            ) : null}
                            {lineDesc(ln)}
                          </td>
                          <td className="text-right py-1 px-2">{fmtNum(ln.qty, ln.piece ? 0 : 2)}</td>
                          <td className="py-1 px-2">{lineUom(ln)}</td>
                          <td className="text-right py-1 px-2">{fmtNum(Math.round(ln.unitMyr), 0)}</td>
                          <td className="text-right py-1 px-2">{fmtNum(ln.total, 0)}</td>
                        </tr>
                      ))
                    )}
                    <tr style={{ borderTop: `1.5px solid ${T.line}` }}>
                      <td colSpan={4} className="text-right py-1 px-2 text-xs" style={{ color: T.inkSoft }}>{t(RLBL.subtotal)}</td>
                      <td className="text-right py-1 px-2 font-medium">{fmtNum(zr.subtotal, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            {/* 汇总 */}
            <div className="mt-6 flex justify-end" style={{ breakInside: 'avoid' }}>
              <div className="w-72 text-sm">
                <div className="flex justify-between py-1">
                  <span style={{ color: T.inkSoft }}>{t(RLBL.gross)}</span><span>{fmtMYR(computed.gross)}</span>
                </div>
                {computed.discount > 0 && (
                  <div className="flex justify-between py-1" style={{ color: T.terra }}>
                    <span>{t(RLBL.discount)} ({computed.adjustPct}%)</span><span>− {fmtMYR(computed.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 mt-1 font-display text-xl"
                  style={{ borderTop: `2px solid ${T.ink}` }}>
                  <span>{t(RLBL.total)}</span><span>{fmtMYR(computed.net)}</span>
                </div>
              </div>
            </div>

            {/* 条款 Terms */}
            <div className="mt-8 space-y-3 text-[11px]" style={{ color: T.inkSoft, breakInside: 'avoid' }}>
              {QUOTE_TERMS.map((sec, si) => (
                <div key={si}>
                  <div className="font-medium" style={{ color: T.ink }}>{t(sec.title)}</div>
                  {sec.lines.map((ln, li) => (
                    lang === 'both' ? (
                      <div key={li}>{sec.bullet ? '• ' : ''}{ln.en}　{ln.zh}</div>
                    ) : (
                      <div key={li}>{sec.bullet ? '• ' : ''}{t(ln)}</div>
                    )
                  ))}
                  {sec.note && <div className="italic">{t(sec.note)}</div>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-8 mt-10 text-xs">
              <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>{t(RLBL.director)}</div>
              <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>{t(RLBL.customer)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
