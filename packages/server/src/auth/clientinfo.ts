// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { singularize } from '@medplum/core';
import type { Request, RequestHandler, Response } from 'express';
import { getRepoForProject } from '../fhir/accesspolicy';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { getClientApplication } from '../oauth/utils';

/**
 * Returns the sign-in form configuration for a client application.
 *
 * The response is the full `ClientApplication.signInForm` element, which is the set of
 * client-facing settings for the login page.
 *
 * Note that this endpoint is unauthenticated, so everything in `signInForm` is public by
 * construction.  Only add fields to `signInForm` that are safe to disclose to anonymous callers.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export const clientInfoHandler: RequestHandler = async (req: Request, res: Response) => {
  const clientId = singularize(req.params.clientId) ?? '';
  const client = await getClientApplication(clientId);
  let signInForm = client.signInForm ?? {};
  if (client.meta?.project) {
    // `signInForm` is user-supplied, so only sign attachments that the client's own project can read
    using repo = await getRepoForProject(client.meta.project);
    signInForm = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, signInForm);
  }
  res.status(200).json(signInForm);
};
