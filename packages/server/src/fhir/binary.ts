import { Request, Response, Router } from 'express';
import { Binary } from '@medplum/core';
import { notFound } from './outcomes';
import { repo } from './repo';

export const binaryRouter = Router();

binaryRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [outcome, resource] = await repo.readResource('Binary', id);
  if (outcome.id === 'not-found') {
    return res.status(404).send(outcome);
  }
  if (outcome.id !== 'allok') {
    return res.status(400).send(notFound);
  }

  const binary = resource as Binary;
  res.status(200)
    .contentType(binary.contentType as string)
    .sendFile(`C:/Users/cody/dev/medplum/medplum-server/binary/${binary.id}/${binary.meta?.versionId}`);
});
