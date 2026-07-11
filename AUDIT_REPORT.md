# AUDIT_REPORT.md — Beihang Mandarin Flow (Sino3D) Security & Architecture Audit

**Scope:** Full repository audit of the original Express + Vite + JSON-file (`db.json`) application, followed by a full migration to MongoDB Atlas + Mongoose, security hardening, and restructuring into a layered architecture.

**Severity scale:** 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low

---

## 1. Security Issues

### 🔴 1.1 Hardcoded JWT secret fallback
`server.ts` had: `const JWT_SECRET = process.env.JWT_SECRET || 'sino3d-enterprise-secret-key-2026';`
If `JWT_SECRET` was ever unset (e.g. a misconfigured deploy), every token in production would be signed with a secret visible in the public GitHub repo, letting anyone forge admin tokens.
**Fix:** `src/config/env.ts` now throws at boot if `JWT_SECRET` (or `MONGODB_URI`) is missing — no silent insecure fallback is possible. The deploy guide includes a command to generate a strong random secret.

### 🔴 1.2 A live API key was sitting in the local `.env` file
The uploaded project's `.env` contained a real-looking `GEMINI_API_KEY` value and a weak `JWT_SECRET` (`my-super-secret-key-12345`). Good news: `.env` was correctly listed in `.gitignore` and `git log` confirms it was **never committed** — only the placeholder `.env.example` was tracked. Still, since these values existed in plaintext on disk (and were included in the uploaded zip), **treat both as compromised and rotate them**:
- Generate a new Gemini API key in Google AI Studio and revoke the old one.
- Generate a new `JWT_SECRET` (see command in `.env.example`).
The old `.env` file was **not** included in the delivered project; only `.env.example` (placeholders) ships.

### 🟠 1.3 No rate limiting on authentication endpoints
`/api/auth/login` had no brute-force protection at all — an attacker could try unlimited passwords per second.
**Fix:** `express-rate-limit` on `/api/auth/login` (5 requests / 15 min / IP) and a looser limiter on `/register` and `/forgot-password` (10/hour), plus a general API-wide limiter (300/15min).

### 🟠 1.4 `forgot-password` allows account takeover with public info
Anyone who knows a student's `studentId` + `fullName` (often visible on rosters, ID cards, or guessable) could reset that student's password with no email/SMS verification.
**Fix (partial — documented residual risk):** kept the same UX (no email infrastructure was in scope) but added rate limiting, password-strength validation, and — importantly — **all existing sessions for that account are now revoked** when a password is reset, so a stolen recovery doesn't silently ride along with a session the real owner still trusted. **Recommendation for a real production rollout:** replace with an emailed one-time code (see `DEPLOYMENT_GUIDE.md`).

### 🟠 1.5 No NoSQL-injection / input sanitization
Request bodies were used directly as query filters. Even though the old DB was a JSON file, the code was already shaped to trust `req.body` directly, e.g. `{ "studentId": { "$ne": null } }` would have caused problems once queries ran against a real MongoDB collection.
**Fix:** `express-mongo-sanitize` strips any key starting with `$` or containing `.` from `req.body` / `req.query` / `req.params` before it reaches a query. All route inputs are also explicitly validated (`src/utils/validators.ts`) rather than passed through untyped.

### 🟠 1.6 Missing security headers
No `helmet()` — no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, etc.
**Fix:** `helmet()` applied globally in `src/app.ts`.

### 🟡 1.7 Weak, hardcoded seed credentials
`src/db.ts` auto-created an admin account (`401120000` / `admin123`) and a demo student (`401120145` / `password123`) on first boot of every fresh environment — trivially guessable credentials that would exist on every deployment unless someone remembered to change them.
**Fix:** JSON seeding is gone entirely. A new opt-in script, `npm run seed:admin -- --studentId=... --fullName="..." --password="..."`, lets an operator create exactly one admin account with a password of their choosing. Nothing is seeded automatically.

