import React from 'react';

/**
 * 品牌标记 —— 衬线 C 字章（Cipta）。
 *
 * 为什么是 C 不是 R：RICCIONE REKA 底下会有好几个 app（Cipta / Render / CRM / Delivery OS），
 * 都用母品牌的 R 会让浏览器标签页完全分不出谁是谁。每个 app 用自己的首字母，
 * 母品牌靠字标那行 BY RICCIONE REKA 统一。
 *
 * 为什么不用抽象图形：试过叠檐、嵌套方框、榫卯、斜切方，
 * 每一版在 18px 下都会撞上既有的 UI 图标语义（弹出 / 复制 / 回到顶部 / 文件）。
 */
export function Mark({ size = 32, className = '' }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7.5" fill="currentColor" />
      <text
        x="16"
        y="16.4"
        fill="#F5F1EA"
        fontFamily="Fraunces, Georgia, 'Times New Roman', serif"
        fontSize="20"
        fontWeight="600"
        textAnchor="middle"
        dominantBaseline="central"
      >
        C
      </text>
    </svg>
  );
}

/**
 * 字标：CIPTA STUDIO 是产品名，BY RICCIONE REKA 是母品牌背书。
 *
 * 两行都是实词，层级必须一眼分得开。四个轴同时拉开：
 * 字号 2.25×、字重 600/400、深绿/浅灰、字距 0/0.3em。
 * 背书行的字距特意比副标签惯用值收一点 —— 它有 15 个字符，
 * 放太开会比产品名还宽，重心就翻了。
 *
 * size: 'sm' 导航栏，'lg' 登录页 / 首页。
 */
export default function Wordmark({ size = 'sm', name = 'CIPTA STUDIO', by = 'BY RICCIONE REKA', className = '' }) {
  const lg = size === 'lg';
  return (
    <div className={`leading-none ${className}`}>
      <div
        className={`font-display font-semibold text-sail-green-deep whitespace-nowrap ${
          lg ? 'text-[32px] sm:text-[38px] tracking-[0.005em]' : 'text-[19px] tracking-[0.005em]'
        }`}
      >
        {name}
      </div>
      {by && (
        <div
          className={`text-sail-faint uppercase whitespace-nowrap ${
            lg ? 'text-[10px] tracking-[0.3em] mt-2.5' : 'text-[8px] tracking-[0.26em] mt-1.5'
          }`}
        >
          {by}
        </div>
      )}
    </div>
  );
}
