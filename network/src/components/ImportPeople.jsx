import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Contact, FileText, Table2, MessageCircle, Check, ChevronDown, ChevronRight, Search, Users, ShieldCheck, Sun,
} from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import {
  parseVCard, parseCSV, csvToContacts, groupMembers, membersToContacts, pickerSupported, pickerToContacts,
  prepareCandidates, filterCandidates, staggerDue, toPersonRow, prettyPhone, STAGGER_DAYS, MAX_IMPORT,
} from '../lib/importer.js';
import { splitTags } from '../lib/logic.js';
import { Button, Chip, useToast, inputCls, cx } from './ui.jsx';

/**
 * 体检第 4 阶段：把现有人脉搬进来
 *   ① 选来源（手机通讯录 / .vcf / CSV / WhatsApp 群）→ ② 清单打勾 → ③ 加入
 * 全部在手机里读，不用 AI、不花钱；档案不会上传。
 */
const SOURCES = [
  {
    key: 'contacts', icon: Contact, title: '从手机通讯录挑', sub: 'Android 用 Chrome 打开 SPACE 才有；直接打开通讯录，一次勾很多人',
  },
  {
    key: 'vcf', icon: FileText, title: '通讯录档案（.vcf）', sub: '整本通讯录汇出成一个档案，再在这里打开',
    how: [
      'Android「通讯录」app → 右上角 ⋮ 或「管理通讯录」→「汇出」→ 存成 .vcf',
      'Google 通讯录（contacts.google.com）→「汇出」→ 选「vCard」',
      'iPhone「联络人」→ 左上角「列表」→ 长按「所有联络人」→「汇出」',
    ],
  },
  {
    key: 'csv', icon: Table2, title: '表格（CSV）', sub: 'Google 通讯录、Outlook，或你自己的 Excel 名单',
    how: [
      'Google 通讯录 → 「汇出」→ 选「Google CSV」',
      'Excel：第一行写栏位名（姓名、公司、职位、手机、邮箱、备注、标签）→「另存新档」→ 选 CSV UTF-8',
    ],
  },
  {
    key: 'whatsapp', icon: MessageCircle, title: 'WhatsApp 群', sub: '汇出群聊记录：发过言的人、被加进群 / 用链接进群的人都找得到',
    how: [
      '打开群 → 右上角 ⋮ →「更多」→「汇出聊天」→ 选「不附媒体」',
      '存到手机（或传给自己），再在这里打开那个 .txt（iPhone 是 .zip，也可以）',
      '从来没发过言、也不是在聊天记录里进群的人找不到：用通讯录补',
    ],
  },
];
const SOURCE_NAME = { contacts: '手机通讯录', vcf: '通讯录档案', csv: '表格', whatsapp: 'WhatsApp 群' };
const PAGE = 120;

/** 读文字档：UTF-8 读不出来（Excel 存的中文 CSV 常常是 GBK / UTF-16）就换一种 */
async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  for (const enc of ['gbk', 'big5']) {
    try { const t = new TextDecoder(enc).decode(buf); if (!t.includes('�')) return t; } catch { /* 这个浏览器没有这种编码 */ }
  }
  return utf8;
}
async function readWhatsAppFile(file) {
  if (/\.zip$/i.test(file.name) || /zip/.test(file.type)) {
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /\.txt$/i.test(f.name) });
    const key = Object.keys(files).find((k) => /_chat\.txt$/i.test(k)) || Object.keys(files)[0];
    if (!key) throw new Error('zip 里找不到聊天记录的 .txt');
    return strFromU8(files[key]);
  }
  return readText(file);
}

