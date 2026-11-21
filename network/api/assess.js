/* ============================================================
   POST /api/assess
   body: { me: {...我的资料}, person: {...}, company: {...背景} }
   回：  { assessment: {...}, usage }
   Sonnet 5.5 深度分析：「值得认识吗」4 个维度 + 我能给他的资源（家具以外）。
   只在按「深度分析」时跑。
   ============================================================ */
import { HttpError, cleanText } from './_lib/http.js';
import { getClient, textOf, extractJson, checkStop, FALLBACK_BETA, callWithin, badOutput } from './_lib/ai.js';
import { aiEndpoint } from './_lib/run.js';
import { MODELS, usageRow } from './_lib/cost.js';

export const DIM_KEYS = ['business', 'connector', 'has_what_i_lack', 'i_can_help'];

const dim = {
  type: 'object', additionalProperties: false, required: ['score', 'reason'],
  properties: { score: { type: 'integer', description: '0–10' }, reason: { type: 'string', description: '一两句中文理由，要具体，引用资料里的事实' } },
};
const strArr = { type: 'array', items: { type: 'string' } };

export const ASSESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dims', 'one_line', 'suggested_tier', 'give_ideas', 'has', 'needs', 'talk_topics', 'caution'],
  properties: {
    dims: {
      type: 'object', additionalProperties: false, required: DIM_KEYS,
      properties: {
        business: { ...dim, description: '能带来家具 / 全屋定制生意（他自己、他的客户、他的项目）' },
        connector: { ...dim, description: '是超级连接者（商会职位、认识很多人、常办活动、KOL）' },
        has_what_i_lack: { ...dim, description: '有我缺的资源（对照「我缺的」清单）' },
        i_can_help: { ...dim, description: '我能帮到他（对照「我有的」清单，家具以外的也算）' },
      },
    },
    one_line: { type: 'string', description: '一句话总结：这个人值不值得花时间、为什么' },
    suggested_tier: { type: 'string', enum: ['core', 'important', 'active', 'known'] },
    give_ideas: {
      type: 'array',
      description: '3–5 个「我可以给他什么」——家具以外的资源、介绍、知识、机会；要具体可以马上做',
      items: {
        type: 'object', additionalProperties: false, required: ['idea', 'why', 'effort'],
        properties: { idea: { type: 'string' }, why: { type: 'string' }, effort: { type: 'string', enum: ['low', 'medium', 'high'] } },
      },
    },
    has: { ...strArr, description: '他有的资源（短标签，中文）' },
    needs: { ...strArr, description: '他可能需要的（短标签，中文）' },
    talk_topics: { ...strArr, description: '下次见面可以聊的 2–4 个话题（从他感兴趣的事出发）' },
    caution: { type: 'string', description: '要小心的地方（没有就空字串）' },
  },
};

const SYSTEM = `你是人脉顾问，熟悉康妮《如何结交比你更优秀的人》和卡耐基《人性的弱点》。
你在帮一位马来西亚的老板评估一个刚认识的人。原则：
• 先想「我能给他什么」，再想「他能给我什么」——真诚、长期、互惠
• 「我能给他的」要具体、可以本周就做，而且要家具以外的东西（介绍人脉、分享资源、知识、曝光机会、活动邀请……）
• 评分要有区分度：大部分人 3–6 分，只有证据很强才给 8 分以上；资料不足就给低分并在理由里写「资料不足」
• 圈层：core = 核心 5 人，important = 重要 15 人，active = 活跃 50 人，known = 认识 150 人；刚认识的人很少直接进 core
• 理由要引用资料里的事实，不要空话
全部用简体中文。`;

function list(v, max = 20) {
  return Array.isArray(v) ? v.map((x) => cleanText(typeof x === 'string' ? x : JSON.stringify(x), 200)).filter(Boolean).slice(0, max) : [];
}

export function buildAssessPrompt({ me = {}, person = {}, company = {} }) {
  const block = (title, rows) => {
    const body = rows.filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => `- ${k}：${Array.isArray(v) ? v.join('、') : v}`);
    return body.length ? `## ${title}\n${body.join('\n')}` : '';
  };
  return [
    block('我（老板）', [
      ['我是谁 / 我的生意', cleanText(me.business, 800)],
      ['我有的资源（可以给人的）', cleanText(me.offer, 800)],
      ['我缺的 / 想找的', cleanText(me.lacking, 800)],
      ['今年目标', cleanText(me.goals, 500)],
    ]),
    block('这个人', [
      ['名字', cleanText(person.name, 100)],
      ['职位', cleanText(person.title, 200)],
      ['公司', cleanText(person.company, 200)],
      ['名片上的其他字', cleanText(person.card_notes, 600)],
      ['怎么认识的', cleanText(person.how_met, 300)],
      ['所属商会 / 圈子', list(person.circles)],
      ['兴趣', list(person.interests)],
      ['标签', list(person.tags)],
      ['已知他有的', list(person.has)],
      ['已知他需要的', list(person.needs)],
      ['要避开的话题', list(person.avoid_topics)],
      ['我的备注', cleanText(person.notes, 1500)],
      ['互动记录（新的在前）', list(person.interactions, 10)],
    ]),
    block('他的公司（网上查到的）', [
      ['名称', cleanText(company.name, 200)],
      ['行业', cleanText(company.industry, 100)],
      ['简介', cleanText(company.summary, 1200)],
      ['规模', cleanText(company.size, 200)],
      ['地点', cleanText(company.location, 200)],
      ['产品 / 服务', list(company.products)],
      ['值得注意', list(company.notable)],
      ['跟家具生意的关系', cleanText(company.furniture_angle, 300)],
      ['查询把握', company.confidence],
    ]),
  ].filter(Boolean).join('\n\n') + '\n\n请评估这个人。';
}

const clampScore = (n) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

export function normalizeAssessment(a = {}) {
  const dims = {};
  for (const k of DIM_KEYS) {
    const d = (a.dims && a.dims[k]) || {};
    dims[k] = { score: clampScore(d.score), reason: cleanText(d.reason, 400) };
  }
  const tiers = ['core', 'important', 'active', 'known'];
  return {
    dims,
    one_line: cleanText(a.one_line, 300),
    suggested_tier: tiers.includes(a.suggested_tier) ? a.suggested_tier : 'known',
    give_ideas: (Array.isArray(a.give_ideas) ? a.give_ideas : []).slice(0, 6).map((g) => ({
      idea: cleanText(g && g.idea, 200),
      why: cleanText(g && g.why, 300),
      effort: ['low', 'medium', 'high'].includes(g && g.effort) ? g.effort : 'medium',
    })).filter((g) => g.idea),
    has: list(a.has, 10),
    needs: list(a.needs, 10),
    talk_topics: list(a.talk_topics, 5),
    caution: cleanText(a.caution, 300),
  };
}

export async function assessPerson(body, deps = {}) {
  if (!body || !body.person || !cleanText(body.person.name, 100).trim()) throw new HttpError(400, { error: 'no_person' });
  const client = deps.client || getClient();
  const model = MODELS.deep;
  const message = await callWithin(deps.deadline, (opts) => client.beta.messages.create({
      model,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ASSESS_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: buildAssessPrompt(body) }],
    }, opts));
  const usage = usageRow('assess', message.model || model, message.usage);
  checkStop(message, usage);
  const parsed = extractJson(textOf(message));
  if (!parsed) throw badOutput(usage);
  return {
    assessment: { ...normalizeAssessment(parsed), model: message.model || model, assessed_at: new Date().toISOString() },
    usage,
  };
}

export default aiEndpoint('assess', assessPerson);
