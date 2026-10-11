// 「专属梦想家概念蓝图」—— 许愿之旅的结尾（峰终定律的「终」），也是设计师接手的第一份文件。
// 两种视角：客人版（被看见、被认真对待）/ 设计师版（矛盾、风险、要问的话、英文关键词）。
//
// 设计师版绝不能漏给客人：
//   · 只有网址带 ?staff=1（而且不在许愿模式里）才出现「客人版 / 设计师版」切换；
//   · 许愿模式里，只能由外壳的员工区发 {type:'designer'} 打开；
//   · 给客人的链接 / 海报 / 二维码都是普通链接；只有发到公司 WhatsApp 的那条带 ?staff=1。

import { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import Pangie, { Lamp } from '../shared/Pangie.jsx';
import Emblem from '../shared/Emblem.jsx';
import { DreamerCard } from './Reveal.jsx';
import { Segmented } from './ui.jsx';
import { Ico } from './icons.jsx';
import { Painting } from './paint.jsx';
import { SceneCaption } from './Scenery.jsx';
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

const WISH = isWishMode();
/** 员工视角：网址带 ?staff=1，而且不在许愿模式里（许愿模式只认外壳的 designer 消息） */
const STAFF = (() => {
  try {
    return !WISH && new URLSearchParams(location.search).get('staff') === '1';
  } catch {
    return false;
  }
})();

const BOARD_SLOTS = ['floor', 'walls', 'feature', 'cabinetry', 'countertop', 'upholstery', 'rugs', 'accents'];
const LEVEL = { conflict: { Icon: AlertTriangle, zh: '要聊清楚' }, note: { Icon: Ruler, zh: '设计要点' }, tip: { Icon: Lightbulb, zh: '沟通建议' } };

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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

export default function Blueprint({ profile, onRestart, fresh = false }) {
  const [staffOn, setStaffOn] = useState(STAFF);
  const [mode, setMode] = useState('client');
  const [links, setLinks] = useState({ bp: '', bpStaff: '', studio: '' });
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const d = DREAMER_BY_CODE[profile.code];
  const plan = useMemo(() => storagePlan(profile.storage, APPLIANCES), [profile]);
  const tips = useMemo(() => insights(profile, plan), [profile, plan]);
  const host = hostFromCode(profile.host);
  const pangieRef = useRef(null);
  const emblemRef = useRef(null);
  const sceneRef = useRef(null);
  const toastTimer = useRef(null);
  const sceneId = sceneForProfile(profile);
  const designer = staffOn && mode === 'designer';

  useEffect(() => {
    let alive = true;
    packJSON(slimProfile(profile)).then((packed) => {
      if (!alive) return;
      setLinks({
        bp: withLang(new URL(`quiz.html#bp=${packed}`, location.href).href),
        bpStaff: withLang(new URL(`quiz.html?staff=1#bp=${packed}`, location.href).href),
        studio: withLang(new URL(`studio.html${WISH ? '?mode=wish' : ''}#p=${packed}`, location.href).href),
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
    tellShell('page', { page: 'blueprint' });
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
    if (STAFF) tellShell('staff-ready');
    return () => {
      window.removeEventListener('message', onMsg);
      clearTimeout(toastTimer.current);
    };
  }, []);

  if (!d) return null;

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  // 发到公司 WhatsApp 的那条带 ?staff=1（设计师点开直接是设计师版）
  const text = profileText(profile, plan, links.bpStaff);
  const date = new Date(profile.createdAt);
  const name = L({ zh: d.zh, en: d.en });
  const touched = profile.storage?.touched || null;
  const unsure = (k) => designer && touched && !touched[k];
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
      if (blob) {
        const file = new File([blob], `WISH-${profile.code}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: t('我的梦想家牌：{0}', [name]) }).catch(() => download(blob, file.name));
        } else download(blob, file.name);
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async (s, msg) => {
    try {
      await navigator.clipboard.writeText(s);
      flash(msg || t('已复制'));
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
      <b className="store-num">{mm ? `${fmt(mm)} mm` : extra || '—'}</b>
      {!designer && mm ? <span className="store-ft">{ftNote(mm)}</span> : null}
      {sub && <em>{sub}</em>}
      {unsure(key) && <span className="store-flag">{t('（默认值，未确认）')}</span>}
    </div>
  );

  return (
    <div className={`bp-page mode-${designer ? 'designer' : 'client'}`}>
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
        <Painting id={sceneId} className="bp-band-paint" />
        <SceneCaption id={sceneId} />
      </div>

      <article className="bp-doc">
        <header className="bp-head">
          <div className="bp-head-text">
            <p className="eyebrow">{t('梦想家概念蓝图')}</p>
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
              onChange={setMode}
              options={[
                { v: 'client', label: t('客人版') },
                { v: 'designer', label: t('设计师版') },
              ]}
            />
          )}
        </header>

        {/* I · 你的牌 */}
        <section className="bp-sec bp-hero">
          <div className="bp-hero-card">
            <DreamerCard profile={profile} />
          </div>
          <div className="bp-hero-text">
            <p className="eyebrow">
              {d.num} · {isEn() ? d.zh : d.en}
            </p>
            <h2 className="bp-h2">{name}</h2>
            <p className="bp-quote">{t(d.tagline)}</p>
            <p className="bp-desc">{t(d.desc)}</p>
            <div className="axes">
              {AXES.map((ax) => {
                const v = profile.axes[ax.id];
                return (
                  <div key={ax.id} className="axis">
                    <span className="axis-dim">{L({ zh: ax.zh, en: ax.en })}</span>
                    <span className={`axis-l ${v >= 50 ? 'win' : ''}`}>{L(ax.a)}</span>
                    <div className="axis-track">
                      <div className="axis-fill" style={{ width: `${v}%` }} />
                    </div>
                    <span className={`axis-r ${v < 50 ? 'win' : ''}`}>{L(ax.b)}</span>
                    <b className="axis-pct">{v >= 50 ? v : 100 - v}%</b>
                  </div>
                );
              })}
              {designer &&
                HIDDEN_AXES.map((ax) => {
                  const v = profile.hidden?.[ax.id] ?? 50;
                  return (
                    <div key={ax.id} className="axis hidden-axis">
                      <span className="axis-dim">{t(ax.zh)}</span>
                      <span className={`axis-l ${v >= 50 ? 'win' : ''}`}>{L(ax.a)}</span>
                      <div className="axis-track">
                        <div className="axis-fill" style={{ width: `${v}%` }} />
                      </div>
                      <span className={`axis-r ${v < 50 ? 'win' : ''}`}>{L(ax.b)}</span>
                      <b className="axis-pct">{v >= 50 ? v : 100 - v}%</b>
                    </div>
                  );
                })}
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
                {profile.swaps.map((s) => `${L(MAT_BY_ID[s.from])} → ${L(MAT_BY_ID[s.to])}`).join(isEn() ? '; ' : '；')}
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
              <div className="nogo-list">
                {profile.avoid.map((a) => (
                  <span key={a}>{t(AVOID_LABEL[a] || a)}</span>
                ))}
              </div>
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
                  <dd>{t(d.design.doors)}</dd>
                  <dt>{t('藏:展（牌面）')}</dt>
                  <dd>
                    {d.design.ratio[0]} : {d.design.ratio[1]}
                    {t('（客人自评 {0}）', [`${100 - plan.displayPct} : ${plan.displayPct}`])}
                  </dd>
                  <dt>{t('线条')}</dt>
                  <dd>{curve >= 55 ? t('偏圆润（沙发那题选了圆的）：弧形沙发 / 圆几；柜体要不要圆角，见面再问') : curve <= 45 ? t('偏利落：直线、薄边、方正') : t('中性')}</dd>
                </dl>
                <h4>{t('出图关键词（英文，可贴给 AI 出图）')}</h4>
                <p className="kw">{d.design.en}</p>
                <button type="button" className="btn btn-line small no-print" onClick={() => copy(d.design.en)}>
                  <Copy size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span>{t('复制关键词')}</span>
                </button>
              </div>
              <div>
                <h4>{t('见面时要聊的（{0}）', [tips.length])}</h4>
                <ul className="tips">
                  {tips.map((tp, i) => {
                    const lv = LEVEL[tp.level] || LEVEL.note;
                    return (
                      <li key={i} className={`tip-${tp.level}`}>
                        <span className="tip-kind">
                          <lv.Icon size={14} strokeWidth={2} aria-hidden="true" />
                          {t(lv.zh)}
                        </span>
                        {tp.text}
                      </li>
                    );
                  })}
                </ul>
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
          <div className="seal" aria-hidden="true">
            <span>{guideName()}</span>
            <small>{t('认证')}</small>
          </div>
          <div className="bp-end-pangie">
            <Pangie mood="wink" prop="ball" size={120} />
          </div>
          <p className="bp-farewell">
            {fresh ? t('你的梦想，{0}记住了。', [guideName()]) : t('{0}一直帮你记着。', [guideName()])}
            <br />
            {t('接下来，我们会把它变成你看得见、走得进的 3D 家。')}
          </p>
          <p className="fine">
            {BRAND.app} {BRAND.by} · {BRAND.house} · {BRAND.venue}
          </p>
        </section>
      </article>

      <nav className="bp-actions no-print" aria-label={t('蓝图')}>
        <a className="btn btn-gold" href={links.studio || '#'} onClick={(e) => !links.studio && e.preventDefault()}>
          <House size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('在 3D 里看见它')}</span>
        </a>
        <a className="btn btn-line" href={waLink(text)} target="_blank" rel="noopener">
          <MessageCircle size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('发给设计师')}</span>
        </a>
        <button type="button" className="btn btn-line" onClick={savePoster} disabled={busy}>
          {busy ? <Download size={18} strokeWidth={1.8} aria-hidden="true" /> : <ImageIcon size={18} strokeWidth={1.8} aria-hidden="true" />}
          <span>{busy ? t('画海报中…') : t('分享海报')}</span>
        </button>
        <button type="button" className="btn btn-line" onClick={() => window.print()}>
          <Printer size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('打印 / PDF')}</span>
        </button>
        <button type="button" className="btn btn-line" onClick={() => (designer ? copy(text, t('整份文字已复制')) : copy(links.bp, t('链接已复制')))}>
          {designer ? <Copy size={18} strokeWidth={1.8} aria-hidden="true" /> : <Link2 size={18} strokeWidth={1.8} aria-hidden="true" />}
          <span>{designer ? t('复制全文') : t('复制链接')}</span>
        </button>
        {onRestart && !WISH && (
          <button type="button" className="btn btn-ghost" onClick={onRestart}>
            <RotateCcw size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('下一位')}</span>
          </button>
        )}
      </nav>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
