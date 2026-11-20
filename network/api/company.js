/* ============================================================
   POST /api/company
   body: { name, alt_name?, website?, address?, email_domain?, industry_guess?, card_notes? }
   回：  { background: {...}, usage }
   Sonnet 5.5 + 网页搜索（最多 3 次）查公司背景。
   前端查到之后存在 companies.background，同一家公司不重复查。
   体检第 3 阶段：AI 回的格式坏了、搜索分段跑到期限还没跑完 → 回错误，**不存**。
   以前会存成「查不到」，而且以后再也不查。真的查不到才回 status: 'not_found'。
   ============================================================ */
import { HttpError, cleanText } from './_lib/http.js';
import { getClient, textOf, extractJson, checkStop, FALLBACK_BETA, callWithin, badOutput, timeoutError } from './_lib/ai.js';
import { aiEndpoint } from './_lib/run.js';
import { MODELS, usageRow, addUsage } from './_lib/cost.js';

const SYSTEM = `你是商业背景调查助手，帮一位在马来西亚做全屋定制家具的老板了解刚认识的人的公司。
用网页搜索查这家公司（优先：官网、SSM / 公司注册资料、新闻、LinkedIn、Facebook 专页、Google 商家）。
只写查得到的事实；查不到就说查不到，不要编。同名公司很多时，用名片上的网站、地址、邮箱网域来确认是不是同一家。
最后只输出一个 JSON 物件（不要其他文字），格式：
{
  "found": true/false,
  "name": "公司正式名称",
  "industry": "行业（中文，短）",
  "summary": "2–4 句中文：做什么、规模、客户是谁、有什么特别",
  "size": "规模（员工数 / 分店数 / 营业额，查不到写空字串）",
  "founded": "成立年份，查不到写空字串",
  "location": "总部 / 主要地点",
  "products": ["主要产品或服务"],
  "notable": ["值得注意的事：得奖、新闻、上市、扩张、负面新闻"],
  "furniture_angle": "这家公司或这个人可能跟全屋定制 / 家具生意有什么关系（一句中文，没有就空字串）",
  "confidence": "high / medium / low（有多确定查到的是同一家）"
}`;

export function buildCompanyPrompt(b) {
  const lines = [
    `公司名称：${cleanText(b.name, 200)}`,
    b.alt_name && `另一种写法：${cleanText(b.alt_name, 200)}`,
    b.website && `名片上的网站：${cleanText(b.website, 200)}`,
    b.email_domain && `邮箱网域：${cleanText(b.email_domain, 100)}`,
    b.address && `名片上的地址：${cleanText(b.address, 300)}`,
    b.industry_guess && `从名片猜的行业：${cleanText(b.industry_guess, 200)}`,
    b.card_notes && `名片上的其他字：${cleanText(b.card_notes, 500)}`,
  ].filter(Boolean);
  return `请查这家公司：\n${lines.join('\n')}`;
}

/** 从搜索结果和引用里收集来源网址（去重，最多 8 个） */
export function collectSources(contents) {
  const out = [];
  const seen = new Set();
  const add = (url, title) => {
    if (!url || seen.has(url) || !/^https?:\/\//.test(url)) return;
    seen.add(url);
    out.push({ url, title: cleanText(title || url, 200) });
  };
  for (const content of contents) {
    for (const block of content || []) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === 'web_search_result') add(r.url, r.title);
      }
      if (block.type === 'text' && Array.isArray(block.citations)) {
        for (const c of block.citations) add(c.url, c.title);
      }
    }
  }
  return out.slice(0, 8);
}

export async function lookupCompany(body, deps = {}) {
  const name = cleanText(body && body.name, 200).trim();
  if (!name) throw new HttpError(400, { error: 'no_company_name' });
  const client = deps.client || getClient();
  const model = MODELS.deep;
  const messages = [{ role: 'user', content: buildCompanyPrompt({ ...body, name }) }];
  const contents = [];
  let usage = {};
  let last;
  const row = () => usageRow('company', (last && last.model) || model, usage);
  // 搜索跑太久时 API 会回 pause_turn：把这一段原样接回去续跑（最多 3 段，而且要在期限内）
  for (let i = 0; i < 3; i++) {
    try {
      last = await callWithin(deps.deadline, (opts) => client.beta.messages.create({
        model,
        max_tokens: 8000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEM,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        messages,
      }, opts));
    } catch (e) {
      // 前面几段已经花了钱：带着 usage 一起丢出去记账
      if (i > 0 && e instanceof HttpError) e.usage = row();
      throw e;
    }
    usage = addUsage(usage, last.usage);
    contents.push(last.content);
    if (last.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: last.content });
  }
  if (last.stop_reason === 'pause_turn') throw timeoutError(deps.deadline || { ms: 50_000, feature: 'company' }, row());
  checkStop(last, row());
  const parsed = extractJson(textOf(last));
  // 格式坏了 ≠ 查不到：不能存，存了以后就再也不查
  if (!parsed || (parsed.found !== false && !cleanText(parsed.summary, 10).trim())) throw badOutput(row(), '公司背景这次 AI 回的格式不对，没有存；请再试一次');
  const arr = (v) => (Array.isArray(v) ? v.map((x) => cleanText(x, 300)).filter(Boolean).slice(0, 8) : []);
  const found = parsed.found !== false;
  const background = {
    status: found ? 'found' : 'not_found',
    found,
    name: cleanText(parsed.name || name, 200),
    industry: cleanText(parsed.industry, 100),
    summary: cleanText(parsed.summary, 1200),
    size: cleanText(parsed.size, 200),
    founded: cleanText(parsed.founded, 40),
    location: cleanText(parsed.location, 200),
    products: arr(parsed.products),
    notable: arr(parsed.notable),
    furniture_angle: cleanText(parsed.furniture_angle, 300),
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
    sources: collectSources(contents),
    fetched_at: new Date().toISOString(),
  };
  return { background, usage: row() };
}

export default aiEndpoint('company', lookupCompany);
