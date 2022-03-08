import { assertOk, createReference } from '@medplum/core';
import { Bot, Project } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import vm from 'vm';
import { asyncWrap } from '../../async';
import { logger } from '../../logger';
import { MockConsole } from '../../util/console';
import { Repository, systemRepo } from '../repo';

export const EXECUTE_CONTENT_TYPES = [
  'application/json',
  'application/fhir+json',
  'text/plain',
  'x-application/hl7-v2+er7',
];

/**
 * Handles HTTP requests for the execute operation.
 * First reads the bot and makes sure it is valid and the user has access to it.
 * Then executes the bot.
 * Returns the outcome of the bot execution.
 * Assumes that input content-type is output content-type.
 */
export const executeHandler = asyncWrap(async (req: Request, res: Response) => {
  const { id } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, bot] = await repo.readResource<Bot>('Bot', id);
  assertOk(outcome, bot);

  const context = {
    input: req.body,
    console: new MockConsole(),
    fetch,
    repo,
  };

  try {
    const result = await executeBot(bot, context);
    res.status(200).type(getResponseContentType(req)).send(result);
  } catch (err) {
    res.status(400).send(err);
  }
});

/**
 * Executes a Bot in a VM sandbox.
 * @param bot The bot resource.
 * @param context The global variables to expose in the VM sandbox.
 * @returns
 */
export async function executeBot(bot: Bot, context: any): Promise<any> {
  const code = bot.code;
  if (!code) {
    logger.info('Ignore bots with no code');
    return undefined;
  }

  if (!(await isBotEnabled(bot))) {
    logger.info('Ignore bots if not enabled');
    return undefined;
  }

  const sandbox = {
    ...context,
    assertOk,
    createReference,
  };

  const options: vm.RunningScriptOptions = {
    timeout: 100,
  };

  // Wrap code in an async block for top-level await support
  const wrappedCode = '(async () => {' + code + '})();';

  // Return the result of the code execution
  return (await vm.runInNewContext(wrappedCode, sandbox, options)) as any;
}

async function isBotEnabled(bot: Bot): Promise<boolean> {
  const [projectOutcome, project] = await systemRepo.readResource<Project>('Project', bot.meta?.project as string);
  assertOk(projectOutcome, project);
  return !!project.features?.includes('bots');
}

function getResponseContentType(req: Request): string {
  const requestContentType = req.get('Content-Type');
  if (requestContentType && EXECUTE_CONTENT_TYPES.includes(requestContentType)) {
    return requestContentType;
  }

  // Default to FHIR
  return 'application/fhir+json';
}
