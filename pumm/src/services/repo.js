// =====================================================================
// PUMM ROUNDTABLE — 数据仓库
//
// 一层抽象盖住两个后端：
//   • cloud (Supabase)  —— 多人、多设备、实时
//   • local (IndexedDB) —— 单浏览器兜底
//
// 所有视图只调 repo.*，绝不直接碰存储，这样换后端不用动 UI。
// Supabase 建表脚本见 /supabase/schema.sql。
//
// 四个集合对应规格第 3 节的四张表：
//   members · sessions · cases · commitments
// （attendance 挂在 session.attendance 上，第二版再拆表）
// =====================================================================

import { cloudConfigured, supabase } from './supabase.js';
import { localKV } from './storage.js';
import { bootstrapMembers } from '../seed.js';

export const KINDS = ['members', 'sessions', 'cases', 'commitments', 'prospects'];

const emptyState = () => ({ members: [], sessions: [], cases: [], commitments: [], prospects: [] });

// ---------------------------------------------------------------------
// 形状升级：老记录补上后来才加的字段，UI 永远不会因为少一个属性而崩。
// ---------------------------------------------------------------------
const upgrade = {
  members: (m) => ({
    role: 'member', status: 'active', feeStatus: 'unpaid', ndaSigned: false,
    renewalStatus: 'pending', feeAmount: 0, feeDueDate: '', phone: '', notes: '',
    ...m,
  }),
  sessions: (s) => ({
    status: 'scheduled', presenterIds: [], attendance: {}, takeaways: [], notes: '',
    ...s,
  }),
  cases: (c) => ({
    problemStatement: '', questions: [], advices: [],
    commitmentText: '', commitmentDue: '', archivedAt: null,
    ...c,
  }),
  commitments: (c) => ({
    status: 'open', reviewNote: '', reviewedAt: null, sourceAdviceIds: [],
    ...c,
  }),
  prospects: (p) => ({
    status: 'lead', industry: '', company: '', referrerId: '', phone: '',
    visitedSessionId: '', notes: '',
    ...p,
  }),
};

const applyUpgrade = (kind, rows) => rows.map(upgrade[kind]);

// 排序：场次与承诺按日期，会员按加入时间，案例按建立时间。
function sortKind(kind, rows) {
  const by = (f, dir = 1) => (a, b) => dir * String(a[f] || '').localeCompare(String(b[f] || ''));
  if (kind === 'sessions') return rows.slice().sort(by('date'));
  if (kind === 'commitments') return rows.slice().sort(by('dueDate'));
  if (kind === 'members') return rows.slice().sort(by('createdAt'));
  return rows.slice().sort(by('createdAt', -1));
}

// =====================================================================
// LOCAL REPO (IndexedDB)
// =====================================================================
function makeLocalRepo() {
  const state = emptyState();
  const subs = new Set();
  const snapshot = () => ({
    members: state.members.slice(), sessions: state.sessions.slice(),
    cases: state.cases.slice(), commitments: state.commitments.slice(),
    prospects: state.prospects.slice(),
  });
  const emit = () => subs.forEach(fn => fn(snapshot()));

  async function load() {
    const raw = await Promise.all(KINDS.map(k => localKV.get(k)));
    KINDS.forEach((k, i) => {
      const parsed = raw[i] ? JSON.parse(raw[i]) : [];
      state[k] = sortKind(k, applyUpgrade(k, parsed));
    });
    // 首次启动：给一个空桌开局账号，不然没人能登录
    if (!raw[0]) {
      state.members = bootstrapMembers();
      await localKV.set('members', JSON.stringify(state.members));
    }
    emit();
  }

  const persist = (kind) => localKV.set(kind, JSON.stringify(state[kind]));

  return {
    mode: 'local',
    init: load,
    subscribe(fn) { subs.add(fn); fn(snapshot()); return () => subs.delete(fn); },
    getSnapshot: snapshot,

    async upsert(kind, record) {
      const rows = state[kind];
      const idx = rows.findIndex(r => r.id === record.id);
      if (idx >= 0) rows[idx] = record; else rows.push(record);
      state[kind] = sortKind(kind, rows);
      await persist(kind); emit();
    },

    async upsertMany(kind, records) {
      const rows = state[kind];
      records.forEach(record => {
        const idx = rows.findIndex(r => r.id === record.id);
        if (idx >= 0) rows[idx] = record; else rows.push(record);
      });
      state[kind] = sortKind(kind, rows);
      await persist(kind); emit();
    },

    async remove(kind, id) {
      state[kind] = state[kind].filter(r => r.id !== id);
      await persist(kind); emit();
    },

    async replaceAll(data) {
      for (const k of KINDS) {
        if (!data[k]) continue;
        state[k] = sortKind(k, applyUpgrade(k, data[k]));
        await persist(k);
      }
      emit();
    },
  };
}

