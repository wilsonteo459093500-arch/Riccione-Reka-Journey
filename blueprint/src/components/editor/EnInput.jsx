import React from 'react';
import { resolveEn, memoryEn, setTranslation } from '../../engine/lang.js';
import { inputCls, AutoTextarea } from './ui.jsx';

// English / 中英版的英文输入框：跟着一段中文走，写进翻译记忆（project.translations[中文]）——
// 整套共用：同一句中文只译一次，改一处，所有用到它的页一起变。
//   空着 = 用词典的自动英文（灰字提示）；词典也没有 = 缺英文（橙色提示，可点「AI 翻译」）
//   中文本来就是英文（品牌名、编号）= 不用填

const BADGE = {
  memory: { text: '已填', cls: 'bg-bp-gold/15 text-bp-eyebrow', title: '用的是你填的（或 AI 翻译的）英文' },
  glossary: { text: '自动', cls: 'bg-bp-green/10 text-bp-green', title: '词典自动翻译；想换说法直接在这里改' },
  missing: { text: '缺英文', cls: 'bg-bp-warn/15 text-bp-warn', title: '还没有英文：英文版先显示中文，中英版只显示中文' },
};

/**
 * @param {{ project:object, zh:string, kind?:string, change:(updater:Function, opts?:object)=>void, field?:string,
 *   multiline?:boolean, className?:string, compact?:boolean, label?:string }} props
 *   kind：词典类别（room / view / role / label / note / material / team / text）
 *   field：data-field（画布点英文时定位到这里）
 */
export default function EnInput({ project, zh, kind = 'text', change, field, multiline = false, className = '', compact = false, label = 'EN' }) {
  const key = String(zh ?? '').trim();
  if (!key) return null;
  const r = resolveEn(project, key, kind);
  if (r.source === 'latin') return null; // 本来就是英文
  const value = memoryEn(project, key);
  const badge = BADGE[r.source] || null;
  const placeholder = r.source === 'glossary' ? r.text : '缺英文 —— 在这里填，或点「AI 翻译」';
  const onChange = (text) => change((p) => setTranslation(p, key, text));
  const warn = r.source === 'missing' ? '!border-bp-warn/50 placeholder:!text-bp-warn/70' : '';
  return (
    <div className={`flex items-start gap-1.5 ${className}`}>
      <span className="mt-[7px] shrink-0 text-[9px] font-semibold tracking-[0.12em] text-bp-faint" title="英文（English / 中英版用）">
        {label}
      </span>
      <div className="flex-1 min-w-0">
        {multiline ? (
          <AutoTextarea data-field={field} value={value} placeholder={placeholder} className={`${compact ? '!py-1 text-xs' : ''} ${warn}`} onChange={onChange} />
        ) : (
          <input
            data-field={field}
            className={`${inputCls} ${compact ? '!py-1 text-xs' : ''} ${warn}`}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
      {badge && (
        <span className={`mt-[5px] shrink-0 px-1.5 py-px rounded text-[10px] ${badge.cls}`} title={badge.title}>
          {badge.text}
        </span>
      )}
    </div>
  );
}
