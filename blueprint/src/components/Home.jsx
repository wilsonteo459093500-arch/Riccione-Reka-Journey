// 首页：拖入方案 PDF（或点击 / 粘贴）→ 导入；独立 Material Board 入口；四步说明；最近项目（打开 / 复制 / 删除）；存储用量；导入项目备份

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileUp, FileText, Copy, Trash2, Loader2, ArchiveRestore, HardDrive, ScanSearch, Stamp, Download, ImageOff, ArrowRight, LayoutGrid,
} from 'lucide-react';
import Header from './Header.jsx';
import ImportDialog from './ImportDialog.jsx';
import { listProjects, saveProject, storageEstimate } from '../store/db.js';
import { preloadProjectAssets, resolveUrl } from '../store/assets.js';
import { clientLine } from '../engine/model.js';
import { projectThumbSrc, projectStats } from '../lib/project.js';
import { duplicateProject, removeProjectEverywhere } from '../lib/projectOps.js';
import { importBundle } from '../lib/bundle.js';
import { waitForSaves } from '../lib/useProjectState.js';
import { timeAgo, formatBytes } from '../lib/format.js';
import { ConfirmDialog, cls } from '../lib/ui.jsx';

const isPdf = (f) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
const isZip = (f) => !!f && (/\.zip$/i.test(f.name || '') || /zip/.test(f.type || ''));
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

const STEPS = [
  { n: '01', icon: FileUp, title: '上传方案 PDF', text: '自动识别楼层、空间、效果图和材料小样' },
  { n: '02', icon: ScanSearch, title: '检查与修改', text: '逐页核对标题、材料和版式，点哪改哪' },
  { n: '03', icon: Stamp, title: 'Material Board 封面', text: '把本案材料排成一张大片，作为方案章节封面' },
  { n: '04', icon: Download, title: '导出可编辑 PPT', text: '在 PowerPoint / WPS 里还能继续改字、换图' },
];

