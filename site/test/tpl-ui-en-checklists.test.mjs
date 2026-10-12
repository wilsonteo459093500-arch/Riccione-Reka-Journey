// 界面语言 English：复尺确认表 / 场前审核表 / 完工终检表 —— App 里显示的模板文字都有英文
// （首页说明、节标题 / 说明、字段标签 / 输入框提示、检查项、选项、表格列 / 「添加」按钮、签名、提示条）
// 界面取字规则同 lib/i18n.js uiLabel：English = enOnly || en || zh，所以这里用 localize(label, 'en')。
import assert from 'node:assert/strict';
import measurement from '../src/templates/measurement.js';
import preInstall from '../src/templates/preInstall.js';
import finalInspection from '../src/templates/finalInspection.js';
import { resolveScale } from '../src/templates/schema.js';
import { localize } from '../src/lib/lang.js';

const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;

/** 界面 English 模式显示的文字（字符串 = 中文） */
const uiEn = (l) => (l == null ? '' : typeof l === 'string' ? l : localize(l, 'en').en || '');

/** 模板里 App 界面会显示的全部文字：[位置, 标签] */
function uiLabels(t) {
  const out = [['name', t.name], ['desc', t.desc]];
  const field = (where, f) => {
    out.push([`${where}.label`, f.label]);
    if (f.placeholder != null) out.push([`${where}.placeholder`, f.placeholder]);
    if (f.hint != null) out.push([`${where}.hint`, f.hint]);
    for (const o of f.options || []) out.push([`${where}.option`, o]);
  };
  for (const s of t.sections) {
    const at = `${t.id}/${s.id}`;
    if (s.title) out.push([`${at}.title`, s.title]);
    if (s.note) out.push([`${at}.note`, s.note]);
    if (s.type === 'fields') s.fields.forEach((f) => field(`${at}/${f.key}`, f));
    if (s.type === 'checklist') {
      if (s.remark?.label) out.push([`${at}.remark`, s.remark.label]);
      for (const o of resolveScale(s.scale).options) out.push([`${at}.scale`, o]);
      for (const it of s.items) {
        out.push([`${at}/${it.id}.title`, it.title]);
        if (it.desc) out.push([`${at}/${it.id}.desc`, it.desc]);
        if (it.method) out.push([`${at}/${it.id}.method`, it.method]);
        if (it.input) field(`${at}/${it.id}.input`, it.input);
        if (it.scale) for (const o of resolveScale(it.scale).options) out.push([`${at}/${it.id}.scale`, o]);
      }
    }
    if (s.type === 'table') {
      if (s.addLabel != null) out.push([`${at}.addLabel`, s.addLabel]);
      if (s.emptyText) out.push([`${at}.emptyText`, s.emptyText]);
      if (s.photos) out.push([`${at}.photos`, s.photos.label]);
      for (const p of s.photoSlots || []) out.push([`${at}.photoSlot`, p.label]);
      s.columns.forEach((c) => field(`${at}/${c.key}`, c));
    }
    if (s.type === 'signatures') {
      if (s.declaration) out.push([`${at}.declaration`, s.declaration]);
      for (const r of s.roles) out.push([`${at}/${r.id}`, r]);
    }
    if (s.type === 'note') s.lines.forEach((l, i) => out.push([`${at}.line${i}`, l]));
  }
  return out;
}

export const tests = [
  ['界面 English：模板里 App 显示的文字都有英文（不含中文）', () => {
    for (const t of [measurement, preInstall, finalInspection]) {
      const labels = uiLabels(t);
      assert.ok(labels.length > 40, t.id);
      for (const [where, l] of labels) {
        const en = uiEn(l);
        assert.ok(en && !CJK.test(en), `${where} 缺英文：${JSON.stringify(l)}`);
      }
    }
  }],
  ['界面文字的中文照旧：首页说明 / 输入框提示 / 添加按钮是 { zh, en }，中文 = 原文', () => {
    for (const t of [measurement, preInstall, finalInspection]) {
      assert.ok(typeof t.desc.zh === 'string' && CJK.test(t.desc.zh), t.id);
      assert.equal(localize(t.desc, 'zh').zh, t.desc.zh);
    }
    assert.equal(finalInspection.sections.find((s) => s.id === 'rectification').addLabel.zh, '添加整改项');
    const hours = preInstall.sections[0].fields.find((f) => f.key === 'hours');
    assert.deepEqual(hours.placeholder, { zh: '例：9:00–17:00', en: 'e.g. 9:00–17:00' });
  }],
];
