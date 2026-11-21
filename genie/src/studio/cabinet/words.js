// 柜子细节的英文（src/shared/i18n/en-cabinet.js）：这个模块一载入就并进词典。
// Cab.jsx 第一个 import 它 —— 和 walk/words.js 一样不放进页面共用的第一块：没打开「柜子」的人不下载这些词。
import { addWords } from '../../shared/i18n.js';
import CABINET from '../../shared/i18n/en-cabinet.js';

addWords(CABINET);
