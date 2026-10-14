// HDR 守门（src/studio/engine/hdrguard.js）的注入点：守门是改 three 自带着色器的字符串，找不到注入点就悄悄不装 ——
// 升级 three 之后这里先报出来。只查字符串（Node 里没有 WebGL），不编译着色器。
// test/run.mjs 会跑这些；也可以单独跑：node test/hdrguard.test.mjs

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HDR_MAX, HDR_GLSL, HDR_COPY_FRAG, patchHdrChunks, guardFrag, guardOutputShader, guardBloom, BlankWatch } from '../src/studio/engine/hdrguard.js';

/**
 * 看门狗用的假引擎：假时钟（performance.now）、假 GL（readPixels 按 look 填像素：'ok' | 'black' | 'transparent'），
 * composer.render / renderer.render 记下来、可以让它们画出别的样子（probeLook）。60 fps 跑 seconds 秒，每帧调 afterFrame。
 */
function rig({ quality = 'high', nativeAA = false, fx = true } = {}) {
  const clock = { t: 1000 };
  const s = { look: 'ok', probeLook: { composer: null, direct: null }, reads: 0, lowered: [], composerRenders: 0, directRenders: 0 };
  const gl = {
    drawingBufferWidth: 64,
    drawingBufferHeight: 48,
    RGBA: 1,
    UNSIGNED_BYTE: 2,
    isContextLost: () => false,
    getExtension: () => null,
    getParameter: () => 'FakeGPU',
    readPixels(x, y, w, h, f, t, px) {
      s.reads++;
      const v = { ok: [90, 60, 40, 255], black: [0, 0, 0, 255], transparent: [0, 0, 0, 0] }[s.look];
      for (let i = 0; i < px.length; i += 4) px.set(v, i);
    },
  };
  const pass = () => ({ enabled: true });
  const e = {
    quality,
    nativeAA,
    running: true,
    contextLost: false,
    _prOverride: 0,
    _degrading: false,
    demo: false,
    time: 9.45,
    day: {},
    scene: { background: {} },
    camera: {},
    gtao: fx ? pass() : null,
    dof: fx ? pass() : null,
    bloom: fx ? pass() : null,
    dirty: false,
    renderer: {
      getContext: () => gl,
      getRenderTarget: () => null,
      setRenderTarget() {},
      render() {
        s.directRenders++;
        if (s.probeLook.direct) s.look = s.probeLook.direct;
      },
    },
    composer: {
      render() {
        s.composerRenders++;
        // 探测 A：GTAO / 景深 / 辉光都关了
        if (s.probeLook.composer && !e.gtao?.enabled && !e.dof?.enabled && !e.bloom?.enabled) s.look = s.probeLook.composer;
      },
    },
    lowerQuality(info, next) {
      s.lowered.push({ next, reason: info.reason, quality: info.quality });
    },
  };
  const w = new BlankWatch(e);
  const realNow = performance.now;
  const run = (seconds, each) => {
    performance.now = () => clock.t;
    try {
      for (let f = 0; f < seconds * 60; f++) {
        clock.t += 1000 / 60;
        each?.(f);
        w.afterFrame();
      }
    } finally {
      performance.now = realNow;
      w.dispose();
    }
  };
  return { e, w, s, run };
}

/** 跑 fn，收集 hdrguard 发出的 console.warn */
function warnsOf(fn) {
  const got = [];
  const orig = console.warn;
  console.warn = (...a) => got.push(a.join(' '));
  try {
    fn();
  } finally {
    console.warn = orig;
  }
  return got.filter((s) => s.includes('hdrguard'));
}

const ASCII = /^[\x00-\x7f]*$/;
const lastStatement = (src) => src.slice(0, src.lastIndexOf('}')).trim().split('\n').pop().trim();

