// 上传平面图（IMPORT）：选页 → 找到图上的每一层 → 每层用原本的分辨率让 AI 读 → 拼成多层的方案 → 放进编辑器。
// 没有 AI（客人版没有 key）：同样选页，然后自己框出每一层 → 每层一张高清底图，在编辑器里描。不提 key、不提设置。
// 许愿模式不会打开这里（那里没有上传）。界面颜色只用 base.css 的变量。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { openPlanFile, pageThumb, findPlanPagesText, renderPage, renderRegion, closePlanFile, contactSheet, cropPixels, cvWalls } from './planImage.js';
import * as AI from './ai.js';
import * as WALLS from './walls.js';
import { assemblePlan, manualPlan, houseKind, knownMetres, lowResReport, cropBox, LEVELS, pageScale } from './sheet.js';
import { floorName, checkPlan } from './model.js';
import { loadSettings } from '../store.js';
import { t, isEn } from '../../shared/i18n.js';
import { Icon, useMedia, roomLabel } from '../ui/kit.jsx';

const LEVEL_ZH = { ground: '一楼', first: '二楼', second: '三楼', third: '四楼', mezzanine: '夹层', roof: '屋顶', other: '其他' };
const LEVEL_PICK = ['ground', 'first', 'second', 'third', 'mezzanine'];
const order = (lv) => (LEVELS.indexOf(lv) < 0 ? 99 : LEVELS.indexOf(lv));
const SEC_PER_FLOOR = 45; // pro 读一层大约 30–60 秒
const join = (xs) => xs.join(isEn() ? ', ' : '、');
const lvName = (lv) => t(LEVEL_ZH[lv] || '其他');
let seq = 0;
const key = () => `c${++seq}`;

/** 量一个元素的大小（预览图要放得下） */
function useSize(ref) {
  const [s, setS] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const up = () => setS({ w: el.clientWidth, h: el.clientHeight });
    up();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(up);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return s;
}

/** 整页预览 + 框（可以拖一个新框） */
function PageView({ page, boxes = [], drawing = false, onDraw, scanning = false, label }) {
  const wrap = useRef(null);
  const svg = useRef(null);
  const size = useSize(wrap);
  const [draft, setDraft] = useState(null);
  if (!page) return <div className="imp-pageview" ref={wrap} />;
  const ar = page.width / page.height;
  const w = Math.max(10, Math.min(size.w, size.h * ar));
  const h = w / ar;
  const toPx = (e) => {
    const r = svg.current.getBoundingClientRect();
    return { x: Math.min(page.width, Math.max(0, ((e.clientX - r.left) / r.width) * page.width)), y: Math.min(page.height, Math.max(0, ((e.clientY - r.top) / r.height) * page.height)) };
  };
  const down = (e) => {
    if (!drawing) return;
    e.preventDefault();
    svg.current.setPointerCapture?.(e.pointerId);
    const p = toPx(e);
    setDraft({ a: p, b: p });
  };
  const move = (e) => {
    if (!draft) return;
    setDraft((d) => d && { ...d, b: toPx(e) });
  };
  const up = () => {
    if (!draft) return;
    const r = { x0: Math.min(draft.a.x, draft.b.x), y0: Math.min(draft.a.y, draft.b.y), x1: Math.max(draft.a.x, draft.b.x), y1: Math.max(draft.a.y, draft.b.y) };
    setDraft(null);
    if (r.x1 - r.x0 > page.width * 0.02 && r.y1 - r.y0 > page.height * 0.02) onDraw?.(r);
  };
  const stroke = Math.max(page.width, page.height) / 400;
  return (
    <div className="imp-pageview" ref={wrap}>
      <div className={`imp-page ${scanning ? 'scan' : ''} ${drawing ? 'draw' : ''}`} style={{ width: w, height: h }}>
        <img src={page.src} alt={label || ''} draggable={false} />
        <svg ref={svg} viewBox={`0 0 ${page.width} ${page.height}`} preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDraft(null)}>
          {boxes.map((b) => (
            <g key={b.key} className={`imp-box ${b.tone || ''}`}>
              <rect x={b.rect.x0} y={b.rect.y0} width={b.rect.x1 - b.rect.x0} height={b.rect.y1 - b.rect.y0} strokeWidth={stroke * 1.4} />
              {b.label && (
                <text x={b.rect.x0 + stroke * 3} y={b.rect.y0 + stroke * 12} fontSize={stroke * 10}>
                  {b.label}
                </text>
              )}
            </g>
          ))}
          {draft && <rect className="imp-draft" x={Math.min(draft.a.x, draft.b.x)} y={Math.min(draft.a.y, draft.b.y)} width={Math.abs(draft.b.x - draft.a.x)} height={Math.abs(draft.b.y - draft.a.y)} strokeWidth={stroke * 1.4} />}
        </svg>
        {scanning && <div className="imp-sweep" aria-hidden="true" />}
      </div>
    </div>
  );
}

/** PDF 一页的小图（看到了才画） */
function Thumb({ src, n, on, hit, onPick }) {
  const ref = useRef(null);
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let alive = true;
    const load = () =>
      Promise.resolve(pageThumb(src, n))
        .then((u) => alive && setUrl(u))
        .catch(() => {});
    if (typeof IntersectionObserver !== 'function') {
      load();
      return () => {
        alive = false;
      };
    }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        load();
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [src, n]);
  return (
    <button type="button" ref={ref} className={`imp-thumb ${on ? 'on' : ''}`} onClick={() => onPick(n)} aria-pressed={on} data-page={n}>
      <span className="imp-thumb-img">{url ? <img src={url} alt="" draggable={false} /> : <i className="imp-thumb-ph" />}</span>
      <span className="imp-thumb-cap">{t('第 {0} 页', [n])}</span>
      {hit && <em className="imp-chip">{t('像是平面图')}</em>}
    </button>
  );
}

