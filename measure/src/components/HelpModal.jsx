import React from 'react';
import { X } from 'lucide-react';

const SECTIONS = [
  {
    t: '1. 传图',
    d: ['户型图 JPG / PNG / PDF 都行，手机截图也可以。', 'PDF 多页的可以在图上方切页。图纸越清楚、标注越全，量得越准。'],
  },
  {
    t: '2. 标定比例（最关键）',
    d: [
      '沿图纸上一个已知尺寸画一条线，填进它的实际毫米数 —— 比如总尺寸线 10350。',
      '基准线越长越准：拿整面墙的总尺寸，别拿 600 的小段。',
      '标定完可以用「校验」分类再量一条标注过的尺寸（如 9150），看误差几 %，2% 以内基本可用。',
    ],
  },
  {
    t: '3. 量柜体',
    d: [
      '先选分类（地柜 / 吊柜 / 高柜 / 台面），在图上点两下量一段。',
      'L 型、U 型打开「折线」，沿着墙连续点，双击或按回车结束，长度自动相加。',
      '「正交」开着会自动把接近横平竖直的线拉直；斜墙照样能量。',
      '靠近已有端点会自动咬住，转角不会有缝。',
    ],
  },
  {
    t: '4. 改与删',
    d: ['切到「选择」模式：点线条选中，拖端点微调，右边可以改名、改分类、删除。', '眼睛图标 = 暂不计入汇总（比如先留个参考线）。'],
  },
  {
    t: '5. 出结果',
    d: [
      '右下角汇总按地柜 / 吊柜 / 高柜 / 台面分开算延尺，米和尺都给。',
      '「预估报价」把自家单价（RM/尺）填进去会自动记住。',
      '导出：摘要（直接发 WhatsApp）、CSV（Excel）、标注图 PNG（发客户 / 工厂）。',
    ],
  },
  {
    t: '快捷键',
    d: ['回车 = 结束当前折线 · Esc = 取消 · Delete = 删掉选中的 · Ctrl/⌘+Z = 撤销 · Ctrl/⌘+V = 粘贴截图'],
  },
  {
    t: '准头说明',
    d: [
      '这是按图纸比例的估算：图纸本身的误差、扫描变形、点击偏差都会带进来，一般在 1–3%。',
      '报价、落单前务必现场复尺。',
    ],
  },
];

export default function HelpModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-sail-line px-4 py-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-sail-green-deep">怎么用</h2>
          <button onClick={onClose} className="p-1.5 text-sail-muted hover:text-sail-ink">
            <X size={18} />
          </button>
        </header>
        <div className="p-4 space-y-4">
          {SECTIONS.map((s) => (
            <div key={s.t}>
              <div className="text-sm font-semibold text-sail-ink">{s.t}</div>
              <ul className="mt-1 space-y-1">
                {s.d.map((line) => (
                  <li key={line} className="text-xs text-sail-muted leading-relaxed pl-3 relative">
                    <span className="absolute left-0 top-1.5 w-1 h-1 rounded-full bg-sail-faint" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
