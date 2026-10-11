// 左侧：SET THE MOOD —— 一键情绪（客人的梦想家配色 + Cozy / Bright / Moody）＋ 情绪仪表 ＋ 一句话 ＋ 材质板（点一个表面）。
// 设计师打开客人档案时，底下多一张「收纳对账」（StorageCheck，由 StudioApp 传进来）。

import { MOODS, moodMeter, moodSentence } from '../../shared/moods.js';
import { SLOTS, MAT_BY_ID } from '../../shared/materials.js';
import { avoidMaterials } from '../../shared/profile.js';
import { swatchURL } from '../../shared/textures.js';
import { t, L, isEn } from '../../shared/i18n.js';
import { Icon, slotName } from './kit.jsx';
import { BRAND } from '../../shared/config.js';

// 情绪色来自 base.css 的 token（--mood-*），不在这里写颜色
const MOOD_TINT = { cozy: 'var(--mood-cozy)', bright: 'var(--mood-bright)', moody: 'var(--mood-moody)' };
const MOOD_NAME = { cozy: { zh: '温暖', en: 'Cozy' }, bright: { zh: '明亮', en: 'Bright' }, moody: { zh: '沉浸', en: 'Moody' } };
const SUB = { 'golden hour': '金色黄昏', midday: '正午', 'after dark': '入夜' };
const paletteOf = (m) => ['walls', 'floor', 'upholstery', 'feature', 'accents'].map((s) => MAT_BY_ID[m[s]]?.color || 'var(--line)');

export default function MoodPanel({ project, dreamer, slot, onSlot, onMood, onToggle, chip, note, extra }) {
  const meter = moodMeter(project.materials, project.time);
  const sent = moodSentence(project.materials, project.time);
  const avoid = project.profile?.avoid || [];
  const presets = MOODS.map((m) => ({
    id: m.id,
    name: isEn() ? m.en : m.zh, // Cozy / Bright / Moody 是固定的英文名，不走词典
    sub: t(SUB[m.sub] || m.sub),
    colors: paletteOf(avoid.length ? avoidMaterials(m.materials, avoid).materials : m.materials),
  }));
  if (dreamer && project.profile) {
    // 和 StudioApp.applyMood('dreamer') 套上去的是同一套：温暖做底 + 客人的材质，再避开雷区 —— 预览和点下去的一样
    const dm = { ...(MOODS.find((m) => m.id === 'cozy')?.materials || {}), ...(project.profile.materials || {}) };
    presets.unshift({ id: 'dreamer', name: L(dreamer), sub: `${dreamer.num} · ${project.profile.code}`, colors: avoid.length ? paletteOf(avoidMaterials(dm, avoid).materials) : dreamer.palette, dreamer: true });
  }

  return (
    <aside className="glass panel mood-panel" aria-label={t('情绪 · 材质 · 光')}>
      <button type="button" className="panel-fab" onClick={onToggle} aria-label={t('展开情绪面板')} title={t('情绪 · 材质 · 光')}>
        <Icon name="palette" size={20} />
      </button>
      <div className="mp-inner">
        <header className="mp-head">
          <div>
            <p className="eyebrow">{t('情绪 · 材质 · 光')}</p>
            <h2 className="mp-title">{t('定个情绪')}</h2>
          </div>
          <button type="button" className="ibtn sm" onClick={onToggle} aria-label={t('收起面板')} title={t('收起面板')}>
            <Icon name="panelClose" size={18} />
          </button>
        </header>
        <p className="mp-desc">{t('一块会自己长成房间的情绪板：把木、石、布、漆拖到任何表面，挪一挪家具，再把太阳拉过天空。')}</p>
        {chip}
        {note}

        <div className={`presets n${presets.length}`} role="radiogroup" aria-label={t('一键情绪')}>
          {presets.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={project.mood === p.id} className={`preset ${project.mood === p.id ? 'on' : ''} ${p.dreamer ? 'dreamer' : ''}`} onClick={() => onMood(p.id)}>
              <span className="preset-pal" aria-hidden="true">
                {p.colors.map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              <b>
                {p.dreamer && <Icon name="sparkles" size={14} />}
                {p.name}
              </b>
              <em>{p.sub}</em>
            </button>
          ))}
        </div>

        <div className="meters" aria-label={t('情绪仪表')}>
          {['cozy', 'bright', 'moody'].map((k) => (
            <div key={k} className={`meter ${sent.top === k ? 'top' : ''}`}>
              <span>{isEn() ? MOOD_NAME[k].en : MOOD_NAME[k].zh}</span>
              <b>{meter[k]}%</b>
              <i>
                <em style={{ width: `${meter[k]}%`, background: MOOD_TINT[k] }} />
              </i>
            </div>
          ))}
        </div>
        <p className="mood-sentence">{sent.text}</p>

        <section className="moodboard">
          <div className="sec-head">
            <span>{t('材质板 · MOODBOARD')}</span>
            <em>{slot ? t('再点一下取消') : t('点一个表面')}</em>
          </div>
          <div className="mb-grid">
            {SLOTS.map((s) => {
              const m = MAT_BY_ID[project.materials[s.id]];
              return (
                <button key={s.id} type="button" data-slot={s.id} className={`mb-tile ${slot === s.id ? 'on' : ''}`} onClick={() => onSlot(s.id)} aria-pressed={slot === s.id}>
                  <span className="sample sm">
                    <img src={swatchURL(m?.id, 96) || ''} alt="" draggable={false} />
                  </span>
                  <span className="mb-slot">{slotName(s)}</span>
                  <b>{L(m)}</b>
                </button>
              );
            })}
          </div>
        </section>
        {extra}
        <footer className="mp-brand" aria-hidden="true">
          <b>{BRAND.app}</b>
          <span>{BRAND.by}</span>
        </footer>
      </div>
    </aside>
  );
}
