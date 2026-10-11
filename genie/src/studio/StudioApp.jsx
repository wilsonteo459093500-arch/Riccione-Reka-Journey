// 3D 梦想工作室 —— 主界面。
// 路由：studio.html                上次的方案（第一次来：直接打开示范户型，3 秒内看到东西 = 系统 1 的「哇」）
//       studio.html#p=<档案>       从占卜蓝图进来：套用客人的材质、收纳、生活习惯
//       studio.html#s=<方案>       别人分享的方案（打开后存成自己的一份）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Engine } from './engine/Engine.js';
import { buildWalls, templatePlan, uid } from './plan/model.js';
import { furnish } from './engine/furnish.js';
import { CATALOG } from './engine/furniture.js';
import { createProject, loadProjects, saveProject, currentProject, packProject, unpackProject, getUnderlay, putUnderlay } from './store.js';
import { unpackJSON, packJSON } from '../shared/profile.js';
import { MOOD_BY_ID } from '../shared/moods.js';
import { DREAMER_BY_CODE } from '../shared/dreamers.js';
import { MAT_BY_ID, fits, misfitHint, DEFAULT_SLOT_FOR_CAT, SLOT_BY_ID } from '../shared/materials.js';
import { BRAND } from '../shared/config.js';
import { DAY_PRESETS } from './engine/daylight.js';
import MoodPanel from './ui/MoodPanel.jsx';
import DaylightPanel from './ui/DaylightPanel.jsx';
import MaterialDock from './ui/MaterialDock.jsx';
import Callouts from './ui/Callouts.jsx';
import SunArc from './ui/SunArc.jsx';
import Toolbar from './ui/Toolbar.jsx';
import { HoverTip, SelectionBar } from './ui/ItemUI.jsx';
import StartModal from './ui/StartModal.jsx';
import ShareModal from './ui/ShareModal.jsx';
import HelpModal from './ui/HelpModal.jsx';
import SettingsModal from './ui/SettingsModal.jsx';
import PlanEditor from './plan/PlanEditor.jsx';
import { isWishMode, tellShell } from '../shared/zen.js';

const WISH = isWishMode();

const HISTORY = 60;
const snap = (p) => ({ materials: { ...p.materials }, furniture: p.furniture.map((f) => ({ ...f })), time: p.time, mood: p.mood });

