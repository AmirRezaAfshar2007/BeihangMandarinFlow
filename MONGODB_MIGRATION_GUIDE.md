# MONGODB_MIGRATION_GUIDE.md

How the app moved from `db.json` (a single file, read/written whole on every request) to MongoDB Atlas with Mongoose, and how the six collections map to the old schema.

## 1. What was removed

- `db.json` (deleted)
- `src/db.ts` — `getDb()` / `saveDb()` and all `fs.readFileSync` / `fs.writeFileSync` persistence logic (deleted)
- Every in-memory `db.<collection>.find/filter/push/splice` call in the old `server.ts` (replaced with Mongoose queries in `src/services/*`)

## 2. Collections

| Old (`db.json` array) | New (Mongoose model) | File |
|---|---|---|
| `students` | `User` | `src/models/User.ts` |
| `characters` | `Character` | `src/models/Character.ts` |
| `practiceLogs` | `PracticeLog` | `src/models/PracticeLog.ts` |
| `stats` | `Stats` | `src/models/Stats.ts` |
| `achievements` | `Achievement` | `src/models/Achievement.ts` |
| `sessions` | `Session` | `src/models/Session.ts` |

### User
```
studentId   String, unique, required, matches /^\d{5,15}$/
fullName    String, required
passwordHash String, required, select:false (never returned by default)
role        'admin' | 'student', default 'student'
disabled    Boolean, default false
createdAt / updatedAt  (automatic via { timestamps: true })
```

### Character
```
studentId        String, indexed
character/simplified/traditional/pinyin/englishMeaning/persianMeaning  String
radicals         String[]
strokeCount, hskLevel, frequencyRank   Number
exampleWords     [{ word, pinyin, meaning }]
exampleSentences [{ sentence, pinyin, meaning }]
lastReviewed     Date | null
reviewCount, learningLevel, memoryStability, interval  Number
nextReviewDate   String (YYYY-MM-DD), indexed
```
Compound unique index `{studentId, character}` — a student can't add the same character twice (previously only checked in JS, with a race condition).
Compound index `{studentId, learningLevel}` — speeds up "how many mastered characters" aggregations.

### PracticeLog
```
studentId    String, indexed
characterId  ObjectId, ref: 'Character'   (was previously just a string on the log)
character    String (snapshot, for display without a join)
quizMode     enum
success      Boolean
score        Number (0-100)
timestamp    Date, indexed
```
Compound index `{studentId, timestamp: -1}` for "recent activity" queries.

### Stats
```
studentId          String, unique
currentStreak, totalXp, studyTimeSeconds  Number
lastActiveDate     String | null
```

### Achievement
```
studentId    String, indexed
title, description  String
unlockedAt   Date
icon         String
```
Compound **unique** index `{studentId, title}` — the database itself now prevents double-unlocking an achievement, closing a race condition that existed in the old in-memory `Set` check.

### Session
```
tokenHash   String, unique   — sha256(JWT), the raw token is never stored
studentId   String, indexed
expiresAt   Date             — TTL index (expireAfterSeconds: 0) auto-deletes expired sessions
```

## 3. Query pattern migration examples

**Before** (`server.ts`):
```ts
const userChars = db.characters.filter(c => c.studentId === studentId);
const masteredCount = db.characters.filter(c => c.studentId === studentId && c.learningLevel === 3).length;
```

**After** (`src/services/stats.service.ts`):
```ts
const [charAgg] = await Character.aggregate([
  { $match: { studentId } },
  { $facet: {
      total: [{ $count: 'count' }],
      mastered: [{ $match: { learningLevel: 3 } }, { $count: 'count' }],
      dueForReview: [{ $match: { nextReviewDate: { $lte: todayStr } } }, { $count: 'count' }],
  }},
]);
```
One round trip to MongoDB computes all three counts, instead of loading every character document into Node and filtering three times.

**Admin overview before:** looped over every student and ran 2 more `.filter()` calls per student (N+1 pattern).
**Admin overview after:** a single `User.aggregate([...])` pipeline with `$lookup` joins `stats` and `characters` per student server-side, and excludes `passwordHash` at the `$project` stage so it never leaves the database layer.

## 4. Setting up MongoDB Atlas (summary — full walkthrough in DEPLOYMENT_GUIDE.md)

1. Create a free account at https://www.mongodb.com/cloud/atlas/register
2. Create a free **M0** cluster.
3. Database Access → add a database user with a strong, generated password.
4. Network Access → add `0.0.0.0/0` (or Render's static IPs if you upgrade later) so Render can connect.
5. Connect → "Drivers" → copy the `mongodb+srv://...` connection string into `MONGODB_URI` in your `.env`.

## 5. Running the migration on an existing deployment

If you have real user data in an old `db.json` you need to preserve, write a one-off script that:
1. Reads `db.json`.
2. For each `student`, `Stats.create`, then `User.create` with the existing `passwordHash` (bcrypt hashes are portable — no need to re-hash).
3. For each `character`, `PracticeLog`, `achievement`, insert directly, mapping field names 1:1 (see tables above).
4. Skip `sessions` entirely — force everyone to log in again, since the new session model hashes tokens differently and old JWTs were signed with the old secret anyway.

This project ships without such a script because the original deployment used seed/demo data only (see `AUDIT_REPORT.md` §1.7) — there was no real user data to preserve.
