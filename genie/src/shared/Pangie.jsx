// 潘吉 Pangie —— 熊猫 × 神灯精灵 × 塔罗师。原创形象，纯 SVG，可缩放、可换表情。
// 圆滚滚的大头小身体；下半身是神灯里飘出来的一缕晨雾；苔绿丝绒头巾 + 琥珀宝石；捧着露珠般的翡翠水晶球；月亮吊坠。
//
// <Pangie mood="idle|happy|wow|think|wink|mystic|sleepy" prop="ball|cards|magnifier|none" size={160} />

import { useId } from 'react';

const INK = '#25241f'; // 暖炭黑（SAIL 墨）
const FUR = '#FFFDF8';
const GOLD = '#CFA65C'; // SAIL 金

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
        <ellipse cx="100" cy="125" rx="4.6" ry="5.6" fill="#3A2A22" />
        <ellipse cx="100" cy="127.6" rx="2.8" ry="2" fill="#F08F98" />
      </g>
    );
  if (mood === 'happy')
    return (
      <g>
        <path d="M90.5 120.5 Q100 133 109.5 120.5 Z" fill="#3A2A22" />
        <ellipse cx="100" cy="126.6" rx="4" ry="2.4" fill="#F08F98" />
      </g>
    );
  if (mood === 'think') return <path d="M95 123 Q101 120.5 106 123.5" stroke={INK} strokeWidth="2.1" fill="none" strokeLinecap="round" />;
  return <path d="M92.5 121 Q96.3 125.6 100 121.4 Q103.7 125.6 107.5 121" stroke={INK} strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
}

function Ball({ id }) {
  return (
    <g className="pg-ball">
      <circle cx="100" cy="182" r="27" fill={`url(#${id}-halo)`} className="pg-halo" />
      <ellipse cx="100" cy="203" rx="17" ry="4" fill={GOLD} />
      <path d="M86 203 L89 196 L111 196 L114 203 Z" fill={`url(#${id}-gold)`} />
      <circle cx="100" cy="181" r="19" fill={`url(#${id}-ball)`} />
      <path d="M88 186 Q95 172 106 177 Q113 181 108 188" stroke="#fff" strokeOpacity=".45" strokeWidth="1.6" fill="none" className="pg-swirl" />
      <ellipse cx="93" cy="173" rx="5.2" ry="3.4" fill="#fff" opacity=".7" transform="rotate(-30 93 173)" />
      <path d="M106 186 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1z" fill="#fff" className="pg-twinkle" />
    </g>
  );
}

function Cards() {
  return (
    <g>
      <g transform="rotate(-14 92 186)">
        <rect x="80" y="166" width="22" height="34" rx="3" fill="#2B3A31" stroke={GOLD} strokeWidth="1.4" />
        <circle cx="91" cy="183" r="5" fill="none" stroke={GOLD} strokeWidth="1" />
      </g>
      <g transform="rotate(10 108 186)">
        <rect x="98" y="164" width="22" height="34" rx="3" fill="#FBF6EC" stroke={GOLD} strokeWidth="1.4" />
        <path d="M109 173 l2 5 5 .4 -4 3.2 1.4 5 -4.4 -2.8 -4.4 2.8 1.4 -5 -4 -3.2 5 -.4z" fill={GOLD} />
      </g>
    </g>
  );
}

function Magnifier() {
  return (
    <g>
      <line x1="112" y1="194" x2="124" y2="210" stroke="#6B4B2F" strokeWidth="5" strokeLinecap="round" />
      <circle cx="104" cy="182" r="14" fill="#E9F2FF" fillOpacity=".55" stroke={GOLD} strokeWidth="3.5" />
      <ellipse cx="99" cy="177" rx="4" ry="2.4" fill="#fff" opacity=".8" transform="rotate(-30 99 177)" />
    </g>
  );
}

