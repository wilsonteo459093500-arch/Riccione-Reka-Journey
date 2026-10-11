// 入口：两个分开的功能 —— 占卜（客人玩）/ 3D 工作室（设计师、销售）＋ 本机的蓝图档案。

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import '../quiz/quiz.css';
import './launcher.css';
import '../wish/wish.css';
import Pangie from '../shared/Pangie.jsx';
import { BRAND, GUIDE, CONFIG } from '../shared/config.js';
import WishShell from '../wish/WishShell.jsx';
import { zen, startWish, wishStartUrl, savedHost, saveHost, exitFullscreen } from '../wish/start.js';
import { loadArchive, removeFromArchive } from '../shared/profile.js';
import { DREAMER_BY_CODE } from '../shared/dreamers.js';

function Launcher() {
  const [list, setList] = useState(loadArchive);
  const [wish, setWish] = useState(false);
  const [host, setHost] = useState(savedHost);
  if (wish)
    return (
      <WishShell
        zen={zen}
        startUrl={wishStartUrl(host)}
        onExit={async () => {
          await zen.stop(1.5);
          exitFullscreen();
          setWish(false);
          setList(loadArchive());
        }}
      />
    );
  return (
    <div className="ln">
      <header className="ln-head">
        <div className="brand">
          <b>{BRAND.app}</b>
          <span>
            {BRAND.by} · {BRAND.house}
          </span>
        </div>
      </header>
      <main className="ln-main">
        <section className="ln-hero">
          <Pangie mood="wink" size={150} />
          <div>
            <p className="eyebrow">THE DREAM HOME, BEFORE IT IS BUILT</p>
            <h1 className="h-display">
              先读懂一个家，
              <br />
              再把它变出来。
            </h1>
            <p className="lead">
              客人第一次到展厅：先和熊猫精灵{GUIDE.name}玩 5 分钟占卜，说出他心里的家；
              <br />
              设计师接着打开 3D 工作室，把平面图和他的答案，马上变成看得见的概念。
            </p>
          </div>
        </section>

        <section className="ln-wish">
          <button
            type="button"
            className="ln-wish-btn"
            onClick={() => {
              startWish(); // 声音必须在这一下点击里开启
              setWish(true);
            }}
          >
            <span className="ln-wish-ico">🪔</span>
            <span>
              <b>客户许愿模式</b>
              <em>按下就开始：大自然禅意音乐 + 潘吉带客人从占卜一路走到 3D</em>
            </span>
          </button>
          {CONFIG.team.length > 1 && (
            <label className="ln-host">
              陪同人
              <select
                value={host}
                onChange={(e) => {
                  setHost(e.target.value);
                  saveHost(e.target.value);
                }}
              >
                <option value="">（不指定）</option>
                {CONFIG.team.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <div className="ln-cards">
          <a className="ln-card reading" href="quiz.html">
            <span className="ln-num">I</span>
            <b>梦想家占卜</b>
            <em>The Dream Home Reading</em>
            <p>给客人玩 · iPad / 手机 · 约 5 分钟。五张牌：直觉、生活、宝藏、三个愿望、禁忌 → 得到一份「专属梦想家概念蓝图」。</p>
            <span className="ln-go">开始占卜 →</span>
          </a>
          <a className="ln-card studio" href="studio.html">
            <span className="ln-num">II</span>
            <b>3D 梦想工作室</b>
            <em>WISH Studio</em>
            <p>给设计师 / 销售 · 电脑 / 大屏。上传平面图 → 自动生成 3D；拖拽换材质、一键情绪、24 小时光影；演示模式可当展厅宣传片。</p>
            <span className="ln-go">打开工作室 →</span>
          </a>
        </div>

        <section className="ln-archive">
          <h2>这台设备上的梦想家蓝图（{list.length}）</h2>
          {list.length === 0 && <p className="fine">还没有。客人占卜完会自动存在这里（只存在这台设备）。</p>}
          <div className="ln-list">
            {list.map((p) => {
              const d = DREAMER_BY_CODE[p.code];
              return (
                <div key={p.id} className="ln-row">
                  <span className="ln-mini">{d?.num}</span>
                  <div className="ln-row-main">
                    <b>{p.name || '贵宾'}</b>
                    <em>
                      {d?.zh} · {p.code} · {new Date(p.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </em>
                  </div>
                  <a className="btn-line small" href={`quiz.html#id=${encodeURIComponent(p.id)}`}>
                    蓝图
                  </a>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      if (!confirm(`删除 ${p.name || '这位贵宾'} 的蓝图？`)) return;
                      removeFromArchive(p.id);
                      setList(loadArchive());
                    }}
                  >
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Launcher />
  </StrictMode>
);
