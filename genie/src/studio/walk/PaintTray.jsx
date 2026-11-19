// 走进去 · 刷颜色 / 地板的材质托盘（SPEC §5 · U5b）。
//
// WalkMode 怎么用它：工具是 'paint' 或 'floor' 时画在 .walk-dock 里（工具轮正上方、居中；手机上整行宽），
//   <PaintTray key={tool} mode={tool} … />：根节点请用 walk-tools.css 的 .walk-panel 一类的样式（玻璃卡、≥ 44px）。
// props（所有工具面板都一样，WalkMode 一次全给）：
//   ctl      controller（SPEC §3）；第一次画的时候可能还是 null。自己用 ctl.on('pick', fn) → off 订阅（'pick' {slot, matId, hit}）
//   engine   Engine（highlightSlot(slot) …）
//   project  最新的方案（materials、furniture、walkMarks、time）—— 换了材质会带着新的 project 重画
//   api      StudioApp 给的接口（SPEC §6）：dropMaterial(slot, matId) → boolean、flash(msg) …
//   wish     许愿模式（不下载、不选文件、不出设置）· staff 员工入口
//   room     你站的房间（{ id, type, name, … } 或 null）· fi 第几层（下标）
//   mode     'paint'：点哪换哪（slotOfHit）· 'floor'：脚下这个房间的地面（floorSlotOf(room.type)）
//   onClose  收起面板（回到「走」）
// 撤销在外壳（左上角「回到全屋」旁边），面板不用再放。名字只给材质名（不出编号、价钱）；我们做的打「我们做」。
//
// 做法：刷颜色等控制器的 'pick'（点到的那一面是哪个表面；null = 玻璃、外墙这种换不了的 → 一句提示）；地板直接用你站的
//   房间（厨房、浴室… 铺砖的 → 'tile'），点了别的房间的地面就换那一间的。托盘和材质栏同一份：MATERIALS + fits()（有溪岸板材
//   的柜体 / 主题墙，板材排第一组），样板一样、名字一样（chipName：显示名，永远不带厂家编号）；我们做按 offer.js isOfferSlot。
//   点一个 → api.dropMaterial(slot, id)（StudioApp 自己查合不合适、锁住的先问、说一声换成了什么）。
//   这一面在 3D 里发金光 HILITE_MS（整屋同一种表面一起亮：一起换）；一直亮着会让画面每帧都重画，所以只亮一会儿。

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, L, isEn } from '../../shared/i18n.js';
import { CATEGORIES, MATERIALS, MAT_BY_ID, SLOT_BY_ID, BOARD_SLOTS, boardsFor, fits } from '../../shared/materials.js';
import { boardsOn } from '../../shared/boards/match.js';
import { swatchURL } from '../../shared/textures.js';
import { isOfferSlot } from '../offer.js';
import { Icon, OfferMark, chipName, slotName } from '../ui/kit.jsx';
import { floorSlotOf } from './paint.js';
import './walk-tools.css';

export const HILITE_MS = 2600;

const cls = (...a) => a.filter(Boolean).join(' ');
const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/**
 * 这个表面能放的材质，分组（和材质栏同一份）：溪岸板材（柜体 / 主题墙、有登记的板才有；★ 常用在前）→ 这个表面接受的类别
 * （SLOTS.cats 的顺序：地板 = 木 / 石 / 砖）。→ [{ id, label, items: [材质] }]，没有东西的组不要。
 */
export function trayGroups(slot) {
  const S = SLOT_BY_ID[slot];
  if (!S) return [];
  const out = [];
  if (BOARD_SLOTS.includes(slot) && boardsOn()) {
    const sail = boardsFor(slot)
      .filter((m) => fits(m.id, slot))
      .sort((a, b) => (b.board.fav ? 1 : 0) - (a.board.fav ? 1 : 0));
    if (sail.length) out.push({ id: 'sail', label: t('溪岸板材'), items: sail });
  }
  for (const c of S.cats) {
    const items = MATERIALS.filter((m) => m.cat === c && fits(m.id, slot));
    if (items.length) out.push({ id: c, label: L(CAT_BY_ID[c]) || c, items });
  }
  return out;
}

/** 一开始停在哪一组：现在用的材质在的那一组，不然第一组 */
export function trayTab(groups, cur) {
  return (groups.find((g) => g.items.some((m) => m.id === cur)) || groups[0])?.id ?? null;
}

/** 这一面现在的样子旁边的小标签：保留你家原有（锁住的）/ 我们做 / 不标 */
export function slotTag(slot, project) {
  if (project?.locked?.[slot]) return 'kept';
  return isOfferSlot(slot, project?.materials?.[slot]) ? 'make' : null;
}

function Tag({ kind }) {
  if (kind === 'kept')
    return (
      <i className="st-offer-tag kept">
        <Icon name="lock" size={10} stroke={2.2} />
        {t('保留你家原有')}
      </i>
    );
  if (kind === 'make')
    return (
      <i className="st-offer-tag">
        <Icon name="make" size={10} stroke={2.2} />
        {t('我们做')}
      </i>
    );
  return null;
}

function ChipName({ fam, name }) {
  return (
    <span className={cls('chip-name', fam && 'has-fam')}>
      {fam && <i>{fam}</i>}
      <b>{name}</b>
    </span>
  );
}

/**
 * 托盘本身（一个表面）：头一行（表面名 + 现在的材质 + 我们做 · 类别 · 收起）、一排样板、一行小字。
 * key 用表面：换了表面就从「现在用的那一组」重新开始。
 */