export default function ImportPeople({ onBack, onOpenList }) {
  const store = useStore();
  const toast = useToast();
  const fileRef = useRef(null);
  const [source, setSource] = useState(null);     // 正在选档案的来源
  const [batch, setBatch] = useState(null);       // { source, group, list: candidates }
  const [edits, setEdits] = useState({});         // key → { checked, salutation, name }
  const [q, setQ] = useState('');
  const [mobileOnly, setMobileOnly] = useState(false);
  const [showExisting, setShowExisting] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [tags, setTags] = useState('');
  const [howMet, setHowMet] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(null);
  const [open, setOpen] = useState('');           // 展开哪个来源的步骤

  const meNames = [store.me && store.me.display_name, store.card && store.card.name].filter(Boolean); // 自己不用导入

  function load(src, contacts, group = '') {
    if (!contacts.length) throw new Error(src === 'whatsapp' ? '这份聊天记录里找不到群成员。是「汇出聊天」的档案吗？' : '这个档案里读不到联系人');
    const list = prepareCandidates(contacts, { people: store.data.people, companies: store.data.companies, source: src });
    setBatch({ source: src, group, list, total: contacts.length });
    setEdits({});
    setQ(''); setLimit(PAGE); setShowExisting(false);
    setMobileOnly(src !== 'whatsapp' && list.filter((c) => c.whatsapp).length >= 20); // 通讯录很多人时，先只看有手机号的
    setTags(group || '');
    setHowMet(src === 'whatsapp' ? `WhatsApp 群${group ? `：${group}` : ''}` : '');
    setDone(null);
    if (contacts.length > MAX_IMPORT) toast(`档案有 ${contacts.length} 人，先读前 ${MAX_IMPORT} 个`, 'error');
  }

  async function pick(src) {
    if (src === 'contacts') {
      try {
        const res = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true });
        if (res && res.length) load('contacts', pickerToContacts(res));
      } catch (e) { toast(e.message || '打不开通讯录', 'error'); }
      return;
    }
    setSource(src);
    fileRef.current.accept = src === 'vcf' ? '.vcf,text/vcard,text/x-vcard' : src === 'csv' ? '.csv,text/csv,text/plain' : '.txt,.zip,text/plain,application/zip';
    fileRef.current.click();
  }

  async function onFile(file) {
    setBusy('read');
    try {
      if (source === 'vcf') load('vcf', parseVCard(await readText(file)));
      else if (source === 'csv') load('csv', csvToContacts(parseCSV(await readText(file))));
      else {
        const { group, members } = groupMembers(await readWhatsAppFile(file), file.name, { meNames });
        load('whatsapp', membersToContacts(members, group), group);
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally { setBusy(''); }
  }

  const list = batch ? batch.list : [];
  const val = (c) => ({ checked: c.checked, salutation: c.salutation, name: c.name, ...(edits[c.key] || {}) });
  const set = (key, patch) => setEdits((e) => ({ ...e, [key]: { ...(e[key] || {}), ...patch } }));
  const shown = useMemo(() => filterCandidates(list, { q, mobileOnly, hideExisting: !showExisting }), [list, q, mobileOnly, showExisting]);
  const chosen = list.filter((c) => !c.existing && val(c).checked);
  const existingCount = list.filter((c) => c.existing).length;
  const perDay = Math.max(1, Math.ceil(chosen.length / STAGGER_DAYS));

  function setAll(on) {
    setEdits((e) => {
      const next = { ...e };
      for (const c of shown) if (!c.existing) next[c.key] = { ...(next[c.key] || {}), checked: on };
      return next;
    });
  }

  async function save() {
    if (!chosen.length) return;
    setBusy('save');
    setProgress({ done: 0, total: chosen.length });
    try {
      const dues = staggerDue(chosen.length, store.data.people.filter((p) => p.first_due).map((p) => p.first_due));
      const extra = splitTags(tags);
      const rows = chosen.map((c, i) => {
        const v = val(c);
        return { ...toPersonRow({ ...c, name: v.name, salutation: v.salutation }, { source: batch.source, tags: extra, howMet, firstDue: dues[i] }), company: c.company };
      });
      const n = await store.importPeople(rows, (d, total) => setProgress({ done: d, total }));
      setDone({ count: n, source: batch.source });
      setBatch(null);
    } catch (e) {
      toast(e.message, 'error');
      // 已经存进去的人：重新整理清单，变成「已在 SPACE」
      if (batch) setBatch((b) => b && { ...b, list: prepareCandidates(b.list.map((c) => ({ ...c, ...val(c) })), { people: store.data.people, companies: store.data.companies, source: b.source }) });
    } finally { setBusy(''); setProgress(null); }
  }

  /* ---------- ③ 做完 ---------- */
  if (done) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 pb-24 pt-6">
        <div className="rounded-2xl border border-line bg-white p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-plum/10 text-plum-deep"><Check className="h-6 w-6" /></span>
          <h1 className="mt-3 text-xl font-semibold">加入了 {done.count} 人</h1>
          <p className="mt-2 text-sm text-muted">
            都放在「认识」圈。第一次提醒分散在之后 4 个月，「今日」每天只会多一两个人，不会一下子全跳出来。
            重要的人在人物页升圈层，就会提早提醒。
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={onOpenList}><Users className="h-4 w-4" />去人脉看看</Button>
            <Button variant="outline" onClick={() => setDone(null)}>再导入一份</Button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- ① 选来源 ---------- */
  if (!batch) {
    return (
      <div className="mx-auto max-w-xl space-y-3 px-4 pb-24 pt-4">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="返回" className="rounded-full p-2 hover:bg-ink/5"><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="flex-1 text-xl font-semibold">导入现有人脉</h1>
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-plum/5 p-3 text-sm text-plum-deep">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>档案只在这部手机里读，不会上传、不用 AI、不花钱。读完先给你一份清单，<b>你勾了的人才会进来</b>。</span>
        </p>
        {SOURCES.filter((s) => s.key !== 'contacts' || pickerSupported()).map((s) => (
          <div key={s.key} className="rounded-2xl border border-line bg-white">
            <button onClick={() => pick(s.key)} disabled={!!busy} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/5"><s.icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.title}</span>
                <span className="block text-[13px] text-muted">{s.sub}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-faint" />
            </button>
            {s.how && (
              <div className="border-t border-line px-4 py-2">
                <button onClick={() => setOpen(open === s.key ? '' : s.key)} className="flex min-h-[36px] items-center gap-1 text-[13px] text-muted">
                  <ChevronDown className={cx('h-4 w-4 transition-transform', open === s.key && 'rotate-180')} />怎么拿到这个档案
                </button>
                {open === s.key && (
                  <ol className="mb-2 ml-5 list-decimal space-y-1 text-[13px] text-muted">
                    {s.how.map((h) => <li key={h}>{h}</li>)}
                  </ol>
                )}
              </div>
            )}
          </div>
        ))}
        {!pickerSupported() && (
          <p className="text-xs text-faint">「从手机通讯录挑」只有 Android 的 Chrome 才有；用别的浏览器时，请用 .vcf 档案。</p>
        )}
        {busy === 'read' && <p className="text-center text-sm text-muted">读档中…</p>}
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; }} />
      </div>
    );
  }

  /* ---------- ② 清单打勾 ---------- */
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto w-full max-w-2xl space-y-2 px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setBatch(null)} aria-label="返回" className="rounded-full p-2 hover:bg-ink/5"><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {batch.source === 'whatsapp' && batch.group ? batch.group : `从${SOURCE_NAME[batch.source]}导入`}
            <span className="ml-1 text-sm font-normal text-faint">{list.length} 人</span>
          </h1>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="搜名字、公司、电话"
            className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-[15px] outline-none focus:border-ink/40" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <Toggle on={mobileOnly} onClick={() => { setMobileOnly(!mobileOnly); setLimit(PAGE); }}>只看有手机号</Toggle>
          {existingCount > 0 && <Toggle on={showExisting} onClick={() => setShowExisting(!showExisting)}>显示已在 SPACE 的 {existingCount} 人</Toggle>}
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted">已勾 <b className="text-ink">{chosen.length}</b> 人</span>
          <span>
          <button className="min-h-[36px] px-1 text-muted underline-offset-2 hover:underline" onClick={() => setAll(true)}>全选这 {shown.filter((c) => !c.existing).length} 人</button>
          <button className="min-h-[36px] px-1 text-muted underline-offset-2 hover:underline" onClick={() => setAll(false)}>全不选</button>
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="mx-auto max-w-2xl divide-y divide-line border-y border-line bg-white">
          {shown.slice(0, limit).map((c) => {
            const v = val(c);
            return (
              <li key={c.key} className={cx('flex gap-3 px-4 py-2.5', c.existing && 'opacity-50')}>
                <label className="flex min-h-[44px] min-w-[32px] cursor-pointer items-start pt-1">
                  <input type="checkbox" className="h-5 w-5 accent-[#22A55B]" disabled={!!c.existing} checked={!c.existing && !!v.checked}
                    onChange={(e) => set(c.key, { checked: e.target.checked })} aria-label={`选 ${v.name || c.whatsapp}`} />
                </label>
                <div className="min-w-0 flex-1">
                  {c.name ? (
                    <div className="truncate font-medium" onClick={() => !c.existing && set(c.key, { checked: !v.checked })}>{c.name}</div>
                  ) : (
                    <input value={v.name} onChange={(e) => set(c.key, { name: e.target.value, salutation: '', checked: true })} placeholder="没存名字：写上名字（可以不写）"
                      className="w-full rounded-lg border border-line px-2 py-1 text-[15px] outline-none focus:border-ink/40" />
                  )}
                  <div className="truncate text-[13px] text-muted">
                    {[c.title, c.company].filter(Boolean).join(' · ')}
                    {(c.title || c.company) && (c.whatsapp || c.phones[0]) ? ' · ' : ''}
                    {c.whatsapp ? prettyPhone(c.whatsapp) : c.phones[0] ? c.phones[0].number : c.emails[0] || ''}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {c.existing && <Chip tone="soft">已在 SPACE：{c.existing.name}</Chip>}
                    {c.maybe && <Chip tone="needs">像 {c.maybe.name}（{c.maybe.reasons[0]}）</Chip>}
                    {c.groupInfo && c.groupInfo.left && <Chip tone="needs">已退群</Chip>}
                    {c.groupInfo && c.groupInfo.count > 0 && <Chip tone="soft">发言 {c.groupInfo.count} 次</Chip>}
                    {!c.whatsapp && !c.existing && c.phones.length > 0 && <Chip tone="soft">没有手机号（WhatsApp 打不开）</Chip>}
                    {!c.existing && v.checked && (v.name || c.name) && (
                      <label className="flex min-w-0 flex-1 basis-48 items-center gap-1 text-[13px] text-muted">
                        <span className="shrink-0">称呼</span>
                        <input value={v.salutation} onChange={(e) => set(c.key, { salutation: e.target.value })}
                          className="w-full min-w-0 max-w-[16rem] rounded-lg border border-line px-2 py-1 text-[13px] text-ink outline-none focus:border-ink/40" aria-label="称呼" />
                      </label>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {shown.length > limit && (
          <div className="py-3 text-center"><Button variant="outline" size="sm" onClick={() => setLimit(limit + PAGE)}>再显示 {Math.min(PAGE, shown.length - limit)} 人（还有 {shown.length - limit}）</Button></div>
        )}
        {!shown.length && <p className="py-10 text-center text-sm text-muted">没有符合的人</p>}
        <div className="h-48" />
      </div>

      <div className="border-t border-line bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="一起加标签（例：JCI、商会）" className={cx(inputCls, 'py-2 text-sm')} aria-label="标签" />
            <input value={howMet} onChange={(e) => setHowMet(e.target.value)} placeholder="在哪认识（可以不写）" className={cx(inputCls, 'py-2 text-sm')} aria-label="在哪认识" />
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Sun className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {chosen.length
              ? `放进「认识」圈；第一次提醒分散在之后 4 个月，「今日」每天约多 ${perDay} 人`
              : '勾选要放进 SPACE 的人'}
          </p>
          <Button variant="accent" className="w-full" busy={busy === 'save'} disabled={!chosen.length} onClick={save}>
            {progress ? `存进去… ${progress.done} / ${progress.total}` : `加入 ${chosen.length} 人`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }) {
  return (
    <button onClick={onClick} className={cx('min-h-[36px] rounded-full border px-3', on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink')}>
      {children}
    </button>
  );
}
