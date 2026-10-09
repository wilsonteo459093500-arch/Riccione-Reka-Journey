import React from 'react';
import { Type, LayoutTemplate, Image as ImageIcon, Palette, StickyNote, ArrowUp, ArrowDown, X, Plus, Sparkles, CopyCheck, MoveRight, Box } from 'lucide-react';
import { findFloor, uid } from '../../../engine/model.js';
import { inferRole } from '../../../import/labels.js';
import {
  updateSlide, updateViewList, listMove, listRemove, listUpdate, assignMaterial, addMaterialAndAssign, sameRoomViews,
  copyMaterialsToRoom, viewTitleOf, roomSuggestions, floorContextOf, moveToFloorEnd, ROLE_SUGGESTIONS, NOW,
} from '../ops.js';
import { Section, Field, Segmented, AutoTextarea, inputCls, btnGhost, btnIcon } from '../ui.jsx';
import ImageField from '../ImageField.jsx';
import MaterialPicker from '../MaterialPicker.jsx';

// 效果图页：标题（房间 · 视角名）、英文小标题、楼层、版式、图片、材料、说明。

const LAYOUT_LABEL = { full: '满版', framed: '框图' };

function RowTools({ i, n, onMove, onRemove, removeTitle = '删除这一行' }) {
  return (
    <div className="flex shrink-0">
      <button type="button" className={btnIcon} disabled={i === 0} onClick={() => onMove(i, -1)} title="上移">
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={btnIcon} disabled={i === n - 1} onClick={() => onMove(i, 1)} title="下移">
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={`${btnIcon} hover:!text-bp-danger`} onClick={() => onRemove(i)} title={removeTitle}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ViewInspector({ project, slide, change, notify, openPolish, layout, focusField }) {
  const id = slide.id;
  const set = (patch) => change((p) => updateSlide(p, id, patch));
  const setNow = (patch) => change((p) => updateSlide(p, id, patch), NOW);
  const mats = slide.materials || [];
  const notes = slide.notes || [];
  const floors = project.floors || [];
  const floor = findFloor(project, slide.floorId);
  const sameRoom = sameRoomViews(project, id);
  const rooms = roomSuggestions(project);
  const ctxFloor = floorContextOf(project, id);
  const misplaced = slide.floorId && floor && ctxFloor !== slide.floorId;
  const layoutValue = slide.layout && slide.layout !== 'auto' ? slide.layout : 'auto';
  const is3d = slide.tag === '3d';

  const listOp = (name, fn) => change((p) => updateViewList(p, id, name, fn));
  const listNow = (name, fn) => change((p) => updateViewList(p, id, name, fn), NOW);
  const addRow = (materialId, name) => {
    const n = mats.length;
    change((p) => assignMaterial(p, id, -1, materialId, inferRole(name)), NOW);
    requestAnimationFrame(() => focusField(`materials.${n}.role`));
  };

  return (
    <div className="space-y-3">
      {is3d && (
        <div className="flex items-start gap-2 rounded-xl bg-bp-tint border border-bp-line px-3 py-2 text-[11px] text-bp-muted">
          <Box className="w-3.5 h-3.5 mt-px shrink-0 text-bp-eyebrow" />
          AI 全屋立体图页 —— 重新生成请到「3D 立体图」；这里可以改标题、材料和说明。
        </div>
      )}

      <Section title="标题" icon={Type}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="房间">
            <input
              data-hl="title"
              data-field="room"
              list="bp-room-suggestions"
              className={inputCls}
              value={slide.room || ''}
              placeholder="客厅"
              onChange={(e) => set({ room: e.target.value })}
            />
          </Field>
          <Field label="视角名">
            <input
              data-field="title"
              className={inputCls}
              value={slide.subtitle || ''}
              placeholder="全景 / 电视柜…"
              onChange={(e) => set({ subtitle: e.target.value })}
            />
          </Field>
        </div>
        <datalist id="bp-room-suggestions">
          {rooms.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-bp-tint px-2.5 py-1.5">
          <span className="text-[11px] text-bp-faint shrink-0">页面标题</span>
          <span className="flex-1 min-w-0 truncate font-serif text-sm text-bp-ink">{viewTitleOf(slide)}</span>
          <button type="button" onClick={() => openPolish([id])} className={`${btnIcon} !w-auto px-1.5 gap-1 text-[11px]`} title="AI 看图改写这一页的视角名 / 英文 / 备注">
            <Sparkles className="w-3.5 h-3.5" />
            润色
          </button>
        </div>
        <Field label="英文小标题" className="mt-2.5" hint={`页面上自动转成大写，前面带楼层英文：${[floor?.en, (slide.roomEn || 'LIVING AREA').toUpperCase()].filter(Boolean).join(' · ')}`}>
          <input data-field="roomEn" className={inputCls} value={slide.roomEn || ''} placeholder="Living Area" onChange={(e) => set({ roomEn: e.target.value })} />
        </Field>
        <Field label="楼层" className="mt-2.5">
          <select className={inputCls} value={slide.floorId || ''} onChange={(e) => setNow({ floorId: e.target.value || null })}>
            <option value="">（不分楼层）</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {[f.zh, f.en].filter(Boolean).join(' · ') || '未命名楼层'}
              </option>
            ))}
            {slide.floorId && !floor && <option value={slide.floorId}>（楼层已删除）</option>}
          </select>
        </Field>
        {misplaced && (
          <button type="button" className={`${btnGhost} mt-2 w-full !justify-start`} onClick={() => { const fid = uid('s'); change((p) => moveToFloorEnd(p, id, fid), NOW); }}>
            <MoveRight className="w-3.5 h-3.5" />
            这一页现在排在别的楼层章节里 —— 移到「{floor.zh}」章节末尾
          </button>
        )}
      </Section>

      <Section title="版式" icon={LayoutTemplate}>
        <Segmented
          options={[
            { value: 'auto', label: '自动', title: '按图片比例和内容自动选' },
            { value: 'full', label: '满版', title: '整张效果图铺满，材料放右下角' },
            { value: 'framed', label: '框图', title: '左图右文' },
          ]}
          value={layoutValue}
          onChange={(v) => setNow({ layout: v })}
        />
        <p className="mt-1.5 text-[11px] text-bp-faint">
          {layoutValue === 'auto' ? `自动：现在是「${LAYOUT_LABEL[layout] || '—'}」。` : ''}
          {layout === 'full' ? '满版页右下最多放两行材料 / 说明，多了建议用框图。' : '框图：左边完整显示效果图，右边列材料与说明。'}
        </p>
      </Section>

      <Section title="效果图" icon={ImageIcon}>
        <ImageField
          project={project}
          src={slide.image}
          notify={notify}
          field="image"
          onChange={(src) => setNow({ image: src })}
          hint={slide.sourcePage ? `来自原稿第 ${slide.sourcePage} 页` : ''}
        />
      </Section>

      <Section title="材料" icon={Palette} right={<span className="text-[11px] text-bp-faint">{mats.length} 项</span>}>
        <datalist id="bp-role-suggestions">
          {ROLE_SUGGESTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="space-y-2">
          {mats.map((row, i) => (
            <div key={i} className="rounded-xl border border-bp-line bg-bp-tint/40 p-2 space-y-1.5">
              <div className="flex items-center gap-1">
                <input
                  data-field={`materials.${i}.role`}
                  list="bp-role-suggestions"
                  className={`${inputCls} !py-1 text-xs`}
                  value={row.role || ''}
                  placeholder="部位，如 柜体 & 柜门"
                  onChange={(e) => listOp('materials', (l) => listUpdate(l, i, { role: e.target.value }))}
                />
                <RowTools
                  i={i}
                  n={mats.length}
                  onMove={(k, d) => listNow('materials', (l) => listMove(l, k, d))}
                  onRemove={(k) => listNow('materials', (l) => listRemove(l, k))}
                  removeTitle="从这一页移除（材料清单里还在）"
                />
              </div>
              <MaterialPicker
                project={project}
                value={row.materialId}
                field={`materials.${i}`}
                notify={notify}
                onPick={(mid) => change((p) => assignMaterial(p, id, i, mid), NOW)}
                onCreate={(mat) => change((p) => addMaterialAndAssign(p, id, i, mat), NOW)}
              />
            </div>
          ))}
          <MaterialPicker
            project={project}
            addMode
            field="materials.add"
            notify={notify}
            onPick={(mid) => addRow(mid, (project.materials || []).find((m) => m.id === mid)?.name)}
            onCreate={(mat) => {
              const n = mats.length;
              change((p) => addMaterialAndAssign(p, id, -1, mat, inferRole(mat.name)), NOW);
              requestAnimationFrame(() => focusField(`materials.${n}.role`));
            }}
          />
        </div>
        {sameRoom.length > 0 && (
          <button
            type="button"
            className={`${btnGhost} mt-2.5 w-full !justify-start`}
            title={`覆盖同楼层「${slide.room}」其它 ${sameRoom.length} 页的材料清单`}
            onClick={() => {
              change((p) => copyMaterialsToRoom(p, id), NOW);
              notify?.({ type: 'ok', text: `已把材料复制到「${slide.room}」其它 ${sameRoom.length} 页` });
            }}
          >
            <CopyCheck className="w-3.5 h-3.5" />
            复制这组材料到「{slide.room}」其它 {sameRoom.length} 页
          </button>
        )}
      </Section>

      <Section title="说明 / 备注" icon={StickyNote} right={<span className="text-[11px] text-bp-faint">{notes.length} 条</span>}>
        <div className="space-y-2">
          {notes.map((n, i) => (
            <div key={i} className="rounded-xl border border-bp-line bg-bp-tint/40 p-2 space-y-1.5">
              <div className="flex items-center gap-1">
                <input
                  data-field={`notes.${i}.label`}
                  
                  className={`${inputCls} !py-1 text-xs`}
                  value={n.label || ''}
                  placeholder="标签，如 隐形门 · Hidden door"
                  onChange={(e) => listOp('notes', (l) => listUpdate(l, i, { label: e.target.value }))}
                />
                <RowTools
                  i={i}
                  n={notes.length}
                  onMove={(k, d) => listNow('notes', (l) => listMove(l, k, d))}
                  onRemove={(k) => listNow('notes', (l) => listRemove(l, k))}
                />
              </div>
              <AutoTextarea
                data-field={`notes.${i}.text`}
                
                value={n.text || ''}
                placeholder="说明文字，如 液压闭门器，配反弹器"
                onChange={(t) => listOp('notes', (l) => listUpdate(l, i, { text: t }))}
              />
            </div>
          ))}
          <button
            type="button"
            className={`${btnGhost} w-full !justify-start`}
            onClick={() => {
              const n = notes.length;
              listNow('notes', (l) => [...l, { label: '', text: '' }]);
              requestAnimationFrame(() => focusField(`notes.${n}.label`));
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            添加说明
          </button>
        </div>
      </Section>
    </div>
  );
}
