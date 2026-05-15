// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, singularize } from '@medplum/core';
import type { AccessPolicy, ClientApplication, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getAuthenticatedContext } from '../context';
import type { Repository } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { makeValidationMiddleware } from '../util/validator';

export const createClientValidator = makeValidationMiddleware([
  body('name').notEmpty().withMessage('Client name is required'),
]);

export async function createClientHandler(req: Request, res: Response): Promise<void> {
  let project: Project;
  const { project: localsProject, repo } = getAuthenticatedContext();
  if (localsProject.superAdmin) {
    project = { resourceType: 'Project', id: singularize(req.params.projectId) };
  } else {
    project = localsProject;
  }

  const client = await createClient(repo, {
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
  const { project, accessPolicy, ...rest } = request;

  const systemRepo = repo.getSystemRepo();
  const client = await systemRepo.createResource<ClientApplication>({
    meta: {
      project: project.id,
      author: repo.getConfig().author,
    },
    resourceType: 'ClientApplication',
    secret: generateSecret(32),
    ...rest,
  });

  await systemRepo.createResource<ProjectMembership>({
    meta: {
      project: project.id,
    },
    resourceType: 'ProjectMembership',
    project: createReference(project),
    user: createReference(client),
    profile: createReference(client),
    accessPolicy: accessPolicy,
  });

  return client;
}
