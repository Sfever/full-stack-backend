# Chatbot backend

Minimal Node/Express and OpenRouter backend for the Video Forge Studios
game-information chatbot. All chatbot logic is kept in `src/server.js`.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `OPENROUTER_API_KEY` in `.env`.
3. Run `npm install`.
4. Run `npm run dev`.

The API listens on `http://localhost:3000` by default.

## Endpoints

- `GET /api/health`
- `POST /api/chat` with JSON `{ "message": "What is Lanyards Attack?", "history": [] }`

The model defaults to OpenRouter's `openrouter/auto` router. Set
`OPENROUTER_MODEL` in `.env` to use a specific model instead. Game information is
managed in `src/game-context.js`; clients only send the current message and
optional recent conversation history.
