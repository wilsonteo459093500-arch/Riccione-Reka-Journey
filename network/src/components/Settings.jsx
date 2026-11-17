import React, { useEffect, useMemo, useState } from 'react';
import { LogOut, Download, Cloud, HardDrive } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { supabase } from '../lib/supabase.js';
import { monthUsage, tierCounts, DEFAULT_PROFILE } from '../lib/logic.js';
import { Button, Field, Section, Textarea, Input, useToast } from './ui.jsx';
import { Logo, MeaningRow } from './Login.jsx';

const RATE = Number(import.meta.env.VITE_USD_TO_MYR || 4.4);
const BUDGET_MYR = Number(import.meta.env.VITE_AI_MONTHLY_BUDGET_MYR || 50);
const FEATURE = { scan_card: '名片识别', company: '公司背景', assess: '深度分析' };

export default function Settings() {
  const store = useStore();
  const toast = useToast();
  const [f, setF] = useState(store.me);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(store.me), [store.me]);

  const usage = useMemo(() => monthUsage(store.data.ai_usage, new Date(), RATE), [store.data.ai_usage]);
  const pct = Math.min(100, (usage.myr / BUDGET_MYR) * 100);
  const tiers = useMemo(() => tierCounts(store.people), [store.people]);

  async function save() {
    setBusy(true);
    try { await store.saveProfile(f); toast('存好了'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...store.data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `STAR-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 pb-32 pt-4">
      <h1 className="text-xl font-semibold">我</h1>

      <Section title="这个月的 AI 费用">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums">RM{usage.myr.toFixed(2)}</span>
          <span className="text-sm text-muted">预算 RM{BUDGET_MYR}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/5">
          <div className={pct > 85 ? 'h-full bg-danger' : 'h-full bg-plum'} style={{ width: `${pct}%` }} />
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {Object.entries(usage.byFeature).map(([k, v]) => (
            <li key={k} className="flex justify-between"><span className="text-muted">{FEATURE[k] || k} × {v.count}</span><span className="tabular-nums">RM{(v.usd * RATE).toFixed(2)}</span></li>
          ))}
          {!usage.count && <li className="text-faint">这个月还没用</li>}
        </ul>
        <p className="mt-2 text-xs text-faint">按官方价估算（1 USD ≈ RM{RATE}）。超过预算服务器会自动停掉 AI。</p>
      </Section>

      <Section title="圈层">
        <div className="grid grid-cols-4 gap-2 text-center">
          {tiers.map((t) => (
            <div key={t.key} className="rounded-xl bg-ink/5 p-2">
              <div className="text-lg font-semibold tabular-nums" style={{ color: t.over ? '#B91C1C' : t.color }}>{t.count}<span className="text-xs text-faint">/{t.cap}</span></div>
              <div className="text-xs text-muted">{t.label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="我的资料" action={<span className="text-xs text-faint">AI 评分时会参考</span>}>
        <div className="space-y-3">
          <Field label="名字"><Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
          <Field label="我是谁、做什么生意"><Textarea value={f.business} onChange={(e) => setF({ ...f, business: e.target.value })} /></Field>
          <Field label="我有的资源（可以给人的）"><Textarea value={f.offer} onChange={(e) => setF({ ...f, offer: e.target.value })} /></Field>
          <Field label="我缺的 / 想找的"><Textarea value={f.lacking} onChange={(e) => setF({ ...f, lacking: e.target.value })} /></Field>
          <Field label="今年目标"><Textarea rows={2} value={f.goals} onChange={(e) => setF({ ...f, goals: e.target.value })} /></Field>
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={() => setF({ ...f, ...DEFAULT_PROFILE })}>恢复默认</Button>
            <Button busy={busy} onClick={save}>存</Button>
          </div>
        </div>
      </Section>

      <Section title="资料">
        <div className="flex items-center gap-2 text-sm text-muted">
          {store.mode === 'cloud' ? <><Cloud className="h-4 w-4" />云端（Supabase，只有你登入看得到）</> : <><HardDrive className="h-4 w-4" />本机模式：资料只在这个浏览器</>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportJson}><Download className="h-4 w-4" />汇出全部（JSON）</Button>
          {supabase && <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" />登出</Button>}
        </div>
      </Section>

      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <Logo className="h-10 w-10" />
        <div className="text-sm font-semibold tracking-[0.2em]">S.T.A.R</div>
        <div className="text-xs italic text-muted">Strong Ties Are Riches</div>
        <MeaningRow className="mt-1 w-full max-w-xs" />
      </div>
    </div>
  );
}
