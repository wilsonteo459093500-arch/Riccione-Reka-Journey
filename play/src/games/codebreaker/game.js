// 密码机的「房间版」：房主手机跑这里的规则，别人的动作传过来由这里判定。
//
// 两种玩法：
//   race   比快：电脑出同一题，大家一起猜，比谁先猜中（猜得少、用时短排前面）
//   setter 出题：轮流一个人出题，其他人猜；出题人看得到大家猜到哪里
//
// view(state, pid) 只给这个玩家该看的：没结束前，猜的人看不到密码，也看不到别人猜了什么颜色。

import { config, isValidCode, randomCode, score, isSolved } from './rules.js';

export const id = 'codebreaker';
export const minPlayers = 2;
export const maxPlayers = 8;
export const MODES = ['race', 'setter'];
export const defaultOptions = { mode: 'race', difficulty: 'easy' };

export function normalizeOptions(opts = {}) {
  return {
    mode: MODES.includes(opts.mode) ? opts.mode : defaultOptions.mode,
    difficulty: ['easy', 'normal', 'hard'].includes(opts.difficulty) ? opts.difficulty : defaultOptions.difficulty,
  };
}

function newRound(prev, { order, options, round, setterIndex, now, rng, scores }) {
  const guessers = options.mode === 'setter' ? order.filter((_, i) => i !== setterIndex) : order;
  const boards = {};
  for (const pid of guessers) boards[pid] = { guesses: [], solvedAt: null, out: false };
  const setterPid = options.mode === 'setter' ? order[setterIndex] : null;
  return {
    mode: options.mode,
    difficulty: options.difficulty,
    order,
    round,
    setterIndex,
    setterPid,
    stage: options.mode === 'setter' ? 'setting' : 'guessing',
    secret: options.mode === 'setter' ? null : randomCode(config(options.difficulty), rng),
    startedAt: options.mode === 'setter' ? null : now,
    boards,
    scores: scores || Object.fromEntries(order.map((p) => [p, 0])),
    ranking: null,
    left: prev?.left || [],
  };
}

export function start(playerIds, options, { now, rng }) {
  const opts = normalizeOptions(options);
  if (playerIds.length < minPlayers) throw new GameError('not_enough_players');
  return newRound(null, { order: [...playerIds], options: opts, round: 1, setterIndex: 0, now, rng });
}

export class GameError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function roundOver(state) {
  return Object.values(state.boards).every((b) => b.solvedAt !== null || b.out);
}

function rankRound(state) {
  const rows = Object.entries(state.boards).map(([pid, b]) => ({
    pid,
    solved: b.solvedAt !== null,
    tries: b.guesses.length,
    ms: b.solvedAt !== null ? b.solvedAt - state.startedAt : null,
  }));
  rows.sort((a, b) => {
    if (a.solved !== b.solved) return a.solved ? -1 : 1;
    if (!a.solved) return 0;
    if (a.tries !== b.tries) return a.tries - b.tries;
    return a.ms - b.ms;
  });
  return rows;
}

function finishRound(state) {
  const ranking = rankRound(state);
  const scores = { ...state.scores };
  // 猜中的人 +1，第一名再 +1；出题模式里，出题人每难倒一个人 +1
  ranking.forEach((r, i) => {
    if (r.solved) scores[r.pid] = (scores[r.pid] || 0) + 1 + (i === 0 ? 1 : 0);
  });
  if (state.setterPid) {
    const stumped = ranking.filter((r) => !r.solved && !state.left.includes(r.pid)).length;
    scores[state.setterPid] = (scores[state.setterPid] || 0) + stumped;
  }
  return { ...state, stage: 'over', ranking, scores };
}

/**
 * 套用一个动作，回传新的 state（不改旧的）。不合法就丢 GameError。
 * ctx: { now, rng, isHost }
 */
