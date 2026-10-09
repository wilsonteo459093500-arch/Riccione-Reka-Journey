// 我的材质库：分类 / 上传 / AI 生成无缝样片 / 改名 / 删除；点样片 = 加进画板
import React, { useEffect, useRef, useState } from 'react';
import { CloudUpload, Trash2, WandSparkles, LoaderCircle } from 'lucide-react';
import { generateImage } from '../ai/gemini.js';
import { LIB_CATS, SWATCH_PROMPT } from './constants.js';
import { listLibrary, putLibraryItem, removeLibraryItem } from './library.js';
import { fileToBoardImage, compressForStorage, shrinkDataUrl } from './images.js';
import { card, chip, input } from './ui.js';

const uid = () => `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function LibraryPanel({ settings, notify, onOpenSettings, onPick }) {
  const [library, setLibrary] = useState([]);
  const [cat, setCat] = useState('all');
  const [genDesc, setGenDesc] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const fileRef = useRef(null);
  const renameTimers = useRef({});

  useEffect(() => {
    let alive = true;
    listLibrary().then((lib) => alive && setLibrary(lib));
    return () => {
      alive = false;
    };
  }, []);

  async function save(item) {
    const ok = await putLibraryItem(item);
    if (!ok) notify?.({ type: 'warn', text: '材质没能存进本机材质库（存储空间可能不足）' });
  }

  async function addFiles(fileList) {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    for (const file of files) {
      try {
        const { dataUrl } = await fileToBoardImage(file, 640);
        const item = { id: uid(), dataUrl, name: file.name.replace(/\.[^.]+$/, ''), cat: cat === 'all' ? 'other' : cat, ts: Date.now() };
        await save(item);
        setLibrary((prev) => [item, ...prev]);
      } catch (e) {
        notify?.({ type: 'error', text: e.message });
      }
    }
  }

  async function genSwatch() {
    if (!settings?.apiKey) {
      onOpenSettings?.();
      return;
    }
    const desc = genDesc.trim();
    if (!desc || genBusy) return;
    setGenBusy(true);
    try {
      const raw = await generateImage(settings, SWATCH_PROMPT.replace('{DESC}', desc), null, '1:1');
      const dataUrl = await shrinkDataUrl(await compressForStorage(raw), 640);
      const item = { id: uid(), dataUrl, name: desc, cat: cat === 'all' ? 'other' : cat, ts: Date.now() };
      await save(item);
      setLibrary((prev) => [item, ...prev]);
      setGenDesc('');
      notify?.({ type: 'ok', text: '材质样片已生成，存进材质库了' });
    } catch (e) {
      notify?.({ type: 'error', text: `生成失败：${e.message}` });
    } finally {
      setGenBusy(false);
    }
  }

  function rename(id, name) {
    setLibrary((prev) => prev.map((it) => (it.id === id ? { ...it, name } : it)));
    const item = library.find((it) => it.id === id);
    if (!item) return;
    // 打字时合并写入（卸载后定时器照常落盘）
    clearTimeout(renameTimers.current[id]);
    renameTimers.current[id] = setTimeout(() => putLibraryItem({ ...item, name }), 500);
  }

  async function remove(id) {
    clearTimeout(renameTimers.current[id]);
    await removeLibraryItem(id);
    setLibrary((prev) => prev.filter((it) => it.id !== id));
  }

  const filtered = cat === 'all' ? library : library.filter((it) => it.cat === cat);

  return (
    <div className={`${card} space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-bp-ink">我的材质库</div>
        <span className="text-[11px] text-bp-faint">点样片 = 加进画板</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setCat('all')} className={chip(cat === 'all')}>
          全部
        </button>
        {LIB_CATS.map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} className={chip(cat === c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto thin-scroll pr-1">
          {filtered.map((it) => (
            <div key={it.id} className="group">
              <div className="relative rounded-lg overflow-hidden border border-bp-line bg-bp-tint">
                <img
                  src={it.dataUrl}
                  alt={it.name || '材质样片'}
                  className="w-full h-16 object-cover cursor-pointer hover:opacity-85"
                  onClick={() => onPick?.(it)}
                  title="点击加进画板"
                  draggable={false}
                />
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-bp-ink/70 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="从材质库删除"
                >
                  <Trash2 size={10} />
                </button>
              </div>
              <input
                value={it.name}
                onChange={(e) => rename(it.id, e.target.value)}
                placeholder="名称 / 编号"
                className="mt-1 w-full rounded border border-bp-line px-1 py-0.5 text-[10px] text-bp-ink focus:outline-none focus:border-bp-gold"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-bp-faint leading-relaxed">
          {library.length ? '这个分类还没有样片。' : '常用的材质存在这里，换项目也能直接用。'}
        </div>
      )}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-bp-line hover:border-bp-gold text-xs text-bp-faint hover:text-bp-muted"
      >
        <CloudUpload size={13} /> 上传材质照片
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="flex gap-1.5">
        <input
          value={genDesc}
          onChange={(e) => setGenDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && genSwatch()}
          placeholder="AI 生成样片，如：深胡桃直纹木饰面"
          className={`${input} flex-1 text-xs`}
        />
        <button
          type="button"
          onClick={genSwatch}
          disabled={genBusy || (!genDesc.trim() && !!settings?.apiKey)}
          className="px-2.5 py-1.5 rounded-lg bg-bp-gold/15 border border-bp-gold text-bp-ink disabled:opacity-50"
          title={settings?.apiKey ? 'AI 生成无缝材质样片并存进材质库' : '先在设置里填 API key'}
        >
          {genBusy ? <LoaderCircle size={13} className="animate-spin" /> : <WandSparkles size={13} />}
        </button>
      </div>
    </div>
  );
}
