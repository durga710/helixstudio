// HTMX items resource. The handlers render an HTML PARTIAL (not JSON), which
// HTMX swaps into the page — this is the pattern to copy for the user's feature.
import { Router } from "express";
import { listItems, createItem } from "../controllers/items.controller.js";

const router = Router();
router.get("/", listItems); // hx-get → render the list partial
router.post("/", createItem); // hx-post → add, then render the list partial

export default router;
