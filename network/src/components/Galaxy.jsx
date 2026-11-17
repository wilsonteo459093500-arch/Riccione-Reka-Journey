/* ============================================================
   星系图（电脑上看；手机也能开）
   中间 = 我；四条轨道 = 核心 5 / 重要 15 / 活跃 50 / 认识 150
   好感度越高越靠近中心、颜色越绿；「值得认识分」越高星星越大；
   该联系了 = 外面一圈红色虚线
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { Search, Orbit } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TIERS, matchPerson, initials } from '../lib/logic.js';
import { galaxyLayout, ORBITS, BANDS, CADENCE_LABEL } from '../lib/relation.js';
import { AffinityBar, TierBadge, Spinner, cx } from './ui.jsx';

const S = 1000; // viewBox 边长

export default function Galaxy({ onOpen }) {
  const { people, loading, me } = useStore();
  const [q, setQ] = useState('');
  const [hover, setHover] = useState(null);
  const [onlyDue, setOnlyDue] = useState(false);
  const nodes = useMemo(() => galaxyLayout(people), [people]);
  const hits = useMemo(() => {
    if (!q.trim() && !onlyDue) return null;
    return new Set(people.filter((p) => (!q.trim() || matchPerson(p, q)) && (!onlyDue || (p.rel.overdue && !p.rel.snoozed))).map((p) => p.id));
  }, [people, q, onlyDue]);
  const counts = useMemo(() => Object.fromEntries(TIERS.map((t) => [t.key, people.filter((p) => p.tier === t.key).length])), [people]);
  const hp = hover && people.find((p) => p.id === hover);

  if (loading) return <div className="p-6"><Spinner label="读取中…" /></div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-4">
        <h1 className="mr-2 flex items-center gap-2 text-xl font-semibold tracking-tight"><Orbit className="h-5 w-5" />星系</h1>
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="亮起来：名字、公司、资源、商会…"
            className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-ink/40" />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} className="accent-[#22A55B]" />只看该联系的
        </label>
        {hits && <span className="text-sm text-faint">{hits.size} 个</span>}
      </div>

      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto block h-full max-h-[calc(100vh-130px)] w-full" role="img" aria-label="人脉星系图">
          <defs>
            <radialGradient id="g-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="60%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="g-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22A55B" stopOpacity=".07" />
              <stop offset="100%" stopColor="#22A55B" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={S / 2} cy={S / 2} r={S / 2} fill="url(#g-bg)" />
          {TIERS.map((t) => (
            <g key={t.key}>
              <circle cx={S / 2} cy={S / 2} r={(ORBITS[t.key] * S) / 2} fill="none" stroke={t.color} strokeOpacity=".28" strokeDasharray="2 6" />
              <text x={S / 2} y={S / 2 - (ORBITS[t.key] * S) / 2 - 6} textAnchor="middle" fontSize="15" fill={t.color} stroke="#F7F5F0" strokeWidth="5" paintOrder="stroke">
                {t.label} {counts[t.key]}/{t.cap} · {CADENCE_LABEL[t.key]}
              </text>
            </g>
          ))}
          {/* 我 */}
          <circle cx={S / 2} cy={S / 2} r="46" fill="url(#g-core)" />
          <circle cx={S / 2} cy={S / 2} r="20" fill="#F59E0B" />
          <text x={S / 2} y={S / 2 + 6} textAnchor="middle" fontSize="16" fontWeight="600" fill="#fff">{initials(me.display_name || '我')}</text>

          {nodes.map((n) => {
            const p = n.person;
            const r = n.size * S;
            const dim = hits && !hits.has(p.id);
            const due = p.rel.overdue && !p.rel.snoozed;
            const label = n.tier === 'core' || n.tier === 'important' || (hits && hits.has(p.id)) || hover === p.id;
            return (
              <g
                key={p.id}
                transform={`translate(${n.x * S} ${n.y * S})`}
                className="cursor-pointer"
                opacity={dim ? 0.15 : 1}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
                onFocus={() => setHover(p.id)}
                onBlur={() => setHover((h) => (h === p.id ? null : h))}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(p.id)}
                tabIndex={0}
                role="link"
                aria-label={`${p.name}，好感度 ${p.rel.affinity}，${p.rel.band.label}`}
              >
                {due && <circle r={r + 7} fill="none" stroke="#B91C1C" strokeOpacity=".6" strokeDasharray="3 3" className="motion-safe:animate-[spin_12s_linear_infinite]" />}
                <circle r={r + (hover === p.id ? 4 : 0)} fill={p.rel.band.color} stroke="#fff" strokeWidth="2.5" />
                {label && (
                  <text y={r + 17} textAnchor="middle" fontSize="14" fill="#1C1917" stroke="#F7F5F0" strokeWidth="4" paintOrder="stroke">{p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name}</text>
                )}
              </g>
            );
          })}
        </svg>

        {hp && (
          <div className="pointer-events-none absolute left-4 top-2 w-64 rounded-2xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2"><span className="truncate font-semibold">{hp.name}</span><TierBadge tier={hp.tier} /></div>
            <div className="truncate text-sm text-muted">{[hp.title, hp.company && hp.company.name].filter(Boolean).join(' · ') || '—'}</div>
            <AffinityBar rel={hp.rel} className="mt-2" />
            <div className="mt-1.5 text-xs text-muted">
              {hp.rel.contacted ? `上次联系 ${hp.rel.daysSince} 天前` : '还没联系过'}
              {hp.rel.overdue && !hp.rel.snoozed && <span className="text-danger"> · 该联系了</span>}
            </div>
          </div>
        )}

        <div className="absolute bottom-3 right-4 flex flex-wrap justify-end gap-x-3 gap-y-1 rounded-xl bg-white/80 px-3 py-2 text-[11px] text-muted backdrop-blur">
          {BANDS.map((b) => <span key={b.key} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.label}</span>)}
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-danger" />该联系了</span>
          <span className={cx('w-full text-right')}>越近中心 = 越熟 · 越大 = 越值得认识</span>
        </div>
      </div>
    </div>
  );
}
