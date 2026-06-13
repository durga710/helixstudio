// Mounts feature routers under /api.
import { Router } from "express";
import itemsRoutes from "./items.routes.js";

const router = Router();
router.use("/items", itemsRoutes);

export default router;
