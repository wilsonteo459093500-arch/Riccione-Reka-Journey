// 右上角工具条（像 Freeform / Keynote 的浮动工具条）：撤销 · 视角 · 墙 · 标签 · 对照 · 概念图 · 分享 · 平面图 · 方案 · 更多。
// 窄屏把次要的按钮收进「更多」菜单（CSS 决定哪些留在条上），菜单里还有演示模式、帮助、设置、中 / EN。
// 「新方案 / 打开方案」只给设计师（onStart 为空 = 客人版、许愿模式：不出现，展厅 iPad 上别的客人的方案打不开）。
// 「设置」也只给设计师（onSettings 为空 = 客人版、许愿模式：里面是公司的 AI key）；「语言」那一行客人版照样有。
// 「导出给设计师」（DXF / 酷家乐 / SketchUp）也只给设计师（onExport 为空 = 客人版、许愿模式、展厅：不出现）。
// 「下载概念图」许愿模式没有（onShot 为空）：图会存进展厅 iPad 的相册；平面图在许愿模式只能画、不能上传。
// 「材质标签」开关只在标签真的画得出来的画布上出现（Callouts：≥ 600 × 560；手机上从来不画）。

import { useEffect, useRef, useState } from 'react';
import { Icon, IconBtn, useMedia } from './kit.jsx';
import LangToggle from '../../shared/LangToggle.jsx';
import { t } from '../../shared/i18n.js';

const WALL_LABEL = { cut: '墙：切开朝向镜头的外墙', down: '墙：全部放低', up: '墙：全部立起' };
const VIEW_LABEL = { iso: '视角：右前方', iso2: '视角：左前方', top: '视角：俯视平面', low: '视角：低角度', back: '视角：背面' };

function MenuItem({ icon, label, hint, onClick, active, className = '', ...rest }) {
  return (
    <button type="button" role="menuitem" className={`menu-item ${active ? 'on' : ''} ${className}`} onClick={onClick} {...rest}>
      <Icon name={icon} size={18} />
      <span>
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {active && <Icon name="check" size={16} className="menu-check" />}
    </button>
  );
}

export default function Toolbar(p) {
  const [menu, setMenu] = useState(false);
  const wrap = useRef(null);
  const canLabel = useMedia('(min-width: 600px) and (min-height: 560px)');
  useEffect(() => {
    if (!menu) return;
    const close = (e) => !wrap.current?.contains(e.target) && setMenu(false);
    const esc = (e) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);
  const run = (fn) => () => {
    setMenu(false);
    fn?.();
  };
  const planLabel = p.wish ? t('平面图：画 / 修改') : t('平面图：上传 / 修改');

  return (
    <div className="toolbar" ref={wrap}>
      <div className="tb-group glass">
        <IconBtn icon="undo" label={t('撤销 (Ctrl+Z)')} onClick={p.onUndo} disabled={!p.canUndo} />
        <IconBtn icon="redo" label={t('重做')} onClick={p.onRedo} disabled={!p.canRedo} />
      </div>
      <div className="tb-group glass tb-hide-sm">
        <IconBtn icon="view" label={t(VIEW_LABEL[p.view])} onClick={p.onView} />
        <IconBtn icon="walls" label={t(WALL_LABEL[p.wallMode])} onClick={p.onWalls} active={p.wallMode !== 'cut'} pressed={p.wallMode !== 'cut'} />
        {canLabel && <IconBtn icon="labels" label={p.labels ? t('隐藏材质标签') : t('显示材质标签')} onClick={p.onLabels} active={p.labels} pressed={p.labels} />}
      </div>
      {(p.onCompare || p.onShot || p.onShare) && (
        <div className="tb-group glass">
          {/* 对照：案例照片 vs 你的家（选过参考案例、案例有照片时才有；手机上用左上角的「我的家 | 案例照片」） */}
          {p.onCompare && <IconBtn icon="compare" label={t('对照案例照片')} text={t('对照')} onClick={p.onCompare} active={p.compareOn} pressed={p.compareOn} className="tb-cmp" />}
          {p.onShot && <IconBtn icon="snapshot" label={t('下载概念图')} onClick={p.onShot} className="tb-hide-sm" />}
          {/* 许愿模式（展厅 iPad）没有：复制链接、wa.me 都会离开展厅的 iPad —— 客人的家由最后一步「交给设计师」、员工的名单发出去 */}
          {p.onShare && <IconBtn icon="share" label={t('分享链接')} onClick={p.onShare} />}
        </div>
      )}
      <div className="tb-group glass">
        <IconBtn icon="plan" label={planLabel} text={t('平面图')} onClick={p.onPlan} className="tb-plan tb-hide-sm" />
        {p.onStart && <IconBtn icon="start" label={t('新方案 / 打开方案')} onClick={p.onStart} className="tb-hide-md" />}
        <IconBtn icon="more" label={t('更多')} onClick={() => setMenu((m) => !m)} active={menu} pressed={menu} />
      </div>

      {menu && (
        <div className="menu glass" role="menu">
          <div className="menu-sec mi-sm">
            <MenuItem icon="view" label={t(VIEW_LABEL[p.view])} onClick={p.onView} />
            <MenuItem icon="walls" label={t(WALL_LABEL[p.wallMode])} onClick={p.onWalls} />
            {canLabel && <MenuItem icon="labels" label={t('材质标签')} active={p.labels} onClick={p.onLabels} />}
            {p.onShot && <MenuItem icon="snapshot" label={t('下载概念图')} onClick={run(p.onShot)} />}
            <MenuItem icon="plan" label={planLabel} onClick={run(p.onPlan)} />
          </div>
          {p.onStart && (
            <div className="menu-sec mi-md">
              <MenuItem icon="start" label={t('新方案 / 打开方案')} onClick={run(p.onStart)} />
            </div>
          )}
          <div className="menu-sec">
            <MenuItem icon="showroom" label={t('演示模式')} hint={t('自动环绕 + 24 小时光影')} active={p.demo} onClick={run(p.onDemo)} />
            {p.onExport && <MenuItem icon="download" label={t('导出给设计师')} hint={t('AutoCAD · SketchUp · 酷家乐')} onClick={run(p.onExport)} data-export="" />}
            <MenuItem icon="help" label={t('怎么用')} onClick={run(p.onHelp)} />
            {p.onSettings && <MenuItem icon="gear" label={t('设置')} onClick={run(p.onSettings)} />}
          </div>
          {!p.wish && (
            <div className="menu-sec menu-lang">
              <span>
                <Icon name="lang" size={18} />
                {t('语言')}
              </span>
              <LangToggle compact onPick={p.onLang} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
