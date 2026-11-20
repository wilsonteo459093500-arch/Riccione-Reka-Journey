import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Trash2, Bot, MessageCircle, QrCode, GitMerge } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { waLink, relDay, findDuplicates } from '../lib/logic.js';
import { summarize } from '../lib/burst.js';
import { greeting } from '../lib/salute.js';
import { useBurstItems } from './Burst.jsx';
import { Button, Avatar, Chip, PrivateImage, Section, Sheet, Field, Input, Textarea, useToast } from './ui.jsx';
import { PhonesEditor } from './ScanCard.jsx';

/**
 * 新朋友：别人扫码留的资料（people.pending_review = true）
 * 快速看一眼 → 确认 / 打开补备注 / 删掉（防乱填）
 * 电话 / 邮箱跟已经存过的人一样 → 不会自动改那个人，这里显示「像是 X」，你按「合并」才算
 */
export default function NewFriends({ onBack, onOpen, onCard }) {
  const store = useStore();
  const toast = useToast();
  const list = store.newFriends;
  const [busy, setBusy] = useState('');
  // 体检第 3 阶段：AI 读完先给你核对 { person, card, form }
  const [review, setReview] = useState(null);
  // 活动连拍：还在手机里、还没进来的
  const waiting = summarize(useBurstItems().filter((it) => !it.done));
  // 每个新朋友：像不像已经存过的人（只看手机 / 个人邮箱 / 名字 + 公司；公司总机、info@ 不算）
  const lookalike = useMemo(() => {
    const out = new Map();
    for (const p of list) {
      const others = store.people.filter((x) => x.id !== p.id);
      const hit = findDuplicates({ ...p, company: p.company && p.company.name }, others, store.data.companies).find((d) => d.strong);
      if (hit) out.set(p.id, hit);
    }
    return out;
  }, [list, store.people, store.data.companies]);
  const plain = list.filter((p) => !lookalike.has(p.id));

  async function run(key, fn, msg) {
    setBusy(key);
    try { await fn(); if (msg) toast(msg); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 pb-32 pt-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="返回" className="rounded-full p-2 hover:bg-ink/5"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="flex-1 text-xl font-semibold">新朋友 <span className="text-base font-normal text-faint">{list.length}</span></h1>
        {plain.length > 1 && (
          <Button size="sm" variant="outline" busy={busy === 'all'} onClick={() => run('all', () => store.confirmNew(plain.map((p) => p.id)), lookalike.size ? '确认了；像旧朋友的还留着' : '全部确认了')}>
            <CheckCheck className="h-4 w-4" />{lookalike.size ? `确认其他 ${plain.length} 个` : '全部确认'}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">别人扫你的二维码留的资料、你在活动连拍的名片，已经自动建好、放在「认识」圈。看一眼：对的就确认，乱填的删掉；像旧朋友的，按「合并」。</p>
      {waiting.total > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <span className="flex-1">
            还有 {waiting.total} 张连拍的名片在处理
            {waiting.phone ? `：${waiting.phone} 张在手机等网络（不会丢）` : waiting.saved ? `：AI 在读 ${waiting.saved} 张` : ''}
          </span>
          <Button size="sm" variant="outline" busy={busy === 'sync'} onClick={() => run('sync', () => store.runBurstSync())}>现在同步</Button>
        </div>
      )}

      {!list.length && (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center">
          <QrCode className="mx-auto h-10 w-10 text-faint" />
          <p className="mt-3 font-medium">没有新朋友要确认</p>
          <p className="mt-1 text-sm text-muted">活动上让别人扫你的名片二维码，资料会自动进来。</p>
          <Button variant="accent" className="mt-4" onClick={onCard}><QrCode className="h-4 w-4" />我的名片 / 二维码</Button>
        </div>
      )}

      {list.map((p) => {
        const card = p.photos.find((ph) => ph.id === p.card_photo_id);
        const placeholder = /名片待确认/.test(p.name);
        const wa = waLink(p.whatsapp, greeting(p));
        const scan = p.interactions.find((i) => i.source === 'qr');
        const dup = lookalike.get(p.id);
        return (
          <Section key={p.id}>
            {dup && (
              <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                <p>
                  像是你已经存过的{' '}
                  <button onClick={() => onOpen(dup.person.id)} className="font-semibold underline">{dup.person.name}</button>
                  <span className="text-muted">（{dup.reasons.join('、')}）</span>
                </p>
                <p className="mt-1 text-xs text-muted">没有自动改他的资料。是同一个人就合并：新的电话、邮箱、留言补进去，名字和圈层不动，这张卡删掉。</p>
                <Button size="sm" variant="accent" className="mt-2" busy={busy === `merge${p.id}`}
                  onClick={() => run(`merge${p.id}`, () => store.mergePerson(p.id, dup.person.id), `合并进 ${dup.person.name} 了`)}>
                  <GitMerge className="h-4 w-4" />合并进 {dup.person.name}
                </Button>
              </div>
            )}
            <div className="flex gap-3">
              <Avatar person={p} size={48} />
              <div className="min-w-0 flex-1">
                <button onClick={() => onOpen(p.id)} className="block max-w-full truncate text-left font-semibold hover:underline">{p.name}</button>
                <div className="truncate text-sm text-muted">{[p.title, p.company && p.company.name].filter(Boolean).join(' · ') || '—'}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                  {(p.tags || []).map((t) => <Chip key={t} tone="soft" className="!py-0.5 !text-xs">{t}</Chip>)}
                  <span>{p.how_met}</span>
                  <span className="text-faint">· {relDay(p.created_at)}</span>
                </div>
              </div>
              {card && <PrivateImage path={card.path} className="h-14 w-20 shrink-0 rounded-lg object-cover" />}
            </div>
            <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
              {(p.phones || []).map((ph) => <React.Fragment key={ph.number}><dt className="text-muted">电话</dt><dd>{ph.number}</dd></React.Fragment>)}
              {(p.emails || []).map((e) => <React.Fragment key={e}><dt className="text-muted">邮箱</dt><dd className="truncate">{e}</dd></React.Fragment>)}
              {p.notes && <><dt className="text-muted">留言</dt><dd className="whitespace-pre-line">{p.notes}</dd></>}
              {scan && scan.summary && <><dt className="text-muted">备注</dt><dd>{scan.summary}</dd></>}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" busy={busy === p.id} onClick={() => run(p.id, () => store.confirmNew([p.id]), `${p.name} 确认了`)}><Check className="h-4 w-4" />{dup ? '不是，是新的人' : '确认'}</Button>
              {card && (
                <Button size="sm" variant={placeholder ? 'accent' : 'outline'} busy={busy === `ai${p.id}`} onClick={() => run(`ai${p.id}`, async () => {
                  const { card: read, draft } = await store.readCardWithAI(p.id);
                  setReview({ person: p, card: read, form: formFrom(draft) });
                })}>
                  <Bot className="h-4 w-4" />AI 读名片
                </Button>
              )}
              {wa && <a href={wa} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-medium"><MessageCircle className="h-4 w-4" />WhatsApp</a>}
              <Button size="sm" variant="ghost" onClick={() => onOpen(p.id)}>打开、补备注</Button>
              <Button size="sm" variant="danger" className="ml-auto" busy={busy === `del${p.id}`}
                onClick={() => window.confirm(`删掉「${p.name}」？（乱填的、或不想留）`) && run(`del${p.id}`, () => store.deletePerson(p), '删掉了')}>
                <Trash2 className="h-4 w-4" />删掉
              </Button>
            </div>
          </Section>
        );
      })}

      {review && (
        <CardReview
          review={review}
          onChange={(form) => setReview({ ...review, form })}
          onClose={() => setReview(null)}
          busy={busy === 'review'}
          onSave={() => run('review', async () => {
            await store.saveCardReview(review.person.id, review.card, review.form);
            setReview(null);
          }, '存好了')}
        />
      )}
    </div>
  );
}

/** AI 读出来、补进去之后的样子 → 画面上的表单 */
function formFrom(d) {
  return {
    name: /名片待确认/.test(d.name || '') ? '' : d.name || '',
    name_alt: d.name_alt || '',
    title: d.title || '',
    company: d.company || '',
    phones: (d.phones || []).length ? d.phones.map((p) => ({ label: p.label || 'mobile', number: p.number })) : [{ label: 'mobile', number: '' }],
    emails: (d.emails || []).join('\n'),
    website: d.website || '',
    address: d.address || '',
  };
}

/**
 * AI 读名片 → 先给你核对（体检第 3 阶段）
 * 上面是名片照片，下面是要存的资料（你原本填过的不会被换掉），对着照片改好再按「存进去」。
 * 按「不要」什么都不改（这次读名片的钱已经算进预算，大约 RM0.01）
 */
function CardReview({ review, onChange, onClose, onSave, busy }) {
  const { person, card, form } = review;
  const photo = person.photos.find((ph) => ph.id === person.card_photo_id);
  const set = (k) => (e) => onChange({ ...form, [k]: e.target.value });
  return (
    <Sheet open onClose={onClose} title="AI 读的，对一下再存" wide>
      {photo && <PrivateImage path={photo.path} className="mb-3 max-h-56 w-full rounded-xl bg-ink/5 object-contain" />}
      {card && card.is_business_card === false && (
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">AI 说这张看起来不像名片，请特别看一下。</p>
      )}
      <p className="mb-3 text-sm text-muted">对着上面的照片看：错的直接改，没有的留空。按「存进去」才会改他的资料。</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="名字"><Input value={form.name} onChange={set('name')} placeholder="名片上的名字" /></Field>
        <Field label="另一种写法"><Input value={form.name_alt} onChange={set('name_alt')} placeholder="中文名 / 英文名" /></Field>
        <Field label="职位"><Input value={form.title} onChange={set('title')} /></Field>
        <Field label="公司"><Input value={form.company} onChange={set('company')} /></Field>
      </div>
      <div className="mt-3"><PhonesEditor phones={form.phones} onChange={(phones) => onChange({ ...form, phones })} /></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="邮箱" hint="一行一个"><Textarea rows={2} value={form.emails} onChange={set('emails')} /></Field>
        <Field label="网站"><Input value={form.website} onChange={set('website')} /></Field>
      </div>
      <Field label="地址" className="mt-3"><Textarea rows={2} value={form.address} onChange={set('address')} /></Field>
      <div className="mt-4 flex gap-2">
        <Button variant="accent" className="flex-1" busy={busy} disabled={!form.name.trim()} onClick={onSave}><Check className="h-4 w-4" />存进去</Button>
        <Button variant="ghost" onClick={onClose}>不要</Button>
      </div>
      {!form.name.trim() && <p className="mt-2 text-xs text-faint">名字要填才能存</p>}
    </Sheet>
  );
}
