# Express API

A minimal Express REST API starter.

## Run

```bash
npm install
npm start
```

- `GET /health` → `{ "status": "ok" }`
- `GET /api/items` → list items
- `POST /api/items` `{ "name": "..." }` → create an item

Replace the in-memory store in `index.js` with a real database when you're ready.
