import { Binary } from '@medplum/fhirtypes';
import { createPrivateKey, createPublicKey, createVerify, KeyObject } from 'crypto';
import { Request, Response, Router } from 'express';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { asyncWrap } from '../async';
import { getConfig } from '../config/loader';
import { getSystemRepo } from '../fhir/repo';
import { getBinaryStorage } from './loader';

export const storageRouter = Router();

const pump = promisify(pipeline);

let cachedPublicKey: KeyObject | undefined = undefined;

storageRouter.get(
  '/:id/:versionId?',
  asyncWrap(async (req: Request, res: Response) => {
    const originalUrl = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
    const signature = originalUrl.searchParams.get('Signature');
    if (!signature) {
      res.sendStatus(401);
      return;
    }

    const expires = req.query['Expires'];
    if (!expires || Math.floor(Date.now() / 1000) > parseInt(expires as string, 10)) {
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

    const { id } = req.params;
    const systemRepo = getSystemRepo();
    const binary = await systemRepo.readResource<Binary>('Binary', id);

    try {
      const stream = await getBinaryStorage().readBinary(binary);
      res.status(200).contentType(binary.contentType as string);
      await pump(stream, res);
    } catch (_err) {
      res.sendStatus(404);
    }
  })
);

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
