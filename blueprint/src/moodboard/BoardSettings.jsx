// 左侧设置：画板（切换 / 新建 / 删除 / 改名 / 画幅 / 底色）与标题块（下载 PNG 用）
import React from 'react';
import { Plus, Trash2, RotateCcw, ListOrdered } from 'lucide-react';
import { RATIOS, BGS, TITLE_FONTS, TITLE_POSITIONS, TITLE_COLOR_PRESETS } from './constants.js';
import { bgOf } from './layout.js';
import { card, sectionLabel, input, chip, iconBtn } from './ui.js';

/**
 * props: { boards:[{id,name}], activeId, boardName, onRename(name), onSwitch(id), onNew(), onDelete(),
 *          board, onBoardChange(patch) }
 */
export function BoardPanel({ boards, activeId, boardName, onRename, onSwitch, onNew, onDelete, board, onBoardChange, standalone = false }) {
  return (
    <div className={`${card} space-y-4`}>
      <div>
        <div className={sectionLabel}>画板</div>
        <div className="flex gap-1.5">
          <select
            value={activeId || ''}
            onChange={(e) => onSwitch(e.target.value)}
            className="flex-1 min-w-0 rounded-lg border border-bp-line px-2 py-1.5 text-sm bg-white text-bp-ink focus:outline-none focus:border-bp-gold"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {(b.id === activeId ? boardName : b.name) || '未命名画板'}
              </option>
            ))}
          </select>
          <button type="button" onClick={onNew} className={iconBtn} title="新建画板">
            <Plus size={15} />
          </button>
          <button type="button" onClick={onDelete} className={`${iconBtn} hover:text-bp-danger`} title="删除当前画板">
            <Trash2 size={14} />
          </button>
        </div>
        <input
          value={boardName}
          onChange={(e) => onRename(e.target.value)}
          placeholder={standalone ? '画板名称，如：Mr Lau 客厅' : '画板名称，如：方案封面画板'}
          className={`${input} mt-1.5 text-xs`}
        />
      </div>

      <div>
        <div className={sectionLabel}>画幅</div>
        <div className="flex flex-wrap gap-1.5">
          {RATIOS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onBoardChange({ ratioId: r.id })}
              className={`${chip(board.ratioId === r.id)} !text-xs !px-2.5 !py-1.5`}
              title={r.hint}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-bp-faint mt-1.5 leading-relaxed">{standalone ? 'A4 适合打印，方形适合社媒；要当提案封面：左文右图用竖版，满版用 16:9。' : '左文右图封面用竖版，满版封面用 16:9。'}</div>
      </div>

      <div>
        <div className={sectionLabel}>底色</div>
        <div className="flex flex-wrap gap-2">
          {BGS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onBoardChange({ bgId: b.id })}
              className={`w-8 h-8 rounded-full border-2 ${board.bgId === b.id ? 'border-bp-gold ring-2 ring-bp-gold/30' : 'border-bp-line'}`}
              style={{ background: b.color }}
              title={b.label}
              aria-label={b.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** props: { board, onBoardChange(patch), onResetTitles() } */
export function TitlePanel({ board, onBoardChange, onResetTitles, standalone = false }) {
  const ink = bgOf(board.bgId).ink;
  return (
    <div className={`${card} space-y-2.5`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-bp-faint">标题（下载 PNG 用）</div>
        {!standalone && (
          <button
            type="button"
            onClick={onResetTitles}
            className="flex items-center gap-1 text-[11px] text-bp-muted hover:text-bp-ink"
            title="用项目信息里的封面标题 / 客户 · 地点"
          >
            <RotateCcw size={11} /> 用项目信息
          </button>
        )}
      </div>
      <input
        value={board.title}
        onChange={(e) => onBoardChange({ title: e.target.value })}
        placeholder="标题，如：MISS CHUA · THE MINES"
        className={input}
      />
      <input
        value={board.subtitle}
        onChange={(e) => onBoardChange({ subtitle: e.target.value })}
        placeholder="副标题，如：THE DREAM HOUSE JOURNEY"
        className={input}
      />

      <div className="flex flex-wrap gap-1">
        {TITLE_FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onBoardChange({ titleFont: f.id })}
            style={{ fontFamily: f.css }}
            className={chip(board.titleFont === f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-bp-faint shrink-0">字号</span>
        <input
          type="range"
          min="0.6"
          max="1.8"
          step="0.05"
          value={board.titleScale}
          onChange={(e) => onBoardChange({ titleScale: Number(e.target.value) })}
          className="flex-1 accent-[#B8995A]"
        />
        <span className="text-[11px] text-bp-faint w-9 text-right">{Math.round(board.titleScale * 100)}%</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {TITLE_POSITIONS.map((p) => (
          <button key={p.id} type="button" onClick={() => onBoardChange({ titlePos: p.id })} className={chip(board.titlePos === p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-bp-faint shrink-0">颜色</span>
        <button
          type="button"
          onClick={() => onBoardChange({ titleColor: '' })}
          className={`${chip(!board.titleColor)} !px-1.5 !py-0.5 !text-[10px]`}
          title="跟随底色自动（浅底墨色 / 深底暖白）"
        >
          自动
        </button>
        {TITLE_COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onBoardChange({ titleColor: c })}
            className={`w-5 h-5 rounded-full border-2 ${board.titleColor === c ? 'border-bp-gold' : 'border-bp-line'}`}
            style={{ background: c }}
            title={c}
            aria-label={c}
          />
        ))}
        <input
          type="color"
          value={board.titleColor || ink}
          onChange={(e) => onBoardChange({ titleColor: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer border border-bp-line p-0 bg-white"
          title="自定义颜色"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-bp-muted cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={!!board.showLegend}
          onChange={(e) => onBoardChange({ showLegend: e.target.checked })}
          className="w-4 h-4 accent-[#B8995A]"
        />
        <ListOrdered size={13} />
        加编号 + 材质图例清单
      </label>
      <div className="text-[11px] text-bp-faint leading-relaxed">
        {standalone
          ? '标题和图例只出现在下载的 PNG（发 WhatsApp / 社媒 / 打印）。'
          : '标题和图例只出现在下载的 PNG（发 WhatsApp / 社媒）；设为方案封面时不带 —— PPT 里的标题是可编辑文字。'}
      </div>
    </div>
  );
}
