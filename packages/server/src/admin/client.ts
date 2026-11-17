// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, forbidden, OperationOutcomeError, singularize } from '@medplum/core';
import type { AccessPolicy, ClientApplication, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getAuthenticatedContext } from '../context';
import { getDefaultAccessPolicy } from '../fhir/default-access-policies';
import type { Repository } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { makeValidationMiddleware } from '../util/validator';

export const createClientValidator = makeValidationMiddleware([
  body('name').notEmpty().withMessage('Client name is required'),
]);

export async function createClientHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const projectId = singularize(req.params.projectId) as string;
  if (!ctx.project.superAdmin && projectId !== ctx.project.id) {
    throw new OperationOutcomeError(forbidden);
  }
  const project =
    projectId === ctx.project.id ? ctx.project : await ctx.repo.readResource<Project>('Project', projectId);
  const client = await createClient(ctx.repo, {
    ...req.body,
    project,
  });

  res.status(201).json(client);
}

export interface CreateClientRequest extends Partial<ClientApplication> {
  readonly project: Project;
  readonly accessPolicy?: Reference<AccessPolicy>;
}

export async function createClient(repo: Repository, request: CreateClientRequest): Promise<WithId<ClientApplication>> {
  const { project, accessPolicy, meta, ...rest } = request;

  const systemRepo = repo.getSystemRepo();
  const client = await systemRepo.createResource<ClientApplication>({
    ...rest,
    meta: {
      ...meta,
      project: project.id,
      author: repo.getConfig().author,
    },
    resourceType: 'ClientApplication',
    secret: rest.secret ?? generateSecret(32),
  });

  await systemRepo.createResource<ProjectMembership>({
    meta: {
      project: project.id,
    },
    resourceType: 'ProjectMembership',
    project: createReference(project),
    user: createReference(client),
    profile: createReference(client),
    accessPolicy: accessPolicy ?? getDefaultAccessPolicy(project, 'ClientApplication'),
  });

  return client;
}
