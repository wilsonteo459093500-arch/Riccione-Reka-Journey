// 走进去 · 工具面板（刷颜色 / 家具 / 灯光 / 量尺 / 拍照，U5b）的英文。walk/words.js 载入时并进词典。
// 总表里已经有的词（我们做、保留你家原有、家具示意、移走、关闭、溪岸板材、材质类别、一天中的时间…）不在这里重复。
export default {
  // ── 刷颜色 / 地板（PaintTray.jsx） ──
  '整屋的{0}一起换': 'Changes all {0} in the home',
  点别处换别的: 'Tap elsewhere to change something else',
  '现在：{0}': 'Now: {0}',
  '这一处换不了颜色（玻璃、外墙…）。点墙、地板、柜子试试': "This part can't be changed (glass, outside walls…). Try a wall, the floor or a cabinet",
  '点一下想换的地方：墙、地板、柜子、台面、沙发都可以': 'Tap what you want to change: walls, floor, cabinets, worktop or sofa',

  // ── 家具（FurnishPanel.jsx） ──
  '转 90': 'Turn 90', // t('转 90°')：「°」不算在 key 里，原样留着
  '贴在墙上的，不能挪动': "It's fixed to the wall, so it can't be moved",
  '按住它拖动，可以换个位置': 'Press and drag it to move it',
  '点一件家具选中它：可以挪、转、移走': 'Tap a piece of furniture to move, turn or remove it',
  '{0} 已移走 —— 按撤销可以还原': '{0} removed. Tap Undo to bring it back',

  // ── 灯光（LightPanel.jsx） ──
  '晚上 · 屋里的灯都亮着': 'Night · the lights are on',
  '白天 / 晚上': 'Day / night',
  白天: 'Day',
  晚上: 'Night',

  // ── 量尺（MeasureLayer.jsx） ──
  '点两下量距离 · 点墙看长和高': 'Tap twice to measure · tap a wall for its size',
  '再点一下，重新量': 'Tap again to measure again',
  '墙长 {0}': 'Wall length {0}',
  '墙高 {0}': 'Wall height {0}',
  '墙 {0} × {1} mm（长 × 高）': 'Wall {0} × {1} mm (length × height)',
  '再点一下另一点，量两点的距离': 'Tap a second point to measure the distance',
  再点一下另一点: 'Tap a second point',
  清掉: 'Clear',

  // ── 拍照 = 收藏这个角度（PhotoPanel.jsx） ──
  收藏的角度: 'Saved views',
  '角度 {0}': 'View {0}',
  '最多收藏 {0} 个角度：最早的那个换掉了': 'Up to {0} saved views: the oldest one was replaced',
  '回不到这个角度了（平面图可能改过）': "Can't go back to this view (the floor plan may have changed)",
  点一个就回到那里: 'Tap one to go back there',
  '只记站在哪、朝哪看，之后可以跳回来': 'Saves where you stand and look, so you can jump back later',
  收藏这个角度: 'Save this view',
  下载这张: 'Download this image',
  删掉这个角度: 'Delete this view',
};
