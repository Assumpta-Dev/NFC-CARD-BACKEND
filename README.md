# 🔧 NFC Card System — Backend API

A production-ready **Node.js + TypeScript + Express + Prisma + PostgreSQL** REST API for the Digital NFC Business Card platform.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js 18+ | Fast I/O, huge ecosystem |
| Language | TypeScript | Type safety across the entire codebase |
| Framework | Express.js | Lightweight, composable middleware |
| ORM | Prisma | Type-safe DB access + migration management |
| Database | PostgreSQL | ACID-compliant relational data |
| Auth | JWT (jsonwebtoken) | Stateless, scalable token auth |
| Validation | Zod | TypeScript-native schema validation |
| Security | Helmet + CORS + Rate Limiting | OWASP-aligned protection |
| Logging | Winston | Structured JSON logs, multiple transports |

---

## Folder Structure

```
backend/
├── src/
│   ├── controllers/        # HTTP handlers — thin, delegate to services
│   │   ├── auth.controller.ts
│   │   ├── card.controller.ts
│   │   └── profile.controller.ts  (also exports AdminController)
│   ├── routes/
│   │   └── index.ts        # All route definitions wired to controllers
│   ├── services/           # Business logic — testable, no HTTP context
│   │   ├── auth.service.ts
│   │   ├── card.service.ts
│   │   ├── scan.service.ts
│   │   └── profile.service.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts      # JWT verification
│   │   ├── validate.middleware.ts  # Zod schema validation
│   │   └── error.middleware.ts     # Global error handler
│   ├── utils/
│   │   ├── logger.ts       # Winston logger
│   │   └── vcard.ts        # vCard file generator
│   ├── types/
│   │   └── index.ts        # Shared TypeScript interfaces
│   └── index.ts            # Server bootstrap
├── prisma/
│   ├── schema.prisma       # Database schema
│   ├── seed.ts             # Dev seed data
│   └── migrations/         # Auto-generated migration files
├── .env.example
├── tsconfig.json
└── package.json
```

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+ running locally or via Docker

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials and JWT secret
```

### 4. Set Up Database
```bash
# Generate Prisma client from schema
npm run db:generate

# Create tables via migrations
npm run db:migrate

# Seed with demo data (optional)
npm run db:seed
```

### 5. Start Development Server
```bash
npm run dev
# API is now at http://localhost:5000
```

---

## API Endpoints

### Public (No Auth Required)
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login, get JWT |
| `GET` | `/api/c/:cardId` | View digital card (NFC/QR scan) |
| `GET` | `/api/c/:cardId/vcard` | Download .vcf contact file |

### Protected (Requires `Authorization: Bearer <token>`)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/me` | Get current user |
| `GET` | `/api/cards/my` | Get user's cards |
| `GET` | `/api/cards/:cardId/analytics` | Card scan analytics |
| `GET` | `/api/profile` | Get own profile |
| `PUT` | `/api/profile` | Update profile + links |

### Admin (Requires Admin Role)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/stats` | System-wide statistics |
| `GET` | `/api/admin/cards` | All cards with owners |
| `POST` | `/api/admin/cards` | Generate new card(s) |
| `GET` | `/api/admin/users` | All users |

---

## Security Features

- **Helmet** — Secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
- **CORS** — Allowlist-based origin control
- **Rate Limiting** — 200 req/15min global, 20 req/15min for auth
- **Bcrypt** — Password hashing with 12 salt rounds
- **JWT** — Signed tokens, verified on every protected request
- **Zod Validation** — All request bodies validated at API boundary
- **Prisma** — Parameterized queries prevent SQL injection
- **No Stack Traces** — Server errors never expose internals to clients

---

## Database Schema

```
users      → id, name, email, password(hashed), role, createdAt
cards      → id, cardId(unique), userId(FK), status, createdAt
profiles   → id, userId(FK,unique), fullName, jobTitle, company, phone, email, website, bio, whatsapp, imageUrl
links      → id, profileId(FK), type, label, url, order
scans      → id, cardId(FK), timestamp, device, ip, userAgent
```

---

## Production Deployment

```bash
# Build TypeScript
npm run build

# Run migrations on production DB
npm run db:deploy

# Start production server
npm start
```

Use environment variables for all secrets. Never hardcode credentials.

---

## Demo Credentials (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | admin@nfccard.com | admin123! |
| User | demo@nfccard.com | demo1234! |
| Demo Card | `CARD_DEMO1` | (scan or visit `/api/c/CARD_DEMO1`) |
