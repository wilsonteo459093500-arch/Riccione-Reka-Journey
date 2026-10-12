// 表格节（如整改与复验记录）：每行一张卡片，可加照片槽（问题照片 / 复验照片）
import Icon from '../ui/Icon.jsx';
import { useUI } from '../ui/UI.jsx';
import FieldInput, { FieldLabel } from './FieldInput.jsx';
import PhotoStrip from './PhotoStrip.jsx';
import { tablePhotoSlots } from '../../lib/docmodel.js';
import { resolveScale, L } from '../../templates/schema.js';
import { t, uiText, getUiLang } from '../../lib/i18n.js';
import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { getMedia, putMedia } from '../../lib/db.js';
import { uid } from '../../lib/report.js';

/** 复制照片记录（整改行与检查项各自持有一份，删一边不影响另一边） */
async function cloneMedia(ids, reportId) {
  const out = [];
  for (const id of ids || []) {
    const m = await getMedia(id);
    if (!m) continue;
    const nid = uid('m_');
    await putMedia({ ...m, id: nid, reportId, createdAt: Date.now() });
    out.push(nid);
  }
  return out;
}

function emptyRow(section) {
  const row = { _id: uid('row_') };
  for (const s of tablePhotoSlots(section)) row[s.key] = [];
  return row;
}

/** 从本报告的「不合格」检查项生成整改行（已生成过的不重复） */
function rowsFromFails(template, report, section) {
  const existing = new Set((report.tables?.[section.id] || []).map((r) => r._from).filter(Boolean));
  const out = [];
  for (const s of template.sections) {
    if (s.type !== 'checklist') continue;
    for (const it of s.items) {
      if (it.input) continue;
      const a = report.items?.[it.id];
      const opt = resolveScale(it.scale || s.scale).options.find((o) => o.v === a?.r);
      if (opt?.tone !== 'fail' || existing.has(it.id)) continue;
      const row = emptyRow(section);
      row._from = it.id;
      const descKey = section.columns.find((c) => c.type === 'textarea')?.key || section.columns[0]?.key;
      // 生成的问题描述（之后可改）：English 界面用英文检查项名，中文 / 中英照旧
      if (descKey) {
        row[descKey] =
          getUiLang() === 'en'
            ? `#${it.no} ${uiText(it.title)}${a.note ? `: ${a.note}` : ''}`
            : `#${it.no} ${L(it.title, 'zh')}${a.note ? `：${a.note}` : ''}`;
      }
      const slots = tablePhotoSlots(section);
      if (slots[0]) row[slots[0].key] = [...(a.photos || [])]; // 先放原 id，seed() 里再复制成独立记录
      out.push(row);
    }
  }
  return out;
}

export default function TableSection({ template, section, report, rows = [], onChange, reportId }) {
  const { confirm, toast } = useUI();
  const { removeMedia } = useStore();
  const slots = tablePhotoSlots(section);
  const max = section.maxRows || 50;

  const [seeding, setSeeding] = useState(false);
  // 行用稳定的 _id 定位（旧数据没有 _id 时退回按下标），所有修改基于最新行数据
  const same = (row, i) => (r, j) => (row._id ? r._id === row._id : j === i);
  const setRow = (row, i, patch) =>
    onChange((prev) => prev.map((r, j) => (same(row, i)(r, j) ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  const add = () => onChange((prev) => [...prev, emptyRow(section)]);
  const del = async (row, i) => {
    const ok = await confirm({ title: t(`删除第 ${i + 1} 行？`, `Delete row ${i + 1}?`), okText: t('删除', 'Delete'), danger: true });
    if (!ok) return;
    removeMedia(slots.flatMap((s) => row[s.key] || []));
    onChange((prev) => prev.filter((r, j) => !same(row, i)(r, j)));
  };
  const seed = async () => {
    if (seeding) return;
    const extra = rowsFromFails(template, report, section);
    if (!extra.length) {
      toast(t('没有新的不合格项需要记入', 'No new failed items to add'), 'warn');
      return;
    }
    setSeeding(true);
    try {
      const first = slots[0]?.key;
      if (first) {
        for (const row of extra) row[first] = await cloneMedia(row[first], reportId);
      }
      onChange((prev) => {
        const have = new Set(prev.map((r) => r._from).filter(Boolean));
        const keep = prev.filter((r) => Object.entries(r).some(([k, v]) => k !== '_from' && k !== '_id' && (Array.isArray(v) ? v.length : v)));
        return [...keep, ...extra.filter((r) => !have.has(r._from))];
      });
      toast(t(`已生成 ${extra.length} 条整改记录`, `Added ${extra.length} rectification ${extra.length === 1 ? 'item' : 'items'}`));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-3">
      {section.seedFromFails && (
        <button type="button" className="btn-soft w-full text-[14px]" disabled={seeding} onClick={seed}>
          <Icon name="Wand2" size={17} /> {t('从「不合格」项自动生成', 'Generate from "Fail" items')}
        </button>
      )}
      {rows.length === 0 && (
        <div className="whitespace-pre-line rounded-xl border border-dashed border-line bg-white/60 px-4 py-5 text-center text-[13px] text-ink-mute">
          {uiText(section.emptyText, '\n') || t('还没有记录', 'No records yet')}
        </div>
      )}
      {rows.map((row, i) => (
        <div key={row._id || i} className="card p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[14px] font-bold text-ink">#{i + 1}</div>
            <button type="button" className="rounded-full p-1.5 text-ink-faint active:bg-fail/10 active:text-fail" onClick={() => del(row, i)} aria-label={t('删除这一行', 'Delete this row')}>
              <Icon name="Trash2" size={17} />
            </button>
          </div>
          <div className="space-y-3">
            {section.columns.map((c) => (
              <div key={c.key}>
                <FieldLabel field={c} />
                <FieldInput field={c} value={row[c.key]} onChange={(v) => setRow(row, i, (r) => ({ [c.key]: typeof v === 'function' ? v(r[c.key]) : v }))} reportId={reportId} />
              </div>
            ))}
            {slots.map((s) => (
              <div key={s.key}>
                <FieldLabel field={{ label: s.label }} />
                <PhotoStrip ids={row[s.key] || []} onChange={(fn) => setRow(row, i, (r) => ({ [s.key]: fn(r[s.key] || []) }))} reportId={reportId} compact max={12} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="btn-ghost w-full text-[14px]" onClick={add}>
          <Icon name="Plus" size={17} /> {uiText(section.addLabel) || t('添加一行', 'Add row')}
        </button>
      )}
    </div>
  );
}
