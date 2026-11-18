import React, { useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Trash2, Bot, MessageCircle, QrCode } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { waLink, relDay } from '../lib/logic.js';
import { Button, Avatar, Chip, PrivateImage, Section, useToast } from './ui.jsx';

/**
 * 新朋友：别人扫码留的资料（people.pending_review = true）
 * 快速看一眼 → 确认 / 打开补备注 / 删掉（防乱填）
 */
export default function NewFriends({ onBack, onOpen, onCard }) {
  const store = useStore();
  const toast = useToast();
  const list = store.newFriends;
  const [busy, setBusy] = useState('');

  async function run(key, fn, msg) {
    setBusy(key);
    try { await fn(); if (msg) toast(msg); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 pb-32 pt-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="返回" className="rounded-full p-2 hover:bg-ink/5"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="flex-1 text-xl font-semibold">新朋友 <span className="text-base font-normal text-faint">{list.length}</span></h1>
        {list.length > 1 && (
          <Button size="sm" variant="outline" busy={busy === 'all'} onClick={() => run('all', () => store.confirmNew(list.map((p) => p.id)), '全部确认了')}>
            <CheckCheck className="h-4 w-4" />全部确认
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">别人扫你的二维码留的资料，已经自动建好、放在「认识」圈。看一眼：对的就确认，乱填的删掉。</p>

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
        const wa = waLink(p.whatsapp, `Hi ${String(p.name).split(/\s+/)[0]}，`);
        const scan = p.interactions.find((i) => i.source === 'qr');
        return (
          <Section key={p.id}>
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
              <Button size="sm" busy={busy === p.id} onClick={() => run(p.id, () => store.confirmNew([p.id]), `${p.name} 确认了`)}><Check className="h-4 w-4" />确认</Button>
              {card && (
                <Button size="sm" variant={placeholder ? 'accent' : 'outline'} busy={busy === `ai${p.id}`} onClick={() => run(`ai${p.id}`, () => store.readCardWithAI(p.id), 'AI 读好了，看一下对不对')}>
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
    </div>
  );
}
