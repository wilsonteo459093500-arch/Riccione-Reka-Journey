import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Play, Pause, RotateCcw, Plus, Trash2, Check, X, Clock,
  MessageCircleQuestion, Lightbulb, Lock, CheckCircle2, Users, Flag,
} from 'lucide-react';
import { SESSION_PHASES, TABLE, ATTENDANCE_STATUS } from '../../constants.js';
import {
  seatedMembers, memberById, memberName, uid, fmtDate, dueDateFor, mmss,
  openCommitments,
} from '../../utils.js';
import { Card, Button, Badge, Notice, Field, inputCls, inputBase, Hint, EmptyState, VoiceButton } from '../Shared.jsx';

export default function RunSessionView({
  snapshot, sessionId, onBack, onSaveSession, onSaveCase, onSaveCommitment,
}) {
  const { members, sessions, cases, commitments } = snapshot;
  const sess = sessions.find(s => s.id === sessionId);

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [presenterIdx, setPresenterIdx] = useState(0);

  const phase = SESSION_PHASES[phaseIdx];
  const presenters = useMemo(
    () => (sess?.presenterIds || []).map(id => memberById(members, id)).filter(Boolean),
    [sess, members]
  );
  const presenter = presenters[presenterIdx] || presenters[0] || null;

  // 一进主持模式就把场次标成进行中，散会时才 closed。
  // 这个 hook 必须待在下面那个 early return 之前，否则 React 的 hook
  // 数量会随场次存在与否而变。
  useEffect(() => {
    if (sess && sess.status === 'scheduled') {
      onSaveSession({ ...sess, status: 'running', updatedAt: new Date().toISOString() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sess?.id]);

  if (!sess) {
    return <EmptyState icon={X} title="找不到这场会" hint="可能已被删除。" action={<Button onClick={onBack}>返回</Button>} />;
  }

  // 案主的 Case Record —— 第一次编辑时才建，别在数据库里留一堆空壳。
  const caseFor = (presenterId) =>
    cases.find(c => c.sessionId === sess.id && c.presenterId === presenterId) || null;

  const patchCase = (presenterId, patch) => {
    const existing = caseFor(presenterId);
    const next = existing
      ? { ...existing, ...patch, updatedAt: new Date().toISOString() }
      : {
          id: uid('case'), tableId: sess.tableId || TABLE.id,
          sessionId: sess.id, presenterId,
          problemStatement: '', questions: [], advices: [],
          commitmentText: '', commitmentDue: dueDateFor(sess.date),
          archivedAt: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          ...patch,
        };
    onSaveCase(next);
    return next;
  };

  const patchSession = (patch) =>
    onSaveSession({ ...sess, ...patch, updatedAt: new Date().toISOString() });

  const kase = presenter ? caseFor(presenter.id) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button icon={ArrowLeft} onClick={onBack}>返回</Button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold text-pumm-ink leading-tight truncate">
            {fmtDate(sess.date)}
          </div>
          <div className="text-[11px] text-pumm-muted truncate">
            {presenters.length ? `案主：${presenters.map(p => p.name).join('、')}` : '还没定案主'}
          </div>
        </div>
        <Badge color={sess.status === 'closed' ? '#23303D' : '#B08D4F'}>
          {sess.status === 'closed' ? '已结束' : '进行中'}
        </Badge>
      </div>

      <PhaseBar phaseIdx={phaseIdx} setPhaseIdx={setPhaseIdx} />

      <PhaseTimer key={phase.key} minutes={phase.minutes} name={phase.name} />

      {phase.perPresenter && presenters.length > 1 && (
        <div className="flex gap-1.5">
          {presenters.map((p, i) => (
            <button
              key={p.id} type="button" onClick={() => setPresenterIdx(i)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                i === presenterIdx
                  ? 'bg-pumm-brand text-white border-pumm-brand'
                  : 'bg-white text-pumm-muted border-pumm-line hover:border-pumm-faint'
              }`}
            >
              案主 {i + 1}：{p.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        <div className="flex items-start gap-2 mb-3 pb-3 border-b border-pumm-line">
          <Flag className="w-4 h-4 text-pumm-brass flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-display text-sm font-semibold text-pumm-ink">
              {phase.name}
              {phase.step && <span className="text-pumm-brass ml-1.5">· {phase.step}</span>}
            </div>
            <Hint>{phase.hint}</Hint>
          </div>
        </div>

        {phase.key === 'review' && (
          <ReviewPhase
            snapshot={snapshot} sess={sess} patchSession={patchSession}
            onSaveCommitment={onSaveCommitment}
          />
        )}
        {phase.key === 'state' && (
          <StatePhase presenter={presenter} kase={kase} patchCase={patchCase} />
        )}
        {phase.key === 'ask' && (
          <AskPhase members={members} presenter={presenter} kase={kase} patchCase={patchCase} />
        )}
        {phase.key === 'advise' && (
          <AdvisePhase members={members} presenter={presenter} kase={kase} patchCase={patchCase} />
        )}
        {phase.key === 'commit' && (
          <CommitPhase
            sess={sess} presenter={presenter} kase={kase} patchCase={patchCase}
            commitments={commitments} onSaveCommitment={onSaveCommitment} members={members}
          />
        )}
        {phase.key === 'takeaway' && (
          <TakeawayPhase
            members={members} sess={sess} patchSession={patchSession}
            cases={cases} commitments={commitments} onBack={onBack}
          />
        )}
      </Card>

      <div className="flex items-center justify-between gap-2 no-print">
        <Button
          disabled={phaseIdx === 0}
          onClick={() => { setPhaseIdx(i => Math.max(0, i - 1)); setPresenterIdx(0); }}
        >
          上一段
        </Button>
        <span className="text-xs text-pumm-faint">{phaseIdx + 1} / {SESSION_PHASES.length}</span>
        <Button
          tone="primary"
          disabled={phaseIdx === SESSION_PHASES.length - 1}
          onClick={() => {
            // 两位案主时，先把同一段走完第二位，再进下一段
            if (phase.perPresenter && presenterIdx < presenters.length - 1) setPresenterIdx(i => i + 1);
            else { setPhaseIdx(i => Math.min(SESSION_PHASES.length - 1, i + 1)); setPresenterIdx(0); }
          }}
        >
          {phase.perPresenter && presenterIdx < presenters.length - 1
            ? `下一位案主：${presenters[presenterIdx + 1]?.name}`
            : '下一段'}
        </Button>
      </div>
    </div>
  );
}

// =====================================================================
// 段落导航
// =====================================================================
function PhaseBar({ phaseIdx, setPhaseIdx }) {
  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-thin no-print">
      {SESSION_PHASES.map((p, i) => (
        <button
          key={p.key} type="button" onClick={() => setPhaseIdx(i)}
          className={`flex-shrink-0 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap border transition-colors ${
            i === phaseIdx
              ? 'bg-pumm-brand text-white border-pumm-brand font-semibold'
              : i < phaseIdx
                ? 'bg-white text-pumm-muted border-pumm-line'
                : 'bg-pumm-tint text-pumm-faint border-pumm-line'
          }`}
        >
          {p.name} <span className="opacity-70">{p.minutes}′</span>
        </button>
      ))}
    </div>
  );
}

// =====================================================================
// 计时器 —— 每段一个，超时会闪，但不会自己跳段（桌长说了算）
// =====================================================================
function PhaseTimer({ minutes, name }) {
  const total = minutes * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const tick = useRef(null);

  useEffect(() => {
    if (!running) return undefined;
    tick.current = setInterval(() => setLeft(l => l - 1), 1000);
    return () => clearInterval(tick.current);
  }, [running]);

  const over = left < 0;
  const pctLeft = Math.max(0, Math.min(1, left / total));

  return (
    <div className="bg-white border border-pumm-line rounded-lg px-4 py-3 no-print">
      <div className="flex items-center gap-3">
        <Clock className={`w-4 h-4 flex-shrink-0 ${over ? 'text-pumm-danger timer-over' : 'text-pumm-faint'}`} />
        <div
          className={`font-display text-2xl font-semibold tabular-nums leading-none ${over ? 'text-pumm-danger timer-over' : 'text-pumm-ink'}`}
        >
          {over ? '+' : ''}{mmss(Math.abs(left))}
        </div>
        <div className="text-xs text-pumm-muted flex-1 min-w-0 truncate">
          {name} · 预定 {minutes} 分钟{over ? ' · 超时了' : ''}
        </div>
        <Button size="sm" tone={running ? 'ghost' : 'primary'} icon={running ? Pause : Play} onClick={() => setRunning(r => !r)}>
          {running ? '暂停' : '开始'}
        </Button>
        <Button size="sm" icon={RotateCcw} onClick={() => { setRunning(false); setLeft(total); }} aria-label="重置">
          <span className="sr-only">重置</span>
        </Button>
      </div>
      <div className="h-1 bg-pumm-line rounded-full mt-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pctLeft * 100}%`, background: over ? '#9C3D2E' : '#B08D4F' }}
        />
      </div>
    </div>
  );
}

// =====================================================================
// 1. 承诺复盘 30′ —— 开场第一件事，外加出席登记
// =====================================================================
function ReviewPhase({ snapshot, sess, patchSession, onSaveCommitment }) {
  const { members, commitments } = snapshot;
  const seated = seatedMembers(members);
  const pending = openCommitments(commitments).filter(c => c.sessionId !== sess.id);
  const [notes, setNotes] = useState({});

  const marks = sess.attendance || {};
  const setMark = (memberId, status) =>
    patchSession({ attendance: { ...marks, [memberId]: status } });

  const markAllPresent = () =>
    patchSession({ attendance: { ...Object.fromEntries(seated.map(m => [m.id, 'present'])), ...marks } });

  const close = (c, status) =>
    onSaveCommitment({
      ...c, status,
      reviewNote: notes[c.id] ?? c.reviewNote ?? '',
      reviewedAt: new Date().toISOString(),
      reviewedSessionId: sess.id,
      updatedAt: new Date().toISOString(),
    });

  const markedCount = seated.filter(m => marks[m.id]).length;

  return (
    <div className="space-y-5">
      {/* ---- 出席登记 ---- */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-pumm-faint" />
            <span className="text-sm font-semibold text-pumm-ink">出席登记</span>
            <span className="text-xs text-pumm-faint">{markedCount}/{seated.length}</span>
          </div>
          <Button size="sm" onClick={markAllPresent}>全部标到</Button>
        </div>
        <Hint>先按「全部标到」，再把没来的人改掉 —— 两三下就完事。请假与无故缺席要分清，只有无故缺席才累计出局。</Hint>

        <div className="space-y-1.5 mt-2">
          {seated.map(m => (
            <div key={m.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-pumm-ink truncate">{m.name}</div>
                <div className="text-[10px] text-pumm-faint truncate">{m.industry}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {Object.entries(ATTENDANCE_STATUS).map(([k, v]) => (
                  <button
                    key={k} type="button" onClick={() => setMark(m.id, k)}
                    className={`w-9 h-8 rounded-md text-xs font-semibold border transition-colors ${
                      marks[m.id] === k ? 'text-white' : 'bg-white text-pumm-muted border-pumm-line hover:border-pumm-faint'
                    }`}
                    style={marks[m.id] === k ? { background: v.color, borderColor: v.color } : undefined}
                  >
                    {v.short}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {seated.length === 0 && <Hint>还没有人在桌。先去「会员与桌」把年费与 NDA 补齐。</Hint>}
        </div>
      </div>

      {/* ---- 承诺复盘 ---- */}
      <div className="border-t border-pumm-line pt-4">
        <div className="flex items-center gap-1.5 mb-2">
          <CheckCircle2 className="w-4 h-4 text-pumm-faint" />
          <span className="text-sm font-semibold text-pumm-ink">上一场的未结承诺</span>
          <span className="text-xs text-pumm-faint">{pending.length} 条</span>
        </div>

        {pending.length === 0 ? (
          <Hint>没有未结承诺。要么上一场还没锁诺，要么全部结清了。</Hint>
        ) : (
          <div className="space-y-2">
            {pending.map(c => (
              <div key={c.id} className="border border-pumm-line rounded-md p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-pumm-ink">{memberName(members, c.memberId)}</div>
                    <div className="text-sm text-pumm-ink mt-0.5 leading-snug">{c.content}</div>
                    <div className="text-[11px] text-pumm-faint mt-1">到期 {fmtDate(c.dueDate)}</div>
                  </div>
                </div>
                <input
                  className={`${inputCls} mt-2`}
                  placeholder="一句话复盘（做到什么／卡在哪）"
                  value={notes[c.id] ?? c.reviewNote ?? ''}
                  onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value }))}
                />
                <div className="flex gap-2 mt-2">
                  <Button size="sm" tone="ok" icon={Check} onClick={() => close(c, 'done')}>做到了</Button>
                  <Button size="sm" tone="danger" icon={X} onClick={() => close(c, 'missed')}>没做到</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// 2. 案主陈述 15′ —— 一句话说清问题
// =====================================================================
function StatePhase({ presenter, kase, patchCase }) {
  const [text, setText] = useState(kase?.problemStatement || '');
  useEffect(() => { setText(kase?.problemStatement || ''); }, [kase?.id]);

  if (!presenter) return <NoPresenter />;

  return (
    <div className="space-y-3">
      <div className="text-sm text-pumm-ink">
        <span className="font-semibold">{presenter.name}</span>
        <span className="text-pumm-muted">（{presenter.company} · {presenter.industry}）</span>
      </div>
      <Field label="问题 · 一句话" hint="写成一句话。写不成一句话，通常表示问题还没想清楚。">
        <textarea
          rows={3}
          className={inputCls}
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={() => patchCase(presenter.id, { problemStatement: text })}
          placeholder="例：两个老师傅带不动新人，出货一慢客户就跑，我不敢接大单。"
        />
      </Field>
      <div className="flex gap-2">
        <Button tone="primary" onClick={() => patchCase(presenter.id, { problemStatement: text })}>存下这句话</Button>
        <VoiceButton onText={(t) => setText(prev => (prev ? `${prev}${t}` : t))} />
      </div>
    </div>
  );
}

// =====================================================================
// 3. 只提问 30′ —— A 步。只记问题，不记答案。
// =====================================================================
function AskPhase({ members, presenter, kase, patchCase }) {
  const [text, setText] = useState('');
  const [askerId, setAskerId] = useState('');
  const others = seatedMembers(members).filter(m => m.id !== presenter?.id);

  if (!presenter) return <NoPresenter />;
  const questions = kase?.questions || [];

  const add = () => {
    if (!text.trim()) return;
    patchCase(presenter.id, {
      questions: [...questions, { id: uid('q'), text: text.trim(), askerId }],
    });
    setText('');
  };

  const del = (id) => patchCase(presenter.id, { questions: questions.filter(q => q.id !== id) });

  return (
    <div className="space-y-3">
      <Notice tone="info" icon={MessageCircleQuestion}>
        这一段只准提问。谁开口给建议，桌长当场喊停 —— 建议是下一段的事。
      </Notice>

      <div className="flex gap-2">
        <select className={`${inputBase} w-28 sm:w-32 flex-shrink-0`} value={askerId} onChange={e => setAskerId(e.target.value)}>
          <option value="">提问人…</option>
          {others.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input
          className={inputCls}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="问题…（打完按 Enter，或按麦克风说）"
        />
        <VoiceButton onText={(t) => setText(prev => (prev ? `${prev}${t}` : t))} />
        <Button tone="primary" icon={Plus} onClick={add}>加</Button>
      </div>

      <div className="space-y-1.5">
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-start gap-2 border border-pumm-line rounded-md px-3 py-2">
            <span className="text-xs text-pumm-faint font-mono mt-0.5">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-pumm-ink leading-snug">{q.text}</div>
              <div className="text-[11px] text-pumm-brass mt-0.5">
                {q.askerId ? memberName(members, q.askerId) : '未记提问人'}
              </div>
            </div>
            <button type="button" onClick={() => del(q.id)} className="text-pumm-faint hover:text-pumm-danger p-1 -m-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {questions.length === 0 && <Hint>还没记下任何提问。</Hint>}
      </div>
    </div>
  );
}

// =====================================================================
// 4. 轮流给建议 40′ —— B 步。一人一条，每人必须开口。
//
// advisorId 是全系统最关键的字段：日后要证明「老板帮老板」而不是
// 「顾问给答案」，靠的就是这一栏。所以这里不给「匿名」选项。
// =====================================================================
function AdvisePhase({ members, presenter, kase, patchCase }) {
  const others = useMemo(
    () => seatedMembers(members).filter(m => m.id !== presenter?.id),
    [members, presenter]
  );
  const advices = kase?.advices || [];
  const spoken = new Set(advices.map(a => a.advisorId));
  const nextUp = others.find(m => !spoken.has(m.id));

  const [advisorId, setAdvisorId] = useState('');
  const [text, setText] = useState('');

  // 预填下一个还没开口的人 —— 桌长少点一次
  useEffect(() => { setAdvisorId(nextUp?.id || ''); }, [nextUp?.id]);

  if (!presenter) return <NoPresenter />;

  const add = () => {
    if (!text.trim() || !advisorId) return;
    patchCase(presenter.id, {
      advices: [...advices, { id: uid('adv'), text: text.trim(), advisorId }],
    });
    setText('');
  };

  const del = (id) => patchCase(presenter.id, { advices: advices.filter(a => a.id !== id) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-pumm-ink">
          已开口 <span className="font-semibold">{spoken.size}</span> / {others.length} 人
        </span>
        {spoken.size < others.length && (
          <span className="text-xs text-pumm-warn">还差 {others.length - spoken.size} 人没开口</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {others.map(m => (
          <button
            key={m.id} type="button" onClick={() => setAdvisorId(m.id)}
            className={`px-2 py-1 rounded text-[11px] border transition-colors ${
              spoken.has(m.id)
                ? 'bg-pumm-ok/10 text-pumm-ok border-pumm-ok/30'
                : advisorId === m.id
                  ? 'bg-pumm-brand text-white border-pumm-brand'
                  : 'bg-white text-pumm-muted border-pumm-line'
            }`}
          >
            {spoken.has(m.id) && '✓ '}{m.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <select className={`${inputBase} w-28 sm:w-32 flex-shrink-0`} value={advisorId} onChange={e => setAdvisorId(e.target.value)}>
          <option value="">建议人…</option>
          {others.map(m => <option key={m.id} value={m.id}>{m.name}{spoken.has(m.id) ? ' ✓' : ''}</option>)}
        </select>
        <input
          className={inputCls}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder={nextUp ? `轮到 ${nextUp.name}…（按 Enter 或按麦克风说）` : '建议…'}
        />
        <VoiceButton onText={(t) => setText(prev => (prev ? `${prev}${t}` : t))} />
        <Button tone="primary" icon={Plus} onClick={add}>加</Button>
      </div>

      <div className="space-y-1.5">
        {advices.map((a, i) => (
          <div key={a.id} className="flex items-start gap-2 border border-pumm-line rounded-md px-3 py-2">
            <Lightbulb className="w-3.5 h-3.5 text-pumm-brass flex-shrink-0 mt-1" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-pumm-ink leading-snug">{a.text}</div>
              <div className="text-[11px] text-pumm-brass mt-0.5">—— {memberName(members, a.advisorId)}</div>
            </div>
            <button type="button" onClick={() => del(a.id)} className="text-pumm-faint hover:text-pumm-danger p-1 -m-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {advices.length === 0 && <Hint>还没记下任何建议。</Hint>}
      </div>
    </div>
  );
}

// =====================================================================
// 5. 锁诺 15′ —— L 步。1 诺 · 30 天。
// =====================================================================
function CommitPhase({ sess, presenter, kase, patchCase, commitments, onSaveCommitment, members }) {
  const existing = commitments.find(c => c.caseId === kase?.id);
  const [text, setText] = useState(existing?.content || kase?.commitmentText || '');
  const [due, setDue] = useState(existing?.dueDate || kase?.commitmentDue || dueDateFor(sess.date));
  const [sourceIds, setSourceIds] = useState(existing?.sourceAdviceIds || []);

  useEffect(() => {
    setText(existing?.content || kase?.commitmentText || '');
    setDue(existing?.dueDate || kase?.commitmentDue || dueDateFor(sess.date));
    setSourceIds(existing?.sourceAdviceIds || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kase?.id, existing?.id]);

  if (!presenter) return <NoPresenter />;

  const advices = kase?.advices || [];
  const toggleSource = (id) =>
    setSourceIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  const lock = () => {
    if (!text.trim()) return;
    const nextCase = patchCase(presenter.id, { commitmentText: text.trim(), commitmentDue: due });
    onSaveCommitment({
      id: existing?.id || uid('cmt'),
      tableId: sess.tableId || TABLE.id,
      caseId: nextCase.id,
      sessionId: sess.id,
      memberId: presenter.id,
      content: text.trim(),
      dueDate: due,
      sourceAdviceIds: sourceIds,
      status: existing?.status || 'open',
      reviewNote: existing?.reviewNote || '',
      reviewedAt: existing?.reviewedAt || null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-3">
      <Notice tone="info" icon={Lock}>
        一件事，不是三件。下一场开场第一件事就是查这个 —— 所以写得越具体越好。
      </Notice>

      <Field label={`${presenter.name} 承诺的一件事`} required>
        <textarea
          rows={3} className={inputCls} value={text} onChange={e => setText(e.target.value)}
          placeholder="例：这个月把主力工序拍成 5 支教学视频，交给新人先学。"
        />
      </Field>

      {advices.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold mb-1">
            这个行动主要来自谁的建议？（可多选）
          </div>
          <Hint>选了才有贡献榜 —— 让给出好建议的老板有面子，这是「老板帮老板」的证据链。</Hint>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {advices.map(a => {
              const on = sourceIds.includes(a.id);
              return (
                <button
                  key={a.id} type="button" onClick={() => toggleSource(a.id)}
                  title={a.text}
                  className={`px-2.5 py-1.5 rounded-md text-xs border text-left max-w-full transition-colors ${
                    on ? 'bg-pumm-brand text-white border-pumm-brand' : 'bg-white text-pumm-muted border-pumm-line hover:border-pumm-faint'
                  }`}
                >
                  <span className="font-semibold">{memberName(members, a.advisorId)}</span>
                  <span className={`ml-1 ${on ? 'opacity-80' : 'text-pumm-faint'}`}>
                    {a.text.slice(0, 16)}{a.text.length > 16 ? '…' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="到期日" hint={`预设为会期 + ${TABLE.commitmentDays} 天`}>
          <input type="date" className={inputCls} value={due} onChange={e => setDue(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button tone="primary" size="lg" icon={Lock} className="w-full" onClick={lock} disabled={!text.trim()}>
            {existing ? '更新承诺' : '锁诺'}
          </Button>
        </div>
      </div>

      {existing && (
        <Notice tone="ok" icon={CheckCircle2}>
          已锁：{existing.content}　·　到期 {fmtDate(existing.dueDate)}
        </Notice>
      )}
    </div>
  );
}

// =====================================================================
// 6. 收尾 —— 每人一句 takeaway，然后散会归档
// =====================================================================
function TakeawayPhase({ members, sess, patchSession, cases, commitments, onBack }) {
  const seated = seatedMembers(members);
  const takeaways = sess.takeaways || [];
  const marks = sess.attendance || {};

  const setTakeaway = (memberId, text) => {
    const next = takeaways.filter(t => t.memberId !== memberId);
    if (text.trim()) next.push({ memberId, text: text.trim() });
    patchSession({ takeaways: next });
  };

  const sessCases = cases.filter(c => c.sessionId === sess.id);
  const missingStatement = (sess.presenterIds || []).filter(
    pid => !sessCases.some(c => c.presenterId === pid && c.problemStatement?.trim())
  );
  const missingCommitment = (sess.presenterIds || []).filter(
    pid => !commitments.some(c => c.sessionId === sess.id && c.memberId === pid)
  );
  const unmarked = seated.filter(m => !marks[m.id]);

  const closeSession = () => {
    // 案例的归档时间由「案例资产」页按一次「归档」写入 ——
    // 散会不强制归档，记录员通常要回去补完整才归档。
    patchSession({ status: 'closed', closedAt: new Date().toISOString() });
    onBack();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {seated.map(m => {
          const cur = takeaways.find(t => t.memberId === m.id)?.text || '';
          return (
            <div key={m.id} className="flex items-center gap-2">
              <span className="text-xs text-pumm-muted w-16 flex-shrink-0 truncate">{m.name}</span>
              <input
                className={inputCls}
                defaultValue={cur}
                onBlur={e => setTakeaway(m.id, e.target.value)}
                placeholder="今天带走的一句话…"
              />
            </div>
          );
        })}
      </div>

      <div className="border-t border-pumm-line pt-4 space-y-2">
        <div className="text-sm font-semibold text-pumm-ink">散会前检查</div>
        <CheckLine ok={unmarked.length === 0} text={
          unmarked.length === 0 ? '出席全部登记好了' : `还有 ${unmarked.length} 人没登记出席：${unmarked.map(m => m.name).join('、')}`
        } />
        <CheckLine ok={missingStatement.length === 0} text={
          missingStatement.length === 0 ? '每位案主的问题都写下来了' : `${missingStatement.length} 位案主还没写问题陈述`
        } />
        <CheckLine ok={missingCommitment.length === 0} text={
          missingCommitment.length === 0 ? '每位案主都锁了承诺' : `${missingCommitment.length} 位案主还没锁诺`
        } />

        {sess.status !== 'closed' ? (
          <Button tone="primary" size="lg" className="w-full mt-2" icon={CheckCircle2} onClick={closeSession}>
            散会 · 结束这场
          </Button>
        ) : (
          <Notice tone="ok" icon={CheckCircle2}>这场已经结束。案例可以到「案例资产」页导出成招募素材。</Notice>
        )}
      </div>
    </div>
  );
}

function CheckLine({ ok, text }) {
  return (
    <div className={`flex items-start gap-2 text-xs ${ok ? 'text-pumm-ok' : 'text-pumm-warn'}`}>
      {ok ? <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <X className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
      <span>{text}</span>
    </div>
  );
}

function NoPresenter() {
  return (
    <EmptyState
      icon={Users}
      title="这场还没定案主"
      hint="回「排期与出席」编辑这场，选 1–2 位案主，或按「自动排」让系统挑最久没上桌的人。"
    />
  );
}
