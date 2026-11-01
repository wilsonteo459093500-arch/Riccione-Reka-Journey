import React from 'react';
import { FileText, RotateCcw, Info, ArrowUpRight, Image as ImageIcon, TriangleAlert, History } from 'lucide-react';
import {
  companyFields, companyImages, setCompanyField, setCompanyImage, editedCompanyFields, enOnlyEdits, resetCompanyFields, singleLine,
  legacyEdits, clearLegacyEdits, NOW,
} from '../ops.js';
import { langOf } from '../../../engine/lang.js';
import { Section, AutoTextarea } from '../ui.jsx';
import { EnBox, EN_BADGE } from '../EnInput.jsx';
import ImageField from '../ImageField.jsx';

// 公司固定页（品牌画册）以及没有 Material Board 时的方案章节页：按栏位改字、换照片。
//   中文 → slide.overrides[栏位]；英文 → slide.overridesEn[栏位]；照片 → slide.images[照片位]
//   带 {{token}} 的栏位（客户 / 日期 / 楼层）默认跟随「项目信息」；改了就固定成设计师写的字。
//   English / 中英版：每个栏位的中文下面紧跟它的英文框（中英并重：两个框一样大、左右对齐、都按内容长高）。
//   版面上只排一行的栏位（目录、章节名、年份…）按回车不换行。

const Tag = ({ tone, children, title }) => (
  <span
    title={title}
    className={`px-1.5 py-px rounded font-normal ${
      tone === 'gold' ? 'bg-bp-gold/15 text-bp-eyebrow' : tone === 'grey' ? 'bg-bp-line/60 text-bp-muted' : 'bg-bp-green/10 text-bp-green'
    }`}
  >
    {children}
  </span>
);

const EDITED_EN = { text: '已改', cls: EN_BADGE.memory.cls, title: '用的是你改过的英文' };
const CLEARED_EN = { text: '不显示', cls: 'bg-bp-line/70 text-bp-muted', title: '英文清空了：English 版不印这一行，中英版只印中文 —— 点「恢复默认」找回英文' };
const AUTO_EN = { text: '自动', cls: EN_BADGE.glossary.cls, title: '跟着中文自动换成的英文（如「5 年」→ 5 years）；想换说法直接改' };

/** 版面上只排一行的栏位：回车不换行（输入法选字时的回车照常） */
const blockEnter = (e) => {
  if (e.key === 'Enter' && !e.nativeEvent?.isComposing) e.preventDefault();
};

