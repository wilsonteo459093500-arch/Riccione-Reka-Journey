// 走进去 · 临时的占位（U7 · app shell）：U5a 会整个换掉（SPEC §5 WalkMode）。
// 现在只画一个「回到全屋」（data-walk="exit"，脚本点它）→ onExit；不碰引擎。
// props = { engine, project, api, wish, staff, onExit }
import './words.js';
import { t } from '../../shared/i18n.js';
import { Icon } from '../ui/kit.jsx';

export default function WalkMode({ onExit }) {
  return (
    <button type="button" className="glass demo-exit" data-walk="exit" data-sfx="back" onClick={() => onExit?.()}>
      <Icon name="home" size={16} />
      {t('回到全屋')}
    </button>
  );
}
