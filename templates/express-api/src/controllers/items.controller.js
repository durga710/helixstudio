// Controllers — validate input, call the model, shape the response.
import * as Items from "../models/items.model.js";

export function listItems(_req, res) {
  res.json(Items.all());
}

export function createItem(req, res) {
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  res.status(201).json(Items.create(name));
}
