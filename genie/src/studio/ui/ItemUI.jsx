// 家具的悬停提示 + 选中后的小工具条

import { CATALOG } from '../engine/furniture.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { Icon } from './kit.jsx';

export function HoverTip({ hover, materials }) {
  const def = CATALOG[hover.item?.kind];
  if (!def) return null;
  const m = MAT_BY_ID[materials[def.slot]];
  return (
    <div className="hovertip" style={{ left: hover.x + 16, top: hover.y - 10 }}>
      <b>
        {def.zh} · {m?.zh}
      </b>
      <span>{def.wall ? '点一下选中' : '拖动移动 · 点一下旋转或移走'}</span>
    </div>
  );
}

export function SelectionBar({ item, pos, materials, onRotate, onRemove, onDuplicate, onVariant, onClose }) {
  const def = CATALOG[item.kind];
  const m = MAT_BY_ID[materials[def?.slot]];
  return (
    <div className="selbar" style={{ left: pos.x, top: Math.max(70, pos.y) }}>
      <div className="selbar-name">
        <b>{def?.zh}</b>
        <span>{m?.zh}</span>
      </div>
      {!def?.wall && (
        <button type="button" onClick={onRotate} title="旋转 90° (R)">
          <Icon name="rotate" size={16} />
          <span>旋转</span>
        </button>
      )}
      {onVariant && (
        <button type="button" onClick={onVariant} title="换一款">
          <Icon name="swap" size={16} />
          <span>换款</span>
        </button>
      )}
      <button type="button" onClick={onDuplicate} title="复制">
        <Icon name="copy" size={16} />
        <span>复制</span>
      </button>
      <button type="button" className="danger" onClick={onRemove} title="移走 (Delete)">
        <Icon name="trash" size={16} />
        <span>移走</span>
      </button>
      <button type="button" className="x" onClick={onClose} aria-label="取消选中">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
