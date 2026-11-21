import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Images, Star, Trash2, Smartphone, Cloud, CheckCircle2, AlertTriangle, CalendarPlus, CalendarDays, MapPin, Camera, RotateCcw, Users, ChevronLeft,
} from 'lucide-react';
import { useStore, setShooting, burstAutoRead, BURST_AUTO_READ_KEY } from '../lib/store.jsx';
import { repo } from '../lib/repo.js';
import { shotFrom } from '../lib/image.js';
import { burstQueue, newShot, makeSession, summarize, withShotEdits } from '../lib/burst.js';
import { klDate } from '../lib/card.js';
import { Button, Field, Input, Section, useToast, cx } from './ui.jsx';

/* 断网时也要选得到活动：上次看到的活动记在手机上 */
const EVENTS_KEY = 'space:events-cache';
const SESSION_KEY = 'space:burst-session';
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 无痕模式 */ } };

export function useBurstItems() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const q = burstQueue();
    let alive = true;
    const load = () => q.list().then((l) => { if (alive) setItems(l); }).catch(() => null);
    load();
    const off = q.subscribe(load);
    return () => { alive = false; off(); };
  }, []);
  return items;
}

/**
 * 活动连拍 #/burst
 * 选活动 → 一张接一张拍（不用等）→ 拍完了 → 进「新朋友」核对
 */
export default function Burst({ onExit, onInbox }) {
  const store = useStore();
  const items = useBurstItems();
  const [session, setSession] = useState(null);
  const [step, setStep] = useState('setup'); // setup | shoot | done

  // 活动清单：资料库里的 + 手机上记得的（断网时打开也选得到）
  useEffect(() => {
    if (store.data.events.length) lsSet(EVENTS_KEY, store.data.events.map((e) => ({ id: e.id, name: e.name, held_on: e.held_on })));
  }, [store.data.events]);

  const sessionItems = useMemo(
    () => (session ? items.filter((it) => it.session && it.session.started === session.started) : []).sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at))),
    [items, session],
  );

  function start(s) {
    setSession(s);
    lsSet(SESSION_KEY, s);
    setStep('shoot');
  }
  function finish() {
    setShooting(false);
    store.runBurstSync().catch(() => null);
    setStep('done');
  }

  if (step === 'shoot' && session) return <Shoot session={session} items={sessionItems} onFinish={finish} />;
  if (step === 'done' && session) return <Done items={sessionItems} session={session} onInbox={onInbox} onAgain={() => setStep('shoot')} onExit={onExit} />;
  return <Setup onStart={start} onExit={onExit} pending={summarize(items.filter((it) => !it.done))} />;
}

