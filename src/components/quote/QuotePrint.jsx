import { Printer, X } from 'lucide-react';
import { T } from '../../theme.js';
import { fmtMYR, fmtNum } from '../../constants/pricing.js';
import { fmt } from '../../utils/helpers.js';

// 正式感的预估报价单（可打印 / 另存 PDF），版式参照现有 Excel 报价。
export default function QuotePrint({ meta, computed, onClose }) {
  const handlePrint = () => window.print();
  const zones = computed.zoneResults.filter((zr) => zr.zone.items.length > 0);

  const qtyDp = (uom) => (['套', '樘', '项', 'pcs'].includes(uom) ? 0 : 2);

  return (
    <div className="fixed inset-0 z-50 overflow-auto" style={{ background: 'rgba(45,62,54,0.85)' }} onClick={onClose}>
      <div className="min-h-screen flex items-start justify-center p-4 lg:p-8">
        <div className="w-full max-w-4xl my-4" style={{ background: '#fff', borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>

          {/* toolbar */}
          <div className="no-print flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <span className="text-xs uppercase tracking-widest" style={{ color: T.inkSoft }}>预估报价单 · 预览</span>
            <div className="flex items-center gap-2">
              <button onClick={handlePrint} className="px-3 py-1.5 text-xs flex items-center gap-1.5"
                style={{ background: T.wood, color: '#fff', borderRadius: '2px' }}>
                <Printer size={12} /> 打印 / 存 PDF
              </button>
              <button onClick={onClose} className="p-1.5" style={{ color: T.inkSoft }}><X size={16} /></button>
            </div>
          </div>

          {/* 报价单正文 */}
          <div className="p-8 text-[#2D3E36]" style={{ fontSize: 13 }}>
            <div className="flex items-start justify-between pb-4 mb-4" style={{ borderBottom: `2px solid ${T.ink}` }}>
              <div>
                <div className="font-display text-2xl">SAIL BY RICCIONE REKA</div>
                <div className="text-xs tracking-widest uppercase mt-1" style={{ color: T.inkSoft }}>Estimated Quotation 预估报价</div>
              </div>
              <div className="text-right text-xs" style={{ color: T.inkSoft }}>
                <div>日期 {fmt(meta.date)}</div>
                {meta.ref && <div>编号 {meta.ref}</div>}
                {meta.pic && <div>PIC {meta.pic}</div>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-5">
              <div><span style={{ color: T.inkSoft }}>客户 NAME：</span>{meta.name || '—'}</div>
              <div><span style={{ color: T.inkSoft }}>地点 SITE：</span>{meta.location || '—'}</div>
            </div>

            {/* 每个区域一块 */}
            {zones.map((zr) => (
              <div key={zr.zone.id} className="mb-4" style={{ breakInside: 'avoid' }}>
                <div className="px-2 py-1 font-medium text-xs uppercase tracking-wide"
                  style={{ background: T.sand }}>{zr.zone.name || '未命名区域'}</div>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide" style={{ color: T.inkSoft }}>
                      <th className="text-left font-normal py-1 px-2" style={{ width: '42%' }}>项目 Description</th>
                      <th className="text-right font-normal py-1 px-2">数量 Qty</th>
                      <th className="text-left font-normal py-1 px-2">单位</th>
                      <th className="text-right font-normal py-1 px-2">单价 RM</th>
                      <th className="text-right font-normal py-1 px-2">金额 RM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zr.items.flatMap((ir) =>
                      ir.lines.map((ln, i) => (
                        <tr key={ir.item.id + i} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                          <td className="py-1 px-2">
                            {i === 0 && (ir.item.name || ir.item.desc) ? (
                              <span className="font-medium">{ir.item.name || ir.item.desc} · </span>
                            ) : null}
                            {ln.desc}
                          </td>
                          <td className="text-right py-1 px-2">{fmtNum(ln.qty, qtyDp(ln.uom))}</td>
                          <td className="py-1 px-2">{ln.uom}</td>
                          <td className="text-right py-1 px-2">{fmtNum(Math.round(ln.unitMyr), 0)}</td>
                          <td className="text-right py-1 px-2">{fmtNum(ln.total, 0)}</td>
                        </tr>
                      ))
                    )}
                    <tr style={{ borderTop: `1.5px solid ${T.line}` }}>
                      <td colSpan={4} className="text-right py-1 px-2 text-xs" style={{ color: T.inkSoft }}>小计 Sub-Total</td>
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
                  <span style={{ color: T.inkSoft }}>合计 Gross</span><span>{fmtMYR(computed.gross)}</span>
                </div>
                {computed.discount > 0 && (
                  <div className="flex justify-between py-1" style={{ color: T.terra }}>
                    <span>折扣 Discount</span><span>− {fmtMYR(computed.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 mt-1 font-display text-xl"
                  style={{ borderTop: `2px solid ${T.ink}` }}>
                  <span>预估总额</span><span>{fmtMYR(computed.net)}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 text-[10px]" style={{ color: T.inkSoft }}>
              ※ 本报价为预估价，实际以正式报价为准。价格已含板材换算（人民币零售价 × 1.3 ÷ 1.65，取整至 5）。
            </div>

            <div className="grid grid-cols-2 gap-8 mt-10 text-xs">
              <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>DIRECTOR 签名 / 日期</div>
              <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>CUSTOMER 签名 / 日期</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
