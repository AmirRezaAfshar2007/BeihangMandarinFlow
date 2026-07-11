# Beihang Mandarin Flow (Sino3D)

A Chinese-character learning platform with spaced-repetition (SM-2) practice, an AI-assisted dictionary lookup, XP/achievements, and an admin panel — built with React + Vite on the frontend and Express + TypeScript + MongoDB on the backend.

> This project was audited, security-hardened, and migrated from a JSON-file datastore to MongoDB Atlas. See **AUDIT_REPORT.md** for the full list of issues found and fixed, **MONGODB_MIGRATION_GUIDE.md** for schema details, and **DEPLOYMENT_GUIDE.md** for a complete setup + deploy walkthrough (start here if you just want to run it).

## Quick start

```bash
npm install
cp .env.example .env   # then fill in JWT_SECRET and MONGODB_URI — see DEPLOYMENT_GUIDE.md
npm run seed:admin -- --studentId=401120000 --fullName="Your Name" --password="choose-a-strong-password"
npm run dev
```

Full instructions, including creating a free MongoDB Atlas cluster and deploying to Render/Vercel: **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**.

## Project structure

```
├── server.ts                  # Entrypoint: connects DB, wires Vite/static serving, starts listening
├── render.yaml                # Render deployment blueprint
├── scripts/
│   └── createAdmin.ts         # One-time CLI script to provision the first admin account
├── src/
│   ├── App.tsx, main.tsx, index.css      # React app root
│   ├── components/                       # React components (Login, Dashboard, Quiz, Admin, SpeechPlayer)
│   ├── lib/api.ts                        # Frontend API client
│   ├── types.ts                          # Types shared between frontend and backend
│   ├── app.ts                            # Express app: middleware + route mounting
│   ├── config/
│   │   ├── env.ts                        # Validated environment loading
│   │   └── database.ts                   # MongoDB (Mongoose) connection
│   ├── models/                           # Mongoose schemas: User, Character, PracticeLog, Stats, Achievement, Session
│   ├── middleware/                       # auth (requireAuth/requireAdmin), rate limiting, error handling
│   ├── routes/                           # Thin route handlers per resource
│   ├── services/                         # Business logic (auth, characters, practice/SRS, stats aggregation, admin, Gemini dictionary)
│   ├── utils/                            # asyncHandler, typed AppError hierarchy, input validators
│   └── types/
│       └── express.d.ts                  # AuthRequest / JWT payload typing
├── AUDIT_REPORT.md
├── DEPLOYMENT_GUIDE.md
├── MONGODB_MIGRATION_GUIDE.md
└── .env.example
```

## Tech stack

- **Frontend:** React 19, Vite 6, Tailwind CSS
- **Backend:** Express 4, TypeScript, Mongoose 8 (MongoDB Atlas)
- **Auth:** JWT (bearer tokens) with server-side revocable sessions
- **Security:** helmet, cors, express-rate-limit, express-mongo-sanitize
- **AI lookups:** Google Gemini (`@google/genai`), with an offline local-dictionary fallback
"# Beihang-University-Mandarin-Flow" 
