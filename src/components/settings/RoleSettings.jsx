import { T } from '../../theme.js';
import { ROLE_CODES, DEFAULT_ROLE_LABELS } from '../../constants/team.js';

const COLOR_OPTIONS = [
  '#8B6F4E', '#5C7A4A', '#A8896B', '#6B5D4F',
  '#B8945E', '#C4543A', '#9C7A5A', '#2D3E36',
];

export default function RoleSettings({ team, onUpdate }) {
  const labels = team.roleLabels || DEFAULT_ROLE_LABELS;
  return (
    <div className="space-y-4">
      <div className="p-3 text-xs leading-relaxed" style={{ background: T.cream, color: T.inkSoft, borderRadius: '2px' }}>
        <div className="font-medium mb-1" style={{ color: T.ink }}>怎么用</div>
        把 SAIL 的 4 个岗位标签换成你们公司实际叫法。比如「销售设计」改成「设计师」、「现场主管」改成「项目经理」。颜色也可以选 — 影响项目卡上的标识颜色。
        <span className="block mt-1.5">改动只是标签的视觉换名 — 数据结构（SD / SS / WH / PU 4 个岗位）不变。</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ROLE_CODES.map((code) => {
          const meta = labels[code] || DEFAULT_ROLE_LABELS[code];
          return (
            <div
              key={code}
              className="p-4 space-y-3"
              style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: '2px' }}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs px-1.5 py-0.5" style={{ background: meta.color, color: T.paper, borderRadius: '2px' }}>
                  {code}
                </span>
                <span className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>不可改</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>
                  完整名称 / Full Label
                </label>
                <input
                  type="text"
                  value={meta.label}
                  onChange={(e) => onUpdate(code, { label: e.target.value })}
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>
                  短名 / Short Label
                </label>
                <input
                  type="text"
                  value={meta.short}
                  onChange={(e) => onUpdate(code, { short: e.target.value })}
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>
                  颜色 / Color
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => onUpdate(code, { color: c })}
                      className="transition-transform hover:scale-110"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: c,
                        border: meta.color === c ? `3px solid ${T.ink}` : `1px solid ${T.line}`,
                      }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
