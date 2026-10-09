import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Loader2, ArrowRight, TriangleAlert, RotateCcw, Check, ImageIcon } from 'lucide-react';
import { polishProject, groupViewSlides, sanitizeRoomEn, SUBTITLE_MAX } from '../ai/polish.js';
import { resolveUrl, onAssetsChanged } from '../store/assets.js';

// 「AI 润色」弹窗：看图改写效果图页的视角名 / 英文小标题 / 备注 → 逐页对比 → 勾选后套用。
// props: { project, settings, notify, onOpenSettings, onApply(patches), onClose, onlySlideIds? }

const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-bp-dark text-bp-light text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-bp-line bg-white text-sm text-bp-muted hover:bg-bp-tint hover:text-bp-ink disabled:opacity-50 disabled:cursor-not-allowed';
const inputCls =
  'w-full rounded-lg border border-bp-line bg-white px-2 py-1 text-sm text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold';

/** 素材缓存变化时重渲染（缩略图） */
function useAssetsTick() {
  const [, setTick] = useState(0);
  useEffect(() => onAssetsChanged(() => setTick((t) => t + 1)), []);
}

const toRow = (r) => ({
  ...r,
  checked: true,
  draft: { subtitle: r.patch.subtitle ?? '', roomEn: r.patch.roomEn ?? '' },
});

/** 行 → 最终补丁（用设计师在输入框里改过的值） */
function finalPatch(row) {
  const patch = {};
  if (row.patch.subtitle !== undefined) {
    const s = row.draft.subtitle.trim();
    if (s && s !== row.before.subtitle) patch.subtitle = s;
  }
  if (row.patch.roomEn !== undefined) {
    const e = sanitizeRoomEn(row.draft.roomEn);
    if (e && e !== row.before.roomEn.trim().toUpperCase()) patch.roomEn = e;
  }
  if (row.patch.notes) patch.notes = row.patch.notes;
  return patch;
}

function NotesList({ notes, muted }) {
  if (!notes?.length) return <span className="text-bp-faint">（无）</span>;
  return (
    <ul className="space-y-1">
      {notes.map((n, i) => (
        <li key={i} className={muted ? 'text-bp-faint' : 'text-bp-ink'}>
          {n.label && <span className={`text-[11px] tracking-wide ${muted ? '' : 'text-bp-eyebrow'}`}>{n.label}</span>}
          {n.label && n.text && <br />}
          {n.text}
        </li>
      ))}
    </ul>
  );
}

