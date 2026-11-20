/* ============================================================
   人脉 App · 全局状态 + 动作
   画面用 useStore() 拿资料和动作；所有写入都走 repo，回来的列再放进 state。
   ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { repo, TABLES, GUARDED, ConflictError } from './repo.js';
import { api } from './api.js';
import { shrinkImage } from './image.js';
import {
  uid, findCompany, worthScore, emailDomain, pickWhatsApp, DEFAULT_PROFILE, splitTags, mergePersonPatch, needsCompanyLookup,
} from './logic.js';
import { mergeList, appendFacts } from './talk.js';
import { relationOf, bandOf } from './relation.js';
import { cleanCard, DEFAULT_CARD } from './card.js';
import { burstQueue, syncOnce, runExclusive, applyCardRead } from './burst.js';

/* 活动连拍：正在拍的画面开着时，刚拍的先留在手机（给你加 ⭐、备注、拍背面） */
let shooting = false;
export function setShooting(on) { shooting = !!on; }
export const BURST_AUTO_READ_KEY = 'space:burst-auto-read';
export function burstAutoRead() {
  try { return localStorage.getItem(BURST_AUTO_READ_KEY) !== '0'; } catch { return true; }
}

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const empty = () => Object.fromEntries(TABLES.map((t) => [t, []]));
const nowIso = () => new Date().toISOString();

