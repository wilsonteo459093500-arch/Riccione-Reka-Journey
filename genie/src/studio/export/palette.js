// 内容色：导出给设计师的 3D 文件（DAE / OBJ）里的固定材质（不是「表面」，不参与换材质）。
// 和 3D 工作室 engine/matlib.js 的 buildFixed 同一组颜色（test/export.test.mjs 会对一遍）；
// 楼板 slab 是导出自己用的浅中性色（3D 工作室里楼板是墨色切口，导出给设计师要浅一点好看清）。
// 名字（中文）在文件里写成「fixed__glass 玻璃」，英文从词典来。

export const FIXED = {
  exterior: { zh: '外墙', hex: '#E8E2D8' },
  glass: { zh: '玻璃', hex: '#DBE8EE', opacity: 0.3 },
  frame: { zh: '窗框', hex: '#2A2A2C' },
  rail: { zh: '栏杆', hex: '#2A2A2C' },
  black: { zh: '踢脚', hex: '#1A1A1A' },
  steel: { zh: '不锈钢', hex: '#C4C4C2' },
  chrome: { zh: '镀铬', hex: '#E4E5E6' },
  porcelain: { zh: '陶瓷', hex: '#F6F4F0' },
  mattress: { zh: '床垫', hex: '#F3EFE8' },
  tv: { zh: '电视', hex: '#0B0B0D' },
  mirror: { zh: '镜子', hex: '#EEF2F4' },
  leaf: { zh: '植物', hex: '#5C7A50' },
  pot: { zh: '花盆', hex: '#C9B79D' },
  lampshade: { zh: '灯罩', hex: '#F3E6CF' },
  slab: { zh: '楼板', hex: '#EDE7DC', own: true },
};

/** 万一材质找不到颜色时用的中性灰（不该出现；出现了设计师一眼看得出是没指定的） */
export const FALLBACK_HEX = '#CCCCCC';

/** matlib 里对应的名字（lampShade 的大小写不一样；slab 是导出自己的） */
export const MATLIB_NAME = { lampshade: 'lampShade' };
