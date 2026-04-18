import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "@heroiclabs/nakama-js";
import { getSocket, getSession } from "../nakama/client";

export interface GameState {
  board: string[];
  players: Record<string, "X" | "O">;
  currentTurn: string;
  winner: string | null;
  moveCount: number;
  turnDeadline: number;
}

export interface GameOverData {
  winner: string | null;
  reason: string;
  players: Record<string, "X" | "O">;
}

const OP_STATE_UPDATE = 1;
const OP_MOVE = 2;
const OP_GAME_OVER = 3;
const OP_TIMER_UPDATE = 5;

const EMPTY_BOARD: string[] = Array(9).fill("");

export function useMatch(matchId: string | null) {
  const [gameState, setGameState] = useState<GameState>({
    board: EMPTY_BOARD,
    players: {},
    currentTurn: "",
    winner: null,
    moveCount: 0,
    turnDeadline: 0,
  });
  const [gameOver, setGameOver] = useState<GameOverData | null>(null);
  const [timerRemaining, setTimerRemaining] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !matchId) return;
    socketRef.current = socket;

    socket.onmatchdata = (data) => {
      try {
        let payload: any;
        if (typeof data.data === "string") {
          payload = JSON.parse(data.data);
        } else if (data.data instanceof Uint8Array) {
          payload = JSON.parse(new TextDecoder().decode(data.data));
        } else {
          payload = data.data; // already decoded object
        }
        switch (data.op_code) {
          case OP_STATE_UPDATE:
            setGameState(payload as GameState);
            break;
          case OP_GAME_OVER:
            setGameOver(payload as GameOverData);
            break;
          case OP_TIMER_UPDATE:
            setTimerRemaining((payload as { remaining: number }).remaining);
            break;
        }
      } catch (e) {
        console.error("Failed to parse match data", e);
      }
    };

    socket.joinMatch(matchId).catch((err) => {
      setError(String(err));
    });

    return () => {
      socket.leaveMatch(matchId).catch(() => {});
    };
  }, [matchId]);

  const sendMove = useCallback(
    (position: number) => {
      const socket = socketRef.current;
      const session = getSession();
      if (!socket || !matchId || !session) return;

      const payload = JSON.stringify({ position: position });
      socket.sendMatchState(matchId, OP_MOVE, payload).catch((err) => {
        console.error("sendMatchState failed:", err);
      });
    },
    [matchId]
  );

  const myUserId = getSession()?.user_id ?? "";
  const mySymbol = gameState.players[myUserId] ?? null;
  const isMyTurn = myUserId !== "" && myUserId === gameState.currentTurn;

  return { gameState, gameOver, timerRemaining, sendMove, mySymbol, isMyTurn, error };
}
