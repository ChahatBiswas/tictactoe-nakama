# Multiplayer Tic-Tac-Toe — Nakama Backend

A real-time, server-authoritative multiplayer Tic-Tac-Toe game built with React and Nakama game server. Supports concurrent game sessions, a global ranked leaderboard, and a timed game mode.

---

## Table of Contents

1. [Architecture & Design Decisions](#architecture--design-decisions)
2. [Setup & Installation](#setup--installation)
3. [API & Server Configuration](#api--server-configuration)
4. [Deployment Process](#deployment-process)
5. [How to Test Multiplayer](#how-to-test-multiplayer)
6. [Bonus Features](#bonus-features)

---

## Architecture & Design Decisions

```
┌─────────────────────┐         WebSocket / REST          ┌──────────────────────┐
│   React Client      │ ────────────────────────────────▶ │   Nakama Server      │
│   (Vercel)          │ ◀──────────────────────────────── │   (Railway)          │
└─────────────────────┘       real-time match data         └──────────┬───────────┘
                                                                       │ SQL
                                                             ┌─────────▼───────────┐
                                                             │  CockroachDB /      │
                                                             │  PostgreSQL         │
                                                             └─────────────────────┘
```

### Key Design Decisions

**Server-authoritative game logic**
All game logic (move validation, win detection, turn enforcement, timeouts) runs inside `server/src/match_handler.ts` as a Nakama match handler. The client only sends a move position (0–8); the server validates it, updates state, and broadcasts to both players. This prevents cheating and race conditions.

**Device-based authentication**
Players authenticate via a random UUID stored in `sessionStorage`. Each browser tab generates its own UUID → its own Nakama account. This enables multiple players on the same machine without requiring sign-up. Nicknames are set as the Nakama username on first account creation.

**Concurrent game isolation**
Each match runs as a completely isolated Nakama match handler instance with its own `MatchState`. Match labels (`open`/`mode`) allow the matchmaker to list only available rooms in the correct mode. Closed matches are invisible to new players.

**Leaderboard + storage separation**
- `nk.leaderboardRecordWrite` stores the cumulative score (used for ranking and sorting).
- `nk.storageWrite` stores W/L/D/streak/bestStreak per player (used for displaying detailed stats).
Both are updated atomically at match end (normal win, forfeit, or timeout).

**Timed mode enforcement on the server**
The 30-second turn timer is tracked by `turnDeadline` (a Unix timestamp) in server-side match state. Every tick, the server checks if the deadline has passed and auto-forfeits if so. The client timer bar is purely visual — it cannot be manipulated to prevent a forfeit.

### Project Structure

```
tictactoe-nakama/
├── server/
│   └── src/
│       ├── main.ts             # InitModule: registers RPCs + match handler + leaderboard
│       ├── match_handler.ts    # All game logic: matchInit, matchJoin, matchLoop, matchLeave
│       └── types.ts            # MatchState type, OpCodes, win detection
├── client/
│   └── src/
│       ├── App.tsx             # Auth flow + screen routing (nickname → lobby → game)
│       ├── components/
│       │   ├── Board.tsx       # 3×3 grid with CSS animations
│       │   ├── GameRoom.tsx    # Waiting room, active game, game-over screen
│       │   └── Lobby.tsx       # Mode selection, matchmaking buttons, leaderboard
│       ├── hooks/useMatch.ts   # WebSocket match state hook (join, receive, send moves)
│       └── nakama/client.ts    # Nakama SDK wrapper: auth, socket, RPCs
├── Dockerfile                  # Multi-stage: builds server bundle + runs Nakama
├── railway.json                # Railway deployment config
├── docker-compose.yml          # Local dev: Nakama + CockroachDB
├── deploy/
│   └── nakama-droplet-setup.sh # Alternative: DigitalOcean VPS setup script
└── DATA_STORAGE.md             # Documents every data storage location
```

---

## Setup & Installation

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 18+](https://nodejs.org/)

### Step 1 — Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/tictactoe-nakama.git
cd tictactoe-nakama
```

### Step 2 — Build the Nakama server module

```bash
cd server
npm install
npm run build
# Outputs: server/build/index.js (the bundled JS runtime for Nakama)
cd ..
```

> The build command uses `esbuild` with `--supported:object-extensions=false` to work around a Nakama JS runtime AST parser limitation with shorthand object properties.

### Step 3 — Start Nakama + CockroachDB

```bash
docker-compose up
```

Wait for the log line:
```
nakama-1  | {"level":"info","msg":"Startup done"}
```

- Nakama API: `http://localhost:7350`
- Nakama Console (admin UI): `http://localhost:7350` → login: `admin` / `admin`
- CockroachDB UI: `http://localhost:8080`

### Step 4 — Start the React client

```bash
cd client
cp .env.example .env        # defaults already point to localhost:7350
npm install
npm start                   # opens http://localhost:3000
```

### Environment Variables (client)

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_NAKAMA_HOST` | `localhost` | Nakama server hostname |
| `REACT_APP_NAKAMA_PORT` | `7350` | Nakama API port |
| `REACT_APP_NAKAMA_SSL` | `false` | Use HTTPS/WSS |
| `REACT_APP_NAKAMA_KEY` | `defaultkey` | Nakama server key |

### Reset all data

To wipe all accounts, scores, and match history:

```bash
docker-compose down -v   # removes the CockroachDB volume
docker-compose up        # fresh start
```

---

## API & Server Configuration

### RPC Endpoints

Called by the client via `nakamaClient.rpc(session, rpcId, payload)`.

| RPC ID | Payload | Response | Description |
|--------|---------|----------|-------------|
| `find_or_create_match` | `{"mode":"classic"\|"timed"}` | `{"match_id":"..."}` | Joins an open match or creates a new one |
| `create_match` | `{"mode":"classic"\|"timed"}` | `{"match_id":"..."}` | Always creates a new private room |
| `get_leaderboard` | `{}` | `{"records":[...]}` | Returns top 20 players with W/L/D/streak/score |

### WebSocket Op Codes

Messages exchanged over Nakama's real-time match data channel.

| Op Code | Direction | Payload | Description |
|---------|-----------|---------|-------------|
| `1` | Server → Client | `{board, players, currentTurn, winner, moveCount, turnDeadline}` | Full state broadcast after every move |
| `2` | Client → Server | `{"position": 0–8}` | Player submits a move |
| `3` | Server → Client | `{winner, board, reason, players}` | Match ended (reason: `normal`, `forfeit`, `timeout`, `terminated`) |
| `5` | Server → Client | `{"remaining": N}` | Timed mode: seconds remaining in current turn |

### Nakama Storage Schema

| Collection | Key | Owner | Fields | Permissions |
|------------|-----|-------|--------|-------------|
| `stats` | `record` | Per user ID | `wins, losses, draws, streak, bestStreak` | Read: public · Write: server-only |

### Leaderboard

| ID | Operator | Sort | Points |
|----|----------|------|--------|
| `tictactoe_wins` | `incr` (cumulative) | Descending | Win=200 · Draw=10 · Loss=0 |

### Nakama Server Flags

```
--session.token_expiry_sec 7200   # 2-hour session tokens
--runtime.js_entrypoint index.js  # entry point of the bundled module
--logger.level INFO               # log verbosity (DEBUG locally, INFO in prod)
```

---

## Deployment Process

### Option A — Railway (recommended, free tier)

#### 1. Deploy Nakama server

1. Push this repo to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → select this repo.
3. Railway detects the `Dockerfile` automatically — click **Deploy**.
4. Click **+ New Service → Database → PostgreSQL** — Railway injects `DATABASE_URL` automatically.
5. In the Nakama service → **Settings → Networking → Generate Domain**.
6. Copy the domain, e.g. `tictactoe-nakama.up.railway.app`.

#### 2. Deploy React client (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New Project → Import** this GitHub repo.
2. Set **Root Directory** to `client`.
3. Add these **Environment Variables** in the Vercel dashboard:

```
REACT_APP_NAKAMA_HOST  =  tictactoe-nakama.up.railway.app
REACT_APP_NAKAMA_PORT  =  443
REACT_APP_NAKAMA_SSL   =  true
REACT_APP_NAKAMA_KEY   =  defaultkey
```

4. Click **Deploy**. Your game URL will be `https://your-app.vercel.app`.

---

### Option B — DigitalOcean Droplet ($6/mo)

```bash
# 1. Build server module locally
cd server && npm run build

# 2. Provision a fresh Ubuntu 22.04 droplet (1 GB RAM minimum)
# 3. Copy files to the droplet
scp -r server/build root@<DROPLET_IP>:/opt/nakama/modules
scp deploy/nakama-droplet-setup.sh root@<DROPLET_IP>:/opt/

# 4. Run the setup script on the droplet
ssh root@<DROPLET_IP> "bash /opt/nakama-droplet-setup.sh"
```

Open firewall ports: **7349, 7350, 7351**.

Set client env vars:
```
REACT_APP_NAKAMA_HOST = <DROPLET_IP>
REACT_APP_NAKAMA_PORT = 7350
REACT_APP_NAKAMA_SSL  = false
```

---

## How to Test Multiplayer

### Local testing (two browser tabs)

1. Start Nakama: `docker-compose up`
2. Start client: `cd client && npm start`
3. Open `http://localhost:3000` in **Tab 1** → enter nickname → click **Quick Match**
4. Open `http://localhost:3000` in **Tab 2** → enter nickname → click **Quick Match**
5. Both tabs are paired automatically and the game begins.

> Each tab generates its own device ID and authenticates as a separate Nakama user.

### Testing private rooms

1. In Tab 1 → click **Create Private Room** → copy the Room ID shown at the bottom.
2. In Tab 2 → paste the Room ID into the "Join by ID" field → click **Join**.

### Testing timed mode

1. Select **Timed** mode in both tabs before matchmaking.
2. Once in-game, let a turn expire (30 seconds) — the server will auto-forfeit the inactive player.
3. Check the leaderboard — the inactive player gets a loss, the other gets a win.

### Testing the leaderboard

1. Play several games across multiple tabs/nicknames.
2. Return to the lobby — the leaderboard updates after every match.
3. Win streaks are tracked: consecutive wins without a loss increment the streak counter.

### Resetting test data

```bash
docker-compose down -v && docker-compose up
```

---

## Bonus Features

| Feature | Status | Details |
|---------|--------|---------|
| Concurrent game support | ✅ | Nakama isolates each match; unlimited simultaneous sessions |
| Leaderboard system | ✅ | W/L/D + streaks + global ranking + persistent storage |
| Timer-based game mode | ✅ | 30s/turn, server-enforced auto-forfeit, live countdown UI |
