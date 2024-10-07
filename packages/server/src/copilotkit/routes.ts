import {
  CopilotRuntime,
  GroqAdapter,
  copilotRuntimeNodeHttpEndpoint
} from '@copilotkit/runtime';
import { RequestHandler } from 'express-serve-static-core';
import { Groq } from "groq-sdk";
import {
  configDotenv
} from "dotenv"

configDotenv();


const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const serviceAdapter = new GroqAdapter({ groq, model: "<model-name>" });
 

export const copilot: RequestHandler = (req, res, next) => {
  const runtime = new CopilotRuntime();
  const handler = copilotRuntimeNodeHttpEndpoint({
    endpoint: '/copilotkit',
    runtime,
    serviceAdapter,
  });
  
  return handler(req as unknown as any, res, next);
}
