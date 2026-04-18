import React, { useEffect, useState } from "react";
import "./styles.css";
import { authenticateDevice, connectSocket, getSession, setOnDisconnect } from "./nakama/client";
import { Lobby } from "./components/Lobby";
import { GameRoom } from "./components/GameRoom";

type Screen = "nickname" | "loading" | "lobby" | "game";

function getDeviceId(): string {
  let id = sessionStorage.getItem("deviceId");
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("deviceId", id); }
  return id;
}
function getSavedNickname(): string { return sessionStorage.getItem("nickname") ?? ""; }

export default function App() {
  const [screen, setScreen] = useState<Screen>(getSavedNickname() ? "loading" : "nickname");
  const [nicknameInput, setNicknameInput] = useState(getSavedNickname());
  const [matchId, setMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [focusInput, setFocusInput] = useState(false);

  useEffect(() => {
    if (screen !== "loading") return;
    let cancelled = false;
    async function init() {
      setError(null);
      try {
        const session = await authenticateDevice(getDeviceId(), getSavedNickname() || "Player");
        if (cancelled) return;
        await connectSocket(session);
        if (cancelled) return;
        setOnDisconnect(() => {
          setMatchId(null); setScreen("loading");
          setError("Connection lost. Reconnecting…");
          setRetryCount((n) => n + 1);
        });
        setScreen("lobby");
      } catch (e) {
        if (cancelled) return;
        let msg = "Connection failed";
        if (e instanceof Error) msg = e.message;
        else if (e && typeof e === "object" && "status" in e) msg = `Server returned HTTP ${(e as any).status}`;
        else msg = String(e);
        setError(msg);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [screen, retryCount]);

  function handleStart() {
    const name = nicknameInput.trim() || "Player";
    sessionStorage.setItem("nickname", name);
    setScreen("loading");
  }

  const nakamaHost = process.env.REACT_APP_NAKAMA_HOST ?? "localhost";
  const nakamaPort = process.env.REACT_APP_NAKAMA_PORT ?? "7350";

  /* ── Nickname ──────────────────────────────────── */
  if (screen === "nickname") {
    return (
      <div style={s.root}>
        {/* Animated background orbs */}
        <div className="orb orb1" style={{ width: 500, height: 500, background: "radial-gradient(circle, rgba(124,58,237,0.3), transparent 70%)", top: "-20%", left: "-10%" }} />
        <div className="orb orb2" style={{ width: 400, height: 400, background: "radial-gradient(circle, rgba(6,182,212,0.2), transparent 70%)", bottom: "10%", right: "-5%" }} />
        <div className="orb orb3" style={{ width: 300, height: 300, background: "radial-gradient(circle, rgba(244,63,94,0.15), transparent 70%)", top: "50%", left: "50%" }} />

        <div style={s.center}>
          <div style={s.nickCard} className="fade-in-scale">
            {/* Floating symbols */}
            <div style={s.symbolRow} className="float-anim">
              <span style={s.bigX}>✕</span>
              <span style={s.bigO}>○</span>
            </div>

            <h1 className="gradient-text" style={s.gameTitle}>TIC-TAC-TOE</h1>
            <p style={s.tagline}>Real-time multiplayer · Ranked matches</p>

            <div style={{ ...s.inputWrap, ...(focusInput ? s.inputWrapFocus : {}) }}>
              <span style={s.inputIcon}>👤</span>
              <input
                style={s.nicknameInput}
                placeholder="Enter your nickname…"
                value={nicknameInput}
                maxLength={20}
                autoFocus
                onFocus={() => setFocusInput(true)}
                onBlur={() => setFocusInput(false)}
                onChange={(e) => setNicknameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && nicknameInput.trim() && handleStart()}
              />
            </div>

            <button
              style={{ ...s.startBtn, opacity: nicknameInput.trim() ? 1 : 0.4 }}
              disabled={!nicknameInput.trim()}
              onClick={handleStart}
            >
              <span style={s.startBtnText}>Start Playing</span>
              <span style={s.startArrow}>→</span>
            </button>

            <p style={s.nickHint}>Each browser window = unique player</p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Loading / Error ──────────────────────────── */
  if (screen === "loading") {
    return (
      <div style={s.root}>
        <div className="orb orb1" style={{ width: 400, height: 400, background: "radial-gradient(circle, rgba(124,58,237,0.25), transparent 70%)", top: "-10%", left: "-10%" }} />
        <div className="orb orb2" style={{ width: 350, height: 350, background: "radial-gradient(circle, rgba(6,182,212,0.2), transparent 70%)", bottom: "5%", right: "0%" }} />
        <div style={s.center}>
          {error ? (
            <div style={s.errorCard} className="fade-in-scale">
              <div style={s.errorIcon}>⚠</div>
              <p style={s.errorTitle}>Connection Failed</p>
              <p style={s.errorDetail}>{error}</p>
              <p style={s.errorHint}>Nakama must be running at <code style={s.code}>{nakamaHost}:{nakamaPort}</code></p>
              <p style={s.errorHint}>Run: <code style={s.code}>docker-compose up</code></p>
              <button style={s.retryBtn} onClick={() => setRetryCount((n) => n + 1)}>↺ Retry</button>
            </div>
          ) : (
            <div style={s.loadBox}>
              <div style={s.loadRing}>
                <div style={s.loadRingInner} />
              </div>
              <p className="gradient-text" style={s.loadText}>Connecting…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Lobby / Game ─────────────────────────────── */
  return (
    <div style={s.root}>
      <div className="orb orb1" style={{ width: 600, height: 600, background: "radial-gradient(circle, rgba(124,58,237,0.2), transparent 70%)", top: "-15%", left: "-15%", zIndex: 0 }} />
      <div className="orb orb2" style={{ width: 400, height: 400, background: "radial-gradient(circle, rgba(6,182,212,0.15), transparent 70%)", bottom: "0%", right: "-10%", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1, width: "100%" }}>
        {screen === "lobby" && (
          <Lobby
            onJoinMatch={(id) => { setMatchId(id); setScreen("game"); }}
            username={getSession()?.username ?? getSavedNickname()}
            onChangeNickname={() => { sessionStorage.clear(); setNicknameInput(""); setScreen("nickname"); }}
          />
        )}
        {screen === "game" && matchId && (
          <GameRoom matchId={matchId} onLeave={() => { setMatchId(null); setScreen("lobby"); }} />
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #050b14 0%, #0a0f1e 50%, #070d18 100%)",
    color: "#f1f5f9",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  center: {
    display: "flex", justifyContent: "center", alignItems: "center",
    minHeight: "100vh", padding: "24px", position: "relative", zIndex: 1,
  },

  /* nickname */
  nickCard: {
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "24px",
    padding: "44px 36px",
    width: "100%",
    maxWidth: "380px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
    boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  symbolRow: { display: "flex", gap: "20px", lineHeight: 1 },
  bigX: {
    fontSize: "3.2rem", fontWeight: 900, color: "#f43f5e",
    textShadow: "0 0 30px rgba(244,63,94,0.8), 0 0 60px rgba(244,63,94,0.4)",
  },
  bigO: {
    fontSize: "3.2rem", fontWeight: 900, color: "#22d3ee",
    textShadow: "0 0 30px rgba(34,211,238,0.8), 0 0 60px rgba(34,211,238,0.4)",
  },
  gameTitle: { margin: 0, fontSize: "2rem", fontWeight: 900, letterSpacing: "3px" },
  tagline: { margin: 0, color: "#334155", fontSize: "0.78rem", letterSpacing: "0.5px" },

  inputWrap: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "12px 16px",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  inputWrapFocus: {
    borderColor: "rgba(124,58,237,0.6)",
    boxShadow: "0 0 0 3px rgba(124,58,237,0.15)",
  },
  inputIcon: { fontSize: "1rem", flexShrink: 0 },
  nicknameInput: {
    flex: 1, background: "none", border: "none", outline: "none",
    color: "#f1f5f9", fontSize: "1rem", fontFamily: "inherit",
  },
  startBtn: {
    width: "100%",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
    padding: "14px 20px",
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    border: "none", borderRadius: "12px",
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(124,58,237,0.4)",
    transition: "transform 0.1s, box-shadow 0.2s",
  },
  startBtnText: { color: "#fff", fontWeight: 800, fontSize: "1rem", letterSpacing: "0.5px" },
  startArrow: { color: "rgba(255,255,255,0.7)", fontSize: "1.1rem" },
  nickHint: { margin: 0, color: "#1e3248", fontSize: "0.72rem" },

  /* loading */
  loadBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" },
  loadRing: {
    width: "56px", height: "56px",
    background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.3))",
    borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  loadRingInner: {
    width: "44px", height: "44px",
    border: "3px solid transparent",
    borderTopColor: "#7c3aed", borderRightColor: "#22d3ee",
    borderRadius: "50%",
    animation: "spin 0.9s linear infinite",
  },
  loadText: { fontSize: "1.1rem", fontWeight: 700, letterSpacing: "1px" },

  /* error */
  errorCard: {
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(244,63,94,0.2)",
    borderRadius: "20px",
    padding: "32px 28px",
    maxWidth: "400px",
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "10px", textAlign: "center",
    boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
  },
  errorIcon: { fontSize: "2rem" },
  errorTitle: { color: "#f43f5e", fontSize: "1.1rem", fontWeight: 700, margin: 0 },
  errorDetail: { color: "#64748b", fontSize: "0.82rem", margin: 0, wordBreak: "break-all" },
  errorHint: { color: "#334155", fontSize: "0.78rem", margin: 0 },
  code: { background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: "4px", color: "#94a3b8", fontSize: "0.78rem" },
  retryBtn: {
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    color: "#fff", border: "none", borderRadius: "10px",
    padding: "10px 28px", cursor: "pointer",
    fontWeight: 700, fontSize: "0.9rem", marginTop: "4px",
    boxShadow: "0 6px 20px rgba(124,58,237,0.4)",
  },
};
