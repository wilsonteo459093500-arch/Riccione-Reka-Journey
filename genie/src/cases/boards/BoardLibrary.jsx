// 员工 · 板材库（cases.html?staff=1&boards=1）—— 这台设备看得到的全部溪岸板材：随网站发布的 + 这台设备导入的。
//   找（序号 / 编号 / 名字）· ★ 常用 · 改资料（序号、名字、编号、系列、类别、表面、用在哪、隐藏）· 删掉本机的
//   导入板材包（店里的 iPad 用这个）· 导出板材包（办公室电脑存过的板）· 导入板材文件夹（办公室电脑）
// 只给员工（从案例库进来；许愿模式里没有任何路到这里）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FolderOpen, Search, Upload, X, Eye, EyeOff, Trash2, Rotate3d, Info } from 'lucide-react';
import LangToggle from '../../shared/LangToggle.jsx';
import { t, L, isEn } from '../../shared/i18n.js';
import { sfx } from '../../shared/sfx.js';
import fx from '../../shared/fx.js';
import { BOARDS, MAT_BY_ID, onBoards } from '../../shared/materials.js';
import { loadBoardImage, isColourCode } from '../../shared/boards/library-api.js';
import { boardMatches } from '../../shared/boards/parse.js';
import { boardsReady, deviceRecords, updateDeviceBoard, saveDeviceBoards, deleteDeviceBoards, importPacks, exportPacks } from '../../shared/boards/device.js';
import { KIND_BY_V, FINISH_BY_V, USES } from '../../shared/boards/vocab.js';
import { colourWord } from '../../shared/boards/derive.js';
import { defaultUses, hasEnglish } from './record.js';
import { Chip, Seg, KIND_OPTS, FINISH_OPTS, UsesChips, StarBtn, saveFiles, fmtMB, useBlobURL, isTouchDevice } from './ui.jsx';

// 卡片上的「用在哪」：英文用短的（Cabinets / Panels），不然一张卡要折三行
const useLabel = (v) => {
  const u = USES.find((x) => x.v === v);
  if (!u) return v;
  return isEn() ? u.short || t(u.zh) : t(u.zh);
};

const FILTERS = [
  ['all', '全部', () => true],
  ['fav', '★ 常用', (b) => b.fav],
  ['wood', '木纹', (b) => b.kind === 'wood'],
  ['solid', '纯色', (b) => b.kind === 'solid'],
  ['stone', '石纹', (b) => b.kind === 'stone'],
  ['weave', '编织', (b) => b.kind === 'weave'],
  ['hidden', '隐藏', (b) => b.hidden],
  ['noen', '没有英文名', (b) => !!(b.name?.zh || '').trim() && !hasEnglish(b.name)], // 色号板（2810、P1）没有名字，不算
];

/** 只有中文名的板：英文界面显示「中文 · 看得懂的说明」（按颜色），员工可以改成真正的英文名 */
const autoEn = (zh, b, hex) => (zh ? (hex ? `${zh} · ${colourWord(hex, b.kind)}` : zh) : '');

const labelOf = (m) => (isEn() ? m.en : m.zh);

