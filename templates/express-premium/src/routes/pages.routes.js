// Server-rendered pages. Add a page by copying a line here + a view in views/
// and a sidebar link in views/partials/sidebar.ejs.
import { Router } from "express";
import { landing, login, dashboard, settings } from "../controllers/pages.controller.js";

const router = Router();
router.get("/", landing);
router.get("/login", login);
router.get("/dashboard", dashboard);
router.get("/settings", settings);

export default router;
