// 设置：画质（自动 / 高清 / 流畅，存在本机，许愿模式也会用这台设备的选择）+ 语言 + AI 识别平面图用的 Google Gemini key（只存本机浏览器）
// + 潘吉的声音（员工：她说不说、说多少、这台设备用哪个声音、试听；高级语音包 = 用同一把 Gemini key 把每一句固定台词生成一次，存在本机）。
// 一种保存方式：改了就存（像 iOS 的「设置」），底部只有一个「完成」。
// 这个面板只给员工（StudioApp 里 staffView 才打开）；语音包只发送固定台词（i18n/voice-lines.js），不含任何客人资料。

import { useEffect, useState } from 'react';
import { BRAND } from '../../shared/config.js';
import { Icon, Modal, Seg, ConfirmSheet } from './kit.jsx';
import { loadSettings, saveSettings } from '../store.js';
import LangToggle from '../../shared/LangToggle.jsx';
import { t, isEn, getLang } from '../../shared/i18n.js';
import { voice, voicePack, voicePrefs, GEMINI_TTS } from '../../shared/voice.js';

const QUALITY_NOTE = {
  auto: '电脑、大屏用高清；iPad、手机用流畅（省电、不发烫）。',
  high: '柔和阴影、环境光遮蔽、景深都打开。适合电脑和展厅大屏。',
  fast: '画面稍简单，但更顺、更省电。iPad 用久了发烫时选它。',
};

export default function SettingsModal({ onClose, onQuality, onLang, showLang = true }) {
  const [s, setS] = useState(loadSettings);
  const q = s.quality || 'auto';
  // 每一项改了马上存（key 也是）：没有「取消 / 保存」两套规矩
  const patch = (p) => {
    const next = { ...s, ...p };
    setS(next);
    saveSettings({ ...loadSettings(), ...next });
  };
  const pickQuality = (v) => {
    patch({ quality: v === 'auto' ? '' : v });
    onQuality?.(v);
  };
  return (
    <Modal eyebrow={isEn() ? BRAND.studioEn : BRAND.studio} title={t('设置')} onClose={onClose}>
      <section className="set-sec">
        <h4 className="m-h">{t('画质')}</h4>
        <Seg
          value={q}
          onChange={pickQuality}
          label={t('画质')}
          options={[
            { id: 'auto', label: t('自动') },
            { id: 'high', label: t('高清') },
            { id: 'fast', label: t('流畅') },
          ]}
        />
        <p className="m-fine">{t(QUALITY_NOTE[q])}</p>
      </section>

      {showLang && (
        <section className="set-sec set-row">
          <div>
            <h4 className="m-h">{t('语言')}</h4>
            <p className="m-fine">{t('切换后会重新载入这一页，方案已经自动保存。')}</p>
          </div>
          <LangToggle onPick={onLang} />
        </section>
      )}

      <section className="set-sec">
        <h4 className="m-h">{t('AI 识别平面图（选填）')}</h4>
        <p className="m-p">
          {t('用 Google Gemini 认出平面图里的房间与门窗。和 UKIR STUDIO 同一种 key（aistudio.google.com 申请）。')} <b>{t('key 只存在这台设备的浏览器里')}</b>
          {t('，不经过任何服务器。没有 key 也能手动画。')}
        </p>
        <label className="m-field">
          <span>API key</span>
          <input type="password" value={s.apiKey} onChange={(e) => patch({ apiKey: e.target.value.trim() })} placeholder="AIza…" autoComplete="off" spellCheck={false} />
        </label>
        <details className="m-adv">
          <summary>
            <span>{t('高级')}</span>
            <em>{t('识别模型、接口地址')}</em>
            <Icon name="down" size={16} className="m-adv-chev" />
          </summary>
          <label className="m-field">
            <span>{t('识别模型')}</span>
            <input value={s.visionModel} onChange={(e) => patch({ visionModel: e.target.value.trim() })} spellCheck={false} />
          </label>
          <label className="m-field">
            <span>{t('接口地址')}</span>
            <input value={s.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value.trim() })} spellCheck={false} />
          </label>
        </details>
      </section>

      <VoiceSettings apiKey={s.apiKey} baseUrl={s.baseUrl} />

      <div className="m-actions set-foot">
        <p className="m-fine">
          <Icon name="check" size={14} />
          {t('改动会自动保存在这台设备上。')}
        </p>
        <button type="button" className="s-btn primary" onClick={onClose}>
          {t('完成')}
        </button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── 潘吉的声音（员工） ───────────────────────── */

