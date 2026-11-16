// UKIR STUDIO 的 logo：木纹「U」（2026-11 老板选的方案 B「直纹 · 节」）。
// 以老板给的木纹 logo 模板为灵感重画：外形是圆角 U，里面的木纹顺着两条腿往下、在底部转弯，左腿一个木节——
// 纹路走向、比例都和模板不同（模板是两块分开的方形、斜向流纹），是 UKIR 自己的字标。
// 线条用描边（currentColor），顶栏是墨色，深色底上传 className="text-white"。
// 小于 32 px（顶栏、浏览器标签）用简化版：线少一点才不糊。
// public/icon.svg（浏览器标签页，简化版）、public/apple-touch-icon.png（完整版）是同一组形状。

import React from 'react';

/** U 的外框（viewBox 0 0 100 100）：圆角方形，中间从顶部往下开一道槽 */
export const UKIR_MARK_OUTLINE =
  'M18 8 H44.5 V58 A5.5 5.5 0 0 0 55.5 58 V8 H82 A12 12 0 0 1 94 20 V64 A30 30 0 0 1 64 94 H36 A30 30 0 0 1 6 64 V20 A12 12 0 0 1 18 8 Z';

/** 完整版：外框 + 四道木纹 + 左腿一个木节 */
export const UKIR_MARK = {
  stroke: 3.4,
  paths: [
    UKIR_MARK_OUTLINE,
    'M16 20 V62 C16 77 26 85 42 85 H58 C74 85 84 77 84 62 V20',
    'M27 20 V39 C27 44 31 47 31 53 V62 C31 70 37 74 45 74 H55 C63 74 69 70 69 62 V20',
    'M38 20 V58 C38 62 41 64 45 64',
    'M62 20 V58 C62 62 59 64 55 64',
  ],
  knot: { cx: 21.5, cy: 44, rx: 2.6, ry: 5 },
};

/** 简化版（< 32 px）：外框 + 一道内纹 */
export const UKIR_MARK_SMALL = {
  stroke: 7,
  paths: [UKIR_MARK_OUTLINE, 'M22 20 V60 Q22 78 40 80 H60 Q78 78 78 60 V20'],
  knot: null,
};

/** 小尺寸用简化版 */
export const markFor = (size) => (size < 32 ? UKIR_MARK_SMALL : UKIR_MARK);

export default function BrandMark({ size = 24, className = '', title = 'UKIR STUDIO' }) {
  const m = markFor(size);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={m.stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title}
    >
      {m.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
      {m.knot && <ellipse cx={m.knot.cx} cy={m.knot.cy} rx={m.knot.rx} ry={m.knot.ry} />}
    </svg>
  );
}
