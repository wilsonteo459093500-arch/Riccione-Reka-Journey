// 房间的规则（纯逻辑）：谁在房里、谁是房主、开始 / 踢人 / 回大厅，游戏动作转给游戏模组。
// 只在房主手机上跑。别人的手机只收到 viewFor() 算出来的画面资料。

import { roomGame } from '../games/registry.js';

export const ONLINE_MS = 25_000; // 这么久没听到就算「断线」
export const MAX_NAME = 16;

export class RoomError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function cleanName(name) {
  const s = String(name || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, MAX_NAME);
  return s || '?';
}

export function createRoom({ code, gameId, hostPid, hostName, now, options }) {
  const game = roomGame(gameId);
  return {
    code,
    gameId,
    hostPid,
    players: [{ pid: hostPid, name: cleanName(hostName), joinedAt: now, lastSeen: now }],
    kicked: [],
    phase: 'lobby',
    options: game.normalizeOptions(options),
    game: null,
    ver: 1,
  };
}

const bump = (room, patch) => ({ ...room, ...patch, ver: room.ver + 1 });

function requireHost(room, pid) {
  if (pid !== room.hostPid) throw new RoomError('not_host');
}

function inGame(room, pid) {
  return !!room.game && room.game.order.includes(pid);
}

export function join(room, { pid, name, now }) {
  if (room.kicked.includes(pid)) throw new RoomError('kicked');
  const existing = room.players.find((p) => p.pid === pid);
  if (existing) {
    const n = name ? cleanName(name) : existing.name;
    return bump(room, {
      players: room.players.map((p) => (p.pid === pid ? { ...p, name: n, lastSeen: now } : p)),
    });
  }
  if (room.players.length >= roomGame(room.gameId).maxPlayers) throw new RoomError('room_full');
  return bump(room, { players: [...room.players, { pid, name: cleanName(name), joinedAt: now, lastSeen: now }] });
}

/** 心跳：只更新 lastSeen，不加版本（画面上的「在线」由 viewFor 当下算） */
export function seen(room, pid, now) {
  if (!room.players.some((p) => p.pid === pid)) return room;
  return { ...room, players: room.players.map((p) => (p.pid === pid ? { ...p, lastSeen: now } : p)) };
}

function removePlayer(room, pid) {
  let game = room.game;
  if (game && inGame(room, pid)) game = roomGame(room.gameId).leave(game, pid);
  return { players: room.players.filter((p) => p.pid !== pid), game };
}

export function kick(room, byPid, pid) {
  requireHost(room, byPid);
  if (pid === room.hostPid) throw new RoomError('cannot_kick_host');
  if (!room.players.some((p) => p.pid === pid)) return room;
  return bump(room, { ...removePlayer(room, pid), kicked: [...room.kicked, pid] });
}

export function leave(room, pid) {
  if (pid === room.hostPid) throw new RoomError('host_cannot_leave');
  if (!room.players.some((p) => p.pid === pid)) return room;
  return bump(room, removePlayer(room, pid));
}

export function setOptions(room, byPid, options) {
  requireHost(room, byPid);
  if (room.phase !== 'lobby') throw new RoomError('wrong_phase');
  return bump(room, { options: roomGame(room.gameId).normalizeOptions({ ...room.options, ...options }) });
}

export function startGame(room, byPid, ctx) {
  requireHost(room, byPid);
  if (room.phase !== 'lobby') throw new RoomError('wrong_phase');
  const game = roomGame(room.gameId);
  if (room.players.length < game.minPlayers) throw new RoomError('not_enough_players');
  const order = room.players.map((p) => p.pid);
  return bump(room, { phase: 'playing', game: game.start(order, room.options, ctx) });
}

export function toLobby(room, byPid) {
  requireHost(room, byPid);
  return bump(room, { phase: 'lobby', game: null });
}

export function gameAction(room, pid, action, ctx) {
  if (room.phase !== 'playing' || !room.game) throw new RoomError('wrong_phase');
  if (!room.players.some((p) => p.pid === pid)) throw new RoomError('not_in_room');
  const g = roomGame(room.gameId);
  return bump(room, { game: g.act(room.game, pid, action, { ...ctx, isHost: pid === room.hostPid }) });
}

/**
 * 一则从玩家传来的讯息 → 新的房间。
 * msg: { t: 'hello' | 'act', ... }
 */
export function handle(room, pid, msg, ctx) {
  switch (msg?.t) {
    case 'hello':
      return join(room, { pid, name: msg.name, now: ctx.now });
    case 'hb':
      return seen(room, pid, ctx.now);
    case 'bye':
      return leave(room, pid);
    case 'act': {
      const a = msg.action || {};
      switch (a.type) {
        case 'options':
          return setOptions(room, pid, a.options || {});
        case 'start':
          return startGame(room, pid, ctx);
        case 'lobby':
          return toLobby(room, pid);
        case 'kick':
          return kick(room, pid, a.pid);
        default:
          return gameAction(seen(room, pid, ctx.now), pid, a, ctx);
      }
    }
    default:
      throw new RoomError('unknown_message');
  }
}

export function viewFor(room, pid, now) {
  const me = room.players.find((p) => p.pid === pid);
  const g = roomGame(room.gameId);
  return {
    code: room.code,
    gameId: room.gameId,
    ver: room.ver,
    me: pid,
    inRoom: !!me,
    isHost: pid === room.hostPid,
    hostPid: room.hostPid,
    phase: room.phase,
    options: room.options,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    players: room.players.map((p) => ({
      pid: p.pid,
      name: p.name,
      isHost: p.pid === room.hostPid,
      online: p.pid === room.hostPid || now - p.lastSeen < ONLINE_MS,
    })),
    spectator: room.phase === 'playing' && !inGame(room, pid),
    game: room.game && inGame(room, pid) ? g.view(room.game, pid) : room.game ? g.view(room.game, null) : null,
  };
}