/** 资料一栏（输入框：离开或回车才存） */
function Field({ label, value, onCommit, mono = false, inputMode, placeholder }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return (
    <label className="bd-field">
      <span>{label}</span>
      <input
        className={`bd-in ${mono ? 'is-mono' : ''}`}
        value={v}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => String(v) !== String(value ?? '') && onCommit(v)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}

function BigImage({ id, rev }) {
  const [blob, setBlob] = useState(null);
  useEffect(() => {
    let alive = true;
    setBlob(null);
    loadBoardImage(id, 1024).then((b) => alive && setBlob(b));
    return () => {
      alive = false;
    };
  }, [id, rev]);
  const url = useBlobURL(blob);
  const m = MAT_BY_ID[id];
  return (
    <div className="bd-big" style={{ backgroundColor: m?.color }}>
      {url ? <img src={url} alt="" /> : <span>{m?.board?.img === false ? t('这块板只有资料（网站上没有放贴图）') : t('正在读贴图…')}</span>}
    </div>
  );
}

function Editor({ m, isDevice, onPatch, onDelete, onClose }) {
  const b = m.board;
  const set = (patch) => onPatch(m.id, patch);
  return (
    <aside className="bd-side bd-ed" aria-label={t('编辑板材')}>
      <div className="bd-ed-head">
        <h2>{labelOf(m)}</h2>
        <button type="button" className="mg-home" data-sfx="close" aria-label={t('关上')} onClick={onClose}>
          <X size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <BigImage id={m.id} rev={b.rev} />
      <div className="bd-ed-row">
        <StarBtn on={b.fav} onChange={(v) => set({ fav: v })} />
        <span>{b.fav ? t('常用（材质栏里排在前面）') : t('设成常用')}</span>
        <span className="so-sp" />
        <button type="button" className="btn-ghost so-mini" data-sfx={b.hidden ? 'toggleOn' : 'toggleOff'} onClick={() => set({ hidden: !b.hidden })}>
          {b.hidden ? <Eye size={15} strokeWidth={1.8} aria-hidden="true" /> : <EyeOff size={15} strokeWidth={1.8} aria-hidden="true" />}
          {b.hidden ? t('取消隐藏') : t('隐藏')}
        </button>
      </div>
      <div className="bd-fields">
        <Field label={t('序号')} value={b.seq ?? ''} inputMode="numeric" placeholder="—" onCommit={(v) => set({ seq: /^\d{1,4}$/.test(String(v).trim()) ? +String(v).trim() : null })} />
        <Field label={t('厂家编号')} value={b.code} mono placeholder="—" onCommit={(v) => set({ code: v.trim().toUpperCase() })} />
        <Field label={t('名字')} value={b.name.zh} onCommit={(v) => set({ name: { zh: v.trim(), en: hasEnglish(b.name) ? b.name.en : autoEn(v.trim(), b, m.color) } })} />
        <Field label={t('英文名')} value={hasEnglish(b.name) ? b.name.en : ''} placeholder={b.name.en || autoEn(b.name.zh, b, m.color) || t('英文名')} onCommit={(v) => set({ name: { zh: b.name.zh, en: v.trim() || autoEn(b.name.zh, b, m.color) } })} />
        <Field label={t('系列')} value={b.series} placeholder="—" onCommit={(v) => set({ series: v.trim() })} />
      </div>
      <div className="bd-ed-grp">
        <span>{t('类别')}</span>
        <Seg value={b.kind} options={KIND_OPTS} label={t('类别')} onChange={(v) => set({ kind: v, uses: defaultUses(v, b.series) })} />
      </div>
      <div className="bd-ed-grp">
        <span>{t('表面')}</span>
        <Seg value={b.finish} options={FINISH_OPTS} label={t('表面')} onChange={(v) => set({ finish: v, rough: FINISH_BY_V[v].rough })} />
      </div>
      <div className="bd-ed-grp">
        <span>{t('用在')}</span>
        <UsesChips kind={b.kind} value={b.uses} small={false} onChange={(v) => set({ uses: v })} />
      </div>
      <dl className="bd-dl">
        <dt>{t('真实尺寸')}</dt>
        <dd>
          {b.mm?.[0]} × {b.mm?.[1]} mm
        </dd>
        {b.file && (
          <>
            <dt>{t('文件名')}</dt>
            <dd>{b.file}</dd>
          </>
        )}
        {b.near && MAT_BY_ID[b.near] && (
          <>
            <dt>{t('最像')}</dt>
            <dd>{t('程序化「{0}」', [L(MAT_BY_ID[b.near])])}</dd>
          </>
        )}
        <dt>{t('在哪里')}</dt>
        <dd>{isDevice ? t('这台设备（导入的）') : t('随网站发布')}</dd>
        {b.at && (
          <>
            <dt>{t('导入日期')}</dt>
            <dd>{b.at}</dd>
          </>
        )}
      </dl>
      <p className="bd-hint">
        <Info size={14} strokeWidth={1.8} aria-hidden="true" />
        {b.code && !isColourCode(b.code) ? t('厂家编号只给员工和设计师看，客人看到的是「{0}」。', [labelOf(m)]) : t('客人看到的是「{0}」。', [labelOf(m)])}
      </p>
      {isDevice && (
        <button type="button" className="btn-ghost bd-del" data-sfx="dissolve" onClick={() => onDelete(m)}>
          <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
          {t('从这台设备删掉')}
        </button>
      )}
    </aside>
  );
}

export default function BoardLibrary({ onImport, flash, ask }) {
  const [ver, setVer] = useState(0);
  const [ready, setReady] = useState(false);
  const [dev, setDev] = useState(new Set());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState(null);
  const fileRef = useRef(null);
  const gridRef = useRef(null);
  const touch = useMemo(() => isTouchDevice(), []);

  const refreshDev = async () => setDev(new Set((await deviceRecords()).map((r) => r.id)));
  useEffect(() => {
    let alive = true;
    boardsReady().then(async () => {
      await refreshDev();
      if (alive) setReady(true);
    });
    const off = onBoards(() => setVer((v) => v + 1));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const all = useMemo(() => [...BOARDS], [ver]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([id, , f]) => [id, all.filter((m) => f(m.board)).length])), [all]);
  const shown = all.filter((m) => FILTERS.find((f) => f[0] === filter)[2](m.board) && (filter === 'hidden' || filter === 'all' || !m.board.hidden) && boardMatches(m.board.rec || m.board, q));
  const sel = selId ? MAT_BY_ID[selId] : null;

  const patch = async (id, p) => {
    const m = MAT_BY_ID[id];
    if (!m) return;
    if (dev.has(id)) await updateDeviceBoard(id, p);
    else {
      // 随网站发布的板：改了就在这台设备上存一份 rev 更高的（贴图照样用网站上的）
      const rec = m.board.rec;
      await saveDeviceBoards([{ ...rec, ...p, rev: (rec.rev || 1) + 1 }]);
      await refreshDev();
    }
    if ('fav' in p) sfx.play(p.fav ? 'wishAdd' : 'deselect');
  };

  const remove = async (m) => {
    const yes = await ask({ title: t('从这台设备删掉「{0}」？', [labelOf(m)]), body: t('连贴图一起删掉。用到它的案例还记得它的编号；再导入同一个板材包就回来了。'), ok: t('删掉'), danger: true });
    if (!yes) return;
    const tile = gridRef.current?.querySelector(`[data-id="${CSS.escape(m.id)}"]`);
    setSelId(null);
    const go = async () => {
      await deleteDeviceBoards([m.id]);
      await refreshDev();
      flash(t('已删掉'));
    };
    if (tile?.isConnected) fx.dissolve(tile, { origin: 'right', duration: 520, delay: 40, tone: 'paper' }).then(go);
    else go();
  };

  const doImport = async (files) => {
    if (!files?.length) return;
    setBusy('import');
    try {
      const r = await importPacks([...files]);
      await refreshDev();
      if (r.errors.length && !r.added && !r.updated) flash(t(r.errors[0].zh), 'error');
      else {
        flash(t('新增 {0} · 更新 {1} · 跳过 {2}', [r.added, r.updated, r.skipped]) + (r.rejected.length ? ' · ' + t('{0} 块没导入（贴图坏了）', [r.rejected.length]) : ''));
        if (r.added || r.updated) sfx.play('achievement');
      }
    } catch (e) {
      flash(t('没导入成：{0}', [String(e?.message || e)]), 'error');
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    setBusy('export');
    try {
      const parts = await exportPacks();
      if (!parts.length) {
        flash(t('这台设备上还没有导入过板材'), 'error');
        return;
      }
      const how = await saveFiles(parts.map((p) => ({ name: p.name, blob: p.blob })));
      if (how === 'cancel') return;
      const list = parts.map((p) => `${p.name}（${fmtMB(p.bytes || p.blob.size)}）`).join(isEn() ? ', ' : '、');
      if (parts.length === 1) flash(t('已导出 {0}', [list]));
      else if (how === 'folder') flash(t('{0} 个文件已存进你选的文件夹（每个都可以单独导入）：{1}', [parts.length, list]), 'ok', 7000);
      else flash(t('已导出 {0} 个文件（每个都可以单独导入）：{1}。浏览器问的话，请按「允许下载多个文件」。', [parts.length, list]), 'ok', 8000);
    } catch (e) {
      flash(t('没导出成：{0}', [String(e?.message || e)]), 'error');
    } finally {
      setBusy(null);
    }
  };

  const devN = all.filter((m) => dev.has(m.id)).length;
  return (
    <div className={`so-page bd-page bd-lib ${sel ? 'is-editing' : ''}`}>
      <header className="so-top">
        <a className="mg-home" href={`cases.html?staff=1${isEn() ? '&lang=en' : ''}`} data-sfx="back" aria-label={t('回到案例库')}>
          <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" />
        </a>
        <h1>
          {t('板材库')}
          <small>{t('员工')}</small>
        </h1>
        <p className="so-stats">{ready ? t('{0} 块 · ★ {1} · 这台设备导入的 {2}', [all.length, counts.fav, devN]) : t('正在读板材库…')}</p>
        <span className="so-sp" />
        <div className="bd-acts">
        <button type="button" className="btn-line small" data-sfx="open" aria-label={t('导入板材包')} disabled={busy === 'import'} onClick={() => fileRef.current?.click()}>
            <Upload size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{busy === 'import' ? t('正在导入…') : t('导入板材包')}</span>
          </button>
          <button type="button" className="btn-line small" data-sfx="open" aria-label={t('导出板材包')} disabled={!devN || busy === 'export'} onClick={doExport}>
            <Download size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{busy === 'export' ? t('正在导出…') : t('导出板材包')}</span>
          </button>
          {!touch && (
            <button type="button" className="btn-primary small" data-sfx="open" onClick={onImport}>
              <FolderOpen size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{t('导入板材文件夹')}</span>
            </button>
          )}
        </div>
        <LangToggle compact />
      </header>
      <div className="bd-tools">
        <label className="bd-search">
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
          <input value={q} placeholder={t('找：序号、编号、名字（7号 · XA-TP-01 · 黑胡桃）')} aria-label={t('找板材')} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" aria-label={t('清除')} data-sfx="cross" onClick={() => setQ('')}>
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="chips so-filters" role="tablist" aria-label={t('筛选')} data-sfx="radio">
          {FILTERS.map(([id, zh]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>
              {t(zh)} <b>{counts[id] ?? 0}</b>
            </button>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => {
            doImport(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <div className="bd-libwrap">
        <section className="bd-libmain" aria-label={t('板材')}>
          {!ready ? null : all.length === 0 ? (
            <div className="bd-empty">
              <span className="bd-empty-chips" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <h2>{t('板材库还是空的')}</h2>
              <p>{touch ? t('在办公室电脑上「导入板材文件夹」，导出板材包，再在这里「导入板材包」。') : t('「导入板材文件夹」：选老板电脑上的「板材贴图」文件夹。店里的 iPad 用「导入板材包」。')}</p>
              <div className="bd-empty-acts">
                {!touch && (
                  <button type="button" className="btn-primary" data-sfx="open" onClick={onImport}>
                    <FolderOpen size={18} strokeWidth={1.8} aria-hidden="true" />
                    {t('导入板材文件夹')}
                  </button>
                )}
                <button type="button" className={touch ? 'btn-primary' : 'btn-line'} data-sfx="open" onClick={() => fileRef.current?.click()}>
                  <Upload size={18} strokeWidth={1.8} aria-hidden="true" />
                  {t('导入板材包')}
                </button>
              </div>
              <p className="bd-privacy">{t('客人在 3D 里只会看到这里有的板；没有板的时候，客人那边不会出现「溪岸板材」。')}</p>
            </div>
          ) : shown.length === 0 ? (
            <p className="mg-empty">{t('没有找到。')}</p>
          ) : (
            <ul className="bd-grid" ref={gridRef}>
              {shown.map((m) => {
                const b = m.board;
                return (
                  <li key={m.id} data-id={m.id} className={`bd-card ${selId === m.id ? 'is-sel' : ''} ${b.hidden ? 'is-hidden' : ''}`}>
                    <button type="button" className="bd-card-btn" data-sfx="select" onClick={() => setSelId(selId === m.id ? null : m.id)} aria-pressed={selId === m.id}>
                      <Chip url={b.chip} hex={m.color} size={64} />
                      <span className="bd-card-t">
                        <b>{labelOf(m)}</b>
                        <small>
                          {[b.code && !isColourCode(b.code) ? b.code : '', b.series ? t(b.series) : '', t(KIND_BY_V[b.kind]?.zh || ''), t(FINISH_BY_V[b.finish]?.zh || '')].filter(Boolean).join(' · ')}
                        </small>
                        <span className="bd-card-uses">
                          {b.kind === 'weave' ? <em>{t('只是资料')}</em> : b.uses.map((u) => <em key={u}>{useLabel(u)}</em>)}
                          {dev.has(m.id) ? <em className="is-dev">{t('本机')}</em> : <em className="is-net">{t('网站')}</em>}
                          {b.hidden && <em className="is-hid">{t('隐藏')}</em>}
                        </span>
                      </span>
                    </button>
                    <StarBtn on={b.fav} onChange={(v) => patch(m.id, { fav: v })} />
                  </li>
                );
              })}
            </ul>
          )}
          {ready && all.length > 0 && (
            <p className="mg-foot">
              <Rotate3d size={14} strokeWidth={1.8} aria-hidden="true" /> {t('这台设备的 3D 工作室已经能用这些板；★ 常用的排在材质栏前面。')}
            </p>
          )}
        </section>
        {sel && <Editor key={sel.id} m={sel} isDevice={dev.has(sel.id)} onPatch={patch} onDelete={remove} onClose={() => setSelId(null)} />}
      </div>
    </div>
  );
}
