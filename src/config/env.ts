import dotenv from "dotenv";

dotenv.config();

export const NVM_API_KEY = process.env.NVM_API_KEY!;
export const NVM_ENVIRONMENT = process.env.NVM_ENVIRONMENT || "testing";
export const PLAN_DID = process.env.PLAN_DID!;
export const VIDEO_GENERATOR_PLAN_DID = process.env.VIDEO_GENERATOR_PLAN_DID!;
export const AGENT_DID = process.env.AGENT_DID!;
export const SCRIPT_GENERATOR_DID = process.env.SCRIPT_GENERATOR_DID!;
export const VIDEO_GENERATOR_DID = process.env.VIDEO_GENERATOR_DID!;
