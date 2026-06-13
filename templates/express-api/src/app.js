// The Express app: security + parsing middleware, routes, error handler.
// Kept separate from server.js so it's easy to import in tests.
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";

import { config } from "./config.js";
import routes from "./routes/index.js";
import { notFound, errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();

  app.use(helmet()); // secure HTTP headers
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  if (config.env !== "test") app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api", routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
