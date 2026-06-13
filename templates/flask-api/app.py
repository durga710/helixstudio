"""A minimal Flask REST API. Run: pip install -r requirements.txt && flask run."""
from flask import Flask, jsonify, request

app = Flask(__name__)

# In-memory sample store. Replace with a real database (SQLAlchemy, etc.).
items = [
    {"id": 1, "name": "First item"},
    {"id": 2, "name": "Second item"},
]


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.get("/api/items")
def list_items():
    return jsonify(items)


@app.post("/api/items")
def create_item():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="name is required"), 400
    item = {"id": (items[-1]["id"] + 1) if items else 1, "name": name}
    items.append(item)
    return jsonify(item), 201


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
