import { initializePayments } from "./payments/paymentsInstance";
import { processSteps } from "./steps/stepHandlers";
import { NVM_API_KEY, NVM_ENVIRONMENT, AGENT_DID } from "./config/env";
import { logger } from "./logger/logger";

/**
 * Main entry point for the Orchestrator Agent.
 *
 * This script initializes the connection to the Nevermined Payments API,
 * subscribes to relevant events, and starts listening for workflow tasks.
 *
 * Key operations:
 * - Initialize the Payments client using environment configurations.
 * - Subscribe to "step-updated" events to monitor workflow steps.
 * - Start the orchestrator to process incoming tasks.
 */
async function main() {
  try {
    const payments = initializePayments(NVM_API_KEY, NVM_ENVIRONMENT);

    logger.info(`Connected to Nevermined Network: ${NVM_ENVIRONMENT}`);

    /**
     * Subscribe to "step-updated" events.
     *
     * The `processSteps` function acts as the event handler and processes
     * incoming workflow steps. Key subscription options:
     * - `joinAccountRoom`: Set to `false` since we're interested in agent-specific tasks.
     * - `joinAgentRooms`: List of agent DIDs to subscribe to (in this case, `AGENT_DID`).
     * - `subscribeEventTypes`: Specifies the type of events to listen for ("step-updated").
     * - `getPendingEventsOnSubscribe`: Set to `false` to only receive new events.
     */
    await payments.query.subscribe(processSteps(payments), {
      joinAccountRoom: false,
      joinAgentRooms: [AGENT_DID],
      subscribeEventTypes: ["step-updated"],
      getPendingEventsOnSubscribe: false,
    });

    logger.info("Orchestrator is running and listening for events.");
  } catch (error) {
    logger.error(`Error initializing orchestrator: ${error.message}`);

    process.exit(1);
  }
}

main();
