// node --import ./test/fixtures/boards/merged.mjs test/<suite>.test.mjs
// = 用一份「合并过的」板材库跑测试（真实板材合进来以后 npm test 也要是绿的）。
import { register } from 'node:module';

process.env.WISH_MERGED_LIBRARY = '1';
register('./merged-hooks.mjs', import.meta.url);
