# Multiplayer Tic-Tac-Toe — Nakama Backend

## Architecture

```
client (React)  ──WebSocket──▶  Nakama Server  ──▶  CockroachDB
                    REST/RPC
```

- **Server-authoritative**: all game logic runs in `server/src/match_handler.ts` as a Nakama match handler. The client only sends move positions; the server validates, applies, and broadcasts state.
- **Matchmaking**: two RPCs — `find_or_create_match` (auto-pair) and `create_match` (private room). Match labels carry `open`/`mode` so listing works correctly.
- **Modes**: Classic and Timed (30s per turn, auto-forfeit on timeout).
- **Leaderboard**: Nakama built-in leaderboard (`tictactoe_wins`).

## Local Dev Setup

### Prerequisites
- Docker Desktop
- Node.js 18+

### 1. Build server module
```bash
cd server
npm install
npm run build      # outputs server/build/index.js
```

### 2. Start Nakama + CockroachDB
```bash
# from repo root
docker-compose up
```
- Nakama console: http://localhost:7350 (admin / admin)
- API: ws://localhost:7350

### 3. Start React client
```bash
cd client
cp .env.example .env   # defaults point to localhost
npm install
npm start              # http://localhost:3000
```

### 4. Test multiplayer locally
Open two browser tabs at http://localhost:3000. Each tab gets a unique device ID and authenticates as a separate player. Click **Quick Match** in both tabs — they'll be paired automatically.

## Deployment

### Nakama (DigitalOcean Droplet)
```bash
# 1. Build server module locally
cd server && npm run build

# 2. Provision a $6/mo Ubuntu droplet, then:
scp -r server/build root@<DROPLET_IP>:/opt/nakama/modules
scp deploy/nakama-droplet-setup.sh root@<DROPLET_IP>:/opt/
ssh root@<DROPLET_IP> "bash /opt/nakama-droplet-setup.sh"
```

Open firewall ports: 7349, 7350, 7351.

### Frontend (Vercel)
```bash
cd client
# Set env vars in Vercel dashboard:
#   REACT_APP_NAKAMA_HOST  = <DROPLET_IP>
#   REACT_APP_NAKAMA_PORT  = 7350
#   REACT_APP_NAKAMA_SSL   = false
#   REACT_APP_NAKAMA_KEY   = defaultkey

npx vercel --prod
```

## API / Server Config

| RPC | Payload | Returns |
|-----|---------|---------|
| `find_or_create_match` | `{"mode":"classic"\|"timed"}` | `{"match_id":"..."}` |
| `create_match` | `{"mode":"classic"\|"timed"}` | `{"match_id":"..."}` |
| `get_leaderboard` | — | Nakama leaderboard records |

| Op Code | Direction | Meaning |
|---------|-----------|---------|
| 1 | Server→Client | Full state update |
| 2 | Client→Server | Move `{"position":0-8}` |
| 3 | Server→Client | Game over |
| 5 | Server→Client | Timer tick `{"remaining":N}` |

## Project Structure
```
tictactoe-nakama/
├── server/
│   └── src/
│       ├── main.ts           # Registers match handler + RPCs
│       ├── match_handler.ts  # All server-authoritative game logic
│       └── types.ts          # Shared types, win detection
├── client/
│   └── src/
│       ├── App.tsx           # Auth + routing
│       ├── components/
│       │   ├── Board.tsx     # 3x3 grid
│       │   ├── GameRoom.tsx  # In-game view
│       │   └── Lobby.tsx     # Matchmaking + leaderboard
│       ├── hooks/useMatch.ts # WebSocket match state hook
│       └── nakama/client.ts  # Nakama SDK wrapper + RPCs
├── deploy/
│   └── nakama-droplet-setup.sh
└── docker-compose.yml
```
