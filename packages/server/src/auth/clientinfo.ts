import { ClientApplication } from '@medplum/fhirtypes';
import { Request, RequestHandler, Response } from 'express';
import { asyncWrap } from '../async';
import { getSystemRepo } from '../fhir/repo';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';

export const clientInfoHandler: RequestHandler = asyncWrap(async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const systemRepo = getSystemRepo();
  const client = await systemRepo.readResource<ClientApplication>('ClientApplication', clientId);
  res.status(200).json(
    await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, {
      welcomeString: client.signInForm?.welcomeString,
      logo: client.signInForm?.logo,
    })
  );
});
