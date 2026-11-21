// 柜子细节 · 第 2a 阶段：每组一个色 + 柜门 / 抽屉面 / 柜体 / 侧板 / 开放格 / 踢脚分开 + 4 个一键搭配。
// 只有设计师看得到面板（StudioApp：staffView && !WISH 才有入口）；方案里有柜子设定（project.cab）时客人也会下载这一块，
// 但只是让 3D 按分组上色（open = false：不画面板）。
//
// 这个组件自己管引擎那一半（CabRuntime）：装上 → 跟着方案同步（撤销 / 重做 / 换方案都只是方案变了）→ 卸掉时还原。
// 存：commit({ cab })（StudioApp 的 commit：进撤销、自动保存、分享链接都带）。

import './words.js';
import './cabinet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { t, L, isEn } from '../../shared/i18n.js';
import { tagsOf } from '../../shared/moods.js';
import { AVOID_LABEL } from '../../shared/summary.js';
import { MAT_BY_ID, BOARDS, onBoards } from '../../shared/materials.js';
import { swatchURL } from '../../shared/textures.js';
import { Icon, listSep } from '../ui/kit.jsx';
import { CabRuntime, ensureSeeds, known } from './runtime.js';
import { GROUP_BY_ID, PART_BY_ID, PRESETS, groupsIn, GROUPS, partInfo, setPart, applyPreset, presetOf, presetBoards, realOf, seedKeyOf } from './model.js';

/** 每组面板上有哪几个部分（那一组的柜子上真的有的）。书柜、展示柜这类没有门的：第一项叫「整体」 */
const GROUP_PARTS = {
  base: ['door', 'drawer', 'body', 'side', 'plinth'],
  wall: ['door', 'body', 'side'],
  tall: ['door', 'body', 'side', 'plinth'],
  island: ['door', 'body', 'side', 'plinth'],
  tv: ['door', 'body', 'side'],
  wardrobe: ['door', 'body', 'side', 'plinth'],
  shoe: ['door', 'body', 'side', 'open'],
  book: ['door', 'body', 'side', 'open', 'plinth'],
  vanity: ['door', 'body', 'side'],
  other: ['door', 'body', 'side', 'open', 'plinth'],
};
const WHOLE = { book: 1 };

/** 一块板显示成什么：手册颜色的板在这台设备上有真的 → 真的那块；没有 → 手册上的名字 + 「示意色」 */
function boardView(id) {
  const real = realOf(id, BOARDS);
  const m = known(real) ? MAT_BY_ID[real] : known(id) ? MAT_BY_ID[id] : null;
  return { id: m ? m.id : null, name: m ? L(m) : '', code: m?.board?.code || '', sample: !!seedKeyOf(real) };
}

function Chip({ id, size = '' }) {
  return <span className={`sample ${size} cab-chip ${id ? '' : 'none'}`}>{id && <img src={swatchURL(id, 96) || ''} alt="" draggable={false} />}</span>;
}

