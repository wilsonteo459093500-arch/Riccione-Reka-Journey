import React, { useState } from 'react';
import { Flame, ExternalLink, RefreshCw, Play, Eye, MessageCircle, AlertTriangle, Clock } from 'lucide-react';
import { Card, Btn, Tag, Fold } from './ui/Bits.jsx';
import { platformById } from '../constants.js';
import {
  fetchYouTubeTrending, fetchHotNow, hasOfficialChart, humanCount, humanDuration, sinceNow,
} from '../services/trending.js';

const EXPIRY_COLOR = (s) => (/几天|3-5|一周内/.test(s || '') ? '#9C3D2E' : /1-2\s*周|两周/.test(s || '') ? '#C0843A' : '#3D5A4A');

/**
 * 「今天最红什么」——一个按钮。
 *
 * 刻意把两种数据分开显示：
 *   - YouTube 是平台官方榜（真榜单、带缩略图和播放量）
 *   - 其余平台是 Google 搜索接地（真链接，但是「网上在讨论什么」，不是后台热榜）
 *
 * 不合并、不模糊 —— 把推断包装成事实，用户会拿它去做真金白银的决策。
 */
export default function HotNow({ settings, platformId, niche, notify, onOpenSettings, onUseAngle }) {
  const [yt, setYt] = useState(null);
  const [hot, setHot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ytError, setYtError] = useState('');

  const p = platformById(platformId);
  const official = hasOfficialChart(platformId);

  async function run(force = false) {
    if (!settings.apiKey) return onOpenSettings();
    setBusy(true);
    setYtError('');
    try {
      // 两条数据源并行：官方榜（只有 YouTube 有）+ 搜索接地（所有平台）
      const [ytRes, hotRes] = await Promise.allSettled([
        official ? fetchYouTubeTrending(settings.apiKey, { regionCode: 'MY', category: 'home' }) : Promise.resolve(null),
        fetchHotNow(settings, { platformId, niche, force }),
      ]);

      if (ytRes.status === 'fulfilled') setYt(ytRes.value);
      else setYtError(ytRes.reason?.message || '');

      if (hotRes.status === 'rejected') throw hotRes.reason;
      setHot(hotRes.value);

      const n = hotRes.value.hot?.length || 0;
      notify({
        type: hotRes.value.confidence === 'low' ? 'warn' : 'ok',
        text: hotRes.value.cached
          ? `${p.label}：${n} 条（15 分钟内的缓存，点刷新强制重查）`
          : `${p.label}：${n} 条${hotRes.value.confidence === 'low' ? '，但公开信息很少，仅供参考' : ''}`,
      });
    } catch (err) {
      notify({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const dropped = (hot?.hot || []).filter((h) => h._dropped).length;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5">
          <Flame size={16} className="text-sail-brown" />
          今天最红什么
        </span>
      }
      sub={`${p.label} · ${niche?.trim() || '室内设计 / 全屋定制'} · 马来西亚`}
      right={
        hot ? (
          <Btn size="sm" variant="soft" icon={RefreshCw} busy={busy} onClick={() => run(true)}>
            刷新
          </Btn>
        ) : null
      }
    >
      {!hot && !yt ? (
        <div className="space-y-3">
          <p className="text-xs text-sail-muted leading-relaxed">
            点一下，现搜现答 —— 不是模型凭印象说的，
            <strong className="text-sail-ink">每条都带能点开的真实链接</strong>。
            {official ? (
              <> YouTube 这个平台还能直接拉<strong className="text-sail-ink">官方热榜</strong>，带缩略图和播放量。</>
            ) : (
              <> {p.label} 没有公开的热榜接口，所以这里给的是「网上此刻在讨论什么」，不是平台后台榜单。</>
            )}
          </p>
          <Btn className="w-full" busy={busy} icon={busy ? undefined : Flame} onClick={() => run(false)}>
            {busy ? '正在搜…' : `看看 ${p.label} 现在最红什么`}
          </Btn>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ---------- 官方榜 ---------- */}
          {yt?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-sail-ink">YouTube 官方热榜</span>
                <Tag color="#2D4A3E">真实榜单</Tag>
                <span className="text-[11px] text-sail-faint">马来西亚 · Howto &amp; Style</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {yt.slice(0, 8).map((v) => (
                  <a
                    key={v.id}
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex gap-2.5 rounded-xl border border-sail-line p-2 hover:border-sail-green-deep/40 hover:bg-sail-tint transition"
                  >
                    <div className="relative w-28 shrink-0 aspect-video rounded-lg overflow-hidden bg-sail-tint">
                      {v.thumb && <img src={v.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />}
                      <span className="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-white text-[10px] font-mono">
                        {humanDuration(v.duration)}
                      </span>
                      {v.isShort && (
                        <span className="absolute top-1 left-1 px-1 rounded bg-sail-brown text-white text-[9px] font-medium">
                          Shorts
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-sail-ink leading-snug line-clamp-2 group-hover:text-sail-green-deep">
                        {v.title}
                      </p>
                      <p className="text-[11px] text-sail-faint mt-0.5 truncate">{v.channel}</p>
                      <p className="text-[11px] text-sail-muted mt-1 flex items-center gap-2 tabular-nums">
                        <span className="inline-flex items-center gap-0.5">
                          <Eye size={10} /> {humanCount(v.views)}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <MessageCircle size={10} /> {humanCount(v.comments)}
                        </span>
                        <span className="text-sail-faint">{sinceNow(v.publishedAt)}</span>
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {ytError && (
            <p className="text-[11px] text-sail-brown leading-relaxed flex gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-px" />
              <span>YouTube 官方榜没拉到：{ytError}</span>
            </p>
          )}

          {/* ---------- 搜索接地 ---------- */}
          {hot && (
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-semibold text-sail-ink">{p.label} 现在在跑什么</span>
                <Tag color={hot.confidence === 'high' ? '#2D4A3E' : hot.confidence === 'medium' ? '#B8995A' : '#9C3D2E'}>
                  {hot.confidence === 'high' ? '证据充分' : hot.confidence === 'medium' ? '证据一般' : '公开信息很少'}
                </Tag>
                {hot.as_of && <span className="text-[11px] text-sail-faint">{hot.as_of}</span>}
                {hot.cached && <span className="text-[11px] text-sail-faint">· 缓存</span>}
              </div>

              {hot.confidence === 'low' && (
                <p className="text-[11px] text-sail-brown leading-relaxed mb-2 flex gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-px" />
                  <span>
                    {p.label} 的内容 Google 索引不到多少，下面这些是从二手报道推出来的。
                    <strong>别拿它当事实用</strong> —— 自己刷一遍平台，把看到的填进左边「你最近刷到的爆款」，
                    那份分析比这个准得多。
                  </span>
                </p>
              )}

              <div className="space-y-2">
                {(hot.hot || []).map((h, i) => (
                  <div key={i} className="rounded-xl border border-sail-line p-3 hover:border-sail-green-deep/30 transition">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-sail-ink leading-snug">{h.title}</p>
                      {h.expires && (
                        <Tag color={EXPIRY_COLOR(h.expires)}>
                          <span className="inline-flex items-center gap-0.5">
                            <Clock size={9} /> {h.expires}
                          </span>
                        </Tag>
                      )}
                    </div>
                    {h.format && <p className="text-[11px] text-sail-faint mt-0.5">{h.format}</p>}
                    <p className="text-xs text-sail-muted mt-1.5 leading-relaxed">{h.why_now}</p>
                    {h.evidence && (
                      <p className="text-[11px] text-sail-faint mt-1 leading-relaxed">证据：{h.evidence}</p>
                    )}
                    {h.your_move && (
                      <p className="text-xs text-sail-green-deep mt-1.5 leading-relaxed">
                        <strong>你可以这么改：</strong>
                        {h.your_move}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {h.url ? (
                        <a
                          href={h.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-sail-green underline inline-flex items-center gap-0.5"
                        >
                          打开原文 <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-[11px] text-sail-faint">（这条没有可核对的链接）</span>
                      )}
                      {onUseAngle && h.your_move && (
                        <Btn
                          size="sm"
                          variant="ghost"
                          icon={Play}
                          onClick={() => onUseAngle({ title: h.title, format: h.format, hook_line: h.your_move, why: h.why_now })}
                        >
                          拿去构思
                        </Btn>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {hot.sounds?.length > 0 && (
                <div className="mt-2.5 rounded-xl bg-sail-tint border border-sail-line p-2.5">
                  <p className="text-[11px] font-medium text-sail-ink mb-1">正在被大量使用的声音</p>
                  <p className="text-xs text-sail-muted leading-relaxed">{hot.sounds.join(' · ')}</p>
                </div>
              )}

              {hot.avoid?.length > 0 && (
                <div className="mt-2 rounded-xl border border-sail-brown/25 bg-sail-brown/5 p-2.5">
                  <p className="text-[11px] font-medium text-sail-brown mb-1">已经做烂了，别再跟</p>
                  <ul className="text-xs text-sail-muted leading-relaxed list-disc pl-4 space-y-0.5">
                    {hot.avoid.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Google 接地条款要求把搜索建议原样显示出来 */}
              {hot.searchEntryPoint && (
                <div className="mt-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: hot.searchEntryPoint }} />
              )}

              {hot.sources?.length > 0 && (
                <Fold title={`它搜了什么、看了哪些页面（${hot.sources.length} 个来源）`}>
                  <div className="space-y-2">
                    {hot.queries?.length > 0 && (
                      <p className="text-[11px] text-sail-faint leading-relaxed">
                        搜索词：{hot.queries.join(' ｜ ')}
                      </p>
                    )}
                    <ul className="space-y-1">
                      {hot.sources.map((s, i) => (
                        <li key={i}>
                          <a
                            href={s.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-sail-green underline break-all inline-flex items-start gap-1"
                          >
                            <ExternalLink size={10} className="shrink-0 mt-0.5" />
                            <span>{s.title}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                    {dropped > 0 && (
                      <p className="text-[11px] text-sail-faint leading-relaxed">
                        有 {dropped} 条的链接不在实际搜到的来源里，已经去掉了 ——
                        模型偶尔会顺手编一个看起来像的网址，点开是 404，比没有链接更糟。
                      </p>
                    )}
                  </div>
                </Fold>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
