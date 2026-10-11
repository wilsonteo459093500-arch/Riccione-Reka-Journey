// 导入 PDF：读取 → 逐页解析 → 保存图片 → 排版 → 存项目 → 打开编辑器
// 大文件（20–60 MB）很正常：进度回调按帧合并更新，界面不卡；导入中不能关闭（关了也停不下来）

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Check, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { saveProject } from '../store/db.js';
import { Modal, ProgressBar, cls } from '../lib/ui.jsx';
import { formatBytes } from '../lib/format.js';

const STAGES = [
  { id: 'read', label: '读取 PDF' },
  { id: 'extract', label: '解析页面' },
  { id: 'save', label: '保存图片' },
  { id: 'layout', label: '自动排版' },
];
const ORDER = { read: 0, extract: 1, save: 2, layout: 3, done: 4 };
// 各阶段在总进度条里的占比
const SPAN = { read: [0, 0.03], extract: [0.03, 0.75], save: [0.75, 0.97], layout: [0.97, 1], done: [1, 1] };

function overall({ stage, done, total }) {
  const [a, b] = SPAN[stage] || [0, 0];
  const f = total ? Math.min(1, done / total) : 0;
  return a + (b - a) * f;
}

function stageText({ stage, done, total }) {
  switch (stage) {
    case 'read':
      return '读取 PDF';
    case 'extract':
      return total ? `解析第 ${Math.min(done + (done < total ? 1 : 0), total)} / ${total} 页` : '解析页面';
    case 'save':
      return total ? `保存图片 ${done} / ${total}` : '保存图片';
    case 'layout':
      return '排版';
    case 'done':
      return '保存项目…';
    default:
      return '';
  }
}

/**
 * @param {{ file:File, onDone:(project:object)=>void, onClose:()=>void }} props
 */
export default function ImportDialog({ file, onDone, onClose }) {
  const [phase, setPhase] = useState('running'); // 'running' | 'error'
  const [error, setError] = useState('');
  const [prog, setProg] = useState({ stage: 'read', done: 0, total: 1 });
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());

  const mounted = useRef(true);
  const started = useRef(false);
  const runId = useRef(0);
  const latest = useRef(null);
  const frame = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++runId.current;
    const alive = () => mounted.current && id === runId.current;
    setPhase('running');
    setError('');
    setProg({ stage: 'read', done: 0, total: 1 });
    setStartedAt(Date.now());
    try {
      // pdf.js 体积大：用到时再加载（首页打开更快）
      const { importPdfFile } = await import('../import/importPdf.js');
      if (!alive()) return;
      const project = await importPdfFile(file, {
        onProgress: (stage, done, total) => {
          latest.current = { stage, done, total };
          if (frame.current) return;
          frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            if (alive() && latest.current) setProg(latest.current);
          });
        },
      });
      if (!alive()) return;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      setProg({ stage: 'done', done: 1, total: 1 });
      const saved = await saveProject(project);
      if (alive()) onDoneRef.current?.(saved);
    } catch (e) {
      if (!alive()) return;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      const msg = e?.name === 'QuotaExceededError' || /quota|空间不足/i.test(e?.message || '')
        ? '浏览器存储空间不够了 —— 可以先在首页删掉旧项目（删前可下载项目备份），再重试。'
        : e?.message || 'PDF 解析失败';
      setError(msg);
      setPhase('error');
    }
  }, [file]);

  // 只启动一次（React 开发模式会重复执行 effect）
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  // 计时
  useEffect(() => {
    if (phase !== 'running') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const running = phase === 'running';
  const cur = ORDER[prog.stage] ?? 0;
  const secs = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <Modal
      title="导入方案 PDF"
      icon={<FileText size={18} className="text-bp-gold" />}
      onClose={running ? undefined : onClose}
      busy={running}
      width="max-w-md"
      footer={
        running ? (
          <div className="text-xs text-bp-faint">大文件一般需要 10–40 秒，请不要关闭或刷新页面</div>
        ) : (
          <>
            <div className="flex-1" />
            <button type="button" onClick={onClose} className={cls.btnGhost}>
              关闭
            </button>
            <button type="button" onClick={run} className={cls.btnPrimary} autoFocus>
              <RotateCcw size={15} /> 重试
            </button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl bg-bp-tint border border-bp-line px-3 py-2.5">
          <FileText size={20} className="text-bp-eyebrow shrink-0" />
          <div className="min-w-0">
            <div className="text-sm text-bp-ink truncate" title={file?.name}>
              {file?.name || 'PDF'}
            </div>
            <div className="text-[11px] text-bp-faint">{formatBytes(file?.size || 0)}</div>
          </div>
        </div>

        {running ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-bp-ink">{stageText(prog)}</span>
              <span className="text-xs text-bp-faint tabular-nums">{secs} 秒</span>
            </div>
            <ProgressBar value={overall(prog)} />
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-xl bg-bp-danger/10 text-bp-danger text-sm p-3 leading-relaxed" role="alert">
            <AlertTriangle size={17} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <ol className="grid grid-cols-4 gap-2">
          {STAGES.map((s, i) => {
            const doneStage = cur > i;
            const active = running && cur === i;
            return (
              <li key={s.id} className="flex flex-col items-center gap-1.5 text-center">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border ${
                    doneStage
                      ? 'bg-bp-dark border-bp-dark text-bp-light'
                      : active
                      ? 'border-bp-gold text-bp-gold bg-bp-gold/10'
                      : 'border-bp-line text-bp-faint bg-white'
                  }`}
                >
                  {doneStage ? <Check size={14} /> : active ? <Loader2 size={14} className="animate-spin" /> : i + 1}
                </span>
                <span className={`text-[11px] ${doneStage || active ? 'text-bp-ink' : 'text-bp-faint'}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>

        <p className="text-[11px] text-bp-faint leading-relaxed">全程在这台电脑上处理，PDF 不会上传到任何服务器。</p>
      </div>
    </Modal>
  );
}
