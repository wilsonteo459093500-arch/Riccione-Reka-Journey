// 板材（员工）· 几个共用的小零件：色卡图、类别 / 表面切换、用在哪、星标、确认框、提示条、文件下载。
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Star, Trash2, TriangleAlert } from 'lucide-react';
import { t, isEn } from '../../shared/i18n.js';
import { sfx } from '../../shared/sfx.js';
import { KINDS, FINISHES, USES } from '../../shared/boards/vocab.js';

/** Blob → object URL（组件不在了就放掉） */
export function useBlobURL(blob) {
  // 在 effect 里建、在 effect 的清理里放：React 开发模式会把 effect 跑两次（StrictMode），用 useMemo 建的网址会被放掉还拿来用
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob || typeof URL === 'undefined') {
      setUrl('');
      return undefined;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** 色卡：真实板材中间的一块（还没做好 = 量出来的平均色；还没分析 = 一层流光） */
export function Chip({ blob, url, hex, size = 48, busy = false, className = '' }) {
  const own = useBlobURL(url ? null : blob);
  const src = url || own;
  return (
    <span className={`bd-chip ${busy ? 'is-busy' : ''} ${className}`} style={{ width: size, height: size, backgroundColor: hex || undefined }} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" draggable="false" /> : null}
    </span>
  );
}

/** 小的分段按钮（类别、表面、纹向）：滑块跟着走，按下有声音 */
export function Seg({ value, options, onChange, label, disabled = false, className = '' }) {
  const i = Math.max(0, options.findIndex((o) => o[0] === value));
  const known = options.some((o) => o[0] === value);
  return (
    <div className={`seg seg-sm bd-seg ${known ? '' : 'is-none'} ${className}`} style={{ '--n': options.length, '--i': i }} role="radiogroup" aria-label={label}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map(([v, zh]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          className={v === value ? 'on' : ''}
          title={typeof zh === 'object' && isEn() && zh.full !== zh.en ? zh.full : undefined}
          disabled={disabled}
          data-sfx="select"
          onClick={() => v !== value && onChange(v)}
        >
          {typeof zh === 'object' ? (isEn() ? zh.en : zh.zh) : t(zh)}
        </button>
      ))}
    </div>
  );
}

// 分段按钮里用短的英文（Wood / Solid …），整句的英文在词典里（木纹 = Wood grain）
export const KIND_OPTS = KINDS.map((k) => [k.v, { zh: k.zh, en: k.short || k.en, full: k.en }]);
export const FINISH_OPTS = FINISHES.map((f) => [f.v, { zh: f.zh, en: f.short || f.en, full: f.en }]);

/** 用在哪：柜体 · 门 / 墙板（R1；编织 v1 只是资料，不能选） */
export function UsesChips({ value = [], onChange, kind, small = true }) {
  if (kind === 'weave')
    return (
      <span className="bd-uses-none" title={t('织系列是柜门的膜：先记在资料里，3D 里还不会铺上去')}>
        {t('只是资料')}
      </span>
    );
  return (
    <div className={`bd-uses ${small ? 'is-small' : ''}`} role="group" aria-label={t('用在哪')}>
      {USES.map((u) => {
        const on = value.includes(u.v);
        return (
          <button
            key={u.v}
            type="button"
            className={`bd-use ${on ? 'on' : ''}`}
            aria-pressed={on}
            data-sfx={on ? 'chipRemove' : 'chipAdd'}
            onClick={() => onChange(on ? value.filter((x) => x !== u.v) : [...value, u.v])}
          >
            {small && isEn() ? u.short || t(u.zh) : t(u.zh)}
          </button>
        );
      })}
    </div>
  );
}

/** 星标（常用：材质栏排在前面，配色打平的时候赢） */
export function StarBtn({ on, onChange, label }) {
  return (
    <button
      type="button"
      className={`bd-star ${on ? 'on' : ''}`}
      aria-pressed={!!on}
      aria-label={label || t('常用')}
      title={t('常用：材质栏里排在前面')}
      data-sfx={on ? 'toggleOff' : 'toggleOn'}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
    >
      <Star size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

/** 确认框（和案例库同一个样子：.mg-veil / .mg-ask） */
export function useAsk() {
  const [q, setQ] = useState(null);
  const res = useRef(null);
  const ask = (o) =>
    new Promise((r) => {
      res.current?.(false);
      res.current = r;
      setQ(o);
    });
  const done = (v) => {
    const r = res.current;
    res.current = null;
    setQ(null);
    r?.(v);
  };
  const card = q && (
    <div className="mg-veil" onPointerDown={(e) => e.target === e.currentTarget && (sfx.play('close'), done(false))}>
      <div className="mg-ask" role="alertdialog" aria-modal="true" aria-labelledby="bd-ask-t">
        <span className={`mg-ask-ico ${q.danger ? 'is-danger' : q.warn ? 'is-warn' : ''}`} aria-hidden="true">
          {q.danger ? <Trash2 size={22} strokeWidth={1.8} /> : q.warn ? <TriangleAlert size={22} strokeWidth={1.8} /> : <Sparkles size={22} strokeWidth={1.8} />}
        </span>
        <h2 id="bd-ask-t">{q.title}</h2>
        {q.body && <p>{q.body}</p>}
        <div className="mg-ask-acts">
          <button type="button" className="btn-ghost" autoFocus onClick={() => done(false)}>
            {q.cancel || t('取消')}
          </button>
          <button type="button" className="btn-gold" onClick={() => done(true)}>
            {q.ok}
          </button>
        </div>
      </div>
    </div>
  );
  return [card, ask];
}

/** 底部的提示条（3.2 秒后自己走） */
export function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), toast.ms || 3400);
    return () => clearTimeout(id);
  }, [toast]);
  const flash = (msg, kind = 'ok', ms) => {
    setToast({ msg, kind, ms, k: Date.now() });
    if (kind === 'error') sfx.play('error');
  };
  const el = toast && (
    <div key={toast.k} className={`mg-toast ${toast.kind === 'error' ? 'is-error' : ''}`} role="status">
      {toast.msg}
    </div>
  );
  return [el, flash];
}

/** 把一个 Blob 存成文件（几个文件时一个一个来） */
export async function download(files) {
  for (const f of files) {
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    if (files.length > 1) await new Promise((r) => setTimeout(r, 450));
  }
}

/**
 * 存几个文件：一个 → 平常的下载；几个（大的板材包拆成几份）→ Chrome / Edge 先让员工选一个文件夹，全部写进去
 * （不会跳「这个网站想下载多个文件」）；选不了 / 不支持 → 一个一个下载（提示里会说「允许下载多个文件」）。
 * @returns {Promise<'download'|'folder'|'cancel'>}
 */
export async function saveFiles(files) {
  if (files.length > 1 && typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
    try {
      const dir = await window.showDirectoryPicker({ id: 'wish-board-packs', mode: 'readwrite', startIn: 'downloads' });
      for (const f of files) {
        const h = await dir.getFileHandle(f.name, { create: true });
        const w = await h.createWritable();
        await w.write(f.blob);
        await w.close();
      }
      return 'folder';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancel';
      // 没有写入权限之类：退回一个一个下载
    }
  }
  await download(files);
  return 'download';
}

export const fmtMB = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** 触屏设备（iPad / 手机）：不能选整个文件夹，也不适合处理 200 张大图 */
export function isTouchDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}
