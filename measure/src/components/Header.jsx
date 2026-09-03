import React from 'react';
import { FolderOpen, HelpCircle, FilePlus2 } from 'lucide-react';
import { Btn } from './ui/Bits.jsx';

export default function Header({ onOpenProjects, onNew, onHelp, projectName, onRename, hasPlan }) {
  return (
    <header className="sticky top-0 z-40 bg-sail-paper/90 backdrop-blur border-b border-sail-line">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="leading-tight whitespace-nowrap">
            <div className="font-display text-lg font-semibold text-sail-green-deep tracking-wide">UKUR</div>
            <div className="text-[9px] tracking-[0.25em] text-sail-faint uppercase">by Riccione Reka</div>
          </div>
          {hasPlan && (
            <input
              value={projectName}
              onChange={(e) => onRename(e.target.value)}
              placeholder="项目名称"
              className="min-w-0 w-40 sm:w-64 px-2 py-1 rounded-lg border border-transparent hover:border-sail-line focus:border-sail-green bg-transparent text-sm outline-none"
            />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {hasPlan && (
            <Btn onClick={onNew} title="换一张户型图">
              <FilePlus2 size={16} />
              <span className="hidden sm:inline">新建</span>
            </Btn>
          )}
          <Btn onClick={onOpenProjects}>
            <FolderOpen size={16} />
            <span className="hidden sm:inline">项目</span>
          </Btn>
          <Btn onClick={onHelp} variant="plain" title="怎么用">
            <HelpCircle size={18} />
          </Btn>
        </div>
      </div>
    </header>
  );
}