/** 读好的一层：小平面图（只用界面变量的颜色） */
function MiniPlan({ floor, underlay }) {
  const rooms = floor?.rooms || [];
  if (!rooms.length)
    return underlay?.src ? (
      <div className="imp-mini empty pic">
        <img src={underlay.src} alt="" draggable={false} />
        <span>{t('只有底图')}</span>
      </div>
    ) : (
      <div className="imp-mini empty">{t('只有底图')}</div>
    );
  const x0 = Math.min(...rooms.map((r) => r.x));
  const y0 = Math.min(...rooms.map((r) => r.y));
  const x1 = Math.max(...rooms.map((r) => r.x + r.w));
  const y1 = Math.max(...rooms.map((r) => r.y + r.d));
  const pad = 0.3;
  const W = x1 - x0 + pad * 2;
  const H = y1 - y0 + pad * 2;
  return (
    <svg className="imp-mini" viewBox={`${x0 - pad} ${y0 - pad} ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {rooms.map((r) => {
        const label = r.stairId ? '' : roomLabel(r);
        // 字按房间宽缩小（中文一个字 ≈ 1 em、英文 ≈ 0.58 em），太小就不写
        const em = [...label].reduce((a, ch) => a + (/[\u3000-\u9fff]/.test(ch) ? 1 : 0.58), 0) || 1;
        const fs = Math.min(0.42, (r.w * 0.86) / em, r.d * 0.45);
        return (
          <g key={r.id} className={`imp-mini-room t-${r.type}`}>
            <rect x={r.x} y={r.y} width={r.w} height={r.d} strokeWidth={Math.max(W, H) / 150} />
            {label && fs >= 0.16 && (
              <text x={r.x + r.w / 2} y={r.y + r.d / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle">
                {label}
              </text>
            )}
          </g>
        );
      })}
      {(floor.openings || []).map((o) => (
        <line key={o.id} className={`imp-mini-open k-${o.kind}`} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} strokeWidth={Math.max(W, H) / 70} />
      ))}
    </svg>
  );
}

export default function ImportFlow({ file, ai = false, current = null, onSettings, onCancel, onDone }) {
  const staff = typeof onSettings === 'function';
  const [step, setStep] = useState('open'); // open · pages · render · finding · found · reading · summary · manual · error
  const [src, setSrc] = useState(null);
  const [pageInfo, setPageInfo] = useState(null); // { hasText, pages: [{ page, score }] }
  const [aiPages, setAiPages] = useState(null); // Set（AI 在扫描的 PDF 里找到的页）
  const [onlyLikely, setOnlyLikely] = useState(false);
  const [sel, setSel] = useState(1);
  const [page, setPage] = useState(null);
  const [found, setFound] = useState(null);
  const [cards, setCards] = useState([]);
  const [unitPick, setUnitPick] = useState(null);
  const [crops, setCrops] = useState({ sig: '', map: {} });
  const [drawing, setDrawing] = useState(false);
  const [tipOk, setTipOk] = useState(false);
  const [reads, setReads] = useState({}); // key → { state, t0, t1, read, error, model, downgraded }
  const [result, setResult] = useState(null); // { plan, underlays, report }
  const [known, setKnown] = useState({ ref: 'width', text: '' });
  const [knownErr, setKnownErr] = useState('');
  const [busy, setBusy] = useState(''); // 一句话：正在做什么
  const [err, setErr] = useState(null); // { msg, code, where }
  const [now, setNow] = useState(Date.now());
  const [intoFloor, setIntoFloor] = useState('');
  const srcRef = useRef(null);
  const abortRef = useRef(null);
  const knownRef = useRef(null);
  const pixRef = useRef({}); // 卡片 key → { aspect, ink, walls }（图上的墙，读完以后算一次）
  const wide = useMedia('(min-width: 900px)');
  const settings = useMemo(() => loadSettings(), []);

  const friendly = useCallback(
    (e) => {
      const code = e?.code || '';
      if (code === 'cancel') return '';
      // 客人版：不提 key、模型、设置
      if (!staff && ['key', 'model', 'base', 'http', 'quota'].includes(code)) return t('AI 暂时用不了 —— 可以自己框出每一层');
      return e?.message ? t(String(e.message)) : t('读不出来：{0}', [String(e)]);
    },
    [staff],
  );

  // ── 打开文件 ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await openPlanFile(file);
        if (!alive) {
          closePlanFile(s);
          return;
        }
        srcRef.current = s;
        setSrc(s);
        if (s.kind === 'pdf' && s.pages > 1) {
          setStep('pages');
          const info = await findPlanPagesText(s);
          if (!alive) return;
          setPageInfo(info);
          const best = [...info.pages].filter((p) => p.score >= 5).sort((a, b) => b.score - a.score || a.page - b.page)[0];
          if (best) {
            setSel(best.page);
            setOnlyLikely(false);
          }
        } else {
          await openPage(s, 1);
        }
      } catch (e) {
        if (!alive) return;
        setErr({ msg: friendly(e) || t('读不出来：{0}', [String(e?.message || e)]), where: 'open' });
        setStep('error');
      }
    })();
    return () => {
      alive = false;
      abortRef.current?.abort();
      closePlanFile(srcRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // 读图时每秒走一次表
  useEffect(() => {
    if (step !== 'reading' && step !== 'finding') return undefined;
    const tm = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tm);
  }, [step]);

  // Esc = 取消
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') {
        if (drawing) setDrawing(false);
        else cancel();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const cancel = () => {
    abortRef.current?.abort();
    onCancel?.();
  };

  const newAbort = () => {
    abortRef.current?.abort();
    const c = new AbortController();
    abortRef.current = c;
    return c.signal;
  };

  // ── 选好一页 → 画出来 → 找平面图（AI）或自己框 ──
  async function openPage(s, n) {
    setStep('render');
    setBusy(t('正在打开第 {0} 页…', [n]));
    setErr(null);
    setFound(null);
    setCards([]);
    setCrops({ sig: '', map: {} });
    setReads({});
    setResult(null);
    setTipOk(false);
    setUnitPick(null);
    try {
      const pg = await renderPage(s, n);
      if (!pg) return;
      setPage(pg);
      setBusy('');
      if (ai) await find(pg, s);
      else {
        setStep('manual');
        setDrawing(true);
      }
    } catch (e) {
      setBusy('');
      setErr({ msg: friendly(e), where: 'open' });
      setStep('error');
    }
  }

  async function find(pg, s = srcRef.current) {
    setStep('finding');
    setErr(null);
    const t0 = Date.now();
    setReads({ __find: { t0 } });
    try {
      const r = await AI.findPlans(settings, pg, { signal: newAbort() });
      const plans = r.found.plans.map((p) => ({ key: key(), title: p.title, level: p.include ? p.level : '', box: p.box, crop: p.crop, unit: p.unit, single: !!p.single, ai: true }));
      setFound({ ...r.found, screenshot: r.found.screenshot || !!s?.screenshot });
      setCards(plans);
      setUnitPick(r.found.units.length > 1 ? '' : null);
      setStep('found');
      prepareCrops(plans.filter((c) => c.level), pg);
    } catch (e) {
      if (e?.code === 'cancel') return;
      setFound({ page: { x0: 0, y0: 0, x1: pg.width, y1: pg.height }, plans: [], units: [], others: [], screenshot: !!s?.screenshot });
      setCards([]);
      setErr({ msg: friendly(e), code: e?.code, where: 'find' });
      setStep('found');
    }
  }

  // ── 裁图：同一页的所有层用同一个比例（先在后台裁好，卡片用它；要读的那一组变了就重裁） ──
  const cropSig = (list) => JSON.stringify(list.map((c) => [c.key, Math.round(c.crop.x0), Math.round(c.crop.y0), Math.round(c.crop.x1), Math.round(c.crop.y1)]));
  const cropJob = useRef(null);
  async function prepareCrops(list, pg = page) {
    const sig = cropSig(list);
    if (!list.length) return {};
    if (crops.sig === sig) return crops.map;
    if (cropJob.current?.sig === sig) return cropJob.current.p;
    const p = renderRegion(srcRef.current, pg.page, list.map((c) => c.crop), pg).then((out) => {
      if (!out) return {};
      const map = {};
      list.forEach((c, i) => (map[c.key] = out[i]));
      setCrops((old) => (cropJob.current?.sig === sig ? { sig, map } : old));
      return map;
    });
    cropJob.current = { sig, p };
    return p;
  }

  const included = useMemo(() => cards.filter((c) => c.level && (!unitPick || !c.unit || c.unit === unitPick)).sort((a, b) => order(a.level) - order(b.level)), [cards, unitPick]);
  const dupLevel = useMemo(() => {
    const seen = new Set();
    for (const c of included) {
      if (seen.has(c.level)) return c.level;
      seen.add(c.level);
    }
    return null;
  }, [included]);

  // 一页上只有一户的平面图（公寓 TYPE B）：不叫「一楼」，叫它的户型名（或「这一层」）—— 存的还是第 0 层
  const unitName = (c) => c?.unit || (/TYPE\s+[A-Z0-9]+(\s*\([^)]*\))?/i.exec(c?.title || '') || [])[0] || t('这一层');
  const singleCard = included.length === 1 && included[0].single && included[0].level === 'ground' ? included[0] : null;
  const cardName = (c) => (singleCard && c === singleCard ? unitName(c) : lvName(c.level));
  // 读好的方案里的楼层名（只有一户 → 户型名）
  const fdisp = (plan, fid) => (singleCard && plan?.floors?.length === 1 ? unitName(singleCard) : t(floorName(plan, fid)));
  // 读好的方案自己检查一遍（和编辑器一样的提示）
  const issues = useMemo(() => {
    if (!result || result.report?.manual) return [];
    // 「没认出楼梯」已经有一句了：编辑器的「没有楼梯连到…」不再重复
    const said = new Set((result.report.warnings || []).map((w) => w.code));
    return checkPlan(result.plan).filter((x) => !(x.code === 'noStairs' && said.has('noStairs')));
  }, [result]);

  // 卡片改了（加框、改层、不要）：后台重新裁
  useEffect(() => {
    if (step !== 'found' || !page || !included.length) return;
    const tm = setTimeout(() => prepareCrops(included, page), 250);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, page, cropSig(included)]);

  const setLevel = (k, level) => setCards((cs) => cs.map((c) => (c.key === k ? { ...c, level } : c)));
  const swap = (k, dir) => {
    // 上移 / 下移 = 和相邻那张对调楼层
    const list = included;
    const i = list.findIndex((c) => c.key === k);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i];
    const b = list[j];
    setCards((cs) => cs.map((c) => (c.key === a.key ? { ...c, level: b.level } : c.key === b.key ? { ...c, level: a.level } : c)));
  };
  const addBox = (rect) => {
    setDrawing(false);
    const used = new Set(included.map((c) => c.level));
    const level = LEVEL_PICK.find((l) => !used.has(l)) || 'other';
    const pageRect = found?.page || { x0: 0, y0: 0, x1: page.width, y1: page.height };
    setCards((cs) => [...cs, { key: key(), title: '', level: level === 'other' ? '' : level, box: rect, crop: cropBox(rect, pageRect), unit: null, manual: true }]);
  };

  // ── 读每一层 ──
  const lowPre = useMemo(() => {
    if (!found || !page || !src) return null;
    const map = page.map;
    const srcW = (c) => (src.kind === 'pdf' ? 9999 : (c.box.x1 - c.box.x0) / map.scale);
    return lowResReport(included.map((c) => ({ srcPxW: srcW(c) })), { screenshot: found.screenshot });
  }, [found, page, src, included]);

  const ctxFor = (c, list) => ({
    title: c.title || (c.level === 'ground' ? 'GROUND FLOOR PLAN' : c.level === 'first' ? 'FIRST FLOOR PLAN' : 'FLOOR PLAN'),
    level: c.level,
    houseKind: houseKind({ plans: list.map((x) => ({ ...x, include: true })), units: unitPick ? [unitPick] : found?.units || [] }),
    otherTitles: [...list.filter((x) => x.key !== c.key).map((x) => x.title || lvName(x.level)), ...(found?.others || []).map((o) => o.kind.replace('_', ' '))].filter(Boolean),
  });

  async function readAll() {
    const list = included;
    if (!list.length) return;
    setStep('reading');
    setErr(null);
    const signal = newAbort();
    const init = {};
    for (const c of list) init[c.key] = { state: 'wait' };
    setReads(init);
    setBusy(t('正在裁出每一层…'));
    let map;
    try {
      map = await prepareCrops(list, page);
    } catch (e) {
      setBusy('');
      setErr({ msg: friendly(e), where: 'read' });
      return;
    }
    setBusy('');
    const items = list.map((c) => ({ key: c.key, image: map[c.key], ctx: ctxFor(c, list) }));
    try {
      const out = await AI.readFloors(settings, items, {
        signal,
        onProgress: (k, state, info) =>
          setReads((rs) => ({
            ...rs,
            [k]: state === 'start' ? { state: 'run', t0: Date.now() } : state === 'done' ? { ...rs[k], state: 'done', t1: Date.now(), read: info.read, model: info.model, downgraded: info.downgraded } : { ...rs[k], state: 'fail', t1: Date.now(), error: info },
          })),
      });
      const next = {};
      out.forEach((o) => (next[o.key] = o.ok ? { state: 'done', read: o.read, model: o.model, downgraded: o.downgraded } : { state: 'fail', error: o.error }));
      if (out.every((o) => o.ok)) finish(list, map, next);
    } catch (e) {
      if (e?.code === 'cancel') return;
      setErr({ msg: friendly(e), code: e?.code, where: 'read' });
    }
  }

  async function retry(c) {
    const list = included;
    const map = crops.map;
    setReads((rs) => ({ ...rs, [c.key]: { state: 'run', t0: Date.now() } }));
    try {
      const r = await AI.readFloor(settings, map[c.key], ctxFor(c, list), { signal: newAbort() });
      setReads((rs) => {
        const nx = { ...rs, [c.key]: { state: 'done', read: r.read, model: r.model, downgraded: r.downgraded } };
        maybeFinish(list, map, nx);
        return nx;
      });
    } catch (e) {
      if (e?.code === 'cancel') return;
      setReads((rs) => ({ ...rs, [c.key]: { state: 'fail', error: e } }));
    }
  }
  const resolveFail = (c, how) => {
    setReads((rs) => {
      const nx = { ...rs, [c.key]: { state: how } }; // 'skip' | 'trace'
      maybeFinish(included, crops.map, nx);
      return nx;
    });
  };
  function maybeFinish(list, map, rs) {
    if (list.every((c) => ['done', 'skip', 'trace'].includes(rs[c.key]?.state))) setTimeout(() => finish(list, map, rs), 0);
  }

  const floorsFor = (list, map, rs) =>
    list
      .filter((c) => rs[c.key]?.state !== 'skip')
      .map((c) => {
        const cr = map[c.key];
        const px = pixRef.current[c.key];
        return {
          key: c.key,
          level: c.level,
          title: c.title,
          read: rs[c.key]?.state === 'done' ? rs[c.key].read : null,
          cropW: cr.width,
          cropH: cr.height,
          src: cr.src,
          srcScale: cr.srcScale,
          photo: !!srcRef.current?.photo,
          walls: px?.walls || null,
          ink: px?.ink || null,
          page: page.page,
          box: [c.crop.x0 / page.width, c.crop.y0 / page.height, c.crop.x1 / page.width, c.crop.y1 / page.height].map((v) => Math.round(v * 1e4) / 1e4),
        };
      });

  const assembleWith = (list, map, rs, scale) => {
    const res = assemblePlan(floorsFor(list, map, rs), { screenshot: !!found?.screenshot, name: unitPick || '', scale, fuse: typeof WALLS.fuseWalls === 'function' ? WALLS.fuseWalls : null });
    // 只有一户的平面图（公寓 TYPE B）：这一层叫户型名（编辑器的楼层标签也是），不叫「一楼」
    const one = list.length === 1 && list[0].single && list[0].level === 'ground' ? list[0] : null;
    const nm = one && (one.unit || (/TYPE\s+[A-Z0-9]+(\s*\([^)]*\))?/i.exec(one.title || '') || [])[0]);
    if (nm && res.plan.floors.length === 1 && !res.plan.floors[0].name) res.plan.floors[0] = { ...res.plan.floors[0], name: String(nm).slice(0, 24) };
    return res;
  };

  /** 图上的墙：每层的裁图（照片按 aspect 拉方）→ 墨迹 + walls.js。读不出来就算了（退回按房间框铺） */
  async function readWalls(list, map, rs, scale) {
    for (const c of list) {
      if (rs[c.key]?.state !== 'done' || !map[c.key]) continue;
      const old = pixRef.current[c.key];
      if (old && Math.abs(old.aspect - scale.aspect) < 1e-6) continue;
      await new Promise((ok) => setTimeout(ok, 0)); // 让「正在…」先画出来
      try {
        const img = await cropPixels(map[c.key], { aspect: scale.aspect });
        // 墨迹 + 找墙：后台线程（iPad 上一层要 1–3 秒，界面不卡）；起不来就主线程做
        const { ink, walls } = await cvWalls(img, 1 / scale.mPerPx, WALLS);
        pixRef.current[c.key] = { aspect: scale.aspect, ink, walls };
      } catch {
        pixRef.current[c.key] = { aspect: scale.aspect, ink: null, walls: null };
      }
    }
  }

  async function finish(list, map, rs) {
    setBusy(t('正在对照图上的墙…'));
    let scale = null;
    try {
      scale = pageScale(floorsFor(list, map, rs));
      if (scale) await readWalls(list, map, rs, scale);
    } catch {
      scale = null;
    }
    setBusy('');
    const res = assembleWith(list, map, rs, scale && scale.source !== 'guess' ? scale : null);
    res.ctx = { list, map, rs };
    setResult(res);
    setStep('summary');
    setKnown({ ref: 'width', text: '' });
    setKnownErr('');
    // 只读了一层：默认放进同一层（一楼 → 一楼、二楼 → 二楼…）
    const idx = { ground: 0, mezzanine: 1, first: 1, second: 2, third: 3 }[list[0]?.level] ?? 0;
    const cf = current?.floors || [];
    setIntoFloor((cf[idx] || cf[0])?.id || '');
    if (res.report.scale && (res.report.scale.source !== 'dims' || res.report.warnings.some((w) => w.code === 'scaleFloors'))) setTimeout(() => knownRef.current?.focus(), 60);
  }

  // ── 填一个已知尺寸 → 全部楼层按它重新算 ──
  const applyKnown = () => {
    if (!result) return;
    const m = knownMetres(known.text);
    if (!m) {
      setKnownErr(t('看不懂这个尺寸：可以填 6.1、6100、20\' 或 20 ft'));
      return;
    }
    setKnownErr('');
    const g = result.plan.floors[0];
    let cur = null;
    if (known.ref === 'width') cur = result.report.scale?.widthM;
    else {
      const r = result.plan.floors.flatMap((f) => f.rooms).find((x) => x.id === known.ref);
      cur = r ? r.w : null;
    }
    if (!(cur > 0) || !g) return;
    if (result.report.manual) {
      setResult(manualFrom(result.ctx, m));
      return;
    }
    const k = result.report.scale.mPerPx * (m / cur);
    const res = assembleWith(result.ctx.list, result.ctx.map, result.ctx.rs, { mPerPx: k, source: 'known', aspect: result.report.scale.aspect || 1 });
    res.ctx = result.ctx;
    setResult(res);
  };

  // ── 自己框（没有 AI / AI 读不到） ──
  const manualBoxes = cards.filter((c) => c.manualOnly);
  const addManual = (rect) => {
    const used = new Set(manualBoxes.map((c) => c.level));
    const level = LEVEL_PICK.find((l) => !used.has(l)) || 'ground';
    const pageRect = { x0: 0, y0: 0, x1: page.width, y1: page.height };
    setCards((cs) => [...cs, { key: key(), title: '', level, box: rect, crop: cropBox(rect, pageRect), manualOnly: true }]);
  };
  const nextManual = LEVEL_PICK.find((l) => !manualBoxes.some((c) => c.level === l)) || null;

  function manualFrom(ctx, widthM) {
    const { list, map } = ctx;
    const floors = list.map((c) => {
      const cr = map[c.key];
      const sx = cr.width / (c.crop.x1 - c.crop.x0);
      const sy = cr.height / (c.crop.y1 - c.crop.y0);
      return {
        level: c.level,
        title: c.title,
        cropW: cr.width,
        cropH: cr.height,
        src: cr.src,
        page: page.page,
        box: [c.crop.x0 / page.width, c.crop.y0 / page.height, c.crop.x1 / page.width, c.crop.y1 / page.height].map((v) => Math.round(v * 1e4) / 1e4),
        house: { x0: (c.box.x0 - c.crop.x0) * sx, y0: (c.box.y0 - c.crop.y0) * sy, x1: (c.box.x1 - c.crop.x0) * sx, y1: (c.box.y1 - c.crop.y0) * sy },
      };
    });
    const res = manualPlan(floors, { widthM });
    res.ctx = ctx;
    return res;
  }

  async function finishManual() {
    const list = [...manualBoxes].sort((a, b) => order(a.level) - order(b.level));
    if (!list.length) return;
    setBusy(t('正在裁出每一层…'));
    try {
      const map = await prepareCrops(list, page);
      setBusy('');
      const res = manualFrom({ list, map, rs: {} }, knownMetres(known.text));
      setResult(res);
      setStep('summary');
      setIntoFloor(current?.floors?.[0]?.id || '');
    } catch (e) {
      setBusy('');
      setErr({ msg: friendly(e), where: 'manual' });
    }
  }

  const toManual = () => {
    abortRef.current?.abort();
    setErr(null);
    setCards((cs) => cs.filter((c) => c.manualOnly));
    setStep('manual');
    setDrawing(true);
  };

  // ── 扫描的 PDF：让 AI 看所有页 ──
  async function aiFindPages() {
    setBusy(t('AI 正在看每一页…'));
    setErr(null);
    try {
      const sheet = await contactSheet(srcRef.current);
      if (!sheet) return;
      const pages = await AI.findPlanPagesAI(settings, sheet, { pages: srcRef.current.pages, signal: newAbort() });
      setAiPages(new Set(pages.map((p) => p.page)));
      if (pages.length) setSel(pages[0].page);
      else setErr({ msg: t('AI 没找到平面图的页：自己点那一页'), where: 'pages' });
    } catch (e) {
      if (e?.code !== 'cancel') setErr({ msg: friendly(e), where: 'pages' });
    } finally {
      setBusy('');
    }
  }

  const done = (mode) => {
    if (!result) return;
    if (mode === 'into') {
      const f0 = result.plan.floors[0];
      onDone?.({ plan: { ...result.plan, floors: [f0], stairs: [] }, underlays: result.underlays[f0.id] ? { [f0.id]: result.underlays[f0.id] } : {}, report: result.report, mode: 'into', floorId: intoFloor });
    } else onDone?.({ plan: result.plan, underlays: result.underlays, report: result.report, mode: 'replace', floorId: result.plan.floors[0]?.id });
  };

  // ───────────── 画面 ─────────────

  const likely = useMemo(() => {
    const s = new Set();
    for (const p of pageInfo?.pages || []) if (p.score >= 5) s.add(p.page);
    for (const p of aiPages || []) s.add(p);
    return s;
  }, [pageInfo, aiPages]);
  const pageList = useMemo(() => {
    const n = src?.pages || 0;
    const all = Array.from({ length: n }, (_, i) => i + 1);
    const hits = all.filter((p) => likely.has(p));
    const rest = all.filter((p) => !likely.has(p));
    return onlyLikely && hits.length ? hits : [...hits, ...rest];
  }, [src, likely, onlyLikely]);

  const steps = ai ? ['选页', '找图', '读图', '完成'] : ['选页', '框图', '完成'];
  const stepIdx = { open: 0, pages: 0, render: 0, error: 0, finding: 1, found: 1, manual: 1, reading: 2, summary: ai && !result?.report?.manual ? 3 : 2 }[step] ?? 0;

  const head = (
    <header className="imp-head">
      <div className="imp-title">
        <b>{t('上传平面图')}</b>
        <span>{file?.name || ''}</span>
      </div>
      <ol className="imp-steps" aria-label={t('步骤')}>
        {steps.map((s, i) => (
          <li key={s} className={i === stepIdx ? 'on' : i < stepIdx ? 'past' : ''}>
            {t(s)}
          </li>
        ))}
      </ol>
      <button type="button" className="pe-btn ghost imp-close" onClick={cancel} aria-label={t('取消')}>
        <Icon name="close" size={20} />
        <span>{t('取消')}</span>
      </button>
    </header>
  );

  const errBox = err && (
    <div className="imp-err" role="alert">
      <Icon name="warn" size={18} />
      <span>{err.msg}</span>
      {staff && err.code === 'key' && (
        <button type="button" className="pe-btn" onClick={() => onSettings()}>
          <Icon name="gear" size={16} />
          {t('设置')}
        </button>
      )}
    </div>
  );

  const noKeyHint = !ai && staff && (
    <p className="imp-note">
      {t('填了 Gemini API key，AI 就能帮你读平面图。')}{' '}
      <button type="button" className="imp-link" onClick={() => onSettings()}>
        {t('去设置')}
      </button>
    </p>
  );

  let body = null;
  let foot = null;

  if (step === 'open' || step === 'render') {
    body = (
      <div className="imp-center" role="status">
        <div className="boot-ring" />
        <p>{busy || t('正在打开文件…')}</p>
      </div>
    );
  } else if (step === 'error') {
    body = (
      <div className="imp-center">
        {errBox}
        <button type="button" className="pe-btn" onClick={cancel}>
          {t('关闭')}
        </button>
      </div>
    );
  } else if (step === 'pages') {
    const scanned = pageInfo && !pageInfo.hasText;
    body = (
      <div className="imp-pages">
        <div className="imp-bar">
          <h2>{t('这份 PDF 有 {0} 页 —— 选有平面图的那一页', [src?.pages || 0])}</h2>
          <div className="imp-bar-acts">
            {likely.size > 0 && (
              <label className="imp-toggle">
                <input type="checkbox" checked={onlyLikely} onChange={(e) => setOnlyLikely(e.target.checked)} />
                <span>{t('只看可能的页')}</span>
              </label>
            )}
            {ai && scanned && (
              <button type="button" className="pe-btn ai" onClick={aiFindPages} disabled={!!busy}>
                <Icon name="sparkles" size={17} />
                {t('让 AI 找')}
              </button>
            )}
          </div>
        </div>
        {!pageInfo && <p className="imp-note">{t('正在看哪几页像平面图…')}</p>}
        {scanned && !aiPages && <p className="imp-note">{ai ? t('这份 PDF 是扫描的，认不出字：让 AI 找，或者自己点有平面图的那一页。') : t('这份 PDF 是扫描的，认不出字：自己点有平面图的那一页。')}</p>}
        {busy && (
          <p className="imp-note busy" role="status">
            <span className="boot-ring small" />
            {busy}
          </p>
        )}
        {errBox}
        <div className="imp-grid">
          {src && pageList.map((n) => <Thumb key={n} src={src} n={n} on={sel === n} hit={likely.has(n)} onPick={setSel} />)}
        </div>
      </div>
    );
    foot = (
      <>
        {noKeyHint}
        <button type="button" className="pe-btn gold" onClick={() => openPage(src, sel)} disabled={!!busy}>
          {t('用第 {0} 页', [sel])}
          <Icon name="chevron" size={18} />
        </button>
      </>
    );
  } else if (step === 'finding') {
    const secs = Math.max(0, Math.round((now - (reads.__find?.t0 || now)) / 1000));
    body = (
      <div className="imp-split">
        <PageView page={page} scanning label={t('第 {0} 页', [page?.page || 1])} />
        <aside className="imp-side">
          <div className="imp-center small" role="status">
            <div className="boot-ring" />
            <p>{t('正在找图上的平面图…')}</p>
            <span className="imp-secs">{t('{0} 秒', [secs])}</span>
          </div>
        </aside>
      </div>
    );
    foot = (
      <button type="button" className="pe-btn" onClick={toManual}>
        {t('自己框')}
      </button>
    );
  } else if (step === 'found') {
    const n = included.length;
    const boxes = cards.map((c) => ({ key: c.key, rect: c.box, label: c.level ? cardName(c) : t('不要'), tone: included.includes(c) ? 'on' : 'off' }));
    const showTip = (found?.screenshot || lowPre?.lowRes) && !tipOk;
    body = (
      <div className="imp-split">
        <PageView page={page} boxes={boxes} drawing={drawing} onDraw={addBox} label={t('第 {0} 页', [page?.page || 1])} />
        <aside className="imp-side">
          {errBox}
          {err?.where === 'find' ? (
            <div className="imp-actions-col">
              <button type="button" className="pe-btn" onClick={() => find(page)}>
                <Icon name="refresh" size={17} />
                {t('重试')}
              </button>
              <button type="button" className="pe-btn" onClick={toManual}>
                {t('自己框')}
              </button>
              {src?.kind === 'pdf' && src.pages > 1 && (
                <button type="button" className="pe-btn ghost" onClick={() => setStep('pages')}>
                  {t('换一页')}
                </button>
              )}
            </div>
          ) : (
            <h2 className="imp-found">{n ? t('找到 {0} 张平面图：{1}', [n, join(included.map((c) => cardName(c)))]) : t('这一页没找到平面图')}</h2>
          )}
          {showTip && (
            <div className="imp-tip" role="note">
              <Icon name="info" size={18} />
              <div>
                {src?.photo ? (
                  <p>{t('这是拍的照片：已经自动拉正。照片读出来的墙和尺寸可能不太准；有原本的 PDF（例如从 HIMS 下载的那份）的话，上传那一页会准很多。')}</p>
                ) : (
                  <p>{t('这是手机截图：每层平面图只有约 {0} 像素宽，图上的尺寸读不清。最好上传原本的 PDF（例如从 HIMS 下载的那份），选那一页 —— 会准很多。', [lowPre?.planPx || 0])}</p>
                )}
                {src?.photo && <p className="imp-tip-sub">{t('拍照时手机和纸要平行')}</p>}
                <div className="imp-tip-acts">
                  <button type="button" className="pe-btn" onClick={() => setTipOk(true)}>
                    {src?.photo ? t('继续用照片') : t('继续用截图')}
                  </button>
                  <button type="button" className="pe-btn ghost" onClick={cancel}>
                    {t('换一个文件')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {unitPick !== null && (found?.units || []).length > 1 && (
            <div className="imp-units">
              <p>{t('这一页有 {0} 种户型：选一种', [found.units.length])}</p>
              <div className="imp-chips">
                {found.units.map((u) => (
                  <button key={u} type="button" className={`imp-chip-btn ${unitPick === u ? 'on' : ''}`} onClick={() => setUnitPick(u)} aria-pressed={unitPick === u}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="imp-cards">
            {cards
              .filter((c) => !unitPick || !c.unit || c.unit === unitPick)
              .sort((a, b) => (a.level ? order(a.level) : 98) - (b.level ? order(b.level) : 98))
              .map((c) => {
                const crop = crops.map[c.key];
                const idx = included.indexOf(c);
                return (
                  <li key={c.key} className={`imp-card ${c.level ? '' : 'off'}`} data-level={c.level || 'none'}>
                    <div className="imp-card-img">{crop ? <img src={crop.src} alt="" draggable={false} /> : <span className="boot-ring small" />}</div>
                    <div className="imp-card-body">
                      <b className="imp-card-title">{c.title || (c.manual ? t('自己框的') : t('平面图'))}</b>
                      {c.unit && <span className="imp-card-unit">{c.unit}</span>}
                      <label className="pe-select imp-level">
                        <span className="pe-select-label" aria-hidden="true">{c.level ? cardName(c) : t('不要')}</span>
                        <Icon name="down" size={14} className="pe-select-chev" />
                        <select value={c.level} onChange={(e) => setLevel(c.key, e.target.value)} aria-label={t('楼层')}>
                          {LEVEL_PICK.map((l) => (
                            <option key={l} value={l}>
                              {lvName(l)}
                            </option>
                          ))}
                          <option value="">{t('不要')}</option>
                        </select>
                      </label>
                      {c.level && n > 1 && (
                        <div className="imp-card-move">
                          <button type="button" className="imp-mini-btn" onClick={() => swap(c.key, -1)} disabled={idx <= 0} aria-label={t('往下一层')} title={t('往下一层')}>
                            <Icon name="down" size={16} />
                          </button>
                          <button type="button" className="imp-mini-btn up" onClick={() => swap(c.key, 1)} disabled={idx < 0 || idx >= n - 1} aria-label={t('往上一层')} title={t('往上一层')}>
                            <Icon name="down" size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
          {dupLevel && <p className="imp-warn">{t('两张图都是{0}：改一张，或者不要其中一张', [lvName(dupLevel)])}</p>}
          <button type="button" className={`pe-btn ${drawing ? 'primary' : ''} imp-add`} onClick={() => setDrawing((d) => !d)} aria-pressed={drawing}>
            <Icon name="room" size={17} />
            {drawing ? t('在图上拖一个框') : t('加一张（自己框）')}
          </button>
        </aside>
      </div>
    );
    foot = (
      <>
        {src?.kind === 'pdf' && src.pages > 1 && (
          <button type="button" className="pe-btn ghost" onClick={() => setStep('pages')}>
            {t('换一页')}
          </button>
        )}
        <button type="button" className="pe-btn gold" onClick={readAll} disabled={!n || !!dupLevel || showTip || (unitPick === '' && (found?.units || []).length > 1)}>
          <Icon name="sparkles" size={17} />
          {t('读这 {0} 层（约 {1} 秒）', [n, Math.ceil(n / 2) * SEC_PER_FLOOR])}
        </button>
      </>
    );
  } else if (step === 'reading') {
    const list = included;
    const allDone = list.every((c) => ['done', 'skip', 'trace'].includes(reads[c.key]?.state));
    const down = list.some((c) => reads[c.key]?.downgraded);
    body = (
      <div className="imp-split">
        <PageView page={page} boxes={list.map((c) => ({ key: c.key, rect: c.box, label: cardName(c), tone: reads[c.key]?.state === 'done' ? 'ok' : 'on' }))} scanning={!allDone} label={t('第 {0} 页', [page?.page || 1])} />
        <aside className="imp-side">
          {busy && (
            <p className="imp-note busy" role="status">
              <span className="boot-ring small" />
              {busy}
            </p>
          )}
          {errBox}
          {down && <p className="imp-warn">{t('Pro 模型的额度用完了，已改用 Flash（可能没那么准）')}</p>}
          <ul className="imp-cards">
            {list.map((c, i) => {
              const r = reads[c.key] || { state: 'wait' };
              const secs = r.t0 ? Math.max(0, Math.round(((r.t1 || now) - r.t0) / 1000)) : 0;
              const crop = crops.map[c.key];
              return (
                <li key={c.key} className={`imp-card st-${r.state}`} data-level={c.level}>
                  <div className="imp-card-img">{crop ? <img src={crop.src} alt="" draggable={false} /> : <span className="boot-ring small" />}</div>
                  <div className="imp-card-body">
                    <b className="imp-card-title">{cardName(c)}</b>
                    {r.state === 'wait' && <span className="imp-state">{t('排队中…')}</span>}
                    {r.state === 'run' && (
                      <span className="imp-state run" role="status">
                        <span className="boot-ring small" />
                        {t('AI 正在读{0}（{1} / {2}）… {3} 秒', [cardName(c), i + 1, list.length, secs])}
                      </span>
                    )}
                    {r.state === 'done' && (
                      <span className="imp-state ok">
                        <Icon name="ok" size={16} />
                        {t('读好了：{0} 个房间', [(r.read?.rooms || []).length])}
                      </span>
                    )}
                    {r.state === 'skip' && <span className="imp-state">{t('不要这一层')}</span>}
                    {r.state === 'trace' && <span className="imp-state">{t('只放底图，自己描')}</span>}
                    {r.state === 'fail' && (
                      <>
                        <span className="imp-state bad">{friendly(r.error)}</span>
                        <div className="imp-card-acts">
                          <button type="button" className="pe-btn" onClick={() => retry(c)}>
                            <Icon name="refresh" size={16} />
                            {t('重试')}
                          </button>
                          <button type="button" className="pe-btn ghost" onClick={() => resolveFail(c, 'skip')}>
                            {t('跳过')}
                          </button>
                          <button type="button" className="pe-btn ghost" onClick={() => resolveFail(c, 'trace')}>
                            {t('自己描')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    );
    foot = (
      <button type="button" className="pe-btn" onClick={() => (abortRef.current?.abort(), setStep('found'))}>
        {t('返回')}
      </button>
    );
  } else if (step === 'manual') {
    const boxes = manualBoxes.map((c) => ({ key: c.key, rect: c.box, label: lvName(c.level), tone: 'on' }));
    body = (
      <div className="imp-split">
        <PageView page={page} boxes={boxes} drawing={drawing && !!nextManual} onDraw={addManual} label={t('第 {0} 页', [page?.page || 1])} />
        <aside className="imp-side">
          {errBox}
          <h2 className="imp-found">{manualBoxes.length < 2 && nextManual ? t('框出{0}', [lvName(nextManual)]) : t('框好了 {0} 层', [manualBoxes.length])}</h2>
          {manualBoxes.length === 1 && <p className="imp-note">{t('只有一层？直接放进编辑器。')}</p>}
          {manualBoxes.length >= 2 && nextManual && <p className="imp-note">{t('还有{0}？再拖一个框。', [lvName(nextManual)])}</p>}
          <p className="imp-note">{t('沿着外墙拖一个框（不要包括尺寸线）。每一层框一个，放进编辑器当底图，再沿着墙描。')}</p>
          <ul className="imp-cards">
            {manualBoxes
              .slice()
              .sort((a, b) => order(a.level) - order(b.level))
              .map((c) => (
                <li key={c.key} className="imp-card compact" data-level={c.level}>
                  <div className="imp-card-body">
                    <label className="pe-select imp-level">
                      <span className="pe-select-label" aria-hidden="true">{lvName(c.level)}</span>
                      <Icon name="down" size={14} className="pe-select-chev" />
                      <select value={c.level} onChange={(e) => setLevel(c.key, e.target.value)} aria-label={t('楼层')}>
                        {LEVEL_PICK.map((l) => (
                          <option key={l} value={l}>
                            {lvName(l)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="imp-mini-btn" onClick={() => setCards((cs) => cs.filter((x) => x.key !== c.key))} aria-label={t('删除')} title={t('删除')}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </li>
              ))}
          </ul>
          <label className="imp-known">
            <span>{t('整体宽（选填）')}</span>
            <input value={known.text} onChange={(e) => setKnown({ ref: 'width', text: e.target.value })} placeholder="6.1 / 6100 / 20'" inputMode="decimal" />
          </label>
          {busy && (
            <p className="imp-note busy" role="status">
              <span className="boot-ring small" />
              {busy}
            </p>
          )}
        </aside>
      </div>
    );
    foot = (
      <>
        {noKeyHint}
        {src?.kind === 'pdf' && src.pages > 1 && (
          <button type="button" className="pe-btn ghost" onClick={() => setStep('pages')}>
            {t('换一页')}
          </button>
        )}
        <button type="button" className="pe-btn gold" onClick={finishManual} disabled={!manualBoxes.length || !!busy}>
          {t('放进编辑器')}
          <Icon name="chevron" size={18} />
        </button>
      </>
    );
  } else if (step === 'summary' && result) {
    const rep = result.report;
    const sc = rep.scale || {};
    const fixes = (rep.floors || []).reduce((a, f) => ({ o: a.o + (f.fixes?.overlaps || 0), g: a.g + (f.fixes?.filled || 0) + (f.fixes?.absorbed || 0) }), { o: 0, g: 0 });
    // 图上的墙：墙优先（walls.js 有把握）或者按墨迹查过（低清）
    const wr = (rep.floors || []).map((f) => f.walls).filter(Boolean);
    const wallsFirst = wr.some((w) => !w.lowQuality);
    const doorsDropped = wr.reduce((a, w) => a + (w.doorsRemoved ?? w.doorsDropped ?? 0), 0);
    const openConn = wr.reduce((a, w) => a + (w.openConnections || 0), 0);
    const hasRooms = (current?.floors || []).some((f) => f.rooms.some((r) => !r.stairId));
    // L 形房间的第二块（id 结尾 -2、-3）不重复列
    const roomsForRef = result.plan.floors.flatMap((f) => f.rooms.filter((r) => !r.stairId && !/-\d+$/.test(r.id) && !['porch', 'balcony', 'corridor', 'stair', 'void'].includes(r.type)).map((r) => ({ r, f })));
    const refRoom = roomsForRef.find(({ r }) => r.id === known.ref);
    const refLabel = refRoom ? t('{0} · {1} 的宽', [fdisp(result.plan, refRoom.f.id), roomLabel(refRoom.r)]) : t('整体宽');
    const nF = result.plan.floors.length;
    // 每两层之间正好一座楼梯 → 「已对齐（按楼梯）」才打勾
    const stairPairsOk = nF > 1 && result.plan.floors.slice(1).every((f, i) => result.plan.stairs.filter((st) => st.from === result.plan.floors[i].id && st.to === f.id).length === 1);
    const alignedText = rep.aligned === 'stairs' ? (nF === 2 ? t('两层已对齐（按楼梯）') : t('{0} 层已对齐（按楼梯）', [nF])) : nF === 2 ? t('两层已对齐（按外墙）') : t('{0} 层已对齐（按外墙）', [nF]);
    const roomOf = (id) => result.plan.floors.flatMap((f) => f.rooms).find((r) => r.id === id);
    const fmtIssue = (is) => t(is.zh, (is.vars || []).map((v) => (v && typeof v === 'object' ? (v.room ? roomLabel(roomOf(v.room)) : v.floor ? fdisp(result.plan, v.floor) : '') : v)));
    const intoName = (id) => ((current?.floors || []).length === 1 && !current.floors[0].name ? t('这一层') : t(floorName(current, id) || ''));
    const banner =
      sc.source === 'doors'
        ? t('比例是按门宽估的 —— 请填一个已知尺寸')
        : sc.source === 'guess'
          ? t('比例是猜的（排屋常见 20 尺 = 6.1 m）—— 请填一个已知尺寸')
          : null;
    body = (
      <div className="imp-summary">
        <div className="imp-floors">
          {result.plan.floors.map((f) => (
            <figure key={f.id} className="imp-floor">
              <MiniPlan floor={f} underlay={result.underlays?.[f.id]} />
              <figcaption>
                <b>{fdisp(result.plan, f.id)}</b>
                <span>{t('{0} 个房间 · {1} 个门窗', [f.rooms.filter((r) => !r.stairId).length, f.openings.length])}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="imp-report">
          {sc.source === 'dims' && <p className={`imp-line ${(sc.errPct ?? 1) <= 5 ? 'ok' : ''}`}>{t('比例：读自图上 {0} 条尺寸（误差约 {1}%）', [sc.n, sc.errPct ?? 1])}</p>}
          {sc.source === 'known' && <p className="imp-line ok">{t('比例：按你填的尺寸')}</p>}
          {banner && (
            <p className="imp-banner" role="note">
              <Icon name="alert" size={18} />
              {banner}
            </p>
          )}
          {sc.widthM ? <p className="imp-line">{singleCard ? t('现在：{0}外墙宽 {1} m、深 {2} m', [fdisp(result.plan, result.plan.floors[0].id), sc.widthM, sc.depthM ?? '—']) : t('现在：一楼外墙宽 {0} m、深 {1} m', [sc.widthM, sc.depthM ?? '—'])}</p> : null}
          <div className="imp-known-row">
            <label className="pe-select imp-ref">
              <span className="pe-select-label" aria-hidden="true">{refLabel}</span>
              <Icon name="down" size={14} className="pe-select-chev" />
              <select value={known.ref} onChange={(e) => setKnown((k) => ({ ...k, ref: e.target.value }))} aria-label={t('已知尺寸')}>
                <option value="width">{t('整体宽')}</option>
                {roomsForRef.map(({ r, f }) => (
                  <option key={r.id} value={r.id}>
                    {t('{0} · {1} 的宽', [fdisp(result.plan, f.id), roomLabel(r)])}
                  </option>
                ))}
              </select>
            </label>
            <input ref={knownRef} className="imp-known-in" value={known.text} onChange={(e) => setKnown((k) => ({ ...k, text: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && applyKnown()} placeholder="6.1 / 6100 / 20'" inputMode="decimal" aria-label={t('已知尺寸')} />
            <button type="button" className="pe-btn" onClick={applyKnown} disabled={!known.text.trim()}>
              {t('套用')}
            </button>
          </div>
          {knownErr && <p className="imp-warn">{knownErr}</p>}
          {!rep.manual && (fixes.o > 0 || fixes.g > 0) && <p className="imp-line">{t('自动修正：{0} 处重叠、{1} 处空隙', [fixes.o, fixes.g])}</p>}
          {!rep.manual && wallsFirst && <p className="imp-line ok">{doorsDropped > 0 ? t('按图上的墙重建：去掉 {0} 个多出来的门', [doorsDropped]) : t('房间和门窗按图上的墙重建')}</p>}
          {!rep.manual && !wallsFirst && doorsDropped > 0 && <p className="imp-line">{t('对照图上的墙：去掉 {0} 个图上没有的门', [doorsDropped])}</p>}
          {!rep.manual && openConn > 0 && <p className="imp-line">{t('{0} 处开放空间图上没有墙，不砌墙', [openConn])}</p>}
          {rep.scale?.aspect && Math.abs(rep.scale.aspect - 1) >= 0.015 && <p className="imp-line">{t('照片是斜着拍的：已经拉正，上下方向按尺寸校正了 {0}%', [Math.round(Math.abs(rep.scale.aspect - 1) * 1000) / 10])}</p>}
          {rep.aligned && nF > 1 && <p className={`imp-line ${stairPairsOk && rep.aligned === 'stairs' ? 'ok' : ''}`}>{alignedText}</p>}
          {rep.aligned && nF > 1 && result.plan.stairs.length > 0 && (!stairPairsOk || rep.aligned !== 'stairs') && <p className="imp-warn">{t('楼梯没对上：请在编辑器里检查楼梯')}</p>}
          {(rep.warnings || []).map((w, i) => (
            <p key={i} className="imp-warn">
              {t(w.zh, (w.vars || []).map((v) => (v?.floor ? fdisp(result.plan, v.floor) : v)))}
            </p>
          ))}
          {rep.unnamed > 0 && <p className="imp-warn">{t('{0} 个房间没认出名字：放进编辑器后点一下改类型', [rep.unnamed])}</p>}
          {issues.map((x, i) => (
            <p key={`is${i}`} className="imp-warn">
              {t('{0} —— 放进编辑器后点它修改', [fmtIssue(x)])}
            </p>
          ))}
          {rep.lowRes && !rep.manual && <p className="imp-note">{src?.photo ? t('这是照片读的：尺寸可能不准，最好上传原本的 PDF。') : t('这是截图读的：尺寸可能不准，最好上传原本的 PDF。')}</p>}
          {rep.manual && <p className="imp-note">{t('每一层只有底图：在编辑器里沿着墙描，用「量尺校准」对一下比例。')}</p>}
        </div>
      </div>
    );
    foot =
      hasRooms ? (
        <>
          {result.plan.floors.length === 1 && (current?.floors || []).length > 0 && (
            <span className="imp-into">
              <label className="pe-select">
                <span className="pe-select-label" aria-hidden="true">{intoFloor ? intoName(intoFloor) : t('放进')}</span>
                <Icon name="down" size={14} className="pe-select-chev" />
                <select value={intoFloor} onChange={(e) => setIntoFloor(e.target.value)} aria-label={t('放进')}>
                  {(current.floors || []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {intoName(f.id)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="pe-btn" onClick={() => done('into')} disabled={!intoFloor}>
                {(current?.floors || []).length === 1 && !current.floors[0].name ? t('只放进这一层') : t('只放进{0}', [intoName(intoFloor)])}
              </button>
            </span>
          )}
          <button type="button" className="pe-btn gold" onClick={() => done('replace')}>
            {t('替换全部楼层')}
          </button>
        </>
      ) : (
        <button type="button" className="pe-btn gold" onClick={() => done('replace')}>
          {t('放进编辑器')}
          <Icon name="chevron" size={18} />
        </button>
      );
  }

  return (
    <div className={`imp ${wide ? 'wide' : 'narrow'}`} role="dialog" aria-modal="true" aria-label={t('上传平面图')} data-step={step}>
      <style>{IMPORT_CSS}</style>
      {head}
      <main className="imp-body">{body}</main>
      {foot && <footer className="imp-foot">{foot}</footer>}
    </div>
  );
}

// 只用 base.css 的变量
const IMPORT_CSS = `
.imp { position: fixed; inset: 0; z-index: 90; display: flex; flex-direction: column; background: var(--bg); color: var(--ink); font: 500 14px/1.45 var(--sans); animation: fade 0.22s var(--ease); -webkit-user-select: none; user-select: none; }
.imp-head { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; padding: max(10px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left)); background: var(--surface); border-bottom: 0.5px solid var(--line); }
.imp-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.imp-title b { font: 700 20px/1.1 var(--display); letter-spacing: -0.02em; }
.imp-title span { color: var(--ink-soft); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw; }
.imp-steps { display: flex; gap: 6px; margin: 0; padding: 0; list-style: none; order: 3; }
.imp-steps li { padding: 5px 11px; border-radius: 999px; background: var(--card); box-shadow: 0 0 0 0.5px var(--line); color: var(--ink-soft); font: 600 12px/1.2 var(--sans); white-space: nowrap; }
.imp-steps li.past { color: var(--accent); }
.imp-steps li.on { background: var(--ink); color: var(--card); box-shadow: none; }
.imp.wide .imp-steps { order: 0; margin: 0 auto; }
.imp-close { flex: none; }
.imp.narrow .imp-close span { display: none; }
.imp.narrow .imp-steps { width: 100%; overflow-x: auto; }
.imp-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.imp-foot { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 10px; padding: 10px max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); background: var(--surface); border-top: 0.5px solid var(--line); }
.imp-foot .imp-note { margin: 0 auto 0 0; }
.imp-center { flex: 1; display: grid; place-content: center; justify-items: center; gap: 14px; padding: 24px; text-align: center; }
.imp-center p { margin: 0; font: 600 15px/1.4 var(--sans); }
.imp-center.small { flex: none; padding: 32px 8px; }
.imp-secs { color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.imp .boot-ring { border-color: rgba(var(--gold-d-rgb), 0.2); border-top-color: var(--gold-d); }
.imp .boot-ring.small { display: inline-block; width: 16px; height: 16px; border-width: 2px; vertical-align: -3px; margin-right: 8px; flex: none; }
.imp h2 { margin: 0; font: 700 17px/1.3 var(--display); letter-spacing: -0.01em; }
.imp-note { margin: 0; color: var(--ink-soft); font: 500 13px/1.5 var(--sans); }
.imp-note.busy { display: flex; align-items: center; color: var(--ink); }
.imp-link { border: 0; padding: 0; background: none; color: var(--accent); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
.imp-err { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-radius: 14px; background: rgba(var(--danger-rgb), 0.08); color: var(--danger); font: 600 14px/1.45 var(--sans); }
.imp-warn { margin: 0; padding: 8px 12px; border-radius: 12px; background: rgba(var(--gold-l-rgb), 0.35); color: var(--gold-ink); font: 600 13px/1.45 var(--sans); }
/* pages */
.imp-pages { flex: 1; min-height: 0; overflow-y: auto; padding: 16px max(16px, env(safe-area-inset-right)) 20px max(16px, env(safe-area-inset-left)); display: flex; flex-direction: column; gap: 12px; -webkit-overflow-scrolling: touch; }
.imp-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.imp-bar-acts { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.imp-toggle { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-radius: 999px; background: var(--card); box-shadow: 0 0 0 0.5px var(--line); font: 600 13px/1 var(--sans); cursor: pointer; }
.imp-toggle input { width: 18px; height: 18px; accent-color: var(--accent); }
.imp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (min-width: 600px) { .imp-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (min-width: 1300px) { .imp-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.imp-thumb { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 0; border-radius: 14px; background: var(--card); box-shadow: 0 0 0 0.5px var(--line), var(--shadow-1); color: var(--ink); cursor: pointer; text-align: left; transition: transform 0.16s var(--ease), box-shadow 0.2s var(--ease); }
.imp-thumb:active { transform: scale(0.98); }
.imp-thumb.on { box-shadow: 0 0 0 2.5px var(--gold), var(--shadow-2); }
.imp-thumb-img { display: grid; place-items: center; aspect-ratio: 1.414; border-radius: 8px; background: var(--paper); overflow: hidden; }
.imp-thumb-img img { width: 100%; height: 100%; object-fit: contain; }
.imp-thumb-ph { width: 40%; height: 3px; border-radius: 2px; background: var(--line); }
.imp-thumb-cap { font: 600 12px/1.2 var(--sans); color: var(--ink-soft); }
.imp-chip { position: absolute; top: 12px; right: 12px; padding: 3px 8px; border-radius: 999px; background: rgba(var(--gold-l-rgb), 0.85); box-shadow: 0 0 0 0.5px rgba(var(--gold-rgb), 0.6); color: var(--gold-ink); font: 700 11px/1.2 var(--sans); font-style: normal; }
/* page + side */
.imp-split { flex: 1; min-height: 0; display: flex; }
.imp.wide .imp-split { flex-direction: row; }
.imp.narrow .imp-split { flex-direction: column; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.imp-pageview { position: relative; flex: 1; min-width: 0; min-height: 0; display: grid; place-items: center; padding: 14px; background: var(--bg-deep); }
.imp.narrow .imp-pageview { flex: none; height: 42vh; min-height: 220px; }
.imp-page { position: relative; border-radius: 4px; background: var(--card); box-shadow: var(--shadow-2); overflow: hidden; }
.imp-page img { display: block; width: 100%; height: 100%; -webkit-user-drag: none; }
.imp-page svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.imp-page.draw svg { cursor: crosshair; }
.imp-box rect { fill: rgba(var(--gold-l-rgb), 0.16); stroke: var(--gold); }
.imp-box.off rect { fill: rgba(var(--shade-rgb), 0.05); stroke: var(--ink-soft); stroke-dasharray: 8 6; }
.imp-box.ok rect { fill: rgba(var(--accent-l-rgb), 0.22); stroke: var(--accent); }
.imp-box text { fill: var(--gold-ink); font-family: var(--sans); font-weight: 700; paint-order: stroke; stroke: var(--card); stroke-width: 3px; }
.imp-draft { fill: rgba(var(--gold-l-rgb), 0.25); stroke: var(--gold-d); stroke-dasharray: 10 6; }
.imp-sweep { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, transparent 0%, rgba(var(--gold-l-rgb), 0) 40%, rgba(var(--gold-l-rgb), 0.55) 50%, rgba(var(--gold-l-rgb), 0) 60%, transparent 100%); background-size: 100% 300%; animation: imp-sweep 2.2s var(--ease) infinite; }
@keyframes imp-sweep { from { background-position: 0 100%; } to { background-position: 0 0%; } }
@media (prefers-reduced-motion: reduce) { .imp-sweep { animation: none; background: rgba(var(--gold-l-rgb), 0.12); } }
.imp-side { display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--surface); overflow-y: auto; -webkit-overflow-scrolling: touch; -webkit-user-select: text; user-select: text; }
.imp.wide .imp-side { width: 380px; flex: none; border-left: 0.5px solid var(--line); }
.imp.narrow .imp-side { flex: none; border-top: 0.5px solid var(--line); padding-bottom: 24px; }
.imp-found { font-size: 18px; }
.imp-actions-col { display: flex; gap: 8px; flex-wrap: wrap; }
.imp-tip { display: flex; gap: 10px; padding: 12px 14px; border-radius: 16px; background: var(--accent-tint); color: var(--ink); }
.imp-tip > svg { flex: none; margin-top: 2px; color: var(--accent); }
.imp-tip p { margin: 0 0 8px; font: 500 14px/1.5 var(--sans); }
.imp-tip .imp-tip-sub { color: var(--ink-soft); font-size: 12.5px; }
.imp-tip-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.imp-units p { margin: 0 0 8px; font-weight: 600; }
.imp-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.imp-chip-btn { min-height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--card); box-shadow: 0 0 0 0.5px var(--line); color: var(--ink); font: 600 13px/1 var(--sans); cursor: pointer; }
.imp-chip-btn.on { background: var(--ink); color: var(--card); }
.imp-cards { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.imp-card { display: flex; gap: 12px; padding: 10px; border-radius: 16px; background: var(--card); box-shadow: 0 0 0 0.5px var(--line), var(--shadow-1); }
.imp-card.off { opacity: 0.55; }
.imp-card.compact { padding: 8px 10px; }
.imp-card.st-done { box-shadow: 0 0 0 1px var(--accent-l), var(--shadow-1); }
.imp-card.st-fail { box-shadow: 0 0 0 1px rgba(var(--danger-rgb), 0.5), var(--shadow-1); }
.imp-card-img { flex: none; display: grid; place-items: center; width: 92px; height: 120px; border-radius: 10px; background: var(--paper); overflow: hidden; }
.imp-card-img img { width: 100%; height: 100%; object-fit: contain; }
.imp-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.imp-card.compact .imp-card-body { flex-direction: row; align-items: center; justify-content: space-between; }
.imp-card-title { font: 700 14px/1.3 var(--sans); overflow-wrap: anywhere; }
.imp-card-unit { color: var(--ink-soft); font-size: 12px; }
.imp-level { min-height: 40px; }
.imp-card-move { display: flex; gap: 6px; }
.imp-mini-btn { display: grid; place-items: center; width: 44px; height: 40px; border: 0; border-radius: 12px; background: var(--paper); color: var(--ink); cursor: pointer; }
.imp-mini-btn:disabled { opacity: 0.35; cursor: default; }
.imp-mini-btn.up svg { transform: rotate(180deg); }
.imp-card-acts { display: flex; gap: 6px; flex-wrap: wrap; }
.imp-card-acts .pe-btn { min-height: 40px; padding: 0 12px; }
.imp-state { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-soft); font: 600 13px/1.4 var(--sans); font-variant-numeric: tabular-nums; }
.imp-state.run { color: var(--ink); }
.imp-state.ok { color: var(--accent); }
.imp-state.bad { color: var(--danger); }
.imp-add { align-self: flex-start; }
.imp-known { display: flex; flex-direction: column; gap: 6px; font: 600 13px/1.3 var(--sans); }
.imp-known input, .imp-known-in { box-sizing: border-box; min-height: 44px; width: 100%; max-width: 220px; padding: 8px 12px; border: 0; border-radius: 12px; background: var(--card); box-shadow: 0 0 0 0.5px var(--line); color: var(--ink); font: 600 15px/1 var(--sans); -webkit-user-select: text; user-select: text; }
.imp-known-in { width: 140px; }
/* summary */
.imp-summary { flex: 1; min-height: 0; overflow-y: auto; display: flex; gap: 20px; padding: 18px max(18px, env(safe-area-inset-right)) 24px max(18px, env(safe-area-inset-left)); -webkit-overflow-scrolling: touch; -webkit-user-select: text; user-select: text; }
.imp.narrow .imp-summary { flex-direction: column; }
.imp-floors { display: flex; gap: 14px; flex: 1; min-width: 0; justify-content: center; align-items: stretch; }
.imp.narrow .imp-floors { flex: none; }
.imp-floor { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 12px; flex: 1 1 0; min-width: 0; max-width: 340px; border-radius: 18px; background: var(--card); box-shadow: 0 0 0 0.5px var(--line), var(--shadow-1); }
.imp-mini { width: 100%; height: min(52vh, 460px); }
.imp.narrow .imp-mini { height: 34vh; }
.imp-mini.empty { display: grid; place-items: center; color: var(--ink-soft); background: var(--paper); border-radius: 10px; }
.imp-mini.pic { position: relative; display: block; overflow: hidden; }
.imp-mini.pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0.85; }
.imp-mini.pic span { position: absolute; left: 10px; bottom: 10px; padding: 3px 9px; border-radius: 999px; background: var(--card); box-shadow: 0 0 0 0.5px var(--line); font: 600 12px/1.3 var(--sans); }
.imp-mini-room rect { fill: var(--paper); stroke: var(--ink); }
.imp-mini-room.t-stair rect { fill: rgba(var(--gold-l-rgb), 0.6); }
.imp-mini-room.t-porch rect, .imp-mini-room.t-balcony rect { fill: var(--bg-deep); }
.imp-mini-room.t-bath rect, .imp-mini-room.t-utility rect { fill: var(--accent-tint); }
.imp-mini-room text { fill: var(--ink-soft); font-family: var(--sans); font-weight: 600; }
.imp-mini-open { stroke: var(--gold); stroke-linecap: butt; }
.imp-mini-open.k-window { stroke: var(--accent-2); }
.imp-mini-open.k-open { stroke: var(--card); }
.imp-floor figcaption { display: flex; flex-direction: column; gap: 2px; }
.imp-floor figcaption b { font: 700 15px/1.2 var(--sans); }
.imp-floor figcaption span { color: var(--ink-soft); font-size: 12.5px; }
.imp-report { display: flex; flex-direction: column; gap: 10px; }
.imp.wide .imp-report { width: 400px; flex: none; }
.imp-line { margin: 0; font: 600 14px/1.45 var(--sans); }
.imp-line.ok { color: var(--accent); }
.imp-banner { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 14px; border-radius: 14px; background: rgba(var(--gold-l-rgb), 0.45); color: var(--gold-ink); font: 700 14px/1.45 var(--sans); }
.imp-banner svg { flex: none; margin-top: 1px; }
.imp-known-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.imp-known-row .pe-select { min-height: 44px; max-width: 100%; }
.imp-ref .pe-select-label { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.imp-into { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-right: auto; }
@media (max-width: 599px) { .imp-foot .pe-btn { flex: 1 1 auto; } .imp-title b { font-size: 18px; } }
`;
