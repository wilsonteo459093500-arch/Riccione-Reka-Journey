// 梦想家牌的牌面图腾 —— 金色线描，塔罗风。16 张牌各一个。

const P = {
  cup: (
    <>
      <path d="M30 34 h40 c0 18 -8 28 -20 28 s-20 -10 -20 -28z" />
      <path d="M70 40 c8 0 10 12 0 14" />
      <path d="M36 70 h28" />
      <path d="M42 24 c-4 -6 4 -8 0 -14 M52 24 c-4 -6 4 -8 0 -14 M62 24 c-4 -6 4 -8 0 -14" />
    </>
  ),
  vase: (
    <>
      <path d="M42 20 h16 v8 c10 6 14 16 14 26 c0 14 -10 22 -22 22 s-22 -8 -22 -22 c0 -10 4 -20 14 -26z" />
      <path d="M50 28 c6 -10 16 -14 22 -12 M50 28 c-4 -12 -14 -16 -20 -12" />
    </>
  ),
  pearl: (
    <>
      <circle cx="50" cy="50" r="16" />
      <path d="M50 22 v-8 M50 86 v-8 M22 50 h-8 M86 50 h-8 M30 30 l-6 -6 M70 70 l6 6 M70 30 l6 -6 M30 70 l-6 6" />
      <path d="M44 44 c4 -4 8 -4 10 -2" />
    </>
  ),
  star: (
    <>
      <path d="M50 14 l9 25 26 1 -21 16 8 26 -22 -15 -22 15 8 -26 -21 -16 26 -1z" />
      <circle cx="50" cy="50" r="6" />
    </>
  ),
  sun: (
    <>
      <circle cx="50" cy="50" r="15" />
      {[...Array(12)].map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r1 = 21;
        const r2 = i % 2 ? 30 : 36;
        return <path key={i} d={`M${50 + Math.cos(a) * r1} ${50 + Math.sin(a) * r1} L${50 + Math.cos(a) * r2} ${50 + Math.sin(a) * r2}`} />;
      })}
    </>
  ),
  leaf: (
    <>
      <path d="M24 76 C 24 40, 50 20, 80 20 C 80 52, 60 76, 24 76 Z" />
      <path d="M24 76 C 40 60, 56 44, 72 28 M44 58 h14 M36 66 v-14 M54 46 h12 M50 50 v-14" />
    </>
  ),
  crown: (
    <>
      <path d="M22 66 L18 32 L36 46 L50 24 L64 46 L82 32 L78 66 Z" />
      <path d="M22 74 h56" />
      <circle cx="50" cy="24" r="3" />
      <circle cx="18" cy="32" r="3" />
      <circle cx="82" cy="32" r="3" />
    </>
  ),
  book: (
    <>
      <path d="M50 30 C 40 24, 26 24, 18 28 V 74 C 26 70, 40 70, 50 76 C 60 70, 74 70, 82 74 V 28 C 74 24, 60 24, 50 30 Z" />
      <path d="M50 30 V 76 M26 38 c8 -2 14 -2 18 0 M26 48 c8 -2 14 -2 18 0 M56 38 c8 -2 14 -2 18 0" />
    </>
  ),
  feather: (
    <>
      <path d="M26 78 C 34 50, 52 26, 78 18 C 78 44, 60 66, 34 72" />
      <path d="M26 78 L 64 34 M40 62 l-8 -6 M48 52 l-8 -6 M56 42 l-6 -6 M46 60 l8 2 M54 50 l8 2" />
    </>
  ),
  wave: (
    <>
      <path d="M14 56 c8 -8 16 -8 24 0 s16 8 24 0 s16 -8 24 0" />
      <path d="M14 68 c8 -8 16 -8 24 0 s16 8 24 0 s16 -8 24 0" />
      <circle cx="64" cy="30" r="10" />
    </>
  ),
  key: (
    <>
      <circle cx="34" cy="50" r="13" />
      <circle cx="34" cy="50" r="5" />
      <path d="M47 50 H 82 M70 50 v10 M78 50 v8" />
    </>
  ),
  prism: (
    <>
      <path d="M50 16 L 82 76 H 18 Z" />
      <path d="M50 16 L 50 76 M50 44 L 18 76 M50 44 L 82 76" />
    </>
  ),
  tree: (
    <>
      <path d="M50 16 L 72 46 H 60 L 78 68 H 22 L 40 46 H 28 Z" />
      <path d="M50 68 V 84 M40 84 h20" />
    </>
  ),
  spark: (
    <>
      <path d="M50 14 C 52 40, 60 48, 86 50 C 60 52, 52 60, 50 86 C 48 60, 40 52, 14 50 C 40 48, 48 40, 50 14 Z" />
      <path d="M74 20 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z M26 70 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
    </>
  ),
  moon: (
    <>
      <path d="M62 18 A 32 32 0 1 0 82 66 A 26 26 0 1 1 62 18 Z" />
      <path d="M70 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
    </>
  ),
  gem: (
    <>
      <path d="M30 22 H 70 L 84 40 L 50 82 L 16 40 Z" />
      <path d="M16 40 H 84 M38 22 L 30 40 L 50 82 L 70 40 L 62 22 M50 22 V 40" />
    </>
  ),
};

export default function Emblem({ name, size = 64, color = 'currentColor', stroke = 2.4 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] || P.star}
    </svg>
  );
}
