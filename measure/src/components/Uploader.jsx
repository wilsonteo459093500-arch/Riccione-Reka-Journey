import React, { useRef, useState } from 'react';
import { Upload, Ruler, Calculator, ImageIcon } from 'lucide-react';

const STEPS = [
  { icon: Upload, title: '① 传图', text: '户型图 JPG / PNG / PDF，截图也行' },
  { icon: Ruler, title: '② 标定', text: '沿图纸上一个已知尺寸（如 10350）画一条线，填进去' },
  { icon: Calculator, title: '③ 量柜', text: '其余长度按比例自动算出，分地柜/吊柜/高柜汇总延尺' },
];

export default function Uploader({ onFile, busy, error }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const pick = (files) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
      <h1 className="font-display text-2xl sm:text-3xl font-semibold text-sail-green-deep text-center">
        户型图量尺 · 橱柜延尺预估
      </h1>
      <p className="text-center text-sail-muted mt-2 text-sm">
        不用等设计师排图 —— 传一张户型图，标一个已知尺寸，其它长度就按比例量出来。
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-8 rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
          over ? 'border-sail-green bg-sail-tint' : 'border-sail-line bg-white hover:bg-sail-tint'
        }`}
      >
        <ImageIcon size={34} className="mx-auto text-sail-faint" />
        <div className="mt-3 text-sail-ink font-medium">{busy ? '正在处理…' : '点这里选文件，或直接拖进来'}</div>
        <div className="mt-1 text-xs text-sail-faint">支持 JPG / PNG / PDF（PDF 可选页）· 也可以直接 Ctrl+V 粘贴截图</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {error && <div className="mt-3 text-sm text-sail-danger text-center">{error}</div>}

      <div className="mt-8 grid sm:grid-cols-3 gap-3">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-white border border-sail-line rounded-xl p-4">
            <Icon size={18} className="text-sail-green" />
            <div className="mt-2 text-sm font-semibold text-sail-ink">{title}</div>
            <div className="mt-1 text-xs text-sail-muted leading-relaxed">{text}</div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-[11px] text-sail-faint leading-relaxed">
        图纸只留在这台设备的浏览器里，不会上传服务器。<br />
        量出来的是估算值，落单前请以现场复尺为准。
      </p>
    </div>
  );
}
