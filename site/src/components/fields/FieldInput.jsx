// 通用字段输入：按 field.type 渲染（手机友好：大按钮、原生日期 / 时间选择器）
import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import PhotoStrip from './PhotoStrip.jsx';
import VideoField from './VideoField.jsx';
import { normOptions } from '../../templates/schema.js';
import { shownValue } from '../../templates/helpers.js';
import { t, uiLabel, uiText, uiOption, getUiLang } from '../../lib/i18n.js';

export function FieldLabel({ field, invalid }) {
  const { primary, secondary } = uiLabel(field.label);
  return (
    <div className="mb-1.5 leading-snug">
      <span className={`text-[14px] font-semibold ${invalid ? 'text-fail' : 'text-ink'}`}>{primary}</span>
      {field.required && <span className="ml-0.5 text-[13px] font-bold text-terra">*</span>}
      {secondary && <span className="ml-1.5 text-[11px] text-ink-mute">{secondary}</span>}
    </div>
  );
}

const YES_NO = [{ v: 'Y', zh: '是', en: 'Yes' }, { v: 'N', zh: '否', en: 'No' }];

// 会按 display 换写法的输入类型（文字 / 列表）；选择类的值是选项 v，不能换
const SHOWN_TYPES = new Set(['text', 'textarea', 'list', undefined]);

/**
 * 输入框里显示的值：界面是 English 时，新建时自动带入的中文固定文字（默认规定、预计工期、落款「安装部」、
 * 工地称呼的全角括号…）按字段 display 显示成英文；ctx 是 lang = 'en' 的模板上下文（编辑页传下来）。
 * 存的值不动（中文 / 中英文件不受影响）；一打字就存成打的内容（display 对自己写的值原样返回）。
 * 中文 / 中英界面照旧显示存的值。
 */
export function uiShownValue(field, value, ctx) {
  if (!ctx || getUiLang() !== 'en' || typeof field?.display !== 'function' || !SHOWN_TYPES.has(field.type)) return value;
  const v = shownValue(field, value, { ...ctx, lang: 'en', t: (zh, en) => en || zh });
  if (Array.isArray(value)) return Array.isArray(v) && v.length === value.length ? v : value;
  return typeof v === 'string' || v == null ? v : value;
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
        const lb = uiLabel(o);
        return (
          <button
            type="button"
            key={o.v}
            onClick={() => onChange(on && allowClear ? '' : o.v)}
            className={`min-h-[44px] flex-1 basis-[30%] rounded-xl px-3 py-2 text-[14px] font-semibold ring-1 transition active:scale-[0.97] ${
              on ? 'bg-pine text-white ring-pine' : 'bg-white text-ink ring-line'
            }`}
          >
            {lb.primary || o.v}
            {lb.secondary && <span className={`ml-1 text-[11px] font-normal ${on ? 'text-white/75' : 'text-ink-mute'}`}>{lb.secondary}</span>}
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
          const lb = uiLabel(o);
          return (
            <button
              type="button"
              key={o.v}
              onClick={() => toggle(o.v)}
              className={`chip ${on ? 'bg-terra text-white ring-terra' : 'bg-white text-ink ring-line'}`}
            >
              {on && <Icon name="Check" size={14} />}
              {lb.primary || o.v}
              {lb.secondary && <span className={`text-[11px] font-normal ${on ? 'text-white/75' : 'text-ink-mute'}`}>{lb.secondary}</span>}
            </button>
          );
        })}
      </div>
      {field.allowCustom && (
        <div className="mt-2 flex gap-2">
          <input
            className="input py-2.5"
            value={custom}
            placeholder={t('其他（自己填）', 'Other (type your own)')}
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

function ListEditor({ value, shown, onChange, placeholder }) {
  const arr = Array.isArray(value) ? value : [];
  // shown = 显示用的写法（English 界面下自动带入的默认行显示成英文）；改哪行只存哪行，其他行保持原值
  const lines = Array.isArray(shown) && shown.length === arr.length ? shown : arr;
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
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-5 shrink-0 text-center text-[12px] text-ink-mute">{i + 1}</span>
          <input className="input py-2.5" value={line} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
          <div className="flex shrink-0 flex-col">
            <button type="button" className="px-1 text-ink-faint active:text-ink" onClick={() => move(i, -1)} aria-label={t('上移', 'Move up')}>
              <Icon name="ChevronUp" size={16} />
            </button>
            <button type="button" className="px-1 text-ink-faint active:text-ink" onClick={() => move(i, 1)} aria-label={t('下移', 'Move down')}>
              <Icon name="ChevronDown" size={16} />
            </button>
          </div>
          <button type="button" className="shrink-0 rounded-full p-2 text-ink-faint active:bg-fail/10 active:text-fail" onClick={() => del(i)} aria-label={t('删除', 'Delete')}>
            <Icon name="X" size={18} />
          </button>
        </div>
      ))}
      <button type="button" className="btn-soft w-full py-2.5 text-[14px]" onClick={() => onChange([...arr, ''])}>
        <Icon name="Plus" size={16} /> {t('加一条', 'Add item')}
      </button>
    </div>
  );
}

