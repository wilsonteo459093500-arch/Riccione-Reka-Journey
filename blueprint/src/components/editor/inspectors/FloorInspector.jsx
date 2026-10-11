import React from 'react';
import { Layers, Image as ImageIcon, ListTree, TriangleAlert } from 'lucide-react';
import { findFloor } from '../../../engine/model.js';
import { floorRooms } from '../../../engine/deck.js';
import { roomsLines } from '../../../engine/layouts.js';
import { updateFloor, updateSlide, setFloorBackground, NOW } from '../ops.js';
import { Section, Field, inputCls } from '../ui.jsx';
import ImageField from '../ImageField.jsx';

// 楼层章节页：楼层中英文名（改的是 project.floors，整层所有页一起变）、背景图、空间清单（自动）。

export default function FloorInspector({ project, slide, change, notify }) {
  const floor = findFloor(project, slide.floorId);
  const floors = project.floors || [];

  if (!floor) {
    return (
      <Section title="楼层" icon={Layers}>
        <p className="flex items-start gap-1.5 text-xs text-bp-warn mb-2">
          <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" />
          这一页对应的楼层已经不存在，请重新选择：
        </p>
        <select className={inputCls} value="" onChange={(e) => e.target.value && change((p) => updateSlide(p, slide.id, { floorId: e.target.value }), NOW)}>
          <option value="">选择楼层…</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.zh || f.en || '未命名楼层'}
            </option>
          ))}
        </select>
      </Section>
    );
  }

  const rooms = floorRooms(project, floor.id);
  const shownLines = roomsLines(rooms);
  const shownCount = shownLines.join(' · ').split(' · ').filter(Boolean).length;
  const firstRender = (project.slides || []).find((s) => s.kind === 'view' && s.floorId === floor.id && s.image && s.enabled !== false)?.image || null;
  const explicit = slide.image || floor.image || null;
  const viewCount = (project.slides || []).filter((s) => s.kind === 'view' && s.floorId === floor.id).length;
  const setF = (patch) => change((p) => updateFloor(p, floor.id, patch));

  return (
    <div className="space-y-3">
      <Section title="楼层名称" icon={Layers}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="中文">
            <input data-field="floor.zh" className={inputCls} value={floor.zh || ''} placeholder="一楼" onChange={(e) => setF({ zh: e.target.value })} />
          </Field>
          <Field label="英文">
            <input data-field="floor.en" className={inputCls} value={floor.en || ''} placeholder="GROUND FLOOR" onChange={(e) => setF({ en: e.target.value })} />
          </Field>
        </div>
        <p className="mt-1.5 text-[11px] text-bp-faint leading-snug">
          改这里会同步到这一层的 {viewCount} 张效果图页（英文小标题、页脚）以及目录、方案封面。
        </p>
      </Section>

      <Section title="背景图" icon={ImageIcon}>
        <ImageField
          project={project}
          src={explicit}
          autoSrc={firstRender}
          autoLabel="自动"
          removeLabel="恢复自动"
          notify={notify}
          field="image"
          onChange={(src) => change((p) => setFloorBackground(p, slide.id, src), NOW)}
          hint="恢复自动 = 用这一层第一张效果图"
        />
      </Section>

      <Section title="空间清单（自动）" icon={ListTree}>
        {rooms.length ? (
          <div className="flex flex-wrap gap-1">
            {rooms.map((r, i) => (
              <span
                key={r}
                className={`px-2 py-0.5 rounded-full text-[11px] border ${
                  i < shownCount ? 'border-bp-line bg-bp-tint text-bp-ink' : 'border-dashed border-bp-line text-bp-faint line-through'
                }`}
              >
                {r}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-bp-faint">这一层还没有效果图页</p>
        )}
        <p className="mt-2 text-[11px] text-bp-faint leading-snug">
          按这一层效果图页的「房间」自动生成（隐藏的页不算）。要改名字，去对应的效果图页改房间名。
          {shownCount < rooms.length ? ` 右下角最多 3 行，划掉的放不下。` : ''}
        </p>
      </Section>
    </div>
  );
}
