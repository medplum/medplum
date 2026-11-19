// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, allOk, badRequest, created, isResource, singularize } from '@medplum/core';
import type { Binary } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { getAuthenticatedContext } from '../context';
import { getLogger } from '../logger';
import { authenticateRequest } from '../oauth/middleware';
import { getPresignedUrl } from '../storage/loader';
import type { BinarySource } from '../storage/types';
import { writeBinaryContent } from './binary-content';
import { sendOutcome } from './outcomes';
import { sendFhirResponse } from './response';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export const binaryRouter = Router().use(authenticateRequest);

// Create a binary
binaryRouter.post('/', handleBinaryWriteRequest);

// Update a binary
binaryRouter.put('/:id', handleBinaryWriteRequest);

// Get binary content
binaryRouter.get('/:id', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const id = singularize(req.params.id) ?? '';
  const binary = await ctx.repo.readResource<Binary>('Binary', id);
  await sendFhirResponse(req, res, allOk, binary);
});

async function handleBinaryWriteRequest(req: Request, res: Response): Promise<void> {
  const { repo } = getAuthenticatedContext();
  const create = req.method === 'POST';
  const id = singularize(req.params.id);
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
      const binary = await (create ? repo.createResource(resource) : repo.updateResource(resource));
      await sendFhirResponse(req, res, create ? created : allOk, binary);
      return;
    }
  }

  const securityContext = req.get('X-Security-Context');
  const fields = {
    contentType: contentType ?? DEFAULT_CONTENT_TYPE,
    securityContext: securityContext ? { reference: securityContext } : undefined,
  };
  const filename = req.query['_filename'] as string | undefined;
  const binary = await writeBinaryContent(
    repo,
    id
      ? { kind: 'replace', id, fields, source: binarySource, filename }
      : { kind: 'create', fields, source: binarySource, filename }
  );
  binary.url = await getPresignedUrl(binary);

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
