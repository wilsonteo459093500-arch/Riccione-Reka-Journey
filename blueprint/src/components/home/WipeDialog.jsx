// 「清除本机全部资料」确认框：先说清楚会删掉什么、建议先全部备份；打「清除」两个字才能按。
// 删完重新载入页面 → 回到登录页（登录也清掉了）。

import React, { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Modal, cls } from '../../lib/ui.jsx';
import { wipeLocalData } from '../../lib/wipe.js';

const WORD = '清除';

export default function WipeDialog({ projectCount, onClose }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    if (typed.trim() !== WORD || busy) return;
    setBusy(true);
    setError('');
    try {
      const { failed } = await wipeLocalData();
      if (failed.length) {
        setError('有一部分没能删掉（可能还有 UKIR STUDIO 分页开着）—— 关掉别的分页，再按一次。');
        setBusy(false);
        return;
      }
      window.location.replace(`${window.location.pathname}#/`);
      window.location.reload();
    } catch (e) {
      setError(e?.message || '清除失败');
      setBusy(false);
    }
  }

  return (
    <Modal title="清除这台电脑上的全部资料？" icon={<AlertTriangle size={18} className="text-bp-danger" />} onClose={onClose} busy={busy} width="max-w-md"
      footer={
        <>
          <div className="flex-1" />
          <button type="button" onClick={onClose} disabled={busy} className={cls.btnGhost}>
            取消
          </button>
          <button type="button" onClick={go} disabled={busy || typed.trim() !== WORD} className={cls.btnDanger} data-testid="wipe-go">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            全部清除
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-bp-muted leading-relaxed">
        <p>UKIR STUDIO 在这台电脑、这个浏览器里的东西会全部删掉：</p>
        <ul className="list-disc pl-5 text-xs space-y-0.5">
          <li>{projectCount} 个项目，连同里面的图片和 Material Board 封面画板</li>
          <li>独立 Material Board 的画板和「我的材质库」</li>
          <li>备份记录、AI key、登录（删完要重新登录）</li>
        </ul>
        <p className="text-xs">
          <b className="font-medium text-bp-danger">删了就找不回来</b>，除非你有备份。还没备份的话，先关掉这个窗口，按「全部备份」。
          已经下载 / 存进资料夹的备份档不会被删。
        </p>
        <p className="text-xs">用在：这台电脑要交给别人，或者以后不在这台电脑上做提案。别的 UKIR STUDIO 分页要先关掉。</p>
        <label className="block">
          <span className={cls.label}>确定的话，在下面打「{WORD}」两个字</span>
          <input
            className={`${cls.input} mt-1`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            disabled={busy}
            placeholder={WORD}
            data-testid="wipe-word"
            autoFocus
          />
        </label>
        {error && (
          <div className="rounded-xl bg-bp-danger/10 text-bp-danger text-xs p-2.5" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
