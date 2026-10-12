// 选照片 / 视频的按钮：透明的 <input type=file> 盖满整个按钮，手指直接点在它上面打开系统相机 / 相册。
// 不用「隐藏 input + 代码 click()」——华为浏览器、App 内置浏览器等有的不认代码触发的点击。
import { useRef } from 'react';

export default function PickerButton({ label, accept, capture, multiple = false, disabled = false, onPick, onFiles, className = '', children }) {
  const ref = useRef(null);
  return (
    <label
      role="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      className={`relative overflow-hidden ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'} ${className}`}
      onKeyDown={(e) => {
        // 键盘：回车 / 空格打开（手机上用不到，桌面浏览器方便）
        if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        ref.current?.click(); // input 的 onClick 会记 onPick
      }}
    >
      {children}
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true" // 读屏 / 无障碍只认外面的按钮（label），不重复
        // 字号放大：老内核只有「选择文件」那一小块能点，放大后它铺满整个按钮
        style={{ fontSize: 200 }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onClick={(e) => onPick?.(e.currentTarget, e.currentTarget.closest('label'))}
        onChange={(e) => {
          onFiles?.(e.target.files);
          e.target.value = '';
        }}
      />
    </label>
  );
}
