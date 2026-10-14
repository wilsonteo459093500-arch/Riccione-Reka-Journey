// 「专属梦想家概念蓝图」—— 许愿之旅的结尾（峰终定律的「终」），也是设计师接手的第一份文件。
// 两种视角：客人版（被看见、被认真对待）/ 设计师版（矛盾、风险、要问的话、英文关键词）。
//
// 设计师版绝不能漏给客人：
//   · 只有网址带 ?staff=1（而且不在许愿模式里）才出现「客人版 / 设计师版」切换；
//   · 许愿模式里，只能由外壳的员工区发 {type:'designer'} 打开；切回客人版就又锁上（切换也收起来）；
//   · 给客人的链接 / 海报 / 二维码都是普通链接；「发给设计师」的那条只在员工打开时才带 ?staff=1；
//   · 许愿模式（展厅共用的 iPad）不发 WhatsApp、不走系统分享面板：海报配一个二维码，客人用自己的手机带走。
//
// 动效 · 声音 · 潘吉（动效 SPEC §6.1 蓝图、音效 SPEC §7.2、声音 SPEC §6.2）：
//   刚做好的蓝图：「达成」一声 + 潘吉「这是你的梦想家蓝图，慢慢看。」；牌被全息光扫一下（+600 ms）。
//   往下滑：每一节的罗马数字被光扫一下、内容一块块升起来；数字（毫米、百分比）进到画面时数上去。
//   滑到最后：「潘吉认证」盖章（弹簧 + 一圈印泥 + 几粒灰 + 盖章声），刚做好的蓝图她再说最后一句。
//   复制 / 存海报成功：「小提示」一声 + 按钮被光扫一下。在 3D 里看见它：暮色拂过再打开。下一位：晨光拂过，潘吉说再见。

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Footprints,
  House,
  Image as ImageIcon,
  Library,
  Link2,
  Luggage,
  MessageCircle,
  NotebookPen,
  Printer,
  RotateCcw,
  Shirt,
  Lightbulb,
  Ruler,
  CookingPot,
  Rows3,
  ChevronDown,
  ScanLine,
} from 'lucide-react';
import Pangie, { Lamp, useVoiceLine } from '../shared/Pangie.jsx';
import fx from '../shared/fx.js';
import { sfx } from '../shared/sfx.js';
import { voice, lineText } from '../shared/voice.js';
import { cue, settle } from './moments.js';
import Emblem from '../shared/Emblem.jsx';
import { DreamerCard } from './Reveal.jsx';
import { Segmented } from './ui.jsx';
import { Ico } from './icons.jsx';
import { Painting } from './paint.jsx';
import { SceneCaption, SceneImage } from './Scenery.jsx';
import { sceneForProfile } from './scenes.js';
import { DREAMER_BY_CODE, AXES, HIDDEN_AXES } from '../shared/dreamers.js';
import { MAT_BY_ID, SLOT_BY_ID } from '../shared/materials.js';
import { swatchURL } from '../shared/textures.js';
import { storagePlan, insights, packJSON, slimProfile, quickPicksOf } from '../shared/profile.js';
import { profileText, waLink, lifeLabel, WISH_LABEL, AVOID_LABEL } from '../shared/summary.js';
import { BRAND, hostFromCode } from '../shared/config.js';
import { PALETTE } from '../shared/palette.js';
import { APPLIANCES, PAIRS, SPLURGE } from './flow.js';
import { renderPoster } from './poster.js';
import { isWishMode, tellShell } from '../shared/zen.js';
import { t, tj, L, isEn, guideName, withLang } from '../shared/i18n.js';
import { fmt, ftNote } from '../shared/units.js';
import { renderKeywords, doorNotes } from './keywords.js';
import { qrMatrix, qrPath } from './qr.js';
import { phrased, segmented, keepWords } from './typo.jsx';

const WISH = isWishMode();
/** 员工视角：网址带 ?staff=1，而且不在许愿模式里（许愿模式只认外壳的 designer 消息） */
const STAFF = (() => {
  try {
    return !WISH && new URLSearchParams(location.search).get('staff') === '1';
  } catch {
    return false;
  }
})();

const UNSURE_KEYS = new Set(['shoes', 'wardrobe', 'books', 'ratio']);
const BOARD_SLOTS = ['floor', 'walls', 'feature', 'cabinetry', 'countertop', 'upholstery', 'rugs', 'accents'];
const LEVEL = { conflict: { Icon: AlertTriangle, zh: '要聊清楚' }, note: { Icon: Ruler, zh: '设计要点' }, tip: { Icon: Lightbulb, zh: '沟通建议' } };
const LEVEL_ORDER = ['conflict', 'note', 'tip'];
const TOP_TIPS = 3;