/* ---------------- 1. 选活动 ---------------- */
function Setup({ onStart, onExit, pending }) {
  const store = useStore();
  const today = klDate();
  const events = useMemo(() => {
    const m = new Map();
    for (const e of [...(lsGet(EVENTS_KEY) || []), ...store.data.events]) if (e && e.id) m.set(e.id, e);
    return [...m.values()].sort((a, b) => String(b.held_on || '').localeCompare(String(a.held_on || ''))).slice(0, 6);
  }, [store.data.events]);
  const last = lsGet(SESSION_KEY);
  const resumable = last && last.started && last.started.slice(0, 10) === new Date().toISOString().slice(0, 10) ? last : null;

  const todays = events.find((e) => e.held_on === today);
  const [choice, setChoice] = useState(todays ? todays.id : events.length ? 'new' : 'new');
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(today);
  const [howMet, setHowMet] = useState('');
  const [autoRead, setAutoRead] = useState(burstAutoRead);

  function go() {
    try { localStorage.setItem(BURST_AUTO_READ_KEY, autoRead ? '1' : '0'); } catch { /* 无痕模式 */ }
    let s;
    if (choice === 'new') {
      if (!newName.trim()) return;
      s = makeSession({ newEvent: { name: newName, held_on: newDate } });
    } else if (choice === 'none') {
      s = makeSession({ howMet });
    } else {
      s = makeSession({ event: events.find((e) => e.id === choice) });
    }
    onStart({ ...s, started: new Date().toISOString() });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pb-32 pt-4">
      <div className="flex items-center gap-2">
        <button onClick={onExit} className="-ml-2 rounded-full p-2 hover:bg-ink/5" aria-label="返回"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-semibold">活动连拍</h1>
      </div>
      <p className="text-sm text-muted">一张接一张拍，不用等 AI、不用等网络。照片先存在手机里，有网络就自动存进「新朋友」{autoRead ? '、AI 读好名字和电话' : ''}，回家再核对。</p>

      {resumable && (
        <button onClick={() => onStart(resumable)} className="flex w-full items-center gap-3 rounded-2xl border-2 border-plum/40 bg-white p-4 text-left">
          <RotateCcw className="h-5 w-5 shrink-0 text-plum" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">继续刚才那场</span>
            <span className="block truncate text-sm text-muted">{resumable.event_name || resumable.how_met || '没写活动'}</span>
          </span>
        </button>
      )}

      {pending.total > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          手机里还有 {pending.total} 张没处理完{pending.phone ? `（${pending.phone} 张等网络）` : ''}，有网络会自动存，不会丢。
        </div>
      )}

      <Section title="在哪个活动？">
        <div className="space-y-2">
          {events.map((e) => (
            <Choice key={e.id} checked={choice === e.id} onChange={() => setChoice(e.id)} icon={CalendarDays}
              title={e.name} sub={[e.held_on, e.held_on === today && '今天'].filter(Boolean).join(' · ')} />
          ))}
          <Choice checked={choice === 'new'} onChange={() => setChoice('new')} icon={CalendarPlus} title="新活动" sub="拍的人都会记进这个活动的出席名单">
            {choice === 'new' && (
              <div className="mt-2 space-y-2">
                <Input autoFocus placeholder="活动名字，例：KL 商会晚宴" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
            )}
          </Choice>
          <Choice checked={choice === 'none'} onChange={() => setChoice('none')} icon={MapPin} title="不是活动" sub="只写在哪里认识">
            {choice === 'none' && <Input className="mt-2" placeholder="例：朋友介绍、展厅" value={howMet} onChange={(e) => setHowMet(e.target.value)} />}
          </Choice>
        </div>
      </Section>

      <label className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4">
        <input type="checkbox" className="mt-1" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />
        <span>
          <span className="block font-medium">有网络就让 AI 读名片</span>
          <span className="mt-0.5 block text-sm text-muted">Haiku，一张约 RM0.01（20 张约 RM0.2）。读好的照样在「新朋友」等你核对。不勾：回家在「新朋友」一张张按。</span>
        </span>
      </label>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <Button variant="accent" size="lg" className="mx-auto flex w-full max-w-xl" disabled={choice === 'new' && !newName.trim()} onClick={go}>
          <Camera className="h-5 w-5" />开始拍
        </Button>
      </div>
    </div>
  );
}

function Choice({ checked, onChange, icon: Icon, title, sub, children }) {
  return (
    <label className={cx('block cursor-pointer rounded-xl border p-3', checked ? 'border-ink bg-ink/5' : 'border-line')}>
      <span className="flex items-center gap-3">
        <input type="radio" name="burst-event" checked={checked} onChange={onChange} />
        <Icon className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          {sub && <span className="block text-xs text-muted">{sub}</span>}
        </span>
      </span>
      {children}
    </label>
  );
}

