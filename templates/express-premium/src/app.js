// The Express app: security + parsing middleware, EJS views, routes, errors.
// Kept separate from server.js so it's easy to import in tests.
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";

import { config } from "./config.js";
import routes from "./routes/index.js";
import { notFound, errorHandler } from "./middleware/error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // EJS server-rendered views (layout + partials live in ../views).
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));

  // helmet's strict CSP would block the Tailwind/HTMX/Alpine CDN scripts this
  // starter loads, so CSP is off here. Tighten it for production once you've
  // self-hosted your assets (keep the other helmet protections).
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true })); // HTMX posts form-encoded
  if (config.env !== "test") app.use(morgan("dev"));

  app.use(express.static(path.join(__dirname, "../public")));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/", routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
