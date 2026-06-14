"""Data layer. In-memory store standing in for a database — swap for an ORM
(SQLAlchemy, etc.). Routes only talk to this module."""

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
