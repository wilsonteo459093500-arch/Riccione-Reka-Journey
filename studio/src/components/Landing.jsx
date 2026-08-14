import React from 'react';
import { ArrowRight, Film, Scissors, Send, Radar, Check } from 'lucide-react';
import Wordmark, { Mark } from './Wordmark.jsx';

const STEPS = [
  {
    icon: Film,
    kbd: '01',
    title: '构思',
    lead: '给它一条你想要那种感觉的视频',
    body: '它拆出结构骨架、逐拍时间码、节奏、调色和字幕规律 —— 以及最要紧的一份「素材清单」：要复刻它，你得准备哪几个镜头。',
  },
  {
    icon: Scissors,
    kbd: '02',
    title: '剪辑',
    lead: '把你的原片和案例图丢进来',
    body: '每条素材先过一遍 AI：里面是什么、哪几秒能用。然后排出时间轴，精确到第几秒切进切出。缺素材的地方会明确告诉你缺什么、怎么补拍。',
  },
  {
    icon: Send,
    kbd: '03',
    title: '发布',
    lead: '成片之外的活它也包了',
    body: '5 条不同角度的标题、可直接粘贴的正文、标签与搜索词、封面（能直接出图）、抢占第一条评论的话术，以及搬去别的平台要改什么。',
  },
];

const TRUTHS = [
  '参考视频不上传到我们的服务器 —— 要么直连 Google，要么根本没离开你的浏览器',
  'API key 只存在你这台设备上',
  '排完可以先「走一遍」：用你真实的素材按时间轴播一遍，节奏不对当场就看出来',
  '导出对齐 video-use 的 EDL 规范，出片在你自己电脑上跑',
];

export default function Landing({ onEnter }) {
  return (
    <div className="min-h-screen bg-sail-paper">
      {/* nav */}
      <header className="sticky top-0 z-40 bg-sail-paper/90 backdrop-blur border-b border-sail-line">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Wordmark sub="CONTENT STUDIO" />
          <button
            onClick={onEnter}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sail-green-deep text-white text-sm font-medium hover:bg-sail-green transition-colors"
          >
            进入工作台 <ArrowRight size={15} />
          </button>
        </div>
      </header>

      {/* hero */}
      <section className="max-w-6xl mx-auto px-5 pt-20 pb-16 sm:pt-28 sm:pb-24">
        <div className="max-w-3xl">
          <p className="text-[11px] tracking-[0.36em] uppercase text-sail-faint mb-6">
            Reka · 马来文「设计、构思」
          </p>
          <h1 className="font-display text-[38px] sm:text-[58px] leading-[1.08] font-semibold text-sail-ink tracking-tight">
            给它一条参考视频，
            <br />
            和你手上的素材。
          </h1>
          <p className="mt-7 text-lg sm:text-xl text-sail-muted leading-relaxed max-w-2xl">
            剩下的它来想 —— 怎么剪、每一拍用哪条素材、第几秒切、字幕写什么、
            标题怎么起、封面长什么样。
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <button
              onClick={onEnter}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-sail-green-deep text-white font-semibold hover:bg-sail-green transition-colors"
            >
              开始 <ArrowRight size={17} />
            </button>
            <span className="text-sm text-sail-faint">内部工具 · 需要登录</span>
          </div>
        </div>
      </section>

      {/* 三步 */}
      <section className="border-y border-sail-line bg-sail-card">
        <div className="max-w-6xl mx-auto px-5 py-16 sm:py-20">
          <div className="grid gap-10 sm:gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.kbd}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-sail-tint border border-sail-line flex items-center justify-center">
                    <s.icon size={18} className="text-sail-green-deep" strokeWidth={1.75} />
                  </div>
                  <span className="font-mono text-xs text-sail-faint">{s.kbd}</span>
                </div>
                <h2 className="font-display text-2xl font-semibold text-sail-ink">{s.title}</h2>
                <p className="text-sm font-medium text-sail-brown mt-1.5">{s.lead}</p>
                <p className="text-sm text-sail-muted leading-relaxed mt-3">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 趋势 + 老实话 */}
      <section className="max-w-6xl mx-auto px-5 py-16 sm:py-20">
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Radar size={17} className="text-sail-green-deep" strokeWidth={1.75} />
              <h2 className="font-display text-2xl font-semibold text-sail-ink">还有一个趋势雷达</h2>
            </div>
            <p className="text-sm text-sail-muted leading-relaxed">
              它不做「今天热搜是什么」—— 那需要实时数据，谁都做不准。
              它做的是更值钱的事：拆解一个格式<strong className="text-sail-ink">为什么</strong>有效，
              指出同行都在做的红海和没人做但观众想看的盲区，
              然后给你一批明天就能开工的选题和一份内容日历。
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-sail-ink mb-4">几句老实话</h2>
            <ul className="space-y-3">
              {TRUTHS.map((t, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-sail-muted leading-relaxed">
                  <Check size={15} className="text-sail-green shrink-0 mt-0.5" strokeWidth={2.2} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-sail-line">
        <div className="max-w-6xl mx-auto px-5 py-16 sm:py-20 text-center">
          <Mark size={42} className="text-sail-green-deep mx-auto mb-7" />
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-sail-ink leading-tight">
            做内容这件事，
            <br className="sm:hidden" />
            最难的从来不是剪。
          </h2>
          <p className="mt-4 text-sail-muted max-w-lg mx-auto leading-relaxed">
            是「我知道我要什么感觉，但说不出来那到底是什么」。
          </p>
          <button
            onClick={onEnter}
            className="mt-9 inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-sail-green-deep text-white font-semibold hover:bg-sail-green transition-colors"
          >
            进入工作台 <ArrowRight size={17} />
          </button>
        </div>
      </section>

      <footer className="border-t border-sail-line">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Mark size={26} className="text-sail-green-deep" />
            <Wordmark sub="" />
          </div>
          <p className="text-xs text-sail-faint">
            Reka · 马来文「设计」 —— 名字取自这里，因为这就是这件事的全部。
          </p>
        </div>
      </footer>
    </div>
  );
}
