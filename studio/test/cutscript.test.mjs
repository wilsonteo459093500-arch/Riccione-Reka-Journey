import assert from 'node:assert';
import { toDraftScripts } from '../src/services/cutscript.js';

// 用他们真实的文件名结构测 —— 带空格、括号、中文的都有
const assets = [
  { id: 'A1', kind: 'video', name: 'IMG_0756.MOV', duration: 12 },
  { id: 'A2', kind: 'video', name: 'WhatsApp Video 2026-06-10 at 2.11.26 PM (1).mp4', duration: 8 },
  { id: 'A3', kind: 'image', name: '玄关柜 成品.jpg' },
];

const plan = {
  aspect: '3:4',
  grade_preset: 'warm_cinematic',
  caption_style: 'bold_overlay',
  timeline: [
    { slot: 1, beat: 'HOOK', assetId: 'A1', in: 0.5, out: 2.0, onscreen_text: '房间大改造' },
    { slot: 2, beat: 'PROOF', assetId: 'A2', in: 0.8, out: 3.0, speed: 2, onscreen_text: '过程快剪' },
    { slot: 3, beat: 'PAYOFF', assetId: 'A3', in: 0, out: 2.5, reframe: '缓推 12%', onscreen_text: '成品' },
  ],
};

const { bat, sh, warnings, segments, res, burnSubs } = toDraftScripts(plan, assets);

// ---- 基本形状 ----
assert.strictEqual(segments, 3, '三拍三段');
assert.strictEqual(res, '720x960', '3:4 → 720x960');
assert.strictEqual(burnSubs, true);
assert.strictEqual(warnings.length, 0, JSON.stringify(warnings));

for (const script of [bat, sh]) {
  // 切点精确
  assert.ok(script.includes('-ss 0.500 -to 2.000'), '第 1 拍切点');
  assert.ok(script.includes('-ss 0.800 -to 3.000'), '第 2 拍切点');
  // 变速：视频 setpts + 音频 atempo 成对出现
  assert.ok(script.includes('setpts=PTS/2'), '2× 要有 setpts');
  assert.ok(script.includes('atempo=2'), '2× 要有 atempo');
  // 音频淡入淡出（第 2 拍 2.2s/2=1.1s，淡出点 1.07）
  assert.ok(script.includes('afade=t=out:st=1.070:d=0.03'), '淡出点按变速后的时长算');
  // 静图：ease-out-cubic 的 zoompan，不是线性
  assert.ok(script.includes("zoompan=z='1.0000+(1.1200-1.0000)*(1-pow(1-on/75,3))'"), '缓推 12% × 2.5s = 75 帧，带缓动');
  assert.ok(script.includes(`scale=1440:1920`), '静图先放大到 2 倍再 zoompan');
  // 调色进了每一段
  assert.ok(script.split('colorbalance=rs=.04').length >= 4, '暖调滤镜要进每一段（3 段 + 可能的字幕步不带）');
  // 统一编码参数（concat -c copy 的前提）
  assert.ok(script.includes('-ar 48000 -ac 2'), '音频参数统一');
  // 字幕最后烧，用样式
  assert.ok(script.includes("subtitles=master.srt:force_style='FontName=Helvetica,FontSize=18,Bold=1"), '烧字幕带样式');
  assert.ok(!script.includes('undefined') && !script.includes('NaN'), '不能有 undefined/NaN');
}

// ---- 平台差异 ----
// Windows：CRLF、无 BOM、第一行 ASCII、chcp 在中文之前、双引号包路径、错误就停
assert.ok(bat.startsWith('@echo off\r\n'), 'bat 第一行必须是 @echo off（无 BOM）');
assert.ok(bat.indexOf('chcp 65001') < bat.indexOf('REM 本脚本'), 'chcp 要在任何中文输出之前');
assert.ok(bat.includes('"WhatsApp Video 2026-06-10 at 2.11.26 PM (1).mp4"'), '带空格括号的文件名要整体加双引号');
assert.ok(bat.includes('"玄关柜 成品.jpg"'), '中文文件名加双引号');
assert.ok((bat.match(/\|\| goto :fail/g) || []).length >= 4, '每个 ffmpeg 步骤都要能失败即停');
assert.ok(bat.includes('winget install ffmpeg'), '要告诉 Windows 用户怎么装');
assert.ok(!bat.includes('\n\n') || bat.includes('\r\n'), 'bat 用 CRLF');

// sh：单引号转义、set -euo
assert.ok(sh.startsWith('#!/usr/bin/env bash'), 'sh shebang');
assert.ok(sh.includes('set -euo pipefail'));
assert.ok(sh.includes("'WhatsApp Video 2026-06-10 at 2.11.26 PM (1).mp4'"), 'sh 用单引号包路径');
assert.ok(sh.includes('brew install ffmpeg'));

// ---- 边界 ----
// 引用不存在的素材 → 警告 + 不生成那段命令
const ghost = toDraftScripts(
  { ...plan, timeline: [...plan.timeline, { slot: 4, beat: 'CTA', assetId: 'A9', in: 0, out: 2 }] },
  assets
);
assert.strictEqual(ghost.segments, 3, '幽灵素材那段不生成');
assert.ok(ghost.warnings.some((w) => w.includes('A9')), '要警告');
assert.ok(ghost.bat.includes('REM   - 第 4 拍'), '警告要写进脚本头部');

// 变速超出 atempo 范围 → 警告 + 按原速
const fast = toDraftScripts(
  { ...plan, timeline: [{ slot: 1, beat: 'HOOK', assetId: 'A1', in: 0, out: 4, speed: 3 }] },
  assets
);
assert.ok(fast.warnings.some((w) => w.includes('3×')), '3× 超范围要警告');
assert.ok(fast.bat.includes('atempo=2'), '夹到 2×');

// 字幕风格 none → 不烧字幕，直接出 draft.mp4
const noSub = toDraftScripts({ ...plan, caption_style: 'none', captions: [] }, assets);
assert.strictEqual(noSub.burnSubs, false);
assert.ok(!noSub.bat.includes('subtitles='), 'none 不该有烧字幕步骤');
assert.ok(noSub.bat.includes('draft.mp4'), '仍然出 draft.mp4');

// 9:16 分辨率
assert.strictEqual(toDraftScripts({ ...plan, aspect: '9:16' }, assets).res, '720x1280');
// 未知画幅回退 9:16
assert.strictEqual(toDraftScripts({ ...plan, aspect: '啥' }, assets).res, '720x1280');

// 空时间轴不崩
const empty = toDraftScripts({ timeline: [] }, []);
assert.strictEqual(empty.segments, 0);

console.log('✅ cutscript 全部断言通过');
console.log(`   ${segments} 段 · ${res} · 切点/变速/缓动 zoompan/调色/字幕样式/CRLF/引号 全验证`);
