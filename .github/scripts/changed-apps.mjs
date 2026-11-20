// 找出这次推送改到了哪些软件（.github/apps.json 里的 dir）。
// 输出给 GitHub Actions：apps = 要测试 + 出版本的软件（JSON 数组），prod = 是不是正式版（main）。
//
// 规则：
// - 手动按「Run workflow」：只跑选的那个软件（选 all = 全部）
// - main：和上一次推送比；别的分支：和 main 的分岔点比（整条分支改过什么）
// - 改到 .github/（上线流程本身）：全部软件都跑一次，确认流程没坏
// - 文件夹在这条分支上不存在的软件（例：genie/ 还没合进来）：跳过
//
// 本机试：GITHUB_REF_NAME=某分支 node .github/scripts/changed-apps.mjs

import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const trySh = (cmd) => { try { return sh(cmd); } catch { return ''; } };

const { apps } = JSON.parse(readFileSync('.github/apps.json', 'utf8'));
const branch = process.env.GITHUB_REF_NAME || trySh('git rev-parse --abbrev-ref HEAD');
const event = process.env.GITHUB_EVENT_NAME || 'push';
const before = process.env.BEFORE_SHA || '';
const picked = (process.env.PICKED_APP || '').trim();
const prod = branch === 'main';

const present = apps.filter((a) => existsSync(a.dir));
let chosen;
let reason;

if (event === 'workflow_dispatch') {
  chosen = picked === 'all' ? present : present.filter((a) => a.id === picked);
  reason = `手动：${picked}`;
} else {
  const zero = /^0+$/.test(before);
  const known = before && !zero && trySh(`git cat-file -t ${before}`) === 'commit';
  let base;
  if (prod) {
    base = known ? before : '';
  } else {
    trySh('git fetch --no-tags --depth=200 origin main');
    base = trySh('git merge-base origin/main HEAD') || (known ? before : '');
  }
  if (!base) {
    chosen = present;
    reason = '找不到比较的起点：全部跑一次';
  } else {
    const files = trySh(`git diff --name-only ${base} HEAD`).split('\n').filter(Boolean);
    if (files.some((f) => f.startsWith('.github/'))) {
      chosen = present;
      reason = '改到上线流程（.github/）：全部跑一次';
    } else {
      chosen = present.filter((a) => files.some((f) => f.startsWith(`${a.dir}/`)));
      reason = `比较 ${base.slice(0, 7)}..HEAD，改了 ${files.length} 个文件`;
    }
  }
}

const out = chosen.map(({ id, name, dir, project }) => ({ id, name, dir, project }));
console.log(`分支 ${branch}（${prod ? '正式版' : '预览'}）· ${reason}`);
console.log(`要跑的软件：${out.map((a) => a.name).join('、') || '没有'}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `apps=${JSON.stringify(out)}\nprod=${prod}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `**${prod ? '正式版' : '预览'}** · ${reason}\n\n要跑的软件：${out.map((a) => a.name).join('、') || '没有（这次推送没改到任何软件）'}\n`,
  );
}
