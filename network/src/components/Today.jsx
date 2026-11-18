/* ============================================================
   今天该找谁：答应的事 → 刚认识的人 → 太久没联系的 → 在变淡的
   每张卡：为什么、可以聊什么、WhatsApp / 提示卡 / 排进 TickTick / 联系过了 / 晚点再说
   ============================================================ */
import React, { useMemo, useState } from 'react';
import {
  MessageCircle, Sun, CalendarPlus, Send, Check, Clock, Contact, ListChecks, Sparkles, UserPlus, TrendingDown, Hourglass, ScanLine,
} from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { waLink } from '../lib/logic.js';
import { todayActions, ACTION_LABEL, firstName } from '../lib/relation.js';
import { Avatar, AffinityBar, Button, TierBadge, Spinner, useToast, cx } from './ui.jsx';
import ScheduleSheet from './ScheduleSheet.jsx';

const REASON_ICON = { promise: ListChecks, follow: Hourglass, new: UserPlus, overdue: Clock, soon: Clock, cooling: TrendingDown };
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export default function Today({ onOpen, onBrief, onScan, onSend, onCampaigns }) {
  const { people, loading, error, quickContact, snooze } = useStore();
  const toast = useToast();
  const [limit, setLimit] = useState(7);
  const [sched, setSched] = useState(null); // [{person, action}]
  const [menu, setMenu] = useState(null);

  const all = useMemo(() => todayActions(people, { limit: 999 }), [people]);
  const list = all.slice(0, limit);
  const stats = useMemo(() => ({
    promises: all.filter((x) => x.reasons.some((r) => r.kind === 'promise')).length,
    fresh: all.filter((x) => x.reasons.some((r) => r.kind === 'new')).length,
    overdue: people.filter((p) => p.rel.overdue && !p.rel.snoozed).length,
    cooling: all.filter((x) => x.reasons.some((r) => r.kind === 'cooling')).length,
  }), [all, people]);

  const d = new Date();
  const hello = d.getHours() < 12 ? '早安' : d.getHours() < 18 ? '午安' : '晚安';

  async function contacted(item, kind = 'message') {
    try {
      await quickContact(item.person.id, kind);
      toast(`记好了：跟 ${item.person.name} ${kind === 'call' ? '打了电话' : kind === 'meeting' ? '见了面' : '发了讯息'}`);
    } catch (e) { toast(e.message, 'error'); }
  }
  async function later(item, days) {
    setMenu(null);
    try {
      await snooze(item.person.id, days);
      toast(`${item.person.name}：${days} 天后再提醒`);
    } catch (e) { toast(e.message, 'error'); }
  }

  if (loading) return <div className="p-6"><Spinner label="读取中…" /></div>;
  if (error) return <div className="p-6 text-sm text-danger">读取失败：{error}</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-32 pt-4 sm:pb-10">
      <header>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted">{d.getMonth() + 1} 月 {d.getDate()} 日 · 星期{WEEK[d.getDay()]}</div>
          {onCampaigns && people.length > 0 && (
            <button onClick={onCampaigns} className="flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1 text-sm font-medium hover:border-ink/30"><Send className="h-4 w-4" />群发</button>
          )}
        </div>
        <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-semibold tracking-tight"><Sun className="h-6 w-6 text-amber-500" />{hello}，今天找这几个人</h1>
      </header>

      {people.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <Stat label="答应的事" value={stats.promises} tone={stats.promises ? 'plum' : ''} />
          <Stat label="刚认识" value={stats.fresh} />
          <Stat label="该联系了" value={stats.overdue} tone={stats.overdue > 5 ? 'warn' : ''} />
          <Stat label="在变淡" value={stats.cooling} tone={stats.cooling ? 'danger' : ''} />
        </div>
      )}

      {people.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center">
          <Sparkles className="mx-auto h-9 w-9 text-faint" />
          <p className="mt-3 font-medium">还没有人</p>
          <p className="mt-1 text-sm text-muted">扫几张名片、记几段对话，这里每天会告诉你该找谁。</p>
          <Button variant="accent" className="mt-4" onClick={onScan}><ScanLine className="h-4 w-4" />扫名片</Button>
        </div>
      )}

      {people.length > 0 && list.length === 0 && (
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <Check className="mx-auto h-9 w-9 text-plum" />
          <p className="mt-3 font-medium">今天没有要追的</p>
          <p className="mt-1 text-sm text-muted">关系都照顾得很好。可以去「找资源」想想能帮谁。</p>
        </div>
      )}

      {list.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-plum/[0.07] px-3 py-2.5">
          <span className="text-sm text-plum-deep">这 {list.length} 个人：一次写好讯息，或排成连续的时间盒</span>
          <div className="flex flex-wrap gap-1.5">
            {onSend && <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={onSend}><Send className="h-4 w-4" />一次写好讯息</Button>}
            <Button size="sm" variant="accent" className="whitespace-nowrap" onClick={() => setSched(list.map((x) => ({ person: x.person, action: x.action })))}><CalendarPlus className="h-4 w-4" />一键排进 TickTick</Button>
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {list.map((item) => {
          const p = item.person;
          const wa = waLink(p.whatsapp, `Hi ${firstName(p.name)}，`);
          return (
            <li key={p.id} className="rounded-2xl border border-line bg-white p-3.5">
              <div className="flex items-start gap-3">
                <button onClick={() => onOpen(p.id)} className="shrink-0" aria-label={`打开 ${p.name}`}><Avatar person={p} size={48} /></button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onOpen(p.id)} className="truncate text-left font-semibold hover:underline">{p.name}</button>
                    <TierBadge tier={p.tier} />
                    <span className="ml-auto shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-muted">{ACTION_LABEL[item.action]}</span>
                  </div>
                  <div className="truncate text-sm text-muted">{[p.title, p.company && p.company.name].filter(Boolean).join(' · ') || '—'}</div>
                  <AffinityBar rel={p.rel} className="mt-2" />
                </div>
              </div>
              <ul className="mt-3 space-y-1">
                {item.reasons.map((r, i) => {
                  const Icon = REASON_ICON[r.kind] || Clock;
                  return (
                    <li key={i} className={cx('flex gap-1.5 text-[13.5px]', r.kind === 'promise' ? 'font-medium text-plum-deep' : r.kind === 'cooling' ? 'text-danger' : 'text-ink/80')}>
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />{r.text}
                    </li>
                  );
                })}
              </ul>
              {item.topic && <p className="mt-2 rounded-xl bg-ink/[0.03] px-2.5 py-1.5 text-[13px] text-muted">💬 可以聊：{item.topic}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <a
                  href={wa || undefined} target="_blank" rel="noreferrer" aria-disabled={!wa}
                  className={cx('inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-sm font-medium', wa ? 'bg-plum text-white hover:bg-plum-deep' : 'pointer-events-none bg-ink/5 text-faint')}
                ><MessageCircle className="h-4 w-4" />WhatsApp</a>
                <Button size="sm" variant="outline" onClick={() => onBrief(p.id)}><Contact className="h-4 w-4" />提示卡</Button>
                <Button size="sm" variant="outline" onClick={() => setSched([{ person: p, action: item.action }])}><CalendarPlus className="h-4 w-4" />排时间</Button>
                <Button size="sm" variant="outline" onClick={() => contacted(item, item.action === 'call' ? 'call' : item.action === 'meet' ? 'meeting' : 'message')}><Check className="h-4 w-4" />联系过了</Button>
                <div className="relative">
                  <Button size="sm" variant="ghost" onClick={() => setMenu(menu === p.id ? null : p.id)} aria-expanded={menu === p.id}>晚点再说</Button>
                  {menu === p.id && (
                    <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
                      {[[1, '明天'], [3, '3 天后'], [7, '下星期'], [30, '一个月后']].map(([n, l]) => (
                        <button key={n} onClick={() => later(item, n)} className="block w-full px-3 py-2 text-left text-sm hover:bg-ink/5">{l}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {all.length > limit && (
        <div className="text-center">
          <Button variant="ghost" onClick={() => setLimit(limit + 10)}>还有 {all.length - limit} 个人 · 看更多</Button>
          <p className="text-xs text-faint">一天联系 5–7 个人就很好了：质量比数量重要。</p>
        </div>
      )}

      <ScheduleSheet open={!!sched} onClose={() => setSched(null)} items={sched || []} />
    </div>
  );
}

function Stat({ label, value, tone }) {
  const c = { plum: 'text-plum-deep', warn: 'text-amber-700', danger: 'text-danger' }[tone] || 'text-ink';
  return (
    <div className="rounded-2xl border border-line bg-white px-2 py-2 sm:px-3 sm:py-2.5">
      <div className={cx('text-xl font-semibold tabular-nums sm:text-2xl', c)}>{value}</div>
      <div className="truncate text-[11px] text-muted sm:text-xs">{label}</div>
    </div>
  );
}
