import React from 'react';
import { Users, Phone } from 'lucide-react';
import { ROLES } from '../../constants.js';
import { rosterMembers, pendingReasons, isSeated } from '../../utils.js';
import { Badge, EmptyState, SectionTitle, Hint, Card } from '../Shared.jsx';

// 同桌名单 —— 会员可见的基本资料（姓名/公司/行业/电话）。
// 老板加入私董会一半就是为了认识另外九位 —— 这一页就是「聚」的价值。
// 不含任何案例内容、承诺、出席记录。
export default function RosterView({ snapshot }) {
  const roster = rosterMembers(snapshot.members);

  return (
    <div className="space-y-5">
      <SectionTitle>同桌名单</SectionTitle>
      <Hint>
        这一桌的 {roster.length} 位老板。桌下约饭、谈合作直接联系 ——
        互相认识本来就是坐这张桌的价值之一。
      </Hint>

      {roster.length === 0 ? (
        <Card><EmptyState icon={Users} title="桌上还没人" hint="桌长把人加进来后会出现在这里。" /></Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {roster.map(m => {
            const rm = ROLES[m.role] || ROLES.member;
            return (
              <div key={m.id} className="bg-white border border-pumm-line rounded-lg p-3.5 flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                  style={{ background: rm.color }}
                >
                  {m.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-pumm-ink">{m.name}</span>
                    {m.role !== 'member' && <Badge color={rm.color}>{rm.label.split(' ')[0]}</Badge>}
                    {!isSeated(m) && <Badge color="#C0843A">待入桌（{pendingReasons(m).join('、')}）</Badge>}
                  </div>
                  <div className="text-xs text-pumm-muted truncate">{m.company}</div>
                  <div className="text-[11px] text-pumm-brass mt-0.5">{m.industry}</div>
                  {m.phone && (
                    <a
                      href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}
                      className="inline-flex items-center gap-1 text-xs text-pumm-brand mt-1.5 hover:underline"
                    >
                      <Phone className="w-3 h-3" />{m.phone}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
