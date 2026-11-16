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

  const drop = useCallback(async (table, id) => {
    await repo.remove(table, id);
    setData((d) => {
      const next = { ...d, [table]: d[table].filter((r) => r.id !== id) };
      // state 里也照 cascade 清掉
      if (table === 'people') {
        for (const t of ['person_circles', 'resources', 'interactions', 'photo_people', 'attendance']) next[t] = next[t].filter((r) => r.person_id !== id);
      }
      if (table === 'photos') next.photo_people = next.photo_people.filter((r) => r.photo_id !== id);
      if (table === 'circles') next.person_circles = next.person_circles.filter((r) => r.circle_id !== id);
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
          has: v.resources.filter((r) => r.kind === 'has' && r.source === 'manual').map((r) => r.label),
          needs: v.resources.filter((r) => r.kind === 'needs' && r.source === 'manual').map((r) => r.label),
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

    return {
      reload,
      logUsage,
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
  }, [put, drop, reload, view, index, me, profile]);

  const value = { data, people, view, profile, me, loading, error, mode: repo.mode, imageUrl: repo.imageUrl, ...actions };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 把 view 加的衍生字段拿掉，只留数据库栏位 */
export function stripView(p) {
  const { company, resources, interactions, meetings, circles, photos, ...row } = p;
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
