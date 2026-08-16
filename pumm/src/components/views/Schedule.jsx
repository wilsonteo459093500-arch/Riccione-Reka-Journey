import React, { useState } from 'react';
import { CalendarPlus, CalendarDays, Wand2, Play, Check } from 'lucide-react';
import { TABLE, SESSION_STATUS } from '../../constants.js';
import {
  fmtDate, todayISO, generateYearDates, suggestPresenters, seatedMembers,
  memberById, uid, daysUntil, attendanceMeta,
} from '../../utils.js';
import { Card, Button, Badge, Modal, Field, inputCls, EmptyState, SectionTitle, Hint, Notice } from '../Shared.jsx';

export default function ScheduleView({
  snapshot, session, canManage, canRecordAttendance, onSaveSession, onSaveSessions, onRun, onRsvp,
}) {
  const { members, sessions } = snapshot;
  const [editing, setEditing] = useState(null);
  const [genOpen, setGenOpen] = useState(false);

  const today = todayISO();
  const upcoming = sessions.filter(s => s.date >= today || s.status === 'running');
  const past = sessions.filter(s => s.date < today && s.status !== 'running').reverse();
  const seated = seatedMembers(members);

  const newSession = () => ({
    id: uid('ses'),
    tableId: TABLE.id,
    date: todayISO(),
    presenterIds: suggestPresenters(members, sessions, snapshot.cases, 2),
    status: 'scheduled',
    attendance: {},
    takeaways: [],
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return (
    <div className="space-y-5">
      <SectionTitle
        right={canManage && (
          <div className="flex gap-2">
            <Button icon={Wand2} onClick={() => setGenOpen(true)}>排全年</Button>
            <Button tone="primary" icon={CalendarPlus} onClick={() => setEditing(newSession())}>加一场</Button>
          </div>
        )}
      >
        排期与出席
      </SectionTitle>

      {seated.length < TABLE.seatLimit && canManage && (
        <Notice tone="info">
          目前在桌 {seated.length} 人（满席 {TABLE.seatLimit}）。未缴费或未签 NDA 的人不能被排成案主。
        </Notice>
      )}

      <div>
        <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">接下来</h3>
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState
              icon={CalendarDays}
              title="还没排下一场"
              hint="桌规：每月一次半天，全年日期年初一次排好。按「排全年」一次生成 12 场。"
              action={canManage && <Button tone="primary" icon={Wand2} onClick={() => setGenOpen(true)}>排全年</Button>}
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {upcoming.map(s => (
              <SessionRow
                key={s.id} s={s} members={members} me={session}
                canManage={canManage} canRecordAttendance={canRecordAttendance}
                onEdit={() => setEditing(s)} onRun={() => onRun(s.id)} onRsvp={onRsvp}
              />
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div>
          <h3 className="font-display text-sm font-semibold text-pumm-ink mb-2">已过去</h3>
          <div className="space-y-2">
            {past.map(s => (
              <SessionRow
                key={s.id} s={s} members={members} me={session}
                canManage={canManage} canRecordAttendance={canRecordAttendance}
                onEdit={() => setEditing(s)} onRun={() => onRun(s.id)} past
              />
            ))}
          </div>
        </div>
      )}

      {editing && (
        <SessionFormModal
          draft={editing}
          snapshot={snapshot}
          onSave={(s) => { onSaveSession(s); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}

      {genOpen && (
        <GenerateYearModal
          sessions={sessions}
          onGenerate={(rows) => { onSaveSessions(rows); setGenOpen(false); }}
          onClose={() => setGenOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
function SessionRow({ s, members, me, canManage, canRecordAttendance, onEdit, onRun, onRsvp, past }) {
  const meta = SESSION_STATUS[s.status] || SESSION_STATUS.scheduled;
  const d = daysUntil(s.date);
  const presenters = (s.presenterIds || []).map(id => memberById(members, id)).filter(Boolean);
  const marks = s.attendance || {};
  const rsvp = s.rsvp || {};
  const presentCount = Object.values(marks).filter(v => v === 'present').length;
  const marked = Object.keys(marks).length;
  const myMark = marks[me.memberId];
  const myRsvp = rsvp[me.memberId];
  const rsvpYes = Object.values(rsvp).filter(v => v === 'yes').length;
  const rsvpNo = Object.values(rsvp).filter(v => v === 'no').length;
  // 会员对还没开始的场次可以自助预报出席
  const canRsvp = !!onRsvp && !canRecordAttendance && s.status === 'scheduled' && !past;

  return (
    <div className={`bg-white border border-pumm-line rounded-lg p-3.5 ${past ? 'opacity-80' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="text-center flex-shrink-0 w-14">
          <div className="font-display text-xl font-semibold text-pumm-ink leading-none">
            {new Date(`${s.date}T00:00:00`).getDate()}
          </div>
          <div className="text-[10px] text-pumm-muted mt-0.5">
            {new Date(`${s.date}T00:00:00`).getMonth() + 1} 月
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-pumm-ink">{fmtDate(s.date)}</span>
            <Badge color={meta.color}>{meta.label}</Badge>
            {!past && d !== null && d >= 0 && d <= 7 && <Badge color="#B08D4F">{d === 0 ? '就是今天' : `还有 ${d} 天`}</Badge>}
            {myMark && <Badge color={attendanceMeta(myMark).color}>我：{attendanceMeta(myMark).label}</Badge>}
          </div>

          <div className="text-xs text-pumm-muted mt-1">
            案主：{presenters.length
              ? presenters.map(p => `${p.name}（${p.industry}）`).join('　·　')
              : '未定'}
          </div>

          {marked > 0 && (
            <div className="text-[11px] text-pumm-faint mt-1">
              出席 {presentCount}/{marked} 人已登记
            </div>
          )}
          {canRecordAttendance && (rsvpYes > 0 || rsvpNo > 0) && (
            <div className="text-[11px] text-pumm-brass mt-1">
              会员预报：到 {rsvpYes} · 请假 {rsvpNo}
            </div>
          )}

          {canRsvp && (
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="text-[11px] text-pumm-muted">这场我：</span>
              <button
                type="button"
                onClick={() => onRsvp(s.id, myRsvp === 'yes' ? null : 'yes')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                  myRsvp === 'yes' ? 'bg-pumm-ok text-white border-pumm-ok' : 'bg-white text-pumm-muted border-pumm-line'
                }`}
              >
                ✓ 我会到
              </button>
              <button
                type="button"
                onClick={() => onRsvp(s.id, myRsvp === 'no' ? null : 'no')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                  myRsvp === 'no' ? 'bg-pumm-warn text-white border-pumm-warn' : 'bg-white text-pumm-muted border-pumm-line'
                }`}
              >
                请假
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {canRecordAttendance && s.status !== 'closed' && (
            <Button size="sm" tone="primary" icon={Play} onClick={onRun}>
              {s.status === 'running' ? '继续' : '开场'}
            </Button>
          )}
          {canRecordAttendance && s.status === 'closed' && (
            <Button size="sm" onClick={onRun}>查看</Button>
          )}
          {canManage && <Button size="sm" onClick={onEdit}>编辑</Button>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
function SessionFormModal({ draft, snapshot, onSave, onClose }) {
  const { members, sessions, cases } = snapshot;
  const [s, setS] = useState(draft);
  const seated = seatedMembers(members);
  const set = (k, v) => setS(x => ({ ...x, [k]: v }));

  const togglePresenter = (id) => {
    const cur = s.presenterIds || [];
    if (cur.includes(id)) set('presenterIds', cur.filter(x => x !== id));
    else if (cur.length < 2) set('presenterIds', [...cur, id]);
    else set('presenterIds', [cur[1], id]);         // 满 2 位就顶掉最早选的
  };

  return (
    <Modal
      title="场次"
      subtitle="每场 1–2 位案主。一场 3.5 小时，两位案主刚好。"
      onClose={onClose}
      footer={<>
        <Button onClick={onClose}>取消</Button>
        <Button tone="primary" onClick={() => onSave({ ...s, updatedAt: new Date().toISOString() })}>保存</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期" required>
            <input type="date" className={inputCls} value={s.date} onChange={e => set('date', e.target.value)} />
          </Field>
          <Field label="状态">
            <select className={inputCls} value={s.status} onChange={e => set('status', e.target.value)}>
              <option value="scheduled">已排期</option>
              <option value="running">进行中</option>
              <option value="closed">已结束</option>
            </select>
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold">案主（最多 2 位）</span>
            <Button
              size="sm" icon={Wand2}
              onClick={() => set('presenterIds', suggestPresenters(members, sessions, cases, 2))}
            >
              自动排
            </Button>
          </div>
          <Hint>自动排 = 谁最久没上桌谁先上。</Hint>
          <div className="grid grid-cols-2 gap-1.5 mt-2 max-h-64 overflow-y-auto scrollbar-thin">
            {seated.map(m => {
              const on = (s.presenterIds || []).includes(m.id);
              return (
                <button
                  key={m.id} type="button" onClick={() => togglePresenter(m.id)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-left text-xs transition-colors ${
                    on ? 'border-pumm-brand bg-pumm-brand/5' : 'border-pumm-line hover:border-pumm-faint'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-pumm-ink truncate">{m.name}</span>
                    <span className="block text-[10px] text-pumm-faint truncate">{m.industry}</span>
                  </span>
                  {on && <Check className="w-3.5 h-3.5 text-pumm-brand flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          {seated.length === 0 && (
            <Notice tone="warn" title="还没有人能当案主">
              年费到账 + NDA 签好，才算在桌。先去「会员与桌」把这两项补齐。
            </Notice>
          )}
        </div>

        <Field label="备注">
          <textarea rows={2} className={inputCls} value={s.notes} onChange={e => set('notes', e.target.value)} placeholder="场地、时间、特殊安排…" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
function GenerateYearModal({ sessions, onGenerate, onClose }) {
  const [start, setStart] = useState(todayISO());
  const [count, setCount] = useState(12);
  const dates = generateYearDates(start, count);
  const existing = new Set(sessions.map(s => s.date));

  const create = () => {
    const rows = dates
      .filter(d => !existing.has(d))
      .map(d => ({
        id: uid('ses'),
        tableId: TABLE.id,
        date: d,
        presenterIds: [],
        status: 'scheduled',
        attendance: {},
        takeaways: [],
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    onGenerate(rows);
  };

  const dupes = dates.filter(d => existing.has(d)).length;

  return (
    <Modal
      title="全年排期"
      subtitle="桌规：每月一次半天，全年日期年初一次排好。"
      onClose={onClose}
      footer={<>
        <Button onClick={onClose}>取消</Button>
        <Button tone="primary" onClick={create}>生成 {dates.length - dupes} 场</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="第一场日期" hint="之后每月同一个「第几个星期几」。">
            <input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} />
          </Field>
          <Field label="场数">
            <input type="number" min="1" max="24" className={inputCls} value={count} onChange={e => setCount(Number(e.target.value) || 12)} />
          </Field>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold mb-1.5">预览</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {dates.map(d => (
              <div key={d} className={`px-2 py-1.5 rounded border ${existing.has(d) ? 'border-pumm-line text-pumm-faint line-through' : 'border-pumm-line text-pumm-ink'}`}>
                {fmtDate(d)}
              </div>
            ))}
          </div>
          {dupes > 0 && <Hint>划掉的 {dupes} 场日期已存在，不会重复建立。</Hint>}
        </div>
      </div>
    </Modal>
  );
}
