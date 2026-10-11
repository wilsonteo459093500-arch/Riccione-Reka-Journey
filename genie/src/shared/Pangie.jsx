// 潘吉 Pangie —— 熊猫 × 神灯精灵。原创形象，纯 SVG，可缩放、可换表情。VI「晨光溪岸」：
// 苔绿丝绒头巾（像一片折起来的叶子，两道亚麻细条纹）+ 金边 + 琥珀宝石；捧着一颗晨露（里面映着一片小叶子，
// 外面一圈淡淡的晨光）；下半身是一缕晨雾；身边三颗露珠 / 萤火小光点；胸前一枚小小的金色银杏叶。
// 颜色全部来自 palette.js（PALETTE.pangie）；暮色画面（.dusk）里会多一圈暖光（.pg-aura）。
//
// <Pangie mood="idle|happy|wow|think|wink|mystic|sleepy" prop="ball|cards|magnifier|none" size={160} />
//   ball = 晨露（旧名沿用，接口不变）；aura = 强制显示暖光圈（不在 .dusk 里也亮）

import { useId } from 'react';
import { PALETTE } from './palette.js';
import { guideName } from './i18n.js';

const PG = PALETTE.pangie;
const INK = PALETTE.ink;
const FUR = PALETTE.card;
const GOLD = PG.band;
const GOLD_L = PALETTE.goldL;
const GOLD_D = PALETTE.goldInk;
// 角色自己的颜色（腮红、舌头、肉垫、镜片…）：属于形象本身，不随 VI 换
const CHAR = {
  blush: '#F2A49B',
  tongue: '#EE8F8F',
  pad: '#4A473F',
  innerEar: '#45423A',
  furShade: '#ECE6DA',
  belly: '#F1ECE2',
  lens: '#EEF4EE',
  handle: '#6B4B2F',
  leafVein: '#DCE8D9',
};

function Eyes({ mood, id }) {
  // 眼罩（黑色泪滴，向外下垂）
  const patches = (
    <>
      <ellipse cx="76" cy="99" rx="17" ry="21.5" fill={INK} transform="rotate(32 76 99)" />
      <ellipse cx="124" cy="99" rx="17" ry="21.5" fill={INK} transform="rotate(-32 124 99)" />
    </>
  );
  const open = (cx, cy, look = [0, 0], big = false) => (
    <g className="pg-blink" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <circle cx={cx} cy={cy} r={big ? 10 : 8.6} fill="#fff" />
      <circle cx={cx + look[0]} cy={cy + look[1]} r={big ? 8.4 : 7.1} fill={`url(#${id}-iris)`} />
      <circle cx={cx + look[0] + 2.4} cy={cy + look[1] - 2.6} r={big ? 3.4 : 2.8} fill="#fff" />
      <circle cx={cx + look[0] - 2.4} cy={cy + look[1] + 2.6} r={1.3} fill="#fff" opacity=".9" />
    </g>
  );
  const arcUp = (cx, cy) => <path d={`M${cx - 8} ${cy + 2} Q${cx} ${cy - 8} ${cx + 8} ${cy + 2}`} stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" />;
  const arcDown = (cx, cy) => <path d={`M${cx - 7.5} ${cy - 2} Q${cx} ${cy + 5} ${cx + 7.5} ${cy - 2}`} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />;

  let eyes;
  if (mood === 'happy') eyes = [arcUp(78, 99), arcUp(122, 99)];
  else if (mood === 'wink') eyes = [open(78, 98, [1, 0]), arcUp(122, 99)];
  else if (mood === 'mystic' || mood === 'sleepy') eyes = [arcDown(78, 99), arcDown(122, 99)];
  else if (mood === 'wow') eyes = [open(78, 97, [0, 0], true), open(122, 97, [0, 0], true)];
  else if (mood === 'think') eyes = [open(78, 97, [2.2, -2.4]), open(122, 97, [2.2, -2.4])];
  else eyes = [open(78, 98, [0.6, 0.4]), open(122, 98, [-0.6, 0.4])];
  return (
    <g>
      {patches}
      {eyes.map((e, i) => (
        <g key={i}>{e}</g>
      ))}
    </g>
  );
}

