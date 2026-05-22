import { useMemo, useState } from 'react';
import { CalendarDays, AlertTriangle, CheckCircle2, Copy, Image as ImageIcon, Droplets, Zap, DoorClosed, Sparkle } from 'lucide-react';
import { T } from '../../theme.js';
import { currentStage, isComplete, allSafe, latestReport, copyToClipboard, formatBriefingForWhatsApp } from '../../utils/helpers.js';
import { useToast } from '../ui/UIProvider.jsx';
import { SafetyDot } from '../daily/Safety.jsx';

function BriefingStat({ label, en, value, accent }) {
  return (
    <div className="p-5" style={{ background: T.paper }}>
      <div className="text-xs uppercase tracking-wider mb-2" style={{ color: T.inkSoft }}>{label}</div>
      <div className="font-display text-5xl leading-none" style={{ color: accent || T.ink }}>{value}</div>
      <div className="text-[10px] mt-2 uppercase tracking-widest opacity-60" style={{ color: T.inkSoft }}>{en}</div>
    </div>
  );
}

function BriefingCard({ project, report, dayNumber, onClick, delay = 0 }) {
  const c = report.eodChecks || {};
  const safe = allSafe(report);
  const photoCount = (report.photos || []).length;
  const stage = currentStage(project);

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 hover-lift transition-all fade-up"
      style={{ background: T.paper, border: `1px solid ${T.line}`, borderLeft: `4px solid ${safe ? T.sage : T.terra}`, borderRadius: '2px', animationDelay: `${0.04 * delay}s` }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="font-display text-2xl leading-none" style={{ color: T.ink }}>{project.name}</h3>
          <span className="font-display text-lg" style={{ color: T.wood }}>Day {dayNumber}</span>
          <span className="font-mono text-xs" style={{ color: T.inkSoft }}>{report.date}</span>
          {report.author && <span className="text-xs" style={{ color: T.inkSoft }}>· {report.author}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <SafetyDot active={c.water} label="水" Icon={Droplets} />
          <SafetyDot active={c.electric} label="电" Icon={Zap} />
          <SafetyDot active={c.closure} label="门窗" Icon={DoorClosed} />
          <SafetyDot active={c.cleanup} label="清理" Icon={Sparkle} />
        </div>
      </div>

      <div className="text-xs mb-3" style={{ color: T.inkSoft }}>
        {project.client}  ·  {project.address}  ·  当前阶段 <span style={{ color: T.wood }}>{stage.name} · {stage.nameCN}</span>
      </div>

      {report.progress && (
        <div className="mb-2" style={{ color: T.ink }}>
          <span className="text-xs uppercase tracking-wider mr-2" style={{ color: T.inkSoft }}>进度</span>
          <span className="text-sm">{report.progress}</span>
        </div>
      )}

      {report.issues && (
        <div className="mb-2 p-2 text-sm" style={{ background: 'rgba(196, 84, 58, 0.08)', color: T.terra, borderRadius: '2px' }}>
          <AlertTriangle size={12} className="inline mr-1.5" strokeWidth={1.5} />
          {report.issues}
        </div>
      )}

      {report.eodNote && (
        <div className="mb-2 text-xs" style={{ color: T.inkSoft }}>
          <span className="uppercase tracking-wider mr-2">明日</span>
          {report.eodNote}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 text-xs" style={{ borderTop: `1px solid ${T.lineSoft}`, color: T.inkSoft }}>
        <div className="flex items-center gap-3">
          {photoCount > 0 && (
            <span className="flex items-center gap-1"><ImageIcon size={11} strokeWidth={1.5} />{photoCount} 张照片</span>
          )}
        </div>
        <span className="flex items-center gap-1" style={{ color: safe ? T.sage : T.terra }}>
          {safe ? '✓ 全部 4 项安全' : '⚠ 有未确认项目'}
        </span>
      </div>
    </button>
  );
}

export default function BriefingView({ projects, onOpen }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const briefingItems = useMemo(() => {
    return projects
      .map((p) => {
        const r = latestReport(p);
        if (!r) return null;
        const sorted = [...(p.dailyReports || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const dayNumber = sorted.findIndex((x) => x.id === r.id) + 1;
        return { project: p, report: r, dayNumber };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const sa = allSafe(a.report), sb = allSafe(b.report);
        if (sa !== sb) return sa ? 1 : -1;
        return (b.report.date || '').localeCompare(a.report.date || '');
      });
  }, [projects]);

  const missingReports = useMemo(() => {
    return projects.filter((p) => {
      const cur = currentStage(p);
      if (cur.code !== 'D') return false;
      if (isComplete(p)) return false;
      return (p.dailyReports || []).length === 0;
    });
  }, [projects]);

  const stats = useMemo(() => {
    const total = briefingItems.length;
    const safe = briefingItems.filter((b) => allSafe(b.report)).length;
    const unsafe = total - safe;
    const withIssues = briefingItems.filter((b) => (b.report.issues || '').trim().length > 0).length;
    return { total, safe, unsafe, withIssues, missing: missingReports.length };
  }, [briefingItems, missingReports]);

  const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const todayShort = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });

  const handleCopyAll = async () => {
    const text = formatBriefingForWhatsApp(briefingItems, todayShort);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      toast('复制失败 — 请手动选择文字复制', 'error');
    }
  };

  return (
    <div className="fade-up">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: T.wood }}>Daily Briefing · 早晨速览</div>
        <h1 className="font-display text-5xl mb-2" style={{ color: T.ink }}>日报总览</h1>
        <p className="text-sm" style={{ color: T.inkSoft }}>{todayStr}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px mb-8" style={{ background: T.line }}>
        <BriefingStat label="昨夜日报" en="Reports" value={stats.total} />
        <BriefingStat label="全部安全" en="Safe" value={stats.safe} accent={T.sage} />
        <BriefingStat label="需关注" en="Unsafe" value={stats.unsafe} accent={stats.unsafe > 0 ? T.terra : null} />
        <BriefingStat label="工地缺日报" en="Missing" value={stats.missing} accent={stats.missing > 0 ? T.gold : null} />
      </div>

      {briefingItems.length > 0 && (
        <div className="mb-6 p-4 flex items-center justify-between flex-wrap gap-3" style={{ background: T.cream, borderRadius: '2px' }}>
          <div className="text-sm" style={{ color: T.ink }}>
            <span className="font-display text-lg">早晨群发</span>
            <span className="ml-2" style={{ color: T.inkSoft }}>— 一键复制全天工地总览, 粘贴到 WhatsApp / WeChat 团队群</span>
          </div>
          <button onClick={handleCopyAll} className="text-sm flex items-center gap-1.5 px-4 py-2 transition-all" style={{ background: copied ? T.sage : T.ink, color: T.paper, borderRadius: '2px' }}>
            {copied ? <><CheckCircle2 size={14} /> 已复制</> : <><Copy size={13} />复制全天摘要</>}
          </button>
        </div>
      )}

      {missingReports.length > 0 && (
        <div className="mb-6 p-4" style={{ background: 'rgba(196, 84, 58, 0.08)', borderLeft: `3px solid ${T.terra}`, borderRadius: '2px' }}>
          <div className="flex items-baseline gap-2 mb-2">
            <AlertTriangle size={14} strokeWidth={1.5} style={{ color: T.terra }} />
            <div className="font-display text-lg" style={{ color: T.ink }}>{missingReports.length} 个工地在安装期但无日报</div>
          </div>
          <div className="space-y-1">
            {missingReports.map((p) => (
              <button key={p.id} onClick={() => onOpen(p.id)} className="text-sm block hover:underline" style={{ color: T.terra }}>
                · {p.name} ({p.client})
              </button>
            ))}
          </div>
        </div>
      )}

      {briefingItems.length === 0 ? (
        <div className="text-center py-20" style={{ background: T.cream, borderRadius: '2px' }}>
          <CalendarDays size={48} strokeWidth={1} className="mx-auto mb-4" style={{ color: T.wood }} />
          <div className="font-display text-2xl mb-1" style={{ color: T.ink }}>暂无日报</div>
          <div className="text-sm" style={{ color: T.inkSoft }}>当任何项目进入安装期 + SS 填写日报后, 此处会汇总显示</div>
        </div>
      ) : (
        <div className="space-y-3">
          {briefingItems.map(({ project, report, dayNumber }, idx) => (
            <BriefingCard key={project.id} project={project} report={report} dayNumber={dayNumber} onClick={() => onOpen(project.id)} delay={idx} />
          ))}
        </div>
      )}
    </div>
  );
}
