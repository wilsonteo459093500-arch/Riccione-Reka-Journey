import React, { useMemo, useState } from 'react';
import { Split, Clock } from 'lucide-react';
import { Card, Btn, Tag, CopyBtn, DownloadBtn, Field, IssueList } from './ui/Bits.jsx';
import { platformById } from '../constants.js';
import { shortsPrompt } from '../prompts/shorts.js';
import { generateJSON } from '../services/gemini.js';
import { auditShorts, shortsCoverage, toShortsGuide } from '../services/shorts.js';
import { withOutputTimes, planDuration } from '../services/exporters.js';

/**
 * 再切 —— 主片剪完，从它里面再榨出 N 支。
 *
 * 这是设计师身上最重的一段重复劳动：素材、调色、字幕轴全部已经做过一遍，
 * 但要出 5 支短的，通常等于把整个流程再走 5 次。
 * 其实只需要决定「切哪几刀、换什么开场」—— 剩下的都是现成的。
 */
export default function RecutPanel({ settings, notify, plan, recipe, platformId, onOpenSettings }) {
  const [count, setCount] = useState(5);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const timed = useMemo(() => withOutputTimes(plan?.timeline || []), [plan]);
  const total = useMemo(() => planDuration(plan?.timeline || []), [plan]);
  const p = platformById(platformId);

  const issues = useMemo(() => (result ? auditShorts(result, total) : []), [result, total]);
  const cov = useMemo(() => (result ? shortsCoverage(result, total) : null), [result, total]);
  const forId = (id) => issues.filter((i) => i.ref === id);

  const guide = useMemo(
    () => (result ? toShortsGuide(result, { total, platformId, masterName: 'final.mp4' }) : ''),
    [result, total, platformId]
  );

  async function run() {
    if (!settings.apiKey) return onOpenSettings();
    setBusy(true);
    try {
      const out = await generateJSON(
        settings,
        [{ text: shortsPrompt({ plan, timed, recipe, total, count, platformId, settings }) }],
        { temperature: 0.8 }
      );
      setResult(out);
      const bad = auditShorts(out, total).filter((i) => i.level === 'error').length;
      notify({
        type: bad ? 'warn' : 'ok',
        text: bad
          ? `切出 ${out.shorts?.length || 0} 支，但有 ${bad} 处硬伤 —— 时间码错了会直接裁出废片`
          : `切出 ${out.shorts?.length || 0} 支，可以直接裁`,
      });
    } catch (err) {
      notify({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!plan?.timeline?.length) return null;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5">
          <Split size={16} className="text-sail-brown" />
          再切 · 一条主片榨出多支
        </span>
      }
      sub={`主片 ${total.toFixed(1)}s —— 素材、调色、字幕轴都做过了，切片只需要决定切哪几刀、换什么开场`}
      right={
        result ? (
          <div className="flex gap-2">
            <DownloadBtn filename="再切出片单.md" text={guide} mime="text/markdown" label="下载出片单" />
            <Btn size="sm" variant="soft" busy={busy} onClick={run}>
              重切
            </Btn>
          </div>
        ) : null
      }
    >
      {!result ? (
        <div className="space-y-3">
          <p className="text-xs text-sail-muted leading-relaxed">
            真正吃时间的从来不是创意,是重复劳动。这一支主片里的素材、调色、字幕时间轴已经全部做完了 ——
            要再出几支短的,<strong className="text-sail-ink">不该把整个流程再走一遍</strong>。
          </p>
          <Field label={`切几支：${count}`}>
            <input
              type="range"
              min={2}
              max={8}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-sail-green-deep"
            />
          </Field>
          <Btn className="w-full" busy={busy} icon={busy ? undefined : Split} onClick={run}>
            {busy ? '正在切…' : `从这条主片再切 ${count} 支`}
          </Btn>
        </div>
      ) : (
        <div className="space-y-3">
          {result.read && <p className="text-sm text-sail-muted leading-relaxed">{result.read}</p>}

          {cov && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sail-muted tabular-nums">
              <span>
                主片被用掉 <strong className="text-sail-ink">{Math.round(cov.ratio * 100)}%</strong>
              </span>
              <span>
                产出合计 <strong className="text-sail-ink">{cov.totalOutput.toFixed(0)}s</strong>
              </span>
              <span>
                <strong className="text-sail-ink">{cov.count}</strong> 支
              </span>
            </div>
          )}

          <IssueList issues={issues} />

          <div className="space-y-2">
            {(result.shorts || []).map((s) => {
              const from = Number(s.from_s);
              const to = Number(s.to_s);
              const dur = to - from;
              const bad = forId(s.id);
              const hasErr = bad.some((b) => b.level === 'error');
              const okTime = Number.isFinite(from) && Number.isFinite(to) && to > from;
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border p-3 ${hasErr ? 'border-sail-brown/40 bg-sail-brown/5' : 'border-sail-line'}`}
                >
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="text-xs font-mono text-sail-faint">{s.id}</span>
                    {okTime && (
                      <Tag color="#3D5A4A">
                        <span className="inline-flex items-center gap-0.5">
                          <Clock size={9} /> {from.toFixed(1)}–{to.toFixed(1)}s
                        </span>
                      </Tag>
                    )}
                    {okTime && <Tag color="#6B6358">{dur.toFixed(1)}s</Tag>}
                    {s.keep_slots?.length > 0 && (
                      <span className="text-[11px] text-sail-faint">用第 {s.keep_slots.join('、')} 拍</span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-sail-ink leading-snug">{s.title}</p>
                  <p className="text-sm text-sail-green-deep leading-relaxed mt-0.5">{s.one_idea}</p>

                  {s.new_hook && (
                    <p className="text-sm text-sail-muted mt-2 pl-2.5 border-l-2 border-sail-green-deep/40 leading-relaxed">
                      新开场：「{s.new_hook}」
                    </p>
                  )}

                  <div className="mt-1.5 space-y-0.5 text-[11px] text-sail-faint leading-relaxed">
                    {s.standalone_check && <p>独立性：{s.standalone_check}</p>}
                    {s.ending && <p>收尾：{s.ending}</p>}
                  </div>

                  {bad.length > 0 && (
                    <div className="mt-1.5">
                      <IssueList issues={bad} compact />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {result.not_worth_cutting?.length > 0 && (
            <div className="rounded-xl bg-sail-tint border border-sail-line p-3">
              <p className="text-xs font-medium text-sail-ink mb-1">这几段撑不起独立短片</p>
              <ul className="text-xs text-sail-muted leading-relaxed list-disc pl-4 space-y-0.5">
                {result.not_worth_cutting.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <CopyBtn text={guide} label="复制出片单" />
          </div>
        </div>
      )}
    </Card>
  );
}