function Mouth({ mood }) {
  if (mood === 'wow')
    return (
      <g>
        <ellipse cx="100" cy="125" rx="4.6" ry="5.6" fill={PG.iris} />
        <ellipse cx="100" cy="127.6" rx="2.8" ry="2" fill={CHAR.tongue} />
      </g>
    );
  if (mood === 'happy')
    return (
      <g>
        <path d="M90.5 120.5 Q100 133 109.5 120.5 Z" fill={PG.iris} />
        <ellipse cx="100" cy="126.6" rx="4" ry="2.4" fill={CHAR.tongue} />
      </g>
    );
  if (mood === 'think') return <path d="M95 123 Q101 120.5 106 123.5" stroke={INK} strokeWidth="2.1" fill="none" strokeLinecap="round" />;
  return <path d="M92.5 121 Q96.3 125.6 100 121.4 Q103.7 125.6 107.5 121" stroke={INK} strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
}

/** 晨露：躺在一片小叶子上的一颗露珠，里面映着一片小叶子，外面一圈淡淡的晨光 */
function Dewdrop({ id }) {
  return (
    <g className="pg-ball">
      <circle cx="100" cy="181" r="31" fill={`url(#${id}-halo)`} className="pg-halo" />
      {/* 托着露珠的叶子 */}
      <path d="M74 201 C 86 190 114 189 128 198 C 116 208 88 210 74 201 Z" fill={`url(#${id}-leaf)`} />
      <path d="M78 200.5 C 92 198 108 197 124 198.5" stroke={CHAR.leafVein} strokeWidth=".9" fill="none" opacity=".75" />
      {/* 露珠 */}
      <path d="M100 157 C 104 166 119 174 119 186.5 C 119 197.5 110.5 204 100 204 C 89.5 204 81 197.5 81 186.5 C 81 174 96 166 100 157 Z" fill={`url(#${id}-drop)`} />
      {/* 露珠里倒映的小叶子 */}
      <path d="M92 194 C 97 188 106 187.5 110 190.5 C 105 196 97 197 92 194 Z" fill={PG.ball[3]} opacity=".42" />
      <path d="M93.5 193.6 C 99 191.5 104 190.6 109 190.8" stroke="#fff" strokeWidth=".7" fill="none" opacity=".5" />
      {/* 高光与折射边 */}
      <path d="M88.5 178 C 90 171 95 166 99 162" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".75" />
      <ellipse cx="93" cy="181" rx="4.2" ry="2.8" fill="#fff" opacity=".8" transform="rotate(-38 93 181)" />
      <circle cx="109" cy="197" r="1.4" fill="#fff" opacity=".7" />
    </g>
  );
}

/** 两张梦想家卡牌：一张背面（苔绿 + 金线），一张正面（纸 + 金） */
function Cards() {
  return (
    <g>
      <g transform="rotate(-14 92 186)">
        <rect x="80" y="166" width="22" height="34" rx="3" fill={PALETTE.accent} stroke={GOLD} strokeWidth="1.2" />
        <rect x="83" y="169" width="16" height="28" rx="1.6" fill="none" stroke={GOLD_L} strokeWidth=".6" opacity=".8" />
        <path d="M91 189 C 86 186 86 180 88 177 C 89 179 90 180 91 182 C 92 180 93 179 94 177 C 96 180 96 186 91 189 Z" fill={GOLD} opacity=".9" />
      </g>
      <g transform="rotate(10 108 186)">
        <rect x="98" y="164" width="22" height="34" rx="3" fill={FUR} stroke={GOLD} strokeWidth="1.2" />
        <rect x="101" y="167" width="16" height="28" rx="1.6" fill="none" stroke={GOLD} strokeWidth=".6" opacity=".7" />
        <circle cx="109" cy="180" r="5" fill="none" stroke={GOLD} strokeWidth="1" />
        <path d="M109 176.5 v7 M105.5 180 h7" stroke={GOLD} strokeWidth=".8" />
      </g>
    </g>
  );
}

function Magnifier() {
  return (
    <g>
      <line x1="112" y1="194" x2="124" y2="210" stroke={CHAR.handle} strokeWidth="5" strokeLinecap="round" />
      <circle cx="104" cy="182" r="14" fill={CHAR.lens} fillOpacity=".6" stroke={GOLD} strokeWidth="3.5" />
      <ellipse cx="99" cy="177" rx="4" ry="2.4" fill="#fff" opacity=".8" transform="rotate(-30 99 177)" />
    </g>
  );
}

