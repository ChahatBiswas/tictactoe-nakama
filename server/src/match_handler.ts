import {
  MatchState, MoveMessage, MatchLabel,
  OpCode, TICK_RATE, TURN_TIMEOUT_SEC, checkWinner,
} from "./types";

// Records W/L/D + streak in storage, and points in leaderboard
function recordMatchResult(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: MatchState
): void {
  if (state.winner === null) return;
  const playerIds = Object.keys(state.players);
  if (playerIds.length < 2) return;
  const isDraw = state.winner === "draw";

  for (const playerId of playerIds) {
    const isWinner = !isDraw && state.winner === playerId;
    try {
      // Get username
      let username = playerId.slice(0, 8);
      try {
        const acct = nk.accountGetId(playerId);
        if (acct.user && acct.user.username) username = acct.user.username;
      } catch (_e) {}

      // Read existing stats from storage
      let wins = 0;
      let losses = 0;
      let draws = 0;
      let streak = 0;
      let bestStreak = 0;
      try {
        const stored = nk.storageRead([{ collection: "stats", key: "record", userId: playerId }]);
        if (stored.length > 0) {
          const v = stored[0].value as { wins?: number; losses?: number; draws?: number; streak?: number; bestStreak?: number };
          wins = v.wins ?? 0;
          losses = v.losses ?? 0;
          draws = v.draws ?? 0;
          streak = v.streak ?? 0;
          bestStreak = v.bestStreak ?? 0;
        }
      } catch (_e) {}

      // Update stats
      if (isWinner) {
        wins = wins + 1;
        streak = streak + 1;
        if (streak > bestStreak) bestStreak = streak;
      } else if (isDraw) {
        draws = draws + 1;
        // draws don't break win streak
      } else {
        losses = losses + 1;
        streak = 0;
      }

      // Persist stats
      nk.storageWrite([{
        collection: "stats",
        key: "record",
        userId: playerId,
        value: {
          wins: wins,
          losses: losses,
          draws: draws,
          streak: streak,
          bestStreak: bestStreak,
        },
        permissionRead: 2,
        permissionWrite: 0,
      }]);

      // Write points to leaderboard (incr operator adds to running total)
      const points = isWinner ? 200 : (isDraw ? 10 : 0);
      nk.leaderboardRecordWrite("tictactoe_wins", playerId, username, points, 0, {});

      logger.info("Stats for %s: W=%d L=%d D=%d streak=%d +%dpts", playerId, wins, losses, draws, streak, points);
    } catch (e) {
      logger.error("recordMatchResult failed for %s: %s", playerId, String(e));
    }
  }
}

export const matchInit: nkruntime.MatchInitFunction<MatchState> = (
  _ctx, logger, _nk, params
) => {
  const timedMode = params?.mode === "timed";
  const state: MatchState = {
    board: Array(9).fill(""),
    players: {},
    presences: {},
    currentTurn: "",
    winner: null,
    moveCount: 0,
    turnDeadline: 0,
    timedMode: timedMode,
    turnTimeoutSec: TURN_TIMEOUT_SEC,
  };
  const label: MatchLabel = { open: 1, mode: timedMode ? "timed" : "classic" };
  logger.info("Match created, timed=%s", timedMode);
  return { state: state, tickRate: TICK_RATE, label: JSON.stringify(label) };
};

export const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<MatchState> = (
  _ctx, logger, _nk, _dispatcher, _tick, state, presence, _metadata
) => {
  const count = Object.keys(state.players).length;
  if (count >= 2) {
    logger.warn("Match full, rejecting %s", presence.userId);
    return { state: state, accept: false, rejectMessage: "Match is full" };
  }
  if (state.players[presence.userId] !== undefined) {
    logger.warn("Player %s already in match", presence.userId);
    return { state: state, accept: false, rejectMessage: "Already in this match" };
  }
  if (state.winner !== null) {
    return { state: state, accept: false, rejectMessage: "Match already over" };
  }
  return { state: state, accept: true };
};

export const matchJoin: nkruntime.MatchJoinFunction<MatchState> = (
  _ctx, logger, _nk, dispatcher, _tick, state, presences
) => {
  for (const p of presences) {
    const symbol: "X" | "O" = Object.keys(state.players).length === 0 ? "X" : "O";
    state.players[p.userId] = symbol;
    state.presences[p.userId] = p;
    logger.info("Player %s joined as %s", p.userId, symbol);
  }

  const playerCount = Object.keys(state.players).length;
  if (playerCount === 2 && state.currentTurn === "") {
    const entries = Object.entries(state.players);
    const xEntry = entries.find(function(e) { return e[1] === "X"; });
    state.currentTurn = xEntry![0];
    if (state.timedMode) {
      state.turnDeadline = Date.now() + state.turnTimeoutSec * 1000;
    }
    const label: MatchLabel = { open: 0, mode: state.timedMode ? "timed" : "classic" };
    dispatcher.matchLabelUpdate(JSON.stringify(label));
  }

  broadcastState(dispatcher, state);
  return { state: state };
};

