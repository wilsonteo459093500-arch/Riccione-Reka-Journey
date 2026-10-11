// 直觉牌上的小插画 —— 全部 SVG，参数化（墙色 / 地板 / 沙发形状 / 光线 / 密度 / 收纳）。
// 系统 1 认图比认字快得多：客人不需要知道「侘寂」「Japandi」，只要知道哪一张让他想躺下。
// 内容色（测验刺激）：墙、地板、沙发的颜色来自 flow.js，不随 VI 换色；天空、夜色、线条按「晨光溪岸」调过。

import { useId } from 'react';
import { swatchURL } from '../shared/textures.js';
import { MAT_BY_ID } from '../shared/materials.js';
import { L } from '../shared/i18n.js';

const shadeHex = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

function Sky({ light, id }) {
  if (light === 'evening')
    return (
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F6C38B" />
        <stop offset="1" stopColor="#E3824F" />
      </linearGradient>
    );
  if (light === 'bright-night' || light === 'lamp-night')
    return (
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#17201C" />
        <stop offset="1" stopColor="#2C3B35" />
      </linearGradient>
    );
  return (
    <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#C9DFDA" />
      <stop offset="1" stopColor="#EEF4EE" />
    </linearGradient>
  );
}

function Sofa({ shape, color, accent }) {
  if (shape === 'curvy')
    return (
      <g>
        <rect x="112" y="98" width="164" height="50" rx="25" fill={shadeHex(color, 0.93)} />
        <rect x="104" y="124" width="180" height="40" rx="20" fill={color} />
        <ellipse cx="150" cy="128" rx="18" ry="12" fill={accent} opacity=".9" />
        <ellipse cx="238" cy="128" rx="16" ry="11" fill={shadeHex(color, 0.8)} />
        <rect x="120" y="162" width="148" height="5" rx="2.5" fill="rgba(0,0,0,.12)" />
      </g>
    );
  return (
    <g>
      <rect x="112" y="100" width="164" height="36" rx="3" fill={shadeHex(color, 0.9)} />
      <rect x="106" y="130" width="176" height="28" rx="3" fill={color} />
      <rect x="100" y="112" width="14" height="46" rx="2" fill={shadeHex(color, 0.85)} />
      <rect x="274" y="112" width="14" height="46" rx="2" fill={shadeHex(color, 0.85)} />
      <rect x="132" y="114" width="26" height="20" rx="2" fill={accent} opacity=".9" />
      <line x1="112" y1="158" x2="110" y2="170" stroke="#222" strokeWidth="2.5" />
      <line x1="276" y1="158" x2="278" y2="170" stroke="#222" strokeWidth="2.5" />
    </g>
  );
}

function Plant({ x = 34, y = 170 }) {
  return (
    <g>
      <path d={`M${x - 12} ${y - 22} L${x + 12} ${y - 22} L${x + 9} ${y} L${x - 9} ${y} Z`} fill="#C9B79D" />
      {[
        [-8, -48, -25],
        [6, -54, 20],
        [-2, -66, 0],
        [12, -40, 40],
        [-14, -36, -45],
      ].map(([dx, dy, r], i) => (
        <ellipse key={i} cx={x + dx} cy={y + dy} rx="7" ry="17" fill={i % 2 ? '#5F7D5A' : '#7C9A6D'} transform={`rotate(${r} ${x + dx} ${y + dy})`} />
      ))}
    </g>
  );
}

function Lamp({ glow }) {
  return (
    <g>
      <rect x="290" y="128" width="22" height="42" rx="2" fill="#B58E66" />
      <line x1="301" y1="128" x2="301" y2="98" stroke="#5A4634" strokeWidth="2" />
      <path d="M288 80 L314 80 L318 100 L284 100 Z" fill={glow ? '#FFE3B0' : '#EFE6D6'} />
    </g>
  );
}

