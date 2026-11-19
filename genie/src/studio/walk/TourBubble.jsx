// 走进去 · 潘吉带逛的泡泡（SPEC §5）：小潘吉（会说话的那一只 <Pangie speaker>，口型跟着 voice.js）+ 字幕 + 下一站 / 跳过。
//   字幕 = lineText(id)：和她说的一字不差，所以不用 t()（台词表 voice-lines.js 自己带中英文）；轻点字幕 = 这一句不说了。
//   走在路上（phase 'walking'）字幕留着上一句、淡一点；去第一站的路上还没有上一句 → 「跟我来…」（不留一个空泡泡）；最后一站只有「好的」。按钮 ≥ 44px；字幕 aria-live。
//   没在逛：给了 onStart 就画一颗「带我逛逛」的小按钮，没给就什么都不画。
// props = createTour().state() 的 { running, line, index, total, phase } + onNext / onSkip / onStart、className。
// 位置交给 walk.css（根节点 .walk-tour / .walk-tour-start，没有行内定位）；里面的样子是行内样式，只用 base.css 的变量。

import Pangie, { useTalking } from '../../shared/Pangie.jsx';
import { lineText, lineOf } from '../../shared/voice.js';
import { t, guideName } from '../../shared/i18n.js';

const BTN = {
  minHeight: 44,
  minWidth: 44,
  padding: '0 16px',
  borderRadius: 22,
  border: '1px solid var(--line)',
  background: 'var(--card)',
  color: 'var(--ink)',
  font: 'inherit',
  fontSize: 15,
  lineHeight: 1,
  cursor: 'pointer',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
};

const S = {
  wrap: { display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: 'min(440px, calc(100vw - 32px))', pointerEvents: 'auto', fontFamily: 'var(--sans)' },
  bubble: {
    flex: '1 1 auto',
    minWidth: 0,
    padding: '12px 14px 10px',
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    background: 'var(--studio-panel)',
    color: 'var(--studio-panel-text)',
    border: '1px solid var(--studio-panel-border)',
    boxShadow: 'var(--shadow-2)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
  },
  text: { margin: 0, minHeight: '1.5em', fontSize: 16, lineHeight: 1.5, transition: 'opacity 0.3s var(--ease)' },
  actions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  count: { marginRight: 'auto', fontSize: 13, color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' },
  btn: BTN,
  primary: { ...BTN, border: '1px solid transparent', background: 'var(--gold-btn)', color: 'var(--text-strong)', fontWeight: 600 },
  start: {
    ...BTN,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    padding: '2px 18px 2px 6px',
    borderRadius: 24,
    border: '1px solid var(--studio-panel-border)',
    background: 'var(--studio-panel)',
    color: 'var(--studio-panel-text)',
    boxShadow: 'var(--shadow-1)',
    pointerEvents: 'auto',
  },
};

const cls = (...a) => a.filter(Boolean).join(' ');

export default function TourBubble({ running = false, line = null, index = 0, total = 0, phase = 'idle', onNext, onSkip, onStart, className = '' }) {
  const talking = useTalking(running);
  if (!running) {
    if (!onStart) return null;
    return (
      <button type="button" className={cls('walk-tour-start', className)} style={S.start} onClick={onStart}>
        <Pangie size={36} float={false} mood="happy" prop="none" />
        <span>{t('带我逛逛')}</span>
      </button>
    );
  }
  const pose = lineOf(line) || {};
  const walking = phase === 'walking';
  const last = total > 0 && index >= total - 1;
  return (
    <section className={cls('walk-tour', talking && 'is-talking', walking && 'is-walking', className)} style={S.wrap} aria-label={t('{0}带逛', [guideName()])}>
      <Pangie speaker size={64} mood={pose.mood || 'happy'} prop={pose.prop || 'ball'} className="walk-tour-pangie" />
      <div className="walk-tour-bubble" style={S.bubble}>
        <p className="walk-tour-text" style={{ ...S.text, opacity: walking ? 0.6 : 1 }} aria-live="polite" data-voice-skip="">
          {line ? lineText(line) : walking ? t('跟我来…') : ''}
        </p>
        <div className="walk-tour-actions" style={S.actions}>
          {total > 1 && (
            <span className="walk-tour-count" style={S.count} aria-hidden="true">
              {Math.min(index + 1, total)} / {total}
            </span>
          )}
          {last ? (
            <button type="button" className="walk-tour-ok" style={S.primary} onClick={onSkip}>
              {t('好的')}
            </button>
          ) : (
            <>
              <button type="button" className="walk-tour-skip" style={S.btn} onClick={onSkip}>
                {t('跳过')}
              </button>
              <button type="button" className="walk-tour-next" style={S.primary} onClick={onNext}>
                {t('下一站')}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
