# Django app

A Django project with secure, env-driven settings and a starter app.

```
manage.py            Django CLI
config/              project: settings.py (env-driven, secure), urls.py, wsgi.py, asgi.py
core/                an app: models.py, views.py, urls.py, admin.py, migrations/
```

## Run

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                 # then edit DJANGO_SECRET_KEY
python manage.py migrate
python manage.py runserver
```

- `GET /` and `GET /health/` are JSON views in `core/views.py`
- `/admin/` is the Django admin (run `python manage.py createsuperuser`)

In production set `DJANGO_DEBUG=0` and a real `DJANGO_SECRET_KEY` + `DJANGO_ALLOWED_HOSTS`;
settings auto-enable SSL redirect, secure cookies, and HSTS when DEBUG is off.
