// 展厅播放 · 播放前检查：点「展厅播放」每次都先出这张清单（用户 2026-11-21 定的），看过再按「开始播放」。
//
// 清单（showroom/health.js）：缺图、3D 开场画不出来（红）· 页面本身的提醒、说明栏放不下（黄）· 缺英文汇总 ·
// 软件有新版 · 这个浏览器能不能防熄屏。每条可以跳到那一页去改。全部没问题 = 一行绿色的「可以播放」。
// 有问题也可以照样播放（清单是提醒，不是拦路）。
// 开着清单的这几秒顺手做两件事：开始画 3D 开场、先算前几张效果图的线稿 —— 一开场就滑到效果图时「从无到有」已经准备好。

import React, { useEffect, useMemo, useState } from 'react';
import { MonitorPlay, CheckCircle2, AlertTriangle, AlertOctagon, ArrowUpRight, Languages, Loader2, RefreshCw, Sun, Keyboard, ClipboardCheck } from 'lucide-react';
import { renderDeck, exportableSlides } from '../../engine/deck.js';
import { langOf } from '../../engine/lang.js';
import { metaOf, resolveUrl, missingImagesIn } from '../../store/assets.js';
import { buildStops } from '../../showroom/timeline.js';
import { showroomHealth, sortIssues } from '../../showroom/health.js';
import { requestPlan3d, onPlan3dProgress, plan3dState } from '../../showroom/build3dCache.js';
import { requestSketch } from '../../showroom/sketchCache.js';
import { checkUpdate } from '../../lib/appVersion.js';
import { useUpdateReady } from '../../lib/useUpdateReady.js';
import { LANG_VERSION } from '../../lib/langUi.js';
import { Modal, cls } from '../../lib/ui.jsx';
import { canKeepAwake } from './ShowroomPlayer.jsx';
import { reviewList } from '../../lib/review.js';

const WARM_SKETCHES = 3;

