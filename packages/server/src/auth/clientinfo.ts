import { asyncWrap } from '../async';
import { badRequest } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';
import { getSystemRepo } from '../fhir/repo';
import { Request, RequestHandler, Response } from 'express';
import { sendOutcome } from '../fhir/outcomes';

export const clientInfoHandler: RequestHandler = asyncWrap(async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const systemRepo = getSystemRepo();

  try {
    const client = await systemRepo.readResource<ClientApplication>('ClientApplication', clientId);
    res.status(200).json({ name: client.signInForm?.welcomeString, logoUrl: client.signInForm?.logo });
  } catch (_err) {
    sendOutcome(res, badRequest('Client not found'));
  }
});
