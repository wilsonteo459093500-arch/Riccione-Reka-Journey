// 案例库编辑器（员工）·「这个家用了」下面的溪岸板材（SPEC §4.3 + §8 R1 / R6 / R11）：
//   · 公司做的两个表面（柜体 · 门、墙板）各一行「溪岸板材（案例原板）」：设计师用了哪块就选哪块 —— 3D 先用这几块；
//     选了以后 case.materials 那一面自动写成这块板最接近的程序化材质（旧版本、手机、许愿之旅的配对看得懂）；
//   · 「这个案例还用了」：照片里看得到的别的板（例如织系列编织门：只是资料，不上 3D），最多 8 块；
//   · 案例整理记下「提到的材料」（罗维尔素岩03野径、XA-TP-01…）时：「文件夹里提到：… → 是不是这块？」，点一下就用。
// 板材库是空的也能用：直接打板号（23 / 23号 / 2810），先记下，板材包导入以后自动显示。
// 厂家编号（XA-TP-01）只在员工这里看得到；客人看到的永远是「序号 + 名字」。

import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderTree, Plus, Search, Star, X } from 'lucide-react';
import { t, L } from '../../shared/i18n.js';
import { sfx } from '../../shared/sfx.js';
import * as C from '../../shared/cases.js';
import { BOARDS, BOARD_SLOTS, MAT_BY_ID, fits, onBoards } from '../../shared/materials.js';
import { swatchURL } from '../../shared/textures.js';
import { boardsReady } from '../../shared/boards/device.js';
import { boardMatches } from '../../shared/boards/parse.js';
import { boardsForText } from '../../shared/boards/catalog.js';
import { factoryCode, idLabel, boardsOn } from '../../shared/boards/match.js';
import { get as sorterNote } from '../sorter/cache.js';
import './BoardPicker.css';

/** 表面的名字（和板材库「用在」一样的叫法） */
const SLOT_LABEL = { cabinetry: '柜体 · 门', feature: '墙板' };
const ALSO_MAX = 8;

const FILTERS = [
  ['all', '全部', () => true],
  ['fav', '★ 常用', (m) => m.board.fav],
  ['wood', '木纹', (m) => m.board.kind === 'wood'],
  ['solid', '纯色', (m) => m.board.kind === 'solid'],
  ['stone', '石纹', (m) => m.board.kind === 'stone'],
  ['weave', '编织', (m) => m.board.kind === 'weave'],
];