/** 「主题：内容」→ 主题加粗（扫一眼就知道这条讲什么） */
function tipText(text) {
  const s = String(text || '');
  const m = /^(.{2,56}?)(：|: )/.exec(s);
  if (!m) return s;
  return (
    <>
      <b>{m[1]}</b>
      {m[2]}
      {s.slice(m[0].length)}
    </>
  );
}

function TipKind({ level, count }) {
  const lv = LEVEL[level] || LEVEL.note;
  return (
    <span className="tip-kind">
      <lv.Icon size={14} strokeWidth={2} aria-hidden="true" />
      {t(lv.zh)}
      {count != null && <em>{count}</em>}
    </span>
  );
}

function TipItem({ tp, n }) {
  return (
    <li className={`tip-${tp.level}`}>
      {n != null && (
        <span className="tip-n" aria-hidden="true">
          {n}
        </span>
      )}
      <span className="tip-body">
        {n != null && <TipKind level={tp.level} />}
        <span className="tip-text">{tipText(tp.text)}</span>
      </span>
    </li>
  );
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/**
 * 一条轴：和揭晓页、海报同一种画法 —— 金色的小圆点停在赢的那一边（left = 100 − v，v = 左边那一极的比例），
 * 加粗的是赢的那一极，百分比也是它的。
 */
function Axis({ dim, a, b, v, hidden = false }) {
  return (
    <div className={`axis ${hidden ? 'hidden-axis' : ''}`}>
      <span className="axis-dim">{dim}</span>
      <span className={`axis-l ${v >= 50 ? 'win' : ''}`}>{a}</span>
      <div className="axis-track" aria-hidden="true">
        <i className="axis-knob" style={{ left: `${100 - v}%` }} />
      </div>
      <span className={`axis-r ${v < 50 ? 'win' : ''}`}>{b}</span>
      <b className="axis-pct">
        <CountIn value={v >= 50 ? v : 100 - v} from={50} format={pctFmt} />
      </b>
    </div>
  );
}

const pctFmt = (n) => `${Math.round(n)}%`;

/**
 * 她在蓝图最后说的那一句（bp.end），拆成两句各占一块（第二句里的词不断开）。
 * 拆不开（标点变了）就整句一块：一个字都不能丢
 */
function farewellLines() {
  const s = lineText('bp.end');
  const m = /^(.+?[。！？.!?])\s*(\S.*)$/su.exec(s);
  return m ? [m[1], m[2]] : [s];
}

/**
 * 进到画面（或快要进到画面）时从 from 数到 value，一次（fx.countUp，900 ms）。没进过画面（打印、截图）就一直是最后的数。
 * 数字由这里自己写（React 不放子节点），父组件重画不会打断它。
 */
function CountIn({ value, from = 0, format = fmt, tick = false }) {
  const ref = useRef(null);
  const fmtRef = useRef(format);
  fmtRef.current = format;
  const ran = useRef(false);
  useLayoutEffect(() => {
    if (ref.current && !ran.current) ref.current.textContent = fmtRef.current(value);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        ran.current = true;
        fx.countUp(el, value, { from, duration: 900, format: fmtRef.current, tick });
      },
      { rootMargin: '0px 0px 6% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className="count-in" />;
}

/** 许愿模式的「分享海报」：海报 + 二维码（普通的客人链接）。客人用自己的手机扫，在那里存图、分享。 */
function TakeHome({ poster, link, title, onClose }) {
  const qr = useMemo(() => (link ? qrMatrix(link) : null), [link]);
  const n = qr ? qr.length + 8 : 0;
  const closeRef = useRef(null);
  const figRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    // 海报出来：一道全息光慢慢扫过
    if (figRef.current) fx.holo(figRef.current, { delay: 320 });
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="take-veil no-print" role="dialog" aria-modal="true" aria-label={t('用手机扫一扫，把蓝图带回家')} onClick={onClose}>
      <div className="take-sheet" onClick={(e) => e.stopPropagation()}>
        <figure className="take-poster" ref={figRef}>
          <img src={poster} alt={title} />
        </figure>
        <div className="take-side">
          <p className="eyebrow">{t('分享海报')}</p>
          <h2 className="h-title">{t('用手机扫一扫，把蓝图带回家')}</h2>
          <p className="take-lead">{phrased(t('海报和蓝图会在你自己的手机上打开，在那里就能存图、分享。'), { sentences: false })}</p>
          {qr && (
            <div className="take-qr">
              <svg className="take-code" viewBox={`0 0 ${n} ${n}`} role="img" aria-label={t('蓝图链接的二维码')} shapeRendering="crispEdges">
                <rect width={n} height={n} fill="#FFFFFF" />
                <path d={qrPath(qr)} fill={PALETTE.ink} />
              </svg>
              <span className="take-scan">
                <ScanLine size={16} strokeWidth={1.8} aria-hidden="true" />
                {t('打开相机，对准这里')}
              </span>
            </div>
          )}
          <button ref={closeRef} type="button" className="btn btn-primary take-done" onClick={onClose}>
            {t('关闭')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Sec({ num, title, note, children, className = '' }) {
  return (
    <section className={`bp-sec ${className}`}>
      <h3 className="bp-h3">
        {num && <span className="bp-num">{num}</span>}
        <span>{title}</span>
        {note && <em>{note}</em>}
      </h3>
      {children}
    </section>
  );
}

export default function Blueprint({ profile, onRestart, fresh = false, designerOpen = false, showroom = false }) {
  const [staffOn, setStaffOn] = useState(STAFF || designerOpen);
  const [mode, setMode] = useState(designerOpen ? 'designer' : 'client');
  const [links, setLinks] = useState({ bp: '', bpStaff: '', studio: '' });
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  // 许愿模式的海报：画好的图（object URL），和二维码一起放在一张小卡上
  const [take, setTake] = useState('');
  const d = DREAMER_BY_CODE[profile.code];
  const plan = useMemo(() => storagePlan(profile.storage, APPLIANCES), [profile]);
  const tips = useMemo(() => insights(profile, plan), [profile, plan]);
  // 出图关键词：按这位客人的雷区 / 生活方式换过的材质改写，再加上 avoid: …（复制的也是这一段）
  const keywords = useMemo(() => (d?.design?.en ? renderKeywords(d.design.en, profile) : ''), [d, profile]);
  const doors = useMemo(() => (d?.design?.doors ? doorNotes(d.design.doors, profile) : []), [d, profile]);
  // 谈话提示：先「要聊清楚」、再「设计要点」、最后「沟通建议」；最重要的三条放前面，其余收在「其余 n 条」里
  const ranked = useMemo(() => tips.map((tp, i) => ({ ...tp, i })).sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.i - b.i), [tips]);
  const [moreTips, setMoreTips] = useState(false);
  const host = hostFromCode(profile.host);
  const pangieRef = useRef(null);
  const emblemRef = useRef(null);
  const sceneRef = useRef(null);
  const toastTimer = useRef(null);
  const docRef = useRef(null);
  const heroRef = useRef(null);
  const sealRef = useRef(null);
  const greeted = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const sceneId = sceneForProfile(profile);
  const designer = staffOn && mode === 'designer';
  // 刚做好的蓝图：潘吉把它交到你手上（一位客人一次）
  useVoiceLine('bp.hello', { when: fresh, delay: 900 });

  useEffect(() => {
    let alive = true;
    packJSON(slimProfile(profile)).then((packed) => {
      if (!alive) return;
      setLinks({
        bp: withLang(new URL(`quiz.html#bp=${packed}`, location.href).href),
        bpStaff: withLang(new URL(`quiz.html?staff=1#bp=${packed}`, location.href).href),
        // 3D 链接自己带上身份（许愿模式 / 员工），不只靠 document.referrer：客人版永远不会变成设计师版
        studio: withLang(new URL(`studio.html${WISH ? '?mode=wish' : STAFF ? '?staff=1' : ''}#p=${packed}`, location.href).href),
      });
      // 刚做完的蓝图：网址换成 #bp=…，返回 / 重新整理 / iPad 把分页收掉，都还在
      if (fresh) {
        try {
          history.replaceState(null, '', `${location.pathname}${location.search}#bp=${packed}`);
        } catch {
          /* ignore */
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [profile, fresh]);

  useEffect(() => {
    // 音乐：《归家》，轻一点（× 0.5）—— 许愿模式里告诉外壳，单独打开时自己的音乐
    cue('page', { page: 'blueprint' });
    // 刚做好的蓝图 = 走完了：「达成」；牌被全息光扫一下（开发时 StrictMode 会跑两次：只要一次）
    let holoAt = () => {};
    if (!greeted.current) {
      greeted.current = true;
      if (fresh) sfx.play('achievement');
      const card = heroRef.current?.querySelector('.dcard');
      holoAt = fx.clock.after(600, () => card && fx.holo(card));
    }
    // 从 3D 返回（浏览器的上一页）：页面整个被留着，按钮要能再按
    const onShow = (e) => e.persisted && setLeaving(false);
    window.addEventListener('pageshow', onShow);
    // 许愿模式：只有外壳的员工区可以打开设计师版
    const onMsg = (e) => {
      if (e.origin !== location.origin || e.data?.source !== 'genie-shell') return;
      if (e.data.type === 'designer') {
        setStaffOn(true);
        setMode('designer');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('message', onMsg);
    // 告诉外壳：蓝图已经在画面上，员工区现在可以发 {type:'designer'} 打开设计师版
    tellShell('staff-ready');
    return () => {
      holoAt();
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('message', onMsg);
      clearTimeout(toastTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 往下滑：每一节快进到画面时，内容一块块升起来（还没看到就先开始，看不到闪）；罗马数字被光扫一下；
  // 滑到最后（≥ 35 %）：盖「潘吉认证」的章；刚做好的蓝图（≥ 50 %）潘吉说最后一句（排在前一句后面）
  useEffect(() => {
    const root = docRef.current;
    if (!root || typeof IntersectionObserver !== 'function') return undefined;
    const secs = [...root.querySelectorAll(':scope > .bp-sec:not(.bp-hero)')];
    const enter = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          enter.unobserve(e.target);
          fx.enter([...e.target.children].filter((c) => !c.classList.contains('seal')), { stagger: 50, duration: 600, blur: 4, y: 10 });
        }
      },
      { rootMargin: '0px 0px 10% 0px' }
    );
    let spoke = false;
    const seen = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          const el = e.target;
          if (el.classList.contains('bp-end')) {
            if (e.intersectionRatio >= 0.35 && sealRef.current?.classList.contains('is-waiting')) {
              sealRef.current.classList.remove('is-waiting');
              // 盖章那一声（这里的音乐压在一半：章也轻一点，−3 dB）
              fx.stamp(sealRef.current, { sound: null });
              sfx.play('stamp', { gain: 0.7 });
            }
            if (fresh && !spoke && e.intersectionRatio >= 0.5) {
              spoke = true;
              // 章先落下、余音散开，她再说（音效 SPEC §9：时刻先响，≥ 0.6 秒后潘吉才开口）
              voice.say('bp.end', { mode: 'queue', delay: 1100 });
            }
            if (!sealRef.current?.classList.contains('is-waiting') && (spoke || !fresh)) seen.unobserve(el);
          } else {
            seen.unobserve(el);
            const num = el.querySelector('.bp-num');
            if (num) fx.scan(num, { sound: null, duration: 360 });
          }
        }
      },
      { threshold: [0.35, 0.5] }
    );
    for (const sec of secs) {
      enter.observe(sec);
      seen.observe(sec);
    }
    return () => {
      enter.disconnect();
      seen.disconnect();
    };
  }, [fresh]);

  // 海报图用完就放掉
  useEffect(() => () => take && URL.revokeObjectURL(take), [take]);

  if (!d) return null;

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  // 「发给设计师」的文字：客人自己发出去的是普通链接（客人版）；只有员工打开的蓝图（?staff=1 / 员工区）才带设计师链接。
  // { client } 让 summary.js 把只给设计师看的内容拿掉（summary.js 还没支持时，多传的参数不影响）。
  const text = profileText(profile, plan, staffOn ? links.bpStaff : links.bp, { client: !staffOn });
  const date = new Date(profile.createdAt);
  const name = L({ zh: d.zh, en: d.en });
  const touched = profile.storage?.touched || null;
  // 只有「数出来」的几项会是默认值（多选题空着 = 诚实的「没有」，不标）
  const unsure = (k) => designer && !!touched && UNSURE_KEYS.has(k) && !touched[k];
  const quick = profile.players && profile.players !== 'solo' ? [] : quickPicksOf(profile);
  const curve = profile.hidden?.curve ?? 50;

  const savePoster = async () => {
    setBusy(true);
    try {
      const blob = await renderPoster(profile, {
        pangieEl: pangieRef.current?.querySelector('svg'),
        emblemEl: emblemRef.current?.querySelector('svg'),
        sceneEl: sceneRef.current?.querySelector('svg'),
        sceneId,
      });
      if (blob && WISH) {
        // 展厅共用的 iPad：不走系统分享面板（会露出最近的联系人、AirDrop 名字），也不存进相簿。
        // 海报放在一张小卡上，旁边一个二维码：客人用自己的手机扫，蓝图在他手机上打开，在那里分享。
        setTake(URL.createObjectURL(blob));
      } else if (blob) {
        const file = new File([blob], `WISH-${profile.code}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: t('我的梦想家牌：{0}', [name]) }).catch(() => download(blob, file.name));
        } else download(blob, file.name);
        sfx.play('toast'); // 海报存好了
      }
    } finally {
      setBusy(false);
    }
  };

  // 复制成功：「小提示」一声 + 按钮被光扫一下（btn = 按下去的那个按钮，await 之前就拿好）
  const copy = async (s, msg, btn) => {
    try {
      await navigator.clipboard.writeText(s);
      flash(msg || t('已复制'));
      sfx.play('toast');
      if (btn?.isConnected) fx.scan(btn, { duration: 280, sound: null });
    } catch {
      flash(t('复制失败，请手动选取'));
    }
  };

  const store = (key, Icon, label, mm, sub, extra) => (
    <div className={`store ${unsure(key) ? 'is-unsure' : ''}`}>
      <span className="store-ico">
        <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className="store-label">{label}</span>
      <b className="store-num">
        {mm ? (
          <>
            {/* 数字安静地数上来：蓝图只有一个声音时刻 —— 最后盖下去的「潘吉认证」章 */}
            <CountIn value={mm} format={fmt} /> mm
          </>
        ) : (
          extra || '—'
        )}
      </b>
      {!designer && mm ? <span className="store-ft">{ftNote(mm)}</span> : null}
      {/* 「长挂 650 · 短挂 1,500」：只在「·」后面换行（英文不会剩一个「1,500」掉到下一行） */}
      {sub && <em>{segmented(sub, '·', { zhOnly: false })}</em>}
      {unsure(key) && <span className="store-flag">{t('（默认值，未确认）')}</span>}
    </div>
  );

  return (
    <div className={`bp-page mode-${designer ? 'designer' : 'client'} ${WISH ? 'is-wish' : ''}`}>
      {/* 隐藏的素材：海报用 */}
      <div className="sr-only" aria-hidden="true">
        <div ref={pangieRef}>
          <Pangie mood="happy" prop="ball" size={260} float={false} />
        </div>
        <div ref={emblemRef}>
          <Emblem name={d.emblem} size={160} frame stroke={1.7} color={PALETTE.gold} />
        </div>
        <div ref={sceneRef}>
          <Painting id={sceneId} />
        </div>
      </div>

      <div className="bp-band no-print" aria-hidden="true">
        <SceneImage id={sceneId} still />
        <SceneCaption id={sceneId} />
      </div>

      <article className="bp-doc" ref={docRef}>
        <header className="bp-head fx-blur-in">
          <div className="bp-head-text">
            <p className="eyebrow">
              {BRAND.app} {BRAND.by}
            </p>
            <h1 className="bp-title">{t('专属梦想家概念蓝图')}</h1>
            <p className="bp-meta">
              {tj('为 {0} 绘制', [<b key="n">{profile.name || t('贵宾')}</b>])}
              <span>·</span>
              {date.toLocaleDateString(isEn() ? 'en-GB' : 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
              <span>·</span>
              No. {profile.id}
              {host ? (
                <>
                  <span>·</span>
                  {t('陪同：{0}', [host.name])}
                </>
              ) : null}
            </p>
          </div>
          {staffOn && (
            <Segmented
              className="no-print bp-seg"
              size="sm"
              label={t('设计师版')}
              value={mode}
              onChange={(v) => {
                setMode(v);
                // 许愿模式：员工看完切回客人版 = 交还给客人，切换也一起收起来（只有员工区能再打开）
                if (WISH && v === 'client') setStaffOn(false);
              }}
              options={[
                { v: 'client', label: t('客人版') },
                { v: 'designer', label: t('设计师版') },
              ]}
            />
          )}
        </header>

        {/* I · 你的牌 */}
        <section className="bp-sec bp-hero">
          <div className="bp-hero-card" ref={heroRef}>
            <DreamerCard profile={profile} />
          </div>
          <div className="bp-hero-text">
            <p className="eyebrow">
              {d.num} · {isEn() ? d.zh : d.en}
            </p>
            <h2 className="bp-h2">{name}</h2>
            <p className="bp-quote">{phrased(t(d.tagline), { sentences: false })}</p>
            {/* 词不拆开（不会断成「陈 / 列」），英文原样 */}
            <p className="bp-desc">{isEn() ? t(d.desc) : keepWords(t(d.desc))}</p>
            <div className="axes">
              {AXES.map((ax) => (
                <Axis key={ax.id} dim={L({ zh: ax.zh, en: ax.en })} a={L(ax.a)} b={L(ax.b)} v={profile.axes[ax.id]} />
              ))}
              {designer &&
                HIDDEN_AXES.map((ax) => <Axis key={ax.id} hidden dim={t(ax.zh)} a={L(ax.a)} b={L(ax.b)} v={profile.hidden?.[ax.id] ?? 50} />)}
            </div>
          </div>
        </section>

        {/* II · 色板与材质 */}
        <Sec num="II" title={t('情绪色板 · 材质板')}>
          <div className="palette-row">
            {d.palette.map((c) => (
              <div key={c} className="pal">
                <i style={{ background: c }} />
                {designer && <span>{c}</span>}
              </div>
            ))}
          </div>
          <div className="mat-board">
            {BOARD_SLOTS.map((s) => {
              const m = MAT_BY_ID[profile.materials[s]];
              return (
                <figure key={s} className="mat">
                  <img src={swatchURL(m?.id, 192) || ''} alt="" />
                  <figcaption>
                    <span>{L(SLOT_BY_ID[s])}</span>
                    <b>{m ? L(m) : '—'}</b>
                  </figcaption>
                </figure>
              );
            })}
          </div>
          {profile.swaps?.length > 0 && (
            <p className="bp-note">
              <Check size={16} strokeWidth={2} aria-hidden="true" />
              <span>
                {t('已按你的雷区避开：')}
                {/* 同一种材质在两个表面都换了，只写一次 */}
                {[...new Set(profile.swaps.map((s) => `${L(MAT_BY_ID[s.from])} → ${L(MAT_BY_ID[s.to])}`))].join(isEn() ? '; ' : '；')}
              </span>
            </p>
          )}
          {designer && profile.lifeSwaps?.length > 0 && (
            <ul className="bp-swaps">
              {profile.lifeSwaps.map((s, i) => (
                <li key={i}>
                  <b>{s.reason ? t(s.reason) : t('生活方式替换')}</b>
                  <span>
                    {L(SLOT_BY_ID[s.slot])}：{L(MAT_BY_ID[s.from])} → {L(MAT_BY_ID[s.to])}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sec>

        {/* III · 生活 + IV · 三个愿望 */}
        <section className="bp-sec two">
          <div>
            <h3 className="bp-h3">
              <span className="bp-num">III</span>
              <span>{t('你的生活')}</span>
            </h3>
            <ul className="life-list">
              <li>
                <Ico set="bp" v="saturday" size={18} />
                <span>{t('星期六早上：')}</span>
                <b>{lifeLabel('saturday', profile.life.saturday) || '—'}</b>
              </li>
              <li>
                <Ico set="bp" v="home" size={18} />
                <span>{t('一进家门：')}</span>
                <b>{lifeLabel('home', profile.life.home) || '—'}</b>
              </li>
              <li>
                <Ico set="bp" v="cook" size={18} />
                <span>{t('厨房：')}</span>
                <b>{lifeLabel('cook', profile.life.cook) || '—'}</b>
              </li>
              {designer && (
                <li className="dz-only">
                  <Ico set="bp" v="bell" size={18} />
                  <span>{t('最想藏起来：')}</span>
                  <b>{lifeLabel('bell', profile.life.bell) || '—'}</b>
                </li>
              )}
              {profile.life.who?.length > 0 && (
                <li>
                  <Ico set="bp" v="who" size={18} />
                  <span>{t('家里还有：')}</span>
                  <b>{profile.life.who.map((v) => lifeLabel('who', v)).join(isEn() ? ', ' : '、')}</b>
                </li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="bp-h3">
              <span className="bp-num">IV</span>
              <span>{t('三个愿望')}</span>
            </h3>
            <ul className="wish-list">
              {(profile.wishes || []).map((w) => (
                <li key={w}>
                  <Lamp size={30} glow={1} />
                  <span>{t(WISH_LABEL[w] || w)}</span>
                </li>
              ))}
            </ul>
            {profile.splurge && (
              <p className="bp-note">
                <Ico set="splurge" v={profile.splurge} size={16} />
                <span>
                  {t('最舍得花钱：')}
                  {t(SPLURGE.find((s) => s.v === profile.splurge)?.label || '')}
                </span>
              </p>
            )}
            {profile.avoid?.length > 0 && (
              <>
                <p className="bp-sub">{t('雷区')}</p>
                <div className="nogo-list">
                  {profile.avoid.map((a) => (
                    <span key={a}>{t(AVOID_LABEL[a] || a)}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* V · 收纳 */}
        <Sec num="V" title={t('收纳蓝图')} note={t('（按你数的宝藏换算，见面时再精确量）')}>
          <div className="store-grid">
            {store('shoes', Footprints, t('鞋柜'), plan.shoeCabinetMM, t('约 {0} 双', [plan.shoes]))}
            {store('wardrobe', Shirt, t('主卧衣柜'), plan.wardrobeMM, t('长挂 {0} · 短挂 {1}', [fmt(plan.longHangMM), fmt(plan.shortHangMM)]))}
            {store('books', Library, t('书墙层板'), plan.bookshelfMM, t('{0} 层', [profile.storage.books || 0]))}
            {store(
              'appliances',
              CookingPot,
              t('家电'),
              0,
              `${t('台面 {0} mm', [fmt(plan.counterMM)])}${plan.applianceTallCabinet ? ` · ${t('电器高柜')}` : ''}`,
              t('{0} 件', [plan.applianceCount])
            )}
            {store('bulky', Luggage, t('大家伙'), 0, plan.needsStoreroom ? t('建议储物间') : t('高柜即可'), t('{0} 类', [plan.bulky]))}
            {store(
              'ratio',
              Rows3,
              t('藏 : 展'),
              0,
              plan.displayPct >= 40 ? t('大方展示') : plan.displayPct >= 20 ? t('藏中有展') : t('几乎全藏'),
              `${100 - plan.displayPct} : ${plan.displayPct}`
            )}
          </div>
        </Sec>

        {profile.wish && (
          <section className="bp-sec bp-wish">
            <p className="eyebrow">{t('你说，这个家只要做到一件事 ——')}</p>
            <blockquote>{profile.wish}</blockquote>
          </section>
        )}

        {/* 设计师版 */}
        {designer && (
          <section className="bp-sec bp-designer">
            <h3 className="bp-h3">
              <span className="bp-num">
                <NotebookPen size={16} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span>{t('设计师视角')}</span>
            </h3>
            <div className="dz-grid">
              <div>
                <h4>{t('设计语言')}</h4>
                <dl>
                  <dt>{t('风格')}</dt>
                  <dd>{t(d.design.style)}</dd>
                  <dt>{t('色温')}</dt>
                  <dd>{t(d.design.kelvin)}</dd>
                  <dt>{t('柜门')}</dt>
                  <dd>
                    {t(d.design.doors)}
                    {doors.map((n, i) => (
                      <span key={i} className="dz-amend">
                        {n.kind === 'swap'
                          ? t('按雷区改为：{0}（原为{1}）', [L(MAT_BY_ID[n.to]), L(MAT_BY_ID[n.from])])
                          : t('客人不要：{0}', [t(AVOID_LABEL[n.tag] || n.tag)])}
                      </span>
                    ))}
                  </dd>
                  <dt>{t('藏:展（牌面）')}</dt>
                  <dd>
                    {d.design.ratio[0]} : {d.design.ratio[1]}
                    {isEn() ? ' ' : ''}
                    {t('（客人自评 {0}）', [`${100 - plan.displayPct} : ${plan.displayPct}`])}
                  </dd>
                  <dt>{t('线条')}</dt>
                  <dd>{curve >= 55 ? t('偏圆润（沙发那题选了圆的）：弧形沙发 / 圆几；柜体要不要圆角，见面再问') : curve <= 45 ? t('偏利落：直线、薄边、方正') : t('中性')}</dd>
                </dl>
                <h4>{t('出图关键词（英文，可贴给 AI 出图）')}</h4>
                <p className="kw">{keywords}</p>
                <button type="button" className="btn btn-line small no-print" onClick={(e) => copy(keywords, undefined, e.currentTarget)}>
                  <Copy size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span>{t('复制关键词')}</span>
                </button>
              </div>
              <div>
                <h4>{t('见面时要聊的（{0}）', [tips.length])}</h4>
                <ol className="tips tips-top">
                  {ranked.slice(0, TOP_TIPS).map((tp, k) => (
                    <TipItem key={tp.i} tp={tp} n={k + 1} />
                  ))}
                </ol>
                {ranked.length > TOP_TIPS && (
                  <div className={`tips-more ${moreTips ? 'is-open' : ''}`}>
                    <button type="button" className="tips-toggle no-print" aria-expanded={moreTips} aria-controls="bp-tips-rest" onClick={() => setMoreTips((v) => !v)}>
                      <span>{moreTips ? t('收起') : t('其余 {0} 条', [ranked.length - TOP_TIPS])}</span>
                      <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <div className="tips-rest" id="bp-tips-rest">
                      {LEVEL_ORDER.map((lv) => {
                        const group = ranked.slice(TOP_TIPS).filter((tp) => tp.level === lv);
                        if (!group.length) return null;
                        return (
                          <div key={lv} className={`tips-group-wrap tip-${lv}`}>
                            <p className="tips-head">
                              <TipKind level={lv} count={group.length} />
                            </p>
                            <ul className="tips tips-group">
                              {group.map((tp) => (
                                <TipItem key={tp.i} tp={tp} />
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {quick.length > 0 && (
                  <>
                    <h4>{t('选得最快的几题（参考）')}</h4>
                    <p className="quick">
                      {quick
                        .map((q) => {
                          const id = typeof q === 'string' ? q : q.id;
                          const pr = PAIRS.find((p) => p.id === id);
                          const pick = typeof q === 'string' ? profile.answers?.pairs?.[id]?.pick : q.pick;
                          return pr && pr[pick] ? t(pr[pick].label) : null;
                        })
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 结尾仪式 */}
        <section className="bp-sec bp-end">
          <div className="seal is-waiting" ref={sealRef} aria-hidden="true">
            <span>{guideName()}</span>
            <small>{t('认证')}</small>
          </div>
          <div className="bp-end-pangie">
            <Pangie mood="wink" prop="ball" size={120} speaker />
          </div>
          {/* 两句各占一块、各自排匀（英文第二句不会剩一个「through.」掉到第三行） */}
          <p className="bp-farewell">
            {/* 刚做好的蓝图：她亲口说的那两句（lineText('bp.end')：第一人称，和她的声音一字不差 —— 声音 SPEC 规则 7） */}
            {fresh ? (
              farewellLines().map((s, i) => <span key={i}>{i ? phrased(s, { sentences: false }) : s}</span>)
            ) : (
              <>
                <span>{t('{0}一直帮你记着。', [guideName()])}</span>
                <span>{phrased(t('接下来，我们会把它变成你看得见、走得进的 3D 家。'), { sentences: false })}</span>
              </>
            )}
          </p>
          <p className="fine">
            {BRAND.app} {BRAND.by} · {BRAND.house} · {BRAND.venue}
          </p>
        </section>
      </article>

      <nav className="bp-actions no-print" aria-label={t('蓝图')}>
        <a
          className="btn btn-gold"
          href={links.studio || '#'}
          onClick={(e) => {
            if (!links.studio) return e.preventDefault();
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return; // 员工在电脑上开新分页：照常
            e.preventDefault();
            if (leaving) return;
            setLeaving(true);
            fx.scan(e.currentTarget);
            // 一大片暮色拂过，再打开 3D（最暗的那一刻换页，看不到跳）
            const href = links.studio;
            const w = fx.wipe(null, { tone: 'dusk', duration: 900 });
            settle(null, w.mid, () => {
              tellShell('leaving', { to: 'studio', tone: 'dusk' }); // 许愿模式：外壳先盖一层暮色，换页时不闪米色
              location.assign(href);
            }, 900);
          }}
        >
          <House size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('在 3D 里看见它')}</span>
        </a>
        {/* 许愿模式（展厅共用的 iPad）不发 WhatsApp：wa.me 会跳出 kiosk，开一个新窗口 */}
        {!WISH && (
          <a className="btn btn-line" href={waLink(text)} target="_blank" rel="noopener">
            <MessageCircle size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('发给设计师')}</span>
          </a>
        )}
        <button type="button" className="btn btn-line" onClick={savePoster} disabled={busy} data-sfx={WISH ? 'open' : undefined}>
          {busy ? <Download size={18} strokeWidth={1.8} aria-hidden="true" /> : <ImageIcon size={18} strokeWidth={1.8} aria-hidden="true" />}
          <span>{busy ? t('画海报中…') : t('分享海报')}</span>
        </button>
        <button type="button" className="btn btn-line" onClick={() => window.print()}>
          <Printer size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('打印 / PDF')}</span>
        </button>
        {/* 许愿模式的客人版不放「复制链接」：展厅共用 iPad 的剪贴板不该留着上一位客人的蓝图（带走用海报旁的二维码） */}
        {(!WISH || designer) && (
          <button
            type="button"
            className="btn btn-line"
            onClick={(e) => (designer ? copy(text, t('整份文字已复制'), e.currentTarget) : copy(links.bp, t('链接已复制'), e.currentTarget))}
          >
            {designer ? <Copy size={18} strokeWidth={1.8} aria-hidden="true" /> : <Link2 size={18} strokeWidth={1.8} aria-hidden="true" />}
            <span>{designer ? t('复制全文') : t('复制链接')}</span>
          </button>
        )}
        {/* 展厅里（刚做完 / 本机存档 / 员工 / 带陪同人）才是「下一位」；客人在家打开分享的蓝图 = 「重新许愿」 */}
        {onRestart && !WISH && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (leaving) return;
              setLeaving(true);
              // 一大片晨光拂过 → 下一位客人的开场；展厅里（下一位）潘吉说再见
              const bye = showroom || STAFF;
              const w = fx.wipe(null, { tone: 'dawn', duration: 1000 });
              settle(
                null,
                w.mid,
                () => {
                  onRestart();
                  if (bye) voice.say('bye.next');
                },
                900
              );
            }}
          >
            <RotateCcw size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{showroom || STAFF ? t('下一位') : t('重新许愿')}</span>
          </button>
        )}
      </nav>
      {take && <TakeHome poster={take} link={links.bp} title={t('我的梦想家牌：{0}', [name])} onClose={() => setTake('')} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
