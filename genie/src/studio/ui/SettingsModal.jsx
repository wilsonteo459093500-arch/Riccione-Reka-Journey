// 设置：画质（自动 / 高清 / 流畅，存在本机，许愿模式也会用这台设备的选择）+ 语言 + AI 识别平面图用的 Google Gemini key（只存本机浏览器）

import { useState } from 'react';
import { BRAND } from '../../shared/config.js';
import { Modal, Seg } from './kit.jsx';
import { loadSettings, saveSettings } from '../store.js';
import LangToggle from '../../shared/LangToggle.jsx';
import { t, isEn } from '../../shared/i18n.js';

export default function SettingsModal({ onClose, onQuality, onLang, showLang = true }) {
  const [s, setS] = useState(loadSettings);
  const [q, setQ] = useState(() => loadSettings().quality || 'auto');
  const pickQuality = (v) => {
    setQ(v);
    // 画质马上存（不用等「保存」），下次打开、许愿模式都沿用
    saveSettings({ ...loadSettings(), quality: v === 'auto' ? '' : v });
    onQuality?.(v);
  };
  const QUALITY_NOTE = {
    auto: '电脑、大屏用高清；iPad、手机用流畅（省电、不发烫）。',
    high: '柔和阴影、环境光遮蔽、景深都打开。适合电脑和展厅大屏。',
    fast: '画面稍简单，但更顺、更省电。iPad 用久了发烫时选它。',
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
          <input type="password" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value.trim() })} placeholder="AIza…" autoComplete="off" spellCheck={false} />
        </label>
        <details className="m-adv">
          <summary>{t('高级')}</summary>
          <label className="m-field">
            <span>{t('识别模型')}</span>
            <input value={s.visionModel} onChange={(e) => setS({ ...s, visionModel: e.target.value.trim() })} spellCheck={false} />
          </label>
          <label className="m-field">
            <span>{t('接口地址')}</span>
            <input value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value.trim() })} spellCheck={false} />
          </label>
        </details>
      </section>
      <div className="m-actions">
        <button type="button" className="s-btn ghost" onClick={onClose}>
          {t('取消')}
        </button>
        <button
          type="button"
          className="s-btn primary"
          onClick={() => {
            saveSettings({ ...loadSettings(), ...s, quality: q === 'auto' ? '' : q });
            onClose();
          }}
        >
          {t('保存')}
        </button>
      </div>
    </Modal>
  );
}
