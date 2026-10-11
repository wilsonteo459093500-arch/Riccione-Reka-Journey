// 3D 梦想工作室的小零件：线性图标（lucide，统一 1.75 线宽 —— 不用表情当图标）、图标按钮、分段控件、弹窗、确认框、名字。

import { useEffect, useRef } from 'react';
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

/** 房间名：默认名（客厅 / Living…）跟着语言走；模板里的名字（次卧…）查词典；自己改过的名字原样 */
export function roomLabel(r) {
  if (!r) return '';
  const type = ROOM_TYPES[r.type];
  if (!r.name || (type && (r.name === type.zh || r.name === type.en))) return L(type) || r.name || '';
  return t(r.name);
}

export function IconBtn({ icon, label, onClick, active, disabled, className = '', text, size = 18, pressed }) {
  return (
    <button
      type="button"
      className={`ibtn ${active ? 'on' : ''} ${text ? 'has-text' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
    >
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
