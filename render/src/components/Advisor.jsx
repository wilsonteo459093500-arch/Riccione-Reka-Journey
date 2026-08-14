import React, { useCallback, useMemo, useRef, useState } from 'react';
import { UploadCloud, X, Loader2, ClipboardCheck, Copy, Wand2 } from 'lucide-react';
import { ROOM_TYPES, ADVISOR_FOCUS, ADVISOR_PROMPT } from '../constants.js';
import { analyzeImage } from '../services/gemini.js';
import { prepareInputImage } from '../services/images.js';

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
        active
          ? 'bg-sail-green text-white border-sail-green'
          : 'bg-white text-sail-muted border-sail-line hover:border-sail-green/50'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 从点评文字里抽出可执行的修改建议：
 * 优先取「优先改的前三件事」的编号条目，不足则补「修改建议：」行。
 */
function parseSuggestions(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const out = [];
  const clean = (s) => s.replace(/\*\*/g, '').trim();
  const priorityIdx = lines.findIndex((l) => l.includes('优先'));
  if (priorityIdx >= 0) {
    for (const l of lines.slice(priorityIdx + 1)) {
      const m = l.match(/^(?:[*\-]\s*)?(\d+)[.、)]\s*(.+)/);
      if (m) out.push(clean(m[2]));
      if (out.length >= 5) break;
    }
  }
  if (out.length < 3) {
    for (const l of lines) {
      const m = l.match(/修改建议[：:]\s*(.+)/);
      if (m && !out.includes(clean(m[1]))) out.push(clean(m[1]));
      if (out.length >= 6) break;
    }
  }
  return out;
}

/** 简易排版：【标题】行加粗、✅⚠️❌ 行高亮 */
function ReviewText({ text }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-1" />;
        const isHeading = /^[【#]/.test(t) || /^\*\*.+\*\*$/.test(t);
        const isVerdict = /^[✅⚠️❌]/.test(t);
        return (
          <p
            key={i}
            className={
              isHeading
                ? 'font-semibold text-sail-ink mt-3'
                : isVerdict
                  ? 'font-semibold text-sail-green-deep bg-sail-tint rounded-lg px-3 py-2'
                  : 'text-sail-muted'
            }
          >
            {t.replace(/\*\*/g, '')}
          </p>
        );
      })}
    </div>
  );
}

