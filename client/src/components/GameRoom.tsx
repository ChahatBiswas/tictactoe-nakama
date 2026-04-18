import React, { useEffect, useState } from "react";
import { Board } from "./Board";
import { useMatch } from "../hooks/useMatch";
import { getSession, nakamaClient, fetchLeaderboard, LeaderboardEntry } from "../nakama/client";

interface Props { matchId: string; onLeave: () => void; }

export const GameRoom: React.FC<Props> = ({ matchId, onLeave }) => {
  const { gameState, gameOver, timerRemaining, sendMove, mySymbol, isMyTurn, error } = useMatch(matchId);
  const [opponentName, setOpponentName] = useState("…");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const session = getSession();
  const myUserId = session?.user_id ?? "";
  const myName = session?.username ?? "You";

  useEffect(() => {
    const oppId = Object.keys(gameState.players).find((id) => id !== myUserId);
    if (!oppId || !session) return;
    nakamaClient.getUsers(session, [oppId]).then((res) => {
      setOpponentName(res.users?.[0]?.username ?? oppId.slice(0, 8));
    });
  }, [gameState.players, myUserId, session]);

  useEffect(() => {
    if (!gameOver) return;
    fetchLeaderboard().then(setLeaderboard).catch(() => {});
  }, [gameOver]);

  const waiting = Object.keys(gameState.players).length < 2 && !gameOver;
  const isTimedMode = gameState.turnDeadline > 0;
  const timerPct = Math.max(0, Math.min(100, (timerRemaining / 30) * 100));
  const timerDanger = timerRemaining > 0 && timerRemaining <= 10;

  const xId = Object.entries(gameState.players).find((e) => e[1] === "X")?.[0] ?? "";
  const oId = Object.entries(gameState.players).find((e) => e[1] === "O")?.[0] ?? "";
  const xName = xId === myUserId ? myName : opponentName;
  const oName = oId === myUserId ? myName : opponentName;
  const xActive = gameState.currentTurn === xId && !gameOver && !waiting;
  const oActive = gameState.currentTurn === oId && !gameOver && !waiting;

  /* ── Waiting ──────────────────────────────────── */
  if (waiting) {
    return (
      <div style={s.fullPage}>
        <div className="orb orb1" style={{ width: 400, height: 400, background: "radial-gradient(circle, rgba(124,58,237,0.25), transparent 70%)", top: "-10%", left: "-10%" }} />
        <div className="orb orb2" style={{ width: 350, height: 350, background: "radial-gradient(circle, rgba(34,211,238,0.15), transparent 70%)", bottom: "0%", right: "0%" }} />
        <div style={s.waitCard} className="fade-in-scale">
          <div style={s.radarWrap}>
            <div style={s.radarRing1} />
            <div style={s.radarRing2} />
            <div style={s.radarDot} />
          </div>
          <h2 style={s.waitTitle}>Finding a player…</h2>
          <p style={s.waitSub}>Searching for an opponent to match</p>
          <div style={s.divider} />
          <div style={s.roomIdBox}>
            <span style={s.roomIdLabel}>ROOM ID</span>
            <code style={s.roomIdCode}>{matchId.slice(0, 20)}…</code>
            <button style={s.copyPill} onClick={() => navigator.clipboard.writeText(matchId)}>Copy</button>
          </div>
          <p style={s.shareHint}>Share with a friend to play privately</p>
          <button style={s.cancelBtn} onClick={onLeave}>✕ Cancel</button>
        </div>
      </div>
    );
  }

  /* ── Game Over ─────────────────────────────────── */
  if (gameOver) {
    const isDraw = gameOver.winner === "draw";
    const iWon = gameOver.winner === myUserId;
    const winnerSym = isDraw ? "~" : (gameOver.winner === xId ? "X" : "O");
    const isXWin = winnerSym === "X";
    const symColor = isDraw ? "#94a3b8" : isXWin ? "#f43f5e" : "#22d3ee";
    const glowColor = isDraw ? "rgba(148,163,184,0.4)" : isXWin ? "rgba(244,63,94,0.5)" : "rgba(34,211,238,0.5)";

    const headline = isDraw ? "DRAW!" : iWon ? "WINNER!" : gameOver.reason === "forfeit" ? "OPPONENT LEFT" : "GAME OVER";
    const pts = iWon ? "+200 pts" : isDraw ? "+10 pts" : "+0 pts";
    const ptColor = iWon ? "#fbbf24" : isDraw ? "#64748b" : "#334155";

    return (
      <div style={s.fullPage}>
        <div className="orb orb1" style={{ width: 500, height: 500, background: `radial-gradient(circle, ${glowColor}, transparent 70%)`, top: "10%", left: "50%", transform: "translateX(-50%)" }} />
        <div style={s.gameOverCard} className="fade-in-scale">

          {/* Big symbol */}
          <div style={{ ...s.bigSymWrap, boxShadow: `0 0 60px ${glowColor}, 0 0 120px ${glowColor}` }}>
            <span style={{ ...s.bigSym, color: symColor, textShadow: `0 0 30px ${symColor}` }}>
              {winnerSym}
            </span>
          </div>

          <h2 style={{ ...s.headlineText, color: symColor }}>{headline}</h2>
          <p style={{ ...s.ptsChip, color: ptColor, borderColor: ptColor + "44", background: ptColor + "11" }}>{pts}</p>

          {/* Leaderboard */}
          <div style={s.lbBox}>
            <div style={s.lbHeader}>
              <span style={s.lbIcon}>🏆</span>
              <span style={s.lbHeading}>LEADERBOARD</span>
            </div>

            <div style={s.lbCols}>
              <span style={s.lc0}>#</span>
              <span style={s.lc1}>Player</span>
              <span style={s.lc2}>W / L / D</span>
              <span style={s.lc3}>Score</span>
            </div>

            {leaderboard.length === 0 ? (
              <p style={s.lbEmpty}>Loading stats…</p>
            ) : (
              leaderboard.slice(0, 5).map((e, idx) => {
                const isMe = e.username === myName;
                const rowDelay = `${idx * 0.06}s`;
                return (
                  <div
                    key={e.username}
                    className="score-reveal"
                    style={{ ...s.lbRow, ...(isMe ? s.lbRowMe : {}), animationDelay: rowDelay }}
                  >
                    <span style={{ ...s.lc0, color: idx === 0 ? "#fbbf24" : idx === 1 ? "#94a3b8" : idx === 2 ? "#cd7c3e" : "#334155" }}>
                      {e.rank}
                    </span>
                    <span style={{ ...s.lc1, color: isMe ? "#a78bfa" : "#cbd5e1", fontWeight: isMe ? 700 : 400 }}>
                      {e.username}{isMe ? " (you)" : ""}
                    </span>
                    <span style={s.lc2}>{e.wins} / {e.losses} / {e.draws}</span>
                    <span style={{ ...s.lc3, color: "#fbbf24" }}>{e.score}</span>
                  </div>
                );
              })
            )}
          </div>

          <button style={s.playAgainBtn} onClick={onLeave}>
            Play Again
          </button>
        </div>
      </div>
    );
  }

  /* ── Active Game ──────────────────────────────── */
  const turnColor = isMyTurn ? "#a78bfa" : "#334155";

  return (
    <div style={s.gameRoot} className="slide-up">
      {/* Header */}
      <div style={s.gameHeader}>
        <PlayerChip name={xName} symbol="X" active={xActive} isRight={false} />
        <div style={s.midBlock}>
          {isTimedMode && timerRemaining > 0 ? (
            <span className={timerDanger ? "timer-danger" : ""} style={{ ...s.timerBig, color: timerDanger ? "#f43f5e" : "#a78bfa" }}>
              {timerRemaining}s
            </span>
          ) : (
            <span style={s.vsLabel}>VS</span>
          )}
        </div>
        <PlayerChip name={oName} symbol="O" active={oActive} isRight />
      </div>

      {/* Timer bar */}
      {isTimedMode && timerRemaining > 0 && (
        <div style={s.timerTrack}>
          <div style={{
            ...s.timerFill,
            width: `${timerPct}%`,
            background: timerDanger
              ? "linear-gradient(90deg, #f43f5e, #fb7185)"
              : "linear-gradient(90deg, #7c3aed, #22d3ee)",
            transition: "width 1s linear, background 0.4s",
          }} />
        </div>
      )}

      {/* Board area */}
      <div style={s.boardArea}>
        {/* Turn status */}
        <div className={isMyTurn ? "pulse" : ""} style={{ ...s.turnStatus, color: turnColor }}>
          <span style={{ ...s.turnDot, background: turnColor, boxShadow: `0 0 8px ${turnColor}` }} />
          {isMyTurn ? "Your Turn" : `${opponentName}'s Turn`}
        </div>

        {error && <p style={s.errorBanner}>{error}</p>}

        {/* The board */}
        <div style={s.boardCard}>
          <Board board={gameState.board} onCellClick={sendMove} disabled={!isMyTurn || !!gameOver || waiting} />
        </div>

        {/* Footer */}
        <div style={s.gameFooter}>
          <span style={s.roomMini}>Room: {matchId.slice(0, 12)}…</span>
          <button style={s.miniBtn} onClick={() => navigator.clipboard.writeText(matchId)}>Copy</button>
          <button style={{ ...s.miniBtn, ...s.forfeitMini }} onClick={onLeave}>Forfeit</button>
        </div>
      </div>
    </div>
  );
};

