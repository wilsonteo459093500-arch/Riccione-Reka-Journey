/* ============================================================
   第 5 阶段 · 一次群发：每个人一张卡 → 改一改 → 点开 WhatsApp 发 → 记他怎么回
   ============================================================ */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, MessageCircle, Sparkles, Copy, SkipForward, Undo2, MessagesSquare, Ban, RotateCcw, Trash2, Shuffle, Check,
} from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { relDay } from '../lib/logic.js';
import {
  KINDS, RESPONSES, RESPONSE_KEYS, RSVP, campaignStats, sendLink, talkingPoints, warningsFor, estimatePolishMyr,
} from '../lib/outreach.js';
import { Avatar, Button, Input, Textarea, TierBadge, Spinner, useToast, cx } from './ui.jsx';

const RATE = Number(import.meta.env.VITE_USD_TO_MYR || 4.4);

export default function CampaignRun({ id, onBack, onOpen, onTalk }) {
  const store = useStore();
  const toast = useToast();
  const { data, people, loading } = store;
  const campaign = data.campaigns.find((c) => c.id === id);
  const rows = useMemo(() => data.outreach.filter((o) => o.campaign_id === id), [data.outreach, id]);
  const stats = campaignStats(rows);
  const [tab, setTab] = useState('draft');
  const [polishing, setPolishing] = useState(null);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const event = campaign && campaign.event_id ? data.events.find((e) => e.id === campaign.event_id) : null;

  // 全部发完 → 跳到「已发」记回应
  useEffect(() => { if (tab === 'draft' && stats.total && !stats.left && stats.sent) setTab('sent'); }, [tab, stats.total, stats.left, stats.sent]);

  if (loading) return <div className="p-6"><Spinner label="读取中…" /></div>;
  if (!campaign) return <div className="p-6 text-sm text-muted">找不到这次群发 <Button size="sm" variant="ghost" onClick={onBack}>返回</Button></div>;

  const list = rows
    .filter((o) => o.status === tab)
    .sort((a, b) => (tab === 'sent' ? String(b.sent_at).localeCompare(String(a.sent_at)) : String(byId.get(a.person_id)?.name || '').localeCompare(String(byId.get(b.person_id)?.name || ''))));
  const toPolish = rows.filter((o) => o.status === 'draft' && !o.polished);
  const cost = estimatePolishMyr(toPolish.length, RATE);

  async function polish() {
    setPolishing([0, toPolish.length]);
    try {
      const n = await store.polishCampaign(id, toPolish.map((o) => o.id), (done, total) => setPolishing([done, total]));
      toast(`AI 润色好了 ${n} 则，发之前还是看一眼`);
    } catch (e) { toast(e.message, 'error'); } finally { setPolishing(null); }
  }
  async function redraft() {
    if (!window.confirm('照模板重写还没发的讯息？（手改过、AI 润色过的会被盖掉）')) return;
    try { await store.redraftCampaign(id); toast('重写好了'); } catch (e) { toast(e.message, 'error'); }
  }
  async function remove() {
    if (!window.confirm('删掉这次群发？（已经发出的讯息还是会留在每个人的互动记录里）')) return;
    await store.deleteCampaign(id);
    onBack();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 pb-32 pt-4">
      <header className="flex items-start gap-2">
        <button onClick={onBack} className="rounded-full p-2 hover:bg-ink/5" aria-label="返回"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{campaign.name}</h1>
          <div className="text-sm text-muted">{[KINDS[campaign.kind] && KINDS[campaign.kind].label, event && event.name, relDay(campaign.created_at)].filter(Boolean).join(' · ')}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={remove} aria-label="删掉"><Trash2 className="h-4 w-4" /></Button>
      </header>

      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="flex items-baseline justify-between text-sm">
          <span><b className="text-lg tabular-nums">{stats.sent}</b> / {stats.total - stats.skipped} 已发</span>
          <span className="text-muted">{stats.rate == null ? '发了之后记一下他怎么回' : `回复率 ${Math.round(stats.rate * 100)}%（标了 ${stats.answered} 个）`}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/5"><div className="h-full bg-plum" style={{ width: `${stats.total ? (stats.sent / Math.max(1, stats.total - stats.skipped)) * 100 : 0}%` }} /></div>
      </div>

      {tab === 'draft' && stats.left > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-violet-50 px-3 py-2.5">
          <Sparkles className="h-4 w-4 text-violet-700" />
          <span className="flex-1 text-sm text-violet-900">
            {toPolish.length ? <>AI 润色 {toPolish.length} 则：读起来更自然、每则不一样（Haiku，约 RM{cost < 0.01 ? '0.01' : cost.toFixed(2)}）</> : '都润色过了'}
          </span>
          {toPolish.length > 0 && <Button size="sm" variant="outline" busy={!!polishing} onClick={polish}>{polishing ? `${polishing[0]} / ${polishing[1]}` : 'AI 润色'}</Button>}
          <Button size="sm" variant="ghost" onClick={redraft} title="照模板重写还没发的"><RotateCcw className="h-4 w-4" /></Button>
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
        {[['draft', `待发 ${stats.left}`], ['sent', `已发 ${stats.sent}`], ['skipped', `跳过 ${stats.skipped}`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('flex-1 rounded-lg py-1.5 text-sm font-medium', tab === k ? 'bg-white shadow-sm' : 'text-muted')}>{l}</button>
        ))}
      </div>

      {tab === 'draft' && stats.left > 0 && <p className="text-xs text-faint">按「WhatsApp」会打开跟他的对话、讯息已经填好，你在 WhatsApp 按发送；回来这里就记成「已发」。</p>}
      {!list.length && <p className="py-8 text-center text-sm text-faint">{tab === 'draft' ? (stats.total ? '都发完了 👏 到「已发」记一下大家怎么回' : '没有人') : '没有'}</p>}

      <ul className="space-y-3">
        {list.map((row) => {
          const p = byId.get(row.person_id);
          if (!p) return null;
          return (
            <li key={row.id}>
              {row.status === 'draft' && <DraftCard row={row} person={p} onOpen={onOpen} />}
              {row.status === 'sent' && <SentCard row={row} person={p} campaign={campaign} onOpen={onOpen} onTalk={onTalk} />}
              {row.status === 'skipped' && (
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
                  <Avatar person={p} size={36} />
                  <span className="flex-1 font-medium">{p.name}</span>
                  <Button size="sm" variant="outline" onClick={() => store.skipOutreach(row, false)}>放回待发</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Head({ person, onOpen, children }) {
  return (
    <div className="flex items-start gap-3">
      <button onClick={() => onOpen(person.id)} aria-label={`打开 ${person.name}`}><Avatar person={person} size={40} /></button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <button onClick={() => onOpen(person.id)} className="truncate font-semibold hover:underline">{person.name}</button>
          <TierBadge tier={person.tier} />
        </div>
        <div className="truncate text-xs text-muted">{[person.title, person.company && person.company.name].filter(Boolean).join(' · ') || '—'}</div>
      </div>
      {children}
    </div>
  );
}

function DraftCard({ row, person, onOpen }) {
  const store = useStore();
  const toast = useToast();
  const [text, setText] = useState(row.text);
  useEffect(() => setText(row.text), [row.text]);
  const points = talkingPoints(person, row.lang || 'zh');
  const warnings = warningsFor(person, store.data.outreach, { campaignId: row.campaign_id }).filter((w) => w.kind !== 'no_wa');
  const link = sendLink(person, text);

  async function save() {
    if (text !== row.text) await store.editOutreach(row, { text }).catch((e) => toast(e.message, 'error'));
  }
  async function sent() {
    try {
      if (text !== row.text) await store.editOutreach(row, { text });
      await store.markSent({ ...row, text });
    } catch (e) { toast(e.message, 'error'); }
  }
  async function nextTopic() {
    const i = points.indexOf(row.topic);
    const next = !row.topic ? 0 : i + 1 >= points.length ? -1 : i + 1;
    await store.changeTopic(row, next).catch((e) => toast(e.message, 'error'));
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <Head person={person} onOpen={onOpen}>{row.polished && <span className="flex items-center gap-0.5 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-800"><Sparkles className="h-3 w-3" />AI</span>}</Head>
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5">{warnings.map((w) => <li key={w.kind} className={cx('text-xs', w.kind === 'avoid' ? 'text-danger' : 'text-amber-700')}>⚠ {w.text}</li>)}</ul>
      )}
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} className="mt-2 bg-[#F4FBEF] text-[15px]" aria-label={`给 ${person.name} 的讯息`} />
      {points.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>提到：{row.topic || '（没提）'}</span>
          <button onClick={nextTopic} className="inline-flex items-center gap-0.5 rounded-full bg-ink/5 px-2 py-0.5"><Shuffle className="h-3 w-3" />{!row.topic ? '提他的事' : points.indexOf(row.topic) + 1 >= points.length ? '不提' : '换一个'}</button>
          <span className="text-faint">他的：{points.join('、')}</span>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <a href={link || undefined} target="_blank" rel="noreferrer" onClick={() => link && setTimeout(sent, 0)} aria-disabled={!link}
          className={cx('inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold', link ? 'bg-[#25D366] text-white hover:bg-[#1EBE5A]' : 'pointer-events-none bg-ink/5 text-faint')}>
          <MessageCircle className="h-4 w-4" />WhatsApp
        </a>
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(text).then(() => toast('复制了'), () => {}); }}><Copy className="h-4 w-4" />复制</Button>
        <Button size="sm" variant="outline" onClick={sent} title="用别的方式发了（例：自己在 WhatsApp 打的）"><Check className="h-4 w-4" />已发</Button>
        <Button size="sm" variant="ghost" onClick={() => store.skipOutreach(row)}><SkipForward className="h-4 w-4" />跳过</Button>
      </div>
    </div>
  );
}

function SentCard({ row, person, campaign, onOpen, onTalk }) {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(row.response_note || '');
  const [avoid, setAvoid] = useState('');
  const run = (p) => p.catch((e) => toast(e.message, 'error'));

  async function addAvoid() {
    const t = avoid.trim();
    if (!t) return;
    await run(store.addAvoid(person.id, t));
    setAvoid('');
    toast(`记住了：跟 ${person.name} 别聊「${t}」`);
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <Head person={person} onOpen={onOpen}><span className="shrink-0 text-xs text-faint">{relDay(row.sent_at)}发</span></Head>
      <button onClick={() => setOpen((x) => !x)} className={cx('mt-2 block w-full whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-3 py-2 text-left text-[14px] text-ink/80', !open && 'line-clamp-2')}>{row.text}</button>

      <div className="mt-3 text-xs font-medium text-muted">他怎么回？</div>
      <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
        {RESPONSE_KEYS.map((k) => (
          <button key={k} onClick={() => run(store.setResponse(row, k))}
            className={cx('whitespace-nowrap rounded-xl border px-1 py-1.5 text-[13px]', row.response === k ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink/30')}>
            <span className="mr-0.5">{RESPONSES[k].emoji}</span>{RESPONSES[k].label}
          </button>
        ))}
      </div>

      {campaign.kind === 'invite' && (
        <>
          <div className="mt-2 text-xs font-medium text-muted">会来吗？{campaign.event_id ? '（会更新活动名单）' : ''}</div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {Object.entries(RSVP).map(([k, v]) => (
              <button key={k} onClick={() => run(store.setRsvp(row, k))} className={cx('rounded-xl border py-1.5 text-[13px]', row.rsvp === k ? 'border-plum bg-plum text-white' : 'border-line bg-white')}>{v.label}</button>
            ))}
          </div>
        </>
      )}

      {row.response && (
        <div className="mt-2 flex gap-1.5">
          <Input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (row.response_note || '') && run(store.setResponse(row, row.response, note))} placeholder="他回了什么（选填，一句话）" className="py-1.5 text-sm" />
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <Input value={avoid} onChange={(e) => setAvoid(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAvoid()} placeholder="别再提…（例：生意、政治）" className="py-1.5 text-sm" />
        <Button size="sm" variant="outline" className="shrink-0 whitespace-nowrap" onClick={addAvoid} disabled={!avoid.trim()}><Ban className="h-4 w-4" />记住</Button>
      </div>
      {(person.avoid_topics || []).length > 0 && <p className="mt-1 text-xs text-danger">别聊：{person.avoid_topics.join('、')}</p>}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => onTalk(person.id)} title="他回了很多、聊开了：汇出 WhatsApp 对话让 AI 整理"><MessagesSquare className="h-4 w-4" />聊开了 · 导入对话</Button>
        <Button size="sm" variant="ghost" onClick={() => { if (window.confirm('撤回「已发」？（WhatsApp 那边的讯息要自己删）')) run(store.undoSent(row)); }}><Undo2 className="h-4 w-4" />撤回</Button>
      </div>
    </div>
  );
}
