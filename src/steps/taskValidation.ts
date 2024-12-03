import { logMessage } from "../utils/logMessage";
import { IMAGE_GENERATOR_DID } from "../config/env";

/**
 * Validates a generic task's completion and updates the parent step.
 *
 * @param taskId - The ID of the task to validate.
 * @param agentDid - The DID of the agent handling the task.
 * @param accessConfig - Access configuration for the agent.
 * @param parentStep - The parent step associated with the task.
 * @param payments - Payments API instance.
 */
export async function validateGenericTask(
  taskId: string,
  agentDid: string,
  accessConfig: any,
  parentStep: any,
  payments: any
) {
  const taskResult = await payments.query.getTaskWithSteps(
    agentDid,
    taskId,
    accessConfig
  );

  const taskData = taskResult.data;

  const status =
    taskData.task.task_status === "Completed" ? "Completed" : "Failed";

  const result = await payments.query.updateStep(parentStep.did, {
    ...parentStep,
    step_status: status,
    output: taskData.task.output || "Error during task execution.",
    output_artifacts: taskData.task.output_artifacts || [],
  });

  logMessage(payments, {
    task_id: parentStep.task_id,
    level: result.status === 201 ? "info" : "error",
    message:
      result.status === 201
        ? `Step updated successfully with task ${taskId}.`
        : `Error updating step with task ${taskId}: ${JSON.stringify(
            result.data
          )}`,
  });
}

/**
 * Validates the completion of an image generation task and updates the parent step.
 *
 * @param taskId - The ID of the image generation task to validate.
 * @param accessConfig - Access configuration for the agent.
 * @param parentStep - The parent step associated with the task.
 * @param prompt - The prompt used for generating the image.
 * @param payments - Payments API instance.
 */
export async function validateImageGenerationTask(
  taskId: string,
  accessConfig: any,
  payments: any
) {
  const taskResult = await payments.query.getTaskWithSteps(
    IMAGE_GENERATOR_DID,
    taskId,
    accessConfig
  );

  return taskResult.data.task.output_artifacts;
}
