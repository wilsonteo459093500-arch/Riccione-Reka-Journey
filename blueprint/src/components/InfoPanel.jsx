// 项目信息：客户 / 地点 / 日期 / 标题 → 自动填进公司封面、方案封面、页脚；服务团队；楼层名称；方案章节显示开关

import React, { useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, CalendarDays, Users, Layers, ListChecks, FileText, RotateCcw } from 'lucide-react';
import { DEFAULT_TEAM, clientLine } from '../engine/model.js';
import { coverTexts } from '../engine/layouts.js';
import { TOGGLE_SECTIONS, sectionState, setSectionEnabled, kindState, setKindEnabled } from '../lib/project.js';
import { formatDay } from '../lib/format.js';
import { cls } from '../lib/ui.jsx';

const MAX_TEAM = 6;

function Card({ icon: Icon, title, hint, children, right }) {
  return (
    <section className={`${cls.card} p-5`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-bp-ink">
            {Icon && <Icon size={15} className="text-bp-gold" />}
            {title}
          </h3>
          {hint && <p className="mt-0.5 text-xs text-bp-faint leading-relaxed">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className={cls.label}>{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block mt-1 text-[11px] text-bp-faint leading-snug">{hint}</span>}
    </label>
  );
}

/** 三态复选框（部分隐藏 = indeterminate） */
function TriCheck({ state, onChange, label, hint }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed';
  }, [state]);
  const disabled = state === 'none';
  return (
    <label className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${disabled ? 'opacity-50 border-bp-line' : state === 'off' ? 'border-bp-line bg-bp-tint/60' : 'border-bp-line bg-white hover:border-bp-rule'} ${disabled ? '' : 'cursor-pointer'}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={state === 'on'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[#B8995A] shrink-0"
      />
      <span className="min-w-0">
        <span className={`block text-sm ${state === 'off' ? 'text-bp-faint line-through decoration-bp-rule' : 'text-bp-ink'}`}>{label}</span>
        <span className="block text-[11px] text-bp-faint leading-snug mt-0.5">
          {state === 'mixed' ? '部分页面已隐藏 · ' : state === 'none' ? '整套里没有这部分 · ' : ''}
          {hint}
        </span>
      </span>
    </label>
  );
}

export default function InfoPanel({ project, onChange }) {
  const info = project.info || {};
  const team = Array.isArray(info.team) ? info.team : [];
  const floors = project.floors || [];
  const autoCover = coverTexts({ ...project, info: { ...info, coverTitle: '', coverSubtitle: '' } });

  const setInfo = (patch) => onChange((p) => ({ ...p, info: { ...p.info, ...patch } }));
  const setTeam = (fn) => onChange((p) => ({ ...p, info: { ...p.info, team: fn(Array.isArray(p.info?.team) ? p.info.team : []) } }));
  const setMember = (i, patch) => setTeam((t) => t.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const moveMember = (i, d) =>
    setTeam((t) => {
      const j = i + d;
      if (j < 0 || j >= t.length) return t;
      const next = [...t];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const setFloor = (id, patch) => onChange((p) => ({ ...p, floors: (p.floors || []).map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  const thisMonth = () => {
    const d = new Date();
    return `${d.getFullYear()} · ${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <div className="h-full overflow-y-auto thin-scroll">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <div className={cls.eyebrow}>Project Info</div>
          <h2 className="font-serif text-2xl text-bp-ink mt-1">项目信息</h2>
          <p className="mt-1.5 text-xs text-bp-muted max-w-3xl leading-relaxed">
            这里填的内容会自动用在公司封面、方案封面、页脚和服务团队页上 —— 改一次，整套同步。
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
          {/* 左栏 */}
          <div className="space-y-5 min-w-0">
            <Card icon={FileText} title="客户与方案" hint={`公司封面显示为「${clientLine(info) || '地点 · 客户'}」`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="客户">
                  <input className={cls.input} value={info.client || ''} onChange={(e) => setInfo({ client: e.target.value })} placeholder="如：Mr Lau" />
                </Field>
                <Field label="地点">
                  <input className={cls.input} value={info.location || ''} onChange={(e) => setInfo({ location: e.target.value })} placeholder="如：Muar" />
                </Field>
                <Field label="日期" hint="显示在公司封面右下角">
                  <div className="flex gap-2">
                    <input className={cls.input} value={info.date || ''} onChange={(e) => setInfo({ date: e.target.value })} placeholder="2026 · 08" />
                    <button type="button" onClick={() => setInfo({ date: thisMonth() })} className={`${cls.btnGhost} shrink-0 !px-2.5`} title="填入本月">
                      <CalendarDays size={15} /> 本月
                    </button>
                  </div>
                </Field>
                <Field label="方案标题" hint="公司封面的大标题">
                  <input
                    className={cls.input}
                    value={info.proposalTitle || ''}
                    onChange={(e) => setInfo({ proposalTitle: e.target.value })}
                    placeholder="全屋定制设计方案"
                  />
                </Field>
              </div>
            </Card>

            <Card icon={FileText} title="方案封面（Material Board 页）" hint="留空 = 自动生成；设了 Material Board 封面后才会用到">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="大标题">
                  <input className={cls.input} value={info.coverTitle || ''} onChange={(e) => setInfo({ coverTitle: e.target.value })} placeholder={autoCover.title} />
                </Field>
                <Field label="副标题（英文，自动大写）">
                  <input
                    className={cls.input}
                    value={info.coverSubtitle || ''}
                    onChange={(e) => setInfo({ coverSubtitle: e.target.value })}
                    placeholder={autoCover.subtitle}
                  />
                </Field>
              </div>
            </Card>

            <Card
              icon={Users}
              title="本案服务团队"
              hint="生成「本案服务团队」页；名字和职位都空着的一栏不显示，最多 6 位"
              right={
                <div className="flex items-center gap-1.5 shrink-0">
                  {!team.length && (
                    <button type="button" onClick={() => setTeam(() => DEFAULT_TEAM.map((m) => ({ ...m })))} className={cls.btnGhost}>
                      <RotateCcw size={14} /> 默认角色
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTeam((t) => (t.length >= MAX_TEAM ? t : [...t, { en: '', name: '', role: '' }]))}
                    disabled={team.length >= MAX_TEAM}
                    className={cls.btnGhost}
                  >
                    <Plus size={14} /> 加一位
                  </button>
                </div>
              }
            >
              {team.length ? (
                <div className="space-y-2">
                  <div className="hidden sm:grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] gap-2 px-1 text-[11px] text-bp-faint">
                    <span>英文职能（页上小字）</span>
                    <span>名字</span>
                    <span>中文职位</span>
                    <span className="w-[100px]" />
                  </div>
                  {team.map((m, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] gap-2 items-center rounded-xl sm:rounded-none bg-bp-tint/60 sm:bg-transparent p-2 sm:p-0">
                      <input
                        className={`${cls.input} uppercase tracking-wider text-xs`}
                        value={m.en || ''}
                        onChange={(e) => setMember(i, { en: e.target.value })}
                        placeholder={DEFAULT_TEAM[i]?.en || 'ROLE'}
                        aria-label={`第 ${i + 1} 位 · 英文职能`}
                      />
                      <input
                        className={`${cls.input} font-serif`}
                        value={m.name || ''}
                        onChange={(e) => setMember(i, { name: e.target.value })}
                        placeholder="名字"
                        aria-label={`第 ${i + 1} 位 · 名字`}
                      />
                      <input
                        className={cls.input}
                        value={m.role || ''}
                        onChange={(e) => setMember(i, { role: e.target.value })}
                        placeholder={DEFAULT_TEAM[i]?.role || '职位'}
                        aria-label={`第 ${i + 1} 位 · 中文职位`}
                      />
                      <div className="flex items-center justify-end gap-0.5 w-full sm:w-[100px]">
                        <button type="button" onClick={() => moveMember(i, -1)} disabled={i === 0} className={cls.iconBtn} aria-label="上移" title="上移">
                          <ChevronUp size={15} />
                        </button>
                        <button type="button" onClick={() => moveMember(i, 1)} disabled={i === team.length - 1} className={cls.iconBtn} aria-label="下移" title="下移">
                          <ChevronDown size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTeam((t) => t.filter((_, j) => j !== i))}
                          className={`${cls.iconBtn} hover:!text-bp-danger`}
                          aria-label="移除"
                          title="移除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-bp-faint">还没有成员 —— 点「默认角色」或「加一位」。</div>
              )}
            </Card>
          </div>

          {/* 右栏 */}
          <div className="space-y-5 min-w-0">
            <Card icon={ListChecks} title="方案章节显示" hint="老客户已经了解品牌和公司时，可以隐藏这些介绍页（不导出，随时可以再打开）">
              <div className="space-y-2">
                {TOGGLE_SECTIONS.map((s) => (
                  <TriCheck
                    key={s.id}
                    label={s.label}
                    hint={s.hint}
                    state={sectionState(project, s.id)}
                    onChange={(on) => onChange((p) => setSectionEnabled(p, s.id, on))}
                  />
                ))}
                <TriCheck
                  label="本案材料页"
                  hint="材料色板总览"
                  state={kindState(project, 'materials')}
                  onChange={(on) => onChange((p) => setKindEnabled(p, 'materials', on))}
                />
                <TriCheck
                  label="本案服务团队页"
                  hint="按左边的团队名单生成"
                  state={kindState(project, 'team')}
                  onChange={(on) => onChange((p) => setKindEnabled(p, 'team', on))}
                />
              </div>
              <p className="mt-3 text-[11px] text-bp-faint leading-relaxed">隐藏章节后，记得到「页面 → 目录」里把目录文字也改一下。</p>
            </Card>

            {floors.length > 0 && (
              <Card icon={Layers} title="楼层" hint="楼层章节页和效果图页角标上的名字">
                <div className="space-y-2">
                  {floors.map((f) => (
                    <div key={f.id} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
                      <input
                        className={`${cls.input} font-serif`}
                        value={f.zh || ''}
                        onChange={(e) => setFloor(f.id, { zh: e.target.value })}
                        placeholder="一楼"
                        aria-label="楼层中文名"
                      />
                      <input
                        className={`${cls.input} uppercase tracking-wider text-xs`}
                        value={f.en || ''}
                        onChange={(e) => setFloor(f.id, { en: e.target.value })}
                        placeholder="GROUND FLOOR"
                        aria-label="楼层英文名"
                      />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card icon={FileText} title="原稿">
              <dl className="text-xs space-y-2">
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-bp-faint">来源文件</dt>
                  <dd className="min-w-0 text-bp-ink break-all">{info.sourceFile || '—'}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-bp-faint">原稿页数</dt>
                  <dd className="text-bp-ink">{(project.pages || []).length || '—'}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-bp-faint">创建于</dt>
                  <dd className="text-bp-ink">{formatDay(project.createdAt) || '—'}</dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
