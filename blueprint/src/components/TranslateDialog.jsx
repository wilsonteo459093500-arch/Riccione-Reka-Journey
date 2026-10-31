// 「AI 翻译」弹窗：English / 中英版里还没有英文的中文 → 一条一条列出来（中文 | 英文）→ AI 一批一批地翻（每批回来就填上，
// 随时可以停）→ 设计师逐条看、直接改 → 「套用 N 条」写进翻译记忆（project.translations，整套共用，改一处所有页一起变）。
// 没有 API key 时照样能手填，并说明怎么设置。
// props: { project, items:[{zh,kind}], settings, notify, onOpenSettings, onApply(pairs), onClose }

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Languages, Sparkles, Loader2, Check, KeyRound, TriangleAlert, ArrowUpRight, CircleCheck, ListFilter } from 'lucide-react';
import { translateItems, TRANSLATE_BATCH } from '../ai/translate.js';
import { langOf } from '../engine/lang.js';
import {
  translateRows, rowStatus, pendingItems, fillRows, editRow, applicablePairs, unfinishedKeys, sliceItems, isLongRow, kindLabel,
  translateContext, translateResultText, enterAction, isKeyError, LANG_VERSION,
} from '../lib/langUi.js';
import { Modal, cls } from '../lib/ui.jsx';
import { inputCls } from './editor/ui.jsx';

/** 按内容长高的多行框（量 scrollHeight；一行时和单行输入框一样高） */
function GrowTextarea({ value, onChange, className = '', ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight + 2}px`; // + 上下边框
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} block resize-none overflow-hidden ${className}`}
      {...rest}
    />
  );
}

/** 一行：类别 | 中文 | 英文输入 */
function Row({ row, index, disabled, onEdit, onNext }) {
  const status = rowStatus(row.en);
  const long = isLongRow(row);
  const border = status === 'cjk' ? '!border-bp-warn/70' : row.source === 'ai' ? '!border-bp-gold/45' : '';
  // 回车 = 下一条（输入法选字时的回车不算）；只有备注可以 Shift+回车 换行，短词里的 Shift+回车 什么都不做
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const act = enterAction(row.kind, e.shiftKey);
    if (act === 'newline') return;
    e.preventDefault();
    if (act === 'next') onNext(index);
  };
  const common = {
    'data-row': index,
    value: row.en,
    disabled,
    onKeyDown,
    'aria-label': `「${row.zh}」的英文`,
  };
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[44px_minmax(0,0.92fr)_minmax(0,1.08fr)] gap-x-3 gap-y-1.5 px-4 py-3">
      <span className="pt-[7px] leading-none">
        <span className="inline-block rounded-md border border-bp-line/80 bg-bp-tint px-1.5 py-px text-[10px] leading-4 text-bp-muted whitespace-nowrap">
          {kindLabel(row.kind)}
        </span>
      </span>
      <p className="pt-[7px] text-sm leading-5 text-bp-ink break-words" lang="zh">
        {row.zh}
      </p>
      <div className="col-start-2 sm:col-start-auto min-w-0">
        <div className="relative">
          {long ? (
            <GrowTextarea {...common} className={`${border} ${row.source === 'ai' ? 'pr-7' : ''}`} onChange={(t) => onEdit(row.zh, t)} />
          ) : (
            <input
              {...common}
              className={`${inputCls} ${border} ${row.source === 'ai' ? 'pr-7' : ''}`}
              onChange={(e) => onEdit(row.zh, e.target.value)}
            />
          )}
          {row.source === 'ai' && (
            <Sparkles className="absolute right-2 top-2 w-3.5 h-3.5 text-bp-gold pointer-events-none" aria-label="AI 翻译" />
          )}
        </div>
        {status === 'cjk' && <p className="mt-1 text-[11px] text-bp-warn">英文里还有中文，这一条不会套用</p>}
      </div>
    </li>
  );
}

