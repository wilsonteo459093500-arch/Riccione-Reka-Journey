// 潘吉的声音 · Pangie's voice — a warm little-girl voice for the fixed lines in i18n/voice-lines.js.
// Plain ES module, no React: safe to import in Node (test/voice.test.mjs) and on every page.
//
// Two tiers, one queue (SPEC: scratchpad/voice/SPEC.md §3–4):
//   (a) DEVICE VOICE (default) — Web Speech (speechSynthesis): the best female zh / en voice this device has
//       (rankVoices), pitched up and kept bright and light (presetFor) so an adult voice reads as a young girl.
//   (b) PREMIUM VOICE PACK — every fixed line rendered ONCE on this device by staff with the firm's Gemini key
//       (Studio → Settings → 潘吉的声音), cached in IndexedDB keyed by (line id, lang, text hash, voice, style).
//       A missing clip (new line, changed copy, other voice) falls back to tier (a) for that line only.
//
// Rules it enforces:
//   · fixed lines only — say(id) looks the text up in the line table; there is no "speak any string" API
//   · one line at a time — say() replaces whatever is playing (mode 'interrupt'); 'queue' / 'ifIdle' are opt-in
//   · skip() ends the current line (a tap on Pangie), cancel() stops everything, stopIf(id) = "this screen left"
//   · on / off is remembered on the device (localStorage 'genie.voice'); setMuted() follows the page's sound mute
//   · iPad: speech needs a tap first — unlock() inside the tap (the app voice auto-unlocks on the first gesture)
//   · hooks: talking (debounced, ducks the music), mouth 0–1 (lip-sync), start / end per line
//
// Two layers in this file:
//   1. the ENGINE (createVoice, createPack, createMouth, Gemini TTS, WAV, ranking …) — pure, injectable, tested;
//   2. the APP VOICE (`voice`, lineText, talkState, voicePack, voicePrefs) — one per page, created lazily:
//        standalone pages speak locally; the quiz / studio inside the Wish-Mode shell's iframe ask the SHELL to
//        speak (it was unlocked by the splash tap and survives every iframe reload) and only move Pangie's mouth.
//
//   import { voice, lineText } from '../shared/voice.js';
//   voice.say('ch.life', { delay: 1150 });            // the bubble / caption shows lineText('ch.life')
//   <Pangie speaker />                                // (Pangie.jsx) her mouth moves while a line plays

import LINE_TABLE from './i18n/voice-lines.js';
import { getLang } from './i18n.js';
import { CONFIG } from './config.js';
import { sfx, getAudioContext } from './sfx.js';

/* ───────────────────────────── config ───────────────────────────── */

export const VOICE_DEFAULTS = Object.freeze({
  storageKey: 'genie.voice', // '1' = Pangie speaks (default), '0' = captions only
  prefsKey: 'genie.voice.prefs.v2', // { zh: { voiceURI, pitch, rate }, en: { … } } — staff settings
  level: 'full', // 'full' = every voiced line · 'key' = ritual moments only (welcome, lamp, cards, reveal, blueprint, idle, bye)
  release: 280, // ms after the last line ends before talking(false) — the music does not pump between two lines
  duck: 0.42, // music factor while she talks (≈ −7.5 dB, the music SPEC's talk level)
  maxChars: { zh: 80, en: 160 }, // longer text is chunked at sentence ends (Chrome's Google voices stop after ~15 s)
  startTimeout: 2500, // ms: no 'start' from speechSynthesis by then = stuck engine (iOS after a call / background)
});