export default function StudioApp() {
  const host = useRef(null);
  const engine = useRef(null);
  const [project, setProject] = useState(null);
  const projRef = useRef(null);
  projRef.current = project;
  const past = useRef([]);
  const future = useRef([]);
  const [, bump] = useState(0);
  const [ready, setReady] = useState(false);
  const [anchors, setAnchors] = useState([]);
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selPos, setSelPos] = useState(null);
  const [slot, setSlot] = useState(null);
  const [labels, setLabels] = useState(true);
  const [wallMode, setWallMode] = useState('cut');
  const [view, setView] = useState('iso');
  const [thumbs, setThumbs] = useState([]);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [demo, setDemo] = useState(false);
  const [panels, setPanels] = useState(() => (innerWidth > 900 ? 'open' : 'closed'));
  const [planDraft, setPlanDraft] = useState(null);
  const [incomingProfile, setIncomingProfile] = useState(null);
  const [bpLink, setBpLink] = useState('');
  const toastTimer = useRef(0);

  const flash = useCallback((t, ms = 2200) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), ms);
  }, []);

  // ── 引擎 ──
  useEffect(() => {
    const e = new Engine(host.current, {
      onAnchors: (a) => setAnchors(a),
      onHover: (h) => setHover(h),
      onSelect: (id) => setSelected(id),
      onSelMove: (p) => setSelPos(p),
      onMove: (id, x, z) => updateFurniture((list) => list.map((f) => (f.id === id ? { ...f, x: +x.toFixed(3), z: +z.toFixed(3) } : f)), true),
      onInteract: () => setDemo(false),
    });
    engine.current = e;
    window.__genie = e;
    boot();
    return () => e.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    const h = location.hash.slice(1);
    let p = null;
    try {
      if (h.startsWith('p=')) {
        const prof = await unpackJSON(h.slice(2));
        if (prof?.code) {
          setIncomingProfile(prof);
          const existing = loadProjects().find((x) => x.profile?.id === prof.id);
          p = existing || createProject({ plan: templatePlan('condo3'), profile: prof });
          // 许愿模式：客人直接看到自己的家（示范户型 + 他的材质），设计师再用 ✏️ 换成真实平面图
          if (!existing && !WISH) setModal('start');
        }
      } else if (h.startsWith('s=')) {
        p = await unpackProject(h.slice(2));
        flash('已打开分享的方案（改动会存成你自己的一份）', 3200);
      }
    } catch {
      flash('链接打不开，先给你看示范户型');
    }
    if (!p) p = currentProject();
    if (!p) {
      p = createProject({ plan: templatePlan('condo3'), mood: 'cozy' });
      setTimeout(() => flash('这是示范户型 —— 点右上角 ✏️ 上传你的平面图', 4200), 1600);
    }
    history.replaceState(null, '', location.pathname + location.search);
    loadProjectIntoEngine(p, true);
    tellShell('page', { page: 'studio' });
  }

  function loadProjectIntoEngine(p, frame = true) {
    const e = engine.current;
    const walls = buildWalls(p.plan);
    const d = p.profile && DREAMER_BY_CODE[p.profile.code];
    e.setScene({
      plan: p.plan,
      walls,
      furniture: p.furniture,
      materials: p.materials,
      time: p.time,
      title: p.profile?.name ? `${String(p.profile.name).toUpperCase()} · DREAM HOME` : BRAND.plinth,
      subtitle: d ? `${d.num} ${d.zh} · ${d.en}` : 'WISH by RICCIONE REKA',
      frame,
    });
    e.setWallMode(wallMode);
    past.current = [];
    future.current = [];
    setProject(p);
    setSelected(null);
    setReady(true);
    scheduleThumbs();
    if (p.profile) packJSON(p.profile).then((s) => setBpLink(new URL(`quiz.html${WISH ? '?mode=wish' : ''}#bp=${s}`, location.href).href));
    else setBpLink('');
  }

  // ── 自动保存 ──
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => saveProject(project), 500);
    return () => clearTimeout(t);
  }, [project]);

  // ── 日光小图（材质变了就重画，防抖） ──
  const thumbTimer = useRef(0);
  const scheduleThumbs = useCallback(() => {
    clearTimeout(thumbTimer.current);
    thumbTimer.current = setTimeout(() => {
      if (!engine.current) return;
      setThumbs(engine.current.thumbs(DAY_PRESETS.map((d) => d.hour)));
    }, 900);
  }, []);

  // ── 历史 ──
  const commit = useCallback((next) => {
    const cur = projRef.current;
    if (!cur) return;
    past.current.push(snap(cur));
    if (past.current.length > HISTORY) past.current.shift();
    future.current = [];
    setProject({ ...cur, ...next });
    bump((n) => n + 1);
  }, []);

  const restore = (s) => {
    const cur = projRef.current;
    const e = engine.current;
    e.setMaterials(s.materials);
    e.setFurniture(s.furniture);
    e.setTime(s.time);
    setProject({ ...cur, ...s });
    scheduleThumbs();
  };
  const undo = () => {
    const s = past.current.pop();
    if (!s) return;
    future.current.push(snap(projRef.current));
    restore(s);
    bump((n) => n + 1);
  };
  const redo = () => {
    const s = future.current.pop();
    if (!s) return;
    past.current.push(snap(projRef.current));
    restore(s);
    bump((n) => n + 1);
  };

  // ── 命令 ──
  const applyMaterial = useCallback(
    (slotId, matId) => {
      const cur = projRef.current;
      if (!cur || cur.materials[slotId] === matId) return;
      engine.current.setMaterial(slotId, matId);
      commit({ materials: { ...cur.materials, [slotId]: matId }, mood: 'custom' });
      scheduleThumbs();
    },
    [commit, scheduleThumbs]
  );

  const applyMood = (id) => {
    const cur = projRef.current;
    let materials;
    let time;
    if (id === 'dreamer' && cur.profile) {
      const d = DREAMER_BY_CODE[cur.profile.code];
      materials = { ...MOOD_BY_ID.cozy.materials, ...cur.profile.materials };
      time = MOOD_BY_ID[d?.mood]?.time ?? 18.4;
    } else {
      materials = { ...MOOD_BY_ID[id].materials };
      time = MOOD_BY_ID[id].time;
    }
    engine.current.setMaterials(materials);
    engine.current.setTime(time);
    commit({ materials, time, mood: id });
    scheduleThumbs();
  };

  const timeMsg = useRef(0);
  const setTime = (h) => {
    engine.current.setTime(h);
    setProject((p) => ({ ...p, time: h }));
    clearTimeout(timeMsg.current);
    timeMsg.current = setTimeout(() => tellShell('time', { hour: h }), 300);
  };

  function updateFurniture(fn, fromEngine = false) {
    const cur = projRef.current;
    if (!cur) return;
    const furniture = fn(cur.furniture);
    engine.current.setFurniture(furniture);
    void fromEngine;
    commit({ furniture });
  }

  const rotateItem = (id) => updateFurniture((l) => l.map((f) => (f.id === id ? { ...f, rot: ((f.rot || 0) + 90) % 360 } : f)));
  const removeItem = (id) => {
    updateFurniture((l) => l.filter((f) => f.id !== id));
    engine.current.select(null);
  };
  const duplicateItem = (id) => {
    const nid = uid('f');
    updateFurniture((l) => {
      const f = l.find((x) => x.id === id);
      return f ? [...l, { ...f, id: nid, x: f.x + 0.4, z: f.z + 0.4 }] : l;
    });
    setTimeout(() => engine.current.select(nid), 30);
  };
  const variantItem = (id) =>
    updateFurniture((l) =>
      l.map((f) => {
        if (f.id !== id) return f;
        const vs = CATALOG[f.kind]?.variants;
        if (!vs) return f;
        return { ...f, variant: vs[(vs.indexOf(f.variant || vs[0]) + 1) % vs.length] };
      })
    );
  const addItem = (kind, clientX, clientY) => {
    const e = engine.current;
    const rect = host.current.getBoundingClientRect();
    const x = clientX ?? rect.left + rect.width / 2;
    const y = clientY ?? rect.top + rect.height / 2;
    const ray = e.rayAt(x, y).ray;
    const p = { x: e.center.x, z: e.center.z };
    const t = -ray.origin.y / ray.direction.y;
    if (t > 0) {
      p.x = ray.origin.x + ray.direction.x * t;
      p.z = ray.origin.z + ray.direction.z * t;
    }
    const room = projRef.current.plan.rooms.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.z >= r.y && p.z <= r.y + r.d);
    const [w, d] = CATALOG[kind].size;
    const id = uid('f');
    const item = { id, kind, room: room?.id || null, x: +p.x.toFixed(2), z: +p.z.toFixed(2), rot: 0, w, d, h: projRef.current.plan.wallH };
    if (kind === 'art') item.y = 1.4;
    updateFurniture((l) => [...l, item]);
    setTimeout(() => e.select(id), 30);
    flash(`${CATALOG[kind].zh} 已放进来 —— 拖一拖换位置`);
  };

  const dropMaterial = (matId, targetSlot) => {
    const mat = MAT_BY_ID[matId];
    const s = targetSlot || (slot && fits(matId, slot) ? slot : DEFAULT_SLOT_FOR_CAT[mat.cat]);
    if (!fits(matId, s)) {
      flash(misfitHint(matId, s));
      return false;
    }
    applyMaterial(s, matId);
    flash(`${SLOT_BY_ID[s].zh} → ${mat.zh}`);
    return true;
  };

  // ── 平面图 ──
  const applyPlan = async (plan, underlay) => {
    const cur = projRef.current;
    const walls = buildWalls(plan);
    const furniture = furnish(plan, walls, cur.profile);
    const next = { ...cur, plan, furniture };
    if (underlay) await putUnderlay(cur.id, underlay);
    setPlanDraft(null);
    loadProjectIntoEngine(next, true);
    flash('3D 已生成 ✨ 家具是按设计师的规则自动摆的，拖一拖就能改');
  };

  const newFromTemplate = (tid) => {
    const cur = projRef.current;
    const p = createProject({ plan: templatePlan(tid), profile: incomingProfile || cur?.profile || null, mood: incomingProfile || cur?.profile ? null : 'cozy' });
    loadProjectIntoEngine(p, true);
    setModal(null);
  };

  const openPlanEditor = async (start = 'current') => {
    const cur = projRef.current;
    const underlay = start === 'current' ? await getUnderlay(cur.id) : null;
    setPlanDraft({ plan: start === 'blank' ? { ...cur.plan, rooms: [], openings: [] } : JSON.parse(JSON.stringify(cur.plan)), underlay, autoUpload: start === 'upload' });
    setModal(null);
  };

  // ── 演示模式：自动环绕 + 时间流动 ──
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.setAutoRotate(demo);
    if (!demo) {
      e.onTick = null;
      return;
    }
    let last = performance.now();
    e.onTick = (t) => {
      const dt = (t - last) / 1000;
      last = t;
      const h = (e.time + dt * 0.9) % 24;
      e.setTime(h);
      setProject((p) => (p ? { ...p, time: h } : p));
      return true;
    };
    return () => {
      e.onTick = null;
    };
  }, [demo]);

  // ── 键盘 ──
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.target.closest('input,textarea,select') || planDraft) return;
      const mod = ev.metaKey || ev.ctrlKey;
      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        ev.shiftKey ? redo() : undo();
      } else if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
      } else if (selected && (ev.key === 'Delete' || ev.key === 'Backspace')) removeItem(selected);
      else if (selected && ev.key.toLowerCase() === 'r') rotateItem(selected);
      else if (ev.key === 'Escape') {
        engine.current.select(null);
        setSlot(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    engine.current?.setWallMode(wallMode);
  }, [wallMode]);

  const selItem = selected && project?.furniture.find((f) => f.id === selected);
  const profile = project?.profile;
  const dreamer = profile && DREAMER_BY_CODE[profile.code];

  const projectsList = useMemo(() => (modal === 'start' ? loadProjects() : []), [modal]);

  return (
    <div className={`studio panels-${panels} ${demo ? 'is-demo' : ''} ${WISH ? 'is-wish' : ''}`}>
      <div className="stage3d" ref={host} />
      {!ready && (
        <div className="boot">
          <div className="boot-ring" />
          <p>正在搭建你的家…</p>
        </div>
      )}

      {ready && project && (
        <>
          <SunArc time={project.time} onTime={setTime} onCommit={() => saveProject(projRef.current)} />
          {labels && !demo && <Callouts anchors={anchors} materials={project.materials} onPick={(s) => setSlot(s)} activeSlot={slot} />}

          <MoodPanel
            project={project}
            dreamer={dreamer}
            slot={slot}
            onSlot={(s) => {
              setSlot(s === slot ? null : s);
              engine.current.highlightSlot(s === slot ? null : s);
              setTimeout(() => engine.current.highlightSlot(null), 900);
            }}
            onMood={applyMood}
            onToggle={() => setPanels((p) => (p === 'open' ? 'closed' : 'open'))}
            chip={
              profile && dreamer ? (
                <a className="dreamer-chip" href={bpLink || '#'} target={WISH ? '_self' : '_blank'} rel="noopener" title="打开梦想家蓝图">
                  <b>{dreamer.num}</b>
                  <span>
                    为 {profile.name || '贵宾'} 定制 · {dreamer.zh}
                    <em>{profile.code}</em>
                  </span>
                </a>
              ) : (
                <a className="dreamer-chip ghost" href="quiz.html" target="_blank" rel="noopener">
                  🔮 先让客人走一次许愿之旅 →
                </a>
              )
            }
          />

          <Toolbar
            canUndo={past.current.length > 0}
            canRedo={future.current.length > 0}
            onUndo={undo}
            onRedo={redo}
            onShot={async () => {
              const blob = await engine.current.snapshot(2);
              const { stampSnapshot } = await import('./ui/stamp.js');
              const out = await stampSnapshot(blob, project);
              const a = document.createElement('a');
              a.href = URL.createObjectURL(out);
              a.download = `WISH-${(project.name || 'concept').replace(/\s+/g, '-')}.png`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              flash('概念图已下载 📸');
            }}
            onShare={() => setModal('share')}
            labels={labels}
            onLabels={() => setLabels((v) => !v)}
            view={view}
            onView={() => {
              const order = ['iso', 'iso2', 'top', 'low', 'back'];
              const nv = order[(order.indexOf(view) + 1) % order.length];
              setView(nv);
              engine.current.frame(nv);
            }}
            wallMode={wallMode}
            onWalls={() => setWallMode((m) => (m === 'cut' ? 'down' : m === 'down' ? 'up' : 'cut'))}
            demo={demo}
            onDemo={() => setDemo((d) => !d)}
            onPlan={() => openPlanEditor('current')}
            onStart={() => setModal('start')}
            onHelp={() => setModal('help')}
            onSettings={() => setModal('settings')}
            wish={WISH}
          />

          <DaylightPanel time={project.time} thumbs={thumbs} onTime={setTime} onCommit={() => saveProject(projRef.current)} />

          <MaterialDock
            project={project}
            slot={slot}
            engine={engine}
            onDrop={dropMaterial}
            onAddItem={addItem}
            onClearSlot={() => setSlot(null)}
          />

          {hover && !selected && !demo && <HoverTip hover={hover} materials={project.materials} />}
          {selItem && selPos && !demo && (
            <SelectionBar
              item={selItem}
              pos={selPos}
              materials={project.materials}
              onRotate={() => rotateItem(selItem.id)}
              onRemove={() => removeItem(selItem.id)}
              onDuplicate={() => duplicateItem(selItem.id)}
              onVariant={CATALOG[selItem.kind]?.variants ? () => variantItem(selItem.id) : null}
              onClose={() => engine.current.select(null)}
            />
          )}

          <footer className="foot">
            <div className="brand-foot">
              <b>{BRAND.app}</b> {BRAND.by}
            </div>
          </footer>
        </>
      )}

      {modal === 'start' && (
        <StartModal
          profile={incomingProfile || profile}
          projects={projectsList}
          onTemplate={newFromTemplate}
          onUpload={() => openPlanEditor('upload')}
          onDraw={() => openPlanEditor('blank')}
          onOpen={(p) => {
            loadProjectIntoEngine(p, true);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'share' && <ShareModal project={project} pack={() => packProject(project)} onShot={() => setModal(null)} onClose={() => setModal(null)} />}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} quality={engine.current?.quality} onQuality={(q) => engine.current.setQuality(q)} />}

      {planDraft && (
        <PlanEditor
          initial={planDraft.plan}
          underlay={planDraft.underlay}
          autoUpload={planDraft.autoUpload}
          onCancel={() => setPlanDraft(null)}
          onApply={applyPlan}
          onSettings={() => setModal('settings')}
        />
      )}

      {toast && <div className="s-toast">{toast}</div>}
      {demo && (
        <button type="button" className="demo-exit" onClick={() => setDemo(false)}>
          演示中 · 点任意处退出
        </button>
      )}
    </div>
  );
}
