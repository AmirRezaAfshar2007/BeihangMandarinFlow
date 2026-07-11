# DEPLOYMENT_GUIDE.md

A beginner-friendly, step-by-step guide to running this project locally and deploying it for free.

## What changed and why (quick summary)

- The app used to store all data in a file called `db.json` sitting next to the code. That's fine on your laptop, but almost every free hosting provider (including Render) wipes that file every time your app restarts or redeploys — so all your users and their progress would disappear. **Fix:** the app now stores everything in MongoDB Atlas, a real cloud database with a generous free tier.
- Passwords, tokens, and API keys used to have insecure fallbacks baked into the code. **Fix:** the app now refuses to start unless you provide these as environment variables — nothing insecure is hardcoded.
- Login had no protection against someone guessing passwords thousands of times per minute. **Fix:** login is now rate-limited to 5 attempts per 15 minutes per IP address.
- The code was one giant 688-line file. **Fix:** it's now organized into folders by responsibility (`routes`, `services`, `models`, etc.) so it's easier to find and change things safely.

Full technical detail is in `AUDIT_REPORT.md` and `MONGODB_MIGRATION_GUIDE.md`.

---

## 1. Running locally

### Prerequisites
- Node.js 20 or newer (`node -v` to check)
- A free MongoDB Atlas account (see step 2)

### Steps
```bash
npm install
cp .env.example .env
```
Now open `.env` and fill in:
- `JWT_SECRET` — generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `MONGODB_URI` — from Atlas, see step 2 below.
- `GEMINI_API_KEY` — optional; without it, character lookups use a built-in local dictionary instead of the AI-powered one.

Then create your first admin account (there is no default admin anymore — see `AUDIT_REPORT.md` §1.7 for why):
```bash
npm run seed:admin -- --studentId=401120000 --fullName="Your Name" --password="choose-a-strong-password"
```

Start the dev server:
```bash
npm run dev
```
Visit `http://localhost:3000`.

---

## 2. Creating a MongoDB Atlas database (free tier)

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. Click **Create a deployment** → choose the **M0 Free** tier → pick any region close to you → **Create**.
3. You'll be prompted to create a database user — choose a username and click **Autogenerate Secure Password** (copy it somewhere safe).
4. Under **Network Access**, add `0.0.0.0/0` (allow access from anywhere) so Render can reach it. This is standard for a small app connecting to Atlas from a PaaS with dynamic IPs; if you want tighter security later, Render's paid tiers offer static outbound IPs you can allowlist instead.
5. Click **Connect** on your cluster → **Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Add a database name to the path (Mongo creates it automatically on first write), e.g.:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/beihang_mandarin?retryWrites=true&w=majority
   ```
7. Paste this into `MONGODB_URI` in your `.env` (and later, in Render's environment variables).

---

## 3. Deploying the backend to Render (free tier)

1. Push this project to a GitHub repository.
2. Go to https://dashboard.render.com → **New** → **Blueprint** → connect your repo. Render will detect `render.yaml` and pre-fill the service.
   - Alternatively: **New** → **Web Service**, connect the repo, and set:
     - Build command: `npm install && npm run build`
     - Start command: `npm start`
3. Under **Environment**, set:
   - `MONGODB_URI` — your Atlas connection string from step 2
   - `GEMINI_API_KEY` — optional
   - `CORS_ORIGIN` — your Vercel frontend URL (step 4), comma-separated if you have multiple (e.g. a custom domain too)
   - `JWT_SECRET` — Render's blueprint auto-generates this for you; if deploying manually, generate one yourself (see step 1)
4. Deploy. Render will build and start the app. Visit `https://<your-service>.onrender.com/api/health` — you should see `{"status":"ok",...}`.
5. Create your admin account against the live database. Easiest way: run the seed script locally with `MONGODB_URI` pointed at your Atlas cluster (same `.env` you're using in Render):
   ```bash
   npm run seed:admin -- --studentId=401120000 --fullName="Your Name" --password="choose-a-strong-password"
   ```

**Free tier note:** Render's free web services spin down after 15 minutes of inactivity and take ~30-60 seconds to wake up on the next request. That's expected and fine for a small class project; upgrade to a paid instance if you need always-on.

---

## 4. Deploying the frontend to Vercel (optional — Render can also serve the frontend)

This app is a single Express server that both serves the API *and*, in production, serves the built React frontend as static files (see `server.ts`) — so **you can deploy just the Render backend and be done.** Use Vercel only if you specifically want the frontend on its own domain/CDN.

1. Go to https://vercel.com → **Add New** → **Project** → import your GitHub repo.
2. Framework preset: **Vite**.
3. Build command: `vite build`. Output directory: `dist`.
4. Add an environment variable if your frontend needs to know the backend URL for API calls (this app currently calls relative `/api/...` paths, which only works when frontend and backend share an origin — if you split them across Render and Vercel, you'll need to either (a) add a Vercel rewrite/proxy for `/api/*` to your Render URL, or (b) update `src/lib/api.ts`'s `request()` function to prefix calls with a full backend URL from an env var).
5. Deploy. Add the resulting `https://your-app.vercel.app` URL to `CORS_ORIGIN` on your Render backend.

---

## 5. Connecting a custom domain

- **Render:** Service → Settings → Custom Domains → add your domain, then create the CNAME/A record your registrar tells you to. Render provisions a free TLS certificate automatically.
- **Vercel:** Project → Settings → Domains → add your domain, follow the DNS instructions shown. Also automatic free TLS.
- After adding a custom domain, update `CORS_ORIGIN` on the backend to include it.

---

## 6. Backups

MongoDB Atlas's free M0 tier does **not** include automated backups. Options:
- **Manual export:** use `mongodump`/`mongoexport` (via `mongosh` or MongoDB Compass) periodically, or Atlas's built-in **Export** to download a JSON/BSON snapshot.
- **Upgrade to a paid Atlas tier (M10+)** for continuous, automated backups with point-in-time recovery — reasonable once this is handling real student data you can't afford to lose.
- At minimum, schedule a monthly manual export while on the free tier, and treat it as a real requirement before this handles a live class, not a nice-to-have.

---

## 7. Estimated monthly cost

| Service | Free tier | When you'd need to pay |
|---|---|---|
| MongoDB Atlas M0 | Free forever, 512MB storage | Upgrade to M10 (~$0.08/hr, ~$57/mo) once you need backups or outgrow 512MB |
| Render (backend) | Free, spins down after 15 min idle | Starter plan ~$7/mo for always-on, no cold starts |
| Vercel (frontend, optional) | Free (Hobby plan) | Pro plan $20/mo/user only needed for commercial use or team features |
| Gemini API | Free tier available (rate-limited) | Pay-as-you-go pricing if you exceed the free quota — check current pricing at ai.google.dev, since this changes over time |
| Domain name (optional) | — | ~$10-15/year via any registrar |

**Bottom line:** this can run entirely free for a small class (with occasional cold-start delays and manual backups), or roughly **$7-15/month** for an always-on, backup-capable setup for a single course.
