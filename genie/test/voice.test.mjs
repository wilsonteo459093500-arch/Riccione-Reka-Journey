// 潘吉的声音 · node test/voice.test.mjs (npm test runs it) — no browser, no key, no network.
// Mock Gemini (synthetic 24 kHz PCM), a fake speechSynthesis, a fake AudioContext and a fake postMessage channel.
// Ported from the design round (scratchpad/voice/test/voice.test.mjs) + the app layer (line table, music ducking).
import assert from 'node:assert/strict';
import {
  VOICE_DEFAULTS,
  GEMINI_TTS,
  hashText,
  speakable,
  chunkText,
  speechTimeline,
  createMouth,
  rankVoices,
  presetFor,
  detectPlatform,
  pcmFromBase64,
  pcmToWav,
  parseWav,
  trimSilence,
  normalizePcm,
  envelope,
  buildPrompt,
  buildStyle,
  ttsDialect,
  ttsBody,
  decodeAudioPart,
  STYLE,
  geminiTTS,
  memoryStore,
  createPack,
  spokenText,
  createVoice,
  serveVoice,
  createRemoteVoice,
  duckerFor,
  lineText,
  lineOf,
  VOICE_LINES,
  VOICE_CFG,
  voice as appVoice,
} from '../src/shared/voice.js';
import LINES from '../src/shared/i18n/voice-lines.js';
import EN from '../src/shared/i18n/en.js';
import { CONFIG } from '../src/shared/config.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${String(e.stack || e).split('\n').slice(0, 4).join('\n    ')}`);
  }
}

/* ───────── fixtures ───────── */

/** 0.3 s silence + `sec` s of "speech" (220 Hz carrier, 4.5 Hz syllable AM) + 0.4 s silence, 24 kHz 16-bit mono */
function synthPcm(sec = 1.2, sr = 24000, amp = 0.32) {
  const pre = Math.round(sr * 0.3);
  const body = Math.round(sr * sec);
  const post = Math.round(sr * 0.4);
  const out = new Int16Array(pre + body + post);
  for (let i = 0; i < body; i++) {
    const t = i / sr;
    const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.5 * t - Math.PI / 2);
    out[pre + i] = Math.round(Math.sin(2 * Math.PI * 220 * t) * am * amp * 32767);
  }
  return out;
}
const pcmToB64 = (pcm) => Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');

/** interleave a mono clip into an n-channel 16-bit WAV (what Gemini 3.8 returns by default: a RIFF file) */
function wavB64(pcm, rate = 24000, channels = 1, { streamed = false } = {}) {
  const frames = pcm.length;
  const bytes = frames * 2 * channels;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(streamed ? 0xffffffff : 36 + bytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2 * channels, 28);
  buf.writeUInt16LE(2 * channels, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(streamed ? 0xffffffff : bytes, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) buf.writeInt16LE(c ? 0 : pcm[i], 44 + (i * channels + c) * 2);
  return buf.toString('base64');
}

/** a fake Gemini endpoint: records requests; script = array of per-call behaviours (else 200 with audio:
 *  raw L16 like the preview models, or format 'wav' like Gemini 3.8) */
function mockGemini({ script = [], sec = 1.0, format = 'l16', rate = 24000, channels = 1, streamed = false } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    const step = script.length ? script.shift() : null;
    const reply = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json });
    if (step === 404) return reply(404, { error: { code: 404, message: 'models/x is not found for API version v1beta' } });
    if (step === 401) return reply(401, { error: { code: 401, message: 'API key not valid' } });
    if (step === '429min') return reply(429, { error: { code: 429, message: 'Resource exhausted', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '0.01s' }] } });
    if (step === '429day')
      return reply(429, {
        error: { code: 429, message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] },
      });
    if (step === 500) return reply(500, { error: { code: 500, message: 'Internal' } });
    if (step === 'noaudio') return reply(200, { candidates: [{ content: { parts: [{ text: 'hello' }] } }] });
    if (step === 'badmeta')
      return reply(400, { error: { code: 400, message: 'Invalid JSON payload received. Unknown name "speechMetadata" at \'contents[0].parts[0]\': Cannot find field.' } });
    if (format === 'wav') return reply(200, { candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: 'audio/wav', data: wavB64(synthPcm(sec, rate), rate, channels, { streamed }) } }] } }] });
    return reply(200, { candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: `audio/L16;codec=pcm;rate=${rate}`, data: pcmToB64(synthPcm(sec, rate)) } }] } }] });
  };
  return { fetch, calls };
}

class FakeUtter {
  constructor(text) {
    this.text = text;
    this.voice = null;
    this.lang = '';
    this.pitch = 1;
    this.rate = 1;
    this.volume = 1;
  }
}

/** speechSynthesis double: one utterance at a time, start after 5 ms, a boundary per word, end after msPerChar */
class FakeSynth {
  constructor(voices = [], { msPerChar = 4, start = true, notAllowed = false } = {}) {
    this.voices = voices;
    this.msPerChar = msPerChar;
    this.autoStart = start;
    this.notAllowed = notAllowed;
    this.spoken = [];
    this.queue = [];
    this.current = null;
    this.cancels = 0;
    this.paused = false;
    this.listeners = {};
  }
  getVoices() {
    return this.voices;
  }
  addEventListener(t, f) {
    (this.listeners[t] ||= new Set()).add(f);
  }
  removeEventListener(t, f) {
    this.listeners[t]?.delete(f);
  }
  get speaking() {
    return !!this.current;
  }
  get pending() {
    return this.queue.length > 0;
  }
  speak(u) {
    this.spoken.push(u);
    if (this.notAllowed && u.volume > 0) {
      setTimeout(() => u.onerror?.({ error: 'not-allowed' }), 1);
      return;
    }
    this.queue.push(u);
    this.pump();
  }
  cancel() {
    this.cancels++;
    const c = this.current;
    this.current = null;
    this.queue = [];
    if (c) setTimeout(() => c.onerror?.({ error: 'interrupted' }), 0);
  }
  resume() {}
  pump() {
    if (this.current || !this.queue.length || !this.autoStart) return;
    const u = this.queue.shift();
    this.current = u;
    const dur = Math.max(10, u.text.length * this.msPerChar);
    setTimeout(() => {
      if (this.current !== u) return;
      u.onstart?.({});
      let ci = 0;
      for (const w of u.text.split(/(\s+)/)) {
        const at = ci;
        if (w.trim()) setTimeout(() => this.current === u && u.onboundary?.({ charIndex: at, name: 'word' }), (at / u.text.length) * dur);
        ci += w.length;
      }
      setTimeout(() => {
        if (this.current !== u) return;
        this.current = null;
        u.onend?.({});
        this.pump();
      }, dur);
    }, 5);
  }
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = { name: 'dest' };
    this.started = [];
    this.canResume = true;
  }
  resume() {
    if (this.canResume) this.state = 'running';
    return Promise.resolve();
  }
  createBuffer(ch, len, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i) => data[i] };
  }
  createGain() {
    return { gain: { value: 1 }, connect: (x) => x };
  }
  createBufferSource() {
    const ctx = this;
    const src = {
      buffer: null,
      onended: null,
      connect: (x) => x,
      start() {
        ctx.started.push(src);
        setTimeout(() => !src.stopped && src.onended?.(), 30);
      },
      stop() {
        src.stopped = true;
      },
    };
    return src;
  }
}

