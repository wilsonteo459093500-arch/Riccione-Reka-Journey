// 小图标 + 通用小组件

const P = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  camera: 'M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  walls: 'M3 21V9l9-6 9 6v12M3 21h18M9 21v-6h6v6',
  play: 'M7 4v16l13-8z',
  pause: 'M7 4h3v16H7zm7 0h3v16h-3z',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm-2.5-13a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14m0 3h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  plus: 'M12 5v14M5 12h14',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  swap: 'M7 7h13l-3-3m3 13H7l3 3M4 7h0m16 10h0',
  close: 'M6 6l12 12M18 6 6 18',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  sunrise: 'M12 3v3M4.9 8.9l2.1 2.1M19.1 8.9 17 11M3 17h18M7 17a5 5 0 0 1 10 0M12 21v-1',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  lamp: 'M8 3h8l3 8H5zM12 11v8M8 21h8',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  home: 'M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z',
};

export function Icon({ name, size = 18, stroke = 1.7 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.plus} />
    </svg>
  );
}

export function IconBtn({ icon, label, onClick, active, disabled, className = '' }) {
  return (
    <button type="button" className={`ibtn ${active ? 'on' : ''} ${className}`} onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      <Icon name={icon} />
    </button>
  );
}

export function Modal({ title, children, onClose, wide = false, className = '' }) {
  return (
    <div className="s-modal-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`s-modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-label={title}>
        {onClose && (
          <button type="button" className="s-modal-x" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        )}
        {title && <h2 className="s-modal-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
