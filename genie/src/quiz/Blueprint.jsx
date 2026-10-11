// 「专属梦想家概念蓝图」—— 占卜的结尾（峰终定律的「终」），也是设计师接手的第一份文件。
// 两种视角：客人版（被看见、被认真对待）/ 设计师版（矛盾、风险、要问的话、英文关键词）。

import { useEffect, useMemo, useRef, useState } from 'react';
import Pangie from '../shared/Pangie.jsx';
import Emblem from '../shared/Emblem.jsx';
import { DreamerCard } from './Reveal.jsx';
import { DREAMER_BY_CODE, AXES, HIDDEN_AXES } from '../shared/dreamers.js';
import { MAT_BY_ID, SLOT_BY_ID } from '../shared/materials.js';
import { swatchURL } from '../shared/textures.js';
import { storagePlan, insights, packJSON, slimProfile } from '../shared/profile.js';
import { profileText, waLink, lifeLabel, WISH_LABEL, AVOID_LABEL } from '../shared/summary.js';
import { BRAND, GUIDE, hostFromCode } from '../shared/config.js';
import { APPLIANCES, PAIRS, SPLURGE } from './flow.js';
import { renderPoster } from './poster.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const BOARD_SLOTS = ['floor', 'walls', 'feature', 'cabinetry', 'countertop', 'upholstery', 'rugs', 'accents'];
const LEVEL = { conflict: { icon: '⚠️', zh: '要聊清楚' }, note: { icon: '📐', zh: '设计要点' }, tip: { icon: '💡', zh: '沟通建议' } };

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function Blueprint({ profile, onRestart, fresh = false }) {
  const [mode, setMode] = useState('client');
  const [links, setLinks] = useState({ bp: '', studio: '' });
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const d = DREAMER_BY_CODE[profile.code];
  const plan = useMemo(() => storagePlan(profile.storage, APPLIANCES), [profile]);
  const tips = useMemo(() => insights(profile, plan), [profile, plan]);
  const host = hostFromCode(profile.host);
  const pangieRef = useRef(null);
  const emblemRef = useRef(null);

  useEffect(() => {
    let alive = true;
    packJSON(slimProfile(profile)).then((packed) => {
      if (!alive) return;
      setLinks({
        bp: new URL(`quiz.html#bp=${packed}`, location.href).href,
        studio: new URL(`studio.html#p=${packed}`, location.href).href,
      });
    });
    return () => {
      alive = false;
    };
  }, [profile]);

  const flash = (t) => {
    setToast(t);
    setTimeout(() => setToast(''), 2200);
  };

  const text = profileText(profile, plan, links.bp);
  const date = new Date(profile.createdAt);
  const quick = Object.entries(profile.answers?.pairs || {}).filter(([, a]) => a.ms < 1600);

  const savePoster = async () => {
    setBusy(true);
    try {
      const blob = await renderPoster(profile, { pangieEl: pangieRef.current?.querySelector('svg'), emblemEl: emblemRef.current?.querySelector('svg') });
      if (blob) {
        const file = new File([blob], `GENIE-${profile.code}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `我的梦想家牌：${d.zh}` }).catch(() => download(blob, file.name));
        } else download(blob, file.name);
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async (t, msg = '已复制') => {
    try {
      await navigator.clipboard.writeText(t);
      flash(msg);
    } catch {
      flash('复制失败，请手动选取');
    }
  };

  return (
    <div className={`bp-page mode-${mode}`}>
      {/* 隐藏的素材：海报用 */}
      <div className="sr-only" aria-hidden="true">
        <div ref={pangieRef}>
          <Pangie mood="happy" prop="ball" size={260} float={false} />
        </div>
        <div ref={emblemRef}>
          <Emblem name={d.emblem} size={160} color="#B98A3B" />
        </div>
      </div>

      <header className="bp-head">
        <div>
          <p className="eyebrow">DREAMER CONCEPT BLUEPRINT</p>
          <h1 className="bp-title">专属梦想家概念蓝图</h1>
          <p className="bp-meta">
            为 <b>{profile.name || '贵宾'}</b> 绘制 · {date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} · No. {profile.id}
            {host ? ` · 陪同：${host.name}` : ''}
          </p>
        </div>
        <div className="seg no-print" role="tablist">
          <button type="button" className={mode === 'client' ? 'on' : ''} onClick={() => setMode('client')}>
            客人版
          </button>
          <button type="button" className={mode === 'designer' ? 'on' : ''} onClick={() => setMode('designer')}>
            设计师版
          </button>
        </div>
      </header>

      {/* 一 · 你的牌 */}
      <section className="bp-sec bp-hero">
        <DreamerCard profile={profile} />
        <div className="bp-hero-text">
          <p className="eyebrow">
            {d.num} · {d.en}
          </p>
          <h2 className="bp-h2">{d.zh}</h2>
          <p className="bp-quote">「{d.tagline}」</p>
          <p>{d.desc}</p>
          <div className="axes">
            {AXES.map((ax) => {
              const v = profile.axes[ax.id];
              return (
                <div key={ax.id} className="axis">
                  <span className={`axis-l ${v >= 50 ? 'win' : ''}`}>
                    {ax.a.zh} <i>{ax.a.en}</i>
                  </span>
                  <div className="axis-track">
                    <div className="axis-fill" style={{ width: `${v}%` }} />
                    <b>{v >= 50 ? v : 100 - v}%</b>
                  </div>
                  <span className={`axis-r ${v < 50 ? 'win' : ''}`}>
                    {ax.b.zh} <i>{ax.b.en}</i>
                  </span>
                </div>
              );
            })}
            {mode === 'designer' &&
              HIDDEN_AXES.map((ax) => {
                const v = profile.hidden?.[ax.id] ?? 50;
                return (
                  <div key={ax.id} className="axis hidden-axis">
                    <span className={`axis-l ${v >= 50 ? 'win' : ''}`}>{ax.a.zh}</span>
                    <div className="axis-track">
                      <div className="axis-fill" style={{ width: `${v}%` }} />
                      <b>{v >= 50 ? v : 100 - v}%</b>
                    </div>
                    <span className={`axis-r ${v < 50 ? 'win' : ''}`}>{ax.b.zh}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      {/* 二 · 色板与材质 */}
      <section className="bp-sec">
        <h3 className="bp-h3">
          <span>II</span> 情绪色板 · 材质板
        </h3>
        <div className="palette-row">
          {d.palette.map((c) => (
            <div key={c} className="pal">
              <i style={{ background: c }} />
              <span>{c}</span>
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
                  <span>{SLOT_BY_ID[s].zh}</span>
                  <b>{m?.zh}</b>
                  <i>{m?.en}</i>
                </figcaption>
              </figure>
            );
          })}
        </div>
        {profile.swaps?.length > 0 && (
          <p className="bp-note">
            🚫 已按你的雷区避开：
            {profile.swaps.map((s) => `${MAT_BY_ID[s.from]?.zh} → ${MAT_BY_ID[s.to]?.zh}`).join('；')}
          </p>
        )}
      </section>

      {/* 三 · 生活 */}
      <section className="bp-sec two">
        <div>
          <h3 className="bp-h3">
            <span>III</span> 你的生活
          </h3>
          <ul className="life-list">
            <li>
              <i>☀️</i>星期六早上：<b>{lifeLabel('saturday', profile.life.saturday) || '—'}</b>
            </li>
            <li>
              <i>🚪</i>一进家门：<b>{lifeLabel('home', profile.life.home) || '—'}</b>
            </li>
            <li>
              <i>🍳</i>厨房：<b>{lifeLabel('cook', profile.life.cook) || '—'}</b>
            </li>
            <li>
              <i>🤫</i>最想藏起来：<b>{lifeLabel('bell', profile.life.bell) || '—'}</b>
            </li>
            {profile.life.who?.length > 0 && (
              <li>
                <i>👨‍👩‍👧</i>家里还有：<b>{profile.life.who.map((v) => lifeLabel('who', v)).join('、')}</b>
              </li>
            )}
          </ul>
        </div>
        <div>
          <h3 className="bp-h3">
            <span>IV</span> 三个愿望
          </h3>
          <ol className="wish-list">
            {(profile.wishes || []).map((w) => (
              <li key={w}>🪔 {WISH_LABEL[w]}</li>
            ))}
          </ol>
          {profile.splurge && <p className="bp-note">💛 最舍得花钱：{SPLURGE.find((s) => s.v === profile.splurge)?.label}</p>}
          {profile.avoid?.length > 0 && (
            <div className="nogo-list">
              {profile.avoid.map((a) => (
                <span key={a}>✕ {AVOID_LABEL[a] || a}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 四 · 收纳 */}
      <section className="bp-sec">
        <h3 className="bp-h3">
          <span>V</span> 收纳蓝图 <em>（按你数的宝藏换算，见面时再精确量）</em>
        </h3>
        <div className="store-grid">
          <div className="store">
            <i>👟</i>
            <span>鞋柜</span>
            <b>{plan.shoeCabinetMM ? `${fmt(plan.shoeCabinetMM)} mm` : '—'}</b>
            <em>约 {plan.shoes} 双</em>
          </div>
          <div className="store">
            <i>👗</i>
            <span>主卧衣柜</span>
            <b>{plan.wardrobeMM ? `${fmt(plan.wardrobeMM)} mm` : '—'}</b>
            <em>长挂 {fmt(plan.longHangMM)} · 短挂 {fmt(plan.shortHangMM)}</em>
          </div>
          <div className="store">
            <i>📚</i>
            <span>书墙层板</span>
            <b>{plan.bookshelfMM ? `${fmt(plan.bookshelfMM)} mm` : '—'}</b>
            <em>{profile.storage.books || 0} 层</em>
          </div>
          <div className="store">
            <i>🍳</i>
            <span>家电</span>
            <b>{plan.applianceCount} 件</b>
            <em>
              台面 {fmt(plan.counterMM)} mm{plan.applianceTallCabinet ? ' · 电器高柜' : ''}
            </em>
          </div>
          <div className="store">
            <i>🧳</i>
            <span>大家伙</span>
            <b>{plan.bulky} 类</b>
            <em>{plan.needsStoreroom ? '建议储物间' : '高柜即可'}</em>
          </div>
          <div className="store">
            <i>🫙</i>
            <span>藏 : 展</span>
            <b>
              {100 - plan.displayPct} : {plan.displayPct}
            </b>
            <em>{plan.displayPct >= 40 ? '大方展示' : plan.displayPct >= 20 ? '藏中有展' : '几乎全藏'}</em>
          </div>
        </div>
      </section>

      {profile.wish && (
        <section className="bp-sec bp-wish">
          <p className="eyebrow">你说，这个家只要做到一件事 ——</p>
          <blockquote>「{profile.wish}」</blockquote>
        </section>
      )}

      {/* 设计师版 */}
      {mode === 'designer' && (
        <section className="bp-sec bp-designer">
          <h3 className="bp-h3">
            <span>✦</span> 设计师视角
          </h3>
          <div className="dz-grid">
            <div>
              <h4>设计语言</h4>
              <dl>
                <dt>风格</dt>
                <dd>{d.design.style}</dd>
                <dt>色温</dt>
                <dd>{d.design.kelvin}</dd>
                <dt>柜门</dt>
                <dd>{d.design.doors}</dd>
                <dt>藏:展（牌面）</dt>
                <dd>
                  {d.design.ratio[0]} : {d.design.ratio[1]}（客人自评 {100 - plan.displayPct} : {plan.displayPct}）
                </dd>
                <dt>线条</dt>
                <dd>{(profile.hidden?.curve ?? 50) >= 55 ? '偏圆润：柜体圆角、拱形、弧形沙发' : (profile.hidden?.curve ?? 50) <= 45 ? '偏利落：直线、薄边、方正' : '中性'}</dd>
              </dl>
              <h4>出图关键词（英文，可贴给 AI 出图）</h4>
              <p className="kw">{d.design.en}</p>
              <button type="button" className="btn-line small no-print" onClick={() => copy(d.design.en)}>
                复制关键词
              </button>
            </div>
            <div>
              <h4>见面时要聊的（{tips.length}）</h4>
              <ul className="tips">
                {tips.map((t, i) => (
                  <li key={i} className={`tip-${t.level}`}>
                    <span>
                      {LEVEL[t.level].icon} {LEVEL[t.level].zh}
                    </span>
                    {t.text}
                  </li>
                ))}
              </ul>
              {quick.length > 0 && (
                <>
                  <h4>秒选（1.6 秒内，很确定）</h4>
                  <p className="quick">
                    {quick
                      .map(([id, a]) => {
                        const pr = PAIRS.find((p) => p.id === id);
                        return pr ? `${pr[a.pick].label}` : null;
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
        <div className="seal">
          <span>盼吉</span>
          <small>认证</small>
        </div>
        <div className="bp-end-pangie">
          <Pangie mood="wink" prop="ball" size={130} />
        </div>
        <p className="bp-farewell">
          {fresh ? `你的梦想，${GUIDE.name}记住了。` : `${GUIDE.name}一直帮你记着。`}
          <br />
          接下来，我们会把它变成你看得见、走得进的 3D 家。
        </p>
        <p className="fine">
          {BRAND.app} {BRAND.by} · {BRAND.house} · {BRAND.venue}
        </p>
      </section>

      <nav className="bp-actions no-print">
        <a className="btn-gold" href={links.studio || '#'} onClick={(e) => !links.studio && e.preventDefault()}>
          🏠 在 3D 里看见它
        </a>
        <a className="btn-line" href={waLink(text)} target="_blank" rel="noopener">
          💬 发给设计师
        </a>
        <button type="button" className="btn-line" onClick={savePoster} disabled={busy}>
          {busy ? '画海报中…' : '🖼️ 分享海报'}
        </button>
        <button type="button" className="btn-line" onClick={() => window.print()}>
          🖨️ 打印 / PDF
        </button>
        <button type="button" className="btn-line" onClick={() => copy(mode === 'designer' ? text : links.bp, mode === 'designer' ? '整份文字已复制' : '链接已复制')}>
          🔗 {mode === 'designer' ? '复制全文' : '复制链接'}
        </button>
        {onRestart && (
          <button type="button" className="btn-ghost" onClick={onRestart}>
            ↺ 下一位
          </button>
        )}
      </nav>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
