# Deploying Game Shelf: Vercel (frontend) + Render (backend)

This guide walks through deploying from scratch. Do the steps in order.

---

## Part 1: Backend on Render

### 1.1 Create the Web Service

1. Go to [render.com](https://render.com) and sign in.
2. Click **New** → **Web Service**.
3. Connect your GitHub account if needed, then select the **Interactive_Game_Library** repo (or whatever you named it).
4. Use these settings:

   | Field | Value |
   |-------|--------|
   | **Name** | `gameshelf` (or any name; this becomes your URL) |
   | **Region** | Pick one close to you |
   | **Branch** | `main` (or your default branch) |
   | **Runtime** | `Node` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |

5. Do **not** deploy yet. Click **Advanced** and add environment variables first.

### 1.2 Environment variables (Render)

Add these in the Render dashboard. Replace placeholders with your real values.

| Key | Value | Required? |
|-----|--------|-----------|
| `NODE_ENV` | `production` | Yes |
| `SESSION_SECRET` | Long random string (e.g. run `openssl rand -hex 32` locally and paste) | Yes |
| `ALLOWED_ORIGIN` | **Leave blank for now.** You will set this in step 2.3 after you have your Vercel URL. | Yes (before testing login) |
| `SESSION_SAME_SITE_NONE` | `1` | Yes (for cross-origin cookie) |

**Optional** (for game metadata, Steam sync, etc.):

| Key | Value |
|-----|--------|
| `RAWG_API_KEY` | From [rawg.io](https://rawg.io) |
| `STEAM_API_KEY` | From [Steam](https://steamcommunity.com/dev/apikey) |
| `TWITCH_CLIENT_ID` | From [Twitch](https://dev.twitch.tv/console) |
| `TWITCH_CLIENT_SECRET` | From same Twitch app |

**Optional – persistent DB (recommended):**  
Without this, Render’s disk is ephemeral and data (and sessions) can be lost on restart.

| Key | Value |
|-----|--------|
| `TURSO_DATABASE_URL` | From step 1.3 below |
| `TURSO_AUTH_TOKEN` | From same Turso database (see **1.3 Set up Turso** below) |

6. Click **Create Web Service**. Wait for the first deploy to finish.
7. Copy your backend URL from the top of the dashboard, e.g. `https://gameshelf-xxxx.onrender.com`. No trailing slash.

### 1.3 Set up Turso (recommended for persistent data)

Turso is a hosted SQLite-compatible database. The app uses it for users, games, and sessions so data survives Render restarts.

1. Go to [turso.tech](https://turso.tech) and sign in (GitHub or email).
2. Click **Create database** (or **New database**).
3. Choose a **name** (e.g. `gameshelf`) and a **region** close to your Render region. Create the database.
4. Open the database and go to **Connect** or **Settings**. You need two values:
   - **Database URL** — looks like `libsql://gameshelf-yourusername.turso.io`. Add this to Render as `TURSO_DATABASE_URL`.
   - **Auth token** — click **Generate token** or **Reveal** to copy it. Add it to Render as `TURSO_AUTH_TOKEN`. Keep it secret.
5. In **Render** → your Web Service → **Environment**, add:
   - `TURSO_DATABASE_URL` = the database URL (no trailing slash)
   - `TURSO_AUTH_TOKEN` = the auth token
6. Save. Render will redeploy. The app will create tables on first request.

If you skip Turso, the app uses SQLite files on Render's ephemeral disk; data may be lost on deploy or restart.

### 1.4 Verify backend

- Open: `https://YOUR-BACKEND-URL.onrender.com/api/health`  
  You should see: `{"ok":true}`

---

## Part 2: Frontend on Vercel

### 2.1 Create the project

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New** → **Project**.
3. Import your **Interactive_Game_Library** repo (same as Render).
4. Vercel will detect Vite from the repo. Keep the defaults:
   - **Build Command:** `npm run build:client` (from `vercel.json`)
   - **Output Directory:** `dist`
5. Before deploying, open **Environment Variables** and add the one below.

### 2.2 Environment variable (Vercel)

| Key | Value |
|-----|--------|
| `VITE_API_URL` | Your Render backend URL, e.g. `https://gameshelf-xxxx.onrender.com` (no trailing slash) |

This is the **only** env var the frontend needs. Everything else (API keys, session secret, Turso) stays on Render.

6. Click **Deploy**. Wait for the build to finish.
7. Copy your Vercel URL from the dashboard, e.g. `https://your-project.vercel.app`. No trailing slash.

### 2.3 Connect backend to frontend (Render)

So the session cookie works when the browser is on Vercel and calls Render:

1. In **Render** → your Web Service → **Environment**.
2. Set **`ALLOWED_ORIGIN`** to your **exact** Vercel URL from step 2.2, e.g. `https://your-project.vercel.app`. No trailing slash.
3. Save. Render will redeploy automatically.

### 2.4 Verify frontend

1. Open your **Vercel** URL in the browser.
2. You should see the Game Shelf landing page.
3. Register or log in.
4. If you get “not authenticated” or 401 after login:
   - Confirm on **Render** that `ALLOWED_ORIGIN` is exactly the Vercel URL you’re using (same as in the address bar).
   - Confirm `SESSION_SAME_SITE_NONE` is set to `1` on Render.
   - Clear cookies for both the Vercel and Render domains (or use an incognito window) and try again.

---

## Quick reference

### Render (backend)

- **Build:** `npm install`
- **Start:** `npm start`
- **Required env:** `NODE_ENV`, `SESSION_SECRET`, `ALLOWED_ORIGIN` (your Vercel URL), `SESSION_SAME_SITE_NONE=1`
- **Optional:** Turso (see 1.3; persistent DB), RAWG/Steam/Twitch keys

### Vercel (frontend)

- **Build:** from `vercel.json` → `npm run build:client`, output `dist`
- **Required env:** `VITE_API_URL` (your Render URL)
- No other env vars needed for the frontend

### Order that matters

1. (Optional) Create a Turso database at turso.tech and note the URL and auth token.
2. Deploy Render with required env vars; add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` if using Turso → get backend URL.
3. Deploy Vercel with `VITE_API_URL` = backend URL → get frontend URL.
4. On Render, set `ALLOWED_ORIGIN` = frontend URL (and `SESSION_SAME_SITE_NONE=1` if not already set).
5. Test login from the Vercel site; use a clean session (incognito or clear cookies) if you had 401s before.
