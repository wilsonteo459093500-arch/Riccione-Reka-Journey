import React, { useMemo } from 'react';
import { BellRing, Inbox, MessageSquare } from 'lucide-react';
import { buildReminders } from '../../utils.js';
import { Card, Badge, EmptyState, SectionTitle, CopyButton, Notice } from '../Shared.jsx';

// 规格第 6 节的五条自动提醒。
//
// 第一版没有服务器，所以这里做的是「今天该发什么」的自动计算：
// 系统算好该发给谁、发什么字，桌长按一下复制，贴进 WhatsApp 群。
// 这样规则是自动的，送达还是人工 —— 诚实地讲，就是半自动。
export default function RemindersView({ snapshot }) {
  const reminders = useMemo(() => buildReminders(snapshot), [snapshot]);

  const urgent = reminders.filter(r => r.level === 'urgent');
  const normal = reminders.filter(r => r.level !== 'urgent');

  return (
    <div className="space-y-5">
      <SectionTitle>提醒</SectionTitle>

      <Notice tone="info" icon={MessageSquare}>
        <strong>半自动</strong>：规则由系统算，讯息由你发 ——
        每条都附好文案，按「复制」贴进 WhatsApp 就行。
        想升级成每天早上 9 点全自动发送，照 DEPLOY.md 第 7 节接上
        WhatsApp Cloud API（约 30 分钟，函数已写好）。
      </Notice>

      {reminders.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="今天没有要发的提醒"
            hint="会前 7 天／1 天、会后当天案例未填、承诺到期前 3 天、缺席第 2 次、年费到期前 30 天 —— 触发了才会出现在这里。"
          />
        </Card>
      ) : (
        <>
          {urgent.length > 0 && (
            <Group title="要紧的" items={urgent} />
          )}
          {normal.length > 0 && (
            <Group title="一般" items={normal} />
          )}
        </>
      )}

      <Card>
        <div className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold mb-2">规则表</div>
        {[
          ['会前 7 天 / 1 天', '向全体会员发出席确认'],
          ['会后当天', 'Case Record 未填 → 提醒记录员'],
          ['承诺到期前 3 天', '提醒案主'],
          ['同一会员缺席第 2 次', '通知桌长'],
          ['年费到期前 30 天', '提醒续会'],
        ].map(([trigger, action]) => (
          <div key={trigger} className="flex items-start gap-2 py-1.5 border-b border-pumm-line last:border-0">
            <span className="text-xs text-pumm-brass w-32 flex-shrink-0">{trigger}</span>
            <span className="text-xs text-pumm-ink">{action}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Group({ title, items }) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">{title} · {items.length}</h3>
      <div className="space-y-2">
        {items.map(r => (
          <div key={r.id} className="bg-white border border-pumm-line rounded-lg p-3.5">
            <div className="flex items-start gap-2.5">
              <BellRing
                className={`w-4 h-4 flex-shrink-0 mt-0.5 ${r.level === 'urgent' ? 'text-pumm-danger' : 'text-pumm-brass'}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-pumm-ink">{r.title}</span>
                  {r.level === 'urgent' && <Badge color="#9C3D2E">要紧</Badge>}
                </div>
                <div className="text-xs text-pumm-muted mt-1 leading-relaxed">{r.detail}</div>
                {r.audience && (
                  <div className="text-[11px] text-pumm-faint mt-1">发给：{r.audience}</div>
                )}
                <div className="mt-2 bg-pumm-tint border border-pumm-line rounded p-2.5">
                  <pre className="whitespace-pre-wrap text-xs text-pumm-ink leading-relaxed font-sans">{r.copyText}</pre>
                </div>
              </div>
              <CopyButton text={r.copyText} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
