import React from 'react';
import { FileText, RotateCcw, Info, ArrowUpRight } from 'lucide-react';
import { companyFields, setCompanyOverride, clearCompanyOverride, NOW } from '../ops.js';
import { Section, AutoTextarea } from '../ui.jsx';

// 公司固定页（以及没有 Material Board 时的方案章节页）：逐段改字，写进 slide.overrides[元素序号]。
// 带 {{token}} 的栏位（客户 / 日期 / 楼层）默认跟随项目信息；改了就固定成设计师写的字。

function FieldRow({ f, slideId, change }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-bp-faint">
          {f.role}
          {f.tokens && !f.overridden && (
            <span className="px-1.5 py-px rounded bg-bp-green/10 text-bp-green font-normal" title="自动填入「项目信息」">
              项目信息
            </span>
          )}
          {f.overridden && <span className="px-1.5 py-px rounded bg-bp-gold/15 text-bp-eyebrow font-normal">已改</span>}
        </span>
        {f.overridden && (
          <button
            type="button"
            onClick={() => change((p) => clearCompanyOverride(p, slideId, f.idx), NOW)}
            className="inline-flex items-center gap-1 text-[11px] text-bp-muted hover:text-bp-ink"
            title={`恢复成：${f.original}`}
          >
            <RotateCcw className="w-3 h-3" />
            恢复原文
          </button>
        )}
      </div>
      <AutoTextarea
        data-field={`overrides.${f.idx}`}
        value={f.text}
        minRows={f.multiline ? 2 : 1}
        className={f.overridden ? '!border-bp-gold/60' : ''}
        onChange={(t) => change((p) => setCompanyOverride(p, slideId, f.idx, t, f.original))}
      />
    </div>
  );
}

/** 公司模板页的全部文字（方案封面没有 Board 时也复用） */
export function CompanyTexts({ project, slide, change, onGoTab, title = '页面文字' }) {
  const fields = companyFields(slide, project);
  if (!fields.length) return null;
  const main = fields.filter((f) => !f.footer);
  const foot = fields.filter((f) => f.footer);
  const hasTokens = fields.some((f) => f.tokens);
  const edited = fields.filter((f) => f.overridden).length;
  return (
    <Section
      title={title}
      icon={FileText}
      right={
        edited ? (
          <button
            type="button"
            className="text-[11px] text-bp-muted hover:text-bp-ink inline-flex items-center gap-1"
            onClick={() => change((p) => fields.filter((f) => f.overridden).reduce((acc, f) => clearCompanyOverride(acc, slide.id, f.idx), p), NOW)}
          >
            <RotateCcw className="w-3 h-3" />
            全部恢复（{edited}）
          </button>
        ) : null
      }
    >
      <div className="flex items-start gap-1.5 rounded-lg bg-bp-tint px-2.5 py-2 mb-3 text-[11px] text-bp-muted leading-snug">
        <Info className="w-3.5 h-3.5 mt-px shrink-0 text-bp-eyebrow" />
        <span>
          这是定稿模板页，改字只影响这一份提案；换行 = 分段。
          {hasTokens && (
            <>
              {' '}标着「项目信息」的栏位会自动填客户、地点、日期 ——
              <button type="button" onClick={() => onGoTab?.('info')} className="inline-flex items-center text-bp-eyebrow font-medium hover:underline">
                去项目信息改
                <ArrowUpRight className="w-3 h-3" />
              </button>
              更省事，这里改了就不再跟随。
            </>
          )}
        </span>
      </div>
      <div className="space-y-3">
        {main.map((f) => (
          <FieldRow key={f.idx} f={f} slideId={slide.id} change={change} />
        ))}
      </div>
      {foot.length > 0 && (
        <>
          <div className="mt-4 mb-2 text-[10px] font-semibold tracking-[0.12em] text-bp-faint">页脚</div>
          <div className="space-y-3">
            {foot.map((f) => (
              <FieldRow key={f.idx} f={f} slideId={slide.id} change={change} />
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

export default function CompanyInspector(props) {
  return <CompanyTexts {...props} />;
}
