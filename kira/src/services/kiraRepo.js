// ============================================================
// KIRA REPOSITORY — 团队共享云端（Supabase）
// 改自旧报价工具 src/services/quoteRepo.js（PR #6）：
//   · 表换成 public.kira_projects（旧表 public.quotes 只读，用于「导入旧报价」）
//   · subscribe 回传变动的那一行，前端逐行合并（不再整表覆盖，避免盖掉正在编辑的内容）
//
// 每个版本一行：{ id, data: <record>, updated_at, owner_id }。
// owner_id 由数据库默认 auth.uid() 填入；RLS 规定只有 owner 能删。
// ============================================================
import { supabase, cloudConfigured } from './supabase.js';

export { cloudConfigured };

const TABLE = 'kira_projects';

export const kiraCloud = {
  async load() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('data, owner_id')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ ...r.data, ownerId: r.owner_id || r.data?.ownerId || null }));
  },

  async saveRecord(rec) {
    const { ownerId, ...data } = rec; // ownerId 只在前端用；数据库以 owner_id 列为准
    const { error } = await supabase
      .from(TABLE)
      .upsert({ id: rec.id, data, updated_at: new Date().toISOString() });
    if (error) throw error;
  },

  // 删除：RLS 只允许 owner 删；被拒时 Supabase 不报错但删 0 行 → 用 count 判断
  async removeMany(ids) {
    if (!ids || !ids.length) return 0;
    const { error, count } = await supabase.from(TABLE).delete({ count: 'exact' }).in('id', ids);
    if (error) throw error;
    return count ?? 0;
  },

  // onRow({ type:'upsert', record } | { type:'delete', id })
  subscribe(onRow) {
    const channel = supabase
      .channel('kira-projects-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        if (payload.eventType === 'DELETE') onRow({ type: 'delete', id: payload.old?.id });
        else if (payload.new?.data) onRow({ type: 'upsert', record: { ...payload.new.data, ownerId: payload.new.owner_id || null } });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};

// 旧报价工具的云端（public.quotes）—— 只读，绝不写入。
export const oldQuotes = {
  async list() {
    const { data, error } = await supabase
      .from('quotes')
      .select('id, data, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ ...r.data, _updatedAt: r.updated_at }));
  },
};
