import { logMessage } from "../utils/logMessage";
import {
  validateScriptGenerationTask,
  validateVideoGenerationTask,
} from "./taskValidation";
import {
  SCRIPT_GENERATOR_DID,
  PLAN_DID,
  VIDEO_GENERATOR_PLAN_DID,
  VIDEO_GENERATOR_DID,
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
        await handleScriptGeneration(step, payments);
        break;
      case "generateVideoForCharacters":
        await handleVideoGenerationForCharacters(step, payments);
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
  const videoStepId = generateStepId();

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
      step_id: videoStepId,
      task_id: step.task_id,
      predecessor: scriptStepId,
      name: "generateVideoForCharacters",
      is_last: true,
    },
  ];

  logger.info(`Creating steps: ${JSON.stringify(steps)}`);

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
 * @param payments - Payments API instance.
 */
export async function handleScriptGeneration(step: any, payments: any) {
  // Check if the plan has sufficient balance and attempt to replenish if needed
  const hasBalance = await ensureSufficientBalance(PLAN_DID, step, payments);
  if (!hasBalance) return;

  // Retrieve access permissions for the agent
  const accessConfig = await payments.query.getServiceAccessConfig(
    SCRIPT_GENERATOR_DID
  );

  // Define the data payload for the task
  const taskData = {
    query: step.input_query,
    name: step.name,
    additional_params: [],
    artifacts: [],
  };

  logger.info(
    `Creating task for Script Generator Agent... and data: ${JSON.stringify(
      taskData
    )}`
  );

  // Create a task and validate its completion through a callback
  const result = await payments.query.createTask(
    SCRIPT_GENERATOR_DID,
    taskData,
    accessConfig,
    async (data) => {
      const taskLog = JSON.parse(data);

      // Validate the task upon successful completion
      await validateScriptGenerationTask(
        taskLog.task_id,
        SCRIPT_GENERATOR_DID,
        accessConfig,
        step,
        payments
      );
    }
  );

  logMessage(payments, {
    task_id: step.task_id,
    level: result.status === 201 ? "info" : "error",
    message:
      result.status === 201
        ? `Task ${result.data.task.task_id} created successfully for Script Generator Agent.`
        : `Error querying Script Generator Agent: ${JSON.stringify(
            result.data
          )}`,
  });
}

/**
 * Handles video generation for multiple characters.
 * Creates tasks for each character and ensures the step is marked as completed
 * only when all tasks are successfully validated.
 *
 * @param step - The current step being processed.
 * @param payments - Payments API instance.
 */
export async function handleVideoGenerationForCharacters(
  step: any,
  payments: any
) {
  let characters = step.input_artifacts
    ? JSON.parse(JSON.parse(step.input_artifacts))
    : [];

  characters = JSON.parse(characters[0]);

  // Track all task promises for parallel execution
  const tasks: Promise<any[]>[] = [];

  const hasBalance = await ensureSufficientBalance(
    VIDEO_GENERATOR_PLAN_DID,
    step,
    payments,
    characters.length
  );
  if (!hasBalance) return;

  for (const character of characters["prompts"]) {
    // Add each task to the promises array
    tasks.push(
      queryAgentWithPrompt(
        step,
        character,
        payments,
        validateVideoGenerationTask
      )
    );
  }

  try {
    // Wait for all tasks to complete
    const artifacts = await Promise.all(tasks);

    // Update the step as completed upon successful task execution
    const result = await payments.query.updateStep(step.did, {
      ...step,
      step_status: AgentExecutionStatus.Completed,
      output: step.input_query,
      output_artifacts: { ...characters, artifacts },
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
      output: "One or more video generation tasks failed.",
    });

    logMessage(payments, {
      task_id: step.task_id,
      level: "error",
      message: `Error processing video generation tasks: ${error.message}`,
    });
  }
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
  payments: any,
  validateTaskFn: (
    taskId: string,
    accessConfig: any,
    payments: any
  ) => Promise<string>
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

      logger.info(
        `Getting service access config for video generation agent: ${VIDEO_GENERATOR_DID}`
      );

      // Step 1: Retrieve access permissions for the agent
      const accessConfig = await payments.query.getServiceAccessConfig(
        VIDEO_GENERATOR_DID
      );

      logger.info(`Creating task for video generation agent`);

      // Step 2: Create a task for the agent
      const result = await payments.query.createTask(
        VIDEO_GENERATOR_DID, // The agent DID
        taskData, // Task data to send to the agent
        accessConfig, // Access permissions
        async (data) => {
          // Step 3: Handle the task's progress or completion through the callback
          try {
            const taskLog = JSON.parse(data); // Parse the task log from the agent

            // Check if the task is still in progress or completed
            if (
              !taskLog.task_status ||
              taskLog.task_status !== AgentExecutionStatus.Completed
            ) {
              return; // Exit the callback if the task is not yet completed. Another callback will be triggered later.
            }

            // Step 4: Task is completed, validate it using the provided validation function
            const artifacts = await validateTaskFn(
              taskLog.task_id, // Task ID from the agent
              accessConfig, // Access permissions for validation
              payments // Payments API instance
            );

            resolve(JSON.parse(artifacts)[0]);
          } catch (error) {
            reject(
              new Error(
                `Error during validation for video generation agent: ${error.message}`
              )
            );
          }
        }
      );

      // Step 5: Handle task creation errors
      if (result.status !== 201) {
        return reject(
          new Error(
            `Error creating task for video generation agent: ${JSON.stringify(
              result.data
            )}`
          )
        );
      }

      logMessage(payments, {
        task_id: step.task_id,
        level: "info",
        message: `Task  ${result.data.task.task_id} created successfully for video generation agent.`,
      });
    } catch (error) {
      // Handle unexpected errors during task creation or setup
      reject(
        new Error(
          `Error in queryAgentWithPrompt for video generation agent: ${error.message}`
        )
      );
    }
  });
}
