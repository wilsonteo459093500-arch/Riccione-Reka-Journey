// 一键搭配用的 6 块溪岸板材 —— 资料，不是界面文字（产品名字照手册原样显示，不进中英词典；test/i18n.test.mjs 的 GENERATED 名单里）。
// 名字、编号、颜色照《SAIL 产品标准设计手册》的整理稿（src/shared/boards/catalog-seed.json）；test/cabinet.test.mjs 逐项比，手册改了这里跟着红。

/** 手册里的 6 块（key = catalog-seed.json 的 key） */
export const SEED = {
  'pb-AK096': { code: 'AK096AL', codes: ['AK096AL'], name: '归山云', series: '颗粒板', kind: 'solid', grain: null, finish: 'matte', proc: null, hex: '#FCFBF7' },
  'pb-AG275': { code: 'AG275A', codes: ['AG275A', 'AG275B', 'AG275D'], name: '归雁胡桃', series: '颗粒板', kind: 'wood', grain: 'straight', finish: 'matte', proc: 'walnut', hex: '#483828' },
  'pb-AG294': { code: 'AG294A', codes: ['AG294A', 'AG294B', 'AG294D'], name: '晓山白', series: '颗粒板', kind: 'solid', grain: null, finish: 'matte', proc: null, hex: '#FCFBF9' },
  'pb-AG150': { code: 'AG150A', codes: ['AG150A', 'AG150B', 'AG150D'], name: '绿山墙', series: '颗粒板', kind: 'solid', grain: null, finish: 'matte', proc: null, hex: '#64674A' },
  'vn-XA-TP-03': { code: 'XA-TP-03', codes: ['XA-TP-03'], name: '白橡直纹', series: '木皮', kind: 'wood', grain: 'straight', finish: 'matte', proc: 'oak', hex: '#938774' },
  'pb-AK141': { code: 'AK141A', codes: ['AK141A'], name: '黑松橡', series: '颗粒板', kind: 'wood', grain: null, finish: 'matte', proc: 'oak', hex: '#30302F' },
};

