import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { TABLE_RULES, TABLE_STEPS, SESSION_PHASES, ROLES, TABLE, APP_TAGLINE } from '../../constants.js';
import { Card, SectionTitle, Hint, Badge } from '../Shared.jsx';

export default function RulesView() {
  return (
    <div className="space-y-5">
      <SectionTitle>桌规</SectionTitle>

      <Card className="bg-pumm-brand text-white border-pumm-brand">
        <div className="font-display text-lg font-semibold">{APP_TAGLINE}</div>
        <p className="text-sm opacity-85 mt-1.5 leading-relaxed">
          10 位非同业的中小企业老板固定坐一张桌，每月一次半天，轮流把自己公司的真实问题拿上桌。
          给答案的必须是同桌的老板 —— 桌长只控流程，不给答案。
        </p>
      </Card>

      <div>
        <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">桌规</h3>
        <div className="space-y-2">
          {TABLE_RULES.map((r, i) => (
            <div key={i} className="bg-white border border-pumm-line rounded-lg p-3.5">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-pumm-brand text-pumm-gold text-[11px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm text-pumm-ink leading-snug">{r.text}</div>
                  <div className="text-[11px] text-pumm-brass mt-1">{r.enforced}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">TABLE 五步</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {TABLE_STEPS.map(s => (
            <div key={s.key} className="bg-white border border-pumm-line rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-pumm-brand text-pumm-gold text-xs font-semibold flex items-center justify-center flex-shrink-0">
                  {s.key}
                </span>
                <span className="text-sm font-semibold text-pumm-ink">{s.name}</span>
                <Badge color="#B08D4F">{s.metric}</Badge>
              </div>
              <div className="text-[11px] text-pumm-faint mt-1.5">{s.module}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">
          一场会怎么跑（{TABLE.sessionHours} 小时）
        </h3>
        <Card>
          {SESSION_PHASES.map((p, i) => (
            <div key={p.key} className="flex items-start gap-2.5 py-2 border-b border-pumm-line last:border-0">
              <span className="text-xs text-pumm-faint font-mono mt-0.5 w-4 flex-shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-pumm-ink font-medium">
                  {p.name}
                  <span className="text-pumm-brass ml-1.5 text-xs">{p.minutes}′</span>
                </div>
                <div className="text-[11px] text-pumm-muted mt-0.5">{p.hint}</div>
              </div>
            </div>
          ))}
          <Hint>中场休息 15′ 之后换第二位案主，重复 2–5 步。</Hint>
        </Card>
      </div>

      <div>
        <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">谁看得到什么</h3>
        <Card>
          {Object.values(ROLES).map(r => (
            <div key={r.key} className="flex items-start gap-2.5 py-2 border-b border-pumm-line last:border-0">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                style={{ background: r.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-pumm-ink font-medium">{r.label}</div>
                <div className="text-[11px] text-pumm-muted mt-0.5">{r.note}</div>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-2 mt-3 pt-3 border-t border-pumm-line">
            <ShieldCheck className="w-4 h-4 text-pumm-ok flex-shrink-0 mt-0.5" />
            <Hint>
              这不是技术偏好，是信任设计。会员敢不敢在桌上讲真问题，
              取决于理事会看不看得到内容 —— 所以理事会永远只看数字。
            </Hint>
          </div>
        </Card>
      </div>
    </div>
  );
}
