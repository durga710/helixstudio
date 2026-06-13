# Flask API

A minimal Flask REST API starter.

## Run

```bash
pip install -r requirements.txt
flask run
```

- `GET /health` → `{ "status": "ok" }`
- `GET /api/items` → list items
- `POST /api/items` `{ "name": "..." }` → create an item

Replace the in-memory store in `app.py` with a real database when you're ready.
