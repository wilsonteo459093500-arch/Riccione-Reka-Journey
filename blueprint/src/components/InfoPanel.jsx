// 项目信息：客户 / 地点 / 日期 / 方案名 → 自动填进公司封面、方案封面、目录；服务团队；楼层名称；方案章节显示开关；
// 提案语言（华文 / English / 中英）—— English / 中英版时，标题、客户、地点、团队职位下面多一个英文输入框（写进翻译记忆）

import React, { useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, CalendarDays, Users, Layers, ListChecks, FileText, RotateCcw, Languages } from 'lucide-react';
import { DEFAULT_TEAM } from '../engine/model.js';
import { TEAM_MAX } from '../engine/b/design.js';
import { designCoverTexts, sectionLabel } from '../engine/deck.js';
import { deckChapters } from '../engine/b/company.js';
import { langOf } from '../engine/lang.js';
import { TOGGLE_SECTIONS, sectionState, setSectionEnabled, kindState, setKindEnabled } from '../lib/project.js';
import { formatDay } from '../lib/format.js';
import { LANG_OPTIONS, LANG_HINTS, needsEnglish } from '../lib/langUi.js';
import { cls } from '../lib/ui.jsx';
import { setLang, NOW } from './editor/ops.js';
import { Segmented } from './editor/ui.jsx';
import EnInput from './editor/EnInput.jsx';

const MAX_TEAM = TEAM_MAX;

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

/** 带标签的一栏；en = 下面跟着的英文输入框（放在 label 外面，点它不会跳回中文框） */
function Field({ label, hint, children, en }) {
  return (
    <div>
      <label className="block">
        <span className={cls.label}>{label}</span>
        <div className="mt-1">{children}</div>
      </label>
      {en && <div className="mt-1.5">{en}</div>}
      {hint && <span className="block mt-1 text-[11px] text-bp-faint leading-snug">{hint}</span>}
    </div>
  );
}

