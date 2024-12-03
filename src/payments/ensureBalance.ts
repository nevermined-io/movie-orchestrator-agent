import { logMessage } from "../utils/logMessage";

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
  payments: any
): Promise<boolean> {
  // Retrieve the current balance of the specified plan
  const balanceResult = await payments.getPlanBalance(planDid);

  if (balanceResult.balance < 1) {
    // Attempt to order more credits for the plan
    const orderResult = await payments.orderPlan(planDid);

    if (!orderResult.success) {
      await logMessage(payments, {
        task_id: step.task_id,
        level: "error",
        message: `Failed to order credits for plan ${planDid}.`,
      });

      await payments.query.updateStep(step.did, {
        ...step,
        step_status: "Failed",
        output: "Insufficient balance and failed to order credits.",
      });

      return false;
    }
  }

  return true;
}