const V = (name, lang, extra = {}) => ({ name, lang, voiceURI: extra.voiceURI || `${name}-${lang}`, localService: extra.localService ?? true, default: !!extra.default });
const IOS_VOICES = [
  V('Tingting', 'zh-CN', { voiceURI: 'com.apple.voice.compact.zh-CN.Tingting' }),
  V('Tingting (Enhanced)', 'zh-CN', { voiceURI: 'com.apple.voice.enhanced.zh-CN.Tingting' }),
  V('Li-mu', 'zh-CN', { voiceURI: 'com.apple.voice.compact.zh-CN.Li-mu' }),
  V('Meijia', 'zh-TW', { voiceURI: 'com.apple.voice.compact.zh-TW.Meijia' }),
  V('Sinji', 'zh-HK', { voiceURI: 'com.apple.voice.compact.zh-HK.Sinji' }),
  V('Flo', 'zh-CN', { voiceURI: 'com.apple.eloquence.zh-CN.Flo' }),
  V('Samantha', 'en-US', { voiceURI: 'com.apple.voice.compact.en-US.Samantha', default: true }),
  V('Daniel', 'en-GB', { voiceURI: 'com.apple.voice.compact.en-GB.Daniel' }),
  V('Serena (Premium)', 'en-GB', { voiceURI: 'com.apple.voice.premium.en-GB.Serena' }),
  V('Kate', 'en-GB', { voiceURI: 'com.apple.voice.compact.en-GB.Kate' }),
  V('Bubbles', 'en-US', { voiceURI: 'com.apple.speech.synthesis.voice.Bubbles' }),
  V('Junior', 'en-US', { voiceURI: 'com.apple.speech.synthesis.voice.Junior' }),
];
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

function voiceWith(extra = {}) {
  const synth = extra.synth || new FakeSynth(IOS_VOICES);
  const events = [];
  const voice = createVoice({
    lines: LINES,
    lang: extra.lang || 'zh',
    speechSynthesis: synth,
    SpeechSynthesisUtterance: FakeUtter,
    AudioContext: extra.AudioContext === undefined ? null : extra.AudioContext,
    storage: extra.storage || memStorage(),
    document: null,
    platform: 'ios',
    config: { release: 15, startTimeout: extra.startTimeout || 400 },
    onEvent: (e) => events.push(e),
    pack: extra.pack || null,
    silentMouth: extra.silentMouth,
    schedule: (fn) => setTimeout(fn, 8),
    cancelSchedule: (id) => clearTimeout(id),
    onTalking: extra.onTalking,
    onMouth: extra.onMouth,
    reducedMotion: false,
  });
  return { voice, synth, events };
}

/* ───────── lines ───────── */

console.log('台词 voice-lines.js');
await test('every line: id, zh + en, ≤ 2 sentences, no emoji, known group / level / speaker / mode', () => {
  const groups = new Set(LINES.groups.map((g) => g.id));
  const ids = new Set();
  for (const l of LINES.lines) {
    assert.ok(!ids.has(l.id), `dup ${l.id}`);
    ids.add(l.id);
    assert.ok(groups.has(l.group), l.id);
    assert.ok(l.zh && l.en, l.id);
    assert.ok(!/\p{Extended_Pictographic}/u.test(l.zh + l.en), l.id);
    assert.ok(['key', 'full', 'staff'].includes(l.level), l.id);
    assert.ok(['pangie', 'lamp'].includes(l.speaker), l.id);
    assert.ok(['interrupt', 'queue', 'ifIdle'].includes(l.mode), l.id);
    assert.ok(Number.isFinite(l.delay) && l.delay >= 0, l.id);
    assert.ok(['bubble', 'screen', 'none'].includes(l.caption), l.id);
    assert.ok(l.at && l.note, l.id);
    // ≤ 2 sentences (a sentence ends at 。！？ / .!?)
    assert.ok((l.zh.match(/[。！？]/g) || []).length <= 2, `${l.id} zh`);
    assert.ok((l.en.match(/[.!?](\s|$)/g) || []).length <= 2, `${l.id} en`);
    // her voice: first person, no 您, no 儿化 / baby talk (SPEC §1)
    assert.ok(!/您|人家|潘吉会|潘吉不|潘吉在|儿[，。！？]|～/.test(l.zh), `${l.id}: ${l.zh}`);
  }
  for (const id of LINES.sequence) assert.ok(ids.has(id), id);
  assert.equal(LINES.lines.length, 33);
});
await test('no line can carry guest data: no {0} placeholders, no 名字 slots', () => {
  for (const l of LINES.lines) assert.ok(!/\{\w+\}/.test(l.zh + l.en + (l.zhSay || '') + (l.enSay || '')), l.id);
});
await test('the 12 timed pairs stay silent: no line is bound to PairStep', () => {
  for (const l of LINES.lines) assert.ok(!/PairStep|pair:/.test(l.at), l.id);
});
await test('spoken text = caption after clean-up (zhSay / enSay only change pronunciation)', () => {
  const l = LINES.lines.find((x) => x.id === 'ch.intuition');
  assert.equal(spokenText(l, 'zh'), '直觉之牌。别想，三秒内，跟着第一感觉选。');
  assert.equal(spokenText(LINES.lines.find((x) => x.id === 'tr.shoes'), 'zh'), '我也在数鞋子呢，大概就好。');
  assert.equal(spokenText(LINES.lines.find((x) => x.id === 'reveal.reading'), 'zh'), '让我读一读你的梦想。');
  assert.equal(spokenText(LINES.lines.find((x) => x.id === 'reveal.reading'), 'en'), 'Let me read your dream.');
});

/* ───────── text ───────── */

console.log('文字处理');
await test('speakable: emoji out, —— / ～ become pauses, 「」 dropped', () => {
  assert.equal(speakable('潘吉在数鞋子… 👀 大概就好～', 'zh'), '潘吉在数鞋子，大概就好');
  assert.equal(speakable('现在请慢下来 —— 数字越准，柜子越合身。', 'zh'), '现在请慢下来，数字越准，柜子越合身。');
  assert.equal(speakable('因为你说「玄关不再乱」✨', 'zh'), '因为你说玄关不再乱');
  assert.equal(speakable('Drag it — watch the cabinets change! ✨', 'en'), 'Drag it, watch the cabinets change!');
});
await test('chunkText: short = one utterance; long splits at sentence ends', () => {
  assert.deepEqual(chunkText('嗨，我是潘吉！', 'zh'), ['嗨，我是潘吉！']);
  const long = '第一句话在这里说完了。'.repeat(12);
  const parts = chunkText(long, 'zh', 40);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 40), JSON.stringify(parts));
  assert.equal(parts.join(''), long);
});
await test('hashText is stable and changes with the text', () => {
  assert.equal(hashText('嗨'), hashText('嗨'));
  assert.notEqual(hashText('嗨'), hashText('嗨！'));
  assert.match(hashText('x'), /^[0-9a-f]{8}$/);
});

/* ───────── audio ───────── */

