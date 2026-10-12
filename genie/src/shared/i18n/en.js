// 英文词典总表：t('中文') 在英文模式查这里。按区域分文件，免得大家改同一个文件。
import base from './en-base.js';
import quiz from './en-quiz.js';
import studio from './en-studio.js';
import shell from './en-shell.js';
import logic from './en-logic.js';
import engine from './en-engine.js';
import floors from './en-floors.js';
import imp from './en-import.js';

export default { ...base, ...quiz, ...studio, ...shell, ...logic, ...engine, ...floors, ...imp };