function StorageWall({ open, wall }) {
  if (!open)
    return (
      <g>
        <rect x="36" y="30" width="248" height="138" fill={shadeHex(wall, 0.96)} />
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1={36 + (i + 1) * 49.6} y1="30" x2={36 + (i + 1) * 49.6} y2="168" stroke={shadeHex(wall, 0.82)} strokeWidth="1.2" />
        ))}
        <line x1="36" y1="120" x2="284" y2="120" stroke={shadeHex(wall, 0.85)} strokeWidth="1" />
        <rect x="36" y="166" width="248" height="4" fill={shadeHex(wall, 0.75)} />
      </g>
    );
  const items = [
    ['book', '#A65A3A'],
    ['vase', '#C9B28F'],
    ['plant', '#6E8C63'],
    ['book', '#2E4057'],
    ['frame', '#D9C3A0'],
    ['vase', '#E9E2D4'],
    ['book', '#C6912E'],
    ['bowl', '#8E6A4E'],
    ['plant', '#7C9A6D'],
  ];
  return (
    <g>
      <rect x="36" y="30" width="248" height="138" fill="#C8A272" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => {
          const x = 44 + c * 80;
          const y = 38 + r * 43;
          const [kind, col] = items[r * 3 + c];
          return (
            <g key={`${r}${c}`}>
              <rect x={x} y={y} width="72" height="36" fill="#EFE6D6" />
              {kind === 'book' &&
                [0, 1, 2, 3, 4].map((k) => <rect key={k} x={x + 8 + k * 8} y={y + 8 + (k % 2) * 3} width="6" height={26 - (k % 2) * 3} fill={shadeHex(col, 0.85 + k * 0.06)} />)}
              {kind === 'vase' && <path d={`M${x + 30} ${y + 34} Q${x + 22} ${y + 18} ${x + 32} ${y + 8} L${x + 40} ${y + 8} Q${x + 50} ${y + 18} ${x + 42} ${y + 34} Z`} fill={col} />}
              {kind === 'plant' && <Plant x={x + 36} y={y + 34} />}
              {kind === 'frame' && <rect x={x + 22} y={y + 6} width="28" height="28" fill={col} stroke="#6B4B2F" strokeWidth="2" />}
              {kind === 'bowl' && <path d={`M${x + 20} ${y + 24} Q${x + 36} ${y + 40} ${x + 52} ${y + 24} Z`} fill={col} />}
            </g>
          );
        })
      )}
    </g>
  );
}

function RoomScene(p) {
  const raw = useId().replace(/:/g, '');
  const id = `vg${raw}`;
  const { wall = '#EFE6D6', floor = '#C8A272', sofa = '#D9CBB4', accent = '#B3552E', light = 'day', plant, density, storage, sofaShape = 'linear' } = p;
  const night = light === 'bright-night' || light === 'lamp-night';
  return (
    <svg viewBox="0 0 320 240" className="vg">
      <defs>
        <Sky light={light} id={id} />
        <radialGradient id={`${id}-lampnight`} cx="94%" cy="38%" r="95%">
          <stop offset="0" stopColor="#FFC27A" stopOpacity=".35" />
          <stop offset=".35" stopColor="#3A2A20" stopOpacity=".25" />
          <stop offset="1" stopColor="#10140F" stopOpacity=".72" />
        </radialGradient>
        <radialGradient id={`${id}-ceiling`} cx="50%" cy="0%" r="90%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".25" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="170" fill={wall} />
      <rect y="170" width="320" height="70" fill={floor} />
      {[188, 208, 230].map((y) => (
        <line key={y} x1="0" y1={y} x2="320" y2={y} stroke={shadeHex(floor, 0.88)} strokeWidth="1" />
      ))}
      <rect x="0" y="166" width="320" height="5" fill={shadeHex(wall, 0.85)} />

      {storage ? (
        <StorageWall open={storage === 'open'} wall={wall} />
      ) : (
        <>
          {/* 窗 */}
          <rect x="22" y="26" width="64" height="96" rx="1.5" fill={`url(#${id}-sky)`} stroke="#FBF8F2" strokeWidth="4" />
          <line x1="54" y1="26" x2="54" y2="122" stroke="#FBF8F2" strokeWidth="3" />
          {night && <circle cx="72" cy="44" r="6" fill="#F5EBC8" />}
          {light === 'day' && <polygon points="22,186 86,186 112,240 30,240" fill="#fff" opacity=".22" />}
          {light === 'evening' && <polygon points="40,176 100,176 170,240 70,240" fill="#FFB36B" opacity=".28" />}

          {/* 墙上 */}
          {density === 'layered' ? (
            <g>
              <rect x="120" y="22" width="40" height="30" fill="#C8A272" stroke="#5A4634" strokeWidth="2" />
              <rect x="166" y="16" width="30" height="40" fill="#9DAFBC" stroke="#5A4634" strokeWidth="2" />
              <rect x="202" y="24" width="44" height="28" fill="#B3552E" stroke="#5A4634" strokeWidth="2" />
              <circle cx="262" cy="36" r="13" fill="#E9E2D4" stroke="#5A4634" strokeWidth="2" />
              <rect x="128" y="60" width="26" height="22" fill="#6E8C63" stroke="#5A4634" strokeWidth="2" />
              <rect x="164" y="64" width="110" height="5" fill="#8E6A4E" />
              {[0, 1, 2, 3].map((k) => (
                <rect key={k} x={170 + k * 7} y={50 + (k % 2) * 3} width="6" height={14 - (k % 2) * 3} fill={['#A65A3A', '#2E4057', '#C6912E', '#7C9A6D'][k]} />
              ))}
              <path d="M222 64 Q216 52 224 44 L230 44 Q238 52 232 64 Z" fill="#C9B28F" />
              <Plant x={258} y={64} />
            </g>
          ) : (
            <rect x="170" y="34" width="48" height="56" fill={shadeHex(wall, 0.9)} stroke="#B9A88E" strokeWidth="2" />
          )}

          <Sofa shape={sofaShape} color={sofa} accent={accent} />
          <Lamp glow={light === 'evening' || light === 'lamp-night'} />
          {plant && <Plant />}
          {density === 'layered' && (
            <g>
              <ellipse cx="190" cy="212" rx="92" ry="14" fill={accent} opacity=".35" />
              <Plant x={70} y={226} />
            </g>
          )}
        </>
      )}

      {light === 'lamp-night' && <rect width="320" height="240" fill={`url(#${id}-lampnight)`} />}
      {light === 'bright-night' && <rect width="320" height="240" fill={`url(#${id}-ceiling)`} />}
      {light === 'bright-night' && <rect x="130" y="0" width="60" height="4" fill="#fff" />}
    </svg>
  );
}

