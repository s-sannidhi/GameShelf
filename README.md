# Game Shelf

A web app to manage your game library. Sign in with an account, add games (with optional metadata from RAWG), track completion and playtime, and compare libraries with friends.

## Features

- **Accounts**: Register and log in; your library is private to your account.
- **Shelf view**: Games shown as spines on a shelf; click a spine to open details and a screenshot carousel.
- **Add games**: Manual add with optional search (RAWG, plus IGDB box art when Twitch is configured) for cover art and description.
- **Steam sync**: Sync your Steam library (GetOwnedGames) into the shelf; uses Steam CDN for cover images. Set `STEAM_API_KEY` in `.env`; each user enters their own Steam ID 64 when they click "Sync Steam".
- **Detail panel**: Slide-out panel with metadata and your progress (completion date, playtime, rating, notes).
- **Filters & sort**: Filter by Completed / In progress / Backlog; sort by name, completion date, playtime, release date.
- **Friends**: Add friends by username, accept/decline requests, and view **mutual games** (games you both have).

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment variables**
   - Copy `.env.example` to `.env`.
   - **SESSION_SECRET**: Use a long random string in production (sessions are cookie-based). In dev you can leave it unset (a default is used).
   - **RAWG** (optional): Get a free API key at [RAWG](https://rawg.io/login/?forward=developer), then set `RAWG_API_KEY` in `.env` for game search metadata.
   - **Steam** (optional): Get an API key at [Steam Web API](https://steamcommunity.com/dev/apikey) (domain can be `localhost` for dev). Set `STEAM_API_KEY` only. Each user enters their own 64-bit Steam ID when they sync (do not set `STEAM_ID` in .env for multi-user).
   - **Twitch/IGDB** (optional): For IGDB box art in search results, create an app at [Twitch Developer Console](https://dev.twitch.tv/console), then set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in `.env`. Search will then use IGDB cover images when available.

   **Multiple users:** The app is multi-user by default. All keys in `.env` are shared by the server (one RAWG key, one Steam key, one Twitch app). Each user has their own account, library, and friends. For Steam sync, do **not** set `STEAM_ID` in `.env`; each user must enter their own Steam ID 64 when they click "Sync Steam" so their library is synced to their account.

3. **Database**
   - On first run, the SQLite database and tables are created at `data/library.db`. If you had existing game data, a default user (username `imported`, password `changeme`) is created and assigned those games—log in and change the password.

4. **Run**
   ```bash
   npm run dev
   ```
   This starts the API server on port 3001 and the Vite dev server (with proxy to the API). Open the URL shown by Vite (e.g. http://localhost:5173).

## Scripts

- `npm run dev` – Run API + frontend together.
- `npm run client` – Run only the Vite frontend.
- `npm run server` – Run only the API server.
- `npm run build` – Build the frontend for production.
- `npm run db:generate` – Generate Drizzle migrations.
- `npm run db:push` – Push schema to the database.

## Deployment (recommended: Vercel frontend + Render backend)

**Recommended:** Run the **frontend on Vercel** (static SPA) and the **backend on Render** (or Fly.io). This avoids serverless limits and keeps Express, sessions, and SQLite on a normal Node server.

### 1. Deploy the backend (Render)

1. Go to [Render](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub repo and select this project.
3. **Build command:** `npm install` (do not use `npm run build` here—frontend is on Vercel).
4. **Start command:** `npm start`
5. **Environment variables** (in Render dashboard):
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = a long random string (e.g. `openssl rand -hex 32`)
   - `ALLOWED_ORIGIN` = your Vercel URL, e.g. `https://your-app.vercel.app` (no trailing slash). Required so the session cookie works across origins (otherwise you’ll get “not authenticated” after login).
   - Optional: `RAWG_API_KEY`, `STEAM_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (see `.env.example`)
6. Deploy. The server creates `data/library.db` and `data/sessions.db` on the ephemeral disk. For **persistent data**, add a **Disk** in Render and mount it (e.g. `data`), or use **Turso** (see below).
7. Copy your backend URL (e.g. `https://your-app.onrender.com`).

### 2. Deploy the frontend (Vercel)

1. Import the repo at [Vercel](https://vercel.com). The repo’s `vercel.json` is used (frontend-only; no API on Vercel).
2. **Environment variable:** `VITE_API_URL` = your backend URL from step 1 (no trailing slash), e.g. `https://your-app.onrender.com`.
3. Deploy. The app will call your backend for all `/api` requests.

### 3. Backend on Fly.io (alternative)

- **Start:** `npm start`
- **Persistent SQLite:** Add a [volume](https://fly.io/docs/reference/volumes/) and mount it so `data/` persists.
- Set `ALLOWED_ORIGIN` to your Vercel frontend URL.

### 4. Backend with Turso (no local SQLite)

If you prefer a hosted DB instead of SQLite on the backend host:

- Create a DB at [turso.tech](https://turso.tech) and get **Database URL** and **Auth token**.
- On Render (or Fly), add env vars: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. The server will use Turso instead of SQLite; no disk needed for the DB.

### 5. Single-host (no Vercel)

Run everything on one Node host (e.g. Render only): build with `npm run build`, start with `npm start`. The server serves `dist/` and `/api`. Do **not** set `VITE_API_URL` or `ALLOWED_ORIGIN`.

### 6. Optional: full-stack on Vercel (advanced)

You can run the API as a Vercel serverless function with **Turso** by re-adding the `/api` rewrite and using the `api/` handler (see git history or `vercel.json`). This setup is more fragile (sessions, body parsing, cold starts); the recommended approach is frontend on Vercel + backend on Render.

### Troubleshooting "401 Unauthorized" after login (Vercel + Render)

1. **Backend env (Render):** Set `ALLOWED_ORIGIN` to your **exact** Vercel URL (e.g. `https://your-app.vercel.app`, no trailing slash). Add `SESSION_SAME_SITE_NONE=1` so the session cookie is sent cross-origin. Redeploy.
2. **Check session:** After logging in from the Vercel site, open in the same tab:  
   `https://your-backend.onrender.com/api/auth/session-check`  
   You should see `{ "cookieSent": true, "hasSession": true, "hasUserId": true }`.  
   - If `cookieSent` is false, the browser is not sending the cookie (wrong ALLOWED_ORIGIN or cookie attributes).  
   - If `cookieSent` is true but `hasSession` or `hasUserId` is false, the session store may have lost data (e.g. Render restarted with ephemeral disk).
3. **Clear cookies** for both sites and log in again from the Vercel URL.

## Tech stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion.
- **Backend**: Express, Drizzle ORM, SQLite.
- **Metadata**: RAWG API (search + box art/screenshots). Optional: Twitch Client ID + Secret for IGDB box art; Steam API for library sync.
