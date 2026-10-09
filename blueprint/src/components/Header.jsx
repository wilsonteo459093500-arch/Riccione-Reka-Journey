// 顶栏：品牌 + （编辑器里）返回项目列表 / 项目名 / 保存状态 / 撤销重做 / 导出 PPT / 设置

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Settings, Download, Undo2, Redo2, Check, Loader2, AlertTriangle } from 'lucide-react';
import { cls } from '../lib/ui.jsx';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const MOD_KEY = isMac ? '⌘' : 'Ctrl+';

function Brand({ compact = false }) {
  return (
    <div className="leading-tight whitespace-nowrap select-none">
      <div className={`font-display font-semibold text-bp-ink tracking-wide ${compact ? 'text-base' : 'text-lg'}`}>UKIR STUDIO</div>
      <div className="text-[9px] tracking-[0.25em] text-bp-faint uppercase">by Riccione Reka</div>
    </div>
  );
}

/** 项目名：看起来像标题，点一下就能改；Enter / 失焦保存，Esc 放弃 */
function NameField({ value, onCommit }) {
  const [draft, setDraft] = useState(value || '');
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value || '');
  }, [value]);
  const skip = useRef(false);
  // 没按 Enter 就关标签页 / 浏览器后退 / 离开编辑器：草稿照样存下（读最新值，不受闭包影响）
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };
  useEffect(() => {
    const flushDraft = () => {
      const { draft: d, value: v, onCommit: c } = latest.current;
      const t = (d || '').trim();
      if (editing.current && !skip.current && t && t !== v) {
        editing.current = false;
        c(t);
      }
    };
    window.addEventListener('pagehide', flushDraft);
    return () => {
      window.removeEventListener('pagehide', flushDraft);
      flushDraft();
    };
  }, []);
  const commit = () => {
    editing.current = false;
    if (skip.current) {
      skip.current = false;
      setDraft(value || '');
      return;
    }
    const v = draft.trim();
    if (v && v !== value) onCommit(v);
    else setDraft(value || '');
  };
  return (
    <input
      value={draft}
      onFocus={(e) => {
        editing.current = true;
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
        else if (e.key === 'Escape') {
          skip.current = true;
          e.currentTarget.blur();
        }
      }}
      placeholder="未命名方案"
      title="点击修改项目名"
      aria-label="项目名"
      data-native-undo=""
      spellCheck={false}
      className="min-w-0 w-full max-w-[22rem] truncate rounded-lg border border-transparent bg-transparent px-2 py-1 font-serif text-[15px] text-bp-ink hover:border-bp-line focus:border-bp-gold focus:bg-white focus:outline-none"
    />
  );
}

function SaveStatus({ state, onRetry }) {
  if (state === 'conflict') {
    return (
      <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1 text-xs text-bp-danger hover:underline whitespace-nowrap" title="项目在别的窗口改过或已删除：刷新载入最新版本">
        <AlertTriangle size={13} /> 已暂停保存 · 刷新
      </button>
    );
  }
  if (state === 'error') {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-xs text-bp-danger hover:underline whitespace-nowrap" title="点一下重新保存">
        <AlertTriangle size={13} /> 保存失败 · 重试
      </button>
    );
  }
  const saving = state === 'pending' || state === 'saving';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-bp-faint whitespace-nowrap" aria-live="polite">
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} className="text-bp-green" />}
      {saving ? '保存中…' : '已保存'}
    </span>
  );
}

function SettingsButton({ onClick, hasKey }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-bp-muted hover:bg-bp-tint hover:text-bp-ink border border-bp-line bg-white"
      title={hasKey ? '设置' : '设置 · 还没填 AI key（可选）'}
      aria-label="设置"
    >
      <Settings size={16} />
      <span className="hidden md:inline">设置</span>
      {!hasKey && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-bp-gold ring-2 ring-bp-paper" />}
    </button>
  );
}

/**
 * @param {{ onOpenSettings:()=>void, hasKey:boolean, onBack?:()=>void, title?:string,
 *   editor?: { name:string, onRename:(n:string)=>void, onBack:()=>void, saveState:string, onRetrySave:()=>void,
 *              onExport:()=>void, canUndo:boolean, canRedo:boolean, onUndo:()=>void, onRedo:()=>void } }} props
 */
export default function Header({ onOpenSettings, hasKey, editor, onBack: onPageBack, title }) {
  if (!editor) {
    return (
      <header className="sticky top-0 z-40 bg-bp-paper/90 backdrop-blur border-b border-bp-line">
        <div className={`${onPageBack ? 'max-w-7xl' : 'max-w-6xl'} mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-2 min-w-0">
            {onPageBack && (
              <button type="button" onClick={onPageBack} className={`${cls.iconBtn} w-9 h-9 shrink-0 -ml-2`} title="回到首页" aria-label="回到首页">
                <ArrowLeft size={18} />
              </button>
            )}
            <Brand />
            {title && <span className="hidden sm:inline pl-3 ml-1 border-l border-bp-line font-serif text-lg text-bp-ink truncate">{title}</span>}
          </div>
          <SettingsButton onClick={onOpenSettings} hasKey={hasKey} />
        </div>
      </header>
    );
  }

  const { name, onRename, onBack, saveState, onRetrySave, onExport, canUndo, canRedo, onUndo, onRedo } = editor;
  return (
    <header className="shrink-0 z-40 bg-bp-paper/95 backdrop-blur border-b border-bp-line">
      <div className="px-3 sm:px-4 h-14 flex items-center gap-2">
        <button type="button" onClick={onBack} className={`${cls.iconBtn} w-9 h-9 shrink-0`} title="回到项目列表" aria-label="回到项目列表">
          <ArrowLeft size={18} />
        </button>
        <div className="hidden lg:block shrink-0 pr-3 mr-1 border-r border-bp-line">
          <Brand compact />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <NameField value={name} onCommit={onRename} />
          <SaveStatus state={saveState} onRetry={onRetrySave} />
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={onUndo} disabled={!canUndo} className={cls.iconBtn} title={`撤销（${MOD_KEY}Z）`} aria-label="撤销">
            <Undo2 size={17} />
          </button>
          <button type="button" onClick={onRedo} disabled={!canRedo} className={cls.iconBtn} title={`重做（${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'}）`} aria-label="重做">
            <Redo2 size={17} />
          </button>
        </div>
        <SettingsButton onClick={onOpenSettings} hasKey={hasKey} />
        <button type="button" onClick={onExport} className={`${cls.btnPrimary} shrink-0`}>
          <Download size={16} />
          导出 PPT
        </button>
      </div>
    </header>
  );
}
