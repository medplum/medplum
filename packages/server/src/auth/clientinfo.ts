// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Request, RequestHandler, Response } from 'express';
import { asyncWrap } from '../async';
import { getSystemRepo } from '../fhir/repo';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { getClientApplication } from '../oauth/utils';

export const clientInfoHandler: RequestHandler = asyncWrap(async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const systemRepo = getSystemRepo();
  const client = await getClientApplication(clientId);
  res.status(200).json(
    await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, {
      welcomeString: client.signInForm?.welcomeString,
      logo: client.signInForm?.logo,
    })
  );
});