export default function Advisor({ settings, onOpenSettings, notify, image, setImage, onApplyFix }) {
  const fileRef = useRef(null);
  const [roomId, setRoomId] = useState('living');
  const [focusId, setFocusId] = useState('all');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);
  const [checked, setChecked] = useState({}); // 建议勾选状态 {index: bool}

  const suggestions = useMemo(() => (review ? parseSuggestions(review) : []), [review]);

  const acceptFile = useCallback(
    async (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      setImage(await prepareInputImage(file));
      setReview(null);
    },
    [setImage]
  );

  async function handleReview() {
    if (busy) return;
    if (!settings.apiKey) {
      onOpenSettings();
      return;
    }
    if (!image) {
      notify?.({ type: 'warn', text: '先上传一张平面图、效果图或现场照片' });
      return;
    }
    setBusy(true);
    setReview(null);
    try {
      const room = ROOM_TYPES.find((r) => r.id === roomId);
      const focus = ADVISOR_FOCUS.find((f) => f.id === focusId) || ADVISOR_FOCUS[0];
      const prompt =
        `${ADVISOR_PROMPT}\n\n空间类型：${room?.label || '未指定'}。\n本次审查侧重：${focus.prompt}` +
        (question.trim() ? `\n客户/设计师特别想知道：${question.trim()}` : '');
      const text = await analyzeImage(settings, prompt, image);
      setReview(text);
      setChecked({}); // 默认全选（未记录 = 选中）
    } catch (e) {
      notify?.({ type: 'error', text: `点评失败：${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  function copyReview() {
    navigator.clipboard?.writeText(review).then(
      () => notify?.({ type: 'ok', text: '点评已复制，可直接发给客户 / 团队' }),
      () => notify?.({ type: 'error', text: '复制失败，手动选择文字复制' })
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <div className="space-y-5 bg-sail-card border border-sail-line rounded-2xl p-5 h-fit lg:sticky lg:top-20">
        <div>
          <div className="text-xs font-semibold text-sail-faint mb-2">要点评的图（平面图 / 效果图 / 现场照）</div>
          {image ? (
            <div className="relative rounded-xl overflow-hidden border border-sail-line">
              <img src={image.dataUrl} alt="待审查的图" className="w-full max-h-64 object-contain bg-sail-tint" />
              <button
                type="button"
                onClick={() => {
                  setImage(null);
                  setReview(null);
                }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-sail-ink/70 text-white hover:bg-sail-ink"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                acceptFile(e.dataTransfer.files?.[0]);
              }}
              className="w-full h-32 rounded-xl border-2 border-dashed border-sail-line hover:border-sail-green/50 flex flex-col items-center justify-center gap-2 text-sail-faint"
            >
              <UploadCloud size={22} />
              <span className="text-sm">点击上传 / 拖入图片</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              acceptFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-sail-faint mb-2">空间类型</div>
          <div className="flex flex-wrap gap-1.5">
            {ROOM_TYPES.map((r) => (
              <Chip key={r.id} active={roomId === r.id} onClick={() => setRoomId(r.id)}>
                {r.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-sail-faint mb-2">审查侧重</div>
          <div className="flex flex-wrap gap-1.5">
            {ADVISOR_FOCUS.map((f) => (
              <Chip key={f.id} active={focusId === f.id} onClick={() => setFocusId(f.id)}>
                {f.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-sail-faint mb-2">特别想问的（可选）</div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="例：这个衣柜分区够 4 口人用吗？岛台会不会挡动线？"
            className="w-full rounded-xl border border-sail-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-sail-green resize-none"
          />
        </div>

        <button
          type="button"
          onClick={handleReview}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sail-green-deep text-white font-semibold hover:bg-sail-green disabled:opacity-60"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
          {busy ? '主案设计师审图中…' : '开始专业点评'}
        </button>
        <div className="text-[11px] text-sail-faint leading-relaxed">
          按专业标准逐项核对：动线净宽 / 柜体规范 / 照明分层与照度 / 配色法则，给出带数字的修改建议。
        </div>
      </div>

      <div>
        {review ? (
          <div className="bg-sail-card border border-sail-line rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-lg">设计顾问点评</h2>
              <button
                type="button"
                onClick={copyReview}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sail-line text-xs text-sail-muted hover:bg-sail-tint"
              >
                <Copy size={13} /> 复制全文
              </button>
            </div>
            <ReviewText text={review} />

            {suggestions.length > 0 && (
              <div className="mt-6 rounded-xl border border-sail-gold/50 bg-sail-gold/10 p-4">
                <div className="text-sm font-semibold mb-2">✨ 一键按建议修改 —— 勾选要执行的：</div>
                <div className="space-y-1.5 mb-3">
                  {suggestions.map((s, i) => (
                    <label key={i} className="flex items-start gap-2 cursor-pointer text-sm text-sail-muted">
                      <input
                        type="checkbox"
                        checked={checked[i] !== false}
                        onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                        className="mt-0.5 w-4 h-4 accent-[#3D5A4A] shrink-0"
                      />
                      <span>{s}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const selected = suggestions.filter((_, i) => checked[i] !== false);
                    if (!selected.length) {
                      notify?.({ type: 'warn', text: '至少勾选一条建议' });
                      return;
                    }
                    onApplyFix(image, selected);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sail-green-deep text-white text-sm font-semibold hover:bg-sail-green"
                >
                  <Wand2 size={16} />
                  把所选建议填入修改指令
                </button>
                <div className="text-[11px] text-sail-faint mt-1.5">
                  会跳到「AI 效果图」并填好底图和指令 —— 你可以先编辑内容，确认后再点「生成效果图」。
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full min-h-[420px] rounded-2xl border-2 border-dashed border-sail-line flex flex-col items-center justify-center gap-3 text-sail-faint bg-sail-tint/50">
            <ClipboardCheck size={40} strokeWidth={1.2} />
            <div className="text-sm font-medium">专业点评会出现在这里</div>
            <div className="text-xs max-w-sm text-center leading-relaxed">
              上传平面图、柜体设计图或效果图，AI 按主案设计师标准审查
              —— 动线、柜体、灯光、配色逐项核对，直接给带数字的修改建议。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
