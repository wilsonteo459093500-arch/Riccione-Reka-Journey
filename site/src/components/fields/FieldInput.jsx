// 通用字段输入：按 field.type 渲染（手机友好：大按钮、原生日期 / 时间选择器）
import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import PhotoStrip from './PhotoStrip.jsx';
import VideoField from './VideoField.jsx';
import { normOptions, L } from '../../templates/schema.js';

export function FieldLabel({ field, invalid }) {
  const label = typeof field.label === 'string' ? { zh: field.label } : field.label || {};
  return (
    <div className="mb-1.5 leading-snug">
      <span className={`text-[14px] font-semibold ${invalid ? 'text-fail' : 'text-ink'}`}>{label.zh || label.en}</span>
      {field.required && <span className="ml-0.5 text-[13px] font-bold text-terra">*</span>}
      {label.zh && label.en && <span className="ml-1.5 text-[11px] text-ink-mute">{label.en}</span>}
    </div>
  );
}

function AutoTextarea({ value, onChange, placeholder, rows = 3, invalid }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 420)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={`input resize-none leading-relaxed ${invalid ? 'border-fail ring-2 ring-fail/15' : ''}`}
      rows={rows}
      value={value || ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Segmented({ options, value, onChange, allowClear = true }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            type="button"
            key={o.v}
            onClick={() => onChange(on && allowClear ? '' : o.v)}
            className={`min-h-[44px] flex-1 basis-[30%] rounded-xl px-3 py-2 text-[14px] font-semibold ring-1 transition active:scale-[0.97] ${
              on ? 'bg-pine text-white ring-pine' : 'bg-white text-ink ring-line'
            }`}
          >
            {o.zh || o.v}
            {o.en && <span className={`ml-1 text-[11px] font-normal ${on ? 'text-white/75' : 'text-ink-mute'}`}>{o.en}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Chips({ field, value, onChange }) {
  const opts = normOptions(field.options || []);
  const multiple = !!field.multiple;
  const arr = multiple ? (Array.isArray(value) ? value : value ? [value] : []) : value ? [value] : [];
  const [custom, setCustom] = useState('');
  const extra = arr.filter((v) => !opts.some((o) => o.v === v));
  const toggle = (v) => {
    if (multiple) onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    else onChange(arr.includes(v) ? '' : v);
  };
  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    if (!arr.includes(v)) onChange(multiple ? [...arr, v] : v);
    setCustom('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {[...opts, ...extra.map((v) => ({ v, zh: v }))].map((o) => {
          const on = arr.includes(o.v);
          return (
            <button
              type="button"
              key={o.v}
              onClick={() => toggle(o.v)}
              className={`chip ${on ? 'bg-terra text-white ring-terra' : 'bg-white text-ink ring-line'}`}
            >
              {on && <Icon name="Check" size={14} />}
              {o.zh || o.v}
            </button>
          );
        })}
      </div>
      {field.allowCustom && (
        <div className="mt-2 flex gap-2">
          <input
            className="input py-2.5"
            value={custom}
            placeholder="其他（自己填）"
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
          />
          <button type="button" className="btn-soft shrink-0 px-4 py-2.5" onClick={addCustom}>
            <Icon name="Plus" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function ListEditor({ value, onChange, placeholder }) {
  const arr = Array.isArray(value) ? value : [];
  const set = (i, v) => onChange(arr.map((x, j) => (j === i ? v : x)));
  const del = (i) => onChange(arr.filter((_, j) => j !== i));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    const next = arr.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {arr.map((line, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-5 shrink-0 text-center text-[12px] text-ink-mute">{i + 1}</span>
          <input className="input py-2.5" value={line} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
          <div className="flex shrink-0 flex-col">
            <button type="button" className="px-1 text-ink-faint active:text-ink" onClick={() => move(i, -1)} aria-label="上移">
              <Icon name="ChevronUp" size={16} />
            </button>
            <button type="button" className="px-1 text-ink-faint active:text-ink" onClick={() => move(i, 1)} aria-label="下移">
              <Icon name="ChevronDown" size={16} />
            </button>
          </div>
          <button type="button" className="shrink-0 rounded-full p-2 text-ink-faint active:bg-fail/10 active:text-fail" onClick={() => del(i)} aria-label="删除">
            <Icon name="X" size={18} />
          </button>
        </div>
      ))}
      <button type="button" className="btn-soft w-full py-2.5 text-[14px]" onClick={() => onChange([...arr, ''])}>
        <Icon name="Plus" size={16} /> 加一条
      </button>
    </div>
  );
}

/**
 * @param {{ field, value, onChange, reportId, invalid? }} props
 */
export default function FieldInput({ field, value, onChange, reportId, invalid }) {
  const t = field.type;
  const cls = `input ${invalid ? 'border-fail ring-2 ring-fail/15' : ''}`;
  switch (t) {
    case 'textarea':
      return <AutoTextarea value={value} onChange={onChange} placeholder={field.placeholder} rows={field.rows || 3} invalid={invalid} />;
    case 'date':
      return (
        <div className="flex gap-2">
          <input type="date" className={`${cls} min-h-[48px]`} value={value || ''} onChange={(e) => onChange(e.target.value)} />
          {value && (
            <button type="button" className="shrink-0 rounded-xl px-3 text-ink-faint active:bg-cream-deep" onClick={() => onChange('')} aria-label="清空">
              <Icon name="X" size={18} />
            </button>
          )}
        </div>
      );
    case 'time':
      return <input type="time" className={`${cls} min-h-[48px]`} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input type="number" inputMode="decimal" className={cls} value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'tel':
      return <input type="tel" inputMode="tel" className={cls} value={value || ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" className={cls} value={value || ''} placeholder={field.placeholder || 'https://'} onChange={(e) => onChange(e.target.value.trim())} />;
    case 'select': {
      const opts = normOptions(field.options || []);
      if (opts.length <= 4) return <Segmented options={opts} value={value} onChange={onChange} />;
      return (
        <select className={`${cls} min-h-[48px]`} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— 请选择 —</option>
          {opts.map((o) => (
            <option key={o.v} value={o.v}>
              {L(o)}
            </option>
          ))}
        </select>
      );
    }
    case 'radio':
      return <Segmented options={normOptions(field.options || [])} value={value} onChange={onChange} />;
    case 'yesno':
      return (
        <Segmented
          options={[{ v: 'Y', zh: '是', en: 'Yes' }, { v: 'N', zh: '否', en: 'No' }]}
          value={value === true ? 'Y' : value === false ? 'N' : value}
          onChange={onChange}
        />
      );
    case 'chips':
      return <Chips field={field} value={value} onChange={onChange} />;
    case 'list':
      return <ListEditor value={value} onChange={onChange} placeholder={field.placeholder} />;
    case 'photos':
      return <PhotoStrip ids={value || []} onChange={onChange} reportId={reportId} max={field.max || 30} />;
    case 'video':
      return <VideoField value={value} onChange={onChange} reportId={reportId} />;
    default:
      return <input type="text" className={cls} value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
}
