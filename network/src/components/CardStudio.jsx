import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink, Copy, Download, QrCode as QrIcon, Nfc, CalendarPlus, Trash2, ImagePlus, Film, Plus, X, Users,
} from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { repo } from '../lib/repo.js';
import { cardLink, cardReady, cleanLines, MAX_OFFERS, MAX_CASES, MAX_SOCIALS, MAX_OPENING, MAX_MILESTONES, MAX_GROUPS, MAX_STATS, MAX_AWARDS, MAX_EXHIBITIONS, MAX_BRANDS, MAX_POINTS, MAX_SERIES, MAX_IG_VIDEOS, MAX_LIFE, MAX_HOBBIES, SOCIAL_PLATFORMS } from '../lib/card.js';
import { qrPath, qrPng } from '../lib/qr.js';
import { fmtDate } from '../lib/logic.js';
import { Button, Field, Input, Textarea, Section, Sheet, useToast, cx } from './ui.jsx';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const SOCIAL_LABEL = { linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', xiaohongshu: '小红书', tiktok: 'TikTok', youtube: 'YouTube', website: '网站' };

/** 画面用的二维码（SVG） */
export function QrCode({ value, size = 220, className }) {
  const { d, size: n } = useMemo(() => qrPath(value), [value]);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" className={cx('rounded-xl bg-white', className)} role="img" aria-label={`二维码：${value}`}>
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#1C1917" />
    </svg>
  );
}

async function downloadQr(value, fileName, title, sub) {
  const blob = await qrPng(value, { title, sub });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function copy(text, toast) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => toast('复制好了'))
    .catch(() => window.prompt('复制这个连结：', text));
}

export default function CardStudio() {
  const store = useStore();
  const toast = useToast();
  const [kind, setKind] = useState('qr'); // qr | nfc | folotoy
  const link = cardLink(ORIGIN, { source: kind });
  const ready = cardReady(store.card);

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 pb-32 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">我的名片</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => copy(cardLink(ORIGIN), toast)}><Copy className="h-4 w-4" />复制连结</Button>
          <a href="/c" target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-medium text-white"><ExternalLink className="h-4 w-4" />打开</a>
        </div>
      </div>
      {!ready && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">先在下面填名字和至少一个联络方式（WhatsApp / 电话 / 邮箱），再把二维码印出来。</p>}
      {store.mode === 'local' && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">本机模式：名片页能预览，但别人扫码留的资料要接上 Supabase 才收得到（见 DEPLOY.md「第 4 阶段升级」）。</p>}

      <Section title="给别人扫的二维码" action={<span className="hidden text-xs text-faint sm:inline">扫了 → 看名片 → 留资料 → 自动进 SPACE</span>}>
        <div className="mb-3 flex gap-1 rounded-xl bg-ink/5 p-1 text-sm">
          {[['qr', '一般'], ['nfc', 'NFC 贴纸'], ['folotoy', 'FoloToy']].map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={cx('flex-1 rounded-lg py-1.5', kind === k ? 'bg-white font-medium shadow-sm' : 'text-muted')}>{l}</button>
          ))}
        </div>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <QrCode value={link} size={200} className="border border-line" />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <p className="break-all rounded-lg bg-ink/5 px-2 py-1.5 font-mono text-xs">{link}</p>
            {kind === 'qr' && <p className="text-muted">印在名片背面、桌卡、展厅门口。扫进来的人标签是「扫码」。</p>}
            {kind === 'nfc' && <NfcWriter url={link} />}
            {kind === 'folotoy' && (
              <p className="text-muted">这个连结放进 FoloToy 的韧体设定（<code>SPACE_CARD_URL</code>），屏幕上就会显示同一个二维码；扫进来的人会记成「扫 FoloToy 留资料」。做法见 <code>network/folotoy/README.md</code>。</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => copy(link, toast)}><Copy className="h-4 w-4" />复制</Button>
              <Button size="sm" variant="outline" onClick={() => downloadQr(link, `名片二维码-${kind}.png`, store.card.name, '扫码交换联络方式 · Scan to connect')}><Download className="h-4 w-4" />下载 PNG（印刷用）</Button>
            </div>
          </div>
        </div>
      </Section>

      <EventsSection />
      <CardEditor />
    </div>
  );
}

