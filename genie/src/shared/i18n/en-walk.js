// 走进去（src/studio/walk/**）用的英文：量尺的字（U2b），WalkMode / 小地图 / 摇杆 / 工具轮（U5a）。
// 不放进 en.js 的总表（那份是四个页面第一次载入就下载的共用块）：walk/words.js 载入时用 addWords() 并进来。
// 「走进去」「正在走进去…」「回到全屋」在 en-studio.js（按钮在懒加载之前就要显示）。
// 总表里已经有的词（地板、家具、灯光、拍照、工具、楼层、撤销…）不在这里重复。
export default {
  // ── 量尺（measure.js） ──
  '{0} 长 · {1} 高': '{0} long · {1} high',

  // ── 工具轮（ToolWheel.jsx） ──
  走: 'Walk',
  刷颜色: 'Paint',
  量尺: 'Measure',

  // ── 小地图（Minimap.jsx） ──
  小地图: 'Map',
  展开小地图: 'Open the map',
  收起小地图: 'Close the map',

  // ── 摇杆（Joystick.jsx） ──
  '按住拖动来走 · 键盘 W A S D': 'Hold and drag to walk · keys W A S D',
};