export function act(state, pid, action, ctx) {
  const cfg = config(state.difficulty);
  switch (action?.type) {
    case 'set': {
      if (state.stage !== 'setting') throw new GameError('wrong_stage');
      if (pid !== state.setterPid) throw new GameError('not_setter');
      if (!isValidCode(cfg, action.code)) throw new GameError('invalid_code');
      return { ...state, stage: 'guessing', secret: [...action.code], startedAt: ctx.now };
    }
    case 'guess': {
      if (state.stage !== 'guessing') throw new GameError('wrong_stage');
      const board = state.boards[pid];
      if (!board) throw new GameError('not_guesser');
      if (board.solvedAt !== null || board.out) throw new GameError('already_done');
      if (!isValidCode(cfg, action.code)) throw new GameError('invalid_code');
      const r = score(state.secret, action.code);
      const guesses = [...board.guesses, { code: [...action.code], exact: r.exact, near: r.near }];
      const solved = isSolved(cfg, r);
      const next = {
        ...state,
        boards: {
          ...state.boards,
          [pid]: { guesses, solvedAt: solved ? ctx.now : null, out: !solved && guesses.length >= cfg.tries },
        },
      };
      return roundOver(next) ? finishRound(next) : next;
    }
    case 'next': {
      if (!ctx.isHost) throw new GameError('not_host');
      if (state.stage !== 'over') throw new GameError('wrong_stage');
      const active = state.order.filter((p) => !state.left.includes(p));
      if (active.length < minPlayers) throw new GameError('not_enough_players');
      let setterIndex = state.setterIndex;
      if (state.mode === 'setter') {
        // 下一个还在房里的人出题
        do setterIndex = (setterIndex + 1) % state.order.length;
        while (state.left.includes(state.order[setterIndex]));
      }
      const round = newRound(state, {
        order: state.order,
        options: { mode: state.mode, difficulty: state.difficulty },
        round: state.round + 1,
        setterIndex,
        now: ctx.now,
        rng: ctx.rng,
        scores: state.scores,
      });
      // 离开的人不再发板
      for (const p of state.left) delete round.boards[p];
      if (round.setterPid && state.left.includes(round.setterPid)) throw new GameError('not_enough_players');
      return round;
    }
    default:
      throw new GameError('unknown_action');
  }
}

/** 有人被请出房间 / 离开：当作放弃这一局 */
export function leave(state, pid) {
  const left = state.left.includes(pid) ? state.left : [...state.left, pid];
  let next = { ...state, left };
  if (next.boards[pid] && next.boards[pid].solvedAt === null) {
    next = { ...next, boards: { ...next.boards, [pid]: { ...next.boards[pid], out: true } } };
  }
  if (pid === state.setterPid && state.stage === 'setting') {
    // 出题人走了：这一局直接结束，房主按「下一局」换人
    return { ...next, stage: 'over', ranking: [], secret: null };
  }
  if (next.stage === 'guessing' && Object.keys(next.boards).length && roundOver(next)) return finishRound(next);
  return next;
}

export function view(state, pid) {
  const isSetter = pid != null && pid === state.setterPid;
  const over = state.stage === 'over';
  const showAll = over || isSetter;
  const players = state.order.map((p) => {
    const b = state.boards[p];
    return {
      pid: p,
      role: p === state.setterPid ? 'setter' : 'guesser',
      tries: b ? b.guesses.length : 0,
      solved: b ? b.solvedAt !== null : false,
      out: b ? b.out : false,
      left: state.left.includes(p),
      score: state.scores[p] || 0,
      // 看得到全部的时候，才给每一步的颜色
      guesses: b && showAll ? b.guesses : null,
    };
  });
  return {
    game: id,
    mode: state.mode,
    difficulty: state.difficulty,
    round: state.round,
    stage: state.stage,
    setterPid: state.setterPid,
    isSetter,
    startedAt: state.startedAt,
    secret: showAll ? state.secret : null,
    mine: state.boards[pid] || null,
    players,
    ranking: over ? state.ranking : null,
  };
}