/* ---------- NFC ---------- */
function NfcWriter({ url }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== 'undefined' && 'NDEFReader' in window;
  async function write() {
    setBusy(true);
    try {
      const ndef = new window.NDEFReader();
      toast('把手机背面贴近 NFC 贴纸…');
      await ndef.write({ records: [{ recordType: 'url', data: url }] }, { overwrite: true });
      toast('写好了！用别的手机碰一下试试');
    } catch (e) {
      toast(e && e.name === 'NotAllowedError' ? '没有给 NFC 权限' : `写不进去：${e.message || e}`, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 text-muted">
      {supported ? (
        <Button size="sm" variant="accent" busy={busy} onClick={write}><Nfc className="h-4 w-4" />写进 NFC 贴纸</Button>
      ) : (
        <p>这台手机的浏览器不能直接写 NFC（只有 Android 的 Chrome 可以）。iPhone：装免费的 <b>NFC Tools</b> → 写 → 添加记录 → 网址 → 贴上面的连结 → 写 → 贴近贴纸。</p>
      )}
      <p className="text-xs">贴纸用 <b>NTAG215 / NTAG213</b>（Shopee 一张几毛钱）。写好之后别人的手机碰一下就打开名片，iPhone 不用开任何 app。贴在手机壳、名片夹、展厅桌上都可以。</p>
    </div>
  );
}

/* ---------- 活动二维码 ---------- */
function EventsSection() {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', held_on: new Date().toISOString().slice(0, 10), location: '' });
  const counts = useMemo(() => {
    const m = new Map();
    for (const a of store.data.attendance) m.set(a.event_id, (m.get(a.event_id) || 0) + 1);
    return m;
  }, [store.data.attendance]);
  const events = useMemo(() => store.data.events.slice().sort((a, b) => String(b.held_on || b.created_at).localeCompare(String(a.held_on || a.created_at))), [store.data.events]);

  async function add() {
    if (!f.name.trim()) return;
    try {
      const ev = await store.saveEvent(f);
      setAdding(false);
      setF({ name: '', held_on: new Date().toISOString().slice(0, 10), location: '' });
      setOpen(ev.id);
    } catch (e) { toast(e.message, 'error'); }
  }

  const current = events.find((e) => e.id === open);
  return (
    <Section title="活动模式" action={<Button size="sm" variant="outline" onClick={() => setAdding((x) => !x)}><CalendarPlus className="h-4 w-4" />新活动</Button>}>
      <p className="mb-3 text-sm text-muted">每个活动一个专属二维码：扫码的人自动记到那个活动的出席名单，「怎么认识」也自动填好。</p>
      {adding && (
        <div className="mb-3 space-y-2 rounded-xl bg-ink/5 p-3">
          <Field label="活动名"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="例：BNI 早餐会、商会年度晚宴" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="日期"><Input type="date" value={f.held_on} onChange={(e) => setF({ ...f, held_on: e.target.value })} /></Field>
            <Field label="地点"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>取消</Button><Button size="sm" onClick={add} disabled={!f.name.trim()}>建好，拿二维码</Button></div>
        </div>
      )}
      {!events.length && !adding && <p className="text-sm text-faint">还没有活动</p>}
      <ul className="divide-y divide-line">
        {events.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{e.name}</div>
              <div className="text-xs text-muted">{[fmtDate(e.held_on), e.location].filter(Boolean).join(' · ')}</div>
            </div>
            <span className="flex items-center gap-1 text-sm text-muted"><Users className="h-4 w-4" />{counts.get(e.id) || 0}</span>
            <Button size="sm" variant="outline" onClick={() => setOpen(e.id)}><QrIcon className="h-4 w-4" />二维码</Button>
          </li>
        ))}
      </ul>
      <Sheet open={!!current} onClose={() => setOpen(null)} title={current ? current.name : ''}>
        {current && <EventSheet event={current} onDeleted={() => setOpen(null)} />}
      </Sheet>
    </Section>
  );
}