/** 这台设备的板材登记好了 / 变了（导入了板材包）→ 重新画 */
function useBoards() {
  const [v, setV] = useState(0);
  useEffect(() => {
    let alive = true;
    boardsReady()
      .then(() => alive && setV((n) => n + 1))
      .catch(() => {});
    const off = onBoards(() => alive && setV((n) => n + 1));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return v;
}

/** 色卡：真实板材的中间一块（没有贴图 = 近似色）；不认得的板 = 虚线框 */
function BoardChip({ id, size = 40, v }) {
  const m = MAT_BY_ID[id];
  const url = useMemo(() => {
    try {
      return m?.board ? swatchURL(id, 96) || '' : '';
    } catch {
      return '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, m, v]);
  return <i className={`mg-sw bp-sw ${m?.board ? '' : 'is-unknown'}`} style={{ width: size, height: size, backgroundImage: url ? `url(${url})` : 'none', backgroundColor: m?.board ? m.color : undefined }} aria-hidden="true" />;
}

const nameOf = (id) => (MAT_BY_ID[id]?.board ? L(MAT_BY_ID[id]) : idLabel(id));

/** 打的是板号但板材库里还没有：先记下（sail-23 / sail-c2810，和导入器给 id 的规则一样） */
function manualId(q) {
  const s = String(q || '')
    .normalize('NFKC')
    .trim();
  let m = /^(?:no\.?\s*)?(\d{1,3})\s*号?$/i.exec(s);
  if (m) return `sail-${+m[1]}`;
  m = /^(\d{4,6}|P\d{1,2})$/i.exec(s);
  if (m) return `sail-c${m[1].toLowerCase()}`;
  return null;
}

// ───────────────────────── 选板的面板 ─────────────────────────

function BoardSheet({ mode, value, also = [], onPick, onToggle, onClose }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const input = useRef(null);
  const forAlso = mode === 'also';
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (sfx.play('close'), onClose());
    window.addEventListener('keydown', onKey);
    // 电脑上直接打字找；触屏上不自动弹键盘
    if (!matchMedia?.('(pointer: coarse)').matches) input.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const pool = forAlso ? BOARDS : BOARDS.filter((m) => fits(m.id, mode));
  const filters = FILTERS.filter(([k, , fn]) => k === 'all' || pool.some(fn));
  const fn = (FILTERS.find(([k]) => k === f) || FILTERS[0])[2];
  const list = pool
    .filter((m) => fn(m) && boardMatches(m.board.rec, q))
    .sort((a, b) => (a.board.hidden ? 1 : 0) - (b.board.hidden ? 1 : 0) || (b.board.fav ? 1 : 0) - (a.board.fav ? 1 : 0));
  const manual = manualId(q);
  const offerManual = manual && !MAT_BY_ID[manual];
  const title = forAlso ? t('这个案例还用了哪些板') : t('选「{0}」的溪岸板材', [t(SLOT_LABEL[mode])]);
  const picked = (id) => (forAlso ? also.includes(id) : id === value);
  const choose = (id) => (forAlso ? onToggle(id) : onPick(id));
  return (
    <div className="mg-veil" onPointerDown={(e) => e.target === e.currentTarget && (sfx.play('close'), onClose())}>
      <div className="mg-sheet bp-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <b>{title}</b>
          <button type="button" className="mg-x" aria-label={t('关闭')} data-sfx="close" onClick={onClose}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>
        <div className="bp-tools">
          <label className="bp-search">
            <Search size={16} strokeWidth={1.8} aria-hidden="true" />
            <input ref={input} type="search" value={q} placeholder={t('序号、编号或名字（7、XA-TP-01、黑胡桃）')} aria-label={t('找板材')} onChange={(e) => setQ(e.target.value)} />
          </label>
          {filters.length > 2 && (
            <div className="chips bp-filters" role="radiogroup" aria-label={t('类别')}>
              {filters.map(([k, zh]) => (
                <button key={k} type="button" role="radio" aria-checked={f === k} className={`chip ${f === k ? 'on' : ''}`} onClick={() => setF(k)}>
                  {k === 'all' ? `${t(zh)} ${pool.length}` : t(zh)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mg-mats-body bp-body">
          {!pool.length && <p className="bp-empty">{t('这台设备的板材库还是空的：先到「板材 · Boards」导入板材文件夹或板材包。也可以直接打板号先记下。')}</p>}
          {pool.length > 0 && !list.length && !offerManual && <p className="bp-empty">{t('没有找到这块板。')}</p>}
          {offerManual && (
            <button type="button" className="bp-manual" data-sfx="chipAdd" onClick={() => choose(manual)}>
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              <span>{t('先记下 {0}（板材包导入后自动显示）', [idLabel(manual)])}</span>
            </button>
          )}
          <div className="mg-mats-grid bp-grid">
            {list.map((m) => {
              const on = picked(m.id);
              const code = factoryCode(m.id);
              return (
                <button key={m.id} type="button" className={`${on ? 'on' : ''} ${m.board.hidden ? 'is-hidden' : ''}`} aria-pressed={on} data-sfx={forAlso ? (on ? 'chipRemove' : 'chipAdd') : 'select'} onClick={() => choose(m.id)}>
                  <BoardChip id={m.id} size={56} />
                  <span className="bp-name">
                    {m.board.fav && <Star className="bp-star" size={11} strokeWidth={2} fill="currentColor" aria-label={t('常用')} />}
                    {L(m)}
                  </span>
                  {(code || m.board.hidden || m.board.kind === 'weave') && (
                    <small className="bp-meta">{[code, m.board.kind === 'weave' ? t('只是资料') : '', m.board.hidden ? t('已隐藏') : ''].filter(Boolean).join(' · ')}</small>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <footer className="bp-foot">
          {forAlso ? (
            <>
              <span className="bp-count">{t('已选 {0} / {1}', [also.length, ALSO_MAX])}</span>
              <button type="button" className="btn-primary small" data-sfx="confirm" onClick={onClose}>
                {t('完成')}
              </button>
            </>
          ) : (
            <button type="button" className="btn-line small" data-sfx="chipRemove" onClick={() => onPick(null)}>
              {t('不指定（3D 用最接近的板）')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ───────────────────────── 「文件夹里提到」 ─────────────────────────

/** 案例整理记下的「提到的材料」→ 板材库里最像的那一块（只给员工看，资料在这台电脑的 genie-sorter） */
function useMentions(caseId, v) {
  const [texts, setTexts] = useState([]);
  useEffect(() => {
    let alive = true;
    setTexts([]);
    if (caseId)
      sorterNote('notes', caseId)
        .then((n) => alive && setTexts((n?.boards || []).map((b) => `${b.name || ''}${b.variant || ''}${b.code ? ` ${b.code}` : ''}`.trim()).filter(Boolean)))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [caseId]);
  return useMemo(() => {
    if (!texts.length || !BOARDS.length) return [];
    const recs = BOARDS.map((m) => m.board.rec);
    const seen = new Set();
    const out = [];
    for (const text of texts) {
      const r = boardsForText(text, recs, { max: 1 })[0];
      if (r && !seen.has(r.id)) {
        seen.add(r.id);
        out.push({ text, id: r.id });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texts, v]);
}

// ───────────────────────── 编辑器里的那一块 ─────────────────────────

export default function BoardRows({ draft, patch, errors = [] }) {
  const v = useBoards();
  const [sheet, setSheet] = useState(null); // 'cabinetry' | 'feature' | 'also'
  const boards = draft.boards || {};
  const also = draft.boardsAlso || [];
  const used = new Set([...Object.values(boards), ...also]);
  const mentions = useMentions(draft.id, v).filter((x) => !used.has(x.id));
  const setBoard = (slot, id) => patch((d) => C.setCaseBoard(d, slot, id));
  const toggleAlso = (id) =>
    patch((d) => {
      const cur = d.boardsAlso || [];
      if (cur.includes(id)) d.boardsAlso = cur.filter((x) => x !== id);
      else if (cur.length < ALSO_MAX && !Object.values(d.boards || {}).includes(id)) d.boardsAlso = [...cur, id];
    });
  const empty = !BOARDS.length;
  if (!boardsOn()) return null; // CONFIG.boards.on = false：整个板材功能关掉
  return (
    <div className="bp" id="mg-f-boards">
      <p className="mg-sub">{t('溪岸板材（案例原板）')}</p>
      <p className="mg-hint">{t('设计师用了哪块板就选哪块：3D 会先用这几块，客人看到的是序号和名字。')}</p>
      <div className="bp-rows">
        {BOARD_SLOTS.map((slot) => {
          const id = boards[slot];
          const known = !!MAT_BY_ID[id]?.board;
          const code = known ? factoryCode(id) : '';
          return (
            <div key={slot} className={`bp-row ${id ? '' : 'is-empty'}`}>
              <button type="button" className={`mg-mat bp-mat ${id ? '' : 'is-inherit'}`} data-sfx="open" onClick={() => setSheet(slot)} aria-label={`${t(SLOT_LABEL[slot])} · ${id ? nameOf(id) : t('选板')}`}>
                {id ? <BoardChip id={id} size={36} v={v} /> : <i className="mg-sw bp-sw is-add" style={{ width: 36, height: 36 }} aria-hidden="true"><Plus size={16} strokeWidth={1.8} /></i>}
                <span>
                  <small>{t(SLOT_LABEL[slot])}</small>
                  <b>{id ? nameOf(id) : empty ? t('打板号先记下') : t('选板')}</b>
                  {code && <em className="bp-code">{code}</em>}
                  {id && !known && <em className="bp-warn">{t('还不在板材库里（导入板材包后会自动显示）')}</em>}
                </span>
              </button>
              {id && (
                <button type="button" className="bp-clear" aria-label={t('清除')} title={t('清除')} data-sfx="chipRemove" onClick={() => setBoard(slot, null)}>
                  <X size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mg-sub">{t('这个案例还用了')}</p>
      <div className="bp-also">
        {also.map((id) => (
          <span key={id} className={`bp-pill ${MAT_BY_ID[id]?.board ? '' : 'is-unknown'}`}>
            <BoardChip id={id} size={22} v={v} />
            <span>{nameOf(id)}</span>
            {factoryCode(id) && <small>{factoryCode(id)}</small>}
            <button type="button" aria-label={t('移除')} data-sfx="chipRemove" onClick={() => toggleAlso(id)}>
              <X size={12} strokeWidth={2.2} />
            </button>
          </span>
        ))}
        {also.length < ALSO_MAX && (
          <button type="button" className="mg-link bp-add" data-sfx="open" onClick={() => setSheet('also')}>
            <Plus size={14} strokeWidth={2} aria-hidden="true" /> {also.length ? t('再加一块') : t('加一块（例如织系列柜门）')}
          </button>
        )}
      </div>

      {mentions.length > 0 && (
        <div className="bp-mention" role="note">
          <FolderTree size={15} strokeWidth={1.8} aria-hidden="true" />
          <div>
            {mentions.map(({ text, id }) => {
              const slots = BOARD_SLOTS.filter((s) => fits(id, s) && !boards[s]);
              return (
                <div key={id} className="bp-mention-row">
                  <p>{t('文件夹里提到：{0} → 是不是这块？', [text])}</p>
                  <span className="bp-mention-b">
                    <BoardChip id={id} size={28} v={v} />
                    <b>{nameOf(id)}</b>
                    {factoryCode(id) && <small>{factoryCode(id)}</small>}
                  </span>
                  <span className="bp-mention-acts">
                    {slots.map((s) => (
                      <button key={s} type="button" className="mg-link" data-sfx="apply" onClick={() => setBoard(s, id)}>
                        {t('用在{0}', [t(SLOT_LABEL[s])])}
                      </button>
                    ))}
                    {also.length < ALSO_MAX && (
                      <button type="button" className="mg-link" data-sfx="chipAdd" onClick={() => toggleAlso(id)}>
                        {t('加到「还用了」')}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {errors.map((e, i) => (
        <p key={i} className="mg-err">
          {t(e.zh)}
        </p>
      ))}

      {sheet && (
        <BoardSheet
          mode={sheet}
          value={sheet === 'also' ? null : boards[sheet]}
          also={also}
          onClose={() => setSheet(null)}
          onPick={(id) => {
            setBoard(sheet, id);
            setSheet(null);
          }}
          onToggle={toggleAlso}
        />
      )}
    </div>
  );
}

