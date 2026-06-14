// Mounts page routes (server-rendered) + the HTMX items routes.
import { Router } from "express";
import pagesRoutes from "./pages.routes.js";
import itemsRoutes from "./items.routes.js";

const router = Router();
router.use("/", pagesRoutes);
router.use("/items", itemsRoutes);

export default router;