function EventSheet({ event, onDeleted }) {
  const store = useStore();
  const toast = useToast();
  const link = cardLink(ORIGIN, { event: event.id });
  const people = store.data.attendance.filter((a) => a.event_id === event.id).map((a) => store.people.find((p) => p.id === a.person_id)).filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2">
        <QrCode value={link} size={240} className="border border-line" />
        <p className="break-all text-center font-mono text-[11px] text-muted">{link}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => copy(link, toast)}><Copy className="h-4 w-4" />复制</Button>
          <Button size="sm" variant="outline" onClick={() => downloadQr(link, `${event.name}-二维码.png`, event.name, `${store.card.name} · 扫码交换联络方式`)}><Download className="h-4 w-4" />下载 PNG</Button>
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">扫码进来的 {people.length} 个人</h3>
        {!people.length && <p className="text-sm text-faint">还没有人</p>}
        <ul className="space-y-1">
          {people.map((p) => <li key={p.id}><a href={`#/p/${p.id}`} className="text-sm underline-offset-2 hover:underline">{p.name}</a>{p.company && <span className="text-sm text-muted"> · {p.company.name}</span>}</li>)}
        </ul>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="danger" onClick={async () => { if (window.confirm('删掉这个活动？（人不会删，只删出席记录）')) { await store.deleteEvent(event.id); onDeleted(); } }}><Trash2 className="h-4 w-4" />删掉活动</Button>
      </div>
    </div>
  );
}

