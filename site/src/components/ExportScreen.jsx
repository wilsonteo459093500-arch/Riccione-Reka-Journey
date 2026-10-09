// 预览 & 导出：PDF / Word / Excel / WhatsApp 文案 + 照片
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './ui/Icon.jsx';
import { TopBar, Spinner, useUI, Empty } from './ui/UI.jsx';
import SummaryCard from './SummaryCard.jsx';
import { useStore } from '../lib/store.jsx';
import { getTemplate } from '../templates/index.js';
import { issues as listIssues, makeCtx, siteLabel } from '../lib/report.js';
import { buildDocModel } from '../lib/docmodel.js';
import { createMediaLoader, getMedia } from '../lib/db.js';
import { exportReport, FORMATS } from '../lib/export/index.js';
import { buildText, photoListForShare } from '../lib/text.js';
import { copyText, shareFile, shareFiles, downloadBlob, openWhatsApp, mediaToFile } from '../lib/share.js';
import { fmtBytes } from '../lib/images.js';
import { navigate, goBack } from '../lib/router.js';

const DocPreview = lazy(() => import('./doc/DocPreview.jsx'));

function FormatRow({ fmt, state, onGenerate, onShare, onDownload, primary }) {
  const f = FORMATS[fmt];
  const busy = state?.status === 'busy';
  const ready = state?.status === 'ready';
  return (
    <div data-format={fmt} className={`card p-3 ${primary ? 'ring-2 ring-terra/40' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2 ${fmt === 'pdf' ? 'bg-fail/10 text-fail' : fmt === 'docx' ? 'bg-[#2B579A]/10 text-[#2B579A]' : 'bg-pass/10 text-pass'}`}>
          <Icon name={f.icon} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">
            {f.zh} <span className="text-[12px] font-normal text-ink-mute">.{f.ext}</span>
          </div>
          <div className="truncate text-[12px] text-ink-mute">
            {busy
              ? state.progress
                ? `生成中… ${state.progress}`
                : '生成中…'
              : ready
                ? `${fmtBytes(state.blob.size)} · 已生成，可分享`
                : state?.status === 'error'
                  ? `失败：${state.error}`
                  : fmt === 'pdf'
                    ? '发客户 / 发群 / 打印'
                    : fmt === 'docx'
                      ? '可再编辑的 Word 文档'
                      : '表格版，方便统计 / 导入 Lark'}
          </div>
        </div>
        {!ready && (
          <button className={`${primary ? 'btn-accent' : 'btn-soft'} shrink-0 px-4 py-2.5 text-[14px]`} disabled={busy} onClick={onGenerate}>
            {busy ? <Spinner /> : <Icon name="Wand2" size={16} />} 生成
          </button>
        )}
      </div>
      {ready && (
        <div className="mt-3 flex gap-2">
          <button className="btn-accent flex-[2] py-2.5 text-[14px]" onClick={onShare}>
            <Icon name="Share2" size={17} /> 分享 / 发送
          </button>
          <button className="btn-ghost flex-1 py-2.5 text-[14px]" onClick={onDownload}>
            <Icon name="Download" size={17} /> 下载
          </button>
          <button className="btn-ghost shrink-0 px-3 py-2.5" onClick={onGenerate} aria-label="重新生成">
            <Icon name="RefreshCw" size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ExportScreen({ reportId }) {
  const store = useStore();
  const { toast } = useUI();
  const report = store.reports.find((r) => r.id === reportId);
  const template = report ? getTemplate(report.templateId) : null;
  const project = report?.projectId ? store.projectById(report.projectId) : null;
  const [files, setFiles] = useState({});
  const [shareMedia, setShareMedia] = useState(null);
  const [showPreview, setShowPreview] = useState(template?.kind !== 'message');
  const loader = useMemo(() => createMediaLoader(), []);
  const genAt = useRef({});

  useEffect(() => () => loader.dispose(), [loader]);

  const model = useMemo(
    () => (template && report ? buildDocModel({ template, report, project, settings: store.settings }) : null),
    [template, report, project, store.settings],
  );
  const text = useMemo(() => {
    if (!template || !report) return '';
    try {
      return buildText({ template, report, project, settings: store.settings });
    } catch (e) {
      return `（文案生成失败：${e.message}）`;
    }
  }, [template, report, project, store.settings]);
  const problems = useMemo(
    () => (template && report ? listIssues(template, report, { project, settings: store.settings }) : []),
    [template, report, project, store.settings],
  );
  const summary = useMemo(() => {
    if (!template?.summary || !report) return null;
    try {
      return template.summary(makeCtx({ template, report, project, settings: store.settings }));
    } catch {
      return null;
    }
  }, [template, report, project, store.settings]);

  // 预先把要分享的照片 / 视频读成 File（iOS 要求点击当下立即调用分享）
  useEffect(() => {
    if (!template || !report) return undefined;
    let alive = true;
    (async () => {
      const ids = photoListForShare(template, report);
      const out = [];
      let n = 0;
      for (const id of ids) {
        const m = await getMedia(id);
        if (m?.blob) out.push(mediaToFile(m, n++, m.kind === 'video' ? 'video' : 'photo'));
      }
      if (alive) setShareMedia(out);
    })();
    return () => {
      alive = false;
    };
  }, [template, report]);

  if (!store.ready) return null;
  if (!report || !template) {
    return (
      <>
        <TopBar title="导出" onBack={() => navigate('/', { replace: true })} />
        <Empty icon="CircleAlert" title="找不到这份报告" />
      </>
    );
  }

  const generate = async (fmt) => {
    setFiles((f) => ({ ...f, [fmt]: { status: 'busy' } }));
    try {
      const out = await exportReport(fmt, {
        template,
        report,
        project,
        settings: store.settings,
        media: loader,
        onProgress: (done, total) => setFiles((f) => ({ ...f, [fmt]: { status: 'busy', progress: `${done}/${total} 页` } })),
      });
      genAt.current[fmt] = report.updatedAt;
      setFiles((f) => ({ ...f, [fmt]: { status: 'ready', ...out } }));
    } catch (e) {
      console.error(e);
      setFiles((f) => ({ ...f, [fmt]: { status: 'error', error: e.message || String(e) } }));
      toast(`生成失败：${e.message || e}`, 'error');
    }
  };

  const share = async (fmt) => {
    const st = files[fmt];
    if (!st?.file) return;
    const res = await shareFile(st.file, { title: st.filename });
    if (res === 'downloaded') toast('这台设备不支持直接分享，已下载文件');
  };

  const markDone = async () => {
    const next = { ...report, status: report.status === 'done' ? 'draft' : 'done' };
    await store.saveReport(next);
    toast(next.status === 'done' ? '已标记为完成' : '已改回草稿');
  };

  const errors = problems.filter((p) => p.level === 'error');
  const warns = problems.filter((p) => p.level !== 'error');
  const isMsg = template.kind === 'message';
  const photosCount = shareMedia?.length || 0;

  const jumpTo = (p) => {
    window.__siteScrollTo = [p.target && `item-${p.target}`, p.target && `field-${p.target}`, p.sectionId && `sec-${p.sectionId}`].filter(Boolean);
    navigate(`/r/${report.id}`);
  };

  return (
    <div className="min-h-[100dvh] pb-10">
      <TopBar title={isMsg ? '文案 & 分享' : '预览 & 导出'} sub={project ? siteLabel(project) : template.name.zh} onBack={() => goBack(`/r/${report.id}`)} />
      <main className="mx-auto max-w-lg space-y-3 px-3 pt-3">
        {(errors.length > 0 || warns.length > 0) && (
          <details className="card overflow-hidden" open={errors.length > 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 p-3">
              <Icon name="TriangleAlert" size={18} className={errors.length ? 'text-fail' : 'text-[#C98A1B]'} />
              <div className="flex-1 text-[14px] font-semibold text-ink">
                {errors.length ? `${errors.length} 处必须补充` : ''}
                {errors.length && warns.length ? ' · ' : ''}
                {warns.length ? `${warns.length} 条提醒` : ''}
              </div>
              <span className="text-[12px] text-ink-mute">不影响导出</span>
            </summary>
            <div className="space-y-1 border-t border-line px-3 pb-3 pt-2">
              {[...errors, ...warns].map((p, i) => (
                <button key={i} className="flex w-full items-start gap-2 rounded-lg px-1 py-1.5 text-left text-[13px] leading-snug active:bg-cream" onClick={() => jumpTo(p)}>
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${p.level === 'error' ? 'bg-fail' : 'bg-[#C98A1B]'}`} />
                  <span className="flex-1 text-ink-soft">{p.text}</span>
                  {(p.target || p.sectionId) && <Icon name="ChevronRight" size={16} className="mt-0.5 text-ink-faint" />}
                </button>
              ))}
            </div>
          </details>
        )}

        {summary && !isMsg && <SummaryCard summary={summary} />}

        {isMsg && (
          <div className="card p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="MessageCircle" size={18} className="text-pass" />
              <div className="flex-1 text-[15px] font-bold text-ink">WhatsApp 文案</div>
              <button className="text-[13px] font-semibold text-terra" onClick={() => navigate(`/r/${report.id}`)}>
                修改内容
              </button>
            </div>
            <div className="max-h-[46dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-[#E7F3E2] px-3.5 py-3 font-sans text-[14px] leading-relaxed text-ink">
              {text}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="btn-primary py-3 text-[14px]"
                onClick={async () => {
                  const ok = await copyText(text);
                  toast(ok ? '已复制，去 WhatsApp 粘贴' : '复制失败，请长按文字手动复制', ok ? 'ok' : 'error');
                }}
              >
                <Icon name="Copy" size={17} /> 复制文案
              </button>
              <button className="btn btn-ghost py-3 text-[14px]" onClick={() => openWhatsApp(text)}>
                <Icon name="Send" size={17} /> 打开 WhatsApp
              </button>
            </div>
            {photosCount > 0 && (
              <div className="mt-2 grid grid-cols-1 gap-2">
                <button
                  className="btn-accent py-3 text-[14px]"
                  onClick={async () => {
                    const res = await shareFiles(shareMedia, { text });
                    if (res === 'unsupported') {
                      toast('这台设备不支持直接分享照片，请先复制文案，再在 WhatsApp 里选照片', 'warn');
                    }
                  }}
                >
                  <Icon name="Share2" size={17} /> 分享文案 + {photosCount} 个照片 / 视频
                </button>
                <div className="text-center text-[12px] leading-snug text-ink-mute">
                  iPhone 上 WhatsApp 有时只收照片不收文字：先点「复制文案」，分享照片后在对话里粘贴即可。
                </div>
              </div>
            )}
            {shareMedia === null && <div className="mt-2 text-center text-[12px] text-ink-mute">正在准备照片…</div>}
          </div>
        )}

        <div className="pt-1">
          <div className="mb-2 px-1 text-[13px] font-semibold text-ink-soft">{isMsg ? '也可以出一份文件存档' : '导出文件'}</div>
          <div className="space-y-2">
            {['pdf', 'docx', 'xlsx'].map((fmt) => (
              <FormatRow
                key={fmt}
                fmt={fmt}
                primary={fmt === 'pdf' && !isMsg}
                state={files[fmt]}
                onGenerate={() => generate(fmt)}
                onShare={() => share(fmt)}
                onDownload={() => files[fmt]?.blob && downloadBlob(files[fmt].blob, files[fmt].filename)}
              />
            ))}
          </div>
        </div>

        <button className={`btn w-full ${report.status === 'done' ? 'bg-pass/10 text-pass' : 'btn-ghost'}`} onClick={markDone}>
          <Icon name="CircleCheck" size={18} /> {report.status === 'done' ? '已完成（点此改回草稿）' : '标记为已完成'}
        </button>

        <div className="pt-2">
          <button className="flex w-full items-center gap-2 px-1 py-2 text-left" onClick={() => setShowPreview((s) => !s)}>
            <Icon name="Eye" size={18} className="text-ink-mute" />
            <span className="flex-1 text-[14px] font-semibold text-ink">文档预览（与 PDF 一致）</span>
            <Icon name={showPreview ? 'ChevronUp' : 'ChevronDown'} size={18} className="text-ink-mute" />
          </button>
          {showPreview && model && (
            <div className="-mx-3 rounded-none bg-[#E9E3D6] px-3 py-4">
              <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}>
                <DocPreview model={model} media={loader} />
              </Suspense>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
