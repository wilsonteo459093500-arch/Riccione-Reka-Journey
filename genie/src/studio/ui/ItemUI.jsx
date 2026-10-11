// 家具的悬停提示 + 选中后的小工具条（纸色玻璃胶囊，按钮 44px）

import { CATALOG } from '../engine/furniture.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { t, L } from '../../shared/i18n.js';
import { FurnIcon, Icon } from './kit.jsx';

export function HoverTip({ hover, materials }) {
  const def = CATALOG[hover.item?.kind];
  if (!def) return null;
  const m = MAT_BY_ID[materials[def.slot]];
  const x = Math.min(hover.x + 16, innerWidth - 240);
  return (
    <div className="glass hovertip" style={{ left: x, top: hover.y - 10 }}>
      <span className="hovertip-ico">
        <FurnIcon kind={hover.item.kind} size={18} stroke={1.6} />
      </span>
      <span>
        <b>
          {L(def)}
          {m && <i> · {L(m)}</i>}
        </b>
        <em>{def.wall ? t('点一下选中') : t('拖动移动 · 点一下旋转或移走')}</em>
      </span>
    </div>
  );
}

export function SelectionBar({ item, pos, materials, onRotate, onRemove, onDuplicate, onVariant, onClose }) {
  const def = CATALOG[item.kind];
  const m = MAT_BY_ID[materials[def?.slot]];
  const w = 360;
  const left = Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, pos.x));
  return (
    <div className="glass selbar" style={{ left, top: Math.max(132, pos.y) }} role="toolbar" aria-label={L(def)}>
      <div className="selbar-name">
        <FurnIcon kind={item.kind} size={18} stroke={1.6} />
        <span>
          <b>{L(def)}</b>
          {m && <em>{L(m)}</em>}
        </span>
      </div>
      <span className="selbar-sep" />
      {!def?.wall && (
        <button type="button" onClick={onRotate} title={t('旋转 90° (R)')}>
          <Icon name="rotate" size={18} />
          <span>{t('旋转')}</span>
        </button>
      )}
      {onVariant && (
        <button type="button" onClick={onVariant} title={t('换一款')}>
          <Icon name="swap" size={18} />
          <span>{t('换款')}</span>
        </button>
      )}
      <button type="button" onClick={onDuplicate} title={t('复制')}>
        <Icon name="copy" size={18} />
        <span>{t('复制')}</span>
      </button>
      <button type="button" className="danger" onClick={onRemove} title={t('移走 (Delete)')}>
        <Icon name="trash" size={18} />
        <span>{t('移走')}</span>
      </button>
      <button type="button" className="x" onClick={onClose} aria-label={t('取消选中')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
