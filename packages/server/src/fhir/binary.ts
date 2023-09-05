import { badRequest } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import internal from 'stream';
import zlib from 'zlib';
import { asyncWrap } from '../async';
import { sendOutcome } from './outcomes';
import { getPresignedUrl } from './signer';
import { getBinaryStorage } from './storage';
import { getRequestContext } from '../app';

export const binaryRouter = Router();

// Create a binary
binaryRouter.post(
  '/',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getRequestContext();
    const filename = req.query['_filename'] as string | undefined;
    const contentType = req.get('Content-Type');
    const resource = await ctx.repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType,
      meta: {
        project: req.query['_project'] as string | undefined,
      },
    });

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

// Update a binary
binaryRouter.put(
  '/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getRequestContext();
    const { id } = req.params;
    const filename = req.query['_filename'] as string | undefined;
    const contentType = req.get('Content-Type');
    const resource = await ctx.repo.updateResource<Binary>({
      resourceType: 'Binary',
      id,
      contentType,
      meta: {
        project: req.query['_project'] as string | undefined,
      },
    });

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
    const ctx = getRequestContext();
    const { id } = req.params;
    const binary = await ctx.repo.readResource<Binary>('Binary', id);

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
