// 诊断面板（studio.html?diag=1）：3D 在某台设备上画不出来时，请对方开这个网址截图 —— 显卡、WebGL、画布、引擎状态、
// 着色器错误、页面报错一屏看完。不靠 React（界面坏了也能显示），每秒刷新一次。英文为主（给开发看），按钮中英并列。

const errors = [];
const keep = (kind, msg) => {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${kind}: ${String(msg).slice(0, 240)}`);
  if (errors.length > 14) errors.shift();
};

export function installDiag() {
  window.addEventListener('error', (e) => keep('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => keep('promise', e.reason?.message || e.reason));
  for (const k of ['error', 'warn']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => {
      keep(k, a.map((x) => (typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' '));
      orig(...a);
    };
  }

  // 放在顶部工具列下面、可收起：不要挡住底部的时间滑杆和工具列。按钮在最上面，文字太长就在框里滑。
  const box = document.createElement('div');
  box.setAttribute('role', 'status');
  Object.assign(box.style, {
    position: 'fixed', left: '8px', top: 'calc(env(safe-area-inset-top, 0px) + 72px)', zIndex: 99999,
    width: 'min(440px, calc(100vw - 16px))', maxHeight: '38vh', overflow: 'auto',
    padding: '8px 10px', borderRadius: '12px', font: '10px/1.4 ui-monospace, Menlo, Consolas, monospace',
    background: 'rgba(0,0,0,0.72)', color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  });
  const text = document.createElement('div');
  const bar = document.createElement('div');
  Object.assign(bar.style, { display: 'flex', gap: '6px', flexWrap: 'wrap' });
  const btn = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    Object.assign(b.style, { font: 'inherit', padding: '5px 9px', borderRadius: '8px', border: '1px solid #fff6', background: '#ffffff1a', color: '#fff' });
    b.onclick = fn;
    bar.appendChild(b);
    return b;
  };
  let open = true;
  const fold = btn('收起 Hide', () => {
    open = !open;
    text.style.display = open ? '' : 'none';
    for (const b of bar.children) if (b !== fold) b.style.display = open ? '' : 'none';
    fold.textContent = open ? '收起 Hide' : '诊断 Diag';
    box.style.width = open ? 'min(440px, calc(100vw - 16px))' : 'auto';
    box.style.background = open ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.45)';
  });
  btn('复制 Copy', () => navigator.clipboard?.writeText(text.textContent).catch(() => {}));
  btn('流畅画质 Fast', () => window.__genie?.setQuality?.('fast'));
  btn('兼容画质 Safe', () => window.__genie?.setQuality?.('safe'));
  btn('清除本机方案 Reset', () => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('genie.studio')) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
    location.replace(location.pathname + '?diag=1');
  });
  text.style.marginTop = '6px';
  box.append(bar, text);
  document.body.appendChild(box);

  // 每一帧画完马上读画面中间一个像素（不开 preserveDrawingBuffer 也读得到）：看画布上到底有没有东西
  let pixel = 'n/a';
  let hooked = false;
  const hook = () => {
    const e = window.__genie;
    if (hooked || !e?.renderer) return;
    hooked = true;
    const r = e.renderer;
    const render = r.render.bind(r);
    let n = 0;
    r.render = (scene, cam) => {
      render(scene, cam);
      if (r.getRenderTarget() || ++n % 10 !== 1) return;
      try {
        const gl = r.getContext();
        const px = new Uint8Array(4);
        gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        pixel = `rgba(${px.join(',')}) err=${gl.getError()}`;
      } catch (err) {
        pixel = `read failed: ${err.message}`;
      }
    };
  };

  const line = (k, v) => `${k.padEnd(13)} ${v}\n`;
  const tick = () => {
    hook();
    const e = window.__genie;
    let s = line('url', location.href.slice(0, 120)) + line('ua', navigator.userAgent.slice(0, 160)) + line('screen', `${innerWidth}×${innerHeight} @${devicePixelRatio}`);
    if (!e) s += line('engine', 'NOT CREATED');
    else {
      try {
        const r = e.renderer;
        const gl = r.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const cv = r.domElement;
        const cs = getComputedStyle(cv);
        const c = e.camera;
        const info = r.info;
        s += line('gpu', ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        s += line('webgl', `${gl.getParameter(gl.VERSION)} lost=${gl.isContextLost()} maxTex=${gl.getParameter(gl.MAX_TEXTURE_SIZE)} units=${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)} hf=${!!gl.getExtension('EXT_color_buffer_half_float')} f=${!!gl.getExtension('EXT_color_buffer_float')}`);
        s += line('canvas', `css ${cv.clientWidth}×${cv.clientHeight} buf ${gl.drawingBufferWidth}×${gl.drawingBufferHeight} display=${cs.display} vis=${cs.visibility} op=${cs.opacity} inDOM=${document.contains(cv)}`);
        s += line('engine', `q=${e.quality} running=${e.running} ctxLost=${e.contextLost} demo=${e.demo} composer=${!!e.composer} wall=${e.wallMode}`);
        s += line('render', `frame=${info.render.frame} calls=${info.render.calls} tris=${info.render.triangles} programs=${info.programs?.length} geo=${info.memory.geometries} tex=${info.memory.textures}`);
        s += line('camera', `pos=${[c.position.x, c.position.y, c.position.z].map((v) => v.toFixed(1)).join(',')} near=${c.near} far=${c.far} fov=${c.fov?.toFixed?.(1)} layers=${c.layers.mask}`);
        s += line('scene', `children=${e.scene.children.length} rooms=${e.rooms?.length ?? '-'} bg=${e.scene.background ? 'tex' : 'none'}`);
        s += line('pixel', pixel);
        for (const d of (window.__genieDiag || []).slice(-3)) s += line('shader', `${d.quality} ${d.gpu} | ${(d.fragment || d.vertex || d.program).slice(0, 200)}`);
      } catch (err) {
        s += line('diag', `failed: ${err.message}`);
      }
    }
    if (errors.length) s += '\nerrors:\n' + errors.join('\n');
    text.textContent = s;
  };
  setInterval(tick, 1000);
  tick();
}