// studio.css 是走进去团队的文件：这一节只用现有的设置样式（set-sec / set-row / m-field / m-adv / s-btn / seg），
// 开关、下拉、进度条的几行样式写在这里，颜色全部来自 base.css / studio.css 的变量。
const ST = {
  block: { marginTop: 14 },
  row: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px 12px', marginTop: 12 },
  select: {
    width: '100%',
    minHeight: 44,
    padding: '10px 14px',
    border: 0,
    borderRadius: 12,
    background: 'var(--card)',
    boxShadow: 'inset 0 0 0 0.5px var(--hair)',
    color: 'var(--pt)',
    font: '500 14.5px/1.2 var(--sans)',
  },
  bar: { height: 6, marginTop: 12, borderRadius: 3, background: 'rgba(var(--shade-rgb), 0.1)', overflow: 'hidden' },
  fill: (p) => ({ display: 'block', height: '100%', width: `${p}%`, borderRadius: 3, background: 'var(--gold)', transition: 'width 0.4s var(--ease)' }),
  fine: { margin: 0 },
};

/** iOS 开关：51×31 的轨道，点按范围 44px 高 */
function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 59, height: 44, margin: '-6px -4px', padding: 0, border: 0, borderRadius: 12, background: 'transparent', cursor: 'pointer' }}
    >
      <span
        aria-hidden="true"
        style={{ position: 'relative', display: 'block', width: 51, height: 31, borderRadius: 999, background: on ? 'var(--accent)' : 'rgba(var(--shade-rgb), 0.16)', transition: 'background-color 0.25s var(--ease)' }}
      >
        <i
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 27,
            height: 27,
            borderRadius: '50%',
            background: 'var(--card)',
            boxShadow: '0 2px 6px rgba(var(--shade-rgb), 0.22)',
            transform: on ? 'translateX(20px)' : 'none',
            transition: 'transform 0.3s var(--spring)',
          }}
        />
      </span>
    </button>
  );
}

const PACK_VOICES = GEMINI_TTS.voices; // [{ name, zh, en }] —— 三个年轻的女声
const LANG_LABEL = { zh: '中文声音', en: '英文声音' };
const SAY_NOTE = {
  muted: '现在是静音，先打开声音。',
  novoice: '这台设备没有这种语言的语音。',
  locked: '再按一次试听。',
  off: '先打开上面的「潘吉说话」。',
};

/** 设备自带的女声（最合适的在前；男声、怪声、方言声不列） */
const deviceList = (lang) => voice.voices(lang).filter((r) => r.score > -100);

