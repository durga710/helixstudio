# Express API

A production-structured Express REST API with an **MVC** layout and security
defaults (helmet, cors).

```
src/server.js              entry point
src/app.js                 express app: helmet/cors/json + error handling
src/config.js              env-driven config (dotenv)
src/routes/                route definitions
src/controllers/           request handlers (validate → model → response)
src/models/                data layer (swap the in-memory store for a DB/ORM)
src/middleware/error.js    404 + centralized error handler
```

## Run

```bash
npm install
npm run dev     # node --watch
# npm start     # production
```

- `GET /health` → `{ "status": "ok" }`
- `GET /api/items` · `POST /api/items` `{ "name": "..." }`

Copy `.env.example` → `.env` and adjust. Set `CORS_ORIGIN` to your frontend in production.