console.log('音频（Gemini PCM → WAV）');
await test('base64 PCM → Int16 round trip', () => {
  const pcm = synthPcm(0.2);
  assert.deepEqual(pcmFromBase64(pcmToB64(pcm)), pcm);
});
await test('WAV header: RIFF / WAVE / fmt PCM mono 16-bit 24 kHz, sizes and duration right', () => {
  const pcm = synthPcm(1.0);
  const wav = pcmToWav(pcm, 24000);
  const dv = new DataView(wav);
  const tag = (o) => String.fromCharCode(...new Uint8Array(wav, o, 4));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(tag(12), 'fmt ');
  assert.equal(dv.getUint32(16, true), 16);
  assert.equal(dv.getUint16(20, true), 1);
  assert.equal(dv.getUint16(22, true), 1);
  assert.equal(dv.getUint32(24, true), 24000);
  assert.equal(dv.getUint32(28, true), 48000);
  assert.equal(dv.getUint16(32, true), 2);
  assert.equal(dv.getUint16(34, true), 16);
  assert.equal(tag(36), 'data');
  assert.equal(dv.getUint32(40, true), pcm.length * 2);
  assert.equal(dv.getUint32(4, true), 36 + pcm.length * 2);
  assert.equal(wav.byteLength, 44 + pcm.length * 2);
  const back = parseWav(wav);
  assert.equal(back.sampleRate, 24000);
  assert.equal(back.channels, 1);
  assert.equal(back.bits, 16);
  assert.ok(Math.abs(back.duration - pcm.length / 24000) < 1e-9);
  assert.deepEqual(back.samples, pcm);
});
await test('trimSilence keeps ~60 ms before / ~140 ms after the voice', () => {
  const pcm = synthPcm(1.0);
  const t = trimSilence(pcm, 24000);
  const d = t.length / 24000;
  assert.ok(d > 1.0 && d < 1.0 + 0.06 + 0.14 + 0.05, `trimmed to ${d}s`);
});
await test('normalizePcm: quiet clips come up (gain ≤ 4×), loud clips keep peaks under −1 dBFS', () => {
  const peakOf = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const quiet = synthPcm(1.0, 24000, 0.08);
  const up = normalizePcm(quiet, 24000, -19);
  assert.ok(peakOf(up) > peakOf(quiet) * 2.5, `louder (${peakOf(quiet)} → ${peakOf(up)})`);
  const tiny = synthPcm(1.0, 24000, 0.01);
  assert.ok(peakOf(normalizePcm(tiny)) <= peakOf(tiny) * 4 + 4, 'never more than 4× (no hiss pumped up)');
  const loud = synthPcm(1.0, 24000, 0.99);
  assert.ok(peakOf(normalizePcm(loud)) <= 0.892 * 32767, 'peaks stay under −1 dBFS');
});
await test('envelope: 50 Hz, 0–255, closed in silence, open in speech', () => {
  const pcm = synthPcm(1.0);
  const env = envelope(pcm, 24000, 50);
  assert.equal(env.length, Math.ceil(pcm.length / 480));
  assert.ok(env[2] < 20, 'silence is closed');
  const mid = env.slice(20, 60);
  assert.ok(Math.max(...mid) > 150, 'speech opens the mouth');
  assert.ok(Math.min(...mid) < Math.max(...mid) - 60, 'syllables move it');
});

/* ───────── Gemini ───────── */

