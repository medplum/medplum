// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { singularize } from '@medplum/core';
import type { Binary } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { KeyObject } from 'node:crypto';
import { createPrivateKey, createPublicKey, createVerify } from 'node:crypto';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { getConfig } from '../config/loader';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { getBinaryStorage } from './loader';

export const storageRouter = Router();

const pump = promisify(pipeline);

let cachedPublicKey: KeyObject | undefined = undefined;

storageRouter.get('/:id{/:versionId}', async (req: Request, res: Response) => {
  const binary = await verifyAndLoadBinary(req, res, 'GET');
  if (!binary) {
    return;
  }

  try {
    const stream = await getBinaryStorage().readBinary(binary);
    res.status(200).contentType(binary.contentType);
    await pump(stream, res);
  } catch {
    res.sendStatus(404);
  }
});

storageRouter.put('/:id{/:versionId}', async (req: Request, res: Response) => {
  const binary = await verifyAndLoadBinary(req, res, 'PUT');
  if (!binary) {
    return;
  }

  const contentType = req.headers['content-type'];
  if (contentType && contentType !== binary.contentType) {
    res.status(400).send('Content-Type mismatch');
    return;
  }

  try {
    await getBinaryStorage().writeBinary(binary, undefined, contentType, req);
    res.sendStatus(200);
  } catch {
    res.sendStatus(400);
  }
});

async function verifyAndLoadBinary(req: Request, res: Response, method: 'GET' | 'PUT'): Promise<Binary | undefined> {
  const originalUrl = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
  const signature = originalUrl.searchParams.get('Signature');
  if (!signature) {
    res.sendStatus(401);
    return undefined;
  }

  const expires = req.query['Expires'];
  if (!expires || Math.floor(Date.now() / 1000) > Number.parseInt(expires as string, 10)) {
    res.status(410).send('URL has expired');
    return undefined;
  }

  originalUrl.searchParams.delete('Signature');
  const urlToVerify = originalUrl.toString();
  const publicKey = getPublicKey();

  let isVerified = createVerify('sha256')
    .update(method + ' ')
    .update(urlToVerify)
    .verify(publicKey, signature, 'base64');
  if (!isVerified && method === 'GET') {
    // Try legacy format without HTTP method
    isVerified = createVerify('sha256').update(urlToVerify).verify(publicKey, signature, 'base64');
  }
  if (!isVerified) {
    res.status(401).send('Invalid signature');
    return undefined;
  }

  const id = singularize(req.params.id) ?? '';
  const projectId = originalUrl.searchParams.get('Project');
  const systemRepo = projectId ? await getProjectSystemRepo(projectId) : getGlobalSystemRepo();
  return systemRepo.readResource<Binary>('Binary', id);
}

function getPublicKey(): KeyObject {
  cachedPublicKey ??= buildPublicKey();
  return cachedPublicKey;
}

function buildPublicKey(): KeyObject {
  const config = getConfig();
  const signingKey = config.signingKey;
  const passphrase = config.signingKeyPassphrase;
  if (!signingKey || !passphrase) {
    throw new Error('Signing key or passphrase is not configured');
  }
  return createPublicKey(
    createPrivateKey({
      key: signingKey,
      format: 'pem',
      passphrase: passphrase,
    })
  );
}
