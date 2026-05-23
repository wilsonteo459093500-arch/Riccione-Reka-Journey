import { FileText, CalendarDays, Printer } from 'lucide-react';
import { T } from '../theme.js';
import { STAGES, OWNERS } from '../constants/stages.js';
import { FORMS, formTotal } from '../constants/forms.js';
import { useT } from '../i18n/LangProvider.jsx';

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];
const CN_NUM = ['一', '二', '三', '四', '五', '六'];

const CONVICTIONS = {
  cn: [
    { num: '一', title: '家是旅程, 不是终点', body: '从客户走进展厅 (V) 到验收落款 (H), 每一章节都是深化信任的机会。家不是产品, 而是关系。' },
    { num: '二', title: '纪律胜过英雄主义', body: '每个章节都有 Gate。不通过, 不进入下一章。这不是官僚 — 这是确保没有任何环节被漏掉。' },
    { num: '三', title: '透明是我们的护城河', body: '项目进展全员可见。设计师、现场主管、仓储、采购 — 大家在同一份方法论上协作。' },
  ],
  en: [
    { num: 'I',   title: 'Home is a journey, not a destination', body: 'From showroom (V) to sign-off (H), every chapter deepens trust. We sell a relationship, not a product.' },
    { num: 'II',  title: 'Discipline beats heroics', body: 'Every chapter has a gate. No pass, no next chapter. Not bureaucracy — this is how nothing falls through the cracks.' },
    { num: 'III', title: 'Transparency is our moat', body: 'Project progress visible to all. Designer, supervisor, warehouse, purchasing — collaborating on one shared playbook.' },
  ],
};