// =====================================================================
// CLOUD REPO (Supabase)
// =====================================================================
// 每张表就是 id + data(jsonb)。记录形状演进时不用写迁移，
// 这个规模下查询开销可以忽略。
function makeCloudRepo() {
  const state = emptyState();
  const subs = new Set();
  const snapshot = () => ({
    members: state.members.slice(), sessions: state.sessions.slice(),
    cases: state.cases.slice(), commitments: state.commitments.slice(),
    prospects: state.prospects.slice(),
  });
  const emit = () => subs.forEach(fn => fn(snapshot()));

  async function fetchAll() {
    const results = await Promise.all(
      KINDS.map(k => supabase.from(k).select('data').then(r => (r.data || []).map(x => x.data)))
    );
    KINDS.forEach((k, i) => { state[k] = sortKind(k, applyUpgrade(k, results[i])); });

    if (state.members.length === 0) {
      const boot = bootstrapMembers();
      await supabase.from('members').insert(boot.map(m => ({ id: m.id, data: m })));
      state.members = boot;
    }
    emit();
  }

  function listen() {
    // 实时：任一表有变动就整表重拉。简单且正确；这个规模下
    // 做逐行合并不划算。
    const ch = supabase.channel('pumm-sync');
    KINDS.forEach(table => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => fetchAll());
    });
    ch.subscribe();
  }

  async function ensureAuthed() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      try { await supabase.auth.signInAnonymously(); } catch { /* 没开匿名登录也没关系 */ }
    }
  }

  return {
    mode: 'cloud',
    async init() {
      await ensureAuthed();
      await fetchAll();
      listen();
    },
    subscribe(fn) { subs.add(fn); fn(snapshot()); return () => subs.delete(fn); },
    getSnapshot: snapshot,

    async upsert(kind, record) {
      const rows = state[kind];
      const idx = rows.findIndex(r => r.id === record.id);
      if (idx >= 0) rows[idx] = record; else rows.push(record);
      state[kind] = sortKind(kind, rows);
      emit();                                    // 乐观更新，先让 UI 动
      await supabase.from(kind).upsert({ id: record.id, data: record });
    },

    async upsertMany(kind, records) {
      const rows = state[kind];
      records.forEach(record => {
        const idx = rows.findIndex(r => r.id === record.id);
        if (idx >= 0) rows[idx] = record; else rows.push(record);
      });
      state[kind] = sortKind(kind, rows);
      emit();
      await supabase.from(kind).upsert(records.map(r => ({ id: r.id, data: r })));
    },

    async remove(kind, id) {
      state[kind] = state[kind].filter(r => r.id !== id);
      emit();
      await supabase.from(kind).delete().eq('id', id);
    },

    async replaceAll(data) {
      for (const k of KINDS) {
        if (!data[k]) continue;
        state[k] = sortKind(k, applyUpgrade(k, data[k]));
        emit();
        await supabase.from(k).delete().neq('id', '');
        for (let i = 0; i < state[k].length; i += 100) {
          const chunk = state[k].slice(i, i + 100);
          await supabase.from(k).insert(chunk.map(r => ({ id: r.id, data: r })));
        }
      }
    },
  };
}

export const repo = cloudConfigured ? makeCloudRepo() : makeLocalRepo();
