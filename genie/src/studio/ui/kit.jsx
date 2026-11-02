// 3D 梦想工作室的小零件：线性图标（lucide，统一 1.75 线宽 —— 不用表情当图标）、图标按钮、分段控件、弹窗、确认框、名字，
// 还有「画布上还空着哪一段」（浮在 3D 上的标签、选择条要躲开左右两块面板）。

import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Armchair,
  Bath,
  BedDouble,
  BedSingle,
  BrickWall,
  Camera,
  Check,
  ChefHat,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleHelp,
  Clapperboard,
  Coffee,
  Columns2,
  CookingPot,
  Copy,
  DoorClosed,
  DoorOpen,
  Download,
  Droplets,
  Ellipsis,
  Flame,
  Footprints,
  Gauge,
  Gem,
  GalleryHorizontal,
  Hand,
  House,
  Image,
  ImageUp,
  Inbox,
  Info,
  Lamp,
  LampCeiling,
  LampFloor,
  Languages,
  Laptop,
  LayoutGrid,
  Library,
  Link,
  Maximize2,
  MessageCircle,
  Minus,
  MonitorPlay,
  Moon,
  MousePointer2,
  MoveHorizontal,
  Package,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Pause,
  PawPrint,
  PencilRuler,
  Play,
  Plus,
  RectangleHorizontal,
  Redo2,
  Refrigerator,
  RefreshCw,
  RotateCw,
  Ruler,
  Settings,
  Share,
  Shirt,
  ShowerHead,
  Shuffle,
  Sofa,
  Sparkles,
  SquareDashed,
  Sprout,
  Sun,
  Sunrise,
  Sunset,
  Tags,
  ToyBrick,
  Trash2,
  TreePalm,
  TriangleAlert,
  Tv,
  Undo2,
  UtensilsCrossed,
  View,
  WandSparkles,
  WashingMachine,
  X,
  Blinds,
  Boxes,
  Lock,
  LockOpen,
  Images,
  SquareSplitHorizontal,
  LoaderCircle,
  Hammer,
} from 'lucide-react';
import { t, L, isEn } from '../../shared/i18n.js';
import { ROOM_TYPES } from '../plan/model.js';

const ICONS = {
  undo: Undo2,
  redo: Redo2,
  download: Download,
  snapshot: Camera,
  link: Link,
  share: Share,
  labels: Tags,
  view: View,
  walls: BrickWall,
  play: Play,
  pause: Pause,
  showroom: MonitorPlay,
  plan: PencilRuler,
  start: LayoutGrid,
  home: House,
  gear: Settings,
  help: CircleHelp,
  more: Ellipsis,
  lang: Languages,
  plus: Plus,
  minus: Minus,
  rotate: RotateCw,
  trash: Trash2,
  copy: Copy,
  swap: Shuffle,
  close: X,
  check: Check,
  ok: CircleCheck,
  warn: CircleAlert,
  alert: TriangleAlert,
  info: Info,
  sunrise: Sunrise,
  sun: Sun,
  sunset: Sunset,
  lamp: Lamp,
  moon: Moon,
  panel: PanelLeft,
  panelClose: PanelLeftClose,
  sparkles: Sparkles,
  wand: WandSparkles,
  upload: ImageUp,
  ruler: Ruler,
  hand: Hand,
  pointer: MousePointer2,
  room: SquareDashed,
  door: DoorOpen,
  window: Blinds,
  slider: Columns2,
  open: MoveHorizontal,
  fit: Maximize2,
  refresh: RefreshCw,
  chevron: ChevronRight,
  down: ChevronDown,
  whatsapp: MessageCircle,
  inbox: Inbox,
  gauge: Gauge,
  palette: Palette,
  film: Clapperboard,
  storage: Boxes,
  lock: Lock,
  unlock: LockOpen,
  images: Images,
  compare: SquareSplitHorizontal,
  spinner: LoaderCircle,
  make: Hammer, // 我们做 · We make this（公司做的定制柜、台面、墙板、门）
};

export function Icon({ name, size = 18, stroke = 1.75, className = '' }) {
  const C = ICONS[name] || Plus;
  return <C size={size} strokeWidth={stroke} aria-hidden="true" focusable="false" className={className} />;
}