function FieldBlock({ f, slideId, change, lang }) {
  const withEn = lang !== 'zh' && !f.shared;
  const edited = f.overridden?.zh || (withEn && f.overridden?.en);
  const staleEn = withEn && f.overridden?.zh && !f.overridden?.en && !f.autoEn;
  const missingEn = withEn && !f.overridden?.en && !String(f.en || '').trim() && String(f.zh || '').trim();
  const clearedEn = withEn && f.overridden?.en && f.enInput === '';
  const reset = () => change((p) => resetCompanyFields(p, slideId, [f.field], lang), NOW);
  const tidy = (t) => (f.oneLine ? singleLine(t) : t);
  const keyDown = f.oneLine ? blockEnter : undefined;
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
          {f.chapter && !edited && (
            <Tag tone="green" title="章节编号自动排：在「项目信息 → 方案章节显示」隐藏了前面的章节，这里跟着往前排">
              自动编号
            </Tag>
          )}
          {f.shared && lang !== 'zh' && (
            <Tag tone="green" title="中英版本用同一段（品牌名、年份、地址等）">
              中英同一段
            </Tag>
          )}
          {f.hidden && (
            <Tag tone="grey" title="这一章在「项目信息 → 方案章节显示」里隐藏了：目录不列它，后面的章节编号往前排">
              这一章已隐藏
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
        onKeyDown={keyDown}
        onChange={(t) => change((p) => setCompanyField(p, slideId, f.field, 'zh', tidy(t), f.zhDefault))}
      />
      {withEn && (
        // 英文框也是会长高的多行框：长句子整句看得见，和上面的中文框一样能换行（只排一行的栏位两个框都不换行）
        <EnBox
          className="mt-1.5"
          field={`overridesEn.${f.field}`}
          multiline
          value={f.enInput}
          placeholder={clearedEn ? '英文版不显示这一行' : f.enDefault || 'English'}
          badge={clearedEn ? CLEARED_EN : f.overridden?.en ? EDITED_EN : f.autoEn ? AUTO_EN : missingEn ? EN_BADGE.missing : null}
          inputClass={f.overridden?.en ? '!border-bp-gold/60' : ''}
          ariaLabel={`${f.label}的英文`}
          onKeyDown={keyDown}
          onChange={(t) => change((p) => setCompanyField(p, slideId, f.field, 'en', tidy(t), f.enDefault))}
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

/** 旧版（按元素序号）改过、新版式没有对应栏位的字：列出来对照，点「知道了」清掉 */
function LegacyEdits({ project, slide, change }) {
  const list = legacyEdits(slide, project);
  if (!list.length) return null;
  const lang = langOf(project);
  return (
    <div className="rounded-lg border border-bp-warn/30 bg-bp-warn/10 px-2.5 py-2 mb-3 text-[11px] text-bp-ink leading-snug">
      <div className="flex items-center gap-1.5 font-semibold text-bp-warn mb-1">
        <History className="w-3.5 h-3.5" />
        旧版里改过的字（新版式没有对应的位置，页面上没有用）
      </div>
      <ul className="space-y-1 mb-2">
        {list.map((x) => (
          <li key={`${x.bucket}.${x.key}`} className="whitespace-pre-wrap break-words select-text">
            {x.bucket === 'overridesEn' && <span className="mr-1 text-[9px] font-semibold tracking-[0.12em] text-bp-faint">EN</span>}
            {x.text}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <span className="text-bp-muted">需要的话填进下面对应的栏位</span>
        <button
          type="button"
          onClick={() => change((p) => clearLegacyEdits(p, slide.id, lang), NOW)}
          className="shrink-0 rounded-md bg-bp-dark text-bp-light px-2 py-0.5 hover:opacity-90"
        >
          知道了，清掉
        </button>
      </div>
    </div>
  );
}

/** 公司页的全部文字（方案封面没有 Board 时也复用） */
export function CompanyTexts({ project, slide, change, onGoTab, title = '页面文字' }) {
  const fields = companyFields(slide, project);
  if (!fields.length) return null;
  const lang = langOf(project);
  const hasTokens = fields.some((f) => f.tokens);
  const hasOneLine = fields.some((f) => f.oneLine);
  // 华文版只算 / 只恢复中文的改动（英文的改写在华文版里看不到，不跟着丢掉）
  const edited = editedCompanyFields(fields, lang);
  const enOnly = lang === 'zh' ? enOnlyEdits(fields) : [];
  const resetAll = () => change((p) => resetCompanyFields(p, slide.id, edited.map((f) => f.field), lang), NOW);
  return (
    <Section
      title={title}
      icon={FileText}
      right={
        edited.length ? (
          <button
            type="button"
            className="text-[11px] text-bp-muted hover:text-bp-ink inline-flex items-center gap-1"
            onClick={resetAll}
            title={lang === 'zh' ? '只恢复中文；英文的改动留着（切到 English / 中英 才看得到）' : '中文、英文都恢复成默认稿'}
          >
            <RotateCcw className="w-3 h-3" />
            全部恢复（{edited.length}）
          </button>
        ) : null
      }
    >
      <div className="flex items-start gap-1.5 rounded-lg bg-bp-tint px-2.5 py-2 mb-3 text-[11px] text-bp-muted leading-snug">
        <Info className="w-3.5 h-3.5 mt-px shrink-0 text-bp-eyebrow" />
        <span>
          改字只影响这一份提案；换行 = 分行{hasOneLine ? '（只排一行的栏位按回车不换行）' : ''}。
          {lang !== 'zh' && ' 中文和英文分开改；英文框清空 = 英文里不要这一行。'}
          {enOnly.length > 0 && ` 另有 ${enOnly.length} 处只改了英文（切到 English / 中英 查看）。`}
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
      <LegacyEdits project={project} slide={slide} change={change} />
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
