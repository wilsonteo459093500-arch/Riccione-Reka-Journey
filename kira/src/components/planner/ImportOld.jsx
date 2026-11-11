// 导入旧报价（从旧报价工具云端只读）+ 对价报告（旧价 vs KIRA 重算，差异必须为 0）
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { T } from '../../theme.js';
import { fmtMYR, computeQuote } from '../../constants/pricing.js';
import { oldQuotes, cloudConfigured } from '../../services/kiraRepo.js';
import { parityReport } from '../../planner/importOld.js';
import { useBackClose } from './bits.jsx';

export default function ImportOld({ initialTab = 'import', onImport, onClose }) {
  const [tab, setTab] = useState(initialTab);
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  useBackClose(onClose); // 手机返回键 = 关闭

  useEffect(() => {
    if (!cloudConfigured) return;
    oldQuotes.list().then(setList).catch((e) => setErr(e?.message || String(e)));
  }, []);

  const groups = useMemo(() => {
    const m = new Map();
    (list || []).forEach((r) => {
      const g = r.groupId || r.id;
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(r);
    });
    const kw = q.trim().toLowerCase();
    return [...m.values()]
      .map((recs) => recs.sort((a, b) => (parseInt(b.meta?.version, 10) || 0) - (parseInt(a.meta?.version, 10) || 0)))
      .filter((recs) => !kw || [recs[0].meta?.name, recs[0].meta?.location, recs[0].meta?.ref].some((s) => (s || '').toLowerCase().includes(kw)));
  }, [list, q]);

  const report = useMemo(() => (tab === 'parity' && list ? parityReport(list) : null), [tab, list]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print" style={{ background: 'rgba(45,62,54,0.55)' }} onClick={onClose}>
      <div className="w-full sm:max-w-3xl max-h-[92vh] flex flex-col" style={{ background: T.paper, borderRadius: 2 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 pt-4">
          {[['import', 'Import old quote 导入旧报价'], ['parity', 'Price check 对价报告']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className="px-3 py-2 text-sm -mb-px"
              style={{ color: tab === id ? T.ink : T.inkSoft, borderBottom: `2px solid ${tab === id ? T.wood : 'transparent'}`, fontWeight: tab === id ? 600 : 400 }}>{label}</button>
          ))}
          <button onClick={onClose} className="ml-auto p-2" style={{ color: T.inkSoft }}><X size={18} /></button>
        </div>
        <div className="px-5 pb-5 pt-3 overflow-y-auto scrollbar-thin" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
          {!cloudConfigured && (
            <div className="text-sm py-6" style={{ color: T.inkSoft }}>
              This needs the shared cloud (same Supabase as the old quote tool). 需要先接上云端（和旧报价工具同一个 Supabase），见 DEPLOY.md。
            </div>
          )}
          {cloudConfigured && err && <div className="text-sm py-4" style={{ color: T.terra }}>{err}</div>}
          {cloudConfigured && !err && !list && <div className="text-sm py-6" style={{ color: T.inkSoft }}>Loading old quotes… 正在读取旧报价（只读）…</div>}

          {list && tab === 'import' && (
            <>
              <div className="text-[11px] mb-2" style={{ color: T.inkSoft }}>
                Read-only — KIRA makes its own copy; the old quote is never changed. 只读：KIRA 复制一份来改，旧工具里的报价不会被动到。
              </div>
              <div className="relative mb-3">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: T.inkSoft }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 搜索 客户/地点/编号"
                  className="w-full pl-8 pr-2 py-2 text-sm outline-none" style={{ background: T.cream, border: `1px solid ${T.line}`, borderRadius: 2 }} />
              </div>
              <div className="space-y-2">
                {groups.length === 0 && <div className="text-sm py-4 text-center" style={{ color: T.inkSoft }}>No old quotes 没有旧报价</div>}
                {groups.map((recs) => (
                  <div key={recs[0].groupId || recs[0].id} className="p-3" style={{ background: T.cream, border: `1px solid ${T.lineSoft}`, borderRadius: 2 }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm truncate" style={{ color: T.ink }}>{recs[0].meta?.name || 'Untitled 未命名'}</div>
                        <div className="text-[11px] truncate" style={{ color: T.inkSoft }}>{recs[0].meta?.location || '—'}{recs[0].meta?.ref ? ` · ${recs[0].meta.ref}` : ''}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {recs.map((r) => {
                        const net = computeQuote(r.zones || [], r.adjustPct, r.discountMode, r.discountAmt).net;
                        return (
                          <button key={r.id} disabled={busyId === r.id} onClick={async () => { setBusyId(r.id); await onImport(r); setBusyId(null); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2, color: T.ink }}>
                            <Download size={12} /> Rev {r.meta?.version || '1'} · {fmtMYR(net)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {report && (
            <div>
              <div className="flex items-center gap-2 p-3 mb-3" style={{ background: report.pass ? '#E6EEDF' : '#F6E3DD', borderRadius: 2 }}>
                {report.pass ? <CheckCircle2 size={18} style={{ color: T.sage }} /> : <AlertTriangle size={18} style={{ color: T.terra }} />}
                <div className="text-sm" style={{ color: T.ink }}>
                  {report.pass ? 'All prices match — difference 0 差异为 0，可以全员上线' : 'Some prices differ — see below 有差异，见下方'}
                  <div className="text-[11px]" style={{ color: T.inkSoft }}>
                    {report.records} quotes 份报价 · {report.recordsSame} totals same 总价一致 · {report.itemsSame}/{report.itemsChecked} cabinet lines same 柜体行一致
                    {report.itemsSkipped ? ` · ${report.itemsSkipped} kept as manual lines 保留手动行（不需换算）` : ''}
                  </div>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead><tr style={{ color: T.inkSoft }}><th className="text-left py-1">Customer 客户</th><th className="text-right">Old 旧工具</th><th className="text-right">KIRA</th><th /></tr></thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                      <td className="py-1">{r.name || '—'} <span style={{ color: T.inkSoft }}>Rev {r.version}</span>
                        {r.diffs.map((d, i) => <div key={i} style={{ color: T.terra }}>{d.zone} · {d.item} {d.length}: {d.old} → {d.kira}</div>)}
                      </td>
                      <td className="text-right">{fmtMYR(r.oldNet)}</td>
                      <td className="text-right">{fmtMYR(r.kiraNet)}</td>
                      <td className="text-right pl-2">{r.same ? <CheckCircle2 size={13} style={{ color: T.sage, display: 'inline' }} /> : <AlertTriangle size={13} style={{ color: T.terra, display: 'inline' }} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
