// 设置：画质（自动 / 高清 / 流畅，存在本机，许愿模式也会用这台设备的选择）+ 语言 + AI 识别平面图用的 Google Gemini key（只存本机浏览器）。
// 一种保存方式：改了就存（像 iOS 的「设置」），底部只有一个「完成」。

import { useState } from 'react';
import { BRAND } from '../../shared/config.js';
import { Icon, Modal, Seg } from './kit.jsx';
import { loadSettings, saveSettings } from '../store.js';
import LangToggle from '../../shared/LangToggle.jsx';
import { t, isEn } from '../../shared/i18n.js';

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
