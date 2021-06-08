import { Binary } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { asyncWrap } from '../async';
import { notFound } from './outcomes';
import { repo } from './repo';

export const binaryRouter = Router();

// Create a binary
binaryRouter.post('/', asyncWrap(async (req: Request, res: Response) => {
  const [outcome, resource] = await repo.createResource<Binary>({
    resourceType: 'Binary',
    contentType: req.get('Content-Type')
  });
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  mkdirSync(getDir(resource as Binary));
  writeFileSync(getPath(resource as Binary), req.body, { encoding: 'binary' });
  res.status(201).send(resource);
}));

// Get binary content
binaryRouter.get('/:id', asyncWrap(async (req: Request, res: Response) => {
  const { id } = req.params;
  const [outcome, resource] = await repo.readResource('Binary', id);
  if (outcome.id === 'not-found') {
    return res.status(404).send(notFound);
  }
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }

  const binary = resource as Binary;
  res.status(200)
    .contentType(binary.contentType as string)
    .sendFile(getPath(binary));
}));

function getDir(binary: Binary): string {
  return path.resolve(__dirname, `../../binary/${binary.id}/`);
}

function getPath(binary: Binary): string {
  return path.resolve(__dirname, `../../binary/${binary.id}/${binary.meta?.versionId}`);
}
