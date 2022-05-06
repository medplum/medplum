import { assertOk, badRequest } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { json, Request, Response, Router } from 'express';
import internal from 'stream';
import zlib from 'zlib';
import { asyncWrap } from '../async';
import { createPdf } from '../util/pdf';
import { sendOutcome } from './outcomes';
import { Repository } from './repo';
import { getPresignedUrl } from './signer';
import { getBinaryStorage } from './storage';

export const binaryRouter = Router();

// Create a binary
binaryRouter.post(
  '/',
  asyncWrap(async (req: Request, res: Response) => {
    const filename = req.query['_filename'] as string | undefined;
    const contentType = req.get('Content-Type');
    const repo = res.locals.repo as Repository;
    const [outcome, resource] = await repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType,
      meta: {
        project: req.query['_project'] as string | undefined,
      },
    });
    assertOk(outcome, resource);

    const stream = getContentStream(req);
    if (!stream) {
      sendOutcome(res, badRequest('Unsupported content encoding'));
      return;
    }

    try {
      await getBinaryStorage().writeBinary(resource, filename, contentType, stream);
      res.status(201).json({
        ...resource,
        url: getPresignedUrl(resource),
      });
    } catch (err) {
      sendOutcome(res, badRequest(err as string));
    }
  })
);

// Create a binary by PDF Document Definition
binaryRouter.post(
  '/([$]|%24)pdf',
  json(),
  asyncWrap(async (req: Request, res: Response) => {
    if (!req.is('application/json')) {
      sendOutcome(res, badRequest('Unsupported content type'));
      return;
    }

    const filename = req.query['_filename'] as string | undefined;
    const repo = res.locals.repo as Repository;

    try {
      const binary = await createPdf(repo, filename, req.body);
      res.status(201).json({
        ...binary,
        url: getPresignedUrl(binary),
      });
    } catch (err) {
      sendOutcome(res, badRequest((err as Error).message));
    }
  })
);

// Update a binary
binaryRouter.put(
  '/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const { id } = req.params;
    const filename = req.query['_filename'] as string | undefined;
    const contentType = req.get('Content-Type');
    const repo = res.locals.repo as Repository;
    const [outcome, resource] = await repo.updateResource<Binary>({
      resourceType: 'Binary',
      id,
      contentType,
      meta: {
        project: req.query['_project'] as string | undefined,
      },
    });
    assertOk(outcome, resource);

    const stream = getContentStream(req);
    if (!stream) {
      sendOutcome(res, badRequest('Unsupported content encoding'));
      return;
    }

    await getBinaryStorage().writeBinary(resource, filename, contentType, stream);
    res.status(200).json(resource);
  })
);

// Get binary content
binaryRouter.get(
  '/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const { id } = req.params;
    const repo = res.locals.repo as Repository;
    const [outcome, binary] = await repo.readResource<Binary>('Binary', id);
    assertOk(outcome, binary);

    res.status(200).contentType(binary.contentType as string);

    const stream = await getBinaryStorage().readBinary(binary);
    stream.pipe(res);
  })
);

/**
 * Get the content stream of the request.
 *
 * Based on body-parser implementation:
 * https://github.com/expressjs/body-parser/blob/master/lib/read.js
 *
 * Unfortunately body-parser will always write the content to a temporary file on local disk.
 * That is not acceptable for multi gigabyte files, which could easily fill up the disk.
 *
 * @param req The HTTP request.
 * @returns The content stream.
 */
function getContentStream(req: Request): internal.Readable | undefined {
  const encoding = req.headers['content-encoding'];
  if (!encoding) {
    return req;
  }

  if (encoding.toLowerCase() === 'deflate') {
    const stream = zlib.createInflate();
    req.pipe(stream);
    return stream;
  }

  if (encoding.toLowerCase() === 'gzip') {
    const stream = zlib.createGunzip();
    req.pipe(stream);
    return stream;
  }

  return undefined;
}
