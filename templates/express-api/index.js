// A minimal Express REST API. Run: npm install && npm start
import express from "express";

const app = express();
app.use(express.json());

// In-memory sample store. Replace with a real database.
const items = [
  { id: 1, name: "First item" },
  { id: 2, name: "Second item" },
];

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/items", (_req, res) => {
  res.json(items);
});

app.post("/api/items", (req, res) => {
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  const item = { id: items.length ? items[items.length - 1].id + 1 : 1, name };
  items.push(item);
  res.status(201).json(item);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
