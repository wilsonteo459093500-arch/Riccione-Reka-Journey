// 走进去的英文（src/shared/i18n/en-walk*.js）：这个模块一载入就并进词典。
// WalkMode.jsx 第一个 import 它 —— 比别的 walk 模块先跑，它们模块顶上的 t() 也查得到。
// 和 en-export.js 一样不放进页面共用的第一块：没点「走进去」的人不下载这些词。
// 三个文件各有各的主人（SPEC「House rules」）：en-walk.js 主体 / 量尺，en-walktour.js 潘吉带逛，en-walktools.js 工具面板。
import { addWords } from '../../shared/i18n.js';
import WALK from '../../shared/i18n/en-walk.js';
import TOUR from '../../shared/i18n/en-walktour.js';
import TOOLS from '../../shared/i18n/en-walktools.js';

addWords({ ...WALK, ...TOUR, ...TOOLS });