/** 提案语言：华文 / English / 中英，每种一句说明 */
function LangCard({ lang, onLang }) {
  return (
    <Card icon={Languages} title="提案语言" hint="整套提案用哪种语言；导出时也可以另选一种语言导出">
      <Segmented options={LANG_OPTIONS} value={lang} onChange={(v) => v !== lang && onLang(v)} />
      <dl className="mt-3.5 space-y-1.5">
        {LANG_OPTIONS.map((o) => {
          const on = o.value === lang;
          return (
            <div key={o.value} className={`flex gap-3 text-xs leading-snug ${on ? 'text-bp-ink' : 'text-bp-faint'}`}>
              <dt className={`w-14 shrink-0 ${on ? 'font-medium' : ''}`}>{o.label}</dt>
              <dd className="min-w-0">{LANG_HINTS[o.value]}</dd>
            </div>
          );
        })}
      </dl>
      {lang !== 'zh' && (
        <p className="mt-3.5 pt-3 border-t border-bp-line text-[11px] text-bp-muted leading-relaxed">
          英文取自翻译记忆和词典：各栏下面的 <span className="text-[9px] font-semibold tracking-[0.12em] text-bp-faint">EN</span>{' '}
          框可以直接改；整套缺英文的地方，在「页面」顶栏点「AI 翻译」一次补齐。
        </p>
      )}
    </Card>
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
  const autoCover = designCoverTexts({ ...project, info: { ...info, coverTitle: '', coverSubtitle: '' } });
  const lang = langOf(project);
  const en = needsEnglish(lang);
  // 章节开关的编号跟着整套走（隐藏了品牌，公司就是 01）；隐藏的那一章不编号
  const chapters = deckChapters(project);
  // 团队名单的列：名字 · 职位（English / 中英版职位下面多一个英文框，职位那一列放宽）· 排序
  const teamCols = en ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]';
  /** 英文输入框（English / 中英版才有；中文本来就是英文时 EnInput 自己不显示）：和中文框一样大（cls.input） */
  const enFor = (zh, kind = 'text', inputClass = '') =>
    en ? <EnInput project={project} zh={zh} kind={kind} change={onChange} size="md" inputClass={inputClass} /> : null;

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
            这里填的内容会自动用在公司封面、方案封面、目录和服务团队页上 —— 改一次，整套同步。
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
          {/* 左栏 */}
          <div className="space-y-5 min-w-0">
            <Card
              icon={FileText}
              title="客户与方案"
              hint={`封面大标题：${[info.client, info.location].map((x) => (x || '').trim()).filter(Boolean).join(' / ') || '客户 / 地点'}（两行）`}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="客户" en={enFor(info.client)}>
                  <input className={cls.input} value={info.client || ''} onChange={(e) => setInfo({ client: e.target.value })} placeholder="如：Mr Lau" />
                </Field>
                <Field label="地点" en={enFor(info.location)}>
                  <input className={cls.input} value={info.location || ''} onChange={(e) => setInfo({ location: e.target.value })} placeholder="如：Muar" />
                </Field>
                <Field label="日期" hint="显示在公司封面的方案名下面（二〇二六年八月 / August 2026）">
                  <div className="flex gap-2">
                    <input className={cls.input} value={info.date || ''} onChange={(e) => setInfo({ date: e.target.value })} placeholder="2026 · 08" />
                    <button type="button" onClick={() => setInfo({ date: thisMonth() })} className={`${cls.btnGhost} shrink-0 !px-2.5`} title="填入本月">
                      <CalendarDays size={15} /> 本月
                    </button>
                  </div>
                </Field>
                <Field label="方案标题" hint="公司封面大标题（客户与地点）下面的那一行" en={enFor(info.proposalTitle || '全屋定制设计方案')}>
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
                <Field label="大标题" en={enFor(info.coverTitle)}>
                  <input
                    className={cls.input}
                    value={info.coverTitle || ''}
                    onChange={(e) => setInfo({ coverTitle: e.target.value })}
                    placeholder={autoCover.title.replace(/\n/g, ' · ')}
                  />
                </Field>
                <Field label="副标题（留空 = 楼层）" en={enFor(info.coverSubtitle)}>
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
              hint={`生成「本案团队」页：有人填了名字时只放填了名字的（一个都没有时先列职位），最多 ${MAX_TEAM} 位（7 位起排两排）`}
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
                  <div className={`hidden sm:grid ${teamCols} gap-2 px-1 text-[11px] text-bp-faint`}>
                    <span>名字</span>
                    <span>{en ? '中文职位 · 英文' : '中文职位'}</span>
                    <span className="w-[100px]" />
                  </div>
                  {team.map((m, i) => (
                    <div
                      key={i}
                      className={`grid grid-cols-2 ${teamCols} gap-2 ${en ? 'items-start' : 'items-center'} rounded-xl sm:rounded-none bg-bp-tint/60 sm:bg-transparent p-2 sm:p-0`}
                    >
                      <input
                        className={`${cls.input} font-serif`}
                        value={m.name || ''}
                        onChange={(e) => setMember(i, { name: e.target.value })}
                        placeholder="名字"
                        aria-label={`第 ${i + 1} 位 · 名字`}
                      />
                      <div className="min-w-0 space-y-1.5">
                        <input
                          className={cls.input}
                          value={m.role || ''}
                          onChange={(e) => setMember(i, { role: e.target.value })}
                          placeholder={DEFAULT_TEAM[i]?.role || '职位'}
                          aria-label={`第 ${i + 1} 位 · 中文职位`}
                        />
                        {enFor(m.role, 'team')}
                      </div>
                      <div className={`col-span-2 sm:col-span-1 flex items-center justify-end gap-0.5 w-full sm:w-[100px] ${en ? 'sm:pt-[3px]' : ''}`}>
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
            <LangCard lang={lang} onLang={(v) => onChange((p) => setLang(p, v), NOW)} />

            <Card icon={ListChecks} title="方案章节显示" hint="老客户已经了解品牌和公司时，可以隐藏这些介绍页（不导出，随时可以再打开）">
              <div className="space-y-2">
                {TOGGLE_SECTIONS.map((s) => (
                  <TriCheck
                    key={s.id}
                    label={sectionLabel(s.id, chapters)}
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
              <p className="mt-3 text-[11px] text-bp-faint leading-relaxed">隐藏的章节不进目录，后面章节的编号（目录、章节页、方案封面）自动往前排。</p>
            </Card>

            {floors.length > 0 && (
              <Card icon={Layers} title="楼层" hint="楼层章节页、效果图页标签（一楼　客厅）、目录和方案封面上的楼层名">
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