/* ---------------- 2. 一张接一张拍 ---------------- */
function Shoot({ session, items, onFinish }) {
  const toast = useToast();
  const queue = burstQueue();
  const video = useRef(null);
  const lib = useRef(null);
  const cam = useRef(null);
  const [cameraState, setCameraState] = useState('starting'); // starting | live | off
  const [camKey, setCamKey] = useState(0);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // 点开的那张
  const [backFor, setBackFor] = useState(null);
  const owner = useRef('');
  const s = summarize(items);

  useEffect(() => {
    setShooting(true);
    repo.sessionUserId().then((id) => { owner.current = id || ''; }).catch(() => null);
    return () => setShooting(false);
  }, []);

  // 相机：手机背面镜头；切去别的 app 回来要重新开
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setCameraState('off'); return undefined; }
    let stream = null;
    let cancelled = false;
    setCameraState('starting');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((st) => {
        if (cancelled) { st.getTracks().forEach((t) => t.stop()); return; }
        stream = st;
        if (video.current) {
          video.current.srcObject = st;
          video.current.play().catch(() => null);
        }
        setCameraState('live');
      })
      .catch(() => { if (!cancelled) setCameraState('off'); });
    const onVis = () => { if (document.visibilityState === 'visible' && stream && stream.getTracks().some((t) => t.readyState === 'ended')) setCamKey((k) => k + 1); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [camKey]);

  async function capture(source) {
    const { img, thumb } = await shotFrom(source);
    if (backFor) {
      const id = backFor;
      setBackFor(null);
      const r = await queue.update(id, (cur) => (cur.saved ? {} : { back: img }));
      toast(r && r.back ? '背面拍好了' : '这张已经存进去了：背面到人物页加照片', r && r.back ? undefined : 'error');
      return;
    }
    await queue.add(newShot({ session, front: img, thumb, owner: owner.current }));
  }

  async function snap() {
    if (busy || cameraState !== 'live') return;
    setBusy(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    try {
      await capture(video.current);
      if (navigator.vibrate) navigator.vibrate(25);
    } catch (e) {
      toast(`存不了这张：${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function fromFiles(files) {
    const list = [...(files || [])];
    if (!list.length) return;
    setBusy(true);
    let n = 0;
    for (const f of list) {
      try { await capture(f); n += 1; } catch (e) { toast(`${f.name || '照片'}：${e.message}`, 'error'); }
    }
    setBusy(false);
    if (list.length > 1) toast(`加了 ${n} 张`);
  }

  const current = open ? items.find((it) => it.id === open) : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      {/* 上面：结束 + 活动 + 张数 */}
      <div className="relative z-10 flex items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onFinish} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-2 text-sm font-medium backdrop-blur"><X className="h-4 w-4" />拍完了</button>
        <div className="min-w-0 flex-1 truncate text-center text-sm text-white/80">{session.event_name || session.how_met || '活动连拍'}</div>
        <div className="rounded-full bg-white/15 px-3 py-2 text-sm font-semibold tabular-nums backdrop-blur" aria-label="这场拍了几张">{items.length} 张</div>
      </div>

      {/* 中间：相机画面 */}
      <div className="relative min-h-0 flex-1 overflow-hidden" onClick={snap}>
        <video ref={video} playsInline muted autoPlay className={cx('h-full w-full object-cover', cameraState !== 'live' && 'hidden')} />
        {cameraState === 'live' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="aspect-[1.6] w-[82%] max-w-md rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
        )}
        {cameraState === 'starting' && <div className="absolute inset-0 flex items-center justify-center text-white/60">打开相机…</div>}
        {cameraState === 'off' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center" onClick={(e) => e.stopPropagation()}>
            <Camera className="h-10 w-10 text-white/60" />
            <p className="text-sm text-white/80">打不开这里的相机（可能没给权限）。可以用手机相机拍，一张拍完回来再拍下一张；或者先用相机 App 连拍，再从相册一次选全部。</p>
            <Button variant="accent" onClick={() => cam.current.click()}><Camera className="h-4 w-4" />用相机拍一张</Button>
            <button className="text-sm underline text-white/70" onClick={() => setCamKey((k) => k + 1)}>再试一次打开相机</button>
          </div>
        )}
        {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}
        {backFor && <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-plum px-4 py-1.5 text-sm font-medium">现在拍背面</div>}
      </div>

      {/* 下面：状态 + 拍过的 + 快门 */}
      <div className="relative z-10 space-y-3 bg-black px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <StatusLine s={s} />
        {items.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map((it, i) => (
              <button key={it.id} onClick={() => setOpen(it.id)} className="relative shrink-0" aria-label={`第 ${items.length - i} 张`}>
                <img src={it.thumb} alt="" className="h-14 w-20 rounded-lg object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] tabular-nums">{items.length - i}</span>
                {it.star && <Star className="absolute right-1 top-1 h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                <span className="absolute bottom-1 right-1"><ShotIcon it={it} /></span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button onClick={() => lib.current.click()} className="flex w-16 flex-col items-center gap-1 text-xs text-white/80"><Images className="h-6 w-6" />相册</button>
          <button onClick={cameraState === 'live' ? snap : () => cam.current.click()} disabled={busy}
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/80 active:scale-95" aria-label="拍">
            <span className={cx('h-14 w-14 rounded-full', backFor ? 'bg-plum' : 'bg-white', busy && 'opacity-60')} />
          </button>
          <div className="w-16 text-center text-[11px] leading-tight text-white/60">点画面<br />也能拍</div>
        </div>
      </div>

      <input ref={lib} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { fromFiles(e.target.files); e.target.value = ''; }} />
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { fromFiles(e.target.files); e.target.value = ''; }} />

      {current && <ShotSheet item={current} index={items.length - items.indexOf(current)} onClose={() => setOpen(null)} onBack={() => { setBackFor(current.id); setOpen(null); }} />}
    </div>
  );
}

function StatusLine({ s }) {
  if (!s.total) return <p className="text-center text-sm text-white/60">对准名片，按下面的圆圈。拍完马上能拍下一张。</p>;
  const parts = [
    s.phone && `${s.phone} 张在手机`,
    s.saved && `${s.saved} 张已存、读名片中`,
    s.read && `${s.read} 张读好了`,
    s.unread && `${s.unread} 张没读`,
  ].filter(Boolean);
  return (
    <p className={cx('text-center text-xs', s.failing ? 'text-amber-300' : 'text-white/70')}>
      {parts.join(' · ')}{s.failing ? ' · 网络不通，等一下自动再试（不会丢）' : ''}
    </p>
  );
}

function ShotIcon({ it }) {
  if (!it.saved) return it.error ? <AlertTriangle className="h-3.5 w-3.5 text-amber-300" /> : <Smartphone className="h-3.5 w-3.5 text-white/80" />;
  if (!it.read) return <Cloud className="h-3.5 w-3.5 text-sky-300" />;
  return <CheckCircle2 className={cx('h-3.5 w-3.5', it.unread_reason ? 'text-white/60' : 'text-emerald-400')} />;
}

function shotStatus(it) {
  if (!it.saved) return it.error ? `在手机，还没存进去（${it.error}）—— 有网络会自动再试` : '在手机，等一下自动存进「新朋友」';
  if (!it.read) return it.error ? `已存进「新朋友」；AI 还没读好（${it.error}），等一下再试` : '已存进「新朋友」，AI 在读名片';
  if (it.unread_reason) return `已存进「新朋友」；没读名片（${it.unread_reason}）`;
  return `已存进「新朋友」：${it.read_name || '读好了'}`;
}

/* 点开一张：⭐ 重要、一句话备注、拍背面、删掉 */
function ShotSheet({ item, index, onClose, onBack }) {
  const store = useStore();
  const toast = useToast();
  const queue = burstQueue();
  const [note, setNote] = useState(item.note || '');
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!item.front) return undefined;
    const u = URL.createObjectURL(new Blob([item.front.data], { type: item.front.type }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [item.front]);

  // 还在手机：改手机上的那份；已经存进去：直接改那个人
  async function edit(patch) {
    await queue.update(item.id, patch);
    const latest = await queue.get(item.id);
    if (latest && latest.saved) {
      const row = store.data.people.find((p) => p.id === item.id);
      if (!row) { toast('这张已经存进去了：到「新朋友」改', 'error'); return; }
      await store.savePerson(withShotEdits(row, patch)).catch((e) => toast(e.message, 'error'));
    }
  }

  async function remove() {
    if (item.saved) { toast('已经存进「新朋友」了：到那里删', 'error'); return; }
    if (!window.confirm(`删掉第 ${index} 张？`)) return;
    await queue.remove(item.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">第 {index} 张</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-ink/5" aria-label="关"><X className="h-5 w-5" /></button>
        </div>
        <img src={url || item.thumb} alt="名片" className="mx-auto max-h-56 rounded-xl object-contain" />
        <p className="mt-2 text-center text-xs text-muted">{shotStatus(item)}</p>
        <div className="mt-3 space-y-3">
          <button onClick={() => edit({ star: !item.star })} className={cx('flex w-full items-center gap-2 rounded-xl border p-3 text-left', item.star ? 'border-amber-400 bg-amber-50' : 'border-line')}>
            <Star className={cx('h-5 w-5', item.star ? 'fill-amber-400 text-amber-400' : 'text-faint')} />
            <span className="font-medium">重要</span>
            <span className="text-sm text-muted">（加「重要」标签，回家先看）</span>
          </button>
          <Field label="一句话备注（选填）">
            <Input placeholder="例：想做厨房、下个月见面" value={note} onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (item.note || '') && edit({ note })} />
          </Field>
          <div className="flex gap-2">
            {!item.saved && !item.back && <Button variant="outline" className="flex-1" onClick={onBack}><RotateCcw className="h-4 w-4" />拍背面</Button>}
            {item.back && <span className="flex-1 self-center text-sm text-muted">✓ 有背面</span>}
            {!item.saved && <Button variant="danger" onClick={remove}><Trash2 className="h-4 w-4" />删掉</Button>}
            <Button className="flex-1" onClick={() => { if (note !== (item.note || '')) edit({ note }); onClose(); }}>好了</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 3. 拍完了 ---------------- */
function Done({ items, session, onInbox, onAgain, onExit }) {
  const s = summarize(items);
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pb-32 pt-8 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
      <h1 className="text-2xl font-semibold">这场拍了 {items.length} 张</h1>
      <p className="text-muted">{session.event_name || session.how_met}</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <Stat n={s.phone} label="在手机等网络" />
        <Stat n={s.saved} label="已存、读名片中" />
        <Stat n={s.read + s.unread} label="进了新朋友" />
      </div>
      <p className="text-sm text-muted">
        {s.phone ? '没网络的会留在手机里，下次打开 SPACE、有网络就自动存进去，不会丢。' : '全部都存进去了。'}
        {' '}回家在「新朋友」看一眼：AI 读对的按确认，像旧朋友的按合并。
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="accent" size="lg" onClick={onInbox}><Users className="h-5 w-5" />去新朋友核对</Button>
        <Button variant="outline" onClick={onAgain}><Camera className="h-4 w-4" />还要再拍</Button>
        <Button variant="ghost" onClick={onExit}>回去</Button>
      </div>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="text-2xl font-semibold tabular-nums">{n}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
