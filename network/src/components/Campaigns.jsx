/* ============================================================
   第 5 阶段 · 群发：开新的 / 以前发过的 / 从回应学到的
   ============================================================ */
import React, { useMemo } from 'react';
import { Send, PartyPopper, CalendarHeart, Mail, Sun, PenLine, ChevronRight, Lightbulb, CalendarDays } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { relDay } from '../lib/logic.js';
import { KINDS, campaignStats, learnings, festivalCalendar, festivalWhen } from '../lib/outreach.js';
import { Section, Spinner, cx } from './ui.jsx';

const ICON = { event_follow: CalendarHeart, festival: PartyPopper, invite: Mail, today: Sun, custom: PenLine };

export default function Campaigns({ onNew, onOpen, onEvents }) {
  const { data, loading } = useStore();
  const list = useMemo(() => data.campaigns.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [data.campaigns]);
  const tips = useMemo(() => learnings(data.outreach, data.campaigns), [data.outreach, data.campaigns]);
  const all = campaignStats(data.outreach);
  const next = useMemo(() => festivalCalendar(Date.now(), 200).slice(0, 5), []);

  if (loading) return <div className="p-6"><Spinner label="读取中…" /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 pb-32 pt-4">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Send className="h-5 w-5" />群发</h1>
        <button onClick={onEvents} className="flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1 text-sm font-medium hover:border-ink/30"><CalendarDays className="h-4 w-4" />活动</button>
      </header>
      <p className="text-sm text-muted">每个人一则不一样的讯息：叫他的名字、提他在乎的事。逐个点开 WhatsApp 自己按发送 —— 免费、不会被封号。</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {['event_follow', 'festival', 'invite', 'today'].map((k) => {
          const Icon = ICON[k];
          return (
            <button key={k} onClick={() => onNew(k)} className="rounded-2xl border border-line bg-white p-3 text-left hover:border-ink/30">
              <Icon className="h-6 w-6 text-plum" />
              <div className="mt-2 font-semibold">{KINDS[k].label}</div>
              <div className="mt-0.5 text-xs leading-snug text-faint">{KINDS[k].hint}</div>
            </button>
          );
        })}
      </div>
      <button onClick={() => onNew('custom')} className="w-full rounded-xl border border-dashed border-line py-2 text-sm text-muted hover:border-ink/30"><PenLine className="mr-1 inline h-4 w-4" />其他：自己写模板</button>

      {next.length > 0 && (
        <Section title={<span className="flex items-center gap-1.5"><PartyPopper className="h-4 w-4 text-amber-500" />接下来的节日</span>}>
          <ul className="divide-y divide-line">
            {next.map((f) => (
              <li key={`${f.key}${f.date}`} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-sm"><b>{f.label}</b> <span className="text-muted">{festivalWhen(f)}</span></span>
                <button onClick={() => onNew('festival', f.label)} className="rounded-lg border border-line bg-white px-2 py-0.5 text-xs font-medium hover:border-ink/30">准备问候</button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">照马来西亚公共假期；标「约」的要看官方公布 / 新月，可能差一天。节日前 3 星期「今日」会提醒。</p>
        </Section>
      )}

      <Section title={<span className="flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-amber-500" />从回应学到的</span>}>
        {all.answered === 0 ? (
          <p className="text-sm text-faint">发了之后在每张卡上点「他怎么回」，这里会算出什么样的讯息比较多人回；AI 润色时也会参考。</p>
        ) : (
          <>
            <p className="text-sm">一共发了 {all.sent} 则，标了 {all.answered} 个回应，回复率 <b>{Math.round(all.rate * 100)}%</b>。</p>
            {tips.length ? (
              <ul className="mt-2 space-y-1">{tips.map((t) => <li key={t.key} className="text-sm text-ink/80">• {t.text}</li>)}</ul>
            ) : (
              <p className="mt-1 text-xs text-faint">每一种至少要有 5 个回应才比较得出来，多发几次就有了。</p>
            )}
          </>
        )}
      </Section>

      <Section title={`发过的 ${list.length}`}>
        {!list.length && <p className="text-sm text-faint">还没有</p>}
        <ul className="divide-y divide-line">
          {list.map((c) => {
            const st = campaignStats(data.outreach.filter((o) => o.campaign_id === c.id));
            const Icon = ICON[c.kind] || PenLine;
            return (
              <li key={c.id}>
                <button onClick={() => onOpen(c.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <Icon className="h-5 w-5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-xs text-muted">{relDay(c.created_at)} · 已发 {st.sent} / {st.total - st.skipped}{st.rate != null && ` · 回复率 ${Math.round(st.rate * 100)}%`}</div>
                  </div>
                  {st.left > 0 && <span className={cx('rounded-full bg-plum/10 px-2 py-0.5 text-xs text-plum-deep')}>还有 {st.left}</span>}
                  <ChevronRight className="h-4 w-4 text-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
