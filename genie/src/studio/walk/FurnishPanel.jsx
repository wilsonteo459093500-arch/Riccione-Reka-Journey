// 走进去 · 家具（SPEC §5 · U5b）。
//
// WalkMode：工具是 'furnish' 时画在 .walk-dock 里（工具轮正上方、居中；手机上整行宽）。
// props（所有工具面板都一样）：
//   ctl      controller；可能是 null。ctl.on('item', fn) → off：点中的家具 { id | null }
//   engine   Engine（itemAt / groundAt …）· project 最新的方案（project.furniture 变了会重画）
//   api      moveItem(id, {x, z}) · rotateItem(id) · removeItem(id) · flash(msg)（SPEC §6；没有 addItem）
//   wish · staff · room（你站的房间或 null）· fi（第几层）· mode（这里没用）
//   onClose  收起面板（回到「走」）
// 撤销在外壳（左上角）。散放的家具是「示意」，柜子、墙板、门、台面是「我们做」。
//
// 做法：点中哪一件由控制器说（'item'）；名字和鸟瞰的选中条一样（CATALOG 的名字 + 它那一面的材质），记号按 offer.js offerTagOf
//   （我们做 / 我们做 · 电视柜 / 保留你家原有 / 家具示意）。转 90° → api.rotateItem；移走 → api.removeItem（可以撤销）。
//   搬：按住选中的那件拖（控制器自己做，放手 → api.moveItem）；贴墙的（CATALOG wall：电视墙、主题墙、窗帘）不能挪也不能转。

import { useEffect, useState } from 'react';
import { t, L } from '../../shared/i18n.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { CATALOG } from '../engine/furniture.js';
import { offerTagOf } from '../offer.js';
import { FurnIcon, Icon } from '../ui/kit.jsx';
import './walk-tools.css';

/** 选中的家具给客人看的：{ name, mat（它那一面的材质名）, tag（offerTagOf）, wall（贴墙：不能挪、不能转） } */
export function itemFacts(item, project) {
  const def = CATALOG[item?.kind];
  if (!def) return null;
  const materials = project?.materials || {};
  const m = MAT_BY_ID[materials[def.slot]];
  return { name: L(def), mat: m ? L(m) : '', tag: offerTagOf(item.kind, { materials, locked: project?.locked || null }), wall: !!def.wall };
}

function Tag({ kind }) {
  if (kind === 'kept')
    return (
      <i className="st-offer-tag kept">
        <Icon name="lock" size={10} stroke={2.2} />
        {t('保留你家原有')}
      </i>
    );
  if (kind === 'make' || kind === 'console')
    return (
      <i className="st-offer-tag">
        <Icon name="make" size={10} stroke={2.2} />
        {kind === 'console' ? t('我们做 · 电视柜') : t('我们做')}
      </i>
    );
  if (kind === 'illu') return <i className="st-offer-tag illu">{t('家具示意')}</i>;
  return null;
}

/** 面板本身：item = 选中的那一件（方案里的一条）或 null */
export function ItemCard({ item, project, onRotate, onRemove, onClose }) {
  const f = item ? itemFacts(item, project) : null;
  return (
    <div className="walk-panel walk-furnish glass" role="group" aria-label={f ? f.name : t('家具')} data-walk-item={f ? item.id : undefined}>
      <div className="walk-panel-head">
        <span className="walk-panel-ico">
          <FurnIcon kind={f ? item.kind : 'sofa'} size={20} stroke={1.6} />
        </span>
        <span className="walk-panel-title">
          <b>
            {f ? f.name : t('家具')}
            {f && <Tag kind={f.tag} />}
          </b>
          {f?.mat && <em>{f.mat}</em>}
        </span>
        <button type="button" className="walk-panel-x" aria-label={t('关闭')} title={t('关闭')} data-sfx="close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      {f ? (
        <>
          <div className="walk-btns">
            {!f.wall && (
              <button type="button" className="walk-btn" data-walk-act="rotate" onClick={() => onRotate?.(item.id)}>
                <Icon name="rotate" size={18} />
                <span>{t('转 90°')}</span>
              </button>
            )}
            <button type="button" className="walk-btn is-danger" data-walk-act="remove" data-sfx="drop" onClick={() => onRemove?.(item.id)}>
              <Icon name="trash" size={18} />
              <span>{t('移走')}</span>
            </button>
          </div>
          <p className="walk-panel-hint">
            <Icon name={f.wall ? 'info' : 'hand'} size={16} />
            <span>{f.wall ? t('贴在墙上的，不能挪动') : t('按住它拖动，可以换个位置')}</span>
          </p>
        </>
      ) : (
        <p className="walk-panel-hint" role="status" aria-live="polite">
          <Icon name="pointer" size={16} />
          <span>{t('点一件家具选中它：可以挪、转、移走')}</span>
        </p>
      )}
    </div>
  );
}

export default function FurnishPanel({ ctl, project, api, onClose }) {
  const [sel, setSel] = useState(null);
  useEffect(() => ctl?.on?.('item', (e) => setSel((e && typeof e === 'object' ? e.id : e) || null)), [ctl]);
  const item = (sel && (project?.furniture || []).find((f) => f.id === sel)) || null;

  const remove = (id) => {
    const f = itemFacts(item, project);
    api?.removeItem?.(id);
    ctl?.select?.(null);
    if (f) api?.flash?.(t('{0} 已移走 —— 按撤销可以还原', [f.name]));
  };
  return <ItemCard item={item} project={project} onRotate={(id) => api?.rotateItem?.(id)} onRemove={remove} onClose={onClose} />;
}
