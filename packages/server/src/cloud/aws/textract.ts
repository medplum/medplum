// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ComprehendMedicalClient, DetectEntitiesV2Command } from '@aws-sdk/client-comprehendmedical';
import type {
  Block,
  GetDocumentAnalysisCommandOutput,
  GetDocumentTextDetectionCommandOutput,
} from '@aws-sdk/client-textract';
import {
  GetDocumentAnalysisCommand,
  GetDocumentTextDetectionCommand,
  StartDocumentAnalysisCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
} from '@aws-sdk/client-textract';
import { ContentType, allOk, badRequest, createReference, getReferenceString, sleep } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, DocumentReference, Media, Reference, Resource } from '@medplum/fhirtypes';
import { Readable } from 'node:stream';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import type { Repository } from '../../fhir/repo';
import { getLogger } from '../../logger';
import { getBinaryStorage } from '../../storage/loader';
import { S3Storage } from './storage';

/** Maximum number of queries per page for asynchronous Textract document analysis. */
const MAX_QUERIES = 30;

export interface AwsTextractQuery {
  text: string;
  alias?: string;
  pages?: string[];
}

export interface AwsTextractOptions {
  comprehend?: boolean;
  queries?: AwsTextractQuery[];
}

export interface AwsTextractQueryAnswer {
  Alias?: string;
  Text?: string;
  Answers: { Text?: string; Confidence?: number }[];
}

type TextractJobOutput = GetDocumentTextDetectionCommandOutput | GetDocumentAnalysisCommandOutput;

export async function awsTextractHandler(req: FhirRequest): Promise<FhirResponse> {
  const { project, repo } = getAuthenticatedContext();
  if (!project.features?.includes('aws-textract')) {
    return [badRequest('AWS Textract not enabled')];
  }

  const storage = getBinaryStorage();
  if (!(storage instanceof S3Storage)) {
    return [badRequest('AWS Textract requires S3 storage')];
  }

  const options = req.body as undefined | AwsTextractOptions;
  const queriesError = validateQueries(options?.queries);
  if (queriesError) {
    return [badRequest(queriesError)];
  }
  const queries = options?.queries;

  const { resourceType, id } = req.params;

  // Validate that the resource type is supported
  if (resourceType !== 'Media' && resourceType !== 'DocumentReference') {
    return [badRequest(`AWS Textract operation is not supported for resource type: ${resourceType}`)];
  }

  let inputBinary: Binary;
  let subject: any;
  let source: Reference<Media | DocumentReference>;

  if (resourceType === 'Media') {
    const inputMedia = await repo.readResource<Media>('Media', id);
    inputBinary = await repo.readReference<Binary>({ reference: inputMedia.content.url });
    subject = inputMedia.subject;
    source = createReference(inputMedia);
  } else {
    // DocumentReference
    const inputDocRef = await repo.readResource<DocumentReference>('DocumentReference', id);
    if (!inputDocRef.content || inputDocRef.content.length === 0) {
      return [badRequest('DocumentReference has no content attachments')];
    }

    const attachment = inputDocRef.content[0].attachment;
    if (!attachment?.url) {
      return [badRequest('DocumentReference attachment has no URL')];
    }

    inputBinary = await repo.readReference<Binary>({ reference: attachment.url });
    subject = inputDocRef.subject;
    source = createReference(inputDocRef);
  }

  // Output files share the input file's securityContext, or else reference the source resource
  const securityContext = inputBinary.securityContext ?? source;

  const { awsRegion } = getConfig();
  const bucket = storage.bucket;
  const key = storage.getKey(inputBinary);

  const textractClient = new TextractClient({ region: awsRegion });
  const documentLocation = { S3Object: { Bucket: bucket, Name: key } };

  let textractResult: (TextractJobOutput & { QueryAnswers?: AwsTextractQueryAnswer[] }) | undefined;
  if (queries) {
    const startResponse = await textractClient.send(
      new StartDocumentAnalysisCommand({
        DocumentLocation: documentLocation,
        FeatureTypes: ['QUERIES'],
        QueriesConfig: {
          Queries: queries.map((q) => ({ Text: q.text, Alias: q.alias, Pages: q.pages })),
        },
      })
    );
    textractResult = await waitForTextractJob((NextToken) =>
      textractClient.send(new GetDocumentAnalysisCommand({ JobId: startResponse.JobId, NextToken }))
    );
    if (textractResult) {
      textractResult.QueryAnswers = getQueryAnswers(textractResult.Blocks ?? []);
    }
  } else {
    const startResponse = await textractClient.send(
      new StartDocumentTextDetectionCommand({ DocumentLocation: documentLocation })
    );
    textractResult = await waitForTextractJob((NextToken) =>
      textractClient.send(new GetDocumentTextDetectionCommand({ JobId: startResponse.JobId, NextToken }))
    );
  }

  const mediaProps: Partial<Media> = {
    subject: subject,
  };

  await createBinaryAndMedia(
    repo,
    JSON.stringify(textractResult, null, 2),
    ContentType.JSON,
    'textract.json',
    mediaProps,
    securityContext
  );

  if (options?.comprehend && textractResult?.Blocks) {
    const lines = textractResult.Blocks.filter((b) => b.BlockType === 'LINE').map((b) => b.Text ?? '');
    const text = lines.join('\n');
    const comprehendMedicalClient = new ComprehendMedicalClient({ region: awsRegion });
    const comprehendResult = await comprehendMedicalClient.send(new DetectEntitiesV2Command({ Text: text }));
    await createBinaryAndMedia(
      repo,
      JSON.stringify(comprehendResult, null, 2),
      ContentType.JSON,
      'comprehend.json',
      mediaProps,
      securityContext
    );
  }

  return [allOk, textractResult as unknown as Resource];
}

