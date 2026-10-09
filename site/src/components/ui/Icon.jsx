// 图标集中登记：模板里写字符串名，这里映射到 lucide 组件（只打包用到的图标）
import {
  ClipboardCheck, ShieldCheck, BadgeCheck, KeyRound, Ruler, ClipboardList, Megaphone,
  CalendarCheck, Camera, Image, ImagePlus, Trash2, ChevronLeft, ChevronRight, ChevronDown,
  ChevronUp, Plus, FileText, FileSpreadsheet, FileDown, Share2, Copy, Check, X, Settings,
  FolderOpen, Building2, House, PenLine, Video, MapPin, Phone, Star, TriangleAlert, Info,
  EllipsisVertical, Download, Upload, Eye, RefreshCw, LoaderCircle, MessageCircle, Send,
  CircleCheck, Pencil, ListChecks, Clock, Smartphone, HardDrive, RotateCcw, CircleAlert,
  FilePlus2, Play, Link, CopyPlus, FolderPlus, Wand2, Minus,
} from 'lucide-react';

const ICONS = {
  ClipboardCheck, ShieldCheck, BadgeCheck, KeyRound, Ruler, ClipboardList, Megaphone,
  CalendarCheck, Camera, Image, ImagePlus, Trash2, ChevronLeft, ChevronRight, ChevronDown,
  ChevronUp, Plus, FileText, FileSpreadsheet, FileDown, Share2, Copy, Check, X, Settings,
  FolderOpen, Building2, House, PenLine, Video, MapPin, Phone, Star, TriangleAlert, Info,
  EllipsisVertical, Download, Upload, Eye, RefreshCw, LoaderCircle, MessageCircle, Send,
  CircleCheck, Pencil, ListChecks, Clock, Smartphone, HardDrive, RotateCcw, CircleAlert,
  FilePlus2, Play, Link, CopyPlus, FolderPlus, Wand2, Minus,
};

export default function Icon({ name, size = 18, className = '', strokeWidth = 2, ...rest }) {
  const C = ICONS[name] || FileText;
  return <C size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}
