import React from 'react';
import { Type, Wand2, Image as ImageIcon, Info } from 'lucide-react';
import { designCoverTexts } from '../../../engine/deck.js';
import { langOf, hasCJKText } from '../../../engine/lang.js';
import { needsEnglish } from '../../../lib/langUi.js';
import { updateCover, updateInfo, NOW } from '../ops.js';
import { Section, Field, inputCls, btnPrimary } from '../ui.jsx';
import ImageField from '../ImageField.jsx';
import EnInput, { EnAlias } from '../EnInput.jsx';
import { CompanyTexts, CompanyPhotos } from './CompanyInspector.jsx';

// 方案封面（「03 方案」章节封面）：Material Board 整张放在右侧（不裁切），左栏 章节标签 · 标题 · 副标题。
// 没有 Board 时这一页退回品牌画册的「方案」章节页（可改字、换照片）。
// English / 中英版：标题 / 副标题写的是中文时，下面多一个英文框（写进翻译记忆）——放在 <label> 外面（点它不会跳回中文框），
// 「留空 = 自动…」的说明留在中文框下面。

export default function CoverInspector({ project, slide, change, notify, onGoTab }) {
  const cover = project.cover || {};
  const info = project.info || {};
  const auto = designCoverTexts({ ...project, info: { ...info, coverTitle: '', coverSubtitle: '' } });
  const en = needsEnglish(langOf(project));
  const enFor = (text, field) =>
    en && hasCJKText(text) ? <EnInput project={project} zh={text} kind="text" change={change} field={field} className="mt-1.5" /> : null;
  /** 标题本来就是英文 / 空着（自动）时没有 EN 框：画布上点英文标题落到中文框 */
  const alias = (text) => en && !hasCJKText(text);

  return (
    <div className="space-y-3">
      <Section title="Material Board" icon={ImageIcon}>
        {!cover.image && (
          <div className="flex items-start gap-1.5 rounded-lg bg-bp-tint px-2.5 py-2 mb-2.5 text-[11px] text-bp-muted leading-snug">
            <Info className="w-3.5 h-3.5 mt-px shrink-0 text-bp-eyebrow" />
            还没有 Material Board —— 现在这一页是品牌画册里的「方案」章节页。做好 Board 后它会成为方案章节的封面：整张放在右侧，不裁切（公司封面保持原样）。
          </div>
        )}
        <ImageField
          project={project}
          src={cover.image || null}
          notify={notify}
          field="cover.image"
          removeLabel="移除"
          lowResWidth={900}
          maxEdge={4096}
          onChange={(src) => change((p) => updateCover(p, { image: src || null }), NOW)}
          hint={cover.image ? '任何比例都整张显示，不裁切；移除后退回「方案」章节页' : '也可以直接上传自己做好的 Board 图（任何比例都行）'}
        />
        <button type="button" className={`${btnPrimary} w-full mt-3`} onClick={() => onGoTab?.('board')}>
          <Wand2 className="w-4 h-4" />
          {cover.image ? '去改 Material Board' : '去做 Material Board'}
        </button>
      </Section>

      <Section title="封面文字" icon={Type}>
        <Field label="大标题" hint={cover.image ? '留空 = 自动用客户与地点（分两行）' : '有 Material Board 时生效；留空 = 自动用客户与地点'}>
          <EnAlias field="coverTitleEn" on={alias(info.coverTitle)}>
            <input
              data-field="coverTitle"
              className={inputCls}
              value={info.coverTitle || ''}
              placeholder={auto.title.replace(/\n/g, ' · ')}
              onChange={(e) => change((p) => updateInfo(p, { coverTitle: e.target.value }))}
            />
          </EnAlias>
        </Field>
        {enFor(info.coverTitle, 'coverTitleEn')}
        <Field label="副标题" className="mt-2.5" hint="留空 = 自动用楼层">
          <EnAlias field="coverSubtitleEn" on={alias(info.coverSubtitle)}>
            <input
              data-field="coverSubtitle"
              className={inputCls}
              value={info.coverSubtitle || ''}
              placeholder={auto.subtitle}
              onChange={(e) => change((p) => updateInfo(p, { coverSubtitle: e.target.value }))}
            />
          </EnAlias>
        </Field>
        {enFor(info.coverSubtitle, 'coverSubtitleEn')}
      </Section>

      {!cover.image && <CompanyTexts project={project} slide={slide} change={change} onGoTab={onGoTab} title="章节页文字" />}
      {!cover.image && <CompanyPhotos project={project} slide={slide} change={change} notify={notify} />}
    </div>
  );
}
