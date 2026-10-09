// 交付执行清单 HANDOVER CHECKLIST（Sail 内部文件，无需出示客户）
// 来源：Template_Sail_Handover_Checklist_Internal.docx —— 五个 H 一条线，交付当天按顺序打勾
import { L } from './schema.js';
import { countResults, val } from './helpers.js';
import { addDays, daysBetween, fmtDate } from '../lib/format.js';

// 检查项：id = ho{节}_{序号}，no = 节内序号（原表无编号）
const I = (sec, n, zh, en, media = false) => ({
  id: `ho${sec}_${n}`,
  no: String(n),
  title: { zh, en },
  ...(media ? { media: true } : {}),
});

const remark = { label: { zh: '备注', en: 'Remarks' } };

// 回访日期默认：交付日期（没有就今天）+ n 天
const followDefault = (n) => (ctx) => addDays(ctx.report?.values?.date || ctx.today, n);

export default {
  id: 'handover',
  version: 1,
  kind: 'checklist',
  stage: 7,
  name: { zh: '交付执行清单', en: 'Handover Checklist' },
  short: 'HO',
  desc: '五个 H 一条线 · 交付当天按顺序打勾拍照',
  icon: 'KeyRound',
  accent: '#2F4A3C',
  doc: {
    brand: 'sail',
    // 原表右上角：INTERNAL · 内部文件 / 无需出示客户 not for client
    badge: { zh: 'INTERNAL · 内部文件', en: '无需出示客户 not for client' },
    title: { zh: '交付执行清单', en: 'HANDOVER CHECKLIST' },
    subtitle: { zh: '五个 H 一条线，按顺序执行。', en: 'Five H, one run — tick in order.' },
  },
  sections: [
    {
      id: 'info',
      type: 'fields',
      columns: 2,
      fields: [
        { key: 'project', type: 'text', label: { zh: '项目', en: 'Project' }, bind: 'project.siteLabel', required: true },
        { key: 'so', type: 'text', label: 'SO No.', bind: 'project.so' },
        { key: 'date', type: 'date', label: { zh: '日期', en: 'Date' }, bind: 'today', required: true },
        { key: 'pic', type: 'text', label: 'PIC', bind: 'settings.name' },
      ],
    },
    {
      id: 'habitable',
      type: 'checklist',
      no: 'Ⅰ',
      title: { zh: '交付准备', en: 'HABITABLE' },
      note: { zh: '清场完成，留下最美一刻', en: 'clean · staged · captured' },
      scale: 'done',
      remark,
      items: [
        I(1, 1, '全屋清洁完成，柜内外无粉尘胶渍', 'Full cleaning completed — interiors & exteriors free of dust and adhesive'),
        I(1, 2, '所有标签贴纸已撕除（板材·五金·玻璃·台面）', 'All stickers & labels peeled off — panels · hardware · glass · worktop'),
        I(1, 3, '保护膜、余料与包装废料全部清除', 'All protective film, offcuts and packaging waste removed'),
        I(1, 4, '五金调试：门缝对齐、抽屉顺滑、灯带点亮', 'Hardware tuned — door gaps aligned, drawers smooth, lighting on'),
        I(1, 5, '案例照/视频已拍摄（全景·细节·五金）', 'Case photos & video taken (wide shots · details · hardware)', true),
      ],
    },
    {
      id: 'handover',
      type: 'checklist',
      no: 'Ⅱ',
      title: { zh: '逐区验收', en: 'HANDOVER' },
      note: { zh: '对客环节，用 Handover List', en: 'the client-facing moment' },
      scale: 'done',
      remark,
      items: [
        I(2, 1, '引导客户逐区验收，填写 Handover List', 'Walk the client through every area — fill in the Handover List'),
        I(2, 2, 'Follow-up 项当场记入 List 的售后跟进记录', 'Follow-up items recorded in the Issue Log on the List'),
        I(2, 3, '请客户在 List 上勾选案例公开授权', 'Portfolio consent ticked by the client on the List'),
        I(2, 4, '双方签署', 'Both parties sign the List'),
      ],
    },
    {
      id: 'howto',
      type: 'checklist',
      no: 'Ⅲ',
      title: { zh: '保养讲解', en: 'HOW TO' },
      note: { zh: '教会客户，交付才完整', en: 'teach before we leave' },
      scale: 'done',
      remark,
      items: [
        I(3, 1, '板材与台面日常保养已讲解', 'Panel & worktop daily care explained'),
        I(3, 2, '五金使用与调节已示范（铰链·滑轨·上翻门）', 'Hardware use & adjustment demonstrated (hinges · drawers · lift-ups)'),
        I(3, 3, '保养讲解视频已录制', 'Care briefing video recorded', true),
        I(3, 4, '保养指南已交付', 'Care guide delivered'),
      ],
    },
    {
      id: 'hold',
      type: 'checklist',
      no: 'Ⅳ',
      title: { zh: '成品保护与收场', en: 'HOLD' },
      note: { zh: '离场前留齐证据', en: 'evidence before you leave' },
      scale: 'done',
      remark,
      items: [
        I(4, 1, '产品验收照（每区≥1张）', 'Acceptance photos — per area', true),
        I(4, 2, '成品保护/包装完成，产品包装照已拍', 'Finished-product protection applied · packaging photos taken', true),
        I(4, 3, '收场视频（一镜到底）', 'Closing walkthrough video — one take', true),
        I(4, 4, '垃圾清运·断水电·门窗上锁', 'Waste cleared · utilities off · site secured'),
        I(4, 5, '签署版 List 与全部影像已上传项目档案', 'Signed List + all media uploaded to project record', true),
      ],
    },
    {
      id: 'heart',
      type: 'checklist',
      no: 'Ⅴ',
      title: { zh: '回访与转介绍', en: 'HEART' },
      note: { zh: '服务从此刻开始', en: 'service begins now' },
      scale: 'done',
      remark,
      items: [
        I(5, 1, '客户已扫码填写反馈表', 'Feedback form completed on site (QR)'),
        I(5, 2, '已介绍转介绍礼遇', 'Referral programme introduced'),
      ],
    },
    {
      // 原表 Ⅴ 节最后一行：30天 / 1年回访日期
      id: 'followup',
      type: 'fields',
      title: { zh: '回访日期', en: 'Follow-up dates' },
      columns: 2,
      fields: [
        { key: 'followup30', type: 'date', label: { zh: '30天回访日期', en: '30-Day follow-up' }, default: followDefault(30) },
        { key: 'followup1y', type: 'date', label: { zh: '1年回访日期', en: '1-Year follow-up' }, default: followDefault(365) },
      ],
    },
    {
      // App 新增（原表无）：验收照 / 案例照集中存档 + 项目档案链接，选填
      id: 'media',
      type: 'fields',
      title: { zh: '影像与档案', en: 'Media & record' },
      note: { zh: '选填', en: 'Optional' },
      columns: 1,
      fields: [
        { key: 'acceptPhotos', type: 'photos', label: { zh: '产品验收照 / 案例照', en: 'Acceptance & case photos' }, max: 30 },
        {
          key: 'driveLink',
          type: 'url',
          label: { zh: '项目档案链接', en: 'Drive / Dropbox link' },
          placeholder: 'https://drive.google.com/…',
        },
      ],
    },
  ],
  // 完成统计：总数 + 每个 H + 未完成项 + 回访日期
  summary(ctx) {
    const lists = (ctx.template.sections || []).filter((s) => s.type === 'checklist');
    const all = countResults(ctx);
    const done = all.Y || 0;
    const total = all._total || 0;
    const items = [
      {
        label: { zh: '已完成', en: 'Done' },
        value: `${done} / ${total} 项 items`,
        tone: total && done === total ? 'pass' : done ? 'warn' : 'neutral',
      },
    ];
    const left = [];
    for (const s of lists) {
      const c = countResults(ctx, s.id);
      const d = c.Y || 0;
      items.push({
        label: { zh: `${s.no} ${s.title.zh}`, en: s.title.en },
        value: `${d} / ${c._total}`,
        tone: d === c._total ? 'pass' : d ? 'warn' : 'neutral',
      });
      for (const it of s.items) {
        if (ctx.report.items?.[it.id]?.r !== 'Y') left.push(`${s.no}-${it.no} ${L(it.title, 'zh')}`);
      }
    }
    const MAX = 6;
    items.push({
      label: { zh: '未完成', en: 'Remaining' },
      value: left.length
        ? left.slice(0, MAX).join('；') + (left.length > MAX ? `；等共 ${left.length} 项` : '')
        : '无 None',
      tone: left.length ? 'warn' : 'pass',
    });
    const f30 = val(ctx, 'followup30');
    const f1y = val(ctx, 'followup1y');
    items.push({
      label: { zh: '回访日期', en: 'Follow-up' },
      value: `30天 ${f30 ? fmtDate(f30) : '—'} · 1年 ${f1y ? fmtDate(f1y) : '—'}`,
      tone: f30 && f1y ? 'neutral' : 'warn',
    });
    return { title: { zh: '交付统计', en: 'Summary' }, items };
  },
  checks(ctx) {
    const out = [];
    const date = val(ctx, 'date');
    const f30 = val(ctx, 'followup30');
    const f1y = val(ctx, 'followup1y');
    if (!f30) out.push('未填写 30天回访日期');
    if (!f1y) out.push('未填写 1年回访日期');
    const early = (d) => {
      const n = date && d ? daysBetween(date, d) : null;
      return n != null && n <= 0;
    };
    if (early(f30)) out.push('30天回访日期不晚于交付日期，请核对');
    if (early(f1y)) out.push('1年回访日期不晚于交付日期，请核对');
    return out;
  },
  filename(ctx) {
    const v = ctx.report.values || {};
    return ['交付清单', v.project, v.date].filter(Boolean).join('_');
  },
};
