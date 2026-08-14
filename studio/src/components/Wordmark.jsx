import React from 'react';

/**
 * 品牌标记 —— 衬线 R 字母章。
 *
 * 为什么不用抽象图形：试过叠檐、嵌套方框、榫卯、斜切方，
 * 每一个在小尺寸下都会撞上既有的 UI 图标语义（弹出 / 复制 / 文件 / 回到顶部）。
 * RICCIONE REKA 是一个「名字驱动」的品牌 —— 意大利地名 + 马来文「设计」，
 * 这个组合本身就是识别点，加个小图案只会稀释它。
 * 所以：网页上用纯字标，只有必须放进方形容器的地方（favicon / app icon）才用 R 章。
 */
export function Mark({ size = 32, className = '' }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7.5" fill="currentColor" />
      <text
        x="16"
        y="16"
        fill="#F5F1EA"
        fontFamily="Fraunces, Georgia, 'Times New Roman', serif"
        fontSize="20"
        fontWeight="600"
        textAnchor="middle"
        dominantBaseline="central"
      >
        R
      </text>
    </svg>
  );
}

/**
 * 字标。名字永远只是 RICCIONE REKA；sub 是描述性副标签，不是名字的一部分。
 * size: 'sm' 导航栏，'lg' 登录页 / 首页。
 */
export default function Wordmark({ size = 'sm', sub = 'CONTENT STUDIO', className = '' }) {
  const lg = size === 'lg';
  return (
    <div className={`leading-none ${className}`}>
      <div
        className={`font-display font-semibold text-sail-green-deep whitespace-nowrap ${
          lg ? 'text-[30px] sm:text-[34px] tracking-[0.005em]' : 'text-[18px] tracking-[0.005em]'
        }`}
      >
        RICCIONE REKA
      </div>
      {sub && (
        <div
          className={`text-sail-faint uppercase whitespace-nowrap ${
            lg ? 'text-[10px] tracking-[0.44em] mt-2.5' : 'text-[8px] tracking-[0.36em] mt-1.5'
          }`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
