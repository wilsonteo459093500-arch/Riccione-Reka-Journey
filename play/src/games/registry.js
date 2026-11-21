// 有哪些游戏。房间版的规则模组要有：id、minPlayers、maxPlayers、defaultOptions、normalizeOptions、start、act、leave、view
import * as codebreaker from './codebreaker/game.js';

export const ROOM_GAMES = { codebreaker };

// 首页显示的全部游戏（还没做的标「即将推出」）
export const CATALOG = [
  { id: 'codebreaker', ready: true, solo: true, room: true, players: '1–8' },
  { id: 'ox', ready: false, players: '1–2' },
  { id: 'camping', ready: false, players: '1+' },
  { id: 'xiangqi', ready: false, players: '1–2' },
  { id: 'junqi', ready: false, players: '1–4' },
  { id: 'forest', ready: false, players: '5–10' },
  { id: 'story', ready: false, players: '3–8' },
  { id: 'mahjong', ready: false, players: '1–4' },
  { id: 'artillery', ready: false, players: '1–4' },
  { id: 'maze', ready: false, players: '1–4' },
  { id: 'brawl', ready: false, players: '1–2' },
  { id: 'kart', ready: false, players: '1–6' },
];

export function roomGame(id) {
  const g = ROOM_GAMES[id];
  if (!g) throw new Error(`unknown game: ${id}`);
  return g;
}