### 🟡 1.8 Sessions were stored as raw JWTs in the "database"
`db.sessions` stored the full bearer token in plaintext. Anyone with read access to `db.json` (or, after migration, the raw MongoDB collection) could impersonate any logged-in user without ever cracking the JWT secret.
**Fix:** the `Session` model stores only `sha256(token)`. The raw token is never persisted. A TTL index (`expireAfterSeconds: 0` on `expiresAt`) also auto-purges expired sessions instead of relying on manual filtering logic that ran (or didn't) on every login.

### 🟡 1.9 Achievement unlocks were race-prone
Duplicate-achievement prevention used an in-memory `Set` built from a `.find()` on every request — two concurrent practice-log requests could both pass the "not yet unlocked" check and insert the same achievement twice (or double-award bonus XP).
**Fix:** a unique compound index `{ studentId: 1, title: 1 }` on `Achievement` makes duplicate unlocks impossible at the database level; the service layer treats a duplicate-key error as "already unlocked" and moves on.

### 🔵 1.10 No request body size limit
`express.json()` had no `limit`, allowing arbitrarily large request bodies (a cheap DoS vector).
**Fix:** `express.json({ limit: '1mb' })`.

### 🔵 1.11 Stack traces / internal errors could leak to clients
No centralized error handler meant error shapes were inconsistent and some paths could leak internal error messages.
**Fix:** a single `errorHandler` middleware (`src/middleware/errorHandler.ts`) returns clean, consistent JSON errors and only includes internal error detail when `NODE_ENV !== 'production'`.

---

## 2. Architecture & Scalability Issues

### 🔴 2.1 JSON-file "database" (`db.json` + `getDb()`/`saveDb()`)
Every request did a full synchronous read of the entire dataset into memory, mutated it, then wrote the whole file back to disk (`fs.writeFileSync`). This does not scale past a handful of users, has no transactional guarantees (two concurrent writes can clobber each other), and can't run on most PaaS providers with ephemeral/read-only filesystems (Render's free tier included) — data would reset on every redeploy or restart.
**Fix:** Full migration to MongoDB Atlas via Mongoose (see `MONGODB_MIGRATION_GUIDE.md`).

### 🟠 2.2 In-memory filtering instead of database queries
Every "list" or "stats" operation (`db.characters.filter(...)`, `db.practiceLogs.filter(...)`) loaded the *entire* collection into memory and filtered in JavaScript, on every request, for every user.
**Fix:** replaced with indexed Mongoose queries and aggregation pipelines (`$facet`, `$lookup`, `$count`, `$avg`) — see `src/services/stats.service.ts`.

### 🟠 2.3 No separation of concerns
`server.ts` (688 lines) mixed routing, validation, business logic, and persistence in one file.
**Fix:** reorganized into `config/ · models/ · middleware/ · routes/ · services/ · utils/ · types/`. Routes are thin; all business logic lives in `services/`, all persistence in `models/`.

### 🟡 2.4 No centralized error handling
Every route hand-rolled its own `try/catch` and `res.status(...).json(...)` calls, leading to inconsistent error shapes and easy-to-miss unhandled rejections in async handlers.
**Fix:** `asyncHandler` wrapper + centralized `errorHandler` middleware + typed `AppError` hierarchy.

---

## 3. TypeScript Issues

- **No shared request typing for authenticated routes** — `AuthRequest` was defined ad hoc in `server.ts`. Moved to `src/types/express.d.ts` and imported everywhere `req.user` is needed.
- **Loose typing on stored data** — the old code had a hand-written `Schema` interface with no runtime validation. Mongoose schemas now provide both compile-time types (`IUser`, `ICharacter`, …) and runtime validation (required fields, enums, regex, min/max) in one place.
- **Run `npm run lint` (`tsc --noEmit`) after `npm install`** to confirm the new dependency types (`mongoose`, `helmet`, `cors`, `express-rate-limit`, `express-mongo-sanitize`) resolve correctly in your environment — this sandbox had no network access to install packages and verify a full compile, so every new/changed file was instead syntax-checked individually and reviewed by hand. Please run the real typecheck as your first local step (see `DEPLOYMENT_GUIDE.md`).

---

## 4. Database Design Flaws (pre-migration)

- No unique constraints — a student could add the same character to their deck twice, or two accounts could theoretically share a `studentId`, relying entirely on manual `.some()` checks with no atomicity.
- No indexes at all — every query was a full array scan.
- No real relations — `PracticeLog` referenced characters by a denormalized string only.

