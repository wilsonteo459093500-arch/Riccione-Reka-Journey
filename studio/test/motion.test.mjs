import assert from 'node:assert';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 导出的 HTML 写到 test/out/，浏览器端那套（test/browser.mjs）会读它
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });
import { toHyperFrames, toJianyingGuide, toVibeMotionPrompt, toVibeMotionOverlays } from '../src/services/exporters.js';
import { buildMotionSpec, flatTracks, waapiFrame, selectorFor } from '../src/services/motion.js';

const story = {
  title: '装修最容易后悔的 5 个决定',
  palette: { bg: '#F5F1EA', ink: '#1A1614', accent: '#2D4A3E' },
  font_feel: '衬线标题 + 无衬线正文',
  slides: [
    { index: 1, duration_s: 2.4, headline: '五个后悔的决定', sub: '第三个几乎每家都中', bg_kind: 'gradient', motion: '主文案逐字上浮淡入', transition_out: '叠化' },
    { index: 2, duration_s: 2.0, headline: '柜子做太浅', sub: '35cm 装不下行李箱', bg_kind: 'solid', motion: '整句上浮，副文案从右滑入' },
    { index: 3, duration_s: 2.2, headline: '插座只按现在算', bg_kind: 'solid', motion: '逐字对焦，虚焦对上' },
    { index: 4, duration_s: 1.8, headline: '灯光只做一层', sub: '主灯亮 ≠ 好看', bg_kind: 'gradient', motion: '逐字弹入，遮罩上推' },
    { index: 5, duration_s: 2.6, headline: '收藏起来再装', bg_kind: 'solid', motion: '逐字上浮' },
  ],
  caption: '测试文案',
  hashtags: ['#装修'],
};

// ---- spec ----
const spec = buildMotionSpec(story, { width: 1080, height: 1920 });
assert.strictEqual(spec.slides.length, 5, 'slide 数量');
assert.ok(Math.abs(spec.total - 11.0) < 0.001, `总时长应为 11.0，实际 ${spec.total}`);
assert.strictEqual(spec.slides[0].start, 0);
assert.ok(Math.abs(spec.slides[4].end - spec.total) < 0.001, '最后一屏的结束 = 总时长');

// 动作选择要真的按关键词走，不能全都落到默认值
assert.strictEqual(spec.slides[0].charMotion, 'charUp', 'slide1 逐字上浮');
assert.strictEqual(spec.slides[1].charMotion, 'wholeUp', 'slide2 整句');
assert.strictEqual(spec.slides[1].subMotion, 'slideLeft', 'slide2 副文案从右滑入');
assert.strictEqual(spec.slides[2].charMotion, 'charBlur', 'slide3 逐字对焦');
assert.strictEqual(spec.slides[3].charMotion, 'charScale', 'slide4 逐字弹入');

// from/to 必须写同一组 key，否则 WAAPI 会拿元素当前值补，预览和渲染就会飘
for (const t of flatTracks(spec)) {
  const a = Object.keys(t.from).sort().join(',');
  const b = Object.keys(t.to).sort().join(',');
  assert.strictEqual(a, b, `track ${t.id} 的 from/to key 不一致: ${a} vs ${b}`);
  assert.ok(t.start >= 0, `track ${t.id} 起点为负`);
  assert.ok(t.duration > 0, `track ${t.id} 时长为 0`);
}

// 逐字入场不能拖过这一屏的一半
for (const s of spec.slides) {
  const chars = s.tracks.filter((t) => t.target === 'char');
  if (chars.length < 2) continue;
  const span = chars[chars.length - 1].start - chars[0].start;
  assert.ok(span <= s.duration * 0.43 + 0.01, `第 ${s.index + 1} 屏逐字铺开 ${span.toFixed(2)}s 超过时长的 42%`);
}

// waapiFrame 要把散开的 transform 属性合成一条
const f = waapiFrame({ opacity: 0, translateY: '28px', scale: 0.9 });
assert.strictEqual(f.transform, 'translateY(28px) scale(0.9)', `transform 合成错误: ${f.transform}`);
assert.strictEqual(f.opacity, '0');

// 选择器要能对上导出 HTML 里的 data 属性
assert.strictEqual(selectorFor({ target: 'slide', slide: 2 }), '[data-slide="2"]');
assert.strictEqual(selectorFor({ target: 'char', slide: 1, charIndex: 3 }), '[data-slide="1"] [data-char="3"]');
assert.strictEqual(selectorFor({ target: 'sub', slide: 0 }), '[data-slide="0"] [data-el="sub"]');

