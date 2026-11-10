// 3D 户型图的配色（纯数据，ES5 写法）。每种材质 = 顶面色 + 侧面色；地板另有木纹参数。

var PALETTES = {
  warm: {
    zh: '暖木',
    bg: '#EFE8DE',
    bgEdge: '#E4DACD',
    floor: { base: '#D8B88F', light: '#E4C9A4', dark: '#C6A277', gap: '#A88560', plankMm: [1100, 140] },
    threshold: { top: '#CDB79B' },
    wall: { top: '#F6F2EB', side: '#DDD5C8' },
    structure: { top: '#3B3632', side: '#2B2724' },
    panel: { top: '#8A6A50', side: '#6F5440' },
    cabinet: { top: '#70503B', side: '#5A3F2E' },
    worktop: { top: '#EFE9DF', side: '#D2C8BA' },
    glass: { top: '#C9D6D4', side: '#9FB3B1' },
    windowGlass: { top: '#BFD6DB', side: '#A9C7CE' },
    fabric: { top: '#8E7C6B', side: '#6E5F52' },
    neutral: { top: '#D9D0C3', side: '#BDB3A4' },
    ghost: { fill: '#70503B', stroke: '#4A3323' },
    shadow: '#2A1D12',
    shadowAlpha: 0.3,
  },
};

function paletteOf(id) {
  return PALETTES[id] || PALETTES.warm;
}

export { PALETTES, paletteOf };
