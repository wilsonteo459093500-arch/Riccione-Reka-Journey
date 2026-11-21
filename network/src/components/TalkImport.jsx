/* ============================================================
   第 2 阶段：记对话
   选人 → 选来源（Plaud / 语音备注 / WhatsApp 汇出 / 截图）→ AI 整理 → 勾选 → 写进档案
   ============================================================ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, AudioLines, Mic, MessageCircle, Images, FileUp, Sparkles, Search, X, Check, Handshake, Ban, Users, MessagesSquare, Plus,
} from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { shrinkImage } from '../lib/image.js';
import { matchPerson, fmtDate, normName } from '../lib/logic.js';
import {
  TALK_SOURCES, SOURCE_BY_KEY, MAX_TALK_CHARS, MAX_SCREENSHOTS, MOODS, parseWhatsApp, nameFromWhatsAppFile, matchParticipant,
  suggestPeople, selectWhatsApp, cleanTranscript, estimateTalkMyr, fmtStamp,
  splitTalk, TALK_SPLIT_CHARS,
} from '../lib/talk.js';
import { Avatar, Button, Chip, Field, Input, Textarea, Section, Spinner, useToast, cx, inputCls } from './ui.jsx';

const KIND_LABEL = { meeting: '见面', call: '电话', message: '讯息', note: '备注' };
const SOURCE_ICON = { plaud: AudioLines, voice: Mic, whatsapp_txt: MessageCircle, whatsapp_screenshot: Images };
const RATE = Number(import.meta.env.VITE_USD_TO_MYR || 4.4);
const today = () => fmtDate(new Date().toISOString());
/** ISO → datetime-local 的值（本地时间、到秒，这样上次导入的最后一则不会重复送） */
function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* 浏览器小储存（无痕模式会丢，只是方便用） */
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 不能存就算了 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
};