export default function Home({ notify, onOpenProject, onOpenBoards, onOpenSettings, hasKey }) {
  const [projects, setProjects] = useState(null); // null = 读取中
  const [usage, setUsage] = useState(null);
  const [thumbTick, setThumbTick] = useState(0);
  const [importFile, setImportFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // project
  const [busy, setBusy] = useState(null); // { id, kind:'copy'|'delete', text? }
  const [restoring, setRestoring] = useState(null); // null | '读取中…' | 'n / N'
  const pdfInput = useRef(null);
  const zipInput = useRef(null);
  const blocked = useRef(false); // 导入 / 恢复中不接新文件
  blocked.current = !!importFile || !!restoring;

  const refresh = useCallback(async () => {
    await waitForSaves(); // 刚从编辑器回来：等最后一次保存写完
    const list = await listProjects();
    setProjects(list);
    storageEstimate().then(setUsage);
    // 缩略图：每个项目只预加载一张
    const srcs = list.map(projectThumbSrc).filter(Boolean);
    if (srcs.length) {
      preloadProjectAssets({ srcs })
        .then(() => setThumbTick((t) => t + 1))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    refresh().catch((e) => {
      setProjects([]);
      notify({ type: 'error', text: `读取本机项目失败：${e?.message || e}` });
    });
  }, [refresh, notify]);

  // ---------------- 文件入口 ----------------

  const restoreBackup = useCallback(
    async (file) => {
      setRestoring('读取中…');
      try {
        const { project, missing } = await importBundle(file, {
          onProgress: (_s, done, total) => setRestoring(`${done} / ${total}`),
        });
        const saved = await saveProject(project);
        notify({ type: 'ok', text: `已恢复「${saved.name || '未命名方案'}」` });
        if (missing) notify({ type: 'warn', text: `备份里少了 ${missing} 张图片，对应位置会显示灰块。` });
        onOpenProject(saved.id);
      } catch (e) {
        notify({ type: 'error', text: e?.message || '恢复失败' });
      } finally {
        setRestoring(null);
      }
    },
    [notify, onOpenProject]
  );

  const handleFile = useCallback(
    (file) => {
      if (!file || blocked.current) return;
      if (isPdf(file)) setImportFile(file);
      else if (isZip(file)) restoreBackup(file);
      else notify({ type: 'warn', text: '只支持 PDF —— 请从 WPS / PowerPoint 把方案导出成 PDF 再拖进来' });
    },
    [notify, restoreBackup]
  );
  const handleFileRef = useRef(handleFile);
  handleFileRef.current = handleFile;

  // 整个页面都能拖放（也防止浏览器直接打开 PDF 把当前页面替换掉）
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const onEnter = (e) => {
      if (!hasFiles(e)) return;
      depth += 1;
      if (!blocked.current) setDragging(true);
    };
    const onLeave = (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = blocked.current ? 'none' : 'copy';
    };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer.files || []);
      handleFileRef.current(files.find(isPdf) || files.find(isZip) || files[0]);
    };
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.files || []);
      const pdf = files.find(isPdf);
      if (!pdf) return;
      e.preventDefault();
      handleFileRef.current(pdf);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  function onImported(project) {
    setImportFile(null);
    const st = projectStats(project);
    notify({
      type: 'ok',
      text: `导入完成：${st.floors} 个楼层 · ${st.views} 张效果图 · ${st.materials} 种材料`,
    });
    onOpenProject(project.id);
  }

  // ---------------- 项目操作 ----------------

  async function handleDuplicate(p) {
    if (busy) return;
    setBusy({ id: p.id, kind: 'copy' });
    try {
      const copy = await duplicateProject(p, {
        existingNames: (projects || []).map((x) => x.name),
        onProgress: (done, total) => setBusy({ id: p.id, kind: 'copy', text: `${done}/${total}` }),
      });
      notify({ type: 'ok', text: `已复制为「${copy.name}」` });
      await refresh();
    } catch (e) {
      notify({ type: 'error', text: `复制失败：${e?.message || e}` });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    const p = confirmDelete;
    if (!p) return;
    setBusy({ id: p.id, kind: 'delete' });
    try {
      await removeProjectEverywhere(p.id);
      notify({ type: 'ok', text: `已删除「${p.name || '未命名方案'}」` });
      setConfirmDelete(null);
      await refresh();
    } catch (e) {
      notify({ type: 'error', text: `删除失败：${e?.message || e}` });
    } finally {
      setBusy(null);
    }
  }

  // ---------------- 界面 ----------------

  const list = projects || [];
  const returning = list.length > 0;

  // 四步说明：第一次用放在拖放区下面，已有项目时放到页面底部
  const steps = (
    <ol className={`${returning ? '' : 'mt-6 '}grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        return (
          <li key={s.n} className={`${cls.card} p-4 flex gap-3 items-start relative`}>
            <span className="font-display text-2xl leading-none text-bp-gold w-8 shrink-0">{s.n}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium text-bp-ink">
                <Icon size={15} className="text-bp-eyebrow" />
                {s.title}
              </div>
              <div className="mt-1 text-xs text-bp-muted leading-relaxed">{s.text}</div>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight size={14} className="hidden lg:block absolute -right-[11px] top-1/2 -translate-y-1/2 text-bp-rule z-10 bg-bp-paper rounded-full" />
            )}
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="min-h-[100dvh] bg-bp-paper">
      <Header onOpenSettings={onOpenSettings} hasKey={hasKey} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {/* 标题 */}
        <section className={returning ? 'pt-8 pb-6' : 'pt-10 sm:pt-14 pb-7'}>
          <div className={cls.eyebrow}>UKIR STUDIO · 提案工作台</div>
          <h1 className="mt-3 font-serif text-3xl sm:text-[40px] leading-tight text-bp-ink">一份方案 PDF，生成整套品牌提案</h1>
          <p className="mt-3 max-w-2xl text-sm sm:text-[15px] leading-relaxed text-bp-muted">
            把设计师从 WPS / PowerPoint 导出的方案 PDF 放进来：公司页沿用定稿模板，效果图、材料、楼层自动排好版，
            导出的 PPT 每个字、每张图都还能改。
          </p>
        </section>

        {/* 拖放区（已有项目时收成一条，项目列表上移） */}
        <button
          type="button"
          onClick={() => pdfInput.current?.click()}
          disabled={!!importFile || !!restoring}
          className={`group w-full rounded-2xl border-2 border-dashed transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-bp-gold/30 ${
            returning ? 'px-6 py-6 flex items-center gap-5 text-left' : 'px-6 py-12 sm:py-16 flex flex-col items-center text-center'
          } ${dragging ? 'border-bp-gold bg-bp-gold/10 scale-[1.01]' : 'border-bp-rule/70 bg-bp-card hover:border-bp-gold hover:bg-bp-tint'}`}
        >
          <span
            className={`rounded-full flex items-center justify-center shrink-0 transition-colors ${returning ? 'w-12 h-12' : 'w-16 h-16 mb-5'} ${
              dragging ? 'bg-bp-gold text-white' : 'bg-bp-gold/15 text-bp-eyebrow group-hover:bg-bp-gold/25'
            }`}
          >
            <FileUp size={returning ? 22 : 28} />
          </span>
          <span className={returning ? 'min-w-0' : 'contents'}>
            <span className={`block font-serif text-bp-ink ${returning ? 'text-xl' : 'text-2xl sm:text-[28px]'}`}>
              {dragging ? '松手，开始导入' : returning ? '新方案？把 PDF 拖进来' : '把设计师的方案 PDF 拖进来'}
            </span>
            <span className={`block text-sm text-bp-muted ${returning ? 'mt-1' : 'mt-2'}`}>
              或 <span className="text-bp-eyebrow underline underline-offset-4">点击选择文件</span> · 也可以直接 {isMac ? '⌘V' : 'Ctrl+V'} 粘贴
            </span>
            {!returning && (
              <span className="block mt-4 text-[11px] text-bp-faint">
                WPS / PowerPoint 导出的 PDF 都可以 · 20–60 MB 很正常 · 全程在这台电脑上处理，不会上传
              </span>
            )}
          </span>
        </button>
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {/* 独立 Material Board（原 UKIR STUDIO 的 Material Board，不做提案也能用） */}
        <button
          type="button"
          onClick={onOpenBoards}
          className={`${cls.card} mt-4 w-full px-5 py-4 flex items-center gap-4 text-left hover:border-bp-gold hover:bg-bp-tint transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-bp-gold/30`}
        >
          <span className="w-11 h-11 rounded-full bg-bp-gold/15 text-bp-eyebrow flex items-center justify-center shrink-0">
            <LayoutGrid size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-lg text-bp-ink">Material Board · 材质排版图</span>
            <span className="block mt-0.5 text-xs sm:text-sm text-bp-muted">
              不做提案也能用：材质库、拖拽排版、AI 实拍排版，下载高清 PNG 发客户
            </span>
          </span>
          <ArrowRight size={18} className="text-bp-faint shrink-0" />
        </button>

        {!returning && steps}

        {/* 最近项目 */}
        <section className={returning ? 'mt-8' : 'mt-12'}>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <div className={cls.eyebrow}>Projects</div>
              <h2 className="mt-1 font-serif text-xl text-bp-ink">
                最近的项目{list.length ? <span className="ml-2 text-sm text-bp-faint font-sans">{list.length}</span> : null}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {usage && usage.usage > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-bp-faint" title="项目和图片都存在这台电脑的浏览器里">
                  <HardDrive size={13} />
                  本机已用 {formatBytes(usage.usage)}
                  {usage.quota ? ` / 可用约 ${formatBytes(usage.quota)}` : ''}
                </span>
              )}
              <button type="button" onClick={() => zipInput.current?.click()} disabled={!!restoring || !!importFile} className={cls.btnGhost}>
                {restoring ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />}
                {restoring ? `恢复中 ${restoring}` : '导入项目备份 (.blueprint.zip)'}
              </button>
              <input
                ref={zipInput}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) restoreBackup(f);
                }}
              />
            </div>
          </div>

          {projects === null ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`${cls.card} overflow-hidden`}>
                  <div className="aspect-[16/9] shimmer" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 w-2/3 rounded shimmer" />
                    <div className="h-3 w-1/3 rounded shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className={`${cls.card} p-10 text-center`}>
              <FileText size={28} className="mx-auto text-bp-rule" />
              <div className="mt-3 font-serif text-lg text-bp-ink">还没有项目</div>
              <div className="mt-1 text-sm text-bp-muted">把第一份方案 PDF 拖进上面的框里，大约十几秒就能生成整套提案。</div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-thumbs={thumbTick}>
              {list.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  busy={busy?.id === p.id ? busy : null}
                  disabled={!!busy}
                  onOpen={() => onOpenProject(p.id)}
                  onDuplicate={() => handleDuplicate(p)}
                  onDelete={() => setConfirmDelete(p)}
                />
              ))}
            </div>
          )}

          <p className="mt-6 text-[11px] text-bp-faint leading-relaxed">
            项目只存在这台电脑的浏览器里。换电脑或清理浏览器前，请在项目的「导出 PPT」窗口里下载项目备份。
          </p>
        </section>

        {returning && (
          <section className="mt-12">
            <div className={`${cls.eyebrow} mb-3`}>How it works · 四步出提案</div>
            {steps}
          </section>
        )}
      </main>

      {importFile && <ImportDialog file={importFile} onDone={onImported} onClose={() => setImportFile(null)} />}

      {confirmDelete && (
        <ConfirmDialog
          title="删除这个项目？"
          danger
          confirmText="删除"
          busy={busy?.kind === 'delete'}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        >
          <p>
            「<span className="text-bp-ink">{confirmDelete.name || '未命名方案'}</span>」的页面、图片和 Material Board 画板都会从这台电脑上删除，
            <b className="font-medium text-bp-danger">无法恢复</b>。
          </p>
          <p className="text-xs text-bp-faint">需要留底的话，先打开项目 →「导出 PPT」→「下载项目备份」。</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function ProjectCard({ project, busy, disabled, onOpen, onDuplicate, onDelete }) {
  const src = projectThumbSrc(project);
  const url = src ? resolveUrl(src) : null;
  const st = projectStats(project);
  const who = clientLine(project.info);
  return (
    <div className={`${cls.card} overflow-hidden group flex flex-col hover:shadow-md hover:border-bp-rule transition`}>
      <button type="button" onClick={onOpen} className="block text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-bp-gold/40">
        <div className="aspect-[16/9] bg-bp-tint relative overflow-hidden">
          {url ? (
            <img src={url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-bp-rule">
              <ImageOff size={26} />
            </div>
          )}
          {project.cover?.image && (
            <span className="absolute left-2.5 top-2.5 rounded-md bg-bp-dark/75 text-bp-light text-[10px] tracking-wider px-1.5 py-0.5">MATERIAL BOARD</span>
          )}
        </div>
        <div className="px-4 pt-3.5 pb-2">
          <div className="font-serif text-[15px] text-bp-ink truncate">{project.name || '未命名方案'}</div>
          <div className="mt-0.5 text-xs text-bp-muted truncate">
            {who && who !== (project.name || '').trim() ? `${who} · ` : ''}
            {st.floors ? `${st.floors} 个楼层 · ` : ''}
            {st.views} 张效果图 · {st.materials} 种材料
          </div>
        </div>
      </button>
      <div className="mt-auto px-4 pb-3 flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-[11px] text-bp-faint">
          {timeAgo(project.updatedAt)} · {st.slides} 页
        </span>
        {busy?.kind === 'copy' ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-bp-faint">
            <Loader2 size={13} className="animate-spin" /> 复制中 {busy.text || ''}
          </span>
        ) : (
          <>
            <button type="button" onClick={onDuplicate} disabled={disabled} className={cls.iconBtn} title="复制一份（改给别的客户 / 做第二版）" aria-label="复制项目">
              <Copy size={15} />
            </button>
            <button type="button" onClick={onDelete} disabled={disabled} className={`${cls.iconBtn} hover:!text-bp-danger`} title="删除" aria-label="删除项目">
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
