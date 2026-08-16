import React, { useState, useMemo } from 'react';
import { UserPlus, Users, AlertTriangle, Sparkles, ShieldCheck, Banknote } from 'lucide-react';
import { TABLE, ROLES, FEE_STATUS } from '../../constants.js';
import {
  seatedMembers, pendingMembers, isDirector, pendingReasons,
  absenceCount, fmtDate, daysUntil,
} from '../../utils.js';
import { Card, Button, Badge, Notice, EmptyState, SectionTitle, Hint } from '../Shared.jsx';
import MemberFormModal from '../modals/MemberFormModal.jsx';

export default function MembersView({ snapshot, onSaveMember, onLoadDemo, canManage }) {
  const confirmDemo = () => {
    if (window.confirm('示范数据会覆盖现有全部数据，并把你切换成示范桌的桌长身份。确定载入？')) {
      onLoadDemo();
    }
  };
  const { members, sessions } = snapshot;
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const seated = seatedMembers(members);
  const pending = pendingMembers(members);
  const directors = members.filter(isDirector);
  const removed = members.filter(m => m.status === 'removed');

  const atRisk = useMemo(
    () => members
      .filter(m => m.status === 'active' && !isDirector(m))
      .map(m => ({ m, count: absenceCount(sessions, m.id) }))
      .filter(x => x.count >= 2),
    [members, sessions]
  );

  const industriesTaken = seated.length + pending.length;
  const rosterEmpty = members.filter(m => !isDirector(m)).length <= 2;

  return (
    <div className="space-y-5">
      <SectionTitle
        right={canManage && (
          <Button tone="primary" icon={UserPlus} onClick={() => setAdding(true)}>新增会员</Button>
        )}
      >
        会员与桌 · T 上桌
      </SectionTitle>

      <div className="grid grid-cols-3 gap-3">
        <SeatStat label="在桌" value={`${seated.length}/${TABLE.seatLimit}`} tone="#3F7D5C" sub="已缴费 + 已签 NDA" />
        <SeatStat label="待入桌" value={pending.length} tone="#C0843A" sub="年费或 NDA 未齐" />
        <SeatStat label="空位" value={Math.max(0, TABLE.seatLimit - industriesTaken)} tone="#7C8087" sub="行业不得重复" />
      </div>

      {atRisk.length > 0 && (
        <Notice tone="danger" title="缺席预警 —— 桌规是 2 次自动出局">
          {atRisk.map(({ m, count }) => (
            <div key={m.id} className="flex items-center justify-between gap-2 py-0.5">
              <span>{m.name}（{m.company}）已 {count} 次无故缺席</span>
              {canManage && m.status === 'active' && (
                <Button size="sm" tone="danger" onClick={() => setEditing(m)}>处理</Button>
              )}
            </div>
          ))}
          <div className="mt-1.5 opacity-80">系统只预警，不自动踢人 —— 出局由桌长按一次。</div>
        </Notice>
      )}

      {rosterEmpty && canManage && (
        <Card className="bg-pumm-tint">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-pumm-brass flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-display text-sm font-semibold text-pumm-ink">桌上还没人</div>
              <Hint>
                一个个把 10 位老板加进来，或先载入一套示范数据看看这系统跑起来是什么样
                —— 示范数据会覆盖现有名单，并把你切换成示范桌的桌长身份。
              </Hint>
              <div className="flex gap-2 mt-3">
                <Button tone="primary" icon={UserPlus} onClick={() => setAdding(true)}>加第一位</Button>
                <Button icon={Sparkles} onClick={confirmDemo}>载入示范数据</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <MemberGroup
        title="在桌"
        hint="这些人算进出席率，也只有这些人能当案主。"
        members={seated} sessions={sessions} onEdit={canManage ? setEditing : null}
      />

      {pending.length > 0 && (
        <MemberGroup
          title="待入桌"
          hint="桌规：年费一次收足全年、全员签 NDA —— 两项齐了才算入桌。"
          members={pending} sessions={sessions} onEdit={canManage ? setEditing : null} showPendingReason
        />
      )}

      {directors.length > 0 && (
        <MemberGroup
          title="理事会 Star Director"
          hint="不占席位、不算出席率、看不到任何案例内容。"
          members={directors} sessions={sessions} onEdit={canManage ? setEditing : null}
        />
      )}

      {removed.length > 0 && (
        <MemberGroup title="已出局" members={removed} sessions={sessions} onEdit={canManage ? setEditing : null} dim />
      )}

      {(adding || editing) && (
        <MemberFormModal
          member={editing}
          members={members}
          onSave={onSaveMember}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function SeatStat({ label, value, sub, tone }) {
  return (
    <div className="bg-white border border-pumm-line rounded-lg p-3.5">
      <div className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold">{label}</div>
      <div className="font-display text-2xl font-semibold leading-tight mt-1" style={{ color: tone }}>{value}</div>
      <div className="text-[11px] text-pumm-faint mt-0.5">{sub}</div>
    </div>
  );
}

function MemberGroup({ title, hint, members, sessions, onEdit, showPendingReason, dim }) {
  if (!members.length) {
    return (
      <Card>
        <div className="font-display text-sm font-semibold text-pumm-ink mb-1">{title}</div>
        <EmptyState icon={Users} title="还没有人" hint={hint} />
      </Card>
    );
  }
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="font-display text-sm font-semibold text-pumm-ink">{title}</h3>
        <span className="text-xs text-pumm-faint">{members.length} 人</span>
      </div>
      {hint && <Hint>{hint}</Hint>}
      <div className="grid gap-2 mt-2 sm:grid-cols-2">
        {members.map(m => (
          <MemberCard
            key={m.id} m={m} sessions={sessions} onEdit={onEdit}
            showPendingReason={showPendingReason} dim={dim}
          />
        ))}
      </div>
    </div>
  );
}

function MemberCard({ m, sessions, onEdit, showPendingReason, dim }) {
  const rm = ROLES[m.role] || ROLES.member;
  const absences = absenceCount(sessions, m.id);
  const feeDays = m.feeDueDate ? daysUntil(m.feeDueDate) : null;

  return (
    <div className={`bg-white border border-pumm-line rounded-lg p-3.5 ${dim ? 'opacity-55' : ''}`}>
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
          style={{ background: rm.color }}
        >
          {m.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-pumm-ink">{m.name}</span>
            {m.role !== 'member' && <Badge color={rm.color}>{rm.label.split(' ')[0]}</Badge>}
          </div>
          <div className="text-xs text-pumm-muted truncate">{m.company}</div>
          {!isDirector(m) && (
            <div className="text-[11px] text-pumm-brass mt-0.5 truncate">{m.industry}</div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {!isDirector(m) && (
              <>
                <Badge color={FEE_STATUS[m.feeStatus]?.color}>
                  <Banknote className="w-3 h-3" />{FEE_STATUS[m.feeStatus]?.label}
                </Badge>
                <Badge color={m.ndaSigned ? '#3F7D5C' : '#9C3D2E'}>
                  <ShieldCheck className="w-3 h-3" />{m.ndaSigned ? 'NDA 已签' : 'NDA 未签'}
                </Badge>
                {absences > 0 && (
                  <Badge color={absences >= 2 ? '#9C3D2E' : '#C0843A'}>
                    <AlertTriangle className="w-3 h-3" />缺席 {absences}
                  </Badge>
                )}
                {feeDays !== null && feeDays <= 30 && m.renewalStatus !== 'renewed' && (
                  <Badge color="#C0843A">年费 {feeDays < 0 ? `逾期 ${-feeDays} 天` : `${feeDays} 天后到期`}</Badge>
                )}
                {m.renewalStatus === 'renewed' && <Badge color="#3F7D5C">已续会</Badge>}
              </>
            )}
          </div>

          {showPendingReason && (
            <div className="text-[11px] text-pumm-danger mt-1.5">
              还差：{pendingReasons(m).join('、')} —— 差一样就不算入桌。
            </div>
          )}
          {m.joinedAt && !isDirector(m) && (
            <div className="text-[10px] text-pumm-faint mt-1">入桌 {fmtDate(m.joinedAt)}</div>
          )}
        </div>

        {onEdit && (
          <Button size="sm" onClick={() => onEdit(m)}>编辑</Button>
        )}
      </div>
    </div>
  );
}
