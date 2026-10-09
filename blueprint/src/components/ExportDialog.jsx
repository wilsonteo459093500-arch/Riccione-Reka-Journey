// 导出 PPT：体检（逐页提示，可跳到该页）→ 生成 .pptx（第 k / N 页）→ 自动下载；另可下载项目备份（.blueprint.zip）

import React, { useMemo, useRef, useState } from 'react';
import {
  Download, Loader2, CheckCircle2, AlertTriangle, ArrowUpRight, Archive, Presentation, ExternalLink, Type, Stamp, RotateCcw,
} from 'lucide-react';
import { renderDeck, exportableSlides } from '../engine/deck.js';
import { buildPptx } from '../engine/pptx/writer.js';
import { clientLine } from '../engine/model.js';
import { metaOf, loadForPptx, resolveUrl, isAssetSrc } from '../store/assets.js';
import { exportBundle } from '../lib/bundle.js';
import { downloadBlob } from '../lib/download.js';
import { pptxFileName, bundleFileName, formatBytes } from '../lib/format.js';
import { Modal, ProgressBar, cls } from '../lib/ui.jsx';

const FONT_LINKS = [
  { name: '思源宋体 Source Han Serif CN', href: 'https://github.com/adobe-fonts/source-han-serif/releases' },
  { name: 'Outfit', href: 'https://fonts.google.com/specimen/Outfit' },
];

/** 逐页体检：版式提示 + 图片缺失 */
function collectIssues(slides) {
  const out = [];
  slides.forEach((s, i) => {
    const msgs = [...(s.warnings || [])];
    const missing = (s.els || []).filter((el) => el.t === 'img' && el.src && isAssetSrc(el.src) && !resolveUrl(el.src)).length;
    if (missing) msgs.push(missing > 1 ? `${missing} 张图片在本机找不到` : '有一张图片在本机找不到');
    if (msgs.length) out.push({ key: s.key, slideId: s.slideId, page: i + 1, label: s.label, msgs: [...new Set(msgs)] });
  });
  return out;
}

/** writer 的提示里带着 'asset:…' 引用，换成更好懂的说法 */
const friendlyWriterWarning = (w) => String(w).replace(/asset:[\w-]+/g, '项目图片').replace(/\/template\/[\w.-]+/g, '模板图片');

