// 「导出给设计师」面板（只在设计师版：StudioApp 里 staffView && !WISH 才会打开；这个文件和整个导出代码一起懒加载）。
// 三种文件可以勾：AutoCAD 平面图 / 酷家乐户型（每层一个）/ SketchUp 3D（DAE + OBJ）；README 和清单 CSV 每次都有。
// 一个 zip（不压缩）下载到这台设备的「下载」里。全部在本机算：不联网、不读客人档案、不改方案。
// 许愿模式（客人在展厅 iPad 上）永远不出现：这里再拦一次 —— 什么都不画，直接关掉（exportBundle 那边也会报错）。
// 「文件包名称」：预填方案名（模板名、新方案不算），读进来的户型用平面图的名字；设计师可以改成客人名或地址。只用在文件里，不改方案。
// 面板和导出文件的英文在 en-export.js（不在四个页面共用的第一块里）：这个文件载入时并进词典。

import { useEffect, useRef, useState } from 'react';
// 图标只用 3D 工作室已经有的或只有这里用的：lucide 的 Layers 许愿之旅也在用，放这里会被拆成一个共用小块，客人的页面就多下载一个文件
import { DraftingCompass, LayoutGrid, Box, Download, Check, TriangleAlert, Info } from 'lucide-react';
import { Modal } from '../ui/kit.jsx';
import { t, isEn, addWords } from '../../shared/i18n.js';
import EXP from '../../shared/i18n/en-export.js';
import { isWishMode } from '../../shared/zen.js';
import { exportBundle } from './index.js';
import { defaultPackName, exportBase } from './names.js';
import './export.css';

addWords(EXP);

const KEY = 'genie.export.choices';
const ALL = { dxf: true, kujiale: true, model3d: true };

/** 这台设备上次勾的（读不到 → 全部勾上） */
function loadChoices() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') {
      const c = { dxf: v.dxf !== false, kujiale: v.kujiale !== false, model3d: v.model3d !== false };
      return c.dxf || c.kujiale || c.model3d ? c : { ...ALL };
    }
  } catch {
    /* 隐私模式 / 存储被关：用默认 */
  }
  return { ...ALL };
}
function saveChoices(c) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* 存不了就算了 */
  }
}

const OPTIONS = [
  { id: 'dxf', Ico: DraftingCompass, short: 'AutoCAD', title: 'AutoCAD 平面图', ext: '.dxf', body: '每一层的平面 · 柜子和家具（图块带尺寸、材质）· 主要尺寸。AutoCAD 直接打开，SketchUp 也能导入' },
  { id: 'kujiale', Ico: LayoutGrid, short: '酷家乐', title: '酷家乐户型', ext: '.dxf · 每层一个', body: '只有墙、门窗、房间名 —— 在酷家乐「导入 CAD 户型」里一层一层导入' },
  { id: 'model3d', Ico: Box, short: 'SketchUp', title: 'SketchUp 3D 模型', ext: '.dae + .obj', body: '墙、地面、柜子、家具都是真实大小，分好组；材质用我们的名字，换材质一眼找到' },
];

/** 进度里的 {0}（楼层名是 { zh, en }）→ 当前语言 */
const pick = (vars) => (vars || []).map((v) => (v && typeof v === 'object' ? (isEn() ? v.en : v.zh) : v));

const size = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** 出错时给设计师看的一句话 */
function reason(e) {
  if (e instanceof RangeError || /memory|allocation/i.test(String(e?.message))) return t('这台设备内存不够。关掉别的分页再试一次。');
  return String(e?.message || e || '?');
}

/**
 * @param {{ project: object, onClose: () => void, onToast?: (msg: string) => void }} p
 */
