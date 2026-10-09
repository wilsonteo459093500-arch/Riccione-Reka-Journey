// 签名节：每个角色一张卡片（姓名 / 日期 / 手写签名）
import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { useUI } from '../ui/UI.jsx';
import SignaturePad from './SignaturePad.jsx';
import { useMediaUrl, forgetMedia } from './media.js';
import { useStore } from '../../lib/store.jsx';
import { todayISO } from '../../lib/format.js';

function SigImage({ id }) {
  const url = useMediaUrl(id, 'full');
  return url ? <img src={url} alt="签名" className="h-full max-h-20 w-auto object-contain" /> : null;
}

export default function SignaturesSection({ section, signatures = {}, onChange, reportId }) {
  const { addSignature, removeMedia } = useStore();
  const { confirm } = useUI();
  const [padFor, setPadFor] = useState(null);

  const set = (roleId, patch) => onChange({ ...signatures, [roleId]: { ...(signatures[roleId] || {}), ...patch } });

  const save = async (blob, w, h) => {
    const role = padFor;
    setPadFor(null);
    const old = signatures[role]?.image;
    const id = await addSignature(reportId, blob, w, h);
    set(role, { image: id, date: signatures[role]?.date || todayISO() });
    if (old) {
      forgetMedia(old);
      removeMedia([old]);
    }
  };

  const clear = async (roleId) => {
    const ok = await confirm({ title: '清除这个签名？', okText: '清除', danger: true });
    if (!ok) return;
    const old = signatures[roleId]?.image;
    set(roleId, { image: null });
    if (old) {
      forgetMedia(old);
      removeMedia([old]);
    }
  };

  const role = section.roles.find((r) => r.id === padFor);

  return (
    <div className="space-y-3">
      {section.declaration && (
        <div className="rounded-xl bg-cream-deep/70 px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
          <div>{section.declaration.zh}</div>
          {section.declaration.en && <div className="mt-1.5 text-[12px] italic text-ink-mute">{section.declaration.en}</div>}
        </div>
      )}
      {section.roles.map((r) => {
        const s = signatures[r.id] || {};
        return (
          <div key={r.id} className="card p-3.5">
            <div className="flex items-baseline gap-2">
              <div className="text-[15px] font-bold text-ink">{r.zh}</div>
              <div className="truncate text-[11px] text-ink-mute">{r.en}</div>
            </div>
            <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
              <input className="input py-2.5" value={s.name || ''} placeholder="姓名" onChange={(e) => set(r.id, { name: e.target.value })} />
              <input type="date" className="input w-[150px] py-2.5" value={s.date || ''} onChange={(e) => set(r.id, { date: e.target.value })} />
            </div>
            {s.image ? (
              <div className="mt-2.5 flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-line">
                <div className="flex h-20 flex-1 items-center">
                  <SigImage id={s.image} />
                </div>
                <div className="flex flex-col gap-1">
                  <button type="button" className="rounded-lg px-2 py-1 text-[13px] font-semibold text-terra active:bg-terra-soft" onClick={() => setPadFor(r.id)}>
                    重签
                  </button>
                  <button type="button" className="rounded-lg px-2 py-1 text-[13px] font-semibold text-ink-mute active:bg-cream-deep" onClick={() => clear(r.id)}>
                    清除
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="mt-2.5 flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-white text-[14px] font-semibold text-ink-mute active:bg-cream"
                onClick={() => setPadFor(r.id)}
              >
                <Icon name="PenLine" size={18} /> 点此手写签名
              </button>
            )}
          </div>
        );
      })}
      <SignaturePad open={!!padFor} title={role ? `${role.zh} 签名` : '签名'} onClose={() => setPadFor(null)} onSave={save} />
    </div>
  );
}
