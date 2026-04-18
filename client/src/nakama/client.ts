import { Client, Session, Socket } from "@heroiclabs/nakama-js";

const HOST = process.env.REACT_APP_NAKAMA_HOST ?? "localhost";
const PORT = process.env.REACT_APP_NAKAMA_PORT ?? "7350";
const USE_SSL = process.env.REACT_APP_NAKAMA_SSL === "true";
const SERVER_KEY = process.env.REACT_APP_NAKAMA_KEY ?? "defaultkey";

export const nakamaClient = new Client(SERVER_KEY, HOST, PORT, USE_SSL);

let _session: Session | null = null;
let _socket: Socket | null = null;
let _onDisconnect: (() => void) | null = null;

export async function authenticateDevice(deviceId: string, displayName?: string): Promise<Session> {
  if (displayName) {
    try {
      _session = await nakamaClient.authenticateDevice(deviceId, true, displayName);
      return _session;
    } catch (_e) {
      // 409 = username already taken by another account — fall back to no username
    }
  }
  _session = await nakamaClient.authenticateDevice(deviceId, true);
  return _session!;
}

export function setOnDisconnect(cb: () => void) {
  _onDisconnect = cb;
}

export async function connectSocket(session: Session): Promise<Socket> {
  _socket = nakamaClient.createSocket(USE_SSL, false);
  _socket.ondisconnect = () => {
    _socket = null;
    if (_onDisconnect) _onDisconnect();
  };
  await _socket.connect(session, true);
  return _socket;
}

export function getSession(): Session | null { return _session; }
export function getSocket(): Socket | null { return _socket; }

export async function rpcFindOrCreateMatch(mode: "classic" | "timed" = "classic"): Promise<string> {
  if (!_session) throw new Error("Not authenticated");
  const res = await nakamaClient.rpc(_session, "find_or_create_match", { mode });
  return (res.payload as unknown as { match_id: string }).match_id;
}

export async function rpcCreateMatch(mode: "classic" | "timed" = "classic"): Promise<string> {
  if (!_session) throw new Error("Not authenticated");
  const res = await nakamaClient.rpc(_session, "create_match", { mode });
  return (res.payload as unknown as { match_id: string }).match_id;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!_session) return [];
  try {
    const res = await nakamaClient.rpc(_session, "get_leaderboard", {});
    const data = res.payload as unknown as { records?: LeaderboardEntry[] };
    return data?.records ?? [];
  } catch {
    return [];
  }
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  score: number;
}
