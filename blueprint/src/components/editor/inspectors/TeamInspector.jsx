import React from 'react';
import { Users, ArrowUp, ArrowDown, X, Plus, ArrowUpRight } from 'lucide-react';
import { updateTeamMember, addTeamMember, removeTeamMember, moveTeamMember, teamVisibleIndices, NOW } from '../ops.js';
import { Section, inputCls, btnGhost, btnIcon } from '../ui.jsx';

// 本案服务团队：与「项目信息 → 服务团队」是同一份名单（project.info.team）。

export default function TeamInspector({ project, change, onGoTab }) {
  const team = project.info?.team || [];
  const visible = teamVisibleIndices(team);
  const visIdx = new Map(visible.map((orig, vis) => [orig, vis]));
  const set = (i, patch) => change((p) => updateTeamMember(p, i, patch));

  return (
    <Section title="本案服务团队" icon={Users} right={<span className="text-[11px] text-bp-faint">页面显示 {visible.length} 位</span>}>
      <p className="mb-3 text-[11px] text-bp-faint leading-snug">
        和「项目信息」里的服务团队是同一份名单；名字和职位都空着的不显示，最多 6 位。
        <button type="button" onClick={() => onGoTab?.('info')} className="inline-flex items-center text-bp-eyebrow font-medium hover:underline ml-1">
          去项目信息
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </p>
      <div className="space-y-2">
        {team.map((m, i) => {
          const vis = visIdx.get(i);
          const hl = (k) => (vis === undefined ? undefined : `team.${vis}.${k}`);
          return (
            <div key={i} className={`rounded-xl border p-2 space-y-1.5 ${vis === undefined ? 'border-dashed border-bp-line opacity-70' : 'border-bp-line bg-bp-tint/40'}`}>
              <div className="flex items-center gap-1">
                <input
                  data-field={`team.${i}.en`}
                  data-hl={hl('en')}
                  className={`${inputCls} !py-1 text-xs uppercase tracking-wider`}
                  value={m.en || ''}
                  placeholder="DESIGN"
                  onChange={(e) => set(i, { en: e.target.value })}
                />
                <div className="flex shrink-0">
                  <button type="button" className={btnIcon} disabled={i === 0} onClick={() => change((p) => moveTeamMember(p, i, -1), NOW)} title="上移">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" className={btnIcon} disabled={i === team.length - 1} onClick={() => change((p) => moveTeamMember(p, i, 1), NOW)} title="下移">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" className={`${btnIcon} hover:!text-bp-danger`} onClick={() => change((p) => removeTeamMember(p, i), NOW)} title="删除">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  data-field={`team.${i}.name`}
                  data-hl={hl('name')}
                  className={inputCls}
                  value={m.name || ''}
                  placeholder="名字"
                  onChange={(e) => set(i, { name: e.target.value })}
                />
                <input
                  data-field={`team.${i}.role`}
                  data-hl={hl('role')}
                  className={inputCls}
                  value={m.role || ''}
                  placeholder="职位，如 方案设计师"
                  onChange={(e) => set(i, { role: e.target.value })}
                />
              </div>
            </div>
          );
        })}
        <button type="button" className={`${btnGhost} w-full !justify-start`} onClick={() => change((p) => addTeamMember(p), NOW)}>
          <Plus className="w-3.5 h-3.5" />
          添加成员
        </button>
      </div>
    </Section>
  );
}