// 家具目录 → 线性图标（目录里的表情只是旧数据，界面不再用）
const FURN = {
  sofa: Sofa,
  armchair: Armchair,
  coffeeTable: Coffee,
  rug: RectangleHorizontal,
  tvWall: Tv,
  featureWall: BrickWall,
  bookshelf: Library,
  displayCabinet: Gem,
  plant: Sprout,
  floorLamp: LampFloor,
  sideTable: CircleDot,
  art: Image,
  altar: Flame,
  diningTable: UtensilsCrossed,
  chair: Armchair,
  pendant: LampCeiling,
  sideboard: Archive,
  kitchenRun: CookingPot,
  fridge: Refrigerator,
  tallUnit: DoorClosed,
  island: ChefHat,
  bed: BedDouble,
  kidsBed: BedSingle,
  nightstand: Lamp,
  wardrobe: Shirt,
  dresser: Sparkles,
  desk: Laptop,
  toyStorage: ToyBrick,
  petBed: PawPrint,
  shoeCabinet: Footprints,
  bench: GalleryHorizontal,
  vanity: Droplets,
  toilet: Bath,
  shower: ShowerHead,
  washer: WashingMachine,
  lounger: TreePalm,
  curtains: Blinds,
  store: Package,
};

export function FurnIcon({ kind, size = 22, stroke = 1.5 }) {
  const C = FURN[kind] || Boxes;
  return <C size={size} strokeWidth={stroke} aria-hidden="true" focusable="false" />;
}

/** 表面名：地板 / Floor（材质库里的英文是大写标签，界面上用句首大写） */
export function slotName(s) {
  if (!s) return '';
  const v = L(s);
  if (v && v !== s.en) return v;
  const e = String(s.en || '').toLowerCase();
  return e.charAt(0).toUpperCase() + e.slice(1);
}

/**
 * 材质名拆成「系列 + 名字」（材质栏的样板、材质板的格子都用）：带「·」或「,」的拆开，窄窄的格子也认得出是哪一片：
 * 石英石·洞石纹 → 石英石 / 洞石纹；Quartz, travertine look → Quartz / Travertine（完整名字放 title、aria-label）。
 */
export function chipName(m) {
  const full = L(m);
  const hit = /^(.+?)\s*[·,，、]\s*(.+)$/.exec(full || '');
  if (!hit) return { name: full };
  const name = hit[2].replace(/\s+look$/i, '');
  return { fam: hit[1], name: name.charAt(0).toUpperCase() + name.slice(1) };
}

/** 房间名：默认名（客厅 / Living…）跟着语言走；模板里的名字（次卧…）查词典；自己改过的名字原样 */
export function roomLabel(r) {
  if (!r) return '';
  const type = ROOM_TYPES[r.type];
  if (!r.name || (type && (r.name === type.zh || r.name === type.en))) return L(type) || r.name || '';
  return t(r.name);
}

export function IconBtn({ icon, label, onClick, active, disabled, className = '', text, size = 18, pressed }) {
  return (
    <button type="button" className={`ibtn ${active ? 'on' : ''} ${text ? 'has-text' : ''} ${className}`} onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={pressed}>
      <Icon name={icon} size={size} />
      {text && <span className="ibtn-text">{text}</span>}
    </button>
  );
}