/**
 * @param {{ field, value, onChange, reportId, invalid?, displayCtx? }} props
 * displayCtx：lang = 'en' 的模板上下文（English 界面下按字段 display 显示自动带入的文字，见 uiShownValue）
 */
export default function FieldInput({ field, value, onChange, reportId, invalid, displayCtx }) {
  const type = field.type;
  const cls = `input ${invalid ? 'border-fail ring-2 ring-fail/15' : ''}`;
  const placeholder = field.placeholder == null ? undefined : uiText(field.placeholder);
  const shown = uiShownValue(field, value, displayCtx);
  switch (type) {
    case 'textarea':
      return <AutoTextarea value={shown} onChange={onChange} placeholder={placeholder} rows={field.rows || 3} invalid={invalid} />;
    case 'date':
      return (
        <div className="flex gap-2">
          <input type="date" className={`${cls} min-h-[48px]`} value={value || ''} onChange={(e) => onChange(e.target.value)} />
          {value && (
            <button type="button" className="shrink-0 rounded-xl px-3 text-ink-faint active:bg-cream-deep" onClick={() => onChange('')} aria-label={t('清空', 'Clear')}>
              <Icon name="X" size={18} />
            </button>
          )}
        </div>
      );
    case 'time':
      return <input type="time" className={`${cls} min-h-[48px]`} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input type="number" inputMode="decimal" className={cls} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'tel':
      return <input type="tel" inputMode="tel" className={cls} value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" className={cls} value={value || ''} placeholder={placeholder || 'https://'} onChange={(e) => onChange(e.target.value.trim())} />;
    case 'select': {
      const opts = normOptions(field.options || []);
      if (opts.length <= 4) return <Segmented options={opts} value={value} onChange={onChange} />;
      return (
        <select className={`${cls} min-h-[48px]`} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{`— ${t('请选择', 'Select')} —`}</option>
          {opts.map((o) => (
            <option key={o.v} value={o.v}>
              {uiOption(o)}
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
          options={YES_NO}
          value={value === true ? 'Y' : value === false ? 'N' : value}
          onChange={onChange}
        />
      );
    case 'chips':
      return <Chips field={field} value={value} onChange={onChange} />;
    case 'list':
      return <ListEditor value={value} shown={shown} onChange={onChange} placeholder={placeholder} />;
    case 'photos':
      return <PhotoStrip ids={value || []} onChange={onChange} reportId={reportId} max={field.max || 30} />;
    case 'video':
      return <VideoField value={value} onChange={onChange} reportId={reportId} />;
    default:
      return <input type="text" className={cls} value={shown ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
}
