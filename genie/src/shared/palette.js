// JS 这一侧要用的品牌色（canvas 海报、3D 底座、概念图角标、潘吉 SVG）——和 base.css 的 :root 同一套。
// CSS 变量在 canvas / three.js 里读不到，所以在这里再写一份；改 VI 时两边一起改。
// VI「晨光溪岸 Morning Stream」：石灰纸、湿石头、溪水；仪式时刻用暮色。

export const PALETTE = {
  paper: '#F3EEE4',
  paperDeep: '#E7E0D2',
  card: '#FFFDF8',
  ink: '#24211D',
  inkSoft: '#6E675B',
  line: '#DBD2C1',
  gold: '#C08A3E',
  goldL: '#E9D29A',
  goldInk: '#7A5A2E',
  amber: '#E1913F',
  accent: '#4A6652',
  stream: '#7FA39C',
  seal: '#B8373F',
  dusk: '#1E2621',
  duskText: '#F1ECE2',
  duskGold: '#D2A75E',
  firefly: '#E9D29A',
  shade: '#24211D',

  // 分享海报（1080×1350）
  posterBg: ['#F3EEE4', '#E7E0D2'],
  posterInk: '#24211D',
  posterGold: '#7A5A2E',

  // 概念图角标
  stampTitle: '#E9D29A',
  stampBg: 'rgba(18,16,12,0.55)',

  // 3D 底座、地面金线
  plinth: '#1D1D18',
  ring: '#C08A3E',

  // 潘吉：苔绿丝绒头巾（像折起来的叶子）、晨露水晶球、晨雾
  pangie: {
    turban: ['#4A6652', '#2F4237'],
    pinstripe: '#E9E2D2',
    band: '#C08A3E',
    gem: '#E1913F',
    ball: ['#FFFFFF', '#E3EFE9', '#A9C8BE', '#5E8C80'],
    halo: '#F6E7C1',
    smoke: ['#FFFDF8', '#E6ECE6'],
    dots: '#E9D29A',
    iris: '#3A2A22',
    leaf: '#C08A3E',
  },
};

export default PALETTE;
