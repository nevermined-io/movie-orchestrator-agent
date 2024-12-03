import { logMessage } from "../utils/logMessage";
import {
  validateGenericTask,
  validateImageGenerationTask,
} from "./taskValidation";
import {
  SCRIPT_GENERATOR_DID,
  CHARACTER_EXTRACTOR_DID,
  THIS_PLAN_DID,
  IMAGE_GENERATOR_PLAN_DID,
  IMAGE_GENERATOR_DID,
} from "../config/env";
import { logger } from "../logger/logger";
import { ensureSufficientBalance } from "../payments/ensureBalance";
import { AgentExecutionStatus, generateStepId } from "@nevermined-io/payments";

/**
 * Processes steps received from the subscription.
 *
 * @param payments - Payments API instance.
 * @returns A function to handle incoming step data.
 */
export function processSteps(payments: any) {
  return async (data: any) => {
    const eventData = JSON.parse(data);
    logger.info(`Received event: ${JSON.stringify(eventData)}`);
    const step = await payments.query.getStep(eventData.step_id);

    logMessage(payments, {
      task_id: step.task_id,
      level: "info",
      message: `Processing Step ${step.step_id} [ ${step.step_status} ]: ${step.input_query}`,
    });

    if (step.step_status !== AgentExecutionStatus.Pending) {
      logger.warn(
        `${step.task_id} :: Step ${step.step_id} is not pending. Skipping...`
      );
      return;
    }

    switch (step.name) {
      case "init":
        await handleInitStep(step, payments);
        break;
      case "generateScript":
        await handleStepWithAgent(
          step,
          SCRIPT_GENERATOR_DID,
          "Script Generator",
          THIS_PLAN_DID,
          payments
        );
        break;
      case "extractCharacters":
        await handleStepWithAgent(
          step,
          CHARACTER_EXTRACTOR_DID,
          "Character Extractor",
          THIS_PLAN_DID,
          payments
        );
        break;
      case "generateImagesForCharacters":
        await handleImageGenerationForCharacters(step, payments);
        break;
      default:
        logger.warn(`Unrecognized step name: ${step.name}. Skipping...`);
        break;
    }
  };
}

/**
 * Handles the initialization step and creates subsequent steps.
 *
 * @param step - The current step being processed.
 * @param payments - Payments API instance.
 */
export async function handleInitStep(step: any, payments: any) {
  const scriptStepId = generateStepId();
  const characterStepId = generateStepId();
  const imageStepId = generateStepId();

  const steps = [
    {
      step_id: scriptStepId,
      task_id: step.task_id,
      predecessor: step.step_id,
      name: "generateScript",
      is_last: false,
    },
    {
      step_id: characterStepId,
      task_id: step.task_id,
      predecessor: scriptStepId,
      name: "extractCharacters",
      is_last: false,
    },
    {
      step_id: imageStepId,
      task_id: step.task_id,
      predecessor: characterStepId,
      name: "generateImagesForCharacters",
      is_last: true,
    },
  ];

  const createResult = await payments.query.createSteps(
    step.did,
    step.task_id,
    { steps }
  );

  logMessage(payments, {
    task_id: step.task_id,
    level: createResult.status === 201 ? "info" : "error",
    message:
      createResult.status === 201
        ? "Steps created successfully."
        : `Error creating steps: ${JSON.stringify(createResult.data)}`,
  });

  await payments.query.updateStep(step.did, {
    ...step,
    step_status: AgentExecutionStatus.Completed,
    output: step.input_query,
  });
}

/**
 * Handles a step by querying an agent.
 *
 * @param step - The current step being processed.
 * @param agentDid - The DID of the agent.
 * @param agentName - The name of the agent for logging.
 * @param planDid - The plan DID to check for sufficient balance.
 * @param payments - Payments API instance.
 */
export async function handleStepWithAgent(
  step: any,
  agentDid: string,
  agentName: string,
  planDid: string,
  payments: any
) {
  const hasBalance = await ensureSufficientBalance(planDid, step, payments);
  if (!hasBalance) return;

  const accessConfig = await payments.getServiceAccessConfig(agentDid);
  const taskData = {
    query: step.input_query,
    name: step.name,
    additional_params: [],
    artifacts: [],
  };

  const result = await payments.query.createTask(
    agentDid,
    taskData,
    accessConfig,
    async (data) => {
      const taskLog = JSON.parse(data);

      if (taskLog.task_status === "Completed") {
        await validateGenericTask(
          taskLog.task_id,
          agentDid,
          accessConfig,
          step,
          payments
        );
      } else {
        logMessage(payments, {
          task_id: step.task_id,
          level: "info",
          message: `LOG: ${taskLog.message}`,
        });
      }
    }
  );

  logMessage(payments, {
    task_id: step.task_id,
    level: result.status === 201 ? "info" : "error",
    message:
      result.status === 201
        ? `Task created successfully with ${agentName}.`
        : `Error querying ${agentName}: ${JSON.stringify(result.data)}`,
  });
}

