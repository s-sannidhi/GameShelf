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

The app splits into a **frontend** (static) and **backend** (Node + SQLite). Vercel serves the frontend; the backend runs on a host that supports long-running Node (e.g. [Railway](https://railway.app), [Render](https://render.com), [Fly.io](https://fly.io)).

### 1. Deploy the backend

- Deploy the **whole repo** to Railway (or Render, etc.) and run the **Node server** (not just the static build).
- **Start command**: `npm start` (runs `tsx server/index.ts`). Ensure `tsx` is installed in production, or add it to `dependencies` if your host runs `npm install --production`.
- **Env vars**: Copy `.env.example` and set all keys (SESSION_SECRET, RAWG/Steam/Twitch as needed). Set **ALLOWED_ORIGIN** to your Vercel frontend URL, e.g. `https://your-project.vercel.app` (no trailing slash). Use a comma-separated list for multiple origins.
- **Database**: The server uses SQLite and will create `data/library.db` and `data/sessions.db` on first run. On Railway/Render, use a persistent volume or their SQLite add-on if available; otherwise the DB may be ephemeral.
- Note the backend URL (e.g. `https://your-app.railway.app`).

### 2. Deploy the frontend to Vercel

- Import the repo into [Vercel](https://vercel.com). Vercel will use the repo’s `vercel.json`.
- **Build**: Uses `npm run build:client` and output directory `dist`.
- **Env var**: Add **VITE_API_URL** = your backend URL (e.g. `https://your-app.railway.app`) with no trailing slash. This is baked in at build time.
- Deploy. The site will call your backend for all `/api` requests.

### 3. Optional: single-host deployment

If you deploy the **entire app** to one Node host (e.g. only Railway, no Vercel), run the server in production mode (`NODE_ENV=production`). It will serve the built frontend from `dist/` and handle `/api` itself. Do **not** set `VITE_API_URL` or `ALLOWED_ORIGIN` in that case.

## Tech stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion.
- **Backend**: Express, Drizzle ORM, SQLite.
- **Metadata**: RAWG API (search + box art/screenshots). Optional: Twitch Client ID + Secret for IGDB box art; Steam API for library sync.
