import { useMemo, useState } from 'react';
import {
  CalendarDays, AlertTriangle, CheckCircle2, Copy, ChevronRight,
  Image as ImageIcon, Droplets, Zap, DoorClosed, Sparkle, Clock,
} from 'lucide-react';
import { T } from '../../theme.js';
import {
  currentStage, isComplete, allSafe, latestReport,
  copyToClipboard, formatBriefingForWhatsApp, formatDefectsBriefingForWhatsApp,
  daysUntil,
} from '../../utils/helpers.js';
import { useToast } from '../ui/UIProvider.jsx';
import { SafetyDot } from '../daily/Safety.jsx';
import { defectStatusInfo } from '../defects/statuses.js';

function BriefingDefectRow({ project, defect, onClick }) {
  const info = defectStatusInfo(defect.status);
  const Icon = info.Icon;
  const daysToETA = defect.eta ? daysUntil(defect.eta) : null;
  const sevColor = defect.severity === 'high' ? T.terra : defect.severity === 'medium' ? T.gold : T.inkSoft;
  const sevLabel = defect.severity === 'high' ? '高' : defect.severity === 'medium' ? '中' : '低';

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 hover-lift transition-all"
      style={{ background: T.cream, border: `1px solid ${T.lineSoft}`, borderLeft: `3px solid ${info.color}`, borderRadius: '2px' }}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-shrink-0 mt-1.5" title={`严重 ${sevLabel}`} style={{ width: 10, height: 10, borderRadius: '50%', background: sevColor }} />
        <div
          className="flex-shrink-0 mt-0.5 px-2 py-1 flex items-center gap-1 text-[10px] uppercase tracking-wider"
          style={{ background: info.color, color: T.paper, borderRadius: '2px' }}
        >
          <Icon size={10} strokeWidth={1.5} />
          {info.label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
            <span className="font-display text-base" style={{ color: T.ink }}>{project.name}</span>
            <span className="text-xs" style={{ color: T.inkSoft }}>· {project.client}</span>
          </div>
          <div className="text-sm" style={{ color: T.ink }}>{defect.item}</div>
          <div className="text-xs mt-0.5" style={{ color: T.inkSoft }}>{defect.description}</div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] flex-wrap" style={{ color: T.inkSoft }}>
            {defect.reorderRef && <span className="font-mono" style={{ color: T.wood }}>RO# {defect.reorderRef}</span>}
            {daysToETA !== null && (
              <span className="flex items-center gap-0.5" style={{ color: daysToETA < 0 ? T.terra : daysToETA <= 3 ? T.gold : T.inkSoft }}>
                <Clock size={11} strokeWidth={1.5} />
                ETA {daysToETA < 0 ? `逾 ${Math.abs(daysToETA)} 天` : daysToETA === 0 ? '今天' : `${daysToETA} 天后`}
              </span>
            )}
            {defect.status === 'arrived' && <span style={{ color: T.sage }}>→ 待复装 Ready to install</span>}
            {defect.discoveredBy && <span>· 发现人 {defect.discoveredBy}</span>}
          </div>
        </div>
        <ChevronRight size={14} strokeWidth={1.5} style={{ color: T.inkSoft, opacity: 0.5, marginTop: 4 }} />
      </div>
    </button>
  );
}

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
  const [copiedDefects, setCopiedDefects] = useState(false);
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
      if (cur.code !== 'T') return false; // Daily reports live in Stage T (TACKLE)
      if (isComplete(p)) return false;
      return (p.dailyReports || []).length === 0;
    });
  }, [projects]);

  // All open defects across every project, sorted by severity then ETA urgency.
  const openDefects = useMemo(() => {
    const items = [];
    projects.forEach((p) => {
      (p.defects || []).forEach((d) => {
        if (d.status === 'closed') return;
        items.push({ project: p, defect: d });
      });
    });
    const statusOrder = { open: 0, ordered: 1, arrived: 2 };
    const sevOrder = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => {
      const sa = sevOrder[a.defect.severity] ?? 1;
      const sb = sevOrder[b.defect.severity] ?? 1;
      if (sa !== sb) return sa - sb;
      const oa = statusOrder[a.defect.status] ?? 0;
      const ob = statusOrder[b.defect.status] ?? 0;
      if (oa !== ob) return oa - ob;
      const da = a.defect.eta ? daysUntil(a.defect.eta) : 9999;
      const db = b.defect.eta ? daysUntil(b.defect.eta) : 9999;
      return da - db;
    });
    return items;
  }, [projects]);

  const stats = useMemo(() => {
    const total = briefingItems.length;
    const safe = briefingItems.filter((b) => allSafe(b.report)).length;
    const unsafe = total - safe;
    const withIssues = briefingItems.filter((b) => (b.report.issues || '').trim().length > 0).length;
    const defectsArrived = openDefects.filter((x) => x.defect.status === 'arrived').length;
    return { total, safe, unsafe, withIssues, missing: missingReports.length, defectsOpen: openDefects.length, defectsArrived };
  }, [briefingItems, missingReports, openDefects]);

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

  const handleCopyDefects = async () => {
    const text = formatDefectsBriefingForWhatsApp(openDefects, todayShort);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedDefects(true);
      setTimeout(() => setCopiedDefects(false), 2500);
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px mb-8" style={{ background: T.line }}>
        <BriefingStat label="昨夜日报" en="Reports" value={stats.total} />
        <BriefingStat label="全部安全" en="Safe" value={stats.safe} accent={T.sage} />
        <BriefingStat label="需关注" en="Unsafe" value={stats.unsafe} accent={stats.unsafe > 0 ? T.terra : null} />
        <BriefingStat label="工地缺日报" en="Missing" value={stats.missing} accent={stats.missing > 0 ? T.gold : null} />
        <BriefingStat label="待处理缺陷" en="Open Defects" value={stats.defectsOpen} accent={stats.defectsOpen > 0 ? T.wood : null} />
      </div>

      {openDefects.length > 0 && (
        <div className="mb-8 p-5" style={{ background: T.paper, border: `1px solid ${T.line}`, borderTop: `3px solid ${T.wood}`, borderRadius: '2px' }}>
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="text-xs uppercase tracking-[0.3em]" style={{ color: T.wood }}>Aftercare · 全员售后视图</div>
              <h2 className="font-display text-2xl" style={{ color: T.ink }}>待处理缺陷 / Open Defects</h2>
              <div className="text-xs mt-1" style={{ color: T.inkSoft }}>
                跨所有项目 · 按严重度 + 到货紧急度排序
                {stats.defectsArrived > 0 && (
                  <> · <span style={{ color: T.sage }}>{stats.defectsArrived} 项已到货, 可安排复装</span></>
                )}
              </div>
            </div>
            <button
              onClick={handleCopyDefects}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 transition-all flex-shrink-0"
              style={{
                background: copiedDefects ? T.sage : 'transparent',
                color: copiedDefects ? T.paper : T.wood,
                border: `1px solid ${copiedDefects ? T.sage : T.wood}`,
                borderRadius: '2px',
              }}
            >
              {copiedDefects ? <><CheckCircle2 size={12} /> 已复制</> : <><Copy size={12} />复制到 WhatsApp</>}
            </button>
          </div>
          <div className="space-y-2">
            {openDefects.map(({ project, defect }) => (
              <BriefingDefectRow
                key={project.id + '_' + defect.id}
                project={project}
                defect={defect}
                onClick={() => onOpen(project.id)}
              />
            ))}
          </div>
        </div>
      )}

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
