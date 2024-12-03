import { initializePayments } from "./payments/paymentsInstance";
import { processSteps } from "./steps/stepHandlers";
import { NVM_API_KEY, NVM_ENVIRONMENT, THIS_AGENT_DID } from "./config/env";
import { logger } from "./logger/logger";

async function main() {
  try {
    const payments = initializePayments(NVM_API_KEY, NVM_ENVIRONMENT);
    logger.info(`Connected to Nevermined Network: ${NVM_ENVIRONMENT}`);

    await payments.query.subscribe(processSteps(payments), {
      joinAccountRoom: false,
      joinAgentRooms: [THIS_AGENT_DID],
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
