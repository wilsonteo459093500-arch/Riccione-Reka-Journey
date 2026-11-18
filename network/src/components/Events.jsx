/* ============================================================
   第 5 阶段 · 活动：名单（邀请了 / 会来 / 出席了 / 没来）+ 邀请群发 / 活动后跟进
   扫活动二维码的人（第 4 阶段）会自动出现在「出席了」
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, CalendarPlus, ChevronRight, Mail, CalendarHeart, QrCode, Trash2, UserPlus, X, Search } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { fmtDate, matchPerson } from '../lib/logic.js';
import { ATTENDANCE, ATTENDANCE_KEYS, eventRoster, campaignStats } from '../lib/outreach.js';
import { Avatar, Button, Field, Input, Section, Spinner, useToast, cx } from './ui.jsx';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function EventList({ onOpen, onBack }) {
  const store = useStore();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', held_on: todayStr(), location: '' });
  const events = useMemo(() => store.data.events.slice().sort((a, b) => String(b.held_on || b.created_at).localeCompare(String(a.held_on || a.created_at))), [store.data.events]);
  const count = (id, st) => store.data.attendance.filter((a) => a.event_id === id && a.status === st).length;

  async function add() {
    if (!f.name.trim()) return;
    try {
      const ev = await store.saveEvent(f);
      setAdding(false);
      setF({ name: '', held_on: todayStr(), location: '' });
      onOpen(ev.id);
    } catch (e) { toast(e.message, 'error'); }
  }

  if (store.loading) return <div className="p-6"><Spinner label="读取中…" /></div>;
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 pb-32 pt-4">
      <header className="flex items-center gap-2">
        {onBack && <button onClick={onBack} className="rounded-full p-2 hover:bg-ink/5" aria-label="返回"><ArrowLeft className="h-5 w-5" /></button>}
        <h1 className="flex-1 text-xl font-semibold">活动</h1>
        <Button size="sm" variant="outline" onClick={() => setAdding((x) => !x)}><CalendarPlus className="h-4 w-4" />新活动</Button>
      </header>
      <p className="text-sm text-muted">我办的、我去的活动都可以建：邀请谁、谁会来、谁出席了。出席了算一次见面（好感度加分）；活动完一键跟进。</p>
      {adding && (
        <div className="space-y-2 rounded-2xl border border-line bg-white p-3">
          <Field label="活动名"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="例：BNI 早餐会、溪岸展厅开放日" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="日期"><Input type="date" value={f.held_on} onChange={(e) => setF({ ...f, held_on: e.target.value })} /></Field>
            <Field label="地点"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>取消</Button><Button size="sm" onClick={add} disabled={!f.name.trim()}>建好</Button></div>
        </div>
      )}
      {!events.length && !adding && <p className="py-8 text-center text-sm text-faint">还没有活动</p>}
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id}>
            <button onClick={() => onOpen(e.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left hover:border-ink/30">
              <div className="w-12 shrink-0 text-center">
                <div className="text-[11px] text-muted">{e.held_on ? `${Number(String(e.held_on).slice(5, 7))} 月` : ''}</div>
                <div className="text-xl font-semibold tabular-nums">{e.held_on ? Number(String(e.held_on).slice(8, 10)) : '—'}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.name}</div>
                <div className="truncate text-xs text-muted">{[e.location, ATTENDANCE_KEYS.map((k) => count(e.id, k) && `${ATTENDANCE[k].label} ${count(e.id, k)}`).filter(Boolean).join(' · ')].filter(Boolean).join(' · ') || '还没有人'}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-faint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EventDetail({ id, onBack, onOpenPerson, onSend, onOpenCampaign, onCard }) {
  const store = useStore();
  const toast = useToast();
  const ev = store.data.events.find((e) => e.id === id);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(null);
  const [q, setQ] = useState('');
  const roster = useMemo(() => (ev ? eventRoster(ev, store.data.attendance, store.people) : []), [ev, store.data.attendance, store.people]);
  const inList = new Set(roster.map((r) => r.person_id));
  const matches = q.trim() ? store.people.filter((p) => !inList.has(p.id) && matchPerson(p, q)).slice(0, 8) : [];
  const campaigns = store.data.campaigns.filter((c) => c.event_id === id);
  const past = ev && ev.held_on && ev.held_on <= todayStr();

  if (store.loading) return <div className="p-6"><Spinner label="读取中…" /></div>;
  if (!ev) return <div className="p-6 text-sm text-muted">找不到这个活动 <Button size="sm" variant="ghost" onClick={onBack}>返回</Button></div>;

  const run = (p) => p.catch((e) => toast(e.message, 'error'));
  async function saveInfo() {
    await run(store.saveEvent({ ...ev, ...f }));
    setEdit(false);
  }
  async function addPerson(p) {
    await run(store.setAttendance(ev.id, p.id, past ? 'attended' : 'invited'));
    setQ('');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 pb-32 pt-4">
      <header className="flex items-start gap-2">
        <button onClick={onBack} className="rounded-full p-2 hover:bg-ink/5" aria-label="返回"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{ev.name}</h1>
          <div className="text-sm text-muted">{[fmtDate(ev.held_on), ev.location].filter(Boolean).join(' · ')}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setF({ name: ev.name, held_on: ev.held_on || '', location: ev.location || '', notes: ev.notes || '' }); setEdit((x) => !x); }}>改</Button>
      </header>

      {edit && f && (
        <div className="space-y-2 rounded-2xl border border-line bg-white p-3">
          <Field label="活动名"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="日期"><Input type="date" value={f.held_on} onChange={(e) => setF({ ...f, held_on: e.target.value })} /></Field>
            <Field label="地点"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          </div>
          <div className="flex justify-between">
            <Button size="sm" variant="danger" onClick={async () => { if (window.confirm('删掉这个活动？（人不会删，只删名单）')) { await store.deleteEvent(ev.id); onBack(); } }}><Trash2 className="h-4 w-4" />删掉活动</Button>
            <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setEdit(false)}>取消</Button><Button size="sm" onClick={saveInfo} disabled={!f.name.trim()}>存</Button></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => onSend('invite', ev.id)}><Mail className="h-4 w-4" />邀请群发</Button>
        <Button variant="accent" onClick={() => onSend('event_follow', ev.id)}><CalendarHeart className="h-4 w-4" />活动后跟进</Button>
      </div>
      <button onClick={onCard} className="flex w-full items-center gap-2 text-left text-sm text-muted hover:text-ink"><QrCode className="h-4 w-4" />这个活动的专属二维码：在「我的名片 → 活动模式」（扫码的人自动记成出席了）</button>

      <Section title={`名单 ${roster.length}`}>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="加人：打名字、公司…" className="pl-9" />
        </div>
        {matches.length > 0 && (
          <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
            {matches.map((p) => (
              <li key={p.id}>
                <button onClick={() => addPerson(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink/5">
                  <UserPlus className="h-4 w-4 text-plum" /><span className="flex-1 truncate">{p.name}</span><span className="text-xs text-muted">{past ? '加成出席了' : '加成邀请了'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
          {ATTENDANCE_KEYS.map((k) => <span key={k} className={cx('rounded-full px-2 py-0.5', ATTENDANCE[k].tone)}>{ATTENDANCE[k].label} {roster.filter((r) => r.status === k).length}</span>)}
        </div>
        {!roster.length && <p className="text-sm text-faint">还没有人。上面打名字加人，或用「邀请群发」。</p>}
        <ul className="divide-y divide-line">
          {roster.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex items-center gap-2">
                <button onClick={() => onOpenPerson(r.person.id)}><Avatar person={r.person} size={34} /></button>
                <button onClick={() => onOpenPerson(r.person.id)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">{r.person.name}</button>
                <button onClick={() => run(store.removeAttendance(r))} className="rounded-full p-1 text-faint hover:bg-ink/5" aria-label="从名单拿掉"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-1 grid grid-cols-4 gap-1 pl-11">
                {ATTENDANCE_KEYS.map((k) => (
                  <button key={k} onClick={() => r.status !== k && run(store.setAttendance(ev.id, r.person_id, k))}
                    className={cx('rounded-lg py-1 text-xs', r.status === k ? `${ATTENDANCE[k].tone} font-semibold ring-1 ring-current` : 'bg-white text-faint ring-1 ring-line')}>{ATTENDANCE[k].label}</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {campaigns.length > 0 && (
        <Section title="这个活动的群发">
          <ul className="divide-y divide-line">
            {campaigns.map((c) => {
              const st = campaignStats(store.data.outreach.filter((o) => o.campaign_id === c.id));
              return (
                <li key={c.id}>
                  <button onClick={() => onOpenCampaign(c.id)} className="flex w-full items-center gap-2 py-2 text-left">
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted">已发 {st.sent} / {st.total - st.skipped}</span>
                    <ChevronRight className="h-4 w-4 text-faint" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