/** iOS 分段控件。options: [{ id, label, sub?, icon? }] */
export function Seg({ value, options, onChange, className = '', size = 'md', label }) {
  return (
    <div className={`seg seg-${size} ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} size={15} />}
          <span>{o.label}</span>
          {o.sub && <i>{o.sub}</i>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, eyebrow, children, onClose, wide = false, className = '', footer }) {
  const box = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // 只在打开时装一次（父组件每次重画都会给新的 onClose；不能每次都把焦点抢回弹窗）
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current?.();
    window.addEventListener('keydown', onKey);
    if (!box.current?.contains(document.activeElement)) box.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="s-modal-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={box} tabIndex={-1} className={`s-modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="s-modal-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h2 className="s-modal-title">{title}</h2>}
          </div>
          {onClose && (
            <button type="button" className="s-modal-x" onClick={onClose} aria-label={t('关闭')}>
              <Icon name="close" size={18} />
            </button>
          )}
        </header>
        <div className="s-modal-body">{children}</div>
        {footer && <footer className="s-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** 纸色的确认框（代替浏览器自带的 confirm） */
export function ConfirmSheet({ title, body, ok, cancel, danger, onOk, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} className="confirm">
      <p className="m-p">{body}</p>
      <div className="m-actions">
        <button type="button" className="s-btn ghost" onClick={onCancel}>
          {cancel || t('取消')}
        </button>
        <button type="button" className={`s-btn ${danger ? 'danger' : 'primary'}`} onClick={onOk} autoFocus>
          {ok || t('继续')}
        </button>
      </div>
    </Modal>
  );
}

/** 列表分隔：中文「、」英文「, 」 */
export const listSep = () => (isEn() ? ', ' : '、');

/** 客人家里留下来的那几样，放在句子中间（「保留了你家的地板、柜子」/ “kept your floor, cabinetry”：英文小写） */
const LOCK_WORD = { floor: '地板', walls: '墙面', cabinetry: '柜子', upholstery: '沙发' };
export function lockWord(slot) {
  const s = t(LOCK_WORD[slot] || slot);
  return isEn() ? s.toLowerCase() : s;
}
export const lockList = (locked) => Object.keys(locked || {}).map(lockWord).join(listSep());
/** 一串名字放在句子中间（英文小写）：房间、表面 */
export const midList = (names) => names.filter(Boolean).map((s) => (isEn() ? s.toLowerCase() : s)).join(listSep());

/** 「我们做」的小记号（金色圆点 + 锤子）：材质板、标签的样板角上（只有定制柜、台面、墙板 —— offer.js）；title 写全称 */
export function OfferMark({ className = '' }) {
  return (
    <span className={`st-make-dot ${className}`} title={t('我们做 · 定制柜、台面、墙板、门')} aria-label={t('我们做')}>
      <Icon name="make" size={9} stroke={2.2} />
    </span>
  );
}

/** 媒体查询（窄屏换布局用）；旧 Safari 只有 addListener */
export function useMedia(query) {
  const get = () => (typeof matchMedia === 'function' ? matchMedia(query).matches : false);
  const [hit, setHit] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia(query);
    const on = () => setHit(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener?.(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener?.(on));
  }, [query]);
  return hit;
}

// 浮在画布上的面板：左边情绪面板、右上日光面板（宽屏）、右上工具条。横跨半个屏幕以上的（窄屏底部那一列）不算 ——
// 那种由上下方向的限制处理。
// 对照的照片（横屏左右分开、小卡）也算：标签排在 3D 那一半
const OBSTACLES = ['.mood-panel', '.day-panel', '.toolbar', '.st-split.land', '.st-pip'];

/**
 * 画布上 [y0, y1] 这一条横带里，左右还空着的范围 { L, R }（离面板至少 pad）。
 * 只看和这条带子上下重叠的面板；面板收起、在别处时自然不挡。
 */
export function freeBand(y0, y1, pad = 12) {
  const W = typeof innerWidth === 'number' ? innerWidth : 1440;
  let L = pad;
  let R = W - pad;
  if (typeof document === 'undefined') return { L, R };
  for (const sel of OBSTACLES) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || (r.width > W * 0.5 && !sel.startsWith('.st-split')) || r.bottom <= y0 || r.top >= y1) continue;
    // 收起的面板是透明的（不挡）；对照的照片一出现就算挡（它进场的淡入动画开头也是透明的）
    if (!sel.startsWith('.st-') && getComputedStyle(el).opacity === '0') continue;
    if (r.left + r.width / 2 < W / 2) L = Math.max(L, r.right + pad);
    else R = Math.min(R, r.left - pad);
  }
  return { L, R };
}

/** 工具条底边（选择条不能钻到它下面）；没有工具条时按 16 + 52 算 */
export function toolbarBottom() {
  if (typeof document === 'undefined') return 68;
  const r = document.querySelector('.toolbar')?.getBoundingClientRect();
  return r && r.height ? r.bottom : 68;
}