export const hdrGuardTests = [
  [
    'opaque_fragment：出射光在写进缓冲之前洗干净（位运算认 NaN、夹到 HDR_MAX），只打一次补丁',
    () => {
      const w = warnsOf(() => patchHdrChunks());
      assert.deepEqual(w, []);
      const c = THREE.ShaderChunk.opaque_fragment;
      const fix = c.indexOf('floatBitsToUint( outgoingLight )');
      const out = c.indexOf('gl_FragColor = vec4( outgoingLight, diffuseColor.a );');
      assert.ok(fix > 0 && out > fix, c);
      assert.ok(c.includes(`clamp( outgoingLight, 0.0, ${HDR_MAX.toFixed(1)} )`));
      patchHdrChunks();
      assert.equal(THREE.ShaderChunk.opaque_fragment, c, '第二次调用不能再插一遍');
    },
  ],
  [
    '辉光：亮部提取读画面那一刻就洗、出口再洗；合成的出口洗、alpha 写 0',
    () => {
      const b = new UnrealBloomPass(new THREE.Vector2(64, 64), 0.2, 0.45, 1.1);
      const v0 = [b.materialHighPassFilter.version, b.compositeMaterial.version];
      const w = warnsOf(() => guardBloom(b));
      assert.deepEqual(w, []);
      const hp = b.materialHighPassFilter.fragmentShader;
      assert.ok(hp.includes('void hdrMain()') && hp.includes('hdrMain();'), hp);
      assert.ok(hp.includes('vec4 texel = hdrFetch( tDiffuse, vUv );'), hp);
      assert.ok(!/texture2D\s*\(\s*tDiffuse/.test(hp.slice(hp.indexOf('void hdrMain()'))), '亮部提取还有没洗的读');
      assert.equal(lastStatement(hp), 'gl_FragColor = vec4( hdrSafe( gl_FragColor.rgb ), hdrAlpha( gl_FragColor.a ) );');
      const cm = b.compositeMaterial.fragmentShader;
      assert.ok(cm.includes('void hdrMain()'), cm);
      assert.equal(lastStatement(cm), 'gl_FragColor = vec4( hdrSafe( gl_FragColor.rgb ), 0.0 );');
      assert.ok(b.materialHighPassFilter.version > v0[0] && b.compositeMaterial.version > v0[1], 'needsUpdate 没设');
      guardBloom(b);
      assert.equal(b.materialHighPassFilter.fragmentShader, hp, '第二次调用不能再包一层');
    },
  ],
  [
    '输出：色调映射之前洗干净，最后一句把 alpha 写成 1（画布永远不透明）',
    () => {
      const src = new OutputPass().material.fragmentShader;
      let g;
      const w = warnsOf(() => (g = guardOutputShader(src)));
      assert.deepEqual(w, []);
      assert.notEqual(g, src);
      assert.ok(g.includes('gl_FragColor = texture2D( tDiffuse, vUv );\n\t\t\tgl_FragColor = vec4( hdrSafe( gl_FragColor.rgb ), hdrAlpha( gl_FragColor.a ) );'), g);
      assert.ok(g.indexOf('#define HDR_GUARD') < g.indexOf('void main'));
      assert.equal(lastStatement(g), 'gl_FragColor.a = 1.0;');
      // OutputPass 是 GLSL ES 1.00：注入的东西只能有 ASCII
      assert.ok(ASCII.test(g), '输出着色器里有非 ASCII 字符');
    },
  ],
  [
    'guardFrag（景深）：main 改名、每一处读 tDiffuse 都洗、中途 return 的分支也洗得到',
    () => {
      const dof = `uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    if (base.a < 0.0) { gl_FragColor = base; return; }
    vec3 acc = base.rgb + texture2D( tDiffuse, vUv + 0.01 ).rgb;
    gl_FragColor = vec4(acc * 0.5, base.a);
  }`;
      const g = guardFrag(dof);
      assert.ok(g.includes('void hdrMain() {'), g);
      assert.ok(g.includes('vec4 base = hdrFetch( tDiffuse, vUv);') && g.includes('hdrFetch( tDiffuse, vUv + 0.01 ).rgb'), g);
      assert.ok(!/texture2D\s*\(\s*tDiffuse/.test(g), g);
      assert.equal(lastStatement(g), 'gl_FragColor = vec4( hdrSafe( gl_FragColor.rgb ), hdrAlpha( gl_FragColor.a ) );');
      assert.equal(guardFrag(g), g, '第二次调用不能再包一层');
      // 找不到 main：原样返回，提醒一次
      const w = warnsOf(() => assert.equal(guardFrag('float f;', undefined, 'test-no-main'), 'float f;'));
      assert.equal(w.length, 1);
    },
  ],
  [
    '看门狗读像素很省：平时 10 秒一次、环境贴图换了最多每秒一次、演示模式按平时算；每次只读一行',
    () => {
      // 一直在画（转镜头）、没有 poke：60 秒 → 头一次（构造时 due）+ 每 10 秒一次
      let r = rig();
      r.run(60);
      assert.ok(r.w.stats.checks >= 6 && r.w.stats.checks <= 7, `idle ${r.w.stats.checks}`);
      assert.equal(r.s.reads, r.w.stats.checks, '每次查只能读一次像素');
      // 拖时间跨过半点：每 0.5 秒换一张环境贴图（Engine.setTime 只在这时 poke）→ 最多每秒一次
      r = rig();
      r.run(30, (f) => f % 30 === 0 && r.w.poke());
      assert.ok(r.w.stats.checks >= 25 && r.w.stats.checks <= 31, `across ${r.w.stats.checks}`);
      // 演示模式：poke 照样来（夜里每 0.4 秒换一张），但按平时的 10 秒查
      r = rig();
      r.e.demo = true;
      r.run(60, (f) => f % 24 === 0 && r.w.poke());
      assert.ok(r.w.stats.checks >= 6 && r.w.stats.checks <= 7, `demo ${r.w.stats.checks}`);
      assert.equal(r.w.stats.trips, 0);
    },
  ],
  [
    '看门狗降档：连续 3 次空 → 关掉 GTAO / 景深 / 辉光再画（不编译新着色器）正常 → fast；还空 → 直接画正常 → safe；都空 → 不降',
    () => warnsOf(() => {
      // 辉光之类坏了：探测 A 正常 → fast，探测完 pass 的开关恢复
      let r = rig();
      r.s.look = 'transparent';
      r.s.probeLook.composer = 'ok';
      r.run(5);
      assert.deepEqual(r.s.lowered, [{ next: 'fast', reason: 'blank', quality: 'high' }]);
      assert.equal(r.w.stats.trips, 1);
      assert.equal(r.s.directRenders, 0, '探测 A 正常就不该直接画');
      assert.ok(r.e.gtao.enabled && r.e.dof.enabled && r.e.bloom.enabled, 'pass 的开关没恢复');
      // 输出那一步坏了：A 还是空、直接画正常 → 这台设备上 fast 也走同一条后期链 → safe
      r = rig();
      r.s.look = 'black';
      r.s.probeLook.direct = 'ok';
      r.run(5);
      assert.deepEqual(r.s.lowered.map((x) => x.next), ['safe']);
      // 画布自带 MSAA（fast 不走后期链）→ fast
      r = rig({ nativeAA: true });
      r.s.look = 'black';
      r.s.probeLook.direct = 'ok';
      r.run(5);
      assert.deepEqual(r.s.lowered.map((x) => x.next), ['fast']);
      // fast 档（后期链只有 MSAA + 输出）：直接画正常 → safe
      r = rig({ quality: 'fast', fx: false });
      r.s.look = 'transparent';
      r.s.probeLook.direct = 'ok';
      r.run(5);
      assert.deepEqual(r.s.lowered.map((x) => x.next), ['safe']);
      // 场景本身就是黑的：两种画法都空 → 不降，10 秒内不再查
      r = rig();
      r.s.look = 'black';
      r.run(8);
      assert.deepEqual(r.s.lowered, []);
      assert.equal(r.w.stats.probes, 1);
      assert.equal(r.w.stats.trips, 0);
      assert.match(r.w.stats.last, /probes blank/);
      // 已经在降档（着色器编译失败先到了，探测那一帧也可能触发）：不另记一次
      r = rig();
      r.w.degrade('transparent', 'fast');
      r.e._degrading = true;
      r.w.degrade('transparent', 'fast');
      assert.equal(r.w.stats.trips, 1);
      assert.equal(r.s.lowered.length, 1);
    }),
  ],
  [
    'HDR_MAX 不会让半精度溢出；GLSL 片段只有 ASCII',
    () => {
      // 场景（≤ HDR_MAX）+ 辉光合成（出口也夹到 HDR_MAX）叠加 ≤ 2 × HDR_MAX，要小于半精度的 65504
      assert.ok(2 * HDR_MAX < 65504);
      // 最亮的正常像素约 23：上限要远高于它（正常画面一个像素都不变）
      assert.ok(HDR_MAX >= 1024);
      assert.ok(ASCII.test(HDR_GLSL) && ASCII.test(HDR_COPY_FRAG));
      assert.ok(HDR_COPY_FRAG.includes('gl_FragColor = hdrFetch( tDiffuse, vUv );'));
    },
  ],
];

// 单独跑
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let failed = 0;
  for (const [name, fn] of hdrGuardTests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 3).join('\n    ')}`);
    }
  }
  console.log(`\n${hdrGuardTests.length - failed}/${hdrGuardTests.length} 通过`);
  if (failed) process.exit(1);
}
