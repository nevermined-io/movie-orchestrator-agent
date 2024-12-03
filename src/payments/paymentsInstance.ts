import { Payments, EnvironmentName } from "@nevermined-io/payments";
import { logger } from "../logger/logger";

/**
 * Initializes the Nevermined Payments Library.
 *
 * This function sets up the Payments instance, which acts as the primary interface
 * for interacting with the Nevermined Payments API. It ensures authentication
 * and provides methods to manage plans, tasks, and agent interactions.
 *
 * @param nvmApiKey - The API key required for authentication with Nevermined.
 * @param environment - The environment to connect to (e.g., `testing`, `staging`, `production`).
 * @returns An authenticated Payments instance.
 * @throws Will throw an error if the Payments instance fails to log in.
 */
export function initializePayments(
  nvmApiKey: string,
  environment: string
): Payments {
  logger.info("Initializing Nevermined Payments Library...");

  const payments = Payments.getInstance({
    nvmApiKey,
    environment: environment as EnvironmentName, // Explicitly cast environment to the required type
  });

  if (!payments.isLoggedIn) {
    throw new Error("Failed to login to Nevermined Payments Library");
  }

  return payments;
}
