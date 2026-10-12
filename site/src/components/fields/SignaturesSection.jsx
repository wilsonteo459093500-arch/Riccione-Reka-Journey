// 签名节：每个角色一张卡片（姓名 / 日期 / 手写签名）
import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { useUI } from '../ui/UI.jsx';
import SignaturePad from './SignaturePad.jsx';
import { useMediaUrl, forgetMedia } from './media.js';
import { useStore } from '../../lib/store.jsx';
import { todayISO } from '../../lib/format.js';
import { t, uiLabel } from '../../lib/i18n.js';

// 签名板标题：中文照旧「客户签名 签名」；英文角色名里已有 Signature 就不再重复
function padTitle(role) {
  if (!role) return t('签名', 'Signature');
  const en = role.enOnly || role.en || role.zh || '';
  return t(`${role.zh} 签名`, /signature/i.test(en) ? en : `${en} · Signature`);
}

function SigImage({ id }) {
  const url = useMediaUrl(id, 'full');
  return url ? <img src={url} alt={t('签名', 'Signature')} className="h-full max-h-20 w-auto object-contain" /> : null;
}

export default function SignaturesSection({ section, signatures = {}, onChange, reportId }) {
  const { addSignature, removeMedia } = useStore();
  const { confirm } = useUI();
  const [padFor, setPadFor] = useState(null);

  // 基于最新签名数据合并（签名图入库是异步的）
  const set = (roleId, patch) =>
    onChange((prev) => {
      const cur = prev[roleId] || {};
      return { ...prev, [roleId]: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } };
    });

  const save = async (blob, w, h) => {
    const role = padFor;
    setPadFor(null);
    const old = signatures[role]?.image;
    const id = await addSignature(reportId, blob, w, h);
    set(role, (cur) => ({ image: id, date: cur.date || todayISO() }));
    if (old) {
      forgetMedia(old);
      removeMedia([old]);
    }
  };

  const clear = async (roleId) => {
    const ok = await confirm({ title: t('清除这个签名？', 'Clear this signature?'), okText: t('清除', 'Clear'), danger: true });
    if (!ok) return;
    const old = signatures[roleId]?.image;
    set(roleId, { image: null });
    if (old) {
      forgetMedia(old);
      removeMedia([old]);
    }
  };

  const role = section.roles.find((r) => r.id === padFor);
  const decl = section.declaration ? uiLabel(section.declaration) : null;

  return (
    <div className="space-y-3">
      {decl?.primary && (
        <div className="rounded-xl bg-cream-deep/70 px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
          <div>{decl.primary}</div>
          {decl.secondary && <div className="mt-1.5 text-[12px] italic text-ink-mute">{decl.secondary}</div>}
        </div>
      )}
      {section.roles.map((r) => {
        const s = signatures[r.id] || {};
        const name = uiLabel(r);
        return (
          <div key={r.id} className="card p-3.5">
            <div className="flex items-baseline gap-2">
              <div className="text-[15px] font-bold text-ink">{name.primary}</div>
              {name.secondary && <div className="truncate text-[11px] text-ink-mute">{name.secondary}</div>}
            </div>
            <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
              <input className="input py-2.5" value={s.name || ''} placeholder={t('姓名', 'Name')} onChange={(e) => set(r.id, { name: e.target.value })} />
              <input type="date" className="input w-[150px] py-2.5" value={s.date || ''} onChange={(e) => set(r.id, { date: e.target.value })} />
            </div>
            {s.image ? (
              <div className="mt-2.5 flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-line">
                <div className="flex h-20 flex-1 items-center">
                  <SigImage id={s.image} />
                </div>
                <div className="flex flex-col gap-1">
                  <button type="button" className="rounded-lg px-2 py-1 text-[13px] font-semibold text-terra active:bg-terra-soft" onClick={() => setPadFor(r.id)}>
                    {t('重签', 'Redo')}
                  </button>
                  <button type="button" className="rounded-lg px-2 py-1 text-[13px] font-semibold text-ink-mute active:bg-cream-deep" onClick={() => clear(r.id)}>
                    {t('清除', 'Clear')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="mt-2.5 flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-white text-[14px] font-semibold text-ink-mute active:bg-cream"
                onClick={() => setPadFor(r.id)}
              >
                <Icon name="PenLine" size={18} /> {t('点此手写签名', 'Tap to sign')}
              </button>
            )}
          </div>
        );
      })}
      <SignaturePad open={!!padFor} title={padTitle(role)} onClose={() => setPadFor(null)} onSave={save} />
    </div>
  );
}
