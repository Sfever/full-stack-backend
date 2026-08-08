# Chatbot backend

Minimal Node/Express and OpenRouter backend for the Video Forge Studios
game-information chatbot. All chatbot logic is kept in `src/server.js`.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to your PostgreSQL connection string.
3. Set `OPENROUTER_API_KEY` in `.env`.
4. Run `npm install`.
5. Run `npm run dev`.

The backend verifies its PostgreSQL connection before listening on
`http://localhost:3000` by default. Database queries can import the shared pool
from `src/database.js`.

## Endpoints

- `GET /api/health`
- `POST /api/chat` with JSON `{ "message": "What is Lanyards Attack?", "history": [] }`

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

Authentication and authorization are not implemented yet. Until Passport session
support is added, the update and delete endpoints must not be exposed publicly.

## Database Schema

The local `users` table contains:

- `id`, `username`, `email`, and the password hash in `credential`
- database-controlled `journalist` and `admin` flags
- the registration-controlled `pending_journalist` flag
- `created_at`, `updated_at`, and nullable `deleted_at` timestamps

Deleting a user is a soft delete: the API records `deleted_at` instead of
removing the row.
