// Items controller — renders the list PARTIAL for HTMX to swap in.
import * as Items from "../models/items.model.js";

export function listItems(_req, res) {
  res.render("partials/items-list", { items: Items.all() });
}

export function createItem(req, res) {
  const name = (req.body?.name ?? "").trim();
  if (name) Items.create(name);
  // Re-render the whole list so HTMX swaps in the updated partial.
  res.render("partials/items-list", { items: Items.all() });
}