function KitchenScene({ open }) {
  const wood = '#C8A272';
  return (
    <svg viewBox="0 0 320 240" className="vg">
      <rect width="320" height="170" fill="#EFEAE2" />
      <rect y="170" width="320" height="70" fill="#D8D2C8" />
      <rect x="0" y="170" width="320" height="2" fill="#C7C0B4" />
      {/* 地柜 */}
      <rect x="18" y="138" width="284" height="46" fill={open ? wood : '#E9E2D4'} />
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={18 + (i + 1) * 56.8} y1="140" x2={18 + (i + 1) * 56.8} y2="184" stroke="rgba(0,0,0,.14)" />
      ))}
      <rect x="14" y="132" width="292" height="8" fill="#CFC9BF" />
      {open ? (
        <g>
          {[46, 84].map((y) => (
            <rect key={y} x="30" y={y} width="260" height="5" fill="#8E6A4E" />
          ))}
          {[...Array(9)].map((_, k) => (
            <rect key={`j${k}`} x={36 + k * 28} y={28 + (k % 3) * 2} width="16" height={18 - (k % 3) * 2} rx="3" fill={['#E9E2D4', '#C9B28F', '#A65A3A', '#7C9A6D'][k % 4]} />
          ))}
          {[...Array(8)].map((_, k) => (
            <circle key={`p${k}`} cx={44 + k * 32} cy={74} r="9" fill={['#2E4057', '#E9E2D4', '#C6912E', '#B3552E'][k % 4]} />
          ))}
          <line x1="40" y1="104" x2="280" y2="104" stroke="#555" strokeWidth="2" />
          {[...Array(7)].map((_, k) => (
            <g key={`u${k}`}>
              <line x1={56 + k * 32} y1="104" x2={56 + k * 32} y2="122" stroke="#666" strokeWidth="2" />
              <circle cx={56 + k * 32} cy="124" r="4" fill="#777" />
            </g>
          ))}
          <rect x="40" y="114" width="26" height="18" rx="3" fill="#B8B1A4" />
          <rect x="230" y="110" width="20" height="22" rx="4" fill="#A65A3A" />
          <rect x="196" y="122" width="30" height="10" rx="2" fill="#C8A272" />
        </g>
      ) : (
        <g>
          <rect x="18" y="26" width="284" height="64" fill="#E9E2D4" />
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={18 + (i + 1) * 56.8} y1="26" x2={18 + (i + 1) * 56.8} y2="90" stroke="rgba(0,0,0,.12)" />
          ))}
          <rect x="18" y="90" width="284" height="2" fill="#F6E7C8" />
          <path d="M150 132 Q144 118 152 110 L158 110 Q166 118 160 132 Z" fill="#C9B28F" />
        </g>
      )}
    </svg>
  );
}

