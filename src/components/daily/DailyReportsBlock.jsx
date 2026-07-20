import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { T } from '../../theme.js';
import { useConfirm } from '../ui/UIProvider.jsx';
import DailyReportCard from './DailyReportCard.jsx';
import DailyReportModal from './DailyReportModal.jsx';

export default function DailyReportsBlock({ project, onSaveReport, onDeleteReport }) {
  const [editingReport, setEditingReport] = useState(null); // existing report or { isNew: true }
  const confirm = useConfirm();

  const reports = useMemo(
    () => [...(project.dailyReports || [])].sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [project.dailyReports]
  );

  const allClosedCount = reports.filter((r) => {
    const c = r.eodChecks || {};
    return c.water && c.electric && c.closure && c.cleanup;
  }).length;

  return (
    <div className="mb-4 p-4" style={{ background: T.cream, borderRadius: '2px' }}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <div className="text-xs uppercase tracking-widest" style={{ color: T.inkSoft }}>Daily Install Reports</div>
            <div className="font-display text-xl" style={{ color: T.ink }}>安装每日报告</div>
            <span className="font-mono text-[10px] px-1.5 py-0.5" style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>D5</span>
          </div>
          <div className="text-xs" style={{ color: T.inkSoft }}>安装期间每天 EOD 由 SS 填写 · 必须 4 项安全检查全通过</div>
          {reports.length > 0 && (
            <div className="text-xs mt-2" style={{ color: T.inkSoft }}>
              共 <span className="font-mono" style={{ color: T.ink }}>{reports.length}</span> 条记录  ·
              <span className="font-mono ml-1" style={{ color: allClosedCount === reports.length ? T.sage : T.gold }}>{allClosedCount}</span>
              <span className="ml-1">条全安全</span>
            </div>
          )}
        </div>
        <button onClick={() => setEditingReport({ isNew: true })} className="text-sm flex items-center gap-1.5 px-4 py-2 flex-shrink-0" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
          <Plus size={14} strokeWidth={2} />新增今日日报
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-6 text-xs" style={{ color: T.inkSoft, opacity: 0.7 }}>
          📅 暂无日报 · 安装开始当天起每晚填一条
        </div>
      ) : (
        <div className="space-y-2 mt-3">
          {reports.map((r, idx) => (
            <DailyReportCard key={r.id} report={r} dayNumber={idx + 1} onClick={() => setEditingReport(r)} />
          ))}
        </div>
      )}

      {editingReport && (
        <DailyReportModal
          project={project}
          report={editingReport.isNew ? null : editingReport}
          dayNumber={editingReport.isNew ? reports.length + 1 : reports.findIndex((r) => r.id === editingReport.id) + 1}
          onClose={() => setEditingReport(null)}
          onSave={(report) => { onSaveReport(report); setEditingReport(null); }}
          onDelete={async () => {
            if (!editingReport.isNew && (await confirm({ title: '删除日报', message: '确定删除此条日报?', danger: true, confirmText: '删除' }))) {
              onDeleteReport(editingReport.id);
              setEditingReport(null);
            }
          }}
        />
      )}
    </div>
  );
}