// ---- HTML ----
const html = toHyperFrames(story, { width: 1080, height: 1920 });
assert.ok(html.includes('data-composition-id'), 'HyperFrames 属性');
assert.ok(html.includes('window.seekTo'), 'seek 钩子');
assert.ok(!/https?:\/\/(?!www\.w3)/.test(html.replace(/<!--[\s\S]*?-->/g, '')), '导出文件不能有外部依赖');
for (let i = 0; i < 5; i++) assert.ok(html.includes(`data-slide="${i}"`), `第 ${i} 屏`);
writeFileSync(join(OUT, 'post.html'), html);

// ---- Vibe Motion ----
const vibe = toVibeMotionPrompt(story);
assert.ok(vibe.includes('11.0s'), '总时长');
assert.ok(vibe.includes('Remotion 源码'), '要源码');
assert.ok(vibe.includes('1080×1920'), '画幅');
assert.strictEqual(toVibeMotionPrompt({ slides: [] }), null, '没有分镜就不该出简报');

// ---- 剪映 ----
const assets = [
  { id: 'A1', kind: 'video', name: '客厅原片.mp4' },
  { id: 'A2', kind: 'image', name: '玄关柜.jpg' },
  { id: 'A3', kind: 'image', name: '细节.jpg' },
];
const plan = {
  summary: '测试',
  aspect: '9:16',
  grade_preset: 'warm_cinematic',
  caption_style: 'brand_clean',
  timeline: [
    { slot: 1, beat: 'HOOK', assetId: 'A1', in: 3.2, out: 5.4, onscreen_text: '钩子', why: '最强画面' },
    { slot: 2, beat: 'SETUP', assetId: 'A2', in: 0, out: 2.5, reframe: '缓推 12%' },
    { slot: 3, beat: 'PROOF', assetId: 'A1', in: 12, out: 16, speed: 2 },
    { slot: 4, beat: 'PAYOFF', assetId: 'A3', in: 0, out: 3, reframe: 'pull out 10%' },
  ],
  music: { brief: '轻', search_terms: ['ambient'], cut_points_s: [0, 4], duck_under_vo_db: -14 },
  overlays: [{ after_slot: 2, text: '18万全包', type: '数据卡', duration_s: 2, style: '极简' }],
  qc: ['首帧可读'],
};
const jy = toJianyingGuide(plan, assets, { title: '测试片' });
assert.ok(jy.includes('Ctrl/Cmd + B'), '分割快捷键');
assert.ok(jy.includes('3.20s'), '入点');
assert.ok(jy.includes('2×'), '变速');
assert.ok(jy.includes('| 色温 | +12 |'), '调色表');
assert.ok(jy.includes('master.srt'), '字幕导入');
assert.ok(jy.includes('即梦'), '即梦附录');
// 缓推 12% → 100 → 112，中点 85% = 110.2
assert.ok(jy.includes('缩放 **112%**'), '推到 112%');
assert.ok(jy.includes('缩放 **110.2%**'), '中间缓动关键帧');
// pull out 10% → 从 110 拉回 100，中点 = 110 - 8.5 = 101.5
assert.ok(jy.includes('缓拉 10%'), '识别拉远');
assert.ok(jy.includes('缩放 **101.5%**'), '拉远的中间关键帧');
// 每一段只能拿到属于自己那种素材的指令
const block = (n) => jy.split(/^### /m).find((b) => b.startsWith(`第 ${n} 段`)) || '';
assert.ok(block(1).includes('分割'), '视频段要有分割');
assert.ok(!block(2).includes('分割'), '静图段不该有分割步骤');
assert.ok(!block(2).includes('变速'), '静图段不该有变速');
assert.ok(block(2).includes('缩放'), '静图段要有关键帧');
assert.ok(!block(3).includes('缩放'), '视频段不该有 Ken Burns 关键帧');
assert.ok(block(3).includes('2×'), '第 3 段变速');

const ov = toVibeMotionOverlays(plan, { format: '短视频' });
assert.ok(ov.includes('alpha'), '透明通道');
assert.ok(ov.includes('18万全包'), '卡文案');
assert.strictEqual(toVibeMotionOverlays({ overlays: [] }, {}), null, '没有卡就不该出指令');

console.log('✅ 所有断言通过');
console.log(`   spec: ${spec.slides.length} 屏 / ${spec.total}s / ${flatTracks(spec).length} 条 track`);
console.log(`   html: ${(html.length / 1024).toFixed(1)} KB`);
