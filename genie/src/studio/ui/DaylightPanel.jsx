// 右侧：日光 DAYLIGHT —— 大字时间 + 太阳弧 + 四个时段（真实渲染的小图）+ 24 小时滑杆。
// 滑杆的渐变直接取 engine/daylight.js 的窗外天色（bgSky），和 3D 里的光永远对得上。

import { useMemo } from 'react';
import { DAY_PRESETS, daylight, fmtTime } from '../engine/daylight.js';
import { t, isEn } from '../../shared/i18n.js';
import { Icon } from './kit.jsx';
import SunArc from './SunArc.jsx';

const ICON = { morning: 'sunrise', midday: 'sun', evening: 'sunset', night: 'moon' };
const STOPS = [5, 6, 7, 8, 10, 13, 16, 18, 19, 20, 22, 24];
// 时段名：资料里自带简短的英文（Morning / Night），比词典里的长译名更适合小卡片
const nameOf = (p) => (isEn() ? p.en : p.zh);

/** 滑杆渐变：05:00 → 24:00 的真实天色 */
export function skyGradient(north = 0) {
  try {
    const stops = STOPS.map((h) => `${daylight(h, north).bgSky} ${(((h - 5) / 19) * 100).toFixed(1)}%`);
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  } catch {
    return '';
  }
}

export default function DaylightPanel({ time, thumbs, onTime, onCommit, north = 0 }) {
  const near = DAY_PRESETS.reduce((b, p) => (Math.abs(p.hour - time) < Math.abs(b.hour - time) ? p : b), DAY_PRESETS[0]);
  const grad = useMemo(() => skyGradient(north), [north]);
  const isOn = (p) => near.id === p.id && Math.abs(p.hour - time) < 0.75;
  const pick = (p) => {
    onTime(p.hour);
    onCommit?.();
  };
  return (
    <aside className="glass panel day-panel" aria-label={t('日光')}>
      <header className="day-head">
        <div>
          <p className="eyebrow">{t('日光')}</p>
          <b className="day-time">{fmtTime(time)}</b>
        </div>
        <span className="day-period">
          <Icon name={ICON[near.id]} size={15} />
          {nameOf(near)}
        </span>
      </header>

      <div className="day-arc">
        <SunArc time={time} onTime={onTime} onCommit={onCommit} />
      </div>

      <div className="day-grid">
        {DAY_PRESETS.map((p, i) => (
          <button key={p.id} type="button" className={`day-tile ${isOn(p) ? 'on' : ''}`} onClick={() => pick(p)} aria-pressed={isOn(p)}>
            {thumbs[i] ? <img src={thumbs[i]} alt="" draggable={false} /> : <i />}
            <span>
              <b>{nameOf(p)}</b>
              <em>{fmtTime(p.hour)}</em>
            </span>
          </button>
        ))}
      </div>

      <div className="day-chips">
        {DAY_PRESETS.map((p) => (
          <button key={p.id} type="button" className={isOn(p) ? 'on' : ''} onClick={() => pick(p)} aria-label={`${nameOf(p)} ${fmtTime(p.hour)}`} title={`${nameOf(p)} ${fmtTime(p.hour)}`}>
            <Icon name={ICON[p.id]} size={17} />
          </button>
        ))}
      </div>

      <div className="day-slide">
        <input
          className="day-slider"
          type="range"
          min={5}
          max={24}
          step={0.05}
          style={grad ? { '--sky': grad } : undefined}
          value={Math.max(5, time < 5 ? time + 24 : time)}
          onChange={(e) => onTime(Number(e.target.value) % 24)}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          aria-label={t('一天中的时间')}
          aria-valuetext={fmtTime(time)}
        />
        <div className="day-scale" aria-hidden="true">
          <span>05</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>
    </aside>
  );
}
