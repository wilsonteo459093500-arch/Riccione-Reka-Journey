// sound.js —— 旧入口：现在全部交给 sfx.js（WISH 音效：44 个原创、现场合成的声音，七种材质，全部在 D 宫五声上）。
// 现有的写法都不用改：import { sfx, isMuted, setMuted, unlock } from '../shared/sound.js'; sfx.tap() / pick() / flip() / rub() …
// 新的写法：sfx.play('scan') · play('reveal') · sfx.rub({ progress, speed })。每一页的按钮由入口的 installSfx() 自动出声。
// iPad：AudioContext 在第一下 pointerup / touchend / click / keydown 里自动解锁（sfx.js 自己挂好了监听）。

export { sfx, isMuted, setMuted, unlock, play, getAudioContext, installSfx } from './sfx.js';
export { default } from './sfx.js';
