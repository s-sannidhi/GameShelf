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

## Deployment (Vercel + backend host)

The app splits into a **frontend** (static) and **backend** (Node + SQLite). Vercel serves the frontend; the backend runs on a host that supports long-running Node. Good options:

- **[Render](https://render.com)** – Free tier, connect GitHub repo, add a Web Service. Persistent disk optional for SQLite.
- **[Fly.io](https://fly.io)** – Free tier, CLI deploy, attach a [volume](https://fly.io/docs/reference/volumes/) for persistent SQLite.
- **[Koyeb](https://www.koyeb.com)**, **[Cyclic](https://www.cyclic.sh)** – Other Node-friendly hosts.

### 1. Deploy the backend (e.g. Render or Fly.io)

- Deploy the **whole repo** and run the **Node server** (not the Vite dev server).
- **Start command**: `npm start` (runs `tsx server/index.ts`). If your host runs `npm install --production`, add `tsx` to `dependencies` in `package.json`, or use a build step that compiles the server and run `node dist/server/index.js`.
- **Env vars**: Copy `.env.example` and set SESSION_SECRET, RAWG/Steam/Twitch as needed. Set **ALLOWED_ORIGIN** to your Vercel frontend URL (e.g. `https://your-project.vercel.app`). Comma-separated for multiple origins.
- **Database**: The server creates `data/library.db` and `data/sessions.db` on first run. Use a **persistent disk/volume** so data survives restarts; otherwise the DB is ephemeral.
- Note your backend URL (e.g. `https://your-app.onrender.com` or `https://your-app.fly.dev`).

### 2. Deploy the frontend to Vercel

- Import the repo into [Vercel](https://vercel.com). The repo’s `vercel.json` is used automatically.
- **Build**: Uses `npm run build:client`, output directory `dist`.
- **Env var**: Set **VITE_API_URL** to your backend URL (no trailing slash). Redeploy after adding it.
- The site will call your backend for all `/api` requests.

### 3. Full-stack on Vercel (frontend + API on one project)

You can run both the frontend and the API on Vercel using **Turso** (SQLite-compatible, serverless-friendly DB) and the repo’s `api/` serverless route.

1. **Turso database**  
   Create a database at [turso.tech](https://turso.tech), then get:
   - **Database URL** (e.g. `libsql://your-db-name.turso.io`)
   - **Auth token** (for the DB)

2. **Vercel project**  
   Import the repo and add **Environment variables** (for Production and Preview if you want):
   - `TURSO_DATABASE_URL` = your Turso database URL  
   - `TURSO_AUTH_TOKEN` = your Turso auth token  
   - `SESSION_SECRET` = a long random string  
   - Plus any of: `RAWG_API_KEY`, `STEAM_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (same as in `.env.example`).

3. **Do not set** `VITE_API_URL` – the app is same-origin so `/api` is used automatically.

4. Deploy. The app builds the frontend (Vite) and the `api/[[...path]]` serverless function; migrations run on first API request.

### 4. Optional: single-host deployment (no Vercel)

If you run the **entire app** on one Node host (e.g. Render or Fly only, no Vercel), set `NODE_ENV=production`, build with `npm run build`, and run `npm start`; the server serves `dist/` and `/api`. Do **not** set `VITE_API_URL` or `ALLOWED_ORIGIN` in that case.

## Tech stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion.
- **Backend**: Express, Drizzle ORM, SQLite.
- **Metadata**: RAWG API (search + box art/screenshots). Optional: Twitch Client ID + Secret for IGDB box art; Steam API for library sync.