export default function ShowroomPreflight({ project, onStart, onClose, onGoTab }) {
  const lang = langOf(project);
  const stops = useMemo(() => buildStops(exportableSlides(renderDeck(project, { meta: metaOf })), project), [project]);
  const updateReady = useUpdateReady();
  const [, setTick] = useState(0);

  // 3D 开场：现在就开始画（画好 / 画不出来都会通知）
  useEffect(() => {
    const off = onPlan3dProgress(() => setTick((t) => t + 1));
    for (const st of stops) if (st.plan3d) requestPlan3d(st.plan3d);
    setTick((t) => t + 1);
    return off;
  }, [stops]);

  // 前几张效果图的线稿先算着；顺便看一眼有没有新版
  useEffect(() => {
    let n = 0;
    for (const st of stops) {
      if (n >= WARM_SKETCHES) break;
      const hero = st.hero >= 0 ? st.page.els[st.hero] : null;
      if (!hero) continue;
      requestSketch(hero, resolveUrl(hero.src));
      n += 1;
    }
    checkUpdate();
  }, [stops]);

  const health = showroomHealth(stops, { missingImages: missingImagesIn, plan3d: plan3dState });
  const issues = sortIssues(health.issues);
  const errors = issues.filter((it) => it.level === 'error').length;
  const jump = (slideId) => onGoTab?.('pages', slideId);
  const count = stops.length;
  const awake = canKeepAwake();
  // 导入时没把握、还没核对的地方（空间名、材料、楼层）：播放前提一句
  const reviewOpen = reviewList(project).filter((it) => it.status === 'open');
  const allGood = health.ok && !updateReady && !reviewOpen.length;

  return (
    <Modal
      title="展厅播放 · 播放前检查"
      icon={<MonitorPlay size={18} className="text-bp-gold" />}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className={cls.btnGhost}>
            取消
          </button>
          <button type="button" onClick={onStart} disabled={!count} className={cls.btnPrimary} autoFocus data-testid="showroom-start">
            <MonitorPlay size={15} />
            {errors ? `照样播放 ${count} 页` : `开始播放 ${count} 页`}
          </button>
        </>
      }
    >
      <div className="space-y-4" data-testid="showroom-preflight" data-ok={allGood ? '1' : '0'}>
        <div className="text-[11px] text-bp-faint">
          {count} 页 · {LANG_VERSION[lang] || ''} · 和导出的 PPT 同一套页面{count ? '' : ' —— 全部页面都隐藏了，没有可以播放的'}
        </div>

        {allGood && (
          <div className="flex items-center gap-2 rounded-xl border border-bp-green/30 bg-bp-green/5 px-3.5 py-3 text-sm text-bp-green">
            <CheckCircle2 size={17} className="shrink-0" /> 每一页都检查过了，没有问题，可以播放
          </div>
        )}

        {updateReady && (
          <div className="flex items-start gap-2.5 rounded-xl border border-bp-warn/30 bg-bp-warn/10 px-3.5 py-2.5">
            <RefreshCw size={15} className="shrink-0 mt-0.5 text-bp-warn" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-bp-ink leading-snug">软件上线了新版，这个页面还是旧的</div>
              <div className="mt-0.5 text-xs text-bp-muted leading-snug">旧页面播放时「线稿上色」可能出不来。先刷新再播放（改过的内容已经自动保存）。</div>
            </div>
            <button type="button" onClick={() => window.location.reload()} className="shrink-0 mt-0.5 inline-flex items-center gap-0.5 text-xs text-bp-eyebrow hover:underline">
              刷新
            </button>
          </div>
        )}

        {health.missing && (
          <div className="flex items-start gap-2.5 rounded-xl border border-bp-warn/30 bg-bp-warn/10 px-3.5 py-2.5">
            <Languages size={15} className="shrink-0 mt-0.5 text-bp-warn" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-bp-ink leading-snug">
                {LANG_VERSION[lang]}还有 {health.missing.count} 处中文没有英文，播放时这些地方{lang === 'bi' ? '只显示中文' : '会显示中文'}
              </div>
              <div className="mt-0.5 text-xs text-bp-muted leading-snug">在「页面」顶栏点「AI 翻译 · {health.missing.count}」一次补齐，也可以在各页的 EN 框里逐条填。</div>
            </div>
            {health.missing.firstSlideId && (
              <button type="button" onClick={() => jump(health.missing.firstSlideId)} className="shrink-0 mt-0.5 inline-flex items-center gap-0.5 text-xs text-bp-eyebrow hover:underline">
                去页面 <ArrowUpRight size={12} />
              </button>
            )}
          </div>
        )}

        {reviewOpen.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-bp-warn/30 bg-bp-warn/10 px-3.5 py-2.5" data-testid="showroom-review">
            <ClipboardCheck size={15} className="shrink-0 mt-0.5 text-bp-warn" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-bp-ink leading-snug">导入时程序没把握的地方，还有 {reviewOpen.length} 处没核对</div>
              <div className="mt-0.5 text-xs text-bp-muted leading-snug">空间名、材料、楼层可能认错了。在「页面」列表上方点「请核对」逐条看过、打勾。</div>
            </div>
            {reviewOpen.find((it) => it.slideId) && (
              <button type="button" onClick={() => jump(reviewOpen.find((it) => it.slideId).slideId)} className="shrink-0 mt-0.5 inline-flex items-center gap-0.5 text-xs text-bp-eyebrow hover:underline">
                去核对 <ArrowUpRight size={12} />
              </button>
            )}
          </div>
        )}

        {issues.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-bp-faint mb-2">
              {errors ? `${errors} 页会在大屏上出问题` : ''}
              {errors && issues.length > errors ? ' · ' : ''}
              {issues.length > errors ? `${issues.length - errors} 页留意` : ''}
            </div>
            <ul className="rounded-xl border border-bp-line divide-y divide-bp-line max-h-64 overflow-y-auto thin-scroll" data-testid="showroom-issues">
              {issues.map((it) => (
                <li key={it.key} className="flex items-start gap-3 px-3 py-2" data-level={it.level}>
                  {it.level === 'error' ? <AlertOctagon size={15} className="shrink-0 mt-0.5 text-bp-danger" /> : <AlertTriangle size={15} className="shrink-0 mt-0.5 text-bp-warn" />}
                  <span className="mt-0.5 text-[11px] text-bp-faint tabular-nums w-9 shrink-0">第 {it.page}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-bp-ink truncate">{it.label || '（没有标题的页）'}</div>
                    {it.msgs.map((m) => (
                      <div key={m} className={`text-xs leading-snug ${it.level === 'error' ? 'text-bp-danger' : 'text-bp-warn'}`}>
                        {m}
                      </div>
                    ))}
                  </div>
                  {it.slideId && (
                    <button type="button" onClick={() => jump(it.slideId)} className="shrink-0 inline-flex items-center gap-0.5 text-xs text-bp-eyebrow hover:underline">
                      去这页 <ArrowUpRight size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {health.pending3d > 0 && (
          <div className="flex items-center gap-2 text-xs text-bp-muted" data-testid="showroom-3d-pending">
            <Loader2 size={14} className="animate-spin text-bp-gold shrink-0" />
            正在准备 3D 户型开场（{health.pending3d} 层）—— 不用等，可以先开始，讲前面几页的时间够它画完
          </div>
        )}

        <div className="space-y-1.5 text-xs text-bp-muted leading-relaxed">
          <div className="flex items-start gap-2.5">
            <Sun size={15} className={`shrink-0 mt-0.5 ${awake ? 'text-bp-gold' : 'text-bp-warn'}`} />
            {awake ? (
              <span>播放时屏幕保持常亮，停在一页讲多久都不会自己变黑。</span>
            ) : (
              <span className="text-bp-warn">这个浏览器不支持「屏幕常亮」—— 请用 Chrome，或先到电脑设置里把睡眠和屏保关掉，不然讲久了屏幕会自己变黑。</span>
            )}
          </div>
          <div className="flex items-start gap-2.5">
            <Keyboard size={15} className="shrink-0 mt-0.5 text-bp-gold" />
            <span>翻页：方向键 / 空格、鼠标滚轮一格、点一下屏幕（点左边 = 上一页）、触控屏拖动。退出：按两次 Esc，或点右上角 ✕。</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
