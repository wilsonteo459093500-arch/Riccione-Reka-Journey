import { useMemo, useState } from 'react';
import { X, ArrowLeft, ChevronRight, CheckCircle2, Printer } from 'lucide-react';
import { T } from '../../theme.js';
import { FORMS } from '../../constants/forms.js';

export default function FormEditor({ project, formCode, onClose, onSave }) {
  const form = FORMS[formCode];
  const [answers, setAnswers] = useState(project.forms?.[formCode]?.answers || {});
  const [activeSection, setActiveSection] = useState(form.sections[0].code);
  const total = form.sections.reduce((a, s) => a + s.questions.length, 0);

  const setAnswer = (qid, val) => setAnswers((prev) => ({ ...prev, [qid]: val }));

  const sectionCompletion = (s) => {
    const filled = s.questions.filter((q) => {
      const v = answers[q.id];
      return v !== undefined && v !== null && v !== '';
    }).length;
    return { filled, total: s.questions.length, pct: (filled / s.questions.length) * 100 };
  };

  const overall = useMemo(() => {
    let filled = 0;
    form.sections.forEach((s) =>
      s.questions.forEach((q) => {
        if (answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== '') filled++;
      })
    );
    return { filled, total };
  }, [answers, form, total]);

  const section = form.sections.find((s) => s.code === activeSection);
  const sectionIdx = form.sections.findIndex((s) => s.code === activeSection);
  const isFirst = sectionIdx === 0;
  const isLast = sectionIdx === form.sections.length - 1;

  return (
    <div className="fixed inset-0 z-50 overflow-auto" style={{ background: 'rgba(45, 62, 54, 0.92)' }}>
      <div className="min-h-screen flex items-start justify-center p-4 lg:p-6">
        <div className="w-full max-w-5xl my-4" style={{ background: T.paper, borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
          {/* Header */}
          <div className="p-6 lg:p-8 flex items-start justify-between gap-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <div>
              <div className="text-xs tracking-[0.3em] uppercase mb-1" style={{ color: T.wood }}>{form.en}</div>
              <h2 className="font-display text-4xl leading-none mb-1" style={{ color: T.ink }}>{form.title}</h2>
              <div className="text-sm mb-2" style={{ color: T.inkSoft }}>{project.name} · {project.client}</div>
              <div className="text-xs mb-3" style={{ color: T.inkSoft, opacity: 0.8 }}>{form.purpose}</div>
              <div className="text-sm" style={{ color: T.ink }}>
                共 {total} 项  ·  <span className="font-mono">{overall.filled}/{overall.total} 已填</span>
              </div>
              <div className="mt-2 h-1 w-64" style={{ background: T.lineSoft }}>
                <div className="h-full" style={{ background: overall.filled === overall.total ? T.sage : T.wood, width: `${(overall.filled / overall.total) * 100}%` }} />
              </div>
            </div>
            <button onClick={onClose} style={{ color: T.inkSoft }}>
              <X size={22} strokeWidth={1.5} />
            </button>
          </div>

          {/* Section tabs */}
          <div className="flex overflow-x-auto scrollbar-thin" style={{ background: T.cream, borderBottom: `1px solid ${T.lineSoft}` }}>
            {form.sections.map((s) => {
              const sc = sectionCompletion(s);
              const active = activeSection === s.code;
              const done = sc.filled === sc.total;
              return (
                <button
                  key={s.code}
                  onClick={() => setActiveSection(s.code)}
                  className="flex-shrink-0 px-5 py-3 text-left transition-all"
                  style={{ background: active ? T.paper : 'transparent', borderBottom: `2px solid ${active ? T.wood : 'transparent'}`, color: active ? T.ink : T.inkSoft }}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-display text-base">{s.cn}</span>
                    {done && <CheckCircle2 size={11} strokeWidth={2} style={{ color: T.sage }} />}
                  </div>
                  <div className="text-[9px] uppercase tracking-widest opacity-70">{s.code}</div>
                  <div className="text-[9px] mt-0.5 font-mono opacity-60">{sc.filled}/{sc.total}</div>
                </button>
              );
            })}
          </div>

          {/* Section content */}
          <div className="p-6 lg:p-10 fade-up" key={activeSection}>
            <div className="mb-8">
              <h3 className="font-display text-4xl mb-1" style={{ color: T.ink }}>{section.cn}</h3>
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: T.wood }}>{section.code}</div>
              <p className="text-sm" style={{ color: T.inkSoft }}>{section.desc}</p>
            </div>

            <div className="space-y-6">
              {section.questions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm mb-2.5" style={{ color: T.ink }}>{q.q}</label>
                  {q.type === 'bool' ? (
                    <div className="flex gap-2">
                      {[true, false].map((v) => (
                        <button
                          key={String(v)}
                          onClick={() => setAnswer(q.id, v)}
                          className="px-5 py-2 text-sm transition-all"
                          style={{
                            background: answers[q.id] === v ? (v ? T.sage : T.terra) : 'transparent',
                            color: answers[q.id] === v ? T.paper : T.inkSoft,
                            border: `1px solid ${answers[q.id] === v ? 'transparent' : T.line}`,
                            borderRadius: '2px',
                          }}
                        >
                          {v ? '✓ 是 Pass' : '✗ 否 Fail'}
                        </button>
                      ))}
                    </div>
                  ) : q.type === 'choice' ? (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setAnswer(q.id, opt)}
                          className="px-4 py-2 text-sm transition-all"
                          style={{
                            background: answers[q.id] === opt ? T.wood : 'transparent',
                            color: answers[q.id] === opt ? T.paper : T.inkSoft,
                            border: `1px solid ${answers[q.id] === opt ? T.wood : T.line}`,
                            borderRadius: '2px',
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder={q.placeholder || ''}
                      rows={2}
                      className="w-full px-3 py-2 text-sm outline-none resize-none"
                      style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Section navigation */}
            <div className="mt-10 pt-6 flex items-center justify-between" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
              <button
                onClick={() => !isFirst && setActiveSection(form.sections[sectionIdx - 1].code)}
                disabled={isFirst}
                className="text-sm flex items-center gap-1.5"
                style={{ color: isFirst ? T.line : T.inkSoft }}
              >
                <ArrowLeft size={14} />
                上一节
              </button>
              <button
                onClick={() => !isLast && setActiveSection(form.sections[sectionIdx + 1].code)}
                disabled={isLast}
                className="text-sm flex items-center gap-1.5"
                style={{ color: isLast ? T.line : T.inkSoft }}
              >
                下一节
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="p-6 lg:p-8 flex items-center justify-between flex-wrap gap-3" style={{ background: T.cream, borderTop: `1px solid ${T.lineSoft}` }}>
            <div className="text-xs" style={{ color: T.inkSoft }}>
              💡 内容自动同步到团队 · {form.role === 'client' ? '客户签字版可打印' : '现场存档可打印'}
            </div>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="px-4 py-2 text-sm flex items-center gap-1.5" style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
                <Printer size={13} />
                打印 / PDF
              </button>
              <button onClick={() => onSave(answers)} className="px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
