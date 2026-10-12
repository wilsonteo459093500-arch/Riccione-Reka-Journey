// 入口页（员工用）：
//   · 客户许愿模式 —— 大按钮。就在这一页里打开（同一个 Zen 实例）：声音必须在「按下按钮」的这一下开启，
//     所以欢迎画面出现时就已经有音乐；客人在欢迎画面选「中文开始 / Begin in English」。
//   · 两个分开的功能：许愿之旅（客人玩）/ 3D 梦想工作室（设计师、销售用）。
//   · 本机的梦想家蓝图：收在「员工 · 本机蓝图」里，默认折叠；每一行用 ?staff=1 打开（才有设计师版）。

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ChevronDown, Cuboid, Footprints, LockKeyhole, Trash2 } from 'lucide-react';
import '../shared/base.css';
import './launcher.css';
import Pangie, { Lamp } from '../shared/Pangie.jsx';
import LangToggle from '../shared/LangToggle.jsx';
import { BRAND, CONFIG } from '../shared/config.js';
import { t, tj, L, isEn, guideName, useLang } from '../shared/i18n.js';
import WishMode from '../wish/WishMode.jsx';
import { startWish, savedHost, saveHost } from '../wish/start.js';
import { loadArchive, removeFromArchive } from '../shared/profile.js';
import { DREAMER_BY_CODE } from '../shared/dreamers.js';

// 中文模式：英文做装饰小字；英文模式：中文做那一行小字（像精品店的双语名牌）
const pair = (zh, en) => (isEn() ? { main: t(zh), alt: zh, altLang: 'zh-Hans' } : { main: zh, alt: en, altLang: 'en' });

