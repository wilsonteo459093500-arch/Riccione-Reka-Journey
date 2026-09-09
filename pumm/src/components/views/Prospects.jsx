import React, { useState, useMemo } from 'react';
import { UserPlus, Users, Megaphone, Trash2 } from 'lucide-react';
import { TABLE, PROSPECT_STATUS, INDUSTRY_SUGGESTIONS } from '../../constants.js';
import {
  uid, todayISO, fmtDate, memberName, prospectIndustryClash,
  rosterMembers, seatedMembers,
} from '../../utils.js';
import {
  Card, Button, Badge, Modal, Field, inputCls, EmptyState, SectionTitle, Hint, Notice,
} from '../Shared.jsx';

// 招募 pipeline —— E 步的招募素材从这里落地：
// 故事发出去 → 有人来问 → 记进线索 → 邀来参观 → 三个数达标那天，
// 第二桌的名单已经在手上。
export default function ProspectsView({ snapshot, onSaveProspect, onRemoveProspect }) {
  const { members, sessions, prospects } = snapshot;
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const active = prospects.filter(p => p.status !== 'declined');
  const declined = prospects.filter(p => p.status === 'declined');

  // 已被占的行业 —— 招募时避开这些，或者专找这些以外的
  const takenIndustries = useMemo(
    () => [...new Set(rosterMembers(members).map(m => m.industry).filter(Boolean))],
    [members]
  );

  const groups = ['joining', 'visited', 'invited', 'lead'];

  return (
    <div className="space-y-5">
      <SectionTitle
        right={<Button tone="primary" icon={UserPlus} onClick={() => setAdding(true)}>记一个候选人</Button>}
      >
        招募 · 为第二桌囤人
      </SectionTitle>

      <Notice tone="info" icon={Megaphone}>
        规矩不变：三个数不全达标不开第二桌。但招募不能等达标那天才开始 ——
        案例页导出的匿名故事发出去，有人来问就记进这里。
      </Notice>

      <Card>
        <div className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold mb-1.5">
          这一桌已占的行业（候选人避开这些）
        </div>
        <div className="flex flex-wrap gap-1">
          {takenIndustries.map(i => <Badge key={i} color="#7C8087">{i}</Badge>)}
          {takenIndustries.length === 0 && <Hint>桌上还没人。</Hint>}
        </div>
      </Card>

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="还没有候选人"
            hint="每一个来问「你们那个桌是什么」的老板，都值得记一笔。"
            action={<Button tone="primary" icon={UserPlus} onClick={() => setAdding(true)}>记第一个</Button>}
          />
        </Card>
      ) : (
        groups.map(status => {
          const rows = active.filter(p => p.status === status);
          if (!rows.length) return null;
          const meta = PROSPECT_STATUS[status];
          return (
            <div key={status}>
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="font-display text-sm font-semibold text-pumm-ink">{meta.label}</h3>
                <span className="text-xs text-pumm-faint">{rows.length} 人</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {rows.map(p => (
                  <ProspectCard
                    key={p.id} p={p} members={members} sessions={sessions}
                    onEdit={() => setEditing(p)}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}

      {declined.length > 0 && (
        <div>
          <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">不合适 / 婉拒</h3>
          <div className="grid gap-2 sm:grid-cols-2 opacity-60">
            {declined.map(p => (
              <ProspectCard key={p.id} p={p} members={members} sessions={sessions} onEdit={() => setEditing(p)} />
            ))}
          </div>
        </div>
      )}

      {(adding || editing) && (
        <ProspectFormModal
          prospect={editing}
          snapshot={snapshot}
          onSave={(p) => { onSaveProspect(p); setAdding(false); setEditing(null); }}
          onRemove={editing ? (id) => { onRemoveProspect(id); setEditing(null); } : null}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ProspectCard({ p, members, sessions, onEdit }) {
  const meta = PROSPECT_STATUS[p.status] || PROSPECT_STATUS.lead;
  const clash = prospectIndustryClash(p, members);
  const visited = sessions.find(s => s.id === p.visitedSessionId);

  return (
    <div className="bg-white border border-pumm-line rounded-lg p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-pumm-ink">{p.name}</span>
            <Badge color={meta.color}>{meta.label}</Badge>
          </div>
          <div className="text-xs text-pumm-muted truncate">{p.company || '—'}</div>
          <div className="text-[11px] text-pumm-brass mt-0.5">{p.industry || '行业未填'}</div>
          {clash && <div className="text-[11px] text-pumm-danger mt-1 leading-snug">⚠ {clash}</div>}
          <div className="text-[10px] text-pumm-faint mt-1.5 space-x-2">
            {p.referrerId && <span>推荐：{memberName(members, p.referrerId)}</span>}
            {visited && <span>参观过 {fmtDate(visited.date)}</span>}
          </div>
          {p.notes && <div className="text-xs text-pumm-muted mt-1 leading-snug line-clamp-2">{p.notes}</div>}
        </div>
        <Button size="sm" onClick={onEdit}>编辑</Button>
      </div>
    </div>
  );
}

function ProspectFormModal({ prospect, snapshot, onSave, onRemove, onClose }) {
  const { members, sessions } = snapshot;
  const [p, setP] = useState(() => prospect || {
    id: uid('pros'),
    tableId: TABLE.id,
    name: '', company: '', industry: '', phone: '',
    referrerId: '', status: 'lead', visitedSessionId: '', notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const set = (k, v) => setP(x => ({ ...x, [k]: v }));
  const clash = prospectIndustryClash(p, members);
  const pastSessions = sessions.filter(s => s.date <= todayISO());

  return (
    <Modal
      title={prospect ? `编辑 ${p.name}` : '记一个候选人'}
      subtitle="行业冲突会提前预警 —— 不硬拦，占位的人明年未必续会。"
      onClose={onClose}
      footer={<>
        {onRemove && (
          <Button tone="danger" icon={Trash2} className="mr-auto" onClick={() => onRemove(p.id)}>删除</Button>
        )}
        <Button onClick={onClose}>取消</Button>
        <Button tone="primary" disabled={!p.name.trim()} onClick={() => onSave({ ...p, updatedAt: new Date().toISOString() })}>
          保存
        </Button>
      </>}
    >
      <div className="space-y-4">
        {clash && <Notice tone="warn" title="行业冲突">{clash}</Notice>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="姓名" required>
            <input className={inputCls} value={p.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="公司">
            <input className={inputCls} value={p.company} onChange={e => set('company', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="行业" hint="填了才能提前查重。">
            <input className={inputCls} list="pumm-industries-pros" value={p.industry} onChange={e => set('industry', e.target.value)} />
            <datalist id="pumm-industries-pros">
              {INDUSTRY_SUGGESTIONS.map(i => <option key={i} value={i} />)}
            </datalist>
          </Field>
          <Field label="联络电话">
            <input className={inputCls} value={p.phone} onChange={e => set('phone', e.target.value)} placeholder="01x-xxx xxxx" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="谁推荐的">
            <select className={inputCls} value={p.referrerId} onChange={e => set('referrerId', e.target.value)}>
              <option value="">—</option>
              {seatedMembers(members).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="状态">
            <select className={inputCls} value={p.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(PROSPECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>

        {(p.status === 'visited' || p.status === 'joining') && (
          <Field label="参观过哪场">
            <select className={inputCls} value={p.visitedSessionId} onChange={e => set('visitedSessionId', e.target.value)}>
              <option value="">—</option>
              {pastSessions.map(s => <option key={s.id} value={s.id}>{fmtDate(s.date)}</option>)}
            </select>
          </Field>
        )}

        <Field label="备注">
          <textarea rows={2} className={inputCls} value={p.notes} onChange={e => set('notes', e.target.value)} placeholder="从哪来的线索、聊过什么、下一步…" />
        </Field>
      </div>
    </Modal>
  );
}
