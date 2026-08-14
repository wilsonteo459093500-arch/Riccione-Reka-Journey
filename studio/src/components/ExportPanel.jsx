import React, { useMemo, useState } from 'react';
import { ExternalLink, Terminal, FileJson, Subtitles, ListTree, Bot } from 'lucide-react';
import { Card, Btn, CopyBtn, DownloadBtn, Fold, TextInput, Field } from './ui/Bits.jsx';
import { PIPELINES } from '../constants.js';
import {
  toEDL, toSRT, toShotList, toClaudePrompt, toVyraPrompt, toProjectMd, captionsFromTimeline,
} from '../services/exporters.js';

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

        {/* 首选路径 */}
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
