// 背景音乐 —— 现场合成的禅意曲子（古筝、手碟、箫、暖铺底、低持续音）垫在马来西亚高原花园的自然声上（溪水、微风、鸟、蟋蟀、树蛙）。
// 六首写好的曲子（+ 归家·夜），全部在 D 宫五声上，跟着许愿之旅的每一刻无缝换曲；没有任何音频文件，没有版权问题。
// 引擎在 src/shared/music/（设计与实测：scratchpad/music/SPEC.md）；这里是 App 用的那一层：CONFIG 的默认值 + 页面之间的约定。
// 想换成公司自己有版权的曲子：config.js 的 CONFIG.music.playlist（或旧的 CONFIG.wishMusic），自然声仍会垫在底下。
//
// iPad Safari 的规矩：start() 一定要在点击事件里调用（建 / 恢复 AudioContext + 播一个 1 个采样的静音）。
// 音乐和按钮音效共用一个 AudioContext（sfx.js 的 getAudioContext）：一页只有一个，第一下触碰解锁一次就都有声音。
// 生命周期（锁屏、切去 WhatsApp、分享面板回来）：pause() 停掉排程 + 挂起；resume() 恢复（最好在点击里调用）。
// 挂起期间不排新音符，回来不会「一次全响」；系统自己恢复（任何一下触碰）也会接着放。onState(state)；isLive() = 真的在出声。
//
// API（旧的全部照旧）：start({ volume, trackUrl, playlist }) · pause() · resume() · isLive() · stop(fade) ·
//   setMood('calm'|'intuition'|'focus'|'dusk'|'reveal'(旧名 bright)|'blueprint'|'studio'|'night') ·
//   accent('chapter'|'reveal'|'wish') · duck(倍数 | 'blueprint'|'studio'|'idle', 秒) · setVolume · setMuted · setLayers · attachTrack ·
//   onState · onStop · mood · volume · running · ctx
// 新的：talk(on)（潘吉说话：音乐 −7.5 dB、自然声 −2 dB）· duck('voice', 0.35) / unduck('voice')（叠在页面音量上的一层）·
//   setNature(on) · setMusic(on) · setPlaylist(list) · onMood · onSection · output（喇叭前最后一级：探针 / 分析器接这里）·
//   fadeOut(ms)（换页：pagehide 时自动在 40 ms 里收到 0，不「喀」）

import { CONFIG } from './config.js';
import { ZenSong } from './music/zensong.js';
import { getAudioContext } from './sfx.js';

export { ZenSong, PIECES, MOODS, ALIAS as MOOD_ALIAS, JOURNEY, JOURNEY_SECONDS, PIECE_LIST } from './music/zensong.js';
export { musicFor, applyMusic, CHAPTER_MOOD, isNightHour } from './music/moods.js';

const M = () => CONFIG.music || {};

export class Zen extends ZenSong {
  /** o：和 ZenSong 一样（volume、mood、layers、duck、nature、talk、sessionType、getContext …），没写的用 CONFIG */
  constructor(o = {}) {
    super({
      volume: CONFIG.wishVolume ?? 0.7,
      layers: CONFIG.wishLayers,
      duck: CONFIG.wishDuck,
      nature: M().nature !== false,
      talk: M().talk,
      sessionType: 'playback', // 展厅 iPad：不受静音键影响。客人自己的手机（单独的许愿之旅）传 'ambient'
      getContext: getAudioContext,
      ...o,
    });
    this.voiceDuck = M().voiceDuck ?? 0.35;
    // 换页（pagehide）：音乐在 40 ms 里收到 0，文档卸载时不被硬切成「喀」；bfcache 回来（pageshow）恢复
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('pagehide', () => this.fadeOut(40));
      window.addEventListener('pageshow', (e) => {
        if (this._leaving && (e.persisted || this.running)) {
          this._leaving = false;
          if (this.running && !this.paused) this._ramp(0.6);
        }
      });
    }
  }

  /** 马上（ms 毫秒）收到 0：离开这一页时用（不停排程，回来 _ramp 就恢复） */
  fadeOut(ms = 40) {
    if (!this.master || !this.ctx || this.offline) return;
    this._leaving = true;
    try {
      const g = this.master.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + Math.max(0.005, ms / 1000));
    } catch {
      /* ignore */
    }
  }

  /** 必须在点击 / 触摸事件里调用 */
  start(o = {}) {
    const list = M().playlist;
    return super.start({ playlist: Array.isArray(list) && list.length ? list : null, trackUrl: CONFIG.wishMusic || '', ...o });
  }

  /**
   * 关键时刻的点缀：chapter（章节牌翻面，暮色里的一声）· reveal（铺底涨起来 → 刮奏 → 落定，接着放《星灯》）。
   * wish：每个愿望的声音是按钮音效 wishAdd（客人按下去的那一下，D、F♯、A 凑成一个和弦）—— 音乐不再响自己的铃，
   * 同一下不会有两个铃（音效 SPEC §9）。真的要音乐的那三个亮音：accent('wish', { force: true })。
   */
  accent(kind, o = {}) {
    if (kind === 'wish' && !o.force) return;
    return super.accent(kind, o);
  }

  /** duck('voice') 不写倍数时用 CONFIG.music.voiceDuck */
  duck(factor = 1, seconds, layerSeconds) {
    if (typeof factor === 'string' && !(factor in this.duckLevels) && seconds == null) return super.duck(factor, this.voiceDuck, layerSeconds);
    return super.duck(factor, seconds, layerSeconds);
  }
}

/** 页面之间的约定：子页面（iframe 里的 quiz / studio）用 postMessage 告诉外壳现在在哪一步 */
export function tellShell(type, data = {}) {
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage({ source: 'genie', type, ...data }, location.origin);
  } catch {
    /* ignore */
  }
}

/** 子页面是不是在许愿模式里（?mode=wish） */
export function isWishMode() {
  try {
    return new URLSearchParams(location.search).get('mode') === 'wish';
  } catch {
    return false;
  }
}