export default function TranslateDialog({ project, items, settings, notify, onOpenSettings, onApply, onClose }) {
  const lang = langOf(project);
  const [rows, setRows] = useState(() => translateRows(items));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null); // { text, tone:'ok'|'warn', left }
  const [error, setError] = useState('');
  const [only, setOnly] = useState(null); // 「只看没填好的」：打开那一刻没填好的那些行（Set<中文>）；填好了也留在列表里
  const [lockH, setLockH] = useState(0); // 筛选时弹窗保持原来的高度（不然整个弹窗缩小、跳到屏幕中间，刚点的按钮也跑了）
  const bodyRef = useRef(null);
  const listRef = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // 每次运行一个号；停止 / 关闭时换号 —— 还在路上的那一批回来后对不上号，结果直接丢掉（请求本身停不下来）
  const runRef = useRef(0);
  const filledRef = useRef(0); // 这次运行已经填好的条数（停止时报告用）
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
      runRef.current += 1;
    },
    []
  );

  const hasKey = !!settings?.apiKey;
  const pending = useMemo(() => pendingItems(rows), [rows]);
  const pairs = useMemo(() => applicablePairs(rows), [rows]);
  const unfinished = useMemo(() => unfinishedKeys(rows), [rows]);
  const shown = only ? rows.filter((r) => only.has(r.zh)) : rows;
  const total = rows.length;
  const filledCount = rows.filter((r) => rowStatus(r.en) !== 'empty').length;
  const batches = Math.max(1, Math.ceil((progress.total || pending.length) / TRANSLATE_BATCH));
  const batchNo = Math.min(batches, Math.floor(progress.done / TRANSLATE_BATCH) + 1);

  const edit = (zh, en) => {
    setRows((rs) => editRow(rs, zh, en));
    setResult(null);
  };

  const focusRow = (i) => {
    const el = listRef.current?.querySelector(`[data-row="${i + 1}"]`);
    if (el) el.focus();
  };

  const showAll = () => {
    setOnly(null);
    setLockH(0);
  };

  const showUnfinished = () => {
    // 锁住的高度 = 现在看得到的那么高（内容比弹窗长时不锁到整个内容的高度，免得下面能滚出一大片空白）
    const body = bodyRef.current;
    const sc = body?.closest('.overflow-y-auto');
    const cs = sc ? window.getComputedStyle(sc) : null;
    const room = sc ? sc.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) : Infinity;
    setLockH(body ? Math.min(body.offsetHeight, room) : 0);
    setOnly(new Set(unfinishedKeys(rowsRef.current)));
    requestAnimationFrame(() => {
      listRef.current?.closest('.overflow-y-auto')?.scrollTo?.({ top: 0 });
      focusRow(0);
    });
  };

  function finish({ filled, errors, stopped }) {
    const left = pendingItems(rowsRef.current).length;
    if (!filled && !stopped && errors.length) {
      setError(errors[0]);
      setResult(null);
    } else {
      setResult({ text: translateResultText({ filled, left, stopped }), tone: !filled || (left && !stopped) ? 'warn' : 'ok', left });
      if (filled && errors.length) notify?.({ type: 'warn', text: `有一批没翻出来：${errors[0]}` });
    }
    setRunning(false);
  }

  async function runAI() {
    if (running) return;
    if (!hasKey) {
      onOpenSettings?.();
      return;
    }
    const todo = pendingItems(rowsRef.current);
    if (!todo.length) return;
    const id = ++runRef.current;
    const live = () => alive.current && runRef.current === id;
    filledRef.current = 0;
    setRunning(true);
    setError('');
    setResult(null);
    showAll();
    setProgress({ done: 0, total: todo.length });
    const context = translateContext(project);
    const errors = [];
    let done = 0;
    for (const slice of sliceItems(todo, TRANSLATE_BATCH)) {
      let res;
      try {
        res = await translateItems(slice, settings, { context });
      } catch (e) {
        res = { pairs: [], errors: [e?.message || String(e)] };
      }
      if (!live()) return; // 已停止 / 已关闭：这一批不要了
      const out = fillRows(rowsRef.current, res.pairs);
      if (out.filled) {
        rowsRef.current = out.rows;
        setRows(out.rows);
        filledRef.current += out.filled;
      }
      errors.push(...(res.errors || []));
      done += slice.length;
      setProgress({ done, total: todo.length });
      if ((res.errors || []).some(isKeyError)) break; // key 不对：后面的批次也会一样失败
    }
    if (live()) finish({ filled: filledRef.current, errors, stopped: false });
  }

  /** 停止：马上停（还在路上的那一批回来也不要了），已经填好的留着 */
  function stop() {
    if (!running) return;
    runRef.current += 1;
    finish({ filled: filledRef.current, errors: [], stopped: true });
  }

  function close() {
    if (pairs.length && !window.confirm(`还有 ${pairs.length} 条英文没套用，关掉就丢了。确定关闭？`)) return;
    runRef.current += 1; // 翻译中关掉 = 停止并关闭
    onClose?.();
  }

  function apply() {
    if (!pairs.length || running) return;
    onApply?.(pairs);
    onClose?.();
  }

  const aiLabel = !pending.length ? 'AI 翻译' : pending.length === total ? `AI 翻译全部 ${total} 条` : `AI 翻译剩下 ${pending.length} 条`;
  const aiShort = pending.length ? `AI 翻译 ${pending.length}` : 'AI 翻译';
  const aiFirst = !pairs.length; // 还一条都没填：主按钮是「AI 翻译」；填了之后主按钮换成「套用」
  const keyErr = isKeyError(error);
  const canFilter = !running && unfinished.length > 0 && unfinished.length < total;

  return (
    <Modal
      title={`AI 翻译 · ${LANG_VERSION[lang] || 'English 版'}`}
      icon={<Languages size={18} className="text-bp-gold" />}
      onClose={close}
      width="max-w-3xl"
      bodyClass="px-6 py-5"
      footer={
        <>
          <span className="hidden sm:block min-w-0 truncate text-[11px] text-bp-faint">只把这些中文发给 Google Gemini，不经过其它服务器</span>
          <div className="flex-1" />
          {running ? (
            <button type="button" onClick={stop} className={`${cls.btnGhost} whitespace-nowrap`} title="马上停；已经翻好的留着">
              停止
            </button>
          ) : (
            <>
              <button type="button" onClick={close} className={`${cls.btnGhost} hidden sm:inline-flex whitespace-nowrap`}>
                取消
              </button>
              <button
                type="button"
                onClick={runAI}
                disabled={!pending.length}
                className={`${aiFirst ? cls.btnPrimary : cls.btnGhost} whitespace-nowrap`}
                title={hasKey ? '只翻还空着的条目；你已经写了的不会被覆盖' : '先设置 Google AI 的 API key'}
              >
                <Sparkles size={15} />
                <span className="hidden sm:inline">{aiLabel}</span>
                <span className="sm:hidden">{aiShort}</span>
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!pairs.length}
                className={`${aiFirst ? cls.btnGhost : cls.btnPrimary} whitespace-nowrap`}
              >
                <Check size={15} />
                <span className="hidden sm:inline">套用 {pairs.length} 条</span>
                <span className="sm:hidden">套用 {pairs.length}</span>
              </button>
            </>
          )}
        </>
      }
    >
      <div ref={bodyRef} className="space-y-4" style={lockH ? { minHeight: lockH } : undefined}>
        <div className="space-y-1.5">
          <p className="text-sm text-bp-ink leading-relaxed">
            {LANG_VERSION[lang] || 'English 版'}还有 <b className="font-semibold tabular-nums">{total}</b> 处中文没有英文
            {lang === 'bi' ? '，现在这些地方只显示中文。' : '，现在这些地方先显示中文。'}
          </p>
          <p className="text-xs text-bp-muted leading-relaxed">
            AI 先翻一遍，你逐条看、直接改；套用后记进这份提案的翻译记忆 —— 同一句中文整套共用，改一处，所有页一起变。
          </p>
        </div>

        {!hasKey && (
          <div className="flex flex-wrap sm:flex-nowrap items-start gap-2.5 rounded-xl border border-bp-line bg-bp-tint px-3.5 py-3 text-xs text-bp-muted leading-relaxed">
            <KeyRound size={15} className="shrink-0 mt-px text-bp-gold" />
            {/* 手机上说明占满一行，「设置 API key」换到下一行（不把说明挤成一窄条） */}
            <div className="flex-1 min-w-0 basis-[calc(100%-26px)] sm:basis-0">
              <div className="text-bp-ink">还没有设置 Google AI 的 API key，AI 翻译暂时用不了。</div>
              <div>可以先在下面手动填英文；设置好 key 后再点「AI 翻译」，空着的条目会一次翻好。</div>
            </div>
            {onOpenSettings && (
              <button type="button" onClick={onOpenSettings} className={`${cls.btnGhost} shrink-0 !py-1.5 !text-xs whitespace-nowrap ml-[25px] sm:ml-0`}>
                设置 API key
                <ArrowUpRight size={13} />
              </button>
            )}
          </div>
        )}

        {running && (
          <div className="space-y-2" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-bp-ink">
                <Loader2 size={13} className="animate-spin text-bp-gold" />
                正在翻译 {progress.total} 条{batches > 1 ? ` · 第 ${batchNo} / ${batches} 批` : ''}
              </span>
              <span className="text-bp-faint whitespace-nowrap">每批约 5–15 秒 · 随时可以停</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-bp-line/50 overflow-hidden">
              {/* 等模型回话时没有中间进度：金色流光表示「在跑」；每批回来后实心部分前进 */}
              <div
                className="absolute inset-0 shimmer"
                style={{
                  background: 'linear-gradient(90deg, rgba(184,153,90,0.12) 20%, rgba(184,153,90,0.7) 50%, rgba(184,153,90,0.12) 80%)',
                  backgroundSize: '800px 100%',
                }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-bp-gold transition-[width] duration-500"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {error && !running && (
          <div className="flex items-start gap-2 rounded-xl bg-bp-danger/10 px-3.5 py-2.5 text-xs text-bp-danger leading-relaxed" role="alert">
            <TriangleAlert size={15} className="shrink-0 mt-px" />
            <span className="flex-1">
              AI 翻译没成功：{error}
              {keyErr && onOpenSettings && (
                <button type="button" onClick={onOpenSettings} className="ml-1.5 underline underline-offset-2">
                  检查 API key
                </button>
              )}
            </span>
          </div>
        )}

        {result && !running && (
          <div
            className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
              result.tone === 'warn' ? 'bg-bp-warn/10 text-bp-ink' : 'bg-bp-green/[0.07] text-bp-green'
            }`}
            aria-live="polite"
          >
            {result.tone === 'warn' ? <TriangleAlert size={15} className="shrink-0 mt-px text-bp-warn" /> : <CircleCheck size={15} className="shrink-0 mt-px" />}
            <span>
              {result.text}
              {result.left > 0 && !only && canFilter && (
                <button type="button" onClick={showUnfinished} className="ml-1.5 text-bp-eyebrow underline underline-offset-2 whitespace-nowrap">
                  只看这 {result.left} 条
                </button>
              )}
            </span>
          </div>
        )}

        <div className="rounded-xl border border-bp-line bg-white overflow-hidden">
          <div className="grid grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[44px_minmax(0,0.92fr)_minmax(0,1.08fr)] gap-x-3 px-4 py-2 border-b border-bp-line bg-bp-tint/70 text-[11px] text-bp-faint">
            <span className="hidden sm:block" />
            <span className="hidden sm:block">中文</span>
            <span className="col-span-2 sm:col-span-1 flex items-center justify-between gap-3">
              <span className="hidden sm:inline">English</span>
              <span className="flex items-center gap-3 ml-auto">
                {(canFilter || only) && (
                  <button
                    type="button"
                    onClick={() => (only ? showAll() : showUnfinished())}
                    aria-pressed={!!only}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -my-0.5 transition-colors ${
                      only ? 'bg-bp-dark text-bp-light' : 'text-bp-eyebrow hover:bg-bp-gold/10'
                    }`}
                  >
                    <ListFilter size={12} />
                    {only ? `显示全部 ${total} 条` : `只看没填好的 · ${unfinished.length}`}
                  </button>
                )}
                <span className="tabular-nums">
                  已填 {filledCount} / {total}
                </span>
              </span>
            </span>
          </div>
          <ul ref={listRef} className={`divide-y divide-bp-line/80 ${running ? 'opacity-60' : ''}`}>
            {shown.map((row, i) => (
              <Row key={row.zh} row={row} index={i + 1} disabled={running} onEdit={edit} onNext={(k) => focusRow(k)} />
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
