import { FileText, CalendarDays, Printer } from 'lucide-react';
import { T } from '../theme.js';
import { STAGES, OWNERS } from '../constants/stages.js';
import { FORMS, formTotal } from '../constants/forms.js';

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];
const CN_NUM = ['一', '二', '三', '四', '五'];

export default function MethodView() {
  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-16 fade-up">
      {/* Cover */}
      <div className="text-center mb-20">
        <div className="text-xs tracking-[0.4em] uppercase mb-4" style={{ color: T.wood }}>The Sail Brand Method</div>
        <h1 className="font-display text-6xl lg:text-7xl mb-4 leading-none" style={{ color: T.ink }}>Five Chapters</h1>
        <h2 className="font-display italic text-2xl mb-8" style={{ color: T.inkSoft }}>from Vision to Signature</h2>
        <div className="ink-divider max-w-xs mx-auto mb-8" />
        <p className="text-sm leading-relaxed max-w-lg mx-auto" style={{ color: T.inkSoft }}>
          每一个 SAIL 项目都流经五个章节。
          <br />
          每一章节都有一道 Gate — 不通过, 不进入下一章。
          <br />
          这是我们对客户的承诺, 也是我们对自己的纪律。
        </p>
      </div>

      {/* Chapters */}
      <div className="space-y-20">
        {STAGES.map((s, i) => (
          <article key={s.code} className="fade-up" style={{ animationDelay: `${0.05 * i}s` }}>
            <div className="flex items-baseline gap-6 mb-6 flex-wrap">
              <div className="stage-roman font-display text-7xl leading-none" style={{ color: T.wood }}>{ROMAN[i]}</div>
              <div>
                <div className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: T.inkSoft }}>
                  Chapter {i + 1} · 第{CN_NUM[i]}章
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
              {(s.linkedForms || []).length > 0 && (
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

      <div className="mt-20 text-center pt-12" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
        <p className="font-display italic text-2xl leading-snug mb-3" style={{ color: T.ink }}>
          "We don't ship until each gate is closed."
        </p>
        <p className="text-sm mb-8" style={{ color: T.inkSoft }}>每一道 Gate 关上, 才有下一步。 这是 SAIL 的纪律。</p>
        <button
          onClick={() => window.print()}
          className="px-5 py-2 text-xs flex items-center gap-2 mx-auto"
          style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
        >
          <Printer size={12} />
          打印 / 存 PDF — 用作员工培训 / 客户销售
        </button>
        <div className="text-[10px] mt-8 opacity-60" style={{ color: T.inkSoft }}>
          溪岸 SAIL · The Method · Internal & Sales Handbook
        </div>
      </div>
    </div>
  );
}