**Fixes** (full details in `MONGODB_MIGRATION_GUIDE.md`):
- `User.studentId` unique index.
- `Character` compound unique index on `{studentId, character}`.
- `Character.studentId + nextReviewDate` and `Character.studentId + learningLevel` indexes (review queue + mastery aggregations).
- `PracticeLog.studentId + timestamp` compound index (recent-activity queries).
- `Stats.studentId` unique index.
- `Achievement.studentId + title` compound unique index.
- `Session.expiresAt` TTL index; `Session.tokenHash` unique index.
- `PracticeLog.characterId` is now a real `ObjectId` reference to `Character`.

---

## 5. Authentication Weaknesses

- Sessions were "validated" against an array scan of `db.sessions` on every request. Works for 10 rows, falls over at scale.
- No efficient revocation mechanism beyond deleting an array entry and rewriting the whole file.
- Password hashing used bcrypt cost factor 10 — bumped to 12 for a better margin against modern hardware, applied consistently via a single constant in `auth.service.ts`.

**Fix:** JWTs now carry a `jti`; sessions are looked up by `sha256(token)` against an indexed, TTL-expiring `Session` collection — O(1) revocation and automatic expiry, no manual array filtering.

---

## 6. Deployment Blockers

- `db.json` requires a writable, persistent filesystem. Render's free tier (and most serverless/PaaS free tiers) use **ephemeral** filesystems — every deploy or restart would silently reset all user data to the seed data. This alone made the original app unusable in production on the target hosting.
- No `render.yaml`, no documented environment variables, no separation between frontend/backend deploy targets.

**Fix:** `render.yaml` blueprint for the backend, `DEPLOYMENT_GUIDE.md` walking through MongoDB Atlas (free M0 cluster) + Render (backend) + Vercel (frontend, optional) end to end.

---

## 7. What Was *Not* Changed, and Why

- **JWT-in-`localStorage` on the frontend** (`src/lib/api.ts`) was left as-is rather than switched to httpOnly cookies. Cookie-based auth would require CSRF protection and `credentials`/`SameSite` wiring across every fetch call and the CORS config for a cross-origin (Vercel frontend → Render backend) deployment — a materially larger frontend change than this task's scope. The exposure (XSS → token theft) is mitigated by React's default JSX escaping, `helmet()`'s headers, and short-lived, individually revocable sessions. If you later add `dangerouslySetInnerHTML` or a third-party script, revisit this.
- **Frontend components** (`App.tsx`, `components/*.tsx`) were not modified — the REST API contract (paths, request/response shapes) was preserved exactly, so the existing UI works unchanged against the new backend.
- **`forgot-password`'s identity-verification model** (studentId + fullName) was kept for scope reasons — see §1.4.

---

## 8. Summary Table

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1.1 | Hardcoded JWT secret fallback | 🔴 | Fixed |
| 1.2 | Live secret found in local `.env` | 🔴 | Flagged — rotate, not shipped |
| 1.3 | No login rate limiting | 🟠 | Fixed |
| 1.4 | Forgot-password account takeover surface | 🟠 | Mitigated, documented |
| 1.5 | No NoSQL-injection protection | 🟠 | Fixed |
| 1.6 | Missing security headers | 🟠 | Fixed |
| 1.7 | Hardcoded weak seed credentials | 🟡 | Fixed |
| 1.8 | Raw JWTs stored as "sessions" | 🟡 | Fixed |
| 1.9 | Race-prone achievement unlocks | 🟡 | Fixed |
| 1.10 | No body size limit | 🔵 | Fixed |
| 1.11 | Inconsistent error leakage | 🔵 | Fixed |
| 2.1 | JSON-file database | 🔴 | Fixed (MongoDB migration) |
| 2.2 | In-memory filtering | 🟠 | Fixed (aggregation pipelines) |
| 2.3 | No separation of concerns | 🟠 | Fixed (layered architecture) |
| 2.4 | No centralized error handling | 🟡 | Fixed |
| 4.x | No indexes / constraints | 🟠 | Fixed |
| 6.x | Ephemeral-filesystem deploy blocker | 🔴 | Fixed |