/**
 * Handles image generation for multiple characters.
 * Ensures all tasks are tracked and marks the step as completed only after all tasks finish.
 *
 * @param step - The current step being processed.
 * @param planDid - The plan DID for checking balance.
 * @param payments - Payments API instance.
 */
export async function handleImageGenerationForCharacters(
  step: any,
  payments: any
) {
  const characters = step.input_artifacts
    ? JSON.parse(JSON.parse(step.input_artifacts))
    : [];

  const tasks: Promise<void>[] = []; // Array to track all task promises

  for (const character of characters) {
    const prompt = generateTextToImagePrompt(character);

    // Push each task validation promise to the tasks array
    tasks.push(
      queryAgentWithPrompt(
        step,
        prompt,
        "Image Generator",
        payments,
        validateImageGenerationTask
      )
    );
  }

  try {
    // Wait for all image generation tasks to complete
    const artifacts = await Promise.all(tasks);

    // Mark the step as completed only if all tasks are successful
    const result = await payments.query.updateStep(step.did, {
      ...step,
      step_status: "Completed",
      output:
        "Image generation tasks completed successfully for all characters.",
      output_artifacts: artifacts,
    });

    result.status === 201
      ? logMessage(payments, {
          task_id: step.task_id,
          level: "info",
          message: "Step marked as completed successfully.",
        })
      : logMessage(payments, {
          task_id: step.task_id,
          level: "error",
          message: `Error marking step as completed: ${JSON.stringify(
            result.data
          )}`,
        });
  } catch (error) {
    // Handle failures if any task fails
    await payments.query.updateStep(step.did, {
      ...step,
      step_status: "Failed",
      output: "One or more image generation tasks failed.",
    });

    logMessage(payments, {
      task_id: step.task_id,
      level: "error",
      message: `Error processing image generation tasks: ${error.message}`,
    });
  }
}

/**
 * Generates a text-to-image prompt from a character object.
 *
 * @param character - The character object.
 * @returns The generated prompt.
 */
export function generateTextToImagePrompt(character: any): string {
  return Object.entries(character)
    .map(([key, value]) => `${key}: ${value}`)
    .filter((entry) => entry !== "name")
    .join(", ")
    .replace(/,.*:/g, ",");
}

/**
 * Queries an agent using the Nevermined Payments API with a prompt.
 * Returns a classic promise that resolves or rejects based on task completion.
 *
 * @param step - The current step being processed.
 * @param prompt - The prompt to send to the agent.
 * @param agentName - The name of the agent for logging purposes.
 * @param payments - Payments API instance.
 * @param validateTaskFn - Callback function to validate task completion.
 * @returns A promise resolving when the task is fully validated.
 */
export async function queryAgentWithPrompt(
  step: any,
  prompt: string,
  agentName: string,
  payments: any,
  validateTaskFn: (
    taskId: string,
    accessConfig: any,
    parentStep: any,
    prompt: string,
    payments: any
  ) => Promise<void>
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const taskData = {
        query: prompt,
        name: step.name,
        additional_params: [],
        artifacts: [],
      };

      const hasBalance = await ensureSufficientBalance(
        IMAGE_GENERATOR_PLAN_DID,
        step,
        payments
      );
      if (!hasBalance) return;

      const accessConfig = await payments.getServiceAccessConfig(
        IMAGE_GENERATOR_DID
      );

      const result = await payments.query.createTask(
        IMAGE_GENERATOR_DID,
        taskData,
        accessConfig,
        async (data) => {
          try {
            const taskLog = JSON.parse(data);

            if (!taskLog.task_status || taskLog.task_status !== "Completed") {
              await logMessage(payments, {
                task_id: step.task_id,
                level: "info",
                message: `Intermediate log for ${agentName}: ${taskLog.message}`,
              });
              return;
            }

            // Validate the task and resolve the promise on success
            const artifacts = await validateTaskFn(
              taskLog.task_id,
              accessConfig,
              step,
              prompt,
              payments
            );
            resolve(artifacts); // Resolve the promise after successful validation
          } catch (error) {
            reject(
              new Error(
                `Error during validation for ${agentName}: ${error.message}`
              )
            );
          }
        }
      );

      if (result.status !== 201) {
        reject(
          new Error(
            `Error creating task for ${agentName}: ${JSON.stringify(
              result.data
            )}`
          )
        );
      }

      logMessage(payments, {
        task_id: step.task_id,
        level: "info",
        message: `Task created successfully for ${agentName}.`,
      });
    } catch (error) {
      reject(
        new Error(
          `Error in queryAgentWithPrompt for ${agentName}: ${error.message}`
        )
      );
    }
  });
}
