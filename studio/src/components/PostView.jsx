import React, { useState } from 'react';
import {
  Send, ImageIcon, Download, Clock, MessageCircle, Hash, Repeat, ShieldAlert, Layers,
} from 'lucide-react';
import { Card, Btn, Field, TextArea, ChipRow, Tag, Empty, Fold, CopyBtn, DownloadBtn } from './ui/Bits.jsx';
import { PLATFORMS, platformById } from '../constants.js';
import { postPrompt, animatedPostPrompt } from '../prompts/post.js';
import { generateJSON, generateImage } from '../services/gemini.js';
import { downloadDataUrl } from '../services/media.js';
import { DOMAINS, IMAGE_SIZES, lintPrompt, safetyAdvice, domainById } from '../services/imagePrompt.js';
import { toHyperFrames } from '../services/exporters.js';

export default function PostView({ settings, notify, recipe, plan, assets, platformId, setPlatformId, onOpenSettings }) {
  const [topic, setTopic] = useState('');
  const [post, setPost] = useState(null);
  const [busy, setBusy] = useState(false);

  const [cover, setCover] = useState(null); // dataURL
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverRefId, setCoverRefId] = useState('');
  const [domainId, setDomainId] = useState('cover');
  const [imageSize, setImageSize] = useState('2K');
  const [coverIssue, setCoverIssue] = useState(null); // 安全拦截时的改写建议

  const [story, setStory] = useState(null);
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyTopic, setStoryTopic] = useState('');

  const p = platformById(platformId);

  async function handleGenerate() {
    if (!settings.apiKey) return onOpenSettings();
    if (!recipe && !topic.trim()) {
      notify({ type: 'warn', text: '先去「构思」做一份配方，或者在这里直接写清楚这条内容讲什么' });
      return;
    }
    setBusy(true);
    try {
      const out = await generateJSON(
        settings,
        [{ text: postPrompt({ platformId, recipe, plan, topic, settings }) }],
        { temperature: 0.85 }
      );
      setPost(out);
      setCover(null);
      notify({ type: 'ok', text: `${p.label} 的发布包写好了` });
    } catch (err) {
      notify({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleCover() {
    const raw = post?.cover?.prompt || plan?.cover?.prompt;
    if (!raw) return;
    setCoverBusy(true);
    setCoverIssue(null);
    try {
      const refAsset = assets.find((a) => a.id === coverRefId && a.kind === 'image');
      const d = domainById(domainId);

      // 模型偶尔还是会漏出「8K / photorealistic」这类被系统提示惩罚的词，出图前统一洗一遍
      let text = raw;
      if (refAsset) {
        text +=
          '\n\nUse the supplied photograph as the base: keep its subject, layout, materials and proportions ' +
          'unchanged — only re-light and re-compose it into the described cover. ' +
          'MUST leave clean negative space where the title type will sit.';
      }
      text += `\n\nCaptured with ${d.camera}. ${d.lighting}. ${d.anchor}.`;
      const { clean, removed } = lintPrompt(text);
      if (removed.length) {
        notify({ type: 'warn', text: `已洗掉会降质的词：${removed.join('、')}` });
      }

      const dataUrl = await generateImage(
        settings,
        clean,
        refAsset ? [refAsset.input] : null,
        p.aspect,
        (sec, n) => notify({ type: 'warn', text: `被限流，${sec} 秒后重试（${n}/3）` }),
        imageSize
      );
      setCover(dataUrl);
      notify({ type: 'ok', text: `封面出好了（${d.label} · ${imageSize}）—— 大字自己叠，模型写中文字不稳` });
    } catch (err) {
      if (err.safetyBlocked) {
        setCoverIssue(safetyAdvice(raw));
        notify({ type: 'error', text: err.message });
      } else {
        notify({ type: 'error', text: err.message });
      }
    } finally {
      setCoverBusy(false);
    }
  }

  async function handleStoryboard() {
    if (!settings.apiKey) return onOpenSettings();
    setStoryBusy(true);
    try {
      const out = await generateJSON(
        settings,
        [
          {
            text: animatedPostPrompt({
              topic: storyTopic || topic || recipe?.title,
              platformId,
              settings,
              slideCount: 5,
            }),
          },
        ],
        { temperature: 0.8 }
      );
      setStory(out);
      notify({ type: 'ok', text: '动态帖分镜好了 —— 下面可以直接预览和导出' });
    } catch (err) {
      notify({ type: 'error', text: err.message });
    } finally {
      setStoryBusy(false);
    }
  }

  // 合成尺寸按平台画幅走；预览按 1/4 缩放塞进侧栏
  const compW = 1080;
  const compH = p.aspect === '3:4' ? 1440 : 1920;
  const PREVIEW_SCALE = 0.25;
  const storyHtml = story ? toHyperFrames(story, { width: compW, height: compH }) : '';

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr] items-start">
      {/* ---------------- 左 ---------------- */}
      <div className="space-y-4 lg:sticky lg:top-20">
        <Card title="发到哪" sub="同一条内容，换个平台文案要重写">
          <ChipRow options={PLATFORMS} value={platformId} onChange={setPlatformId} />
          <p className="text-xs text-sail-faint mt-3 leading-relaxed">{p.notes}</p>
        </Card>

        <Card title="内容是什么" sub={recipe ? '已经带上了「构思」里的配方' : '还没有配方，直接写清楚也行'}>
          {recipe && (
            <div className="rounded-xl bg-sail-tint border border-sail-line p-3 mb-3">
              <p className="text-sm font-medium text-sail-ink">{recipe.title}</p>
              <p className="text-xs text-sail-faint mt-0.5">{recipe.one_liner}</p>
              {plan && (
                <p className="text-xs text-sail-faint mt-1">
                  成片 {plan.timeline?.length} 拍 · {plan.target_duration_s || '?'}s
                </p>
              )}
            </div>
          )}
          <Field label={recipe ? '补充说明（可选）' : '这条内容讲什么'}>
            <TextArea
              rows={4}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={
                recipe
                  ? '如：这次想突出预算控制，客户是首次装修的年轻夫妻'
                  : '如：吉隆坡 950 尺三房，18 万全包，重点讲玄关柜怎么把储物做到 2 倍'
              }
            />
          </Field>
          <Btn className="w-full mt-3" busy={busy} icon={busy ? undefined : Send} onClick={handleGenerate}>
            {busy ? '写作中…' : `生成 ${p.label} 发布包`}
          </Btn>
        </Card>

        <Card title="动态图文帖" sub="不用拍视频 —— 5 屏文字动画，HyperFrames 渲成 MP4">
          <Field label="主题（留空就用上面的内容）">
            <TextArea
              rows={2}
              value={storyTopic}
              onChange={(e) => setStoryTopic(e.target.value)}
              placeholder="如：装修最容易后悔的 5 个决定"
            />
          </Field>
          <Btn variant="soft" className="w-full mt-3" busy={storyBusy} icon={storyBusy ? undefined : Layers} onClick={handleStoryboard}>
            {storyBusy ? '设计中…' : '设计动态帖'}
          </Btn>
        </Card>
      </div>

      {/* ---------------- 右 ---------------- */}
      <div className="space-y-4">
        {!post && !story ? (
          <Card>
            <Empty icon={Send} title="还没有发布包">
              点左边生成。会给你 <strong>5 条不同角度的标题</strong>、可以直接粘贴的正文、
              标签与搜索词、封面创意（还能直接出图）、抢占第一条评论的话术，以及搬去别的平台要改什么。
            </Empty>
          </Card>
        ) : null}

        {post && (
          <>
            <Card title="标题" sub="5 个角度，挑一个或 A/B 测">
              <div className="space-y-2">
                {(post.titles || []).map((t, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-xl border border-sail-line hover:bg-sail-tint">
                    <span className="text-xs font-mono text-sail-faint mt-1 shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-sail-ink leading-snug">{t.text}</p>
                      <p className="text-xs text-sail-faint mt-1">
                        <span className="text-sail-brown">{t.angle}</span> · {t.why}
                      </p>
                    </div>
                    <CopyBtn text={t.text} label="" />
                  </div>
                ))}
              </div>
            </Card>

            <Card title="正文" right={<CopyBtn text={post.caption} label="复制正文" />}>
              <div className="text-sm text-sail-ink whitespace-pre-wrap leading-relaxed rounded-xl bg-sail-tint border border-sail-line p-4">
                {post.caption}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(post.hashtags || []).map((h, i) => (
                  <Tag key={i} color="#3D5A4A">
                    {h}
                  </Tag>
                ))}
              </div>
              {post.keywords?.length > 0 && (
                <p className="text-xs text-sail-faint mt-2.5 flex items-start gap-1.5">
                  <Hash size={12} className="mt-0.5 shrink-0" />
                  站内搜索词：{post.keywords.join(' · ')}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <CopyBtn text={`${post.caption}\n\n${(post.hashtags || []).join(' ')}`} label="复制正文 + 标签" />
              </div>
            </Card>

            {/* 封面 */}
            <Card title="封面" sub={post.cover?.concept}>
              <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                <div className="space-y-2.5">
                  <div>
                    <span className="text-xs font-semibold text-sail-faint">大字</span>
                    <p className="text-lg font-display font-semibold text-sail-ink leading-tight">
                      {post.cover?.title_text}
                    </p>
                    {post.cover?.subtitle && <p className="text-sm text-sail-muted">{post.cover.subtitle}</p>}
                  </div>
                  <p className="text-xs text-sail-muted leading-relaxed">排版：{post.cover?.layout}</p>

                  {assets.some((a) => a.kind === 'image') && (
                    <Field label="用一张案例图当底（可选）" hint="选了就是「改这张图」，不选就是纯生成">
                      <select
                        value={coverRefId}
                        onChange={(e) => setCoverRefId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-sail-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-sail-green"
                      >
                        <option value="">不用底图</option>
                        {assets
                          .filter((a) => a.kind === 'image')
                          .map((a) => (
                            <option key={a._uid} value={a.id}>
                              {a.name}
                              {a.label?.hero_score != null ? `（Hero ${a.label.hero_score}/10）` : ''}
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}

                  <Field label="拍法" hint={domainById(domainId).desc}>
                    <ChipRow options={DOMAINS} value={domainId} onChange={setDomainId} />
                  </Field>

                  <Field label="出图尺寸" hint="按需求选，不要靠在 prompt 里写「8K」—— 那个词反而会降质">
                    <ChipRow options={IMAGE_SIZES} value={imageSize} onChange={setImageSize} />
                  </Field>

                  {coverIssue && (
                    <div className="rounded-xl border border-sail-danger/40 bg-sail-danger/5 p-3.5">
                      <p className="text-xs font-semibold text-sail-danger mb-1.5">被安全过滤器拦下了，重试没用</p>
                      <ul className="space-y-1 text-xs text-sail-muted leading-relaxed">
                        {coverIssue.reasons.map((r, i) => (
                          <li key={`r${i}`}>· {r}</li>
                        ))}
                      </ul>
                      <p className="text-[11px] font-semibold text-sail-faint mt-2 mb-1">怎么改：</p>
                      <ul className="space-y-1 text-xs text-sail-muted leading-relaxed">
                        {coverIssue.suggestions.map((s, i) => (
                          <li key={`s${i}`}>{i + 1}. {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Btn size="sm" busy={coverBusy} icon={coverBusy ? undefined : ImageIcon} onClick={handleCover}>
                      {coverBusy ? '出图中…' : '生成封面图'}
                    </Btn>
                    <CopyBtn text={post.cover?.prompt || ''} label="复制出图 prompt" />
                    {cover && (
                      <Btn
                        size="sm"
                        variant="ghost"
                        icon={Download}
                        onClick={() => downloadDataUrl(cover, `封面_${p.id}.jpg`)}
                      >
                        下载
                      </Btn>
                    )}
                  </div>
                  <p className="text-[11px] text-sail-faint leading-relaxed">
                    出图只负责画面和留白 —— 中文大字建议自己叠上去，模型写中文字容易出错别字。
                  </p>
                </div>

                <div className="rounded-xl overflow-hidden border border-sail-line bg-sail-tint aspect-[3/4] flex items-center justify-center">
                  {cover ? (
                    <img src={cover} alt="封面" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={22} className="text-sail-faint" strokeWidth={1.5} />
                  )}
                </div>
              </div>
            </Card>

            {/* 运营动作 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card title="第一条评论" sub="自己抢，用来补关键词和引导">
                <p className="text-sm text-sail-ink leading-relaxed">{post.first_comment}</p>
                <div className="mt-2">
                  <CopyBtn text={post.first_comment || ''} />
                </div>
              </Card>

              <Card title="发布时间">
                <p className="text-sm text-sail-ink leading-relaxed flex items-start gap-2">
                  <Clock size={14} className="text-sail-brown mt-0.5 shrink-0" />
                  {post.post_time}
                </p>
              </Card>
            </div>

            <div className="space-y-3">
              {post.reply_bait && (
                <Fold title="评论区钩子" open>
                  <p className="text-sm text-sail-muted leading-relaxed flex items-start gap-2">
                    <MessageCircle size={14} className="text-sail-green mt-0.5 shrink-0" />
                    {post.reply_bait}
                  </p>
                </Fold>
              )}

              <Fold title="备用开场白（A/B 测）" count={post.hook_variants?.length}>
                <ul className="space-y-2">
                  {(post.hook_variants || []).map((h, i) => (
                    <li key={i} className="text-sm text-sail-muted flex items-start gap-2">
                      <span className="text-xs font-mono text-sail-faint mt-0.5">{i + 1}</span>
                      {h}
                    </li>
                  ))}
                </ul>
              </Fold>

              <Fold title="搬到别的平台" count={post.repurpose?.length}>
                <div className="space-y-2.5">
                  {(post.repurpose || []).map((r, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-sail-ink flex items-center gap-1.5">
                        <Repeat size={13} className="text-sail-brown" />
                        {platformById(r.platform).label}
                      </span>
                      <p className="text-xs text-sail-muted mt-0.5 leading-relaxed">{r.tweak}</p>
                    </div>
                  ))}
                </div>
              </Fold>

              {post.risk_check?.length > 0 && (
                <Fold title="发之前看一眼" count={post.risk_check.length}>
                  <ul className="space-y-1.5">
                    {post.risk_check.map((r, i) => (
                      <li key={i} className="text-sm text-sail-muted flex items-start gap-2">
                        <ShieldAlert size={13} className="text-sail-warn mt-0.5 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </Fold>
              )}
            </div>
          </>
        )}

        {/* 动态帖 */}
        {story && (
          <Card
            title={`动态帖 · ${story.title}`}
            sub={`${story.slides?.length} 屏 · ${story.total_duration_s}s · HyperFrames 可直接渲染`}
            right={
              <div className="flex gap-2">
                <DownloadBtn
                  filename={`post_${(story.title || 'animated').replace(/[^\w一-龥-]/g, '_')}.html`}
                  text={storyHtml}
                  mime="text/html"
                  label="下载 HTML"
                />
              </div>
            }
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <div className="space-y-2">
                {(story.slides || []).map((s) => (
                  <div key={s.index} className="p-3 rounded-xl border border-sail-line">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-mono text-sail-faint">{String(s.index).padStart(2, '0')}</span>
                      <Tag color="#6B6358">{s.duration_s}s</Tag>
                      <Tag color="#A87C4F">{s.bg_kind}</Tag>
                    </div>
                    <p className="text-base font-display font-semibold text-sail-ink leading-snug">{s.headline}</p>
                    {s.sub && <p className="text-sm text-sail-muted mt-0.5">{s.sub}</p>}
                    <p className="text-xs text-sail-faint mt-1.5 leading-relaxed">动效：{s.motion}</p>
                    {s.image_prompt && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[11px] text-sail-faint truncate flex-1">配图：{s.image_prompt}</span>
                        <CopyBtn text={s.image_prompt} label="" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div
                  className="relative overflow-hidden rounded-xl border border-sail-line bg-white mx-auto"
                  style={{ width: compW * PREVIEW_SCALE, height: compH * PREVIEW_SCALE }}
                >
                  <iframe
                    title="动态帖预览"
                    srcDoc={storyHtml}
                    sandbox=""
                    scrolling="no"
                    className="absolute top-0 left-0 origin-top-left"
                    style={{
                      border: 0,
                      width: compW,
                      height: compH,
                      transform: `scale(${PREVIEW_SCALE})`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-sail-faint leading-relaxed">
                  这是真实渲染的第一屏。下载 HTML 后用{' '}
                  <code className="font-mono bg-sail-tint px-1 rounded">npx hyperframes render</code> 出 MP4，
                  或者直接浏览器打开录屏。
                </p>
                {story.caption && (
                  <div className="rounded-xl bg-sail-tint border border-sail-line p-3">
                    <p className="text-xs text-sail-muted whitespace-pre-wrap leading-relaxed">{story.caption}</p>
                    <div className="mt-2">
                      <CopyBtn text={`${story.caption}\n\n${(story.hashtags || []).join(' ')}`} label="复制文案" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
