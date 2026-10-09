// 表格节（如整改与复验记录）：每行一张卡片，可加照片槽（问题照片 / 复验照片）
import Icon from '../ui/Icon.jsx';
import { useUI } from '../ui/UI.jsx';
import FieldInput, { FieldLabel } from './FieldInput.jsx';
import PhotoStrip from './PhotoStrip.jsx';
import { tablePhotoSlots } from '../../lib/docmodel.js';
import { resolveScale, L } from '../../templates/schema.js';
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
  const row = {};
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
      if (descKey) row[descKey] = `#${it.no} ${L(it.title, 'zh')}${a.note ? `：${a.note}` : ''}`;
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

  const setRow = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, emptyRow(section)]);
  const del = async (i) => {
    const ok = await confirm({ title: `删除第 ${i + 1} 行？`, okText: '删除', danger: true });
    if (!ok) return;
    const r = rows[i];
    removeMedia(slots.flatMap((s) => r[s.key] || []));
    onChange(rows.filter((_, j) => j !== i));
  };
  const seed = async () => {
    const extra = rowsFromFails(template, report, section);
    if (!extra.length) {
      toast('没有新的不合格项需要记入', 'warn');
      return;
    }
    const first = slots[0]?.key;
    if (first) {
      for (const row of extra) row[first] = await cloneMedia(row[first], reportId);
    }
    onChange([...rows.filter((r) => Object.entries(r).some(([k, v]) => k !== '_from' && (Array.isArray(v) ? v.length : v))), ...extra]);
    toast(`已生成 ${extra.length} 条整改记录`);
  };

  return (
    <div className="space-y-3">
      {section.seedFromFails && (
        <button type="button" className="btn-soft w-full text-[14px]" onClick={seed}>
          <Icon name="Wand2" size={17} /> 从「不合格」项自动生成
        </button>
      )}
      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white/60 px-4 py-5 text-center text-[13px] text-ink-mute">
          {L(section.emptyText, 'zh') || '还没有记录'}
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="card p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[14px] font-bold text-ink">#{i + 1}</div>
            <button type="button" className="rounded-full p-1.5 text-ink-faint active:bg-fail/10 active:text-fail" onClick={() => del(i)} aria-label="删除这一行">
              <Icon name="Trash2" size={17} />
            </button>
          </div>
          <div className="space-y-3">
            {section.columns.map((c) => (
              <div key={c.key}>
                <FieldLabel field={c} />
                <FieldInput field={c} value={row[c.key]} onChange={(v) => setRow(i, { [c.key]: v })} reportId={reportId} />
              </div>
            ))}
            {slots.map((s) => (
              <div key={s.key}>
                <FieldLabel field={{ label: s.label }} />
                <PhotoStrip ids={row[s.key] || []} onChange={(ids) => setRow(i, { [s.key]: ids })} reportId={reportId} compact max={12} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="btn-ghost w-full text-[14px]" onClick={add}>
          <Icon name="Plus" size={17} /> {section.addLabel || '添加一行'}
        </button>
      )}
    </div>
  );
}