console.log('Gemini TTS（mock fetch）');
await test('Gemini 3.8 (default): the text is the line alone; her direction rides in speechMetadata.style', async () => {
  assert.equal(GEMINI_TTS.models[0], 'gemini-3.8-flash-tts');
  assert.equal(ttsDialect('gemini-3.8-flash-tts'), 'metadata');
  assert.equal(ttsDialect('gemini-3.8-flash-lite-tts'), 'metadata');
  assert.equal(ttsDialect('gemini-9-flash-tts'), 'metadata', 'unknown future ids: never risk reading notes aloud');
  assert.equal(ttsDialect('gemini-3.1-flash-tts-preview'), 'prompt');
  assert.equal(ttsDialect('gemini-2.5-flash-preview-tts'), 'prompt');
  const g = mockGemini({ format: 'wav' });
  const body = ttsBody({ model: 'gemini-3.8-flash-tts', voice: 'Leda', text: '还在吗？', lang: 'zh', note: 'soft and curious' });
  const out = await geminiTTS({ apiKey: 'AIzaTEST', model: 'gemini-3.8-flash-tts', body, fetch: g.fetch });
  const c = g.calls[0];
  assert.equal(c.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent');
  const part = c.body.contents[0].parts[0];
  assert.equal(part.text, '还在吗？', 'verbatim transcript: nothing but the line');
  assert.match(part.speechMetadata.style, /little girl genie/);
  assert.match(part.speechMetadata.style, /Malaysia/);
  assert.match(part.speechMetadata.style, /This line: soft and curious/);
  assert.ok(!JSON.stringify(c.body).includes('TRANSCRIPT'));
  assert.equal(c.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Leda');
  assert.deepEqual(c.body.generationConfig.responseModalities, ['AUDIO']);
  // 3.8 answers with a RIFF WAV: decoded, not wrapped twice
  assert.equal(out.sampleRate, 24000);
  assert.equal(out.pcm.length, synthPcm(1.0).length, 'the 44-byte header is not read as samples');
  assert.equal(out.pcm[0], 0);
  assert.equal(ttsBody({ model: 'gemini-3.8-flash-tts', text: 'x', plain: true }).contents[0].parts[0].speechMetadata, undefined);
  assert.match(buildStyle('en', ''), /British/);
});
await test('audio replies: raw L16 (any rate), WAV mono / stereo / 48 kHz / streamed header → mono Int16 + rate', () => {
  const pcm = synthPcm(0.5, 24000);
  const l16 = decodeAudioPart({ mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmToB64(pcm) });
  assert.equal(l16.sampleRate, 24000);
  assert.deepEqual(Array.from(l16.pcm.slice(7200, 7210)), Array.from(pcm.slice(7200, 7210)));
  const st = decodeAudioPart({ mimeType: 'audio/wav', data: wavB64(synthPcm(0.5, 48000), 48000, 2) });
  assert.equal(st.sampleRate, 48000);
  assert.equal(st.pcm.length, synthPcm(0.5, 48000).length, 'channel 0 of a stereo WAV');
  const streamed = decodeAudioPart({ mimeType: 'audio/wav', data: wavB64(pcm, 24000, 1, { streamed: true }) });
  assert.equal(streamed.pcm.length, pcm.length, 'data size 0xFFFFFFFF → read to the end');
  const noRate = decodeAudioPart({ mimeType: 'audio/pcm', data: pcmToB64(pcm) });
  assert.equal(noRate.sampleRate, 24000);
});
await test('request shape: generateContent, AUDIO modality, prebuilt voice, key in header, fixed text only', async () => {
  const g = mockGemini();
  const prompt = buildPrompt('嗨，我是潘吉！', 'zh', 'warm hello');
  const out = await geminiTTS({ apiKey: 'AIzaTEST', model: 'gemini-3.1-flash-tts-preview', voice: 'Leda', prompt, fetch: g.fetch });
  const c = g.calls[0];
  assert.equal(c.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent');
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.headers['x-goog-api-key'], 'AIzaTEST');
  assert.ok(!c.url.includes('AIza'), 'the key is never in the URL');
  assert.deepEqual(c.body.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(c.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Leda');
  assert.ok(c.body.contents[0].parts[0].text.endsWith('#### TRANSCRIPT\n嗨，我是潘吉！'));
  assert.equal(out.sampleRate, 24000);
  assert.ok(out.pcm instanceof Int16Array && out.pcm.length > 24000);
});
await test('errors: 401 fatal · 404 notFound · 429 minute (retryMs) · 429 day · no audio', async () => {
  const run = async (step) => {
    const g = mockGemini({ script: [step] });
    try {
      await geminiTTS({ apiKey: 'k', model: 'm', prompt: 'p', fetch: g.fetch });
      return null;
    } catch (e) {
      return e;
    }
  };
  assert.equal((await run(401)).fatal, true);
  assert.equal((await run(404)).notFound, true);
  const m = await run('429min');
  assert.equal(m.quota, 'minute');
  assert.equal(m.retryMs, 10);
  assert.equal((await run('429day')).quota, 'day');
  assert.match((await run('noaudio')).message, /no audio/);
});
await test('buildPrompt: profile, accent per language, delivery note, transcript last', () => {
  const zh = buildPrompt('还在吗？', 'zh', 'soft and curious');
  assert.match(zh, /little girl genie/);
  assert.match(zh, /Malaysia/);
  assert.match(zh, /erhua/);
  assert.match(zh, /This line: soft and curious/);
  assert.ok(zh.trim().endsWith('#### TRANSCRIPT\n还在吗？'));
  assert.match(buildPrompt('Still there?', 'en'), /British/);
});

/* ───────── voice pack ───────── */

console.log('高级语音包（IndexedDB 缓存）');
const LINES_SMALL = LINES.lines.filter((l) => ['welcome.hello', 'lamp.done', 'idle.still'].includes(l.id));
await test('generate: every line × language rendered, cached as WAV + envelope; resumable', async () => {
  const store = memoryStore();
  const pack = createPack({ store, voice: 'Leda', sleep: () => Promise.resolve() });
  const g = mockGemini();
  const prog = [];
  const r = await pack.generate({ lines: LINES_SMALL, apiKey: 'k', fetch: g.fetch, paceMs: 0, onProgress: (p) => prog.push(p) });
  assert.equal(r.status, 'done');
  assert.equal(r.made, 6);
  assert.equal(g.calls.length, 6);
  assert.equal(store.map.size, 6);
  for (const rec of store.map.values()) {
    const w = parseWav(rec.wav);
    assert.equal(w.sampleRate, 24000);
    assert.ok(Math.abs(w.duration - rec.dur) < 1e-6);
    assert.ok(rec.dur > 1.0 && rec.dur < 1.3, `trimmed clip ${rec.dur}`);
    assert.ok(rec.env.length > 40);
    assert.match(rec.key, /^[a-z]+\.[a-z]+\|(zh|en)\|[0-9a-f]{8}\|Leda@girl-v1$/);
  }
  assert.equal(prog.at(-1).done, 6);
  // second run: nothing to do
  const g2 = mockGemini();
  const r2 = await pack.generate({ lines: LINES_SMALL, apiKey: 'k', fetch: g2.fetch, paceMs: 0 });
  assert.equal(g2.calls.length, 0);
  assert.equal(r2.skipped, 6);
  assert.deepEqual(pack.count(LINES_SMALL), { n: 6, total: 6 });
});
await test('cache key follows text, voice and style: change one → that clip is "missing" again', async () => {
  const pack = createPack({ store: memoryStore(), voice: 'Leda', sleep: () => Promise.resolve() });
  await pack.generate({ lines: LINES_SMALL.slice(0, 1), langs: ['zh'], apiKey: 'k', fetch: mockGemini().fetch, paceMs: 0 });
  const l = LINES_SMALL[0];
  assert.equal(pack.has(l.id, 'zh', spokenText(l, 'zh')), true);
  assert.equal(pack.has(l.id, 'zh', spokenText(l, 'zh') + '！'), false, 'copy changed');
  pack.setVoice('Achernar');
  assert.equal(pack.has(l.id, 'zh', spokenText(l, 'zh')), false, 'voice changed');
  const other = createPack({ store: memoryStore(), voice: 'Leda', styleVersion: 'girl-v2' });
  await other.ready();
  assert.notEqual(other.keyOf('a', 'zh', 'x'), pack.keyOf('a', 'zh', 'x'));
});
await test('a retired model id (404) falls through to the next model — and its dialect follows the model', async () => {
  const pack = createPack({ store: memoryStore(), sleep: () => Promise.resolve() });
  const g = mockGemini({ script: [404] });
  const r = await pack.generate({ lines: LINES_SMALL.slice(0, 1), langs: ['zh'], apiKey: 'k', fetch: g.fetch, paceMs: 0 });
  assert.equal(r.made, 1);
  assert.match(g.calls[0].url, /gemini-3\.8-flash-tts:/);
  assert.match(g.calls[1].url, /gemini-3\.8-flash-lite-tts/);
  assert.equal(r.model, 'gemini-3.8-flash-lite-tts');
  // only the preview models get notes inside the text
  const p = createPack({ store: memoryStore(), sleep: () => Promise.resolve() });
  const g2 = mockGemini({ script: [404, 404] });
  const r2 = await p.generate({ lines: LINES_SMALL.slice(0, 1), langs: ['zh'], apiKey: 'k', fetch: g2.fetch, paceMs: 0 });
  assert.equal(r2.model, 'gemini-3.1-flash-tts-preview');
  assert.equal(g2.calls[0].body.contents[0].parts[0].text, spokenText(LINES_SMALL[0], 'zh'));
  assert.ok(g2.calls[2].body.contents[0].parts[0].text.endsWith(`#### TRANSCRIPT\n${spokenText(LINES_SMALL[0], 'zh')}`));
  assert.equal(g2.calls[2].body.contents[0].parts[0].speechMetadata, undefined);
});
await test('a 3.8 endpoint that rejects speechMetadata → that line and the rest go as the plain line (never notes in the text)', async () => {
  const store = memoryStore();
  const g = mockGemini({ script: ['badmeta'], format: 'wav' });
  const r = await createPack({ store, sleep: () => Promise.resolve() }).generate({ lines: LINES_SMALL, langs: ['zh'], apiKey: 'k', fetch: g.fetch, paceMs: 0 });
  assert.equal(r.status, 'done');
  assert.equal(r.made, 3);
  assert.equal(g.calls.length, 4);
  for (const c of g.calls.slice(1)) {
    assert.equal(c.body.contents[0].parts[0].speechMetadata, undefined);
    assert.ok(!c.body.contents[0].parts[0].text.includes('TRANSCRIPT'));
  }
  for (const rec of store.map.values()) assert.equal(parseWav(rec.wav).sampleRate, 24000);
});
await test('429 per minute → waits and retries; 429 per day → stops (resumable later); bad key → stops', async () => {
  const waits = [];
  const pack = createPack({ store: memoryStore(), sleep: (ms) => (waits.push(ms), Promise.resolve()) });
  const g = mockGemini({ script: ['429min', 500] });
  const r = await pack.generate({ lines: LINES_SMALL.slice(0, 1), langs: ['zh'], apiKey: 'k', fetch: g.fetch, paceMs: 0 });
  assert.equal(r.made, 1);
  assert.equal(g.calls.length, 3);
  assert.ok(waits.length >= 2);
  const q = await createPack({ store: memoryStore(), sleep: () => Promise.resolve() }).generate({ lines: LINES_SMALL, apiKey: 'k', fetch: mockGemini({ script: [null, '429day'] }).fetch, paceMs: 0 });
  assert.equal(q.status, 'quota');
  assert.equal(q.made, 1);
  const bad = await createPack({ store: memoryStore(), sleep: () => Promise.resolve() }).generate({ lines: LINES_SMALL, apiKey: 'k', fetch: mockGemini({ script: [401] }).fetch, paceMs: 0 });
  assert.equal(bad.status, 'fatal');
});
await test('a store that cannot write (private mode) stops at once — no retries burning the quota', async () => {
  const broken = { ...memoryStore(), put: async () => { throw new Error('QuotaExceededError'); } };
  const g = mockGemini();
  const r = await createPack({ store: broken, sleep: () => Promise.resolve() }).generate({ lines: LINES_SMALL, apiKey: 'k', fetch: g.fetch, paceMs: 0 });
  assert.equal(r.status, 'storage');
  assert.equal(g.calls.length, 1);
});
await test('abort (staff closes settings) stops between requests', async () => {
  const ac = new AbortController();
  const pack = createPack({ store: memoryStore(), sleep: () => Promise.resolve() });
  let k = 0;
  const r = await pack.generate({ lines: LINES_SMALL, apiKey: 'k', fetch: mockGemini().fetch, paceMs: 0, signal: ac.signal, onProgress: () => ++k === 2 && ac.abort() });
  assert.equal(r.status, 'aborted');
  assert.equal(r.made, 2);
});
await test('privacy: every request body holds only the fixed line + direction (no guest data, no key)', async () => {
  const g = mockGemini();
  await createPack({ store: memoryStore(), sleep: () => Promise.resolve() }).generate({ lines: LINES.lines, apiKey: 'AIzaSECRET', fetch: g.fetch, paceMs: 0 });
  assert.equal(g.calls.length, LINES.lines.length * 2);
  for (const c of g.calls) {
    const s = JSON.stringify(c.body);
    assert.ok(!s.includes('AIzaSECRET'));
    const part = c.body.contents[0].parts[0];
    const transcript = ttsDialect(c.url.split('/models/')[1].split(':')[0]) === 'metadata' ? part.text : part.text.split('#### TRANSCRIPT\n')[1];
    assert.ok(LINES.lines.some((l) => spokenText(l, 'zh') === transcript || spokenText(l, 'en') === transcript), transcript);
    if (part.speechMetadata) assert.ok(part.speechMetadata.style.startsWith(`Voice: ${STYLE.profile}`), 'the style is the fixed direction');
  }
});

/* ───────── device voices ───────── */

console.log('设备语音（tier a）');
await test('iPad: picks Tingting (Enhanced) for 中文 and Serena (Premium) for EN; never Li-mu, Sinji (粤), Flo, Bubbles, Junior', () => {
  const zh = rankVoices(IOS_VOICES, 'zh', 'ios').filter((r) => r.score > -100);
  assert.equal(zh[0].voice.name, 'Tingting (Enhanced)');
  const names = zh.map((r) => r.voice.name);
  assert.ok(!names.includes('Sinji') && !names.includes('Flo') && !names.includes('Li-mu'), names.join());
  assert.ok(names.includes('Meijia'), 'Taiwan Mandarin stays as an option');
  const en = rankVoices(IOS_VOICES, 'en', 'ios').filter((r) => r.score > -100);
  assert.equal(en[0].voice.name, 'Serena (Premium)');
  assert.ok(!en.some((r) => /Bubbles|Junior|Daniel/.test(r.voice.name)), en.map((r) => r.voice.name).join());
});
await test('Edge / Chrome / Android voice lists rank sensibly', () => {
  const edge = [V('Microsoft Yunxi Online (Natural) - Chinese (Mainland)', 'zh-CN', { localService: false }), V('Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', 'zh-CN', { localService: false }), V('Microsoft Xiaobei Online (Natural) - Chinese (Northeastern Mandarin)', 'zh-CN-liaoning', { localService: false }), V('Microsoft Ana Online (Natural) - English (United States)', 'en-US', { localService: false }), V('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB', { localService: false })];
  assert.match(rankVoices(edge, 'zh', 'edge')[0].voice.name, /Xiaoxiao/);
  assert.ok(!rankVoices(edge, 'zh', 'edge').some((r) => /Xiaobei/.test(r.voice.name)), 'no dialect voices');
  assert.match(rankVoices(edge, 'en', 'edge')[0].voice.name, /Sonia|Ana/);
  const chrome = [V('Google 普通话（中国大陆）', 'zh-CN', { localService: false }), V('Google 粤語（香港）', 'zh-HK', { localService: false }), V('Google UK English Female', 'en-GB', { localService: false }), V('Google UK English Male', 'en-GB', { localService: false })];
  assert.equal(rankVoices(chrome, 'zh', 'mac')[0].voice.name, 'Google 普通话（中国大陆）');
  assert.equal(rankVoices(chrome, 'en', 'mac')[0].voice.name, 'Google UK English Female');
  const android = [V('Chinese China', 'zh_CN'), V('English United Kingdom', 'en_GB')];
  assert.equal(rankVoices(android, 'zh', 'android')[0].voice.name, 'Chinese China');
});
await test('presets: a bright little girl (owner: 「太不可爱了」) — pitch up, never sleepy, child voices only a small lift', () => {
  for (const [v, lang, plat] of [
    [IOS_VOICES[0], 'zh', 'ios'],
    [IOS_VOICES[1], 'zh', 'ios'],
    [IOS_VOICES[8], 'en', 'ios'],
    [V('Google 普通话（中国大陆）', 'zh-CN', { localService: false }), 'zh', 'mac'],
    [V('Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', 'zh-CN', { localService: false }), 'zh', 'edge'],
    [V('Chinese China', 'zh_CN'), 'zh', 'android'],
  ]) {
    const p = presetFor(v, lang, plat);
    assert.ok(p.pitch >= 1.35 && p.pitch <= 1.5, `${v.name} pitch ${p.pitch}`);
    assert.ok(p.rate >= 0.98 && p.rate <= 1.05, `${v.name} rate ${p.rate}`);
  }
  const child = presetFor(V('Microsoft Ana Online (Natural) - English (United States)', 'en-US'), 'en', 'edge');
  assert.ok(child.pitch > 1 && child.pitch <= 1.15 && child.rate >= 1 && child.rate <= 1.05, JSON.stringify(child));
  assert.equal(detectPlatform(IPAD_UA, 5), 'ios');
  assert.equal(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5), 'ios', 'iPadOS desktop UA');
});
await test('say(): speaks the fixed line with the picked voice, pitch and rate; resolves done', async () => {
  const { voice, synth, events } = voiceWith();
  await voice.voices.load();
  const r = await voice.say('lamp.done');
  assert.equal(r.reason, 'done');
  assert.equal(r.spoken, true);
  const u = synth.spoken.at(-1);
  assert.equal(u.text, '我来啦！');
  assert.equal(u.voice.name, 'Tingting (Enhanced)');
  assert.equal(u.lang, 'zh-CN');
  assert.ok(u.pitch > 1.3 && u.rate >= 0.98 && u.rate <= 1.05, `${u.pitch} / ${u.rate}`);
  assert.deepEqual(events.map((e) => e.type).filter((t) => t !== 'boundary'), ['line', 'start', 'end']);
  assert.equal(events[0].speaker, 'pangie');
});
await test('a new line cancels the old one (never two at once) — reason "replaced"', async () => {
  const synth = new FakeSynth(IOS_VOICES, { msPerChar: 40 });
  const { voice, events } = voiceWith({ synth });
  await voice.voices.load();
  const a = voice.say('welcome.hello');
  await sleep(40);
  const b = voice.say('lamp.done');
  assert.equal((await a).reason, 'replaced');
  assert.equal((await b).reason, 'done');
  assert.ok(synth.cancels >= 1);
  const starts = events.filter((e) => e.type === 'start').map((e) => e.id);
  assert.deepEqual(starts, ['welcome.hello', 'lamp.done']);
  const ends = events.filter((e) => e.type === 'end');
  assert.equal(ends[0].reason, 'replaced');
});
await test('queue mode plays in order; skip() ends the current and moves on; cancel() clears all', async () => {
  const synth = new FakeSynth(IOS_VOICES, { msPerChar: 20 });
  const { voice } = voiceWith({ synth });
  await voice.voices.load();
  const a = voice.say('bp.hello');
  const b = voice.say('bp.end', { mode: 'queue' });
  await sleep(30);
  voice.skip();
  assert.equal((await a).reason, 'skip');
  assert.equal((await b).reason, 'done');
  assert.deepEqual(synth.spoken.filter((u) => u.volume > 0).map((u) => u.text), [spokenText(LINES.lines.find((l) => l.id === 'bp.hello'), 'zh'), spokenText(LINES.lines.find((l) => l.id === 'bp.end'), 'zh')]);
  const c = voice.say('ch.life');
  const d = voice.say('ch.nogo', { mode: 'queue' });
  await sleep(10);
  voice.cancel();
  assert.equal((await c).reason, 'cancel');
  assert.equal((await d).reason, 'cancel');
});
await test('delay is cancellable: leaving the screen before the line starts = nothing said (stopIf)', async () => {
  const { voice, synth } = voiceWith();
  await voice.voices.load();
  const p = voice.say('ch.intuition', { delay: 60 });
  await sleep(10);
  voice.stopIf(['ch.intuition', 'ch.life']);
  assert.equal((await p).reason, 'left');
  await sleep(80);
  assert.equal(synth.spoken.filter((u) => u.volume > 0).length, 0);
});
await test('ifIdle never interrupts; muted / off / level key say nothing (and do not cut a line)', async () => {
  const storage = memStorage();
  const { voice, synth } = voiceWith({ storage });
  await voice.voices.load();
  const a = voice.say('welcome.hello');
  assert.equal((await voice.say('lamp.hint', { mode: 'ifIdle' })).reason, 'busy');
  await a;
  voice.setMuted(true);
  assert.equal((await voice.say('lamp.done')).reason, 'muted');
  voice.setMuted(false);
  voice.setEnabled(false);
  assert.equal(storage.m.get('genie.voice'), '0', 'on / off is remembered');
  assert.equal((await voice.say('lamp.done')).reason, 'off');
  voice.setEnabled(true);
  voice.setLevel('key');
  assert.equal((await voice.say('tr.appliances')).reason, 'level');
  assert.equal((await voice.say('lamp.done')).reason, 'done');
  assert.equal((await voice.say('nope.nothing')).reason, 'unknown');
  const fresh = voiceWith({ storage }).voice;
  assert.equal(fresh.enabled, true);
  fresh.setEnabled(false);
  assert.equal(voiceWith({ storage }).voice.enabled, false, 'a new page reads the remembered choice');
  assert.ok(synth.spoken.length >= 2);
});
await test('muting while she talks stops her at once', async () => {
  const synth = new FakeSynth(IOS_VOICES, { msPerChar: 50 });
  const { voice } = voiceWith({ synth });
  await voice.voices.load();
  const a = voice.say('welcome.hello');
  await sleep(30);
  voice.setMuted(true);
  assert.equal((await a).reason, 'muted');
});
await test('iOS quirks: not-allowed (no tap yet) → "locked"; stuck engine (no start) → watchdog ends the line', async () => {
  const locked = voiceWith({ synth: new FakeSynth(IOS_VOICES, { notAllowed: true }) });
  await locked.voice.voices.load();
  assert.equal((await locked.voice.say('lamp.done')).reason, 'locked');
  const stuck = voiceWith({ synth: new FakeSynth(IOS_VOICES, { start: false }), startTimeout: 60 });
  await stuck.voice.voices.load();
  stuck.voice.unlock();
  const t0 = Date.now();
  assert.equal((await stuck.voice.say('lamp.done')).reason, 'stuck');
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(stuck.synth.cancels >= 1, 'the stuck queue is flushed');
});
await test('voices load late (voiceschanged) — say() still finds Tingting', async () => {
  const synth = new FakeSynth([]);
  const { voice } = voiceWith({ synth });
  const loading = voice.voices.load(2000);
  setTimeout(() => {
    synth.voices = IOS_VOICES;
    for (const f of synth.listeners.voiceschanged || []) f();
  }, 30);
  await loading;
  assert.equal(voice.voices.picked('zh').name, 'Tingting (Enhanced)');
});
await test('unlock() speaks one silent utterance (iOS gesture rule) and only once', () => {
  const { voice, synth } = voiceWith();
  voice.unlock();
  voice.unlock();
  const silent = synth.spoken.filter((u) => u.volume === 0);
  assert.equal(silent.length, 1);
  assert.equal(voice.state().unlocked, true);
});
await test('no voice for the language: app stays silent ("novoice"); demo mode animates the mouth on a timer', async () => {
  const none = voiceWith({ synth: new FakeSynth([]) });
  await none.voice.voices.load(50);
  assert.equal((await none.voice.say('lamp.done')).reason, 'novoice');
  const levels = [];
  const demo = voiceWith({ synth: new FakeSynth([]), silentMouth: true, onMouth: (v) => levels.push(v) });
  await demo.voice.voices.load(50);
  const r = await demo.voice.say('welcome.hello');
  assert.equal(r.reason, 'done');
  assert.equal(r.tier, 'none');
  assert.ok(Math.max(...levels) > 0.3, 'the mouth moved');
});
await test('onTalking is debounced across back-to-back lines (music ducks once, not per line)', async () => {
  const flips = [];
  const { voice } = voiceWith({ onTalking: (on) => flips.push(on) });
  await voice.voices.load();
  await voice.say('lamp.done');
  await voice.say('lamp.done', { mode: 'queue' });
  await sleep(60);
  assert.deepEqual(flips, [true, false]);
});
await test('talking (duck + talk mouth) starts when the line starts, not during its delay; same line twice = "dup"', async () => {
  const flips = [];
  const { voice, synth } = voiceWith({ onTalking: (on) => flips.push([on, Date.now()]) });
  await voice.voices.load();
  const t0 = Date.now();
  const p = voice.say('ch.life', { delay: 80 });
  await sleep(40);
  assert.equal(flips.length, 0, 'quiet during the delay');
  assert.equal((await voice.say('ch.life', { delay: 80 })).reason, 'dup', 'a re-render does not restart it');
  assert.equal((await p).reason, 'done');
  assert.ok(flips[0][0] === true && flips[0][1] - t0 >= 75);
  assert.equal(synth.spoken.filter((u) => u.volume > 0).length, 1);
});
await test('once-per-guest lines (welcome) never repeat until newGuest(); others repeat freely', async () => {
  const { voice } = voiceWith();
  await voice.voices.load();
  assert.equal((await voice.say('welcome.hello')).reason, 'done');
  assert.equal((await voice.say('welcome.hello')).reason, 'once', 'the shell greeted; the cover touch does not greet twice');
  assert.equal((await voice.say('lamp.done')).reason, 'done');
  assert.equal((await voice.say('lamp.done')).reason, 'done');
  voice.newGuest();
  assert.equal((await voice.say('welcome.hello')).reason, 'done', 'next guest is greeted');
});
await test('preferences: chosen voice, pitch, rate remembered per language; reset restores the preset', async () => {
  const storage = memStorage();
  const { voice, synth } = voiceWith({ storage });
  await voice.voices.load();
  voice.prefs.set('zh', { voiceURI: 'com.apple.voice.compact.zh-TW.Meijia', pitch: 1.3, rate: 0.9 });
  await voice.say('lamp.done');
  const u = synth.spoken.at(-1);
  assert.equal(u.voice.name, 'Meijia');
  assert.equal(u.pitch, 1.3);
  assert.equal(u.rate, 0.9);
  assert.match(storage.m.get('genie.voice.prefs.v2'), /Meijia/);
  voice.prefs.reset('zh');
  assert.equal(voice.voices.settings('zh').voice.name, 'Tingting (Enhanced)');
});

/* ───────── tier b playback ───────── */

console.log('语音包播放（tier b）');
await test('a cached clip plays through Web Audio (tier pack) with its envelope; missing → device voice', async () => {
  const store = memoryStore();
  const pack = createPack({ store, voice: 'Leda', sleep: () => Promise.resolve() });
  await pack.generate({ lines: LINES.lines.filter((l) => l.id === 'lamp.done'), langs: ['zh'], apiKey: 'k', fetch: mockGemini({ sec: 0.6 }).fetch, paceMs: 0 });
  let ctx = null;
  const AC = class extends FakeAudioContext {
    constructor() {
      super();
      ctx = this;
    }
  };
  const { voice, synth, events } = voiceWith({ pack, AudioContext: AC });
  await voice.voices.load();
  voice.unlock();
  const r = await voice.say('lamp.done');
  assert.equal(r.reason, 'done');
  assert.equal(r.tier, 'pack');
  assert.equal(ctx.started.length, 2, 'unlock blip + the clip');
  const start = events.find((e) => e.type === 'start');
  assert.equal(start.tier, 'pack');
  assert.ok(start.env.length > 20 && start.dur > 0.6);
  const before = synth.spoken.filter((u) => u.volume > 0).length;
  const r2 = await voice.say('welcome.hello'); // not in the pack → falls back to Tingting
  assert.equal(r2.tier, 'tts');
  assert.equal(synth.spoken.filter((u) => u.volume > 0).length, before + 1);
});
await test('audio context will not resume (iOS after a call) → that line falls back to the device voice', async () => {
  const pack = createPack({ store: memoryStore(), sleep: () => Promise.resolve() });
  await pack.generate({ lines: LINES.lines.filter((l) => l.id === 'lamp.done'), langs: ['zh'], apiKey: 'k', fetch: mockGemini({ sec: 0.4 }).fetch, paceMs: 0 });
  const AC = class extends FakeAudioContext {
    constructor() {
      super();
      this.state = 'interrupted';
      this.canResume = false;
    }
  };
  const { voice } = voiceWith({ pack, AudioContext: AC });
  await voice.voices.load();
  voice.unlock();
  const r = await voice.say('lamp.done');
  assert.equal(r.tier, 'tts');
  assert.equal(r.reason, 'done');
});

/* ───────── mouth ───────── */

console.log('口型');
await test('speechTimeline: one syllable per Han character, pauses at punctuation, rate scales it', () => {
  const t = speechTimeline('嗨，我是潘吉！', 'zh', 1);
  assert.equal(t.segs.length, 5);
  assert.ok(t.segs[1].t0 - t.segs[0].t1 > 0.15, 'comma pause');
  const slow = speechTimeline('嗨，我是潘吉！', 'zh', 0.5);
  assert.ok(slow.dur > t.dur * 1.9);
  const en = speechTimeline('Hi, I’m Pangie!', 'en', 1);
  assert.ok(en.segs.length >= 4 && en.dur > 0.8 && en.dur < 2.5, JSON.stringify(en));
});
await test('mouth driver: tts estimate moves 0–1, boundary re-syncs, end closes to exactly 0', async () => {
  const levels = [];
  const m = createMouth({ onMouth: (v) => levels.push(v), schedule: (fn) => setTimeout(fn, 5), cancelSchedule: clearTimeout, fps: 200 });
  m.handle({ type: 'start', tier: 'tts', text: '嗨，我是潘吉！不用懂设计。', lang: 'zh', rate: 1 });
  await sleep(250);
  m.handle({ type: 'boundary', ci: 6 });
  await sleep(150);
  m.handle({ type: 'end' });
  await sleep(120);
  assert.ok(levels.every((v) => v >= 0 && v <= 1));
  assert.ok(Math.max(...levels) > 0.4, 'opens');
  assert.ok(levels.filter((v, i) => i && Math.abs(v - levels[i - 1]) > 0.05).length > 4, 'moves');
  assert.equal(levels.at(-1), 0);
});
await test('mouth driver: pack envelope is followed (closed in silence, open on loud frames)', async () => {
  const levels = [];
  const env = [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0];
  const m = createMouth({ onMouth: (v) => levels.push(v), schedule: (fn) => setTimeout(fn, 4), cancelSchedule: clearTimeout, fps: 250 });
  m.handle({ type: 'start', tier: 'pack', env, hz: 50, lead: 0 });
  await sleep(300);
  assert.ok(Math.max(...levels) > 0.8);
  assert.equal(levels.at(-1), 0);
});
await test('reduced motion: only closed / half-open, no flapping faster than 240 ms', async () => {
  const seen = [];
  const m = createMouth({ onMouth: (v) => seen.push([Date.now(), v]), schedule: (fn) => setTimeout(fn, 5), cancelSchedule: clearTimeout, fps: 200, reduced: true });
  m.handle({ type: 'start', tier: 'tts', text: '嗨，我是潘吉！不用懂设计，跟着第一感觉走就好。', lang: 'zh', rate: 1 });
  await sleep(900);
  m.stop();
  const vals = new Set(seen.map(([, v]) => v));
  assert.ok([...vals].every((v) => v === 0 || v === 0.5), [...vals].join());
  const flips = seen.filter((x, i) => i && x[1] !== seen[i - 1][1]).map(([t]) => t);
  for (let i = 1; i < flips.length - 1; i++) assert.ok(flips[i] - flips[i - 1] >= 230, 'slow');
});

/* ───────── Wish Mode bridge ───────── */

console.log('许愿模式：外壳讲话，iframe 动嘴');
function channel() {
  const toShell = new Set();
  const toChild = new Set();
  return {
    child: { post: (m) => setTimeout(() => toShell.forEach((f) => f(structuredClone(m))), 0), listen: (f) => (toChild.add(f), () => toChild.delete(f)) },
    shell: { post: (m) => setTimeout(() => toChild.forEach((f) => f(structuredClone(m))), 0), listen: (f) => (toShell.add(f), () => toShell.delete(f)) },
  };
}
await test('child say() → shell speaks → child gets start / end, its mouth moves, the promise resolves', async () => {
  const ch = channel();
  // realistic pace (~60 ms per character) so the boundary re-syncs behave like a real synthesiser
  const { voice } = voiceWith({ synth: new FakeSynth(IOS_VOICES, { msPerChar: 60 }) });
  await voice.voices.load();
  const off = serveVoice(voice, ch.shell);
  const levels = [];
  const talk = [];
  const remote = createRemoteVoice({ ...ch.child, lang: 'en', onMouth: (v) => levels.push(v), onTalking: (on) => talk.push(on), schedule: (fn) => setTimeout(fn, 5), cancelSchedule: clearTimeout });
  for (let i = 0; i < 100 && !remote.answered; i++) await sleep(5); // a busy CI box can take a while
  assert.equal(remote.answered, true);
  const r = await remote.say('lamp.done');
  assert.equal(r.reason, 'done');
  assert.equal(r.spoken, true);
  assert.equal(r.lang, 'en');
  for (let i = 0; i < 60 && levels.at(-1) !== 0; i++) await sleep(10);
  assert.ok(Math.max(...levels) > 0.3, `child mouth moved ${levels.length} ${levels.slice(0, 20)}`);
  assert.equal(levels.at(-1), 0, 'and closed');
  assert.deepEqual(talk, [true, false]);
  off();
  remote.destroy();
});
await test('child asks while the shell is muted → resolves "muted" (never hangs)', async () => {
  const ch = channel();
  const { voice } = voiceWith();
  serveVoice(voice, ch.shell);
  voice.setMuted(true);
  const remote = createRemoteVoice({ ...ch.child, lang: 'zh' });
  const r = await remote.say('lamp.done');
  assert.equal(r.reason, 'muted');
});
await test('no shell answers (older shell) → fallback() so the quiz can use its own voice', async () => {
  let fell = false;
  createRemoteVoice({ post: () => {}, listen: () => () => {}, timeout: 30, fallback: () => (fell = true) });
  await sleep(60);
  assert.equal(fell, true);
});

await test('the shell forwards which speaker is talking (lamp lines glow the lamp, not her mouth)', async () => {
  const ch = channel();
  const { voice } = voiceWith();
  await voice.voices.load();
  const off = serveVoice(voice, ch.shell);
  const seen = [];
  const remote = createRemoteVoice({ ...ch.child, lang: 'zh', onLine: (e) => seen.push([e.id, e.speaker]), schedule: (fn) => setTimeout(fn, 5), cancelSchedule: clearTimeout });
  await remote.say('lamp.rub');
  await remote.say('lamp.done');
  await sleep(20);
  assert.deepEqual(seen, [
    ['lamp.rub', 'lamp'],
    ['lamp.done', 'pangie'],
  ]);
  off();
  remote.destroy();
});

/* ───────── the app layer ───────── */

console.log('App：台词表、字幕、音乐压低');
await test('lineText = the caption in each language (exactly what she says); lineOf gives her pose', () => {
  assert.equal(lineText('lamp.done', 'zh'), '我来啦！');
  assert.equal(lineText('lamp.done', 'en'), 'Here I am!');
  assert.equal(lineText('nope'), '');
  assert.equal(lineOf('reveal.reading').mood, 'mystic');
  assert.equal(lineOf('lamp.rub').speaker, 'lamp');
  assert.equal(VOICE_LINES.length, LINES.lines.length);
  for (const l of VOICE_LINES) assert.equal(spokenText(l, 'zh'), spokenText(lineOf(l.id), 'zh'));
});
await test('CONFIG.voice defaults: on, full, a gentle duck, Leda', () => {
  assert.equal(VOICE_CFG.on, CONFIG.voice?.on ?? true);
  assert.equal(VOICE_CFG.level, CONFIG.voice?.level ?? 'full');
  assert.ok(VOICE_CFG.duck > 0.2 && VOICE_CFG.duck < 0.7);
  assert.ok(GEMINI_TTS.voices.some((v) => v.name === VOICE_CFG.packVoice) || GEMINI_TTS.more.includes(VOICE_CFG.packVoice));
});
await test('the pack voices and the first-person copy have English (i18n)', () => {
  for (const v of GEMINI_TTS.voices) assert.equal(EN[v.zh], v.en);
  for (const k of ['我只能实现三个愿望哦。', '最后，帮我扫个雷吧。', '你的梦想，我记住啦。']) assert.ok(EN[k], k);
});
await test('in Node (no browser) the app voice stays quiet and never throws', async () => {
  const r = await appVoice.say('lamp.done');
  assert.equal(r.spoken, false);
  appVoice.cancel();
  appVoice.skip();
  appVoice.stopIf('lamp.done');
  assert.equal(appVoice.talking, false);
});
await test('music ducking: talk(on) when the engine has it, else duck(\'voice\') / unduck(\'voice\'), else page level × duck', () => {
  const log = [];
  const talkZen = { talk: (on) => log.push(['talk', on]), duck: (...a) => log.push(['duck', ...a]), unduck: (...a) => log.push(['unduck', ...a]) };
  const d1 = duckerFor(talkZen);
  d1(true);
  d1(true); // back-to-back lines: one duck
  d1(false);
  assert.deepEqual(log, [
    ['talk', true],
    ['talk', false],
  ]);
  log.length = 0;
  const d2 = duckerFor(talkZen, { via: 'duck', level: 0.35 });
  d2(true);
  d2(false);
  assert.deepEqual(log, [
    ['duck', 'voice', 0.35],
    ['unduck', 'voice'],
  ]);
  log.length = 0;
  const layered = { duck: (...a) => log.push(['duck', ...a]), unduck: (...a) => log.push(['unduck', ...a]) };
  const d3 = duckerFor(layered);
  d3(true);
  d3(false);
  assert.deepEqual(log, [['duck', 'voice'], ['unduck', 'voice']], 'no level → the music module uses its own voice duck');
  log.length = 0;
  const old = { duck: (f, s) => log.push(['duck', Math.round(f * 1000) / 1000, s]) };
  const d4 = duckerFor(old, { pageLevel: () => 'blueprint' });
  d4(true);
  d4(false);
  const bp = CONFIG.wishDuck?.blueprint ?? 1;
  assert.deepEqual(log, [
    ['duck', Math.round(bp * VOICE_CFG.duck * 1000) / 1000, 0.25],
    ['duck', bp, 0.9],
  ]);
  // an older engine without a page level, or a zen that throws: nothing breaks
  duckerFor({ duck: () => log.push('x') })(true);
  assert.ok(!log.includes('x'));
  duckerFor({ talk: () => { throw new Error('boom'); } })(true);
});
await test('pack version moves when clips change (players drop decoded copies after a regenerate)', async () => {
  const pack = createPack({ store: memoryStore(), sleep: () => Promise.resolve() });
  await pack.ready();
  const v0 = pack.version;
  const one = LINES.lines.filter((l) => l.id === 'lamp.done');
  await pack.generate({ lines: one, langs: ['zh'], apiKey: 'k', fetch: mockGemini({ sec: 0.3 }).fetch, paceMs: 0 });
  assert.ok(pack.version > v0);
  assert.deepEqual(pack.count(one, ['zh']), { n: 1, total: 1 });
  const v1 = pack.version;
  await pack.drop(one, ['zh']);
  assert.ok(pack.version > v1);
  assert.deepEqual(pack.count(one, ['zh']), { n: 0, total: 1 });
});

console.log(`\n${n - failed} / ${n} passed`);
if (failed) process.exit(1);
