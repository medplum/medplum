import { badRequest } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';
import { Request, RequestHandler, Response } from 'express';
import { asyncWrap } from '../async';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';

export const clientInfoHandler: RequestHandler = asyncWrap(async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const systemRepo = getSystemRepo();

  try {
    const client = await systemRepo.readResource<ClientApplication>('ClientApplication', clientId);
    res.status(200).json(
      await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, {
        welcomeString: client.signInForm?.welcomeString,
        logo: client.signInForm?.logo,
      })
    );
  } catch (_err) {
    sendOutcome(res, badRequest('Client not found'));
  }
});
