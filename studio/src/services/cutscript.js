// 一键出草稿 —— 把排好的时间轴翻译成一个能直接双击的 ffmpeg 脚本。
//
// 为什么是「生成脚本」而不是「浏览器里直接剪」：
//   查证过（2026-08）：ffmpeg.wasm 单线程在还不错的笔记本上 1080p H.264 只有 ~25fps，
//   文件系统 2GB 上限，多线程版官方自己标注 unstable —— 手机拍的 4K MOV 一进去就是
//   十几分钟起步甚至直接内存爆掉。WebCodecs（WebAV）快 20 倍，但那是一个多天的集成项目。
//   而设计师的电脑上跑原生 ffmpeg，是全速的：30 秒的草稿几十秒就出来。
//
// 所以分工是：
//   浏览器负责「想清楚怎么剪」（已有），脚本负责「按方案落刀」（这里），
//   剪映负责「最后的打磨」（操作单已有）。
//   草稿的意义是把「审片循环」从手剪 30 分钟压到跑脚本 1 分钟 ——
//   内容团队真正的时间都烧在「剪完发现不对再来一遍」上。
//
// 草稿刻意不做的事（写进脚本头部注释，不藏着）：
//   转场（全部硬切）、叠加图形卡、BGM、口播 —— 这些留给终稿。

import { gradeById, captionStyleById } from '../constants.js';
import { withOutputTimes, planDuration, kenBurns, toSRT, captionsFromTimeline } from './exporters.js';

/** 画幅 → 草稿分辨率（720 档，够审片，导出快） */
const RES = {
  '9:16': [720, 1280],
  '3:4': [720, 960],
  '16:9': [1280, 720],
  '1:1': [720, 720],
  '4:3': [960, 720],
};

const FPS = 30;

/**
 * ease-out-cubic 的 zoompan 表达式。
 * zoompan 默认线性 —— 匀速推拉是「一眼假」最主要的来源，跟剪映操作单里
 * 用三点关键帧逼近是同一个问题的同一个解，只是这里可以直接写真曲线。
 */
function zoomExpr(from, to, frames) {
  const f = (from / 100).toFixed(4);
  const t = (to / 100).toFixed(4);
  return `${f}+(${t}-${f})*(1-pow(1-on/${frames},3))`;
}

/**
 * 生成 Windows (.bat) 和 macOS/Linux (.sh) 两个草稿脚本。
 *
 * @param {object} plan
 * @param {Array}  assets
 * @param {object} [opts] { srtName }
 * @returns {{ bat:string, sh:string, warnings:string[], segments:number, outName:string }}
 */
