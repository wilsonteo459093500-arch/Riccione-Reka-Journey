// ============================================================
// QUOTE REPOSITORY — shared team storage for the quotation tool
//
// Cloud (Supabase) when env vars are present, else local-only.
//   load()            -> record[]
//   saveRecord(rec)   -> upsert one record
//   removeRecord(id)  -> delete one record
//   removeMany(ids)   -> delete several records
//   subscribe(fn)     -> live updates (returns unsubscribe)
//
// Each version is one row: { id, data: <record>, updated_at }.
// Versions of the same customer share record.groupId inside `data`.
// ============================================================
import { supabase, cloudConfigured } from './supabase.js';

export { cloudConfigured };

export const quoteCloud = {
  async load() {
    const { data, error } = await supabase
      .from('quotes')
      .select('data')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => r.data);
  },

  async saveRecord(rec) {
    const { error } = await supabase
      .from('quotes')
      .upsert({ id: rec.id, data: rec, updated_at: new Date().toISOString() });
    if (error) throw error;
  },

  async removeRecord(id) {
    const { error } = await supabase.from('quotes').delete().eq('id', id);
    if (error) throw error;
  },

  async removeMany(ids) {
    if (!ids || !ids.length) return;
    const { error } = await supabase.from('quotes').delete().in('id', ids);
    if (error) throw error;
  },

  subscribe(onChange) {
    const channel = supabase
      .channel('quotes-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, () => onChange())
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};
