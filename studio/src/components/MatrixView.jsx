import React, { useMemo, useState } from 'react';
import {
  Layers3, AlertTriangle, CalendarDays, ArrowRight, Camera, Ban, Copy, Sparkles,
} from 'lucide-react';
import { Card, Btn, Field, TextArea, ChipRow, Tag, Empty, Fold, CopyBtn, DownloadBtn } from './ui/Bits.jsx';
import { PLATFORMS, platformById } from '../constants.js';
import { matrixPrompt } from '../prompts/matrix.js';
import { generateJSON } from '../services/gemini.js';
import { auditMatrix, matrixStats, scheduleMatrix, fmtDate } from '../services/matrix.js';

const TYPE_COLOR = {
  主片: '#2D4A3E',
  切片: '#3D5A4A',
  前后对比: '#9C3D2E',
  图文帖: '#C0843A',
  动态图文: '#A87C4F',
  口播: '#B8995A',
};
const EFFORT_COLOR = { 轻: '#3D5A4A', 中: '#B8995A', 重: '#9C3D2E' };

/**
 * 量产 —— 一次拍摄，一个月的内容。
 *
 * 这一屏的存在理由是个行业事实：拍摄很贵，发布很便宜。
 * 专业账号不是每天在拍，是每天在切。工具原本假设「一次使用 = 一条视频」，
 * 那个假设是错的，也是最大的产能瓶颈。
 */