export const matchLeave: nkruntime.MatchLeaveFunction<MatchState> = (
  _ctx, logger, nk, dispatcher, _tick, state, presences
) => {
  for (const p of presences) {
    delete state.presences[p.userId];
    logger.info("Player %s left", p.userId);
    if (state.winner === null && Object.keys(state.players).includes(p.userId)) {
      const remaining = Object.keys(state.players).find(function(id) { return id !== p.userId; });
      state.winner = remaining ?? "draw";
      recordMatchResult(nk, logger, state);
      broadcastGameOver(dispatcher, state, "forfeit");
    }
  }
  return { state: state };
};

export const matchLoop: nkruntime.MatchLoopFunction<MatchState> = (
  _ctx, logger, nk, dispatcher, tick, state, messages
) => {
  if (state.winner !== null) return null;

  for (const msg of messages) {
    if (msg.opCode !== OpCode.MOVE) continue;

    const sender = msg.sender.userId;
    if (sender !== state.currentTurn) {
      logger.warn("Out-of-turn move from %s (expected %s)", sender, state.currentTurn);
      continue;
    }

    let pos: number;
    try {
      const raw = nk.binaryToString(msg.data);
      const parsed = JSON.parse(raw) as MoveMessage;
      pos = Number(parsed.position);
    } catch (e) {
      logger.warn("Bad move payload from %s: %s", sender, String(e));
      continue;
    }

    if (isNaN(pos) || pos < 0 || pos > 8 || state.board[pos] !== "") {
      logger.warn("Invalid position %d from %s", pos, sender);
      continue;
    }

    const symbol = state.players[sender];
    state.board[pos] = symbol;
    state.moveCount = state.moveCount + 1;
    logger.info("Player %s placed %s at %d", sender, symbol, pos);

    const result = checkWinner(state.board);
    if (result !== null) {
      if (result === "draw") {
        state.winner = "draw";
      } else {
        const playerIds = Object.keys(state.players);
        state.winner = (playerIds[0] && state.players[playerIds[0]] === result)
          ? playerIds[0]
          : playerIds[1];
      }
      broadcastState(dispatcher, state);
      recordMatchResult(nk, logger, state);
      broadcastGameOver(dispatcher, state, "normal");
      return null;
    }

    const playerIds = Object.keys(state.players);
    state.currentTurn = playerIds[0] === sender ? playerIds[1] : playerIds[0];
    if (state.timedMode) {
      state.turnDeadline = Date.now() + state.turnTimeoutSec * 1000;
    }
    broadcastState(dispatcher, state);
  }

  // Timer check (timed mode)
  if (state.timedMode && state.turnDeadline > 0 && state.currentTurn !== "") {
    const remaining = Math.ceil((state.turnDeadline - Date.now()) / 1000);
    if (remaining <= 0) {
      state.winner = Object.keys(state.players).find(function(id) { return id !== state.currentTurn; })!;
      logger.info("Timeout: %s wins", state.winner);
      broadcastState(dispatcher, state);
      recordMatchResult(nk, logger, state);
      broadcastGameOver(dispatcher, state, "timeout");
      return null;
    }
    if (tick % TICK_RATE === 0) {
      broadcastToAll(dispatcher, state, OpCode.TIMER_UPDATE, { remaining: remaining });
    }
  }

  return { state: state };
};

export const matchTerminate: nkruntime.MatchTerminateFunction<MatchState> = (
  _ctx, _logger, _nk, dispatcher, _tick, state, _graceSeconds
) => {
  broadcastGameOver(dispatcher, state, "terminated");
  return { state: state };
};

export const matchSignal: nkruntime.MatchSignalFunction<MatchState> = (
  _ctx, _logger, _nk, _dispatcher, _tick, state
) => {
  return { state: state };
};

function broadcastState(dispatcher: nkruntime.MatchDispatcher, state: MatchState) {
  broadcastToAll(dispatcher, state, OpCode.STATE_UPDATE, {
    board: state.board,
    players: state.players,
    currentTurn: state.currentTurn,
    winner: state.winner,
    moveCount: state.moveCount,
    turnDeadline: state.turnDeadline,
  });
}

function broadcastGameOver(dispatcher: nkruntime.MatchDispatcher, state: MatchState, reason: string) {
  broadcastToAll(dispatcher, state, OpCode.GAME_OVER, {
    winner: state.winner,
    board: state.board,
    reason: reason,
    players: state.players,
  });
}

function broadcastToAll(
  dispatcher: nkruntime.MatchDispatcher,
  _state: MatchState,
  opCode: number,
  payload: object
) {
  dispatcher.broadcastMessage(opCode, JSON.stringify(payload), null, null, true);
}
