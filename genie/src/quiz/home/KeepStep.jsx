// K · 家里有哪些会留下来？（SPEC §6）—— 只给「住着翻新」「刚交屋」的客人（交屋自带的地砖、柜子常常会留下）。
//   每一行：换新 | 保留；保留 → 色卡（程序化的 swatchURL）+「都不像」；换新 → 「跟着案例走：{材质}」。
//   顶上两个：新房，全部重新做（keepMode 'new'）· 我不确定，见面再说（keepMode 'unsure'，什么都不锁，设计师版记一笔）。
//   留下来的会被锁住（realiseCase 的 locks）：3D 里新的颜色跟着它们配。
//   最后一行：会留下来的大件家具（床、餐桌椅 —— 业主：沙发、床、餐桌；沙发的颜色在沙发那一行锁），只记给设计师。
//   户型图在后面读着：顶上一个「正在读你的户型图 · 42%」的小胶囊。

import { useState } from 'react';
import { Lock } from 'lucide-react';
import fx from '../../shared/fx.js';
import { t, L } from '../../shared/i18n.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { KEEP_SLOTS, KEEP_ITEMS, keepLabel, lab } from '../../shared/home.js';
import { Segmented } from '../ui.jsx';
import { Head, Next, useAdvance, ReadingPill, Swatch } from './kit.jsx';

export default function KeepStep({ home, set, caseMats = {}, reading, thumb, next }) {
  const advance = useAdvance(next);
  const keep = home.keep || {};
  const mode = home.keepMode;
  // 每一行是「换新」还是「保留」（保留了但还没点色卡 = 先打开色卡，什么都不锁）
  const [rows, setRows] = useState(() => Object.fromEntries(KEEP_SLOTS.map((k) => [k.slot, keep[k.slot] ? 'keep' : 'change'])));
  const handover = home.status === 'handover';

  const setRow = (slot, v) => {
    setRows((r) => ({ ...r, [slot]: v }));
    const nk = { ...keep };
    if (v === 'change') nk[slot] = null;
    const anyKeep = Object.values({ ...rows, [slot]: v }).includes('keep');
    set({ keep: nk, keepMode: anyKeep ? 'keep' : null });
  };
  const pickSwatch = (slot, id, e) => {
    const nk = { ...keep, [slot]: keep[slot] === id ? null : id };
    set({ keep: nk, keepMode: 'keep' });
    if (e?.currentTarget && nk[slot]) fx.scan(e.currentTarget.querySelector('.kp-chip') || e.currentTarget, { duration: 300, sound: null });
  };
  const top = (v, e) => {
    const on = mode === v;
    if (on) {
      set({ keepMode: null });
      return;
    }
    setRows(Object.fromEntries(KEEP_SLOTS.map((k) => [k.slot, 'change'])));
    set({ keepMode: v, keep: { floor: null, walls: null, cabinetry: null, upholstery: null }, keepItems: [] });
    if (e?.currentTarget) fx.scan(e.currentTarget, { duration: 280, sound: null });
  };
  const items = home.keepItems || [];
  const toggleItem = (v, e) => {
    const on = items.includes(v);
    const next = on ? items.filter((x) => x !== v) : [...items, v];
    set({ keepItems: next, ...(next.length && (mode === 'new' || mode === 'unsure') ? { keepMode: 'keep' } : {}) });
    if (!on && e?.currentTarget) fx.scan(e.currentTarget, { duration: 280, sound: null });
  };
  const seg = [
    { v: 'change', label: t('换新') },
    { v: 'keep', label: t('保留') },
  ];

  return (
    <div className="step hj-card kp">
      <ReadingPill reading={reading} thumb={thumb} />
      <Head
        eyebrow={t('你的家 · 现在')}
        title={handover ? t('交屋自带的，有要留下的吗？') : t('家里有哪些会留下来？')}
        lead={t('留下来的我会锁住，新的颜色跟着它们配。')}
      />
      <div className="kp-top">
        <button type="button" className={`chip ${mode === 'new' ? 'on' : ''}`} aria-pressed={mode === 'new'} onClick={(e) => top('new', e)} data-sfx="choice">
          {t('新房，全部重新做')}
        </button>
        <button type="button" className={`chip ${mode === 'unsure' ? 'on' : ''}`} aria-pressed={mode === 'unsure'} onClick={(e) => top('unsure', e)} data-sfx="choice">
          {t('我不确定，见面再说')}
        </button>
      </div>
      <div className={`kp-rows ${mode === 'new' || mode === 'unsure' ? 'is-off' : ''}`}>
        {KEEP_SLOTS.map((k) => {
          const rowMode = rows[k.slot];
          const chosen = keep[k.slot];
          const fromCase = MAT_BY_ID[caseMats[k.slot]];
          return (
            <div key={k.slot} className="kp-row">
              <div className="kp-what">
                <b>{lab(k)}</b>
                <Segmented options={seg} value={rowMode} label={lab(k)} onChange={(v) => setRow(k.slot, v)} />
              </div>
              {rowMode === 'keep' ? (
                <div className="kp-sw" role="radiogroup" aria-label={lab(k)}>
                  {k.swatches.map((id) => (
                    <button key={id} type="button" role="radio" aria-checked={chosen === id} className={chosen === id ? 'on' : ''} onClick={(e) => pickSwatch(k.slot, id, e)}>
                      <Swatch id={id} px={112} className="kp-chip">
                        {chosen === id && (
                          <span className="kp-lock" aria-hidden="true">
                            <Lock size={11} strokeWidth={2.4} />
                          </span>
                        )}
                      </Swatch>
                      <span>{keepLabel(k.slot, id)}</span>
                    </button>
                  ))}
                  <button type="button" role="radio" aria-checked={chosen === 'unsure'} className={chosen === 'unsure' ? 'on' : ''} onClick={(e) => pickSwatch(k.slot, 'unsure', e)}>
                    <span className="kp-chip kp-none" />
                    <span>{t('都不像')}</span>
                  </button>
                </div>
              ) : (
                <p className="kp-new">{fromCase ? t('跟着案例走：{0}', [L(fromCase)]) : t('跟着案例走')}</p>
              )}
            </div>
          );
        })}
        <div className="kp-row kp-items">
          <div className="kp-what">
            <b>{t('大件家具')}</b>
            <small>{t('会留下来的点一下')}</small>
          </div>
          <div className="chips ink-chips" data-sfx="chip">
            {KEEP_ITEMS.map((it) => (
              <button key={it.v} type="button" className={`chip ${items.includes(it.v) ? 'on' : ''}`} aria-pressed={items.includes(it.v)} onClick={(e) => toggleItem(it.v, e)}>
                {lab(it)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="q-actions">
        <Next onClick={(e) => advance(e)}>{t('下一步')}</Next>
      </div>
    </div>
  );
}
