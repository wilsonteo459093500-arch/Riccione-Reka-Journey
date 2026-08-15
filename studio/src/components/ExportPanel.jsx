import React, { useMemo, useState } from 'react';
import { ExternalLink, Terminal, FileJson, Subtitles, ListTree, Bot, Sparkles, Film, Scissors, Zap } from 'lucide-react';
import { Card, Btn, CopyBtn, DownloadBtn, Fold, TextInput, Field } from './ui/Bits.jsx';
import { PIPELINES } from '../constants.js';
import {
  toEDL, toSRT, toShotList, toClaudePrompt, toVyraPrompt, toProjectMd, toHiggsfieldPrompts, toSeedancePrompt,
  toJianyingGuide, toVibeMotionOverlays, captionsFromTimeline,
} from '../services/exporters.js';
import { toDraftScripts } from '../services/cutscript.js';

/**
 * 出片交接面板 —— 网站负责「想清楚怎么剪」，这里把方案翻译成
 * 各条渲染流水线真正吃得下的文件和指令。
 */
export default function ExportPanel({ plan, assets, recipe }) {
  const [dir, setDir] = useState('.');

  const bundle = useMemo(() => {
    const captions = plan.captions?.length ? plan.captions : captionsFromTimeline(plan.timeline);
    return {
      edl: JSON.stringify(toEDL(plan, assets, { dir }), null, 2),
      srt: toSRT(captions),
      shots: toShotList(plan, assets, recipe),
      claude: toClaudePrompt(plan, assets, recipe),
      vyra: toVyraPrompt(plan, assets, recipe),
      projectMd: toProjectMd(plan, recipe, assets),
      higgsfield: toHiggsfieldPrompts(plan, recipe),
      seedance: toSeedancePrompt(plan, assets),
      jianying: toJianyingGuide(plan, assets, recipe),
      vibeOverlays: toVibeMotionOverlays(plan, recipe),
      draft: toDraftScripts(plan, assets),
    };
  }, [plan, assets, recipe, dir]);

  const slug = (recipe?.title || 'edit').replace(/[^\w一-龥-]/g, '_').slice(0, 24);

  return (
    <Card
      title="出片交接"
      sub="网站把「怎么剪」想清楚了；下面这些文件负责把它变成真正的 MP4"
    >
      <div className="space-y-4">
        <Field
          label="素材所在目录"
          hint="导出的 edl.json 里会用这个前缀拼素材路径。填成你电脑上放原片的那个文件夹。"
        >
          <TextInput value={dir} onChange={(e) => setDir(e.target.value)} placeholder="/Users/wilson/Videos/项目A" />
        </Field>

        {/* 最快路径 · 一键出草稿 */}
        {bundle.draft.segments > 0 && (
          <div className="rounded-xl border-2 border-sail-green-deep/40 bg-sail-green/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-sail-green-deep" />
              <span className="text-sm font-semibold text-sail-ink">先出草稿 · 双击就出片</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sail-green-deep/15 text-sail-green-deep font-medium">
                不用 AI，不用配置
              </span>
            </div>
            <p className="text-xs text-sail-muted leading-relaxed mb-3">
              把脚本和 <code className="font-mono text-[11px] bg-white px-1 rounded">master.srt</code> 放进素材文件夹，
              <strong className="text-sail-ink">双击</strong> —— 按上面的时间轴自动切段、变速、静图缓推、调色、拼接、烧字幕，
              出一版 {bundle.draft.res} 草稿（{bundle.draft.segments} 段）。
              电脑装过一次 ffmpeg 就行（Windows：<code className="font-mono text-[11px] bg-white px-1 rounded">winget install ffmpeg</code>）。
              <strong className="text-sail-ink">草稿只用来审节奏和切点</strong>，确认了再进剪映做终稿 ——
              审片循环从手剪半小时压到跑脚本一分钟。
            </p>
            {bundle.draft.warnings.length > 0 && (
              <ul className="text-[11px] text-sail-brown leading-relaxed mb-2 space-y-0.5">
                {bundle.draft.warnings.map((w, i) => (
                  <li key={i}>! {w}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <DownloadBtn filename="出草稿.bat" text={bundle.draft.bat} mime="text/plain" label="Windows 脚本" />
              <DownloadBtn filename="draft.sh" text={bundle.draft.sh} mime="text/plain" label="Mac 脚本" />
              <DownloadBtn filename="master.srt" text={bundle.srt} label="master.srt" />
            </div>
          </div>
        )}

        {/* 首选路径 · 国内 */}
        <div className="rounded-xl border-2 border-sail-brown/40 bg-sail-tint p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scissors size={16} className="text-sail-brown" />
            <span className="text-sm font-semibold text-sail-ink">不碰命令行 · 剪映专业版</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sail-brown/15 text-sail-brown font-medium">
              零成本
            </span>
          </div>
          <p className="text-xs text-sail-muted leading-relaxed mb-3">
            操作单里每一个数字都算好了 —— 第几秒按 <code className="font-mono text-[11px] bg-white px-1 rounded">Ctrl+B</code> 分割、
            静图的关键帧缩放到百分之几、调色六个滑块各拉多少。字幕直接导{' '}
            <code className="font-mono text-[11px] bg-white px-1 rounded">master.srt</code>，
            <strong className="text-sail-ink">不用重新对轴</strong>。
            方案里有静图的话，末尾还附了一份即梦的生成清单（你的会员权益里有免费额度）。
          </p>
          <div className="flex flex-wrap gap-2">
            <DownloadBtn
              filename={`剪映操作单_${slug}.md`}
              text={bundle.jianying}
              mime="text/markdown"
              label="下载操作单"
            />
            <CopyBtn text={bundle.jianying} label="复制" />
            <DownloadBtn filename="master.srt" text={bundle.srt} label="master.srt" />
          </div>
        </div>

        {/* 首选路径 · 命令行 */}
        <div className="rounded-xl border-2 border-sail-green-deep/30 bg-sail-tint p-4">
          <div className="flex items-center gap-2 mb-2">
            <Terminal size={16} className="text-sail-green-deep" />
            <span className="text-sm font-semibold text-sail-ink">推荐路径 · video-use</span>
            <a
              href="https://github.com/browser-use/video-use"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sail-green underline inline-flex items-center gap-0.5"
            >
              仓库 <ExternalLink size={11} />
            </a>
          </div>
          <p className="text-xs text-sail-muted leading-relaxed mb-3">
            把素材放进一个文件夹，下载 <code className="font-mono text-[11px] bg-white px-1 rounded">edl.json</code> 和{' '}
            <code className="font-mono text-[11px] bg-white px-1 rounded">master.srt</code> 放进去，
            在该目录开 Claude Code，粘贴下面这段指令。它会用词级时间戳把每个切点吸附到词边界，逐段调色、拼接、烧字幕，
            最后自检。
          </p>
          <div className="flex flex-wrap gap-2">
            <CopyBtn text={bundle.claude} label="复制交接指令" />
            <DownloadBtn filename="edl.json" text={bundle.edl} mime="application/json" label="edl.json" />
            <DownloadBtn filename="master.srt" text={bundle.srt} label="master.srt" />
            <DownloadBtn filename="project.md" text={bundle.projectMd} label="project.md" />
          </div>
        </div>

        {/* 其它出口 */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-sail-line p-3.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Bot size={14} className="text-sail-brown" />
              <span className="text-sm font-medium text-sail-ink">Vyra（浏览器实时剪辑）</span>
            </div>
            <p className="text-xs text-sail-faint leading-relaxed mb-2.5">
              不想碰命令行就用它 —— 打开 Vyra，把素材传进项目，粘贴这段话让 Claude 直接搭时间线，改完即所见。
            </p>
            <CopyBtn text={bundle.vyra} label="复制 Vyra 指令" />
          </div>

          {bundle.seedance && (
            <div className="rounded-xl border border-sail-green/45 bg-sail-green/5 p-3.5 sm:col-span-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Film size={14} className="text-sail-green" />
                <span className="text-sm font-medium text-sail-ink">让静图真的动起来 · Seedance</span>
                <a
                  href="https://fal.ai/models/bytedance/seedance-2.5/image-to-video"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sail-green underline inline-flex items-center gap-0.5"
                >
                  模型 <ExternalLink size={11} />
                </a>
              </div>
              <p className="text-xs text-sail-faint leading-relaxed mb-2.5">
                方案里的静图默认走 Ken Burns（假的推拉）。Seedance 的 image-to-video 把
                <strong className="text-sail-muted">你自己的真实照片</strong>当第一帧，生成真的运镜和视差。
                指令已经算好每个镜头的时长和费用，并写死了一条边界：
                <strong className="text-sail-muted">柜门自己开、五金变形、木纹被重画 —— 一律退回普通缓推。</strong>
              </p>
              <CopyBtn text={bundle.seedance} label="复制运镜指令" />
            </div>
          )}

          {bundle.higgsfield && (
            <div className="rounded-xl border border-sail-gold/50 bg-sail-gold/5 p-3.5 sm:col-span-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={14} className="text-sail-gold" />
                <span className="text-sm font-medium text-sail-ink">
                  补缺口 · Higgsfield（{plan.gaps.length} 个镜头）
                </span>
                <a
                  href="https://higgsfield.ai/mcp"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sail-green underline inline-flex items-center gap-0.5"
                >
                  MCP <ExternalLink size={11} />
                </a>
              </div>
              <p className="text-xs text-sail-faint leading-relaxed mb-2.5">
                上面「还缺的素材」里那些拍不到的镜头，可以让 AI 生成。这段指令已经把画面、时长、
                画幅、调色一致性都写好了 —— 粘给连了 Higgsfield MCP 的 Claude 就能跑。
                <strong className="text-sail-muted">
                  只用来补空镜和氛围镜头；真实案例画面它会拒绝生成。
                </strong>
              </p>
              <CopyBtn text={bundle.higgsfield} label="复制补拍指令" />
            </div>
          )}

          {bundle.vibeOverlays && (
            <div className="rounded-xl border border-sail-line p-3.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={14} className="text-sail-gold" />
                <span className="text-sm font-medium text-sail-ink">
                  标题卡 · Vibe Motion（{plan.overlays.length} 张）
                </span>
              </div>
              <p className="text-xs text-sail-faint leading-relaxed mb-2.5">
                方案里的叠加图形卡。Vibe Motion 底层是 Claude + Remotion，
                <strong className="text-sail-muted">会连源码一起给你</strong> —— 以后换文案自己改了重渲，不用再花额度。
                指令里已经写死了「导出带 alpha 通道」，不然叠不上实拍画面。
              </p>
              <CopyBtn text={bundle.vibeOverlays} label="复制图形卡指令" />
            </div>
          )}

          <div className="rounded-xl border border-sail-line p-3.5">
            <div className="flex items-center gap-1.5 mb-1">
              <ListTree size={14} className="text-sail-brown" />
              <span className="text-sm font-medium text-sail-ink">分镜表（给人看的）</span>
            </div>
            <p className="text-xs text-sail-faint leading-relaxed mb-2.5">
              Markdown 格式，可以直接发给摄影师或剪辑，也可以自己照着在剪映 / Premiere 里手剪。
            </p>
            <div className="flex gap-2">
              <DownloadBtn filename={`分镜_${slug}.md`} text={bundle.shots} mime="text/markdown" label="下载" />
              <CopyBtn text={bundle.shots} />
            </div>
          </div>
        </div>

        <Fold title="预览导出内容">
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-sail-faint flex items-center gap-1">
                  <FileJson size={12} /> edl.json
                </span>
                <CopyBtn text={bundle.edl} />
              </div>
              <pre className="text-[10px] font-mono bg-sail-tint border border-sail-line rounded-lg p-3 overflow-auto max-h-56 thin-scroll">
                {bundle.edl}
              </pre>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-sail-faint flex items-center gap-1">
                  <Subtitles size={12} /> master.srt
                </span>
                <CopyBtn text={bundle.srt} />
              </div>
              <pre className="text-[10px] font-mono bg-sail-tint border border-sail-line rounded-lg p-3 overflow-auto max-h-40 thin-scroll">
                {bundle.srt || '（这条片子没有字幕）'}
              </pre>
            </div>
          </div>
        </Fold>

        <Fold title="四条渲染流水线怎么选">
          <div className="space-y-2.5">
            {PIPELINES.map((p) => (
              <div key={p.id} className="text-sm">
                <a
                  href={p.repo}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-sail-green-deep underline inline-flex items-center gap-0.5"
                >
                  {p.label} <ExternalLink size={11} />
                </a>
                <p className="text-xs text-sail-muted mt-0.5 leading-relaxed">{p.desc}</p>
                <p className="text-xs text-sail-faint mt-0.5">适合：{p.good}</p>
              </div>
            ))}
          </div>
        </Fold>
      </div>
    </Card>
  );
}
