import { logger } from "../logger/logger";
import { TaskLogMessage } from "@nevermined-io/payments";

export async function logMessage(payments, logMessage: TaskLogMessage) {
  const message = `${logMessage.task_id} :: ${logMessage.message}`;
  if (logMessage.level === "error") logger.error(message);
  else if (logMessage.level === "warning") logger.warn(message);
  else if (logMessage.level === "debug") logger.debug(message);
  else logger.info(message);
  payments.query.logTask(logMessage);
}
