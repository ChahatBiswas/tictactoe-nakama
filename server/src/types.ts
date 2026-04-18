export interface MatchState {
  board: string[];           // 9 cells: "", "X", or "O"
  players: Record<string, "X" | "O">;  // userId -> symbol
  presences: Record<string, nkruntime.Presence>;
  currentTurn: string;       // userId whose turn it is
  winner: string | null;     // userId of winner, "draw", or null
  moveCount: number;
  turnDeadline: number;      // epoch ms, 0 if no timer
  timedMode: boolean;
  turnTimeoutSec: number;
}

export interface MoveMessage {
  position: number;          // 0–8
}

export interface MatchLabel {
  open: number;              // 1 = joinable, 0 = full/over
  mode: string;              // "classic" | "timed"
}

export const TURN_TIMEOUT_SEC = 30;
export const TICK_RATE = 5;

// op codes for client <-> server messages
export const OpCode = {
  STATE_UPDATE: 1,
  MOVE: 2,
  GAME_OVER: 3,
  PLAYER_READY: 4,
  TIMER_UPDATE: 5,
} as const;

export const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],             // diagonals
];

export function checkWinner(board: string[]): string | null {
  for (const [a, b, c] of WINNING_COMBOS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]; // "X" or "O"
    }
  }
  if (board.every((cell) => cell !== "")) return "draw";
  return null;
}
