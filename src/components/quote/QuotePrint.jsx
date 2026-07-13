import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { T } from '../../theme.js';
import { fmtMYR, fmtNum, tr, pickLang, capColor, cabTypeById, RLBL, QUOTE_TERMS } from '../../constants/pricing.js';
import { fmt } from '../../utils/helpers.js';

// 报价单（可打印 / 另存 PDF）。lang：'en' | 'zh' | 'both'。
// 定制橱柜（SAIL by Riccione Reka）+ Loose Furniture（Riccione Furniture，另起一页）。
export default function QuotePrint({ meta, computed, loose, cabinetNote = '', looseNote = '', discountNote = '', looseDiscountNote = '', lang = 'both', onClose }) {
  const zones = computed.zoneResults.filter((zr) => zr.zone.items.length > 0);
  const looseRows = loose?.rows || [];
  const hasCab = zones.length > 0;
  const hasLoose = looseRows.length > 0;
  const looseNet = loose?.net || 0;
  const grand = computed.net + looseNet;
  const hasSummary = hasCab && hasLoose; // 两个部分都有才需要总览页
  const t = (obj) => tr(obj, lang);
  const lineDesc = (ln) => (lang === 'en' ? ln.descEn : lang === 'zh' ? ln.descZh : `${ln.descEn} ${ln.descZh}`);
  const lineUom = (ln) => (lang === 'en' ? ln.uomEn : lang === 'zh' ? ln.uomZh : ln.uomZh);
  // 定制柜体子项描述：门板/柜体 → "Door: A Series"；抽屉 → "Drawers"
  const cabLineLabel = (ln) => {
    const sid = (ln.descEn.split(' ')[1] || '').trim();
    const map = {
      door:    { en: `Door: ${sid} Series`,         zh: `门板：${sid} 系列` },
      carcass: { en: `Carcass: ${sid} Series`,      zh: `柜体：${sid} 系列` },
      open:    { en: `Open Cabinet: ${sid} Series`, zh: `开放柜：${sid} 系列` },
      drawer:  { en: 'Blum Full Extension Drawer',  zh: 'Blum 全展抽屉' },
    };
    return map[ln.bucket] ? t(map[ln.bucket]) : lineDesc(ln);
  };

  // PDF 文件名：EST QUOTE_RICCIONE_[客户]_[Site]_YYYYMMDD（Chrome 存 PDF 默认取 document.title）
  const handlePrint = () => {
    const prev = document.title;
    const safe = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, ' ');
    const d = (meta.date || '').replace(/-/g, '');
    document.title = `EST QUOTE_RICCIONE_${safe(meta.name) || 'Customer'}_${safe(meta.location) || 'Site'}_${d || 'draft'}`;
    const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  };

  // 抬头（品牌可换）
  const Head = ({ brand }) => (
    <div className="flex items-start justify-between pb-4 mb-4" style={{ borderBottom: `2px solid ${T.ink}` }}>
      <div>
        <div className="font-display text-2xl">{brand}</div>
        <div className="text-xs tracking-widest uppercase mt-1" style={{ color: T.inkSoft }}>{t(RLBL.estQuote)}</div>
      </div>
      <div className="text-right text-xs" style={{ color: T.inkSoft }}>
        <div className="font-medium" style={{ color: T.ink }}>{t(RLBL.rev)} {meta.version || '1'}</div>
        <div>{t(RLBL.date)} {fmt(meta.date)}</div>
        {meta.ref && <div>{t(RLBL.ref)} {meta.ref}</div>}
        {meta.pic && <div>{t(RLBL.pic)} {meta.pic}</div>}
      </div>
    </div>
  );

  const CustomerRow = () => (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-5">
      <div><span style={{ color: T.inkSoft }}>{t(RLBL.name)}：</span>{meta.name || '—'}</div>
      <div><span style={{ color: T.inkSoft }}>{t(RLBL.site)}：</span>{meta.location || '—'}</div>
    </div>
  );

  const Terms = ({ terms }) => (
    <div className="mt-8 space-y-3 text-[11px]" style={{ color: T.inkSoft, breakInside: 'avoid' }}>
      {terms.map((sec, si) => (
        <div key={si}>
          <div className="font-medium" style={{ color: T.ink }}>{t(sec.title)}</div>
          {sec.lines.map((ln, li) => (
            lang === 'both'
              ? <div key={li}>{sec.bullet ? '• ' : ''}{ln.en}　{ln.zh}</div>
              : <div key={li}>{sec.bullet ? '• ' : ''}{t(ln)}</div>
          ))}
          {sec.note && <div className="italic">{t(sec.note)}</div>}
        </div>
      ))}
    </div>
  );

  const NoteBlock = ({ text }) => (
    text ? (
      <div className="mt-5 text-[11px]" style={{ color: T.inkSoft, breakInside: 'avoid' }}>
        <div className="font-medium" style={{ color: T.ink }}>{t(RLBL.notes)}</div>
        <div style={{ whiteSpace: 'pre-line' }}>{text}</div>
      </div>
    ) : null
  );

  // 总览页：某部分的 原价 / 折扣 / 折后小计
  const SummarySection = ({ label, brand, calc, note }) => (
    <>
      <tr style={{ borderTop: `1px solid ${T.line}` }}>
        <td className="pt-2 px-2 font-medium" colSpan={2}>{label} <span style={{ color: T.inkSoft }}>· {brand}</span></td>
      </tr>
      <tr>
        <td className="py-0.5 px-2 pl-5" style={{ color: T.inkSoft }}>{t(RLBL.gross)}</td>
        <td className="text-right py-0.5 px-2">{fmtMYR(calc.gross)}</td>
      </tr>
      {calc.discount > 0 && (
        <tr style={{ color: T.terra }}>
          <td className="py-0.5 px-2 pl-5">{t(RLBL.discount)} ({calc.adjustPct}%){note ? <span className="italic"> — {note}</span> : null}</td>
          <td className="text-right py-0.5 px-2">− {fmtMYR(calc.discount)}</td>
        </tr>
      )}
      <tr>
        <td className="py-0.5 px-2 pl-5 font-medium">{t(RLBL.subtotal)}</td>
        <td className="text-right py-0.5 px-2 font-medium">{fmtMYR(calc.net)}</td>
      </tr>
    </>
  );

  const Signatures = () => (
    <div className="mt-12 text-xs" style={{ width: '48%' }}>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>{t(RLBL.customer)}</div>
    </div>
  );

  const th = 'text-right font-normal py-1 px-2';

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

          {/* ===== 第一页：总览 Summary（定制 + 家具 总计）===== */}
          {hasSummary && (
            <div className="p-8 text-[#2D3E36]" style={{ fontSize: 13 }}>
              <Head brand="RICCIONE" />
              <CustomerRow />
              <div className="mt-6" style={{ breakInside: 'avoid' }}>
                <div className="px-2 py-1 font-medium text-xs uppercase tracking-wide" style={{ background: T.sand }}>{t(RLBL.summary)}</div>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    <SummarySection label={t(RLBL.customCabinet)} brand="SAIL by Riccione Reka" calc={computed} note={discountNote} />
                    <SummarySection label={t(RLBL.looseSection)} brand="Riccione Furniture" calc={loose} note={looseDiscountNote} />
                    {/* 合计（两部分）*/}
                    <tr style={{ borderTop: `1.5px solid ${T.line}` }}>
                      <td className="pt-2 px-2" style={{ color: T.inkSoft }}>{t(RLBL.totalBeforeDiscount)}</td>
                      <td className="text-right pt-2 px-2">{fmtMYR(computed.gross + (loose?.gross || 0))}</td>
                    </tr>
                    {(computed.discount + (loose?.discount || 0)) > 0 && (
                      <tr style={{ color: T.terra }}>
                        <td className="py-0.5 px-2">{t(RLBL.totalDiscountAmt)}</td>
                        <td className="text-right py-0.5 px-2">− {fmtMYR(computed.discount + (loose?.discount || 0))}</td>
                      </tr>
                    )}
                    <tr style={{ borderTop: `2px solid ${T.ink}` }}>
                      <td className="py-3 px-2 font-display text-xl">{t(RLBL.grandTotal)}</td>
                      <td className="text-right py-3 px-2 font-display text-xl">{fmtMYR(grand)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-4 text-[11px] italic" style={{ color: T.inkSoft }}>{t(RLBL.detailNote)}</div>
              </div>
              <Signatures />
            </div>
          )}

          {/* ===== 定制橱柜 SAIL BY RICCIONE REKA ===== */}
          {hasCab && (
            <div className="p-8 text-[#2D3E36]" style={{ fontSize: 13, breakBefore: hasSummary ? 'page' : 'auto' }}>
              <Head brand="SAIL BY RICCIONE REKA" />
              <CustomerRow />

              {zones.map((zr) => (
                <div key={zr.zone.id} className="mb-4" style={{ breakInside: 'avoid' }}>
                  <div className="px-2 py-1 font-medium text-xs uppercase tracking-wide"
                    style={{ background: T.sand }}>{pickLang(zr.zone.name, lang) || t(RLBL.untitled)}</div>
                  <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide" style={{ color: T.inkSoft }}>
                        <th className="text-left font-normal py-1 px-2" style={{ width: '42%' }}>{t(RLBL.desc)}</th>
                        <th className={th}>{t(RLBL.qty)}</th>
                        <th className="text-left font-normal py-1 px-2">{t(RLBL.uom)}</th>
                        <th className={th}>{t(RLBL.unitPrice)}</th>
                        <th className={th}>{t(RLBL.amount)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zr.items.flatMap((ir) => {
                        const qtyCell = (ln) => <td className="text-right py-1 px-2">{fmtNum(ln.qty, ln.piece ? 0 : 2)}</td>;
                        // 定制柜体：柜体类型（+名称）作为分组抬头，门板/柜体/抽屉缩进列在下面
                        if (ir.item.type === 'cabinet') {
                          const typeLabel = pickLang(cabTypeById(ir.item.cabType).label, lang);
                          const nm = pickLang(ir.item.name || ir.item.desc || '', lang);
                          const head = [typeLabel, nm].filter(Boolean).join(' · ');
                          return [
                            <tr key={ir.item.id + '-h'} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                              <td className="py-1 px-2 font-medium" colSpan={5}>{head}</td>
                            </tr>,
                            ...ir.lines.map((ln, i) => (
                              <tr key={ir.item.id + i}>
                                <td className="py-1 px-2 pl-6" style={{ color: T.inkSoft }}>{cabLineLabel(ln)}</td>
                                {qtyCell(ln)}
                                <td className="py-1 px-2">{lineUom(ln)}</td>
                                <td className="text-right py-1 px-2">{fmtNum(Math.round(ln.unitMyr), 0)}</td>
                                <td className="text-right py-1 px-2">{fmtNum(ln.total, 0)}</td>
                              </tr>
                            )),
                          ];
                        }
                        // 其他类型（墙板/房门/灯带/其他）：单行，首行带名称前缀
                        return ir.lines.map((ln, i) => (
                          <tr key={ir.item.id + i} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                            <td className="py-1 px-2">
                              {i === 0 && (() => {
                                const nm = pickLang(ir.item.name || ir.item.desc || '', lang);
                                return nm ? <span className="font-medium">{nm} · </span> : null;
                              })()}
                              {lineDesc(ln)}
                            </td>
                            {qtyCell(ln)}
                            <td className="py-1 px-2">{lineUom(ln)}</td>
                            <td className="text-right py-1 px-2">{fmtNum(Math.round(ln.unitMyr), 0)}</td>
                            <td className="text-right py-1 px-2">{fmtNum(ln.total, 0)}</td>
                          </tr>
                        ));
                      })}
                      <tr style={{ borderTop: `1.5px solid ${T.line}` }}>
                        <td colSpan={4} className="text-right py-1 px-2 text-xs" style={{ color: T.inkSoft }}>{t(RLBL.subtotal)}</td>
                        <td className="text-right py-1 px-2 font-medium">{fmtNum(zr.subtotal, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}

              <div className="mt-6 flex justify-end" style={{ breakInside: 'avoid' }}>
                <div className="w-72 text-sm">
                  <div className="flex justify-between py-1">
                    <span style={{ color: T.inkSoft }}>{t(RLBL.gross)}</span><span>{fmtMYR(computed.gross)}</span>
                  </div>
                  {computed.discount > 0 && (
                    <>
                      <div className="flex justify-between py-1" style={{ color: T.terra }}>
                        <span>{t(RLBL.discount)} ({computed.adjustPct}%)</span><span>− {fmtMYR(computed.discount)}</span>
                      </div>
                      {discountNote && <div className="text-[10px] italic -mt-0.5 pb-1" style={{ color: T.inkSoft }}>{discountNote}</div>}
                    </>
                  )}
                  <div className="flex justify-between py-2 mt-1 font-display text-xl" style={{ borderTop: `2px solid ${T.ink}` }}>
                    <span>{t(RLBL.total)}</span><span>{fmtMYR(computed.net)}</span>
                  </div>
                </div>
              </div>

              <NoteBlock text={cabinetNote} />
              <Terms terms={QUOTE_TERMS} />
              {!hasSummary && <Signatures />}
            </div>
          )}

          {/* ===== Loose Furniture RICCIONE FURNITURE（另起一页）===== */}
          {hasLoose && (
            <div className="p-8 text-[#2D3E36]" style={{ fontSize: 13, breakBefore: hasCab ? 'page' : 'auto' }}>
              <Head brand="RICCIONE FURNITURE" />
              <CustomerRow />

              <div>
                <div className="px-2 py-1 font-medium text-xs uppercase tracking-wide" style={{ background: T.sand }}>
                  {t(RLBL.looseSection)}
                </div>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide" style={{ color: T.inkSoft }}>
                      <th className="text-left font-normal py-1 px-2" style={{ width: 110 }}>{t(RLBL.photo)}</th>
                      <th className="text-left font-normal py-1 px-2" style={{ width: '24%' }}>{t(RLBL.productType)}</th>
                      <th className="text-left font-normal py-1 px-2">{t(RLBL.model)}</th>
                      <th className="text-left font-normal py-1 px-2" style={{ width: 72 }}>{t(RLBL.color)}</th>
                      <th className={th}>{t(RLBL.qty)}</th>
                      <th className={th}>{t(RLBL.unitPrice)}</th>
                      <th className={th}>{t(RLBL.amount)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {looseRows.map((r) => (
                      <tr key={r.id} style={{ borderTop: `1px solid ${T.lineSoft}`, breakInside: 'avoid' }}>
                        <td className="py-1 px-2">
                          {r.image ? <img src={r.image} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 2, border: `1px solid ${T.lineSoft}` }} /> : null}
                        </td>
                        <td className="py-1 px-2">{r.type || '—'}</td>
                        <td className="py-1 px-2">{r.model || '—'}</td>
                        <td className="py-1 px-2">{capColor(r.color) || '—'}</td>
                        <td className="text-right py-1 px-2">{fmtNum(Number(r.qty) || 0, 0)}</td>
                        <td className="text-right py-1 px-2">{fmtNum(Math.round(Number(r.unitMyr) || 0), 0)}</td>
                        <td className="text-right py-1 px-2">{fmtNum(r.total, 0)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `1.5px solid ${T.line}` }}>
                      <td colSpan={6} className="text-right py-1 px-2 text-xs" style={{ color: T.inkSoft }}>{t(RLBL.gross)}</td>
                      <td className="text-right py-1 px-2">{fmtNum(loose.gross, 0)}</td>
                    </tr>
                    {loose.discount > 0 && (
                      <tr style={{ color: T.terra }}>
                        <td colSpan={6} className="text-right py-1 px-2 text-xs">{t(RLBL.discount)} ({loose.adjustPct}%){looseDiscountNote ? <span className="italic"> — {looseDiscountNote}</span> : null}</td>
                        <td className="text-right py-1 px-2">− {fmtNum(loose.discount, 0)}</td>
                      </tr>
                    )}
                    <tr style={{ borderTop: `1px solid ${T.line}` }}>
                      <td colSpan={6} className="text-right py-1 px-2 font-medium">{t(RLBL.total)}</td>
                      <td className="text-right py-1 px-2 font-medium">{fmtNum(loose.net, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <NoteBlock text={looseNote} />
              {/* Loose Furniture 只放 Validity 条款 */}
              <Terms terms={QUOTE_TERMS.slice(0, 1)} />
              {!hasSummary && <Signatures />}
            </div>
          )}

          {!hasCab && !hasLoose && (
            <div className="p-8 text-center text-sm" style={{ color: T.inkSoft }}>No items 暂无明细</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