function when(iso) {
  try {
    return new Date(iso).toLocaleString(isEn() ? 'en-GB' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function ArchiveRow({ p, onRemove }) {
  const d = DREAMER_BY_CODE[p.code];
  const swatch = d?.palette?.length ? `linear-gradient(90deg, ${d.palette.map((c, i, a) => `${c} ${(i / a.length) * 100}% ${((i + 1) / a.length) * 100}%`).join(', ')})` : 'none';
  return (
    <li className="ln-row">
      <span className="ln-mini" style={{ '--sw': swatch }} aria-hidden="true">
        {d?.num}
      </span>
      <div className="ln-row-main">
        <b>{p.name || t('贵宾')}</b>
        <span>{[d ? L({ zh: d.zh, en: d.en }) : '', p.code, when(p.createdAt)].filter(Boolean).join(' · ')}</span>
      </div>
      <a className="ln-btn" href={`quiz.html?staff=1#id=${encodeURIComponent(p.id)}`}>
        {t('蓝图')}
      </a>
      <button type="button" className="ln-del" aria-label={t('删除')} title={t('删除')} onClick={() => onRemove(p)}>
        <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </li>
  );
}

function Launcher() {
  const lang = useLang();
  const [list, setList] = useState(loadArchive);
  const [wish, setWish] = useState(false);
  const [host, setHost] = useState(savedHost);

  useEffect(() => {
    if (!wish) document.title = 'WISH · by Riccione Reka';
  }, [wish, lang]);

  if (wish)
    return (
      <WishMode
        primed
        host={host}
        onExit={() => {
          setWish(false);
          setList(loadArchive());
          window.scrollTo(0, 0);
        }}
      />
    );

  const journey = pair('许愿之旅', BRAND.readingEn);
  const studio = pair('3D 梦想工作室', '3D Dream Studio');
  const wishName = pair('客户许愿模式', 'Wish Mode');
  const remove = (p) => {
    if (!confirm(t('删除 {0} 的蓝图？', [p.name || t('这位贵宾')]))) return;
    removeFromArchive(p.id);
    setList(loadArchive());
  };

  return (
    <div className="ln">
      <header className="ln-head">
        <div className="ln-brand">
          <b>{BRAND.app}</b>
          <span>
            {BRAND.by} · {BRAND.house}
          </span>
        </div>
        <LangToggle />
      </header>

      <main className="ln-main">
        <section className="ln-hero">
          <Pangie mood="wink" size={150} className="ln-pangie" />
          <div className="ln-hero-text">
            <p className="ln-eyebrow" lang={isEn() ? 'zh-Hans' : 'en'}>
              {isEn() ? '梦想的家，在动工之前' : 'The dream home, before it is built'}
            </p>
            <h1 className="ln-h1">
              {t('先读懂一个家，')}
              <br />
              {t('再把它变出来。')}
            </h1>
            <p className="ln-lead">
              {tj('客人第一次到展厅：先和熊猫精灵{0}花几分钟许个愿，说出他心里的家；', [guideName()])}
              {isEn() ? ' ' : ''}
              {t('设计师接着打开 3D 工作室，把平面图和他的答案，马上变成看得见的概念。')}
            </p>
          </div>
        </section>

        <section className="ln-wish dusk" aria-labelledby="ln-wish-title">
          <i className="ln-ff" aria-hidden="true" />
          <i className="ln-ff b" aria-hidden="true" />
          <i className="ln-ff c" aria-hidden="true" />
          <button
            type="button"
            className="ln-wish-go"
            onClick={() => {
              startWish(); // 声音、全屏、屏幕常亮都必须在这一下点击里开启
              setWish(true);
            }}
          >
            <span className="ln-lamp" aria-hidden="true">
              <Lamp size={86} glow={1} smoke />
            </span>
            <span className="ln-wish-text">
              <b id="ln-wish-title">{wishName.main}</b>
              <em lang={wishName.altLang}>{wishName.alt}</em>
              <span>{t('按下就开始：大自然禅意音乐 + 潘吉带客人从许愿一路走到 3D')}</span>
              <small>{t('全屏 · 屏幕常亮 · 长按 WISH 字标 3 秒打开员工区')}</small>
            </span>
            <span className="ln-wish-cta">
              {t('开始')}
              <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
          {CONFIG.team.length > 1 && (
            <label className="ln-host">
              <span>{t('陪同人')}</span>
              <select
                value={host}
                onChange={(e) => {
                  setHost(e.target.value);
                  saveHost(e.target.value);
                }}
              >
                <option value="">{t('（不指定）')}</option>
                {CONFIG.team.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <div className="ln-cards">
          <a className="ln-card" href="quiz.html">
            <span className="ln-card-top">
              <span className="ln-num">I</span>
              <span className="ln-ico" aria-hidden="true">
                <Footprints size={22} strokeWidth={1.7} />
              </span>
            </span>
            <b className="ln-card-title">{journey.main}</b>
            <em className="ln-alt" lang={journey.altLang}>
              {journey.alt}
            </em>
            <span className="ln-desc">{t('给客人玩 · iPad / 手机 · 约 6–8 分钟。五张牌：直觉、生活、宝藏、三个愿望、雷区 → 得到一份「专属梦想家概念蓝图」。')}</span>
            <span className="ln-go">
              {t('开始许愿')}
              <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
            </span>
          </a>
          <a className="ln-card" href="studio.html">
            <span className="ln-card-top">
              <span className="ln-num">II</span>
              <span className="ln-ico" aria-hidden="true">
                <Cuboid size={22} strokeWidth={1.7} />
              </span>
            </span>
            <b className="ln-card-title">{studio.main}</b>
            <em className="ln-alt" lang={studio.altLang}>
              {studio.alt}
            </em>
            <span className="ln-desc">{t('给设计师 / 销售 · 电脑 / 大屏。上传平面图 → 自动生成 3D；拖拽换材质、一键情绪、24 小时光影；演示模式可当展厅宣传片。')}</span>
            <span className="ln-go">
              {t('打开工作室')}
              <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
            </span>
          </a>
        </div>

        <details className="ln-archive">
          <summary>
            <LockKeyhole size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('员工 · 本机蓝图（{0}）', [list.length])}</span>
            <ChevronDown className="ln-chev" size={18} strokeWidth={1.8} aria-hidden="true" />
          </summary>
          <div className="ln-archive-body">
            <p className="ln-note">{t('只存在这台设备。「蓝图」会打开设计师版 —— 不要在客人面前打开。')}</p>
            {list.length === 0 ? (
              <p className="ln-empty">{t('还没有。客人许完愿会自动存在这里（只存在这台设备）。')}</p>
            ) : (
              <ul className="ln-list">
                {list.map((p) => (
                  <ArchiveRow key={p.id} p={p} onRemove={remove} />
                ))}
              </ul>
            )}
          </div>
        </details>
      </main>

      <footer className="ln-foot">
        {BRAND.plinth} · {BRAND.venue}
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Launcher />
  </StrictMode>
);
