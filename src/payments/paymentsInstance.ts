import { Payments, EnvironmentName } from "@nevermined-io/payments";
import { logger } from "../logger/logger";

export function initializePayments(
  nvmApiKey: string,
  environment: string
): Payments {
  logger.info("Initializing Nevermined Payments Library...");
  const payments = Payments.getInstance({
    nvmApiKey,
    environment: environment as EnvironmentName,
  });

  if (!payments.isLoggedIn) {
    throw new Error("Failed to login to Nevermined Payments Library");
  }

  return payments;
}
