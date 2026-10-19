// 最后一步（业主 2026-10-19）：客人在 3D 里看过自己的家之后 —— 称呼（昵称也可以）+ WhatsApp 号码 + PDPA 同意 →
// 两个动作「预约免费量房」·「把我的家发到 WhatsApp」→ 员工接手。
//   · 只在许愿模式（展厅 iPad）的外壳里出现（WishShell 懒载入这一份）：名单只存在这台 iPad（home.js 的 saveLead，
//     localStorage 'genie.leads.v1'），员工区「客人名单」看得到、一按导出 CSV（Excel 打得开，UTF-8 带 BOM）。
//   · 「把我的家发到 WhatsApp」：许愿模式里客人不离开展厅的 iPad（不开 WhatsApp）—— 员工在名单上按一下发给他（LeadsPanel）。
//   · 预算从来不在这里出现（只在员工的名单 / CSV 里）。
//   · 潘吉：打开时 lead.enter，留好了 lead.thanks（voice-lines.js，固定的话，不念客人的名字）。
// 另外导出 LeadsPanel：员工区里的名单（客人看不到那里）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Ruler, MessageCircle, Check, ChevronLeft, Download, Trash2 } from 'lucide-react';
import Pangie from '../../shared/Pangie.jsx';
import fx from '../../shared/fx.js';
import { sfx } from '../../shared/sfx.js';
import { voice, lineText } from '../../shared/voice.js';
import { t } from '../../shared/i18n.js';
import { lifeLabel } from '../../shared/summary.js';
import { unpackJSON, findInArchive } from '../../shared/profile.js';
import { makeLead, saveLead, listLeads, clearLeads, leadsCSV, leadsFileName, leadFields, normalizePhone, phoneText, intentsOf, intentText, NAME_MAX, packForStudio, homeLine } from '../../shared/home.js';
import './lead.css';

/**
 * 3D 页里的这一位客人：studio.html?…#p=<档案> 还在网址上就用它；3D 读完会把 #p= 拿掉 → 用外壳记下的档案号
 * （「生成我的家」/ 蓝图「在 3D 里看见」时子页面发的 {type:'home-done', id}）。本机存档里有就用存档那一份（最完整）。
 */
