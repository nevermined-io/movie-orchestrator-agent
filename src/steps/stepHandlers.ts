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
 * Processes incoming steps received from the subscription.
 * Steps are processed based on their name, and the relevant handler is invoked.
 *
 * @param payments - Payments API instance used for querying and updating steps.
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

    // Ensure that only pending steps are processed
    if (step.step_status !== AgentExecutionStatus.Pending) {
      logger.warn(
        `${step.task_id} :: Step ${step.step_id} is not pending. Skipping...`
      );
      return;
    }

    // Route step to the appropriate handler based on its name
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
 * Handles the initialization step by creating subsequent steps in the workflow.
 * These steps are linked in a sequential order through their predecessor IDs.
 *
 * @param step - The current step being processed.
 * @param payments - Payments API instance.
 */
export async function handleInitStep(step: any, payments: any) {
  // Generate unique IDs for the subsequent steps
  const scriptStepId = generateStepId();
  const characterStepId = generateStepId();
  const imageStepId = generateStepId();

  // Define the steps with their predecessors to enforce order
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

  // Create the steps in the Nevermined network
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

  // Mark the initialization step as completed
  await payments.query.updateStep(step.did, {
    ...step,
    step_status: AgentExecutionStatus.Completed,
    output: step.input_query,
  });
}

/**
 * Handles a step by querying a sub-agent for task execution.
 * Ensures sufficient balance in the plan and validates task completion.
 *
 * @param step - The current step being processed.
 * @param agentDid - The DID of the sub-agent responsible for the task.
 * @param agentName - A friendly name for the sub-agent for logging purposes.
 * @param planDid - The DID of the plan associated with the agent.
 * @param payments - Payments API instance.
 */
export async function handleStepWithAgent(
  step: any,
  agentDid: string,
  agentName: string,
  planDid: string,
  payments: any
) {
  // Check if the plan has sufficient balance and attempt to replenish if needed
  const hasBalance = await ensureSufficientBalance(planDid, step, payments);
  if (!hasBalance) return;

  // Retrieve access permissions for the agent
  const accessConfig = await payments.getServiceAccessConfig(agentDid);

  // Define the data payload for the task
  const taskData = {
    query: step.input_query,
    name: step.name,
    additional_params: [],
    artifacts: [],
  };

  // Create a task and validate its completion through a callback
  const result = await payments.query.createTask(
    agentDid,
    taskData,
    accessConfig,
    async (data) => {
      const taskLog = JSON.parse(data);

      if (taskLog.task_status === "Completed") {
        // Validate the task upon successful completion
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
 * Creates tasks for each character and ensures the step is marked as completed
 * only when all tasks are successfully validated.
 *
 * @param step - The current step being processed.
 * @param payments - Payments API instance.
 */
export async function handleImageGenerationForCharacters(
  step: any,
  payments: any
) {
  const characters = step.input_artifacts
    ? JSON.parse(JSON.parse(step.input_artifacts))
    : [];

  // Track all task promises for parallel execution
  const tasks: Promise<any[]>[] = [];

  for (const character of characters) {
    const prompt = generateTextToImagePrompt(character);

    // Add each task to the promises array
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
    // Wait for all tasks to complete
    const artifacts = await Promise.all(tasks);

    // Update the step as completed upon successful task execution
    const result = await payments.query.updateStep(step.did, {
      ...step,
      step_status: "Completed",
      output:
        "Image generation tasks completed successfully for all characters.",
      output_artifacts: artifacts,
    });

    logMessage(payments, {
      task_id: step.task_id,
      level: result.status === 201 ? "info" : "error",
      message:
        result.status === 201
          ? "Step marked as completed successfully."
          : `Error marking step as completed: ${JSON.stringify(result.data)}`,
    });
  } catch (error) {
    // Handle step failure if any task fails
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
 * Generates a prompt string for a text-to-image model from a character object.
 *
 * @param character - The character object containing attributes for the prompt.
 * @returns The generated prompt string.
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
 * The function ensures sufficient balance, retrieves access permissions,
 * creates a task for the agent, and validates the task completion using a callback.
 * It resolves or rejects a promise based on the task's completion status.
 *
 * @param step - The current step being processed.
 * @param prompt - The input prompt sent to the agent.
 * @param agentName - The name of the agent, used for logging purposes.
 * @param payments - The Nevermined Payments API instance.
 * @param validateTaskFn - A callback function to validate the task's completion.
 *                          This function handles task-specific validations and updates the step.
 * @returns A promise that resolves when the task is validated successfully,
 *          or rejects if an error occurs during task creation or validation.
 */
export async function queryAgentWithPrompt(
  step: any,
  prompt: string,
  agentName: string,
  payments: any,
  validateTaskFn: (
    taskId: string,
    accessConfig: any,
    payments: any
  ) => Promise<any[]>
): Promise<any[]> {
  return new Promise(async (resolve, reject) => {
    try {
      // Prepare the data payload for the task to be created
      const taskData = {
        query: prompt, // The main input for the agent's task
        name: step.name, // The step name associated with the task
        additional_params: [], // Any additional parameters required by the task
        artifacts: [], // Placeholder for input artifacts, if any
      };

      // Step 1: Ensure the plan has sufficient balance
      const hasBalance = await ensureSufficientBalance(
        IMAGE_GENERATOR_PLAN_DID,
        step,
        payments
      );
      if (!hasBalance) {
        // If balance is insufficient, resolve gracefully without proceeding
        return resolve([]);
      }

      // Step 2: Retrieve access permissions for the agent
      const accessConfig = await payments.getServiceAccessConfig(
        IMAGE_GENERATOR_DID
      );

      // Step 3: Create a task for the agent
      const result = await payments.query.createTask(
        IMAGE_GENERATOR_DID, // The agent DID
        taskData, // Task data to send to the agent
        accessConfig, // Access permissions
        async (data) => {
          // Step 4: Handle the task's progress or completion through the callback

          try {
            const taskLog = JSON.parse(data); // Parse the task log from the agent

            // Check if the task is still in progress or completed
            if (!taskLog.task_status || taskLog.task_status !== "Completed") {
              await logMessage(payments, {
                task_id: step.task_id,
                level: "info",
                message: `Intermediate log for ${agentName}: ${taskLog.message}`,
              });
              return; // Exit the callback if the task is not yet completed. Another callback will be triggered later.
            }

            // Step 5: Task is completed, validate it using the provided validation function
            const artifacts = await validateTaskFn(
              taskLog.task_id, // Task ID from the agent
              accessConfig, // Access permissions for validation
              payments // Payments API instance
            );

            resolve(artifacts);
          } catch (error) {
            reject(
              new Error(
                `Error during validation for ${agentName}: ${error.message}`
              )
            );
          }
        }
      );

      // Step 6: Handle task creation errors
      if (result.status !== 201) {
        return reject(
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
      // Handle unexpected errors during task creation or setup
      reject(
        new Error(
          `Error in queryAgentWithPrompt for ${agentName}: ${error.message}`
        )
      );
    }
  });
}