export default function ExportDialog({ project, notify, onClose, onGoTab }) {
  const rendered = useMemo(() => renderDeck(project, { meta: metaOf }), [project]);
  const slides = useMemo(() => exportableSlides(rendered), [rendered]);
  const issues = useMemo(() => collectIssues(slides), [slides]);
  const hidden = rendered.length - slides.length;
  const filename = pptxFileName(project);

  const [phase, setPhase] = useState('ready'); // 'ready' | 'building' | 'done' | 'error'
  const [prog, setProg] = useState({ done: 0, total: slides.length });
  const [result, setResult] = useState(null); // { blob, filename, warnings }
  const [error, setError] = useState('');
  const [backup, setBackup] = useState(null); // null | 'n/N' | '打包 n%'
  const frame = useRef(0);

  const building = phase === 'building';

  async function build() {
    if (building || !slides.length) return;
    setPhase('building');
    setError('');
    setProg({ done: 0, total: slides.length });
    const info = project.info || {};
    try {
      const { file, warnings } = await buildPptx(slides, {
        loadImage: loadForPptx,
        onProgress: (done, total) => {
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => setProg({ done, total }));
        },
        title: [clientLine(info) || project.name, 'Dreamhouse Blueprint'].filter(Boolean).join(' · '),
        author: 'Riccione Reka',
      });
      cancelAnimationFrame(frame.current);
      const res = { blob: file, filename, warnings: [...new Set((warnings || []).map(friendlyWriterWarning))] };
      setResult(res);
      setPhase('done');
      downloadBlob(file, filename);
    } catch (e) {
      cancelAnimationFrame(frame.current);
      setError(e?.message || String(e));
      setPhase('error');
    }
  }

  async function downloadBackup() {
    if (backup) return;
    setBackup('准备中…');
    try {
      const { blob, missing } = await exportBundle(project, {
        onProgress: (stage, done, total) => setBackup(stage === 'zip' ? `打包 ${done}%` : `${done}/${total}`),
      });
      downloadBlob(blob, bundleFileName(project));
      notify?.({ type: 'ok', text: `项目备份已下载（${formatBytes(blob.size)}）—— 换电脑时在首页「导入项目备份」即可恢复` });
      if (missing) notify?.({ type: 'warn', text: `有 ${missing} 张图片在本机找不到，没能放进备份。` });
    } catch (e) {
      notify?.({ type: 'error', text: `备份失败：${e?.message || e}` });
    } finally {
      setBackup(null);
    }
  }

  const jump = (slideId) => onGoTab?.('pages', slideId);
  const sliding = prog.total ? prog.done / prog.total : 0;
  const packing = building && prog.total > 0 && prog.done >= prog.total;

  return (
    <Modal
      title="导出 PPT"
      icon={<Presentation size={18} className="text-bp-gold" />}
      onClose={onClose}
      busy={building}
      width="max-w-2xl"
      footer={
        <>
          <button type="button" onClick={downloadBackup} disabled={!!backup || building} className={cls.btnGhost} title="项目 + 全部图片打成一个 .blueprint.zip，换电脑或留底用">
            {backup ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
            {backup ? `备份中 ${backup}` : '下载项目备份'}
          </button>
          <div className="flex-1" />
          {phase === 'done' ? (
            <>
              <button type="button" onClick={() => downloadBlob(result.blob, result.filename)} className={cls.btnGhost}>
                <Download size={15} /> 再次下载
              </button>
              <button type="button" onClick={onClose} className={cls.btnPrimary} autoFocus>
                完成
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={building} className={cls.btnGhost}>
                取消
              </button>
              <button type="button" onClick={build} disabled={building || !slides.length} className={cls.btnPrimary} autoFocus>
                {building ? <Loader2 size={15} className="animate-spin" /> : phase === 'error' ? <RotateCcw size={15} /> : <Download size={15} />}
                {building ? '生成中…' : phase === 'error' ? '重试' : `导出 ${slides.length} 页`}
              </button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* 文件 */}
        <div className="flex items-center gap-3 rounded-xl bg-bp-tint border border-bp-line px-4 py-3">
          <Presentation size={22} className="text-bp-eyebrow shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-bp-ink truncate" title={filename}>
              {filename}
            </div>
            <div className="text-[11px] text-bp-faint">
              {slides.length} 页 · 16:9{hidden ? ` · 另有 ${hidden} 页已隐藏（不导出）` : ''}
              {result ? ` · ${formatBytes(result.blob.size)}` : ''}
            </div>
          </div>
        </div>

        {phase === 'building' && (
          <div className="space-y-2" aria-live="polite">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-bp-ink">{packing ? '打包成 .pptx…' : `正在生成第 ${Math.min(prog.done + 1, prog.total)} / ${prog.total} 页`}</span>
              <span className="text-xs text-bp-faint tabular-nums">{Math.round(sliding * 100)}%</span>
            </div>
            <ProgressBar value={packing ? 1 : sliding} />
            <p className="text-[11px] text-bp-faint">图片多时需要十几秒，请不要关闭窗口。</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex items-start gap-2.5 rounded-xl bg-bp-danger/10 text-bp-danger text-sm p-3" role="alert">
            <AlertTriangle size={17} className="shrink-0 mt-0.5" />
            <span>导出失败：{error}</span>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="rounded-xl border border-bp-green/30 bg-bp-green/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-bp-green font-medium">
              <CheckCircle2 size={18} /> 已导出 {slides.length} 页 · {formatBytes(result.blob.size)}，浏览器已开始下载
            </div>
            <ul className="text-sm text-bp-muted space-y-1.5 leading-relaxed list-disc pl-5">
              <li>在 PowerPoint / WPS 里打开即可继续改字、换图 —— 每段文字都是文本框，每张图都能「更改图片」。</li>
              <li>发给客户前，建议在 PowerPoint 里「文件 → 导出 → PDF」再存一份 PDF，对方电脑没装字体也不会走样。</li>
            </ul>
            {result.warnings.length > 0 && (
              <details className="text-xs text-bp-warn">
                <summary className="cursor-pointer">导出时有 {result.warnings.length} 条提示（对应的图片会空着）</summary>
                <ul className="mt-1.5 space-y-0.5 pl-4 list-disc">
                  {result.warnings.slice(0, 30).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* 体检 */}
        {phase !== 'done' && (
          <div>
            <div className="text-xs font-semibold text-bp-faint mb-2">导出前检查</div>
            {issues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-bp-green">
                <CheckCircle2 size={16} /> 每一页都没问题
              </div>
            ) : (
              <ul className="rounded-xl border border-bp-line divide-y divide-bp-line max-h-56 overflow-y-auto thin-scroll">
                {issues.map((it) => (
                  <li key={it.key} className="flex items-start gap-3 px-3 py-2">
                    <span className="mt-0.5 text-[11px] text-bp-faint tabular-nums w-10 shrink-0">P{it.page}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-bp-ink truncate">{it.label}</div>
                      {it.msgs.map((m) => (
                        <div key={m} className="text-xs text-bp-warn leading-snug">
                          {m}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => jump(it.slideId)}
                      disabled={building}
                      className="shrink-0 inline-flex items-center gap-0.5 text-xs text-bp-eyebrow hover:underline disabled:opacity-50"
                    >
                      去这页 <ArrowUpRight size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!project.cover?.image && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-bp-line bg-bp-tint px-3 py-2 text-xs text-bp-muted">
                <Stamp size={14} className="shrink-0 mt-px text-bp-gold" />
                <span className="flex-1">
                  方案封面还没用 Material Board，会先用默认的「方案 · 设计图」章节页。
                  <button type="button" onClick={() => onGoTab?.('board')} disabled={building} className="ml-1 text-bp-eyebrow hover:underline">
                    去做封面
                  </button>
                </span>
              </div>
            )}
          </div>
        )}

        {/* 字体 */}
        <div className="flex items-start gap-2.5 text-xs text-bp-muted leading-relaxed">
          <Type size={15} className="shrink-0 mt-0.5 text-bp-gold" />
          <div>
            PPT 用到三款字体：<b className="font-medium text-bp-ink">思源宋体（Source Han Serif CN）</b>、
            <b className="font-medium text-bp-ink">Outfit</b>、<b className="font-medium text-bp-ink">Ogg</b>。电脑上没装时会用替代字体显示，
            排版可能略有出入。免费下载：
            {FONT_LINKS.map((f, i) => (
              <React.Fragment key={f.href}>
                {i ? '、' : ''}
                <a href={f.href} target="_blank" rel="noreferrer" className="text-bp-eyebrow underline underline-offset-2 inline-flex items-center gap-0.5">
                  {f.name} <ExternalLink size={11} />
                </a>
              </React.Fragment>
            ))}
            （Ogg 是商用字体，没装时会自动替换）。
          </div>
        </div>
      </div>
    </Modal>
  );
}