export default function MethodView() {
  const { t, lang } = useT();

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-16 fade-up">
      {/* Cover */}
      <div className="text-center mb-16">
        <div className="text-xs tracking-[0.4em] uppercase mb-4" style={{ color: T.wood }}>{t('method_brand')}</div>
        <h1 className="font-display text-6xl lg:text-7xl mb-2 leading-none" style={{ color: T.ink }}>V · SMOOTH</h1>
        <h2 className="font-display italic text-2xl mb-6" style={{ color: T.inkSoft }}>
          {lang === 'cn' ? '从洞察到交付的六章节承诺' : 'Six Chapters from Vision to Handover'}
        </h2>
        <div className="ink-divider max-w-xs mx-auto" />
      </div>

      {/* Philosophy section — V-SMOOTH manifesto */}
      <div className="mb-20 space-y-10">
        {/* Opening manifesto */}
        <div>
          <div className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: T.wood }}>
            {lang === 'cn' ? '我们的信念 · The Conviction' : 'The Conviction · 我们的信念'}
          </div>
          {lang === 'cn' ? (
            <>
              <p className="font-display text-2xl leading-relaxed mb-4" style={{ color: T.ink }}>
                我们相信, 全屋定制不是一次买卖, 而是一场为期数月的承诺。
              </p>
              <p className="text-base leading-relaxed" style={{ color: T.inkSoft }}>
                <span className="font-display italic" style={{ color: T.ink }}>V-SMOOTH</span> 是 SAIL 的签名交付方法论 —
                六个章节的承诺, 把混乱的定制过程变成可预测、可追踪、可信任的旅程。
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl leading-relaxed mb-4" style={{ color: T.ink }}>
                Whole-home customization is not a transaction. It is a months-long promise.
              </p>
              <p className="text-base leading-relaxed" style={{ color: T.inkSoft }}>
                <span className="font-display italic" style={{ color: T.ink }}>V-SMOOTH</span> is SAIL's signature delivery methodology —
                a six-chapter promise that transforms the chaos of customization into a predictable, transparent, trusted journey.
              </p>
            </>
          )}
        </div>

        {/* Why this exists */}
        <div className="p-6" style={{ background: T.cream, borderLeft: `3px solid ${T.terra}`, borderRadius: '2px' }}>
          {lang === 'cn' ? (
            <>
              <div className="font-display text-lg mb-2" style={{ color: T.ink }}>为什么我们做这件事</div>
              <p className="text-sm leading-relaxed" style={{ color: T.inkSoft }}>
                大多数定制品牌只关心设计阶段。设计图签了之后就丢给工厂, 出了问题再道歉。
                <span style={{ color: T.ink }}> 我们不一样。</span> 从客户走进展厅那一刻起, 到最后验收落款,
                每一个动作我们都用同一套语言、同一套表单、同一套 Gate 来管理。
              </p>
            </>
          ) : (
            <>
              <div className="font-display text-lg mb-2" style={{ color: T.ink }}>Why we built this</div>
              <p className="text-sm leading-relaxed" style={{ color: T.inkSoft }}>
                Most custom brands obsess over the design and then drop the project at the factory door.
                <span style={{ color: T.ink }}> We don't.</span> From the moment a client walks into our showroom
                through final sign-off, every step is choreographed in one shared playbook — same language, same forms, same gates.
              </p>
            </>
          )}
        </div>

        {/* Three convictions */}
        <div>
          <div className="text-xs tracking-[0.3em] uppercase mb-4" style={{ color: T.wood }}>
            {lang === 'cn' ? '三个信念 · Three Convictions' : 'Three Convictions · 三个信念'}
          </div>
          <div className="space-y-4">
            {CONVICTIONS[lang].map((c) => (
              <div key={c.num} className="flex gap-5">
                <div className="font-display text-4xl leading-none flex-shrink-0" style={{ color: T.wood, width: 50 }}>{c.num}</div>
                <div>
                  <div className="font-display text-xl mb-1" style={{ color: T.ink }}>{c.title}</div>
                  <p className="text-sm leading-relaxed" style={{ color: T.inkSoft }}>{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Acronym decoded */}
        <div className="p-6" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
          <div className="text-xs tracking-[0.3em] uppercase mb-4" style={{ color: T.gold }}>
            {lang === 'cn' ? 'V-SMOOTH 拆解 · Decoded' : 'V-SMOOTH Decoded · 拆解'}
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-3xl" style={{ color: T.gold, width: 36 }}>V</span>
              <span className="font-display text-lg" style={{ color: T.paper }}>= Vision</span>
              <span className="text-sm opacity-70">— {lang === 'cn' ? '我们先聆听, 再设计 (定金前)' : 'we listen before we design (pre-deposit)'}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-3xl" style={{ color: T.gold, width: 36 }}>+</span>
              <span className="font-display text-lg" style={{ color: T.paper }}>SMOOTH</span>
              <span className="text-sm opacity-70">— {lang === 'cn' ? '定金后的五部曲' : 'the post-deposit choreography'}</span>
            </div>
            <div className="ml-12 mt-3 grid grid-cols-1 lg:grid-cols-5 gap-2 text-xs opacity-90">
              <div><span className="font-display text-lg" style={{ color: T.gold }}>S</span> Start · 启动</div>
              <div><span className="font-display text-lg" style={{ color: T.gold }}>M</span> Make · 匠造</div>
              <div><span className="font-display text-lg" style={{ color: T.gold }}>O</span> Onsite · 就位</div>
              <div><span className="font-display text-lg" style={{ color: T.gold }}>T</span> Tackle · 安装</div>
              <div><span className="font-display text-lg" style={{ color: T.gold }}>H</span> Handover · 交付</div>
            </div>
          </div>
        </div>

        {/* Two audiences */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5" style={{ background: T.cream, borderRadius: '2px' }}>
            <div className="text-xs tracking-[0.3em] uppercase mb-2" style={{ color: T.wood }}>
              {lang === 'cn' ? '给员工 · For Staff' : 'For Staff · 给员工'}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: T.ink }}>
              {lang === 'cn' ? (
                <>V-SMOOTH 是你的<span className="font-display italic">操作系统</span>。每章节有框架 (BOND / 4S / 3M / 5O / 5T / 5H), 每框架有 Gate, 每 Gate 有表单。你不用记住所有细节 — 系统帮你记。</>
              ) : (
                <>V-SMOOTH is your <span className="font-display italic">operating system</span>. Each chapter has a framework (BOND / 4S / 3M / 5O / 5T / 5H), each framework has gates, each gate has a form. You don't memorize details — the system holds them for you.</>
              )}
            </p>
          </div>
          <div className="p-5" style={{ background: T.cream, borderRadius: '2px' }}>
            <div className="text-xs tracking-[0.3em] uppercase mb-2" style={{ color: T.wood }}>
              {lang === 'cn' ? '给客户 · For Clients' : 'For Clients · 给客户'}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: T.ink }}>
              {lang === 'cn' ? (
                <>V-SMOOTH 是你的<span className="font-display italic">保障</span>。你买的不是家具, 而是由数百次实战打磨出的六章节体验。每一道 Gate 关上, 你才看到下一步。</>
              ) : (
                <>V-SMOOTH is your <span className="font-display italic">guarantee</span>. You're not buying furniture. You're buying a six-chapter experience refined through hundreds of installations. Each gate closes before the next opens.</>
              )}
            </p>
          </div>
        </div>

        {/* Chapter overview transition */}
        <div className="text-center pt-8" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
          <div className="text-xs tracking-[0.3em] uppercase" style={{ color: T.inkSoft }}>
            {lang === 'cn' ? '以下是六个章节的完整说明' : 'The six chapters, in detail'}
          </div>
          <div className="font-display text-3xl mt-3" style={{ color: T.ink }}>↓</div>
        </div>
      </div>

      {/* Chapters */}
      <div className="space-y-20">
        {STAGES.map((s, i) => (
          <article key={s.code} className="fade-up" style={{ animationDelay: `${0.05 * i}s` }}>
            <div className="flex items-baseline gap-6 mb-6 flex-wrap">
              <div className="stage-roman font-display text-7xl leading-none" style={{ color: T.wood }}>{ROMAN[i]}</div>
              <div>
                <div className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: T.inkSoft }}>
                  Chapter {i + 1} · 第{CN_NUM[i]}章 · <span style={{ color: T.gold }}>{s.code}</span>
                </div>
                <h2 className="font-display text-5xl leading-none" style={{ color: T.ink }}>{s.name}</h2>
                <div className="font-display text-2xl italic mt-1" style={{ color: T.wood }}>{s.nameCN}</div>
              </div>
            </div>

            <div className="mb-6 pl-0 lg:pl-2 border-l-2" style={{ borderColor: T.wood }}>
              <p className="font-display italic text-xl leading-snug pl-4" style={{ color: T.ink }}>"{s.tagline}"</p>
              <p className="text-sm pl-4 mt-2" style={{ color: T.inkSoft }}>{s.taglineCN}</p>
            </div>

            <div className="p-5 mb-2" style={{ background: T.cream, borderRadius: '2px' }}>
              <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                <div className="text-xs uppercase tracking-wider" style={{ color: T.inkSoft }}>
                  Internal Framework · 内部操作框架
                </div>
                <div className="font-mono text-xs px-2 py-0.5" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
                  {s.framework}
                </div>
              </div>
              <div className="space-y-2">
                {s.gates.map((g) => (
                  <div key={g.id} className="flex gap-3 text-sm">
                    <span className="font-mono text-xs flex-shrink-0 pt-0.5" style={{ color: T.wood }}>{g.short}</span>
                    <span style={{ color: T.ink }}>{g.label}</span>
                  </div>
                ))}
              </div>
              <div
                className="mt-4 pt-4 flex items-center justify-between text-xs flex-wrap gap-2"
                style={{ borderTop: `1px solid ${T.lineSoft}`, color: T.inkSoft }}
              >
                <span>
                  主理:{' '}
                  <span className="font-bold" style={{ color: OWNERS[s.owner].color }}>
                    {OWNERS[s.owner].label} · {OWNERS[s.owner].full.split(' ')[0]}
                  </span>
                </span>
                <span>典型周期: {s.days}</span>
              </div>
              {((s.linkedForms || []).length > 0 || s.hasDailyReports) && (
                <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                  <div className="text-xs mb-2" style={{ color: T.inkSoft }}>本章核心表单:</div>
                  <div className="space-y-1.5">
                    {(s.linkedForms || []).map((lf) => FORMS[lf.formCode] && (
                      <div key={lf.formCode} className="flex items-center gap-2 text-xs">
                        <FileText size={12} strokeWidth={1.5} style={{ color: T.wood }} />
                        <span className="font-display text-base" style={{ color: T.ink }}>《{FORMS[lf.formCode].title}》</span>
                        <span style={{ color: T.inkSoft }}>· {formTotal(lf.formCode)} 项</span>
                      </div>
                    ))}
                    {s.hasDailyReports && (
                      <div className="flex items-center gap-2 text-xs">
                        <CalendarDays size={12} strokeWidth={1.5} style={{ color: T.wood }} />
                        <span className="font-display text-base" style={{ color: T.ink }}>《安装每日报告》</span>
                        <span style={{ color: T.inkSoft }}>· 每日时间轴</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* Closing */}
      <div className="mt-20 text-center pt-12" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
        <p className="font-display italic text-2xl leading-snug mb-3" style={{ color: T.ink }}>
          "We don't ship until each gate is closed."
        </p>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>
          {lang === 'cn' ? '每一道 Gate 关上, 才有下一步。 这是 SAIL 的纪律。' : 'Each gate closed before the next opens. This is SAIL discipline.'}
        </p>
        <button
          onClick={() => window.print()}
          className="px-5 py-2 text-xs flex items-center gap-2 mx-auto"
          style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
        >
          <Printer size={12} />
          {lang === 'cn' ? '打印 / 存 PDF — 用作员工培训 / 客户销售' : 'Print / Save PDF — for staff training + client sales'}
        </button>
        <div className="text-[10px] mt-8 opacity-60" style={{ color: T.inkSoft }}>
          溪岸 SAIL · The Method · Internal & Sales Handbook
        </div>
      </div>
    </div>
  );
}
