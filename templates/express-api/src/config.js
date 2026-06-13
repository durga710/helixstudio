// Centralized, env-driven config. Never hard-code secrets.
import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "*",
};
