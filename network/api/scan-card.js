/* ============================================================
   POST /api/scan-card
   body: { images: [{ media_type, data(base64) }] }   ← 正面（+ 背面）
   回：  { card: {...}, usage: {feature, model, ..., cost_usd} }
   用 Haiku 5.5 读名片（便宜、快）；结构化输出保证字段齐全。
   ============================================================ */
import { postHandler, HttpError } from './_lib/http.js';
import { requireOwner, requireBudget } from './_lib/auth.js';
import { getClient, textOf, extractJson, checkStop, mapAiError, cleanImages } from './_lib/ai.js';
import { MODELS, usageRow } from './_lib/cost.js';

const str = { type: 'string' };
export const CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'name_alt', 'title', 'company', 'company_alt', 'phones', 'emails', 'website', 'address', 'socials', 'industry_guess', 'card_notes', 'is_business_card'],
  properties: {
    is_business_card: { type: 'boolean', description: '图片看起来是不是名片' },
    name: { ...str, description: '主要的名字（照名片上最大的写法）' },
    name_alt: { ...str, description: '另一种写法：中文名 / 英文名 / 拼音，没有就空字串' },
    title: { ...str, description: '职位，可以多个用 / 分开' },
    company: str,
    company_alt: { ...str, description: '公司另一种语言的名字，没有就空字串' },
    phones: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['label', 'number'],
        properties: { label: { ...str, description: 'mobile / office / fax / whatsapp / other' }, number: str },
      },
    },
    emails: { type: 'array', items: str },
    website: str,
    address: str,
    socials: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['platform', 'handle'],
        properties: { platform: { ...str, description: 'linkedin / instagram / facebook / wechat / xiaohongshu / tiktok / other' }, handle: str },
      },
    },
    industry_guess: { ...str, description: '用中文猜这家公司做哪一行（一句话）' },
    card_notes: { ...str, description: '名片上其他有用的字：服务项目、标语、认证、商会头衔（中文简述）' },
  },
};

const SYSTEM = `你是名片识别助手，在马来西亚帮老板整理人脉。
名片可能是中文、英文、马来文或混合。照名片原文抄，不要翻译人名和公司名，不要自己编。
电话保留国家码（马来西亚 +60）；看不清的字段留空字串，不要猜。
WhatsApp 图示旁的号码 label 写 whatsapp。`;

export async function scanCard(body, deps = {}) {
  const images = cleanImages(body.images, 2);
  const client = deps.client || getClient();
  const model = MODELS.fast;
  let message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: CARD_SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [...images, { type: 'text', text: images.length > 1 ? '这是同一张名片的正面和背面，请合并成一个人的资料。' : '请读这张名片。' }],
      }],
    });
  } catch (e) {
    throw mapAiError(e);
  }
  checkStop(message);
  const card = extractJson(textOf(message));
  if (!card) throw new HttpError(502, { error: 'ai_bad_output', message: 'AI 回的不是 JSON，请再试一次' });
  return { card: normalizeCard(card), usage: usageRow('scan_card', message.model || model, message.usage) };
}

/** 修整 AI 回来的名片：去空白、电话去掉怪字元、email 小写、去重 */
export function normalizeCard(c = {}) {
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const phones = [];
  for (const p of Array.isArray(c.phones) ? c.phones : []) {
    const number = s(p && p.number).replace(/[^\d+()\-\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!number) continue;
    const label = s(p.label).toLowerCase() || 'mobile';
    const key = number.replace(/\D/g, '').slice(-9); // +60 12-345 6789 和 012 345 6789 是同一个号码
    const same = phones.find((x) => x.number.replace(/\D/g, '').slice(-9) === key);
    if (!same) phones.push({ label, number });
    else if (label === 'whatsapp') same.label = 'whatsapp';
  }
  const emails = [...new Set((Array.isArray(c.emails) ? c.emails : []).map((e) => s(e).toLowerCase()).filter((e) => /.+@.+\..+/.test(e)))];
  const socials = (Array.isArray(c.socials) ? c.socials : [])
    .map((x) => ({ platform: s(x && x.platform).toLowerCase() || 'other', handle: s(x && x.handle) }))
    .filter((x) => x.handle);
  return {
    is_business_card: c.is_business_card !== false,
    name: s(c.name), name_alt: s(c.name_alt), title: s(c.title),
    company: s(c.company), company_alt: s(c.company_alt),
    phones, emails, website: s(c.website), address: s(c.address), socials,
    industry_guess: s(c.industry_guess), card_notes: s(c.card_notes),
  };
}

export default postHandler(async (req, body) => {
  const ctx = await requireOwner(req);
  await requireBudget(ctx);
  return scanCard(body);
});
