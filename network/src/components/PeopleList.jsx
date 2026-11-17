import React, { useMemo, useState } from 'react';
import { Search, ScanLine, Users, MessagesSquare, Orbit } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { matchPerson, SORTS, tierCounts, relDay } from '../lib/logic.js';
import { Avatar, Chip, TierBadge, WorthGem, Spinner, Button, AffinityBar, cx } from './ui.jsx';

export default function PeopleList({ selectedId, onOpen, onScan, onTalk, onGalaxy }) {
  const { people, loading, error, reload } = useStore();
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('all');
  const [sort, setSort] = useState('recent');

  const counts = useMemo(() => tierCounts(people), [people]);
  const list = useMemo(
    () => people.filter((p) => (tier === 'all' || p.tier === tier) && matchPerson(p, q)).sort(SORTS[sort].fn),
    [people, tier, q, sort],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">人脉 <span className="text-base font-normal text-faint">{people.length}</span></h1>
          <div className="flex items-center gap-2">
            {people.length > 0 && onGalaxy && (
              <button onClick={onGalaxy} className="flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-sm font-medium text-ink hover:border-ink/30" title="星系图">
                <Orbit className="h-4 w-4" /><span className="hidden sm:inline lg:hidden xl:inline">星系</span>
              </button>
            )}
            {people.length > 0 && (
              <button onClick={onTalk} className="flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-sm font-medium text-ink hover:border-ink/30 lg:hidden">
                <MessagesSquare className="h-4 w-4" />记对话
              </button>
            )}
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="排序"
              className="rounded-lg border border-line bg-white px-2 py-1 text-sm text-muted">
              {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="找人、公司、资源、商会…"
            className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-[15px] outline-none focus:border-ink/40"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <TierTab active={tier === 'all'} onClick={() => setTier('all')} label="全部" count={people.length} />
          {counts.map((t) => (
            <TierTab key={t.key} active={tier === t.key} onClick={() => setTier(t.key)} label={t.label} count={t.count} cap={t.cap} over={t.over} color={t.color} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28 sm:pb-6">
        {loading && <div className="py-10"><Spinner label="读取中…" /></div>}
        {error && (
          <div className="rounded-xl border border-danger/30 bg-white p-4 text-sm text-danger">
            读取失败：{error}
            <Button size="sm" variant="outline" className="ml-2" onClick={reload}>再试一次</Button>
          </div>
        )}
        {!loading && !error && people.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-line p-8 text-center">
            <Users className="mx-auto h-10 w-10 text-faint" />
            <p className="mt-3 font-medium">还没有人</p>
            <p className="mt-1 text-sm text-muted">下次活动拿到名片，拍一下就进来了。</p>
            <Button variant="accent" className="mt-4" onClick={onScan}><ScanLine className="h-4 w-4" />扫第一张名片</Button>
          </div>
        )}
        {!loading && people.length > 0 && list.length === 0 && <p className="py-10 text-center text-sm text-muted">没有符合的人</p>}
        <ul className="space-y-2">
          {list.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onOpen(p.id)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left transition-colors',
                  selectedId === p.id ? 'border-ink/40 ring-1 ring-ink/10' : 'border-line hover:border-ink/20',
                )}
              >
                <Avatar person={p} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{p.name}</span>
                    <TierBadge tier={p.tier} />
                  </div>
                  <div className="truncate text-sm text-muted">{[p.title, p.company && p.company.name].filter(Boolean).join(' · ') || '—'}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.circles.slice(0, 2).map((c) => <Chip key={c.id} tone="soft" className="!py-0.5 !text-xs">{c.name}</Chip>)}
                    {p.resources.filter((r) => r.kind === 'has').slice(0, 2).map((r) => <Chip key={r.id} tone="has" className="!py-0.5 !text-xs">{r.label}</Chip>)}
                    {p.last_contact_at && <span className="text-xs text-faint">· {relDay(p.last_contact_at)}联系</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <AffinityBar rel={p.rel} compact className="w-24 shrink-0" />
                    <span className="truncate text-[11px]" style={{ color: p.rel.band.color }}>{p.rel.band.label}{p.rel.trend <= -3 ? ' ↓' : p.rel.trend >= 3 ? ' ↑' : ''}</span>
                    {p.rel.overdue && !p.rel.snoozed && <span className="shrink-0 rounded-full bg-danger/10 px-1.5 text-[11px] font-medium text-danger">该联系了</span>}
                  </div>
                </div>
                <WorthGem score={p.worth_score} size={36} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TierTab({ active, onClick, label, count, cap, over, color }) {
  return (
    <button
      onClick={onClick}
      className={cx('shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors', active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink')}
    >
      {color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
      <span className={cx('ml-1 tabular-nums', active ? 'text-white/70' : over ? 'text-danger' : 'text-faint')}>
        {count}{cap ? `/${cap}` : ''}
      </span>
    </button>
  );
}
