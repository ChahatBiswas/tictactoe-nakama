# Data Storage Reference

This document explains exactly where every piece of data in the game is stored, who owns it, and how long it lasts.

---

## 1. Browser — `sessionStorage`

Lives in the **user's browser tab**. Cleared automatically when the tab or window is closed.

| Key | Value | Set When | Cleared When |
|-----|-------|----------|--------------|
| `nickname` | Display name the user typed (e.g. `"Alice"`) | User clicks "Start Playing" | Tab closes, or user clicks "Change Nickname" |
| `deviceId` | Random UUID (e.g. `"a1b2-c3d4-..."`) | First time the tab loads | Tab closes |

**Where in code:** `client/src/App.tsx`
```js
sessionStorage.setItem("nickname", name);   // saved on Start
sessionStorage.setItem("deviceId", id);     // generated once per tab
```

`deviceId` is the key that ties a browser session to a Nakama account. Each new tab gets a fresh UUID → fresh Nakama account.

---

## 2. Nakama Database — User Accounts

Stored in **CockroachDB** (local) or **PostgreSQL** (cloud), managed entirely by Nakama. Persists across sessions forever.

| What | Where in Nakama | Set When |
|------|----------------|----------|
| User account | `users` table | First `authenticateDevice()` call |
| Username (display name) | `users.username` column | On account creation with the nickname as the initial username |
| User ID (UUID) | `users.id` column | On account creation |

**Where in code:** `client/src/nakama/client.ts`
```js
nakamaClient.authenticateDevice(deviceId, true, displayName)
// deviceId → links session to account
// displayName → sets the Nakama username (only on first creation)
```

If the nickname is already taken by another account, Nakama returns HTTP 409. The code catches this and retries without a username — Nakama then auto-assigns a random username.

---

## 3. Nakama Storage — Player Stats

Stored in **Nakama's key-value storage** (backed by CockroachDB/PostgreSQL). Persists forever, per user.

| Collection | Key | Owner | Fields |
|------------|-----|-------|--------|
| `stats` | `record` | Each player's user ID | `wins`, `losses`, `draws`, `streak`, `bestStreak` |

**Read permission:** `2` (public — anyone can read)
**Write permission:** `0` (server-only — only the server can write)

**Where in code:** `server/src/match_handler.ts`
```js
// Read
nk.storageRead([{ collection: "stats", key: "record", userId: playerId }]);

// Write (after each match ends)
nk.storageWrite([{
  collection: "stats",
  key: "record",
  userId: playerId,
  value: { wins, losses, draws, streak, bestStreak },
  permissionRead: 2,
  permissionWrite: 0,
}]);
```

Updated at end of every match (win, loss, draw, forfeit, timeout).

---

## 4. Nakama Leaderboard — Scores

Stored in **Nakama's leaderboard system** (backed by CockroachDB/PostgreSQL). Persists forever.

| Leaderboard ID | Operator | Points Awarded |
|----------------|----------|----------------|
| `tictactoe_wins` | `incr` (cumulative) | Win = +200 pts · Draw = +10 pts · Loss = +0 pts |

**Where in code:** `server/src/match_handler.ts`
```js
nk.leaderboardRecordWrite("tictactoe_wins", playerId, username, points, 0, {});
```

Created once on server startup in `server/src/main.ts`:
```js
nk.leaderboardCreate("tictactoe_wins", true, "desc", "incr", undefined, {});
```

---

## 5. In-Memory — Active Match State

Exists **only in RAM** while a match is running. Lost when the match ends or the server restarts.

| Data | Description |
|------|-------------|
| `board` | 9-cell array (`""`, `"X"`, `"O"`) |
| `players` | Map of `userId → "X" or "O"` |
| `currentTurn` | User ID of the player whose turn it is |
| `winner` | Null until match ends; then user ID or `"draw"` |
| `turnDeadline` | Timestamp for timed-mode countdown |

**Where in code:** `server/src/match_handler.ts` — the `MatchState` object lives in Nakama's match handler and is never written to disk.

---

## Summary

| Data | Storage | Persists After Tab Close | Persists After Server Restart |
|------|---------|--------------------------|-------------------------------|
| Nickname (typed) | Browser `sessionStorage` | No | No |
| Device ID | Browser `sessionStorage` | No | No |
| Nakama user account | Database (CockroachDB/PostgreSQL) | Yes | Yes |
| W / L / D / Streaks | Nakama Storage | Yes | Yes |
| Score / Leaderboard | Nakama Leaderboard | Yes | Yes |
| Active match board | Server RAM | — | No |
