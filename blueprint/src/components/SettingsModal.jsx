// 设置：Gemini API key（可选）、测试连接、水印、高级模型选项、退出登录（改编自 UKIR STUDIO）

import React, { useState } from 'react';
import { Loader2, CheckCircle2, XCircle, ExternalLink, Eye, EyeOff, Settings, Sparkles, LogOut, RotateCcw } from 'lucide-react';
import { testConnection } from '../ai/gemini.js';
import { DEFAULT_SETTINGS } from '../ai/settings.js';
import { Modal, cls } from '../lib/ui.jsx';

export default function SettingsModal({ settings, onSave, onClose, onLogout }) {
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS, ...settings });
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, text }

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setTestResult(null);
  };

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await testConnection({ ...form, model: form.model || DEFAULT_SETTINGS.model, baseUrl: form.baseUrl || DEFAULT_SETTINGS.baseUrl });
      setTestResult({ ok: true, text: '连接成功 —— AI 润色、Material Board 实拍排版、3D 立体图都可以用了' });
    } catch (e) {
      setTestResult({ ok: false, text: e.message || '连接失败' });
    } finally {
      setTesting(false);
    }
  }

  function handleSave(e) {
    e?.preventDefault?.();
    // 高级项留空 = 用默认值
    onSave({
      ...form,
      apiKey: (form.apiKey || '').trim(),
      model: (form.model || '').trim() || DEFAULT_SETTINGS.model,
      model3d: (form.model3d || '').trim() || DEFAULT_SETTINGS.model3d,
      baseUrl: (form.baseUrl || '').trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.baseUrl,
      watermark: (form.watermark || '').trim(),
    });
  }

  const advancedChanged =
    form.model !== DEFAULT_SETTINGS.model || form.model3d !== DEFAULT_SETTINGS.model3d || form.baseUrl !== DEFAULT_SETTINGS.baseUrl;
  const [advOpen] = useState(advancedChanged); // 改过高级项时默认展开（只在打开时决定，之后由用户收放）

  return (
    <Modal
      title="设置"
      icon={<Settings size={18} className="text-bp-gold" />}
      onClose={onClose}
      footer={
        <>
          {onLogout && (
            <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-bp-faint hover:text-bp-danger hover:bg-bp-tint">
              <LogOut size={15} /> 退出登录
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={handleTest} disabled={testing || !form.apiKey} className={cls.btnGhost}>
            {testing && <Loader2 size={14} className="animate-spin" />}
            测试连接
          </button>
          <button type="submit" form="bp-settings-form" className={cls.btnPrimary}>
            保存
          </button>
        </>
      }
    >
      <form id="bp-settings-form" onSubmit={handleSave} className="space-y-5">
        <div className="rounded-xl bg-bp-gold/10 border border-bp-gold/40 p-4 text-sm text-bp-muted leading-relaxed flex gap-2.5">
          <Sparkles size={16} className="text-bp-gold shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-bp-ink">AI 是可选的。</span>
            不填 key 也能完整走完「上传 PDF → 修改 → 导出 PPT」；只有 <b className="font-medium text-bp-ink">AI 润色</b>、
            <b className="font-medium text-bp-ink">Material Board 实拍排版</b>、<b className="font-medium text-bp-ink">3D 立体图</b> 需要 key。
          </div>
        </div>

        <div className="rounded-xl bg-bp-tint border border-bp-line p-4 text-sm leading-relaxed text-bp-muted space-y-2">
          <p className="font-medium text-bp-ink">怎么拿到免费 API key（约 1 分钟）：</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              打开{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-bp-eyebrow underline underline-offset-2 inline-flex items-center gap-0.5"
              >
                aistudio.google.com/apikey <ExternalLink size={12} />
              </a>{' '}
              （用 Google 账号登录）
            </li>
            <li>点 “Create API key” → 复制</li>
            <li>粘贴到下面，点 “测试连接”</li>
          </ol>
          <p className="text-xs text-bp-faint">
            和 UKIR STUDIO 用同一个 key 就行。key 只保存在这台设备的浏览器里，不会上传到我们的服务器；按量计费，出一张图约 US$0.04。
          </p>
        </div>

        <label className="block">
          <span className={cls.label}>Gemini API Key</span>
          <div className="mt-1 relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.apiKey || ''}
              onChange={(e) => set({ apiKey: e.target.value.trim() })}
              placeholder="AIza..."
              autoComplete="off"
              spellCheck={false}
              className={`${cls.input} pr-10 font-mono`}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-bp-faint hover:text-bp-ink"
              aria-label={showKey ? '隐藏 key' : '显示 key'}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>

        {testResult && (
          <div
            className={`flex items-start gap-2 text-sm rounded-xl p-3 ${
              testResult.ok ? 'bg-bp-green/10 text-bp-green' : 'bg-bp-danger/10 text-bp-danger'
            }`}
          >
            {testResult.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <span>{testResult.text}</span>
          </div>
        )}

        <label className="block">
          <span className={cls.label}>Material Board 下载水印</span>
          <input
            type="text"
            value={form.watermark || ''}
            onChange={(e) => set({ watermark: e.target.value })}
            placeholder="留空 = 不加水印"
            className={`${cls.input} mt-1`}
          />
          <span className="block mt-1 text-[11px] text-bp-faint">下载 Material Board 图片时印在右下角，例如 {DEFAULT_SETTINGS.watermark}</span>
        </label>

        <details className="text-sm" open={advOpen || undefined}>
          <summary className="cursor-pointer text-bp-faint text-xs select-none hover:text-bp-muted">高级选项（一般不用改）</summary>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className={cls.label}>出图模型（Material Board 实拍排版 / 3D 失败时的备选）</span>
              <input
                type="text"
                value={form.model || ''}
                onChange={(e) => set({ model: e.target.value.trim() })}
                placeholder={DEFAULT_SETTINGS.model}
                spellCheck={false}
                className={`${cls.input} mt-1 font-mono text-xs`}
              />
            </label>
            <label className="block">
              <span className={cls.label}>3D 立体图模型</span>
              <input
                type="text"
                value={form.model3d || ''}
                onChange={(e) => set({ model3d: e.target.value.trim() })}
                placeholder={DEFAULT_SETTINGS.model3d}
                spellCheck={false}
                className={`${cls.input} mt-1 font-mono text-xs`}
              />
            </label>
            <label className="block">
              <span className={cls.label}>接口地址（可换成中转代理）</span>
              <input
                type="text"
                value={form.baseUrl || ''}
                onChange={(e) => set({ baseUrl: e.target.value.trim() })}
                placeholder={DEFAULT_SETTINGS.baseUrl}
                spellCheck={false}
                className={`${cls.input} mt-1 font-mono text-xs`}
              />
            </label>
            {advancedChanged && (
              <button
                type="button"
                onClick={() => set({ model: DEFAULT_SETTINGS.model, model3d: DEFAULT_SETTINGS.model3d, baseUrl: DEFAULT_SETTINGS.baseUrl })}
                className="inline-flex items-center gap-1 text-xs text-bp-faint hover:text-bp-ink"
              >
                <RotateCcw size={12} /> 恢复默认
              </button>
            )}
          </div>
        </details>
      </form>
    </Modal>
  );
}
