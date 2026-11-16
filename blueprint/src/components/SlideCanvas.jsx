import React, { memo } from 'react';
import { SLIDE_W, SLIDE_H, PX_PER_PT } from '../theme.js';
import { placeImage, fontCss, fontWeight, hexA } from '../engine/spec.js';

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

function ImgEl({ el, url, scale = 1 }) {
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
          style={{
            position: 'absolute', left: -l * iw, top: -t * ih, width: iw, height: ih, maxWidth: 'none', objectFit: 'fill',
            // 展厅播放的推近：以框的中心为原点放大（scale = 1 就是原样）
            ...(scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: `${l * iw + pl.w / 2}px ${t * ih + pl.h / 2}px` } : {}),
          }}
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
        // lineHeight = 固定行高（新版式，与 PPT 的「固定值」行距一致）；段落本身用主字体字号，
        // 免得浏览器按页面默认字体的「支柱」把每行撑高几像素
        const exact = typeof p.lineHeight === 'number';
        const lh = exact ? p.lineHeight : maxSize * PX_PER_PT * 1.2 * ((p.lineSpacing || 100) / 100);
        const main = exact ? (p.runs || []).find((r) => (r.size || 18) === maxSize) || {} : null;
        return (
          <p
            key={i}
            style={{
              margin: 0,
              textAlign: p.align === 'ctr' ? 'center' : p.align === 'r' ? 'right' : 'left',
              lineHeight: `${lh}px`,
              minHeight: lh,
              ...(exact ? { fontFamily: fontCss(main.font), fontSize: maxSize * PX_PER_PT, fontWeight: fontWeight(main.font, main.bold) } : {}),
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
                  fontWeight: fontWeight(r.font, r.bold),
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
 *           onPick?:(field:string, el:object)=>void, activeField?:string, interactive?:boolean,
 *           elStyle?:(el:object, i:number)=>({ opacity?:number, transform?:string, imgScale?:number }|null) }} props
 *   elStyle：展厅播放用（每个元素的透明度 / 位移 / 效果图推近）；编辑器不传 = 原样
 *   replaceEl(el, i)：展厅播放用，返回节点 = 这个元素换成它画（效果图的「线稿 → 上色」画布），null = 照常
 */
function SlideCanvas({ slide, width = 960, resolveUrl, onPick, activeField, interactive = false, className = '', elStyle, replaceEl }) {
  const scale = width / SLIDE_W;
  const height = SLIDE_H * scale;
  return (
    <div
      className={`relative overflow-hidden select-none ${className}`}
      style={{ width, height, background: `#${slide?.bg || 'F5F0E6'}` }}
    >
      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: '0 0',
          WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
        }}
      >
        {(slide?.els || []).map((el, i) => {
          const st = elStyle ? elStyle(el, i) : null;
          let node = null;
          if (el.t === 'rect') node = <RectEl el={el} />;
          else if (el.t === 'img') node = <ImgEl el={el} url={el.src ? resolveUrl?.(el.src) : null} scale={st?.imgScale ?? 1} />;
          else if (el.t === 'text') node = <TextEl el={el} />;
          const custom = replaceEl ? replaceEl(el, i) : null;
          if (custom) node = custom;
          if (!node) return null;
          // 展厅播放：每个元素一层（一直包着，样式变来变去也不会重建 <img>）
          if (elStyle) {
            return (
              <div key={i} style={{ position: 'absolute', inset: 0, opacity: st?.opacity ?? 1, transform: st?.transform, pointerEvents: 'none' }}>
                {node}
              </div>
            );
          }
          if (!interactive) return <React.Fragment key={i}>{node}</React.Fragment>;
          // 编辑器里：不能编辑的元素（托字渐变、logo、签名…）不接点击，点下去落到下面的照片 / 文字上
          // （C 安然的托字渐变整片盖在照片上，接了点击就点不到照片了）
          if (!el.edit) return <div key={i} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{node}</div>;
          // edit.zones：同一个文字元素里另一栏的字（订单周期「60–75 天 days」的单位和天数同一段、共用基线）——
          // 点那一段落到它自己的栏位
          const zones = Array.isArray(el.edit.zones) ? el.edit.zones : [];
          const active = activeField && (el.edit.field === activeField || zones.some((z) => z.field === activeField));
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
              {zones.map((z, k) => (
                <div
                  key={k}
                  className="bp-pick-hit"
                  data-zone={z.field}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPick?.(z.field, el);
                  }}
                  style={{ position: 'absolute', left: z.x, top: z.y, width: z.w, height: z.h, pointerEvents: 'auto', cursor: 'pointer' }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(SlideCanvas);