export function StoreProvider({ children }) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dataRef = useRef(data);
  dataRef.current = data;
  // 资料有没有完整载好（断网时打开会载不到）：没载好时不能说「这个人不在了」
  const loadedOk = useRef(false);

  const loadedAt = useRef(0);
  const reload = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const all = await repo.loadAll();
      dataRef.current = all;
      setData(all);
      loadedOk.current = true;
      loadedAt.current = Date.now();
    } catch (e) {
      loadedOk.current = false;
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  // 断网时打开、载不到资料 → 网络回来自动再载一次
  useEffect(() => {
    const on = () => { if (!loadedOk.current) reload(); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [reload]);
  // 体检第 3 阶段：手机、电脑同时开着 —— 切回这个 app 时（离开超过 1 分钟）悄悄载入最新的，
  // 不然拿着早上的旧资料一存，就把另一台下午改的盖掉
  useEffect(() => {
    const on = () => {
      if (document.visibilityState !== 'visible' || !loadedOk.current) return;
      if (Date.now() - loadedAt.current > 60_000) reload({ quiet: true });
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [reload]);

  /* ---------- 底层：写一列 / 删一列，同步到 state ---------- */
  const put = useCallback(async (table, row) => {
    // 已经有的人 / 公司 / 我的资料：对一下版本（这台设备最后看到的），另一台改过就不盖
    const known = GUARDED.has(table) && row.id ? (dataRef.current[table] || []).find((r) => r.id === row.id) : null;
    let saved;
    try {
      saved = await repo.upsert(table, { id: row.id || uid(), ...row }, known && known.updated_at ? { expectUpdatedAt: known.updated_at } : undefined);
    } catch (e) {
      if (e instanceof ConflictError) reload({ quiet: true });
      throw e;
    }
    const apply = (d) => {
      const list = d[table] || [];
      const i = list.findIndex((r) => r.id === saved.id);
      const next = i >= 0 ? list.map((r) => (r.id === saved.id ? saved : r)) : [...list, saved];
      return { ...d, [table]: next };
    };
    // dataRef 马上更新：接下来的动作（例如连拍同步）不用等画面重画就看得到刚存的
    dataRef.current = apply(dataRef.current);
    setData(apply);
    return saved;
  }, [reload]);

  const drop = useCallback(async (table, id) => {
    await repo.remove(table, id);
    const apply = (d) => {
      const next = { ...d, [table]: d[table].filter((r) => r.id !== id) };
      // state 里也照 cascade 清掉
      if (table === 'people') {
        for (const t of ['person_circles', 'resources', 'interactions', 'photo_people', 'attendance']) next[t] = next[t].filter((r) => r.person_id !== id);
      }
      if (table === 'photos') next.photo_people = next.photo_people.filter((r) => r.photo_id !== id);
      if (table === 'circles') next.person_circles = next.person_circles.filter((r) => r.circle_id !== id);
      if (table === 'events') next.attendance = next.attendance.filter((r) => r.event_id !== id);
      return next;
    };
    dataRef.current = apply(dataRef.current);
    setData(apply);
  }, []);

  /* ---------- 衍生：一个人的完整资料 ---------- */
  const index = useMemo(() => {
    const companies = new Map(data.companies.map((c) => [c.id, c]));
    const circles = new Map(data.circles.map((c) => [c.id, c]));
    const photos = new Map(data.photos.map((p) => [p.id, p]));
    const group = (list, key) => {
      const m = new Map();
      for (const r of list) {
        if (!m.has(r[key])) m.set(r[key], []);
        m.get(r[key]).push(r);
      }
      return m;
    };
    return {
      companies, circles, photos,
      resourcesBy: group(data.resources, 'person_id'),
      interactionsBy: group(data.interactions, 'person_id'),
      circlesBy: group(data.person_circles, 'person_id'),
      photoPeopleBy: group(data.photo_people, 'person_id'),
      peopleByPhoto: group(data.photo_people, 'photo_id'),
      now: Date.now(), // 好感度、该不该联系都用同一个「现在」算
    };
  }, [data]);

  const view = useCallback((p) => {
    if (!p) return null;
    const interactions = (index.interactionsBy.get(p.id) || []).slice().sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
    return {
      ...p,
      company: p.company_id ? index.companies.get(p.company_id) || null : null,
      resources: index.resourcesBy.get(p.id) || [],
      interactions,
      meetings: interactions.filter((i) => ['meeting', 'event', 'card_scan'].includes(i.kind)).length,
      circles: (index.circlesBy.get(p.id) || []).map((pc) => ({ ...index.circles.get(pc.circle_id), link: pc })).filter((c) => c.id),
      photos: (index.photoPeopleBy.get(p.id) || []).map((pp) => index.photos.get(pp.photo_id)).filter(Boolean)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      // 第 3 阶段：好感度、趋势、上次联系、该不该联系了（由互动记录算出来）
      rel: relationOf(p, interactions, index.now),
    };
  }, [index]);

  const people = useMemo(() => data.people.map(view), [data.people, view]);
  const profile = data.profile[0] || null;
  const me = profile || DEFAULT_PROFILE;

  /* ---------- 动作 ---------- */
  const actions = useMemo(() => {
    // 体检第 3 阶段：服务器已经记过账（logged: true）就不再记；本机模式 / 服务器没记成才由这里记
    const logUsage = (row) => {
      if (!row) return null;
      const { logged, ...clean } = row;
      if (logged) {
        // 资料库里已经有了：只放进画面（「设定」的本月用量马上看得到），不再写一次
        const local = { id: uid(), ...clean, at: nowIso() };
        dataRef.current = { ...dataRef.current, ai_usage: [...dataRef.current.ai_usage, local] };
        setData((d) => ({ ...d, ai_usage: [...d.ai_usage, local] }));
        return null;
      }
      return put('ai_usage', { ...clean, at: nowIso() }).catch(() => null);
    };

    const snapshot = (person, reason) => put('relationship_snapshots', {
      person_id: person.id, at: nowIso(), affinity: person.affinity, tier: person.tier, worth_score: person.worth_score ?? null, reason,
    }).catch(() => null);

    async function ensureCompany(name, extra = {}) {
      const n = String(name || '').trim();
      if (!n) return null;
      const hit = findCompany(dataRef.current.companies, n);
      if (hit) {
        // 补上名片上新看到的资料（不覆盖已经有的）
        const patch = {};
        for (const k of ['name_alt', 'website', 'address', 'industry']) if (!hit[k] && extra[k]) patch[k] = extra[k];
        return Object.keys(patch).length ? put('companies', { ...hit, ...patch }) : hit;
      }
      return put('companies', {
        name: n, name_alt: extra.name_alt || '', website: extra.website || '', address: extra.address || '', industry: extra.industry || '',
      });
    }

    async function addPhoto(personIds, file, { kind = 'group', caption = '', maxSide = 2000, id = uid() } = {}) {
      const owner = await repo.userId();
      const img = file.blob ? file : await shrinkImage(file, maxSide);
      const path = `${owner}/${id}.jpg`;
      await repo.uploadImage(path, img.blob);
      const photo = await put('photos', { id, kind, path, width: img.width, height: img.height, caption, taken_at: nowIso() });
      // 按第二次（上一次中途失败）不会重复标
      for (const pid of personIds) {
        if (!dataRef.current.photo_people.some((pp) => pp.photo_id === id && pp.person_id === pid)) await put('photo_people', { photo_id: id, person_id: pid });
      }
      return photo;
    }

    /**
     * 名片扫完存成一个新的人（或更新已存在的人）
     * ids：这一次扫描固定的 id（画面打开时就定好）→ 中途失败再按一次「存起来」，不会多出第二个人 / 第二张照片
     * eventId：在哪个活动认识的 → 记出席
     */
    async function saveFromCard({ card, form, cardImages = [], existingId = null, ids = {}, eventId = null }) {
      const company = await ensureCompany(form.company, {
        name_alt: card.company_alt, website: form.website, address: form.address, industry: card.industry_guess,
      });
      const base = existingId ? dataRef.current.people.find((p) => p.id === existingId) : null;
      const merged = {
        ...(base || {}),
        id: existingId || ids.person || uid(),
        name: form.name.trim(),
        name_alt: form.name_alt || (base && base.name_alt) || '',
        title: form.title || (base && base.title) || '',
        company_id: company ? company.id : (base && base.company_id) || null,
        phones: mergeBy([...(base ? base.phones || [] : []), ...form.phones], (p) => p.number.replace(/\D/g, '').slice(-9)),
        emails: [...new Set([...(base ? base.emails || [] : []), ...form.emails])],
        whatsapp: form.whatsapp || (base && base.whatsapp) || pickWhatsApp(form.phones),
        website: form.website || (base && base.website) || '',
        address: form.address || (base && base.address) || '',
        socials: mergeBy([...(base ? base.socials || [] : []), ...(card.socials || [])], (s) => `${s.platform}:${s.handle}`),
        card_notes: [base && base.card_notes, card.card_notes].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n'),
        how_met: form.how_met || (base && base.how_met) || '',
        met_on: form.met_on || (base && base.met_on) || null,
        notes: [base && base.notes, form.notes].filter(Boolean).join('\n'),
        tags: [...new Set([...(base ? base.tags || [] : []), ...splitTags(form.tags)])],
        tier: (base && base.tier) || 'known',
        affinity: (base && base.affinity) ?? 50,
        interests: (base && base.interests) || [],
      };
      const person = await put('people', merged);
      if (cardImages.length) {
        let first = null;
        for (const [i, img] of cardImages.entries()) {
          const ph = await addPhoto([person.id], img, { kind: 'card', caption: '名片', id: (ids.photos || [])[i] || uid() });
          first = first || ph;
        }
        if (first && !person.card_photo_id) await put('people', { ...person, card_photo_id: first.id });
      }
      await put('interactions', {
        ...(ids.interaction ? { id: ids.interaction } : {}),
        person_id: person.id, kind: cardImages.length ? 'card_scan' : 'meeting', source: cardImages.length ? 'card' : 'manual', occurred_at: form.met_on ? new Date(form.met_on).toISOString() : nowIso(),
        title: !cardImages.length ? (existingId ? '更新资料' : '认识') : existingId ? '又扫到他的名片' : '交换名片', summary: form.how_met || '',
      });
      if (eventId && dataRef.current.events.some((e) => e.id === eventId)
        && !dataRef.current.attendance.some((a) => a.event_id === eventId && a.person_id === person.id)) {
        await put('attendance', { event_id: eventId, person_id: person.id, status: 'attended' });
      }
      if (!existingId) await snapshot(person, '新认识');
      return person;
    }

    /**
     * 深度分析：公司背景（查过就不查）→ 4 维度评分 + 我能给他什么
     * 体检第 3 阶段：公司背景这次没查成（超时 / 格式坏）→ 不挡住评分，先用名片资料分析，onWarn 告诉画面
     */
    async function deepAnalyze(personId, { refreshCompany = false, onStep = () => {}, onWarn = () => {} } = {}) {
      const d = dataRef.current;
      let person = d.people.find((p) => p.id === personId);
      if (!person) throw new Error('找不到这个人');
      let company = person.company_id ? d.companies.find((c) => c.id === person.company_id) : null;

      if (company && (refreshCompany || needsCompanyLookup(company.background))) {
        onStep('company');
        try {
          const { background, usage } = await api.company({
            name: company.name, alt_name: company.name_alt, website: company.website || person.website, address: company.address || person.address,
            email_domain: emailDomain(person.emails), industry_guess: company.industry, card_notes: person.card_notes,
          });
          logUsage(usage);
          company = await put('companies', { ...company, background, background_at: nowIso(), industry: company.industry || background.industry });
        } catch (e) {
          if (e && e.usage) logUsage(e.usage);
          // 预算、登入这类问题评分也一样会失败 → 照样丢出去；只有「这次 AI 没弄好」才跳过公司继续
          if (!(e && (e.status === 502 || e.status === 504))) throw e;
          onWarn(`公司背景没查成（${e.message}）先用名片资料分析，之后可以按「重新查公司」`);
        }
      }

      onStep('assess');
      const v = view(person);
      let assessment;
      let usage;
      try {
        ({ assessment, usage } = await api.assess({
        me,
        person: {
          name: person.name, title: person.title, company: company ? company.name : '', card_notes: person.card_notes,
          how_met: person.how_met, notes: person.notes, interests: person.interests, tags: person.tags,
          circles: v.circles.map((c) => (c.link.role ? `${c.name}（${c.link.role}）` : c.name)),
          // 手动加的 + 从对话整理、勾选过的（上一次 AI 推测的不算，会被这次换掉）
          has: v.resources.filter((r) => r.kind === 'has' && r.source !== 'ai').map((r) => r.label),
          needs: v.resources.filter((r) => r.kind === 'needs' && r.source !== 'ai').map((r) => r.label),
          avoid_topics: person.avoid_topics || [],
          interactions: v.interactions.slice(0, 10).map((i) => `${String(i.occurred_at).slice(0, 10)} ${i.title} ${i.summary}`.trim()),
        },
        company: company && company.background ? company.background : (company ? { name: company.name, industry: company.industry } : {}),
        }));
      } catch (e) {
        if (e && e.usage) logUsage(e.usage);
        throw e;
      }
      logUsage(usage);
      person = await put('people', { ...person, assessment, worth_score: worthScore(assessment) });

      // AI 推出来的资源标签：换掉上一次 AI 的，手动加的保留
      for (const r of dataRef.current.resources.filter((x) => x.person_id === personId && x.source === 'ai')) await drop('resources', r.id);
      const manual = new Set(dataRef.current.resources.filter((x) => x.person_id === personId).map((x) => `${x.kind}:${x.label}`));
      for (const [kind, labels] of [['has', assessment.has], ['needs', assessment.needs]]) {
        for (const label of labels) if (!manual.has(`${kind}:${label}`)) await put('resources', { person_id: personId, kind, label, source: 'ai' });
      }
      await snapshot(person, '深度分析');
      onStep('done');
      return person;
    }

    /**
     * 第 2 阶段：对话整理好、勾选过 → 写进人物档案
     *   interaction（逐字稿 + AI 结果）、兴趣、资源（source = talk）、备注后面接近况、要避开的话题、上次联系
     * pick = 使用者勾选要留的：{ interests, has, needs, give, facts, avoid_topics, action_items }
     */
    async function saveTalk(personId, { source, kind, occurredAt, title, summary, transcript, analysis = null, pick = {}, range = null }) {
      let person = dataRef.current.people.find((p) => p.id === personId);
      if (!person) throw new Error('找不到这个人');
      const at = occurredAt || nowIso();
      const day = at.slice(0, 10);
      const { transcript: _shot, ...rest } = analysis || {}; // 截图抄出来的字放 interactions.transcript，不重复放 ai
      // 存进 ai 的也只放勾选过的（没勾的 = 本人认为 AI 抓错了，下次不要再看到）
      const ai = analysis ? {
        ...rest,
        ...Object.fromEntries(['interests', 'has', 'needs', 'give', 'facts', 'avoid_topics'].map((k) => [k, pick[k] || []])),
        action_items: (pick.action_items || []).map((x) => ({ ...x, done: false })),
        range,
      } : (range ? { range } : null);
      const interaction = await put('interactions', {
        person_id: personId, kind, source, occurred_at: at, title: title || '', summary: summary || '', transcript: transcript || null, ai,
      });

      const patch = {};
      if (pick.interests && pick.interests.length) patch.interests = mergeList(person.interests || [], pick.interests);
      if (pick.avoid_topics && pick.avoid_topics.length) patch.avoid_topics = mergeList(person.avoid_topics || [], pick.avoid_topics);
      if (pick.facts && pick.facts.length) patch.notes = appendFacts(person.notes, pick.facts, day);
      if (['meeting', 'call', 'message', 'event'].includes(kind) && (!person.last_contact_at || at > person.last_contact_at)) patch.last_contact_at = at;
      if (Object.keys(patch).length) person = await put('people', { ...person, ...patch });

      const have = new Set(dataRef.current.resources.filter((r) => r.person_id === personId && r.source !== 'ai').map((r) => `${r.kind}:${r.label.trim().toLowerCase()}`));
      const rows = [
        ...(pick.has || []).map((x) => ['has', x.label, x.detail]),
        ...(pick.needs || []).map((x) => ['needs', x.label, x.detail]),
        ...(pick.give || []).map((x) => ['give', x.idea, x.why]),
      ];
      for (const [k, label, detail] of rows) {
        const key = `${k}:${String(label).trim().toLowerCase()}`;
        if (!label || have.has(key)) continue;
        have.add(key);
        // 跟上一次深度分析推测的一样 → 换成「对话里确认过」的那一笔
        const guess = dataRef.current.resources.find((r) => r.person_id === personId && r.source === 'ai' && `${r.kind}:${r.label.trim().toLowerCase()}` === key);
        if (guess) await drop('resources', guess.id);
        await put('resources', { person_id: personId, kind: k, label, detail: [detail, `${day} 对话`].filter(Boolean).join(' · '), source: 'talk' });
      }
      return interaction;
    }

    /** 承诺打勾 / 取消 */
    async function toggleActionItem(interaction, index) {
      const items = ((interaction.ai && interaction.ai.action_items) || []).map((x, i) => (i === index ? { ...x, done: !x.done, done_at: x.done ? null : nowIso() } : x));
      return put('interactions', { ...interaction, ai: { ...interaction.ai, action_items: items } });
    }

    /** 第 3 阶段：快速记一笔「联系过了」（今日行动 / 提示卡用） */
    async function quickContact(personId, kind = 'message', title = '') {
      const person = dataRef.current.people.find((p) => p.id === personId);
      if (!person) throw new Error('找不到这个人');
      const at = nowIso();
      const saved = await put('interactions', { person_id: personId, kind, source: 'manual', occurred_at: at, title: title || { message: '发了讯息', call: '打了电话', meeting: '见面' }[kind] || '联系', summary: '' });
      await put('people', { ...person, last_contact_at: at, snooze_until: person.snooze_until ? null : person.snooze_until });
      return saved;
    }

    /** 晚点再说：N 天内不出现在「今天该找谁」 */
    async function snooze(personId, days) {
      const person = dataRef.current.people.find((p) => p.id === personId);
      if (!person) throw new Error('找不到这个人');
      let until = null;
      if (days > 0) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        until = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      try {
        return await put('people', { ...person, snooze_until: until });
      } catch (e) {
        if (/snooze_until/.test(String(e.message))) throw new Error('资料库还没升级：Supabase 重跑一次 schema.sql（见 DEPLOY.md「第 3 阶段升级」）');
        throw e;
      }
    }

    /**
     * 好感度存回 people.affinity（汇出、以后群发筛选用）：差 3 分以上才写；
     * 跨过一个等级（朋友 → 点头之交）再记一笔快照，画趋势、看历史用。
     */
    async function syncAffinity(views) {
      let n = 0;
      for (const v of views) {
        const a = v.rel.affinity;
        if (Math.abs((v.affinity ?? 50) - a) < 3) continue;
        const row = dataRef.current.people.find((p) => p.id === v.id);
        if (!row) continue;
        const from = bandOf(row.affinity ?? 50);
        const saved = await put('people', { ...row, affinity: a });
        if (from.key !== bandOf(a).key) await snapshot(saved, `好感度：${from.label} → ${bandOf(a).label}`);
        if (++n >= 40) break; // 一次最多 40 个，剩下的下次开 app 再补
      }
      return n;
    }

    /* ---------- 第 4 阶段：我的名片 + 扫码留资料 ---------- */
    async function saveCard(card) {
      try {
        return await put('profile', { ...(profile || DEFAULT_PROFILE), card: cleanCard(card) });
      } catch (e) {
        if (/card/.test(String(e.message)) && /column/.test(String(e.message))) throw new Error('资料库还没升级：Supabase 重跑一次 schema.sql（见 DEPLOY.md「第 4 阶段升级」）');
        throw e;
      }
    }

    /** 名片的照片 / 视频 / 案例图 → 公开 bucket，回存储路径 */
    async function uploadCardMedia(file, kind = 'photo') {
      const owner = await repo.userId();
      const stamp = Date.now().toString(36);
      if (/^video\//.test(file.type)) {
        if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) throw new Error('视频只收 MP4 / WebM / MOV');
        if (file.size > 50 * 1024 * 1024) throw new Error('视频太大了（最多 50MB）：先剪短一点、或用 720p 汇出');
        const ext = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[file.type];
        const path = `${owner}/card/${kind}-${stamp}.${ext}`;
        await repo.uploadPublic(path, file);
        return path;
      }
      const img = await shrinkImage(file, kind === 'case' ? 1400 : 1800, 0.84);
      const path = `${owner}/card/${kind}-${stamp}.jpg`;
      await repo.uploadPublic(path, img.blob);
      return path;
    }

    async function saveEvent(row) {
      return put('events', { name: String(row.name || '').trim(), held_on: row.held_on || null, location: row.location || '', notes: row.notes || '', ...(row.id ? { id: row.id } : {}) });
    }

    /** 新朋友：确认（不再出现在「新朋友」） */
    async function confirmNew(ids) {
      for (const id of ids) {
        const row = dataRef.current.people.find((p) => p.id === id);
        if (row && row.pending_review) await put('people', { ...row, pending_review: false });
      }
    }

    /**
     * 新朋友只拍了名片：用 AI 读那张名片 —— **先不存**（体检第 3 阶段）
     * 回 { card, draft }：draft = 补进去之后会长什么样（你已经填的不会被换掉），给画面让你核对、改
     */
    async function readCardWithAI(personId) {
      const row = dataRef.current.people.find((p) => p.id === personId);
      if (!row) throw new Error('找不到这个人');
      const photo = dataRef.current.photos.find((ph) => ph.id === row.card_photo_id);
      if (!photo) throw new Error('这个人没有名片照片');
      const blob = await (await fetch(await repo.imageUrl(photo.path))).blob();
      const img = await shrinkImage(blob, 1600);
      let res;
      try {
        res = await api.scanCard([{ media_type: img.media_type, data: img.base64 }]);
      } catch (e) {
        if (e && e.usage) logUsage(e.usage);
        throw e;
      }
      logUsage(res.usage);
      const card = res.card || {};
      const draft = applyCardRead(row, card);
      const company = row.company_id ? dataRef.current.companies.find((c) => c.id === row.company_id) : null;
      return { card, draft: { ...draft, company: (company && company.name) || card.company || '' } };
    }

    /** 核对过的名片资料存进去（form = 画面上改好的） */
    async function saveCardReview(personId, card, form) {
      const row = dataRef.current.people.find((p) => p.id === personId);
      if (!row) throw new Error('找不到这个人');
      const c = card || {};
      const company = form.company && form.company.trim()
        ? await ensureCompany(form.company, { name_alt: c.company_alt, website: form.website, address: form.address, industry: c.industry_guess })
        : null;
      const phones = (form.phones || []).filter((p) => p && String(p.number || '').trim());
      const fresh = dataRef.current.people.find((p) => p.id === personId) || row;
      const base = applyCardRead(fresh, c); // 社交帐号、名片上的其他字、拿掉「名片还没读」那行
      return put('people', {
        ...base,
        name: String(form.name || '').trim() || base.name,
        name_alt: String(form.name_alt || '').trim(),
        title: String(form.title || '').trim(),
        company_id: company ? company.id : null,
        phones,
        emails: [...new Set(String(form.emails || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)))],
        // 原本的 WhatsApp 号码还在电话里就留着，不然照电话重挑
        whatsapp: fresh.whatsapp && phones.some((p) => String(p.number).replace(/\D/g, '').slice(-9) === String(fresh.whatsapp).replace(/\D/g, '').slice(-9)) ? fresh.whatsapp : pickWhatsApp(phones),
        website: String(form.website || '').trim(),
        address: String(form.address || '').trim(),
      });
    }

    /**
     * 活动连拍：手机上排队的名片 → 资料库（→ AI 读）。一次只跑一轮；失败的下次再来，手机上那份不会删
     */
    async function runBurstSync() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { saved: 0, read: 0, failed: 0 }; // 没网络就不白试
      return runExclusive(() => syncOnce(burstQueue(), {
        ownerId: () => repo.userId().catch(() => null),
        put,
        uploadImage: (path, blob) => repo.uploadImage(path, blob),
        hasEvent: (id) => dataRef.current.events.some((e) => e.id === id),
        getPerson: (id) => (loadedOk.current ? dataRef.current.people.find((p) => p.id === id) || null : undefined),
        scanCard: (images) => api.scanCard(images),
        logUsage,
        ensureCompany,
      }, { autoRead: burstAutoRead(), holdUntil: shooting ? Infinity : 0 }));
    }

    /**
     * 新朋友其实是已经存过的人：资料补进旧的那个（不改名字、圈层），
     * 互动、照片、活动出席、资源、圈子、扫码记录都搬过去，再删掉新的这张
     */
    async function mergePerson(fromId, intoId) {
      const d = dataRef.current;
      const from = d.people.find((p) => p.id === fromId);
      const into = d.people.find((p) => p.id === intoId);
      if (!from || !into || from.id === into.id) throw new Error('找不到要合并的人');
      const patch = mergePersonPatch(into, from);
      if (from.last_contact_at && (!into.last_contact_at || from.last_contact_at > into.last_contact_at)) patch.last_contact_at = from.last_contact_at;
      const saved = Object.keys(patch).length ? await put('people', { ...into, ...patch }) : into;
      const move = async (table, uniqueKey) => {
        for (const r of d[table].filter((x) => x.person_id === from.id)) {
          const clash = uniqueKey && d[table].some((x) => x.person_id === into.id && x[uniqueKey] === r[uniqueKey]);
          if (clash) await drop(table, r.id);
          else await put(table, { ...r, person_id: into.id });
        }
      };
      await move('interactions');
      await move('resources');
      await move('photo_people', 'photo_id');
      await move('attendance', 'event_id');
      await move('person_circles', 'circle_id');
      await repo.reassign('inbox', 'person_id', from.id, into.id);
      await drop('people', from.id);
      return saved;
    }

    return {
      reload,
      logUsage,
      mergePerson,
      saveCard,
      uploadCardMedia,
      saveEvent,
      deleteEvent: (id) => drop('events', id),
      confirmNew,
      readCardWithAI,
      saveCardReview,
      runBurstSync,
      quickContact,
      snooze,
      syncAffinity,
      saveTalk,
      toggleActionItem,
      ensureCompany,
      addPhoto,
      saveFromCard,
      deepAnalyze,
      /** 从汇出的 JSON 补回不见的资料（现在有的不动）。plan 来自 planRestore */
      async restoreBackup(plan, onProgress = () => {}) {
        let done = 0;
        const total = plan.reduce((n, [, rows]) => n + rows.length, 0);
        try {
          for (const [table, rows] of plan) {
            for (const row of rows) {
              await repo.upsert(table, row);
              done += 1;
              onProgress(done, total);
            }
          }
        } finally {
          await reload({ quiet: true }); // 中途断掉也把已经补回的显示出来；再按一次会接着补剩下的
        }
        return done;
      },
      /**
       * 体检第 4 阶段：导入人脉。rows 是 importer.toPersonRow() 的结果，另外带 company（公司名字）。
       * 公司：已经有的照用，没有的一次建好；人：每批 200 个存进去。
       * 中途断掉：已经存好的会留着（再导入一次会显示「已在 SPACE」，不会重复）。
       */
      async importPeople(rows, onProgress = () => {}) {
        const companies = dataRef.current.companies;
        const newCompanies = [];
        const companyId = new Map();
        for (const r of rows) {
          const n = String(r.company || '').trim();
          if (!n || companyId.has(n.toLowerCase())) continue;
          const hit = findCompany(companies, n) || findCompany(newCompanies, n);
          if (hit) { companyId.set(n.toLowerCase(), hit.id); continue; }
          const c = { id: uid(), name: n, name_alt: '', website: '', address: '', industry: '' };
          newCompanies.push(c);
          companyId.set(n.toLowerCase(), c.id);
        }
        const append = (table, saved) => {
          const apply = (d) => ({ ...d, [table]: [...(d[table] || []), ...saved] });
          dataRef.current = apply(dataRef.current);
          setData(apply);
        };
        if (newCompanies.length) append('companies', await repo.insertMany('companies', newCompanies));
        const people = rows.map(({ company, ...r }) => ({ ...r, company_id: company ? companyId.get(String(company).trim().toLowerCase()) || null : null }));
        try {
          const saved = await repo.insertMany('people', people, (done, total, batch) => { append('people', batch); onProgress(done, total); });
          return saved.length;
        } catch (e) {
          if (e.saved && e.saved.length) e.message = `存了 ${e.saved.length} 人后停下来：${e.message}`;
          throw e;
        }
      },
      async saveProfile(patch) { return put('profile', { ...(profile || DEFAULT_PROFILE), ...patch }); },
      async savePerson(row) { return put('people', row); },
      async saveCompany(row) { return put('companies', row); },
      async createPerson(form) {
        const company = await ensureCompany(form.company);
        const person = await put('people', {
          name: form.name.trim(), title: form.title || '', company_id: company ? company.id : null,
          phones: form.phones || [], emails: form.emails || [], whatsapp: form.whatsapp || pickWhatsApp(form.phones || []),
          how_met: form.how_met || '', met_on: form.met_on || null, notes: form.notes || '', tags: splitTags(form.tags),
          tier: 'known', affinity: 50, interests: [],
        });
        await snapshot(person, '新认识');
        return person;
      },
      async setTier(person, tier) {
        const saved = await put('people', { ...stripView(person), tier });
        await snapshot(saved, '调整圈层');
        return saved;
      },
      async deletePerson(person) {
        // 只属于他的名片照片一起删；合照（还有别人）留着
        for (const ph of person.photos || []) {
          const others = (index.peopleByPhoto.get(ph.id) || []).filter((pp) => pp.person_id !== person.id);
          if (!others.length) {
            await repo.removeImage(ph.path).catch(() => null);
            await drop('photos', ph.id);
          }
        }
        await drop('people', person.id);
      },
      async addResource(personId, kind, label, detail = '') {
        const l = String(label || '').trim();
        if (!l) return null;
        return put('resources', { person_id: personId, kind, label: l, detail, source: 'manual' });
      },
      removeResource: (id) => drop('resources', id),
      async addCircle(personId, name, role = '', kind = 'circle') {
        const n = String(name || '').trim();
        if (!n) return null;
        let circle = dataRef.current.circles.find((c) => c.name.trim().toLowerCase() === n.toLowerCase());
        if (!circle) circle = await put('circles', { name: n, kind });
        if (dataRef.current.person_circles.some((pc) => pc.person_id === personId && pc.circle_id === circle.id)) return circle;
        await put('person_circles', { person_id: personId, circle_id: circle.id, role });
        return circle;
      },
      removePersonCircle: (id) => drop('person_circles', id),
      async addInteraction(person, row) {
        const saved = await put('interactions', { person_id: person.id, source: 'manual', ...row });
        if (['meeting', 'call', 'message', 'event'].includes(row.kind)) {
          const at = row.occurred_at || nowIso();
          if (!person.last_contact_at || at > person.last_contact_at) await put('people', { ...stripView(person), last_contact_at: at });
        }
        return saved;
      },
      removeInteraction: (id) => drop('interactions', id),
      async tagPhoto(photoId, personId) {
        if (dataRef.current.photo_people.some((pp) => pp.photo_id === photoId && pp.person_id === personId)) return null;
        return put('photo_people', { photo_id: photoId, person_id: personId });
      },
      untagPhoto: (id) => drop('photo_people', id),
      async deletePhoto(photo) {
        await repo.removeImage(photo.path).catch(() => null);
        for (const p of dataRef.current.people) {
          if (p.card_photo_id === photo.id || p.avatar_photo_id === photo.id) {
            await put('people', { ...p, card_photo_id: p.card_photo_id === photo.id ? null : p.card_photo_id, avatar_photo_id: p.avatar_photo_id === photo.id ? null : p.avatar_photo_id });
          }
        }
        await drop('photos', photo.id);
      },
    };
  }, [put, drop, reload, view, index, me, profile]);

  // 每天第一次打开时，把算出来的好感度存回资料库（只写变化大的）
  const synced = useRef(false);
  useEffect(() => {
    if (loading || error || synced.current || !people.length) return;
    synced.current = true;
    let today = '';
    try { today = new Date().toDateString(); if (localStorage.getItem('space:affinity-sync') === today) return; } catch { /* 无痕模式 */ }
    actions.syncAffinity(people).then(() => { try { localStorage.setItem('space:affinity-sync', today); } catch { /* 无痕模式 */ } }).catch(() => null);
  }, [loading, error, people, actions]);

  // 第 4 阶段：我的名片（还没存过就用默认值 + 「我的资料」的名字）
  const card = useMemo(() => cleanCard(profile && profile.card ? profile.card : { ...DEFAULT_CARD, name: (profile && profile.display_name) || DEFAULT_CARD.name }), [profile]);
  const newFriends = useMemo(() => people.filter((p) => p.pending_review).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [people]);

  const value = { data, people, view, profile, me, card, newFriends, loading, error, mode: repo.mode, imageUrl: repo.imageUrl, publicUrl: repo.publicUrl, ...actions };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 把 view 加的衍生字段拿掉，只留数据库栏位 */
export function stripView(p) {
  const { company, resources, interactions, meetings, circles, photos, rel, ...row } = p;
  return row;
}

function mergeBy(list, keyFn) {
  const seen = new Set();
  return list.filter((x) => {
    const k = keyFn(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
