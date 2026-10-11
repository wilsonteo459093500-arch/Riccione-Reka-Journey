// 左侧：SET THE MOOD —— 一键情绪 + 情绪仪表（像 The Sims 的需求条）+ 一句话 + 材质板（点一个表面）。

import { MOODS, moodMeter, moodSentence } from '../../shared/moods.js';
import { SLOTS, MAT_BY_ID } from '../../shared/materials.js';
import { swatchURL } from '../../shared/textures.js';
import { Icon } from './kit.jsx';

const MOOD_TINT = { cozy: '#E1913F', bright: '#9DC3E6', moody: '#8F7FD6' };
const paletteOf = (m) => ['walls', 'floor', 'upholstery', 'feature', 'accents'].map((s) => MAT_BY_ID[m[s]]?.color || '#999');

export default function MoodPanel({ project, dreamer, slot, onSlot, onMood, onToggle, chip }) {
  const meter = moodMeter(project.materials, project.time);
  const sent = moodSentence(project.materials, project.time);
  const presets = [...MOODS.map((m) => ({ id: m.id, zh: m.zh, en: m.en, sub: m.sub, colors: paletteOf(m.materials) }))];
  if (dreamer && project.profile) presets.unshift({ id: 'dreamer', zh: dreamer.zh, en: project.profile.name || 'Dreamer', sub: `${dreamer.num} · ${project.profile.code}`, colors: dreamer.palette, dreamer: true });
  return (
    <aside className="panel mood-panel">
      <button type="button" className="panel-toggle" onClick={onToggle} aria-label="收起 / 展开">
        <Icon name="menu" />
      </button>
      <div className="mood-title">
        <span>SET THE</span>
        <b>MOOD</b>
      </div>
      <p className="mood-desc">一块会自己长成房间的情绪板：把木、石、布、漆拖到任何表面，挪一挪家具，再把太阳拉过天空。</p>
      {chip && <div className="mood-chip">{chip}</div>}

      <div className={`presets n${presets.length}`}>
        {presets.map((p) => (
          <button key={p.id} type="button" className={`preset ${project.mood === p.id ? 'on' : ''} ${p.dreamer ? 'dreamer' : ''}`} onClick={() => onMood(p.id)}>
            <span className="preset-pal">
              {p.colors.map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
            <b>{p.dreamer ? `✨ ${p.zh}` : p.en}</b>
            <em>{p.dreamer ? p.sub : `${p.zh} · ${p.sub}`}</em>
          </button>
        ))}
      </div>

      <div className="meters">
        {['cozy', 'bright', 'moody'].map((k) => (
          <div key={k} className={`meter ${sent.top === k ? 'top' : ''}`}>
            <span>{k.toUpperCase()}</span>
            <b>{meter[k]}%</b>
            <i>
              <em style={{ width: `${meter[k]}%`, background: MOOD_TINT[k] }} />
            </i>
          </div>
        ))}
      </div>
      <p className="mood-sentence">{sent.text}</p>

      <div className="moodboard">
        <div className="mb-head">
          <span>MOODBOARD</span>
          <em>{slot ? '再点一下取消' : '点一个表面'}</em>
        </div>
        <div className="mb-grid">
          {SLOTS.map((s) => {
            const m = MAT_BY_ID[project.materials[s.id]];
            return (
              <button key={s.id} type="button" data-slot={s.id} className={`mb-tile ${slot === s.id ? 'on' : ''}`} onClick={() => onSlot(s.id)}>
                <img src={swatchURL(m?.id, 96) || ''} alt="" draggable={false} />
                <span>{s.en}</span>
                <b>{m?.zh}</b>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
