import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, XCircle, ExternalLink, LogOut } from 'lucide-react';
import { testConnection } from '../services/gemini.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { Btn, Field, TextInput, TextArea } from './ui/Bits.jsx';

export default function SettingsModal({ settings, onSave, onClose, onLogout }) {
  const [form, setForm] = useState({ ...settings });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [advanced, setAdvanced] = useState(false);

  const set = (patch) => setForm({ ...form, ...patch });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      await testConnection(form);
      setResult({ ok: true, text: '连接成功，可以开工了' });
    } catch (e) {
      setResult({ ok: false, text: e.message });
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
          <p className="font-medium text-sail-ink">拿一个免费 API key（约 1 分钟）：</p>
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
              </a>
            </li>
            <li>点 “Create API key” → 复制</li>
            <li>粘贴到下面，点「测试连接」</li>
          </ol>
          <p className="text-xs text-sail-faint">
            key 只保存在这台设备的浏览器里，不会经过任何中间服务器。分析一条参考视频大约 US$0.01–0.05。
          </p>
        </div>

        <Field label="API Key">
          <TextInput
            type="password"
            value={form.apiKey}
            onChange={(e) => set({ apiKey: e.target.value.trim() })}
            placeholder="AIza..."
          />
        </Field>

        <div className="flex items-center gap-2">
          <Btn variant="soft" size="sm" onClick={handleTest} busy={testing} disabled={!form.apiKey}>
            {testing ? '测试中' : '测试连接'}
          </Btn>
          {result && (
            <span className={`text-xs flex items-center gap-1 ${result.ok ? 'text-sail-green' : 'text-sail-danger'}`}>
              {result.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {result.text}
            </span>
          )}
        </div>

        <div className="border-t border-sail-line pt-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-sail-ink">品牌上下文</h3>
            <p className="text-xs text-sail-faint mt-0.5">
              填一次，之后每一次拆解、排剪辑、写文案都会自动带上 —— 这是让输出「像你」的关键。
            </p>
          </div>

          <Field label="品牌 / 业务是什么">
            <TextInput
              value={form.brand}
              onChange={(e) => set({ brand: e.target.value })}
              placeholder="如：马来西亚全屋定制，主打高完成度交付与真实案例"
            />
          </Field>

          <Field label="目标客户">
            <TextInput
              value={form.audience}
              onChange={(e) => set({ audience: e.target.value })}
              placeholder="如：30-45 岁首次装修的双薪家庭，预算 8-20 万"
            />
          </Field>

          <Field label="语气 / 调性" hint="越具体越好。「专业但不端着，用数字说话，不喊口号」比「专业」有用得多。">
            <TextInput
              value={form.tone}
              onChange={(e) => set({ tone: e.target.value })}
              placeholder="如：克制、真实、用细节和数字说话，不喊口号"
            />
          </Field>
        </div>

        <div className="border-t border-sail-line pt-4">
          <button
            type="button"
            onClick={() => setAdvanced(!advanced)}
            className="text-xs text-sail-faint hover:text-sail-muted"
          >
            {advanced ? '收起' : '展开'}高级选项（模型 / 接口地址）
          </button>
          {advanced && (
            <div className="mt-3 space-y-3">
              <Field label="分析模型" hint="拆解视频、排剪辑、写文案用这个">
                <TextInput value={form.textModel} onChange={(e) => set({ textModel: e.target.value.trim() })} />
              </Field>
              <Field label="出图模型" hint="封面图、动态帖配图用这个">
                <TextInput value={form.imageModel} onChange={(e) => set({ imageModel: e.target.value.trim() })} />
              </Field>
              <Field label="接口地址">
                <TextInput
                  value={form.baseUrl}
                  onChange={(e) => set({ baseUrl: e.target.value.trim() })}
                  placeholder={DEFAULT_SETTINGS.baseUrl}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-sail-line pt-4">
          <Btn variant="ghost" size="sm" icon={LogOut} onClick={onLogout}>
            退出登录
          </Btn>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose}>
              取消
            </Btn>
            <Btn onClick={() => onSave(form)}>保存</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