/* ---------- 编辑名片内容 ---------- */
function CardEditor() {
  const store = useStore();
  const toast = useToast();
  const [f, setF] = useState(store.card);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const dirty = JSON.stringify(f) !== JSON.stringify(store.card);
  useEffect(() => { setF(store.card); }, [store.card]);
  // 本机模式：上传过的图在 IndexedDB，打开时先放进预览网址
  const [, bump] = useState(0);
  useEffect(() => {
    const paths = [store.card.photo_path, store.card.video_path, store.card.poster_path, store.card.about_photo_path, store.card.opening_bg_path, ...store.card.life.items.map((m) => m.image_path), ...store.card.brands.flatMap((b) => [b.logo_path, b.photo_path, b.photo2_path, b.awards_photo_path, ...b.series.map((m) => m.image_path)]), ...store.card.cases.map((c) => c.image_path), ...store.card.socials.map((x) => x.icon_path), ...store.card.groups.map((g) => g.logo_path), ...store.card.card_images];
    if (repo.warmPublic) repo.warmPublic(paths).then(() => bump((x) => x + 1)).catch(() => null);
  }, [store.card]);

  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  async function save() {
    setBusy(true);
    try { await store.saveCard({ ...f, opening: cleanLines(f.opening), opening_en: cleanLines(f.opening_en), ig_videos: cleanLines(f.ig_videos, MAX_IG_VIDEOS, 300), life: { ...f.life, hobbies: cleanLines(f.life.hobbies, MAX_HOBBIES, 20) }, brands: (f.brands || []).map((b) => ({ ...b, chips: cleanLines(b.chips, MAX_EXHIBITIONS) })) }); toast('名片存好了（公开页 1 分钟内更新）'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function upload(file, kind, apply) {
    if (!file) return;
    setUploading(kind);
    try { apply(await store.uploadCardMedia(file, kind)); } catch (e) { toast(e.message, 'error'); } finally { setUploading(''); }
  }

  return (
    <>
      <Section title="开场：照片 / 视频" action={<span className="text-xs text-faint">放在公开空间，谁都看得到</span>}>
        <div className="grid grid-cols-2 gap-3">
          <MediaSlot label="我的照片" path={f.photo_path} busy={uploading === 'photo'} accept="image/*" icon={ImagePlus}
            onPick={(file) => upload(file, 'photo', (p) => set({ photo_path: p }))} onClear={() => set({ photo_path: '' })} />
          <MediaSlot label="展厅视频（选填）" path={f.video_path} video busy={uploading === 'video'} accept="video/mp4,video/webm,video/quicktime" icon={Film}
            onPick={(file) => upload(file, 'video', (p) => set({ video_path: p, video_url: '' }))} onClear={() => set({ video_path: '' })} />
        </div>
        <p className="mt-2 text-xs text-faint">视频：10–20 秒、静音也好看、竖的或横的都行，MP4 ≤ 50MB（建议 720p，打开比较快）。有视频的话照片会变成小头像。</p>
        <Field className="mt-3" label={`Instagram 视频链接（一行一个，最多 ${MAX_IG_VIDEOS} 个）`} hint="帖子要公开；名片上会放 Instagram 的播放框，别人点一下就在名片里播">
          <Textarea rows={2} value={(f.ig_videos || []).join('\n')} onChange={(e) => set({ ig_videos: e.target.value.split('\n').slice(0, MAX_IG_VIDEOS) })} placeholder="https://www.instagram.com/reel/…" />
        </Field>
        {!f.video_path && (
          <Field className="mt-2" label="或者贴视频网址（MP4 直链，https）"><Input value={f.video_url} onChange={(e) => set({ video_url: e.target.value })} placeholder="https://…/showroom.mp4" /></Field>
        )}
      </Section>

      <Section title="开场白（全黑、一句一句出现，然后亮起来）">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.opening_on} onChange={(e) => set({ opening_on: e.target.checked })} className="h-4 w-4 accent-plum" />
          打开名片先播开场（第一次约 9 秒，之后只亮 1 秒；点一下就跳过）
        </label>
        {f.opening_on && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`中文（一行一句，最多 ${MAX_OPENING} 句）`} hint="空白 = 你好 / 我是…，你可以叫我… / 很高兴认识你 / 希望我们之间的认识，能为你创造价值">
              <Textarea rows={5} value={(f.opening || []).join('\n')} onChange={(e) => set({ opening: e.target.value.split('\n').slice(0, MAX_OPENING) })} placeholder={'你好\n我是张炜盛，你可以叫我 Wilson\n很高兴认识你\n希望我们之间的认识，能为你创造价值'} />
            </Field>
            <Field label="English（一行一句）" hint="空白 = Hello / I’m … / Nice to meet you / …">
              <Textarea rows={5} value={(f.opening_en || []).join('\n')} onChange={(e) => set({ opening_en: e.target.value.split('\n').slice(0, MAX_OPENING) })} placeholder={'Hello\nI’m Wilson Teo — 张炜盛.\nNice to meet you.'} />
            </Field>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <MediaSlot small path={f.opening_bg_path} busy={uploading === 'opbg'} accept="image/*" icon={ImagePlus}
            onPick={(file) => upload(file, 'case', (p) => set({ opening_bg_path: p }))} onClear={() => set({ opening_bg_path: '' })} />
          <p className="text-xs text-faint">亮起来之后的背景照片（横的、1600px 以上比较清楚；空白 = 森林）。名字下面那句是「一句话介绍」。</p>
        </div>
      </Section>

      <Section title="名字和介绍">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="名字"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="另一个名字（中文 / 英文）"><Input value={f.name_alt} onChange={(e) => set({ name_alt: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="职位"><Input value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="公司"><Input value={f.company} onChange={(e) => set({ company: e.target.value })} /></Field>
          </div>
          <Field label="一句话介绍"><Input value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={160} /></Field>
          <div className="flex gap-3">
            <MediaSlot small path={f.about_photo_path} busy={uploading === 'about'} accept="image/*" icon={ImagePlus}
              onPick={(file) => { setUploading('about'); store.uploadCardMedia(file, 'case').then((p) => set({ about_photo_path: p })).catch((e) => toast(e.message, 'error')).finally(() => setUploading('')); }}
              onClear={() => set({ about_photo_path: '' })} />
            <Field className="flex-1" label="关于我（放在页面下面，几行就好）"><Textarea value={f.intro} onChange={(e) => set({ intro: e.target.value })} maxLength={1200} /></Field>
          </div>
        </div>
      </Section>

      <Section title="联络方式">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="WhatsApp 号码" hint="012-345 6789 也可以，会自动变成 60123456789"><Input type="tel" value={f.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} /></Field>
          <Field label="办公室电话（选填）"><Input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="邮箱"><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="网站"><Input value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder="riccione.com.my" /></Field>
        </div>
        <Field className="mt-3" label="地址 / 展厅"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <ListEditor className="mt-3" label="社交平台" max={MAX_SOCIALS} items={f.socials} onChange={(socials) => set({ socials })}
          blank={{ platform: 'instagram', url: '', label: '', icon_path: '' }}
          render={(s, upd, i) => (
            <div className="flex flex-1 gap-2">
              <MediaSlot small path={s.icon_path} busy={uploading === `icon${i}`} accept="image/*" icon={ImagePlus}
                onPick={(file) => { setUploading(`icon${i}`); store.uploadCardMedia(file, 'case').then((p) => upd({ ...s, icon_path: p })).catch((e) => toast(e.message, 'error')).finally(() => setUploading('')); }}
                onClear={() => upd({ ...s, icon_path: '' })} />
              <div className="flex-1 space-y-1">
                <div className="flex gap-2">
                  <select value={s.platform} onChange={(e) => upd({ ...s, platform: e.target.value })} className="rounded-xl border border-line bg-white px-2 text-sm">
                    {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{SOCIAL_LABEL[p]}</option>)}
                  </select>
                  <Input value={s.label || ''} onChange={(e) => upd({ ...s, label: e.target.value })} placeholder="名字：例 溪岸 Sail" maxLength={40} />
                </div>
                <Input value={s.url} onChange={(e) => upd({ ...s, url: e.target.value })} placeholder="https://instagram.com/…" />
              </div>
            </div>
          )} />
        <p className="mt-1 text-xs text-faint">左边的小图 = 卡片上的 logo / 头像（选填）。</p>
      </Section>

      <Section title="品牌（一个品牌一大块，空的部分不显示）" action={<span className="text-xs text-faint">最多 {MAX_BRANDS} 个</span>}>
        <div className="space-y-3">
          {(f.brands || []).map((b, i) => (
            <BrandEditor key={i} b={b} upload={(file, key) => { setUploading(`brand${i}${key}`); return store.uploadCardMedia(file, 'case').finally(() => setUploading('')); }} uploading={uploading} idx={i}
              onChange={(nb) => set({ brands: f.brands.map((x, k) => (k === i ? nb : x)) })}
              onRemove={() => { if (window.confirm(`拿掉「${b.name || '这个品牌'}」？`)) set({ brands: f.brands.filter((_, k) => k !== i) }); }}
              onError={(e) => toast(e.message, 'error')} />
          ))}
          {(f.brands || []).length < MAX_BRANDS && (
            <Button variant="ghost" onClick={() => set({ brands: [...(f.brands || []), { name: '', logo_path: '', photo_path: '', photo2_path: '', title: '', lead: '', points: [], stats: [], awards_photo_path: '', awards: [], chips_title: '', chips: [], series: [], milestones: [] }] })}>＋ 加一个品牌</Button>
          )}
        </div>
      </Section>

      <Section title="工作以外（学习、社团、兴趣）" action={<span className="text-xs text-faint">照片最多 {MAX_LIFE} 张</span>}>
        <Field label="一段话"><Textarea rows={3} value={f.life.lead} onChange={(e) => set({ life: { ...f.life, lead: e.target.value } })} maxLength={400} placeholder="工作以外，我……" /></Field>
        <ListEditor className="mt-3" label="照片（同一个分组排成一条，可以左右滑）" max={MAX_LIFE} items={f.life.items} onChange={(items) => set({ life: { ...f.life, items } })} blank={{ group: '生活与兴趣', title: '', note: '', image_path: '' }}
          render={(m, upd, i) => (
            <div className="flex flex-1 gap-2">
              <MediaSlot small path={m.image_path} busy={uploading === `life${i}`} accept="image/*" icon={ImagePlus}
                onPick={(file) => { setUploading(`life${i}`); store.uploadCardMedia(file, 'case').then((p) => upd({ ...m, image_path: p })).catch((e) => toast(e.message, 'error')).finally(() => setUploading('')); }}
                onClear={() => upd({ ...m, image_path: '' })} />
              <div className="flex-1 space-y-1">
                <Input value={m.group || ''} onChange={(e) => upd({ ...m, group: e.target.value })} placeholder="分组：例 学习与社团 / 生活与兴趣" maxLength={20} />
                <Input value={m.title} onChange={(e) => upd({ ...m, title: e.target.value })} placeholder="标题：例 潜水 · 停泊岛" maxLength={60} />
                <Input value={m.note} onChange={(e) => upd({ ...m, note: e.target.value })} placeholder="一句话" maxLength={120} />
              </div>
            </div>
          )} />
        <Field className="mt-3" label={`我的兴趣（一行一个，最多 ${MAX_HOBBIES} 个）`} hint="潜水、爬山、露营、志工、看书、动漫会自动配小图示">
          <Textarea rows={3} value={(f.life.hobbies || []).join('\n')} onChange={(e) => set({ life: { ...f.life, hobbies: e.target.value.split('\n').slice(0, MAX_HOBBIES) } })} />
        </Field>
      </Section>

      <Section title="我可以帮你（家具以外的也写）">
        <ListEditor max={MAX_OFFERS} items={f.offers} onChange={(offers) => set({ offers })} blank=""
          render={(o, upd) => <Input value={o} onChange={(e) => upd(e.target.value)} maxLength={120} />} />
      </Section>

      <Section title="作品 / 案例" action={<span className="text-xs text-faint">最多 {MAX_CASES} 个，横着滑</span>}>
        <ListEditor max={MAX_CASES} items={f.cases} onChange={(cases) => set({ cases })} blank={{ title: '', note: '', image_path: '' }}
          render={(c, upd, i) => (
            <div className="flex flex-1 gap-2">
              <MediaSlot small path={c.image_path} busy={uploading === `case${i}`} accept="image/*" icon={ImagePlus}
                onPick={(file) => { setUploading(`case${i}`); store.uploadCardMedia(file, 'case').then((p) => upd({ ...c, image_path: p })).catch((e) => toast(e.message, 'error')).finally(() => setUploading('')); }}
                onClear={() => upd({ ...c, image_path: '' })} />
              <div className="flex-1 space-y-1">
                <Input value={c.title} onChange={(e) => upd({ ...c, title: e.target.value })} placeholder="标题：例 溪岸 · 雾山" maxLength={80} />
                <Input value={c.note} onChange={(e) => upd({ ...c, note: e.target.value })} placeholder="一句话：例 原木 + 灰泥，三房两厅" maxLength={200} />
              </div>
            </div>
          )} />
      </Section>

      <Section title="商会与资源" action={<span className="text-xs text-faint">最多 {MAX_GROUPS} 个</span>}>
        <ListEditor max={MAX_GROUPS} items={f.groups} onChange={(groups) => set({ groups })} blank={{ name: '', role: '', note: '', logo_path: '', links: [] }}
          render={(g, upd, i) => (
            <div className="flex flex-1 gap-2">
              <MediaSlot small path={g.logo_path} busy={uploading === `group${i}`} accept="image/*" icon={ImagePlus}
                onPick={(file) => { setUploading(`group${i}`); store.uploadCardMedia(file, 'case').then((p) => upd({ ...g, logo_path: p })).catch((e) => toast(e.message, 'error')).finally(() => setUploading('')); }}
                onClear={() => upd({ ...g, logo_path: '' })} />
              <div className="flex-1 space-y-1">
                <Input value={g.name} onChange={(e) => upd({ ...g, name: e.target.value })} placeholder="名字：例 PUMM 马来西亚创业促进会" maxLength={80} />
                <Input value={g.role} onChange={(e) => upd({ ...g, role: e.target.value })} placeholder="你的职位：例 彭亨州联委会理事" maxLength={120} />
                <Textarea rows={2} value={g.note} onChange={(e) => upd({ ...g, note: e.target.value })} placeholder="一段介绍：别人可以找你拿什么资源" maxLength={400} />
                {[0, 1].map((k) => {
                  const l = (g.links || [])[k] || { label: '', url: '' };
                  const setL = (patch) => { const links = [...(g.links || [])]; links[k] = { ...l, ...patch }; upd({ ...g, links: links.filter((x) => x && (x.url || x.label) ) }); };
                  return (
                    <div key={k} className="flex gap-2">
                      <Input className="w-36" value={l.label} onChange={(e) => setL({ label: e.target.value })} placeholder={k ? '链接 2 名字' : '链接名字'} maxLength={40} />
                      <Input value={l.url} onChange={(e) => setL({ url: e.target.value })} placeholder="https://…" />
                    </div>
                  );
                })}
              </div>
            </div>
          )} />
      </Section>

      <Section title="我的实体名片（放在名片页最下面）">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((k) => (
            <MediaSlot key={k} label={k ? '第二张' : '第一张'} path={(f.card_images || [])[k] || ''} busy={uploading === `nc${k}`} accept="image/*" icon={ImagePlus}
              onPick={(file) => { setUploading(`nc${k}`); store.uploadCardMedia(file, 'case').then((p) => { const a = [...(f.card_images || [])]; a[k] = p; set({ card_images: a.filter(Boolean) }); }).catch((e) => toast(e.message, 'error')).finally(() => setUploading('')); }}
              onClear={() => { const a = [...(f.card_images || [])]; a[k] = ''; set({ card_images: a.filter(Boolean) }); }} />
          ))}
        </div>
      </Section>

      <Section title="留资料的表格">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.form_on} onChange={(e) => set({ form_on: e.target.checked })} className="h-4 w-4 accent-plum" />
          在名片页显示「留下你的联络方式」
        </label>
        <Field className="mt-3" label="送出后「WhatsApp 我」的预设讯息" hint="{me} = 你的名字、{name} = 他的名字、{where} = 在哪里认识"><Input value={f.greeting} onChange={(e) => set({ greeting: e.target.value })} /></Field>
        <Field className="mt-3" label="要求删除资料找谁（隐私说明会显示）" hint="空白 = 「直接 WhatsApp 我」"><Input value={f.privacy_contact} onChange={(e) => set({ privacy_contact: e.target.value })} placeholder="例：WhatsApp 012-345 6789 或 privacy@…" /></Field>
      </Section>

      {dirty && (
        <div className="sticky bottom-20 z-10 flex items-center justify-end gap-2 rounded-2xl border border-line bg-white/95 p-2 shadow-lg backdrop-blur lg:bottom-3">
          <span className="mr-auto pl-2 text-sm text-muted">还没存</span>
          <Button variant="ghost" onClick={() => setF(store.card)}>放弃修改</Button>
          <Button busy={busy} onClick={save}>存名片</Button>
        </div>
      )}
    </>
  );
}

/** 一个品牌的编辑块（可以收起来） */
function BrandEditor({ b, onChange, onRemove, upload, uploading, idx, onError }) {
  const [open, setOpen] = useState(false);
  const set = (patch) => onChange({ ...b, ...patch });
  const slot = (key, label) => (
    <MediaSlot small label={label} path={b[key]} busy={uploading === `brand${idx}${key}`} accept="image/*" icon={ImagePlus}
      onPick={(file) => upload(file, key).then((p) => set({ [key]: p })).catch(onError)} onClear={() => set({ [key]: '' })} />
  );
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex items-center gap-2">
        <button type="button" className="flex-1 text-left text-sm font-semibold" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} {b.name || '（还没取名字的品牌）'}</button>
        <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-3">{slot('logo_path', 'Logo')}{slot('photo_path', '大照片')}{slot('photo2_path', '第二张')}{slot('awards_photo_path', '奖项照片')}</div>
          <Input value={b.name} onChange={(e) => set({ name: e.target.value })} placeholder="品牌名：例 瑞吉欧 RICCIONE" maxLength={80} />
          <Input value={b.title} onChange={(e) => set({ title: e.target.value })} placeholder="标题：例 更慢、更柔和，也更自然的生活" maxLength={80} />
          <Textarea rows={3} value={b.lead} onChange={(e) => set({ lead: e.target.value })} placeholder="一段介绍（讲事实：年份、地点、做什么）" maxLength={600} />
          <ListEditor label="重点（标题 + 一句）" max={MAX_POINTS} items={b.points} onChange={(points) => set({ points })} blank={{ title: '', note: '' }}
            render={(m, upd) => (<div className="flex flex-1 gap-2"><Input className="w-36" value={m.title} onChange={(e) => upd({ ...m, title: e.target.value })} placeholder="实木家具" maxLength={60} /><Input value={m.note} onChange={(e) => upd({ ...m, note: e.target.value })} placeholder="100% 实木，模块化" maxLength={200} /></div>)} />
          <ListEditor label="数字格子" max={MAX_STATS} items={b.stats} onChange={(stats) => set({ stats })} blank={{ value: '', label: '' }}
            render={(m, upd) => (<div className="flex flex-1 gap-2"><Input className="w-32" value={m.value} onChange={(e) => upd({ ...m, value: e.target.value })} placeholder="2002" maxLength={20} /><Input value={m.label} onChange={(e) => upd({ ...m, label: e.target.value })} placeholder="中国公司成立" maxLength={60} /></div>)} />
          <ListEditor label="奖项" max={MAX_AWARDS} items={b.awards} onChange={(awards) => set({ awards })} blank={{ year: '', title: '', note: '' }}
            render={(m, upd) => (<div className="flex flex-1 gap-2"><Input className="w-20" value={m.year} onChange={(e) => upd({ ...m, year: e.target.value })} placeholder="2021" maxLength={12} /><div className="flex-1 space-y-1"><Input value={m.title} onChange={(e) => upd({ ...m, title: e.target.value })} placeholder="奖名" maxLength={100} /><Input value={m.note} onChange={(e) => upd({ ...m, note: e.target.value })} placeholder="系列 / 说明" maxLength={160} /></div></div>)} />
          <div className="flex gap-2">
            <Input className="w-32" value={b.chips_title} onChange={(e) => set({ chips_title: e.target.value })} placeholder="标签标题" maxLength={30} />
            <Textarea rows={2} value={(b.chips || []).join('\n')} onChange={(e) => set({ chips: e.target.value.split('\n').slice(0, MAX_EXHIBITIONS) })} placeholder={'一行一个：例 CIFF 广州家博会'} />
          </div>
          <ListEditor label="系列（小格子）" max={MAX_SERIES} items={b.series} onChange={(series) => set({ series })} blank={{ title: '', note: '', image_path: '' }}
            render={(m, upd, i) => (<div className="flex flex-1 gap-2">
              <MediaSlot small path={m.image_path} busy={uploading === `brand${idx}s${i}`} accept="image/*" icon={ImagePlus}
                onPick={(file) => upload(file, `s${i}`).then((p) => upd({ ...m, image_path: p })).catch(onError)} onClear={() => upd({ ...m, image_path: '' })} />
              <div className="flex-1 space-y-1"><Input value={m.title} onChange={(e) => upd({ ...m, title: e.target.value })} placeholder="骨骼线" maxLength={40} /><Input value={m.note} onChange={(e) => upd({ ...m, note: e.target.value })} placeholder="一句话" maxLength={80} /></div>
            </div>)} />
          <ListEditor label="发展历程" max={MAX_MILESTONES} items={b.milestones} onChange={(milestones) => set({ milestones })} blank={{ year: '', text: '' }}
            render={(m, upd) => (<div className="flex flex-1 gap-2"><Input className="w-20" value={m.year} onChange={(e) => upd({ ...m, year: e.target.value })} placeholder="2002" maxLength={12} /><Input value={m.text} onChange={(e) => upd({ ...m, text: e.target.value })} placeholder="发生了什么" maxLength={120} /></div>)} />
        </div>
      )}
    </div>
  );
}