export default function TalkImport({ personId = null, onCancel, onDone }) {
  const store = useStore();
  const toast = useToast();
  const [pid, setPid] = useState(personId);
  const raw = store.data.people.find((p) => p.id === pid);
  const person = raw ? store.view(raw) : null;

  const [source, setSource] = useState(() => ls.get('star.talk.source', 'voice'));
  const src = SOURCE_BY_KEY[source] || SOURCE_BY_KEY.voice;
  const [kind, setKind] = useState(src.kinds[0]);
  const [date, setDate] = useState(today);
  const [dateTouched, setDateTouched] = useState(false);
  useEffect(() => { ls.set('star.talk.source', source); if (!src.kinds.includes(kind)) setKind(src.kinds[0]); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  // 逐字稿 / 语音备注：打到一半离开也不会丢
  const [texts, setTexts] = useState(() => ({ plaud: ls.get('star.draft.plaud', ''), voice: ls.get('star.draft.voice', '') }));
  const setText = (key, v) => { setTexts((t) => ({ ...t, [key]: v })); ls.set(`star.draft.${key}`, v); };
  // 体检第 3 阶段：很长的录音分段整理。seg = { k: 第几段, n: 共几段, rest: [还没整理的段] }（存在手机，离开也不会丢）
  const [segs, setSegs] = useState(() => ({ plaud: ls.get('star.draft.plaud.seg', null), voice: ls.get('star.draft.voice.seg', null) }));
  const setSeg = (key, v) => { setSegs((x) => ({ ...x, [key]: v })); if (v) ls.set(`star.draft.${key}.seg`, v); else ls.del(`star.draft.${key}.seg`); };

  const [wa, setWa] = useState(null); // { fileName, parsed, fileGuess }
  const [waMe, setWaMe] = useState('');
  const [waThem, setWaThem] = useState('');
  const [waFrom, setWaFrom] = useState('');
  const [shots, setShots] = useState([]);

  const [step, setStep] = useState('input'); // input | analyzing | review
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null); // { analysis, transcript, occurredAt, range }
  const [saving, setSaving] = useState(false);

  /* ---------- WhatsApp：上一次导入到哪里 ---------- */
  const lastWaImport = useMemo(() => {
    if (!person) return null;
    const ends = person.interactions.filter((i) => i.source === 'whatsapp_txt' && i.ai && i.ai.range && i.ai.range.to).map((i) => i.ai.range.to).sort();
    return ends.length ? ends[ends.length - 1] : null;
  }, [person]);

  // 换人 / 换档案 → 重新猜「他是谁、我是谁、从哪天开始」
  useEffect(() => {
    if (!wa) return;
    const parts = wa.parsed.participants;
    const meNames = ls.get('star.meNames', []);
    const me = parts.find((p) => meNames.includes(p.name)) || (store.me.display_name && parts.find((p) => normName(p.name) === normName(store.me.display_name)));
    const them = matchParticipant(parts, person) || (wa.fileGuess && parts.find((p) => p.name === wa.fileGuess) ? wa.fileGuess : '')
      || (parts.find((p) => !me || p.name !== me.name) || {}).name || '';
    setWaThem(them);
    setWaMe(me ? me.name : (parts.length === 2 ? (parts.find((p) => p.name !== them) || {}).name || '' : ''));
    setWaFrom(lastWaImport ? toLocalInput(lastWaImport) : '');
  }, [wa, pid, lastWaImport]); // eslint-disable-line react-hooks/exhaustive-deps

  const waSel = useMemo(() => {
    if (!wa) return null;
    const from = waFrom ? new Date(waFrom) : null;
    const sel = selectWhatsApp(wa.parsed.messages, { from: from && !Number.isNaN(from.getTime()) ? from : null, meName: waMe, maxChars: MAX_TALK_CHARS - 200 });
    const group = wa.parsed.participants.length > 2;
    const head = waThem && (group || waThem !== (person && person.name)) ? `（他在聊天里的名字：${waThem}${group ? '；这是群组对话，只整理跟他有关的' : ''}）\n` : '';
    return { ...sel, text: head + sel.text, group };
  }, [wa, waFrom, waMe, waThem, person]);

  async function loadWaFile(file) {
    setErr('');
    try {
      let text;
      if (/\.zip$/i.test(file.name) || /zip/.test(file.type)) {
        const { unzipSync, strFromU8 } = await import('fflate');
        const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /\.txt$/i.test(f.name) });
        const key = Object.keys(files).find((k) => /_chat\.txt$/i.test(k)) || Object.keys(files)[0];
        if (!key) throw new Error('zip 里找不到聊天记录的 .txt');
        text = strFromU8(files[key]);
      } else {
        text = await file.text();
      }
      const parsed = parseWhatsApp(text);
      if (!parsed.messages.length) throw new Error('读不到讯息，这是 WhatsApp「汇出对话」的档案吗？');
      const fileGuess = nameFromWhatsAppFile(file.name);
      setWa({ fileName: file.name, parsed, fileGuess });
      if (!pid) {
        const guess = suggestPeople(store.data.people, [fileGuess, ...parsed.participants.map((p) => p.name)]);
        if (guess.length === 1) setPid(guess[0].id);
      }
    } catch (e) {
      setWa(null);
      setErr(e.message);
    }
  }

  async function addShots(files) {
    const room = MAX_SCREENSHOTS - shots.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast(`最多 ${MAX_SCREENSHOTS} 张，多的没加`, 'error');
    try {
      const out = [];
      for (const f of list) {
        const img = await shrinkImage(f, 1800, 0.8);
        out.push({ ...img, preview: URL.createObjectURL(img.blob) });
      }
      setShots((s) => [...s, ...out]);
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.preview)), []);

  /* ---------- 现在要送出去的内容 ---------- */
  const payloadText = source === 'whatsapp_txt' ? (waSel ? waSel.text : '') : source === 'whatsapp_screenshot' ? '' : (texts[source] || '').trim();
  const ready = !!person && (source === 'whatsapp_screenshot' ? shots.length > 0 : source === 'whatsapp_txt' ? !!(waSel && waSel.count) : payloadText.length >= 10);
  const tooLong = payloadText.length > MAX_TALK_CHARS;
  const textSource = source === 'plaud' || source === 'voice';
  const seg = textSource ? segs[source] : null;
  const segLabel = seg ? `（第 ${seg.k}/${seg.n} 段）` : '';
  const splitParts = textSource && payloadText.length > TALK_SPLIT_CHARS ? splitTalk(payloadText).length : 0;

  /** 分成几段：现在这格放第 1 段，其他的留在手机等着 */
  function splitNow() {
    const parts = splitTalk(payloadText);
    if (parts.length < 2) return;
    const before = seg ? seg.rest : [];
    const k = seg ? seg.k : 1;
    setSeg(source, { k, n: (seg ? seg.n - 1 : 0) + parts.length, rest: [...parts.slice(1), ...before] });
    setText(source, parts[0]);
    setErr('');
    toast(`分成 ${parts.length} 段了：先整理第 ${k} 段，存好会自动放下一段`);
  }
  const cost = estimateTalkMyr(payloadText.length, source === 'whatsapp_screenshot' ? shots.length : 0, RATE);

  function occurredAt() {
    if (source === 'whatsapp_txt' && waSel && waSel.last) return waSel.last.toISOString();
    const d = date || today();
    return new Date(`${d}T${d === today() ? new Date().toTimeString().slice(0, 5) : '12:00'}:00`).toISOString();
  }

  async function analyze() {
    setErr('');
    setStep('analyzing');
    if (source === 'whatsapp_txt' && waMe) ls.set('star.meNames', [...new Set([waMe, ...ls.get('star.meNames', [])])].slice(0, 5));
    try {
      const { analysis, usage } = await api.analyzeTalk({
        source,
        person: { name: person.name, name_alt: person.name_alt, title: person.title, company: person.company ? person.company.name : '', interests: person.interests || [] },
        me_name: source === 'whatsapp_txt' ? waMe : store.me.display_name,
        text: payloadText,
        images: source === 'whatsapp_screenshot' ? shots.map((s) => ({ media_type: s.media_type, data: s.base64 })) : undefined,
        date_hint: source === 'whatsapp_txt' ? '' : date,
      });
      store.logUsage(usage);
      if (analysis.occurred_on && !dateTouched && source !== 'whatsapp_txt') setDate(analysis.occurred_on);
      setResult({ analysis });
      setStep('review');
    } catch (e) {
      if (e.usage) store.logUsage(e.usage);
      setErr(e.message);
      setStep('input');
    }
  }

  function transcriptFor(analysis) {
    if (source === 'whatsapp_screenshot') return analysis ? analysis.transcript : '';
    return payloadText;
  }

  function rangeFor() {
    return source === 'whatsapp_txt' && waSel && waSel.first ? { from: waSel.first.toISOString(), to: waSel.last.toISOString(), count: waSel.count } : null;
  }

  function finish() {
    if (textSource && seg && seg.rest.length) {
      // 还有下一段：放进来，留在这页继续
      const [next, ...rest] = seg.rest;
      setSeg(source, { k: seg.k + 1, n: seg.n, rest });
      setText(source, next);
      setResult(null);
      setStep('input');
      toast(`第 ${seg.k} 段存好了，第 ${seg.k + 1}/${seg.n} 段放好了`);
      return;
    }
    if (textSource) { setText(source, ''); setSeg(source, null); }
    onDone(pid);
  }

  /** 不跑 AI，只把原文存成一笔互动 */
  async function saveRaw() {
    setSaving(true);
    try {
      const t = payloadText;
      await store.saveTalk(pid, {
        source, kind, occurredAt: occurredAt(),
        title: `${{ plaud: 'Plaud 录音', voice: '语音备注', whatsapp_txt: 'WhatsApp 聊天' }[source]}${segLabel}`,
        summary: source === 'voice' ? t.slice(0, 1200) : '',
        transcript: t, range: rangeFor(),
      });
      toast('存好了（没有 AI 整理）');
      finish();
    } catch (e) {
      toast(`存不了：${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveReviewed({ title, summary, pick }) {
    setSaving(true);
    try {
      await store.saveTalk(pid, {
        source, kind, occurredAt: occurredAt(), title: seg ? `${title || '对话'}${segLabel}` : title, summary, transcript: transcriptFor(result.analysis),
        analysis: result.analysis, pick, range: rangeFor(),
      });
      toast(`写进 ${person.name} 的档案了`);
      finish();
    } catch (e) {
      toast(`存不了：${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={step === 'review' ? () => setStep('input') : onCancel} className="-ml-2 rounded-full p-2 hover:bg-ink/5" aria-label="返回">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold">{step === 'review' ? '勾选要留的' : '记对话'}</h1>
      </div>

      {step === 'analyzing' && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Spinner label={source === 'whatsapp_screenshot' ? 'AI 在读截图、整理重点…' : 'AI 在整理重点…'} />
          <p className="text-xs text-faint">通常 5–20 秒</p>
        </div>
      )}

      {step === 'review' && result && person && (
        <Review person={person} analysis={result.analysis} source={source} saving={saving} onSave={saveReviewed} people={store.data.people} />
      )}

      {step === 'input' && (
        <div className="space-y-4">
          <PersonPicker person={person} onPick={setPid} suggestions={wa ? suggestPeople(store.data.people, [wa.fileGuess, ...wa.parsed.participants.map((p) => p.name)]) : []} />

          <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="来源">
            {TALK_SOURCES.map((s) => {
              const Icon = SOURCE_ICON[s.key];
              return (
                <button key={s.key} role="tab" aria-selected={source === s.key} onClick={() => { setSource(s.key); setErr(''); }}
                  className={cx('flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[12px] font-medium', source === s.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-muted hover:border-ink/30')}>
                  <Icon className="h-5 w-5" />{s.short}
                </button>
              );
            })}
          </div>

          <Section>
            <p className="mb-3 text-[13px] text-muted">{src.hint}</p>

            {(source === 'plaud' || source === 'voice') && (
              <TextSource source={source} value={texts[source]} onChange={(v) => setText(source, v)} />
            )}

            {source === 'whatsapp_txt' && (
              <WhatsAppSource wa={wa} sel={waSel} onFile={loadWaFile} onClear={() => setWa(null)}
                me={waMe} setMe={setWaMe} them={waThem} setThem={setWaThem} from={waFrom} setFrom={setWaFrom} lastImport={lastWaImport} />
            )}

            {source === 'whatsapp_screenshot' && (
              <ShotsSource shots={shots} onAdd={addShots} onRemove={(i) => setShots((s) => { URL.revokeObjectURL(s[i].preview); return s.filter((_, j) => j !== i); })} />
            )}

            {source !== 'whatsapp_txt' && (
              <div className="mt-3 flex gap-2">
                <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="类型" className={cx(inputCls, '!w-28 !py-2 text-sm')}>
                  {src.kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <input type="date" value={date} max={today()} onChange={(e) => { setDate(e.target.value); setDateTouched(true); }} aria-label="日期" className={cx(inputCls, '!py-2 text-sm')} />
              </div>
            )}
          </Section>

          {err && <div role="alert" className="rounded-xl border border-danger/30 bg-white p-3 text-sm text-danger">{err}</div>}
          {seg && (
            <div className="flex items-center gap-2 rounded-xl bg-ink/5 p-3 text-sm">
              <span className="flex-1">长录音分段整理：现在是<b> 第 {seg.k} 段 / 共 {seg.n} 段</b>{seg.rest.length ? `，存好会自动放下一段` : '（最后一段）'}</span>
              <button className="text-xs font-medium text-muted underline" onClick={() => { setSeg(source, null); toast('不分段了：剩下的段已经丢掉，框里的字还在'); }}>不分了</button>
            </div>
          )}
          {splitParts > 1 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p>这段很长（{payloadText.length.toLocaleString()} 字）。一次整理，AI 常常写不完或等太久。</p>
              <p className="mt-1">建议分成 {splitParts} 段，一段一段整理，每段存成一笔对话。</p>
              <Button size="sm" variant="accent" className="mt-2" onClick={splitNow}>分成 {splitParts} 段</Button>
              {!tooLong && <p className="mt-1 text-xs">也可以不分，直接按下面的按钮试试。</p>}
            </div>
          ) : tooLong && <p className="text-sm text-danger">太长了（{payloadText.length.toLocaleString()} 字，上限 {MAX_TALK_CHARS.toLocaleString()}），请分两次。</p>}

          <Button variant="accent" size="lg" className="w-full" disabled={!ready || tooLong} onClick={analyze}>
            <Sparkles className="h-5 w-5" />AI 整理重点
          </Button>
          {!person && <p className="text-center text-sm text-muted">先选是跟谁的对话</p>}
          {person && (
            <div className="flex items-center justify-between text-xs text-faint">
              <span>Haiku，约 {cost < 0.01 ? '不到 RM0.01' : `RM${cost.toFixed(2)}`}；原文只存在你的私有空间</span>
              {source !== 'whatsapp_screenshot' && (
                <button disabled={!ready || saving} onClick={saveRaw} className="font-medium text-muted hover:text-ink disabled:opacity-40">只存原文</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- 选人 ---------- */
function PersonPicker({ person, onPick, suggestions }) {
  const { people } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(!person);
  useEffect(() => { if (person) setOpen(false); }, [person && person.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => (q ? people.filter((p) => matchPerson(p, q)) : people.slice().sort((a, b) => String(b.last_contact_at || b.created_at).localeCompare(String(a.last_contact_at || a.created_at)))).slice(0, 8), [people, q]);

  if (person && !open) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
        <Avatar person={person} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-muted">跟谁的对话</div>
          <div className="truncate font-semibold">{person.name}<span className="font-normal text-muted">{person.company ? ` · ${person.company.name}` : ''}</span></div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>换人</Button>
      </div>
    );
  }
  return (
    <Section title="跟谁的对话？">
      {suggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className="text-[13px] text-muted">是不是：</span>
          {suggestions.map((p) => <button key={p.id} onClick={() => onPick(p.id)} className="rounded-full bg-plum/10 px-2.5 py-1 text-[13px] font-medium text-plum-deep">{p.name}</button>)}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="找名字、公司…" className={cx(inputCls, '!pl-9')} autoFocus={!suggestions.length} />
      </div>
      <ul className="mt-2 divide-y divide-line">
        {list.map((p) => (
          <li key={p.id}>
            <button onClick={() => { onPick(p.id); setOpen(false); }} className="flex w-full items-center gap-3 py-2 text-left hover:bg-ink/[0.02]">
              <Avatar person={p} size={32} />
              <span className="min-w-0 flex-1 truncate text-[15px]">{p.name}<span className="text-muted">{p.company ? ` · ${p.company.name}` : ''}</span></span>
            </button>
          </li>
        ))}
        {!list.length && <li className="py-3 text-sm text-faint">{people.length ? '没有符合的人' : '还没有人，先去扫名片或手动加'}</li>}
      </ul>
    </Section>
  );
}

/* ---------- Plaud / 语音备注 ---------- */
function TextSource({ source, value, onChange }) {
  const file = useRef(null);
  const toast = useToast();
  async function load(f) {
    if (!f) return;
    if (/\.(docx?|pdf)$/i.test(f.name)) { toast('Word / PDF 请打开后全选复制，贴在这里', 'error'); return; }
    const t = cleanTranscript(await f.text(), f.name);
    onChange(value.trim() ? `${value.trim()}\n\n${t}` : t);
  }
  return (
    <div>
      <Textarea
        rows={source === 'voice' ? 6 : 8} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={source === 'voice'
          ? '例：刚跟 Tan 喝咖啡。他女儿明年读大学，在看英国。他公司明年在 Cheras 有一个 200 间的项目，还没找室内设计。我答应下周介绍 Amy 给他……'
          : '把 Plaud 的逐字稿贴在这里（或用下面的按钮上传 .txt / .srt）'}
        aria-label={source === 'voice' ? '语音备注' : '逐字稿'}
      />
      <div className="mt-1.5 flex items-center justify-between text-xs text-faint">
        {source === 'plaud' ? (
          <button onClick={() => file.current.click()} className="flex items-center gap-1 font-medium text-muted hover:text-ink"><FileUp className="h-3.5 w-3.5" />上传 .txt / .srt</button>
        ) : <span className="flex items-center gap-1"><Mic className="h-3.5 w-3.5" />手机键盘的麦克风可以直接说中文 / 英文</span>}
        <span className="tabular-nums">{value.length.toLocaleString()} 字</span>
      </div>
      <input ref={file} type="file" accept=".txt,.srt,.vtt,.md,text/plain" className="hidden" onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

/* ---------- WhatsApp 汇出 ---------- */
function WhatsAppSource({ wa, sel, onFile, onClear, me, setMe, them, setThem, from, setFrom, lastImport }) {
  const file = useRef(null);
  if (!wa) {
    return (
      <div>
        <button onClick={() => file.current.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line py-8 text-muted hover:border-ink/30">
          <FileUp className="h-7 w-7" />
          <span className="font-medium text-ink">选汇出的档案</span>
          <span className="text-xs">iPhone 是 .zip，Android 是 .txt，两种都可以</span>
        </button>
        <input ref={file} type="file" accept=".txt,.zip,text/plain,application/zip" className="hidden" onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }
  const parts = wa.parsed.participants;
  const msgs = wa.parsed.messages;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 rounded-xl bg-ink/5 p-3 text-sm">
        <div className="min-w-0">
          <div className="truncate font-medium">{wa.fileName}</div>
          <div className="text-[13px] text-muted">{msgs.length.toLocaleString()} 则 · {fmtDate(msgs[0].at.toISOString())} – {fmtDate(msgs[msgs.length - 1].at.toISOString())} · {parts.length} 个人</div>
        </div>
        <button onClick={onClear} aria-label="换档案" className="rounded-full p-1 text-faint hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="他在聊天里叫">
          <select value={them} onChange={(e) => setThem(e.target.value)} className={cx(inputCls, '!py-2 text-sm')}>
            {parts.map((p) => <option key={p.name} value={p.name}>{p.name}（{p.count}）</option>)}
          </select>
        </Field>
        <Field label="我是">
          <select value={me} onChange={(e) => setMe(e.target.value)} className={cx(inputCls, '!py-2 text-sm')}>
            <option value="">（不确定）</option>
            {parts.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="只看这个时间之后的" hint={lastImport ? `上次导入到 ${fmtStamp(new Date(lastImport))}，默认只送新的` : '留空 = 全部（太长的话只送最近的）'}>
        <input type="datetime-local" step="1" value={from} onChange={(e) => setFrom(e.target.value)} className={cx(inputCls, '!py-2 text-sm')} />
      </Field>
      {sel && (
        <p className={cx('rounded-xl p-2.5 text-[13px]', sel.count ? 'bg-plum/5 text-ink' : 'bg-amber-50 text-amber-900')}>
          {sel.count
            ? <>会送 <b>{sel.count.toLocaleString()}</b> 则（{fmtDate(sel.first.toISOString())} – {fmtDate(sel.last.toISOString())}）{sel.truncated && `；太多了，只送最近的（共 ${sel.total.toLocaleString()} 则）`}</>
            : '这个时间之后没有新讯息'}
          {sel.group && <span className="block text-muted">这是群组，AI 只整理跟「{them}」有关的</span>}
        </p>
      )}
    </div>
  );
}

/* ---------- 截图 ---------- */
function ShotsSource({ shots, onAdd, onRemove }) {
  const file = useRef(null);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {shots.map((s, i) => (
          <div key={s.preview} className="relative">
            <img src={s.preview} alt={`截图 ${i + 1}`} className="aspect-[9/16] w-full rounded-lg border border-line object-cover object-top" />
            <span className="absolute left-1 top-1 rounded bg-ink/70 px-1.5 text-[11px] text-white">{i + 1}</span>
            <button onClick={() => onRemove(i)} aria-label="拿掉" className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {shots.length < MAX_SCREENSHOTS && (
          <button onClick={() => file.current.click()} className="flex aspect-[9/16] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-muted hover:border-ink/30">
            <Plus className="h-6 w-6" /><span className="text-xs">加截图</span>
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-faint">AI 会先把截图里的字抄下来存好；截图本身不存。</p>
      <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onAdd(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

/* ---------- 勾选 ---------- */
function Review({ person, analysis: a, source, saving, onSave, people }) {
  const [title, setTitle] = useState(a.title);
  const [summary, setSummary] = useState(a.summary);
  const all = (list) => list.map(() => true);
  const [on, setOn] = useState(() => ({
    interests: all(a.interests), has: all(a.has), needs: all(a.needs), give: all(a.give), facts: all(a.facts), action_items: all(a.action_items), avoid_topics: all(a.avoid_topics),
  }));
  const flip = (k, i) => setOn((o) => ({ ...o, [k]: o[k].map((v, j) => (j === i ? !v : v)) }));
  const keep = (k) => a[k].filter((_, i) => on[k][i]);
  const mood = MOODS[a.mood.tone] || MOODS.neutral;
  const known = (name) => {
    const n = normName(name);
    return n.length >= 2 ? people.find((p) => p.id !== person.id && [normName(p.name), normName(p.name_alt)].includes(n)) : null;
  };
  const picked = Object.keys(on).reduce((s, k) => s + on[k].filter(Boolean).length, 0);
  const nothing = !a.interests.length && !a.has.length && !a.needs.length && !a.give.length && !a.facts.length && !a.action_items.length && !a.avoid_topics.length;

  return (
    <div className="space-y-3">
      <Section>
        <div className="space-y-3">
          <Field label="标题"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="摘要"><Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
          <div className="flex items-start gap-2 text-sm">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: mood.color }} />
            <span><b>气氛：{mood.label}</b>{a.mood.note && <span className="text-muted"> —— {a.mood.note}</span>}</span>
          </div>
        </div>
      </Section>

      {nothing && <p className="rounded-xl bg-ink/5 p-3 text-sm text-muted">这段对话没整理出可以写进档案的东西，摘要还是会存。</p>}

      <PickChips title="兴趣" hint="加进他的「兴趣」" items={a.interests} on={on.interests} onFlip={(i) => flip('interests', i)} />
      <PickRows title="他有的" tone="has" items={a.has.map((x) => [x.label, x.detail])} on={on.has} onFlip={(i) => flip('has', i)} />
      <PickRows title="他需要的" tone="needs" items={a.needs.map((x) => [x.label, x.detail])} on={on.needs} onFlip={(i) => flip('needs', i)} />
      <PickRows title={<span className="flex items-center gap-1.5"><Handshake className="h-4 w-4 text-plum" />我可以帮他的</span>} tone="give" items={a.give.map((x) => [x.idea, x.why])} on={on.give} onFlip={(i) => flip('give', i)} />
      <PickRows title="记住这些" hint="会接在「我的备注」后面" items={a.facts.map((x) => [x, ''])} on={on.facts} onFlip={(i) => flip('facts', i)} />
      <PickRows
        title="答应的事" hint="会出现在他页面上的「答应过的事」，做完打勾"
        items={a.action_items.map((x) => [`${{ me: '我', him: '他', both: '一起' }[x.who]}：${x.what}`, x.due])}
        on={on.action_items} onFlip={(i) => flip('action_items', i)}
      />
      <PickChips title={<span className="flex items-center gap-1.5"><Ban className="h-4 w-4 text-danger" />要避开的话题</span>} items={a.avoid_topics} on={on.avoid_topics} onFlip={(i) => flip('avoid_topics', i)} />

      {a.people_mentioned.length > 0 && (
        <Section title={<span className="flex items-center gap-1.5"><Users className="h-4 w-4" />提到的人</span>}>
          <ul className="space-y-1.5 text-sm">
            {a.people_mentioned.map((p, i) => {
              const hit = known(p.name);
              return (
                <li key={i}>
                  <b>{p.name}</b> <span className="text-muted">{p.context}</span>
                  {hit && <a href={`#/p/${hit.id}`} className="ml-1 text-xs font-medium text-plum-deep">· 已在人脉里</a>}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {a.next_topics.length > 0 && (
        <Section title={<span className="flex items-center gap-1.5"><MessagesSquare className="h-4 w-4" />下次可以聊</span>}>
          <div className="flex flex-wrap gap-1.5">{a.next_topics.map((t, i) => <Chip key={i} tone="soft">{t}</Chip>)}</div>
        </Section>
      )}

      {source === 'whatsapp_screenshot' && a.transcript && (
        <details className="rounded-2xl border border-line bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium">截图里的对话（AI 抄的）</summary>
          <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-[13px] text-muted">{a.transcript}</pre>
        </details>
      )}

      <div className="sticky bottom-3 pt-2">
        <Button variant="accent" size="lg" className="w-full shadow-lg" busy={saving}
          onClick={() => onSave({ title, summary, pick: Object.fromEntries(Object.keys(on).map((k) => [k, keep(k)])) })}>
          <Check className="h-5 w-5" />写进 {person.name} 的档案{picked ? `（${picked} 项）` : ''}
        </Button>
      </div>
    </div>
  );
}

function PickChips({ title, hint, items, on, onFlip }) {
  if (!items.length) return null;
  return (
    <Section title={title} action={hint && <span className="text-xs text-faint">{hint}</span>}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <button key={i} onClick={() => onFlip(i)} aria-pressed={on[i]}
            className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px]', on[i] ? 'border-ink bg-ink text-white' : 'border-line bg-white text-faint line-through')}>
            {on[i] && <Check className="h-3 w-3" />}{t}
          </button>
        ))}
      </div>
    </Section>
  );
}

function PickRows({ title, hint, items, on, onFlip, tone }) {
  if (!items.length) return null;
  const dot = { has: 'bg-sky-500', needs: 'bg-amber-500', give: 'bg-plum' }[tone] || 'bg-ink/40';
  return (
    <Section title={title} action={hint && <span className="text-right text-xs text-faint">{hint}</span>}>
      <ul className="space-y-1">
        {items.map(([label, detail], i) => (
          <li key={i}>
            <label className={cx('flex cursor-pointer gap-2.5 rounded-lg p-1.5 hover:bg-ink/[0.03]', !on[i] && 'opacity-45')}>
              <input type="checkbox" checked={on[i]} onChange={() => onFlip(i)} className="mt-1 h-4 w-4 shrink-0 accent-[#22A55B]" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[15px]"><span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />{label}</span>
                {detail && <span className="block text-[13px] text-muted">{detail}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}