export default function Pangie({ mood = 'idle', prop = 'ball', size = 160, float = true, className = '', title }) {
  const raw = useId().replace(/:/g, '');
  const id = `pg${raw}`;
  return (
    <svg
      viewBox="0 0 200 250"
      width={size}
      height={(size * 250) / 200}
      className={`pangie ${float ? 'pg-float' : ''} ${className}`}
      role="img"
      aria-label={title || '潘吉 Pangie'}
    >
      <defs>
        <radialGradient id={`${id}-iris`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#5E7A5C" />
          <stop offset=".55" stopColor="#1F2A21" />
          <stop offset="1" stopColor="#11170F" />
        </radialGradient>
        <radialGradient id={`${id}-ball`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#F4FAF0" />
          <stop offset=".35" stopColor="#B6D6BC" />
          <stop offset=".75" stopColor="#5E8F72" />
          <stop offset="1" stopColor="#2C5442" />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset=".55" stopColor="#CFE6C8" stopOpacity=".55" />
          <stop offset="1" stopColor="#CFE6C8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4D58D" />
          <stop offset=".5" stopColor={GOLD} />
          <stop offset="1" stopColor="#9C6C26" />
        </linearGradient>
        <linearGradient id={`${id}-turban`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#557A60" />
          <stop offset="1" stopColor="#2A3F33" />
        </linearGradient>
        <linearGradient id={`${id}-smoke`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFDF8" />
          <stop offset=".45" stopColor="#E4EDDF" />
          <stop offset="1" stopColor="#A7C2A5" stopOpacity=".05" />
        </linearGradient>
        <radialGradient id={`${id}-belly`} cx="45%" cy="35%" r="70%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#EFEBE1" />
        </radialGradient>
        <radialGradient id={`${id}-head`} cx="42%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".8" stopColor={FUR} />
          <stop offset="1" stopColor="#ECE7DD" />
        </radialGradient>
      </defs>

      {/* 神灯的烟 —— 精灵的下半身 */}
      <g className="pg-smoke">
        <path
          d="M64 178 C 58 214, 92 226, 112 224 C 134 222, 142 236, 128 244 C 118 249, 106 243, 114 237 C 120 233, 124 236, 122 240 C 128 232, 116 228, 104 231 C 80 236, 56 222, 64 178 Z"
          fill={`url(#${id}-smoke)`}
        />
        <circle cx="140" cy="232" r="3.2" fill="#E4EDDF" opacity=".7" className="pg-puff" />
        <circle cx="150" cy="222" r="2.2" fill="#E4EDDF" opacity=".55" className="pg-puff pg-d2" />
      </g>

      {/* 身体 */}
      <ellipse cx="100" cy="172" rx="43" ry="37" fill={`url(#${id}-belly)`} />
      {/* 肩带（熊猫的黑色肩膀）*/}
      <path d="M57 160 C 60 140, 78 136, 100 137 C 122 136, 140 140, 143 160 C 136 152, 122 149, 100 150 C 78 149, 64 152, 57 160 Z" fill={INK} />
      {/* 手臂 */}
      <path d="M60 156 C 52 170, 62 190, 80 190 C 88 190, 90 180, 84 174 C 76 168, 72 160, 70 152 Z" fill={INK} />
      <path d="M140 156 C 148 170, 138 190, 120 190 C 112 190, 110 180, 116 174 C 124 168, 128 160, 130 152 Z" fill={INK} />

      {/* 月亮吊坠 */}
      <path d="M79 142 Q100 156 121 142" stroke={GOLD} strokeWidth="1.4" fill="none" />
      <path d="M104 150 A6.5 6.5 0 1 0 104 162 A5 5 0 1 1 104 150 Z" fill={`url(#${id}-gold)`} />

      {/* 道具 */}
      {prop === 'ball' && <Ball id={id} />}
      {prop === 'cards' && <Cards />}
      {prop === 'magnifier' && <Magnifier />}
      {/* 爪子盖在道具上 */}
      {prop !== 'none' && (
        <>
          <ellipse cx="80" cy="185" rx="9.5" ry="10.5" fill={INK} />
          <ellipse cx="120" cy="185" rx="9.5" ry="10.5" fill={INK} />
          <circle cx="80" cy="188" r="2.6" fill="#4A483E" />
          <circle cx="120" cy="188" r="2.6" fill="#4A483E" />
        </>
      )}

      {/* 耳朵 */}
      <circle cx="49" cy="56" r="17.5" fill={INK} />
      <circle cx="151" cy="56" r="17.5" fill={INK} />
      <circle cx="51" cy="58" r="8" fill="#45443B" />
      <circle cx="149" cy="58" r="8" fill="#45443B" />
      {/* 金耳环 */}
      <circle cx="140" cy="70" r="4.4" fill="none" stroke={GOLD} strokeWidth="1.8" />

      {/* 头 */}
      <ellipse cx="100" cy="94" rx="63" ry="55" fill={`url(#${id}-head)`} />

      {/* 丝绒头巾 */}
      <path d="M58 70 C 54 36, 80 22, 100 22 C 120 22, 146 36, 142 70 C 128 60, 112 57, 100 57 C 88 57, 72 60, 58 70 Z" fill={`url(#${id}-turban)`} />
      <path d="M66 52 C 84 40, 116 40, 134 52" stroke="#7FA287" strokeWidth="1.6" fill="none" opacity=".7" />
      <path d="M62 62 C 82 50, 118 50, 138 62" stroke="#7FA287" strokeWidth="1.6" fill="none" opacity=".55" />
      {/* 羽毛 */}
      <path d="M100 26 C 104 12, 118 6, 128 8 C 120 12, 112 20, 104 28 Z" fill="#FBF6EC" />
      <path d="M104 27 C 112 18, 120 12, 127 9" stroke={GOLD} strokeWidth="1" fill="none" />
      {/* 金边 + 宝石 */}
      <path d="M58 69 C 72 59, 88 56, 100 56 C 112 56, 128 59, 142 69" stroke={`url(#${id}-gold)`} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M100 46 C 106 52, 106 58, 100 62 C 94 58, 94 52, 100 46 Z" fill="#E1913F" stroke={`url(#${id}-gold)`} strokeWidth="2" className={mood === 'mystic' ? 'pg-gem-glow' : ''} />
      <ellipse cx="98.4" cy="51.5" rx="1.4" ry="2.4" fill="#fff" opacity=".8" />

      <Eyes mood={mood} id={id} />

      {/* 腮红 */}
      <ellipse cx="65" cy="118" rx="8.5" ry="5" fill="#F4A3A0" opacity=".55" />
      <ellipse cx="135" cy="118" rx="8.5" ry="5" fill="#F4A3A0" opacity=".55" />

      {/* 鼻子 + 嘴 */}
      <path d="M93.5 110.5 Q100 106.5 106.5 110.5 Q104 117.5 100 117.5 Q96 117.5 93.5 110.5 Z" fill={INK} />
      <ellipse cx="98.6" cy="110" rx="2" ry="1" fill="#fff" opacity=".5" />
      <Mouth mood={mood} />

      {/* 小星星 */}
      <g fill={GOLD}>
        <path d="M30 120 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" className="pg-twinkle" />
        <path d="M170 104 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z" className="pg-twinkle pg-d2" />
        <path d="M164 160 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1z" className="pg-twinkle pg-d3" />
      </g>
    </svg>
  );
}

/** 神灯（召唤仪式用） */
export function Lamp({ size = 200, glow = 0, className = '' }) {
  const raw = useId().replace(/:/g, '');
  const id = `lp${raw}`;
  return (
    <svg viewBox="0 0 240 140" width={size} height={(size * 140) / 240} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7DD9A" />
          <stop offset=".45" stopColor="#D7A54A" />
          <stop offset="1" stopColor="#8E5E1F" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="#FFE6A8" stopOpacity=".9" />
          <stop offset="1" stopColor="#FFE6A8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="120" cy="80" rx={70 + glow * 30} ry={42 + glow * 18} fill={`url(#${id}-glow)`} opacity={0.15 + glow * 0.85} />
      {/* 把手 */}
      <path d="M58 70 C 30 62, 28 96, 56 96" stroke={`url(#${id}-g)`} strokeWidth="9" fill="none" strokeLinecap="round" />
      {/* 壶嘴 */}
      <path d="M150 84 C 172 84, 190 70, 214 52 C 220 48, 224 54, 218 58 C 196 76, 184 98, 156 100 Z" fill={`url(#${id}-g)`} />
      {/* 壶身 */}
      <path d="M52 86 C 52 64, 86 56, 120 56 C 154 56, 168 70, 168 86 C 168 106, 140 112, 110 112 C 78 112, 52 104, 52 86 Z" fill={`url(#${id}-g)`} />
      <path d="M62 84 C 80 92, 150 92, 162 82" stroke="#FBE8B4" strokeWidth="2" fill="none" opacity=".7" />
      {/* 盖 */}
      <path d="M92 58 C 96 40, 132 40, 136 58 Z" fill={`url(#${id}-g)`} />
      <circle cx="114" cy="38" r="6" fill={`url(#${id}-g)`} />
      <circle cx="112" cy="36" r="2" fill="#FFF3CF" />
      {/* 底座 */}
      <path d="M92 110 L86 124 L142 124 L136 110 Z" fill={`url(#${id}-g)`} />
      <rect x="80" y="122" width="68" height="7" rx="3.5" fill="#9C6C26" />
      <ellipse cx="84" cy="74" rx="16" ry="5" fill="#FFF3CF" opacity=".45" transform="rotate(-12 84 74)" />
    </svg>
  );
}
