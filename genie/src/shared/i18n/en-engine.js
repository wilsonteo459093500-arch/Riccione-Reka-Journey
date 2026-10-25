// 英文词典 · 3D 引擎这一侧（底座、概念图角标、平面图读取的提示等）。中文原句就是 key。
export default {
  // 概念图角标（ui/stamp.js）
  概念示意: 'Concept only',
  // 平面图读取（plan/planImage.js）
  '这张图片读不出来：请换成 JPG / PNG 再试': 'This image can’t be read — please try a JPG or PNG instead',
  '这台设备读不了 PDF：请更新 iPadOS，或把平面图截图成 JPG / PNG 再上传': 'This device can’t read PDFs — update iPadOS, or upload a JPG / PNG screenshot of the plan instead',
  '只支持图片（JPG / PNG）或 PDF': 'Only images (JPG / PNG) or PDF are supported',
  // boards engine（溪岸板材：materials.js 的提示、library-api.js 的显示名、3D 板材贴图、诊断）
  '溪岸板材只用在定制柜、墙板和门上；活动家具是示意': 'sAil boards go on built-in cabinets, wall panels and doors only — loose furniture is illustrative',
  '织系列是柜门的面料，3D 里先用柜体的颜色示意': 'The woven series is a door-front finish — the 3D shows it in the cabinet colour for now',
  '{0}号 · {1}': 'No. {0} · {1}',
  '{0}号': 'No. {0}',
};