export default function Pangie({ mood = 'idle', prop = 'ball', size = 160, float = true, className = '', title, aura = false }) {
  const raw = useId().replace(/:/g, '');
  const id = `pg${raw}`;
  return (
    <svg
      viewBox="0 0 200 250"
      width={size}
      height={(size * 250) / 200}
      className={`pangie ${float ? 'pg-float' : ''} ${className}`}
      role="img"
      aria-label={title || guideName()}
    >
      <defs>
        <radialGradient id={`${id}-iris`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#7A5642" />
          <stop offset=".55" stopColor={PG.iris} />
          <stop offset="1" stopColor="#1E1510" />
        </radialGradient>
        <radialGradient id={`${id}-drop`} cx="38%" cy="40%" r="72%">
          <stop offset="0" stopColor={PG.ball[0]} />
          <stop offset=".35" stopColor={PG.ball[1]} />
          <stop offset=".78" stopColor={PG.ball[2]} />
          <stop offset="1" stopColor={PG.ball[3]} />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset=".45" stopColor={PG.halo} stopOpacity=".85" />
          <stop offset="1" stopColor={PG.halo} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-aura`} cx="50%" cy="46%" r="50%">
          <stop offset="0" stopColor={PALETTE.firefly} stopOpacity=".42" />
          <stop offset=".55" stopColor={PALETTE.firefly} stopOpacity=".14" />
          <stop offset="1" stopColor={PALETTE.firefly} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-dot`}>
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset=".35" stopColor={PG.dots} stopOpacity=".95" />
          <stop offset="1" stopColor={PG.dots} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={GOLD_L} />
          <stop offset=".5" stopColor={GOLD} />
          <stop offset="1" stopColor={GOLD_D} />
        </linearGradient>
        <linearGradient id={`${id}-turban`} x1=".2" y1="0" x2=".7" y2="1">
          <stop offset="0" stopColor={PG.turban[0]} />
          <stop offset="1" stopColor={PG.turban[1]} />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={PALETTE.stream} />
          <stop offset="1" stopColor={PALETTE.accent} />
        </linearGradient>
        <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={PG.smoke[0]} />
          <stop offset=".5" stopColor={PG.smoke[1]} stopOpacity=".85" />
          <stop offset="1" stopColor={PG.smoke[1]} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-belly`} cx="45%" cy="35%" r="70%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor={CHAR.belly} />
        </radialGradient>
        <radialGradient id={`${id}-head`} cx="42%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".8" stopColor={FUR} />
          <stop offset="1" stopColor={CHAR.furShade} />
        </radialGradient>
      </defs>

      {/* 暮色里的暖光圈（.dusk 里自动亮） */}
      {/* 属性 opacity 的优先级最低：.dusk .pg-aura { opacity: 1 } 一写就亮；没有样式的页面默认不亮 */}
      <circle cx="100" cy="122" r="99" fill={`url(#${id}-aura)`} className="pg-aura" opacity={aura ? 1 : 0} />

      {/* 晨雾 —— 精灵的下半身 */}
      <g className="pg-smoke">
        <path
          d="M64 178 C 58 214, 92 226, 112 224 C 134 222, 142 236, 128 244 C 118 249, 106 243, 114 237 C 120 233, 124 236, 122 240 C 128 232, 116 228, 104 231 C 80 236, 56 222, 64 178 Z"
          fill={`url(#${id}-mist)`}
        />
        <path d="M70 206 C 84 218 104 220 120 214" stroke={PG.smoke[0]} strokeWidth="3" strokeLinecap="round" fill="none" opacity=".55" />
        <circle cx="140" cy="232" r="3.4" fill={PG.smoke[1]} opacity=".75" className="pg-puff" />
        <circle cx="150" cy="222" r="2.3" fill={PG.smoke[1]} opacity=".6" className="pg-puff pg-d2" />
      </g>

      {/* 身体 */}
      <ellipse cx="100" cy="172" rx="43" ry="37" fill={`url(#${id}-belly)`} />
      {/* 肩带（熊猫的黑色肩膀）*/}
      <path d="M57 160 C 60 140, 78 136, 100 137 C 122 136, 140 140, 143 160 C 136 152, 122 149, 100 150 C 78 149, 64 152, 57 160 Z" fill={INK} />
      {/* 手臂 */}
      <path d="M60 156 C 52 170, 62 190, 80 190 C 88 190, 90 180, 84 174 C 76 168, 72 160, 70 152 Z" fill={INK} />
      <path d="M140 156 C 148 170, 138 190, 120 190 C 112 190, 110 180, 116 174 C 124 168, 128 160, 130 152 Z" fill={INK} />

      {/* 银杏叶吊坠 */}
      <path d="M80 142 Q100 155 120 142" stroke={GOLD} strokeWidth="1.1" fill="none" />
      <path d="M100 151.6 V 155.6" stroke={GOLD} strokeWidth="1.1" />
      <path d="M100 166 C 93 166 89.5 160.5 90.5 155.6 C 94 157.4 97 157 100 155.2 C 103 157 106 157.4 109.5 155.6 C 110.5 160.5 107 166 100 166 Z" fill={`url(#${id}-gold)`} />
      <path d="M100 157 V 165.4" stroke={GOLD_L} strokeWidth=".6" opacity=".9" />

      {/* 道具 */}
      {prop === 'ball' && <Dewdrop id={id} />}
      {prop === 'cards' && <Cards />}
      {prop === 'magnifier' && <Magnifier />}
      {/* 爪子盖在道具上 */}
      {prop !== 'none' && (
        <>
          <ellipse cx="80" cy="185" rx="9.5" ry="10.5" fill={INK} />
          <ellipse cx="120" cy="185" rx="9.5" ry="10.5" fill={INK} />
          <circle cx="80" cy="188" r="2.6" fill={CHAR.pad} />
          <circle cx="120" cy="188" r="2.6" fill={CHAR.pad} />
        </>
      )}

      {/* 耳朵 */}
      <circle cx="49" cy="56" r="17.5" fill={INK} />
      <circle cx="151" cy="56" r="17.5" fill={INK} />
      <circle cx="51" cy="58" r="8" fill={CHAR.innerEar} />
      <circle cx="149" cy="58" r="8" fill={CHAR.innerEar} />
      {/* 金耳环 */}
      <circle cx="140" cy="70" r="4.4" fill="none" stroke={GOLD} strokeWidth="1.8" />

      {/* 头 */}
      <ellipse cx="100" cy="94" rx="63" ry="55" fill={`url(#${id}-head)`} />

      {/* 苔绿丝绒头巾：像一片折起来的叶子（叶尖往右上翘，中间一道叶脉折痕） */}
      <path
        d="M56 72 C 51 44, 70 24, 96 20 C 104 18.6, 111 14, 116 6.5 C 121.5 16, 121 25, 127.5 31 C 140 41, 146.5 56, 144 72 C 130 62, 114 58, 100 58 C 86 58, 70 62, 56 72 Z"
        fill={`url(#${id}-turban)`}
      />
      {/* 丝绒光泽 */}
      <path d="M62 60 C 60 42, 76 28, 96 24.5 C 84 32, 72 44, 68 60 Z" fill={`url(#${id}-sheen)`} />
      {/* 两道亚麻细条纹 */}
      <path d="M61 55 C 78 41, 122 38, 140 51" stroke={PG.pinstripe} strokeWidth="1.25" fill="none" opacity=".82" />
      <path d="M58.5 63.5 C 78 51, 122 48, 142 60" stroke={PG.pinstripe} strokeWidth="1.25" fill="none" opacity=".72" />
      {/* 叶脉折痕 */}
      <path d="M115.5 8 C 113 24, 106 40, 100.5 51" stroke={PG.turban[1]} strokeWidth="1.6" fill="none" opacity=".75" strokeLinecap="round" />
      <path d="M116.5 9.5 C 114.6 24, 108 40, 102.4 51" stroke={PG.pinstripe} strokeWidth=".7" fill="none" opacity=".35" />
      {/* 金边 + 琥珀宝石 */}
      <path d="M57 71 C 71 61, 87 57, 100 57 C 113 57, 129 61, 143 71" stroke={`url(#${id}-gold)`} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M100 46 C 106 52, 106 58, 100 62 C 94 58, 94 52, 100 46 Z" fill={PG.gem} stroke={`url(#${id}-gold)`} strokeWidth="2" className={mood === 'mystic' ? 'pg-gem-glow' : ''} />
      <ellipse cx="98.4" cy="51.5" rx="1.4" ry="2.4" fill="#fff" opacity=".8" />

      <Eyes mood={mood} id={id} />

      {/* 腮红 */}
      <ellipse cx="65" cy="118" rx="8.5" ry="5" fill={CHAR.blush} opacity=".5" />
      <ellipse cx="135" cy="118" rx="8.5" ry="5" fill={CHAR.blush} opacity=".5" />

      {/* 鼻子 + 嘴 */}
      <path d="M93.5 110.5 Q100 106.5 106.5 110.5 Q104 117.5 100 117.5 Q96 117.5 93.5 110.5 Z" fill={INK} />
      <ellipse cx="98.6" cy="110" rx="2" ry="1" fill="#fff" opacity=".5" />
      <Mouth mood={mood} />

      {/* 三颗露珠 / 萤火小光点 */}
      <g>
        <circle cx="29" cy="121" r="4.6" fill={`url(#${id}-dot)`} className="pg-twinkle" />
        <circle cx="171" cy="104" r="3.8" fill={`url(#${id}-dot)`} className="pg-twinkle pg-d2" />
        <circle cx="164" cy="161" r="3.2" fill={`url(#${id}-dot)`} className="pg-twinkle pg-d3" />
      </g>
    </svg>
  );
}

/** 神灯（召唤仪式用；三个愿望的小灯也用它）。glow 0–1 */
export function Lamp({ size = 200, glow = 0, className = '' }) {
  const raw = useId().replace(/:/g, '');
  const id = `lp${raw}`;
  return (
    <svg viewBox="0 0 240 140" width={size} height={(size * 140) / 240} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GOLD_L} />
          <stop offset=".45" stopColor={GOLD} />
          <stop offset="1" stopColor={GOLD_D} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={PG.halo} stopOpacity=".95" />
          <stop offset="1" stopColor={PG.halo} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="120" cy="80" rx={70 + glow * 30} ry={42 + glow * 18} fill={`url(#${id}-glow)`} opacity={0.12 + glow * 0.88} />
      {/* 把手 */}
      <path d="M58 70 C 30 62, 28 96, 56 96" stroke={`url(#${id}-g)`} strokeWidth="8" fill="none" strokeLinecap="round" />
      {/* 壶嘴 */}
      <path d="M150 84 C 172 84, 190 70, 214 52 C 220 48, 224 54, 218 58 C 196 76, 184 98, 156 100 Z" fill={`url(#${id}-g)`} />
      {/* 壶身 */}
      <path d="M52 86 C 52 64, 86 56, 120 56 C 154 56, 168 70, 168 86 C 168 106, 140 112, 110 112 C 78 112, 52 104, 52 86 Z" fill={`url(#${id}-g)`} />
      {/* 雕刻细线 */}
      <path d="M62 84 C 80 92, 150 92, 162 82" stroke={GOLD_L} strokeWidth="1.4" fill="none" opacity=".75" />
      <path d="M66 94 C 86 101, 146 101, 160 92" stroke={GOLD_D} strokeWidth="1" fill="none" opacity=".45" />
      {/* 盖 */}
      <path d="M92 58 C 96 40, 132 40, 136 58 Z" fill={`url(#${id}-g)`} />
      <path d="M98 55 C 102 45, 126 45, 130 55" stroke={GOLD_L} strokeWidth="1" fill="none" opacity=".6" />
      <circle cx="114" cy="38" r="6" fill={`url(#${id}-g)`} />
      <circle cx="112" cy="36" r="2" fill="#fff" opacity=".75" />
      {/* 底座 */}
      <path d="M92 110 L86 124 L142 124 L136 110 Z" fill={`url(#${id}-g)`} />
      <rect x="80" y="122" width="68" height="7" rx="3.5" fill={GOLD_D} />
      <ellipse cx="84" cy="74" rx="16" ry="5" fill="#fff" opacity=".38" transform="rotate(-12 84 74)" />
    </svg>
  );
}
