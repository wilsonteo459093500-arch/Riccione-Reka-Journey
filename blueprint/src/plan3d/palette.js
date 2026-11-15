// 3D 户型图的配色（纯数据，ES5 写法）。每种材质 = 顶面色 + 侧面色；地板、地砖、木纹、石纹另有参数。

var PALETTES = {
  warm: {
    zh: '暖木',
    bg: '#F1EBE2',
    bgEdge: '#E3D9CB',
    // 人字拼橡木地板：plankMm = [长, 宽]
    floor: { base: '#D9BC94', light: '#E6CDA8', dark: '#C8A67A', gap: '#9C7B57', plankMm: [640, 125] },
    // 地砖（卫生间、阳台）：偏暖的浅石灰色，sizeMm = 一块砖的边长
    tile: { base: '#DFDBD2', light: '#E7E3DB', dark: '#D6D1C7', gap: '#B6AFA3', sizeMm: 600 },
    threshold: { top: '#C9AE8B' },
    wall: { top: '#4C4742', side: '#E9E3D8' },
    sill: { top: '#EFEAE1', side: '#DAD3C7' },
    structure: { top: '#45403B', side: '#34302C' },
    panel: { top: '#8B6A4F', side: '#73563F', grain: '#5E4532' },
    cabinet: { top: '#6C4C37', side: '#5C3F2D', grain: '#3F2A1C', inner: '#2F2119', edge: '#8A6549' },
    worktop: { top: '#F4F0E9', side: '#D8D0C3', vein: '#9A9690' },
    glass: { top: '#CFE0DE', side: '#A9C0BE', frame: '#5C3F2D', glow: '#FFE2B0' },
    windowGlass: { top: '#C7DDE2', side: '#B3D0D7', frame: '#EDEAE4' },
    fabric: { top: '#9A8776', side: '#74655A', back: '#6B5C51' },
    // 床品（枕头、床单）和洁具的陶瓷：都不贴图。sheet = 床单；bowl = 盆 / 缸的内壁，metal = 龙头，steel = 不锈钢水槽，hob = 灶的黑玻璃
    linen: { top: '#F1EBE0', side: '#D9CFC0', sheet: '#E3D9C9' },
    ceramic: { top: '#F5F2EC', side: '#DCD6CB', bowl: '#E4DFD6', metal: '#9B958C', steel: '#C9C5BE', hob: '#3A3632' },
    neutral: { top: '#DCD3C6', side: '#C0B6A7' },
    ghost: { fill: '#6C4C37', stroke: '#4A3323' },
    books: ['#8C4A3A', '#C9A66B', '#3F5A5C', '#D9CFC0', '#6B7A5A', '#A8623E', '#2F3A46', '#B9B0A2'],
    shadow: '#2A1D12',
    shadowAlpha: 0.3,
  },
};

/** 材质贴图的四个槽位：一张贴图在现实里大约多大（毫米），贴到哪些材质上 */
var TEXTURE_SLOTS = [
  { id: 'floor', zh: '地板木纹', mm: 1000 },
  { id: 'cabinet', zh: '柜体木饰面', mm: 1200 },
  { id: 'worktop', zh: '台面石材', mm: 1500 },
  { id: 'fabric', zh: '椅子面料', mm: 600 },
];

function paletteOf(id) {
  return PALETTES[id] || PALETTES.warm;
}

export { PALETTES, TEXTURE_SLOTS, paletteOf };
