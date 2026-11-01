import React from 'react';
import { Type, LayoutTemplate, Image as ImageIcon, Palette, StickyNote, ArrowUp, ArrowDown, X, Plus, Sparkles, CopyCheck, MoveRight, Box } from 'lucide-react';
import { findFloor, uid } from '../../../engine/model.js';
import { langOf } from '../../../engine/lang.js';
import { inferRole } from '../../../import/labels.js';
import { needsEnglish, roomEnState, viewTitlePreview, isLatinSource } from '../../../lib/langUi.js';
import {
  updateSlide, updateViewList, listMove, listRemove, listUpdate, assignMaterial, addMaterialAndAssign, sameRoomViews,
  copyMaterialsToRoom, viewTitleOf, roomSuggestions, floorContextOf, moveToFloorEnd, ROLE_SUGGESTIONS, NOW,
} from '../ops.js';
import { Section, Field, Segmented, AutoTextarea, inputCls, btnGhost, btnIcon } from '../ui.jsx';
import ImageField from '../ImageField.jsx';
import MaterialPicker from '../MaterialPicker.jsx';
import EnInput, { EnBox, EnAlias, EN_BADGE, EN_PLACEHOLDER } from '../EnInput.jsx';

// 效果图页：标题（房间 · 视角名）、空间英文名、楼层、版式、图片、材料、说明。
// English / 中英版：每个中文栏下面紧跟一个一样大的英文框（EN）—— 视角名、材料部位、材料名、备注写进翻译记忆（整套共用）；
// 空间英文名是这一页的 roomEn：华文版的页面上不印英文，这一栏只是先填好、给 English / 中英版用。

const LAYOUT_LABEL = { full: '满版大图', framed: '图文' };

// 与 EnInput 一致的小标（空间英文名用；它写的是这一页的 roomEn，不进翻译记忆）
const ROOM_BADGE = {
  field: { ...EN_BADGE.memory, title: '用的是这一页填的空间英文名（只改这一页）' },
  memory: { ...EN_BADGE.memory, title: '用的是翻译记忆里的英文（你填的或 AI 翻译的）；在这里填 = 只改这一页' },
  glossary: { ...EN_BADGE.glossary, title: '词典自动翻译；在这里填 = 只改这一页' },
  missing: EN_BADGE.missing,
};

