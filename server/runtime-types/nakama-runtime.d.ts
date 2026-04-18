// Nakama server-side runtime TypeScript definitions (subset used by this module)
declare namespace nkruntime {
  interface Context {
    env: { [key: string]: string };
    executionMode: string;
    node: string;
    version: string;
    headers: { [key: string]: string[] };
    queryParams: { [key: string]: string[] };
    userId: string;
    username: string;
    vars: { [key: string]: string };
    clientIp: string;
    clientPort: string;
    matchId: string;
    matchNode: string;
    matchLabel: string;
    matchTickRate: number;
    lang: string;
  }

  interface Logger {
    info(msg: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    debug(msg: string, ...args: any[]): void;
  }

  interface Presence {
    userId: string;
    sessionId: string;
    username: string;
    node: string;
    status: string;
  }

  interface MatchDispatcher {
    broadcastMessage(opCode: number, data: string | null, presences: Presence[] | null, sender: Presence | null, reliable?: boolean): void;
    matchLabelUpdate(label: string): void;
    matchKick(presences: Presence[]): void;
  }

  interface MatchMessage {
    sender: Presence;
    persistence: boolean;
    status: string;
    opCode: number;
    data: Uint8Array;
    reliable: boolean;
    receiveTimeMs: number;
  }

  type MatchInitFunction<S = unknown> = (ctx: Context, logger: Logger, nk: Nakama, params: { [key: string]: string }) => { state: S; tickRate: number; label: string };
  type MatchJoinAttemptFunction<S = unknown> = (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: S, presence: Presence, metadata: { [key: string]: string }) => { state: S; accept: boolean; rejectMessage?: string };
  type MatchJoinFunction<S = unknown> = (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: S, presences: Presence[]) => { state: S };
  type MatchLeaveFunction<S = unknown> = (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: S, presences: Presence[]) => { state: S };
  type MatchLoopFunction<S = unknown> = (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: S, messages: MatchMessage[]) => { state: S } | null;
  type MatchTerminateFunction<S = unknown> = (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: S, graceSeconds: number) => { state: S };
  type MatchSignalFunction<S = unknown> = (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: S) => { state: S };

  interface MatchHandler<S = unknown> {
    matchInit: MatchInitFunction<S>;
    matchJoinAttempt: MatchJoinAttemptFunction<S>;
    matchJoin: MatchJoinFunction<S>;
    matchLeave: MatchLeaveFunction<S>;
    matchLoop: MatchLoopFunction<S>;
    matchTerminate: MatchTerminateFunction<S>;
    matchSignal: MatchSignalFunction<S>;
  }

  type RpcFunction = (ctx: Context, logger: Logger, nk: Nakama, payload: string) => string;
  type BeforeHookFunction<T> = (ctx: Context, logger: Logger, nk: Nakama, data: T) => T | void;
  type AfterHookFunction<T, U> = (ctx: Context, logger: Logger, nk: Nakama, data: T, req: U) => void;

  interface MatchRecord {
    matchId: string;
    authoritative: boolean;
    label: string;
    size: number;
    tickRate: number;
    handlerName: string;
  }

  interface LeaderboardRecord {
    leaderboardId: string;
    ownerId: string;
    username?: string;
    score: number;
    subscore: number;
    numScore: number;
    metadata: object;
    createTime: number;
    updateTime: number;
    expiryTime: number;
    rank: number;
  }

  interface LeaderboardRecordList {
    records: LeaderboardRecord[];
    ownerRecords: LeaderboardRecord[];
    nextCursor: string;
    prevCursor: string;
  }

  interface User {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    langTag: string;
    location: string;
    timezone: string;
    metadata: object;
    facebookId: string;
    googleId: string;
    gamecenterId: string;
    steamId: string;
    online: boolean;
    edgeCount: number;
    createTime: number;
    updateTime: number;
  }

  interface Nakama {
    matchCreate(module: string, params?: { [key: string]: string }): string;
    matchGet(id: string): MatchRecord | null;
    matchList(limit: number, isAuthoritative: boolean, label: string, minSize: number, maxSize: number, query: string): MatchRecord[];
    leaderboardRecordsList(id: string, ownerIds: string[], limit: number, cursor: string | undefined, expiry: number): LeaderboardRecordList;
    leaderboardRecordWrite(id: string, ownerId: string, username: string, score: number, subscore?: number, metadata?: object): LeaderboardRecord;
    usersGetId(userIds: string[], facebookIds?: string[]): User[];
    binaryToString(data: ArrayBuffer | Uint8Array): string;
    stringToBinary(str: string): Uint8Array;
  }

  interface Initializer {
    registerMatch<S>(name: string, handler: MatchHandler<S>): void;
    registerRpc(id: string, func: RpcFunction): void;
    registerRtAfterSendMatchPresenceEvent(fn: AfterHookFunction<any, any>): void;
  }

  type InitModule = (ctx: Context, logger: Logger, nk: Nakama, initializer: Initializer) => void;
}

declare const nk: nkruntime.Nakama;
