import React, { useMemo } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2, CalendarDays, Lightbulb } from 'lucide-react';
import { METRIC_TARGETS, TABLE_STEPS, TABLE } from '../../constants.js';
import {
  computeMetrics, pilotVerdict, pct, fmtDate, todayISO, daysUntil, memberById,
  advisorLeaderboard,
} from '../../utils.js';
import { Card, StatCard, Notice, SectionTitle, Hint, Badge } from '../Shared.jsx';

export default function DashboardView({ snapshot, role }) {
  const metrics = useMemo(() => computeMetrics(snapshot), [snapshot]);
  const verdict = useMemo(() => pilotVerdict(metrics), [metrics]);
  const leaderboard = useMemo(
    () => advisorLeaderboard(snapshot.members, snapshot.cases, snapshot.commitments),
    [snapshot]
  );
  const isDirector = role === 'director';

  const today = todayISO();
  const next = snapshot.sessions.find(s => s.date >= today && s.status !== 'closed');
  const t = METRIC_TARGETS;

  return (
    <div className="space-y-5">
      <SectionTitle>看板</SectionTitle>

      {isDirector && (
        <Notice tone="info">
          理事会视角：只有统计数字与出席率。案例内容不对理事会开放 ——
          会员敢不敢在桌上讲真问题，取决于这条线守不守得住。
        </Notice>
      )}

      {next && (
        <Card className="bg-pumm-brand text-white border-pumm-brand">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-pumm-gold flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">下一场</div>
              <div className="font-display text-lg font-semibold leading-tight">{fmtDate(next.date)}</div>
              {!isDirector && (
                <div className="text-xs opacity-80 mt-0.5">
                  案主：{(next.presenterIds || []).map(id => memberById(snapshot.members, id)?.name).filter(Boolean).join('、') || '未定'}
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-display text-2xl font-semibold leading-none">
                {Math.max(0, daysUntil(next.date) ?? 0)}
              </div>
              <div className="text-[10px] opacity-70">天后</div>
            </div>
          </div>
        </Card>
      )}

      {/* ---- 四个数（规格第 7 节）---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={t.attendanceRate.label}
          value={pct(metrics.attendanceRate)}
          sub={`${metrics.attendanceDetail.present} / ${metrics.attendanceDetail.slots} 人次 · ${metrics.attendanceDetail.sessions} 场`}
          target="≥ 80%"
          ok={metrics.attendanceRate !== null && metrics.attendanceRate >= t.attendanceRate.target}
        />
        <StatCard
          label={t.renewalRate.label}
          value={pct(metrics.renewalRate)}
          sub={metrics.renewalDetail.cohort
            ? `${metrics.renewalDetail.renewed} / ${metrics.renewalDetail.cohort} 位上年度会员`
            : '还没满一年'}
          target="≥ 80%"
          ok={metrics.renewalRate !== null && metrics.renewalRate >= t.renewalRate.target}
        />
        <StatCard
          label={t.caseCount.label}
          value={metrics.caseCount}
          sub="三场累计 ≥ 5 个"
          target="≥ 5"
          ok={metrics.caseCount >= t.caseCount.target}
        />
        <StatCard
          label={t.commitmentRate.label}
          value={pct(metrics.commitmentRate)}
          sub={`完成 ${metrics.commitmentDetail.done} · 未结 ${metrics.commitmentDetail.open} · 未完成 ${metrics.commitmentDetail.missed}`}
        />
      </div>

      {/* ---- 试点桌成败判定 ---- */}
      <Card>
        <div className="flex items-start gap-2.5">
          {verdict.allPass
            ? <CheckCircle2 className="w-5 h-5 text-pumm-ok flex-shrink-0 mt-0.5" />
            : <AlertTriangle className="w-5 h-5 text-pumm-warn flex-shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-semibold text-pumm-ink">
              {!verdict.measurable
                ? '数据还不够，先把第一场跑完'
                : verdict.allPass
                  ? '三个数全达标 —— 可以考虑开第二桌'
                  : '三个数没全达标 —— 修流程，再跑一轮'}
            </div>
            <Hint>
              出席率、续会率、案例数 —— 这三个是试点桌的成败判定。不全达标就不开第二桌，
              这是规格里写死的纪律，系统只负责把数字摆出来。
            </Hint>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {verdict.checks.map(c => (
                <Badge key={c.key} color={c.ok ? '#3F7D5C' : '#C0843A'}>
                  {METRIC_TARGETS[c.key].label} {c.ok ? '达标' : '未达标'}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ---- 建议贡献榜 ----
          只有名字和数字，没有任何建议正文，所以理事会也能看。
          「被采纳」来自案主锁诺时自己点的来源 —— 不是桌长评的，是案主投的票。 */}
      {leaderboard.length > 0 && (
        <Card>
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb className="w-4 h-4 text-pumm-brass" />
            <span className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold">
              建议贡献榜 · 谁的建议最常被案主采纳
            </span>
          </div>
          <div className="space-y-1">
            {leaderboard.slice(0, 10).map((r, i) => (
              <div key={r.member.id} className="flex items-center gap-2.5 py-1 border-b border-pumm-line last:border-0">
                <span className={`w-5 text-center font-display text-sm font-semibold ${i < 3 ? 'text-pumm-brass' : 'text-pumm-faint'}`}>
                  {i + 1}
                </span>
                <span className="text-sm text-pumm-ink min-w-0 flex-1 truncate">{r.member.name}</span>
                <span className="text-xs text-pumm-muted tabular-nums">给出 {r.given}</span>
                <Badge color={r.adopted > 0 ? '#3F7D5C' : '#7C8087'}>被采纳 {r.adopted}</Badge>
              </div>
            ))}
          </div>
          <Hint>
            「被采纳」是案主锁诺时自己点的 —— 这一栏就是「老板帮老板，不是顾问给答案」的证据链。
          </Hint>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Card>
          <div className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold mb-2">桌况</div>
          <Row label="在桌人数" value={`${metrics.seatedCount} / ${TABLE.seatLimit}`} />
          <Row label="待入桌" value={metrics.pendingCount} hint="年费或 NDA 未齐" />
          <Row label="已开场次" value={metrics.closedSessions} />
          <Row label="承诺总数" value={metrics.commitmentDetail.total} />
        </Card>

        <Card>
          <div className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold mb-2">TABLE 五步</div>
          {TABLE_STEPS.map(s => (
            <div key={s.key} className="flex items-center gap-2 py-1 border-b border-pumm-line last:border-0">
              <span className="w-5 h-5 rounded bg-pumm-brand text-pumm-gold text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                {s.key}
              </span>
              <span className="text-sm text-pumm-ink">{s.name}</span>
              <span className="text-xs text-pumm-brass ml-auto">{s.metric}</span>
            </div>
          ))}
        </Card>
      </div>

      <Hint>
        <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
        所有数字都是自动算的。看到不对，去改源头记录，不要在这里手工调 ——
        这一页没有任何可以手输的数。
      </Hint>
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-pumm-line last:border-0">
      <span className="text-sm text-pumm-muted">
        {label}
        {hint && <span className="text-[10px] text-pumm-faint ml-1.5">{hint}</span>}
      </span>
      <span className="text-sm font-semibold text-pumm-ink tabular-nums">{value}</span>
    </div>
  );
}
