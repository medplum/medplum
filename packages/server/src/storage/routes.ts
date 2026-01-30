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
import { getShardSystemRepo } from '../fhir/repo';
import { TODO_SHARD_ID } from '../fhir/repo-constants';
import { getBinaryStorage } from './loader';

export const storageRouter = Router();

const pump = promisify(pipeline);

let cachedPublicKey: KeyObject | undefined = undefined;

storageRouter.get('/:id{/:versionId}', async (req: Request, res: Response) => {
  const originalUrl = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
  const signature = originalUrl.searchParams.get('Signature');
  if (!signature) {
    res.sendStatus(401);
    return;
  }

  const expires = req.query['Expires'];
  if (!expires || Math.floor(Date.now() / 1000) > Number.parseInt(expires as string, 10)) {
    res.status(410).send('URL has expired');
    return;
  }

  originalUrl.searchParams.delete('Signature');

  const urlToVerify = originalUrl.toString();

  const verifier = createVerify('sha256');
  verifier.update(urlToVerify);
  const publicKey = getPublicKey();
  const isVerified = verifier.verify(publicKey, signature, 'base64');
  if (!isVerified) {
    res.status(401).send('Invalid signature');
    return;
  }

  const id = singularize(req.params.id) ?? '';
  const systemRepo = getShardSystemRepo(TODO_SHARD_ID); // unauthenticated; how to know which shard to query for the Binary?
  const binary = await systemRepo.readResource<Binary>('Binary', id);

  try {
    const stream = await getBinaryStorage().readBinary(binary);
    res.status(200).contentType(binary.contentType);
    await pump(stream, res);
  } catch {
    res.sendStatus(404);
  }
});

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