export default function ExportSheet({ project, onClose, onToast }) {
  const wish = isWishMode();
  const [choices, setChoices] = useState(loadChoices);
  const [name, setName] = useState(() => defaultPackName(project));
  const [phase, setPhase] = useState('idle'); // idle | busy | done | error
  const [prog, setProg] = useState({ done: 0, total: 1, label: '', vars: null });
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (wish) onClose?.();
    return () => {
      alive.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (wish) return null;

  const busy = phase === 'busy';
  const done = phase === 'done' && !!result;
  const zipName = `${exportBase(project, new Date(), name.trim())}.zip`;
  const any = choices.dxf || choices.kujiale || choices.model3d;

  const toggle = (id) => {
    if (busy) return;
    const c = { ...choices, [id]: !choices[id] };
    setChoices(c);
    saveChoices(c);
    if (phase !== 'idle') setPhase('idle');
  };

  const run = async () => {
    if (busy || !any || isWishMode()) return;
    setPhase('busy');
    setErr('');
    setResult(null);
    setProg({ done: 0, total: 1, label: '', vars: null });
    try {
      const r = await exportBundle(project, {
        ...choices,
        name: name.trim(),
        onProgress: (s) => alive.current && setProg(s),
      });
      if (!alive.current) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob);
      a.download = r.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setResult({ name: r.name, base: r.base, bytes: r.bytes.length, files: r.files });
      setPhase('done');
      onToast?.(t('文件包已下载'));
    } catch (e) {
      console.error('[export]', e);
      if (!alive.current) return;
      setErr(reason(e));
      setPhase('error');
    }
  };

  const pct = Math.round((100 * prog.done) / Math.max(1, prog.total));
  const short = (n) => (result?.base && n.startsWith(result.base) ? `…${n.slice(result.base.length)}` : n);

  return (
    <Modal eyebrow={t('给设计师')} title={t('导出 CAD 和 3D 文件')} onClose={busy ? undefined : onClose} className="exp-sheet">
      {done ? (
        // 下载好了：名字和三张卡收成一行（iPad 横放 / 手机上「再导出一次」和下面的提醒不用往下滚）；点一下回去改
        <button type="button" className="exp-sum" data-exp="change" onClick={() => setPhase('idle')}>
          <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          <span>{OPTIONS.filter((o) => choices[o.id]).map((o) => t(o.short)).join(' · ')}</span>
          <i>{t('更改')}</i>
        </button>
      ) : (
        <>
          <p className="m-p">{t('把这个概念交给设计师深化、出效果图：墙、门窗、柜子、家具都是真实尺寸，设计师在这个基础上画，就是客人想要的样子。')}</p>
          <label className="m-field exp-name">
            <span>{t('文件包名称')}</span>
            <input
              type="text"
              data-exp="name"
              value={name}
              maxLength={80}
              disabled={busy}
              placeholder={t('客户名或地址，例如 Tan · Setia Alam')}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
            <em>{zipName}</em>
          </label>
          <div className="exp-list">
            {OPTIONS.map(({ id, Ico, title, ext, body }) => (
              <button key={id} type="button" role="checkbox" aria-checked={choices[id]} className="exp-opt" data-exp={id} disabled={busy} onClick={() => toggle(id)}>
                <span className="exp-ico">
                  <Ico size={22} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span>
                  <b>
                    {t(title)}
                    <i>{t(ext)}</i>
                  </b>
                  <em>{t(body)}</em>
                </span>
                <span className="exp-tick">
                  <Check strokeWidth={2.5} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {phase === 'idle' && (
        <>
          <div className="exp-go">
            <button type="button" className="s-btn primary" data-exp="go" disabled={!any} onClick={run}>
              <Download size={18} strokeWidth={1.75} aria-hidden="true" />
              {t('下载文件包（.zip）')}
            </button>
          </div>
          {!any && <p className="exp-hint">{t('至少选一种文件')}</p>}
        </>
      )}

      {busy && (
        <div role="status" aria-live="polite">
          <div className="exp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="exp-step">{prog.label ? t(prog.label, pick(prog.vars)) : t('正在打包…')}</p>
        </div>
      )}

      {done && (
        <div role="status" aria-live="polite" data-exp="done">
          <p className="exp-done">
            <Check size={18} strokeWidth={2.25} aria-hidden="true" />
            {t('文件包已下载')}
          </p>
          <p className="m-fine">{t('在这台设备的「下载」里：')}</p>
          <ul className="exp-files">
            <li>
              <code>{result.name}</code>
              <span>{size(result.bytes)}</span>
            </li>
            {result.files.map((f) => (
              <li key={f.name}>
                <code>{short(f.name)}</code>
                <span>{size(f.bytes)}</span>
              </li>
            ))}
          </ul>
          <div className="exp-go" style={{ marginTop: 14 }}>
            <button type="button" className="s-btn ghost" onClick={run}>
              {t('再导出一次')}
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div role="alert">
          <p className="exp-err">
            <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
            {t('导出没成功：{0}', [err])}
          </p>
          <div className="exp-go">
            <button type="button" className="s-btn primary" disabled={!any} onClick={run}>
              {t('再试一次')}
            </button>
          </div>
        </div>
      )}

      <p className="exp-note">
        <Info size={15} strokeWidth={1.75} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 2 }} />
        <span>{t('文件包里有方案和客人的名字，只发给公司的设计师。概念示意，尺寸以现场量尺为准。')}</span>
      </p>
    </Modal>
  );
}
