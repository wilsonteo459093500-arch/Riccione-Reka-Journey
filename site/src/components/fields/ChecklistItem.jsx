// 检查项卡片：判定按钮 + 备注 + 照片（填写型项目则是输入框）
import { memo, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import PhotoStrip from './PhotoStrip.jsx';
import FieldInput from './FieldInput.jsx';
import { resolveScale } from '../../templates/schema.js';

const TONE_ON = {
  pass: 'bg-pass text-white ring-pass',
  fail: 'bg-fail text-white ring-fail',
  na: 'bg-ink-mute text-white ring-ink-mute',
  warn: 'bg-[#C98A1B] text-white ring-[#C98A1B]',
  neutral: 'bg-pine text-white ring-pine',
};
const TONE_EDGE = {
  pass: 'border-l-pass',
  fail: 'border-l-fail',
  na: 'border-l-ink-faint',
  warn: 'border-l-[#C98A1B]',
  neutral: 'border-l-pine',
};

function ChecklistItem({ section, item, answer, onChange, reportId, flagged }) {
  const a = answer || {};
  const scale = resolveScale(item.scale || section.scale);
  const opt = scale.options.find((o) => o.v === a.r);
  const ticks = scale.options.length === 1;
  const need = (section.remark?.requiredWhen || []).includes(a.r) && !(a.note || '').trim();
  const [showMore, setShowMore] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const noteOpen = showNote || !!(a.note || '').trim() || opt?.tone === 'fail' || need;
  const photos = a.photos || [];
  const [showPhotos, setShowPhotos] = useState(false);
  const photosOpen = showPhotos || photos.length > 0 || item.media;

  // 只传补丁，由编辑页合并进「最新」的答案（照片处理完时不会覆盖刚点的判定 / 备注）
  const set = (patch) => onChange(item.id, patch);
  const pick = (v) => set((prev) => ({ r: prev.r === v ? '' : v }));

  const hasMore = item.desc?.en || item.method || (item.desc?.zh || '').length > 46;

  return (
    <div
      id={`item-${item.id}`}
      className={`card scroll-mt-32 overflow-hidden border-l-4 ${opt ? TONE_EDGE[opt.tone] || 'border-l-pine' : 'border-l-transparent'} ${
        flagged ? 'ring-2 ring-fail/40' : ''
      }`}
    >
      <div className="p-3.5">
        {/* 标题行 */}
        <div className="flex items-start gap-2.5">
          {ticks ? (
            <button
              type="button"
              onClick={() => pick('Y')}
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-2 transition active:scale-90 ${
                a.r ? 'bg-pass text-white ring-pass' : 'bg-white ring-line'
              }`}
              aria-label="完成"
            >
              {a.r && <Icon name="Check" size={18} strokeWidth={3} />}
            </button>
          ) : (
            <span className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-cream-deep px-1.5 text-[12px] font-bold text-ink-soft">
              {item.no}
            </span>
          )}
          <div className="min-w-0 flex-1" onClick={ticks ? () => pick('Y') : undefined}>
            <div className="text-[15px] font-semibold leading-snug text-ink">
              {item.key && <span className="mr-1 text-terra">★</span>}
              {item.title?.zh || item.title?.en}
              {item.media && (
                <span className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-0.5 rounded-md bg-terra-soft px-1.5 py-0.5 align-middle text-[11px] font-semibold text-terra">
                  <Icon name="Camera" size={11} /> 影像
                </span>
              )}
            </div>
            {item.title?.zh && item.title?.en && <div className="mt-0.5 text-[12px] leading-snug text-ink-mute">{item.title.en}</div>}
            {item.desc?.zh && (
              <div className={`mt-1.5 text-[13px] leading-relaxed text-ink-soft ${showMore ? '' : 'line-clamp-2'}`}>{item.desc.zh}</div>
            )}
            {showMore && (
              <div className="mt-1 space-y-1 text-[12px] leading-relaxed text-ink-mute">
                {item.desc?.en && <div className="italic">{item.desc.en}</div>}
                {item.method && (
                  <div>
                    <span className="font-semibold text-ink-soft">检查方法：</span>
                    {item.method.zh}
                    {item.method.en && <span className="italic"> · {item.method.en}</span>}
                  </div>
                )}
              </div>
            )}
            {hasMore && (
              <button
                type="button"
                className="mt-1 text-[12px] font-semibold text-terra"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMore((s) => !s);
                }}
              >
                {showMore ? '收起' : '标准 / 方法'}
              </button>
            )}
          </div>
        </div>

        {/* 判定 / 填写 */}
        {item.input ? (
          <div className="mt-3">
            <FieldInput field={item.input} value={a.value} onChange={(v) => set((prev) => ({ value: typeof v === 'function' ? v(prev.value) : v }))} reportId={reportId} />
          </div>
        ) : (
          !ticks && (
            <div className="mt-3 flex gap-2">
              {scale.options.map((o) => {
                const on = a.r === o.v;
                return (
                  <button
                    type="button"
                    key={o.v}
                    onClick={() => pick(o.v)}
                    className={`min-h-[46px] flex-1 rounded-xl px-1 py-1.5 text-[15px] font-bold ring-1 transition active:scale-[0.96] ${
                      on ? TONE_ON[o.tone] || TONE_ON.neutral : 'bg-white text-ink-soft ring-line'
                    }`}
                  >
                    <div className="leading-tight">{o.zh}</div>
                    <div className={`text-[10px] font-medium leading-tight ${on ? 'text-white/80' : 'text-ink-faint'}`}>{o.en}</div>
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* 备注 */}
        {noteOpen && !item.input && (
          <div className="mt-3">
            <textarea
              className={`input min-h-[44px] resize-none py-2.5 text-[16px] leading-snug ${need ? 'border-fail ring-2 ring-fail/15' : ''}`}
              rows={2}
              value={a.note || ''}
              placeholder={need ? `必填：${section.remark?.label?.zh || '处理方案 / 负责人'}` : section.remark?.label?.zh || '备注'}
              onChange={(e) => set({ note: e.target.value })}
            />
            {need && <div className="mt-1 text-[12px] font-medium text-fail">判定为「{opt?.zh}」时要写明{section.remark?.label?.zh || '备注'}</div>}
          </div>
        )}

        {/* 照片 */}
        {photosOpen && (
          <div className="mt-3">
            <PhotoStrip ids={photos} onChange={(fn) => set((prev) => ({ photos: fn(prev.photos || []) }))} reportId={reportId} compact max={12} acceptVideo={!!item.media} />
          </div>
        )}

        {(!noteOpen || !photosOpen) && (
          <div className="mt-2.5 flex gap-4 text-[13px] font-semibold text-ink-mute">
            {!noteOpen && !item.input && (
              <button type="button" className="flex items-center gap-1 py-1 active:text-ink" onClick={() => setShowNote(true)}>
                <Icon name="PenLine" size={15} /> 备注
              </button>
            )}
            {!photosOpen && (
              <button type="button" className="flex items-center gap-1 py-1 active:text-ink" onClick={() => setShowPhotos(true)}>
                <Icon name="Camera" size={15} /> 照片
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ChecklistItem);
