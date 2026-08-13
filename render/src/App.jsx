import React, { useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Controls from './components/Controls.jsx';
import Results from './components/Results.jsx';
import MoodBoard from './components/MoodBoard.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { MODES, ENHANCE_PROMPT } from './constants.js';
import { buildPrompt } from './prompt.js';
import { loadSettings, saveSettings, generateImage } from './services/gemini.js';
import { refineImage } from './services/fal.js';
import { compressForStorage, makeThumb, dataUrlToInput, shrinkDataUrl } from './services/images.js';
import { listHistory, saveRecord, updateRecord, deleteRecord } from './services/history.js';

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState('render'); // 'render' | 'board'

  // 生成参数
  const [modeId, setModeId] = useState('restyle');
  const [image, setImage] = useState(null); // { dataUrl, mimeType, base64 }
  const [refImage, setRefImage] = useState(null); // 质感参考图（可选）
  const [roomId, setRoomId] = useState('living');
  const [styleId, setStyleId] = useState('modern');
  const [lightingId, setLightingId] = useState('auto');
  const [fidelityId, setFidelityId] = useState('strict');
  const [polishScopeId, setPolishScopeId] = useState('decor');
  const [aspect, setAspect] = useState('16:9');
  const [extra, setExtra] = useState('');
  const [count, setCount] = useState(2);
  const [autoPolish, setAutoPolish] = useState(true); // 双通道出图：生成后自动追加一道精修 pass

  // 生成结果槽位: { id, status: 'loading'|'done'|'error', dataUrl?, error? }
  const [slots, setSlots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const resultsRef = useRef(null);

  const mode = useMemo(() => MODES.find((m) => m.id === modeId) || MODES[0], [modeId]);

  useEffect(() => {
    listHistory().then(setHistory);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  function handleSaveSettings(next) {
    setSettings(next);
    saveSettings(next);
    setShowSettings(false);
  }

  function updateSlot(id, patch) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function handleGenerate() {
    if (busy) return;
    if (!settings.apiKey) {
      setShowSettings(true);
      setNotice({ type: 'warn', text: '先配置 API key（免费申请，1 分钟搞定）' });
      return;
    }
    if (mode.needsImage && !image) {
      setNotice({ type: 'warn', text: '这个模式需要先上传一张照片或草图' });
      return;
    }
    if (mode.needsInstruction && !extra.trim()) {
      setNotice({ type: 'warn', text: '指令修改模式需要写清楚要改什么，例如：把电视墙换成岩板' });
      return;
    }

    const newSlots = Array.from({ length: count }, () => ({ id: uid(), status: 'loading' }));
    setSlots(newSlots);
    setBusy(true);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const inputImage = mode.needsImage ? image : null;
    const useRef = !!(inputImage && refImage && !mode.needsInstruction);
    const modelInput = useRef ? [inputImage, refImage] : inputImage;
    const params = { modeId, roomId, styleId, lightingId, fidelityId, polishScopeId, hasRef: useRef, extra };

    const tasks = newSlots.map(async (slot, i) => {
      // 错开发送，避免多张同时发瞬间撞免费额度的每分钟限流
      if (i > 0) await new Promise((r) => setTimeout(r, i * 2500));
      const prompt = buildPrompt({ ...params, variationIndex: i });
      try {
        const raw = await generateImage(settings, prompt, modelInput, mode.needsImage ? null : aspect, (waitSec, attempt) =>
          updateSlot(slot.id, { note: `被限流，${waitSec} 秒后自动重试（第 ${attempt}/3 次）…` })
        );
        let dataUrl = await compressForStorage(raw);

        // 双通道：非精修模式自动追加一道真实感精修 pass，对齐精修模式的出图水准
        if (autoPolish && ['sketch', 'restyle', 'empty'].includes(modeId)) {
          updateSlot(slot.id, { note: '第 2 道 · 真实感精修中…' });
          try {
            const polished = await generateImage(settings, ENHANCE_PROMPT, dataUrlToInput(dataUrl), null, (waitSec, attempt) =>
              updateSlot(slot.id, { note: `第 2 道被限流，${waitSec} 秒后重试（${attempt}/3）…` })
            );
            dataUrl = await compressForStorage(polished);
          } catch {
            /* 第二道失败就保留第一道的结果，不让整张图失败 */
          }
        }

        updateSlot(slot.id, { status: 'done', dataUrl, note: null });
        return { ok: true, dataUrl };
      } catch (e) {
        updateSlot(slot.id, { status: 'error', error: e.message });
        return { ok: false };
      }
    });

    const results = await Promise.all(tasks);
    setBusy(false);

    const outputs = results.filter((r) => r.ok).map((r) => r.dataUrl);
    if (outputs.length) {
      const record = {
        id: uid(),
        ts: Date.now(),
        modeId,
        roomId,
        styleId,
        extra: extra.trim(),
        inputThumb: inputImage ? await makeThumb(inputImage.dataUrl) : null,
        inputFull: inputImage ? inputImage.dataUrl : null,
        outputs,
        fav: false,
      };
      await saveRecord(record);
      setHistory(await listHistory());
    } else {
      setNotice({ type: 'error', text: '本次全部失败了，看看每张图上的错误提示' });
    }
  }

  /** 二次渲染：构图不变，只提升摄影真实感 */
  async function handleEnhance(slotId) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot?.dataUrl || busy) return;
    if (!settings.apiKey) {
      setShowSettings(true);
      return;
    }
    const prevUrl = slot.dataUrl;
    updateSlot(slotId, { status: 'loading', note: '增强真实感中，约 15 秒…' });
    try {
      const raw = await generateImage(settings, ENHANCE_PROMPT, dataUrlToInput(prevUrl), null, (w, a) =>
        updateSlot(slotId, { note: `被限流，${w} 秒后自动重试（第 ${a}/3 次）…` })
      );
      const dataUrl = await compressForStorage(raw);
      updateSlot(slotId, { status: 'done', dataUrl, note: null });
      setNotice({ type: 'ok', text: '已增强 — 影子、纹理和光感都重新渲染了' });
    } catch (e) {
      updateSlot(slotId, { status: 'done', dataUrl: prevUrl, note: null });
      setNotice({ type: 'error', text: `增强失败：${e.message}` });
    }
  }

  /** 「极致真实」二次精炼：fal.ai 扩散精炼 + 2x 放大，洗掉 AI 光滑感 */
  async function handleRefine(slotId) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot?.dataUrl) return;
    if (!settings.falKey) {
      setShowSettings(true);
      setNotice({ type: 'warn', text: '先在设置里配置 fal.ai key（📸 极致真实引擎那一栏）' });
      return;
    }
    const prevUrl = slot.dataUrl;
    updateSlot(slotId, { status: 'loading', note: '📸 极致真实精炼中…' });
    try {
      const compact = await shrinkDataUrl(prevUrl);
      const raw = await refineImage(settings.falKey, compact, (text) => updateSlot(slotId, { note: `📸 ${text}` }));
      updateSlot(slotId, { status: 'done', dataUrl: raw, note: null });
      setNotice({ type: 'ok', text: '精炼完成 — 已放大 2 倍并重铺照片级纹理' });
    } catch (e) {
      updateSlot(slotId, { status: 'done', dataUrl: prevUrl, note: null });
      setNotice({ type: 'error', text: `精炼失败：${e.message}` });
    }
  }

  /** 把某张结果图设为新的输入，继续迭代 */
  function handleIterate(dataUrl) {
    setImage(dataUrlToInput(dataUrl));
    setModeId('edit');
    setExtra('');
    setNotice({ type: 'ok', text: '已把这张图设为底图 — 写一句指令继续改（如：换成暖色灯光）' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleToggleFav(id, fav) {
    await updateRecord(id, { fav });
    setHistory(await listHistory());
  }

  async function handleDeleteRecord(id) {
    await deleteRecord(id);
    setHistory(await listHistory());
  }

  /** 从历史记录恢复输入图 */
  function handleReuseInput(record) {
    if (record.inputFull) {
      setImage(dataUrlToInput(record.inputFull));
      setModeId(record.modeId);
      setRoomId(record.roomId);
      setStyleId(record.styleId);
      setShowHistory(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div className="min-h-screen">
      <Header
        view={view}
        setView={setView}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHistory={() => setShowHistory(true)}
        hasKey={!!settings.apiKey}
        historyCount={history.length}
      />

      {notice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-lg text-sm font-medium bg-sail-ink text-sail-paper">
          {notice.text}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 pb-24 pt-6">
        {view === 'render' ? (
          <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
            <Controls
              mode={mode}
              modeId={modeId}
              setModeId={setModeId}
              image={image}
              setImage={setImage}
              refImage={refImage}
              setRefImage={setRefImage}
              polishScopeId={polishScopeId}
              setPolishScopeId={setPolishScopeId}
              roomId={roomId}
              setRoomId={setRoomId}
              styleId={styleId}
              setStyleId={setStyleId}
              lightingId={lightingId}
              setLightingId={setLightingId}
              fidelityId={fidelityId}
              setFidelityId={setFidelityId}
              aspect={aspect}
              setAspect={setAspect}
              extra={extra}
              setExtra={setExtra}
              count={count}
              setCount={setCount}
              autoPolish={autoPolish}
              setAutoPolish={setAutoPolish}
              busy={busy}
              onGenerate={handleGenerate}
            />
            <div ref={resultsRef}>
              <Results
                slots={slots}
                inputImage={mode.needsImage ? image : null}
                onIterate={handleIterate}
                onEnhance={handleEnhance}
                onRefine={handleRefine}
                busy={busy}
                watermark={settings.watermark}
              />
            </div>
          </div>
        ) : (
          <MoodBoard settings={settings} onOpenSettings={() => setShowSettings(true)} notify={setNotice} />
        )}
      </main>

      {showSettings && (
        <SettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />
      )}

      {showHistory && (
        <HistoryPanel
          history={history}
          watermark={settings.watermark}
          onClose={() => setShowHistory(false)}
          onToggleFav={handleToggleFav}
          onDelete={handleDeleteRecord}
          onReuseInput={handleReuseInput}
          onIterate={(dataUrl) => {
            setShowHistory(false);
            handleIterate(dataUrl);
          }}
        />
      )}
    </div>
  );
}
