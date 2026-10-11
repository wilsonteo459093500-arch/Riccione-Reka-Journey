// 设置：画质 + AI 识别平面图用的 Google Gemini key（只存本机浏览器）

import { useState } from 'react';
import { Modal } from './kit.jsx';
import { loadSettings, saveSettings } from '../store.js';

export default function SettingsModal({ onClose, quality, onQuality }) {
  const [s, setS] = useState(loadSettings);
  const [q, setQ] = useState(quality || 'high');
  return (
    <Modal title="设置" onClose={onClose}>
      <h4 className="m-h">画质</h4>
      <div className="seg-s">
        {[
          ['high', '高清（电脑 / 大屏）'],
          ['fast', '流畅（iPad / 手机）'],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={q === v ? 'on' : ''}
            onClick={() => {
              setQ(v);
              onQuality?.(v);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <h4 className="m-h">AI 识别平面图（选填）</h4>
      <p className="m-p">
        用 Google Gemini 认出平面图里的房间与门窗。和 UKIR STUDIO 同一种 key（aistudio.google.com 申请）。
        <b>key 只存在这台设备的浏览器里</b>，不经过任何服务器。没有 key 也能手动画。
      </p>
      <label className="m-field">
        <span>API key</span>
        <input type="password" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value.trim() })} placeholder="AIza…" autoComplete="off" />
      </label>
      <details className="m-adv">
        <summary>高级</summary>
        <label className="m-field">
          <span>识别模型</span>
          <input value={s.visionModel} onChange={(e) => setS({ ...s, visionModel: e.target.value.trim() })} />
        </label>
        <label className="m-field">
          <span>接口地址</span>
          <input value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value.trim() })} />
        </label>
      </details>
      <div className="m-actions">
        <button
          type="button"
          className="s-btn gold"
          onClick={() => {
            saveSettings(s);
            onClose();
          }}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}
