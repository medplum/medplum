// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, allOk, badRequest, created, isResource } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { Readable } from 'stream';
import zlib from 'zlib';
import { asyncWrap } from '../async';
import { getAuthenticatedContext } from '../context';
import { getLogger } from '../logger';
import { authenticateRequest } from '../oauth/middleware';
import { getBinaryStorage, getPresignedUrl } from '../storage/loader';
import { BinarySource } from '../storage/types';
import { sendOutcome } from './outcomes';
import { Repository } from './repo';
import { sendFhirResponse } from './response';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export const binaryRouter = Router().use(authenticateRequest);

// Create a binary
binaryRouter.post('/', asyncWrap(handleBinaryWriteRequest));

// Update a binary
binaryRouter.put('/:id', asyncWrap(handleBinaryWriteRequest));

// Get binary content
binaryRouter.get(
  '/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { id } = req.params;
    const binary = await ctx.repo.readResource<Binary>('Binary', id);
    await sendFhirResponse(req, res, allOk, binary);
  })
);

async function handleBinaryWriteRequest(req: Request, res: Response): Promise<void> {
  const { repo } = getAuthenticatedContext();
  const create = req.method === 'POST';
  const { id } = req.params;
  const contentType = req.get('Content-Type') as string;

  const stream = getContentStream(req);
  if (!stream) {
    sendOutcome(res, badRequest('Unsupported content encoding'));
    return;
  }

  let binarySource: BinarySource = stream;
  if (contentType === ContentType.FHIR_JSON) {
    const str = await readStreamToString(stream);
    binarySource = str;

    let body: any;
    try {
      // The binary handler does *not* use Express body-parser in order to support raw binary data.
      // Therefore, we need to manually parse the body stream as JSON.
      body = JSON.parse(str);
    } catch (err) {
      // If the JSON is invalid, then it is not eligible for the special case.
      getLogger().debug('Invalid JSON', { error: err });
    }

    if (isResource(body, 'Binary') && (!id || body.id === id)) {
      // Special case where the content is actually a Binary resource.
      // From the spec: https://hl7.org/fhir/R4/binary.html#rest
      //
      // """
      //   When binary data is written to the server (create/update - POST or PUT),
      //   the data is accepted as is and treated as the content of a Binary,
      //   including when the content type is "application/fhir+xml" or "application/fhir+json",
      //   except for the special case where the content is actually a Binary resource.
      // """
      const resource = body as Binary;
      const binary = await (create ? repo.createResource<Binary>(resource) : repo.updateResource<Binary>(resource));
      await sendFhirResponse(req, res, create ? created : allOk, binary);
      return;
    }
  }

  const binary = await uploadBinaryData(repo, binarySource, {
    id,
    contentType,
    filename: req.query['_filename'] as string | undefined,
    securityContext: req.get('X-Security-Context'),
  });

  await sendFhirResponse(req, res, create ? created : allOk, binary);
}

/**
 * Get the content stream of the request.
 *
 * Based on body-parser implementation:
 * https://github.com/expressjs/body-parser/blob/master/lib/read.js
 *
 * Unfortunately body-parser will always write the content to a temporary file on local disk.
 * That is not acceptable for multi gigabyte files, which could easily fill up the disk.
 * @param req - The HTTP request.
 * @returns The content stream.
 */
function getContentStream(req: Request): Readable | undefined {
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

async function readStreamToString(stream: Readable): Promise<string> {
  let data = '';
  // Set the encoding to UTF-8 to ensure each chunk is a string
  stream.setEncoding('utf8');
  for await (const chunk of stream) {
    data += chunk;
  }
  return data;
}

/**
 * Uploads the given data as a Binary resource.
 * @param repo - The repository to use.
 * @param source - The binary source data.
 * @param options - Optional parameters.
 * @param options.id - If present, Binary resource will be updated in place.
 * @param options.contentType - The MIME type of the binary data.
 * @param options.filename - The filename to use for the uploaded data.
 * @param options.securityContext - The security context associated with the data.
 * @returns The updated Binary resource.
 */
export async function uploadBinaryData(
  repo: Repository,
  source: BinarySource,
  options?: { id?: string; contentType?: string; filename?: string; securityContext?: string }
): Promise<Binary> {
  const resource: Binary = {
    resourceType: 'Binary',
    id: options?.id,
    contentType: options?.contentType ?? DEFAULT_CONTENT_TYPE,
    securityContext: options?.securityContext ? { reference: options.securityContext } : undefined,
  };
  const binary = await (options?.id ? repo.updateResource<Binary>(resource) : repo.createResource<Binary>(resource));

  const contentType = options?.contentType ?? DEFAULT_CONTENT_TYPE;
  await getBinaryStorage().writeBinary(binary, options?.filename, contentType, source);

  binary.url = await getPresignedUrl(binary);
  return binary;
}
