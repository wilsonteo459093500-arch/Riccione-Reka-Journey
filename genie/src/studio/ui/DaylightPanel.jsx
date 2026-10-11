// 右侧：DAYLIGHT —— 四个时段（真实渲染的小图）+ 24 小时滑杆。拖一下，光就在屋里走一遍。

import { DAY_PRESETS, fmtTime } from '../engine/daylight.js';
import { Icon } from './kit.jsx';

const ICON = { morning: 'sunrise', midday: 'sun', evening: 'lamp', night: 'moon' };

export default function DaylightPanel({ time, thumbs, onTime, onCommit }) {
  const near = DAY_PRESETS.reduce((b, p) => (Math.abs(p.hour - time) < Math.abs(b.hour - time) ? p : b), DAY_PRESETS[0]);
  return (
    <aside className="panel day-panel">
      <div className="day-head">
        <span>DAYLIGHT</span>
        <b>{fmtTime(time)}</b>
      </div>
      <div className="day-list">
        {DAY_PRESETS.map((p, i) => (
          <button key={p.id} type="button" className={`day-row ${near.id === p.id && Math.abs(p.hour - time) < 0.75 ? 'on' : ''}`} onClick={() => (onTime(p.hour), onCommit?.())}>
            <span className="day-ico">
              <Icon name={ICON[p.id]} size={16} />
            </span>
            <span className="day-thumb">{thumbs[i] ? <img src={thumbs[i]} alt="" /> : <i />}</span>
            <span className="day-lbl">
              <b>{p.en}</b>
              <em>{fmtTime(p.hour)}</em>
            </span>
          </button>
        ))}
      </div>
      <input
        className="day-slider"
        type="range"
        min={5}
        max={24}
        step={0.05}
        value={Math.max(5, time < 5 ? time + 24 : time)}
        onChange={(e) => onTime(Number(e.target.value) % 24)}
        onPointerUp={onCommit}
        aria-label="一天中的时间"
      />
      <div className="day-scale">
        <span>05</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </aside>
  );
}