export default function Cab({ engine, project, open, commit, flash, onClose }) {
  const rt = useRef(null);
  const syncRef = useRef(null);
  const latest = useRef(project);
  latest.current = project;
  const [sel, setSel] = useState(null); // { group, part }
  const [, bump] = useState(0);
  ensureSeeds();

  // 引擎那一半：装上 / 卸掉
  useEffect(() => {
    if (!engine) return undefined;
    const r = new CabRuntime(engine);
    rt.current = r;
    // 同步出错（坏掉的方案资料）也要走到下面的 return：不然口子装着卸不掉
    const sync = () => {
      const p = latest.current;
      try {
        r.locked = !!p.locked?.cabinetry;
        r.sync({ cab: p.cab, materials: p.materials });
      } catch (err) {
        if (import.meta.env?.DEV) console.error('[cab]', err);
      }
    };
    syncRef.current = sync;
    r.activate();
    sync();
    // 板材登记好 / 变了（本机板材包读好、员工导入了板材）：手册颜色换成真的、顶着的换回来
    const off = onBoards(() => {
      sync();
      bump((n) => n + 1);
    });
    return () => {
      off();
      r.deactivate();
      rt.current = null;
    };
  }, [engine]);

  // 方案变了（改了一组、套了搭配、撤销 / 重做、换了全屋的柜体色）
  useEffect(() => {
    syncRef.current?.();
  }, [project.cab, project.materials, project.furniture, project.locked]);

  // 面板关着（客人、走进去、演示）就没有「选着的那一组」
  const active = open ? sel : null;
  useEffect(() => {
    const r = rt.current;
    if (!r) return;
    r.sel = active;
  }, [active]);

  // 板材栏 / 拖到柜子上 / 走进去刷色 → 这一组的这个部分
  useEffect(() => {
    const r = rt.current;
    if (!r) return undefined;
    // 走到这里的都是能上柜子的材质、柜子也没锁（runtime.drop 先挡掉了：那两种照原来的路走）
    r.onSet = (group, part, matId) => {
      const p = latest.current;
      commit({ cab: setPart(p.cab, group, part, matId) });
      // 客人说过不要的（雷区）：和换别的表面一样提醒一句
      const tags = tagsOf(MAT_BY_ID[matId]);
      const hit = (p.profile?.avoid || []).filter((k) => tags.has(k));
      if (hit.length) flash(t('{0} 说过不要「{1}」—— 想试试也可以，按撤销就能还原', [p.profile?.name || t('这位客人'), hit.map((k) => t(AVOID_LABEL[k] || k)).join(listSep())]), 4800);
      else flash(t('{0} · {1} → {2}', [N(GROUP_BY_ID[group]), partName(group, part), boardView(matId).name]));
    };
    return () => {
      r.onSet = null;
    };
  }, [engine, commit, flash]);

  const here = useMemo(() => groupsIn(project.furniture), [project.furniture]);
  const curPreset = useMemo(() => presetOf(project.cab, project.furniture), [project.cab, project.furniture]);
  if (!open) return null;

  const missing = GROUPS.filter((g) => !here.some((h) => h.id === g.id));
  const pick = (group, part) => {
    setSel(group ? { group, part } : null);
    if (group) rt.current?.flashGroup(group);
  };
  const clear = (group, part) => {
    commit({ cab: setPart(project.cab, group, part, null) });
    flash(t('{0} · {1} 跟回去了', [N(GROUP_BY_ID[group]), partName(group, part)]));
  };
  const usePreset = (P) => {
    // 这个搭配要动的组，这个家一组都没有（双色厨房、家里没有厨房）
    if (P.id !== 'one' && !Object.keys(P.set).some((g) => here.some((h) => h.id === g))) return flash(t('这个家没有「{0}」用得到的柜子', [N(P)]));
    const cab = applyPreset(P.id, { cab: project.cab, furniture: project.furniture });
    const next = { cab };
    if (project.locked?.cabinetry && cab) {
      const { cabinetry: _gone, ...rest } = project.locked;
      next.locked = rest;
    }
    commit(next);
    setSel(null);
    flash(t('已套用「{0}」', [N(P)]));
  };
  let anySample = false;

  return (
    <aside className="panel glass cab-panel" aria-label={t('每组一个色')}>
      <div className="cab-inner">
        <header className="cab-head">
          <div>
            <p className="eyebrow">{t('柜子 · 颜色')}</p>
            <h2 className="mp-title">{t('每组一个色')}</h2>
          </div>
          <button type="button" className="ibtn sm" onClick={() => onClose(false)} aria-label={t('关闭')} title={t('关闭')}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {project.locked?.cabinetry && (
          <p className="cab-note">
            <Icon name="lock" size={14} />
            <span>
              {t('柜子是你家原有的')} · {t('换了颜色就不再算「保留原有」。')}
            </span>
          </p>
        )}

        <h3 className="cab-sub">{t('一键搭配')}</h3>
        <div className="cab-presets" role="group" aria-label={t('一键搭配')}>
          {PRESETS.map((P) => {
            const chips = presetBoards(P).map((b) => boardView(b.id));
            const on = curPreset === P.id;
            return (
              <button key={P.id} type="button" className={`cab-preset ${on ? 'on' : ''}`} aria-pressed={on} data-sfx="apply" data-preset={P.id} onClick={() => usePreset(P)} title={chips.length ? chips.map((c) => c.name).join(' + ') : t('现在的柜体色')}>
                <b>{N(P)}</b>
                <span className="cab-bars" aria-hidden="true">
                  {(chips.length ? chips : [{ id: project.materials.cabinetry }]).map((c, i) => (
                    <i key={i}>{c.id && <img src={swatchURL(c.id, 48) || ''} alt="" draggable={false} />}</i>
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <h3 className="cab-sub">{t('这个家的柜子')}</h3>
        {here.length === 0 && <p className="cab-empty">{t('这个家还没有定制柜')}</p>}
        <ul className="cab-groups">
          {here.map((g) => {
            const main = partInfo(project.cab, project.materials, g.id, 'door', g.slot);
            const v = boardView(main.matId);
            anySample = anySample || v.sample;
            const openRow = active?.group === g.id;
            return (
              <li key={g.id} className={`cab-group ${openRow ? 'open' : ''}`} data-group={g.id}>
                <button type="button" className="cab-row" aria-expanded={openRow} onClick={() => (openRow ? pick(null) : pick(g.id, 'door'))}>
                  <Chip id={v.id} />
                  <span className="cab-txt">
                    <b>{N(g)}</b>
                    <em>
                      {main.own ? v.name : t('跟全屋的柜体色')}
                      {main.own && v.sample && <u>{t('示意色')}</u>}
                    </em>
                  </span>
                  <span className="cab-act">{openRow ? t('收起') : t('换')}</span>
                </button>
                {openRow && (
                  <ul className="cab-parts">
                    {GROUP_PARTS[g.id].map((pid) => {
                      const info = partInfo(project.cab, project.materials, g.id, pid, g.slot);
                      const pv = boardView(info.matId);
                      anySample = anySample || (info.own && pv.sample);
                      const on = active.part === pid;
                      const follow = pid === 'plinth' ? t('黑色') : info.from === 'body' ? t('跟柜体') : pid === 'door' ? t('跟全屋的柜体色') : t('跟柜门');
                      return (
                        <li key={pid} className={`cab-part ${on ? 'on' : ''}`} data-part={pid}>
                          <button type="button" className="cab-prow" aria-pressed={on} onClick={() => pick(g.id, pid)}>
                            <Chip id={pid === 'plinth' && !info.own ? null : pv.id} size="xs" />
                            <span className="cab-txt">
                              <b>{partName(g.id, pid)}</b>
                              <em>
                                {info.own ? pv.name : follow}
                                {info.own && pv.code && <code>{pv.code}</code>}
                              </em>
                            </span>
                            {!info.own && <span className="cab-act">{pid === 'door' || pid === 'plinth' ? t('换') : t('分开')}</span>}
                          </button>
                          {info.own && (
                            <button type="button" className="cab-back" onClick={() => clear(g.id, pid)}>
                              {t('跟回去')}
                            </button>
                          )}
                        </li>
                      );
                    })}
                    <li className="cab-hint">{t('选好了「{0} · {1}」：点下面的板材，或把板材拖到柜子上', [N(g), partName(g.id, active.part)])}</li>
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        {missing.length > 0 && here.length > 0 && <p className="cab-foot">{t('这个家没有：{0}', [missing.map((g) => N(g)).join('、')])}</p>}
        {anySample && <p className="cab-foot">{t('标「示意色」的板材这台设备还没导入贴图，先用手册上的颜色；导入后自动换成真的。')}</p>}
      </div>
    </aside>
  );
}

/** 组、部分、搭配的名字：用 model.js 自己的那一对（L() 会先查总词典 ——「柜体」在那里是 Cabinetry，这里要的是 Carcass） */
const N = (o) => (isEn() ? o.en : o.zh);

/** 部分的名字（书柜这类没有门的，第一项叫「整体」） */
function partName(group, part) {
  return part === 'door' && WHOLE[group] ? t('整体') : N(PART_BY_ID[part]);
}
