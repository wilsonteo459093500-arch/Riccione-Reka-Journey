/* ============================================================
   人脉 App · 全局状态 + 动作
   画面用 useStore() 拿资料和动作；所有写入都走 repo，回来的列再放进 state。
   ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { repo, TABLES } from './repo.js';
import { api } from './api.js';
import { shrinkImage } from './image.js';
import {
  uid, findCompany, worthScore, emailDomain, pickWhatsApp, DEFAULT_PROFILE, splitTags,
} from './logic.js';
import { mergeList, appendFacts } from './talk.js';
import { relationOf, bandOf } from './relation.js';
import { cleanCard, DEFAULT_CARD } from './card.js';
import {
  draftFor, moodFor, nextAttendance, RSVP, KINDS, polishPayload, learnings as learnFrom, POLISH_BATCH,
} from './outreach.js';

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

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await repo.loadAll());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  /* ---------- 底层：写一列 / 删一列，同步到 state ---------- */
  const put = useCallback(async (table, row) => {
    const saved = await repo.upsert(table, { id: row.id || uid(), ...row });
    setData((d) => {
      const list = d[table] || [];
      const i = list.findIndex((r) => r.id === saved.id);
      const next = i >= 0 ? list.map((r) => (r.id === saved.id ? saved : r)) : [...list, saved];
      return { ...d, [table]: next };
    });
    return saved;
  }, []);

  /** 一次写很多列（建群发时每个人一则讯息） */
  const putMany = useCallback(async (table, rows) => {
    const saved = await repo.insertMany(table, rows.map((r) => ({ id: r.id || uid(), ...r })));
    setData((d) => ({ ...d, [table]: [...(d[table] || []), ...saved] }));
    return saved;
  }, []);

  const drop = useCallback(async (table, id) => {
    await repo.remove(table, id);
    setData((d) => {
      const next = { ...d, [table]: d[table].filter((r) => r.id !== id) };
      // state 里也照 cascade 清掉
      if (table === 'people') {
        for (const t of ['person_circles', 'resources', 'interactions', 'photo_people', 'attendance', 'outreach']) next[t] = next[t].filter((r) => r.person_id !== id);
      }
      if (table === 'campaigns') next.outreach = next.outreach.filter((r) => r.campaign_id !== id);
      if (table === 'interactions') next.outreach = next.outreach.map((r) => (r.interaction_id === id ? { ...r, interaction_id: null } : r));
      if (table === 'photos') next.photo_people = next.photo_people.filter((r) => r.photo_id !== id);
      if (table === 'circles') next.person_circles = next.person_circles.filter((r) => r.circle_id !== id);
      if (table === 'events') next.attendance = next.attendance.filter((r) => r.event_id !== id);
      return next;
    });
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
    const logUsage = (row) => (row ? put('ai_usage', { ...row, at: nowIso() }).catch(() => null) : null);

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

    async function addPhoto(personIds, file, { kind = 'group', caption = '', maxSide = 2000 } = {}) {
      const owner = await repo.userId();
      const img = file.blob ? file : await shrinkImage(file, maxSide);
      const id = uid();
      const path = `${owner}/${id}.jpg`;
      await repo.uploadImage(path, img.blob);
      const photo = await put('photos', { id, kind, path, width: img.width, height: img.height, caption, taken_at: nowIso() });
      for (const pid of personIds) await put('photo_people', { photo_id: id, person_id: pid });
      return photo;
    }

    /** 名片扫完存成一个新的人（或更新已存在的人） */
    async function saveFromCard({ card, form, cardImages = [], existingId = null }) {
      const company = await ensureCompany(form.company, {
        name_alt: card.company_alt, website: form.website, address: form.address, industry: card.industry_guess,
      });
      const base = existingId ? dataRef.current.people.find((p) => p.id === existingId) : null;
      const merged = {
        ...(base || {}),
        id: existingId || uid(),
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
        for (const img of cardImages) {
          const ph = await addPhoto([person.id], img, { kind: 'card', caption: '名片' });
          first = first || ph;
        }
        if (first && !person.card_photo_id) await put('people', { ...person, card_photo_id: first.id });
      }
      await put('interactions', {
        person_id: person.id, kind: cardImages.length ? 'card_scan' : 'meeting', source: cardImages.length ? 'card' : 'manual', occurred_at: form.met_on ? new Date(form.met_on).toISOString() : nowIso(),
        title: !cardImages.length ? (existingId ? '更新资料' : '认识') : existingId ? '又扫到他的名片' : '交换名片', summary: form.how_met || '',
      });
      if (!existingId) await snapshot(person, '新认识');
      return person;
    }

    /** 深度分析：公司背景（查过就不查）→ 4 维度评分 + 我能给他什么 */
    async function deepAnalyze(personId, { refreshCompany = false, onStep = () => {} } = {}) {
      const d = dataRef.current;
      let person = d.people.find((p) => p.id === personId);
      if (!person) throw new Error('找不到这个人');
      let company = person.company_id ? d.companies.find((c) => c.id === person.company_id) : null;

      if (company && (!company.background || refreshCompany)) {
        onStep('company');
        const { background, usage } = await api.company({
          name: company.name, alt_name: company.name_alt, website: company.website || person.website, address: company.address || person.address,
          email_domain: emailDomain(person.emails), industry_guess: company.industry, card_notes: person.card_notes,
        });
        logUsage(usage);
        company = await put('companies', { ...company, background, background_at: nowIso(), industry: company.industry || background.industry });
      }

      onStep('assess');
      const v = view(person);
      const { assessment, usage } = await api.assess({
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
      });
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

    /** 新朋友只拍了名片：用 AI 读那张名片，补进资料（名字是「名片待确认」就换掉） */
    async function readCardWithAI(personId) {
      const row = dataRef.current.people.find((p) => p.id === personId);
      if (!row) throw new Error('找不到这个人');
      const photo = dataRef.current.photos.find((ph) => ph.id === row.card_photo_id);
      if (!photo) throw new Error('这个人没有名片照片');
      const blob = await (await fetch(await repo.imageUrl(photo.path))).blob();
      const img = await shrinkImage(blob, 1600);
      const { card, usage } = await api.scanCard([{ media_type: img.media_type, data: img.base64 }]);
      logUsage(usage);
      const company = !row.company_id && card.company ? await ensureCompany(card.company, { name_alt: card.company_alt, website: card.website, address: card.address, industry: card.industry_guess }) : null;
      const placeholder = !row.name || /名片待确认/.test(row.name);
      const phones = [...(row.phones || [])];
      for (const p of card.phones || []) if (!phones.some((x) => x.number.replace(/\D/g, '').slice(-9) === p.number.replace(/\D/g, '').slice(-9))) phones.push(p);
      return put('people', {
        ...row,
        name: placeholder && card.name ? card.name : row.name,
        name_alt: row.name_alt || card.name_alt || '',
        title: row.title || card.title || '',
        company_id: row.company_id || (company && company.id) || null,
        phones,
        emails: [...new Set([...(row.emails || []), ...(card.emails || [])])],
        whatsapp: row.whatsapp || pickWhatsApp(card.phones || []),
        website: row.website || card.website || '',
        address: row.address || card.address || '',
        card_notes: row.card_notes || card.card_notes || '',
        notes: String(row.notes || '').replace(/\n?名片还没读：在「新朋友」按「AI 读名片」/, '').trim(),
      });
    }


    /* ---------- 第 5 阶段：群发 + 话术 + 活动出席 ---------- */
    const rowOf = (table, id) => dataRef.current[table].find((r) => r.id === id);

    /** 活动出席：出席了 = 记一笔「活动」互动（好感度 +10）；改成别的就拿掉那笔 */
    async function setAttendance(eventId, personId, status, { soft = false } = {}) {
      const cur = dataRef.current.attendance.find((a) => a.event_id === eventId && a.person_id === personId);
      const next = soft ? nextAttendance(cur && cur.status, status) : status;
      const saved = cur && cur.status === next ? cur : await put('attendance', { ...(cur || {}), event_id: eventId, person_id: personId, status: next });
      const ev = rowOf('events', eventId);
      const mine = dataRef.current.interactions.filter((i) => i.person_id === personId && i.kind === 'event' && i.ai && i.ai.event_id === eventId);
      if (next === 'attended' && !mine.length && ev) {
        const at = ev.held_on ? new Date(`${ev.held_on}T12:00:00`).toISOString() : nowIso();
        await put('interactions', { person_id: personId, kind: 'event', source: 'manual', occurred_at: at, title: `出席活动 · ${ev.name}`, summary: ev.location || '', ai: { event_id: eventId } });
        const person = rowOf('people', personId);
        if (person && (!person.last_contact_at || at > person.last_contact_at)) await put('people', { ...person, last_contact_at: at });
      }
      if (next !== 'attended') for (const i of mine) await drop('interactions', i.id);
      return saved;
    }

    async function removeAttendance(row) {
      for (const i of dataRef.current.interactions.filter((x) => x.person_id === row.person_id && x.kind === 'event' && x.ai && x.ai.event_id === row.event_id)) await drop('interactions', i.id);
      await drop('attendance', row.id);
    }

    /** 建一次群发：每个人先用程序写好一则（不花钱） */
    async function createCampaign({ kind, name, event_id = null, occasion = '', invite = '', template = '', lang = 'auto', personIds = [] }) {
      const campaign = await put('campaigns', { kind, name: String(name || '').trim() || KINDS[kind].label, event_id, occasion, invite, template, lang });
      const event = event_id ? rowOf('events', event_id) : null;
      const rows = personIds.map((pid) => {
        const p = people.find((x) => x.id === pid);
        if (!p) return null;
        const d = draftFor({ campaign, person: p, me, event });
        return { campaign_id: campaign.id, person_id: pid, text: d.text, lang: d.lang, topic: d.topic, personal: d.personal, status: 'draft' };
      }).filter(Boolean);
      await putMany('outreach', rows);
      return campaign;
    }

    async function saveCampaign(row) { return put('campaigns', row); }

    /** 照新的模板重写还没发的（会盖掉手改过的初稿） */
    async function redraftCampaign(campaignId) {
      const campaign = rowOf('campaigns', campaignId);
      const event = campaign && campaign.event_id ? rowOf('events', campaign.event_id) : null;
      for (const r of dataRef.current.outreach.filter((o) => o.campaign_id === campaignId && o.status === 'draft')) {
        const p = people.find((x) => x.id === r.person_id);
        if (!p) continue;
        const d = draftFor({ campaign, person: p, me, event });
        await put('outreach', { ...r, text: d.text, lang: d.lang, topic: d.topic, personal: d.personal, polished: false });
      }
    }

    /** 换一个话题（兴趣 / 他在找的轮流）；-1 = 不提 */
    async function changeTopic(row, topicIndex) {
      const campaign = rowOf('campaigns', row.campaign_id);
      const p = people.find((x) => x.id === row.person_id);
      if (!campaign || !p) return null;
      const event = campaign.event_id ? rowOf('events', campaign.event_id) : null;
      const d = draftFor({ campaign: { ...campaign, lang: row.lang || campaign.lang }, person: p, me, event, topic: topicIndex });
      return put('outreach', { ...row, text: d.text, topic: d.topic, personal: d.personal, polished: false });
    }

    async function editOutreach(row, patch) { return put('outreach', { ...row, ...patch }); }

    /** 点了「打开 WhatsApp」= 发了：记一笔讯息互动、上次联系；邀请的话出席名单标「邀请了」 */
    async function markSent(row) {
      const campaign = rowOf('campaigns', row.campaign_id);
      const person = rowOf('people', row.person_id);
      if (!campaign || !person) throw new Error('找不到这则讯息');
      if (row.status === 'sent') return row;
      const at = nowIso();
      const label = campaign.name || (KINDS[campaign.kind] ? KINDS[campaign.kind].label : '');
      const inter = await put('interactions', {
        person_id: person.id, kind: 'message', source: 'campaign', occurred_at: at, title: `群发：${label}`, summary: String(row.text || '').slice(0, 500), ai: null,
      });
      const saved = await put('outreach', { ...row, status: 'sent', sent_at: at, interaction_id: inter.id });
      await put('people', { ...person, last_contact_at: at, snooze_until: null });
      if (campaign.kind === 'invite' && campaign.event_id) await setAttendance(campaign.event_id, person.id, 'invited', { soft: true });
      return saved;
    }

    /** 按错了：撤回「发了」（WhatsApp 那边的讯息要自己删） */
    async function undoSent(row) {
      if (row.interaction_id && rowOf('interactions', row.interaction_id)) await drop('interactions', row.interaction_id);
      const person = rowOf('people', row.person_id);
      if (person && person.last_contact_at && row.sent_at && person.last_contact_at === row.sent_at) {
        const left = dataRef.current.interactions.filter((i) => i.person_id === person.id && ['meeting', 'call', 'message', 'event'].includes(i.kind)).map((i) => i.occurred_at).sort();
        await put('people', { ...person, last_contact_at: left.length ? left[left.length - 1] : null });
      }
      return put('outreach', { ...rowOf('outreach', row.id), status: 'draft', sent_at: null, interaction_id: null, response: null, response_at: null, rsvp: null });
    }

    /** 他怎么回：变成那笔讯息的「气氛」（进好感度）；再按一次同一个 = 清掉 */
    async function setResponse(row, response, note) {
      const r = response && row.response === response && note == null ? null : response;
      const saved = await put('outreach', { ...row, response: r || null, response_at: r ? nowIso() : null, ...(note != null ? { response_note: note } : {}) });
      const inter = row.interaction_id && rowOf('interactions', row.interaction_id);
      if (inter) {
        const { mood: _old, ...rest } = inter.ai || {};
        const mood = moodFor(r, saved.response_note);
        await put('interactions', { ...inter, ai: mood ? { ...rest, mood } : (Object.keys(rest).length ? rest : null) });
      }
      return saved;
    }

    /** 邀请的回覆：会来 / 还不确定 / 不来 → 出席名单 */
    async function setRsvp(row, rsvp) {
      const campaign = rowOf('campaigns', row.campaign_id);
      const v = row.rsvp === rsvp ? null : rsvp;
      const saved = await put('outreach', { ...row, rsvp: v });
      if (campaign && campaign.event_id) await setAttendance(campaign.event_id, row.person_id, v ? RSVP[v].attendance : 'invited');
      return saved;
    }

    /** 「别再提 XX」→ 人物的「要避开的话题」 */
    async function addAvoid(personId, topic) {
      const person = rowOf('people', personId);
      const t = String(topic || '').trim();
      if (!person || !t) return null;
      return put('people', { ...person, avoid_topics: mergeList(person.avoid_topics || [], [t]) });
    }

    /** AI 润色：Haiku，一批 20 人；只换 text，标成 polished */
    async function polishCampaign(campaignId, rowIds, onProgress = () => {}) {
      const campaign = rowOf('campaigns', campaignId);
      if (!campaign) throw new Error('找不到这次群发');
      const d = dataRef.current;
      const rows = rowIds.map((id) => d.outreach.find((o) => o.id === id)).filter((o) => o && o.status === 'draft');
      const tips = learnFrom(d.outreach, d.campaigns).map((x) => x.text);
      const event = campaign.event_id ? rowOf('events', campaign.event_id) : null;
      let done = 0;
      for (let i = 0; i < rows.length; i += POLISH_BATCH) {
        const batch = rows.slice(i, i + POLISH_BATCH);
        const payload = batch.map((row) => {
          const p = people.find((x) => x.id === row.person_id);
          return p ? polishPayload({ row, person: p, outreach: d.outreach, campaigns: d.campaigns }) : null;
        }).filter(Boolean);
        const { messages, usage } = await api.draftMessages({
          kind: campaign.kind,
          occasion: event ? event.name : campaign.occasion,
          invite: campaign.invite,
          me: { name: me.display_name, business: me.business },
          learnings: tips,
          people: payload,
        });
        logUsage(usage);
        for (const m of messages) {
          const row = rowOf('outreach', m.id);
          if (row && row.status === 'draft') await put('outreach', { ...row, text: m.text, polished: true });
        }
        done += batch.length;
        onProgress(done, rows.length);
      }
      return done;
    }

    return {
      reload,
      logUsage,
      setAttendance,
      removeAttendance,
      createCampaign,
      saveCampaign,
      redraftCampaign,
      deleteCampaign: (id) => drop('campaigns', id),
      changeTopic,
      editOutreach,
      markSent,
      undoSent,
      skipOutreach: (row, skip = true) => put('outreach', { ...row, status: skip ? 'skipped' : 'draft' }),
      setResponse,
      setRsvp,
      addAvoid,
      polishCampaign,
      saveCard,
      uploadCardMedia,
      saveEvent,
      deleteEvent: (id) => drop('events', id),
      confirmNew,
      readCardWithAI,
      quickContact,
      snooze,
      syncAffinity,
      saveTalk,
      toggleActionItem,
      ensureCompany,
      addPhoto,
      saveFromCard,
      deepAnalyze,
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
  }, [put, putMany, drop, reload, view, index, me, profile, people]);

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
