/* ============================================================
   要找人帮忙：谁有这个资源？
   不用 AI、不花钱：看他有的资源、职位、公司、行业、商会、标签、备注、对话里提过的人；
   同样有的，关系近的排前面（先付出、再开口：关系还浅的会提醒你先联络感情）
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { Search, HandHelping, MessageCircle, AlertTriangle } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { waLink } from '../lib/logic.js';
import { findHelpers, lackingChips } from '../lib/relation.js';
import { Avatar, AffinityBar, Chip, TierBadge, cx } from './ui.jsx';

const COMMON = ['律师', '会计', '建筑师', '发展商', '银行贷款', '装修师傅', '媒体', '高端客户', '政府', '供应商'];

export default function FindHelp({ onOpen }) {
  const { people, me } = useStore();
  const [q, setQ] = useState('');
  const results = useMemo(() => findHelpers(people, q), [people, q]);
  const mine = useMemo(() => lackingChips(me.lacking), [me.lacking]);
  // 谁「需要」这个（反过来：我可以把人介绍给他）
  const needers = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    return people.filter((p) => p.resources.some((r) => r.kind === 'needs' && r.label.toLowerCase().includes(term))).slice(0, 6);
  }, [people, q]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-32 pt-4 sm:pb-10">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><HandHelping className="h-6 w-6 text-plum" />要找人帮忙</h1>
        <p className="mt-1 text-sm text-muted">打你要找的资源，看谁有、关系够不够开口。</p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="我要找…律师、建筑师、贷款、媒体"
          className="w-full rounded-2xl border border-line bg-white py-3.5 pl-11 pr-3 text-base outline-none focus:border-ink/40"
        />
      </div>

      <div className="space-y-2">
        {mine.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-faint">我缺的：</span>
            {mine.map((c) => <button key={c} onClick={() => setQ(c)}><Chip tone="needs">{c}</Chip></button>)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-faint">常找的：</span>
          {COMMON.map((c) => <button key={c} onClick={() => setQ(c)}><Chip tone={q === c ? 'has' : 'plain'}>{c}</Chip></button>)}
        </div>
      </div>

      {q.trim() && (
        <p className="text-sm text-muted">{results.length ? `${results.length} 个人可能帮得上` : '人脉里还没有。可以问问「超级连接者」（深度分析里「连接」分高的人）有没有认识的。'}</p>
      )}

      <ul className="space-y-2.5">
        {results.map(({ person: p, why, ready }) => {
          const wa = waLink(p.whatsapp);
          return (
            <li key={p.id} className="rounded-2xl border border-line bg-white p-3">
              <div className="flex items-start gap-3">
                <button onClick={() => onOpen(p.id)} className="shrink-0" aria-label={`打开 ${p.name}`}><Avatar person={p} size={44} /></button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onOpen(p.id)} className="truncate text-left font-semibold hover:underline">{p.name}</button>
                    <TierBadge tier={p.tier} />
                  </div>
                  <div className="truncate text-sm text-muted">{[p.title, p.company && p.company.name].filter(Boolean).join(' · ') || '—'}</div>
                  <ul className="mt-1.5 space-y-0.5 text-[13px]">
                    {why.map((w, i) => <li key={i} className="truncate text-ink/80">· {w}</li>)}
                  </ul>
                  <AffinityBar rel={p.rel} compact className="mt-2 max-w-[200px]" />
                  {!ready && (
                    <p className="mt-1.5 flex gap-1 text-[12.5px] text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />关系还浅（{p.rel.band.label}）：先联络感情、先帮他一点，再开口</p>
                  )}
                </div>
                <a href={wa || undefined} target="_blank" rel="noreferrer" aria-label="WhatsApp" aria-disabled={!wa}
                  className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', wa ? 'bg-plum text-white' : 'pointer-events-none bg-ink/5 text-faint')}>
                  <MessageCircle className="h-4 w-4" />
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      {needers.length > 0 && (
        <section className="rounded-2xl border border-dashed border-line p-3">
          <h2 className="text-sm font-medium">反过来：这些人<b>需要</b>「{q.trim()}」</h2>
          <p className="text-xs text-faint">找到了的话，介绍给他们 —— 先付出，是最好的联系理由。</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {needers.map((p) => <button key={p.id} onClick={() => onOpen(p.id)}><Chip tone="needs">{p.name}</Chip></button>)}
          </div>
        </section>
      )}
    </div>
  );
}
