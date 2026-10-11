// 项目资料：填一次，所有报告自动带入（地址、SO、客户、导航、进场须知…）
import { useState } from 'react';
import Icon from './ui/Icon.jsx';
import { t, tb, uiLabel, getUiLang } from '../lib/i18n.js';

// 新项目自动带入的默认值（存的是中文；文件里按文件语言换写法，见 templates/siteNotice.js）
const ENTRY_NOTE = 'Guard house 登记，带护照';
const PARKING = '访客停车场';
// English 界面下输入框里把没改过的默认值显示成英文；存的值不变，一打字就存打的内容
const DEFAULT_EN = { [ENTRY_NOTE]: 'Register at guard house with passport', [PARKING]: 'Visitor parking' };
const shownValue = (v) => (getUiLang() === 'en' && typeof v === 'string' && DEFAULT_EN[v] ? DEFAULT_EN[v] : v);

/** 「例：xxx」提示：中文 例：xxx；English e.g. xxx；中英 例 e.g. xxx */
const ex = (v) => (getUiLang() === 'both' ? `例 e.g. ${v}` : t(`例：${v}`, `e.g. ${v}`));

// label / hint = { zh, en }；placeholder = 渲染时取（跟界面语言）
export const PROJECT_FIELDS = [
  { key: 'name', label: { zh: '项目 / 楼盘名称', en: 'Project / development name' }, placeholder: () => ex('Tuai Timur Residence'), required: true },
  { key: 'unit', label: { zh: '单位号', en: 'Unit no.' }, placeholder: () => ex('17-3') },
  { key: 'client', label: { zh: '客户称呼', en: 'Client name' }, placeholder: () => ex('Hailey') },
  { key: 'so', label: { zh: 'SO 编号', en: 'SO no.' }, placeholder: () => ex('SO-2026-0917') },
  { key: 'address', label: { zh: '完整地址', en: 'Full address' }, placeholder: () => t('门牌 / 路名 / 邮编 / 城市', 'Unit / street / postcode / city'), type: 'textarea' },
  { key: 'mapLink', label: { zh: '导航链接（Google Maps / Waze）', en: 'Map link (Google Maps / Waze)' }, placeholder: () => 'https://maps.app.goo.gl/…', type: 'url' },
  { key: 'designer', label: { zh: '设计师', en: 'Designer' }, placeholder: () => ex('Mei Ling') },
  { key: 'startDate', label: { zh: '安装开工日期', en: 'Installation start date' }, type: 'date' },
  {
    key: 'plannedDays',
    label: { zh: '预计安装天数', en: 'Planned installation days' },
    placeholder: () => ex('5'),
    type: 'number',
    hint: { zh: '每日汇报会自动倒数剩余天数', en: 'The daily report counts down the days left automatically' },
  },
  { key: 'entryNote', label: { zh: '进场登记须知', en: 'Entry registration notes' }, placeholder: () => t(`例：${ENTRY_NOTE}`, `e.g. ${DEFAULT_EN[ENTRY_NOTE]}`) },
  { key: 'parking', label: { zh: '停车', en: 'Parking' }, placeholder: () => t(`例：${PARKING}`, `e.g. ${DEFAULT_EN[PARKING]}`) },
  { key: 'notes', label: { zh: '备注', en: 'Remarks' }, type: 'textarea', placeholder: () => t('物业规定、施工时段、钥匙…', 'Building rules, working hours, keys…') },
];

export default function ProjectForm({ initial = {}, onSave, onCancel, onDelete, onDirty, onChange, compact = false }) {
  const [p, setP] = useState({ entryNote: ENTRY_NOTE, parking: PARKING, ...initial });
  const fields = compact ? PROJECT_FIELDS.filter((f) => ['name', 'unit', 'client', 'so', 'address', 'mapLink'].includes(f.key)) : PROJECT_FIELDS;
  const set = (k, v) => {
    setP((x) => {
      const next = { ...x, [k]: v };
      onChange?.(next);
      return next;
    });
    onDirty?.(true);
  };
  const valid = (p.name || '').trim().length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...p, name: p.name.trim() });
      }}
    >
      {fields.map((f) => {
        const { primary, secondary } = uiLabel(f.label);
        const placeholder = f.placeholder?.();
        return (
          <div key={f.key}>
            <label className="label">
              {primary}
              {f.required && <span className="ml-1 text-terra">*</span>}
              {secondary && <span className="ml-1.5 text-[11px] font-normal text-ink-mute">{secondary}</span>}
            </label>
            {f.type === 'textarea' ? (
              <textarea className="input resize-none" rows={2} value={p[f.key] || ''} placeholder={placeholder} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input
                className="input"
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                inputMode={f.type === 'number' ? 'numeric' : undefined}
                value={shownValue(p[f.key]) ?? ''}
                placeholder={placeholder}
                onChange={(e) => set(f.key, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
              />
            )}
            {f.hint && <div className="mt-1 whitespace-pre-line text-[12px] text-ink-mute">{tb(f.hint.zh, f.hint.en)}</div>}
          </div>
        );
      })}
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
            {t('取消', 'Cancel')}
          </button>
        )}
        <button type="submit" className="btn-primary flex-[2]" disabled={!valid}>
          <Icon name="Check" size={18} /> {t('保存项目', 'Save project')}
        </button>
      </div>
      {onDelete && (
        <button type="button" className="btn w-full bg-transparent text-[14px] text-fail" onClick={onDelete}>
          <Icon name="Trash2" size={16} /> {t('删除项目', 'Delete project')}
        </button>
      )}
    </form>
  );
}
