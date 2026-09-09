import React, { useState, useMemo } from 'react';
import { Check, X, RotateCcw, Target, Download } from 'lucide-react';
import {
  memberName, fmtDate, daysUntil, pct, commitmentMeta, toCSV, download, todayISO,
} from '../../utils.js';
import { Card, Button, Badge, EmptyState, SectionTitle, Hint, inputCls, StatCard } from '../Shared.jsx';

const FILTERS = [
  { key: 'open',   label: '未结' },
  { key: 'overdue',label: '已过期' },
  { key: 'done',   label: '完成' },
  { key: 'missed', label: '未完成' },
  { key: 'all',    label: '全部' },
];

export default function CommitmentsView({ snapshot, onSaveCommitment, canReview }) {
  const { members, commitments, sessions } = snapshot;
  const [filter, setFilter] = useState('open');
  const [notes, setNotes] = useState({});

  const today = todayISO();

  const rows = useMemo(() => {
    const list = commitments.slice().sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    if (filter === 'all') return list;
    if (filter === 'overdue') return list.filter(c => c.status === 'open' && c.dueDate < today);
    return list.filter(c => c.status === filter);
  }, [commitments, filter, today]);

  const total = commitments.length;
  const done = commitments.filter(c => c.status === 'done').length;
  const missed = commitments.filter(c => c.status === 'missed').length;
  const open = commitments.filter(c => c.status === 'open').length;

  const review = (c, status) => onSaveCommitment({
    ...c, status,
    reviewNote: notes[c.id] ?? c.reviewNote ?? '',
    reviewedAt: status === 'open' ? null : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const exportCSV = () => {
    const data = commitments.map(c => ({
      会员: memberName(members, c.memberId),
      承诺: c.content,
      到期: c.dueDate,
      状态: commitmentMeta(c.status).label,
      复盘: c.reviewNote || '',
      场次: sessions.find(s => s.id === c.sessionId)?.date || '',
    }));
    download(`pumm-commitments-${today}.csv`, toCSV(data), 'text/csv;charset=utf-8');
  };

  return (
    <div className="space-y-5">
      <SectionTitle right={<Button icon={Download} onClick={exportCSV}>导出 CSV</Button>}>
        承诺追踪 · L 锁诺
      </SectionTitle>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="达成率" value={total ? pct(done / total) : '—'} sub={`${done} / ${total} 条`} />
        <StatCard label="未结" value={open} sub="下场开场要查" />
        <StatCard label="完成" value={done} sub="做到了" />
        <StatCard label="未完成" value={missed} sub="没做到" />
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-thin">
        {FILTERS.map(f => (
          <button
            key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap border transition-colors ${
              filter === f.key
                ? 'bg-pumm-brand text-white border-pumm-brand font-semibold'
                : 'bg-white text-pumm-muted border-pumm-line hover:border-pumm-faint'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="这里空的"
            hint="承诺是在会议运行的「锁诺」那一段产生的：一件事、30 天、下一场开场第一件事就查它。"
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map(c => {
            const meta = commitmentMeta(c.status);
            const d = daysUntil(c.dueDate);
            const overdue = c.status === 'open' && d !== null && d < 0;
            return (
              <div key={c.id} className="bg-white border border-pumm-line rounded-lg p-3.5">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-pumm-ink">{memberName(members, c.memberId)}</span>
                  <Badge color={meta.color}>{meta.label}</Badge>
                  {overdue && <Badge color="#9C3D2E">逾期 {-d} 天</Badge>}
                  {c.status === 'open' && d !== null && d >= 0 && d <= 3 && (
                    <Badge color="#C0843A">{d === 0 ? '今天到期' : `${d} 天后到期`}</Badge>
                  )}
                </div>

                <div className="text-sm text-pumm-ink mt-1.5 leading-snug">{c.content}</div>
                <div className="text-[11px] text-pumm-faint mt-1">到期 {fmtDate(c.dueDate)}</div>

                {c.reviewNote && (
                  <div className="text-xs text-pumm-muted mt-1.5 pl-2 border-l-2 border-pumm-line">
                    复盘：{c.reviewNote}
                  </div>
                )}

                {canReview && (
                  <div className="mt-2.5">
                    {c.status === 'open' ? (
                      <>
                        <input
                          className={inputCls}
                          placeholder="一句话复盘（做到什么／卡在哪）"
                          value={notes[c.id] ?? ''}
                          onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value }))}
                        />
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" tone="ok" icon={Check} onClick={() => review(c, 'done')}>做到了</Button>
                          <Button size="sm" tone="danger" icon={X} onClick={() => review(c, 'missed')}>没做到</Button>
                        </div>
                      </>
                    ) : (
                      <Button size="sm" icon={RotateCcw} onClick={() => review(c, 'open')}>改回未结</Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Hint>
        承诺达成率是四个看板数字里唯一没有硬性目标的 —— 但它最诚实：
        没人真的去做那件事，这张桌子就只是一个聊天群。
      </Hint>
    </div>
  );
}
