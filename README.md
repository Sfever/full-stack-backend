# Chatbot backend

Minimal Node/Express and OpenRouter backend for the Video Forge Studios
game-information chatbot. All chatbot logic is kept in `src/server.js`.

Requires Node.js `^20.19.0`, `^22.12.0`, or `>=23.0.0` so the migration CLI and
its locked dependencies run on a supported runtime.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to your PostgreSQL connection string.
3. Set `SESSION_SECRET` to at least 32 random bytes.
4. Set `OPENROUTER_API_KEY` in `.env`.
5. Run `npm install`.
6. Run `npm run migrate` to apply pending PostgreSQL migrations.
7. Run `npm run dev`.

The backend verifies its PostgreSQL connection before listening on
`http://localhost:3000` by default. Database queries can import the shared pool
from `src/database.js`.

Login sessions use an HTTP-only cookie and PostgreSQL's `user_sessions` table.
The session table is created automatically; application-owned tables are
managed by `node-pg-migrate` in the `migrations` directory.
Set `TRUST_PROXY=true` only when the backend is behind exactly one trusted
reverse proxy that terminates HTTPS.

## Endpoints

- `GET /api/health`
- `POST /api/chat` with JSON `{ "message": "What is Lanyards Attack?", "history": [] }`
- `POST /api/auth/login` with JSON
  `{ "email": "name@example.com", "password": "the account password" }`
- `GET /api/auth/me` returns the authenticated user's private profile
- `POST /api/auth/logout` destroys the session and clears its cookie

### Development blog endpoints

Public routes:

- `GET /api/blog` lists published entries with title, excerpt, author username,
  optional cover image URL, and publication timestamps
- `GET /api/blog/:slug` returns one published entry including its Markdown body

Administrator-only routes:

- `GET /api/blog/manage` lists drafts and published entries
- `POST /api/blog/manage` uploads an entry as JSON containing `title`, `slug`,
  `excerpt`, `bodyMarkdown`, `sourceFilename`, optional `coverImageUrl`, and a
  `draft` or `published` status
- `PATCH /api/blog/manage/:id/status` changes an entry between `draft` and
  `published`
- `DELETE /api/blog/manage/:id` soft-deletes an entry

Blog management trusts only the database-controlled `admin` role reloaded by
Passport. Markdown is limited to 256 KiB. Cover images are optional and must use
a public HTTPS hostname; the backend stores the URL but does not fetch arbitrary
remote resources.

The model defaults to OpenRouter's `openrouter/auto` router. Set
`OPENROUTER_MODEL` in `.env` to use a specific model instead. Game information is
managed in `src/game-context.js`; clients only send the current message and
optional recent conversation history.

### User management endpoints
Base URL: `/api/user`

- `POST /api/user/create` with JSON
  `{ "username": "name", "email": "name@example.com", "password": "at least 8 characters", "pendingJournalist": false }`
- `POST /api/user/update` with JSON containing `id` and one or more of
  `username`, `email`, `password`, or `pendingJournalist`
- `POST /api/user/delete` with JSON `{ "id": 1 }`
- `GET /api/user/info?id=1` returns the public profile fields `id`, `username`,
  `createdAt`, and `updatedAt`

Passwords are salted and hashed by the backend. Only the resulting hash is stored
in `credential`, and it is never included in API responses. The `admin` and
`journalist` fields are database-controlled and are rejected by these APIs.
The public info endpoint also omits email and journalist application state until
authenticated private-profile access is implemented.

Update and delete require a valid Passport session, and the requested `id` must
match the authenticated user's ID. Frontend authentication requests made from a
different origin must set `credentials: "include"` so the browser sends the
session cookie.

## Database Schema

The local `users` table contains:

- `id`, `username`, `email`, and the password hash in `credential`
- database-controlled `journalist` and `admin` flags
- the registration-controlled `pending_journalist` flag
- `created_at`, `updated_at`, and nullable `deleted_at` timestamps

Deleting a user is a soft delete: the API records `deleted_at` instead of
removing the row.

The migrated `blog_posts` table stores blog metadata, Markdown source, the
original upload filename, author foreign key, moderation status, optional cover
URL, publication timestamps, and a nullable soft-deletion timestamp. Active
slugs are unique.
