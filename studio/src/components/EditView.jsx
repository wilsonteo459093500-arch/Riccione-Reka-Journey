import React, { useRef, useState } from 'react';
import {
  Upload, X, Loader2, Clapperboard, Scissors, AlertTriangle, Camera, Image as ImageIcon,
  Video as VideoIcon, RefreshCw, Sparkles,
} from 'lucide-react';
import { Card, Btn, Field, TextArea, ChipRow, Tag, Empty, Progress } from './ui/Bits.jsx';
import StoryboardPlayer from './StoryboardPlayer.jsx';
import ExportPanel from './ExportPanel.jsx';
import { GRADES, CAPTION_STYLES, beatById, platformById } from '../constants.js';
import { labelAssetPrompt } from '../prompts/assets.js';
import { planPrompt } from '../prompts/plan.js';
import { generateJSON } from '../services/gemini.js';
import { probeVideo, prepareImage, sampleFrames, videoThumb, fmtBytes, uid } from '../services/media.js';
import { withOutputTimes, planDuration } from '../services/exporters.js';

const LABEL_FRAMES = 8;

export default function EditView({
  settings, notify, recipe, platformId, assets, setAssets, plan, setPlan, onOpenSettings, onGoIdeate, onGoPost,
}) {
  const [gradeId, setGradeId] = useState('warm_cinematic');
  const [captionStyleId, setCaptionStyleId] = useState('bold_overlay');
  const [targetDuration, setTargetDuration] = useState(recipe?.duration_s ? Math.round(recipe.duration_s) : 30);
  const [notes, setNotes] = useState('');
  const [planning, setPlanning] = useState(false);
  const [ingest, setIngest] = useState(null); // { done, total, note }
  const fileRef = useRef(null);

  const labelled = assets.filter((a) => a.label);
  const p = platformById(platformId);

  // -------------------------------------------------------------------------
  // 素材接收 + AI 标注
  // -------------------------------------------------------------------------

  async function handleFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('video/') || f.type.startsWith('image/'));
    if (!files.length) return;
    if (!settings.apiKey) {
      onOpenSettings();
      notify({ type: 'warn', text: '先配置 API key —— 素材要过一遍 AI 才知道里面有什么' });
      return;
    }

    setIngest({ done: 0, total: files.length, note: '读取中…' });
    const added = [];
    // 删过素材之后再加，不能用数组长度当序号 —— 会撞上还在用的 id
    let nextNum = assets.reduce((max, a) => Math.max(max, Number(String(a.id).slice(1)) || 0), 0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith('video/');
      setIngest({ done: i, total: files.length, note: `读取 ${file.name}…` });

      try {
        let asset;
        if (isVideo) {
          const info = await probeVideo(file);
          const thumb = await videoThumb(info.url, Math.min(1.5, info.duration * 0.25));
          asset = {
            id: `a${++nextNum}`,
            kind: 'video',
            name: file.name,
            file,
            url: info.url,
            thumb,
            duration: info.duration,
            width: info.width,
            height: info.height,
            size: file.size,
            _uid: uid(),
          };
        } else {
          const img = await prepareImage(file);
          asset = {
            id: `a${++nextNum}`,
            kind: 'image',
            name: file.name,
            file,
            thumb: img.dataUrl,
            thumbFull: img.dataUrl,
            input: { mimeType: img.mimeType, base64: img.base64 },
            width: img.width,
            height: img.height,
            size: file.size,
            _uid: uid(),
          };
        }
        added.push(asset);
      } catch (err) {
        notify({ type: 'error', text: `${file.name}：${err.message}` });
      }
    }

    if (!added.length) {
      setIngest(null);
      return;
    }
    setAssets((prev) => [...prev, ...added]);

    // 逐条标注 —— 串行 + 间隔，避开免费 key 的每分钟限流
    for (let i = 0; i < added.length; i++) {
      const a = added[i];
      setIngest({ done: i, total: added.length, note: `AI 正在看「${a.name}」…` });
      setAssets((prev) => prev.map((x) => (x._uid === a._uid ? { ...x, labeling: true } : x)));
      try {
        const label = await labelAsset(a);
        setAssets((prev) => prev.map((x) => (x._uid === a._uid ? { ...x, label, labeling: false, labelError: null } : x)));
      } catch (err) {
        setAssets((prev) => prev.map((x) => (x._uid === a._uid ? { ...x, labeling: false, labelError: err.message } : x)));
      }
      if (i < added.length - 1) await new Promise((r) => setTimeout(r, 1200));
    }

    setIngest(null);
    notify({ type: 'ok', text: `${added.length} 条素材已入库` });
  }

  async function labelAsset(a) {
    if (a.kind === 'image') {
      const parts = [
        { inline_data: { mime_type: a.input.mimeType, data: a.input.base64 } },
        { text: labelAssetPrompt('image', { name: a.name, settings }) },
      ];
      return generateJSON(settings, parts, { temperature: 0.4 });
    }
    const frames = await sampleFrames(a.url, LABEL_FRAMES);
    const parts = [
      ...frames.flatMap((f) => [
        { text: `[frame @ ${f.t.toFixed(2)}s]` },
        { inline_data: { mime_type: f.mimeType, data: f.base64 } },
      ]),
      { text: labelAssetPrompt('video', { name: a.name, duration: a.duration, frameCount: frames.length, settings }) },
    ];
    return generateJSON(settings, parts, { temperature: 0.4 });
  }

  async function relabel(a) {
    setAssets((prev) => prev.map((x) => (x._uid === a._uid ? { ...x, labeling: true } : x)));
    try {
      const label = await labelAsset(a);
      setAssets((prev) => prev.map((x) => (x._uid === a._uid ? { ...x, label, labeling: false, labelError: null } : x)));
    } catch (err) {
      setAssets((prev) => prev.map((x) => (x._uid === a._uid ? { ...x, labeling: false, labelError: err.message } : x)));
      notify({ type: 'error', text: err.message });
    }
  }

  function removeAsset(a) {
    if (a.url) URL.revokeObjectURL(a.url);
    setAssets((prev) => prev.filter((x) => x._uid !== a._uid));
  }

  // -------------------------------------------------------------------------
  // 排剪辑
  // -------------------------------------------------------------------------

  async function handlePlan() {
    if (!settings.apiKey) return onOpenSettings();
    if (!recipe) {
      notify({ type: 'warn', text: '先去「构思」拆一条参考视频，或用模板生成一份配方' });
      return;
    }
    if (!labelled.length) {
      notify({ type: 'warn', text: '先上传素材 —— 至少一条视频或一张案例图' });
      return;
    }
    setPlanning(true);
    try {
      const out = await generateJSON(
        settings,
        [
          {
            text: planPrompt({
              recipe,
              assets: labelled.map((a) => ({ id: a.id, kind: a.kind, name: a.name, duration: a.duration, label: a.label })),
              platformId,
              gradeId,
              captionStyleId,
              targetDuration,
              notes,
              settings,
            }),
          },
        ],
        { temperature: 0.5 }
      );
      if (!out?.timeline?.length) throw new Error('没排出时间轴，重试一次通常就好');

      // 兜底修正：过滤掉不存在的素材，把 in/out 夹回素材真实时长内
      const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
      const timeline = out.timeline
        .filter((r) => byId[r.assetId])
        .map((r, i) => {
          const a = byId[r.assetId];
          let start = Math.max(0, Number(r.in) || 0);
          let end = Number(r.out) || start + 2;
          if (a.kind === 'video' && a.duration) {
            end = Math.min(end, a.duration);
            start = Math.min(start, Math.max(0, end - 0.3));
          }
          if (end <= start) end = start + 0.6;
          return { ...r, slot: i + 1, in: Number(start.toFixed(2)), out: Number(end.toFixed(2)) };
        });

      const dropped = out.timeline.length - timeline.length;
      if (dropped > 0) notify({ type: 'warn', text: `丢掉了 ${dropped} 拍（引用了不存在的素材）` });

      setPlan({ ...out, timeline, grade_preset: gradeId, caption_style: captionStyleId });
      notify({ type: 'ok', text: `排好了：${timeline.length} 拍，${planDuration(timeline).toFixed(1)} 秒` });
    } catch (err) {
      notify({ type: 'error', text: err.message });
    } finally {
      setPlanning(false);
    }
  }

  // -------------------------------------------------------------------------

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr] items-start">
      {/* ---------------- 左：素材 + 参数 ---------------- */}
      <div className="space-y-4">
        <Card title="配方" sub={recipe ? recipe.one_liner : '还没有配方'}>
          {recipe ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-sail-ink">{recipe.title}</p>
              <div className="flex flex-wrap gap-1.5">
                <Tag color="#2D4A3E">{recipe.format}</Tag>
                <Tag color="#6B6358">{recipe.beats?.length} 拍</Tag>
                <Tag color="#6B6358">{p.label}</Tag>
              </div>
            </div>
          ) : (
            <Btn variant="soft" size="sm" className="w-full" onClick={onGoIdeate}>
              去「构思」先拆一条参考视频
            </Btn>
          )}
        </Card>

        <Card
          title="你的素材"
          sub="原片、案例图都行。每条都会先过一遍 AI，标出里面有什么、哪几秒能用。"
          right={
            assets.length > 0 && (
              <Btn size="sm" variant="ghost" icon={Upload} onClick={() => fileRef.current?.click()}>
                添加
              </Btn>
            )
          }
        >
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {assets.length === 0 ? (
            <div
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-sail-line rounded-xl py-10 text-center hover:border-sail-green hover:bg-sail-tint transition-colors"
              >
                <Upload size={22} className="mx-auto text-sail-faint mb-2" strokeWidth={1.5} />
                <div className="text-sm font-medium text-sail-muted">拖进来 / 点击上传</div>
                <div className="text-[11px] text-sail-faint mt-1">支持多选 · 视频 + 图片混着来</div>
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto thin-scroll -mx-1 px-1">
              {assets.map((a) => (
                <AssetRow key={a._uid} asset={a} onRemove={() => removeAsset(a)} onRelabel={() => relabel(a)} />
              ))}
            </div>
          )}

          {ingest && (
            <div className="mt-3">
              <Progress value={(ingest.done / Math.max(1, ingest.total)) * 100} note={ingest.note} />
            </div>
          )}
        </Card>

        <Card title="出片参数">
          <div className="space-y-4">
            <Field label="调色">
              <ChipRow options={GRADES} value={gradeId} onChange={setGradeId} />
              <p className="text-xs text-sail-faint mt-2">{GRADES.find((g) => g.id === gradeId)?.desc}</p>
            </Field>

            <Field label="字幕">
              <ChipRow options={CAPTION_STYLES} value={captionStyleId} onChange={setCaptionStyleId} />
              <p className="text-xs text-sail-faint mt-2">{CAPTION_STYLES.find((c) => c.id === captionStyleId)?.desc}</p>
            </Field>

            <Field label={`目标时长：${targetDuration} 秒`} hint={`${p.label} 的甜区是 ${p.sweetSpot}`}>
              <input
                type="range"
                min={8}
                max={90}
                value={targetDuration}
                onChange={(e) => setTargetDuration(Number(e.target.value))}
                className="w-full mt-2 accent-sail-green-deep"
              />
            </Field>

            <Field label="额外要求（可选）" hint="这里写的优先级高于配方">
              <TextArea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="如：不要口播，只用字幕；开头必须用那张厨房全景；结尾留 2 秒放 logo"
              />
            </Field>
          </div>
        </Card>

        <Btn className="w-full" busy={planning} icon={planning ? undefined : Scissors} onClick={handlePlan}>
          {planning ? '排剪辑中…' : '排剪辑'}
        </Btn>
      </div>

      {/* ---------------- 右：方案 ---------------- */}
      <div className="space-y-4">
        {!plan ? (
          <Card>
            <Empty icon={Clapperboard} title="还没排剪辑">
              上传素材后点「排剪辑」。它会把配方的每一拍配上你真实的素材片段，
              精确到<strong>第几秒切进、第几秒切出</strong>，缺素材的地方会明确告诉你缺什么、怎么补拍。
            </Empty>
          </Card>
        ) : (
          <>
            <Card
              title="剪辑方案"
              sub={plan.summary}
              right={
                <Btn size="sm" variant="ghost" icon={Sparkles} onClick={onGoPost}>
                  去写文案
                </Btn>
              }
            >
              <div className="flex flex-wrap gap-2 text-xs mb-4">
                <Tag color="#2D4A3E">{plan.timeline.length} 拍</Tag>
                <Tag color="#6B6358">{planDuration(plan.timeline).toFixed(1)}s</Tag>
                <Tag color="#6B6358">{plan.aspect || p.aspect}</Tag>
                <Tag color="#A87C4F">{GRADES.find((g) => g.id === plan.grade_preset)?.label}</Tag>
              </div>
              <StoryboardPlayer plan={plan} assets={assets} />
            </Card>

            <Card title="时间轴" sub="每一拍为什么这么剪，都写在下面">
              <div className="space-y-2">
                {withOutputTimes(plan.timeline).map((r) => {
                  const a = assets.find((x) => x.id === r.assetId);
                  const meta = beatById(r.beat);
                  return (
                    <div key={r.slot} className="flex gap-3 p-3 rounded-xl border border-sail-line hover:bg-sail-tint">
                      <div className="shrink-0 w-12">
                        {a?.thumb ? (
                          <img src={a.thumb} alt="" className="w-12 h-16 object-cover rounded-lg" />
                        ) : (
                          <div className="w-12 h-16 rounded-lg bg-sail-line flex items-center justify-center text-sail-faint text-xs">
                            ?
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Tag color={meta.color}>{meta.label}</Tag>
                          <span className="text-[11px] font-mono text-sail-faint">
                            {r.output_start.toFixed(1)}s +{r.output_duration.toFixed(1)}s
                          </span>
                          {a && (
                            <span className="text-[11px] text-sail-faint truncate">
                              {a.name}
                              {a.kind === 'video' && ` · ${Number(r.in).toFixed(1)}–${Number(r.out).toFixed(1)}s`}
                            </span>
                          )}
                          {r.speed && r.speed !== 1 && <Tag color="#B8995A">{r.speed}×</Tag>}
                        </div>
                        {r.onscreen_text && (
                          <p className="text-sm text-sail-ink mt-1.5 font-medium">「{r.onscreen_text}」</p>
                        )}
                        {r.vo && <p className="text-xs text-sail-muted mt-0.5">口播：{r.vo}</p>}
                        {r.reframe && <p className="text-xs text-sail-faint mt-0.5">运动：{r.reframe}</p>}
                        {r.why && <p className="text-xs text-sail-faint mt-1 leading-relaxed">{r.why}</p>}
                        {r.risk && (
                          <p className="text-xs text-sail-danger mt-1 flex items-start gap-1">
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                            {r.risk}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {plan.gaps?.length > 0 && (
              <Card title="还缺的素材" sub="这些镜头你手上没有 —— 照下面的说明去补，或者用顶替方案">
                <div className="space-y-3">
                  {plan.gaps.map((g, i) => (
                    <div key={i} className="rounded-xl border border-sail-warn/40 bg-sail-warn/5 p-3.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Camera size={14} className="text-sail-warn" />
                        <Tag color={beatById(g.beat).color}>{beatById(g.beat).label}</Tag>
                        <span className="text-sm font-medium text-sail-ink">{g.need}</span>
                      </div>
                      <p className="text-xs text-sail-muted leading-relaxed">怎么补：{g.how_to_shoot}</p>
                      {g.workaround && (
                        <p className="text-xs text-sail-faint mt-1 leading-relaxed">补不了：{g.workaround}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {plan.music && (
                <Card title="音乐">
                  <p className="text-sm text-sail-muted leading-relaxed">{plan.music.brief}</p>
                  {plan.music.search_terms?.length > 0 && (
                    <p className="text-xs text-sail-faint mt-2">
                      搜索词：<span className="font-mono">{plan.music.search_terms.join(' · ')}</span>
                    </p>
                  )}
                  {plan.music.cut_points_s?.length > 0 && (
                    <p className="text-xs text-sail-faint mt-1">
                      卡点：{plan.music.cut_points_s.map((s) => `${s}s`).join(' · ')}
                    </p>
                  )}
                </Card>
              )}

              {plan.qc?.length > 0 && (
                <Card title="出片后检查">
                  <ul className="space-y-1.5 text-xs text-sail-muted leading-relaxed">
                    {plan.qc.map((q, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-sail-faint">□</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>

            <ExportPanel plan={plan} assets={assets} recipe={recipe} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AssetRow({ asset: a, onRemove, onRelabel }) {
  const L = a.label;
  return (
    <div className="flex gap-2.5 p-2 rounded-xl border border-sail-line hover:bg-sail-tint group">
      <div className="relative shrink-0">
        {a.thumb ? (
          <img src={a.thumb} alt="" className="w-12 h-16 object-cover rounded-lg" />
        ) : (
          <div className="w-12 h-16 rounded-lg bg-sail-line" />
        )}
        <span className="absolute bottom-0.5 left-0.5 p-0.5 rounded bg-black/55 text-white">
          {a.kind === 'video' ? <VideoIcon size={9} /> : <ImageIcon size={9} />}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-sail-ink truncate">{a.name}</p>
            <p className="text-[10px] text-sail-faint">
              {a.id} · {a.kind === 'video' ? `${a.duration?.toFixed(1)}s` : `${a.width}×${a.height}`} ·{' '}
              {fmtBytes(a.size)}
            </p>
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {!a.labeling && (
              <button onClick={onRelabel} title="重新标注" className="p-1 rounded text-sail-faint hover:bg-sail-line">
                <RefreshCw size={11} />
              </button>
            )}
            <button onClick={onRemove} className="p-1 rounded text-sail-faint hover:bg-sail-line">
              <X size={12} />
            </button>
          </div>
        </div>

        {a.labeling ? (
          <p className="text-[11px] text-sail-faint mt-1 flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" /> AI 正在看…
          </p>
        ) : a.labelError ? (
          <p className="text-[11px] text-sail-danger mt-1">{a.labelError}</p>
        ) : L ? (
          <div className="mt-1">
            <p className="text-[11px] text-sail-muted leading-snug line-clamp-2">{L.summary}</p>
            {a.kind === 'video' && L.best_moments?.length > 0 && (
              <p className="text-[10px] text-sail-green mt-0.5">
                可用 {L.best_moments.map((m) => `${m.start?.toFixed(1)}-${m.end?.toFixed(1)}s`).join(' · ')}
              </p>
            )}
            {a.kind === 'image' && L.hero_score != null && (
              <p className="text-[10px] text-sail-brown mt-0.5">Hero {L.hero_score}/10 · {L.motion_suggestion}</p>
            )}
            {L.issues?.length > 0 && <p className="text-[10px] text-sail-warn mt-0.5">⚠ {L.issues[0]}</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