export function MaterialTray({ slot, project, mode = 'paint', onChoose, onClose }) {
  const groups = trayGroups(slot);
  const cur = project?.materials?.[slot] ?? null;
  const [tab, setTab] = useState(() => trayTab(groups, cur));
  const group = groups.find((g) => g.id === tab) || groups[0] || null;
  const row = useRef(null);

  // 换了组：滚到现在用的那一块（不在这一组 → 回到开头）
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const on = el.querySelector('.walk-chip.is-cur');
    el.scrollLeft = on ? Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2) : 0;
  }, [tab]);

  const name = slotName(SLOT_BY_ID[slot]);
  const curM = MAT_BY_ID[cur];
  const foot = [t('整屋的{0}一起换', [isEn() ? name.toLowerCase() : name]), mode === 'paint' ? t('点别处换别的') : ''].filter(Boolean).join(' · ');

  return (
    <div className="walk-panel walk-tray glass" role="group" aria-label={name} data-walk-slot={slot}>
      <div className="walk-panel-head">
        <span className="walk-panel-ico">
          <Icon name={mode === 'floor' ? 'start' : 'palette'} size={18} />
        </span>
        <span className="walk-panel-title">
          <b>{name}</b>
          {curM && (
            <em>
              {t('现在：{0}', [L(curM)])}
              <Tag kind={slotTag(slot, project)} />
            </em>
          )}
        </span>
        {groups.length > 1 && (
          <div className="walk-seg" role="group" aria-label={t('材质类别')}>
            {groups.map((g) => (
              <button key={g.id} type="button" className={g.id === group?.id ? 'on' : ''} aria-pressed={g.id === group?.id} onClick={() => setTab(g.id)}>
                {g.label}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="walk-panel-x" aria-label={t('关闭')} title={t('关闭')} data-sfx="close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="walk-tray-row" ref={row}>
        {(group?.items || []).map((m) => {
          const on = m.id === cur;
          return (
            <button key={m.id} type="button" className={cls('walk-chip', on && 'is-cur')} data-mat={m.id} aria-pressed={on} aria-label={L(m)} title={L(m)} data-sfx="apply" onClick={() => onChoose?.(m.id)}>
              <span className="sample sm">
                <img src={swatchURL(m.id, 128) || ''} alt="" draggable={false} />
                {isOfferSlot(slot, m.id) && <OfferMark />}
              </span>
              <ChipName {...chipName(m)} />
            </button>
          );
        })}
      </div>
      <p className="walk-panel-foot">{foot}</p>
    </div>
  );
}

/**
 * 托盘现在给哪个表面：刷颜色 → 最近一次点到的（还没点 = undefined → 提示；点到玻璃、外墙 = null → 换不了）；
 * 地板 → 点了哪一间的地面就是那一间的，不然你站的房间（铺砖的厨卫 → 'tile'）
 */
export function traySlot(mode, pick, room) {
  if (mode === 'floor') return pick?.slot || floorSlotOf(room?.type);
  return pick ? (pick.slot ?? null) : undefined;
}

/** 还没有表面（刷颜色还没点）/ 点到的换不了：一张小卡，一句话 */
export function TrayHint({ none, onClose }) {
  return (
    <div className="walk-panel walk-tray glass" role="group" aria-label={t('刷颜色')}>
      <div className="walk-panel-head">
        <span className="walk-panel-ico">
          <Icon name="palette" size={18} />
        </span>
        <span className="walk-panel-title">
          <b>{t('刷颜色')}</b>
        </span>
        <button type="button" className="walk-panel-x" aria-label={t('关闭')} title={t('关闭')} data-sfx="close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <p className="walk-panel-hint" role="status" aria-live="polite">
        <Icon name={none ? 'info' : 'pointer'} size={16} />
        <span>{none ? t('这一处换不了颜色（玻璃、外墙…）。点墙、地板、柜子试试') : t('点一下想换的地方：墙、地板、柜子、台面、沙发都可以')}</span>
      </p>
    </div>
  );
}

export default function PaintTray({ ctl, engine, project, api, room = null, mode = 'paint', onClose }) {
  const floor = mode === 'floor';
  // 最近一次点到的：{ slot（null = 换不了）}；刷颜色还没点 → null
  const [pick, setPick] = useState(null);
  useEffect(() => ctl?.on?.('pick', (e) => setPick({ slot: e?.slot ?? null })), [ctl]);
  // 地板：走到别的房间 → 跟着你站的房间（忘掉刚才点的那一间）
  const roomId = room?.id ?? null;
  useEffect(() => {
    if (floor) setPick(null);
  }, [floor, roomId]);

  const slot = traySlot(mode, pick, room);
  const ok = !!slot && !!SLOT_BY_ID[slot];

  // 3D 里这一面发金光一会儿（每点一次再亮一次）；收起 / 换了 → 熄掉
  useEffect(() => {
    if (!ok || !engine?.highlightSlot) return undefined;
    engine.highlightSlot(slot);
    const tm = setTimeout(() => engine.highlightSlot(null), HILITE_MS);
    return () => {
      clearTimeout(tm);
      engine.highlightSlot(null);
    };
  }, [engine, ok, slot, pick]);

  if (!ok) return <TrayHint none={slot === null} onClose={onClose} />;
  return <MaterialTray key={slot} slot={slot} project={project} mode={mode} onChoose={(id) => api?.dropMaterial?.(slot, id)} onClose={onClose} />;
}