export default function MatrixView({
  settings, notify, assets, platformId, setPlatformId, onOpenSettings, onGoEdit, onUsePiece,
}) {
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState(6);
  const [matrix, setMatrix] = useState(null);
  const [busy, setBusy] = useState(false);

  const labelled = assets.filter((a) => a.label);
  const p = platformById(platformId);

  const issues = useMemo(() => (matrix ? auditMatrix(matrix, assets) : []), [matrix, assets]);
  const stats = useMemo(() => (matrix ? matrixStats(matrix, assets) : null), [matrix, assets]);
  const weeks = useMemo(() => (matrix ? scheduleMatrix(matrix) : []), [matrix]);

  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const issuesFor = (id) => issues.filter((i) => i.pieceId === id);

  async function run() {
    if (!settings.apiKey) return onOpenSettings();
    if (!labelled.length) {
      notify({ type: 'warn', text: '先去「剪辑」把素材传进去并标注 —— 没有标注就不知道每段哪几秒能用' });
      return;
    }
    setBusy(true);
    try {
      const out = await generateJSON(
        settings,
        [{ text: matrixPrompt({ assets: labelled, notes, platformId, count, weeks: 4, settings }) }],
        { temperature: 0.85 }
      );
      setMatrix(out);
      const bad = auditMatrix(out, assets).filter((i) => i.level === 'error').length;
      notify({
        type: bad ? 'warn' : 'ok',
        text: bad
          ? `${out.pieces?.length || 0} 条已生成，但有 ${bad} 处硬伤要处理`
          : `${out.pieces?.length || 0} 条内容 + 4 周排期已排好`,
      });
    } catch (err) {
      notify({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const asMarkdown = () => {
    if (!matrix) return '';
    const lines = [
      `# 内容矩阵 · ${p.label}`,
      '',
      `> ${matrix.anchor || ''}`,
      '',
      matrix.read ? `**素材判断**：${matrix.read}\n` : '',
      ...(matrix.pieces || []).map((x) =>
        [
          `## ${x.id} · [${x.type}] ${x.title}`,
          '',
          `- **只讲这一件事**：${x.one_idea}`,
          `- **开场**：${x.hook_line}`,
          `- **开场镜头**：${x.open_with || '（不用素材）'}`,
          `- **形式**：${x.format_note}｜${x.duration_s}s｜${x.effort}`,
          `- **用到的素材**：${(x.uses || []).map((u) => `${u.assetId} ${u.from ?? ''}${u.to != null ? `-${u.to}` : ''}（${u.role || ''}）`).join('；') || '无'}`,
          `- **它承担什么**：${x.why_this_exists}`,
          x.needs_shooting?.length ? `- **还缺**：${x.needs_shooting.join('；')}` : '',
          '',
        ].join('\n')
      ),
      ...(weeks.length
        ? [
            '## 排期',
            '',
            ...weeks.map((w) =>
              [
                `### 第 ${w.week} 周 —— ${w.shape}`,
                ...w.slots.map((s) => `- ${fmtDate(s.date)} ${s.day}：${s.pieceId} ${s.piece?.title || ''}${s.why ? ` —— ${s.why}` : ''}`),
                '',
              ].join('\n')
            ),
          ]
        : []),
      ...(matrix.gaps?.length
        ? ['## 共同缺口', '', ...matrix.gaps.map((g) => `- ${g.need}（影响 ${(g.affects || []).join('、')}）\n  - 怎么补：${g.how_to_shoot}`), '']
        : []),
    ];
    return lines.filter((l) => l !== '').join('\n');
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr] items-start">
      {/* ---------------- 左 ---------------- */}
      <div className="space-y-4 lg:sticky lg:top-20">
        <Card title="量产" sub="一次拍摄，一个月的内容 —— 不是把长片切段，是找出几个各自成立的观点">
          <div className="space-y-4">
            <div className="rounded-xl bg-sail-tint border border-sail-line p-3">
              <p className="text-sm font-medium text-sail-ink">
                素材池：{labelled.length} 条已标注
                {assets.length > labelled.length && (
                  <span className="text-sail-brown"> · {assets.length - labelled.length} 条还没标注</span>
                )}
              </p>
              {!labelled.length && (
                <p className="text-xs text-sail-faint mt-1 leading-relaxed">
                  先去「剪辑」传素材并标注。标注这一步会记下每段素材<strong>哪几秒能用</strong>，
                  没有它就只能瞎排。
                </p>
              )}
            </div>

            <Field label="主战场">
              <ChipRow options={PLATFORMS} value={platformId} onChange={setPlatformId} />
            </Field>

            <Field label="这个案例的背景" hint="户型、预算、客户诉求、做了什么 —— 写得越具体，选题越不空">
              <TextArea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="如：吉隆坡 950 尺三房，屋主一家四口，痛点是玄关没有收纳、主卧衣柜进深不够。全屋做了实木饰面 + 一门到顶，工期 8 周。"
              />
            </Field>

            <Field label={`要几条内容：${count}`}>
              <input
                type="range"
                min={3}
                max={10}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full accent-sail-green-deep"
              />
            </Field>

            <Btn className="w-full" busy={busy} icon={busy ? undefined : Layers3} onClick={run} disabled={!labelled.length}>
              {busy ? '规划中…' : `排出 ${count} 条内容 + 4 周排期`}
            </Btn>
          </div>
        </Card>

        {stats && (
          <Card title="这批内容长什么样">
            <div className="space-y-2.5 text-sm">
              <Row k="素材利用率" v={`${stats.usedCount}/${stats.assetCount}（${Math.round(stats.coverage * 100)}%）`} />
              <Row k="总时长" v={`${Math.round(stats.totalSeconds)}s`} />
              <Row k="还需补拍" v={`${stats.needsShooting} 条`} />
              <div>
                <p className="text-xs text-sail-faint mb-1.5">形式分布</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stats.types).map(([t, n]) => (
                    <Tag key={t} color={TYPE_COLOR[t] || '#6B6358'}>
                      {t} ×{n}
                    </Tag>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ---------------- 右 ---------------- */}
      <div className="space-y-4">
        {!matrix ? (
          <Card>
            <Empty icon={Layers3} title="还没有排">
              拍摄很贵，发布很便宜。专业账号不是每天在拍，是<strong>每天在切</strong> ——
              一个完整案例应该出十几条内容，而「切成哪十几条」本身就是设计判断。
              <br />
              <br />
              这一屏会从你的素材里找出几个<strong>各自成立的观点</strong>，保证它们
              <strong>开场镜头不撞、形式不重样、好镜头摊开用</strong>，然后排进四周。
              排完还会自动体检 —— 哪条犯规、哪段素材闲置，都会直接标出来。
            </Empty>
          </Card>
        ) : (
          <>
            {(matrix.read || matrix.anchor) && (
              <Card title="这批素材能撑起什么">
                {matrix.read && <p className="text-sm text-sail-muted leading-relaxed">{matrix.read}</p>}
                {matrix.anchor && (
                  <p className="text-sm text-sail-ink leading-relaxed mt-2 pl-3 border-l-2 border-sail-green-deep">
                    <strong>这一个月的主线：</strong>
                    {matrix.anchor}
                  </p>
                )}
              </Card>
            )}

            {issues.length > 0 && (
              <Card
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle size={16} className={errors.length ? 'text-sail-brown' : 'text-sail-gold'} />
                    体检结果
                  </span>
                }
                sub={
                  errors.length
                    ? `${errors.length} 处硬伤必须改，${warns.length} 处建议看一眼`
                    : `没有硬伤，${warns.length} 处建议看一眼`
                }
                right={
                  <Btn size="sm" variant="soft" onClick={run} busy={busy}>
                    重排
                  </Btn>
                }
              >
                <ul className="space-y-1.5">
                  {[...errors, ...warns].map((it, i) => (
                    <li key={i} className="text-xs leading-relaxed flex gap-1.5">
                      <span className={it.level === 'error' ? 'text-sail-brown' : 'text-sail-gold'}>
                        {it.level === 'error' ? '✗' : '!'}
                      </span>
                      <span className="text-sail-muted">{it.msg}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card
              title={`${matrix.pieces?.length || 0} 条内容`}
              sub="每条只讲一件事 —— 点「拿去剪」把它带进剪辑流程"
              right={
                <div className="flex gap-2">
                  <DownloadBtn filename={`内容矩阵_${p.label}.md`} text={asMarkdown()} mime="text/markdown" label="下载" />
                  <CopyBtn text={asMarkdown()} />
                </div>
              }
            >
              <div className="space-y-2.5">
                {(matrix.pieces || []).map((x) => {
                  const bad = issuesFor(x.id);
                  const hasErr = bad.some((b) => b.level === 'error');
                  return (
                    <div
                      key={x.id}
                      className={`rounded-xl border p-3.5 ${hasErr ? 'border-sail-brown/40 bg-sail-brown/5' : 'border-sail-line'}`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        <span className="text-xs font-mono text-sail-faint">{x.id}</span>
                        <Tag color={TYPE_COLOR[x.type] || '#6B6358'}>{x.type}</Tag>
                        {x.duration_s > 0 && <Tag color="#6B6358">{x.duration_s}s</Tag>}
                        {x.effort && <Tag color={EFFORT_COLOR[x.effort] || '#6B6358'}>{x.effort}</Tag>}
                        {x.week && <span className="text-[11px] text-sail-faint">第 {x.week} 周</span>}
                      </div>

                      <p className="text-base font-display font-semibold text-sail-ink leading-snug">{x.title}</p>
                      <p className="text-sm text-sail-green-deep mt-0.5 leading-relaxed">{x.one_idea}</p>

                      {x.hook_line && (
                        <p className="text-sm text-sail-muted mt-2 pl-2.5 border-l-2 border-sail-line leading-relaxed">
                          开场：「{x.hook_line}」
                        </p>
                      )}

                      <div className="mt-2 space-y-0.5 text-[11px] text-sail-faint leading-relaxed">
                        {x.open_with && <p>开场镜头：{x.open_with}</p>}
                        {x.format_note && <p>形式：{x.format_note}</p>}
                        {x.uses?.length > 0 && (
                          <p>
                            用到：
                            {x.uses
                              .map((u) => `${u.assetId}${u.from != null ? ` ${u.from}–${u.to}s` : ''}${u.role ? `（${u.role}）` : ''}`)
                              .join('，')}
                          </p>
                        )}
                        {x.why_this_exists && <p>职责：{x.why_this_exists}</p>}
                      </div>

                      {x.needs_shooting?.length > 0 && (
                        <p className="text-[11px] text-sail-brown mt-1.5 flex gap-1">
                          <Camera size={12} className="shrink-0 mt-px" />
                          还缺：{x.needs_shooting.join('；')}
                        </p>
                      )}

                      {bad.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {bad.map((b, i) => (
                            <li key={i} className={`text-[11px] leading-relaxed ${b.level === 'error' ? 'text-sail-brown' : 'text-sail-gold'}`}>
                              {b.level === 'error' ? '✗ ' : '! '}
                              {b.msg}
                            </li>
                          ))}
                        </ul>
                      )}

                      {onUsePiece && (
                        <div className="mt-2.5">
                          <Btn size="sm" variant="soft" icon={ArrowRight} onClick={() => onUsePiece(x)}>
                            拿去剪
                          </Btn>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {weeks.length > 0 && (
              <Card
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={16} className="text-sail-brown" />
                    四周排期
                  </span>
                }
                sub="一个月有形状 —— 不是把内容随机撒出去"
              >
                <div className="space-y-3">
                  {weeks.map((w) => (
                    <div key={w.week}>
                      <div className="flex items-baseline gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-sail-ink">第 {w.week} 周</span>
                        <span className="text-[11px] text-sail-faint">{fmtDate(w.weekStart)} 起</span>
                        <span className="text-xs text-sail-muted">{w.shape}</span>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {w.slots.map((s, i) => (
                          <div key={i} className="rounded-lg border border-sail-line p-2 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-sail-faint">{fmtDate(s.date)}</span>
                              <span className="text-sail-muted">{s.day}</span>
                              {s.piece && <Tag color={TYPE_COLOR[s.piece.type] || '#6B6358'}>{s.piece.type}</Tag>}
                            </div>
                            <p className="text-sail-ink mt-0.5 leading-snug">
                              {s.piece?.title || <span className="text-sail-brown">找不到 {s.pieceId}</span>}
                            </p>
                            {s.why && <p className="text-[11px] text-sail-faint mt-0.5 leading-relaxed">{s.why}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {matrix.gaps?.length > 0 && (
              <Card title="这批内容共同缺的镜头" sub="补这几个，整批的质量一起往上走">
                <div className="space-y-2">
                  {matrix.gaps.map((g, i) => (
                    <div key={i} className="rounded-xl border border-sail-line p-3">
                      <p className="text-sm font-medium text-sail-ink">{g.need}</p>
                      {g.affects?.length > 0 && (
                        <p className="text-[11px] text-sail-faint mt-0.5">影响：{g.affects.join('、')}</p>
                      )}
                      <p className="text-xs text-sail-muted mt-1 leading-relaxed">怎么补：{g.how_to_shoot}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {matrix.not_enough_for?.length > 0 && (
              <Card
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <Ban size={16} className="text-sail-brown" />
                    现有素材做不了的
                  </span>
                }
                sub="别硬做 —— 硬凑出来的那一条，观众一眼看得出缺了什么"
              >
                <ul className="space-y-1 text-sm text-sail-muted list-disc pl-4 leading-relaxed">
                  {matrix.not_enough_for.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-sail-faint">{k}</span>
      <span className="text-sm text-sail-ink tabular-nums">{v}</span>
    </div>
  );
}
