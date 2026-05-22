import { Share2, Copy, Printer, X, CheckCircle2 } from 'lucide-react';
import { T } from '../../theme.js';
import { STAGES, CLIENT_STAGES } from '../../constants/stages.js';
import { overallProgress, currentStage, isComplete, stageProgress, fmt } from '../../utils/helpers.js';
import { useToast } from '../ui/UIProvider.jsx';

export default function ClientShareView({ project, onClose }) {
  const overall = overallProgress(project);
  const cur = currentStage(project);
  const done = isComplete(project);
  const toast = useToast();

  const handlePrint = () => window.print();

  const handleCopyText = async () => {
    let text = `溪岸 SAIL — 项目进度报告\n\n`;
    text += `项目: ${project.name}\n客户: ${project.client}\n地址: ${project.address}\n入住日期: ${fmt(project.moveIn)}\n\n`;
    text += `整体进度: ${Math.round(overall.pct)}%\n`;
    text += `当前章节: ${done ? '✓ 已交付' : `${cur.code} · ${CLIENT_STAGES[cur.code].label}`}\n\n`;
    text += `═══ 五章节状态 ═══\n`;
    STAGES.forEach((s) => {
      const sp = stageProgress(project, s);
      const status = sp.pct === 100 ? '✓ 完成' : sp.pct === 0 ? '○ 待开始' : '◐ 进行中';
      text += `${s.code} · ${CLIENT_STAGES[s.code].label}: ${status}\n`;
    });
    text += `\n— 溪岸 SAIL · Where Design Meets Nature`;
    try {
      await navigator.clipboard?.writeText(text);
      toast('已复制文字版进度报告 — 可粘贴到 WhatsApp / WeChat', 'success');
    } catch (e) {
      toast('复制失败，请手动选择文本', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto" style={{ background: 'rgba(45, 62, 54, 0.85)' }} onClick={onClose}>
      <div className="min-h-screen flex items-start justify-center p-4 lg:p-8">
        <div className="w-full max-w-3xl my-auto" style={{ background: T.paper, borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
          <div className="no-print flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <div className="flex items-baseline gap-2">
              <Share2 size={14} strokeWidth={1.5} style={{ color: T.wood }} />
              <span className="text-xs uppercase tracking-widest" style={{ color: T.inkSoft }}>客户分享视图 · 只读</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopyText} className="px-3 py-1.5 text-xs flex items-center gap-1.5" style={{ background: T.cream, color: T.ink, borderRadius: '2px' }}>
                <Copy size={12} />
                复制文字
              </button>
              <button onClick={handlePrint} className="px-3 py-1.5 text-xs flex items-center gap-1.5" style={{ background: T.cream, color: T.ink, borderRadius: '2px' }}>
                <Printer size={12} />
                打印
              </button>
              <button onClick={onClose} className="opacity-60 hover:opacity-100" style={{ color: T.inkSoft }}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="p-8 lg:p-12">
            <div className="text-center mb-10">
              <div className="font-display text-4xl mb-1" style={{ color: T.ink }}>溪岸 · SAIL</div>
              <div className="text-xs tracking-[0.3em] uppercase" style={{ color: T.wood }}>Where Design Meets Nature</div>
              <div className="ink-divider mt-6 mx-auto max-w-xs" />
            </div>

            <div className="text-center mb-10">
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>Project Status Report  ·  项目进度报告</div>
              <h2 className="font-display text-4xl mb-2" style={{ color: T.ink }}>{project.name}</h2>
              <div className="text-sm" style={{ color: T.inkSoft }}>{project.client}  ·  {project.address}</div>
              {project.moveIn && (
                <div className="mt-3 inline-block px-3 py-1 text-xs" style={{ background: T.cream, color: T.ink, borderRadius: '2px' }}>
                  预计入住:  {fmt(project.moveIn)}
                </div>
              )}
            </div>

            <div className="text-center mb-10">
              <div className="font-display text-7xl mb-1" style={{ color: done ? T.sage : T.wood }}>{Math.round(overall.pct)}%</div>
              <div className="text-sm" style={{ color: T.inkSoft }}>
                {done ? '✓ 项目已交付' : `Currently in: ${cur.name} · ${cur.nameCN}`}
              </div>
            </div>

            <div className="space-y-1 mb-10">
              {STAGES.map((s, idx) => {
                const sp = stageProgress(project, s);
                const stDone = sp.pct === 100;
                const stCurrent = !stDone && cur.code === s.code && !done;
                const stColor = stDone ? T.sage : stCurrent ? T.wood : T.lineSoft;
                const txtColor = stDone ? T.ink : stCurrent ? T.ink : T.inkSoft;
                return (
                  <div key={s.code} className="flex items-start gap-4 py-3" style={idx > 0 ? { borderTop: `1px solid ${T.lineSoft}` } : {}}>
                    <div className="flex flex-col items-center" style={{ minWidth: '40px' }}>
                      <div className="flex items-center justify-center" style={{ width: '36px', height: '36px', background: stColor, color: stDone || stCurrent ? T.paper : T.inkSoft, borderRadius: '50%' }}>
                        {stDone ? <CheckCircle2 size={18} strokeWidth={2} /> : <span className="font-display text-lg">{s.code}</span>}
                      </div>
                    </div>
                    <div className="flex-1 pt-1">
                      <div className="flex items-baseline justify-between flex-wrap gap-2">
                        <h3 className="font-display text-xl" style={{ color: txtColor }}>{CLIENT_STAGES[s.code].label}</h3>
                        <div className="text-xs" style={{ color: T.inkSoft }}>
                          {stDone ? '✓ 已完成' : stCurrent ? `进行中  ${sp.done}/${sp.total}` : '待开始'}
                        </div>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: T.inkSoft }}>{CLIENT_STAGES[s.code].desc}</div>
                      {stCurrent && sp.total > 0 && (
                        <div className="mt-2 h-1" style={{ background: T.lineSoft, maxWidth: '200px' }}>
                          <div className="h-full" style={{ background: T.wood, width: `${sp.pct}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-center pt-6" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
              <div className="text-xs leading-relaxed" style={{ color: T.inkSoft }}>
                您看到的是项目的整体进度概览。
                <br />
                如有任何问题, 请联系您的设计师 {project.assigned?.SD || ''}.
              </div>
              <div className="text-[10px] mt-4 opacity-60" style={{ color: T.inkSoft }}>
                溪岸 SAIL · 全屋定制  ·  报告生成于 {fmt(new Date())}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
