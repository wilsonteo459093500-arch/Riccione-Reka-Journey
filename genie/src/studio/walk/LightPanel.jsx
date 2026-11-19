// 走进去 · 灯光（SPEC §5 · U5b）：白天到晚上（ui/SunArc.jsx + 几个时刻）、晚上开灯。
//
// WalkMode：工具是 'light' 时画在 .walk-dock 里（工具轮正上方、居中；手机上整行宽）。
// props（所有工具面板都一样）：
//   ctl · engine · project（project.time = 现在几点）· api（setTime(h)）· wish · staff · room · fi · mode（没用）
//   onClose  收起面板（回到「走」）
//
// 做法：大字时间 + 白天 / 晚上的开关（晚上 = 深夜那一档：屋里的灯都亮；回白天 = 回到刚才白天的那个钟点）、鸟瞰日光面板的
//   太阳弧（拖太阳 = 拖时间）、四个时刻（清晨 / 正午 / 傍晚 / 深夜，engine/daylight.js DAY_PRESETS）。都只调 api.setTime(h)：
//   StudioApp 改 3D 的光、记进方案（不进撤销）；屋里的夜灯按人在哪排是控制器的事（project.time 变了它会重排）。

import { useEffect, useRef } from 'react';
import { t, isEn } from '../../shared/i18n.js';
import { DAY_PRESETS, daylight, fmtTime } from '../engine/daylight.js';
import SunArc from '../ui/SunArc.jsx';
import { Icon } from '../ui/kit.jsx';
import './walk-tools.css';

const ICON = { morning: 'sunrise', midday: 'sun', evening: 'sunset', night: 'moon' };
const BY_ID = Object.fromEntries(DAY_PRESETS.map((p) => [p.id, p]));
// 时刻名：资料里自带简短的英文（和鸟瞰的日光面板一样）
const nameOf = (p) => (isEn() ? p.en : p.zh);

/** 这个钟点算不算晚上（屋里的灯亮着）：和 daylight() 的夜灯同一条线 */
export const isNight = (h) => daylight(Number(h) || 0).night >= 0.5;

/** 离现在最近的时刻；差 45 分钟以内才算「在这一档」 */
export function nearPreset(h) {
  const near = DAY_PRESETS.reduce((b, p) => (Math.abs(p.hour - h) < Math.abs(b.hour - h) ? p : b), DAY_PRESETS[0]);
  return { near, on: Math.abs(near.hour - h) < 0.75 };
}

export default function LightPanel({ project, api, onClose }) {
  const time = Number.isFinite(+project?.time) ? +project.time : BY_ID.midday.hour;
  const night = isNight(time);
  // 回到白天：回到刚才白天的钟点（一直是晚上 → 正午）
  const lastDay = useRef(BY_ID.midday.hour);
  useEffect(() => {
    if (!night) lastDay.current = time;
  }, [night, time]);
  const set = (h) => api?.setTime?.(h);
  const { near, on } = nearPreset(time);

  return (
    <div className="walk-panel walk-light glass" role="group" aria-label={t('灯光')}>
      <div className="walk-panel-head">
        <span className="walk-panel-ico">
          <Icon name={ICON[near.id]} size={18} />
        </span>
        <span className="walk-panel-title">
          <b className="walk-light-time">{fmtTime(time)}</b>
          <em>{night ? t('晚上 · 屋里的灯都亮着') : nameOf(near)}</em>
        </span>
        <div className="walk-seg" role="group" aria-label={t('白天 / 晚上')}>
          <button type="button" className={night ? '' : 'on'} aria-pressed={!night} data-walk-light="day" onClick={() => night && set(lastDay.current)}>
            <Icon name="sun" size={16} />
            <span>{t('白天')}</span>
          </button>
          <button type="button" className={night ? 'on' : ''} aria-pressed={night} data-walk-light="night" onClick={() => !night && set(BY_ID.night.hour)}>
            <Icon name="moon" size={16} />
            <span>{t('晚上')}</span>
          </button>
        </div>
        <button type="button" className="walk-panel-x" aria-label={t('关闭')} title={t('关闭')} data-sfx="close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="walk-light-arc">
        <SunArc time={time} onTime={set} />
      </div>
      <div className="walk-light-presets" role="group" aria-label={t('一天中的时间')}>
        {DAY_PRESETS.map((p) => {
          const pressed = on && near.id === p.id;
          return (
            <button key={p.id} type="button" className={pressed ? 'on' : ''} aria-pressed={pressed} title={`${nameOf(p)} · ${fmtTime(p.hour)}`} onClick={() => set(p.hour)}>
              <Icon name={ICON[p.id]} size={18} />
              <span>{nameOf(p)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
