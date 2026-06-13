# Flask API

A Flask REST API using the **application-factory** pattern with blueprints,
config, and a models layer — a clean MVC-style structure to grow into.

```
wsgi.py            entry point (create_app)
config.py          env-driven config (SECRET_KEY, DEBUG)
app/__init__.py    the app factory + health route + error handlers
app/api/routes.py  controllers (the /api/items resource)
app/models/item.py the data layer (swap the in-memory store for a DB)
```

## Run

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
flask --app wsgi run            # dev
# gunicorn wsgi:app             # production
```

- `GET /health` → `{ "status": "ok" }`
- `GET /api/items` · `POST /api/items` `{ "name": "..." }`

Set `SECRET_KEY` and `FLASK_ENV=production` in the environment for production.
