# Deploying CRM Builder

CRM Builder deploys as a single Node web service. This guide covers the
recommended free stack: **Render (free tier) + MongoDB Atlas (free tier) +
Google OAuth**. Total cost: $0.

## 1. MongoDB Atlas (free tier)

1. Create an account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and create a **free M0 cluster** (any region close to your Render region).
2. Under **Database Access**, add a database user with a strong password (role: *Read and write to any database*).
3. Under **Network Access**, add `0.0.0.0/0` (Render's free tier has no static outbound IPs).
4. Click **Connect → Drivers** and copy the connection string, e.g.
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   This becomes `MONGODB_URI`. The app creates its collections (`users`, `data`, `events`) automatically in the `crmbuilder` database.

## 2. Google OAuth credentials

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials), create a project.
2. Configure the **OAuth consent screen** (External, app name "CRM Builder", add your email; publishing status "Testing" is fine to start — add your users as test users, or publish for open signup).
3. Create **Credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://<your-app>.onrender.com`
   - Authorized redirect URIs: `https://<your-app>.onrender.com/auth/google/callback`
4. Copy the **Client ID** and **Client Secret**.

> You can deploy without Google credentials — the app then runs sign-in-less
> (fully local, per-device data). Add the credentials later to enable accounts.

## 3. Render (free tier)

The repo contains a `render.yaml` blueprint.

1. Push this repository to GitHub.
2. In the [Render dashboard](https://dashboard.render.com): **New → Blueprint**, pick the repo. Render reads `render.yaml` and creates the web service on the **free** plan (`SESSION_SECRET` is generated automatically).
3. Set the remaining environment variables when prompted (or later under *Environment*):

   | Variable | Value |
   |---|---|
   | `APP_URL` | `https://<your-app>.onrender.com` (shown after first deploy) |
   | `MONGODB_URI` | the Atlas connection string from step 1 |
   | `GOOGLE_CLIENT_ID` | from step 2 |
   | `GOOGLE_CLIENT_SECRET` | from step 2 |
   | `ADMIN_EMAILS` | comma-separated emails that should get the admin role |

4. Deploy. Health checks hit `/healthz`.

Alternatively skip the blueprint: **New → Web Service**, runtime Node,
build command `npm install --omit=dev`, start command `npm start`, plan Free,
and set the env vars above plus `NODE_ENV=production` and a random `SESSION_SECRET`.

### Free-tier notes

- **Cold starts**: free web services spin down after ~15 minutes idle; the first request afterwards takes ~30–60s. The PWA hides this well — the app shell loads instantly from the service worker cache and data loads locally, then syncs when the server wakes.
- **Disk is ephemeral**: don't rely on the file-store fallback in production — set `MONGODB_URI`. (Without it the server still runs, but synced data would be lost on redeploys.)
- **Admin role**: the *first account ever to sign in* automatically becomes admin, and so does any email listed in `ADMIN_EMAILS`. Admins get the **Admin** section in the sidebar (accounts, business analytics).

## 4. Verify the deployment

1. Open `https://<your-app>.onrender.com` — the onboarding screen should load.
2. `https://<your-app>.onrender.com/healthz` should return `{"ok":true,"storage":"mongodb"}` — if it says `"file"`, `MONGODB_URI` isn't set.
3. Sign in with Google, create a module, then open the site in a private window and sign in again — your workspace should sync down.
4. Install it: browser menu → *Install CRM Builder* (desktop) or *Add to Home Screen* (mobile).

## Local development

```sh
npm install
npm run dev        # http://localhost:8321
```

With no env vars set, local dev uses file storage (`./data/store.json`, git-ignored)
and a passwordless **dev sign-in** (email only) so you can test accounts, sync,
and the admin dashboard without any external services. Set `MONGODB_URI` and/or
Google credentials in your shell to test the production paths.

You can also serve the frontend alone as a static site (`python3 -m http.server`) —
everything works per-device with sign-in disabled.
