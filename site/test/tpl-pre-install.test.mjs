// 模板：场前审核表 PRE-INSTALLATION SITE AUDIT（5O）
import assert from 'node:assert/strict';
import preInstall from '../src/templates/preInstall.js';
import { allItems, allFields, resolveScale } from '../src/templates/schema.js';
import { createReport, makeCtx, issues, progress, siteLabel } from '../src/lib/report.js';
import { buildDocModel, modelMedia } from '../src/lib/docmodel.js';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';

/** 标签的中 / 英两行（双语文件显示的内容）；单语覆盖 zhOnly / enOnly 另测，见 lang.test.mjs */
const bi = ({ zh, en }) => (en === undefined ? { zh } : { zh, en });
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u3000-\u303F]/;

const t = preInstall;
const lists = t.sections.filter((s) => s.type === 'checklist');
const oLists = lists.filter((s) => /^O\d$/.test(s.no || ''));
const model = (report) => buildDocModel({ template: t, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
const ctxOf = (report, lang) => makeCtx({ template: t, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang });
const byId = Object.fromEntries(allItems(t).map(({ item }) => [item.id, item]));

/** 新建一份「全部关键项 是、判定 GO、项目经理已签」的报告，再按需改 */
function allPass(patch = {}) {
  const r = createReport(t, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
  for (const { section, item } of allItems(t)) {
    if (item.input) continue;
    r.items[item.id] = { r: resolveScale(item.scale || section.scale).options[0].v, note: '', photos: item.media ? ['m_photo1'] : [] };
  }
  r.signatures.pm = { name: 'Mei Ling', date: '2026-10-09', image: 'm_sig' };
  for (const [id, a] of Object.entries(patch)) r.items[id] = { ...r.items[id], ...a };
  return r;
}


// checks() 可返回字符串或 { text, sectionId, target }：测试只比较文字
// 提醒文字跟界面语言（ctx.lang）：默认按中文界面比对（与原来逐字一致），English / 中英另测
const checksText = (ctx, lang = 'zh') => (t.checks(makeCtx({ ...ctx, lang })) || []).map((x) => (typeof x === 'string' ? x : x.text));

export const tests = [
  ['结构：O1–O5 + 签核，共 27 项', () => {
    assert.equal(t.id, 'pre-install');
    assert.equal(t.kind, 'checklist');
    assert.equal(t.stage, 2);
    assert.equal(t.short, '5O');
    assert.equal(t.icon, 'ClipboardList');
    assert.equal(t.accent, '#AE4E37');
    assert.equal(allItems(t).length, 27);
    assert.deepEqual(lists.map((s) => s.no || ''), ['O1', 'O2', 'O3', 'O4', 'O5', '']);
    assert.deepEqual(lists.map((s) => s.title.en), ['ORDER', 'ONSITE', 'OWNER', 'OPERATE', 'OPEN', 'SIGN-OFF']);
    assert.deepEqual(lists.map((s) => s.items.length), [2, 10, 4, 5, 4, 2]);
    // 原表「其中关键项 n 项」
    assert.deepEqual(lists.map((s) => s.items.filter((i) => i.key).length), [2, 8, 2, 3, 3, 0]);
    for (const s of oLists) {
      assert.deepEqual(s.items.map((i) => i.no), s.items.map((_, k) => String(k + 1).padStart(2, '0')));
      assert.equal(s.resultLayout, 'inline');
      assert.equal(s.scale.id, '5o');
      assert.deepEqual(s.remark.requiredWhen, ['F']);
    }
    assert.deepEqual(lists[5].items.map((i) => i.no), ['01', '04']); // 原表跳号，照抄
    assert.deepEqual(
      allItems(t).filter(({ item }) => item.media).map(({ item }) => item.id),
      ['pi2_07', 'pi2_08', 'pi2_09', 'pi2_10', 'pi4_04', 'pi5_01'],
    );
    assert.deepEqual(
      allItems(t).filter(({ item }) => item.input).map(({ item }) => [item.id, item.input.type]),
      [['pi2_05', 'textarea'], ['pi2_06', 'url'], ['pi3_04', 'text'], ['pi4_05', 'textarea'], ['pis_04', 'textarea']],
    );
    const ids = allItems(t).map(({ item }) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    const keys = allFields(t).map((f) => f.key);
    assert.deepEqual(keys, ['client', 'address', 'date', 'supervisor', 'entry', 'hours']);
    for (const { item } of allItems(t)) {
      assert.ok(!/★|【影像】/.test(item.title.zh), item.id);
      assert.equal(item.title.zh, item.title.zh.trim());
    }
    assert.deepEqual(byId.pis_01.scale.options.map((o) => [o.v, o.tone]), [['GO', 'pass'], ['COND', 'warn'], ['NOGO', 'fail']]);
    assert.deepEqual(t.sections.map((s) => s.type), ['fields', 'checklist', 'checklist', 'checklist', 'checklist', 'checklist', 'summary', 'checklist', 'note', 'signatures']);
  }],
  ['原文逐字', () => {
    assert.equal(t.doc.kicker, 'V-SMOOTH  ·  5O');
    assert.deepEqual(t.doc.title, { zh: '场前审核表', en: 'Pre-Installation Site Audit' });
    assert.deepEqual(bi(t.doc.subtitle), { zh: '按 5O 五步核查:订单 · 现场 · 客户 · 运输 · 开场', en: '现场主管填写,项目经理复核' });
    assert.equal(t.doc.legend, '图例:  ★ = 关键项,不通过则不得开工     【影像】= 需拍照或录影存档');
    assert.equal(t.doc.footer, '本表未完成、未判定「可开工」,不得安排送装。');
    assert.deepEqual(bi(lists[0].note), { zh: '钱和图 — 尾款没到、图纸不是最新版,一律不安排送装' });
    assert.deepEqual(bi(lists[4].note), { zh: '铺开场地:保护、按图分区落位、垃圾车 — 师傅一到就能开工' });
    assert.deepEqual(bi(byId.pi2_01.title), { zh: '硬装已全部完成,复尺后现场无改动 (贴砖 / 油漆 / 门槛 / 管线点位都没动)', en: 'HARDSCAPE DONE, NO CHANGES' });
    assert.deepEqual(bi(byId.pi2_02.title), { zh: '电位 / 水位抽查:与图纸一致,不被柜体挡住', en: 'M&E SPOT-CHECK VS DRAWINGS' });
    assert.deepEqual(bi(byId.pi2_04.title), { zh: '临时水电可用,够师傅施工' });
    assert.deepEqual(bi(byId.pi2_07.title), { zh: '全屋一镜到底:每个房间从门口慢慢转一圈,边拍边报房间名', en: 'EVERY ROOM, ONE CONTINUOUS TAKE' });
    assert.deepEqual(bi(byId.pi4_01.title), { zh: '货梯已预约,轿厢尺寸与载重装得下最大板件', en: 'LIFT BOOKED & FITS LARGEST PANEL' });
    assert.deepEqual(bi(byId.pi5_02.title), { zh: '物料按 Floor Plan 分区贴标 (厨房 / 卧室 / 客厅),大件不挡通道', en: 'STAGED PER FLOOR PLAN' });
    assert.equal(byId.pi4_05.input.placeholder.zh, '填写示例:例: B2 卸货 → 货梯 → 18F → 客厅堆放区');
    assert.equal(byId.pi2_05.input.placeholder.zh, '填写示例:哪里 / 差什么 / 谁负责 / 几时好');
    assert.deepEqual(bi(byId.pi2_06.title), { zh: '进场视频链接', en: 'VIDEO LINK' });
    assert.deepEqual(bi(byId.pis_01.title), { zh: '开工判定', en: 'GO / NO-GO DECISION' });
    const rule = t.sections.find((s) => s.type === 'note');
    assert.equal(rule.tone, 'warn');
    assert.equal(rule.lines.at(-1).zh, '规则:任一关键项(★)判定为「否 Fail」,一律不得开工。现场主管无权放行,须由项目经理复核。');
    assert.equal(rule.lines[1].zh, '有条件开工     关键项通过,一般异常已列明责任人与期限,不影响安装。');
    const sig = t.sections.find((s) => s.type === 'signatures');
    assert.deepEqual(sig.roles.map((r) => [r.id, r.zh, r.en]), [['supervisor', '现场主管', 'SITE SUPERVISOR'], ['pm', '项目经理 / 店长复核', 'PROJECT MANAGER']]);
  }],
  ['新建：带入项目 / 主管电话 / 进场日期 · 天数', () => {
    const r = createReport(t, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.equal(r.values.client, siteLabel(SAMPLE_PROJECT));
    assert.equal(r.values.address, SAMPLE_PROJECT.address);
    assert.match(r.values.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(r.values.supervisor, 'Wilson 016-3881819');
    assert.equal(r.values.entry, '2026-10-08 · 5 天');
    assert.equal(r.values.hours, '');
    assert.equal(r.signatures.supervisor.name, 'Wilson');
    assert.equal(r.items.pi3_04.value, '');
    assert.equal(r.items.pi2_06.value, '');
    assert.ok(/^场前审核_Tuai Timur Residence 17-3（Hailey）_\d{4}-\d{2}-\d{2}$/.test(t.filename(ctxOf(r))));
    // 没有项目 / 设置：不报错，留空
    const bare = createReport(t, {});
    assert.equal(bare.values.entry, '');
    assert.equal(bare.values.supervisor, '');
    assert.equal(createReport(t, { project: { ...SAMPLE_PROJECT, plannedDays: null } }).values.entry, '2026-10-08');
  }],
  ['full / pass / empty：文档模型 + 统计 + 提醒不报错', () => {
    for (const variant of ['full', 'pass', 'empty']) {
      const r = fillReport(t, variant);
      const m = model(r);
      assert.deepEqual(m.blocks.map((b) => b.type), ['fields', 'checklist', 'checklist', 'checklist', 'checklist', 'checklist', 'summary', 'checklist', 'note', 'signatures']);
      const cl = m.blocks.filter((b) => b.type === 'checklist');
      assert.equal(cl.reduce((n, b) => n + b.rows.length, 0), 27);
      assert.ok(cl.every((b) => b.resultLayout === 'inline'));
      assert.deepEqual(cl.map((b) => b.counts.key), [2, 8, 2, 3, 3, 0]);
      assert.equal(m.meta.brand, 'vsmooth');
      assert.equal(m.meta.footer, '本表未完成、未判定「可开工」,不得安排送装。');
      assert.ok(m.meta.filename.startsWith('场前审核_'));
      const dec = cl[5].rows[0];
      assert.deepEqual(dec.options.map((o) => o.v), ['GO', 'COND', 'NOGO']);
      const sum = m.blocks[6];
      assert.equal(sum.items.length, 8);
      assert.equal(sum.conclusion.label.zh, '系统建议');
      const checks = checksText(ctxOf(r));
      assert.ok(Array.isArray(checks) && checks.every((x) => typeof x === 'string'));
      const iss = issues(t, r, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
      assert.ok(Array.isArray(iss));
      const p = progress(t, r);
      if (variant === 'empty') {
        assert.equal(dec.result, null);
        assert.equal(sum.conclusion.value, '未完成');
        assert.equal(sum.conclusion.tone, 'warn');
        assert.deepEqual(checks, ['未选择开工判定（GO / 有条件开工 / NO-GO）']);
        assert.equal(p.done, 2); // 项目 + 日期 自动带入
        assert.equal(modelMedia(m).filter((x) => x.kind !== 'signature').length, 0);
      } else {
        assert.equal(dec.result.v, 'GO');
        assert.equal(p.pct, 100);
        assert.ok(modelMedia(m).length > 0);
      }
      if (variant === 'pass') {
        assert.equal(sum.conclusion.value, 'GO 可开工');
        assert.equal(sum.conclusion.tone, 'pass');
        assert.deepEqual(checks, []);
      }
      if (variant === 'full') {
        // fill 规则：每节第 4 个判定 → 否；O2-04 是 ★ → NO-GO
        assert.equal(r.items.pi2_04.r, 'F');
        assert.equal(sum.conclusion.value, 'NO-GO 暂停进场');
        assert.equal(sum.conclusion.tone, 'fail');
        assert.match(sum.conclusion.note, /O2-04/);
        assert.ok(checks.includes('有关键项不通过，不能判定 GO'));
      }
    }
  }],
  ['完全空白的报告：summary / checks / filename 不报错', () => {
    for (const report of [{ values: {}, items: {}, tables: {}, signatures: {} }, {}]) {
      const ctx = makeCtx({ template: t, report });
      const s = t.summary(ctx);
      assert.equal(s.conclusion.value, '未完成');
      assert.equal(s.conclusion.note, '还有 18 个关键项(★)未判定');
      assert.equal(s.items[0].value, '是 0 · 否 0 · 未填 2');
      assert.equal(s.items[5].value, '0 / 18');
      assert.equal(s.items[7].value, '未选择 Not selected');
      assert.deepEqual(checksText(ctx), ['未选择开工判定（GO / 有条件开工 / NO-GO）']);
      assert.equal(t.filename(ctx), '场前审核');
      assert.doesNotThrow(() => model(report));
    }
  }],
  ['系统建议：NO-GO / 有条件开工 / GO / 未完成', () => {
    const go = t.summary(ctxOf(allPass()));
    assert.equal(go.conclusion.value, 'GO 可开工');
    assert.equal(go.conclusion.note, '全部关键项通过、无未结异常。');
    assert.equal(go.items[0].tone, 'pass');

    const cond = t.summary(ctxOf(allPass({ pi3_03: { r: 'F', note: '未指定' } })));
    assert.equal(cond.conclusion.value, '有条件开工');
    assert.equal(cond.conclusion.tone, 'warn');
    assert.match(cond.conclusion.note, /O3-03/);
    assert.equal(cond.items[2].tone, 'warn');

    const nogo = t.summary(ctxOf(allPass({ pi3_03: { r: 'F' }, pi1_01: { r: 'F' } })));
    assert.equal(nogo.conclusion.value, 'NO-GO 暂停进场');
    assert.equal(nogo.conclusion.note, '有关键项不通过。整改并复核通过后才可进场。（O1-01）');
    assert.equal(nogo.items[0].tone, 'fail');
    assert.equal(nogo.items[6].value, '1 项 items');

    // ★ 不适用 不算不通过；★ 未判定 → 未完成（即使已有一般项不通过）
    assert.equal(t.summary(ctxOf(allPass({ pi4_01: { r: 'NA' } }))).conclusion.value, 'GO 可开工');
    const inc = t.summary(ctxOf(allPass({ pi5_03: { r: '' }, pi4_02: { r: 'F' } })));
    assert.equal(inc.conclusion.value, '未完成');
    assert.equal(inc.conclusion.note, '还有 1 个关键项(★)未判定');
    // 判定（签核）不参与 O 统计：NO-GO 不会变成「一般异常」
    assert.equal(t.summary(ctxOf(allPass({ pis_01: { r: 'NOGO' } }))).conclusion.value, 'GO 可开工');
  }],
  ['提醒：判定与结果矛盾 / 有条件开工未列责任人 / 项目经理未复核', () => {
    assert.deepEqual(checksText(ctxOf(allPass())), []);
    assert.deepEqual(checksText(ctxOf(allPass({ pi2_03: { r: 'F', note: '返潮' } }))), ['有关键项不通过，不能判定 GO']);
    assert.deepEqual(checksText(ctxOf(allPass({ pi2_03: { r: 'F' }, pis_01: { r: 'NOGO' } }))), []);
    assert.deepEqual(
      checksText(ctxOf(allPass({ pi4_02: { r: 'F', note: '转角窄' } }))),
      ['有 1 项一般异常未结，应判定「有条件开工」'],
    );
    assert.deepEqual(
      checksText(ctxOf(allPass({ pi4_02: { r: 'F' }, pis_01: { r: 'COND' } }))),
      ['有条件开工须在「备注 / 整改责任人与期限」列明事项 / 负责人 / 完成期限'],
    );
    assert.deepEqual(checksText(ctxOf(allPass({ pi4_02: { r: 'F' }, pis_01: { r: 'COND' }, pis_04: { value: '转角 / Ah Keong / 10月10日' } }))), []);
    const r = allPass();
    r.signatures.pm = { name: '', date: '', image: null };
    assert.deepEqual(checksText(ctxOf(r)), ['现场主管无权放行，须由项目经理复核签名']);
    assert.deepEqual(checksText(ctxOf(allPass({ pi1_02: { r: '' } }))), ['还有 1 个关键项(★)未判定，不能放行']);
  }],
  ['填写提醒：否 必须写异常说明；【影像】项要照片', () => {
    const r = createReport(t, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    r.items.pi1_01 = { r: 'F', note: '', photos: [] };
    r.items.pi2_07 = { r: 'P', note: '', photos: [] };
    r.items.pi2_08 = { r: 'NA', note: '', photos: [] };
    const list = issues(t, r, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    assert.ok(list.some((i) => i.level === 'error' && i.target === 'pi1_01' && /异常说明 \/ 整改责任人/.test(i.text)));
    assert.ok(list.some((i) => i.target === 'pi2_07' && /影像/.test(i.text)));
    assert.ok(!list.some((i) => i.target === 'pi2_08'));
    assert.ok(list.some((i) => i.text === '未选择开工判定（GO / 有条件开工 / NO-GO）'));
  }],
  ['纯英文：原表只有中文的标签都配了英文（enOnly），中文 / 双语不显示', () => {
    // 所有中文-only 的标签（节说明、判定项、填写项、信息栏、规则）都有不含中文的英文版
    // 图例 / 页脚是整行字符串：纯英文文件用 doc.enOnly 里的
    assert.ok(!CJK.test(t.doc.enOnly.legend) && !CJK.test(t.doc.enOnly.footer));
    const labels = [
      t.doc.subtitle,
      ...allFields(t).map((f) => f.label),
      ...lists.flatMap((s) => [s.title, s.note].filter(Boolean)),
      ...allItems(t).map(({ item }) => item.title),
      ...t.sections.filter((s) => s.type === 'note').flatMap((s) => [s.title, ...s.lines]),
    ];
    for (const l of labels) {
      const en = typeof l.enOnly === 'string' ? l.enOnly : l.en || l.zh;
      assert.ok(en && !CJK.test(en), `缺英文：${JSON.stringify(l)}`);
    }
    // 判定项的英文是整句（原表英文行只是大写短标题）
    assert.equal(byId.pi1_01.title.enOnly, 'Final payment received; delivery & installation can be scheduled');
    assert.equal(byId.pi2_04.title.enOnly, 'Temporary water & power available and sufficient for the crew');
    // 规则最后一行：中文文件不带「Fail」
    const rule = t.sections.find((s) => s.type === 'note');
    assert.equal(rule.lines.at(-1).zhOnly, '规则:任一关键项(★)判定为「否」,一律不得开工。现场主管无权放行,须由项目经理复核。');
  }],
  ['summary：中文 / English / 双语（双语与原来逐字一致）', () => {
    const nogo = allPass({ pi3_03: { r: 'F' }, pi1_01: { r: 'F' } });
    const zh = t.summary(ctxOf(nogo, 'zh'));
    const both = t.summary(ctxOf(nogo, 'both'));
    const en = t.summary(ctxOf(nogo, 'en'));
    // 中文 = 原来的中文写法（双语里本来就只有中文的部分不变）
    assert.deepEqual(zh.conclusion, both.conclusion);
    assert.deepEqual(zh.items.slice(0, 6), both.items.slice(0, 6));
    assert.equal(zh.items[7].value, 'GO 可开工');
    assert.equal(both.items[6].value, '1 项 items');
    assert.equal(zh.items[6].value, '1 项');
    assert.equal(en.items[6].value, '1 item');
    assert.equal(en.items[0].value, 'Pass 1 · Fail 1');
    assert.equal(en.items[0].label.enOnly, 'O1 ORDER');
    assert.equal(en.items[7].value, 'GO — Cleared to start');
    assert.equal(en.conclusion.value, 'NO-GO — Entry on hold');
    assert.equal(en.conclusion.note, 'A key item failed. Entry only after rectification and a passed re-check. (O1-01)');
    const cond = t.summary(ctxOf(allPass({ pi3_03: { r: 'F' }, pi4_02: { r: 'F' } }), 'en'));
    assert.equal(cond.conclusion.value, 'Conditional start');
    assert.equal(cond.conclusion.note, '2 general issues (O3-03, O4-02): list the person in charge and deadline; installation not affected');
    const blank = t.summary(makeCtx({ template: t, report: {}, lang: 'en' }));
    assert.equal(blank.conclusion.value, 'Incomplete');
    assert.equal(blank.conclusion.note, '18 key items (★) not yet checked');
    assert.equal(blank.items[0].value, 'Pass 0 · Fail 0 · Unanswered 2');
    assert.equal(blank.items[7].value, 'Not selected');
    assert.equal(t.summary(makeCtx({ template: t, report: {}, lang: 'zh' })).items[7].value, '未选择');
    for (const s of [en, cond, blank]) {
      const vals = [...s.items.map((i) => i.value), s.conclusion.value, s.conclusion.note].join('\n');
      assert.ok(!CJK.test(vals), vals);
    }
  }],
  ['文件名 / 进场天数：按语言', () => {
    const r = createReport(t, { project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
    r.values.date = '2026-10-09';
    assert.equal(t.filename(ctxOf(r)), '场前审核_Tuai Timur Residence 17-3（Hailey）_2026-10-09');
    assert.equal(t.filename(ctxOf(r, 'zh')), '场前审核_Tuai Timur Residence 17-3（Hailey）_2026-10-09');
    assert.equal(t.filename(ctxOf(r, 'en')), 'Pre-Install_Audit_Tuai Timur Residence 17-3 (Hailey)_2026-10-09');
    // 默认文件语言是 English：新建时进场天数写英文
    const e = createReport(t, { project: SAMPLE_PROJECT, settings: { ...SAMPLE_SETTINGS, docLang: 'en' } });
    assert.equal(e.values.entry, '2026-10-08 · 5 days');
    assert.equal(createReport(t, { project: { ...SAMPLE_PROJECT, plannedDays: 1 }, settings: { docLang: 'en' } }).values.entry, '2026-10-08 · 1 day');
  }],
  ['界面语言：提醒文字 English / 中英；输入框提示 / 首页说明', () => {
    const en = (r) => checksText(ctxOf(r), 'en');
    assert.deepEqual(en({}), ['No start decision selected (GO / Conditional / NO-GO)']);
    assert.deepEqual(checksText(ctxOf({}), 'both'), ['未选择开工判定（GO / 有条件开工 / NO-GO） / No start decision selected (GO / Conditional / NO-GO)']);
    assert.deepEqual(en(allPass()), []);
    assert.deepEqual(en(allPass({ pi2_03: { r: 'F', note: 'Damp' } })), ['A key item failed — cannot choose GO']);
    assert.deepEqual(en(allPass({ pi2_03: { r: 'F', note: 'Damp' }, pis_01: { r: 'COND' } })), [
      'A key item failed — cannot choose "Conditional"',
      'Conditional start: list the issue / person in charge / deadline under "Remarks / person in charge & deadline"',
    ]);
    assert.deepEqual(en(allPass({ pi4_02: { r: 'F' } })), ['1 general issue still open — choose "Conditional"']);
    assert.deepEqual(en(allPass({ pi4_02: { r: 'F' }, pi3_03: { r: 'F' } })), ['2 general issues still open — choose "Conditional"']);
    assert.deepEqual(en(allPass({ pi1_02: { r: '' }, pi2_01: { r: '' } })), ['2 key items (★) not checked yet — cannot give clearance']);
    const r = allPass();
    r.signatures.pm = { name: '', date: '', image: null };
    assert.deepEqual(en(r), ['The site supervisor cannot give clearance — the project manager must review and sign']);
    // 中文界面照旧；中英 =「中文 / English」；English 不含中文
    for (const rep of [{}, allPass({ pi2_03: { r: 'F' }, pis_01: { r: 'COND' } }), allPass({ pi4_02: { r: 'F' } }), r]) {
      const zh = checksText(ctxOf(rep));
      const e = en(rep);
      assert.equal(zh.length, e.length);
      assert.deepEqual(checksText(ctxOf(rep), 'both'), zh.map((z, i) => `${z} / ${e[i]}`));
      assert.ok(!CJK.test(e.join('\n')), e.join('\n'));
    }
    // issues() 按界面语言取模板提醒
    assert.ok(issues(t, createReport(t, {}), { lang: 'en' }).some((i) => i.text === 'No start decision selected (GO / Conditional / NO-GO)'));
    // 输入框提示（只在 App 里显示）：{ zh, en }，中文 = 原表「填写示例」
    const phs = [...allFields(t).map((f) => f.placeholder), ...allItems(t).map(({ item }) => item.input?.placeholder)].filter(Boolean);
    assert.equal(phs.length, 7);
    for (const ph of phs) assert.ok(CJK.test(ph.zh) && ph.en && !CJK.test(ph.en), JSON.stringify(ph));
    assert.equal(byId.pi4_05.input.placeholder.en, 'e.g. Unload at B2 → service lift → 18F → living room staging area');
    assert.deepEqual(t.desc, { zh: '5O 五步核查 · ★ 关键项不过不得开工', en: '5O five-step check · No start if any ★ key item fails' });
  }],
];
