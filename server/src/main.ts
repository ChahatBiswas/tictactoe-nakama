import {
  matchInit, matchJoinAttempt, matchJoin,
  matchLeave, matchLoop, matchTerminate, matchSignal,
} from "./match_handler";

function rpcCreateMatch(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const params = payload ? (JSON.parse(payload) as { mode?: string }) : {};
  const mode = params.mode ?? "classic";
  const matchId = nk.matchCreate("tictactoe", { mode: mode });
  logger.info("Created match %s mode=%s", matchId, mode);
  return JSON.stringify({ match_id: matchId });
}

function rpcFindOrCreateMatch(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const params = payload ? (JSON.parse(payload) as { mode?: string }) : {};
  const mode = params.mode ?? "classic";
  const matches = nk.matchList(10, true, JSON.stringify({ open: 1, mode: mode }), 0, 1, "*");
  if (matches.length > 0) {
    logger.info("Found match %s", matches[0].matchId);
    return JSON.stringify({ match_id: matches[0].matchId });
  }
  const matchId = nk.matchCreate("tictactoe", { mode: mode });
  logger.info("Created match %s", matchId);
  return JSON.stringify({ match_id: matchId });
}

function rpcGetLeaderboard(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  const result = nk.leaderboardRecordsList("tictactoe_wins", [], 20, undefined, 0);
  const records = result.records ?? [];

  if (records.length === 0) {
    return JSON.stringify({ records: [] });
  }

  // Batch read all player stats from storage in one call
  const reads = records.map(function(r) {
    return { collection: "stats", key: "record", userId: r.ownerId };
  });

  const storageMap: Record<string, any> = {};
  try {
    const stored = nk.storageRead(reads);
    for (const s of stored) {
      storageMap[s.userId] = s.value;
    }
  } catch (e) {
    logger.warn("Storage read failed: %s", String(e));
  }

  const entries = records.map(function(r) {
    const v = (storageMap[r.ownerId] ?? {}) as any;
    return {
      rank: r.rank,
      username: r.username ?? r.ownerId,
      wins: v.wins ?? 0,
      losses: v.losses ?? 0,
      draws: v.draws ?? 0,
      streak: v.streak ?? 0,
      bestStreak: v.bestStreak ?? 0,
      score: r.score ?? 0,
    };
  });

  return JSON.stringify({ records: entries });
}

function InitModule(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
): void {
  try {
    nk.leaderboardCreate("tictactoe_wins", true, "desc", "incr", undefined, {});
    logger.info("Leaderboard ready");
  } catch (_e) {}

  initializer.registerMatch("tictactoe", {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal,
  });

  initializer.registerRpc("create_match", rpcCreateMatch);
  initializer.registerRpc("find_or_create_match", rpcFindOrCreateMatch);
  initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);

  logger.info("TicTacToe module loaded");
}

// @ts-ignore
globalThis.InitModule = InitModule;
