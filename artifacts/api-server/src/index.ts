import app from "./app";
import { logger } from "./lib/logger";
import { startOverdueScheduler } from "./lib/overdue-scheduler";
import { startAutoCheckoutScheduler } from "./lib/auto-checkout";
import { loadPublicOrigin } from "./lib/public-origin";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startOverdueScheduler();
  startAutoCheckoutScheduler();
  void loadPublicOrigin();
});
