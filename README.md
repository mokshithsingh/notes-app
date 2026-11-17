# Notes

A note-taking web app with file attachments, trash, and a paid Pro plan.

- **Notes:** create, edit with autosave, search, trash, restore, delete permanently
- **Attachments:** upload files up to 10 MB to any note and download them later
- **Plans:** Free (up to 10 notes) and Pro (unlimited, ₹149/month)
- **Payments:** built-in **test-mode** payment gateway (no real money is charged)
- **Accounts:** sign up / log in with JWT in an httpOnly cookie
- **Error tracking:** server errors are reported with [faultline-tracker](https://www.npmjs.com/package/faultline-tracker)

## Tech stack
- **Backend:** Node.js, Express 5, PostgreSQL (`pg`), bcrypt, JWT, multer
- **Frontend:** plain HTML, CSS and JavaScript (ES modules, no build step), served by the backend

## Getting started

Requirements: Node.js 18+, PostgreSQL 13+.

```bash
cd backend
npm install
cp .env.example .env      # then fill in your database details and secrets
npm run migrate           # creates the tables
npm run dev               # or: npm start
```

Open **http://localhost:5000** (or the `PORT` you set).

## Deploying with Docker

The app and its own PostgreSQL run as a Docker Compose project named `notes`.
Tables are created automatically when the app starts.

```bash
git clone https://github.com/mokshithsingh/notes-app.git notes && cd notes
cp .env.example .env      # set DB_PASSWORD, JWT_SECRET (openssl rand -hex 64), Faultline settings
docker compose up -d --build
```

Open **http://&lt;server-ip&gt;:4210** (change with `NOTES_PORT`). Update later with `git pull && docker compose up -d --build`.

> Never run `docker compose down -v`: `-v` deletes the database and uploaded files.

## Test cards
Payments run in test mode. Use any future expiry date, any 3-digit CVC and any name.

| Card number | Result |
|---|---|
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 0002` | Card declined |
| `4000 0000 0000 9995` | Insufficient funds |

## Project structure
```
backend/
  server.js              Express app: API routes + serves the frontend
  config/db.js           PostgreSQL connection pool
  db/schema.sql          Database schema (npm run migrate)
  routes/                URL -> controller mapping
  controllers/           Request handlers (auth, notes, billing)
  middleware/            Auth, note ownership & limits, uploads, error handling
  services/paymentGateway.js   Test-mode card payment processor
  utils/plans.js         Plan definitions (Free / Pro)
frontend/
  index.html, css/, js/  Single-page app (hash routing)
```

## API overview
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account (logs you in) |
| POST | `/api/auth/login` · `/logout` | Log in / out |
| GET | `/api/auth/me` | Current user and plan |
| GET / POST | `/api/notes` | List (`?search=`) / create notes |
| GET / PATCH / DELETE | `/api/notes/:id` | Read / update / permanently delete (from trash) |
| PATCH | `/api/notes/:id/trash` · `/restore` | Move to / restore from trash |
| GET | `/api/notes/trash` | Notes in the trash |
| POST | `/api/notes/:id/attachments` | Upload a file (`multipart/form-data`, field `file`) |
| GET / DELETE | `/api/notes/:id/attachments/:attachmentId` | Download / delete a file |
| GET | `/api/billing/plans` | Available plans |
| GET | `/api/billing/account` | Plan, usage and payment history |
| POST | `/api/billing/checkout` | Pay for Pro with a card |
