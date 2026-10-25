// 板材库 / 板材导入界面的英文（src/shared/i18n/en-boards.js）：这个模块一载入就并进词典。
// BoardsApp.jsx 第一个 import 它 —— 比 BoardLibrary / BoardImporter / ui.jsx 先跑，它们模块顶上的 t() 也查得到。
// 和 en-export.js 一样不放进页面共用的第一块：客人的测验、入口页、许愿模式、3D 工作室都不下载这些词。
import { addWords } from '../../shared/i18n.js';
import EB from '../../shared/i18n/en-boards.js';

addWords(EB);
