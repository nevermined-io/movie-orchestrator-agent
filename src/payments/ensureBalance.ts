import { logMessage } from "../utils/logMessage";
import { logger } from "../logger/logger";

/**
 * Ensures that a payment plan has sufficient balance to execute tasks.
 * If the balance is insufficient, it attempts to order more credits for the plan.
 *
 * @param planDid - The DID of the payment plan to check.
 * @param step - The current step being processed, used for logging and step updates.
 * @param payments - The Payments API instance used to interact with the payment plan.
 * @returns A boolean indicating whether the balance is sufficient after the check.
 */
export async function ensureSufficientBalance(
  planDid: string,
  step: any,
  payments: any,
  balance: number = 1
): Promise<boolean> {
  // Retrieve the current balance of the specified plan

  logger.info(`Checking balance for plan ${planDid}...`);
  const balanceResult = await payments.getPlanBalance(planDid);

  if (balanceResult.balance < balance) {
    logger.warn(
      `Insufficient balance for plan ${planDid}. Ordering more credits...`
    );
    // Attempt to order more credits for the plan
    const orderResult = await payments.orderPlan(planDid);

    if (!orderResult.success) {
      logger.error(
        `Failed to order credits for plan ${planDid}. Insufficient balance.`
      );
      await logMessage(payments, {
        task_id: step.task_id,
        level: "error",
        message: `Failed to order credits for plan ${planDid}.`,
      });

      logger.info(`Updating step status to 'Failed'...`);
      await payments.query.updateStep(step.did, {
        ...step,
        step_status: "Failed",
        output: "Insufficient balance and failed to order credits.",
      });

      return false;
    }
  }
  logger.info(`Balance check for plan ${planDid} successful.`);
  return true;
}
