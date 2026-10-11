// 右上角工具条

import { IconBtn } from './kit.jsx';

const WALL_LABEL = { cut: '墙：切开朝向镜头的外墙', down: '墙：全部放低', up: '墙：全部立起' };
const VIEW_LABEL = { iso: '视角：右前方', iso2: '视角：左前方', top: '视角：俯视平面', low: '视角：低角度', back: '视角：背面' };

export default function Toolbar(p) {
  return (
    <div className="toolbar">
      <div className="tb-group">
        <IconBtn icon="undo" label="撤销 (Ctrl+Z)" onClick={p.onUndo} disabled={!p.canUndo} />
        <IconBtn icon="redo" label="重做" onClick={p.onRedo} disabled={!p.canRedo} />
      </div>
      <div className="tb-group">
        <IconBtn icon="download" label="下载概念图" onClick={p.onShot} />
        <IconBtn icon="link" label="分享链接" onClick={p.onShare} />
        <IconBtn icon={p.labels ? 'eye' : 'eyeOff'} label={p.labels ? '隐藏材质标签' : '显示材质标签'} onClick={p.onLabels} active={p.labels} />
        <IconBtn icon="camera" label={VIEW_LABEL[p.view]} onClick={p.onView} />
        <IconBtn icon="walls" label={WALL_LABEL[p.wallMode]} onClick={p.onWalls} active={p.wallMode !== 'cut'} />
        <IconBtn icon={p.demo ? 'pause' : 'play'} label="演示模式：自动环绕 + 24 小时光影（展厅大屏 / 宣传用）" onClick={p.onDemo} active={p.demo} />
      </div>
      <div className="tb-group">
        <IconBtn icon="pencil" label="平面图：上传 / 修改" onClick={p.onPlan} />
        {!p.wish && <IconBtn icon="home" label="新方案 / 打开方案" onClick={p.onStart} />}
        {!p.wish && <IconBtn icon="gear" label="设置" onClick={p.onSettings} />}
        <IconBtn icon="help" label="怎么用" onClick={p.onHelp} />
      </div>
    </div>
  );
}
