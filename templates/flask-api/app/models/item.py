"""Item model. This in-memory store stands in for a database (swap in
SQLAlchemy / your ORM here). The controller talks only to this module."""
from dataclasses import dataclass, asdict


@dataclass
class Item:
    id: int
    name: str

    def to_dict(self) -> dict:
        return asdict(self)


_items: list[Item] = [Item(1, "First item"), Item(2, "Second item")]


def all_items() -> list[dict]:
    return [i.to_dict() for i in _items]


def add_item(name: str) -> dict:
    next_id = (_items[-1].id + 1) if _items else 1
    item = Item(next_id, name)
    _items.append(item)
    return item.to_dict()