/** 空间英文名（English / 中英版）：样子和 EnInput 一样，写这一页的 roomEn */
function RoomEnInput({ project, slide, onChange, className = '' }) {
  const st = roomEnState(project, slide);
  return (
    <EnBox
      className={className}
      field="roomEn"
      ariaLabel="空间英文名（只改这一页）"
      value={slide.roomEn || ''}
      placeholder={st.auto || (st.source === 'missing' ? EN_PLACEHOLDER : 'Living Area')}
      badge={ROOM_BADGE[st.source] || null}
      onChange={onChange}
    />
  );
}

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
  const lang = langOf(project);
  const en = needsEnglish(lang);
  const matName = (mid) => (project.materials || []).find((m) => m.id === mid)?.name || '';
  /** English / 中英版里这段字本来就是英文（没有 EN 框，画布上点英文落到中文框） */
  const latin = (text, kind) => en && isLatinSource(project, text, kind);
  const heading = en ? viewTitlePreview(project, slide) : null;

  const listOp = (name, fn) => change((p) => updateViewList(p, id, name, fn));
  const listNow = (name, fn) => change((p) => updateViewList(p, id, name, fn), NOW);
  const addRow = (materialId, name) => {
    const n = mats.length;
    change((p) => assignMaterial(p, id, -1, materialId, inferRole(name)), NOW);
    requestAnimationFrame(() => focusField(`materials.${n}.role`));
  };

  const roomInput = (
    <input
      data-hl="title"
      data-field="room"
      list="bp-room-suggestions"
      className={inputCls}
      value={slide.room || ''}
      placeholder="客厅"
      onChange={(e) => set({ room: e.target.value })}
    />
  );
  const titleInput = (
    <input
      data-field="title"
      className={inputCls}
      value={slide.subtitle || ''}
      placeholder="全景 / 电视柜…"
      onChange={(e) => set({ subtitle: e.target.value })}
    />
  );

  return (
    <div className="space-y-3">
      {is3d && (
        <div className="flex items-start gap-2 rounded-xl bg-bp-tint border border-bp-line px-3 py-2 text-[11px] text-bp-muted">
          <Box className="w-3.5 h-3.5 mt-px shrink-0 text-bp-eyebrow" />
          AI 全屋立体图页 —— 重新生成请到「3D 立体图」；这里可以改标题、材料和说明。
        </div>
      )}

      <Section title="标题" icon={Type}>
        {en ? (
          // English / 中英版：房间、视角名上下排，每个中文框下面紧跟它的英文
          <div className="space-y-2.5">
            <div>
              <Field label="房间">{roomInput}</Field>
              <RoomEnInput className="mt-1.5" project={project} slide={slide} onChange={(v) => set({ roomEn: v })} />
            </div>
            <div>
              <Field label="视角名">
                <EnAlias field="subtitleEn" on={latin(slide.subtitle, 'view')}>
                  {titleInput}
                </EnAlias>
              </Field>
              <EnInput className="mt-1.5" project={project} zh={slide.subtitle} kind="view" change={change} field="subtitleEn" />
            </div>
            <p className="text-[11px] text-bp-faint leading-snug">空间英文名只改这一页；视角名等其它英文整套共用，改一处，所有页一起变。</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="房间">{roomInput}</Field>
            <Field label="视角名">{titleInput}</Field>
          </div>
        )}
        <datalist id="bp-room-suggestions">
          {rooms.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className={`${en ? 'mt-2.5' : 'mt-2'} flex items-center gap-2 rounded-lg bg-bp-tint px-2.5 py-1.5`}>
          <span className="text-[11px] text-bp-faint shrink-0">页面标题</span>
          {heading ? (
            // 和页面上一样：English 版是英文标题（缺英文的那一半先用中文），中英版中文、英文各一行
            <span className="flex-1 min-w-0 font-serif text-sm text-bp-ink leading-snug" title={[heading.lang === 'bi' ? heading.zh : '', heading.en].filter(Boolean).join('\n')}>
              {heading.lang === 'bi' && <span className="block truncate">{heading.zh}</span>}
              {heading.en && (
                <span className="block truncate" lang="en">
                  {heading.en}
                </span>
              )}
            </span>
          ) : (
            <span className="flex-1 min-w-0 truncate font-serif text-sm text-bp-ink">{viewTitleOf(slide)}</span>
          )}
          <button type="button" onClick={() => openPolish([id])} className={`${btnIcon} !w-auto px-1.5 gap-1 text-[11px]`} title="AI 看图改写这一页的视角名 / 英文 / 备注">
            <Sparkles className="w-3.5 h-3.5" />
            润色
          </button>
        </div>
        {!en && (
          <Field label="空间英文名（English / 中英版用）" className="mt-2.5" hint="华文版页面上不显示；切到 English / 中英时用作空间名的英文（只改这一页）">
            <input data-field="roomEn" className={inputCls} value={slide.roomEn || ''} placeholder="Living Area" onChange={(e) => set({ roomEn: e.target.value })} />
          </Field>
        )}
        <Field label="楼层" className="mt-2.5">
          <select data-field="floor" className={inputCls} value={slide.floorId || ''} onChange={(e) => setNow({ floorId: e.target.value || null })}>
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
            { value: 'auto', label: '自动', title: '整套一起排：横图又不丢材料 / 说明才用满版' },
            { value: 'full', label: '满版大图', title: '效果图铺满整页，不放文字' },
            { value: 'framed', label: '图文', title: '大图 + 右栏文字' },
          ]}
          value={layoutValue}
          onChange={(v) => setNow({ layout: v })}
        />
        <p className="mt-1.5 text-[11px] text-bp-faint">
          {layoutValue === 'auto' ? `自动：现在是「${LAYOUT_LABEL[layout] || '—'}」。` : ''}
          {layout === 'full'
            ? '满版大图：效果图铺满整页，图上不放字 —— 这一页的材料、说明不显示（同空间下一页列出来就不算丢）。'
            : '图文：大图贴页边，右栏放楼层空间、视角名和材料；说明放在图下（放不下进右栏）。'}
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
          {mats.map((row, i) => {
            const roleInput = (
              <input
                data-field={`materials.${i}.role`}
                list="bp-role-suggestions"
                className={`${inputCls} !py-1 text-xs`}
                value={row.role || ''}
                placeholder="部位，如 柜体 & 柜门"
                onChange={(e) => listOp('materials', (l) => listUpdate(l, i, { role: e.target.value }))}
              />
            );
            return (
              <div key={i} className="rounded-xl border border-bp-line bg-bp-tint/40 p-2 space-y-1.5">
                <div className={`flex gap-1 ${en ? 'items-start' : 'items-center'}`}>
                  {en ? (
                    // 部位和它的英文一样宽（右边让出排序按钮）
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <EnAlias field={`materials.${i}.roleEn`} on={latin(row.role, 'role')}>
                        {roleInput}
                      </EnAlias>
                      <EnInput project={project} zh={row.role} kind="role" change={change} field={`materials.${i}.roleEn`} compact />
                    </div>
                  ) : (
                    roleInput
                  )}
                  <RowTools
                    i={i}
                    n={mats.length}
                    onMove={(k, d) => listNow('materials', (l) => listMove(l, k, d))}
                    onRemove={(k) => listNow('materials', (l) => listRemove(l, k))}
                    removeTitle="从这一页移除（材料清单里还在）"
                  />
                </div>
                <EnAlias field={`materials.${i}.nameEn`} on={latin(matName(row.materialId), 'material')}>
                  <MaterialPicker
                    project={project}
                    value={row.materialId}
                    field={`materials.${i}`}
                    notify={notify}
                    onPick={(mid) => change((p) => assignMaterial(p, id, i, mid), NOW)}
                    onCreate={(mat) => change((p) => addMaterialAndAssign(p, id, i, mat), NOW)}
                  />
                </EnAlias>
                {en && <EnInput project={project} zh={matName(row.materialId)} kind="material" change={change} field={`materials.${i}.nameEn`} />}
              </div>
            );
          })}
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
        {/* 说明的中文、英文多行框都按内容长高（AutoTextarea 自己量高度，检查器再窄也不藏字） */}
        <div className="space-y-2">
          {notes.map((n, i) => {
            const labelInput = (
              <input
                data-field={`notes.${i}.label`}
                className={`${inputCls} !py-1 text-xs`}
                value={n.label || ''}
                placeholder="标签，如 隐形门 · Hidden door"
                onChange={(e) => listOp('notes', (l) => listUpdate(l, i, { label: e.target.value }))}
              />
            );
            return (
              <div key={i} className="rounded-xl border border-bp-line bg-bp-tint/40 p-2 space-y-1.5">
                <div className={`flex gap-1 ${en ? 'items-start' : 'items-center'}`}>
                  {en ? (
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <EnAlias field={`notes.${i}.labelEn`} on={latin(n.label, 'label')}>
                        {labelInput}
                      </EnAlias>
                      <EnInput project={project} zh={n.label} kind="label" change={change} field={`notes.${i}.labelEn`} compact />
                    </div>
                  ) : (
                    labelInput
                  )}
                  <RowTools
                    i={i}
                    n={notes.length}
                    onMove={(k, d) => listNow('notes', (l) => listMove(l, k, d))}
                    onRemove={(k) => listNow('notes', (l) => listRemove(l, k))}
                  />
                </div>
                <EnAlias field={`notes.${i}.textEn`} on={latin(n.text, 'note')}>
                  <AutoTextarea
                    data-field={`notes.${i}.text`}
                    value={n.text || ''}
                    placeholder="说明文字，如 液压闭门器，配反弹器"
                    onChange={(t) => listOp('notes', (l) => listUpdate(l, i, { text: t }))}
                  />
                </EnAlias>
                {en && <EnInput project={project} zh={n.text} kind="note" change={change} field={`notes.${i}.textEn`} multiline />}
              </div>
            );
          })}
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
