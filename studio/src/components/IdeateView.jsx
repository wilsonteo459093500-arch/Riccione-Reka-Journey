import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Film, Upload, Sparkles, Wand2, X, AlertTriangle, Lightbulb, ShoppingBag, Music, Palette, Type, ArrowRight, Zap,
} from 'lucide-react';
import { Card, Btn, Field, TextArea, TextInput, ChipRow, Tag, Empty, Progress, Fold, CopyBtn } from './ui/Bits.jsx';
import { PLATFORMS, TEMPLATES, BEATS, beatById, platformById } from '../constants.js';
import { deconstructPrompt, recipeFromTemplatePrompt } from '../prompts/deconstruct.js';
import { parseMetrics, analyzeMetrics } from '../services/metrics.js';
import { generateJSON, uploadVideo } from '../services/gemini.js';
import { probeVideo, sampleFrames, videoToInline, videoThumb, fmtBytes, fmtTime, INLINE_MAX_BYTES } from '../services/media.js';
import { parseVideoUrl, youtubePart } from '../services/videoUrl.js';

const FRAME_COUNT = 18;

export default function IdeateView({
  settings, notify, platformId, setPlatformId, recipe, setRecipe, seedBrief, onOpenSettings, onGoEdit,
}) {
  const [source, setSource] = useState('reference'); // 'reference' | 'link' | 'template'
  const [ref, setRef] = useState(null); // { file, url, duration, width, height, thumb }
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [metricsText, setMetricsText] = useState('');
  const [templateId, setTemplateId] = useState('before_after');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { pct, note }
  const fileRef = useRef(null);
  const urlRef = useRef(null);

  const parsedLink = useMemo(() => parseVideoUrl(link), [link]);

  useEffect(() => () => urlRef.current && URL.revokeObjectURL(urlRef.current), []);

  // 从「趋势」挑的选题带过来时，自动切到模板模式并填好 brief
  useEffect(() => {
    if (!seedBrief) return;
    setSource('template');
    setBrief(seedBrief);
  }, [seedBrief]);

  async function handlePick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const info = await probeVideo(file);
      urlRef.current = info.url;
      const thumb = await videoThumb(info.url, Math.min(1, info.duration * 0.2));
      setRef({ file, ...info, thumb });
      if (info.duration > 180) {
        notify({ type: 'warn', text: '这条参考视频超过 3 分钟，分析会比较慢也比较贵，建议先剪一段代表性的' });
      }
    } catch (err) {
      notify({ type: 'error', text: err.message });
    }
  }

  /** 组装送给模型的媒体 parts：完整视频优先，不行就抽帧 */
  async function buildMediaParts() {
    if (ref.file.size <= INLINE_MAX_BYTES) {
      setProgress({ pct: 20, note: `读取视频（${fmtBytes(ref.file.size)}）…` });
      return { parts: [await videoToInline(ref.file)], mode: 'video' };
    }

    // 大文件先试 Files API（能带上声音，分析质量最好）
    try {
      setProgress({ pct: 10, note: '文件较大，走上传通道…' });
      const part = await uploadVideo(settings, ref.file, (note, pct) => setProgress({ pct, note }));
      return { parts: [part], mode: 'video' };
    } catch (err) {
      if (!err.corsBlocked) throw err;
      setProgress({ pct: 15, note: '上传通道不可用，改用本地抽帧分析…' });
    }

    const frames = await sampleFrames(ref.url, FRAME_COUNT, (pct) =>
      setProgress({ pct: 15 + pct * 0.7, note: `本地抽帧 ${pct}%（不上传原片）…` })
    );
    const parts = frames.flatMap((f) => [
      { text: `[frame @ ${f.t.toFixed(2)}s]` },
      { inline_data: { mime_type: f.mimeType, data: f.base64 } },
    ]);
    return { parts, mode: 'frames' };
  }

  async function handleDeconstruct() {
    if (!settings.apiKey) {
      onOpenSettings();
      notify({ type: 'warn', text: '先配置 API key（免费申请，1 分钟）' });
      return;
    }
    if (source === 'reference' && !ref) {
      notify({ type: 'warn', text: '先上传一条参考视频' });
      return;
    }
    if (source === 'link' && !parsedLink.ok) {
      notify({ type: 'warn', text: parsedLink.reason || '先粘贴一条能用的链接' });
      return;
    }
    setBusy(true);
    setProgress({ pct: 5, note: '准备中…' });
    try {
      let parts;
      if (source === 'link') {
        // Google 直接去取这条 YouTube —— 不下载、不上传，也不经过浏览器
        setProgress({ pct: 40, note: 'Google 正在读取这条 YouTube…' });
        parts = [
          youtubePart(parsedLink.canonical),
          { text: deconstructPrompt({ platformId, mode: 'video', notes, metrics: parseMetrics(metricsText), settings }) },
        ];
        setProgress({ pct: 75, note: '拆解中，这一步最花时间（30–90 秒）…' });
      } else if (source === 'reference') {
        const media = await buildMediaParts();
        setProgress({ pct: 88, note: '拆解中，这一步最花时间（30–90 秒）…' });
        parts = [
          ...media.parts,
          {
            text: deconstructPrompt({
              platformId, mode: media.mode, duration: ref.duration, notes,
              metrics: parseMetrics(metricsText), settings,
            }),
          },
        ];
        if (media.mode === 'frames') {
          notify({ type: 'warn', text: '这次是按抽帧分析的 —— 声音相关的判断标了「推测」，可以自己再核一下' });
        }
      } else {
        const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
        setProgress({ pct: 60, note: '生成原创配方中…' });
        parts = [{ text: recipeFromTemplatePrompt({ template, platformId, brief, settings }) }];
      }

      const out = await generateJSON(settings, parts, { temperature: 0.6 });
      if (!out?.beats?.length) throw new Error('模型没有拆出结构，重试一次通常就好');
      setRecipe({
        ...out,
        _sourceKind: source,
        _refName: source === 'link' ? parsedLink.canonical : ref?.file?.name || '',
        _platformId: platformId,
      });
      notify({ type: 'ok', text: `拆出 ${out.beats.length} 拍 —— 往下滚看素材清单` });
    } catch (err) {
      // YouTube 取片失败最常见的原因是「不是公开视频」，直接把话说清楚，别让人去猜
      const linkIssue =
        source === 'link' && /youtube|video|url|fetch|unsupported|invalid/i.test(err.message || '');
      notify({
        type: 'error',
        text: linkIssue
          ? `${err.message}｜多半是这条视频不公开（不公开/私享的读不到），或超了当天 8 小时免费额度。可以改用「传文件」。`
          : err.message,
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const p = platformById(platformId);

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr] items-start">
      {/* ---------------- 左：输入 ---------------- */}
      <div className="space-y-4 lg:sticky lg:top-20">
        <Card title="第一步 · 定目标" sub="平台决定钩子窗口、时长和画幅，先定它">
          <ChipRow options={PLATFORMS} value={platformId} onChange={setPlatformId} />
          <p className="text-xs text-sail-faint mt-3 leading-relaxed">
            {p.label}：理想 {p.sweetSpot}，画幅 {p.aspect}，钩子窗口约 {p.hookWindow} 秒
          </p>
        </Card>

        <Card title="第二步 · 给个方向">
          <div className="flex gap-1 bg-sail-tint border border-sail-line rounded-xl p-1 mb-4">
            {[
              { id: 'link', label: '粘链接' },
              { id: 'reference', label: '传文件' },
              { id: 'template', label: '用模板' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setSource(t.id)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  source === t.id ? 'bg-white text-sail-ink shadow-sm' : 'text-sail-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {source === 'link' ? (
            <div className="space-y-3">
              <Field
                label="参考视频链接"
                hint="目前只有 YouTube 能直接读（含 Shorts）—— Google 自己去取片，不用下载也不用上传。"
              >
                <TextInput
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://www.youtube.com/shorts/..."
                  spellCheck={false}
                />
              </Field>

              {parsedLink.ok && (
                <div className="rounded-xl overflow-hidden border border-sail-line bg-black">
                  <iframe
                    src={parsedLink.embed}
                    title="参考视频预览"
                    allow="encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="w-full aspect-video block"
                    style={{ border: 0 }}
                  />
                </div>
              )}

              {link.trim() && !parsedLink.ok && parsedLink.kind !== 'empty' && (
                <div className="rounded-xl border border-sail-warn/40 bg-sail-warn/5 p-3.5">
                  <p className="text-sm font-medium text-sail-ink">{parsedLink.reason}</p>
                  {parsedLink.hint && (
                    <p className="text-xs text-sail-muted mt-1.5 leading-relaxed">{parsedLink.hint}</p>
                  )}
                  {parsedLink.kind === 'unsupported' && (
                    <Btn
                      size="sm"
                      variant="soft"
                      className="mt-2.5"
                      onClick={() => setSource('reference')}
                    >
                      切到「传文件」
                    </Btn>
                  )}
                </div>
              )}

              <MetricsField value={metricsText} onChange={setMetricsText} />

              <Field label="补充说明（可选）" hint="告诉它你到底看中了这条视频的什么，拆出来会准很多">
                <TextArea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="如：我要的是它前 3 秒那种反差感和字幕节奏，配乐不用管"
                />
              </Field>
            </div>
          ) : source === 'reference' ? (
            <div className="space-y-3">
              {ref ? (
                <div className="relative rounded-xl overflow-hidden border border-sail-line bg-sail-ink">
                  <video src={ref.url} controls playsInline className="w-full max-h-64 object-contain bg-black" />
                  <button
                    onClick={() => {
                      setRef(null);
                      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
                      urlRef.current = null;
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80"
                  >
                    <X size={14} />
                  </button>
                  <div className="px-3 py-2 text-[11px] text-white/80 bg-black/40 flex flex-wrap gap-x-3">
                    <span>{ref.duration.toFixed(1)}s</span>
                    <span>
                      {ref.width}×{ref.height}
                    </span>
                    <span>{fmtBytes(ref.file.size)}</span>
                    <span className="truncate max-w-[120px]">{ref.file.name}</span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-sail-line rounded-xl py-10 text-center hover:border-sail-green hover:bg-sail-tint transition-colors"
                >
                  <Upload size={22} className="mx-auto text-sail-faint mb-2" strokeWidth={1.5} />
                  <div className="text-sm font-medium text-sail-muted">上传参考视频</div>
                  <div className="text-[11px] text-sail-faint mt-1">mp4 / mov，建议 15–60 秒</div>
                </button>
              )}
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handlePick} />

              <MetricsField value={metricsText} onChange={setMetricsText} />

              <Field label="补充说明（可选）" hint="告诉它你到底看中了这条视频的什么，拆出来会准很多">
                <TextArea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="如：我要的是它前 3 秒那种反差感和字幕节奏，配乐不用管"
                />
              </Field>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="选一个结构模板">
                <ChipRow options={TEMPLATES} value={templateId} onChange={setTemplateId} />
                <p className="text-xs text-sail-faint mt-2">
                  {TEMPLATES.find((t) => t.id === templateId)?.hint}
                </p>
              </Field>
              <Field label="这条视频要讲什么" hint="写具体：哪个案例、什么户型、想突出什么">
                <TextArea
                  rows={4}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="如：吉隆坡 950 尺三房，业主预算有限，用系统柜把储物做到 2 倍，重点讲玄关到餐厅那条动线"
                />
              </Field>
            </div>
          )}
        </Card>

        <Card>
          <Btn className="w-full" busy={busy} icon={busy ? undefined : Sparkles} onClick={handleDeconstruct}>
            {busy ? '分析中…' : source === 'template' ? '生成配方' : '拆解这条参考视频'}
          </Btn>
          {progress && <div className="mt-3"><Progress value={progress.pct} note={progress.note} /></div>}
          {!progress && source === 'link' && (
            <p className="text-[11px] text-sail-faint mt-2.5 leading-relaxed">
              链接由 Google 那边直接取片，<strong className="text-sail-muted">不下载也不上传，最快</strong>。
              免费额度每天可分析 8 小时 YouTube，且<strong className="text-sail-muted">只能是公开视频</strong>
              （不公开 / 私享的读不到）。
            </p>
          )}
          {!progress && source === 'reference' && (
            <p className="text-[11px] text-sail-faint mt-2.5 leading-relaxed">
              小于 14MB 的视频会连声音一起分析；更大的会先试上传通道，不行就在本机抽 {FRAME_COUNT} 帧分析
              —— <strong className="text-sail-muted">原片始终不会上传到我们的服务器</strong>。
            </p>
          )}
        </Card>
      </div>

      {/* ---------------- 右：配方 ---------------- */}
      <div className="space-y-4">
        {!recipe ? (
          <Card>
            <Empty icon={Film} title="还没有配方">
              上传一条你想要那种感觉的视频，这里会拆出它的<strong>结构骨架</strong>、
              <strong>节奏</strong>、<strong>调色</strong>、<strong>字幕规律</strong>，
              以及最重要的 —— 你需要准备哪些素材才能复刻它。
            </Empty>
          </Card>
        ) : (
          <Recipe recipe={recipe} onGoEdit={onGoEdit} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Recipe({ recipe, onGoEdit }) {
  const total = recipe.duration_s || recipe.beats?.[recipe.beats.length - 1]?.end || 1;

  return (
    <>
      <Card
        title={recipe.title}
        sub={recipe.one_liner}
        right={
          <Btn size="sm" icon={ArrowRight} onClick={onGoEdit}>
            拿去剪辑
          </Btn>
        }
      >
        <div className="flex flex-wrap gap-2 text-xs mb-4">
          <Tag color="#2D4A3E">{recipe.format}</Tag>
          <Tag color="#6B6358">{recipe.duration_s}s</Tag>
          <Tag color="#6B6358">{recipe.aspect}</Tag>
          <Tag color="#6B6358">{recipe.beats?.length} 拍</Tag>
          {recipe.pacing?.avg_shot_s && <Tag color="#A87C4F">平均 {recipe.pacing.avg_shot_s}s/镜</Tag>}
        </div>

        {/* 结构条 */}
        <div className="flex h-8 rounded-lg overflow-hidden border border-sail-line mb-2">
          {(recipe.beats || []).map((b) => {
            const w = Math.max(1.5, (((b.end || 0) - (b.start || 0)) / total) * 100);
            const meta = beatById(b.beat);
            return (
              <div
                key={b.id}
                title={`${meta.label} ${b.start}–${b.end}s · ${b.shot}`}
                style={{ width: `${w}%`, background: meta.color }}
                className="border-r border-white/25 last:border-0"
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-sail-faint mb-4">
          {BEATS.filter((b) => (recipe.beats || []).some((x) => x.beat === b.id)).map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <i className="w-2 h-2 rounded-sm inline-block" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>

        <div className="rounded-xl bg-sail-tint border border-sail-line p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sail-green-deep mb-2">
            <Lightbulb size={14} /> 钩子 · {recipe.hook?.type}
          </div>
          <p className="text-sm text-sail-ink font-medium leading-relaxed">「{recipe.hook?.line}」</p>
          <p className="text-xs text-sail-muted mt-1.5 leading-relaxed">画面：{recipe.hook?.visual}</p>
          <p className="text-xs text-sail-faint mt-1 leading-relaxed">{recipe.hook?.why}</p>
        </div>
      </Card>

      {/* 素材购物清单 —— 这一屏是用户最该看的 */}
      <Card
        title="素材清单"
        sub="要复刻这条片子，你需要准备这些镜头。有的可能已经在手机里了。"
        right={
          <CopyBtn
            text={(recipe.beats || [])
              .map((b, i) => `${i + 1}. [${beatById(b.beat).label}] ${b.asset_need?.description || ''}（关键：${b.asset_need?.must_have || ''}）`)
              .join('\n')}
            label="复制清单"
          />
        }
      >
        <div className="space-y-2">
          {(recipe.beats || []).map((b, i) => {
            const meta = beatById(b.beat);
            return (
              <div key={b.id || i} className="flex gap-3 p-3 rounded-xl border border-sail-line hover:bg-sail-tint">
                <div className="text-[11px] font-mono text-sail-faint pt-0.5 w-14 shrink-0 text-right">
                  {fmtTime(b.start)}
                </div>
                <div className="w-1 rounded-full shrink-0" style={{ background: meta.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Tag color={meta.color}>{meta.label}</Tag>
                    <span className="text-xs text-sail-faint">{b.asset_need?.kind === 'image' ? '静图可用' : '需要视频'}</span>
                  </div>
                  <p className="text-sm text-sail-ink mt-1.5 leading-relaxed">{b.asset_need?.description}</p>
                  {b.asset_need?.must_have && (
                    <p className="text-xs text-sail-brown mt-1">必须有：{b.asset_need.must_have}</p>
                  )}
                  <p className="text-xs text-sail-faint mt-1 leading-relaxed">
                    参考里是：{b.shot}
                    {b.camera ? `｜${b.camera}` : ''}
                  </p>
                  {(b.onscreen_text || b.vo) && (
                    <p className="text-xs text-sail-muted mt-1">
                      {b.onscreen_text && <span className="mr-2">字幕「{b.onscreen_text}」</span>}
                      {b.vo && <span>口播「{b.vo}」</span>}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 制作规格 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="调色" sub={recipe.grade?.reference_words}>
          <div className="flex items-center gap-2 text-sm text-sail-ink mb-2">
            <Palette size={15} className="text-sail-brown" />
            <span className="font-medium">{recipe.grade?.preset}</span>
          </div>
          <p className="text-xs text-sail-muted leading-relaxed">{recipe.grade?.look}</p>
        </Card>

        <Card title="字幕" sub={recipe.captions?.position}>
          <div className="flex items-center gap-2 text-sm text-sail-ink mb-2">
            <Type size={15} className="text-sail-brown" />
            <span className="font-medium">
              {recipe.captions?.style}
              {recipe.captions?.chunk ? ` · ${recipe.captions.chunk} 字一组` : ''}
            </span>
          </div>
          <p className="text-xs text-sail-muted leading-relaxed">{recipe.captions?.note}</p>
        </Card>

        <Card title="音乐" sub={recipe.audio?.bpm_feel}>
          <div className="flex items-center gap-2 text-sm text-sail-ink mb-2">
            <Music size={15} className="text-sail-brown" />
            <span className="font-medium">{recipe.audio?.music_type}</span>
          </div>
          <p className="text-xs text-sail-muted leading-relaxed">{recipe.audio?.energy_curve}</p>
          {recipe.audio?.sfx?.length > 0 && (
            <p className="text-xs text-sail-faint mt-1.5">音效：{recipe.audio.sfx.join('、')}</p>
          )}
        </Card>

        <Card title="节奏" sub={`${recipe.pacing?.shots || '?'} 个镜头`}>
          <p className="text-xs text-sail-muted leading-relaxed">{recipe.pacing?.rhythm}</p>
          <p className="text-xs text-sail-faint mt-2">
            最快 {recipe.pacing?.fastest_s}s ｜ 最慢 {recipe.pacing?.slowest_s}s
          </p>
        </Card>
      </div>

      {/* 分析结论 */}
      <div className="space-y-3">
        {recipe.engine?.driver && (
          <div className="rounded-xl border-2 border-sail-green-deep/30 bg-sail-tint p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Zap size={15} className="text-sail-green-deep" />
              <span className="text-sm font-semibold text-sail-ink">引擎：{recipe.engine.driver}</span>
              {recipe.engine.persistent && <Tag color="#9C3D2E">全程常驻</Tag>}
              {recipe.engine.at_s > 0 && (
                <span className="text-[11px] text-sail-faint">第 {recipe.engine.at_s}s 出现</span>
              )}
            </div>
            {recipe.engine.device && (
              <p className="text-sm text-sail-ink leading-relaxed">
                <strong>靠这个动作：</strong>
                {recipe.engine.device}
              </p>
            )}
            {recipe.engine.transferable && (
              <p className="text-xs text-sail-muted leading-relaxed mt-1.5">
                <strong>能不能搬：</strong>
                {recipe.engine.transferable}
              </p>
            )}
          </div>
        )}

        <Fold title="为什么这条能起量" count={recipe.why_it_works?.length} open>
          <ul className="space-y-2 text-sm text-sail-muted leading-relaxed">
            {(recipe.why_it_works || []).map((w, i) => (
              <li key={i} className="flex gap-2">
                <Sparkles size={14} className="text-sail-gold shrink-0 mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Fold>

        <Fold title="照抄最容易砸的地方" count={recipe.traps?.length}>
          <ul className="space-y-2 text-sm text-sail-muted leading-relaxed">
            {(recipe.traps || []).map((w, i) => (
              <li key={i} className="flex gap-2">
                <AlertTriangle size={14} className="text-sail-danger shrink-0 mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Fold>

        <Fold title="套到你的行业该怎么改" count={recipe.adapt_notes?.length}>
          <ul className="space-y-2 text-sm text-sail-muted leading-relaxed">
            {(recipe.adapt_notes || []).map((w, i) => (
              <li key={i} className="flex gap-2">
                <Wand2 size={14} className="text-sail-green shrink-0 mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Fold>
      </div>

      <Card className="bg-sail-tint">
        <div className="flex items-center gap-3">
          <ShoppingBag size={20} className="text-sail-green-deep shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sail-ink">照着上面的清单准备素材，然后去「剪辑」</p>
            <p className="text-xs text-sail-faint mt-0.5">缺几条也没关系 —— 排剪辑时会告诉你缺什么、怎么补</p>
          </div>
          <Btn size="sm" icon={ArrowRight} onClick={onGoEdit}>
            去剪辑
          </Btn>
        </div>
      </Card>
    </>
  );
}

/**
 * 互动数据输入 —— 模型看不到画面之外的东西，这几个数字是它唯一的外部证据。
 *
 * 边打边解析，把比值当场显示出来：用户能在花掉一次 API 调用之前，
 * 就看到自己有没有粘错、以及这条片子到底靠什么起来的。
 */
function MetricsField({ value, onChange }) {
  const parsed = parseMetrics(value);
  const a = analyzeMetrics(parsed);
  const has = Object.keys(parsed).length > 0;

  return (
    <Field
      label="它的互动数据（可选，但这一栏最值钱）"
      hint="从帖子上把数字抄下来，随便粘。模型看不到这些 —— 而「靠转发起来的」和「靠评论起来的」，抄法完全不同。"
    >
      <TextArea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="如：363 赞 1197 评论 397 收藏 360 分享"
      />
      {has && (
        <div className="mt-2 rounded-xl bg-sail-tint border border-sail-line p-2.5 space-y-1.5">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-sail-muted tabular-nums">
            {[
              ['赞', parsed.likes],
              ['评论', parsed.comments],
              ['收藏', parsed.saves],
              ['分享', parsed.shares],
              ['播放', parsed.views],
            ]
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <span key={k}>
                  {k} <strong className="text-sail-ink">{v.toLocaleString('en-US')}</strong>
                </span>
              ))}
          </div>
          {a.ok ? (
            a.drivers.length > 0 ? (
              <p className="text-[11px] leading-relaxed text-sail-green-deep">
                <strong>{a.drivers.map((d) => d.name).join(' + ')}</strong>
                {' · '}
                {a.drivers
                  .map((d) => `${d.name.replace('驱动', '')}是赞的 ${Math.round(d.ratio * 100)}%`)
                  .join('，')}
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-sail-faint">
                三项都在常见区间 —— 这条靠的是画面和完播，没装专门的互动机制。
              </p>
            )
          ) : (
            <p className="text-[11px] leading-relaxed text-sail-brown">
              还缺点赞数。所有判断都是「相对它自己的赞数」，没有它算不出比值。
            </p>
          )}
        </div>
      )}
    </Field>
  );
}
