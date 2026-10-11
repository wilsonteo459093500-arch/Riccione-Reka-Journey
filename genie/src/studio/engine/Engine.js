// 3D 引擎：渲染、相机、光（太阳 + 天光 + 夜里的房间灯）、后期（环境光遮蔽 + 辉光）、拾取、拖动家具。
// 只在有变化时才渲染（省电，展厅 iPad 能撑一整天）。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MatLib } from './matlib.js';
import { useLib, buildItem, CATALOG } from './furniture.js';
import { buildHouse, applyCutaway, SHADOW_LAYER } from './house.js';
import { daylight } from './daylight.js';
import { Beams } from './beams.js';
import { MAT_BY_ID } from '../../shared/materials.js';

const VIEWS = {
  iso: { az: 32, el: 50 },
  iso2: { az: -36, el: 50 },
  back: { az: 150, el: 52 },
  top: { az: 0, el: 88 },
  low: { az: 22, el: 30 },
};

const ANCHOR_SLOTS = ['upholstery', 'feature', 'walls', 'floor', 'bedding', 'cabinetry'];

export class Engine {
  constructor(container, cb = {}) {
    this.cb = cb;
    this.container = container;
    const touch = matchMedia('(pointer: coarse)').matches;
    this.quality = touch && Math.min(innerWidth, innerHeight) < 900 ? 'fast' : 'high';

    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(this.quality === 'high' ? 2 : 1.5, devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.className = 'studio-canvas';
    container.appendChild(r.domElement);
    this.renderer = r;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmrem.dispose();

    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = 512;
    this.bgCanvas.height = 256;
    this.bgLayers = makeBackdropLayers();
    this.bgTex = new THREE.CanvasTexture(this.bgCanvas);
    this.bgTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.bgTex;

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: 1.36, minPolarAngle: 0.02, rotateSpeed: 0.55, zoomSpeed: 0.8, screenSpacePanning: false });
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => this.cb.onInteract?.());

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const ss = this.quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(ss, ss);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.sun.shadow.camera.layers.enable(SHADOW_LAYER);
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);

    this.lib = new MatLib(r);
    useLib(this.lib);
    this.root = new THREE.Group();
    this.furn = new THREE.Group();
    this.scene.add(this.root, this.furn);
    this.beams = new Beams();
    this.scene.add(this.beams.group);
    this.roomLights = [];
    this.items = new Map();
    this.itemData = new Map();
    this.pickables = [];
    this.wallMode = 'cut';
    this.time = 18.4;
    this.anchors = {};
    this.selBox = makeRing(0xf4d58d, 0.95);
    this.hovBox = makeRing(0xffffff, 0.55);
    this.scene.add(this.selBox, this.hovBox);

    this.setupComposer();
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.bindEvents();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.dirty = true;
    this.running = true;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setupComposer() {
    if (this.composer) this.composer.dispose?.();
    this.composer = null;
    if (this.quality !== 'high') return;
    const size = this.renderer.getSize(new THREE.Vector2());
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 16 });
    gtao.blendIntensity = 0.85;
    composer.addPass(gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.25, 0.55, 0.92);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.gtao = gtao;
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(q === 'high' ? 2 : 1.25, devicePixelRatio || 1));
    this.sun.shadow.mapSize.set(q === 'high' ? 4096 : 2048, q === 'high' ? 4096 : 2048);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.setupComposer();
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ───────────────────────── 场景 ─────────────────────────

  /** 整个场景重建（换平面图时） */
  setScene({ plan, walls, furniture, materials, time, title, subtitle, frame = true }) {
    this.disposeRoot();
    this.plan = plan;
    this.lib.applyAll(materials);
    const house = buildHouse(plan, walls, this.lib, { title, subtitle });
    this.house = house;
    this.root.add(house.group);
    this.beams.setWindows(house.windows);
    this.setupRoomLights(house.rooms, house.wallH);
    this.fitShadow(house.bounds);
    this.setFurniture(furniture);
    this.setTime(time ?? this.time);
    if (frame) this.frame('iso', false);
    this.lastCut = null;
    this.dirty = true;
  }

  disposeRoot() {
    this.root.traverse((o) => {
      if ((o.isMesh || o.isLine) && o.geometry && !o.geometry.userData?.cached) o.geometry.dispose();
    });
    this.root.clear();
    for (const l of this.roomLights) this.scene.remove(l);
    this.roomLights = [];
  }

  setupRoomLights(rooms, H) {
    const lit = [...rooms].filter((r) => r.type !== 'balcony').sort((a, b) => b.area - a.area).slice(0, this.quality === 'high' ? 9 : 5);
    for (const r of lit) {
      const l = new THREE.PointLight(0xffb36b, 0, Math.max(r.w, r.d) * 1.7 + 1.5, 1.6);
      l.position.set(r.x, H - 0.35, r.z);
      l.userData.base = 3.2 + Math.min(r.area, 30) * 0.22;
      this.scene.add(l);
      this.roomLights.push(l);
    }
  }

  fitShadow(bb) {
    const s = this.sun.shadow.camera;
    const r = Math.hypot(bb.w, bb.d) / 2 + 4;
    s.left = -r;
    s.right = r;
    s.top = r;
    s.bottom = -r;
    s.near = 0.5;
    s.far = r * 4;
    s.updateProjectionMatrix();
    this.center = new THREE.Vector3(bb.cx, 0, bb.cy);
    this.radius = Math.hypot(bb.w, bb.d) / 2;
    this.sun.target.position.copy(this.center);
  }

  /** 家具：按 id 增量更新（只重建变了的那件） */
  setFurniture(items) {
    const ctx = { wallH: this.plan?.wallH || 2.8 };
    const keep = new Set();
    for (const it of items) {
      keep.add(it.id);
      const prev = this.itemData.get(it.id);
      const same = prev && JSON.stringify({ ...prev, x: 0, z: 0, rot: 0 }) === JSON.stringify({ ...it, x: 0, z: 0, rot: 0 });
      if (same) {
        const g = this.items.get(it.id);
        g.position.set(it.x, it.y || 0, it.z);
        g.rotation.y = ((it.rot || 0) * Math.PI) / 180;
      } else {
        if (this.items.has(it.id)) this.furn.remove(this.items.get(it.id));
        const g = buildItem(it, ctx);
        if (!g) continue;
        if (CATALOG[it.kind]?.ceiling) g.position.y = 0;
        this.items.set(it.id, g);
        this.furn.add(g);
      }
      this.itemData.set(it.id, it);
    }
    for (const id of [...this.items.keys()])
      if (!keep.has(id)) {
        this.furn.remove(this.items.get(id));
        this.items.delete(id);
        this.itemData.delete(id);
      }
    this.refreshFeatureMode();
    this.collectPickables();
    this.computeAnchors();
    if (this.selected && !this.items.has(this.selected)) this.select(null);
    this.updateSelBox();
    this.dirty = true;
  }

  refreshFeatureMode() {
    const cat = MAT_BY_ID[this.lib.current.feature]?.cat;
    const slats = cat === 'wood';
    this.furn.traverse((o) => {
      if (o.userData.featureMode) o.visible = (o.userData.featureMode === 'slats') === slats;
    });
  }

  collectPickables() {
    const list = [];
    const add = (o) => {
      if (o.isMesh && o.visible !== false) list.push(o);
    };
    this.root.traverse(add);
    this.furn.traverse(add);
    this.pickables = list;
  }

  setMaterials(materials) {
    this.lib.applyAll(materials);
    this.refreshFeatureMode();
    this.dirty = true;
  }

  setMaterial(slot, matId) {
    this.lib.apply(slot, matId);
    if (slot === 'feature') this.refreshFeatureMode();
    this.dirty = true;
  }

  setTime(hour) {
    this.time = hour;
    const d = daylight(hour, this.plan?.north || 0);
    this.day = d;
    const c = this.center || new THREE.Vector3();
    const R = (this.radius || 8) + 14;
    this.sun.position.set(c.x + d.dir[0] * R, d.dir[1] * R, c.z + d.dir[2] * R);
    this.sun.color.set(d.sunColor);
    this.sun.intensity = d.sunIntensity;
    this.hemi.color.set(d.hemiSky);
    this.hemi.groundColor.set(d.hemiGround);
    this.hemi.intensity = d.hemiIntensity;
    this.renderer.toneMappingExposure = d.exposure;
    this.scene.environmentIntensity = 0.1 + 0.18 * (1 - d.night);
    for (const l of this.roomLights) l.intensity = l.userData.base * d.lamps;
    this.lib.setNight(d.lamps);
    if (this.bloom) this.bloom.strength = 0.18 + 0.5 * d.night;
    this.beams.update(d.dir, d.beams, d.sunColor);
    drawBackdrop(this.bgCanvas, this.bgLayers, d);
    this.bgTex.needsUpdate = true;
    this.dirty = true;
  }

  setWallMode(mode) {
    this.wallMode = mode;
    this.lastCut = null;
    this.dirty = true;
  }

  // ───────────────────────── 相机 ─────────────────────────

  frame(view = 'iso', animate = true) {
    const v = VIEWS[view] || VIEWS.iso;
    const c = this.center || new THREE.Vector3();
    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const wide = this.container.clientWidth > 900;
    const dist = ((this.radius || 8) / Math.sin(Math.min(vf, hf) / 2)) * (wide ? 1.42 : 1.12);
    const az = THREE.MathUtils.degToRad(v.az);
    const el = THREE.MathUtils.degToRad(v.el);
    const target = c.clone().add(new THREE.Vector3(0, -0.2, 0));
    const pos = target.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist));
    this.controls.minDistance = (this.radius || 8) * 0.35;
    this.controls.maxDistance = dist * 2.2;
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.dirty = true;
      return;
    }
    this.tween = { t0: performance.now(), dur: 900, fromP: this.camera.position.clone(), fromT: this.controls.target.clone(), toP: pos, toT: target };
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 0.7;
    this.dirty = true;
  }

  // ───────────────────────── 拾取 ─────────────────────────

  rayAt(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster;
  }

  hitAt(clientX, clientY) {
    const hits = this.rayAt(clientX, clientY).intersectObjects(this.pickables, false);
    for (const h of hits) {
      const o = h.object;
      const mat = Array.isArray(o.material) ? o.material[h.face?.materialIndex ?? 0] : o.material;
      if (mat?.userData?.fixed === 'glass' || mat?.transparent && mat.opacity < 0.3) continue;
      if (!o.visible || !isVisible(o)) continue;
      return { object: o, point: h.point, material: mat };
    }
    return null;
  }

  /** 屏幕上这一点是哪个「表面」 */
  slotAt(clientX, clientY) {
    const h = this.hitAt(clientX, clientY);
    if (!h) return null;
    return h.material?.userData?.slot || h.object.userData.slot || null;
  }

  itemAt(clientX, clientY) {
    const h = this.hitAt(clientX, clientY);
    return h?.object.userData.itemId || null;
  }

  highlightSlot(slot) {
    this.lib.highlight(slot);
    this.dirty = true;
  }

  select(id) {
    this.selected = id;
    this.updateSelBox();
    this.cb.onSelect?.(id);
    this.dirty = true;
  }

  updateSelBox() {
    const g = this.selected && this.items.get(this.selected);
    this.selBox.visible = !!g;
    if (g) fitRing(this.selBox, g);
  }

  bindEvents() {
    const el = this.renderer.domElement;
    let down = null;
    let hoverRaf = 0;
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const id = this.itemAt(e.clientX, e.clientY);
      down = { x: e.clientX, y: e.clientY, id, moved: false, t: performance.now() };
      if (id && CATALOG[this.itemData.get(id)?.kind] && !CATALOG[this.itemData.get(id).kind].wall) {
        const g = this.items.get(id);
        const p = new THREE.Vector3();
        this.rayAt(e.clientX, e.clientY).ray.intersectPlane(this.dragPlane, p);
        down.offset = p ? g.position.clone().sub(p) : new THREE.Vector3();
        down.draggable = true;
        this.controls.enabled = false;
      }
    };
    const onMove = (e) => {
      if (down?.draggable && down.id) {
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (!down.moved && Math.hypot(dx, dy) > 6) {
          down.moved = true;
          this.select(down.id);
          this.cb.onDragStart?.(down.id);
        }
        if (down.moved) {
          const p = new THREE.Vector3();
          if (this.rayAt(e.clientX, e.clientY).ray.intersectPlane(this.dragPlane, p)) {
            const g = this.items.get(down.id);
            const bb = this.house?.bounds;
            let x = Math.round((p.x + down.offset.x) * 20) / 20;
            let z = Math.round((p.z + down.offset.z) * 20) / 20;
            if (bb) {
              x = Math.max(bb.x0, Math.min(bb.x1, x));
              z = Math.max(bb.y0, Math.min(bb.y1, z));
            }
            g.position.x = x;
            g.position.z = z;
            this.updateSelBox();
            this.dirty = true;
          }
        }
        return;
      }
      if (e.buttons) return;
      cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(() => {
        const id = this.itemAt(e.clientX, e.clientY);
        if (id !== this.hovered) {
          this.hovered = id;
          const g = id && this.items.get(id);
          this.hovBox.visible = !!g && id !== this.selected;
          if (g) fitRing(this.hovBox, g);
          this.dirty = true;
        }
        this.cb.onHover?.(id ? { id, item: this.itemData.get(id), x: e.clientX, y: e.clientY } : null);
        el.style.cursor = id ? 'grab' : '';
      });
    };
    const onUp = (e) => {
      if (!down) return;
      this.controls.enabled = true;
      const d = down;
      down = null;
      if (d.moved && d.id) {
        const g = this.items.get(d.id);
        this.cb.onMove?.(d.id, g.position.x, g.position.z);
        return;
      }
      const tap = Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 600;
      if (tap) this.select(d.id || null);
    };
    // capture：比 OrbitControls 先拿到事件，按住家具时不转镜头
    this.container.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', () => {
      this.cb.onHover?.(null);
      if (this.hovered) {
        this.hovered = null;
        this.hovBox.visible = false;
        this.dirty = true;
      }
    });
    this._unbind = () => {
      this.container.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }

  // ───────────────────────── 标签锚点 ─────────────────────────

  computeAnchors() {
    const A = {};
    const kindPoint = (kind, y) => {
      for (const [id, it] of this.itemData) if (it.kind === kind) return new THREE.Vector3(it.x, y, it.z);
      return null;
    };
    A.upholstery = kindPoint('sofa', 0.62) || kindPoint('armchair', 0.6);
    A.feature = kindPoint('tvWall', 1.9) || kindPoint('featureWall', 1.6);
    A.bedding = kindPoint('bed', 0.62) || kindPoint('kidsBed', 0.6);
    A.cabinetry = kindPoint('wardrobe', 1.9) || kindPoint('kitchenRun', 1.8) || kindPoint('shoeCabinet', 1.8);
    const liv = this.plan?.rooms.find((r) => r.type === 'living') || this.plan?.rooms[0];
    if (liv) A.floor = new THREE.Vector3(liv.x + liv.w * 0.3, 0.02, liv.y + liv.d * 0.75);
    // 墙：离默认镜头最远的一面外墙
    let best = null;
    let bestD = Infinity;
    const camDir = new THREE.Vector3(Math.sin(0.56), 0, Math.cos(0.56));
    for (const s of this.house?.wallSets || []) {
      if (!s.outward) continue;
      const w = s.wall;
      const d = s.outward.dot(camDir);
      if (d < bestD - 0.01 || (Math.abs(d - bestD) < 0.01 && w.b - w.a > (best?.b - best?.a || 0))) {
        bestD = d;
        best = w;
      }
    }
    if (best) {
      const m = (best.a + best.b) / 2;
      A.walls = best.axis === 'x' ? new THREE.Vector3(m, 2.0, best.c) : new THREE.Vector3(best.c, 2.0, m);
    }
    this.anchors = A;
    this.anchorsDirty = true;
  }

  emitAnchors() {
    if (!this.cb.onAnchors) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const out = [];
    for (const slot of ANCHOR_SLOTS) {
      const p = this.anchors[slot];
      if (!p) continue;
      const v = p.clone().project(this.camera);
      out.push({ slot, x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height, visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 });
    }
    this.cb.onAnchors(out);
  }

  projectItem(id) {
    const g = this.items.get(id);
    if (!g) return null;
    const b = new THREE.Box3().setFromObject(g);
    const p = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 0.15, (b.min.z + b.max.z) / 2).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
  }

  // ───────────────────────── 输出 ─────────────────────────

  renderNow() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** 高清截图（隐藏选框） */
  async snapshot(scale = 2) {
    const sel = this.selBox.visible;
    const hov = this.hovBox.visible;
    this.selBox.visible = this.hovBox.visible = false;
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(Math.min(3, pr * scale));
    this.resize();
    this.renderNow();
    const blob = await new Promise((res) => this.renderer.domElement.toBlob(res, 'image/png'));
    this.renderer.setPixelRatio(pr);
    this.resize();
    this.selBox.visible = sel;
    this.hovBox.visible = hov;
    this.dirty = true;
    return blob;
  }

  /** 四个时段的小图（日光面板用）：在同一帧里渲染、截取、复原，不会闪 */
  thumbs(hours, w = 168, h = 104) {
    const keep = this.time;
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const sel = this.selBox.visible;
    this.selBox.visible = this.hovBox.visible = false;
    const cam = this.camera.clone();
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w * 2, h * 2, false);
    const out = hours.map((hr) => {
      this.setTime(hr);
      this.renderer.render(this.scene, cam);
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = h * 2;
      c.getContext('2d').drawImage(this.renderer.domElement, 0, 0);
      return c.toDataURL('image/jpeg', 0.8);
    });
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(size.x, size.y, false);
    this.setTime(keep);
    this.selBox.visible = sel;
    this.renderNow();
    this.dirty = true;
    return out;
  }

  loop(t) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    if (this.tween) {
      const k = Math.min(1, (t - this.tween.t0) / this.tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.tween.fromP, this.tween.toP, e);
      this.controls.target.lerpVectors(this.tween.fromT, this.tween.toT, e);
      if (k >= 1) this.tween = null;
      this.dirty = true;
    }
    if (this.onTick?.(t)) this.dirty = true;
    const moved = this.controls.update();
    if (this.lib.pulse(t)) this.dirty = true;
    if (moved) this.dirty = true;
    if (!this.dirty) return;
    // 墙的切法跟着镜头
    const camDir = this.camera.position.clone().sub(this.controls.target).setY(0).normalize();
    if (this.house && (this.lastCut == null || camDir.distanceTo(this.lastCut) > 0.02)) {
      if (applyCutaway(this.house.wallSets, camDir, this.wallMode)) this.collectPickables();
      this.lastCut = camDir;
    }
    this.renderNow();
    this.emitAnchors();
    if (this.selected) this.cb.onSelMove?.(this.projectItem(this.selected));
    this.dirty = false;
  }

  dispose() {
    this.running = false;
    this._unbind?.();
    this.ro.disconnect();
    this.controls.dispose();
    this.lib.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function isVisible(o) {
  let p = o;
  while (p) {
    if (p.visible === false) return false;
    p = p.parent;
  }
  return true;
}

// ───────────────────────── 背景：落地窗外的城市（白天是虚化的窗框，夜里是城市灯光的光斑） ─────────────────────────

function makeBackdropLayers() {
  const W = 512;
  const H = 256;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  const frames = mk();
  const f = frames.getContext('2d');
  f.filter = 'blur(7px)';
  f.fillStyle = 'rgba(10,8,14,0.9)';
  for (let x = 18; x < W; x += 74) f.fillRect(x, 0, 9, H);
  f.fillRect(0, H * 0.62, W, 7);
  f.fillStyle = 'rgba(10,8,14,0.75)';
  f.fillRect(0, H * 0.8, W, H * 0.2);
  const bokeh = mk();
  const b = bokeh.getContext('2d');
  b.filter = 'blur(3px)';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W;
    const y = H * 0.25 + rnd() * H * 0.5;
    const r = 2 + rnd() * 6;
    const warm = rnd() > 0.35;
    b.fillStyle = warm ? `rgba(255,${180 + rnd() * 50},${110 + rnd() * 40},${0.35 + rnd() * 0.5})` : `rgba(170,200,255,${0.25 + rnd() * 0.4})`;
    b.beginPath();
    b.arc(x, y, r, 0, Math.PI * 2);
    b.fill();
  }
  return { frames, bokeh };
}

function drawBackdrop(canvas, layers, d) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, d.bgTop);
  g.addColorStop(0.7, d.bgBottom);
  g.addColorStop(1, '#0c0b10');
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.55 + 0.35 * d.night;
  ctx.drawImage(layers.frames, 0, 0);
  ctx.globalAlpha = d.night * 0.95;
  ctx.drawImage(layers.bokeh, 0, 0);
  ctx.globalAlpha = 1;
}

// ───────────────────────── 地面光圈（悬停 / 选中） ─────────────────────────

function makeRing(color, opacity) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.94, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * 0.12, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  g.add(ring, glow);
  g.visible = false;
  g.renderOrder = 4;
  return g;
}

const _box = new THREE.Box3();
function fitRing(ring, obj) {
  _box.setFromObject(obj);
  const r = Math.max(0.35, Math.hypot(_box.max.x - _box.min.x, _box.max.z - _box.min.z) / 2 + 0.08);
  ring.position.set((_box.min.x + _box.max.x) / 2, 0.015, (_box.min.z + _box.max.z) / 2);
  ring.scale.setScalar(r);
}
