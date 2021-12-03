import { assertOk, Binary } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { Repository } from './repo';
import { getPresignedUrl } from './signer';
import { getBinaryStorage } from './storage';

export const binaryRouter = Router();

// Create a binary
binaryRouter.post('/', asyncWrap(async (req: Request, res: Response) => {
  const repo = res.locals.repo as Repository;
  const [outcome, resource] = await repo.createResource<Binary>({
    resourceType: 'Binary',
    contentType: req.get('Content-Type'),
    meta: {
      project: req.query['_project'] as string | undefined
    }
  });
  assertOk(outcome);
  await getBinaryStorage().writeBinary(resource as Binary, req);
  res.status(201).json({
    ...resource,
    url: getPresignedUrl(resource as Binary)
  });
}));

// Update a binary
binaryRouter.put('/:id', asyncWrap(async (req: Request, res: Response) => {
  const { id } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, resource] = await repo.updateResource<Binary>({
    resourceType: 'Binary',
    id,
    contentType: req.get('Content-Type')
  });
  assertOk(outcome);
  await getBinaryStorage().writeBinary(resource as Binary, req);
  res.status(200).json(resource);
}));

// Get binary content
binaryRouter.get('/:id', asyncWrap(async (req: Request, res: Response) => {
  const { id } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, resource] = await repo.readResource('Binary', id);
  assertOk(outcome);

  const binary = resource as Binary;
  res.status(200).contentType(binary.contentType as string);
  await getBinaryStorage().readBinary(binary, res);
}));
