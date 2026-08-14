import React from 'react';
import { Target, CalendarDays, Lock, ShieldCheck, Banknote } from 'lucide-react';
import { TABLE, FEE_STATUS } from '../../constants.js';
import {
  memberById, commitmentsOf, fmtDate, daysUntil, commitmentMeta, todayISO,
  absenceCount, pendingReasons, isSeated,
} from '../../utils.js';
import { Card, Badge, EmptyState, SectionTitle, Notice } from '../Shared.jsx';

// 会员视角：只有自己的承诺、桌规、日期。
// 别人的案例内容一个字都看不到 —— 这一页的克制就是桌子的信任基础。
export default function MyPageView({ snapshot, session }) {
  const { members, sessions, commitments } = snapshot;
  const me = memberById(members, session.memberId);
  const mine = commitmentsOf(commitments, session.memberId);
  const today = todayISO();
  const upcoming = sessions.filter(s => s.date >= today && s.status !== 'closed').slice(0, 3);
  const openOnes = mine.filter(c => c.status === 'open');
  const absences = absenceCount(sessions, session.memberId);

  return (
    <div className="space-y-5">
      <SectionTitle>我的</SectionTitle>

      {me && (
        <Card>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-pumm-brand text-white flex items-center justify-center font-semibold flex-shrink-0">
              {me.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-pumm-ink">{me.name}</div>
              <div className="text-xs text-pumm-muted">{me.company}</div>
              <div className="text-[11px] text-pumm-brass mt-0.5">{me.industry}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge color={FEE_STATUS[me.feeStatus]?.color}>
                  <Banknote className="w-3 h-3" />年费{FEE_STATUS[me.feeStatus]?.label}
                </Badge>
                <Badge color={me.ndaSigned ? '#3F7D5C' : '#9C3D2E'}>
                  <ShieldCheck className="w-3 h-3" />{me.ndaSigned ? 'NDA 已签' : 'NDA 未签'}
                </Badge>
                {absences > 0 && <Badge color={absences >= 2 ? '#9C3D2E' : '#C0843A'}>缺席 {absences} 次</Badge>}
              </div>
              {!isSeated(me) && (
                <div className="text-[11px] text-pumm-danger mt-2">
                  还没正式入桌 —— 还差：{pendingReasons(me).join('、')}。找桌长处理。
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div>
        <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">
          我锁的事 {openOnes.length > 0 && <span className="text-pumm-warn">· {openOnes.length} 件未结</span>}
        </h3>
        {mine.length === 0 ? (
          <Card>
            <EmptyState
              icon={Target}
              title="还没有承诺"
              hint="轮到你当案主时，会在会上锁一件事，30 天 —— 下一场开场第一件事就是查它。"
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {mine.map(c => {
              const meta = commitmentMeta(c.status);
              const d = daysUntil(c.dueDate);
              const overdue = c.status === 'open' && d !== null && d < 0;
              return (
                <div key={c.id} className="bg-white border border-pumm-line rounded-lg p-3.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge color={meta.color}>{meta.label}</Badge>
                    {overdue && <Badge color="#9C3D2E">逾期 {-d} 天</Badge>}
                    {c.status === 'open' && d !== null && d >= 0 && d <= 3 && (
                      <Badge color="#C0843A">{d === 0 ? '今天到期' : `还有 ${d} 天`}</Badge>
                    )}
                    <span className="text-[11px] text-pumm-faint ml-auto">到期 {fmtDate(c.dueDate)}</span>
                  </div>
                  <div className="text-sm text-pumm-ink mt-1.5 leading-snug">{c.content}</div>
                  {c.reviewNote && (
                    <div className="text-xs text-pumm-muted mt-1.5 pl-2 border-l-2 border-pumm-line">
                      复盘：{c.reviewNote}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">接下来的日子</h3>
        {upcoming.length === 0 ? (
          <Card><EmptyState icon={CalendarDays} title="还没排下一场" hint="桌长排好会出现在这里。" /></Card>
        ) : (
          <div className="space-y-2">
            {upcoming.map(s => {
              const d = daysUntil(s.date);
              const iAmPresenter = (s.presenterIds || []).includes(session.memberId);
              return (
                <div key={s.id} className="bg-white border border-pumm-line rounded-lg p-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-pumm-ink">{fmtDate(s.date)}</div>
                    {iAmPresenter && (
                      <div className="text-xs text-pumm-brass mt-0.5">这场轮到你上桌 —— 先把问题想成一句话。</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-display text-xl font-semibold text-pumm-ink leading-none">{Math.max(0, d ?? 0)}</div>
                    <div className="text-[10px] text-pumm-faint">天后</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Notice tone="info" icon={Lock}>
        你看不到别人的案例内容 —— 这是桌规，对每个人都一样，所以你自己讲的也不会被别人翻出来。
        每场 3.5 小时：承诺复盘 30′ → 案主陈述 15′ → 只提问 30′ → 给建议 40′ → 锁诺 15′。
        一诺 {TABLE.commitmentDays} 天。
      </Notice>
    </div>
  );
}
