import dotenv from "dotenv";

dotenv.config();

export const NVM_API_KEY = process.env.NVM_API_KEY!;
export const NVM_ENVIRONMENT = process.env.NVM_ENVIRONMENT || "testing";
export const THIS_PLAN_DID = process.env.THIS_PLAN_DID!;
export const IMAGE_GENERATOR_PLAN_DID = process.env.IMAGE_GENERATOR_PLAN_DID!;
export const THIS_AGENT_DID = process.env.THIS_AGENT_DID!;
export const SCRIPT_GENERATOR_DID = process.env.SCRIPT_GENERATOR_DID!;
export const CHARACTER_EXTRACTOR_DID = process.env.CHARACTER_EXTRACTOR_DID!;
export const IMAGE_GENERATOR_DID = process.env.IMAGE_GENERATOR_DID!;
