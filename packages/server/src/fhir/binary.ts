import { assertOk } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import internal from 'stream';
import zlib from 'zlib';
import { asyncWrap } from '../async';
import { Repository } from './repo';
import { getPresignedUrl } from './signer';
import { getBinaryStorage } from './storage';

export const binaryRouter = Router();

// Create a binary
binaryRouter.post(
  '/',
  asyncWrap(async (req: Request, res: Response) => {
    const repo = res.locals.repo as Repository;
    const [outcome, resource] = await repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType: req.get('Content-Type'),
      meta: {
        project: req.query['_project'] as string | undefined,
      },
    });
    assertOk(outcome);
    await getBinaryStorage().writeBinary(resource as Binary, getContentStream(req));
    res.status(201).json({
      ...resource,
      url: getPresignedUrl(resource as Binary),
    });
  })
);

// Update a binary
binaryRouter.put(
  '/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const { id } = req.params;
    const repo = res.locals.repo as Repository;
    const [outcome, resource] = await repo.updateResource<Binary>({
      resourceType: 'Binary',
      id,
      contentType: req.get('Content-Type'),
      meta: {
        project: req.query['_project'] as string | undefined,
      },
    });
    assertOk(outcome);
    await getBinaryStorage().writeBinary(resource as Binary, getContentStream(req));
    res.status(200).json(resource);
  })
);

// Get binary content
binaryRouter.get(
  '/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const { id } = req.params;
    const repo = res.locals.repo as Repository;
    const [outcome, resource] = await repo.readResource('Binary', id);
    assertOk(outcome);

    const binary = resource as Binary;
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
function getContentStream(req: Request): internal.Readable {
  const encoding = (req.headers['content-encoding'] || 'identity').toLowerCase();
  let stream;

  switch (encoding) {
    case 'deflate':
      stream = zlib.createInflate();
      req.pipe(stream);
      break;
    case 'gzip':
      stream = zlib.createGunzip();
      req.pipe(stream);
      break;
    case 'identity':
      stream = req;
      break;
    default:
      throw new Error('encoding.unsupoorted');
  }

  return stream;
}
