import React, { useCallback, useRef, useState } from 'react';
import { UploadCloud, X, Sparkles, Loader2 } from 'lucide-react';
import {
  MODES,
  ROOM_TYPES,
  STYLES,
  LIGHTING_OPTIONS,
  FIDELITY_OPTIONS,
  POLISH_SCOPES,
  ASPECT_RATIOS,
  VARIATION_COUNTS,
} from '../constants.js';
import { prepareInputImage } from '../services/images.js';

function Section({ title, children, right }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-sail-faint tracking-wide">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      title={title}
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

export default function Controls(props) {
  const {
    mode, modeId, setModeId, image, setImage,
    refImage, setRefImage, polishScopeId, setPolishScopeId,
    roomId, setRoomId, styleId, setStyleId,
    lightingId, setLightingId, fidelityId, setFidelityId,
    aspect, setAspect, extra, setExtra, count, setCount,
    busy, onGenerate,
  } = props;

  const fileRef = useRef(null);
  const refFileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [reading, setReading] = useState(false);

  const acceptFile = useCallback(
    async (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      setReading(true);
      try {
        setImage(await prepareInputImage(file));
      } finally {
        setReading(false);
      }
    },
    [setImage]
  );

  const acceptRefFile = useCallback(
    async (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      setRefImage(await prepareInputImage(file));
    },
    [setRefImage]
  );

  const onPaste = useCallback(
    (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) acceptFile(item.getAsFile());
    },
    [acceptFile]
  );

  const showFidelity = mode.needsImage && !mode.skipFidelity && modeId !== 'sketch' && modeId !== 'edit';

  return (
    <div className="space-y-5 bg-sail-card border border-sail-line rounded-2xl p-5 h-fit lg:sticky lg:top-20" onPaste={onPaste}>
      <Section title="工作模式">
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModeId(m.id)}
              className={`text-left px-3 py-2 rounded-xl border transition-colors ${
                modeId === m.id
                  ? 'bg-sail-green-deep text-white border-sail-green-deep'
                  : 'bg-white border-sail-line hover:border-sail-green/50'
              }`}
            >
              <div className="text-sm font-medium">{m.label}</div>
              <div className={`text-[11px] leading-tight mt-0.5 ${modeId === m.id ? 'text-white/70' : 'text-sail-faint'}`}>
                {m.hint}
              </div>
            </button>
          ))}
        </div>
      </Section>

      {mode.needsImage && (
        <Section title="底图（照片 / 草图）">
          {image ? (
            <div className="relative rounded-xl overflow-hidden border border-sail-line">
              <img src={image.dataUrl} alt="输入底图" className="w-full max-h-64 object-contain bg-sail-tint" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-sail-ink/70 text-white hover:bg-sail-ink"
                title="移除图片"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                acceptFile(e.dataTransfer.files?.[0]);
              }}
              className={`w-full h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-sail-faint transition-colors ${
                dragOver ? 'border-sail-green bg-sail-tint' : 'border-sail-line hover:border-sail-green/50'
              }`}
            >
              {reading ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
              <div className="text-sm">点击上传 / 拖入图片 / 直接粘贴</div>
              <div className="text-[11px]">现场照片、手机随手拍、SU 白模、手绘草图都可以</div>
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
        </Section>
      )}

      {!mode.skipRoom && (
        <Section title="空间类型">
          <div className="flex flex-wrap gap-1.5">
            {ROOM_TYPES.map((r) => (
              <Chip key={r.id} active={roomId === r.id} onClick={() => setRoomId(r.id)}>
                {r.label}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {!mode.skipStyle && (
        <Section title="目标风格">
          <div className="flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <Chip key={s.id} active={styleId === s.id} onClick={() => setStyleId(s.id)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {modeId === 'polish' && (
        <Section title="润饰范围">
          <div className="grid grid-cols-3 gap-1.5">
            {POLISH_SCOPES.map((p) => (
              <Chip key={p.id} active={polishScopeId === p.id} onClick={() => setPolishScopeId(p.id)} title={p.hint}>
                {p.label}
              </Chip>
            ))}
          </div>
          <div className="text-[11px] text-sail-faint mt-1.5 leading-relaxed">
            设计（柜体/家具/布局/材质）永远锁死；这里只控制 AI 能不能补充装饰让画面更活。
          </div>
        </Section>
      )}

      {mode.needsImage && !mode.needsInstruction && modeId !== 'sketch' && (
        <Section
          title="质感参考图（可选）"
          right={<span className="text-[11px] text-sail-faint">只学它的光感质感，不学设计</span>}
        >
          {refImage ? (
            <div className="relative rounded-xl overflow-hidden border border-sail-line w-28">
              <img src={refImage.dataUrl} alt="质感参考图" className="w-full h-20 object-cover bg-sail-tint" />
              <button
                type="button"
                onClick={() => setRefImage(null)}
                className="absolute top-1 right-1 p-1 rounded-full bg-sail-ink/70 text-white hover:bg-sail-ink"
                title="移除参考图"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => refFileRef.current?.click()}
              className="w-full py-2.5 rounded-xl border border-dashed border-sail-line hover:border-sail-green/50 text-xs text-sail-faint"
            >
              上传一张你喜欢的实拍图 —— AI 会对齐它的真实感 / 灯光氛围
            </button>
          )}
          <input
            ref={refFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              acceptRefFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </Section>
      )}

      <Section title="灯光氛围">
        <div className="flex flex-wrap gap-1.5">
          {LIGHTING_OPTIONS.map((l) => (
            <Chip key={l.id} active={lightingId === l.id} onClick={() => setLightingId(l.id)}>
              {l.label}
            </Chip>
          ))}
        </div>
      </Section>

      {showFidelity && (
        <Section title="结构保真度">
          <div className="grid grid-cols-3 gap-1.5">
            {FIDELITY_OPTIONS.map((f) => (
              <Chip key={f.id} active={fidelityId === f.id} onClick={() => setFidelityId(f.id)} title={f.hint}>
                {f.label}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {!mode.needsImage && (
        <Section title="画幅比例">
          <div className="flex flex-wrap gap-1.5">
            {ASPECT_RATIOS.map((a) => (
              <Chip key={a.id} active={aspect === a.id} onClick={() => setAspect(a.id)}>
                {a.label}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      <Section title={mode.needsInstruction ? '修改指令（必填）' : '补充描述（可选）'}>
        <textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={3}
          placeholder={
            mode.needsInstruction
              ? '例：把电视墙换成灰色岩板，加隐藏灯带；沙发换成米白色布艺'
              : '例：要有大量收纳；窗外是城市夜景；地面用鱼骨拼木地板'
          }
          className="w-full rounded-xl border border-sail-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-sail-green resize-none"
        />
      </Section>

      <Section
        title="生成张数"
        right={<span className="text-[11px] text-sail-faint">2K 高清 · 约 US$0.13/张</span>}
      >
        <div className="flex gap-1.5">
          {VARIATION_COUNTS.map((n) => (
            <Chip key={n} active={count === n} onClick={() => setCount(n)}>
              {n} 张
            </Chip>
          ))}
        </div>
      </Section>

      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sail-green-deep text-white font-semibold hover:bg-sail-green disabled:opacity-60 transition-colors"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
        {busy ? '生成中，约 10–20 秒…' : '生成效果图'}
      </button>
    </div>
  );
}