export function toDraftScripts(plan, assets, opts = {}) {
  const srtName = opts.srtName || 'master.srt';
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
  const timed = withOutputTimes(plan.timeline || []);
  const [W, H] = RES[plan.aspect] || RES['9:16'];
  const grade = gradeById(plan.grade_preset);
  const cap = captionStyleById(plan.caption_style);
  const burnSubs = !!cap.ass && (plan.captions?.length || captionsFromTimeline(plan.timeline || []).length);
  const total = planDuration(plan.timeline || []);

  const warnings = [];
  const segs = []; // { name, cmd(quote) }  cmd 是「与平台无关的 ffmpeg 参数串」，两个壳共用

  // 统一的编码参数 —— 所有段完全一致，concat 才能 -c copy 直拼不重编
  const VENC = `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -r ${FPS}`;
  const AENC = `-c:a aac -b:a 128k -ar 48000 -ac 2`;
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
  const gradeChain = grade.filter ? `,${grade.filter}` : '';

  timed.forEach((r, i) => {
    const a = byId[r.assetId];
    const n = String(i + 1).padStart(2, '0');
    const name = `seg_${n}.mp4`;
    if (!a) {
      warnings.push(`第 ${r.slot} 拍引用的素材 ${r.assetId} 不在素材池里 —— 草稿里会缺这一段`);
      return;
    }

    if (a.kind === 'image') {
      const d = r.output_duration;
      const frames = Math.max(2, Math.round(d * FPS));
      const kb = kenBurns(r.reframe);
      // 先放大到 2 倍再 zoompan，亚像素才不抖（zoompan 的老坑）
      const vf =
        `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
        `zoompan=z='${zoomExpr(kb.from, kb.to, frames)}'` +
        `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}` +
        `${gradeChain},format=yuv420p[v]`;
      segs.push({
        name,
        label: `第 ${r.slot} 拍 · 静图 ${a.name} · ${kb.label}`,
        cmd: (q) =>
          `-y -v error -stats -i ${q(a.name)} -f lavfi -t ${d.toFixed(2)} -i anullsrc=r=48000:cl=stereo ` +
          `-filter_complex "${vf}" -map "[v]" -map 1:a -t ${d.toFixed(2)} ${VENC} ${AENC}`,
      });
      return;
    }

    const speed = Number(r.speed) || 1;
    if (speed < 0.5 || speed > 2) {
      warnings.push(`第 ${r.slot} 拍变速 ${speed}× 超出 atempo 的 0.5–2 范围，草稿按原速剪，终稿在剪映里做`);
    }
    const sp = Math.min(2, Math.max(0.5, speed));
    const d = r.output_duration;
    const fadeOut = Math.max(0, d - 0.03).toFixed(3);

    const vparts = [fit, `fps=${FPS}`];
    if (sp !== 1) vparts.push(`setpts=PTS/${sp}`);
    const vfChain = vparts.join(',') + gradeChain;

    const aparts = [];
    if (sp !== 1) aparts.push(`atempo=${sp}`);
    // 每个切点 30ms 淡入淡出 —— 没有它拼起来会有爆音
    aparts.push(`afade=t=in:st=0:d=0.03`, `afade=t=out:st=${fadeOut}:d=0.03`);

    segs.push({
      name,
      label: `第 ${r.slot} 拍 · ${a.name} ${Number(r.in).toFixed(2)}–${Number(r.out).toFixed(2)}s${sp !== 1 ? ` · ${sp}×` : ''}`,
      cmd: (q) =>
        `-y -v error -stats -ss ${Number(r.in).toFixed(3)} -to ${Number(r.out).toFixed(3)} -i ${q(a.name)} ` +
        `-vf "${vfChain}" -af "${aparts.join(',')}" ${VENC} ${AENC}`,
    });
  });

  const inputFiles = [...new Set(timed.map((r) => byId[r.assetId]?.name).filter(Boolean))];
  const outName = 'draft.mp4';
  const subStyle = String(cap.ass || '').replace(/"/g, '');
  const steps = segs.length + 1 + (burnSubs ? 1 : 0);

  const header = [
    `本脚本由 CIPTA STUDIO 生成 —— 按已排好的时间轴自动出一版 ${W}x${H} 草稿`,
    `成片 ${total.toFixed(1)}s / ${segs.length} 段 / 调色 ${grade.label}${burnSubs ? ` / 字幕 ${cap.label}` : ''}`,
    ``,
    `用法：把这个脚本和 ${srtName} 一起放进素材文件夹，双击运行。`,
    `需要先装一次 ffmpeg：Windows 跑 winget install ffmpeg；Mac 跑 brew install ffmpeg`,
    ``,
    `草稿只用来审：节奏、切点、字幕对不对。这些确认了再进剪映做终稿。`,
    `草稿刻意不做：转场（全硬切）、叠加图形卡、BGM、口播。`,
    ...(warnings.length ? [``, `注意：`, ...warnings.map((w) => `  - ${w}`)] : []),
  ];

  // ---------------- Windows .bat ----------------
  // 细节都有原因：
  //   - 第一行必须是 ASCII（@echo off），文件存 UTF-8 无 BOM —— 有 BOM cmd 会把头三个字节当命令
  //   - chcp 65001 在任何中文输出之前，否则中文文件名全变问号
  //   - 每步 || goto :fail，出错停在原地而不是带着坏段往下拼
  const bq = (s) => `"${s}"`;
  const bat = [
    `@echo off`,
    `chcp 65001 >nul`,
    `setlocal`,
    ...header.map((l) => (l ? `REM ${l}` : `REM`)),
    ``,
    `where ffmpeg >nul 2>nul || (echo 没找到 ffmpeg —— 先跑一次: winget install ffmpeg  然后重开这个窗口 & pause & exit /b 1)`,
    `if not exist ${bq(inputFiles[0] || srtName)} (echo 找不到素材 —— 把这个脚本放进放素材的那个文件夹再双击 & pause & exit /b 1)`,
    `if not exist edit mkdir edit`,
    `if not exist edit\\draft_tmp mkdir edit\\draft_tmp`,
    ``,
    ...segs.flatMap((s2, i) => [
      `echo [${i + 1}/${steps}] ${s2.label}`,
      `ffmpeg ${s2.cmd(bq)} ${bq(`edit\\draft_tmp\\${s2.name}`)} || goto :fail`,
    ]),
    ``,
    `echo [${segs.length + 1}/${steps}] 拼接`,
    `(`,
    ...segs.map((s2) => `  echo file '${s2.name}'`),
    `) > ${bq('edit\\draft_tmp\\list.txt')}`,
    `ffmpeg -y -v error -f concat -safe 0 -i ${bq('edit\\draft_tmp\\list.txt')} -c copy ${bq(`edit\\${burnSubs ? 'draft_nosub.mp4' : outName}`)} || goto :fail`,
    ...(burnSubs
      ? [
          ``,
          `echo [${steps}/${steps}] 烧字幕`,
          `if not exist ${bq(srtName)} (echo 找不到 ${srtName} —— 从工作台下载后放到这个文件夹 & goto :fail)`,
          `ffmpeg -y -v error -stats -i ${bq('edit\\draft_nosub.mp4')} -vf "subtitles=${srtName}:force_style='${subStyle}'" ${VENC} -c:a copy ${bq(`edit\\${outName}`)} || goto :fail`,
        ]
      : []),
    ``,
    `echo.`,
    `echo 完成 —— edit\\${outName}`,
    `pause`,
    `exit /b 0`,
    ``,
    `:fail`,
    `echo.`,
    `echo 出错了 —— 把上面的红字截图，发给 Claude 就能修`,
    `pause`,
    `exit /b 1`,
    ``,
  ].join('\r\n');

  // ---------------- macOS / Linux .sh ----------------
  const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const sh = [
    `#!/usr/bin/env bash`,
    `set -euo pipefail`,
    ...header.map((l) => (l ? `# ${l}` : `#`)),
    ``,
    `command -v ffmpeg >/dev/null || { echo "没找到 ffmpeg —— 先跑: brew install ffmpeg"; exit 1; }`,
    `mkdir -p edit/draft_tmp`,
    ``,
    ...segs.flatMap((s2, i) => [
      `echo "[${i + 1}/${steps}] ${s2.label}"`,
      `ffmpeg ${s2.cmd(sq)} ${sq(`edit/draft_tmp/${s2.name}`)}`,
    ]),
    ``,
    `echo "[${segs.length + 1}/${steps}] 拼接"`,
    `printf '%s\\n' ${segs.map((s2) => sq(`file '${s2.name}'`)).join(' ')} > edit/draft_tmp/list.txt`,
    `ffmpeg -y -v error -f concat -safe 0 -i edit/draft_tmp/list.txt -c copy ${sq(`edit/${burnSubs ? 'draft_nosub.mp4' : outName}`)}`,
    ...(burnSubs
      ? [
          `echo "[${steps}/${steps}] 烧字幕"`,
          `ffmpeg -y -v error -stats -i edit/draft_nosub.mp4 -vf "subtitles=${srtName}:force_style='${subStyle}'" ${VENC} -c:a copy ${sq(`edit/${outName}`)}`,
        ]
      : []),
    ``,
    `echo "完成 —— edit/${outName}"`,
    ``,
  ].join('\n');

  return { bat, sh, warnings, segments: segs.length, outName, res: `${W}x${H}`, burnSubs: !!burnSubs };
}
