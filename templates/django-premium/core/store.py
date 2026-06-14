"""Demo data layer — an in-memory store so the app renders immediately (no
migrate needed). For real persistence, switch to the Item model in models.py
(run `python manage.py makemigrations && migrate`) and query Item.objects."""

_items = [
    {"id": 1, "name": "First item"},
    {"id": 2, "name": "Second item"},
]


def all_items():
    return _items


def add_item(name: str):
    item = {"id": (_items[-1]["id"] + 1) if _items else 1, "name": name}
    _items.append(item)
    return item
