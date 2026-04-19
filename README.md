# Multiplayer Tic-Tac-Toe — Nakama Backend

A real-time, server-authoritative multiplayer Tic-Tac-Toe game. Two players connect from any browser, are matched in real time, and play on a shared board where all game logic runs on the server. Includes a ranked leaderboard, win-streak tracking, and a timed mode where each turn has a 30-second countdown enforced by the server.

**Live URLs**
- Game client: https://tictactoe-nakama-chi.vercel.app
- Nakama backend: https://tictactoe-nakama-production-da1a.up.railway.app

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [How the Game Works](#how-the-game-works)
4. [Data Storage](#data-storage)
5. [API Reference](#api-reference)
6. [Local Development Setup](#local-development-setup)
7. [Cloud Deployment](#cloud-deployment)
8. [How to Test Multiplayer](#how-to-test-multiplayer)
9. [Bonus Features](#bonus-features)

---

## Architecture Overview

```
┌──────────────────────────────┐        HTTPS / WSS         ┌──────────────────────────┐
│   React Client               │ ─────────────────────────▶ │   Nakama Game Server     │
│   (Vercel — global CDN)      │ ◀───────────────────────── │   (Railway — Docker)     │
│                              │   WebSocket match events   │                          │
│  • Auth (device UUID)        │                            │  • Match handler (TS)    │
│  • Lobby / matchmaking UI    │                            │  • RPC endpoints         │
│  • Game board rendering      │                            │  • Leaderboard           │
│  • Timer bar (visual only)   │                            │  • Turn timer (enforced) │
└──────────────────────────────┘                            └────────────┬─────────────┘
                                                                         │ SQL
                                                              ┌──────────▼─────────────┐
                                                              │  PostgreSQL             │
                                                              │  (Railway managed)      │
                                                              └─────────────────────────┘
```

### Why server-authoritative?

All game logic (move validation, win detection, turn enforcement, timeouts) runs inside `server/src/match_handler.ts`. The client only sends a position number (0–8). The server checks:
- Is it this player's turn?
- Is that cell already occupied?
- Does this move win the game?
- Has the timer expired?

This means a player cannot cheat by sending moves out of turn, re-sending a move to a taken cell, or manipulating the client timer.

### Authentication — why device UUID?

Each browser tab generates a random UUID on first load and stores it in `sessionStorage`. This UUID is passed to Nakama's device authentication endpoint, which creates (or reuses) a Nakama account tied to that UUID. Result: every tab is automatically a separate player — no sign-up required. Closing the tab and reopening it gives a fresh UUID and a fresh account.

---

## Project Structure

```
tictactoe-nakama/
│
├── server/                         # Nakama server module (TypeScript)
│   ├── src/
│   │   ├── main.ts                 # InitModule: registers RPCs, match handler, leaderboard
│   │   ├── match_handler.ts        # All game logic: matchInit, matchJoin, matchLoop, matchLeave
│   │   └── types.ts                # MatchState, OpCodes, win detection, constants
│   ├── build/
│   │   └── index.js                # esbuild output — what Nakama actually loads
│   ├── package.json
│   └── tsconfig.json
│
├── client/                         # React frontend (TypeScript, CRA)
│   ├── src/
│   │   ├── App.tsx                 # Auth flow + screen routing (nickname → lobby → game)
│   │   ├── components/
│   │   │   ├── Board.tsx           # 3×3 grid with CSS win animations
│   │   │   ├── GameRoom.tsx        # Waiting room, active game, game-over screen
│   │   │   └── Lobby.tsx           # Mode selection, matchmaking, leaderboard, change nickname
│   │   ├── hooks/
│   │   │   └── useMatch.ts         # WebSocket match state hook (join, receive, send moves)
│   │   └── nakama/
│   │       └── client.ts           # Nakama SDK wrapper: auth, socket, RPC calls
│   ├── .env.example                # Local dev env vars (points to localhost:7350)
│   └── .env.production.example     # Vercel env vars template
│
├── Dockerfile                      # Multi-stage: builds server bundle, runs Nakama 3.22.0
├── docker-compose.yml              # Local dev: Nakama + CockroachDB
├── railway.json                    # Railway deployment config (Dockerfile path + restart policy)
├── DATA_STORAGE.md                 # Documents every data storage location in detail
└── deploy/
    └── nakama-droplet-setup.sh     # Alternative: DigitalOcean VPS setup script
```

---

## How the Game Works

### Match lifecycle

1. **Player A** opens the game, enters a nickname, clicks **Quick Match**.
   - Client calls RPC `find_or_create_match` with `mode: "classic"` or `mode: "timed"`.
   - Server lists open matches with matching mode. If one exists, return it. Otherwise create a new one.
   - Client joins the match over WebSocket.

2. **Player B** does the same and is paired with Player A's open match (because `open: 1` is in the match label).

3. When both players are in, `matchJoin` sets the first player as X, the second as O, sets `currentTurn` to X's userId, marks the match label as `open: 0` (no more players), and broadcasts the initial state.

4. **Each turn**: Player sends `OpCode.MOVE` with `{ position: 0–8 }`. The server's `matchLoop` runs at 5 ticks/second:
   - Validates it's that player's turn.
   - Validates the cell is empty.
   - Places the symbol on the board.
   - Checks for a winner or draw using the 8 winning combinations.
   - If the game continues, switches `currentTurn` and broadcasts the new state.
   - If the game ends, records results and broadcasts `OpCode.GAME_OVER`.

5. **If a player disconnects**: `matchLeave` fires. The remaining player is declared the winner (forfeit). Stats and leaderboard are updated immediately.

### Timed mode

- `turnDeadline` is a Unix timestamp (ms) set when each turn starts: `Date.now() + 30000`.
- Every tick, `matchLoop` checks if `Date.now() > turnDeadline`.
- If it is, the inactive player loses (timeout). This runs entirely on the server — the client cannot prevent it.
- Every second, the server broadcasts `OpCode.TIMER_UPDATE` with `{ remaining: N }`. The client renders this as a countdown bar, but it's purely visual.

### Stats and leaderboard

At match end, for each player:
1. Read existing stats from Nakama Storage (`collection: "stats"`, `key: "record"`).
2. Increment `wins`/`losses`/`draws` and update `streak` / `bestStreak`.
3. Write the updated stats back.
4. Write points to the `tictactoe_wins` leaderboard: **Win = 200 pts, Draw = 10 pts, Loss = 0 pts**.

The leaderboard uses Nakama's `incr` operator — points accumulate across all matches.

---

## Data Storage

| Layer | What is stored | Where | Persists after tab close | Persists after server restart |
|-------|---------------|-------|--------------------------|-------------------------------|
| Browser `sessionStorage` | Nickname, device UUID | Browser tab | No | No |
| Nakama database | User account, username, user ID | PostgreSQL (Railway) | Yes | Yes |
| Nakama Storage | W / L / D / streak / bestStreak | PostgreSQL via Nakama | Yes | Yes |
| Nakama Leaderboard | Cumulative score, rank | PostgreSQL via Nakama | Yes | Yes |
| Server RAM | Active board, currentTurn, timer | Match handler memory | — | No |

See `DATA_STORAGE.md` for full schema details and code locations.

---

## API Reference

### RPC Endpoints

Called by the client via `nakamaClient.rpc(session, rpcId, payload)`.

| RPC ID | Payload | Response | Description |
|--------|---------|----------|-------------|
| `find_or_create_match` | `{ "mode": "classic" \| "timed" }` | `{ "match_id": "..." }` | Joins an existing open match or creates a new one |
| `create_match` | `{ "mode": "classic" \| "timed" }` | `{ "match_id": "..." }` | Always creates a new private match |
| `get_leaderboard` | `{}` | `{ "records": [...] }` | Returns top 20 players with full stats |

### WebSocket Op Codes

Messages sent over Nakama's real-time match data channel.

| Op Code | Constant | Direction | Payload fields | Description |
|---------|----------|-----------|----------------|-------------|
| `1` | `STATE_UPDATE` | Server → Client | `board, players, currentTurn, winner, moveCount, turnDeadline` | Full state after every move |
| `2` | `MOVE` | Client → Server | `{ "position": 0–8 }` | Player submits a move |
| `3` | `GAME_OVER` | Server → Client | `{ winner, board, reason, players }` | Match ended; reason is `normal`, `forfeit`, `timeout`, or `terminated` |
| `5` | `TIMER_UPDATE` | Server → Client | `{ "remaining": N }` | Timed mode: seconds left in the current turn |

### Nakama Storage Schema

| Collection | Key | Owner | Fields | Read | Write |
|------------|-----|-------|--------|------|-------|
| `stats` | `record` | Each user ID | `wins, losses, draws, streak, bestStreak` | Public (2) | Server-only (0) |

### Leaderboard

| ID | Operator | Sort | Scoring |
|----|----------|------|---------|
| `tictactoe_wins` | `incr` (cumulative) | Descending | Win = +200 · Draw = +10 · Loss = +0 |

### Nakama Server Flags (from Dockerfile CMD)

```
--name nakama1
--socket.server_key defaultkey       # client auth key
--session.token_expiry_sec 7200      # 2-hour session tokens
--runtime.path /nakama/data/modules  # where the JS bundle lives
--runtime.js_entrypoint index.js     # entry point of the bundle
--logger.level INFO
```

---

## Local Development Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Nakama + CockroachDB)
- [Node.js 18+](https://nodejs.org/)

### Step 1 — Clone the repository

```bash
git clone https://github.com/ChahatBiswas/tictactoe-nakama.git
cd tictactoe-nakama
```

### Step 2 — Build the server module

The server is TypeScript. It must be compiled to a single JS bundle that Nakama can load.

```bash
cd server
npm install
npm run build
# Output: server/build/index.js
cd ..
```

> The build uses `esbuild` with `--supported:object-extensions=false` to work around a Nakama JS runtime AST parser limitation with shorthand object properties (e.g. `{ a }` vs `{ a: a }`).

### Step 3 — Start Nakama + CockroachDB

```bash
docker-compose up
```

`docker-compose.yml` starts two containers:
- **cockroachdb** — a single-node CockroachDB instance (Nakama's database). Exposes ports `26257` (SQL) and `8080` (admin UI).
- **nakama** — Nakama 3.22.0. Mounts `server/build/` into the container so the compiled JS is available. First runs `migrate up` to create the database schema, then starts the server.

Wait for:
```
nakama-1  | {"level":"info","msg":"Startup done"}
```

Then:
- Nakama API: `http://localhost:7350`
- Nakama Console: `http://localhost:7350` — login: `admin` / `admin`
- CockroachDB UI: `http://localhost:8080`

### Step 4 — Start the React client

```bash
cd client
cp .env.example .env       # already points to localhost:7350
npm install
npm start                  # opens http://localhost:3000
```

### Client environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_NAKAMA_HOST` | `localhost` | Nakama server hostname |
| `REACT_APP_NAKAMA_PORT` | `7350` | Nakama API port |
| `REACT_APP_NAKAMA_SSL` | `false` | Use HTTPS/WSS (set to `true` in production) |
| `REACT_APP_NAKAMA_KEY` | `defaultkey` | Nakama server key (must match `--socket.server_key`) |

> React CRA bakes these into the JS bundle at build time. Changing them requires a rebuild.

### Reset all local data

```bash
docker-compose down -v   # removes the CockroachDB data volume
docker-compose up        # fresh database
```

---

## Cloud Deployment

The production stack uses two services:

| Service | Platform | What it runs |
|---------|----------|-------------|
| Nakama game server | Railway | Docker container (from `Dockerfile`) |
| React client | Vercel | Static site built from `client/` |
| Database | Railway (managed) | PostgreSQL addon |

### Part 1 — Deploy Nakama to Railway

Railway builds and runs the `Dockerfile` automatically.

**How the Dockerfile works:**

```dockerfile
# Stage 1: build the TypeScript server module into a single JS bundle
FROM node:18-alpine AS builder
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build
# Result: /app/build/index.js

# Stage 2: copy the bundle into the official Nakama image
FROM registry.heroiclabs.com/heroiclabs/nakama:3.22.0
COPY --from=builder /app/build/index.js /nakama/data/modules/index.js
EXPOSE 7349 7350 7351
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["/nakama/nakama migrate up --database.address \"$DATABASE_URL\" && exec /nakama/nakama ..."]
```

The `CMD` reads `$DATABASE_URL` at runtime, which Railway injects from the PostgreSQL addon.

**Deployment steps:**

1. Push the repo to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select this repo.
3. Railway detects `railway.json` and the `Dockerfile` automatically. Click **Deploy**.
4. Add a database: **+ New Service** → **Database** → **PostgreSQL**. Railway creates the database and injects `DATABASE_URL` into the Nakama service automatically.
5. In the Nakama service → **Settings** → **Networking** → **Generate Domain**. This gives you a public URL like `your-app.up.railway.app`.
6. Redeploy after adding the database so `$DATABASE_URL` is available on startup.

**Railway environment variables set:**

| Variable | Value | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | (Railway reference to PostgreSQL) | Nakama reads this to connect to the database |
| `NAKAMA_SOCKET_SERVER_KEY` | `defaultkey` | Sets the server auth key |

**How `railway.json` works:**

```json
{
  "build": { "dockerfilePath": "Dockerfile" },
  "deploy": { "restartPolicyType": "ON_FAILURE", "restartPolicyMaxRetries": 3 }
}
```

Tells Railway to use the root `Dockerfile` and restart the container on crash (up to 3 times).

---

### Part 2 — Deploy the React client to Vercel

Vercel hosts the static React build on a global CDN.

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → **Import** this GitHub repo.
2. Set **Root Directory** to `client` (so Vercel builds only the client folder).
3. Add environment variables in Vercel → **Settings** → **Environment Variables**:

| Variable | Value | Description |
|----------|-------|-------------|
| `REACT_APP_NAKAMA_HOST` | `your-app.up.railway.app` | Railway domain (no `https://`) |
| `REACT_APP_NAKAMA_PORT` | `443` | HTTPS port |
| `REACT_APP_NAKAMA_SSL` | `true` | Use WSS + HTTPS |
| `REACT_APP_NAKAMA_KEY` | `defaultkey` | Must exactly match Railway's `NAKAMA_SOCKET_SERVER_KEY` |

4. Click **Deploy**. Vercel runs `npm run build` inside the `client/` directory and deploys the output.

> After changing env vars in Vercel, always do a **fresh redeploy** (without cache) so the new values are baked into the JS bundle.

---

## How to Test Multiplayer

### Local — two browser tabs

```bash
docker-compose up         # terminal 1
cd client && npm start    # terminal 2
```

1. Open `http://localhost:3000` in **Tab 1** → enter a nickname → click **Quick Match**.
2. Open `http://localhost:3000` in **Tab 2** → enter a nickname → click **Quick Match**.
3. Both tabs pair automatically (each tab has its own UUID → its own Nakama account).

### Cloud — two browser windows / devices

Open `https://tictactoe-nakama-chi.vercel.app` in two different browser windows (or incognito). Enter different nicknames and click **Quick Match** in both.

### Private rooms

1. In Tab 1 → click **Create Private Room** → copy the Room ID shown.
2. In Tab 2 → paste the Room ID into the "Join by ID" field → click **Join**.

### Timed mode

1. Both players select **Timed** before matchmaking.
2. Once in game, let a turn expire (30 seconds). The server auto-forfeits the inactive player.
3. Check the leaderboard — the active player gets a win, the inactive one gets a loss.

### Leaderboard

Play several games with different tabs/nicknames. Return to the lobby and see the live leaderboard update. Win streaks increment with consecutive wins and reset on a loss (draws don't break streaks).

### Reset all data (local)

```bash
docker-compose down -v && docker-compose up
```

---

## Bonus Features

| Feature | Status | Implementation details |
|---------|--------|------------------------|
| Concurrent game sessions | Done | Each Nakama match is an isolated handler instance with its own `MatchState`. Unlimited simultaneous games. |
| Ranked leaderboard | Done | `tictactoe_wins` leaderboard + per-player `stats` storage updated atomically at match end. Shows W/L/D, streaks, and global rank. |
| Timed game mode (30s/turn) | Done | `turnDeadline` timestamp in server-side state. Checked every tick. Client countdown bar is visual only — server enforces the forfeit. |
| Change nickname mid-session | Done | "Change" button in the lobby clears `sessionStorage` and returns to the nickname screen. Next login creates a fresh Nakama account. |
| Forfeit on disconnect | Done | `matchLeave` fires when a player's WebSocket drops. The remaining player is immediately declared the winner. |
