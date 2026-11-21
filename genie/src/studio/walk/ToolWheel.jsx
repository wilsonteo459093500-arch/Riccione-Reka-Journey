// 走进去 · 工具轮（SPEC §5）：走 / 刷颜色 / 地板 / 家具 / 灯光 / 量尺 / 拍照，一排图标 + 字（每一个 ≥ 44px）。
//   点一个 → onPick(id)；再点一次正在用的（「走」以外）→ 回到「走」（面板收起）。
//   正在用的那一个：纸色底 + 金褐色的字（和楼层开关一样），金色块只留给真正的重点。
//   图标都是工作室第一块里已经有的（kit.jsx 的 Icon / FurnIcon），不多下载。

import { t } from '../../shared/i18n.js';
import { Icon, FurnIcon } from '../ui/kit.jsx';

/** 工具：id = controller.setTool 的 id；label 是中文 key（画的时候才 t()）；icon = kit.jsx ICONS 的名字，furn = 家具图标 */
export const WALK_TOOLS = [
  { id: 'walk', label: '走', icon: 'walk' },
  { id: 'paint', label: '刷颜色', icon: 'palette' },
  { id: 'floor', label: '地板', icon: 'start' }, // 一格一格的：地板 / 地砖
  { id: 'furnish', label: '家具', furn: 'sofa' },
  { id: 'light', label: '灯光', icon: 'lamp' },
  { id: 'measure', label: '量尺', icon: 'ruler' },
  { id: 'photo', label: '拍照', icon: 'snapshot' },
];
export const TOOL_IDS = WALK_TOOLS.map((x) => x.id);

/** 点了 id：再点一次正在用的工具 = 收起来回到「走」 */
export const nextTool = (cur, id) => (id === cur && id !== 'walk' ? 'walk' : TOOL_IDS.includes(id) ? id : 'walk');

export default function ToolWheel({ tool = 'walk', onPick, className = '' }) {
  return (
    <div className={className ? `walk-tools glass ${className}` : 'walk-tools glass'} role="toolbar" aria-label={t('工具')}>
      {WALK_TOOLS.map((x) => {
        const on = x.id === tool;
        return (
          <button key={x.id} type="button" className={on ? 'walk-tool on' : 'walk-tool'} data-walk-tool={x.id} aria-pressed={on} onClick={() => onPick?.(nextTool(tool, x.id))}>
            {x.furn ? <FurnIcon kind={x.furn} size={21} stroke={1.75} /> : <Icon name={x.icon} size={21} />}
            <span>{t(x.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
