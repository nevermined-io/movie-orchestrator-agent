import { logMessage } from "../utils/logMessage";

export async function ensureSufficientBalance(
  planDid: string,
  step: any,
  payments: any
): Promise<boolean> {
  const balanceResult = await payments.getPlanBalance(planDid);

  if (balanceResult.balance < 1) {
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
