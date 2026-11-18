/* ============================================================
   见面前的提示卡（手机全屏，见面前 30 秒看一眼）
   别聊什么 → 我答应过的 → 上次聊了什么 → 可以聊 → 近况 → 我能给他什么
   不用 AI、不花钱：全部来自已经存好的资料
   ============================================================ */
import React, { useMemo, useState } from 'react';
import {
  ChevronLeft, Ban, ListChecks, Hourglass, MessagesSquare, Gift, Heart, Users, Lightbulb, MessageCircle, CalendarPlus, PenLine, Check,
} from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { waLink, fmtDate, relDay } from '../lib/logic.js';
import { briefFor, firstName } from '../lib/relation.js';
import { MOODS } from '../lib/talk.js';
import { Avatar, AffinityBar, TierBadge, Button, Chip, Spinner, useToast, cx } from './ui.jsx';
import ScheduleSheet from './ScheduleSheet.jsx';

const toneOf = (score) => (score >= 2 ? 'warm' : score >= 1 ? 'positive' : score <= -2 ? 'negative' : score <= -1 ? 'cool' : 'neutral');

export default function BriefCard({ id, onBack, onTalk }) {
  const store = useStore();
  const toast = useToast();
  const raw = store.data.people.find((p) => p.id === id);
  const p = raw ? store.view(raw) : null;
  const b = useMemo(() => (p ? briefFor(p) : null), [p]);
  const [sched, setSched] = useState(false);

  if (!p) return <div className="p-6 text-center text-muted">{store.loading ? <Spinner label="读取中…" /> : '找不到这个人'}</div>;

  const wa = waLink(p.whatsapp, `Hi ${firstName(p.name)}，`);
  const mood = b.last && b.last.mood ? MOODS[b.last.mood.tone || toneOf(b.last.mood.score)] : null;
  const toggle = (x) => store.toggleActionItem(x.interaction, x.index).catch((e) => toast(e.message, 'error'));

  return (
    <div className="mx-auto min-h-full max-w-lg bg-paper px-4 pb-10 pt-3">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="-ml-2 rounded-full p-2 hover:bg-ink/5" aria-label="返回"><ChevronLeft className="h-5 w-5" /></button>
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-faint">见面提示卡</span>
        <span className="w-9" />
      </div>

      <div className="mt-2 overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
        {/* 头 */}
        <div className="flex items-center gap-4 bg-gradient-to-br from-plum/10 to-transparent p-4">
          <Avatar person={p} size={68} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight">{p.name}</h1>
            {p.name_alt && <div className="text-sm text-muted">{p.name_alt}</div>}
            <div className="truncate text-sm text-ink/80">{[p.title, p.company && p.company.name].filter(Boolean).join(' · ')}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <TierBadge tier={p.tier} />
              <span>见过 {p.meetings} 次</span>
              {b.rel.contacted && <span>· 上次 {b.rel.daysSince === 0 ? '今天' : `${b.rel.daysSince} 天前`}</span>}
            </div>
          </div>
        </div>
        <div className="px-4 pb-1 pt-3"><AffinityBar rel={b.rel} /></div>

        <div className="space-y-4 p-4">
          {b.avoid.length > 0 && (
            <Block icon={Ban} title="别聊" tone="danger">
              <div className="flex flex-wrap gap-1.5">{b.avoid.map((x) => <Chip key={x} className="!border-danger/30 !bg-danger/5 !text-danger">{x}</Chip>)}</div>
            </Block>
          )}

          {b.mine.length > 0 && (
            <Block icon={ListChecks} title="我答应过他" tone="plum">
              <ul className="space-y-1">
                {b.mine.map((x) => (
                  <li key={`${x.interaction.id}:${x.index}`}>
                    <label className="flex cursor-pointer gap-2 text-[15px]">
                      <input type="checkbox" checked={false} onChange={() => toggle(x)} className="mt-1 h-4 w-4 accent-[#22A55B]" />
                      <span>{x.item.what}<span className="ml-1 text-xs text-faint">{x.item.due}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {b.theirs.length > 0 && (
            <Block icon={Hourglass} title="他答应过（可以问问进度）">
              <ul className="list-disc space-y-0.5 pl-5 text-[15px]">{b.theirs.map((x) => <li key={`${x.interaction.id}:${x.index}`}>{x.item.what}</li>)}</ul>
            </Block>
          )}

          {b.last && (
            <Block icon={MessagesSquare} title={`上次：${fmtDate(b.last.at)}（${relDay(b.last.at)}）`}>
              <p className="text-[15px]">
                <span className="font-medium">{b.last.title}</span>
                {mood && <span className="ml-1.5 inline-flex items-center gap-1 text-xs" style={{ color: mood.color }}><span className="h-2 w-2 rounded-full" style={{ background: mood.color }} />{mood.label}</span>}
              </p>
              {b.last.summary && <p className="mt-0.5 text-sm leading-relaxed text-muted">{b.last.summary}</p>}
            </Block>
          )}

          {b.topics.length > 0 && (
            <Block icon={MessageCircle} title="可以聊">
              <ul className="space-y-1 text-[15px]">{b.topics.map((t) => <li key={t} className="flex gap-2"><span className="text-plum">•</span>{t}</li>)}</ul>
            </Block>
          )}

          {(b.facts.length > 0 || (p.interests || []).length > 0) && (
            <Block icon={Heart} title="他的近况 / 喜好">
              {(p.interests || []).length > 0 && <div className="mb-1.5 flex flex-wrap gap-1.5">{p.interests.map((x) => <Chip key={x} tone="soft">{x}</Chip>)}</div>}
              <ul className="space-y-0.5 text-sm text-ink/80">{b.facts.map((f) => <li key={f}>{f}</li>)}</ul>
            </Block>
          )}

          {(b.give.length > 0 || b.needs.length > 0) && (
            <Block icon={Gift} title="我能给他什么">
              {b.needs.length > 0 && <p className="mb-1 text-sm text-muted">他需要：{b.needs.join('、')}</p>}
              <ul className="space-y-0.5 text-[15px]">{b.give.map((g) => <li key={g} className="flex gap-2"><span className="text-plum">→</span>{g}</li>)}</ul>
            </Block>
          )}

          {b.circles.length > 0 && (
            <Block icon={Users} title="共同圈子"><p className="text-sm">{b.circles.join('、')}</p></Block>
          )}

          <p className="flex gap-2 rounded-2xl bg-amber-50 p-3 text-[13.5px] text-amber-900"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />{b.tip}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={wa || undefined} target="_blank" rel="noreferrer" aria-disabled={!wa}
          className={cx('flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium', wa ? 'bg-plum text-white' : 'pointer-events-none bg-ink/5 text-faint')}>
          <MessageCircle className="h-4 w-4" />WhatsApp
        </a>
        <Button variant="outline" onClick={() => setSched(true)}><CalendarPlus className="h-4 w-4" />排进 TickTick</Button>
        <Button variant="outline" onClick={async () => { try { await store.quickContact(p.id, 'meeting', '见面'); toast('记好了：见过面'); } catch (e) { toast(e.message, 'error'); } }}><Check className="h-4 w-4" />见过了</Button>
        <Button variant="primary" onClick={onTalk}><PenLine className="h-4 w-4" />见完记对话</Button>
      </div>
      <p className="mt-2 text-center text-xs text-faint">见完按「见完记对话」：语音说一下聊了什么，下次提示卡就更准。</p>

      <ScheduleSheet open={sched} onClose={() => setSched(false)} items={[{ person: p, action: p.tier === 'core' ? 'meet' : 'message' }]} />
    </div>
  );
}

function Block({ icon: Icon, title, tone, children }) {
  const c = { danger: 'text-danger', plum: 'text-plum-deep' }[tone] || 'text-muted';
  return (
    <section>
      <h2 className={cx('mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold', c)}><Icon className="h-4 w-4" />{title}</h2>
      {children}
    </section>
  );
}
