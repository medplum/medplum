// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, created, forbidden, getReferenceString } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  AccessPolicy,
  Attachment,
  Binary,
  Bot,
  OperationDefinition,
  Project,
  ProjectMembership,
  Reference,
} from '@medplum/fhirtypes';
import { Readable } from 'node:stream';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { Repository, getGlobalSystemRepo } from '../../fhir/repo';
import { getBinaryStorage } from '../../storage/loader';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const botInitOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'bot-init',
  status: 'active',
  kind: 'operation',
  code: 'init',
  resource: ['Bot'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'name',
      type: 'string',
      min: 1,
      max: '1',
    },
    {
      use: 'in',
      name: 'description',
      type: 'string',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'accessPolicy',
      type: 'Reference',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'sourceCode',
      type: 'Attachment',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'executableCode',
      type: 'Attachment',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'return',
      type: 'Bot',
      min: 1,
      max: '1',
    },
  ],
};

export interface BotInitParameters {
  readonly name: string;
  readonly description?: string;
  readonly accessPolicy?: Reference<AccessPolicy>;
  readonly runtimeVersion?: 'awslambda' | 'vmcontext';
  readonly sourceCode?: Attachment;
  readonly executableCode?: Attachment;
}

const defaultBotCode = `import { BotEvent, MedplumClient } from '@medplum/core';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Your code here
}
`;

/**
 * Handles a request to create a new Bot.
 *
 * Endpoint - Bot resource type
 *   [fhir base]/Bot/$init
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function botInitHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();

  const membership = ctx.membership;
  if (!membership.admin) {
    return [forbidden];
  }

  const params = parseInputParameters<BotInitParameters>(botInitOperation, req);
  const bot = await createBot(ctx.repo, ctx.project, params);
  return [created, buildOutputParameters(botInitOperation, bot)];
}

export async function createBot(
  repo: Repository,
  project: WithId<Project>,
  params: BotInitParameters
): Promise<WithId<Bot>> {
  let sourceCode: Attachment | undefined;
  if (params.sourceCode) {
    sourceCode = await createCodeBinary(repo, params.sourceCode);
  } else {
    sourceCode = await createCodeBinary(repo, {
      contentType: ContentType.TYPESCRIPT,
      title: 'index.ts',
      data: Buffer.from(defaultBotCode).toString('base64'),
    });
  }

  let executableCode: Attachment | undefined;
  if (params.executableCode) {
    executableCode = await createCodeBinary(repo, params.executableCode);
  }

  const bot = await repo.createResource<Bot>({
    meta: {
      project: project.id,
    },
    resourceType: 'Bot',
    name: params.name,
    description: params.description,
    runtimeVersion: params.runtimeVersion ?? getConfig().defaultBotRuntimeVersion,
    sourceCode,
    executableCode,
  });

  const systemRepo = getGlobalSystemRepo();
  await systemRepo.createResource<ProjectMembership>({
    meta: {
      project: project.id,
    },
    resourceType: 'ProjectMembership',
    project: createReference(project),
    user: createReference(bot),
    profile: createReference(bot),
    accessPolicy: params.accessPolicy,
  });

  return bot;
}

async function createCodeBinary(repo: Repository, attachment: Attachment): Promise<Attachment> {
  const url = attachment.url;
  if (url) {
    if (url.startsWith('Binary/')) {
      // This is a reference to an existing Binary resource, so we can just return the attachment as-is
      return attachment;
    }

    throw new Error('Invalid attachment: URL must start with Binary/');
  }

  const data = attachment.data;
  if (!data) {
    throw new Error('Invalid attachment: Missing data or url');
  }

  const code = Buffer.from(data, 'base64').toString('utf8');
  const contentType = attachment.contentType ?? ContentType.JAVASCRIPT;
  const filename = attachment.title ?? 'index.js';

  const binary = await repo.createResource<Binary>({
    resourceType: 'Binary',
    contentType,
  });
  await getBinaryStorage().writeBinary(binary, filename, contentType, Readable.from(code));
  return {
    contentType,
    title: filename,
    url: getReferenceString(binary),
  };
}
