import { logMessage } from "../utils/logMessage";
import { VIDEO_GENERATOR_DID } from "../config/env";
import { logger } from "../logger/logger";
import { AgentExecutionStatus } from "@nevermined-io/payments";

/**
 * Validates the completion status of a script generation task and updates the parent step accordingly.
 *
 * This function retrieves the task result from the agent, checks its completion status,
 * and updates the corresponding step with the output and artifacts generated by the task.
 *
 * @param taskId - The unique identifier of the task to validate.
 * @param agentDid - The DID of the agent that executed the task.
 * @param accessConfig - Access configuration required to query the agent's data.
 * @param parentStep - The parent step that initiated the task, which will be updated based on the task's result.
 * @param payments - The Payments API instance used for interacting with Nevermined.
 */
export async function validateScriptGenerationTask(
  taskId: string,
  agentDid: string,
  accessConfig: any,
  parentStep: any,
  payments: any
) {
  // Retrieve the task result and its related steps from the agent
  const taskResult = await payments.query.getTaskWithSteps(
    agentDid,
    taskId,
    accessConfig
  );

  // Extract task data from the response
  const taskData = taskResult.data;

  if (taskData.task.task_status !== AgentExecutionStatus.Completed) {
    return;
  }

  // Update the parent step with the task's output, artifacts, and status
  const result = await payments.query.updateStep(parentStep.did, {
    ...parentStep,
    step_status: AgentExecutionStatus.Completed,
    output: taskData.task.output || "Error during task execution.", // Default error message if output is unavailable
    output_artifacts: taskData.task.output_artifacts || [], // Include any artifacts generated by the task
  });

  logger.info("Updated step");

  // Log the outcome of the step update for monitoring and debugging
  logMessage(payments, {
    task_id: parentStep.task_id,
    level: result.status === 201 ? "info" : "error",
    message:
      result.status === 201
        ? `Step ${parentStep.step_id} updated successfully with subtask task ${taskId}.`
        : `Error updating step with task ${taskId}: ${JSON.stringify(
            result.data
          )}`,
  });
}

/**
 * Validates the completion of an image generation task and retrieves its artifacts.
 *
 * This function is tailored specifically for tasks related to image generation.
 * It queries the result of the task and extracts the generated artifacts (e.g., image URLs).
 *
 * @param taskId - The unique identifier of the image generation task.
 * @param accessConfig - Access configuration required to query the agent's data.
 * @param payments - The Payments API instance used for interacting with Nevermined.
 * @returns An array of output artifacts generated by the task, such as image URLs.
 */
export async function validateVideoGenerationTask(
  taskId: string,
  accessConfig: any,
  payments: any
): Promise<string> {
  logger.info(`Validating video generation task ${taskId}...`);

  // Retrieve the result of the video generation task from the agent
  const taskResult = await payments.query.getTaskWithSteps(
    VIDEO_GENERATOR_DID,
    taskId,
    accessConfig
  );

  logger.info(taskResult.data.task.output_artifacts);
  // Return the output artifacts from the task, typically an array of generated video URLs
  return taskResult.data.task.output_artifacts;
}
