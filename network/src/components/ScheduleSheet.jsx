/* ============================================================
   排时间盒：一个人或好几个人 → TickTick（官方 Open API）
   没接 TickTick 的时候 → 下载 .ics（手机行事历 / TickTick 都开得了）
   ============================================================ */
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Download, CheckCircle2 } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { waLink } from '../lib/logic.js';
import {
  ACTION_LABEL, ACTION_MINUTES, briefFor, buildTaskBatch, buildIcs, nextSlot, toLocalInput,
} from '../lib/relation.js';
import { Button, Sheet, Field, Avatar, useToast, inputCls, cx } from './ui.jsx';

let statusCache = null; // 一次开 app 只问一次服务器有没有接 TickTick
async function ticktickStatus() {
  if (!statusCache) statusCache = api.ticktickStatus().then((s) => !!(s && s.configured)).catch(() => false);
  return statusCache;
}

/** items = [{ person, action }]（person 是 view 过的） */
export default function ScheduleSheet({ open, onClose, items = [] }) {
  const store = useStore();
  const toast = useToast();
  const [start, setStart] = useState(() => toLocalInput(nextSlot()));
  const [rows, setRows] = useState([]);
  const [tick, setTick] = useState(null); // null = 问服务器中
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStart(toLocalInput(nextSlot()));
    setRows(items.map((it) => ({ person: it.person, action: it.action || 'message', minutes: ACTION_MINUTES[it.action || 'message'] })));
    setDone(null);
    ticktickStatus().then(setTick);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const tasks = useMemo(() => {
    if (!rows.length || !start) return [];
    return buildTaskBatch(rows.map((r) => ({
      person: r.person, action: r.action, minutes: r.minutes,
      brief: briefFor(r.person), wa: waLink(r.person.whatsapp), appUrl: `${window.location.origin}/#/p/${r.person.id}/brief`,
    })), { start: new Date(start) });
  }, [rows, start]);

  const total = rows.reduce((s, r) => s + Number(r.minutes || 0), 0);
  const startDay = start ? start.slice(0, 10) : '';

  /** 排在以后哪天的人 → 那天以前不再出现在「今天该找谁」 */
  async function snoozeUntilSlot() {
    const today = toLocalInput(new Date()).slice(0, 10);
    if (!startDay || startDay <= today) return;
    const days = Math.round((new Date(`${startDay}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000);
    for (const r of rows) await store.snooze(r.person.id, days).catch(() => null);
  }

  async function toTickTick() {
    setBusy(true);
    try {
      const out = await api.ticktickTasks(tasks);
      await snoozeUntilSlot();
      setDone({ ok: out.created.length, failed: out.failed });
      if (!out.failed.length) toast(`排进 TickTick 了（${out.created.length} 个）`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function downloadIcs() {
    const blob = new Blob([buildIcs(tasks)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = rows.length === 1 ? `SPACE-${rows[0].person.name}.ics` : `SPACE-${startDay}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    await snoozeUntilSlot();
    toast('下载好了：打开它就会加进行事历');
  }

  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Sheet open={open} onClose={onClose} title={rows.length > 1 ? `排时间盒（${rows.length} 个人）` : '排时间盒'}>
      {done ? (
        <div className="space-y-3 py-4 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-plum" />
          <p className="font-medium">排进 TickTick 了：{done.ok} 个</p>
          {done.failed.length > 0 && (
            <ul className="rounded-xl bg-amber-50 p-3 text-left text-sm text-amber-900">
              {done.failed.map((f, i) => <li key={i}>没排进去：{f.title} —— {f.message}</li>)}
            </ul>
          )}
          <p className="text-xs text-faint">任务内容里有提示卡和 WhatsApp 连结，到时间直接点。</p>
          <Button className="w-full" onClick={onClose}>好</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="从几点开始" hint={rows.length > 1 ? `一个接一个排，总共 ${total} 分钟` : undefined}>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
          </Field>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.person.id} className="flex items-center gap-2 rounded-xl border border-line bg-white p-2">
                <Avatar person={r.person} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.person.name}</span>
                <select
                  aria-label="怎么联系" value={r.action}
                  onChange={(e) => set(i, { action: e.target.value, minutes: ACTION_MINUTES[e.target.value] })}
                  className={cx(inputCls, '!w-auto !py-1.5 text-sm')}
                >
                  {Object.entries(ACTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <select aria-label="多久" value={r.minutes} onChange={(e) => set(i, { minutes: Number(e.target.value) })} className={cx(inputCls, '!w-auto !py-1.5 text-sm')}>
                  {[10, 15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} 分</option>)}
                </select>
              </li>
            ))}
          </ul>
          {tasks[0] && (
            <details className="rounded-xl bg-ink/[0.03] p-2.5 text-[13px]">
              <summary className="cursor-pointer text-muted">任务内容（第一个）</summary>
              <div className="mt-1.5 font-medium">{tasks[0].title}</div>
              <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-muted">{tasks[0].content}</pre>
            </details>
          )}
          <div className="space-y-2">
            {tick !== false && (
              <Button variant="accent" className="w-full" busy={busy || tick === null} disabled={!tasks.length} onClick={toTickTick}>
                <CalendarPlus className="h-4 w-4" />{tick === null ? '检查 TickTick…' : '排进 TickTick'}
              </Button>
            )}
            <Button variant={tick === false ? 'accent' : 'outline'} className="w-full" disabled={!tasks.length} onClick={downloadIcs}>
              <Download className="h-4 w-4" />下载行事历档（.ics）
            </Button>
            {tick === false && <p className="text-center text-xs text-faint">还没接 TickTick：在 Vercel 设 TICKTICK_TOKEN 就能一键排进去（见 DEPLOY.md）</p>}
          </div>
        </div>
      )}
    </Sheet>
  );
}
