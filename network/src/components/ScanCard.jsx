import React, { useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, ScanLine, Plus, Trash2, AlertTriangle, Sparkles, ChevronLeft, PenLine, Layers, Smartphone } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { shrinkImage } from '../lib/image.js';
import { findDuplicates, pickWhatsApp, fmtDate, uid } from '../lib/logic.js';
import { repo } from '../lib/repo.js';
import { klDate } from '../lib/card.js';
import { burstQueue, newShot, makeSession } from '../lib/burst.js';
import { Button, Field, Input, Textarea, Section, Spinner, Chip, useToast, cx } from './ui.jsx';

const EMPTY_CARD = {
  name: '', name_alt: '', title: '', company: '', company_alt: '', phones: [], emails: [], website: '', address: '',
  socials: [], industry_guess: '', card_notes: '', is_business_card: true,
};

export default function ScanCard({ onDone, onCancel, onBurst, onInbox }) {
  const store = useStore();
  const toast = useToast();
  const [step, setStep] = useState('capture'); // capture | reading | review
  const [shots, setShots] = useState({ front: null, back: null }); // { blob, base64, width, height, media_type, preview }
  const [card, setCard] = useState(EMPTY_CARD);
  const [form, setForm] = useState(null);
  const [scanErr, setScanErr] = useState('');
  const [existingId, setExistingId] = useState(null);
  const [analyze, setAnalyze] = useState(false);
  const [saving, setSaving] = useState(false);
  // 这一次扫描固定的 id：存到一半失败再按一次，不会多出第二个人 / 第二张照片
  const ids = React.useRef({ person: uid(), photos: [uid(), uid()], interaction: uid() }).current;
  // 在哪个活动认识的（今天的活动自动选好）→ 存的时候记出席
  const events = useMemo(() => store.data.events.slice().sort((a, b) => String(b.held_on || '').localeCompare(String(a.held_on || ''))).slice(0, 8), [store.data.events]);
  const [eventId, setEventId] = useState(() => (store.data.events.find((e) => e.held_on === klDate()) || {}).id || '');
  const event = events.find((e) => e.id === eventId) || null;
  const [offline, setOffline] = useState(false);

  async function pick(side, file) {
    if (!file) return;
    try {
      const img = await shrinkImage(file, 1600, 0.85);
      setShots((s) => {
        if (s[side] && s[side].preview) URL.revokeObjectURL(s[side].preview);
        return { ...s, [side]: { ...img, preview: URL.createObjectURL(img.blob) } };
      });
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function startReview(c) {
    const today = fmtDate(new Date().toISOString());
    setCard(c);
    setForm({
      name: c.name, name_alt: c.name_alt, title: c.title, company: c.company,
      phones: c.phones.length ? c.phones : [], emails: c.emails, whatsapp: pickWhatsApp(c.phones),
      website: c.website, address: c.address, how_met: event ? event.name : '', met_on: (event && event.held_on) || today, tags: '', notes: '',
    });
    setStep('review');
  }

  async function read() {
    const imgs = [shots.front, shots.back].filter(Boolean);
    if (!imgs.length) return;
    setStep('reading');
    setScanErr('');
    try {
      const { card: c, usage } = await api.scanCard(imgs.map((i) => ({ media_type: i.media_type, data: i.base64 })));
      store.logUsage(usage);
      if (!c.is_business_card) toast('这张看起来不像名片，请检查一下', 'error');
      startReview({ ...EMPTY_CARD, ...c });
    } catch (e) {
      if (e.usage) store.logUsage(e.usage);
      setScanErr(e.message);
      setOffline(e.status === 0);
      setStep('capture');
    }
  }

  /** 没网络：照片先存在手机（跟活动连拍同一个地方），有网络自动读、进「新朋友」 */
  async function keepOnPhone() {
    try {
      const owner = await repo.sessionUserId().catch(() => '');
      const session = { ...makeSession({ event, howMet: '' }), started: new Date().toISOString() };
      const toImg = async (sh) => ({ data: await sh.blob.arrayBuffer(), type: sh.media_type || 'image/jpeg', width: sh.width, height: sh.height });
      const item = newShot({ session, front: await toImg(shots.front), thumb: `data:image/jpeg;base64,${shots.front.base64}`, owner });
      if (shots.back) item.back = await toImg(shots.back);
      await burstQueue().add(item);
      toast('存在手机了：有网络会自动读好、放进「新朋友」');
      setShots({ front: null, back: null });
      setScanErr('');
      setOffline(false);
    } catch (e) {
      toast(`存不了：${e.message}`, 'error');
    }
  }

  const dups = useMemo(
    () => (form ? findDuplicates({ ...card, name: form.name, company: form.company, phones: form.phones, emails: form.emails }, store.data.people, store.data.companies) : []),
    [form, card, store.data.people, store.data.companies],
  );

  // 电话 / 邮箱一样的话，默认「更新这个人」，不要不小心多存一份
  const [dupTouched, setDupTouched] = useState(false);
  React.useEffect(() => {
    if (!dupTouched && dups[0] && dups[0].strong && existingId == null) setExistingId(dups[0].person.id);
  }, [dups, dupTouched, existingId]);

  async function save() {
    if (!form.name.trim()) { toast('至少要有名字', 'error'); return; }
    setSaving(true);
    try {
      const person = await store.saveFromCard({
        card,
        form: { ...form, phones: form.phones.filter((p) => p.number.trim()), emails: form.emails.filter(Boolean) },
        cardImages: [shots.front, shots.back].filter(Boolean),
        existingId,
        ids,
        eventId: event ? event.id : null,
      });
      toast(existingId ? '已更新' : '已存好');
      onDone(person.id, { analyze });
    } catch (e) {
      toast(`存不了：${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={step === 'review' ? () => setStep('capture') : onCancel} className="-ml-2 rounded-full p-2 hover:bg-ink/5" aria-label="返回">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold">{step === 'review' ? '检查一下资料' : '扫名片'}</h1>
      </div>

      {step === 'capture' && (
        <div className="space-y-4">
          {onBurst && (
            <button onClick={onBurst} className="flex w-full items-center gap-3 rounded-2xl border-2 border-plum/40 bg-white p-3 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-plum/10 text-plum"><Layers className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">在活动现场？用连拍</span>
                <span className="block text-sm text-muted">一张接一张拍，不用等；没网络也不会丢</span>
              </span>
            </button>
          )}
          {events.length > 0 && (
            <Field label="在哪个活动（选填，会记进出席名单）">
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-white px-3">
                <option value="">不是活动</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name}{e.held_on ? `（${e.held_on}）` : ''}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <ShotSlot label="正面" shot={shots.front} onPick={(f) => pick('front', f)} onClear={() => setShots((s) => ({ ...s, front: null }))} primary />
            <ShotSlot label="背面（可不拍）" shot={shots.back} onPick={(f) => pick('back', f)} onClear={() => setShots((s) => ({ ...s, back: null }))} />
          </div>
          {scanErr && (
            <div className="rounded-xl border border-danger/30 bg-white p-3 text-sm text-danger">
              识别失败：{scanErr}
              <div className="mt-2 flex flex-wrap gap-2">
                {offline && <Button size="sm" variant="accent" onClick={keepOnPhone}><Smartphone className="h-4 w-4" />先存在手机，有网络自动读</Button>}
                <Button size="sm" variant="outline" onClick={() => startReview(EMPTY_CARD)}>改成手动填写（照片照样存）</Button>
              </div>
            </div>
          )}
          <Button variant="accent" size="lg" className="w-full" disabled={!shots.front} onClick={read}>
            <ScanLine className="h-5 w-5" />识别名片
          </Button>
          <button onClick={() => startReview(EMPTY_CARD)} className="mx-auto flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <PenLine className="h-4 w-4" />没有名片？手动输入
          </button>
          <p className="text-center text-xs text-faint">识别用 Haiku，一张约 RM0.01。照片只存在你的私有空间。</p>
        </div>
      )}

      {step === 'reading' && (
        <div className="flex flex-col items-center gap-4 py-16">
          {shots.front && <img src={shots.front.preview} alt="" className="w-56 rounded-xl shadow-lg" />}
          <Spinner label="AI 在读名片…" />
        </div>
      )}

      {step === 'review' && form && (
        <div className="space-y-4">
          {(shots.front || shots.back) && (
            <div className="flex gap-2 overflow-x-auto">
              {[shots.front, shots.back].filter(Boolean).map((s, i) => <img key={i} src={s.preview} alt="名片" className="h-28 rounded-lg border border-line object-cover" />)}
            </div>
          )}

          {dups.length > 0 && (
            <Section title={<span className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-4 w-4" />可能已经存过</span>}>
              <div className="space-y-2">
                {dups.slice(0, 3).map((d) => (
                  <label key={d.person.id} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border p-3', existingId === d.person.id ? 'border-ink bg-ink/5' : 'border-line')}>
                    <input type="radio" name="dup" checked={existingId === d.person.id} onChange={() => { setDupTouched(true); setExistingId(d.person.id); }} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{d.person.name}</div>
                      <div className="text-xs text-muted">{d.reasons.join('、')}</div>
                    </div>
                  </label>
                ))}
                <label className={cx('flex cursor-pointer items-center gap-3 rounded-xl border p-3', existingId == null ? 'border-ink bg-ink/5' : 'border-line')}>
                  <input type="radio" name="dup" checked={existingId == null} onChange={() => { setDupTouched(true); setExistingId(null); }} />
                  <span>不是同一个人，新增</span>
                </label>
              </div>
            </Section>
          )}

          <Section title="名片资料">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="名字 *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="另一种写法"><Input value={form.name_alt} onChange={(e) => setForm({ ...form, name_alt: e.target.value })} /></Field>
              </div>
              <Field label="职位"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="公司"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
              <PhonesEditor phones={form.phones} onChange={(phones) => setForm({ ...form, phones, whatsapp: form.whatsapp || pickWhatsApp(phones) })} />
              <Field label="WhatsApp" hint="只要数字，含国家码，例：60123456789">
                <Input inputMode="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value.replace(/[^\d]/g, '') })} />
              </Field>
              <Field label="邮箱（多个用逗号分开）">
                <Input type="text" inputMode="email" value={form.emails.join(', ')} onChange={(e) => setForm({ ...form, emails: e.target.value.split(/[,，\s]+/).filter(Boolean) })} />
              </Field>
              <Field label="网站"><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></Field>
              <Field label="地址"><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              {(card.industry_guess || card.card_notes) && (
                <div className="rounded-xl bg-ink/5 p-3 text-sm text-muted">
                  {card.industry_guess && <div><b className="text-ink">行业：</b>{card.industry_guess}</div>}
                  {card.card_notes && <div className="mt-1"><b className="text-ink">名片上还写：</b>{card.card_notes}</div>}
                </div>
              )}
              {card.socials.length > 0 && <div className="flex flex-wrap gap-1">{card.socials.map((s, i) => <Chip key={i} tone="soft">{s.platform}: {s.handle}</Chip>)}</div>}
            </div>
          </Section>

          <Section title="怎么认识的">
            <div className="space-y-3">
              <Field label="场合"><Input placeholder="例：KL 商会晚宴、朋友介绍…" value={form.how_met} onChange={(e) => setForm({ ...form, how_met: e.target.value })} /></Field>
              <Field label="日期"><Input type="date" value={form.met_on} onChange={(e) => setForm({ ...form, met_on: e.target.value })} /></Field>
              <Field label="标签（逗号分开）"><Input placeholder="例：发展商, 高尔夫" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
              <Field label="当场的印象 / 聊了什么"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
          </Section>

          <label className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4">
            <input type="checkbox" className="mt-1" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} />
            <span>
              <span className="flex items-center gap-1.5 font-medium"><Sparkles className="h-4 w-4 text-plum" />存好后马上深度分析</span>
              <span className="mt-0.5 block text-sm text-muted">查公司背景 + 4 个维度评分 + 我能给他什么（Sonnet，一个人约 RM0.5）</span>
            </span>
          </label>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
            <Button size="lg" className="mx-auto flex w-full max-w-xl" busy={saving} onClick={save}>{existingId ? '更新这个人' : '存起来'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShotSlot({ label, shot, onPick, onClear, primary }) {
  const cam = useRef(null);
  const lib = useRef(null);
  return (
    <div className="space-y-2">
      <div className={cx('relative flex aspect-[1.6] items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-white', primary ? 'border-plum/50' : 'border-line')}>
        {shot ? (
          <>
            <img src={shot.preview} alt={label} className="h-full w-full object-cover" />
            <button onClick={onClear} aria-label="删掉" className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1.5 text-white"><Trash2 className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <button onClick={() => cam.current.click()} className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted">
            <Camera className={cx('h-7 w-7', primary && 'text-plum')} />
            <span className="text-sm">{label}</span>
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => cam.current.click()}><Camera className="h-4 w-4" />拍</Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => lib.current.click()}><ImagePlus className="h-4 w-4" />相册</Button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPick(e.target.files[0]); e.target.value = ''; }} />
      <input ref={lib} type="file" accept="image/*" className="hidden" onChange={(e) => { onPick(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

export function PhonesEditor({ phones, onChange }) {
  const set = (i, patch) => onChange(phones.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <Field label="电话">
      <div className="space-y-2">
        {phones.map((p, i) => (
          <div key={i} className="flex gap-2">
            <select value={p.label} onChange={(e) => set(i, { label: e.target.value })} className="w-28 rounded-xl border border-line bg-white px-2 text-sm">
              {['mobile', 'whatsapp', 'office', 'fax', 'other'].map((l) => <option key={l} value={l}>{{ mobile: '手机', whatsapp: 'WhatsApp', office: '公司', fax: '传真', other: '其他' }[l]}</option>)}
            </select>
            <Input inputMode="tel" value={p.number} onChange={(e) => set(i, { number: e.target.value })} />
            <button type="button" onClick={() => onChange(phones.filter((_, j) => j !== i))} className="px-2 text-faint hover:text-danger" aria-label="删除电话"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...phones, { label: 'mobile', number: '' }])}><Plus className="h-4 w-4" />加电话</Button>
      </div>
    </Field>
  );
}
