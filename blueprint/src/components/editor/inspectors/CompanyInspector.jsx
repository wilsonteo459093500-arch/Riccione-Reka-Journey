import React from 'react';
import { FileText, RotateCcw, Info, ArrowUpRight, Image as ImageIcon, TriangleAlert } from 'lucide-react';
import { companyFields, companyImages, setCompanyField, clearCompanyField, setCompanyImage, NOW } from '../ops.js';
import { langOf } from '../../../engine/lang.js';
import { Section, AutoTextarea } from '../ui.jsx';
import { EnBox, EN_BADGE } from '../EnInput.jsx';
import ImageField from '../ImageField.jsx';

// 公司固定页（品牌画册）以及没有 Material Board 时的方案章节页：按栏位改字、换照片。
//   中文 → slide.overrides[栏位]；英文 → slide.overridesEn[栏位]；照片 → slide.images[照片位]
//   带 {{token}} 的栏位（客户 / 日期 / 楼层）默认跟随「项目信息」；改了就固定成设计师写的字。
//   English / 中英版：每个栏位的中文下面紧跟它的英文框（中英并重：两个框一样大、左右对齐）。

const Tag = ({ tone, children, title }) => (
  <span
    title={title}
    className={`px-1.5 py-px rounded font-normal ${tone === 'gold' ? 'bg-bp-gold/15 text-bp-eyebrow' : 'bg-bp-green/10 text-bp-green'}`}
  >
    {children}
  </span>
);

const EDITED_EN = { text: '已改', cls: EN_BADGE.memory.cls, title: '用的是你改过的英文' };

function FieldBlock({ f, slideId, change, lang }) {
  const withEn = lang !== 'zh' && !f.shared;
  const edited = f.overridden?.zh || (withEn && f.overridden?.en);
  const staleEn = withEn && f.overridden?.zh && !f.overridden?.en;
  const missingEn = withEn && !f.overridden?.en && !String(f.en || '').trim() && String(f.zh || '').trim();
  const reset = () =>
    change((p) => clearCompanyField(clearCompanyField(p, slideId, f.field, 'zh'), slideId, f.field, 'en'), NOW);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-bp-faint">
          {f.label}
          {f.tokens && !edited && (
            <Tag tone="green" title="自动填入「项目信息」">
              项目信息
            </Tag>
          )}
          {f.shared && lang !== 'zh' && (
            <Tag tone="green" title="中英版本用同一段（品牌名、年份、地址等）">
              中英同一段
            </Tag>
          )}
          {edited && <Tag tone="gold">已改</Tag>}
        </span>
        {edited && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-[11px] text-bp-muted hover:text-bp-ink shrink-0"
            title={`恢复成：${f.zhDefault}${withEn ? ` / ${f.enDefault}` : ''}`}
          >
            <RotateCcw className="w-3 h-3" />
            恢复默认
          </button>
        )}
      </div>
      <AutoTextarea
        data-field={`overrides.${f.field}`}
        value={f.zhInput}
        minRows={f.multiline ? 2 : 1}
        className={f.overridden?.zh ? '!border-bp-gold/60' : ''}
        onChange={(t) => change((p) => setCompanyField(p, slideId, f.field, 'zh', t, f.zhDefault))}
      />
      {withEn && (
        <EnBox
          className="mt-1.5"
          field={`overridesEn.${f.field}`}
          multiline={f.multiline}
          value={f.enInput}
          placeholder={f.enDefault || 'English'}
          badge={f.overridden?.en ? EDITED_EN : missingEn ? EN_BADGE.missing : null}
          inputClass={f.overridden?.en ? '!border-bp-gold/60' : ''}
          ariaLabel={`${f.label}的英文`}
          onChange={(t) => change((p) => setCompanyField(p, slideId, f.field, 'en', t, f.enDefault))}
        />
      )}
      {staleEn && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-bp-warn leading-snug">
          <TriangleAlert className="w-3 h-3 mt-px shrink-0" />
          中文改过了，英文还是原来的 —— 顺手改一下英文
        </p>
      )}
    </div>
  );
}

/** 公司页的全部文字（方案封面没有 Board 时也复用） */
export function CompanyTexts({ project, slide, change, onGoTab, title = '页面文字' }) {
  const fields = companyFields(slide, project);
  if (!fields.length) return null;
  const lang = langOf(project);
  const hasTokens = fields.some((f) => f.tokens);
  const edited = fields.filter((f) => f.overridden?.zh || f.overridden?.en);
  const resetAll = () =>
    change(
      (p) => edited.reduce((acc, f) => clearCompanyField(clearCompanyField(acc, slide.id, f.field, 'zh'), slide.id, f.field, 'en'), p),
      NOW
    );
  return (
    <Section
      title={title}
      icon={FileText}
      right={
        edited.length ? (
          <button type="button" className="text-[11px] text-bp-muted hover:text-bp-ink inline-flex items-center gap-1" onClick={resetAll}>
            <RotateCcw className="w-3 h-3" />
            全部恢复（{edited.length}）
          </button>
        ) : null
      }
    >
      <div className="flex items-start gap-1.5 rounded-lg bg-bp-tint px-2.5 py-2 mb-3 text-[11px] text-bp-muted leading-snug">
        <Info className="w-3.5 h-3.5 mt-px shrink-0 text-bp-eyebrow" />
        <span>
          改字只影响这一份提案；换行 = 分行。
          {lang !== 'zh' && ' 中文和英文分开改；英文框清空 = 英文里不要这一行。'}
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
      <div className="space-y-3.5">
        {fields.map((f) => (
          <FieldBlock key={f.field} f={f} slideId={slide.id} change={change} lang={lang} />
        ))}
      </div>
    </Section>
  );
}

/** 公司页的照片（默认图由公司统一更换；这里只换这一份提案） */
export function CompanyPhotos({ project, slide, change, notify }) {
  const imgs = companyImages(slide, project);
  if (!imgs.length) return null;
  return (
    <Section title={imgs.length > 1 ? `照片（${imgs.length} 张）` : '照片'} icon={ImageIcon}>
      <div className="space-y-3">
        {imgs.map((im) => (
          <div key={im.slot}>
            {imgs.length > 1 && <div className="text-[11px] font-semibold text-bp-faint mb-1">{im.label}</div>}
            <ImageField
              project={project}
              src={im.custom ? im.src : null}
              autoSrc={im.src === null ? null : im.default}
              autoLabel="默认"
              removeLabel="恢复默认"
              notify={notify}
              field={im.field}
              lowResWidth={0}
              onChange={(src) => change((p) => setCompanyImage(p, slide.id, im.slot, src), NOW)}
              hint="只换这一份提案的照片；照片不压字、不调暗"
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function CompanyInspector(props) {
  return (
    <div className="space-y-3">
      <CompanyTexts {...props} />
      <CompanyPhotos {...props} />
    </div>
  );
}