function VoiceSettings({ apiKey = '', baseUrl = '' }) {
  const [on, setOn] = useState(() => voice.enabled);
  const [level, setLevel] = useState(voicePrefs.level);
  const [dev, setDev] = useState(() => ({ zh: voicePrefs.deviceVoice('zh'), en: voicePrefs.deviceVoice('en') }));
  const [list, setList] = useState({ zh: [], en: [] });
  const [gv, setGv] = useState(voicePrefs.packVoice);
  const [model, setModel] = useState(voicePrefs.model);
  const [count, setCount] = useState(null); // { n, total }
  const [job, setJob] = useState(voicePack.job); // 生成中途关掉设置也会继续；再打开接着显示进度
  const [ask, setAsk] = useState(''); // '' | 'clear' | 'regen'
  const [said, setSaid] = useState(''); // 试听没出声的原因
  const running = job?.status === 'running';
  const canPack = voicePack.available();

  const recount = () =>
    voicePack
      .count()
      .then(setCount)
      .catch(() => setCount(null));

  useEffect(() => {
    voice.init();
    const refresh = () => setList({ zh: deviceList('zh'), en: deviceList('en') });
    voice.loadVoices().then(refresh);
    refresh();
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    synth?.addEventListener?.('voiceschanged', refresh);
    const offState = voice.on('state', () => setOn(voice.enabled));
    const offJob = voicePack.subscribe((j) => {
      setJob(j);
      if (!j || j.status !== 'running') recount();
    });
    return () => {
      synth?.removeEventListener?.('voiceschanged', refresh);
      offState();
      offJob();
    };
  }, []);

  useEffect(() => {
    voicePack.setVoice(gv);
    recount();
  }, [gv]);

  const hear = (lang = getLang()) => {
    voice.unlock(); // 在这一下点按里（iPad 的规矩）
    setSaid('');
    voice.say('staff.sample', { lang }).then((r) => setSaid(SAY_NOTE[r.reason] || ''));
  };
  const pickDevice = (lang, uri) => {
    voicePrefs.setDeviceVoice(lang, uri);
    setDev((d) => ({ ...d, [lang]: uri }));
    if (on) hear(lang); // 换了马上听到
  };
  const run = (regenerate = false) => {
    setAsk('');
    if (!apiKey || running) return;
    voicePack.generate({ apiKey, baseUrl, regenerate });
  };
  const clear = async () => {
    setAsk('');
    await voicePack.clear();
    recount();
  };

  const pct = job?.total ? Math.round((job.done / job.total) * 100) : 0;
  const complete = !!(count && count.total && count.n === count.total);
  const note = (() => {
    if (!canPack) return t('这台设备存不了语音包（可能是私密浏览）。');
    if (!apiKey) return t('先在上面填好 Gemini API key。');
    if (!job) return '';
    if (running) return job.wait ? t('Gemini 有点忙，{0} 秒后再试…', [Math.ceil(job.wait / 1000)]) : t('正在生成 {0} / {1}', [job.done, job.total]);
    if (job.status === 'done') return t('全部做好了：{0} 句。', [job.made + job.skipped]);
    if (job.status === 'partial') return t('{0} 句没成功，再按一次「继续生成」补上。', [job.failed]);
    if (job.status === 'quota') return t('今天的免费额度用完了；明天再按「继续生成」，会接着做。');
    if (job.status === 'fatal') return t('Gemini key 无效或没有权限，请检查上面的 key。');
    if (job.status === 'storage') return t('这台设备存不了语音包（可能是私密浏览）。');
    if (job.status === 'aborted') return t('已停止。再按「继续生成」会接着做。');
    return '';
  })();

  return (
    <>
      <section className="set-sec">
        <div className="set-row">
          <div>
            <h4 className="m-h">{t('潘吉的声音')}</h4>
            <p className="m-fine">{t('她用小女生的声音，说出对话泡泡里的那句话。')}</p>
          </div>
          <Switch
            on={on}
            label={t('潘吉说话')}
            onChange={(v) => {
              voice.setEnabled(v);
              setOn(v);
              setSaid('');
            }}
          />
        </div>

        <div style={ST.block}>
          <Seg
            value={level}
            label={t('她说多少')}
            onChange={(v) => {
              setLevel(v);
              voicePrefs.setLevel(v);
            }}
            options={[
              { id: 'full', label: t('每一句') },
              { id: 'key', label: t('只在仪式时刻') },
            ]}
          />
          <p className="m-fine">{level === 'key' ? t('只在开场、神灯、翻牌、揭晓、蓝图和告别时说话。') : t('仪式时刻之外，一路上也会说几句鼓励的话。')}</p>
        </div>

        {['zh', 'en'].map((lang) => (
          <label key={lang} className="m-field">
            <span>{t(LANG_LABEL[lang])}</span>
            <select style={ST.select} value={dev[lang]} onChange={(e) => pickDevice(lang, e.target.value)}>
              <option value="">{t('自动（推荐）')}</option>
              {list[lang].map(({ voice: v }) => (
                <option key={v.voiceURI || v.name} value={v.voiceURI || v.name}>
                  {v.name} · {v.lang}
                </option>
              ))}
            </select>
          </label>
        ))}

        <div style={ST.row}>
          <button type="button" className="s-btn" onClick={() => hear()} disabled={!on}>
            <Icon name="play" size={16} />
            <span>{t('试听')}</span>
          </button>
          <span className="m-fine" style={ST.fine} aria-live="polite">
            {said ? t(said) : count?.n ? t('高级语音包：{0} / {1} 句', [count.n, count.total]) : t('现在用的是这台设备自带的声音')}
          </span>
        </div>
      </section>

      <section className="set-sec">
        <h4 className="m-h">{t('高级语音包（Gemini）')}</h4>
        <p className="m-p">
          {t('用这台设备上的 Gemini key，把她的每一句台词生成一次更自然的声音，存在本机，没网也能播。')} <b>{t('只发送固定的台词，不含任何客人资料。')}</b>
        </p>
        <label className="m-field">
          <span>{t('声音')}</span>
          <select style={ST.select} value={gv} disabled={running} onChange={(e) => setGv(e.target.value)}>
            {PACK_VOICES.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} · {t(v.zh)}
              </option>
            ))}
            {GEMINI_TTS.more.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <details className="m-adv">
          <summary>
            <span>{t('高级')}</span>
            <em>{t('语音模型')}</em>
            <Icon name="down" size={16} className="m-adv-chev" />
          </summary>
          <label className="m-field">
            <span>{t('语音模型')}</span>
            <input
              value={model}
              spellCheck={false}
              disabled={running}
              onChange={(e) => {
                setModel(e.target.value);
                voicePrefs.setModel(e.target.value);
              }}
            />
          </label>
        </details>

        {running ? (
          <div role="status" aria-live="polite">
            <div style={ST.bar}>
              <i style={ST.fill(pct)} />
            </div>
            <div style={ST.row}>
              <span className="m-fine" style={{ ...ST.fine, flex: 1, minWidth: 0 }}>
                {note}
                <br />
                {t('关掉设置也会在后台继续生成。')}
              </span>
              <button type="button" className="s-btn ghost" onClick={() => voicePack.stop()}>
                <Icon name="pause" size={16} />
                <span>{t('停止')}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={ST.row}>
              <button type="button" className="s-btn primary" disabled={!apiKey || !canPack} onClick={() => (complete ? setAsk('regen') : run(false))}>
                <Icon name={complete ? 'refresh' : 'wand'} size={16} />
                <span>{complete ? t('全部重新生成') : count?.n ? t('继续生成') : t('生成语音包')}</span>
              </button>
              {count?.n > 0 && (
                <button type="button" className="s-btn ghost" onClick={() => setAsk('clear')}>
                  <Icon name="trash" size={16} />
                  <span>{t('清除语音包')}</span>
                </button>
              )}
            </div>
            {note && <p className="m-fine">{note}</p>}
          </>
        )}
      </section>

      {ask === 'clear' && <ConfirmSheet title={t('清除语音包？')} body={t('这台设备上生成好的声音会删掉，她会改用设备自带的声音。随时可以再生成。')} ok={t('清除')} danger onOk={clear} onCancel={() => setAsk('')} />}
      {ask === 'regen' && <ConfirmSheet title={t('重新生成语音包？')} body={t('用现在选的声音把每一句重新生成一次，旧的会先删掉。')} ok={t('全部重新生成')} onOk={() => run(true)} onCancel={() => setAsk('')} />}
    </>
  );
}
