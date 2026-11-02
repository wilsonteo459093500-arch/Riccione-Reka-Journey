// 员工 · 板材导入（cases.html?staff=1&boards=1&import=1）—— 老板办公室电脑上的「溪岸--板材高清贴图 / 板材贴图」→ 3D 里的真实板材。
//   选文件夹（Chrome / Edge：showDirectoryPicker；别的浏览器 <input webkitdirectory> / 拖进来）→ 按 Windows 的顺序列出来
//   → worker 一张一张分析（类别、颜色、接缝、编织边框、尺寸、色卡 + 256 / 1024 两档 WebP）
//   → 员工一行一行确认（要处理的排在最前）：序号 · 名字 · 编号 · 系列 · 类别 · 用在哪 · ★ · 转向 / 翻转 · 裁边
//   → 存到这台电脑（IndexedDB）→ 导出板材包（每份 ≤ 20 MB）→ 店里 iPad「导入板材包」/ 负责人合进网站。
// 隐私：原图只在这台电脑上处理，不上传；板材包里只有重新画过的 WebP 和文件名（没有路径）。

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Download, FolderOpen, FolderTree, Images, Library, RotateCw, FlipVertical2, Sparkles, Undo2, Rotate3d } from 'lucide-react';
import LangToggle from '../../shared/LangToggle.jsx';
import { t, L, isEn } from '../../shared/i18n.js';
import { sfx } from '../../shared/sfx.js';
import fx from '../../shared/fx.js';
import { MATERIALS, MAT_BY_ID, BOARDS } from '../../shared/materials.js';
import { parseBoardName, assignIds, naturalCompare, basename } from '../../shared/boards/parse.js';
import { loadSeed } from '../../shared/boards/catalog-seed.js';
import { indexSeed, matchCatalog, catalogDiff } from '../../shared/boards/catalog.js';
import { boardsReady, deviceRecords, knownIds, saveDeviceBoards, exportPacks, fileKey, cacheGet, cachePut } from '../../shared/boards/device.js';
import { imageKey } from '../../shared/boards/pack.js';
import { KIND_BY_V, FINISH_BY_V } from '../../shared/boards/vocab.js';
import { fromFiles, fromDrop, canPickFolder } from '../sorter/listing.js';
import { canDirPicker, pickDirectory } from '../../shared/bulk/dirpick.js';
import { WorkerPool } from '../../shared/bulk/pool.js';
import { runTask, TASK_V } from './tasks.js';
import { valueOf, buildRecord, rowWarnings, WARN_TEXT, WARN_SEVERE, sortRows, densityOf, markDupes, finalPx, rowLabel, acceptLevel, sureProposal, topWarning, renamedFromLost, hasEnglish } from './record.js';
import { Chip, Seg, KIND_OPTS, FINISH_OPTS, UsesChips, StarBtn, saveFiles, fmtMB, useBlobURL } from './ui.jsx';

const nf = (n) => Math.round(n).toLocaleString('en-US');
// 每一行的记录 / 提醒按行对象缓存（行只在改动时换成新的对象）：200 张图分析时，每出一个结果不用把 200 行全部重算一遍
const REC_CACHE = new WeakMap();
const WARN_CACHE = new WeakMap();
const recOf = (row, density) => {
  const c = REC_CACHE.get(row);
  if (c && c.density === density) return c.rec;
  const rec = buildRecord(row, { density, materials: MATERIALS });
  REC_CACHE.set(row, { density, rec });
  return rec;
};
const warnsOf = (row) => {
  let w = WARN_CACHE.get(row);
  if (!w) WARN_CACHE.set(row, (w = rowWarnings(row)));
  return w;
};
/** 目录建议的「采用」按钮上写什么：编号 / 色号对上的 =「目录：名字 · 系列」；按文件名 / 名字猜的 =「可能是 XA-TP-13（请对照实物）」 */
const proposalLabel = (pr) =>
  sureProposal(pr)
    ? t('目录：{0}', [[pr.fields.name, pr.fields.series ? t(pr.fields.series) : ''].filter(Boolean).join(' · ') || pr.entry.code])
    : t('可能是 {0}（请对照实物）', [pr.fields.code || pr.entry.code || pr.fields.name || '—']);
const FIRST = 24;
const STEP = 24;
const FILTERS = [
  ['all', '全部'],
  ['todo', '要处理'],
  ['fav', '★ 常用'],
  ['wood', '木纹'],
  ['solid', '纯色'],
  ['stone', '石纹'],
  ['weave', '编织'],
  ['skip', '不导入'],
];
const passes = (r, f) => {
  const skip = valueOf(r, 'skip');
  if (f === 'skip') return skip;
  if (skip) return f === 'all';
  if (f === 'all') return true;
  if (f === 'todo') return warnsOf(r).some((c) => WARN_SEVERE.has(c)) || !r.res;
  if (f === 'fav') return valueOf(r, 'fav');
  return valueOf(r, 'kind') === f;
};
function fmtDur(sec) {
  if (sec == null || !isFinite(sec)) return '—';
  if (sec < 60) return t('{0} 秒', [Math.max(1, Math.round(sec))]);
  return t('{0} 分钟', [Math.round(sec / 60)]);
}
const RULE_TEXT = {
  aspect: '按长宽比：长边 = 一张整板 2440 mm',
  batch: '按同一批整板的像素密度',
  'long-1220': '长边按 1220 mm（方的小样）',
  solid: '纯色：600 × 600 mm 一块',
  weave: '编织：按纹路的周期（每次压挑 2 mm）',
  manual: '手动调过',
};

// ───────────────────────── 开始：选文件夹 ─────────────────────────

