// UKIR STUDIO 的 logo（老板定的「U」字标）：三块几何形 —— 左上竖条、左下斜切横条、右侧斜切竖条。
// 照老板发来的图量出来：笔画 168、缝 50、两处斜切都是 45°，整个字标 554 × 554。
// 颜色跟随 currentColor（顶栏是墨色，深色底上可以传 className="text-white"）。
// public/icon.svg（浏览器标签页）、public/apple-touch-icon.png 用的是同一组形状。

import React from 'react';

export const UKIR_MARK_PATH = 'M0 0H168V336H0Z M0 386H336V554H168Z M386 0H554V386L386 554Z';

export default function BrandMark({ size = 24, className = '', title = 'UKIR STUDIO' }) {
  return (
    <svg
      viewBox="0 0 554 554"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      fill="currentColor"
      role="img"
      aria-label={title}
    >
      <path d={UKIR_MARK_PATH} />
    </svg>
  );
}
