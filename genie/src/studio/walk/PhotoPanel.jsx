// 走进去 · 拍照 = 收藏这个角度（SPEC §5 · U5b）。
//
// WalkMode：工具是 'photo' 时画在 .walk-dock 里（工具轮正上方、居中；手机上整行宽）。
// props（所有工具面板都一样）：
//   ctl      controller；可能是 null。ctl.photo() → mark · ctl.goto(mark) · ctl.pose()
//   project  project.walkMarks（marks.js 的 marksOf）· api.setMarks(list)（不进撤销）
//   api.shoot  员工才有：「下载这张」；许愿模式是 null —— 许愿模式什么都不下载（test/walk-ui.test.mjs 查）
//   engine · wish · staff · room · fi · mode（没用）
//   onClose  收起面板（回到「走」）
//
// 做法：「收藏这个角度」→ api.setMarks(addMark(marksOf(project), ctl.photo()))：只记站在哪、朝哪看、几点钟（不存图）。
//   列表新的在上面：房间名（project.plan 里找）、多层写哪一层、那时几点（太阳 / 月亮）；点一行 → ctl.goto(mark)（淡出淡入跳过去，
//   钟点也回去）；× → removeMark。满了（MAX_MARKS）再收藏会丢掉最早的那个（说一声）。
//   「下载这张」只有员工版、而且 api.shoot 不是 null 才有（许愿模式的展厅 iPad 上什么都不下载）。

import { useState } from 'react';
import { t } from '../../shared/i18n.js';
import { daylight, fmtTime } from '../engine/daylight.js';
import { floorName, isMultiFloor } from '../plan/model.js';
import { Icon, roomLabel } from '../ui/kit.jsx';
import { MAX_MARKS, addMark, marksOf, removeMark } from './marks.js';
import './walk-tools.css';

function roomById(plan, id) {
  if (!id) return null;
  for (const f of plan?.floors || []) for (const r of f.rooms || []) if (r.id === id) return r;
  return null;
}

/** 收藏的角度 → 列表的行（新的在上面）：{ mark, name（房间名；不在房间里 → 角度 n，从旧到新数）, sub（哪一层 · 几点）, night } */
export function markRows(project) {
  const plan = project?.plan;
  const multi = isMultiFloor(plan);
  return marksOf(project)
    .map((mark, i) => {
      const r = roomById(plan, mark.room);
      const h = Number(mark.hour);
      const when = Number.isFinite(h) ? fmtTime(h) : '';
      const where = multi && (plan.floors || []).some((f) => f.id === mark.floor) ? t(floorName(plan, mark.floor)) : '';
      return { mark, name: r ? roomLabel(r) : t('角度 {0}', [i + 1]), sub: [where, when].filter(Boolean).join(' · '), night: Number.isFinite(h) && daylight(h).night >= 0.5 };
    })
    .reverse();
}

export default function PhotoPanel({ ctl, project, api, wish = false, onClose }) {
  const [fresh, setFresh] = useState(null); // 刚收藏的那一个（亮一下）
  const rows = markRows(project);
  // 下载：员工版才有（许愿模式没有，api.shoot 也是 null）
  const shoot = !wish && typeof api?.shoot === 'function' ? api.shoot : null;

  const save = () => {
    const pose = ctl?.photo?.();
    if (!pose || !api?.setMarks) return;
    const list = marksOf(project);
    const next = addMark(list, pose);
    api.setMarks(next);
    setFresh(next[next.length - 1]?.id ?? null);
    if (list.length >= MAX_MARKS) api.flash?.(t('最多收藏 {0} 个角度：最早的那个换掉了', [MAX_MARKS]));
  };
  const go = (mark) => {
    Promise.resolve(ctl?.goto?.(mark)).then((ok) => {
      if (ok === false) api?.flash?.(t('回不到这个角度了（平面图可能改过）'));
    });
  };
  const drop = (id) => api?.setMarks?.(removeMark(marksOf(project), id));

  return (
    <div className="walk-panel walk-photo glass" role="group" aria-label={t('拍照')}>
      <div className="walk-panel-head">
        <span className="walk-panel-ico">
          <Icon name="snapshot" size={18} />
        </span>
        <span className="walk-panel-title">
          <b>{t('收藏的角度')}</b>
          <em>{rows.length ? t('点一个就回到那里') : t('只记站在哪、朝哪看，之后可以跳回来')}</em>
        </span>
        <button type="button" className="walk-panel-x" aria-label={t('关闭')} title={t('关闭')} data-sfx="close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="walk-btns">
        <button type="button" className="walk-btn is-gold" data-walk-act="mark" data-sfx="confirm" disabled={!ctl} onClick={save}>
          <Icon name="plus" size={18} />
          <span>{t('收藏这个角度')}</span>
        </button>
        {shoot && (
          <button type="button" className="walk-btn" data-walk-act="shoot" onClick={() => shoot()}>
            <Icon name="download" size={18} />
            <span>{t('下载这张')}</span>
          </button>
        )}
      </div>
      {rows.length > 0 && (
        <ul className="walk-photo-list">
          {rows.map(({ mark, name, sub, night }) => (
            <li key={mark.id} className={mark.id === fresh ? 'walk-photo-item is-new' : 'walk-photo-item'} data-mark={mark.id}>
              <button type="button" className="walk-photo-go" onClick={() => go(mark)}>
                <Icon name={night ? 'moon' : 'sun'} size={17} />
                <span>
                  <b>{name}</b>
                  {sub && <em>{sub}</em>}
                </span>
              </button>
              <button type="button" className="walk-photo-x" aria-label={t('删掉这个角度')} title={t('删掉这个角度')} data-sfx="close" onClick={() => drop(mark.id)}>
                <Icon name="close" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