function FieldLine({ label, children }) {
  return (
    <div className="grid grid-cols-[52px_1fr] gap-2 items-start">
      <span className="text-[11px] font-semibold text-bp-faint pt-1.5">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReviewRow({ row, slide, onToggle, onDraft }) {
  const url = resolveUrl(slide?.image);
  const room = (slide?.room || '').trim();
  const changed = row.patch;
  return (
    <div
      className={`flex gap-3 p-3 rounded-xl border transition-colors ${
        row.checked ? 'border-bp-gold/70 bg-bp-tint' : 'border-bp-line bg-white opacity-70'
      }`}
    >
      <label className="flex items-start pt-1 cursor-pointer">
        <input type="checkbox" checked={row.checked} onChange={onToggle} className="w-4 h-4 accent-[#211A12]" />
      </label>
      <div className="w-36 shrink-0">
        <div className="aspect-[4/3] rounded-lg overflow-hidden bg-bp-line/40 flex items-center justify-center">
          {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={18} className="text-bp-faint" />}
        </div>
        {slide?.sourcePage ? <div className="mt-1 text-[10px] text-bp-faint">原稿第 {slide.sourcePage} 页</div> : null}
      </div>
      <div className="flex-1 min-w-0 space-y-2 text-sm">
        {changed.subtitle !== undefined && (
          <FieldLine label="标题">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-bp-faint line-through decoration-bp-rule">
                {[room, row.before.subtitle || '（无副标题）'].filter(Boolean).join(' · ')}
              </span>
              <ArrowRight size={13} className="text-bp-faint shrink-0" />
              <span className="flex items-center gap-1.5 min-w-0">
                {room && <span className="text-bp-ink whitespace-nowrap">{room} ·</span>}
                <input
                  value={row.draft.subtitle}
                  maxLength={SUBTITLE_MAX + 4}
                  onChange={(e) => onDraft({ subtitle: e.target.value })}
                  className={`${inputCls} w-40 font-serif`}
                />
              </span>
            </div>
          </FieldLine>
        )}
        {changed.roomEn !== undefined && (
          <FieldLine label="英文">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-bp-faint line-through decoration-bp-rule text-xs tracking-widest">
                {row.before.roomEn || '（空）'}
              </span>
              <ArrowRight size={13} className="text-bp-faint shrink-0" />
              <input
                value={row.draft.roomEn}
                onChange={(e) => onDraft({ roomEn: e.target.value.toUpperCase() })}
                className={`${inputCls} w-52 text-xs tracking-widest`}
              />
            </div>
          </FieldLine>
        )}
        {changed.notes && (
          <FieldLine label="备注">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start text-xs leading-relaxed">
              <NotesList notes={row.before.notes.filter((n) => n.text || n.label)} muted />
              <ArrowRight size={13} className="text-bp-faint mt-1" />
              <NotesList notes={changed.notes} />
            </div>
          </FieldLine>
        )}
      </div>
    </div>
  );
}

export default function PolishDialog({ project, settings, notify, onOpenSettings, onApply, onClose, onlySlideIds }) {
  useAssetsTick();
  const groups = useMemo(() => groupViewSlides(project, { onlySlideIds }), [project, onlySlideIds]);
  const pageCount = groups.reduce((n, g) => n + g.slides.length, 0);
  const slideById = useMemo(() => new Map((project?.slides || []).map((s) => [s.id, s])), [project]);

  const [phase, setPhase] = useState('intro'); // intro | running | review | error
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [rows, setRows] = useState([]);
  const [skipped, setSkipped] = useState([]); // [{ label, message, slideIds }]
  const [errorText, setErrorText] = useState('');
  const runRef = useRef({ aborted: false });
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
      runRef.current.aborted = true;
    },
    []
  );

  // Esc 关闭（润色进行中不关，避免丢掉已花的额度）
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && phase !== 'running') {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  async function run(ids, { append = false } = {}) {
    if (!settings?.apiKey) {
      onOpenSettings?.();
      return;
    }
    const signal = { aborted: false };
    runRef.current = signal;
    const failed = [];
    setPhase('running');
    setErrorText('');
    setProgress({ done: 0, total: 0, label: '' });
    try {
      const res = await polishProject(project, settings, {
        onlySlideIds: ids,
        signal,
        onProgress: (done, total, label) => alive.current && setProgress({ done, total, label }),
        onGroupError: (err, group) => failed.push({ label: group.label, message: err.message, slideIds: group.slides.map((s) => s.id), pending: !!err.pending }),
      });
      if (!alive.current) return; // 弹窗已关
      if (signal.aborted) notify?.({ type: 'warn', text: '已停止，下面是已完成部分的建议' });
      setRows((prev) => {
        const fresh = res.map(toRow);
        if (!append) return fresh;
        const ids2 = new Set(fresh.map((r) => r.slideId));
        return [...prev.filter((r) => !ids2.has(r.slideId)), ...fresh];
      });
      setSkipped(failed);
      setPhase('review');
      if (failed.length) notify?.({ type: 'warn', text: `有 ${failed.length} 组没拿到建议（出错或未处理），可点「再试一次」` });
    } catch (e) {
      if (!alive.current) return;
      if (append) {
        // 「再试一次」又失败：留着之前拿到的建议和待重试的那几组，不丢掉已付费的结果
        setPhase('review');
        notify?.({ type: 'error', text: `再试一次失败：${e.message || e}` });
        return;
      }
      setErrorText(e.message || String(e));
      setPhase('error');
      notify?.({ type: 'error', text: `AI 润色失败：${e.message || e}` });
    }
  }

  function cancelRun() {
    runRef.current.aborted = true;
    onClose?.();
  }

  /** 停止：等当前这一组回来，然后显示已完成部分 */
  function stopRun() {
    runRef.current.aborted = true;
    setProgress((p) => ({ ...p, label: '正在停止，等这一组完成…' }));
  }

  const checkedRows = rows.filter((r) => r.checked);
  const setAll = (checked) => setRows((rs) => rs.map((r) => ({ ...r, checked })));
  const updateRow = (id, fn) => setRows((rs) => rs.map((r) => (r.slideId === id ? fn(r) : r)));

  function apply() {
    const patches = checkedRows
      .map((r) => ({ slideId: r.slideId, patch: finalPatch(r) }))
      .filter((p) => Object.keys(p.patch).length);
    if (!patches.length) {
      notify?.({ type: 'warn', text: '没有选中需要修改的页' });
      return;
    }
    onApply?.(patches);
    notify?.({ type: 'ok', text: `已润色 ${patches.length} 页，随时可以在页面里再改` });
    onClose?.();
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 4;

  return (
    <div role="dialog" aria-modal="true" aria-label="AI 润色标题" className="fixed inset-0 z-50 bg-bp-ink/50 flex items-center justify-center p-4" onClick={phase === 'running' ? undefined : onClose}>
      <div
        className="w-full max-w-4xl bg-bp-card rounded-2xl shadow-xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-bp-line shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-bp-gold" />
            <h2 className="font-serif text-base font-semibold text-bp-ink">AI 润色 · 标题与备注</h2>
          </div>
          <button type="button" onClick={phase === 'running' ? cancelRun : onClose} className="p-1.5 rounded-lg hover:bg-bp-tint text-bp-muted" title="关闭">
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto thin-scroll px-6 py-5">
          {phase === 'intro' && (
            <div className="space-y-4">
              {pageCount ? (
                <>
                  <p className="text-sm text-bp-muted leading-relaxed">
                    AI 会逐张看效果图，按定稿的写法给每页起一个简短的视角名（如「客厅 · 沙发视角」「主人房 · 衣橱 · 夜晚」），
                    补上大写英文小标题，并把原稿备注整理成「中文 · English」的双语格式。
                  </p>
                  <ul className="text-xs text-bp-faint space-y-1 list-disc list-inside">
                    <li>只改写已有信息，不会编造工艺或尺寸；材料不会动。</li>
                    <li>先给建议，逐页对比后你勾选的才会套用；套用后仍可随时手改。</li>
                  </ul>
                  <div className="rounded-xl bg-bp-tint border border-bp-line px-4 py-3 text-sm text-bp-ink">
                    共 <b>{pageCount}</b> 页效果图，分 <b>{groups.length}</b> 组发送（同一空间一起看，视角名才不会重复）。
                  </div>
                </>
              ) : (
                <div className="text-center text-sm text-bp-faint py-12">还没有可润色的效果图页（停用的页和 3D 立体图页不参与）。</div>
              )}
            </div>
          )}

          {phase === 'running' && (
            <div className="py-10 space-y-4 max-w-md mx-auto text-center">
              <Loader2 size={26} className="animate-spin text-bp-gold mx-auto" />
              <div className="text-sm text-bp-ink">
                正在看图润色 · 第 {Math.min(progress.done + 1, progress.total || 1)} / {progress.total || groups.length} 组
              </div>
              {progress.label && <div className="text-xs text-bp-faint">{progress.label}</div>}
              <div className="h-1.5 rounded-full bg-bp-line overflow-hidden">
                <div className="h-full bg-bp-gold transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[11px] text-bp-faint">每组约 5–15 秒；遇到限流会自动等待重试。</div>
            </div>
          )}

          {phase === 'error' && (
            <div className="py-10 space-y-3 max-w-lg mx-auto text-center">
              <TriangleAlert size={24} className="text-bp-danger mx-auto" />
              <div className="text-sm text-bp-danger leading-relaxed">{errorText}</div>
            </div>
          )}

          {phase === 'review' && (
            <div className="space-y-3">
              {skipped.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-bp-warn/40 bg-bp-warn/10 px-3 py-2 text-xs text-bp-ink">
                  <TriangleAlert size={14} className="text-bp-warn mt-0.5 shrink-0" />
                  <div className="flex-1">
                    这几组没拿到建议：{skipped.map((s) => `${s.label}${s.pending ? '（未处理）' : ''}`).join('、')}
                  </div>
                  <button
                    type="button"
                    className="text-bp-eyebrow underline whitespace-nowrap"
                    onClick={() => run(skipped.flatMap((s) => s.slideIds), { append: true })}
                  >
                    再试一次
                  </button>
                </div>
              )}
              {rows.length ? (
                <>
                  <div className="flex items-center justify-between text-xs text-bp-faint">
                    <span>
                      共 {rows.length} 页有建议，已选 {checkedRows.length} 页
                      {(() => {
                        // 「无需修改」只算真正处理过的页（跳过 / 未处理的不算）
                        const done = pageCount - skipped.reduce((n, s) => n + s.slideIds.length, 0);
                        return done > rows.length ? `；其余 ${done - rows.length} 页已经很好，无需修改` : '';
                      })()}
                    </span>
                    <span className="flex gap-3">
                      <button type="button" className="hover:text-bp-ink" onClick={() => setAll(true)}>
                        全选
                      </button>
                      <button type="button" className="hover:text-bp-ink" onClick={() => setAll(false)}>
                        全不选
                      </button>
                    </span>
                  </div>
                  {rows.map((row) => (
                    <ReviewRow
                      key={row.slideId}
                      row={row}
                      slide={slideById.get(row.slideId)}
                      onToggle={() => updateRow(row.slideId, (r) => ({ ...r, checked: !r.checked }))}
                      onDraft={(d) => updateRow(row.slideId, (r) => ({ ...r, checked: true, draft: { ...r.draft, ...d } }))}
                    />
                  ))}
                </>
              ) : (
                <div className="text-center text-sm text-bp-faint py-12">
                  <Check size={22} className="mx-auto mb-2 text-bp-green" />
                  {skipped.length
                    ? '已处理的页没有需要修改的地方；上面这几组还没拿到建议，可点「再试一次」。'
                    : '看起来标题都已经很好了，没有需要修改的地方。'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-bp-line shrink-0">
          <span className="text-[11px] text-bp-faint">图片会发给 Google Gemini 识别，不经过其它服务器。</span>
          <div className="flex-1" />
          {phase === 'intro' && (
            <>
              <button type="button" className={btnGhost} onClick={onClose}>
                取消
              </button>
              <button type="button" className={btnPrimary} disabled={!pageCount} onClick={() => run(onlySlideIds)}>
                <Sparkles size={15} />
                开始润色
              </button>
            </>
          )}
          {phase === 'running' && (
            <button type="button" className={btnGhost} onClick={stopRun}>
              停止
            </button>
          )}
          {phase === 'error' && (
            <>
              <button type="button" className={btnGhost} onClick={onClose}>
                关闭
              </button>
              <button type="button" className={btnPrimary} onClick={() => run(onlySlideIds)}>
                <RotateCcw size={15} />
                重试
              </button>
            </>
          )}
          {phase === 'review' && (
            <>
              <button type="button" className={btnGhost} onClick={onClose}>
                {rows.length ? '放弃' : '关闭'}
              </button>
              {rows.length > 0 && (
                <button type="button" className={btnPrimary} disabled={!checkedRows.length} onClick={apply}>
                  <Check size={15} />
                  套用所选（{checkedRows.length}）
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