function MediaSlot({ label, path, video, busy, accept, icon: Icon, onPick, onClear, small }) {
  const store = useStore();
  const ref = useRef(null);
  const url = path ? store.publicUrl(path) : '';
  return (
    <div className={small ? 'w-20 shrink-0' : ''}>
      {label && <div className="mb-1 text-[13px] font-medium text-muted">{label}</div>}
      <div className={cx('relative overflow-hidden rounded-xl border border-dashed border-line bg-ink/5', small ? 'h-20' : 'aspect-[4/3]')}>
        {url ? (
          video ? <video src={url} muted playsInline loop autoPlay className="h-full w-full object-cover" /> : <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <button type="button" onClick={() => ref.current && ref.current.click()} className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted">
            <Icon className="h-5 w-5" />{busy ? '上传中…' : '选档案'}
          </button>
        )}
        {url && (
          <button type="button" onClick={onClear} aria-label="拿掉" className="absolute right-1 top-1 rounded-full bg-ink/70 p-1 text-white"><X className="h-3 w-3" /></button>
        )}
        <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { onPick(e.target.files && e.target.files[0]); e.target.value = ''; }} />
      </div>
    </div>
  );
}

function ListEditor({ label, items, onChange, render, blank, max, className }) {
  const upd = (i) => (v) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <div className={className}>
      {label && <div className="mb-1 text-[13px] font-medium text-muted">{label}</div>}
      <div className="space-y-2">
        {items.map((it, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex items-start gap-2">
            {render(it, upd(i), i)}
            <button type="button" aria-label="删除" onClick={() => onChange(items.filter((_, j) => j !== i))} className="mt-2 rounded-full p-1 text-faint hover:bg-ink/5 hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {items.length < max && (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => onChange([...items, typeof blank === 'object' ? { ...blank } : blank])}><Plus className="h-4 w-4" />加一个</Button>
      )}
    </div>
  );
}