/** Gemini TTS — model ids and voices are config, so staff (or the lead) can change them without code */
export const GEMINI_TTS = Object.freeze({
  baseUrl: 'https://generativelanguage.googleapis.com',
  // tried in order; a 404 moves on to the next (same pattern as the floor-plan AI). Gemini 3.8 TTS (Sept 2026) is
  // current; gemini-3.1-flash-tts-preview is Google's legacy preview; 2.5 preview is the last resort. The two
  // families take direction differently — see ttsDialect().
  models: ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'],
  voice: 'Leda',
  // three youthful female candidates (prebuilt voice names; Google's own one-word character in brackets)
  voices: [
    { name: 'Leda', zh: '青春', en: 'Youthful' },
    { name: 'Achernar', zh: '轻柔', en: 'Soft' },
    { name: 'Zephyr', zh: '明亮', en: 'Bright' },
  ],
  more: ['Vindemiatrix', 'Sulafat', 'Laomedeia', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina', 'Erinome', 'Kore'],
  styleVersion: 'girl-v1', // bump when STYLE changes → every clip is regenerated (it is part of the cache key)
  sampleRate: 24000,
  paceMs: 1300, // gap between requests (free-tier friendly); grows after a 429
  retries: 3,
});

/** the director's notes sent with every line (never the guest's data — fixed text only) */
export const STYLE = Object.freeze({
  profile:
    'Pangie is a little girl genie: a soft plush panda who lives in a magic lamp, about eight years old. Warm, kind and playful, a little cheeky. Never babyish, never squeaky, never shrill, never sarcastic.',
  scene: 'A calm, sunlit interior-design showroom in Malaysia. She is right beside the guest, close to the microphone, smiling while she talks.',
  accent: {
    zh: 'Mandarin Chinese as spoken in Malaysia: light, soft and clear. No Beijing erhua, no heavy retroflex sounds; gentle, relaxed tones.',
    en: 'Clear, friendly English with a light British lilt — warm and natural, not posh.',
  },
  style: 'A smile you can hear. Bright but soft, natural breaths, short phrases.',
  pace: 'Relaxed and unhurried, with small natural pauses at commas.',
});

/* ───────────────────────────── small utils ───────────────────────────── */

const has = (k) => typeof globalThis !== 'undefined' && globalThis[k] != null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const noop = () => {};

function safeStorage(s) {
  const st =
    s === undefined
      ? (() => {
          try {
            return has('localStorage') ? globalThis.localStorage : null;
          } catch {
            return null;
          }
        })()
      : s;
  return {
    get(k) {
      try {
        return st ? st.getItem(k) : null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        st?.setItem(k, v);
      } catch {
        /* private mode / blocked storage: keep going without it */
      }
    },
  };
}

/** FNV-1a 32-bit over UTF-16 code units → 8 hex chars (cache keys; sync, tiny) */
export function hashText(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function emitter() {
  const subs = new Map();
  return {
    on(type, fn) {
      if (!subs.has(type)) subs.set(type, new Set());
      subs.get(type).add(fn);
      return () => subs.get(type)?.delete(fn);
    },
    emit(type, ev) {
      for (const fn of subs.get(type) || []) {
        try {
          fn(ev);
        } catch (e) {
          if (typeof console !== 'undefined') console.error('[voice]', e);
        }
      }
    },
  };
}

/* ───────────────────────────── text ───────────────────────────── */

const PICTO = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/**
 * Caption text → what the synthesiser should read: no emoji, no 「」, dashes and tildes become pauses
 * (some zh voices read "——" or "～" aloud), a trailing "……" becomes a full stop.
 */
export function speakable(text, lang = 'zh') {
  let s = String(text || '').replace(PICTO, '');
  s = s.replace(/[「」『』“”"]/g, '');
  if (lang === 'zh') {
    s = s
      .replace(/\s*(——|—|–)\s*/g, '，')
      .replace(/[～~]+/g, '')
      .replace(/(……|…)+\s*$/u, '。')
      .replace(/(……|…)+/g, '，')
      .replace(/\s*([，。！？、；：])\s*/g, '$1')
      .replace(/(\p{Script=Han})\s+(?=\p{Script=Han})/gu, '$1')
      .replace(/，([。！？])/g, '$1')
      .replace(/，{2,}/g, '，');
  } else {
    s = s
      .replace(/\s*(—|–)\s*/g, ', ')
      .replace(/[～~]+/g, '')
      .replace(/(…|\.\.\.)+\s*$/u, '.')
      .replace(/(…|\.\.\.)+/g, ', ')
      .replace(/,\s*([.!?])/g, '$1');
  }
  return s.replace(/\s+/g, ' ').replace(/^[，,\s]+/, '').trim();
}

/** split long text at sentence ends (and, if still long, at commas); short text stays one utterance */
export function chunkText(text, lang = 'zh', max = VOICE_DEFAULTS.maxChars[lang] || 80) {
  const s = String(text || '').trim();
  if (!s) return [];
  if (s.length <= max) return [s];
  const end = lang === 'zh' ? /[^。！？!?…]+[。！？!?…]*/gu : /[^.!?…]+[.!?…]*\s*/gu;
  const sentences = (s.match(end) || [s]).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const sen of sentences) {
    if (sen.length <= max) {
      const last = out[out.length - 1];
      if (last && last.length + sen.length + 1 <= max && (last.length < 6 || sen.length < 6)) out[out.length - 1] = `${last}${lang === 'zh' ? '' : ' '}${sen}`;
      else out.push(sen);
      continue;
    }
    const parts = sen.split(lang === 'zh' ? /(?<=[，、；])/u : /(?<=[,;])\s*/u);
    let cur = '';
    for (const p of parts) {
      if ((cur + p).length > max && cur) {
        out.push(cur.trim());
        cur = '';
      }
      cur += p;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

/* ───────────────────────────── mouth (lip-sync) ───────────────────────────── */

const HAN = /\p{Script=Han}/u;
const PAUSE_ZH = { '，': 0.17, '、': 0.12, '；': 0.22, '：': 0.18, '。': 0.36, '！': 0.36, '？': 0.38, '…': 0.4 };
const PAUSE_EN = { ',': 0.18, ';': 0.22, ':': 0.18, '.': 0.36, '!': 0.36, '?': 0.38, '…': 0.4 };

/** deterministic 0–1 jitter per syllable (same line → same mouth, which also keeps tests stable) */
const jitter = (i) => {
  const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Estimated speech timeline for a line: syllable segments with the char index they start at, and pauses at
 * punctuation. zh ≈ 4.6 syllables / s at rate 1 (one per Han character), en ≈ 4.1 syllables / s (vowel groups).
 */
export function speechTimeline(text, lang = 'zh', rate = 1) {
  const segs = [];
  let t = 0;
  const r = clamp(rate || 1, 0.3, 3);
  const syl = (lang === 'zh' ? 1 / 4.6 : 1 / 4.1) / r;
  const s = String(text || '');
  let n = 0;
  if (lang === 'zh') {
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (HAN.test(c) || /[0-9A-Za-z]/.test(c)) {
        const d = /[A-Za-z]/.test(c) ? syl * 0.62 : syl;
        segs.push({ t0: t, t1: t + d, ci: i, amp: 0.55 + 0.45 * jitter(n++) });
        t += d;
      } else if (PAUSE_ZH[c] != null) t += PAUSE_ZH[c] / r;
    }
  } else {
    const re = /([A-Za-z0-9'’]+)|([,.;:!?…])/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1]) {
        const w = m[1].toLowerCase();
        const k = /^\d+$/.test(w) ? Math.max(1, w.length) : Math.max(1, (w.replace(/e$/, '').match(/[aeiouy]+/g) || []).length);
        const d = syl * k;
        for (let j = 0; j < k; j++) segs.push({ t0: t + (d / k) * j, t1: t + (d / k) * (j + 1), ci: m.index, amp: 0.55 + 0.45 * jitter(n++) });
        t += d + 0.03 / r;
      } else t += (PAUSE_EN[m[2]] ?? 0.2) / r;
    }
  }
  // trailing punctuation pause does not count toward the speaking time
  const last = segs[segs.length - 1];
  return { segs, dur: last ? last.t1 + 0.05 : 0 };
}

/**
 * Turns voice events into a smooth mouth level 0–1 at ~30 fps:
 *   start { tier:'pack', env, hz, lead? }  — real amplitude (envelope computed from the clip)
 *   start { tier:'tts'|'none', text, lang, rate } — estimated syllables, re-synced by boundary events
 *   boundary { ci }                         — the synthesiser reached char index ci
 *   end                                     — ease to closed
 * reduced = prefers-reduced-motion → two states (closed / half open), changed at most every 240 ms.
 */
export function createMouth({ onMouth = noop, now, schedule, cancelSchedule, reduced = false, fps = 30 } = {}) {
  const clock = now || (() => (has('performance') ? globalThis.performance.now() : Date.now()));
  const sched = schedule || ((fn) => (has('requestAnimationFrame') ? globalThis.requestAnimationFrame(fn) : setTimeout(fn, 1000 / fps)));
  const unsched = cancelSchedule || ((id) => (has('cancelAnimationFrame') ? globalThis.cancelAnimationFrame(id) : clearTimeout(id)));
  let src = null;
  let level = 0;
  let sent = -1;
  let timer = 0;
  let closing = false;
  let lastFrame = 0;
  let held = { v: 0, at: -1e9 };

  const emit = (v) => {
    const q = Math.round(v * 1000) / 1000;
    if (Math.abs(q - sent) >= 0.012 || (q === 0 && sent !== 0)) {
      sent = q;
      onMouth(q);
    }
  };

  function target(tMs) {
    if (!src) return 0;
    const t = (tMs - src.t0) / 1000;
    if (src.tier === 'pack') {
      const i = Math.floor((t + (src.lead ?? 0.04)) * src.hz);
      if (i < 0) return 0;
      if (i >= src.env.length) return 0;
      return src.env[i] / 255;
    }
    // estimated syllables (tts / none)
    const { segs, dur } = src.tl;
    if (!segs.length) return 0;
    if (t > dur) {
      if (!src.loop) return 0;
      // the synthesiser is slower than the estimate: keep talking softly until it says 'end'
      const k = Math.floor(t * 4.2);
      const u = t * 4.2 - k;
      return (0.35 + 0.4 * jitter(k + 99)) * Math.pow(Math.sin(Math.PI * u), 0.8);
    }
    while (src.k < segs.length - 1 && segs[src.k].t1 <= t) src.k++;
    while (src.k > 0 && segs[src.k].t0 > t) src.k--;
    const g = segs[src.k];
    if (t < g.t0 || t > g.t1) return 0;
    const u = (t - g.t0) / (g.t1 - g.t0);
    const next = segs[src.k + 1];
    const inWord = next && next.t0 - g.t1 < 0.02;
    return Math.max(inWord && u > 0.5 ? 0.1 : 0, g.amp * Math.pow(Math.sin(Math.PI * u), 0.75));
  }

  function frame() {
    timer = 0;
    const tMs = clock();
    if (tMs - lastFrame < 1000 / fps - 2 && !closing) {
      timer = sched(frame);
      return;
    }
    lastFrame = tMs;
    // safety: a clip whose envelope is used up, or an estimate far past its end, closes on its own (no 'end' needed)
    if (src && !closing) {
      const t = (tMs - src.t0) / 1000;
      if (t > (src.tier === 'pack' ? src.env.length / src.hz + 0.3 : src.tl.dur * 3 + 8)) closing = true;
    }
    const v = closing ? 0 : target(tMs);
    // attack fast, release a little slower (lips close more slowly than they open)
    level += (v - level) * (v > level ? 0.62 : 0.38);
    if (level < 0.004) level = 0;
    let out = level;
    if (reduced) {
      const want = level > 0.22 ? 0.5 : 0;
      if (want !== held.v && tMs - held.at >= 240) held = { v: want, at: tMs };
      out = held.v;
    }
    emit(out);
    if (closing && level === 0) {
      closing = false;
      src = null;
      emit(0);
      return;
    }
    if (src || closing) timer = sched(frame);
  }

  const run = () => {
    if (!timer) timer = sched(frame);
  };

  return {
    handle(ev) {
      if (!ev) return;
      if (ev.type === 'start') {
        closing = false;
        const t0 = clock() + (ev.delayMs || 0);
        if (ev.tier === 'pack' && ev.env && ev.env.length) src = { tier: 'pack', env: ev.env, hz: ev.hz || 50, lead: ev.lead, t0 };
        else src = { tier: ev.tier || 'tts', t0, k: 0, loop: ev.tier === 'tts', tl: speechTimeline(ev.text, ev.lang, ev.rate) };
        run();
      } else if (ev.type === 'boundary' && src && src.tl) {
        // re-sync: the segment that starts at (or after) this char index starts now
        const i = src.tl.segs.findIndex((g) => g.ci >= ev.ci);
        if (i >= 0) {
          const want = clock() - src.tl.segs[i].t0 * 1000;
          src.t0 = src.t0 + clamp(want - src.t0, -600, 600);
          src.k = i;
        }
      } else if (ev.type === 'end') {
        if (src || level > 0) {
          closing = true;
          run();
        }
      }
    },
    get level() {
      return level;
    },
    stop() {
      if (timer) unsched(timer);
      timer = 0;
      src = null;
      closing = false;
      level = 0;
      emit(0);
    },
  };
}

/**
 * Writes the mouth onto every <svg class="pangie" data-speaker> on the page (the Pangie who is "on stage"):
 * toggles .is-talking / .is-lipsync on the root and sets --mouth on its .pg-talk group (only that tiny subtree
 * restyles each frame). For plain-DOM pages; React pages use <Pangie speaker /> (the app voice drives it).
 */
export function bindMouthToDom({ root, selector = 'svg.pangie[data-speaker]' } = {}) {
  const doc = root || (has('document') ? globalThis.document : null);
  const all = () => (doc ? [...doc.querySelectorAll(selector)] : []);
  return {
    onTalking(on) {
      for (const svg of all()) {
        svg.classList.toggle('is-talking', !!on);
        svg.classList.toggle('is-lipsync', !!on);
        if (!on) svg.querySelector('.pg-talk')?.style.removeProperty('--mouth');
      }
    },
    onMouth(v) {
      for (const svg of all()) {
        if (!svg.classList.contains('is-talking')) continue;
        svg.querySelector('.pg-talk')?.style.setProperty('--mouth', v.toFixed(3));
      }
    },
  };
}

/* ───────────────────────────── device voices (tier a) ───────────────────────────── */

const FEMALE =
  /\b(ting-?ting|lili|lilian|mei-?jia|yu-?shu|li-?na|xiaoxiao|xiaoyi|xiaoyou|xiaoshuang|xiaomo|xiaohan|xiaorui|xiaoxuan|xiaochen|xiaoqiu|xiaoyan|xiaomeng|xiaozhen|huihui|yaoyao|hanhan|hsiaochen|hsiaoyu|yating|sinji|samantha|ava|allison|susan|zoe|nicky|joelle|noelle|kate|serena|stephanie|martha|karen|catherine|moira|tessa|fiona|veena|victoria|hazel|zira|libby|sonia|maisie|ana|aria|jenny|michelle|emma|clara|natasha|molly|mia|sara|amy|emily|olivia|female)\b|女/i;
const MALE =
  /\b(daniel|arthur|oliver|alex|tom|aaron|gordon|lee|rishi|li-?mu|yunjian|yunxi|yunxia|yunyang|yunye|yunze|yunfeng|yunhao|yunjie|yunjhe|kangkang|david|mark|george|ryan|guy|christopher|eric|roger|steffan|thomas|andrew|brian|william|james|evan|nathan|tony|jamie|liam|noah|male)\b|男/i;
// novelty and robotic (Eloquence) voices: never Pangie
const ODD =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy|princess|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b|eloquence|novelty/i;
const CHILD = /\b(ana|maisie|xiaoyou|xiaoshuang|xiaoyi)\b/i;
const PREMIUM = /premium|natural|neural|wavenet|studio|journey|chirp|高品质/i;
const ENHANCED = /enhanced|增强/i;
const DIALECT = /northeastern|shaanxi|zhongyuan|jilu|southwestern|sichuan|liaoning|henan|shandong|wu chinese|xiang|cantonese|粤|東北|东北|陕西|hong kong/i;

export function detectPlatform(ua = has('navigator') ? globalThis.navigator.userAgent : '', touch = has('navigator') ? globalThis.navigator.maxTouchPoints || 0 : 0) {
  if (/iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Macintosh/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  return 'other';
}

function langScore(lang, want) {
  const l = String(lang || '').replace('_', '-').toLowerCase();
  if (want === 'zh') {
    if (!/^(zh|cmn)/.test(l) || /hk|yue|mo$/.test(l)) return -1;
    if (/-(sg|my)\b/.test(l)) return 46; // Singapore / Malaysia Mandarin, if a device ever has one
    if (/-(cn|hans)|^zh$|^cmn$|cmn-hans/.test(l)) return 40;
    if (/-(tw|hant)/.test(l)) return 33; // Taiwan Mandarin: soft too, sometimes Taiwanese readings
    return 30;
  }
  if (!/^en/.test(l)) return -1;
  if (/-gb/.test(l)) return 40;
  if (/-(sg|my|au|ie|nz)/.test(l)) return 34;
  if (/-us/.test(l)) return 31;
  if (/-in/.test(l)) return 26;
  return 22;
}

/**
 * Rank this device's voices for Pangie. Returns [{ voice, score, why[] }] best first (unusable ones dropped):
 * language fit (zh-CN > zh-TW; en-GB > en-AU/IE > en-US), female names, Premium / Enhanced / Natural quality,
 * local (offline, fires boundary events), never novelty / Eloquence / dialect voices; male voices sink (−200).
 */
export function rankVoices(voices, want = 'zh', platform = detectPlatform()) {
  const seen = new Set();
  const out = [];
  for (const v of voices || []) {
    if (!v) continue;
    const id = v.voiceURI || v.name;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = `${v.name || ''} ${v.voiceURI || ''}`;
    const ls = langScore(v.lang, want);
    if (ls < 0) continue;
    if (ODD.test(name)) continue;
    if (want === 'zh' && DIALECT.test(name)) continue;
    const why = [`lang ${v.lang}`];
    let score = ls;
    if (MALE.test(v.name || '') && !FEMALE.test(v.name || '')) {
      score -= 200;
      why.push('male');
    } else if (FEMALE.test(name)) {
      score += 30;
      why.push('female');
    }
    if (PREMIUM.test(name)) {
      score += 26;
      why.push('premium');
    } else if (ENHANCED.test(name)) {
      score += 18;
      why.push('enhanced');
    }
    if (CHILD.test(v.name || '')) {
      score += 10;
      why.push('young');
    }
    if (v.localService) {
      score += 6;
      why.push('on-device');
    } else if (platform === 'ios') score -= 4;
    if (v.default) score += 2;
    out.push({ voice: v, score, why });
  }
  return out.sort((a, b) => b.score - a.score || String(a.voice.name).localeCompare(String(b.voice.name)));
}

/**
 * Recommended pitch / rate per voice family. Owner, after the first demo: 「这个声音有点太不可爱了」 → a brighter,
 * bouncier little-girl preset: adult voices only read as a child above ≈ 1.35 pitch, and kids don't drawl
 * (rate ≈ 1). Child voices (Edge's Ana / Maisie / Xiaoyi …) only get a small lift. Staff can override per language.
 * These numbers are the owner-approved ones and supersede the first-draft table in voice SPEC §4.1 (1.12–1.20, written
 * before the demo, when ≈ 1.3 was feared to sound like a chipmunk). They change only after the owner listens again on
 * the iPad (Tingting compact / Enhanced, Serena); per-language prefs (voice.prefs.set) still win over them.
 */
export function presetFor(v, lang = 'zh', platform = detectPlatform()) {
  const name = `${v?.name || ''} ${v?.voiceURI || ''}`;
  const zh = lang === 'zh';
  if (CHILD.test(v?.name || '')) return { pitch: 1.12, rate: 1.02 }; // already a child voice: just a little lift
  if (/Microsoft .*Online/i.test(name)) return { pitch: 1.38, rate: 1.03 };
  if (/^Google|google/i.test(v?.name || '')) return { pitch: 1.42, rate: zh ? 1.0 : 1.02 };
  if (PREMIUM.test(name) || ENHANCED.test(name)) return { pitch: zh ? 1.4 : 1.42, rate: zh ? 1.0 : 1.02 };
  if (/com\.apple/i.test(name) || platform === 'ios' || platform === 'mac') return { pitch: zh ? 1.45 : 1.48, rate: zh ? 1.0 : 1.03 };
  if (/Microsoft/i.test(name)) return { pitch: 1.45, rate: 1.02 };
  if (platform === 'android') return { pitch: 1.42, rate: 1.0 };
  return { pitch: 1.42, rate: 1.0 };
}

/* ───────────────────────────── audio (tier b) ───────────────────────────── */

function b64ToBytes(b64) {
  if (has('atob')) {
    const bin = globalThis.atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(globalThis.Buffer.from(b64, 'base64'));
}

/** base64 little-endian 16-bit PCM (Gemini's inlineData) → Int16Array */
export function pcmFromBase64(b64) {
  const bytes = b64ToBytes(b64);
  const n = Math.floor(bytes.length / 2);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true);
  return out;
}

const wstr = (dv, at, s) => {
  for (let i = 0; i < s.length; i++) dv.setUint8(at + i, s.charCodeAt(i));
};

/** Int16 mono PCM → a canonical 44-byte-header WAV (ArrayBuffer) */
export function pcmToWav(pcm, sampleRate = 24000) {
  const bytes = pcm.length * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const dv = new DataView(buf);
  wstr(dv, 0, 'RIFF');
  dv.setUint32(4, 36 + bytes, true);
  wstr(dv, 8, 'WAVE');
  wstr(dv, 12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  wstr(dv, 36, 'data');
  dv.setUint32(40, bytes, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);
  return buf;
}

/** read a PCM WAV back: { sampleRate, channels, bits, samples (Int16Array, ch 0), duration } */
export function parseWav(buf) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
  const tag = (at) => String.fromCharCode(dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2), dv.getUint8(at + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV');
  let at = 12;
  let fmt = null;
  while (at + 8 <= dv.byteLength) {
    const id = tag(at);
    const size = dv.getUint32(at + 4, true);
    if (id === 'fmt ') fmt = { format: dv.getUint16(at + 8, true), channels: dv.getUint16(at + 10, true), sampleRate: dv.getUint32(at + 12, true), bits: dv.getUint16(at + 22, true) };
    if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.bits !== 16) throw new Error('only 16-bit PCM WAV');
      const avail = dv.byteLength - (at + 8);
      const frames = Math.floor((size > 0 && size <= avail ? size : avail) / (2 * fmt.channels)); // streamed WAVs say 0 / 0xFFFFFFFF
      const samples = new Int16Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = dv.getInt16(at + 8 + i * 2 * fmt.channels, true);
      return { ...fmt, samples, duration: frames / fmt.sampleRate };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error('WAV has no data chunk');
}

/** trim leading / trailing silence (keeps a natural 60 ms before and 140 ms after) */
export function trimSilence(pcm, sr = 24000, thr = 420) {
  const win = Math.max(1, Math.round(sr * 0.01));
  const loud = (i) => {
    let m = 0;
    for (let j = i; j < Math.min(pcm.length, i + win); j++) m = Math.max(m, Math.abs(pcm[j]));
    return m > thr;
  };
  let a = 0;
  while (a < pcm.length && !loud(a)) a += win;
  let b = pcm.length - win;
  while (b > a && !loud(b)) b -= win;
  if (a >= pcm.length) return pcm.slice(0, 0);
  return pcm.slice(Math.max(0, a - Math.round(sr * 0.06)), Math.min(pcm.length, b + win + Math.round(sr * 0.14)));
}

/** loudness-match clips: speech RMS → target dBFS, then keep peaks under −1 dBFS */
export function normalizePcm(pcm, sr = 24000, targetDb = -19) {
  const frame = Math.round(sr * 0.02);
  let sum = 0;
  let cnt = 0;
  let peak = 1;
  for (let i = 0; i < pcm.length; i += frame) {
    let s = 0;
    const end = Math.min(pcm.length, i + frame);
    for (let j = i; j < end; j++) {
      s += pcm[j] * pcm[j];
      peak = Math.max(peak, Math.abs(pcm[j]));
    }
    const rms = Math.sqrt(s / Math.max(1, end - i)) / 32768;
    if (rms > 0.0056) {
      sum += rms * rms;
      cnt++;
    }
  }
  if (!cnt) return pcm.slice();
  const rms = Math.sqrt(sum / cnt);
  let g = clamp(Math.pow(10, targetDb / 20) / rms, 0.4, 4);
  g = Math.min(g, (0.891 * 32767) / peak);
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = clamp(Math.round(pcm[i] * g), -32768, 32767);
  return out;
}

/** the mouth curve of a clip: RMS per 1/hz s → 0–255 (−48 dBFS closed … −14 dBFS wide open) */
export function envelope(pcm, sr = 24000, hz = 50) {
  const frame = Math.max(1, Math.round(sr / hz));
  const n = Math.ceil(pcm.length / frame);
  const out = new Uint8Array(n);
  let prev = 0;
  for (let k = 0; k < n; k++) {
    let s = 0;
    const a = k * frame;
    const b = Math.min(pcm.length, a + frame);
    for (let i = a; i < b; i++) s += pcm[i] * pcm[i];
    const rms = Math.sqrt(s / Math.max(1, b - a)) / 32768;
    const db = 20 * Math.log10(rms + 1e-9);
    let v = Math.pow(clamp((db + 48) / 34, 0, 1), 0.85);
    v = prev + (v - prev) * 0.7; // a touch of smoothing: lips are not a VU meter
    prev = v;
    out[k] = Math.round(v * 255);
  }
  return out;
}

/* ───────────────────────────── Gemini TTS ───────────────────────────── */

/**
 * How a model takes direction:
 *   'metadata' — Gemini 3.8 TTS and later: the text is read VERBATIM (notes in the text would be spoken), so the
 *                delivery goes in the part's speechMetadata.style and the text is only the line;
 *   'prompt'   — the preview models (3.1 / 2.5): director's notes + '#### TRANSCRIPT' + the line, in the text.
 * Unknown future ids default to 'metadata' — the safe side: at worst the style is ignored, never read aloud.
 */
export function ttsDialect(model = '') {
  return /preview/i.test(String(model)) ? 'prompt' : 'metadata';
}

/** the delivery direction for one line as one paragraph (3.8: speechMetadata.style); fixed text only */
export function buildStyle(lang = 'zh', note = '', style = STYLE) {
  return [`Voice: ${style.profile}`, `Scene: ${style.scene}`, `Accent: ${style.accent[lang] || style.accent.en}`, `Style: ${style.style}`, `Pace: ${style.pace}`, note ? `This line: ${note}` : '']
    .filter(Boolean)
    .join(' ');
}

/**
 * The generateContent body for one fixed line. `plain` = the line alone (a 3.8 endpoint that rejected the
 * speechMetadata field: the voice still sounds like her, only the per-line direction is lost).
 */
export function ttsBody({ model = GEMINI_TTS.models[0], voice = GEMINI_TTS.voice, text, lang = 'zh', note = '', style = STYLE, plain = false } = {}) {
  const part = ttsDialect(model) === 'metadata' ? (plain ? { text } : { text, speechMetadata: { style: buildStyle(lang, note, style) } }) : { text: buildPrompt(text, lang, note, style) };
  return {
    contents: [{ role: 'user', parts: [part] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
}

/** the reply's audio part → { pcm (Int16, mono), sampleRate }: a RIFF WAV (3.8's default) or raw little-endian L16 */
export function decodeAudioPart(audio) {
  const mime = audio?.mimeType || audio?.mime_type || '';
  const bytes = b64ToBytes(audio?.data || '');
  const riff = bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41;
  if (riff) {
    const w = parseWav(bytes);
    return { pcm: w.samples, sampleRate: w.sampleRate, mime };
  }
  const n = Math.floor(bytes.length / 2);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(i * 2, true);
  return { pcm, sampleRate: Number(/rate=(\d+)/i.exec(mime)?.[1]) || GEMINI_TTS.sampleRate, mime };
}

/** the prompt for one fixed line (director's notes + transcript) — preview models only; no guest data is ever in here */
export function buildPrompt(text, lang = 'zh', note = '', style = STYLE) {
  return [
    'Read the transcript aloud as Pangie. The notes are direction only: never read them aloud.',
    '',
    `AUDIO PROFILE: ${style.profile}`,
    `SCENE: ${style.scene}`,
    "DIRECTOR'S NOTES",
    `Accent: ${style.accent[lang] || style.accent.en}`,
    `Style: ${style.style}`,
    `Pace: ${style.pace}`,
    note ? `This line: ${note}` : '',
    '',
    '#### TRANSCRIPT',
    text,
  ]
    .filter((x, i, a) => x !== '' || a[i - 1] !== '')
    .join('\n');
}

function retryDelayOf(err) {
  for (const d of err?.details || []) {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(d?.retryDelay || '');
    if (m) return Number(m[1]) * 1000;
  }
  return 0;
}

const isDailyQuota = (err) => (err?.details || []).some((d) => (d?.violations || []).some((v) => /PerDay|per day|daily/i.test(`${v.quotaId || ''} ${v.quotaMetric || ''}`)));

/**
 * One line → PCM. Pass `body` (ttsBody) or, for the preview models, a `prompt` (buildPrompt).
 * Throws Error with .status (HTTP), .fatal (bad key / no access), .quota ('day' | 'minute'), .retryMs,
 * .notFound (model id unknown → try the next model), .badMeta (400: the endpoint does not know speechMetadata).
 */
export async function geminiTTS({ apiKey, baseUrl = GEMINI_TTS.baseUrl, model, voice = GEMINI_TTS.voice, prompt, body, fetch: f, signal }) {
  const doFetch = f || (has('fetch') ? globalThis.fetch.bind(globalThis) : null);
  if (!doFetch) throw Object.assign(new Error('no fetch'), { fatal: true });
  if (!apiKey) throw Object.assign(new Error('no API key'), { fatal: true });
  const base = String(baseUrl || GEMINI_TTS.baseUrl).replace(/\/+$/, '');
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) throw Object.assign(new Error('baseUrl must be https'), { fatal: true });
  const res = await doFetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(
      body || {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }
    ),
    signal,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = data?.error || {};
    const e = new Error(err.message || `HTTP ${res.status}`);
    e.status = res.status;
    e.notFound = res.status === 404;
    e.fatal = res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(err.message || ''));
    e.badMeta = res.status === 400 && /speech_?metadata/i.test(err.message || '');
    if (res.status === 429) {
      e.quota = isDailyQuota(err) ? 'day' : 'minute';
      e.retryMs = retryDelayOf(err) || 20000;
    }
    throw e;
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const audio = parts.map((p) => p.inlineData || p.inline_data).find((d) => d?.data);
  if (!audio) throw Object.assign(new Error('no audio in the reply'), { status: 200 });
  return decodeAudioPart(audio);
}

/* ───────────────────────────── voice pack (IndexedDB) ───────────────────────────── */

/** a minimal async key-value store over IndexedDB ('genie-voice' / 'clips'); tests inject a Map-based one */
export function idbStore({ name = 'genie-voice', store = 'clips', indexedDB: idb } = {}) {
  const IDB = idb || (has('indexedDB') ? globalThis.indexedDB : null);
  let dbp = null;
  const open = () => {
    if (!IDB) return Promise.reject(new Error('no IndexedDB'));
    if (!dbp)
      dbp = new Promise((res, rej) => {
        const r = IDB.open(name, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(store, { keyPath: 'key' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('IndexedDB blocked'));
      }).catch((e) => {
        dbp = null; // private mode / blocked: try again next time instead of caching the failure
        throw e;
      });
    return dbp;
  };
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  return {
    get: (key) => tx('readonly', (s) => s.get(key)),
    put: (rec) => tx('readwrite', (s) => s.put(rec)),
    keys: () => tx('readonly', (s) => s.getAllKeys()),
    del: (key) => tx('readwrite', (s) => s.delete(key)),
    clear: () => tx('readwrite', (s) => s.clear()),
  };
}

export function memoryStore() {
  const m = new Map();
  return {
    map: m,
    get: async (k) => m.get(k),
    put: async (r) => void m.set(r.key, r),
    keys: async () => [...m.keys()],
    del: async (k) => void m.delete(k),
    clear: async () => m.clear(),
  };
}

/**
 * The premium voice pack. Keys: `${id}|${lang}|${hashText(spoken text)}|${voice}@${styleVersion}` — change the copy,
 * the voice or the style and the old clip simply stops matching (tier a speaks that line until it is regenerated).
 */
export function createPack({ store = idbStore(), voice = GEMINI_TTS.voice, styleVersion = GEMINI_TTS.styleVersion, sleep } = {}) {
  let keys = new Set();
  let ready = null;
  let version = 0; // bumped whenever clips may have changed (players drop their decoded copies)
  let cur = { voice, styleVersion };
  const wait =
    sleep ||
    ((ms, signal) =>
      new Promise((res) => {
        const id = setTimeout(res, ms);
        signal?.addEventListener?.('abort', () => (clearTimeout(id), res()), { once: true });
      }));
  const keyOf = (id, lang, text, v = cur.voice) => `${id}|${lang}|${hashText(text)}|${v}@${cur.styleVersion}`;
  const load = () =>
    (ready = Promise.resolve()
      .then(() => store.keys())
      .then((k) => (keys = new Set(k || [])))
      .catch(() => (keys = new Set()))
      .then(() => void version++));
  load();
  const todoOf = (lines, langs) => {
    const out = [];
    for (const l of lines) {
      if (l.voice === false) continue;
      for (const lang of langs) {
        const text = spokenText(l, lang);
        if (text) out.push({ l, lang, text });
      }
    }
    return out;
  };
  const pack = {
    keyOf,
    get voice() {
      return cur.voice;
    },
    get version() {
      return version;
    },
    setVoice(v) {
      cur = { ...cur, voice: v || GEMINI_TTS.voice };
    },
    ready: () => ready,
    reload: load,
    /** sync after ready(): is this exact line (text + voice + style) cached? */
    has: (id, lang, text) => keys.has(keyOf(id, lang, text)),
    get: (id, lang, text) =>
      Promise.resolve()
        .then(() => store.get(keyOf(id, lang, text)))
        .catch(() => null),
    count(lines, langs = ['zh', 'en']) {
      const todo = todoOf(lines, langs);
      return { n: todo.filter(({ l, lang, text }) => keys.has(keyOf(l.id, lang, text))).length, total: todo.length };
    },
    async clear() {
      await store.clear();
      keys = new Set();
      version++;
    },
    /** forget this voice's clips for these lines (staff: 重新生成 — render them again from scratch) */
    async drop(lines, langs = ['zh', 'en']) {
      for (const { l, lang, text } of todoOf(lines, langs)) {
        const k = keyOf(l.id, lang, text);
        if (!keys.has(k)) continue;
        await Promise.resolve(store.del(k)).catch(noop);
        keys.delete(k);
      }
      version++;
    },
    /** store one finished clip (PCM → trimmed, loudness-matched, WAV + mouth envelope) */
    async putClip({ id, lang, text, pcm, sampleRate = 24000, model = '' }) {
      const clean = normalizePcm(trimSilence(pcm, sampleRate), sampleRate);
      const rec = {
        key: keyOf(id, lang, text),
        id,
        lang,
        hash: hashText(text),
        voice: cur.voice,
        style: cur.styleVersion,
        model,
        sampleRate,
        wav: pcmToWav(clean, sampleRate),
        env: envelope(clean, sampleRate, 50),
        hz: 50,
        dur: clean.length / sampleRate,
        at: Date.now(),
      };
      await store.put(rec);
      keys.add(rec.key);
      version++;
      return rec;
    },
    /**
     * Staff: render every missing clip. Resumable (cached lines are skipped), paced, retries 429 / 5xx, stops on a
     * bad key or a spent daily quota. onProgress({ done, total, made, skipped, failed, id, lang, status, model, error })
     */
    async generate({ lines, langs = ['zh', 'en'], apiKey, baseUrl, models = GEMINI_TTS.models, voiceName, style = STYLE, fetch: f, signal, onProgress = noop, paceMs = GEMINI_TTS.paceMs, retries = GEMINI_TTS.retries } = {}) {
      if (voiceName) pack.setVoice(voiceName);
      await ready;
      const todo = todoOf(lines, langs);
      const st = { done: 0, total: todo.length, made: 0, skipped: 0, failed: 0, model: '' };
      let mi = 0;
      let plain = false; // a 3.8 endpoint that rejected speechMetadata: send the line alone from then on
      let gap = paceMs;
      let last = 0;
      const report = (x) => onProgress({ ...st, ...x });
      for (const { l, lang, text } of todo) {
        if (signal?.aborted) return { ...st, status: 'aborted' };
        if (keys.has(keyOf(l.id, lang, text))) {
          st.done++;
          st.skipped++;
          report({ id: l.id, lang, status: 'cached' });
          continue;
        }
        let tries = 0;
        for (;;) {
          const since = Date.now() - last;
          if (last && since < gap) await wait(gap - since, signal);
          if (signal?.aborted) return { ...st, status: 'aborted' };
          last = Date.now();
          try {
            const model = models[mi];
            const body = ttsBody({ model, voice: cur.voice, text, lang, note: l.note || '', style, plain });
            const out = await geminiTTS({ apiKey, baseUrl, model, body, fetch: f, signal });
            // a store that cannot write (private mode, disk full) stops the run — retrying would only burn the quota
            await pack.putClip({ id: l.id, lang, text, pcm: out.pcm, sampleRate: out.sampleRate, model }).catch((err) => {
              throw Object.assign(new Error(String(err?.message || err || 'storage')), { storage: true });
            });
            st.done++;
            st.made++;
            st.model = model;
            report({ id: l.id, lang, status: 'made', model });
            break;
          } catch (e) {
            if (signal?.aborted || e?.name === 'AbortError') return { ...st, status: 'aborted' };
            if (e.storage) return { ...st, status: 'storage', error: e.message };
            if (e.notFound && mi < models.length - 1) {
              mi++;
              continue; // that model id is gone: try the next one
            }
            if (e.badMeta && !plain) {
              plain = true;
              report({ id: l.id, lang, status: 'retry', error: e.message });
              continue; // same line, without the direction field
            }
            if (e.fatal || e.notFound) return { ...st, status: 'fatal', error: e.message };
            if (e.quota === 'day') return { ...st, status: 'quota', error: e.message };
            if ((e.status === 429 || e.status >= 500 || e.status == null) && tries < retries) {
              tries++;
              gap = Math.min(30000, Math.max(gap * 1.6, e.retryMs || 0));
              report({ id: l.id, lang, status: 'retry', wait: e.retryMs || gap, error: e.message });
              await wait(e.retryMs || gap, signal);
              continue;
            }
            st.done++;
            st.failed++;
            report({ id: l.id, lang, status: 'failed', error: e.message });
            break;
          }
        }
      }
      return { ...st, status: st.failed ? 'partial' : 'done' };
    },
  };
  return pack;
}

/** the exact text a line speaks in a language (the caption, unless the line gives a pronunciation override) */
export function spokenText(line, lang) {
  if (!line) return '';
  const raw = line[`${lang}Say`] || line[lang] || '';
  return speakable(raw, lang);
}

/* ───────────────────────────── the engine ───────────────────────────── */

function normLines(lines) {
  if (!lines) return {};
  if (Array.isArray(lines)) return Object.fromEntries(lines.map((l) => [l.id, l]));
  return lines.lines ? normLines(lines.lines) : lines;
}

/**
 * createVoice(options) — the engine (tier a + b), queue, mute / on-off, hooks.
 *   lines        array or { id: { zh, en, zhSay?, enSay?, level?, once?, speaker?, voice? } } or { lines: [...] }
 *   lang         'zh' | 'en' | () => current language
 *   pack         createPack(...) result, or null (tier a only)
 *   level        'full' | 'key'
 *   silentMouth  true → with no usable voice, still animate the mouth on a timer (demos)
 *   autoUnlock   true → unlock on the first pointerup / touchend / keydown / click (like sound.js)
 *   onStart, onEnd, onLine ({ id, lang, speaker } when a line begins), onTalking (bool, debounced), onMouth (0–1),
 *   onEvent, config (overrides VOICE_DEFAULTS)
 * Injectable for tests: speechSynthesis, SpeechSynthesisUtterance, AudioContext, storage, now, setTimeout,
 * clearTimeout, schedule, cancelSchedule, document, platform, reducedMotion.
 * Events (voice.on): line · start · boundary · end · event (all of those) · talking · mouth · state
 */
export function createVoice(o = {}) {
  const env = {
    synth: o.speechSynthesis !== undefined ? o.speechSynthesis : has('speechSynthesis') ? globalThis.speechSynthesis : null,
    Utter: o.SpeechSynthesisUtterance || (has('SpeechSynthesisUtterance') ? globalThis.SpeechSynthesisUtterance : null),
    AudioCtx: o.AudioContext !== undefined ? o.AudioContext : has('AudioContext') ? globalThis.AudioContext : has('webkitAudioContext') ? globalThis.webkitAudioContext : null,
    now: o.now || (() => (has('performance') ? globalThis.performance.now() : Date.now())),
    setTimeout: o.setTimeout || ((fn, ms) => setTimeout(fn, ms)),
    clearTimeout: o.clearTimeout || ((id) => clearTimeout(id)),
    doc: o.document !== undefined ? o.document : has('document') ? globalThis.document : null,
    platform: o.platform || detectPlatform(),
  };
  const store = safeStorage(o.storage);
  const cfg = { ...VOICE_DEFAULTS, ...(o.config || {}) };
  let lines = normLines(o.lines);
  const getLang = typeof o.lang === 'function' ? o.lang : () => o.lang || 'zh';
  const bus = emitter();
  const pack = o.pack || null;
  const reduced =
    o.reducedMotion ??
    (() => {
      try {
        return has('matchMedia') ? !!globalThis.matchMedia('(prefers-reduced-motion: reduce)')?.matches : false;
      } catch {
        return false;
      }
    })();

  let enabled = store.get(cfg.storageKey) != null ? store.get(cfg.storageKey) !== '0' : o.enabled !== false;
  let muted = !!o.muted;
  let level = o.level || cfg.level;
  let unlocked = !!o.unlocked;
  // o.audioContext: an AudioContext, or (make) => AudioContext — in the app the page's ONE shared context (sfx.js:
  // music + button sounds + her voice pack), so an iPad page never runs a second context just for the voice
  const ctxSource = typeof o.audioContext === 'function' ? o.audioContext : null;
  let ownCtx = ctxSource ? null : o.audioContext || null;
  const audio = (make = false) => {
    if (ctxSource) {
      try {
        const c = ctxSource(make);
        return c && c.state !== 'closed' ? c : null;
      } catch {
        return null;
      }
    }
    if (!ownCtx && make && env.AudioCtx) ownCtx = new env.AudioCtx();
    return ownCtx;
  };
  let cur = null; // { id, lang, text, tier, token, resolve, chunks, … }
  let pending = null; // a delayed item waiting for its moment
  const queue = [];
  let token = 0;
  let talking = false;
  let releaseTimer = 0;
  let settleUntil = 0; // after synth.cancel(), give the engine a beat before the next speak (Chrome / iOS)
  const said = new Set(); // lines marked once: true that this guest has already heard (newGuest() clears it)
  const live = new Set(); // strong refs to utterances (Chrome / Safari GC'd them before 'end')
  const clipCache = new Map(); // key → { buf, env, hz } (small LRU)

  const readPrefs = () => {
    try {
      return JSON.parse(store.get(cfg.prefsKey) || '{}') || {};
    } catch {
      return {};
    }
  };
  let prefs = readPrefs();
  let voices = [];

  const mouth = createMouth({ onMouth: (v) => (o.onMouth?.(v), bus.emit('mouth', v)), now: env.now, schedule: o.schedule, cancelSchedule: o.cancelSchedule, reduced });

  const emit = (type, ev) => {
    const e = { type, ...ev };
    if (type === 'start') o.onStart?.(e);
    if (type === 'end') o.onEnd?.(e);
    if (type === 'line') o.onLine?.(e);
    o.onEvent?.(e);
    bus.emit(type, e);
    bus.emit('event', e);
    mouth.handle(e);
  };

  function setTalking(on) {
    env.clearTimeout(releaseTimer);
    releaseTimer = 0;
    if (on) {
      if (!talking) {
        talking = true;
        o.onTalking?.(true);
        bus.emit('talking', true);
      }
      return;
    }
    if (!talking) return;
    releaseTimer = env.setTimeout(() => {
      releaseTimer = 0;
      if (cur || pending || queue.length) return;
      talking = false;
      o.onTalking?.(false);
      bus.emit('talking', false);
    }, cfg.release);
  }

  /* ── device voices ── */
  function refreshVoices() {
    try {
      voices = env.synth?.getVoices?.() || [];
    } catch {
      voices = [];
    }
    return voices;
  }
  function loadVoices(timeout = 2500) {
    if (!env.synth) return Promise.resolve([]);
    if (refreshVoices().length) return Promise.resolve(voices);
    return new Promise((res) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        env.synth.removeEventListener?.('voiceschanged', onChange);
        res(refreshVoices());
      };
      const onChange = () => refreshVoices().length && finish();
      env.synth.addEventListener?.('voiceschanged', onChange);
      // Safari never fires voiceschanged on some versions: poll a few times
      [250, 700, 1400].forEach((ms) => env.setTimeout(() => refreshVoices().length && finish(), ms));
      env.setTimeout(finish, timeout);
    });
  }
  const ranked = (lang) => rankVoices(voices.length ? voices : refreshVoices(), lang, env.platform);
  function pickVoice(lang) {
    const list = ranked(lang).filter((r) => r.score > -100);
    const want = prefs[lang]?.voiceURI;
    return (want && ranked(lang).find((r) => (r.voice.voiceURI || r.voice.name) === want)?.voice) || list[0]?.voice || null;
  }
  const settingsFor = (lang, v = pickVoice(lang)) => ({ ...presetFor(v, lang, env.platform), ...(prefs[lang] || {}), voice: v });

  /* ── unlock (inside a tap) ── */
  function unlock() {
    let ok = false;
    try {
      if (env.synth && env.Utter && !unlocked) {
        const u = new env.Utter(' ');
        u.volume = 0;
        u.rate = 2;
        live.add(u);
        u.onend = u.onerror = () => live.delete(u);
        env.synth.speak(u);
      }
      ok = true;
    } catch {
      /* ignore */
    }
    try {
      const ctx = env.AudioCtx || ctxSource ? audio(true) : null;
      if (ctx) {
        if (ctx.state !== 'running') ctx.resume?.()?.catch?.(noop);
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, 22050);
        s.connect(ctx.destination);
        s.start(0);
      }
    } catch {
      /* ignore */
    }
    unlocked = unlocked || ok;
    bus.emit('state', state());
    return unlocked;
  }
  let offUnlock = null;
  if (o.autoUnlock && env.doc) {
    const EV = ['pointerup', 'touchend', 'keydown', 'click'];
    const on = () => {
      unlock();
      offUnlock?.();
    };
    EV.forEach((e) => env.doc.addEventListener(e, on, { capture: true, passive: true }));
    offUnlock = () => {
      EV.forEach((e) => env.doc.removeEventListener(e, on, true));
      offUnlock = null;
    };
  }

  /* ── the page goes to the background: a line that was cut off is not resumed later ── */
  let onVis = null;
  if (env.doc && o.cancelOnHide !== false) {
    onVis = () => {
      if (env.doc.visibilityState === 'hidden') return cancel('hidden');
      // back from the background: iOS can leave speechSynthesis "speaking" a dead queue — flush it while idle
      if (!cur && !pending) {
        try {
          if (env.synth?.speaking || env.synth?.pending) env.synth.cancel();
        } catch {
          /* ignore */
        }
      }
    };
    env.doc.addEventListener('visibilitychange', onVis);
  }

  /* ── playback ── */
  function finish(item, reason) {
    if (!item || item.done) return;
    item.done = true;
    env.clearTimeout(item.watch);
    env.clearTimeout(item.startWatch);
    if (item.src) {
      try {
        item.src.onended = null;
        item.src.stop();
      } catch {
        /* already stopped */
      }
    }
    if (item.started) emit('end', { id: item.id, lang: item.lang, tier: item.tier, reason });
    item.resolve({ id: item.id, lang: item.lang, tier: item.tier, reason, spoken: !!item.started && reason === 'done' });
    if (cur === item) {
      cur = null;
      next(); // the queue carries on (cancel() empties it first, so this is a no-op there)
    }
  }

  function startItem(item) {
    cur = item;
    item.token = ++token;
    const line = lines[item.id];
    if (line?.once) said.add(item.id);
    emit('line', { id: item.id, lang: item.lang, speaker: line?.speaker || 'pangie' });
    setTalking(true);
    const tryPack = pack && pack.has(item.id, item.lang, item.text) && env.AudioCtx && audio(false);
    if (tryPack) return playPack(item).catch(() => (cur === item && !item.done ? playDevice(item) : null));
    return playDevice(item);
  }

  async function playPack(item) {
    const ctx = audio(false);
    if (!ctx) throw new Error('no audio context');
    const key = `${pack.keyOf(item.id, item.lang, item.text)}#${pack.version ?? 0}`;
    let clip = clipCache.get(key);
    if (!clip) {
      const rec = await pack.get(item.id, item.lang, item.text);
      if (!rec?.wav) throw new Error('missing clip');
      const w = parseWav(rec.wav);
      const buf = ctx.createBuffer(1, w.samples.length, w.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < w.samples.length; i++) ch[i] = w.samples[i] / 32768;
      clip = { buf, env: rec.env ? Array.from(rec.env) : null, hz: rec.hz || 50 };
      clipCache.set(key, clip);
      if (clipCache.size > 16) clipCache.delete(clipCache.keys().next().value);
    }
    const buf = clip.buf;
    if (cur !== item || item.done) return;
    if (ctx.state !== 'running') {
      await Promise.resolve(ctx.resume?.()).catch(noop);
      if (ctx.state !== 'running') throw new Error('audio suspended');
    }
    if (cur !== item || item.done) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g).connect(ctx.destination); // her own path: the music's duck never touches her
    item.src = src;
    item.tier = 'pack';
    const latency = ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000;
    src.onended = () => finish(item, 'done');
    src.start(ctx.currentTime + 0.02);
    item.started = true;
    emit('start', { id: item.id, lang: item.lang, tier: 'pack', text: item.text, dur: buf.duration, env: clip.env, hz: clip.hz, delayMs: 20 + latency, speaker: lines[item.id]?.speaker || 'pangie' });
    item.watch = env.setTimeout(() => finish(item, 'timeout'), buf.duration * 1000 + 4000);
  }

  function playDevice(item) {
    const s = settingsFor(item.lang);
    const synth = env.synth;
    if (!synth || !env.Utter || !s.voice) return playSilent(item);
    item.tier = 'tts';
    item.chunks = chunkText(item.text, item.lang);
    item.ci = 0;
    item.offset = 0;
    const speakNext = () => {
      if (cur !== item || item.done) return;
      const text = item.chunks[item.ci];
      if (text == null) return finish(item, 'done');
      const u = new env.Utter(text);
      u.voice = s.voice;
      u.lang = s.voice.lang || (item.lang === 'zh' ? 'zh-CN' : 'en-GB');
      u.pitch = clamp(s.pitch, 0.5, 2);
      u.rate = clamp(s.rate, 0.5, 2);
      u.volume = 1;
      const my = item.token;
      const base = item.offset;
      live.add(u);
      const est = speechTimeline(text, item.lang, u.rate).dur;
      u.onstart = () => {
        if (my !== token || item.done) return;
        env.clearTimeout(item.startWatch);
        if (!item.started) {
          item.started = true;
          emit('start', { id: item.id, lang: item.lang, tier: 'tts', text: item.text, rate: u.rate, dur: speechTimeline(item.text, item.lang, u.rate).dur, voice: s.voice.name, speaker: lines[item.id]?.speaker || 'pangie' });
        } else emit('boundary', { id: item.id, ci: base });
        env.clearTimeout(item.watch);
        item.watch = env.setTimeout(() => (synth.cancel(), finish(item, 'timeout')), est * 2500 + 3000);
      };
      u.onboundary = (e) => {
        if (my !== token || item.done || !item.started) return;
        emit('boundary', { id: item.id, ci: base + (e.charIndex || 0) });
      };
      u.onend = () => {
        live.delete(u);
        if (my !== token || item.done) return;
        item.offset += text.length;
        item.ci++;
        if (item.ci >= item.chunks.length) finish(item, 'done');
        else speakNext();
      };
      u.onerror = (e) => {
        live.delete(u);
        if (my !== token || item.done) return;
        const err = e?.error || 'error';
        if (err === 'interrupted' || err === 'canceled') return; // our own cancel()
        if (err === 'not-allowed' && !item.started) {
          // iOS: no tap has unlocked speech yet — the page shows the caption only; unlock() on the next tap
          unlocked = false;
          return finish(item, 'locked');
        }
        finish(item, 'error');
      };
      // iOS / Chrome: speak() right after cancel() can be dropped — wait out the settle window
      const wait = Math.max(0, settleUntil - env.now());
      const go = () => {
        if (cur !== item || item.done) return;
        try {
          if (synth.paused) synth.resume?.();
          synth.speak(u);
        } catch {
          return finish(item, 'error');
        }
        // no 'start' within 2.5 s = the engine is stuck (iOS after a call / background): give up on this line
        if (!item.started)
          item.startWatch = env.setTimeout(() => {
            if (item.started || item.done) return;
            try {
              synth.cancel();
            } catch {
              /* ignore */
            }
            settleUntil = env.now() + 80;
            finish(item, unlocked ? 'stuck' : 'locked');
          }, cfg.startTimeout);
      };
      if (wait > 0) env.setTimeout(go, wait);
      else go();
    };
    speakNext();
  }

  /** no voice for this language: demos still move the mouth on a timer; the app stays silent (caption only) */
  function playSilent(item) {
    item.tier = 'none';
    if (!o.silentMouth) return finish(item, 'novoice');
    const rate = settingsFor(item.lang).rate || 1;
    const tl = speechTimeline(item.text, item.lang, rate);
    item.started = true;
    emit('start', { id: item.id, lang: item.lang, tier: 'none', text: item.text, rate, dur: tl.dur, speaker: lines[item.id]?.speaker || 'pangie' });
    item.watch = env.setTimeout(() => finish(item, 'done'), tl.dur * 1000 + 120);
  }

  function next() {
    if (cur || pending) return;
    const item = queue.shift();
    if (!item) return setTalking(false);
    if (item.delay > 0) {
      pending = item;
      item.timer = env.setTimeout(() => {
        if (pending !== item) return;
        pending = null;
        Promise.resolve(startItem(item)).finally(noop);
      }, item.delay);
      return;
    }
    Promise.resolve(startItem(item)).finally(noop);
  }

  function stopSynth() {
    if (!env.synth) return;
    try {
      if (env.synth.speaking || env.synth.pending) {
        env.synth.cancel();
        settleUntil = env.now() + 80;
      }
      live.clear();
    } catch {
      /* ignore */
    }
  }

  /** stop everything: current line, the delayed one, the queue */
  function cancel(reason = 'cancel') {
    if (pending) {
      env.clearTimeout(pending.timer);
      const p = pending;
      pending = null;
      p.resolve({ id: p.id, lang: p.lang, reason, spoken: false });
    }
    while (queue.length) {
      const q = queue.shift();
      q.resolve({ id: q.id, lang: q.lang, reason, spoken: false });
    }
    if (cur) {
      const c = cur;
      token++;
      if (c.tier === 'tts') stopSynth();
      finish(c, reason);
    }
    setTalking(false);
  }

  /** end the current line (a tap); the queue carries on */
  function skip() {
    if (pending && !cur) {
      env.clearTimeout(pending.timer);
      const p = pending;
      pending = null;
      p.resolve({ id: p.id, lang: p.lang, reason: 'skip', spoken: false });
      return next();
    }
    if (!cur) return;
    const c = cur;
    token++;
    if (c.tier === 'tts') stopSynth();
    finish(c, 'skip'); // finish() moves on to the next queued line
  }

  /** stop only if this line (or one of these lines) is playing / waiting / queued — screens clean up after themselves */
  function stopIf(ids) {
    const set = new Set([].concat(ids));
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!set.has(queue[i].id)) continue;
      const q = queue.splice(i, 1)[0];
      q.resolve({ id: q.id, lang: q.lang, reason: 'left', spoken: false });
    }
    if ((cur && set.has(cur.id)) || (pending && set.has(pending.id))) cancel('left');
    else if (!cur && !pending && !queue.length) setTalking(false);
  }

  /**
   * say(id, { mode: 'interrupt' | 'queue' | 'ifIdle', delay: ms, lang }) → Promise<{ id, lang, reason, spoken, tier }>
   * reasons: done · skip · cancel · replaced · left · hidden · off · muted · level · unknown · novoice · locked · busy · once ·
   *          dup (that line is already playing / waiting) · stuck / timeout / error (engine trouble — the caption still shows)
   */
  function say(id, opt = {}) {
    const line = lines[id];
    const lang = opt.lang === 'en' || opt.lang === 'zh' ? opt.lang : getLang() === 'en' ? 'en' : 'zh';
    const resolved = (reason) => Promise.resolve({ id, lang, reason, spoken: false });
    if (!line || line.voice === false) return resolved('unknown');
    const text = spokenText(line, lang);
    if (!text) return resolved('unknown');
    if (!enabled) return resolved('off');
    if (muted) return resolved('muted');
    if (level === 'key' && line.level === 'full') return resolved('level');
    if (line.once && said.has(id)) return resolved('once');
    const mode = opt.mode || 'interrupt';
    if (mode === 'ifIdle' && (cur || pending || queue.length)) return resolved('busy');
    // the same line asked for again (a re-render, a double tap, the shell and the page both greeting) while it is
    // playing, waiting for its delay or queued: keep the one we have
    const same = (x) => x && x.id === id && x.lang === lang && !x.done;
    if (same(cur) || same(pending) || queue.some(same)) return resolved('dup');
    return new Promise((resolve) => {
      const item = { id, lang, text, delay: Math.max(0, Number(opt.delay) || 0), resolve, done: false, started: false };
      if (mode === 'interrupt' && (pending || cur || queue.length)) cancel('replaced');
      queue.push(item);
      next(); // talking(true) fires in startItem(), when the line really begins (not during its delay)
    });
  }

  function state() {
    const tierFor = (lang) => {
      if (!enabled || muted) return 'off';
      return pickVoice(lang) ? 'tts' : 'none';
    };
    return {
      enabled,
      muted,
      unlocked,
      level,
      talking,
      speaking: cur ? cur.id : null,
      tier: cur?.tier || null,
      queued: queue.length + (pending ? 1 : 0),
      device: { zh: tierFor('zh'), en: tierFor('en') },
    };
  }

  const api = {
    say,
    cancel: () => cancel('cancel'),
    skip,
    stopIf,
    unlock,
    get enabled() {
      return enabled;
    },
    setEnabled(v, { persist = true } = {}) {
      enabled = !!v;
      if (persist) store.set(cfg.storageKey, enabled ? '1' : '0');
      if (!enabled) cancel('off');
      bus.emit('state', state());
    },
    get muted() {
      return muted;
    },
    setMuted(v) {
      muted = !!v;
      if (muted) cancel('muted');
      bus.emit('state', state());
    },
    get level() {
      return level;
    },
    setLevel(v) {
      level = v === 'key' ? 'key' : 'full';
      bus.emit('state', state());
    },
    get talking() {
      return talking;
    },
    /** the next guest: stop talking and forget the once-per-guest lines (the welcome greets again) */
    newGuest() {
      cancel('cancel');
      said.clear();
    },
    setLines(next) {
      lines = normLines(next);
    },
    line: (id) => lines[id] || null,
    text: (id, lang = getLang()) => spokenText(lines[id], lang),
    voices: {
      load: loadVoices,
      list: (lang) => ranked(lang),
      picked: (lang) => pickVoice(lang),
      settings: (lang) => settingsFor(lang),
      recommended: (lang) => presetFor(pickVoice(lang), lang, env.platform),
    },
    prefs: {
      get: (lang) => ({ ...(prefs[lang] || {}) }),
      set(lang, patch) {
        prefs = { ...prefs, [lang]: { ...(prefs[lang] || {}), ...patch } };
        store.set(cfg.prefsKey, JSON.stringify(prefs));
      },
      reset(lang) {
        const p = { ...prefs };
        if (lang) delete p[lang];
        prefs = lang ? p : {};
        store.set(cfg.prefsKey, JSON.stringify(prefs));
      },
      /** another page (staff settings) changed them */
      reload() {
        prefs = readPrefs();
      },
    },
    pack,
    get audioContext() {
      return audio(false);
    },
    state,
    on: bus.on,
    destroy() {
      cancel('cancel');
      mouth.stop();
      offUnlock?.();
      if (onVis) env.doc.removeEventListener('visibilitychange', onVis);
    },
  };
  if (env.synth) {
    loadVoices().then(() => bus.emit('state', state()));
    env.synth.addEventListener?.('voiceschanged', () => (refreshVoices(), bus.emit('state', state())));
  }
  return api;
}

/* ───────────────────────────── Wish Mode bridge ───────────────────────────── */

/**
 * Shell side (wish.html): answer the quiz iframe. `post(msg)` sends to the child, `listen(fn)` receives the child's
 * { op } messages. Returns an unsubscribe.
 *   child → shell  { op:'say', id, rid, lang, opts } · { op:'cancel' } · { op:'skip' } · { op:'stopIf', ids } ·
 *                  { op:'newGuest' } · { op:'hello' }
 *   shell → child  { ev: line | start | boundary | end | result (rid) | state | talking }   (start carries the envelope /
 *                  text so the child's own mouth driver animates Pangie locally — no per-frame messages)
 */
export function serveVoice(voice, { post, listen }) {
  const offs = [
    voice.on('event', (e) => post({ ev: e.type === 'start' && e.env ? { ...e, env: Array.from(e.env) } : e })),
    voice.on('state', (s) => post({ ev: { type: 'state', ...s } })),
    voice.on('talking', (on) => post({ ev: { type: 'talking', on } })),
  ];
  const off = listen((m) => {
    if (!m || typeof m !== 'object') return;
    if (m.op === 'say') {
      if (typeof m.id !== 'string') return;
      voice.say(m.id, { mode: m.opts?.mode, delay: m.opts?.delay, lang: m.lang === 'en' ? 'en' : 'zh' }).then((r) => post({ ev: { type: 'result', rid: m.rid, ...r } }));
    } else if (m.op === 'cancel') voice.cancel();
    else if (m.op === 'skip') voice.skip();
    else if (m.op === 'stopIf') voice.stopIf(Array.isArray(m.ids) ? m.ids.filter((x) => typeof x === 'string') : []);
    else if (m.op === 'newGuest') voice.newGuest();
    else if (m.op === 'hello') post({ ev: { type: 'state', ...voice.state() } });
  });
  return () => {
    offs.forEach((f) => f());
    off?.();
  };
}

/**
 * Child side (quiz / studio in the Wish-Mode iframe): the same say / cancel / skip / stopIf API, forwarded to the
 * shell. The mouth is driven locally from the shell's events. If the shell does not answer 'hello' within `timeout`
 * (an older shell), `fallback()` is called so the page can create its own local voice instead.
 */
export function createRemoteVoice({
  post,
  listen,
  lang,
  onMouth,
  onTalking,
  onStart,
  onEnd,
  onLine,
  timeout = 1500,
  fallback,
  now,
  schedule,
  cancelSchedule,
  reducedMotion,
  setTimeout: later = (fn, ms) => setTimeout(fn, ms),
  clearTimeout: unlater = (id) => clearTimeout(id),
} = {}) {
  const getLang = typeof lang === 'function' ? lang : () => lang || 'zh';
  const bus = emitter();
  const waiting = new Map(); // request id → resolve
  let rid = 0;
  let st = { enabled: true, muted: false, unlocked: false, talking: false };
  let answered = false;
  const mouth = createMouth({ onMouth: (v) => (onMouth?.(v), bus.emit('mouth', v)), now, schedule, cancelSchedule, reduced: reducedMotion });
  const settle = (r, res) => {
    const w = waiting.get(r);
    if (!w) return;
    waiting.delete(r);
    unlater(w.guard);
    w.resolve(res);
  };
  const off = listen((m) => {
    const e = m?.ev;
    if (!e || typeof e !== 'object') return;
    if (e.type === 'state') {
      answered = true;
      st = e;
      bus.emit('state', e);
      return;
    }
    if (e.type === 'talking') {
      st = { ...st, talking: !!e.on };
      onTalking?.(!!e.on);
      bus.emit('talking', !!e.on);
      return;
    }
    if (e.type === 'result') {
      settle(e.rid, { id: e.id, lang: e.lang, reason: e.reason, spoken: !!e.spoken, tier: e.tier });
      return;
    }
    mouth.handle(e);
    bus.emit(e.type, e);
    bus.emit('event', e);
    if (e.type === 'start') onStart?.(e);
    if (e.type === 'end') onEnd?.(e);
    if (e.type === 'line') onLine?.(e);
  });
  post({ op: 'hello' });
  if (fallback) later(() => !answered && fallback(), timeout);
  return {
    remote: true,
    say(id, opts = {}) {
      return new Promise((resolve) => {
        const r = ++rid;
        // the shell went away (reloaded, closed): never leave a caller hanging
        waiting.set(r, { resolve, guard: later(() => settle(r, { id, reason: 'timeout', spoken: false }), 30000) });
        post({ op: 'say', id, rid: r, lang: opts.lang || getLang(), opts: { mode: opts.mode, delay: opts.delay } });
      });
    },
    cancel: () => post({ op: 'cancel' }),
    skip: () => post({ op: 'skip' }),
    stopIf: (ids) => post({ op: 'stopIf', ids: [].concat(ids) }),
    newGuest: () => post({ op: 'newGuest' }),
    unlock: () => post({ op: 'hello' }),
    state: () => st,
    get enabled() {
      return st.enabled !== false;
    },
    get muted() {
      return !!st.muted;
    },
    get talking() {
      return !!st.talking;
    },
    get answered() {
      return answered;
    },
    on: bus.on,
    destroy() {
      off?.();
      mouth.stop();
      for (const r of [...waiting.keys()]) settle(r, { reason: 'cancel', spoken: false });
    },
  };
}

/* ═════════════════════════════ the app's voice (one per page) ═════════════════════════════ */

/** device settings (CONFIG.voice in config.js can change the defaults) */
export const VOICE_CFG = Object.freeze({ on: true, level: VOICE_DEFAULTS.level, duck: VOICE_DEFAULTS.duck, packVoice: GEMINI_TTS.voice, ...(CONFIG.voice || {}) });

const KEY = {
  on: VOICE_DEFAULTS.storageKey,
  prefs: VOICE_DEFAULTS.prefsKey,
  level: 'genie.voice.level', // 'full' | 'key'
  pack: 'genie.voice.pack', // the Gemini voice the premium pack is made with (part of every clip's key)
  model: 'genie.voice.model', // Gemini TTS model id staff picked (advanced)
  packAt: 'genie.voice.packAt', // bumped when the pack changes, so other open pages (the shell) reload it
  mute: 'genie.mute', // sound.js's own mute (standalone pages start muted if the guest muted last time)
};
const ls = safeStorage();
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/** every voiced line, in table order (the premium pack renders these × zh / en) */
export const VOICE_LINES = LINE_TABLE.lines;
const BY_ID = Object.fromEntries(VOICE_LINES.map((l) => [l.id, l]));

/** the line table entry (mood, prop, speaker, delay, mode, …) or null */
export const lineOf = (id) => BY_ID[id] || null;

/** caption text = exactly what she says, in the page's language (show this in the bubble — never t()) */
export function lineText(id, lang = getLang()) {
  const l = BY_ID[id];
  return l ? (lang === 'en' ? l.en : l.zh) : '';
}

/** staff preferences on this device (localStorage, try/catch) */
export const voicePrefs = {
  enabled: () => (ls.get(KEY.on) != null ? ls.get(KEY.on) !== '0' : VOICE_CFG.on !== false),
  level: () => ((ls.get(KEY.level) || VOICE_CFG.level) === 'key' ? 'key' : 'full'),
  setLevel(v) {
    const l = v === 'key' ? 'key' : 'full';
    ls.set(KEY.level, l);
    impl?.setLevel?.(l);
    stateChanged();
  },
  packVoice: () => ls.get(KEY.pack) || VOICE_CFG.packVoice || GEMINI_TTS.voice,
  setPackVoice(v) {
    const name = v || GEMINI_TTS.voice;
    ls.set(KEY.pack, name);
    sharedPack?.setVoice(name);
  },
  model: () => ls.get(KEY.model) || GEMINI_TTS.models[0],
  setModel(m) {
    ls.set(KEY.model, String(m || '').trim() || GEMINI_TTS.models[0]);
  },
  /** models to try, staff's choice first (a retired id falls through to the next) */
  models: () => [...new Set([voicePrefs.model(), ...GEMINI_TTS.models])],
  /** the device voice picked for a language ('' = automatic) */
  deviceVoice(lang) {
    try {
      return JSON.parse(ls.get(KEY.prefs) || '{}')?.[lang]?.voiceURI || '';
    } catch {
      return '';
    }
  },
  setDeviceVoice(lang, uri) {
    let p = {};
    try {
      p = JSON.parse(ls.get(KEY.prefs) || '{}') || {};
    } catch {
      /* start again */
    }
    const cur = { ...(p[lang] || {}) };
    if (uri) cur.voiceURI = uri;
    else delete cur.voiceURI;
    // a different voice gets that voice's recommended pitch / rate (presetFor), not the old one's overrides
    delete cur.pitch;
    delete cur.rate;
    p = { ...p, [lang]: cur };
    ls.set(KEY.prefs, JSON.stringify(p));
    impl?.prefs?.reload?.();
  },
};

/* ── talking state: '' (quiet) | 'pangie' | 'lamp' — <Pangie speaker> subscribes (useSyncExternalStore) ── */
let talkNow = '';
let speakerNow = 'pangie';
const talkSubs = new Set();
function setTalk(v) {
  if (v === talkNow) return;
  talkNow = v;
  talkSubs.forEach((f) => f());
  appBus.emit('speaking', v);
}
export const talkState = {
  /** '' while quiet, else who is talking: 'pangie' (her mouth moves) or 'lamp' (her voice from inside the lamp) */
  get: () => talkNow,
  subscribe(fn) {
    talkSubs.add(fn);
    return () => talkSubs.delete(fn);
  },
};

/* ── the mouth → DOM: --mouth on the talking speaker's .pg-talk (React never re-renders per frame) ── */
const MOUTH_SEL = 'svg.pangie.is-lipsync[data-speaker] .pg-talk';
function writeMouth(v) {
  if (!isBrowser) return;
  const s = v.toFixed(3);
  for (const g of document.querySelectorAll(MOUTH_SEL)) g.style.setProperty('--mouth', s);
}
function clearMouth() {
  if (!isBrowser) return;
  for (const g of document.querySelectorAll('svg.pangie[data-speaker] .pg-talk')) g.style.removeProperty('--mouth');
}

const appBus = emitter();
let impl = null;
let implKind = ''; // 'local' | 'remote'
let sharedPack = null;
let wired = false;

const stateChanged = () => appBus.emit('state', impl?.state?.() || null);

function inShellFrame() {
  if (!isBrowser) return false;
  try {
    return new URLSearchParams(location.search).get('mode') === 'wish' && window.parent && window.parent !== window;
  } catch {
    return false;
  }
}

/** the premium pack on this page (one IndexedDB connection, shared by the voice and the staff settings) */
function getPack() {
  if (!sharedPack && typeof indexedDB !== 'undefined') {
    try {
      sharedPack = createPack({ store: idbStore(), voice: voicePrefs.packVoice() });
    } catch {
      sharedPack = null;
    }
  }
  return sharedPack;
}

function hooks() {
  return {
    onMouth: (v) => {
      if (talkNow === 'pangie') writeMouth(v);
    },
    onLine: (e) => {
      speakerNow = e.speaker === 'lamp' ? 'lamp' : 'pangie';
      if (talkNow) setTalk(speakerNow);
    },
    onTalking: (on) => {
      if (!on) clearMouth();
      setTalk(on ? speakerNow : '');
    },
  };
}

function wire(v) {
  for (const type of ['event', 'line', 'start', 'boundary', 'end', 'state', 'talking', 'mouth']) v.on(type, (e) => appBus.emit(type, e));
}

function makeLocal() {
  const v = createVoice({
    // the page's one AudioContext (sfx.js, shared with the music): created / unlocked by the first tap, never a second one
    audioContext: (make) => (make ? getAudioContext() : sfx.ctx),
    lines: LINE_TABLE,
    lang: getLang,
    level: voicePrefs.level(),
    enabled: VOICE_CFG.on !== false,
    muted: ls.get(KEY.mute) === '1',
    autoUnlock: true,
    pack: getPack(),
    ...hooks(),
  });
  wire(v);
  return v;
}

function makeRemote() {
  const v = createRemoteVoice({
    lang: getLang,
    post: (m) => {
      try {
        window.parent.postMessage({ source: 'genie', type: 'voice', ...m }, location.origin);
      } catch {
        /* ignore */
      }
    },
    listen(fn) {
      const on = (e) => {
        if (e.origin !== location.origin || e.source !== window.parent || e.data?.source !== 'genie-shell' || e.data.type !== 'voice') return;
        fn(e.data);
      };
      window.addEventListener('message', on);
      return () => window.removeEventListener('message', on);
    },
    ...hooks(),
    timeout: 2500, // a busy iPad can take a moment to answer; an older shell (no voice) just means a short wait
    fallback: () => {
      // an older shell that does not speak: this page speaks for itself (the next tap unlocks it on iPad)
      impl?.destroy?.();
      implKind = 'local';
      impl = makeLocal();
      stateChanged();
    },
  });
  wire(v);
  return v;
}

function onStorage(e) {
  if (!e.key || !impl) return;
  if (e.key === KEY.on && implKind === 'local') impl.setEnabled(e.newValue !== '0', { persist: false });
  else if (e.key === KEY.level && implKind === 'local') impl.setLevel(e.newValue === 'key' ? 'key' : 'full');
  else if (e.key === KEY.prefs) impl.prefs?.reload?.();
  else if (e.key === KEY.pack) sharedPack?.setVoice(e.newValue || GEMINI_TTS.voice);
  else if (e.key === KEY.packAt) sharedPack?.reload();
}

function onSkipTap(e) {
  if (talkNow && e.target?.closest?.('[data-voice-skip]')) impl?.skip();
}

function get() {
  if (impl || !isBrowser) return impl;
  implKind = inShellFrame() ? 'remote' : 'local';
  impl = implKind === 'remote' ? makeRemote() : makeLocal();
  if (!wired) {
    wired = true;
    window.addEventListener('storage', onStorage);
    // a tap on the talking Pangie or her bubble (anything marked data-voice-skip) ends the line
    document.addEventListener('pointerdown', onSkipTap, { capture: true, passive: true });
  }
  return impl;
}

const quiet = (id, reason = 'unknown') => Promise.resolve({ id, reason, spoken: false });
const duckLevel = (x) => {
  const f = typeof x === 'string' ? CONFIG.wishDuck?.[x] ?? 1 : Number(x ?? 1);
  return clamp(Number.isFinite(f) ? f : 1, 0, 1);
};

/**
 * (on: boolean) => void that ducks / restores the music through the music module's own API, whichever it has:
 *   zen.talk(on)                                     music −7.5 dB, the nature bed only −2 dB (she speaks in the garden)
 *   zen.duck('voice', level) / zen.unduck('voice')   a duck layer on top of the page level (via: 'duck' prefers this)
 *   zen.duck(pageLevel() × level, s)                 the older engine; needs pageLevel: () => 1 | 'blueprint' | 'studio' | 'idle'
 * level: the duck factor (default: the music module's own voice duck, else CONFIG.voice.duck). Repeated calls with the
 * same state do nothing; a zen that throws never breaks her voice.
 */
export function duckerFor(zen, { level, pageLevel, via } = {}) {
  let on = false;
  return (want) => {
    want = !!want;
    if (!zen || want === on) return;
    on = want;
    try {
      if (typeof zen.talk === 'function' && via !== 'duck') zen.talk(on);
      else if (typeof zen.unduck === 'function') {
        if (!on) zen.unduck('voice');
        else if (level != null) zen.duck('voice', level);
        else zen.duck('voice');
      } else if (typeof zen.duck === 'function' && pageLevel) zen.duck(duckLevel(pageLevel()) * (on ? level ?? VOICE_CFG.duck : 1), on ? 0.25 : 0.9);
    } catch {
      /* the music never breaks her voice */
    }
  };
}

/**
 * The one voice every page uses. Same API standalone and in Wish Mode (where the shell speaks and this page only
 * asks, by id, and moves Pangie's mouth). Nothing here ever speaks text that is not in the line table.
 */
export const voice = {
  /** create it now (page mount) so the first tap anywhere can unlock speech on iPad; returns the voice */
  init() {
    get();
    return voice;
  },
  /** say(id, { delay, mode: 'interrupt' | 'queue' | 'ifIdle', lang }) → Promise<{ id, reason, spoken, tier }> */
  say: (id, opts) => get()?.say(id, opts) ?? quiet(id, isBrowser ? 'unknown' : 'novoice'),
  /** stop everything (current line, delayed and queued ones) */
  cancel: () => get()?.cancel(),
  /** end the current line; the queue carries on */
  skip: () => get()?.skip(),
  /** this screen is leaving: stop these lines if they are playing / waiting / queued (others keep going) */
  stopIf: (ids) => get()?.stopIf(ids),
  /** inside a tap: unlock speech + audio (iPad). Pages unlock themselves on the first gesture anyway */
  unlock: () => get()?.unlock(),
  /**
   * The next guest: stop, and let the once-per-guest lines (the welcome, the reveal, the blueprint) play again.
   * Inside the Wish-Mode iframe this is a no-op — the shell owns guest boundaries (its own newGuest()), so the
   * iframe's restart never cuts the shell's goodbye.
   */
  newGuest: () => (implKind === 'remote' ? undefined : get()?.newGuest?.()),
  /** follow the page's sound mute (stops her at once). Inside the Wish-Mode iframe the shell's mute rules */
  setMuted: (m) => (implKind === 'remote' ? undefined : get()?.setMuted?.(!!m)),
  /** Pangie speaks / captions only — remembered on this device (every page and the shell follow it) */
  setEnabled(v) {
    ls.set(KEY.on, v ? '1' : '0');
    if (get() && implKind === 'local') impl.setEnabled(!!v);
    stateChanged();
  },
  get enabled() {
    return implKind === 'local' && impl ? impl.enabled : voicePrefs.enabled();
  },
  get muted() {
    return !!get()?.muted;
  },
  /** 'full' | 'key' (staff) — remembered on this device */
  setLevel: (v) => voicePrefs.setLevel(v),
  get level() {
    return voicePrefs.level();
  },
  /** true while a line is playing (or between two lines that follow each other) */
  get talking() {
    return !!talkNow;
  },
  /** inside the Wish-Mode iframe (the shell speaks) */
  get remote() {
    get();
    return implKind === 'remote';
  },
  state: () => get()?.state?.() || null,
  /**
   * voice.on(type, fn) → off. Types: 'speaking' ('' | 'pangie' | 'lamp') · 'talking' (bool) · 'mouth' (0–1 per frame —
   * e.g. the splash lamp's --glow) · 'line' / 'start' / 'end' ({ id, speaker, … }) · 'state' · 'event'
   */
  on(type, fn) {
    get();
    return appBus.on(type, fn);
  },
  /**
   * Duck the music while she talks (she starts → down in 0.25 s, the last line ends → back in 0.9 s; back-to-back
   * lines duck once) — see duckerFor() for which music API is used. Returns detach().
   */
  attachMusic(zen, opts = {}) {
    if (!zen) return noop;
    const apply = duckerFor(zen, opts);
    get();
    apply(!!talkNow);
    const off = appBus.on('speaking', (v) => apply(!!v));
    return () => {
      off();
      apply(false);
    };
  },
  /**
   * Wish-Mode shell: answer the iframe. `post(msg)` = the shell's post (it adds source:'genie-shell'). Route the
   * child's { type:'voice' } messages to handle(d). Returns { handle, off }.
   */
  serve(post) {
    const v = get();
    let fn = null;
    const off =
      v && implKind === 'local'
        ? serveVoice(v, {
            post: (m) => post({ type: 'voice', ...m }),
            listen: (f) => {
              fn = f;
              return () => (fn = null);
            },
          })
        : noop;
    return { handle: (d) => fn?.(d), off };
  },
  /** device voices for a language, best first ([{ voice, score, why }]); [] in the iframe or without speech */
  voices: (lang) => (implKind === 'local' ? get()?.voices?.list(lang) || [] : has('speechSynthesis') ? rankVoices(globalThis.speechSynthesis.getVoices?.() || [], lang) : []),
  /** wait for the device voice list (Safari loads it late) */
  loadVoices: () => (get() && implKind === 'local' ? impl.voices.load() : Promise.resolve([])),
};

/* ── premium voice pack: staff generation job (Studio → Settings → 潘吉的声音). One job per page; the settings
      sheet can close and reopen while it runs. ── */
let job = null; // { status: 'running' | 'done' | 'partial' | 'quota' | 'fatal' | 'storage' | 'aborted', done, total, made, … }
let jobCtl = null;
const jobSubs = new Set();
const setJob = (j) => {
  job = j;
  jobSubs.forEach((f) => f(job));
};
const packTouched = () => ls.set(KEY.packAt, String(Date.now()));

export const voicePack = {
  /** is there IndexedDB on this device (no pack in some private modes) */
  available: () => !!getPack(),
  /** how many lines of the current voice are cached → Promise<{ n, total }> */
  async count() {
    const p = getPack();
    if (!p) return { n: 0, total: VOICE_LINES.length * 2 };
    await p.ready();
    return p.count(VOICE_LINES);
  },
  voice: () => voicePrefs.packVoice(),
  /** switch the Gemini voice (clips of other voices stay cached; this one may need generating) */
  setVoice: (v) => voicePrefs.setPackVoice(v),
  job: () => job,
  subscribe(fn) {
    jobSubs.add(fn);
    return () => jobSubs.delete(fn);
  },
  /** render every missing line (resumable); regenerate = render this voice's lines again from scratch */
  async generate({ apiKey, baseUrl, regenerate = false } = {}) {
    const p = getPack();
    if (!p || !apiKey || job?.status === 'running') return job;
    const ac = new AbortController();
    jobCtl = ac;
    setJob({ status: 'running', done: 0, total: 0, made: 0, skipped: 0, failed: 0 });
    try {
      p.setVoice(voicePrefs.packVoice());
      if (regenerate) await p.drop(VOICE_LINES);
      const res = await p.generate({
        lines: VOICE_LINES,
        apiKey,
        baseUrl: baseUrl || undefined,
        models: voicePrefs.models(),
        signal: ac.signal,
        onProgress: (x) => setJob({ ...x, status: 'running' }),
      });
      setJob(res);
    } catch (e) {
      setJob({ ...(job || {}), status: 'partial', error: String(e?.message || e) });
    } finally {
      jobCtl = null;
      packTouched();
    }
    return job;
  },
  stop: () => jobCtl?.abort(),
  /** delete every clip on this device (she falls back to the device voice) */
  async clear() {
    jobCtl?.abort();
    await getPack()?.clear();
    setJob(null);
    packTouched();
  },
};
