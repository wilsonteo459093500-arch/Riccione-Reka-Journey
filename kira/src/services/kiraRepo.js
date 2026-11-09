// ============================================================
// KIRA REPOSITORY — 团队共享云端（Supabase）
// 改自旧报价工具 src/services/quoteRepo.js（PR #6）：
//   · 表换成 public.kira_projects（旧表 public.quotes 只读，用于「导入旧报价」）
//   · subscribe 回传变动的那一行，前端逐行合并（不再整表覆盖，避免盖掉正在编辑的内容）
//
// 每个版本一行：{ id, data: <record>, updated_at, owner_id }。
// owner_id 由数据库默认 auth.uid() 填入；RLS 规定只有 owner 能删。
// 合并 / 待同步 / 待删除的规则在 src/components/quote/sync.js。
// ============================================================
import { supabase, cloudConfigured } from './supabase.js';
import { selectAll } from '../components/quote/sync.js'; // 分页读完整张表（Supabase 一次最多回 1000 行）

export { cloudConfigured };

const TABLE = 'kira_projects';
const toRecord = (r) => (r && r.data && typeof r.data === 'object' && !Array.isArray(r.data)
  ? { ...r.data, id: r.data.id || r.id, ownerId: r.owner_id || r.data.ownerId || null }
  : null);

export const kiraCloud = {
  async load() {
    // 按 id 排（改动不会让行在分页之间跳来跳去）；回来后再按更新时间排
    const rows = await selectAll(() => supabase
      .from(TABLE)
      .select('id, data, owner_id', { count: 'exact' })
      .order('id', { ascending: true }));
    const seen = new Set();
    return rows.map(toRecord)
      .filter((r) => r && typeof r.id === 'string' && !seen.has(r.id) && !!seen.add(r.id))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  async saveRecord(rec) {
    const { ownerId, ...data } = rec; // ownerId 只在前端用；数据库以 owner_id 列为准
    const { error } = await supabase
      .from(TABLE)
      .upsert({ id: rec.id, data, updated_at: new Date().toISOString() });
    if (error) throw error;
  },

  // 删除：RLS 只允许 owner 删；被拒时 Supabase 不报错、只是删 0 行 → 用 count 判断。
  // 删少了就再查一次哪些还在云端：还在的 = 没删掉（kept），其余 = 已删 / 本来就不在（deleted）。
  // 网络错误照样 throw（调用方留着下次再试）。
  async removeMany(ids) {
    if (!ids || !ids.length) return { deleted: [], kept: [] };
    const { error, count } = await supabase.from(TABLE).delete({ count: 'exact' }).in('id', ids);
    if (error) throw error;
    if ((count ?? 0) >= ids.length) return { deleted: [...ids], kept: [] };
    const { data, error: e2 } = await supabase.from(TABLE).select('id').in('id', ids);
    if (e2) throw e2;
    const still = new Set((data || []).map((r) => r?.id).filter(Boolean));
    return { deleted: ids.filter((id) => !still.has(id)), kept: ids.filter((id) => still.has(id)) };
  },

  // onRow({ type:'upsert', record } | { type:'delete', id })；onStatus('SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED')
  // 断线重连后会再收到 SUBSCRIBED → 前端趁机重新拉一次（断线期间漏掉的改动不会重播）
  subscribe(onRow, onStatus) {
    const channel = supabase
      .channel('kira-projects-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        if (payload.eventType === 'DELETE') { if (payload.old?.id) onRow({ type: 'delete', id: payload.old.id }); }
        else if (payload.new?.data) onRow({ type: 'upsert', record: { ...payload.new.data, id: payload.new.data.id || payload.new.id, ownerId: payload.new.owner_id || null } });
      })
      .subscribe((status) => { try { onStatus?.(status); } catch (e) { /* ignore */ } });
    return () => supabase.removeChannel(channel);
  },
};

// 旧报价工具的云端（public.quotes）—— 只读，绝不写入。分页读完（超过 1000 份也全部列出、全部对价）。
export const oldQuotes = {
  async list() {
    const rows = await selectAll(() => supabase
      .from('quotes')
      .select('id, data, updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true }));
    const seen = new Set();
    const fresh = (key) => key == null || (!seen.has(key) && !!seen.add(key)); // 分页重叠时去重
    return rows
      .filter((r) => r && r.data && typeof r.data === 'object' && fresh(r.id ?? r.data.id))
      .map((r) => ({ ...r.data, _updatedAt: r.updated_at }));
  },
};
