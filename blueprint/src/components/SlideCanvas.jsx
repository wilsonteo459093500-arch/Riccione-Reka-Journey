import React, { memo } from 'react';
import { SLIDE_W, SLIDE_H, PX_PER_PT } from '../theme.js';
import { placeImage, fontCss, hexA } from '../engine/spec.js';

// 网页版幻灯片渲染 —— 与 PPT 导出共用同一份元素规格（engine/spec.js），所见即所得。
// 在 1920×1080 的画布上排版，再整体缩放到 width。

const INSET = 25400 / 9525; // PPT 文本框默认内边距（px）

function cssGradient(grad) {
  // OOXML：0° = 左→右，90° = 上→下；CSS：90deg = 左→右，180deg = 上→下
  const angle = ((grad.angle ?? 90) + 90) % 360;
  const stops = (grad.stops || []).map((s) => `${hexA(s.color, s.alpha ?? 1)} ${s.pos ?? 0}%`).join(', ');
  return `linear-gradient(${angle}deg, ${stops})`;
}

function RectEl({ el }) {
  const style = { position: 'absolute', left: el.x, top: el.y, width: Math.max(1, el.w), height: Math.max(1, el.h) };
  if (el.grad) style.background = cssGradient(el.grad);
  else if (el.fill) style.background = hexA(el.fill, el.alpha ?? 1);
  return <div style={style} />;
}

function ImgEl({ el, url }) {
  const pl = placeImage(el);
  const { l, t, r, b } = pl.crop;
  const fw = 1 - l - r || 1;
  const fh = 1 - t - b || 1;
  const iw = pl.w / fw;
  const ih = pl.h / fh;
  return (
    <div style={{ position: 'absolute', left: pl.x, top: pl.y, width: pl.w, height: pl.h, overflow: 'hidden' }}>
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          style={{ position: 'absolute', left: -l * iw, top: -t * ih, width: iw, height: ih, maxWidth: 'none', objectFit: 'fill' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: '#E9E5DC' }} />
      )}
    </div>
  );
}

function TextEl({ el }) {
  const justify = el.valign === 'b' ? 'flex-end' : el.valign === 'ctr' ? 'center' : 'flex-start';
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        padding: INSET,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        overflow: 'visible',
        boxSizing: 'border-box',
      }}
    >
      {(el.paras || []).map((p, i) => {
        const maxSize = Math.max(...(p.runs || []).map((r) => r.size || 18), 1);
        const lh = maxSize * PX_PER_PT * 1.2 * ((p.lineSpacing || 100) / 100);
        return (
          <p
            key={i}
            style={{
              margin: 0,
              textAlign: p.align === 'ctr' ? 'center' : p.align === 'r' ? 'right' : 'left',
              lineHeight: `${lh}px`,
              minHeight: lh,
              whiteSpace: el.nowrap ? 'pre' : 'pre-wrap',
              wordBreak: 'normal',
              overflowWrap: 'anywhere',
              // 单行框：真放不下时和 PowerPoint 一样按对齐方式向两边 / 向左长，而不是只往右溢出
              ...(el.nowrap ? { display: 'flex', justifyContent: p.align === 'ctr' ? 'center' : p.align === 'r' ? 'flex-end' : 'flex-start' } : {}),
            }}
          >
            {(p.runs || []).map((r, j) => (
              <span
                key={j}
                style={{
                  fontFamily: fontCss(r.font),
                  fontSize: (r.size || 18) * PX_PER_PT,
                  color: hexA(r.color || '241C12', r.alpha ?? 1),
                  letterSpacing: (r.spacing || 0) * PX_PER_PT,
                  fontWeight: r.bold ? 600 : 400,
                }}
              >
                {r.text}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/**
 * @param {{ slide:{bg:string, els:object[]}, width:number, resolveUrl:(src:string)=>string|null,
 *           onPick?:(field:string, el:object)=>void, activeField?:string, interactive?:boolean }} props
 */
function SlideCanvas({ slide, width = 960, resolveUrl, onPick, activeField, interactive = false, className = '' }) {
  const scale = width / SLIDE_W;
  const height = SLIDE_H * scale;
  return (
    <div
      className={`relative overflow-hidden select-none ${className}`}
      style={{ width, height, background: `#${slide?.bg || 'F5F0E6'}` }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        {(slide?.els || []).map((el, i) => {
          let node = null;
          if (el.t === 'rect') node = <RectEl el={el} />;
          else if (el.t === 'img') node = <ImgEl el={el} url={el.src ? resolveUrl?.(el.src) : null} />;
          else if (el.t === 'text') node = <TextEl el={el} />;
          if (!node) return null;
          if (!interactive || !el.edit) return <React.Fragment key={i}>{node}</React.Fragment>;
          const active = activeField && el.edit.field === activeField;
          return (
            <div
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                onPick?.(el.edit.field, el);
              }}
              className="bp-pick"
              data-active={active ? '1' : undefined}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              {node}
              <div
                className="bp-pick-hit"
                style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, pointerEvents: 'auto', cursor: 'pointer' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(SlideCanvas);
