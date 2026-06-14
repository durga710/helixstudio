// Page controllers — render the EJS views. `appName` flows into every view.
import { config } from "../config.js";
import * as Items from "../models/items.model.js";

const base = { appName: config.appName };

export function landing(_req, res) {
  res.render("landing", { ...base, page: "landing" });
}

export function login(_req, res) {
  res.render("login", { ...base, page: "login" });
}

export function dashboard(_req, res) {
  res.render("dashboard", { ...base, page: "dashboard", items: Items.all() });
}

export function settings(_req, res) {
  res.render("settings", { ...base, page: "settings" });
}
