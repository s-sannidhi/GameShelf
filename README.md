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

## Deployment (Vercel + Render)

**Start from the top:** **[DEPLOY.md](./DEPLOY.md)** — step-by-step guide (backend on Render, then frontend on Vercel, in the right order with exact env vars and verification).

### Short reference

- **Render:** Build `npm install`, Start `npm start`. Required env: `NODE_ENV`, `SESSION_SECRET`, `ALLOWED_ORIGIN` (your Vercel URL), `SESSION_SAME_SITE_NONE=1`. Optional: Turso (persistent DB), RAWG/Steam/Twitch keys.
- **Vercel:** Only env: `VITE_API_URL` = your Render URL. Set `ALLOWED_ORIGIN` on Render **after** you have the Vercel URL.
- **Order:** Deploy Render → get backend URL → deploy Vercel with `VITE_API_URL` → get frontend URL → set `ALLOWED_ORIGIN` on Render → redeploy Render. Then test login (use incognito or clear cookies if you had 401s before).

## Tech stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion.
- **Backend**: Express, Drizzle ORM, SQLite.
- **Metadata**: RAWG API (search + box art/screenshots). Optional: Twitch Client ID + Secret for IGDB box art; Steam API for library sync.
