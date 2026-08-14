import React, { useState } from 'react';
import { Radar, TrendingUp, Target, CalendarDays, Zap, ArrowRight } from 'lucide-react';
import { Card, Btn, Field, TextArea, TextInput, ChipRow, Tag, Empty, Fold, CopyBtn } from './ui/Bits.jsx';
import { PLATFORMS, platformById } from '../constants.js';
import { trendPrompt } from '../prompts/trend.js';
import { generateJSON } from '../services/gemini.js';
import HotNow from './HotNow.jsx';

const FIT_COLOR = { high: '#2D4A3E', mid: '#B8995A', low: '#9A8F7E' };
const FIT_LABEL = { high: '很适合你', mid: '可以试', low: '不建议' };
const EFFORT_LABEL = { low: '轻', mid: '中', high: '重' };

export default function TrendView({ settings, notify, platformId, setPlatformId, onOpenSettings, onUseAngle }) {
  const [industry, setIndustry] = useState(settings.brand || '');
  const [observed, setObserved] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleRun() {
    if (!settings.apiKey) return onOpenSettings();
    setBusy(true);
    try {
      const out = await generateJSON(
        settings,
        [{ text: trendPrompt({ industry, platformId, observed, weeks, settings }) }],
        { temperature: 0.8 }
      );
      setReport(out);
      notify({ type: 'ok', text: `${out.angles?.length || 0} 个选题已生成` });
    } catch (err) {
      notify({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr] items-start">
      <div className="space-y-4 lg:sticky lg:top-20">
        <Card title="趋势雷达" sub="分析格式为什么有效 + 你该怎么做出不一样的">
          <div className="space-y-4">
            <Field label="主战场">
              <ChipRow options={PLATFORMS} value={platformId} onChange={setPlatformId} />
            </Field>

            <Field label="你的赛道">
              <TextInput
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="如：马来西亚全屋定制 / 室内设计"
              />
            </Field>

            <Field
              label="你最近刷到的爆款（强烈建议填）"
              hint="把最近刷到的 5–10 条内容的标题、格式、大概数据粘进来。填了这一栏，分析质量是两个档次的差别 —— 模型的知识有截止日期，你的观察没有。"
            >
              <TextArea
                rows={7}
                value={observed}
                onChange={(e) => setObserved(e.target.value)}
                placeholder={`如：
1.「我家装修最后悔的3件事」口播+字幕，12w 赞
2.「毛坯→成品 15 秒」快剪卡点，8w 赞
3. 同行都在拍「柜子内部收纳展示」，数据一般
4. 有条「装修被坑 8 万」的吐槽下面全在问怎么避坑`}
              />
            </Field>

            <Field label={`排 ${weeks} 周内容日历`}>
              <input
                type="range"
                min={1}
                max={8}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="w-full mt-2 accent-sail-green-deep"
              />
            </Field>

            <Btn className="w-full" busy={busy} icon={busy ? undefined : Radar} onClick={handleRun}>
              {busy ? '分析中…' : '开始分析'}
            </Btn>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <HotNow
          settings={settings}
          platformId={platformId}
          niche={industry}
          notify={notify}
          onOpenSettings={onOpenSettings}
          onUseAngle={onUseAngle ? (h) => onUseAngle({ title: h.title, hook_line: h.your_move, why: h.why_now }) : null}
        />

        {!report ? (
          <Card>
            <Empty icon={Radar} title="还没有分析">
              上面那个按钮回答「<strong>今天什么最红</strong>」——现搜现答，带真实链接。
              这里做的是另一件事、也是更值钱的一件事：<strong>拆解格式为什么有效</strong>、
              找出<strong>同行都在做的红海</strong>和<strong>没人做但观众想看的盲区</strong>，
              然后给你一批明天就能开工的选题。
            </Empty>
          </Card>
        ) : (
          <>
            <Card title="当下这个赛道长什么样">
              <p className="text-sm text-sail-muted leading-relaxed whitespace-pre-wrap">{report.read}</p>
            </Card>

            <Card title="格式雷达" sub="每个都说清了机制 —— 为什么它能提高完播 / 收藏">
              <div className="space-y-2.5">
                {(report.radar || []).map((r, i) => (
                  <div key={i} className="p-3.5 rounded-xl border border-sail-line hover:bg-sail-tint">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <span className="text-sm font-semibold text-sail-ink">{r.trend}</span>
                      <div className="flex gap-1.5 shrink-0">
                        <Tag color={FIT_COLOR[r.fit] || '#6B6358'}>{FIT_LABEL[r.fit] || r.fit}</Tag>
                        <Tag color="#9A8F7E">{r.lifespan}</Tag>
                      </div>
                    </div>
                    <p className="text-xs text-sail-muted leading-relaxed">{r.what}</p>
                    <p className="text-xs text-sail-faint mt-1.5 leading-relaxed">
                      <TrendingUp size={11} className="inline mr-1 text-sail-gold" />
                      {r.why_now}
                    </p>
                    <p className="text-xs text-sail-green mt-1 leading-relaxed">套到你这儿：{r.how_to_use}</p>
                    {r.crowding && <p className="text-[11px] text-sail-faint mt-1">拥挤度：{r.crowding}</p>}
                  </div>
                ))}
              </div>
            </Card>

            <Card title="你该占什么位" sub={report.differentiation?.positioning_line}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-sail-danger/5 border border-sail-danger/25 p-3.5">
                  <p className="text-xs font-semibold text-sail-danger mb-1.5">红海 · 别再做了</p>
                  <ul className="space-y-1 text-xs text-sail-muted leading-relaxed">
                    {(report.differentiation?.crowded || []).map((c, i) => (
                      <li key={i}>· {c}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl bg-sail-green/5 border border-sail-green/30 p-3.5">
                  <p className="text-xs font-semibold text-sail-green-deep mb-1.5">盲区 · 没人做但有人想看</p>
                  <ul className="space-y-1 text-xs text-sail-muted leading-relaxed">
                    {(report.differentiation?.blind_spots || []).map((c, i) => (
                      <li key={i}>· {c}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {report.differentiation?.your_edge && (
                <div className="mt-3 rounded-xl bg-sail-tint border border-sail-line p-3.5 flex items-start gap-2">
                  <Target size={15} className="text-sail-green-deep mt-0.5 shrink-0" />
                  <p className="text-sm text-sail-ink leading-relaxed">{report.differentiation.your_edge}</p>
                </div>
              )}
            </Card>

            <Card title="可以开工的选题" sub="每条都写了原话开场白 —— 点「拿去构思」直接带进流程">
              <div className="space-y-2.5">
                {(report.angles || []).map((a, i) => (
                  <div key={i} className="p-3.5 rounded-xl border border-sail-line hover:bg-sail-tint">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-sail-ink leading-snug">{a.title}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <Tag color="#2D4A3E">{a.format}</Tag>
                          <Tag color="#6B6358">{platformById(a.platform).label}</Tag>
                          <Tag color={a.effort === 'low' ? '#3D5A4A' : a.effort === 'high' ? '#9C3D2E' : '#B8995A'}>
                            投入{EFFORT_LABEL[a.effort] || a.effort}
                          </Tag>
                        </div>
                      </div>
                      <Btn
                        size="sm"
                        variant="ghost"
                        icon={ArrowRight}
                        onClick={() => onUseAngle(a)}
                        className="shrink-0"
                      >
                        拿去构思
                      </Btn>
                    </div>

                    <p className="text-sm text-sail-ink mt-2 leading-relaxed">
                      <Zap size={12} className="inline mr-1 text-sail-gold" />
                      开场：「{a.hook}」
                    </p>

                    {a.beats?.length > 0 && (
                      <ol className="mt-2 space-y-0.5 text-xs text-sail-muted leading-relaxed">
                        {a.beats.map((b, j) => (
                          <li key={j}>
                            {j + 1}. {b}
                          </li>
                        ))}
                      </ol>
                    )}

                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs text-sail-faint">素材：{a.asset_need}</p>
                      {a.save_bait && <p className="text-xs text-sail-brown">收藏点：{a.save_bait}</p>}
                      {a.expected && <p className="text-xs text-sail-faint">预期：{a.expected}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {report.calendar?.length > 0 && (
              <Fold
                title="内容日历"
                count={`${report.calendar.length} 周`}
                open
              >
                <div className="space-y-3">
                  {report.calendar.map((w) => (
                    <div key={w.week}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <CalendarDays size={13} className="text-sail-brown" />
                        <span className="text-sm font-medium text-sail-ink">
                          第 {w.week} 周 · {w.theme}
                        </span>
                      </div>
                      <div className="space-y-1 pl-5">
                        {(w.posts || []).map((post, i) => (
                          <div key={i} className="text-xs text-sail-muted flex flex-wrap gap-x-2">
                            <span className="text-sail-faint w-8 shrink-0">{post.day}</span>
                            <span className="text-sail-ink">{post.topic}</span>
                            <span className="text-sail-faint">
                              {post.format} · {platformById(post.platform).label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <CopyBtn
                    text={report.calendar
                      .map(
                        (w) =>
                          `第 ${w.week} 周 · ${w.theme}\n` +
                          (w.posts || []).map((p) => `  ${p.day} — ${p.topic}（${p.format}｜${platformById(p.platform).label}）`).join('\n')
                      )
                      .join('\n\n')}
                    label="复制日历"
                  />
                </div>
              </Fold>
            )}
          </>
        )}
      </div>
    </div>
  );
}
