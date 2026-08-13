import React, { useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { testConnection } from '../services/gemini.js';
import { testFalKey } from '../services/fal.js';
import { DEFAULT_SETTINGS } from '../constants.js';

export default function SettingsModal({ settings, onSave, onClose }) {
  const [form, setForm] = useState({ ...settings });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, text }
  const [falTesting, setFalTesting] = useState(false);
  const [falResult, setFalResult] = useState(null); // { ok, text }

  async function handleTestFal() {
    setFalTesting(true);
    setFalResult(null);
    try {
      await testFalKey(form.falKey);
      setFalResult({ ok: true, text: 'fal.ai 连接成功，「极致真实」可以用了' });
    } catch (e) {
      setFalResult({ ok: false, text: e.message });
    } finally {
      setFalTesting(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await testConnection(form);
      setTestResult({ ok: true, text: '连接成功，可以开始出图了' });
    } catch (e) {
      setTestResult({ ok: false, text: e.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-sail-ink/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-sail-card rounded-2xl shadow-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">设置</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-sail-tint text-sail-muted">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-xl bg-sail-tint border border-sail-line p-4 text-sm leading-relaxed text-sail-muted space-y-2">
          <p className="font-medium text-sail-ink">怎么拿到免费 API key（约 1 分钟）：</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              打开{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-sail-green underline inline-flex items-center gap-0.5"
              >
                aistudio.google.com/apikey <ExternalLink size={12} />
              </a>{' '}
              （用 Google 账号登录）
            </li>
            <li>点 “Create API key” → 复制</li>
            <li>粘贴到下面，点 “测试连接”</li>
          </ol>
          <p className="text-xs text-sail-faint">
            key 只保存在这台设备的浏览器里，不会上传到任何服务器。按量计费约 US$0.04/张，
            比订阅制渲染平台便宜一个数量级。
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-sail-faint">API Key</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value.trim() })}
              placeholder="AIza..."
              className="mt-1 w-full rounded-xl border border-sail-line px-3 py-2 text-sm focus:outline-none focus:border-sail-green"
            />
          </label>

          <div className="rounded-xl border border-sail-gold/50 bg-sail-gold/10 p-4 space-y-2">
            <div className="text-sm font-medium text-sail-ink">📸 「极致真实」精炼引擎（可选，强烈推荐）</div>
            <p className="text-xs text-sail-muted leading-relaxed">
              出图后一键把画面精炼成照片级：2x 放大 + 重铺布纹/木纹/墙面微观纹理，洗掉 AI 光滑感。
              到{' '}
              <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" className="text-sail-green underline inline-flex items-center gap-0.5">
                fal.ai/dashboard/keys <ExternalLink size={11} />
              </a>{' '}
              注册（送免费额度）→ Create Key → 粘贴到下面。约 US$0.05/张。
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={form.falKey || ''}
                onChange={(e) => setForm({ ...form, falKey: e.target.value.trim() })}
                placeholder="fal.ai API Key（形如 xxxx:yyyy）"
                className="flex-1 rounded-xl border border-sail-line px-3 py-2 text-sm focus:outline-none focus:border-sail-green"
              />
              <button
                type="button"
                onClick={handleTestFal}
                disabled={falTesting || !form.falKey}
                className="flex items-center gap-1 px-3 py-2 rounded-xl border border-sail-line text-xs text-sail-muted hover:bg-white disabled:opacity-50 whitespace-nowrap"
              >
                {falTesting && <Loader2 size={12} className="animate-spin" />}
                测试 fal 连接
              </button>
            </div>
            {falResult && (
              <div className={`flex items-start gap-1.5 text-xs rounded-lg p-2 ${falResult.ok ? 'bg-sail-green/10 text-sail-green-deep' : 'bg-sail-danger/10 text-sail-danger'}`}>
                {falResult.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
                <span>{falResult.text}</span>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2.5 rounded-xl border border-sail-line bg-sail-tint p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.watermark}
              onChange={(e) => setForm({ ...form, watermark: e.target.checked ? 'logo' : '' })}
              className="w-4 h-4 accent-[#3D5A4A]"
            />
            <span className="text-sm">
              下载 / 导出图右下角印上 <span className="font-display font-semibold">sAil 溪岸</span> logo 水印
            </span>
          </label>

          <details className="text-sm">
            <summary className="cursor-pointer text-sail-faint text-xs">高级选项（一般不用改）</summary>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-sail-faint">模型</span>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value.trim() })}
                  placeholder={DEFAULT_SETTINGS.model}
                  className="mt-1 w-full rounded-xl border border-sail-line px-3 py-2 text-sm focus:outline-none focus:border-sail-green"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-sail-faint">接口地址（可换成中转代理）</span>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value.trim() })}
                  placeholder={DEFAULT_SETTINGS.baseUrl}
                  className="mt-1 w-full rounded-xl border border-sail-line px-3 py-2 text-sm focus:outline-none focus:border-sail-green"
                />
              </label>
            </div>
          </details>
        </div>

        {testResult && (
          <div
            className={`flex items-start gap-2 text-sm rounded-xl p-3 ${
              testResult.ok ? 'bg-sail-green/10 text-sail-green-deep' : 'bg-sail-danger/10 text-sail-danger'
            }`}
          >
            {testResult.ok ? <CheckCircle2 size={16} className="mt-0.5" /> : <XCircle size={16} className="mt-0.5" />}
            <span>{testResult.text}</span>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !form.apiKey}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-sail-line text-sm text-sail-muted hover:bg-sail-tint disabled:opacity-50"
          >
            {testing && <Loader2 size={14} className="animate-spin" />}
            测试连接
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            className="px-5 py-2 rounded-xl bg-sail-green-deep text-white text-sm font-semibold hover:bg-sail-green"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