/* ── PlayerChip sub-component ─────────────────────── */
function PlayerChip({ name, symbol, active, isRight }: { name: string; symbol: "X" | "O"; active: boolean; isRight: boolean }) {
  const isX = symbol === "X";
  const color = isX ? "#f43f5e" : "#22d3ee";
  const glow = isX ? "rgba(244,63,94,0.3)" : "rgba(34,211,238,0.3)";
  return (
    <div style={{
      ...pc.wrap,
      flexDirection: isRight ? "row-reverse" : "row",
      border: active ? `1px solid ${color}44` : "1px solid transparent",
      background: active ? `${glow}22` : "transparent",
      boxShadow: active ? `0 0 16px ${glow}` : "none",
    }}>
      <div style={{ ...pc.symCircle, background: `${color}15`, boxShadow: active ? `0 0 12px ${glow}` : "none" }}>
        <span style={{ color, fontWeight: 900, fontSize: "1.1rem", textShadow: active ? `0 0 10px ${color}` : "none" }}>{symbol}</span>
      </div>
      <span style={{ ...pc.name, textAlign: isRight ? "right" : "left" }}>{name}</span>
    </div>
  );
}

const pc: Record<string, React.CSSProperties> = {
  wrap: {
    flex: 1, display: "flex", alignItems: "center", gap: "8px",
    padding: "8px 10px", borderRadius: "10px", transition: "all 0.25s",
  },
  symCircle: {
    width: "32px", height: "32px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  name: { color: "#94a3b8", fontSize: "0.82rem", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
};

/* ── Styles ─────────────────────────────────────── */
const s: Record<string, React.CSSProperties> = {
  fullPage: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #050b14 0%, #0a0f1e 50%, #070d18 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "20px", position: "relative", overflow: "hidden",
  },

  /* waiting */
  waitCard: {
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "24px", padding: "44px 32px",
    maxWidth: "360px", width: "100%",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "16px",
    textAlign: "center",
    boxShadow: "0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
    position: "relative", zIndex: 1,
  },
  radarWrap: { position: "relative", width: "72px", height: "72px", display: "flex", alignItems: "center", justifyContent: "center" },
  radarRing1: {
    position: "absolute", width: "100%", height: "100%",
    border: "2px solid rgba(124,58,237,0.4)", borderRadius: "50%",
    animation: "spin 3s linear infinite",
  },
  radarRing2: {
    position: "absolute", width: "65%", height: "65%",
    border: "2px solid rgba(34,211,238,0.4)", borderRadius: "50%",
    animation: "spin 2s linear infinite reverse",
  },
  radarDot: {
    width: "10px", height: "10px", borderRadius: "50%",
    background: "#7c3aed", boxShadow: "0 0 12px rgba(124,58,237,0.8)",
  },
  waitTitle: { margin: 0, color: "#f1f5f9", fontSize: "1.15rem", fontWeight: 700 },
  waitSub: { margin: 0, color: "#475569", fontSize: "0.85rem" },
  divider: { width: "100%", height: "1px", background: "rgba(255,255,255,0.06)" },
  roomIdBox: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const, justifyContent: "center" },
  roomIdLabel: { color: "#334155", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1px" },
  roomIdCode: { color: "#475569", fontSize: "0.75rem", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: "5px" },
  copyPill: {
    background: "rgba(124,58,237,0.2)", color: "#a78bfa",
    border: "1px solid rgba(124,58,237,0.3)", borderRadius: "20px",
    padding: "3px 10px", cursor: "pointer", fontSize: "0.72rem", fontWeight: 600,
  },
  shareHint: { margin: 0, color: "#1e3248", fontSize: "0.72rem" },
  cancelBtn: {
    background: "rgba(255,255,255,0.04)", color: "#475569",
    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px",
    padding: "9px 22px", cursor: "pointer", fontSize: "0.85rem",
  },

  /* game over */
  gameOverCard: {
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "24px", padding: "36px 28px",
    maxWidth: "380px", width: "100%",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
    boxShadow: "0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
    position: "relative", zIndex: 1,
  },
  bigSymWrap: {
    width: "96px", height: "96px", borderRadius: "50%",
    background: "rgba(255,255,255,0.04)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  bigSym: { fontSize: "3.8rem", fontWeight: 900, lineHeight: 1 },
  headlineText: { margin: 0, fontSize: "1.6rem", fontWeight: 900, letterSpacing: "2px" },
  ptsChip: {
    margin: 0, fontSize: "0.88rem", fontWeight: 700,
    border: "1px solid", borderRadius: "20px", padding: "3px 14px",
  },
  lbBox: {
    width: "100%",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "14px",
    padding: "14px 14px",
    display: "flex", flexDirection: "column", gap: "7px",
    marginTop: "4px",
  },
  lbHeader: { display: "flex", alignItems: "center", gap: "7px", marginBottom: "2px" },
  lbIcon: { fontSize: "0.88rem" },
  lbHeading: { color: "#334155", fontSize: "0.68rem", fontWeight: 800, letterSpacing: "2px" },
  lbCols: { display: "flex", color: "#1e3248", fontSize: "0.7rem", fontWeight: 700, padding: "3px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "7px" },
  lbRow: { display: "flex", padding: "6px 4px", borderRadius: "6px", fontSize: "0.85rem" },
  lbRowMe: { background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.15)" },
  lbEmpty: { color: "#1e3248", fontSize: "0.82rem", textAlign: "center" as const },
  lc0: { width: "24px", flexShrink: 0, fontSize: "0.82rem" },
  lc1: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, color: "#64748b" },
  lc2: { width: "80px", flexShrink: 0, textAlign: "center" as const, color: "#334155", fontSize: "0.8rem" },
  lc3: { width: "50px", flexShrink: 0, textAlign: "right" as const, fontWeight: 700, fontSize: "0.85rem" },
  playAgainBtn: {
    width: "100%", padding: "14px",
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    color: "#fff", border: "none", borderRadius: "12px",
    fontWeight: 800, fontSize: "1rem", cursor: "pointer",
    boxShadow: "0 8px 24px rgba(124,58,237,0.4)",
    marginTop: "4px", letterSpacing: "0.5px",
  },

  /* active game */
  gameRoot: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #050b14 0%, #0a0f1e 60%, #070d18 100%)",
    display: "flex", flexDirection: "column",
  },
  gameHeader: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "12px 16px",
    background: "rgba(255,255,255,0.02)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    backdropFilter: "blur(10px)",
  },
  midBlock: { minWidth: "52px", display: "flex", justifyContent: "center", alignItems: "center" },
  vsLabel: { color: "#1e3248", fontWeight: 800, fontSize: "0.82rem", letterSpacing: "1px" },
  timerBig: { fontWeight: 900, fontSize: "1.5rem", lineHeight: 1 },
  timerTrack: {
    height: "3px", background: "rgba(255,255,255,0.05)", overflow: "hidden",
  },
  timerFill: { height: "100%", borderRadius: "99px" },

  boardArea: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: "20px", padding: "28px 20px",
    width: "100%",
  },
  turnStatus: {
    display: "flex", alignItems: "center", gap: "8px",
    fontSize: "0.9rem", fontWeight: 700, letterSpacing: "0.5px",
    transition: "color 0.3s",
  },
  turnDot: { width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0, transition: "all 0.3s" },
  errorBanner: {
    color: "#f43f5e", fontSize: "0.8rem", margin: 0,
    background: "rgba(244,63,94,0.08)", borderRadius: "8px", padding: "6px 12px",
  },
  boardCard: {
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "20px", padding: "20px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
    width: "min(380px, calc(100vw - 40px))",
    boxSizing: "border-box",
  },
  gameFooter: {
    display: "flex", alignItems: "center", gap: "10px",
  },
  roomMini: { color: "#1e3248", fontSize: "0.72rem" },
  miniBtn: {
    background: "rgba(255,255,255,0.04)", color: "#334155",
    border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px",
    padding: "4px 10px", cursor: "pointer", fontSize: "0.72rem",
  },
  forfeitMini: { color: "#f43f5e44", borderColor: "rgba(244,63,94,0.15)" },
};