function Start({ onEntries, listing }) {
  const dirRef = useRef(null);
  const filesRef = useRef(null);
  const [over, setOver] = useState(false);
  const modern = useMemo(() => canDirPicker(), []);
  const folderOK = useMemo(() => modern || canPickFolder(), [modern]);
  const safari = useMemo(() => typeof navigator !== 'undefined' && /^((?!chrome|android|crios|edg).)*safari/i.test(navigator.userAgent), []);
  // 只在开发服务器里：浏览器检查脚本用它把测试文件夹交进来（正式版没有这一段）
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__boardsPick = (files, name = '') => onEntries(fromFiles(files), name);
    return () => delete window.__boardsPick;
  }, [onEntries]);
  const pickModern = async () => {
    listing.set(0);
    try {
      const got = await pickDirectory({ id: 'wish-boards', onCount: (n) => listing.set(n) });
      if (!got) {
        listing.set(null);
        return;
      }
      onEntries(got.entries, got.name);
    } catch {
      listing.set(null);
      dirRef.current?.click();
    }
  };
  const onDrop = async (e) => {
    e.preventDefault();
    setOver(false);
    listing.set(0);
    const entries = await fromDrop(e.dataTransfer, { onCount: (n) => listing.set(n) });
    const top = entries[0]?.path?.includes('/') ? entries[0].path.split('/')[0] : '';
    onEntries(entries, top);
  };
  return (
    <section className="so-start bd-start">
      <p className="so-eyebrow">{t('员工 · 板材')}</p>
      <h1>{t('导入板材文件夹')}</h1>
      <p className="so-lead">{t('把「溪岸--板材高清贴图 / 板材贴图」整个文件夹交给我：每一张自动认出是木纹、纯色、石纹还是编织，量好颜色和尺寸，做成 3D 用的贴图。你只要看一遍、改一改，存起来。')}</p>
      <div
        className={`so-drop ${over ? 'is-over' : ''} ${listing.n != null ? 'is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!over) setOver(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
        onDrop={onDrop}
      >
        <span className="so-drop-ico" aria-hidden="true">
          <FolderTree size={34} strokeWidth={1.4} />
        </span>
        {listing.n != null ? (
          <>
            <b>{t('正在列文件… {0}', [nf(listing.n)])}</b>
            <span>{t('只读名字、大小和日期，很快。')}</span>
          </>
        ) : (
          <>
            <b>{folderOK ? t('把板材贴图的文件夹拖到这里') : t('选几张板材贴图')}</b>
            <span>{t('原图只在这台电脑上处理，不会上传到任何地方。')}</span>
            <div className="so-drop-acts">
              {folderOK && (
                <button type="button" className="btn-primary" data-sfx="open" onClick={() => (modern ? pickModern() : dirRef.current?.click())}>
                  <FolderOpen size={18} strokeWidth={1.8} aria-hidden="true" />
                  {t('选择文件夹')}
                </button>
              )}
              <button type="button" className={folderOK ? 'btn-line' : 'btn-primary'} data-sfx="open" onClick={() => filesRef.current?.click()}>
                <Images size={18} strokeWidth={1.8} aria-hidden="true" />
                {t('选几张图片')}
              </button>
            </div>
          </>
        )}
      </div>
      <ul className="bd-notes">
        <li>{t('JPG / PNG 都可以；TIF、PDF 会列出来提醒你另存成 JPG。')}</li>
        <li>{t('文件名就是资料：「7号黑胡桃XA-TP-01」= 序号 7、黑胡桃、厂家编号 XA-TP-01；「2810」= 烤漆色号。')}</li>
        <li>{t('同一个文件夹再选一次，做过的直接用，不用重新等。')}</li>
        {safari && <li className="is-warn">{t('用 Chrome / Edge 导入，包会小一半（Safari 做不出 WebP）。')}</li>}
      </ul>
      <input ref={dirRef} type="file" hidden webkitdirectory="" directory="" multiple onChange={(e) => {
        const list = fromFiles(e.target.files);
        const top = list[0]?.path?.includes('/') ? list[0].path.split('/')[0] : '';
        onEntries(list, top);
        e.target.value = '';
      }} />
      <input ref={filesRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.tif,.tiff" onChange={(e) => {
        onEntries(fromFiles(e.target.files), '');
        e.target.value = '';
      }} />
    </section>
  );
}

// ───────────────────────── 一行 ─────────────────────────

function TextCell({ value, onCommit, placeholder, mono = false, width, label, inputMode }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => {
    if (String(v) !== String(value ?? '')) onCommit(v);
  };
  return (
    <input
      className={`bd-in ${mono ? 'is-mono' : ''}`}
      style={width ? { width } : undefined}
      value={v}
      placeholder={placeholder}
      aria-label={label}
      inputMode={inputMode}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setV(value ?? '');
          e.currentTarget.blur();
        }
      }}
    />
  );
}

const Row = memo(function Row({ row, rec, sel, onSel, onEdit }) {
  const sameNow = !!(row.existingRec && rec && rec.rev === (row.existingRec.rev || 1));
  const kind = valueOf(row, 'kind');
  const skip = valueOf(row, 'skip');
  const warns = warnsOf(row);
  const top = topWarning(warns);
  const lab = rowLabel(row);
  const seq = valueOf(row, 'seq');
  const code = valueOf(row, 'code');
  // 板材库里已经有的板（以前确认过）：不再提目录建议
  const diff = row.proposal && !row.edits.accept && !row.existingRec ? catalogDiff({ code, name: valueOf(row, 'name') ? { zh: valueOf(row, 'name').zh } : null, series: valueOf(row, 'series'), kind, finish: valueOf(row, 'finish') }, row.proposal) : {};
  const hasDiff = Object.keys(diff).length > 0;
  const renamed = renamedFromLost(row);
  const name = valueOf(row, 'name');
  return (
    <li className={`bd-row ${sel ? 'is-sel' : ''} ${skip ? 'is-skip' : ''} ${warns.includes('ask') ? 'is-ask' : ''}`} data-key={row.key} data-id={row.id || undefined} data-match={row.matchedBy || undefined} onClick={() => onSel(row.key)}>
      <Chip blob={row.res?.blobs?.chip} hex={row.res?.stats?.hex} size={44} busy={!row.res && !row.error} />
      <div className="bd-c-seq">
        <TextCell value={seq ?? ''} placeholder="—" width={46} inputMode="numeric" label={t('序号')} onCommit={(v) => onEdit(row.key, { seq: /^\d{1,4}$/.test(String(v).trim()) ? +String(v).trim() : null })} />
        <span className="bd-hao">{seq != null ? t('号') : ''}</span>
      </div>
      <div className="bd-c-name">
        <TextCell value={name.zh} placeholder={lab.zh || t('名字')} label={t('名字')} onCommit={(v) => onEdit(row.key, { name: { zh: v.trim(), en: hasEnglish(name) ? name.en : '' } })} />
        {!renamed && <small title={row.name}>{row.name}</small>}
        <div className="bd-c-warn">
          {row.existing && !skip && (sameNow ? <span className="bd-tag is-ok">{t('已存')}</span> : <span className="bd-tag is-info">{row.matchedBy === 'keys' ? t('已在板材库 · 换成新图（rev+1）') : t('已在板材库（会更新）')}</span>)}
          {renamed && <span className="bd-tag is-mute" title={row.name}>{t('原文件名：{0}', [row.name])}</span>}
          {top && (
            <span className={`bd-tag ${WARN_SEVERE.has(top) ? 'is-bad' : 'is-warn'}`} title={warns.length > 1 ? warns.map((c) => t(WARN_TEXT[c])).join('\n') : undefined}>
              <span className="bd-tag-t">{top === 'dup-pixels' && row.dupOf ? t('和「{0}」是同一张图，跳过', [row.dupOf]) : t(WARN_TEXT[top])}</span>
              {warns.length > 1 && <i className="bd-more-n">+{warns.length - 1}</i>}
            </span>
          )}
          {!top && !(hasDiff && !skip) && !(row.existing && !skip) && row.parsed.sharedCode?.length > 0 && <span className="bd-tag is-info">{t('和别的板同一个厂家编号（没关系）')}</span>}
          {/* 目录建议：这一行有要处理的（红）就先不放（一行只放一条；右边的细节里照样有），不导入的也不放 */}
          {hasDiff && !skip && !(top && WARN_SEVERE.has(top)) && (
            <button type="button" className={`bd-tag is-cat ${sureProposal(row.proposal) ? '' : 'is-maybe'}`} data-sfx="apply" onClick={(e) => (e.stopPropagation(), onEdit(row.key, { accept: 'row' }))} title={t('目录建议')}>
              <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
              <span className="bd-tag-t">{proposalLabel(row.proposal)}</span>
              <b>{t('采用')}</b>
            </button>
          )}
        </div>
      </div>
      <div className="bd-c-code">
        <TextCell value={code} placeholder="—" mono label={t('厂家编号')} onCommit={(v) => onEdit(row.key, { code: v.trim().toUpperCase() })} />
      </div>
      <div className="bd-c-kind" onClick={(e) => e.stopPropagation()}>
        <Seg value={kind} options={KIND_OPTS} label={t('类别')} disabled={!row.res || skip} onChange={(v) => onEdit(row.key, { kind: v })} />
      </div>
      <div className="bd-c-uses" onClick={(e) => e.stopPropagation()}>
        <UsesChips kind={kind} value={valueOf(row, 'uses')} onChange={(v) => onEdit(row.key, { uses: v })} />
      </div>
      <div className="bd-c-star">
        <StarBtn on={valueOf(row, 'fav')} onChange={(v) => onEdit(row.key, { fav: v })} />
      </div>
    </li>
  );
});

// ───────────────────────── 右边：大图 + 细节 ─────────────────────────

function Preview({ row, rec }) {
  const url = useBlobURL(row.res?.blobs?.[1024]);
  if (!url || !rec) return <div className="bd-pv is-empty">{row.error ? t('这张图读不出来') : t('正在分析…')}</div>;
  const [across, along] = rec.mm;
  // 门（600 × 2400）和一面墙板（三块 600 宽、2600 高、留缝）：和 3D 一样，部件居中取这张图的中间（offset 0.5）、横纹方向重复
  const bg = (wmm, hmm) => ({ backgroundImage: `url(${url})`, backgroundSize: `${(across / wmm) * 100}% ${(along / hmm) * 100}%`, backgroundPosition: '50% 100%' });
  return (
    <div className="bd-pv">
      <div className="bd-pv-scene" aria-hidden="true">
        <div className="bd-pv-panel" style={bg(1800, 2600)}>
          <i />
          <i />
        </div>
        <div className="bd-pv-door" style={bg(600, 2400)}>
          <i />
        </div>
      </div>
      <img className="bd-pv-img" src={url} alt="" />
    </div>
  );
}

function CropEditor({ row, onEdit }) {
  const url = useBlobURL(row.file);
  const crop = valueOf(row, 'crop');
  const [W, H] = row.res?.px || [1, 1];
  const set = (i, v) => {
    const n = [...crop];
    n[i] = Math.max(0, Math.min(Math.floor((i % 2 ? H : W) * 0.4), Math.round(+v || 0)));
    onEdit(row.key, { crop: n });
  };
  const box = { left: `${(crop[0] / W) * 100}%`, top: `${(crop[1] / H) * 100}%`, right: `${(crop[2] / W) * 100}%`, bottom: `${(crop[3] / H) * 100}%` };
  return (
    <div className="bd-crop">
      <div className="bd-crop-img" style={{ aspectRatio: `${W} / ${H}` }}>
        {url && <img src={url} alt="" decoding="async" />}
        <span className="bd-crop-box" style={box} />
      </div>
      <div className="bd-crop-ctl">
        {['左', '上', '右', '下'].map((zh, i) => (
          <label key={zh}>
            <span>{t(zh)}</span>
            <TextCell value={crop[i]} inputMode="numeric" width={52} label={t(zh)} onCommit={(v) => set(i, v)} />
          </label>
        ))}
        <button type="button" className="btn-ghost so-mini" data-sfx="back" onClick={() => onEdit(row.key, { crop: undefined })}>
          <Undo2 size={14} strokeWidth={1.8} aria-hidden="true" />
          {t('自动')}
        </button>
      </div>
    </div>
  );
}

function Detail({ row, rec, density, onEdit }) {
  const [more, setMore] = useState(false);
  const sideRef = useRef(null);
  // 换了一行：细节回到最上面（不然门 / 墙板的预览被上一行的滚动位置切掉）
  useEffect(() => {
    const el = sideRef.current;
    if (el) el.scrollTop = 0;
  }, [row?.key]);
  if (!row) return <aside className="bd-side is-empty"><p>{t('点一行看大图和细节。')}</p></aside>;
  const kind = valueOf(row, 'kind');
  const st = row.res?.stats;
  const rot = valueOf(row, 'rot');
  const lab = rowLabel(row);
  const near = rec?.near ? MAT_BY_ID[rec.near] : null;
  const shared = row.parsed.sharedCode || [];
  const seamTxt = (s) => (s === 'ok' ? t('接得上') : s === 'baked' ? t('已经做成无缝') : t('镜像接（看不出接缝）'));
  return (
    <aside className="bd-side" aria-label={t('细节')} ref={sideRef}>
      <h2>
        {lab.head && <b>{isEn() ? lab.headEn : lab.head}</b>}
        {(isEn() ? lab.en : lab.zh) || t('未命名')}
      </h2>
      <Preview row={row} rec={rec} />
      <dl className="bd-dl">
        <dt>{t('文件名')}</dt>
        <dd>
          {row.name}
          {row.res?.px && <small> · {row.res.px[0]} × {row.res.px[1]}</small>}
        </dd>
        <dt>{t('类别')}</dt>
        <dd>
          {t(KIND_BY_V[kind]?.zh || '还没定')}
          {row.res?.decided && !row.edits.kind && <small> · {t({ catalog: '按目录', name: '按文件名', pixels: '按像素', hint: '按名字里的字', ask: '认不出来' }[row.res.decided.by] || '')}</small>}
          {kind === 'weave' && <small className="bd-note">{t('织系列是柜门的膜：先记在资料里，3D 里还不会铺上去')}</small>}
        </dd>
        {kind === 'wood' && (
          <>
            <dt>{t('纹向')}</dt>
            <dd className="bd-rot">
              <span>
                {t('顺纹竖放')}
                <small>{rot ? t('（转了 {0}°）', [rot]) : t('（原样）')}</small>
              </span>
              <span className="bd-rot-btns">
                <button type="button" className="btn-ghost so-mini" data-sfx="flip" onClick={() => onEdit(row.key, { rot: (rot + 90) % 360 })} title={t('转 90°')}>
                  <RotateCw size={14} strokeWidth={1.8} aria-hidden="true" />
                  90°
                </button>
                <button type="button" className="btn-ghost so-mini" data-sfx="flip" onClick={() => onEdit(row.key, { rot: (rot + 180) % 360 })} title={t('上下翻过来（山纹朝上）')}>
                  <FlipVertical2 size={14} strokeWidth={1.8} aria-hidden="true" />
                  180°
                </button>
              </span>
            </dd>
          </>
        )}
        <dt>{t('表面')}</dt>
        <dd>
          <Seg value={valueOf(row, 'finish')} options={FINISH_OPTS} label={t('表面')} onChange={(v) => onEdit(row.key, { finish: v })} />
        </dd>
        <dt>{t('用在')}</dt>
        <dd>
          <UsesChips kind={kind} value={valueOf(row, 'uses')} onChange={(v) => onEdit(row.key, { uses: v })} />
        </dd>
        {st && (
          <>
            <dt>{t('颜色')}</dt>
            <dd>
              <i className="bd-dot" style={{ background: st.hex }} />
              {st.hex}
              {rec && <small> · {t('暖 {0} · 明度 {1}', [rec.warm, rec.light])}</small>}
              {rec?.tags?.length > 0 && <small> · {rec.tags.join(' ')}</small>}
            </dd>
          </>
        )}
        {near && (
          <>
            <dt>{t('最像')}</dt>
            <dd>{t('程序化「{0}」', [L(near)])}</dd>
          </>
        )}
        <dt>{t('系列')}</dt>
        <dd>
          <TextCell value={valueOf(row, 'series')} placeholder="—" label={t('系列')} onCommit={(v) => onEdit(row.key, { series: v.trim() })} />
        </dd>
        <dt>{t('英文名')}</dt>
        <dd>
          <TextCell value={hasEnglish(valueOf(row, 'name')) ? valueOf(row, 'name').en : ''} placeholder={rec?.name?.en || valueOf(row, 'name').en || t('英文名')} label={t('英文名')} onCommit={(v) => onEdit(row.key, { name: { zh: valueOf(row, 'name').zh, en: v.trim() } })} />
        </dd>
        {valueOf(row, 'code') && (
          <>
            <dt>{t('厂家编号')}</dt>
            <dd>
              <code>{valueOf(row, 'code')}</code>
              {shared.length > 0 && <small> · {t('还有 {0} 块板也是这个编号（没关系）', [shared.length])}</small>}
            </dd>
          </>
        )}
        {rec && (
          <>
            <dt>{t('真实尺寸')}</dt>
            <dd>
              {rec.mm[0]} × {rec.mm[1]} mm
              <small> · {t(RULE_TEXT[rec.sizeRule] || '')}</small>
              {rec.sizeFlag && <small className="bd-note">{t('比例可能不对')}</small>}
            </dd>
            <dt>{t('接缝')}</dt>
            <dd>
              <small>
                {t('横纹')} {seamTxt(rec.seam?.u)} · {t('顺纹')} {seamTxt(rec.seam?.v === 'ok' ? 'ok' : 'fail')}
              </small>
            </dd>
          </>
        )}
      </dl>
      {row.proposal && !row.existingRec && (
        <div className={`bd-cat ${row.edits.accept ? 'is-on' : ''}`}>
          <span>
            <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
            {t('目录建议')}
          </span>
          <p>
            {[row.proposal.fields.name, row.proposal.fields.series ? t(row.proposal.fields.series) : '', row.proposal.fields.family ? t(row.proposal.fields.family) : '', row.proposal.entry.code].filter(Boolean).join(' · ')}
            <small> · {t({ code: '编号对上了', colour: '色号对上了', file: '整理目录时认出来的', name: '名字对上了' }[row.proposal.by])}</small>
            {!sureProposal(row.proposal) && !row.edits.accept && <small className="bd-note">{t('可能是 {0}（请对照实物）', [row.proposal.fields.code || row.proposal.entry.code || row.proposal.fields.name || '—'])}</small>}
            {acceptLevel(row) === 'bulk' && row.proposal.fields.code && row.proposal.fields.code !== row.parsed.code && <small className="bd-note">{t('目录编号 {0} 没有用（文件名里没有）：对照实物后按「采用这一行」', [row.proposal.fields.code])}</small>}
          </p>
          <button type="button" className="btn-line small" data-sfx={acceptLevel(row) === 'row' ? 'back' : 'apply'} onClick={() => onEdit(row.key, { accept: acceptLevel(row) === 'row' ? undefined : 'row' })}>
            {acceptLevel(row) === 'row' ? t('不用') : acceptLevel(row) === 'bulk' ? t('采用这一行') : t('采用')}
          </button>
        </div>
      )}
      <button type="button" className="bd-more" data-sfx="toggleOn" aria-expanded={more} onClick={() => setMore(!more)}>
        {t('更多：裁边 · 调整尺寸')}
        <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {more && row.res && (
        <div className="bd-more-body">
          <CropEditor row={row} onEdit={onEdit} />
          {rec && (
            <div className="bd-size">
              <span>{t('尺寸（毫米）')}</span>
              <TextCell value={rec.mm[0]} inputMode="numeric" width={64} label={t('横纹')} onCommit={(v) => +v > 0 && onEdit(row.key, { mm: [Math.round(+v), rec.mm[1]] })} />
              ×
              <TextCell value={rec.mm[1]} inputMode="numeric" width={64} label={t('顺纹')} onCommit={(v) => +v > 0 && onEdit(row.key, { mm: [rec.mm[0], Math.round(+v)] })} />
              <button type="button" className="btn-ghost so-mini" data-sfx="back" onClick={() => onEdit(row.key, { mm: undefined })}>
                <Undo2 size={14} strokeWidth={1.8} aria-hidden="true" />
                {t('自动')}
              </button>
            </div>
          )}
          <label className="bd-check">
            <input type="checkbox" checked={!!valueOf(row, 'skip')} onChange={(e) => onEdit(row.key, { skip: e.target.checked })} />
            {t('这张不导入')}
          </label>
          <label className="bd-check">
            <input type="checkbox" checked={!!valueOf(row, 'hidden')} onChange={(e) => onEdit(row.key, { hidden: e.target.checked })} />
            {t('隐藏（客人看不到，案例照样认得）')}
          </label>
          {row.res?.blobs && (
            <p className="bd-bytes">
              {t('做好了：1024 档 {0} · 256 档 {1} · 色卡 {2}', [fmtMB(row.res.blobs[1024]?.size || 0), fmtMB(row.res.blobs[256]?.size || 0), fmtMB(row.res.blobs.chip?.size || 0)])}
            </p>
          )}
        </div>
      )}
      <p className="bd-privacy">{t('原图不会离开这台电脑。')}</p>
    </aside>
  );
}

// ───────────────────────── 整页 ─────────────────────────

export default function BoardImporter({ onBack, onLibrary, flash, ask }) {
  const [phase, setPhase] = useState('start');
  const [listN, setListN] = useState(null);
  const listing = useMemo(() => ({ n: listN, set: setListN }), [listN]);
  const rowsRef = useRef([]);
  const [ver, setVer] = useState(0);
  const [selKey, setSelKey] = useState(null);
  const [filter, setFilter] = useState('all');
  const [others, setOthers] = useState([]);
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(null);
  const [saved, setSaved] = useState(null);
  const [shown, setShown] = useState(FIRST);
  const poolRef = useRef(null);
  const started = useRef(0);
  const doneAt = useRef([]);
  const renderTimers = useRef(new Map());
  const raf = useRef(0);
  const listRef = useRef(null);
  const savedRef = useRef(null);

  const bump = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setVer((v) => v + 1);
    });
  }, []);
  const rowOf = (key) => rowsRef.current.find((r) => r.key === key);
  const replace = (key, fn) => {
    const i = rowsRef.current.findIndex((r) => r.key === key);
    if (i < 0) return null;
    const next = fn(rowsRef.current[i]);
    rowsRef.current = [...rowsRef.current.slice(0, i), next, ...rowsRef.current.slice(i + 1)];
    bump();
    return next;
  };

  const pool = () => {
    if (!poolRef.current) poolRef.current = new WorkerPool({ make: () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), local: runTask, max: 4 });
    return poolRef.current;
  };
  useEffect(
    () => () => {
      poolRef.current?.destroy();
      cancelAnimationFrame(raf.current);
      cancelAnimationFrame(flushRaf.current);
      for (const tm of renderTimers.current.values()) clearTimeout(tm);
    },
    []
  );

  // 分析结果 / 员工改的：存到这台电脑的缓存（同一个文件夹再选一次，马上回到这里）
  const cacheRes = (row, out) => {
    const { blobs, ...meta } = out;
    cachePut([
      [row.key, meta],
      [`${row.key}|256`, blobs[256]],
      [`${row.key}|1024`, blobs[1024]],
      [`${row.key}|chip`, blobs.chip],
    ]);
  };
  const cacheEdits = (row) => cachePut([[`${row.key}|e`, row.edits]]);

  // worker 的结果先收着，每一帧并进表格一次（200 张图时不用每个结果都把整张表重排一次）
  const pending = useRef(new Map());
  const flushRaf = useRef(0);
  const flushResults = () => {
    flushRaf.current = 0;
    const got = pending.current;
    if (!got.size) return;
    pending.current = new Map();
    const done = [];
    rowsRef.current = rowsRef.current.map((r) => {
      const x = got.get(r.key);
      if (!x) return r;
      const next = x.out ? { ...r, res: x.out, error: null } : { ...r, error: x.error };
      if (x.out) done.push([next, x.out]);
      return next;
    });
    bump();
    // 存缓存（IndexedDB）放到下一个空闲时间，不和画面抢
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 30));
    idle(() => {
      for (const [row, out] of done) cacheRes(row, out);
    });
  };
  const queueResult = (key, x) => {
    pending.current.set(key, x);
    if (!flushRaf.current) flushRaf.current = requestAnimationFrame(flushResults);
  };
  const analyse = (row) => {
    const catalogKind = sureProposal(row.proposal) ? row.proposal.fields.kind || null : null;
    return pool()
      .run({ op: 'analyse', file: row.file, hint: row.parsed.catHint, hintStrength: row.parsed.hint, catalogKind, kind: row.edits.kind, rot: row.edits.rot, crop: row.edits.crop })
      .then((out) => {
        doneAt.current.push(performance.now());
        queueResult(row.key, { out });
      })
      .catch((e) => {
        if (String(e?.message) === 'cancelled') return;
        queueResult(row.key, { error: String(e?.message || e) });
      });
  };

  const rerender = (key) => {
    clearTimeout(renderTimers.current.get(key));
    renderTimers.current.set(
      key,
      setTimeout(() => {
        const row = rowOf(key);
        if (!row?.res) return;
        const kind = valueOf(row, 'kind');
        pool()
          .run({ op: 'render', file: row.file, kind, rot: valueOf(row, 'rot'), crop: valueOf(row, 'crop') }, { urgent: true })
          .then((out) => {
            const next = replace(key, (r) => ({ ...r, res: { ...r.res, ...out, stats: r.res.stats, hash: r.res.hash, decided: r.res.decided, grain: r.res.grain, border: r.res.border } }));
            if (next) cacheRes(next, next.res);
          })
          .catch(() => {});
      }, 350)
    );
  };

  const onEdit = useCallback((key, patch) => {
    const next = replace(key, (r) => {
      const edits = { ...r.edits };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete edits[k];
        else edits[k] = v;
      }
      // 改了类别：用在哪跟着类别的默认走（员工自己点过的不动）
      if ('kind' in patch && r.edits.uses === undefined) delete edits.uses;
      return { ...r, edits };
    });
    if (!next) return;
    cacheEdits(next);
    if ('kind' in patch || 'rot' in patch || 'crop' in patch) rerender(key);
    if ('seq' in patch || 'code' in patch || 'skip' in patch || 'accept' in patch) reassignSoon();
  }, []);

  /** 定 id（R8：和已有的板是同一块 → 用原来的 id）；分析完以后再定一次（有了像素指纹） */
  const known = useRef({ recs: [], taken: [] });
  const reassign = () => {
    const rows = rowsRef.current;
    const parsed = rows.map((r) => {
      const kind = valueOf(r, 'kind');
      return { ...r.parsed, warnings: r.parsed.warnings.filter((w) => !['seq-duplicate', 'code-duplicate', 'name-duplicate', 'copy', 'small-sample'].includes(w)), hash: r.res?.hash, px: r.res?.px, hex: r.res?.stats?.hex, kind: kind === 'ask' ? null : kind, seq: valueOf(r, 'seq'), code: valueOf(r, 'code') || null };
    });
    assignIds(parsed, { known: known.current.recs, taken: known.current.taken });
    rowsRef.current = rows.map((r, i) => ({
      ...r,
      id: parsed[i].id,
      existing: parsed[i].existing,
      matchedBy: parsed[i].matchedBy,
      existingRec: parsed[i].existing ? known.current.recs.find((x) => x.id === parsed[i].existing) : null,
      parsed: { ...r.parsed, warnings: parsed[i].warnings, sharedCode: parsed[i].sharedCode },
    }));
    markDupes(rowsRef.current);
    // 共用厂家编号：不导入的（副本、同一张图、小板）不算
    const byCode = new Map();
    for (const r of rowsRef.current) {
      const c = valueOf(r, 'code');
      if (c && !valueOf(r, 'skip')) byCode.set(c, [...(byCode.get(c) || []), r.id]);
    }
    rowsRef.current = rowsRef.current.map((r) => {
      const c = valueOf(r, 'code');
      const ids = c && !valueOf(r, 'skip') ? (byCode.get(c) || []).filter((x) => x !== r.id) : [];
      return { ...r, parsed: { ...r.parsed, sharedCode: ids.length ? ids : undefined } };
    });
    bump();
  };
  const reassignTimer = useRef(0);
  const reassignSoon = () => {
    clearTimeout(reassignTimer.current);
    reassignTimer.current = setTimeout(reassign, 120);
  };

  const onEntries = useCallback(async (entries, folderName) => {
    setListN(null);
    const imgs = [];
    const skip = [];
    for (const e of entries) {
      const name = basename(e.name);
      if (/^(thumbs\.db|desktop\.ini|\.ds_store)$/i.test(name) || name.startsWith('.')) continue;
      const p = parseBoardName(name);
      if (!p.image) skip.push({ name, why: p.warnings.includes('export-as-jpg') ? 'export-as-jpg' : 'not-an-image' });
      else imgs.push({ e, p });
    }
    if (!imgs.length) {
      flash(skip.length ? t('这个文件夹里没有 JPG / PNG 图片') : t('这个文件夹是空的'), 'error');
      return;
    }
    imgs.sort((a, b) => naturalCompare(a.p.stem, b.p.stem));
    // 随网站的板材也要认得（重新导入时认回原来的 id）：boardsReady 会把 library.js 那一块登记好
    const [seed, dev, taken] = await Promise.all([loadSeed(), deviceRecords(), knownIds(), boardsReady()]);
    const idx = indexSeed(seed);
    const bundled = BOARDS.map((m) => m.board?.rec).filter((r) => r && !dev.some((d) => d.id === r.id));
    known.current = { recs: [...dev, ...bundled], taken: [...taken] };
    let rows = imgs.map(({ e, p }) => ({
      key: fileKey(e.file),
      file: e.file,
      name: p.file,
      size: e.size,
      parsed: p,
      proposal: matchCatalog(p, idx),
      edits: {},
      res: null,
      error: null,
    }));
    // 做过的（同一个文件：名字 + 大小 + 修改时间）直接用
    const got = await cacheGet(rows.flatMap((r) => [r.key, `${r.key}|e`, `${r.key}|256`, `${r.key}|1024`, `${r.key}|chip`]));
    rows = rows.map((r) => {
      const meta = got.get(r.key);
      const blobs = { 256: got.get(`${r.key}|256`), 1024: got.get(`${r.key}|1024`), chip: got.get(`${r.key}|chip`) };
      const edits = got.get(`${r.key}|e`) || {};
      if (meta?.v === TASK_V && blobs[256] && blobs[1024] && blobs.chip) return { ...r, edits, res: { ...meta, blobs } };
      return { ...r, edits };
    });
    rowsRef.current = rows;
    reassign();
    setOthers(skip);
    setFolder(folderName || '');
    setPhase('work');
    setSaved(null);
    setShown(FIRST);
    setSelKey(null);
    sfx.play('open');
    started.current = performance.now();
    doneAt.current = [];
    const todo = rowsRef.current.filter((r) => !r.res);
    await Promise.all(todo.map((r) => analyse(r)));
    cancelAnimationFrame(flushRaf.current);
    flushResults();
    reassign();
  }, []);

  // 第一眼只画一屏，剩下的趁空闲补
  useEffect(() => {
    if (phase !== 'work') return undefined;
    if (shown >= rowsRef.current.length) return undefined;
    const id = (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(() => setShown((n) => n + STEP));
    return () => (window.cancelIdleCallback || clearTimeout)(id);
  }, [phase, shown, ver]);

  const onSel = useCallback((k) => {
    sfx.play('select');
    setSelKey(k);
  }, []);
  const rows = rowsRef.current;
  const density = useMemo(() => densityOf(rows), [ver]);
  const records = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.key, recOf(r, density));
    return m;
  }, [ver, density]);

  const done = rows.filter((r) => r.res || r.error).length;
  const total = rows.length;
  const analysing = done < total;
  const eta = useMemo(() => {
    const d = doneAt.current;
    if (d.length < 2 || !analysing) return null;
    const rate = (d.length - 1) / ((d[d.length - 1] - d[0]) / 1000);
    return rate > 0 ? (total - done) / rate : null;
  }, [ver]);
  const sorted = useMemo(() => sortRows(rows), [ver]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([f]) => [f, rows.filter((r) => passes(r, f)).length])), [ver]);
  const visible = sorted.filter((r) => passes(r, filter));
  const sel = selKey ? rowOf(selKey) : null;
  const ready = rows.filter((r) => records.get(r.key));
  const toSave = ready.filter((r) => !(r.existingRec && records.get(r.key).rev === (r.existingRec.rev || 1)));
  const askN = rows.filter((r) => !valueOf(r, 'skip') && warnsOf(r).some((c) => c === 'ask' || c === 'need-name')).length;
  const kinds = { wood: 0, solid: 0, stone: 0, weave: 0 };
  for (const r of ready) kinds[records.get(r.key).kind]++;
  const packMB = ready.reduce((s, r) => s + ((r.res.blobs[1024]?.size || 0) + (r.res.blobs[256]?.size || 0) + (r.res.blobs.chip?.size || 0)) * 1.34 + 1200, 0);
  // 「全部采用」只管编号 / 色号对上的建议；按文件名 / 名字猜的（可能是 XA-TP-13）要对照实物，一行一行按
  const catRows = useMemo(() => rows.filter((r) => sureProposal(r.proposal) && !r.edits.accept && !r.existingRec && Object.keys(catalogDiff({ code: valueOf(r, 'code'), name: { zh: valueOf(r, 'name').zh }, series: valueOf(r, 'series'), kind: valueOf(r, 'kind'), finish: valueOf(r, 'finish') }, r.proposal)).length), [ver]);
  const catN = catRows.length;
  const maybeN = useMemo(() => rows.filter((r) => r.proposal && !sureProposal(r.proposal) && !r.edits.accept && !r.existingRec).length, [ver]);

  const acceptAll = () => {
    for (const r of catRows) onEdit(r.key, { accept: 'bulk' });
    sfx.play('apply');
    flash(maybeN ? t('已采用 {0} 条编号对上的目录建议；另外 {1} 条是猜的，请对照实物一行一行看', [catN, maybeN]) : t('已采用 {0} 条编号对上的目录建议（可以一行一行改回去）', [catN]), 'ok', 5200);
  };

  const save = async () => {
    if (!ready.length) return null;
    if (askN) {
      const yes = await ask({ title: t('还有 {0} 张没选类别或没有名字', [askN]), body: t('这几张先不存（选好类别、起好名字再存一次就行）。'), ok: t('先存别的'), warn: true });
      if (!yes) return null;
    }
    // 同一个序号两块板：id 一存就不能改（sail-2 / sail-2-b），先让员工决定 —— 改序号，或者两个都留
    reassign();
    const dupRows = rowsRef.current.filter((r) => !valueOf(r, 'skip') && warnsOf(r).includes('seq-duplicate'));
    if (dupRows.length) {
      const seqs = [...new Set(dupRows.map((r) => valueOf(r, 'seq')))].sort((a, b) => a - b);
      const one = seqs.length === 1;
      const yes = await ask({
        title: one ? t('{0}号 有两块板', [seqs[0]]) : t('{0} 个序号都有两块板：{1}', [seqs.length, seqs.map((n) => t('{0}号', [n])).join(isEn() ? ', ' : '、')]),
        body: t('客人会看到两个一样的序号，而且板的 id 存了就不改。真的是两块不同的板就都留着；不是的话，先把序号改对（或者把其中一张设成不导入）。'),
        ok: one ? t('两个都留 {0}号', [seqs[0]]) : t('都留着'),
        cancel: t('先去改'),
        warn: true,
      });
      if (!yes) {
        setFilter('todo');
        setSelKey(dupRows[0].key);
        return null;
      }
      for (const r of dupRows) onEdit(r.key, { seqOk: true });
    }
    setBusy('save');
    try {
      reassign();
      const recs = [];
      const images = new Map();
      for (const r of rowsRef.current) {
        const rec = buildRecord(r, { density, materials: MATERIALS });
        if (!rec) continue;
        recs.push(rec);
        images.set(imageKey(rec.id, 256), r.res.blobs[256]);
        images.set(imageKey(rec.id, 1024), r.res.blobs[1024]);
        images.set(imageKey(rec.id, 'chip'), r.res.blobs.chip);
      }
      await saveDeviceBoards(recs, images);
      const dev = await deviceRecords();
      known.current.recs = [...dev, ...known.current.recs.filter((x) => !dev.some((d) => d.id === x.id))];
      known.current.taken = [...new Set([...known.current.taken, ...recs.map((r) => r.id)])];
      reassign();
      const ids = recs.map((r) => r.id);
      setSaved({ ids, n: recs.length });
      sfx.play('achievement');
      requestAnimationFrame(() => savedRef.current && fx.scan(savedRef.current, { sound: false }));
      return ids;
    } catch (e) {
      flash(t('没存成：{0}', [String(e?.message || e)]), 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    setBusy('export');
    try {
      const ids = saved?.ids || (await save());
      if (!ids?.length) return;
      setBusy('export');
      const parts = await exportPacks({ ids });
      if (!parts.length) return;
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

  if (phase === 'start')
    return (
      <div className="so-page bd-page">
        <Top onBack={onBack} />
        <Start onEntries={onEntries} listing={listing} />
      </div>
    );

  return (
    <div className="so-page is-work bd-page bd-imp">
      <Top onBack={onBack} folder={folder} />
      <ol className="bd-steps" aria-label={t('步骤')}>
        <li className="is-done">
          <Check size={14} strokeWidth={2.4} aria-hidden="true" />
          {folder ? t('选文件夹「{0}」', [folder]) : t('选图片')}
        </li>
        <li className={analysing ? 'is-now' : 'is-done'}>
          {analysing ? <span className="bd-ring" style={{ '--p': done / Math.max(1, total) }} /> : <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
          {t('分析 {0} / {1}', [done, total])}
          {analysing && eta != null && <small>{t('还要约 {0}', [fmtDur(eta)])}</small>}
        </li>
        <li className={saved ? 'is-done' : 'is-now'}>{t('确认名字、类别、用在哪')}</li>
        <li className={saved ? 'is-now' : ''}>{t('存到这台电脑 · 导出板材包')}</li>
      </ol>
      <div className="bd-sum">
        <p>
          {t('{0} 块板', [nf(ready.length)])} · {t('木纹 {0}', [kinds.wood])} · {t('纯色 {0}', [kinds.solid])} · {t('石纹 {0}', [kinds.stone])} · {t('编织 {0}', [kinds.weave])}
          {counts.todo > 0 && <span className="bd-tag is-warn">{t('{0} 张要处理', [counts.todo])}</span>}
          {others.length > 0 && <span className="bd-tag is-info" title={others.map((o) => o.name).join('\n')}>{t('{0} 个不是 JPG / PNG（已跳过）', [others.length])}</span>}
        </p>
        <span className="so-sp" />
        {catN > 0 && (
          <button type="button" className="btn-line small" data-sfx="apply" onClick={acceptAll}>
            <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />
            {t('全部采用目录建议（{0}）', [catN])}
          </button>
        )}
        <div className="chips so-filters" role="tablist" aria-label={t('筛选')} data-sfx="radio">
          {FILTERS.map(([id, zh]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>
              {t(zh)} <b>{counts[id] ?? 0}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="bd-work">
        <section className="bd-table" aria-label={t('板材')}>
          <div className="bd-head" aria-hidden="true">
            <span />
            <span>{t('序号')}</span>
            <span>{t('名字 · 提醒')}</span>
            <span>{t('厂家编号')}</span>
            <span>{t('类别')}</span>
            <span>{t('用在')}</span>
            <span>★</span>
          </div>
          {visible.length === 0 ? (
            <p className="mg-empty">{t('这里没有板。')}</p>
          ) : (
            <ul className="bd-rows" ref={listRef}>
              {visible.slice(0, shown).map((r) => (
                <Row key={r.key} row={r} rec={records.get(r.key)} sel={r.key === selKey} onSel={onSel} onEdit={onEdit} />
              ))}
            </ul>
          )}
          {others.length > 0 && filter === 'all' && (
            <details className="bd-others">
              <summary>{t('跳过的文件（{0}）', [others.length])}</summary>
              <ul>
                {others.map((o) => (
                  <li key={o.name}>
                    {o.name} <span className="bd-tag is-warn">{t(WARN_TEXT[o.why])}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
        <Detail row={sel} rec={sel ? records.get(sel.key) || buildRecord(sel, { density, materials: MATERIALS, preview: true }) : null} density={density} onEdit={onEdit} />
      </div>
      {saved && (
        <div className="bd-saved" ref={savedRef} role="status">
          <span className="bd-saved-ico" aria-hidden="true">
            <Check size={20} strokeWidth={2.2} />
          </span>
          <div>
            <b>{t('已存到这台电脑：{0} 块板', [saved.n])}</b>
            <p>{t('这台电脑的 3D 工作室现在就能用。导出板材包，发给负责的人合进网站，或者在店里的 iPad「员工 · 案例库 → 板材 → 导入板材包」。')}</p>
          </div>
          <a className="btn-line small" href={`studio.html?staff=1${isEn() ? '&lang=en' : ''}`} data-sfx="open" target="_blank" rel="noopener">
            <Rotate3d size={15} strokeWidth={1.8} aria-hidden="true" />
            {t('在 3D 里看看')}
          </a>
          <button type="button" className="btn-line small" data-sfx="open" onClick={onLibrary}>
            <Library size={15} strokeWidth={1.8} aria-hidden="true" />
            {t('去板材库')}
          </button>
        </div>
      )}
      <footer className="bd-bar">
        <p>{t('存到这台电脑后，这台电脑的 3D 工作室马上能用；导出的板材包（每个文件 ≤ 20 MB）发给负责的人合进网站，或在店里的 iPad 上「导入板材包」。')}</p>
        <button type="button" className="btn-line" data-sfx="confirm" disabled={!toSave.length || busy || analysing} onClick={save}>
          {busy === 'save' ? t('正在存…') : t('存到这台电脑（{0}）', [toSave.length])}
        </button>
        <button type="button" className="btn-primary" data-sfx="open" disabled={!ready.length || busy || analysing} onClick={doExport}>
          <Download size={17} strokeWidth={1.8} aria-hidden="true" />
          {busy === 'export' ? t('正在导出…') : t('导出板材包 · 约 {0}', [fmtMB(packMB)])}
        </button>
      </footer>
    </div>
  );
}

function Top({ onBack, folder }) {
  return (
    <header className="so-top">
      <button type="button" className="mg-home" data-sfx="back" aria-label={t('回到板材库')} onClick={onBack}>
        <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <h1>
        {t('板材导入')}
        <small>{t('员工')}</small>
      </h1>
      {folder && <span className="so-crumb">{t('只在这台电脑上处理，不上传')}</span>}
      <span className="so-sp" />
      <LangToggle compact />
    </header>
  );
}