export async function guestFromStudio(win, fallbackId = null) {
  try {
    const u = new URL(win.location.href);
    if (!/studio/.test(u.pathname)) return null;
    const m = /(?:^|[#&])p=([^&]+)/.exec(u.hash.slice(1));
    const p = m ? await unpackJSON(m[1]).catch(() => null) : null;
    if (p?.id) return findInArchive(p.id) || p;
    return fallbackId ? findInArchive(fallbackId) : null;
  } catch {
    return null;
  }
}

/** 客人自己的家（给员工发到客人 WhatsApp 的链接）：普通的 3D 链接，不带许愿模式 / 员工身份，档案里本来就没有预算 */
export async function homeLinkFor(profile, origin = location.href) {
  try {
    const { packed } = await packForStudio(profile);
    const q = new URLSearchParams({ from: 'home' });
    if (profile.caseId) q.set('case', profile.caseId);
    return new URL(`studio.html?${q.toString()}#p=${packed}`, origin).href;
  } catch {
    return '';
  }
}

/** 这一位客人在这台 iPad 上已经留过的那一条（回到 3D 时「交给设计师」直接是 ✓） */
export const leadFor = (profileId) => (profileId ? listLeads().find((l) => l.profileId === profileId) || null : null);

const OTHER = { measure: 'whatsapp', whatsapp: 'measure' };

export default function LeadSheet({ profile, link = '', done = null, onSaved, onClose }) {
  const [lead, setLead] = useState(done);
  const [phase, setPhase] = useState(done ? 'thanks' : 'form');
  const [name, setName] = useState(() => String(done?.name || profile?.name || '').slice(0, NAME_MAX));
  const [phone, setPhone] = useState(() => (done ? phoneText(done.phone) : ''));
  const [ok, setOk] = useState(!!done);
  const [err, setErr] = useState('');
  const [closing, setClosing] = useState(false);
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const okRef = useRef(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    if (phase === 'form') voice.say('lead.enter', { delay: 500 });
    return () => voice.stopIf('lead.enter');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = () => {
    if (closing) return;
    setClosing(true);
    voice.stopIf('lead.enter');
    setTimeout(() => onClose?.(), fx.motion.reduced ? 0 : 200);
  };

  const fail = (what, el) => {
    setErr(what);
    sfx.play('error');
    if (el) fx.nope(el);
    if (what !== 'consent') el?.querySelector?.('input')?.focus({ preventScroll: true });
  };

  const submit = (intent, e) => {
    const nm = name.trim().slice(0, NAME_MAX);
    const ph = normalizePhone(phone);
    // 照表格的顺序检查（称呼 → 号码 → PDPA），第一个不对的那一格拿到焦点；号码空着 ≠ 号码不对
    if (!nm) return fail('name', nameRef.current);
    if (!phone.trim()) return fail('phoneEmpty', phoneRef.current);
    if (!ph) return fail('phone', phoneRef.current);
    if (!ok) return fail('consent', okRef.current);
    const l = saveLead(makeLead({ profile, name: nm, phone: ph, consent: true, intent, link }));
    if (!l) return fail('phone', phoneRef.current);
    setErr('');
    if (e?.currentTarget) fx.scan(e.currentTarget, { sound: null });
    sfx.play('achievement');
    setLead(l);
    onSaved?.(l);
    const swap = () => {
      setPhase('thanks');
      voice.say('lead.thanks', { mode: 'interrupt', delay: 250 });
    };
    if (fx.motion.reduced || !sheetRef.current) swap();
    else fx.clock.after(260, swap);
  };

  const also = (e) => {
    const other = OTHER[intentsOf(lead)[0]] || 'whatsapp';
    const l = saveLead(makeLead({ profile, name: lead.name, phone: lead.phone, consent: true, intent: other, link }));
    if (!l) return;
    if (e?.currentTarget) fx.scan(e.currentTarget, { sound: null });
    sfx.play('confirm');
    setLead(l);
    onSaved?.(l);
  };

  const intents = intentsOf(lead);
  const missing = INTENT_ORDER.find((v) => !intents.includes(v));

  return (
    <div className={`hj-ld-veil ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={t('交给我们的设计师')} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`hj-ld-sheet is-${phase}`} ref={sheetRef}>
        <button type="button" className="hj-ld-x" onClick={close} aria-label={t('关闭')} data-sfx="close">
          <X size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        {phase === 'form' ? (
          <form
            className="hj-ld-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit('measure');
            }}
          >
            <header className="hj-ld-head">
              <Pangie mood="happy" prop="ball" size={76} float={false} speaker />
              <div>
                <p className="hj-ld-eyebrow">{t('喜欢这个家吗？')}</p>
                <h2>{t('交给我们的设计师')}</h2>
                <p className="hj-ld-lead">{t('留下称呼和 WhatsApp，设计师会照着这个 3D 继续帮你设计。')}</p>
              </div>
            </header>
            <label className={`hj-ld-field ${err === 'name' ? 'is-err' : ''}`} ref={nameRef}>
              <span>{t('怎么称呼你？')}</span>
              <input
                type="text"
                value={name}
                maxLength={NAME_MAX}
                autoComplete="nickname"
                enterKeyHint="next"
                placeholder={t('昵称也可以')}
                onChange={(e) => {
                  setName(e.target.value);
                  if (err === 'name') setErr('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), phoneRef.current?.querySelector('input')?.focus())}
              />
            </label>
            <label className={`hj-ld-field ${err === 'phone' || err === 'phoneEmpty' ? 'is-err' : ''}`} ref={phoneRef}>
              <span>{t('WhatsApp 号码')}</span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                maxLength={20}
                autoComplete="tel"
                enterKeyHint="done"
                placeholder="012-345 6789"
                onChange={(e) => {
                  setPhone(e.target.value.replace(/[^\d+\-\s()]/g, ''));
                  if (err === 'phone' || err === 'phoneEmpty') setErr('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
              />
            </label>
            <button
              type="button"
              role="checkbox"
              aria-checked={ok}
              ref={okRef}
              className={`hj-ld-pdpa ${ok ? 'on' : ''} ${err === 'consent' ? 'is-err' : ''}`}
              onClick={() => {
                setOk(!ok);
                if (err === 'consent') setErr('');
              }}
              data-sfx={ok ? 'toggleOff' : 'toggleOn'}
            >
              <i aria-hidden="true">{ok && <Check size={14} strokeWidth={3} />}</i>
              <span>
                {t('我同意 RICCIONE REKA 保存我的称呼和 WhatsApp 号码，只用来联系我、为我设计（个人资料保护法 PDPA）。')}
                <small>{t('只存在展厅这台 iPad 上，不会公开。')}</small>
              </span>
            </button>
            <p className="hj-ld-err" role="status">
              {err === 'name' ? t('先告诉我怎么称呼你') : err === 'phoneEmpty' ? t('先留一个 WhatsApp 号码，设计师才能联系你') : err === 'phone' ? t('这个号码好像不太对，再看一下？') : err === 'consent' ? t('请先勾选同意，我们才能联系你') : ''}
            </p>
            <div className="hj-ld-acts">
              <button type="button" className="hj-ld-btn is-gold" onClick={(e) => submit('measure', e)} data-sfx="none">
                <Ruler size={18} strokeWidth={1.9} aria-hidden="true" />
                <span>{t('预约免费量房')}</span>
              </button>
              <button type="button" className="hj-ld-btn is-line" onClick={(e) => submit('whatsapp', e)} data-sfx="none">
                <MessageCircle size={18} strokeWidth={1.9} aria-hidden="true" />
                <span>{t('把我的家发到 WhatsApp')}</span>
              </button>
            </div>
            <p className="hj-ld-fine">{t('先不用也没关系 —— 员工随时可以帮你。')}</p>
          </form>
        ) : (
          <div className="hj-ld-thanks">
            <Pangie mood="happy" prop="ball" size={104} float={false} speaker aura />
            <p className="hj-ld-eyebrow">{t('交给我们的设计师')}</p>
            <h2>{t('收到了，{0}！', [lead?.name || ''])}</h2>
            <p className="hj-ld-say">{lineText('lead.thanks')}</p>
            <ul className="hj-ld-done">
              {intents.map((v) => (
                <li key={v}>
                  <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                  <span>{v === 'measure' ? t('设计师会在 WhatsApp 上联系你，约时间上门免费量房。') : t('我们会把你的家发到 {0}。', [phoneText(lead?.phone)])}</span>
                </li>
              ))}
            </ul>
            <div className="hj-ld-acts">
              <button type="button" className="hj-ld-btn is-gold" onClick={close} data-sfx="confirm">
                <span>{t('继续看我的家')}</span>
              </button>
              {missing && (
                <button type="button" className="hj-ld-btn is-line" onClick={also} data-sfx="none">
                  {missing === 'measure' ? <Ruler size={18} strokeWidth={1.9} aria-hidden="true" /> : <MessageCircle size={18} strokeWidth={1.9} aria-hidden="true" />}
                  <span>{missing === 'measure' ? t('也预约免费量房') : t('也把我的家发到 WhatsApp')}</span>
                </button>
              )}
            </div>
            <p className="hj-ld-fine">{t('接下来，我们的员工会陪你看看。')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
const INTENT_ORDER = ['measure', 'whatsapp'];

/** 员工给客人发 WhatsApp 的那一句（客人自己的家的链接；没有预算） */
export function leadWaLink(lead) {
  const to = String(lead?.phone || '').replace(/\D+/g, '');
  const msg = lead?.link
    ? t('你好 {0}！这是你在 SAIL BY RICCIONE REKA 展厅许愿出来的家：{1}', [lead.name || '', lead.link])
    : t('你好 {0}！谢谢你来 SAIL BY RICCIONE REKA 展厅许愿。', [lead?.name || '']);
  return `https://wa.me/${to}?text=${encodeURIComponent(msg)}`;
}

/** 员工区：客人名单（这台 iPad）—— 一按导出 CSV；清空要按两下 */
export function LeadsPanel({ onBack, onPoke }) {
  const [leads, setLeads] = useState(() => listLeads());
  const [sure, setSure] = useState(false);
  const exportRef = useRef(null);
  useEffect(() => {
    if (!sure) return undefined;
    const id = setTimeout(() => setSure(false), 4000);
    return () => clearTimeout(id);
  }, [sure]);
  const rows = useMemo(() => leads.map((l) => ({ l, f: Object.fromEntries(leadFields(l, { lifeLabel }).map((x) => [x.k, x.value])) })), [leads]);

  const exportCSV = (e) => {
    onPoke?.();
    const csv = leadsCSV(leads, { lifeLabel });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = leadsFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (e?.currentTarget) fx.scan(e.currentTarget, { sound: null });
    sfx.play('toast');
  };
  const wipe = () => {
    onPoke?.();
    if (!sure) return setSure(true);
    clearLeads();
    setLeads([]);
    setSure(false);
  };

  return (
    <div className="ws-leads">
      <header className="ws-leads-head">
        <button type="button" className="ws-x ws-back" onClick={onBack} aria-label={t('返回')} data-sfx="back">
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <div>
          <b>{t('客人名单（{0}）', [leads.length])}</b>
          <span>{t('只存在这台 iPad · 预算只在这里')}</span>
        </div>
      </header>
      {leads.length === 0 ? (
        <p className="ws-leads-empty">{t('还没有客人留下联系方式。')}</p>
      ) : (
        <ul className="ws-leads-list" onScroll={onPoke}>
          {rows.map(({ l, f }) => (
            <li key={l.id}>
              <div className="ws-lead-top">
                <b>{l.name}</b>
                <span>{phoneText(l.phone)}</span>
                <a className="ws-lead-wa" href={leadWaLink(l)} target="_blank" rel="noopener" aria-label={t('用 WhatsApp 发给 {0}', [l.name])} onClick={onPoke}>
                  <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
                </a>
              </div>
              <p className="ws-lead-tags">
                {intentsOf(l).map((v) => (
                  <em key={v}>{intentText(v)}</em>
                ))}
                <small>{f.at}</small>
              </p>
              <p className="ws-lead-meta">{[f.card, homeLine(l.home || {}), f.where].filter(Boolean).join(' · ')}</p>
              {(f.budget || f.timeline) && <p className="ws-lead-meta is-staff">{[f.budget && t('预算 {0}', [f.budget]), f.timeline].filter(Boolean).join(' · ')}</p>}
            </li>
          ))}
        </ul>
      )}
      <div className="ws-leads-acts">
        <button type="button" ref={exportRef} className="ws-act ws-act-sm" onClick={exportCSV} disabled={!leads.length} data-sfx="none">
          <i>
            <Download size={18} strokeWidth={1.8} aria-hidden="true" />
          </i>
          <span>
            <b>{t('导出 Excel（CSV）')}</b>
            <em>{t('中文不会乱码，Excel 直接打开')}</em>
          </span>
        </button>
        <button type="button" className={`ws-act ws-act-sm is-end ${sure ? 'is-sure' : ''}`} onClick={wipe} disabled={!leads.length}>
          <i>
            <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />
          </i>
          <span>
            <b>{sure ? t('再按一次，清空名单') : t('清空名单')}</b>
            <em>{t('导出以后再清空（PDPA：不用的资料不要一直留着）')}</em>
          </span>
        </button>
      </div>
    </div>
  );
}
