// Routes for the items resource → controller handlers.
import { Router } from "express";
import { listItems, createItem } from "../controllers/items.controller.js";

const router = Router();
router.get("/", listItems);
router.post("/", createItem);

export default router;