function ShelfScene({ full }) {
  const cols = ['#A65A3A', '#2E4057', '#C6912E', '#7C9A6D', '#B3552E', '#E9E2D4', '#8E6A4E'];
  return (
    <svg viewBox="0 0 320 240" className="vg">
      <rect width="320" height="240" fill="#EEE7DB" />
      <rect x="50" y="18" width="220" height="210" fill="#8E6A4E" />
      {[0, 1, 2].map((r) =>
        [0, 1].map((c) => {
          const x = 58 + c * 106;
          const y = 26 + r * 66;
          return (
            <g key={`${r}${c}`}>
              <rect x={x} y={y} width="98" height="58" fill="#F4EEE4" />
              {full ? (
                <g>
                  {[...Array(9)].map((_, k) => (
                    <rect key={k} x={x + 4 + k * 8} y={y + 12 + ((k * 7) % 5)} width="7" height={46 - ((k * 7) % 5)} fill={cols[(k + r * 2 + c) % cols.length]} />
                  ))}
                  <circle cx={x + 86} cy={y + 46} r="9" fill={cols[(r + c + 3) % cols.length]} />
                </g>
              ) : (
                (r + c) % 2 === 0 && (
                  <path d={`M${x + 42} ${y + 58} Q${x + 34} ${y + 38} ${x + 46} ${y + 24} L${x + 54} ${y + 24} Q${x + 64} ${y + 38} ${x + 56} ${y + 58} Z`} fill={['#C9B28F', '#E9E2D4', '#7C9A6D'][r]} />
                )
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

/** 一屋子朋友打边炉：圆桌、冒着热气的锅、围着的碗筷和人影 */
function HotpotScene({ bg }) {
  const seats = [
    [100, 150],
    [160, 128],
    [220, 150],
    [242, 196],
    [78, 196],
  ];
  return (
    <svg viewBox="0 0 320 240" className="vg">
      <rect width="320" height="240" fill={bg} />
      <rect y="0" width="320" height="120" fill="#F6DDBF" opacity=".55" />
      {/* 吊灯 */}
      <line x1="160" y1="0" x2="160" y2="40" stroke="#6B4B2F" strokeWidth="1.5" />
      <path d="M140 58 Q160 30 180 58 Z" fill="#E1913F" />
      <ellipse cx="160" cy="120" rx="120" ry="60" fill="#FFE2B0" opacity=".35" />
      {/* 人（圆圆的剪影） */}
      {seats.map(([x, y], i) => (
        <g key={i} fill={['#B3552E', '#6E8C63', '#8C4D2A', '#4A6652', '#C8A272'][i]}>
          <circle cx={x} cy={y - 44} r="13" />
          <path d={`M${x - 20} ${y} Q${x} ${y - 40} ${x + 20} ${y} Z`} />
        </g>
      ))}
      {/* 圆桌 */}
      <ellipse cx="160" cy="176" rx="104" ry="34" fill="#8C5A35" />
      <ellipse cx="160" cy="171" rx="104" ry="32" fill="#B07A4C" />
      {/* 碗筷 */}
      {[
        [96, 172],
        [130, 192],
        [190, 192],
        [224, 172],
        [160, 150],
      ].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx="12" ry="5" fill="#FBF8F2" />
          <line x1={x + 6} y1={y - 2} x2={x + 22} y2={y - 10} stroke="#6B4B2F" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ))}
      {/* 锅 + 热气 */}
      <ellipse cx="160" cy="170" rx="34" ry="12" fill="#3B3A36" />
      <ellipse cx="160" cy="167" rx="30" ry="9" fill="#C0532E" />
      <path d="M160 167 v-9" stroke="#3B3A36" strokeWidth="2" />
      <g stroke="#FFFFFF" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".85">
        <path d="M146 150 q-6 -10 0 -18 q6 -8 0 -16" />
        <path d="M160 146 q-6 -10 0 -18 q6 -8 0 -16" />
        <path d="M174 150 q-6 -10 0 -18 q6 -8 0 -16" />
      </g>
    </svg>
  );
}

/** 一个人，一本书，一杯茶：窗边的单人椅、落地灯、植物 */
function ReadingScene({ bg }) {
  return (
    <svg viewBox="0 0 320 240" className="vg">
      <rect width="320" height="240" fill={bg} />
      <rect y="176" width="320" height="64" fill="#B9C2AE" />
      {/* 窗 */}
      <rect x="196" y="24" width="90" height="112" rx="2" fill="#EEF4EE" stroke="#FBF8F2" strokeWidth="5" />
      <line x1="241" y1="24" x2="241" y2="136" stroke="#FBF8F2" strokeWidth="3" />
      <polygon points="196,180 286,180 300,240 170,240" fill="#FFFFFF" opacity=".25" />
      {/* 植物 */}
      <path d="M262 176 L282 176 L279 196 L265 196 Z" fill="#C9B79D" />
      {[
        [-8, -26, -25],
        [6, -32, 20],
        [-1, -42, 0],
        [12, -20, 40],
      ].map(([dx, dy, r], i) => (
        <ellipse key={i} cx={272 + dx} cy={176 + dy} rx="6" ry="15" fill={i % 2 ? '#5F7D5A' : '#7C9A6D'} transform={`rotate(${r} ${272 + dx} ${176 + dy})`} />
      ))}
      {/* 落地灯 */}
      <line x1="58" y1="70" x2="58" y2="196" stroke="#5A4634" strokeWidth="2.4" />
      <path d="M40 70 L76 70 L68 48 L48 48 Z" fill="#F3E3C3" />
      <ellipse cx="58" cy="200" rx="14" ry="3" fill="#5A4634" />
      <ellipse cx="96" cy="140" rx="70" ry="54" fill="#FFE8BE" opacity=".35" />
      {/* 单人椅 */}
      <rect x="84" y="112" width="78" height="62" rx="18" fill="#8C9884" />
      <rect x="78" y="146" width="92" height="34" rx="12" fill="#A3AE9A" />
      <rect x="88" y="178" width="4" height="16" fill="#5A4634" />
      <rect x="156" y="178" width="4" height="16" fill="#5A4634" />
      {/* 书 */}
      <path d="M106 150 l22 -6 l22 6 l0 4 l-22 -6 l-22 6 Z" fill="#FBF8F2" stroke="#A65A3A" strokeWidth="1.5" />
      {/* 边几 + 茶 */}
      <rect x="176" y="168" width="34" height="5" rx="2" fill="#6B4B2F" />
      <rect x="191" y="173" width="4" height="22" fill="#6B4B2F" />
      <path d="M184 156 h16 v8 q0 6 -8 6 q-8 0 -8 -6 Z" fill="#FBF8F2" />
      <path d="M200 159 q6 0 4 5 q-2 3 -4 2" stroke="#FBF8F2" strokeWidth="2" fill="none" />
      <path d="M189 150 q-3 -5 0 -9 M195 150 q-3 -5 0 -9" stroke="#FFFFFF" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

export default function Vignette({ visual }) {
  if (!visual) return null;
  if (visual.kind === 'room') return <RoomScene {...visual} />;
  if (visual.kind === 'kitchen') return <KitchenScene open={visual.open} />;
  if (visual.kind === 'shelf') return <ShelfScene full={visual.full} />;
  if (visual.kind === 'palette')
    return (
      <div className="vg vg-palette">
        {visual.colors.map((c, i) => (
          <i key={i} style={{ background: c }} />
        ))}
      </div>
    );
  if (visual.kind === 'swatches')
    return (
      <div className="vg vg-swatches">
        {visual.ids.map((mid) => (
          <figure key={mid}>
            <img src={swatchURL(mid, 192) || ''} alt="" />
            <figcaption>{L(MAT_BY_ID[mid])}</figcaption>
          </figure>
        ))}
      </div>
    );
  if (visual.kind === 'scene') {
    // 以前是一个大 emoji；现在画成小场景（flow.js 里还是 emoji 当记号）
    if (visual.emoji === '🍲') return <HotpotScene bg={visual.bg} />;
    if (visual.emoji === '📖') return <ReadingScene bg={visual.bg} />;
    return <div className="vg vg-scene" style={{ background: visual.bg }} />;
  }
  return null;
}
