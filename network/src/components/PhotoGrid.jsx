import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2, UserRound } from 'lucide-react';
import { useStore, stripView } from '../lib/store.jsx';
import { Button, Chip, PrivateImage, Section, Sheet, Spinner, useToast, inputCls, cx } from './ui.jsx';

export default function PhotoGrid({ person }) {
  const store = useStore();
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(0);
  const [openId, setOpenId] = useState(null);

  async function upload(files) {
    const list = [...files];
    setBusy(list.length);
    for (const f of list) {
      try {
        await store.addPhoto([person.id], f, { kind: 'group' });
      } catch (e) {
        toast(`上传失败：${e.message}`, 'error');
      }
      setBusy((n) => n - 1);
    }
  }

  const open = person.photos.find((p) => p.id === openId);

  return (
    <Section
      title={<span>照片 <span className="font-normal text-faint">{person.photos.length}</span></span>}
      action={<Button size="sm" variant="ghost" onClick={() => input.current.click()}><ImagePlus className="h-4 w-4" />加合照</Button>}
    >
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      {busy > 0 && <div className="mb-2"><Spinner label={`上传中…还有 ${busy} 张`} /></div>}
      {person.photos.length === 0 && !busy && <p className="text-sm text-faint">还没有照片。活动合照放这里，下次见面前看一眼就记得。</p>}
      <div className="grid grid-cols-3 gap-2">
        {person.photos.map((ph) => (
          <button key={ph.id} onClick={() => setOpenId(ph.id)} className="relative aspect-square overflow-hidden rounded-xl bg-ink/5">
            <PrivateImage path={ph.path} alt={ph.caption || ''} className="h-full w-full object-cover" />
            {ph.kind === 'card' && <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] text-white">名片</span>}
            {person.avatar_photo_id === ph.id && <span className="absolute right-1 top-1 rounded bg-plum px-1.5 py-0.5 text-[10px] text-white">头像</span>}
          </button>
        ))}
      </div>
      {open && <PhotoViewer photo={open} person={person} onClose={() => setOpenId(null)} />}
    </Section>
  );
}

function PhotoViewer({ photo, person, onClose }) {
  const store = useStore();
  const toast = useToast();
  const [pick, setPick] = useState('');
  const tagged = store.data.photo_people.filter((pp) => pp.photo_id === photo.id)
    .map((pp) => ({ link: pp, person: store.data.people.find((x) => x.id === pp.person_id) }))
    .filter((x) => x.person);
  const others = store.data.people.filter((x) => !tagged.some((t) => t.person.id === x.id)).sort((a, b) => a.name.localeCompare(b.name, 'zh'));

  return (
    <Sheet open onClose={onClose} title={photo.kind === 'card' ? '名片' : '合照'} wide>
      <div className="space-y-3">
        <PrivateImage path={photo.path} className="max-h-[55vh] w-full rounded-xl bg-ink/5 object-contain" />
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-muted">照片里有</div>
          <div className="flex flex-wrap gap-1.5">
            {tagged.map((t) => (
              <Chip key={t.link.id} tone="soft" onRemove={tagged.length > 1 ? () => store.untagPhoto(t.link.id) : undefined}>{t.person.name}</Chip>
            ))}
          </div>
          {photo.kind !== 'card' && others.length > 0 && (
            <div className="mt-2 flex gap-2">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className={cx(inputCls, '!py-2 text-sm')} aria-label="加人到照片">
                <option value="">也在照片里的人…</option>
                {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <Button size="sm" variant="outline" className="!h-auto" disabled={!pick} onClick={async () => { await store.tagPhoto(photo.id, pick); setPick(''); }}>加</Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <Button size="sm" variant="outline" disabled={person.avatar_photo_id === photo.id}
            onClick={() => store.savePerson({ ...stripView(person), avatar_photo_id: photo.id }).then(() => toast('已设成头像'))}>
            <UserRound className="h-4 w-4" />设成 {person.name} 的头像
          </Button>
          <Button size="sm" variant="danger"
            onClick={async () => { if (window.confirm('删掉这张照片？（照片里的每个人都看不到了）')) { await store.deletePhoto(photo); onClose(); } }}>
            <Trash2 className="h-4 w-4" />删照片
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
