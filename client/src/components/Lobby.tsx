import React, { useState, useEffect } from "react";
import { rpcFindOrCreateMatch, rpcCreateMatch, fetchLeaderboard, LeaderboardEntry } from "../nakama/client";

interface Props { onJoinMatch: (id: string) => void; username: string; onChangeNickname: () => void; }

const RANK_COLORS = ["#fbbf24", "#94a3b8", "#cd7c3e"];

export const Lobby: React.FC<Props> = ({ onJoinMatch, username, onChangeNickname }) => {
  const [mode, setMode] = useState<"classic" | "timed">("classic");
  const [joinId, setJoinId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [inputFocus, setInputFocus] = useState(false);

  useEffect(() => {
    fetchLeaderboard().then(setLeaderboard).catch(() => {});
  }, []);

  async function handleQuickMatch() {
    setLoading(true); setError(null);
    try { onJoinMatch(await rpcFindOrCreateMatch(mode)); }
    catch (e) { setError(String(e)); setLoading(false); }
  }
  async function handleCreatePrivate() {
    setLoading(true); setError(null);
    try { onJoinMatch(await rpcCreateMatch(mode)); }
    catch (e) { setError(String(e)); setLoading(false); }
  }
  function handleJoinById() { if (joinId.trim()) onJoinMatch(joinId.trim()); }

  const myEntry = leaderboard.find((e) => e.username === username);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header} className="slide-up">
        <div style={s.titleRow}>
          <span style={s.xGlyph}>✕</span>
          <div>
            <h1 className="gradient-text" style={s.title}>TIC-TAC-TOE</h1>
            <p style={s.subtitle}>Multiplayer · Ranked · Real-time</p>
          </div>
          <span style={s.oGlyph}>○</span>
        </div>

        <div style={s.userRow}>
          <span style={s.userLabel}>👤 {username}</span>
          <button style={s.changeNickBtn} onClick={onChangeNickname}>✎ Change</button>
        </div>

        {/* My stats pill */}
        {myEntry && (
          <div style={s.myStatsPill} className="fade-in-scale">
            <StatBadge label="W" value={myEntry.wins} color="#22d3ee" />
            <div style={s.statDivider} />
            <StatBadge label="L" value={myEntry.losses} color="#f43f5e" />
            <div style={s.statDivider} />
            <StatBadge label="D" value={myEntry.draws} color="#94a3b8" />
            {myEntry.streak > 1 && (
              <>
                <div style={s.statDivider} />
                <StatBadge label={`${myEntry.streak} Streak`} value="" color="#fbbf24" />
              </>
            )}
            <div style={s.statDivider} />
            <StatBadge label="Score" value={myEntry.score} color="#a78bfa" />
          </div>
        )}
      </div>

      {/* Play card */}
      <div style={s.card} className="slide-up">
        {/* Mode toggle */}
        <div style={s.modeRow}>
          {(["classic", "timed"] as const).map((m) => (
            <button
              key={m}
              style={{ ...s.modeBtn, ...(mode === m ? (m === "classic" ? s.modeBtnClassic : s.modeBtnTimed) : {}) }}
              onClick={() => setMode(m)}
            >
              <span style={s.modeIcon}>{m === "classic" ? "♟" : "⚡"}</span>
              <div>
                <div style={s.modeName}>{m === "classic" ? "Classic" : "Timed"}</div>
                <div style={s.modeSub}>{m === "classic" ? "No time limit" : "30s per move"}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Buttons */}
        <button style={s.primaryBtn} onClick={handleQuickMatch} disabled={loading}>
          {loading ? (
            <span style={s.spinnerRow}>
              <span style={s.btnSpinner} /> Searching for match…
            </span>
          ) : (
            <>
              <span style={s.btnIcon}>⚡</span> Quick Match
            </>
          )}
        </button>

        <button style={s.secondaryBtn} onClick={handleCreatePrivate} disabled={loading}>
          <span style={s.btnIcon}>🔒</span> Create Private Room
        </button>

        <div style={s.orRow}>
          <div style={s.orLine} /><span style={s.orText}>or join by ID</span><div style={s.orLine} />
        </div>

        <div style={s.joinRow}>
          <div style={{ ...s.joinInputWrap, ...(inputFocus ? s.joinInputFocus : {}) }}>
            <input
              style={s.joinInput}
              placeholder="Paste room ID…"
              value={joinId}
              onFocus={() => setInputFocus(true)}
              onBlur={() => setInputFocus(false)}
              onChange={(e) => setJoinId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoinById()}
            />
          </div>
          <button style={{ ...s.joinBtn, opacity: joinId.trim() ? 1 : 0.4 }} onClick={handleJoinById} disabled={!joinId.trim()}>
            Join →
          </button>
        </div>

        {error && <p style={s.errorText}>{error}</p>}
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div style={s.card} className="slide-up">
          <div style={s.lbTitleRow}>
            <span>🏆</span>
            <span style={s.lbTitle}>GLOBAL LEADERBOARD</span>
          </div>

          {/* Podium top 3 */}
          {leaderboard.length >= 3 && (
            <div style={s.podium}>
              {[1, 0, 2].map((rank) => {
                const e = leaderboard[rank];
                if (!e) return null;
                const isMe = e.username === username;
                const h = [72, 96, 60][rank === 0 ? 1 : rank === 1 ? 0 : 2];
                const rankDisplay = rank === 0 ? 1 : rank === 1 ? 2 : 3;
                const rc = RANK_COLORS[rankDisplay - 1];
                return (
                  <div key={e.username} style={s.podiumItem}>
                    <div style={{
                      ...s.podiumAvatar,
                      borderColor: rc, boxShadow: `0 0 16px ${rc}66`,
                      background: isMe ? `${rc}22` : "rgba(255,255,255,0.04)",
                      color: rc, fontSize: "1rem", fontWeight: 800,
                    }}>
                      {e.username.slice(0, 1).toUpperCase()}
                    </div>
                    <p style={{ ...s.podiumName, color: isMe ? "#a78bfa" : "#94a3b8" }}>
                      {e.username.length > 7 ? e.username.slice(0, 7) + "…" : e.username}
                    </p>
                    <p style={{ ...s.podiumScore, color: rc }}>{e.score}</p>
                    <div style={{ ...s.podiumBar, height: `${h}px`, borderTopColor: rc, background: `linear-gradient(180deg, ${rc}22, transparent)` }}>
                      <span style={{ color: rc, fontWeight: 800, fontSize: "0.78rem" }}>{rankDisplay}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full table */}
          <div style={s.tableWrap}>
            <div style={s.tableHdr}>
              <span style={s.tc0}>#</span>
              <span style={s.tc1}>Player</span>
              <span style={s.tc2}>W/L/D</span>
              <span style={s.tc3}>Score</span>
            </div>
            {leaderboard.map((e, idx) => {
              const isMe = e.username === username;
              const rc = idx < 3 ? RANK_COLORS[idx] : undefined;
              return (
                <div key={e.username} style={{ ...s.tableRow, ...(isMe ? s.tableRowMe : {}) }} className="score-reveal">
                  <span style={{ ...s.tc0, color: rc ?? "#1e3248", fontWeight: rc ? 700 : 400 }}>{e.rank}</span>
                  <span style={{ ...s.tc1, color: isMe ? "#a78bfa" : "#64748b", fontWeight: isMe ? 700 : 400 }}>
                    {e.username}{isMe ? " (you)" : ""}
                  </span>
                  <span style={{ ...s.tc2 }}>{e.wins}/{e.losses}/{e.draws}</span>
                  <span style={{ ...s.tc3, color: "#fbbf24" }}>{e.score}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

function StatBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
      {value !== "" && <span style={{ color, fontWeight: 800, fontSize: "1rem", lineHeight: 1 }}>{value}</span>}
      <span style={{ color: "#1e3248", fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.5px", lineHeight: 1 }}>{label}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: "460px", margin: "0 auto",
    padding: "20px 16px 48px",
    display: "flex", flexDirection: "column", gap: "16px",
  },
  header: { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", paddingTop: "8px" },
  titleRow: { display: "flex", alignItems: "center", gap: "16px" },
  xGlyph: { fontSize: "2rem", fontWeight: 900, color: "#f43f5e", textShadow: "0 0 24px rgba(244,63,94,0.7)" },
  oGlyph: { fontSize: "2rem", fontWeight: 900, color: "#22d3ee", textShadow: "0 0 24px rgba(34,211,238,0.7)" },
  title: { margin: 0, fontSize: "1.9rem", fontWeight: 900, letterSpacing: "3px" },
  subtitle: { margin: 0, color: "#1e3248", fontSize: "0.7rem", letterSpacing: "0.5px" },

  userRow: {
    display: "flex", alignItems: "center", gap: "10px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "10px", padding: "7px 14px",
  },
  userLabel: { color: "#64748b", fontSize: "0.82rem", fontWeight: 600, flex: 1 },
  changeNickBtn: {
    background: "none", border: "1px solid rgba(167,139,250,0.3)",
    color: "#a78bfa", borderRadius: "8px",
    padding: "4px 10px", fontSize: "0.75rem", fontWeight: 700,
    cursor: "pointer", transition: "all 0.15s",
  },

  myStatsPill: {
    display: "flex", alignItems: "center", gap: "14px",
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px", padding: "10px 18px",
  },
  statDivider: { width: "1px", height: "22px", background: "rgba(255,255,255,0.06)" },

  card: {
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "20px", padding: "20px",
    display: "flex", flexDirection: "column", gap: "12px",
    boxShadow: "0 16px 48px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
  },

  modeRow: { display: "flex", gap: "10px" },
  modeBtn: {
    flex: 1, display: "flex", alignItems: "center", gap: "10px",
    padding: "12px 14px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px", cursor: "pointer",
    transition: "all 0.2s",
  },
  modeBtnClassic: { borderColor: "rgba(124,58,237,0.5)", background: "rgba(124,58,237,0.08)", boxShadow: "0 0 16px rgba(124,58,237,0.15)" },
  modeBtnTimed: { borderColor: "rgba(251,191,36,0.5)", background: "rgba(251,191,36,0.08)", boxShadow: "0 0 16px rgba(251,191,36,0.15)" },
  modeIcon: { fontSize: "1.2rem", flexShrink: 0 },
  modeName: { color: "#e2e8f0", fontWeight: 700, fontSize: "0.88rem" },
  modeSub: { color: "#334155", fontSize: "0.7rem", marginTop: "1px" },

  primaryBtn: {
    padding: "15px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    color: "#fff", border: "none", borderRadius: "12px",
    fontWeight: 800, fontSize: "1rem", cursor: "pointer",
    boxShadow: "0 8px 24px rgba(124,58,237,0.4)",
    transition: "transform 0.1s, box-shadow 0.2s",
    letterSpacing: "0.3px",
  },
  spinnerRow: { display: "flex", alignItems: "center", gap: "10px" },
  btnSpinner: {
    width: "16px", height: "16px",
    border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
    borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block",
  },
  btnIcon: { fontSize: "1rem" },
  secondaryBtn: {
    padding: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    background: "rgba(255,255,255,0.04)",
    color: "#64748b", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer",
    transition: "all 0.2s",
  },
  orRow: { display: "flex", alignItems: "center", gap: "10px" },
  orLine: { flex: 1, height: "1px", background: "rgba(255,255,255,0.06)" },
  orText: { color: "#1e3248", fontSize: "0.75rem", flexShrink: 0 },
  joinRow: { display: "flex", gap: "8px" },
  joinInputWrap: {
    flex: 1, display: "flex",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "10px", padding: "10px 14px",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  joinInputFocus: { borderColor: "rgba(124,58,237,0.5)", boxShadow: "0 0 0 3px rgba(124,58,237,0.1)" },
  joinInput: { flex: 1, background: "none", border: "none", outline: "none", color: "#e2e8f0", fontSize: "0.88rem", fontFamily: "inherit" },
  joinBtn: {
    padding: "10px 16px",
    background: "rgba(124,58,237,0.2)", color: "#a78bfa",
    border: "1px solid rgba(124,58,237,0.3)",
    borderRadius: "10px", cursor: "pointer", fontWeight: 700, fontSize: "0.9rem",
    flexShrink: 0, transition: "all 0.2s",
  },
  errorText: { color: "#f43f5e", textAlign: "center", margin: 0, fontSize: "0.82rem" },

  /* leaderboard */
  lbTitleRow: { display: "flex", alignItems: "center", gap: "8px" },
  lbTitle: { color: "#1e3248", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "2px" },
  podium: {
    display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "8px",
    padding: "4px 0 0",
  },
  podiumItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flex: 1 },
  podiumAvatar: { width: "38px", height: "38px", borderRadius: "50%", border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center" },
  podiumName: { margin: 0, fontSize: "0.72rem", fontWeight: 600, textAlign: "center" as const },
  podiumScore: { margin: 0, fontSize: "0.7rem", fontWeight: 700 },
  podiumBar: {
    width: "100%", borderRadius: "4px 4px 0 0",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    borderTop: "2px solid", paddingTop: "6px",
  },
  tableWrap: {
    display: "flex", flexDirection: "column", gap: "3px",
    borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "10px",
  },
  tableHdr: { display: "flex", color: "#1e3248", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.5px", padding: "3px 6px" },
  tableRow: { display: "flex", padding: "7px 6px", borderRadius: "8px", fontSize: "0.85rem", transition: "background 0.15s" },
  tableRowMe: { background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.12)" },
  tc0: { width: "28px", flexShrink: 0 },
  tc1: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  tc2: { width: "72px", flexShrink: 0, textAlign: "center" as const, color: "#334155", fontSize: "0.8rem" },
  tc3: { width: "52px", flexShrink: 0, textAlign: "right" as const, fontWeight: 700 },
};
