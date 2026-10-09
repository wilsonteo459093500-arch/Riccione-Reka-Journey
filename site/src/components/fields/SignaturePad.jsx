// 手写签名板：手指签名 → 透明底 PNG（自动裁掉空白）
import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../ui/UI.jsx';
import Icon from '../ui/Icon.jsx';

function trimCanvas(src) {
  const g = src.getContext('2d');
  const { width, height } = src;
  const data = g.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 12;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad);
  maxY = Math.min(height, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX;
  out.height = maxY - minY;
  out.getContext('2d').drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export default function SignaturePad({ open, title = '签名', onClose, onSave }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [dirty, setDirty] = useState(false);

  // 画布尺寸跟随显示尺寸（打开时 + 转屏 / 窗口变化时重设；尺寸变了就清空，避免笔迹错位变形）
  useEffect(() => {
    if (!open) return undefined;
    setDirty(false);
    const c = canvasRef.current;
    if (!c) return undefined;
    let lastW = 0;
    let lastH = 0;
    const setup = () => {
      const rect = c.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (!w || !h || (w === lastW && h === lastH)) return;
      const hadInk = lastW > 0;
      lastW = w;
      lastH = h;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = '#1f1e1c';
      drawing.current = false;
      if (hadInk) setDirty(false);
    };
    setup();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(setup) : null;
    ro?.observe(c);
    window.addEventListener('orientationchange', setup);
    return () => {
      ro?.disconnect();
      window.removeEventListener('orientationchange', setup);
    };
  }, [open]);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 };
  };

  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const g = canvasRef.current.getContext('2d');
    const p = pos(e);
    const l = last.current;
    g.lineWidth = 2.2 + (e.pointerType === 'pen' ? p.p * 2.5 : 1.3);
    g.beginPath();
    g.moveTo(l.x, l.y);
    g.quadraticCurveTo(l.x, l.y, (l.x + p.x) / 2, (l.y + p.y) / 2);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
    if (!dirty) setDirty(true);
  };
  const up = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setDirty(false);
  };

  const save = () => {
    const t = trimCanvas(canvasRef.current);
    if (!t) return;
    t.toBlob((blob) => blob && onSave(blob, t.width, t.height), 'image/png');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={clear}>
            <Icon name="RotateCcw" size={18} /> 重签
          </button>
          <button className="btn-primary flex-[2]" disabled={!dirty} onClick={save}>
            <Icon name="Check" size={18} /> 确认签名
          </button>
        </div>
      }
    >
      <div className="text-[13px] text-ink-mute">请在框内用手指签名（签名中途转屏会清空，需要重签）</div>
      <div className="relative mt-3 rounded-2xl bg-white ring-1 ring-line">
        <canvas
          ref={canvasRef}
          className="block h-[44dvh] max-h-[320px] min-h-[200px] w-full touch-none rounded-2xl"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-ink-faint" />
        <div className="pointer-events-none absolute bottom-3 left-6 text-[12px] text-ink-faint">签名 Signature</div>
      </div>
    </Sheet>
  );
}
