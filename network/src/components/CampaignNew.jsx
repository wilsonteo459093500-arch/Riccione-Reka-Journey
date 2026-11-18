/* ============================================================
   第 5 阶段 · 新的群发：选类型 → 选人 → 模板 → 程序先帮每个人写好
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Send, AlertTriangle, ChevronDown, RotateCcw } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TIERS, fmtDate } from '../lib/logic.js';
import { todayActions } from '../lib/relation.js';
import {
  KINDS, KIND_KEYS, LANGS, FESTIVALS, PLACEHOLDERS, ATTENDANCE, ATTENDANCE_KEYS,
  defaultTemplate, draftFor, filterAudience, warningsFor, allTags, festivalCalendar, festivalWhen,
} from '../lib/outreach.js';
import { Avatar, Button, Field, Input, Section, Textarea, TierBadge, useToast, cx } from './ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export default function CampaignNew({ kind: kind0 = 'festival', eventId: event0 = '', occasion: occasion0 = '', onCancel, onCreated }) {
  const store = useStore();
  const toast = useToast();
  const { people, data, me } = store;
  const events = useMemo(() => data.events.slice().sort((a, b) => String(b.held_on || b.created_at).localeCompare(String(a.held_on || a.created_at))), [data.events]);

  const upcoming = useMemo(() => festivalCalendar(Date.now(), 60), []);
  const [kind, setKind] = useState(KINDS[kind0] ? kind0 : 'festival');
  const [eventId, setEventId] = useState(event0 || (kind0 === 'event_follow' && events[0] ? events[0].id : ''));
  const [occasion, setOccasion] = useState(occasion0 || (upcoming[0] ? upcoming[0].label : FESTIVALS[0].label));
  const [invite, setInvite] = useState('');
  const [lang, setLang] = useState('auto');
  const [template, setTemplate] = useState('');
  const [showTpl, setShowTpl] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // 选人
  const [tiers, setTiers] = useState([]);
  const [tags, setTags] = useState([]);
  const [circles, setCircles] = useState([]);
  const [statuses, setStatuses] = useState(kind0 === 'invite' ? [] : ['attended', 'going']);
  const [minAffinity, setMinAffinity] = useState(0);
  const [q, setQ] = useState('');
  const [overrides, setOverrides] = useState(() => new Map());
  const [todayAll, setTodayAll] = useState(false);

  const event = events.find((e) => e.id === eventId) || null;
  const usesEvent = kind === 'event_follow' || kind === 'invite';
  const tagList = useMemo(() => allTags(people).slice(0, 16), [people]);

  const pool = useMemo(() => {
    if (kind === 'today') return todayActions(people, { limit: todayAll ? 999 : 7 }).map((x) => x.person);
    return filterAudience(people, {
      tiers, tags, circles, minAffinity, q,
      event: kind === 'event_follow' && eventId ? { id: eventId, statuses } : null,
    }, { attendance: data.attendance });
  }, [kind, people, tiers, tags, circles, minAffinity, q, eventId, statuses, data.attendance, todayAll]);

  const rows = useMemo(() => pool.map((p) => {
    const warnings = warningsFor(p, data.outreach);
    const blocked = warnings.some((w) => w.block);
    const on = !blocked && (overrides.has(p.id) ? overrides.get(p.id) : !warnings.some((w) => w.skip));
    return { p, warnings, blocked, on };
  }), [pool, data.outreach, overrides]);
  const chosen = rows.filter((r) => r.on);
  const blockedN = rows.filter((r) => r.blocked).length;

  const campaign = { kind, lang, template, occasion: kind === 'festival' ? occasion : '', invite: kind === 'invite' ? invite : '' };
  const preview = chosen[0] ? draftFor({ campaign, person: chosen[0].p, me, event }) : null;

  const autoName = kind === 'event_follow' ? `${event ? event.name : '活动'} 跟进`
    : kind === 'festival' ? `${occasion} 问候`
      : kind === 'invite' ? (event ? `邀请 · ${event.name}` : '邀请')
        : kind === 'today' ? `今日 ${today().slice(5)}` : '群发';

  function toggle(id, on) { setOverrides((m) => new Map(m).set(id, on)); }
  function all(on) { setOverrides(new Map(rows.filter((r) => !r.blocked).map((r) => [r.p.id, on]))); }
  const flip = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function create() {
    if (!chosen.length) return;
    if (kind === 'event_follow' && !eventId) { toast('先选一个活动', 'error'); return; }
    if (kind === 'invite' && !invite.trim() && !event) { toast('写一下邀请的内容（时间、地点、什么活动）', 'error'); return; }
    setBusy(true);
    try {
      const c = await store.createCampaign({
        kind, name: name.trim() || autoName, event_id: usesEvent && eventId ? eventId : null,
        occasion: campaign.occasion, invite: campaign.invite, template, lang, personIds: chosen.map((r) => r.p.id),
      });
      onCreated(c.id);
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 pb-28 pt-4">
      <header className="flex items-center gap-2">
        <button onClick={onCancel} className="rounded-full p-2 hover:bg-ink/5" aria-label="返回"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-semibold">新的群发</h1>
      </header>

      <Section title="1. 发什么">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {KIND_KEYS.map((k) => (
            <button key={k} onClick={() => { setKind(k); setTemplate(''); setOverrides(new Map()); if (k === 'event_follow') setStatuses(['attended', 'going']); }}
              className={cx('rounded-xl border px-3 py-2 text-left', kind === k ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink/30')}>
              <div className="text-sm font-semibold">{KINDS[k].label}</div>
              <div className={cx('mt-0.5 text-[11px] leading-snug', kind === k ? 'text-white/70' : 'text-faint')}>{KINDS[k].hint}</div>
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          {usesEvent && (
            <Field label={kind === 'event_follow' ? '哪个活动' : '邀请来哪个活动（选填：选了的话，发出去的人会进那个活动的名单）'}>
              <select value={eventId} onChange={(e) => { setEventId(e.target.value); setOverrides(new Map()); }} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px]">
                <option value="">{kind === 'event_follow' ? '— 选活动 —' : '— 不连到活动 —'}</option>
                {events.map((e) => <option key={e.id} value={e.id}>{[e.name, fmtDate(e.held_on)].filter(Boolean).join(' · ')}</option>)}
              </select>
              {!events.length && <span className="mt-1 block text-xs text-faint">还没有活动：先到「活动」建一个</span>}
            </Field>
          )}
          {kind === 'festival' && (
            <Field label="哪个节日">
              <div className="flex flex-wrap gap-1.5">
                {FESTIVALS.map((f) => (
                  <button key={f.key} onClick={() => setOccasion(f.label)} className={cx('rounded-full border px-3 py-1 text-sm', occasion === f.label ? 'border-ink bg-ink text-white' : 'border-line bg-white')}>{f.label}</button>
                ))}
              </div>
              <Input className="mt-2" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="或自己打：例 端午节、公司周年" />
              {upcoming.filter((u) => u.label === occasion).slice(0, 1).map((u) => <span key={u.date} className="mt-1 block text-xs text-amber-700">{u.label}{festivalWhen(u)}</span>)}
            </Field>
          )}
          {kind === 'invite' && (
            <Field label="邀请内容（会原文放进每个人的讯息；AI 润色也不会改）" hint={event ? '留空 = 用活动的名字、日期、地点' : ''}>
              <Textarea value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="例：11 月 30 日（六）下午 2 点，溪岸展厅新系列发布会，地址：…" />
            </Field>
          )}
          <Field label="语言">
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px]">
              {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title={`2. 发给谁 · 已选 ${chosen.length} 人`} action={rows.length > 0 && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => all(true)}>全选</Button>
          <Button size="sm" variant="ghost" onClick={() => all(false)}>全不选</Button>
        </div>
      )}>
        {kind === 'today' ? (
          <p className="mb-2 text-sm text-muted">「今日」页上最该联系的人。{!todayAll && <button className="underline" onClick={() => setTodayAll(true)}>看全部该联系的</button>}</p>
        ) : (
          <div className="mb-3 space-y-2">
            {kind === 'event_follow' && eventId && (
              <Chips label="出席状态" items={ATTENDANCE_KEYS.map((k) => [k, ATTENDANCE[k].label])} value={statuses} onToggle={(v) => flip(statuses, setStatuses, v)} />
            )}
            <Chips label="圈层" items={TIERS.map((t) => [t.key, t.label])} value={tiers} onToggle={(v) => flip(tiers, setTiers, v)} />
            {tagList.length > 0 && <Chips label="标签" items={tagList.map((t) => [t.tag, `${t.tag} ${t.count}`])} value={tags} onToggle={(v) => flip(tags, setTags, v)} />}
            {data.circles.length > 0 && <Chips label="商会 / 圈子" items={data.circles.map((c) => [c.id, c.name])} value={circles} onToggle={(v) => flip(circles, setCircles, v)} />}
            <div className="flex gap-2">
              <select value={minAffinity} onChange={(e) => setMinAffinity(Number(e.target.value))} className="rounded-xl border border-line bg-white px-2 text-sm" aria-label="好感度">
                <option value={0}>好感度不限</option>
                <option value={20}>点头之交以上</option>
                <option value={40}>朋友以上</option>
                <option value={60}>好朋友以上</option>
              </select>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="找名字、公司、标签" className="py-2 text-sm" />
            </div>
          </div>
        )}

        {!rows.length && <p className="py-4 text-center text-sm text-faint">没有符合的人</p>}
        <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
          {rows.map(({ p, warnings, blocked, on }) => (
            <li key={p.id}>
              <label className={cx('flex items-center gap-3 py-2', blocked ? 'opacity-50' : 'cursor-pointer')}>
                <input type="checkbox" checked={on} disabled={blocked} onChange={(e) => toggle(p.id, e.target.checked)} className="h-5 w-5 accent-[#22A55B]" />
                <Avatar person={p} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><span className="truncate font-medium">{p.name}</span><TierBadge tier={p.tier} /></div>
                  <div className="truncate text-xs text-muted">{[p.title, p.company && p.company.name].filter(Boolean).join(' · ') || '—'}</div>
                  {warnings.map((w) => (
                    <div key={w.kind} className={cx('flex items-center gap-1 text-xs', w.kind === 'avoid' ? 'text-muted' : 'text-amber-700')}><AlertTriangle className="h-3 w-3 shrink-0" />{w.text}</div>
                  ))}
                </div>
              </label>
            </li>
          ))}
        </ul>
        {blockedN > 0 && <p className="mt-2 text-xs text-faint">{blockedN} 个人没有 WhatsApp 号码，不能发（到人物页补上）</p>}
      </Section>

      <Section title="3. 讯息" action={<Button size="sm" variant="ghost" onClick={() => { setShowTpl((x) => !x); if (!template) setTemplate(defaultTemplate(kind, lang === 'auto' ? 'zh' : lang)); }}>改模板<ChevronDown className={cx('h-4 w-4 transition', showTpl && 'rotate-180')} /></Button>}>
        <p className="text-sm text-muted">程序先帮每个人写一则（不花钱）：叫他的名字，再提一句他在乎的事（他的兴趣、他在找的）。发之前每则都可以改，也可以按「AI 润色」让它更自然。</p>
        {showTpl && (
          <div className="mt-3 space-y-2">
            <Textarea rows={4} value={template} onChange={(e) => setTemplate(e.target.value)} />
            <div className="flex flex-wrap gap-1">
              {PLACEHOLDERS.map(([k, hint]) => (
                <button key={k} title={hint} onClick={() => setTemplate((t) => `${t}${k}`)} className="rounded-full bg-ink/5 px-2 py-0.5 font-mono text-xs">{k}</button>
              ))}
            </div>
            <p className="text-xs text-faint">自己改的模板所有人都用同一个语言。{lang === 'auto' && '（现在是「照名字自动」：要中英文各自的预设模板，就按「用预设」）'}</p>
            <Button size="sm" variant="ghost" onClick={() => { setTemplate(''); setShowTpl(false); }}><RotateCcw className="h-4 w-4" />用预设</Button>
          </div>
        )}
        {preview && (
          <div className="mt-3">
            <div className="mb-1 text-xs text-faint">预览（{chosen[0].p.name}）</div>
            <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-[#DCF8C6] px-3 py-2 text-[15px] text-ink">{preview.text}</div>
            {preview.points.length > 0 && <p className="mt-1 text-xs text-faint">可以提的事：{preview.points.join('、')}</p>}
          </div>
        )}
        <Field label="这次群发叫什么（只有你看得到）" className="mt-3"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName} /></Field>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:left-16">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm text-muted">{chosen.length} 个人 · 每人一则，逐个点开 WhatsApp 发</span>
          <Button variant="accent" busy={busy} disabled={!chosen.length} onClick={create}><Send className="h-4 w-4" />写好 {chosen.length} 则讯息</Button>
        </div>
      </div>
    </div>
  );
}

function Chips({ label, items, value, onToggle }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 pt-1 text-xs text-muted">{label}</span>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {items.map(([k, l]) => (
          <button key={k} onClick={() => onToggle(k)} className={cx('rounded-full border px-2.5 py-0.5 text-[13px]', value.includes(k) ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink')}>{l}</button>
        ))}
      </div>
    </div>
  );
}