/**
 * Polls an asynchronous Textract job until it finishes, then follows NextToken pagination to gather all blocks.
 * @param getPage - Fetches one page of job results.
 * @returns The first result page with all blocks merged into it, or undefined if polling failed or timed out.
 */
async function waitForTextractJob<T extends TextractJobOutput>(
  getPage: (nextToken?: string) => Promise<T>
): Promise<T | undefined> {
  let count = 0;
  let textractResult: T | undefined = undefined;

  try {
    while (!textractResult && count < 120) {
      count++;
      const response = await getPage();
      if (response.JobStatus === 'IN_PROGRESS') {
        await sleep(1000);
        continue;
      }

      // Otherwise, we're done
      textractResult = response;

      // Results may be paginated; follow NextToken to gather all blocks
      let nextToken = response.NextToken;
      while (nextToken) {
        const nextResponse = await getPage(nextToken);
        if (nextResponse.Blocks) {
          (textractResult.Blocks ??= []).push(...nextResponse.Blocks);
        }
        nextToken = nextResponse.NextToken;
      }
      textractResult.NextToken = undefined;
    }
  } catch (err: any) {
    getLogger().error('Error getting Textract results:', err);
  }

  return textractResult;
}

function validateQueries(queries: unknown): string | undefined {
  if (queries === undefined) {
    return undefined;
  }
  if (!Array.isArray(queries) || queries.length === 0) {
    return 'queries must be a non-empty array';
  }
  if (queries.length > MAX_QUERIES) {
    return `queries must contain at most ${MAX_QUERIES} entries`;
  }
  for (const query of queries) {
    if (typeof query?.text !== 'string' || !query.text.trim()) {
      return 'Each query must have a non-empty text string';
    }
    if (query.alias !== undefined && typeof query.alias !== 'string') {
      return 'Query alias must be a string';
    }
    if (
      query.pages !== undefined &&
      (!Array.isArray(query.pages) || !query.pages.every((p: unknown) => typeof p === 'string'))
    ) {
      return 'Query pages must be an array of strings';
    }
  }
  return undefined;
}

/**
 * Pairs each QUERY block with its QUERY_RESULT answer blocks.
 * @param blocks - All blocks from a Textract document analysis result.
 * @returns One entry per QUERY block, with an empty Answers array when Textract found no answer.
 * The API response serializer drops empty arrays, so clients see no Answers in that case.
 */
export function getQueryAnswers(blocks: Block[]): AwsTextractQueryAnswer[] {
  const blocksById = new Map(blocks.map((b) => [b.Id, b]));
  return blocks
    .filter((b) => b.BlockType === 'QUERY')
    .map((queryBlock) => {
      const answerIds = (queryBlock.Relationships ?? []).filter((r) => r.Type === 'ANSWER').flatMap((r) => r.Ids ?? []);
      const answers = answerIds
        .map((answerId) => blocksById.get(answerId))
        .filter((b): b is Block => b?.BlockType === 'QUERY_RESULT')
        .map((b) => ({ Text: b.Text, Confidence: b.Confidence }));
      return { Alias: queryBlock.Query?.Alias, Text: queryBlock.Query?.Text, Answers: answers };
    });
}

async function createBinaryAndMedia(
  repo: Repository,
  content: string,
  contentType: string,
  filename: string,
  mediaProps: Partial<Media>,
  securityContext: Reference
): Promise<Media> {
  const binary = await repo.createResource<Binary>({
    resourceType: 'Binary',
    contentType,
    securityContext,
  });

  await getBinaryStorage().writeBinary(binary, filename, contentType, Readable.from(content));

  const media = await repo.createResource({
    resourceType: 'Media',
    status: 'completed',
    content: {
      contentType,
      url: getReferenceString(binary),
    },
    ...mediaProps,
  });

  return media;
}
