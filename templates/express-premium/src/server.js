// Entry point — boot the HTTP server.
import { createApp } from "./app.js";
import { config } from "./config.js";

createApp().listen(config.port, () => {
  console.log(`App listening on http://localhost:${config.port} (${config.env})`);
});
