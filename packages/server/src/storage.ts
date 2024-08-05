import { Binary } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from './async';
import { getSystemRepo } from './fhir/repo';
import { getBinaryStorage } from './fhir/storage';

export const storageRouter = Router();

// This endpoint emulates CloudFront storage for localhost development.
// It is not intended for production use.
storageRouter.get(
  '/:id/:versionId?',
  asyncWrap(async (req: Request, res: Response) => {
    if (!req.query['Signature']) {
      res.sendStatus(401);
      return;
    }

    const { id } = req.params;
    const systemRepo = getSystemRepo();
    const binary = await systemRepo.readResource<Binary>('Binary', id);

    try {
      const stream = await getBinaryStorage().readBinary(binary);
      res.status(200).contentType(binary.contentType as string);
      stream.pipe(res);
    } catch (_err) {
      res.sendStatus(404);
    }
  })
);
